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
 * - Archivfassung (PDF/A, #631, #1216) als letzte Quelle, z. B. für E-Mails. Reihenfolge: Datei selbst → entsperrte
 *   bzw. Lesefassung → Archivfassung → (ohne Bild) Kästchen mit der Endung in der Oberfläche. Geschützte PDFs wie
 *   bisher zuerst aus der entsperrten Fassung – das Original ist ohne Passwort nicht lesbar, das Bild dasselbe.
 * - Einmal erzeugt im Hintergrund, abgelegt nach Prüfwert und VERSION – nicht bei jedem Aufruf.
 *   Ein fehlgeschlagener Versuch wird gemerkt und erst mit einer neuen VERSION wiederholt – oder sobald es eine
 *   Archivfassung gibt, die jünger ist als der Fehlversuch (#1216).
 * - Bestand (#1216): Dokumente mit Archivfassung und ohne Bild holt ein Zeitplan nach (`nachlaufArchiv`) – in einer
 *   eigenen Warteschlange mit Nachrang: erst wenn nichts anderes wartet, mit einer Pause vor jedem Bild. Der Stand
 *   liegt für alle Prozesse im Kurzzustand (Werkbank → Suche und Volltext → Archivfassung).
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
  /** Wann der letzte Versuch fehlschlug (ms), null = nie (#1216: eine jüngere Archivfassung gilt als neue Quelle). */
  fehlerSeit(sha: string): Promise<number | null>;
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
    fehlerSeit: (sha) => stat(pfad(sha, 'fehler')).then((x) => x.mtimeMs, () => null),
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
  const fehler = new Map<string, number>();
  return {
    bilder,
    lies: async (sha) => bilder.get(sha) ?? null,
    schreibe: async (sha, bild) => { bilder.set(pruefeSha(sha), bild); },
    istFehlgeschlagen: async (sha) => fehler.has(sha),
    fehlerSeit: async (sha) => fehler.get(sha) ?? null,
    merkeFehler: async (sha) => { fehler.set(sha, Date.now()); },
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

type Auftrag = Pick<Dokument, 'sha256' | 'mime' | 'groesse' | 'name'>;
/** Umgewandelte Fassung einer Datei (#577), aus der das Vorschaubild entsteht. */
export type FassungsQuelle = (sha: string) => Promise<{ info: { mime: string }; inhalt: Buffer } | null>;
/**
 * Archivfassung (PDF/A, #631) als Quelle (#1216): Angaben ohne Inhalt (für die Prüfung beim Anzeigen) und mit Inhalt.
 * `imOriginal`: Das Original ist selbst PDF/A – keine eigene Quelle.
 */
export interface ArchivQuelle {
  info(sha: string): Promise<{ erstellt: string; groesse: number; imOriginal?: boolean } | null>;
  lies(sha: string): Promise<{ inhalt: Buffer } | null>;
}
/** Stand des Nachlaufs für den Bestand (#1216): offen, erstellt, ohne Bild (Fehler), seit wann, zuletzt geschrieben. */
export interface NachlaufStand { offen: number; erledigt: number; ohne: number; seit: string; zeit: string }
/** Wo der Stand liegt, damit jeder Prozess ihn zeigen kann (Kurzzustand in der Datenbank). */
export interface NachlaufSpeicher { lies(): Promise<NachlaufStand | null>; schreibe(s: NachlaufStand): Promise<void> }

/** Höchstens so viele Dokumente je Lauf des Nachlaufs in der Warteschlange (der nächste Lauf holt den Rest). */
export const NACHLAUF_STAPEL = 400;
/** Pause vor jedem Bild aus dem Nachlauf – das Gerät soll dabei nicht spürbar langsamer werden (Raspberry Pi). */
export const NACHRANG_PAUSE_MS = 1000;
/** Den Stand höchstens so oft in den Kurzzustand schreiben. */
const STAND_ALLE_MS = 10_000;
const schlafe = (ms: number) => new Promise<void>((ok) => { setTimeout(ok, ms); });

export class Vorschaubilder {
  private warteschlange = new Map<string, Auftrag>();
  /** Nachlauf für den Bestand (#1216): erst, wenn die Warteschlange leer ist. */
  private nachrang = new Map<string, Auftrag>();
  private laeuft = false;
  private aus = false;
  /** Im aktiven Wartungsmodus keine Arbeit; danach anstossen(). */
  pause: () => boolean = () => false;
  /** Für Tests: wartet, bis die Warteschlange leer ist. */
  private leer: Array<() => void> = [];
  /** Pause vor jedem Bild aus dem Nachlauf (Tests: 0). */
  nachrangPauseMs = NACHRANG_PAUSE_MS;

  /** Fassungen aus Paketen (#577) für Dateitypen, die der Kern nicht selbst liest. */
  fassung: FassungsQuelle = async () => null;
  /** Archivfassung (PDF/A, #631) als letzte Quelle (#1216); null = nicht angebunden. */
  archiv: ArchivQuelle | null = null;
  /** Stand des Nachlaufs für alle Prozesse (#1216); null = nur im Arbeitsspeicher. */
  nachlaufSpeicher: NachlaufSpeicher | null = null;
  private nl: NachlaufStand | null = null;
  private nlGeschrieben = 0;

  constructor(private ablage: VorschauAblage, private dateien: Dateispeicher, private erzeuger: Erzeuger = popplerErzeuger) {}

  /** Vorschaubild eines Dokuments; null = (noch) keins. Fehlt es, wird es eingereiht. */
  async bild(d: Auftrag): Promise<Buffer | null> {
    if (!hatVorschau(d.mime)) {
      // Andere Dateitypen (#577): aus der Fassung eines Pakets bzw. das Vorschaubild des Pakets; sonst aus der
      // Archivfassung (#1216, z. B. E-Mails).
      const b = await this.ablage.lies(d.sha256);
      if (b) return b;
      const seit = await this.ablage.fehlerSeit(d.sha256);
      if (seit === null && (await this.fassung(d.sha256).catch(() => null))) this.ausFassung([d]);
      else if (await this.archivJuenger(d.sha256, seit)) this.ausArchiv([d]);
      return null;
    }
    if (d.groesse > VORSCHAU_MAX_BYTES) return null;
    const b = await this.ablage.lies(d.sha256);
    if (b) return b;
    const seit = await this.ablage.fehlerSeit(d.sha256);
    if (seit === null) this.einreihen([d]);
    else if (await this.archivJuenger(d.sha256, seit)) this.ausArchiv([d]);
    return null;
  }

  /** Gibt es eine eigene Archivfassung, die jünger ist als der letzte Fehlversuch (bzw. ohne Fehlversuch)? */
  private async archivJuenger(sha: string, fehlerSeit: number | null): Promise<boolean> {
    if (!this.archiv) return false;
    const i = await this.archiv.info(sha).catch(() => null);
    if (!i || i.imOriginal || i.groesse > VORSCHAU_MAX_BYTES) return false;
    return fehlerSeit === null || fehlerSeit < Date.parse(i.erstellt);
  }

  /** In die Warteschlange, auch wenn ein früherer Versuch fehlschlug (die Quelle ist neu). */
  private reihe(docs: Auftrag[], passt: (d: Auftrag) => boolean) {
    let neu = 0;
    for (const d of docs) {
      if (!d || !passt(d) || this.warteschlange.has(d.sha256)) continue;
      this.warteschlange.set(d.sha256, { sha256: d.sha256, mime: d.mime, groesse: d.groesse, name: d.name });
      neu++;
    }
    if (neu) this.anstossen();
    return neu;
  }

  /**
   * Vorschaubild aus der umgewandelten Fassung (#577): einreihen, auch wenn ein früherer Versuch fehlschlug (die
   * Fassung ist neu). Ein vorhandenes Bild bleibt.
   */
  ausFassung(docs: Auftrag[]) {
    // PDFs nur mit entsperrter Fassung (#827) – die Quelle liefert für PDFs nichts anderes.
    return this.reihe(docs, (d) => !hatVorschau(d.mime) || d.mime === 'application/pdf');
  }

  /**
   * Eine Archivfassung ist da (#1216): einreihen, auch wenn ein früherer Versuch fehlschlug. Ein vorhandenes Bild
   * bleibt; ohne Bild gilt die Reihenfolge der Quellen (die Archivfassung zuletzt).
   */
  ausArchiv(docs: Auftrag[]) {
    return this.reihe(docs, (d) => !hatVorschau(d.mime) || d.groesse <= VORSCHAU_MAX_BYTES);
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
    return this.reihe(docs, (d) => hatVorschau(d.mime) && d.groesse <= VORSCHAU_MAX_BYTES);
  }

  /** Wie viele warten gerade (ohne den Nachlauf). */
  get wartend() { return this.warteschlange.size; }

  /** Nachholen für vorhandene Dokumente (Werkbank → Wartungsoperationen): nur, was noch fehlt. */
  async nachholen(docs: Auftrag[]) {
    const fehlt: Auftrag[] = [];
    const gesehen = new Set<string>();
    const ausQuelle: Auftrag[] = [];
    for (const d of docs) {
      if (gesehen.has(d.sha256)) continue;
      gesehen.add(d.sha256);
      // Andere Dateitypen (#577): nur mit Fassung eines Pakets oder mit Archivfassung (#1216).
      if (!hatVorschau(d.mime)) {
        if (!(await this.ablage.lies(d.sha256)) && ((await this.fassung(d.sha256).catch(() => null)) || (await this.archivJuenger(d.sha256, null)))) ausQuelle.push(d);
        continue;
      }
      if (d.groesse > VORSCHAU_MAX_BYTES) continue;
      if (await this.ablage.lies(d.sha256)) continue;
      fehlt.push(d);
    }
    this.einreihen(fehlt);
    this.ausArchiv(ausQuelle);
    fehlt.push(...ausQuelle);
    if (fehlt.length) log.info('Vorschaubilder nachholen', { dokumente: fehlt.length });
    return fehlt.length;
  }

  /**
   * Nachlauf für den Bestand (#1216, Zeitplan): Dateien mit Archivfassung (`shas`) ohne Vorschaubild – auch nach einem
   * Fehlversuch, der älter ist als die Archivfassung – in die Warteschlange mit Nachrang, höchstens NACHLAUF_STAPEL je
   * Lauf. Wartet von einem früheren Lauf noch etwas, nur den Stand schreiben. Liefert, wie viele noch offen sind.
   */
  async nachlaufArchiv(shas: Iterable<string>, dokumente: (sha: string) => Promise<Auftrag[]>): Promise<number> {
    if (!this.archiv) return 0;
    if (this.nachrang.size) { await this.merkeNachlauf(true); return this.nl?.offen ?? this.nachrang.size; }
    const offen = await this.ohneBild(shas);
    if (!offen.length) { await this.nachlaufFertig(); return 0; }
    const nl = this.neuerStand(offen.length);
    for (const sha of offen.slice(0, NACHLAUF_STAPEL)) {
      const d = (await dokumente(sha).catch(() => [] as Auftrag[]))[0];
      // Keine Datei mehr dazu (gerade gelöscht): nicht mitzählen.
      if (!d) { nl.offen--; continue; }
      this.nachrang.set(sha, { sha256: sha, mime: d.mime, groesse: d.groesse, name: d.name });
    }
    await this.merkeNachlauf(true);
    this.anstossen();
    return nl.offen;
  }

  /** Dateien mit eigener Archivfassung, aber ohne Bild (ein Fehlversuch zählt nur, wenn er jünger ist). */
  private async ohneBild(shas: Iterable<string>): Promise<string[]> {
    const offen: string[] = [];
    for (const sha of shas) {
      if (this.aus) return [];
      if (this.warteschlange.has(sha) || (await this.ablage.lies(sha))) continue;
      if (await this.archivJuenger(sha, await this.ablage.fehlerSeit(sha))) offen.push(sha);
    }
    return offen;
  }

  /** Stand für einen Lauf: Läuft der Nachlauf schon (von einem früheren Lauf), zählt er weiter. */
  private neuerStand(offen: number): NachlaufStand {
    const jetzt = new Date().toISOString();
    const alt = this.nl && this.nl.offen > 0 ? this.nl : null;
    if (!alt) log.info('Vorschaubilder aus Archivfassungen nachholen', { dokumente: offen });
    this.nl = { offen, erledigt: alt?.erledigt ?? 0, ohne: alt?.ohne ?? 0, seit: alt?.seit ?? jetzt, zeit: jetzt };
    return this.nl;
  }

  /** Nichts mehr offen: den letzten Stand mit offen 0 stehen lassen (Ergebnis in der Werkbank), einmal schreiben. */
  private async nachlaufFertig() {
    if (!this.nl?.offen) return;
    this.nl = { ...this.nl, offen: 0, zeit: new Date().toISOString() };
    await this.merkeNachlauf(true);
    log.info('Vorschaubilder aus Archivfassungen nachgeholt', { erstellt: this.nl.erledigt, ohne: this.nl.ohne });
  }

  /** Stand des Nachlaufs (#1216): in diesem Prozess oder aus dem Kurzzustand (andere Prozesse und Server). */
  async nachlaufStand(): Promise<NachlaufStand | null> {
    if (this.nl) return { ...this.nl };
    return (await this.nachlaufSpeicher?.lies().catch(() => null)) ?? null;
  }

  private async merkeNachlauf(sofort = false) {
    if (!this.nl || !this.nachlaufSpeicher) return;
    if (!sofort && Date.now() - this.nlGeschrieben < STAND_ALLE_MS) return;
    this.nlGeschrieben = Date.now();
    await this.nachlaufSpeicher.schreibe({ ...this.nl, zeit: new Date().toISOString() }).catch((e: Error) => log.debug('Stand der Vorschaubilder nicht gemerkt', { fehler: e.message }));
  }

  /** Datei gelöscht (kein Dokument zeigt mehr darauf): Vorschaubild mit weg. */
  async entferne(sha: string) {
    this.warteschlange.delete(sha);
    if (this.nachrang.delete(sha) && this.nl) this.nl.offen = Math.max(0, this.nl.offen - 1);
    await this.ablage.loesche(sha).catch(() => {});
  }

  belegung() { return this.ablage.belegung(); }

  stop() { this.aus = true; }

  anstossen() {
    if (this.laeuft || this.aus || this.pause()) return;
    this.laeuft = true;
    void this.pumpe().catch((e) => log.error('Vorschaubilder gestört', { fehler: (e as Error).message })).finally(() => {
      this.laeuft = false;
      if (!this.warteschlange.size && !this.nachrang.size) for (const f of this.leer.splice(0)) f();
      // Während der Pause kam etwas dazu (anstossen lief ins Leere): weiter.
      else if (!this.aus && !this.pause()) this.anstossen();
    });
  }

  /** Für Tests: bis alles erzeugt ist. */
  fertig(): Promise<void> {
    if (!this.warteschlange.size && !this.nachrang.size && !this.laeuft) return Promise.resolve();
    return new Promise((ok) => this.leer.push(ok));
  }

  /** Einer nach dem anderen – Vorschaubilder sollen das Gerät nicht auslasten. Der Nachlauf nur, wenn sonst nichts wartet. */
  private async pumpe() {
    while (!this.aus && !this.pause()) {
      let eintrag = this.warteschlange.entries().next().value;
      if (!eintrag) {
        if (!this.nachrang.size) return;
        if (this.nachrangPauseMs) await schlafe(this.nachrangPauseMs);
        if (this.aus || this.pause()) return;
        // Menschen haben Vorrang: Kam während der Pause etwas Neues, zuerst das.
        eintrag = this.warteschlange.entries().next().value ?? this.nachrang.entries().next().value;
        if (!eintrag) return;
      }
      const [sha, d] = eintrag;
      let ergebnis: 'bild' | 'ohne' | 'nichts' = 'nichts';
      try {
        if (await this.ablage.lies(sha)) ergebnis = 'bild';
        else ergebnis = await this.erzeuge(sha, d);
      } catch (e) {
        await this.ablage.merkeFehler(sha).catch(() => {});
        ergebnis = 'ohne';
        log.info('Kein Vorschaubild', { dokument: d.name, fehler: (e as Error).message.slice(0, 300) });
      } finally {
        this.warteschlange.delete(sha);
        if (this.nachrang.delete(sha) && this.nl) {
          this.nl.offen = Math.max(0, this.nl.offen - 1);
          if (ergebnis === 'bild') this.nl.erledigt++; else this.nl.ohne++;
          await this.merkeNachlauf(!this.nachrang.size);
        }
      }
    }
  }

  /**
   * Bild aus der ersten Quelle, die eins liefert (#1216): Datei selbst → entsperrte bzw. Lesefassung (#827, #577) →
   * Archivfassung (#631). Geschützte PDFs zuerst aus der entsperrten Fassung (wie bisher). Gab es keine Quelle,
   * bleibt kein Fehlversuch stehen (die Quelle kann noch kommen); scheitern alle, schon.
   */
  private async erzeuge(sha: string, d: Auftrag): Promise<'bild' | 'ohne' | 'nichts'> {
    type Quelle = () => Promise<{ inhalt: Buffer; mime: string } | null>;
    const fassung: Quelle = async () => { const f = await this.fassung(sha).catch(() => null); return f ? { inhalt: f.inhalt, mime: f.info.mime } : null; };
    const datei: Quelle = async () => (d.groesse > VORSCHAU_MAX_BYTES ? null : { inhalt: await alsBuffer(await this.dateien.lies(sha)), mime: d.mime });
    const archiv: Quelle = async () => {
      if (!(await this.archivJuenger(sha, null))) return null;
      const a = await this.archiv!.lies(sha).catch(() => null);
      return a ? { inhalt: a.inhalt, mime: 'application/pdf' } : null;
    };
    const quellen: Quelle[] = d.mime === 'application/pdf' ? [fassung, datei, archiv] : hatVorschau(d.mime) ? [datei, archiv] : [fassung, archiv];
    let versucht = false;
    let fehler: Error | null = null;
    for (const q of quellen) {
      const x = await q();
      if (!x) continue;
      versucht = true;
      try {
        const bild = await this.erzeuger(x.inhalt, x.mime);
        if (!bild) continue;
        await this.ablage.loesche(sha);
        await this.ablage.schreibe(sha, bild);
        return 'bild';
      } catch (e) { fehler = e as Error; }
    }
    if (!versucht) return 'nichts';
    if (fehler) throw fehler;
    await this.ablage.merkeFehler(sha);
    return 'ohne';
  }
}
