import postgres from 'postgres';
import { protokoll } from './protokoll';

/**
 * Eine Verbindung nur für Sitzungssperren (#1198). Bis 0.266 nahm jede Sperre (Zeitpläne `exklusiv`, Paket-Sperre,
 * Eingangsordner, Postfächer, Lebenszeichen) eine eigene Verbindung aus dem Pool der Anfragen (`sql.reserve()`) und hielt
 * sie, solange ihre Arbeit lief. Braucht die Arbeit selbst Verbindungen aus demselben Pool, verklemmt er, sobald alle
 * ausgeliehen sind: 3 Dauersperren und 7 Zeitpläne zur selben Sekunde füllten 10 Verbindungen, jede wartete auf ihre
 * Arbeit, jede Arbeit auf eine Verbindung – ohne Zeitgrenze, für immer.
 *
 * Jetzt laufen alle Sperren eines Prozesses über **eine** Verbindung außerhalb des Pools. PostgreSQL hält Advisory-
 * Sperren je Sitzung, beliebig viele zugleich; die Arbeit selbst läuft über den Pool und hält keine Verbindung fest.
 * - **Nacheinander:** Die Abfragen auf der Sperrverbindung laufen streng nacheinander (eine Kette), jede mit Zeitgrenze.
 * - **Doppelt im selben Prozess:** Dieselbe Sitzung bekäme dieselbe Sperre ein zweites Mal (PostgreSQL zählt sie). Darum
 *   merkt sich der Prozess, was er hält, und lehnt eine zweite Anfrage selbst ab – wie vorher die zweite Verbindung.
 * - **Abbruch:** Reißt die Verbindung ab (oder antwortet sie nicht), sind alle Sperren dieses Prozesses frei. Laufende
 *   Arbeit läuft weiter, das Protokoll warnt; die nächste Sperre baut die Verbindung neu auf. Dauersperren
 *   ({@link Sperrverbindung.dauerhaft}) holen sich die Sperre beim nächsten Aufruf neu, das Lebenszeichen sofort.
 * - **Nichts gehalten:** Dann schließt sie die Verbindung (weitere Prozesse brauchen sie nur kurz, etwa beim Installieren
 *   eines Pakets). Der Leiter hält immer das Lebenszeichen, seine Verbindung bleibt also offen.
 */

/** Schlüssel einer Advisory-Sperre: eine Zahl (bigint) oder Klasse plus `hashtext(name)` (zwei int4). */
export interface Sperrschluessel { klasse: number; name?: string }

/** Wie lange eine Abfrage auf der Sperrverbindung höchstens dauert; danach gilt die Verbindung als abgebrochen. */
export const SPERRABFRAGE_MS = 10_000;
/** Lebenszeichen nach einem Abbruch neu holen: so lange zwischen den Versuchen. */
export const WIEDER_MS = 5_000;

/** Die Verbindung selbst: Abfragen und Schließen. `beiAbbruch` meldet, dass sie unerwartet zu ist. */
export interface Sperrquelle { sql: postgres.Sql | postgres.ReservedSql; ende(): Promise<void> }
export type SperrquelleOeffnen = (beiAbbruch: () => void) => Promise<Sperrquelle>;

/** Eigene Verbindung (ein Client mit `max: 1`), unabhängig vom Pool der Anfragen – so im Betrieb. */
export function eigeneSperrquelle(url: string): SperrquelleOeffnen {
  return async (beiAbbruch) => {
    let geschlossen = false;
    const sql = postgres(url, {
      max: 1, onnotice: () => {}, infer: true,
      // Nie von selbst schließen: sonst wären die Sperren still weg (Vorgabe von postgres.js: nach 30–60 Minuten).
      max_lifetime: null, idle_timeout: null, connect_timeout: 10,
      connection: { application_name: 'Ablago Sperren' },
      onclose: () => { if (!geschlossen) beiAbbruch(); },
    });
    return { sql, ende: async () => { geschlossen = true; await sql.end({ timeout: 2 }).catch(() => {}); } };
  };
}

