/**
 * Paketart „Sprache“ (#731): Sprachpakete prüfen, installieren (hochgeladen, Katalog, Sammeldatei), laden, Rückfall
 * Sprache → Englisch → Deutsch, Gebietsschema, Beschriftungen der Standardpakete, Entfernen mit Hinweis, Werkbank-Stand.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { setzeErlaubteSprachen } from '../../shared/src/beschriftung';
import { DEUTSCH } from '../../shared/src/deutsch';
import { formatiere, type Feld } from '../../shared/src/model';
import { liesKatalog, PAKET_MAX } from '../../shared/src/pakete';
import { gebietsschema, inSprache, registrierteSprachen, setzeSprache, sprachangaben } from '../../shared/src/sprache';
import { abdeckung, liesSprachangabe, pruefeSprachtexte, SPRACHTEXTE_MAX } from '../../shared/src/sprachpaket';
import { istMaschinell } from '../../shared/src/sprachwahl';
import { speicherDateien } from '../src/dateispeicher';
import { Dienst } from '../src/dienst';
import { speicherEinstellungen } from '../src/einstellungen';
import { Fachfehler } from '../src/fehler';
import { ARCHIV_MAX, liesPaket, Paketverwaltung, type SprachpaketHaken } from '../src/pakete';
import type { Repo } from '../src/repo';
import { speicherRepo } from '../src/repo-speicher';
import { t } from '../src/sprache';
import { Sprachpakete } from '../src/sprachpakete';
import { SprachDienst } from '../src/sprachwahl';
import { zipPuffer } from '../src/zip';
import { eigeneDatenbank } from './hilfe-db';

const ICH = { id: '00000000-0000-4000-8000-0000000000aa', email: 'admin@example.org' };
const BASIS = fileURLToPath(new URL('./pakete/basis', import.meta.url));
const KATALOG = 'https://katalog.test/katalog.json';

after(() => { setzeSprache('de'); setzeErlaubteSprachen(['de', 'en']); });

function ordner(pfad: string, vor = ''): Record<string, string> {
  const erg: Record<string, string> = {};
  for (const n of readdirSync(pfad)) {
    const p = join(pfad, n);
    if (statSync(p).isDirectory()) Object.assign(erg, ordner(p, `${vor}${n}/`));
    else erg[`${vor}${n}`] = readFileSync(p, 'utf8');
  }
  return erg;
}
const archiv = (d: Record<string, string>) => zipPuffer(Object.entries(d).map(([name, inhalt]) => ({ name, daten: Buffer.from(inhalt) })));
const dateien = (d: Record<string, string>) => new Map(Object.entries(d).map(([n, x]) => [n, Buffer.from(x)]));
const gruende = (re: RegExp) => (e: unknown) => e instanceof Fachfehler && ((e.details as { gruende?: string[] })?.gruende ?? [e.message]).some((g) => re.test(g));
const basis = ordner(BASIS);

/** Ein französisches Sprachpaket für die Tests (erfundene, kurze Auswahl). */
const manifest = (x: Partial<Record<string, string>> = {}) => [
  'schema: 1', `id: ${x.id ?? 'sprache_fr'}`, `name: ${x.name ?? 'Français'}`, `version: ${x.version ?? '1.0.0'}`,
  'beschreibung: Ablago auf Französisch.', 'autor: { name: Test, github: test }', 'lizenz: CC0-1.0', 'dms: ">=0.203.0"',
  'sprache:', `  kennung: ${x.kennung ?? 'fr'}`, '  gebietsschema: fr-FR', `  ablago: ${x.ablago ?? '0.203.0'}`, `  maschinell: ${x.maschinell ?? 'true'}`,
  ...(x.zusatz ? [x.zusatz] : []), '',
].join('\n');
const fr = (texte: Record<string, Record<string, string>> = {}, mehr: Record<string, string> = {}, m: Partial<Record<string, string>> = {}) => ({
  'manifest.yaml': manifest(m),
  'README.md': '# Français\n', 'LICENSE': 'CC0', 'CHANGELOG.md': '# 1.0.0\n',
  'texte/meldungen.json': JSON.stringify({ 'sprachen.unbekannt': 'Cette langue n’existe pas dans Ablago.', ...texte.meldungen }),
  'texte/mail.json': JSON.stringify({ ...texte.mail }),
  'beschriftungen/basis.yaml': [
    'mappentypen:', '  organisation:', '    name: Organisme', '    beschreibung: Entreprise, administration ou autre.',
    '    felder:', '      name: { label: Nom }', '      art: { label: Type, optionen: { Bank: Banque, Versicherung: Assurance } }',
    '    register:', '      stammdaten: { name: Données de base }',
    'sichten:', '  organisationen: { name: Organismes }', '',
  ].join('\n'),
  ...mehr,
});

