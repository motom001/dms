/**
 * Meldungen der Werkbank-Übersicht (#816): nach Schwere sortiert, Warnungen und Hinweise bewusst akzeptieren.
 *
 * - Schwere: `schlecht` (rot, kritisch) → `warn` (gelb) → `info` (Hinweis). Innerhalb einer Stufe die neueren
 *   zuerst (Meldungen mit Datum), danach die ohne Datum in fester Reihenfolge.
 * - Rote Meldungen lassen sich nicht akzeptieren – sie müssen erledigt werden.
 * - Eine akzeptierte Meldung steht unten unter „Bewusst akzeptiert“. Sie erscheint wieder oben, wenn sie schwerer
 *   wird (z. B. aus gelb wird rot) oder wenn sie verschwunden war (behoben) und dieselbe Ursache erneut auftritt:
 *   Dann ist die Akzeptanz aufgehoben (`aufheben`), die Übersicht meldet das dem Server.
 */

export type Schwere = 'schlecht' | 'warn' | 'info';
export const SCHWERE_REIHENFOLGE: readonly Schwere[] = ['schlecht', 'warn', 'info'];
const rang = (s: Schwere) => SCHWERE_REIHENFOLGE.indexOf(s);

/** Welche Meldungen sich akzeptieren lassen: gelbe Warnungen und Hinweise, nie rote. */
export const akzeptierbar = (s: Schwere) => s !== 'schlecht';

/** Fester Schlüssel einer Meldungsart, z. B. `mail`, `sicherung.volume` oder `postfach.abgelaufen:<id>`. */
export const MELDUNG_SCHLUESSEL = /^[a-z0-9][a-z0-9._-]{0,60}(?::[A-Za-z0-9._-]{1,80})?$/;

/** Gespeichert je akzeptierter Meldung (Einstellung `uebersicht_akzeptiert`). */
export interface Akzeptanz {
  art: Schwere;
  von: string;
  am: string;
  grund?: string;
}
export type Akzeptiert = Record<string, Akzeptanz>;

/** Höchstlänge der Begründung. */
export const GRUND_MAX = 300;

export interface Meldung {
  schluessel: string;
  art: Schwere;
  datum?: string | null;
}

export interface Geordnet<M extends Meldung> {
  /** Was oben steht, nach Schwere sortiert. */
  offen: M[];
  /** Unten im eingeklappten Abschnitt „Bewusst akzeptiert“. */
  akzeptiert: Array<M & { akzeptanz: Akzeptanz }>;
  /** Akzeptanzen, die nicht mehr gelten: Meldung behoben (`erledigt`) oder schwerer geworden (`schwerer`). */
  aufheben: Array<{ schluessel: string; anlass: 'erledigt' | 'schwerer' }>;
}

/** Nach Schwere, innerhalb einer Stufe neuere zuerst; ohne Datum bleibt die Reihenfolge, wie sie kam. */
export function nachSchwere<M extends Meldung>(liste: M[]): M[] {
  return liste
    .map((m, i) => ({ m, i }))
    .sort((a, b) => {
      const s = rang(a.m.art) - rang(b.m.art);
      if (s) return s;
      const da = a.m.datum ? Date.parse(a.m.datum) : NaN,
        db = b.m.datum ? Date.parse(b.m.datum) : NaN;
      if (!Number.isNaN(da) && !Number.isNaN(db) && da !== db) return db - da;
      if (!Number.isNaN(da) !== !Number.isNaN(db)) return Number.isNaN(da) ? 1 : -1;
      return a.i - b.i;
    })
    .map((x) => x.m);
}

/** Teilt die aktuellen Meldungen in „offen“ und „bewusst akzeptiert“ und nennt Akzeptanzen, die nicht mehr gelten. */
export function ordneMeldungen<M extends Meldung>(liste: M[], akzeptiert: Akzeptiert): Geordnet<M> {
  const offen: M[] = [];
  const angenommen: Array<M & { akzeptanz: Akzeptanz }> = [];
  const aufheben: Geordnet<M>['aufheben'] = [];
  const da = new Set<string>();
  for (const m of liste) {
    da.add(m.schluessel);
    const a = akzeptiert[m.schluessel];
    if (!a) {
      offen.push(m);
      continue;
    }
    if (!akzeptierbar(m.art) || rang(m.art) < rang(a.art)) {
      offen.push(m);
      aufheben.push({ schluessel: m.schluessel, anlass: 'schwerer' });
      continue;
    }
    angenommen.push({ ...m, akzeptanz: a });
  }
  for (const k of Object.keys(akzeptiert)) if (!da.has(k)) aufheben.push({ schluessel: k, anlass: 'erledigt' });
  return { offen: nachSchwere(offen), akzeptiert: nachSchwere(angenommen), aufheben };
}

/** Prüft die Eingabe für „Zur Kenntnis genommen“; liefert den Fehlertext oder null. */
export function pruefeAkzeptanz(e: { schluessel?: unknown; art?: unknown; grund?: unknown }): string | null {
  if (typeof e.schluessel !== 'string' || !MELDUNG_SCHLUESSEL.test(e.schluessel)) return 'ungueltig';
  if (e.art !== 'schlecht' && e.art !== 'warn' && e.art !== 'info') return 'ungueltig';
  if (!akzeptierbar(e.art)) return 'rot';
  if (e.grund !== undefined && e.grund !== null && (typeof e.grund !== 'string' || e.grund.length > GRUND_MAX)) return 'grund';
  return null;
}
