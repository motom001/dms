/**
 * Hilfe für prozesse.test.ts (#745): ein kleiner Verbund mit Hauptprozess und drei Prozessen, ohne Ablago selbst.
 * Der Leiter bedient Aufrufe (mit Teilen und Fachfehlern), die anderen rufen ihn, melden und fragen alle; jeder
 * neu gestartete Prozess tut das wieder (Neustart prüft der Test). Ausgabe: JSON-Zeilen.
 */
import cluster from 'node:cluster';
import { Fachfehler } from '../src/fehler';
import { leite, verbundFuerProzess } from '../src/prozesse';

const zeige = (x: unknown) => process.stdout.write(`${JSON.stringify(x)}\n`);

if (cluster.isPrimary) {
  await leite({ anzahl: 3, quelle: 'umgebung', kerne: 4, speicher: null });
} else {
  const v = await verbundFuerProzess();
  v.bediene('stand', () => ({ nr: v.nr }));
  if (v.leiter) {
    v.bediene('summe', ([a, b]) => Number(a) + Number(b));
    v.bediene('verboten', () => {
      throw new Fachfehler(409, 'Belegt', { grund: 'test' });
    });
    v.bediene('teile', async (_args, teil) => {
      teil('a');
      teil('b');
      return 'fertig';
    });
    v.bediene('puffer', ([b]) => Buffer.concat([b as Buffer, Buffer.from('!')]));
    v.hoere('gruss', (d) => zeige({ art: 'gruss', bei: v.nr, d }));
  }
  v.hoere('alle', (d) => zeige({ art: 'alle', bei: v.nr, d }));
  v.bereit();
  if (!v.leiter) {
    // Warten, bis alle drei bereit sind.
    for (let i = 0; i < 100 && v.prozesse().length < 3; i++) await new Promise((r) => setTimeout(r, 50));
    const teile: unknown[] = [];
    const erg = {
      art: 'ergebnis',
      nr: v.nr,
      pid: process.pid,
      leiter: v.leiter,
      konsole: v.konsole,
      summe: await v.rufe('summe', [2, 3]),
      fehler: await v.rufe('verboten').then(
        () => null,
        (e) => ({
          fach: e instanceof Fachfehler,
          status: (e as Fachfehler).status,
          text: (e as Error).message,
          details: (e as Fachfehler).details,
        }),
      ),
      teile: { wert: await v.rufe('teile', [], { teil: (x) => teile.push(x) }), teile },
      puffer: String(await v.rufe<Uint8Array>('puffer', [Buffer.from('ab')]).then((b) => Buffer.from(b))),
      alle: (await v.frageAlle<{ nr: number }>('stand')).map((p) => ({ nr: p.nr, leiter: p.leiter, wert: p.wert })),
      neustarts: v.neustarts(),
    };
    v.melde('gruss', { von: v.nr });
    zeige(erg);
    // Meldungen erreichen nur Prozesse, die schon hören: erst warten, bis alle drei antworten.
    if (v.nr === 3) {
      for (let i = 0; i < 100 && (await v.frageAlle('stand')).some((p) => p.wert === null); i++)
        await new Promise((r) => setTimeout(r, 50));
      v.melde('alle', { von: 3 }, 'alle');
    }
  }
  process.on('SIGTERM', () => {
    zeige({ art: 'ende', nr: v.nr });
    process.exit(0);
  });
}
