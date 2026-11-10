/**
 * Herkunft von Paketen (#594): signierter offizieller Katalog, Sammeldatei mit signiertem Katalog, eigene
 * Kataloge mit eigenem Schlüssel (erster Kontakt wie bei SSH), Zurückdrehen auf ältere Kataloge,
 * Weiterleitungen nur auf https://.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import type { Katalog } from '../../shared/src/pakete';
import { speicherDateien } from '../src/dateispeicher';
import { Dienst } from '../src/dienst';
import { speicherEinstellungen } from '../src/einstellungen';
import { Fachfehler } from '../src/fehler';
import { liesSchluessel, nurTestschluessel, projektSchluessel, pruefeSignatur } from '../src/katalogsignatur';
import { holeDaten, KLEIN_MAX, Paketverwaltung, type Sammeldatei } from '../src/pakete';
import { PROJEKT_SCHLUESSEL } from '../src/projektschluessel';
import { speicherRepo } from '../src/repo-speicher';
import { zipPuffer } from '../src/zip';
import { oeffentlichPem, signatur, TEST_PROJEKT, TEST_SEED } from './katalogschluessel';
import { paketKatalogStaende, paketQuellen } from '../src/pakete/pakete.einstellungen';

const ICH = { id: '00000000-0000-4000-8000-0000000000aa', email: 'admin@example.org' };
const OFFIZIELL = 'https://katalog.test/katalog.json';
const EIGEN = 'https://lena.example.org/pakete/katalog.json';
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
// Feste Zeit in den ZIP-Köpfen (#900): Dasselbe Archiv wird für Katalog und Sammeldatei zweimal gebaut; mit der
// Uhrzeit (2-Sekunden-Raster) unterschied sich sonst gelegentlich die Prüfsumme („Sammeldatei beschädigt“).
const ZIP_ZEIT = new Date('2026-01-01T12:00:00Z');
const archiv = (d: Record<string, string>) => zipPuffer(Object.entries(d).map(([name, inhalt]) => ({ name, daten: Buffer.from(inhalt) })), ZIP_ZEIT);
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
const basis = ordner(BASIS);
const basis11 = { ...basis, 'manifest.yaml': basis['manifest.yaml'].replace('version: 1.0.0', 'version: 1.1.0') };
const TAG = 86_400_000;
// Feste Bezugszeit je Testlauf: zwei Aufrufe von iso(1) dürfen nicht eine Sekunde auseinanderliegen.
const JETZT = Date.now();
const iso = (vorTagen: number) => new Date(JETZT - vorTagen * TAG).toISOString().replace(/\.\d+Z$/, 'Z');

/** Katalog-Bytes und Archive für eine Adresse. */
function katalogDaten(url: string, pakete: Array<Record<string, string>>, erstellt: string, dateien: Map<string, Buffer>): Buffer {
  const basisUrl = url.slice(0, url.lastIndexOf('/') + 1);
  const liste: Katalog['pakete'] = [];
  for (const p of pakete) {
    const id = /^id: (\S+)$/m.exec(p['manifest.yaml'])![1], version = /^version: (\S+)$/m.exec(p['manifest.yaml'])![1];
    const b = archiv(p);
    dateien.set(`${basisUrl}archive/${id}-${version}.zip`, b);
    let kp = liste.find((x) => x.id === id);
    if (!kp) { kp = { id, name: id, beschreibung: '', autor: { name: 'Test', github: 'test' }, lizenz: 'MIT', aktuell: version, versionen: [] }; liste.push(kp); }
    kp.versionen.unshift({ version, dms: '>=0.60.0', abhaengigkeiten: {}, inhalt: { mappentypen: [], sichten: [], beispiele: 0 }, code: false, archiv: `archive/${id}-${version}.zip`, sha256: sha(b), groesse: b.length, veroeffentlicht: erstellt, quelle: '', readme: '', changelog: '' });
    kp.aktuell = version;
  }
  const k = Buffer.from(`${JSON.stringify({ format: 1, erstellt, quelle: 'https://github.com/motom001/dms-registry', signatur: null, pakete: liste }, null, 2)}\n`);
  dateien.set(url, k);
  return k;
}
const neben = (url: string, datei: string) => new URL(datei, url).href;

