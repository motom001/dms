/**
 * Typprüfung des Bausteins Knopf (#1210, Akzeptanzkriterium „ohne Rückfrage nicht verwendbar“): Diese Datei wird nie
 * geladen; `tsc` prüft sie mit. Steht ein `@ts-expect-error` über einer Zeile, die die Typprüfung zulässt, scheitert
 * `npm run typecheck` – so fällt auf, wenn die Art Gefahr je ohne Symbol oder Rückfrage ginge.
 */
import type { KnopfLinkProps, KnopfProps, knopfAussehen } from './Knopf';

const frage = { titel: 'Notiz löschen?', ja: 'Löschen' };

export const richtig: KnopfProps[] = [
  { art: 'gefahr', symbol: 'geloescht', rueckfrage: frage, children: 'Löschen' },
  { art: 'haupt', children: 'Speichern' },
  { children: 'Abbrechen' },
];

export const falsch: KnopfProps[] = [
  // @ts-expect-error -- Gefahr ohne Rückfrage
  { art: 'gefahr', symbol: 'geloescht', children: 'Löschen' },
  // @ts-expect-error -- Gefahr ohne Symbol
  { art: 'gefahr', rueckfrage: frage, children: 'Löschen' },
  // @ts-expect-error -- Rückfrage nur an Gefahr
  { art: 'neben', rueckfrage: frage, children: 'Weiter' },
];

// @ts-expect-error -- Ein Weg ist nie gefährlich
export const link: KnopfLinkProps = { to: '/x', art: 'gefahr', children: 'x' };
// @ts-expect-error -- Gefahr-Aussehen gibt es nur am Knopf selbst (mit Rückfrage)
export const aussehen: Parameters<typeof knopfAussehen>[0] = { art: 'gefahr' };
