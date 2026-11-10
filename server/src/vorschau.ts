import { execFile } from './hintergrund';
import { mkdir, mkdtemp, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Readable } from 'node:stream';
import type { Dokument } from '../../shared/src/model';
import type { Dateispeicher } from './dateispeicher';
import { protokoll } from './protokoll';
import { bildSeitePdf } from './pdf';
import { AUSGABE_MITTEL, VORSCHAU_MAX_BYTES } from './grenzen';

/**
 * Vorschaubilder der ersten Seite (#332).
 *
 * - Klein (längste Seite 104 px – scharf bei 40 × 52 px auf hochauflösenden Bildschirmen), als JPEG.
 * - PDFs: erste Seite mit pdftoppm (poppler, schon für die Texterkennung im Image).
 * - JPEG und PNG: in ein einseitiges PDF gelegt (pdf-lib, ohne Neuberechnung der Pixel) und
 *   ebenso mit pdftoppm verkleinert – kein zusätzliches Werkzeug im Image.
 * - Andere Dateitypen (TIFF, WebP, HEIC, Office …): aus der umgewandelten Fassung eines Pakets (#577, PDF, PNG oder
 *   JPEG – wie oben) oder aus dem Vorschaubild, das das Paket selbst liefert; ohne Paket zeigt die Oberfläche das
 *   Dateisymbol.
 * - Geschützte PDFs (#827): aus der entsperrten Fassung, sobald es sie gibt (gleiche Quelle `fassung`).
 * - Einmal erzeugt im Hintergrund, abgelegt nach Prüfwert und VERSION – nicht bei jedem Aufruf.
 *   Ein fehlgeschlagener Versuch wird gemerkt und erst mit einer neuen VERSION wiederholt.
 * - Ablage außerhalb des Haushaltsordners: Vorschaubilder werden nicht gesichert (lassen sich neu erzeugen).
 */

const log = protokoll.modul('vorschau');

/** Erhöhen, wenn sich Größe oder Verfahren ändern: dann entstehen alle Bilder neu. */
export const VORSCHAU_VERSION = 1;
/** Längste Seite in Pixeln (2 × 52 px). */
export const VORSCHAU_PX = 104;
export { VORSCHAU_MAX_BYTES };
export const VORSCHAU_TYPEN = ['application/pdf', 'image/jpeg', 'image/png'] as const;

export const hatVorschau = (mime: string) => (VORSCHAU_TYPEN as readonly string[]).includes(mime);

/** Ablage der Vorschaubilder: Bild (JPEG) oder „fehlgeschlagen“ je Prüfwert. */
export interface VorschauAblage {
  lies(sha: string): Promise<Buffer | null>;
  schreibe(sha: string, bild: Buffer): Promise<void>;
  istFehlgeschlagen(sha: string): Promise<boolean>;
  merkeFehler(sha: string): Promise<void>;
  loesche(sha: string): Promise<void>;
  belegung(): Promise<{ anzahl: number; bytes: number }>;
}

const pruefeSha = (sha: string) => {
  if (!/^[0-9a-f]{64}$/.test(sha)) throw new Error('Ungültiger Prüfwert');
  return sha;
};

