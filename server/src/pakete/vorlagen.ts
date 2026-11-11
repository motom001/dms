/**
 * Text-Vorlagen in Paketen (#1038): schlichtes Markdown unter `inhalt/vorlagen/*.md`, z. B. ein Kündigungsschreiben
 * an der Vertragsart „Miete“. Ausgeben (Platzhalter füllen, PDF) kommt mit „Text setzen“ (#1040) – hier nur, was eine
 * Vorlage sein darf. Ablago prüft beim Lesen des Pakets und noch einmal beim Installieren; dms-registry prüft dasselbe
 * (`pruefen.py`).
 *
 * Regeln (Ergänzung Sicherheit):
 * - nur UTF-8-Text, nicht leer, höchstens `VORLAGE_MAX` (grenzen.ts); keine Steuerzeichen außer Tab und Zeilenende;
 * - kein HTML – keine Tags, keine Kommentare, keine Verarbeitungsanweisungen (alles, was mit `<` und einem Buchstaben,
 *   `!`, `?` oder `/` beginnt; einzige Ausnahme sind Links in spitzen Klammern `<https://…>`);
 * - keine Bilder (`![…]`), also auch kein Tracking-Pixel beim Öffnen;
 * - Links nur `https://` – in `[Text](…)`, in Verweisdefinitionen `[x]: …` und in spitzen Klammern; `http:`,
 *   `javascript:`, `data:`, `vbscript:`, `file:` und `mailto:` gibt es nirgends im Text;
 * - Platzhalter wie bei Automatisierungen (`{vertragsnummer}`, `{von.name}`), aber nie ein Passwortfeld.
 */
import { VORLAGE_MAX } from '../grenzen';

export type VorlagenFehler = 'leer' | 'gross' | 'utf8' | 'steuerzeichen' | 'html' | 'bild' | 'link' | 'passwort';

/** Platzhalter in einer Vorlage: `{feld}` oder `{feld.feld}` (Schreibweise der Automatisierungen). */
const PLATZHALTER = /\{([a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)*)\}/g;
/** Platzhalter einer Vorlage, je Name einmal. */
export const vorlagenPlatzhalter = (text: string): string[] => [...new Set([...text.matchAll(PLATZHALTER)].map((m) => m[1]))];

const HTML = /<(?!https:\/\/[^\s<>]+>)[A-Za-z!?/]/;
const BILD = /!\[/;
/** Schemata, die in einer Vorlage nirgends stehen dürfen (auch nicht als Text: Markdown macht daraus gern Links). */
const FREMDES_SCHEMA = /\b(?:http|javascript|data|vbscript|file|mailto|ftp)\s*:/i;
/** Ziele von Links: `[Text](ziel …)`, Verweisdefinition `[x]: ziel`, spitze Klammern `<ziel>`. */
const LINKZIELE = [/\]\(\s*<?([^)\s>]*)/g, /^\s{0,3}\[[^\]\n]+\]:\s*<?(\S*?)>?(?:\s|$)/gm, /<([a-z][a-z0-9+.-]*:[^\s<>]*)>/gi];
/** Steuerzeichen außer Tab, Zeilenvorschub und Wagenrücklauf. */
const STEUERZEICHEN = /(?![\t\n\r])\p{Cc}/u;

export interface Vorlagenpruefung { text?: string; fehler?: VorlagenFehler; wert?: string }

/**
 * Prüft eine Vorlage. `passwortFelder`: Kennungen von Passwortfeldern, die kein Platzhalter nennen darf (beim Lesen die
 * des Pakets, beim Installieren dazu die aller Mappentypen der Installation) – jeder Teil eines Platzhalters zählt.
 */
export function pruefeVorlage(inhalt: Buffer, passwortFelder: ReadonlySet<string> = new Set()): Vorlagenpruefung {
  if (!inhalt.length) return { fehler: 'leer' };
  if (inhalt.length > VORLAGE_MAX) return { fehler: 'gross' };
  let text: string;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(inhalt); } catch { return { fehler: 'utf8' }; }
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // Byte-Order-Mark
  if (!text.trim()) return { fehler: 'leer' };
  if (STEUERZEICHEN.test(text)) return { fehler: 'steuerzeichen' };
  const html = HTML.exec(text);
  if (html) return { fehler: 'html', wert: text.slice(html.index, html.index + 20).split('\n')[0] };
  if (BILD.test(text)) return { fehler: 'bild' };
  for (const re of LINKZIELE) {
    for (const m of text.matchAll(re)) {
      const ziel = m[1];
      if (ziel && !/^https:\/\/[^\s]+$/i.test(ziel)) return { fehler: 'link', wert: ziel.slice(0, 80) };
    }
  }
  const schema = FREMDES_SCHEMA.exec(text);
  if (schema) return { fehler: 'link', wert: schema[0].replace(/\s+/g, '') };
  const geheim = vorlagenPlatzhalter(text).find((p) => p.split('.').some((teil) => passwortFelder.has(teil)));
  if (geheim) return { fehler: 'passwort', wert: `{${geheim}}` };
  return { text };
}
