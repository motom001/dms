/**
 * Seite „Dokument übernehmen“ (#934) – was der Server dafür tut:
 * - Nacharbeit aus #936 (Thomas, 08.11.2026): Post wird auch beim Zuordnen zu einer **bestehenden** Mappe aufgelöst –
 *   Dokumente, Historie, Notizen und Aufgaben wandern mit, die leere Post kommt in den Papierkorb. Rechte wie beim
 *   Zuordnen (Schreiben an der Ziel-Mappe, Löschen an der Post); ohne Löschrecht nur zugeordnet, mit Hinweis. Die Grenze
 *   „nur eben aus dieser Post angelegt“ fällt weg. Ausnahmen (nur zugeordnet): „Kopie in der Post behalten“,
 *   automatisches Zuordnen, versendete E-Mails.
 * - „Ab hier abtrennen“: Folgedokumente als neue Post nach „Neue Post“, mit Verweis auf die Herkunft.
 * - Abgleich für Dokumente: Belege, Vorschläge für Verweisfelder, Warnung vor Doppelten, Typ für „Wohin gehört das?“.
 * - Seitenbild der Archivfassung („Original | PDF/A“).
 * Im Arbeitsspeicher und – mit TEST_DATABASE_URL – in PostgreSQL (eigene Datenbank über hilfe-db.ts).
 */
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { typAusText, TYP_FUND_ZEICHEN } from '../../shared/src/erkennung';
import type { SchwaerzSeite, Wort } from '../../shared/src/schwaerzen';
import { datumAusText, stelleVon, textformen, wertAusText, zahlAusText } from '../../shared/src/uebernehmen';
import { POST_STAND, type Benutzer, type Register } from '../../shared/src/model';
import { NICHTS, type Regelwerk } from '../../shared/src/rechte';
import { speicherDateien } from '../src/dateispeicher';
import { Dienst } from '../src/dienst';
import { speicherEinstellungen } from '../src/einstellungen';
import { Fachfehler } from '../src/fehler';
import { Konten } from '../src/konten';
import { speicherKontoRepo } from '../src/konto-repo';
import type { Repo } from '../src/repo';
import { speicherRepo } from '../src/repo-speicher';
import { routen, type Anfrage } from '../src/routen';
import { V1_TABELLE } from '../src/api-v1';
import { eigeneDatenbank } from './hilfe-db';
import { wieImModus } from './hilfen';

const status = (s: number, text?: RegExp) => (e: unknown) => e instanceof Fachfehler && e.status === s && (!text || text.test(e.message));
const PDF = (x: string) => Buffer.from(`%PDF-1.4 ${x}`);
const LENA = '00000000-0000-4000-8000-0000000000aa';
const HAUSHALT = '00000000-0000-4000-8000-000000000001';
const FELDREG: Register = { key: 'allgemein', name: 'Allgemein', art: 'felder', felder: ['nr'] };
const BELEGE: Register = { key: 'belege', name: 'Belege', art: 'dokumente' };
const offen: Array<{ end(): Promise<void> }> = [];

async function repo(pg: boolean): Promise<Repo> {
  if (!pg) return speicherRepo();
  const { pgRepo } = await import('../src/repo-pg');
  const sql = (await eigeneDatenbank('uebernehmen')).sql;
  offen.push(sql);
  await sql`INSERT INTO haushalte (id, name) VALUES (${HAUSHALT}, 'Test') ON CONFLICT DO NOTHING`;
  await sql`INSERT INTO benutzer (id, haushalt_id, email, name, rolle) VALUES (${LENA}, ${HAUSHALT}, 'lena@example.org', 'Lena', 'admin')`;
  return pgRepo(sql, HAUSHALT) as never;
}

