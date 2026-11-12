/**
 * Wenn-Karte „Aufruf von außen“ (#679): Ein anderes System (Monitoring, Hausautomatisierung) löst eine Automatisierung
 * über eine eigene Adresse aus – ohne Anmeldung, aber nur mit Signatur (HMAC-SHA256 wie beim früheren Webhook, #627).
 *
 * - **Je Automatisierung eine Adresse** mit einem Geheimnis. Beides legt die Werkbank **ausdrücklich** an („Adresse
 *   anlegen“), nicht schon das Speichern der Karte; das Geheimnis steht nur einmal vollständig da, erneuerbar.
 * - **Kontext sind nur die mitgeschickten Parameter**: Die Karte nennt ihre Namen ({@link WennAufruf}.parameter); nur
 *   diese werden übernommen, nur als Text, gekürzt ({@link AUFRUF_GRENZEN}). Sie sind Platzhalter – nie Feldschlüssel,
 *   nie Code. Keine Mappe: Bedingungen nur auf Merkmale der Ablage, Empfänger nur Personen und Rollen (wie #677).
 * - Modell, Prüfung, Platzhalter und Kurzform; Adresse, Signatur und Bremse im Server (`server/src/automatisierung/aufruf.ts`).
 */
import type { Lauf } from './automatisierung';
import { t } from './texte';

/** Grenzen des Aufrufs von außen, die auch die Oberfläche kennt (Parameter, Länge, Zeitfenster, angenommene je Adresse). Bytes und die übrige Bremse stehen in server/src/grenzen.ts. */
export const AUFRUF_GRENZEN = {
  /** Höchstens so viele Parameter je Karte (Namen) und je Aufruf (Werte). */
  parameter: 10,
  /** Länge eines Parameternamens. */
  name: 40,
  /** Länge eines Werts (Zeichen); längere werden gekürzt. */
  wert: 500,
  /** Zeitstempel darf so viele Sekunden abweichen; so lange merkt sich Ablago gesehene Signaturen (Wiederholschutz). */
  fensterS: 300,
  /**
   * Bremse je Adresse für **angenommene** Aufrufe (gültig signiert) je Minute – unter der Bremse der Automatisierung (30
   * Läufe je Minute, sie hält sonst an). Die Grenzen für abgelehnte Aufrufe und je IP-Bereich stehen in server/src/grenzen.ts.
   */
  jeAdresseJeMinute: 12,
} as const;

/** Kopf mit dem Zeitstempel (Unix-Sekunden) und Kopf mit der Signatur `v1=<hex>` – Schema des Webhooks (#627). */
export const AUFRUF_ZEIT_KOPF = 'x-dms-zeit';
export const AUFRUF_SIGNATUR_KOPF = 'x-dms-signatur';
/** Präfix des Geheimnisses (erkennbar beim Kopieren und in Geheimnis-Scannern, wie `whsec_` beim Webhook). */
export const AUFRUF_GEHEIMNIS_PRAEFIX = 'whsec_';
/** Pfad der Adresse ohne die Kennung. */
export const AUFRUF_PFAD = '/api/aufruf/';
/** Kennung in der Adresse: 32 Byte base64url, also genau 43 Zeichen (nicht ratbar). */
export const AUFRUF_KENNUNG = /^[A-Za-z0-9_-]{43}$/;

/** Die Wenn-Karte: Namen der Parameter, die ein Aufruf mitbringen darf. */
export interface WennAufruf { art: 'aufruf'; parameter: string[] }

export const istAufruf = (w: { art: string }): w is WennAufruf => w.art === 'aufruf';

/** Name eines Parameters: klein, wie ein Platzhalter (`{raum}`). */
export const PARAMETER_NAME = /^[a-z][a-z0-9_]*$/;
/** Namen, die schon Platzhalter sind – ein Parameter darf sie nicht überdecken. */
export const AUFRUF_RESERVIERT: readonly string[] = ['heute', 'automatisierung', 'zeitpunkt', 'titel', 'mappentyp', 'datum', 'tage', 'benutzer', 'vertreter', 'von', 'bis', 'zeitraum'];

/** Eingabe der Wenn-Karte bereinigen: gültige, nicht reservierte Namen ohne Doppelte, höchstens {@link AUFRUF_GRENZEN}.parameter. */
export function bereinigeAufruf(x: Record<string, unknown>): WennAufruf {
  const namen = (Array.isArray(x.parameter) ? x.parameter : [])
    .map((n) => (typeof n === 'string' ? n.trim().toLowerCase() : ''))
    .filter((n) => n.length <= AUFRUF_GRENZEN.name && PARAMETER_NAME.test(n) && !AUFRUF_RESERVIERT.includes(n));
  return { art: 'aufruf', parameter: [...new Set(namen)].slice(0, AUFRUF_GRENZEN.parameter) };
}

/**
 * Parameter eines Aufrufs (#679, Sicherheit): nur die Namen der Karte, nur Text (Zahlen und Wahrheitswerte als Text,
 * alles andere fällt weg), höchstens {@link AUFRUF_GRENZEN}.wert Zeichen ohne Steuerzeichen. Nie mehr als die Karte nennt.
 */
export function aufrufParameter(w: WennAufruf, roh: unknown): Record<string, string> {
  if (!roh || typeof roh !== 'object' || Array.isArray(roh)) return {};
  const o = roh as Record<string, unknown>;
  const erg: Record<string, string> = {};
  for (const n of w.parameter.slice(0, AUFRUF_GRENZEN.parameter)) {
    if (!Object.hasOwn(o, n)) continue;
    const v = o[n];
    if (typeof v !== 'string' && typeof v !== 'number' && typeof v !== 'boolean') continue;
    // eslint-disable-next-line no-control-regex -- Steuerzeichen bewusst entfernen (Text für Aufgaben und Verlauf)
    erg[n] = String(v).replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, AUFRUF_GRENZEN.wert);
  }
  return erg;
}

/** Platzhalter der Karte: Datum, Name, Zeitpunkt des Aufrufs und je Parameter einer. */
export function aufrufPlatzhalter(w: WennAufruf): Array<{ key: string; label: string }> {
  return [
    { key: 'heute', label: t('gemeinsam.automatisierung.datum-heute') }, { key: 'automatisierung', label: t('gemeinsam.automatisierung.name-dieser-automatisierung') },
    { key: 'zeitpunkt', label: t('gemeinsam.automatisierung.aufruf.zeitpunkt') },
    ...w.parameter.map((key) => ({ key, label: t('gemeinsam.automatisierung.aufruf.parameter', { name: key }) })),
  ];
}

/** Kurzform: „Aufruf von außen (raum, stufe)“. */
export function aufrufKurz(w: WennAufruf): string {
  return `${t('gemeinsam.automatisierung.aufruf.name')}${w.parameter.length ? ` (${w.parameter.join(', ')})` : ''}`;
}

/** Werkbank-Bereich, dessen Verwaltende die Parameter im Verlauf sehen (wie #677: nur wer den Bereich verwaltet). */
export const AUFRUF_BEREICH = 'automatisierungen';

/** Lauf-Daten eines Aufrufs für eine Person: Parameter nur, wer „Automatisierungen“ verwaltet (#679, wie `laufFuer`). */
export function aufrufLaufFuer(l: Lauf, darf: (bereich: string) => boolean): Lauf {
  if (l.art !== 'aufruf' || darf(AUFRUF_BEREICH) || !('parameter' in l.daten)) return l;
  return { ...l, daten: Object.fromEntries(Object.entries(l.daten).filter(([k]) => k !== 'parameter')) };
}
