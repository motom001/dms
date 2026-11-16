/**
 * Erwähnen mit @: alle Mappen (#889) – Schreibweise mappe:, Favoriten erfahren es je nach Einstellung (sofort,
 * Zusammenfassung, nie), nur wer beide Mappen lesen darf, Hinweis „Erwähnt in …“, aktuelle Titel, Vorschläge nach @,
 * Texte ohne Namen, die der Empfänger nicht sehen darf.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { alsText, erwaehnung, erwaehnungen, inline } from '../../shared/src/markdown';
import { FAVORIT_ERWAEHNT, FAVORIT_ERWAEHNT_OFFEN } from '../../shared/src/erwaehnen';
import { aufgabenBeschriftung } from '../../shared/src/mappenansicht';
import { Aufgabenmail } from '../src/aufgabenmail';
import { speicherDateien } from '../src/dateispeicher';
import { Dienst } from '../src/dienst';
import { speicherEinstellungen } from '../src/einstellungen';
import { Konten } from '../src/konten';
import { speicherKontoRepo } from '../src/konto-repo';
import { speicherRepo } from '../src/repo/speicher';

async function aufbau() {
  const d = new Dienst(speicherRepo(), speicherDateien(), { einstellungen: speicherEinstellungen() });
  const konten = new Konten(speicherKontoRepo(), null, 'http://nas', d.systemtypen.benutzerspiegel());
  d.verbindeKonten(konten.papierkorbHaken());
  const { benutzer: lena } = await konten.einrichten({ email: 'lena@example.org', name: 'Lena', passwort: 'ein-langes-passwort' });
  const { benutzer: jonas } = await konten.legeBenutzerAn({ email: 'jonas@example.org', name: 'Jonas' });
  await d.postSystemmappen.gleicheBenutzerAb(await konten.listeBenutzer());
  const person = await d.mappentypen.legeTypAn({
    name: 'Person',
    felder: [
      { key: 'name', label: 'Name', typ: 'text', pflicht: true },
      { key: 'ort', label: 'Ort', typ: 'text' },
      { key: 'text', label: 'Beschreibung', typ: 'formatiert' },
    ],
    trefferliste: ['_titel', 'ort'],
  });
  const vertrag = await d.mappentypen.legeTypAn({ name: 'Vertrag', felder: [{ key: 'name', label: 'Name', typ: 'text', pflicht: true }] });
  const bernd = await d.mappen.legeMappeAn({ typId: person.id, werte: { name: 'Dr. Bernd Beispiel', ort: 'Köln' } }, lena.id);
  const wartung = await d.mappen.legeMappeAn({ typId: vertrag.id, werte: { name: 'Wartungsvertrag' } }, lena.id);
  const b = async (id: string) => (await konten.listeBenutzer()).find((x) => x.id === id)!;
  return { d, konten, lena, jonas, person, vertrag, bernd, wartung, b };
}

const meine = async (d: Dienst, id: string) =>
  (await d.vertretung.meineAufgaben({ id, rolle: 'mitglied' })).filter((a) => a.art === 'erwaehnung');

describe('Erwähnen mit @: alle Mappen (#889)', () => {
  it('Schreibweise mappe:, benutzer: bleibt gültig; reiner Text mit eigenem Namen', () => {
    const id = '00000000-0000-4000-8000-0000000000aa';
    assert.equal(erwaehnung('Wartungs[vertrag]', id), `@[Wartungsvertrag](mappe:${id})`);
    assert.deepEqual(inline(`@[Alt](benutzer:${id})`), [{ art: 'erwaehnung', name: 'Alt', id, benutzer: true }]);
    assert.deepEqual(inline(`@[Neu](mappe:${id})`), [{ art: 'erwaehnung', name: 'Neu', id, benutzer: false }]);
    assert.deepEqual(erwaehnungen(`@[A](mappe:${id}) und @[B](benutzer:${id.replace('aa', 'bb')})`), [id, id.replace('aa', 'bb')]);
    assert.equal(
      alsText(`Siehe @[Geheim](mappe:${id})`, () => 'Mappe (nicht sichtbar)'),
      'Siehe @Mappe (nicht sichtbar)',
    );
  });

  it('Favorit „sofort“: Aufgabe an der Mappe mit der Notiz, nur bei neuer Erwähnung, nie an den Erwähnenden', async () => {
    const { d, konten, lena, jonas, bernd, wartung, b } = await aufbau();
    await d.mappen.setzeFavorit(jonas, wartung.id, true);
    await d.mappen.setzeFavorit(lena, wartung.id, true);
    await konten.setzeEinstellung(await b(jonas.id), FAVORIT_ERWAEHNT, 'sofort');
    await konten.setzeEinstellung(await b(lena.id), FAVORIT_ERWAEHNT, 'sofort');
    const n = await d.mappenNotizen.legeNotizAn(
      bernd.id,
      `Wir haben über ${erwaehnung('Wartungsvertrag', wartung.id)} gesprochen.`,
      lena.id,
    );
    const [a] = await meine(d, jonas.id);
    assert.equal(a.mappeId, bernd.id);
    assert.equal(a.feldKey, `notiz:${n.id}`);
    assert.deepEqual(a.anlass, { art: 'favorit', mappe: wartung.id });
    assert.equal(a.text, 'Dein Favorit „Wartungsvertrag“ wurde erwähnt in einer Notiz');
    assert.equal(aufgabenBeschriftung(a.art, true, a.anlass), 'Dein Favorit wurde erwähnt');
    assert.deepEqual(await meine(d, lena.id), [], 'nie an den Erwähnenden');
    await d.mappenNotizen.aendereNotiz(n.id, `Nochmals: ${erwaehnung('Wartungsvertrag', wartung.id)}`, lena.id);
    assert.equal((await meine(d, jonas.id)).length, 1, 'nur neue Erwähnungen');
  });

  it('Vorgabe „Zusammenfassung“: gemerkt, in der täglichen Mail, danach vergessen; „nie“: nichts', async () => {
    const { d, konten, lena, jonas, bernd, wartung, b } = await aufbau();
    await d.mappen.setzeFavorit(jonas, wartung.id, true);
    await d.mappenNotizen.legeNotizAn(bernd.id, `Siehe ${erwaehnung('Wartungsvertrag', wartung.id)}`, lena.id);
    assert.deepEqual(await meine(d, jonas.id), []);
    assert.equal(((await konten.einstellungen(await b(jonas.id)))[FAVORIT_ERWAEHNT_OFFEN] as unknown[]).length, 1);
    const mails: Array<{ betreff: string; text: string }> = [];
    const mail = new Aufgabenmail(
      {
        benutzer: () => konten.listeBenutzer(),
        einstellungenVon: (x) => konten.einstellungen(x),
        aufgabenVon: (x) => d.vertretung.meineAufgaben(x),
        typName: async () => 'Vorgang',
        favoritenErwaehnt: async (x) =>
          d.erwaehnungen.fuerZusammenfassung(await d.rechtepruefung.zugriff(x), (await konten.einstellungen(x))[FAVORIT_ERWAEHNT_OFFEN]),
        favoritenErwaehntGesendet: (x) => konten.setzeEinstellung(x, FAVORIT_ERWAEHNT_OFFEN, null),
      },
      () => ({
        async sende(_an, betreff, text) {
          mails.push({ betreff, text });
        },
      }),
      () => 'http://nas:8080',
    );
    assert.equal((await mail.fuerAutomatisierung(jonas.id, false)).schluessel, 'gesendet');
    assert.equal(mails[0].betreff, 'Ablago: Deine Favoriten wurden erwähnt');
    assert.match(mails[0].text, /„Wartungsvertrag“ in einer Notiz bei „Dr\. Bernd Beispiel“\n {2}http:\/\/nas:8080\/ablage\//);
    assert.equal((await mail.fuerAutomatisierung(jonas.id, false)).schluessel, 'nichts', 'danach vergessen');
    await konten.setzeEinstellung(await b(jonas.id), FAVORIT_ERWAEHNT, 'nie');
    await d.mappenNotizen.legeNotizAn(bernd.id, `Noch einmal ${erwaehnung('Wartungsvertrag', wartung.id)}`, lena.id);
    assert.equal((await konten.einstellungen(await b(jonas.id)))[FAVORIT_ERWAEHNT_OFFEN] ?? null, null);
  });

  it('nur wer beide Mappen lesen darf; Personen-Mappen sind keine Benutzer', async () => {
    const { d, konten, lena, jonas, bernd, wartung, b } = await aufbau();
    await d.mappen.setzeFavorit(jonas, wartung.id, true);
    await konten.setzeEinstellung(await b(jonas.id), FAVORIT_ERWAEHNT, 'sofort');
    const echt = d.rechtepruefung.sichtbarFuer.bind(d.rechtepruefung);
    d.rechtepruefung.sichtbarFuer = async (wer, ids) =>
      new Set([...(await echt(wer, ids))].filter((id) => !(wer === jonas.id && id === bernd.id)));
    await d.mappenNotizen.legeNotizAn(bernd.id, `Siehe ${erwaehnung('Wartungsvertrag', wartung.id)}`, lena.id);
    assert.deepEqual(await meine(d, jonas.id), [], 'Jonas darf die Mappe mit der Notiz nicht lesen');
    d.rechtepruefung.sichtbarFuer = echt;
    await d.mappenNotizen.legeNotizAn(wartung.id, `Kontakt: ${erwaehnung('Dr. Bernd Beispiel', bernd.id)}`, lena.id);
    assert.deepEqual(await meine(d, jonas.id), [], 'Bernd hat niemand als Favorit – und ist kein Benutzer');
    // Ein Benutzer in neuer Schreibweise: wie bisher eine Aufgabe für ihn.
    await d.mappenNotizen.legeNotizAn(wartung.id, `Bitte ansehen, ${erwaehnung('Jonas', jonas.id)}`, lena.id);
    const [a] = await meine(d, jonas.id);
    assert.equal(a.text, 'Erwähnt von Lena in einer Notiz: Bitte ansehen, @Jonas');
    assert.equal(aufgabenBeschriftung(a.art, true, a.anlass), 'Du wurdest erwähnt');
  });

  it('Text der Aufgabe ohne Namen, die der Empfänger nicht sehen darf (#888)', async () => {
    const { d, lena, jonas, bernd, wartung } = await aufbau();
    const echt = d.rechtepruefung.sichtbarFuer.bind(d.rechtepruefung);
    d.rechtepruefung.sichtbarFuer = async (wer, ids) =>
      new Set([...(await echt(wer, ids))].filter((id) => !(wer === jonas.id && (id === lena.id || id === bernd.id))));
    await d.mappenNotizen.legeNotizAn(
      wartung.id,
      `${erwaehnung('Jonas', jonas.id)} bitte mit ${erwaehnung('Dr. Bernd Beispiel', bernd.id)} klären`,
      lena.id,
    );
    const [a] = await meine(d, jonas.id);
    assert.equal(a.text, 'Erwähnt in einer Notiz: @Jonas bitte mit @Mappe (nicht sichtbar) klären');
  });

  it('Hinweis „Erwähnt in …“, Erwähnungen der Mappe mit aktuellem Titel, nur Lesbares', async () => {
    const { d, lena, jonas, person, bernd, wartung, b } = await aufbau();
    await d.mappenNotizen.legeNotizAn(bernd.id, `Siehe ${erwaehnung('Alter Titel', wartung.id)}`, lena.id);
    await d.mappen.aendereMappe(
      bernd.id,
      { werte: { name: 'Dr. Bernd Beispiel', text: `Vertrag: ${erwaehnung('Wartung', wartung.id)}` } },
      lena.id,
    );
    const zl = await d.rechtepruefung.zugriff(await b(lena.id));
    const w = await d.erwaehnungen.uebersicht(zl, wartung.id);
    assert.deepEqual(w.erwaehntIn.map((x) => [x.mappeId, x.titel, x.stelle, x.feld ?? null]).sort(), [
      [bernd.id, 'Dr. Bernd Beispiel', 'feld', 'Beschreibung'],
      [bernd.id, 'Dr. Bernd Beispiel', 'notiz', null],
    ]);
    const e = await d.erwaehnungen.uebersicht(zl, bernd.id);
    assert.deepEqual(
      e.erwaehnt,
      [{ id: wartung.id, sichtbarkeit: 'sichtbar', titel: 'Wartungsvertrag', typId: wartung.typId }],
      'aktueller Titel',
    );
    const zj = await d.rechtepruefung.zugriff(await b(jonas.id));
    const echt = d.rechtepruefung.lesbare.bind(d.rechtepruefung);
    d.rechtepruefung.lesbare = async (z, ids) =>
      new Set([...(await echt(z, ids))].filter((id) => !(z?.ich.id === jonas.id && id === bernd.id)));
    assert.deepEqual((await d.erwaehnungen.uebersicht(zj, wartung.id)).erwaehntIn, [], 'Stelle in nicht lesbarer Mappe');
    d.rechtepruefung.lesbare = echt;
    const v = await d.erwaehnungen.verweise(zl, [wartung.id, '00000000-0000-4000-8000-0000000000ff']);
    assert.deepEqual(v['00000000-0000-4000-8000-0000000000ff'], { sichtbarkeit: 'geloescht' });
    assert.equal(person.name, 'Person');
  });

  it('Vorschläge nach @: nur Mappen, Favoriten zuerst, bei gleichem Typ und Titel die erste Spalte', async () => {
    const { d, lena, person, wartung, b } = await aufbau();
    await d.mappen.legeMappeAn({ typId: person.id, werte: { name: 'Dr. Bernd Beispiel', ort: 'Bonn' } }, lena.id);
    const z = await d.rechtepruefung.zugriff(await b(lena.id));
    const v = await d.erwaehnungen.vorschlaege(z, 'Bernd');
    assert.deepEqual(v.map((x) => x.zusatz).sort(), ['Bonn', 'Köln']);
    assert.ok(!(await d.erwaehnungen.vorschlaege(z, 'Lena')).length, 'Benutzer kennt die Oberfläche');
    await d.mappen.setzeFavorit(lena, wartung.id, true);
    assert.deepEqual(
      (await d.erwaehnungen.vorschlaege(z, '')).map((x) => [x.titel, x.favorit]),
      [['Wartungsvertrag', true]],
      'ohne Suchbegriff: Favoriten',
    );
  });
});
