import { createHash } from 'node:crypto';
import type postgres from 'postgres';
import { poolSperrquelle, Sperrverbindung } from './sperrverbindung';

/**
 * Zustand zwischen Anfragen (#744): Fehlversuche, Sperren, Einmal-Tickets, Merker „kurz hintereinander nur einmal“ und
 * Sperren für Zeitpläne – für alle Prozesse und Server derselben Datenbank gleich (Bauregel „später mehrere Server
 * möglich halten“). Vorher lag das in Maps eines Prozesses: Mit zwei Prozessen hätte ein Angreifer doppelt so viele
 * Versuche gehabt, und der zweite Anmeldeschritt wäre beim falschen Prozess gelandet.
 *
 * Regeln (Durchsicht Sicherheit, #747):
 * - **Zählen atomar** in einer Anweisung (`INSERT … ON CONFLICT … DO UPDATE … RETURNING`), nie lesen-dann-schreiben.
 * - **Einmal verwendbar** über `nimm` (`DELETE … RETURNING`): Von zwei gleichzeitigen Einlösungen gewinnt genau eine.
 * - **Geheimnisse** nie im Klartext: Ist der Schlüssel selbst ein Geheimnis (Ticket, state), steht nur sein Hash
 *   ({@link hashe}); geheime Werte verschlüsselt der Aufrufer mit dem Tresor.
 * - **Ablauf** je Eintrag; Abgelaufenes gilt nicht mehr und räumt {@link Kurzzustand.raeumeAuf} weg (unter Sperre).
 *
 * Im Arbeitsspeicher ({@link speicherKurzzustand}) gilt dasselbe für einen Prozess – für Tests und Bausteine ohne Datenbank.
 */

/** Ein gültiger Eintrag; `bis` null = ohne Ablauf (bis jemand ihn löscht). */
export interface KurzEintrag { schluessel: string; anzahl: number; wert: unknown; bis: number | null }

export interface Kurzzustand {
  /**
   * Zähler atomar um `um` (Vorgabe 1) erhöhen und den neuen Stand liefern. Ist der Eintrag abgelaufen (oder fehlt er),
   * beginnt ein neues Fenster von `fensterMs` (null = ohne Ablauf). `gleitend`: Jeder Aufruf schiebt das Ende auf
   * jetzt + `fensterMs`; sonst bleibt das Ende des laufenden Fensters (festes Fenster).
   */
  zaehle(art: string, schluessel: string, fensterMs: number | null, o?: { gleitend?: boolean; um?: number }): Promise<{ anzahl: number; bis: number | null }>;
  /** Zähler eines gültigen Eintrags erhöhen (Fenster und Wert bleiben); null, wenn es keinen gültigen gibt. */
  erhoehe(art: string, schluessel: string, um?: number): Promise<number | null>;
  /** Gültiger Eintrag oder null. */
  lies(art: string, schluessel: string): Promise<KurzEintrag | null>;
  /** Gültige Einträge einer Art (wahlweise nur Schlüssel mit diesem Anfang), nach Schlüssel sortiert. */
  liste(art: string, praefix?: string, max?: number): Promise<KurzEintrag[]>;
  /** Zahl der gültigen Einträge einer Art (z. B. Grenze gegen Fluten). */
  anzahl(art: string): Promise<number>;
  /** Eintrag setzen oder ersetzen. `bisMs`: Zeitpunkt (ms), null = ohne Ablauf. */
  setze(art: string, schluessel: string, wert: unknown, bisMs: number | null, anzahl?: number): Promise<void>;
  /**
   * Nur anlegen, wenn es keinen gültigen Eintrag gibt (Merker „nur einmal“, Belegung mit Frist). true = angelegt,
   * also darf dieser Aufrufer; false = schon belegt. `ms` null = ohne Ablauf (z. B. dauerhafte IP-Sperre).
   */
  belege(art: string, schluessel: string, ms: number | null, wert?: unknown): Promise<boolean>;
  /** Wie `belege` für viele Schlüssel in einer Anweisung; liefert die, die dieser Aufrufer angelegt hat. */
  belegeAlle(art: string, schluessel: string[], ms: number): Promise<Set<string>>;
  /** Einmal einlösen: gültigen Eintrag löschen und liefern (`DELETE … RETURNING`); null = unbekannt, abgelaufen oder schon eingelöst. */
  nimm(art: string, schluessel: string): Promise<KurzEintrag | null>;
  /** Löschen: einen Schlüssel, alle mit diesem Anfang (`praefix`) oder ohne Schlüssel die ganze Art. Liefert die Anzahl. */
  loesche(art: string, schluessel?: string, o?: { praefix?: boolean }): Promise<number>;
  /** Abgelaufene Einträge löschen. Liefert die Anzahl. */
  raeumeAuf(): Promise<number>;
  /**
   * Nur ein Prozess zugleich (`pg_try_advisory_lock` je Haushalt und Name): Hält ein anderer die Sperre, läuft `f` hier
   * nicht (`ok: false`). Für Zeitpläne und Aufräumläufe – es wird nie gewartet.
   */
  exklusiv<T>(name: string, f: () => Promise<T>): Promise<{ ok: true; wert: T } | { ok: false }>;
}

