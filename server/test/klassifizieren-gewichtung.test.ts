/**
 * „Wohin gehört das?“ treffsicherer (KW49): Nähe statt Menge und Gegenanzeichen (#1672), Typen ohne abgelegte Beispiele
 * (#1673), Absender als Beleg (#1680), Typgrößen an das Ähnlichkeits-Paket (#1682), „Woran man ihn erkennt“ ganz (#1652).
 * Das Paket ist eine Nachbildung des heutigen „KI lokal – Ähnlichkeit“ (zählt nur); Firmen und Texte sind erfunden
 * (Personas Lena und Jonas Muster, example.org).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  absenderSicherheit,
  aehnlichkeitJeTyp,
  daempfe,
  erkennbarSicherheit,
  SCHWELLE_STANDARD,
  SICHER_AB,
  verbindeWege,
  type Kandidat,
  type Weg,
} from '../../shared/src/klassifizierung';
import { liesCode, type InstalliertesPaket } from '../../shared/src/pakete';
import type { Register } from '../../shared/src/model';
import { speicherDateien } from '../src/dateien/dateispeicher';
import { Dienst } from '../src/dienst/dienst';
import { speicherEinstellungen } from '../src/einstellungen/einstellungen';
import { Konten } from '../src/konten';
import { speicherKontoRepo } from '../src/konten/konto-repo';
import { speicherRepo } from '../src/repo/speicher';
import { liesVektor } from '../src/suche/vektoren';

const FELDER: Register = { key: 'allgemein', name: 'Allgemein', art: 'felder' };
const DOKS: Register = { key: 'dokumente', name: 'Dokumente', art: 'dokumente' };

/** Ein Versicherungsschein – kein Kontoauszug, auch wenn die Ablage voller Kontoauszüge ist. */
const SCHEIN = `Beispiel Versicherung AG · Postfach 1 · 01067 Musterstadt
Lena Muster
Lindenweg 4
01234 Beispielort

Versicherungsschein
Vertragsnummer HV-2026-4711
Versicherungsnehmer: Lena Muster
Laufzeit 01.01.2027 bis 31.12.2027, Beitrag 84,00 EUR jährlich
Kündigung drei Monate vor Ablauf. Fragen: service@example.org`;

const AEHNLICH = (() => {
  const r = liesCode({
    sprache: 'c',
    ereignisse: ['volltext.fertig'],
    rechte: { lesen: ['*'], dokumente: 'lesen', schnittstellen: ['dms:vektoren', 'dms:klassifizieren'] },
    netz: [],
  });
  return r.code!;
})();
const paket = (): InstalliertesPaket => ({
  id: 'ki_aehnlich',
  name: 'KI lokal – Ähnlichkeit',
  version: '1.0.0',
  beschreibung: '',
  lizenz: 'Apache-2.0',
  autor: { name: 'T', github: 't' },
  dms: '>=0.226.0',
  herkunft: { art: 'hochgeladen', von: null, am: '' },
  installiert: new Date().toISOString(),
  installiertVon: null,
  aktualisiert: null,
  aktualisiertVon: null,
  typen: {},
  sichten: {},
  abhaengigkeiten: {},
  code: true,
  laeufer: { ...AEHNLICH, modul: { sha256: 'x', groesse: 1 } },
});

