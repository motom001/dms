/**
 * Reihenfolge der Auswahl an einem Verweisfeld (#1671): In welcher Reihenfolge die Mappen in der Auswahl stehen – im
 * Formular, in „Neue Post“ und überall, wo das Verweisfeld ausgefüllt wird. Einstellbar am Verweisfeld
 * (`Feld.auswahlReihenfolge`): ein Feld des Zieltyps (z. B. „Jahr“, dann Steuerjahr absteigend) oder Titel, Angelegt,
 * Zuletzt geändert. Ohne Einstellung: Titel aufsteigend in natürlicher Reihenfolge („Steuerjahr 9“ vor „Steuerjahr 10“).
 * Reine Funktionen für Server, Oberfläche und Tests; Texte über `t()`.
 */
import { type AuswahlReihenfolge, type Feld, type Sortierung, sortierbar } from './model/basis';
import { einzigesZiel } from './verweisziele';
import { t } from './texte';
import { SCHLUESSEL } from './kennungen';

/** Systemspalten, nach denen die Auswahl auch bei mehreren Zieltypen sortieren kann. */
const REIHENFOLGE_SYSTEM = ['_titel', '_erstellt', '_geaendert'] as const;

/**
 * Sortierschlüssel „Titel in natürlicher Reihenfolge“ für die Seite (`/api/mappen?sortierung=…`): wie `_titel`, aber
 * Ziffernfolgen als Zahlen. Keine Spalte der Trefferliste – nur für die Auswahl.
 */
export const TITEL_NATUERLICH = '_titelNatuerlich';

/** Eingabe (Editor, Paket, Schnittstelle) bereinigen; ungültig = keine Angabe. */
export function bereinigeAuswahlReihenfolge(e: unknown): AuswahlReihenfolge | undefined {
  if (!e || typeof e !== 'object' || Array.isArray(e)) return undefined;
  const x = e as Record<string, unknown>;
  const feld = typeof x.feld === 'string' ? x.feld.trim() : '';
  if (!(REIHENFOLGE_SYSTEM as readonly string[]).includes(feld) && !SCHLUESSEL.test(feld)) return undefined;
  return { feld, ...(x.absteigend === true ? { absteigend: true } : {}) };
}

/** Felder des Zieltyps, nach denen die Auswahl sortieren kann (wie die Trefferliste: keine Verweise, Langtexte …). */
export const moeglicheReihenfolgefelder = (zielFelder: readonly Feld[]): Feld[] =>
  zielFelder.filter((x) => sortierbar(x.key, { felder: [...zielFelder] }) && !x.ausgeblendet);

/**
 * Prüfung im Mappentyp: nur an Verweisfeldern; Felder des Zieltyps nur bei genau einem Zieltyp, und es gibt sie dort
 * und man kann nach ihnen sortieren. Kennt `felderVon` den Zieltyp (noch) nicht – etwa beim Einspielen eines Pakets –,
 * bleibt es dabei.
 */
export function auswahlReihenfolgeProbleme(f: Feld, felderVon: (typId: string) => Feld[] | undefined): string[] {
  const r = f.auswahlReihenfolge;
  if (!r) return [];
  if (f.typ !== 'referenz') return [t('gemeinsam.reihenfolge.nur-verweis')];
  if ((REIHENFOLGE_SYSTEM as readonly string[]).includes(r.feld)) return [];
  const z = einzigesZiel(f);
  if (!z) return [t('gemeinsam.reihenfolge.ein-ziel', { feld: r.feld })];
  const ziel = felderVon(z);
  if (!ziel) return [];
  return moeglicheReihenfolgefelder(ziel).some((x) => x.key === r.feld) ? [] : [t('gemeinsam.reihenfolge.feld', { feld: r.feld })];
}

/** Sortierung der Seite für die Auswahl: die Einstellung des Felds, `_titel` und ohne Einstellung natürlich. */
export function auswahlSortierung(r: AuswahlReihenfolge | undefined): Sortierung {
  if (!r || r.feld === '_titel') return { spalte: TITEL_NATUERLICH, absteigend: !!r?.absteigend };
  return { spalte: r.feld, absteigend: !!r.absteigend };
}

/** Schlüssel für die natürliche Reihenfolge: Ziffernfolgen auf 30 Stellen mit Nullen (wie im PostgreSQL-Repo). */
export const natuerlicherSchluessel = (titel: string): string => titel.toLowerCase().replace(/\d+/g, (z) => z.padStart(30, '0'));
