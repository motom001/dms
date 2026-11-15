/** Dateiformat der Sicherung (#103): schreiben, lesen, falscher Schlüssel, veränderte Datei. */
import assert from 'node:assert/strict';
import { createCipheriv, randomBytes } from 'node:crypto';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { gzipSync } from 'node:zlib';
import { ABLEITUNG, FORMAT, liesKopf, liesSicherung, MAGIE, sammle, schreibeSicherung, sha256Von, type Eintrag } from '../src/sicherungsformat';

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

/** Eine Sicherung, wie sie ältere Fassungen schrieben – mit `ableitung` aus den Sprachdateien (#1264). */
function alteSicherung(k: Buffer, ableitung: string): Buffer {
  const u32 = (n: number) => { const b = Buffer.alloc(4); b.writeUInt32BE(n); return b; };
  const nonce = randomBytes(12);
  const kopf = Buffer.from(JSON.stringify({ format: FORMAT, verfahren: 'AES-256-GCM', ableitung, kompression: 'gzip', fingerabdruck: 'ALT', nonce: nonce.toString('base64url') }), 'utf8');
  const vorspann = Buffer.concat([MAGIE, u32(kopf.length), kopf]);
  const eintrag = (art: string, k2: object) => { const j = Buffer.from(JSON.stringify(k2), 'utf8'); return Buffer.concat([Buffer.from(art, 'latin1'), u32(j.length), j, u32(0)]); };
  const c = createCipheriv('aes-256-gcm', k, nonce);
  c.setAAD(vorspann);
  const inhalt = Buffer.concat([c.update(gzipSync(Buffer.concat([eintrag('M', { format: 1 }), eintrag('E', { tabellen: 0 })]))), c.final()]);
  return Buffer.concat([vorspann, inhalt, c.getAuthTag()]);
}

describe('Sicherungsformat (#103)', () => {
  it('ableitung fest im Code; ältere Sicherungen mit deutschem oder englischem Text bleiben lesbar (#1264)', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'dms-format-'));
    const k = randomBytes(32);
    await schreibeSicherung(join(dir, 'neu.dms-sicherung'), k, 'NEU', beispiel(Buffer.from('x')));
    assert.equal((await liesKopf(join(dir, 'neu.dms-sicherung'))).kopf.ableitung, ABLEITUNG);
    assert.equal(ABLEITUNG, 'HKDF-SHA256 „dms-sicherung“ aus dem Schlüssel der Werkbank', 'wie bisher auf Deutsch');
    for (const alt of ['HKDF-SHA256 „dms-sicherung“ aus dem Schlüssel der Werkbank', 'HKDF-SHA256 “dms-sicherung” from the Workbench key']) {
      const pfad = join(dir, `alt-${alt.length}.dms-sicherung`);
      await writeFile(pfad, alteSicherung(k, alt));
      assert.deepEqual((await allesLesen(pfad, k)).map((x) => x.art), ['M', 'E'], alt);
    }
  });

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
