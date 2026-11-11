/**
 * XML sicher lesen (#1043, E-Rechnung) – ein kleiner Leser ohne Bibliothek, wie schon beim WebDAV-Körper (#346).
 *
 * Warum kein Parser aus npm: Für XRechnung und ZUGFeRD braucht Ablago nur Elemente, Attribute und Text, nie DTD,
 * Schema oder Stylesheet. Ein vollständiger Parser brächte genau die Teile mit, die die Ergänzung Sicherheit
 * ausschließt (externe Entitäten, Entitäten-Expansion), und wäre eine neue Abhängigkeit. Dieser Leser kann sie gar
 * nicht erst:
 * - **Keine DTD:** `<!DOCTYPE`, `<!ENTITY`, `<!ELEMENT` … werden abgelehnt (XmlFehler) – damit kein XXE und keine
 *   „Billion Laughs“. Nichts wird nachgeladen (kein Schema, kein Stylesheet, keine Datei, kein Netz).
 * - **Nur die fünf festen Entitäten** (`&amp;` `&lt;` `&gt;` `&quot;` `&apos;`) und Zeichenreferenzen (`&#…;`); jede
 *   andere Entität ist ein Fehler.
 * - **Grenzen** (aus grenzen.ts, vom Aufrufer): Zeichen insgesamt, Tiefe, Zahl der Elemente. Linear: jedes Zeichen wird
 *   einmal angesehen, kein regulärer Ausdruck mit Rückverfolgung über den ganzen Text.
 *
 * Namensräume werden nicht aufgelöst: Ein Element heißt nach seinem lokalen Namen (ohne Präfix), das genügt für die
 * festen Pfade der E-Rechnung. Werte sind Text – was daraus wird, prüft die Erkennung wie jede andere Eingabe.
 */

export interface XmlKnoten {
  /** Lokaler Name ohne Präfix, z. B. „ID“ für `ram:ID`. */
  name: string;
  attr: Record<string, string>;
  kinder: XmlKnoten[];
  /** Text direkt in diesem Element (ohne den der Kinder), getrimmt. */
  text: string;
}
export interface XmlGrenzen { zeichen: number; tiefe: number; elemente: number }

export class XmlFehler extends Error {
  constructor(message: string) { super(message); this.name = 'XmlFehler'; }
}

const FEST: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

/** Text mit Entitäten: nur die festen und Zeichenreferenzen. */
function entschluessle(s: string): string {
  if (!s.includes('&')) return s;
  let aus = '';
  let i = 0;
  while (i < s.length) {
    const a = s.indexOf('&', i);
    if (a < 0) { aus += s.slice(i); break; }
    aus += s.slice(i, a);
    const e = s.indexOf(';', a);
    if (e < 0 || e - a > 12) throw new XmlFehler('Ungültige Entität');
    const n = s.slice(a + 1, e);
    if (n[0] === '#') {
      const code = n[1] === 'x' || n[1] === 'X' ? Number.parseInt(n.slice(2), 16) : Number.parseInt(n.slice(1), 10);
      if (!Number.isInteger(code) || code <= 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) throw new XmlFehler('Ungültige Zeichenreferenz');
      aus += String.fromCodePoint(code);
    } else if (Object.prototype.hasOwnProperty.call(FEST, n)) aus += FEST[n];
    else throw new XmlFehler('Entitäten sind nicht erlaubt');
    i = e + 1;
  }
  return aus;
}

const lokal = (q: string) => { const i = q.indexOf(':'); return i < 0 ? q : q.slice(i + 1); };
const NAME = /^[A-Za-z_][\w.\-:]*$/;

/** Zustand beim Lesen: offene Elemente, Wurzel, gezählte Elemente. */
interface Stand { s: string; g: XmlGrenzen; stapel: Array<{ q: string; k: XmlKnoten; text: string[] }>; wurzel: XmlKnoten | null; elemente: number }

/** Ein XML-Dokument lesen; wirft XmlFehler bei DTD, unbekannten Entitäten, kaputtem Aufbau oder überschrittenen Grenzen. */
export function liesXml(roh: string, g: XmlGrenzen): XmlKnoten {
  if (roh.length > g.zeichen) throw new XmlFehler('Das XML ist zu groß');
  const st: Stand = { s: roh.charCodeAt(0) === 0xfeff ? roh.slice(1) : roh, g, stapel: [], wurzel: null, elemente: 0 };
  const s = st.s;
  let i = 0;
  while (i < s.length) {
    const lt = s.indexOf('<', i);
    if (lt < 0) { text(st, entschluessle(s.slice(i))); break; }
    if (lt > i) text(st, entschluessle(s.slice(i, lt)));
    i = sonderteil(st, lt) ?? (s[lt + 1] === '/' ? endTag(st, lt) : startTag(st, lt));
  }
  if (st.stapel.length || !st.wurzel) throw new XmlFehler('Das XML ist unvollständig');
  return st.wurzel;
}

/** Text an das offene Element hängen; außerhalb der Wurzel nur Leerraum. */
function text(st: Stand, t: string) {
  if (!st.stapel.length) { if (t.trim()) throw new XmlFehler('Text außerhalb des Wurzelelements'); return; }
  st.stapel[st.stapel.length - 1].text.push(t);
}

