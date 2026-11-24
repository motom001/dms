/**
 * Mappentypen als Datei (#1315): Export im Format von „Paket erstellen“ mit Abhängigkeiten und Vorschau der Inhalte;
 * Import mit Vorschau, strenger Prüfung (Ergänzung Sicherheit) und ohne Abschwächen vorhandener Typen. Dazu die
 * Prüfmuster gegen ReDoS – auch für Mappentypen aus Paketen.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { pruefeMappe, pruefeMappentyp } from '../../shared/src/model';
import { MUSTER_EINGABE_MAX, musterProblem } from '../../shared/src/muster';
import type { TypenImportVorschau } from '../../shared/src/typendatei';
import { speicherDateien } from '../src/dateien/dateispeicher';
import { Dienst } from '../src/dienst/dienst';
import { speicherEinstellungen } from '../src/einstellungen/einstellungen';
import { Fachfehler } from '../src/grundlagen/fehler';
import { liesTypenDatei, Paketerstellung, planeEinspielen } from '../src/pakete/erstellung/index';
import { speicherRepo } from '../src/repo/speicher';
import '../src/sprache/sprache';

const ID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
/** Unsichere Muster erst zur Laufzeit zusammensetzen (Q = +, S = *): Als Text im Quellcode hielte CodeQL sie für echte. */
const boese = (m: string) => m.replace(/Q/g, '+').replace(/S/g, '*');

function aufbau() {
  const einstellungen = speicherEinstellungen();
  const d = new Dienst(speicherRepo(), speicherDateien(), { einstellungen });
  return { d, einstellungen, e: new Paketerstellung(d, { version: () => '0.314.0' }) };
}

/** Partner (Auswahl mit Werten, Vorgabewert) und Vertrag (Verweis auf Partner, Pflicht, Muster, Archivmodus). */
async function typen(d: Dienst) {
  const partner = await d.mappentypen.legeTypAn({
    name: 'Vertragspartner',
    schluessel: 'partner',
    titelVorlage: '{name}',
    felder: [
      { key: 'name', label: 'Name', typ: 'text' },
      { key: 'art', label: 'Art', typ: 'auswahl', optionen: ['Strom', 'Gas'], standard: 'Strom' },
    ],
  });
  const vertrag = await d.mappentypen.legeTypAn({
    name: 'Vertrag',
    schluessel: 'vertrag',
    titelVorlage: '{nummer}',
    archiv: { jahre: 10, stichtag: null },
    felder: [
      { key: 'nummer', label: 'Nummer', typ: 'text', pflicht: true, muster: '[A-Z]{2}\\d{4}' },
      { key: 'partner', label: 'Partner', typ: 'referenz', zielTyp: partner.id },
    ],
    register: [
      { key: 'daten', name: 'Daten', art: 'felder' },
      { key: 'belege', name: 'Belege', art: 'dokumente' },
    ],
  });
  return { partner, vertrag };
}

const fachfehler = (status: number, muster: RegExp) => (e: unknown) =>
  e instanceof Fachfehler && e.status === status && muster.test(`${e.message} ${JSON.stringify(e.details ?? {})}`);

