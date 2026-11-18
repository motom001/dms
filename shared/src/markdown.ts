/**
 * Formatierter Text (#53): ein kleines, sicheres Markdown.
 *
 * - Blöcke: Überschriften (#, ##, ###), Absätze, Listen (-, *, 1.), Zitate (>).
 * - Inline: **fett**, *kursiv* bzw. _kursiv_, `Code`, [Text](https://…), Erwähnungen @[](mappe:<id>) (#889) – auch
 *   ältere @[Name](benutzer:<id>) (#56). Ein Benutzer ist eine Mappe (Systemtyp „Benutzer“); `benutzer:` bleibt gültig.
 *   Gespeichert wird nur die Kennung (#1293, `ohneTitel`): Den Titel setzt erst die Ausgabe ein, nach den Rechten der
 *   lesenden Person. Ein Name in den Klammern (Bestand vor Migration 119, Eingabe der Oberfläche) zählt nicht.
 * - Rohes HTML gibt es nicht: Der Text wird in einen Baum zerlegt und von der Oberfläche
 *   als React-Elemente gezeichnet – nichts davon wird je als HTML ausgeführt.
 * - Links nur mit http(s) oder mailto; alles andere bleibt Text.
 */

import { t } from './texte';

export type Inline =
  | { art: 'text'; text: string }
  | { art: 'fett' | 'kursiv'; kinder: Inline[] }
  | { art: 'code'; text: string }
  | { art: 'link'; ziel: string; kinder: Inline[] }
  /** id: Mappe (bzw. Benutzer-Mappe); benutzer: alte Schreibweise `benutzer:` (#56). name: eingesetzter Titel, gespeichert leer (#1293). */
  | { art: 'erwaehnung'; id: string; name: string; benutzer: boolean };

export type Block =
  | { art: 'ueberschrift'; stufe: 1 | 2 | 3; inhalt: Inline[] }
  | { art: 'absatz'; inhalt: Inline[] }
  | { art: 'liste'; nummeriert: boolean; punkte: Inline[][] }
  | { art: 'zitat'; bloecke: Block[] };

const ERLAUBTE_LINKS = /^(https?:\/\/|mailto:)/i;
const ERWAEHNUNG = /@\[([^\]\n]{0,80})\]\((?:benutzer|mappe):([0-9a-f-]{36})\)/gi;
/** Dieselbe Erwähnung mit Schreibweise als eigene Gruppe (für `ohneTitel` und `mitTiteln`). */
const ERWAEHNUNG_SCHREIBWEISE = /@\[([^\]\n]{0,80})\]\((benutzer|mappe):([0-9a-f-]{36})\)/gi;

