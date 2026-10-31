import { randomBytes, timingSafeEqual } from 'node:crypto';
import { chmod, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Benutzer } from '../../shared/src/model';
import { Fachfehler } from './fehler';

/**
 * Konsolenzugang (#244): Der Befehl `dms` im Container spricht mit dem laufenden Server – nicht mit
 * der Datenbank. Beim Start legt der Server eine Datei mit einem zufälligen Zugangsschlüssel und
 * seiner Adresse an, lesbar nur für den Eigentümer, und zwar im /tmp des Containers (nicht im
 * Volume: jeder Container hat seinen eigenen). Wer `docker exec` darf, darf auch die Konsole.
 * Der Server nimmt den Schlüssel nur über die Loopback-Schnittstelle an.
 */

export const KONSOLE_KOPF = 'x-dms-konsole';
export const ALS_KOPF = 'x-dms-als';
export const konsolenDatei = (env: NodeJS.ProcessEnv = process.env) => env.DMS_KONSOLE_DATEI || join(tmpdir(), 'dms-konsole.json');

export interface KonsolenDatei { schluessel: string; url: string; pid: number }

/** Adresse, unter der der Befehl im selben Container den Server erreicht. */
export function lokaleUrl(port: number, host = '0.0.0.0') {
  const h = !host || host === '0.0.0.0' || host === '::' ? '127.0.0.1' : host.includes(':') ? `[${host}]` : host;
  return `http://${h}:${port}`;
}

export function istLoopback(ip: string | undefined): boolean {
  if (!ip) return false;
  const a = ip.replace(/^::ffff:/i, '');
  return a === '::1' || /^127\./.test(a);
}

export class Konsolenzugang {
  private readonly schluessel = randomBytes(32).toString('base64url');
  constructor(readonly datei: string = konsolenDatei()) {}

  async schreibe(url: string) {
    const inhalt: KonsolenDatei = { schluessel: this.schluessel, url, pid: process.pid };
    await rm(this.datei, { force: true }).catch(() => {});
    await writeFile(this.datei, `${JSON.stringify(inhalt)}\n`, { mode: 0o600, flag: 'wx' });
    await chmod(this.datei, 0o600).catch(() => {});
  }

  async entferne() { await rm(this.datei, { force: true }).catch(() => {}); }

  passt(wert: string | undefined): boolean {
    if (!wert) return false;
    const a = Buffer.from(wert), b = Buffer.from(this.schluessel);
    return a.length === b.length && timingSafeEqual(a, b);
  }
}

/**
 * Als wer handelt die Konsole? Als der angegebene Administrator (--als) oder als der älteste aktive.
 * So bleiben „angelegt von“ und Protokoll stimmig; das Protokoll vermerkt zusätzlich „Konsole“.
 */
export function konsolenBenutzer(liste: Benutzer[], als: string | undefined): Benutzer {
  const admins = liste.filter((b) => b.aktiv && b.rolle === 'admin').sort((x, y) => x.erstellt.localeCompare(y.erstellt));
  if (als) {
    const b = admins.find((x) => x.email.toLowerCase() === als.trim().toLowerCase());
    if (!b) throw new Fachfehler(404, `Unter ${als} gibt es keinen aktiven Administrator.`);
    return b;
  }
  if (!admins.length) throw new Fachfehler(409, 'Es gibt noch keinen aktiven Administrator. Richte das DMS im Browser ein (oder nutze den Notfallzugang).');
  return admins[0];
}
