/**
 * Dokument übernehmen, Fundament (#937, #938): Mappentyp „Kann aus Post angelegt werden“ und „Woran man ihn erkennt“,
 * Feld „Aus Dokument füllen“ (früher „Für die Erkennung nutzen“) und „Zum Wiederfinden nutzen“ mit dem Abgleich im Kern.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { describe, it } from 'node:test';
import { parse } from 'yaml';
import { gleicheAb, liesWiederfinden, merkmalsfelder, wiederfindenVorgabe, type Vergleichsmappe } from '../../shared/src/erkennung';
import { ERKENNBAR_AN_MAX, kannAusPost, type Feld, type Mappentyp } from '../../shared/src/model';
import { typErkennbarAn } from '../../shared/src/beschriftung';
import { openapi } from '../src/api-v1';
import { speicherDateien } from '../src/dateispeicher';
import { Dienst } from '../src/dienst';
import { bereinigeFeld, bereinigeTyp } from '../src/mappentypen';
import { speicherEinstellungen } from '../src/einstellungen';
import { Fachfehler } from '../src/fehler';
import { Konten } from '../src/konten';
import { speicherKontoRepo } from '../src/konto-repo';
import { liesPaket, Paketverwaltung } from '../src/pakete';
import { baue } from '../src/paketerstellung';
import type { Repo } from '../src/repo';
import { speicherRepo } from '../src/repo-speicher';
import { zipPuffer } from '../src/zip';
import { eigeneDatenbank } from './hilfe-db';

const DOK = { key: 'dokumente', name: 'Dokumente', art: 'dokumente' };
const FELDREG = { key: 'allgemein', name: 'Allgemein', art: 'felder' };

/** Brief der Stadtwerke an Lena: Vertragsnummer, Kundennummer, Rechnungsnummer. */
const RECHNUNG = [
  'Stadtwerke Musterstadt GmbH · Hauptstraße 1 · 01067 Musterstadt',
  'Frau Lena Beispiel, Am Hang 3, 01099 Musterstadt',
  'Kundennummer: 100 4711',
  'Ihr Vertrag WV-1043 (Strom)',
  'Rechnung Nr. R-2026-0815 vom 03.11.2026',
  'Gesamtbetrag 84,20 EUR, zahlbar bis 20.11.2026',
].join('\n');

