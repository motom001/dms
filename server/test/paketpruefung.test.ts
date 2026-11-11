/** Pakete mit dem echten Installer prüfen (#1124): Reihenfolge, Update alt → neu, Gründe, Befehl pakete-pruefen. */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { PRUEFER, pruefePakete, reihenfolge, type PruefErgebnis } from '../src/paketpruefung';
import type { Repo } from '../src/repo';
import { eigeneDatenbank } from './hilfe-db';

const SERVER = fileURLToPath(new URL('..', import.meta.url));
const BASIS = fileURLToPath(new URL('./pakete/basis', import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), 'pakete-pruefen-'));
after(() => rmSync(tmp, { recursive: true, force: true }));

/** Paketordner aus Name → Inhalt anlegen. */
function ordner(name: string, dateien: Record<string, string>, von?: string): string {
  const pfad = join(tmp, name);
  if (von) cpSync(von, pfad, { recursive: true });
  for (const [n, inhalt] of Object.entries(dateien)) { mkdirSync(dirname(join(pfad, n)), { recursive: true }); writeFileSync(join(pfad, n), inhalt); }
  return pfad;
}
const basisManifest = readFileSync(join(BASIS, 'manifest.yaml'), 'utf8');
const basisTypen = readFileSync(join(BASIS, 'inhalt/mappentypen.yaml'), 'utf8');
/** Basis 1.1.0: ein Feld mehr (Update). */
const basis11 = ordner('basis-1.1.0', {
  'manifest.yaml': basisManifest.replace('version: 1.0.0', 'version: 1.1.0'),
  'inhalt/mappentypen.yaml': basisTypen.replace('    - key: beschreibung\n', '    - key: steuernummer\n      label: Steuernummer\n      typ: text\n    - key: beschreibung\n'),
}, BASIS);
const vertraegeManifest = (version: string, basis = '^1.0.0') => `schema: 1\nid: vertraege\nname: Verträge\nversion: ${version}\nbeschreibung: Verträge.\nautor: { name: Test, github: test }\nlizenz: MIT\ndms: ">=0.60.0"\nabhaengigkeiten:\n  basis: "${basis}"\ninhalt:\n  mappentypen: inhalt/mappentypen.yaml\n`;
const vertraegeTypen = [
  '- schluessel: vertrag', '  name: Vertrag', '  titelVorlage: "{nr}"', '  felder:',
  '    - { key: nr, label: Nummer, typ: text, pflicht: true }',
  '    - { key: partner, label: Partner, typ: referenz, ziel: "basis:organisation" }',
  '  register:', '    - { key: daten, name: Daten, art: felder, felder: [nr, partner] }', '',
].join('\n');
const vertraege = ordner('vertraege', { 'manifest.yaml': vertraegeManifest('1.0.0'), 'inhalt/mappentypen.yaml': vertraegeTypen });
const vertraege11 = ordner('vertraege-1.1.0', { 'manifest.yaml': vertraegeManifest('1.1.0', '^1.1.0'), 'inhalt/mappentypen.yaml': vertraegeTypen.replace('felder: [nr, partner]', 'felder: [nr, partner, notiz]').replace('  register:', '    - { key: notiz, label: Notiz, typ: text }\n  register:') });
/** Ungültig schon beim Lesen (liesPaket): kein gültiges YAML. */
const kaputt = ordner('kaputt', { 'manifest.yaml': vertraegeManifest('1.0.0').replace('id: vertraege', 'id: kaputt').replace('name: Verträge', 'name: Kaputt'), 'inhalt/mappentypen.yaml': '- { schluessel: gibtsnicht\n' });

const kurz = (e: PruefErgebnis[]) => e.map((x) => [x.id, x.version, x.vorher, x.ok]);
const m = (id: string, version: string, abhaengigkeiten: Record<string, string> = {}, ersetzt?: string[]) => ({ manifest: { id, version, abhaengigkeiten, ...(ersetzt ? { ersetzt } : {}) } });