/** testschluessel: false baut die Paketverwaltung wie im Betrieb, mit den eingebauten Projektschlüsseln. */
async function aufbau(testschluessel = true) {
  const dateien = new Map<string, Buffer>();
  const abruf = async (url: string) => { const b = dateien.get(url); if (!b) throw new Error(`404 ${url}`); return b; };
  const d = new Dienst(speicherRepo(), speicherDateien(), { einstellungen: speicherEinstellungen() });
  const p = new Paketverwaltung(d, { version: () => '0.141.0', abruf, katalogUrl: OFFIZIELL, ...(testschluessel ? { projektSchluessel: TEST_PROJEKT } : {}) });
  /** Offiziellen Katalog veröffentlichen; seed: signieren mit diesem Schlüssel, null: ohne Signatur. */
  const offiziell = (pakete: Array<Record<string, string>>, erstellt: string, seed: string | null = TEST_SEED.signier) => {
    const k = katalogDaten(OFFIZIELL, pakete, erstellt, dateien);
    if (seed) dateien.set(neben(OFFIZIELL, 'katalog.sig'), signatur(k, seed, erstellt)); else dateien.delete(neben(OFFIZIELL, 'katalog.sig'));
    return k;
  };
  return { d, p, dateien, offiziell };
}

const warnung = (e: unknown) => e instanceof Fachfehler && (e.details as { warnung?: boolean })?.warnung === true;

/** Sammeldatei wie von der Katalog-Webseite, optional mit katalog.json und katalog.sig. */
function sammeldatei(pakete: Array<Record<string, string>>, mit?: { katalog: Buffer; sig?: Buffer }) {
  const d = new Map<string, Buffer>();
  const eintraege = pakete.map((p) => {
    const id = /^id: (\S+)$/m.exec(p['manifest.yaml'])![1], version = /^version: (\S+)$/m.exec(p['manifest.yaml'])![1];
    const b = archiv(p);
    d.set(`pakete/${id}-${version}.zip`, b);
    return { id, version, name: id, archiv: `pakete/${id}-${version}.zip`, sha256: sha(b), groesse: b.length, gewaehlt: true };
  });
  d.set('sammeldatei.json', Buffer.from(JSON.stringify({ format: 1, art: 'dms-sammeldatei', erstellt: iso(0), quelle: 'https://github.com/motom001/dms-registry', katalog: OFFIZIELL, dms: '0.141.0', pakete: eintraege })));
  if (mit) { d.set('katalog.json', mit.katalog); if (mit.sig) d.set('katalog.sig', mit.sig); }
  return zipPuffer([...d].map(([name, daten]) => ({ name, daten })));
}
const alsSammel = (r: unknown): Sammeldatei => { assert.ok(r && typeof r === 'object' && 'sammeldatei' in r); return (r as { sammeldatei: Sammeldatei }).sammeldatei; };

