/**
 * Darstellung eines Mappentyps (#890, #655): Abschnitte im Feldregister (Umbruch, Überschrift, eingeklappt) und
 * Felder und Register ausblenden statt löschen – Modell, Speichern, Prüfen, Pakete, API.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { describe, it } from 'node:test';
import { parse } from 'yaml';
import { abschnittEinstellung, abschnittId, ausgeblendeteFelder, bereinigeAbschnitte, feldVerwendung, gruppiere, registerAusblendbar, sichtbareFelder } from '../../shared/src/darstellung';
import { abschnittTitel, beschriftungsstand } from '../../shared/src/beschriftung';
import { fuellfelder } from '../../shared/src/erkennung';
import { pruefeMappentyp, type Mappentyp } from '../../shared/src/model';
import { typBild, typUnterschiede } from '../../shared/src/typvergleich';
import { openapi } from '../src/api-v1';
import { speicherDateien } from '../src/dateispeicher';
import { bereinigeTyp, Dienst } from '../src/dienst';
import { speicherEinstellungen } from '../src/einstellungen';
import { Fachfehler } from '../src/fehler';
import { Konten } from '../src/konten';
import { speicherKontoRepo } from '../src/konto-repo';
import { liesPaket, Paketverwaltung } from '../src/pakete';
import { aenderung, baue } from '../src/paketerstellung';
import type { Repo } from '../src/repo';
import { speicherRepo } from '../src/repo-speicher';
import { zipPuffer } from '../src/zip';
import { eigeneDatenbank } from './hilfe-db';

const DOK = { key: 'dokumente', name: 'Dokumente', art: 'dokumente' };
/** Person wie im Issue: Anrede, Titel, Vorname, Nachname – Geburtstag in der nächsten Zeile – Bankverbindung eingeklappt. */
const PERSON = {
  name: 'Person',
  felder: [
    { key: 'anrede', label: 'Anrede', typ: 'text' }, { key: 'titel', label: 'Titel', typ: 'text' },
    { key: 'vorname', label: 'Vorname', typ: 'text' }, { key: 'nachname', label: 'Nachname', typ: 'text', pflicht: true },
    { key: 'geburtstag', label: 'Geburtstag', typ: 'datum' },
    { key: 'iban', label: 'IBAN', typ: 'text', erkennung: {} }, { key: 'bic', label: 'BIC', typ: 'text' }, { key: 'bank', label: 'Bank', typ: 'text' },
  ],
  register: [
    { key: 'stammdaten', name: 'Stammdaten', art: 'felder', felder: ['anrede', 'titel', 'vorname', 'nachname', 'geburtstag', 'iban', 'bic', 'bank'],
      abschnitte: [{ vor: 'geburtstag' }, { vor: 'iban', titel: 'Bankverbindung', eingeklappt: true, beschriftungen: { en: { titel: 'Bank details' } } }] },
    DOK,
  ],
};
const neuerDienst = (repo: Repo = speicherRepo()) => new Dienst(repo, speicherDateien(), { einstellungen: speicherEinstellungen() });

