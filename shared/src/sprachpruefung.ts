/**
 * Prüfung der Sprachdateien (#473) – läuft in der CI über `shared/test/sprachdateien.test.ts`.
 *
 * Findet: Schlüssel, die der Code benutzt, die es aber nicht gibt; Schlüssel, die niemand benutzt;
 * Sprachen, deren Datei Schlüssel auslässt oder zusätzliche hat; Platzhalter, die zwischen den
 * Sprachen nicht übereinstimmen; Mehrzahl ohne `_other`; ungültige Schlüssel und leere Texte.
 * Reine Funktion – die Dateien liest der Test.
 */
import { AUSGANGSSPRACHE, MEHRZAHLFORMEN, ohneMehrzahl, platzhalter } from './sprache';

/** Sprache → Bereich → Schlüssel → Text. */
export type Sprachstand = Record<string, Record<string, Record<string, unknown>>>;
export interface Quelltext {
  datei: string;
  text: string;
}

/**
 * Bereiche mit eigener Zugriffsfunktion, deren Schlüssel im Code ohne Bereich stehen:
 * `dritte` sind die Texte für Dritte (#474, `textDritte(anrede, 'abruf.titel')` in `anrede.ts`).
 */
export const BEREICHE_DIREKT: ReadonlySet<string> = new Set(['dritte']);

const SCHLUESSEL = new RegExp(`^[a-z0-9]+(?:[.-][A-Za-z0-9]+)*(?:_(?:${MEHRZAHLFORMEN.join('|')}))?$`);
const BEREICHNAME = /^[a-z][a-z0-9-]*$/;

/** Grundschlüssel einer Datei → Platzhalter aller Formen zusammen. */
function grundschluessel(datei: Record<string, unknown>): Map<string, string[]> {
  const m = new Map<string, Set<string>>();
  for (const [k, v] of Object.entries(datei)) {
    const g = ohneMehrzahl(k);
    const s = m.get(g) ?? new Set<string>();
    if (typeof v === 'string') for (const p of platzhalter(v)) s.add(p);
    m.set(g, s);
  }
  return new Map([...m].map(([k, s]) => [k, [...s].sort()]));
}

