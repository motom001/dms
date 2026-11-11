/**
 * Post auflösen (#936, seit #934 auch in bestehende Mappen): Wird aus einer Post eine Mappe, wandern Dokumente und die ganze Historie dorthin,
 * die Post kommt mit „Aufgelöst in …“ in den Papierkorb. Ein abgetrennter Teil wird eine neue Post. Wer die Post nicht
 * löschen darf, ordnet nur zu (heutiger Weg) und bekommt einen Hinweis. Im Arbeitsspeicher und – mit
 * TEST_DATABASE_URL – in PostgreSQL (eigene Datenbank über hilfe-db.ts).
 */
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { POST_STAND, type Benutzer } from '../../shared/src/model';
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
import { eigeneDatenbank } from './hilfe-db';
import { wieImModus } from './hilfen';

const status = (s: number, text?: RegExp) => (e: unknown) => e instanceof Fachfehler && e.status === s && (!text || text.test(e.message));
const PDF = (x: string) => Buffer.from(`%PDF-1.4 ${x}`);

const LENA = '00000000-0000-4000-8000-0000000000aa';
const HAUSHALT = '00000000-0000-4000-8000-000000000001';
const offen: Array<{ end(): Promise<void> }> = [];

async function repo(pg: boolean): Promise<Repo> {
  if (!pg) return speicherRepo();
  const { pgRepo } = await import('../src/repo-pg');
  const sql = (await eigeneDatenbank('aufloesen')).sql;
  offen.push(sql);
  await sql`INSERT INTO haushalte (id, name) VALUES (${HAUSHALT}, 'Test') ON CONFLICT DO NOTHING`;
  await sql`INSERT INTO benutzer (id, haushalt_id, email, name, rolle) VALUES (${LENA}, ${HAUSHALT}, 'lena@example.org', 'Lena', 'admin')`;
  return pgRepo(sql, HAUSHALT) as never;
}

/** Lena legt Post mit zwei Briefseiten ab und daraus eine Rechnung an – wie die Seite „Dokument übernehmen“. */
async function aufbau(pg: boolean, einstellungen = speicherEinstellungen()) {
  const d = new Dienst(await repo(pg), speicherDateien(), { einstellungen });
  await d.gleicheBenutzerAb([{ id: LENA, email: 'lena@example.org', name: 'Lena', rolle: 'admin', aktiv: true } as Benutzer]);
  const rechnung = await d.mappentypen.legeTypAn({ name: 'Rechnung', titelVorlage: '{nr}', felder: [{ key: 'nr', label: 'Nummer', typ: 'text', pflicht: true }], register: [
    { key: 'allgemein', name: 'Allgemein', art: 'felder', felder: ['nr'] },
    { key: 'belege', name: 'Belege', art: 'dokumente' },
  ] });
  const post = await d.legePostAn({ betreff: 'Brief der Stadtwerke' }, { id: LENA, name: 'Lena' });
  const a = (await d.dokumente.ladeHoch(post.id, { register: 'dokumente', name: 'rechnung.pdf', typ: 'application/pdf' }, PDF('a'), LENA)).dokument;
  const b = (await d.dokumente.ladeHoch(post.id, { register: 'dokumente', name: 'werbung.pdf', typ: 'application/pdf' }, PDF('b'), LENA)).dokument;
  return { d, rechnung, post, a, b };
}

