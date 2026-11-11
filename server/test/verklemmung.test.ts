/**
 * Verklemmung im Wörterverzeichnis (#575): Gleichzeitig angelegte Mappen und gespeicherte Ergebnisse der
 * Texterkennung dürfen sich in der Datenbank nicht gegenseitig blockieren (Deadlock) – sonst bricht PostgreSQL
 * einen Vorgang ab und das Ergebnis der Texterkennung ginge verloren. Nur mit TEST_DATABASE_URL.
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, describe, it } from 'node:test';
import type postgres from 'postgres';
import { speicherDateien } from '../src/dateispeicher';
import { Dienst } from '../src/dienst';
import { speicherEinstellungen } from '../src/einstellungen';
import { NICHT_GESPEICHERT } from '../../shared/src/volltext';
import { protokoll } from '../src/protokoll';
import type { Repo } from '../src/repo';
import { Texterkennung } from '../src/texterkennung';
import { pdfMitText } from './hilfen';

const HAUSHALT = '00000000-0000-4000-8000-000000000001';
const offen: Array<() => Promise<void>> = [];
after(async () => { for (const f of offen) await f(); });

async function aufbau() {
  const { ausUrl, alsUrl, legeDatenbankAn } = await import('../src/anbindung');
  const { verbinde, migriere } = await import('../src/db');
  const { pgRepo } = await import('../src/repo-pg');
  const a = { ...ausUrl(process.env.TEST_DATABASE_URL)!, datenbank: `dms_verklemmung_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}` };
  await legeDatenbankAn(a);
  const sql = verbinde(alsUrl(a), 20);
  offen.push(async () => {
    await sql.end();
    const admin = verbinde(alsUrl(a, 'postgres'));
    await admin.unsafe(`DROP DATABASE IF EXISTS "${a.datenbank}" WITH (FORCE)`).catch(() => {});
    await admin.end();
  });
  await migriere(sql, new URL('../migrations', import.meta.url).pathname, () => {});
  const r = pgRepo(sql, HAUSHALT) as Repo;
  const dateien = speicherDateien();
  const einstellungen = speicherEinstellungen();
  const d = new Dienst(r, dateien, { einstellungen });
  const typ = await d.mappentypen.legeTypAn({ name: 'Brief', titelVorlage: '{titel}', felder: [{ key: 'titel', label: 'Titel', typ: 'text', pflicht: true }, { key: 'text', label: 'Text', typ: 'text' }] });
  return { r, d, sql: sql as postgres.Sql, typ, dateien, einstellungen };
}

/** Wortschatz, den Mappen und Volltexte teilen – in jedem Vorgang anders gemischt. */
const WOERTER = Array.from({ length: 400 }, (_, i) => `wort${String.fromCharCode(97 + (i % 26))}${String.fromCharCode(97 + Math.floor(i / 26) % 26)}x${i}`);
const text = (n: number) => Array.from({ length: n }, () => WOERTER[Math.floor(Math.random() * WOERTER.length)]).join(' ');

const warte = async (bis: () => Promise<boolean>, ms = 30_000) => {
  const ende = Date.now() + ms;
  while (!(await bis())) {
    if (Date.now() > ende) throw new Error('Zeit abgelaufen');
    await new Promise((r) => setTimeout(r, 50));
  }
};
const neueVersuche = (seit: number) => protokoll.eintraege({ seit, suche: 'neuer Versuch' }).length;

