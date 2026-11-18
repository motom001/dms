/**
 * Ablauf des Lasttests als Tabelle (#1251): Das Skript (server/test/lasttest.mjs) meldet zu Beginn den Plan – je Stufe
 * die Schritte und Durchgänge in der Reihenfolge, in der sie laufen. Der Lasttest-Modus (server/src/lasttest/
 * lasttestmodus.ts) führt hier mit jeder Meldung den Zustand nach: offen (grau) → läuft (mit Fortschritt) → erledigt
 * (✓ mit Dauer und Werten) oder „nicht nötig“ (übersprungene Schritte, bei groß die Durchgänge über der Grenze).
 * Die Seite (web/src/lasttestseite/ablauf.tsx) zeigt nur, was hier steht – keine zweite Logik.
 */
import type { LasttestSchritt, LasttestStand, LasttestStufe } from './lasttest';

/** Was ein Durchgang misst: lesen wie im Alltag, mit Speichern, Pakete und Tabellen, Anmeldeschutz, Überlast (groß). */
type AblaufModus = 'lesen' | 'speichern' | 'pakete' | 'anmeldeschutz' | 'ueberlast';
const MODI: readonly AblaufModus[] = ['lesen', 'speichern', 'pakete', 'anmeldeschutz', 'ueberlast'];
/** Schritte, die als eigene Zeile erscheinen (ohne „start“ und „messen“ – messen sind die Durchgänge). */
const ZEILEN_SCHRITTE: readonly LasttestSchritt[] = [
  'pruefen',
  'einrichten',
  'demo',
  'hintergrund',
  'vorbereiten',
  'aufraeumen',
  'auswerten',
];
const STUFEN: readonly LasttestStufe[] = ['klein', 'mittel', 'gross', 'extrem'];

type PlanZeile =
  /** `optional`: läuft nicht immer (Einrichten nur frisch, Mappen anlegen nur, wenn welche fehlen). */
  | { art: 'schritt'; schritt: LasttestSchritt; optional?: boolean }
  /**
   * `ziel`: Der Durchgang hat ein Ziel (✓/✗); `grenze`: Schritt beim Suchen der Belastungsgrenze – wie viele davon
   * laufen, steht vorher nicht fest. `dauerS`: geplante Dauer.
   */
  | { art: 'durchgang'; name: string; n: number; modus: AblaufModus; ziel: boolean; grenze?: boolean; dauerS: number };

export type ZeilenZustand = 'offen' | 'laeuft' | 'erledigt' | 'nicht-noetig';

interface AblaufWerte {
  p50: number | null;
  p95: number | null;
  jeSekunde: number | null;
  fehlerquote: number;
}

export type AblaufZeile = PlanZeile & {
  zustand: ZeilenZustand;
  /** Uhr des Servers (ms). */
  beginn: number | null;
  ende: number | null;
  werte?: AblaufWerte;
  /** Ziel erreicht – nur bei Durchgängen mit Ziel, sobald das Skript es meldet. */
  erreicht?: boolean;
};

export interface LasttestAblauf {
  stufen: Array<{ stufe: LasttestStufe; zeilen: AblaufZeile[] }>;
  /** Laufende Stufe (Index in `stufen`), -1 vor der ersten. */
  aktuell: number;
}

export type AblaufMeldung =
  | { art: 'stufe'; stufe: LasttestStufe }
  | { art: 'schritt'; schritt: LasttestSchritt }
  /** `n`: tatsächliche Zahl gleichzeitig (bei groß „+ Speichern“ die an der Grenze, im Plan erst geschätzt). */
  | { art: 'durchgang'; name: string; n?: number }
  | ({ art: 'durchgang-fertig'; name: string } & Partial<AblaufWerte>)
  | { art: 'ziel'; name: string; erreicht: boolean }
  | { art: 'grenze' }
  | { art: 'ende'; fertig: boolean };

const ZEILEN_MAX = 200;
const zahl = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : null);

