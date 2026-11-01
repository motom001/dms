/**
 * Dokumente schwärzen (#392): Suchbegriffe und Muster in den Wörtern einer Seite finden und daraus
 * Bereiche machen – gemeinsam für Server (API, Ergebnis) und Oberfläche (Vorschau, Vorschläge), ohne
 * Netz. Koordinaten sind relativ zur angezeigten Seite (0…1, Ursprung oben links), so wie man sie sieht.
 * Das eigentliche Schwärzen (neu rendern, Textebene ohne die Stellen) steht in server/src/schwaerzen.ts.
 */

/** Ein Wort mit Lage: [Text, x, y, Breite, Höhe] (relativ). Als Tupel, weil es viele sind. */
export type Wort = [string, number, number, number, number];
/** Eine Seite: Größe in pt (wie angezeigt, also gedreht) und ihre Wörter in Lesereihenfolge. */
export interface SchwaerzSeite { breite: number; hoehe: number; woerter: Wort[] }
/** Ein schwarzer Bereich: Seite ab 1, Lage relativ. */
export interface Bereich { seite: number; x: number; y: number; b: number; h: number }

/** Muster für Vorschläge (offline, nur reguläre Ausdrücke und Prüfziffern). */
export const MUSTER = {
  iban: 'IBAN',
  steuerid: 'Steuer-Id',
  geburtsdatum: 'Geburtsdatum',
  email: 'E-Mail',
  telefon: 'Telefon',
} as const;
export type Musterart = keyof typeof MUSTER;
export const MUSTER_LISTE = Object.keys(MUSTER) as Musterart[];
export const istMuster = (s: unknown): s is Musterart => typeof s === 'string' && Object.hasOwn(MUSTER, s);

/** Grenzen der Eingabe. */
export const BEREICHE_MAX = 5000;
export const BEGRIFFE_MAX = 50;
export const BEGRIFF_MAX_LAENGE = 200;
/** So viele Seiten lassen sich auf einmal schwärzen (jede Seite wird neu gerendert). */
export const SCHWAERZEN_MAX_SEITEN = 300;
/** Dateitypen, die sich schwärzen lassen. */
export const SCHWAERZBAR = ['application/pdf', 'image/jpeg', 'image/png'] as const;
export const kannSchwaerzen = (mime: string) => (SCHWAERZBAR as readonly string[]).includes(mime);

/** „Kontoauszug.pdf“ → „Kontoauszug (geschwärzt).pdf“ */
export function geschwaerztName(name: string): string {
  const p = name.lastIndexOf('.');
  return p > 0 ? `${name.slice(0, p)} (geschwärzt)${name.slice(p)}` : `${name} (geschwärzt)`;
}

/** Ein Treffer: Seite, gefundener Text (nur für die Anzeige in der Oberfläche) und die Wörter. */
export interface Fund { seite: number; text: string; woerter: number[]; art: Musterart | 'begriff' }

/* ---------- Text einer Seite mit Zuordnung Zeichen → Wort ---------- */

const norm = (s: string) => s.normalize('NFKC').toLocaleLowerCase('de-DE');

interface Seitentext { text: string; wortVon: Int32Array }
/** Wörter mit Leerzeichen verbunden (`kompakt`: ohne Leerraum), dazu je Zeichen das Wort. */
function seitentext(woerter: Wort[], kompakt: boolean): Seitentext {
  let text = '';
  const idx: number[] = [];
  woerter.forEach((w, i) => {
    let t = norm(w[0]);
    if (kompakt) t = t.replace(/\s+/g, '');
    if (!t) return;
    if (!kompakt && text) { text += ' '; idx.push(-1); }
    text += t;
    for (let k = 0; k < t.length; k++) idx.push(i);
  });
  return { text, wortVon: Int32Array.from(idx) };
}

/** Wörter, die der Ausschnitt [von, bis) berührt. */
function woerterIn(s: Seitentext, von: number, bis: number): number[] {
  const r = new Set<number>();
  for (let k = von; k < bis; k++) if (s.wortVon[k] >= 0) r.add(s.wortVon[k]);
  return [...r].sort((a, b) => a - b);
}

const schluessel = (f: Fund) => `${f.seite}:${f.woerter.join(',')}`;

