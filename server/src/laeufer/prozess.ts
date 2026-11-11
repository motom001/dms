/**
 * Paket-Läufer (#338): eigener Prozess, vom DMS gestartet und überwacht.
 *
 * - Hält die geprüften Module der installierten Pakete mit Code.
 * - Führt Aufrufe (Ereignisse, Aktionen) je in einem frischen Worker-Thread aus – mit Grenzen für Speicher,
 *   Zeit und gleichzeitige Aufrufe.
 * - Anfragen der Module an die API gehen an das DMS (das sie mit dem Schlüssel des Dienstkontos ausführt);
 *   Netzanfragen führt der Läufer selbst aus, aber nur zu den Adressen aus dem Manifest und zur bestätigten
 *   Dienst-Adresse aus den Einstellungen (#444).
 *
 * Kommunikation mit dem DMS über IPC (process.send mit serialization „advanced“).
 */
import { MessageChannel, Worker } from 'node:worker_threads';
import type { ArbeiterDaten, ArbeiterMeldung, Hostanfrage, Hostantwort } from './arbeiter';
import { ladeArgumente, pruefeModul, SEITE, type Modulpruefung } from './modul';
import { t } from '../sprache';
import { MB, NETZ_LANG_AB, NETZ_MAX, NETZ_TOKEN_LESEN } from '../grenzen';
import { liesToken } from '../../../shared/src/extern';

export interface Grenzen { speicherMB: number; sekunden: number; parallel: number }
/** adressen: bestätigte Dienst-Adressen aus den Einstellungen (#444) – auch http, z. B. ein Ollama im Heimnetz. */
export interface PaketImLaeufer { id: string; version: string; modul: Uint8Array; daten: Array<{ name: string; inhalt: Uint8Array }>; netz: string[]; adressen?: string[] }
/** Nachrichten DMS → Läufer. */
export type AnLaeufer =
  /** pakete: neue bzw. geänderte Pakete (werden neu geladen); behalten: unveränderte, schon geladene (#403). Alle anderen fallen weg. */
  | { art: 'pakete'; pakete: PaketImLaeufer[]; behalten?: string[]; grenzen: Grenzen }
  /** vorrang: vor die wartenden Aufrufe (z. B. Vektor eines Suchbegriffs, #442 – jemand wartet darauf). */
  | { art: 'aufruf'; nr: number; paket: string; eingang: { art: 'ereignis' | 'aktion'; json: string }; vorrang?: boolean }
  | { art: 'antwort'; nr: number; antwort: Hostantwort };
/** Nachrichten Läufer → DMS. */
export type VomLaeufer =
  | { art: 'bereit' }
  | { art: 'geladen'; pakete: Array<{ id: string; fehler: string | null; speicherMinMB: number | null }> }
  /** aufruf: Nummer des Aufrufs, aus dem die Frage kommt (#1039: Paket-Aktionen fragen mit eigenem, eingeschränktem Zugriff). */
  | { art: 'frage'; nr: number; paket: string; aufruf?: number; anfrage: Exclude<Hostanfrage, { art: 'netz' } | { art: 'netz_weiter' } | { art: 'datei' }> }
  /** Teil einer Antwort (#444, dms.teil), gehört zum Aufruf nr. */
  | { art: 'teil'; nr: number; paket: string; text: string }
  | { art: 'log'; paket: string; stufe: number; text: string }
  | { art: 'ergebnis'; nr: number; paket: string; ok: boolean; rc: number | null; text: string; ms: number; speicherMB: number; fehler: string | null; netz?: NetzEintrag[]; messung?: NetzMessung };

/**
 * Messung der Netzaufrufe eines Aufrufs (#565), im Läufer gestoppt und mit dem Ergebnis zurückgegeben: Anzahl, Dauer
 * bis zur ersten Antwort (Kopf) und gesamt (Summe), Bytes, Fehler, Zeitüberschreitungen und Token aus der Antwort
 * eines KI-Dienstes (`usage`). Nur Zahlen – keine Hosts, keine Inhalte. Abgelehnte Aufrufe zählen nicht (nichts ging hinaus).
 */
