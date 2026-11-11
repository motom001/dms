/**
 * Post: „von“ und „an“ (#1042). Die Systemfelder der Post heißen wie in Verträgen und Rechnungen (dms-registry #157,
 * „Gleiche Kennungen“): `von` (bis 0.240 `absender`, „Absender“) und `an` (bis 0.240 `fuer`, „Für“). Das frühere
 * Textfeld `an` („Empfänger“, die Adressen einer versendeten E-Mail) heißt `an_adresse`. Die Datenbank zieht Migration
 * 099 um.
 *
 * Übergang bis 1.0.0 (server/src/uebergaenge.ts): Die Schnittstelle v1 nimmt `absender` und `fuer` weiter an und liefert
 * sie an der Post zusätzlich mit; Platzhalter `{absender}` und `{fuer}` gelten als `{von}` und `{an}`. Das frühere `an`
 * (Adresse) lässt sich so nicht weiterführen – unter `an` steht jetzt der Verweis.
 */
import type { Werte } from './model';

/** Systemfelder der Post, alte Kennung → neue (#1042). Nur diese beiden gelten im Übergang als Alias. */
export const POST_ALTE_KENNUNGEN = { absender: 'von', fuer: 'an' } as const;
export type AltePostKennung = keyof typeof POST_ALTE_KENNUNGEN;
const ALT = Object.keys(POST_ALTE_KENNUNGEN) as AltePostKennung[];
const istAlt = (k: string): k is AltePostKennung => (ALT as string[]).includes(k);

/** Neue Kennung zu einer alten (`absender` → `von`, `fuer` → `an`); jede andere bleibt. */
export const postKennung = (k: string): string => (istAlt(k) ? POST_ALTE_KENNUNGEN[k] : k);

/**
 * Eingabe an der Post (Schnittstelle, Pakete, Formular älterer Clients): alte Namen auf die neuen umsetzen. Steht der neue
 * Name schon da, gilt er; der alte fällt dann weg. Andere Schlüssel bleiben, wie sie sind.
 */
export function postWerteNeu<T extends Record<string, unknown>>(w: T): T {
  if (!w || typeof w !== 'object' || Array.isArray(w) || !ALT.some((k) => k in w)) return w;
  const aus: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(w)) {
    if (istAlt(k)) { if (!(POST_ALTE_KENNUNGEN[k] in w)) aus[POST_ALTE_KENNUNGEN[k]] = v; } else aus[k] = v;
  }
  return aus as T;
}

/** Ausgabe der Schnittstelle v1 an der Post: zusätzlich die alten Namen mit denselben Werten (Übergang bis 1.0.0). */
export function postWerteMitAlten(w: Werte): Werte {
  if (!w || typeof w !== 'object') return w;
  const aus: Werte = { ...w };
  for (const k of ALT) if (POST_ALTE_KENNUNGEN[k] in w && !(k in w)) aus[k] = w[POST_ALTE_KENNUNGEN[k]];
  return aus;
}

/** Platzhalter `{absender…}` und `{fuer…}` in einem Text als `{von…}` und `{an…}` (Titel-Vorlage, Automatisierungen). */
export const postVorlageNeu = (text: string): string => text.replace(/\{(absender|fuer)(?=[|}])/g, (_, k: AltePostKennung) => `{${POST_ALTE_KENNUNGEN[k]}`);
