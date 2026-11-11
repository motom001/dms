/**
 * Paket-Update mit Umbau zieht Ansichten nach (#1125): Ansichten aus Paketen mit Prüfwert (unverändert → beim Update
 * ersetzt, geändert → bleibt mit Hinweis, auf Wunsch ersetzt), der Umbau nimmt ihren Stand mit, Hinweise zu Ansichten in
 * der Vorschau (mehr Mappen, Bedingungen auf Felder ohne Ziel), `setzen` mit Zeitraum und Auswahl → Verweis über den
 * Titel – mit Speicher und PostgreSQL. Beispieldaten wie Haushalt und Verträge (dms-registry #163), mit Personas.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { speicherDateien } from '../src/dateispeicher';
import { Dienst } from '../src/dienst';
import { speicherEinstellungen } from '../src/einstellungen';
import { Fachfehler } from '../src/fehler';
import { liesPaket, liesZip, Paketverwaltung } from '../src/pakete';
import { sichtPruefwert, sichtZustand, standNachUmbau, wandle } from '../src/pakete/index';
import type { Repo } from '../src/repo';
import { speicherRepo } from '../src/repo-speicher';
import { zipPuffer } from '../src/zip';
import { eigeneDatenbank } from './hilfe-db';

const ICH = { id: '00000000-0000-4000-8000-0000000000ab', email: 'admin@example.org' };
const HAUSHALT_ID = '00000000-0000-4000-8000-000000000002';
const VERSION = '0.248.0';

const manifest = (id: string, name: string, version: string, extra = '') =>
  `schema: 1\nid: ${id}\nname: ${name}\nversion: ${version}\nbeschreibung: Test.\nautor: { name: Lena Beispiel, github: lena-beispiel }\nlizenz: MIT\ndms: ">=0.230.0"\nherausgeber: org.example\n${extra}`;
const zip = (d: Record<string, string>) => zipPuffer(Object.entries(d).map(([name, inhalt]) => ({ name, daten: Buffer.from(inhalt) })), new Date('2026-01-01T12:00:00Z'));
const lies = (d: Record<string, string>) => liesPaket(liesZip(zip(d)));
const gruende = (re: RegExp) => (e: unknown) => e instanceof Fachfehler && [e.message, ...((e.details as { gruende?: string[] })?.gruende ?? [])].some((g) => re.test(g));

const basis = {
  'manifest.yaml': manifest('basis', 'Basis', '1.0.0', 'inhalt:\n  mappentypen: inhalt/mappentypen.yaml\n'),
  'inhalt/mappentypen.yaml': '- schluessel: organisation\n  name: Organisation\n  titelVorlage: "{name}"\n  felder:\n    - { key: name, label: Name, typ: text }\n  register:\n    - { key: allgemein, name: Allgemein, art: felder, felder: [name] }\n',
};
/** Haushalt 1: Vertrag und Versicherung mit Ansichten – „Versicherungen“ zeigt den Typ Versicherung. */
const haushalt1 = {
  'manifest.yaml': manifest('haushalt', 'Haushalt', '1.0.0', 'abhaengigkeiten:\n  basis: ">=1.0.0"\ninhalt:\n  mappentypen: inhalt/mappentypen.yaml\n  sichten: inhalt/sichten.yaml\n'),
  'inhalt/mappentypen.yaml': [
    '- schluessel: vertrag', '  name: Vertrag', '  titelVorlage: "{art}"', '  felder:',
    '    - { key: vertragspartner, label: Vertragspartner, typ: referenz, ziel: "basis:organisation" }',
    '    - { key: art, label: Art, typ: auswahl, optionen: [Strom, Gas, Fernwärme], beschriftungen: { en: { optionen: { Strom: Electricity } } } }',
    '  register:', '    - { key: allgemein, name: Allgemein, art: felder, felder: [vertragspartner, art] }',
    '- schluessel: versicherung', '  name: Versicherung', '  titelVorlage: "{versicherungsnummer}"', '  felder:',
    '    - { key: versicherer, label: Versicherer, typ: referenz, ziel: "basis:organisation" }',
    '    - { key: versicherungsnummer, label: Versicherungsnummer, typ: text }',
    '    - { key: versicherung_art, label: Versicherungsart, typ: auswahl, optionen: [Haftpflicht, Hausrat] }',
    '  register:', '    - { key: allgemein, name: Allgemein, art: felder, felder: [versicherer, versicherungsnummer, versicherung_art] }', '',
  ].join('\n'),
  'inhalt/sichten.yaml': [
    '- { schluessel: haushalt, name: Haushalt, typen: [vertrag, versicherung] }',
    '- { schluessel: vertraege, name: Verträge, eltern: haushalt, typen: [vertrag] }',
    '- { schluessel: versicherungen, name: Versicherungen, eltern: haushalt, typen: [versicherung] }',
    '- schluessel: haftpflicht', '  name: Haftpflicht', '  eltern: versicherungen', '  typen: [versicherung]',
    '  bedingungen:', '    - { feld: versicherung_art, operator: einerVon, wert: [Haftpflicht] }', '',
  ].join('\n'),
};
/** Haushalt 2 (Major): Typen sind in Verträge aufgegangen, die Ansichten zeigen dorthin – mit Bedingungen. */
const haushalt2 = {
  'manifest.yaml': manifest('haushalt', 'Haushalt', '2.0.0', 'abhaengigkeiten:\n  basis: ">=1.0.0"\n  vertraege: ">=1.0.0"\ninhalt:\n  sichten: inhalt/sichten.yaml\n'),
  'inhalt/sichten.yaml': [
    '- { schluessel: haushalt, name: Haushalt, typen: ["vertraege:vertrag"] }',
    '- { schluessel: vertraege, name: Verträge, eltern: haushalt, typen: ["vertraege:vertrag"] }',
    '- schluessel: versicherungen', '  name: Versicherungen', '  eltern: haushalt', '  typen: ["vertraege:vertrag"]',
    '  bedingungen:', '    - { feld: vertragsnummer, operator: nichtLeer }',
    '- schluessel: haftpflicht', '  name: Haftpflicht', '  eltern: versicherungen', '  typen: ["vertraege:vertrag"]',
    '  bedingungen:', '    - { feld: vertragsnummer, operator: enthaelt, wert: HV }', '',
  ].join('\n'),
};
const UMBAU = [
  'umbau:',
  '  - von: haushalt:vertrag', '    nach: vertrag', '    felder: { vertragspartner: von, art: art }',
  '  - von: haushalt:versicherung', '    nach: vertrag', '    felder: { versicherer: von, versicherungsnummer: vertragsnummer }',
  '    setzen: { art: { vorgabe: versicherung }, kuendigungsfrist: { anzahl: 3, einheit: monate }, mindestlaufzeit: P1Y }', '',
].join('\n');
const vertraege = {
  'manifest.yaml': manifest('vertraege', 'Verträge', '1.0.0', `abhaengigkeiten:\n  basis: ">=1.0.0"\ninhalt:\n  mappentypen: inhalt/mappentypen.yaml\n  vorgaben: inhalt/vorgaben.yaml\n${UMBAU}`),
  'inhalt/mappentypen.yaml': [
    '- schluessel: vertragsart', '  name: Vertragsart', '  titelVorlage: "{name}"', '  felder:', '    - { key: name, label: Name, typ: text }',
    '  register:', '    - { key: allgemein, name: Allgemein, art: felder, felder: [name] }',
    '- schluessel: vertrag', '  name: Vertrag', '  titelVorlage: "{vertragsnummer}"', '  felder:',
    '    - { key: von, label: Anbieter, typ: referenz, ziel: ["basis:organisation"] }',
    '    - { key: art, label: Vertragsart, typ: referenz, ziel: vertragsart }',
    '    - { key: vertragsnummer, label: Vertragsnummer, typ: text }',
    '    - { key: kuendigungsfrist, label: Kündigungsfrist, typ: zeitraum }',
    '    - { key: mindestlaufzeit, label: Mindestlaufzeit, typ: zeitraum }',
    '  register:', '    - { key: vertrag, name: Vertrag, art: felder, felder: [von, art, vertragsnummer, kuendigungsfrist, mindestlaufzeit] }', '',
  ].join('\n'),
  'inhalt/vorgaben.yaml': '- kennung: strom\n  typ: vertragsart\n  werte: { name: Strom }\n- kennung: gas\n  typ: vertragsart\n  werte: { name: Gas }\n- kennung: versicherung\n  typ: vertragsart\n  werte: { name: Versicherung }\n',
};
/** Ein Paket ohne Umbau: Garten 1.0.0 → 1.1.0 ändert seine Ansichten (Ersetzen beim gewöhnlichen Update). */
const garten = (version: string, sichten: string) => ({
  'manifest.yaml': manifest('garten', 'Garten', version, 'inhalt:\n  mappentypen: inhalt/mappentypen.yaml\n  sichten: inhalt/sichten.yaml\n'),
  'inhalt/mappentypen.yaml': '- schluessel: beet\n  name: Beet\n  felder:\n    - { key: name, label: Name, typ: text }\n    - { key: lage, label: Lage, typ: auswahl, optionen: [Sonne, Schatten] }\n  register:\n    - { key: allgemein, name: Allgemein, art: felder, felder: [name, lage] }\n',
  'inhalt/sichten.yaml': sichten,
});
const GARTEN1 = '- { schluessel: beete, name: Beete, typen: [beet] }\n- { schluessel: sonnig, name: Sonnig, eltern: beete, typen: [beet] }\n- { schluessel: schattig, name: Schattig, eltern: beete, typen: [beet] }\n';
const GARTEN2 = '- { schluessel: beete, name: Beete, typen: [beet] }\n'
  + '- schluessel: sonnig\n  name: Sonnig\n  eltern: beete\n  typen: [beet]\n  bedingungen:\n    - { feld: lage, operator: einerVon, wert: [Sonne] }\n'
  + '- schluessel: schattig\n  name: Schattig\n  eltern: beete\n  typen: [beet]\n  bedingungen:\n    - { feld: lage, operator: einerVon, wert: [Schatten] }\n';

