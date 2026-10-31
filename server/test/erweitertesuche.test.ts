/** Erweiterte Suche (#199): Typen wählen, gemeinsame Felder, Volltext in Dokumenten und Notizen. */
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import { abfrageAus, alsParameter, chipsVon, leeresFormular, liesSuche, ohneChip, suchfelder, zeitraumVon } from '../../shared/src/erweitertesuche';
import { ALLES } from '../../shared/src/rechte';
import { speicherDateien } from '../src/dateispeicher';
import { Dienst } from '../src/dienst';
import { speicherEinstellungen } from '../src/einstellungen';
import { Fachfehler } from '../src/fehler';
import { Konten } from '../src/konten';
import { speicherKontoRepo } from '../src/konto-repo';
import type { Repo } from '../src/repo';
import { speicherRepo } from '../src/repo-speicher';
import { Tresor } from '../src/tresor';

const ICH = { id: '00000000-0000-4000-8000-0000000000aa', rolle: 'admin' };

const offen: Array<{ end(): Promise<void> }> = [];
async function repo(pg: boolean): Promise<Repo> {
  if (!pg) return speicherRepo();
  const { ausUrl, alsUrl, legeDatenbankAn } = await import('../src/anbindung');
  const { verbinde, migriere } = await import('../src/db');
  const { pgRepo } = await import('../src/repo-pg');
  const a = { ...ausUrl(process.env.TEST_DATABASE_URL)!, datenbank: `dms_es_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}` };
  await legeDatenbankAn(a);
  const sql = verbinde(alsUrl(a));
  offen.push(sql);
  await migriere(sql, new URL('../migrations', import.meta.url).pathname, () => {});
  return pgRepo(sql, '00000000-0000-4000-8000-000000000001') as never;
}

/** Händler, Rechnungen und Gutschriften mit gemeinsamen Feldern; je Rechnung ein Dokument mit Text. */
async function aufbau(r: Repo) {
  const d = new Dienst(r, speicherDateien(), { einstellungen: speicherEinstellungen() });
  const partner = await d.legeTypAn({ name: 'Partner', schluessel: 'partner', titelVorlage: '{name}', felder: [{ key: 'name', label: 'Name', typ: 'text', pflicht: true }] });
  const felder = [
    { key: 'nr', label: 'Nummer', typ: 'text' as const, pflicht: true },
    { key: 'rechnungsdatum', label: 'Rechnungsdatum', typ: 'datum' as const },
    { key: 'vertragspartner', label: 'Vertragspartner', typ: 'referenz' as const, zielTyp: partner.id },
    { key: 'betrag', label: 'Betrag', typ: 'betrag' as const },
  ];
  const rechnung = await d.legeTypAn({ name: 'Rechnung', schluessel: 'rechnung', titelVorlage: '{nr}', felder: [...felder,
    { key: 'bezahlt', label: 'Bezahlt', typ: 'janein' }, { key: 'art', label: 'Art', typ: 'auswahl', optionen: ['Elektro', 'Möbel', 'Sonstiges'] }, { key: 'pw', label: 'Kennwort', typ: 'passwort' }] });
  const gutschrift = await d.legeTypAn({ name: 'Gutschrift', schluessel: 'gutschrift', titelVorlage: '{nr}', felder });
  const p = async (name: string) => (await d.legeMappeAn({ typId: partner.id, werte: { name } })).id;
  const P = { mm: await p('MediaMarkt'), saturn: await p('Saturn'), otto: await p('Otto'), ikea: await p('Ikea') };
  const mappe = async (typId: string, nr: string, datum: string, vp: string, text: string, extra: Record<string, unknown> = {}) => {
    const m = await d.legeMappeAn({ typId, werte: { nr, rechnungsdatum: datum, vertragspartner: vp, betrag: { betrag: 100, waehrung: 'EUR' }, ...extra } });
    const { dokument } = await d.ladeHoch(m.id, { register: 'dokumente', name: `${nr}.txt`, typ: 'text/plain' }, Buffer.from(nr), null);
    await r.ocrSetze(dokument.id, { stand: 'fertig', text });
    return m;
  };
  await mappe(rechnung.id, 'R-1', '2025-05-10', P.mm, 'Rechnung über einen Backofen mit Umluft', { bezahlt: true, art: 'Elektro' });
  await mappe(rechnung.id, 'R-2', '2025-02-01', P.saturn, 'Backofen, aber zu früh');
  await mappe(rechnung.id, 'R-3', '2025-08-15', P.ikea, 'Backofen bei Ikea');
  await mappe(rechnung.id, 'R-4', '2025-09-01', P.otto, 'Kühlschrank', { art: 'Möbel' });
  const r5 = await mappe(rechnung.id, 'R-5', '2025-11-30', P.saturn, 'Waschmaschine');
  await d.legeNotizAn(r5.id, 'Kam zusammen mit dem Backofen', null);
  await mappe(gutschrift.id, 'G-1', '2025-06-01', P.otto, 'Gutschrift Backofen');
  await mappe(gutschrift.id, 'G-2', '2026-01-10', P.mm, 'Gutschrift Backofen später');
  return { d, partner, rechnung, gutschrift, P };
}

