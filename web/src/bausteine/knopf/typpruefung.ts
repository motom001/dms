/**
 * Typprüfung des Bausteins Knopf (#1210, Akzeptanzkriterium „ohne Rückfrage nicht verwendbar“): Diese Datei wird nie
 * geladen; `tsc` prüft sie mit. Steht ein `@ts-expect-error` über einer Zeile, die die Typprüfung zulässt, scheitert
 * `npm run typecheck` – so fällt auf, wenn die Art Gefahr je ohne Symbol oder Rückfrage ginge oder eine Handlung wie
 * ein Link aussehen könnte (#1277).
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
  // @ts-expect-error -- Eine Handlung sieht nie aus wie ein Link (#1277): Art „link“ gibt es nur an KnopfLink
  { art: 'link', onClick: () => undefined, children: 'Auswahl aufheben' },
];

// @ts-expect-error -- Ein Weg ist nie gefährlich
export const link: KnopfLinkProps = { to: '/x', art: 'gefahr', children: 'x' };

export const wege: KnopfLinkProps[] = [
  { to: '/ablage', art: 'link', children: 'Zur Liste' },
  { href: '/api/x?format=pdf', download: true, children: 'Als PDF herunterladen' },
  { href: 'https://example.org', neuesFenster: true, art: 'link', children: 'example.org' },
];

// @ts-expect-error -- Ein Weg innerhalb von Ablago hat kein onClick: Was etwas tut, ist ein Knopf (#1277)
export const wegMitHandlung: KnopfLinkProps = { to: '/x', art: 'link', onClick: () => undefined, children: 'x' };
// @ts-expect-error -- to oder href, nicht beides
export const zweiZiele: KnopfLinkProps = { to: '/x', href: '/y', children: 'x' };
// @ts-expect-error -- Sonderform gibt es nur am Knopf
export const eigenerWeg: KnopfLinkProps = { to: '/x', art: 'eigen', children: 'x' };
// @ts-expect-error -- Gefahr-Aussehen gibt es nur am Knopf selbst (mit Rückfrage)
export const aussehen: Parameters<typeof knopfAussehen>[0] = { art: 'gefahr' };
