/**
 * Löschprotokoll (#470): Einträge bei jedem Löschweg (einzeln, mehrere, mit verknüpften Mappen, „Darf weg“,
 * Dokument, Papierkorb endgültig von Hand und automatisch, ausgeschalteter Papierkorb, Schnittstelle), Wiederherstellen,
 * keine Titel, Feldwerte oder Dateinamen, Prüfsummen, Filter, Ausgabe, eigene Aufbewahrung, nicht änderbar.
 * Arbeitsspeicher und – mit TEST_DATABASE_URL – PostgreSQL.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { after, describe, it } from 'node:test';
import { liesAnlass, liesFilter, nummerVon, passt, type LoeschEintrag } from '../../shared/src/loeschprotokoll';
import { speicherDateien } from '../src/dateispeicher';
import { Dienst } from '../src/dienst';
import { speicherEinstellungen } from '../src/einstellungen';
import type { Repo } from '../src/repo';
import { speicherRepo } from '../src/repo-speicher';
import { EXPORT_TABELLEN } from '../src/vollexport';
import { DATENSCHUTZ_STANDARD } from '../../shared/src/auskunft';
import { loeschkonzept } from '../../shared/src/loeschkonzept';

const ANNA = '00000000-0000-4000-8000-0000000000bb';
const anna = { id: ANNA, rolle: 'mitglied' };
const admin = { id: '00000000-0000-4000-8000-0000000000aa', rolle: 'admin' };
const HAUSHALT = '00000000-0000-4000-8000-000000000001';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
/** Was nie im Protokoll stehen darf. */
const GEHEIM = ['Erika Mustermann', 'DE02120300000000202051', 'mietvertrag-mustermann.pdf', 'Kündigung Mustermann', 'Notiz zu Erika'];

const offen: Array<{ end(): Promise<void> }> = [];
const datenbanken: string[] = [];
let pgSql: import('postgres').Sql | null = null;
async function repo(pg: boolean): Promise<Repo> {
  if (!pg) return speicherRepo();
  const { ausUrl, alsUrl, legeDatenbankAn } = await import('../src/anbindung');
  const { verbinde, migriere } = await import('../src/db');
  const { pgRepo } = await import('../src/repo-pg');
  const a = { ...ausUrl(process.env.TEST_DATABASE_URL)!, datenbank: `dmstest_g7_lp_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}` };
  await legeDatenbankAn(a);
  datenbanken.push(a.datenbank);
  const sql = verbinde(alsUrl(a));
  offen.push(sql);
  pgSql = sql;
  await migriere(sql, new URL('../migrations', import.meta.url).pathname, () => {});
  await sql`INSERT INTO haushalte (id, name) VALUES (${HAUSHALT}, 'Test') ON CONFLICT DO NOTHING`;
  await sql`INSERT INTO benutzer (id, haushalt_id, email, name, rolle) VALUES (${ANNA}, ${HAUSHALT}, 'anna@example.org', 'Anna', 'mitglied')`;
  await sql`INSERT INTO benutzer (id, haushalt_id, email, name, rolle) VALUES (${admin.id}, ${HAUSHALT}, 'admin@example.org', 'Admin', 'admin')`;
  return pgRepo(sql, HAUSHALT) as never;
}

async function aufbau(pg: boolean) {
  const einstellungen = speicherEinstellungen();
  const d = new Dienst(await repo(pg), speicherDateien(), { einstellungen });
  await d.speichereNummernkreis({ neu: true, schluessel: 'mieter', name: 'Mieternummern', muster: 'M-{zaehler:4}', start: 1 }, 'test');
  const mieter = await d.legeTypAn({ name: 'Mieter', titelVorlage: '{name}', felder: [
    { key: 'nr', label: 'Mieternummer', typ: 'text', standard: '{nummernkreis:mieter}' },
    { key: 'name', label: 'Name', typ: 'text', pflicht: true }, { key: 'iban', label: 'IBAN', typ: 'text' },
  ] });
  const vertrag = await d.legeTypAn({ name: 'Mietvertrag', titelVorlage: '{titel}', felder: [
    { key: 'titel', label: 'Titel', typ: 'text' }, { key: 'mieter', label: 'Mieter', typ: 'referenz', zielTyp: mieter.id, verweisart: 'zugehoerigkeit' },
  ] });
  const m = await d.legeMappeAn({ typId: mieter.id, werte: { name: 'Erika Mustermann', iban: 'DE02120300000000202051' } }, ANNA);
  const v = await d.legeMappeAn({ typId: vertrag.id, werte: { titel: 'Kündigung Mustermann', mieter: m.id } }, ANNA);
  const dok = (await d.ladeHoch(v.id, { register: 'dokumente', name: 'mietvertrag-mustermann.pdf', typ: 'application/pdf' }, Buffer.from('%PDF-1.4 vertrag'), ANNA)).dokument;
  await d.legeNotizAn(v.id, 'Notiz zu Erika', ANNA);
  return { d, mieter, vertrag, m, v, dok, einstellungen };
}