async function aufbau() {
  const d = new Dienst(speicherRepo(), speicherDateien(), { einstellungen: speicherEinstellungen() });
  const konten = new Konten(speicherKontoRepo(), null, 'http://nas', d.systemtypen.benutzerspiegel());
  d.verbindeKonten(konten.papierkorbHaken());
  const { benutzer: lena } = await konten.einrichten({ email: 'lena@example.org', name: 'Lena Muster', passwort: 'ein-langes-passwort' });
  await d.postSystemmappen.gleicheBenutzerAb(await konten.listeBenutzer());
  const konto = await d.mappentypen.legeTypAn({
    name: 'Konto',
    felder: [{ key: 'iban', label: 'IBAN', typ: 'text', format: 'iban', wiederfinden: true }],
    register: [{ ...FELDER, felder: ['iban'] }, DOKS],
  });
  const kontoauszug = await d.mappentypen.legeTypAn({
    name: 'Kontoauszug',
    erkennbarAn: 'Kontoauszug einer Bank: Kontostand, Buchungen, Zeitraum, IBAN oder Kontonummer, Saldo, Gutschrift, Lastschrift',
    felder: [
      { key: 'konto', label: 'Konto', typ: 'referenz', zielTyp: konto.id, pflicht: true },
      { key: 'nr', label: 'Auszugsnummer', typ: 'text' },
    ],
    register: [{ ...FELDER, felder: ['konto', 'nr'] }, DOKS],
  });
  const vertrag = await d.mappentypen.legeTypAn({
    name: 'Vertrag',
    erkennbarAn: 'Vertrag oder Versicherungsschein: Vertragsnummer, Laufzeit, Beitrag, Kündigung, Versicherungsnehmer',
    felder: [{ key: 'vnr', label: 'Vertragsnummer', typ: 'text', wiederfinden: true }],
    register: [{ ...FELDER, felder: ['vnr'] }, DOKS],
  });
  const rechnung = await d.mappentypen.legeTypAn({
    name: 'Rechnung',
    erkennbarAn: 'Enthält Rechnungsnummer, Betrag und Zahlungsziel',
    felder: [{ key: 'nr', label: 'Rechnungsnummer', typ: 'text' }],
    register: [{ ...FELDER, felder: ['nr'] }, DOKS],
  });
  const firma = await d.mappentypen.legeTypAn({
    name: 'Organisation',
    felder: [{ key: 'name', label: 'Name', typ: 'text', erkennung: { art: 'name' }, wiederfinden: true }],
    register: [{ ...FELDER, felder: ['name'] }, DOKS],
  });
  const A = await d.rechtepruefung.zugriff({ id: lena.id, rolle: 'admin' });
  const dok = async (mappe: string, text: string) => {
    const x = (
      await d.dokumente.ladeHoch(
        mappe,
        { register: 'dokumente', name: 'brief.pdf', typ: 'application/pdf' },
        Buffer.from('%PDF-1.4 x'),
        lena.id,
      )
    ).dokument;
    await d.volltexte.schreibeVolltext(x.id, { text }, { id: lena.id, herkunft: 'Test', paket: false });
    return x.id;
  };
  const brief = async (text: string) => {
    const p = await d.post.legePostAn({ betreff: 'Brief' }, { id: lena.id, name: 'Lena Muster' });
    return { post: p, dok: await dok(p.id, text) };
  };
  return { d, lena, A, konto, kontoauszug, vertrag, rechnung, firma, dok, brief };
}

/** Das heutige Paket (dms-registry#142): zählt die Typen der ähnlichsten Mappen – „10 von 10“. */
function zaehlendesPaket(x: Awaited<ReturnType<typeof aufbau>>) {
  const eingaenge: Array<Record<string, unknown>> = [];
  x.d.erkennung.klassifizierung.anbieter = {
    pakete: () => [{ id: 'ki_aehnlich', name: 'KI lokal – Ähnlichkeit', netz: false, vektoren: true }],
    klassifiziere: async (_p, e) => {
      eingaenge.push(e);
      const a = e.aehnliche as Array<{ typ: string }>;
      const zahl = new Map<string, number>();
      for (const y of a) zahl.set(y.typ, (zahl.get(y.typ) ?? 0) + 1);
      const typen = [...zahl]
        .sort((p, q) => q[1] - p[1])
        .slice(0, 3)
        .map(([typ, n]) => ({ typ, sicherheit: Math.min(0.95, n / a.length), begruendung: `${n} von ${a.length} ähnlichen` }));
      return { text: JSON.stringify({ typen }), ms: 1 };
    },
  };
  x.d.suche.vektorAnbieter = {
    paket: () => 'ki_aehnlich',
    vektorFuer: async () => ({ paket: 'ki_aehnlich', modell: 'test/8', vektor: liesVektor([1, 0, 0, 0, 0, 0, 0, 0]), schwelle: 0.1 }),
  };
  return eingaenge;
}

