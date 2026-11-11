/**
 * Unbekannte Felder werden ignoriert (#635): im Paket-Manifest, in katalog.json und in der Sammeldatei.
 * Nur so können ältere DMS-Versionen neue Paketversionen weiter installieren, wenn die Registry ein neues
 * optionales Feld einführt (z. B. symbol, kuerzel und kategorien, motom001/dms-registry#98). Abgelehnt wird nur
 * ein anderes Format (schema bzw. format ≠ 1). Diese Tests schlagen fehl, sobald das DMS ein unbekanntes Feld ablehnt.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { liesKatalog } from '../../shared/src/pakete';
import { speicherDateien } from '../src/dateispeicher';
import { Dienst } from '../src/dienst';
import { speicherEinstellungen } from '../src/einstellungen';
import { liesPaket, liesSammelVerzeichnis, Paketverwaltung, type Sammeldatei } from '../src/pakete';
import { speicherRepo } from '../src/repo-speicher';
import { zipPuffer } from '../src/zip';
import { signatur, TEST_PROJEKT, TEST_SEED } from './katalogschluessel';

const ICH = { id: '00000000-0000-4000-8000-0000000000aa', email: 'admin@example.org' };
const KATALOG = 'https://katalog.test/katalog.json';
const BASIS = fileURLToPath(new URL('./pakete/basis', import.meta.url));

function ordner(pfad: string, vor = ''): Record<string, string> {
  const erg: Record<string, string> = {};
  for (const n of readdirSync(pfad)) {
    const p = join(pfad, n);
    if (statSync(p).isDirectory()) Object.assign(erg, ordner(p, `${vor}${n}/`));
    else erg[`${vor}${n}`] = readFileSync(p, 'utf8');
  }
  return erg;
}
// Feste Zeit in den ZIP-Köpfen (#900): sonst unterscheidet sich die Prüfsumme zweier Bauten desselben Archivs
// gelegentlich (Uhrzeit im 2-Sekunden-Raster).
const archiv = (d: Record<string, string>) => zipPuffer(Object.entries(d).map(([name, inhalt]) => ({ name, daten: Buffer.from(inhalt) })), new Date('2026-01-01T12:00:00Z'));
const dateienVon = (d: Record<string, string>) => new Map(Object.entries(d).map(([n, inhalt]) => [n, Buffer.from(inhalt)]));
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
const iso = () => new Date().toISOString().replace(/\.\d+Z$/, 'Z');

const basis = ordner(BASIS);
/** Dasselbe Paket mit unbekannten Feldern: oben im Manifest, in autor und inhalt, an Mappentyp, Ansicht und Beispiel. */
const basisMitMehr: Record<string, string> = {
  ...basis,
  'manifest.yaml': basis['manifest.yaml']
    .replace('lizenz: MIT\n', 'lizenz: MIT\nsymbol: building\nkuerzel: DE\nkategorien: [verwaltung]\nzukunft:\n  stufe: 2\n  liste: [a, b]\n')
    .replace('  github: motom001\n', '  github: motom001\n  web: https://example.org\n')
    .replace('  beispiele: inhalt/beispiele.yaml', '  beispiele: inhalt/beispiele.yaml\n  rollen: inhalt/rollen.yaml\n  zukunft: inhalt/zukunft.yaml'),
  'inhalt/zukunft.yaml': '- irgendwas: 1\n',
  'inhalt/mappentypen.yaml': basis['inhalt/mappentypen.yaml'].replace('- schluessel: organisation\n', '- schluessel: organisation\n  zukunft: { farbe: blau }\n'),
  'inhalt/sichten.yaml': basis['inhalt/sichten.yaml'].replace('- schluessel: organisationen\n', '- schluessel: organisationen\n  zukunft: 1\n'),
  'inhalt/beispiele.yaml': basis['inhalt/beispiele.yaml'].replace('- typ: organisation\n', '- typ: organisation\n  zukunft: true\n'),
};

/** Katalogeintrag wie werkzeuge/katalog.py, mehr: zusätzliche Felder auf allen Ebenen. */
function katalogBytes(pakete: Array<Record<string, string>>, mehr: boolean, erstellt = iso(), dateien?: Map<string, Buffer>): Buffer {
  const liste = pakete.map((p) => {
    const id = /^id: (\S+)$/m.exec(p['manifest.yaml'])![1], version = /^version: (\S+)$/m.exec(p['manifest.yaml'])![1];
    const b = archiv(p);
    dateien?.set(`https://katalog.test/archive/${id}-${version}.zip`, b);
    const v = {
      version, dms: '>=0.63.0', abhaengigkeiten: {}, inhalt: { mappentypen: ['organisation'], sichten: [], beispiele: 2, ...(mehr ? { wortlisten: 0, zukunft: [1] } : {}) },
      code: false, archiv: `archive/${id}-${version}.zip`, sha256: sha(b), groesse: b.length, veroeffentlicht: erstellt, quelle: '', readme: '', changelog: '',
      ...(mehr ? { symbol: 'building', kuerzel: 'DE', kategorien: ['verwaltung'], zukunft: { a: 1 } } : {}),
    };
    return {
      id, name: id, beschreibung: '', autor: { name: 'Test', github: 'test', ...(mehr ? { web: 'https://example.org' } : {}) }, lizenz: 'MIT', aktuell: version, versionen: [v],
      ...(mehr ? { symbol: 'building', kuerzel: 'DE', kategorien: ['verwaltung'], merkmal: 'lokal', zukunft: null } : {}),
    };
  });
  return Buffer.from(`${JSON.stringify({ format: 1, erstellt, quelle: 'https://github.com/motom001/dms-registry', ...(mehr ? { signatur: null, kategorien: [{ id: 'verwaltung', name: 'Verwaltung' }], zukunft: 'x' } : {}), pakete: liste }, null, 2)}\n`);
}

