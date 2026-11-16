/** Hilfen für die OpenAPI-Schemas (#1278, vorher in `http/api-v1.ts`): Verweise, Listen, UUID, Zeit, Beschriftungen, Feldarten. */
import { FELDTYPEN, type Feldtyp, feldtypName } from '../../../../shared/src/model';
import { inSprache } from '../../../../shared/src/sprache';

/* ---------- OpenAPI ---------- */

export const ref = (n: string) => ({ $ref: `#/components/schemas/${n}` });
export const liste = (n: string) => ({ type: 'array', items: ref(n) });
export const uuid = { type: 'string', format: 'uuid' };
/**
 * Beschriftungen je Sprache (#728): Sprache (z. B. „en“) → Texte. Fehlt eine Angabe, gilt der Ausgangstext (Deutsch).
 * Ohne die Eigenschaft bleiben beim Speichern die bisherigen Beschriftungen; null oder {} entfernt sie.
 */
export const beschriftungen = (teile: Record<string, unknown>) => ({
  type: 'object',
  nullable: true,
  description:
    'Beschriftungen je Sprache (#728): Sprache → Texte; fehlt etwas, gilt der Ausgangstext. Ohne die Angabe bleiben die bisherigen; null entfernt sie.',
  additionalProperties: { type: 'object', properties: teile },
});
export const zeit = { type: 'string', format: 'date-time' };
export const weitereRollen = {
  type: 'array',
  items: uuid,
  description: 'Weitere (fachliche) Rollen: Ids von Rollen-Mappen, ohne die Systemrolle Mitglied',
};

/** Feldarten (#1094): feste Kennung, dazu die Namen der Oberfläche auf Deutsch und Englisch aus den Sprachdateien. */
export const FELDART_BESCHREIBUNG = `Feldart als feste Kennung, in jeder Sprache gleich. Namen in der Oberfläche (de / en): ${(
  Object.keys(FELDTYPEN) as Feldtyp[]
)
  .map((k) => `${k} = ${inSprache('de', () => feldtypName(k))} / ${inSprache('en', () => feldtypName(k))}`)
  .join('; ')}.`;