/** Aus dem Pool reserviert – für Tests und Bausteine ohne eigene Adresse. Frei, sobald keine Sperre mehr gehalten wird. */
export function poolSperrquelle(sql: postgres.Sql): SperrquelleOeffnen {
  return async () => {
    const v = await sql.reserve();
    return { sql: v, ende: async () => { v.release(); } };
  };
}

/**
 * `dauer`: Dauersperre bzw. Lebenszeichen – nach einem Abbruch nicht mehr gehalten (die nächste `halte()` bzw. die
 * Verbindung selbst holt sie neu). Sperren eines Laufs (`exklusiv`) bleiben dagegen bis zu dessen Ende vermerkt: So
 * startet derselbe Lauf in diesem Prozess nicht ein zweites Mal, solange der erste noch arbeitet.
 */
interface Eintrag { bezeichnung: string; seit: number; geteilt: boolean; generation: number; dauer: boolean }

/** Eine gehaltene Sperre. `gueltig` wird falsch, wenn sie freigegeben oder mit der Verbindung verloren ist. */
export interface Sperre { readonly gueltig: boolean; gib(): Promise<void> }

/** Dauersperre (Eingangsordner, Postfächer): `halte()` liefert, ob dieser Prozess sie hat – und holt sie sonst neu. */
export interface Dauersperre { halte(): Promise<boolean>; gib(): Promise<void>; readonly gueltig: boolean }

export interface SperrStand {
  offen: boolean;
  /** Was dieser Prozess gerade hält (Bezeichnung, seit wann). */
  gehalten: Array<{ bezeichnung: string; seit: number; geteilt: boolean }>;
  /** So oft ist die Verbindung seit dem Start abgebrochen. */
  abbrueche: number;
}

const schluesselText = (s: Sperrschluessel) => (s.name === undefined ? `${s.klasse}` : `${s.klasse}:${s.name}`);

export class Sperrverbindung {
  private quelle: Promise<Sperrquelle> | null = null;
  private kette: Promise<unknown> = Promise.resolve();
  private gehalten = new Map<string, Eintrag & { schluessel: Sperrschluessel }>();
  /** Zählt die Verbindungen: Eine Sperre gilt nur, solange die Verbindung ihrer Generation besteht. */
  private generation = 0;
  private abbrueche = 0;
  private wiederUhr: NodeJS.Timeout | null = null;
  private log = protokoll.modul('datenbank');

  constructor(private oeffne: SperrquelleOeffnen, private o: { abfrageMs?: number; wiederMs?: number } = {}) {}

  stand(): SperrStand {
    return {
      offen: !!this.quelle,
      gehalten: [...this.gehalten.values()].map((e) => ({ bezeichnung: e.bezeichnung, seit: e.seit, geteilt: e.geteilt })),
      abbrueche: this.abbrueche,
    };
  }

  /** Namen der laufenden Sperren (für Warnungen im Protokoll). */
  namen(): string[] { return [...this.gehalten.values()].map((e) => e.bezeichnung); }

  /** Exklusive Sperre versuchen; null, wenn ein anderer Prozess oder dieser selbst sie hält. */
  async versuche(s: Sperrschluessel, bezeichnung: string, o: { dauer?: boolean } = {}): Promise<Sperre | null> {
    const k = schluesselText(s);
    if (this.gehalten.has(k)) return null;
    // Platz sofort belegen: Zwei gleichzeitige Aufrufe im selben Prozess sollen nicht beide fragen.
    const e = { schluessel: s, bezeichnung, seit: Date.now(), geteilt: false, generation: -1, dauer: !!o.dauer };
    this.gehalten.set(k, e);
    try {
      const ok = await this.reihe(async (sql, gen) => {
        const [r] = s.name === undefined
          ? await sql`SELECT pg_try_advisory_lock(${s.klasse}) AS ok`
          : await sql`SELECT pg_try_advisory_lock(${s.klasse}, hashtext(${s.name})) AS ok`;
        if (r.ok) e.generation = gen;
        return !!r.ok;
      });
      if (!ok) { this.weg(k, e); await this.schliesseWennLeer(); return null; }
    } catch (x) { this.weg(k, e); throw x; }
    return this.griff(k, e);
  }

