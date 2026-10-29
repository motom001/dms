import { randomBytes } from 'node:crypto';
import { chmod, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import postgres from 'postgres';
import { Fachfehler } from './fehler';
import { protokoll } from './protokoll';

/**
 * Anbindung an die Datenbank (#119): eine Datei unter /data/geheim, führend vor DATABASE_URL.
 *
 *   { "host": "db", "port": 5432, "datenbank": "dms", "benutzer": "dms", "passwort": "…", "mandant": "<uuid>" }
 *
 * Gibt es die Datei nicht, aber DATABASE_URL, übernimmt das DMS den Wert beim ersten Start
 * (wie APP_URL/SMTP_* in 0.9). Gibt es beides nicht, fragt der Einrichtungsassistent.
 * „mandant“ ist die interne Id des Mandanten (früher HAUSHALT_ID).
 */
export interface Anbindung { host: string; port: number; datenbank: string; benutzer: string; passwort: string; mandant?: string }
/** Für die Oberfläche: nie mit Passwort. */
export interface AnbindungAnsicht { host: string; port: number; datenbank: string; benutzer: string; passwortGesetzt: boolean }

export const ANBINDUNG_DATEI = 'datenbank.json';
export const STANDARD_ANBINDUNG: Omit<Anbindung, 'passwort'> = { host: 'db', port: 5432, datenbank: 'dms', benutzer: 'dms' };

export function ausUrl(url: string | undefined): Anbindung | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.protocol !== 'postgres:' && u.protocol !== 'postgresql:') return null;
    return {
      host: decodeURIComponent(u.hostname) || 'localhost', port: Number(u.port || 5432),
      datenbank: decodeURIComponent(u.pathname.replace(/^\//, '')) || 'postgres',
      benutzer: decodeURIComponent(u.username), passwort: decodeURIComponent(u.password),
    };
  } catch { return null; }
}

export function alsUrl(a: Anbindung, datenbank = a.datenbank): string {
  const e = encodeURIComponent;
  const host = a.host.includes(':') && !a.host.startsWith('[') ? `[${a.host}]` : a.host;
  return `postgres://${e(a.benutzer)}${a.passwort ? `:${e(a.passwort)}` : ''}@${host}:${a.port}/${e(datenbank)}`;
}

export const ansicht = (a: Anbindung | null): AnbindungAnsicht | null => (a ? { host: a.host, port: a.port, datenbank: a.datenbank, benutzer: a.benutzer, passwortGesetzt: !!a.passwort } : null);

/** Gleiche Verbindung (ohne Mandant)? */
export const gleicheVerbindung = (a: Anbindung, b: Anbindung) => a.host === b.host && a.port === b.port && a.datenbank === b.datenbank && a.benutzer === b.benutzer && a.passwort === b.passwort;

/** Eingabe aus dem Formular prüfen; ein leeres Passwort heißt „wie bisher“. */
export function anbindungAus(x: unknown, bisher: Anbindung | null): Anbindung {
  const o = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
  const t = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  const host = t(o.host), datenbank = t(o.datenbank), benutzer = t(o.benutzer);
  const port = Number(o.port ?? 5432);
  const fehler: Record<string, string> = {};
  if (!host || /[\s/]/.test(host)) fehler.host = 'Rechnername oder IP-Adresse angeben, z. B. db.';
  if (!Number.isInteger(port) || port < 1 || port > 65535) fehler.port = 'Port zwischen 1 und 65535, meist 5432.';
  if (!datenbank) fehler.datenbank = 'Name der Datenbank angeben, z. B. dms.';
  if (!benutzer) fehler.benutzer = 'Benutzer der Datenbank angeben, z. B. dms.';
  if (Object.keys(fehler).length) throw new Fachfehler(422, 'Bitte die markierten Angaben prüfen.', { felder: fehler });
  const passwort = typeof o.passwort === 'string' && o.passwort !== '' ? o.passwort : bisher?.passwort ?? '';
  return { host, port, datenbank, benutzer, passwort, ...(bisher?.mandant ? { mandant: bisher.mandant } : {}) };
}

