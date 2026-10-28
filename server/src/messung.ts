import type postgres from 'postgres';
import { kontext, protokoll } from './protokoll';

/**
 * Messung der Datenbankzugriffe (#11, #12).
 *
 * Jede Methode der Repos (ein „Datenbankzugriff“, kann mehrere SQL-Anweisungen
 * umfassen) wird gezählt und gestoppt. Die Summe je Anfrage geht über den
 * Header Server-Timing an die Oberfläche (Entwicklermodus). Dauert ein Zugriff
 * länger als die eingestellte Schwelle, wird er als Langläufer gespeichert.
 */
export interface MessEinstellungen { schwelleMs: number; tage: number }
export const STANDARD: MessEinstellungen = { schwelleMs: 500, tage: 30 };

export interface Langlaeufer { id?: number; zeit: string; dauerMs: number; zugriff: string; anfrage: string; benutzer: string }
export interface LaufendeAbfrage { pid: number; seitMs: number; zustand: string; abfrage: string; anwendung: string }

export interface MessSpeicher {
  ladeEinstellungen(): Promise<MessEinstellungen>;
  speichereEinstellungen(e: MessEinstellungen): Promise<void>;
  merke(l: Langlaeufer): Promise<void>;
  liste(max: number): Promise<Langlaeufer[]>;
  aufraeumen(tage: number): Promise<number>;
  /** Abfragen, die gerade in der Datenbank laufen (ohne die eigene). */
  laufende(): Promise<LaufendeAbfrage[]>;
}

const log = protokoll.modul('datenbank');

export class Messung {
  einstellungen: MessEinstellungen = { ...STANDARD };
  private zuletztAufgeraeumt = 0;

  constructor(readonly speicher: MessSpeicher) {}

  async start() {
    try { this.einstellungen = { ...STANDARD, ...(await this.speicher.ladeEinstellungen()) }; } catch { /* Standardwerte */ }
  }

  async setze(e: Partial<MessEinstellungen>) {
    const schwelleMs = Math.round(Number(e.schwelleMs ?? this.einstellungen.schwelleMs));
    const tage = Math.round(Number(e.tage ?? this.einstellungen.tage));
    if (!(schwelleMs >= 1 && schwelleMs <= 600_000)) throw new RangeError('Die Schwelle muss zwischen 1 ms und 600.000 ms liegen.');
    if (!(tage >= 1 && tage <= 3650)) throw new RangeError('Aufbewahrt wird zwischen 1 und 3650 Tagen.');
    this.einstellungen = { schwelleMs, tage };
    await this.speicher.speichereEinstellungen(this.einstellungen);
    await this.speicher.aufraeumen(tage);
    return this.einstellungen;
  }

  /** Umhüllt ein Repo: jede Methode wird gezählt und gestoppt. */
  umhuelle<T extends object>(repo: T, name: string): T {
    const self = this;
    return new Proxy(repo, {
      get(ziel, prop, empfaenger) {
        const wert = Reflect.get(ziel, prop, empfaenger);
        if (typeof wert !== 'function') return wert;
        return function (this: unknown, ...args: unknown[]) {
          const start = performance.now();
          const ergebnis = wert.apply(ziel, args);
          if (!(ergebnis instanceof Promise)) return ergebnis;
          const fertig = () => self.erfasse(`${name}.${String(prop)}`, performance.now() - start);
          return ergebnis.then((r) => { fertig(); return r; }, (e) => { fertig(); throw e; });
        };
      },
    });
  }