describe('Ansichten, Zeitraum und Zuordnung im Paketformat (#1125)', () => {
  it('setzen mit Zeitraum: { anzahl, einheit } oder Text in ein Zeitraum-Feld; sonst Fehler mit Stelle', () => {
    const p = lies(vertraege);
    assert.deepEqual(p.umbau?.[1].setzen, { art: { vorgabe: 'versicherung' }, kuendigungsfrist: { anzahl: 3, einheit: 'monate' }, mindestlaufzeit: { anzahl: 1, einheit: 'jahre' } });
    const mit = (setzen: string) => () => lies({ ...vertraege, 'manifest.yaml': vertraege['manifest.yaml'].replace('mindestlaufzeit: P1Y', setzen) });
    assert.throws(mit('vertragsnummer: { anzahl: 3, einheit: monate }'), gruende(/Ein Zeitraum passt nur in ein Feld der Art Zeitraum – „vertragsnummer“/));
    assert.throws(mit('mindestlaufzeit: irgendwann'), gruende(/„mindestlaufzeit“ ist ein Zeitraum – der Wert unter „setzen“ ist keiner/));
    assert.throws(mit('mindestlaufzeit: { anzahl: 3, einheit: jahrzehnte }'), gruende(/ungültiger Wert|ist ein Zeitraum/));
  });

  it('Auswahl → Verweis über den Titel: genau eine Mappe, auch über die Beschriftung der Option; sonst Notiz', () => {
    const auswahl = { key: 'art', label: 'Art', typ: 'auswahl', optionen: ['Strom', 'Gas'], beschriftungen: { en: { optionen: { Strom: 'Electricity' } } } } as never;
    const verweis = (mehrfach = false) => ({ key: 'art', label: 'Vertragsart', typ: 'referenz', zielTypen: ['va'], mehrfach }) as never;
    const titel = (typen: string[], t: string) => (typen.includes('va') ? ({ strom: ['s1'], electricity: ['s1'], gas: ['g1', 'g2'] } as Record<string, string[]>)[t.toLowerCase()] ?? [] : []);
    assert.deepEqual(wandle(auswahl, verweis(), 'Strom', { titel }), { wert: 's1', genau: true });
    assert.equal(wandle(auswahl, verweis(), 'Gas', { titel }), null, 'zwei Mappen „Gas“: nicht eindeutig → Notiz');
    assert.equal(wandle(auswahl, verweis(), 'Fernwärme', { titel }), null, 'keine Mappe: Feld bleibt leer, Wert in die Notiz');
    assert.equal(wandle(auswahl, verweis(), 'Strom'), null, 'ohne Suche wie vor #1125');
    assert.deepEqual(wandle({ ...(auswahl as object), mehrfach: true } as never, verweis(true), ['Strom', 'Fernwärme'], { titel }), { wert: ['s1'], genau: false }, 'Rest in die Notiz');
  });

  it('Prüfwert: unverändert → aktualisiert, geändert → bleibt, ohne Stand nur „gleich“, wenn sie der Fassung entspricht; Umbau nimmt den Stand mit', () => {
    const s = { name: 'Versicherungen', beschreibung: '', elternId: null, typen: ['a'], bedingungen: [] };
    const st = { stand: sichtPruefwert(s), fassung: 'f1' };
    assert.equal(sichtZustand({ stand: st, fassung: 'f1', jetzt: s }), 'gleich');
    assert.equal(sichtZustand({ stand: st, fassung: 'f2', jetzt: { ...s, typen: ['a'] } }), 'aktualisiert');
    assert.equal(sichtZustand({ stand: st, fassung: 'f2', jetzt: { ...s, name: 'Meine Versicherungen' } }), 'geaendert');
    assert.equal(sichtZustand({ stand: st, fassung: 'f2' }), 'geloescht');
    assert.equal(sichtZustand({ fassung: 'f2', jetzt: s, wieImPaket: { ...s } }), 'gleich');
    assert.equal(sichtZustand({ fassung: 'f2', jetzt: s, wieImPaket: { ...s, typen: ['b'] } }), 'unbekannt');
    const p = { sichten: { versicherungen: 'id1' }, sichtStand: { versicherungen: st } };
    assert.equal(standNachUmbau(p, new Map([['id1', { vorher: st.stand, nachher: 'neu' }]])), true);
    assert.equal(p.sichtStand.versicherungen.stand, 'neu', 'nur der Umbau hat sie geändert: gilt weiter als unverändert');
    assert.equal(standNachUmbau(p, new Map([['id1', { vorher: 'anders', nachher: 'x' }]])), false, 'vom Administrator geändert: bleibt geändert');
  });
});

