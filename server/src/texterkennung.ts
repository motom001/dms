import { execFile } from 'node:child_process';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Readable } from 'node:stream';
import type { Dokument } from '../../shared/src/model';
import type { Dateispeicher } from './dateispeicher';
import type { Einstellungen } from './einstellungen';
import { Fachfehler } from './fehler';
import { protokoll } from './protokoll';
import type { OcrErgebnis, Repo } from './repo';

/**
 * Texterkennung und Volltext (#45).
 *
 * - PDFs: zuerst die vorhandene Textebene (pdftotext); nur Seiten ohne Text gehen durch
 *   die Texterkennung (pdftoppm → tesseract).
 * - Bilder: direkt durch tesseract.
 * - Eine Warteschlange in der Datenbank (ocr_stand); die Arbeit läuft im Hintergrund mit
 *   einstellbar vielen gleichzeitigen Aufträgen. Nach einem Neustart geht es weiter.
 * - Gleiche Datei schon erkannt? Dann wird der Text übernommen.
 */

const log = protokoll.modul('dokumente');

export const VERFAHREN = { tesseract: 'Tesseract (im DMS enthalten)', aus: 'keine Texterkennung' } as const;
export type Verfahren = keyof typeof VERFAHREN;

/** Dateitypen, die die Texterkennung kennt, mit Bezeichnung. */
export const DATEITYPEN: Record<string, string> = {
  'application/pdf': 'PDF',
  'image/jpeg': 'JPEG-Bild',
  'image/png': 'PNG-Bild',
  'image/tiff': 'TIFF-Bild',
  'image/webp': 'WebP-Bild',
  'image/gif': 'GIF-Bild',
  'image/bmp': 'BMP-Bild',
};

export interface OcrEinstellungen {
  /** Texterkennung überhaupt an. */
  aktiv: boolean;
  /** Gleichzeitige Aufträge (1–4). */
  auftraege: number;
  /** Höchstens so viele Seiten je Dokument (weitere werden nicht gelesen). */
  maxSeiten: number;
  /** Größere Dateien werden ausgelassen (MB). */
  maxMB: number;
  /** Sprachen für tesseract, z. B. deu+eng. */
  sprachen: string;
  /** Verfahren je Dateityp; „aus“ = Dateityp ausgeschlossen. */
  typen: Record<string, Verfahren>;
}

export const OCR_STANDARD: OcrEinstellungen = {
  aktiv: true, auftraege: 1, maxSeiten: 50, maxMB: 50, sprachen: 'deu+eng',
  typen: Object.fromEntries(Object.keys(DATEITYPEN).map((t) => [t, 'tesseract' as Verfahren])),
};

export function bereinigeOcr(e: unknown, alt: OcrEinstellungen = OCR_STANDARD): OcrEinstellungen {
  const x = (e ?? {}) as Record<string, unknown>;
  const ganz = (v: unknown, min: number, max: number, std: number, name: string) => {
    if (v === undefined) return std;
    const n = Number(v);
    if (!Number.isInteger(n) || n < min || n > max) throw new Fachfehler(422, `${name}: eine ganze Zahl von ${min} bis ${max}.`);
    return n;
  };
  const sprachen = x.sprachen === undefined ? alt.sprachen : String(x.sprachen).trim();
  if (!/^[a-z_]{3,10}(\+[a-z_]{3,10}){0,5}$/.test(sprachen)) throw new Fachfehler(422, 'Sprachen wie deu oder deu+eng angeben.');
  const typen: Record<string, Verfahren> = { ...alt.typen };
  if (x.typen && typeof x.typen === 'object') {
    for (const [t, v] of Object.entries(x.typen as Record<string, unknown>)) {
      if (DATEITYPEN[t] && (v === 'tesseract' || v === 'aus')) typen[t] = v;
    }
  }
  return {
    aktiv: x.aktiv === undefined ? alt.aktiv : x.aktiv === true,
    auftraege: ganz(x.auftraege, 1, 4, alt.auftraege, 'Gleichzeitige Aufträge'),
    maxSeiten: ganz(x.maxSeiten, 1, 1000, alt.maxSeiten, 'Höchstens Seiten'),
    maxMB: ganz(x.maxMB, 1, 100, alt.maxMB, 'Höchstens MB'),
    sprachen,
    typen,
  };
}

/* ---------- Werkzeuge ---------- */

interface Lauf { stdout: string; stderr: string }
function starte(cmd: string, args: string[], ms: number): Promise<Lauf> {
  return new Promise((ok, fehler) => {
    execFile(cmd, args, { timeout: ms, maxBuffer: 64 * 1024 * 1024, encoding: 'utf8' }, (e, stdout, stderr) => {
      if (e) {
        const f = e as NodeJS.ErrnoException & { killed?: boolean };
        fehler(new Error(f.code === 'ENOENT' ? `${cmd} ist nicht installiert.` : f.killed ? `${cmd} brauchte zu lange (über ${Math.round(ms / 1000)} s).` : (stderr || f.message).trim().split('\n').slice(-2).join(' ')));
      } else ok({ stdout, stderr });
    });
  });
}

