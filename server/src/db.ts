import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import postgres from 'postgres';
import { protokoll } from './protokoll';
import { t } from './sprache';

const log = () => protokoll.modul('datenbank');

/**
 * Zahl der Verbindungen zur Datenbank (#544). Vorgabe bleibt 10: Im Lasttest mit 100 gleichzeitigen Anfragen
 * (realistische Obergrenze für einen Kleinbetrieb) lagen 5, 10 und 20 Verbindungen gleichauf – der Engpass
 * ist die Rechenzeit (Server und PostgreSQL teilen sich die Kerne), nicht die Zahl der Verbindungen. Mehr
 * Verbindungen kosten PostgreSQL je etwa 5–10 MB Arbeitsspeicher und helfen erst mit mehr Kernen; weniger
 * ließen Texterkennung, Sicherung und Anfragen sich gegenseitig ausbremsen. Für größere Installationen
 * einstellbar mit `DMS_DB_VERBINDUNGEN` (2–100); PostgreSQL erlaubt in der Vorgabe 100 Verbindungen insgesamt.
 */
export const VERBINDUNGEN_VORGABE = 10;
export const VERBINDUNGEN_MIN = 2;
export const VERBINDUNGEN_MAX = 100;
/**
 * Mehrere Prozesse (#874): Vorgabe der Verbindungen **zusammen** – 10 wie bisher mit einem Prozess, je weiteren Prozess
 * 4 mehr (2 Prozesse 14, 4 Prozesse 22). Vorher (#745) hatte jeder Prozess 10; auf dem NAS mit PostgreSQL im selben
 * Container wurden 4 Prozesse dadurch nur im Median schneller, p95 nicht (#576): 40 Verbindungen auf eine Datenbank,
 * die sich die Kerne mit Ablago teilt, rechnen nicht schneller, sie warten nur länger auf Sperren und Rechenzeit.
 */
export const VERBINDUNGEN_JE_WEITEREM = 4;
/**
 * Der Leiter bekommt vorab 4 Verbindungen mehr als die anderen Prozesse. Bis 0.266 hielt er davon 3 dauerhaft für
 * Sitzungssperren (Lebenszeichen, Eingangsordner, Postfächer, je `sql.reserve()`), dazu jeder laufende Zeitplan eine –
 * so konnte der Pool verklemmen (#1198). Seit #1198 laufen alle Sperren über **eine** eigene Verbindung
 * ({@link SPERRVERBINDUNGEN}, `sperrverbindung.ts`); die übrigen 3 bleiben dem Leiter für seine Arbeit im Hintergrund
 * (Texterkennung, Ereignisse, Automatisierungen, Zeitpläne).
 */
export const VERBINDUNGEN_LEITER_RESERVIERT = 4;
/**
 * Die Sperrverbindung (#1198) zählt zum Anteil des Leiters: Sein Pool für Anfragen und Arbeit ist um sie kleiner.
 * Weitere Prozesse öffnen sie nur, solange sie eine Sperre halten (Pakete installieren) – kurz eine über ihren Anteil.
 */
export const SPERRVERBINDUNGEN = 1;
/** Größe des Pools für Anfragen und Arbeit: der eigene Anteil, im Leiter ohne die Sperrverbindung (mindestens 1). */
export const poolGroesse = (anteil: number, leiter: boolean) => Math.max(1, anteil - (leiter ? SPERRVERBINDUNGEN : 0));
/**
 * Warten auf eine freie Verbindung (#1198): Nach so vielen Sekunden bricht eine Abfrage ab (QUEUE_TIMEOUT von
 * postgres.js, Antwort 503), statt endlos zu warten. Im Lasttest mit 100 gleichzeitigen Anfragen lag die Wartezeit weit
 * unter einer Sekunde; 30 s erreicht nur ein Pool, der festhängt – und das vor dem Reverse Proxy (oft 60–90 s).
 */
export const VERBINDUNG_WARTEN_S = 30;
/** Ab so langem Warten auf eine Verbindung warnt das Protokoll – mit belegten Verbindungen und laufenden Sperren. */
export const VERBINDUNG_WARNUNG_MS = 10_000;
/** Mindestens so viele für den Leiter: die dauerhaft gehaltenen und 2 für Arbeit. */
export const VERBINDUNGEN_LEITER_MIN = VERBINDUNGEN_LEITER_RESERVIERT + 2;

export const verbindungenVorgabe = (prozesse = 1) => VERBINDUNGEN_VORGABE + VERBINDUNGEN_JE_WEITEREM * Math.max(0, prozesse - 1);