describe('Sprachpaket prüfen (#731)', () => {
  it('liest Manifest, Texte und Beschriftungen', () => {
    const p = liesPaket(dateien(fr()));
    assert.ok(p.sprache);
    assert.deepEqual({ ...p.sprache.angabe }, { kennung: 'fr', gebietsschema: 'fr-FR', ablago: '0.203.0', maschinell: true });
    assert.equal(p.sprache.texte.meldungen['sprachen.unbekannt'], 'Cette langue n’existe pas dans Ablago.');
    assert.equal(p.sprache.beschriftungen.basis.mappentypen?.organisation.felder?.art.optionen?.Bank, 'Banque');
    assert.equal(p.typen.length, 0);
    assert.equal(p.code, null);
  });

  it('„geprüft von“ und ein anderes Gebietsschema', () => {
    const p = liesPaket(dateien(fr({}, {}, { maschinell: 'false', zusatz: '  geprueft_von: "@lena-beispiel"' })));
    assert.equal(p.sprache!.angabe.geprueftVon, '@lena-beispiel');
    assert.equal(p.sprache!.angabe.maschinell, false);
  });

  it('nur Texte: kein Code, keine Inhalte, keine Abhängigkeiten, keine fremden Dateien', () => {
    const mit = (zusatz: string, mehr: Record<string, string> = {}) => () => liesPaket(dateien(fr({}, mehr, { zusatz })));
    assert.throws(mit('code: { sprache: c }'), gruende(/code gibt es darin nicht/));
    assert.throws(() => liesPaket(dateien({ ...fr(), 'manifest.yaml': `${manifest()}inhalt:\n  mappentypen: inhalt/mappentypen.yaml\n`, 'inhalt/mappentypen.yaml': '[]' })), gruende(/inhalt bleibt leer/));
    assert.throws(() => liesPaket(dateien({ ...fr(), 'manifest.yaml': `${manifest()}abhaengigkeiten:\n  basis: ">=1.0.0"\n` })), gruende(/hängt von keinem anderen Paket ab/));
    assert.throws(() => liesPaket(dateien(fr({}, { 'code/modul.wasm': 'x' }))), gruende(/code\/modul\.wasm: gehört nicht in ein Sprachpaket/));
    assert.throws(() => liesPaket(dateien(fr({}, { 'texte/bild.png': 'x' }))), gruende(/texte\/bild\.png: gehört nicht/));
    assert.throws(() => liesPaket(dateien(fr({}, { 'skript.js': 'alert(1)' }))), gruende(/skript\.js: gehört nicht/));
  });

  it('kein HTML, keine Steuerzeichen, kein Nicht-Text, nicht zu lang', () => {
    assert.throws(() => liesPaket(dateien(fr({ meldungen: { 'sprachen.unbekannt': '<img src=x onerror=alert(1)>' } }))), gruende(/spitze Klammern/));
    assert.throws(() => liesPaket(dateien(fr({ meldungen: { 'sprachen.unbekannt': 'a\u0007b' } }))), gruende(/Steuerzeichen/));
    assert.throws(() => liesPaket(dateien(fr({}, { 'texte/meldungen.json': JSON.stringify({ 'sprachen.unbekannt': 42 }) }))), gruende(/ist kein Text/));
    assert.throws(() => liesPaket(dateien(fr({ meldungen: { 'sprachen.unbekannt': 'x'.repeat(4001) } }))), gruende(/länger als 4000/));
    assert.throws(() => liesPaket(dateien(fr({}, { 'texte/meldungen.json': '{ kaputt' }))), gruende(/kein gültiges JSON/));
    // Wo das Deutsche spitze Klammern hat (Aufruf der Konsole), dürfen sie stehen.
    const ok = liesPaket(dateien(fr({ meldungen: { 'dms.aufruf-dms-sicherung-pruefen': 'Usage : dms sicherung pruefen <nom>' } })));
    assert.equal(ok.sprache!.texte.meldungen['dms.aufruf-dms-sicherung-pruefen'], 'Usage : dms sicherung pruefen <nom>');
    // Auch Beschriftungen ohne HTML.
    assert.throws(() => liesPaket(dateien(fr({}, { 'beschriftungen/basis.yaml': 'mappentypen:\n  organisation:\n    name: "<b>Fett</b>"\n' }))), gruende(/ohne spitze Klammern/));
  });

  it('Platzhalter wie im Deutschen; Unbekanntes wird übergangen, nicht abgelehnt', () => {
    const p = liesPaket(dateien(fr({ meldungen: {
      'gibt.es.nicht': 'Inconnu',
      'sprachen.standard-erlaubt': 'Texte avec {fremd}',
      'pakete.version-ist-schon-installiert': 'La version {version} est déjà installée.',
    } }, { 'texte/unbekannt.json': JSON.stringify({ a: 'b' }) })));
    assert.ok(p.sprache!.uebergangen.includes('meldungen.gibt.es.nicht'));
    assert.ok(p.sprache!.uebergangen.includes('meldungen.sprachen.standard-erlaubt'), 'Platzhalter, die das Deutsche nicht hat');
    assert.ok(p.sprache!.uebergangen.includes('unbekannt.a'));
    assert.equal(p.sprache!.texte.meldungen['pakete.version-ist-schon-installiert'], 'La version {version} est déjà installée.');
  });

  it('Mehrzahlformen der Sprache (z. B. „few“ im Polnischen) gehören zum deutschen Grundschlüssel', () => {
    const r = pruefeSprachtexte(DEUTSCH, { meldungen: { 'sprachpakete.uebergangen_few': '{anzahl} teksty', 'sprachpakete.uebergangen_one': 'Jeden tekst' } });
    assert.deepEqual(r.fehler, []);
    assert.deepEqual(r.uebergangen, []);
    assert.equal(Object.keys(r.texte.meldungen).length, 2);
  });

  it('Angaben im Manifest: eingebaute Sprache, Gebietsschema, Version, maschinell', () => {
    assert.match(liesSprachangabe({ kennung: 'en', ablago: '0.203.0', maschinell: true }).fehler.join(), /eingebaut/);
    assert.match(liesSprachangabe({ kennung: 'de', ablago: '0.203.0', maschinell: true }).fehler.join(), /eingebaut/);
    assert.match(liesSprachangabe({ kennung: 'Franz', ablago: '0.203.0', maschinell: true }).fehler.join(), /keine Sprachkennung/);
    assert.match(liesSprachangabe({ kennung: 'fr', gebietsschema: '??', ablago: '0.203.0', maschinell: true }).fehler.join(), /kein Gebietsschema/);
    assert.match(liesSprachangabe({ kennung: 'fr', maschinell: true }).fehler.join(), /sprache\.ablago/);
    assert.match(liesSprachangabe({ kennung: 'fr', ablago: '0.203.0' }).fehler.join(), /sprache\.maschinell/);
    assert.match(liesSprachangabe({ kennung: 'fr', ablago: '0.203.0', maschinell: true, code: 'x' }).fehler.join(), /sprache\.code gibt es nicht/);
    assert.equal(liesSprachangabe({ kennung: 'pt-BR', ablago: '0.203.0', maschinell: false }).angabe?.gebietsschema, 'pt-BR');
  });

  it('Größengrenze: alle Texte zusammen höchstens 4 MB, das Archiv wie jedes Paket (#644)', () => {
    const viele = Object.fromEntries(Object.keys(DEUTSCH.werkbank).map((k) => [k, 'é'.repeat(1000)]));
    assert.ok(JSON.stringify(viele).length > 0);
    const r = pruefeSprachtexte(DEUTSCH, { werkbank: viele });
    assert.match(r.fehler.join(), /größer als 4 MB/);
    assert.equal(SPRACHTEXTE_MAX, 4 * 1024 * 1024);
    assert.equal(ARCHIV_MAX, PAKET_MAX);
  });

  it('Abdeckung: Grundschlüssel des Deutschen, Mehrzahl zählt einmal, abgerundet', () => {
    const de = { a: { x: 'X', y_one: 'Y', y_other: 'Ys', z: 'Z' } };
    assert.deepEqual(abdeckung(de, { a: { x: 'x', y_other: 'ys' } }), { vorhanden: 2, gesamt: 3, prozent: 66 });
    assert.equal(abdeckung(de, { a: { x: 'x', y_one: 'y', z: 'z' } }).prozent, 100);
    assert.equal(abdeckung(de, {}).prozent, 0);
  });

  it('Katalog: Angaben eines Sprachpakets je Version', () => {
    const k = liesKatalog({ format: 1, erstellt: '', quelle: '', pakete: [{ id: 'sprache_fr', name: 'Français', versionen: [{ version: '1.0.0', sha256: 'a'.repeat(64), archiv: 'x.zip', sprache: { kennung: 'fr', maschinell: true, ablago: '0.203.0' } }] }] });
    assert.deepEqual(k.pakete[0].versionen[0].sprache, { kennung: 'fr', maschinell: true, ablago: '0.203.0' });
  });
});

