/**
 * Einrichtung je Bereich, Nachweise je Monat und Vergleich zweier Stände als Daten für Pakete (#1053). Je Bereich ein
 * Test; dazu, dass keine Zugangsdaten mitkommen (Ergänzung Sicherheit) und das Journal je Monat zählt statt wächst.
 */
import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';
import { eigeneDatenbank, type EigeneDatenbank } from './hilfe-db';
import { einrichtung, nurRechner, type EinrichtungQuellen } from '../src/paketdaten';
import { nachweise, monatsGrenzen, type NachweisQuellen } from '../src/paketdaten';
import { liesEintraege, vergleiche } from '../src/paketdaten';
import {
  fehlanmeldung,
  JE_MONAT,
  merkeVersion,
  Nachweisjournal,
  nachweis,
  pgJournal,
  setzeNachweisjournal,
  speicherJournal,
  type JournalSpeicher,
} from '../src/protokoll/nachweisjournal';
import { speicherEinstellungen } from '../src/einstellungen/einstellungen';
import { verbinde } from '../src/datenbank/db';
import { findeGeheimnisse } from '../src/geheimnisse/geheimnis-sperre';
import { PAKETDATEN_BEREICHE, darfPaketdaten, type EinrichtungEintrag } from '../../shared/src/paketdaten';
import type { Mappentyp } from '../../shared/src/model';

const GEHEIM = ['Postfach-Passwort-9f8e7d', 'lena.postfach', 'tok3n-im-query-55aa', 'S3cret-Benutzer-in-url'];

const typ = (x: Partial<Mappentyp> & { id: string; name: string }): Mappentyp =>
  ({
    beschreibung: '',
    titelVorlage: '',
    felder: [],
    register: [],
    erstellt: '',
    geaendert: '',
    ...x,
  }) as Mappentyp;

const RECHNUNG = typ({
  id: 't1',
  name: 'Rechnung',
  schluessel: 'rechnung',
  felder: [
    { key: 'betrag', label: 'Betrag', typ: 'betrag', pflicht: true },
    { key: 'datum', label: 'Rechnungsdatum', typ: 'datum' },
  ],
  register: [{ key: 'dok', name: 'Belege', art: 'dokumente', versionierung: true }],
  archiv: { jahre: 10, stichtag: 'datum' },
  berechtigungen: {
    grund: { C: true, R: true, U: true, D: false, P: false },
    regeln: [{ id: 'r1', name: 'Buchhaltung', wenn: [], dann: { D: 'erteilen' }, stopp: false }],
  },
});

