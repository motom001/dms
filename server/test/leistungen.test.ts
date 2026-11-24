/**
 * Leistungen (#1569): direkt und im Hintergrund mit einem Test-Anbieter (`kontext` kommt unverändert zurück), Ablegen
 * im Ziel mit den Rechten der Person, eindeutige Antworten (ungültige Eingabe und Ausgabe, kein Anbieter mit Grund und
 * Katalog-Adresse, kein Schreibrecht am Ziel – je ohne Folgen), Wartungsmodus staut, Neustart wiederholt (außer
 * Wirkung nach außen), Aufbewahrung. Im Arbeitsspeicher; PostgreSQL in leistungen-pg.test.ts.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { NICHTS } from '../../shared/src/rechte';
import { katalogAdresse, type Datei, type Leistungsname } from '../../shared/src/leistungen';
import { speicherDateien } from '../src/dateien/dateispeicher';
import { Dienst } from '../src/dienst/dienst';
import { speicherEinstellungen } from '../src/einstellungen/einstellungen';
import { Fachfehler } from '../src/grundlagen/fehler';
import { Konten } from '../src/konten';
import { speicherKontoRepo } from '../src/konten/konto-repo';
import { speicherRepo } from '../src/repo/speicher';
import { routen, type Anfrage } from '../src/http/routen';
import { speicherAuftraege, type Anbieter, type Wer } from '../src/leistungen';
import { imModus, pdfMitText } from './hilfen';

const fehler = (status: number, code: string) => (e: unknown) =>
  e instanceof Fachfehler && e.status === status && (e.details as { code?: string })?.code === `leistung.${code}`;

/** Test-Anbieter: Text als „PDF“, Übersetzen in Großbuchstaben, Mail ohne Versand; mit Schaltern für Fehlverhalten. */
function testAnbieter(o: { falsch?: boolean; haengt?: boolean; aufrufe?: string[] } = {}): Anbieter {
  return {
    id: 'test.anbieter',
    art: 'paket',
    bietet: {
      'dokument.erstellen.aus-text@1': {},
      'text.uebersetzen@1': {},
      'nachricht.senden.mail@1': {},
      'dokument.lesen.text@1': { dateitypen: ['application/pdf'] },
    },
    async fuehreAus(a) {
      o.aufrufe?.push(a.leistung);
      if (o.haengt) await new Promise((r) => setTimeout(r, 1000));
      if (o.falsch) return { daten: { seiten: 'eins' } };
      if (a.leistung === 'text.uebersetzen@1') return { daten: { text: String(a.eingabe.text).toUpperCase() } };
      if (a.leistung === 'nachricht.senden.mail@1') return { daten: { kennung: 'm-1' } };
      if (a.leistung === 'dokument.lesen.text@1') return { daten: { text: `${(a.eingabe.datei as Datei).name} gelesen`, seiten: 1 } };
      return { daten: { seiten: 1 }, datei: { inhalt: pdfMitText([String(a.eingabe.text)]), mime: 'application/pdf', name: 'Brief.pdf' } };
    },
  };
}

