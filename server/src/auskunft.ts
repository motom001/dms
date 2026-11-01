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
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { textDritte } from '../../shared/src/anrede';
import { datumText } from '../../shared/src/archiv';
import { AUSKUNFT_TAGE, auskunftDateiname, erwaehnungText, type AuskunftErwaehnung, type AuskunftStand, type Datenschutz } from '../../shared/src/auskunft';
import { formatiere, istLeer, type Mappe, type Mappentyp } from '../../shared/src/model';
import { Fachfehler } from './fehler';
import { PdfSchreiber, pdfSicher } from './export';
import { istUuid } from './repo';
import { csv, exportDateien, vollexport, type ExportQuelle } from './vollexport';
import { ZIP_MAX, zipGroesse, zipStrom, type ZipEintrag } from './zip';

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
  aufbewahrung: Array<{ typ: string; archiv: { jahre: number; stichtag: string | null } | null; bis: string | null }>;
}

/** Phasen des Auftrags. */
export const AUSKUNFT_PHASEN = [
  { key: 'mappen', name: 'Mappen und Dokumente zusammenstellen', einheit: 'Mappen' },
  { key: 'abschluss', name: 'Listen und Prüfwerte schreiben', einheit: 'Schritte' },
  { key: 'zip', name: 'ZIP-Datei packen', einheit: 'Dateien' },
];

/** Wo die Auskünfte liegen: neben den Exporten, ohne Sicherungsordner im temporären Ordner. */
export const auskunftOrdner = (sicherungsordner?: string | null) => (sicherungsordner ? join(sicherungsordner, 'export', 'auskunft') : join(tmpdir(), 'dms-auskunft'));

const zeit = (d: Date) => d.toLocaleString('de-DE', { timeZone: 'Europe/Berlin', dateStyle: 'long', timeStyle: 'short' });
const tag = (d: Date) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin' }).format(d);
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const mehrzahl = (n: number, eins: string, viele: string) => `${n} ${n === 1 ? eins : viele}`;

/** Felder einer Mappe als lesbare Paare (ohne leere). */
function felderVon(m: Mappe, t: Mappentyp | undefined, titel: Record<string, string>): Array<[string, string]> {
  return (t?.felder ?? []).filter((f) => f.typ !== 'passwort' && !istLeer(m.werte[f.key]))
    .map((f) => [f.label, formatiere(f, m.werte[f.key], (id) => titel[id] ?? '')] as [string, string]);
}

/* ---------- Deckblatt ---------- */

