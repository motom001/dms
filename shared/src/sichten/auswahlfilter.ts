/** Sichten (#1278 aus sichten.ts): Auswahlfilter am Referenzfeld (#172). */
import { type Feldbedingung, type Operator, OPERATOREN } from './bedingungen';
import { bereinigeBedingungen } from './bereinigen';
import { type Mappentyp, type Feld, istLeer } from '../model';
import { bedingungsfelder, bedingungsProblem } from './felder';
import { gleicheZiele } from '../verweisziele';
import { t } from '../texte';
import { type Aufloesung, type Klausel, filterFuer } from './aufloesen';

/* ---------- Auswahlfilter am Referenzfeld (#172) ---------- */

export function bereinigeAuswahlfilter(e: unknown): Feldbedingung[] {
  return bereinigeBedingungen(e)
    .filter((b): b is Feldbedingung => b.art === 'feld')
    .slice(0, 20);
}

const alsZiel = (ziel: Pick<Mappentyp, 'felder'>) => ({ id: '', register: [], ...ziel }) as unknown as Mappentyp;

/** Operatoren, die einen Wert aus der eigenen Mappe nehmen können (#173). */
export const OPS_EIGENES_FELD: Operator[] = ['gleich', 'enthaelt', 'kleiner', 'groesser', 'einerVon', 'zeigtAuf'];
const TEXTARTEN = ['text', 'langtext', 'formatiert'];

/** Felder der eigenen Mappe, deren Wert zu dieser Bedingung passt (#173). */
export function passendeEigeneFelder(
  b: Pick<Feldbedingung, 'feld' | 'op'>,
  zielFelder: Feld[],
  eigene: Array<Pick<Feld, 'key' | 'label' | 'typ' | 'optionen' | 'zielTypen' | 'mehrfach'>>,
  feldKey: string,
) {
  const ziel = bedingungsfelder([{ felder: zielFelder }]).find((x) => x.key === b.feld);
  if (!ziel || !OPS_EIGENES_FELD.includes(b.op)) return [];
  return eigene.filter((e) => {
    if (e.key === feldKey) return false; // kein Kreis über das eigene Referenzfeld
    switch (b.op) {
      case 'gleich':
        return (
          !e.mehrfach &&
          (TEXTARTEN.includes(ziel.art)
            ? e.typ === 'text'
            : ziel.art === 'zeit'
              ? e.typ === 'datum'
              : e.typ === ziel.art && ['zahl', 'datum', 'text'].includes(e.typ))
        );
      case 'enthaelt':
        return TEXTARTEN.includes(ziel.art) && e.typ === 'text';
      case 'kleiner':
      case 'groesser':
        return ziel.art === 'zahl' || ziel.art === 'betrag'
          ? e.typ === 'zahl'
          : (ziel.art === 'datum' || ziel.art === 'zeit') && e.typ === 'datum';
      case 'einerVon':
        return ziel.art === 'auswahl' && e.typ === 'auswahl' && (e.optionen ?? []).every((o) => (ziel.feld?.optionen ?? []).includes(o));
      case 'zeigtAuf':
        return ziel.art === 'referenz' && e.typ === 'referenz' && !!e.zielTypen?.length && !!ziel.feld && gleicheZiele(e, ziel.feld);
      default:
        return false;
    }
  });
}

/**
 * Probleme des Filters gegen den (aktuellen) Zieltyp, z. B. entfernte Felder. Mit `eigene` werden
 * Werte aus der eigenen Mappe (#173) geprüft: das Feld muss es geben und es muss zum Vergleich passen.
 */
