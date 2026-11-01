/**
 * Erkennung im Kern (#336): Muster (reine Funktionen) und Vorschläge beim Zuordnen von Post – Absender,
 * Angaben, Zielmappe, nur lesbare Mappen. Alle Briefe, Namen, Nummern und Adressen sind erfunden.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { artVon, eindeutigerTreffer, findeAngaben, findeMappen, istAbsenderTyp, istIban, liesFeldErkennung, vorschlaegeAus } from '../../shared/src/erkennung';
import { NICHTS, type Regelwerk } from '../../shared/src/rechte';
import { speicherDateien } from '../src/dateispeicher';
import { bereinigeFeld, Dienst } from '../src/dienst';
import { speicherEinstellungen } from '../src/einstellungen';
import { Konten } from '../src/konten';
import { speicherKontoRepo } from '../src/konto-repo';
import { speicherRepo } from '../src/repo-speicher';
import { routen, type Anfrage } from '../src/routen';

export const BRIEF = `Stadtwerke Musterstadt GmbH · Hauptstraße 1 · 01067 Musterstadt
Anna Beispiel
Lindenweg 4
01234 Beispielort
                                          Musterstadt, 12.03.2026
Kundennummer: 100-4711
Rechnungs-Nr. R-2026-0042
Rechnung für Strom
Verbrauch 1.234 kWh vom 01.01.2026 bis 28.02.2026
Summe netto 70,76 €
MwSt 19 % 13,44 €
Gesamtbetrag 84,20 €
Der Betrag wird am 20.03.2026 von Ihrem Konto DE89 3704 0044 0532 0130 00 abgebucht.
Tel. 0351 123456-0 · service@stadtwerke-musterstadt.de · www.stadtwerke-musterstadt.de
USt-IdNr. DE123456789`;

export const KARTE = `Elektro Muster GmbH
Anna Beispiel
Elektromeisterin
Musterweg 12
01234 Musterstadt
Tel. 0351 7654321
Mobil 0171 1234567
anna.beispiel@elektro-muster.de
www.elektro-muster.de`;

describe('Erkennung: Muster (#336)', () => {
  it('liest aus einem erfundenen Brief Datum, Gesamtbetrag, Nummern, IBAN, USt-Id, Kontakt und Briefkopf', () => {
    const a = findeAngaben(BRIEF);
    assert.equal(a.datum?.wert, '2026-03-12');
    assert.equal(a.datum?.sicherheit, 'hoch');
    assert.deepEqual(a.betrag?.wert, { betrag: 84.2, waehrung: 'EUR' });
    assert.match(a.betrag!.fundstelle, /Gesamtbetrag/);
    assert.deepEqual(a.nummern.map((n) => [n.label, n.wert]), [['Kundennummer', '100-4711'], ['Rechnungsnummer', 'R-2026-0042']]);
    assert.equal(a.ibans[0].wert, 'DE89 3704 0044 0532 0130 00');
    assert.equal(a.ustids[0].wert, 'DE123456789');
    assert.equal(a.emails[0].wert, 'service@stadtwerke-musterstadt.de');
    assert.equal(a.internet[0].wert, 'www.stadtwerke-musterstadt.de');
    assert.equal(a.telefon[0].wert, '0351 123456-0');
    assert.deepEqual({ ...a.briefkopf, fundstelle: undefined }, { name: 'Stadtwerke Musterstadt GmbH', strasse: 'Hauptstraße', hausnummer: '1', plz: '01067', ort: 'Musterstadt', fundstelle: undefined });
  });

  it('nimmt beim Datum das Briefdatum, nicht Zeitraum oder Fälligkeit; ohne Gesamtbetrag den größten Betrag mit Währung', () => {
    assert.equal(findeAngaben('Leistungszeitraum vom 01.02.2026 bis 28.02.2026\nDatum: 03.03.2026').datum?.wert, '2026-03-03');
    assert.equal(findeAngaben('Dresden, den 5. März 2026\nzahlbar bis 19.03.2026').datum?.wert, '2026-03-05');
    assert.equal(findeAngaben('Kein Datum hier, nur 31.02.2026').datum, null);
    assert.equal(findeAngaben('Preisanpassung zum 1. Januar 2027').datum, null, 'ein Stichtag ist kein Briefdatum');
    assert.deepEqual(findeAngaben('Position 1: 12,00 EUR\nPosition 2: 30,50 EUR').betrag?.wert, { betrag: 30.5, waehrung: 'EUR' });
    assert.equal(findeAngaben('Am 12.03.2026 ohne Betrag').betrag, null);
  });

  it('prüft IBANs mit der Prüfziffer und erkennt Visitenkarte und vCard', () => {
    assert.ok(istIban('DE89 3704 0044 0532 0130 00'));
    assert.ok(!istIban('DE88 3704 0044 0532 0130 00'));
    const k = findeAngaben(KARTE);
    assert.deepEqual([k.person?.vorname, k.person?.nachname, k.person?.funktion, k.person?.organisation], ['Anna', 'Beispiel', 'Elektromeisterin', 'Elektro Muster GmbH']);
    assert.equal(k.mobil[0].wert, '0171 1234567');
    assert.equal(k.telefon[0].wert, '0351 7654321');
    assert.equal(k.briefkopf?.ort, 'Musterstadt');
    const v = findeAngaben('BEGIN:VCARD\nVERSION:3.0\nN:Beispiel;Ben;;;\nORG:Beispiel AG\nTITLE:Kundenberater\nTEL;TYPE=CELL:0171 7777777\nEMAIL:ben@beispiel-ag.de\nADR;TYPE=WORK:;;Ringstraße 3;Musterstadt;;01234;Deutschland\nEND:VCARD');
    assert.deepEqual([v.person?.vorname, v.person?.nachname, v.person?.funktion, v.briefkopf?.name, v.briefkopf?.strasse, v.briefkopf?.hausnummer, v.mobil[0]?.wert], ['Ben', 'Beispiel', 'Kundenberater', 'Beispiel AG', 'Ringstraße', '3', '0171 7777777']);
  });

  it('Feld-Eigenschaft: nur bei geeigneten Feldarten; Art aus Bezeichnung, wenn nicht eingestellt', () => {
    assert.equal(liesFeldErkennung(true, 'passwort'), null);
    assert.equal(liesFeldErkennung(true, 'janein'), null);
    assert.deepEqual(liesFeldErkennung({ art: 'iban', hinweis: '  oben rechts ' }, 'text'), { art: 'iban', hinweis: 'oben rechts' });
    assert.deepEqual(liesFeldErkennung({ art: 'iban' }, 'datum'), {}, 'unpassende Art fällt weg');
    assert.equal(bereinigeFeld({ key: 'pw', label: 'PW', typ: 'passwort', erkennung: {} }).erkennung, undefined);
    assert.deepEqual(bereinigeFeld({ key: 'kd', label: 'Kundennummer', typ: 'text', erkennung: { art: 'nummer' } }).erkennung, { art: 'nummer' });
    const art = (key: string, label: string, typ: 'text' | 'datum' = 'text') => artVon({ key, label, typ });
    assert.deepEqual([art('email', 'E-Mail'), art('kundennummer', 'Kundennummer'), art('internet', 'Internetseite'), art('mobil', 'Mobil'), art('plz', 'PLZ'), art('ort', 'Ort'), art('name', 'Name'), art('x', 'Rechnungsdatum', 'datum')],
      ['email', 'nummer', 'internet', 'mobil', 'plz', 'ort', 'name', 'datum']);
  });

  it('findet Mappen an markierten Feldern: stark (Kundennummer, IBAN, Domain), schwach (Name); eindeutig nur mit genau einem starken', () => {
    const org = { id: 't-org', felder: [
      { key: 'name', label: 'Name', typ: 'text' as const, erkennung: {} },
      { key: 'kundennummer', label: 'Kundennummer', typ: 'text' as const, erkennung: {} },
      { key: 'internet', label: 'Internetseite', typ: 'text' as const, erkennung: {} },
      { key: 'notiz', label: 'Notiz', typ: 'text' as const },
    ] };
    const mappen = [
      { id: 'sw', typId: 't-org', werte: { name: 'Stadtwerke Musterstadt', kundennummer: '1004711' } },
      { id: 'bank', typId: 't-org', werte: { name: 'Beispielbank', internet: 'https://www.beispielbank.de' } },
      { id: 'notiz', typId: 't-org', werte: { name: 'Xy', notiz: 'Hauptstraße' } },
    ];
    const t = findeMappen(BRIEF, [org], mappen);
    assert.deepEqual(t.map((x) => x.mappeId), ['sw']);
    assert.ok(t[0].stark);
    assert.deepEqual(t[0].gruende, ['Name Stadtwerke Musterstadt', 'Kundennummer 1004711'], 'Kundennummer trotz anderer Schreibweise (100-4711)');
    assert.equal(eindeutigerTreffer(t)?.mappeId, 'sw');
    assert.equal(findeMappen('Ihre Beispielbank, info@beispielbank.de', [org], mappen)[0].mappeId, 'bank');
    assert.ok(istAbsenderTyp({ felder: org.felder }));
    assert.ok(!istAbsenderTyp({ felder: [{ key: 'nr', label: 'Vertragsnummer', typ: 'text', erkennung: {} }] }));
  });

  it('Vorschläge für die Felder einer Zielmappe: Datum, Betrag und Nummer passend zur Bezeichnung', () => {
    const v = vorschlaegeAus({ felder: [
      { key: 'rechnungsnummer', label: 'Rechnungsnummer', typ: 'text' },
      { key: 'datum', label: 'Rechnungsdatum', typ: 'datum' },
      { key: 'betrag', label: 'Betrag', typ: 'betrag' },
      { key: 'bemerkung', label: 'Bemerkung', typ: 'langtext' },
    ] }, BRIEF);
    assert.deepEqual(Object.fromEntries(Object.entries(v).map(([k, x]) => [k, x.wert])), { rechnungsnummer: 'R-2026-0042', datum: '2026-03-12', betrag: { betrag: 84.2, waehrung: 'EUR' } });
  });
});

async function aufbau() {
  const d = new Dienst(speicherRepo(), speicherDateien(), { einstellungen: speicherEinstellungen() });
  const konten = new Konten(speicherKontoRepo(), null, 'http://nas', d.benutzerspiegel());
  d.verbindeKonten(konten.papierkorbHaken());
  const { benutzer: anna } = await konten.einrichten({ email: 'anna@example.org', name: 'Anna', passwort: 'ein-langes-passwort' });
  const { benutzer: ben } = await konten.legeBenutzerAn({ email: 'ben@example.org', name: 'Ben', rolle: 'mitglied' }, anna.id);
  await d.gleicheBenutzerAb(await konten.listeBenutzer());
  const organisation = await d.legeTypAn({ name: 'Organisation', schluessel: 'organisation', felder: [
    { key: 'name', label: 'Name', typ: 'text', pflicht: true, erkennung: {} },
    { key: 'kundennummer', label: 'Kundennummer', typ: 'text', erkennung: { art: 'nummer' } },
    { key: 'iban', label: 'IBAN', typ: 'text', erkennung: {} },
    { key: 'strasse', label: 'Straße', typ: 'text', erkennung: {} },
    { key: 'hausnummer', label: 'Hausnummer', typ: 'text', erkennung: {} },
    { key: 'plz', label: 'PLZ', typ: 'text', erkennung: {} },
    { key: 'ort', label: 'Ort', typ: 'text', erkennung: {} },
  ], register: [{ key: 'allgemein', name: 'Allgemein', art: 'felder' }, { key: 'dokumente', name: 'Dokumente', art: 'dokumente' }] });
  const vertrag = await d.legeTypAn({ name: 'Vertrag', felder: [
    { key: 'titel', label: 'Titel', typ: 'text', pflicht: true },
    { key: 'partner', label: 'Vertragspartner', typ: 'referenz', zielTyp: organisation.id },
    { key: 'vertragsnummer', label: 'Vertragsnummer', typ: 'text', erkennung: {} },
  ], register: [{ key: 'allgemein', name: 'Allgemein', art: 'felder' }, { key: 'dokumente', name: 'Dokumente', art: 'dokumente' }] });
  const sw = await d.legeMappeAn({ typId: organisation.id, werte: { name: 'Stadtwerke Musterstadt', kundennummer: '100-4711' } }, anna.id);
  const bank = await d.legeMappeAn({ typId: organisation.id, werte: { name: 'Beispielbank', iban: 'DE02 1203 0000 0000 2020 51' } }, anna.id);
  const strom = await d.legeMappeAn({ typId: vertrag.id, werte: { titel: 'Strom Haus', partner: sw.id } }, anna.id);
  const gas = await d.legeMappeAn({ typId: vertrag.id, werte: { titel: 'Gas Haus', vertragsnummer: 'GV-998877' } }, anna.id);
  const tabelle = routen(d, konten, {});
  const rufe = async (b: { id: string }, m: string, p: string, x: Partial<Anfrage> = {}) =>
    tabelle.find((r) => r.methode === m && r.pfad === p)!.handler({ body: {}, params: {}, query: {}, ip: '1', ...x, benutzer: (await konten.listeBenutzer()).find((u) => u.id === b.id)! });
  const A = { id: anna.id, rolle: 'admin' }; const B = { id: ben.id, rolle: 'mitglied' };
  /** Post mit einem Dokument und gegebenem Volltext (wie von einem Paket oder der API). */
  const post = async (text: string, betreff = 'Brief') => {
    const p = await d.legePostAn({ betreff }, { id: anna.id, name: 'Anna' }, await d.zugriff(A));
    const dok = (await d.ladeHoch(p.id, { register: 'dokumente', name: 'brief.pdf', typ: 'application/pdf' }, Buffer.from(`%PDF-1.4 ${betreff}`), anna.id)).dokument;
    await d.schreibeVolltext(dok.id, { text }, { id: anna.id, herkunft: 'Test', paket: false });
    return p;
  };
  return { d, konten, anna, ben, A, B, organisation, vertrag, sw, bank, strom, gas, rufe, post };
}