  /** Dauersperre: `halte()` bei jedem Lauf – nach einem Abbruch holt sie sich die Sperre neu. */
  dauerhaft(s: Sperrschluessel, bezeichnung: string): Dauersperre {
    let sperre: Sperre | null = null;
    let laeuft: Promise<boolean> | null = null;
    const halte = async () => {
      if (sperre?.gueltig) return true;
      sperre = await this.versuche(s, bezeichnung, { dauer: true }).catch((e: Error) => { this.log.warn('Sperre nicht geholt', { sperre: bezeichnung, fehler: e.message }); return null; });
      return !!sperre;
    };
    return {
      halte: () => (laeuft ??= halte().finally(() => { laeuft = null; })),
      gib: async () => { const x = sperre; sperre = null; await x?.gib(); },
      get gueltig() { return !!sperre?.gueltig; },
    };
  }

  /**
   * Lebenszeichen (#744): geteilte Sperre, solange der Prozess läuft. Wer vorher die exklusive bekommt, ist allein an
   * dieser Datenbank. Erst die geteilte nehmen, dann die exklusive lösen: Dazwischen kann kein anderer „allein“ sein.
   * Nach einem Abbruch holt die Verbindung die geteilte Sperre von selbst wieder.
   */
  async lebenszeichen(s: Sperrschluessel, bezeichnung: string): Promise<{ allein: boolean; sperre: Sperre }> {
    const k = `geteilt:${schluesselText(s)}`;
    if (this.gehalten.has(k)) throw new Error(`Lebenszeichen ${bezeichnung} wird schon gehalten`);
    const e = { schluessel: s, bezeichnung, seit: Date.now(), geteilt: true, generation: -1, dauer: true };
    this.gehalten.set(k, e);
    try {
      const allein = await this.reihe(async (sql, gen) => {
        const [r] = await sql`SELECT pg_try_advisory_lock(${s.klasse}, hashtext(${s.name ?? ''})) AS ok`;
        const geteilt = await this.teile(sql, s);
        if (r.ok) await sql`SELECT pg_advisory_unlock(${s.klasse}, hashtext(${s.name ?? ''}))`;
        if (geteilt) e.generation = gen;
        return !!r.ok;
      });
      if (e.generation < 0) this.planeWieder();
      return { allein, sperre: this.griff(k, e) };
    } catch (x) { this.weg(k, e); throw x; }
  }

  /** Geteilte Sperre ohne zu blockieren: Hält ein anderer gerade kurz die exklusive (beim Start), kurz warten. */
  private async teile(sql: Sperrquelle['sql'], s: Sperrschluessel): Promise<boolean> {
    for (let i = 0; i < 20; i++) {
      const [r] = await sql`SELECT pg_try_advisory_lock_shared(${s.klasse}, hashtext(${s.name ?? ''})) AS ok`;
      if (r.ok) return true;
      await new Promise((ok) => setTimeout(ok, 100));
    }
    return false;
  }

  private griff(k: string, e: Eintrag & { schluessel: Sperrschluessel }): Sperre {
    let frei = false;
    const gilt = () => !frei && this.gehalten.get(k) === e && e.generation === this.generation;
    return {
      get gueltig() { return gilt(); },
      gib: async () => {
        if (frei) return;
        const galt = gilt();
        frei = true;
        this.weg(k, e);
        // Verloren (Abbruch) oder nie bekommen: nichts zu lösen – die neue Sitzung hält sie nicht.
        if (galt) {
          await this.reihe(async (sql, gen) => {
            if (gen !== e.generation) return;
            const n = e.schluessel.name;
            if (e.geteilt) await sql`SELECT pg_advisory_unlock_shared(${e.schluessel.klasse}, hashtext(${n ?? ''}))`;
            else if (n === undefined) await sql`SELECT pg_advisory_unlock(${e.schluessel.klasse})`;
            else await sql`SELECT pg_advisory_unlock(${e.schluessel.klasse}, hashtext(${n}))`;
          }).catch(() => {});
        }
        await this.schliesseWennLeer();
      },
    };
  }

