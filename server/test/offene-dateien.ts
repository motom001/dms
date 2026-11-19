/**
 * Ungelesene Datei-Ströme finden (#1456, Vorbereitung auf Node 26): Bleibt ein FileHandle liegen, ohne gelesen oder
 * geschlossen zu werden, schließt Node ihn erst bei der Speicherbereinigung. Unter Node 24 ist das nur eine Warnung
 * (DEP0137) und ein kleines Leck, unter Node 26 ein Fehler („A FileHandle object was closed during garbage
 * collection“). Diese Datei macht es schon heute sichtbar:
 *
 * - Sie merkt sich zu jedem `open()` aus `node:fs/promises` den Ort im Code.
 * - Sie ruft regelmäßig und vor dem Ende des Prozesses die Speicherbereinigung auf (braucht `--expose-gc`).
 * - Schließt Node einen FileHandle bei der Speicherbereinigung, schreibt sie Datei und Ort des Öffnens auf stderr und
 *   macht den Lauf rot.
 *
 *   node --expose-gc --import tsx --import ./test/offene-dateien.ts --test test/auskunft.test.ts
 *
 * In der CI: `npm run test:dateien -w server` (Job „tests“, Teil 1) über die Testdateien, die echte Dateien lesen.
 * Abhilfe bei einem Fund: den Strom dort schließen, wo er liegen bleibt (`destroy()`), auch in Fehlerpfaden.
 */
import { createRequire, syncBuiltinESMExports } from 'node:module';

const require = createRequire(import.meta.url);
const fsp = require('node:fs/promises') as typeof import('node:fs/promises');
const gc = (globalThis as { gc?: () => void }).gc;
if (!gc) throw new Error('offene-dateien.ts braucht node --expose-gc');

/** Datei und Ort des Öffnens je Dateideskriptor (ein neuer überschreibt einen geschlossenen). */
const orte = new Map<number, string>();
const oeffne = fsp.open;
fsp.open = async function (this: unknown, ...a: Parameters<typeof oeffne>) {
  const h = await oeffne.apply(this, a);
  orte.set(h.fd, `${String(a[0])}\n${new Error('geöffnet').stack?.split('\n').slice(1).join('\n') ?? ''}`);
  return h;
} as typeof oeffne;
syncBuiltinESMExports();

process.on('warning', (w) => {
  if ((w as { code?: string }).code !== 'DEP0137' && !/on garbage collection/.test(w.message)) return;
  const fd = /descriptor (\d+)/.exec(w.message)?.[1];
  // Node meldet einen Fall zweimal: mit Deskriptor, dann als DEP0137 ohne. Der Ort steht beim ersten.
  if (fd === undefined) return;
  process.stderr.write(
    `\nUngelesener Datei-Strom, bei der Speicherbereinigung geschlossen (#1456):\n${orte.get(Number(fd)) ?? '(Ort unbekannt)'}\n`,
  );
  process.exitCode = 1;
});

setInterval(() => gc(), 1000).unref();
// Vor dem Ende noch einmal: Was jetzt erst unerreichbar wird, meldet sich sonst nie.
let zuletzt = false;
process.on('beforeExit', () => {
  if (zuletzt) return;
  zuletzt = true;
  gc();
  setTimeout(() => gc(), 50);
});
