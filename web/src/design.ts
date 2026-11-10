/**
 * Designs (#21): aus Grundlage, Primär- und Sekundärfarbe die Farbwerte der
 * Oberfläche ableiten und anwenden. Die Abstufungen (zarte Hintergründe,
 * lesbare Schrift auf der Farbe, für dunkle Grundlagen aufgehellte Töne)
 * entstehen hier, damit jede Farbe auf jeder Grundlage lesbar bleibt.
 */
import { cssOhneSpitzeKlammer } from '../../shared/src/maskieren';
import { t } from './sprache';
import tokensCss from './tokens.css?raw';
import { tokenPaletten, type Palette } from './tokens';
export type Grundlage = 'automatisch' | 'hell' | 'dunkel' | 'kontrast';
export interface Design {
  id: string; name: string; grundlage: Grundlage; primaer: string; sekundaer: string; css: string;
  /** Text neben dem Logo (#72): null = „Ablago“, leer = nur das Logo. */
  schriftzug?: string | null;
  logo?: { sha256: string; mime: string; groesse: number } | null;
}
export const GRUNDLAGEN: Record<Grundlage, string> = { automatisch: t('oberflaeche.design.automatisch-nach-geraet'), hell: t('oberflaeche.design.hell'), dunkel: t('oberflaeche.design.dunkel'), kontrast: t('oberflaeche.design.hoher-kontrast') };

/** Markenfarben aus dms-website/marke/ (#699); Grün ist die Sekundärfarbe des Standard-Designs. */
export const MARKE = { blau: '#1F4E79', blauDunkel: '#8DB8E0', gruen: '#2B7656' } as const;

// Hell und dunkel stehen nur in tokens.css (#966).
const TOKENS = tokenPaletten(tokensCss);
// Hoher Kontrast gibt es nur als Design: hell mit eigenen, kräftigeren Grundwerten.
const KONTRAST: Palette = {
  grund: '#FFFFFF', flaeche: '#FFFFFF', senke: '#F0F0F0', tinte: '#000000', leise: '#262626', linie: '#6B6B6B', 'linie-stark': '#000000',
  schlecht: '#A00000', 'schlecht-zart': '#FFE5E5', warn: '#6B4300', 'warn-zart': '#FFF1D6',
};
const NEUTRAL: Record<'hell' | 'dunkel' | 'kontrast', Palette> = { hell: TOKENS.hell, dunkel: TOKENS.dunkel, kontrast: { ...TOKENS.hell, ...KONTRAST } };