export async function liesAnbindung(ordner: string): Promise<Anbindung | null> {
  let text: string;
  try { text = await readFile(join(ordner, ANBINDUNG_DATEI), 'utf8'); } catch { return null; }
  const j = JSON.parse(text) as Partial<Anbindung>;
  if (!j.host || !j.datenbank || !j.benutzer) throw new Error(`${join(ordner, ANBINDUNG_DATEI)} ist unvollständig (host, datenbank, benutzer).`);
  return { host: j.host, port: Number(j.port ?? 5432), datenbank: j.datenbank, benutzer: j.benutzer, passwort: j.passwort ?? '', ...(j.mandant ? { mandant: j.mandant } : {}) };
}

/** Schreibt die Datei erst vollständig, dann sichtbar; nur für den Besitzer lesbar. */
export async function schreibeAnbindung(ordner: string, a: Anbindung) {
  const ziel = join(ordner, ANBINDUNG_DATEI);
  const tmp = `${ziel}.${randomBytes(4).toString('hex')}.tmp`;
  const inhalt = { host: a.host, port: a.port, datenbank: a.datenbank, benutzer: a.benutzer, passwort: a.passwort, ...(a.mandant ? { mandant: a.mandant } : {}) };
  await writeFile(tmp, `${JSON.stringify(inhalt, null, 2)}\n`, { mode: 0o600 });
  await chmod(tmp, 0o600).catch(() => {});
  await rename(tmp, ziel);
}

/* ---------- Verbindung prüfen ---------- */

export type Fehlerart = 'nicht_erreichbar' | 'anmeldung' | 'datenbank_fehlt' | 'sonst';
export type Pruefung =
  | { ok: true; postgres: string; eingerichtet: boolean; benutzer: number }
  | { ok: false; art: Fehlerart; text: string; anlegenMoeglich?: boolean; technisch: string };

type Verbinder = (url: string) => postgres.Sql;
const kurz: Verbinder = (url) => postgres(url, { max: 1, connect_timeout: 6, idle_timeout: 1, onnotice: () => {} });

/** Verständliche Meldung zu einem Verbindungsfehler. */
export function deute(e: unknown, a: Pick<Anbindung, 'host' | 'port' | 'datenbank' | 'benutzer'>): { art: Fehlerart; text: string; technisch: string } {
  const x = e as { code?: string; message?: string; errno?: string };
  const code = x.code ?? x.errno ?? '';
  const technisch = `${code ? `${code}: ` : ''}${x.message ?? String(e)}`;
  if (['ENOTFOUND', 'EAI_AGAIN'].includes(code)) return { art: 'nicht_erreichbar', text: `Den Rechner „${a.host}“ gibt es im Netz nicht. Heißt der Datenbank-Container anders? In der Compose-Vorlage heißt er „db“.`, technisch };
  if (['ECONNREFUSED', 'ETIMEDOUT', 'CONNECT_TIMEOUT', 'EHOSTUNREACH', 'ENETUNREACH', 'ECONNRESET'].includes(code)) return { art: 'nicht_erreichbar', text: `Der Datenbank-Server ${a.host}:${a.port} ist nicht erreichbar. Läuft der Datenbank-Container, und stimmt der Port (meist 5432)?`, technisch };
  if (code === '28P01') return { art: 'anmeldung', text: `Das Passwort für den Benutzer „${a.benutzer}“ ist falsch. Es steht in der Compose-Datei bzw. der .env (POSTGRES_PASSWORD bzw. DB_PASSWORD).`, technisch };
  if (code === '28000') return { art: 'anmeldung', text: `Der Benutzer „${a.benutzer}“ darf sich nicht anmelden (unbekannt oder vom Server nicht zugelassen). In der Compose-Vorlage heißt er „dms“.`, technisch };
  if (code === '3D000') return { art: 'datenbank_fehlt', text: `Die Datenbank „${a.datenbank}“ gibt es auf dem Server noch nicht.`, technisch };
  return { art: 'sonst', text: `Die Verbindung ist fehlgeschlagen: ${x.message ?? String(e)}`, technisch };
}

export async function pruefeAnbindung(a: Anbindung, verbinde: Verbinder = kurz): Promise<Pruefung> {
  const sql = verbinde(alsUrl(a));
  try {
    const [{ v }] = await sql`SELECT current_setting('server_version') AS v`;
    const [{ hat }] = await sql`SELECT to_regclass('public.benutzer') IS NOT NULL AS hat`;
    const benutzer = hat ? Number((await sql`SELECT count(*)::int AS n FROM benutzer`)[0].n) : 0;
    return { ok: true, postgres: String(v), eingerichtet: !!hat, benutzer };
  } catch (e) {
    const d = deute(e, a);
    if (d.art !== 'datenbank_fehlt') return { ok: false, ...d };
    return { ok: false, ...d, anlegenMoeglich: await darfAnlegen(a, verbinde) };
  } finally {
    await sql.end({ timeout: 1 }).catch(() => {});
  }
}

