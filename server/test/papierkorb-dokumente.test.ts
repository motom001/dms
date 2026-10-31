/**
 * Papierkorb für einzelne Dokumente (#344): Löschen legt das Dokument samt Versionen und Volltext
 * in den Papierkorb, Wiederherstellen legt es ins selbe Register zurück. Arbeitsspeicher und – wenn
 * TEST_DATABASE_URL gesetzt ist – PostgreSQL.
 */
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { speicherDateien } from '../src/dateispeicher';
import { Dienst } from '../src/dienst';
import { speicherEinstellungen } from '../src/einstellungen';
import { Fachfehler } from '../src/fehler';
import type { Repo } from '../src/repo';
import { speicherRepo } from '../src/repo-speicher';

const ADMIN = { id: '00000000-0000-4000-8000-0000000000aa', rolle: 'admin' };
const ANNA = { id: '00000000-0000-4000-8000-0000000000bb', rolle: 'mitglied' };
const HAUSHALT = '00000000-0000-4000-8000-000000000001';
const status = (s: number) => (e: unknown) => e instanceof Fachfehler && e.status === s;

const offen: Array<{ end(): Promise<void> }> = [];
async function repo(pg: boolean): Promise<Repo> {
  if (!pg) return speicherRepo();
  const { ausUrl, alsUrl, legeDatenbankAn } = await import('../src/anbindung');
  const { verbinde, migriere } = await import('../src/db');
  const { pgRepo } = await import('../src/repo-pg');
  const a = { ...ausUrl(process.env.TEST_DATABASE_URL)!, datenbank: `dms_pkd_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}` };
  await legeDatenbankAn(a);
  const sql = verbinde(alsUrl(a));
  offen.push(sql);
  await migriere(sql, new URL('../migrations', import.meta.url).pathname, () => {});
  await sql`INSERT INTO haushalte (id, name) VALUES (${HAUSHALT}, 'Test') ON CONFLICT DO NOTHING`;
  for (const b of [ADMIN, ANNA]) await sql`INSERT INTO benutzer (id, haushalt_id, email, name, rolle) VALUES (${b.id}, ${HAUSHALT}, ${`${b.rolle}@example.org`}, ${b.rolle}, ${b.rolle})`;
  return pgRepo(sql, HAUSHALT) as never;
}

async function aufbau(pg: boolean) {
  const dateien = speicherDateien();
  const r = await repo(pg);
  const d = new Dienst(r, dateien, { einstellungen: speicherEinstellungen() });
  const typ = await d.legeTypAn({ name: 'Vertrag', titelVorlage: '{nr}', felder: [{ key: 'nr', label: 'Nr', typ: 'text' }], register: [
    { key: 'allgemein', name: 'Allgemein', art: 'felder', felder: ['nr'] },
    { key: 'dokumente', name: 'Unterlagen', art: 'dokumente', versionierung: true },
  ] });
  const m = await d.legeMappeAn({ typId: typ.id, werte: { nr: 'Stromvertrag' } }, ANNA.id);
  const doc = (await d.ladeHoch(m.id, { register: 'dokumente', name: 'Vertrag.pdf' }, Buffer.from('%PDF-1.4 Version 1'), ANNA.id)).dokument;
  await d.ersetzeDokument(doc.id, {}, Buffer.from('%PDF-1.4 Version 2'), ANNA.id);
  return { d, dateien, r, typ, m, doc };
}