/** Eine Zeile des Plans prüfen und übernehmen; null, wenn sie nicht passt. */
function planZeile(z: Record<string, unknown> | null): AblaufZeile | null {
  const leer = { zustand: 'offen' as const, beginn: null, ende: null };
  if (z?.art === 'schritt' && ZEILEN_SCHRITTE.includes(z.schritt as LasttestSchritt))
    return { art: 'schritt', schritt: z.schritt as LasttestSchritt, ...(z.optional === true ? { optional: true } : {}), ...leer };
  if (z?.art !== 'durchgang' || typeof z.name !== 'string' || !MODI.includes(z.modus as AblaufModus)) return null;
  return {
    art: 'durchgang',
    name: z.name.replace(/[\r\n\t]+/g, ' ').slice(0, 80),
    n: zahl(z.n) ?? 0,
    modus: z.modus as AblaufModus,
    ziel: z.ziel === true,
    ...(z.grenze === true ? { grenze: true } : {}),
    dauerS: zahl(z.dauerS) ?? 0,
    ...leer,
  };
}

/** Plan aus der Meldung des Skripts übernehmen – nur bekannte Felder, Namen gekürzt; null, wenn nichts Brauchbares kommt. */
export function ablaufAusPlan(roh: unknown): LasttestAblauf | null {
  if (!Array.isArray(roh)) return null;
  const stufen: LasttestAblauf['stufen'] = [];
  for (const st of roh.slice(0, STUFEN.length) as Array<{ stufe?: unknown; zeilen?: unknown }>) {
    if (!STUFEN.includes(st?.stufe as LasttestStufe) || !Array.isArray(st.zeilen)) continue;
    const zeilen = (st.zeilen.slice(0, ZEILEN_MAX) as Array<Record<string, unknown> | null>).map(planZeile).filter((z) => z !== null);
    stufen.push({ stufe: st.stufe as LasttestStufe, zeilen });
  }
  return stufen.length ? { stufen, aktuell: -1 } : null;
}

/** Laufende Zeile schließen. */
function schliesse(zeilen: AblaufZeile[], jetzt: number) {
  for (const z of zeilen)
    if (z.zustand === 'laeuft') {
      z.zustand = 'erledigt';
      z.ende ??= jetzt;
    }
}

/** Zeile `ziel` (ab der laufenden bzw. letzten erledigten) beginnen: offene davor sind übersprungen. */
function beginne(zeilen: AblaufZeile[], passt: (z: AblaufZeile) => boolean, jetzt: number): AblaufZeile | null {
  let ab = 0;
  zeilen.forEach((z, i) => {
    if (z.zustand !== 'offen') ab = i;
  });
  const i = zeilen.findIndex((z, j) => j >= ab && z.zustand === 'offen' && passt(z));
  if (i < 0) return null;
  schliesse(zeilen, jetzt);
  for (let j = ab; j < i; j++) if (zeilen[j].zustand === 'offen') zeilen[j].zustand = 'nicht-noetig';
  Object.assign(zeilen[i], { zustand: 'laeuft', beginn: jetzt, ende: null });
  return zeilen[i];
}

/** Neue Stufe: Was in früheren offen blieb, war nicht nötig (z. B. Einrichten nur in der ersten). */
function neueStufe(a: LasttestAblauf, stufe: LasttestStufe, jetzt: number) {
  const i = a.stufen.findIndex((s) => s.stufe === stufe);
  if (i < 0) return;
  for (const s of a.stufen.slice(0, i)) beende(s.zeilen, jetzt, true);
  a.aktuell = i;
}

/** Laufende Zeile schließen; `offenNichtNoetig`: übrige offene sind nicht nötig. */
function beende(zeilen: AblaufZeile[], jetzt: number, offenNichtNoetig: boolean) {
  schliesse(zeilen, jetzt);
  if (offenNichtNoetig) for (const z of zeilen) if (z.zustand === 'offen') z.zustand = 'nicht-noetig';
}

type InStufe = Exclude<AblaufMeldung, { art: 'stufe' } | { art: 'ende' }>;

