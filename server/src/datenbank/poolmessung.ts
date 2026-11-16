/**
 * Wo es unter Last hakt (#874): Wartezeit auf eine freie Verbindung zur Datenbank und wie viele Verbindungen belegt
 * sind – je Prozess gemessen, für den Lasttest über alle Prozesse zusammengezählt (`GET /api/werkbank/last`).
 *
 * postgres.js 4 meldet über `node:diagnostics_channel`, wann eine Abfrage in die Warteschlange kam (`queued`) und wann
 * sie an eine Verbindung ging (`sent`), und beim Ausleihen einer Verbindung für eine Transaktion, wie lange sie darauf
 * wartete (`lease`, `waited`). Beides zusammen ist die Wartezeit auf eine freie Verbindung. Die Messung läuft nur,
 * solange jemand fragt (Lasttest, alle 2 Sekunden) und danach noch {@link AN_MS} – sonst kostet sie nichts.
 *
 * Wartezeiten zählen in festen Klassen ({@link KLASSEN_MS}, fortlaufend seit dem Einschalten); der Lasttest bildet aus
 * dem Unterschied zwischen Anfang und Ende eines Durchgangs p95 über alle Prozesse (als Obergrenze der Klasse).
 */
import dc from 'node:diagnostics_channel';
import type postgres from 'postgres';

/** Obergrenzen der Klassen in ms; die letzte Klasse ist alles darüber. */
export const KLASSEN_MS = [
  1, 1.5, 2, 3, 5, 7, 10, 15, 20, 30, 50, 70, 100, 150, 200, 300, 500, 700, 1000, 1500, 2000, 3000, 5000, 7000, 10_000, 15_000, 20_000,
  30_000,
] as const;
/** So lange misst ein Prozess nach der letzten Frage weiter. */
export const AN_MS = 3 * 60_000;
/** Höchstwerte gelten für dieses Fenster (Lasttest fragt alle 2 Sekunden). */
export const FENSTER_MS = 10_000;
const PROBE_MS = 250;

export const klasseVon = (ms: number) => {
  const i = KLASSEN_MS.findIndex((g) => ms <= g);
  return i < 0 ? KLASSEN_MS.length : i;
};

/** Quantil aus Klassen (Obergrenze der Klasse; über der letzten: null = mehr als 30 s). */
export function quantilAusKlassen(zaehler: number[], q: number): number | null {
  const n = zaehler.reduce((a, b) => a + b, 0);
  if (!n) return null;
  const ziel = Math.ceil(q * n);
  let summe = 0;
  for (let i = 0; i < zaehler.length; i++) {
    summe += zaehler[i];
    if (summe >= ziel) return i < KLASSEN_MS.length ? KLASSEN_MS[i] : null;
  }
  return null;
}

export interface PoolStand {
  /** Ist die Messung gerade an? */
  an: boolean;
  /** Wartezeiten fortlaufend je Klasse (Länge KLASSEN_MS + 1). */
  klassen: number[];
  /** Längste Wartezeit im Fenster (ms) und Zahl der Messungen insgesamt. */
  wartenMax: number | null;
  anzahl: number;
  /** Verbindungen dieses Prozesses: erlaubt, offen, belegt (jetzt und höchstens im Fenster), wartende Abfragen. */
  max: number;
  offen: number;
  belegt: number;
  belegtMax: number;
  warteschlangeMax: number;
}

type Stats = { connections: number; opening: number; idle: number; leased: number; waiting: number };
type Kontext = { queued?: number; sent?: number | null };

/** Je Prozess eine; `an()` schaltet sie für {@link AN_MS} ein. */
export class Poolmessung {
  private klassen = new Array<number>(KLASSEN_MS.length + 1).fill(0);
  private anzahl = 0;
  /** Höchstwerte je Sekunde: Wartezeit, belegt, Warteschlange. */
  private sekunden: Array<{ s: number; warten: number; belegt: number; schlange: number }> = [];
  private bis = 0;
  private uhr?: NodeJS.Timeout;
  // Nur asyncEnd: Node.js abonniert nur, was angegeben ist (die Typen verlangen alle fünf).
  private readonly abfrage = {
    asyncEnd: (k: unknown) => this.abfrageFertig(k as Kontext),
  } as unknown as dc.TracingChannelSubscribers<object>;
  private readonly pool = (m: unknown) => {
    const e = m as { event?: string; waited?: number };
    if (e.event === 'lease' && typeof e.waited === 'number') this.merke(e.waited);
  };

  constructor(
    private sql: postgres.Sql,
    readonly max: number,
    private jetzt: () => number = Date.now,
  ) {}

  private stats(): Stats | null {
    try {
      return (this.sql as unknown as { stats?: Stats }).stats ?? null;
    } catch {
      return null;
    }
  }

  private slot() {
    const s = Math.floor(this.jetzt() / 1000);
    let x = this.sekunden.at(-1);
    if (!x || x.s !== s) {
      x = { s, warten: -1, belegt: 0, schlange: 0 };
      this.sekunden.push(x);
      const alt = s - Math.ceil(FENSTER_MS / 1000);
      while (this.sekunden.length && this.sekunden[0].s <= alt) this.sekunden.shift();
    }
    return x;
  }

