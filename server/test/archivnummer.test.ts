/**
 * Archivnummer (#345): Nummer des Papieroriginals am Dokument, eindeutig je Haushalt; Aufkleber mit
 * Code 128; Suche nach der Nummer (auch mit Präfix vom Handscanner). Arbeitsspeicher und – mit
 * TEST_DATABASE_URL – PostgreSQL.
 */
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { PDFDocument } from 'pdf-lib';
import { CODE128_MUSTER, code128Breiten, code128Werte } from '../src/aufkleber';
import { speicherDateien } from '../src/dateispeicher';
import { Dienst } from '../src/dienst';
import { speicherEinstellungen } from '../src/einstellungen';
import { Fachfehler } from '../src/fehler';
import type { Repo } from '../src/repo';
import { speicherRepo } from '../src/repo-speicher';

const ANNA = '00000000-0000-4000-8000-0000000000bb';
const HAUSHALT = '00000000-0000-4000-8000-000000000001';
const status = (s: number, text?: RegExp) => (e: unknown) => e instanceof Fachfehler && e.status === s && (!text || text.test(e.message));

const offen: Array<{ end(): Promise<void> }> = [];
async function repo(pg: boolean): Promise<Repo> {
  if (!pg) return speicherRepo();
  const { ausUrl, alsUrl, legeDatenbankAn } = await import('../src/anbindung');
  const { verbinde, migriere } = await import('../src/db');
  const { pgRepo } = await import('../src/repo-pg');
  const a = { ...ausUrl(process.env.TEST_DATABASE_URL)!, datenbank: `dms_asn_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}` };
  await legeDatenbankAn(a);
  const sql = verbinde(alsUrl(a));
  offen.push(sql);
  await migriere(sql, new URL('../migrations', import.meta.url).pathname, () => {});
  await sql`INSERT INTO haushalte (id, name) VALUES (${HAUSHALT}, 'Test') ON CONFLICT DO NOTHING`;
  await sql`INSERT INTO benutzer (id, haushalt_id, email, name, rolle) VALUES (${ANNA}, ${HAUSHALT}, 'anna@example.org', 'Anna', 'mitglied')`;
  return pgRepo(sql, HAUSHALT) as never;
}

async function aufbau(pg: boolean) {
  const d = new Dienst(await repo(pg), speicherDateien(), { einstellungen: speicherEinstellungen() });
  const typ = await d.legeTypAn({ name: 'Beleg', titelVorlage: '{nr}', felder: [{ key: 'nr', label: 'Nr', typ: 'text' }], register: [
    { key: 'allgemein', name: 'Allgemein', art: 'felder', felder: ['nr'] },
    { key: 'dokumente', name: 'Dokumente', art: 'dokumente' },
  ] });
  const m = await d.legeMappeAn({ typId: typ.id, werte: { nr: 'Rechnung' } }, ANNA);
  const a = (await d.ladeHoch(m.id, { register: 'dokumente', name: 'a.pdf' }, Buffer.from('%PDF-1.4 a'), ANNA)).dokument;
  const b = (await d.ladeHoch(m.id, { register: 'dokumente', name: 'b.pdf' }, Buffer.from('%PDF-1.4 b'), ANNA)).dokument;
  return { d, m, a, b };
}

describe('Code 128 (#345)', () => {
  it('Tabelle: 106 Zeichen mit je 11 Modulen, Stopp mit 13, alle verschieden', () => {
    assert.equal(CODE128_MUSTER.length, 107);
    CODE128_MUSTER.slice(0, 106).forEach((m, i) => assert.equal([...m].reduce((s, x) => s + Number(x), 0), 11, `Wert ${i}`));
    assert.equal([...CODE128_MUSTER[106]].reduce((s, x) => s + Number(x), 0), 13);
    assert.equal(new Set(CODE128_MUSTER).size, 107);
  });
  it('Zeichensatz B mit Prüfzeichen', () => {
    // „A“ = 33; Prüfzeichen (104 + 33) mod 103 = 34
    assert.deepEqual(code128Werte('A'), [104, 33, 34, 106]);
    // „AB“: (104 + 33·1 + 34·2) mod 103 = 205 mod 103 = 102
    assert.deepEqual(code128Werte('AB'), [104, 33, 34, 102, 106]);
    assert.equal(code128Breiten('A').length, 6 * 3 + 7);
    assert.throws(() => code128Werte('Ä'));
  });
});

