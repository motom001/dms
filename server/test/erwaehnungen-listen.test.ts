/**
 * Trefferlisten mit Erwähnungen (#1333): Formatierte Felder speichern nur die Kennung der erwähnten Mappe (#1293). Damit
 * Listen und Spalten den Titel zeigen können, liefert der Server die erwähnten Mappen je Seite gesammelt in `bezuege` mit –
 * nach den Rechten der lesenden Person: lesbar mit Titel, nicht lesbar maskiert (verborgen, ohne Titel), gelöscht fehlt.
 * Zwei Personen mit unterschiedlichen Rechten sehen in derselben Liste Unterschiedliches. Personas und Werte erfunden.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { erwaehnung } from '../../shared/src/markdown';
import { ALLES, type Regelwerk } from '../../shared/src/rechte';
import type { Mappe } from '../../shared/src/model';
import { speicherDateien } from '../src/dateien/dateispeicher';
import { Dienst } from '../src/dienst/dienst';
import { speicherEinstellungen } from '../src/einstellungen/einstellungen';
import { Konten } from '../src/konten';
import { speicherKontoRepo } from '../src/konten/konto-repo';
import { speicherRepo } from '../src/repo/speicher';
import { routen, type Anfrage } from '../src/http/routen';
import '../src/sprache/sprache';

const GEHEIM = 'Abmahnung Jonas';
type Bezuege = Record<string, { titel: string; typId: string; verborgen?: boolean }>;
type Liste = { mappen: Mappe[]; bezuege: Bezuege };

/** Privat markierte Vorgänge sieht nur, wer sie angelegt hat. */
const privatNurErsteller: Regelwerk = {
  grund: ALLES,
  regeln: [
    {
      id: 'privat',
      name: 'Privat nur für den Ersteller',
      wenn: [
        { art: 'feld', bedingung: { art: 'feld', feld: 'privat', op: 'ja' } },
        { art: 'feld', nicht: true, bedingung: { art: 'feld', feld: '_erstelltVon', op: 'zeigtAuf', wert: { art: 'ich' } } },
      ],
      dann: { C: 'entziehen', R: 'entziehen', U: 'entziehen', D: 'entziehen', P: 'entziehen' },
      stopp: true,
    },
  ],
};