/** Darf der Benutzer Datenbanken anlegen? Geprüft über die Verwaltungsdatenbank „postgres“. */
async function darfAnlegen(a: Anbindung, verbinde: Verbinder): Promise<boolean> {
  const sql = verbinde(alsUrl(a, 'postgres'));
  try {
    const [r] = await sql`SELECT rolcreatedb OR rolsuper AS darf FROM pg_roles WHERE rolname = current_user`;
    return !!r?.darf;
  } catch { return false; } finally { await sql.end({ timeout: 1 }).catch(() => {}); }
}

export async function legeDatenbankAn(a: Anbindung, verbinde: Verbinder = kurz) {
  if (!/^[\p{L}\p{N}_-]{1,63}$/u.test(a.datenbank)) throw new Error('Der Name der Datenbank darf nur Buchstaben, Ziffern, _ und - enthalten.');
  const sql = verbinde(alsUrl(a, 'postgres'));
  try {
    await sql.unsafe(`CREATE DATABASE "${a.datenbank}"`);
  } catch (e) {
    throw new Error(`Die Datenbank ließ sich nicht anlegen: ${(e as Error).message}`);
  } finally { await sql.end({ timeout: 1 }).catch(() => {}); }
}

/* ---------- Werkbank: Anbindung ansehen und ändern ---------- */

export interface AnbindungStand {
  anbindung: AnbindungAnsicht;
  datei: string;
  /** DATABASE_URL: nicht gesetzt, gleich (überflüssig) oder abweichend (wird ignoriert). */
  umgebung: 'fehlt' | 'gleich' | 'abweichend';
  /** Die Datei wurde geändert und gilt erst nach einem Neustart. */
  neustartNoetig: boolean;
}

export class AnbindungVerwaltung {
  private gespeichert: Anbindung;
  constructor(readonly ordner: string, private laufend: Anbindung, private umgebung: Anbindung | null, private neustartFn: () => void,
    private pruefer: (a: Anbindung) => Promise<Pruefung> = (a) => pruefeAnbindung(a)) {
    this.gespeichert = laufend;
  }

  stand(): AnbindungStand {
    return {
      anbindung: ansicht(this.gespeichert)!, datei: join(this.ordner, ANBINDUNG_DATEI),
      umgebung: !this.umgebung ? 'fehlt' : gleicheVerbindung(this.umgebung, this.laufend) ? 'gleich' : 'abweichend',
      neustartNoetig: !gleicheVerbindung(this.gespeichert, this.laufend),
    };
  }

  private eingabe(x: unknown): Anbindung { return anbindungAus(x, this.gespeichert); }

  async pruefe(x: unknown): Promise<Pruefung> { return this.pruefer(this.eingabe(x)); }

  /** Erst testen, dann übernehmen; eine leere Datenbank nur mit ausdrücklicher Bestätigung. */
  async speichere(x: unknown, von: string): Promise<AnbindungStand & { pruefung: Pruefung }> {
    const a = this.eingabe(x);
    const p = await this.pruefer(a);
    if (!p.ok) throw new Fachfehler(422, p.text, { pruefung: p });
    const leer = !p.eingerichtet || p.benutzer === 0;
    if (leer && (x as { leerBestaetigt?: unknown })?.leerBestaetigt !== true) {
      throw new Fachfehler(409, 'In dieser Datenbank gibt es noch kein DMS. Nach dem Neustart beginnt dort die Einrichtung von vorn – bitte bestätigen.', { pruefung: p, leer: true });
    }
    await schreibeAnbindung(this.ordner, { ...a, mandant: leer ? undefined : this.laufend.mandant });
    this.gespeichert = a;
    protokoll.modul('system').warn('Datenbank-Anbindung geändert – gilt nach dem Neustart', { von, host: a.host, port: a.port, datenbank: a.datenbank, benutzer: a.benutzer });
    return { ...this.stand(), pruefung: p };
  }

  neustart(von: string) {
    protokoll.modul('system').warn('Neustart aus der Werkbank', { von });
    setTimeout(() => this.neustartFn(), 800).unref?.();
  }
}