describe('Erkennung: Vorschläge beim Zuordnen (#336)', () => {
  it('rechnet nach „Volltext fertig“: Absender eindeutig über die Kundennummer, Angaben, Ziele mit Begründung', async () => {
    const { d, A, sw, strom, post } = await aufbau();
    const p = await post(BRIEF);
    const e = await d.erkennung.fuerBenutzer(p.id, await d.zugriff(A));
    assert.equal(e.eindeutig, sw.id);
    assert.equal(e.absender[0].titel, 'Stadtwerke Musterstadt');
    assert.ok(e.absender[0].gruende.includes('Kundennummer 100-4711'));
    assert.equal(e.angaben.datum?.wert, '2026-03-12');
    assert.deepEqual(e.angaben.betrag?.wert, { betrag: 84.2, waehrung: 'EUR' });
    assert.equal(e.neuerAbsender, null, 'Absender ist bekannt');
    assert.equal(e.ziele[0].mappeId, strom.id, 'der Vertrag, der auf den Absender verweist');
    assert.match(e.ziele[0].gruende[0], /Vertragspartner/);
    assert.ok(e.ziele.some((z) => z.mappeId === sw.id && z.gruende.includes('der Absender selbst')));
    assert.equal(e.dokumente, 1);
  });

  it('findet eine Zielmappe direkt über eine markierte Nummer und merkt sich frühere Post des Absenders', async () => {
    const { d, A, anna, gas, strom, sw, post } = await aufbau();
    const p1 = await post(`${BRIEF}\nVertragsnummer GV-998877`, 'Gas');
    const e1 = await d.erkennung.fuerBenutzer(p1.id, await d.zugriff(A));
    assert.equal(e1.ziele[0].mappeId, gas.id);
    assert.match(e1.ziele[0].gruende[0], /gefunden: Vertragsnummer GV-998877/);
    // Diese Post geht an den Strom-Vertrag; die nächste vom selben Absender bekommt das als Grund.
    await d.ordneZu(p1.id, { ziel: strom.id }, anna.id);
    const p2 = await post(BRIEF, 'Zweiter Brief');
    const e2 = await d.erkennung.fuerBenutzer(p2.id, await d.zugriff(A));
    const z = e2.ziele.find((x) => x.mappeId === strom.id)!;
    assert.ok(z.gruende.some((g) => g.startsWith('frühere Post dieses Absenders')));
    assert.equal(e2.eindeutig, sw.id);
  });

  it('unbekannter Absender: Vorschlag „neue Organisation“ mit Werten aus dem Briefkopf', async () => {
    const { d, A, organisation, post } = await aufbau();
    const p = await post(BRIEF.replace('Kundennummer: 100-4711', 'Kundennummer: 555').replace('Stadtwerke Musterstadt GmbH', 'Wasserwerk Beispiel GmbH'));
    const e = await d.erkennung.fuerBenutzer(p.id, await d.zugriff(A));
    assert.equal(e.eindeutig, null);
    assert.deepEqual(e.neuerAbsender && { typId: e.neuerAbsender.typId, werte: e.neuerAbsender.werte }, { typId: organisation.id, werte: { name: 'Wasserwerk Beispiel GmbH', strasse: 'Hauptstraße', hausnummer: '1', plz: '01067', ort: 'Musterstadt' } });
  });

  it('zeigt nur Mappen, die der Benutzer lesen darf; neu rechnen über die API', async () => {
    const { d, A, B, ben, anna, organisation, sw, post, rufe } = await aufbau();
    const p = await post(BRIEF);
    await d.aendereMappe(p.id, { werte: { fuer: ben.id } }, anna.id);
    // Ben darf keine Organisationen lesen.
    const nichts: Regelwerk = { grund: { ...NICHTS }, regeln: [] };
    await d.setzeBerechtigungen(organisation.id, nichts, true);
    const fuerBen = await d.erkennung.fuerBenutzer(p.id, await d.zugriff(B));
    assert.equal(fuerBen.absender.length, 0);
    assert.equal(fuerBen.eindeutig, null);
    assert.ok(!fuerBen.ziele.some((z) => z.mappeId === sw.id));
    assert.ok(!JSON.stringify(fuerBen).includes('Stadtwerke Musterstadt'));
    const r = await rufe(A, 'POST', '/api/mappen/:id/erkennung', { params: { id: p.id } }) as { status: number; body: { eindeutig: string } };
    assert.equal(r.body.eindeutig, sw.id);
    const g = await rufe(A, 'GET', '/api/mappen/:id/erkennung', { params: { id: p.id } }) as { body: { absender: unknown[] } };
    assert.equal(g.body.absender.length, 1);
  });

  it('ohne gespeichertes Ergebnis (z. B. E-Mail ohne Anhang) rechnet das Lesen einmal; Absender aus dem Feld zählt mit', async () => {
    const { d, A, anna, bank } = await aufbau();
    const p = await d.legePostAn({ betreff: 'Kontoauszug', nachricht: 'Ihre IBAN DE02120300000000202051 – Ihre Beispielbank' }, { id: anna.id, name: 'Anna' }, await d.zugriff(A));
    const e = await d.erkennung.fuerBenutzer(p.id, await d.zugriff(A));
    assert.equal(e.eindeutig, bank.id);
    assert.ok(e.absender[0].gruende.includes('IBAN DE02 1203 0000 0000 2020 51'));
  });
});

