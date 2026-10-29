/** Sprechende Links auf Mappen (#98): lesen, Fehler melden, Mappen finden und Links bauen. */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { beschreibeDirektlink, linkZuMappe, liesDirektlink, LINK_PFAD } from '../../shared/src/direktlink';
import { heuteIn, verschiebe } from '../../shared/src/sichten';
import { ladeBeispiele } from '../src/beispiele';
import { speicherDateien } from '../src/dateispeicher';
import { Dienst } from '../src/dienst';
import { speicherEinstellungen } from '../src/einstellungen';
import { Fachfehler } from '../src/fehler';
import type { Repo } from '../src/repo';
import { speicherRepo } from '../src/repo-speicher';

const ICH = { id: '00000000-0000-4000-8000-0000000000aa', rolle: 'admin' };

/** Im Arbeitsspeicher oder – mit TEST_DATABASE_URL – in einer eigenen PostgreSQL-Datenbank. */
let neuesRepo: () => Promise<Repo> = async () => speicherRepo();

async function mitBeispielen() {
  const d = new Dienst(await neuesRepo(), speicherDateien(), { einstellungen: speicherEinstellungen() });
  await ladeBeispiele(d, null);
  const typen = await d.listeTypen();
  return { d, typen, typ: (n: string) => typen.find((t) => t.name === n)! };
}
const lies = (q: string, typen: Parameters<typeof liesDirektlink>[1]) => liesDirektlink(new URLSearchParams(q), typen);
const titel = async (d: Dienst, link: string, extra: Record<string, unknown> = {}) =>
  (await d.seite(ICH, { sicht: 'link', link, anzahl: 500, ...extra })).mappen.map((m) => m.titel);