for (const pg of [false, ...(process.env.TEST_DATABASE_URL ? [true] : [])]) {
  describe(`Post auflösen (#936, ${pg ? 'PostgreSQL' : 'Arbeitsspeicher'})`, () => {
    after(async () => { for (const s of offen.splice(0)) await s.end(); });

    it('Dokumente wandern ins Register der neuen Mappe, die Post kommt in den Papierkorb', async () => {
      const { d, rechnung, post, a, b } = await aufbau(pg);
      const neu = await d.mappen.legeMappeAn({ typId: rechnung.id, werte: { nr: 'R-2026-0815' } }, LENA);
      const r = await d.ordneZu(post.id, { ziel: neu.id, register: 'belege', aufloesen: true }, LENA);
      assert.equal(r.aufgeloest, true);
      assert.ok('papierkorb' in r && r.papierkorb);
      assert.deepEqual((await d.mappen.holeMappe(neu.id)).dokumente.map((x) => [x.id, x.registerKey]).sort(), [[a.id, 'belege'], [b.id, 'belege']].sort());
      await assert.rejects(d.mappen.holeMappe(post.id), status(404), 'die Post ist weg');
      const korb = await d.papierkorb({ id: LENA, rolle: 'admin' }, true);
      const e = korb.find((x) => x.id === post.id)!;
      assert.equal(e.dokumente, 0, 'keine Dokumente mehr in der Post');
      assert.deepEqual(e.aufgeloestIn, { id: neu.id, typId: rechnung.id, titel: 'R-2026-0815', da: true });
      assert.equal(e.werte.stand, POST_STAND.zugeordnet);
      assert.deepEqual((await d.papierkorbEintrag(post.id, { id: LENA, rolle: 'admin' }, true)).aufgeloestIn?.id, neu.id);
    });

    it('die ganze Historie der Post steht bei der Mappe – mit Herkunft, Änderungen, Notizen, Aufgaben – dazu „Aus Post … angelegt“', async () => {
      const { d, rechnung, post } = await aufbau(pg);
      await d.notiereSystem(post.id, 'Postfach „Rechnungen“', 'aus Postfach „Rechnungen“ übernommen');
      await d.mappen.aendereMappe(post.id, { werte: { betreff: 'Abschlag Strom' } }, LENA);
      const notiz = await d.mappenNotizen.legeNotizAn(post.id, 'Bitte bis Freitag zahlen', LENA);
      const aufgabe = await d.legeAufgabeAn(post.id, { text: 'Betrag prüfen', empfaengerId: LENA }, LENA);
      await d.legeErinnerungAn(post.id, { datum: '2099-01-01', text: 'Zahlung nachsehen' }, LENA);
      const vorher = (await d.mappenHistorie.historie(post.id)).map((h) => h.art);
      const neu = await d.mappen.legeMappeAn({ typId: rechnung.id, werte: { nr: 'R-1' } }, LENA);
      await d.ordneZu(post.id, { ziel: neu.id, aufloesen: true }, LENA);
      const h = await d.mappenHistorie.historie(neu.id);
      const ausPost = h.filter((x) => x.daten.ausPost === post.id);
      for (const art of ['angelegt', 'uebernommen', 'geaendert', 'dokument_hochgeladen', 'notiz', 'aufgabe']) assert.ok(ausPost.some((x) => x.art === art), art);
      assert.ok(ausPost.length >= vorher.length, 'nichts geht verloren');
      const ursprung = h.find((x) => x.art === 'zugeordnet' && x.daten.aufgeloest === true)!;
      assert.match(String(ursprung.daten.text), /Aus Post „Abschlag Strom“ angelegt mit 2 Dokumenten ins Register „Belege“/);
      assert.equal(ursprung.daten.post, post.id);
      assert.equal(ursprung.daten.ausPost, undefined, 'der Ursprung ist ein eigener Eintrag der Mappe');
      // Notizen, Aufgaben und Erinnerungen gehören jetzt der Mappe.
      const m = await d.mappen.holeMappe(neu.id);
      assert.deepEqual(m.notizen.map((n) => n.id), [notiz.id]);
      assert.ok(m.aufgaben.some((x) => x.id === aufgabe.id));
      assert.equal((m.erinnerungen ?? []).length, 1);
      // Bei der Post bleibt nur, was zum Auflösen gehört: „Aufgelöst in …“ und „in den Papierkorb gelegt“.
      const rest = await d.mappenHistorie.historie(post.id);
      assert.deepEqual(rest.map((x) => x.art).sort(), ['papierkorb', 'zugeordnet']);
      assert.match(String(rest.find((x) => x.art === 'zugeordnet')!.daten.text), /Aufgelöst in Rechnung „R-1“/);
    });

    it('Löschprotokoll: Weg „aufgelöst“, Grund mit Mappentyp und Id, ohne Titel; wiederherstellen geht nicht', async () => {
      const { d, rechnung, post } = await aufbau(pg);
      const neu = await d.mappen.legeMappeAn({ typId: rechnung.id, werte: { nr: 'R-77' } }, LENA);
      await d.ordneZu(post.id, { ziel: neu.id, aufloesen: true }, LENA);
      const p = (await d.loeschprotokoll({})).eintraege.filter((x) => x.mappeId === post.id);
      assert.deepEqual(p.map((x) => x.art), ['mappe'], 'kein Dokument der Post ist gelöscht');
      assert.equal(p[0].schritt, 'papierkorb');
      assert.equal(p[0].weg, 'aufgeloest');
      assert.equal(p[0].grundText, `Post aufgelöst in Mappe ${neu.id} (Rechnung)`);
      assert.ok(!JSON.stringify(p[0]).includes('Stadtwerke') && !JSON.stringify(p[0]).includes('R-77'), 'kein Titel, kein Betreff');
      assert.equal(p[0].anzahl?.dokumente, 0, 'die Dokumente sind nicht gelöscht, sie liegen in der Mappe');
      await assert.rejects(d.stelleWiederHer(post.id, { id: LENA, rolle: 'admin' }, true), status(409, /aufgelöst.*Mappe dabei neu angelegt, löschst du sie/));
      // Der Weg zurück: die neue Mappe löschen – sie kommt samt Dokumenten und Historie in den Papierkorb.
      await d.loescheMappe(neu.id, LENA);
      const korb = await d.papierkorb({ id: LENA, rolle: 'admin' }, true);
      assert.equal(korb.find((x) => x.id === neu.id)?.dokumente, 2);
      assert.equal(korb.find((x) => x.id === post.id)?.aufgeloestIn?.da, false);
    });

    it('nur ein Teil übernommen: der abgetrennte Teil wird eine neue Post mit Verweis auf die Herkunft', async () => {
      const { d, rechnung, post, a, b } = await aufbau(pg);
      const neu = await d.mappen.legeMappeAn({ typId: rechnung.id, werte: { nr: 'R-2' } }, LENA);
      const r = await d.ordneZu(post.id, { ziel: neu.id, dokumente: [a.id], aufloesen: true }, LENA);
      assert.ok('abgetrennt' in r && r.abgetrennt);
      const ab = r.abgetrennt!;
      assert.equal(ab.werte.stand, POST_STAND.neu);
      assert.equal(ab.titel, 'Brief der Stadtwerke (abgetrennt)');
      assert.deepEqual((await d.mappen.holeMappe(ab.id)).dokumente.map((x) => x.id), [b.id]);
      assert.deepEqual((await d.mappen.holeMappe(neu.id)).dokumente.map((x) => x.id), [a.id]);
      const herkunft = (await d.mappenHistorie.historie(ab.id)).find((x) => x.art === 'post_geteilt')!;
      assert.match(String(herkunft.daten.text), /Abgetrennt aus Post „Brief der Stadtwerke“ mit 1 Dokument, als daraus Rechnung „R-2“ wurde/);
      assert.equal(herkunft.daten.ziel, neu.id);
      assert.equal(herkunft.daten.post, post.id);
      assert.match(String((await d.mappenHistorie.historie(neu.id)).find((x) => x.daten.aufgeloest === true)!.daten.text), /1 Dokument als neue Post abgetrennt/);
    });

    it('nicht aufgelöst: mit „Kopie behalten“ und bei versendeten E-Mails; in eine bestehende Mappe schon (#934)', async () => {
      const { d, rechnung, post } = await aufbau(pg);
      const neu = await d.mappen.legeMappeAn({ typId: rechnung.id, werte: { nr: 'R-3' } }, LENA);
      const kopie = await d.ordneZu(post.id, { ziel: neu.id, kopieren: true, aufloesen: true }, LENA);
      assert.equal(kopie.aufgeloest, false);
      assert.equal((await d.mappen.holeMappe(post.id)).dokumente.length, 2);
      // Seit #934 fällt die Grenze „nur eben aus dieser Post angelegt“: auch eine Mappe, die schon Post hat, und eine,
      // die jemand anderes angelegt hat, kann die Post aufnehmen.
      const wieder = await d.ordneZu(post.id, { ziel: neu.id, aufloesen: true }, LENA);
      assert.equal(wieder.aufgeloest, true);
      const zweite = await d.legePostAn({ betreff: 'Noch ein Brief' }, { id: LENA, name: 'Lena' });
      const fremd = await d.mappen.legeMappeAn({ typId: rechnung.id, werte: { nr: 'R-4' } }, null);
      const inFremd = await d.ordneZu(zweite.id, { ziel: fremd.id, aufloesen: true }, LENA);
      assert.equal(inFremd.aufgeloest, true);
      assert.match(String((await d.mappenHistorie.historie(fremd.id)).find((x) => x.daten.aufgeloest === true)!.daten.text), /^Post „Noch ein Brief“ übernommen/);
      // Versendete E-Mails bleiben Post, wie sie verschickt wurden.
      const mailer = { async sende() { /* ok */ } };
      const mail = await d.versendeMappe(fremd.id, { an: 'jonas@example.org', betreff: 'Hallo' }, { id: LENA, name: 'Lena', email: 'lena@example.org' }, mailer);
      const ziel = await d.mappen.legeMappeAn({ typId: rechnung.id, werte: { nr: 'R-5' } }, LENA);
      const v = await d.ordneZu(mail.id, { ziel: ziel.id, dokumente: [], aufloesen: true }, LENA);
      assert.equal(v.aufgeloest, false);
      await d.mappen.holeMappe(mail.id);
    });

    it('ohne Papierkorb ist die Post sofort weg, Dokumente und Historie bleiben bei der Mappe', async () => {
      const einstellungen = speicherEinstellungen();
      await einstellungen.schreibe('papierkorb', { tage: 0 });
      const { d, rechnung, post } = await aufbau(pg, einstellungen);
      const neu = await d.mappen.legeMappeAn({ typId: rechnung.id, werte: { nr: 'R-6' } }, LENA);
      const r = await d.ordneZu(post.id, { ziel: neu.id, aufloesen: true }, LENA);
      assert.ok(r.aufgeloest && !r.papierkorb);
      assert.equal((await d.papierkorb({ id: LENA, rolle: 'admin' }, true)).length, 0);
      assert.equal((await d.mappen.holeMappe(neu.id)).dokumente.length, 2);
      assert.ok((await d.mappenHistorie.historie(neu.id)).some((x) => x.daten.ausPost === post.id && x.art === 'angelegt'));
      const p = (await d.loeschprotokoll({})).eintraege.filter((x) => x.mappeId === post.id);
      assert.deepEqual(p.map((x) => [x.art, x.schritt, x.weg]), [['mappe', 'endgueltig', 'aufgeloest']]);
    });
  });
}