describe('Mappentyp: Kann aus Post angelegt werden, Woran man ihn erkennt (#937)', () => {
  it('Vorgabe: an mit Dokumentenregister, sonst aus; Systemtypen nie', () => {
    assert.equal(kannAusPost({ register: [FELDREG, DOK] as never }), true);
    assert.equal(kannAusPost({ register: [FELDREG] as never }), false);
    assert.equal(kannAusPost({ register: [FELDREG] as never, ausPost: true }), true);
    assert.equal(kannAusPost({ register: [FELDREG, DOK] as never, ausPost: false }), false);
    for (const system of ['benutzer', 'rolle', 'post'] as const) assert.equal(kannAusPost({ register: [FELDREG, DOK] as never, ausPost: true, system }), false, system);
  });

  it('liest beide Angaben, kürzt auf 300 Zeichen, mehrsprachig wie Name und Beschreibung (#728)', () => {
    const lang = 'Enthält Rechnungsnummer, Betrag und Zahlungsziel; '.repeat(10);
    const d = bereinigeTyp({ name: 'Rechnung', felder: [], register: [FELDREG, DOK], ausPost: false, erkennbarAn: `  ${lang}  `, beschriftungen: { en: { name: 'Invoice', erkennbarAn: 'Contains invoice number' } } });
    assert.equal(d.ausPost, false);
    assert.equal(d.erkennbarAn!.length, ERKENNBAR_AN_MAX);
    assert.equal(typErkennbarAn(d, 'en'), 'Contains invoice number');
    assert.equal(typErkennbarAn(d, 'de'), d.erkennbarAn);
    assert.equal(bereinigeTyp({ name: 'X', felder: [], register: [], ausPost: 'ja' }).ausPost, null, 'nur true/false, sonst Vorgabe');
  });

  it('speichern: Angaben bleiben ohne Nennung, Systemtypen nie, Konfliktschutz (#917) gilt weiter', async () => {
    const d = new Dienst(speicherRepo(), speicherDateien(), { einstellungen: speicherEinstellungen() });
    const t = await d.mappentypen.legeTypAn({ name: 'Rechnung', felder: [{ key: 'nr', label: 'Rechnungsnummer', typ: 'text', wiederfinden: true }], register: [FELDREG, DOK], ausPost: false, erkennbarAn: 'Enthält Rechnungsnummer' });
    assert.deepEqual([t.ausPost, t.erkennbarAn], [false, 'Enthält Rechnungsnummer']);
    // Älteres Programm über die API: ohne die neuen Angaben gespeichert – nichts geht verloren.
    const { ausPost: _a, erkennbarAn: _e, ...alt } = t;
    const t2 = await d.mappentypen.aendereTyp(t.id, { ...alt, beschreibung: 'neu', felder: t.felder.map(({ wiederfinden: _w, ...f }) => f) });
    assert.deepEqual([t2.ausPost, t2.erkennbarAn, t2.felder[0].wiederfinden], [false, 'Enthält Rechnungsnummer', true]);
    // Ausdrücklich zurück auf die Vorgabe.
    const t3 = await d.mappentypen.aendereTyp(t.id, { ...t2, ausPost: null, erkennbarAn: '', stand: t2.geaendert });
    assert.deepEqual([t3.ausPost, t3.erkennbarAn, kannAusPost(t3)], [null, '', true]);
    // Konfliktschutz (#917): mit altem Stand nichts überschrieben.
    await assert.rejects(d.mappentypen.aendereTyp(t.id, { ...t3, ausPost: false, stand: t2.geaendert }), (e) => e instanceof Fachfehler && e.status === 409);
    assert.equal((await d.mappentypen.listeTypen()).find((x) => x.id === t.id)!.ausPost, null);
    // Systemtyp Post: beide Angaben lassen sich nicht setzen.
    await d.eingangskanaele.postTyp();
    const post = (await d.mappentypen.listeTypen()).find((x) => x.system === 'post')!;
    const p2 = await d.mappentypen.aendereTyp(post.id, { ...post, ausPost: true, erkennbarAn: 'Alles', beschriftungen: { en: { erkennbarAn: 'All' } } });
    assert.deepEqual([p2.ausPost, p2.erkennbarAn, kannAusPost(p2), p2.beschriftungen?.en?.erkennbarAn], [false, '', false, undefined]);
  });

  it('„Wohin gehört das?“: nur Typen mit dem Haken, in denen die Person anlegen darf; Systemtypen nie', async () => {
    const d = new Dienst(speicherRepo(), speicherDateien(), { einstellungen: speicherEinstellungen() });
    const konten = new Konten(speicherKontoRepo(), null, 'http://nas', d.systemtypen.benutzerspiegel());
    const { benutzer: lena } = await konten.einrichten({ email: 'lena@example.org', name: 'Lena', passwort: 'ein-langes-passwort' });
    const { benutzer: jonas } = await konten.legeBenutzerAn({ email: 'jonas@example.org', name: 'Jonas' }, lena.id);
    await d.postSystemmappen.gleicheBenutzerAb(await konten.listeBenutzer());
    await d.eingangskanaele.postTyp();
    const rechnung = await d.mappentypen.legeTypAn({ name: 'Rechnung', felder: [{ key: 'nr', label: 'Nr', typ: 'text' }], register: [FELDREG, DOK] });
    await d.mappentypen.legeTypAn({ name: 'Ablagenotiz', felder: [{ key: 'nr', label: 'Nr', typ: 'text' }], register: [FELDREG] });
    const aus = await d.mappentypen.legeTypAn({ name: 'Fahrzeug', felder: [{ key: 'nr', label: 'Kennzeichen', typ: 'text' }], register: [FELDREG, DOK], ausPost: false });
    const nurLesen = await d.mappentypen.legeTypAn({ name: 'Versicherung', felder: [{ key: 'nr', label: 'Nr', typ: 'text' }], register: [FELDREG, DOK] });
    await d.berechtigungen.setzeBerechtigungen(nurLesen.id, { grund: { C: false, R: true, U: true, D: true, P: true }, regeln: [] }, true);
    const namen = async (b: { id: string; rolle: string }) => (await d.mappentypen.ausPostZiele(await d.rechtepruefung.zugriff(b))).map((t) => t.name);
    assert.deepEqual(await namen({ id: lena.id, rolle: 'admin' }), ['Rechnung', 'Versicherung']);
    assert.deepEqual(await namen({ id: jonas.id, rolle: 'mitglied' }), ['Rechnung'], 'ohne Recht C nicht wählbar');
    assert.ok(!(await d.mappentypen.ausPostZiele()).some((t) => t.system || t.id === aus.id), 'Systemtypen und Typen ohne Haken nie');
    assert.ok((await d.mappentypen.ausPostZiele()).some((t) => t.id === rechnung.id));
  });

  it('API v1: Mappentyp mit ausPost und erkennbarAn, Feld mit wiederfinden', () => {
    const s = JSON.stringify(openapi('0.0.0'));
    for (const k of ['"ausPost"', '"erkennbarAn"', '"wiederfinden"', 'Aus Dokument füllen']) assert.ok(s.includes(k), k);
  });
});