export interface NetzMessung { anzahl: number; ersteMs: number; ms: number; hin: number; zurueck: number; fehler: number; zeit: number; tokenEin: number; tokenAus: number }
/** Ein einzelner Netzaufruf, solange er läuft. */
interface NetzUhr { start: number; erste: number | null; zurueck: number; ein: number | null; aus: number | null; rest: string; fertig: boolean; json: boolean; status: number }
/** Messung eines einzelnen Netzaufrufs (#565): Kopf da, Stücke der Antwort, Ende. */
export interface NetzAufrufMessung { kopf(r: { status: number; headers: { get(n: string): string | null } }): void; stueck(b: Uint8Array): void; ende(x: 'ok' | 'fehler' | 'zeit'): void }
/** Messung der Netzaufrufe eines Aufrufs (#565). */
export function netzMesser() {
  const m: NetzMessung = { anzahl: 0, ersteMs: 0, ms: 0, hin: 0, zurueck: 0, fehler: 0, zeit: 0, tokenEin: 0, tokenAus: 0 };
  const offen = new Set<NetzUhr>();
  const ende = (u: NetzUhr, ergebnis: 'ok' | 'fehler' | 'zeit') => {
    if (u.fertig) return;
    u.fertig = true; offen.delete(u);
    const jetzt = performance.now();
    m.anzahl++; m.ms += jetzt - u.start; m.ersteMs += (u.erste ?? jetzt) - u.start; m.zurueck += u.zurueck;
    m.tokenEin += u.ein ?? 0; m.tokenAus += u.aus ?? 0;
    // Eine Antwort 5xx zählt als Fehler des Dienstes.
    const x = ergebnis === 'ok' && u.status >= 500 ? 'fehler' : ergebnis;
    if (x === 'fehler') m.fehler++; else if (x === 'zeit') m.zeit++;
  };
  /** Ein Stück der Antwort: Bytes zählen, Token lesen (das Ende des vorigen Stücks davor, falls ein Name geteilt wurde). */
  const stueck = (u: NetzUhr, b: Uint8Array) => {
    u.zurueck += b.length;
    if (!u.json) return;
    const text = u.rest + new TextDecoder().decode(b.length > NETZ_TOKEN_LESEN ? b.subarray(b.length - NETZ_TOKEN_LESEN) : b);
    const x = liesToken(text);
    if (x.ein !== null) u.ein = x.ein;
    if (x.aus !== null) u.aus = x.aus;
    u.rest = text.slice(-200);
  };
  return {
    /** Ab hier geht etwas hinaus (`hin` Bytes). */
    aufruf(hin: number): NetzAufrufMessung {
      m.hin += hin;
      const u: NetzUhr = { start: performance.now(), erste: null, zurueck: 0, ein: null, aus: null, rest: '', fertig: false, json: false, status: 0 };
      offen.add(u);
      return {
        kopf: (r) => { u.erste ??= performance.now(); u.status = r.status; u.json = /json|event-stream|ndjson/i.test(r.headers.get('content-type') ?? ''); },
        stueck: (b) => stueck(u, b),
        ende: (x) => ende(u, x),
      };
    },
    /** Am Ende des Aufrufs: offene (z. B. abgebrochene Ströme) schließen; null ohne Netzaufruf. */
    ergebnis(): NetzMessung | null {
      for (const u of [...offen]) ende(u, 'ok');
      return m.anzahl ? { ...m, ms: Math.round(m.ms), ersteMs: Math.round(m.ersteMs) } : null;
    },
  };
}
type NetzMesser = ReturnType<typeof netzMesser>;
const istZeit = (e: unknown) => /zeitgrenze|timeout/i.test(`${(e as Error)?.name ?? ''} ${(e as Error)?.message ?? ''} ${String((e as Error & { cause?: unknown })?.cause ?? '')}`);

/**
 * Netzaufrufe eines Aufrufs fürs Protokoll (#807): je Methode, Host, Status und ob abgelehnt zusammengefasst – mit
 * Anzahl und Bytes hin und zurück. Nur der Host (mit Port), nie Pfad, Query, Zugangsdaten, Köpfe oder Inhalte.
 * status null: keine Antwort (abgelehnt, Netzfehler, Zeitgrenze).
 */
export interface NetzEintrag { zeit: string; bis: string; methode: string; host: string; status: number | null; anzahl: number; hin: number; zurueck: number; abgelehnt?: true }
/** Erfasst einen Netzaufruf; liefert den Eintrag, damit eine Antwort Stück für Stück ihre Bytes nachtragen kann. */
type NetzLog = (x: { methode: string; url: string; status: number | null; hin: number; zurueck: number; abgelehnt?: boolean }) => NetzEintrag;

