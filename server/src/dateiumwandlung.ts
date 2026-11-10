/**
 * Dateien umwandeln (#577): Pakete mit dem Recht `dms:umwandeln` machen aus Dateien, die der Kern nicht selbst lesen
 * kann (z. B. TIFF, WebP, GIF, BMP), eine **Fassung** in einem Format, das er kennt (PDF, PNG oder JPEG).
 *
 * - Der Kern meldet solche Dateien mit dem Ereignis `datei.umwandeln` an das zuständige Paket (Dateitypen aus
 *   `code.umwandeln` im Manifest; bei mehreren das erste nach Id) – beim Hochladen, beim Nachholen der Vorschaubilder,
 *   bei „Volltext neu erzeugen“ und wenn ein solches Paket neu installiert wird.
 * - Das Paket liest das Original (`GET /dokumente/{id}/inhalt`) und gibt die Fassung zurück
 *   (`PUT /dokumente/{id}/fassung?sha256=…`), auf Wunsch auch ein Vorschaubild (`PUT /dokumente/{id}/vorschaubild`).
 * - Die Fassung gehört zum Inhalt (Prüfwert), nicht zum Dokument: Gleiche Dateien teilen sie, eine neue Version
 *   braucht eine neue. Das Original bleibt unverändert das Dokument.
 * - Seit 0.140.1 liegt sie **im Haushaltsordner** (`<haushalt>/fassungen/`) und geht mit in die Sicherung und den
 *   Vollexport (Maintainer-Entscheidung zu #577: Die Fassung wird weiterverarbeitet; nach einer Wiederherstellung soll
 *   alles so dastehen wie vorher – auch ohne das Paket oder mit einer neueren Fassung davon). Nur die Vorschaubilder
 *   bleiben draußen: Sie lassen sich jederzeit gleich neu erzeugen, und nichts verweist auf sie.
 * - Mit der Fassung entstehen Vorschaubild (vorschau.ts) und Volltext (texterkennung.ts: Textebene bzw. Paket
 *   Texterkennung) wie bei einem PDF oder Foto.
 */
import { execFile } from './hintergrund';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readdir, readFile, rename, rm, rmdir, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BILDPUNKTE_MAX, dateitypName, FASSUNG_MAX_BYTES, kernTyp, UMWANDELN_MAX_BYTES, VORSCHAUBILD_MAX_BYTES, type FassungInfo } from '../../shared/src/dateiumwandlung';
import type { Dokument } from '../../shared/src/model';
import { hatSchnittstelle, type InstalliertesPaket } from '../../shared/src/pakete';
import { Fachfehler } from './fehler';
import { protokoll } from './protokoll';
import { t } from './sprache';
import { AUSGABE_KLEIN, MB } from './grenzen';

const log = protokoll.modul('umwandlung');

/** Höchstens so viele Seiten hat eine Fassung als PDF (wie die Textebene im Kern). */
export const FASSUNG_SEITEN_MAX = 1000;
/** So lange gilt eine Meldung als unterwegs: Dieselbe Datei wird in der Zeit nicht noch einmal gemeldet. */
export const ANGEFORDERT_MS = 30 * 60_000;

/* ---------- Ablage ---------- */

/** Ordner der Fassungen im Haushaltsordner – damit gehen sie mit in die Sicherung (#577). */
export const FASSUNGEN_ORDNER = 'fassungen';
/** Pfad einer Fassung relativ zum Haushaltsordner (so steht er in der Sicherung): Prüfwert und Art der Datei. */
export const FASSUNG_PFAD = /^fassungen\/[0-9a-f]{2}\/([0-9a-f]{64})\.(json|fassung)$/;
/** Ordner der Fassungen eines Haushalts unter der Wurzel der Dateien (/data/files). */
export const fassungsOrdner = (dateiWurzel: string, haushalt: string) => join(dateiWurzel, haushalt, FASSUNGEN_ORDNER);

/**
 * Fassungen von ihrem früheren Ort (0.137.0–0.140.0: `<wurzel>/fassungen/<haushalt>`, außerhalb der Sicherung) in den
 * Haushaltsordner verschieben. Beim Start; mehrfach ausführbar. Liefert, wie viele Dateien umgezogen sind.
 */
