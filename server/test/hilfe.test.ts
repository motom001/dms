/** Offline-Hilfe (#219): Adressen unter /hilfe. */
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import {
  handbuchOnlineUrl,
  handbuchStartUrl,
  handbuchsprache,
  handbuchUrl,
  hilfeOnlineUrl,
  hilfeUrl,
  HILFE,
  installierenUrl,
} from '../../shared/src/hilfe';
import { setzeSprache } from '../../shared/src/sprache';
import { hilfeAntwort, hilfeSenden } from '../src/oberflaeche/hilfe';

describe('Offline-Hilfe (#219)', () => {
  it('verweist aus der Oberfläche auf die lokale Fassung', () => {
    assert.equal(handbuchUrl('admin', '0.44.4', 'sicherung/'), '/hilfe/admin/sicherung/');
    assert.equal(hilfeUrl(HILFE['werkbank.sicherung'], '0.44.4'), '/hilfe/admin/sicherung/');
    assert.equal(handbuchOnlineUrl('admin', 'sicherung/'), 'https://help.ablago.app/admin/aktuell/sicherung/');
  });

  it('Einrichtungsassistent (#278): immer das Online-Handbuch, aktuelle Version, mit Anker', () => {
    assert.equal(hilfeOnlineUrl(HILFE['einrichtung.code']), 'https://help.ablago.app/admin/aktuell/installation/#einrichtungscode');
    assert.equal(hilfeOnlineUrl(HILFE['einrichtung.fertig']), 'https://help.ablago.app/admin/aktuell/installation/#fertig');
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

  it('Seite „nicht gefunden“ mit Suche, wenn die Offline-Hilfe sie mitbringt – nur für Seitenadressen (#841)', async () => {
    const web = await mkdtemp(join(tmpdir(), 'dms-hilfe-'));
    await mkdir(join(web, 'hilfe'), { recursive: true });
    await writeFile(join(web, 'hilfe', 'index.html'), 'START');
    await writeFile(join(web, 'hilfe', '404.html'), '<p>Diese Seite gibt es hier nicht</p>');
    const seite = join(web, 'hilfe', '404.html');
    assert.deepEqual(hilfeAntwort('/hilfe/admin/gibtsnicht/', web), { fehlt: true, seite });
    assert.deepEqual(hilfeAntwort('/hilfe/admin/alt.html', web), { fehlt: true, seite });
    assert.deepEqual(hilfeAntwort('/hilfe/admin/bild.png', web), { fehlt: true });
    // Ausgeliefert mit Status 404 als HTML.
    const gesendet: { code?: number; typ?: string; inhalt?: string } = {};
    const antwort = {
      redirect: () => null,
      sendFile: () => null,
      code: (c: number) => {
        gesendet.code = c;
        return {
          type: (t: string) => {
            gesendet.typ = t;
            return {
              send: (b: string) => {
                gesendet.inhalt = b;
                return null;
              },
            };
          },
        };
      },
    };
    hilfeSenden(antwort, { fehlt: true, seite });
    assert.deepEqual(gesendet, { code: 404, typ: 'text/html; charset=utf-8', inhalt: '<p>Diese Seite gibt es hier nicht</p>' });
  });

  it('leitet ohne gebaute Handbücher auf die Online-Fassung um – immer „aktuell“ (#846)', async () => {
    const web = await mkdtemp(join(tmpdir(), 'dms-hilfe-'));
    const alt = process.env.DMS_VERSION;
    process.env.DMS_VERSION = '0.44.4';
    try {
      assert.deepEqual(hilfeAntwort('/hilfe/admin/sicherung/', web), {
        umleiten: 'https://help.ablago.app/admin/aktuell/sicherung/',
        status: 302,
      });
      assert.deepEqual(hilfeAntwort('/hilfe/', web), { umleiten: 'https://help.ablago.app/', status: 302 });
      assert.deepEqual(hilfeAntwort('/hilfe/benutzer', undefined), { umleiten: 'https://help.ablago.app/benutzer/aktuell/', status: 302 });
    } finally {
      if (alt === undefined) delete process.env.DMS_VERSION;
      else process.env.DMS_VERSION = alt;
    }
  });

  describe('Sprache der Person (#730)', () => {
    it('Deutsch ohne Unterordner, Englisch unter …/en/ – lokal und online, mit demselben Anker', () => {
      assert.equal(hilfeUrl(HILFE['werkbank.sicherung'], '0.44.4', 'de'), '/hilfe/admin/sicherung/');
      assert.equal(hilfeUrl(HILFE['sicherung.zeitplan'], '0.44.4', 'en'), '/hilfe/admin/en/sicherung/#zeitplan-und-aufbewahrung');
      assert.equal(handbuchUrl('benutzer', null, 'mappen/', 'en'), '/hilfe/benutzer/en/mappen/');
      assert.equal(handbuchOnlineUrl('admin', 'sicherung/', 'en'), 'https://help.ablago.app/admin/aktuell/en/sicherung/');
      assert.equal(
        hilfeOnlineUrl(HILFE['einrichtung.code'], 'en'),
        'https://help.ablago.app/admin/aktuell/en/installation/#einrichtungscode',
      );
      assert.equal(installierenUrl('en'), 'https://help.ablago.app/installieren/aktuell/en/');
      assert.equal(installierenUrl('de'), 'https://help.ablago.app/installieren/aktuell/');
      assert.equal(handbuchStartUrl('en'), 'https://help.ablago.app/en/');
    });

    it('Gebietsschema und Sprachen ohne eigenes Handbuch', () => {
      assert.equal(handbuchsprache('en-GB'), 'en');
      assert.equal(handbuchsprache('EN_us'), 'en');
      assert.equal(handbuchsprache('de-formal'), 'de');
      assert.equal(handbuchsprache('fr'), 'de', 'ohne französisches Handbuch das deutsche');
      assert.equal(handbuchsprache(''), 'de');
    });

    it('ohne Angabe die Sprache der Oberfläche (setzeSprache)', () => {
      try {
        setzeSprache('en');
        assert.equal(hilfeUrl(HILFE['ablage.post'], null), '/hilfe/benutzer/en/post/');
        assert.equal(hilfeOnlineUrl(HILFE['einrichtung.fertig']), 'https://help.ablago.app/admin/aktuell/en/installation/#fertig');
        assert.equal(hilfeUrl(HILFE['ablage.post'], null, 'de'), '/hilfe/benutzer/post/', 'ausdrückliche Sprache gewinnt');
      } finally {
        setzeSprache('de');
      }
      assert.equal(hilfeUrl(HILFE['ablage.post'], null), '/hilfe/benutzer/post/');
    });

    it('ohne gebaute Handbücher: englische Seiten und Startseite online', async () => {
      const web = await mkdtemp(join(tmpdir(), 'dms-hilfe-'));
      assert.deepEqual(hilfeAntwort('/hilfe/admin/en/sicherung/', web), {
        umleiten: 'https://help.ablago.app/admin/aktuell/en/sicherung/',
        status: 302,
      });
      assert.deepEqual(hilfeAntwort('/hilfe/en/', web), { umleiten: 'https://help.ablago.app/en/', status: 302 });
    });

    it('mit gebauten Handbüchern: englische Seite aus dem Unterordner', async () => {
      const web = await mkdtemp(join(tmpdir(), 'dms-hilfe-'));
      await mkdir(join(web, 'hilfe', 'admin', 'en', 'sicherung'), { recursive: true });
      await writeFile(join(web, 'hilfe', 'index.html'), 'START');
      await writeFile(join(web, 'hilfe', 'admin', 'en', 'sicherung', 'index.html'), 'BACKUP');
      assert.deepEqual(hilfeAntwort('/hilfe/admin/en/sicherung/', web), { datei: join('hilfe', 'admin', 'en', 'sicherung', 'index.html') });
      assert.deepEqual(hilfeAntwort('/hilfe/admin/en/sicherung', web), { umleiten: '/hilfe/admin/en/sicherung/', status: 301 });
    });
  });
});
