import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readFile, readdir, rm, stat, statfs, writeFile } from 'node:fs/promises';
import { dirname, join, relative, sep } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { aufbewahrenBis } from '../../shared/src/archiv';
import { auswahlText, istLeer, verweiseVon, type Aufgabe, type Dokument, type DokumentVersion, type Mappe, type Mappentyp, type Notiz, type Vertretung, type Werte } from '../../shared/src/model';
import type { Erinnerung } from '../../shared/src/fristen';
import type { Nummernkreis } from '../../shared/src/nummernkreis';
import type { Sicht } from '../../shared/src/sichten';
import { exportSpalten, sichererName, spaltenKopf, zeile } from './export';
import { Fachfehler } from './fehler';
import type { PapierkorbEintrag } from './repo';
import { xlsxAus } from './xlsx';
import { alsZeile, LOESCH_SPALTEN, type LoeschEintrag } from '../../shared/src/loeschprotokoll';

/**
 * Vollexport aller Daten in offenen Formaten (#254): ein Ordner, lesbar ohne das DMS.
 * CSV (RFC 4180, Komma, UTF-8 mit BOM), JSON Lines, Excel, PDF, iCalendar, vCard 4.0,
 * Dokumente im Original (mit allen Versionen). manifest.json enthält SHA-256 und Größe jeder Datei.
 */

export const FORMATVERSION = 1;

/**
 * Wo jede Tabelle der Datenbank im Export steht – oder warum nicht. Ein Test vergleicht das mit den
 * Tabellen der Datenbank: Eine neue Tabelle ohne Eintrag hier lässt ihn fehlschlagen.
 */
export const EXPORT_TABELLEN: Record<string, string> = {
  haushalte: 'manifest.json (Haushalt)',
  mappentypen: 'struktur/mappentypen.json',
  sichten: 'struktur/sichten.json',
  nummernkreise: 'struktur/nummernkreise.json',
  pakete: 'struktur/pakete.json',
  designs: 'struktur/designs.json',
  benutzer: 'struktur/benutzer.json (ohne Passwort-Hashes)',
  benutzer_einstellungen: 'struktur/benutzer.json (einstellungen)',
  mappen: 'daten/<typ>.csv, .jsonl, .xlsx und ablage/',
  verweise: 'daten/verweise.csv',
  dokumente: 'daten/dokumente.csv und ablage/',
  dokument_versionen: 'daten/dokumente.csv und ablage/…/Versionen/',
  notizen: 'daten/notizen.jsonl',
  aufgaben: 'daten/aufgaben.jsonl und kalender/fristen.ics',
  erinnerungen: 'daten/erinnerungen.jsonl und kalender/fristen.ics',
  historie: 'daten/historie.jsonl',
  favoriten: 'daten/favoriten.csv',
  papierkorb: 'daten/papierkorb.jsonl',
  papierkorb_dokumente: 'daten/papierkorb-dokumente.jsonl (ohne Datei)',
  loeschprotokoll: 'daten/loeschprotokoll.csv (#470, Nachweis gelöschter Mappen und Dokumente ohne Inhalte)',
  vertretungen: 'daten/vertretungen.jsonl',
  fehlermeldungen: 'nicht enthalten: gemeldete Fehler an die Administratoren (technisch)',
  langlaeufer: 'nicht enthalten: Messwerte langsamer Datenbankzugriffe (technisch)',
  einstellungen: 'nicht enthalten: Betriebseinstellungen mit Zugangsdaten (Mail, Postfächer, Schlüssel, Anmeldung)',
  api_schluessel: 'nicht enthalten: Geheimnisse',
  paket_code: 'nicht enthalten: Code installierter Pakete (#338, steht im Paket selbst)',
  paket_ereignisse: 'nicht enthalten: Ereignisse für Pakete mit Code (#338, technisch)',
  passwort_links: 'nicht enthalten: Geheimnisse',
  auskunft_links: 'nicht enthalten: Abruf-Links von Auskünften (#455, Hashes; der Nachweis steht in daten/historie.jsonl)',
  sitzungen: 'nicht enthalten: Anmeldungen',
  erkennungen: 'nicht enthalten: Ergebnis der Erkennung je Post (#336, wird aus dem Volltext neu berechnet)',
  gesehen: 'nicht enthalten: wann ein Benutzer eine Mappe zuletzt geöffnet hat (#422, nur für die Hervorhebung geänderter Mappen)',
  schema_migrationen: 'nicht enthalten: Stand der Datenbank (steht als Version im Manifest)',
};