function faelle() {
describe('Sprechende Links (#98)', () => {
  it('liest Typ, Felder, Operatoren, dynamische Werte und Sortierung', async () => {
    const { typen } = await mitBeispielen();
    const r = lies('typ=rechnung&rechnungsnummer=A-2020-11380&bezahlt=nein&betrag.groesser=1.234,50&rechnungsdatum.zwischen=heute-30tage..heute+1monat&sortierung=-rechnungsdatum', typen);
    assert.ok(r.ok, JSON.stringify(r));
    assert.equal(r.link.typ.name, 'Rechnung', 'Typ ohne Groß-/Kleinschreibung');
    assert.deepEqual(r.link.bedingungen, [
      { art: 'feld', feld: 'rechnungsnummer', op: 'gleich', wert: { art: 'fest', wert: 'A-2020-11380' } },
      { art: 'feld', feld: 'bezahlt', op: 'nein' },
      { art: 'feld', feld: 'betrag', op: 'groesser', wert: { art: 'fest', wert: 1234.5 } },
      { art: 'feld', feld: 'rechnungsdatum', op: 'zwischen', wert: { art: 'heute', versatz: -30, einheit: 'tage' }, bis: { art: 'heute', versatz: 1, einheit: 'monate' } },
    ]);
    assert.deepEqual(r.link.sortierung, { spalte: 'rechnungsdatum', absteigend: true });
    // „+“ kommt in Adressen oft als Leerzeichen an.
    const plus = lies('typ=Vertrag&kuendigung_bis.zwischen=heute..heute+12monate', typen);
    assert.ok(plus.ok);
    assert.deepEqual(plus.link.bedingungen[0], { art: 'feld', feld: 'kuendigung_bis', op: 'zwischen', wert: { art: 'heute', versatz: 0, einheit: 'tage' }, bis: { art: 'heute', versatz: 12, einheit: 'monate' } });
    const v = lies('typ=Vertrag&zahlungszyklus=Monatlich,jährlich&beginn.imZeitraum=jahr-4&vertragsnummer.nichtleer&_erstelltVon=ich&beginn=01.04.2023', typen);
    assert.ok(v.ok, JSON.stringify(v));
    assert.deepEqual(v.link.bedingungen.map((b) => b.art === 'feld' && [b.feld, b.op, b.wert]), [
      ['zahlungszyklus', 'einerVon', { art: 'fest', wert: ['monatlich', 'jährlich'] }],
      ['beginn', 'imZeitraum', { art: 'jahr', versatz: -4 }],
      ['vertragsnummer', 'nichtLeer', undefined],
      ['_erstelltVon', 'zeigtAuf', { art: 'ich' }],
      ['beginn', 'gleich', { art: 'fest', wert: '2023-04-01' }],
    ]);
    assert.match(beschreibeDirektlink(r.link), /^Rechnung: Rechnungsnummer ist gleich „A-2020-11380“, Bezahlt nein/);
  });

  it('meldet jeden Fehler, statt ihn zu übergehen', async () => {
    const { typen } = await mitBeispielen();
    const fehler = (q: string) => { const r = lies(q, typen); assert.ok(!r.ok, q); return r.fehler.join(' | '); };
    assert.match(fehler('rechnungsnummer=1'), /fehlt der Mappentyp/);
    assert.match(fehler('typ=Rechnungen'), /Mappentyp „Rechnungen“ gibt es nicht/);
    assert.match(fehler('typ=Rechnung&rechnungsnumer=1'), /Feld „rechnungsnumer“ gibt es bei Rechnung nicht/);
    assert.match(fehler('typ=Rechnung&betrag.ungefaehr=1'), /Operator „ungefaehr“ gibt es nicht/);
    assert.match(fehler('typ=Rechnung&betrag.enthaelt=1'), /passt nicht zum Feld „Rechnungsbetrag“/);
    assert.match(fehler('typ=Rechnung&betrag=viel'), /keine Zahl/);
    assert.match(fehler('typ=Rechnung&rechnungsdatum=31.02.2026'), /kein Datum/);
    assert.match(fehler('typ=Rechnung&rechnungsdatum.zwischen=2026-01-01'), /zwei Werte/);
    assert.match(fehler('typ=Rechnung&bezahlt=vielleicht'), /nur ja oder nein/);
    assert.match(fehler('typ=Rechnung&aussteller=Stadtwerke'), /nur „ich“/);
    assert.match(fehler('typ=Vertrag&zahlungszyklus=wöchentlich'), /gibt es in der Auswahlliste/);
    assert.match(fehler('typ=Rechnung&sortierung=aussteller'), /nicht sortieren/);
    assert.ok(lies('typ=Rechnung&rechnungsnummer=heute', typen).ok, 'bei Text ist „heute“ ein gewöhnlicher Wert');
    const beide = lies('typ=Rechnung&a.b.c=1&betrag=x', typen);
    assert.ok(!beide.ok && beide.fehler.length === 2, 'alle Fehler auf einmal');
  });

  it('findet die Mappen eines Links, sortiert und mit klarer Meldung bei Fehlern', async () => {
    const { d } = await mitBeispielen();
    assert.deepEqual(await titel(d, 'typ=Rechnung&rechnungsnummer=r-2026-117'), ['R-2026-117 vom 02.03.2026'], 'Text ohne Groß-/Kleinschreibung');
    assert.deepEqual(await titel(d, 'typ=Rechnung&bezahlt=ja'), ['JA-2025-0815 vom 15.01.2026']);
    assert.deepEqual(await titel(d, 'typ=Rechnung&sortierung=-rechnungsdatum'), ['R-2026-117 vom 02.03.2026', 'JA-2025-0815 vom 15.01.2026']);
    assert.deepEqual(await titel(d, 'typ=Rechnung&sortierung=-rechnungsdatum', { sortierung: 'rechnungsdatum', absteigend: 'false' }),
      ['JA-2025-0815 vom 15.01.2026', 'R-2026-117 vom 02.03.2026'], 'Sortierung der Liste geht vor');
    assert.deepEqual(await titel(d, 'typ=Rechnung&betrag.zwischen=100..200'), ['R-2026-117 vom 02.03.2026']);
    assert.deepEqual(await titel(d, 'typ=Rechnung&rechnungsnummer=gibtsnicht'), []);
    const morgen = verschiebe(heuteIn(), 1);
    assert.deepEqual(await titel(d, `typ=Rechnung&rechnungsdatum.groesser=${morgen}`), []);
    await assert.rejects(d.seite(ICH, { sicht: 'link', link: 'typ=Rechnung&rechnungsnumer=1' }),
      (e: unknown) => e instanceof Fachfehler && e.status === 422 && /rechnungsnumer/.test(e.message));
  });

  it('baut Links aus einem eindeutigen Feld oder aus den Titelfeldern, die wieder zur Mappe führen', async () => {
    const { d, typ } = await mitBeispielen();
    const mappen = await d.listeMappen();
    const vertrag = mappen.find((m) => m.werte.vertragsnummer === 'SV-4711')!;
    const l = linkZuMappe(typ('Vertrag'), vertrag)!;
    assert.equal(l, `${LINK_PFAD}?typ=vertrag&vertragsnummer=SV-4711`, 'eindeutiges Feld');
    const rechnung = mappen.find((m) => m.werte.rechnungsnummer === 'R-2026-117')!;
    const lr = linkZuMappe(typ('Rechnung'), rechnung)!;
    assert.equal(lr, `${LINK_PFAD}?typ=rechnung&rechnungsnummer=R-2026-117&rechnungsdatum=2026-03-02`, 'Titelfelder');
    for (const m of mappen) {
      const t = (await d.listeTypen()).find((x) => x.id === m.typId)!;
      const link = linkZuMappe(t, m);
      if (!link) continue;
      const ids = (await d.seite(ICH, { sicht: 'link', link: link.split('?')[1], anzahl: 500 })).mappen.map((x) => x.id);
      assert.ok(ids.includes(m.id), `${link} findet ${m.titel}`);
    }
    // Felder mit festem Parameternamen gehen über „feld.operator“.
    const t = await d.legeTypAn({ name: 'Ding', felder: [{ key: 'typ', label: 'Typ', typ: 'text', eindeutig: true }] });
    const m = await d.legeMappeAn({ typId: t.id, werte: { typ: 'Laptop' } });
    const ld = linkZuMappe(t, m)!;
    assert.equal(ld, `${LINK_PFAD}?typ=ding&typ.gleich=Laptop`);
    assert.deepEqual((await d.seite(ICH, { sicht: 'link', link: ld.split('?')[1] })).mappen.map((x) => x.id), [m.id]);
  });
});
}