describe('Gewichtung (rein): Nähe, Gegenanzeichen, Absender, „Woran man ihn erkennt“', () => {
  it('Nähe statt Menge (#1672): zehn mäßig ähnliche Mappen machen nicht „sicher“, eine sehr ähnliche zählt', () => {
    const viele = aehnlichkeitJeTyp([
      ...Array.from({ length: 9 }, () => ({ typ: 'ka', aehnlichkeit: 0.6 })),
      { typ: 'v', aehnlichkeit: 0.9 },
    ]);
    assert.ok(viele.get('ka')!.wert < SICHER_AB, JSON.stringify(viele.get('ka')));
    assert.ok(viele.get('v')!.wert >= viele.get('ka')!.wert, 'die eine sehr ähnliche schlägt neun mäßige');
    assert.deepEqual({ ...viele.get('ka'), wert: 0 }, { anzahl: 9, sehr: 0, beste: 0.6, wert: 0 });
    assert.equal(viele.get('v')!.sehr, 1);
    // Unter der Mindestähnlichkeit zählt eine Mappe nicht.
    assert.equal(aehnlichkeitJeTyp([{ typ: 'x', aehnlichkeit: 0.46 }]).get('x')!.wert, 0);
  });

  it('Gegenanzeichen senken (#1672): eins etwas, mehrere bis „unsicher“, fehlendes Pflicht-Merkmal nie „sicher“', () => {
    const kaum = { art: 'erkennbar' as const, gefunden: 2, von: 8 };
    const ueber = { art: 'ueberschrift-fehlt' as const };
    const pflicht = { art: 'merkmal-fehlt' as const, feld: 'konto', typId: 'k', pflicht: true };
    assert.equal(daempfe(0.95, [], SCHWELLE_STANDARD), 0.95);
    assert.equal(daempfe(0.95, [ueber], SCHWELLE_STANDARD), 0.76);
    assert.ok(daempfe(0.95, [ueber, kaum, pflicht], SCHWELLE_STANDARD) < SCHWELLE_STANDARD);
    assert.ok(daempfe(0.95, [pflicht], SCHWELLE_STANDARD) < SICHER_AB);
    assert.ok(daempfe(0.95, [], SCHWELLE_STANDARD, true) < SICHER_AB, 'ohne Beispiele höchstens „wahrscheinlich“');
    // Ein Verweis, der kein Pflichtfeld ist, und wenige Wörter (unter drei) zählen nicht.
    assert.equal(
      daempfe(
        0.9,
        [
          { art: 'merkmal-fehlt', feld: 'v', typId: 'v' },
          { art: 'erkennbar', gefunden: 0, von: 2 },
        ],
        0.3,
      ),
      0.9,
    );
    // Die Reihenfolge bleibt auch unter der Schwelle erhalten.
    assert.ok(daempfe(0.9, [ueber, kaum], 0.3) > daempfe(0.5, [ueber, kaum], 0.3));
  });

  it('„Woran man ihn erkennt“ als Beleg (#1673) und Absender (#1680): gewichtet nach Anteil und Anzahl', () => {
    assert.equal(erkennbarSicherheit(1, 2), 0, 'ein Wort reicht nicht');
    assert.equal(erkennbarSicherheit(2, 8), 0, 'zu wenig vom Ganzen');
    assert.ok(erkennbarSicherheit(4, 5) >= SCHWELLE_STANDARD && erkennbarSicherheit(4, 5) <= 0.5);
    const s = absenderSicherheit(
      new Map([
        ['kontoauszug', 11],
        ['rechnung', 0],
      ]),
    );
    assert.equal(s.get('kontoauszug'), 0.7);
    assert.equal(s.has('rechnung'), false);
    const geteilt = absenderSicherheit(
      new Map([
        ['rechnung', 6],
        ['vertrag', 2],
      ]),
    );
    assert.ok(geteilt.get('rechnung')! > geteilt.get('vertrag')! && geteilt.get('vertrag')! > 0, JSON.stringify([...geteilt]));
  });
});