/** Hash eines geheimen Schlüssels (Ticket, state, Kennung): In der Datenbank steht nur er. */
export const hashe = (s: string) => createHash('sha256').update(s).digest('hex');

/** Erster Schlüssel der Sperren für Zeitpläne (`pg_try_advisory_lock(744, …)`); der zweite ist ein Hash von Haushalt und Name. */
export const SPERRE_KLASSE = 744;

const gueltig = (bis: number | null, t: number) => bis === null || bis > t;

/** Im Arbeitsspeicher: ein Prozess, dieselben Regeln. */
export function speicherKurzzustand(jetzt: () => number = Date.now): Kurzzustand {
  const m = new Map<string, { art: string; schluessel: string; anzahl: number; wert: unknown; bis: number | null }>();
  const k = (art: string, s: string) => `${art}\u0000${s}`;
  const belegt = new Set<string>();
  const hole = (art: string, s: string) => {
    const e = m.get(k(art, s));
    if (!e) return null;
    if (!gueltig(e.bis, jetzt())) { m.delete(k(art, s)); return null; }
    return e;
  };
  const aus = (e: { schluessel: string; anzahl: number; wert: unknown; bis: number | null }): KurzEintrag => ({ schluessel: e.schluessel, anzahl: e.anzahl, wert: structuredClone(e.wert), bis: e.bis });
  return {
    async zaehle(art, s, fensterMs, o = {}) {
      const t = jetzt();
      const um = o.um ?? 1;
      const neuBis = fensterMs === null ? null : t + fensterMs;
      const e = hole(art, s);
      if (!e) { m.set(k(art, s), { art, schluessel: s, anzahl: um, wert: null, bis: neuBis }); return { anzahl: um, bis: neuBis }; }
      e.anzahl += um;
      if (o.gleitend) e.bis = neuBis;
      return { anzahl: e.anzahl, bis: e.bis };
    },
    async erhoehe(art, s, um = 1) { const e = hole(art, s); if (!e) return null; e.anzahl += um; return e.anzahl; },
    async lies(art, s) { const e = hole(art, s); return e ? aus(e) : null; },
    async liste(art, praefix = '', max = 10_000) {
      const t = jetzt();
      return [...m.values()].filter((e) => e.art === art && e.schluessel.startsWith(praefix) && gueltig(e.bis, t))
        .sort((a, b) => a.schluessel.localeCompare(b.schluessel)).slice(0, max).map(aus);
    },
    async anzahl(art) { const t = jetzt(); return [...m.values()].filter((e) => e.art === art && gueltig(e.bis, t)).length; },
    async setze(art, s, wert, bisMs, anzahl = 0) { m.set(k(art, s), { art, schluessel: s, anzahl, wert: structuredClone(wert ?? null), bis: bisMs }); },
    async belege(art, s, ms, wert = null) {
      if (hole(art, s)) return false;
      m.set(k(art, s), { art, schluessel: s, anzahl: 0, wert: structuredClone(wert), bis: ms === null ? null : jetzt() + ms });
      return true;
    },
    async belegeAlle(art, liste, ms) {
      const erg = new Set<string>();
      for (const s of new Set(liste)) if (!hole(art, s)) { m.set(k(art, s), { art, schluessel: s, anzahl: 0, wert: null, bis: jetzt() + ms }); erg.add(s); }
      return erg;
    },
    async nimm(art, s) { const e = hole(art, s); if (!e) return null; m.delete(k(art, s)); return aus(e); },
    async loesche(art, s, o = {}) {
      let n = 0;
      for (const [x, e] of m) {
        if (e.art !== art) continue;
        if (s === undefined || (o.praefix ? e.schluessel.startsWith(s) : e.schluessel === s)) { m.delete(x); n++; }
      }
      return n;
    },
    async raeumeAuf() {
      const t = jetzt();
      let n = 0;
      for (const [x, e] of m) if (!gueltig(e.bis, t)) { m.delete(x); n++; }
      return n;
    },
    async exklusiv(name, f) {
      if (belegt.has(name)) return { ok: false };
      belegt.add(name);
      try { return { ok: true, wert: await f() }; } finally { belegt.delete(name); }
    },
  };
}