async function aufbau() {
  const d = new Dienst(speicherRepo(), speicherDateien(), { einstellungen: speicherEinstellungen() });
  const konten = new Konten(speicherKontoRepo(), null, 'http://nas', d.systemtypen.benutzerspiegel());
  d.verbindeKonten(konten.papierkorbHaken());
  const { benutzer: admin } = await konten.einrichten({ email: 'katrin@example.org', name: 'Katrin', passwort: 'ein-langes-passwort' });
  const lena = (await konten.legeBenutzerAn({ email: 'lena@example.org', name: 'Lena' }, admin.id)).benutzer;
  await d.postSystemmappen.gleicheBenutzerAb(await konten.listeBenutzer());
  const mitglied = (await d.postSystemmappen.listeRollen()).find((r) => r.system && r.name === 'Mitglied')!.id;
  const typ = await d.mappentypen.legeTypAn({
    name: 'Ordner',
    felder: [{ key: 'name', label: 'Name', typ: 'text', pflicht: true }],
    register: [
      { key: 'daten', name: 'Daten', art: 'felder', felder: ['name'] },
      { key: 'dokumente', name: 'Dokumente', art: 'dokumente' },
    ],
  } as never);
  // Lena darf lesen, aber nichts ablegen.
  await d.berechtigungen.setzeBerechtigungen(
    typ.id,
    {
      grund: NICHTS,
      regeln: [{ id: 'm', name: 'Mitglieder lesen', wenn: [{ art: 'rolle', rollen: [mitglied] }], dann: { R: 'erteilen' }, stopp: false }],
    },
    true,
  );
  const mappe = (await d.mappen.legeMappeAn({ typId: typ.id, werte: { name: 'Haus' } }, admin.id)).id;
  const brief = (
    await d.dokumente.ladeHoch(mappe, { register: 'dokumente', name: 'brief.pdf', typ: 'application/pdf' }, pdfMitText(['Hallo']), admin.id)
  ).dokument.id;
  const speicher = speicherAuftraege();
  d.leistungen.verbindeSpeicher(speicher);
  const wer = async (b: { id: string; rolle: string }): Promise<Wer> => ({
    fragender: { art: 'person', ich: { id: b.id, rolle: b.rolle } },
    z: await d.rechtepruefung.zugriff({ id: b.id, rolle: b.rolle }),
  });
  const katrin = await wer({ id: admin.id, rolle: 'admin' });
  const lenaWer = await wer({ id: lena.id, rolle: 'mitglied' });
  const ereignisse: Array<{ art: string; daten: Record<string, unknown> }> = [];
  const ereignis = d.kern.ereignis.bind(d.kern);
  d.kern.ereignis = async (art, daten, von) => {
    ereignisse.push({ art, daten });
    return ereignis(art, daten, von);
  };
  const tabelle = routen(d, konten, {});
  const ich = async (id: string) => (await konten.listeBenutzer()).find((b) => b.id === id)!;
  const rufe = async (b: { id: string }, m: string, p: string, x: Partial<Anfrage> = {}) =>
    tabelle
      .find((r) => r.methode === m && r.pfad === p)!
      .handler({
        body: {},
        params: {},
        query: {},
        ip: '1',
        ...x,
        benutzer: x.benutzer ?? (b.id === admin.id ? imModus(await ich(b.id)) : await ich(b.id)),
      });
  return { d, admin, lena, katrin, lenaWer, mappe, brief, speicher, ereignisse, rufe };
}

/** Warten, bis der Hintergrund nichts mehr tut. */
async function ruhig(d: Dienst) {
  for (let i = 0; i < 200; i++) {
    await new Promise((r) => setImmediate(r));
    if (!d.leistungen.beschaeftigt) return;
    await new Promise((r) => setTimeout(r, 5));
  }
}