const quellen = (mehr: Partial<EinrichtungQuellen> = {}): EinrichtungQuellen => ({
  version: '0.285.0',
  beruflich: async () => true,
  organisationen: async () => [
    {
      id: 'o1',
      angaben: { name: 'Tischlerei Brandt', ort: 'Musterstadt' },
      verantwortlicher: null,
      datenschutzbeauftragter: 'Petra Beispiel',
    },
  ],
  postfaecher: async () => [
    {
      id: 'p1',
      name: 'Rechnungen',
      aktiv: true,
      server: `imaps://lena.postfach:${GEHEIM[0]}@mail.example.org:993/?token=${GEHEIM[2]}`,
      anmeldung: true,
    },
  ],
  eingangsordner: async () => ({ aktiv: true, nachher: 'loeschen', doppelteUeberspringen: true }),
  texterkennung: async () => ({ aktiv: true }),
  typen: async () => [RECHNUNG],
  kiTypen: async () => new Set(['t1']),
  zweifaktor: async () => ({ admin: true, mitglied: false }),
  passkeys: async () => ({ moeglich: true, pflicht: { admin: false, mitglied: false } }),
  anmeldeschutz: async () => ({ konto: { versuche: 5, minuten: 1 }, ip: { versuche: 30, minuten: 60 }, ausnahmen: 2, mail: true }),
  webdav: async () => ({ aktiv: true, nurLesend: false }),
  apiSchluessel: async () => 3,
  rollen: async () => [{ id: 'r-buch', name: 'Buchhaltung' }],
  verwaltung: async () => [['*'], ['sicherung', 'pakete'], undefined],
  pakete: async () => [
    { id: 'texterkennung', name: 'Texterkennung', version: '1.2.0', rechte: ['Dokumente lesen'], schnittstellen: ['dms:texterkennung'] },
  ],
  automatisierungen: async () => [{ id: 'a1', name: 'Rechnung prüfen', aktiv: true, herkunft: 'eigen', paket: null }],
  assistent: async () => ({ verfuegbar: false, paket: null }),
  wartung: async () => ({ stufe: 'aus' }),
  sicherung: async () => ({
    plan: {
      aktiv: true,
      uhrzeit: '02:00',
      haeufigkeit: 'taeglich',
      wochentag: 7,
      aufbewahrung: { taeglich: 7, woechentlich: 4, monatlich: 12 },
      nurNeueste: false,
    },
    probe: { aktiv: true, wochentag: 7, uhrzeit: '04:00' },
    verschluesselt: true,
    ziele: [
      {
        paket: 'webdav_ziel',
        name: 'Sicherungsziel WebDAV',
        ziel: `https://${GEHEIM[3]}:${GEHEIM[0]}@nas.example.org/ablago?key=${GEHEIM[2]}`,
      },
    ],
  }),
  datenschutz: async () => ({
    typen: { t1: { person: false, zweck: 'Buchhaltung' } },
    papierkorbTage: 30,
    historieTage: 365,
    loeschprotokollJahre: 10,
    auskunftTage: 7,
  }),
  ...mehr,
});

const wert = (l: EinrichtungEintrag[], pfad: string) => l.find((x) => x.pfad === pfad)?.wert;