describe('Mappentypen als Datei (#1315)', () => {
  it('Export: Format von „Paket erstellen“, keine Ids, Abhängigkeiten genannt, Inhalte in der Vorschau', async () => {
    const { d, e } = aufbau();
    const { partner, vertrag } = await typen(d);
    const nurVertrag = await e.typenExport({ typen: [vertrag.id] });
    assert.deepEqual(nurVertrag.vorschau.probleme, []);
    assert.deepEqual(
      nurVertrag.vorschau.abhaengigkeiten.map((x) => x.kennung),
      ['partner'],
    );
    const datei = JSON.parse(nurVertrag.datei!.inhalt);
    assert.equal(datei.format, 'ablago-mappentypen');
    assert.equal(datei.mappentypen.length, 1);
    assert.equal(datei.mappentypen[0].felder.find((f: { key: string }) => f.key === 'partner').ziel, 'partner');
    assert.deepEqual(datei.abhaengigkeiten.mappentypen, [{ kennung: 'partner', name: 'Vertragspartner' }]);
    assert.ok(!ID.test(nurVertrag.datei!.inhalt), 'keine Ids in der Datei');
    assert.ok(!/berechtigungen/.test(nurVertrag.datei!.inhalt));
    const beide = await e.typenExport({ typen: [vertrag.id, partner.id] });
    assert.deepEqual(beide.vorschau.abhaengigkeiten, []);
    const werte = beide.vorschau.typen.find((x) => x.kennung === 'partner')!.inhalte;
    assert.ok(werte.some((x) => x.art === 'werte' && x.text === 'Strom, Gas'));
    assert.ok(werte.some((x) => x.art === 'vorgabe' && x.text === 'Strom'));
    // Ohne eigene Typen keine Datei.
    const leer = await e.typenExport({ typen: [] });
    assert.equal(leer.datei, null);
    assert.equal(leer.vorschau.probleme.length, 1);
  });

  it('Import in eine andere Installation: Vorschau, Bestätigung derselben Datei, Verweise aufgelöst, für Dienste im Netz gesperrt', async () => {
    const quelle = aufbau();
    const { partner, vertrag } = await typen(quelle.d);
    const inhalt = (await quelle.e.typenExport({ typen: [vertrag.id, partner.id] })).datei!.inhalt;
    const ziel = aufbau();
    // Ohne Partner fehlt die Abhängigkeit.
    const nurVertrag = (await quelle.e.typenExport({ typen: [vertrag.id] })).datei!.inhalt;
    const ohne = await ziel.e.typenVorschau({ inhalt: nurVertrag });
    assert.match(ohne.probleme.join(' '), /„partner“/);
    const v: TypenImportVorschau = await ziel.e.typenVorschau({ inhalt });
    assert.deepEqual(v.probleme, []);
    assert.deepEqual(
      v.typen.map((x) => [x.kennung, x.stand]),
      [
        ['vertrag', 'neu'],
        ['partner', 'neu'],
      ],
    );
    assert.equal((await ziel.d.mappentypen.listeTypen()).filter((x) => !x.system).length, 0, 'die Vorschau ändert nichts');
    await assert.rejects(
      ziel.e.typenEinspielen({ inhalt: `${inhalt} `, sha256: v.sha256 }, 'admin@example.org'),
      fachfehler(409, /Vorschau/),
    );
    const erg = await ziel.e.typenEinspielen({ inhalt, sha256: v.sha256 }, 'admin@example.org');
    assert.deepEqual(erg.neu.sort(), ['Vertrag', 'Vertragspartner']);
    const alle = await ziel.d.mappentypen.listeTypen();
    const p2 = alle.find((x) => x.schluessel === 'partner')!;
    const v2 = alle.find((x) => x.schluessel === 'vertrag')!;
    assert.deepEqual(v2.felder.find((f) => f.key === 'partner')?.zielTypen, [p2.id]);
    assert.equal(v2.archiv?.jahre, 10);
    assert.equal(v2.felder.find((f) => f.key === 'nummer')?.muster, '[A-Z]{2}\\d{4}');
    // Neue Typen sind wie jeder neue Typ nicht für Dienste im Netz zugelassen (#796).
    assert.ok(!((await ziel.einstellungen.lies('ki_typen')) as string[] | null)?.includes(v2.id));
    // Noch einmal: nichts zu tun.
    const nochmal = await ziel.e.typenVorschau({ inhalt });
    assert.deepEqual(
      nochmal.typen.map((x) => x.stand),
      ['gleich', 'gleich'],
    );
  });

  it('vorhandene Typen: Neues kommt dazu, Abschwächen (Pflicht, Archivmodus, Feldart) bleibt rot und wird nicht übernommen', async () => {
    const quelle = aufbau();
    const { partner, vertrag } = await typen(quelle.d);
    const datei = JSON.parse((await quelle.e.typenExport({ typen: [vertrag.id, partner.id] })).datei!.inhalt);
    const ziel = aufbau();
    await typen(ziel.d);
    const v = datei.mappentypen.find((x: { schluessel: string }) => x.schluessel === 'vertrag');
    v.archiv.jahre = 2;
    v.felder.find((f: { key: string }) => f.key === 'nummer').pflicht = false;
    v.felder.push({ key: 'notiz', label: 'Notiz', typ: 'langtext' });
    v.register.find((r: { key: string }) => r.key === 'daten').felder.push('notiz');
    datei.mappentypen.find((x: { schluessel: string }) => x.schluessel === 'partner').felder[0].typ = 'zahl';
    const inhalt = JSON.stringify(datei);
    const vs = await ziel.e.typenVorschau({ inhalt });
    assert.deepEqual(vs.probleme, []);
    const tv = vs.typen.find((x) => x.kennung === 'vertrag')!;
    assert.equal(tv.stand, 'vorhanden');
    assert.ok(tv.aenderungen.some((a) => a.abgelehnt && /Archivmodus/.test(a.text)));
    assert.ok(tv.aenderungen.some((a) => a.abgelehnt && /Pflicht/.test(a.text)));
    assert.ok(tv.aenderungen.some((a) => !a.abgelehnt && /Notiz/.test(a.text)));
    assert.ok(vs.typen.find((x) => x.kennung === 'partner')!.aenderungen.some((a) => a.abgelehnt && /Feldart/.test(a.text)));
    const erg = await ziel.e.typenEinspielen({ inhalt, sha256: vs.sha256 }, 'admin@example.org');
    assert.deepEqual(erg.geaendert, ['Vertrag']);
    assert.equal(erg.abgelehnt, 3);
    const nachher = (await ziel.d.mappentypen.listeTypen()).find((x) => x.schluessel === 'vertrag')!;
    assert.equal(nachher.archiv?.jahre, 10, 'Frist nicht verkürzt');
    assert.equal(nachher.felder.find((f) => f.key === 'nummer')?.pflicht, true, 'Pflicht bleibt');
    assert.ok(nachher.felder.some((f) => f.key === 'notiz'));
    const p = (await ziel.d.mappentypen.listeTypen()).find((x) => x.schluessel === 'partner')!;
    assert.equal(p.felder.find((f) => f.key === 'name')?.typ, 'text', 'Feldart bleibt');
  });

  it('strenge Prüfung: nichts, was Rechte oder Wege nach außen mitbringt; Grenzen; Ids; unbekanntes Format', async () => {
    const { d, e } = aufbau();
    const { partner } = await typen(d);
    const datei = JSON.parse((await e.typenExport({ typen: [partner.id] })).datei!.inhalt);
    const mit = (f: (x: typeof datei) => void) => {
      const x = structuredClone(datei);
      f(x);
      return JSON.stringify(x);
    };
    assert.throws(() => liesTypenDatei(mit((x) => (x.mappentypen[0].berechtigungen = { R: [] }))), fachfehler(422, /berechtigungen/));
    assert.throws(() => liesTypenDatei(mit((x) => (x.automatisierungen = []))), fachfehler(422, /automatisierungen/));
    assert.throws(() => liesTypenDatei(mit((x) => (x.mappentypen[0].felder[0].berechnet = true))), fachfehler(422, /berechnet/));
    assert.throws(() => liesTypenDatei(mit((x) => (x.mappentypen[0].felder[0].berechnetVon = 'paket'))), fachfehler(422, /berechnetVon/));
    assert.throws(
      () => liesTypenDatei(mit((x) => (x.mappentypen[0].felder[0].hilfe = '00000000-0000-4000-8000-000000000001'))),
      fachfehler(422, /Id/),
    );
    assert.throws(() => liesTypenDatei(mit((x) => (x.mappentypen[0].beschreibung = 'x'.repeat(5000)))), fachfehler(422, /4000/));
    assert.throws(() => liesTypenDatei(mit((x) => (x.version = 2))), fachfehler(422, /Format/));
    assert.throws(() => liesTypenDatei('kein json'), fachfehler(422, /JSON/));
    assert.throws(
      () => liesTypenDatei(mit((x) => (x.mappentypen[0].felder[0].muster = boese('(aQ)Q')))),
      fachfehler(422, /wiederholt eine Gruppe/),
    );
  });

  it('Typen aus Paketen bleiben beim Paket: ihre Kennung verhindert das Einspielen', async () => {
    const { d, e } = aufbau();
    const { partner } = await typen(d);
    const datei = liesTypenDatei((await e.typenExport({ typen: [partner.id] })).datei!.inhalt);
    const plan = planeEinspielen(
      datei,
      {
        typen: await d.mappentypen.listeTypen(),
        pakete: [{ id: 'vertraege', name: 'Verträge', version: '1.0.0', typen: { partner: partner.id } } as never],
        dmsTypen: new Map(),
        vorgaben: new Map(),
      },
      () => 'neu',
    );
    assert.match(plan.probleme.join(' '), /gehört zu Verträge/);
  });
});

