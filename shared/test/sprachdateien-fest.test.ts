/**
 * Keine fest eingebauten Texte in der Oberfläche (#727) – diese Prüfung läuft in der CI wie
 * `sprachdateien.test.ts`. Sie liest jede `.tsx`-Datei unter `web/src` mit dem TypeScript-Parser und meldet:
 *
 * - Text zwischen Tags (`<p>Speichern</p>`),
 * - Texte in Attributen, die man sieht (`title="…"`, `aria-label="…"`, `placeholder="…"`, eigene wie `titel="…"`),
 * - Texte als Wert in geschweiften Klammern (`{offen ? 'Zu' : 'Auf'}`) und in Vorlagen dort (`` {`${n} Mappen`} ``).
 *
 * Statt des Textes gehört dort `t('bereich.schluessel')` bzw. `tn(…)` hin (Anleitung: Entwicklerhandbuch → Aufbau →
 * Texte und Sprachdateien). Was in jeder Sprache gleich bleibt (Namen, Formate, Beispiele), steht mit Grund in
 * `AUSNAHMEN` unten.
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, it } from 'node:test';
import ts from 'typescript';

const WURZEL = new URL('../..', import.meta.url).pathname;

/**
 * Begründete Ausnahmen: Datei (relativ zu web/src) → Texte, die dort fest bleiben dürfen.
 * Gilt der Grund für jede Datei, steht die Ausnahme unter `*`.
 */
const AUSNAHMEN: Record<string, { texte: string[]; grund: string }[]> = {
  '*': [
    { texte: ['Ablago'], grund: 'Name des Produkts, in jeder Sprache gleich.' },
    { texte: ['Edge', 'Firefox', 'Chrome', 'Safari', 'iOS', 'Android', 'Windows', 'macOS', 'Linux', 'Google', 'Microsoft', 'Apple', 'GitHub', 'Docker', 'PostgreSQL', 'Tesseract', 'WebDAV', 'OpenID Connect', 'Nextcloud', 'Paperless-ngx', 'Gmail', 'Outlook'], grund: 'Namen von Produkten und Diensten.' },
  ],
};

/** Attribute, deren Werte Technik sind (Klassen, Kennungen, Adressen, Varianten) – sie zeigt niemand an. */
const TECHNIK = new Set(['className', 'key', 'id', 'href', 'to', 'type', 'htmlFor', 'role', 'ort', 'src', 'accept', 'autoComplete', 'inputMode', 'pattern', 'rel', 'target', 'lang', 'form', 'method', 'value', 'defaultValue', 'style', 'd', 'viewBox', 'fill', 'stroke', 'symbol', 'art', 'variante', 'ziel', 'pfad', 'anker', 'icon', 'piktogramm', 'download', 'media', 'sizes', 'srcSet', 'action', 'encType', 'list', 'dir', 'wrap', 'capture', 'enterKeyHint', 'autoCapitalize', 'datei', 'mime', 'seite', 'bereich', 'abschnitt', 'name']);

/** Attribute, deren Wert man immer liest: dort zählt schon ein kleines Wort („offen“). */
const LESBAR = new Set(['title', 'aria-label', 'placeholder', 'alt', 'label', 'titel', 'text', 'hinweis', 'unter', 'untertitel', 'beschreibung', 'leer', 'kurz']);

/** Text zwischen Tags so, wie React ihn zeigt (Zeilen beschnitten, mit Leerzeichen verbunden). */
function jsxText(roh: string): string {
  const zeilen = roh.split(/\r\n|\n|\r/);
  return zeilen.map((z, i) => {
    let x = z.replace(/\t/g, ' ');
    if (i > 0) x = x.replace(/^ +/, '');
    if (i < zeilen.length - 1) x = x.replace(/ +$/, '');
    return x;
  }).filter(Boolean).join(' ').replace(/&(nbsp|lt|gt|amp|quot);/g, ' ');
}