export async function zieheFassungenUm(dateiWurzel: string, haushalt: string): Promise<number> {
  const alt = join(dateiWurzel, FASSUNGEN_ORDNER, haushalt);
  const neu = fassungsOrdner(dateiWurzel, haushalt);
  let n = 0;
  for (const o of await readdir(alt).catch(() => [] as string[])) {
    if (!/^[0-9a-f]{2}$/.test(o)) continue;
    for (const name of await readdir(join(alt, o)).catch(() => [] as string[])) {
      if (!/^[0-9a-f]{64}\.(json|fassung)$/.test(name)) continue;
      const ziel = join(neu, o, name);
      await mkdir(join(neu, o), { recursive: true });
      // Gibt es sie am neuen Ort schon, gilt die (neuer oder aus einer Wiederherstellung).
      if (await stat(ziel).then(() => true, () => false)) await rm(join(alt, o, name), { force: true });
      else { await rename(join(alt, o, name), ziel); n++; }
    }
  }
  // Leere Ordner entfernen (übrig gebliebene .tmp-Dateien eines Abbruchs mit).
  await rm(alt, { recursive: true, force: true }).catch(() => {});
  await rmdir(join(dateiWurzel, FASSUNGEN_ORDNER)).catch(() => {});
  if (n) log.info('Umgewandelte Fassungen in den Haushaltsordner verschoben (gehen jetzt mit in die Sicherung)', { dateien: n });
  return n;
}

export interface FassungsAblage {
  info(sha: string): Promise<FassungInfo | null>;
  lies(sha: string): Promise<{ info: FassungInfo; inhalt: Buffer } | null>;
  schreibe(sha: string, info: FassungInfo, inhalt: Buffer): Promise<void>;
  loesche(sha: string): Promise<void>;
  belegung(): Promise<{ anzahl: number; bytes: number }>;
}

const pruefeSha = (sha: string) => {
  if (!/^[0-9a-f]{64}$/.test(sha)) throw new Error('Ungültiger Prüfwert');
  return sha;
};

