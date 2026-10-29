import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { chmod, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
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

/** Bekanntes Wort, verschlüsselt in der Datenbank: zeigt nach einer Wiederherstellung, ob der Schlüssel passt (#103). */
export const PRUEFWORT = 'DMS';

/** Schlüssel für einen bestimmten Zweck aus dem Hauptschlüssel ableiten (HKDF-SHA256), z. B. „dms-sicherung“. */
export const leiteAb = (k: Buffer, zweck: string) => Buffer.from(hkdfSync('sha256', k, Buffer.alloc(0), zweck, 32));

/** Schlüssel aus seiner Textform (Datei oder Notfallblatt; Leerzeichen zählen nicht); null = ungültig. */
export function schluesselAusText(text: string): Buffer | null {
  const roh = text.replace(/\s+/g, '');
  if (!/^[A-Za-z0-9_-]{43}$/.test(roh)) return null;
  const k = Buffer.from(roh, 'base64url');
  return k.length === 32 ? k : null;
}

/** Einen Wert „dms1$…“ mit einem bestimmten Schlüssel entschlüsseln; null = nicht lesbar. */
export function entschluesseleMit(k: Buffer, wert: string): string | null {
  if (!istVerschluesselt(wert)) return null;
  const [n, g] = wert.slice(PRAEFIX.length).split(':');
  try {
    const nonce = Buffer.from(n, 'base64url');
    const geheim = Buffer.from(g ?? '', 'base64url');
    if (nonce.length !== 12 || geheim.length < 16) return null;
    const d = createDecipheriv('aes-256-gcm', k, nonce);
    d.setAuthTag(geheim.subarray(geheim.length - 16));
    return Buffer.concat([d.update(geheim.subarray(0, geheim.length - 16)), d.final()]).toString('utf8');
  } catch { return null; }
}

/** Einen Wert mit einem bestimmten Schlüssel verschlüsseln (Schlüsselwechsel, #47). */
export function verschluesseleMit(k: Buffer, klartext: string): string {
  const nonce = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', k, nonce);
  const geheim = Buffer.concat([c.update(klartext, 'utf8'), c.final(), c.getAuthTag()]);
  return `${PRAEFIX}${nonce.toString('base64url')}:${geheim.toString('base64url')}`;
}

/** Alle verschlüsselten Werte in einem JSON-Wert umschlüsseln; null aus um = unverändert lassen. */
export function umschluesseleTief<T>(wert: T, um: (v: string) => string | null): { wert: T; geaendert: number; unlesbar: number } {
  let geaendert = 0; let unlesbar = 0;
  const gehe = (x: unknown): unknown => {
    if (istVerschluesselt(x)) { const n = um(x); if (n === null) { unlesbar++; return x; } geaendert++; return n; }
    if (Array.isArray(x)) return x.map(gehe);
    if (x && typeof x === 'object') return Object.fromEntries(Object.entries(x).map(([k, v]) => [k, gehe(v)]));
    return x;
  };
  return { wert: gehe(wert) as T, geaendert, unlesbar };
}

/**
 * Schlüsselwechsel (#47): schreibt alle umgeschlüsselten Werte und die Einstellungen (Fingerabdruck,
 * Prüfwort) – ganz oder gar nicht (eine Transaktion). Liefert, wie viele Werte umgeschlüsselt wurden
 * und wie viele schon vorher nicht lesbar waren (die bleiben, wie sie sind).
 */
export type Umschluesseln = (um: (wert: string) => string | null, einstellungen: Record<string, unknown>) => Promise<{ umgeschluesselt: number; unlesbar: number }>;
export interface Wechsel { alt: string; neu: string; umgeschluesselt: number; unlesbar: number }

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

/**
 * Gerät (major:minor) des Einhängepunkts, unter dem ein Pfad liegt – gleich heißt: dieselbe Platte
 * bzw. dasselbe Volume des NAS (#105). null = nicht feststellbar.
 */
export function geraetVon(pfad: string, mountinfo = '/proc/self/mountinfo'): string | null {
  let text: string;
  try { text = readFileSync(mountinfo, 'utf8'); } catch { return null; }
  const punkt = punktFuer(pfad, text);
  const zeile = text.split('\n').find((z) => z.split(' ')[4]?.replace(/\\040/g, ' ') === punkt);
  return zeile?.split(' ')[2] ?? null;
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
  private nachWechsel: ((um: (wert: string) => string | null) => Promise<void>)[] = [];
  /** Datei mit dem neuen Schlüssel während eines Wechsels (#47). */
  get neueDatei() { return `${this.datei}.neu`; }

  constructor(private einstellungen: TresorEinstellungen, readonly datei = STANDARD_DATEI, private volume: (p: string) => boolean | null = aufVolume) {}

  /** Liest Schlüsseldatei und Fingerabdruck; einmal beim Start. */
  async laden() {
    this.gespeichert = ((await this.einstellungen.lies('tresor')) as Gespeichert | null) ?? null;
    await this.wechselAbschliessen();
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
    if (z === 'vorhanden') await this.pruefwort().catch(() => null);
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

  /**
   * Meldet, welche verschlüsselten Werte ein Bereich hält, die gerade nicht lesbar sind; dazu, was nach
   * einem neuen Schlüssel bzw. nach einem Wechsel (#47, z. B. zwischengespeicherte Werte neu laden) zu tun ist.
   */
  registriere(p: Pruefer, nachNeuemSchluessel?: () => Promise<void>, nachWechsel?: (um: (wert: string) => string | null) => Promise<void>) {
    this.pruefer.push(p);
    if (nachNeuemSchluessel) this.beiNeuemSchluessel.push(nachNeuemSchluessel);
    if (nachWechsel) this.nachWechsel.push(nachWechsel);
  }

  /**
   * Schlüssel wechseln (#47): neuen Schlüssel erzeugen, alle verschlüsselten Werte über `speichere`
   * in einer Transaktion umschlüsseln, Fingerabdruck und Prüfwort neu setzen, dann die Schlüsseldatei
   * ersetzen. Bricht etwas ab, gilt weiter der alte Schlüssel. Den alten bewahrt das DMS nicht auf –
   * ältere Sicherungen brauchen das alte Notfallblatt.
   */
  async wechsle(speichere: Umschluesseln, von: string): Promise<Wechsel> {
    if (this.zustand !== 'vorhanden' || !this.schluessel) throw new Fachfehler(409, 'Wechseln geht nur mit einem passenden Schlüssel. Siehe den Zustand unter Werkbank → Verschlüsselung.');
    if (this.wechselLaeuft) throw new Fachfehler(409, 'Der Schlüssel wird gerade gewechselt.');
    this.wechselLaeuft = true;
    const alt = this.schluessel;
    const k = randomBytes(32);
    const neu: Gespeichert = { fingerabdruck: fingerabdruck(k), erstellt: new Date().toISOString() };
    try {
      // 1. Neue Datei daneben – die alte bleibt, bis die Datenbank umgestellt ist.
      try {
        await mkdir(dirname(this.datei), { recursive: true, mode: 0o700 });
        await writeFile(this.neueDatei, `${k.toString('base64url')}\n`, { mode: 0o600 });
        await chmod(this.neueDatei, 0o600).catch(() => {});
      } catch (e) { throw new Fachfehler(500, `Der neue Schlüssel ließ sich nicht schreiben (${this.neueDatei}): ${(e as Error).message}. Es gilt weiter der bisherige Schlüssel.`); }
      // 2. Alles umschlüsseln – ganz oder gar nicht.
      const um = (wert: string) => { const klar = entschluesseleMit(alt, wert); return klar === null ? null : verschluesseleMit(k, klar); };
      let r: { umgeschluesselt: number; unlesbar: number };
      try {
        r = await speichere(um, { tresor: neu, pruefwort: verschluesseleMit(k, PRUEFWORT) });
      } catch (e) {
        await rm(this.neueDatei, { force: true }).catch(() => {});
        log.error('Schlüsselwechsel abgebrochen – es gilt weiter der bisherige Schlüssel', { fehler: (e as Error).message });
        throw new Fachfehler(500, `Der Schlüsselwechsel ist abgebrochen; es gilt weiter der bisherige Schlüssel. (${(e as Error).message})`);
      }
      // 3. Ab hier gilt der neue Schlüssel: Einstellungen (bei PostgreSQL schon in der Transaktion) und Datei.
      await this.einstellungen.schreibe('tresor', neu);
      await this.einstellungen.schreibe('pruefwort', verschluesseleMit(k, PRUEFWORT));
      this.schluessel = k;
      this.gespeichert = neu;
      await this.wechselAbschliessen();
      for (const f of this.nachWechsel) {
        try { await f(um); } catch (e) { log.error('Nacharbeit nach dem Schlüsselwechsel fehlgeschlagen', { fehler: (e as Error).message }); }
      }
      const w: Wechsel = { alt: fingerabdruck(alt), neu: neu.fingerabdruck, ...r };
      protokoll.modul('werkbank').warn('Schlüssel für Zugangsdaten gewechselt', { von, alt: w.alt, neu: w.neu, umgeschluesselt: w.umgeschluesselt, ...(w.unlesbar ? { schonVorherUnlesbar: w.unlesbar } : {}) });
      return w;
    } finally { this.wechselLaeuft = false; }
  }
  private wechselLaeuft = false;

  /**
   * Liegt noch eine „.neu“-Datei vom Wechsel: Passt sie zur Datenbank, ersetzt sie die alte Datei
   * (z. B. Neustart zwischen Datenbank und Datei); sonst ist sie ein Überbleibsel eines Abbruchs.
   */
  private async wechselAbschliessen() {
    let roh: string;
    try { roh = (await readFile(this.neueDatei, 'utf8')).trim(); } catch { return; }
    const k = Buffer.from(roh, 'base64url');
    if (k.length === 32 && this.gespeichert && fingerabdruck(k) === this.gespeichert.fingerabdruck) {
      await rename(this.neueDatei, this.datei);
      this.schluessel = k;
      log.info('Neue Schlüsseldatei übernommen', { fingerabdruck: fingerabdruck(k) });
    } else {
      await rm(this.neueDatei, { force: true }).catch(() => {});
    }
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
    if (this.zustand === 'vorhanden') throw new Fachfehler(409, 'Es gibt schon einen Schlüssel. Zum Austauschen gibt es „Schlüssel wechseln“.');
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
    // Neues Prüfwort zum neuen Schlüssel (#103).
    await this.einstellungen.schreibe('pruefwort', this.verschluessele(PRUEFWORT));
    protokoll.modul('werkbank').warn('Schlüssel für Zugangsdaten erzeugt', { fingerabdruck: this.gespeichert.fingerabdruck, datei: this.datei, ...(vorher ? { ersetzt: vorher } : {}) });
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
    return verschluesseleMit(this.schluessel, klartext);
  }

  /** Klartext oder null, wenn der Wert mit diesem Schlüssel nicht lesbar ist. */
  entschluessele(wert: string): string | null {
    return this.schluessel ? entschluesseleMit(this.schluessel, wert) : null;
  }

  /** Abgeleiteter Schlüssel für einen Zweck (z. B. Sicherungen); null ohne passenden Schlüssel. */
  abgeleitet(zweck: string): Buffer | null { return this.bereit && this.schluessel ? leiteAb(this.schluessel, zweck) : null; }

  /** Der Schlüssel als Text – nur für das Notfallblatt (#106). */
  alsText(): string | null { return this.bereit && this.schluessel ? this.schluessel.toString('base64url') : null; }

  /**
   * Prüfwort (#103): ein bekanntes Wort verschlüsselt in der Datenbank. Fehlt es, wird es angelegt.
   * true = mit dem vorhandenen Schlüssel lesbar, false = nicht, null = kein Schlüssel.
   */
  async pruefwort(): Promise<boolean | null> {
    if (!this.schluessel) return null;
    const w = await this.einstellungen.lies('pruefwort');
    if (typeof w !== 'string') {
      if (!this.bereit) return null;
      await this.einstellungen.schreibe('pruefwort', this.verschluessele(PRUEFWORT));
      return true;
    }
    return entschluesseleMit(this.schluessel, w) === PRUEFWORT;
  }

  /** Lässt sich der Wert lesen? (Für Listen betroffener Werte.) */
  lesbar(wert: unknown): boolean { return istVerschluesselt(wert) && this.entschluessele(wert) !== null; }
}

/**
 * Ersetzt in einer Antwort jeden verschlüsselten Wert durch { gesetzt, lesbar } –
 * so verlässt kein Geheimtext den Server, egal über welche Schnittstelle (#46).
 */
export function maskiere<T>(wert: T, lesbar: (v: string) => boolean): T {
  if (istVerschluesselt(wert)) return { gesetzt: true, lesbar: lesbar(wert) } as T;
  if (Array.isArray(wert)) {
    let neu: unknown[] | null = null;
    wert.forEach((x, i) => {
      const m = maskiere(x, lesbar);
      if (m !== x) { neu ??= [...wert]; neu[i] = m; }
    });
    return (neu ?? wert) as T;
  }
  if (wert && typeof wert === 'object' && Object.getPrototypeOf(wert) === Object.prototype) {
    let neu: Record<string, unknown> | null = null;
    for (const [k, x] of Object.entries(wert)) {
      const m = maskiere(x, lesbar);
      if (m !== x) { neu ??= { ...(wert as Record<string, unknown>) }; neu[k] = m; }
    }
    return (neu ?? wert) as T;
  }
  return wert;
}
