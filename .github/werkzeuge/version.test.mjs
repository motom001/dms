// Tests für version.mjs (#952): node --test .github/werkzeuge/version.test.mjs
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { istProgramm, liesSchnipsel, naechsteVersion, setzeLockVersion, setzeVersion, zusammenfassen } from './version.mjs';

const SKRIPT = resolve(import.meta.dirname, 'version.mjs');

test('Kopfzeile und Text', () => {
  assert.equal(liesSchnipsel('fs-1.md', 'art: minor\n\n## Neu\n- x').art, 'minor');
  assert.equal(liesSchnipsel('a.md', 'art: keine\n').inhalt, '');
  assert.throws(() => liesSchnipsel('a.md', 'art: major\n- x'), /erste Zeile/);
  assert.throws(() => liesSchnipsel('a.md', '## Neu\nart: patch'), /erste Zeile/);
  assert.throws(() => liesSchnipsel('a.md', 'art: patch\n\n'), /fehlen/);
  assert.throws(() => liesSchnipsel('../x.md', 'art: patch\n- x'), /Dateiname/);
  assert.throws(() => liesSchnipsel('Groß.md', 'art: patch\n- x'), /Dateiname/);
});

test('nächste Version', () => {
  assert.equal(naechsteVersion('0.219.0', 'patch'), '0.219.1');
  assert.equal(naechsteVersion('0.219.3', 'minor'), '0.220.0');
  assert.equal(
    naechsteVersion('0.219.0', 'minor', (v) => v === '0.220.0'),
    '0.220.1',
  );
  assert.throws(() => naechsteVersion('0.219', 'patch'), /X\.Y\.Z/);
});

test('zusammenfassen: Abschnitte gebündelt, feste Reihenfolge, „keine“ fällt weg', () => {
  const t = zusammenfassen([
    { art: 'minor', inhalt: '## Neu\n\n- A\n\n## Geändert\n\n- B' },
    { art: 'patch', inhalt: '- ohne Überschrift' },
    { art: 'patch', inhalt: '## Sicherheit\n\n- S' },
    { art: 'keine', inhalt: '## Neu\n- unsichtbar' },
  ]);
  assert.equal(t, '## Sicherheit\n\n- S\n\n## Neu\n\n- A\n\n## Geändert\n\n- B\n- ohne Überschrift\n');
  assert.ok(!t.includes('unsichtbar'));
});

test('Version setzen ändert nur die Version', () => {
  const t = '{\n  "name": "x",\n  "version": "0.1.0",\n  "dependencies": { "a": { "version": "9" } }\n}\n';
  assert.equal(setzeVersion(t, '0.2.0'), t.replace('"version": "0.1.0"', '"version": "0.2.0"'));
});

const LOCK = {
  name: 'dms',
  version: '0.1.0',
  lockfileVersion: 3,
  requires: true,
  packages: {
    '': { name: 'dms', version: '0.1.0', workspaces: ['server', 'web'] },
    'node_modules/a': { version: '9.9.9' },
    server: { name: 'dms-server', version: '0.1.0' },
    web: { name: 'dms-web', version: '0.1.0' },
  },
};

test('Version im Lockfile: oben, Wurzel und Arbeitsbereiche, sonst nichts; Format wie npm (#1272)', () => {
  const t = `${JSON.stringify(LOCK, null, 2)}\n`;
  const neu = setzeLockVersion(t, '0.2.0');
  const j = JSON.parse(neu);
  assert.deepEqual(
    [j.version, j.packages[''].version, j.packages.server.version, j.packages.web.version],
    ['0.2.0', '0.2.0', '0.2.0', '0.2.0'],
  );
  assert.equal(j.packages['node_modules/a'].version, '9.9.9');
  assert.equal(neu, t.replaceAll('"version": "0.1.0"', '"version": "0.2.0"'));
});

test('Programm oder nicht', () => {
  for (const p of ['server/src/dienst.ts', 'web/src/App.tsx', 'shared/src/sprachen/de/werkbank.json', 'Dockerfile', 'docker/start.sh'])
    assert.ok(istProgramm(p), p);
  for (const p of [
    'server/test/x.test.ts',
    'docs/handbuch/admin/docs/a.md',
    '.github/workflows/image.yml',
    'web/src/a.test.tsx',
    'README.md',
  ])
    assert.ok(!istProgramm(p), p);
});

