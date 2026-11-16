import { TREFFER_ANFANG, TREFFER_ENDE } from '../../../shared/src/model';

/** Fundstelle in einem Text: ein Ausschnitt um den ersten Treffer, markiert (#55). */
export function ausschnittAus(text: string, suche: string): string | null {
  const i = text.toLowerCase().indexOf(suche.toLowerCase());
  if (i < 0) return null;
  const vor = text.slice(Math.max(0, i - 50), i);
  return `${i > 50 ? '… ' : ''}${vor}${TREFFER_ANFANG}${text.slice(i, i + suche.length)}${TREFFER_ENDE}${text.slice(i + suche.length, i + suche.length + 60)}${i + suche.length + 60 < text.length ? ' …' : ''}`.replace(
    /\s+/g,
    ' ',
  );
}