describe('Erkennung: Ablage in PostgreSQL (#336)', { skip: !process.env.TEST_DATABASE_URL && 'ohne TEST_DATABASE_URL' }, () => {
  it('speichert je Post, ersetzt, findet frühere Post des Absenders und fällt mit der Post weg', async () => {
    const { ausUrl, alsUrl, legeDatenbankAn } = await import('../src/anbindung');
    const { verbinde, migriere } = await import('../src/db');
    const { pgRepo } = await import('../src/repo-pg');
    const a = { ...ausUrl(process.env.TEST_DATABASE_URL)!, datenbank: `dms_g11_erk_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}` };
    await legeDatenbankAn(a);
    const sql = verbinde(alsUrl(a));
    try {
      await migriere(sql, new URL('../migrations', import.meta.url).pathname, () => {});
      const haushalt = '00000000-0000-4000-8000-000000000001';
      await sql`INSERT INTO haushalte (id, name) VALUES (${haushalt}, 'Test') ON CONFLICT DO NOTHING`;
      const repo = pgRepo(sql, haushalt);
      const typ = await repo.legeTypAn('00000000-0000-4000-8000-0000000000aa', { name: 'T', beschreibung: '', titelVorlage: '', felder: [], register: [{ key: 'd', name: 'D', art: 'dokumente' }] });
      const p1 = await repo.legeMappeAn('00000000-0000-4000-8000-0000000000b1', typ.id, {}, [], null);
      const p2 = await repo.legeMappeAn('00000000-0000-4000-8000-0000000000b2', typ.id, {}, [], null);
      const abs = '00000000-0000-4000-8000-0000000000c1';
      await repo.erkennungSchreibe(p1.id, { x: 1 }, abs);
      await repo.erkennungSchreibe(p2.id, { x: 2 }, null);
      await repo.erkennungSchreibe(p2.id, { x: 3 }, abs);
      await repo.erkennungSchreibe('00000000-0000-4000-8000-0000000000ff', { x: 9 }, abs);
      assert.deepEqual((await repo.erkennungLies(p2.id))?.ergebnis, { x: 3 });
      assert.deepEqual((await repo.erkennungenMitAbsender(abs, 10)).sort(), [p1.id, p2.id].sort());
      await repo.loescheMappe(p1.id);
      assert.equal(await repo.erkennungLies(p1.id), undefined);
      assert.deepEqual(await repo.erkennungenMitAbsender(abs, 10), [p2.id]);
    } finally { await sql.end(); }
  });
});