describe('Projektschlüssel (#594)', () => {
  it('die echten Schlüssel des Maintainers sind eingebaut, keine Testschlüssel', () => {
    assert.deepEqual(PROJEKT_SCHLUESSEL.map((s) => s.rolle), ['signier', 'reserve']);
    const echt = projektSchluessel();
    assert.notEqual(echt[0].fingerabdruck, echt[1].fingerabdruck);
    // Kein eingebauter Schlüssel darf einer sein, dessen privates Gegenstück in den Tests steht.
    const bekannt = Object.values(TEST_SEED).map((seed) => liesSchluessel(oeffentlichPem(seed)).fingerabdruck);
    for (const k of echt) assert.ok(!bekannt.includes(k.fingerabdruck), `Testschlüssel ${k.kennung} als Projektschlüssel`);
    assert.deepEqual(PROJEKT_SCHLUESSEL.map((x) => x.test), [false, false]);
    assert.equal(nurTestschluessel(), false);
    // motom001/dms-registry#74 (signier.pub, reserve.pub); SHA-256 über DER wäre f185b2c3…/7eb674da…
    assert.deepEqual(echt.map((k) => k.fingerabdruck), [
      '6d86 8387 314e 64df 715c a3bd 9856 58d5 f888 c0ea 7cab ac91 a43f 9b99 6052 e728',
      '4543 c81b 5ccf 522d f5a3 5e76 6660 8774 5f6c ae42 4722 3b6d 91c9 63cc 34b0 3954',
    ]);
  });

  it('SECURITY.md und SECURITY.en.md nennen genau die eingebauten Fingerabdrücke', () => {
    for (const datei of ['SECURITY.md', 'SECURITY.en.md']) {
      const text = readFileSync(fileURLToPath(new URL(`../../${datei}`, import.meta.url)), 'utf8');
      for (const k of projektSchluessel()) {
        assert.ok(text.includes(`\`${k.kennung}\``), `${datei}: Kennung ${k.kennung} fehlt`);
        assert.ok(text.includes(`\`${k.fingerabdruck}\``), `${datei}: Fingerabdruck ${k.fingerabdruck} fehlt`);
      }
    }
  });

  it('ohne mitgegebene Schlüssel gilt ein mit Testschlüsseln signierter Katalog nicht', () => {
    const daten = Buffer.from('{"format":1}\n');
    for (const seed of [TEST_SEED.signier, TEST_SEED.reserve]) assert.ok(!pruefeSignatur(daten, signatur(daten, seed), projektSchluessel()).ok);
  });

  it('Fingerabdruck und Kennung wie in der Registry (werkzeuge/signieren.py)', () => {
    const [s] = projektSchluessel(TEST_PROJEKT);
    // Dieselben Werte rechnet werkzeuge/signieren.py (dms-registry) aus.
    assert.equal(s.kennung, 'da31d65f4a429768');
    assert.equal(s.fingerabdruck, 'da31 d65f 4a42 9768 db27 8f76 e67a ce99 7024 9d25 9352 e7da 5a0b 931b d85d 5ac0');
    assert.throws(() => liesSchluessel('-----BEGIN PUBLIC KEY-----\nMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE\n-----END PUBLIC KEY-----\n'), /PEM|Ed25519/);
  });

  it('Signatur: gültig mit beiden Schlüsseln, ungültig bei verändertem Inhalt oder fremdem Schlüssel', () => {
    const daten = Buffer.from('{"format":1}\n');
    assert.ok(pruefeSignatur(daten, signatur(daten, TEST_SEED.signier), projektSchluessel(TEST_PROJEKT)).ok);
    assert.ok(pruefeSignatur(daten, signatur(daten, TEST_SEED.reserve), projektSchluessel(TEST_PROJEKT)).ok);
    const r = pruefeSignatur(Buffer.from('{"format":1} \n'), signatur(daten, TEST_SEED.signier), projektSchluessel(TEST_PROJEKT));
    assert.ok(!r.ok && /passt nicht/.test(r.grund));
    const f = pruefeSignatur(daten, signatur(daten, TEST_SEED.fremd), projektSchluessel(TEST_PROJEKT));
    assert.ok(!f.ok && /unbekannter Schlüssel/.test(f.grund));
    assert.ok(!pruefeSignatur(daten, Buffer.from('kein json'), projektSchluessel(TEST_PROJEKT)).ok);
    assert.ok(!pruefeSignatur(daten, Buffer.from('{"signatur":"AAAA"}'), projektSchluessel(TEST_PROJEKT)).ok);
  });
});

