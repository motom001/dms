import { execFile } from './hintergrund';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Readable } from 'node:stream';
import { OCR_STAENDE, type Dokument, type OcrStandArt } from '../../shared/src/model';
import { istPaketText } from '../../shared/src/pakete';
import { erkenneSprache, istTextsprache, spracheZuInfo } from '../../shared/src/textsprache';
import { dokumentsprachen, seitenZusammensetzen, zeichenzahl } from '../../shared/src/seitensprachen';
import type { Dateispeicher } from './dateispeicher';
import type { Einstellungen } from './einstellungen';
import { Fachfehler } from './fehler';
import { protokoll } from './protokoll';
import type { OcrErgebnis, Repo } from './repo';
import { INFO_TEXTEBENE, infoWartet, NICHT_GESPEICHERT } from '../../shared/src/volltext';
import { dateitypName, infoFassung, infoUmwandlung, katalogUmwandlung, UMWANDELN_MAX_BYTES } from '../../shared/src/dateiumwandlung';
import { infoVolltextPaket, katalogVolltext, VOLLTEXT_PAKET_MAX_BYTES } from '../../shared/src/paketvolltext';
import { t } from './sprache';
import { AUSGABE_GROSS, MB, TEXTERKENNUNG_MAX_MB as MAX_MB } from './grenzen';

/**
 * Volltext (#45, #458, #459).
 *
 * - PDFs: Der Kern liest die Textebene (pdftotext aus poppler) – sofort, ohne Texterkennung.
 * - Scans und Bilder (JPEG, PNG) erkennt ein Paket mit der Schnittstelle dms:texterkennung (z. B. „Texterkennung“
 *   aus dem Katalog). Seit #459 steckt keine Texterkennung (Tesseract) mehr im Image.
 * - Eine Warteschlange in der Datenbank (ocr_stand); die Arbeit läuft im Hintergrund. Nach einem Neustart geht es
 *   weiter. Gleiche Datei schon gelesen? Dann wird der Text übernommen.
 * - Dokumente ohne Text (und bei „neu“ alle) stehen auf „wartet auf Texterkennung“ (Stand paket), bis das Paket den
 *   Volltext schreibt – bzw. bis eins installiert ist. Jedes Ergebnis geht über `nachher` an die Pakete (Ereignis
 *   volltext.fertig, auch ohne Text).
 * - Sprache (#395, #400): die erkannte Sprache des Texts steht am Ende des Hinweises und als eigenes Feld.
 * - Andere Dateitypen (#577, z. B. TIFF): Gibt es ein Paket mit `dms:umwandeln` dafür, wartet das Dokument auf seine
 *   Fassung („wartet auf Umwandlung“); mit der Fassung (PDF, PNG oder JPEG) geht es weiter wie oben – das Ereignis
 *   nennt dann den Typ der Fassung (`mime`) und den des Originals (`original`). Ohne Paket: ausgelassen mit Hinweis.
 * - Volltext aus Paketen (#614): Gibt es für den Dateityp ein Paket mit `dms:volltext`, geht die Datei an dieses
 *   (Ereignis `datei.volltext`, erst nachdem der Stand gespeichert ist) und das Dokument wartet auf dessen Volltext
 *   („wartet auf Volltext“). Das gilt vor einer umgewandelten Fassung: Das Paket liest das Original.
 */

const log = protokoll.modul('texterkennung');

/** Dateitypen, für die das DMS einen Volltext erzeugt (Textebene bzw. Texterkennung durch das Paket). */
export const DATEITYPEN: Record<string, string> = {
  'application/pdf': 'PDF',
  'image/jpeg': 'JPEG-Bild',
  'image/png': 'PNG-Bild',
};
/** Höchstens so viele Seiten liest der Kern aus der Textebene (pdftotext ist schnell). */
export const MAX_SEITEN = 1000;
export { MAX_MB };

/**
 * Einstellungen (#45): seit #459 nur noch, ob überhaupt Volltext erzeugt wird und wie viele Dokumente gleichzeitig.
 * Was die Texterkennung tut (Sprache, Seiten, Dateitypen), stellt man beim Paket ein. Gespeicherte Werte aus der Zeit
 * der eingebauten Texterkennung (sprachen, typen …) werden beim Lesen übergangen.
 */
export interface OcrEinstellungen {
  /** Volltext überhaupt erzeugen (aus: neue Dokumente bleiben in der Warteschlange). */
  aktiv: boolean;
  /** Gleichzeitige Aufträge (1–4). */
  auftraege: number;
}

export const OCR_STANDARD: OcrEinstellungen = { aktiv: true, auftraege: 1 };

export function bereinigeOcr(e: unknown, alt: OcrEinstellungen = OCR_STANDARD): OcrEinstellungen {
  const x = (e ?? {}) as Record<string, unknown>;
  let auftraege = alt.auftraege;
  if (x.auftraege !== undefined) {
    const n = Number(x.auftraege);
    if (!Number.isInteger(n) || n < 1 || n > 4) throw new Fachfehler(422, t('meldungen.texterkennung.gleichzeitige-auftraege-eine-ganze'));
    auftraege = n;
  }
  return { aktiv: x.aktiv === undefined ? alt.aktiv : x.aktiv === true, auftraege };
}

