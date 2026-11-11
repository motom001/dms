/**
 * Suche unter Last (#615): gefalteter Suchtext der Mappen als gespeicherte Spalte (Migration 055), „Zuletzt
 * geöffnet“ und „gesehen“ in einem Zugriff und ohne Warten auf die Platte, Spalten der Mappen ohne Suchtext.
 * Die Treffer der Suche bleiben dieselben; seit #740 ist der Suchtext nie leer. PostgreSQL nur mit TEST_DATABASE_URL.
 */
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import type postgres from 'postgres';
import { speicherDateien } from '../src/dateispeicher';
import { Dienst } from '../src/dienst';
import { speicherEinstellungen } from '../src/einstellungen';
import { speicherKontoRepo, zuletztListe, type KontoRepo } from '../src/konto-repo';
import { speicherRepo } from '../src/repo-speicher';

const HAUSHALT = '00000000-0000-4000-8000-000000000001';
const ICH = { id: '00000000-0000-4000-8000-0000000000aa', rolle: 'admin', email: 'lena@example.org' };
const offen: Array<() => Promise<void>> = [];
after(async () => { for (const f of offen) await f(); });

async function datenbank(): Promise<postgres.Sql> {
  const { ausUrl, alsUrl, legeDatenbankAn } = await import('../src/anbindung');
  const { verbinde, migriere } = await import('../src/db');
  const a = { ...ausUrl(process.env.TEST_DATABASE_URL)!, datenbank: `dms_suchtext_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}` };
  await legeDatenbankAn(a);
  const sql = verbinde(alsUrl(a));
  offen.push(async () => {
    await sql.end();
    const admin = verbinde(alsUrl(a, 'postgres'));
    await admin.unsafe(`DROP DATABASE IF EXISTS "${a.datenbank}" WITH (FORCE)`).catch(() => {});
    await admin.end();
  });
  await migriere(sql, new URL('../migrations', import.meta.url).pathname, () => {});
  return sql;
}