describe('Abschnitte im Feldregister (#890)', () => {
  it('Datenmodell: optional neben der Feldliste; ungültige Angaben fallen weg, Titel übersetzbar (#728)', () => {
    const d = bereinigeTyp(PERSON);
    const r = d.register[0];
    assert.deepEqual(r.felder, PERSON.felder.map((f) => f.key), 'die Feldliste bleibt');
    assert.deepEqual(r.abschnitte, [{ vor: 'geburtstag' }, { vor: 'iban', titel: 'Bankverbindung', eingeklappt: true, beschriftungen: { en: { titel: 'Bank details' } } }]);
    assert.equal(abschnittTitel(r.abschnitte![1], 'en'), 'Bank details');
    assert.equal(abschnittTitel(r.abschnitte![1], 'de'), 'Bankverbindung');
    assert.equal(d.register[1].abschnitte, undefined, 'nur Feldregister');
    // Bestehende Typen ohne Abschnitte bleiben, wie sie sind.
    assert.equal(bereinigeTyp({ ...PERSON, register: [{ ...PERSON.register[0], abschnitte: undefined }, DOK] }).register[0].abschnitte, undefined);
    assert.deepEqual(bereinigeAbschnitte([
      { vor: 'fremd', titel: 'Fehlt' }, { vor: 'b' }, { vor: 'b', titel: 'doppelt' }, { vor: 'a', eingeklappt: true }, 'kein Objekt', { vor: 'c', titel: 'x'.repeat(200), eingeklappt: 'ja' },
    ], ['a', 'b', 'c']), [{ vor: 'a' }, { vor: 'b' }, { vor: 'c', titel: 'x'.repeat(80) }], 'nur eigene Felder, je Feld einer, eingeklappt nur mit Titel, Reihenfolge der Felder');
    assert.equal(bereinigeAbschnitte('nein', ['a']), undefined);
    // Beschriftungsstand (#728) zählt die Überschriften mit.
    assert.deepEqual(beschriftungsstand({ ...d, trefferlisten: [] }, 'en'), { vorhanden: 1, gesamt: 1 + 8 + 2 + 1 });
  });

  it('Gruppen: jeder Abschnitt beginnt eine neue; vor ausgeblendeten Feldern wandert er zum nächsten sichtbaren', () => {
    const felder = PERSON.felder;
    const r = bereinigeTyp(PERSON).register[0];
    const g = gruppiere(r.abschnitte, felder);
    assert.deepEqual(g.map((x) => [x.abschnitt?.titel ?? (x.abschnitt ? '–' : null), x.felder.map((f) => f.key)]), [
      [null, ['anrede', 'titel', 'vorname', 'nachname']], ['–', ['geburtstag']], ['Bankverbindung', ['iban', 'bic', 'bank']],
    ]);
    // Geburtstag und IBAN ausgeblendet: Umbruch und Überschrift treffen sich vor BIC – die Überschrift gewinnt.
    const ohne = gruppiere(r.abschnitte, felder, (f) => f.key !== 'geburtstag' && f.key !== 'iban');
    assert.deepEqual(ohne.map((x) => [x.abschnitt?.titel ?? null, x.felder.map((f) => f.key)]), [[null, ['anrede', 'titel', 'vorname', 'nachname']], ['Bankverbindung', ['bic', 'bank']]]);
    // Abschnitt am Ende ohne sichtbares Feld fällt weg; vor dem ersten Feld gibt es keine leere Gruppe.
    assert.deepEqual(gruppiere([{ vor: 'a', titel: 'Oben' }, { vor: 'b', titel: 'Weg' }], [{ key: 'a' }, { key: 'b' }], (f) => f.key === 'a').map((x) => x.abschnitt?.titel), ['Oben']);
    assert.equal(abschnittId('stammdaten', { vor: 'iban' }), 'stammdaten.iban');
  });

  it('Merken je Person: persönliche Einstellung je Mappentyp (auf dem Server, nicht nur im Browser)', async () => {
    const d = neuerDienst();
    const konten = new Konten(speicherKontoRepo(), null, 'http://nas', d.systemtypen.benutzerspiegel());
    const { benutzer: lena } = await konten.einrichten({ email: 'lena@example.org', name: 'Lena', passwort: 'ein-langes-passwort' });
    const t = await d.mappentypen.legeTypAn(PERSON);
    await konten.setzeEinstellung(lena, abschnittEinstellung(t.id), { [abschnittId('stammdaten', { vor: 'iban' })]: true });
    assert.deepEqual((await konten.einstellungen(lena))[abschnittEinstellung(t.id)], { 'stammdaten.iban': true });
  });

  it('nur Darstellung: Werte, Prüfung und Felder ändern sich nicht', async () => {
    const d = neuerDienst();
    const t = await d.mappentypen.legeTypAn(PERSON);
    await assert.rejects(d.legeMappeAn({ typId: t.id, werte: { vorname: 'Lena' } }), (e) => e instanceof Fachfehler && e.status === 422, 'Pflicht im eingeklappten Abschnitt gilt weiter');
    const m = await d.legeMappeAn({ typId: t.id, werte: { nachname: 'Beispiel', iban: 'DE02120300000000202051' } });
    assert.equal(m.werte.iban, 'DE02120300000000202051');
  });
});

