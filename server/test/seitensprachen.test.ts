/**
 * Dokumente in mehreren Sprachen (#579): Sprache je Seite (auch zwei auf einer Mischseite), Hauptsprache plus
 * „enthält auch“, Suchindex je Seite in ihrer Sprache, Hinweis „Post teilen?“ bei einem Sprachwechsel – nie von selbst.
 * Mischdokument mit erfundenen Inhalten: deutscher Begleitbrief, dahinter das französische Schreiben einer Botschaft.
 */
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { TREFFER_ANFANG } from '../../shared/src/model';
import { alsSeitensprachen, dokumentsprachen, seitentexte, seitenZusammensetzen, sprachenEinerSeite, teilenAb, zeichenzahl } from '../../shared/src/seitensprachen';
import { speicherDateien } from '../src/dateispeicher';
import { Dienst } from '../src/dienst';
import { speicherEinstellungen } from '../src/einstellungen';
import type { Repo } from '../src/repo';
import { speicherRepo } from '../src/repo-speicher';
import { pruefeWerkzeuge, textebeneEngine, Texterkennung } from '../src/texterkennung';
import { pdfMitText } from './hilfen';

const HAUSHALT = '00000000-0000-4000-8000-000000000001';
const ICH = { id: '00000000-0000-4000-8000-0000000000aa', rolle: 'admin' };
const offen: Array<() => Promise<void>> = [];

const DEUTSCH = 'Sehr geehrte Frau Petra Muster, anbei leiten wir Ihnen das Schreiben der französischen Botschaft weiter. Die Unterlagen für die Beglaubigungen liegen bei, bitte prüfen Sie diese und senden Sie uns die Formulare bis zum Monatsende zurück. Mit freundlichen Grüßen, Ihre Gemeindeverwaltung Musterstadt';
const FRANZOESISCH = 'Madame, nous avons bien reçu votre demande et nous vous remercions pour votre patience. Les documents demandés par les services consulaires de l’ambassade sont listés dans cette lettre. Vous pouvez venir avec vos chevaux pour la fête du village. Veuillez agréer, Madame, nos salutations distinguées.';

describe('Seitensprachen (#579) – Bausteine', () => {
  it('erkennt Mischseiten (zwei Sprachen) und einsprachige Seiten', () => {
    assert.deepEqual(sprachenEinerSeite(DEUTSCH), ['deu']);
    assert.deepEqual(sprachenEinerSeite(FRANZOESISCH), ['fra']);
    assert.deepEqual(sprachenEinerSeite(`${DEUTSCH}\n\n${FRANZOESISCH}`).sort(), ['deu', 'fra']);
    // Ein kurzer fremder Satz (Anschrift, Gruß) macht keine Mischseite.
    assert.deepEqual(sprachenEinerSeite(`${DEUTSCH}\n\nMerci beaucoup et à bientôt.`), ['deu']);
    assert.deepEqual(sprachenEinerSeite('12,50 EUR 4711'), []);
  });

  it('setzt Seiten zusammen (Leerzeile wie bisher) und merkt sich den Anfang jeder Seite in Codepunkten', () => {
    const z = seitenZusammensetzen([{ text: ' Seite eins 😀 ' }, { text: '' }, { text: 'Seite drei', sprachen: ['fra', 'fra', 'deu', 'eng'] }]);
    assert.equal(z.text, 'Seite eins 😀\n\nSeite drei');
    assert.deepEqual(z.seiten.map((s) => s.ab), [0, 12, 14]);
    assert.deepEqual(z.seiten[2].sprachen, ['fra', 'deu'], 'höchstens zwei, ohne doppelte');
    assert.equal(zeichenzahl('😀a'), 2);
    assert.deepEqual(seitentexte(z.text, z.seiten), ['Seite eins 😀', '', 'Seite drei']);
  });

  it('Hauptsprache nach Textmenge, weitere Sprachen, Hinweis „Post teilen?“ nur bei einem vollständigen Wechsel', () => {
    const s = (...l: string[][]) => l.map((sprachen, i) => ({ ab: i * 100, sprachen }));
    assert.deepEqual(dokumentsprachen(s(['deu'], ['fra'], ['fra']), 300), { sprache: 'fra', weitere: ['deu'], mehrsprachig: true });
    assert.deepEqual(dokumentsprachen(s(['deu'], ['deu']), 200), { sprache: 'deu', weitere: [], mehrsprachig: false });
    assert.equal(teilenAb(s(['deu'], ['fra'])), 2);
    assert.equal(teilenAb(s(['deu'], [], ['fra'])), 3, 'leere Seite dazwischen');
    assert.equal(teilenAb(s(['deu'], ['deu', 'fra'], ['fra'])), null, 'Mischseite verbindet');
    assert.equal(teilenAb(s(['deu'], ['deu'])), null);
    assert.equal(teilenAb(null), null);
    assert.equal(alsSeitensprachen([{ ab: 5, sprachen: ['deu'] }, { ab: 2, sprachen: [] }]), null, 'Anfänge rückwärts');
    assert.deepEqual(alsSeitensprachen([{ ab: 0, sprachen: ['deu', 'xyz'] }]), [{ ab: 0, sprachen: ['deu'] }]);
  });
});

