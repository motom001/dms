import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

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
 * Jeder Hash trägt seine Parameter selbst (`scrypt$N$r$p$salz$hash`): Ältere bleiben prüfbar und werden beim nächsten
 * erfolgreichen Anmelden mit diesen Werten neu gespeichert (`hashVeraltet`).
 */
export const SCRYPT: Readonly<ScryptParameter> = { N: 2 ** 14, r: 8, p: 5 };
/** Unter dem Test-Runner von Node (NODE_TEST_CONTEXT setzt `node --test`): schnelle Werte, damit Tests nicht länger laufen. */
const SCRYPT_TEST: Readonly<ScryptParameter> = { N: 2 ** 10, r: 8, p: 1 };
const LAENGE = 64;
/** Gespeicherte Hashes mit mehr Speicherbedarf je Prüfung gelten als ungültig (Schutz vor einem untergeschobenen Hash). */
const SPEICHER_HOECHSTENS = 256 * 2 ** 20;
/**
 * Höchstens so viele scrypt-Durchläufe gleichzeitig je Prozess. scrypt läuft im Thread-Pool von Node (4 Threads, auch
 * für Dateien und DNS); so bleiben Threads frei, und eine Welle von Anmeldungen bindet nicht mehr Rechenzeit als nötig.
 * Weitere warten in der Reihenfolge ihres Eintreffens – abgewiesen wird niemand.
 */
export const GLEICHZEITIG = 2;

export function aktuelleParameter(): Readonly<ScryptParameter> {
  return process.env.NODE_TEST_CONTEXT || process.env.NODE_ENV === 'test' ? SCRYPT_TEST : SCRYPT;
}

/** Speicher, den scrypt für diese Parameter braucht (wie OpenSSL rechnet), mit etwas Luft – `maxmem` von Node. */
const speicher = ({ N, r, p }: ScryptParameter) => 128 * r * (N + p + 2);

/** Warteschlange der scrypt-Durchläufe dieses Prozesses. */
class Bremse {
  private laufend = 0;
  private wartend: Array<() => void> = [];
  constructor(private gleichzeitig: number) {}
  async mit<T>(f: () => Promise<T>): Promise<T> {
    if (this.laufend >= this.gleichzeitig) await new Promise<void>((weiter) => this.wartend.push(weiter));
    else this.laufend++;
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
const bremse = new Bremse(GLEICHZEITIG);
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
 * Trägt der Hash andere Parameter als die aktuellen (#1358)? Dann speichert ihn Ablago nach dem nächsten richtigen
 * Passwort neu. Auch ein Hash mit stärkeren Werten wird angeglichen: Die aktuellen Parameter sind die Vorgabe.
 */
export function hashVeraltet(gespeichert: string | null | undefined): boolean {
  const g = gespeichert ? lies(gespeichert) : null;
  if (!g) return false;
  const x = aktuelleParameter();
  return g.x.N !== x.N || g.x.r !== x.r || g.x.p !== x.p || g.soll.length !== LAENGE;
}

/** Zufälliger Schlüssel für Sitzungen und Links (256 Bit, URL-tauglich). */
export const neuerSchluessel = () => randomBytes(32).toString('base64url');

/** In der Datenbank liegt nur der Hash eines Schlüssels. */
export const hasheSchluessel = (s: string) => createHash('sha256').update(s).digest('hex');
