/**
 * Erwähnungen ohne Titel im Text (#1293): Gespeichert wird nur die Kennung `@[](mappe:<id>)`; den Titel setzt erst die
 * Ausgabe ein, nach den Rechten der lesenden Person. Wer die erwähnte Mappe nicht lesen darf, bekommt ihren Titel weder
 * über die interne API noch über API v1, Export oder Auskunft; wer sie lesen darf, sieht den aktuellen Titel.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { alsText, erwaehnung, inline, mitTiteln, ohneTitel } from '../../shared/src/markdown';
import { speicherDateien } from '../src/dateien/dateispeicher';
import { Dienst } from '../src/dienst/dienst';
import { speicherEinstellungen } from '../src/einstellungen/einstellungen';
import { Konten } from '../src/konten';
import { speicherKontoRepo } from '../src/konten/konto-repo';
import { speicherRepo } from '../src/repo/speicher';
import { protokoll } from '../src/protokoll/protokoll';
import { routen, type Anfrage } from '../src/http/routen';

const GEHEIM = 'Abmahnung Jonas';

async function aufbau() {
  const d = new Dienst(speicherRepo(), speicherDateien(), { einstellungen: speicherEinstellungen() });
  const konten = new Konten(speicherKontoRepo(), null, 'http://nas', d.systemtypen.benutzerspiegel());
  d.verbindeKonten(konten.papierkorbHaken());
  const { benutzer: markus } = await konten.einrichten({ email: 'markus@example.org', name: 'Markus', passwort: 'ein-langes-passwort' });
  const { benutzer: jonas } = await konten.legeBenutzerAn({ email: 'jonas@example.org', name: 'Jonas' });
  await d.postSystemmappen.gleicheBenutzerAb(await konten.listeBenutzer());
  const typ = await d.mappentypen.legeTypAn({
    name: 'Vorgang',
    felder: [
      { key: 'name', label: 'Name', typ: 'text', pflicht: true },
      { key: 'text', label: 'Beschreibung', typ: 'formatiert' },
    ],
    trefferliste: ['_titel', 'text'],
  });
  const geheim = await d.mappen.legeMappeAn({ typId: typ.id, werte: { name: GEHEIM } }, markus.id);
  const vertrag = await d.mappen.legeMappeAn(
    { typId: typ.id, werte: { name: 'Gemeinsamer Vertrag', text: `Siehe ${erwaehnung(GEHEIM, geheim.id)}` } },
    markus.id,
  );
  const notiz = await d.mappenNotizen.legeNotizAn(vertrag.id, `Hängt an ${erwaehnung(GEHEIM, geheim.id)}`, markus.id);
  // Jonas darf die private Mappe von Markus nicht lesen.
  const echt = d.rechtepruefung.lesbare.bind(d.rechtepruefung);
  d.rechtepruefung.lesbare = async (z, ids) =>
    new Set([...(await echt(z, ids))].filter((id) => !(z?.ich.id === jonas.id && id === geheim.id)));
  const b = async (id: string) => (await konten.listeBenutzer()).find((x) => x.id === id)!;
  return { d, konten, markus, jonas, typ, geheim, vertrag, notiz, b };
}

describe('Erwähnungen ohne Titel im Text (#1293)', () => {
  it('ohneTitel und mitTiteln; leerer Name zählt als Erwähnung, ohne Titel neutral', () => {
    const id = '00000000-0000-4000-8000-0000000000aa';
    assert.equal(ohneTitel(`a @[Alt](mappe:${id}) b @[X](Benutzer:${id.toUpperCase()})`), `a @[](mappe:${id}) b @[](benutzer:${id})`);
    assert.deepEqual(inline(`@[](mappe:${id})`), [{ art: 'erwaehnung', name: '', id, benutzer: false }]);
    assert.equal(
      mitTiteln(`@[](mappe:${id})`, () => 'Neu [x]'),
      `@[Neu x](mappe:${id})`,
    );
    assert.equal(alsText(`Siehe @[](mappe:${id})`), 'Siehe @Erwähnung', 'nie ein gespeicherter Titel');
  });

  it('Neue Erwähnungen speichern keinen Titel – Notiz, formatiertes Feld, auch beim Ändern und über API v1', async () => {
    const { d, markus, geheim, vertrag, notiz, konten } = await aufbau();
    assert.equal((await d.kern.repo.holeNotiz(notiz.id))!.text, `Hängt an @[](mappe:${geheim.id})`);
    assert.equal((await d.kern.repo.holeMappe(vertrag.id))!.werte.text, `Siehe @[](mappe:${geheim.id})`);
    const alle = routen(d, konten, {});
    const route = (methode: string, pfad: string) => alle.find((r) => r.methode === methode && r.pfad === pfad)!;
    const anfrage = (x: Partial<Anfrage>): Anfrage => ({ body: {}, params: {}, query: {}, ip: '127.0.0.1', benutzer: markus, ...x });
    await route('PUT', '/api/v1/notizen/:id').handler(
      anfrage({ params: { id: notiz.id }, body: { text: `Neu: @[${GEHEIM}](mappe:${geheim.id})` } }),
    );
    assert.equal((await d.kern.repo.holeNotiz(notiz.id))!.text, `Neu: @[](mappe:${geheim.id})`);
    await d.mappen.aendereMappe(
      vertrag.id,
      { werte: { name: 'Gemeinsamer Vertrag', text: `Jetzt ${erwaehnung(GEHEIM, geheim.id)}` } },
      markus.id,
    );
    assert.equal((await d.kern.repo.holeMappe(vertrag.id))!.werte.text, `Jetzt @[](mappe:${geheim.id})`);
    const hist = JSON.stringify(await d.mappenHistorie.historie(vertrag.id));
    assert.ok(!hist.includes(GEHEIM), `Historie ohne Titel: ${hist}`);
  });

  it('Person ohne Leserecht: kein Titel über interne API, API v1, Export und Auskunft', async () => {
    const { d, konten, jonas, typ, vertrag, b } = await aufbau();
    const alle = routen(d, konten, {});
    const route = (methode: string, pfad: string) => alle.find((r) => r.methode === methode && r.pfad === pfad)!;
    const anfrage = (x: Partial<Anfrage>): Anfrage => ({ body: {}, params: {}, query: {}, ip: '127.0.0.1', benutzer: jonas, ...x });
    for (const [m, p] of [
      ['GET', '/api/mappen/:id/notizen'],
      ['GET', '/api/v1/mappen/:id/notizen'],
      ['GET', '/api/mappen/:id'],
      ['GET', '/api/v1/mappen/:id'],
    ]) {
      const r = await route(m, p).handler(anfrage({ params: { id: vertrag.id } }));
      assert.ok(!JSON.stringify(r.body).includes(GEHEIM), `${p}: ${JSON.stringify(r.body)}`);
    }
    const zj = await d.rechtepruefung.zugriff(await b(jonas.id));
    const csv = await d.ausgangExport.exportiere(jonas, { format: 'csv', sicht: `typ:${typ.id}`, spalten: 'alle' }, zj);
    const text = String(csv.inhalt);
    assert.ok(!text.includes(GEHEIM) && text.includes('@Mappe (nicht sichtbar)'), text);
    const vorschau = JSON.stringify(await d.datenschutzDienst.auskunftVorschau({ mappeId: vertrag.id }, zj));
    assert.ok(!vorschau.includes(GEHEIM), vorschau);
  });

  it('Historie: kein für den Empfänger aufbereiteter Text – auch nicht beim Erledigen', async () => {
    const { d, konten, markus, geheim, vertrag } = await aufbau();
    // Lena darf die private Mappe lesen; ihr Aufgabentext nennt den Titel, die Historie nicht.
    const { benutzer: lena } = await konten.legeBenutzerAn({ email: 'lena@example.org', name: 'Lena' });
    await d.postSystemmappen.gleicheBenutzerAb(await konten.listeBenutzer());
    await d.mappenNotizen.legeNotizAn(
      vertrag.id,
      `${erwaehnung('Lena', lena.id)} bitte ${erwaehnung(GEHEIM, geheim.id)} ansehen`,
      markus.id,
    );
    const [a] = (await d.vertretung.meineAufgaben({ id: lena.id, rolle: 'mitglied' })).filter((x) => x.art === 'erwaehnung');
    assert.match(a.text, new RegExp(GEHEIM), 'der Empfänger sieht den Titel');
    await d.vertretung.erledigeAufgabe(a.id, { id: lena.id, rolle: 'mitglied' });
    const hist = JSON.stringify(await d.mappenHistorie.historie(vertrag.id));
    assert.ok(!hist.includes(GEHEIM), `Historie ohne Titel: ${hist}`);
    assert.match(hist, /@Erwähnung/);
    // Auch das Server-Protokoll bekommt keinen Aufgabentext, nur Id, Art und Mappe.
    const log = protokoll.eintraege({}).filter((e) => e.text === 'Aufgabe erledigt');
    assert.ok(log.length && !JSON.stringify(log).includes(GEHEIM), JSON.stringify(log));
  });

  it('Auch direkt über das Repo (Wege am Dienst vorbei) wird kein Titel gespeichert', async () => {
    const { d, vertrag, geheim, markus } = await aufbau();
    const repo = d.kern.repo;
    const n = await repo.legeNotizAn({
      id: crypto.randomUUID(),
      mappeId: vertrag.id,
      text: `Umbau: ${erwaehnung(GEHEIM, geheim.id)}`,
      erstellt: '',
      erstelltVon: markus.id,
      geaendert: '',
      geaendertVon: markus.id,
    });
    assert.ok(!n.text.includes(GEHEIM));
    const g = await repo.aendereNotiz(n.id, `neu ${erwaehnung(GEHEIM, geheim.id)}`, markus.id);
    assert.ok(!g.text.includes(GEHEIM));
    assert.ok(g.text.includes(`(mappe:${geheim.id})`));
  });

  it('Person mit Leserecht sieht den aktuellen Titel, auch nach einer Umbenennung', async () => {
    const { d, markus, typ, geheim, vertrag, b } = await aufbau();
    await d.mappen.aendereMappe(geheim.id, { werte: { name: 'Abmahnung (erledigt)' } }, markus.id);
    const zm = await d.rechtepruefung.zugriff(await b(markus.id));
    assert.equal((await d.erwaehnungen.verweise(zm, [geheim.id]))[geheim.id].titel, 'Abmahnung (erledigt)');
    assert.deepEqual(await d.erwaehnungen.mitTiteln(zm, [`x @[](mappe:${geheim.id})`]), [`x @[Abmahnung (erledigt)](mappe:${geheim.id})`]);
    const csv = String((await d.ausgangExport.exportiere(markus, { format: 'csv', sicht: `typ:${typ.id}`, spalten: 'alle' }, zm)).inhalt);
    assert.ok(csv.includes('Siehe @Abmahnung (erledigt)') && !csv.includes(GEHEIM), csv);
    assert.equal(vertrag.typId, typ.id);
  });
});