describe('Offizieller Katalog mit Signatur (#594)', () => {
  it('gültig signiert: Herkunft „Ablago-Projekt“, keine Bestätigung nötig', async () => {
    const { p, offiziell } = await aufbau();
    const stand = iso(1);
    offiziell([basis], stand);
    const k = await p.katalog();
    assert.deepEqual(k.pruefung, { art: 'projekt', offiziell: true, stand, test: true, bestaetigen: false });
    const v = await p.vorschau({ id: 'basis' });
    assert.equal(v.pruefung?.art, 'projekt');
    const inst = await p.installiere({ id: 'basis' }, ICH);
    assert.deepEqual(inst.herkunft, { art: 'katalog', url: OFFIZIELL });
  });

  it('mit dem Reserveschlüssel signiert: ebenso gültig', async () => {
    const { p, offiziell } = await aufbau();
    offiziell([basis], iso(1), TEST_SEED.reserve);
    assert.equal((await p.katalog()).pruefung.art, 'projekt');
  });

  it('ohne Signatur: nur Warnung (Stufe 1), installieren ohne Bestätigung', async () => {
    const { p, offiziell } = await aufbau();
    offiziell([basis], iso(1), null);
    assert.deepEqual((await p.katalog()).pruefung, { art: 'unsigniert', offiziell: true, bestaetigen: false });
    assert.equal((await p.installiere({ id: 'basis' }, ICH)).version, '1.0.0');
  });

  it('wie im Betrieb (eingebaute Schlüssel): mit Testschlüssel signiert gilt als ungültig, ohne Testhinweis', async () => {
    const { p, offiziell } = await aufbau(false);
    offiziell([basis], iso(1), TEST_SEED.signier);
    assert.deepEqual((await p.katalog()).pruefung, { art: 'ungueltig', offiziell: true, bestaetigen: true });
    offiziell([basis], iso(1), null);
    assert.deepEqual((await p.katalog()).pruefung, { art: 'unsigniert', offiziell: true, bestaetigen: false });
  });

  it('ungültige Signatur (Katalog verändert oder fremder Schlüssel): Bestätigung nötig', async () => {
    const { p, offiziell, dateien } = await aufbau();
    const k = offiziell([basis], iso(1));
    dateien.set(OFFIZIELL, Buffer.from(k.toString().replace('"lizenz": "MIT"', '"lizenz": "GPL"')));
    assert.deepEqual((await p.katalog()).pruefung, { art: 'ungueltig', offiziell: true, bestaetigen: true });
    await assert.rejects(p.installiere({ id: 'basis' }, ICH), (e) => warnung(e) && /Signatur des Katalogs ist ungültig/.test((e as Error).message));
    offiziell([basis], iso(1), TEST_SEED.fremd);
    assert.equal((await p.katalog()).pruefung.art, 'ungueltig');
    assert.equal((await p.installiere({ id: 'basis', bestaetigt: true }, ICH)).version, '1.0.0');
  });

  it('älterer signierter Stand als zuletzt gesehen: abgelehnt; gleicher und neuerer gehen', async () => {
    const { p, offiziell, d } = await aufbau();
    offiziell([basis], iso(2));
    await p.katalog();
    offiziell([basis, basis11], iso(1));
    assert.equal((await p.katalog()).katalog.pakete[0].aktuell, '1.1.0');
    assert.equal((await paketKatalogStaende(d.kern))[OFFIZIELL], iso(1));
    await p.katalog();
    offiziell([basis], iso(2));
    await assert.rejects(p.katalog(), /älteren Stand/);
    // Ohne Signatur gibt es keinen belegten Stand – das bleibt eine Warnung (Stufe 1).
    offiziell([basis], iso(3), null);
    assert.equal((await p.katalog()).pruefung.art, 'unsigniert');
  });

  it('hochgeladenes Paket mit Prüfsumme aus dem offiziellen Katalog: „entspricht Katalogversion“', async () => {
    const { p, offiziell } = await aufbau();
    offiziell([basis, basis11], iso(1));
    await p.katalog();
    const gleich = await p.hochladen(archiv(basis11), ICH);
    assert.deepEqual(gleich.vorschau.pruefung, { art: 'datei', offiziell: false, katalogversion: '1.1.0', bestaetigen: true });
    const anders = await p.hochladen(archiv({ ...basis11, 'README.md': 'anders' }), ICH);
    assert.deepEqual(anders.vorschau.pruefung, { art: 'datei', offiziell: false, bestaetigen: true });
    await assert.rejects(p.installiere({ upload: gleich.upload }, ICH), warnung, 'Hochladen bleibt wie bisher mit Bestätigung');
  });
});