describe('Suchtext der Mappen (#615) – PostgreSQL', { skip: !process.env.TEST_DATABASE_URL && 'ohne TEST_DATABASE_URL' }, () => {
  async function aufbau() {
    const sql = await datenbank();
    const { pgRepo } = await import('../src/repo-pg');
    const r = pgRepo(sql, HAUSHALT);
    await sql`INSERT INTO benutzer (id, haushalt_id, email, name, rolle) VALUES (${ICH.id}, ${HAUSHALT}, ${ICH.email}, 'Lena', 'admin')`;
    const d = new Dienst(r, speicherDateien(), { einstellungen: speicherEinstellungen() });
    const typ = await d.mappentypen.legeTypAn({ name: 'Unterlage', titelVorlage: '{titel}', felder: [
      { key: 'titel', label: 'Titel', typ: 'text', pflicht: true }, { key: 'von', label: 'Von', typ: 'text' }, { key: 'notiz', label: 'Notiz', typ: 'text' },
    ] });
    const suche = async (s: string) => (await d.sichten.seite(ICH, { sicht: `typ:${typ.id}`, suche: s })).mappen.map((m) => m.titel).sort();
    return { sql, r, d, typ, suche };
  }

  it('Trigger füllt den Suchtext beim Anlegen und Ändern – ohne Passwörter; dieselben Treffer mit und ohne', async () => {
    const { sql, d, typ, suche } = await aufbau();
    const a = await d.mappen.legeMappeAn({ typId: typ.id, werte: { titel: 'Kfz-Versicherung 2026', von: 'Herr Özdemir' } });
    const b = await d.mappen.legeMappeAn({ typId: typ.id, werte: { titel: 'Stromvertrag', notiz: 'Gebühr für die Straße' } });
    await d.mappen.legeMappeAn({ typId: typ.id, werte: { titel: 'Garten' } });
    const [x] = await sql`SELECT suchtext, suchtext = dms_mappe_suchtext(titel, werte) AS gleich FROM mappen WHERE id = ${a.id}`;
    assert.equal(x.gleich, true);
    assert.match(x.suchtext as string, /kfzversicherung 2026/);
    assert.match(x.suchtext as string, /herr ozdemir/);

    const faelle: Array<[string, string[]]> = [
      ['Ozdemir', ['Kfz-Versicherung 2026']], ['Özdemir', ['Kfz-Versicherung 2026']], ['kfzversicherung', ['Kfz-Versicherung 2026']],
      ['Strasse', ['Stromvertrag']], ['gebuhr', ['Stromvertrag']], ['strom', ['Stromvertrag']], ['Fahrrad', []], ['100%', []],
    ];
    for (const [s, erwartet] of faelle) assert.deepEqual(await suche(s), erwartet, s);

    // Ändern: der Suchtext folgt (auch wenn nur ein Wert sich ändert).
    await d.mappen.aendereMappe(b.id, { werte: { notiz: 'Abschlag fürs Wasser' } });
    assert.deepEqual(await suche('Strasse'), []);
    assert.deepEqual(await suche('wasser'), ['Stromvertrag']);
    // Passwörter (verschlüsselt, „dms1$“) stehen nie im Suchtext und werden nicht gefunden.
    await sql`UPDATE mappen SET werte = werte || ${sql.json({ von: 'dms1$geheimwort' })} WHERE id = ${b.id}`;
    const [y] = await sql`SELECT suchtext FROM mappen WHERE id = ${b.id}`;
    assert.doesNotMatch(y.suchtext as string, /geheimwort|dms1/);
    assert.deepEqual(await suche('geheimwort'), []);

    // Seit #740 nie leer (Migration 075): NOT NULL, auch an einem abgeschalteten Trigger vorbei nicht.
    await sql`ALTER TABLE mappen DISABLE TRIGGER mappen_suchtext`;
    await assert.rejects(sql`UPDATE mappen SET suchtext = NULL`, /null value|NOT NULL|not-null/i);
    await sql`ALTER TABLE mappen ENABLE TRIGGER mappen_suchtext`;
    // Ohne Trigger angelegt: leer statt NULL – der Trigger füllt ihn beim nächsten Schreiben.
    const [z] = await sql`SELECT column_default, is_nullable FROM information_schema.columns WHERE table_name = 'mappen' AND column_name = 'suchtext'`;
    assert.equal(z.is_nullable, 'NO');
    assert.match(String(z.column_default), /''/);
  });

  it('Mappen lesen den Suchtext nie mit; Sicherung und Papierkorb lassen ihn weg, Wiederherstellen füllt ihn neu', async () => {
    const { sql, d, typ, suche } = await aufbau();
    const { MAPPEN_SPALTEN } = await import('../src/repo-pg');
    const { OHNE_SPALTEN } = await import('../src/datenbankabzug');
    const spalten = (await sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'mappen' AND column_name <> 'suchtext'`).map((z) => z.column_name as string);
    assert.deepEqual([...spalten].sort(), [...MAPPEN_SPALTEN].sort(), 'neue Spalten fallen hier auf');
    assert.ok(OHNE_SPALTEN.mappen?.includes('suchtext'));

    const m = await d.mappen.legeMappeAn({ typId: typ.id, werte: { titel: 'Heizöl Lieferung' } });
    assert.equal('suchtext' in (await d.mappen.holeMappe(m.id)).mappe, false);
    await d.loeschen.loescheMappe(m.id);
    const [k] = await sql`SELECT mappe ? 'suchtext' AS mit FROM papierkorb WHERE id = ${m.id}`;
    assert.equal(k.mit, false);
    await d.papierkorbVerwaltung.stelleWiederHer(m.id, ICH, true);
    const [z] = await sql`SELECT suchtext FROM mappen WHERE id = ${m.id}`;
    assert.match(z.suchtext as string, /heizol lieferung/);
    assert.deepEqual(await suche('Heizol'), ['Heizöl Lieferung']);
  });

  it('ohne Warten auf die Platte nur außerhalb einer Transaktion', async () => {
    const { sql } = await aufbau();
    const { ohneWarten } = await import('../src/repo-pg');
    const [a] = await sql`SELECT current_setting('synchronous_commit') AS v FROM ${ohneWarten(sql)}`;
    assert.equal(a.v, 'off');
    const [b] = await sql`SELECT current_setting('synchronous_commit') AS v`;
    assert.equal(b.v, 'on', 'gilt nur für die eine Anweisung');
    await sql.begin(async (tx) => {
      const [c] = await tx`SELECT current_setting('synchronous_commit') AS v FROM ${ohneWarten(tx as unknown as postgres.Sql)}`;
      assert.equal(c.v, 'on', 'in einer Transaktion unverändert');
    });
  });
});

/**
 * „Zuletzt geöffnet“ (#334) in einem Zugriff (#615): vorn, ohne Doppelte, höchstens 10, Fremdes in der Liste fällt weg.
 * Seit #940 je Eintrag mit Zeitpunkt; frühere Einträge (nur die Id) bleiben lesbar.
 */
async function pruefeMerkeVorn(k: KontoRepo, id: string) {
  const roh = async () => (await k.einstellungen(id)).zuletzt_geoeffnet;
  const liste = async () => zuletztListe(await roh()).map((x) => x.id);
  const m = (i: number) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
  await k.merkeVorn(id, 'zuletzt_geoeffnet', m(1), 10);
  assert.deepEqual(await liste(), [m(1)]);
  assert.match(zuletztListe(await roh())[0].am ?? '', /^\d{4}-\d\d-\d\dT/, 'mit Zeitpunkt (#940)');
  for (let i = 2; i <= 12; i++) await k.merkeVorn(id, 'zuletzt_geoeffnet', m(i), 10);
  assert.deepEqual(await liste(), [12, 11, 10, 9, 8, 7, 6, 5, 4, 3].map(m));
  await k.merkeVorn(id, 'zuletzt_geoeffnet', m(5), 10);
  assert.deepEqual(await liste(), [5, 12, 11, 10, 9, 8, 7, 6, 4, 3].map(m));
  const vorher = await roh();
  await k.merkeVorn(id, 'zuletzt_geoeffnet', m(5), 10);
  assert.deepEqual(await roh(), vorher, 'schon vorn und gerade eben: bleibt, auch der Zeitpunkt');
  await k.setzeEinstellung(id, 'zuletzt_geoeffnet', [m(1), 7, null, m(2)]);
  await k.merkeVorn(id, 'zuletzt_geoeffnet', m(2), 10);
  assert.deepEqual(await liste(), [m(2), m(1)], 'nur Texte');
  assert.equal((await roh() as unknown[])[1], m(1), 'frühere Einträge bleiben, wie sie waren');
  await k.setzeEinstellung(id, 'zuletzt_geoeffnet', 'kaputt');
  await k.merkeVorn(id, 'zuletzt_geoeffnet', m(3), 10);
  assert.deepEqual(await liste(), [m(3)]);
  // Vorn, aber vor mehr als einer Minute: neuer Zeitpunkt.
  await k.setzeEinstellung(id, 'zuletzt_geoeffnet', [{ id: m(3), am: '2026-01-01T10:00:00.000Z' }, m(4)]);
  await k.merkeVorn(id, 'zuletzt_geoeffnet', m(3), 10);
  const neu = zuletztListe(await roh());
  assert.deepEqual(neu.map((x) => x.id), [m(3), m(4)]);
  assert.notEqual(neu[0].am, '2026-01-01T10:00:00.000Z');
}

describe('Zuletzt geöffnet in einem Zugriff (#615)', () => {
  it('im Arbeitsspeicher', async () => {
    await pruefeMerkeVorn(speicherKontoRepo(), ICH.id);
  });
  it('in PostgreSQL', { skip: !process.env.TEST_DATABASE_URL && 'ohne TEST_DATABASE_URL' }, async () => {
    const sql = await datenbank();
    const { pgKontoRepo } = await import('../src/konto-repo');
    const k = pgKontoRepo(sql, HAUSHALT);
    await sql`INSERT INTO benutzer (id, haushalt_id, email, name, rolle) VALUES (${ICH.id}, ${HAUSHALT}, ${ICH.email}, 'Lena', 'admin')`;
    await pruefeMerkeVorn(k, ICH.id);
  });
});

describe('Startseite (#334, #615): „noch keine eigene Mappe“ ohne alles zu zählen', () => {
  it('im Arbeitsspeicher', async () => {
    const d = new Dienst(speicherRepo(), speicherDateien(), { einstellungen: speicherEinstellungen() });
    assert.equal(await d.dokumente.ohneEigeneMappen(), true);
    const typ = await d.mappentypen.legeTypAn({ name: 'Vertrag', felder: [{ key: 'name', label: 'Name', typ: 'text' }] });
    assert.equal(await d.dokumente.ohneEigeneMappen(), true);
    await d.mappen.legeMappeAn({ typId: typ.id, werte: { name: 'Strom' } });
    assert.equal(await d.dokumente.ohneEigeneMappen(), false);
  });
});
