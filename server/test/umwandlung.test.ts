/** Paket-Update: Text in Verweis umwandeln (#534) – Paketformat, Vorschau, Umwandeln, Rückgängig. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { after, describe, it } from 'node:test';
import type { Katalog } from '../../shared/src/pakete';
import { altesFeldAusblenden, namensSchluessel, namenVon, neueMappeWerte, registerUmstellen, spaltenUmstellen, teileNamen, vorlageUmstellen, vorschlag, wieEinName } from '../../shared/src/umwandlung';
import { titelAus, type Feld } from '../../shared/src/model';
import { speicherDateien } from '../src/dateispeicher';
import { Dienst } from '../src/dienst';
import { speicherEinstellungen } from '../src/einstellungen';
import { Fachfehler } from '../src/fehler';
import { liesPaket, liesZip, Paketverwaltung } from '../src/pakete';
import type { Repo } from '../src/repo';
import { speicherRepo } from '../src/repo-speicher';
import { Umwandlung } from '../src/umwandlung';
import { zipPuffer } from '../src/zip';

const ICH = { id: '00000000-0000-4000-8000-0000000000aa', email: 'admin@example.org' };
const ADMIN = { id: ICH.id, rolle: 'admin' };
const KATALOG = 'https://katalog.test/katalog.json';

const offen: Array<{ end(): Promise<void> }> = [];
async function repo(pg: boolean): Promise<Repo> {
  if (!pg) return speicherRepo();
  const { ausUrl, alsUrl, legeDatenbankAn } = await import('../src/anbindung');
  const { verbinde, migriere } = await import('../src/db');
  const { pgRepo } = await import('../src/repo-pg');
  const a = { ...ausUrl(process.env.TEST_DATABASE_URL)!, datenbank: `dms_g14_umw_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}` };
  await legeDatenbankAn(a);
  const sql = verbinde(alsUrl(a));
  offen.push(sql);
  await migriere(sql, new URL('../migrations', import.meta.url).pathname, () => {});
  await sql`INSERT INTO haushalte (id, name) VALUES ('00000000-0000-4000-8000-000000000001', 'Test') ON CONFLICT DO NOTHING`.catch(() => {});
  await sql`INSERT INTO benutzer (id, haushalt_id, email, name, rolle) VALUES (${ICH.id}, '00000000-0000-4000-8000-000000000001', ${ICH.email}, 'Admin', 'admin')`;
  return pgRepo(sql, '00000000-0000-4000-8000-000000000001') as never;
}

const archiv = (d: Record<string, string>) => zipPuffer(Object.entries(d).map(([name, inhalt]) => ({ name, daten: Buffer.from(inhalt) })));
const manifest = (id: string, version: string, abh = '') => `schema: 1\nid: ${id}\nname: ${id}\nversion: ${version}\nbeschreibung: Test.\nautor: { name: Test, github: test }\nlizenz: MIT\ndms: ">=0.60.0"\n${abh}inhalt:\n  mappentypen: inhalt/mappentypen.yaml\n`;

/** Person wie im Paket Basis: Vorname, Nachname, Titel aus beiden. */
const personen = {
  'manifest.yaml': manifest('personen', '1.0.0'),
  'inhalt/mappentypen.yaml': [
    '- schluessel: person', '  name: Person', '  beschreibung: Ein Mensch', '  titelVorlage: "{vorname} {nachname}"', '  felder:',
    '    - { key: vorname, label: Vorname, typ: text }', '    - { key: nachname, label: Nachname, typ: text, pflicht: true }',
    '  register:', '    - { key: daten, name: Daten, art: felder, felder: [vorname, nachname] }', '    - { key: verknuepfungen, name: Verknüpfungen, art: verknuepfungen }', '',
  ].join('\n'),
};
/** 1.0.0: Halter und Inhaber als Text (Halter Pflicht, im Titel und in der Trefferliste). */
const autos10 = {
  'manifest.yaml': manifest('autos', '1.0.0', 'abhaengigkeiten:\n  personen: ">=1.0.0"\n'),
  'inhalt/mappentypen.yaml': [
    '- schluessel: auto', '  name: Auto', '  beschreibung: Ein Auto', '  titelVorlage: "{bez} – {halter}"', '  felder:',
    '    - { key: bez, label: Bezeichnung, typ: text, pflicht: true }', '    - { key: halter, label: Halter, typ: text, pflicht: true }', '    - { key: ab, label: Seit, typ: datum }',
    '  register:', '    - { key: allgemein, name: Allgemein, art: felder, felder: [bez, halter, ab] }',
    '  trefferliste: [bez, halter]',
    '- schluessel: konto', '  name: Konto', '  beschreibung: Ein Konto', '  titelVorlage: "{art} – {inhaber}"', '  felder:',
    '    - { key: art, label: Art, typ: text, pflicht: true }', '    - { key: inhaber, label: Inhaber, typ: text }',
    '  register:', '    - { key: allgemein, name: Allgemein, art: felder, felder: [art, inhaber] }', '',
  ].join('\n'),
};
/** 1.1.0: Halter und Inhaber werden Verweise auf Person (aus_text); die Textfelder stehen nicht mehr im Paket. */
const autos11 = {
  'manifest.yaml': manifest('autos', '1.1.0', 'abhaengigkeiten:\n  personen: ">=1.0.0"\n'),
  'inhalt/mappentypen.yaml': [
    '- schluessel: auto', '  name: Auto', '  beschreibung: Ein Auto', '  titelVorlage: "{bez} – {halter_verweis}"', '  felder:',
    '    - { key: bez, label: Bezeichnung, typ: text, pflicht: true }',
    '    - { key: halter_verweis, label: Halter, typ: referenz, ziel: "personen:person", verweisart: bezug, aus_text: halter }', '    - { key: ab, label: Seit, typ: datum }',
    '  register:', '    - { key: allgemein, name: Allgemein, art: felder, felder: [bez, halter_verweis, ab] }',
    '  trefferliste: [bez, halter_verweis]',
    '- schluessel: konto', '  name: Konto', '  beschreibung: Ein Konto', '  titelVorlage: "{art} – {inhaber_verweis}"', '  felder:',
    '    - { key: art, label: Art, typ: text, pflicht: true }',
    '    - { key: inhaber_verweis, label: Inhaber, typ: referenz, ziel: "personen:person", mehrfach: true, verweisart: bezug, aus_text: inhaber }',
    '  register:', '    - { key: allgemein, name: Allgemein, art: felder, felder: [art, inhaber_verweis] }', '',
  ].join('\n'),
};

