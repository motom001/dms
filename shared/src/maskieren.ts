/** Kleine Maskierungen für Text, der in fremde Formate eingesetzt wird (#250, CodeQL-Funde). */

/** Markdown-Tabellenzelle: Backslash und senkrechten Strich maskieren, Zeilenumbrüche entfernen. */
export const markdownZelle = (s: string) => s.replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/[\r\n]+/g, ' ');

/** Eigenes CSS: „<“ als CSS-Escape, damit es den Style-Block in keinem Fall verlassen kann. */
export const cssOhneSpitzeKlammer = (css: string) => css.replace(/</g, '\\3C ');