/** Inline-Text in Teile zerlegen. */
export function inline(text: string): Inline[] {
  const out: Inline[] = [];
  let rest = text;
  const textTeil = (t: string) => {
    if (!t) return;
    const letzter = out[out.length - 1];
    if (letzter?.art === 'text') letzter.text += t;
    else out.push({ art: 'text', text: t });
  };
  const muster: Array<[RegExp, (m: RegExpExecArray) => Inline | null]> = [
    [
      /^@\[([^\]\n]{0,80})\]\((benutzer|mappe):([0-9a-f-]{36})\)/i,
      (m) => ({ art: 'erwaehnung', name: m[1], id: m[3].toLowerCase(), benutzer: m[2].toLowerCase() === 'benutzer' }),
    ],
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
      if (re.source.startsWith('^_') && out.length && /[A-Za-z0-9äöüÄÖÜß]$/.test((out[out.length - 1] as { text?: string }).text ?? ''))
        continue;
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
  const zeilen = String(md ?? '')
    .replace(/\r\n?/g, '\n')
    .split('\n');
  const bloecke: Block[] = [];
  let i = 0;
  while (i < zeilen.length) {
    const z = zeilen[i];
    if (!z.trim()) {
      i++;
      continue;
    }
    const u = /^(#{1,3})\s+(.*)$/.exec(z);
    if (u) {
      bloecke.push({ art: 'ueberschrift', stufe: u[1].length as 1 | 2 | 3, inhalt: inline(u[2].trim()) });
      i++;
      continue;
    }
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
        if (q && /\d/.test(q[1]) === nummeriert) {
          punkte.push(inline(q[2]));
          i++;
          continue;
        }
        // Fortsetzungszeile (eingerückt) gehört zum letzten Punkt.
        if (zeilen[i].trim() && /^\s{2,}/.test(zeilen[i]) && punkte.length) {
          punkte[punkte.length - 1].push({ art: 'text', text: ' ' }, ...inline(zeilen[i].trim()));
          i++;
          continue;
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

/**
 * Name einer Erwähnung im reinen Text; Vorgabe: der eingesetzte Titel, sonst „Erwähnung“ (#1293). `benutzer`: alte
 * Schreibweise `benutzer:` (#56) – die Mappe zeigt sie als Person.
 */
export type ErwaehnungsName = (id: string, gespeichert: string, benutzer: boolean) => string;

/** Ersatz, wenn kein Titel eingesetzt ist (#1293): neutral – nennt nichts, was die lesende Person nicht sehen darf. */
export const erwaehnungsErsatz = (name: string) => name || t('gemeinsam.markdown.erwaehnung');

const textVon = (teile: Inline[], name: ErwaehnungsName): string =>
  teile
    .map((t) => {
      switch (t.art) {
        case 'text':
        case 'code':
          return t.text;
        case 'erwaehnung':
          return `@${name(t.id, t.name, t.benutzer)}`;
        default:
          return textVon(t.kinder, name);
      }
    })
    .join('');

/**
 * Reiner Text ohne Formatierung (Titel, Listen, Suche). `name` (#889): Text für Erwähnungen, z. B. der aktuelle Titel
 * oder „Mappe (nicht sichtbar)“ für jemanden, der die erwähnte Mappe nicht lesen darf.
 */
export function alsText(md: string, name: ErwaehnungsName = (_id, n) => erwaehnungsErsatz(n)): string {
  const gehe = (b: Block[]): string[] =>
    b.flatMap((x) => {
      switch (x.art) {
        case 'ueberschrift':
        case 'absatz':
          return [textVon(x.inhalt, name)];
        case 'liste':
          return x.punkte.map((p) => textVon(p, name));
        case 'zitat':
          return gehe(x.bloecke);
      }
    });
  return gehe(zerlege(md)).join(' ').replace(/\s+/g, ' ').trim();
}

/** Ids der erwähnten Mappen und Benutzer (#56, #889) – beide Schreibweisen. */
export function erwaehnungen(md: string): string[] {
  return [...new Set([...String(md ?? '').matchAll(ERWAEHNUNG)].map((m) => m[2].toLowerCase()))];
}

const titelTeil = (name: string) => name.replace(/[[\]\n]/g, '').slice(0, 80);

/**
 * Markdown-Text einer Erwähnung (#889: immer `mappe:`, auch für Benutzer). Ohne Namen so, wie er gespeichert wird
 * (#1293); mit Namen nur zum Anzeigen in der Eingabe – der Server nimmt ihn beim Speichern wieder heraus.
 */
export const erwaehnung = (name: string, id: string) => `@[${titelTeil(name)}](mappe:${id})`;

/** Titel aus allen Erwähnungen nehmen (#1293): gespeichert wird nur `@[](mappe:<id>)` bzw. `@[](benutzer:<id>)`. */
export function ohneTitel(md: string): string {
  return String(md ?? '').replace(
    ERWAEHNUNG_SCHREIBWEISE,
    (_m, _n, art: string, id: string) => `@[](${art.toLowerCase()}:${id.toLowerCase()})`,
  );
}

/**
 * Titel in die Erwähnungen einsetzen (#1293), z. B. für Ausgaben, die den Text weiterverarbeiten (Export, Auskunft,
 * Textsatz). `name` entscheidet nach den Rechten der lesenden Person (aktueller Titel oder „Mappe (nicht sichtbar)“);
 * `gespeichert` ist, was in den Klammern steht (nur für die Eingabe der Oberfläche, solange der Titel noch aussteht).
 */
export function mitTiteln(md: string, name: (id: string, gespeichert: string) => string): string {
  return String(md ?? '').replace(
    ERWAEHNUNG_SCHREIBWEISE,
    (_m, n: string, art: string, id: string) => `@[${titelTeil(name(id.toLowerCase(), n))}](${art.toLowerCase()}:${id.toLowerCase()})`,
  );
}