/** Mit Konten und Berechtigungen (Arbeitsspeicher), über die Schnittstelle wie die Oberfläche. */
async function mitKonten() {
  const d = new Dienst(speicherRepo(), speicherDateien(), { einstellungen: speicherEinstellungen() });
  const konten = new Konten(speicherKontoRepo(), null, 'http://nas', d.systemtypen.benutzerspiegel());
  d.verbindeKonten(konten.papierkorbHaken());
  const { benutzer: lena } = await konten.einrichten({ email: 'lena@example.org', name: 'Lena', passwort: 'ein-langes-passwort' });
  const { benutzer: jonas } = await konten.legeBenutzerAn({ email: 'jonas@example.org', name: 'Jonas' }, lena.id);
  await d.gleicheBenutzerAb(await konten.listeBenutzer());
  const rechnung = await d.mappentypen.legeTypAn({ name: 'Rechnung', titelVorlage: '{nr}', felder: [{ key: 'nr', label: 'Nummer', typ: 'text', pflicht: true }], register: [
    { key: 'allgemein', name: 'Allgemein', art: 'felder', felder: ['nr'] },
    { key: 'belege', name: 'Belege', art: 'dokumente' },
  ] });
  const postTyp = (await d.mappentypen.listeTypen()).find((x) => x.system === 'post')!;
  const tabelle = routen(d, konten, {});
  const rufe = async (b: { id: string }, m: string, p: string, x: Partial<Anfrage> = {}) =>
    tabelle.find((r) => r.methode === m && r.pfad === p)!.handler({ body: {}, params: {}, query: {}, ip: '1', ...x, benutzer: wieImModus((await konten.listeBenutzer()).find((u) => u.id === b.id)!) });
  return { d, lena, jonas, rechnung, postTyp, rufe };
}

