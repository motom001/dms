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
  | { art: 'frage'; nr: number; paket: string; anfrage: Exclude<Hostanfrage, { art: 'netz' } | { art: 'netz_weiter' } | { art: 'datei' }> }
  /** Teil einer Antwort (#444, dms.teil), gehört zum Aufruf nr. */
  | { art: 'teil'; nr: number; paket: string; text: string }
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
interface Strom { leser: ReadableStreamDefaultReader<Uint8Array>; gelesen: number; ende: AbortController }

async function netz(g: Geladen, json: string, body: Uint8Array | undefined, strom: { setze(s: Strom | null): void; ms: number } | null): Promise<Hostantwort> {
  let a: { methode?: string; url?: string; kopf?: Record<string, string> };
  try { a = JSON.parse(json); } catch { return fehlerAntwort(-1, 'Ungültige Anfrage (JSON).'); }
  const url = String(a.url ?? '');
  if (!netzErlaubt(url, g.info.netz, g.info.adressen)) return fehlerAntwort(-2, `Netz gesperrt: ${url} steht weder im Manifest noch ist es die bestätigte Dienst-Adresse.`);
  const kopf = Object.fromEntries(Object.entries(a.kopf ?? {}).filter(([k]) => !/^(host|cookie|authorization-dms)$/i.test(k)).map(([k, v]) => [k, String(v)]));
  // Stück für Stück: Die ganze Antwort darf so lange dauern wie der Aufruf; jedes Stück höchstens NETZ_MS.
  const ende = new AbortController();
  const uhr = setTimeout(() => ende.abort(new Error('Zeitgrenze erreicht')), strom ? strom.ms : NETZ_MS);
  uhr.unref?.();
  try {
    const r = await fetch(url, { method: (a.methode ?? 'GET').toUpperCase(), headers: kopf, body: body && body.length ? body : undefined, redirect: 'manual', signal: ende.signal });
    if (strom && r.body) {
      strom.setze({ leser: r.body.getReader(), gelesen: 0, ende });
      return { status: r.status, body: new Uint8Array(0) };
    }
    const buf = new Uint8Array(await r.arrayBuffer());
    clearTimeout(uhr);
    if (buf.length > NETZ_MAX) return fehlerAntwort(-3, 'Antwort zu groß.');
    return { status: r.status, body: buf };
  } catch (e) { clearTimeout(uhr); return fehlerAntwort(-4, `Netzfehler: ${(e as Error).message}`); }
}

/** Nächstes Stück einer geöffneten Antwort: 200 mit Bytes, 0 am Ende, < 0 bei Fehler. */
async function netzWeiter(s: Strom | null): Promise<Hostantwort> {
  if (!s) return fehlerAntwort(-1, 'Keine Antwort geöffnet (erst netz_strom).');
  let uhr: ReturnType<typeof setTimeout> | undefined;
  try {
    const r = await Promise.race([
      s.leser.read(),
      new Promise<never>((_, nein) => { uhr = setTimeout(() => nein(new Error(`kein Stück innerhalb von ${NETZ_MS / 1000} s`)), NETZ_MS); }),
    ]);
    if (r.done) return { status: 0, body: new Uint8Array(0) };
    s.gelesen += r.value.length;
    if (s.gelesen > NETZ_MAX) { s.ende.abort(); return fehlerAntwort(-3, 'Antwort zu groß.'); }
    return { status: 200, body: r.value };
  } catch (e) { s.ende.abort(); return fehlerAntwort(-4, `Netzfehler: ${(e as Error).message}`); }
  finally { clearTimeout(uhr); }
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
  let strom: Strom | null = null;
  const schluss = (x: Parameters<typeof ende>[0]) => {
    if (fertig) return;
    fertig = true; clearTimeout(uhr); kanal.port1.close();
    strom?.ende.abort(); strom = null;
    void w.terminate();
    laufend--; ende(x); weiter();
  };
  const uhr = setTimeout(() => schluss({ ok: false, rc: null, text: '', speicherMB: 0, fehler: `Zeitgrenze erreicht (${grenzen.sekunden} s) – abgebrochen.` }), grenzen.sekunden * 1000);
  const antworte = (r: Hostantwort) => { if (fertig) return; kanal.port1.postMessage(r); Atomics.store(sig, 0, 1); Atomics.notify(sig, 0); };
  kanal.port1.on('message', (m: ArbeiterMeldung | { art: 'frage'; anfrage: Hostanfrage }) => {
    if (m.art === 'log') { sende({ art: 'log', paket: a.paket, stufe: m.stufe, text: m.text }); return; }
    if (m.art === 'teil') { if (!fertig) sende({ art: 'teil', nr: a.nr, paket: a.paket, text: m.text }); return; }
    // Fehlercode mit Text in ergebnis (#444): Der Text ist die Meldung (z. B. „KI-Dienst nicht erreichbar“).
    if (m.art === 'ende') { schluss({ ok: !m.fehler && m.rc === 0, rc: m.rc, text: m.ergebnis, speicherMB: Math.round(m.speicher / 1048576), fehler: m.fehler ?? (m.rc === 0 ? null : m.ergebnis.trim() ? m.ergebnis.trim().slice(0, 500) : `Das Paket meldet Fehler ${m.rc}.`) }); return; }
    const q = m.anfrage;
    if (q.art === 'netz') {
      // Eine neue Anfrage schließt eine noch offene Antwort.
      if (q.strom) { strom?.ende.abort(); strom = null; }
      void netz(g, q.json, q.body, q.strom ? { setze: (x) => { if (fertig) x?.ende.abort(); else strom = x; }, ms: grenzen.sekunden * 1000 } : null).then(antworte);
      return;
    }
    if (q.art === 'netz_weiter') { void netzWeiter(strom).then((r) => { if (r.status !== 200) strom = null; antworte(r); }); return; }
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