export interface Werkzeuge {
  tesseract: string | null;
  sprachen: string[];
  pdftotext: boolean;
  pdftoppm: boolean;
}

/** Was ist installiert? (Für die Werkbank und die Wahl der Sprachen.) */
export async function pruefeWerkzeuge(): Promise<Werkzeuge> {
  const version = await starte('tesseract', ['--version'], 10_000).then((r) => (r.stdout || r.stderr).split('\n')[0].trim(), () => null);
  const sprachen = version
    ? await starte('tesseract', ['--list-langs'], 10_000).then((r) => (r.stdout + r.stderr).split('\n').slice(1).map((s) => s.trim()).filter((s) => /^[a-z_]+$/.test(s) && s !== 'osd'), () => [])
    : [];
  const da = (cmd: string) => starte(cmd, ['-v'], 10_000).then(() => true, (e: Error) => !/nicht installiert/.test(e.message));
  return { tesseract: version, sprachen, pdftotext: await da('pdftotext'), pdftoppm: await da('pdftoppm') };
}

/** Text eines Dokuments (Datei liegt unter pfad). */
export type Engine = (pfad: string, mime: string, o: { maxSeiten: number; sprachen: string; werkzeuge: Werkzeuge }) => Promise<{ text: string; seiten: number; info: string }>;

