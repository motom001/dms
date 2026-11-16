/**
 * Hilfe für prozesse.test.ts (#1328): Hauptprozess mit zwei Prozessen, die SIGTERM übergehen (schlimmster Fall: Sie
 * hängen beim Beenden). Der Hauptprozess muss sie innerhalb seiner Frist hart beenden und selbst enden. Ausgabe: JSON-Zeilen.
 */
import cluster from 'node:cluster';
import { leite, verbundFuerProzess } from '../src/prozesse/prozesse';

const zeige = (x: unknown) => process.stdout.write(`${JSON.stringify(x)}\n`);

if (cluster.isPrimary) {
  await leite({ anzahl: 2, quelle: 'umgebung', kerne: 4, speicher: null });
} else {
  const v = await verbundFuerProzess();
  process.on('SIGTERM', () => zeige({ art: 'haengt', nr: v.nr }));
  v.bereit();
  zeige({ art: 'bereit', nr: v.nr, pid: process.pid });
  setInterval(() => {}, 1000);
}