describe('Einrichtung je Bereich (#1053)', () => {
  it('Allgemeines: Version, beruflich, eigene Organisation', async () => {
    const s = await einrichtung('allgemein', quellen());
    assert.equal(s.format, 1);
    assert.equal(wert(s.eintraege, 'allgemein.version'), '0.285.0');
    assert.equal(wert(s.eintraege, 'allgemein.beruflich'), true);
    assert.equal(wert(s.eintraege, 'allgemein.organisation:o1/name'), 'Tischlerei Brandt');
    assert.equal(wert(s.eintraege, 'allgemein.datenschutzbeauftragter:o1'), 'Petra Beispiel');
  });

  it('Belegeingang: Postfach nur mit Rechner und „Anmeldung eingerichtet“, Pakete für Texterkennung', async () => {
    const s = await einrichtung('belegeingang', quellen());
    assert.equal(wert(s.eintraege, 'belegeingang.postfach_server:p1'), 'mail.example.org');
    assert.equal(wert(s.eintraege, 'belegeingang.postfach_anmeldung:p1'), true);
    assert.deepEqual(wert(s.eintraege, 'belegeingang.texterkennung_paket'), ['Texterkennung 1.2.0']);
    assert.equal(wert(s.eintraege, 'belegeingang.eingangsordner_nachher'), 'loeschen');
  });

  it('Ablage: Mappentypen mit Feldern, Pflicht, Versionen, Archivmodus, Frist, Stichtag, KI', async () => {
    const s = await einrichtung('ablage', quellen());
    assert.equal(wert(s.eintraege, 'ablage.typ:rechnung'), 'Rechnung');
    assert.equal(wert(s.eintraege, 'ablage.feldtyp:rechnung/betrag'), 'betrag');
    assert.equal(wert(s.eintraege, 'ablage.pflicht:rechnung/betrag'), true);
    assert.equal(wert(s.eintraege, 'ablage.versionierung:rechnung/dok'), true);
    assert.equal(wert(s.eintraege, 'ablage.frist:rechnung'), 10);
    assert.equal(wert(s.eintraege, 'ablage.stichtag:rechnung'), 'Rechnungsdatum');
    assert.equal(wert(s.eintraege, 'ablage.ki:rechnung'), true);
    assert.match(s.eintraege.find((x) => x.pfad === 'ablage.pflicht:rechnung/betrag')!.bezeichnung, /Rechnung.*Betrag/);
  });

  it('Zugang: Zwei-Faktor, Passkeys, Anmeldeschutz ohne Ausnahmen, Rollen mit Regeln, Verwaltung nur gezählt', async () => {
    const s = await einrichtung('zugang', quellen());
    assert.equal(wert(s.eintraege, 'zugang.zweifaktor:admin'), true);
    assert.equal(wert(s.eintraege, 'zugang.anmeldeschutz_ausnahmen'), 2);
    assert.equal(wert(s.eintraege, 'zugang.schnittstelle'), 3);
    assert.equal(wert(s.eintraege, 'zugang.grundrechte:rechnung'), 'CRU');
    assert.equal(wert(s.eintraege, 'zugang.regel:rechnung/r1'), 'D+');
    assert.equal(wert(s.eintraege, 'zugang.verwaltung:*'), 1);
    assert.equal(wert(s.eintraege, 'zugang.verwaltung:sicherung'), 1);
    assert.ok(!JSON.stringify(s).includes('@'), 'keine Adressen von Personen');
  });

  it('Betrieb: Pakete mit Version und Rechten, Automatisierungen, Assistent, Wartung', async () => {
    const s = await einrichtung('betrieb', quellen());
    assert.equal(wert(s.eintraege, 'betrieb.paket:texterkennung'), '1.2.0');
    assert.deepEqual(wert(s.eintraege, 'betrieb.paket_rechte:texterkennung'), ['Dokumente lesen']);
    assert.equal(wert(s.eintraege, 'betrieb.automatisierung:a1'), true);
    assert.equal(wert(s.eintraege, 'betrieb.wartung'), 'aus');
  });

  it('Sicherung: Zeitplan, Aufbewahrung, Verschlüsselung, Ziel nur mit Rechner', async () => {
    const s = await einrichtung('sicherung', quellen());
    assert.equal(wert(s.eintraege, 'sicherung.aufbewahrung:monatlich'), 12);
    assert.equal(wert(s.eintraege, 'sicherung.verschluesselung'), true);
    assert.equal(wert(s.eintraege, 'sicherung.ziel:webdav_ziel'), 'nas.example.org');
    assert.equal((await einrichtung('sicherung', quellen({ sicherung: async () => null }))).eintraege.length, 1);
  });

  it('Unveränderbarkeit, Datenschutz und Betriebsprüfung', async () => {
    const u = await einrichtung('unveraenderbarkeit', quellen());
    assert.equal(wert(u.eintraege, 'unveraenderbarkeit.zeitplan'), null);
    assert.deepEqual(wert(u.eintraege, 'unveraenderbarkeit.archivmodus'), ['Rechnung']);
    const d = await einrichtung('datenschutz', quellen());
    assert.equal(wert(d.eintraege, 'datenschutz.papierkorb'), 30);
    assert.equal(wert(d.eintraege, 'datenschutz.zweck:rechnung'), 'Buchhaltung');
    const b = await einrichtung('betriebspruefung', quellen());
    assert.equal(wert(b.eintraege, 'betriebspruefung.prueferzugang'), false);
  });

  it('kein Bereich enthält die Testgeheimnisse; zwei Abrufe ohne Änderung sind gleich', async () => {
    for (const b of PAKETDATEN_BEREICHE) {
      const s = await einrichtung(b, quellen());
      assert.deepEqual(findeGeheimnisse(JSON.stringify(s), GEHEIM), [], b);
      assert.deepEqual(s, await einrichtung(b, quellen()), b);
      for (const x of s.eintraege) assert.match(x.kennung, /^[a-z]+\.[a-z_]+$/, x.kennung);
    }
  });

  it('nurRechner: ohne Benutzer, Passwort, Pfad und Query', () => {
    assert.equal(nurRechner('https://a:b@nas.example.org:8443/x?y=1'), 'nas.example.org');
    assert.equal(nurRechner('mail.example.org'), 'mail.example.org');
    assert.equal(nurRechner(''), null);
  });
});