/** Kontaktfelder für vCard (#254): Feldschlüssel je Angabe; vom Administrator bestätigt. */
export interface KontaktZuordnung { name: string; email?: string; telefon?: string; adresse?: string; firma?: string; notiz?: string }
export interface ExportOptionen {
  /** Passwortfelder im Klartext als passwoerter.csv (Bitwarden-Format) – nur mit ausdrücklicher Bestätigung. */
  passwoerter?: boolean;
  /** Technische Protokolle (Arbeitsspeicher) mitnehmen. */
  protokolle?: boolean;
  /** vCard je Mappentyp: Typ-Id → Zuordnung. */
  kontakte?: Record<string, KontaktZuordnung>;
  /** Eigener Text für LIESMICH.md (Auskunft, #396); Standard: der des Vollexports. */
  liesmich?: string;
  /** Zweck im Manifest (Auskunft, #396); das Format bleibt dms-vollexport. */
  zweck?: string;
}

export interface ExportQuelle {
  mandant: string; version: string;
  typen(): Promise<Mappentyp[]>;
  sichten(): Promise<Sicht[]>;
  nummernkreise(): Promise<Nummernkreis[]>;
  /** Installierte Pakete (#188). */
  pakete(): Promise<unknown[]>;
  designs(): Promise<unknown[]>;
  mappen(typId: string): Promise<Mappe[]>;
  papierkorb(): Promise<PapierkorbEintrag[]>;
  /** Einzeln gelöschte Dokumente (#344); fehlt bei älteren Quellen. */
  papierkorbDokumente?(): Promise<unknown[]>;
  /** Löschprotokoll (#470), älteste zuerst; fehlt bei Auskunft und persönlichem Export. */
  loeschprotokoll?(): Promise<LoeschEintrag[]>;
  /*
   * Gebündelt je Paket von Mappen bzw. Dokumenten (#367): ein Zugriff je Paket statt je Mappe
   * oder Dokument. Die Reihenfolge innerhalb einer Mappe bzw. eines Dokuments zählt, die zwischen
   * ihnen nicht.
   */
  dokumente(mappeIds: string[]): Promise<Dokument[]>;
  versionen(dokumentIds: string[]): Promise<DokumentVersion[]>;
  /** Volltexte; Dokumente ohne fehlen. */
  volltexte(dokumentIds: string[]): Promise<Map<string, string>>;
  datei(sha256: string): Promise<Readable | Buffer>;
  notizen(mappeIds: string[]): Promise<Notiz[]>;
  aufgaben(mappeIds: string[]): Promise<Aufgabe[]>;
  erinnerungen(): Promise<Erinnerung[]>;
  historie(mappeIds: string[]): Promise<Array<{ mappeId: string }>>;
  favoriten(): Promise<Array<{ benutzerId: string; mappeId: string }>>;
  benutzer(): Promise<{ benutzer: Array<Record<string, unknown>>; vertretungen: Vertretung[] }>;
  passwort(wert: unknown): string | null;
  protokoll(): unknown[];
  pdf(titel: string, mappen: Mappe[], typ: Mappentyp, uebersicht: boolean): Promise<Buffer>;
}

/* ---------- Formate ---------- */

