import type postgres from 'postgres';
import { kontext } from './protokoll';

/**
 * Weniger Datenbank-Abfragen je Anfrage (#741): „erst weniger fragen, dann sparsam merken“.
 *
 * - **Haushaltsstand in der Datenbank** (Migration 077): je Haushalt eine Zahl `lesen` (Tabelle `haushaltsstand`:
 *   Mappentypen, Ansichten, Pakete, Einstellungen – per Trigger in derselben Transaktion wie die Änderung) und die
 *   Zahl `zahlen` (Sequenz `haushaltsstand_zahlen`: Zahlen der Ansichten, #742). Die Anmeldung liest beide mit der Sitzung in **einer** Abfrage
 *   (`merkeStaende`). Jeder Prozess und jeder Server sieht so dieselbe Zahl: ein zweiter ist höchstens langsamer, nie
 *   falsch.
 * - **Gemerkt über die Anfrage hinaus** (`Lesespeicher`) wird nur, was sich selten ändert und für alle gleich ist:
 *   Mappentypen, Ansichten, Pakete und die Einstellungen aus `GEMERKTE_EINSTELLUNGEN`. Ein Eintrag gilt nur bei
 *   gleichem Stand `lesen`; jede Änderung macht ihn beim nächsten Lesen ungültig. Sitzungen, Personen, Rollen und
 *   Rechte (Lesefilter) werden nie über die Anfrage hinaus gemerkt.
 * - **Einmal je Anfrage** (`jeAnfrage`): Zugriff, Rollen und Alltags-Empfänger. Gilt bis zur nächsten Änderung in
 *   derselben Anfrage und höchstens `IN_ANFRAGE_MS` – das betrifft Hintergrundarbeit, die aus einer Anfrage heraus
 *   startet und länger läuft.
 */

/** So lange gilt ein Stand oder ein Wert aus der Anfrage; danach wird wieder gefragt. */
export const IN_ANFRAGE_MS = 10_000;

/**
 * Einstellungen, die gemerkt werden: für den ganzen Haushalt gleich, ohne Geheimnisse, bei vielen Anfragen gelesen
 * (Messung #741: Zwei-Faktor-Pflicht bei jeder Anfrage, die anderen bei Ablage, Startseite und Mappe). Einstellungen
 * einzelner Personen (`zweifaktor_<id>`, `werkbank_ansicht:<id>` …) und Zugangsdaten stehen bewusst nicht darin.
 */
export const GEMERKTE_EINSTELLUNGEN: ReadonlySet<string> = new Set([
  'zweifaktor_pflicht', 'zweifaktor_pflicht_seit', 'aufgaben_empfaenger', 'post', 'papierkorb', 'favoriten_sicht',
  'favoriten_freigabe', 'stempel', 'erkennung_typen', 'ablageort', 'datenschutz', 'paket_verwehrt', 'ki_typen', 'suche', 'vektoren',
  'historie', 'wiederherstellung_abschluss',
  // Merkmale der Ablage (#1032): jede Prüfung von Rechten, Ansichten und Pflichtfeldern liest sie.
  'merkmale',
]);

/** `mappen` (#918, Sequenz `haushaltsstand_mappen`): wie `zahlen`, aber ohne Favoriten. */
export type Standart = 'lesen' | 'zahlen' | 'mappen';

/** Eine Änderung in dieser Anfrage: Stände und Werte der Anfrage gelten nicht mehr. */
export function merkeAenderung(): void {
  const k = kontext.getStore();
  if (k) k.aenderungen = (k.aenderungen ?? 0) + 1;
}

/** Stände aus der Datenbank für die laufende Anfrage merken (Anmeldung, nach dem Hochzählen). */
export function merkeStaende(quelle: object, haushalt: string, werte: Partial<Record<Standart, number>>): void {
  const k = kontext.getStore();
  if (!k) return;
  const da = k.staende;
  const gleich = da && da.quelle === quelle && da.haushalt === haushalt && da.aenderungen === (k.aenderungen ?? 0);
  k.staende = { quelle, haushalt, werte: gleich ? { ...da.werte, ...werte } : { ...werte }, aenderungen: k.aenderungen ?? 0, zeit: gleich ? da.zeit : Date.now() };
}

/** Stand aus der Anfrage, wenn er noch gilt (gleiche Verbindung und Haushalt, keine Änderung seitdem, kurz genug). */
export function standAusAnfrage(quelle: object, haushalt: string, art: Standart): number | undefined {
  const s = kontext.getStore()?.staende;
  if (!s || s.quelle !== quelle || s.haushalt !== haushalt || s.aenderungen !== (kontext.getStore()?.aenderungen ?? 0)) return undefined;
  if (Date.now() - s.zeit > IN_ANFRAGE_MS) return undefined;
  return s.werte[art];
}

const zahl = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));