describe('Vergleich zweier Stände (#1053)', () => {
  it('liefert neu, geändert und entfernt mit lesbarem Satz, sonst nichts', async () => {
    const vorher = (await einrichtung('ablage', quellen())).eintraege;
    const anders = typ({
      ...RECHNUNG,
      felder: [
        { ...RECHNUNG.felder[0], pflicht: false },
        { key: 'iban', label: 'IBAN', typ: 'text' },
      ],
      archiv: null,
    });
    const nachher = (await einrichtung('ablage', quellen({ typen: async () => [anders] }))).eintraege;
    const v = vergleiche(vorher, nachher);
    const p = (pfad: string) => v.find((x) => x.pfad === pfad);
    assert.equal(p('ablage.pflicht:rechnung/betrag')?.art, 'geaendert');
    assert.match(p('ablage.pflicht:rechnung/betrag')!.satz, /Betrag.*ja → nein/);
    assert.equal(p('ablage.feldtyp:rechnung/iban')?.art, 'neu');
    assert.equal(p('ablage.feldtyp:rechnung/datum')?.art, 'entfernt');
    assert.equal(p('ablage.archivmodus:rechnung')?.kennung, 'ablage.archivmodus');
    assert.deepEqual(vergleiche(vorher, vorher), []);
  });

  it('nimmt einen mitgeschickten Stand nur mit flachen Werten an', () => {
    const l = liesEintraege({
      eintraege: [{ kennung: 'a.b', pfad: 'a.b', wert: { tief: 1 } }, { kennung: 'a.c', pfad: 'a.c', wert: ['x'] }, 'kaputt'],
    });
    assert.deepEqual(
      l.map((x) => x.pfad),
      ['a.c'],
    );
    assert.deepEqual(liesEintraege(null), []);
  });
});

