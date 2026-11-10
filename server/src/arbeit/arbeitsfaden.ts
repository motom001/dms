/**
 * Einstieg eines Arbeiters (#542): nimmt Aufträge an, führt den Vorgang aus und schickt Ergebnis oder
 * Fehler zurück. Gebaut als `dist/arbeitsfaden.mjs` (siehe „build“ in server/package.json).
 */
import { parentPort } from 'node:worker_threads';
import { alsBuffer, fehlerDaten, type Antwort, type Auftrag } from './nachricht';
import { VORGAENGE } from './vorgaenge';
import { senkePrioritaet } from '../hintergrund';

// Niedrigere Priorität (#893): unter Linux nur dieser Faden – der Hauptfaden beantwortet die Anfragen weiter mit seiner.
senkePrioritaet();

const port = parentPort!;
// Fehler fängt der Vorgang selbst ab und schickt sie als Antwort zurück; `void`, weil `on` kein Promise erwartet (#1011).
port.on('message', (a: Auftrag) => void (async () => {
  let antwort: Antwort;
  try {
    const f = (VORGAENGE as Record<string, (...x: unknown[]) => unknown>)[a.vorgang];
    if (!f) throw new Error(`Unbekannter Vorgang: ${a.vorgang}`);
    antwort = { id: a.id, ok: true, ergebnis: await f(...alsBuffer(a.args)) };
  } catch (e) {
    antwort = { id: a.id, ok: false, fehler: fehlerDaten(e) };
  }
  try { port.postMessage(antwort); } catch (e) { port.postMessage({ id: a.id, ok: false, fehler: fehlerDaten(e) } satisfies Antwort); }
})());