const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const hex = (c: number[]) => `#${c.map((x) => Math.round(Math.max(0, Math.min(255, x))).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
/** a mit Anteil t von b mischen. */
export const mische = (a: string, b: string, zahl: number) => { const x = rgb(a), y = rgb(b); return hex(x.map((v, i) => v + (y[i] - v) * zahl)); };
const lum = (h: string) => { const [r, g, b] = rgb(h).map((v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
export const kontrast = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

/** Farbe so weit Richtung Schwarz oder Weiß schieben, bis sie auf dem Hintergrund lesbar ist (WCAG 4,5:1). */
function lesbar(farbe: string, hinter: string, ziel = 4.5) {
  const richtung = lum(hinter) > 0.4 ? '#000000' : '#FFFFFF';
  let f = farbe;
  for (let zahl = 0.08; kontrast(f, hinter) < ziel && zahl <= 1; zahl += 0.08) f = mische(farbe, richtung, zahl);
  return f;
}
const schriftAuf = (f: string) => (kontrast(f, '#FFFFFF') >= kontrast(f, '#111111') ? '#FFFFFF' : '#111111');

/** Alle Farbwerte eines Designs für eine feste Grundlage. */
export function palette(grundlage: 'hell' | 'dunkel' | 'kontrast', primaer: string, sekundaer: string): Palette {
  const n = NEUTRAL[grundlage];
  const dunkel = grundlage === 'dunkel';
  const ziel = grundlage === 'kontrast' ? 7 : 4.5;
  // Ablago-Blau (#699): im Dunkeln der Markenwert von ablago.app statt der rechnerisch aufgehellten, grauen Fassung.
  const akzent = dunkel && primaer.toUpperCase() === MARKE.blau ? lesbar(MARKE.blauDunkel, n.flaeche, ziel) : lesbar(primaer, n.flaeche, ziel);
  const gruen = lesbar(sekundaer, n.flaeche, ziel);
  return {
    ...n,
    akzent, 'akzent-tinte': schriftAuf(akzent),
    'akzent-zart': mische(n.flaeche, primaer, dunkel ? 0.24 : 0.12),
    'akzent-stark': dunkel ? mische(akzent, '#FFFFFF', 0.2) : mische(akzent, '#000000', 0.18),
    gruen, 'gruen-tinte': schriftAuf(gruen),
    'gruen-zart': mische(n.flaeche, sekundaer, dunkel ? 0.24 : 0.12),
    'marke-hell': dunkel ? 'none' : 'block', 'marke-dunkel': dunkel ? 'block' : 'none',
    'color-scheme': dunkel ? 'dark' : 'light',
  };
}

const block = (p: Palette) => Object.entries(p).map(([k, v]) => (k === 'color-scheme' ? `color-scheme: ${v};` : `--${k}: ${v};`)).join(' ');

/** CSS eines Designs; ohne eigenes CSS, wenn mitCss = false (Rettungsweg). */
export function designCss(d: Pick<Design, 'grundlage' | 'primaer' | 'sekundaer' | 'css'>, mitCss = true): string {
  const teile = d.grundlage === 'automatisch'
    ? [`:root { ${block(palette('hell', d.primaer, d.sekundaer))} }`,
       `@media (prefers-color-scheme: dark) { :root { ${block(palette('dunkel', d.primaer, d.sekundaer))} } }`]
    : [`:root { ${block(palette(d.grundlage, d.primaer, d.sekundaer))} }`];
  if (d.grundlage === 'kontrast') teile.push(':root { --r: 4px; } :focus-visible { outline-width: 3px; } a, .verweis, .textknopf { text-decoration: underline; }');
  if (mitCss && d.css.trim()) teile.push(`/* Eigenes CSS des Designs */\n${cssOhneSpitzeKlammer(d.css)}`);
  return teile.join('\n');
}

/** Design auf die Seite anwenden (ersetzt ein vorher angewendetes). */
export function wendeAn(d: Design | null, mitCss = true) {
  let el = document.getElementById('dms-design') as HTMLStyleElement | null;
  if (!d) { el?.remove(); return; }
  if (!el) { el = document.createElement('style'); el.id = 'dms-design'; document.head.appendChild(el); }
  el.textContent = designCss(d, mitCss);
}

/** ?design=standard in der Adresse: Standard-Design ohne eigenes CSS (falls ein CSS die Oberfläche unbedienbar macht). */
// Beim Laden der Seite festgestellt und bis zum nächsten Neuladen gültig (der Router entfernt die Angabe aus der Adresse).
const RETTUNG = new URLSearchParams(location.search).get('design') === 'standard';
export const rettungsweg = () => RETTUNG;

/* ---------- Schriftgröße je Gerät ---------- */

export type Schrift = 'klein' | 'normal' | 'gross';
export const SCHRIFTEN: Record<Schrift, { name: string; skala: number }> = { klein: { name: t('oberflaeche.design.klein'), skala: 0.9 }, normal: { name: t('oberflaeche.design.normal'), skala: 1 }, gross: { name: t('oberflaeche.design.gross'), skala: 1.15 } };
const schriftSchluessel = (benutzer: string) => `dms:schrift:${benutzer}`;
export function leseSchrift(benutzer: string): Schrift {
  try { const s = localStorage.getItem(schriftSchluessel(benutzer)); if (s && s in SCHRIFTEN) return s as Schrift; } catch { /* egal */ }
  return 'normal';
}
export function setzeSchrift(benutzer: string, s: Schrift) {
  try { localStorage.setItem(schriftSchluessel(benutzer), s); } catch { /* nur für jetzt */ }
  document.documentElement.style.setProperty('--skala', String(SCHRIFTEN[s].skala));
}