describe('Leistungen: Vermittlung (#1569)', () => {
  it('direkt: Ergebnis mit kontext unverändert; Datei als neues Dokument im Ziel mit dem Konto der Person', async () => {
    const x = await aufbau();
    x.d.leistungen.anbieter.melde(testAnbieter());
    const kontext = { meins: [1, 'zwei', { drei: true }] };
    const r = await x.d.leistungen.abrufen(x.katrin, 'text.uebersetzen@1', { eingabe: { text: 'hallo', nach: 'en' }, kontext });
    assert.deepEqual(r.daten, { text: 'HALLO' });
    assert.deepEqual(r.kontext, kontext);
    assert.equal(r.anbieter, 'test.anbieter');
    const a = await x.d.leistungen.abrufen(x.katrin, 'dokument.erstellen.aus-text@1', {
      eingabe: { text: 'Brief' },
      ziel: { mappe: x.mappe },
    });
    const dok = await x.d.kern.repo.holeDokument(a.dokument!);
    assert.equal(dok?.mappeId, x.mappe);
    assert.equal(dok?.mime, 'application/pdf');
    assert.equal(dok?.erstelltVon, x.admin.id);
    assert.equal((a as { datei?: unknown }).datei, undefined, 'Personen bekommen keine Datei zurück');
    assert.deepEqual(
      x.speicher.alle().map((z) => [z.art, z.zustand, z.eingabe]),
      [
        ['direkt', 'fertig', null],
        ['direkt', 'fertig', null],
      ],
    );
  });

  it('im Hintergrund: Ereignis „fertig“ mit kontext, Stand abrufbar für die Person, nicht für andere', async () => {
    const x = await aufbau();
    x.d.leistungen.anbieter.melde(testAnbieter());
    await x.d.leistungen.start({ zurueckstellen: false });
    try {
      const kontext = 'rechnung-42';
      const r = await x.d.leistungen.beauftragen(x.katrin, 'dokument.erstellen.aus-text@1', {
        eingabe: { text: 'Hallo' },
        kontext,
        ziel: { mappe: x.mappe },
      });
      assert.equal(r.zustand, 'wartet');
      await ruhig(x.d);
      const fertig = x.ereignisse.find((e) => e.art === 'leistung.fertig');
      assert.ok(fertig);
      assert.equal(fertig.daten.auftrag, r.auftrag);
      assert.equal(fertig.daten.kontext, undefined, 'im Ereignis nur Ids');
      const s = await x.d.leistungen.auftrag(x.katrin, r.auftrag);
      assert.equal(s.zustand, 'fertig');
      assert.equal(s.kontext, kontext);
      assert.ok(s.dokument);
      await assert.rejects(x.d.leistungen.auftrag(x.lenaWer, r.auftrag), (e: unknown) => e instanceof Fachfehler && e.status === 404);
      // Über die Schnittstelle: 202 und Stand.
      const h = await x.rufe(x.admin, 'POST', '/api/leistungen/:name/beauftragen', {
        params: { name: 'text.uebersetzen@1' },
        body: { eingabe: { text: 'a', nach: 'en' }, kontext: { k: 1 } },
      });
      assert.equal(h.status, 202);
      await ruhig(x.d);
      const st = await x.rufe(x.admin, 'GET', '/api/leistungen/auftraege/:id', { params: { id: (h.body as { auftrag: string }).auftrag } });
      assert.deepEqual((st.body as { daten: unknown; kontext: unknown }).daten, { text: 'A' });
      assert.deepEqual((st.body as { kontext: unknown }).kontext, { k: 1 });
    } finally {
      x.d.leistungen.stop();
    }
  });

  it('ungültige Eingabe, unbekannte Leistung, zu großer kontext: eindeutige Antwort, kein Auftrag, kein Aufruf', async () => {
    const x = await aufbau();
    const aufrufe: string[] = [];
    x.d.leistungen.anbieter.melde(testAnbieter({ aufrufe }));
    await assert.rejects(
      x.d.leistungen.abrufen(x.katrin, 'text.uebersetzen@1', { eingabe: { text: 'a' } }),
      fehler(422, 'eingabe-ungueltig'),
    );
    await assert.rejects(
      x.d.leistungen.abrufen(x.katrin, 'text.uebersetzen@1', { eingabe: { text: 'a', nach: 'en', mehr: 1 } }),
      fehler(422, 'eingabe-ungueltig'),
    );
    await assert.rejects(
      x.d.leistungen.beauftragen(x.katrin, 'text.uebersetzen@1', { eingabe: { text: 'a', nach: 'english' } }),
      fehler(422, 'eingabe-ungueltig'),
    );
    await assert.rejects(x.d.leistungen.abrufen(x.katrin, 'text.erfinden@1', { eingabe: {} }), fehler(404, 'unbekannt'));
    await assert.rejects(
      x.d.leistungen.abrufen(x.katrin, 'text.uebersetzen@1', { eingabe: { text: 'a', nach: 'en' }, kontext: 'x'.repeat(5000) }),
      fehler(422, 'eingabe-ungueltig'),
    );
    assert.deepEqual(aufrufe, []);
    assert.deepEqual(x.speicher.alle(), []);
  });

  it('ungültige Ausgabe: fehlgeschlagen, nichts abgelegt', async () => {
    const x = await aufbau();
    x.d.leistungen.anbieter.melde(testAnbieter({ falsch: true }));
    const vorher = (await x.d.kern.repo.listeDokumente(x.mappe)).length;
    await assert.rejects(
      x.d.leistungen.abrufen(x.katrin, 'dokument.erstellen.aus-text@1', { eingabe: { text: 'Brief' }, ziel: { mappe: x.mappe } }),
      fehler(502, 'ausgabe-ungueltig'),
    );
    assert.equal((await x.d.kern.repo.listeDokumente(x.mappe)).length, vorher);
    assert.deepEqual(
      x.speicher.alle().map((z) => [z.zustand, z.fehler?.code]),
      [['fehlgeschlagen', 'ausgabe-ungueltig']],
    );
  });

  it('kein Anbieter: Grund und Katalog-Adresse (keiner, aus, Dateityp)', async () => {
    const x = await aufbau();
    const ist = (grund: string) => (e: unknown) =>
      fehler(409, 'kein-anbieter')(e) &&
      (e as Fachfehler).message.includes(katalogAdresse('dokument.lesen.text@1')) &&
      (e as Fachfehler & { details: { grund: string; katalog: string } }).details.grund === grund;
    const eingabe = { datei: x.brief };
    await assert.rejects(x.d.leistungen.abrufen(x.katrin, 'dokument.lesen.text@1', { eingabe }), ist('keiner'));
    x.d.leistungen.anbieter.melde({ ...testAnbieter(), bietet: { 'dokument.lesen.text@1': { dateitypen: ['image/png'] } } });
    await assert.rejects(x.d.leistungen.abrufen(x.katrin, 'dokument.lesen.text@1', { eingabe }), ist('dateityp'));
    x.d.leistungen.anbieter.melde(testAnbieter());
    x.d.leistungen.anbieter.an = () => false;
    await assert.rejects(x.d.leistungen.abrufen(x.katrin, 'dokument.lesen.text@1', { eingabe }), ist('aus'));
    x.d.leistungen.anbieter.an = () => true;
    const r = await x.d.leistungen.abrufen(x.katrin, 'dokument.lesen.text@1', { eingabe });
    assert.equal(r.daten?.text, 'brief.pdf gelesen');
    assert.equal(x.speicher.alle().length, 1);
  });

  it('Rechte: kein Schreibrecht am Ziel, nicht lesbares Dokument, Ziel nötig, Wirkung nur für Verwaltende – nichts passiert', async () => {
    const x = await aufbau();
    const aufrufe: string[] = [];
    x.d.leistungen.anbieter.melde(testAnbieter({ aufrufe }));
    await assert.rejects(
      x.d.leistungen.abrufen(x.lenaWer, 'dokument.erstellen.aus-text@1', { eingabe: { text: 'a' }, ziel: { mappe: x.mappe } }),
      fehler(403, 'kein-schreibrecht'),
    );
    await assert.rejects(
      x.d.leistungen.beauftragen(x.lenaWer, 'dokument.erstellen.aus-text@1', { eingabe: { text: 'a' }, ziel: { mappe: x.mappe } }),
      fehler(403, 'kein-schreibrecht'),
    );
    await assert.rejects(
      x.d.leistungen.abrufen(x.lenaWer, 'dokument.erstellen.aus-text@1', { eingabe: { text: 'a' } }),
      fehler(422, 'ziel-noetig'),
    );
    await assert.rejects(
      x.d.leistungen.abrufen(x.lenaWer, 'nachricht.senden.mail@1', { eingabe: { an: ['lena@example.org'], betreff: 'b', text: 't' } }),
      fehler(403, 'nur-verwaltung'),
    );
    await assert.rejects(
      x.d.leistungen.abrufen(x.lenaWer, 'dokument.lesen.text@1', { eingabe: { datei: '00000000-0000-4000-8000-00000000abcd' } }),
      fehler(404, 'kein-leserecht'),
    );
    // Lesen darf Lena.
    assert.equal(
      (await x.d.leistungen.abrufen(x.lenaWer, 'dokument.lesen.text@1', { eingabe: { datei: x.brief } })).daten?.text,
      'brief.pdf gelesen',
    );
    assert.deepEqual(aufrufe, ['dokument.lesen.text@1']);
    // Pakete erst mit #1571.
    const paket = { ...x.lena, rolle: 'mitglied', art: 'dienst' } as Anfrage['benutzer'];
    await assert.rejects(
      x.rufe(x.lena, 'GET', '/api/leistungen/auftraege/:id', { params: { id: 'x' }, benutzer: paket }),
      (e: unknown) => e instanceof Fachfehler && e.status === 403,
    );
  });

  it('Zeitgrenze: Auftrag bricht ab, fehlgeschlagen mit Grund', async () => {
    const x = await aufbau();
    x.d.leistungen.anbieter.melde(testAnbieter({ haengt: true }));
    x.d.leistungen.zeitgrenzeMs = () => 20;
    await assert.rejects(
      x.d.leistungen.abrufen(x.katrin, 'text.uebersetzen@1', { eingabe: { text: 'a', nach: 'en' } }),
      fehler(504, 'zeitgrenze'),
    );
    assert.equal(x.speicher.alle()[0].fehler?.code, 'zeitgrenze');
  });

  it('Wartungsmodus staut, danach geht es weiter', async () => {
    const x = await aufbau();
    x.d.leistungen.anbieter.melde(testAnbieter());
    let wartung = true;
    x.d.leistungen.pause = () => wartung;
    await x.d.leistungen.start({ zurueckstellen: false });
    try {
      const r = await x.d.leistungen.beauftragen(x.katrin, 'text.uebersetzen@1', { eingabe: { text: 'a', nach: 'en' } });
      await ruhig(x.d);
      assert.equal((await x.d.leistungen.auftrag(x.katrin, r.auftrag)).zustand, 'wartet');
      wartung = false;
      x.d.leistungen.anstossen();
      await ruhig(x.d);
      assert.equal((await x.d.leistungen.auftrag(x.katrin, r.auftrag)).zustand, 'fertig');
    } finally {
      x.d.leistungen.stop();
    }
  });

  it('Neustart: Laufendes wiederholen, mit Wirkung „unterbrochen“; zu viele Versuche: aufgegeben', async () => {
    const x = await aufbau();
    const aufrufe: string[] = [];
    x.d.leistungen.anbieter.melde(testAnbieter({ aufrufe }));
    const neu = (id: string, leistung: Leistungsname, eingabe: Record<string, unknown>, wirkung: boolean) =>
      x.speicher.lege({
        id,
        leistung,
        art: 'hintergrund',
        zustand: 'laeuft',
        eingabe,
        kontext: id,
        ziel: null,
        wer: x.katrin.fragender,
        wirkung,
        zeitgrenzeS: 60,
      });
    await neu('00000000-0000-4000-8000-000000000001', 'text.uebersetzen@1', { text: 'a', nach: 'en' }, false);
    await neu(
      '00000000-0000-4000-8000-000000000002',
      'nachricht.senden.mail@1',
      { an: ['lena@example.org'], betreff: 'b', text: 't' },
      true,
    );
    await x.d.leistungen.start({ zurueckstellen: true });
    try {
      await ruhig(x.d);
      const z = Object.fromEntries(x.speicher.alle().map((a) => [a.kontext, a.zustand]));
      assert.deepEqual(z, { '00000000-0000-4000-8000-000000000001': 'fertig', '00000000-0000-4000-8000-000000000002': 'unterbrochen' });
      assert.deepEqual(aufrufe, ['text.uebersetzen@1'], 'die Mail ging nicht noch einmal raus');
    } finally {
      x.d.leistungen.stop();
    }
    // Nimmt sich ein Prozess denselben Auftrag zu oft (er endet jedes Mal dabei), gibt er auf.
    const y = await aufbau();
    y.d.leistungen.anbieter.melde(testAnbieter());
    await y.speicher.lege({
      id: '00000000-0000-4000-8000-000000000003',
      leistung: 'text.uebersetzen@1',
      art: 'hintergrund',
      zustand: 'wartet',
      eingabe: { text: 'a', nach: 'en' },
      kontext: null,
      ziel: null,
      wer: y.katrin.fragender,
      wirkung: false,
      zeitgrenzeS: 60,
    });
    for (let i = 0; i < 3; i++) {
      await y.speicher.naechster();
      await y.speicher.zurueckstellen();
    }
    await y.d.leistungen.start({ zurueckstellen: false });
    try {
      await ruhig(y.d);
      assert.deepEqual(
        y.speicher.alle().map((a) => [a.zustand, a.fehler?.code]),
        [['fehlgeschlagen', 'abgebrochen']],
      );
      assert.ok(y.ereignisse.some((e) => e.art === 'leistung.fehlgeschlagen' && e.daten.fehler === 'abgebrochen'));
    } finally {
      y.d.leistungen.stop();
    }
  });

  it('Aufbewahrung: 24/48/96 Stunden, Vorgabe 48; Abgeschlossene danach weg, Offene bleiben', async () => {
    let jetzt = Date.parse('2026-11-24T10:00:00Z');
    const s = speicherAuftraege(() => jetzt);
    const x = await aufbau();
    x.d.leistungen.verbindeSpeicher(s);
    assert.deepEqual(await x.d.leistungen.einstellungen(), { aufbewahrungStunden: 48 });
    await assert.rejects(
      x.d.leistungen.speichereEinstellungen({ aufbewahrungStunden: 12 }),
      (e: unknown) => e instanceof Fachfehler && e.status === 422,
    );
    const r = await x.rufe(x.admin, 'PUT', '/api/werkbank/leistungen/einstellungen', { body: { aufbewahrungStunden: 24 } });
    assert.deepEqual(r.body, { aufbewahrungStunden: 24 });
    x.d.leistungen.anbieter.melde(testAnbieter());
    await x.d.leistungen.abrufen(x.katrin, 'text.uebersetzen@1', { eingabe: { text: 'a', nach: 'en' } });
    x.d.leistungen.stop(); // Der offene Auftrag bleibt liegen.
    await x.d.leistungen.beauftragen(x.katrin, 'text.uebersetzen@1', { eingabe: { text: 'b', nach: 'en' } });
    jetzt += 25 * 3_600_000;
    await x.d.leistungen.raeumeAuf();
    assert.deepEqual(
      s.alle().map((a) => a.zustand),
      ['wartet'],
    );
  });

  it('Katalog über die Schnittstelle: Anzeigename, Ergebnisart, wer es macht', async () => {
    const x = await aufbau();
    x.d.leistungen.anbieter.melde(testAnbieter());
    const k = (await x.rufe(x.lena, 'GET', '/api/leistungen')).body as Array<{
      name: string;
      anzeigename: string;
      ergebnis: string;
      anbieter: unknown[];
    }>;
    const t = k.find((e) => e.name === 'dokument.lesen.text@1')!;
    assert.equal(t.anzeigename, 'Text lesen');
    assert.equal(t.ergebnis, 'exakt');
    assert.deepEqual(t.anbieter, [{ id: 'test.anbieter', art: 'paket', an: true }]);
    assert.deepEqual(k.find((e) => e.name === 'text.vektor@1')!.anbieter, []);
  });
});