/** Verarbeitungsanweisung, Kommentar, CDATA – Position danach; DTD und Ähnliches: Fehler; sonst undefined. */
function sonderteil(st: Stand, lt: number): number | undefined {
  const s = st.s;
  const bis = (ende: string, ab: number, was: string) => { const e = s.indexOf(ende, ab); if (e < 0) throw new XmlFehler(`${was} ohne Ende`); return e; };
  if (s.startsWith('<?', lt)) return bis('?>', lt + 2, 'Verarbeitungsanweisung') + 2;
  if (s.startsWith('<!--', lt)) return bis('-->', lt + 4, 'Kommentar') + 3;
  if (s.startsWith('<![CDATA[', lt)) { const e = bis(']]>', lt + 9, 'CDATA'); text(st, s.slice(lt + 9, e)); return e + 3; }
  // DOCTYPE, ENTITY, ELEMENT, ATTLIST …: nie.
  if (s[lt + 1] === '!') throw new XmlFehler('DTD und Entitäten sind nicht erlaubt');
  return undefined;
}

function endTag(st: Stand, lt: number): number {
  const e = st.s.indexOf('>', lt + 2);
  if (e < 0) throw new XmlFehler('Ende-Tag ohne Ende');
  const q = st.s.slice(lt + 2, e).trim();
  const oben = st.stapel.pop();
  if (!oben || oben.q !== q) throw new XmlFehler('Ende-Tag passt nicht');
  oben.k.text = oben.text.join('').trim();
  return e + 1;
}

/** Start-Tag: bis zum „>“ außerhalb von Anführungszeichen. */
function startTag(st: Stand, lt: number): number {
  const s = st.s;
  let j = lt + 1;
  let quote = '';
  for (; j < s.length; j++) {
    const c = s[j];
    if (quote) { if (c === quote) quote = ''; } else if (c === '"' || c === "'") quote = c; else if (c === '>' || c === '<') break;
  }
  if (j >= s.length || s[j] !== '>') throw new XmlFehler('Start-Tag ohne Ende');
  let inhalt = s.slice(lt + 1, j);
  const leer = inhalt.endsWith('/');
  if (leer) inhalt = inhalt.slice(0, -1);
  const k = liesTag(inhalt);
  if (++st.elemente > st.g.elemente) throw new XmlFehler('Das XML hat zu viele Elemente');
  if (st.stapel.length) st.stapel[st.stapel.length - 1].k.kinder.push(k.knoten);
  else if (st.wurzel) throw new XmlFehler('Mehr als ein Wurzelelement');
  else st.wurzel = k.knoten;
  if (!leer) {
    st.stapel.push({ q: k.q, k: k.knoten, text: [] });
    if (st.stapel.length > st.g.tiefe) throw new XmlFehler('Das XML ist zu tief verschachtelt');
  }
  return j + 1;
}

/** Name und Attribute eines Start-Tags (ohne „<“, „>“ und „/“). */
function liesTag(inhalt: string): { q: string; knoten: XmlKnoten } {
  const ende = inhalt.search(/\s/);
  const q = ende < 0 ? inhalt : inhalt.slice(0, ende);
  if (!NAME.test(q)) throw new XmlFehler('Ungültiger Elementname');
  const attr: Record<string, string> = Object.create(null) as Record<string, string>;
  let i = ende < 0 ? inhalt.length : ende;
  while (i < inhalt.length) {
    while (i < inhalt.length && /\s/.test(inhalt[i])) i++;
    if (i >= inhalt.length) break;
    const gl = inhalt.indexOf('=', i);
    if (gl < 0) throw new XmlFehler('Attribut ohne Wert');
    const name = inhalt.slice(i, gl).trim();
    if (!NAME.test(name)) throw new XmlFehler('Ungültiger Attributname');
    let a = gl + 1;
    while (a < inhalt.length && /\s/.test(inhalt[a])) a++;
    const quote = inhalt[a];
    if (quote !== '"' && quote !== "'") throw new XmlFehler('Attributwert ohne Anführungszeichen');
    const e = inhalt.indexOf(quote, a + 1);
    if (e < 0) throw new XmlFehler('Attributwert ohne Ende');
    attr[lokal(name)] = entschluessle(inhalt.slice(a + 1, e));
    i = e + 1;
  }
  return { q, knoten: { name: lokal(q), attr, kinder: [], text: '' } };
}

/* ---------- Pfade ---------- */

/** Erstes Kind mit diesem lokalen Namen. */
export const kind = (k: XmlKnoten | undefined, name: string): XmlKnoten | undefined => k?.kinder.find((x) => x.name === name);
/** Alle Kinder mit diesem lokalen Namen. */
export const kinder = (k: XmlKnoten | undefined, name: string): XmlKnoten[] => k?.kinder.filter((x) => x.name === name) ?? [];
/** Knoten über einen Pfad lokaler Namen („A/B/C“), je Schritt das erste Kind. */
export function pfad(k: XmlKnoten | undefined, p: string): XmlKnoten | undefined {
  let x = k;
  for (const n of p.split('/')) { x = kind(x, n); if (!x) return undefined; }
  return x;
}
/** Text am Pfad; '' wenn es ihn nicht gibt. */
export const textAm = (k: XmlKnoten | undefined, p: string): string => pfad(k, p)?.text ?? '';