/**
 * Alle Stellen eines Suchbegriffs (ohne Groß-/Kleinschreibung, auch über mehrere Wörter). Ist der Begriff
 * mindestens 4 Zeichen lang, zählt er auch ohne Leerraum – „DE89 3704“ findet „DE893704“ und umgekehrt.
 * Getroffen wird immer das ganze Wort (sicherer als ein halbes).
 */
export function findeBegriff(seiten: SchwaerzSeite[], begriff: string): Fund[] {
  const b = norm(begriff).replace(/\s+/g, ' ').trim();
  if (!b) return [];
  const bKompakt = b.replace(/\s+/g, '');
  const funde = new Map<string, Fund>();
  seiten.forEach((seite, i) => {
    const varianten: Array<[Seitentext, string]> = [[seitentext(seite.woerter, false), b]];
    if (bKompakt.length >= 4) varianten.push([seitentext(seite.woerter, true), bKompakt]);
    for (const [s, such] of varianten) {
      for (let pos = s.text.indexOf(such); pos >= 0; pos = s.text.indexOf(such, pos + 1)) {
        const w = woerterIn(s, pos, pos + such.length);
        if (!w.length) continue;
        const f: Fund = { seite: i + 1, text: w.map((k) => seite.woerter[k][0]).join(' '), woerter: w, art: 'begriff' };
        funde.set(schluessel(f), f);
      }
    }
  });
  return [...funde.values()];
}

/* ---------- Muster ---------- */

/** IBAN-Prüfsumme (ISO 13616, mod 97). */
export function ibanGueltig(roh: string): boolean {
  const s = roh.replace(/\s+/g, '').toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(s)) return false;
  const um = (s.slice(4) + s.slice(0, 4)).replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  let rest = 0;
  for (const z of um) rest = (rest * 10 + Number(z)) % 97;
  return rest === 1;
}

/** Steuerliche Identifikationsnummer: 11 Ziffern, erste nicht 0, Prüfziffer nach ISO 7064 (Mod 11, 10). */
export function steuerIdGueltig(roh: string): boolean {
  const s = roh.replace(/[\s/]+/g, '');
  if (!/^[1-9]\d{10}$/.test(s)) return false;
  let p = 10;
  for (let i = 0; i < 10; i++) {
    let summe = (Number(s[i]) + p) % 10;
    if (summe === 0) summe = 10;
    p = (summe * 2) % 11;
  }
  const pruef = (11 - p) % 10;
  return pruef === Number(s[10]);
}

interface Regel {
  art: Musterart; re: RegExp; gruppe?: number;
  gueltig?: (treffer: string) => boolean;
  /** Der längste gültige Anfang des Treffers (z. B. IBAN, auf die noch ein Wort folgt); null = keiner. */
  kuerze?: (treffer: string) => string | null;
}

/** IBAN: der Ausdruck nimmt gierig auch folgende Wörter mit – so lange kürzen, bis die Prüfsumme stimmt. */
function ibanAnfang(t: string): string | null {
  for (let n = t.length; n >= 15; n--) {
    const teil = t.slice(0, n);
    // Nur an Wortgrenzen kürzen.
    if (/\s$/.test(teil) || (n < t.length && !/\s/.test(t[n]))) continue;
    if (ibanGueltig(teil)) return teil;
  }
  return null;
}

const REGELN: Regel[] = [
  { art: 'iban', re: /\b[a-z]{2}\d{2}(?: ?[a-z0-9]){11,30}\b/g, kuerze: ibanAnfang },
  { art: 'steuerid', re: /(?<![\d])[1-9]\d(?:[ /]?\d){9}(?![\d])/g, gueltig: (t) => steuerIdGueltig(t) },
  // Ein Datum mit „geb.“, „geboren“, „Geburtsdatum“ o. Ä. kurz davor.
  {
    art: 'geburtsdatum', re: /(geb(?:\.|oren|urtsdatum|urtstag|\b)[^\d\n]{0,25}?)(\d{1,2}\. ?\d{1,2}\. ?(?:19|20)?\d{2}|\d{4}-\d{2}-\d{2}|\d{1,2}\. ?(?:januar|februar|märz|april|mai|juni|juli|august|september|oktober|november|dezember) ?\d{4})/g,
    gruppe: 2,
  },
  { art: 'email', re: /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/g },
  {
    art: 'telefon',
    re: /(?<![\w+])(?:\+|00)\d{1,3}[ /-]?(?:\(0\)[ ]?)?\d{2,5}(?:[ /-]?\d{2,}){1,4}|(?<![\w.,])0\d{2,5}(?: ?[/-] ?| )?\d{3,}(?:[ -]\d{2,})*(?![\w.,]\d)/g,
    gueltig: (t) => { const n = t.replace(/\D/g, '').length; return n >= 7 && n <= 15 && !/^\d{1,2}\.\d{1,2}\./.test(t); },
  },
];