/** CSV nach RFC 4180: Komma, CRLF, Anführungszeichen bei Bedarf, UTF-8 mit BOM. */
export function csv(kopf: string[], zeilen: string[][]): Buffer {
  const feld = (s: string) => (/[",\r\n]/.test(s) || /^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  return Buffer.from('\ufeff' + [kopf, ...zeilen].map((z) => z.map(feld).join(',')).join('\r\n') + '\r\n', 'utf8');
}
const jsonl = (zeilen: unknown[]) => Buffer.from(zeilen.map((z) => JSON.stringify(z)).join('\n') + (zeilen.length ? '\n' : ''), 'utf8');
const json = (x: unknown) => Buffer.from(JSON.stringify(x, null, 2) + '\n', 'utf8');

/** iCalendar: Text maskieren und Zeilen auf 75 Oktette falten. */
function ics(text: string) { return text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n'); }
function falte(z: string): string {
  const b = Buffer.from(z, 'utf8');
  if (b.length <= 75) return z;
  const teile: string[] = []; let rest = z;
  while (Buffer.byteLength(rest) > 75) {
    let n = 75; while (Buffer.byteLength(rest.slice(0, n)) > (teile.length ? 74 : 75)) n--;
    teile.push(rest.slice(0, n)); rest = rest.slice(n);
  }
  teile.push(rest);
  return teile.join('\r\n ');
}

/** Wert einer Zelle: maschinenlesbar (ISO 8601, Punkt als Dezimaltrennzeichen, Ids). */
function zelle(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (Array.isArray(v)) return v.map(String).join(' | ');
  if (typeof v === 'object') return 'betrag' in (v as object) ? String((v as { betrag: unknown }).betrag ?? '') : JSON.stringify(v);
  return String(v);
}
/** Passwortfelder nie im Klartext: nur „gesetzt“. */
function ohnePasswoerter(t: Mappentyp | undefined, w: Werte): Werte {
  const x = { ...w };
  for (const f of t?.felder ?? []) if (f.typ === 'passwort' && !istLeer(x[f.key])) x[f.key] = { gesetzt: true } as never;
  return x;
}

/* ---------- Schreiben mit Prüfwert ---------- */

interface Eintrag { pfad: string; bytes: number; sha256: string }

class Schreiber {
  readonly dateien: Eintrag[] = [];
  bytes = 0;
  constructor(readonly ordner: string) {}
  async schreibe(rel: string, inhalt: Buffer | Readable | (() => Promise<Buffer | Readable>)) {
    const pfad = join(this.ordner, ...rel.split('/'));
    await mkdir(dirname(pfad), { recursive: true });
    const quelle = typeof inhalt === 'function' ? await inhalt() : inhalt;
    const h = createHash('sha256'); let n = 0;
    if (Buffer.isBuffer(quelle)) { h.update(quelle); n = quelle.length; await writeFile(pfad, quelle); }
    else {
      await pipeline(quelle, new Transform({ transform(c: Buffer, _e, cb) { h.update(c); n += c.length; cb(null, c); } }), createWriteStream(pfad));
    }
    this.dateien.push({ pfad: rel, bytes: n, sha256: h.digest('hex') });
    this.bytes += n;
  }
}

/** Eindeutige, sichere Namen innerhalb eines Ordners. */
function namen() {
  const vergeben = new Set<string>();
  return (wunsch: string) => {
    const s = sichererName(wunsch, 120) || 'Datei';
    const p = s.lastIndexOf('.');
    const [stamm, endung] = p > 0 ? [s.slice(0, p), s.slice(p)] : [s, ''];
    let n = s, i = 2;
    while (vergeben.has(n.toLowerCase())) n = `${stamm} (${i++})${endung}`;
    vergeben.add(n.toLowerCase());
    return n;
  };
}

/* ---------- Export ---------- */

/** Mappen je Zugriff beim Export (#367) und Dokumente je Zugriff auf die Volltexte. */
const EXPORT_PAKET = 200;
const VOLLTEXT_PAKET = 100;
function gruppiere<T>(liste: T[], schluessel: (x: T) => string): Map<string, T[]> {
  const r = new Map<string, T[]>();
  for (const x of liste) { const k = schluessel(x); const l = r.get(k); if (l) l.push(x); else r.set(k, [x]); }
  return r;
}

export interface ExportErgebnis {
  ordner: string; name: string; dateien: number; bytes: number; mappen: number; dokumente: number;
  /** Pfad (relativ zum Export) je Mappe (Ordner) und je Dokument (Datei) – für Übersichten, die darauf verlinken (#396). */
  pfade: { mappen: Map<string, string>; dokumente: Map<string, string> };
}

/** Phasen des Auftrags (#364): je Mappe ein Schritt, danach Listen, Kalender und Manifest. */
export const VOLLEXPORT_PHASEN = [
  { key: 'mappen', name: 'Mappen exportieren', einheit: 'Mappen' },
  { key: 'abschluss', name: 'Listen und Prüfwerte schreiben', einheit: 'Schritte' },
];

export async function vollexport(q: ExportQuelle, ziel: string, opt: ExportOptionen, fortschritt: (fertig: number, gesamt: number, phase?: string) => void = () => {}, jetzt = new Date()): Promise<ExportErgebnis> {
  const name = `dms-export-${jetzt.toISOString().slice(0, 19).replace(/[T:]/g, '-')}`;
  const ordner = join(ziel, name);
  await mkdir(ordner, { recursive: true });
  const w = new Schreiber(ordner);
  const typen = await q.typen();
  const typVon = new Map(typen.map((t) => [t.id, t] as const));
  const alleMappen = new Map<string, Mappe>();
  const jeTyp = new Map<string, Mappe[]>();
  for (const t of typen) { const ms = await q.mappen(t.id); jeTyp.set(t.id, ms); for (const m of ms) alleMappen.set(m.id, m); }
  const titel = (id: string | null | undefined) => (id ? alleMappen.get(id)?.titel ?? '' : '');
  const quelle = { typen: typVon, titel };
  let fertig = 0; const gesamt = alleMappen.size;
  const weiter = () => fortschritt(++fertig, gesamt, 'mappen');
  let schritt = 0;
  const abschluss = () => fortschritt(++schritt, 3, 'abschluss');
  fortschritt(0, gesamt, 'mappen');

  // Struktur
  const b = await q.benutzer();
  await w.schreibe('struktur/mappentypen.json', json(typen));
  await w.schreibe('struktur/sichten.json', json(await q.sichten()));
  await w.schreibe('struktur/nummernkreise.json', json(await q.nummernkreise()));
  await w.schreibe('struktur/pakete.json', json(await q.pakete()));
  await w.schreibe('struktur/designs.json', json(await q.designs()));
  await w.schreibe('struktur/benutzer.json', json(b.benutzer));

  // Daten je Mappentyp
  const ordnerTyp = namen();
  const verweise: string[][] = [];
  const dokZeilen: string[][] = [];
  const notizen: unknown[] = [], aufgaben: Aufgabe[] = [], historie: unknown[] = [];
  const passwoerter: string[][] = [];
  const pfade: ExportErgebnis['pfade'] = { mappen: new Map(), dokumente: new Map() };
  let dokumente = 0;
  for (const t of typen) {
    const ms = jeTyp.get(t.id) ?? [];
    const dateiname = sichererName(t.schluessel || t.name, 60);
    // CSV und JSON Lines: alle Felder, Verweise als Id und Titel.
    const kopf = ['id', 'titel', 'angelegt', 'angelegt_von', 'geaendert', 'geaendert_von', ...(t.archiv ? ['aufbewahren_bis'] : []),
      ...t.felder.flatMap((f) => (f.typ === 'referenz' ? [f.key, `${f.key}_titel`] : f.typ === 'betrag' ? [f.key, `${f.key}_waehrung`] : [f.key]))];
    const zeilen = ms.map((m) => [m.id, m.titel ?? '', m.erstellt, m.erstelltVon ?? '', m.geaendert, m.geaendertVon ?? '', ...(t.archiv ? [aufbewahrenBis(t.archiv, m) ?? ''] : []),
      ...t.felder.flatMap((f) => {
        const v = m.werte[f.key];
        if (f.typ === 'passwort') return [istLeer(v) ? '' : '(gesetzt)'];
        if (f.typ === 'referenz') { const ids = Array.isArray(v) ? v.map(String) : v ? [String(v)] : []; return [ids.join(' | '), ids.map(titel).join(' | ')]; }
        if (f.typ === 'betrag') { const x = v && typeof v === 'object' ? v as { betrag?: unknown; waehrung?: unknown } : {}; return [x.betrag == null ? '' : String(x.betrag), String(x.waehrung ?? '')]; }
        return [zelle(v)];
      })]);
    await w.schreibe(`daten/${dateiname}.csv`, csv(kopf, zeilen));
    await w.schreibe(`daten/${dateiname}.jsonl`, jsonl(ms.map((m) => ({ ...m, werte: ohnePasswoerter(t, m.werte) }))));
    const spalten = exportSpalten([t], 'alle');
    await w.schreibe(`daten/${dateiname}.xlsx`, xlsxAus(t.name, spalten.map((k) => spaltenKopf(k, [t])), ms.map((m) => zeile({ ...m, werte: ohnePasswoerter(t, m.werte) }, spalten, quelle).werte)));
    if (ms.length) await w.schreibe(`uebersicht/${dateiname}.pdf`, () => q.pdf(t.name, ms.map((m) => ({ ...m, werte: ohnePasswoerter(t, m.werte) })), t, true));

    // Ablage: je Mappe ein Ordner. Dokumente, Volltexte, Versionen, Notizen, Aufgaben und Historie
    // je Paket von Mappen in einem Zugriff (#367) – nicht je Mappe oder Dokument.
    const tOrdner = ordnerTyp(t.name);
    const mOrdner = namen();
    for (let i = 0; i < ms.length; i += EXPORT_PAKET) {
      const paket = ms.slice(i, i + EXPORT_PAKET);
      const ids = paket.map((m) => m.id);
      const [dokJe, notizJe, aufgabeJe, historieJe] = await Promise.all([
        q.dokumente(ids).then((x) => gruppiere(x, (d) => d.mappeId)), q.notizen(ids).then((x) => gruppiere(x, (n) => n.mappeId)),
        q.aufgaben(ids).then((x) => gruppiere(x, (a) => a.mappeId)), q.historie(ids).then((x) => gruppiere(x, (h) => h.mappeId)),
      ]);
      const dokIds = [...dokJe.values()].flat().map((d) => d.id);
      const versionJe = gruppiere(await q.versionen(dokIds), (v) => v.dokumentId);
      // Volltexte in kleineren Paketen: sie können je Dokument groß sein.
      const texte = new Map<string, string>();
      for (let j = 0; j < dokIds.length; j += VOLLTEXT_PAKET) for (const [k, v] of await q.volltexte(dokIds.slice(j, j + VOLLTEXT_PAKET))) texte.set(k, v);
      for (const m of paket) {
        const pfad = `ablage/${tOrdner}/${mOrdner(`${m.titel || 'Ohne Titel'} [${m.id.slice(0, 8)}]`)}`;
        pfade.mappen.set(m.id, pfad);
        await w.schreibe(`${pfad}/mappe.json`, json({ ...m, werte: ohnePasswoerter(t, m.werte), typ: t.name, ...(t.archiv ? { aufbewahrenBis: aufbewahrenBis(t.archiv, m) } : {}) }));
        await w.schreibe(`${pfad}/mappe.pdf`, () => q.pdf(m.titel || t.name, [{ ...m, werte: ohnePasswoerter(t, m.werte) }], t, false));
        for (const v of verweiseVon(t, m.werte)) verweise.push([m.id, t.felder.find((f) => f.key === v.feldKey)?.label ?? v.feldKey, v.feldKey, v.zielId, titel(v.zielId)]);
        const dateiNamen = new Map<string, ReturnType<typeof namen>>();
        for (const d of dokJe.get(m.id) ?? []) {
          const reg = t.register.find((r) => r.key === d.registerKey)?.name ?? d.registerKey;
          const regName = sichererName(reg, 60);
          if (!dateiNamen.has(regName)) dateiNamen.set(regName, namen());
          const dn = dateiNamen.get(regName)!(d.name);
          const rel = `${pfad}/${regName}/${dn}`;
          await w.schreibe(rel, () => q.datei(d.sha256));
          pfade.dokumente.set(d.id, rel);
          const text = texte.get(d.id);
          if (text) await w.schreibe(`${rel}.txt`, Buffer.from(text, 'utf8'));
          dokZeilen.push([d.id, m.id, d.registerKey, d.name, d.mime, String(d.groesse), d.sha256, d.erstellt, d.erstelltVon ?? '', String(d.version ?? 1), 'aktuell', rel]);
          dokumente++;
          const vn = namen();
          for (const v of versionJe.get(d.id) ?? []) {
            const vrel = `${pfad}/${regName}/Versionen/${vn(`v${v.nummer} ${v.name}`)}`;
            await w.schreibe(vrel, () => q.datei(v.sha256));
            dokZeilen.push([d.id, m.id, d.registerKey, v.name, v.mime, String(v.groesse), v.sha256, v.erstellt, v.erstelltVon ?? '', String(v.nummer), 'aelter', vrel]);
          }
        }
        notizen.push(...notizJe.get(m.id) ?? []);
        aufgaben.push(...aufgabeJe.get(m.id) ?? []);
        historie.push(...historieJe.get(m.id) ?? []);
        if (opt.passwoerter) for (const f of t.felder.filter((x) => x.typ === 'passwort' && typeof m.werte[x.key] === 'string' && m.werte[x.key] !== '')) {
          const klar = q.passwort(m.werte[f.key]);
          if (klar === null) continue;
          const nutzer = t.felder.find((x) => x.typ === 'text' && /benutzer|login|user|e-?mail|konto/i.test(`${x.key} ${x.label}`));
          const url = t.felder.find((x) => x.typ === 'text' && /url|adresse|web|seite/i.test(`${x.key} ${x.label}`));
          passwoerter.push([t.name, '', 'login', `${m.titel || 'Ohne Titel'}${t.felder.filter((x) => x.typ === 'passwort').length > 1 ? ` – ${f.label}` : ''}`, '', '', '0',
            url ? auswahlText(m.werte[url.key]) : '', nutzer ? auswahlText(m.werte[nutzer.key]) : '', klar, '']);
        }
        weiter();
      }
    }

    // vCard (#254): nur mit bestätigter Zuordnung
    const k = opt.kontakte?.[t.id];
    if (k && ms.length) {
      const wert = (m: Mappe, key?: string) => (key ? auswahlText(m.werte[key]) : '');
      const v = ms.map((m) => [
        'BEGIN:VCARD', 'VERSION:4.0', `FN:${ics(wert(m, k.name) || m.titel || '')}`,
        ...(wert(m, k.firma) ? [`ORG:${ics(wert(m, k.firma))}`] : []),
        ...(wert(m, k.email) ? [`EMAIL:${ics(wert(m, k.email))}`] : []),
        ...(wert(m, k.telefon) ? [`TEL:${ics(wert(m, k.telefon))}`] : []),
        ...(wert(m, k.adresse) ? [`ADR:;;${ics(wert(m, k.adresse))};;;;`] : []),
        ...(wert(m, k.notiz) ? [`NOTE:${ics(wert(m, k.notiz))}`] : []),
        `UID:urn:uuid:${m.id}`, 'END:VCARD',
      ].map(falte).join('\r\n')).join('\r\n') + '\r\n';
      await w.schreibe(`kontakte/${dateiname}.vcf`, Buffer.from(v, 'utf8'));
    }
  }

  await w.schreibe('daten/verweise.csv', csv(['quelle_id', 'feld', 'feld_schluessel', 'ziel_id', 'ziel_titel'], verweise));
  await w.schreibe('daten/dokumente.csv', csv(['dokument_id', 'mappe_id', 'register', 'dateiname', 'typ', 'groesse', 'sha256', 'erstellt', 'erstellt_von', 'version', 'stand', 'pfad'], dokZeilen));
  await w.schreibe('daten/notizen.jsonl', jsonl(notizen));
  await w.schreibe('daten/aufgaben.jsonl', jsonl(aufgaben));
  const erinnerungen = await q.erinnerungen();
  await w.schreibe('daten/erinnerungen.jsonl', jsonl(erinnerungen));
  await w.schreibe('daten/historie.jsonl', jsonl(historie));
  await w.schreibe('daten/favoriten.csv', csv(['benutzer_id', 'mappe_id'], (await q.favoriten()).map((f) => [f.benutzerId, f.mappeId])));
  await w.schreibe('daten/papierkorb.jsonl', jsonl((await q.papierkorb()).map((p) => ({ ...p, werte: ohnePasswoerter(typVon.get(p.typId), p.werte) }))));
  await w.schreibe('daten/papierkorb-dokumente.jsonl', jsonl(q.papierkorbDokumente ? await q.papierkorbDokumente() : []));
  if (q.loeschprotokoll) await w.schreibe('daten/loeschprotokoll.csv', csv(LOESCH_SPALTEN, (await q.loeschprotokoll()).map(alsZeile)));
  await w.schreibe('daten/vertretungen.jsonl', jsonl(b.vertretungen));
  abschluss();

  // Kalender: Fristen und Aufgaben mit Datum, Erinnerungen
  const tag = (d: string) => d.slice(0, 10).replace(/-/g, '');
  const stempel = jetzt.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const ereignisse = [
    ...aufgaben.filter((a) => a.datum && !a.erledigt).map((a) => ({ id: a.id, datum: a.datum!, titel: `${a.text}${titel(a.mappeId) ? ` – ${titel(a.mappeId)}` : ''}` })),
    ...erinnerungen.map((e) => ({ id: e.id, datum: e.datum, titel: `${e.text || 'Erinnerung'}${titel(e.mappeId) ? ` – ${titel(e.mappeId)}` : ''}` })),
  ];
  await w.schreibe('kalender/fristen.ics', Buffer.from(['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//DMS//Vollexport//DE', 'CALSCALE:GREGORIAN',
    ...ereignisse.flatMap((e) => ['BEGIN:VEVENT', `UID:${e.id}@dms`, `DTSTAMP:${stempel}`, `DTSTART;VALUE=DATE:${tag(e.datum)}`, `SUMMARY:${ics(e.titel)}`, 'END:VEVENT']),
    'END:VCALENDAR'].map(falte).join('\r\n') + '\r\n', 'utf8'));

  if (opt.passwoerter) {
    await w.schreibe('passwoerter.csv', csv(['folder', 'favorite', 'type', 'name', 'notes', 'fields', 'reprompt', 'login_uri', 'login_username', 'login_password', 'login_totp'], passwoerter));
  }
  if (opt.protokolle) await w.schreibe('protokolle/protokoll.jsonl', jsonl(q.protokoll()));
  abschluss();

  const anzahlen = { mappentypen: typen.length, mappen: alleMappen.size, dokumente, verweise: verweise.length, notizen: notizen.length, aufgaben: aufgaben.length, erinnerungen: erinnerungen.length, historie: historie.length };
  await w.schreibe('LIESMICH.md', Buffer.from(opt.liesmich ?? liesmich(q, jetzt, anzahlen, opt), 'utf8'));
  // Manifest zuletzt; es nennt alle anderen Dateien mit Größe und Prüfwert.
  const manifest = { format: 'dms-vollexport', formatversion: FORMATVERSION, erstellt: jetzt.toISOString(), dms: q.version, mandant: q.mandant, anzahlen, passwoerter: !!opt.passwoerter, protokolle: !!opt.protokolle, ...(opt.zweck ? { zweck: opt.zweck } : {}), tabellen: EXPORT_TABELLEN, dateien: w.dateien };
  await writeFile(join(ordner, 'manifest.json'), json(manifest));
  abschluss();
  return { ordner, name, dateien: w.dateien.length + 1, bytes: w.bytes, mappen: alleMappen.size, dokumente, pfade };
}

function liesmich(q: ExportQuelle, jetzt: Date, n: Record<string, number>, opt: ExportOptionen) {
  return `# DMS – Vollexport

Erstellt am ${jetzt.toISOString()} mit DMS ${q.version} (Formatversion ${FORMATVERSION}), Haushalt „${q.mandant}“.
${n.mappen} Mappen in ${n.mappentypen} Mappentypen, ${n.dokumente} Dokumente.

Alles hier lässt sich ohne das DMS lesen. **Der Export ist unverschlüsselt** – bewahre ihn sicher auf.${opt.passwoerter ? '\n\n**Achtung: passwoerter.csv enthält Passwörter im Klartext.** Importiere sie in einen Passwortmanager (Bitwarden-CSV) und lösche die Datei danach.' : ''}

## Aufbau

| Ordner/Datei | Inhalt |
| --- | --- |
| \`manifest.json\` | Formatversion, Anzahlen, Größe und SHA-256 jeder Datei, wo jede Tabelle steht |
| \`struktur/\` | Mappentypen (Felder, Register, Titelvorlagen, Berechtigungen, Archiv), Ansichten, Nummernkreise, Designs, Benutzer (ohne Passwörter) |
| \`daten/<typ>.csv\` | je Mappentyp eine Tabelle: eine Zeile je Mappe, eine Spalte je Feldschlüssel; Verweise als Id und \`_titel\` |
| \`daten/<typ>.jsonl\` | dasselbe verlustfrei als JSON Lines (eine Mappe je Zeile) |
| \`daten/<typ>.xlsx\` | dasselbe für Excel/LibreOffice, mit Spaltenüberschriften |
| \`daten/verweise.csv\` | Mappe → Feld → Mappe |
| \`daten/dokumente.csv\` | alle Dokumente und ihre älteren Versionen mit Pfad im Export |
| \`daten/*.jsonl\` | Notizen, Aufgaben (mit Fristen), Erinnerungen, Historie, Papierkorb, Vertretungen; \`favoriten.csv\` |
| \`ablage/<Typ>/<Titel> [Id]/\` | je Mappe \`mappe.json\`, \`mappe.pdf\` und die Dokumente im Original je Register; \`.txt\` = erkannter Text; \`Versionen/\` = ältere Versionen |
| \`uebersicht/<typ>.pdf\` | Übersicht je Mappentyp mit allen Mappen |
| \`kalender/fristen.ics\` | offene Fristen, Aufgaben mit Datum und Erinnerungen (iCalendar) |
| \`kontakte/<typ>.vcf\` | Kontakte als vCard 4.0 (nur, wenn beim Export zugeordnet) |

## Formate

- Text: UTF-8. CSV nach RFC 4180 mit Komma und BOM (Excel erkennt so UTF-8).
- Datum: \`JJJJ-MM-TT\`, Zeitpunkte ISO 8601 in UTC. Zahlen mit Punkt. Beträge: Spalte \`<feld>\` und \`<feld>_waehrung\`.
- Ids: UUID. Mehrfachwerte in CSV mit \` | \` getrennt; in JSON als Liste.
- Passwortfelder stehen nie in den Daten (nur „gesetzt“).

## Vollständig?

\`\`\`python
import hashlib, json, pathlib
basis = pathlib.Path(__file__).parent if '__file__' in dir() else pathlib.Path('.')
m = json.loads((basis / 'manifest.json').read_text('utf-8'))
fehler = [d['pfad'] for d in m['dateien'] if hashlib.sha256((basis / d['pfad']).read_bytes()).hexdigest() != d['sha256']]
print('alles in Ordnung' if not fehler else f'abweichend: {fehler}')
\`\`\`

## Weiterverarbeiten

- **Excel/LibreOffice:** \`daten/<typ>.xlsx\` öffnen – oder \`.csv\` (Komma, UTF-8).
- **Python:** \`pandas.read_csv('daten/rechnung.csv')\` oder Zeile für Zeile \`json.loads\` aus \`.jsonl\`.
- **Anderes DMS:** \`ablage/\` enthält alle Dateien in lesbaren Ordnern; Metadaten in \`mappe.json\`.
`;
}

/* ---------- Verwaltung der Exporte ---------- */

export interface ExportStand { name: string; erstellt: string | null; bytes: number; dateien: number; mappen: number | null; passwoerter: boolean }

export async function exporteIn(ziel: string): Promise<ExportStand[]> {
  let eintraege: string[];
  try { eintraege = await readdir(ziel); } catch { return []; }
  const erg: ExportStand[] = [];
  for (const n of eintraege.filter((x) => x.startsWith('dms-export-')).sort().reverse()) {
    try {
      const m = JSON.parse(await readFile(join(ziel, n, 'manifest.json'), 'utf8')) as { erstellt: string; dateien: Eintrag[]; anzahlen?: { mappen: number }; passwoerter?: boolean };
      erg.push({ name: n, erstellt: m.erstellt, bytes: m.dateien.reduce((a, d) => a + d.bytes, 0), dateien: m.dateien.length + 1, mappen: m.anzahlen?.mappen ?? null, passwoerter: !!m.passwoerter });
    } catch { erg.push({ name: n, erstellt: null, bytes: 0, dateien: 0, mappen: null, passwoerter: false }); }
  }
  return erg;
}

const EXPORTNAME = /^dms-export-[\d-]+$/;
export function exportOrdner(ziel: string, name: string) {
  if (!EXPORTNAME.test(name)) throw new Fachfehler(404, 'Diesen Export gibt es nicht.');
  return join(ziel, name);
}

/** Export prüfen: jede Datei aus dem Manifest gegen Größe und SHA-256. */
export async function pruefeExport(ordner: string) {
  let m: { dateien: Eintrag[] };
  try { m = JSON.parse(await readFile(join(ordner, 'manifest.json'), 'utf8')); } catch { throw new Fachfehler(404, 'Diesen Export gibt es nicht oder sein manifest.json fehlt.'); }
  const fehlend: string[] = [], abweichend: string[] = [];
  for (const d of m.dateien) {
    const p = join(ordner, ...d.pfad.split('/'));
    try {
      const h = createHash('sha256');
      await pipeline(createReadStream(p), new Transform({ transform(c: Buffer, _e, cb) { h.update(c); cb(); } }));
      if (h.digest('hex') !== d.sha256) abweichend.push(d.pfad);
    } catch { fehlend.push(d.pfad); }
  }
  return { ok: !fehlend.length && !abweichend.length, dateien: m.dateien.length, fehlend, abweichend };
}

/** Dateien eines Exports für den ZIP-Download (relativer Pfad, Größe). */
export async function exportDateien(ordner: string): Promise<Array<{ name: string; groesse: number; pfad: string }>> {
  const erg: Array<{ name: string; groesse: number; pfad: string }> = [];
  const lauf = async (dir: string) => {
    for (const e of await readdir(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) await lauf(p);
      else erg.push({ name: relative(ordner, p).split(sep).join('/'), groesse: (await stat(p)).size, pfad: p });
    }
  };
  await lauf(ordner);
  return erg;
}

export async function loescheExport(ordner: string) { await rm(ordner, { recursive: true, force: true }); }

/** Freier Platz am Ziel (Bytes) oder null. */
export async function freierPlatz(ziel: string): Promise<number | null> {
  try { await mkdir(ziel, { recursive: true }); const s = await statfs(ziel); return Number(s.bavail) * Number(s.bsize); } catch { return null; }
}
