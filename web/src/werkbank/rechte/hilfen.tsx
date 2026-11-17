import type { ReactNode } from 'react';
import { Symbol } from '../../Symbol';
import { merkmalName } from '../../../../shared/src/merkmale';
import type { RegelBedingung, Wirkung } from '../../../../shared/src/rechte';
import { t } from '../../sprache';

/**
 * Berechtigungen (#123–#127, #137, #142): je Mappentyp eine Grundeinstellung und Regeln
 * „wenn … dann erteile/entziehe CRUDP“, in Reihenfolge, mit Stopp. Für Administratoren gelten sie nicht.
 *
 * Gepflegt im Mappentyp-Editor (Abschnitt „Berechtigungen“), gespeichert mit „Mappentyp speichern“.
 * Getestet am Mappentyp selbst (Testlauf mit dem Entwurf, #146); „Was sieht ein Benutzer?“ in der Benutzerverwaltung.
 */

export const neueId = () => Math.random().toString(36).slice(2, 10);
export const WIRKUNG_TEXT: Record<'' | Wirkung, ReactNode> = {
  '': '–',
  erteilen: <Symbol name="haken" />,
  entziehen: <Symbol name="schliessen" />,
};
export const NAECHSTE: Record<'' | Wirkung, '' | Wirkung> = { '': 'erteilen', erteilen: 'entziehen', entziehen: '' };

export type Art = RegelBedingung['art'];
export const ARTEN: Array<{ art: Art; name: string; nurBenutzerTyp?: boolean }> = [
  { art: 'rolle', name: t('werkbank.berechtigungen.benutzer-hat-rolle') },
  { art: 'benutzer', name: t('werkbank.berechtigungen.benutzer-ist') },
  { art: 'feld', name: t('werkbank.berechtigungen.feld-der-mappe') },
  { art: 'aufgabe', name: t('werkbank.berechtigungen.offene-aufgabe-fuer-den') },
  { art: 'eigeneMappe', name: t('werkbank.berechtigungen.mappe-ist-die-des'), nurBenutzerTyp: true },
  // Merkmal der Ablage (#1032): gilt für alle Mappen gleich.
  { art: 'merkmal', name: merkmalName('beruflich') },
];