describe('Nachweise je Monat (#1053)', () => {
  const journal = new Nachweisjournal(speicherJournal(), () => new Date('2026-11-10T08:00:00Z'));
  const q = (mehr: Partial<NachweisQuellen> = {}): NachweisQuellen => ({
    journal: (m) => journal.monat(m),
    jetzt: () => new Date('2026-11-15T12:00:00Z'),
    benutzer: async () => [
      { konto: 'lena@example.org', aktiv: true, rollen: ['admin'], zweifaktor: true, passkey: false, verwaltung: ['*'] },
    ],
    sicherungen: async () => [
      {
        name: 's-okt',
        beginn: '2026-10-31T02:00:00Z',
        ende: '2026-10-31T02:10:00Z',
        art: 'automatisch',
        pruefung: { am: '2026-11-01T03:00:00Z', ok: true },
        probe: null,
      },
      {
        name: 's-nov',
        beginn: '2026-11-02T02:00:00Z',
        ende: '2026-11-02T02:09:00Z',
        art: 'automatisch',
        pruefung: null,
        probe: { am: '2026-11-08T04:00:00Z', ok: false },
      },
    ],
    loeschungen: async () => [
      { zeit: '2026-11-03T10:00:00Z', schritt: 'papierkorb', grund: 'frist', typ: 'Rechnung', art: 'mappe' },
      { zeit: '2026-11-04T10:00:00Z', schritt: 'endgueltig', grund: null, typ: 'Rechnung', art: 'mappe' },
    ],
    post: async () => ({ email: 4, scan: 2 }),
    ...mehr,
  });

  it('Zugang: Benutzer zum Stichtag, Rechteänderungen, Fehlanmeldungen gekürzt, unbekannte nur gezählt', async () => {
    setzeNachweisjournal(journal);
    try {
      await nachweis('zugang.rechte', {
        was: 'verwaltung',
        konto: 'jonas@example.org',
        vorher: [],
        nachher: ['sicherung'],
        von: 'lena@example.org',
      });
      await fehlanmeldung('lena@example.org', '203.0.113.77', true);
      await fehlanmeldung('lena@example.org', '192.168.1.20', true);
      await fehlanmeldung('Passwort-statt-Name', '2001:db8:1:2::9', false);
    } finally {
      setzeNachweisjournal(null);
    }
    const s = await nachweise('zugang', '2026-11', q());
    assert.equal(s.stichtag, '2026-11-15T12:00:00.000Z');
    const f = s.eintraege.filter((x) => x.kennung === 'zugang.fehlanmeldung');
    assert.deepEqual(
      f.map((x) => x.daten),
      [
        { konto: 'lena@example.org', netz: '203.0.113.0', heimnetz: false },
        { konto: 'lena@example.org', netz: '192.168.1.0', heimnetz: true },
      ],
    );
    assert.deepEqual(s.eintraege.find((x) => x.kennung === 'zugang.fehlanmeldung_unbekannt')?.daten, { anzahl: 1 });
    assert.ok(!JSON.stringify(s).includes('Passwort-statt-Name'));
    assert.ok(!JSON.stringify(s).includes('203.0.113.77'));
    assert.equal(s.eintraege.filter((x) => x.kennung === 'zugang.benutzer').length, 1);
    assert.equal(s.eintraege.filter((x) => x.kennung === 'zugang.rechte').length, 1);
  });

  it('Sicherung: Läufe, Prüfungen und Proben des Monats', async () => {
    const s = await nachweise('sicherung', '2026-11', q());
    assert.deepEqual(
      s.eintraege.map((x) => `${x.kennung}:${x.daten.name}`),
      ['sicherung.pruefung:s-okt', 'sicherung.lauf:s-nov', 'sicherung.probe:s-nov'],
    );
    assert.equal(s.eintraege.find((x) => x.kennung === 'sicherung.probe')?.daten.ok, false);
  });

  it('Datenschutz, Belegeingang, Betrieb und Unveränderbarkeit', async () => {
    setzeNachweisjournal(journal);
    try {
      await nachweis('datenschutz.auskunft', { mappen: 3, dokumente: 5, von: 'lena@example.org' });
      await nachweis('betrieb.paket', {
        aktion: 'installiert',
        paket: 'compliance',
        version: '1.0.0',
        vorher: null,
        von: 'lena@example.org',
      });
      await nachweis('unveraenderbarkeit.pruefung', { dateien: 120, abweichungen: 0, fehlend: 0, von: 'lena@example.org' });
    } finally {
      setzeNachweisjournal(null);
    }
    const d = await nachweise('datenschutz', '2026-11', q());
    assert.deepEqual(
      d.eintraege
        .filter((x) => x.kennung.startsWith('datenschutz.'))
        .map((x) => x.kennung)
        .sort(),
      ['datenschutz.auskunft', 'datenschutz.endgueltig', 'datenschutz.loeschung_frist'],
    );
    const b = await nachweise('belegeingang', '2026-11', q());
    assert.deepEqual(
      b.eintraege.map((x) => x.daten),
      [
        { weg: 'email', anzahl: 4 },
        { weg: 'scan', anzahl: 2 },
      ],
    );
    assert.equal((await nachweise('betrieb', '2026-11', q())).eintraege[0].kennung, 'betrieb.paket');
    assert.equal((await nachweise('unveraenderbarkeit', '2026-11', q())).eintraege[0].daten.dateien, 120);
    assert.deepEqual((await nachweise('betrieb', '2026-10', q())).eintraege, []);
  });

  it('Monatsgrenzen und Stichtag am Monatsende für vergangene Monate', async () => {
    assert.deepEqual(monatsGrenzen('2026-02'), { von: '2026-02-01T00:00:00.000Z', bis: '2026-02-28T23:59:59.999Z' });
    assert.equal((await nachweise('zugang', '2026-10', q())).stichtag, '2026-10-31T23:59:59.999Z');
  });
});