describe('Post auflösen: Rechte, „Neue Post“ und Aufgaben (#936)', () => {
  it('wer die Post nicht löschen darf, löst sie nicht auf: sie bleibt zugeordnet, mit Hinweis', async () => {
    const { d, lena, jonas, rechnung, postTyp, rufe } = await mitKonten();
    // Mitglieder dürfen Post lesen, bearbeiten und anlegen, aber nicht löschen.
    const ohneLoeschen: Regelwerk = { grund: { ...NICHTS, R: true, U: true, C: true }, regeln: [] };
    await d.berechtigungen.setzeBerechtigungen(postTyp.id, ohneLoeschen, true);
    const post = (await rufe(lena, 'POST', '/api/post', { body: { betreff: 'Brief vom Finanzamt' } })).body as { id: string };
    await d.dokumente.ladeHoch(post.id, { register: 'dokumente', name: 'bescheid.pdf', typ: 'application/pdf' }, PDF('f'), lena.id);
    const neu = (await rufe(jonas, 'POST', '/api/mappen', { body: { typId: rechnung.id, werte: { nr: 'St-1' } } })).body as { id: string };
    const r = (await rufe(jonas, 'POST', '/api/mappen/:id/zuordnen', { params: { id: post.id }, body: { ziel: neu.id, aufloesen: true } })).body as { aufgeloest: boolean; hinweis?: string; post: { werte: Record<string, unknown> } };
    assert.equal(r.aufgeloest, false);
    assert.match(r.hinweis ?? '', /bleibt als „Zugeordnet“ stehen.*kein Recht zum Löschen/);
    assert.equal(r.post.werte.stand, POST_STAND.zugeordnet);
    const p = await d.mappen.holeMappe(post.id);
    assert.deepEqual(p.mappe.werte.bezug, [neu.id]);
    assert.equal(p.dokumente.length, 0, 'die Dokumente wandern trotzdem');
    assert.equal((await d.papierkorb({ id: jonas.id, rolle: 'mitglied' })).length, 0);
    assert.ok(!(await d.mappenHistorie.historie(neu.id)).some((h) => h.daten.ausPost), 'die Historie bleibt bei der Post');
    // Auch den Löschweg selbst sperrt das Recht.
    await assert.rejects(rufe(jonas, 'DELETE', '/api/mappen/:id', { params: { id: post.id } }), status(403));
  });

  it('wer löschen darf, löst auf; der abgetrennte Teil braucht das Recht, Post anzulegen', async () => {
    const { d, lena, jonas, rechnung, postTyp, rufe } = await mitKonten();
    const ohneAnlegen: Regelwerk = { grund: { ...NICHTS, R: true, U: true, D: true }, regeln: [] };
    await d.berechtigungen.setzeBerechtigungen(postTyp.id, ohneAnlegen, true);
    const post = await d.legePostAn({ betreff: 'Zwei Briefe' }, { id: lena.id, name: 'Lena' });
    const a = (await d.dokumente.ladeHoch(post.id, { register: 'dokumente', name: 'a.pdf', typ: 'application/pdf' }, PDF('a'), lena.id)).dokument;
    await d.dokumente.ladeHoch(post.id, { register: 'dokumente', name: 'b.pdf', typ: 'application/pdf' }, PDF('b'), lena.id);
    const neu = (await rufe(jonas, 'POST', '/api/mappen', { body: { typId: rechnung.id, werte: { nr: 'Z-1' } } })).body as { id: string };
    const teil = (await rufe(jonas, 'POST', '/api/mappen/:id/zuordnen', { params: { id: post.id }, body: { ziel: neu.id, dokumente: [a.id], aufloesen: true } })).body as { aufgeloest: boolean; hinweis?: string };
    assert.equal(teil.aufgeloest, false);
    assert.match(teil.hinweis ?? '', /Post anlegen darfst du/);
    // Ganz übernommen geht es: Jonas darf die Post löschen.
    const zweite = await d.legePostAn({ betreff: 'Ein Brief' }, { id: lena.id, name: 'Lena' });
    await d.dokumente.ladeHoch(zweite.id, { register: 'dokumente', name: 'c.pdf', typ: 'application/pdf' }, PDF('c'), lena.id);
    const neu2 = (await rufe(jonas, 'POST', '/api/mappen', { body: { typId: rechnung.id, werte: { nr: 'Z-2' } } })).body as { id: string };
    const ganz = (await rufe(jonas, 'POST', '/api/mappen/:id/zuordnen', { params: { id: zweite.id }, body: { ziel: neu2.id, aufloesen: true } })).body as { aufgeloest: boolean };
    assert.equal(ganz.aufgeloest, true);
    const korb = (await rufe(jonas, 'GET', '/api/papierkorb')).body as Array<{ id: string; aufgeloestIn?: { id: string } }>;
    assert.equal(korb.find((x) => x.id === zweite.id)?.aufgeloestIn?.id, neu2.id);
    await assert.rejects(rufe(jonas, 'POST', '/api/papierkorb/:id/wiederherstellen', { params: { id: zweite.id } }), status(409));
    // Löschprotokoll: von Jonas, über die Oberfläche.
    const p = (await d.loeschprotokoll({})).eintraege.find((x) => x.mappeId === zweite.id)!;
    assert.equal(p.vonId, jonas.id);
    assert.equal(p.ausloeser, 'benutzer');
  });

  it('„Neue Post“ zählt eins weniger; „Post für dich“ ist erledigt und bleibt an der Post', async () => {
    const { d, lena, jonas, rechnung } = await mitKonten();
    const z = await d.rechtepruefung.zugriff({ id: lena.id, rolle: 'admin' });
    const sicht = (await d.systemsichten.neuePostSicht())!;
    const post = await d.legePostAn({ betreff: 'Für Jonas', fuer: jonas.id }, { id: lena.id, name: 'Lena' });
    await d.legePostAn({ betreff: 'Nächste Post' }, { id: lena.id, name: 'Lena' });
    assert.equal((await d.sichten.zaehler({ id: lena.id, rolle: 'admin' }, z)).sichten[sicht], 2);
    assert.equal((await d.meineAufgaben({ id: jonas.id, rolle: 'mitglied' })).filter((x) => x.art === 'post').length, 1);
    const neu = await d.mappen.legeMappeAn({ typId: rechnung.id, werte: { nr: 'J-1' } }, lena.id);
    await d.ordneZu(post.id, { ziel: neu.id, dokumente: [], aufloesen: true }, lena.id, z);
    assert.equal((await d.sichten.zaehler({ id: lena.id, rolle: 'admin' }, await d.rechtepruefung.zugriff({ id: lena.id, rolle: 'admin' }))).sichten[sicht], 1);
    assert.equal((await d.meineAufgaben({ id: jonas.id, rolle: 'mitglied' })).filter((x) => x.art === 'post').length, 0);
    assert.ok(!(await d.mappen.holeMappe(neu.id)).aufgaben.some((x) => x.art === 'post'), '„Post für dich“ gehört nicht zur Rechnung');
  });
});
