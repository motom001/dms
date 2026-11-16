/**
 * Vollexport, Ablage (#1278, Schritt 6b-2; vorher Teil von `schreibeExport`): je Mappe ein Ordner mit `mappe.json`,
 * `mappe.pdf` und den Dokumenten samt Volltext, Fassungen und Versionen; dazu die Zeilen der Listen über alle Mappen
 * (Verweise, Dokumente, Notizen, Aufgaben, Historie) und die Passwörter.
 */
import { t } from '../sprache/sprache';
import { type Mappe, type Mappentyp, verweiseVon, auswahlText } from '../../../shared/src/model';
import type { Dokument, DokumentVersion, Notiz, Aufgabe } from '../../../shared/src/model';
import { kernTyp } from '../../../shared/src/dateiumwandlung';
import { aufbewahrenBis } from '../../../shared/src/archiv';
import { sichererName } from './export';
import { json, namen, csvZeile, ohnePasswoerter } from './vollexport-formate';
import type { ExportLauf } from './vollexport-lauf';

/** Mappen je Zugriff beim Export (#367) und Dokumente je Zugriff auf die Volltexte. */
const EXPORT_PAKET = 200;
const VOLLTEXT_PAKET = 100;
function gruppiere<T>(liste: T[], schluessel: (x: T) => string): Map<string, T[]> {
  const r = new Map<string, T[]>();
  for (const x of liste) {
    const k = schluessel(x);
    const l = r.get(k);
    if (l) l.push(x);
    else r.set(k, [x]);
  }
  return r;
}

/** Was ein Paket von Mappen braucht, in einem Zugriff je Art (#367). */
interface PaketDaten {
  dokJe: Map<string, Dokument[]>;
  notizJe: Map<string, Notiz[]>;
  aufgabeJe: Map<string, Aufgabe[]>;
  historieJe: Map<string, Array<{ mappeId: string }>>;
  versionJe: Map<string, DokumentVersion[]>;
  texte: Map<string, string>;
}

async function ladePaket(l: ExportLauf, ids: string[]): Promise<PaketDaten> {
  const { q } = l;
  const [dokJe, notizJe, aufgabeJe, historieJe] = await Promise.all([
    q.dokumente(ids).then((x) => gruppiere(x, (d) => d.mappeId)),
    q.notizen(ids).then((x) => gruppiere(x, (n) => n.mappeId)),
    q.aufgaben(ids).then((x) => gruppiere(x, (a) => a.mappeId)),
    q.historie(ids).then((x) => gruppiere(x, (h) => h.mappeId)),
  ]);
  const dokIds = [...dokJe.values()].flat().map((d) => d.id);
  const versionJe = gruppiere(await q.versionen(dokIds), (v) => v.dokumentId);
  // Volltexte in kleineren Paketen: sie können je Dokument groß sein.
  const texte = new Map<string, string>();
  for (let j = 0; j < dokIds.length; j += VOLLTEXT_PAKET)
    for (const [k, v] of await q.volltexte(dokIds.slice(j, j + VOLLTEXT_PAKET))) texte.set(k, v);
  return { dokJe, notizJe, aufgabeJe, historieJe, versionJe, texte };
}

/** Umgewandelte Fassung (#577) neben das Original: `<Datei>.fassung.pdf` (bzw. .png, .jpg); liefert ihren Pfad. */
async function fassung(l: ExportLauf, d: { mime: string; sha256: string }, rel: string): Promise<string> {
  const { q } = l;
  if (!q.fassung || kernTyp(d.mime)) return '';
  const f = await q.fassung(d.sha256).catch(() => null);
  if (!f) return '';
  const frel = `${rel}.fassung.${f.mime === 'application/pdf' ? 'pdf' : f.mime === 'image/png' ? 'png' : 'jpg'}`;
  await l.w.schreibe(frel, f.inhalt);
  return frel;
}