for (const pg of [false, ...(process.env.TEST_DATABASE_URL ? [true] : [])]) {
  describe(`Archivnummer (#345, ${pg ? 'PostgreSQL' : 'Arbeitsspeicher'})`, () => {
    after(async () => { for (const s of offen.splice(0)) await s.end(); });

    it('setzen, eindeutig ohne Groß-/Kleinschreibung, entfernen; Historie', async () => {
      const { d, m, a, b } = await aufbau(pg);
      assert.equal((await d.setzeArchivnummer(a.id, ' DMS-ASN:A-000001 ', ANNA)).archivnummer, 'A-000001');
      await assert.rejects(d.setzeArchivnummer(b.id, 'a-000001', ANNA), status(409, /schon ein anderes Dokument/));
      await assert.rejects(d.setzeArchivnummer(b.id, 'A 1', ANNA), status(422));
      assert.equal((await d.holeMappe(m.id)).dokumente.find((x) => x.id === a.id)?.archivnummer, 'A-000001');
      assert.ok((await d.historie(m.id)).some((h) => h.art === 'archivnummer' && h.daten.neu === 'A-000001'));
      assert.equal((await d.setzeArchivnummer(a.id, '', ANNA)).archivnummer, null);
      assert.equal((await d.setzeArchivnummer(b.id, 'A-000001', ANNA)).archivnummer, 'A-000001');
    });

    it('finden mit Präfix vom Handscanner; unbekannt → 404', async () => {
      const { d, m, a } = await aufbau(pg);
      await d.setzeArchivnummer(a.id, 'A-000007', ANNA);
      const r = await d.findeArchivnummer('DMS-ASN:a-000007');
      assert.equal(r.dokument.id, a.id);
      assert.equal(r.mappeId, m.id);
      await assert.rejects(d.findeArchivnummer('A-999999'), status(404));
    });

    it('Aufkleber ziehen fortlaufende Nummern; der Kreis lässt sich nicht löschen', async () => {
      const { d } = await aufbau(pg);
      const r = await d.archivAufkleber({ anzahl: 42, etikett: '48x25', start: 3 }, 'admin');
      assert.equal(r.erste, 'A-000001');
      assert.equal(r.letzte, 'A-000042');
      assert.equal((await PDFDocument.load(r.pdf)).getPageCount(), 2, '38 auf Bogen 1 (ab Feld 3), 4 auf Bogen 2');
      assert.equal((await d.archivAufkleber({ anzahl: 1 }, 'admin')).erste, 'A-000043', 'gedruckte Nummern gelten als vergeben');
      await assert.rejects(d.archivAufkleber({ anzahl: 1, etikett: '48x25', start: 41 }, 'admin'), status(422));
      await assert.rejects(d.archivAufkleber({ anzahl: 0 }, 'admin'), status(422));
      await assert.rejects(d.loescheNummernkreis('archivnummer', 'admin'), status(409));
    });

    it('Wiederherstellen aus dem Papierkorb: inzwischen vergebene Nummer entfällt', async () => {
      const { d, a, b } = await aufbau(pg);
      await d.setzeArchivnummer(a.id, 'A-000005', ANNA);
      await d.loescheDokument(a.id, ANNA);
      await d.setzeArchivnummer(b.id, 'A-000005', ANNA);
      const r = await d.stelleDokumentWiederHer(a.id, { id: ANNA, rolle: 'mitglied' }, undefined);
      assert.equal(r.dokument.archivnummer ?? null, null);
    });
  });
}
