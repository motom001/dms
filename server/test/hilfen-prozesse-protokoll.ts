/**
 * Hilfe für protokoll-prozesse.test.ts (#1490): Hauptprozess und zwei Prozesse, ohne Ablago selbst. Jeder schreibt
 * Meldungen in sein Protokoll; Prozess 2 fragt wie die Werkbank alle ab (gemischt, „nur neue“) und schaltet den
 * Debug-Modus für alle ein. Ausgabe: JSON-Zeilen.
 */
import cluster from 'node:cluster';
import { bedieneProtokoll, protokollStand, setzeDebugAlle } from '../src/protokoll/alleprozesse';
import { protokoll } from '../src/protokoll/protokoll';
import { leite, verbundFuerProzess } from '../src/prozesse/prozesse';

const zeige = (x: unknown) => process.stdout.write(`${JSON.stringify(x)}\n`);
const warte = (ms: number) => new Promise((r) => setTimeout(r, ms));

if (cluster.isPrimary) {
  await leite({ anzahl: 2, quelle: 'umgebung', kerne: 4, speicher: null });
} else {
  const v = await verbundFuerProzess();
  bedieneProtokoll(v);
  v.bediene('debug.an', () => protokoll.debugAn);
  v.bediene('schreibe', ([text]) => protokoll.modul('system').warn(String(text)));
  v.bereit();
  protokoll.modul('system').warn(`Meldung aus Prozess ${v.nr}`);
  if (v.leiter) protokoll.modul('pakete').error('Paket rechnungen: Aufruf fehlgeschlagen');
  if (!v.leiter) {
    for (let i = 0; i < 200 && (await v.frageAlle('debug.an')).filter((p) => p.wert !== null).length < 2; i++) await warte(50);
    await warte(20);
    protokoll.modul('system').warn('Zweite Meldung aus Prozess 2');
    const stand = await protokollStand(v, { max: 500 });
    zeige({ art: 'stand', stand });
    await v.rufe('schreibe', ['Neu im Leiter']);
    const neu = await protokollStand(v, { max: 500 }, String(stand.letzte));
    zeige({ art: 'neu', neu });
    const pakete = await protokollStand(v, { modul: 'pakete', max: 500 });
    zeige({ art: 'pakete', pakete });
    const debug = await setzeDebugAlle(v, true);
    zeige({ art: 'debug', debug, alle: (await v.frageAlle<boolean>('debug.an')).map((p) => p.wert) });
  }
  process.on('SIGTERM', () => process.exit(0));
}