/** Dateisystem: <wurzel>/<ab>/<sha256>.v<VERSION>.jpg bzw. .fehler */
export function ordnerAblage(wurzel: string): VorschauAblage {
  const pfad = (sha: string, endung: 'jpg' | 'fehler') => join(wurzel, pruefeSha(sha).slice(0, 2), `${sha}.v${VORSCHAU_VERSION}.${endung}`);
  const lege = async (ziel: string, inhalt: Buffer) => {
    await mkdir(join(ziel, '..'), { recursive: true });
    const tmp = `${ziel}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(tmp, inhalt);
    await rename(tmp, ziel);
  };
  return {
    lies: (sha) => readFile(pfad(sha, 'jpg')).catch(() => null),
    schreibe: (sha, bild) => lege(pfad(sha, 'jpg'), bild),
    istFehlgeschlagen: (sha) => stat(pfad(sha, 'fehler')).then(() => true, () => false),
    merkeFehler: (sha) => lege(pfad(sha, 'fehler'), Buffer.alloc(0)),
    async loesche(sha) {
      await rm(pfad(sha, 'jpg'), { force: true });
      await rm(pfad(sha, 'fehler'), { force: true });
    },
    async belegung() {
      let anzahl = 0; let bytes = 0;
      const ordner = await readdir(wurzel).catch(() => [] as string[]);
      for (const o of ordner) {
        for (const n of await readdir(join(wurzel, o)).catch(() => [] as string[])) {
          if (!n.endsWith('.jpg')) continue;
          const s = await stat(join(wurzel, o, n)).catch(() => null);
          if (s?.isFile()) { anzahl++; bytes += s.size; }
        }
      }
      return { anzahl, bytes };
    },
  };
}

/** Im Arbeitsspeicher (Tests). */
export function speicherAblage(): VorschauAblage & { bilder: Map<string, Buffer> } {
  const bilder = new Map<string, Buffer>();
  const fehler = new Set<string>();
  return {
    bilder,
    lies: async (sha) => bilder.get(sha) ?? null,
    schreibe: async (sha, bild) => { bilder.set(pruefeSha(sha), bild); },
    istFehlgeschlagen: async (sha) => fehler.has(sha),
    merkeFehler: async (sha) => { fehler.add(sha); },
    loesche: async (sha) => { bilder.delete(sha); fehler.delete(sha); },
    belegung: async () => ({ anzahl: bilder.size, bytes: [...bilder.values()].reduce((s, b) => s + b.length, 0) }),
  };
}

/** Erzeugt das Vorschaubild aus dem Inhalt; null = für diesen Inhalt keins. */
export type Erzeuger = (inhalt: Buffer, mime: string) => Promise<Buffer | null>;

function starte(cmd: string, args: string[], ms: number): Promise<void> {
  return new Promise((ok, fehler) => {
    execFile(cmd, args, { timeout: ms, maxBuffer: AUSGABE_MITTEL }, (e, _out, err) => {
      if (!e) { ok(); return; }
      const f = e as NodeJS.ErrnoException & { killed?: boolean };
      fehler(new Error(f.code === 'ENOENT' ? `${cmd} ist nicht installiert.` : f.killed ? `${cmd} brauchte zu lange.` : String(err || f.message).trim().split('\n').slice(-2).join(' ')));
    });
  });
}

/** Erste Seite mit pdftoppm als JPEG, längste Seite VORSCHAU_PX. */
export const popplerErzeuger: Erzeuger = async (inhalt, mime) => {
  if (!hatVorschau(mime)) return null;
  const dir = await mkdtemp(join(tmpdir(), 'dms-vorschau-'));
  try {
    const pdf = join(dir, 'datei.pdf');
    await writeFile(pdf, mime === 'application/pdf' ? inhalt : await bildSeitePdf(inhalt, mime));
    await starte('pdftoppm', ['-f', '1', '-l', '1', '-singlefile', '-scale-to', String(VORSCHAU_PX), '-jpeg', '-jpegopt', 'quality=80', pdf, join(dir, 'bild')], 60_000);
    return await readFile(join(dir, 'bild.jpg'));
  } finally { await rm(dir, { recursive: true, force: true }); }
};

const alsBuffer = async (x: Readable | Buffer): Promise<Buffer> => {
  if (Buffer.isBuffer(x)) return x;
  const teile: Buffer[] = [];
  for await (const c of x) teile.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
  return Buffer.concat(teile);
};

type Auftrag = Pick<Dokument, 'sha256' | 'mime' | 'groesse' | 'name'> & { fassung?: boolean };
/** Umgewandelte Fassung einer Datei (#577), aus der das Vorschaubild entsteht. */
export type FassungsQuelle = (sha: string) => Promise<{ info: { mime: string }; inhalt: Buffer } | null>;

export class Vorschaubilder {
  private warteschlange = new Map<string, Auftrag>();
  private laeuft = false;
  private aus = false;
  /** Im aktiven Wartungsmodus keine Arbeit; danach anstossen(). */
  pause: () => boolean = () => false;
  /** Für Tests: wartet, bis die Warteschlange leer ist. */
  private leer: Array<() => void> = [];

  /** Fassungen aus Paketen (#577) für Dateitypen, die der Kern nicht selbst liest. */
  fassung: FassungsQuelle = async () => null;

  constructor(private ablage: VorschauAblage, private dateien: Dateispeicher, private erzeuger: Erzeuger = popplerErzeuger) {}

  /** Vorschaubild eines Dokuments; null = (noch) keins. Fehlt es, wird es eingereiht. */
  async bild(d: Auftrag): Promise<Buffer | null> {
    if (!hatVorschau(d.mime)) {
      // Andere Dateitypen (#577): aus der Fassung eines Pakets bzw. das Vorschaubild des Pakets.
      const b = await this.ablage.lies(d.sha256);
      if (b) return b;
      if (!(await this.ablage.istFehlgeschlagen(d.sha256)) && (await this.fassung(d.sha256).catch(() => null))) this.ausFassung([d]);
      return null;
    }
    if (d.groesse > VORSCHAU_MAX_BYTES) return null;
    const b = await this.ablage.lies(d.sha256);
    if (b) return b;
    if (!(await this.ablage.istFehlgeschlagen(d.sha256))) this.einreihen([d]);
    return null;
  }

  /**
   * Vorschaubild aus der umgewandelten Fassung (#577): einreihen, auch wenn ein früherer Versuch fehlschlug (die
   * Fassung ist neu). Ein vorhandenes Bild bleibt.
   */
  ausFassung(docs: Auftrag[]) {
    let neu = 0;
    for (const d of docs) {
      // PDFs nur mit entsperrter Fassung (#827) – die Quelle liefert für PDFs nichts anderes.
      if ((hatVorschau(d.mime) && d.mime !== 'application/pdf') || this.warteschlange.has(d.sha256)) continue;
      this.warteschlange.set(d.sha256, { sha256: d.sha256, mime: d.mime, groesse: d.groesse, name: d.name, fassung: true });
      neu++;
    }
    if (neu) this.anstossen();
    return neu;
  }

  /** Vorschaubild, das ein Paket liefert (#577): auf die Größe des Kerns verkleinert, ersetzt ein vorhandenes. */
  async setze(sha: string, bild: Buffer, mime: string) {
    const klein = await this.erzeuger(bild, mime);
    if (!klein) throw new Error('kein Vorschaubild');
    await this.ablage.loesche(sha);
    await this.ablage.schreibe(sha, klein);
  }

  /** Dokumente in die Warteschlange (z. B. nach dem Hochladen); Unpassendes wird übergangen. */
  einreihen(docs: Auftrag[]) {
    let neu = 0;
    for (const d of docs) {
      if (!hatVorschau(d.mime) || d.groesse > VORSCHAU_MAX_BYTES || this.warteschlange.has(d.sha256)) continue;
      this.warteschlange.set(d.sha256, { sha256: d.sha256, mime: d.mime, groesse: d.groesse, name: d.name });
      neu++;
    }
    if (neu) this.anstossen();
    return neu;
  }

  /** Wie viele warten gerade. */
  get wartend() { return this.warteschlange.size; }

  /** Nachholen für vorhandene Dokumente (Werkbank → Wartungsoperationen): nur, was noch fehlt. */
  async nachholen(docs: Auftrag[]) {
    const fehlt: Auftrag[] = [];
    const gesehen = new Set<string>();
    const ausFassung: Auftrag[] = [];
    for (const d of docs) {
      if (gesehen.has(d.sha256)) continue;
      gesehen.add(d.sha256);
      // Andere Dateitypen (#577): nur mit Fassung eines Pakets.
      if (!hatVorschau(d.mime)) {
        if (!(await this.ablage.lies(d.sha256)) && (await this.fassung(d.sha256).catch(() => null))) ausFassung.push(d);
        continue;
      }
      if (d.groesse > VORSCHAU_MAX_BYTES) continue;
      if (await this.ablage.lies(d.sha256)) continue;
      fehlt.push(d);
    }
    this.einreihen(fehlt);
    this.ausFassung(ausFassung);
    fehlt.push(...ausFassung);
    if (fehlt.length) log.info('Vorschaubilder nachholen', { dokumente: fehlt.length });
    return fehlt.length;
  }

  /** Datei gelöscht (kein Dokument zeigt mehr darauf): Vorschaubild mit weg. */
  async entferne(sha: string) {
    this.warteschlange.delete(sha);
    await this.ablage.loesche(sha).catch(() => {});
  }

  belegung() { return this.ablage.belegung(); }

  stop() { this.aus = true; }

  anstossen() {
    if (this.laeuft || this.aus || this.pause()) return;
    this.laeuft = true;
    void this.pumpe().catch((e) => log.error('Vorschaubilder gestört', { fehler: (e as Error).message })).finally(() => {
      this.laeuft = false;
      if (!this.warteschlange.size) for (const f of this.leer.splice(0)) f();
    });
  }

  /** Für Tests: bis alles erzeugt ist. */
  fertig(): Promise<void> {
    if (!this.warteschlange.size && !this.laeuft) return Promise.resolve();
    return new Promise((ok) => this.leer.push(ok));
  }

  /** Einer nach dem anderen – Vorschaubilder sollen das Gerät nicht auslasten. */
  private async pumpe() {
    while (!this.aus && !this.pause()) {
      const [sha, d] = this.warteschlange.entries().next().value ?? [];
      if (!sha || !d) return;
      try {
        if (!(await this.ablage.lies(sha))) {
          // Andere Dateitypen (#577): aus der Fassung (PDF, PNG oder JPEG) des Pakets; geschützte PDFs (#827) aus der
          // entsperrten Fassung, sobald es sie gibt.
          const f = d.fassung || d.mime === 'application/pdf' ? await this.fassung(sha).catch(() => null) : null;
          if (d.fassung && !f) continue;
          if (f) await this.ablage.loesche(sha);
          const bild = f ? await this.erzeuger(f.inhalt, f.info.mime) : await this.erzeuger(await alsBuffer(await this.dateien.lies(sha)), d.mime);
          if (bild) await this.ablage.schreibe(sha, bild); else await this.ablage.merkeFehler(sha);
        }
      } catch (e) {
        await this.ablage.merkeFehler(sha).catch(() => {});
        log.info('Kein Vorschaubild', { dokument: d.name, fehler: (e as Error).message.slice(0, 300) });
      } finally {
        this.warteschlange.delete(sha);
      }
    }
  }
}