/** Vorschläge: Stellen, die wie IBAN, Steuer-Id, Geburtsdatum, E-Mail oder Telefonnummer aussehen. */
export function findeMuster(seiten: SchwaerzSeite[], arten: readonly Musterart[] = MUSTER_LISTE): Fund[] {
  const funde = new Map<string, Fund>();
  seiten.forEach((seite, i) => {
    const s = seitentext(seite.woerter, false);
    for (const r of REGELN) {
      if (!arten.includes(r.art)) continue;
      r.re.lastIndex = 0;
      for (let m = r.re.exec(s.text); m; m = r.re.exec(s.text)) {
        let teil = r.gruppe ? m[r.gruppe] : m[0];
        const pos = r.gruppe ? m.index + m[0].length - teil.length : m.index;
        if (r.kuerze) {
          const k = r.kuerze(teil);
          if (!k) continue;
          teil = k;
          r.re.lastIndex = pos + k.length;
        }
        if (r.gueltig && !r.gueltig(teil)) continue;
        const w = woerterIn(s, pos, pos + teil.length);
        if (!w.length) continue;
        const f: Fund = { seite: i + 1, text: w.map((k) => seite.woerter[k][0]).join(' '), woerter: w, art: r.art };
        // Was schon als IBAN gilt, ist keine Telefonnummer.
        if (![...funde.values()].some((g) => g.seite === f.seite && g.woerter.some((x) => w.includes(x)))) funde.set(schluessel(f), f);
      }
    }
  });
  return [...funde.values()].sort((a, b) => a.seite - b.seite || a.woerter[0] - b.woerter[0]);
}

/* ---------- Bereiche ---------- */

/**
 * Bereiche für Funde: die Wörter einer Zeile werden zu einem Kasten zusammengefasst, mit etwas Rand
 * (1 pt und 15 % der Zeilenhöhe), damit keine Ober- und Unterlängen stehen bleiben.
 */
export function bereicheVon(seiten: SchwaerzSeite[], funde: Fund[]): Bereich[] {
  const r: Bereich[] = [];
  for (const f of funde) {
    const seite = seiten[f.seite - 1];
    if (!seite) continue;
    let aktuell: Bereich | null = null;
    for (const k of f.woerter) {
      const [, x, y, b, h] = seite.woerter[k];
      const neu = mitRand({ seite: f.seite, x, y, b, h }, seite);
      if (aktuell && gleicheZeile(aktuell, neu)) {
        const x1 = Math.min(aktuell.x, neu.x), y1 = Math.min(aktuell.y, neu.y);
        const x2 = Math.max(aktuell.x + aktuell.b, neu.x + neu.b), y2 = Math.max(aktuell.y + aktuell.h, neu.y + neu.h);
        aktuell = { seite: f.seite, x: x1, y: y1, b: x2 - x1, h: y2 - y1 };
      } else {
        if (aktuell) r.push(aktuell);
        aktuell = neu;
      }
    }
    if (aktuell) r.push(aktuell);
  }
  return r;
}

const gleicheZeile = (a: Bereich, b: Bereich) => {
  const oben = Math.max(a.y, b.y), unten = Math.min(a.y + a.h, b.y + b.h);
  return unten - oben > 0.5 * Math.min(a.h, b.h) && b.x - (a.x + a.b) < 3 * Math.max(a.h, b.h);
};

