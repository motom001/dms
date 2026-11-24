/**
 * Protokoll aller Prozesse (#1490): Mit `DMS_PROZESSE` > 1 hat jeder Prozess seinen eigenen Ringpuffer
 * ({@link Protokoll}). Die Werkbank fragt jeden Prozess (`frageAlle`) und mischt die Einträge nach Zeit; jeder Eintrag
 * trägt dann die Nummer seines Prozesses. Der Debug-Modus gilt für alle Prozesse. Mit einem Prozess bleibt alles, wie es
 * war: kein Feld `prozess`, `letzte` ist die Nummer des letzten Eintrags.
 *
 * „Nur neue“ (Live): `seit` nennt je Prozess die letzte gesehene Nummer, als Text `pid:nr,pid:nr`. Die Prozess-Id statt
 * der Nummer des Prozesses: Startet ein Prozess neu, beginnt sein Puffer wieder bei 1 – unter neuer Id gilt kein Stand.
 */
import { protokoll, type DebugStand, type Eintrag, type ProtokollFilter } from './protokoll';

/** Was ein Prozess von seinem Puffer liefert. */
export interface Auszug {
  pid: number;
  eintraege: Eintrag[];
  letzte: number;
  gespeichert: number;
  debug: DebugStand;
  jeModul: Record<string, number>;
}

/** Eintrag mit der Nummer des Prozesses, aus dem er stammt (nur mit mehreren Prozessen). */
type ProzessEintrag = Eintrag & { prozess?: number };

export interface ProtokollStand {
  eintraege: ProzessEintrag[];
  /** Ein Prozess: Nummer des letzten Eintrags; mehrere: `pid:nr,…` für das nächste `seit`. */
  letzte: number | string;
  gespeichert: number;
  debug: DebugStand;
  jeModul: Record<string, number>;
}

/** Was hier von der Verbindung zu den anderen Prozessen gebraucht wird (prozesse/prozesse.ts, `Verbund`). */
export interface ProtokollVerbund {
  readonly mehrere: boolean;
  bediene(name: string, f: (args: unknown[]) => unknown): void;
  frageAlle<T>(name: string, ms?: number, args?: unknown[]): Promise<Array<{ nr: number; pid: number; wert: T | null }>>;
}

/** `seit` aus der Anfrage: eine Zahl (ein Prozess) oder `pid:nr,…` (mehrere). */
export function seitFuer(seit: string | undefined, pid: number): number | undefined {
  if (!seit) return undefined;
  if (!seit.includes(':')) return Number(seit) || undefined;
  for (const teil of seit.split(',')) {
    const [p, n] = teil.split(':');
    if (Number(p) === pid) return Number(n) || undefined;
  }
  return undefined;
}

/** Auszug aus dem Puffer dieses Prozesses. */
function auszug(f: ProtokollFilter, seit?: string): Auszug {
  return {
    pid: process.pid,
    eintraege: protokoll.eintraege({ ...f, seit: seitFuer(seit, process.pid) }),
    letzte: protokoll.letzteNr,
    gespeichert: protokoll.anzahl,
    debug: protokoll.debugStand,
    jeModul: protokoll.jeModul(),
  };
}

/** Jeder Prozess beantwortet die Fragen der Werkbank nach seinem Protokoll und schaltet den Debug-Modus. */
export function bedieneProtokoll(v: ProtokollVerbund) {
  v.bediene('protokoll.auszug', ([f, seit]) => auszug((f ?? {}) as ProtokollFilter, typeof seit === 'string' ? seit : undefined));
  v.bediene('protokoll.debug', ([an]) => protokoll.setzeDebug(an === true));
}

/** Neueste zuerst; bei gleicher Zeit nach Nummer im Prozess, dann nach Prozess. */
const neuesteZuerst = (a: ProzessEintrag, b: ProzessEintrag) =>
  b.zeit.localeCompare(a.zeit) || b.nr - a.nr || (b.prozess ?? 0) - (a.prozess ?? 0);

/** Debug-Modus über alle Prozesse: an, solange er in einem an ist; „bis“ das späteste. */
function debugAller(staende: DebugStand[]): DebugStand {
  const an = staende.filter((d) => d.an);
  const bis = an.map((d) => d.bis!).sort();
  return { an: an.length > 0, bis: bis.at(-1) ?? null, grundstufe: staende[0]?.grundstufe ?? protokoll.debugStand.grundstufe };
}

/** Die Ansicht der Werkbank: mit einem Prozess der eigene Puffer, mit mehreren alle gemischt. */
export async function protokollStand(v: ProtokollVerbund | undefined, f: ProtokollFilter, seit?: string): Promise<ProtokollStand> {
  if (!v?.mehrere) {
    const a = auszug(f, seit);
    return { eintraege: a.eintraege, letzte: a.letzte, gespeichert: a.gespeichert, debug: a.debug, jeModul: a.jeModul };
  }
  const alle = (await v.frageAlle<Auszug>('protokoll.auszug', 3000, [f, seit])).filter(
    (x): x is { nr: number; pid: number; wert: Auszug } => x.wert !== null,
  );
  const jeModul: Record<string, number> = {};
  for (const x of alle) for (const [m, n] of Object.entries(x.wert.jeModul)) jeModul[m] = (jeModul[m] ?? 0) + n;
  return {
    eintraege: alle
      .flatMap((x) => x.wert.eintraege.map((e) => ({ ...e, prozess: x.nr })))
      .sort(neuesteZuerst)
      .slice(0, f.max ?? 500),
    letzte: alle.map((x) => `${x.wert.pid}:${x.wert.letzte}`).join(','),
    gespeichert: alle.reduce((s, x) => s + x.wert.gespeichert, 0),
    debug: debugAller(alle.map((x) => x.wert.debug)),
    jeModul,
  };
}

/** Debug-Modus ein oder aus – in allen Prozessen. */
export async function setzeDebugAlle(v: ProtokollVerbund | undefined, an: boolean): Promise<DebugStand> {
  if (!v?.mehrere) return protokoll.setzeDebug(an);
  const alle = await v.frageAlle<DebugStand>('protokoll.debug', 3000, [an]);
  return debugAller(alle.map((x) => x.wert).filter((d): d is DebugStand => d !== null));
}