const treffer = async (d: Dienst, q: string, ich = ICH, extra: Record<string, unknown> = {}) =>
  (await d.seite(ich, { sicht: 'suche', link: q, anzahl: 500, ...extra })).mappen.map((m) => m.titel).sort();

describe('Erweiterte Suche: Formular und Adresse (#199)', () => {
  it('liest und schreibt die Adresse, Chips entfernen einzelne Bedingungen', () => {
    const f = liesSuche(new URLSearchParams('typ=rechnung&rechnungsdatum.von=01.03.2025&rechnungsdatum.bis=2025-11-30&vertragspartner=a&vertragspartner=b&volltext=Backofen&leer.wert=x&nr.leer=1'));
    assert.deepEqual(f.typen, ['rechnung']);
    assert.deepEqual(f.felder.rechnungsdatum, { von: '01.03.2025', bis: '2025-11-30' });
    assert.deepEqual(f.felder.vertragspartner.werte, ['a', 'b']);
    assert.equal(f.felder.nr.leer, 'leer');
    assert.equal(f.inDokumenten && f.inNotizen, true, 'ohne „in“: beide');
    const zurueck = liesSuche(alsParameter(f));
    assert.deepEqual(zurueck, f);
    assert.match(alsParameter({ ...leeresFormular(), felder: { typ: { werte: ['x'] } } }).toString(), /typ\.wert=x/, 'reservierte Namen mit .wert');
    assert.deepEqual(liesSuche(new URLSearchParams('volltext=x&in=notizen')).inDokumenten, false);
    const typen = [{ id: 't', name: 'Rechnung', schluessel: 'rechnung', felder: [{ key: 'rechnungsdatum', label: 'Rechnungsdatum', typ: 'datum' }, { key: 'vertragspartner', label: 'Vertragspartner', typ: 'referenz', zielTyp: 'p' }] }] as never;
    const chips = chipsVon(f, typen, (id) => id.toUpperCase(), (id) => id);
    assert.deepEqual(chips.map((c) => c.text), ['Rechnung', 'Rechnungsdatum 01.03.2025–30.11.2025', 'Vertragspartner: A, B', '„Backofen“ in Dokumenten oder Notizen']);
    assert.equal(ohneChip(f, 'vertragspartner').felder.vertragspartner, undefined);
    assert.equal(ohneChip(f, 'volltext').volltext, '');
    assert.deepEqual(abfrageAus(f, typen).entfallen.sort(), ['leer', 'nr']);
  });

  it('Schnellwahl für Zeiträume', () => {
    assert.deepEqual(zeitraumVon('letztesJahr', '2026-10-31'), ['2025-01-01', '2025-12-31']);
    assert.deepEqual(zeitraumVon('dieserMonat', '2026-02-10'), ['2026-02-01', '2026-02-28']);
    assert.deepEqual(zeitraumVon('letzterMonat', '2026-01-10'), ['2025-12-01', '2025-12-31']);
    assert.deepEqual(zeitraumVon('zwoelfMonate', '2026-10-31'), ['2025-11-01', '2026-10-31']);
  });
});

