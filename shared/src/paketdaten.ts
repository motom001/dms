/**
 * Einrichtung und Nachweise als Daten für Pakete (#1053, #1054).
 *
 * Ein Paket wie „Compliance“ liest den Stand der Einrichtung je Bereich und die Nachweise eines Monats als JSON – nur
 * über sein Dienstkonto, nur die Bereiche, die der Administrator in den Paket-Einstellungen angehakt hat, und nie
 * Passwörter oder andere Geheimnisse (#1055). Jeder Eintrag trägt eine feste Kennung je Änderungsart
 * (`zugang.zweifaktor`, `ablage.feld` …); darauf baut der Vergleich zweier Stände auf.
 *
 * Wer einen Bereich freigeben darf (Entscheidung Thomas 10.11.2026): nur, wer ihn selbst verwaltet. „Zugang und
 * Berechtigungen“ und alle Nachweise nur mit „Gesamte Verwaltung“. Wirksam ist immer die Schnittmenge aus den Haken
 * und den Verwaltungsrechten der Person, die zuletzt freigegeben hat – geprüft bei jedem Abruf.
 */
import { darfBereich, GESAMT, hatGesamt } from './verwaltungsrecht';
import { t } from './texte';

/** Die Bereiche, quer zu Einrichtung und Nachweisen. Reihenfolge wie in den Paket-Einstellungen. */
export const PAKETDATEN_BEREICHE = ['allgemein', 'belegeingang', 'ablage', 'zugang', 'betrieb', 'sicherung', 'unveraenderbarkeit', 'datenschutz', 'betriebspruefung'] as const;
export type PaketdatenBereich = (typeof PAKETDATEN_BEREICHE)[number];
export const istPaketdatenBereich = (x: unknown): x is PaketdatenBereich => typeof x === 'string' && (PAKETDATEN_BEREICHE as readonly string[]).includes(x);

/** Bereiche, zu denen es Nachweise gibt; die übrigen haben nur eine Einrichtung. */
export const NACHWEIS_BEREICHE: readonly PaketdatenBereich[] = ['belegeingang', 'zugang', 'betrieb', 'sicherung', 'unveraenderbarkeit', 'datenschutz'];

/**
 * Welche Verwaltungsrechte (Werkbank-Bereiche, #818) ein Bereich der Einrichtung braucht – alle davon. Bewusst eng:
 * Wer nur „Pakete“ verwaltet, gibt einem Paket keinen Einblick in Bereiche, die er selbst nicht sieht.
 */
export const EINRICHTUNG_VERWALTUNG: Readonly<Record<PaketdatenBereich, readonly string[]>> = {
  allgemein: ['organisation'],
  belegeingang: ['postfaecher', 'eingangsordner', 'texterkennung'],
  ablage: ['typen'],
  zugang: [GESAMT],
  betrieb: ['pakete', 'automatisierungen', 'wartung'],
  sicherung: ['sicherung'],
  unveraenderbarkeit: ['texterkennung'],
  datenschutz: ['loeschkonzept', 'papierkorb'],
  betriebspruefung: ['vollexport'],
};
/** Nachweise enthalten Benutzer und Fehlanmeldungen: immer „Gesamte Verwaltung“ (Ergänzung Sicherheit). */
export const NACHWEISE_VERWALTUNG: readonly string[] = [GESAMT];

export type PaketdatenArt = 'einrichtung' | 'nachweise';
type MitRecht = { verwaltung?: string[] | null; art?: string } | null | undefined;

/** Darf diese Person den Bereich freigeben – bzw. gilt eine Freigabe dieser Person noch? */
export function darfPaketdaten(b: MitRecht, art: PaketdatenArt, bereich: PaketdatenBereich): boolean {
  const noetig = art === 'nachweise' ? NACHWEISE_VERWALTUNG : EINRICHTUNG_VERWALTUNG[bereich];
  return noetig.every((p) => (p === GESAMT ? hatGesamt(b) : darfBereich(b, p)));
}
/** Braucht die Freigabe eine frische Anmeldung? Wie „Gesamte Verwaltung“: Zugang und Nachweise. */
export const brauchtFrisch = (art: PaketdatenArt, bereich: PaketdatenBereich): boolean => art === 'nachweise' || EINRICHTUNG_VERWALTUNG[bereich].includes(GESAMT);