export async function deckblatt(d: AuskunftDaten, x: { von: string; jetzt: Date; mandant: string }): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.setTitle(pdfSicher(`Auskunft nach Art. 15 DSGVO – ${d.start.titel}`)); doc.setProducer('DMS'); doc.setCreator('DMS');
  const f = { normal: await doc.embedFont(StandardFonts.Helvetica), fett: await doc.embedFont(StandardFonts.HelveticaBold) };
  const s = new PdfSchreiber(doc, f);
  // Anrede der Person (#474): alle Sätze an sie aus anrede.ts.
  const t = (k: Parameters<typeof textDritte>[1], w?: Record<string, string | number>) => textDritte(d.datenschutz.anrede, k, w);
  s.neueSeite();
  const absender = d.datenschutz.verantwortlicher || x.mandant;
  if (absender) s.text(absender, { groesse: 9, farbe: 0.35 });
  s.text('Auskunft nach Art. 15 DSGVO', { groesse: 18, fett: true, abstand: 14 });
  s.text(`für ${d.start.titel || 'Ohne Titel'}${d.start.typ ? ` (${d.start.typ})` : ''}`, { groesse: 12, abstand: 2 });
  s.text(`Erstellt am ${zeit(x.jetzt)}${x.von ? ` von ${x.von}` : ''}`, { groesse: 9, farbe: 0.4, abstand: 2 });
  s.linie();
  s.text(t('auskunft.deckblatt.einleitung'), { groesse: 10, abstand: 4 });

  const abschnitt = (x: string) => s.text(x, { groesse: 12, fett: true, abstand: 12 });
  const punkt = (x: string) => s.text(`• ${x}`, { groesse: 10, abstand: 2, x: 60 });
  const n = d.anzahl;

  abschnitt('1. Welche Daten (Kategorien)');
  const jeTyp = new Map<string, number>();
  for (const m of d.mappen) jeTyp.set(m.typId, (jeTyp.get(m.typId) ?? 0) + 1);
  for (const ty of d.typen) {
    const felder = ty.felder.filter((fd) => d.mappen.some((m) => m.typId === ty.id && !istLeer(m.werte[fd.key]))).map((fd) => fd.label);
    punkt(`${ty.name}: ${mehrzahl(jeTyp.get(ty.id) ?? 0, 'Eintrag', 'Einträge')}${felder.length ? ` – ${felder.slice(0, 12).join(', ')}${felder.length > 12 ? ' …' : ''}` : ''}`);
  }
  punkt(`${mehrzahl(n.dokumente, 'Dokument', 'Dokumente')} im Original${n.notizen ? `, ${mehrzahl(n.notizen, 'Notiz', 'Notizen')}` : ''}${n.historie ? `, Änderungshistorie zu ${mehrzahl(n.historie, 'Eintrag', 'Einträgen')}` : ''}`);
  if (d.erwaehnungen.length) {
    punkt(t('auskunft.deckblatt.erwaehnungen', { anzahl: mehrzahl(d.erwaehnungen.length, 'weiterem Eintrag', 'weiteren Einträgen') }));
    for (const e of d.erwaehnungen.slice(0, 15)) s.text(`– ${erwaehnungText(e)}`, { groesse: 10, abstand: 1, x: 72 });
    if (d.erwaehnungen.length > 15) s.text('– … (vollständig in Uebersicht.html)', { groesse: 10, abstand: 1, x: 72 });
  }

  abschnitt('2. Zwecke der Verarbeitung');
  const zwecke = d.typen.map((ty) => [ty.name, d.datenschutz.typen[ty.id]?.zweck ?? ''] as const);
  for (const [name, zweck] of zwecke) punkt(`${name}: ${zweck || 'kein Zweck hinterlegt'}`);

  abschnitt('3. Herkunft der Daten');
  const k = Object.entries(d.kanaele);
  if (k.length) punkt(`Post und Schriftverkehr: ${k.map(([kanal, z]) => `${kanal} (${z})`).join(', ')}`);
  punkt(t(k.length ? 'auskunft.deckblatt.herkunft.uebrige' : 'auskunft.deckblatt.herkunft.alle'));

  abschnitt('4. Empfänger');
  s.text(d.empfaenger || 'Keine Empfänger außerhalb unseres Hauses.', { groesse: 10, abstand: 2 });

  abschnitt('5. Speicherdauer');
  for (const a of d.aufbewahrung) {
    punkt(a.archiv
      ? `${a.typ}: gesetzliche Aufbewahrung ${mehrzahl(a.archiv.jahre, 'Jahr', 'Jahre')} ab ${a.archiv.stichtag ?? 'Anlage'} (bis zum Jahresende)${a.bis ? `, längstens bis ${datumText(a.bis)}` : ''}`
      : `${a.typ}: solange für den Zweck nötig; keine feste Frist hinterlegt`);
  }

  abschnitt(t('auskunft.deckblatt.rechte'));
  s.text(d.datenschutz.rechte, { groesse: 10, abstand: 2 });

  if (d.anmerkung) { abschnitt('Anmerkung'); s.text(d.anmerkung, { groesse: 10, abstand: 2 }); }

  abschnitt('Inhalt dieser Datei');
  punkt('Uebersicht.html – alle Einträge mit ihren Angaben und Links zu den Dokumenten (im Browser öffnen)');
  punkt('Uebersicht.csv – dasselbe als Tabelle');
  punkt('ablage/ – je Eintrag ein Ordner mit den Dokumenten im Original und einer PDF-Zusammenfassung');
  punkt('daten/, struktur/, manifest.json – maschinenlesbar (CSV, JSON) zur Übernahme in andere Systeme (Art. 20 DSGVO)');
  return Buffer.from(await doc.save());
}

