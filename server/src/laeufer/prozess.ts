/**
 * Paket-Läufer (#338): eigener Prozess, vom DMS gestartet und überwacht.
 *
 * - Hält die geprüften Module der installierten Pakete mit Code.
 * - Führt Aufrufe (Ereignisse, Aktionen) je in einem frischen Worker-Thread aus – mit Grenzen für Speicher,
 *   Zeit und gleichzeitige Aufrufe.
 * - Anfragen der Module an die API gehen an das DMS (das sie mit dem Schlüssel des Dienstkontos ausführt);
 *   Netzanfragen führt der Läufer selbst aus, aber nur zu den Adressen aus dem Manifest.
 *
 * Kommunikation mit dem DMS über IPC (process.send mit serialization „advanced“).
 */
import { MessageChannel, Worker } from 'node:worker_threads';
import type { ArbeiterDaten, ArbeiterMeldung, Hostanfrage, Hostantwort } from './arbeiter';
import { ladeArgumente, pruefeModul, SEITE, type Modulpruefung } from './modul';

export interface Grenzen { speicherMB: number; sekunden: number; parallel: number }
export interface PaketImLaeufer { id: string; version: string; modul: Uint8Array; daten: Array<{ name: string; inhalt: Uint8Array }>; netz: string[] }
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
  | { art: 'frage'; nr: number; paket: string; anfrage: Exclude<Hostanfrage, { art: 'netz' } | { art: 'datei' }> }
  | { art: 'log'; paket: string; stufe: number; text: string }
  | { art: 'ergebnis'; nr: number; paket: string; ok: boolean; rc: number | null; text: string; ms: number; speicherMB: number; fehler: string | null };

const NETZ_MAX = 10 * 1024 * 1024;
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
  sende({ art: 'geladen', pakete: [...neu.values()].map((g) => ({ id: g.info.id, fehler: g.fehler, speicherMinMB: g.pruefung ? Math.ceil(g.pruefung.speicherMin * SEITE / 1048576) : null })) });
}

/** Netz nur zu Adressen aus dem Manifest: gleicher Ursprung und Pfad darunter; keine Weiterleitungen. */
export function netzErlaubt(url: string, erlaubt: string[]): boolean {
  let u: URL;
  try { u = new URL(url); } catch { return false; }
  if (u.protocol !== 'https:' || u.username || u.password) return false;
  return erlaubt.some((e) => { const x = new URL(e); return x.origin === u.origin && (u.pathname === x.pathname || u.pathname.startsWith(x.pathname.endsWith('/') ? x.pathname : `${x.pathname}/`) || x.pathname === '/'); });
}

async function netz(g: Geladen, json: string, body?: Uint8Array): Promise<Hostantwort> {
  let a: { methode?: string; url?: string; kopf?: Record<string, string> };
  try { a = JSON.parse(json); } catch { return fehlerAntwort(-1, 'Ungültige Anfrage (JSON).'); }
  const url = String(a.url ?? '');
  if (!netzErlaubt(url, g.info.netz)) return fehlerAntwort(-2, `Netz gesperrt: ${url} steht nicht im Manifest.`);
  const kopf = Object.fromEntries(Object.entries(a.kopf ?? {}).filter(([k]) => !/^(host|cookie|authorization-dms)$/i.test(k)).map(([k, v]) => [k, String(v)]));
  try {
    const r = await fetch(url, { method: (a.methode ?? 'GET').toUpperCase(), headers: kopf, body: body && body.length ? body : undefined, redirect: 'manual', signal: AbortSignal.timeout(NETZ_MS) });
    const buf = new Uint8Array(await r.arrayBuffer());
    if (buf.length > NETZ_MAX) return fehlerAntwort(-3, 'Antwort zu groß.');
    return { status: r.status, body: buf };
  } catch (e) { return fehlerAntwort(-4, `Netzfehler: ${(e as Error).message}`); }
}

function frageDms(paket: string, anfrage: Extract<VomLaeufer, { art: 'frage' }>['anfrage']): Promise<Hostantwort> {
  const nr = naechsteNr++;
  return new Promise((ok) => { offen.set(nr, ok); sende({ art: 'frage', nr, paket, anfrage }); });
}

function weiter() {
  while (laufend < grenzen.parallel && warteschlange.length) void fuehreAus(warteschlange.shift()!);
}