describe('Feld: Aus Dokument füllen und Zum Wiederfinden nutzen (#938)', () => {
  it('eigener Haken, unabhängig von „eindeutig“; nur Text, Zahl und Verweis', () => {
    assert.equal(bereinigeFeld({ key: 'nr', label: 'Kundennummer', typ: 'text', wiederfinden: true }).wiederfinden, true);
    assert.equal(bereinigeFeld({ key: 'nr', label: 'Kundennummer', typ: 'text', wiederfinden: true }).eindeutig, false, 'unabhängig von eindeutig');
    assert.equal(bereinigeFeld({ key: 'z', label: 'Zähler', typ: 'zahl', wiederfinden: true }).wiederfinden, true);
    assert.equal(bereinigeFeld({ key: 'v', label: 'Vertrag', typ: 'referenz', zielTyp: 'x', wiederfinden: true }).wiederfinden, true);
    for (const typ of ['langtext', 'datum', 'betrag', 'auswahl', 'janein', 'passwort'] as const) assert.equal(liesWiederfinden(true, typ), false, typ);
    // Die Daten von „Aus Dokument füllen“ bleiben, wie sie sind (Art, Hinweis).
    assert.deepEqual(bereinigeFeld({ key: 'kd', label: 'Kundennummer', typ: 'text', erkennung: { art: 'nummer', hinweis: 'oben rechts' } }).erkennung, { art: 'nummer', hinweis: 'oben rechts' });
    assert.equal(bereinigeFeld({ key: 'kd', label: 'Kundennummer', typ: 'text', erkennung: {} }).wiederfinden, undefined, '„Aus Dokument füllen“ setzt den Haken nicht mit');
  });

  it('Vorgabe für Felder ohne den Haken (ältere Pakete, Migration 089): markiert und Merkmal', () => {
    const f = (key: string, label: string, typ: Feld['typ'] = 'text', erkennung: Feld['erkennung'] = {}) => wiederfindenVorgabe({ key, label, typ, erkennung });
    assert.deepEqual([f('kundennummer', 'Kundennummer'), f('name', 'Name'), f('email', 'E-Mail'), f('ort', 'Ort'), f('hausnummer', 'Hausnummer'), f('vorname', 'Vorname'), f('notiz', 'Notiz', 'langtext'), f('x', 'Freitext', 'text', { art: 'iban' })],
      [true, true, true, false, false, false, false, true]);
    assert.equal(wiederfindenVorgabe({ key: 'kundennummer', label: 'Kundennummer', typ: 'text' }), false, 'ohne „Aus Dokument füllen“ nie');
  });

  /** Lenas Ablage: Vertragspartner, Vertrag, Rechnung. */
  const typen = () => {
    const partner: Pick<Mappentyp, 'id' | 'felder'> = { id: 't-partner', felder: [
      { key: 'name', label: 'Name', typ: 'text', wiederfinden: true },
      { key: 'kundennummer', label: 'Kundennummer', typ: 'text', wiederfinden: true },
      { key: 'ort', label: 'Ort', typ: 'text' },
    ] };
    const vertrag: Pick<Mappentyp, 'id' | 'felder'> = { id: 't-vertrag', felder: [
      { key: 'titel', label: 'Titel', typ: 'text' },
      { key: 'vertragsnummer', label: 'Vertragsnummer', typ: 'text', wiederfinden: true },
      { key: 'partner', label: 'Vertragspartner', typ: 'referenz', zielTypen: ['t-partner'], wiederfinden: true },
    ] };
    const rechnung: Pick<Mappentyp, 'id' | 'felder'> = { id: 't-rechnung', felder: [
      { key: 'rechnungsnummer', label: 'Rechnungsnummer', typ: 'text', wiederfinden: true },
      { key: 'aussteller', label: 'Aussteller', typ: 'referenz', zielTypen: ['t-partner' ]},
      { key: 'vertrag', label: 'Vertrag', typ: 'referenz', zielTypen: ['t-vertrag'], wiederfinden: true },
    ] };
    return { partner, vertrag, rechnung };
  };
  const mappen = (mitRechnung: boolean): Vergleichsmappe[] => [
    { id: 'sw', typId: 't-partner', werte: { name: 'Stadtwerke Musterstadt', kundennummer: '100-4711', ort: 'Musterstadt' } },
    { id: 'bank', typId: 't-partner', werte: { name: 'Beispielbank', kundennummer: 'BB-99887' } },
    { id: 'strom', typId: 't-vertrag', werte: { titel: 'Strom', vertragsnummer: 'WV-1043', partner: 'sw' } },
    { id: 'gas', typId: 't-vertrag', werte: { titel: 'Gas', vertragsnummer: 'WV-2077', partner: 'sw' } },
    ...(mitRechnung ? [{ id: 'r1', typId: 't-rechnung', werte: { rechnungsnummer: 'R-2026-0815', vertrag: 'strom' } }, { id: 'r0', typId: 't-rechnung', werte: { rechnungsnummer: 'R-2026-0700', vertrag: 'strom' } }] : []),
  ];

  it('Test aus dem Issue: Rechnung mit bekannter Vertragsnummer → Vertrag vorgeschlagen, drei Belege', () => {
    const { partner, vertrag, rechnung } = typen();
    const a = gleicheAb(RECHNUNG, [partner, vertrag, rechnung], mappen(false), rechnung);
    const v = a.verweise.vertrag;
    assert.equal(v[0].mappeId, 'strom', 'der Vertrag mit der Vertragsnummer im Brief vorn');
    assert.equal(v[0].belege.length, 3);
    assert.deepEqual(v[0].belege.map((b) => [b.feld, b.wert, b.ueber?.feld ?? null]), [
      ['Vertragsnummer', 'WV-1043', null],
      ['Name', 'Stadtwerke Musterstadt', 'Vertragspartner'],
      ['Kundennummer', '100-4711', 'Vertragspartner'],
    ]);
    assert.match(v[0].belege[0].fundstelle, /Ihr Vertrag WV-1043/);
    assert.match(v[0].belege[2].fundstelle, /Kundennummer: 100 4711/, 'Fundstelle im Dokument, andere Schreibweise');
    assert.equal(v[0].sicherheit, 'hoch');
    assert.equal(v[0].unsicher, false);
    assert.ok(v[1].mappeId === 'gas' && v[1].belege.every((b) => b.ueber), 'der andere Vertrag nur über den Vertragspartner, dahinter');
    // Aussteller → Vertragspartner (Verweisfeld ohne Haken – Vorschläge gibt es trotzdem).
    assert.deepEqual(a.verweise.aussteller.map((x) => [x.mappeId, x.belege.length, x.sicherheit]), [['sw', 2, 'hoch']]);
    assert.deepEqual(a.doppelt, [], 'keine Rechnung mit dieser Nummer');
  });

  it('Test aus dem Issue: Rechnungsnummer vorhanden → Warnung', () => {
    const { partner, vertrag, rechnung } = typen();
    const a = gleicheAb(RECHNUNG, [partner, vertrag, rechnung], mappen(true), rechnung);
    assert.deepEqual(a.doppelt.map((x) => x.mappeId), ['r1']);
    assert.deepEqual(a.doppelt[0].belege.filter((b) => !b.ueber).map((b) => [b.feld, b.wert]), [['Rechnungsnummer', 'R-2026-0815']]);
    assert.ok(!a.doppelt.some((x) => x.mappeId === 'r0'), 'andere Rechnung zum selben Vertrag ist kein Doppel');
    // Als Vertrag gewählt: Die einzige Angabe zum Wiederfinden des Vertrags WV-1043 steht im Brief – den gibt es schon.
    assert.deepEqual(gleicheAb(RECHNUNG, [partner, vertrag, rechnung], mappen(true), vertrag).doppelt.map((x) => x.mappeId), ['strom']);
  });

  it('mehrere Belege stärken; ein einzelner schwacher (nur der Name) ist unsicher', () => {
    const { partner } = typen();
    const nurName = gleicheAb('Mit freundlichen Grüßen, Ihre Beispielbank', [partner], mappen(false));
    assert.deepEqual(nurName.treffer.map((x) => [x.mappeId, x.sicherheit, x.unsicher]), [['bank', 'niedrig', true]]);
    const nurNummer = gleicheAb('Kunde BB-99887', [partner], mappen(false));
    assert.deepEqual(nurNummer.treffer.map((x) => [x.mappeId, x.sicherheit, x.unsicher]), [['bank', 'mittel', false]]);
    const beides = gleicheAb('Beispielbank, Kunde BB 99887', [partner], mappen(false));
    assert.deepEqual(beides.treffer.map((x) => [x.mappeId, x.sicherheit, x.belege.length]), [['bank', 'hoch', 2]]);
  });

  it('nur Felder mit dem Haken zählen – „Aus Dokument füllen“ allein findet nichts wieder', () => {
    const t = { id: 't', felder: [{ key: 'kundennummer', label: 'Kundennummer', typ: 'text' as const, erkennung: {} }] };
    assert.equal(merkmalsfelder(t).length, 0);
    assert.deepEqual(gleicheAb('Kundennummer 100-4711', [t], [{ id: 'm', typId: 't', werte: { kundennummer: '100-4711' } }]).treffer, []);
  });

  it('Abgleich im Dienst: nur Mappen, die die Person lesen darf; Zieltyp muss es geben', async () => {
    const d = new Dienst(speicherRepo(), speicherDateien(), { einstellungen: speicherEinstellungen() });
    const konten = new Konten(speicherKontoRepo(), null, 'http://nas', d.systemtypen.benutzerspiegel());
    const { benutzer: lena } = await konten.einrichten({ email: 'lena@example.org', name: 'Lena', passwort: 'ein-langes-passwort' });
    const { benutzer: jonas } = await konten.legeBenutzerAn({ email: 'jonas@example.org', name: 'Jonas' }, lena.id);
    await d.postSystemmappen.gleicheBenutzerAb(await konten.listeBenutzer());
    const partner = await d.mappentypen.legeTypAn({ name: 'Vertragspartner', titelVorlage: '{name}', felder: [{ key: 'name', label: 'Name', typ: 'text', wiederfinden: true }, { key: 'kundennummer', label: 'Kundennummer', typ: 'text', wiederfinden: true }], register: [FELDREG, DOK] });
    const vertrag = await d.mappentypen.legeTypAn({ name: 'Vertrag', titelVorlage: '{titel}', felder: [{ key: 'titel', label: 'Titel', typ: 'text' }, { key: 'vertragsnummer', label: 'Vertragsnummer', typ: 'text', wiederfinden: true }, { key: 'partner', label: 'Vertragspartner', typ: 'referenz', zielTyp: partner.id, wiederfinden: true }], register: [FELDREG, DOK] });
    const rechnung = await d.mappentypen.legeTypAn({ name: 'Rechnung', felder: [{ key: 'rechnungsnummer', label: 'Rechnungsnummer', typ: 'text', wiederfinden: true }, { key: 'vertrag', label: 'Vertrag', typ: 'referenz', zielTyp: vertrag.id, wiederfinden: true }], register: [FELDREG, DOK] });
    const sw = await d.mappen.legeMappeAn({ typId: partner.id, werte: { name: 'Stadtwerke Musterstadt', kundennummer: '100-4711' } }, lena.id);
    const strom = await d.mappen.legeMappeAn({ typId: vertrag.id, werte: { titel: 'Strom', vertragsnummer: 'WV-1043', partner: sw.id } }, lena.id);
    // Jonas darf Verträge nicht lesen.
    await d.berechtigungen.setzeBerechtigungen(vertrag.id, { grund: { C: false, R: false, U: false, D: false, P: false }, regeln: [] }, true);
    const fuerLena = await d.erkennung.abgleich(RECHNUNG, rechnung.id, await d.rechtepruefung.zugriff({ id: lena.id, rolle: 'admin' }));
    assert.equal(fuerLena.verweise.vertrag[0].mappeId, strom.id);
    assert.equal(fuerLena.verweise.vertrag[0].belege.length, 3);
    assert.equal(fuerLena.bezuege[strom.id].titel, 'Strom');
    const fuerJonas = await d.erkennung.abgleich(RECHNUNG, rechnung.id, await d.rechtepruefung.zugriff({ id: jonas.id, rolle: 'mitglied' }));
    assert.equal(fuerJonas.verweise.vertrag, undefined, 'Verträge, die Jonas nicht lesen darf, kommen nicht vor');
    assert.ok(!fuerJonas.treffer.some((x) => x.mappeId === strom.id));
    assert.ok(fuerJonas.treffer.some((x) => x.mappeId === sw.id));
    await assert.rejects(d.erkennung.abgleich(RECHNUNG, '00000000-0000-4000-8000-00000000dead'), (e) => e instanceof Fachfehler && e.status === 404);
  });
});