/* ---------- Übersicht ---------- */

export function uebersichtCsv(d: AuskunftDaten, pfade: Map<string, string>): Buffer {
  const typ = new Map(d.typen.map((t) => [t.id, t] as const));
  const zeilen = d.mappen.map((m) => {
    const t = typ.get(m.typId);
    return [t?.name ?? '', m.titel ?? '', felderVon(m, t, d.titel).map(([k, v]) => `${k}: ${v}`).join('; '), m.erstellt.slice(0, 10), m.geaendert.slice(0, 10), pfade.get(m.id) ?? '', m.id];
  });
  // Erwähnungen (#472): nur Art, Titel und das Feld, über das die Person genannt ist.
  for (const e of d.erwaehnungen) zeilen.push([e.typ, e.titel, erwaehnungText(e), '', '', '', e.mappeId]);
  return csv(['Art', 'Titel', 'Angaben', 'Angelegt', 'Geändert', 'Ordner', 'Id'], zeilen);
}

export function uebersichtHtml(d: AuskunftDaten, x: { jetzt: Date; dokumente: Array<{ id: string; mappeId: string; name: string; groesse: number }>; pfade: { mappen: Map<string, string>; dokumente: Map<string, string> } }): Buffer {
  const typ = new Map(d.typen.map((t) => [t.id, t] as const));
  const doks = new Map<string, typeof x.dokumente>();
  for (const dk of x.dokumente) doks.set(dk.mappeId, [...doks.get(dk.mappeId) ?? [], dk]);
  const link = (p: string) => p.split('/').map(encodeURIComponent).join('/');
  const kb = (b: number) => (b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 / 1024).toFixed(1).replace('.', ',')} MB`);
  const abschnitte = d.typen.map((t) => {
    const ms = d.mappen.filter((m) => m.typId === t.id);
    return `<h2>${esc(t.name)} <small>(${ms.length})</small></h2>\n${ms.map((m) => {
      const f = felderVon(m, typ.get(m.typId), d.titel);
      const ds = doks.get(m.id) ?? [];
      const ordner = x.pfade.mappen.get(m.id);
      return `<section><h3>${esc(m.titel || 'Ohne Titel')}</h3>
<dl>${f.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}<dt>Angelegt</dt><dd>${esc(new Date(m.erstellt).toLocaleDateString('de-DE'))}</dd></dl>
${ds.length ? `<ul>${ds.map((dk) => { const p = x.pfade.dokumente.get(dk.id); return `<li>${p ? `<a href="${esc(link(p))}">${esc(dk.name)}</a>` : esc(dk.name)} <small>${kb(dk.groesse)}</small></li>`; }).join('')}</ul>` : ''}
${ordner ? `<p><small>Ordner: <a href="${esc(link(ordner))}/">${esc(ordner)}</a></small></p>` : ''}</section>`;
    }).join('\n')}`;
  }).join('\n');
  const erwaehnt = d.erwaehnungen.length ? `<h2>${esc(textDritte(d.datenschutz.anrede, 'auskunft.uebersicht.genannt'))} <small>(${d.erwaehnungen.length})</small></h2>
<p><small>${esc(textDritte(d.datenschutz.anrede, 'auskunft.uebersicht.genannt.hinweis'))}</small></p>
<ul>${d.erwaehnungen.map((e) => `<li>${esc(erwaehnungText(e))}</li>`).join('')}</ul>` : '';
  return Buffer.from(`<!doctype html>
