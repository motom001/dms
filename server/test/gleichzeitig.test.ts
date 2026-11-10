/**
 * Gleichzeitig bearbeiten (#609): Wer zuletzt speichert, setzt keine Felder zurück, die er nicht angefasst hat.
 * Mit Stand: Konflikt nur, wenn seitdem dasselbe Feld anders geändert wurde (409 mit den Feldern).
 * Im Arbeitsspeicher und – mit TEST_DATABASE_URL – in einer eigenen PostgreSQL-Datenbank.
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { after, before, describe, it } from 'node:test';
import type { Benutzer, Mappenkonflikt } from '../../shared/src/model';
import { openapi } from '../src/api-v1';
import { speicherDateien } from '../src/dateispeicher';
import { Dienst } from '../src/dienst';
import { speicherEinstellungen } from '../src/einstellungen';
import { Fachfehler } from '../src/fehler';
import { feldweise, StandVeraltet, type Repo } from '../src/repo';
import { speicherRepo } from '../src/repo-speicher';

const benutzer = (id: string, name: string, rolle: 'admin' | 'mitglied'): Benutzer => ({ id, email: `${name.toLowerCase()}@example.org`, name, rolle, aktiv: true } as Benutzer);

let neuesRepo: () => Promise<Repo> = async () => speicherRepo();
/** In PostgreSQL braucht jeder Benutzer eine Zeile in `benutzer`. */
let neuerBenutzer: (id: string, name: string) => Promise<void> = async () => {};

async function aufbau() {
  const repo = await neuesRepo();
  const d = new Dienst(repo, speicherDateien(), { einstellungen: speicherEinstellungen() });
  const LENA = randomUUID(), JONAS = randomUUID();
  await neuerBenutzer(LENA, 'Lena'); await neuerBenutzer(JONAS, 'Jonas');
  await d.gleicheBenutzerAb([benutzer(LENA, 'Lena', 'admin'), benutzer(JONAS, 'Jonas', 'mitglied')]);
  const partner = await d.legeTypAn({ name: 'Versicherer', titelVorlage: '{name}', felder: [{ key: 'name', label: 'Name', typ: 'text', pflicht: true }] });
  const typ = await d.legeTypAn({ name: 'Versicherung', titelVorlage: '{bezeichnung}', felder: [
    { key: 'bezeichnung', label: 'Bezeichnung', typ: 'text', pflicht: true },
    { key: 'beitrag', label: 'Beitrag', typ: 'betrag' },
    { key: 'notiz', label: 'Notiz', typ: 'langtext' },
    { key: 'arten', label: 'Arten', typ: 'auswahl', optionen: ['Haftpflicht', 'Kasko', 'Schutzbrief'], mehrfach: true },
    { key: 'versicherer', label: 'Versicherer', typ: 'referenz', zielTyp: partner.id, mehrfach: true },
  ] });
  const a = await d.legeMappeAn({ typId: partner.id, werte: { name: 'Versicherer A' } }, LENA);
  const b = await d.legeMappeAn({ typId: partner.id, werte: { name: 'Versicherer B' } }, LENA);
  const m = await d.legeMappeAn({ typId: typ.id, werte: { bezeichnung: 'Kfz-Versicherung', beitrag: { betrag: 398, waehrung: 'EUR' }, notiz: 'alt', arten: ['Haftpflicht'], versicherer: [a.id] } }, LENA);
  return { d, repo, typ, m, a, b, LENA, JONAS };
}

/** Fängt den 409 und liefert seine Details. */
async function konflikt(p: Promise<unknown>): Promise<Mappenkonflikt> {
  try { await p; } catch (e) {
    assert.ok(e instanceof Fachfehler, String(e));
    assert.equal(e.status, 409, e.message);
    return e.details as Mappenkonflikt;
  }
  assert.fail('Es hätte einen Konflikt (409) geben sollen');
}

