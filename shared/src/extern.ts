import { t } from './texte';
/**
 * Externe Dienste (#565): Laufzeit, Datenmenge, Fehler und – bei KI-Diensten – Token und geschätzte Kosten. Server und
 * Oberfläche teilen diese Datei. Gemessen wird nur, was über die Leitung geht: Dienst, Paket, Funktion, Dauer, Bytes,
 * Ergebnis und die Zahl der Token aus der Antwort (`usage`) – nie Inhalte (Fragen, Antworten, Mails, Adressen, Pfade).
 */

/** KI-Dienst (Pakete mit Inhalten und Netz, #796), Postfach-Abruf, Versand, Anmeldung über einen Anbieter, Netz der übrigen Pakete. */
export const EXTERNE_DIENSTE = ['ki', 'imap', 'smtp', 'oidc', 'netz'] as const;
export type ExternerDienst = typeof EXTERNE_DIENSTE[number];
/** ok; fehler (Antwort mit Fehler oder keine Verbindung); zeit (Zeitüberschreitung). */
export type ExternErgebnis = 'ok' | 'fehler' | 'zeit';

/** Ein Aufruf eines externen Dienstes – nur Metadaten. */
export interface ExternAufruf {
  dienst: ExternerDienst;
  /** Paket (KI-Dienst, Netz der Pakete); sonst null. */
  paket: string | null;
  /** Wofür (z. B. „antworten“, „volltext.fertig“, „abruf“); nie ein freier Text des Pakets. */
  funktion: string | null;
  /** Bis zur ersten Antwort (ms); null = keine Antwort. */
  ersteMs: number | null;
  /** Gesamtdauer (ms). */
  ms: number;
  /** Bytes hinaus und herein (soweit bekannt). */
  hin: number;
  zurueck: number;
  ergebnis: ExternErgebnis;
  tokenEin: number;
  tokenAus: number;
}

/** Rohdaten (je Aufruf) so viele Tage – deckt einen ganzen Monat für „teuerste Abfragen“; danach nur Monatssummen. */
export const ROH_TAGE = 35;
/** Monatssummen so viele Monate. */
export const MONATE = 24;
/** Warnung ab diesem Anteil des Monatsbudgets. */
export const WARNUNG_AB = 0.8;
/** Je Anfrage höchstens so viele Aufrufe einzeln im Header Server-Timing (die Summe zählt alle). */
export const TIMING_MAX = 5;

/** Preis je 1 Mio. Token (Eingabe, Ausgabe) eines KI-Pakets. */
export interface Preis { ein: number; aus: number }
/** Einstellung `extern_kosten` (Werkbank → Systemzustand → KI-Kosten). */
export interface KostenEinstellung {
  /** Paket-Id → Preis je 1 Mio. Token; ohne Eintrag kostenlos (z. B. ein lokaler Dienst). */
  preise: Record<string, Preis>;
  /** Währung (ISO 4217), Vorgabe EUR. */
  waehrung: string;
  /** Monatsbudget; null = keins. */
  budget: number | null;
  /** Harte Grenze: Beim Erreichen pausieren die kostenpflichtigen KI-Funktionen bis zum Monatsanfang. */
  hart: boolean;
}
export const KOSTEN_STANDARD: KostenEinstellung = { preise: {}, waehrung: 'EUR', budget: null, hart: false };
export const PREIS_MAX = 100_000;
export const BUDGET_MAX = 10_000_000;

const paketId = /^[a-z0-9][a-z0-9._-]{0,99}$/;

const objekt = (x: unknown) => (x && typeof x === 'object' && !Array.isArray(x) ? x as Record<string, unknown> : {});
const leer = (x: unknown) => x === '' || x === null || x === undefined;

/** Preise je Paket prüfen: ungültige Kennungen fallen weg, 0 und leer heißen kostenlos. */
function pruefePreise(roh: Record<string, unknown>, fehler: Record<string, string>): Record<string, Preis> {
  const preise: Record<string, Preis> = {};
  for (const [id, p] of Object.entries(roh).slice(0, 100)) {
    if (!paketId.test(id)) continue;
    const q = objekt(p);
    const zahl = (k: 'ein' | 'aus') => {
      const n = leer(q[k]) ? 0 : Number(q[k]);
      if (Number.isFinite(n) && n >= 0 && n <= PREIS_MAX) return Math.round(n * 10_000) / 10_000;
      fehler[`preise.${id}.${k}`] = t('gemeinsam.extern.preis-bereich', { max: PREIS_MAX });
      return 0;
    };
    const preis = { ein: zahl('ein'), aus: zahl('aus') };
    if (preis.ein || preis.aus) preise[id] = preis;
  }
  return preise;
}