/** Aufbau mit Speicher-Repo, SprachDienst und Sprachpaketen – wie in ablago.ts verdrahtet. */
async function aufbau(o: { repo?: Repo; personen?: (k: string) => number; abruf?: (url: string) => Promise<Buffer> } = {}) {
  const d = new Dienst(o.repo ?? speicherRepo(), speicherDateien(), { einstellungen: speicherEinstellungen() });
  const einst = speicherEinstellungen();
  const sprachen = new SprachDienst(einst);
  const sp = new Sprachpakete({ pakete: () => d.kern.repo.listePakete(), sprachpakete: () => d.kern.repo.sprachpakete(), personen: async (k) => o.personen?.(k) ?? 0 });
  sprachen.pakete = sp;
  await sprachen.lade();
  const haken: SprachpaketHaken = {
    geaendert: async () => { await sp.lade(true); await sprachen.lade(); },
    nutzung: async (k) => ({ personen: o.personen?.(k) ?? 0, standard: (await sprachen.lies()).standard === k }),
    entfernt: (k) => sprachen.ohne(k).then(() => {}),
    abdeckung: (k) => sp.abdeckung(k),
  };
  const p = new Paketverwaltung(d, { version: () => '0.203.0', katalogUrl: KATALOG, sprachen: haken, ...(o.abruf ? { abruf: o.abruf } : {}) });
  return { d, p, sprachen, sp, einst };
}
async function installiereHochgeladen(p: Paketverwaltung, dateien: Record<string, string>) {
  const h = await p.hochladen(archiv(dateien), ICH);
  return { vorschau: h.vorschau, paket: await p.installiere({ upload: h.upload, bestaetigt: true }, ICH) };
}

