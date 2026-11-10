/**
 * Merkmale der Ablage (#1032): Eigenschaften, die für die ganze Ablage gelten – bewusst nur eines, „beruflich genutzt“.
 * Alles Weitere ergibt sich aus Feldwerten oder installierten Paketen.
 *
 * Gespeichert in der Einstellung `merkmale` (`{ beruflich: true }`), Vorgabe nein. Gesetzt vom Einrichtungsassistenten
 * (#1045) oder aus der Einrichtungsdatei (#806), änderbar in Werkbank → Nutzung (nur „Gesamte Verwaltung“). Nutzbar in
 * Anzeige-Bedingungen an Feldern und Abschnitten (#1033) und in den Bedingungen von Rechten, Ansichten und
 * Automatisierungen. Server und Oberfläche teilen diese Datei.
 */
import { t } from './texte';

/** Die Merkmale, die es gibt. Neue nur nach Absprache – das Issue will ausdrücklich nur dieses eine. */
export const MERKMALE = ['beruflich'] as const;
export type Merkmal = (typeof MERKMALE)[number];
export type Merkmale = Record<Merkmal, boolean>;

/** Name der Einstellung in der Datenbank. */
export const MERKMALE_EINSTELLUNG = 'merkmale';

/** Ohne Einstellung: privat (#1032, Vorgabe nein). */
export const KEINE_MERKMALE: Merkmale = { beruflich: false };

export const istMerkmal = (v: unknown): v is Merkmal => typeof v === 'string' && (MERKMALE as readonly string[]).includes(v);

/** Gespeicherten Wert oder Eingabe lesen; Unbekanntes fällt weg, Fehlendes gilt als nein. */
export function liesMerkmale(v: unknown): Merkmale {
  const o = v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
  return Object.fromEntries(MERKMALE.map((m) => [m, o[m] === true])) as Merkmale;
}

/** Name des Merkmals in Bedingungen, z. B. „Ablage wird beruflich genutzt“. */
export const merkmalName = (m: Merkmal): string => (m === 'beruflich' ? t('gemeinsam.merkmale.beruflich') : m);

/** Bedingung als Satz: „Ablage wird beruflich genutzt“ bzw. „Ablage wird nicht beruflich genutzt“. */
export const merkmalText = (m: Merkmal, nicht?: boolean) => (nicht ? t('gemeinsam.merkmale.beruflich-nicht') : merkmalName(m));