describe('Sammeldatei mit signiertem Katalog (#594)', () => {
  it('gültig signiert, alle Archive darin: keine Bestätigung, Stand wird gemerkt', async () => {
    const { p, d } = await aufbau();
    const stand = iso(10);
    const quelle = new Map<string, Buffer>();
    const k = katalogDaten(OFFIZIELL, [basis], stand, quelle);
    const s = alsSammel(await p.hochladenDatei(sammeldatei([basis], { katalog: k, sig: signatur(k, TEST_SEED.signier, stand) }), ICH));
    assert.deepEqual(s.datei.pruefung, { art: 'projekt', offiziell: true, stand, test: true, bestaetigen: false });
    assert.deepEqual(s.datei.nichtImKatalog, []);
    assert.equal(s.pakete[0].katalog, 'gleich');
    assert.equal(s.pakete[0].vorschau.pruefung?.art, 'projekt');
    const inst = await p.installiere({ upload: s.pakete[0].upload }, ICH);
    assert.equal(inst.herkunft.art, 'hochgeladen');
    assert.equal((await paketKatalogStaende(d.kern))[OFFIZIELL], stand);
  });

  it('älter als 90 Tage: Hinweis; Archiv nicht im Katalog: dafür Bestätigung', async () => {
    const { p } = await aufbau();
    const stand = iso(120);
    const k = katalogDaten(OFFIZIELL, [basis], stand, new Map());
    const extraPaket = { ...basis11, 'manifest.yaml': basis11['manifest.yaml'].replace('id: basis', 'id: extra') };
    const s = alsSammel(await p.hochladenDatei(sammeldatei([basis, extraPaket], { katalog: k, sig: signatur(k, TEST_SEED.signier, stand) }), ICH));
    assert.equal(s.datei.pruefung.alt, true);
    assert.equal(s.datei.pruefung.bestaetigen, true);
    assert.deepEqual(s.datei.nichtImKatalog, ['Basis 1.1.0']);
    const extra = s.pakete.find((x) => x.id === 'extra')!;
    assert.deepEqual(extra.vorschau.pruefung, { art: 'datei', offiziell: false, bestaetigen: true });
    await assert.rejects(p.installiere({ upload: extra.upload }, ICH), warnung);
    assert.equal((await p.installiere({ upload: s.pakete.find((x) => x.id === 'basis')!.upload }, ICH)).id, 'basis');
  });

  it('Archiv anders als im signierten Katalog: ganze Datei abgelehnt', async () => {
    const { p } = await aufbau();
    const k = katalogDaten(OFFIZIELL, [basis], iso(1), new Map());
    await assert.rejects(p.hochladenDatei(sammeldatei([{ ...basis, 'README.md': 'untergeschoben' }], { katalog: k, sig: signatur(k, TEST_SEED.signier, iso(1)) }), ICH),
      (e) => e instanceof Fachfehler && ((e.details as { gruende: string[] }).gruende).some((g) => /signierten Katalog in der Sammeldatei/.test(g)));
  });

  it('ungültige oder fehlende Signatur: wie bisher mit Bestätigung', async () => {
    const { p } = await aufbau();
    const k = katalogDaten(OFFIZIELL, [basis], iso(1), new Map());
    const falsch = alsSammel(await p.hochladenDatei(sammeldatei([basis], { katalog: k, sig: signatur(k, TEST_SEED.fremd, iso(1)) }), ICH));
    assert.deepEqual(falsch.datei.pruefung, { art: 'ungueltig', offiziell: false, bestaetigen: true });
    const ohneSig = alsSammel(await p.hochladenDatei(sammeldatei([basis], { katalog: k }), ICH));
    assert.equal(ohneSig.datei.pruefung.art, 'unsigniert');
    const ohne = alsSammel(await p.hochladenDatei(sammeldatei([basis]), ICH));
    assert.deepEqual(ohne.datei.pruefung, { art: 'unsigniert', offiziell: false, bestaetigen: true });
    assert.equal(ohne.pakete[0].katalog, 'unbekannt');
    await assert.rejects(p.installiere({ upload: ohne.pakete[0].upload }, ICH), warnung);
  });
});

