import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { Fachfehler } from '../grundlagen/fehler';
import { t } from '../sprache/sprache';

/* Passwörter: scrypt aus Node, ohne native Zusatzbibliothek (läuft auf jedem NAS). */

export interface ScryptParameter {
  N: number;
  r: number;
  p: number;
}

/**
 * Parameter für neue Hashes (#1358) – die einzige Stelle, an der sie stehen. OWASP (Password Storage Cheat Sheet) nennt
 * als Mindestwert N = 2^17, r = 8, p = 1 oder gleichwertig N = 2^14, r = 8, p = 5: gleiche Rechenzeit, aber nur
 * 16 MiB Speicher je Prüfung statt 128 MiB. Gemessen auf einem kleinen NAS etwa 265 ms je Prüfung.
 * Jeder Hash trägt seine Parameter selbst (`scrypt$N$r$p$salz$hash`): Ältere bleiben prüfbar; schwächere werden beim
 * nächsten erfolgreichen Anmelden mit diesen Werten neu gespeichert (`hashVeraltet`), stärkere bleiben, wie sie sind.
 */
export const SCRYPT: Readonly<ScryptParameter> = { N: 2 ** 14, r: 8, p: 5 };
/**
 * Höchstens so viele Passwortprüfungen warten je Prozess auf einen Platz. Darüber antwortet Ablago sofort mit 503 und
 * `Retry-After` (wie die Abrufseite mit `belege()`), statt eine Welle von Anmeldeversuchen – auch an unbekannte Adressen,
 * die der Anmeldeschutz nur je IP zählt – für alle spürbar warten zu lassen. Bei etwa 4 Prüfungen je Sekunde und Platz
 * sind 50 Wartende gut 6 Sekunden.
 */
export const WARTEND_HOECHSTENS = 50;
/** Wartezeit in Sekunden, die eine abgewiesene Prüfung nennt. */
const WIEDER_IN_S = 5;
const LAENGE = 64;
/** Gespeicherte Hashes mit mehr Speicherbedarf je Prüfung gelten als ungültig (Schutz vor einem untergeschobenen Hash). */
const SPEICHER_HOECHSTENS = 256 * 2 ** 20;
/**
 * Höchstens so viele scrypt-Durchläufe gleichzeitig je Prozess. scrypt läuft im Thread-Pool von Node (4 Threads, auch
 * für Dateien und DNS); so bleiben Threads frei, und eine Welle von Anmeldungen bindet nicht mehr Rechenzeit als nötig.
 * Weitere warten in der Reihenfolge ihres Eintreffens, höchstens `WARTEND_HOECHSTENS`.
 */
export const GLEICHZEITIG = 2;

/**
 * Parameter für neue Hashes. Nur Tests setzen schnellere (`setzeTestParameter`, über `server/test/schnell.ts` beim Start
 * der Tests); eine Umgebungsvariable wählt nichts – so speichert eine Installation nie versehentlich schwache Hashes.
 */
let aktuell: Readonly<ScryptParameter> = SCRYPT;
export function aktuelleParameter(): Readonly<ScryptParameter> {
  return aktuell;
}
/** Nur für Tests: schnellere Parameter, damit die Testlaufzeit nicht steigt (`server/test/schnell.ts`). */
export function setzeTestParameter(x: Readonly<ScryptParameter> | null) {
  aktuell = x ?? SCRYPT;
}

/** Speicher, den scrypt für diese Parameter braucht (wie OpenSSL rechnet), mit etwas Luft – `maxmem` von Node. */
const speicher = ({ N, r, p }: ScryptParameter) => 128 * r * (N + p + 2);

/** Prüfung abgewiesen, weil die Warteschlange voll ist (503 mit `Retry-After`). */
export const istWarteschlangeVoll = (e: unknown) =>
  e instanceof Fachfehler && e.status === 503 && (e.details as { passwortpruefung?: unknown } | undefined)?.passwortpruefung === true;