function katalog(eintraege: Array<Record<string, string>>) {
  const daten = new Map<string, Buffer>();
  const pakete = new Map<string, Katalog['pakete'][number]>();
  for (const e of eintraege) {
    const id = /^id: (\S+)$/m.exec(e['manifest.yaml'])![1], version = /^version: (\S+)$/m.exec(e['manifest.yaml'])![1];
    const b = archiv(e);
    daten.set(`https://katalog.test/archive/${id}-${version}.zip`, b);
    const abh: Record<string, string> = id === 'autos' ? { personen: '>=1.0.0' } : {};
    const p = pakete.get(id) ?? { id, name: id, beschreibung: '', autor: { name: 'Test', github: 'test' }, lizenz: 'MIT', aktuell: version, versionen: [] };
    p.versionen.unshift({ version, dms: '>=0.60.0', abhaengigkeiten: abh, inhalt: { mappentypen: [], sichten: [], beispiele: 0 }, code: false, archiv: `archive/${id}-${version}.zip`, sha256: createHash('sha256').update(b).digest('hex'), groesse: b.length, veroeffentlicht: '2026-11-01T00:00:00Z', quelle: '', readme: '', changelog: '' });
    p.aktuell = version;
    pakete.set(id, p);
  }
  daten.set(KATALOG, Buffer.from(JSON.stringify({ format: 1, erstellt: '', quelle: '', pakete: [...pakete.values()] })));
  return async (url: string) => { const b = daten.get(url); if (!b) throw new Error(`404 ${url}`); return b; };
}