describe('„Wohin gehört das?“ im Kern (#1672, #1673, #1682)', () => {
  it('200 Kontoauszüge und 3 Verträge: ein Versicherungsschein ist nicht „sicher Kontoauszug“, „Vertrag“ steht vorn', async () => {
    const x = await aufbau();
    const eingaenge = zaehlendesPaket(x);
    await x.d.kern.repo.speicherePaket(paket());
    await x.d.suche.legeSynonymAn({ woerter: ['Vertrag', 'Versicherungsschein', 'Police'] }, x.lena.id);
    const giro = await x.d.mappen.legeMappeAn({ typId: x.konto.id, werte: { iban: 'DE02 1203 0000 0000 2020 51' } }, x.lena.id);
    const zp = await x.d.rechtepruefung.zugriff({ id: 'konto-ki_aehnlich', rolle: 'mitglied', art: 'dienst', paketId: 'ki_aehnlich' });
    for (let i = 0; i < 200; i++) {
      const m = await x.d.mappen.legeMappeAn({ typId: x.kontoauszug.id, werte: { konto: giro.id, nr: `${i + 1}/2026` } }, x.lena.id);
      // Zwölf davon mit Text und Vektor – mäßig ähnlich (Kosinus 0,64), wie Briefe mit Briefkopf und Anschrift.
      if (i < 12)
        await x.d.suche.setzeVektor(zp, await x.dok(m.id, `Kontoauszug ${i + 1}/2026`), 'test/8', { vektor: [1, 1.2, 0, 0, 0, 0, 0, 0] });
    }
    for (const vnr of ['KFZ-1', 'HR-2', 'STROM-3']) await x.d.mappen.legeMappeAn({ typId: x.vertrag.id, werte: { vnr } }, x.lena.id);
    const { dok } = await x.brief(SCHEIN);
    const r = await x.d.erkennung.klassifizierung.klassifiziere({ dokumente: [dok] }, x.A);
    const ka = r.typen.find((t) => t.typId === x.kontoauszug.id);
    assert.ok(!ka || ka.sicherheit < SICHER_AB, `nicht „sicher Kontoauszug“: ${JSON.stringify(ka?.sicherheit)}`);
    assert.equal(r.vorschlag?.typId, x.vertrag.id, JSON.stringify(r.typen.map((t) => [t.typId, t.sicherheit])));
    // Gegenanzeichen sind sichtbar und haben gesenkt.
    const g = r.gruende![x.kontoauszug.id];
    assert.ok(
      g.some((y) => y.art === 'gesenkt' && y.gegen >= 2),
      JSON.stringify(g),
    );
    assert.ok(g.some((y) => y.art === 'merkmal-fehlt' && y.pflicht));
    const ae = g.find((y) => y.art === 'aehnlich') as { anzahl: number; sehr: number; beste: number };
    assert.deepEqual([ae.anzahl, ae.sehr], [10, 0], 'die Nähe steht dabei, nicht nur die Anzahl');
    // Typgrößen gehen an das Paket (#1682) – nur Zahlen.
    const typen = eingaenge[0].typen as Kandidat[];
    assert.equal(typen.find((t) => t.id === x.kontoauszug.id)?.anzahl, 200);
    assert.equal(typen.find((t) => t.id === x.vertrag.id)?.anzahl, 3);
    assert.equal(typen.find((t) => t.id === x.rechnung.id)?.anzahl, 0);
  });

  it('leere Ablage: der Versicherungsschein ist „Vertrag – wahrscheinlich“ (Überschrift über gleichbedeutende Wörter)', async () => {
    const x = await aufbau();
    await x.d.suche.legeSynonymAn({ woerter: ['Vertrag', 'Versicherungsschein', 'Police'] }, x.lena.id);
    const { dok } = await x.brief(SCHEIN);
    const r = await x.d.erkennung.klassifizierung.klassifiziere({ dokumente: [dok] }, x.A);
    assert.equal(r.vorschlag?.typId, x.vertrag.id);
    const s = r.vorschlag!.sicherheit;
    assert.ok(s >= SCHWELLE_STANDARD && s < SICHER_AB, `wahrscheinlich, nicht sicher: ${s}`);
    assert.deepEqual(new Set(r.vorschlag!.belege.map((b) => b.weg)), new Set(['kern', 'erkennbar']));
    assert.equal(r.vorschlag!.belege.find((b) => b.weg === 'kern')?.wort, 'Versicherungsschein');
    assert.ok(r.gruende![x.vertrag.id].some((y) => y.art === 'ohne-beispiele'));
    assert.equal(r.wege.find((w) => w.weg === 'erkennbar')?.stand, 'ok');
  });

  it('„Woran man ihn erkennt“ geht ganz an das Paket, nicht nur 200 Zeichen (#1652)', async () => {
    const x = await aufbau();
    const lang = `${'Kontostand, Buchungen und Saldo stehen oben. '.repeat(6)}ENDE`.slice(0, 290);
    const zins = await x.d.mappentypen.legeTypAn({
      name: 'Zinsbescheinigung',
      erkennbarAn: lang,
      felder: [{ key: 'jahr', label: 'Jahr', typ: 'text' }],
      register: [{ ...FELDER, felder: ['jahr'] }, DOKS],
    });
    const eingaenge = zaehlendesPaket(x);
    await x.d.kern.repo.speicherePaket(paket());
    const { dok } = await x.brief(SCHEIN);
    // Zugriff neu – er kennt die Typen beim Erzeugen.
    const A = await x.d.rechtepruefung.zugriff({ id: x.lena.id, rolle: 'admin' });
    await x.d.erkennung.klassifizierung.klassifiziere({ dokumente: [dok] }, A);
    const k = (eingaenge[0].typen as Kandidat[]).find((t) => t.id === zins.id)!;
    assert.equal(k.erkennbarAn.length, lang.trim().length);
    assert.ok(k.beschreibung.length <= 200);
  });
});

