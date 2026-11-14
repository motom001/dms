import s from './Begleiter.module.css';

/**
 * Figur des Assistenten (#1219, Entwurf Ansicht 5, Variante A): eine Mappe mit Gesicht – eigene Zeichnung, keine
 * Büroklammer und keine andere fremde Figur. Die Mappe ist das, womit man in Ablago am meisten arbeitet.
 *
 * Bewegt sich nur, wenn man mit der Maus darüberfährt oder der Knopf den Tastaturfokus hat: Die Lasche klappt wie ein
 * Ohr kurz nach hinten, das rechte Auge zwinkert (CSS in Begleiter.module.css). Nie von selbst, keine Schleife, kein
 * Ton; bei „Bewegung reduzieren“ gar nicht. Farben aus den Tokens: Mappe in der Akzentfarbe, Gesicht in der Fläche.
 */
export function Figur() {
  return (
    <svg className={s.figur} width="34" height="34" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path className={s.lasche} d="M3 8.2V7.4a1.9 1.9 0 0 1 1.9-1.9h4.3l2 2.2v.5z" />
      <path className={s.mappe} d="M3 9.6a2 2 0 0 1 2-2H19a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <circle className={s.auge} cx="9.6" cy="13" r="1.25" />
      <circle className={`${s.auge} ${s.zwinker}`} cx="14.4" cy="13" r="1.25" />
      <path className={s.mund} d="M10 16.2q2 1.6 4 0" />
    </svg>
  );
}