describe('Prüfmuster gegen ReDoS (#1315)', () => {
  it('lehnt verschachtelte Wiederholungen ab, lässt übliche Muster zu', () => {
    for (const m of ['[A-Z]{2}\\d{4}', '\\d{5}', '(\\d{3}-)+\\d', '(DE|AT)?\\d+', '[a-z]+', '(a+)?'])
      assert.equal(musterProblem(m), null, m);
    for (const m of ['(aQ)Q', '(aS)S', '(a|aa)Q', '((aQ)b)S', '(?:xQ)Qy', '([a-z]Q\\.)Q[a-z]{2,}'].map(boese))
      assert.equal(musterProblem(m), 'verschachtelt', m);
    assert.equal(musterProblem('('), 'ungueltig');
    assert.equal(musterProblem('a'.repeat(201)), 'lang');
  });

  it('der Editor lehnt ein unsicheres Muster ab; beim Speichern einer Mappe läuft es nie, lange Eingaben gar nicht', () => {
    const typ = { felder: [{ key: 'x', label: 'X', typ: 'text' as const, muster: boese('(aQ)Q$') }] };
    const p = pruefeMappentyp(
      {
        name: 'T',
        beschreibung: '',
        titelVorlage: '',
        felder: typ.felder,
        register: [{ key: 'd', name: 'D', art: 'felder', felder: ['x'] }],
      },
      { namenAndererTypen: [], existiertTyp: () => false },
    );
    assert.match(JSON.stringify(p.felder), /wiederholt eine Gruppe/);
    const start = Date.now();
    pruefeMappe(typ, { x: `${'a'.repeat(40)}!` }, { typVon: () => undefined, doppelt: () => undefined });
    assert.ok(Date.now() - start < 1000, 'kein Backtracking');
    const lang = pruefeMappe(
      { felder: [{ key: 'x', label: 'X', typ: 'text', muster: 'a*' }] },
      { x: 'a'.repeat(MUSTER_EINGABE_MAX + 1) },
      { typVon: () => undefined, doppelt: () => undefined },
    );
    assert.ok(lang.felder.x);
  });
});
