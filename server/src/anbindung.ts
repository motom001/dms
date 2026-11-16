import { randomBytes } from 'node:crypto';
import { chmod, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import postgres from 'postgres';
import { Fachfehler } from './fehler';
import { protokoll } from './protokoll';
import { t } from './sprache';
import { aufVolume } from './tresor';

/**
 * Anbindung an die Datenbank (#119): eine Datei unter /data/geheim, führend vor DATABASE_URL.
 *
 *   { "host": "db", "port": 5432, "datenbank": "dms", "benutzer": "dms", "passwort": "…", "mandant": "<uuid>" }
 *
 * Gibt es die Datei nicht, aber DATABASE_URL, übernimmt das DMS den Wert beim ersten Start
 * (wie APP_URL/SMTP_* in 0.9). Gibt es beides nicht, fragt der Einrichtungsassistent.
 * „mandant“ ist die interne Id des Mandanten (früher HAUSHALT_ID).
 */
export interface Anbindung {
  host: string;
  port: number;
  datenbank: string;
  benutzer: string;
  passwort: string;
  mandant?: string;
}
/** Für die Oberfläche: nie mit Passwort. */
export interface AnbindungAnsicht {
  host: string;
  port: number;
  datenbank: string;
  benutzer: string;
  passwortGesetzt: boolean;
}

export const ANBINDUNG_DATEI = 'datenbank.json';
export const STANDARD_ANBINDUNG: Omit<Anbindung, 'passwort'> = { host: 'db', port: 5432, datenbank: 'dms', benutzer: 'dms' };

export function ausUrl(url: string | undefined): Anbindung | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.protocol !== 'postgres:' && u.protocol !== 'postgresql:') return null;
    return {
      host: decodeURIComponent(u.hostname) || 'localhost',
      port: Number(u.port || 5432),
      datenbank: decodeURIComponent(u.pathname.replace(/^\//, '')) || 'postgres',
      benutzer: decodeURIComponent(u.username),
      passwort: decodeURIComponent(u.password),
    };
  } catch {
    return null;
  }
}

/**
 * DATABASE_URL aus der Compose-Datei (#805): Bei dms-komplett setzt das Start-Skript die Variable selbst und
 * kennzeichnet das mit DMS_DATENBANK_VOM_IMAGE=1. Dann ist sie kein Rest aus der Compose-Datei, und kein
 * Hinweis („nicht mehr nötig“, „weicht ab“) soll dazu raten, sie zu entfernen. Steht sie wirklich in der
 * Compose-Datei, fehlt die Kennzeichnung, und alles bleibt wie bisher.
 */
export function datenbankVomImage(env: Record<string, string | undefined>): boolean {
  return env.DMS_VARIANTE === 'komplett' && env.DMS_DATENBANK_VOM_IMAGE === '1';
}

/** Ordner der Datenbank in dms-komplett (deploy/komplett/start.sh). */
export const DATENBANK_ORDNER = '/data/postgres';
/** Anleitung: Daten aus dem Container retten, bevor man ihn neu anlegt (Handbuch Installation, dms-komplett). */
export const DATENBANK_RETTEN = 'https://help.ablago.app/installieren/aktuell/komplett/#datenbank-retten';

/**
 * dms-komplett ohne eigenes Volume für /data/postgres (#943): Die Datenbank liegt dann nur im Container. Ein Neustart
 * schadet nicht, aber beim Neuanlegen des Containers (docker compose down, Update) ist sie weg. Geprüft wie bei der
 * Schlüsseldatei, der Sicherung und den Exporten (`aufVolume`); nicht feststellbar (kein Container) = keine Warnung.
 */
export function datenbankOhneVolume(env: Record<string, string | undefined>, volume: (p: string) => boolean | null = aufVolume): boolean {
  return env.DMS_VARIANTE === 'komplett' && volume(DATENBANK_ORDNER) === false;
}

/** Die Anbindung aus Umgebungsvariablen, soweit sie aus der Compose-Datei stammt; null, wenn das Image sie setzt. */
export function umgebungAusCompose(env: Record<string, string | undefined>, umgebung: Anbindung | null): Anbindung | null {
  return datenbankVomImage(env) ? null : umgebung;
}

/**
 * Ohne DATABASE_URL (#184): DMS_DB_PASSWORT (und optional DMS_DB_HOST, DMS_DB_PORT) für Vorlagen, in denen
 * das Passwort nur einmal steht – ohne Sonderzeichen in einer URL maskieren zu müssen.
 */
export function ausVariablen(env: Record<string, string | undefined>): Anbindung | null {
  if (!env.DMS_DB_PASSWORT) return null;
  const port = Number(env.DMS_DB_PORT) || STANDARD_ANBINDUNG.port;
  return { ...STANDARD_ANBINDUNG, host: env.DMS_DB_HOST || STANDARD_ANBINDUNG.host, port, passwort: env.DMS_DB_PASSWORT };
}