/** Sieht wie Text für Menschen aus? Zwischen Tags reicht ein Wort mit Kleinbuchstaben; sonst Leerzeichen, Umlaut oder großes Wort. */
export function istText(s: string, zwischenTags: boolean): boolean {
  const x = s.trim();
  if (!/\p{L}\p{Ll}/u.test(x)) return false;
  if (/^(https?:\/\/|mailto:)\S*$/.test(x.split('\n')[0])) return false; // Adresse als Beispiel
  if (/^(curl |[./?#[]|\((pointer|max-|min-|prefers-)|[a-z]+:[a-z{-])/.test(x) || /\{ [^}]*; ?\}/.test(x)) return false; // Befehl, Pfad, CSS
  if (/^[\w.+-]+@[\w.-]+$|^[\w-]+(\.[\w-]+)+$/.test(x)) return false; // Beispieladresse, Rechnername
  if (zwischenTags) return true;
  if (/^[a-z0-9_.:/#?&=%+@[\]-]+$/.test(x)) return false; // Kennung, Klasse, Adresse
  if (/^[a-z0-9_-]+( [a-z0-9_-]+)*$/.test(x)) return false; // Klassenliste
  return /\s/.test(x) || /[äöüÄÖÜß„“–…]/.test(x) || /^\p{Lu}\p{Ll}/u.test(x);
}

export interface Fund { datei: string; zeile: number; text: string }

/** Feste Texte einer .tsx-Datei. */
export function festeTexte(datei: string, quelle: string): Fund[] {
  const sf = ts.createSourceFile(datei, quelle, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const funde: Fund[] = [];
  const melde = (n: ts.Node, text: string) => funde.push({ datei, zeile: sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1, text: text.trim() });
  /** Ein Wert, der direkt angezeigt wird: über Klammern, `?:`, `||` und `??` bis zur geschweiften Klammer bzw. zum Attribut. */
  const sichtbarerWert = (n: ts.Node): ts.Node | null => {
    let k: ts.Node = n, p = n.parent;
    while (p && (ts.isParenthesizedExpression(p) || (ts.isConditionalExpression(p) && p.condition !== k)
      || (ts.isBinaryExpression(p) && p.right === k && [ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken, ts.SyntaxKind.AmpersandAmpersandToken].includes(p.operatorToken.kind)))) { k = p; p = p.parent; }
    if (p && ts.isJsxExpression(p) && p.parent && (ts.isJsxElement(p.parent) || ts.isJsxFragment(p.parent))) return p;
    if (p && ts.isJsxExpression(p) && p.parent && ts.isJsxAttribute(p.parent)) return p.parent;
    if (p && ts.isJsxAttribute(p)) return p;
    return null;
  };
  /** Text in <code>, <kbd>, <pre>, <samp> oder in Elementen mit Klasse „mono“ ist Technik (Befehl, Dateiname). */
  const imCode = (n: ts.Node): boolean => {
    const e = n.parent;
    if (!e || !ts.isJsxElement(e)) return false;
    const tag = e.openingElement.tagName.getText(sf);
    const klasse = e.openingElement.attributes.properties.find((a) => ts.isJsxAttribute(a) && a.name.getText(sf) === 'className');
    return ['code', 'kbd', 'pre', 'samp'].includes(tag) || /\bmono\b/.test(klasse?.getText(sf) ?? '');
  };
  const technisch = (a: ts.Node) => ts.isJsxAttribute(a) && (TECHNIK.has(a.name.getText(sf)) || a.name.getText(sf).startsWith('data-'));
  const besuche = (n: ts.Node): void => {
    if (ts.isJsxText(n)) { const t = jsxText(n.text); if (istText(t, true) && !imCode(n)) melde(n, t); return; }
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) {
      const ort = sichtbarerWert(n);
      const lesbar = !!ort && ts.isJsxAttribute(ort) && LESBAR.has(ort.name.getText(sf));
      if (ort && !technisch(ort) && istText(n.text, lesbar)) melde(n, n.text);
      return;
    }
    if (ts.isTemplateExpression(n)) {
      const ort = sichtbarerWert(n);
      const statisch = [n.head.text, ...n.templateSpans.map((s) => s.literal.text)].join('x');
      if (ort && !technisch(ort) && istText(statisch, false)) melde(n, statisch);
    }
    ts.forEachChild(n, besuche);
  };
  besuche(sf);
  const erlaubt = new Set([...(AUSNAHMEN['*'] ?? []), ...(AUSNAHMEN[datei] ?? [])].flatMap((a) => a.texte));
  return funde.filter((f) => !erlaubt.has(f.text));
}

function tsxDateien(ordner: string): string[] {
  return readdirSync(ordner).flatMap((n) => {
    const p = join(ordner, n);
    return statSync(p).isDirectory() ? tsxDateien(p) : n.endsWith('.tsx') ? [p] : [];
  });
}

describe('Keine festen Texte in der Oberfläche (#727)', () => {
  it('jede .tsx-Datei holt ihre Texte aus den Sprachdateien', () => {
    const web = join(WURZEL, 'web/src');
    const funde = tsxDateien(web).flatMap((p) => festeTexte(relative(web, p), readFileSync(p, 'utf8')));
    assert.deepEqual(funde.map((f) => `web/src/${f.datei}:${f.zeile}: „${f.text}“`), [],
      '\nFeste Texte gefunden – bitte in shared/src/sprachen/de/<bereich>.json ablegen und mit t(…) holen (oder begründet in AUSNAHMEN eintragen):\n');
  });

  it('die Prüfung findet Text zwischen Tags, in Attributen und als Wert', () => {
    const q = [
      'const a = <p className="leise klein" title="Mehr dazu">Speichern <b>{t(\'x.y\')}</b></p>;',
      'const b = <i aria-label={offen ? \'Zu\' : \'Auf\'}>{n} {`${n} Mappen`}</i>;',
      'const c = <a href="/hilfe" data-x="Nicht">{t(\'x.y\')} · {zahl}</a>;',
      'const d = <span>Ablago</span>;',
      'const e = <p>{t(\'x.y\')} <code>dms.json</code> <span className="mono">.zip</span></p>;',
    ].join('\n');
    assert.deepEqual(festeTexte('probe.tsx', q).map((f) => `${f.zeile}:${f.text}`), ['1:Mehr dazu', '1:Speichern', '2:Zu', '2:Auf', '2:x Mappen']);
  });
});