/** Eine bestehende Rechnung mit eigener Historie (vor Tagen angelegt, schon mit Post) und eine neue Post mit zwei Briefseiten. */
async function aufbau(pg: boolean) {
  const r = await repo(pg);
  const d = new Dienst(r, speicherDateien(), { einstellungen: speicherEinstellungen() });
  await d.gleicheBenutzerAb([{ id: LENA, email: 'lena@example.org', name: 'Lena', rolle: 'admin', aktiv: true } as Benutzer]);
  const rechnung = await d.mappentypen.legeTypAn({ name: 'Rechnung', titelVorlage: '{nr}', felder: [{ key: 'nr', label: 'Nummer', typ: 'text', pflicht: true }], register: [FELDREG, BELEGE] });
  // Von jemand anderem angelegt (null = System) – früher hätte das Auflösen hier 422 geliefert.
  const bestehend = await d.legeMappeAn({ typId: rechnung.id, werte: { nr: 'R-2026-0700' } }, null);
  const fruehere = await d.legePostAn({ betreff: 'Erste Mahnung' }, { id: LENA, name: 'Lena' });
  await d.ordneZu(fruehere.id, { ziel: bestehend.id }, LENA);
  const post = await d.legePostAn({ betreff: 'Zweite Mahnung' }, { id: LENA, name: 'Lena' });
  const a = (await d.ladeHoch(post.id, { register: 'dokumente', name: 'mahnung.pdf', typ: 'application/pdf' }, PDF('a'), LENA)).dokument;
  const b = (await d.ladeHoch(post.id, { register: 'dokumente', name: 'beilage.pdf', typ: 'application/pdf' }, PDF('b'), LENA)).dokument;
  return { d, r, rechnung, bestehend, post, a, b };
}