describe('Aus Dokument ausfüllen (#391, Stufe 1)', () => {
  async function mitPerson() {
    const x = await aufbau();
    const person = await x.d.legeTypAn({ name: 'Person', ausDokument: { beschriftung: 'Visitenkarte scannen' }, felder: [
      { key: 'vorname', label: 'Vorname', typ: 'text', erkennung: {} },
      { key: 'nachname', label: 'Nachname', typ: 'text', pflicht: true, erkennung: {} },
      { key: 'funktion', label: 'Funktion', typ: 'text', erkennung: {} },
      { key: 'organisation', label: 'Organisation', typ: 'referenz', zielTyp: x.organisation.id, erkennung: {} },
      { key: 'telefon', label: 'Telefon', typ: 'text', erkennung: {} },
      { key: 'mobil', label: 'Mobil', typ: 'text', erkennung: {} },
      { key: 'email', label: 'E-Mail', typ: 'text', muster: '[^@\\s]+@[^@\\s]+\\.[^@\\s]+', erkennung: {} },
      { key: 'plz', label: 'PLZ', typ: 'text', erkennung: {} },
      { key: 'ort', label: 'Ort', typ: 'text', erkennung: {} },
      { key: 'geheim', label: 'Kennwort', typ: 'passwort' },
      { key: 'notiz', label: 'Notiz', typ: 'langtext' },
    ], register: [{ key: 'allgemein', name: 'Allgemein', art: 'felder' }, { key: 'dokumente', name: 'Dokumente', art: 'dokumente' }] });
    return { ...x, person };
  }

  it('Visitenkarte → Person: Felder, Organisation neu anlegen; Passwort und unmarkierte Felder nie', async () => {
    const { d, A, person, organisation } = await mitPerson();
    const r = await d.erkennung.fuerTyp(person.id, { text: KARTE }, await d.zugriff(A));
    const werte = Object.fromEntries(Object.entries(r.vorschlaege).map(([k, v]) => [k, v.wert]));
    assert.deepEqual(werte, { vorname: 'Anna', nachname: 'Beispiel', funktion: 'Elektromeisterin', telefon: '0351 7654321', mobil: '0171 1234567', email: 'anna.beispiel@elektro-muster.de', plz: '01234', ort: 'Musterstadt' });
    assert.equal(r.vorschlaege.email.sicherheit, 'hoch');
    assert.deepEqual(r.neu.organisation, { typId: organisation.id, werte: { name: 'Elektro Muster GmbH', strasse: 'Musterweg', hausnummer: '12', plz: '01234', ort: 'Musterstadt' }, fundstelle: 'Elektro Muster GmbH · Musterweg 12 · 01234 Musterstadt' });
    assert.ok(r.zeichen > 50);
    // Gibt es die Organisation schon (hier am Namen), ist sie vorgeschlagen.
    const elektro = await d.legeMappeAn({ typId: organisation.id, werte: { name: 'Elektro Muster GmbH' } }, null);
    const r2 = await d.erkennung.fuerTyp(person.id, { text: KARTE }, await d.zugriff(A));
    assert.equal(r2.vorschlaege.organisation.wert, elektro.id);
    assert.equal(r2.bezuege[elektro.id].titel, 'Elektro Muster GmbH');
    assert.deepEqual(r2.neu, {});
  });

  it('Schema aus dem Mappentyp; die Prüfung verwirft falsche Werte, unbekannte Felder und Passwörter', async () => {
    const { d, A, person } = await mitPerson();
    const schema = await d.erkennung.schema(person.id, await d.zugriff(A)) as { properties: Record<string, { 'x-dms-erkennung'?: string; properties: { wert: unknown } }> };
    assert.ok(!('geheim' in schema.properties), 'kein Passwortfeld');
    assert.equal(schema.properties.email['x-dms-erkennung'], 'email');
    assert.deepEqual(schema.properties.organisation.properties.wert, { type: 'string', format: 'uuid' });
    const { pruefeVorschlaege } = await import('../../shared/src/erkennung');
    const p = pruefeVorschlaege(person, { email: { wert: 'kein-mail' }, plz: '01234', geheim: { wert: 'x' }, unbekannt: { wert: 1 }, organisation: { wert: 'keine-id' }, vorname: { wert: 'Anna', sicherheit: 'hoch', fundstelle: 'Karte' } });
    assert.deepEqual(Object.keys(p.vorschlaege).sort(), ['plz', 'vorname']);
    assert.deepEqual(p.vorschlaege.vorname, { wert: 'Anna', sicherheit: 'hoch', fundstelle: 'Karte' });
    assert.equal(p.verworfen.length, 4);
  });

  it('Rechte: neue Mappe braucht Anlegen, bestehende Bearbeiten; Dokumente nur lesbare; Systemtypen nie', async () => {
    const { d, A, B, person, anna } = await mitPerson();
    await d.setzeBerechtigungen(person.id, { grund: { ...NICHTS, R: true }, regeln: [] }, true);
    await assert.rejects(d.erkennung.fuerTyp(person.id, { text: KARTE }, await d.zugriff(B)), (e: Error & { status?: number }) => e.status === 403);
    const m = await d.legeMappeAn({ typId: person.id, werte: { nachname: 'Muster' } }, anna.id);
    await assert.rejects(d.erkennung.fuerTyp(person.id, { text: KARTE, mappe: m.id }, await d.zugriff(B)), (e: Error & { status?: number }) => e.status === 403);
    const r = await d.erkennung.fuerTyp(person.id, { text: KARTE, mappe: m.id }, await d.zugriff(A));
    assert.equal(r.vorschlaege.nachname.wert, 'Beispiel', 'Vorschlag auch für gefüllte Felder – die Oberfläche zeigt ihn als Alternative');
    const post = (await d.listeTypen()).find((t) => t.system === 'post')!;
    await assert.rejects(d.erkennung.fuerTyp(post.id, { text: KARTE }, await d.zugriff(A)), (e: Error & { status?: number }) => e.status === 422);
  });

  it('Dokumente der Mappe und Dateien über die API: vCard direkt, unbekannte Dateiarten 415; Beschriftung am Mappentyp', async () => {
    const { d, A, person, anna, rufe } = await mitPerson();
    const m = await d.legeMappeAn({ typId: person.id, werte: { nachname: 'Muster' } }, anna.id);
    const dok = (await d.ladeHoch(m.id, { register: 'dokumente', name: 'karte.pdf', typ: 'application/pdf' }, Buffer.from('%PDF-1.4 karte'), anna.id)).dokument;
    await assert.rejects(d.erkennung.fuerTyp(person.id, { dokumente: [dok.id], mappe: m.id }, await d.zugriff(A)), (e: Error & { status?: number }) => e.status === 409);
    await d.schreibeVolltext(dok.id, { text: KARTE }, { id: anna.id, herkunft: 'Test', paket: false });
    assert.equal((await d.erkennung.fuerTyp(person.id, { dokumente: [dok.id], mappe: m.id }, await d.zugriff(A))).vorschlaege.mobil.wert, '0171 1234567');
    const vcf = Buffer.from('BEGIN:VCARD\nVERSION:3.0\nN:Beispiel;Ben;;;\nTITLE:Kundenberater\nEMAIL:ben@beispiel-ag.de\nEND:VCARD\n');
    const r = await rufe(A, 'POST', '/api/typen/:id/vorschlaege/datei', { params: { id: person.id }, query: { name: 'ben.vcf', typ: 'text/vcard' }, body: vcf }) as { body: { vorschlaege: Record<string, { wert: unknown }>; text: string } };
    assert.deepEqual([r.body.vorschlaege.vorname.wert, r.body.vorschlaege.nachname.wert, r.body.vorschlaege.funktion.wert, r.body.vorschlaege.email.wert], ['Ben', 'Beispiel', 'Kundenberater', 'ben@beispiel-ag.de']);
    assert.match(r.body.text, /BEGIN:VCARD/);
    await assert.rejects(rufe(A, 'POST', '/api/typen/:id/vorschlaege/datei', { params: { id: person.id }, query: { name: 'x.zip', typ: 'application/zip' }, body: Buffer.from('PK\u0003\u0004') }), (e: Error & { status?: number }) => e.status === 503 || e.status === 415);
    const typ = (await d.typenFuer(await d.zugriff(A))).find((t) => t.id === person.id)!;
    assert.deepEqual(typ.ausDokument, { beschriftung: 'Visitenkarte scannen' });
    await d.aendereTyp(person.id, { ...typ, ausDokument: { aus: true } });
    assert.deepEqual((await d.typenFuer(await d.zugriff(A))).find((t) => t.id === person.id)!.ausDokument, { aus: true });
  });
});