/** Gemeinsame Prüfungen für den Speicher im Arbeitsspeicher und in PostgreSQL (#1253). */
function journalPruefungen(speicher: () => Promise<JournalSpeicher>) {
  it('zählt über die Grenze je Monat hinaus nur noch und räumt alte Monate', async () => {
    const sp = await speicher();
    await new Nachweisjournal(sp, () => new Date('2024-10-05T00:00:00Z')).schreibe('betrieb.wartung', { stufe: 'aus', von: 'alt' });
    const j = new Nachweisjournal(sp, () => new Date('2026-11-01T00:00:00Z'));
    for (let i = 0; i < JE_MONAT + 3; i++) await j.schreibe('betrieb.wartung', { stufe: 'aus', von: 'x' });
    const m = await j.monat('2026-11');
    assert.equal(m.eintraege.length, JE_MONAT);
    assert.equal(m.weitere, 3);
    assert.deepEqual(m.eintraege[0], { art: 'betrieb.wartung', zeit: '2026-11-01T00:00:00.000Z', daten: { stufe: 'aus', von: 'x' } });
    await new Promise((r) => setTimeout(r, 50));
    assert.deepEqual(await j.monat('2024-10'), { eintraege: [], weitere: 0, zaehler: {} }, 'der Monat vor 25 Monaten ist geräumt');
  });

  it('gleichzeitige Fehlanmeldungen bei vollem Monat: Einträge + weitere + Zähler = Versuche', async () => {
    const sp = await speicher();
    const j = new Nachweisjournal(sp, () => new Date('2026-11-01T00:00:00Z'));
    for (let i = 0; i < JE_MONAT - 5; i++)
      await sp.trageEin('2026-11', { art: 'zugang.fehlanmeldung', zeit: '2026-11-01T00:00:00.000Z', daten: { nr: i } }, JE_MONAT);
    setzeNachweisjournal(j);
    try {
      await Promise.all(
        Array.from({ length: 10 }, (_, i) =>
          Promise.all([
            fehlanmeldung('lena@example.org', `203.0.113.${i}`, true),
            fehlanmeldung(`niemand-${i}@example.org`, `198.51.100.${i}`, false),
          ]),
        ),
      );
    } finally {
      setzeNachweisjournal(null);
    }
    const m = await j.monat('2026-11');
    assert.equal(m.eintraege.length, JE_MONAT);
    assert.equal(m.eintraege.length + m.weitere, JE_MONAT - 5 + 10);
    assert.equal(m.zaehler['zugang.fehlanmeldung_unbekannt'], 10);
  });

  it('je Tag und Merkmalen ein Eintrag mit Anzahl (#1308): Wiederholungen – auch gleichzeitig – zählen nur hoch', async () => {
    const sp = await speicher();
    let jetzt = new Date('2026-11-03T01:00:00Z');
    const j = new Nachweisjournal(sp, () => jetzt);
    await Promise.all(Array.from({ length: 6 }, () => j.vermerkeJeTag('sicherung.fehlgeschlagen', PLATZ)));
    jetzt = new Date('2026-11-03T02:00:00Z');
    await j.vermerkeJeTag('sicherung.fehlgeschlagen', PLATZ);
    await j.vermerkeJeTag('sicherung.fehlgeschlagen', { ...PLATZ, ort: 'ausser_haus', ziel: 'Sicherungsziel WebDAV', grund: 'ziel' });
    jetzt = new Date('2026-11-04T01:00:00Z');
    await j.vermerkeJeTag('sicherung.fehlgeschlagen', PLATZ);
    const m = await j.monat('2026-11');
    assert.deepEqual(
      m.eintraege.map((e) => [e.zeit, e.daten]),
      [
        ['2026-11-03T01:00:00.000Z', { tag: '2026-11-03', ...PLATZ, anzahl: 7, letzte: '2026-11-03T02:00:00.000Z' }],
        [
          '2026-11-03T02:00:00.000Z',
          {
            tag: '2026-11-03',
            ...PLATZ,
            ort: 'ausser_haus',
            ziel: 'Sicherungsziel WebDAV',
            grund: 'ziel',
            anzahl: 1,
            letzte: '2026-11-03T02:00:00.000Z',
          },
        ],
        ['2026-11-04T01:00:00.000Z', { tag: '2026-11-04', ...PLATZ, anzahl: 1, letzte: '2026-11-04T01:00:00.000Z' }],
      ],
    );
    assert.equal(m.weitere, 0);
  });

  it('voller Monat (#1308): keine weiteren Einträge, jeder Fehlschlag zählt als „weitere“', async () => {
    const sp = await speicher();
    for (let i = 0; i < JE_MONAT; i++)
      await sp.trageEin('2026-11', { art: 'betrieb.wartung', zeit: '2026-11-01T00:00:00.000Z', daten: { nr: i } }, JE_MONAT);
    let jetzt = new Date('2026-11-05T01:00:00Z');
    const j = new Nachweisjournal(sp, () => jetzt);
    for (const tag of ['05', '05', '06', '06', '06']) {
      jetzt = new Date(`2026-11-${tag}T01:00:00Z`);
      await j.vermerkeJeTag('sicherung.fehlgeschlagen', PLATZ);
    }
    const m = await j.monat('2026-11');
    assert.equal(m.eintraege.length, JE_MONAT);
    assert.equal(m.weitere, 5, 'ohne Eintrag gibt es nichts hochzuzählen – nichts geht unbemerkt verloren');
  });
}

