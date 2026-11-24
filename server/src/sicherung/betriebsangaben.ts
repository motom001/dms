/**
 * Betriebsangaben der Sicherung über ein Zurückholen hinweg (#1531). Die Sicherungsdateien liegen außerhalb der
 * Datenbank, ihre Angaben (zuletzt automatisch gesichert, Proben, Prüfungen, Kopien außer Haus, ausgeblendete …) aber
 * darin. Spielte Ablago sie mit der alten Datenbank zurück, zeigte die Werkbank Proben von Sicherungen, die es nicht
 * mehr gibt, und der Zeitplan hielte die heutige Sicherung für verpasst. Darum übernimmt die Wiederherstellung diese
 * Schlüssel aus dem jetzigen Stand in den neuen – Einstellungen wie Zeitplan und Aufbewahrung kommen dagegen aus der
 * Sicherung.
 */
import type postgres from 'postgres';
import type { Einstellungen } from '../einstellungen/einstellungen';
import { verschiebe } from '../../../shared/src/sichten';

/** Diese Schlüssel beschreiben die Sicherungsdateien und Läufe, nicht die Ablage – sie bleiben beim Zurückholen. */
const BETRIEBSANGABEN = [
  'sicherung_zuletzt_auto',
  'sicherung_probe_zuletzt',
  'sicherung_proben',
  'sicherung_probe_letzte',
  'sicherung_probe_gemeldet',
  'sicherung_pruefungen',
  'sicherung_fehler',
  'sicherung_gemeldet',
  'sicherung_extern',
  'sicherung_extern_gemeldet',
  'sicherung_entfernt',
  'sicherung_ausgeblendet',
  'sicherung_erste',
] as const;

/** Tag (JJJJ-MM-TT), bis zu dem ein Takt mit dieser Uhrzeit jetzt gelaufen sein sollte: heute ab der Uhrzeit, sonst gestern. */
export const faelligBis = (jetzt: { datum: string; uhr: string }, uhrzeit: string) =>
  jetzt.uhr >= uhrzeit ? jetzt.datum : verschiebe(jetzt.datum, -1);

/**
 * Angaben aus dem jetzigen Stand (`alt`) in die neue Datenbank (`neu`, Verbindung ins neue Schema) schreiben.
 * Die Merker der Zeitpläne stehen danach mindestens auf dem Tag, der jetzt fällig wäre: Direkt nach dem Zurückholen
 * holt Ablago nichts nach, die nächste automatische Sicherung und Probe kommen zur eingestellten Zeit.
 */
export async function uebernimmBetriebsangaben(
  alt: Pick<Einstellungen, 'lies'>,
  neu: postgres.Sql,
  haushaltId: string,
  jetzt: { datum: string; uhr: string },
  uhrzeiten: { sicherung: string; probe: string },
): Promise<string[]> {
  const werte = new Map<string, unknown>();
  for (const k of BETRIEBSANGABEN) werte.set(k, await alt.lies(k));
  const spaeter = (a: unknown, b: string) => (typeof a === 'string' && a > b ? a : b);
  werte.set('sicherung_zuletzt_auto', spaeter(werte.get('sicherung_zuletzt_auto'), faelligBis(jetzt, uhrzeiten.sicherung)));
  werte.set('sicherung_probe_zuletzt', spaeter(werte.get('sicherung_probe_zuletzt'), faelligBis(jetzt, uhrzeiten.probe)));
  const geschrieben: string[] = [];
  for (const [k, w] of werte) {
    if (w === null || w === undefined) {
      await neu`DELETE FROM einstellungen WHERE haushalt_id = ${haushaltId} AND schluessel = ${k}`;
      continue;
    }
    await neu`INSERT INTO einstellungen (haushalt_id, schluessel, wert) VALUES (${haushaltId}, ${k}, ${neu.json(w as postgres.JSONValue)})
      ON CONFLICT (haushalt_id, schluessel) DO UPDATE SET wert = EXCLUDED.wert`;
    geschrieben.push(k);
  }
  return geschrieben;
}