/** Sammeldatei wie von der Katalog-Webseite; mehr: zusätzliche Felder im Verzeichnis und je Eintrag. */
function sammeldatei(pakete: Array<Record<string, string>>, mehr: boolean, mit?: { katalog: Buffer; sig: Buffer }): Buffer {
  const d = new Map<string, Buffer>();
  const eintraege = pakete.map((p) => {
    const id = /^id: (\S+)$/m.exec(p['manifest.yaml'])![1], version = /^version: (\S+)$/m.exec(p['manifest.yaml'])![1];
    const b = archiv(p);
    d.set(`pakete/${id}-${version}.zip`, b);
    return { id, version, name: id, archiv: `pakete/${id}-${version}.zip`, sha256: sha(b), groesse: b.length, gewaehlt: true, ...(mehr ? { symbol: 'building', kuerzel: 'DE', zukunft: { a: 1 } } : {}) };
  });
  const vz = { format: 1, art: 'dms-sammeldatei', erstellt: iso(), quelle: 'https://github.com/motom001/dms-registry', katalog: KATALOG, dms: '0.149.1', pakete: eintraege, ...(mehr ? { auswahl: 'alle', zukunft: [1, 2] } : {}) };
  d.set('sammeldatei.json', Buffer.from(JSON.stringify(vz)));
  if (mit) { d.set('katalog.json', mit.katalog); d.set('katalog.sig', mit.sig); }
  return zipPuffer([...d].map(([name, daten]) => ({ name, daten })));
}

async function aufbau(abrufbar = new Map<string, Buffer>()) {
  const d = new Dienst(speicherRepo(), speicherDateien(), { einstellungen: speicherEinstellungen() });
  const abruf = async (url: string) => { const b = abrufbar.get(url); if (!b) throw new Error(`404 ${url}`); return b; };
  const p = new Paketverwaltung(d, { version: () => '0.149.1', abruf, katalogUrl: KATALOG, projektSchluessel: TEST_PROJEKT });
  return { d, p };
}
const alsSammel = (r: unknown): Sammeldatei => { assert.ok(r && typeof r === 'object' && 'sammeldatei' in r); return (r as { sammeldatei: Sammeldatei }).sammeldatei; };
/** Was das DMS aus einem Paket anlegt, ohne Ids: Mappentypen mit Feldern und Registern, Ansichten, Mappen. */
async function angelegt(d: Dienst) {
  const typen = (await d.mappentypen.listeTypen()).filter((t) => t.schluessel === 'basis:organisation');
  const sichten = await d.listeSichten();
  return {
    typen: typen.map((t) => ({ name: t.name, felder: t.felder, register: t.register.map((r) => r.key) })),
    sichten: sichten.map((s) => s.name).sort(),
    mappen: (await d.seite({ id: ICH.id, rolle: 'admin' }, {})).gesamt,
  };
}

