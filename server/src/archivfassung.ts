/**
 * Archivfassung (PDF/A) für Pakete (#631): Pakete mit dem Recht `dms:archivfassung` legen zu Dokumenten ein
 * durchsuchbares PDF/A ab. Maintainer-Entscheidung (Frage 32, Variante A): eigene Archivfassung im Kern, getrennt von
 * der Lesefassung aus `dms:umwandeln` (#577).
 *
 * - **Zeitpunkt:** Der Kern meldet ein Dokument mit `datei.archivfassung` erst, wenn sein **Volltext feststeht** (Stand
 *   *fertig*) – beim Hochladen, bei einer neuen Version, bei „Volltext neu erzeugen“ bzw. neuem Text eines Pakets
 *   (`neu`) und nach der Installation des Pakets für den Bestand. Welche Dokumente, kreuzt der Administrator an
 *   (#660, `code.archivfassung.auswahl`: PDFs mit Text, gescannte PDFs, Bilder – ohne Angabe alle). Ist das Original schon gültiges
 *   PDF/A, gilt es selbst als Archivfassung (keine zweite Datei); verschlüsselte PDFs bekommen keine (Grund am Dokument).
 * - **Nie nachladen:** Die Archivfassung enthält nur, was in der Datei steckt – kein JavaScript, keine Aktionen, keine
 *   Verweise auf externe Inhalte (sonst abgelehnt). Hatte das Original welche, steht ein Hinweis am Dokument; die
 *   Adressen nur im Protokoll.
 * - **Quelle:** PDF, JPEG und PNG liest das Paket im Original; andere Typen (TIFF …) nur über die vorhandene
 *   Lesefassung (`GET /dokumente/{id}/fassung`) – kein zweiter Bildleser. E-Mails (#946, Art `emails`) liest das
 *   Paket im Original und setzt die Seiten selbst; sie werden auch ohne Volltext gemeldet (ohne Paket, das ihn liefert,
 *   gilt er als feststehend und leer) und brauchen keine Wortpositionen.
 * - **Wortpositionen** (Frage 33, „genau an den Wörtern“): `GET /dokumente/{id}/wortpositionen` – Wörter mit Lage aus
 *   der Textebene bzw. aus der Texterkennung (die sie mit `PUT …/volltext` als `woerter` schickt).
 * - **Annahme:** `PUT /dokumente/{id}/archivfassung?sha256=…` nimmt nur PDF mit PDF/A-Kennung (Grundprüfung); sonst
 *   steht der Grund am Dokument und in der Werkbank.
 * - **Ablage:** im Haushaltsordner (`<haushalt>/archivfassungen/<ab>/<sha256 des Originals>.fassung`, `.json`, Stand
 *   in `.stand`; Wortpositionen unter `<haushalt>/wortpositionen/`) – damit in Sicherung und Vollexport. Kein Zustand,
 *   den die Richtigkeit braucht, liegt nur im Arbeitsspeicher: Stand in Dateien, Ereignisse im Ausgangskorb der
 *   Datenbank (mindestens einmal); das Paket erkennt Wiederholungen am Prüfwert.
 */
import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import {
  ARCHIV_QUELLE_MAX_BYTES, ARCHIVFASSUNG_MAX_BYTES, ARCHIVFASSUNG_SEITEN_MAX, MAIL_TYPEN, mailTyp, PDFA_STUFEN, PDFA_TEILE, pdfaKennungAus, pdfaName,
  type ArchivfassungInfo, type ArchivStand, type ArchivStandArt, type PdfaKennung, type WortSeite,
} from '../../shared/src/archivfassung';
import { dateitypName, kernTyp, type FassungInfo } from '../../shared/src/dateiumwandlung';
import type { Dokument } from '../../shared/src/model';
import { hatSchnittstelle, type ArchivArt, type ArchivAuswahl, type InstalliertesPaket } from '../../shared/src/pakete';
import { zeitzone } from '../../shared/src/region';
import type { SchwaerzSeite, Wort } from '../../shared/src/schwaerzen';
import { bildGroesse, ordnerFassungen } from './dateiumwandlung';
import { Fachfehler } from './fehler';
import { protokoll } from './protokoll';
import { t } from './sprache';
import type { PdfaBefund } from './pdf';
import { MB } from './grenzen';

const log = protokoll.modul('archivfassung');

/** So lange gilt eine Meldung als unterwegs: Dieselbe Datei geht in der Zeit nicht noch einmal an das Paket (außer `neu`). */
export const ARCHIV_ANGEFORDERT_MS = 30 * 60_000;

/* ---------- Ablage ---------- */

export const ARCHIV_ORDNER = 'archivfassungen';
export const WOERTER_ORDNER = 'wortpositionen';
/** Pfad einer Archivfassung relativ zum Haushaltsordner (so steht er in der Sicherung): Prüfwert des Originals und Art. */
export const ARCHIV_PFAD = /^archivfassungen\/[0-9a-f]{2}\/([0-9a-f]{64})\.(json|fassung|stand)$/;
/** Pfad der Wortpositionen einer Datei relativ zum Haushaltsordner. */
export const WOERTER_PFAD = /^wortpositionen\/[0-9a-f]{2}\/([0-9a-f]{64})\.json\.gz$/;
export const archivOrdner = (dateiWurzel: string, haushalt: string) => join(dateiWurzel, haushalt, ARCHIV_ORDNER);
export const woerterOrdner = (dateiWurzel: string, haushalt: string) => join(dateiWurzel, haushalt, WOERTER_ORDNER);