export interface VerbindungsEinstellung { max: number; quelle: 'vorgabe' | 'umgebung'; fehler?: string }

/** `DMS_DB_VERBINDUNGEN`: seit #874 die Zahl für **alle** Prozesse zusammen (mit einem Prozess wie bisher). */
export function verbindungenAus(env: Record<string, string | undefined>, prozesse = 1): VerbindungsEinstellung {
  const vorgabe = verbindungenVorgabe(prozesse);
  const roh = env.DMS_DB_VERBINDUNGEN?.trim();
  if (!roh) return { max: vorgabe, quelle: 'vorgabe' };
  const n = Number(roh);
  if (!Number.isInteger(n) || n < VERBINDUNGEN_MIN || n > VERBINDUNGEN_MAX) {
    return { max: vorgabe, quelle: 'vorgabe', fehler: t('meldungen.db.dms-db-verbindungen-ist', { roh, VERBINDUNGEN_MIN, VERBINDUNGEN_MAX }) };
  }
  return { max: n, quelle: 'umgebung' };
}

/** Für Superuser und andere Programme bleiben so viele Verbindungen der Datenbank frei (#745). */
export const VERBINDUNGEN_RESERVE = 10;

/** Aufteilung der Verbindungen auf die Prozesse (#874). */
export interface Verbindungsaufteilung {
  /** Zusammen für alle Prozesse (nach Anheben bzw. Kürzen). */
  gesamt: number;
  /** Anteil des Leiters (Prozess 1) und jedes weiteren Prozesses. */
  leiter: number;
  andere: number;
  /** Gewünscht war weniger als mindestens nötig (Leiter 4, jeder weitere 2) – angehoben. */
  angehoben: boolean;
  /** Gewünscht war mehr, als die Datenbank erlaubt (`max_connections` − Reserve) – gekürzt. */
  gekuerzt: boolean;
}

/**
 * Mehrere Prozesse (#874): `gewuenscht` gilt für **alle** Prozesse zusammen. Der Leiter behält zuerst seine dauerhaft
 * gehaltenen ({@link VERBINDUNGEN_LEITER_RESERVIERT}); den Rest teilen sich alle Prozesse gleich (abgerundet, mindestens
 * {@link VERBINDUNGEN_MIN}), der Leiter bekommt, was übrig bleibt, insgesamt mindestens {@link VERBINDUNGEN_LEITER_MIN}.
 * Zusammen nie mehr, als die Datenbank erlaubt (`erlaubt` − {@link VERBINDUNGEN_RESERVE}). Mit einem Prozess bekommt er
 * alles – wie bisher.
 */
export function verbindungsaufteilung(gewuenscht: number, prozesse: number, erlaubt: number | null): Verbindungsaufteilung {
  let gesamt = gewuenscht, gekuerzt = false, angehoben = false;
  if (erlaubt && gesamt > erlaubt - VERBINDUNGEN_RESERVE) { gesamt = Math.max(VERBINDUNGEN_MIN, erlaubt - VERBINDUNGEN_RESERVE); gekuerzt = true; }
  if (prozesse <= 1) return { gesamt, leiter: gesamt, andere: 0, angehoben, gekuerzt };
  const mindestens = VERBINDUNGEN_LEITER_MIN + VERBINDUNGEN_MIN * (prozesse - 1);
  if (gesamt < mindestens) { gesamt = mindestens; angehoben = true; }
  let andere = Math.max(VERBINDUNGEN_MIN, Math.floor((gesamt - VERBINDUNGEN_LEITER_RESERVIERT) / prozesse));
  if (gesamt - andere * (prozesse - 1) < VERBINDUNGEN_LEITER_MIN) andere = Math.max(VERBINDUNGEN_MIN, Math.floor((gesamt - VERBINDUNGEN_LEITER_MIN) / (prozesse - 1)));
  return { gesamt, leiter: gesamt - andere * (prozesse - 1), andere, angehoben, gekuerzt };
}

/** Anteil dieses Prozesses (`nr` 1 = Leiter). */
export const verbindungenFuer = (a: Verbindungsaufteilung, nr: number) => (nr <= 1 ? a.leiter : a.andere);

/**
 * postgres.js 4 (#236): `infer: true` behält die Parametertypen von v3 (Date als timestamptz, boolean, bytea …),
 * damit Abfragen ohne ausdrücklichen Typ unverändert laufen.
 */