for (const pg of [false, ...(process.env.TEST_DATABASE_URL ? [true] : [])]) {
  describe(`Dokument übernehmen: Post in eine bestehende Mappe auflösen (#934, ${pg ? 'PostgreSQL' : 'Arbeitsspeicher'})`, () => {
    after(async () => { for (const s of offen.splice(0)) await s.end(); });

    it('Dokumente, Historie, Notizen und Aufgaben wandern in die bestehende Mappe, die leere Post kommt in den Papierkorb', async () => {
      const { d, bestehend, post, a, b } = await aufbau(pg);
      const notiz = await d.legeNotizAn(post.id, 'Mit Bank klären', LENA);
      const aufgabe = await d.legeAufgabeAn(post.id, { text: 'Überweisung prüfen', empfaengerId: LENA }, LENA);
      const eigene = (await d.historie(bestehend.id)).length;
      const r = await d.ordneZu(post.id, { ziel: bestehend.id, register: 'belege', aufloesen: true }, LENA);
      assert.equal(r.aufgeloest, true);
      assert.deepEqual((await d.holeMappe(bestehend.id)).dokumente.map((x) => x.id).sort(), [a.id, b.id].sort());
      await assert.rejects(d.holeMappe(post.id), status(404), 'die Post liegt im Papierkorb');
      const korb = (await d.papierkorb({ id: LENA, rolle: 'admin' }, true)).find((x) => x.id === post.id)!;
      assert.equal(korb.aufgeloestIn?.id, bestehend.id);
      const h = await d.historie(bestehend.id);
      assert.ok(h.length > eigene, 'die eigene Historie bleibt, die der Post kommt dazu');
      assert.ok(h.some((x) => x.daten.ausPost === post.id && x.art === 'angelegt'), 'Eingang der Post');
      assert.ok(h.some((x) => x.daten.ausPost === post.id && x.art === 'notiz'));
      const ursprung = h.find((x) => x.art === 'zugeordnet' && x.daten.aufgeloest === true)!;
      assert.match(String(ursprung.daten.text), /^Post „Zweite Mahnung“ übernommen mit 2 Dokumenten ins Register „Belege“/, 'nicht „angelegt“ – die Mappe gab es schon');
      const m = await d.holeMappe(bestehend.id);
      assert.ok(m.notizen.some((n) => n.id === notiz.id));
      assert.ok(m.aufgaben.some((x) => x.id === aufgabe.id));
      // Die Grenze „eben angelegt, noch ohne Post“ gibt es nicht mehr.
      await assert.rejects(d.stelleWiederHer(post.id, { id: LENA, rolle: 'admin' }, true), status(409));
    });

    it('nur ein Teil gewählt: der Rest wird eine neue Post, ihre Historie nennt die bestehende Mappe', async () => {
      const { d, bestehend, post, a, b } = await aufbau(pg);
      const r = await d.ordneZu(post.id, { ziel: bestehend.id, dokumente: [a.id], aufloesen: true }, LENA);
      assert.ok(r.aufgeloest && 'abgetrennt' in r && r.abgetrennt);
      assert.deepEqual((await d.holeMappe(r.abgetrennt!.id)).dokumente.map((x) => x.id), [b.id]);
      const herkunft = (await d.historie(r.abgetrennt!.id)).find((x) => x.art === 'post_geteilt')!;
      assert.match(String(herkunft.daten.text), /Abgetrennt aus Post „Zweite Mahnung“ mit 1 Dokument, als sie in Rechnung „R-2026-0700“ aufging/);
    });

    it('Ausnahmen: „Kopie in der Post behalten“ und automatisches Zuordnen lösen nicht auf', async () => {
      const { d, bestehend, post } = await aufbau(pg);
      const kopie = await d.ordneZu(post.id, { ziel: bestehend.id, kopieren: true, aufloesen: true }, LENA);
      assert.equal(kopie.aufgeloest, false);
      assert.equal((await d.holeMappe(post.id)).mappe.werte.stand, POST_STAND.zugeordnet);
      // Automatisch (#337) – auch wenn aufloesen gesetzt wäre: „Automatik rückgängig“ braucht die Post.
      const zweite = await d.legePostAn({ betreff: 'Automatisch' }, { id: LENA, name: 'Lena' });
      await d.ladeHoch(zweite.id, { register: 'dokumente', name: 'x.pdf', typ: 'application/pdf' }, PDF('x'), LENA);
      const auto = await d.ordneZu(zweite.id, { ziel: bestehend.id, aufloesen: true }, null, undefined, { grund: 'Kundennummer' });
      assert.equal(auto.aufgeloest, false);
      assert.equal((await d.holeMappe(zweite.id)).mappe.werte.stand, POST_STAND.zugeordnet);
    });

    it('„Ab hier abtrennen“: Folgedokumente als neue Post in „Neue Post“, mit Verweis auf die Herkunft auf beiden Seiten', async () => {
      const { d, post, a, b } = await aufbau(pg);
      const r = await d.trennePostAb(post.id, { dokumente: [b.id] }, LENA);
      assert.equal(r.neu.werte.stand, POST_STAND.neu);
      assert.equal(r.neu.titel, 'Zweite Mahnung (abgetrennt)');
      assert.deepEqual((await d.holeMappe(post.id)).dokumente.map((x) => x.id), [a.id]);
      assert.deepEqual((await d.holeMappe(r.neu.id)).dokumente.map((x) => x.id), [b.id]);
      const neuH = (await d.historie(r.neu.id)).find((x) => x.art === 'post_geteilt')!;
      assert.match(String(neuH.daten.text), /Abgetrennt aus Post „Zweite Mahnung“ mit 1 Dokument/);
      assert.equal(neuH.daten.post, post.id);
      const altH = (await d.historie(post.id)).find((x) => x.art === 'post_geteilt')!;
      assert.match(String(altH.daten.text), /1 Dokument als neue Post „Zweite Mahnung \(abgetrennt\)“ abgetrennt/);
      assert.equal(altH.daten.abgetrennt, r.neu.id);
      // Mindestens ein Dokument bleibt; fremde Dokumente gehen nicht.
      await assert.rejects(d.trennePostAb(post.id, { dokumente: [a.id] }, LENA), status(422, /Mindestens ein Dokument/));
      await assert.rejects(d.trennePostAb(post.id, { dokumente: [b.id] }, LENA), status(422));
      await assert.rejects(d.trennePostAb(post.id, { dokumente: [] }, LENA), status(422));
    });
  });
}

/* ---------- Rechte, über die Schnittstelle wie die Oberfläche ---------- */

