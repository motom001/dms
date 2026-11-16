/**
 * Seite „nicht gefunden“ von help.ablago.app (#846): leitet alte Adressen auf „aktuell“ um – aber nie auf einen
 * anderen Server. „//andere.example/admin/…“ ist für den Browser eine fremde Adresse (offene Weiterleitung).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import vm from 'node:vm';

const WURZEL = new URL('../..', import.meta.url).pathname;

/** Das Umleitungsskript der 404-Seite (seit #841 in docs/handbuch/start/404.html, vor der Anzeige). */
function skript(): string {
  const html = readFileSync(join(WURZEL, 'docs/handbuch/start/404.html'), 'utf8');
  return html.split('<script>')[1].split('</script>')[0];
}

/** Führt das Skript mit einer Adresse aus; liefert das Ziel von location.replace oder null. */
async function ziel(pfad: string, gibt = true, ordner = 'aktuell/'): Promise<string | null> {
  let ersetzt: string | null = null;
  const location = {
    pathname: pfad,
    hash: '',
    replace: (x: string) => {
      ersetzt = x;
    },
  };
  const fetch = async () => ({ ok: gibt });
  await vm.runInNewContext(skript().replace('(async () => {', 'return (async () => {').replace(/^/, '(() => {').concat('\n})()'), {
    location,
    fetch,
    document: { documentElement: { dataset: { ordner } } },
  });
  return ersetzt;
}

describe('help.ablago.app: Seite „nicht gefunden“ (#846)', () => {
  it('alte Adressen führen auf dieselbe Seite unter „aktuell“', async () => {
    assert.equal(await ziel('/admin/v0.22/sicherung/'), '/admin/aktuell/sicherung/');
    assert.equal(await ziel('/admin/entwicklung/sicherung/'), '/admin/aktuell/sicherung/');
    assert.equal(await ziel('/admin/aktuell/gibt-es-nicht/'), '/admin/aktuell/');
    assert.equal(await ziel('/benutzer/v0.30/x/', false), '/benutzer/aktuell/');
  });
  it('in der Hilfe im Programm (ohne Ordner „aktuell“, #841) keine Umleitung', async () => {
    assert.equal(await ziel('/hilfe/admin/v0.22/sicherung/', true, ''), null);
  });
  it('nie auf einen anderen Server (offene Weiterleitung)', async () => {
    for (const p of [
      '//andere.example/admin/aktuell/x',
      '//andere.example/admin/v0.1/x',
      '/\\andere.example/admin/v0.1/x',
      '/\\/andere.example/admin/aktuell/x',
      '/a//b/admin/v0.1/x',
    ]) {
      assert.equal(await ziel(p), null, p);
    }
  });
});