describe('Text in Verweis: Hilfen (#534)', () => {
  it('teilt Namen bei Mehrfachverweisen und ergänzt den Nachnamen', () => {
    assert.deepEqual(teileNamen('Lena und Tom Muster', true), ['Lena Muster', 'Tom Muster']);
    assert.deepEqual(teileNamen('Lena Muster, Jonas Muster', true), ['Lena Muster', 'Jonas Muster']);
    assert.deepEqual(teileNamen('Lena und Tom Muster', false), ['Lena und Tom Muster'], 'ein einfacher Verweis teilt nicht');
    assert.deepEqual(teileNamen('Muster, Lena', true, (n) => namensSchluessel(n) === 'muster,lena'), ['Muster, Lena'], 'passt der ganze Text, bleibt er ganz');
    assert.deepEqual(teileNamen('  ', true), []);
  });
  it('schlägt vor: gleicher Name ohne Groß-/Kleinschreibung und Leerzeichen, sonst neu oder überspringen', () => {
    const k = [{ id: 'a', namen: namenVon({ titel: 'Dr. Lena Muster', werte: { vorname: 'Lena', nachname: 'Muster' } }) }];
    assert.deepEqual(vorschlag('lena  muster', k), { entscheidung: { art: 'person', id: 'a' }, passend: ['a'] });
    assert.deepEqual(vorschlag('Muster Lena', k).entscheidung, { art: 'person', id: 'a' });
    assert.deepEqual(vorschlag('Tom Muster', k).entscheidung, { art: 'neu' });
    assert.deepEqual(vorschlag('Familie', k).entscheidung, { art: 'ueberspringen' });
    assert.deepEqual(vorschlag('Auto MU-ST 123', k).entscheidung, { art: 'ueberspringen' });
    assert.ok(wieEinName('Petra Mieterin') && !wieEinName('gemeinsam') && !wieEinName('Familienauto MU-ST 123'));
  });
  it('neue Person, Titel-Vorlage, Trefferliste und Register', () => {
    const person = { felder: [{ key: 'vorname', label: 'V', typ: 'text' }, { key: 'nachname', label: 'N', typ: 'text' }] as Feld[] };
    assert.deepEqual(neueMappeWerte(person, 'Anna Lena Muster'), { vorname: 'Anna Lena', nachname: 'Muster' });
    assert.deepEqual(neueMappeWerte({ felder: [{ key: 'name', label: 'Name', typ: 'text' }] as Feld[] }, 'Katrin'), { name: 'Katrin' });
    assert.equal(vorlageUmstellen('{art} – {person|gross} – {personal}', 'person', 'person_verweis'), '{art} – {person_verweis|gross} – {personal}');
    assert.equal(vorlageUmstellen('{person} {person_verweis}', 'person', 'person_verweis'), '{person} {person_verweis}');
    assert.deepEqual(spaltenUmstellen(['a', 'person', 'b'], 'person', 'pv'), ['a', 'pv', 'b']);
    assert.deepEqual(spaltenUmstellen(['pv', 'person'], 'person', 'pv'), ['pv']);
    assert.deepEqual(registerUmstellen(['a', 'person', 'b', 'pv'], 'person', 'pv'), ['a', 'pv', 'person', 'b']);
  });
  it('Titel und Ausblenden: der Verweis zählt, sonst der alte Text', () => {
    const typ = { titelVorlage: '{bez} – {h_v}', felder: [{ key: 'bez', label: 'B', typ: 'text' }, { key: 'h', label: 'Halter', typ: 'text' }, { key: 'h_v', label: 'Halter', typ: 'referenz', zielTyp: 'p', ausText: 'h' }] as Feld[] };
    assert.equal(titelAus(typ, { bez: 'Golf', h: 'Familie', h_v: null }), 'Golf – Familie');
    assert.equal(titelAus(typ, { bez: 'Golf', h: null, h_v: 'x' }, () => 'Lena Muster'), 'Golf – Lena Muster');
    assert.equal(altesFeldAusblenden(typ.felder[1], null, typ.felder[2]), true);
    assert.equal(altesFeldAusblenden(typ.felder[1], 'Familie', typ.felder[2]), false);
    assert.equal(altesFeldAusblenden({ ...typ.felder[1], pflicht: true }, '', typ.felder[2]), false, 'Pflichtfelder bleiben sichtbar');
  });
  it('liest aus_text im Paket und meldet Fehler', () => {
    const p = liesPaket(liesZip(archiv(autos11)));
    assert.equal(p.typen[0].felder.find((f) => f.key === 'halter_verweis')!.ausText, 'halter');
    const mit = (zeile: string) => { try { liesPaket(liesZip(archiv({ ...autos11, 'inhalt/mappentypen.yaml': autos11['inhalt/mappentypen.yaml'].replace("    - { key: ab, label: Seit, typ: datum }\n", `    - { key: ab, label: Seit, typ: datum }\n${zeile}\n`) }))); return []; } catch (e) { return (e as Fachfehler & { details: { gruende: string[] } }).details.gruende; } };
    assert.ok(mit('    - { key: x, label: X, typ: text, aus_text: bez }').some((g) => /nur bei Verweisfeldern/.test(g)));
    assert.ok(mit('    - { key: x, label: X, typ: referenz, ziel: "personen:person", aus_text: ab }').some((g) => /ist kein Textfeld/.test(g)));
    assert.ok(mit('    - { key: x, label: X, typ: referenz, ziel: "personen:person", pflicht: true, aus_text: bez }').some((g) => /keine Pflicht/.test(g)));
    assert.ok(mit('    - { key: x, label: X, typ: referenz, ziel: "personen:person", aus_text: x }').some((g) => /anderen Felds/.test(g)));
  });
});