faelle();

const url = process.env.TEST_DATABASE_URL;
describe('Sprechende Links in PostgreSQL', { skip: url ? false : 'TEST_DATABASE_URL nicht gesetzt' }, () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let haupt: any; let sql: any;
  const db = `dms_direktlink_${process.pid}`;
  before(async () => {
    const { verbinde, migriere } = await import('../src/db');
    haupt = verbinde(url!);
    await haupt.unsafe(`DROP DATABASE IF EXISTS ${db}`);
    await haupt.unsafe(`CREATE DATABASE ${db}`);
    const u = new URL(url!); u.pathname = `/${db}`;
    sql = verbinde(u.toString());
    await migriere(sql, fileURLToPath(new URL('../migrations', import.meta.url)), () => {});
    const { pgRepo } = await import('../src/repo-pg');
    const { randomUUID } = await import('node:crypto');
    const h0 = randomUUID();
    await sql`INSERT INTO haushalte (id, name) VALUES (${h0}, 'Test')`;
    await sql`INSERT INTO benutzer (id, haushalt_id, email, name, rolle) VALUES (${ICH.id}, ${h0}, 'ich@example.org', 'Ich', 'admin')`;
    neuesRepo = async () => {
      const h = randomUUID();
      await sql`INSERT INTO haushalte (id, name) VALUES (${h}, 'Test')`;
      return pgRepo(sql, h);
    };
  });
  after(async () => {
    neuesRepo = async () => speicherRepo();
    await sql?.end();
    await haupt?.unsafe(`DROP DATABASE IF EXISTS ${db}`);
    await haupt?.end();
  });
  faelle();
});
