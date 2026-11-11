/**
 * Etappe „Schneller“: Suche und Listen über Indizes (#740), Mappe in einem Zug speichern (#743).
 * Gleiche Treffer und gleiche Reihenfolge wie vorher; Speichern ganz oder gar nicht; „Bereits vergeben“ über einen
 * Index und ohne Titel fremder Mappen; „verteilt“ gesammelt. PostgreSQL-Teile nur mit TEST_DATABASE_URL.
 */
import { imModus } from './hilfen';
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import type postgres from 'postgres';
import { speicherDateien } from '../src/dateispeicher';
import { Dienst } from '../src/dienst';
import { speicherEinstellungen } from '../src/einstellungen';
import { Ereignisverteiler } from '../src/ereignisse';
import { Fachfehler } from '../src/fehler';
import { Konten } from '../src/konten';
import { speicherKontoRepo } from '../src/konto-repo';
import type { Repo } from '../src/repo';
import { speicherRepo } from '../src/repo-speicher';
import { routen, type Anfrage } from '../src/routen';

const HAUSHALT = '00000000-0000-4000-8000-000000000001';
const ICH = { id: '00000000-0000-4000-8000-0000000000aa', rolle: 'admin', email: 'lena@example.org' };
const offen: Array<() => Promise<void>> = [];
after(async () => { for (const f of offen) await f(); });