describe('Sprachpaket installieren und nutzen (#731)', () => {
  it('Hochladen: Vorschau mit Sprache und Abdeckung, danach gibt es Französisch', async () => {
    const { p, sprachen, sp } = await aufbau();
    const h = await p.hochladen(archiv(fr()), ICH);
    assert.equal(h.vorschau.sprache?.kennung, 'fr');
    assert.equal(h.vorschau.sprache?.maschinell, true);
    assert.ok(h.vorschau.sprache!.abdeckung.gesamt > 1000);
    assert.equal(h.vorschau.sprache?.abdeckung.vorhanden, 1);
    assert.deepEqual(h.vorschau.sprache?.pakete, ['basis']);
    assert.deepEqual(h.vorschau.probleme, []);
    const inst = await p.installiere({ upload: h.upload, bestaetigt: true }, ICH);
    assert.equal(inst.sprache?.kennung, 'fr');
    assert.equal(inst.sprache?.texte, 1);
    assert.ok(registrierteSprachen().includes('fr'));
    assert.ok((await sprachen.stand()).verfuegbar.includes('fr'));
    // Texte in der Sprache, sonst Englisch, sonst Deutsch.
    inSprache('fr', () => {
      assert.equal(t('meldungen.sprachen.unbekannt'), 'Cette langue n’existe pas dans Ablago.');
      assert.equal(t('meldungen.sprachen.nicht-eingerichtet'), inSprache('en', () => t('meldungen.sprachen.nicht-eingerichtet')));
      assert.notEqual(t('meldungen.sprachen.nicht-eingerichtet'), inSprache('de', () => t('meldungen.sprachen.nicht-eingerichtet')));
    });
    // Maschinell übersetzt → Hinweis in Mein Konto (sprachangaben, #729).
    assert.equal(istMaschinell('fr'), true);
    assert.equal(sp.texte('fr')?.gebietsschema, 'fr-FR');
    assert.equal((await p.installierte()).find((x) => x.id === 'sprache_fr')?.spracheAbdeckung, 0);
  });

  it('Datum und Zahlen über das Gebietsschema der Sprache', async () => {
    await aufbau();
    // Die Sprache aus dem vorigen Fall ist (prozessweit) noch eingetragen; hier genügt das Gebietsschema.
    const datum: Feld = { key: 'd', label: 'D', typ: 'datum' } as Feld;
    const zahl: Feld = { key: 'z', label: 'Z', typ: 'zahl', nachkomma: 2 } as Feld;
    inSprache('fr', () => {
      assert.equal(gebietsschema(), 'fr-FR');
      assert.equal(formatiere(datum, '2026-03-04'), '04/03/2026');
      assert.match(formatiere(zahl, 1234.5), /^1\s?234,5/u);
    });
    assert.equal(sprachangaben('fr').gebietsschema, 'fr-FR');
  });

  it('Beschriftungen der Standardpakete – ob Basis vorher oder nachher kommt; Eigenes bleibt', async () => {
    for (const reihenfolge of ['basis-zuerst', 'sprache-zuerst'] as const) {
      const { d, p } = await aufbau();
      if (reihenfolge === 'basis-zuerst') await installiereHochgeladen(p, basis);
      await installiereHochgeladen(p, fr());
      if (reihenfolge === 'sprache-zuerst') await installiereHochgeladen(p, basis);
      const typ = (await d.listeTypen()).find((x) => x.schluessel === 'basis_organisation')!;
      assert.equal(typ.beschriftungen?.fr?.name, 'Organisme', reihenfolge);
      assert.equal(typ.felder.find((f) => f.key === 'art')?.beschriftungen?.fr?.optionen?.Bank, 'Banque');
      assert.equal(typ.felder.find((f) => f.key === 'name')?.beschriftungen?.fr?.label, 'Nom');
      assert.equal(typ.register.find((r) => r.key === 'stammdaten')?.beschriftungen?.fr?.name, 'Données de base');
      const sicht = (await d.listeSichten()).find((s) => s.name === 'Organisationen')!;
      assert.equal(sicht.beschriftungen?.fr?.name, 'Organismes');
      // Was der Administrator schon beschriftet hat, bleibt bei einem Update des Sprachpakets.
      await d.aendereTyp(typ.id, { ...typ, beschriftungen: { ...typ.beschriftungen, fr: { name: 'Organisation (eigene)' } } });
      await installiereHochgeladen(p, fr({}, {}, { version: '1.0.1' }));
      assert.equal((await d.listeTypen()).find((x) => x.id === typ.id)?.beschriftungen?.fr?.name, 'Organisation (eigene)');
    }
  });

  it('eine Sprache – ein Sprachpaket; nicht passende Ablago-Version als Hinweis', async () => {
    const { p } = await aufbau();
    await installiereHochgeladen(p, fr());
    const h = await p.hochladen(archiv(fr({}, {}, { id: 'franzoesisch', ablago: '0.200.0' })), ICH);
    assert.ok(h.vorschau.fehlercodes.includes('sprache-schon-da'));
    assert.match(h.vorschau.probleme.join(), /schon das Sprachpaket „Français“/);
    assert.match(h.vorschau.hinweise.join(), /für Ablago 0\.200\.0 gemacht/);
  });

  it('Sammeldatei bzw. Katalog: derselbe Weg wie jedes Paket', async () => {
    const b = archiv(fr());
    const sha = createHash('sha256').update(b).digest('hex');
    const daten = new Map<string, Buffer>([
      ['https://katalog.test/archive/sprache_fr-1.0.0.zip', b],
      [KATALOG, Buffer.from(JSON.stringify({ format: 1, erstellt: '', quelle: '', pakete: [{ id: 'sprache_fr', name: 'Français', beschreibung: '', autor: { name: 'Test', github: 'test' }, lizenz: 'CC0-1.0', aktuell: '1.0.0',
        versionen: [{ version: '1.0.0', dms: '>=0.203.0', abhaengigkeiten: {}, inhalt: { mappentypen: [], sichten: [], beispiele: 0 }, code: false, archiv: 'archive/sprache_fr-1.0.0.zip', sha256: sha, groesse: b.length, veroeffentlicht: '', quelle: '', readme: '', changelog: '', sprache: { kennung: 'fr', maschinell: true } }] }] }))],
    ]);
    const { p, sp } = await aufbau({ abruf: async (url) => { const x = daten.get(url); if (!x) throw new Error(`404 ${url}`); return x; } });
    const v = await p.vorschau({ id: 'sprache_fr' });
    assert.equal(v.sprache?.kennung, 'fr');
    await p.installiere({ id: 'sprache_fr', bestaetigt: true }, ICH);
    assert.ok(sp.kennungen().includes('fr'));
    assert.equal((await p.katalog()).katalog.pakete[0].versionen[0].sprache?.maschinell, true);
  });

  it('Entfernen: wird die Sprache genutzt, nur mit Bestätigung; danach gilt die Sprache der Installation', async () => {
    const { p, d, sprachen, sp } = await aufbau({ personen: (k) => (k === 'fr' ? 2 : 0) });
    await installiereHochgeladen(p, fr());
    await sprachen.speichere({ standard: 'fr', erlaubt: ['de', 'en', 'fr'] });
    await assert.rejects(p.entferne('sprache_fr', ICH), (e: unknown) => {
      assert.ok(e instanceof Fachfehler && e.status === 409);
      const det = e.details as { gruende: string[]; sprache: { kennung: string; personen: number; standard: boolean } };
      assert.deepEqual(det.sprache, { kennung: 'fr', personen: 2, standard: true });
      // Die Installation spricht jetzt Französisch – was dem Paket fehlt, kommt auf Englisch.
      assert.match(det.gruende.join(' '), /2 people have chosen this language/);
      assert.match(det.gruende.join(' '), /Afterwards German applies again/);
      return true;
    });
    await p.entferne('sprache_fr', ICH, false, true);
    assert.equal((await d.kern.repo.listePakete()).length, 0);
    assert.deepEqual(await d.kern.repo.sprachpakete(), []);
    assert.ok(!sp.kennungen().includes('fr'));
    const e = await sprachen.lies();
    assert.equal(e.standard, 'de');
    assert.deepEqual(e.erlaubt, ['de', 'en']);
    // Ohne Nutzung geht es ohne Rückfrage.
    const x = await aufbau();
    await installiereHochgeladen(x.p, fr());
    await x.p.entferne('sprache_fr', ICH);
    assert.deepEqual(await x.d.kern.repo.sprachpakete(), []);
  });

  it('Werkbank → Sprachen: installierte Sprachpakete mit Abdeckung, Version und Nutzung', async () => {
    const { p, sprachen } = await aufbau({ personen: () => 1 });
    await installiereHochgeladen(p, fr({ meldungen: { 'sprachen.nicht-eingerichtet': 'Les langues ne sont pas configurées.' } }));
    const s = await sprachen.stand();
    assert.equal(s.pakete.length, 1);
    const fp = s.pakete[0];
    assert.equal(fp.paket, 'sprache_fr');
    assert.equal(fp.kennung, 'fr');
    assert.equal(fp.ablago, '0.203.0');
    assert.equal(fp.abdeckung.vorhanden, 2);
    assert.equal(fp.personen, 1);
    assert.equal(fp.maschinell, true);
  });

  it('nach einem Neustart: Sprachpakete aus der Datenbank, nicht passende Texte fallen weg', async () => {
    const repo = speicherRepo();
    const a = await aufbau({ repo });
    await installiereHochgeladen(a.p, fr());
    // Ein Text, den es in dieser Version nicht (mehr) gibt, steht noch in der Datenbank.
    const [alt] = await repo.sprachpakete();
    await repo.speichereSprachpaket('sprache_fr', { ...alt, texte: { ...alt.texte, meldungen: { ...alt.texte.meldungen, 'weg.ist.weg': 'Parti' } } });
    const b = await aufbau({ repo });
    assert.ok(b.sp.kennungen().includes('fr'));
    assert.equal(b.sp.texte('fr')?.texte.meldungen['weg.ist.weg'], undefined);
    assert.equal(b.sp.texte('fr')?.texte.meldungen['sprachen.unbekannt'], 'Cette langue n’existe pas dans Ablago.');
  });
});