/** Schlüssel, die der Code ausdrücklich abruft: `t('bereich.schluessel'` bzw. `t.frei('…'`. */
const AUFRUF = /\b(?:t|tDe)(?:\.frei)?\(\s*(['"`])([a-z0-9-]+\.[^'"`$]+)\1/g;
/** Aufruf mit Werten: `t('bereich.schluessel', {` bzw. `tn(…, {` – die Werte prüft `werteImAufruf`. */
const MIT_WERTEN = /\b(?:t|tn|tDe)\(\s*'([a-z0-9-]+\.[^'$]+)'\s*,\s*\{/g;

/**
 * Namen der Werte in einem Objekt-Literal ab `start` (Position der öffnenden Klammer): `{ name, wert: x }` →
 * [name, wert]; `null`, wenn das Objekt `...` enthält (dann ist die Prüfung nicht möglich).
 */
export function werteImAufruf(text: string, start: number): string[] | null {
  let tiefe = 0,
    i = start,
    teil = '';
  const teile: string[] = [];
  let zeichen: string | null = null;
  for (; i < text.length; i++) {
    const c = text[i];
    if (zeichen) {
      if (c === '\\') {
        i++;
        continue;
      }
      if (c === zeichen) zeichen = null;
      if (tiefe === 1) teil += c;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      zeichen = c;
      if (tiefe === 1) teil += c;
      continue;
    }
    if (c === '{' || c === '(' || c === '[') {
      tiefe++;
      if (tiefe === 1) continue;
    }
    if (c === '}' || c === ')' || c === ']') {
      tiefe--;
      if (tiefe === 0) break;
    }
    if (tiefe === 1 && c === ',') {
      teile.push(teil);
      teil = '';
      continue;
    }
    if (tiefe >= 1) teil += c;
  }
  teile.push(teil);
  const namen: string[] = [];
  for (const t of teile.map((x) => x.trim()).filter(Boolean)) {
    if (t.startsWith('...')) return null;
    const m = /^([A-Za-z0-9_$]+)\s*(:|$)/.exec(t);
    if (m) namen.push(m[1]);
  }
  return namen;
}

/** Alle Zeichenketten, die wie ein Schlüssel aussehen. */
const ZEICHENKETTE = /(['"`])([a-z0-9-]+(?:\.[A-Za-z0-9-]+)+)\1/g;
/** Zusammengesetzte Schlüssel: `` `werkbank.gruppe.${g}` `` → Anfang `werkbank.gruppe.` */
const VORLAGE = /`([a-z0-9-]+\.[A-Za-z0-9.-]*)\$\{/g;

export function pruefeSprachdateien(stand: Sprachstand, code: Quelltext[]): string[] {
  const maengel: string[] = [];
  const ausgang = stand[AUSGANGSSPRACHE];
  if (!ausgang) return [`Ausgangssprache „${AUSGANGSSPRACHE}“ fehlt.`];

  // 1. Aufbau jeder Datei
  for (const [spr, bereiche] of Object.entries(stand)) {
    for (const [bereich, datei] of Object.entries(bereiche)) {
      const ort = `${spr}/${bereich}.json`;
      if (!BEREICHNAME.test(bereich)) maengel.push(`${ort}: ungültiger Name des Bereichs (klein, ohne Punkt).`);
      for (const [k, v] of Object.entries(datei)) {
        if (!SCHLUESSEL.test(k)) maengel.push(`${ort}: ungültiger Schlüssel „${k}“ (klein beginnen, Teile mit Punkt).`);
        if (typeof v !== 'string' || !v.trim()) maengel.push(`${ort}: „${k}“ ist kein Text oder leer.`);
        const g = ohneMehrzahl(k);
        if (g !== k && !(`${g}_other` in datei)) maengel.push(`${ort}: „${g}“ hat Mehrzahlformen, aber kein „${g}_other“.`);
      }
    }
  }

  // 2. Andere Sprachen gegen die Ausgangssprache: gleiche Schlüssel, gleiche Platzhalter
  for (const [spr, bereiche] of Object.entries(stand)) {
    if (spr === AUSGANGSSPRACHE) continue;
    for (const [bereich, datei] of Object.entries(bereiche)) {
      const ort = `${spr}/${bereich}.json`;
      const soll = ausgang[bereich];
      if (!soll) {
        maengel.push(`${ort}: Bereich gibt es in „${AUSGANGSSPRACHE}“ nicht.`);
        continue;
      }
      const a = grundschluessel(soll),
        b = grundschluessel(datei);
      for (const k of a.keys()) if (!b.has(k)) maengel.push(`${ort}: Schlüssel „${k}“ fehlt.`);
      for (const [k, p] of b) {
        if (!a.has(k)) {
          maengel.push(`${ort}: Schlüssel „${k}“ gibt es in „${AUSGANGSSPRACHE}“ nicht.`);
          continue;
        }
        if (p.join() !== a.get(k)!.join())
          maengel.push(`${ort}: „${k}“ hat die Platzhalter {${p.join('} {')}}, in „${AUSGANGSSPRACHE}“ {${a.get(k)!.join('} {')}}.`);
      }
    }
  }

  // 3. Code gegen die Ausgangssprache
  const vorhanden = new Map<string, Set<string>>();
  for (const [bereich, datei] of Object.entries(ausgang)) vorhanden.set(bereich, new Set(Object.keys(datei).map(ohneMehrzahl)));
  const gibt = (voll: string) => {
    const i = voll.indexOf('.');
    return !!vorhanden.get(voll.slice(0, i))?.has(voll.slice(i + 1));
  };
  const literale = new Set<string>();
  const anfaenge: string[] = [];
  for (const q of code) {
    for (const m of q.text.matchAll(AUFRUF)) {
      const voll = m[2];
      const bereich = voll.slice(0, voll.indexOf('.'));
      if (vorhanden.has(bereich) && !BEREICHE_DIREKT.has(bereich) && !gibt(voll)) {
        const zeile = q.text.slice(0, m.index).split('\n').length;
        maengel.push(`${q.datei}:${zeile}: Schlüssel „${voll}“ fehlt in ${AUSGANGSSPRACHE}/${bereich}.json.`);
      }
    }
    // Platzhalter (#727): Was der Text braucht, muss der Aufruf liefern.
    for (const m of q.text.matchAll(MIT_WERTEN)) {
      const voll = m[1];
      const i = voll.indexOf('.');
      const datei = ausgang[voll.slice(0, i)];
      if (!datei || BEREICHE_DIREKT.has(voll.slice(0, i))) continue;
      const k = voll.slice(i + 1);
      const texte = Object.entries(datei)
        .filter(([x]) => x === k || ohneMehrzahl(x) === k)
        .map(([, v]) => String(v));
      if (!texte.length) continue;
      const werte = werteImAufruf(q.text, m.index! + m[0].length - 1);
      if (!werte) continue;
      const fehlt = [...new Set(texte.flatMap(platzhalter))].filter(
        (p) => !werte.includes(p) && !(p === 'anzahl' && werte.includes('anzahl')),
      );
      if (fehlt.length) {
        const zeile = q.text.slice(0, m.index).split('\n').length;
        maengel.push(
          `${q.datei}:${zeile}: „${voll}“ braucht {${fehlt.join('} {')}}, der Aufruf liefert ${werte.length ? `nur {${werte.join('} {')}}` : 'keine Werte'}.`,
        );
      }
    }
    for (const m of q.text.matchAll(ZEICHENKETTE)) literale.add(m[2]);
    for (const m of q.text.matchAll(VORLAGE)) anfaenge.push(m[1]);
  }

  // 4. Ungenutzte Schlüssel der Ausgangssprache
  for (const [bereich, schluessel] of vorhanden) {
    for (const k of schluessel) {
      const voll = BEREICHE_DIREKT.has(bereich) ? k : `${bereich}.${k}`;
      if (literale.has(voll) || anfaenge.some((a) => voll.startsWith(a))) continue;
      maengel.push(`${AUSGANGSSPRACHE}/${bereich}.json: Schlüssel „${k}“ wird nirgends benutzt.`);
    }
  }
  return maengel;
}