/** Kleines Repository mit main und einem PR-Stand. */
function repo() {
  const d = mkdtempSync(join(tmpdir(), 'version-'));
  const g = (...a) => execFileSync('git', a, { cwd: d, encoding: 'utf8' });
  g('init', '-q', '-b', 'main');
  g('config', 'user.email', 't@example.org');
  g('config', 'user.name', 'T');
  for (const p of ['package.json', 'server/package.json', 'web/package.json']) {
    mkdirSync(join(d, p, '..'), { recursive: true });
    writeFileSync(join(d, p), '{\n  "name": "x",\n  "version": "0.219.0"\n}\n');
  }
  mkdirSync(join(d, 'server/src'), { recursive: true });
  writeFileSync(join(d, 'server/src/a.ts'), '1');
  mkdirSync(join(d, 'docs/releases/neu'), { recursive: true });
  writeFileSync(join(d, 'docs/releases/neu/README.md'), 'Ordner');
  writeFileSync(join(d, 'package-lock.json'), `${JSON.stringify(LOCK, null, 2)}\n`.replaceAll('0.1.0', '0.219.0'));
  g('add', '-A');
  g('commit', '-qm', 'basis');
  g('tag', 'v0.219.0');
  return { d, g, basis: g('rev-parse', 'HEAD').trim() };
}
const lauf = (d, ...a) => {
  try {
    return {
      ok: true,
      out: execFileSync('node', [SKRIPT, ...a], { cwd: d, encoding: 'utf8', env: { ...process.env, GITHUB_OUTPUT: '' } }),
    };
  } catch (e) {
    return { ok: false, out: String(e.stdout) };
  }
};

test('pruefen: Programm ohne Notiz schlägt fehl, mit Notiz geht es', () => {
  const { d, g, basis } = repo();
  writeFileSync(join(d, 'server/src/a.ts'), '2');
  g('commit', '-qam', 'pr');
  assert.match(lauf(d, 'pruefen', basis).out, /ohne Release-Notiz/);
  writeFileSync(join(d, 'docs/releases/neu/fs-1.md'), 'art: patch\n\n## Behoben\n\n- x (#1)\n');
  g('add', '-A');
  g('commit', '-qm', 'notiz');
  assert.ok(lauf(d, 'pruefen', basis).ok);
  writeFileSync(join(d, 'docs/releases/neu/fs-2.md'), 'art: patch\n- y\n');
  g('add', '-A');
  g('commit', '-qm', 'zwei');
  assert.match(lauf(d, 'pruefen', basis).out, /genau einen/);
});

test('pruefen: alte Art warnt nur, nur Doku braucht nichts', () => {
  const { d, g, basis } = repo();
  writeFileSync(join(d, 'server/src/a.ts'), '2');
  writeFileSync(join(d, 'docs/releases/v0.219.1.md'), '- x');
  g('add', '-A');
  g('commit', '-qm', 'alt');
  const r = lauf(d, 'pruefen', basis);
  assert.ok(r.ok);
  assert.match(r.out, /Alte Art/);
  const z = repo();
  writeFileSync(join(z.d, 'README.md'), 'neu');
  z.g('add', '-A');
  z.g('commit', '-qm', 'doku');
  assert.match(lauf(z.d, 'pruefen', z.basis).out, /Keine Release-Notiz nötig/);
});

test('vergeben: höchste Art gewinnt, Notizen zusammen, Schnipsel weg, README bleibt', () => {
  const { d } = repo();
  writeFileSync(join(d, 'docs/releases/neu/fs-1.md'), 'art: patch\n\n## Behoben\n\n- a (#1)\n');
  writeFileSync(join(d, 'docs/releases/neu/fs-2.md'), 'art: minor\n\n## Neu\n\n- b (#2)\n');
  const r = lauf(d, 'vergeben');
  assert.ok(r.ok, r.out);
  assert.match(r.out, /version=0\.220\.0/);
  for (const p of ['package.json', 'server/package.json', 'web/package.json'])
    assert.equal(JSON.parse(readFileSync(join(d, p), 'utf8')).version, '0.220.0');
  const lock = JSON.parse(readFileSync(join(d, 'package-lock.json'), 'utf8'));
  assert.deepEqual(
    [lock.version, lock.packages[''].version, lock.packages.server.version, lock.packages.web.version],
    ['0.220.0', '0.220.0', '0.220.0', '0.220.0'],
  );
  assert.equal(readFileSync(join(d, 'docs/releases/v0.220.0.md'), 'utf8'), '## Neu\n\n- b (#2)\n\n## Behoben\n\n- a (#1)\n');
  assert.deepEqual(readdirSync(join(d, 'docs/releases/neu')), ['README.md']);
  // Zweiter Lauf: nichts mehr zu tun.
  assert.match(lauf(d, 'vergeben').out, /nichts zu tun/);
  assert.ok(!existsSync(join(d, 'docs/releases/v0.220.1.md')));
});

test('vergeben: nur „keine“ → kein Release; vorhandenes Tag wird übersprungen', () => {
  const { d, g } = repo();
  writeFileSync(join(d, 'docs/releases/neu/ci.md'), 'art: keine\n');
  assert.match(lauf(d, 'vergeben').out, /kein Release/);
  g('tag', 'v0.219.1');
  writeFileSync(join(d, 'docs/releases/neu/fix.md'), 'art: patch\n- f\n');
  assert.match(lauf(d, 'vergeben').out, /version=0\.219\.2/);
  assert.ok(!existsSync(join(d, 'docs/releases/neu/ci.md')), 'auch „keine“ wird mit dem Release aufgeräumt');
});