  private weg(k: string, e: Eintrag) { if (this.gehalten.get(k) === e) this.gehalten.delete(k); }

  /** Abfragen auf der Sperrverbindung: nacheinander, mit Zeitgrenze; ein Fehler gilt als Abbruch der Verbindung. */
  private reihe<T>(f: (sql: Sperrquelle['sql'], generation: number) => Promise<T>): Promise<T> {
    const lauf = this.kette.then(async () => {
      const q = await this.verbindung();
      const gen = this.generation;
      let uhr: NodeJS.Timeout | undefined;
      const grenze = new Promise<never>((_, nein) => { uhr = setTimeout(() => nein(new Error('Sperrverbindung antwortet nicht')), this.o.abfrageMs ?? SPERRABFRAGE_MS); });
      try { return await Promise.race([f(q.sql, gen), grenze]); } catch (x) {
        if (gen === this.generation) await this.abbruch((x as Error).message);
        throw x;
      } finally { clearTimeout(uhr); }
    });
    this.kette = lauf.catch(() => {});
    return lauf;
  }

  private verbindung(): Promise<Sperrquelle> {
    if (!this.quelle) {
      const gen = ++this.generation;
      const q = this.oeffne(() => { if (gen === this.generation) void this.abbruch('Verbindung geschlossen'); });
      this.quelle = q;
      q.catch(() => { if (this.quelle === q) this.quelle = null; });
    }
    return this.quelle;
  }

  /** Verbindung weg: Alle Sperren dieses Prozesses sind frei. Laufende Arbeit läuft weiter, das Protokoll warnt. */
  private async abbruch(grund: string) {
    const q = this.quelle;
    if (!q) return;
    this.quelle = null;
    this.generation++;
    this.abbrueche++;
    const verloren = [...this.gehalten.values()].filter((e) => e.generation >= 0);
    if (verloren.length) this.log.warn('Verbindung für Sperren abgebrochen – die Sperren dieses Prozesses sind frei geworden; laufende Arbeit läuft weiter', { grund, sperren: verloren.map((e) => e.bezeichnung).join(', ') });
    await q.then((x) => x.ende(), () => {});
    // Dauersperren sind nicht mehr gehalten (halte() holt sie neu); das Lebenszeichen holt die Verbindung selbst wieder.
    for (const [k, e] of this.gehalten) if (e.dauer && !e.geteilt) this.gehalten.delete(k);
    if (verloren.some((e) => e.dauer && e.geteilt)) this.planeWieder();
  }

  /** Lebenszeichen nach einem Abbruch neu holen – bis es klappt. */
  private planeWieder() {
    if (this.wiederUhr) return;
    this.wiederUhr = setTimeout(() => {
      this.wiederUhr = null;
      const offen = [...this.gehalten.values()].filter((e) => e.geteilt && e.dauer && e.generation !== this.generation);
      if (!offen.length) return;
      void this.reihe(async (sql, gen) => {
        for (const e of offen) if (await this.teile(sql, e.schluessel)) { e.generation = gen; this.log.info('Lebenszeichen nach Abbruch wieder gesetzt', { sperre: e.bezeichnung }); }
      }).catch(() => {}).finally(() => { if (offen.some((e) => e.generation !== this.generation)) this.planeWieder(); });
    }, this.o.wiederMs ?? WIEDER_MS);
    this.wiederUhr.unref?.();
  }

  private async schliesseWennLeer() {
    if (this.gehalten.size) return;
    await this.reihe(async () => {}).catch(() => {});
    if (this.gehalten.size || !this.quelle) return;
    const q = this.quelle;
    this.quelle = null;
    this.generation++;
    await q.then((x) => x.ende(), () => {});
  }

  /** Beim Beenden: alles freigeben und schließen. */
  async ende() {
    if (this.wiederUhr) clearTimeout(this.wiederUhr);
    this.wiederUhr = null;
    this.gehalten.clear();
    await this.kette.catch(() => {});
    const q = this.quelle;
    this.quelle = null;
    this.generation++;
    if (q) await q.then((x) => x.ende(), () => {});
  }
}