/* ---------- Pakete ---------- */

const archiv = (d: Record<string, string>) => zipPuffer(Object.entries(d).map(([name, inhalt]) => ({ name, daten: Buffer.from(inhalt) })), new Date('2026-01-01T12:00:00Z'));
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
const KATALOG = 'https://katalog.test/katalog.json';
function katalog(pakete: Array<Record<string, string>>) {
  const daten = new Map<string, Buffer>();
  const eintraege = new Map<string, { id: string; name: string; beschreibung: string; autor: { name: string; github: string }; lizenz: string; aktuell: string; versionen: unknown[] }>();
  for (const p of pakete) {
    const id = /^id: (\S+)$/m.exec(p['manifest.yaml'])![1], version = /^version: (\S+)$/m.exec(p['manifest.yaml'])![1];
    const b = archiv(p);
    daten.set(`https://katalog.test/archive/${id}-${version}.zip`, b);
    const e = eintraege.get(id) ?? { id, name: id, beschreibung: '', autor: { name: 'Test', github: 'test' }, lizenz: 'MIT', aktuell: version, versionen: [] };
    e.versionen.unshift({ version, dms: '>=0.60.0', abhaengigkeiten: {}, inhalt: { mappentypen: [], sichten: [], beispiele: 0 }, code: false, archiv: `archive/${id}-${version}.zip`, sha256: sha(b), groesse: b.length, veroeffentlicht: '2026-11-01T00:00:00Z', quelle: '', readme: '', changelog: '' });
    e.aktuell = version;
    eintraege.set(id, e);
  }
  daten.set(KATALOG, Buffer.from(JSON.stringify({ format: 1, erstellt: '', quelle: '', pakete: [...eintraege.values()] })));
  return async (url: string) => { const b = daten.get(url); if (!b) throw new Error(`404 ${url}`); return b; };
}
const paket = (version: string, typ: string[]) => ({
  'manifest.yaml': `schema: 1\nid: haushalt_test\nname: Haushalt\nversion: ${version}\nbeschreibung: Test.\nautor: { name: Test, github: test }\nlizenz: MIT\ndms: ">=0.60.0"\ninhalt:\n  mappentypen: inhalt/mappentypen.yaml\n`,
  'inhalt/mappentypen.yaml': [...typ, ''].join('\n'),
});
const RECHNUNG_10 = [
  '- schluessel: rechnung', '  name: Rechnung', '  beschreibung: Eine Rechnung',
  '  erkennbarAn: Enthält Rechnungsnummer, Betrag und Zahlungsziel',
  '  beschriftungen: { en: { name: Invoice, erkennbarAn: Contains invoice number } }',
  '  felder:',
  '    - { key: nr, label: Rechnungsnummer, typ: text, wiederfinden: true }',
  '    - { key: kundennummer, label: Kundennummer, typ: text, erkennung: {} }',
  '    - { key: name, label: Name, typ: text, erkennung: {}, wiederfinden: false }',
  '    - { key: notiz, label: Notiz, typ: text }',
  '  register:', '    - { key: daten, name: Daten, art: felder, felder: [nr, kundennummer, name, notiz] }', '    - { key: dokumente, name: Dokumente, art: dokumente }',
  '- schluessel: merkzettel', '  name: Merkzettel', '  ausPost: false', '  unbekannt: egal',
  '  felder:', '    - { key: titel, label: Titel, typ: text }',
  '  register:', '    - { key: daten, name: Daten, art: felder, felder: [titel] }', '    - { key: dokumente, name: Dokumente, art: dokumente }',
];