/** Fehlgeschlagene Sicherung (#1308) – Merkmale ohne Tag; den setzt das Journal. */
const PLATZ = { art: 'automatisch', ort: 'lokal', ziel: null, grund: 'platz' };

describe('Nachweis-Journal (#1053, #1253)', () => {
  journalPruefungen(async () => speicherJournal());

  it('gleichzeitige Einträge gehen nicht verloren', async () => {
    const j = new Nachweisjournal(speicherJournal(), () => new Date('2026-11-01T00:00:00Z'));
    await Promise.all(Array.from({ length: 5 }, (_, i) => j.schreibe('betrieb.wartung', { nr: i })));
    assert.equal((await j.monat('2026-11')).eintraege.length, 5);
  });

  it('Update-Verlauf: einmal je neuer Version, der erste Start zählt nicht', async () => {
    const e = speicherEinstellungen();
    const j = new Nachweisjournal(speicherJournal(), () => new Date('2026-11-01T00:00:00Z'));
    setzeNachweisjournal(j);
    try {
      await merkeVersion(e, '0.284.0');
      await merkeVersion(e, '0.285.0');
      await merkeVersion(e, '0.285.0');
    } finally {
      setzeNachweisjournal(null);
    }
    assert.deepEqual(
      (await j.monat('2026-11')).eintraege.map((x) => x.daten),
      [{ von: '0.284.0', nach: '0.285.0' }],
    );
  });
});