function faelle(pg: boolean) {
  describe(`Erweiterte Suche (#199)${pg ? ' – PostgreSQL' : ''}`, { skip: pg && !process.env.TEST_DATABASE_URL && 'ohne TEST_DATABASE_URL' }, () => {
    it('das Beispiel: Rechnung, März–November, drei Händler, „Backofen“', async () => {
      const { d, P } = await aufbau(await repo(pg));
      const q = `typ=rechnung&rechnungsdatum.von=2025-03-01&rechnungsdatum.bis=2025-11-30&vertragspartner=${P.mm}&vertragspartner=${P.saturn}&vertragspartner=${P.otto}&volltext=Backofen`;
      assert.deepEqual(await treffer(d, q), ['R-1', 'R-5']);
      const s = await d.seite(ICH, { sicht: 'suche', link: q });
      assert.equal(s.ausschnitte?.[s.mappen.find((m) => m.titel === 'R-5')!.id]?.dokument, 'Notiz');
      assert.ok(s.ausschnitte?.[s.mappen.find((m) => m.titel === 'R-1')!.id]?.text.includes('Backofen'));
    });

    it('gemeinsame Felder mehrerer Typen; ohne Typ nur Systemfelder', async () => {
      const { d, P, rechnung, gutschrift } = await aufbau(await repo(pg));
      assert.deepEqual(suchfelder([rechnung, gutschrift]).map((f) => f.key), ['nr', 'rechnungsdatum', 'vertragspartner', 'betrag', '_erstellt', '_geaendert', '_erstelltVon', '_geaendertVon']);
      assert.ok(!suchfelder([rechnung]).some((f) => f.key === 'pw'), 'nie Passwortfelder');
      assert.deepEqual(await treffer(d, `typ=rechnung&typ=gutschrift&vertragspartner=${P.otto}`), ['G-1', 'R-4']);
      assert.deepEqual((await treffer(d, 'volltext=Backofen&in=dokumente')), ['G-1', 'G-2', 'R-1', 'R-2', 'R-3']);
      await assert.rejects(d.seite(ICH, { sicht: 'suche', link: 'typ=gibtsnicht' }), (e) => e instanceof Fachfehler && e.status === 422);
    });

    it('Datum nur von bzw. nur bis, Zahlen, Ja/Nein, Auswahl, Text, leer', async () => {
      const { d } = await aufbau(await repo(pg));
      assert.deepEqual(await treffer(d, 'typ=rechnung&rechnungsdatum.von=2025-09-01'), ['R-4', 'R-5']);
      assert.deepEqual(await treffer(d, 'typ=rechnung&typ=gutschrift&rechnungsdatum.bis=01.02.2025'), ['R-2']);
      assert.deepEqual(await treffer(d, 'typ=rechnung&betrag.von=100&betrag.bis=100,00&bezahlt=ja'), ['R-1']);
      assert.deepEqual(await treffer(d, 'typ=rechnung&bezahlt=nein'), ['R-2', 'R-3', 'R-4', 'R-5']);
      assert.deepEqual(await treffer(d, 'typ=rechnung&art=Elektro&art=möbel'), ['R-1', 'R-4']);
      assert.deepEqual(await treffer(d, 'typ=rechnung&art.leer=1'), ['R-2', 'R-3', 'R-5']);
      assert.deepEqual(await treffer(d, 'typ=rechnung&nr=r-3'), ['R-3']);
      await assert.rejects(d.seite(ICH, { sicht: 'suche', link: 'typ=rechnung&rechnungsdatum.von=gestern' }), /kein Datum/);
    });

    it('Volltext nur in Notizen, nur in Dokumenten, in beiden', async () => {
      const { d } = await aufbau(await repo(pg));
      assert.deepEqual(await treffer(d, 'typ=rechnung&volltext=Backofen&in=notizen'), ['R-5']);
      assert.deepEqual(await treffer(d, 'typ=rechnung&volltext=Backofen&in=dokumente'), ['R-1', 'R-2', 'R-3']);
      assert.deepEqual(await treffer(d, 'typ=rechnung&volltext=Backofen&in=dokumente&in=notizen'), ['R-1', 'R-2', 'R-3', 'R-5']);
      // Mit der normalen Suche zusammen: beides muss passen.
      assert.deepEqual(await treffer(d, 'typ=rechnung&volltext=Backofen', ICH, { suche: 'R-3' }), ['R-3']);
    });
  });
}

