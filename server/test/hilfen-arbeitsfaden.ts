/** Arbeiter nur für die Tests des Pools (#542): schlafen, Fehler werfen, abstürzen, Buffer zurückgeben. */
import { parentPort } from 'node:worker_threads';
import { Fachfehler } from '../src/fehler';
import { alsBuffer, fehlerDaten, type Auftrag } from '../src/arbeit/nachricht';

const V: Record<string, (...a: never[]) => unknown> = {
  /** Rechnet `ms` lang (blockiert diesen Faden, nicht den Hauptfaden). */
  rechne: (ms: number) => { const e = Date.now() + ms; let x = 0; while (Date.now() < e) x++; return x > 0; },
  umdrehen: (b: Buffer) => ({ ist: Buffer.isBuffer(b), daten: Buffer.from(b).reverse() }),
  fachfehler: () => { throw new Fachfehler(422, 'Das PDF ist mit einem Passwort geschützt.', { feld: 'datei' }); },
  absturz: () => process.exit(3),
};

parentPort!.on('message', (a: Auftrag) => void (async () => {
  try { parentPort!.postMessage({ id: a.id, ok: true, ergebnis: await V[a.vorgang](...(alsBuffer(a.args) as never[])) }); } catch (e) { parentPort!.postMessage({ id: a.id, ok: false, fehler: fehlerDaten(e) }); }
})());
