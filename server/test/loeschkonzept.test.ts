/**
 * Löschkonzept aus dem DMS erzeugen (#469): Abschnitt 2 aus den Mappentypen, Lücken, nichts aus Mappen,
 * PDF und Word-Datei.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { inflateRawSync } from 'node:zlib';
import { DATENSCHUTZ_STANDARD } from '../../shared/src/auskunft';
import { datenarten, FEHLT, loeschkonzept, luecken, type LoeschkonzeptQuelle } from '../../shared/src/loeschkonzept';
import { speicherDateien } from '../src/dateispeicher';
import { Dienst } from '../src/dienst';
import { speicherEinstellungen } from '../src/einstellungen';
import { speicherRepo } from '../src/repo-speicher';
import { schriftstueckDocx, schriftstueckPdf } from '../src/schriftstueck';

/** Einträge eines ZIP (nur „deflate“ und „stored“, wie zipPuffer schreibt). */
function entpacke(zip: Buffer): Map<string, string> {
  const r = new Map<string, string>();
  let i = 0;
  while (zip.readUInt32LE(i) === 0x04034b50) {
    const methode = zip.readUInt16LE(i + 8); const groesse = zip.readUInt32LE(i + 18);
    const nl = zip.readUInt16LE(i + 26); const el = zip.readUInt16LE(i + 28);
    const name = zip.subarray(i + 30, i + 30 + nl).toString('utf8');
    const roh = zip.subarray(i + 30 + nl + el, i + 30 + nl + el + groesse);
    r.set(name, (methode === 8 ? inflateRawSync(roh) : roh).toString('utf8'));
    i += 30 + nl + el + groesse;
  }
  return r;
}

const basis = (typen: LoeschkonzeptQuelle['typen'], ds = DATENSCHUTZ_STANDARD): LoeschkonzeptQuelle => ({
  typen, datenschutz: ds, papierkorbTage: 30, historieTage: 365, auskunftTage: 7,
  sicherung: { aktiv: true, haeufigkeit: 'taeglich', aufbewahrung: { taeglich: 7, woechentlich: 4, monatlich: 12 } },
  version: '0.103.0', stand: '2026-11-01', mandant: 'Hausverwaltung Muster',
});