/** Host einer Adresse fürs Protokoll – ohne Pfad, Query und Zugangsdaten; bei ungültiger Adresse ein Platzhalter. */
export function netzHost(url: string): string {
  try { return new URL(url).host || '?'; } catch { return '?'; }
}

/** Methode eines Netzaufrufs (Standard GET): nur `^[A-Z]{1,10}$` nach Großschreibung, sonst null (abgelehnt). */
export function netzMethode(m: unknown): string | null {
  const x = m === undefined || m === null ? 'GET' : typeof m === 'string' ? m.toUpperCase() : '';
  return /^[A-Z]{1,10}$/.test(x) ? x : null;
}

/** Netzaufrufe eines Aufrufs sammeln (#807): gleiche (Methode, Host, Status, abgelehnt) zählen in einen Eintrag. */
export function netzSammler(): { log: NetzLog; liste(): NetzEintrag[] } {
  const m = new Map<string, NetzEintrag>();
  return {
    log: (x) => {
      const host = netzHost(x.url);
      const methode = /^[A-Z]{1,10}$/.test(x.methode) ? x.methode : '?';
      const k = `${methode}|${host}|${x.status}|${x.abgelehnt ? 1 : 0}`;
      const jetzt = new Date().toISOString();
      let e = m.get(k);
      if (!e) { e = { zeit: jetzt, bis: jetzt, methode, host, status: x.status, anzahl: 0, hin: 0, zurueck: 0, ...(x.abgelehnt ? { abgelehnt: true as const } : {}) }; m.set(k, e); }
      e.anzahl++; e.hin += x.hin; e.zurueck += x.zurueck; e.bis = jetzt;
      return e;
    },
    liste: () => [...m.values()],
  };
}

const NETZ_MS = 30_000;

interface Geladen { info: PaketImLaeufer; modul: WebAssembly.Module | null; pruefung: Modulpruefung | null; fehler: string | null; daten: Map<string, Uint8Array> }
let pakete = new Map<string, Geladen>();
let grenzen: Grenzen = { speicherMB: 256, sekunden: 120, parallel: 2 };
let laufend = 0;
const warteschlange: Array<Extract<AnLaeufer, { art: 'aufruf' }>> = [];
/** Offene Fragen an das DMS: nr → Rückgabe. */
const offen = new Map<number, (a: Hostantwort) => void>();
let naechsteNr = 1;

const sende = (m: VomLaeufer) => process.send?.(m);
const bytes = (t: string) => new TextEncoder().encode(t);
const fehlerAntwort = (status: number, t: string): Hostantwort => ({ status, body: bytes(t) });

function lade(liste: PaketImLaeufer[], behalten: string[] = []) {
  const neu = new Map<string, Geladen>();
  // Unveränderte Pakete behalten ihr übersetztes Modul – nur das geänderte wird neu geladen (#403).
  for (const id of behalten) { const g = pakete.get(id); if (g) neu.set(id, g); }
  for (const p of liste) {
    let modul: WebAssembly.Module | null = null, pruefung: Modulpruefung | null = null, fehler: string | null = null;
    try { modul = new WebAssembly.Module(p.modul); pruefung = pruefeModul(modul, p.modul); } catch (e) { fehler = (e as Error).message; }
    neu.set(p.id, { info: p, modul, pruefung, fehler, daten: new Map(p.daten.map((d) => [d.name, d.inhalt])) });
  }
  pakete = neu;
  sende({ art: 'geladen', pakete: [...neu.values()].map((g) => ({ id: g.info.id, fehler: g.fehler, speicherMinMB: g.pruefung ? Math.ceil(g.pruefung.speicherMin * SEITE / MB) : null })) });
}

/** Liegt url unter der Adresse e (gleicher Ursprung, gleicher Pfad oder darunter)? */
function unter(u: URL, e: string): boolean {
  let x: URL;
  try { x = new URL(e); } catch { return false; }
  return x.origin === u.origin && (u.pathname === x.pathname || u.pathname.startsWith(x.pathname.endsWith('/') ? x.pathname : `${x.pathname}/`) || x.pathname === '/');
}

/**
 * Netz nur zu Adressen aus dem Manifest (https) und zu bestätigten Dienst-Adressen aus den Einstellungen
 * (#444, http oder https): gleicher Ursprung und Pfad darunter; keine Zugangsdaten, keine Weiterleitungen.
 */