export function verbinde(url: string, max = VERBINDUNGEN_VORGABE, o: { wartenS?: number } = {}) {
  return postgres(url, { max, onnotice: () => {}, infer: true, ...(o.wartenS ? { queue_timeout: o.wartenS } : {}) });
}

/**
 * Höchstens `ms` warten (#1198): danach gilt `ersatz()`. Die Abfrage selbst läuft weiter (bis zu ihrem eigenen Ende oder
 * {@link VERBINDUNG_WARTEN_S}); ihr Fehler geht dann ins Leere.
 */
export function hoechstens<T>(p: Promise<T>, ms: number, ersatz: () => T): Promise<T> {
  let uhr: NodeJS.Timeout | undefined;
  const grenze = new Promise<T>((ok) => { uhr = setTimeout(() => ok(ersatz()), ms); });
  p.catch(() => {});
  return Promise.race([p, grenze]).finally(() => clearTimeout(uhr));
}

/** Abbruch nach {@link VERBINDUNG_WARTEN_S}: Die Anfrage bekam keine Verbindung (postgres.js, `queue_timeout`). */
export const istVerbindungWarten = (e: unknown) => (e as { code?: unknown } | null)?.code === 'QUEUE_TIMEOUT';

/** Stand des Pools (postgres.js 4: `sql.stats`), null ohne. */
export interface Poolbelegung { verbindungen: number; frei: number; belegt: number; reserviert: number; wartend: number }
export function poolbelegung(sql: postgres.Sql): Poolbelegung | null {
  try {
    const s = (sql as unknown as { stats?: { connections: number; idle: number; leased: number; waiting: number } }).stats;
    return s ? { verbindungen: s.connections, frei: s.idle, belegt: s.connections - s.idle, reserviert: s.leased, wartend: s.waiting } : null;
  } catch { return null; }
}

/** Zwischenspeicher der Gesundheitsprüfung (#1198): so lange gilt ein Ergebnis. */
export const DB_PRUEFUNG_GUELTIG_MS = 5000;
/** Zeitgrenze der Prüfung: Antwortet `SELECT 1` nicht so schnell, gilt die Datenbank als nicht erreichbar. */
export const DB_PRUEFUNG_MS = 5000;

/**
 * Gesundheitsprüfung mit Datenbank (#1198): `/api/gesundheit` (und der Docker-Healthcheck) meldete „gesund“, während
 * keine Anfrage mit Datenbank mehr durchging. Jetzt läuft `SELECT 1` über den Pool der Anfragen mit kurzer Zeitgrenze:
 * Ist keine Verbindung frei oder antwortet die Datenbank nicht, schlägt sie fehl. Keine neue Last: Das Ergebnis gilt
 * {@link DB_PRUEFUNG_GUELTIG_MS}, gleichzeitige Prüfungen teilen sich eine Abfrage, und solange eine frühere noch
 * wartet, kommt keine weitere dazu.
 */
export class Datenbankpruefung {
  private ergebnis: { ok: boolean; t: number } | null = null;
  private laeuft: Promise<boolean> | null = null;
  private haengt: Promise<unknown> | null = null;

  constructor(private sql: postgres.Sql, private o: { gueltigMs?: number; grenzeMs?: number; jetzt?: () => number } = {}) {}

  pruefe(): Promise<boolean> {
    const jetzt = (this.o.jetzt ?? Date.now)();
    if (this.ergebnis && jetzt - this.ergebnis.t < (this.o.gueltigMs ?? DB_PRUEFUNG_GUELTIG_MS)) return Promise.resolve(this.ergebnis.ok);
    this.laeuft ??= this.jetzt().then((ok) => { this.ergebnis = { ok, t: (this.o.jetzt ?? Date.now)() }; return ok; }).finally(() => { this.laeuft = null; });
    return this.laeuft;
  }

  private async jetzt(): Promise<boolean> {
    // Die vorige Abfrage wartet noch (Pool voll): keine zweite in die Schlange stellen.
    if (this.haengt) return false;
    const q = this.sql`SELECT 1`.then(() => true, () => false);
    this.haengt = q;
    void q.finally(() => { if (this.haengt === q) this.haengt = null; });
    let uhr: NodeJS.Timeout | undefined;
    const grenze = new Promise<boolean>((ok) => { uhr = setTimeout(() => ok(false), this.o.grenzeMs ?? DB_PRUEFUNG_MS); });
    try { return await Promise.race([q, grenze]); } finally { clearTimeout(uhr); }
  }
}

