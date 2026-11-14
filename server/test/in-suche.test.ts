/**
 * „In der allgemeinen Suche zeigen“ (#1220): Einstellung am Mappentyp – Eingabe, Änderungsprotokoll, Paket-Format
 * (lesen, installieren, Update nur ohne eigene Einstellung, Paket erstellen). Die Suche selbst prüft
 * erweitertesuche.test.ts, „Frag deine Ablage“ fragen.test.ts. Beispiele: Paket Verträge mit „Vertragsart“.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { describe, it } from 'node:test';
import { parse } from 'yaml';
import { beschreibeAenderungen, type TypStand } from '../../shared/src/fassungsvergleich';
import { inAllgemeinerSuche } from '../../shared/src/model';
import { openapi } from '../src/api-v1';
import { speicherDateien } from '../src/dateispeicher';
import { Dienst } from '../src/dienst';
import { speicherEinstellungen } from '../src/einstellungen';
import { bereinigeTyp } from '../src/mappentypen';
import { liesPaket, Paketverwaltung } from '../src/pakete';
import { baue } from '../src/paketerstellung';
import type { Repo } from '../src/repo';
import { speicherRepo } from '../src/repo-speicher';
import { zipPuffer } from '../src/zip';
import { eigeneDatenbank } from './hilfe-db';

describe('In der allgemeinen Suche zeigen (#1220): Einstellung', () => {
  it('Vorgabe ja; nur true/false werden gemerkt; Änderungsprotokoll nennt die Änderung', () => {
    assert.equal(inAllgemeinerSuche({}), true);
    assert.equal(inAllgemeinerSuche({ inSuche: null }), true);
    assert.equal(inAllgemeinerSuche({ inSuche: false }), false);
    assert.equal(bereinigeTyp({ name: 'X', felder: [], register: [], inSuche: false }).inSuche, false);
    assert.equal(bereinigeTyp({ name: 'X', felder: [], register: [], inSuche: 'nein' }).inSuche, null, 'nur true/false, sonst Vorgabe');
    const alt = { name: 'Vertragsart', beschreibung: '', titelVorlage: '', felder: [], register: [] } as unknown as TypStand;
    assert.deepEqual(beschreibeAenderungen('typ', alt, { ...alt, inSuche: false }), ['In der allgemeinen Suche zeigen: nein']);
    assert.deepEqual(beschreibeAenderungen('typ', { ...alt, inSuche: false }, { ...alt, inSuche: null }), ['In der allgemeinen Suche zeigen: ja']);
    assert.deepEqual(beschreibeAenderungen('typ', alt, { ...alt, inSuche: true }), [], 'ausdrücklich ja = Vorgabe: keine Änderung');
  });

  it('API v1 beschreibt das Feld', () => {
    const schema = (openapi('0.0.0') as { components: { schemas: Record<string, { properties: Record<string, { type?: string; nullable?: boolean }> }> } }).components.schemas;
    const typ = Object.values(schema).find((s) => s.properties?.teilVon && s.properties?.ausPost)!;
    assert.deepEqual([typ.properties.inSuche?.type, typ.properties.inSuche?.nullable], ['boolean', true]);
  });

  it('Speichern behält die Einstellung ohne Angabe; Fassungen nennen sie und stellen sie wieder her', async () => {
    const d = new Dienst(speicherRepo(), speicherDateien(), { einstellungen: speicherEinstellungen() });
    const art = await d.mappentypen.legeTypAn({ name: 'Vertragsart', felder: [{ key: 'name', label: 'Name', typ: 'text' }] });
    const aus = await d.kern.mitFassungsKontext({ urheber: { art: 'person', id: 'katrin' } }, () => d.mappentypen.aendereTyp(art.id, { ...art, inSuche: false }));
    assert.equal(aus.inSuche, false);
    const ohne: Record<string, unknown> = { ...aus };
    delete ohne.inSuche;
    assert.equal((await d.mappentypen.aendereTyp(art.id, { ...ohne, beschreibung: 'Werte für „Vertragsart“' })).inSuche, false, 'ohne Angabe bleibt sie');
    const f = await d.fassungen.liste('typ', art.id);
    assert.ok(f.fassungen.some((x) => x.aenderungen?.includes('In der allgemeinen Suche zeigen: nein')), JSON.stringify(f.fassungen.map((x) => x.aenderungen)));
    const vorher = f.fassungen.at(-1)!;
    await d.fassungen.stelleWiederHer('typ', art.id, vorher.nr, { stand: f.stand }, { id: null, email: null });
    assert.equal((await d.kern.repo.holeTyp(art.id))!.inSuche, undefined, 'Wiederherstellen setzt die Vorgabe zurück');
  });
});

/* ---------- Paket-Format ---------- */