export function netzErlaubt(url: string, erlaubt: string[], adressen: string[] = []): boolean {
  let u: URL;
  try { u = new URL(url); } catch { return false; }
  if (u.username || u.password) return false;
  if (u.protocol === 'https:' && erlaubt.some((e) => unter(u, e))) return true;
  return (u.protocol === 'https:' || u.protocol === 'http:') && adressen.some((e) => unter(u, e));
}

/** Eine mit netz_strom geöffnete Antwort (#444): wird Stück für Stück gelesen, je Aufruf höchstens eine. */
interface Strom { leser: ReadableStreamDefaultReader<Uint8Array>; gelesen: number; ende: AbortController; eintrag?: NetzEintrag; messung?: NetzAufrufMessung }

async function netz(g: Geladen, json: string, body: Uint8Array | undefined, strom: { setze(s: Strom | null): void; ms: number } | null, z: { log: NetzLog; messer: NetzMesser }): Promise<Hostantwort> {
  const { log } = z;
  let a: { methode?: string; url?: string; kopf?: Record<string, string> };
  try { a = JSON.parse(json); } catch { return fehlerAntwort(-1, t('meldungen.prozess.ungueltige-anfrage-json')); }
  const url = String(a.url ?? '');
  // Methode nur als schlichtes Wort aus Großbuchstaben (#807, Sicherheit): sonst abgelehnt, im Protokoll als „?“.
  const methode = netzMethode(a.methode);
  const hin = body?.length ?? 0;
  if (!methode) { log({ methode: '?', url, status: null, hin: 0, zurueck: 0, abgelehnt: true }); return fehlerAntwort(-1, t('meldungen.prozess.ungueltige-methode')); }
  // Abgelehnt (#807): steht als Warnung im Protokoll des Pakets – nur der Host, nichts hinausgegangen.
  if (!netzErlaubt(url, g.info.netz, g.info.adressen)) { log({ methode, url, status: null, hin: 0, zurueck: 0, abgelehnt: true }); return fehlerAntwort(-2, t('meldungen.prozess.netz-gesperrt-steht-weder', { url })); }
  const kopf = Object.fromEntries(Object.entries(a.kopf ?? {}).filter(([k]) => !/^(host|cookie|authorization-dms)$/i.test(k)).map(([k, v]) => [k, String(v)]));
  // Stück für Stück: Die ganze Antwort darf so lange dauern wie der Aufruf; jedes Stück höchstens NETZ_MS.
  const ende = new AbortController();
  // Hochladen in Teilen (#585, z. B. ein Stück einer Sicherung): ab 1 MB Körper darf die Anfrage so lange dauern wie der Aufruf.
  const lang = (body?.length ?? 0) > NETZ_LANG_AB;
  const uhr = setTimeout(() => ende.abort(new Error('Zeitgrenze erreicht')), strom ? strom.ms : lang ? grenzen.sekunden * 1000 : NETZ_MS);
  uhr.unref?.();
  let r: Response;
  // Messung (#565): ab hier geht etwas hinaus.
  const mu = z.messer.aufruf(hin);
  const fehlerArt = (e: unknown) => (istZeit(e) || ende.signal.aborted ? 'zeit' : 'fehler');
  try {
    r = await fetch(url, { method: methode, headers: kopf, body: body && body.length ? body : undefined, redirect: 'manual', signal: ende.signal });
  } catch (e) { clearTimeout(uhr); mu.ende(fehlerArt(e)); log({ methode, url, status: null, hin, zurueck: 0 }); return fehlerAntwort(-4, `Netzfehler: ${(e as Error).message}`); }
  mu.kopf(r);
  // Ins Protokoll (#807): Bytes hin und zurück; bei einer Antwort Stück für Stück zählt netzWeiter nach.
  const eintrag = log({ methode, url, status: r.status, hin, zurueck: 0 });
  try {
    if (strom && r.body) {
      strom.setze({ leser: r.body.getReader(), gelesen: 0, ende, eintrag, messung: mu });
      return { status: r.status, body: new Uint8Array(0) };
    }
    const buf = new Uint8Array(await r.arrayBuffer());
    clearTimeout(uhr);
    eintrag.zurueck += buf.length;
    mu.stueck(buf);
    mu.ende('ok');
    if (buf.length > NETZ_MAX) return fehlerAntwort(-3, t('meldungen.prozess.antwort-zu-gross'));
    return { status: r.status, body: buf };
  } catch (e) { clearTimeout(uhr); mu.ende(fehlerArt(e)); return fehlerAntwort(-4, `Netzfehler: ${(e as Error).message}`); }
}