async function repo(pg: boolean): Promise<{ r: Repo; sql?: import('postgres').Sql }> {
  if (!pg) return { r: speicherRepo() };
  const { ausUrl, alsUrl, legeDatenbankAn } = await import('../src/anbindung');
  const { verbinde, migriere } = await import('../src/db');
  const { pgRepo } = await import('../src/repo-pg');
  const a = { ...ausUrl(process.env.TEST_DATABASE_URL)!, datenbank: `dms_seitensprache_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}` };
  await legeDatenbankAn(a);
  const sql = verbinde(alsUrl(a));
  offen.push(async () => {
    await sql.end();
    const admin = verbinde(alsUrl(a, 'postgres'));
    await admin.unsafe(`DROP DATABASE IF EXISTS "${a.datenbank}" WITH (FORCE)`).catch(() => {});
    await admin.end();
  });
  await migriere(sql, new URL('../migrations', import.meta.url).pathname, () => {});
  await sql`INSERT INTO haushalte (id, name) VALUES (${HAUSHALT}, 'Test') ON CONFLICT DO NOTHING`;
  await sql`INSERT INTO benutzer (id, haushalt_id, email, name, rolle) VALUES (${ICH.id}, ${HAUSHALT}, 'lena@example.org', 'Lena', 'admin')`;
  return { r: pgRepo(sql, HAUSHALT) as never, sql };
}