const alle = async (d: Dienst, f: Record<string, unknown> = {}) => (await d.loeschprotokoll(f)).eintraege;
const ohneGeheimes = (l: LoeschEintrag[]) => { const t = JSON.stringify(l); for (const g of GEHEIM) assert.ok(!t.includes(g), `nicht im Löschprotokoll: ${g}`); };

describe('Löschprotokoll: Hilfsfunktionen (#470)', () => {
  it('Löschkonzept, Abschnitt 8 „Nachweis“, verweist auf das Löschprotokoll', () => {
    const q = { typen: [], datenschutz: DATENSCHUTZ_STANDARD, papierkorbTage: 30, historieTage: 365, auskunftTage: 7, sicherung: null, version: '1', stand: '2026-11-01', mandant: '' };
    const acht = (x: typeof q & { loeschprotokoll?: { jahre: number } }) => JSON.stringify(loeschkonzept(x).abschnitte.find((a) => a.titel.startsWith('8.')));
    assert.match(acht({ ...q, loeschprotokoll: { jahre: 10 } }), /Löschprotokoll.*nach 10 Jahren automatisch gekürzt/);
    assert.doesNotMatch(acht(q), /Löschprotokoll/);
  });

  it('liest Grund und Filter, Nummer aus dem Nummernkreis', () => {
    assert.deepEqual(liesAnlass({ grund: 'verlangen', grundText: '  Anfrage  vom 3.11. ' }), { grund: 'verlangen', text: 'Anfrage vom 3.11.' });
    assert.deepEqual(liesAnlass({ grund: 'quatsch' }), { grund: null, text: '' });
    assert.equal(liesAnlass({ text: 'x'.repeat(500) }).text?.length, 200);
    const f = liesFilter({ von: '2026-11-01', bis: 'gestern', grund: 'ohne', schritt: 'endgueltig', max: '99999' });
    assert.deepEqual([f.von, f.bis, f.grund, f.schritt, f.max], ['2026-11-01', undefined, 'ohne', 'endgueltig', 2000]);
    assert.equal(nummerVon({ felder: [{ key: 'nr', label: 'Nr', typ: 'text', standard: '{nummernkreis:r}' }, { key: 'x', label: 'X', typ: 'text' }] }, { nr: 'R-1', x: 'geheim' }), 'R-1');
    assert.equal(nummerVon({ felder: [{ key: 'x', label: 'X', typ: 'text' }] }, { x: 'geheim' }), null);
    const e = { zeit: '2026-11-01T10:00:00Z', sha256: 'a'.repeat(64), nummer: 'M-0001', archivnummer: null, mappeId: 'm', dokumentId: 'd', grund: null } as unknown as LoeschEintrag;
    assert.ok(passt(e, { suche: 'A'.repeat(64) }) && passt(e, { suche: 'm-00' }) && !passt(e, { suche: 'b'.repeat(64) }) && passt(e, { grund: 'ohne' }));
  });
});

