/**
 * Aufgabentext in der Historie (#1293): Die Historie einer Mappe sieht jede Person, die die Mappe lesen darf. Der Text
 * einer Erwähnungsaufgabe ist aber für den Empfänger aufbereitet – mit Titeln, die nur er sehen darf (Auszug, Favorit).
 * In die Historie kommt darum für Erwähnungen nur ein neutraler Text, nie der Text der Aufgabe.
 */
import { t } from '../sprache/sprache';
import type { Aufgabe } from '../../../shared/src/model';

export function historienAufgabentext(a: Pick<Aufgabe, 'art' | 'text'>, neutral?: string): string {
  return a.art === 'erwaehnung' ? (neutral ?? t('meldungen.dienst.erwaehnung-historie')) : a.text;
}