function faelle(pg: boolean) {
  describe(`Dokumente in mehreren Sprachen (#579)${pg ? ' – PostgreSQL' : ''}`, { skip: pg && !process.env.TEST_DATABASE_URL && 'ohne TEST_DATABASE_URL' }, () => {
    async function aufbau() {
      const { r, sql } = await repo(pg);
      const d = new Dienst(r, speicherDateien(), { einstellungen: speicherEinstellungen() });
      const typ = await d.mappentypen.legeTypAn({ name: 'Brief', titelVorlage: '{titel}', felder: [{ key: 'titel', label: 'Titel', typ: 'text', pflicht: true }] });
      const dok = async (titel: string) => {
        const m = await d.legeMappeAn({ typId: typ.id, werte: { titel } });
        return (await d.ladeHoch(m.id, { register: 'dokumente', name: `${titel}.pdf`, typ: 'application/pdf' }, pdfMitText([titel]), null)).dokument;
      };
      const schreibe = (id: string, body: Record<string, unknown>) => d.schreibeVolltext(id, body, { id: ICH.id, herkunft: 'Texterkennung 2.1.0', paket: true });
      const suche = async (s: string) => (await d.seite(ICH, { sicht: `typ:${typ.id}`, suche: s, volltext: 'true' }));
      const titel = async (s: string) => (await suche(s)).mappen.map((m) => m.titel).sort();
      return { d, r, sql, dok, schreibe, suche, titel };
    }

    it('Paket meldet Sprache je Seite: Hauptsprache, „enthält auch“, Hinweis ab Seite 2, Seiten über die API', async () => {
      const { d, dok, schreibe } = await aufbau();
      const x = await dok('Botschaft');
      const r = await schreibe(x.id, { text: `${DEUTSCH}\f${FRANZOESISCH}\f${FRANZOESISCH}`, seitensprachen: [['deu'], ['fra'], null] });
      assert.equal(r.sprache, 'fra', 'zwei Seiten Französisch: mehr Text');
      assert.deepEqual(r.weitereSprachen, ['deu']);
      assert.equal(r.teilenAb, 2);
      assert.equal(r.ocr?.seiten, 3, 'Seitenzahl aus den Seiten');
      assert.match(r.ocr?.info ?? '', /Sprache: fra$/);
      const v = await d.volltext(x.id);
      assert.ok(!v.text!.includes('\f'), 'gespeichert mit Leerzeilen wie bisher');
      assert.deepEqual(v.seiten!.map((s) => [s.seite, s.sprachen, s.text.slice(0, 12)]), [[1, ['deu'], 'Sehr geehrte'], [2, ['fra'], 'Madame, nous'], [3, ['fra'], 'Madame, nous']]);
      // Hinweis wegklicken: für alle; ein neuer Volltext mit neuem Wechsel bringt ihn wieder.
      assert.equal((await d.teilenHinweisAus(x.id)).teilenAb, null);
      assert.equal((await d.holeDokument(x.id)).teilenAb, null);
      assert.equal((await schreibe(x.id, { text: `${DEUTSCH}\f${FRANZOESISCH}`, seitensprachen: [['deu'], ['fra']] })).teilenAb, 2);
      // Mischseite (beide Sprachen auf einer Seite): enthält auch, aber kein Hinweis.
      const y = await schreibe((await dok('Misch')).id, { text: `${DEUTSCH}\n\n${FRANZOESISCH}`, seitensprachen: [['deu', 'fra']] });
      assert.deepEqual([y.sprache, y.weitereSprachen, y.teilenAb], ['deu', ['fra'], null]);
      // Einsprachig über Seiten: wie bisher (keine weiteren, keine Seiten gespeichert).
      const z = await schreibe((await dok('Einfach')).id, { text: `${DEUTSCH}\f${DEUTSCH}`, seitensprachen: [['deu'], null] });
      assert.deepEqual([z.sprache, z.weitereSprachen, z.teilenAb], ['deu', [], null]);
      assert.equal((await d.volltext(z.id)).seiten, null);
      // Seiten getrennt, ohne Angabe: das DMS erkennt die Sprache je Seite.
      const w = await schreibe((await dok('Erkannt')).id, { text: `${DEUTSCH}\f${FRANZOESISCH}` });
      assert.deepEqual([w.sprache, w.weitereSprachen, w.teilenAb], ['deu', ['fra'], 2]);
    });

    it('prüft die Angaben; Sprache und weitere Sprachen über die API setzen', async () => {
      const { d, dok, schreibe } = await aufbau();
      const x = await dok('Pruefung');
      await assert.rejects(schreibe(x.id, { text: `a\fb`, seitensprachen: [['deu']] }), /seitensprachen: 1 Einträge, der Text hat 2 Seiten/);
      await assert.rejects(schreibe(x.id, { text: 'a', seitensprachen: [['klingonisch']] }), /seitensprachen\[0\]/);
      await assert.rejects(schreibe(x.id, { text: 'a', seitensprachen: [['deu', 'fra', 'eng']] }), /höchstens 2/);
      await assert.rejects(schreibe(x.id, { text: 'a', seitensprachen: 'deu' }), /seitensprachen/);
      // Ohne Seiten, aber mit weiteren Sprachen (Paket kennt die Seiten nicht).
      const a = await schreibe(x.id, { text: DEUTSCH, sprache: 'deu', weitere: ['fra', 'deu'] });
      assert.deepEqual([a.sprache, a.weitereSprachen], ['deu', ['fra']]);
      const b = await d.setzeDokumentSprache(x.id, { sprache: 'fra' }, { id: ICH.id, wer: 'Test' });
      assert.deepEqual([b.sprache, b.weitereSprachen], ['fra', []], 'Hauptsprache fällt aus den weiteren');
      const c = await d.setzeDokumentSprache(x.id, { sprache: 'deu', weitere: ['fra', 'eng'] }, { id: ICH.id, wer: 'Test' });
      assert.deepEqual([c.sprache, c.weitereSprachen], ['deu', ['fra', 'eng']]);
      await assert.rejects(d.setzeDokumentSprache(x.id, { sprache: 'deu', weitere: ['xyz'] }, { id: ICH.id, wer: 'Test' }), /weitere/);
      assert.deepEqual((await d.setzeDokumentSprache(x.id, { sprache: 'deu', weitere: null }, { id: ICH.id, wer: 'Test' })).weitereSprachen, []);
      await assert.rejects(d.teilenHinweisAus('00000000-0000-4000-8000-00000000ffff'), /gibt es nicht/);
      // Ein neuer Volltext ohne Sprachen-Angaben nimmt die alten weiteren Sprachen nicht mit.
      await d.setzeDokumentSprache(x.id, { sprache: 'deu', weitere: ['fra'] }, { id: ICH.id, wer: 'Test' });
      assert.deepEqual((await schreibe(x.id, { text: DEUTSCH })).weitereSprachen, []);
    });

    if (pg) it('PostgreSQL: Suche findet deutsche und französische Wörter (auch gebeugt), Ausschnitt in der Sprache des Treffers', async () => {
      const { sql, dok, schreibe, suche, titel } = await aufbau();
      await schreibe((await dok('Botschaft')).id, { text: `${DEUTSCH}\f${FRANZOESISCH}`, seitensprachen: [['deu'], ['fra']] });
      await schreibe((await dok('Deutsch')).id, { text: DEUTSCH.replace('Botschaft', 'Behörde').replace(/französischen /, '') });
      // Deutsch: „Beglaubigung“ findet „Beglaubigungen“; Französisch nur über die weitere Sprache des Dokuments.
      assert.deepEqual(await titel('Beglaubigung'), ['Botschaft', 'Deutsch']);
      assert.deepEqual(await titel('Botschaft'), ['Botschaft']);
      assert.deepEqual(await titel('"cheval"'), ['Botschaft'], 'französischer Wortstamm: chevaux → cheval');
      assert.deepEqual(await titel('ambassades'), ['Botschaft']);
      const s = await suche('"cheval"');
      const a = (s as { ausschnitte?: Record<string, { text: string }> }).ausschnitte!;
      assert.ok(Object.values(a)[0].text.includes(`${TREFFER_ANFANG}chevaux`), Object.values(a)[0].text);
      // Je Seite in ihrer Sprache: Die deutsche Seite steckt nicht mit französischen Wortstämmen im Index.
      const [z] = await sql!`SELECT suchindex::text AS v FROM dokumente WHERE seitensprachen IS NOT NULL`;
      assert.match(z.v, /'cheval'/);
      assert.match(z.v, /'beglaub'/);
      assert.doesNotMatch(z.v, /'chevaux'/, 'die französische Seite nicht mit deutschen Wortstämmen');
    });

    if (pg) it('PostgreSQL: Bestand ohne Seitensprachen – Suchindex wie bisher, Migration baut nichts neu', async () => {
      const { sql, dok, schreibe } = await aufbau();
      const x = await dok('Alt');
      await schreibe(x.id, { text: FRANZOESISCH });
      const [z] = await sql!`SELECT suchindex = to_tsvector(dms_konfig(sprache), dms_suchtext(volltext)) AS gleich, weitere_sprachen, seitensprachen FROM dokumente WHERE id = ${x.id}`;
      assert.deepEqual([z.gleich, z.weitere_sprachen, z.seitensprachen], [true, null, null]);
      // Ohne Seiten, mit weiteren Sprachen: der ganze Text zusätzlich in deren Wortstämmen.
      await sql!`UPDATE dokumente SET weitere_sprachen = '{deu}' WHERE id = ${x.id}`;
      const [y] = await sql!`SELECT suchindex = (to_tsvector('dms_french', dms_suchtext(volltext)) || to_tsvector('dms_german', dms_suchtext(volltext))) AS gleich FROM dokumente WHERE id = ${x.id}`;
      assert.equal(y.gleich, true);
    });
  });
}