function faelle(pg: boolean) {
  describe(`Text in Verweis umwandeln (#534)${pg ? ' – PostgreSQL' : ''}`, { skip: pg && !process.env.TEST_DATABASE_URL && 'ohne TEST_DATABASE_URL' }, () => {
    it('Update ergänzt nur; Vorschau, Umwandeln mit neuer Person, Fristsperre, Rückgängig', async () => {
      const d = new Dienst(await repo(pg), speicherDateien(), { einstellungen: speicherEinstellungen() });
      const p = new Paketverwaltung(d, { version: () => '0.120.0', abruf: katalog([personen, autos10, autos11]), katalogUrl: KATALOG });
      const u = new Umwandlung(d);
      await p.installiere({ id: 'autos', version: '1.0.0', mitAbhaengigkeiten: true }, ICH);
      const pakete = await d.listePakete();
      const personTyp = pakete.find((x) => x.id === 'personen')!.typen.person;
      const autoTyp = pakete.find((x) => x.id === 'autos')!.typen.auto;
      const kontoTyp = pakete.find((x) => x.id === 'autos')!.typen.konto;
      const lena = await d.legeMappeAn({ typId: personTyp, werte: { vorname: 'Lena', nachname: 'Muster' } }, ICH.id);
      const a1 = await d.legeMappeAn({ typId: autoTyp, werte: { bez: 'Golf', halter: 'lena muster', ab: '2000-01-01' } }, ICH.id);
      const a2 = await d.legeMappeAn({ typId: autoTyp, werte: { bez: 'Polo', halter: 'Tom Muster', ab: '2000-01-01' } }, ICH.id);
      const a3 = await d.legeMappeAn({ typId: autoTyp, werte: { bez: 'Bus', halter: 'Familie', ab: '2000-01-01' } }, ICH.id);
      const a4 = await d.legeMappeAn({ typId: autoTyp, werte: { bez: 'Rad', halter: 'Jonas Muster', ab: '2026-01-01' } }, ICH.id);
      const k1 = await d.legeMappeAn({ typId: kontoTyp, werte: { art: 'Giro', inhaber: 'Lena und Tom Muster' } }, ICH.id);
      // Archivmodus (#212): Mappen in der Aufbewahrungsfrist bleiben, wie sie sind.
      const at = (await d.listeTypen()).find((t) => t.id === autoTyp)!;
      await d.aendereTyp(autoTyp, { ...at, archiv: { jahre: 1, stichtag: 'ab' } });

      // Update: neues Verweisfeld dazu, Text bleibt, nichts umgeschrieben.
      const uv = await p.vorschau({ id: 'autos' });
      assert.deepEqual(uv.typen.find((t) => t.schluessel === 'auto')!.umwandeln, [{ feld: 'Halter', aus: 'Halter', anzahl: 4 }]);
      assert.deepEqual(uv.typen.find((t) => t.schluessel === 'konto')!.umwandeln, [{ feld: 'Inhaber', aus: 'Inhaber', anzahl: 1 }]);
      await p.aktualisiere('autos', {}, ICH);
      // Zugriff je Anfrage, wie in den Routen: mit den Mappentypen nach dem Update.
      const z = await d.zugriff(ADMIN);
      let auto = (await d.listeTypen()).find((t) => t.id === autoTyp)!;
      assert.equal(auto.felder.find((f) => f.key === 'halter_verweis')!.ausText, 'halter');
      assert.equal(auto.felder.find((f) => f.key === 'halter')!.pflicht, true, 'das Update ändert das alte Feld nicht');
      assert.equal(auto.titelVorlage, '{bez} – {halter}');
      const m1 = (await d.listeMappen(autoTyp)).find((m) => m.id === a1.id)!;
      assert.equal(m1.werte.halter, 'lena muster');
      assert.equal(m1.titel, 'Golf – lena muster');

      const liste = await u.liste('autos');
      assert.deepEqual(liste.felder.map((f) => [f.typName, f.feldLabel, f.anzahl]), [['Auto', 'Halter', 4], ['Konto', 'Inhaber', 1]]);

      // Vorschau: je Name ein Vorschlag; die Mappe in der Frist ist ausgelassen.
      const v = await u.vorschau('autos', { typId: autoTyp, feldKey: 'halter_verweis' }, z);
      assert.deepEqual(v.zeilen.map((x) => [x.name, x.vorschlag.art, x.mappen]), [['Familie', 'ueberspringen', 1], ['lena muster', 'person', 1], ['Tom Muster', 'neu', 1]]);
      assert.deepEqual(v.zeilen[1].vorschlag, { art: 'person', id: lena.id });
      assert.deepEqual(v.ausgelassen.map((x) => [x.mappeId, x.grund]), [[a4.id, 'Aufbewahrungsfrist bis 31.12.2027 (Archivmodus) – wird nicht geändert.']]);
      assert.equal(v.pflichtAus, true);
      assert.equal(v.vorlage, true);
      assert.equal(v.spalten, true);
      await assert.rejects(u.vorschau('autos', { typId: autoTyp, feldKey: 'bez' }, z), /nicht aus einem Textfeld/);

      // Umwandeln wie vorgeschlagen.
      const r = await u.umwandeln('autos', { typId: autoTyp, feldKey: 'halter_verweis' }, ICH, z);
      assert.equal(r.umgewandelt, 2);
      assert.equal(r.neuePersonen, 1);
      assert.deepEqual(r.ausgelassen.map((x) => x.mappeId).sort(), [a3.id, a4.id].sort());
      const tom = (await d.listeMappen(personTyp)).find((m) => m.werte.nachname === 'Muster' && m.werte.vorname === 'Tom')!;
      assert.ok(tom, 'neue Person Tom Muster');
      const nach = new Map((await d.listeMappen(autoTyp)).map((m) => [m.id, m] as const));
      assert.equal(nach.get(a1.id)!.werte.halter_verweis, lena.id);
      assert.equal(nach.get(a1.id)!.werte.halter, null);
      assert.equal(nach.get(a1.id)!.titel, 'Golf – Lena Muster');
      assert.equal(nach.get(a2.id)!.werte.halter_verweis, tom.id);
      assert.equal(nach.get(a3.id)!.werte.halter, 'Familie');
      assert.equal(nach.get(a3.id)!.titel, 'Bus – Familie', 'nicht umgewandelt: der Titel zeigt weiter den Text');
      assert.equal(nach.get(a4.id)!.werte.halter, 'Jonas Muster');
      auto = (await d.listeTypen()).find((t) => t.id === autoTyp)!;
      assert.equal(auto.felder.find((f) => f.key === 'halter')!.pflicht, false);
      assert.equal(auto.titelVorlage, '{bez} – {halter_verweis}');
      assert.deepEqual(auto.trefferliste, ['bez', 'halter_verweis']);
      assert.deepEqual(auto.register.find((r) => r.key === 'allgemein')!.felder, ['bez', 'halter_verweis', 'halter', 'ab']);
      assert.deepEqual(auto.felder.map((f) => f.key), ['bez', 'halter_verweis', 'halter', 'ab'], 'im Formular steht der Verweis vor dem alten Text');
      const h = (await d.historie(a1.id)).find((x) => x.daten.umwandlung === r.vorgang.id)!;
      assert.equal(h.art, 'geaendert');
      assert.equal(h.daten.text, 'Paket-Update: Text in Verweis umgewandelt');
      assert.deepEqual(h.daten.aenderungen!.map((a) => [a.label, a.alt, a.neu]), [['Halter', '', 'Lena Muster'], ['Halter (Text)', 'lena muster', '']]);

      // Mehrfachverweis: zwei Namen, beide gibt es jetzt.
      const vk = await u.vorschau('autos', { typId: kontoTyp, feldKey: 'inhaber_verweis' }, z);
      assert.deepEqual(vk.zeilen.map((x) => [x.name, x.vorschlag]), [['Lena Muster', { art: 'person', id: lena.id }], ['Tom Muster', { art: 'person', id: tom.id }]]);
      const rk = await u.umwandeln('autos', { typId: kontoTyp, feldKey: 'inhaber_verweis' }, ICH, z);
      assert.equal(rk.umgewandelt, 1);
      assert.deepEqual((await d.listeMappen(kontoTyp)).find((m) => m.id === k1.id)!.werte.inhaber_verweis, [lena.id, tom.id]);
      await assert.rejects(u.umwandeln('autos', { typId: kontoTyp, feldKey: 'inhaber_verweis' }, ICH, z), /nichts umzuwandeln/);

      // Rückgängig (Autos): Text zurück, Verweis leer. Tom bleibt – das Konto verweist auf ihn.
      const zr = await u.rueckgaengig(r.vorgang.id, ICH, z);
      assert.equal(zr.zurueck, 2);
      assert.equal(zr.personenBehalten, 1);
      const zurueck = new Map((await d.listeMappen(autoTyp)).map((m) => [m.id, m] as const));
      assert.equal(zurueck.get(a1.id)!.werte.halter, 'lena muster');
      assert.equal(zurueck.get(a1.id)!.werte.halter_verweis, null);
      assert.equal(zurueck.get(a2.id)!.werte.halter, 'Tom Muster');
      auto = (await d.listeTypen()).find((t) => t.id === autoTyp)!;
      assert.equal(auto.titelVorlage, '{bez} – {halter}');
      assert.deepEqual(auto.trefferliste, ['bez', 'halter']);
      assert.deepEqual(auto.register.find((r) => r.key === 'allgemein')!.felder, ['bez', 'halter', 'ab', 'halter_verweis']);
      assert.deepEqual(auto.felder.map((f) => f.key), ['bez', 'halter', 'ab', 'halter_verweis']);
      assert.equal(auto.felder.find((f) => f.key === 'halter')!.pflicht, true, 'jede Mappe hat wieder einen Text');
      assert.ok((await d.historie(a1.id)).some((x) => x.daten.umwandlung === r.vorgang.id && x.daten.rueckgaengig === true));
      await assert.rejects(u.rueckgaengig(r.vorgang.id, ICH, z), /schon rückgängig/);

      // Rückgängig (Konto) nach einer eigenen Änderung: bleibt, mit Grund.
      await d.aendereMappe(k1.id, { werte: { inhaber_verweis: [lena.id] } }, ICH.id, z);
      const zk = await u.rueckgaengig(rk.vorgang.id, ICH, z);
      assert.equal(zk.zurueck, 0);
      assert.deepEqual(zk.ausgelassen.map((x) => x.grund), ['Seit der Umwandlung geändert – bitte von Hand prüfen.']);
      const vg = (await u.liste('autos')).vorgaenge;
      assert.equal(vg.length, 2);
      assert.ok(vg.every((x) => x.rueckgaengig));
    });

    it('Neue Person ohne Pflichtangabe: nichts wird geändert', async () => {
      const d = new Dienst(await repo(pg), speicherDateien(), { einstellungen: speicherEinstellungen() });
      const p = new Paketverwaltung(d, { version: () => '0.120.0', abruf: katalog([personen, autos10, autos11]), katalogUrl: KATALOG });
      const u = new Umwandlung(d);
      await p.installiere({ id: 'autos', version: '1.0.0', mitAbhaengigkeiten: true }, ICH);
      const pk = (await d.listePakete()).find((x) => x.id === 'personen')!.typen.person;
      const autoTyp = (await d.listePakete()).find((x) => x.id === 'autos')!.typen.auto;
      const a = await d.legeMappeAn({ typId: autoTyp, werte: { bez: 'Golf', halter: 'Tom Muster' } }, ICH.id);
      await p.aktualisiere('autos', {}, ICH);
      // Die Person bekommt ein weiteres Pflichtfeld: Anlegen scheitert, die Mappe bleibt unverändert.
      const pt = (await d.listeTypen()).find((t) => t.id === pk)!;
      await d.aendereTyp(pk, { ...pt, felder: [...pt.felder, { key: 'pflicht', label: 'Pflicht', typ: 'text', pflicht: true }] });
      const z = await d.zugriff(ADMIN);
      await assert.rejects(u.umwandeln('autos', { typId: autoTyp, feldKey: 'halter_verweis', entscheidungen: { [namensSchluessel('Tom Muster')]: { art: 'neu' } } }, ICH, z), /ließ sich nicht anlegen/);
      assert.equal((await d.listeMappen(autoTyp)).find((m) => m.id === a.id)!.werte.halter, 'Tom Muster');
      assert.equal((await d.listeMappen(pk)).length, 0);
      assert.equal((await d.listeTypen()).find((t) => t.id === autoTyp)!.felder.find((f) => f.key === 'halter')!.pflicht, true);
      // Ungültige Wahl wird abgelehnt.
      await assert.rejects(u.umwandeln('autos', { typId: autoTyp, feldKey: 'halter_verweis', entscheidungen: { [namensSchluessel('Tom Muster')]: { art: 'person', id: 'x' } } }, ICH, z), /keine gültige Auswahl/);
    });
  });
}

faelle(false);
faelle(true);
after(async () => { for (const s of offen) await s.end(); });
