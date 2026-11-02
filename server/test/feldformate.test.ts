/** Feldformate und Datumsgrenzen (#535): Prüfung, Angleichen, Bestand bleibt gültig, Werkbank-Liste, Erkennung. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  deutschePlz, eingabemodus, formatFehler, gleicheFormateAn, ibanFehler, ibanGruppen, istEmail, istInternetseite, istTelefon,
  pruefeFormatDefinition, pruefeFormate, telefonLink, unpassendeAngaben,
} from '../../shared/src/feldformate';
import { artVon, istIban, pruefeVorschlaege, vorschlaegeAus } from '../../shared/src/erkennung';
import { formatiere, type Feld } from '../../shared/src/model';
import { speicherDateien } from '../src/dateispeicher';
import { Dienst } from '../src/dienst';
import { speicherEinstellungen } from '../src/einstellungen';
import { Fachfehler } from '../src/fehler';
import { speicherRepo } from '../src/repo-speicher';

const felder: Feld[] = [
  { key: 'name', label: 'Name', typ: 'text' },
  { key: 'email', label: 'E-Mail', typ: 'text', format: 'email' },
  { key: 'telefon', label: 'Telefon', typ: 'text', format: 'telefon' },
  { key: 'internetseite', label: 'Internetseite', typ: 'text', format: 'internetseite' },
  { key: 'iban', label: 'IBAN', typ: 'text', format: 'iban' },
  { key: 'plz', label: 'PLZ', typ: 'text', format: 'plz', landFeld: 'land', maxLen: 10 },
  { key: 'land', label: 'Land', typ: 'text', standard: 'Deutschland' },
  { key: 'geburtstag', label: 'Geburtstag', typ: 'datum', max: 'heute' },
  { key: 'einzug', label: 'Einzug', typ: 'datum', min: '2000-01-01', max: '2030-12-31' },
];
const f = (k: string) => felder.find((x) => x.key === k)!;
const fehler = (k: string, v: string, werte = {}) => formatFehler(f(k), v, { felder, werte, heute: '2026-11-02' });

describe('Feldformate (#535): einzelne Formate', () => {
  it('E-Mail: name@domain.tld', () => {
    assert.ok(istEmail('lena@beispiel.de'));
    assert.ok(istEmail('jonas.weber+dms@mail.beispiel.co.uk'));
    assert.ok(istEmail('markus@müller.de'));
    for (const x of ['lena', 'lena@beispiel', '@beispiel.de', 'lena@@beispiel.de', 'lena beispiel@x.de']) assert.ok(!istEmail(x), x);
    assert.match(fehler('email', 'lena@beispiel')!, /name@beispiel\.de/);
  });

  it('Telefon: Ziffern, + am Anfang, Leerzeichen, /, -, Klammern – keine Buchstaben', () => {
    for (const x of ['+49 30 123456', '0351/123 45-6', '(0351) 12345', '110']) assert.ok(istTelefon(x), x);
    for (const x of ['0351 1234abc', '49+30', '12', 'ruf an']) assert.ok(!istTelefon(x), x);
    assert.equal(fehler('telefon', '030 12345 Durchwahl'), 'Eine Telefonnummer enthält nur Ziffern, + am Anfang, Leerzeichen, /, - und Klammern.');
    assert.equal(telefonLink('+49 (30) 123-456'), 'tel:+4930123456');
  });

  it('Internetseite: mit oder ohne Schema, ohne Leerzeichen', () => {
    for (const x of ['www.beispiel.de', 'https://beispiel.de/kontakt', 'http://www.beispiel.de']) assert.ok(istInternetseite(x), x);
    for (const x of ['beispiel', 'www beispiel.de', 'ftp://beispiel.de', 'https://']) assert.ok(!istInternetseite(x), x);
  });

  it('IBAN: Länge je Land und Prüfziffer, Anzeige in Vierergruppen', () => {
    assert.equal(ibanFehler('DE89 3704 0044 0532 0130 00'), null);
    assert.equal(ibanFehler('de89370400440532013000'), null);
    assert.equal(ibanFehler('AT61 1904 3002 3457 3201'), null);
    assert.match(ibanFehler('DE89 3704 0044 0532 0130 0')!, /aus Deutschland hat 22 Zeichen, hier sind es 21/);
    assert.match(ibanFehler('DE88 3704 0044 0532 0130 00')!, /Prüfziffer/);
    assert.match(ibanFehler('XX89 3704 0044 0532 0130 00')!, /„XX“/);
    assert.match(ibanFehler('1234')!, /zwei Buchstaben/);
    assert.equal(ibanGruppen('de89370400440532013000'), 'DE89 3704 0044 0532 0130 00');
    // Die Erkennung nutzt dieselbe Prüfung – und kennt jetzt auch die Länge je Land.
    assert.ok(istIban('DE89370400440532013000'));
    assert.ok(!istIban('DE8937040044053201300077'));
    assert.equal(formatiere(f('iban'), 'DE89370400440532013000'), 'DE89 3704 0044 0532 0130 00');
  });

  it('PLZ: genau 5 Ziffern nur bei Deutschland (auch leer mit Vorgabe Deutschland), sonst frei', () => {
    assert.match(fehler('plz', '01357asda', { land: 'Deutschland' })!, /genau 5 Ziffern/);
    assert.match(fehler('plz', '0135', {})!, /genau 5 Ziffern/);
    assert.equal(fehler('plz', '01357', { land: 'DE' }), null);
    assert.equal(fehler('plz', '1010', { land: 'Österreich' }), null);
    assert.equal(fehler('plz', 'SW1A 1AA', { land: 'Vereinigtes Königreich' }), null);
    // Land leer, Vorgabe des Land-Felds ist kein Deutschland: frei.
    const anders: Feld[] = [{ ...f('plz') }, { key: 'land', label: 'Land', typ: 'text', standard: 'Schweiz' }];
    assert.equal(deutschePlz(anders[0], anders, {}), false);
    // Ohne Land-Feld gilt Deutschland.
    assert.equal(deutschePlz({ landFeld: null }, [], {}), true);
    assert.equal(eingabemodus(f('plz'), true), 'numeric');
    assert.equal(eingabemodus(f('plz'), false), undefined);
    assert.equal(eingabemodus(f('telefon')), 'tel');
    assert.equal(eingabemodus(f('email')), 'email');
    assert.equal(eingabemodus(f('internetseite')), 'url');
  });

  it('Datum: Grenzen fest oder heute', () => {
    assert.equal(fehler('geburtstag', '2026-11-02'), null);
    assert.equal(fehler('geburtstag', '2026-11-03'), 'Das Datum darf nicht in der Zukunft liegen.');
    assert.equal(fehler('einzug', '1999-12-31'), 'Das Datum darf nicht vor dem 01.01.2000 liegen.');
    assert.equal(fehler('einzug', '2031-01-01'), 'Das Datum darf nicht nach dem 31.12.2030 liegen.');
  });
});

describe('Feldformate (#535): Speichern und Bestand', () => {
  it('pruefeFormate: neu alles, beim Bearbeiten nur Geändertes (PLZ auch, wenn sich das Land ändert)', () => {
    const alt = { plz: '01357asda', telefon: '0351 abc', land: 'Deutschland' };
    assert.deepEqual(Object.keys(pruefeFormate({ felder }, alt, undefined, '2026-11-02')).sort(), ['plz', 'telefon']);
    assert.deepEqual(pruefeFormate({ felder }, { ...alt, name: 'Lena' }, alt, '2026-11-02'), {});
    assert.deepEqual(Object.keys(pruefeFormate({ felder }, { ...alt, telefon: '0351 12x' }, alt, '2026-11-02')), ['telefon']);
    const ausland = { ...alt, land: 'Österreich' };
    assert.deepEqual(pruefeFormate({ felder }, ausland, alt, '2026-11-02'), {});
    assert.deepEqual(Object.keys(pruefeFormate({ felder }, { plz: '1010', land: 'Deutschland' }, { plz: '1010', land: 'Österreich' }, '2026-11-02')), ['plz']);
  });

  it('gleicheFormateAn: https:// ergänzen, IBAN in Gruppen – nur geänderte Werte', () => {
    const w = gleicheFormateAn({ felder }, { internetseite: 'www.beispiel.de', iban: 'de89370400440532013000', email: ' lena@beispiel.de ' });
    assert.equal(w.internetseite, 'https://www.beispiel.de');
    assert.equal(w.iban, 'DE89 3704 0044 0532 0130 00');
    assert.equal(w.email, 'lena@beispiel.de');
    const alt = { internetseite: 'www.beispiel.de' };
    assert.equal(gleicheFormateAn({ felder }, { ...alt }, alt).internetseite, 'www.beispiel.de');
  });

  it('unpassendeAngaben: je Mappe und Feld mit Grund', () => {
    const l = unpassendeAngaben({ felder }, [{ id: 'm1', werte: { plz: '01357asda', geburtstag: '2030-01-01' } }, { id: 'm2', werte: { plz: '01357' } }], '2026-11-02');
    assert.deepEqual(l.map((x) => `${x.mappeId}:${x.feldKey}`), ['m1:plz', 'm1:geburtstag']);
  });

  it('Definition: Format nur an Text, Land-Feld nur bei PLZ und vorhanden, Datumsgrenzen gültig', () => {
    assert.match(pruefeFormatDefinition({ key: 'x', label: 'X', typ: 'zahl', format: 'telefon' }, []).join(), /nur für Textfelder/);
    assert.match(pruefeFormatDefinition({ key: 'x', label: 'X', typ: 'text', format: 'plz', landFeld: 'fehlt' }, []).join(), /„fehlt“/);
    assert.match(pruefeFormatDefinition({ key: 'x', label: 'X', typ: 'text', format: 'email', landFeld: 'land' }, felder).join(), /nur beim Format PLZ/);
    assert.match(pruefeFormatDefinition({ key: 'd', label: 'D', typ: 'datum', max: 'morgen' }, []).join(), /heute/);
    assert.match(pruefeFormatDefinition({ key: 'd', label: 'D', typ: 'datum', min: '2030-01-01', max: '2020-01-01' }, []).join(), /nach „Spätestens“/);
    assert.deepEqual(pruefeFormatDefinition(f('plz'), felder), []);
  });
});

describe('Feldformate (#535): Erkennung nutzt die Formate', () => {
  it('Art aus dem Format, Vorschläge nur, wenn sie passen', () => {
    assert.equal(artVon({ key: 'kontakt', label: 'Kontakt', typ: 'text', format: 'telefon' }), 'telefon');
    assert.equal(artVon({ key: 'feld1', label: 'Feld 1', typ: 'text', format: 'iban' }), 'iban');
    const typ = { felder: [{ key: 'geburtstag', label: 'Geburtstag', typ: 'datum', max: 'heute', erkennung: {} } as Feld] };
    assert.equal(vorschlaegeAus(typ, 'Termin am 01.01.2999').geburtstag, undefined);
    const p = pruefeVorschlaege({ felder: [{ key: 'tel', label: 'Telefon', typ: 'text', format: 'telefon' }] }, { tel: { wert: 'ruf mich an' } });
    assert.equal(p.verworfen.length, 1);
  });
});

describe('Feldformate (#535): im Dienst', () => {
  async function aufbau() {
    const d = new Dienst(speicherRepo(), speicherDateien(), { einstellungen: speicherEinstellungen() });
    const typ = await d.legeTypAn({ name: 'Person', titelVorlage: '{name}', felder: felder.map((x) => ({ ...x })) });
    return { d, typ };
  }

  it('Mappentyp speichert Format, Land-Feld und Datumsgrenzen; ungültige Angaben werden gemeldet', async () => {
    const { d, typ } = await aufbau();
    const plz = typ.felder.find((x) => x.key === 'plz')!;
    assert.equal(plz.format, 'plz');
    assert.equal(plz.landFeld, 'land');
    assert.equal(typ.felder.find((x) => x.key === 'geburtstag')!.max, 'heute');
    assert.equal(typ.felder.find((x) => x.key === 'name')!.format, undefined);
    await assert.rejects(d.legeTypAn({ name: 'Falsch', felder: [{ key: 'd', label: 'D', typ: 'datum', max: 'übermorgen' }] }), (e) => e instanceof Fachfehler && JSON.stringify(e.details).includes('heute'));
  });

  it('neue Mappe: unpassende Angaben abgelehnt mit Feldname, passende angeglichen', async () => {
    const { d, typ } = await aufbau();
    await assert.rejects(d.legeMappeAn({ typId: typ.id, werte: { name: 'Lena', plz: '01357asda', telefon: '0351 abc' } }),
      (e) => e instanceof Fachfehler && e.status === 422 && /Telefon, PLZ/.test(e.message) && !!(e.details as { felder: Record<string, string[]> }).felder.plz);
    await assert.rejects(d.legeMappeAn({ typId: typ.id, werte: { name: 'Lena', geburtstag: '2999-01-01' } }), (e) => e instanceof Fachfehler && /Geburtstag/.test(e.message));
    const m = await d.legeMappeAn({ typId: typ.id, werte: { name: 'Lena', plz: '01357', internetseite: 'www.beispiel.de', iban: 'DE89370400440532013000' } });
    assert.equal(m.werte.internetseite, 'https://www.beispiel.de');
    assert.equal(m.werte.iban, 'DE89 3704 0044 0532 0130 00');
    const wien = await d.legeMappeAn({ typId: typ.id, werte: { name: 'Jonas', plz: '1010', land: 'Österreich' } });
    assert.equal(wien.werte.plz, '1010');
  });

  it('Bestand: neues Format macht nichts ungültig; erst das geänderte Feld muss passen; Werkbank listet', async () => {
    const d = new Dienst(speicherRepo(), speicherDateien(), { einstellungen: speicherEinstellungen() });
    const typ = await d.legeTypAn({ name: 'Person', titelVorlage: '{name}', felder: [
      { key: 'name', label: 'Name', typ: 'text' }, { key: 'plz', label: 'PLZ', typ: 'text' }, { key: 'telefon', label: 'Telefon', typ: 'text' },
    ] });
    const m = await d.legeMappeAn({ typId: typ.id, werte: { name: 'Markus', plz: '01357asda', telefon: '0351 abc' } });
    await d.aendereTyp(typ.id, { ...typ, felder: typ.felder.map((x) => (x.key === 'plz' ? { ...x, format: 'plz' } : x.key === 'telefon' ? { ...x, format: 'telefon' } : x)) });
    // Passung bleibt: nichts unter „Zu erledigen“.
    assert.notEqual((await d.holeMappe(m.id))?.mappe.passt, false);
    // Anderes Feld ändern geht, die alten Angaben bleiben unverändert.
    const n = await d.aendereMappe(m.id, { werte: { ...m.werte, name: 'Markus B.' } });
    assert.equal(n.werte.plz, '01357asda');
    // Das Feld selbst ändern: muss passen.
    await assert.rejects(d.aendereMappe(m.id, { werte: { ...n.werte, telefon: '0351 abd' } }), (e) => e instanceof Fachfehler && /Telefon/.test(e.message));
    const liste = await d.unpassendeFormate();
    assert.equal(liste.length, 1);
    assert.deepEqual(liste[0].felder.map((x) => `${x.label}:${x.anzahl}`), ['PLZ:1', 'Telefon:1']);
    assert.equal(liste[0].felder[0].mappen[0].titel, 'Markus B.');
    await d.aendereMappe(m.id, { werte: { ...n.werte, plz: '01357', telefon: '0351 12345' } });
    assert.deepEqual(await d.unpassendeFormate(), []);
  });
});