/**
 * Warten auf eine freie Verbindung (#544): Alle paar Sekunden läuft `SELECT 1` über denselben Pool wie die
 * Anfragen. Die Abfrage selbst kostet unter einer Millisekunde; was sie länger dauert, hat sie auf eine
 * freie Verbindung gewartet – plus Hin- und Rückweg zum Datenbank-Server und, wenn der Server gerade
 * rechnet, die Wartezeit der Ereignisschleife bis zur Antwort. Die Werte der letzten Minute stehen in
 * Werkbank → Datenbank-Anbindung und im Lasttest.
 */
export class Verbindungswarten {
  private werte: Array<{ t: number; ms: number }> = [];
  private zeitgeber?: NodeJS.Timeout;
  /** `aufteilung` (#874): mit mehreren Prozessen die Zahl zusammen und die Anteile; `max` ist der eigene Anteil. */
  /** Läuft noch eine Messung? Dann keine weitere in die Schlange (sie wartet sonst mit allen anderen, #1198). */
  private offen: Promise<number> | null = null;
  /**
   * `max`: Anteil dieses Prozesses. `o.sperren` (#1198): Wer Sperren hält, steht in der Warnung beim langen Warten;
   * `o.pool`: Größe des Pools ohne die Sperrverbindung (Leiter), für die Belegung.
   */
  constructor(private sql: postgres.Sql, readonly max: number, readonly quelle: VerbindungsEinstellung['quelle'] = 'vorgabe', readonly aufteilung: Verbindungsaufteilung | null = null, private o: { sperren?: { namen(): string[] }; warnungMs?: number; pool?: number } = {}) {}

  private get warnungMs() { return this.o.warnungMs ?? VERBINDUNG_WARNUNG_MS; }

  start(intervallMs = 5000) {
    if (this.zeitgeber) return;
    this.zeitgeber = setInterval(() => void this.probe().catch(() => {}), intervallMs);
    this.zeitgeber.unref();
  }
  stop() { if (this.zeitgeber) clearInterval(this.zeitgeber); this.zeitgeber = undefined; }

  /** Belegung des Pools und gehaltene Sperren (#1198) – für Systemzustand und Warnung. */
  belegung(): (Poolbelegung & { max: number; sperren: string[] }) | null {
    const b = poolbelegung(this.sql);
    return b ? { ...b, max: this.o.pool ?? this.max, sperren: this.o.sperren?.namen() ?? [] } : null;
  }

  /**
   * Eine Messung; gemerkt wird sie für eine Minute. Wartet sie länger als {@link VERBINDUNG_WARNUNG_MS} (#1198), warnt
   * das Protokoll einmal mit der Belegung des Pools und den gehaltenen Sperren – und sagt, wenn es wieder geht.
   */
  probe(): Promise<number> {
    this.offen ??= this.miss().finally(() => { this.offen = null; });
    return this.offen;
  }

  private async miss(): Promise<number> {
    const t0 = performance.now();
    let gewarnt = false;
    const uhr = setTimeout(() => {
      gewarnt = true;
      const b = this.belegung();
      log().warn('Anfragen warten lange auf eine freie Verbindung zur Datenbank', {
        sekunden: Math.round(this.warnungMs / 1000), ...(b ? { pool: b.max, belegt: b.belegt, reserviert: b.reserviert, wartend: b.wartend, sperren: b.sperren.join(', ') || '–' } : {}),
      });
    }, this.warnungMs);
    uhr.unref();
    try { await this.sql`SELECT 1`; } finally { clearTimeout(uhr); }
    const ms = performance.now() - t0;
    if (gewarnt) log().info('Verbindungen zur Datenbank wieder frei', { sekunden: Math.round(ms / 1000) });
    const jetzt = Date.now();
    this.werte.push({ t: jetzt, ms });
    this.werte = this.werte.filter((w) => w.t > jetzt - 60_000);
    return ms;
  }

  stand(): { max: number; quelle: VerbindungsEinstellung['quelle']; messungen: number; median: number | null; p95: number | null; hoechstens: number | null } {
    const s = this.werte.map((w) => w.ms).sort((a, b) => a - b);
    const q = (x: number) => (s.length ? Math.round(s[Math.min(s.length - 1, Math.floor(x * s.length))] * 10) / 10 : null);
    return { max: this.max, quelle: this.quelle, messungen: s.length, median: q(0.5), p95: q(0.95), hoechstens: s.length ? Math.round(s[s.length - 1] * 10) / 10 : null };
  }
}