const sauber = (t: string) => t.replace(/\r/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
/** Seite mit nennenswertem Text (sonst: gescannt). */
const hatText = (t: string) => t.replace(/\s/g, '').length >= 20;

export const tesseractEngine: Engine = async (pfad, mime, o) => {
  const sprachen = o.sprachen.split('+').filter((s) => o.werkzeuge.sprachen.includes(s)).join('+') || o.werkzeuge.sprachen[0] || 'eng';
  const ocr = async (bild: string) => {
    if (!o.werkzeuge.tesseract) throw new Error('Die Texterkennung (tesseract) ist nicht installiert.');
    return (await starte('tesseract', [bild, 'stdout', '-l', sprachen], 180_000)).stdout;
  };
  if (mime !== 'application/pdf') {
    return { text: sauber(await ocr(pfad)), seiten: 1, info: `Texterkennung (${sprachen})` };
  }
  if (!o.werkzeuge.pdftotext) throw new Error('pdftotext (poppler) ist nicht installiert.');
  const info = await starte('pdfinfo', [pfad], 30_000).then((r) => r.stdout, () => '');
  const gesamt = Number(/^Pages:\s+(\d+)/m.exec(info)?.[1] ?? 1);
  const seiten = Math.min(gesamt, o.maxSeiten);
  // Ganze Textebene auf einmal; Seiten sind durch Seitenvorschub (\f) getrennt.
  const ebene = (await starte('pdftotext', ['-f', '1', '-l', String(seiten), '-layout', '-enc', 'UTF-8', pfad, '-'], 120_000)).stdout.split('\f');
  let erkannt = 0;
  const texte: string[] = [];
  for (let i = 0; i < seiten; i++) {
    const t = ebene[i] ?? '';
    if (hatText(t) || !o.werkzeuge.tesseract || !o.werkzeuge.pdftoppm) { texte.push(t); continue; }
    const dir = await mkdtemp(join(tmpdir(), 'dms-seite-'));
    try {
      await starte('pdftoppm', ['-f', String(i + 1), '-l', String(i + 1), '-r', '300', '-gray', '-png', pfad, join(dir, 's')], 120_000);
      const [bild] = (await readdir(dir)).filter((f) => f.endsWith('.png'));
      texte.push(bild ? await ocr(join(dir, bild)) : '');
      erkannt++;
    } finally { await rm(dir, { recursive: true, force: true }); }
  }
  const woher = erkannt === 0 ? 'Textebene des PDFs' : erkannt === seiten ? `Texterkennung (${sprachen})` : `Textebene und Texterkennung für ${erkannt} von ${seiten} Seiten (${sprachen})`;
  const gekuerzt = gesamt > seiten ? ` – nur die ersten ${seiten} von ${gesamt} Seiten` : '';
  return { text: sauber(texte.join('\n\n')), seiten, info: woher + gekuerzt };
};

/* ---------- Warteschlange ---------- */

const alsBuffer = async (x: Readable | Buffer): Promise<Buffer> => {
  if (Buffer.isBuffer(x)) return x;
  const teile: Buffer[] = [];
  for await (const c of x) teile.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
  return Buffer.concat(teile);
};

export class Texterkennung {
  private laufend = 0;
  private werkzeuge?: Promise<Werkzeuge>;
  private aus = false;

  constructor(
    private repo: Repo,
    private dateien: Dateispeicher,
    private einstellungen?: Einstellungen,
    private engine: Engine = tesseractEngine,
    private pruefe: () => Promise<Werkzeuge> = pruefeWerkzeuge,
  ) {}

  async optionen(): Promise<OcrEinstellungen> {
    const e = this.einstellungen ? await this.einstellungen.lies('ocr') : null;
    return e ? bereinigeOcr(e) : OCR_STANDARD;
  }

  async speichere(e: unknown): Promise<OcrEinstellungen> {
    if (!this.einstellungen) throw new Fachfehler(404, 'Die Texterkennung ist nicht eingerichtet.');
    const neu = bereinigeOcr(e, await this.optionen());
    await this.einstellungen.schreibe('ocr', neu);
    protokoll.modul('werkbank').info('Einstellungen der Texterkennung geändert', { aktiv: neu.aktiv, auftraege: neu.auftraege, maxSeiten: neu.maxSeiten, maxMB: neu.maxMB, sprachen: neu.sprachen });
    this.anstossen();
    return neu;
  }

  werkzeugeLaden(neu = false) {
    if (neu || !this.werkzeuge) this.werkzeuge = this.pruefe();
    return this.werkzeuge;
  }

  /** Beim Start: Unterbrochenes wieder einreihen und loslegen. */
  async start() {
    const n = await this.repo.ocrZurueckstellen();
    if (n) log.info('Unterbrochene Texterkennung wird fortgesetzt', { dokumente: n });
    const w = await this.werkzeugeLaden();
    log.info(w.tesseract ? `Texterkennung bereit: ${w.tesseract} (${w.sprachen.join(', ') || 'keine Sprachen'})` : 'Texterkennung (tesseract) nicht installiert – nur PDFs mit Textebene bekommen einen Volltext.');
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
    if (!o.aktiv) return;
    while (!this.aus && this.laufend < o.auftraege) {
      // Platz vor dem Warten reservieren, sonst nehmen sich zwei Durchläufe zu viele Aufträge.
      this.laufend++;
      const d = await this.repo.ocrNaechster().catch((e) => { this.laufend--; throw e; });
      if (!d) { this.laufend--; return; }
      void this.verarbeite(d, o).finally(() => { this.laufend--; this.anstossen(); });
    }
  }

  /** Ein Dokument: auslassen, Text übernehmen oder erkennen. */
  private async verarbeite(d: Dokument, o: OcrEinstellungen) {
    const start = Date.now();
    let e: OcrErgebnis;
    try {
      e = await this.ergebnis(d, o);
    } catch (f) {
      e = { stand: 'fehler', info: (f as Error).message.slice(0, 500) };
    }
    try { await this.repo.ocrSetze(d.id, e); } catch (f) { log.error('Ergebnis der Texterkennung nicht gespeichert', { dokument: d.name, fehler: (f as Error).message }); return; }
    const daten = { dokument: d.name, id: d.id, stand: e.stand, seiten: e.seiten ?? undefined, ms: Date.now() - start, info: e.info ?? undefined };
    if (e.stand === 'fehler') log.warn('Texterkennung fehlgeschlagen', daten); else log.info('Texterkennung abgeschlossen', daten);
  }

  private async ergebnis(d: Dokument, o: OcrEinstellungen): Promise<OcrErgebnis> {
    const verfahren = o.typen[d.mime];
    if (!verfahren) return { stand: 'ausgelassen', info: `Dateityp ${d.mime} wird nicht erkannt.`, text: null };
    if (verfahren === 'aus') return { stand: 'ausgelassen', info: `Für ${DATEITYPEN[d.mime] ?? d.mime} ist die Texterkennung ausgeschaltet.`, text: null };
    if (d.groesse > o.maxMB * 1024 * 1024) return { stand: 'ausgelassen', info: `Größer als ${o.maxMB} MB.`, text: null };
    const vorhanden = await this.repo.ocrVonSha(d.sha256, d.id);
    if (vorhanden) return { stand: 'fertig', text: vorhanden.text, seiten: vorhanden.seiten, info: `übernommen (gleicher Inhalt): ${vorhanden.info ?? ''}`.trim() };
    const dir = await mkdtemp(join(tmpdir(), 'dms-ocr-'));
    try {
      const pfad = join(dir, 'datei');
      await writeFile(pfad, await alsBuffer(await this.dateien.lies(d.sha256)));
      const r = await this.engine(pfad, d.mime, { maxSeiten: o.maxSeiten, sprachen: o.sprachen, werkzeuge: await this.werkzeugeLaden() });
      return { stand: 'fertig', text: r.text, seiten: r.seiten, info: r.info };
    } finally { await rm(dir, { recursive: true, force: true }); }
  }

  /** Für die Werkbank: Stand der Warteschlange und der Werkzeuge. */
  async status(werkzeugeNeu = false) {
    return { zaehler: await this.repo.ocrZaehler(), laufend: this.laufend, werkzeuge: await this.werkzeugeLaden(werkzeugeNeu), einstellungen: await this.optionen(), verfahren: VERFAHREN, dateitypen: DATEITYPEN };
  }
}