  /** Eine Wartezeit (für Tests öffentlich). */
  merke(ms: number) {
    if (!Number.isFinite(ms) || ms < 0) return;
    this.klassen[klasseVon(ms)]++;
    this.anzahl++;
    const x = this.slot();
    if (ms > x.warten) x.warten = ms;
  }

  private abfrageFertig(k: Kontext) {
    if (typeof k?.queued === 'number' && typeof k.sent === 'number') this.merke(k.sent - k.queued);
  }

  private probe() {
    const s = this.stats();
    if (!s) return;
    const x = this.slot();
    const belegt = s.connections - s.idle;
    if (belegt > x.belegt) x.belegt = belegt;
    if (s.waiting > x.schlange) x.schlange = s.waiting;
  }

  /** Einschalten bzw. verlängern. */
  an() {
    this.bis = this.jetzt() + AN_MS;
    if (this.uhr) return;
    try {
      dc.tracingChannel('postgres:query').subscribe(this.abfrage);
    } catch {
      /* ältere Node-Fassung: nur Transaktionen */
    }
    dc.subscribe('postgres:pool', this.pool);
    this.uhr = setInterval(() => {
      if (this.jetzt() > this.bis) this.aus();
      else this.probe();
    }, PROBE_MS);
    this.uhr.unref();
  }

  aus() {
    if (!this.uhr) return;
    clearInterval(this.uhr);
    this.uhr = undefined;
    try {
      dc.tracingChannel('postgres:query').unsubscribe(this.abfrage);
    } catch {
      /* s. o. */
    }
    dc.unsubscribe('postgres:pool', this.pool);
  }

  stand(): PoolStand {
    if (this.uhr) this.probe();
    const grenze = Math.floor(this.jetzt() / 1000) - Math.ceil(FENSTER_MS / 1000);
    const f = this.sekunden.filter((x) => x.s > grenze);
    const s = this.stats();
    const belegt = s ? s.connections - s.idle : 0;
    return {
      an: !!this.uhr,
      klassen: [...this.klassen],
      anzahl: this.anzahl,
      wartenMax: f.some((x) => x.warten >= 0) ? Math.round(Math.max(...f.map((x) => x.warten)) * 10) / 10 : null,
      max: this.max,
      offen: s?.connections ?? 0,
      belegt,
      belegtMax: Math.max(belegt, ...f.map((x) => x.belegt)),
      warteschlangeMax: Math.max(s?.waiting ?? 0, ...f.map((x) => x.schlange)),
    };
  }
}

/** Mehrere Prozesse: Stände zusammenzählen (Klassen, Verbindungen) bzw. das Höchste nehmen (Wartezeit). */
export function poolZusammen(staende: Array<PoolStand | null | undefined>): PoolStand | null {
  const s = staende.filter((x): x is PoolStand => !!x);
  if (!s.length) return null;
  const klassen = new Array<number>(KLASSEN_MS.length + 1).fill(0);
  for (const x of s)
    x.klassen.forEach((n, i) => {
      klassen[i] += n;
    });
  const warten = s.map((x) => x.wartenMax).filter((x): x is number => x !== null);
  const summe = (k: 'max' | 'offen' | 'belegt' | 'belegtMax' | 'warteschlangeMax' | 'anzahl') => s.reduce((n, x) => n + x[k], 0);
  return {
    an: s.every((x) => x.an),
    klassen,
    anzahl: summe('anzahl'),
    wartenMax: warten.length ? Math.max(...warten) : null,
    max: summe('max'),
    offen: summe('offen'),
    belegt: summe('belegt'),
    belegtMax: summe('belegtMax'),
    warteschlangeMax: summe('warteschlangeMax'),
  };
}

/**
 * Sitzungen dieser Datenbank jetzt (#874, aus `pg_stat_activity`, ohne diese Abfrage): wie viele auf eine Sperre warten
 * (`wait_event_type = 'Lock'`), wie viele gerade arbeiten, wie viele offen sind – über alle Prozesse und Server – und
 * wie lange die längste Sperre schon wartet (`pg_locks.waitstart`, ab PostgreSQL 14; sonst null).
 */
export interface Sitzungsstand {
  sperren: number;
  sperreMs: number | null;
  aktiv: number;
  offen: number;
}
export async function sitzungsstand(sql: postgres.Sql): Promise<Sitzungsstand | null> {
  try {
    const [a] = await sql`
      SELECT count(*) FILTER (WHERE wait_event_type = 'Lock')::int AS sperren, count(*) FILTER (WHERE state = 'active')::int AS aktiv, count(*)::int AS offen
      FROM pg_stat_activity WHERE datname = current_database() AND backend_type = 'client backend' AND pid <> pg_backend_pid()`;
    let sperreMs: number | null = null;
    if (a.sperren > 0) {
      try {
        const [l] =
          await sql`SELECT round(max(extract(epoch FROM clock_timestamp() - waitstart)) * 1000)::int AS ms FROM pg_locks WHERE NOT granted AND waitstart IS NOT NULL`;
        sperreMs = l?.ms ?? null;
      } catch {
        /* PostgreSQL vor 14: ohne Wartezeit */
      }
    } else sperreMs = 0;
    return { sperren: a.sperren, sperreMs, aktiv: a.aktiv, offen: a.offen };
  } catch {
    return null;
  }
}