for (const pg of [false, ...(process.env.TEST_DATABASE_URL ? [true] : [])]) {
  describe(`Papierkorb für Dokumente (#344, ${pg ? 'PostgreSQL' : 'Arbeitsspeicher'})`, () => {
    after(async () => { for (const s of offen.splice(0)) await s.end(); });

    it('Löschen legt das Dokument mit Versionen in den Papierkorb; Wiederherstellen legt es ins selbe Register zurück', async () => {
      const { d, dateien, m, doc } = await aufbau(pg);
      const vorher = dateien.anzahl();
      assert.deepEqual(await d.loescheDokument(doc.id, ANNA.id), { papierkorb: true });
      assert.equal((await d.holeMappe(m.id)).dokumente.length, 0, 'in der Mappe nicht mehr zu sehen');
      assert.equal(dateien.anzahl(), vorher, 'Dateien bleiben, solange es im Papierkorb liegt');
      assert.equal((await d.zaehler(ANNA)).papierkorb, 1);
      const [e] = await d.papierkorbDokumente(ANNA);
      assert.equal(e.name, 'Vertrag.pdf');
      assert.equal(e.mappeTitel, 'Stromvertrag');
      assert.equal(e.register, 'Unterlagen');
      assert.equal(e.versionen, 1);
      assert.equal(e.mappe, 'da');
      assert.equal(e.geloeschtVon, ANNA.id);
      assert.equal((await d.papierkorbDokumente(ADMIN)).length, 0, 'in der Ablage nur Eigenes');
      assert.equal((await d.papierkorbDokumente(ADMIN, true)).length, 1, 'in der Werkbank alles');
      assert.ok((await d.historie(m.id)).some((h) => h.art === 'dokument_papierkorb'));

      await assert.rejects(d.stelleDokumentWiederHer(doc.id, ADMIN, undefined), status(404), 'Fremdes nur über die Werkbank');
      const r = await d.stelleDokumentWiederHer(doc.id, ANNA, undefined);
      assert.equal(r.dokument.registerKey, 'dokumente');
      assert.equal(r.dokument.version, 2);
      const x = (await d.holeMappe(m.id)).dokumente;
      assert.deepEqual(x.map((y) => y.name), ['Vertrag.pdf']);
      assert.equal((await d.versionen(doc.id)).aeltere.length, 1, 'ältere Version wieder da');
      assert.equal((await d.papierkorbDokumente(ANNA)).length, 0);
      assert.ok((await d.historie(m.id)).some((h) => h.art === 'dokument_wiederhergestellt'));
    });

    it('Mappe im Papierkorb oder weg: erklärt den Weg; endgültig löschen räumt die Dateien auf', async () => {
      const { d, dateien, m, doc } = await aufbau(pg);
      await d.loescheDokument(doc.id, ANNA.id);
      await d.loescheMappe(m.id, ANNA.id);
      assert.equal((await d.papierkorbDokumente(ANNA))[0].mappe, 'papierkorb');
      await assert.rejects(d.stelleDokumentWiederHer(doc.id, ANNA, undefined), (f) => f instanceof Fachfehler && f.status === 409 && /zuerst die Mappe/.test(f.message));
      // Mappe zurück → Dokument zurück.
      await d.stelleWiederHer(m.id, ANNA);
      await d.stelleDokumentWiederHer(doc.id, ANNA, undefined);
      // Endgültig: einzeln.
      await d.loescheDokument(doc.id, ANNA.id);
      assert.equal(await d.loescheDokumentEndgueltig([doc.id], ANNA), 1);
      assert.equal(dateien.anzahl(), 0, 'beide Versionen weg');
      assert.equal((await d.papierkorbDokumente(ANNA)).length, 0);
    });

    it('Mappe endgültig gelöscht: ihre einzeln gelöschten Dokumente gehen mit; Leeren und Ablauf gelten für Dokumente', async () => {
      const { d, dateien, typ, m, doc } = await aufbau(pg);
      await d.loescheDokument(doc.id, ANNA.id);
      await d.loescheMappe(m.id, ANNA.id);
      assert.equal(await d.leerePapierkorb(ANNA), 1, 'eine Mappe (das Dokument hängt an ihr)');
      assert.equal((await d.papierkorbDokumente(ANNA)).length, 0);
      assert.equal(dateien.anzahl(), 0);

      const m2 = await d.legeMappeAn({ typId: typ.id, werte: { nr: 'Zwei' } }, ANNA.id);
      const d2 = (await d.ladeHoch(m2.id, { register: 'dokumente', name: 'a.pdf' }, Buffer.from('%PDF-1.4 a'), ANNA.id)).dokument;
      await d.loescheDokument(d2.id, ANNA.id);
      assert.equal(await d.raeumePapierkorbAuf(Date.now() + 29 * 86_400_000), 0);
      assert.equal((await d.papierkorbDokumente(ANNA)).length, 1, 'noch in der Frist');
      await d.raeumePapierkorbAuf(Date.now() + 31 * 86_400_000);
      assert.equal((await d.papierkorbDokumente(ANNA)).length, 0, 'nach der Frist endgültig weg');

      const d3 = (await d.ladeHoch(m2.id, { register: 'dokumente', name: 'b.pdf' }, Buffer.from('%PDF-1.4 b'), ANNA.id)).dokument;
      await d.loescheDokument(d3.id, ANNA.id);
      assert.equal(await d.leerePapierkorb(ANNA), 1, 'Leeren zählt das Dokument');
    });

    it('ohne Papierkorb (0 Tage) ist Löschen endgültig wie bisher; Ausschalten leert auch die Dokumente', async () => {
      const { d, dateien, m, doc } = await aufbau(pg);
      const d2 = (await d.ladeHoch(m.id, { register: 'dokumente', name: 'zwei.pdf' }, Buffer.from('%PDF-1.4 zwei'), ANNA.id)).dokument;
      await d.loescheDokument(d2.id, ANNA.id);
      assert.equal((await d.papierkorbDokumente(ANNA)).length, 1);
      const r = await d.setzePapierkorbTage(0);
      assert.equal(r.geleert, 1);
      assert.equal((await d.papierkorbDokumente(ANNA)).length, 0);
      assert.deepEqual(await d.loescheDokument(doc.id, ANNA.id), { papierkorb: false });
      assert.equal((await d.papierkorbDokumente(ANNA)).length, 0);
      assert.equal(dateien.anzahl(), 0);
      assert.ok((await d.historie(m.id)).some((h) => h.art === 'dokument_geloescht'));
    });
  });
}
