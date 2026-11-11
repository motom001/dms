/**
 * Auskunft nach Art. 15 DSGVO als ZIP (#396).
 *
 *   Auskunft-<Name>-<Datum>/
 *     Deckblatt.pdf      Pflichtangaben (Kategorien, Zwecke, Herkunft, Empfänger, Speicherdauer, Rechte)
 *     Uebersicht.html    alle Mappen mit Feldern, Links auf die Dokumente – im Browser zu öffnen
 *     Uebersicht.csv     dasselbe als Tabelle
 *     ablage/…           Dokumente im Original, Ordner je Mappe (mit mappe.json und mappe.pdf)
 *     daten/…, struktur/…, manifest.json, LIESMICH.md   maschinenlesbar im Format des Vollexports (#254)
 *
 * Die Daten stellt der Dienst zusammen (`auskunftDaten`): nur ausdrücklich Ausgewähltes, ohne
 * Passwortfelder und verschlüsselte Werte, ohne ältere Versionen. Die ZIP liegt höchstens
 * AUSKUNFT_TAGE Tage bereit und wird nach dem Herunterladen gelöscht. Optional AES-256 (zip.ts).
 */
import { randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { oeffneStrom } from './dateispeicher';
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { textDritte } from '../../shared/src/anrede';
import { datumText } from '../../shared/src/archiv';
import { AUSKUNFT_TAGE, auskunftDateiname, erwaehnungText, type AuskunftErwaehnung, type AuskunftStand, type Datenschutz } from '../../shared/src/auskunft';
import { formatiere, istLeer, type Mappe, type Mappentyp } from '../../shared/src/model';
import { Fachfehler } from './fehler';
import { planer, textdokumentPdf } from './pdf';
import { istUuid } from './repo';
import { csv, exportDateien, vollexport, type ExportQuelle } from './vollexport';
import { ZIP_MAX, zipGroesse, zipStrom, type ZipEintrag } from './zip';
import { zeitzone } from '../../shared/src/region';
import { mitSprache, t } from './sprache';
import { gebietsschema, sprache } from '../../shared/src/sprache';
import { KB, MB } from './grenzen';

export interface AuskunftDaten {
  start: { id: string; titel: string; typ: string };
  datenschutz: Datenschutz;
  quelle: ExportQuelle;
  /** Ausgewählte Mappen, schon ohne Passwortfelder. */
  mappen: Mappe[];
  /** Ihre Mappentypen, ohne Passwortfelder und Berechtigungen. */
  typen: Mappentyp[];
  /** Titel von Mappen, auf die verwiesen wird (und von Benutzern), für lesbare Werte. */
  titel: Record<string, string>;
  /** Post (#192): Anzahl je Kanal – Herkunft der Daten. */
  kanaele: Record<string, number>;
  passwort: string | null;
  /** Bezug-Mappen (#472), die nur als Erwähnung hinausgehen: Art, Titel und Feld – ohne Dokumente, Notizen, übrige Werte. */
  erwaehnungen: AuskunftErwaehnung[];
  anzahl: { mappen: number; dokumente: number; bytes: number; notizen: number; historie: number; ohneNotizen: number; erwaehnungen: number };
  /** Begründungen abgewählter Notizen (nur für den Nachweis, nicht in der ZIP). */
  gruende: string[];
  empfaenger: string;
  anmerkung: string;
  /** Speicherdauer je Mappentyp: Archivmodus (#212) und spätestes „aufbewahren bis“. */
  /** offen (#1051): Bei mindestens einer Mappe läuft die Frist noch nicht (Stichtag leer). */
  aufbewahrung: Array<{ typ: string; archiv: { jahre: number; stichtag: string | null } | null; bis: string | null; offen?: boolean }>;
}

/** Phasen des Auftrags. */
export const AUSKUNFT_PHASEN = [
  { key: 'mappen', name: t('meldungen.auskunft.mappen-und-dokumente-zusammenstellen'), einheit: 'Mappen' },
  { key: 'abschluss', name: t('meldungen.auskunft.listen-und-pruefwerte-schreiben'), einheit: 'Schritte' },
  { key: 'zip', name: t('meldungen.auskunft.zip-datei-packen'), einheit: 'Dateien' },
];

/** Wo die Auskünfte liegen: im Export-Ordner (#797) unter auskunft/, ohne ihn im temporären Ordner. */
export const auskunftOrdner = (exportOrdner?: string | null) => (exportOrdner ? join(exportOrdner, 'auskunft') : join(tmpdir(), 'dms-auskunft'));

const zeit = (d: Date) => d.toLocaleString(gebietsschema(), { timeZone: zeitzone(), dateStyle: 'long', timeStyle: 'short' });
const tag = (d: Date) => new Intl.DateTimeFormat('sv-SE', { timeZone: zeitzone() }).format(d);
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
/** Umfang als ganzer Satzteil aus der Sprachdatei (#729): „3 Einträge“, „1 Dokument“. */
const eintraege = (anzahl: number) => t('meldungen.auskunft.eintraege', { anzahl });
const dokumenteText = (anzahl: number) => t('meldungen.auskunft.dokumente', { anzahl });
/** Text aus der Sprachdatei als HTML: der Text wird maskiert, die Werte (schon HTML) danach eingesetzt. */
function htmlText(k: string, werte: Record<string, string> = {}): string {
  const namen = Object.keys(werte);
  let s = esc(t.frei(k, Object.fromEntries(namen.map((n, i) => [n, `\u0001${i}\u0001`]))));
  namen.forEach((n, i) => { s = s.split(`\u0001${i}\u0001`).join(werte[n]); });
  return s;
}

/** Felder einer Mappe als lesbare Paare (ohne leere). */
function felderVon(m: Mappe, t: Mappentyp | undefined, titel: Record<string, string>): Array<[string, string]> {
  return (t?.felder ?? []).filter((f) => f.typ !== 'passwort' && !istLeer(m.werte[f.key]))
    .map((f) => [f.label, formatiere(f, m.werte[f.key], (id) => titel[id] ?? '')] as [string, string]);
}

/* ---------- Deckblatt ---------- */

async function deckblattRoh(d: AuskunftDaten, x: { von: string; jetzt: Date; mandant: string }): Promise<Buffer> {
  // Plan des Textdokuments; gezeichnet wird in der PDF-Stelle (#541).
  const s = planer();
  // Anrede der Person (#474): alle Sätze an sie aus anrede.ts.
  const eintrag = (k: Parameters<typeof textDritte>[1], w?: Record<string, string | number>) => textDritte(d.datenschutz.anrede, k, w);
  s.neueSeite();
  const absender = d.datenschutz.verantwortlicher || x.mandant;
  if (absender) s.text(absender, { groesse: 9, farbe: 0.35 });
  s.text(t('meldungen.auskunft.auskunft-nach-art-15'), { groesse: 18, fett: true, abstand: 14 });
  const titel = d.start.titel || t('meldungen.auskunft.ohne-titel');
  s.text(d.start.typ ? t('meldungen.auskunft.fuer-typ', { titel, typ: d.start.typ }) : t('meldungen.auskunft.fuer', { titel }), { groesse: 12, abstand: 2 });
  s.text(x.von ? t('meldungen.auskunft.erstellt-am-von', { zeit: zeit(x.jetzt), von: x.von }) : t('meldungen.auskunft.erstellt-am', { zeit: zeit(x.jetzt) }), { groesse: 9, farbe: 0.4, abstand: 2 });
  s.linie();
  s.text(eintrag('auskunft.deckblatt.einleitung'), { groesse: 10, abstand: 4 });

  const abschnitt = (x: string) => s.text(x, { groesse: 12, fett: true, abstand: 12 });
  const punkt = (x: string) => s.text(`• ${x}`, { groesse: 10, abstand: 2, x: 60 });
  const n = d.anzahl;

  abschnitt(t('meldungen.auskunft.1-welche-daten-kategorien'));
  const jeTyp = new Map<string, number>();
  for (const m of d.mappen) jeTyp.set(m.typId, (jeTyp.get(m.typId) ?? 0) + 1);
  for (const ty of d.typen) {
    const felder = ty.felder.filter((fd) => d.mappen.some((m) => m.typId === ty.id && !istLeer(m.werte[fd.key]))).map((fd) => fd.label);
    const anzahl = eintraege(jeTyp.get(ty.id) ?? 0);
    punkt(felder.length ? t('meldungen.auskunft.typ-felder', { typ: ty.name, anzahl, felder: `${felder.slice(0, 12).join(', ')}${felder.length > 12 ? ' …' : ''}` }) : t('meldungen.auskunft.typ', { typ: ty.name, anzahl }));
  }
  // Ganze Satzteile je Angabe (#729), verbunden als Aufzählung der Sprache.
  punkt(new Intl.ListFormat(gebietsschema(), { type: 'unit' }).format([
    t('meldungen.auskunft.umfang.dokumente', { anzahl: n.dokumente }),
    ...(n.notizen ? [t('meldungen.auskunft.umfang.notizen', { anzahl: n.notizen })] : []),
    ...(n.historie ? [t('meldungen.auskunft.umfang.historie', { anzahl: n.historie })] : []),
  ]));
  if (d.erwaehnungen.length) {
    punkt(eintrag('auskunft.deckblatt.erwaehnungen', { anzahl: d.erwaehnungen.length }));
    for (const e of d.erwaehnungen.slice(0, 15)) s.text(`– ${erwaehnungText(e)}`, { groesse: 10, abstand: 1, x: 72 });
    if (d.erwaehnungen.length > 15) s.text(t('meldungen.auskunft.vollstaendig-in-uebersicht-html'), { groesse: 10, abstand: 1, x: 72 });
  }

  abschnitt(t('meldungen.auskunft.2-zwecke-der-verarbeitung'));
  const zwecke = d.typen.map((ty) => [ty.name, d.datenschutz.typen[ty.id]?.zweck ?? ''] as const);
  for (const [name, zweck] of zwecke) punkt(`${name}: ${zweck || t('meldungen.auskunft.kein-zweck-hinterlegt')}`);

  abschnitt(t('meldungen.auskunft.3-herkunft-der-daten'));
  const k = Object.entries(d.kanaele);
  if (k.length) punkt(t('meldungen.auskunft.post-und-schriftverkehr', { map: k.map(([kanal, z]) => `${kanal} (${z})`).join(', ') }));
  punkt(eintrag(k.length ? 'auskunft.deckblatt.herkunft.uebrige' : 'auskunft.deckblatt.herkunft.alle'));

  abschnitt(t('meldungen.auskunft.4-empfaenger'));
  s.text(d.empfaenger || t('meldungen.auskunft.keine-empfaenger-ausserhalb-unseres'), { groesse: 10, abstand: 2 });

  abschnitt(t('meldungen.auskunft.5-speicherdauer'));
  for (const a of d.aufbewahrung) {
    const w = a.archiv ? { typ: a.typ, anzahl: a.archiv.jahre, ab: a.archiv.stichtag ?? t('meldungen.auskunft.anlage'), bis: a.bis ? datumText(a.bis) : '' } : null;
    punkt(!w ? t('meldungen.auskunft.speicher.ohne', { typ: a.typ }) : a.offen ? t('meldungen.auskunft.speicher.archiv-offen', w) : a.bis ? t('meldungen.auskunft.speicher.archiv-bis', w) : t('meldungen.auskunft.speicher.archiv', w));
  }

  abschnitt(eintrag('auskunft.deckblatt.rechte'));
  s.text(d.datenschutz.rechte, { groesse: 10, abstand: 2 });

  if (d.anmerkung) { abschnitt(t('meldungen.auskunft.anmerkung')); s.text(d.anmerkung, { groesse: 10, abstand: 2 }); }

  abschnitt(t('meldungen.auskunft.inhalt-dieser-datei'));
  punkt(t('meldungen.auskunft.uebersicht-html-alle-eintraege'));
  punkt(t('meldungen.auskunft.uebersicht-csv-dasselbe-als'));
  punkt(t('meldungen.auskunft.ablage-je-eintrag-ein'));
  punkt(t('meldungen.auskunft.daten-struktur-manifest-json'));
  return textdokumentPdf({ titel: t('meldungen.auskunft.auskunft-nach-art-15-2', { titel: d.start.titel }), anweisungen: s.anweisungen });
}

/* ---------- Übersicht ---------- */

function uebersichtCsvRoh(d: AuskunftDaten, pfade: Map<string, string>): Buffer {
  const typ = new Map(d.typen.map((t) => [t.id, t] as const));
  const zeilen = d.mappen.map((m) => {
    const t = typ.get(m.typId);
    return [t?.name ?? '', m.titel ?? '', felderVon(m, t, d.titel).map(([k, v]) => `${k}: ${v}`).join('; '), m.erstellt.slice(0, 10), m.geaendert.slice(0, 10), pfade.get(m.id) ?? '', m.id];
  });
  // Erwähnungen (#472): nur Art, Titel und das Feld, über das die Person genannt ist.
  for (const e of d.erwaehnungen) zeilen.push([e.typ, e.titel, erwaehnungText(e), '', '', '', e.mappeId]);
  return csv(t('meldungen.auskunft.csv.kopf').split('|'), zeilen);
}

function uebersichtHtmlRoh(d: AuskunftDaten, x: { jetzt: Date; dokumente: Array<{ id: string; mappeId: string; name: string; groesse: number }>; pfade: { mappen: Map<string, string>; dokumente: Map<string, string> } }): Buffer {
  const typ = new Map(d.typen.map((t) => [t.id, t] as const));
  const doks = new Map<string, typeof x.dokumente>();
  for (const dk of x.dokumente) doks.set(dk.mappeId, [...doks.get(dk.mappeId) ?? [], dk]);
  const link = (p: string) => p.split('/').map(encodeURIComponent).join('/');
  const kb = (b: number) => (b < MB ? `${Math.max(1, Math.round(b / KB)).toLocaleString(gebietsschema())} KB` : `${(b / MB).toLocaleString(gebietsschema(), { minimumFractionDigits: 1, maximumFractionDigits: 1 })} MB`);
  const abschnitte = d.typen.map((mappentyp) => {
    const ms = d.mappen.filter((m) => m.typId === mappentyp.id);
    return `<h2>${esc(mappentyp.name)} <small>(${ms.length})</small></h2>\n${ms.map((m) => {
      const f = felderVon(m, typ.get(m.typId), d.titel);
      const ds = doks.get(m.id) ?? [];
      const ordner = x.pfade.mappen.get(m.id);
      return `<section><h3>${esc(m.titel || t('meldungen.auskunft.ohne-titel'))}</h3>
<dl>${f.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}<dt>${htmlText('meldungen.auskunft.html.angelegt')}</dt><dd>${esc(new Date(m.erstellt).toLocaleDateString(gebietsschema()))}</dd></dl>
${ds.length ? `<ul>${ds.map((dk) => { const p = x.pfade.dokumente.get(dk.id); return `<li>${p ? `<a href="${esc(link(p))}">${esc(dk.name)}</a>` : esc(dk.name)} <small>${kb(dk.groesse)}</small></li>`; }).join('')}</ul>` : ''}
${ordner ? `<p><small>${htmlText('meldungen.auskunft.html.ordner', { ordner: `<a href="${esc(link(ordner))}/">${esc(ordner)}</a>` })}</small></p>` : ''}</section>`;
    }).join('\n')}`;
  }).join('\n');
  const erwaehnt = d.erwaehnungen.length ? `<h2>${esc(textDritte(d.datenschutz.anrede, 'auskunft.uebersicht.genannt'))} <small>(${d.erwaehnungen.length})</small></h2>
<p><small>${esc(textDritte(d.datenschutz.anrede, 'auskunft.uebersicht.genannt.hinweis'))}</small></p>
<ul>${d.erwaehnungen.map((e) => `<li>${esc(erwaehnungText(e))}</li>`).join('')}</ul>` : '';
  return Buffer.from(`<!doctype html>
<html lang="${esc(sprache())}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${htmlText('meldungen.auskunft.html.titel', { titel: esc(d.start.titel) })}</title>
<style>
body{font:15px/1.5 system-ui,sans-serif;max-width:60rem;margin:2rem auto;padding:0 1rem;color:#1d2330;background:#fff}
h1{font-size:1.5rem;margin:0}h2{font-size:1.2rem;margin-top:2rem;border-bottom:1px solid #d6dbe3}h3{font-size:1rem;margin:1rem 0 .3rem}
small{color:#5d6675}section{border:1px solid #e3e7ee;border-radius:6px;padding:.4rem 1rem;margin:.6rem 0}
dl{display:grid;grid-template-columns:minmax(8rem,14rem) 1fr;gap:.2rem 1rem;margin:.3rem 0}dt{color:#5d6675}dd{margin:0;white-space:pre-wrap;overflow-wrap:anywhere}
@media (max-width:40rem){dl{grid-template-columns:1fr}dd{margin-bottom:.3rem}}
</style></head><body>
<h1>${htmlText('meldungen.auskunft.auskunft-nach-art-15')}</h1>
<p>${htmlText(d.start.typ ? 'meldungen.auskunft.html.fuer-typ' : 'meldungen.auskunft.html.fuer', { titel: `<strong>${esc(d.start.titel || t('meldungen.auskunft.ohne-titel'))}</strong>`, typ: esc(d.start.typ ?? ''), zeit: esc(zeit(x.jetzt)) })}<br>
<small>${htmlText('meldungen.auskunft.html.umfang', { eintraege: esc(eintraege(d.anzahl.mappen)), dokumente: esc(dokumenteText(d.anzahl.dokumente)) })}</small></p>
${abschnitte}
${erwaehnt}
</body></html>
`, 'utf8');
}

function liesmichTextRoh(d: AuskunftDaten, jetzt: Date): string {
  return t('meldungen.auskunft.liesmich', {
    titel: d.start.titel || t('meldungen.auskunft.ohne-titel'), zeit: zeit(jetzt), eintraege: eintraege(d.anzahl.mappen), dokumente: dokumenteText(d.anzahl.dokumente),
    deckblatt: textDritte(d.datenschutz.anrede, 'auskunft.liesmich.deckblatt'), uebersicht: textDritte(d.datenschutz.anrede, 'auskunft.liesmich.uebersicht'),
  });
}

/*
 * Sprache (#729): Die Auskunft geht an eine Person außerhalb von Ablago – Deckblatt, Übersicht, Liesmich und Tabellen
 * stehen in der Sprache der Installation, nicht in der des Administrators, der sie erstellt.
 */
export const deckblatt = (...a: Parameters<typeof deckblattRoh>) => mitSprache(undefined, () => deckblattRoh(...a));
export const uebersichtCsv = (...a: Parameters<typeof uebersichtCsvRoh>) => mitSprache(undefined, () => uebersichtCsvRoh(...a));
export const uebersichtHtml = (...a: Parameters<typeof uebersichtHtmlRoh>) => mitSprache(undefined, () => uebersichtHtmlRoh(...a));
export const liesmichText = (...a: Parameters<typeof liesmichTextRoh>) => mitSprache(undefined, () => liesmichTextRoh(...a));

/* ---------- Erzeugen ---------- */

const zuGross = () => new Fachfehler(422, t('meldungen.auskunft.die-auskunft-waere-groesser'));

export interface AuskunftErgebnis extends AuskunftStand { name: string }

/**
 * Schreibt die ZIP nach `ordner/<id>.zip` und die Angaben nach `ordner/<id>.json`.
 * Zwischendateien liegen in `ordner/<id>.tmp/` und werden danach gelöscht.
 */
export async function erzeugeAuskunft(d: AuskunftDaten, ordner: string, x: { von: { id: string; name: string; email: string }; mandant: string },
  fortschritt: (fertig: number, gesamt: number, phase?: string) => void = () => {}, jetzt = new Date()): Promise<AuskunftErgebnis> {
  const id = randomUUID();
  const arbeit = join(ordner, `${id}.tmp`);
  await mkdir(arbeit, { recursive: true });
  try {
    const r = await vollexport(d.quelle, arbeit, { passwoerter: false, liesmich: liesmichText(d, jetzt), zweck: 'auskunft-art-15' }, fortschritt, jetzt);
    const name = auskunftDateiname(d.start.titel, tag(jetzt));
    const dokListe = (await d.quelle.dokumente(d.mappen.map((m) => m.id)));
    const zusatz: Array<{ name: string; daten: Buffer }> = [
      { name: 'Deckblatt.pdf', daten: await deckblatt(d, { von: x.von.name || x.von.email, jetzt, mandant: d.quelle.mandant }) },
      { name: 'Uebersicht.html', daten: uebersichtHtml(d, { jetzt, dokumente: dokListe, pfade: r.pfade }) },
      { name: 'Uebersicht.csv', daten: uebersichtCsv(d, r.pfade.mappen) },
    ];
    const dateien = await exportDateien(r.ordner);
    const eintraege: ZipEintrag[] = [
      ...zusatz.map((z) => ({ name: `${name}/${z.name}`, groesse: z.daten.length, inhalt: async () => z.daten })),
      ...dateien.map((f) => ({ name: `${name}/${f.name}`, groesse: f.groesse, inhalt: () => oeffneStrom(f.pfad) })),
    ];
    let fertig = 0;
    const gezaehlt = eintraege.map((e) => ({ ...e, inhalt: async () => { fortschritt(++fertig, eintraege.length, 'zip'); return e.inhalt(); } }));
    const zipDatei = join(ordner, `${id}.zip`);
    let groesse: number;
    if (!d.passwort) {
      groesse = zipGroesse(eintraege);
      if (groesse > ZIP_MAX) throw zuGross();
      await pipeline(zipStrom(gezaehlt, jetzt), createWriteStream(zipDatei));
    } else {
      // Verschlüsselt: Dateinamen stehen in einer ZIP immer im Klartext. Deshalb liegt die eigentliche
      // Auskunft als „Auskunft.zip“ in einer AES-verschlüsselten ZIP – außen sind keine Namen zu sehen.
      const innen = join(arbeit, 'Auskunft.zip');
      const innenGroesse = zipGroesse(eintraege);
      if (innenGroesse > ZIP_MAX) throw zuGross();
      await pipeline(zipStrom(gezaehlt, jetzt), createWriteStream(innen));
      const aussen: ZipEintrag[] = [{ name: 'Auskunft.zip', groesse: innenGroesse, inhalt: () => oeffneStrom(innen) }];
      groesse = zipGroesse(aussen, true);
      await pipeline(zipStrom(aussen, jetzt, d.passwort), createWriteStream(zipDatei));
    }
    const bis = new Date(jetzt.getTime() + AUSKUNFT_TAGE * 24 * 3600 * 1000).toISOString();
    const stand: AuskunftErgebnis = {
      id, name: d.passwort ? `Auskunft-${tag(jetzt)}` : name, mappeId: d.start.id, titel: d.start.titel, erstellt: jetzt.toISOString(), bis, bytes: groesse,
      mappen: d.anzahl.mappen, dokumente: d.anzahl.dokumente, verschluesselt: !!d.passwort, von: x.von.name || x.von.email, vonId: x.von.id, bisOhneLink: bis,
    };
    await writeFile(join(ordner, `${id}.json`), JSON.stringify(stand, null, 2));
    return stand;
  } finally {
    await rm(arbeit, { recursive: true, force: true });
  }
}

/* ---------- Verwaltung ---------- */

/** Bereitliegende Auskünfte, neueste zuerst; Abgelaufenes (und Reste abgebrochener Läufe) wird dabei gelöscht. */
export async function auskuenfteIn(ordner: string, jetzt = new Date()): Promise<AuskunftErgebnis[]> {
  let namen: string[];
  try { namen = await readdir(ordner); } catch { return []; }
  const erg: AuskunftErgebnis[] = [];
  for (const n of namen) {
    const m = /^([0-9a-f-]{36})\.(json|zip|tmp)$/.exec(n);
    if (!m) continue;
    const [, id, art] = m;
    if (art === 'tmp') {
      // Reste nach einem Neustart mitten im Erzeugen: nach einem Tag weg.
      const s = await stat(join(ordner, n)).catch(() => null);
      if (s && jetzt.getTime() - s.mtimeMs > 24 * 3600 * 1000) await rm(join(ordner, n), { recursive: true, force: true });
      continue;
    }
    if (art === 'zip') { if (!namen.includes(`${id}.json`)) await rm(join(ordner, n), { force: true }); continue; }
    try {
      const s = JSON.parse(await readFile(join(ordner, n), 'utf8')) as AuskunftErgebnis;
      if (new Date(s.bis).getTime() <= jetzt.getTime() || !namen.includes(`${id}.zip`)) { await loescheAuskunft(ordner, id); continue; }
      erg.push(s);
    } catch { await loescheAuskunft(ordner, id); }
  }
  return erg.sort((a, b) => b.erstellt.localeCompare(a.erstellt));
}

export async function loescheAuskunft(ordner: string, id: string) {
  if (!istUuid(id)) throw new Fachfehler(404, t('meldungen.auskunft.diese-auskunft-gibt-es'));
  await rm(join(ordner, `${id}.zip`), { force: true });
  await rm(join(ordner, `${id}.json`), { force: true });
}

/**
 * Bereithalten bis (#455): Ein Abruf-Link hält die ZIP bis zu seinem Ablauf; ohne Link gilt wieder das
 * ursprüngliche Ende (Erstellung + AUSKUNFT_TAGE). Liegt das schon zurück, ist sie gleich weg.
 */
export async function haltenBis(ordner: string, id: string, bis: string | null, jetzt = new Date()): Promise<AuskunftErgebnis | null> {
  if (!istUuid(id)) return null;
  const datei = join(ordner, `${id}.json`);
  let s: AuskunftErgebnis;
  try { s = JSON.parse(await readFile(datei, 'utf8')) as AuskunftErgebnis; } catch { return null; }
  const ohne = s.bisOhneLink ?? new Date(new Date(s.erstellt).getTime() + AUSKUNFT_TAGE * 24 * 3600 * 1000).toISOString();
  const neu = bis && bis > ohne ? bis : ohne;
  const n: AuskunftErgebnis = { ...s, bisOhneLink: ohne, bis: neu };
  if (new Date(neu).getTime() <= jetzt.getTime()) { await loescheAuskunft(ordner, id); return null; }
  await writeFile(datei, JSON.stringify(n, null, 2));
  return n;
}

/** Eine bereitliegende Auskunft zum Herunterladen; 404, wenn sie abgelaufen oder schon heruntergeladen ist. */
export async function auskunftDatei(ordner: string, id: string): Promise<{ stand: AuskunftErgebnis; pfad: string; groesse: number }> {
  if (!istUuid(id)) throw new Fachfehler(404, t('meldungen.auskunft.diese-auskunft-gibt-es'));
  const stand = (await auskuenfteIn(ordner)).find((s) => s.id === id);
  if (!stand) throw new Fachfehler(404, t('meldungen.auskunft.diese-auskunft-gibt-es-2', { AUSKUNFT_TAGE }));
  const pfad = join(ordner, `${id}.zip`);
  return { stand, pfad, groesse: (await stat(pfad)).size };
}