async function repo(pg: boolean): Promise<Repo> {
  if (!pg) return speicherRepo();
  const { pgRepo } = await import('../src/repo-pg');
  const sql = (await eigeneDatenbank('umbauansichten')).sql;
  await sql`INSERT INTO haushalte (id, name) VALUES (${HAUSHALT_ID}, 'Test') ON CONFLICT DO NOTHING`;
  await sql`INSERT INTO benutzer (id, haushalt_id, email, name, rolle) VALUES (${ICH.id}, ${HAUSHALT_ID}, ${ICH.email}, 'Admin', 'admin') ON CONFLICT DO NOTHING`;
  return pgRepo(sql, HAUSHALT_ID) as never;
}

for (const pg of [false, true]) {
  describe(`Ansichten beim Update und Umbau (#1125)${pg ? ' – PostgreSQL' : ''}`, { skip: pg && !process.env.TEST_DATABASE_URL ? 'TEST_DATABASE_URL nicht gesetzt' : false }, () => {
    async function aufbau() {
      const r = await repo(pg);
      const d = new Dienst(r, speicherDateien(), { einstellungen: speicherEinstellungen() });
      const konto = pg ? ICH.id : '00000000-0000-4000-8000-0000000000de';
      const p = new Paketverwaltung(d, { version: () => VERSION, katalogUrl: 'https://katalog.test/katalog.json', abruf: async () => { throw new Error('ohne Netz'); }, dienstkonto: async () => konto });
      const hoch = async (dateien: Record<string, string>) => p.hochladen(zip(dateien), ICH);
      const installiere = async (dateien: Record<string, string>, mehr: Record<string, unknown> = {}) => p.installiere({ upload: (await hoch(dateien)).upload, bestaetigt: true, ...mehr }, ICH);
      const typ = async (k: string) => (await d.listeTypen()).find((x) => x.schluessel === k);
      const sicht = async (id: string) => (await d.listeSichten()).find((x) => x.id === id)!;
      const paket = async (id: string) => (await p.installierte()).find((x) => x.id === id)!;
      return { d, p, hoch, installiere, typ, sicht, paket };
    }

    it('Umbau: Vorschau mit Ansichten und Werten ohne Ziel; danach Auswahl → Verweis, Zeitraum gesetzt, Stand der Ansichten zieht mit; Haushalt 2 ersetzt nur Unverändertes', async () => {
      const x = await aufbau();
      await x.installiere(basis);
      const h1 = await x.installiere(haushalt1);
      assert.deepEqual(Object.keys(h1.sichtStand ?? {}).sort(), ['haftpflicht', 'haushalt', 'versicherungen', 'vertraege'], 'jede Ansicht hat einen Prüfwert');
      // Lena benennt „Haftpflicht“ um – eine Änderung des Administrators.
      const haft = await x.sicht(h1.sichten.haftpflicht);
      await x.d.aendereSicht(haft.id, { ...haft, name: 'Haftpflicht (Lena)' });
      const vertrag = (await x.typ('haushalt:vertrag'))!, versicherung = (await x.typ('haushalt:versicherung'))!;
      const strom = await x.d.legeMappeAn({ typId: vertrag.id, werte: { art: 'Strom' } }, ICH.id);
      const waerme = await x.d.legeMappeAn({ typId: vertrag.id, werte: { art: 'Fernwärme' } }, ICH.id);
      const hv = await x.d.legeMappeAn({ typId: versicherung.id, werte: { versicherungsnummer: 'HV-4711', versicherung_art: 'Haftpflicht' } }, ICH.id);

      const { vorschau, upload } = await x.hoch(vertraege);
      assert.deepEqual(vorschau.probleme, []);
      const [v, s] = vorschau.umbau;
      assert.deepEqual(v.felder.find((f) => f.von === 'Art'), { von: 'Art', nach: 'Vertragsart', anzahl: 2, notiz: 1, ohneZiel: ['Fernwärme'] }, '„Strom“ findet die Vorgabe, „Fernwärme“ nichts');
      assert.deepEqual(s.setzen.map((z) => z.wert), ['Vorgabe „versicherung“', '3 Monate', '1 Jahr']);
      assert.deepEqual(s.ansichten.map((a) => [a.name, a.breiter, a.felder, a.paket]).sort(), [
        ['Haftpflicht (Lena)', 2, ['Versicherungsart'], 'Haushalt'],
        ['Versicherungen', 2, [], 'Haushalt'],
      ], 'zeigen danach alle Verträge; Bedingung auf ein Feld ohne Ziel');

      await x.p.installiere({ upload, bestaetigt: true, gesamteVerwaltung: true, umbauBestaetigt: true }, ICH);
      const ziel = (await x.typ('vertraege:vertrag'))!;
      const m = async (id: string) => (await x.d.kern.repo.holeMappe(id))!;
      const art = async (k: string) => (await x.d.kern.repo.mappenMitVorgabe(`paket:vertraege:${k}`))[0].id;
      assert.equal((await m(strom.id)).werte.art, await art('strom'), 'Auswahl „Strom“ → Vertragsart „Strom“');
      assert.equal((await m(waerme.id)).werte.art, undefined, 'keine Vertragsart „Fernwärme“: bleibt leer, nichts angelegt');
      assert.match((await x.d.kern.repo.notizen(waerme.id))[0]?.text ?? '', /Art: Fernwärme/);
      assert.equal((await x.d.listeMappen((await x.typ('vertraege:vertragsart'))!.id)).length, 3, 'keine neuen Vertragsarten');
      const hist = await x.d.kern.repo.historie(strom.id);
      assert.ok(hist.some((h) => JSON.stringify(h.daten.aenderungen ?? []).includes('Vertragsart: Strom')), 'Historie nennt den Titel');
      const neuHv = await m(hv.id);
      assert.equal(neuHv.typId, ziel.id);
      assert.deepEqual([neuHv.werte.kuendigungsfrist, neuHv.werte.mindestlaufzeit], [{ anzahl: 3, einheit: 'monate' }, { anzahl: 1, einheit: 'jahre' }], 'Zeiträume aus setzen');
      assert.equal(neuHv.werte.art, await art('versicherung'));
      // Ansichten: „Versicherungen“ zeigt jetzt den Vertrag – ihr Stand zieht mit (nur der Umbau hat sie geändert).
      const h1b = await x.paket('haushalt');
      const vers = await x.sicht(h1.sichten.versicherungen);
      assert.deepEqual(vers.typen, [ziel.id]);
      assert.equal(h1b.sichtStand?.versicherungen.stand, sichtPruefwert(vers));
      assert.notEqual(h1b.sichtStand?.haftpflicht.stand, sichtPruefwert(await x.sicht(h1.sichten.haftpflicht)), 'Lenas Änderung bleibt eine Änderung');

      // Haushalt 2: Unveränderte Ansichten bekommen die neue Fassung, „Haftpflicht (Lena)“ bleibt – mit Hinweis.
      const zwei = await x.hoch(haushalt2);
      const zustand = Object.fromEntries(zwei.vorschau.sichten.map((y) => [y.schluessel, y.zustand]));
      assert.deepEqual(zustand, { haushalt: 'aktualisiert', vertraege: 'aktualisiert', versicherungen: 'aktualisiert', haftpflicht: 'geaendert' });
      const h2 = await x.p.installiere({ upload: zwei.upload, bestaetigt: true }, ICH);
      const versNeu = await x.sicht(h1.sichten.versicherungen);
      assert.equal(versNeu.id, vers.id, 'gleiche Ansicht (Links, Rechte, Position bleiben)');
      assert.deepEqual(versNeu.bedingungen.map((b) => (b as { feld?: string }).feld), ['vertragsnummer'], 'nicht mehr „alle Verträge“');
      const haftNeu = await x.sicht(h1.sichten.haftpflicht);
      assert.equal(haftNeu.name, 'Haftpflicht (Lena)');
      assert.deepEqual(haftNeu.bedingungen.map((b) => (b as { feld?: string }).feld), ['versicherung_art'], 'bleibt, wie Lena sie hat');
      assert.equal(h2.sichtStand?.versicherungen.stand, sichtPruefwert(versNeu));
      // Das nächste Update fragt wieder nach (die Fassung im Paket bleibt die alte).
      assert.equal(h2.sichtStand?.haftpflicht.fassung, h1b.sichtStand?.haftpflicht.fassung);
    });

    it('gewöhnliches Update: unverändert ersetzt, geändert bleibt, auf Wunsch ersetzt; vor #1125 installiert: gleich oder unbekannt', async () => {
      const x = await aufbau();
      const g1 = await x.installiere(garten('1.0.0', GARTEN1));
      const sonnig = await x.sicht(g1.sichten.sonnig);
      await x.d.aendereSicht(sonnig.id, { ...sonnig, beschreibung: 'Jonas’ Beete' });
      // Wie eine Installation vor #1125: ohne Prüfwerte.
      const ohne = await x.paket('garten');
      delete ohne.sichtStand;
      await x.d.kern.repo.speicherePaket(ohne);
      const v1 = (await x.hoch(garten('1.1.0', GARTEN2))).vorschau;
      assert.deepEqual(Object.fromEntries(v1.sichten.map((y) => [y.schluessel, y.zustand])), { beete: 'gleich', sonnig: 'unbekannt', schattig: 'unbekannt' });
      // Nur „schattig“ soll ersetzt werden.
      const g2 = await x.installiere(garten('1.1.0', GARTEN2), { sichtenErsetzen: ['schattig'] });
      assert.equal((await x.sicht(g1.sichten.sonnig)).bedingungen.length, 0, 'unbekannt und nicht gewählt: bleibt');
      assert.equal((await x.sicht(g1.sichten.schattig)).bedingungen.length, 1, 'gewählt: ersetzt');
      assert.deepEqual(Object.keys(g2.sichtStand ?? {}).sort(), ['beete', 'schattig'], '„sonnig“ bleibt ohne Prüfwert – das nächste Update fragt wieder');
      // Geändert und gewählt: ersetzt (die Rechte an der Ansicht bleiben).
      const sch = await x.sicht(g1.sichten.schattig);
      await x.d.aendereSicht(sch.id, { ...sch, name: 'Schatten' });
      const v2 = (await x.hoch(garten('1.2.0', GARTEN2.replace('Schatten]', 'Schatten, Sonne]')))).vorschau;
      assert.equal(v2.sichten.find((y) => y.schluessel === 'schattig')?.zustand, 'geaendert');
      await x.installiere(garten('1.2.0', GARTEN2.replace('Schatten]', 'Schatten, Sonne]')), { sichtenErsetzen: ['schattig'] });
      const sch2 = await x.sicht(g1.sichten.schattig);
      assert.equal(sch2.name, 'Schattig');
      assert.deepEqual((sch2.bedingungen[0] as { wert?: { wert?: unknown } }).wert?.wert, ['Schatten', 'Sonne']);
    });

    it('gelöschte Ansicht kommt nicht wieder; nichts ersetzt, wenn die Fassung gleich bleibt', async () => {
      const x = await aufbau();
      const g1 = await x.installiere(garten('1.0.0', GARTEN1));
      await x.d.loescheSicht(g1.sichten.schattig);
      const sonnig = await x.sicht(g1.sichten.sonnig);
      await x.d.aendereSicht(sonnig.id, { ...sonnig, name: 'Sonnenbeete' });
      const v = (await x.hoch(garten('1.0.1', GARTEN1))).vorschau;
      assert.deepEqual(Object.fromEntries(v.sichten.map((y) => [y.schluessel, y.zustand])), { beete: 'gleich', sonnig: 'gleich', schattig: 'geloescht' });
      await x.installiere(garten('1.0.1', GARTEN1));
      assert.equal((await x.d.listeSichten()).some((s) => s.id === g1.sichten.schattig), false);
      assert.equal((await x.sicht(g1.sichten.sonnig)).name, 'Sonnenbeete');
    });
  });
}