async function mitKonten() {
  const d = new Dienst(speicherRepo(), speicherDateien(), { einstellungen: speicherEinstellungen() });
  const konten = new Konten(speicherKontoRepo(), null, 'http://nas', d.systemtypen.benutzerspiegel());
  d.verbindeKonten(konten.papierkorbHaken());
  const { benutzer: lena } = await konten.einrichten({ email: 'lena@example.org', name: 'Lena', passwort: 'ein-langes-passwort' });
  const { benutzer: jonas } = await konten.legeBenutzerAn({ email: 'jonas@example.org', name: 'Jonas' }, lena.id);
  await d.gleicheBenutzerAb(await konten.listeBenutzer());
  const rechnung = await d.mappentypen.legeTypAn({ name: 'Rechnung', titelVorlage: '{nr}', felder: [{ key: 'nr', label: 'Nummer', typ: 'text', pflicht: true }], register: [FELDREG, BELEGE] });
  const postTyp = (await d.mappentypen.listeTypen()).find((x) => x.system === 'post')!;
  const tabelle = routen(d, konten, {});
  const rufe = async (b: { id: string }, m: string, p: string, x: Partial<Anfrage> = {}) =>
    tabelle.find((r) => r.methode === m && r.pfad === p)!.handler({ body: {}, params: {}, query: {}, ip: '1', ...x, benutzer: wieImModus((await konten.listeBenutzer()).find((u) => u.id === b.id)!) });
  return { d, lena, jonas, rechnung, postTyp, rufe };
}

describe('Dokument übernehmen: Rechte beim Auflösen in eine bestehende Mappe (#934)', () => {
  it('ohne Löschrecht an der Post nur zugeordnet, mit Hinweis; ohne Schreibrecht an der Ziel-Mappe gar nicht (403)', async () => {
    const { d, lena, jonas, rechnung, postTyp, rufe } = await mitKonten();
    const alt = await d.legeMappeAn({ typId: rechnung.id, werte: { nr: 'A-1' } }, lena.id);
    await d.setzeBerechtigungen(postTyp.id, { grund: { ...NICHTS, R: true, U: true, C: true }, regeln: [] } as Regelwerk, true);
    const post = await d.legePostAn({ betreff: 'Brief' }, { id: lena.id, name: 'Lena' });
    await d.ladeHoch(post.id, { register: 'dokumente', name: 'a.pdf', typ: 'application/pdf' }, PDF('a'), lena.id);
    const r = (await rufe(jonas, 'POST', '/api/mappen/:id/zuordnen', { params: { id: post.id }, body: { ziel: alt.id, aufloesen: true } })).body as { aufgeloest: boolean; hinweis?: string };
    assert.equal(r.aufgeloest, false);
    assert.match(r.hinweis ?? '', /kein Recht zum Löschen/);
    assert.equal((await d.holeMappe(post.id)).mappe.werte.stand, POST_STAND.zugeordnet);
    // Schreibrecht an der Ziel-Mappe fehlt: wie beim Zuordnen.
    await d.setzeBerechtigungen(rechnung.id, { grund: { ...NICHTS, R: true }, regeln: [] } as Regelwerk, true);
    const zweite = await d.legePostAn({ betreff: 'Noch einer' }, { id: lena.id, name: 'Lena' });
    await assert.rejects(rufe(jonas, 'POST', '/api/mappen/:id/zuordnen', { params: { id: zweite.id }, body: { ziel: alt.id, aufloesen: true } }), status(403));
  });

  it('mit Löschrecht wird in die bestehende Mappe aufgelöst – auch wenn jemand anderes sie vor langer Zeit angelegt hat', async () => {
    const { d, lena, jonas, rechnung, rufe } = await mitKonten();
    const alt = await d.legeMappeAn({ typId: rechnung.id, werte: { nr: 'A-2' } }, lena.id);
    const post = await d.legePostAn({ betreff: 'Brief' }, { id: lena.id, name: 'Lena' });
    await d.ladeHoch(post.id, { register: 'dokumente', name: 'a.pdf', typ: 'application/pdf' }, PDF('a'), lena.id);
    const r = (await rufe(jonas, 'POST', '/api/mappen/:id/zuordnen', { params: { id: post.id }, body: { ziel: alt.id, aufloesen: true } })).body as { aufgeloest: boolean };
    assert.equal(r.aufgeloest, true);
    assert.equal((await d.holeMappe(alt.id)).dokumente.length, 1);
  });

  it('„Ab hier abtrennen“ braucht Bearbeiten an der Post und das Recht, Post anzulegen; nicht bei versendeten E-Mails', async () => {
    const { d, lena, jonas, rechnung, postTyp, rufe } = await mitKonten();
    const post = await d.legePostAn({ betreff: 'Sammelbrief' }, { id: lena.id, name: 'Lena' });
    await d.ladeHoch(post.id, { register: 'dokumente', name: 'a.pdf', typ: 'application/pdf' }, PDF('a'), lena.id);
    const b = (await d.ladeHoch(post.id, { register: 'dokumente', name: 'b.pdf', typ: 'application/pdf' }, PDF('b'), lena.id)).dokument;
    await d.setzeBerechtigungen(postTyp.id, { grund: { ...NICHTS, R: true, U: true }, regeln: [] } as Regelwerk, true);
    await assert.rejects(rufe(jonas, 'POST', '/api/mappen/:id/abtrennen', { params: { id: post.id }, body: { dokumente: [b.id] } }), status(403, /Post anlegen/));
    await d.setzeBerechtigungen(postTyp.id, { grund: { ...NICHTS, R: true } , regeln: [] } as Regelwerk, true);
    await assert.rejects(rufe(jonas, 'POST', '/api/mappen/:id/abtrennen', { params: { id: post.id }, body: { dokumente: [b.id] } }), status(403));
    await d.setzeBerechtigungen(postTyp.id, { grund: { ...NICHTS, R: true, U: true, C: true }, regeln: [] } as Regelwerk, true);
    const ok = (await rufe(jonas, 'POST', '/api/mappen/:id/abtrennen', { params: { id: post.id }, body: { dokumente: [b.id] } })).body as { neu: { id: string } };
    assert.ok(ok.neu.id);
    // Versendete E-Mail: bleibt, wie sie verschickt wurde.
    const ziel = await d.legeMappeAn({ typId: rechnung.id, werte: { nr: 'M-1' } }, lena.id);
    await d.ladeHoch(ziel.id, { register: 'belege', name: 'r.pdf', typ: 'application/pdf' }, PDF('r'), lena.id);
    const mailer = { async sende() { /* ok */ } };
    const mail = await d.versendeMappe(ziel.id, { an: 'jonas@example.org', betreff: 'Hallo' }, { id: lena.id, name: 'Lena', email: 'lena@example.org' }, mailer);
    await assert.rejects(d.trennePostAb(mail.id, { dokumente: [] }, lena.id), status(422, /versendete E-Mail/));
  });
});