/** Dateisystem: <wurzel>/<ab>/<sha256>.json (Angaben) und <sha256>.fassung (Inhalt). */
export function ordnerFassungen(wurzel: string): FassungsAblage {
  const pfad = (sha: string, endung: 'json' | 'fassung') => join(wurzel, pruefeSha(sha).slice(0, 2), `${sha}.${endung}`);
  const lege = async (ziel: string, inhalt: Buffer | string) => {
    await mkdir(join(ziel, '..'), { recursive: true });
    const tmp = `${ziel}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(tmp, inhalt);
    await rename(tmp, ziel);
  };
  const info = async (sha: string) => {
    try { return JSON.parse(await readFile(pfad(sha, 'json'), 'utf8')) as FassungInfo; } catch { return null; }
  };
  return {
    info,
    async lies(sha) {
      const i = await info(sha);
      if (!i) return null;
      const inhalt = await readFile(pfad(sha, 'fassung')).catch(() => null);
      return inhalt ? { info: i, inhalt } : null;
    },
    async schreibe(sha, i, inhalt) {
      // Erst der Inhalt, dann die Angaben: Ohne Angaben gilt eine Fassung als nicht vorhanden.
      await lege(pfad(sha, 'fassung'), inhalt);
      await lege(pfad(sha, 'json'), JSON.stringify(i));
    },
    async loesche(sha) {
      await rm(pfad(sha, 'json'), { force: true });
      await rm(pfad(sha, 'fassung'), { force: true });
    },
    async belegung() {
      let anzahl = 0; let bytes = 0;
      for (const o of await readdir(wurzel).catch(() => [] as string[])) {
        for (const n of await readdir(join(wurzel, o)).catch(() => [] as string[])) {
          if (!n.endsWith('.fassung')) continue;
          const s = await stat(join(wurzel, o, n)).catch(() => null);
          if (s?.isFile()) { anzahl++; bytes += s.size; }
        }
      }
      return { anzahl, bytes };
    },
  };
}

/** Im Arbeitsspeicher (Tests). */
export function speicherFassungen(): FassungsAblage & { fassungen: Map<string, { info: FassungInfo; inhalt: Buffer }> } {
  const fassungen = new Map<string, { info: FassungInfo; inhalt: Buffer }>();
  return {
    fassungen,
    info: async (sha) => fassungen.get(sha)?.info ?? null,
    lies: async (sha) => fassungen.get(sha) ?? null,
    schreibe: async (sha, info, inhalt) => { fassungen.set(pruefeSha(sha), { info, inhalt }); },
    loesche: async (sha) => { fassungen.delete(sha); },
    belegung: async () => ({ anzahl: fassungen.size, bytes: [...fassungen.values()].reduce((s, f) => s + f.inhalt.length, 0) }),
  };
}

/* ---------- Prüfen, was ein Paket zurückgibt ---------- */

/** PDF, PNG oder JPEG – am Inhalt erkannt, nicht an der Angabe des Pakets. */
export function fassungsTyp(b: Buffer): string | null {
  if (b.subarray(0, 5).toString('latin1') === '%PDF-') return 'application/pdf';
  if (b.length >= 24 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  return null;
}

/** Breite und Höhe eines PNG (IHDR) oder JPEG (erster SOF-Abschnitt); null, wenn nicht lesbar. */
export function bildGroesse(b: Buffer, mime: string): { breite: number; hoehe: number } | null {
  if (mime === 'image/png') return b.subarray(12, 16).toString('latin1') === 'IHDR' ? { breite: b.readUInt32BE(16), hoehe: b.readUInt32BE(20) } : null;
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) return null;
    const marke = b[i + 1];
    if (marke === 0xff) { i++; continue; }
    if (marke === 0xd8 || marke === 0x01 || (marke >= 0xd0 && marke <= 0xd7)) { i += 2; continue; }
    const laenge = b.readUInt16BE(i + 2);
    // SOF0–SOF15 außer DHT (C4), JPG (C8) und DAC (CC)
    if (marke >= 0xc0 && marke <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marke)) return { hoehe: b.readUInt16BE(i + 5), breite: b.readUInt16BE(i + 7) };
    i += 2 + laenge;
  }
  return null;
}

/** Seitenzahl eines PDFs mit pdfinfo (poppler, im Image); null, wenn pdfinfo fehlt. Wirft bei einem kaputten PDF. */
async function pdfSeiten(inhalt: Buffer): Promise<number | null> {
  const dir = await mkdtemp(join(tmpdir(), 'dms-fassung-'));
  try {
    await writeFile(join(dir, 'f.pdf'), inhalt);
    return await new Promise<number | null>((ok, fehler) => {
      execFile('pdfinfo', [join(dir, 'f.pdf')], { timeout: 30_000, maxBuffer: AUSGABE_KLEIN }, (e, out, err) => {
        if (e && (e as NodeJS.ErrnoException).code === 'ENOENT') { ok(null); return; }
        const n = Number(/^Pages:\s+(\d+)/m.exec(String(out))?.[1]);
        if (e || !n) { fehler(new Fachfehler(422, t('pakete.fassung.pdf', { grund: String(err || (e as Error | null)?.message || '').trim().split('\n')[0].slice(0, 200) }))); return; }
        ok(n);
      });
    });
  } finally { await rm(dir, { recursive: true, force: true }); }
}

/** Fassung prüfen: Typ am Inhalt, Größe, Bildpunkte bzw. Seiten. Liefert den Typ und ggf. die Seitenzahl. */
export async function pruefeFassung(inhalt: unknown): Promise<{ mime: string; seiten: number | null }> {
  if (!Buffer.isBuffer(inhalt) || !inhalt.length) throw new Fachfehler(422, t('pakete.fassung.leer'));
  if (inhalt.length > FASSUNG_MAX_BYTES) throw new Fachfehler(413, t('pakete.fassung.gross', { mb: FASSUNG_MAX_BYTES / MB }));
  const mime = fassungsTyp(inhalt);
  if (!mime) throw new Fachfehler(415, t('pakete.fassung.typ'));
  if (mime !== 'application/pdf') {
    const g = bildGroesse(inhalt, mime);
    if (!g || !g.breite || !g.hoehe) throw new Fachfehler(422, t('pakete.fassung.bild'));
    if (g.breite * g.hoehe > BILDPUNKTE_MAX) throw new Fachfehler(422, t('pakete.fassung.punkte', { breite: g.breite, hoehe: g.hoehe, max: BILDPUNKTE_MAX / 1_000_000 }));
    return { mime, seiten: 1 };
  }
  const seiten = await pdfSeiten(inhalt);
  if (seiten !== null && seiten > FASSUNG_SEITEN_MAX) throw new Fachfehler(422, t('pakete.fassung.seiten', { seiten, max: FASSUNG_SEITEN_MAX }));
  return { mime, seiten };
}

/* ---------- Ablauf ---------- */

/** Ein Paket, das Dateien umwandelt: Id, Name, Version und seine Dateitypen. */
export interface UmwandelPaket { id: string; name: string; version: string; typen: string[] }

export interface UmwandlungsAnbindung {
  ablage: FassungsAblage;
  /** Installierte Pakete. */
  pakete(): Promise<InstalliertesPaket[]>;
  /** Ereignis `datei.umwandeln` an genau dieses Paket (Ausgangskorb des Läufers). */
  /** „gesperrt“ (#796): KI-Sperre für den Mappentyp dieses Dokuments – nichts ging an das Paket. */
  melde(paket: string, daten: Record<string, unknown>): Promise<'gesperrt' | void>;
  /** Alle Dokumente mit dieser Datei (gleicher Prüfwert). */
  dokumenteMitSha(sha: string): Promise<Dokument[]>;
  /** Nach einer neuen Fassung: Vorschaubild, Volltext und Historie (Dienst). */
  nachFassung?(dokumente: Dokument[], info: FassungInfo): Promise<void>;
  /** Vorschaubild eines Pakets übernehmen (verkleinert wie im Kern). */
  vorschaubild?(sha: string, bild: Buffer, mime: string): Promise<void>;
}

export class Dateiumwandlung {
  /** Prüfwert → Zeit der Meldung: Dieselbe Datei geht so lange nicht noch einmal an das Paket. */
  private angefordert = new Map<string, number>();
  /** Prüfwerte, deren Dokumente alle in Mappentypen liegen, die nicht an das Paket dürfen (#796). */
  private gesperrtSha = new Set<string>();

  constructor(private o: UmwandlungsAnbindung) {}

  /** Alle installierten Pakete mit `dms:umwandeln`, nach Id. */
  async pakete(): Promise<UmwandelPaket[]> {
    return (await this.o.pakete())
      .filter((p) => hatSchnittstelle(p.laeufer, 'dms:umwandeln') && p.laeufer?.umwandeln?.length)
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((p) => ({ id: p.id, name: p.name, version: p.version, typen: p.laeufer!.umwandeln! }));
  }

  /** Das zuständige Paket für einen Dateityp (bei mehreren das erste nach Id) oder null. */
  async paketFuer(mime: string, liste?: UmwandelPaket[]): Promise<UmwandelPaket | null> {
    if (kernTyp(mime)) return null;
    return (liste ?? await this.pakete()).find((p) => p.typen.includes(mime)) ?? null;
  }

  info(sha: string) { return this.o.ablage.info(sha).catch(() => null); }
  /** Ging die Datei beim letzten Versuch wegen der KI-Sperre nicht an das Paket (#796)? */
  gesperrt(sha: string) { return this.gesperrtSha.has(sha); }
  lies(sha: string) { return this.o.ablage.lies(sha).catch(() => null); }
  belegung() { return this.o.ablage.belegung(); }

  /**
   * Dateien an die zuständigen Pakete melden (`datei.umwandeln`) – nur, wenn es noch keine Fassung gibt und die Datei
   * nicht gerade unterwegs ist. `erneut`: auch mit Fassung (z. B. nach einem Update des Pakets). Liefert, wie viele
   * Meldungen hinausgingen.
   */
  async anfordern(docs: Array<Pick<Dokument, 'id' | 'mappeId' | 'name' | 'mime' | 'groesse' | 'sha256'>>, o: { erneut?: boolean } = {}): Promise<number> {
    const liste = await this.pakete();
    if (!liste.length) return 0;
    const jetzt = Date.now();
    for (const [sha, zeit] of this.angefordert) if (jetzt - zeit > ANGEFORDERT_MS) this.angefordert.delete(sha);
    let n = 0;
    const gesehen = new Set<string>();
    for (const d of docs) {
      if (gesehen.has(d.sha256) || d.groesse > UMWANDELN_MAX_BYTES) continue;
      gesehen.add(d.sha256);
      const p = await this.paketFuer(d.mime, liste);
      if (!p) continue;
      if (!o.erneut && (this.angefordert.has(d.sha256) || (await this.info(d.sha256)))) continue;
      this.angefordert.set(d.sha256, jetzt);
      // KI-Sperre (#796): Die Fassung gilt für alle Dokumente mit dieser Datei. Ist der Typ dieses Dokuments gesperrt,
      // geht der Auftrag über ein anderes Dokument derselben Datei in einem zugelassenen Typ; gibt es keins, nichts.
      const kandidaten = [d, ...(await this.o.dokumenteMitSha(d.sha256).catch(() => [])).filter((x) => x.id !== d.id)];
      let gemeldet = false;
      for (const x of kandidaten) {
        if ((await this.o.melde(p.id, { dokument: x.id, mappe: x.mappeId, name: x.name, mime: x.mime, groesse: x.groesse, sha256: x.sha256 })) !== 'gesperrt') { gemeldet = true; break; }
      }
      if (!gemeldet) { this.angefordert.delete(d.sha256); this.gesperrtSha.add(d.sha256); continue; }
      this.gesperrtSha.delete(d.sha256);
      n++;
    }
    if (n) log.info('Dateien zum Umwandeln gemeldet', { dateien: n });
    return n;
  }

  /** Darf dieses Paket diese Datei umwandeln? Sonst 403 mit Grund. */
  private async zustaendig(paket: { id: string; schnittstellen?: string[] } | undefined, d: Dokument): Promise<UmwandelPaket> {
    if (!paket) throw new Fachfehler(403, t('pakete.fassung.nur-pakete'));
    if (!paket.schnittstellen?.includes('dms:umwandeln')) throw new Fachfehler(403, t('pakete.fassung.recht'));
    const p = (await this.pakete()).find((x) => x.id === paket.id);
    if (!p || !p.typen.includes(d.mime)) throw new Fachfehler(403, t('pakete.fassung.typ-fremd', { typ: d.mime }));
    return p;
  }

  /** Stimmt der Prüfwert noch (das Paket hat die Datei gelesen, die das Dokument jetzt hat)? */
  private static pruefeStand(d: Dokument, sha: unknown) {
    if (typeof sha !== 'string' || !/^[0-9a-f]{64}$/.test(sha)) throw new Fachfehler(422, t('pakete.fassung.sha'));
    if (sha !== d.sha256) throw new Fachfehler(409, t('pakete.fassung.version'));
  }

  /** Fassung eines Pakets übernehmen (PUT /dokumente/{id}/fassung). */
  async setzeFassung(paket: { id: string; schnittstellen?: string[] } | undefined, d: Dokument, sha: unknown, inhalt: unknown): Promise<FassungInfo & { seiten: number | null }> {
    const p = await this.zustaendig(paket, d);
    Dateiumwandlung.pruefeStand(d, sha);
    const { mime, seiten } = await pruefeFassung(inhalt);
    const b = inhalt as Buffer;
    const info: FassungInfo = { mime, groesse: b.length, sha256: createHash('sha256').update(b).digest('hex'), paket: { id: p.id, name: p.name, version: p.version }, erstellt: new Date().toISOString() };
    await this.o.ablage.schreibe(d.sha256, info, b);
    this.angefordert.delete(d.sha256);
    log.info('Fassung gespeichert', { dokument: d.id, typ: d.mime, fassung: mime, bytes: b.length, seiten, paket: p.id });
    const alle = await this.o.dokumenteMitSha(d.sha256);
    await this.o.nachFassung?.(alle.length ? alle : [d], info);
    return { ...info, seiten };
  }

  /** Vorschaubild eines Pakets übernehmen (PUT /dokumente/{id}/vorschaubild): JPEG oder PNG, der Kern verkleinert es. */
  async setzeVorschaubild(paket: { id: string; schnittstellen?: string[] } | undefined, d: Dokument, sha: unknown, inhalt: unknown): Promise<{ dokument: string; mime: string; groesse: number }> {
    await this.zustaendig(paket, d);
    Dateiumwandlung.pruefeStand(d, sha);
    if (!Buffer.isBuffer(inhalt) || !inhalt.length) throw new Fachfehler(422, t('pakete.fassung.leer'));
    if (inhalt.length > VORSCHAUBILD_MAX_BYTES) throw new Fachfehler(413, t('pakete.vorschaubild.gross', { mb: VORSCHAUBILD_MAX_BYTES / MB }));
    const mime = fassungsTyp(inhalt);
    if (mime !== 'image/png' && mime !== 'image/jpeg') throw new Fachfehler(415, t('pakete.vorschaubild.typ'));
    const g = bildGroesse(inhalt, mime);
    if (!g || !g.breite || !g.hoehe || g.breite * g.hoehe > BILDPUNKTE_MAX) throw new Fachfehler(422, t('pakete.fassung.bild'));
    if (!this.o.vorschaubild) throw new Fachfehler(503, t('pakete.vorschaubild.aus'));
    try { await this.o.vorschaubild(d.sha256, inhalt, mime); } catch (e) { throw new Fachfehler(422, t('pakete.vorschaubild.fehler', { grund: (e as Error).message.slice(0, 200) })); }
    log.info('Vorschaubild eines Pakets gespeichert', { dokument: d.id, typ: d.mime, paket: paket?.id });
    return { dokument: d.id, mime: 'image/jpeg', groesse: inhalt.length };
  }

  /** Das Paket ist mit der Meldung fertig (oder hat aufgegeben): Die Datei darf wieder gemeldet werden. */
  erledigt(sha: string) { this.angefordert.delete(sha); }

  /** Datei gelöscht (kein Dokument zeigt mehr darauf): Fassung mit weg. */
  async entferne(sha: string) {
    this.angefordert.delete(sha);
    await this.o.ablage.loesche(sha).catch(() => {});
  }

  /** Name des Dateityps für Hinweise. */
  static name(mime: string) { return dateitypName(mime); }
}