for (const pg of [false, ...(process.env.TEST_DATABASE_URL ? [true] : [])]) {
  describe(`Löschprotokoll (#470, ${pg ? 'PostgreSQL' : 'Arbeitsspeicher'})`, () => {
    after(async () => {
      for (const s of offen.splice(0)) await s.end();
      if (pg && datenbanken.length) {
        const { ausUrl, alsUrl } = await import('../src/anbindung');
        const { verbinde } = await import('../src/db');
        const s = verbinde(alsUrl({ ...ausUrl(process.env.TEST_DATABASE_URL)!, datenbank: 'postgres' }));
        for (const n of datenbanken.splice(0)) await s.unsafe(`DROP DATABASE IF EXISTS "${n}"`);
        await s.end();
      }
    });

    it('Mappe einzeln: Papierkorb, dann endgültig – mit Grund, Nummer und Prüfsummen, ohne Inhalte', async () => {
      const { d, mieter, vertrag, m, v, dok } = await aufbau(pg);
      await d.loescheMappe(v.id, ANNA, undefined, { grund: 'verlangen', text: 'Anfrage vom 03.11.' });
      let l = await alle(d);
      const mp = l.find((e) => e.art === 'mappe')!;
      assert.equal(mp.schritt, 'papierkorb'); assert.equal(mp.weg, 'einzeln'); assert.equal(mp.typ, 'Mietvertrag'); assert.equal(mp.typId, vertrag.id);
      assert.equal(mp.mappeId, v.id); assert.equal(mp.grund, 'verlangen'); assert.equal(mp.grundText, 'Anfrage vom 03.11.'); assert.equal(mp.vonId, ANNA); assert.equal(mp.ausloeser, 'benutzer');
      assert.deepEqual(mp.anzahl, { dokumente: 1, versionen: 0, notizen: mp.anzahl!.notizen, verweise: 0 });
      const dp = l.find((e) => e.art === 'dokument')!;
      assert.deepEqual([dp.dokumentId, dp.sha256, dp.groesse, dp.mime, dp.schritt], [dok.id, sha('%PDF-1.4 vertrag'), 16, 'application/pdf', 'papierkorb']);
      ohneGeheimes(l);

      // Endgültig von Hand: Grund kommt vom Schritt „in den Papierkorb“.
      await d.loescheEndgueltig([v.id], anna);
      l = await alle(d, { schritt: 'endgueltig' });
      assert.deepEqual(l.map((e) => [e.art, e.weg, e.grund, e.grundText]), [['mappe', 'papierkorb', 'verlangen', 'Anfrage vom 03.11.'], ['dokument', 'papierkorb', 'verlangen', 'Anfrage vom 03.11.']]);
      assert.equal(l[1].sha256, sha('%PDF-1.4 vertrag'));

      // Mieter mit Nummer aus dem Nummernkreis; Papierkorb ausgeschaltet → sofort endgültig.
      await d.setzePapierkorbTage(0, ANNA);
      await d.loescheMappe(m.id, ANNA, undefined, { grund: 'nicht_noetig' });
      const [mi] = await alle(d, { typId: mieter.id });
      assert.deepEqual([mi.schritt, mi.nummer, mi.grund], ['endgueltig', 'M-0001', 'nicht_noetig']);
      assert.equal((await alle(d, { suche: 'm-0001' })).length, 1, 'Suche nach Nummer');
      assert.equal((await alle(d, { suche: sha('%PDF-1.4 vertrag') })).length, 2, 'Suche nach Prüfsumme: Papierkorb und endgültig');
      ohneGeheimes(await alle(d));
    });

    it('mit verknüpften Mappen: ein Vorgang mit Start-Mappe; Wiederherstellen; Ablauf automatisch', async () => {
      const { d, m, v } = await aufbau(pg);
      const z = await d.zugriff(admin);
      const vorschau = await d.loeschVorschau(m.id, {}, z);
      const r = await d.loescheMitVerknuepften(m.id, { auswahl: vorschau.vorschlag, grund: 'verlangen' }, admin.id, z);
      const l = await alle(d, { vorgang: r.vorgang, art: 'mappe' });
      assert.equal(l.length, 2);
      assert.ok(l.every((e) => e.vorgang === r.vorgang && e.startId === m.id && e.weg === 'verknuepft' && e.grund === 'verlangen'));
      ohneGeheimes(await alle(d));

      await d.stelleVorgangWiederHer(r.vorgang, admin, true);
      assert.equal((await alle(d, { schritt: 'wiederhergestellt' })).length, 2);

      // Wieder löschen, dann abgelaufen → automatisch endgültig, Grund übernommen.
      await d.loescheMappe(v.id, ANNA, undefined, { grund: 'frist' });
      await d.raeumePapierkorbAuf(Date.now() + 40 * 24 * 3600 * 1000);
      const [weg] = await alle(d, { schritt: 'endgueltig', art: 'mappe' });
      assert.deepEqual([weg.mappeId, weg.weg, weg.ausloeser, weg.von, weg.grund], [v.id, 'ablauf', 'automatisch', 'DMS', 'frist']);
    });

    it('Dokumente einzeln, ältere Versionen, Papierkorb leeren, Schnittstelle', async () => {
      const { d, v, dok } = await aufbau(pg);
      await d.loescheDokument(dok.id, ANNA, { grund: 'sonstiges', ausloeser: 'api', weg: 'dokument' });
      let [e] = await alle(d, { art: 'dokument' });
      assert.deepEqual([e.schritt, e.weg, e.ausloeser, e.grund, e.mappeId, e.typ], ['papierkorb', 'dokument', 'api', 'sonstiges', v.id, 'Mietvertrag']);
      await d.stelleDokumentWiederHer(dok.id, anna, undefined, true);
      assert.equal((await alle(d, { schritt: 'wiederhergestellt', art: 'dokument' }))[0].sha256, dok.sha256);
      await d.loescheDokument(dok.id, ANNA, { weg: 'dokument' });
      await d.leerePapierkorb(anna);
      [e] = await alle(d, { schritt: 'endgueltig' });
      assert.deepEqual([e.art, e.weg, e.dokumentId], ['dokument', 'leeren', dok.id]);

      // Versionen über die eingestellte Anzahl hinaus.
      const typ = (await d.listeTypen()).find((t) => t.name === 'Mietvertrag')!;
      await d.aendereTyp(typ.id, { ...typ, register: typ.register.map((r) => (r.art === 'dokumente' ? { ...r, versionierung: true, versionenBehalten: 2 } : r)) });
      const neu = (await d.ladeHoch(v.id, { register: 'dokumente', name: 'v.pdf', typ: 'application/pdf' }, Buffer.from('%PDF v1'), ANNA)).dokument;
      for (const x of ['%PDF v2', '%PDF v3']) await d.ladeHoch(v.id, { register: 'dokumente', name: 'v.pdf', typ: 'application/pdf', gleicherName: 'version' }, Buffer.from(x), ANNA);
      const ver = await alle(d, { suche: sha('%PDF v1') });
      assert.deepEqual(ver.map((x) => [x.weg, x.version, x.dokumentId]), [['version', 1, neu.id]]);
    });

    it('nicht änderbar, eigene Aufbewahrung, im Vollexport', async () => {
      const { d, v } = await aufbau(pg);
      await d.loescheMappe(v.id, ANNA);
      assert.equal(await d.loeschprotokollJahre(), 10);
      await assert.rejects(d.setzeLoeschprotokollJahre(0, 'x'));
      assert.equal(await d.setzeLoeschprotokollJahre(2, 'x'), 2);
      assert.equal((await alle(d)).length, 2);
      const csv = (await d.loeschprotokollAusgabe({}, 'csv', { von: 'Admin', mandant: 'Test', version: '0' })).inhalt.toString('utf8');
      assert.match(csv, /^\ufeffZeit;Schritt;Art;Mappentyp;Nummer/);
      assert.equal(csv.trim().split('\r\n').length, 3, 'Kopf und zwei Einträge');
      assert.match(csv, new RegExp(sha('%PDF-1.4 vertrag')));
      for (const g of GEHEIM) assert.ok(!csv.includes(g));
      const pdf = await d.loeschprotokollAusgabe({ schritt: 'papierkorb' }, 'pdf', { von: 'Admin', mandant: 'Test', version: '0' });
      assert.equal(pdf.inhalt.subarray(0, 5).toString(), '%PDF-');
      await d.raeumePapierkorbAuf(Date.now() + 3 * 366 * 24 * 3600 * 1000);
      assert.equal((await alle(d, { schritt: 'papierkorb' })).length, 0, 'nach 2 Jahren weg');
      assert.match(EXPORT_TABELLEN.loeschprotokoll, /loeschprotokoll\.csv/);
      if (pg) {
        await d.loescheMappe((await d.legeMappeAn({ typId: v.typId, werte: { titel: 'x' } }, ANNA)).id, ANNA);
        await assert.rejects(pgSql!`UPDATE loeschprotokoll SET typ_name = 'x'`, /nicht ändern/);
        await assert.rejects(pgSql!`DELETE FROM loeschprotokoll`, /nicht ändern/);
      }
    });
  });
}