/** Nächstes Stück einer geöffneten Antwort: 200 mit Bytes, 0 am Ende, < 0 bei Fehler. */
async function netzWeiter(s: Strom | null): Promise<Hostantwort> {
  if (!s) return fehlerAntwort(-1, t('meldungen.prozess.keine-antwort-geoeffnet-erst'));
  let uhr: ReturnType<typeof setTimeout> | undefined;
  try {
    const r = await Promise.race([
      s.leser.read(),
      new Promise<never>((_, nein) => { uhr = setTimeout(() => nein(new Error(`kein Stück innerhalb von ${NETZ_MS / 1000} s`)), NETZ_MS); }),
    ]);
    if (r.done) { s.messung?.ende('ok'); return { status: 0, body: new Uint8Array(0) }; }
    s.gelesen += r.value.length;
    if (s.eintrag) s.eintrag.zurueck += r.value.length;
    s.messung?.stueck(r.value);
    if (s.gelesen > NETZ_MAX) { s.ende.abort(); s.messung?.ende('fehler'); return fehlerAntwort(-3, t('meldungen.prozess.antwort-zu-gross')); }
    return { status: 200, body: r.value };
  } catch (e) { s.ende.abort(); s.messung?.ende(istZeit(e) ? 'zeit' : 'fehler'); return fehlerAntwort(-4, `Netzfehler: ${(e as Error).message}`); }
  finally { clearTimeout(uhr); }
}

function frageDms(paket: string, anfrage: Extract<VomLaeufer, { art: 'frage' }>['anfrage'], aufruf: number): Promise<Hostantwort> {
  const nr = naechsteNr++;
  return new Promise((ok) => { offen.set(nr, ok); sende({ art: 'frage', nr, paket, aufruf, anfrage }); });
}

function weiter() {
  while (laufend < grenzen.parallel && warteschlange.length) void fuehreAus(warteschlange.shift()!);
}