/** Stand einer Datei, solange es keine (neue) Archivfassung gibt: wartet, ausgelassen oder Fehler. */
export interface ArchivStandDatei { stand: Exclude<ArchivStandArt, 'fertig'>; info: string | null; paket: { id: string; name: string; version?: string } | null; zeit: string }
/** Wortpositionen aus der Texterkennung: je Seite des Volltexts die Wörter oder null. */
export interface GespeicherteWoerter { seiten: Array<Wort[] | null>; von: string; erstellt: string }

export interface ArchivAblage {
  info(sha: string): Promise<ArchivfassungInfo | null>;
  lies(sha: string): Promise<{ info: ArchivfassungInfo; inhalt: Buffer } | null>;
  schreibe(sha: string, info: ArchivfassungInfo, inhalt: Buffer): Promise<void>;
  /** Nur die Angaben (das Original ist schon PDF/A – kein eigener Inhalt); eine frühere Archivfassung fällt weg. */
  schreibeInfo(sha: string, info: ArchivfassungInfo): Promise<void>;
  /** Archivfassung, Stand und Wortpositionen der Datei entfernen (Datei gelöscht). */
  loesche(sha: string): Promise<void>;
  belegung(): Promise<{ anzahl: number; bytes: number }>;
  /** Prüfwerte aller Dateien mit Archivfassung (auch „Original ist schon PDF/A“) – für den Nachlauf der Vorschaubilder (#1216). */
  alle(): Promise<string[]>;
  stand(sha: string): Promise<ArchivStandDatei | null>;
  setzeStand(sha: string, s: ArchivStandDatei | null): Promise<void>;
  /** Alle Stände (wartet, ausgelassen, Fehler) – für die Werkbank. */
  staende(): Promise<Array<{ sha256: string; stand: ArchivStandDatei }>>;
  woerter(sha: string): Promise<GespeicherteWoerter | null>;
  setzeWoerter(sha: string, w: GespeicherteWoerter | null): Promise<void>;
}

