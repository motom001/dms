/**
 * Automatisierungen und Karten in Paketen (#680): eigene Dann-Karten aus Paketen mit Code (`code.karten`) im Kartenvorrat
 * und mit Werten im Ereignis, Hinweis auf Karten über die Ablage hinaus, Export eigener Automatisierungen über
 * „Paket erstellen“ (feste Personen werden zum Ersteller, Unpassendes ist ein Problem, die Prüfung beim Hochladen läuft).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parse } from 'yaml';
import { liesCode } from '../../shared/src/pakete';
import { automatisierungAussen } from '../../shared/src/mitkommt';
import { setzeZeitzone } from '../../shared/src/region';
import { Automatisierungen, speicherAutomatisierungRepo } from '../src/automatisierung';
import '../src/automatisierung/automatisierung-karten';
import { speicherDateien } from '../src/dateien/dateispeicher';
import { Dienst } from '../src/dienst/dienst';
import { speicherEinstellungen } from '../src/einstellungen/einstellungen';
import { Konten } from '../src/konten';
import { speicherKontoRepo } from '../src/konten/konto-repo';
import { liesZip, Paketverwaltung } from '../src/pakete/verwaltung/index';
import { Paketerstellung } from '../src/pakete/erstellung/index';
import { speicherRepo } from '../src/repo/speicher';
import { zipPuffer } from '../src/formate/zip';

setzeZeitzone('Europe/Berlin');

const ICH = { id: '00000000-0000-4000-8000-0000000000aa', email: 'admin@example.org' };
const WASM = Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);
const archiv = (d: Record<string, string | Buffer>) =>
  zipPuffer(
    Object.entries(d).map(([name, inhalt]) => ({ name, daten: Buffer.isBuffer(inhalt) ? inhalt : Buffer.from(inhalt) })),
    new Date('2026-01-01T12:00:00Z'),
  );
const KARTEN = `  karten:
    - schluessel: bericht
      name: Monatsbericht ablegen
      hilfe: Legt den Bericht des Vormonats als Mappe ab.
      felder:
        - { schluessel: tage, name: Tage zurück, typ: zahl }
        - { schluessel: leise, name: Ohne Benachrichtigung, typ: janein }
`;
const COMPLIANCE = {
  'manifest.yaml': `schema: 1\nid: compliance\nname: Compliance\nversion: 1.0.0\nbeschreibung: Test.\nautor: { name: Test, github: test }\nlizenz: MIT\ndms: ">=0.285.0"\ninhalt: {}\ncode:\n  sprache: c\n  quelle: code/\n  ereignisse: [zeitplan.ausgefuehrt]\n${KARTEN}`,
  'code/modul.wasm': WASM,
};
const am = (uhr: string) => Date.parse(`2026-11-10T${uhr}:00+01:00`);

async function aufbau() {
  const einstellungen = speicherEinstellungen();
  const d = new Dienst(speicherRepo(), speicherDateien(), { einstellungen });
  const konten = new Konten(
    speicherKontoRepo(),
    () => null,
    () => 'http://localhost',
    d.systemtypen.benutzerspiegel(),
  );
  d.verbindeKonten(konten.papierkorbHaken());
  const { benutzer: markus } = await konten.einrichten({ email: 'markus@example.org', name: 'Markus', passwort: 'ein-langes-passwort' });
  await d.postSystemmappen.gleicheBenutzerAb(await konten.listeBenutzer());
  await konten.systemkonto('automatisierung');
  d.systemkonten = (k) => konten.systemkonto(k);
  const zeit = { jetzt: am('04:00') };
  const motor = new Automatisierungen({ dienst: d, repo: speicherAutomatisierungRepo(() => zeit.jetzt), uhr: () => zeit.jetzt });
  const p = new Paketverwaltung(d, {
    version: () => '0.285.0',
    abruf: async (u) => {
      throw new Error(`404 ${u}`);
    },
    katalogUrl: 'https://katalog.test/katalog.json',
  });
  const installiere = async (dateien: Record<string, string | Buffer>) => {
    const h = await p.hochladen(archiv(dateien), ICH);
    return p.installiere({ upload: h.upload, bestaetigt: true, rechteBestaetigt: true }, ICH);
  };
  return { d, konten, markus, motor, zeit, p, installiere, einstellungen };
}

describe('Karten aus Paketen mit Code (#680)', () => {
  it('Manifest: Schlüssel, Name, Hilfe, Felder; nur mit zeitplan.ausgefuehrt', () => {
    const r = liesCode({
      sprache: 'c',
      ereignisse: ['zeitplan.ausgefuehrt'],
      karten: [{ schluessel: 'bericht', name: 'Bericht', felder: [{ schluessel: 'tage', name: 'Tage', typ: 'zahl' }] }],
    });
    assert.deepEqual(r.fehler, []);
    assert.deepEqual(r.code!.karten, [
      { schluessel: 'bericht', name: 'Bericht', felder: [{ schluessel: 'tage', name: 'Tage', typ: 'zahl' }] },
    ]);
    assert.match(liesCode({ sprache: 'c', karten: [{ schluessel: 'bericht', name: 'Bericht' }] }).fehler.join(), /zeitplan\.ausgefuehrt/);
    assert.match(
      liesCode({ sprache: 'c', ereignisse: ['zeitplan.ausgefuehrt'], karten: [{ schluessel: 'Bericht!', name: 'B' }] }).fehler.join(),
      /schluessel/,
    );
    assert.match(
      liesCode({
        sprache: 'c',
        ereignisse: ['zeitplan.ausgefuehrt'],
        karten: [{ schluessel: 'b', name: 'B', felder: [{ schluessel: 'x', name: 'X', typ: 'datei' }] }],
      }).fehler.join(),
      /typ/,
    );
  });

  it('im Kartenvorrat (Kontext) und mit den Werten der Felder im Ereignis – nur Felder der Karte', async () => {
    const x = await aufbau();
    await x.installiere(COMPLIANCE);
    const k = await x.motor.kontext();
    assert.deepEqual(
      k.pakete?.find((p) => p.id === 'compliance')?.karten?.map((c) => c.name),
      ['Monatsbericht ablegen'],
    );
    const a = await x.motor.lege(
      {
        name: 'Bericht',
        aktiv: true,
        wenn: { art: 'zeitplan', uhrzeit: '04:30' },
        dann: [{ id: 'p1', art: 'paket', paket: 'compliance', aufgabe: 'bericht', werte: { tage: '30', leise: true, fremd: 'weg' } }],
      },
      x.markus.id,
    );
    assert.deepEqual((a.dann[0] as { werte?: unknown }).werte, { tage: '30', leise: true, fremd: 'weg' }, 'gespeichert wie eingegeben');
    x.zeit.jetzt = am('04:31');
    await x.motor.zeitplan();
    const es = (await x.d.kern.repo.faelligeEreignisse(100)).filter((e) => e.art === 'zeitplan.ausgefuehrt');
    assert.equal(es.length, 1);
    assert.deepEqual((es[0].daten as { werte?: unknown }).werte, { tage: 30, leise: true });
    assert.equal((es[0].daten as { aufgabe?: unknown }).aufgabe, 'bericht');
  });

  it('Hinweis bei der Installation: E-Mails und Code des Pakets (mit Netz: Daten können hinaus)', () => {
    assert.deepEqual(
      automatisierungAussen({ dann: [{ art: 'aufgabe', benachrichtigung: true, empfaenger: [] }, { art: 'paket' }] }, true),
      ['verschickt E-Mails an Personen der Ablage', 'gibt Daten an den Code des Pakets, das ins Netz darf'],
    );
    assert.deepEqual(automatisierungAussen({ dann: [{ art: 'aufgabe', benachrichtigung: false, empfaenger: [] }] }, false), []);
  });
});

describe('Eigene Automatisierungen über „Paket erstellen“ (#680)', () => {
  async function quelle() {
    const x = await aufbau();
    const e = new Paketerstellung(x.d, {
      version: () => '0.285.0',
      automatisierungen: async () => (await x.motor.uebersicht()).automatisierungen,
    });
    const vertrag = await x.d.mappentypen.legeTypAn({
      name: 'Vertrag',
      titelVorlage: '{titel}',
      felder: [
        { key: 'titel', label: 'Titel', typ: 'text' },
        { key: 'ende', label: 'Ende', typ: 'datum' },
      ],
    });
    const notiz = await x.d.mappentypen.legeTypAn({
      name: 'Notiz',
      titelVorlage: '{titel}',
      felder: [{ key: 'titel', label: 'Titel', typ: 'text' }],
    });
    const erinnerung = await x.motor.lege(
      {
        name: 'Vertrag endet',
        aktiv: true,
        wenn: { art: 'datum', typ: vertrag.id, feld: 'ende', vorlauf: 30, einheit: 'tage', uhrzeit: '07:00' },
        dann: [
          { id: 'a', art: 'aufgabe', als: 'aufgabe', empfaenger: [{ art: 'person', id: x.markus.id }], text: 'Vertrag endet am {datum}' },
        ],
      },
      x.markus.id,
    );
    const ohneTyp = await x.motor.lege(
      {
        name: 'Neue Notiz',
        aktiv: true,
        wenn: { art: 'mappe.angelegt', typ: notiz.id },
        dann: [{ id: 'a', art: 'aufgabe', als: 'aufgabe', empfaenger: [{ art: 'ersteller' }], text: 'Neu' }],
      },
      x.markus.id,
    );
    const angaben = (mehr: Record<string, unknown>) => ({
      typen: [vertrag.id],
      sichten: [],
      beispiele: [],
      wortlisten: [],
      id: 'vertraege_eigen',
      name: 'Verträge (eigen)',
      version: '1.0.0',
      beschreibung: 'Verträge mit Erinnerung vor dem Ende.',
      autor: { name: 'Markus', github: 'markus' },
      lizenz: 'MIT',
      lizenzArt: 'frei',
      dms: '>=0.233.0',
      aenderungen: '',
      ...mehr,
    });
    return { x, e, vertrag, erinnerung, ohneTyp, angaben };
  }

  it('steht zur Wahl und kommt als inhalt/automatisierungen.yaml mit – Person wird zum Ersteller, ausgeschaltet', async () => {
    const q = await quelle();
    const st = await q.e.stand();
    assert.deepEqual(st.automatisierungen?.map((a) => a.name).sort(), ['Neue Notiz', 'Vertrag endet']);
    const p = await q.e.pruefe(q.angaben({ automatisierungen: [q.erinnerung.id] }));
    assert.deepEqual(p.probleme, []);
    assert.equal(p.einspielbar, true, 'dieselbe Prüfung wie beim Hochladen');
    assert.equal(p.inhalt.automatisierungen, 1);
    assert.ok(p.hinweise.some((h) => /feste Personen und Rollen kommen nicht mit/.test(h)));
    const z = await q.e.exportiere(q.angaben({ automatisierungen: [q.erinnerung.id] }), ICH);
    const dateien = liesZip(z.daten);
    const datei = [...dateien.keys()].find((n) => n.endsWith('inhalt/automatisierungen.yaml'))!;
    const [a] = parse(dateien.get(datei)!.toString('utf8')) as Array<Record<string, unknown>>;
    assert.equal(a.eingeschaltet, false);
    assert.equal((a.wenn as { typ: string }).typ, 'vertrag');
    assert.deepEqual((a.dann as Array<{ empfaenger: unknown }>)[0].empfaenger, [{ art: 'ersteller' }]);
    assert.ok(!JSON.stringify(a).includes(q.x.markus.id), 'keine Id einer Person');
  });

  it('ein Mappentyp, der nicht mitkommt, ist ein Problem mit Namen', async () => {
    const q = await quelle();
    const p = await q.e.pruefe(q.angaben({ automatisierungen: [q.ohneTyp.id] }));
    assert.ok(
      p.probleme.some((x) => /„Neue Notiz“ passt nicht.*„Notiz“/.test(x)),
      p.probleme.join('\n'),
    );
  });
});