describe('Eigener Katalog mit eigenem Schlüssel (#594)', () => {
  async function eigen(seed: string | null = TEST_SEED.anbieter) {
    const a = await aufbau();
    a.offiziell([basis], iso(5));
    const veroeffentliche = (pakete: Array<Record<string, string>>, erstellt: string, sigSeed: string | null = seed) => {
      const k = katalogDaten(EIGEN, pakete, erstellt, a.dateien);
      if (sigSeed) a.dateien.set(neben(EIGEN, 'katalog.sig'), signatur(k, sigSeed, erstellt)); else a.dateien.delete(neben(EIGEN, 'katalog.sig'));
    };
    if (seed) a.dateien.set(neben(EIGEN, 'katalog.schluessel'), Buffer.from(oeffentlichPem(seed)));
    veroeffentliche([basis11], iso(2));
    return { ...a, veroeffentliche };
  }
  const fingerabdruckAus = async (f: Promise<unknown>) => {
    try { await f; } catch (e) { assert.ok(e instanceof Fachfehler && e.status === 409, String(e)); return (e.details as { fingerabdruck: string }).fingerabdruck; }
    assert.fail('erwartet: Rückfrage mit Fingerabdruck');
  };

  it('erster Kontakt: Fingerabdruck zeigen, erst nach Bestätigung merken; danach ohne Herkunfts-Bestätigung', async () => {
    const { p, d } = await eigen();
    const fp = await fingerabdruckAus(p.quelleHinzufuegen({ url: EIGEN }, ICH));
    assert.equal(fp, liesSchluessel(oeffentlichPem(TEST_SEED.anbieter)).fingerabdruck);
    assert.equal((await paketQuellen(d.kern)).length, 0, 'nicht stillschweigend übernommen');
    await assert.rejects(p.quelleHinzufuegen({ url: EIGEN, fingerabdruck: 'abcd' }, ICH), /anderen Fingerabdruck/);
    const quellen = await p.quelleHinzufuegen({ url: EIGEN, fingerabdruck: fp }, ICH);
    assert.equal(quellen[1].fingerabdruck, fp);
    const k = await p.katalog(EIGEN);
    assert.deepEqual(k.pruefung, { art: 'anbieter', offiziell: false, stand: iso(2), fingerabdruck: fp, bestaetigen: false });
    const inst = await p.installiere({ id: 'basis', quelle: EIGEN }, ICH);
    assert.deepEqual(inst.herkunft, { art: 'katalog', url: EIGEN });
  });

  it('Quelle ohne Schlüssel: wie bisher, Bestätigung je Installation', async () => {
    const { p } = await eigen(null);
    const q = await p.quelleHinzufuegen({ url: EIGEN }, ICH);
    assert.equal(q[1].fingerabdruck, null);
    assert.deepEqual((await p.katalog(EIGEN)).pruefung, { art: 'unsigniert', offiziell: false, bestaetigen: true });
    await assert.rejects(p.installiere({ id: 'basis', quelle: EIGEN }, ICH), warnung);
  });

  it('bestätigter Schlüssel, aber Signatur fehlt oder passt nicht: Katalog wird nicht genommen', async () => {
    const { p, veroeffentliche } = await eigen();
    const fp = await fingerabdruckAus(p.quelleHinzufuegen({ url: EIGEN }, ICH));
    await p.quelleHinzufuegen({ url: EIGEN, fingerabdruck: fp }, ICH);
    veroeffentliche([basis11], iso(1), null);
    await assert.rejects(p.katalog(EIGEN), /keine gültige Signatur \(katalog\.sig fehlt\)/);
    veroeffentliche([basis11], iso(1), TEST_SEED.fremd);
    await assert.rejects(p.katalog(EIGEN), /keine gültige Signatur/);
    // Zurückdrehen gilt auch für eigene Kataloge.
    veroeffentliche([basis11], iso(1));
    await p.katalog(EIGEN);
    veroeffentliche([basis11], iso(3));
    await assert.rejects(p.katalog(EIGEN), /älteren Stand/);
  });

  it('Schlüssel ohne Signatur des alten gewechselt: gesperrt bis zur Bestätigung', async () => {
    const { p, dateien, veroeffentliche } = await eigen();
    await p.quelleHinzufuegen({ url: EIGEN, fingerabdruck: await fingerabdruckAus(p.quelleHinzufuegen({ url: EIGEN }, ICH)) }, ICH);
    dateien.set(neben(EIGEN, 'katalog.schluessel'), Buffer.from(oeffentlichPem(TEST_SEED.anbieterNeu)));
    veroeffentliche([basis11], iso(1), TEST_SEED.anbieterNeu);
    const neuFp = liesSchluessel(oeffentlichPem(TEST_SEED.anbieterNeu)).fingerabdruck;
    await assert.rejects(p.katalog(EIGEN), (e) => e instanceof Fachfehler && /gesperrt/.test(e.message) && e.message.includes(neuFp));
    assert.deepEqual((await p.quellen())[1].gesperrt?.fingerabdruck, neuFp);
    await assert.rejects(p.katalog(EIGEN), /gesperrt/, 'bleibt gesperrt, auch beim nächsten Abruf');
    const abruf = await p.abrufen(true);
    assert.match(abruf.kataloge[1].fehler ?? '', /gesperrt/);
    // Admin vergleicht und bestätigt den neuen Fingerabdruck.
    assert.equal(await fingerabdruckAus(p.quelleSchluessel({ url: EIGEN }, ICH)), neuFp);
    const q = await p.quelleSchluessel({ url: EIGEN, fingerabdruck: neuFp }, ICH);
    assert.equal(q[1].fingerabdruck, neuFp);
    assert.equal(q[1].gesperrt, null);
    assert.equal((await p.katalog(EIGEN)).pruefung.art, 'anbieter');
  });

  it('geordneter Wechsel: neuer Schlüssel mit dem alten signiert – nur Hinweis, keine Sperre', async () => {
    const { p, dateien, veroeffentliche } = await eigen();
    await p.quelleHinzufuegen({ url: EIGEN, fingerabdruck: await fingerabdruckAus(p.quelleHinzufuegen({ url: EIGEN }, ICH)) }, ICH);
    const neu = Buffer.from(oeffentlichPem(TEST_SEED.anbieterNeu));
    dateien.set(neben(EIGEN, 'katalog.schluessel'), neu);
    dateien.set(neben(EIGEN, 'katalog.schluessel.sig'), signatur(neu, TEST_SEED.anbieter));
    veroeffentliche([basis11], iso(1), TEST_SEED.anbieterNeu);
    const k = await p.katalog(EIGEN);
    const neuFp = liesSchluessel(neu.toString()).fingerabdruck;
    assert.deepEqual(k.pruefung, { art: 'anbieter', offiziell: false, stand: iso(1), fingerabdruck: neuFp, wechsel: true, bestaetigen: false });
    assert.equal((await p.quellen())[1].fingerabdruck, neuFp);
    // Mit dem neuen Schlüssel signierter Wechsel-Nachweis des alten zählt nicht.
    dateien.set(neben(EIGEN, 'katalog.schluessel'), Buffer.from(oeffentlichPem(TEST_SEED.fremd)));
    dateien.set(neben(EIGEN, 'katalog.schluessel.sig'), signatur(Buffer.from(oeffentlichPem(TEST_SEED.fremd)), TEST_SEED.fremd));
    veroeffentliche([basis11], iso(0), TEST_SEED.fremd);
    await assert.rejects(p.katalog(EIGEN), /gesperrt/);
  });
});