faelle(false);
faelle(true);

describe('Textebene: Sprache je Seite im Kern (#579)', () => {
  it('ein PDF mit deutscher und französischer Seite bekommt Seitensprachen und den Hinweis ab Seite 2', async (k) => {
    const w = await pruefeWerkzeuge();
    if (!w.pdftotext) { k.skip('poppler nicht installiert'); return; }
    const { mkdtemp, writeFile, readFile, rm } = await import('node:fs/promises');
    const { join } = await import('node:path');
    const { tmpdir } = await import('node:os');
    const { execFileSync } = await import('node:child_process');
    const dir = await mkdtemp(join(tmpdir(), 'dms-seiten-'));
    try {
      // Zeilen zu je etwa acht Wörtern, damit sie auf die Seite passen.
      const zeilen = (t: string) => t.split(' ').reduce<string[]>((z, w, i) => (i % 8 ? (z[z.length - 1] += ` ${w}`, z) : [...z, w]), []);
      await writeFile(join(dir, 'a.pdf'), pdfMitText(zeilen(DEUTSCH), 14));
      await writeFile(join(dir, 'b.pdf'), pdfMitText(zeilen(FRANZOESISCH.replace('’', "'")), 14));
      execFileSync('pdfunite', [join(dir, 'a.pdf'), join(dir, 'b.pdf'), join(dir, 'ab.pdf')]);
      const e = await textebeneEngine(join(dir, 'ab.pdf'), 'application/pdf', { maxSeiten: 10, werkzeuge: w });
      assert.equal(e.seitenTexte?.length, 2);

      const repo = speicherRepo();
      const dateien = speicherDateien();
      const einstellungen = speicherEinstellungen();
      const d = new Dienst(repo, dateien, { einstellungen });
      const t = new Texterkennung(repo, dateien, einstellungen, textebeneEngine, async () => w);
      d.verbindeTexterkennung(t);
      const typ = await d.mappentypen.legeTypAn({ name: 'Brief', titelVorlage: '{titel}', felder: [{ key: 'titel', label: 'Titel', typ: 'text', pflicht: true }] });
      const m = await d.legeMappeAn({ typId: typ.id, werte: { titel: 'Botschaft' } });
      const { dokument } = await d.ladeHoch(m.id, { register: 'dokumente', name: 'botschaft.pdf', typ: 'application/pdf' }, await readFile(join(dir, 'ab.pdf')), null);
      const ende = Date.now() + 15_000;
      while ((await repo.holeDokument(dokument.id))?.ocr?.stand !== 'fertig') {
        if (Date.now() > ende) throw new Error(`Zeit abgelaufen: ${JSON.stringify((await repo.holeDokument(dokument.id))?.ocr)}`);
        await new Promise((r) => setTimeout(r, 50));
      }
      const x = (await repo.holeDokument(dokument.id))!;
      assert.equal(x.sprache, 'deu');
      assert.deepEqual(x.weitereSprachen, ['fra']);
      assert.equal(x.teilenAb, 2);
      assert.deepEqual((await repo.seitensprachen(x.id))?.map((s) => s.sprachen), [['deu'], ['fra']]);
      // Einsprachige PDFs bleiben wie bisher: keine Seiten gespeichert.
      execFileSync('pdfunite', [join(dir, 'a.pdf'), join(dir, 'a.pdf'), join(dir, 'aa.pdf')]);
      const m2 = await d.legeMappeAn({ typId: typ.id, werte: { titel: 'Deutsch' } });
      const zwei = (await d.ladeHoch(m2.id, { register: 'dokumente', name: 'deutsch.pdf', typ: 'application/pdf' }, await readFile(join(dir, 'aa.pdf')), null)).dokument;
      while ((await repo.holeDokument(zwei.id))?.ocr?.stand !== 'fertig') {
        if (Date.now() > ende) throw new Error('Zeit abgelaufen');
        await new Promise((r) => setTimeout(r, 50));
      }
      assert.equal(await repo.seitensprachen(zwei.id), null);
      assert.deepEqual((await repo.holeDokument(zwei.id))!.weitereSprachen, []);
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
});

after(async () => { for (const f of offen) await f(); });