async function aufbau() {
  const d = new Dienst(speicherRepo(), speicherDateien(), { einstellungen: speicherEinstellungen() });
  const konten = new Konten(speicherKontoRepo(), null, 'http://nas', d.systemtypen.benutzerspiegel());
  d.verbindeKonten(konten.papierkorbHaken());
  const { benutzer: markus } = await konten.einrichten({ email: 'markus@example.org', name: 'Markus', passwort: 'ein-langes-passwort' });
  const { benutzer: lena } = await konten.legeBenutzerAn({ email: 'lena@example.org', name: 'Lena' }, markus.id);
  await d.postSystemmappen.gleicheBenutzerAb(await konten.listeBenutzer());
  const akte = await d.mappentypen.legeTypAn({ name: 'Akte', schluessel: 'akte', felder: [{ key: 'nr', label: 'Nr.', typ: 'text' }] });
  const vorgang = await d.mappentypen.legeTypAn({
    name: 'Vorgang',
    schluessel: 'vorgang',
    titelVorlage: '{name}',
    felder: [
      { key: 'name', label: 'Name', typ: 'text', pflicht: true },
      { key: 'akte', label: 'Akte', typ: 'referenz', zielTypen: [akte.id] },
      { key: 'privat', label: 'Privat', typ: 'janein' },
      { key: 'text', label: 'Beschreibung', typ: 'formatiert' },
    ],
    trefferliste: ['_titel', 'text'],
  });
  await d.mappentypen.aendereTyp(akte.id, {
    ...akte,
    felder: [...akte.felder, { key: 'vorgaenge', label: 'Vorgänge', typ: 'tabelle', quelle: { typId: vorgang.id, feldKey: 'akte' } }],
  });
  await d.berechtigungen.setzeBerechtigungen(vorgang.id, privatNurErsteller, true);
  const a = await d.mappen.legeMappeAn({ typId: akte.id, werte: { nr: 'A-1' } }, markus.id);
  const geheim = await d.mappen.legeMappeAn({ typId: vorgang.id, werte: { name: GEHEIM, privat: true } }, markus.id);
  const offen = await d.mappen.legeMappeAn({ typId: vorgang.id, werte: { name: 'Gemeinsamer Vertrag' } }, markus.id);
  const weg = await d.mappen.legeMappeAn({ typId: vorgang.id, werte: { name: 'Alte Notiz' } }, markus.id);
  const text = `Siehe ${erwaehnung('', geheim.id)}, ${erwaehnung('', offen.id)} und ${erwaehnung('Alte Notiz', weg.id)}`;
  const liste = await d.mappen.legeMappeAn({ typId: vorgang.id, werte: { name: 'Übersicht', akte: a.id, text } }, markus.id);
  await d.loeschen.loescheMappe(weg.id, markus.id);
  const alle = routen(d, konten, {});
  const route = (m: string, p: string) => alle.find((r) => r.methode === m && r.pfad === p)!;
  const ich = async (id: string) => (await konten.listeBenutzer()).find((b) => b.id === id)!;
  const rufe = async (b: { id: string }, m: string, p: string, x: Partial<Anfrage> = {}) =>
    (await route(m, p).handler({ body: {}, params: {}, query: {}, ip: '1', ...x, benutzer: await ich(b.id) })).body as Liste;
  const listen = (b: { id: string }) =>
    Promise.all([
      rufe(b, 'GET', '/api/mappen', { query: { sicht: `typ:${vorgang.id}` } }),
      rufe(b, 'GET', '/api/mappen/:id/tabelle/:feld', { params: { id: a.id, feld: 'vorgaenge' } }),
      rufe(b, 'GET', '/api/mappen/:id/verweisende', { params: { id: a.id }, query: { typ: vorgang.id, feld: 'akte' } }),
    ]);
  return { d, markus, lena, geheim, offen, weg, liste, listen, rufe, vorgang, route, ich };
}

