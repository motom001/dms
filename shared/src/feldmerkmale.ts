/**
 * Merkmal und Schreibschutz an einem Feld (#995) – eigene Datei ohne Abhängigkeiten, damit model.ts sie ohne Kreis
 * nennen kann. Was sie bedeuten, steht in organisation.ts.
 */

/** Merkmale an einem Ja/Nein-Feld – bewusst nur eines (Paketformat `merkmal`). */
export const FELDMERKMALE = ['eigeneOrganisation'] as const;
export type Feldmerkmal = (typeof FELDMERKMALE)[number];
export const istFeldmerkmal = (v: unknown): v is Feldmerkmal => typeof v === 'string' && (FELDMERKMALE as readonly string[]).includes(v);

/** Schreibschutz am Feld (Paketformat `schreibschutz`): nur mit Verwaltungsrecht bzw. freigegebener Rolle änderbar. */
export const SCHREIBSCHUTZ = ['verwaltung'] as const;
export type Schreibschutz = (typeof SCHREIBSCHUTZ)[number];
export const istSchreibschutz = (v: unknown): v is Schreibschutz => typeof v === 'string' && (SCHREIBSCHUTZ as readonly string[]).includes(v);