/** Archivfassung (#631) neben das Original: `<Datei>.pdfa.pdf`; ist das Original schon PDF/A: „original“. */
async function archiv(l: ExportLauf, d: { sha256: string }, rel: string): Promise<string> {
  const { q } = l;
  if (!q.archivfassung) return '';
  const a = await q.archivfassung(d.sha256).catch(() => null);
  if (!a) return '';
  if ('imOriginal' in a) return 'original';
  if (!a.inhalt) return '';
  await l.w.schreibe(`${rel}.pdfa.pdf`, a.inhalt);
  return `${rel}.pdfa.pdf`;
}

/** Ein Dokument mit Volltext, seiner Zeile in `dokumente.csv` und seinen älteren Versionen. */
async function schreibeDokument(l: ExportLauf, m: Mappe, d: Dokument, ort: { regName: string; dn: string; pfad: string }, p: PaketDaten) {
  const { w, q } = l;
  const { regName, pfad } = ort;
  const rel = `${pfad}/${regName}/${ort.dn}`;
  await w.schreibe(rel, () => q.datei(d.sha256));
  l.pfade.dokumente.set(d.id, rel);
  const text = p.texte.get(d.id);
  if (text) await w.schreibe(`${rel}.txt`, Buffer.from(text, 'utf8'));
  // Anlagen (#998): Hauptdokument und Nummer am Ende der Zeile – ältere Leser übergehen die Spalten.
  const anlage = [
    d.anlageZu ?? '',
    d.anlageZu ? String(d.anlageNr ?? 1) : '',
    // E-Mail-Postfach (#999): Platz in der Eingangsreihenfolge der Post und Kennzeichen „Original-E-Mail“ (ja/leer).
    d.eingangNr ? String(d.eingangNr) : '',
    d.originalEmail ? 'ja' : '',
  ];
  await l.listen.dokumente.schreibe(
    csvZeile([
      d.id,
      m.id,
      d.registerKey,
      d.name,
      d.mime,
      String(d.groesse),
      d.sha256,
      d.erstellt,
      d.erstelltVon ?? '',
      String(d.version ?? 1),
      'aktuell',
      rel,
      await fassung(l, d, rel),
      await archiv(l, d, rel),
      ...anlage,
    ]),
  );
  l.dokumente++;
  const vn = namen();
  for (const v of p.versionJe.get(d.id) ?? []) {
    const vrel = `${pfad}/${regName}/Versionen/${vn(`v${v.nummer} ${v.name}`)}`;
    await w.schreibe(vrel, () => q.datei(v.sha256));
    await l.listen.dokumente.schreibe(
      csvZeile([
        d.id,
        m.id,
        d.registerKey,
        v.name,
        v.mime,
        String(v.groesse),
        v.sha256,
        v.erstellt,
        v.erstelltVon ?? '',
        String(v.nummer),
        'aelter',
        vrel,
        await fassung(l, v, vrel),
        await archiv(l, v, vrel),
        ...anlage,
      ]),
    );
  }
}

/** Notizen, Aufgaben (offene mit Datum auch für den Kalender) und Historie einer Mappe in ihre Listen. */
async function schreibeEintraege(l: ExportLauf, m: Mappe, p: PaketDaten) {
  for (const n of p.notizJe.get(m.id) ?? []) {
    await l.listen.notizen.schreibe(`${JSON.stringify(n)}\n`);
    l.zahl.notizen++;
  }
  for (const a of p.aufgabeJe.get(m.id) ?? []) {
    await l.listen.aufgaben.schreibe(`${JSON.stringify(a)}\n`);
    l.zahl.aufgaben++;
    if (a.datum && !a.erledigt) l.termine.push({ id: a.id, datum: a.datum, text: a.text, mappeId: a.mappeId });
  }
  for (const h of p.historieJe.get(m.id) ?? []) {
    await l.listen.historie.schreibe(`${JSON.stringify(h)}\n`);
    l.zahl.historie++;
  }
}