function paketFaelle(pg: boolean) {
  describe(`Pakete: ausPost, erkennbarAn, wiederfinden (#937, #938)${pg ? ' – PostgreSQL' : ''}`, { skip: pg && !process.env.TEST_DATABASE_URL && 'ohne TEST_DATABASE_URL' }, () => {
    async function repo(): Promise<Repo> {
      if (!pg) return speicherRepo();
      const { pgRepo } = await import('../src/repo-pg');
      const db = await eigeneDatenbank('x937');
      await db.sql`INSERT INTO haushalte (id, name) VALUES ('00000000-0000-4000-8000-000000000001', 'Test') ON CONFLICT DO NOTHING`;
      await db.sql`INSERT INTO benutzer (id, haushalt_id, email, name, rolle) VALUES ('00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-000000000001', 'lena@example.org', 'Lena', 'admin')`;
      return pgRepo(db.sql, '00000000-0000-4000-8000-000000000001') as never;
    }
    const ICH = { id: '00000000-0000-4000-8000-0000000000aa', email: 'lena@example.org' };

    it('liest die Angaben (unbekannte Felder egal), installiert, aktualisiert nur, wo nichts eingestellt ist, exportiert', async () => {
      const gelesen = liesPaket(new Map(Object.entries(paket('1.0.0', RECHNUNG_10)).map(([k, v]) => [k, Buffer.from(v)])));
      assert.deepEqual([gelesen.typen[0].erkennbarAn, gelesen.typen[0].ausPost, gelesen.typen[1].ausPost], ['Enthält Rechnungsnummer, Betrag und Zahlungsziel', undefined, false]);

      const update = RECHNUNG_10.map((z) => z
        .replace('  erkennbarAn: Enthält Rechnungsnummer, Betrag und Zahlungsziel', '  erkennbarAn: Neuer Text aus dem Paket\n  ausPost: false')
        .replace('{ key: notiz, label: Notiz, typ: text }', '{ key: notiz, label: Notiz, typ: text, wiederfinden: true }'))
        .map((z) => z.replace('  ausPost: false\n  ausPost: false', '  ausPost: false'));
      const d = new Dienst(await repo(), speicherDateien(), { einstellungen: speicherEinstellungen() });
      const p = new Paketverwaltung(d, { version: () => '0.216.2', abruf: katalog([paket('1.0.0', RECHNUNG_10), paket('1.1.0', update)]), katalogUrl: KATALOG });
      const inst = await p.installiere({ id: 'haushalt_test', version: '1.0.0' }, ICH);
      const holen = async (s: string) => (await d.mappentypen.listeTypen()).find((t) => t.id === inst.typen[s])!;
      const r = await holen('rechnung');
      assert.deepEqual([r.ausPost, kannAusPost(r), r.erkennbarAn, r.beschriftungen?.en?.erkennbarAn], [null, true, 'Enthält Rechnungsnummer, Betrag und Zahlungsziel', 'Contains invoice number']);
      const wf = (t: Mappentyp) => Object.fromEntries(t.felder.map((f) => [f.key, !!f.wiederfinden]));
      assert.deepEqual(wf(r), { nr: true, kundennummer: true, name: false, notiz: false }, 'ohne Angabe wie bisher aus „Aus Dokument füllen“, ausdrücklich false bleibt aus');
      const m = await holen('merkzettel');
      assert.deepEqual([m.ausPost, kannAusPost(m)], [false, false]);

      // Update: erkennbarAn hat der Administrator geleert → Paket darf; ausPost null → Paket darf; notiz bekommt den Haken.
      const vorschau = await p.vorschau({ id: 'haushalt_test' });
      assert.deepEqual(vorschau.typen.find((t) => t.schluessel === 'rechnung')!.wiederfinden, ['Notiz']);
      assert.equal(vorschau.typen.find((t) => t.schluessel === 'rechnung')!.typAngaben, true);
      await d.mappentypen.aendereTyp(r.id, { ...r, felder: r.felder.map((f) => (f.key === 'kundennummer' ? { ...f, wiederfinden: false } : f)) });
      await p.aktualisiere('haushalt_test', {}, ICH);
      const r2 = await holen('rechnung');
      assert.deepEqual([r2.ausPost, r2.erkennbarAn], [false, 'Enthält Rechnungsnummer, Betrag und Zahlungsziel'], 'erkennbarAn war eingestellt und bleibt; ausPost war Vorgabe und kommt aus dem Paket');
      assert.deepEqual(wf(r2), { nr: true, kundennummer: false, name: false, notiz: true }, 'abgewählter Haken bleibt aus');

      // Paket erstellen exportiert beide Angaben und den Haken (false ausdrücklich, wo er sonst abgeleitet würde).
      const typen = await d.mappentypen.listeTypen();
      const bau = baue({ typen: [r2.id], sichten: [], beispiele: [], id: 'eigenes', name: 'Eigenes', version: '1.0.0', beschreibung: 'Ein Paket zum Testen der neuen Angaben.', autor: { name: 'Lena', github: 'lena' }, lizenz: 'MIT', dms: '>=0.113.0', aenderungen: '' },
        { typen, sichten: [], pakete: [], dmsTypen: new Map(), mappen: [], dmsVersion: '0.216.2', entwurf: null, jetzt: new Date('2026-11-07T12:00:00Z') });
      assert.deepEqual(bau.probleme, []);
      const datei = bau.dateien.find((x) => x.name.endsWith('mappentypen.yaml'));
      assert.ok(datei, bau.dateien.map((x) => x.name).join(', '));
      const yaml = parse(datei.daten.toString()) as Array<Record<string, unknown>>;
      assert.deepEqual([yaml[0].ausPost, yaml[0].erkennbarAn], [false, 'Enthält Rechnungsnummer, Betrag und Zahlungsziel']);
      const felder = Object.fromEntries((yaml[0].felder as Array<Record<string, unknown>>).map((f) => [f.key, f.wiederfinden]));
      assert.deepEqual(felder, { nr: true, kundennummer: false, name: false, notiz: true });
    });
  });
}
paketFaelle(false);
paketFaelle(true);