describe('Aus Dokument ausfüllen: Texterkennung sofort (#391)', () => {
  it('liest die Textebene eines PDFs ohne Warteschlange (nur mit pdftotext)', async (t) => {
    const { pruefeWerkzeuge, Texterkennung } = await import('../src/texterkennung');
    if (!(await pruefeWerkzeuge()).pdftotext) { t.skip('pdftotext fehlt'); return; }
    const { pdfMitText } = await import('./hilfen');
    const ocr = new Texterkennung(speicherRepo(), speicherDateien());
    const r = await ocr.erkenneSofort(pdfMitText(['Elektro Muster GmbH', 'anna.beispiel@elektro-muster.de'], 12), 'application/pdf');
    assert.match(r.text, /anna\.beispiel@elektro-muster\.de/);
    const d = new Dienst(speicherRepo(), speicherDateien(), { einstellungen: speicherEinstellungen() });
    d.verbindeTexterkennung(ocr);
    assert.match((await d.textAusDatei(pdfMitText(['Mobil 0171 1234567']), 'karte.pdf', 'application/pdf')).text, /0171 1234567/);
    await assert.rejects(d.textAusDatei(Buffer.from('PK\u0003\u0004'), 'x.zip', 'application/zip'), (e: Error & { status?: number }) => e.status === 415);
  });
});