export function alsUrl(a: Anbindung, datenbank = a.datenbank): string {
  const e = encodeURIComponent;
  const host = a.host.includes(':') && !a.host.startsWith('[') ? `[${a.host}]` : a.host;
  return `postgres://${e(a.benutzer)}${a.passwort ? `:${e(a.passwort)}` : ''}@${host}:${a.port}/${e(datenbank)}`;
}

export const ansicht = (a: Anbindung | null): AnbindungAnsicht | null =>
  a ? { host: a.host, port: a.port, datenbank: a.datenbank, benutzer: a.benutzer, passwortGesetzt: !!a.passwort } : null;

/** Gleiche Verbindung (ohne Mandant)? */
export const gleicheVerbindung = (a: Anbindung, b: Anbindung) =>
  a.host === b.host && a.port === b.port && a.datenbank === b.datenbank && a.benutzer === b.benutzer && a.passwort === b.passwort;

/** Eingabe aus dem Formular prüfen; ein leeres Passwort heißt „wie bisher“. */
export function anbindungAus(x: unknown, bisher: Anbindung | null): Anbindung {
  const o = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
  const eintrag = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  const host = eintrag(o.host),
    datenbank = eintrag(o.datenbank),
    benutzer = eintrag(o.benutzer);
  const port = Number(o.port ?? 5432);
  const fehler: Record<string, string> = {};
  if (!host || /[\s/]/.test(host)) fehler.host = t('meldungen.anbindung.rechnername-oder-ip-adresse');
  if (!Number.isInteger(port) || port < 1 || port > 65535) fehler.port = t('meldungen.anbindung.port-zwischen-1-und');
  if (!datenbank) fehler.datenbank = t('meldungen.anbindung.name-der-datenbank-angeben');
  if (!benutzer) fehler.benutzer = t('meldungen.anbindung.benutzer-der-datenbank-angeben');
  if (Object.keys(fehler).length) throw new Fachfehler(422, t('meldungen.anbindung.bitte-die-markierten-angaben'), { felder: fehler });
  const passwort = typeof o.passwort === 'string' && o.passwort !== '' ? o.passwort : (bisher?.passwort ?? '');
  return { host, port, datenbank, benutzer, passwort, ...(bisher?.mandant ? { mandant: bisher.mandant } : {}) };
}

export async function liesAnbindung(ordner: string): Promise<Anbindung | null> {
  let text: string;
  try {
    text = await readFile(join(ordner, ANBINDUNG_DATEI), 'utf8');
  } catch {
    return null;
  }
  const j = JSON.parse(text) as Partial<Anbindung>;
  if (!j.host || !j.datenbank || !j.benutzer)
    throw new Error(`${join(ordner, ANBINDUNG_DATEI)} ist unvollständig (host, datenbank, benutzer).`);
  return {
    host: j.host,
    port: Number(j.port ?? 5432),
    datenbank: j.datenbank,
    benutzer: j.benutzer,
    passwort: j.passwort ?? '',
    ...(j.mandant ? { mandant: j.mandant } : {}),
  };
}

/** Schreibt die Datei erst vollständig, dann sichtbar; nur für den Besitzer lesbar. */
export async function schreibeAnbindung(ordner: string, a: Anbindung) {
  const ziel = join(ordner, ANBINDUNG_DATEI);
  const tmp = `${ziel}.${randomBytes(4).toString('hex')}.tmp`;
  const inhalt = {
    host: a.host,
    port: a.port,
    datenbank: a.datenbank,
    benutzer: a.benutzer,
    passwort: a.passwort,
    ...(a.mandant ? { mandant: a.mandant } : {}),
  };
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
const kurz: Verbinder = (url) => postgres(url, { max: 1, connect_timeout: 6, idle_timeout: 1, onnotice: () => {}, infer: true });

/** Verständliche Meldung zu einem Verbindungsfehler. */
export function deute(
  e: unknown,
  a: Pick<Anbindung, 'host' | 'port' | 'datenbank' | 'benutzer'>,
): { art: Fehlerart; text: string; technisch: string } {
  const x = e as { code?: string; message?: string; errno?: string };
  const code = x.code ?? x.errno ?? '';
  const technisch = `${code ? `${code}: ` : ''}${x.message ?? String(e)}`;
  if (['ENOTFOUND', 'EAI_AGAIN'].includes(code))
    return { art: 'nicht_erreichbar', text: t('meldungen.anbindung.den-rechner-gibt-es', { host: a.host }), technisch };
  if (['ECONNREFUSED', 'ETIMEDOUT', 'CONNECT_TIMEOUT', 'EHOSTUNREACH', 'ENETUNREACH', 'ECONNRESET'].includes(code))
    return { art: 'nicht_erreichbar', text: t('meldungen.anbindung.der-datenbank-server-ist', { host: a.host, port: a.port }), technisch };
  if (code === '28P01')
    return { art: 'anmeldung', text: t('meldungen.anbindung.das-passwort-fuer-den', { benutzer: a.benutzer }), technisch };
  if (code === '28000')
    return { art: 'anmeldung', text: t('meldungen.anbindung.der-benutzer-darf-sich', { benutzer: a.benutzer }), technisch };
  if (code === '3D000')
    return { art: 'datenbank_fehlt', text: t('meldungen.anbindung.die-datenbank-gibt-es', { datenbank: a.datenbank }), technisch };
  return { art: 'sonst', text: t('meldungen.anbindung.die-verbindung-ist-fehlgeschlagen', { wert: x.message ?? String(e) }), technisch };
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
  } catch {
    return false;
  } finally {
    await sql.end({ timeout: 1 }).catch(() => {});
  }
}

