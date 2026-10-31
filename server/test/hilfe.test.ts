/** Offline-Hilfe (#219): Adressen unter /hilfe. */
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { handbuchOnlineUrl, handbuchUrl, hilfeOnlineUrl, hilfeUrl, HILFE } from '../../shared/src/hilfe';
import { hilfeAntwort } from '../src/hilfe';

describe('Offline-Hilfe (#219)', () => {
  it('verweist aus der Oberfläche auf die lokale Fassung', () => {
    assert.equal(handbuchUrl('admin', '0.44.4', 'sicherung/'), '/hilfe/admin/sicherung/');
    assert.equal(hilfeUrl(HILFE['werkbank.sicherung'], '0.44.4'), '/hilfe/admin/sicherung/');
    assert.equal(handbuchOnlineUrl('admin', '0.44.4', 'sicherung/'), 'https://motom001.github.io/dms/admin/v0.44/sicherung/');
  });

  it('Einrichtungsassistent (#278): immer das Online-Handbuch, aktuelle Version, mit Anker', () => {
    assert.equal(hilfeOnlineUrl(HILFE['einrichtung.code']), 'https://motom001.github.io/dms/admin/aktuell/installation/#einrichtungscode');
    assert.equal(hilfeOnlineUrl(HILFE['einrichtung.schluessel']), 'https://motom001.github.io/dms/admin/aktuell/installation/#schlussel-und-notfallblatt');
  });

  it('liefert Seiten, ergänzt den Schrägstrich und meldet Unbekanntes', async () => {
    const web = await mkdtemp(join(tmpdir(), 'dms-hilfe-'));
    await mkdir(join(web, 'hilfe', 'admin', 'sicherung'), { recursive: true });
    await writeFile(join(web, 'hilfe', 'index.html'), 'START');
    await writeFile(join(web, 'hilfe', 'admin', 'sicherung', 'index.html'), 'SICHERUNG');
    assert.equal(hilfeAntwort('/ablage', web), null, 'nicht die Hilfe');
    assert.deepEqual(hilfeAntwort('/hilfe/admin/sicherung/', web), { datei: join('hilfe', 'admin', 'sicherung', 'index.html') });
    assert.deepEqual(hilfeAntwort('/hilfe/', web), { datei: join('hilfe', 'index.html') });
    assert.deepEqual(hilfeAntwort('/hilfe/admin/sicherung?x=1', web), { umleiten: '/hilfe/admin/sicherung/?x=1', status: 301 });
    assert.deepEqual(hilfeAntwort('/hilfe', web), { umleiten: '/hilfe/', status: 301 });
    assert.deepEqual(hilfeAntwort('/hilfe/admin/gibtsnicht/', web), { fehlt: true });
    assert.deepEqual(hilfeAntwort('/hilfe/admin/bild.png', web), { fehlt: true });
    assert.deepEqual(hilfeAntwort('/hilfe/../geheim/', web), { fehlt: true }, 'keine Pfad-Tricks');
  });

  it('leitet ohne gebaute Handbücher auf die Online-Fassung der Version um', async () => {
    const web = await mkdtemp(join(tmpdir(), 'dms-hilfe-'));
    const alt = process.env.DMS_VERSION;
    process.env.DMS_VERSION = '0.44.4';
    try {
      assert.deepEqual(hilfeAntwort('/hilfe/admin/sicherung/', web), { umleiten: 'https://motom001.github.io/dms/admin/v0.44/sicherung/', status: 302 });
      assert.deepEqual(hilfeAntwort('/hilfe/', web), { umleiten: 'https://motom001.github.io/dms/', status: 302 });
      assert.deepEqual(hilfeAntwort('/hilfe/benutzer', undefined), { umleiten: 'https://motom001.github.io/dms/benutzer/v0.44/', status: 302 });
    } finally {
      if (alt === undefined) delete process.env.DMS_VERSION; else process.env.DMS_VERSION = alt;
    }
  });
});
