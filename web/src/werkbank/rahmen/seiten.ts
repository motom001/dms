import { ablageSeiten } from './inhalt-ablage';
import { benutzerSeiten, listenSeiten, pflegeSeiten, vorlagenSeiten, type Seite, type Seitenkennung } from './inhalt';
import { einstellungenSeiten, postUndWartungSeiten, systemSeiten } from './inhalt-betrieb';

/**
 * Welche Seite zu welchem Bereich gehört (#1281): eine Tabelle Kennung → Seite, die Kennungen aus der Liste der
 * Werkbank-Seiten (shared/src/werkbankansicht.ts) und die Übersicht. Fehlt eine Seite der Liste oder steht hier eine
 * Kennung, die die Liste nicht kennt, meldet es tsc; der Test werkbank-liste.test.ts prüft es zusätzlich.
 */
export const SEITEN: Readonly<Record<Seitenkennung, Seite>> = {
  ...ablageSeiten,
  ...pflegeSeiten,
  ...listenSeiten,
  ...benutzerSeiten,
  ...vorlagenSeiten,
  ...einstellungenSeiten,
  ...postUndWartungSeiten,
  ...systemSeiten,
};

/** Seite eines Bereichs; `undefined` für Unbekanntes (auch Namen wie „constructor“) und für „Werkbank anpassen“. */
export const seiteVon = (bereich: string): Seite | undefined =>
  Object.hasOwn(SEITEN, bereich) ? SEITEN[bereich as Seitenkennung] : undefined;