const archiv = (d: Record<string, string>) => zipPuffer(Object.entries(d).map(([name, inhalt]) => ({ name, daten: Buffer.from(inhalt) })), new Date('2026-01-01T12:00:00Z'));
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
const KATALOG = 'https://katalog.test/katalog.json';
function katalog(pakete: Array<Record<string, string>>) {
  const daten = new Map<string, Buffer>();
  const versionen: unknown[] = [];
  for (const p of pakete) {
    const version = /^version: (\S+)$/m.exec(p['manifest.yaml'])![1];
    const b = archiv(p);
    daten.set(`https://katalog.test/archive/vertraege_test-${version}.zip`, b);
    versionen.unshift({ version, dms: '>=0.60.0', abhaengigkeiten: {}, inhalt: { mappentypen: [], sichten: [], beispiele: 0 }, code: false, archiv: `archive/vertraege_test-${version}.zip`, sha256: sha(b), groesse: b.length, veroeffentlicht: '2026-11-01T00:00:00Z', quelle: '', readme: '', changelog: '' });
  }
  const aktuell = /^version: (\S+)$/m.exec(pakete.at(-1)!['manifest.yaml'])![1];
  daten.set(KATALOG, Buffer.from(JSON.stringify({ format: 1, erstellt: '', quelle: '', pakete: [{ id: 'vertraege_test', name: 'Verträge', beschreibung: '', autor: { name: 'Test', github: 'test' }, lizenz: 'MIT', aktuell, versionen }] })));
  return async (url: string) => { const b = daten.get(url); if (!b) throw new Error(`404 ${url}`); return b; };
}
const paket = (version: string, inSuche: string) => ({
  'manifest.yaml': `schema: 1\nid: vertraege_test\nname: Verträge\nversion: ${version}\nbeschreibung: Test.\nautor: { name: Test, github: test }\nlizenz: MIT\ndms: ">=0.60.0"\ninhalt:\n  mappentypen: inhalt/mappentypen.yaml\n`,
  'inhalt/mappentypen.yaml': [
    '- schluessel: vertragsart', '  name: Vertragsart', '  beschreibung: Werte für das Feld „Vertragsart“', ...(inSuche ? [`  inSuche: ${inSuche}`] : []),
    '  felder:', '    - { key: name, label: Name, typ: text }', '  register:', '    - { key: daten, name: Daten, art: felder, felder: [name] }',
    '- schluessel: kategorie', '  name: Kategorie', '  beschreibung: Noch eine Liste',
    '  felder:', '    - { key: name, label: Name, typ: text }', '  register:', '    - { key: daten, name: Daten, art: felder, felder: [name] }', '',
  ].join('\n'),
});
const lies = (p: Record<string, string>) => liesPaket(new Map(Object.entries(p).map(([k, v]) => [k, Buffer.from(v)])));