describe(
  'Nachweis-Journal in PostgreSQL (#1253)',
  { skip: process.env.TEST_DATABASE_URL ? false : 'TEST_DATABASE_URL nicht gesetzt' },
  () => {
    let sql: EigeneDatenbank['sql'];
    let haushalt = '';
    let url = '';
    before(async () => {
      const db = await eigeneDatenbank('nachweisjournal');
      sql = db.sql;
      url = db.url;
      haushalt = '00000000-0000-4000-8000-000000001253';
      await sql`INSERT INTO haushalte (id, name) VALUES (${haushalt}, 'Nachweis-Journal')`;
    });
    const leer = async () => {
      await sql`DELETE FROM nachweis_journal WHERE haushalt_id = ${haushalt}`;
      await sql`DELETE FROM nachweis_zaehler WHERE haushalt_id = ${haushalt}`;
      return pgJournal(sql, haushalt);
    };

    journalPruefungen(leer);

    it('übernimmt das alte Format aus den Einstellungen vollständig und genau einmal', async () => {
      await leer();
      const e1 = {
        art: 'zugang.fehlanmeldung',
        zeit: '2026-10-02T08:00:00.000Z',
        daten: { konto: 'lena@example.org', netz: '203.0.113.0', heimnetz: false },
      };
      const e2 = {
        art: 'betrieb.paket',
        zeit: '2026-10-03T09:30:00.123Z',
        daten: { aktion: 'installiert', paket: 'compliance', version: '1.0.0', vorher: null, von: 'lena@example.org' },
      };
      const alt = { eintraege: [e1, e2], weitere: 4, zaehler: { 'zugang.fehlanmeldung_unbekannt': 7 } };
      for (const [k, w] of [
        ['nachweise:2026-10', alt],
        ['nachweise:2026-09', { eintraege: [], weitere: 0, zaehler: { 'zugang.fehlanmeldung_unbekannt': 2 } }],
        ['nachweise_version', '0.288.0'],
      ] as const) {
        await sql`INSERT INTO einstellungen (haushalt_id, schluessel, wert) VALUES (${haushalt}, ${k}, ${sql.json(w as never)})`;
      }
      const [a, b] = [pgJournal(sql, haushalt), pgJournal(sql, haushalt)];
      await Promise.all([a.uebernimm(), b.uebernimm()]);
      assert.deepEqual(await a.monat('2026-10'), alt);
      assert.deepEqual(await b.monat('2026-09'), { eintraege: [], weitere: 0, zaehler: { 'zugang.fehlanmeldung_unbekannt': 2 } });
      const rest = await sql<{ schluessel: string }[]>`SELECT schluessel FROM einstellungen WHERE haushalt_id = ${haushalt}`;
      assert.deepEqual(
        rest.map((r) => r.schluessel),
        ['nachweise_version'],
      );
      await new Nachweisjournal(a, () => new Date('2026-10-20T00:00:00Z')).zaehle('zugang.fehlanmeldung_unbekannt');
      assert.equal((await a.monat('2026-10')).zaehler['zugang.fehlanmeldung_unbekannt'], 8);
    });

    it('zwei Prozesse an einer Datenbank vermerken zugleich (#1308): ein Eintrag, keine Zählung verloren', async () => {
      await leer();
      const zweiter = verbinde(url, 4);
      try {
        const jetzt = () => new Date('2026-11-03T01:00:00Z');
        const [a, b] = [new Nachweisjournal(pgJournal(sql, haushalt), jetzt), new Nachweisjournal(pgJournal(zweiter, haushalt), jetzt)];
        await Promise.all(Array.from({ length: 8 }, (_, i) => (i % 2 ? a : b).vermerkeJeTag('sicherung.fehlgeschlagen', PLATZ)));
        const m = await a.monat('2026-11');
        assert.deepEqual(
          m.eintraege.map((e) => e.daten.anzahl),
          [8],
        );
        assert.equal(m.weitere, 0);
        const [z] = await sql<
          { anzahl: string }[]
        >`SELECT anzahl FROM nachweis_zaehler WHERE haushalt_id = ${haushalt} AND monat = '2026-11'`;
        assert.equal(Number(z.anzahl), 1, 'der Zähler des Monats nur für den neuen Eintrag');
      } finally {
        await zweiter.end({ timeout: 5 });
      }
    });
  },
);

describe('Wer freigeben darf (#1054)', () => {
  it('nur, wer den Bereich verwaltet; Zugang und Nachweise nur mit Gesamter Verwaltung', () => {
    const sicherung = { verwaltung: ['sicherung'] },
      gesamt = { verwaltung: ['*'] };
    assert.ok(darfPaketdaten(sicherung, 'einrichtung', 'sicherung'));
    assert.ok(!darfPaketdaten(sicherung, 'einrichtung', 'ablage'));
    assert.ok(!darfPaketdaten(sicherung, 'nachweise', 'sicherung'));
    assert.ok(!darfPaketdaten({ verwaltung: ['pakete'] }, 'einrichtung', 'betrieb'));
    assert.ok(
      !darfPaketdaten(
        { verwaltung: ['sicherung', 'pakete', 'typen', 'organisation', 'automatisierungen', 'wartung'] },
        'einrichtung',
        'zugang',
      ),
    );
    for (const b of PAKETDATEN_BEREICHE) assert.ok(darfPaketdaten(gesamt, 'einrichtung', b) && darfPaketdaten(gesamt, 'nachweise', b));
    assert.ok(!darfPaketdaten({ verwaltung: ['*'], art: 'dienst' }, 'einrichtung', 'allgemein'));
  });
});