const pruefeSha = (sha: string) => {
  if (!/^[0-9a-f]{64}$/.test(sha)) throw new Error('Ungültiger Prüfwert');
  return sha;
};
const lege = async (ziel: string, inhalt: Buffer | string) => {
  await mkdir(join(ziel, '..'), { recursive: true });
  const tmp = `${ziel}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmp, inhalt);
  await rename(tmp, ziel);
};

/** Dateisystem: Archivfassung wie eine Fassung (#577: .json und .fassung), dazu .stand und die Wortpositionen (gzip). */
export function ordnerArchiv(wurzel: string, woerterWurzel: string): ArchivAblage {
  const f = ordnerFassungen(wurzel);
  const standPfad = (sha: string) => join(wurzel, pruefeSha(sha).slice(0, 2), `${sha}.stand`);
  const woerterPfad = (sha: string) => join(woerterWurzel, pruefeSha(sha).slice(0, 2), `${sha}.json.gz`);
  const stand = async (sha: string) => {
    try { return JSON.parse(await readFile(standPfad(sha), 'utf8')) as ArchivStandDatei; } catch { return null; }
  };
  return {
    info: (sha) => f.info(sha) as unknown as Promise<ArchivfassungInfo | null>,
    lies: (sha) => f.lies(sha) as unknown as Promise<{ info: ArchivfassungInfo; inhalt: Buffer } | null>,
    schreibe: (sha, info, inhalt) => f.schreibe(sha, info as unknown as FassungInfo, inhalt),
    async schreibeInfo(sha, info) {
      await rm(join(wurzel, pruefeSha(sha).slice(0, 2), `${sha}.fassung`), { force: true });
      await lege(join(wurzel, sha.slice(0, 2), `${sha}.json`), JSON.stringify(info));
    },
    async loesche(sha) {
      await f.loesche(sha);
      await rm(standPfad(sha), { force: true });
      await rm(woerterPfad(sha), { force: true });
    },
    belegung: () => f.belegung(),
    async alle() {
      const erg: string[] = [];
      for (const o of await readdir(wurzel).catch(() => [] as string[])) {
        for (const n of await readdir(join(wurzel, o)).catch(() => [] as string[])) {
          const m = /^([0-9a-f]{64})\.json$/.exec(n);
          if (m) erg.push(m[1]);
        }
      }
      return erg;
    },
    stand,
    async setzeStand(sha, s) {
      if (s) await lege(standPfad(sha), JSON.stringify(s));
      else await rm(standPfad(sha), { force: true });
    },
    async staende() {
      const erg: Array<{ sha256: string; stand: ArchivStandDatei }> = [];
      for (const o of await readdir(wurzel).catch(() => [] as string[])) {
        for (const n of await readdir(join(wurzel, o)).catch(() => [] as string[])) {
          const m = /^([0-9a-f]{64})\.stand$/.exec(n);
          const s = m ? await stand(m[1]) : null;
          if (m && s) erg.push({ sha256: m[1], stand: s });
        }
      }
      return erg;
    },
    async woerter(sha) {
      try { return JSON.parse(gunzipSync(await readFile(woerterPfad(sha))).toString('utf8')) as GespeicherteWoerter; } catch { return null; }
    },
    async setzeWoerter(sha, w) {
      if (w) await lege(woerterPfad(sha), gzipSync(JSON.stringify(w)));
      else await rm(woerterPfad(sha), { force: true });
    },
  };
}

/** Im Arbeitsspeicher (Tests). */
export function speicherArchiv(): ArchivAblage & { fassungen: Map<string, { info: ArchivfassungInfo; inhalt: Buffer }> } {
  const fassungen = new Map<string, { info: ArchivfassungInfo; inhalt: Buffer }>();
  const staende = new Map<string, ArchivStandDatei>();
  const woerter = new Map<string, GespeicherteWoerter>();
  return {
    fassungen,
    info: async (sha) => fassungen.get(sha)?.info ?? null,
    lies: async (sha) => fassungen.get(sha) ?? null,
    schreibe: async (sha, info, inhalt) => { fassungen.set(pruefeSha(sha), { info, inhalt }); },
    schreibeInfo: async (sha, info) => { fassungen.set(pruefeSha(sha), { info, inhalt: Buffer.alloc(0) }); },
    loesche: async (sha) => { fassungen.delete(sha); staende.delete(sha); woerter.delete(sha); },
    belegung: async () => ({ anzahl: fassungen.size, bytes: [...fassungen.values()].reduce((s, f) => s + f.inhalt.length, 0) }),
    alle: async () => [...fassungen.keys()],
    stand: async (sha) => staende.get(sha) ?? null,
    setzeStand: async (sha, s) => { if (s) staende.set(pruefeSha(sha), s); else staende.delete(sha); },
    staende: async () => [...staende.entries()].map(([sha256, stand]) => ({ sha256, stand })),
    woerter: async (sha) => woerter.get(sha) ?? null,
    setzeWoerter: async (sha, w) => { if (w) woerter.set(pruefeSha(sha), w); else woerter.delete(sha); },
  };
}

/* ---------- Prüfen, was ein Paket zurückgibt ---------- */

/** Nennenswerter Text auf einer Seite (wie die Texterkennung: mindestens 20 Zeichen ohne Leerraum). */
const mitText = (s: { woerter: Wort[] } | undefined | null) => !!s && s.woerter.map((w) => w[0]).join('').replace(/\s/g, '').length >= 20;

/**
 * Archivfassung prüfen (Grundprüfung, keine neue Abhängigkeit): PDF am Inhalt, Größe, lesbar, nicht verschlüsselt,
 * höchstens 1000 Seiten, XMP-Metadaten ungefiltert mit gültiger PDF/A-Kennung. Wirft einen Fachfehler mit Grund.
 */
export async function pruefeArchivfassung(inhalt: unknown, lies: (pdf: Buffer) => Promise<PdfaBefund>): Promise<{ seiten: number; pdfa: PdfaKennung }> {
  if (!Buffer.isBuffer(inhalt) || !inhalt.length) throw new Fachfehler(422, t('pakete.archiv.leer'));
  if (inhalt.length > ARCHIVFASSUNG_MAX_BYTES) throw new Fachfehler(413, t('pakete.archiv.gross', { mb: ARCHIVFASSUNG_MAX_BYTES / MB }));
  if (inhalt.subarray(0, 5).toString('latin1') !== '%PDF-') throw new Fachfehler(415, t('pakete.archiv.typ'));
  return bewertePdfA(await lies(inhalt));
}

/** Befund eines PDFs als PDF/A bewerten: Kennung und Seiten – oder ein Fachfehler (422) mit Grund. */
export function bewertePdfA(b: PdfaBefund): { seiten: number; pdfa: PdfaKennung } {
  if (!b.lesbar) throw new Fachfehler(422, t('pakete.archiv.lesbar'));
  if (b.verschluesselt) throw new Fachfehler(422, t('pakete.archiv.verschluesselt'));
  if (!b.seiten) throw new Fachfehler(422, t('pakete.archiv.ohne-seiten'));
  if (b.seiten > ARCHIVFASSUNG_SEITEN_MAX) throw new Fachfehler(422, t('pakete.archiv.seiten', { seiten: b.seiten, max: ARCHIVFASSUNG_SEITEN_MAX }));
  if (b.metadaten === null) throw new Fachfehler(422, b.gefiltert ? t('pakete.archiv.gefiltert') : t('pakete.archiv.ohne-xmp'));
  if (b.gefiltert) throw new Fachfehler(422, t('pakete.archiv.gefiltert'));
  const k = pdfaKennungAus(b.metadaten);
  if (!k) throw new Fachfehler(422, t('pakete.archiv.ohne-kennung'));
  if (!(PDFA_TEILE as readonly number[]).includes(k.teil)) throw new Fachfehler(422, t('pakete.archiv.teil', { teil: String(k.teil) }));
  if (k.teil !== 4 && !k.stufe) throw new Fachfehler(422, t('pakete.archiv.ohne-stufe', { teil: k.teil }));
  if (k.stufe && !PDFA_STUFEN[k.teil].includes(k.stufe)) throw new Fachfehler(422, t('pakete.archiv.stufe', { stufe: k.stufe, teil: k.teil, erlaubt: PDFA_STUFEN[k.teil].join(', ') }));
  // Nie nachladen: nichts, was beim Öffnen etwas ausführt, sendet oder aus dem Netz holt.
  if (b.javascript) throw new Fachfehler(422, t('pakete.archiv.javascript'));
  if (b.aktionen.length) throw new Fachfehler(422, t('pakete.archiv.aktionen', { aktionen: b.aktionen.join(', ') }));
  if (b.extern.length) throw new Fachfehler(422, t('pakete.archiv.extern', { anzahl: b.extern.length }));
  return { seiten: b.seiten, pdfa: k };
}

/* ---------- Ablauf ---------- */

/** Ein Paket mit dms:archivfassung: Id, Name, Version, Dateitypen und ggf. je Art die Einstellung, ob sie eine Archivfassung bekommt (#660). */
export interface ArchivPaket { id: string; name: string; version: string; typen: string[]; auswahl?: ArchivAuswahl }

export interface ArchivAnbindung {
  ablage: ArchivAblage;
  pakete(): Promise<InstalliertesPaket[]>;
  /** Wert einer Einstellung des Pakets (gespeichert oder Vorgabe aus dem Manifest). */
  einstellung(paket: string, schluessel: string): Promise<unknown>;
  /** Ereignis `datei.archivfassung` an genau dieses Paket (Ausgangskorb des Läufers). */
  /** „gesperrt“ (#796): KI-Sperre für den Mappentyp dieses Dokuments – nichts ging an das Paket. */
  melde(paket: string, daten: Record<string, unknown>): Promise<'gesperrt' | void>;
  dokumenteMitSha(sha: string): Promise<Dokument[]>;
  dokumenteMitTyp(mimes: string[]): Promise<Dokument[]>;
  /** Lesefassung aus dms:umwandeln (#577) für Typen, die der Kern nicht liest. */
  lesefassung(sha: string): Promise<{ info: FassungInfo; inhalt: Buffer } | null>;
  datei(sha: string): Promise<Buffer>;
  /** Wörter mit Lage aus der Textebene eines PDFs (null ohne poppler / unlesbar). */
  textebene(pdf: Buffer): Promise<SchwaerzSeite[] | null>;
  liesPdfA(pdf: Buffer): Promise<PdfaBefund>;
  /** Eintrag in der Historie der Mappe (als Dienstkonto des Pakets). */
  notiere(d: Dokument, paket: string, daten: { dokument: string; text: string } & Record<string, unknown>): Promise<void>;
}

/** Woraus das Paket die Archivfassung macht: das Original (PDF, JPEG, PNG) oder die Lesefassung. */
interface Quelle { art: 'original' | 'lesefassung'; mime: string; inhalt: () => Promise<Buffer>; fassung?: FassungInfo }

export class Archivfassung {
  /** Prüfwert → Zeit der Meldung (nur Drosselung; der Stand liegt in der Ablage, das Ereignis in der Datenbank). */
  private angefordert = new Map<string, number>();

  constructor(private o: ArchivAnbindung) {}

  /** Alle installierten Pakete mit dms:archivfassung, nach Id. */
  async pakete(): Promise<ArchivPaket[]> {
    return (await this.o.pakete())
      .filter((p) => hatSchnittstelle(p.laeufer, 'dms:archivfassung') && p.laeufer?.archivfassung?.typen.length)
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((p) => ({ id: p.id, name: p.name, version: p.version, typen: p.laeufer!.archivfassung!.typen, ...(p.laeufer!.archivfassung!.auswahl ? { auswahl: p.laeufer!.archivfassung!.auswahl } : {}) }));
  }

  /**
   * Das zuständige Paket für einen Dateityp (bei mehreren das erste nach Id; ohne Rücksicht auf Groß- und
   * Kleinschreibung). E-Mails (#946): `application/octet-stream` nur mit der Endung `.eml`/`.msg` (`name`) – dann
   * zählt auch ein Paket, das nur `message/rfc822` bzw. `application/vnd.ms-outlook` nennt; ohne passende Endung nie.
   */
  async paketFuer(mime: string, liste?: ArchivPaket[], name?: string | null): Promise<ArchivPaket | null> {
    const m = mime.toLowerCase();
    const mail = mailTyp(m, name);
    if (m === 'application/octet-stream' && !mail) return null;
    return (liste ?? await this.pakete()).find((p) => p.typen.includes(m) || (!!mail && p.typen.includes(mail))) ?? null;
  }

  info(sha: string) { return this.o.ablage.info(sha).catch(() => null); }
  /** Archivfassung mit Inhalt; ist das Original schon PDF/A, dessen Inhalt. */
  async lies(sha: string): Promise<{ info: ArchivfassungInfo; inhalt: Buffer } | null> {
    const info = await this.info(sha);
    if (info?.imOriginal) return { info, inhalt: await this.o.datei(sha) };
    return this.o.ablage.lies(sha).catch(() => null);
  }
  belegung() { return this.o.ablage.belegung(); }
  /** Prüfwerte aller Dateien mit Archivfassung (#1216). */
  alle() { return this.o.ablage.alle().catch(() => [] as string[]); }

  /** Quelle der Archivfassung: PDF, JPEG, PNG und E-Mails (#946) im Original, sonst die Lesefassung (#577) – oder null. */
  private async quelle(d: Pick<Dokument, 'mime' | 'sha256' | 'name'>): Promise<Quelle | null> {
    const m = d.mime.toLowerCase();
    if (mailTyp(m, d.name)) return { art: 'original', mime: m, inhalt: () => this.o.datei(d.sha256) };
    // Geschütztes PDF mit entsperrter Fassung (#827): die ist die Quelle – das Paket liest sie über /fassung.
    if (m === 'application/pdf') {
      const e = await this.o.lesefassung(d.sha256).catch(() => null);
      if (e?.info.entsperrt) return { art: 'lesefassung', mime: e.info.mime, inhalt: async () => e.inhalt, fassung: e.info };
    }
    if (kernTyp(m)) return { art: 'original', mime: m, inhalt: () => this.o.datei(d.sha256) };
    const f = await this.o.lesefassung(d.sha256).catch(() => null);
    return f ? { art: 'lesefassung', mime: f.info.mime, inhalt: async () => f.inhalt, fassung: f.info } : null;
  }

  /** Stand der Archivfassung eines Dokuments (null: nichts – kein Paket dran, keine Fassung). */
  async stand(d: Pick<Dokument, 'sha256' | 'mime' | 'ocr'>): Promise<ArchivStand | null> {
    const [info, s] = await Promise.all([this.info(d.sha256), this.o.ablage.stand(d.sha256).catch(() => null)]);
    if (info) {
      // Eine vorhandene Archivfassung gilt; ein neuerer Versuch steht als Hinweis daneben.
      const hinweis = s ? (s.stand === 'wartet' ? t('pakete.archiv.stand.neu', { paket: s.paket?.name ?? '' }) : s.info) : null;
      return { stand: 'fertig', info: hinweis, paket: info.paket, zeit: info.erstellt, fassung: info };
    }
    if (s) return { stand: s.stand, info: s.info, paket: s.paket, zeit: s.zeit };
    // Mit Passwort geschützte PDFs haben keinen Volltext und keine Archivfassung – der Grund steht am Dokument.
    if (d.mime === 'application/pdf' && d.ocr?.stand === 'ausgelassen' && /Passwort/i.test(d.ocr.info ?? '') && (await this.paketFuer(d.mime))) {
      return { stand: 'ausgelassen', info: t('pakete.archiv.verschluesselt-original'), paket: null, zeit: '' };
    }
    return null;
  }

  /**
   * Ein Dokument mit fertigem Volltext an das zuständige Paket melden (`datei.archivfassung`). Nur mit Quelle, bis
   * 50 MB, ohne vorhandene Archivfassung (außer `neu`), PDFs mit vollständiger Textebene nur mit der Einstellung des
   * Pakets. E-Mails (#946) auch mit ausgelassenem Volltext (kein Paket liefert ihn – er steht damit fest, leer); mit
   * einem Paket für den Volltext warten sie wie alle anderen, bis er da ist. Der Stand „wartet“ steht in der Ablage,
   * bevor das Ereignis hinausgeht. Liefert, ob gemeldet wurde.
   */
  async anfordern(d: Dokument, o: { neu?: boolean; liste?: ArchivPaket[] } = {}): Promise<boolean> {
    const mail = mailTyp(d.mime, d.name);
    if (d.ocr?.stand !== 'fertig' && !(mail && d.ocr?.stand === 'ausgelassen')) return false;
    const p = await this.paketFuer(d.mime, o.liste, d.name);
    if (!p) return false;
    const jetzt = Date.now();
    for (const [sha, zeit] of this.angefordert) if (jetzt - zeit > ARCHIV_ANGEFORDERT_MS) this.angefordert.delete(sha);
    if (!o.neu && this.angefordert.has(d.sha256)) return false;
    if (!o.neu && (await this.info(d.sha256))) return false;
    const q = await this.quelle(d);
    if (!q || d.groesse > ARCHIV_QUELLE_MAX_BYTES) return false;
    const paket = { id: p.id, name: p.name, version: p.version };
    const jetztIso = new Date().toISOString();
    // Auswahl im Paket (#660): Ist die Art abgewählt, bleibt das Dokument ruhig „ausgelassen – laut Einstellung“.
    const abgewaehlt = async (art: ArchivArt) => {
      const k = p.auswahl?.[art];
      if (!k || (await this.o.einstellung(p.id, k).catch(() => true)) === true) return false;
      await this.o.ablage.setzeStand(d.sha256, { stand: 'ausgelassen', info: t('pakete.archiv.laut-einstellung', { art: t(({ pdf_text: 'pakete.archiv.art.pdfText', pdf_scan: 'pakete.archiv.art.pdfScan', bilder: 'pakete.archiv.art.bilder', emails: 'pakete.archiv.art.emails' } as const)[art]) }), paket, zeit: jetztIso });
      return true;
    };
    if (mail ? await abgewaehlt('emails') : d.mime.toLowerCase() !== 'application/pdf' && (await abgewaehlt('bilder'))) return false;
    // Textebene (PDF): vollständig, teilweise (gemischt) oder keine.
    let textebene: 'voll' | 'teilweise' | 'keine' = 'keine';
    let seiten: SchwaerzSeite[] | null = null;
    let befund: PdfaBefund | null = null;
    if (q.mime === 'application/pdf') {
      const pdf = await q.inhalt();
      befund = await this.o.liesPdfA(pdf).catch(() => null);
      // Verschlüsselt: keine Archivfassung, das Original bleibt die Ansicht; der Grund steht am Dokument.
      if (befund?.verschluesselt) {
        await this.o.ablage.setzeStand(d.sha256, { stand: 'ausgelassen', info: t('pakete.archiv.verschluesselt-original'), paket, zeit: jetztIso });
        return false;
      }
      // Schon gültiges PDF/A (nur das Original selbst): Es gilt als Archivfassung – keine zweite Datei, kein Ereignis.
      if (q.art === 'original' && befund && !o.neu) {
        let k: { seiten: number; pdfa: PdfaKennung } | null = null;
        try { k = bewertePdfA(befund); } catch { k = null; }
        if (k) {
          const info: ArchivfassungInfo = { mime: 'application/pdf', groesse: d.groesse, sha256: d.sha256, seiten: k.seiten, pdfa: k.pdfa, paket, erstellt: jetztIso, imOriginal: true, ...(befund.signiert ? { signiert: true } : {}), ...(befund.erechnung ? { erechnung: true } : {}) };
          await this.o.ablage.schreibeInfo(d.sha256, info);
          await this.o.ablage.setzeStand(d.sha256, null);
          log.info('Original ist schon PDF/A – gilt als Archivfassung', { dokument: d.id, pdfa: pdfaName(k.pdfa) });
          return false;
        }
      }
      seiten = await this.o.textebene(pdf).catch(() => null);
      const mit = seiten?.filter(mitText).length ?? 0;
      textebene = !seiten || !mit ? 'keine' : mit === seiten.length ? 'voll' : 'teilweise';
      if (await abgewaehlt(textebene === 'voll' ? 'pdf_text' : 'pdf_scan')) return false;
    }
    // Wortpositionen: für jede Seite ohne Textebene von der Texterkennung? E-Mails (#946) brauchen keine – das Paket
    // setzt die Seiten selbst und schreibt den Text dabei als echte Textebene.
    let wortpositionen = true;
    if (!mail) {
      const w = await this.o.ablage.woerter(d.sha256).catch(() => null);
      const anzahl = seiten?.length ?? (q.mime === 'application/pdf' ? d.ocr?.seiten ?? 1 : 1);
      for (let i = 0; i < anzahl; i++) if (!mitText(seiten?.[i]) && !w?.seiten[i]) wortpositionen = false;
    }
    this.angefordert.set(d.sha256, jetzt);
    await this.o.ablage.setzeStand(d.sha256, { stand: 'wartet', info: null, paket, zeit: jetztIso });
    const daten = (x: Dokument) => ({
      dokument: x.id, mappe: x.mappeId, name: x.name, mime: x.mime, groesse: x.groesse, sha256: x.sha256,
      quelle: q.art, ...(q.fassung ? { lesefassung: { mime: q.fassung.mime, sha256: q.fassung.sha256 } } : {}),
      seiten: mail ? null : seiten?.length ?? (q.mime === 'application/pdf' ? d.ocr?.seiten ?? null : 1), textebene, wortpositionen, sprache: d.sprache ?? null,
      signiert: !!befund?.signiert, erechnung: !!befund?.erechnung, formular: !!befund?.formular,
      extern: !!befund && (befund.javascript || befund.aktionen.length > 0 || befund.extern.length > 0),
      // Zeitzone der Ablage (#946, Werkbank → Region): für Datumsangaben in der Archivfassung, z. B. im Kopf einer E-Mail.
      zeitzone: zeitzone(), ...(o.neu ? { neu: true } : {}),
    });
    // KI-Sperre (#796): Die Archivfassung gilt für alle Dokumente mit dieser Datei – ist der Typ dieses Dokuments
    // gesperrt, geht der Auftrag über ein anderes derselben Datei in einem zugelassenen Typ; sonst ausgelassen.
    let gemeldet = false;
    for (const x of [d, ...(await this.o.dokumenteMitSha(d.sha256).catch(() => [])).filter((y) => y.id !== d.id)]) {
      if ((await this.o.melde(p.id, daten(x))) !== 'gesperrt') { gemeldet = true; break; }
    }
    if (!gemeldet) {
      this.angefordert.delete(d.sha256);
      await this.o.ablage.setzeStand(d.sha256, { stand: 'ausgelassen', info: t('pakete.archiv.ki-gesperrt', { paket: p.name }), paket, zeit: jetztIso });
      return false;
    }
    log.info('Dokument zur Archivfassung an das Paket gemeldet', { dokument: d.id, typ: d.mime, paket: p.id, textebene, wortpositionen, neu: !!o.neu });
    return true;
  }

  /**
   * Bestand (Paket installiert, neue Dateitypen, Einstellung „auch PDFs mit Textebene“ an): alle Dokumente dieser
   * Typen mit fertigem Volltext ohne Archivfassung. Liefert, wie viele gemeldet wurden.
   */
  async bestand(typen: string[]): Promise<number> {
    if (!typen.length) return 0;
    const liste = await this.pakete();
    if (!liste.length) return 0;
    const klein = new Set(typen.map((m) => m.toLowerCase()));
    // E-Mails (#946) liegen oft als application/octet-stream mit Endung .eml/.msg da.
    const mitMail = [...klein].some((m) => MAIL_TYPEN.includes(m));
    const abfrage = new Set(mitMail ? [...klein, 'application/octet-stream'] : klein);
    let n = 0;
    for (const d of await this.o.dokumenteMitTyp([...abfrage])) {
      const mail = mailTyp(d.mime, d.name);
      if (!klein.has(d.mime.toLowerCase()) && !(mail && klein.has(mail))) continue;
      if (await this.anfordern(d, { liste }).catch((e: Error) => { log.warn('Dokument nicht zur Archivfassung gemeldet', { dokument: d.id, fehler: e.message }); return false; })) n++;
    }
    if (n) log.info('Vorhandene Dokumente zur Archivfassung gemeldet', { typen: [...klein], dokumente: n });
    return n;
  }

  /** Darf dieses Paket die Archivfassung dieses Dokuments ablegen? Sonst 403 mit Grund. */
  private async zustaendig(paket: { id: string; schnittstellen?: string[] } | undefined, d: Dokument): Promise<ArchivPaket> {
    if (!paket) throw new Fachfehler(403, t('pakete.archiv.nur-pakete'));
    if (!paket.schnittstellen?.includes('dms:archivfassung')) throw new Fachfehler(403, t('pakete.archiv.recht'));
    const p = await this.paketFuer(d.mime, undefined, d.name);
    if (!p || p.id !== paket.id) throw new Fachfehler(403, t('pakete.archiv.typ-fremd', { typ: d.mime }));
    return p;
  }

  private static pruefeStand(d: Dokument, sha: unknown) {
    if (typeof sha !== 'string' || !/^[0-9a-f]{64}$/.test(sha)) throw new Fachfehler(422, t('pakete.fassung.sha'));
    if (sha !== d.sha256) throw new Fachfehler(409, t('pakete.archiv.version'));
  }

  /** Archivfassung eines Pakets annehmen (PUT /dokumente/{id}/archivfassung?sha256=…). */
  async setze(paket: { id: string; schnittstellen?: string[] } | undefined, d: Dokument, sha: unknown, inhalt: unknown): Promise<ArchivfassungInfo> {
    const p = await this.zustaendig(paket, d);
    Archivfassung.pruefeStand(d, sha);
    let k: { seiten: number; pdfa: PdfaKennung };
    try { k = await pruefeArchivfassung(inhalt, (pdf) => this.o.liesPdfA(pdf)); } catch (f) {
      // Abgelehnt: Der Grund steht am Dokument und in der Werkbank (bis eine gültige Archivfassung kommt).
      if (f instanceof Fachfehler && f.status < 500) {
        await this.o.ablage.setzeStand(d.sha256, { stand: 'fehler', info: t('pakete.archiv.abgelehnt', { paket: p.name, grund: f.message }).slice(0, 500), paket: { id: p.id, name: p.name, version: p.version }, zeit: new Date().toISOString() }).catch(() => {});
        log.warn('Archivfassung abgelehnt', { dokument: d.id, paket: p.id, grund: f.message });
      }
      throw f;
    }
    const b = inhalt as Buffer;
    // Was das Original mitbringt (Signatur, E-Rechnung, externe Inhalte) – für die Hinweise am Dokument.
    const q = await this.quelle(d);
    const vom = q?.mime === 'application/pdf' ? await this.o.liesPdfA(await q.inhalt()).catch(() => null) : null;
    const weggelassen = !!vom && (vom.javascript || vom.aktionen.length > 0 || vom.extern.length > 0);
    if (weggelassen) log.info('Externe Inhalte des Originals nicht in die Archivfassung übernommen', { dokument: d.id, adressen: vom!.extern, aktionen: vom!.aktionen, javascript: vom!.javascript });
    const info: ArchivfassungInfo = { mime: 'application/pdf', groesse: b.length, sha256: createHash('sha256').update(b).digest('hex'), seiten: k.seiten, pdfa: k.pdfa, paket: { id: p.id, name: p.name, version: p.version }, erstellt: new Date().toISOString(),
      ...(vom?.signiert ? { signiert: true } : {}), ...(vom?.erechnung ? { erechnung: true } : {}), ...(weggelassen ? { weggelassen: true } : {}) };
    await this.o.ablage.schreibe(d.sha256, info, b);
    await this.o.ablage.setzeStand(d.sha256, null);
    this.angefordert.delete(d.sha256);
    log.info('Archivfassung gespeichert', { dokument: d.id, typ: d.mime, pdfa: pdfaName(k.pdfa), bytes: b.length, seiten: k.seiten, paket: p.id });
    const alle = await this.o.dokumenteMitSha(d.sha256).catch(() => [] as Dokument[]);
    const text = t('pakete.archiv.historie', { typ: dateitypName(d.mime), pdfa: pdfaName(k.pdfa), paket: `${p.name} ${p.version}` });
    for (const x of alle.length ? alle : [d]) {
      await this.o.notiere(x, p.id, { dokument: x.name, text, pdfa: pdfaName(k.pdfa), groesse: b.length, paket: `${p.name} ${p.version}` })
        .catch((e: Error) => log.warn('Historie zur Archivfassung nicht geschrieben', { dokument: x.id, fehler: e.message }));
    }
    return info;
  }

  /**
   * Nach dem Ereignis (aus dem Läufer): Ohne Archivfassung steht der Grund des Pakets am Dokument (ausgelassen), gibt
   * der Läufer auf: Fehler. Eine Ablehnung beim Annehmen (Fehler mit Grund) bleibt stehen.
   */
  async nachEreignis(paket: string, e: { daten: Record<string, unknown> }, r: { ok: boolean; text: string; fehler?: string | null; aufgegeben?: boolean }) {
    const sha = typeof e.daten.sha256 === 'string' && /^[0-9a-f]{64}$/.test(e.daten.sha256) ? e.daten.sha256 : '';
    if (!sha || (!r.ok && !r.aufgegeben)) return;
    this.angefordert.delete(sha);
    const s = await this.o.ablage.stand(sha).catch(() => null);
    // Schon fertig (Stand entfernt) oder abgelehnt (Grund steht schon da): nichts zu tun.
    if (!s || s.stand !== 'wartet') return;
    const p = (await this.o.pakete()).find((x) => x.id === paket);
    const name = p?.name ?? paket;
    const grund = (r.ok ? r.text : r.fehler ?? '').trim().replace(/\s+/g, ' ').slice(0, 300);
    const info = r.ok ? t('pakete.archiv.ohne', { paket: name, grund: grund || t('pakete.archiv.ohne-grund') }) : t('pakete.archiv.fehlgeschlagen', { paket: name, grund: grund || '–' });
    await this.o.ablage.setzeStand(sha, { stand: r.ok ? 'ausgelassen' : 'fehler', info: info.slice(0, 500), paket: { id: paket, name, version: p?.version }, zeit: new Date().toISOString() });
  }

  /** Das Paket ist mit der Meldung fertig: Die Datei darf wieder gemeldet werden. */
  erledigt(sha: string) { this.angefordert.delete(sha); }

  /** Datei gelöscht (kein Dokument zeigt mehr darauf): Archivfassung, Stand und Wortpositionen mit weg. */
  async entferne(sha: string) {
    this.angefordert.delete(sha);
    await this.o.ablage.loesche(sha).catch(() => {});
  }

  /* ---------- Wortpositionen ---------- */

  /** Wortpositionen der Texterkennung speichern (null: entfernen, z. B. neuer Text ohne Wortpositionen). */
  async speichereWoerter(sha: string, seiten: Array<Wort[] | null> | null, von: string) {
    await this.o.ablage.setzeWoerter(sha, seiten && seiten.some((s) => s) ? { seiten, von, erstellt: new Date().toISOString() } : null);
  }

  /**
   * Wortpositionen eines Dokuments (GET /dokumente/{id}/wortpositionen): je Seite der Quelle (Original bzw.
   * Lesefassung) die Wörter mit Lage – aus der Textebene, sonst aus der Texterkennung, sonst keine.
   */
  async wortpositionen(d: Dokument): Promise<{ dokument: string; sha256: string; quelle: 'original' | 'lesefassung'; mime: string; vollstaendig: boolean; seiten: WortSeite[] }> {
    const q = await this.quelle(d);
    if (!q) throw new Fachfehler(404, t('pakete.archiv.keine-quelle', { typ: dateitypName(d.mime) }));
    const inhalt = await q.inhalt();
    const ebene = q.mime === 'application/pdf' ? await this.o.textebene(inhalt).catch(() => null) : null;
    const w = await this.o.ablage.woerter(d.sha256).catch(() => null);
    const bild = q.mime !== 'application/pdf' ? bildGroesse(inhalt, q.mime) : null;
    const anzahl = q.mime === 'application/pdf' ? ebene?.length ?? Math.max(d.ocr?.seiten ?? 0, w?.seiten.length ?? 0, 1) : 1;
    const seiten: WortSeite[] = [];
    for (let i = 0; i < anzahl; i++) {
      const e = ebene?.[i];
      const masse = e ? { breite: e.breite, hoehe: e.hoehe } : bild ? { breite: bild.breite, hoehe: bild.hoehe } : {};
      if (mitText(e)) seiten.push({ seite: i + 1, quelle: 'textebene', ...masse, woerter: e!.woerter });
      else if (w?.seiten[i]) seiten.push({ seite: i + 1, quelle: 'texterkennung', ...masse, woerter: w.seiten[i]! });
      else seiten.push({ seite: i + 1, quelle: 'keine', ...masse, woerter: [] });
    }
    return { dokument: d.id, sha256: d.sha256, quelle: q.art, mime: q.mime, vollstaendig: seiten.every((s) => s.quelle !== 'keine'), seiten };
  }

  /* ---------- Werkbank ---------- */

  /** Pakete, Anzahl je Stand und die Dokumente mit Fehler oder ausgelassen (höchstens 200). */
  async uebersicht() {
    const pakete = await this.pakete();
    const { anzahl: fertig, bytes } = await this.belegung().catch(() => ({ anzahl: 0, bytes: 0 }));
    const staende = await this.o.ablage.staende().catch(() => []);
    const zaehler = { fertig, bytes, wartet: 0, ausgelassen: 0, fehler: 0 };
    const liste: Array<{ dokument: string; name: string; mappeId: string; stand: ArchivStandArt; info: string | null; zeit: string; paket: string | null }> = [];
    for (const { sha256, stand: s } of staende.sort((a, b) => b.stand.zeit.localeCompare(a.stand.zeit))) {
      if (await this.info(sha256)) continue;
      zaehler[s.stand]++;
      if (s.stand === 'wartet' || liste.length >= 200) continue;
      for (const d of await this.o.dokumenteMitSha(sha256).catch(() => [] as Dokument[])) liste.push({ dokument: d.id, name: d.name, mappeId: d.mappeId, stand: s.stand, info: s.info, zeit: s.zeit, paket: s.paket?.name ?? null });
    }
    return { pakete, zaehler, liste: liste.slice(0, 200) };
  }
}
