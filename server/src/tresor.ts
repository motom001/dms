import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { Fachfehler } from './fehler';
import { protokoll } from './protokoll';

/**
 * Schlüssel für verschlüsselte Zugangsdaten (#39).
 *
 * - Der Schlüssel (32 Byte, AES-256-GCM) liegt als Datei außerhalb der Datenbank,
 *   standardmäßig unter /data/geheim/dms.schluessel. In der Datenbank steht nur sein
 *   Fingerabdruck – damit erkennt das DMS, ob der Schlüssel fehlt oder ein anderer ist.
 * - Erzeugt wird er auf Knopfdruck in der Werkbank; ein Neustart ist nicht nötig.
 * - Jeder Wert wird einzeln mit eigener Zufallszahl (Nonce) verschlüsselt und
 *   als „dms1$<nonce>:<geheimtext+tag>“ gespeichert.
 * - Ohne Schlüssel lassen sich keine Passwörter speichern.
 */

const log = protokoll.modul('system');
const PRAEFIX = 'dms1$';
export const STANDARD_DATEI = '/data/geheim/dms.schluessel';

export interface TresorEinstellungen {
  lies(schluessel: string): Promise<unknown>;
  schreibe(schluessel: string, wert: unknown): Promise<void>;
}

/** Wer verschlüsselte Werte hält, meldet hier, welche davon gerade nicht lesbar sind. */
export interface Betroffen { bereich: string; was: string; wo?: string }
export type Pruefer = () => Promise<Betroffen[]>;

export type Zustand = 'vorhanden' | 'fehlt' | 'verloren' | 'falsch';
export interface TresorStatus {
  zustand: Zustand;
  fingerabdruck: string | null;
  /** Fingerabdruck des Schlüssels, mit dem die gespeicherten Werte verschlüsselt sind. */
  erwartet: string | null;
  erstellt: string | null;
  datei: string;
  /** null = nicht feststellbar (außerhalb eines Containers). */
  eingebunden: boolean | null;
  betroffen: Betroffen[];
}

interface Gespeichert { fingerabdruck: string; erstellt: string }

export const fingerabdruck = (k: Buffer) => createHash('sha256').update(k).digest('hex').slice(0, 16).toUpperCase().match(/.{4}/g)!.join('-');
export const istVerschluesselt = (v: unknown): v is string => typeof v === 'string' && v.startsWith(PRAEFIX);

/**
 * Liegt der Ordner auf einem eigenen Volume? Ohne Volume ginge der Schlüssel verloren,
 * sobald der Container neu erstellt wird (z. B. beim Update).
 */
export function aufVolume(pfad: string, mountinfo = '/proc/self/mountinfo'): boolean | null {
  if (!existsSync('/.dockerenv') && !existsSync('/run/.containerenv')) return null;
  let text: string;
  try { text = readFileSync(mountinfo, 'utf8'); } catch { return null; }
  return punktFuer(pfad, text) !== '/';
}

/** Der Einhängepunkt, unter dem ein Pfad liegt (längster passender Präfix). */
export function punktFuer(pfad: string, mountinfo: string): string {
  const ziel = resolve(pfad);
  let best = '/';
  for (const z of mountinfo.split('\n')) {
    const punkt = z.split(' ')[4]?.replace(/\\040/g, ' ');
    if (!punkt) continue;
    if ((ziel === punkt || ziel.startsWith(punkt.endsWith('/') ? punkt : `${punkt}/`)) && punkt.length > best.length) best = punkt;
  }
  return best;
}

export class Tresor {
  private schluessel: Buffer | null = null;
  private gespeichert: Gespeichert | null = null;
  private pruefer: Pruefer[] = [];
  private beiNeuemSchluessel: (() => Promise<void>)[] = [];

  constructor(private einstellungen: TresorEinstellungen, readonly datei = STANDARD_DATEI, private volume: (p: string) => boolean | null = aufVolume) {}

  /** Liest Schlüsseldatei und Fingerabdruck; einmal beim Start. */
  async laden() {
    this.gespeichert = ((await this.einstellungen.lies('tresor')) as Gespeichert | null) ?? null;
    try {
      const roh = (await readFile(this.datei, 'utf8')).trim();
      const k = Buffer.from(roh, 'base64url');
      if (k.length !== 32) throw new Error(`Die Schlüsseldatei ${this.datei} enthält keinen gültigen Schlüssel.`);
      this.schluessel = k;
    } catch (e) {
      const f = e as NodeJS.ErrnoException;
      this.schluessel = null;
      if (f.code !== 'ENOENT') log.error('Schlüsseldatei nicht lesbar', { datei: this.datei, fehler: f.message });
    }
    const z = this.zustand;
    if (z === 'vorhanden') log.info('Schlüssel für Zugangsdaten geladen', { fingerabdruck: this.fingerabdruck });
    else if (z === 'verloren') log.error(`Schlüssel für Zugangsdaten fehlt (${this.datei}). Gespeicherte Passwörter sind nicht lesbar – siehe Werkbank → Verschlüsselung.`);
    else if (z === 'falsch') log.error(`Die Schlüsseldatei ${this.datei} passt nicht zu den gespeicherten Passwörtern (erwartet ${this.gespeichert?.fingerabdruck}).`);
    else log.warn('Noch kein Schlüssel für Zugangsdaten – Passwörter lassen sich erst nach dem Erzeugen in der Werkbank speichern.');
  }

  get fingerabdruck() { return this.schluessel ? fingerabdruck(this.schluessel) : null; }