function faelle() {
  it('ohne Stand: nicht übergebene Felder bleiben, auch nach einer Änderung von anderswo', async () => {
    const { d, m, LENA, JONAS } = await aufbau();
    // Handy: Beitrag; Laptop (älterer Stand, schickt nur die Notiz) – der Beitrag bleibt.
    await d.aendereMappe(m.id, { werte: { beitrag: { betrag: 412, waehrung: 'EUR' } } }, JONAS);
    const r = await d.aendereMappe(m.id, { werte: { notiz: 'neu' } }, LENA);
    assert.deepEqual(r.werte.beitrag, { betrag: 412, waehrung: 'EUR' });
    assert.equal(r.werte.notiz, 'neu');
    assert.equal(r.werte.bezeichnung, 'Kfz-Versicherung');
  });

  it('zwei Schreiber mit demselben Stand, verschiedene Felder: beide Änderungen bleiben, keine Rückfrage', async () => {
    const { d, m, LENA, JONAS } = await aufbau();
    const stand = m.geaendert;
    const r1 = await d.aendereMappe(m.id, { werte: { beitrag: { betrag: 412, waehrung: 'EUR' } }, stand }, JONAS);
    assert.ok(r1.geaendert > stand, 'Der Stand steigt bei jedem Speichern');
    const r2 = await d.aendereMappe(m.id, { werte: { notiz: 'neu', arten: ['Haftpflicht', 'Kasko'] }, stand }, LENA);
    assert.deepEqual(r2.werte.beitrag, { betrag: 412, waehrung: 'EUR' });
    assert.equal(r2.werte.notiz, 'neu');
    assert.deepEqual(r2.werte.arten, ['Haftpflicht', 'Kasko']);
    // Historie: je Schreiber nur seine eigenen Felder.
    const h = (await d.historie(m.id)).filter((x) => x.art === 'geaendert');
    assert.deepEqual(h.map((x) => [x.benutzerId, x.daten.aenderungen?.map((a) => a.feld).sort()]), [[LENA, ['arten', 'notiz']], [JONAS, ['beitrag']]]);
  });

  it('dasselbe Feld: 409 mit Name, Uhrzeit, altem und neuem Wert – „Meins übernehmen“ und „Seins behalten“', async () => {
    const { d, m, LENA, JONAS } = await aufbau();
    const stand = m.geaendert;
    await d.aendereMappe(m.id, { werte: { beitrag: { betrag: 412, waehrung: 'EUR' } }, stand }, JONAS);
    const k = await konflikt(d.aendereMappe(m.id, { werte: { beitrag: { betrag: 398.5, waehrung: 'EUR' }, notiz: 'Laptop' }, stand }, LENA));
    assert.equal(k.konflikte.length, 1, 'Nur der Beitrag – die Notiz hat niemand sonst geändert');
    const [x] = k.konflikte;
    assert.equal(x.feld, 'beitrag');
    assert.equal(x.label, 'Beitrag');
    assert.equal(x.von, JONAS);
    assert.equal(x.name, 'Jonas');
    assert.match(x.aktuell, /412,00/);
    assert.match(x.deins, /398,50/);
    assert.deepEqual(x.wert, { betrag: 412, waehrung: 'EUR' });
    assert.ok(!Number.isNaN(Date.parse(x.zeit)));
    // Nichts gespeichert, auch die Notiz nicht.
    assert.equal((await d.holeMappe(m.id)).mappe.werte.notiz, 'alt');
    // „Seins behalten“: ohne den Beitrag noch einmal – die Notiz kommt dazu.
    const seins = await d.aendereMappe(m.id, { werte: { notiz: 'Laptop' }, stand: k.stand }, LENA);
    assert.deepEqual(seins.werte.beitrag, { betrag: 412, waehrung: 'EUR' });
    assert.equal(seins.werte.notiz, 'Laptop');
    // „Meins übernehmen“: mit dem Stand aus dem 409 – kein zweiter Konflikt.
    const k2 = await konflikt(d.aendereMappe(m.id, { werte: { beitrag: { betrag: 398.5, waehrung: 'EUR' } }, stand }, LENA));
    const meins = await d.aendereMappe(m.id, { werte: { beitrag: { betrag: 398.5, waehrung: 'EUR' } }, stand: k2.stand }, LENA);
    assert.deepEqual(meins.werte.beitrag, { betrag: 398.5, waehrung: 'EUR' });
    const h = (await d.historie(m.id)).filter((e) => e.art === 'geaendert' && e.daten.aenderungen?.some((a) => a.feld === 'beitrag'));
    assert.deepEqual(h.map((e) => [e.benutzerId, e.daten.aenderungen!.find((a) => a.feld === 'beitrag')!.neu?.replace(/\s/g, ' ')]), [[LENA, '398,50 €'], [JONAS, '412,00 €']]);
  });

  it('gleicher Wert ist kein Konflikt; eigene Änderung an einem anderen Gerät schon', async () => {
    const { d, m, LENA, JONAS } = await aufbau();
    const stand = m.geaendert;
    await d.aendereMappe(m.id, { werte: { notiz: 'gleich' } }, LENA);
    await d.aendereMappe(m.id, { werte: { notiz: 'gleich' }, stand }, JONAS);
    await d.aendereMappe(m.id, { werte: { notiz: 'Handy' }, stand: (await d.holeMappe(m.id)).mappe.geaendert }, LENA);
    const k = await konflikt(d.aendereMappe(m.id, { werte: { notiz: 'Laptop' }, stand }, LENA));
    assert.equal(k.konflikte[0].von, LENA);
    assert.equal(k.konflikte[0].aktuell, 'Handy');
  });

  it('Verweise und Mehrfachauswahl: Konflikt nur bei demselben Feld', async () => {
    const { d, m, a, b, LENA, JONAS } = await aufbau();
    const stand = m.geaendert;
    await d.aendereMappe(m.id, { werte: { versicherer: [a.id, b.id] }, stand }, JONAS);
    const k = await konflikt(d.aendereMappe(m.id, { werte: { versicherer: [b.id], arten: ['Kasko'] }, stand }, LENA));
    assert.deepEqual(k.konflikte.map((x) => x.feld), ['versicherer']);
    assert.equal(k.konflikte[0].aktuell, 'Versicherer A, Versicherer B');
    assert.equal(k.konflikte[0].deins, 'Versicherer B');
    const r = await d.aendereMappe(m.id, { werte: { arten: ['Kasko'] }, stand: k.stand }, LENA);
    assert.deepEqual(r.werte.versicherer, [a.id, b.id]);
    assert.deepEqual(r.werte.arten, ['Kasko']);
    // Rückverweise passen zum zusammengeführten Stand.
    assert.ok((await d.holeMappe(b.id)).rueckverweise.some((x) => x.quelleId === m.id), 'Versicherer B kennt die Mappe');
  });

  it('Titel: ändert sich mit dem zusammengeführten Stand', async () => {
    const { d, m, LENA, JONAS } = await aufbau();
    const stand = m.geaendert;
    await d.aendereMappe(m.id, { werte: { bezeichnung: 'Kfz-Versicherung Kombi' }, stand }, JONAS);
    const r = await d.aendereMappe(m.id, { werte: { notiz: 'neu' }, stand }, LENA);
    assert.equal(r.titel, 'Kfz-Versicherung Kombi');
    const k = await konflikt(d.aendereMappe(m.id, { werte: { bezeichnung: 'Auto' }, stand }, LENA));
    assert.equal(k.konflikte[0].label, 'Bezeichnung');
  });

  it('gleichzeitig ohne Stand (Erkennung, Zuordnen, Pakete): kein Feld geht verloren', async () => {
    const { d, m, LENA, JONAS } = await aufbau();
    await Promise.all([
      d.aendereMappe(m.id, { werte: { notiz: 'Erkennung' } }, null),
      d.aendereMappe(m.id, { werte: { beitrag: { betrag: 500, waehrung: 'EUR' } } }, JONAS),
      d.aendereMappe(m.id, { werte: { arten: ['Schutzbrief'] } }, LENA),
    ]);
    const w = (await d.holeMappe(m.id)).mappe.werte;
    assert.equal(w.notiz, 'Erkennung');
    assert.deepEqual(w.beitrag, { betrag: 500, waehrung: 'EUR' });
    assert.deepEqual(w.arten, ['Schutzbrief']);
  });

  it('interne Schreiber mit älterem Lesestand (Zuordnen, Post, Benutzer): feldweise, nichts wird zurückgesetzt', async () => {
    const { d, repo, m, LENA, JONAS } = await aufbau();
    const gelesen = (await d.holeMappe(m.id)).mappe;
    // Inzwischen ändert ein Mensch den Beitrag …
    await d.aendereMappe(m.id, { werte: { beitrag: { betrag: 412, waehrung: 'EUR' } } }, JONAS);
    // … ein interner Schreiber schreibt alle Werte im alten Stand, mit einer eigenen Änderung.
    const r = await repo.aendereMappe(m.id, { ...gelesen.werte, notiz: 'System' }, [], LENA, { basis: gelesen.werte, verweise: () => [] });
    assert.deepEqual(r.werte.beitrag, { betrag: 412, waehrung: 'EUR' });
    assert.equal(r.werte.notiz, 'System');
    // Mit Stand: veraltet → StandVeraltet, nichts geschrieben.
    await assert.rejects(repo.aendereMappe(m.id, { ...gelesen.werte, notiz: 'zu spät' }, [], LENA, { basis: gelesen.werte, verweise: () => [], stand: gelesen.geaendert }), StandVeraltet);
    assert.equal((await d.holeMappe(m.id)).mappe.werte.notiz, 'System');
  });

  it('Stand, der kein Zeitpunkt ist: 422', async () => {
    const { d, m, LENA, JONAS } = await aufbau();
    await assert.rejects(d.aendereMappe(m.id, { werte: { notiz: 'x' }, stand: 'gestern' }, LENA), (e) => e instanceof Fachfehler && e.status === 422);
  });
}