/** Meldungen innerhalb der laufenden Stufe. */
const IN_STUFE: { [A in InStufe['art']]: (zeilen: AblaufZeile[], m: Extract<InStufe, { art: A }>, jetzt: number) => void } = {
  schritt: (zeilen, m, jetzt) => {
    // Wiederholt sich der laufende Schritt (z. B. zweimal „vorbereiten“ hintereinander), bleibt die Zeile.
    if (zeilen.some((z) => z.zustand === 'laeuft' && z.art === 'schritt' && z.schritt === m.schritt)) return;
    beginne(zeilen, (z) => z.art === 'schritt' && z.schritt === m.schritt, jetzt);
  },
  durchgang: (zeilen, m, jetzt) => {
    const z = beginne(zeilen, (x) => x.art === 'durchgang' && x.name === m.name, jetzt);
    if (z?.art === 'durchgang' && zahl(m.n) !== null) z.n = m.n!;
  },
  'durchgang-fertig': (zeilen, m, jetzt) => {
    const z = zeilen.find((x) => x.art === 'durchgang' && x.name === m.name && x.zustand === 'laeuft');
    if (!z) return;
    const werte = { p50: zahl(m.p50), p95: zahl(m.p95), jeSekunde: zahl(m.jeSekunde), fehlerquote: zahl(m.fehlerquote) ?? 0 };
    Object.assign(z, { zustand: 'erledigt', ende: jetzt, werte });
  },
  ziel: (zeilen, m) => {
    const z = [...zeilen].reverse().find((x) => x.art === 'durchgang' && x.name === m.name);
    if (z?.art === 'durchgang' && z.ziel) z.erreicht = m.erreicht === true;
  },
  grenze: (zeilen) => {
    for (const z of zeilen) if (z.art === 'durchgang' && z.grenze && z.zustand === 'offen') z.zustand = 'nicht-noetig';
  },
};

/** Eine Meldung des Skripts in den Ablauf übernehmen (ändert `a`). */
export function ablaufMelden(a: LasttestAblauf, m: AblaufMeldung, jetzt: number): void {
  if (m.art === 'stufe') return neueStufe(a, m.stufe, jetzt);
  if (m.art === 'ende') {
    for (const s of a.stufen) beende(s.zeilen, jetzt, m.fertig);
    return;
  }
  const zeilen = a.stufen[a.aktuell]?.zeilen;
  if (zeilen) (IN_STUFE[m.art] as (z: AblaufZeile[], x: InStufe, j: number) => void)(zeilen, m, jetzt);
}

/** Dauer einer Zeile bzw. Stufe in Sekunden (laufend bis `jetzt`); null, solange sie nicht begonnen hat. */
export function zeilenDauer(z: Pick<AblaufZeile, 'beginn' | 'ende'>, jetzt: number): number | null {
  return z.beginn === null ? null : Math.max(0, Math.round(((z.ende ?? jetzt) - z.beginn) / 1000));
}

/** Zustand einer Stufe aus ihren Zeilen. */
export function stufenZustand(zeilen: AblaufZeile[]): ZeilenZustand {
  if (zeilen.some((z) => z.zustand === 'laeuft')) return 'laeuft';
  if (zeilen.every((z) => z.zustand === 'offen')) return 'offen';
  if (zeilen.some((z) => z.zustand === 'offen')) return 'laeuft';
  return 'erledigt';
}

/** Beginn und Ende einer Stufe (Uhr des Servers). */
export function stufenZeit(zeilen: AblaufZeile[]): { beginn: number | null; ende: number | null } {
  const beginn = zeilen.map((z) => z.beginn).filter((x): x is number => x !== null);
  const ende = zeilen.map((z) => z.ende).filter((x): x is number => x !== null);
  return { beginn: beginn.length ? Math.min(...beginn) : null, ende: ende.length ? Math.max(...ende) : null };
}

/** Stand der Lasttest-Seite mit Ablauf (#1251); ohne Plan (älteres Skript) fehlt `ablauf`. */
export type LasttestStandMitAblauf = LasttestStand & { ablauf?: LasttestAblauf | null };