/** SQL-Ausdrücke für beide Stände – für die Abfrage der Sitzung (konto-repo.ts). */
export function standSpalten(sql: postgres.Sql, haushalt: string) {
  return sql`(SELECT lesen FROM haushaltsstand WHERE haushalt_id = ${haushalt}) AS stand_lesen,
    (SELECT last_value FROM haushaltsstand_zahlen) AS stand_zahlen, (SELECT last_value FROM haushaltsstand_mappen) AS stand_mappen`;
}
/** Stände aus einer Zeile mit `standSpalten` übernehmen. */
export function staendeAusZeile(sql: postgres.Sql, haushalt: string, r: Record<string, unknown>): void {
  merkeStaende(sql, haushalt, { lesen: zahl(r.stand_lesen), zahlen: zahl(r.stand_zahlen), mappen: zahl(r.stand_mappen) });
}

/** Ein Stand: aus der Anfrage, sonst eine kleine Abfrage (eine Zahl). */
export async function liesStand(sql: postgres.Sql, haushalt: string, art: Standart): Promise<number> {
  const da = standAusAnfrage(sql, haushalt, art);
  if (da !== undefined) return da;
  const [r] = await sql`SELECT ${standSpalten(sql, haushalt)}`;
  const werte = { lesen: zahl(r.stand_lesen), zahlen: zahl(r.stand_zahlen), mappen: zahl(r.stand_mappen) };
  merkeStaende(sql, haushalt, werte);
  return werte[art];
}

/**
 * Stand `zahlen` hochzählen (#742), nach einer Änderung, die Zahlen ändern kann; liefert den neuen Stand. Eine Sequenz
 * für alle Haushalte der Datenbank: kein Warten auf eine gesperrte Zeile; ein anderer Haushalt zählt höchstens einmal
 * zu viel neu.
 */
export async function erhoeheZahlenstand(sql: postgres.Sql): Promise<number> {
  const [r] = await sql`SELECT nextval('haushaltsstand_zahlen') AS stand`;
  return zahl(r.stand);
}

/** Stand `mappen` hochzählen (#918): wie `erhoeheZahlenstand`, nach Änderungen, die mehr als Favoriten betreffen. */
export async function erhoeheMappenstand(sql: postgres.Sql): Promise<number> {
  const [r] = await sql`SELECT nextval('haushaltsstand_mappen') AS stand`;
  return zahl(r.stand);
}

/**
 * Wert einmal je Anfrage bilden (Zugriff, Rollen). Außerhalb einer Anfrage, nach einer Änderung in dieser Anfrage oder
 * nach `IN_ANFRAGE_MS` neu.
 */
export function jeAnfrage<T>(schluessel: string, bilde: () => Promise<T>): Promise<T> {
  const k = kontext.getStore();
  if (!k) return bilde();
  const m = (k.jeAnfrage ??= new Map());
  const aenderungen = k.aenderungen ?? 0;
  const da = m.get(schluessel);
  if (da && da.aenderungen === aenderungen && Date.now() - da.zeit <= IN_ANFRAGE_MS) return da.wert as Promise<T>;
  const wert = bilde();
  m.set(schluessel, { aenderungen, zeit: Date.now(), wert });
  wert.catch(() => { if (m.get(schluessel)?.wert === wert) m.delete(schluessel); });
  return wert;
}

/** Höchstens so viele Einträge je Lesespeicher (es gibt nur wenige Schlüssel; Schutz gegen Fehler). */
const MAX_EINTRAEGE = 64;

/**
 * Gemerktes für alle (Mappentypen, Ansichten, Pakete, Einstellungen), gültig bei gleichem Stand `lesen`. Jeder Abruf
 * bekommt eine eigene Kopie – niemand kann das Gemerkte für andere verändern.
 */
export class Lesespeicher {
  private eintraege = new Map<string, { stand: number; wert: Promise<unknown> }>();
  constructor(private readonly stand: () => Promise<number>) {}

  async hole<T>(schluessel: string, lade: () => Promise<T>): Promise<T> {
    const stand = await this.stand();
    const da = this.eintraege.get(schluessel);
    if (da && da.stand === stand) return structuredClone(await da.wert) as T;
    const wert = lade();
    // Ein älterer Stand (langsame Anfrage) verdrängt keinen neueren.
    if (!da || da.stand < stand) {
      this.eintraege.delete(schluessel);
      this.eintraege.set(schluessel, { stand, wert });
      if (this.eintraege.size > MAX_EINTRAEGE) this.eintraege.delete(this.eintraege.keys().next().value!);
    }
    try {
      return structuredClone(await wert);
    } catch (e) {
      if (this.eintraege.get(schluessel)?.wert === wert) this.eintraege.delete(schluessel);
      throw e;
    }
  }

  /** Für Tests und den Systemzustand: Zahl der Einträge. */
  get groesse() { return this.eintraege.size; }
  leere() { this.eintraege.clear(); }
}

const speicher = new WeakMap<object, Map<string, Lesespeicher>>();

/** Der Lesespeicher einer Verbindung und eines Haushalts (gemeinsam für alle Repos und Einstellungen darauf). */
export function lesespeicherFuer(sql: postgres.Sql, haushalt: string): Lesespeicher {
  let m = speicher.get(sql);
  if (!m) speicher.set(sql, (m = new Map()));
  let l = m.get(haushalt);
  if (!l) m.set(haushalt, (l = new Lesespeicher(() => liesStand(sql, haushalt, 'lesen'))));
  return l;
}