  private erfasse(zugriff: string, ms: number) {
    const k = kontext.getStore();
    if (k) { k.db.anzahl++; k.db.ms += ms; }
    if (ms >= this.einstellungen.schwelleMs) {
      const l: Langlaeufer = { zeit: new Date().toISOString(), dauerMs: Math.round(ms), zugriff, anfrage: k?.pfad ?? '', benutzer: k?.benutzer ?? '' };
      log.warn(`Langer Datenbankzugriff: ${zugriff} dauerte ${Math.round(ms)} ms`, { zugriff, ms: Math.round(ms), anfrage: l.anfrage || undefined });
      this.speicher.merke(l).catch((e) => log.error('Langläufer nicht gespeichert', { fehler: (e as Error).message }));
      if (Date.now() - this.zuletztAufgeraeumt > 3_600_000) {
        this.zuletztAufgeraeumt = Date.now();
        this.speicher.aufraeumen(this.einstellungen.tage).catch(() => {});
      }
    } else if (ms >= 50) {
      log.debug(`Datenbankzugriff ${zugriff}: ${Math.round(ms)} ms`, { zugriff, ms: Math.round(ms) });
    } else {
      log.trace(`Datenbankzugriff ${zugriff}: ${Math.round(ms)} ms`);
    }
  }
}

/* ---------- Speicher ---------- */

export function speicherMessSpeicher(): MessSpeicher {
  let e = { ...STANDARD };
  let liste: Langlaeufer[] = [];
  let nr = 0;
  return {
    async ladeEinstellungen() { return e; },
    async speichereEinstellungen(x) { e = { ...x }; },
    async merke(l) { liste.unshift({ ...l, id: ++nr }); },
    async liste(max) { return liste.slice(0, max); },
    async aufraeumen(tage) { const vorher = liste.length; liste = liste.filter((l) => Date.parse(l.zeit) > Date.now() - tage * 86_400_000); return vorher - liste.length; },
    async laufende() { return []; },
  };
}

export function pgMessSpeicher(sql: postgres.Sql, haushaltId: string): MessSpeicher {
  return {
    async ladeEinstellungen() {
      const [r] = await sql`SELECT wert FROM einstellungen WHERE haushalt_id = ${haushaltId} AND schluessel = 'messung'`;
      return { ...STANDARD, ...((r?.wert as Partial<MessEinstellungen>) ?? {}) };
    },
    async speichereEinstellungen(x) {
      await sql`
        INSERT INTO einstellungen (haushalt_id, schluessel, wert) VALUES (${haushaltId}, 'messung', ${sql.json(x as unknown as postgres.JSONValue)})
        ON CONFLICT (haushalt_id, schluessel) DO UPDATE SET wert = EXCLUDED.wert`;
    },
    async merke(l) {
      await sql`INSERT INTO langlaeufer (zeit, dauer_ms, zugriff, anfrage, benutzer) VALUES (${l.zeit}, ${l.dauerMs}, ${l.zugriff}, ${l.anfrage.slice(0, 300)}, ${l.benutzer})`;
    },
    async liste(max) {
      const r = await sql`SELECT * FROM langlaeufer ORDER BY zeit DESC LIMIT ${max}`;
      return r.map((z) => ({
        id: Number(z.id), zeit: (z.zeit as Date).toISOString(), dauerMs: z.dauer_ms as number,
        zugriff: z.zugriff as string, anfrage: z.anfrage as string, benutzer: z.benutzer as string,
      }));
    },
    async aufraeumen(tage) {
      const r = await sql`DELETE FROM langlaeufer WHERE zeit < now() - make_interval(days => ${tage})`;
      return r.count;
    },
    async laufende() {
      const r = await sql`
        SELECT pid, state, application_name, left(query, 500) AS query,
          (extract(epoch FROM now() - coalesce(query_start, backend_start)) * 1000)::bigint AS ms
        FROM pg_stat_activity
        WHERE datname = current_database() AND pid <> pg_backend_pid() AND state IS NOT NULL AND state <> 'idle'
        ORDER BY query_start NULLS LAST`;
      return r.map((z) => ({ pid: z.pid as number, seitMs: Number(z.ms), zustand: z.state as string, abfrage: z.query as string, anwendung: z.application_name as string }));
    },
  };
}