export const bereichName = (b: PaketdatenBereich): string => t.frei(`gemeinsam.paketdaten.bereich.${b}`);

/** Ein Wert in Einrichtung und Nachweisen – flach, damit der Vergleich ohne Rauschen auskommt. */
export type PaketdatenWert = string | number | boolean | null | string[];

/**
 * Ein Eintrag der Einrichtung. `kennung`: Art der Angabe, fest (z. B. `ablage.feld`); `pfad`: eindeutig im Bereich
 * (z. B. `ablage.feld:rechnung/betrag`), danach vergleicht der Kern; `bezeichnung`: lesbar mit Beschriftungen.
 */
export interface EinrichtungEintrag { kennung: string; pfad: string; bezeichnung: string; wert: PaketdatenWert }
/** Stand eines Bereichs. Ohne Zeitstempel in den Einträgen, damit zwei Abrufe ohne Änderung gleich sind. */
export interface EinrichtungStand { format: 1; art: 'einrichtung'; bereich: PaketdatenBereich; version: string; eintraege: EinrichtungEintrag[] }

/** Eine Änderung zwischen zwei Ständen. `satz`: lesbar, z. B. „Zwei-Faktor Pflicht für Mitglieder: nein → ja“. */
export interface PaketdatenAenderung { kennung: string; pfad: string; bezeichnung: string; art: 'neu' | 'geaendert' | 'entfernt'; vorher: PaketdatenWert; nachher: PaketdatenWert; satz: string }

/** Ein Nachweis. `zeit` fehlt bei Aufstellungen zum Stichtag und bei Zählungen über den Monat. */
export interface NachweisEintrag { kennung: string; zeit?: string; daten: Record<string, PaketdatenWert> }
/** Nachweise eines Bereichs für einen Monat (`JJJJ-MM`). `stichtag`: Zeitpunkt der Aufstellungen (Abruf, höchstens Monatsende). */
export interface NachweiseStand { format: 1; art: 'nachweise'; bereich: PaketdatenBereich; monat: string; stichtag: string; eintraege: NachweisEintrag[]; /** Mehr Einträge, als ein Monat aufnimmt (gezählt, nicht einzeln). */ weitere?: number }

export const MONAT = /^\d{4}-(0[1-9]|1[0-2])$/;

/* ---------- Freigabe je Paket (#1054) ---------- */

/** Was der Administrator einem Paket freigegeben hat; `benutzer` = hinterlegte Person, in deren Namen das Paket liest. */
export interface PaketdatenFreigabe {
  einrichtung: PaketdatenBereich[]; nachweise: PaketdatenBereich[];
  benutzer: string | null; am: string | null;
  /** Letzte Änderungen der Auswahl (neueste zuerst), bis der Paket-Verlauf (#1003) sie aufnimmt. */
  verlauf: Array<{ am: string; von: string; einrichtung: PaketdatenBereich[]; nachweise: PaketdatenBereich[] }>;
}
export const LEERE_FREIGABE: PaketdatenFreigabe = { einrichtung: [], nachweise: [], benutzer: null, am: null, verlauf: [] };

/** Ansicht für die Paket-Seite: je Bereich, was das Paket anfragt, ob angehakt, ob wirksam und ob ich ihn ändern darf. */
export interface PaketdatenAnsicht {
  bereiche: Array<{ art: PaketdatenArt; bereich: PaketdatenBereich; name: string; angehakt: boolean; wirksam: boolean; darf: boolean; frisch: boolean }>;
  /** Name bzw. Adresse der hinterlegten Person; null, wenn noch nichts freigegeben ist. */
  benutzer: string | null;
  am: string | null;
  verlauf: PaketdatenFreigabe['verlauf'];
}