describe('Felder und Register ausblenden (#655)', () => {
  it('ausblenden hebt Pflicht auf; Register: nicht Dokumente, nicht mit Systemfeldern, eines bleibt sichtbar', () => {
    const d = bereinigeTyp({ ...PERSON, felder: PERSON.felder.map((f) => (f.key === 'nachname' ? { ...f, ausgeblendet: true } : f)) });
    const nachname = d.felder.find((f) => f.key === 'nachname')!;
    assert.deepEqual([nachname.ausgeblendet, nachname.pflicht], [true, false]);
    assert.equal(d.felder.find((f) => f.key === 'vorname')!.ausgeblendet, undefined, 'nur gespeichert, wenn an');
    const r = bereinigeTyp({ name: 'X', felder: [{ key: 'a', label: 'A', typ: 'text', pflicht: true }, { key: 'b', label: 'B', typ: 'text' }],
      register: [{ key: 'eins', name: 'Eins', art: 'felder', felder: ['b'] }, { key: 'zwei', name: 'Zwei', art: 'felder', felder: ['a'], ausgeblendet: true }, { ...DOK, ausgeblendet: true }] });
    assert.deepEqual(r.register.map((x) => !!x.ausgeblendet), [false, true, false], 'Dokumentenregister lassen sich nicht ausblenden');
    assert.equal(r.felder[0].pflicht, false, 'Feld auf ausgeblendetem Register ist nie Pflicht');
    assert.deepEqual([...ausgeblendeteFelder(r)], ['a']);
    assert.deepEqual(sichtbareFelder(r).map((f) => f.key), ['b']);
    assert.equal(registerAusblendbar({ art: 'felder', felder: ['s'] }, [{ key: 's', system: true }]), false);
    const alle = bereinigeTyp({ name: 'Y', felder: [], register: [{ key: 'a', name: 'A', art: 'felder', ausgeblendet: true }] });
    const p = pruefeMappentyp(alle, { namenAndererTypen: [], existiertTyp: () => true });
    assert.ok(p.allgemein.some((x) => /sichtbar/.test(x)), p.allgemein.join(' '));
  });

  it('Werte bleiben; Ausblenden und Abschnitte bleiben ohne Nennung (ältere Programme), Konfliktschutz (#917) gilt', async () => {
    const d = neuerDienst();
    const t = await d.mappentypen.legeTypAn(PERSON);
    const m = await d.legeMappeAn({ typId: t.id, werte: { nachname: 'Beispiel', bic: 'GENODEF1S12' } });
    const t2 = await d.mappentypen.aendereTyp(t.id, { ...t, felder: t.felder.map((f) => (f.key === 'bic' || f.key === 'nachname' ? { ...f, ausgeblendet: true } : f)), stand: t.geaendert });
    assert.deepEqual(t2.felder.filter((f) => f.ausgeblendet).map((f) => [f.key, f.pflicht]), [['nachname', false], ['bic', false]]);
    assert.equal((await d.holeMappe(m.id)).mappe.werte.bic, 'GENODEF1S12', 'Werte bleiben gespeichert');
    // Älteres Programm über die API: ohne ausgeblendet und abschnitte gespeichert – nichts geht verloren.
    const t3 = await d.mappentypen.aendereTyp(t.id, { ...t2, beschreibung: 'neu', felder: t2.felder.map(({ ausgeblendet: _a, ...f }) => f), register: t2.register.map(({ abschnitte: _x, ...r }) => r) });
    assert.deepEqual(t3.felder.filter((f) => f.ausgeblendet).map((f) => f.key), ['nachname', 'bic']);
    assert.deepEqual(t3.register[0].abschnitte?.map((a) => a.vor), ['geburtstag', 'iban']);
    // Wieder einblenden: ausdrücklich false; Abschnitte ausdrücklich leer.
    const t4 = await d.mappentypen.aendereTyp(t.id, { ...t3, felder: t3.felder.map((f) => ({ ...f, ausgeblendet: false })), register: t3.register.map((r) => ({ ...r, abschnitte: [] })), stand: t3.geaendert });
    assert.deepEqual([t4.felder.some((f) => f.ausgeblendet), t4.register[0].abschnitte], [false, undefined]);
    assert.equal(t4.felder.find((f) => f.key === 'nachname')!.pflicht, false, 'Pflicht kommt nicht von selbst zurück');
    await assert.rejects(d.mappentypen.aendereTyp(t.id, { ...t4, felder: t4.felder.map((f) => ({ ...f, ausgeblendet: true })), stand: t3.geaendert }), (e) => e instanceof Fachfehler && e.status === 409);
    // Das Dokumentenregister bleibt sichtbar; ohne es muss ein anderes Register sichtbar bleiben.
    const t5 = await d.mappentypen.aendereTyp(t.id, { ...t4, register: t4.register.map((r) => ({ ...r, ausgeblendet: true })) });
    assert.deepEqual(t5.register.map((r) => !!r.ausgeblendet), [true, false]);
    const nur = await d.mappentypen.legeTypAn({ name: 'Notiz', felder: [{ key: 'text', label: 'Text', typ: 'text' }], register: [{ key: 'daten', name: 'Daten', art: 'felder' }, { key: 'verlauf', name: 'Verlauf', art: 'protokoll' }] });
    await assert.rejects(d.mappentypen.aendereTyp(nur.id, { ...nur, register: nur.register.map((r) => ({ ...r, ausgeblendet: true })) }), (e) => e instanceof Fachfehler && e.status === 422, 'ein Register muss sichtbar bleiben');
  });

  it('unverändert Ungültiges in ausgeblendeten Feldern hält das Speichern nicht auf; Neues wird geprüft', async () => {
    const d = neuerDienst();
    const t = await d.mappentypen.legeTypAn({ name: 'Vertrag', felder: [{ key: 'nr', label: 'Nr', typ: 'text' }, { key: 'alt', label: 'Altes Kürzel', typ: 'text' }], register: [{ key: 'daten', name: 'Daten', art: 'felder' }, DOK] });
    const m = await d.legeMappeAn({ typId: t.id, werte: { nr: 'WV-1043', alt: 'ABCDEF' } });
    const t2 = await d.mappentypen.aendereTyp(t.id, { ...t, felder: t.felder.map((f) => (f.key === 'alt' ? { ...f, maxLen: 3, ausgeblendet: true } : f)) });
    const m2 = await d.aendereMappe(m.id, { werte: { ...m.werte, nr: 'WV-1044' } });
    assert.deepEqual([m2.werte.nr, m2.werte.alt], ['WV-1044', 'ABCDEF']);
    await assert.rejects(d.aendereMappe(m.id, { werte: { ...m2.werte, alt: 'GHIJKL' } }), (e) => e instanceof Fachfehler && e.status === 422, 'über die API geänderte Werte prüft Ablago weiter');
    assert.ok(t2.felder.find((f) => f.key === 'alt')!.ausgeblendet);
  });

  it('Systemtypen: Systemfelder und ihre Register lassen sich nicht ausblenden, eigene Felder schon', async () => {
    const d = neuerDienst();
    await d.postTyp();
    const post = (await d.mappentypen.listeTypen()).find((x) => x.system === 'post')!;
    const eigen = { key: 'notiz_x', label: 'Notiz', typ: 'text' };
    const reg = post.register.map((r) => ({ ...r, ausgeblendet: r.art === 'felder' }));
    const p2 = await d.mappentypen.aendereTyp(post.id, { ...post, felder: [...post.felder.map((f) => ({ ...f, ausgeblendet: true })), { ...eigen, ausgeblendet: true }], register: [...reg, { key: 'extra', name: 'Extra', art: 'felder', felder: ['notiz_x'], ausgeblendet: true }] });
    assert.deepEqual(p2.felder.filter((f) => f.ausgeblendet).map((f) => f.key), ['notiz_x']);
    assert.deepEqual(p2.register.filter((r) => r.ausgeblendet).map((r) => r.key), ['extra']);
  });

  it('nicht für „Aus Dokument ausfüllen“; Hinweis, wo das Feld noch genutzt wird', () => {
    const t = { ...bereinigeTyp(PERSON), id: 't1' } as Mappentyp;
    assert.ok(fuellfelder(t).some((x) => x.feld.key === 'iban'));
    assert.ok(!fuellfelder({ ...t, felder: t.felder.map((f) => (f.key === 'iban' ? { ...f, ausgeblendet: true } : f)) }).some((x) => x.feld.key === 'iban'));
    assert.ok(!fuellfelder({ ...t, register: t.register.map((r) => ({ ...r, ausgeblendet: r.art === 'felder' })) }).length, 'auch über das Register');
    const typ = {
      ...t, titelVorlage: '{vorname} {nachname}', trefferlisten: [{ key: 'standard', name: 'Standard', spalten: ['nachname', 'geburtstag'], standard: true }],
      felder: t.felder.map((f) => (f.key === 'geburtstag' ? { ...f, frist: { vorlauf: 7, einheit: 'tage', empfaengerFeld: null, text: '', wiederholung: 12 } } : f)) as Mappentyp['felder'],
      archiv: { jahre: 10, stichtag: 'geburtstag' },
      berechtigungen: { grund: { C: true, R: true, U: true, D: true, P: true }, regeln: [{ id: 'r', name: 'Nur Familie', wenn: [{ art: 'feld', bedingung: { art: 'feld', feld: 'nachname', op: 'gleich', wert: { art: 'fest', wert: 'Beispiel' } } }], dann: { R: 'erlauben' }, stopp: false }] },
    } as unknown as Mappentyp;
    const sichten = [{ name: 'Geburtstage', typen: ['t1'], bedingungen: [{ art: 'frist', feld: 'geburtstag', tage: 30 }] }, { name: 'Andere', typen: ['t2'], bedingungen: [{ art: 'feld', feld: 'geburtstag', op: 'leer' }] }] as never;
    assert.deepEqual(feldVerwendung(typ, 'nachname', sichten), ['Titel der Mappe', 'Trefferliste „Standard“', 'Berechtigung „Nur Familie“']);
    assert.deepEqual(feldVerwendung(typ, 'geburtstag', sichten), ['Trefferliste „Standard“', 'Ansicht „Geburtstage“', 'Frist', 'Stichtag im Archivmodus']);
    assert.deepEqual(feldVerwendung(typ, 'iban', sichten), ['Aus Dokument füllen']);
    assert.deepEqual(feldVerwendung(typ, 'bic', sichten), []);
  });

  it('Paketvergleich (#653): Ausblenden und Abschnitte zählen als eigene Änderung', () => {
    const t = { ...bereinigeTyp(PERSON), id: 't1', erstellt: '', geaendert: '' } as Mappentyp;
    const u = typUnterschiede(typBild(t), typBild({ ...t, felder: t.felder.map((f) => (f.key === 'bic' ? { ...f, ausgeblendet: true } : f)), register: t.register.map((r) => ({ ...r, abschnitte: undefined, ausgeblendet: r.art === 'felder' ? undefined : r.ausgeblendet })) }));
    assert.ok(u && u.liste.some((x) => /BIC/.test(x) && /ausgeblendet/.test(x)) && u.liste.some((x) => /Abschnitte/.test(x)), u?.liste.join(' | '));
    assert.equal(typUnterschiede(typBild(t), typBild(t)), null);
  });

  it('API v1 beschreibt Abschnitte und Ausblenden', () => {
    const s = JSON.stringify(openapi('0.0.0'));
    for (const k of ['"abschnitte"', '"ausgeblendet"', '"eingeklappt"', '"vor"']) assert.ok(s.includes(k), k);
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
  'manifest.yaml': `schema: 1\nid: basis_test\nname: Basis\nversion: ${version}\nbeschreibung: Test.\nautor: { name: Test, github: test }\nlizenz: MIT\ndms: ">=0.60.0"\ninhalt:\n  mappentypen: inhalt/mappentypen.yaml\n`,
  'inhalt/mappentypen.yaml': [...typ, ''].join('\n'),
});
/** Organisation wie in Basis: Stammdaten und Kontakt; Version 1.0 ohne Abschnitte. */
const ORGANISATION_10 = [
  '- schluessel: organisation', '  name: Organisation', '  beschreibung: Firma, Amt, Praxis',
  '  felder:',
  '    - { key: name, label: Name, typ: text, pflicht: true }',
  '    - { key: art, label: Art, typ: text }',
  '    - { key: handelsregister, label: Handelsregister, typ: text, pflicht: true }',
  '    - { key: telefon, label: Telefon, typ: text }',
  '    - { key: email, label: E-Mail, typ: text }',
  '  register:',
  '    - { key: stammdaten, name: Stammdaten, art: felder, felder: [name, art, handelsregister] }',
  '    - { key: kontakt, name: Kontakt, art: felder, felder: [telefon, email] }',
  '    - { key: dokumente, name: Dokumente, art: dokumente }',
];
/** Version 1.1: Abschnitte in beiden Registern, ein neues Feld (im Paket ausgeblendet), Ausblenden am Handelsregister. */
const ORGANISATION_11 = ORGANISATION_10
  .map((z) => z.replace('{ key: handelsregister, label: Handelsregister, typ: text, pflicht: true }', '{ key: handelsregister, label: Handelsregister, typ: text, ausgeblendet: false }'))
  .map((z) => z.replace('    - { key: email, label: E-Mail, typ: text }', '    - { key: email, label: E-Mail, typ: text }\n    - { key: fax, label: Fax, typ: text, ausgeblendet: true }'))
  .map((z) => z.replace('felder: [name, art, handelsregister] }', 'felder: [name, art, handelsregister], abschnitte: [{ vor: handelsregister, titel: Register, eingeklappt: true, beschriftungen: { en: { titel: Registry } } }] }'))
  .map((z) => z.replace('felder: [telefon, email] }', 'felder: [telefon, email, fax], abschnitte: [{ vor: email, titel: Online }] }'));

function paketFaelle(pg: boolean) {
  describe(`Pakete: Abschnitte und Ausblenden (#890, #655)${pg ? ' – PostgreSQL' : ''}`, { skip: pg && !process.env.TEST_DATABASE_URL && 'ohne TEST_DATABASE_URL' }, () => {
    async function repo(): Promise<Repo> {
      if (!pg) return speicherRepo();
      const { pgRepo } = await import('../src/repo-pg');
      const db = await eigeneDatenbank('x890');
      await db.sql`INSERT INTO haushalte (id, name) VALUES ('00000000-0000-4000-8000-000000000001', 'Test') ON CONFLICT DO NOTHING`;
      await db.sql`INSERT INTO benutzer (id, haushalt_id, email, name, rolle) VALUES ('00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-000000000001', 'markus@example.org', 'Markus', 'admin')`;
      return pgRepo(db.sql, '00000000-0000-4000-8000-000000000001') as never;
    }
    const ICH = { id: '00000000-0000-4000-8000-0000000000aa', email: 'markus@example.org' };

    it('Update hebt das Ausblenden nicht auf; Neues kommt sichtbar; Abschnitte nur, wo keine sind; Paket erstellen exportiert', async () => {
      const d = neuerDienst(await repo());
      const p = new Paketverwaltung(d, { version: () => '0.217.0', abruf: katalog([paket('1.0.0', ORGANISATION_10), paket('1.1.0', ORGANISATION_11)]), katalogUrl: KATALOG });
      const inst = await p.installiere({ id: 'basis_test', version: '1.0.0' }, ICH);
      const holen = async () => (await d.mappentypen.listeTypen()).find((t) => t.id === inst.typen.organisation)!;
      const o = await holen();
      const m = await d.legeMappeAn({ typId: o.id, werte: { name: 'Stadtwerke Musterstadt', handelsregister: 'HRB 4711' } });
      // Markus blendet das Handelsregister aus (Pflicht fällt weg) und gliedert „Kontakt“ selbst.
      const o2 = await d.mappentypen.aendereTyp(o.id, {
        ...o, felder: o.felder.map((f) => (f.key === 'handelsregister' ? { ...f, ausgeblendet: true } : f)),
        register: o.register.map((r) => (r.key === 'kontakt' ? { ...r, abschnitte: [{ vor: 'telefon', titel: 'Erreichbar' }] } : r)),
      });
      assert.deepEqual(o2.felder.filter((f) => f.ausgeblendet).map((f) => [f.key, f.pflicht]), [['handelsregister', false]]);

      const vorschau = await p.vorschau({ id: 'basis_test' });
      assert.deepEqual(vorschau.typen[0].abschnitte, ['Stammdaten'], 'nur das Register ohne eigene Abschnitte');
      await p.aktualisiere('basis_test', {}, ICH);
      const o3 = await holen();
      const f = (k: string) => o3.felder.find((x) => x.key === k)!;
      assert.deepEqual([f('handelsregister').ausgeblendet, f('handelsregister').pflicht], [true, false], 'Ausblenden bleibt, Pflicht kommt nicht zurück');
      assert.equal(f('fax').ausgeblendet, undefined, 'was ein Update neu bringt, ist sichtbar');
      const reg = (k: string) => o3.register.find((r) => r.key === k)!;
      assert.deepEqual(reg('stammdaten').abschnitte, [{ vor: 'handelsregister', titel: 'Register', eingeklappt: true, beschriftungen: { en: { titel: 'Registry' } } }]);
      assert.deepEqual(reg('kontakt').abschnitte, [{ vor: 'telefon', titel: 'Erreichbar' }], 'eigene Abschnitte bleiben');
      assert.deepEqual(reg('kontakt').felder, ['telefon', 'email', 'fax']);
      assert.equal((await d.holeMappe(m.id)).mappe.werte.handelsregister, 'HRB 4711', 'Werte bleiben');
      // Paketstand (#653): Die Abschnitte aus dem Update gehören dazu – eigene Änderungen sind nur Ausblenden und „Kontakt“.
      const ip = (await p.installierte()).find((x) => x.id === 'basis_test')!;
      const u = aenderung(o3, ip).unterschiede;
      assert.ok(u, 'eigene Änderungen');
      assert.ok(u.liste.some((x) => /Handelsregister/.test(x) && /ausgeblendet/.test(x)), u.liste.join(' | '));
      assert.ok(u.liste.some((x) => /Kontakt/.test(x)), u.liste.join(' | '));
      assert.ok(!u.liste.some((x) => /Stammdaten/.test(x)), `Abschnitte aus dem Update zählen nicht als eigene: ${u.liste.join(' | ')}`);

      // Paket erstellen: Abschnitte und Ausblenden kommen mit; ältere Ablago ignorieren beides.
      const bau = baue({ typen: [o3.id], sichten: [], beispiele: [], id: 'eigenes', name: 'Eigenes', version: '1.0.0', beschreibung: 'Ein Paket zum Testen der Darstellung.', autor: { name: 'Markus', github: 'markus' }, lizenz: 'MIT', dms: '>=0.113.0', aenderungen: '' },
        { typen: await d.mappentypen.listeTypen(), sichten: [], pakete: [], dmsTypen: new Map(), mappen: [], dmsVersion: '0.217.0', entwurf: null, jetzt: new Date('2026-11-08T12:00:00Z') });
      const datei = bau.dateien.find((x) => x.name.endsWith('mappentypen.yaml'))!;
      const yaml = parse(datei.daten.toString()) as Array<{ felder: Array<Record<string, unknown>>; register: Array<Record<string, unknown>> }>;
      assert.equal(yaml[0].felder.find((x) => x.key === 'handelsregister')!.ausgeblendet, true);
      assert.deepEqual(yaml[0].register.find((x) => x.key === 'kontakt')!.abschnitte, [{ vor: 'telefon', titel: 'Erreichbar' }]);
      assert.deepEqual(yaml[0].register.find((x) => x.key === 'stammdaten')!.abschnitte, [{ vor: 'handelsregister', titel: 'Register', eingeklappt: true, beschriftungen: { en: { titel: 'Registry' } } }]);
      // Und zurück: Das erstellte Paket liest Ablago wieder, mit beidem.
      const gelesen = liesPaket(new Map(bau.dateien.map((x) => [x.name, x.daten] as const)));
      assert.equal(gelesen.typen[0].register.find((r) => r.key === 'kontakt')!.abschnitte !== undefined, true);
    });

    it('Installation übernimmt Abschnitte und Ausblenden des Pakets', async () => {
      const d = neuerDienst(await repo());
      const p = new Paketverwaltung(d, { version: () => '0.217.0', abruf: katalog([paket('1.1.0', ORGANISATION_11)]), katalogUrl: KATALOG });
      const inst = await p.installiere({ id: 'basis_test', version: '1.1.0' }, ICH);
      const o = (await d.mappentypen.listeTypen()).find((t) => t.id === inst.typen.organisation)!;
      assert.equal(o.felder.find((f) => f.key === 'fax')!.ausgeblendet, true);
      assert.deepEqual(o.register.find((r) => r.key === 'kontakt')!.abschnitte, [{ vor: 'email', titel: 'Online' }]);
    });
  });
}
paketFaelle(false);
paketFaelle(true);