/** Ein Wortkasten mit Rand, auf die Seite begrenzt. */
export function mitRand(w: Bereich, seite: { breite: number; hoehe: number }): Bereich {
  // Zeilenhöhe: bei senkrechten Wörtern (gedrehte Seiten) die Breite.
  const hPt = Math.min(w.h * seite.hoehe, w.b * seite.breite);
  const rand = 1 + 0.15 * hPt;
  const rx = rand / seite.breite, ry = rand / seite.hoehe;
  return begrenzt({ seite: w.seite, x: w.x - rx, y: w.y - ry, b: w.b + 2 * rx, h: w.h + 2 * ry });
}

const rund = (v: number) => Math.round(v * 1e5) / 1e5;
function begrenzt(a: Bereich): Bereich {
  const x = Math.max(0, a.x), y = Math.max(0, a.y);
  return { seite: a.seite, x: rund(x), y: rund(y), b: rund(Math.min(1, a.x + a.b) - x), h: rund(Math.min(1, a.y + a.h) - y) };
}

/** Berührt das Wort den Bereich? (Schon eine kleine Überschneidung genügt – lieber ein Wort zu viel weg.) */
export function wortIn(w: Wort, a: Bereich): boolean {
  const [, x, y, b, h] = w;
  return x < a.x + a.b && x + b > a.x && y < a.y + a.h && y + h > a.y;
}

/** Eingabe prüfen: Seite ab 1, Koordinaten in 0…1; zu kleine Bereiche (unter 0,1 %) zählen nicht. */
export function pruefeBereiche(roh: unknown, anzahlSeiten: number): Bereich[] {
  if (roh === undefined || roh === null) return [];
  if (!Array.isArray(roh)) throw new Error('bereiche: eine Liste von { seite, x, y, b, h }.');
  if (roh.length > BEREICHE_MAX) throw new Error(`Höchstens ${BEREICHE_MAX} Bereiche.`);
  const r: Bereich[] = [];
  roh.forEach((x, i) => {
    const o = (x ?? {}) as Record<string, unknown>;
    const seite = Number(o.seite);
    if (!Number.isInteger(seite) || seite < 1 || seite > anzahlSeiten) throw new Error(`Bereich ${i + 1}: Die Seite ${String(o.seite)} gibt es nicht (das Dokument hat ${anzahlSeiten} ${anzahlSeiten === 1 ? 'Seite' : 'Seiten'}).`);
    const z = ['x', 'y', 'b', 'h'].map((k) => Number(o[k]));
    if (z.some((v) => !Number.isFinite(v))) throw new Error(`Bereich ${i + 1}: x, y, b und h müssen Zahlen sein (relativ, 0 bis 1).`);
    const [bx, by, bb, bh] = z;
    if (bx < -0.01 || by < -0.01 || bx > 1 || by > 1 || bb <= 0 || bh <= 0 || bb > 1.01 || bh > 1.01) throw new Error(`Bereich ${i + 1}: x, y, b und h sind relativ zur Seite (0 bis 1, Breite und Höhe größer 0).`);
    const a = begrenzt({ seite, x: bx, y: by, b: bb, h: bh });
    if (a.b * a.h >= 1e-6) r.push(a);
  });
  return r;
}

/** Begriffe prüfen: Text, nicht leer, begrenzt. */
export function pruefeBegriffe(roh: unknown): string[] {
  if (roh === undefined || roh === null) return [];
  const liste = typeof roh === 'string' ? [roh] : roh;
  if (!Array.isArray(liste)) throw new Error('begriffe: eine Liste von Suchbegriffen.');
  if (liste.length > BEGRIFFE_MAX) throw new Error(`Höchstens ${BEGRIFFE_MAX} Suchbegriffe.`);
  return [...new Set(liste.map((b) => String(b ?? '').trim()).filter(Boolean))].map((b) => {
    if (b.length > BEGRIFF_MAX_LAENGE) throw new Error(`Ein Suchbegriff darf höchstens ${BEGRIFF_MAX_LAENGE} Zeichen lang sein.`);
    return b;
  });
}

/** „3 Stellen auf 2 Seiten“ */
export function stellenText(bereiche: Bereich[]): string {
  const n = bereiche.length, s = new Set(bereiche.map((b) => b.seite)).size;
  return `${n} ${n === 1 ? 'Stelle' : 'Stellen'} auf ${s} ${s === 1 ? 'Seite' : 'Seiten'}`;
}