  get zustand(): Zustand {
    if (this.schluessel) return !this.gespeichert || this.gespeichert.fingerabdruck === this.fingerabdruck ? 'vorhanden' : 'falsch';
    return this.gespeichert ? 'verloren' : 'fehlt';
  }

  /** Lassen sich gerade Passwörter speichern und lesen? */
  get bereit() { return this.zustand === 'vorhanden'; }

  /** Meldet, welche verschlüsselten Werte ein Bereich hält, die gerade nicht lesbar sind. */
  registriere(p: Pruefer, nachNeuemSchluessel?: () => Promise<void>) {
    this.pruefer.push(p);
    if (nachNeuemSchluessel) this.beiNeuemSchluessel.push(nachNeuemSchluessel);
  }

  async status(): Promise<TresorStatus> {
    const betroffen: Betroffen[] = [];
    for (const p of this.pruefer) {
      try { betroffen.push(...(await p())); } catch (e) { log.warn('Prüfung verschlüsselter Werte fehlgeschlagen', { fehler: (e as Error).message }); }
    }
    return {
      zustand: this.zustand, fingerabdruck: this.fingerabdruck, erwartet: this.gespeichert?.fingerabdruck ?? null,
      erstellt: this.gespeichert?.erstellt ?? null, datei: this.datei, eingebunden: this.volume(dirname(this.datei)), betroffen,
    };
  }

  /**
   * Erzeugt einen neuen Schlüssel. Gibt es schon einen passenden, bleibt er (kein Überschreiben).
   * Fehlt der bisherige, sind die damit verschlüsselten Werte verloren und müssen neu eingegeben werden.
   */
  async erzeuge(): Promise<TresorStatus> {
    if (this.zustand === 'vorhanden') throw new Fachfehler(409, 'Es gibt schon einen Schlüssel. Zum Wechseln gibt es später eine eigene Funktion (#47).');
    if (this.schluessel) throw new Fachfehler(409, `Die Schlüsseldatei ${this.datei} gehört nicht zu den gespeicherten Passwörtern. Lege die richtige Datei zurück oder entferne sie, um einen neuen Schlüssel zu erzeugen.`);
    const k = randomBytes(32);
    try {
      await mkdir(dirname(this.datei), { recursive: true, mode: 0o700 });
      // wx: niemals eine vorhandene Datei überschreiben.
      await writeFile(this.datei, `${k.toString('base64url')}\n`, { mode: 0o600, flag: 'wx' });
      await chmod(this.datei, 0o600).catch(() => {});
    } catch (e) {
      const f = e as NodeJS.ErrnoException;
      if (f.code === 'EEXIST') throw new Fachfehler(409, `Unter ${this.datei} liegt schon eine Datei. Lade die Seite neu oder starte das DMS neu, damit sie gelesen wird.`);
      throw new Fachfehler(500, `Die Schlüsseldatei ließ sich nicht schreiben (${this.datei}): ${f.message}`);
    }
    const vorher = this.gespeichert?.fingerabdruck ?? null;
    this.schluessel = k;
    this.gespeichert = { fingerabdruck: fingerabdruck(k), erstellt: new Date().toISOString() };
    await this.einstellungen.schreibe('tresor', this.gespeichert);
    protokoll.modul('werkbank').warn('Schlüssel für Zugangsdaten erzeugt', { fingerabdruck: this.gespeichert.fingerabdruck, datei: this.datei, ersetzt: vorher ?? undefined });
    for (const f of this.beiNeuemSchluessel) {
      try { await f(); } catch (e) { log.error('Nacharbeit nach neuem Schlüssel fehlgeschlagen', { fehler: (e as Error).message }); }
    }
    return this.status();
  }

  private fehlt(): never {
    throw new Fachfehler(409, this.zustand === 'falsch'
      ? 'Die Schlüsseldatei passt nicht zu den gespeicherten Passwörtern. Passwörter lassen sich erst wieder speichern, wenn das geklärt ist (Werkbank → Verschlüsselung).'
      : 'Passwörter lassen sich erst speichern, wenn es einen Schlüssel gibt. Ein Administrator erzeugt ihn in der Werkbank unter „Verschlüsselung“.');
  }

  verschluessele(klartext: string): string {
    if (!this.bereit || !this.schluessel) this.fehlt();
    const nonce = randomBytes(12);
    const c = createCipheriv('aes-256-gcm', this.schluessel, nonce);
    const geheim = Buffer.concat([c.update(klartext, 'utf8'), c.final(), c.getAuthTag()]);
    return `${PRAEFIX}${nonce.toString('base64url')}:${geheim.toString('base64url')}`;
  }

  /** Klartext oder null, wenn der Wert mit diesem Schlüssel nicht lesbar ist. */
  entschluessele(wert: string): string | null {
    if (!this.schluessel || !istVerschluesselt(wert)) return null;
    const [n, g] = wert.slice(PRAEFIX.length).split(':');
    try {
      const nonce = Buffer.from(n, 'base64url');
      const geheim = Buffer.from(g ?? '', 'base64url');
      if (nonce.length !== 12 || geheim.length < 16) return null;
      const d = createDecipheriv('aes-256-gcm', this.schluessel, nonce);
      d.setAuthTag(geheim.subarray(geheim.length - 16));
      return Buffer.concat([d.update(geheim.subarray(0, geheim.length - 16)), d.final()]).toString('utf8');
    } catch { return null; }
  }

  /** Lässt sich der Wert lesen? (Für Listen betroffener Werte.) */
  lesbar(wert: unknown): boolean { return istVerschluesselt(wert) && this.entschluessele(wert) !== null; }
}
