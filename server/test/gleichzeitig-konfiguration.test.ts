/**
 * Gleichzeitig bearbeiten in der Werkbank (#917): Mappentypen und Ansichten werden mit dem Stand gespeichert, auf dem
 * die Bearbeitung beruht. Hat inzwischen jemand anderes gespeichert, kommt 409 und nichts geht verloren.
 * Ohne mitgeschickten Stand wie bisher. Im Arbeitsspeicher und – mit TEST_DATABASE_URL – in PostgreSQL.
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { after, before, describe, it } from 'node:test';
import { openapi } from '../src/api-v1';
import { speicherDateien } from '../src/dateispeicher';
import { Dienst } from '../src/dienst';
import { speicherEinstellungen } from '../src/einstellungen';
import { Fachfehler } from '../src/fehler';
import type { Repo } from '../src/repo';
import { speicherRepo } from '../src/repo-speicher';
import { t } from '../src/sprache';

let neuesRepo: () => Promise<Repo> = async () => speicherRepo();

async function aufbau() {
  const repo = await neuesRepo();
  const d = new Dienst(repo, speicherDateien(), { einstellungen: speicherEinstellungen() });
  const typ = await d.mappentypen.legeTypAn({ name: 'Versicherung', titelVorlage: '{bezeichnung}', felder: [{ key: 'bezeichnung', label: 'Bezeichnung', typ: 'text', pflicht: true }] });
  const haus = await d.sichtenVerwaltung.legeSichtAn({ name: 'Haus', typen: [] });
  const sicht = await d.sichtenVerwaltung.legeSichtAn({ name: 'Versicherungen', elternId: haus.id, typen: [typ.id], bedingungen: [] });
  const zweite = await d.sichtenVerwaltung.legeSichtAn({ name: 'Verträge', elternId: haus.id, typen: [typ.id] });
  return { d, repo, typ, haus, sicht, zweite };
}

/** Fängt den Fehler und prüft den Status. */
async function fehler(p: Promise<unknown>, status: number): Promise<Fachfehler> {
  try { await p; } catch (e) {
    assert.ok(e instanceof Fachfehler, String(e));
    assert.equal(e.status, status, e.message);
    return e;
  }
  assert.fail(`Es hätte einen Fehler ${status} geben sollen`);
}

