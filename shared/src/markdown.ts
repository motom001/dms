/**
 * Formatierter Text (#53): ein kleines, sicheres Markdown.
 *
 * - Blöcke: Überschriften (#, ##, ###), Absätze, Listen (-, *, 1.), Zitate (>).
 * - Inline: **fett**, *kursiv* bzw. _kursiv_, `Code`, [Text](https://…), Erwähnungen @[Name](benutzer:<id>) (#56).
 * - Rohes HTML gibt es nicht: Der Text wird in einen Baum zerlegt und von der Oberfläche
 *   als React-Elemente gezeichnet – nichts davon wird je als HTML ausgeführt.
 * - Links nur mit http(s) oder mailto; alles andere bleibt Text.
 */

export type Inline =
  | { art: 'text'; text: string }
  | { art: 'fett' | 'kursiv'; kinder: Inline[] }
  | { art: 'code'; text: string }
  | { art: 'link'; ziel: string; kinder: Inline[] }
  | { art: 'erwaehnung'; benutzerId: string; name: string };

export type Block =
  | { art: 'ueberschrift'; stufe: 1 | 2 | 3; inhalt: Inline[] }
  | { art: 'absatz'; inhalt: Inline[] }
  | { art: 'liste'; nummeriert: boolean; punkte: Inline[][] }
  | { art: 'zitat'; bloecke: Block[] };

const ERLAUBTE_LINKS = /^(https?:\/\/|mailto:)/i;
const ERWAEHNUNG = /@\[([^\]\n]{1,80})\]\(benutzer:([0-9a-f-]{36})\)/gi;

/** Inline-Text in Teile zerlegen. */
export function inline(text: string): Inline[] {
  const out: Inline[] = [];
  let rest = text;
  const textTeil = (t: string) => {
    if (!t) return;
    const letzter = out[out.length - 1];
    if (letzter?.art === 'text') letzter.text += t; else out.push({ art: 'text', text: t });
  };
  const muster: Array<[RegExp, (m: RegExpExecArray) => Inline | null]> = [
    [/^@\[([^\]\n]{1,80})\]\(benutzer:([0-9a-f-]{36})\)/i, (m) => ({ art: 'erwaehnung', name: m[1], benutzerId: m[2].toLowerCase() })],
    [/^`([^`\n]+)`/, (m) => ({ art: 'code', text: m[1] })],
    [/^\*\*(?=\S)([\s\S]*?\S)\*\*/, (m) => ({ art: 'fett', kinder: inline(m[1]) })],
    [/^__(?=\S)([\s\S]*?\S)__/, (m) => ({ art: 'fett', kinder: inline(m[1]) })],
    [/^\*(?=\S)([^*\n]*?\S)\*/, (m) => ({ art: 'kursiv', kinder: inline(m[1]) })],
    [/^_(?=\S)([^_\n]*?\S)_(?![A-Za-z0-9äöüÄÖÜß])/, (m) => ({ art: 'kursiv', kinder: inline(m[1]) })],
    [/^\[([^\]\n]+)\]\(([^)\s]+)\)/, (m) => (ERLAUBTE_LINKS.test(m[2]) ? { art: 'link', ziel: m[2], kinder: inline(m[1]) } : null)],
  ];
  while (rest) {
    let treffer = false;
    // Ein Zeichen vor dem Muster prüfen: _kursiv_ nur am Wortanfang.
    for (const [re, bau] of muster) {
      const m = re.exec(rest);
      if (!m) continue;
      const teil = bau(m);
      if (!teil) continue;
      if (re.source.startsWith('^_') && out.length && /[A-Za-z0-9äöüÄÖÜß]$/.test((out[out.length - 1] as { text?: string }).text ?? '')) continue;
      out.push(teil);
      rest = rest.slice(m[0].length);
      treffer = true;
      break;
    }
    if (treffer) continue;
    // Bis zum nächsten möglichen Steuerzeichen als Text übernehmen.
    const naechstes = rest.slice(1).search(/[*_`[@]/);
    const n = naechstes < 0 ? rest.length : naechstes + 1;
    textTeil(rest.slice(0, n));
    rest = rest.slice(n);
  }
  return out;
}

/** Markdown in Blöcke zerlegen. */
export function zerlege(md: string): Block[] {
  const zeilen = String(md ?? '').replace(/\r\n?/g, '\n').split('\n');
  const bloecke: Block[] = [];
  let i = 0;
  while (i < zeilen.length) {
    const z = zeilen[i];
    if (!z.trim()) { i++; continue; }
    const u = /^(#{1,3})\s+(.*)$/.exec(z);
    if (u) { bloecke.push({ art: 'ueberschrift', stufe: u[1].length as 1 | 2 | 3, inhalt: inline(u[2].trim()) }); i++; continue; }
    if (/^>\s?/.test(z)) {
      const innen: string[] = [];
      while (i < zeilen.length && /^>\s?/.test(zeilen[i])) innen.push(zeilen[i++].replace(/^>\s?/, ''));
      bloecke.push({ art: 'zitat', bloecke: zerlege(innen.join('\n')) });
      continue;
    }
    const punkt = /^\s*([-*+]|\d{1,3}[.)])\s+(.*)$/;
    const p = punkt.exec(z);
    if (p) {
      const nummeriert = /\d/.test(p[1]);
      const punkte: Inline[][] = [];
      while (i < zeilen.length) {
        const q = punkt.exec(zeilen[i]);
        if (q && /\d/.test(q[1]) === nummeriert) { punkte.push(inline(q[2])); i++; continue; }
        // Fortsetzungszeile (eingerückt) gehört zum letzten Punkt.
        if (zeilen[i].trim() && /^\s{2,}/.test(zeilen[i]) && punkte.length) {
          punkte[punkte.length - 1].push({ art: 'text', text: ' ' }, ...inline(zeilen[i].trim()));
          i++; continue;
        }
        break;
      }
      bloecke.push({ art: 'liste', nummeriert, punkte });
      continue;
    }
    const absatz: string[] = [];
    while (i < zeilen.length && zeilen[i].trim() && !/^(#{1,3})\s|^>|^\s*([-*+]|\d{1,3}[.)])\s+/.test(zeilen[i])) absatz.push(zeilen[i++]);
    bloecke.push({ art: 'absatz', inhalt: inline(absatz.join('\n')) });
  }
  return bloecke;
}

const textVon = (teile: Inline[]): string => teile.map((t) => {
  switch (t.art) {
    case 'text': case 'code': return t.text;
    case 'erwaehnung': return `@${t.name}`;
    default: return textVon(t.kinder);
  }
}).join('');

/** Reiner Text ohne Formatierung (Titel, Listen, Suche). */
export function alsText(md: string): string {
  const gehe = (b: Block[]): string[] => b.flatMap((x) => {
    switch (x.art) {
      case 'ueberschrift': case 'absatz': return [textVon(x.inhalt)];
      case 'liste': return x.punkte.map((p) => textVon(p));
      case 'zitat': return gehe(x.bloecke);
    }
  });
  return gehe(zerlege(md)).join(' ').replace(/\s+/g, ' ').trim();
}

/** Ids der erwähnten Benutzer (#56). */
export function erwaehnungen(md: string): string[] {
  return [...new Set([...String(md ?? '').matchAll(ERWAEHNUNG)].map((m) => m[2].toLowerCase()))];
}

/** Markdown-Text einer Erwähnung. */
export const erwaehnung = (name: string, id: string) => `@[${name.replace(/[[\]\n]/g, '')}](benutzer:${id})`;