/** Passwörter einer Mappe im Klartext für passwoerter.csv (Bitwarden-Format) – nur mit ausdrücklicher Bestätigung. */
function merkePasswoerter(l: ExportLauf, mappentyp: Mappentyp, m: Mappe) {
  for (const f of mappentyp.felder.filter((x) => x.typ === 'passwort' && typeof m.werte[x.key] === 'string' && m.werte[x.key] !== '')) {
    const klar = l.q.passwort(m.werte[f.key]);
    if (klar === null) continue;
    const nutzer = mappentyp.felder.find((x) => x.typ === 'text' && /benutzer|login|user|e-?mail|konto/i.test(`${x.key} ${x.label}`));
    const url = mappentyp.felder.find((x) => x.typ === 'text' && /url|adresse|web|seite/i.test(`${x.key} ${x.label}`));
    l.passwoerter.push([
      mappentyp.name,
      '',
      'login',
      `${m.titel || t('meldungen.vollexport.ohne-titel')}${mappentyp.felder.filter((x) => x.typ === 'passwort').length > 1 ? ` – ${f.label}` : ''}`,
      '',
      '',
      '0',
      url ? auswahlText(m.werte[url.key]) : '',
      nutzer ? auswahlText(m.werte[nutzer.key]) : '',
      klar,
      '',
    ]);
  }
}

/** Eine Mappe: Ordner mit `mappe.json`, `mappe.pdf`, Verweisen, Dokumenten, Einträgen und Passwörtern. */
async function schreibeMappe(l: ExportLauf, mappentyp: Mappentyp, m: Mappe, pfad: string, p: PaketDaten) {
  const { w, q, titel } = l;
  l.pfade.mappen.set(m.id, pfad);
  await w.schreibe(
    `${pfad}/mappe.json`,
    json({
      ...m,
      werte: ohnePasswoerter(mappentyp, m.werte),
      typ: mappentyp.name,
      ...(mappentyp.archiv ? { aufbewahrenBis: aufbewahrenBis(mappentyp.archiv, m) } : {}),
    }),
  );
  await w.schreibe(`${pfad}/mappe.pdf`, () =>
    q.pdf(m.titel || mappentyp.name, [{ ...m, werte: ohnePasswoerter(mappentyp, m.werte) }], mappentyp, false),
  );
  for (const v of verweiseVon(mappentyp, m.werte)) {
    await l.listen.verweise.schreibe(
      csvZeile([m.id, mappentyp.felder.find((f) => f.key === v.feldKey)?.label ?? v.feldKey, v.feldKey, v.zielId, titel(v.zielId)]),
    );
    l.zahl.verweise++;
  }
  const dateiNamen = new Map<string, ReturnType<typeof namen>>();
  for (const d of p.dokJe.get(m.id) ?? []) {
    const reg = mappentyp.register.find((r) => r.key === d.registerKey)?.name ?? d.registerKey;
    const regName = sichererName(reg, 60);
    if (!dateiNamen.has(regName)) dateiNamen.set(regName, namen());
    const dn = dateiNamen.get(regName)!(d.name);
    await schreibeDokument(l, m, d, { regName, dn, pfad }, p);
  }
  await schreibeEintraege(l, m, p);
  if (l.opt.passwoerter) merkePasswoerter(l, mappentyp, m);
  l.weiter();
}

/**
 * Ablage: je Mappe ein Ordner. Dokumente, Volltexte, Versionen, Notizen, Aufgaben und Historie je Paket von Mappen in
 * einem Zugriff (#367) – nicht je Mappe oder Dokument.
 */
export async function schreibeAblage(l: ExportLauf, mappentyp: Mappentyp, ms: Mappe[], tOrdner: string) {
  const mOrdner = namen();
  for (let i = 0; i < ms.length; i += EXPORT_PAKET) {
    const paket = ms.slice(i, i + EXPORT_PAKET);
    const p = await ladePaket(
      l,
      paket.map((m) => m.id),
    );
    for (const m of paket) {
      const pfad = `ablage/${tOrdner}/${mOrdner(`${m.titel || t('meldungen.vollexport.ohne-titel')} [${m.id.slice(0, 8)}]`)}`;
      await schreibeMappe(l, mappentyp, m, pfad, p);
    }
  }
}