/** Gespeicherte Einstellungen lesen – auch solche aus der Zeit der eingebauten Texterkennung (#459). */
export function ocrAusGespeichert(e: unknown): OcrEinstellungen {
  const x = (e ?? {}) as Record<string, unknown>;
  const n = Number(x.auftraege);
  return { aktiv: x.aktiv !== false, auftraege: Number.isInteger(n) && n >= 1 && n <= 4 ? n : OCR_STANDARD.auftraege };
}

/* ---------- Werkzeuge ---------- */

interface Lauf { stdout: string; stderr: string }
function starte(cmd: string, args: string[], ms: number, signal?: AbortSignal): Promise<Lauf> {
  return new Promise((ok, fehler) => {
    execFile(cmd, args, { timeout: ms, maxBuffer: AUSGABE_GROSS, encoding: 'utf8', signal }, (e, stdout, stderr) => {
      if (e) {
        const f = e as NodeJS.ErrnoException & { killed?: boolean };
        if (signal?.aborted) { fehler(new Error('abgebrochen')); return; }
        fehler(new Error(f.code === 'ENOENT' ? `${cmd} ist nicht installiert.` : f.killed ? `${cmd} brauchte zu lange (über ${Math.round(ms / 1000)} s).` : (stderr || f.message).trim().split('\n').slice(-2).join(' ')));
      } else ok({ stdout, stderr });
    });
  });
}

/** Was der Kern für den Volltext braucht: poppler (pdftotext für die Textebene, pdftoppm für Seitenbilder). */
export interface Werkzeuge {
  pdftotext: boolean;
  pdftoppm: boolean;
}

/** Was ist installiert? (Für die Werkbank.) */
export async function pruefeWerkzeuge(): Promise<Werkzeuge> {
  const da = (cmd: string) => starte(cmd, ['-v'], 10_000).then(() => true, (e: Error) => !/nicht installiert/.test(e.message));
  return { pdftotext: await da('pdftotext'), pdftoppm: await da('pdftoppm') };
}

/**
 * Text eines Dokuments (Datei liegt unter pfad): bei PDFs die Textebene. `ohneText` (#458): Seiten (ab 1) ohne
 * nennenswerten Text – die erkennt das Paket. Bilder haben keine Textebene: alle Seiten ohne Text.
 */
export type Engine = (pfad: string, mime: string, o: { maxSeiten: number; werkzeuge: Werkzeuge; signal?: AbortSignal }) => Promise<{ text: string; seiten: number; info: string; ohneText?: number[]; /** Text je Seite (#579), wie `text` ihn zusammensetzt. */ seitenTexte?: string[] }>;

