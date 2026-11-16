/**
 * Start (#1278, aus `ablago.ts`): Einrichtungscode (#176) und Datenbank aus der Umgebung (#184) mit ihren Hinweisen.
 */
import { Einrichtungscode } from '../einrichtung/einrichtungscode';
import { ausUrl, ausVariablen } from '../datenbank/anbindung';
import type { vorbereiten } from './vorbereiten';

/** Was liesUmgebung von früher braucht. */
type Bisher = Pick<Awaited<ReturnType<typeof vorbereiten>>, 'ordner' | 'log'> & { env: NodeJS.ProcessEnv };

/** Einrichtungscode und Datenbank aus der Umgebung. */
export function liesUmgebung(bisher: Bisher) {
  const { ordner, env, log } = bisher;

  // Datenbank-Anbindung (#119): Datei unter /data/geheim, führend; sonst DATABASE_URL übernehmen;
  // sonst (oder wenn sie nicht funktioniert) der Einrichtungsassistent im Browser.
  // App-Stores (#176): DMS_EINRICHTUNGSCODE=aus – ohne Code einrichten.
  const einrichtungscode = new Einrichtungscode(ordner.geheim, Date.now, env.DMS_EINRICHTUNGSCODE === 'aus');
  // Vorlagen für NAS-Systeme (#184): nur DMS_DB_PASSWORT statt einer ganzen DATABASE_URL.
  const umgebung = ausUrl(env.DATABASE_URL) ?? ausVariablen(env);
  if (env.DMS_DB_PASSWORT?.startsWith('HIER-'))
    log.warn(
      'DMS_DB_PASSWORT ist noch das Beispiel aus der Vorlage – bitte in der Compose-Datei ein eigenes Passwort eintragen und das Projekt neu erstellen',
    );
  if (env.DATABASE_URL && !umgebung) log.error('DATABASE_URL ist keine gültige postgres://-Adresse und wird ignoriert');
  return { einrichtungscode, umgebung };
}