describe('Weiterleitungen nur auf https:// (#594)', () => {
  it('folgt keiner Weiterleitung auf http:// und nicht endlos', async () => {
    const server = createServer((req, res) => {
      if (req.url === '/katalog.json') { res.writeHead(302, { location: 'http://127.0.0.1:1/boese.json' }); res.end(); return; }
      if (req.url === '/schleife') { res.writeHead(301, { location: 'https://127.0.0.1:1/x' }); res.end(); return; }
      if (req.url === '/ok') { res.end('{"ok":true}'); return; }
      // Ohne Content-Length, in Stücken: die Grenze greift beim Lesen (#683, Katalog höchstens KLEIN_MAX).
      if (req.url === '/gross') { const mb = Buffer.alloc(1024 * 1024, 32); let n = 0; const weiter = () => { while (n++ < 12) if (!res.write(mb)) return res.once('drain', weiter); res.end(); }; weiter(); return; }
      res.writeHead(404); res.end();
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const port = (server.address() as { port: number }).port;
    try {
      assert.equal((await holeDaten(`http://127.0.0.1:${port}/ok`)).toString(), '{"ok":true}');
      await assert.rejects(holeDaten(`http://127.0.0.1:${port}/gross`, KLEIN_MAX), /10 MB|zu groß/i);
      assert.equal((await holeDaten(`http://127.0.0.1:${port}/gross`)).length, 12 * 1024 * 1024, 'Archive dürfen größer sein');
      await assert.rejects(holeDaten(`http://127.0.0.1:${port}/katalog.json`), /nur auf https:\/\//);
      // Auf https:// folgt es (hier nicht erreichbar) – entscheidend ist, dass es nicht auf http:// geht.
      await assert.rejects(holeDaten(`http://127.0.0.1:${port}/schleife`), (e) => !/nur auf https/.test((e as Error).message));
    } finally { server.close(); }
  });
});