const sauber = (t: string) => t.replace(/\r/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
/** Seite mit nennenswertem Text (sonst: gescannt). */
export const hatText = (t: string) => t.replace(/\s/g, '').length >= 20;

/** Die Textebene mit pdftotext (#459: ohne Texterkennung im Kern). */
export const textebeneEngine: Engine = async (pfad, mime, o) => {
  if (mime !== 'application/pdf') return { text: '', seiten: 1, info: t('meldungen.texterkennung.bild-ohne-textebene'), ohneText: [1] };
  if (!o.werkzeuge.pdftotext) throw new Error('pdftotext (poppler) ist nicht installiert.');
  const info = await starte('pdfinfo', [pfad], 30_000, o.signal).then((r) => r.stdout, () => '');
  const gesamt = Number(/^Pages:\s+(\d+)/m.exec(info)?.[1] ?? 1);
  const seiten = Math.min(gesamt, o.maxSeiten);
  // Ganze Textebene auf einmal; Seiten sind durch Seitenvorschub (\f) getrennt.
  const ebene = (await starte('pdftotext', ['-f', '1', '-l', String(seiten), '-layout', '-enc', 'UTF-8', pfad, '-'], 120_000, o.signal)).stdout.split('\f');
  const texte: string[] = [];
  const ohneText: number[] = [];
  for (let i = 0; i < seiten; i++) {
    const t = ebene[i] ?? '';
    if (!hatText(t)) ohneText.push(i + 1);
    texte.push(t);
  }
  const gekuerzt = gesamt > seiten ? t('meldungen.texterkennung.nur-die-ersten-von', { seiten, gesamt }) : '';
  // Je Seite bereinigt und mit Leerzeile verbunden; die Seiten braucht die Sprache je Seite (#579).
  const seitenTexte = texte.map(sauber);
  return { text: seitenZusammensetzen(seitenTexte.map((text) => ({ text })), false).text, seiten, info: INFO_TEXTEBENE + gekuerzt, ohneText, seitenTexte };
};

/* ---------- Warteschlange ---------- */

const alsBuffer = async (x: Readable | Buffer): Promise<Buffer> => {
  if (Buffer.isBuffer(x)) return x;
  const teile: Buffer[] = [];
  for await (const c of x) teile.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
  return Buffer.concat(teile);
};

/** Das Paket, das die Texterkennung übernimmt (#458, Schnittstelle dms:texterkennung). */
export interface TexterkennungPaket { id: string; name: string; version: string; sprachen?: string[] }

/** Was der Kern nach seinem Schritt an die Pakete meldet (#458). */
export interface KernErgebnis {
  /** Nennenswerter Text gefunden (Textebene bzw. eingebaute Texterkennung)? */
  text: boolean;
  /** „Volltext neu erzeugen“ bzw. „erneut“ am Dokument: das Paket soll auch dann neu erkennen, wenn es Text gibt. */
  neu: boolean;
  /** Gemischte PDFs (#458): Seiten ohne Textebene (ab 1) – das Paket erkennt nur diese und hängt sie an. */
  seitenOhneText?: number[];
  /** Umgewandelte Datei (#577): Typ der Fassung, die der Kern gelesen hat, und Typ des Originals. */
  mime?: string;
  original?: string;
}

/** Volltext aus Paketen (#614): das zuständige Paket für einen Dateityp und die Meldung an es (paketvolltext.ts). */
export interface TexterkennungVolltextPaket {
  paketFuer(mime: string): Promise<{ id: string; name: string; version: string; typen: string[] } | null>;
  anfordern(d: Dokument, p: { id: string; name: string; version: string; typen: string[] }, o: { neu?: boolean }): Promise<boolean | 'gesperrt'>;
}

/** Dateien umwandeln (#577): die Fassung einer Datei und das zuständige Paket (dateiumwandlung.ts). */
export interface TexterkennungUmwandlung {
  lies(sha: string): Promise<{ info: { mime: string; paket: { name: string; version: string } }; inhalt: Buffer } | null>;
  paketFuer(mime: string): Promise<{ id: string; name: string } | null>;
  anfordern(d: Dokument[]): Promise<number>;
  /** KI-Sperre (#796): Kein Dokument mit dieser Datei darf an das Paket – die Datei ging nicht hinaus. */
  gesperrt?(sha: string): boolean;
}

/** Fassung, aus der der Kern liest (#577 umgewandelt, #827 entsperrt); `herkunft` ersetzt den Hinweis zum Paket. */
type Lesefassung = { info: { paket: { name: string; version: string } }; inhalt: Buffer; herkunft?: string };
/** Hinweis bei PDFs mit Passwort zum Öffnen (ohne entsperrte Fassung, #827). */
export const INFO_PASSWORT = t('meldungen.texterkennung.das-pdf-ist-mit');
/** So steht im Hinweis des Volltexts, dass er aus der entsperrten Fassung eines geschützten PDFs stammt (#827). */
export const INFO_ENTSPERRT = t('meldungen.texterkennung.aus-der-entsperrten-fassung');

export class Texterkennung {
  private laufend = 0;
  /** Laufende Aufträge je Dokument, damit Administratoren sie abbrechen können (#61). */
  private laeufe = new Map<string, AbortController>();
  private werkzeuge?: Promise<Werkzeuge>;
  private aus = false;
  /** Dokumente in der Warteschlange, die ausdrücklich neu erkannt werden sollen (#458; nur im Speicher). */
  private neuMarken = new Set<string>();
  /** Nach jedem Ergebnis (#338, #458: Ereignis für Pakete – auch ohne Text). */
  nachher: ((d: Dokument, e: OcrErgebnis, k: KernErgebnis) => void) | null = null;
  /** Im aktiven Wartungsmodus (#102) keine neuen Aufträge; danach anstossen(). */
  pause: () => boolean = () => false;
  /** Das installierte Paket für die Texterkennung (#458); null = keins. */
  paket: () => Promise<TexterkennungPaket | null> = async () => null;
  /** Dateien umwandeln (#577); ohne: andere Dateitypen bleiben ausgelassen. */
  umwandlung: TexterkennungUmwandlung | null = null;
  /** Volltext aus Paketen (#614); ohne: andere Dateitypen wie bisher (Umwandlung oder ausgelassen). */
  volltextPaket: TexterkennungVolltextPaket | null = null;
  /** Entsperrte Fassung eines geschützten PDFs (#827); ohne: geschützte PDFs bleiben ausgelassen. */
  entsperrt: ((sha: string) => Promise<{ inhalt: Buffer } | null>) | null = null;

  constructor(
    private repo: Repo,
    private dateien: Dateispeicher,
    private einstellungen?: Einstellungen,
    private engine: Engine = textebeneEngine,
    private pruefe: () => Promise<Werkzeuge> = pruefeWerkzeuge,
  ) {}

  async optionen(): Promise<OcrEinstellungen> {
    const e = this.einstellungen ? await this.einstellungen.lies('ocr') : null;
    return e ? ocrAusGespeichert(e) : OCR_STANDARD;
  }

  async speichere(e: unknown): Promise<OcrEinstellungen> {
    if (!this.einstellungen) throw new Fachfehler(404, t('meldungen.texterkennung.die-texterkennung-ist-nicht'));
    const neu = bereinigeOcr(e, await this.optionen());
    await this.einstellungen.schreibe('ocr', neu);
    log.info('Einstellungen des Volltexts geändert', { aktiv: neu.aktiv, auftraege: neu.auftraege });
    this.anstossen();
    return neu;
  }

  werkzeugeLaden(neu = false) {
    if (neu || !this.werkzeuge) this.werkzeuge = this.pruefe();
    return this.werkzeuge;
  }

  /**
   * Beim Start: Unterbrochenes wieder einreihen und loslegen. `zurueckstellen: false` (#744): Laufen schon andere
   * Prozesse an derselben Datenbank, gehören laufende Aufträge vielleicht ihnen – dann nichts zurückstellen.
   */
  async start(o: { zurueckstellen?: boolean } = {}) {
    const n = o.zurueckstellen === false ? 0 : await this.repo.ocrZurueckstellen();
    if (n) log.info('Unterbrochene Texterkennung wird fortgesetzt', { dokumente: n });
    const w = await this.werkzeugeLaden();
    if (!w.pdftotext) log.warn('poppler (pdftotext) fehlt – PDFs bekommen keinen Volltext.');
    // Seit #459 keine Texterkennung im Image: Scans und Bilder erkennt ein Paket.
    const p = await this.paket().catch(() => null);
    log.info(p ? `Volltext bereit: Textebene von PDFs, Texterkennung durch Paket ${p.name} ${p.version}` : 'Volltext bereit: Textebene von PDFs – kein Paket für die Texterkennung installiert, Scans und Bilder bleiben ohne Text (Werkbank → Pakete → Texterkennung).');
    this.anstossen();
  }

  /** Beenden: keine neuen Aufträge mehr annehmen. */
  stop() { this.aus = true; }

  /** Freie Aufträge mit wartenden Dokumenten füllen. */
  anstossen() {
    if (this.aus) return;
    void this.pumpe().catch((e) => log.error('Texterkennung gestört', { fehler: (e as Error).message }));
  }

  private async pumpe() {
    const o = await this.optionen();
    if (!o.aktiv || this.pause()) return;
    while (!this.aus && this.laufend < o.auftraege) {
      // Platz vor dem Warten reservieren, sonst nehmen sich zwei Durchläufe zu viele Aufträge.
      this.laufend++;
      const d = await this.repo.ocrNaechster().catch((e) => { this.laufend--; throw e; });
      if (!d) { this.laufend--; return; }
      void this.verarbeite(d).finally(() => { this.laufend--; this.anstossen(); });
    }
  }

  /**
   * Sofort statt über die Warteschlange (#458, Auftrag „Volltext neu erzeugen“): dieselbe Arbeit wie für ein neues
   * Dokument, danach das Ereignis an die Pakete. Wartet, bis der Kern fertig ist (nicht auf das Paket).
   */
  async jetzt(id: string, opt: { neu: boolean; signal?: AbortSignal }): Promise<void> {
    const d = await this.repo.holeDokument(id);
    if (!d || d.ocr?.stand === 'laeuft') return;
    await this.repo.ocrSetze(id, { stand: 'laeuft', info: d.ocr?.info ?? null, seiten: d.ocr?.seiten ?? null });
    const abbruch = () => this.laeufe.get(id)?.abort();
    opt.signal?.addEventListener('abort', abbruch, { once: true });
    try { await this.verarbeite(d, opt.neu); } finally { opt.signal?.removeEventListener('abort', abbruch); }
  }

  /** Ein Dokument: auslassen, Text übernehmen oder erkennen. */
  private async verarbeite(d: Dokument, neu = false) {
    const start = Date.now();
    let e: OcrErgebnis;
    const abbruch = new AbortController();
    this.laeufe.set(d.id, abbruch);
    if (this.neuMarken.delete(d.id)) neu = true;
    try {
      e = await this.ergebnis(d, abbruch.signal, neu);
    } catch (f) {
      const m = (f as Error).message;
      e = abbruch.signal.aborted ? { stand: 'ausgelassen', info: t('meldungen.texterkennung.vom-administrator-abgebrochen'), text: null }
        // Ein erneuter Versuch ändert nichts: als ausgelassen mit klarem Grund (#61).
        : /password|passwort|encrypt/i.test(m) ? { stand: 'ausgelassen', info: INFO_PASSWORT, text: null }
        : { stand: 'fehler', info: m.slice(0, 500) };
    } finally { this.laeufe.delete(d.id); }
    // Hat inzwischen ein Paket den Volltext geschrieben (#338), bleibt der stehen – außer bei „neu“ (#458).
    const jetzt = await this.repo.holeDokument(d.id).catch(() => undefined);
    if (!jetzt) return;
    if (!neu && jetzt.ocr?.stand === 'fertig' && istPaketText(jetzt.ocr.info)) { log.info('Texterkennung verworfen: Volltext kam schon von einem Paket', { dokument: d.name, id: d.id }); return; }
    // Seiten ohne Text (#458) und der Typ der Fassung (#577) gehören nicht ins Repo, nur ins Ereignis.
    const ohneText = (e as OcrErgebnis & { ohneText?: number[] }).ohneText;
    delete (e as OcrErgebnis & { ohneText?: number[] }).ohneText;
    const fassung = (e as OcrErgebnis & { fassung?: string }).fassung;
    delete (e as OcrErgebnis & { fassung?: string }).fassung;
    // Volltext aus einem Paket (#614): Die Meldung geht erst hinaus, wenn der Stand gespeichert ist – sonst könnte ein
    // schnelles Paket schreiben, bevor „wartet auf Volltext“ seinen Text überdeckt.
    const ausPaket = (e as OcrErgebnis & { ausPaket?: { id: string; name: string; version: string; typen: string[] } }).ausPaket;
    delete (e as OcrErgebnis & { ausPaket?: unknown }).ausPaket;
    try { await this.repo.ocrSetze(d.id, e); } catch (f) {
      // Auch nach den Wiederholungen nicht gespeichert (#575): nie still ohne Volltext – Stand „Fehler“ mit Hinweis,
      // damit es in Werkbank → Volltext auffällt und „Fehlgeschlagene erneut“ es wieder einreiht.
      log.error('Ergebnis der Texterkennung nicht gespeichert', { dokument: d.name, id: d.id, fehler: (f as Error).message });
      await this.repo.ocrSetze(d.id, { stand: 'fehler', info: `${NICHT_GESPEICHERT} (${(f as Error).message})`.slice(0, 500), seiten: e.seiten ?? null })
        .catch((g) => log.error('Stand der Texterkennung nicht gesetzt – das Dokument wird beim nächsten Start neu eingereiht', { dokument: d.name, id: d.id, fehler: (g as Error).message }));
      return;
    }
    // Inzwischen entsperrt (#827, z. B. mit einem gemerkten Passwort, während der Kern noch das Original las): gleich
    // noch einmal – diesmal aus der entsperrten Fassung.
    if (e.stand === 'ausgelassen' && e.info === INFO_PASSWORT && this.entsperrt && (await this.entsperrt(d.sha256).catch(() => null))) {
      await this.repo.ocrEinreihen([d.id]);
      return;
    }
    const daten = { dokument: d.name, id: d.id, stand: e.stand, seiten: e.seiten ?? undefined, ms: Date.now() - start, info: e.info ?? undefined };
    if (e.stand === 'fehler') log.warn('Texterkennung fehlgeschlagen', daten); else if (e.stand === 'ausgelassen') log.info('Texterkennung ausgelassen', daten);
    else if (e.stand === 'paket') log.info('Textebene gelesen, Texterkennung durch Paket folgt', daten); else log.info('Texterkennung abgeschlossen', daten);
    // Vom Administrator abgebrochen: kein Ereignis (sonst finge das Paket gleich wieder an).
    if (abbruch.signal.aborted) return;
    // Gemischt nur, wenn es auch Text gibt; bei text: false erkennt das Paket ohnehin alle Seiten.
    const gemischt = e.stand === 'paket' && !!e.text && hatText(e.text) && ohneText?.length ? { seitenOhneText: ohneText } : {};
    // Wartet es auf die Umwandlung (#577), gibt es noch nichts zu melden – das Ereignis kommt mit der Fassung.
    if (fassung === 'wartet') return;
    // Wartet es auf den Volltext eines Pakets (#614): Datei an das Paket; „Volltext fertig“ kommt, wenn es schreibt.
    if (ausPaket) {
      const r = await this.volltextPaket?.anfordern(jetzt, ausPaket, { neu }).catch((f) => { log.warn('Datei nicht zum Volltext an das Paket gemeldet', { dokument: d.id, paket: ausPaket.id, fehler: (f as Error).message }); return false; });
      // KI-Sperre (#796): Das Dokument wartet nicht auf das Paket; vorhandener Text bleibt.
      if (r === 'gesperrt') {
        const text = await this.repo.volltext(d.id).catch(() => null);
        await this.repo.ocrSetze(d.id, { stand: text && hatText(text) ? 'fertig' : 'ausgelassen', info: t('pakete.volltext.ki-gesperrt', { paket: ausPaket.name }), seiten: e.seiten ?? null })
          .catch((f) => log.warn('Stand nach KI-Sperre nicht gesetzt', { dokument: d.id, fehler: (f as Error).message }));
      }
      return;
    }
    const umgewandelt = fassung ? { mime: fassung, original: jetzt.mime } : {};
    try { this.nachher?.(jetzt, e, { text: !!e.text && hatText(e.text), neu, ...gemischt, ...umgewandelt }); } catch { /* nur Benachrichtigung */ }
  }

  private async ergebnis(d: Dokument, signal?: AbortSignal, neu = false): Promise<OcrErgebnis> {
    if (!DATEITYPEN[d.mime]) return this.umgewandelt(d, signal, neu);
    if (d.groesse > MAX_MB * MB) return { stand: 'ausgelassen', info: t('meldungen.texterkennung.groesser-als-mb', { MAX_MB }), text: null };
    // Geschütztes PDF (#827): Text aus der entsperrten Fassung. Das Ereignis nennt sie (`fassung`), damit ein Paket für
    // die Texterkennung sie statt des Originals liest.
    const frei = d.mime === 'application/pdf' ? await this.entsperrt?.(d.sha256).catch(() => null) : null;
    if (frei) {
      const r = await this.nurTextebene(d, await this.paket().catch(() => null), neu, signal, { info: { paket: { name: 'Ablago', version: '' } }, inhalt: frei.inhalt, herkunft: INFO_ENTSPERRT });
      return { ...r, fassung: 'application/pdf' } as OcrErgebnis;
    }
    // Der Kern liest nur die Textebene (#458, #459); Scans und Bilder erkennt das Paket – ist keins installiert,
    // wartet das Dokument, bis eins kommt.
    return this.nurTextebene(d, await this.paket().catch(() => null), neu, signal);
  }

  /**
   * Andere Dateitypen (#577): mit Fassung eines Pakets weiter wie ein PDF bzw. Bild dieses Typs; ohne Fassung, aber
   * mit zuständigem Paket wartet das Dokument auf die Umwandlung (und die Datei geht an das Paket); sonst ausgelassen
   * mit Hinweis auf ein passendes Paket.
   */
  private async umgewandelt(d: Dokument, signal: AbortSignal | undefined, neu: boolean): Promise<OcrErgebnis> {
    // Volltext aus einem Paket (#614) geht vor: Es liest das Original, nicht die Fassung.
    const vp = await this.volltextPaket?.paketFuer(d.mime).catch(() => null);
    if (vp) return this.volltextAusPaket(d, vp, neu);
    const f = await this.umwandlung?.lies(d.sha256).catch(() => null);
    if (f && DATEITYPEN[f.info.mime]) {
      const r = await this.nurTextebene({ ...d, mime: f.info.mime }, await this.paket().catch(() => null), neu, signal, f);
      return { ...r, fassung: f.info.mime } as OcrErgebnis;
    }
    const name = dateitypName(d.mime);
    const p = await this.umwandlung?.paketFuer(d.mime).catch(() => null);
    if (p && d.groesse <= UMWANDELN_MAX_BYTES) {
      await this.umwandlung!.anfordern([d]);
      // KI-Sperre (#796): Kein Dokument mit dieser Datei darf an das Paket – ausgelassen statt warten.
      if (this.umwandlung!.gesperrt?.(d.sha256)) return { stand: 'ausgelassen', info: t('pakete.fassung.ki-gesperrt', { paket: p.name }), text: null };
      return { stand: 'paket', info: infoUmwandlung(p), seiten: d.ocr?.seiten ?? null, fassung: 'wartet' } as OcrErgebnis;
    }
    if (p) return { stand: 'ausgelassen', info: t('pakete.fassung.zu-gross', { typ: name, mb: UMWANDELN_MAX_BYTES / MB }), text: null };
    const k = katalogUmwandlung(d.mime);
    if (k) return { stand: 'ausgelassen', info: t('pakete.fassung.ohne-paket', { typ: name, paket: k.name }), text: null };
    // Ein Paket aus dem Katalog liefert den Volltext (#614, z. B. Office und E-Mail): Hinweis darauf.
    const kv = katalogVolltext(d.mime);
    return { stand: 'ausgelassen', info: kv ? t('pakete.volltext.ohne-paket', { typ: name, paket: kv.name }) : t('pakete.fassung.ohne-paket-typ', { typ: name }), text: null };
  }

  /**
   * Volltext aus einem Paket (#614): gleiche Datei schon mit Text → übernehmen (außer bei „neu“); zu groß →
   * ausgelassen; sonst wartet das Dokument auf das Paket (vorhandener Text bleibt so lange stehen) und die Datei geht
   * an das Paket (in verarbeite, nach dem Speichern des Stands).
   */
  private async volltextAusPaket(d: Dokument, p: { id: string; name: string; version: string; typen: string[] }, neu: boolean): Promise<OcrErgebnis> {
    if (d.groesse > VOLLTEXT_PAKET_MAX_BYTES) return { stand: 'ausgelassen', info: t('pakete.volltext.zu-gross', { typ: dateitypName(d.mime), mb: VOLLTEXT_PAKET_MAX_BYTES / MB }), text: null };
    const vorhanden = neu ? undefined : await this.repo.ocrVonSha(d.sha256, d.id);
    if (vorhanden && hatText(vorhanden.text)) return { stand: 'fertig', text: vorhanden.text, seiten: vorhanden.seiten, info: t('meldungen.texterkennung.uebernommen-gleicher-inhalt', { wert: vorhanden.info ?? '' }).trim(), sprache: vorhanden.sprache ?? null, weitere: vorhanden.weitere ?? null, seitensprachen: vorhanden.seitensprachen ?? null };
    return { stand: 'paket', info: infoVolltextPaket(p), seiten: d.ocr?.seiten ?? null, ausPaket: p } as OcrErgebnis;
  }

  /** Datei lesen: Textebene (poppler). Mit `fassung` (#577) deren Inhalt statt der Datei des Dokuments. */
  private async lese(d: Dokument, signal?: AbortSignal, fassung?: Lesefassung): Promise<OcrErgebnis & { ohneText?: number[] }> {
    const dir = await mkdtemp(join(tmpdir(), 'dms-ocr-'));
    try {
      const pfad = join(dir, 'datei');
      await writeFile(pfad, fassung ? fassung.inhalt : await alsBuffer(await this.dateien.lies(d.sha256)));
      if (signal?.aborted) throw new Error('abgebrochen');
      const r = await this.engine(pfad, d.mime, { maxSeiten: MAX_SEITEN, werkzeuge: await this.werkzeugeLaden(), signal });
      // Erkannte Sprache am Ende des Hinweises (#395) – für Anzeige und Statistik.
      let sprache = erkenneSprache(r.text);
      // Aus der umgewandelten Fassung (#577): steht vor der Sprache im Hinweis.
      const herkunft = fassung ? ` – ${fassung.herkunft ?? infoFassung(fassung.info.paket)}` : '';
      // Sprache je Seite (#579): Wechselt sie zwischen den Seiten (oder steht eine Seite in zwei Sprachen), gilt die
      // mit dem meisten Text als Hauptsprache, die anderen als „enthält auch“; der Suchindex nimmt je Seite ihre
      // Wortstämme. Bei gemischten PDFs (gescannte Seiten erkennt das Paket) bleiben die Seiten auch einsprachig
      // gespeichert – das Paket setzt den Text damit in der richtigen Reihenfolge zusammen.
      let mehr: Pick<OcrErgebnis, 'weitere' | 'seitensprachen'> = {};
      if (r.seitenTexte && r.seitenTexte.length > 1) {
        const z = seitenZusammensetzen(r.seitenTexte.map((text) => ({ text })));
        const ds = dokumentsprachen(z.seiten, zeichenzahl(z.text));
        if (z.text === r.text && (ds.mehrsprachig || (r.ohneText?.length && hatText(r.text)))) {
          mehr = { weitere: ds.weitere, seitensprachen: z.seiten };
          if (ds.mehrsprachig && ds.sprache) sprache = { sprache: ds.sprache, konfidenz: sprache?.sprache === ds.sprache ? sprache.konfidenz : 1, schrift: sprache?.schrift ?? 'latein' };
        }
      }
      // Sprache als eigenes Feld (#400): Die Volltextsuche nimmt die Wortstämme dieser Sprache.
      return { stand: 'fertig', text: r.text, seiten: r.seiten, info: r.info + herkunft + (sprache ? spracheZuInfo(sprache) : ''), sprache: sprache && istTextsprache(sprache.sprache) ? sprache.sprache : null, ...mehr, ohneText: r.ohneText ?? [] };
    } finally { await rm(dir, { recursive: true, force: true }); }
  }

  /**
   * PDFs nur über die Textebene (#458). Ohne Text – oder bei „neu“ – wartet das Dokument auf das Paket für die
   * Texterkennung (Stand paket; ohne Paket „kein Paket installiert“); vorhandener Text bleibt so lange stehen, damit
   * die Suche ihn findet. Bilder haben keine Textebene: Sie warten gleich auf das Paket.
   */
  private async nurTextebene(d: Dokument, paket: TexterkennungPaket | null, neu: boolean, signal?: AbortSignal, fassung?: Lesefassung): Promise<OcrErgebnis> {
    const wartet: OcrErgebnis = { stand: 'paket', info: infoWartet(paket), seiten: d.ocr?.seiten ?? null };
    // Gleiche Datei schon mit Text (auch von der früheren eingebauten Texterkennung oder einem Paket): übernehmen.
    const vorhanden = neu ? undefined : await this.repo.ocrVonSha(d.sha256, d.id);
    if (vorhanden && hatText(vorhanden.text)) return { stand: 'fertig', text: vorhanden.text, seiten: vorhanden.seiten, info: t('meldungen.texterkennung.uebernommen-gleicher-inhalt', { wert: vorhanden.info ?? '' }).trim(), sprache: vorhanden.sprache ?? null, weitere: vorhanden.weitere ?? null, seitensprachen: vorhanden.seitensprachen ?? null };
    if (d.mime !== 'application/pdf') return wartet;
    const r = await this.lese(d, signal, fassung);
    // Gemischt (Text und gescannte Seiten): wartet auch auf das Paket – es erkennt nur die Seiten ohne Text. „Neu“ ohne
    // Paket ändert nichts: Der Text aus dem PDF gilt.
    const ohne = (r as OcrErgebnis & { ohneText?: number[] }).ohneText ?? [];
    if (r.text && hatText(r.text) && !ohne.length && (!neu || !paket)) return r;
    return { ...wartet, seiten: r.seiten ?? null, ...(r.text && hatText(r.text) ? { text: r.text, sprache: r.sprache, weitere: r.weitere, seitensprachen: r.seitensprachen, ohneText: ohne } : {}) } as OcrErgebnis;
  }

  /**
   * Sofort und ohne Warteschlange (#391, „Aus Dokument ausfüllen“): Text einer Datei, die (noch) nicht
   * gespeichert ist – höchstens 5 Seiten. Seit #459 nur die Textebene von PDFs: Fotos und Scans erkennt allein das
   * Paket, und das erst nach dem Speichern.
   */
  async erkenneSofort(inhalt: Buffer, mime: string): Promise<{ text: string; info: string }> {
    if (mime !== 'application/pdf') throw new Fachfehler(422, t('meldungen.texterkennung.fotos-und-bilder-liest'));
    const dir = await mkdtemp(join(tmpdir(), 'dms-sofort-'));
    try {
      const pfad = join(dir, 'datei');
      await writeFile(pfad, inhalt);
      const r = await this.engine(pfad, mime, { maxSeiten: 5, werkzeuge: await this.werkzeugeLaden() });
      return { text: r.text, info: r.info };
    } finally { await rm(dir, { recursive: true, force: true }); }
  }

  /** Für die Werkbank: Stand der Warteschlange und der Werkzeuge. */
  /** Liste der Aufträge eines Stands für die Werkbank (#61). */
  auftraege(q: { stand?: unknown; von?: unknown; anzahl?: unknown }) {
    const stand = (typeof q.stand === 'string' && q.stand in OCR_STAENDE ? q.stand : 'fehler') as OcrStandArt;
    const von = Math.max(0, Math.floor(Number(q.von) || 0));
    const anzahl = Math.min(200, Math.max(1, Math.floor(Number(q.anzahl) || 100)));
    return this.repo.ocrAuftraege({ stand, von, anzahl });
  }

  /** Ein Dokument ausdrücklich neu erkennen lassen (#458): in die Warteschlange, das Paket bekommt `neu`. */
  async neuErkennen(id: string) {
    this.laeufe.get(id)?.abort();
    this.neuMarken.add(id);
    await this.repo.ocrEinreihen([id]);
    this.anstossen();
  }

  /** Neu starten: zurück in die Warteschlange (#61); bei „fertig“ ausdrücklich neu (#458). */
  async neuStarten(ids: unknown, von: string) {
    const liste = Array.isArray(ids) ? ids.filter((x): x is string => typeof x === 'string') : [];
    if (!liste.length) throw new Fachfehler(422, t('meldungen.texterkennung.keine-dokumente-gewaehlt'));
    for (const id of liste) this.laeufe.get(id)?.abort();
    for (const id of liste) this.neuMarken.add(id);
    // Wartet ein Dokument auf das Paket, kommt sein Ereignis gleich neu – das alte fällt weg.
    await this.repo.loescheOffeneEreignisse('volltext.fertig', liste).catch(() => 0);
    await this.repo.loescheOffeneEreignisse('datei.volltext', liste).catch(() => 0);
    await this.repo.ocrEinreihen(liste);
    log.info('Texterkennung neu gestartet', { dokumente: liste.length, von });
    this.anstossen();
    return { eingereiht: liste.length };
  }

  /** „Fehler“ insgesamt neu starten. */
  async fehlerNeuStarten(von: string) {
    const ids: string[] = [];
    for (let seite = 0; ; seite += 200) {
      const r = await this.repo.ocrAuftraege({ stand: 'fehler', von: seite, anzahl: 200 });
      ids.push(...r.eintraege.map((e) => e.dokument.id));
      if (r.eintraege.length < 200) break;
    }
    if (!ids.length) return { eingereiht: 0 };
    return this.neuStarten(ids, von);
  }

  /** Abbrechen bzw. aus der Warteschlange nehmen: wartende werden ausgelassen, laufende beendet (#61). */
  async abbrechen(ids: unknown, von: string) {
    const liste = Array.isArray(ids) ? ids.filter((x): x is string => typeof x === 'string') : [];
    if (!liste.length) throw new Fachfehler(422, t('meldungen.texterkennung.keine-dokumente-gewaehlt'));
    let n = 0;
    for (const id of liste) {
      const lauf = this.laeufe.get(id);
      if (lauf) { lauf.abort(); n++; continue; }
      const d = await this.repo.holeDokument(id);
      if (d?.ocr?.stand === 'wartet') { await this.repo.ocrSetze(id, { stand: 'ausgelassen', info: t('meldungen.texterkennung.vom-administrator-abgebrochen'), text: null }); n++; }
      // Wartet es auf das Paket (#458): Ereignis verwerfen, Text aus dem PDF bleibt.
      if (d?.ocr?.stand === 'paket') {
        await this.repo.loescheOffeneEreignisse('volltext.fertig', [id]);
        await this.repo.loescheOffeneEreignisse('datei.volltext', [id]);
        await this.repo.ocrSetze(id, { stand: 'ausgelassen', info: t('meldungen.texterkennung.texterkennung-durch-paket-vom'), seiten: d.ocr.seiten ?? null });
        n++;
      }
    }
    log.info('Texterkennung abgebrochen', { dokumente: n, von });
    return { abgebrochen: n };
  }

  /** Nur die Zähler, z. B. für die Übersicht der Werkbank (#68). */
  zaehler() { return this.repo.ocrZaehler(); }

  async status(werkzeugeNeu = false) {
    const werkzeuge = await this.werkzeugeLaden(werkzeugeNeu);
    const einstellungen = await this.optionen();
    return {
      zaehler: await this.repo.ocrZaehler(), laufend: this.laufend, werkzeuge, einstellungen, dateitypen: DATEITYPEN,
      // #458: Paket, das die Texterkennung übernimmt (null = keins installiert).
      paket: await this.paket().catch(() => null),
      // #459: woher der Text der Dokumente kommt; erkannte Sprachen der fertigen Dokumente (#395).
      herkunft: await this.repo.volltextHerkunft(),
      erkannteSprachen: await this.repo.ocrSprachen(),
    };
  }
}