describe('Trefferlisten: Titel erwähnter Mappen nach Rechten (#1333)', () => {
  it('zwei Personen, dieselbe Liste: Markus sieht den Titel, Lena nur „verborgen“ – in Ansicht, Tabellenfeld und Register', async () => {
    const { markus, lena, geheim, offen, weg, liste, listen } = await aufbau();
    for (const [i, l] of (await listen(markus)).entries()) {
      assert.ok(
        l.mappen.some((m) => m.id === liste.id),
        `Liste ${i}`,
      );
      assert.equal(l.bezuege[geheim.id]?.titel, GEHEIM, `Liste ${i}: Markus darf die private Mappe lesen`);
      assert.ok(!l.bezuege[geheim.id].verborgen);
      assert.equal(l.bezuege[offen.id]?.titel, 'Gemeinsamer Vertrag');
      assert.equal(l.bezuege[weg.id], undefined, `Liste ${i}: gelöscht – kein Eintrag`);
    }
    for (const [i, l] of (await listen(lena)).entries()) {
      assert.ok(
        l.mappen.some((m) => m.id === liste.id),
        `Liste ${i}`,
      );
      assert.ok(!l.mappen.some((m) => m.id === geheim.id), `Liste ${i}: die private Mappe selbst ist keine Zeile`);
      assert.deepEqual({ ...l.bezuege[geheim.id], titel: '' }, { titel: '', typId: '', verborgen: true }, `Liste ${i}: maskiert`);
      assert.equal(l.bezuege[offen.id]?.titel, 'Gemeinsamer Vertrag');
      assert.equal(l.bezuege[weg.id], undefined);
      assert.ok(!JSON.stringify(l).includes(GEHEIM), `Liste ${i}: kein Titel ohne Leserecht: ${JSON.stringify(l)}`);
      // Auch kein gespeicherter Titel aus älteren Texten (#1293): der Text trägt nur die Kennung.
      assert.ok(!JSON.stringify(l).includes('Alte Notiz'));
    }
  });

  it('gesammelt je Seite: eine Abfrage für die Titel aller Erwähnungen der Seite – nicht je Zeile oder Zelle', async () => {
    const { d, markus, lena, offen, vorgang, rufe } = await aufbau();
    // Weitere Zeilen, die dieselbe und weitere Mappen erwähnen.
    for (let i = 0; i < 5; i++)
      await d.mappen.legeMappeAn({ typId: vorgang.id, werte: { name: `Zeile ${i}`, text: `zu ${erwaehnung('', offen.id)}` } }, markus.id);
    const repo = d.kern.repo;
    const echt = repo.bezuege.bind(repo);
    const aufrufe: string[][] = [];
    repo.bezuege = async (ids) => {
      aufrufe.push([...ids]);
      return echt(ids);
    };
    try {
      const l = await rufe(lena, 'GET', '/api/mappen', { query: { sicht: `typ:${vorgang.id}` } });
      assert.ok(l.mappen.length >= 7);
      assert.equal(aufrufe.length, 1, JSON.stringify(aufrufe));
      assert.ok(aufrufe[0].includes(offen.id));
    } finally {
      repo.bezuege = echt;
    }
  });

  it('erwähnte Personen: Personenliste und Bezüge folgen demselben Leserecht an der Benutzer-Mappe', async () => {
    // Die Mappe zeigt eine erwähnte Person mit dem Namen aus /api/personen, die Liste (web: zelle) ebenso; fehlt sie dort,
    // zeigen beide „Mappe (nicht sichtbar)“ aus der Sichtbarkeit bzw. den maskierten Bezügen. Lena darf hier nur ihre
    // eigene Benutzer-Mappe lesen – die von Markus nicht.
    const { d, markus, lena, vorgang, rufe, route, ich } = await aufbau();
    const benutzerTyp = (await d.mappentypen.listeTypen()).find((t) => t.system === 'benutzer')!;
    await d.berechtigungen.setzeBerechtigungen(
      benutzerTyp.id,
      {
        grund: ALLES,
        regeln: [
          {
            id: 'lena',
            name: 'Lena nur die eigene',
            wenn: [
              { art: 'benutzer', benutzer: [lena.id] },
              { art: 'eigeneMappe', nicht: true },
            ],
            dann: { R: 'entziehen' },
            stopp: true,
          },
        ],
      },
      true,
    );
    const text = `Mit ${erwaehnung('', markus.id)} und ${erwaehnung('', lena.id)}`;
    const quelle = await d.mappen.legeMappeAn({ typId: vorgang.id, werte: { name: 'Besprechung', text } }, markus.id);
    const personen = async (b: { id: string }) =>
      (await route('GET', '/api/personen').handler({ body: {}, params: {}, query: {}, ip: '1', benutzer: await ich(b.id) })).body as Array<{
        id: string;
        name: string;
      }>;
    for (const [b, sichtbar] of [
      [markus, { [markus.id]: 'Markus', [lena.id]: 'Lena' }],
      [lena, { [lena.id]: 'Lena' }],
    ] as const) {
      const namen = Object.fromEntries(
        (await personen(b)).filter((p) => p.id === markus.id || p.id === lena.id).map((p) => [p.id, p.name]),
      );
      assert.deepEqual(namen, sichtbar, `Personenliste für ${b.id}`);
      const l = await rufe(b, 'GET', '/api/mappen', { query: { sicht: `typ:${vorgang.id}` } });
      assert.ok(l.mappen.some((m) => m.id === quelle.id));
      // Gleiche Regel: in der Personenliste ⇔ Benutzer-Mappe in den Bezügen lesbar; sonst maskiert, ohne Namen.
      for (const id of [markus.id, lena.id]) assert.equal(!l.bezuege[id]?.verborgen, id in namen, `${b.id}: ${id}`);
      if (b === lena) {
        assert.deepEqual({ ...l.bezuege[markus.id], titel: '' }, { titel: '', typId: '', verborgen: true });
        assert.ok(!JSON.stringify(l.bezuege).includes('Markus'));
      }
    }
  });
});
