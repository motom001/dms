/**
 * Fassungen (#1006): Jedes Speichern ergibt eine Fassung mit Zeit, Urheber und lesbaren Änderungen; dieselbe Person
 * innerhalb von 10 Minuten wird zusammengefasst; Pakete, Updates und Automatisierungen erscheinen als Urheber;
 * Vergleichen, Vorschau und Wiederherstellen über das normale Speichern (Konfliktschutz #917); Löschen lässt die letzte
 * Fassung mit Löschvermerk stehen; Abgleich beim Start; in PostgreSQL in derselben Transaktion und der Umzug der
 * Automatisierungen (Migration 103).
 */
import assert from 'node:assert/strict';
import { copyFileSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { beschreibeAenderungen, type TypStand } from '../../shared/src/fassungsvergleich';
import { FASSUNG_ARTEN, FASSUNG_BEREICH, FASSUNG_PFAD, urheberText, zusammenfassen, ZUSAMMENFASSEN_MIN, type Urheber } from '../../shared/src/fassungen';
import { darfBereich } from '../../shared/src/verwaltungsrecht';
import { bereicheDerRoute } from '../src/verwaltungsbereiche';
import type { Mappentyp } from '../../shared/src/model';
import { speicherDateien } from '../src/dateispeicher';
import { Dienst } from '../src/dienst';
import { speicherEinstellungen } from '../src/einstellungen';
import { Konten } from '../src/konten';
import { speicherKontoRepo } from '../src/konto-repo';
import { pgRepo } from '../src/repo-pg';
import { speicherRepo } from '../src/repo-speicher';
import { migriere } from '../src/db';
import { eigeneDatenbank, MIGRATIONEN } from './hilfe-db';

const MARKUS: Urheber = { art: 'person', id: 'markus' };
const PETRA: Urheber = { art: 'person', id: 'petra' };

async function aufbau() {
  const roh = speicherRepo();
  const einstellungen = speicherEinstellungen();
  const d = new Dienst(roh, speicherDateien(), { einstellungen });
  const konten = new Konten(speicherKontoRepo(), null, 'http://nas', d.systemtypen.benutzerspiegel());
  d.verbindeKonten(konten.papierkorbHaken());
  await konten.einrichten({ email: 'markus@example.org', name: 'Markus', passwort: 'ein-langes-passwort' });
  let jetzt = Date.parse('2026-11-12T10:00:00Z');
  d.fassungen.stelleUhr(() => jetzt);
  const spaeter = (min: number) => { jetzt += min * 60_000; };
  const als = <T>(u: Urheber, f: () => Promise<T>) => d.kern.mitFassungsKontext({ urheber: u }, f);
  return { d, roh, einstellungen, spaeter, als };
}

const VERTRAG = {
  name: 'Vertrag', felder: [
    { key: 'name', label: 'Name', typ: 'text', pflicht: true },
    { key: 'betrag', label: 'Betrag', typ: 'betrag', pflicht: true },
    { key: 'ort', label: 'Ort', typ: 'text' },
  ],
  trefferlisten: [{ key: 'standard', name: 'Standard', spalten: ['_titel', 'betrag', 'ort'], standard: true }],
};

describe('Fassungen (#1006): Regeln', () => {
  it('fasst dieselbe Person innerhalb von 10 Minuten zusammen, nie mit Wiederherstellung oder nach Löschvermerk', () => {
    const t0 = '2026-11-12T10:00:00.000Z';
    const nach = (min: number) => new Date(Date.parse(t0) + min * 60_000).toISOString();
    const letzte = { urheber: MARKUS, zeit: t0, vorgang: 'a' };
    assert.equal(zusammenfassen(letzte, { urheber: MARKUS, zeit: nach(ZUSAMMENFASSEN_MIN - 1), vorgang: 'b' }), true);
    assert.equal(zusammenfassen(letzte, { urheber: MARKUS, zeit: nach(ZUSAMMENFASSEN_MIN), vorgang: 'b' }), false, 'ab Beginn gemessen');
    assert.equal(zusammenfassen(letzte, { urheber: PETRA, zeit: nach(1), vorgang: 'b' }), false);
    assert.equal(zusammenfassen(letzte, { urheber: PETRA, zeit: nach(1), vorgang: 'a' }), true, 'derselbe Vorgang');
    assert.equal(zusammenfassen(letzte, { urheber: MARKUS, zeit: nach(1), vorgang: 'b', wiederhergestellt: 2 }), false);
    assert.equal(zusammenfassen({ ...letzte, wiederhergestellt: 2 }, { urheber: MARKUS, zeit: nach(1), vorgang: 'b' }), false);
    assert.equal(zusammenfassen({ ...letzte, geloescht: { zeit: t0, urheber: MARKUS } }, { urheber: MARKUS, zeit: nach(1), vorgang: 'a' }), false);
    assert.equal(zusammenfassen({ urheber: { art: 'paket', id: 'haushalt', version: '1.4.0' }, zeit: t0 }, { urheber: { art: 'paket', id: 'haushalt', version: '1.5.0' }, zeit: nach(1) }), false, 'andere Version');
  });

  it('nennt Urheber lesbar', () => {
    const name = (id: string) => ({ markus: 'Markus' }[id] ?? '?');
    assert.equal(urheberText(MARKUS, name), 'Markus');
    assert.equal(urheberText({ art: 'paket', id: 'haushalt', name: 'Haushalt', version: '1.4.0', person: 'markus' }, name), 'Paket Haushalt 1.4.0 (durch Markus)');
    assert.equal(urheberText({ art: 'update', version: '0.255.0' }, name), 'Update auf Ablago 0.255.0');
    assert.equal(urheberText({ art: 'automatisierung', id: 'a' }, name, () => 'Fristen'), 'Automatisierung „Fristen“');
    assert.equal(urheberText({ art: 'system' }, name), 'Ablago');
  });

  it('beschreibt Änderungen am Mappentyp lesbar statt als JSON-Diff', () => {
    const alt = { ...VERTRAG, beschreibung: '', titelVorlage: '{name}', register: [], schluessel: 'vertrag' } as unknown as TypStand;
    const neu = {
      ...alt, felder: [...alt.felder.map((f) => (f.key === 'betrag' ? { ...f, pflicht: false } : f)), { key: 'frist', label: 'Kündigungsfrist', typ: 'zeitraum' }],
      trefferlisten: [{ key: 'standard', name: 'Standard', spalten: ['_titel', 'betrag'], standard: true }],
      berechtigungen: { grund: { C: true, R: true, U: false, D: false, P: true }, regeln: [] },
    } as unknown as TypStand;
    assert.deepEqual(beschreibeAenderungen('typ', alt, neu), [
      'Feld „Kündigungsfrist“ hinzugefügt',
      '„Betrag“ ist kein Pflichtfeld mehr',
      'Trefferliste „Standard“: Spalte „Ort“ entfernt',
      'Rechte: Grundeinstellung alles erlaubt → CRP',
    ]);
    assert.deepEqual(beschreibeAenderungen('typ', null, neu), ['Angelegt']);
    // „Aus Post anlegen“ wirksam: ohne Angabe gilt „mit Dokumentenregister“ – ausdrücklich dasselbe ist keine Änderung.
    assert.deepEqual(beschreibeAenderungen('typ', alt, { ...alt, ausPost: false }), []);
    assert.deepEqual(beschreibeAenderungen('typ', alt, { ...alt, ausPost: true }), ['Aus Post anlegen: an']);
    assert.deepEqual(beschreibeAenderungen('typ', neu, neu), []);
  });
});

describe('Fassungen (#1006): festhalten', () => {
  it('jedes Speichern eine Fassung mit Urheber; dieselbe Person zusammengefasst; zurück auf den Stand davor = keine Fassung', async () => {
    const { d, spaeter, als } = await aufbau();
    const typ = await als(MARKUS, () => d.mappentypen.legeTypAn(VERTRAG));
    const aendere = async (u: Urheber, f: (t: Mappentyp) => Partial<Mappentyp>) => { const t = (await d.mappentypen.listeTypen()).find((x) => x.id === typ.id)!; return als(u, () => d.mappentypen.aendereTyp(typ.id, { ...t, ...f(t) })); };
    // Petra: Betrag kein Pflichtfeld mehr – eigene Fassung.
    spaeter(1);
    await aendere(PETRA, (t) => ({ felder: t.felder.map((f) => (f.key === 'betrag' ? { ...f, pflicht: false } : f)) }));
    // Petra 3 Minuten später: Feld dazu – dieselbe Fassung.
    spaeter(3);
    await aendere(PETRA, (t) => ({ felder: [...t.felder, { key: 'frist', label: 'Kündigungsfrist', typ: 'zeitraum' } as never] }));
    let l = await d.fassungen.liste('typ', typ.id);
    assert.deepEqual(l.fassungen.map((f) => [f.nr, f.urheber]), [[2, PETRA], [1, MARKUS]]);
    assert.deepEqual(l.fassungen[0].aenderungen, ['Feld „Kündigungsfrist“ hinzugefügt', '„Betrag“ ist kein Pflichtfeld mehr']);
    assert.deepEqual(l.fassungen[1].aenderungen, ['Angelegt']);
    assert.equal(l.fassungen[0].aktuell, true);
    // Nach mehr als 10 Minuten: neue Fassung, auch von Petra.
    spaeter(ZUSAMMENFASSEN_MIN);
    await aendere(PETRA, (t) => ({ name: `${t.name}e` }));
    l = await d.fassungen.liste('typ', typ.id);
    assert.equal(l.fassungen.length, 3);
    assert.deepEqual(l.fassungen[0].aenderungen, ['Name „Vertrag“ → „Vertrage“']);
    // Gleich wieder zurück: Die Fassung hat nichts geändert und verschwindet.
    spaeter(1);
    await aendere(PETRA, () => ({ name: 'Vertrag' }));
    assert.equal((await d.fassungen.liste('typ', typ.id)).fassungen.length, 2);
    // Speichern ohne Änderung: keine Fassung.
    spaeter(30);
    await aendere(MARKUS, () => ({}));
    assert.equal((await d.fassungen.liste('typ', typ.id)).fassungen.length, 2);
    // Rechte-Regeln gehören zum Typ.
    const vorRechten = (await d.mappentypen.listeTypen()).find((x) => x.id === typ.id)!;
    await als(MARKUS, () => d.mappentypen.aendereTyp(typ.id, { ...vorRechten, berechtigungen: { grund: { C: true, R: true, U: true, D: false, P: true }, regeln: [] } }));
    assert.deepEqual((await d.fassungen.liste('typ', typ.id)).fassungen[0].aenderungen, ['Rechte: Grundeinstellung alles erlaubt → CRUP']);
  });

  it('Pakete, Updates und Automatisierungen als Urheber; Schritte eines Vorgangs sind eine Fassung', async () => {
    const { d, als, spaeter } = await aufbau();
    const paket: Urheber = { art: 'paket', id: 'haushalt', name: 'Haushalt', version: '1.4.0' };
    const typ = await als(paket, async () => {
      const t = await d.mappentypen.legeTypAn(VERTRAG);
      await d.mappentypen.aendereTyp(t.id, { ...t, beschreibung: 'Aus dem Paket' });
      return t;
    });
    const l = await d.fassungen.liste('typ', typ.id);
    assert.equal(l.fassungen.length, 1);
    assert.equal(l.fassungen[0].wer, 'Paket Haushalt 1.4.0');
    spaeter(1);
    await d.kern.mitAusloeser({ art: 'automatisierung', id: 'auto-1' }, () => d.sichtenVerwaltung.legeSichtAn({ name: 'Verträge', typen: [typ.id] }));
    const sicht = (await d.kern.repo.listeSichten()).find((s) => s.name === 'Verträge')!;
    assert.deepEqual((await d.fassungen.liste('sicht', sicht.id)).fassungen[0].urheber, { art: 'automatisierung', id: 'auto-1' });
  });

  it('Löschen lässt die letzte Fassung mit Löschvermerk stehen; gelöschte Einträge als Nachweis', async () => {
    const { d, als, spaeter } = await aufbau();
    await als(MARKUS, () => d.nummernkreise.speichereNummernkreis({ neu: true, schluessel: 'rechnung', name: 'Rechnungen', muster: 'R-{jjjj}-{zaehler:4}', start: 1 }, 'markus'));
    spaeter(20);
    await als(PETRA, () => d.nummernkreise.speichereNummernkreis({ schluessel: 'rechnung', name: 'Rechnungen', muster: 'RE-{jjjj}-{zaehler:4}', start: 1 }, 'petra'));
    assert.deepEqual((await d.fassungen.liste('nummernkreis', 'rechnung')).fassungen[0].aenderungen, ['Muster „R-{jjjj}-{zaehler:4}“ → „RE-{jjjj}-{zaehler:4}“']);
    spaeter(1);
    await als(PETRA, () => d.nummernkreise.loescheNummernkreis('rechnung', 'petra'));
    const l = await d.fassungen.liste('nummernkreis', 'rechnung');
    assert.equal(l.fassungen.length, 1, 'nur die letzte bleibt');
    assert.equal(l.fassungen[0].nr, 2);
    assert.equal(l.fassungen[0].geloescht?.urheber.art, 'person');
    assert.equal(l.fassungen[0].aktuell, false);
    const weg = await d.fassungen.geloeschte(['nummernkreis']);
    assert.deepEqual(weg.map((x) => [x.eintrag, x.name, x.nr]), [['rechnung', 'Rechnungen', 2]]);
    // Ein Typ ebenso; der Export hat alles.
    const typ = await als(MARKUS, () => d.mappentypen.legeTypAn({ name: 'Weg', felder: [{ key: 'a', label: 'A', typ: 'text' }] }));
    await als(MARKUS, () => d.mappentypen.loescheTyp(typ.id));
    // Mit dem Typ geht seine Ansicht – beide bleiben als Nachweis.
    assert.deepEqual((await d.fassungen.geloeschte()).map((x) => x.art).sort(), ['nummernkreis', 'sicht', 'typ']);
    assert.ok((await d.fassungen.alle()).some((f) => f.art === 'typ' && f.eintrag === typ.id && f.geloescht));
  });
});

describe('Fassungen (#1006): vergleichen und wiederherstellen', () => {
  it('Vorschau sagt, was es bewirkt; Wiederherstellen ist eine neue Fassung; Konfliktschutz', async () => {
    const { d, als, spaeter } = await aufbau();
    const typ = await als(MARKUS, () => d.mappentypen.legeTypAn(VERTRAG));
    await d.mappen.legeMappeAn({ typId: typ.id, werte: { name: 'Strom', betrag: { betrag: 40, waehrung: 'EUR' }, ort: 'Köln' } }, 'markus');
    spaeter(20);
    const t1 = (await d.mappentypen.listeTypen()).find((x) => x.id === typ.id)!;
    // Petra entfernt Ort und macht ein neues Pflichtfeld.
    await als(PETRA, () => d.mappentypen.aendereTyp(typ.id, { ...t1, felder: [...t1.felder.filter((f) => f.key !== 'ort'), { key: 'nummer', label: 'Nummer', typ: 'text', pflicht: true }],
      trefferlisten: [{ key: 'standard', name: 'Standard', spalten: ['_titel', 'betrag'], standard: true }] }));
    const l = await d.fassungen.liste('typ', typ.id);
    // Vergleichen: zwei Fassungen.
    assert.deepEqual((await d.fassungen.vergleich('typ', typ.id, 1, 2)).aenderungen,
      ['Feld „Nummer“ hinzugefügt', 'Feld „Ort“ entfernt', 'Trefferliste „Standard“: Spalte „Ort“ entfernt']);
    // Vorschau für Fassung 2 → 1 ... und umgekehrt: Wiederherstellen von 1 bringt Ort zurück und nimmt Nummer.
    const v = await d.fassungen.vorschau('typ', typ.id, 1);
    assert.deepEqual(v.aenderungen, ['Feld „Ort“ hinzugefügt', 'Feld „Nummer“ entfernt', 'Trefferliste „Standard“: Spalte „Ort“ hinzugefügt']);
    assert.equal(v.stand, l.stand);
    // Andersherum (von 1 zurück auf 2 wäre dasselbe wie jetzt): schon aktuell.
    await assert.rejects(d.fassungen.stelleWiederHer('typ', typ.id, 2, { stand: l.stand }, { id: 'markus', email: null }), /jetzigen Stand/);
    // Konfliktschutz: Inzwischen hat Jonas gespeichert.
    spaeter(20);
    const t2 = (await d.mappentypen.listeTypen()).find((x) => x.id === typ.id)!;
    await als({ art: 'person', id: 'jonas' }, () => d.mappentypen.aendereTyp(typ.id, { ...t2, beschreibung: 'Jonas war hier' }));
    await assert.rejects(d.fassungen.stelleWiederHer('typ', typ.id, 1, { stand: l.stand }, { id: 'markus', email: null }), (e: { status?: number; details?: { konflikt?: boolean } }) => e.status === 409 && !!e.details?.konflikt);
    const neu = await d.fassungen.liste('typ', typ.id);
    // Die Vorschau warnt: Ein Feld mit Werten fällt weg? Hier kommt Ort zurück – aber „Nummer“ hat keine Werte; Pflichtfeld weg.
    spaeter(20);
    const nach = await als(MARKUS, () => d.fassungen.stelleWiederHer('typ', typ.id, 1, { stand: neu.stand }, { id: 'markus', email: null }));
    assert.equal(nach.fassungen.length, 4);
    assert.equal(nach.fassungen[0].wiederhergestellt, 1);
    assert.equal(nach.fassungen[0].aenderungen[0], 'Fassung 1 wiederhergestellt');
    const jetzt = (await d.mappentypen.listeTypen()).find((x) => x.id === typ.id)!;
    assert.deepEqual(jetzt.felder.map((f) => f.key), ['name', 'betrag', 'ort']);
    assert.equal(jetzt.beschreibung, '');
    // Danach von derselben Person kurz darauf: nicht in die Wiederherstellung geschrieben.
    spaeter(1);
    await als(MARKUS, () => d.mappentypen.aendereTyp(typ.id, { ...jetzt, beschreibung: 'neu' }));
    assert.equal((await d.fassungen.liste('typ', typ.id)).fassungen.length, 5);
  });

  it('Vorschau warnt vor Feldern mit Werten und Mappen, die nicht mehr passen', async () => {
    const { d, als, spaeter } = await aufbau();
    const typ = await als(MARKUS, () => d.mappentypen.legeTypAn({ name: 'Gerät', felder: [{ key: 'name', label: 'Name', typ: 'text', pflicht: true }] }));
    spaeter(20);
    const t1 = (await d.mappentypen.listeTypen()).find((x) => x.id === typ.id)!;
    await als(PETRA, () => d.mappentypen.aendereTyp(typ.id, { ...t1, felder: [...t1.felder.map((f) => ({ ...f, pflicht: false })), { key: 'seriennummer', label: 'Seriennummer', typ: 'text' }] }));
    await d.mappen.legeMappeAn({ typId: typ.id, werte: { seriennummer: 'X-1' } }, 'markus');
    const v = await d.fassungen.vorschau('typ', typ.id, 1);
    assert.deepEqual(v.hinweise, [
      'Feld „Seriennummer“ fällt weg – eine Mappe hat dort einen Wert. Der Wert bleibt in der Mappe gespeichert, ist aber nicht mehr zu sehen.',
      'Eine Mappe passt danach nicht mehr zum Mappentyp (z. B. ein neues Pflichtfeld ist leer). Ihr Ersteller bekommt eine Aufgabe.',
    ]);
  });

  it('Ansichten, Stempel-Vorlagen und Nummernkreise über ihr normales Speichern', async () => {
    const { d, als, spaeter } = await aufbau();
    const typ = await als(MARKUS, () => d.mappentypen.legeTypAn(VERTRAG));
    const s = await als(MARKUS, () => d.sichtenVerwaltung.legeSichtAn({ name: 'Laufend', typen: [typ.id] }));
    spaeter(20);
    await als(PETRA, () => d.sichtenVerwaltung.aendereSicht(s.id, { ...s, name: 'Laufende Verträge', bedingungen: [{ art: 'feld', feld: 'ort', op: 'nichtLeer' }] }));
    const l = await d.fassungen.liste('sicht', s.id);
    assert.deepEqual(l.fassungen[0].aenderungen, ['Name „Laufend“ → „Laufende Verträge“', 'Bedingungen: 0 → 1']);
    await d.fassungen.stelleWiederHer('sicht', s.id, 1, { stand: l.stand }, { id: 'markus', email: null });
    assert.equal((await d.kern.repo.listeSichten()).find((x) => x.id === s.id)!.name, 'Laufend');

    const vorlagen = await als(MARKUS, () => d.stempelvorlagen.speichereStempelVorlage(null, { name: 'Kopie', text: 'Kopie für {empfänger}' }, 'markus'));
    const id = vorlagen.find((v) => v.name === 'Kopie')!.id;
    spaeter(20);
    await als(PETRA, () => d.stempelvorlagen.speichereStempelVorlage(id, { name: 'Kopie', text: 'Kopie', deckkraft: 0.3 }, 'petra'));
    const sl = await d.fassungen.liste('stempel', id);
    assert.deepEqual(sl.fassungen[0].aenderungen, ['Text „Kopie für {empfänger}“ → „Kopie“', 'Aussehen geändert: Deckkraft']);
    await d.fassungen.stelleWiederHer('stempel', id, 1, { stand: sl.stand }, { id: 'markus', email: null });
    assert.equal((await d.stempelvorlagen.stempelVorlagen()).find((v) => v.id === id)!.text, 'Kopie für {empfänger}');
  });
});

describe('Fassungen (#1006): Rechte', () => {
  it('nur mit dem Verwaltungsrecht des Bereichs: jede Route liegt unter der Adresse ihres Eintrags', () => {
    for (const art of FASSUNG_ARTEN) {
      for (const [m, p] of [['GET', ''], ['GET', '/vergleich'], ['GET', '/:nr'], ['POST', '/:nr/wiederherstellen']] as const) {
        assert.deepEqual(bereicheDerRoute(m, `${FASSUNG_PFAD[art]}/fassungen${p}`), [FASSUNG_BEREICH[art]], `${m} ${art}${p}`);
      }
    }
    // Wer nur Ansichten verwaltet, erreicht die Fassungen der Mappentypen nicht.
    const nurSichten = { id: 'x', rolle: 'admin', verwaltung: ['sichten'] };
    assert.equal(darfBereich(nurSichten, FASSUNG_BEREICH.typ), false);
    assert.equal(darfBereich(nurSichten, FASSUNG_BEREICH.sicht), true);
  });
});

describe('Fassungen (#1006): Abgleich beim Start', () => {
  it('Änderungen an der Datenbank vorbei werden „Update auf Ablago …“ – einmal je Version; Verschwundenes bekommt den Löschvermerk', async () => {
    const { d, roh, als } = await aufbau();
    const typ = await als(MARKUS, () => d.mappentypen.legeTypAn(VERTRAG));
    const kreis = await als(MARKUS, () => d.nummernkreise.speichereNummernkreis({ neu: true, schluessel: 'akte', name: 'Akten', muster: 'A-{zaehler}', start: 1 }, 'markus'));
    // Erster Abgleich: Was noch keine Fassung hat (die mitgelieferten Stempel-Vorlagen), bekommt seine erste.
    assert.ok(await d.fassungen.abgleich('0.254.0') > 0);
    assert.equal((await d.fassungen.liste('stempel', (await d.stempelvorlagen.stempelVorlagen())[0].id)).fassungen[0].aenderungen[0], 'Erste Fassung – so war es vor Einführung der Fassungen');
    // Wie eine Migration: direkt im Repo, ohne Hülle.
    await roh.aendereTyp(typ.id, { ...typ, felder: typ.felder.filter((f) => f.key !== 'ort') });
    await roh.loescheNummernkreis(kreis.schluessel);
    assert.equal(await d.fassungen.abgleich('0.255.0'), 2);
    const l = await d.fassungen.liste('typ', typ.id);
    assert.equal(l.fassungen[0].wer, 'Update auf Ablago 0.255.0');
    assert.deepEqual(l.fassungen[0].aenderungen, ['Feld „Ort“ entfernt']);
    assert.equal((await d.fassungen.liste('nummernkreis', 'akte')).fassungen[0].geloescht?.urheber.art, 'update');
    assert.equal(await d.fassungen.abgleich('0.255.0'), 0, 'einmal je Version');
  });
});

describe('Fassungen (#1006): PostgreSQL', { skip: !process.env.TEST_DATABASE_URL && 'TEST_DATABASE_URL nicht gesetzt' }, () => {
  it('in derselben Transaktion wie die Änderung; Umzug der Automatisierungen (Migration 103)', async () => {
    const db = await eigeneDatenbank('fassungen', { migrieren: false });
    const sql = db.sql;
    // Bis vor 103 migrieren (Kopie der früheren Migrationen), eine Automatisierung mit zwei alten Fassungen, dann weiter.
    const frueher = mkdtempSync(join(tmpdir(), 'dms-mig-'));
    for (const f of readdirSync(MIGRATIONEN).filter((x) => x.endsWith('.sql') && x < '103_')) copyFileSync(join(MIGRATIONEN, f), join(frueher, f));
    await migriere(sql, frueher, () => {});
    rmSync(frueher, { recursive: true, force: true });
    const [h] = await sql`SELECT id FROM haushalte LIMIT 1`;
    const haushalt = h.id as string;
    const autoId = '00000000-0000-4000-8000-0000000a1006';
    const person = '00000000-0000-4000-8000-0000000b1006';
    await sql`INSERT INTO automatisierungen (id, haushalt_id, name, daten, herkunft) VALUES (${autoId}, ${haushalt}, 'Fristen', '{}'::jsonb, 'eigen')`;
    await sql`INSERT INTO automatisierung_fassungen (automatisierung_id, version, daten, von, zeit) VALUES
      (${autoId}, 1, '{"name":"Fristen alt"}'::jsonb, NULL, '2026-01-01T00:00:00Z'), (${autoId}, 2, '{"name":"Fristen"}'::jsonb, ${person}, '2026-02-01T00:00:00Z')`;
    await migriere(sql, MIGRATIONEN, () => {});
    const rows = await sql`SELECT nr, name, urheber FROM fassungen WHERE art = 'automatisierung' AND eintrag = ${autoId} ORDER BY nr`;
    assert.deepEqual(rows.map((r) => [r.nr, r.name, r.urheber]), [[1, 'Fristen alt', { art: 'system' }], [2, 'Fristen', { art: 'person', id: person }]]);
    assert.equal((await sql`SELECT to_regclass('automatisierung_fassungen') AS t`)[0].t, null);

    // Eine Änderung, die in ihrer Transaktion scheitert, hinterlässt keine Fassung.
    const d = new Dienst(pgRepo(sql, haushalt), speicherDateien(), { einstellungen: speicherEinstellungen() });
    const typ = await d.mappentypen.legeTypAn(VERTRAG);
    assert.equal((await d.fassungen.liste('typ', typ.id)).fassungen.length, 1);
    await assert.rejects(d.kern.inEinemZug(async () => {
      await d.kern.mitFassungsKontext({ urheber: PETRA }, () => d.kern.repo.aendereTyp(typ.id, { ...typ, name: 'Anders' }));
      throw new Error('abgebrochen');
    }), /abgebrochen/);
    assert.equal((await d.fassungen.liste('typ', typ.id)).fassungen.length, 1);
    await d.kern.mitFassungsKontext({ urheber: PETRA }, () => d.mappentypen.aendereTyp(typ.id, { ...typ, name: 'Anders' }));
    const l = await d.fassungen.liste('typ', typ.id);
    assert.deepEqual(l.fassungen.map((f) => f.nr), [2, 1]);
    assert.deepEqual(l.fassungen[0].aenderungen, ['Name „Vertrag“ → „Anders“']);
    // Speichern ohne Änderung: keine Fassung – auch wenn PostgreSQL die Schlüssel im JSON anders ordnet.
    const unveraendert = (await d.mappentypen.listeTypen()).find((x) => x.id === typ.id)!;
    await d.kern.mitFassungsKontext({ urheber: MARKUS }, () => d.mappentypen.aendereTyp(typ.id, unveraendert));
    assert.equal((await d.fassungen.liste('typ', typ.id)).fassungen.length, 2);
    await d.mappentypen.loescheTyp(typ.id);
    assert.deepEqual((await d.fassungen.geloeschte(['typ'])).map((x) => x.nr), [2]);
    await db.ende();
  });
});
