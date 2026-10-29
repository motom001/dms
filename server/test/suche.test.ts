/** Volltextsuche nach Wortteilen (#161): „Ofen“ findet „Backofen“; Anführungszeichen suchen ganze Wörter. */
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { TREFFER_ANFANG, TREFFER_ENDE } from '../../shared/src/model';
import { teilwoerter } from '../../shared/src/suche';
import { speicherDateien } from '../src/dateispeicher';
import { Dienst } from '../src/dienst';
import { speicherEinstellungen } from '../src/einstellungen';
import { speicherRepo } from '../src/repo-speicher';
import type { Repo } from '../src/repo';

const offen: Array<{ end(): Promise<void> }> = [];
async function repo(pg: boolean): Promise<Repo> {
  if (!pg) return speicherRepo();
  const { ausUrl, alsUrl, legeDatenbankAn } = await import('../src/anbindung');
  const { verbinde, migriere } = await import('../src/db');
  const { pgRepo } = await import('../src/repo-pg');
  const a = { ...ausUrl(process.env.TEST_DATABASE_URL)!, datenbank: `dms_suche_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}` };
  await legeDatenbankAn(a);
  const sql = verbinde(alsUrl(a));
  offen.push(sql);
  await migriere(sql, new URL('../migrations', import.meta.url).pathname, () => {});
  return pgRepo(sql, '00000000-0000-4000-8000-000000000001') as never;
}

describe('Teilwörter (#161)', () => {
  it('nur ohne Anführungszeichen und ab 3 Zeichen', () => {
    assert.deepEqual(teilwoerter('Ofen'), ['ofen']);
    assert.deepEqual(teilwoerter('Ofen Rohr'), ['ofen', 'rohr']);
    assert.equal(teilwoerter('"Ofen"'), null);
    assert.equal(teilwoerter('Ofen ab'), null);
    assert.equal(teilwoerter('Strom -Gas'), null);
  });
});

function faelle(pg: boolean) {
  describe(`Volltext nach Wortteilen (#161)${pg ? ' – PostgreSQL' : ''}`, { skip: pg && !process.env.TEST_DATABASE_URL && 'ohne TEST_DATABASE_URL' }, () => {
    it('findet „Backofen“ mit „Ofen“, Wortformen weiter, ganze Wörter in Anführungszeichen', async () => {
      const r = await repo(pg);
      const d = new Dienst(r, speicherDateien(), { einstellungen: speicherEinstellungen() });
      const typ = await d.legeTypAn({ name: 'Gerät', titelVorlage: '{nr}', felder: [{ key: 'nr', label: 'Nummer', typ: 'text', pflicht: true }] });
      const text = async (nr: string, inhalt: string) => {
        const m = await d.legeMappeAn({ typId: typ.id, werte: { nr } });
        const { dokument } = await d.ladeHoch(m.id, { register: 'dokumente', name: `${nr}.txt`, typ: 'text/plain' }, Buffer.from(nr), null);
        await r.ocrSetze(dokument.id, { stand: 'fertig', text: inhalt });
        return m;
      };
      const back = await text('G-1', 'Bedienungsanleitung für den Backofen mit Umluft');
      await text('G-2', 'Rechnungen für das Ofenrohr');
      await text('G-3', 'Der Ofen steht im Keller');
      await text('G-4', 'Waschmaschine');
      const ich = { id: '00000000-0000-4000-8000-0000000000aa', rolle: 'admin' };
      const suche = async (s: string) => {
        const x = await d.seite(ich, { sicht: `typ:${typ.id}`, suche: s, volltext: 'true' });
        return { titel: x.mappen.map((m) => m.titel).sort(), ausschnitte: (x as { ausschnitte?: Record<string, { text: string }> }).ausschnitte ?? {} };
      };
      const ofen = await suche('Ofen');
      assert.deepEqual(ofen.titel, ['G-1', 'G-2', 'G-3']);
      assert.ok(ofen.ausschnitte[back.id]?.text.includes(`Back${TREFFER_ANFANG}ofen${TREFFER_ENDE}`), ofen.ausschnitte[back.id]?.text);
      assert.deepEqual((await suche('"Ofen"')).titel, ['G-3']);
      assert.deepEqual((await suche('ofen umluft')).titel, ['G-1']);
      if (pg) assert.deepEqual((await suche('Rechnung')).titel, ['G-2'], 'Wortformen');
    });
  });
}

faelle(false);
faelle(true);
after(async () => { for (const s of offen) await s.end(); });
