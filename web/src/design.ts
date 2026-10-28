/**
 * Designs (#21): aus Grundlage, Primär- und Sekundärfarbe die Farbwerte der
 * Oberfläche ableiten und anwenden. Die Abstufungen (zarte Hintergründe,
 * lesbare Schrift auf der Farbe, für dunkle Grundlagen aufgehellte Töne)
 * entstehen hier, damit jede Farbe auf jeder Grundlage lesbar bleibt.
 */
export type Grundlage = 'automatisch' | 'hell' | 'dunkel' | 'kontrast';
export interface Design {
  id: string; name: string; grundlage: Grundlage; primaer: string; sekundaer: string; css: string;
  /** Text neben dem Logo (#72): null = „DMS“, leer = nur das Logo. */
  schriftzug?: string | null;
  logo?: { sha256: string; mime: string; groesse: number } | null;
}
export const GRUNDLAGEN: Record<Grundlage, string> = { automatisch: 'Automatisch (nach Gerät)', hell: 'Hell', dunkel: 'Dunkel', kontrast: 'Hoher Kontrast' };

type Palette = Record<string, string>;
const NEUTRAL: Record<'hell' | 'dunkel' | 'kontrast', Palette> = {
  hell: {
    grund: '#ECEFF3', flaeche: '#FFFFFF', senke: '#F5F6F8', tinte: '#17202B', leise: '#5A6475', linie: '#D8DDE4', 'linie-stark': '#C3CAD4',
    schlecht: '#B42318', 'schlecht-zart': '#FBE9E7', warn: '#835700', 'warn-zart': '#FAF0D9',
  },
  dunkel: {
    grund: '#11151B', flaeche: '#1A2029', senke: '#151A22', tinte: '#E5E9EF', leise: '#98A2B2', linie: '#2B3340', 'linie-stark': '#3A4452',
    schlecht: '#F28B82', 'schlecht-zart': '#3A1F1E', warn: '#E3B655', 'warn-zart': '#34291A',
  },
  kontrast: {
    grund: '#FFFFFF', flaeche: '#FFFFFF', senke: '#F0F0F0', tinte: '#000000', leise: '#262626', linie: '#6B6B6B', 'linie-stark': '#000000',
    schlecht: '#A00000', 'schlecht-zart': '#FFE5E5', warn: '#6B4300', 'warn-zart': '#FFF1D6',
  },
};

const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const hex = (c: number[]) => `#${c.map((x) => Math.round(Math.max(0, Math.min(255, x))).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
/** a mit Anteil t von b mischen. */
export const mische = (a: string, b: string, t: number) => { const x = rgb(a), y = rgb(b); return hex(x.map((v, i) => v + (y[i] - v) * t)); };
const lum = (h: string) => { const [r, g, b] = rgb(h).map((v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
export const kontrast = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

/** Farbe so weit Richtung Schwarz oder Weiß schieben, bis sie auf dem Hintergrund lesbar ist (WCAG 4,5:1). */
function lesbar(farbe: string, hinter: string, ziel = 4.5) {
  const richtung = lum(hinter) > 0.4 ? '#000000' : '#FFFFFF';
  let f = farbe;
  for (let t = 0.08; kontrast(f, hinter) < ziel && t <= 1; t += 0.08) f = mische(farbe, richtung, t);
  return f;
}
const schriftAuf = (f: string) => (kontrast(f, '#FFFFFF') >= kontrast(f, '#111111') ? '#FFFFFF' : '#111111');

/** Alle Farbwerte eines Designs für eine feste Grundlage. */
export function palette(grundlage: 'hell' | 'dunkel' | 'kontrast', primaer: string, sekundaer: string): Palette {
  const n = NEUTRAL[grundlage];
  const dunkel = grundlage === 'dunkel';
  const ziel = grundlage === 'kontrast' ? 7 : 4.5;
  const akzent = lesbar(primaer, n.flaeche, ziel);
  const gruen = lesbar(sekundaer, n.flaeche, ziel);
  return {
    ...n,
    akzent, 'akzent-tinte': schriftAuf(akzent),
    'akzent-zart': mische(n.flaeche, primaer, dunkel ? 0.24 : 0.12),
    'akzent-stark': dunkel ? mische(akzent, '#FFFFFF', 0.2) : mische(akzent, '#000000', 0.18),
    gruen, 'gruen-tinte': schriftAuf(gruen),
    'gruen-zart': mische(n.flaeche, sekundaer, dunkel ? 0.24 : 0.12),
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
  if (mitCss && d.css.trim()) teile.push(`/* Eigenes CSS des Designs */\n${d.css.replace(/<\/?\s*style/gi, '')}`);
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
export const SCHRIFTEN: Record<Schrift, { name: string; skala: number }> = { klein: { name: 'Klein', skala: 0.9 }, normal: { name: 'Normal', skala: 1 }, gross: { name: 'Groß', skala: 1.15 } };
const schriftSchluessel = (benutzer: string) => `dms:schrift:${benutzer}`;
export function leseSchrift(benutzer: string): Schrift {
  try { const s = localStorage.getItem(schriftSchluessel(benutzer)); if (s && s in SCHRIFTEN) return s as Schrift; } catch { /* egal */ }
  return 'normal';
}
export function setzeSchrift(benutzer: string, s: Schrift) {
  try { localStorage.setItem(schriftSchluessel(benutzer), s); } catch { /* nur für jetzt */ }
  document.documentElement.style.setProperty('--skala', String(SCHRIFTEN[s].skala));
}
