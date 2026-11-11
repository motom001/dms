/**
 * Volltext je Dokumentsprache (#400): Sprache als eigenes Feld am Dokument (erkannt, über die API gesetzt, aus dem
 * Bestand übernommen); die Volltextsuche nimmt die Wortstämme der Sprache jedes Dokuments.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, describe, it } from 'node:test';
import { suchkonfig, TEXTSPRACHEN } from '../../shared/src/textsprache';
import { speicherDateien } from '../src/dateispeicher';
import { Dienst } from '../src/dienst';
import { speicherEinstellungen } from '../src/einstellungen';
import type { Repo } from '../src/repo';
import { speicherRepo } from '../src/repo-speicher';

const HAUSHALT = '00000000-0000-4000-8000-000000000001';
const ICH = { id: '00000000-0000-4000-8000-0000000000aa', rolle: 'admin' };
const offen: Array<() => Promise<void>> = [];

async function repo(pg: boolean): Promise<{ r: Repo; sql?: import('postgres').Sql }> {
  if (!pg) return { r: speicherRepo() };
  const { ausUrl, alsUrl, legeDatenbankAn } = await import('../src/anbindung');
  const { verbinde, migriere } = await import('../src/db');
  const { pgRepo } = await import('../src/repo-pg');
  const a = { ...ausUrl(process.env.TEST_DATABASE_URL)!, datenbank: `dms_sprache_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}` };
  await legeDatenbankAn(a);
  const sql = verbinde(alsUrl(a));
  offen.push(async () => {
    await sql.end();
    const admin = verbinde(alsUrl(a, 'postgres'));
    await admin.unsafe(`DROP DATABASE IF EXISTS "${a.datenbank}" WITH (FORCE)`).catch(() => {});
    await admin.end();
  });
  await migriere(sql, new URL('../migrations', import.meta.url).pathname, () => {});
  // Die Historie verweist auf den Benutzer.
  await sql`INSERT INTO haushalte (id, name) VALUES (${HAUSHALT}, 'Test') ON CONFLICT DO NOTHING`;
  await sql`INSERT INTO benutzer (id, haushalt_id, email, name, rolle) VALUES (${ICH.id}, ${HAUSHALT}, 'lena@example.org', 'Lena', 'admin')`;
  return { r: pgRepo(sql, HAUSHALT) as never, sql };
}

const FRANZOESISCH = 'Madame, Monsieur, nous vous remercions pour votre commande. Les chevaux sont arrivés et nous restons à votre disposition pour toute question.';
const ENGLISCH = 'Dear Sir or Madam, thank you for your order. The running costs and all payments are listed below; please contact us with any questions.';
const DEUTSCH = 'Sehr geehrte Damen und Herren, die Rechnungen für die Wartung der Heizung finden Sie im Anhang. Mit freundlichen Grüßen';

function faelle(pg: boolean) {
  describe(`Volltext je Dokumentsprache (#400)${pg ? ' – PostgreSQL' : ''}`, { skip: pg && !process.env.TEST_DATABASE_URL && 'ohne TEST_DATABASE_URL' }, () => {
    async function aufbau() {
      const { r, sql } = await repo(pg);
      const d = new Dienst(r, speicherDateien(), { einstellungen: speicherEinstellungen() });
      const typ = await d.mappentypen.legeTypAn({ name: 'Brief', titelVorlage: '{titel}', felder: [{ key: 'titel', label: 'Titel', typ: 'text', pflicht: true }] });
      const brief = async (titel: string, text: string, sprache?: string | null) => {
        const m = await d.mappen.legeMappeAn({ typId: typ.id, werte: { titel } });
        const { dokument } = await d.dokumente.ladeHoch(m.id, { register: 'dokumente', name: `${titel}.txt`, typ: 'text/plain' }, Buffer.from(titel), null);
        return d.volltexte.schreibeVolltext(dokument.id, { text, ...(sprache !== undefined ? { sprache } : {}) }, { id: ICH.id, herkunft: 'Test', paket: false });
      };
      const suche = async (s: string) => (await d.sichten.seite(ICH, { sicht: `typ:${typ.id}`, suche: s, volltext: 'true' })).mappen.map((m) => m.titel).sort();
      return { d, r, sql, brief, suche };
    }

    it('erkennt die Sprache und speichert sie als Feld; API setzt und prüft sie', async () => {
      const { d, brief } = await aufbau();
      assert.equal((await brief('Lettre', FRANZOESISCH)).sprache, 'fra');
      assert.equal((await brief('Letter', ENGLISCH)).sprache, 'eng');
      assert.equal((await brief('Brief', DEUTSCH)).sprache, 'deu');
      // Angegeben (z. B. vom Paket Texterkennung) geht vor der Erkennung
      const x = await brief('Kurz', 'Rechnung 4711', 'eng');
      assert.equal(x.sprache, 'eng');
      assert.match(x.ocr?.info ?? '', /Sprache: eng/);
      await assert.rejects(brief('Falsch', DEUTSCH, 'xyz'), /sprache: unbekannt/);
      const neu = await d.volltexte.setzeDokumentSprache(x.id, { sprache: 'fra' }, { id: ICH.id, wer: 'Test' });
      assert.equal(neu.sprache, 'fra');
      assert.equal((await d.volltexte.setzeDokumentSprache(x.id, { sprache: null }, { id: ICH.id, wer: 'Test' })).sprache, null);
      await assert.rejects(d.volltexte.setzeDokumentSprache(x.id, { sprache: 'klingonisch' }, { id: ICH.id, wer: 'Test' }), /unbekannt/);
      await assert.rejects(d.volltexte.setzeDokumentSprache('00000000-0000-4000-8000-00000000ffff', { sprache: 'fra' }, { id: ICH.id, wer: 'Test' }), /gibt es nicht/);
    });

    if (pg) it('PostgreSQL: Wortstämme je Sprache; Sprache ändern baut den Suchindex des Dokuments neu', async () => {
      const { d, brief, suche } = await aufbau();
      const lettre = await brief('Lettre', FRANZOESISCH);
      await brief('Letter', ENGLISCH);
      await brief('Brief', DEUTSCH);
      assert.deepEqual(await suche('"cheval"'), ['Lettre'], 'französisch: chevaux → cheval');
      assert.deepEqual(await suche('"run"'), ['Letter'], 'englisch: running → run');
      assert.deepEqual(await suche('"Rechnung"'), ['Brief'], 'deutsch weiter');
      assert.deepEqual(await suche('Grusse'), ['Brief'], 'Umlaute (#356) weiter');
      // Als Deutsch markiert: dann gilt der deutsche Wortstamm, „cheval“ findet „chevaux“ nicht mehr.
      await d.volltexte.setzeDokumentSprache(lettre.id, { sprache: 'deu' }, { id: ICH.id, wer: 'Test' });
      assert.deepEqual(await suche('"cheval"'), []);
    });

    if (pg) it('PostgreSQL: Migration 049 übernimmt die Sprache aus dem Hinweis der Texterkennung', async () => {
      const { sql, brief, suche } = await aufbau();
      const lettre = await brief('Lettre', FRANZOESISCH);
      const brief2 = await brief('Brief', DEUTSCH);
      // Stand vor #400: Sprache nur im Hinweis, Feld leer.
      await sql!`UPDATE dokumente SET sprache = NULL`;
      assert.deepEqual(await suche('"cheval"'), []);
      await sql!.unsafe(readFileSync(new URL('../migrations/049_dokumentsprache.sql', import.meta.url), 'utf8').replace(/^CREATE INDEX .*$/m, ''));
      const z = await sql!`SELECT id, sprache FROM dokumente ORDER BY name`;
      assert.deepEqual(z.map((x) => [x.id, x.sprache]).sort(), [[lettre.id, 'fra'], [brief2.id, null]].sort(), 'Deutsch bleibt leer');
      // Das Repo merkt sich die Sprachen eine Minute – ein neues Repo sieht sie gleich.
      const { pgRepo } = await import('../src/repo-pg');
      const d2 = new Dienst(pgRepo(sql!, HAUSHALT), speicherDateien(), { einstellungen: speicherEinstellungen() });
      const typ = (await d2.mappentypen.listeTypen()).find((t) => t.name === 'Brief')!;
      assert.deepEqual((await d2.sichten.seite(ICH, { sicht: `typ:${typ.id}`, suche: '"cheval"', volltext: 'true' })).mappen.map((m) => m.titel), ['Lettre']);
      // Die API zeigt für ältere deutsche Dokumente die Sprache aus dem Hinweis.
      assert.equal((await d2.dokumente.holeDokument(brief2.id)).sprache, 'deu');
    });

    if (pg) it('PostgreSQL: dms_konfig passt zu TEXTSPRACHEN', async () => {
      const { sql } = await aufbau();
      for (const k of [...Object.keys(TEXTSPRACHEN), 'xyz', null]) {
        const [z] = await sql!`SELECT dms_konfig(${k}::text)::text AS k`;
        assert.equal(z.k, suchkonfig(k), String(k));
      }
    });
  });
}

faelle(false);
faelle(true);
after(async () => { for (const f of offen) await f(); });