describe('Verklemmung im Wörterverzeichnis (#575)', { skip: !process.env.TEST_DATABASE_URL && 'ohne TEST_DATABASE_URL' }, () => {
  it('viele gleichzeitige Mappen und Ergebnisse der Texterkennung: keine Verklemmung, alle Dokumente mit Volltext', async () => {
    const { r, d, sql, typ } = await aufbau();
    const m = await d.mappen.legeMappeAn({ typId: typ.id, werte: { titel: 'Stapel' } });
    const dokumente: string[] = [];
    for (let i = 0; i < 40; i++) dokumente.push((await d.dokumente.ladeHoch(m.id, { register: 'dokumente', name: `s${i}.txt`, typ: 'text/plain' }, Buffer.from(`s${i}`), null)).dokument.id);
    const seit = protokoll.letzteNr;
    const fehler: string[] = [];
    const arbeit: Array<Promise<unknown>> = [];
    // Wie Demo-Daten oder ein Import (viele Mappen in einer Transaktion) neben einem Stapel Scans.
    for (const id of dokumente) arbeit.push(r.ocrSetze(id, { stand: 'fertig', text: text(300), seiten: 1, info: 'Test' }).catch((e) => { fehler.push(`Texterkennung: ${(e as Error).message}`); }));
    for (let i = 0; i < 20; i++) {
      arbeit.push(r.legeMappenAn(Array.from({ length: 20 }, () => ({ id: randomUUID(), typId: typ.id, werte: { titel: text(3), text: text(30) }, titel: text(3), benutzerId: null, demo: true, verweise: [] })))
        .catch((e) => { fehler.push(`Mappen: ${(e as Error).message}`); }));
      arbeit.push(d.mappen.legeMappeAn({ typId: typ.id, werte: { titel: text(3), text: text(30) } }).catch((e) => { fehler.push(`Mappe: ${(e as Error).message}`); }));
    }
    await Promise.all(arbeit);
    assert.deepEqual(fehler, []);
    // Nicht nur durch Wiederholen gerettet: Es gab gar keine Verklemmung.
    assert.equal(neueVersuche(seit), 0, 'kein Abbruch durch die Datenbank');
    for (const id of dokumente) {
      const dok = await r.holeDokument(id);
      assert.equal(dok?.ocr?.stand, 'fertig');
      assert.ok((await d.volltexte.volltext(id)).text!.length > 0, 'Volltext da');
    }
    // Der Eingang landet vollständig im Wörterverzeichnis – mit denselben Wörtern wie ein Neuaufbau aus dem Bestand
    // (die Zahlen je Wort wachsen bei Änderungen nur, wie bisher).
    assert.ok(await d.suche.woerterEinarbeiten() > 0);
    assert.equal((await sql`SELECT count(*)::int AS n FROM suchwoerter_eingang`)[0].n, 0);
    const woerter = async () => (await sql`SELECT wort FROM suchwoerter WHERE haushalt_id = ${HAUSHALT} ORDER BY wort`).map((z) => z.wort as string);
    const eingearbeitet = await woerter();
    assert.ok(eingearbeitet.length > 400);
    await r.woerterNeu();
    assert.deepEqual(await woerter(), eingearbeitet);
    assert.equal(await d.suche.woerterEinarbeiten(), 0, 'nichts mehr offen');
  });

  it('wiederholt das Speichern, wenn die Datenbank es abbricht (Verklemmung, Serialisierungsfehler)', async () => {
    const { r, d, sql, typ } = await aufbau();
    const m = await d.mappen.legeMappeAn({ typId: typ.id, werte: { titel: 'Brief' } });
    const { dokument } = await d.dokumente.ladeHoch(m.id, { register: 'dokumente', name: 'b.txt', typ: 'text/plain' }, Buffer.from('b'), null);
    // Erzwungener Abbruch: die ersten beiden Versuche als Verklemmung, der dritte als Serialisierungsfehler.
    // Die Sequenz zählt auch über zurückgerollte Versuche weiter.
    await sql.unsafe(`
      CREATE SEQUENCE abbruch_nr;
      CREATE FUNCTION abbruch() RETURNS trigger LANGUAGE plpgsql AS $f$
      DECLARE n bigint := nextval('abbruch_nr');
      BEGIN
        IF n <= 2 THEN RAISE EXCEPTION 'erzwungene Verklemmung' USING ERRCODE = 'deadlock_detected'; END IF;
        IF n = 3 THEN RAISE EXCEPTION 'erzwungener Serialisierungsfehler' USING ERRCODE = 'serialization_failure'; END IF;
        RETURN NEW;
      END $f$;
      CREATE TRIGGER abbruch BEFORE UPDATE OF volltext ON dokumente FOR EACH ROW EXECUTE FUNCTION abbruch();`);
    const seit = protokoll.letzteNr;
    await r.ocrSetze(dokument.id, { stand: 'fertig', text: 'Kontoauszug der Sparkasse', seiten: 1, info: 'Test' });
    assert.equal((await d.volltexte.volltext(dokument.id)).text!, 'Kontoauszug der Sparkasse');
    assert.equal(neueVersuche(seit), 3);
    // Auch innerhalb einer Transaktion (Sicherungspunkt): Die Transaktion übersteht den Abbruch.
    await sql`ALTER SEQUENCE abbruch_nr RESTART`;
    const zweite = (await d.dokumente.ladeHoch(m.id, { register: 'dokumente', name: 'c.txt', typ: 'text/plain' }, Buffer.from('c'), null)).dokument;
    await r.transaktion(async (tx) => { await tx.ocrSetze(zweite.id, { stand: 'fertig', text: 'Zweiter Brief', seiten: 1 }); });
    assert.equal((await d.volltexte.volltext(zweite.id)).text!, 'Zweiter Brief');
    // Andere Fehler werden nicht wiederholt.
    await sql.unsafe(`CREATE OR REPLACE FUNCTION abbruch() RETURNS trigger LANGUAGE plpgsql AS $f$ BEGIN RAISE EXCEPTION 'kaputt'; END $f$`);
    const vorher = protokoll.letzteNr;
    await assert.rejects(r.ocrSetze(dokument.id, { stand: 'fertig', text: 'y', seiten: 1 }), /kaputt/);
    assert.equal(neueVersuche(vorher), 0);
  });

  it('scheitert das Speichern endgültig, bleibt es sichtbar: Stand „Fehler“ mit Hinweis, Protokoll, erneut versuchen', async () => {
    const { r, d, sql, typ, dateien, einstellungen } = await aufbau();
    const t = new Texterkennung(r, dateien, einstellungen, async () => ({ text: 'Stromrechnung der Stadtwerke', seiten: 1, info: 'Ersatz' }), async () => ({ pdftotext: true, pdftoppm: true }));
    d.dokumente.verbindeTexterkennung(t);
    await sql.unsafe(`
      CREATE FUNCTION abbruch() RETURNS trigger LANGUAGE plpgsql AS $f$
      BEGIN RAISE EXCEPTION 'erzwungene Verklemmung' USING ERRCODE = 'deadlock_detected'; END $f$;
      CREATE TRIGGER abbruch BEFORE UPDATE OF volltext ON dokumente FOR EACH ROW EXECUTE FUNCTION abbruch();`);
    const seit = protokoll.letzteNr;
    const m = await d.mappen.legeMappeAn({ typId: typ.id, werte: { titel: 'Strom' } });
    const { dokument } = await d.dokumente.ladeHoch(m.id, { register: 'dokumente', name: 'strom.pdf', typ: 'application/pdf' }, pdfMitText(['Strom']), null);
    await warte(async () => (await r.holeDokument(dokument.id))?.ocr?.stand === 'fehler');
    const dok = (await r.holeDokument(dokument.id))!;
    assert.ok(dok.ocr!.info!.startsWith(NICHT_GESPEICHERT), dok.ocr!.info!);
    assert.equal(neueVersuche(seit), 4, 'erst nach allen Versuchen aufgegeben');
    assert.equal(protokoll.eintraege({ seit, stufe: 'error', suche: 'nicht gespeichert' }).length, 1);
    assert.equal((await t.status()).zaehler.fehler, 1);
    // Datenbank wieder frei: „Fehlgeschlagene erneut“ bringt den Volltext.
    await sql`DROP TRIGGER abbruch ON dokumente`;
    assert.deepEqual(await t.fehlerNeuStarten('test'), { eingereiht: 1 });
    await warte(async () => (await r.holeDokument(dokument.id))?.ocr?.stand === 'fertig');
    assert.equal((await d.volltexte.volltext(dokument.id)).text!.trim(), 'Stromrechnung der Stadtwerke');
    t.stop();
  });
});