/** Einstellung prüfen; Fehler je Feld (`preise.<paket>.ein`, `budget`, `waehrung`). */
export function pruefeKosten(e: unknown): { wert: KostenEinstellung; fehler: Record<string, string> } {
  const x = objekt(e);
  const fehler: Record<string, string> = {};
  const preise = pruefePreise(objekt(x.preise), fehler);
  const w = typeof x.waehrung === 'string' ? x.waehrung.trim().toUpperCase() : '';
  if (w && !/^[A-Z]{3}$/.test(w)) fehler.waehrung = t('gemeinsam.extern.waehrung');
  let budget: number | null = null;
  if (!leer(x.budget)) {
    const n = Number(x.budget);
    if (Number.isFinite(n) && n > 0 && n <= BUDGET_MAX) budget = Math.round(n * 100) / 100;
    else fehler.budget = t('gemeinsam.extern.budget-bereich', { max: BUDGET_MAX });
  }
  return { wert: { preise, waehrung: /^[A-Z]{3}$/.test(w) ? w : 'EUR', budget, hart: budget !== null && x.hart === true }, fehler };
}

/** Gespeicherte Einstellung lesen (ungültige Teile fallen weg). */
export const liesKosten = (e: unknown): KostenEinstellung => pruefeKosten(e).wert;

/** Geschätzte Kosten eines Aufrufs in der Währung der Einstellung. */
export function kostenFuer(tokenEin: number, tokenAus: number, p: Preis | undefined): number {
  if (!p) return 0;
  return (Math.max(0, tokenEin) * p.ein + Math.max(0, tokenAus) * p.aus) / 1_000_000;
}

/** Erster Tag des Monats von `d` (Ortszeit des Servers bzw. Browsers). */
export const monatsanfang = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
export const naechsterMonat = (d: Date) => new Date(d.getFullYear(), d.getMonth() + 1, 1);
/** „2026-11“ */
export const monatSchluessel = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
/** „2026-11“ → Anfang; ungültig → null. */
export function monatAus(s: unknown): Date | null {
  const m = typeof s === 'string' ? /^(\d{4})-(\d{2})$/.exec(s) : null;
  if (!m) return null;
  const j = Number(m[1]), mo = Number(m[2]);
  return mo >= 1 && mo <= 12 && j >= 2000 && j <= 2999 ? new Date(j, mo - 1, 1) : null;
}

export interface BudgetStand {
  budget: number | null;
  summe: number;
  /** Anteil am Budget (0–…); null ohne Budget. */
  anteil: number | null;
  /** Ab 80 %. */
  warnung: boolean;
  erreicht: boolean;
  /** Harte Grenze erreicht: Monatsanfang (ISO), bis zu dem kostenpflichtige KI-Funktionen pausieren. */
  pausiertBis: string | null;
}

export function budgetStand(summe: number, e: KostenEinstellung, jetzt: Date): BudgetStand {
  if (e.budget === null || e.budget <= 0) return { budget: null, summe, anteil: null, warnung: false, erreicht: false, pausiertBis: null };
  const anteil = summe / e.budget;
  const erreicht = anteil >= 1;
  return { budget: e.budget, summe, anteil, warnung: anteil >= WARNUNG_AB, erreicht, pausiertBis: erreicht && e.hart ? naechsterMonat(jetzt).toISOString() : null };
}

/** Kennzahlen einer Reihe von Aufrufen (Systemzustand, Paketansicht). */
export interface ExternKennzahlen {
  anzahl: number; fehler: number; zeit: number;
  mittelMs: number | null; p50Ms: number | null; p95Ms: number | null;
  /** Mittel bis zur ersten Antwort. */
  ersteMs: number | null;
  hin: number; zurueck: number; tokenEin: number; tokenAus: number;
  letzter: string | null;
}

/** Perzentil (0–100) über sortierte Werte, nächster Rang. */
export function perzentil(sortiert: number[], p: number): number | null {
  if (!sortiert.length) return null;
  const i = Math.min(sortiert.length - 1, Math.max(0, Math.ceil((p / 100) * sortiert.length) - 1));
  return sortiert[i];
}

