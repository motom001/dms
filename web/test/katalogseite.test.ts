/**
 * „Im Katalog ansehen“ (#622) und Sammeldatei-Seite (#461): Links auf die Katalog-Webseite mit der
 * DMS-Version nur im Fragment, nie als Query (`?dms=` stünde im Zugriffsprotokoll von GitHub Pages).
 * Das Fragment muss genau zu dem passen, was die Katalogseite liest (dms-registry, werkzeuge/webseite.py,
 * Skript dms.js: `/(?:^#|&)dms=(\d+\.\d+\.\d+)(?:&|$)/` auf `location.hash`).
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { KATALOG_LINK_REL, KATALOG_SEITE, katalogSeiteMitVersion, SAMMEL_SEITE, sammelSeiteMitVersion } from '../../shared/src/pakete';

/** Wie die Katalogseite das Fragment liest (dms-registry #84). */
const KATALOG_LIEST = /(?:^#|&)dms=(\d+\.\d+\.\d+)(?:&|$)/;

describe('Im Katalog ansehen (#622)', () => {
  it('setzt die Version ins Fragment, nie in einen Parameter', () => {
    const url = new URL(katalogSeiteMitVersion('0.146.0'));
    assert.equal(url.href, 'https://catalog.ablago.app/#dms=0.146.0');
    assert.equal(url.search, '', 'kein Query – der ginge an den Server');
    assert.equal(KATALOG_LIEST.exec(url.hash)?.[1], '0.146.0');
    assert.ok(url.href.startsWith(KATALOG_SEITE));
  });

  it('nur die Version – sonst nichts im Fragment', () => {
    assert.equal(new URL(katalogSeiteMitVersion('1.2.3')).hash, '#dms=1.2.3');
  });

  it('Paketseite mit Fragment', () => {
    const url = new URL(katalogSeiteMitVersion('0.146.0', 'texterkennung_fra'));
    assert.equal(url.href, 'https://catalog.ablago.app/paket/texterkennung_fra/#dms=0.146.0');
    assert.equal(url.search, '');
    assert.equal(KATALOG_LIEST.exec(url.hash)?.[1], '0.146.0');
  });

  it('ohne gültige Version kein Fragment, ungültige Paket-Id ergibt die Übersicht', () => {
    for (const v of ['unbekannt', '', '0.146', '0.146.0-beta.1', '0.146.0&x=1', '1.2.3#a'])
      assert.equal(katalogSeiteMitVersion(v), KATALOG_SEITE, v);
    assert.equal(katalogSeiteMitVersion('0.146.0', '../x'), `${KATALOG_SEITE}#dms=0.146.0`);
    assert.equal(katalogSeiteMitVersion('0.146.0', 'A?b'), `${KATALOG_SEITE}#dms=0.146.0`);
  });

  it('Sammeldatei-Seite: Version im Fragment, sonst ohne', () => {
    const url = new URL(sammelSeiteMitVersion('0.147.0'));
    assert.equal(url.href, 'https://catalog.ablago.app/sammeldatei.html#dms=0.147.0');
    assert.equal(url.search, '', 'kein Query – der ginge an den Server');
    assert.equal(KATALOG_LIEST.exec(url.hash)?.[1], '0.147.0');
    for (const v of ['unbekannt', '', '0.147', '0.147.0-beta.1', '0.147.0&x=1', '1.2.3#a', '1.2.3?dms=1.2.3'])
      assert.equal(sammelSeiteMitVersion(v), SAMMEL_SEITE, v);
  });

  const web = new URL('../../web/src', import.meta.url).pathname;
  const dateien: string[] = [];
  const lauf = (d: string) => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) lauf(p); else if (/\.tsx?$/.test(p)) dateien.push(p); } };
  lauf(web);

  it('jeder Link mit Version öffnet im neuen Tab mit rel="noopener noreferrer"', () => {
    assert.equal(KATALOG_LINK_REL, 'noopener noreferrer');
    const links = { katalog: 0, sammel: 0 };
    for (const p of dateien) {
      for (const m of readFileSync(p, 'utf8').matchAll(/<a\b[^>]*\b(katalogSeiteMitVersion|sammelSeiteMitVersion)\([^>]*>/g)) {
        links[m[1] === 'sammelSeiteMitVersion' ? 'sammel' : 'katalog']++;
        assert.match(m[0], /target="_blank"/, p);
        assert.match(m[0], /rel=\{KATALOG_LINK_REL\}/, p);
      }
    }
    assert.ok(links.katalog >= 2, 'Übersicht und Paketseite');
    assert.ok(links.sammel >= 2, 'Werkbank → Pakete → Ohne Internet und Einrichtungsassistent');
  });

  it('nirgends in der Oberfläche eine Version als Query (?dms=) oder eine eigene Adresse der Katalog-Webseite', () => {
    for (const p of dateien) {
      const text = readFileSync(p, 'utf8');
      assert.doesNotMatch(text, /[?&]dms=/, `${p}: Version als Query`);
      assert.doesNotMatch(text, /(?:searchParams|URLSearchParams)[^;\n]*['"`]dms['"`]/, `${p}: Version als Query`);
      // Links auf die Katalog-Webseite nur über katalogSeiteMitVersion/sammelSeiteMitVersion.
      assert.doesNotMatch(text, /KATALOG_SEITE\b|sammeldatei\.html|motom001\.github\.io\/dms-registry/, `${p}: Adresse der Katalog-Webseite selbst gebaut`);
    }
  });
});
