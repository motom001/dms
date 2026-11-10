/**
 * Tokens aus tokens.css lesen (#966): Hell und dunkel stehen nur dort. Designs (design.ts) bauen ihre Paletten
 * daraus, Tests prüfen damit Kontraste. Ohne Abhängigkeiten, damit auch die Tests im Server es laden können.
 */
export type Palette = Record<string, string>;

/** Variablen eines CSS-Blocks ohne Kommentare („--name: wert;“) als Palette ohne „--“. */
export function variablen(block: string): Palette {
  const p: Palette = {};
  for (const m of block.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) p[m[1]] = m[2].trim();
  return p;
}

/** Erster Block = hell, Block unter prefers-color-scheme: dark = dunkel (ergänzt um die hellen Werte, die gleich bleiben). */
export function tokenPaletten(roh: string): { hell: Palette; dunkel: Palette } {
  const css = roh.replace(/\/\*[\s\S]*?\*\//g, '');
  const i = css.indexOf('@media (prefers-color-scheme: dark)');
  if (i < 0) throw new Error('tokens.css: Block für den Dunkelmodus fehlt');
  const hell = variablen(css.slice(0, i));
  return { hell, dunkel: { ...hell, ...variablen(css.slice(i)) } };
}