describe('Erweiterte Suche: Rechte (#199)', () => {
  it('nur lesbare Mappen – auch über einen geteilten Link', async () => {
    const tresor = new Tresor(speicherEinstellungen(), join(await mkdtemp(join(tmpdir(), 'dms-es-')), 'dms.schluessel'), () => null);
    await tresor.laden(); await tresor.erzeuge();
    const d = new Dienst(speicherRepo(), speicherDateien(), { einstellungen: speicherEinstellungen(), tresor });
    const konten = new Konten(speicherKontoRepo(), null, 'http://nas', d.benutzerspiegel());
    const { benutzer: admin } = await konten.einrichten({ email: 'admin@example.org', name: 'Admin', passwort: 'ein-langes-passwort' });
    const max = (await konten.legeBenutzerAn({ email: 'max@example.org', name: 'Max', rolle: 'mitglied' }, admin.id)).benutzer;
    await d.gleicheBenutzerAb(await konten.listeBenutzer());
    const t = await d.legeTypAn({ name: 'Vertrag', schluessel: 'vertrag', titelVorlage: '{name}', felder: [
      { key: 'name', label: 'Name', typ: 'text' }, { key: 'privat', label: 'Privat', typ: 'janein' },
    ] });
    await d.setzeBerechtigungen(t.id, { grund: ALLES, regeln: [
      { id: 'p', name: 'Privat', wenn: [{ art: 'feld', bedingung: { art: 'feld', feld: 'privat', op: 'ja' } }], dann: { R: 'entziehen' }, stopp: true },
    ] }, true);
    const strom = await d.legeMappeAn({ typId: t.id, werte: { name: 'Strom', privat: false } }, admin.id);
    const geheim = await d.legeMappeAn({ typId: t.id, werte: { name: 'Geheim', privat: true } }, admin.id);
    await d.legeNotizAn(strom.id, 'Vertrag kündigen', admin.id);
    await d.legeNotizAn(geheim.id, 'Vertrag kündigen', admin.id);
    const link = 'typ=vertrag&volltext=kündigen&in=notizen';
    const a = { id: admin.id, rolle: 'admin' };
    assert.deepEqual(await treffer(d, link, a, { }), ['Geheim', 'Strom']);
    const m = { id: max.id, rolle: 'mitglied' };
    const z = await d.zugriff(m);
    assert.deepEqual((await d.seite(m, { sicht: 'suche', link, anzahl: 500 }, z)).mappen.map((x) => x.titel), ['Strom']);
    assert.deepEqual((await d.trefferIds(m, { sicht: 'suche', link }, z)).ids, [strom.id], 'Auswahl „alle Treffer“');
  });
});

faelle(false);
faelle(true);
after(async () => { for (const s of offen) await s.end(); });

it('Suche: Parameternamen verändern Object.prototype nicht (#292)', () => {
  const f = liesSuche(new URLSearchParams('__proto__.von=x&__proto__=y&constructor.von=z&prototype.bis=w&constructor.prototype.leer=1&typ=rechnung'));
  const leer = {} as Record<string, unknown>;
  for (const k of ['von', 'bis', 'leer', 'werte']) assert.equal(leer[k], undefined, k);
  for (const k of ['__proto__', 'constructor', 'prototype']) assert.equal(Object.hasOwn(f.felder, k), false, k);
  assert.equal(Object.getPrototypeOf(f.felder), Object.prototype);
  assert.deepEqual(f.typen, ['rechnung']);
  // Normale Felder gehen weiter.
  assert.deepEqual(liesSuche(new URLSearchParams('betrag.von=1')).felder.betrag, { von: '1' });
});
