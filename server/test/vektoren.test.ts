// Vektoren zu Dokumenten (#442): Prüfen der Eingaben, Zwischenspeicher, Zusammenfassen je Mappe, Speicher im Repo.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { jeMappe, kosinus, liesModell, liesVektor, Vektorindex } from '../src/vektoren';
import { speicherRepo } from '../src/repo-speicher';
import type { Repo } from '../src/repo';

const zufall = (d: number, saat: number) => { let x = saat; const v = new Float32Array(d); for (let i = 0; i < d; i++) { x = (x * 1103515245 + 12345) % 2147483648; v[i] = x / 2147483648 - 0.5; } return liesVektor(Array.from(v)); };

describe('Vektoren (#442): Eingaben', () => {
  it('normiert Vektoren und weist Unbrauchbares mit klarer Meldung ab', () => {
    const v = liesVektor([3, 4, 0, 0, 0, 0, 0, 0]);
    assert.ok(Math.abs(v[0] - 0.6) < 1e-6 && Math.abs(v[1] - 0.8) < 1e-6);
    assert.throws(() => liesVektor('1,2'), /Liste von Zahlen/);
    assert.throws(() => liesVektor([1, 2]), /8 bis 4096 Werte/);
    assert.throws(() => liesVektor([1, 2, 3, 4, 5, 6, 7, 'x']), /Wert 8 .* keine Zahl/);
    assert.throws(() => liesVektor(new Array(8).fill(0)), /überall 0/);
    assert.throws(() => liesVektor(new Array(9).fill(1), 8), /haben 8 Werte, dieser hat 9/);
    assert.equal(liesModell(' static-similarity-mrl-multilingual-v1/256 '), 'static-similarity-mrl-multilingual-v1/256');
    assert.throws(() => liesModell(''), /Modellkennung/);
    assert.throws(() => liesModell('a b'), /Modellkennung/);
  });
});

describe('Vektoren (#442): Zwischenspeicher', () => {
  it('findet die ähnlichsten, rundet kaum (8 Bit), wächst, entfernt, Schwelle und Ausnahmen', () => {
    const D = 64;
    const vs = Array.from({ length: 300 }, (_, i) => zufall(D, i + 1));
    const idx = new Vektorindex(D, vs.slice(0, 10).map((v, i) => ({ dokumentId: `d${i}`, mappeId: `m${i % 4}`, vektor: v })));
    for (let i = 10; i < 300; i++) idx.setze(`d${i}`, `m${i % 4}`, vs[i]);
    assert.equal(idx.anzahl, 300);
    // Gleiche Reihenfolge wie exakt gerechnet; Rundungsfehler < 0,01.
    const q = vs[42];
    const exakt = vs.map((v, i) => ({ i, a: kosinus(v, q) })).sort((a, b) => b.a - a.a).slice(0, 5);
    const t = idx.suche(q, 5);
    assert.deepEqual(t.map((x) => x.dokumentId), exakt.map((x) => `d${x.i}`));
    for (let k = 0; k < 5; k++) assert.ok(Math.abs(t[k].aehnlichkeit - exakt[k].a) < 0.01, `${t[k].aehnlichkeit} ≈ ${exakt[k].a}`);
    assert.equal(t[0].dokumentId, 'd42');
    assert.ok(Math.abs(t[0].aehnlichkeit - 1) < 0.01);
    // Ausnahmen und Schwelle.
    assert.notEqual(idx.suche(q, 1, { ohne: new Set(['d42']) })[0].dokumentId, 'd42');
    assert.deepEqual(idx.suche(q, 10, { schwelle: 0.99 }).map((x) => x.dokumentId), ['d42']);
    // Entfernen, Platz wiederverwenden, Ersetzen.
    idx.entferne('d42');
    assert.equal(idx.anzahl, 299);
    assert.ok(!idx.suche(q, 300).some((x) => x.dokumentId === 'd42'));
    idx.setze('neu', 'mx', q);
    assert.equal(idx.suche(q, 1)[0].dokumentId, 'neu');
    idx.setze('neu', 'my', vs[7]);
    assert.equal(idx.suche(q, 1)[0].dokumentId === 'neu', false, 'ersetzt, nicht doppelt');
    assert.equal(idx.anzahl, 300);
    assert.ok(idx.vektor('d7') && kosinus(idx.vektor('d7')!, vs[7]) > 0.999);
    assert.throws(() => idx.setze('x', 'm', new Float32Array(8)), /64 Werte/);
    assert.deepEqual(idx.suche(new Float32Array(8), 5), [], 'falsche Länge: nichts');
  });

  it('fasst Treffer je Mappe zusammen (bester Treffer), lässt Mappen aus', () => {
    const t = jeMappe([
      { dokumentId: 'a', mappeId: 'm1', aehnlichkeit: 0.5 }, { dokumentId: 'b', mappeId: 'm1', aehnlichkeit: 0.9 },
      { dokumentId: 'c', mappeId: 'm2', aehnlichkeit: 0.7 }, { dokumentId: 'd', mappeId: 'm3', aehnlichkeit: 0.8 },
    ], 2, new Set(['m3']));
    assert.deepEqual(t.map((x) => [x.mappeId, x.dokumentId]), [['m1', 'b'], ['m2', 'c']]);
  });
});