describe('Sprachpakete in PostgreSQL (#731)', { skip: !process.env.TEST_DATABASE_URL && 'ohne TEST_DATABASE_URL' }, () => {
  const offen: Array<{ end(): Promise<void> }> = [];
  after(async () => { for (const s of offen) await s.end(); });
  it('Texte und Beschriftungen speichern, lesen, ersetzen, löschen (Migration 082)', async () => {
    const { migriere } = await import('../src/db');
    const { pgRepo } = await import('../src/repo-pg');
    // Eigene Datenbank (#900), nach dem letzten Test der Datei gelöscht.
    const sql = (await eigeneDatenbank('sp', { migrieren: false })).sql;
    offen.push(sql);
    await migriere(sql, new URL('../migrations', import.meta.url).pathname, () => {});
    await sql`INSERT INTO haushalte (id, name) VALUES ('00000000-0000-4000-8000-000000000001', 'Test') ON CONFLICT DO NOTHING`;
    const repo = pgRepo(sql, '00000000-0000-4000-8000-000000000001');
    await repo.speichereSprachpaket('sprache_fr', { kennung: 'fr', texte: { meldungen: { a: 'A' } }, beschriftungen: { basis: { sichten: { x: { name: 'X' } } } } });
    await repo.speichereSprachpaket('sprache_fr', { kennung: 'fr', texte: { meldungen: { a: 'B' } }, beschriftungen: {} });
    assert.deepEqual(await repo.sprachpakete(), [{ paketId: 'sprache_fr', kennung: 'fr', texte: { meldungen: { a: 'B' } }, beschriftungen: {} }]);
    // Installieren mit PostgreSQL.
    const { p, d } = await aufbau({ repo: repo as never });
    await installiereHochgeladen(p, fr({}, {}, { id: 'sprache_fr2', kennung: 'it', name: 'Italiano' }));
    assert.equal((await d.kern.repo.sprachpakete()).find((x) => x.paketId === 'sprache_fr2')?.kennung, 'it');
    await repo.loescheSprachpaket('sprache_fr');
    assert.equal((await repo.sprachpakete()).length, 1);
  });
});
