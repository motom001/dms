/**
 * Paket-Läufer (#338): führt einen Aufruf eines Pakets in einem eigenen Worker-Thread aus.
 *
 * Das WebAssembly-Modul ruft die Funktionen des DMS synchron auf (`dms.api` …). Der Worker schickt die
 * Anfrage an den Läufer-Prozess und wartet mit Atomics.wait, bis die Antwort da ist (receiveMessageOnPort).
 * Endet der Aufruf nicht rechtzeitig, beendet der Läufer den ganzen Worker (terminate).
 */
import { parentPort, receiveMessageOnPort, workerData, type MessagePort } from 'node:worker_threads';
import { SEITE, type Modulpruefung } from './modul';
import { WasiEnde, wasiImporte } from './wasi';

export interface ArbeiterDaten {
  modul: WebAssembly.Module;
  pruefung: Modulpruefung;
  /** Obergrenze des Speichers in Seiten. */
  speicherSeiten: number;
  eingang: { art: 'ereignis' | 'aktion'; json: string };
  signal: SharedArrayBuffer;
  port: MessagePort;
  /** Wartezeit auf eine Antwort des Läufers (ms). */
  warten: number;
}
/** Anfrage des Moduls an den Läufer; die Antwort kommt als { status, body } zurück. */
export type Hostanfrage =
  | { art: 'api'; json: string; body?: Uint8Array }
  | { art: 'netz'; json: string; body?: Uint8Array; strom?: boolean }
  /** Nächstes Stück einer mit netz_strom geöffneten Antwort (#444). */
  | { art: 'netz_weiter' }
  | { art: 'datei'; name: string }
  | { art: 'speicher_lesen'; schluessel: string }
  | { art: 'speicher_schreiben'; schluessel: string; wert: Uint8Array };
export interface Hostantwort { status: number; body: Uint8Array }
export type ArbeiterMeldung = { art: 'log'; stufe: number; text: string } | { art: 'teil'; text: string } | { art: 'ende'; rc: number | null; ergebnis: string; speicher: number; fehler?: string };

/** Ergebnis eines Aufrufs (Zeichen): genug für einen Vektor als JSON (#442); die Werkbank zeigt davon nur den Anfang. */
const MAX_ERGEBNIS = 64_000;
/** Teile einer Antwort (#444, dms.teil): je Teil und zusammen höchstens so viele Zeichen. */
const MAX_TEIL = 8_000;