async function fuehreAus(a: Extract<AnLaeufer, { art: 'aufruf' }>) {
  const g = pakete.get(a.paket);
  const start = Date.now();
  const ende = (x: Omit<Extract<VomLaeufer, { art: 'ergebnis' }>, 'art' | 'nr' | 'paket' | 'ms'>) => sende({ art: 'ergebnis', nr: a.nr, paket: a.paket, ms: Date.now() - start, ...x });
  if (!g?.modul || !g.pruefung) { ende({ ok: false, rc: null, text: '', speicherMB: 0, fehler: g?.fehler ?? t('meldungen.prozess.das-paket-ist-nicht') }); return; }
  laufend++;
  const kanal = new MessageChannel();
  const signal = new SharedArrayBuffer(4);
  const sig = new Int32Array(signal);
  const daten: ArbeiterDaten = { modul: g.modul, pruefung: g.pruefung, speicherSeiten: Math.floor(grenzen.speicherMB * MB / SEITE), eingang: a.eingang, signal, port: kanal.port2, warten: grenzen.sekunden * 1000 };
  const url = new URL(import.meta.url.endsWith('.ts') ? './arbeiter.ts' : './arbeiter.mjs', import.meta.url);
  // Worker-Heap klein (die Daten liegen im WebAssembly-Speicher), Stapel groß (Tesseract rekursiert tief).
  let w: Worker;
  try {
    w = new Worker(url, { workerData: daten, transferList: [kanal.port2], resourceLimits: { maxOldGenerationSizeMb: 64, maxYoungGenerationSizeMb: 16, stackSizeMb: 32 }, execArgv: ladeArgumente(process.execArgv) });
  } catch (e) {
    laufend--; kanal.port1.close();
    ende({ ok: false, rc: null, text: '', speicherMB: 0, fehler: t('meldungen.prozess.der-aufruf-liess-sich', { message: (e as Error).message }) });
    weiter();
    return;
  }
  let fertig = false;
  let strom: Strom | null = null;
  const netzLog = netzSammler();
  const messer = netzMesser();
  const schluss = (x: Parameters<typeof ende>[0]) => {
    if (fertig) return;
    fertig = true; clearTimeout(uhr); kanal.port1.close();
    strom?.ende.abort(); strom = null;
    void w.terminate();
    const n = netzLog.liste();
    const m = messer.ergebnis();
    laufend--; ende({ ...x, ...(n.length ? { netz: n } : {}), ...(m ? { messung: m } : {}) }); weiter();
  };
  const uhr = setTimeout(() => schluss({ ok: false, rc: null, text: '', speicherMB: 0, fehler: t('meldungen.prozess.zeitgrenze-erreicht-s-abgebrochen', { sekunden: grenzen.sekunden }) }), grenzen.sekunden * 1000);
  const antworte = (r: Hostantwort) => { if (fertig) return; kanal.port1.postMessage(r); Atomics.store(sig, 0, 1); Atomics.notify(sig, 0); };
  kanal.port1.on('message', (m: ArbeiterMeldung | { art: 'frage'; anfrage: Hostanfrage }) => {
    if (m.art === 'log') { sende({ art: 'log', paket: a.paket, stufe: m.stufe, text: m.text }); return; }
    if (m.art === 'teil') { if (!fertig) sende({ art: 'teil', nr: a.nr, paket: a.paket, text: m.text }); return; }
    // Fehlercode mit Text in ergebnis (#444): Der Text ist die Meldung (z. B. „KI-Dienst nicht erreichbar“).
    if (m.art === 'ende') { schluss({ ok: !m.fehler && m.rc === 0, rc: m.rc, text: m.ergebnis, speicherMB: Math.round(m.speicher / MB), fehler: m.fehler ?? (m.rc === 0 ? null : m.ergebnis.trim() ? m.ergebnis.trim().slice(0, 500) : t('meldungen.prozess.das-paket-meldet-fehler', { rc: String(m.rc) })) }); return; }
    const q = m.anfrage;
    if (q.art === 'netz') {
      // Eine neue Anfrage schließt eine noch offene Antwort.
      if (q.strom) { strom?.ende.abort(); strom = null; }
      void netz(g, q.json, q.body, q.strom ? { setze: (x) => { if (fertig) x?.ende.abort(); else strom = x; }, ms: grenzen.sekunden * 1000 } : null, { log: netzLog.log, messer }).then(antworte);
      return;
    }
    if (q.art === 'netz_weiter') { void netzWeiter(strom).then((r) => { if (r.status !== 200) strom = null; antworte(r); }); return; }
    if (q.art === 'datei') { const d = g.daten.get(q.name); antworte(d ? { status: 200, body: d } : fehlerAntwort(404, t('meldungen.prozess.datei-gibt-es-nicht'))); return; }
    void frageDms(a.paket, q, a.nr).then(antworte);
  });
  w.on('error', (e: Error) => schluss({ ok: false, rc: null, text: '', speicherMB: 0, fehler: /ERR_WORKER_OUT_OF_MEMORY|heap/i.test(`${(e as NodeJS.ErrnoException).code} ${e.message}`) ? t('meldungen.prozess.speichergrenze-erreicht', { message: e.message }) : e.message }));
  // Die Meldung „ende“ kommt über einen eigenen Kanal und kann nach dem Ende des Workers eintreffen: kurz warten.
  w.on('exit', (c) => setTimeout(() => schluss({ ok: false, rc: null, text: '', speicherMB: 0, fehler: t('meldungen.prozess.der-aufruf-endete-unerwartet', { c }) }), 250));
}

process.on('message', (m: AnLaeufer) => {
  if (m.art === 'pakete') { grenzen = m.grenzen; lade(m.pakete, m.behalten); return; }
  if (m.art === 'aufruf') { if (m.vorrang) warteschlange.unshift(m); else warteschlange.push(m); weiter(); return; }
  if (m.art === 'antwort') { const f = offen.get(m.nr); offen.delete(m.nr); f?.(m.antwort); }
});
// Fehler im Läufer selbst beenden ihn nicht still: melden, das DMS startet ihn neu.
process.on('uncaughtException', (e) => { process.stderr.write(t('meldungen.prozess.paket-laeufer', { wert: e.stack ?? e.message })); process.exit(1); });
process.on('unhandledRejection', (e) => { process.stderr.write(t('meldungen.prozess.paket-laeufer', { wert: (e as Error)?.stack ?? String(e) })); process.exit(1); });
// Ohne DMS kein Läufer: endet die Verbindung, endet der Prozess.
process.on('disconnect', () => process.exit(0));
if (process.send) sende({ art: 'bereit' });