describe('Migration 089 (#938): „Für die Erkennung nutzen“ → „Zum Wiederfinden nutzen“, ohne Datenverlust', { skip: !process.env.TEST_DATABASE_URL && 'ohne TEST_DATABASE_URL' }, () => {
  it('setzt den Haken an den Feldern, über die Ablago bisher Mappen wiederfand; erkennung bleibt unverändert', async () => {
    const { migriere } = await import('../src/db');
    const { readdirSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const ordner = fileURLToPath(new URL('../migrations', import.meta.url));
    // Bis 088 migrieren, alte Daten anlegen, dann 089.
    const db = await eigeneDatenbank('x937m', { migrieren: false });
    const { mkdtempSync, copyFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const { tmpdir } = await import('node:os');
    const vorher = mkdtempSync(join(tmpdir(), 'x937-mig-'));
    for (const n of readdirSync(ordner).filter((x) => x.endsWith('.sql') && x < '089')) copyFileSync(join(ordner, n), join(vorher, n));
    await migriere(db.sql, vorher, () => {});
    await db.sql`INSERT INTO haushalte (id, name) VALUES ('00000000-0000-4000-8000-000000000001', 'Test') ON CONFLICT DO NOTHING`;
    const felder = [
      { key: 'name', label: 'Name', typ: 'text', erkennung: {} },
      { key: 'kundennummer', label: 'Kundennummer', typ: 'text', erkennung: { art: 'nummer', hinweis: 'oben rechts' } },
      { key: 'konto', label: 'Konto', typ: 'text', format: 'iban', erkennung: {} },
      { key: 'ort', label: 'Ort', typ: 'text', erkennung: {} },
      { key: 'hausnummer', label: 'Hausnummer', typ: 'text', erkennung: {} },
      { key: 'notiz', label: 'Notiz', typ: 'langtext', erkennung: {} },
      { key: 'vertragsnummer', label: 'Vertragsnummer', typ: 'text' },
    ];
    await db.sql`INSERT INTO mappentypen (id, haushalt_id, name, beschreibung, titel_vorlage, felder, register, trefferlisten) VALUES ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-000000000001', 'Vertragspartner', '', '', ${db.sql.json(felder)}, '[]', '[]')`;
    await migriere(db.sql, ordner, () => {});
    const [r] = await db.sql`SELECT felder, aus_post, erkennbar_an FROM mappentypen WHERE id = '00000000-0000-4000-8000-0000000000b1'`;
    const neu = r.felder as Array<Record<string, unknown>>;
    assert.deepEqual(Object.fromEntries(neu.map((f) => [f.key, f.wiederfinden ?? false])), { name: true, kundennummer: true, konto: true, ort: false, hausnummer: false, notiz: false, vertragsnummer: false });
    assert.deepEqual(neu.map(({ wiederfinden: _w, ...f }) => f), felder, 'sonst unverändert, Reihenfolge bleibt');
    // Dieselbe Regel wie im Code (Pakete ohne die Angabe).
    for (const f of felder) assert.equal(!!neu.find((x) => x.key === f.key)!.wiederfinden, wiederfindenVorgabe(f as Feld), f.key);
    assert.deepEqual([r.aus_post, r.erkennbar_an], [null, '']);
    await db.ende();
  });
});