describe('Löschkonzept (#469)', () => {
  const kunde = { id: 'k', name: 'Kunde', felder: [{ key: 'name', label: 'Name', typ: 'text' as const }] };
  const rechnung = { id: 'r', name: 'Rechnung', archiv: { jahre: 8, stichtag: 'datum' }, felder: [
    { key: 'datum', label: 'Rechnungsdatum', typ: 'datum' as const }, { key: 'kunde', label: 'Kunde', typ: 'referenz' as const, zielTyp: 'k' },
  ] };
  const haus = { id: 'h', name: 'Haus', felder: [{ key: 'adresse', label: 'Adresse', typ: 'text' as const }] };
  const benutzer = { id: 'b', name: 'Benutzer', system: 'benutzer' as const, felder: [] };
  const ds = { ...DATENSCHUTZ_STANDARD, typen: { k: { person: true, zweck: 'Kundenbeziehung' } } };

  it('füllt Abschnitt 2 aus Mappentypen mit Personenbezug, Zweck und Archivmodus', () => {
    const arten = datenarten(basis([kunde, rechnung, haus, benutzer], ds));
    assert.deepEqual(arten.map((a) => [a.typ, a.bezug]), [['Kunde', 'person'], ['Rechnung', 'verweis']], 'Haus ohne Personenbezug, Benutzer in Abschnitt 7');
    const [k, r] = arten;
    assert.equal(k.zweck, 'Kundenbeziehung');
    assert.equal(k.frist, FEHLT('Frist'));
    assert.equal(k.sperre, 'keine');
    assert.match(k.loeschweg, /löschen von Hand → Papierkorb → endgültig nach 30 Tagen/);
    assert.equal(r.betroffene, 'Kunde (über „Kunde“)');
    assert.equal(r.frist, '8 Jahre');
    assert.equal(r.stichtag, '„Rechnungsdatum“, ab Ende des Kalenderjahres');
    assert.equal(r.sperre, 'Archivmodus');
    assert.equal(r.loeschweg, '„Darf weg“ → Papierkorb → endgültig nach 30 Tagen');
    assert.match(r.grund, /^\[Grund, z\. B\. Buchungsbelege/);
    assert.equal(datenarten({ ...basis([kunde, rechnung], ds), papierkorbTage: 0 })[1].loeschweg, '„Darf weg“ → sofort endgültig (kein Papierkorb)');
  });

  it('meldet Lücken: ohne Zweck, ohne Frist, ohne Verantwortlichen, gar keine Datenart', () => {
    const l = luecken(basis([kunde, rechnung, haus], ds));
    assert.deepEqual(l.map((x) => [x.art, x.typ ?? '']), [['verantwortlicher', ''], ['frist', 'Kunde'], ['zweck', 'Rechnung']]);
    assert.deepEqual(luecken(basis([haus])).map((x) => x.art), ['verantwortlicher', 'keine']);
    const voll = luecken(basis([kunde, rechnung], { ...ds, verantwortlicher: 'Muster GmbH', typen: { k: { person: true, zweck: 'x' }, r: { person: false, zweck: 'Buchführung' } } }));
    assert.deepEqual(voll.map((x) => x.typ), ['Kunde'], 'nur noch die Frist beim Kunden');
  });

  it('Gliederung wie die Vorlage, Stand und Version im Kopf, Einstellungen vorbelegt', () => {
    const k = loeschkonzept(basis([kunde, rechnung, haus], { ...ds, verantwortlicher: 'Muster GmbH\nHauptstraße 1' }));
    assert.deepEqual(k.abschnitte.map((a) => a.titel.split(' ')[0]), ['1.', '2.', '3.', '4.', '5.', '6.', '7.', '8.', '9.']);
    assert.match(k.stand, /01\.11\.2026.*0\.103\.0/);
    assert.match(k.vorbemerkung, /keine Rechtsberatung/);
    const text = JSON.stringify(k.abschnitte);
    assert.match(text, /Muster GmbH, Hauptstraße 1/);
    assert.match(text, /Aufbewahrung 30 Tagen/);
    assert.match(text, /7 tägliche, 4 wöchentliche, 12 monatliche/);
    assert.match(text, /Ohne Personenbezug \(nicht in der Tabelle\): Haus/);
    assert.match(text, /Bitte ergänzen/);
  });

  it('enthält nichts aus Mappen und lässt sich als PDF und Word-Datei erzeugen', async () => {
    const d = new Dienst(speicherRepo(), speicherDateien(), { einstellungen: speicherEinstellungen() });
    const k = await d.legeTypAn({ name: 'Mieter', felder: [{ key: 'name', label: 'Name', typ: 'text', pflicht: true }, { key: 'iban', label: 'IBAN', typ: 'text' }] });
    await d.legeMappeAn({ typId: k.id, werte: { name: 'Erika Mustermann', iban: 'DE02120300000000202051' } }, null);
    await d.setzeDatenschutz({ typen: { [k.id]: { person: true, zweck: 'Mietverhältnis' } } }, 'admin@example.org');
    const q = { ...basis(await d.listeTypen(), await d.datenschutz()), papierkorbTage: await d.papierkorbTage() };
    const lk = loeschkonzept(q);
    const s = { titel: lk.titel, untertitel: lk.untertitel, stand: lk.stand, vorbemerkung: lk.vorbemerkung, abschnitte: lk.abschnitte };
    const docx = entpacke(schriftstueckDocx(s));
    assert.ok(docx.has('[Content_Types].xml') && docx.has('word/styles.xml'));
    const xml = docx.get('word/document.xml')!;
    assert.match(xml, /Mietverhältnis/);
    assert.match(xml, /<w:highlight w:val="yellow"\/><\/w:rPr><w:t xml:space="preserve">\[Frist\]/, 'Lücken gelb markiert');
    for (const geheim of ['Erika', 'Mustermann', 'DE02120300000000202051']) {
      assert.ok(!xml.includes(geheim), `nichts aus Mappen: ${geheim}`);
      assert.ok(!JSON.stringify(lk).includes(geheim));
    }
    const pdf = await schriftstueckPdf(s);
    assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
  });
});