describe('Unbekannte Felder werden ignoriert (#635)', () => {
  it('Manifest: zusätzliche Felder oben, in autor, inhalt, Mappentyp, Ansicht und Beispiel ändern nichts', () => {
    const ohne = liesPaket(dateienVon(basis));
    const mit = liesPaket(dateienVon(basisMitMehr));
    assert.deepEqual(mit, ohne);
    assert.ok(!('symbol' in mit.manifest) && !('kuerzel' in mit.manifest) && !('kategorien' in mit.manifest));
    // Nur ein anderes Format wird abgelehnt.
    assert.throws(() => liesPaket(dateienVon({ ...basisMitMehr, 'manifest.yaml': basisMitMehr['manifest.yaml'].replace('schema: 1', 'schema: 2') })),
      (e: unknown) => ((e as { details?: { gruende?: string[] } }).details?.gruende ?? []).some((g) => /Format 2 kennt diese Ablago-Version nicht/.test(g)));
  });

  it('Manifest: installiert aus dem Katalog genau wie ohne die Felder', async () => {
    const ergebnis = [];
    for (const paket of [basis, basisMitMehr]) {
      const abrufbar = new Map<string, Buffer>();
      abrufbar.set(KATALOG, katalogBytes([paket], false, iso(), abrufbar));
      const { d, p } = await aufbau(abrufbar);
      const inst = await p.installiere({ id: 'basis', version: '1.0.0', beispiele: true }, ICH);
      assert.equal(inst.version, '1.0.0');
      ergebnis.push(await angelegt(d));
    }
    assert.deepEqual(ergebnis[1], ergebnis[0]);
  });

  it('katalog.json: zusätzliche Felder oben, je Paket, je Version und in inhalt – gelesen, installierbar; nur format ≠ 1 wird abgelehnt', async () => {
    const roh = JSON.parse(katalogBytes([basis], true).toString('utf8'));
    const k = liesKatalog(roh);
    const ohne = liesKatalog(JSON.parse(katalogBytes([basis], false).toString('utf8')));
    assert.deepEqual(Object.keys(k).sort(), Object.keys(ohne).sort());
    // Symbol, Kürzel und Kategorien liest Ablago seit #645 für die Kacheln; alles andere bleibt unbeachtet.
    const { symbol, kuerzel, kategorien, ...rest } = k.pakete[0];
    assert.deepEqual({ symbol, kuerzel, kategorien }, { symbol: 'building', kuerzel: 'DE', kategorien: ['verwaltung'] });
    assert.deepEqual({ ...rest, versionen: [] }, { ...ohne.pakete[0], versionen: [] });
    assert.equal(k.pakete[0].versionen[0].sha256, ohne.pakete[0].versionen[0].sha256);
    assert.deepEqual(k.pakete[0].versionen[0].inhalt, ohne.pakete[0].versionen[0].inhalt);
    assert.throws(() => liesKatalog({ ...roh, format: 2 }), /Katalogformat 2/);

    // Über den Abruf: Katalog lesen, Paket installieren (Archiv mit unbekannten Manifest-Feldern).
    const abrufbar = new Map<string, Buffer>();
    abrufbar.set(KATALOG, katalogBytes([basisMitMehr], true, iso(), abrufbar));
    const { p } = await aufbau(abrufbar);
    assert.deepEqual((await p.katalog()).katalog.pakete.map((x) => x.id), ['basis']);
    assert.equal((await p.installiere({ id: 'basis', version: '1.0.0', beispiele: false }, ICH)).version, '1.0.0');
  });

  it('Sammeldatei: zusätzliche Felder im Verzeichnis und je Eintrag – gelesen, installierbar; nur format ≠ 1 wird abgelehnt', async () => {
    const vz = (mehr: boolean, format = 1) => {
      const j = { format, art: 'dms-sammeldatei', erstellt: '2026-11-03T12:00:00Z', quelle: 'q', katalog: KATALOG, dms: null, pakete: [{ id: 'basis', version: '1.0.0', name: 'Basis', archiv: 'pakete/basis-1.0.0.zip', sha256: '0'.repeat(64), groesse: 10, gewaehlt: true, ...(mehr ? { symbol: 'building', zukunft: {} } : {}) }], ...(mehr ? { zukunft: [1] } : {}) };
      return Buffer.from(JSON.stringify(j));
    };
    assert.deepEqual(liesSammelVerzeichnis(vz(true)), liesSammelVerzeichnis(vz(false)));
    assert.throws(() => liesSammelVerzeichnis(vz(true, 2)), (e: unknown) => ((e as { details?: { gruende?: string[] } }).details?.gruende ?? []).some((g) => /Format 2/.test(g)));

    const { d, p } = await aufbau();
    const s = alsSammel(await p.hochladenDatei(sammeldatei([basisMitMehr], true), ICH));
    assert.deepEqual(s.pakete.map((x) => `${x.id}@${x.version}:${x.stand}`), ['basis@1.0.0:neu']);
    assert.equal((await p.installiere({ upload: s.pakete[0].upload, bestaetigt: true }, ICH)).id, 'basis');
    assert.equal((await d.kern.repo.listePakete()).length, 1);
  });

  it('Sammeldatei mit signiertem katalog.json voller unbekannter Felder: Signatur über die rohen Bytes gilt', async () => {
    const stand = iso();
    const k = katalogBytes([basisMitMehr], true, stand);
    const { p } = await aufbau();
    const s = alsSammel(await p.hochladenDatei(sammeldatei([basisMitMehr], true, { katalog: k, sig: signatur(k, TEST_SEED.signier, stand) }), ICH));
    assert.equal(s.datei.pruefung.art, 'projekt');
    assert.equal(s.datei.pruefung.bestaetigen, false);
    assert.equal(s.pakete[0].katalog, 'gleich');
    // Dieselben Bytes, ein Feld verändert: Signatur ungültig – unbekannte Felder sind nicht ausgenommen.
    const verändert = Buffer.from(k.toString('utf8').replace('"zukunft": "x"', '"zukunft": "y"'));
    assert.notDeepEqual(verändert, k);
    const u = alsSammel(await p.hochladenDatei(sammeldatei([basisMitMehr], true, { katalog: verändert, sig: signatur(k, TEST_SEED.signier, stand) }), ICH));
    assert.equal(u.datei.pruefung.art, 'ungueltig');
  });
});
