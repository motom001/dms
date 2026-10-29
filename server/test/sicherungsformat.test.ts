/** Dateiformat der Sicherung (#103): schreiben, lesen, falscher Schlüssel, veränderte Datei. */
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { liesKopf, liesSicherung, sammle, schreibeSicherung, sha256Von, type Eintrag } from '../src/sicherungsformat';

async function* beispiel(gross: Buffer): AsyncGenerator<Eintrag> {
  yield { art: 'M', kopf: { format: 1, tabellen: ['a'] } };
  yield { art: 'T', kopf: { tabelle: 'a', spalten: ['x'] }, daten: (async function* () { yield Buffer.from('1\n'); yield Buffer.from('2\n'); })() };
  yield { art: 'D', kopf: { pfad: 'ab/abc', groesse: gross.length }, daten: gross };
  yield { art: 'D', kopf: { pfad: 'leer', groesse: 0 }, daten: Buffer.alloc(0) };
  yield { art: 'E', kopf: { tabellen: 1, dateien: 2 } };
}

async function allesLesen(pfad: string, k: Buffer) {
  const erg: Array<{ art: string; kopf: Record<string, unknown>; daten: Buffer }> = [];
  for await (const e of liesSicherung(pfad, k)) erg.push({ art: e.art, kopf: e.kopf, daten: await sammle(e.daten) });
  return erg;
}

describe('Sicherungsformat (#103)', () => {
  it('schreibt und liest Einträge beliebiger Größe; Prüfsumme stimmt', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'dms-format-'));
    const k = randomBytes(32);
    const gross = randomBytes(3 * 1024 * 1024 + 17);
    const pfad = join(dir, 'x.dms-sicherung');
    const g = await schreibeSicherung(pfad, k, 'ABCD-EFGH-IJKL-MNOP', beispiel(gross));
    assert.equal(g.sha256, await sha256Von(pfad));
    assert.equal((await readFile(pfad)).subarray(0, 16).toString('latin1'), 'DMS-SICHERUNG 1\n');
    assert.equal((await liesKopf(pfad)).kopf.fingerabdruck, 'ABCD-EFGH-IJKL-MNOP');
    const e = await allesLesen(pfad, k);
    assert.deepEqual(e.map((x) => x.art), ['M', 'T', 'D', 'D', 'E']);
    assert.equal(e[1].daten.toString(), '1\n2\n');
    assert.ok(e[2].daten.equals(gross));
    assert.equal(e[3].daten.length, 0);
    assert.deepEqual(e[4].kopf, { tabellen: 1, dateien: 2 });
    // Die Dokumente stehen nicht im Klartext in der Datei.
    assert.ok(!(await readFile(pfad)).includes(gross.subarray(0, 64)));
  });

  it('lehnt einen falschen Schlüssel und eine veränderte Datei ab', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'dms-format-'));
    const k = randomBytes(32);
    const pfad = join(dir, 'x.dms-sicherung');
    await schreibeSicherung(pfad, k, 'F', beispiel(randomBytes(5000)));
    await assert.rejects(allesLesen(pfad, randomBytes(32)), /falscher Schlüssel|verändert/);
    const b = await readFile(pfad);
    b[b.length - 40] ^= 1;
    const kaputt = join(dir, 'kaputt.dms-sicherung');
    await writeFile(kaputt, b);
    await assert.rejects(allesLesen(kaputt, k), /falscher Schlüssel|verändert|beschädigt/);
    await writeFile(join(dir, 'fremd'), 'hallo');
    await assert.rejects(liesKopf(join(dir, 'fremd')), /keine Sicherungsdatei/);
  });
});