describe('Absender als Beleg (#1680)', () => {
  it('Post eines bekannten Absenders lag bisher in „Kontoauszug“ – nur lesbare Mappen, Name nur, wenn lesbar', async () => {
    const x = await aufbau();
    const bank = await x.d.mappen.legeMappeAn({ typId: x.firma.id, werte: { name: 'Musterbank Beispielstadt' } }, x.lena.id);
    const giro = await x.d.mappen.legeMappeAn({ typId: x.konto.id, werte: { iban: 'DE02 1203 0000 0000 2020 51' } }, x.lena.id);
    const repo = x.d.kern.repo;
    const frueher = async (typId: string, werte: Record<string, unknown>) => {
      const m = await x.d.mappen.legeMappeAn({ typId, werte }, x.lena.id);
      const p = await x.d.post.legePostAn({ betreff: 'Früher' }, { id: x.lena.id, name: 'Lena Muster' });
      await repo.aendereMappe(p.id, { ...p.werte, bezug: [m.id] }, [], null);
      await repo.erkennungSchreibe(p.id, { eindeutig: bank.id }, bank.id);
    };
    for (let i = 0; i < 4; i++) await frueher(x.kontoauszug.id, { konto: giro.id, nr: `${i}` });
    await frueher(x.rechnung.id, { nr: 'R-1' });
    const { post, dok } = await x.brief('Ihre Mitteilung\nMusterbank Beispielstadt\nSehr geehrte Frau Muster');
    await repo.erkennungSchreibe(post.id, { eindeutig: bank.id }, bank.id);
    const r = await x.d.erkennung.klassifizierung.klassifiziere({ dokumente: [dok] }, x.A);
    const ka = r.typen.find((t) => t.typId === x.kontoauszug.id)!;
    const b = ka.belege.find((y) => y.weg === 'absender')!;
    assert.equal(b.anzahl, 4);
    assert.equal(b.mappeId, bank.id);
    assert.equal(r.bezuege[bank.id]?.titel, 'Musterbank Beispielstadt');
    const re = r.typen.find((t) => t.typId === x.rechnung.id)!.belege.find((y) => y.weg === 'absender')!;
    assert.ok(re.sicherheit < b.sicherheit && re.anzahl === 1, 'Gewicht verteilt');
    assert.equal(r.typen[0].typId, x.kontoauszug.id);
    assert.equal(r.wege.find((w) => w.weg === 'absender')?.stand, 'ok');
  });
});

describe('Textwege zählen zusammen wie einer (Prüfstand 26.11.)', () => {
  const s = (belege: Array<{ weg: Weg; sicherheit: number }>) => verbindeWege(belege.map((b) => ({ typId: 't', ...b })))[0].sicherheit;

  it('Überschrift im Kern und „Woran man ihn erkennt“ machen zusammen nicht „sicher“, auch nicht mit schwachem Abgleich', () => {
    assert.ok(
      s([
        { weg: 'kern', sicherheit: 0.6 },
        { weg: 'erkennbar', sicherheit: 0.48 },
      ]) < SICHER_AB,
    );
    assert.ok(
      s([
        { weg: 'kern', sicherheit: 0.6 },
        { weg: 'erkennbar', sicherheit: 0.4 },
        { weg: 'auswahl', sicherheit: 0.5 },
        { weg: 'abgleich', sicherheit: 0.15 },
      ]) < SICHER_AB,
    );
    // Mehr als der stärkste allein, damit die Reihenfolge der Typen weiter etwas davon hat.
    assert.ok(
      s([
        { weg: 'kern', sicherheit: 0.6 },
        { weg: 'erkennbar', sicherheit: 0.48 },
      ]) > 0.6,
    );
  });

  it('ein unabhängiger Weg (Absender, Ähnlichkeit, Gelerntes) zählt weiter voll', () => {
    assert.ok(
      s([
        { weg: 'kern', sicherheit: 0.6 },
        { weg: 'absender', sicherheit: 0.5 },
      ]) >= SICHER_AB,
    );
    assert.equal(
      s([
        { weg: 'kern', sicherheit: 0.6 },
        { weg: 'gelernt', sicherheit: 0.5 },
      ]),
      0.8,
    );
  });
});