describe('Gleichzeitig bearbeiten (#609)', () => {
  it('feldweise: nur Geändertes kommt auf den aktuellen Stand, Entferntes fällt weg', () => {
    assert.deepEqual(feldweise({ a: 1, b: 'neu von anderswo', c: true }, { a: 1, b: 'alt', c: true }, { a: 2, b: 'alt', c: true }), { a: 2, b: 'neu von anderswo', c: true });
    assert.deepEqual(feldweise({ a: 1, x: 'y' }, { a: 1, x: 'y' }, { a: 1 }), { a: 1 });
  });

  it('OpenAPI: stand im Körper, 409 bei PUT /mappen/{id}', () => {
    const o = openapi('test') as { paths: Record<string, Record<string, { responses: Record<string, unknown> }>>; components: { schemas: Record<string, { properties: Record<string, unknown> }> } };
    assert.ok(o.paths['/mappen/{id}'].put.responses['409']);
    assert.ok(o.components.schemas.MappeAenderung.properties.stand);
    assert.ok(o.components.schemas.Mappenkonflikt);
  });

  describe('im Arbeitsspeicher', () => { faelle(); });
});

const url = process.env.TEST_DATABASE_URL;
describe('Gleichzeitig bearbeiten (#609) in PostgreSQL', { skip: url ? false : 'TEST_DATABASE_URL nicht gesetzt' }, () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Module erst nach dem Setzen der Umgebung dynamisch geladen; Typ im Test ohne Belang
  let haupt: any; let sql: any;
  const db = `dms_gleichzeitig_${process.pid}`;
  before(async () => {
    const { verbinde, migriere } = await import('../src/db');
    haupt = verbinde(url!);
    await haupt.unsafe(`DROP DATABASE IF EXISTS ${db}`);
    await haupt.unsafe(`CREATE DATABASE ${db}`);
    const u = new URL(url!); u.pathname = `/${db}`;
    sql = verbinde(u.toString());
    await migriere(sql, fileURLToPath(new URL('../migrations', import.meta.url)), () => {});
    const { pgRepo } = await import('../src/repo-pg');
    let h = '';
    neuesRepo = async () => {
      h = randomUUID();
      await sql`INSERT INTO haushalte (id, name) VALUES (${h}, 'Test')`;
      return pgRepo(sql, h);
    };
    neuerBenutzer = async (id, name) => { await sql`INSERT INTO benutzer (id, haushalt_id, email, name, rolle) VALUES (${id}, ${h}, ${`${name.toLowerCase()}-${id}@example.org`}, ${name}, 'mitglied')`; };
  });
  after(async () => {
    neuesRepo = async () => speicherRepo();
    neuerBenutzer = async () => {};
    await sql?.end();
    await haupt?.unsafe(`DROP DATABASE IF EXISTS ${db}`);
    await haupt?.end();
  });
  faelle();
});