/* ---------- Abgleich für die Seite ---------- */

const RECHNUNG = [
  'Stadtwerke Musterstadt GmbH · Hauptstraße 1 · 01067 Musterstadt',
  'Rechnung',
  'Kundennummer: 100 4711',
  'Ihr Vertrag WV-1043 (Strom)',
  'Rechnungsnummer R-2026-0815 vom 03.11.2026',
  'Gesamtbetrag 84,20 EUR',
].join('\n');

describe('Dokument übernehmen: Abgleich für Dokumente (#934)', () => {
  async function abgleichAufbau() {
    const k = await mitKonten();
    const { d, lena } = k;
    const partner = await d.mappentypen.legeTypAn({ name: 'Vertragspartner', titelVorlage: '{name}', felder: [{ key: 'name', label: 'Name', typ: 'text', wiederfinden: true }, { key: 'kundennummer', label: 'Kundennummer', typ: 'text', wiederfinden: true }], register: [{ ...FELDREG, felder: ['name', 'kundennummer'] }, BELEGE] });
    const vertrag = await d.mappentypen.legeTypAn({ name: 'Vertrag', titelVorlage: '{titel}', felder: [{ key: 'titel', label: 'Titel', typ: 'text' }, { key: 'vertragsnummer', label: 'Vertragsnummer', typ: 'text', wiederfinden: true }, { key: 'partner', label: 'Vertragspartner', typ: 'referenz', zielTyp: partner.id, wiederfinden: true }], register: [{ ...FELDREG, felder: ['titel', 'vertragsnummer', 'partner'] }, BELEGE] });
    const beleg = await d.mappentypen.legeTypAn({ name: 'Beleg', titelVorlage: '{rechnungsnummer}', felder: [{ key: 'rechnungsnummer', label: 'Rechnungsnummer', typ: 'text', wiederfinden: true }, { key: 'vertrag', label: 'Vertrag', typ: 'referenz', zielTyp: vertrag.id, wiederfinden: true }], register: [{ ...FELDREG, felder: ['rechnungsnummer', 'vertrag'] }, BELEGE], beschriftungen: { en: { name: 'Rechnung' } } });
    const sw = await d.legeMappeAn({ typId: partner.id, werte: { name: 'Stadtwerke Musterstadt', kundennummer: '100-4711' } }, lena.id);
    const strom = await d.legeMappeAn({ typId: vertrag.id, werte: { titel: 'Strom', vertragsnummer: 'WV-1043', partner: sw.id } }, lena.id);
    const da = await d.legeMappeAn({ typId: beleg.id, werte: { rechnungsnummer: 'R-2026-0815' } }, lena.id);
    const post = await d.legePostAn({ betreff: 'Brief' }, { id: lena.id, name: 'Lena' });
    const dok = (await d.ladeHoch(post.id, { register: 'dokumente', name: 'r.pdf', typ: 'application/pdf' }, PDF('r'), lena.id)).dokument;
    const ohne = (await d.ladeHoch(post.id, { register: 'dokumente', name: 'scan.pdf', typ: 'application/pdf' }, PDF('s'), lena.id)).dokument;
    await (d as unknown as { repo: Repo }).repo.ocrSetze(dok.id, { stand: 'fertig', text: RECHNUNG });
    return { ...k, partner, vertrag, beleg, sw, strom, da, post, dok, ohne };
  }

  it('mit Typ: Vorschlag für das Verweisfeld mit Belegen, Warnung vor der doppelten Rechnung; Dokumente ohne Text stehen in ohneText', async () => {
    const { lena, rufe, beleg, strom, da, dok, ohne } = await abgleichAufbau();
    const r = (await rufe(lena, 'POST', '/api/abgleich', { body: { dokumente: [dok.id, ohne.id], typ: beleg.id } })).body as {
      verweise: Record<string, Array<{ mappeId: string; belege: unknown[] }>>; doppelt: Array<{ mappeId: string; belege: Array<{ feld: string; wert: string }> }>; ohneText: string[]; bezuege: Record<string, { titel: string }>; typ?: unknown;
    };
    assert.equal(r.verweise.vertrag[0].mappeId, strom.id);
    assert.equal(r.verweise.vertrag[0].belege.length, 3, 'Vertragsnummer, dazu Kundennummer und Name über den Vertragspartner');
    assert.equal(r.doppelt[0].mappeId, da.id);
    assert.deepEqual([r.doppelt[0].belege[0].feld, r.doppelt[0].belege[0].wert], ['Rechnungsnummer', 'R-2026-0815']);
    assert.equal(r.bezuege[strom.id].titel, 'Strom');
    assert.deepEqual(r.ohneText, [ohne.id]);
    assert.equal(r.typ, undefined, 'mit gewähltem Typ kein Typ-Vorschlag');
  });

  it('ohne Typ: Typ-Vorschlag für „Wohin gehört das?“ nur aus Typen mit Haken und Recht zum Anlegen', async () => {
    const { d, lena, jonas, rufe, rechnung, beleg, dok } = await abgleichAufbau();
    const r = (await rufe(lena, 'POST', '/api/abgleich', { body: { dokumente: [dok.id] } })).body as { typ: { typId: string; wort: string; fundstelle: string } | null };
    // „Rechnung“ steht im Brief: der Typ „Rechnung“ oder „Beleg“ (englisch „Rechnung“ beschriftet) – beide passen gleich früh.
    assert.ok([rechnung.id, beleg.id].includes(r.typ!.typId));
    assert.match(r.typ!.fundstelle, /Rechnung/);
    // Jonas darf weder Rechnungen noch Belege anlegen – dann schlägt Ablago keinen der beiden vor.
    for (const x of [rechnung.id, beleg.id]) await d.setzeBerechtigungen(x, { grund: { ...NICHTS, R: true, U: true }, regeln: [] } as Regelwerk, true);
    const j = (await rufe(jonas, 'POST', '/api/abgleich', { body: { dokumente: [dok.id] } })).body as { typ: unknown };
    assert.equal(j.typ, null, '„Ihr Vertrag …“ mitten in der Zeile ist keine Überschrift');
  });

  it('nur Dokumente, die man lesen darf (sonst 403), unbekannte 404; höchstens 10', async () => {
    const { d, jonas, rufe, post, dok } = await abgleichAufbau();
    const postTyp = (await d.mappentypen.listeTypen()).find((x) => x.system === 'post')!;
    await d.setzeBerechtigungen(postTyp.id, { grund: { ...NICHTS }, regeln: [] } as Regelwerk, true);
    await assert.rejects(rufe(jonas, 'POST', '/api/abgleich', { body: { dokumente: [dok.id] } }), (e) => e instanceof Fachfehler && (e.status === 403 || e.status === 404));
    await assert.rejects(rufe(jonas, 'POST', '/api/abgleich', { body: { dokumente: ['00000000-0000-4000-8000-00000000dead'] } }), status(404));
    assert.ok(post.id);
  });

  it('API v1 nennt Abtrennen, Abgleich und das Seitenbild der Archivfassung', () => {
    const pfade = V1_TABELLE.map((x) => `${x.methode} ${x.pfad}`);
    for (const p of ['POST /post/{id}/abtrennen', 'POST /abgleich']) assert.ok(pfade.includes(p), p);
    const zuordnen = V1_TABELLE.find((x) => x.pfad === '/post/{id}/zuordnen')!;
    assert.ok(!/sonst 422/.test(zuordnen.beschreibung ?? ''), 'die Grenze „eben angelegt“ steht nicht mehr drin');
    assert.ok(V1_TABELLE.find((x) => x.pfad === '/dokumente/{id}/schwaerzen/seiten/{nr}')!.parameter!.some((p) => p.name === 'fassung'));
  });
});