/**
 * Verklemmung (Deadlock, 40P01) und Serialisierungsfehler (40001) (#575): PostgreSQL bricht einen von zwei
 * Vorgängen ab, die aufeinander warten. Ein erneuter Versuch kurz danach gelingt in aller Regel.
 */
export function istVerklemmung(e: unknown): boolean {
  const code = (e as { code?: unknown } | null)?.code;
  return code === '40P01' || code === '40001';
}

/** Wie oft und wie lange zwischen den Versuchen (#575): 5 Versuche, Wartezeit wächst (50, 100, 200, 400 ms, ±50 %). */
export const VERKLEMMUNG_VERSUCHE = 5;
const VERKLEMMUNG_WARTEN_MS = 50;

/**
 * `f` ausführen; bricht PostgreSQL es wegen einer Verklemmung oder eines Serialisierungsfehlers ab, nach kurzer,
 * zufällig gestreuter Wartezeit noch einmal – höchstens `versuche`-mal. Andere Fehler und der letzte Abbruch gehen
 * an den Aufrufer. `f` muss eine abgeschlossene Einheit sein (eigene Transaktion bzw. Sicherungspunkt).
 */
export async function beiVerklemmungWiederholen<T>(f: () => Promise<T>, o: { versuche?: number; wartenMs?: number; nochmal?: (versuch: number, e: unknown) => void } = {}): Promise<T> {
  const versuche = o.versuche ?? VERKLEMMUNG_VERSUCHE;
  for (let versuch = 1; ; versuch++) {
    try { return await f(); } catch (e) {
      if (!istVerklemmung(e) || versuch >= versuche) throw e;
      o.nochmal?.(versuch, e);
      const ms = (o.wartenMs ?? VERKLEMMUNG_WARTEN_MS) * 2 ** (versuch - 1) * (0.5 + Math.random());
      await new Promise((r) => setTimeout(r, ms));
    }
  }
}

/** Die Datenbank wurde schon von einer neueren Version von Ablago migriert (Sperre gegen Downgrade, #714). */
export class NeuereDatenbankFehler extends Error {
  constructor(readonly unbekannt: string[]) {
    super(
      t('meldungen.db.bitte-diese-oder-eine', { wert: t('meldungen.db.diese-datenbank-stammt-von', { unbekannt: unbekannt[unbekannt.length - 1] }) }),
    );
    this.name = 'NeuereDatenbankFehler';
  }
}

/**
 * Führt alle noch nicht ausgeführten SQL-Dateien aus `verzeichnis` in
 * Namensreihenfolge aus. Alles läuft in einer Transaktion: scheitert eine
 * Migration, bleibt die Datenbank unverändert. Die Transaktionssperre
 * verhindert, dass zwei Instanzen gleichzeitig migrieren. `fortschritt` (#802) bekommt vor jeder offenen
 * Migration Schritt, Anzahl und Datei – für die Startseite „Ablago startet …“.
 */
export async function migriere(sql: postgres.Sql, verzeichnis: string, log: (m: string) => void = console.log, fortschritt: (nr: number, von: number, datei: string) => void = () => {}) {
  const dateien = (await readdir(verzeichnis)).filter((f) => f.endsWith('.sql')).sort();
  await sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(4711001)`;
    await tx`
      CREATE TABLE IF NOT EXISTS schema_migrationen (
        name text PRIMARY KEY,
        ausgefuehrt timestamptz NOT NULL DEFAULT now()
      )`;
    const erledigt = new Set((await tx`SELECT name FROM schema_migrationen`).map((r) => r.name as string));
    // Sperre gegen ein Zurückgehen auf eine ältere Version (#714): Kennt dieses Programm eine
    // schon ausgeführte Migration nicht, stammt die Datenbank von einer neueren Version. Dann
    // nicht starten – eine ältere Version würde neue Spalten (z. B. für Rechte oder Sperren) übersehen.
    const bekannt = new Set(dateien);
    const unbekannt = [...erledigt].filter((n) => !bekannt.has(n)).sort();
    if (unbekannt.length > 0) throw new NeuereDatenbankFehler(unbekannt);
    const offen = dateien.filter((d) => !erledigt.has(d));
    for (const [i, datei] of offen.entries()) {
      fortschritt(i + 1, offen.length, datei);
      await tx.unsafe(await readFile(join(verzeichnis, datei), 'utf8'));
      await tx`INSERT INTO schema_migrationen (name) VALUES (${datei})`;
      log(`Migration ausgeführt: ${datei}`);
    }
  });
}