describe('Pakete prüfen (#1124)', () => {
  it('Reihenfolge: Abhängigkeiten zuerst, alte Stände vor den Updates, ersetzt, Kreis', () => {
    const basis1 = m('basis', '1.0.0'), basis2 = m('basis', '2.0.0'), v1 = m('vertraege', '1.0.0', { basis: '^1.0.0' }), v2 = m('vertraege', '2.0.0', { basis: '^2.0.0' });
    // Angegeben in beliebiger Reihenfolge: erst alle alten Stände (mit ihren Abhängigkeiten), dann die Updates.
    assert.deepEqual(reihenfolge([v2, basis2, v1, basis1]).reihe, [basis1, v1, basis2, v2]);
    // Nur die neue Version von Verträgen, die die neue Basis braucht: wartet auf das Update von Basis.
    assert.deepEqual(reihenfolge([v2, basis1, basis2]).reihe, [basis1, basis2, v2]);
    // Umzug (#1084): das neue Paket nach der ersetzten Id.
    const neu = m('texterkennung.fra', '1.1.0', {}, ['texterkennung_fra']), alt = m('texterkennung_fra', '1.0.0');
    assert.deepEqual(reihenfolge([neu, alt]).reihe, [alt, neu]);
    const a = m('a', '1.0.0', { b: '^1.0.0' }), b = m('b', '1.0.0', { a: '^1.0.0' }), c = m('c', '1.0.0');
    assert.deepEqual(reihenfolge([a, b, c]), { reihe: [c], kreis: [a, b] });
  });

  for (const pg of [false, true]) {
    describe(pg ? 'PostgreSQL' : 'Arbeitsspeicher', { skip: pg && !process.env.TEST_DATABASE_URL && 'ohne TEST_DATABASE_URL' }, () => {
      /** Leere Ablage in PostgreSQL (zum Vergleich, ob der Arbeitsspeicher dasselbe sagt). */
      async function repo(): Promise<Repo | undefined> {
        if (!pg) return undefined;
        const { pgRepo } = await import('../src/repo-pg');
        const db = await eigeneDatenbank('pp');
        const haushalt = '00000000-0000-4000-8000-000000000001';
        await db.sql`INSERT INTO haushalte (id, name) VALUES (${haushalt}, 'Test') ON CONFLICT DO NOTHING`;
        await db.sql`INSERT INTO benutzer (id, haushalt_id, email, name, rolle) VALUES (${PRUEFER.id}, ${haushalt}, ${PRUEFER.email}, 'Prüfung', 'admin')`;
        return pgRepo(db.sql, haushalt) as Repo;
      }

      it('installiert mehrere Pakete in Abhängigkeitsreihenfolge und aktualisiert alt → neu', async () => {
        const e = await pruefePakete([vertraege11, basis11, vertraege, BASIS], { version: '0.245.0', repo: await repo() });
        assert.deepEqual(kurz(e), [['basis', '1.0.0', null, true], ['vertraege', '1.0.0', null, true], ['basis', '1.1.0', '1.0.0', true], ['vertraege', '1.1.0', '1.0.0', true]]);
        assert.ok(e.every((x) => !x.gruende.length));
      });

      it('nennt die Gründe: ungültiges Paket, fehlende Abhängigkeit, zu neue Ablago-Version', async () => {
        const e = await pruefePakete([kaputt, vertraege], { version: '0.245.0', repo: await repo() });
        assert.deepEqual(kurz(e), [[null, null, null, false], ['vertraege', '1.0.0', null, false]]);
        assert.ok(e[0].gruende.some((g) => /mappentypen\.yaml/.test(g)), e[0].gruende.join(' | '));
        assert.ok(e[1].gruende.some((g) => /basis/.test(g)), e[1].gruende.join(' | '));
        const alt = await pruefePakete([BASIS], { version: '0.50.0', repo: await repo() });
        assert.equal(alt[0].ok, false);
        assert.match(alt[0].gruende.join(' '), /0\.50\.0/);
      });
    });
  }

  it('dieselbe Version zweimal: gleicher Inhalt zählt einmal, anderer ist ein Fehler', async () => {
    const kopie = ordner('basis-kopie', {}, BASIS);
    assert.deepEqual(kurz(await pruefePakete([BASIS, kopie], { version: '0.245.0' })), [['basis', '1.0.0', null, true]]);
    const anders = ordner('basis-anders', { 'README.md': 'anders' }, BASIS);
    const e = await pruefePakete([BASIS, anders], { version: '0.245.0' });
    assert.deepEqual(kurz(e), [['basis', '1.0.0', null, false], ['basis', '1.0.0', null, true]]);
    assert.match(e[0].gruende[0], /Version erhöhen/);
  });

  it('ein Ordner mit Paketordnern darin steht für alle (z. B. pakete/ der Registry)', async () => {
    const sammlung = join(tmp, 'sammlung');
    cpSync(vertraege, join(sammlung, 'vertraege'), { recursive: true });
    cpSync(BASIS, join(sammlung, 'basis'), { recursive: true });
    mkdirSync(join(sammlung, 'kein-paket'));
    assert.deepEqual(kurz(await pruefePakete([sammlung], { version: '0.245.0' })), [['basis', '1.0.0', null, true], ['vertraege', '1.0.0', null, true]]);
    // Ein leerer Ordner bleibt ein (fehlerhaftes) Paket.
    const leer = await pruefePakete([join(sammlung, 'kein-paket')], { version: '0.245.0' });
    assert.equal(leer[0].ok, false);
  });

  it('Gründe auf Englisch', async () => {
    const e = await pruefePakete([vertraege], { version: '0.245.0', sprache: 'en' });
    assert.equal(e[0].ok, false);
    assert.doesNotMatch(e[0].gruende[0], /Es fehlen/);
  });

  it('Befehl pakete-pruefen: Ausgabe, JSON und Exit-Code', () => {
    const lauf = (...args: string[]) => spawnSync(process.execPath, ['--import', 'tsx', 'src/pakete-pruefen.ts', ...args], { cwd: SERVER, encoding: 'utf8', env: { ...process.env, NODE_TEST_CONTEXT: '' } });
    const gut = lauf(vertraege, BASIS);
    assert.equal(gut.status, 0, gut.stderr);
    assert.match(gut.stdout, /^OK +basis 1\.0\.0/m);
    assert.match(gut.stdout, /^OK +vertraege 1\.0\.0/m);
    const schlecht = lauf('--json', '--ablago', '0.245.0', kaputt, BASIS);
    assert.equal(schlecht.status, 1, schlecht.stderr);
    const j = JSON.parse(schlecht.stdout) as { ablago: string; ok: boolean; pakete: PruefErgebnis[] };
    assert.equal(j.ablago, '0.245.0');
    assert.equal(j.ok, false);
    assert.deepEqual(j.pakete.map((p) => p.ok), [false, true]);
    assert.equal(lauf().status, 2);
    assert.equal(lauf('--unbekannt', BASIS).status, 2);
    const hilfe = lauf('--hilfe');
    assert.equal(hilfe.status, 0);
    assert.match(hilfe.stdout, /pakete-pruefen/);
  });
});
