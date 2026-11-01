/**
 * Anrede in Unterlagen für Dritte (#474): du oder Sie – nur für Texte, die an Personen außerhalb des DMS
 * gehen. Die Oberfläche bleibt immer beim „du“ (förmlich erst als eigene Sprachfassung mit #357).
 *
 * Alle Texte stehen gebündelt im Bereich `dritte` der Sprachdateien (#473), je Anrede unter demselben
 * Schlüssel, Platzhalter als {name}: `du` in „de“, `sie` in „de-formal“ (#357: „Deutsch“ und „Deutsch
 * (förmlich)“). Neue Texte für Dritte kommen dorthin, nicht als Bedingung in den Code (Liste der
 * Ausgaben im Entwicklerhandbuch, „Aufbau → Unterlagen für Dritte“).
 */
import du from './sprachen/de/dritte.json';
import sie from './sprachen/de-formal/dritte.json';
import { uebersetzer, type OhneMehrzahl, type Sprachdatei, type Werte } from './sprache';

export type Anrede = 'du' | 'sie';
export const ANREDEN: readonly Anrede[] = ['du', 'sie'];
export const ANREDE_STANDARD: Anrede = 'du';
export const ANREDE_NAME: Record<Anrede, string> = { du: 'du', sie: 'Sie' };

/** Gespeicherten Wert lesen; alles Unbekannte ist die Vorgabe „du“. */
export const liesAnrede = (v: unknown): Anrede => (v === 'sie' ? 'sie' : ANREDE_STANDARD);

/* Die Texte selbst stehen seit #473 in den Sprachdateien: `sprachen/de/dritte.json` (du) und
   `sprachen/de-formal/dritte.json` (Sie) – dieselben Schlüssel, dieselben Platzhalter (prüft die CI). */
export type TextDritte = OhneMehrzahl<keyof typeof du & string>;

/** Alle Texte für Dritte je Anrede, roh (Schlüssel mit Mehrzahl-Endung). */
export const TEXTE_DRITTE: Record<Anrede, Sprachdatei> = { du, sie };
const T = { du: uebersetzer({ dritte: TEXTE_DRITTE.du }), sie: uebersetzer({ dritte: TEXTE_DRITTE.sie }) };

/**
 * Text für Dritte in der gewählten Anrede; {platzhalter} werden ersetzt (unbekannte bleiben stehen),
 * `werte.anzahl` wählt bei Schlüsseln mit `_one`/`_other` die Mehrzahlform (#473).
 */
export function textDritte(anrede: Anrede, schluessel: TextDritte, werte: Werte = {}): string {
  return T[anrede].frei(`dritte.${schluessel}`, werte);
}

/** Vorschau in der Werkbank: derselbe Satz in beiden Formen. */
export const ANREDE_BEISPIEL: TextDritte = 'abruf.einleitung';