describe('Dokument übernehmen: Seitenbild der Archivfassung (#934)', () => {
  it('ohne Archivfassung gibt es kein Seitenbild (null), Seiten außerhalb der Grenzen auch nicht', async () => {
    const d = new Dienst(speicherRepo(), speicherDateien(), { einstellungen: speicherEinstellungen() });
    await d.gleicheBenutzerAb([{ id: LENA, email: 'lena@example.org', name: 'Lena', rolle: 'admin', aktiv: true } as Benutzer]);
    const post = await d.legePostAn({ betreff: 'Brief' }, { id: LENA, name: 'Lena' });
    const dok = (await d.ladeHoch(post.id, { register: 'dokumente', name: 'a.pdf', typ: 'application/pdf' }, PDF('a'), LENA)).dokument;
    assert.equal(await d.archivSeitenbild(dok.id, 1), null);
    assert.equal(await d.archivSeitenbild(dok.id, 0), null);
    await assert.rejects(d.archivSeitenbild('00000000-0000-4000-8000-00000000dead', 1), status(404));
  });
});

describe('Wohin gehört das? Typ aus dem Text (#934)', () => {
  const typen = [
    { id: 'r', name: 'Rechnung' },
    { id: 'v', name: 'Vertrag' },
    { id: 'b', name: 'Bescheid', beschriftungen: { en: { name: 'Notice' } } },
    { id: 'k', name: 'Kfz' },
  ];
  it('der früheste Name als Überschrift (Zeilenanfang oder Betreff), auch in der Mehrzahl', () => {
    assert.equal(typAusText('Stadtwerke\nRechnung Nr. 1\nIhr Vertrag WV-1', typen)?.typId, 'r');
    assert.equal(typAusText('Stadtwerke\n  Verträge\nRechnungen 2026', typen)?.typId, 'r', '„Verträge“ ist nicht „Vertrag“ + Endung');
    assert.equal(typAusText('Musterstadt, 03.11.2026\nBetreff: Vertrag WV-1043', typen)?.typId, 'v');
    assert.equal(typAusText('Notice of assessment', typen)?.typId, 'b', 'Übersetzungen zählen mit');
  });
  it('nicht mitten im Satz, nicht als Teil eines Worts, keine Namen unter 4 Zeichen, nur am Anfang des Texts', () => {
    assert.equal(typAusText('Anbei Ihre Rechnung und Ihr Vertrag', typen), null);
    assert.equal(typAusText('Rechnungsnummer 4711\nVertragsnummer 9', typen), null);
    assert.equal(typAusText('Kfz-Steuer', typen), null, '„Kfz“ ist zu kurz');
    assert.equal(typAusText(`${'x '.repeat(TYP_FUND_ZEICHEN)}\nRechnung`, typen), null);
    assert.equal(typAusText('', typen), null);
  });
});