export function auswahlProbleme(
  bed: Feldbedingung[],
  ziel: Pick<Mappentyp, 'felder'>,
  eigene?: { felder: Feld[]; feldKey: string },
): string[] {
  const erg: string[] = [];
  for (const b of bed) {
    if (b.wert?.art === 'eigenesFeld') {
      const name = b.wert.feld;
      // Für die allgemeine Prüfung wie ein fester Wert behandeln.
      const p = bedingungsProblem({ ...b, wert: { art: 'fest', wert: b.op === 'einerVon' || b.op === 'zeigtAuf' ? [] : '' } }, [
        alsZiel(ziel),
      ]);
      if (p) {
        erg.push(p);
        continue;
      }
      if (!OPS_EIGENES_FELD.includes(b.op)) {
        erg.push(t('gemeinsam.sichten.geht-nicht-mit-einem', { OPERATOREN: OPERATOREN[b.op] }));
        continue;
      }
      if (!eigene) continue;
      if (name === eigene.feldKey) {
        erg.push(t('gemeinsam.sichten.der-filter-darf-nicht'));
        continue;
      }
      const f = eigene.felder.find((x) => x.key === name);
      if (!f) {
        erg.push(t('gemeinsam.sichten.das-feld-dieser-mappe', { name }));
        continue;
      }
      if (!passendeEigeneFelder(b, ziel.felder, eigene.felder, eigene.feldKey).some((x) => x.key === name))
        erg.push(
          t('gemeinsam.sichten.passt-nicht-zum-vergleich', {
            label: f.label,
            wert: ziel.felder.find((x) => x.key === b.feld)?.label ?? b.feld,
          }),
        );
      continue;
    }
    const p = bedingungsProblem(b, [alsZiel(ziel)]);
    if (p) erg.push(p);
  }
  return erg;
}

/**
 * Werte aus der eigenen Mappe einsetzen (#173). Ist der eigene Wert leer, gilt die Bedingung als
 * nicht gesetzt – dann werden alle angeboten, die die übrigen Bedingungen erfüllen.
 */
export function setzeEigeneWerte(bed: Feldbedingung[], werte: Record<string, unknown>): Feldbedingung[] {
  return bed.flatMap((b) => {
    if (b.wert?.art !== 'eigenesFeld') return [b];
    const v = werte[b.wert.feld];
    if (istLeer(v as never)) return [];
    const wert = Array.isArray(v) ? v.map(String) : typeof v === 'number' ? v : String(v);
    return [{ ...b, wert: { art: 'fest', wert } }];
  });
}

/** Hängt der Filter von Feldern der eigenen Mappe ab? Welche? */
export const eigeneFelderIm = (bed: Feldbedingung[] | undefined) => [
  ...new Set((bed ?? []).flatMap((b) => (b.wert?.art === 'eigenesFeld' ? [b.wert.feld] : []))),
];

/**
 * Klausel für „passende Mappen der Zieltypen“; Bedingungen mit Problem zählen nicht. Bei mehreren Zieltypen (#1036)
 * gelten die Bedingungen über die Felder, die alle haben (wie in Ansichten über mehrere Typen).
 */
export function auswahlKlausel(bed: Feldbedingung[], ziele: Mappentyp[], a: Aufloesung): Klausel {
  return { typen: ziele.map((z) => z.id), filter: filterFuer({ bedingungen: bed }, ziele, a) };
}

/** Was sich eindeutig aus dem Filter ergibt (z. B. Art = Arzt) – zum Vorbelegen beim Anlegen. */
export function vorbelegungAus(bed: Feldbedingung[], ziel: Pick<Mappentyp, 'felder'>): Record<string, string | string[] | boolean> {
  const v: Record<string, string | string[] | boolean> = {};
  for (const b of bed) {
    const f = ziel.felder.find((x) => x.key === b.feld);
    if (!f || bedingungsProblem(b, [alsZiel(ziel)])) continue;
    const w = b.wert?.art === 'fest' ? b.wert.wert : undefined;
    if (b.op === 'ja' || b.op === 'nein') v[f.key] = b.op === 'ja';
    else if (b.op === 'gleich' && (typeof w === 'string' || typeof w === 'number') && String(w) !== '') v[f.key] = String(w);
    else if ((b.op === 'einerVon' || b.op === 'zeigtAuf') && Array.isArray(w) && w.length === 1)
      v[f.key] = f.mehrfach ? [String(w[0])] : String(w[0]);
  }
  return v;
}