<html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Auskunft – ${esc(d.start.titel)}</title>
<style>
body{font:15px/1.5 system-ui,sans-serif;max-width:60rem;margin:2rem auto;padding:0 1rem;color:#1d2330;background:#fff}
h1{font-size:1.5rem;margin:0}h2{font-size:1.2rem;margin-top:2rem;border-bottom:1px solid #d6dbe3}h3{font-size:1rem;margin:1rem 0 .3rem}
small{color:#5d6675}section{border:1px solid #e3e7ee;border-radius:6px;padding:.4rem 1rem;margin:.6rem 0}
dl{display:grid;grid-template-columns:minmax(8rem,14rem) 1fr;gap:.2rem 1rem;margin:.3rem 0}dt{color:#5d6675}dd{margin:0;white-space:pre-wrap;overflow-wrap:anywhere}
@media (max-width:40rem){dl{grid-template-columns:1fr}dd{margin-bottom:.3rem}}
</style></head><body>
<h1>Auskunft nach Art. 15 DSGVO</h1>
<p>für <strong>${esc(d.start.titel || 'Ohne Titel')}</strong>${d.start.typ ? ` (${esc(d.start.typ)})` : ''} · erstellt am ${esc(zeit(x.jetzt))}<br>
<small>${mehrzahl(d.anzahl.mappen, 'Eintrag', 'Einträge')}, ${mehrzahl(d.anzahl.dokumente, 'Dokument', 'Dokumente')}. Die Pflichtangaben stehen im Deckblatt (Deckblatt.pdf).</small></p>
${abschnitte}
${erwaehnt}
</body></html>
`, 'utf8');
}

export function liesmichText(d: AuskunftDaten, jetzt: Date): string {
  return `# Auskunft nach Art. 15 DSGVO

Für ${d.start.titel || 'Ohne Titel'}, erstellt am ${zeit(jetzt)}. ${mehrzahl(d.anzahl.mappen, 'Eintrag', 'Einträge')}, ${mehrzahl(d.anzahl.dokumente, 'Dokument', 'Dokumente')}.

- ${textDritte(d.datenschutz.anrede, 'auskunft.liesmich.deckblatt')}
- ${textDritte(d.datenschutz.anrede, 'auskunft.liesmich.uebersicht')}
- **ablage/** – je Eintrag ein Ordner mit den Dokumenten im Original (\`.txt\` = erkannter Text) und \`mappe.pdf\`/\`mappe.json\`.
- **daten/** – maschinenlesbar: je Art eine Tabelle (\`.csv\`, \`.jsonl\`, \`.xlsx\`), Verweise, Dokumentliste, Notizen, Änderungshistorie (\`.jsonl\`).
- **struktur/mappentypen.json** – welche Angaben es je Art gibt. **manifest.json** – Größe und SHA-256 jeder Datei.

Format: wie der Vollexport des DMS (CSV nach RFC 4180 mit BOM, JSON Lines, Datum JJJJ-MM-TT, Zeitpunkte ISO 8601 in UTC).
`;
}

/* ---------- Erzeugen ---------- */

const zuGross = () => new Fachfehler(422, 'Die Auskunft wäre größer als 4 GB – bitte weniger Dokumente auswählen und auf mehrere Auskünfte verteilen.');

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
      ...dateien.map((f) => ({ name: `${name}/${f.name}`, groesse: f.groesse, inhalt: async () => createReadStream(f.pfad) })),
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
      const aussen: ZipEintrag[] = [{ name: 'Auskunft.zip', groesse: innenGroesse, inhalt: async () => createReadStream(innen) }];
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
  if (!istUuid(id)) throw new Fachfehler(404, 'Diese Auskunft gibt es nicht (mehr).');
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
  if (!istUuid(id)) throw new Fachfehler(404, 'Diese Auskunft gibt es nicht (mehr).');
  const stand = (await auskuenfteIn(ordner)).find((s) => s.id === id);
  if (!stand) throw new Fachfehler(404, `Diese Auskunft gibt es nicht mehr – sie wird nach dem Herunterladen bzw. nach ${AUSKUNFT_TAGE} Tagen gelöscht. Erstelle sie bei Bedarf neu.`);
  const pfad = join(ordner, `${id}.zip`);
  return { stand, pfad, groesse: (await stat(pfad)).size };
}