function lauf(d: ArbeiterDaten) {
  const sig = new Int32Array(d.signal);
  const enc = new TextEncoder(), dec = new TextDecoder();
  let speicher: WebAssembly.Memory | null = null;
  let antwort: Uint8Array = new Uint8Array(0);
  let ergebnis = '';
  let teile = 0;
  const melde = (m: ArbeiterMeldung) => d.port.postMessage(m);
  const bytes = (p: number, l: number) => {
    if (!speicher || p < 0 || l < 0 || p + l > speicher.buffer.byteLength) throw new Error('Zeiger außerhalb des Speichers.');
    return new Uint8Array(speicher.buffer, p, l);
  };
  const text = (p: number, l: number) => dec.decode(bytes(p, l));
  /** Synchron beim Läufer nachfragen. */
  const frage = (a: Hostanfrage): Hostantwort => {
    Atomics.store(sig, 0, 0);
    d.port.postMessage({ art: 'frage', anfrage: a });
    if (Atomics.wait(sig, 0, 0, d.warten) === 'timed-out') throw new Error('Keine Antwort vom DMS.');
    const m = receiveMessageOnPort(d.port);
    if (!m) throw new Error('Antwort des DMS fehlt.');
    return m.message as Hostantwort;
  };
  const merke = (r: Hostantwort) => { antwort = r.body; return r.status; };
  const kopie = (p: number, l: number) => new Uint8Array(bytes(p, l));
  const dms: Record<string, (...a: number[]) => number> = {
    api: (p, l) => merke(frage({ art: 'api', json: text(p, l) })),
    api_binaer: (p, l, bp, bl) => merke(frage({ art: 'api', json: text(p, l), body: kopie(bp, bl) })),
    netz: (p, l, bp, bl) => merke(frage({ art: 'netz', json: text(p, l), ...(bl > 0 ? { body: kopie(bp, bl) } : {}) })),
    // Antwort Stück für Stück (#444): netz_strom liefert den Status, netz_weiter je Aufruf das nächste Stück
    // (Länge; 0 = Ende, < 0 = Fehler), lesbar mit antwort_lesen.
    netz_strom: (p, l, bp, bl) => merke(frage({ art: 'netz', strom: true, json: text(p, l), ...(bl > 0 ? { body: kopie(bp, bl) } : {}) })),
    netz_weiter: () => { const r = frage({ art: 'netz_weiter' }); antwort = r.body; return r.status === 200 ? r.body.length : r.status === 0 ? 0 : r.status < 0 ? r.status : -1; },
    // Teil einer Antwort an das DMS (#444) – z. B. für die Anzeige beim Schreiben; das Ergebnis bleibt maßgeblich.
    teil: (p, l) => {
      const t = text(p, Math.min(l, MAX_TEIL * 4)).slice(0, MAX_TEIL);
      if (teile + t.length > MAX_ERGEBNIS) return -1;
      teile += t.length;
      if (t) melde({ art: 'teil', text: t });
      return 0;
    },
    datei: (p, l) => { const r = frage({ art: 'datei', name: text(p, l) }); antwort = r.body; return r.status === 200 ? r.body.length : -1; },
    antwort_laenge: () => antwort.length,
    antwort_lesen: (p, max) => { const n = Math.min(antwort.length, max); bytes(p, n).set(antwort.subarray(0, n)); return n; },
    ergebnis: (p, l) => { ergebnis = text(p, Math.min(l, MAX_ERGEBNIS * 4)).slice(0, MAX_ERGEBNIS); return 0; },
    log: (stufe, p, l) => { melde({ art: 'log', stufe, text: text(p, Math.min(l, 8000)).slice(0, 2000) }); return 0; },
    speicher_lesen: (p, l) => { const r = frage({ art: 'speicher_lesen', schluessel: text(p, l) }); antwort = r.body; return r.status === 200 ? r.body.length : -1; },
    speicher_schreiben: (p, l, vp, vl) => frage({ art: 'speicher_schreiben', schluessel: text(p, l), wert: kopie(vp, vl) }).status === 200 ? 0 : -1,
  };
  try {
    const max = Math.min(d.speicherSeiten, d.pruefung.speicherMax ?? d.speicherSeiten);
    if (d.pruefung.speicherMin > max) throw new Error(`Das Modul braucht mindestens ${Math.ceil(d.pruefung.speicherMin * SEITE / 1048576)} MB Speicher, erlaubt sind ${Math.floor(max * SEITE / 1048576)} MB.`);
    speicher = new WebAssembly.Memory({ initial: d.pruefung.speicherMin, maximum: max });
    const wasi = wasiImporte(() => speicher!, (zeile, fd) => melde({ art: 'log', stufe: fd === 2 ? 2 : 1, text: zeile }), d.pruefung.wasi);
    const inst = new WebAssembly.Instance(d.modul, { env: { memory: speicher }, wasi_snapshot_preview1: wasi, dms: Object.fromEntries(d.pruefung.dms.map((n) => [n, dms[n]])) });
    const x = inst.exports as Record<string, (...a: number[]) => number>;
    x._initialize?.();
    const ein = enc.encode(d.eingang.json);
    const ptr = x.dms_puffer(ein.length);
    if (!ptr) throw new Error('dms_puffer lieferte keinen Platz.');
    bytes(ptr, ein.length).set(ein);
    const f = d.eingang.art === 'aktion' ? x.dms_aktion : x.dms_ereignis;
    if (!f) throw new Error('Das Paket hat keine Aktionen (dms_aktion fehlt).');
    const rc = f(ptr, ein.length);
    melde({ art: 'ende', rc, ergebnis, speicher: speicher.buffer.byteLength });
  } catch (e) {
    const fehler = e instanceof WasiEnde ? (e.code === 0 ? '' : e.message)
      : e instanceof RangeError && /memory|stack/i.test(e.message) ? `Speichergrenze erreicht: ${e.message}`
      : e instanceof WebAssembly.RuntimeError ? `Abbruch im Modul: ${e.message}` : (e as Error).message;
    melde({ art: 'ende', rc: e instanceof WasiEnde ? e.code : null, ergebnis, speicher: speicher?.buffer.byteLength ?? 0, ...(fehler ? { fehler } : {}) });
  }
}

if (parentPort && workerData) lauf(workerData as ArbeiterDaten);