export async function legeDatenbankAn(a: Anbindung, verbinde: Verbinder = kurz) {
  if (!/^[\p{L}\p{N}_-]{1,63}$/u.test(a.datenbank))
    throw new Error('Der Name der Datenbank darf nur Buchstaben, Ziffern, _ und - enthalten.');
  const sql = verbinde(alsUrl(a, 'postgres'));
  try {
    await sql.unsafe(`CREATE DATABASE "${a.datenbank}"`);
  } catch (e) {
    throw new Error(`Die Datenbank ließ sich nicht anlegen: ${(e as Error).message}`);
  } finally {
    await sql.end({ timeout: 1 }).catch(() => {});
  }
}

/* ---------- Werkbank: Anbindung ansehen und ändern ---------- */

export interface AnbindungStand {
  anbindung: AnbindungAnsicht;
  datei: string;
  /** DATABASE_URL: nicht gesetzt, gleich (überflüssig) oder abweichend (wird ignoriert). */
  umgebung: 'fehlt' | 'gleich' | 'abweichend';
  /** Die Datei wurde geändert und gilt erst nach einem Neustart. */
  neustartNoetig: boolean;
  /** dms-komplett (#208): PostgreSQL läuft im Container, das Start-Skript setzt DATABASE_URL. */
  imContainer: boolean;
  /** dms-komplett (#943): /data/postgres liegt nicht auf einem eigenen Volume – die Datenbank ginge beim Update verloren. */
  ohneVolume: boolean;
}

export class AnbindungVerwaltung {
  constructor(
    readonly ordner: string,
    private laufend: Anbindung,
    private umgebung: Anbindung | null,
    private neustartFn: () => void,
    private pruefer: (a: Anbindung) => Promise<Pruefung> = (a) => pruefeAnbindung(a),
    private ohneVolume = datenbankOhneVolume(process.env),
  ) {}

  /**
   * Gespeicherte Anbindung (#1341): aus der Datei, nicht aus dem Speicher des Prozesses, der gespeichert hat – so zeigen
   * alle Prozesse (und weitere Server mit demselben Ordner) dasselbe „Neustart nötig“. Ohne (lesbare) Datei: die laufende.
   */
  private async gespeichert(): Promise<Anbindung> {
    return (await liesAnbindung(this.ordner).catch(() => null)) ?? this.laufend;
  }

  async stand(): Promise<AnbindungStand> {
    const gespeichert = await this.gespeichert();
    return {
      anbindung: ansicht(gespeichert)!,
      datei: join(this.ordner, ANBINDUNG_DATEI),
      umgebung: !this.umgebung ? 'fehlt' : gleicheVerbindung(this.umgebung, this.laufend) ? 'gleich' : 'abweichend',
      neustartNoetig: !gleicheVerbindung(gespeichert, this.laufend),
      imContainer: process.env.DMS_VARIANTE === 'komplett',
      ohneVolume: this.ohneVolume,
    };
  }

  private async eingabe(x: unknown): Promise<Anbindung> {
    return anbindungAus(x, await this.gespeichert());
  }

  async pruefe(x: unknown): Promise<Pruefung> {
    return this.pruefer(await this.eingabe(x));
  }

  /** Erst testen, dann übernehmen; eine leere Datenbank nur mit ausdrücklicher Bestätigung. */
  async speichere(x: unknown, von: string): Promise<AnbindungStand & { pruefung: Pruefung }> {
    const a = await this.eingabe(x);
    const p = await this.pruefer(a);
    if (!p.ok) throw new Fachfehler(422, p.text, { pruefung: p });
    const leer = !p.eingerichtet || p.benutzer === 0;
    if (leer && (x as { leerBestaetigt?: unknown })?.leerBestaetigt !== true) {
      throw new Fachfehler(409, t('meldungen.anbindung.in-dieser-datenbank-gibt'), { pruefung: p, leer: true });
    }
    await schreibeAnbindung(this.ordner, { ...a, mandant: leer ? undefined : this.laufend.mandant });
    protokoll.modul('system').warn('Datenbank-Anbindung geändert – gilt nach dem Neustart', {
      von,
      host: a.host,
      port: a.port,
      datenbank: a.datenbank,
      benutzer: a.benutzer,
    });
    return { ...(await this.stand()), pruefung: p };
  }

  neustart(von: string) {
    protokoll.modul('system').warn('Neustart aus der Werkbank', { von });
    setTimeout(() => this.neustartFn(), 800).unref?.();
  }
}