async function datenbank(): Promise<postgres.Sql> {
  const { ausUrl, alsUrl, legeDatenbankAn } = await import('../src/anbindung');
  const { verbinde, migriere } = await import('../src/db');
  const a = { ...ausUrl(process.env.TEST_DATABASE_URL)!, datenbank: `dms_schneller_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}` };
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

async function pgAufbau() {
  const sql = await datenbank();
  const { pgRepo } = await import('../src/repo-pg');
  const r = pgRepo(sql, HAUSHALT);
  await sql`INSERT INTO benutzer (id, haushalt_id, email, name, rolle) VALUES (${ICH.id}, ${HAUSHALT}, ${ICH.email}, 'Lena', 'admin')`;
  const d = new Dienst(r, speicherDateien(), { einstellungen: speicherEinstellungen() });
  const vertrag = await d.mappentypen.legeTypAn({ name: 'Vertrag', titelVorlage: '{name}', felder: [
    { key: 'name', label: 'Name', typ: 'text', pflicht: true }, { key: 'nr', label: 'Vertragsnummer', typ: 'text', eindeutig: true },
    { key: 'betrag', label: 'Betrag', typ: 'zahl', eindeutig: true }, { key: 'bemerkung', label: 'Bemerkung', typ: 'text' },
  ] });
  const zettel = await d.mappentypen.legeTypAn({ name: 'Zettel', titelVorlage: '{name}', felder: [{ key: 'name', label: 'Name', typ: 'text' }, { key: 'nr', label: 'Nr', typ: 'text' }] });
  return { sql, r, d, vertrag, zettel };
}

const titel = (s: { mappen: Array<{ titel?: string }> }) => s.mappen.map((m) => m.titel);

describe('Schneller (#740, #743) – PostgreSQL', { skip: !process.env.TEST_DATABASE_URL && 'ohne TEST_DATABASE_URL' }, () => {
  it('Indizes der Migration 075: Trigramm auf suchtext, Sortierung, Feldwerte; der alte Typ-Index entfällt', async () => {
    const { sql } = await pgAufbau();
    const namen = new Set((await sql`SELECT indexname FROM pg_indexes WHERE tablename = 'mappen'`).map((z) => z.indexname as string));
    for (const n of ['mappen_suchtext_trgm', 'mappen_titel_alle_idx', 'mappen_typ_erstellt_idx', 'mappen_typ_geaendert_idx', 'mappen_erstellt_idx', 'mappen_geaendert_idx', 'mappen_gleichwerte_idx', 'mappen_titel_idx']) {
      assert.ok(namen.has(n), n);
    }
    assert.ok(!namen.has('mappen_typ_idx'));
  });

  it('Ansicht über mehrere Typen: jede Sortierung auf- und absteigend, Blättern ohne neues Zählen, mit Suche dieselben Treffer', async () => {
    const { sql, d, vertrag, zettel } = await pgAufbau();
    const namen = ['Anton', 'berta', 'Cäsar', 'Dora', 'Emil', 'Friedrich', 'Gustav', 'heinrich', 'Ida', 'Julius'];
    const ids: string[] = [];
    for (const [i, n] of namen.entries()) ids.push((await d.mappen.legeMappeAn({ typId: i % 2 ? zettel.id : vertrag.id, werte: { name: n } })).id);
    // Feste, verschiedene Zeiten: erstellt in Namensfolge, geändert in einer anderen.
    for (const [i, id] of ids.entries()) {
      await sql`UPDATE mappen SET erstellt = '2026-01-01T00:00:00Z'::timestamptz + make_interval(hours => ${i}),
        geaendert = '2026-02-01T00:00:00Z'::timestamptz + make_interval(hours => ${(i * 7) % 10}) WHERE id = ${id}`;
    }
    const alle = { sicht: 'suche', link: '' };
    const nach = (f: (i: number) => number) => namen.map((n, i) => ({ n, k: f(i) })).sort((a, b) => a.k - b.k).map((x) => x.n);
    const titelAuf = [...namen].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
    const faelle: Array<[string, Record<string, unknown>, string[]]> = [
      ['Titel ↑', {}, titelAuf],
      ['Titel ↓', { sortierung: '_titel', absteigend: 'true' }, [...titelAuf].reverse()],
      ['erstellt ↑', { sortierung: '_erstellt' }, nach((i) => i)],
      ['erstellt ↓', { sortierung: '_erstellt', absteigend: 'true' }, nach((i) => -i)],
      ['geändert ↑', { sortierung: '_geaendert' }, nach((i) => (i * 7) % 10)],
      ['geändert ↓', { sortierung: '_geaendert', absteigend: 'true' }, nach((i) => -((i * 7) % 10))],
    ];
    for (const [name, q, erwartet] of faelle) {
      const s = await d.seite(ICH, { ...alle, ...q, von: 0, anzahl: 4 });
      assert.equal(s.gesamt, 10, name);
      assert.deepEqual(titel(s), erwartet.slice(0, 4), name);
      // Blättern mit der Zahl vom ersten Blatt: dieselbe Reihenfolge, nicht neu gezählt (die Zahl kommt zurück).
      const s2 = await d.seite(ICH, { ...alle, ...q, von: 4, anzahl: 4, gesamt: 10 });
      assert.deepEqual(titel(s2), erwartet.slice(4, 8), `${name}, Blatt 2`);
      // Letztes Blatt (nicht voll): genaue Zahl auch ohne Zählen.
      const s3 = await d.seite(ICH, { ...alle, ...q, von: 8, anzahl: 4, gesamt: 99 });
      assert.deepEqual([titel(s3), s3.gesamt], [erwartet.slice(8), 10], `${name}, Blatt 3`);
      // Je Typ dieselbe Reihenfolge.
      const nurVertrag = erwartet.filter((n) => namen.indexOf(n) % 2 === 0);
      assert.deepEqual(titel(await d.seite(ICH, { sicht: `typ:${vertrag.id}`, ...q, von: 0, anzahl: 10 })), nurVertrag, `${name}, ein Typ`);
    }
    // Ohne bekannte Zahl beim Blättern wird gezählt (API ohne „gesamt“).
    assert.equal((await d.seite(ICH, { ...alle, von: 4, anzahl: 4 })).gesamt, 10);
    // Mit Suche: Gesamtzahl und Seite in einer Abfrage; Blatt hinter dem Ende zählt eigens.
    const mitE = namen.filter((n) => /e/i.test(n));
    const s = await d.seite(ICH, { ...alle, suche: 'e', von: 0, anzahl: 2, sortierung: '_titel', absteigend: 'true' });
    assert.equal(s.gesamt, mitE.length);
    assert.deepEqual(titel(s), [...mitE].sort((a, b) => b.toLowerCase().localeCompare(a.toLowerCase())).slice(0, 2));
    assert.equal((await d.seite(ICH, { ...alle, suche: 'e', von: 50, anzahl: 2, gesamt: 1 })).gesamt, mitE.length, 'mit Suche gilt „gesamt“ nicht');
  });

  it('Treffer aus Mappe, Notizen und Textfilter als eine Menge – wie vorher; „Meintest du“ fragt nur, ob es etwas gibt', async () => {
    const { r, d, vertrag, zettel } = await pgAufbau();
    const a = await d.mappen.legeMappeAn({ typId: vertrag.id, werte: { name: 'Stromvertrag Haus' } });
    const b = await d.mappen.legeMappeAn({ typId: zettel.id, werte: { name: 'Einkauf' } });
    await d.mappenNotizen.legeNotizAn(b.id, 'Strom ablesen am Freitag', ICH.id);
    const c = await d.mappen.legeMappeAn({ typId: zettel.id, werte: { name: 'Garten', nr: 'Heizstrom-Tarif' } });
    await d.mappen.legeMappeAn({ typId: zettel.id, werte: { name: 'Fahrrad' } });
    const alle = { sicht: 'suche', link: '' };
    const s1 = await d.seite(ICH, { ...alle, suche: 'strom' });
    assert.deepEqual(titel(s1).sort(), ['Garten', 'Stromvertrag Haus']);
    const s2 = await d.seite(ICH, { ...alle, suche: 'strom', notizen: 'true' });
    assert.deepEqual(titel(s2).sort(), ['Einkauf', 'Garten', 'Stromvertrag Haus']);
    assert.equal(s2.gesamt, 3);
    assert.match(s2.ausschnitte?.[b.id]?.text ?? '', /Strom/);
    // Ein Typ: Typ und Treffer zusammen.
    assert.deepEqual(titel(await d.seite(ICH, { sicht: `typ:${zettel.id}`, suche: 'strom', notizen: 'true' })).sort(), ['Einkauf', 'Garten']);
    // Erweiterte Suche: Begriff in einer Notiz (Textfilter) als Treffermenge, ohne und mit Suche.
    const notizfilter = { sicht: 'suche', link: 'volltext=Freitag&in=notizen' };
    assert.deepEqual(titel(await d.seite(ICH, notizfilter)), ['Einkauf']);
    assert.deepEqual(titel(await d.seite(ICH, { ...notizfilter, suche: 'kauf' })), ['Einkauf']);
    assert.deepEqual(titel(await d.seite(ICH, { ...notizfilter, suche: 'garten' })), []);
    // Ob es Treffer gibt – ohne Seite und ohne Zahl.
    assert.equal(await r.gibtTreffer({ suche: 'heizstrom', von: 0, anzahl: 1 }), true);
    assert.equal(await r.gibtTreffer({ suche: 'heizstrom', typId: vertrag.id, von: 0, anzahl: 1 }), false);
    assert.equal(await r.gibtTreffer({ suche: 'freitag', notizen: true, von: 0, anzahl: 1 }), true);
    assert.equal(await r.gibtTreffer({ suche: 'freitag', von: 0, anzahl: 1 }), false);
    assert.equal(await r.gibtTreffer({ typId: zettel.id, von: 0, anzahl: 1 }), true);
    void a; void c;
  });

  it('Dublettenprüfung über den Index der Feldwerte: gleiche Treffer wie der genaue Vergleich, auch viele auf einmal', async () => {
    const { sql, r, d, vertrag, zettel } = await pgAufbau();
    const a = await d.mappen.legeMappeAn({ typId: vertrag.id, werte: { name: 'Strom', nr: '  SV-4711 ', betrag: 42 } });
    const b = await d.mappen.legeMappeAn({ typId: vertrag.id, werte: { name: 'Gas', nr: 'GV-1' } });
    await d.mappen.legeMappeAn({ typId: zettel.id, werte: { name: 'Zettel', nr: 'GV-2' } });
    assert.equal((await r.findeDoppelt(vertrag.id, 'nr', 'sv-4711'))?.id, a.id, 'ohne Groß-/Kleinschreibung und Leerzeichen am Rand');
    assert.equal(await r.findeDoppelt(vertrag.id, 'nr', 'sv-4711', a.id), undefined, 'die eigene Mappe zählt nicht');
    assert.equal(await r.findeDoppelt(vertrag.id, 'nr', 'GV-2'), undefined, 'anderer Typ zählt nicht');
    assert.equal((await r.findeDoppelt(vertrag.id, 'betrag', '42'))?.id, a.id, 'Zahlen');
    assert.equal(await r.findeDoppelt(vertrag.id, 'name', 'SV-4711'), undefined, 'anderes Feld zählt nicht');
    const viele = await r.findeDoppelte(vertrag.id, [
      { mappeId: b.id, feldKey: 'nr', wert: 'SV-4711' }, { mappeId: a.id, feldKey: 'nr', wert: 'SV-4711' },
      { mappeId: null, feldKey: 'nr', wert: 'gv-1' }, { mappeId: null, feldKey: 'betrag', wert: '43' },
    ]);
    assert.deepEqual([...viele.entries()].map(([k, v]) => [k, v.titel]).sort(), [[`${b.id}|nr`, 'Strom'], ['|nr', 'Gas']].sort());
    // Speichern: „Bereits vergeben in …“ wie bisher.
    await assert.rejects(d.mappen.aendereMappe(b.id, { werte: { nr: 'sv-4711' } }), (e: Fachfehler) => /Bereits vergeben in „Strom“/.test(JSON.stringify(e.details)));
    // Der Index wird genutzt – mit ein paar tausend Mappen und frischer Statistik, wie in einer echten Ablage.
    await sql`INSERT INTO mappen (id, haushalt_id, typ_id, werte, titel)
      SELECT gen_random_uuid(), ${HAUSHALT}, ${vertrag.id}, jsonb_build_object('name', 'M' || i, 'nr', 'N-' || i), 'M' || i FROM generate_series(1, 3000) i`;
    await sql`ANALYZE mappen`;
    const plan = await sql.begin(async (tx) => {
      return (await tx`EXPLAIN SELECT id FROM mappen WHERE dms_gleichwerte(werte) @> dms_gleichwerte(jsonb_build_object('nr'::text, 'x'::text))
        AND haushalt_id = ${HAUSHALT} AND typ_id = ${vertrag.id} AND lower(trim(werte ->> 'nr')) = 'x' LIMIT 1`).map((z) => Object.values(z)[0]).join('\n');
    });
    assert.match(plan, /mappen_gleichwerte_idx/);
    // Passung mehrerer Mappen in einem Zug: beide Seiten einer Dublette passen nicht, nach dem Ändern wieder.
    await sql`DELETE FROM mappen WHERE titel LIKE 'M%' AND typ_id = ${vertrag.id}`;
    await sql`UPDATE mappen SET werte = werte || '{"nr": "sv-4711"}' WHERE id = ${b.id}`;
    await d.passung.pruefePassung(vertrag.id);
    const problem = async (id: string) => (await sql`SELECT problem FROM mappen WHERE id = ${id}`)[0].problem as string | null;
    assert.match((await problem(a.id)) ?? '', /Bereits vergeben in „Gas“/);
    assert.match((await problem(b.id)) ?? '', /Bereits vergeben in „Strom“/);
    await d.mappen.aendereMappe(b.id, { werte: { nr: 'GV-1' } });
    assert.equal(await problem(a.id), null);
    assert.equal(await problem(b.id), null);
  });

  it('Speichern in einer Transaktion: Titel im selben UPDATE; bei einem Fehler bleibt nichts halb geschrieben', async () => {
    const { sql, d, vertrag, zettel } = await pgAufbau();
    const ziel = await d.mappen.legeMappeAn({ typId: vertrag.id, werte: { name: 'Strom' } });
    const zettelTyp = await d.mappentypen.aendereTyp(zettel.id, { ...zettel, titelVorlage: '{name}', felder: [...zettel.felder, { key: 'zu', label: 'Zu', typ: 'referenz', zielTyp: vertrag.id }] });
    const quelle = await d.mappen.legeMappeAn({ typId: zettelTyp.id, werte: { name: 'Notiz zu', zu: ziel.id } });
    assert.equal(quelle.titel, 'Notiz zu');
    // Zeilenversionen der Mappe zählen: ein Trigger nur für diesen Test.
    await sql`CREATE TABLE zaehle_updates (id uuid)`;
    await sql`CREATE FUNCTION zaehle_update() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN INSERT INTO zaehle_updates VALUES (NEW.id); RETURN NEW; END $$`;
    await sql`CREATE TRIGGER zaehle AFTER UPDATE ON mappen FOR EACH ROW EXECUTE FUNCTION zaehle_update()`;
    const neu = await d.mappen.aendereMappe(ziel.id, { werte: { name: 'Ökostrom' } });
    assert.equal(neu.titel, 'Ökostrom');
    const [{ n }] = await sql`SELECT count(*)::int AS n FROM zaehle_updates WHERE id = ${ziel.id}`;
    assert.equal(n, 1, 'Werte und Titel in einer Zeilenversion');
    const [s] = await sql`SELECT titel, suchtext FROM mappen WHERE id = ${ziel.id}`;
    assert.equal(s.titel, 'Ökostrom');
    assert.match(s.suchtext as string, /okostrom/);
    // Verweis mit Titel im Titel: zieht nach, wenn sich der Titel ändert.
    await d.mappentypen.aendereTyp(zettelTyp.id, { ...zettelTyp, titelVorlage: '{name} {zu}' });
    await d.mappen.aendereMappe(ziel.id, { werte: { name: 'Gas' } });
    assert.equal((await d.mappen.holeMappe(quelle.id)).mappe.titel, 'Notiz zu Gas');

    // Fehler nach dem Schreiben der Werte (hier beim Abgleich der Fristen): alles zurück.
    const vorher = (await sql`SELECT werte, titel, geaendert FROM mappen WHERE id = ${ziel.id}`)[0];
    const historie = (await sql`SELECT count(*)::int AS n FROM historie WHERE mappe_id = ${ziel.id}`)[0].n as number;
    const ereignisse = (await sql`SELECT count(*)::int AS n FROM ereignisse`)[0].n as number;
    const x = d as unknown as { fristenAbgleichen: () => Promise<unknown> };
    const echt = x.fristenAbgleichen;
    x.fristenAbgleichen = async () => { throw new Error('Platte voll'); };
    try { await assert.rejects(d.mappen.aendereMappe(ziel.id, { werte: { name: 'Wasser' } }), /Platte voll/); } finally { x.fristenAbgleichen = echt; }
    const nachher = (await sql`SELECT werte, titel, geaendert FROM mappen WHERE id = ${ziel.id}`)[0];
    assert.deepEqual(nachher, vorher, 'Werte, Titel und Stand unverändert');
    assert.equal((await sql`SELECT count(*)::int AS n FROM historie WHERE mappe_id = ${ziel.id}`)[0].n, historie, 'kein Eintrag in der Historie');
    assert.equal((await sql`SELECT count(*)::int AS n FROM ereignisse`)[0].n, ereignisse, 'kein Ereignis');
    assert.equal((await d.mappen.holeMappe(quelle.id)).mappe.titel, 'Notiz zu Gas', 'verweisende Mappe unverändert');
    // Anlegen ebenso.
    const mappen = (await sql`SELECT count(*)::int AS n FROM mappen`)[0].n as number;
    // Zettel hat keine Fristen – das Anlegen ruft den Abgleich nicht auf; ein Fehler beim Titel (nach dem INSERT).
    const y = d.mappenTitel as unknown as { aktualisiereTitel: () => Promise<unknown> };
    const echtTitel = y.aktualisiereTitel;
    y.aktualisiereTitel = async () => { throw new Error('Platte voll'); };
    try { await assert.rejects(d.mappen.legeMappeAn({ typId: zettelTyp.id, werte: { name: 'Halb' } }), /Platte voll/); } finally { y.aktualisiereTitel = echtTitel; }
    assert.equal((await sql`SELECT count(*)::int AS n FROM mappen`)[0].n, mappen, 'keine halbe Mappe');
  });

  it('„verteilt“ gesammelt: eine Anweisung für viele Ereignisse', async () => {
    const { sql, r } = await pgAufbau();
    for (let i = 0; i < 3; i++) await r.legeKatalogEreignisAn({ id: `00000000-0000-4000-8000-00000000740${i}`, art: 'mappe.angelegt', daten: {}, ausloeser: {} as never });
    const geholt = await r.holeKatalogEreignisse(10, 60);
    assert.equal(geholt.length, 3);
    await r.katalogEreignisseVerteilt(geholt.map((e) => e.id));
    const [z] = await sql`SELECT count(*) FILTER (WHERE verteilt IS NOT NULL AND gesperrt_bis IS NULL)::int AS n FROM ereignisse`;
    assert.equal(z.n, 3);
    await r.katalogEreignisseVerteilt([]);
  });
});

describe('Schneller (#743) – ohne Datenbank', () => {
  it('„Bereits vergeben“ nennt den Titel nur, wenn der Benutzer die andere Mappe lesen darf', async () => {
    const d = new Dienst(speicherRepo(), speicherDateien(), { einstellungen: speicherEinstellungen() });
    const konten = new Konten(speicherKontoRepo(), null, 'http://nas', d.systemtypen.benutzerspiegel());
    d.verbindeKonten(konten.papierkorbHaken());
    const { benutzer: admin } = await konten.einrichten({ email: 'lena@example.org', name: 'Lena', passwort: 'ein-langes-passwort' });
    const jonas = (await konten.legeBenutzerAn({ email: 'jonas@example.org', name: 'Jonas' }, admin.id)).benutzer;
    await d.gleicheBenutzerAb(await konten.listeBenutzer());
    const ALLES = { C: true, R: true, U: true, D: true, P: true };
    // Vertrauliche Verträge darf nur der Administrator lesen.
    const typ = await d.mappentypen.legeTypAn({ name: 'Vertrag', titelVorlage: '{name}', felder: [
      { key: 'name', label: 'Name', typ: 'text' }, { key: 'nr', label: 'Vertragsnummer', typ: 'text', eindeutig: true }, { key: 'vertraulich', label: 'Vertraulich', typ: 'janein' },
    ], berechtigungen: { grund: ALLES, regeln: [{ id: 'v', name: 'Vertraulich', wenn: [{ art: 'feld', bedingung: { art: 'feld', feld: 'vertraulich', op: 'ja' } }], dann: { R: 'entziehen' }, stopp: false }] } } as never);
    await d.mappen.legeMappeAn({ typId: typ.id, werte: { name: 'Geheimer Vertrag', nr: 'A-1', vertraulich: true } }, admin.id);
    await d.mappen.legeMappeAn({ typId: typ.id, werte: { name: 'Offener Vertrag', nr: 'B-1', vertraulich: false } }, admin.id);
    // Lena darf verwalten; die vertrauliche Mappe sieht sie wie jeder andere erst im Verwaltungsmodus (#819).
    const ich = async (id: string) => { const b = (await konten.listeBenutzer()).find((x) => x.id === id)!; return id === admin.id ? imModus(b) : b; };
    const tabelle = routen(d, konten, {});
    const anlegen = async (b: { id: string }, werte: Record<string, unknown>) => tabelle.find((t) => t.methode === 'POST' && t.pfad === '/api/mappen')!
      .handler({ body: { typId: typ.id, werte }, params: {}, query: {}, ip: '1', benutzer: await ich(b.id) } as Anfrage);
    const meldung = async (b: { id: string }, nr: string) => {
      try { await anlegen(b, { name: 'Neu', nr }); } catch (e) { return ((e as Fachfehler).details as { felder: Record<string, string[]> }).felder.nr?.[0]; }
      return 'angelegt';
    };
    assert.equal(await meldung(jonas, 'b-1'), 'Bereits vergeben in „Offener Vertrag“.');
    assert.equal(await meldung(jonas, ' a-1 '), 'Bereits vergeben.', 'weder Titel noch Id der Mappe, die Jonas nicht lesen darf');
    assert.equal(await meldung(admin, 'a-1'), 'Bereits vergeben in „Geheimer Vertrag“.');
  });

  it('Verteiler setzt „verteilt“ je Abholung in einer Anweisung, Fehlgeschlagenes nicht', async () => {
    const repo = speicherRepo();
    for (let i = 0; i < 5; i++) await repo.legeKatalogEreignisAn({ id: `00000000-0000-4000-8000-00000000741${i}`, art: 'mappe.angelegt', daten: { i }, ausloeser: {} as never });
    const aufrufe: string[][] = [];
    const beobachtet = new Proxy(repo, { get(z, p, e) {
      if (p === 'katalogEreignisseVerteilt') return async (ids: string[]) => { aufrufe.push(ids); return z.katalogEreignisseVerteilt(ids); };
      return Reflect.get(z, p, e);
    } }) as Repo;
    const v = new Ereignisverteiler({ repo: () => beobachtet });
    v.abonniere('test', async (e) => { if (e.daten.i === 2) throw new Error('kurz weg'); });
    assert.equal(await v.verteile(), 4);
    assert.equal(aufrufe.length, 1);
    assert.equal(aufrufe[0].length, 4);
    assert.ok(!aufrufe[0].includes('00000000-0000-4000-8000-000000007412'));
    assert.equal((await repo.katalogEreignisStand()).offen, 1);
  });
});
