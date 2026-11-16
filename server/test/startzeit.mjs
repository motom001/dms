/**
 * Startzeit messen (#802): Ablago starten und die Zeit bis „erreichbar“ (der Port antwortet, Startseite „Ablago
 * startet …“) und bis „bereit“ (/api/gesundheit mit 200) festhalten. Im Workflow „Lasttest“ nach der Stufe groß,
 * also mit 200.000 Mappen (bzw. dem Bestand von extrem). Ohne Abhängigkeiten.
 *
 *   node server/test/startzeit.mjs [--ziel http://127.0.0.1:3100] [--bericht <md>] [--json <datei>] [--log <datei>] -- <Befehl …>
 *
 * Der Befehl bekommt die Umgebung dieses Prozesses; nach der Messung wird er mit SIGTERM beendet.
 */
import { spawn } from 'node:child_process';
import { appendFileSync, createWriteStream, writeFileSync } from 'node:fs';

const arg = (n, std) => {
  const i = process.argv.indexOf(n);
  return i < 0 ? std : process.argv[i + 1];
};
const trenner = process.argv.indexOf('--');
const befehl = trenner < 0 ? [] : process.argv.slice(trenner + 1);
if (!befehl.length) {
  console.error('Aufruf: startzeit.mjs [Optionen] -- <Befehl …>');
  process.exit(2);
}
const BASIS = (arg('--ziel') ?? process.env.DMS_URL ?? `http://127.0.0.1:${process.env.PORT ?? 3000}`).replace(/\/$/, '');
const HOECHSTENS_MS = Number(arg('--hoechstens', 30 * 60)) * 1000;

const t0 = performance.now();
const kind = spawn(befehl[0], befehl.slice(1), { stdio: ['ignore', 'pipe', 'pipe'], env: process.env });
const log = arg('--log') ? createWriteStream(arg('--log'), { flags: 'a' }) : null;
kind.stdout.on('data', (d) => log?.write(d));
kind.stderr.on('data', (d) => log?.write(d));
let beendet = null;
kind.on('exit', (code) => {
  beendet = code;
});

const sek = (ms) => (ms === null ? null : Math.round(ms / 100) / 10);
let erreichbar = null,
  bereit = null;
const zustaende = new Set();
while (bereit === null && beendet === null && performance.now() - t0 < HOECHSTENS_MS) {
  try {
    const r = await fetch(`${BASIS}/api/gesundheit`, { signal: AbortSignal.timeout(5000) });
    const j = await r.json().catch(() => ({}));
    if (erreichbar === null) erreichbar = performance.now() - t0;
    if (j.zustand) zustaende.add(j.zustand);
    if (r.status === 200) bereit = performance.now() - t0;
    if (j.zustand === 'fehler') break;
  } catch {
    /* noch nicht erreichbar */
  }
  await new Promise((r) => setTimeout(r, 200));
}
const ergebnis = {
  erreichbarS: sek(erreichbar),
  bereitS: sek(bereit),
  zustaende: [...zustaende],
  fehler:
    bereit === null
      ? beendet !== null
        ? `beendet mit Code ${beendet}`
        : zustaende.has('fehler')
          ? 'Start fehlgeschlagen'
          : 'Zeit abgelaufen'
      : null,
};
console.log(
  `Start: erreichbar nach ${ergebnis.erreichbarS ?? '–'} s, bereit nach ${ergebnis.bereitS ?? '–'} s${ergebnis.fehler ? ` (${ergebnis.fehler})` : ''}`,
);
if (arg('--json')) writeFileSync(arg('--json'), JSON.stringify(ergebnis, null, 2) + '\n');
const zahl = (x) => (x === null ? '–' : x.toLocaleString('de-DE'));
if (arg('--bericht')) {
  appendFileSync(
    arg('--bericht'),
    [
      '',
      '## Start nach dem Lasttest (#802)',
      '',
      `Neustart mit dem Bestand des Lasttests: **erreichbar** (Startseite „Ablago startet …“) nach ${zahl(ergebnis.erreichbarS)} s, **bereit** (/api/gesundheit 200) nach ${zahl(ergebnis.bereitS)} s.${ergebnis.fehler ? ` Abbruch: ${ergebnis.fehler}.` : ''}`,
      '',
    ].join('\n'),
  );
}
if (beendet === null) {
  kind.kill('SIGTERM');
  await new Promise((r) => {
    const z = setTimeout(() => {
      kind.kill('SIGKILL');
      r();
    }, 15_000);
    kind.once('exit', () => {
      clearTimeout(z);
      r();
    });
  });
}
log?.end();
process.exit(ergebnis.fehler ? 1 : 0);