type Zeile = { schluessel: string; anzahl: string | number; wert: unknown; bis: Date | null };
const eintrag = (r: Zeile): KurzEintrag => ({ schluessel: r.schluessel, anzahl: Number(r.anzahl), wert: r.wert ?? null, bis: r.bis ? r.bis.getTime() : null });
const json = (sql: postgres.Sql, w: unknown) => (w === null || w === undefined ? null : sql.json(w as postgres.JSONValue));
/** LIKE-Muster für „beginnt mit“ (Sonderzeichen geschützt). */
const anfang = (s: string) => `${s.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

/**
 * In PostgreSQL (Tabelle `kurzzustand`, Migration 078): für alle Prozesse und Server derselben Datenbank. Sperren für
 * Zeitpläne (`exklusiv`) laufen seit #1198 über die Sperrverbindung des Prozesses (`sperren`), nie über eine Verbindung
 * aus dem Pool, die während der Arbeit festgehalten wird. Ohne Angabe: eine eigene, aus dem Pool reserviert, solange eine
 * Sperre gehalten wird (Tests, Bausteine).
 */
export function pgKurzzustand(sql: postgres.Sql, haushaltId: string, jetzt: () => number = Date.now, sperren: Sperrverbindung = new Sperrverbindung(poolSperrquelle(sql))): Kurzzustand {
  const d = (ms: number | null) => (ms === null ? null : new Date(ms));
  return {
    async zaehle(art, s, fensterMs, o = {}) {
      const t = new Date(jetzt());
      const um = o.um ?? 1;
      const neuBis = fensterMs === null ? null : new Date(t.getTime() + fensterMs);
      const gleitend = !!o.gleitend;
      const [r] = await sql`
        INSERT INTO kurzzustand (haushalt_id, art, schluessel, anzahl, bis) VALUES (${haushaltId}, ${art}, ${s}, ${um}, ${neuBis})
        ON CONFLICT (haushalt_id, art, schluessel) DO UPDATE SET
          anzahl = CASE WHEN kurzzustand.bis IS NULL OR kurzzustand.bis > ${t} THEN kurzzustand.anzahl + ${um} ELSE ${um} END,
          wert = CASE WHEN kurzzustand.bis IS NULL OR kurzzustand.bis > ${t} THEN kurzzustand.wert ELSE NULL END,
          bis = CASE WHEN ${gleitend} OR NOT (kurzzustand.bis IS NULL OR kurzzustand.bis > ${t}) THEN EXCLUDED.bis ELSE kurzzustand.bis END
        RETURNING anzahl, bis`;
      return { anzahl: Number(r.anzahl), bis: r.bis ? (r.bis as Date).getTime() : null };
    },
    async erhoehe(art, s, um = 1) {
      const [r] = await sql`
        UPDATE kurzzustand SET anzahl = anzahl + ${um}
        WHERE haushalt_id = ${haushaltId} AND art = ${art} AND schluessel = ${s} AND (bis IS NULL OR bis > ${new Date(jetzt())})
        RETURNING anzahl`;
      return r ? Number(r.anzahl) : null;
    },
    async lies(art, s) {
      const [r] = await sql<Zeile[]>`
        SELECT schluessel, anzahl, wert, bis FROM kurzzustand
        WHERE haushalt_id = ${haushaltId} AND art = ${art} AND schluessel = ${s} AND (bis IS NULL OR bis > ${new Date(jetzt())})`;
      return r ? eintrag(r) : null;
    },
    async liste(art, praefix = '', max = 10_000) {
      const rs = await sql<Zeile[]>`
        SELECT schluessel, anzahl, wert, bis FROM kurzzustand
        WHERE haushalt_id = ${haushaltId} AND art = ${art} AND (bis IS NULL OR bis > ${new Date(jetzt())})
          ${praefix ? sql`AND schluessel LIKE ${anfang(praefix)}` : sql``}
        ORDER BY schluessel LIMIT ${max}`;
      return rs.map(eintrag);
    },
    async anzahl(art) {
      const [r] = await sql`SELECT count(*)::int AS n FROM kurzzustand WHERE haushalt_id = ${haushaltId} AND art = ${art} AND (bis IS NULL OR bis > ${new Date(jetzt())})`;
      return r.n as number;
    },
    async setze(art, s, wert, bisMs, anzahl = 0) {
      await sql`
        INSERT INTO kurzzustand (haushalt_id, art, schluessel, anzahl, wert, bis) VALUES (${haushaltId}, ${art}, ${s}, ${anzahl}, ${json(sql, wert)}, ${d(bisMs)})
        ON CONFLICT (haushalt_id, art, schluessel) DO UPDATE SET anzahl = EXCLUDED.anzahl, wert = EXCLUDED.wert, bis = EXCLUDED.bis`;
    },
    async belege(art, s, ms, wert = null) {
      const t = jetzt();
      const r = await sql`
        INSERT INTO kurzzustand (haushalt_id, art, schluessel, anzahl, wert, bis) VALUES (${haushaltId}, ${art}, ${s}, 0, ${json(sql, wert)}, ${d(ms === null ? null : t + ms)})
        ON CONFLICT (haushalt_id, art, schluessel) DO UPDATE SET anzahl = 0, wert = EXCLUDED.wert, bis = EXCLUDED.bis
          WHERE kurzzustand.bis IS NOT NULL AND kurzzustand.bis <= ${new Date(t)}
        RETURNING 1`;
      return r.length > 0;
    },
    async belegeAlle(art, liste, ms) {
      if (!liste.length) return new Set();
      const t = jetzt();
      const rs = await sql`
        INSERT INTO kurzzustand (haushalt_id, art, schluessel, anzahl, bis)
        SELECT ${haushaltId}, ${art}, s, 0, ${new Date(t + ms)} FROM unnest(${[...new Set(liste)]}::text[]) AS s
        ON CONFLICT (haushalt_id, art, schluessel) DO UPDATE SET anzahl = 0, wert = NULL, bis = EXCLUDED.bis
          WHERE kurzzustand.bis IS NOT NULL AND kurzzustand.bis <= ${new Date(t)}
        RETURNING schluessel`;
      return new Set(rs.map((r) => r.schluessel as string));
    },
    async nimm(art, s) {
      const [r] = await sql<Zeile[]>`
        DELETE FROM kurzzustand
        WHERE haushalt_id = ${haushaltId} AND art = ${art} AND schluessel = ${s} AND (bis IS NULL OR bis > ${new Date(jetzt())})
        RETURNING schluessel, anzahl, wert, bis`;
      return r ? eintrag(r) : null;
    },
    async loesche(art, s, o = {}) {
      const r = s === undefined
        ? await sql`DELETE FROM kurzzustand WHERE haushalt_id = ${haushaltId} AND art = ${art}`
        : o.praefix
          ? await sql`DELETE FROM kurzzustand WHERE haushalt_id = ${haushaltId} AND art = ${art} AND schluessel LIKE ${anfang(s)}`
          : await sql`DELETE FROM kurzzustand WHERE haushalt_id = ${haushaltId} AND art = ${art} AND schluessel = ${s}`;
      return r.count;
    },
    async raeumeAuf() {
      const r = await sql`DELETE FROM kurzzustand WHERE haushalt_id = ${haushaltId} AND bis IS NOT NULL AND bis <= ${new Date(jetzt())}`;
      return r.count;
    },
    async exklusiv(name, f) {
      // Sperrverbindung (#1198): Die Sperre hält keine Verbindung aus dem Pool fest – f() hat ihn ganz für sich.
      const s = await sperren.versuche({ klasse: SPERRE_KLASSE, name: `${haushaltId}:${name}` }, name);
      if (!s) return { ok: false };
      try { return { ok: true, wert: await f() }; } finally { await s.gib().catch(() => {}); }
    },
  };
}

/**
 * Lebenszeichen (#744): Jeder Prozess hält, solange er läuft, eine geteilte Sperre (seit #1198 auf seiner
 * Sperrverbindung). Wer sie beim Start exklusiv bekommt, ist allein an dieser Datenbank – erst dann darf er z. B.
 * „laufende“ Aufträge als unterbrochen zurückstellen (sie können keinem anderen Prozess gehören). Liefert, ob er allein
 * war, und eine Funktion zum Freigeben (beim Beenden).
 */
export async function lebenszeichen(sperren: Sperrverbindung, haushaltId: string): Promise<{ allein: boolean; ende: () => Promise<void> }> {
  const { allein, sperre } = await sperren.lebenszeichen({ klasse: SPERRE_KLASSE, name: `${haushaltId}:prozess` }, 'lebenszeichen');
  return { allein, ende: () => sperre.gib() };
}