/** Repo-Funktionen – im Speicher und (mit TEST_DATABASE_URL) in PostgreSQL. */
async function pgRepoNeu(): Promise<{ repo: Repo; ende: () => Promise<void> }> {
  const { ausUrl, alsUrl, legeDatenbankAn } = await import('../src/anbindung');
  const { verbinde, migriere } = await import('../src/db');
  const { pgRepo } = await import('../src/repo-pg');
  const H = '00000000-0000-4000-8000-000000000001';
  const basis = ausUrl(process.env.TEST_DATABASE_URL)!;
  const a = { ...basis, datenbank: `dms_vek_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}` };
  await legeDatenbankAn(a);
  const sql = verbinde(alsUrl(a));
  await migriere(sql, new URL('../migrations', import.meta.url).pathname, () => {});
  await sql`INSERT INTO haushalte (id, name) VALUES (${H}, 'Test') ON CONFLICT DO NOTHING`;
  return { repo: pgRepo(sql, H) as never as Repo, ende: async () => { await sql.end(); const admin = verbinde(alsUrl(basis)); await admin.unsafe(`DROP DATABASE IF EXISTS "${a.datenbank}" WITH (FORCE)`); await admin.end(); } };
}

for (const pg of [false, true]) {
  describe(`Vektoren (#442): Repo${pg ? ' – PostgreSQL' : ' im Speicher'}`, { skip: pg && !process.env.TEST_DATABASE_URL && 'ohne TEST_DATABASE_URL' }, () => {
    it('setzen, ersetzen, Stand, ohne Vektor (nach Id), mit dem Dokument gelöscht, je Paket löschen', async () => {
      const { Dienst } = await import('../src/dienst');
      const { speicherDateien } = await import('../src/dateispeicher');
      const db = pg ? await pgRepoNeu() : { repo: speicherRepo(), ende: async () => {} };
      try {
        const d = new Dienst(db.repo, speicherDateien());
        const post = await d.legePostAn({ betreff: 'Brief' }, { id: null, name: 'Test' });
        const reg = (await d.sichereSystem()).post.register.find((x) => x.art === 'dokumente')!.key;
        const ids: string[] = [];
        for (let i = 0; i < 3; i++) ids.push((await d.ladeHoch(post.id, { register: reg, name: `${i}.pdf` }, Buffer.from(`%PDF-1.4 ${i}`), null)).dokument.id);
        for (const id of ids.slice(0, 2)) await d.schreibeVolltext(id, { text: `Text ${id}` }, { id: null as never, herkunft: 'Test', paket: false });
        assert.equal(await db.repo.mitVolltext(), 2);
        const v = liesVektor([1, 2, 3, 4, 5, 6, 7, 8]);
        assert.equal(await db.repo.vektorSetze({ dokumentId: ids[0], paket: 'ki', modell: 'm/8', vektor: v }), true);
        assert.equal(await db.repo.vektorSetze({ dokumentId: ids[0], paket: 'ki', modell: 'm/8', vektor: v }), true, 'ersetzt');
        assert.equal(await db.repo.vektorSetze({ dokumentId: '00000000-0000-4000-8000-0000000000ff', paket: 'ki', modell: 'm/8', vektor: v }), false);
        await db.repo.vektorSetze({ dokumentId: ids[1], paket: 'ki', modell: 'alt', vektor: v });
        assert.deepEqual(await db.repo.vektorStand(), [{ paket: 'ki', modell: 'alt', anzahl: 1 }, { paket: 'ki', modell: 'm/8', anzahl: 1 }]);
        const geholt = await db.repo.vektorVon(ids[0], 'm/8');
        assert.ok(geholt && kosinus(geholt, v) > 0.9999);
        const alle: Array<[string, string]> = [];
        await db.repo.vektorenLaden('m/8', (t) => { for (const x of t) alle.push([x.dokumentId, x.mappeId]); });
        assert.deepEqual(alle, [[ids[0], post.id]]);
        // Nur Dokumente mit Volltext, ohne Vektor dieses Modells; ab einer Id weiter.
        assert.deepEqual((await db.repo.ohneVektor('m/8', 10)).map((x) => x.id), [ids[1]]);
        const sortiert = ids.slice(0, 2).sort();
        assert.deepEqual((await db.repo.ohneVektor('neu', 10)).map((x) => x.id), sortiert);
        assert.deepEqual((await db.repo.ohneVektor('neu', 10, sortiert[0])).map((x) => x.id), [sortiert[1]]);
        // Modellwechsel: alles außer dem neuen Modell weg.
        assert.equal(await db.repo.vektorenLoeschePaket('ki', 'm/8'), 1);
        assert.deepEqual((await db.repo.vektorStand()).map((x) => x.modell), ['m/8']);
        // Mit dem Dokument weg (endgültig gelöscht; ohne Papierkorb).
        await db.repo.loescheDokument(ids[0]);
        assert.deepEqual(await db.repo.vektorStand(), []);
        assert.equal(await db.repo.vektorVon(ids[0], 'm/8'), null);
      } finally { await db.ende(); }
    });
  });
}