function faelle() {
  it('Mappentyp: zwei gleichzeitige Bearbeitungen – die zweite scheitert mit 409, nichts geht verloren', async () => {
    const { d, typ } = await aufbau();
    // Markus und Petra öffnen denselben Stand.
    const stand = typ.geaendert;
    const petra = await d.mappentypen.aendereTyp(typ.id, { ...typ, felder: [...typ.felder, { key: 'beitrag', label: 'Beitrag', typ: 'betrag' }], stand });
    assert.ok(petra.geaendert > stand, 'Der Stand wächst mit jeder Änderung');
    const f = await fehler(d.mappentypen.aendereTyp(typ.id, { ...typ, beschreibung: 'Von Markus', stand }), 409);
    assert.equal(f.message, t('meldungen.dienst.typ-konflikt'));
    assert.equal((f.details as { konflikt?: boolean }).konflikt, true);
    const jetzt = (await d.mappentypen.listeTypen()).find((x) => x.id === typ.id)!;
    assert.deepEqual(jetzt.felder.map((x) => x.key), ['bezeichnung', 'beitrag'], 'Petras Feld ist noch da');
    assert.equal(jetzt.beschreibung, '', 'Markus hat nichts überschrieben');
    // Neu geladen und noch einmal: geht.
    const markus = await d.mappentypen.aendereTyp(typ.id, { ...jetzt, beschreibung: 'Von Markus', stand: jetzt.geaendert });
    assert.equal(markus.beschreibung, 'Von Markus');
    assert.equal(markus.felder.length, 2);
  });

  it('Mappentyp: ohne Stand wie bisher (abwärtskompatibel), ungültiger Stand ist 422', async () => {
    const { d, typ } = await aufbau();
    await d.mappentypen.aendereTyp(typ.id, { ...typ, beschreibung: 'eins' });
    const r = await d.mappentypen.aendereTyp(typ.id, { ...typ, beschreibung: 'zwei' });
    assert.equal(r.beschreibung, 'zwei');
    await fehler(d.mappentypen.aendereTyp(typ.id, { ...typ, stand: 'gestern' }), 422);
  });

  it('Mappentyp: auch schnell nacheinander bekommt jede Änderung einen neuen Stand', async () => {
    const { d, typ } = await aufbau();
    const a = await d.mappentypen.aendereTyp(typ.id, { ...typ, beschreibung: 'a', stand: typ.geaendert });
    const b = await d.mappentypen.aendereTyp(typ.id, { ...typ, beschreibung: 'b', stand: a.geaendert });
    assert.ok(b.geaendert > a.geaendert);
    await fehler(d.mappentypen.aendereTyp(typ.id, { ...typ, beschreibung: 'c', stand: a.geaendert }), 409);
  });

  it('Ansicht: zwei gleichzeitige Bearbeitungen – die zweite scheitert mit 409, nichts geht verloren', async () => {
    const { d, sicht } = await aufbau();
    const stand = sicht.geaendert;
    const bedingung = { art: 'feld', feld: 'bezeichnung', op: 'enthaelt', wert: 'Kfz' };
    await d.sichtenVerwaltung.aendereSicht(sicht.id, { ...sicht, bedingungen: [bedingung], stand });
    const f = await fehler(d.sichtenVerwaltung.aendereSicht(sicht.id, { ...sicht, name: 'Policen', stand }), 409);
    assert.equal(f.message, t('meldungen.dienst.sicht-konflikt'));
    const jetzt = (await d.sichtenVerwaltung.listeSichten()).find((x) => x.id === sicht.id)!;
    assert.equal(jetzt.bedingungen.length, 1, 'Petras Bedingung ist noch da');
    assert.equal(jetzt.name, 'Versicherungen', 'Markus hat nichts überschrieben');
    const r = await d.sichtenVerwaltung.aendereSicht(sicht.id, { ...jetzt, name: 'Policen', stand: jetzt.geaendert });
    assert.equal(r.name, 'Policen');
    assert.equal(r.bedingungen.length, 1);
    // Ohne Stand wie bisher.
    assert.equal((await d.sichtenVerwaltung.aendereSicht(sicht.id, { ...sicht, name: 'Ohne Stand' })).name, 'Ohne Stand');
  });

  it('Ansicht: Ordnen unter Geschwistern lässt den Stand, ohne Stelle bleibt sie; neue Elternsicht ist eine Änderung', async () => {
    const { d, haus, sicht, zweite } = await aufbau();
    await d.sichtenVerwaltung.ordneSichten(haus.id, [zweite.id, sicht.id]);
    let jetzt = (await d.sichtenVerwaltung.listeSichten()).find((x) => x.id === sicht.id)!;
    assert.equal(jetzt.geaendert, sicht.geaendert, 'Umnummerieren ist keine Änderung der Ansicht');
    // Die offene Bearbeitung (ohne Stelle) gilt weiter und setzt die neue Reihenfolge nicht zurück.
    await d.sichtenVerwaltung.aendereSicht(sicht.id, { ...sicht, position: undefined, name: 'Policen', stand: sicht.geaendert });
    const reihe = (await d.sichtenVerwaltung.listeSichten()).filter((x) => x.elternId === haus.id).sort((a, b) => a.position - b.position).map((x) => x.id);
    assert.deepEqual(reihe, [zweite.id, sicht.id]);
    // Verschieben unter eine andere Elternsicht ändert die Ansicht (sie erbt andere Berechtigungen).
    jetzt = (await d.sichtenVerwaltung.listeSichten()).find((x) => x.id === sicht.id)!;
    await d.sichtenVerwaltung.verschiebeSicht(sicht.id, null, 0);
    await fehler(d.sichtenVerwaltung.aendereSicht(sicht.id, { ...jetzt, position: undefined, stand: jetzt.geaendert }), 409);
    assert.equal((await d.sichtenVerwaltung.listeSichten()).find((x) => x.id === sicht.id)!.elternId, null, 'Das Verschieben bleibt');
  });

  it('Ansicht: Löschen einer Elternsicht ändert die Untersichten', async () => {
    const { d, haus, sicht } = await aufbau();
    await d.sichtenVerwaltung.loescheSicht(haus.id);
    await fehler(d.sichtenVerwaltung.aendereSicht(sicht.id, { ...sicht, stand: sicht.geaendert }), 409);
  });
}

describe('Gleichzeitig bearbeiten in der Werkbank (#917)', () => {
  it('API-Beschreibung: stand am Mappentyp, 409 bei PUT /typen/{id}', () => {
    const o = openapi('test') as { paths: Record<string, Record<string, { responses: Record<string, unknown>; description?: string }>>; components: { schemas: Record<string, { properties: Record<string, unknown> }> } };
    assert.ok(o.paths['/typen/{id}'].put.responses['409']);
    assert.ok(o.components.schemas.MappentypEingabe.properties.stand);
  });
  describe('im Arbeitsspeicher', () => { faelle(); });
});

const url = process.env.TEST_DATABASE_URL;
describe('Gleichzeitig bearbeiten in der Werkbank (#917) in PostgreSQL', { skip: url ? false : 'TEST_DATABASE_URL nicht gesetzt' }, () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Module erst nach dem Setzen der Umgebung dynamisch geladen; Typ im Test ohne Belang
  let haupt: any; let sql: any;
  const db = `dms_konfig_${process.pid}`;
  before(async () => {
    const { verbinde, migriere } = await import('../src/db');
    haupt = verbinde(url!);
    await haupt.unsafe(`DROP DATABASE IF EXISTS ${db}`);
    await haupt.unsafe(`CREATE DATABASE ${db}`);
    const u = new URL(url!); u.pathname = `/${db}`;
    sql = verbinde(u.toString());
    await migriere(sql, fileURLToPath(new URL('../migrations', import.meta.url)), () => {});
    const { pgRepo } = await import('../src/repo-pg');
    neuesRepo = async () => {
      const h = randomUUID();
      await sql`INSERT INTO haushalte (id, name) VALUES (${h}, 'Test')`;
      return pgRepo(sql, h);
    };
  });
  after(async () => {
    neuesRepo = async () => speicherRepo();
    await sql?.end();
    await haupt?.unsafe(`DROP DATABASE IF EXISTS ${db}`);
    await haupt?.end();
  });
  faelle();
});