function paketFaelle(pg: boolean) {
  describe(`In der allgemeinen Suche zeigen (#1220): Paket-Format${pg ? ' – PostgreSQL' : ''}`, { skip: pg && !process.env.TEST_DATABASE_URL && 'ohne TEST_DATABASE_URL' }, () => {
    async function repo(): Promise<Repo> {
      if (!pg) return speicherRepo();
      const { pgRepo } = await import('../src/repo-pg');
      const db = await eigeneDatenbank('x1220');
      await db.sql`INSERT INTO haushalte (id, name) VALUES ('00000000-0000-4000-8000-000000000001', 'Test') ON CONFLICT DO NOTHING`;
      await db.sql`INSERT INTO benutzer (id, haushalt_id, email, name, rolle) VALUES ('00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-000000000001', 'lena@example.org', 'Lena', 'admin')`;
      return pgRepo(db.sql, '00000000-0000-4000-8000-000000000001') as never;
    }
    const ICH = { id: '00000000-0000-4000-8000-0000000000aa', email: 'lena@example.org' };

    it('liest inSuche (falscher Typ wird übergangen), installiert, Update nur ohne eigene Einstellung, Paket erstellen schreibt es', async () => {
      assert.deepEqual(lies(paket('1.0.0', 'false')).typen.map((t) => t.inSuche), [false, undefined]);
      assert.deepEqual(lies(paket('1.0.0', 'vielleicht')).typen.map((t) => t.inSuche), [undefined, undefined]);
      // 1.0.0 ohne Angabe (wie heute im Paket Verträge), 1.1.0 liefert „nein“ für die Vertragsart.
      const d = new Dienst(await repo(), speicherDateien(), { einstellungen: speicherEinstellungen() });
      const p = new Paketverwaltung(d, { version: () => '0.274.0', abruf: katalog([paket('1.0.0', ''), paket('1.1.0', 'false')]), katalogUrl: KATALOG });
      const inst = await p.installiere({ id: 'vertraege_test', version: '1.0.0' }, ICH);
      const holen = async (s: string) => (await d.kern.repo.holeTyp(inst.typen[s]))!;
      assert.equal((await holen('vertragsart')).inSuche, undefined);
      assert.equal(inAllgemeinerSuche(await holen('vertragsart')), true);
      // Kategorie hat der Administrator ausdrücklich eingestellt – das Update ändert sie nicht (hier ohnehin keine Angabe).
      const k = await holen('kategorie');
      await d.mappentypen.aendereTyp(k.id, { ...k, inSuche: true });
      assert.equal((await p.vorschau({ id: 'vertraege_test' })).typen.find((t) => t.schluessel === 'vertragsart')!.typAngaben, true);
      await p.aktualisiere('vertraege_test', {}, ICH);
      assert.equal((await holen('vertragsart')).inSuche, false, 'Vorgabe → das Paket darf');
      assert.equal((await holen('kategorie')).inSuche, true);

      // Ausdrücklich „ja“ eingestellt: ein Update mit „nein“ ändert es nicht.
      const d2 = new Dienst(await repo(), speicherDateien(), { einstellungen: speicherEinstellungen() });
      const p2 = new Paketverwaltung(d2, { version: () => '0.274.0', abruf: katalog([paket('1.0.0', ''), paket('1.1.0', 'false')]), katalogUrl: KATALOG });
      const inst2 = await p2.installiere({ id: 'vertraege_test', version: '1.0.0' }, ICH);
      const v2 = (await d2.kern.repo.holeTyp(inst2.typen.vertragsart))!;
      await d2.mappentypen.aendereTyp(v2.id, { ...v2, inSuche: true });
      await p2.aktualisiere('vertraege_test', {}, ICH);
      assert.equal((await d2.kern.repo.holeTyp(v2.id))!.inSuche, true);

      // Neu installiert mit 1.1.0: gleich „nein“.
      const d3 = new Dienst(await repo(), speicherDateien(), { einstellungen: speicherEinstellungen() });
      const p3 = new Paketverwaltung(d3, { version: () => '0.274.0', abruf: katalog([paket('1.1.0', 'false')]), katalogUrl: KATALOG });
      const inst3 = await p3.installiere({ id: 'vertraege_test', version: '1.1.0' }, ICH);
      assert.equal((await d3.kern.repo.holeTyp(inst3.typen.vertragsart))!.inSuche, false);

      // Paket erstellen: „nein“ geht mit, „ja“ (Vorgabe) nicht.
      const typen = await d.mappentypen.listeTypen();
      const bau = baue({ typen: [inst.typen.vertragsart, inst.typen.kategorie], sichten: [], beispiele: [], id: 'eigenes', name: 'Eigenes', version: '1.0.0', beschreibung: 'Ein Paket zum Testen der neuen Angabe.', autor: { name: 'Lena', github: 'lena' }, lizenz: 'MIT', dms: '>=0.113.0', aenderungen: '' },
        { typen, sichten: [], pakete: [], dmsTypen: new Map(), mappen: [], dmsVersion: '0.274.0', entwurf: null, jetzt: new Date('2026-11-14T12:00:00Z') });
      const datei = bau.dateien.find((x) => x.name.endsWith('mappentypen.yaml'))!;
      const yaml = parse(datei.daten.toString()) as Array<Record<string, unknown>>;
      assert.deepEqual(yaml.map((t) => [t.name, t.inSuche]), [['Vertragsart', false], ['Kategorie', undefined]]);
    });
  });
}
paketFaelle(false);
paketFaelle(true);