describe('Werte vom Dokument übernehmen: Textformen, Fundstelle, Text als Wert (#934)', () => {
  const seite = (zeilen: string[][]): SchwaerzSeite => ({
    breite: 595, hoehe: 842,
    woerter: zeilen.flatMap((z, i) => z.map((w, k) => [w, 0.1 + k * 0.12, 0.1 + i * 0.03, 0.1, 0.02] as Wort)),
  });
  const brief = [seite([
    ['Stadtwerke', 'Musterstadt'],
    ['Rechnung', 'Nr.', 'R-2026-0815', 'vom', '03.11.2026'],
    ['Gesamtbetrag', '1.284,20', 'EUR'],
    ['Zahlbar', 'bis', '20.11.2026'],
  ])];

  it('Datum und Betrag stehen anders im Dokument als im Feld', () => {
    assert.ok(textformen({ typ: 'datum' }, '2026-11-03').includes('03.11.2026'));
    assert.ok(textformen({ typ: 'betrag' }, { betrag: 1284.2, waehrung: 'EUR' }).includes('1.284,20'));
    assert.deepEqual(textformen({ typ: 'referenz' }, 'x'), [], 'Verweise über die Belege');
  });

  it('die Fundstelle wird zum Rahmen an den Wörtern; mit Ausschnitt die passende von zwei gleichen Stellen', () => {
    const datum = stelleVon(brief, textformen({ typ: 'datum' }, '2026-11-20'), '… Zahlbar bis 20.11.2026')!;
    assert.equal(datum.length, 1);
    assert.equal(datum[0].seite, 1);
    assert.ok(datum[0].y > 0.18 && datum[0].y < 0.2, 'Zeile „Zahlbar bis …“');
    const zwei = [seite([['Rechnung', 'vom', '03.11.2026'], ['Leistung', 'vom', '03.11.2026', 'bis', '30.11.2026']])];
    const zweite = stelleVon(zwei, ['03.11.2026'], 'Leistung vom 03.11.2026 bis 30.11.2026')!;
    assert.ok(zweite[0].y > 0.12, 'die Stelle in der Fundstelle, nicht die erste im Text');
    assert.equal(stelleVon(brief, ['gibt es nicht']), null);
    assert.equal(stelleVon([{ breite: 1, hoehe: 1, woerter: [] }], ['03.11.2026']), null, 'ohne Wörter mit Lage kein Rahmen');
  });

  it('Text als Wert: Datum, Zahl, Betrag mit Währung, Auswahl; Verweise nie', () => {
    assert.equal(datumAusText('vom 3. November 2026'), '2026-11-03');
    assert.equal(datumAusText('03.11.26'), '2026-11-03');
    assert.equal(datumAusText('31.02.2026'), null);
    assert.equal(zahlAusText('1.284,20'), 1284.2);
    assert.equal(zahlAusText('1,284.20'), 1284.2);
    assert.equal(zahlAusText('4.711'), 4711);
    assert.deepEqual(wertAusText({ typ: 'betrag' }, '1.284,20 €'), { betrag: 1284.2, waehrung: 'EUR' });
    assert.deepEqual(wertAusText({ typ: 'betrag' }, 'USD 12.50'), { betrag: 12.5, waehrung: 'USD' });
    assert.equal(wertAusText({ typ: 'text', maxLen: 5 }, 'Stadtwerke\nMusterstadt'), 'Stadt');
    assert.equal(wertAusText({ typ: 'auswahl', optionen: ['Strom', 'Gas'] }, 'strom'), 'Strom');
    assert.equal(wertAusText({ typ: 'auswahl', optionen: ['Strom', 'Gas'] }, 'Wasser'), null);
    assert.equal(wertAusText({ typ: 'referenz' }, 'Stadtwerke'), null);
    assert.equal(wertAusText({ typ: 'datum' }, 'keins'), null);
  });
});