export function kennzahlen(liste: Array<Pick<ExternAufruf, 'ms' | 'ersteMs' | 'ergebnis' | 'hin' | 'zurueck' | 'tokenEin' | 'tokenAus'> & { zeit?: string }>): ExternKennzahlen {
  const ms = liste.map((a) => a.ms).sort((a, b) => a - b);
  const erste = liste.map((a) => a.ersteMs).filter((x): x is number => x !== null);
  const summe = (f: (a: typeof liste[number]) => number) => liste.reduce((n, a) => n + f(a), 0);
  const r = (x: number | null) => (x === null ? null : Math.round(x));
  return {
    anzahl: liste.length, fehler: liste.filter((a) => a.ergebnis === 'fehler').length, zeit: liste.filter((a) => a.ergebnis === 'zeit').length,
    mittelMs: ms.length ? Math.round(summe((a) => a.ms) / ms.length) : null, p50Ms: r(perzentil(ms, 50)), p95Ms: r(perzentil(ms, 95)),
    ersteMs: erste.length ? Math.round(erste.reduce((n, x) => n + x, 0) / erste.length) : null,
    hin: summe((a) => a.hin), zurueck: summe((a) => a.zurueck), tokenEin: summe((a) => a.tokenEin), tokenAus: summe((a) => a.tokenAus),
    letzter: liste.reduce<string | null>((m, a) => (a.zeit && (!m || a.zeit > m) ? a.zeit : m), null),
  };
}

/**
 * Token aus einer Antwort eines KI-Dienstes (`usage`): nur Zahlen hinter bekannten Namen – OpenAI (prompt_tokens,
 * completion_tokens), Anthropic (input_tokens, output_tokens), Ollama (prompt_eval_count, eval_count), Gemini
 * (promptTokenCount, candidatesTokenCount). Gilt für ganze Antworten und Stücke eines Stroms (JSON, NDJSON, SSE); der
 * letzte Wert zählt (Ströme melden laufende Summen). Der Text wird nur gelesen, nie gespeichert.
 */
const TOKEN = /"(prompt_tokens|input_tokens|prompt_eval_count|promptTokenCount|completion_tokens|output_tokens|eval_count|candidatesTokenCount)"\s*:\s*(\d{1,9})/g;
const EIN = new Set(['prompt_tokens', 'input_tokens', 'prompt_eval_count', 'promptTokenCount']);
export function liesToken(text: string): { ein: number | null; aus: number | null } {
  let ein: number | null = null, aus: number | null = null;
  for (const m of text.matchAll(TOKEN)) {
    if (EIN.has(m[1])) ein = Number(m[2]); else aus = Number(m[2]);
  }
  return { ein, aus };
}

/* ---------- Header Server-Timing (#477): Eintrag `extern` ---------- */

/** Nur sichere Zeichen in der Beschreibung (kein Komma, kein Anführungszeichen). */
const sauber = (x: string | null) => (x ?? '').replace(/[^a-z0-9._:-]/gi, '').slice(0, 60);

/**
 * `extern;dur=<Summe>;desc="<Anzahl>"`, dazu je Aufruf (höchstens TIMING_MAX) `extern-<n>;dur=<ms>;desc="<dienst>~<paket>~<erste>~<bytes>~<ergebnis>"`.
 * Leere Liste: kein Eintrag.
 */
export function externTiming(liste: ExternAufruf[]): string {
  if (!liste.length) return '';
  const summe = liste.reduce((n, a) => n + a.ms, 0);
  const teile = [`extern;dur=${summe.toFixed(1)};desc="${liste.length}"`];
  liste.slice(0, TIMING_MAX).forEach((a, i) => teile.push(`extern-${i + 1};dur=${a.ms.toFixed(1)};desc="${[a.dienst, sauber(a.paket), a.ersteMs === null ? '' : Math.round(a.ersteMs), a.hin + a.zurueck, a.ergebnis].join('~')}"`));
  return teile.join(', ');
}

/** Ein Aufruf im Messpanel (aus Server-Timing). */
export interface ExternMessung { dienst: string; paket: string | null; ersteMs: number | null; ms: number; bytes: number; ergebnis: string }

/** Einträge `extern-<n>` aus dem Header lesen. */
export function liesExternTiming(kopf: string): { summe?: number; anzahl?: number; aufrufe: ExternMessung[] } {
  const aufrufe: ExternMessung[] = [];
  let summe: number | undefined, anzahl: number | undefined;
  for (const teil of kopf.split(',')) {
    const name = /^\s*(extern(?:-\d+)?)\b/.exec(teil)?.[1];
    if (!name) continue;
    const dur = Number(/;\s*dur=([\d.]+)/.exec(teil)?.[1] ?? NaN);
    const desc = /;\s*desc="?([^";]*)"?/.exec(teil)?.[1] ?? '';
    if (name === 'extern') { summe = Number.isFinite(dur) ? dur : undefined; anzahl = Number(desc) || 0; continue; }
    const [dienst, paket, erste, bytes, ergebnis] = desc.split('~');
    if (!dienst || !Number.isFinite(dur)) continue;
    aufrufe.push({ dienst, paket: paket || null, ersteMs: erste === '' || erste === undefined ? null : Number(erste), ms: dur, bytes: Number(bytes) || 0, ergebnis: ergebnis || 'ok' });
  }
  return { summe, anzahl, aufrufe };
}