/** Warteschlange der scrypt-Durchläufe dieses Prozesses. */
class Bremse {
  private laufend = 0;
  private wartend: Array<() => void> = [];
  constructor(
    private gleichzeitig: number,
    private hoechstens: number,
  ) {}
  async mit<T>(f: () => Promise<T>): Promise<T> {
    if (this.laufend >= this.gleichzeitig) {
      // Voll: sofort abweisen, bevor gerechnet wird – für bekannte und unbekannte Adressen gleich.
      if (this.wartend.length >= this.hoechstens)
        throw new Fachfehler(503, t('meldungen.anmeldesperre.passwortpruefung-voll'), { retryAfter: WIEDER_IN_S, passwortpruefung: true });
      await new Promise<void>((weiter) => this.wartend.push(weiter));
    } else this.laufend++;
    try {
      return await f();
    } finally {
      const naechste = this.wartend.shift();
      if (naechste) naechste();
      else this.laufend--;
    }
  }
  /** Für Tests: laufende und wartende Durchläufe. */
  stand() {
    return { laufend: this.laufend, wartend: this.wartend.length };
  }
}
const bremse = new Bremse(GLEICHZEITIG, WARTEND_HOECHSTENS);
export const scryptStand = () => bremse.stand();

/** Ein scrypt-Durchlauf, asynchron im Thread-Pool (blockiert die Ereignisschleife nicht), über die Warteschlange. */
function scryptAsync(passwort: string, salz: Buffer, laenge: number, x: ScryptParameter): Promise<Buffer> {
  return bremse.mit(
    () =>
      new Promise((ok, fehler) =>
        scrypt(passwort.normalize('NFKC'), salz, laenge, { ...x, maxmem: speicher(x) + 2 ** 20 }, (e, k) => (e ? fehler(e) : ok(k))),
      ),
  );
}

/** Ergebnis: scrypt$N$r$p$salz$hash (Base64), damit Parameter später erhöht werden können. */
export async function hashePasswort(passwort: string): Promise<string> {
  const x = aktuelleParameter();
  const salz = randomBytes(16);
  const hash = await scryptAsync(passwort, salz, LAENGE, x);
  return ['scrypt', x.N, x.r, x.p, salz.toString('base64'), hash.toString('base64')].join('$');
}

/** Parameter eines gespeicherten Hashs; null, wenn er nicht lesbar ist oder unzulässige Werte trägt. */
function lies(gespeichert: string): { x: ScryptParameter; salz: Buffer; soll: Buffer } | null {
  const [art, n, r, p, salz, hash, ...rest] = gespeichert.split('$');
  if (art !== 'scrypt' || !salz || !hash || rest.length) return null;
  const x = { N: Number(n), r: Number(r), p: Number(p) };
  const ganz = (v: number, max: number) => Number.isInteger(v) && v >= 1 && v <= max;
  // N eine Zweierpotenz ab 2, r und p in vernünftigen Grenzen, Speicher begrenzt.
  if (!ganz(x.N, 2 ** 24) || x.N < 2 || (x.N & (x.N - 1)) !== 0 || !ganz(x.r, 64) || !ganz(x.p, 64)) return null;
  if (speicher(x) > SPEICHER_HOECHSTENS) return null;
  const soll = Buffer.from(hash, 'base64');
  if (soll.length < 16 || soll.length > 128) return null;
  return { x, salz: Buffer.from(salz, 'base64'), soll };
}

export async function pruefePasswort(passwort: string, gespeichert: string | null | undefined): Promise<boolean> {
  const g = gespeichert ? lies(gespeichert) : null;
  if (!g) {
    // Gleich viel Arbeit wie bei einem echten Vergleich, damit die Antwortzeit nichts verrät.
    await scryptAsync(passwort, randomBytes(16), LAENGE, aktuelleParameter());
    return false;
  }
  const ist = await scryptAsync(passwort, g.salz, g.soll.length, g.x);
  return ist.length === g.soll.length && timingSafeEqual(ist, g.soll);
}

/**
 * Ist der Hash schwächer als die aktuellen Parameter (#1358) – weniger Arbeit `N·r·p` oder ein kürzerer Hash? Dann
 * speichert ihn Ablago nach dem nächsten richtigen Passwort neu. Stärkere bleiben: Auch eine Version mit anderen
 * Vorgaben schwächt keinen Hash ab.
 */
export function hashVeraltet(gespeichert: string | null | undefined): boolean {
  const g = gespeichert ? lies(gespeichert) : null;
  if (!g) return false;
  const x = aktuelleParameter();
  return g.x.N * g.x.r * g.x.p < x.N * x.r * x.p || g.soll.length < LAENGE;
}

/** Zufälliger Schlüssel für Sitzungen und Links (256 Bit, URL-tauglich). */
export const neuerSchluessel = () => randomBytes(32).toString('base64url');

/** In der Datenbank liegt nur der Hash eines Schlüssels. */
export const hasheSchluessel = (s: string) => createHash('sha256').update(s).digest('hex');