async function fuehreAus(a: Extract<AnLaeufer, { art: 'aufruf' }>) {
  const g = pakete.get(a.paket);
  const start = Date.now();
  const ende = (x: Omit<Extract<VomLaeufer, { art: 'ergebnis' }>, 'art' | 'nr' | 'paket' | 'ms'>) => sende({ art: 'ergebnis', nr: a.nr, paket: a.paket, ms: Date.now() - start, ...x });
  if (!g?.modul || !g.pruefung) { ende({ ok: false, rc: null, text: '', speicherMB: 0, fehler: g?.fehler ?? 'Das Paket ist nicht geladen.' }); return; }
  laufend++;
  const kanal = new MessageChannel();
  const signal = new SharedArrayBuffer(4);
  const sig = new Int32Array(signal);
  const daten: ArbeiterDaten = { modul: g.modul, pruefung: g.pruefung, speicherSeiten: Math.floor(grenzen.speicherMB * 1048576 / SEITE), eingang: a.eingang, signal, port: kanal.port2, warten: grenzen.sekunden * 1000 };
  const url = new URL(import.meta.url.endsWith('.ts') ? './arbeiter.ts' : './arbeiter.mjs', import.meta.url);
  // Worker-Heap klein (die Daten liegen im WebAssembly-Speicher), Stapel groß (Tesseract rekursiert tief).
  let w: Worker;
  try {
    w = new Worker(url, { workerData: daten, transferList: [kanal.port2], resourceLimits: { maxOldGenerationSizeMb: 64, maxYoungGenerationSizeMb: 16, stackSizeMb: 32 }, execArgv: ladeArgumente(process.execArgv) });
  } catch (e) {
    laufend--; kanal.port1.close();
    ende({ ok: false, rc: null, text: '', speicherMB: 0, fehler: `Der Aufruf ließ sich nicht starten: ${(e as Error).message}` });
    weiter();
    return;
  }
  let fertig = false;
  const schluss = (x: Parameters<typeof ende>[0]) => {
    if (fertig) return;
    fertig = true; clearTimeout(uhr); kanal.port1.close();
    void w.terminate();
    laufend--; ende(x); weiter();
  };
  const uhr = setTimeout(() => schluss({ ok: false, rc: null, text: '', speicherMB: 0, fehler: `Zeitgrenze erreicht (${grenzen.sekunden} s) – abgebrochen.` }), grenzen.sekunden * 1000);
  const antworte = (r: Hostantwort) => { if (fertig) return; kanal.port1.postMessage(r); Atomics.store(sig, 0, 1); Atomics.notify(sig, 0); };
  kanal.port1.on('message', (m: ArbeiterMeldung | { art: 'frage'; anfrage: Hostanfrage }) => {
    if (m.art === 'log') { sende({ art: 'log', paket: a.paket, stufe: m.stufe, text: m.text }); return; }
    if (m.art === 'ende') { schluss({ ok: !m.fehler && m.rc === 0, rc: m.rc, text: m.ergebnis, speicherMB: Math.round(m.speicher / 1048576), fehler: m.fehler ?? (m.rc === 0 ? null : `Das Paket meldet Fehler ${m.rc}.`) }); return; }
    const q = m.anfrage;
    if (q.art === 'netz') { void netz(g, q.json, q.body).then(antworte); return; }
    if (q.art === 'datei') { const d = g.daten.get(q.name); antworte(d ? { status: 200, body: d } : fehlerAntwort(404, 'Datei gibt es nicht.')); return; }
    void frageDms(a.paket, q).then(antworte);
  });
  w.on('error', (e: Error) => schluss({ ok: false, rc: null, text: '', speicherMB: 0, fehler: /ERR_WORKER_OUT_OF_MEMORY|heap/i.test(`${(e as NodeJS.ErrnoException).code} ${e.message}`) ? `Speichergrenze erreicht: ${e.message}` : e.message }));
  // Die Meldung „ende“ kommt über einen eigenen Kanal und kann nach dem Ende des Workers eintreffen: kurz warten.
  w.on('exit', (c) => setTimeout(() => schluss({ ok: false, rc: null, text: '', speicherMB: 0, fehler: `Der Aufruf endete unerwartet (Code ${c}).` }), 250));
}

process.on('message', (m: AnLaeufer) => {
  if (m.art === 'pakete') { grenzen = m.grenzen; lade(m.pakete, m.behalten); return; }
  if (m.art === 'aufruf') { if (m.vorrang) warteschlange.unshift(m); else warteschlange.push(m); weiter(); return; }
  if (m.art === 'antwort') { const f = offen.get(m.nr); offen.delete(m.nr); f?.(m.antwort); }
});
// Fehler im Läufer selbst beenden ihn nicht still: melden, das DMS startet ihn neu.
process.on('uncaughtException', (e) => { process.stderr.write(`Paket-Läufer: ${e.stack ?? e.message}\n`); process.exit(1); });
process.on('unhandledRejection', (e) => { process.stderr.write(`Paket-Läufer: ${(e as Error)?.stack ?? String(e)}\n`); process.exit(1); });
// Ohne DMS kein Läufer: endet die Verbindung, endet der Prozess.
process.on('disconnect', () => process.exit(0));
if (process.send) sende({ art: 'bereit' });
