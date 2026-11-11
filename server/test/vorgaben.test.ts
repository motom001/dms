/**
 * Vorgaben aus Paketen (#1038): Paketformat, Text-Vorlagen prüfen, feste Kennung, Updates, Entfernen, Vorgaben und
 * Vorlagen für Pakete anderer Pakete, Anzeige-Bedingung „zeigt auf die Vorgabe“ – mit Speicher und PostgreSQL.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parse } from 'yaml';
import { speicherDateien } from '../src/dateispeicher';
import { Dienst } from '../src/dienst';
import { speicherEinstellungen } from '../src/einstellungen';
import { Fachfehler } from '../src/fehler';
import { VORLAGE_MAX } from '../src/grenzen';
import { liesPaket, liesZip, Paketverwaltung } from '../src/pakete';
import { pruefeVorlage, vorlagenPlatzhalter } from '../src/pakete/index';
import { Paketerstellung } from '../src/paketerstellung';
import type { Repo } from '../src/repo';
import { speicherRepo } from '../src/repo-speicher';
import { zipPuffer } from '../src/zip';
import { fremdeVorgabe, teileVorgabe, vorgabeKennung } from '../../shared/src/vorgaben';
import { eigeneDatenbank } from './hilfe-db';

const ICH = { id: '00000000-0000-4000-8000-0000000000aa', email: 'admin@example.org' };
const VERSION = '0.236.0';

const manifest = (id: string, version: string, extra = '') => `schema: 1\nid: ${id}\nname: ${id === 'vertraege' ? 'Verträge' : 'Fahrzeuge'}\nversion: ${version}\nbeschreibung: Test.\nautor: { name: Lena Beispiel, github: lena-beispiel }\nlizenz: MIT\ndms: ">=0.223.0"\n${extra}`;
const TYPEN = [
  '- schluessel: vertragsart', '  name: Vertragsart', '  titelVorlage: "{name}"', '  felder:',
  '    - { key: name, label: Name, typ: text, pflicht: true }', '    - { key: beschreibung, label: Beschreibung, typ: langtext }',
  '  register:', '    - { key: allgemein, name: Allgemein, art: felder, felder: [name, beschreibung] }', '    - { key: vorlagen, name: Vorlagen, art: dokumente }',
  '- schluessel: vertrag', '  name: Vertrag', '  titelVorlage: "{bezeichnung}"', '  felder:',
  '    - { key: bezeichnung, label: Bezeichnung, typ: text, pflicht: true }', '    - { key: art, label: Vertragsart, typ: referenz, ziel: vertragsart }',
  '    - { key: kaltmiete, label: Kaltmiete, typ: betrag }', '    - { key: kennwort, label: Kennwort, typ: passwort }',
  '  register:', '    - key: daten', '      name: Daten', '      art: felder', '      felder: [bezeichnung, art, kaltmiete, kennwort]', '      abschnitte:',
  '        - { vor: kaltmiete, titel: Miete, anzeigen: { bedingungen: [{ art: vorgabe, feld: art, vorgabe: [miete] }] } }',
  '    - { key: dokumente, name: Dokumente, art: dokumente }', '',
].join('\n');
const KUENDIGUNG = '# Kündigung\n\nSehr geehrte Damen und Herren,\n\nhiermit kündige ich den Vertrag {bezeichnung} zum nächstmöglichen Termin.\nHilfe: [Musterbrief](https://example.org/hilfe)\n';
const vorgaben10 = [
  '- kennung: strom', '  typ: vertragsart', '  werte: { name: Strom }', '  beschriftungen: { en: { name: Electricity } }',
  '  vorlagen: [{ datei: vorlagen/strom.md, titel: Kündigung Strom }]',
  '- kennung: miete', '  typ: vertragsart', '  werte: { name: Miete, beschreibung: 3 Monate }',
  '  vorlagen: [{ datei: vorlagen/kuendigung-miete.md, titel: Kündigung Mietvertrag, register: vorlagen }]',
  '- kennung: wasser', '  typ: vertragsart', '  werte: { name: Wasser }', '',
].join('\n');
const vertraege10: Record<string, string> = {
  'manifest.yaml': manifest('vertraege', '1.0.0', 'inhalt:\n  mappentypen: inhalt/mappentypen.yaml\n  vorgaben: inhalt/vorgaben.yaml\n  beispiele: inhalt/beispiele.yaml\n'),
  'inhalt/mappentypen.yaml': TYPEN,
  'inhalt/vorgaben.yaml': vorgaben10,
  'inhalt/beispiele.yaml': '- typ: vertrag\n  werte: { bezeichnung: Wohnung Lena, art: { vorgabe: miete }, kaltmiete: 650 }\n',
  'inhalt/vorlagen/strom.md': '# Strom kündigen\n\nVertrag {bezeichnung}\n',
  'inhalt/vorlagen/kuendigung-miete.md': KUENDIGUNG,
};
/** 1.1.0: neue Fassungen von Strom und Miete (samt Vorlagen), neue Vorgabe Gas; Wasser bleibt im Paket. */
const vertraege11: Record<string, string> = {
  ...vertraege10,
  'manifest.yaml': vertraege10['manifest.yaml'].replace('version: 1.0.0', 'version: 1.1.0'),
  'inhalt/vorgaben.yaml': vorgaben10.replace('werte: { name: Strom }', 'werte: { name: Strom, beschreibung: Ein Monat }').replace('beschreibung: 3 Monate }', 'beschreibung: 3 Monate zum Monatsende }')
    + '- kennung: gas\n  typ: vertragsart\n  werte: { name: Gas }\n',
  'inhalt/vorlagen/strom.md': '# Strom kündigen\n\nVertrag {bezeichnung}, neue Fassung\n',
  'inhalt/vorlagen/kuendigung-miete.md': `${KUENDIGUNG}\nNeue Fassung.\n`,
};
/** Fahrzeuge: hängt von Verträgen ab, bringt die Vertragsart „Pkw-Kaufvertrag“ mit und hängt eine Vorlage an „Miete“. */
const fahrzeuge: Record<string, string> = {
  'manifest.yaml': manifest('fahrzeuge', '1.0.0', 'abhaengigkeiten: { vertraege: ">=1.0.0" }\ninhalt:\n  mappentypen: inhalt/mappentypen.yaml\n  vorgaben: inhalt/vorgaben.yaml\n'),
  'inhalt/mappentypen.yaml': '- schluessel: fahrzeug\n  name: Fahrzeug\n  felder:\n    - { key: kennzeichen, label: Kennzeichen, typ: text }\n  register:\n    - { key: daten, name: Daten, art: felder, felder: [kennzeichen] }\n',
  'inhalt/vorgaben.yaml': '- kennung: pkw\n  typ: vertraege:vertragsart\n  werte: { name: Pkw-Kaufvertrag }\n- ergaenzt: vertraege:miete\n  vorlagen: [{ datei: vorlagen/garage.md, titel: Garage kündigen }]\n',
  'inhalt/vorlagen/garage.md': '# Garage\n\nHiermit kündige ich den Stellplatz.\n',
};

const zip = (d: Record<string, string | Buffer>) => zipPuffer(Object.entries(d).map(([name, inhalt]) => ({ name, daten: Buffer.isBuffer(inhalt) ? inhalt : Buffer.from(inhalt) })), new Date('2026-01-01T12:00:00Z'));
const gruende = (re: RegExp) => (e: unknown) => e instanceof Fachfehler && ((e.details as { gruende?: string[] })?.gruende ?? [e.message]).some((g) => re.test(g));
const lies = (d: Record<string, string | Buffer>) => liesPaket(liesZip(zip(d)));

describe('Text-Vorlagen prüfen (#1038)', () => {
  const b = (s: string) => Buffer.from(s);
  it('lässt schlichtes Markdown mit https-Links und Platzhaltern zu', () => {
    assert.equal(pruefeVorlage(b(KUENDIGUNG)).fehler, undefined);
    assert.equal(pruefeVorlage(b('Siehe <https://example.org/a>.\n\n[x]: https://example.org/b\n')).fehler, undefined);
    assert.deepEqual(vorlagenPlatzhalter('An {von.name}, Vertrag {vertragsnummer} – {von.name}'), ['von.name', 'vertragsnummer']);
  });
  it('lehnt HTML (auch Kommentare), Bilder, fremde Links, Passwortfelder, Binäres und zu Großes ab', () => {
    const fehler = (s: string | Buffer, geheim: string[] = []) => pruefeVorlage(Buffer.isBuffer(s) ? s : b(s), new Set(geheim)).fehler;
    assert.equal(fehler('Hallo <b>fett</b>'), 'html');
    assert.equal(fehler('Text <!-- versteckt --> weiter'), 'html');
    assert.equal(fehler('<script>alert(1)</script>'), 'html');
    assert.equal(fehler('Logo ![x](https://example.org/p.png)'), 'bild', 'kein Tracking-Pixel');
    assert.equal(fehler('[Link](http://example.org)'), 'link');
    assert.equal(fehler('[Link](javascript:alert(1))'), 'link');
    assert.equal(fehler('[Link](data:text/html,x)'), 'link');
    assert.equal(fehler('[Link](vorlage2.md)'), 'link', 'nur https://');
    assert.equal(fehler('[x]: http://example.org'), 'link');
    assert.equal(fehler('<mailto:lena@example.org>'), 'html', 'nur https in spitzen Klammern');
    assert.equal(fehler('Schreib an mailto:lena@example.org'), 'link');
    assert.equal(fehler('Kennwort: {zugang.kennwort}', ['kennwort']), 'passwort');
    assert.equal(fehler('Kennwort: {kennwortfeld}', ['kennwort']), undefined, 'nur ganze Kennungen');
    assert.equal(fehler(Buffer.from([0xff, 0xfe, 0x41])), 'utf8');
    assert.equal(fehler('Text\u0000mit Null'), 'steuerzeichen');
    assert.equal(fehler(''), 'leer');
    assert.equal(fehler('x'.repeat(VORLAGE_MAX + 1)), 'gross');
    assert.equal(VORLAGE_MAX, 256 * 1024);
  });
});

describe('Vorgaben im Paketformat (#1038)', () => {
  it('liest Vorgaben, Vorlagen, Beschriftungen und Ergänzungen', () => {
    const p = lies(vertraege10);
    assert.deepEqual(p.vorgaben?.map((v) => [v.schluessel, v.typ]), [['strom', 'vertragsart'], ['miete', 'vertragsart'], ['wasser', 'vertragsart']]);
    assert.deepEqual(p.vorgaben?.[1].vorlagen, [{ datei: 'vorlagen/kuendigung-miete.md', titel: 'Kündigung Mietvertrag', register: 'vorlagen' }]);
    assert.deepEqual(p.vorgaben?.[0].beschriftungen, { en: { name: 'Electricity' } });
    assert.equal(p.vorlagenDateien?.size, 2);
    const f = lies(fahrzeuge);
    assert.deepEqual(f.vorgaben?.map((v) => v.typ), ['vertraege:vertragsart']);
    assert.deepEqual(f.ergaenzungen, [{ ziel: 'vertraege:miete', vorlagen: [{ datei: 'vorlagen/garage.md', titel: 'Garage kündigen' }] }]);
  });

  it('prüft Kennung, Typ, Abhängigkeit, Ergänzungen und Vorlagen beim Lesen', () => {
    const mit = (yaml: string, extra: Record<string, string | Buffer> = {}, basis = vertraege10) => () => lies({ ...basis, 'inhalt/vorgaben.yaml': yaml, ...extra });
    assert.throws(mit('- kennung: Strom!\n  typ: vertragsart\n  werte: { name: x }\n'), gruende(/ungültige Kennung/));
    assert.throws(mit('- kennung: a\n  typ: vertragsart\n  werte: { name: x }\n- kennung: a\n  typ: vertragsart\n  werte: { name: y }\n'), gruende(/doppelt/));
    assert.throws(mit('- kennung: a\n  typ: gibtsnicht\n  werte: { name: x }\n'), gruende(/nur eigene Typen/));
    // Fremder Typ nur aus einer Abhängigkeit (Ergänzung Sicherheit).
    assert.throws(mit('- kennung: a\n  typ: "basis:organisation"\n  werte: { name: x }\n'), gruende(/nur eigene Typen oder Typen eines Pakets, von dem es abhängt|von dem dieses abhängt/));
    // An fremden Vorgaben nur Vorlagen anhängen – keine Werte, keine Beschriftungen, keine Rechte.
    const erg = (zusatz: string) => mit(`- ergaenzt: vertraege:miete\n${zusatz}  vorlagen: [vorlagen/garage.md]\n`, { 'inhalt/vorlagen/garage.md': 'Text' }, fahrzeuge);
    assert.throws(erg('  werte: { name: Garage }\n'), gruende(/nur Vorlagen anhängen – werte/));
    assert.throws(erg('  rechte: { lesen: ["*"] }\n'), gruende(/nur Vorlagen anhängen – rechte/));
    assert.doesNotThrow(erg(''));
    assert.throws(mit('- ergaenzt: basis:organisation\n  vorlagen: [vorlagen/garage.md]\n', { 'inhalt/vorlagen/garage.md': 'Text' }, fahrzeuge), gruende(/von dem dieses abhängt/));
    // Vorlagen: Pfad, Datei, Inhalt, Passwortfelder des Pakets, Register.
    const v = (dok: string, inhalt = 'Text') => mit(`- kennung: a\n  typ: vertragsart\n  werte: { name: x }\n  vorlagen: [${dok}]\n`, { 'inhalt/vorlagen/a.md': inhalt });
    assert.throws(v('{ datei: vorlagen/a.docx }'), gruende(/nur Markdown unter vorlagen/));
    assert.throws(v('{ datei: vorlagen/../manifest.yaml }'), gruende(/nur Markdown unter vorlagen/));
    assert.throws(v('{ datei: vorlagen/fehlt.md }'), gruende(/fehlt im Paket/));
    assert.throws(v('{ datei: vorlagen/a.md }', '<div>x</div>'), gruende(/enthält HTML/));
    assert.throws(v('{ datei: vorlagen/a.md }', 'Kennwort {kennwort}'), gruende(/Passwortfeld/));
    assert.throws(v('{ datei: vorlagen/a.md, register: allgemein }'), gruende(/Dokumentenregister „allgemein“ gibt es nicht/));
    // Vorgaben füllen keine Passwortfelder und zeigen nicht auf Beispiele.
    assert.throws(mit('- kennung: a\n  typ: vertrag\n  werte: { bezeichnung: x, kennwort: geheim }\n'), gruende(/Passwortfelder/));
    assert.throws(mit('- kennung: a\n  typ: vertrag\n  werte: { bezeichnung: x, art: { beispiel: b } }\n'), gruende(/nicht auf Beispiele/));
    // Verweise auf Vorgaben: eigene müssen es geben.
    assert.throws(mit('- kennung: a\n  typ: vertrag\n  werte: { bezeichnung: x, art: { vorgabe: gibtsnicht } }\n'), gruende(/„gibtsnicht“ gibt es im Paket nicht/));
  });

  it('Anzeige-Bedingung „zeigt auf die Vorgabe“: an einem Verweisfeld, mit Vorgaben, die es gibt', () => {
    const typen = (b: string) => () => lies({ ...vertraege10, 'inhalt/mappentypen.yaml': TYPEN.replace('{ art: vorgabe, feld: art, vorgabe: [miete] }', b) });
    assert.throws(typen('{ art: vorgabe, feld: bezeichnung, vorgabe: [miete] }'), gruende(/nur an einem Verweisfeld/));
    assert.throws(typen('{ art: vorgabe, feld: art, vorgabe: [gibtsnicht] }'), gruende(/„gibtsnicht“ gibt es im Paket nicht/));
    assert.throws(typen('{ art: vorgabe, feld: art, vorgabe: ["basis:x"] }'), gruende(/nicht unter abhaengigkeiten/));
    assert.doesNotThrow(typen('{ art: vorgabe, feld: art, vorgabe: [miete, strom], nicht: true }'));
  });

  it('feste Kennung paket:<id>:<schluessel> – je Paket getrennt', () => {
    assert.equal(vorgabeKennung('vertraege', 'miete'), 'paket:vertraege:miete');
    assert.deepEqual(teileVorgabe('paket:vertraege:miete'), { paket: 'vertraege', schluessel: 'miete' });
    assert.equal(teileVorgabe('rolle:admin'), null);
    assert.equal(fremdeVorgabe({ vorgabe: 'paket:vertraege:miete' }, 'fahrzeuge'), true);
    assert.equal(fremdeVorgabe({ vorgabe: 'paket:vertraege:miete' }, 'vertraege'), false);
    assert.equal(fremdeVorgabe({}, 'fahrzeuge'), false);
  });
});

async function repo(pg: boolean): Promise<Repo> {
  if (!pg) return speicherRepo();
  const { pgRepo } = await import('../src/repo-pg');
  const sql = (await eigeneDatenbank('vorgaben')).sql;
  await sql`INSERT INTO haushalte (id, name) VALUES ('00000000-0000-4000-8000-000000000001', 'Test') ON CONFLICT DO NOTHING`;
  await sql`INSERT INTO benutzer (id, haushalt_id, email, name, rolle) VALUES (${ICH.id}, '00000000-0000-4000-8000-000000000001', ${ICH.email}, 'Admin', 'admin') ON CONFLICT DO NOTHING`;
  return pgRepo(sql, '00000000-0000-4000-8000-000000000001') as never;
}

function faelle(pg: boolean) {
  describe(`Vorgaben installieren, aktualisieren, entfernen (#1038)${pg ? ' – PostgreSQL' : ''}`, { skip: pg && !process.env.TEST_DATABASE_URL && 'ohne TEST_DATABASE_URL' }, () => {
    async function aufbau(sprache = 'de') {
      const r = await repo(pg);
      const d = new Dienst(r, speicherDateien(), { einstellungen: speicherEinstellungen() });
      // Dienstkonto: im Speicher eine eigene Id, mit PostgreSQL das vorhandene Konto (Fremdschlüssel).
      const konto = pg ? ICH.id : '00000000-0000-4000-8000-0000000000dd';
      const p = new Paketverwaltung(d, { version: () => VERSION, katalogUrl: 'https://katalog.test/katalog.json', abruf: async () => { throw new Error('ohne Netz'); }, standardSprache: async () => sprache, dienstkonto: async () => konto });
      return { d, p, r, konto };
    }
    async function installiere(p: Paketverwaltung, dateien: Record<string, string>, beispiele = false) {
      const h = await p.hochladen(zip(dateien), ICH);
      return { vorschau: h.vorschau, paket: await p.installiere({ upload: h.upload, bestaetigt: true, beispiele }, ICH) };
    }
    const vorgabe = async (r: Repo, paket: string, s: string) => (await r.mappenMitVorgabe(vorgabeKennung(paket, s))).find((m) => m.vorgabe === vorgabeKennung(paket, s));
    const typVon = async (d: Dienst, k: string) => (await d.mappentypen.listeTypen()).find((t) => t.schluessel === k)!;

    it('legt Vorgaben mit fester Kennung an – Vorschau, Sprache, Vorlagen, Dienstkonto, ohne Ereignisse', async () => {
      const { d, p, r, konto } = await aufbau('en');
      const { vorschau, paket } = await installiere(p, vertraege10);
      assert.deepEqual(vorschau.vorgaben.map((v) => [v.schluessel, v.name, v.typ, v.zustand, v.vorlagen, v.fremd]), [
        ['strom', 'Electricity', 'Vertragsart', 'neu', 1, null], ['miete', 'Miete', 'Vertragsart', 'neu', 1, null], ['wasser', 'Wasser', 'Vertragsart', 'neu', 0, null],
      ]);
      const strom = (await vorgabe(r, 'vertraege', 'strom'))!;
      assert.equal(strom.werte.name, 'Electricity', 'Werte in der Sprache der Installation (#728)');
      assert.equal(strom.erstelltVon, konto, 'Ersteller ist das Dienstkonto des Pakets');
      const miete = (await vorgabe(r, 'vertraege', 'miete'))!;
      const doks = await d.listeDokumente(miete.id);
      assert.deepEqual(doks.map((x) => [x.name, x.registerKey, x.mime, x.herkunft]), [['Kündigung Mietvertrag.md', 'vorlagen', 'text/markdown', 'paket']]);
      assert.deepEqual(Object.keys(paket.vorgaben ?? {}).sort(), ['miete', 'strom', 'wasser']);
      assert.equal(paket.vorgaben!.miete.mappe, miete.id);
      assert.deepEqual(paket.vorgaben!.miete.vorlagen?.map((v) => v.dokument), [doks[0].id]);
      // Frage 71: keine Mappen-Ereignisse beim Installieren.
      const ereignisse = await r.holeKatalogEreignisse(100, 1);
      assert.ok(!ereignisse.some((x) => x.art.startsWith('mappe.')), 'keine Mappen-Ereignisse');
      // Herkunft an der Mappe: „Vorgabe aus Paket Verträge“.
      assert.deepEqual((await d.holeMappe(miete.id) as { vorgabe?: unknown }).vorgabe, { paket: 'vertraege', paketName: 'Verträge' });
    });

    it('Anzeige-Bedingung „zeigt auf die Vorgabe“ wird beim Installieren zur Id; Beispiele zeigen auf Vorgaben', async () => {
      const { d, p, r } = await aufbau();
      await installiere(p, vertraege10, true);
      const miete = (await vorgabe(r, 'vertraege', 'miete'))!;
      const vertrag = await typVon(d, 'vertraege:vertrag');
      assert.deepEqual(vertrag.register.find((x) => x.key === 'daten')!.abschnitte![0].anzeigen, { modus: 'alle', bedingungen: [{ art: 'feld', bedingung: { art: 'feld', feld: 'art', op: 'zeigtAuf', wert: { art: 'fest', wert: [miete.id] } } }] });
      const [wohnung] = await d.listeMappen(vertrag.id);
      assert.equal(wohnung.werte.art, miete.id, 'Beispiel zeigt auf die Vorgabe');
    });

    it('Update: neue Vorgaben dazu, unveränderte bekommen die neue Fassung, geänderte und gelöschte bleiben, keine Doppel-Anlage', async () => {
      const { d, p, r } = await aufbau();
      await installiere(p, vertraege10);
      const vorher = { strom: (await vorgabe(r, 'vertraege', 'strom'))!, miete: (await vorgabe(r, 'vertraege', 'miete'))!, wasser: (await vorgabe(r, 'vertraege', 'wasser'))! };
      const stromDok = (await d.listeDokumente(vorher.strom.id))[0];
      const mieteDok = (await d.listeDokumente(vorher.miete.id))[0];
      await d.aendereMappe(vorher.miete.id, { werte: { beschreibung: 'Unsere Wohnung: 6 Monate' } }, ICH.id);
      await d.loescheMappe(vorher.wasser.id, ICH.id);
      const h = await p.hochladen(zip(vertraege11), ICH);
      const plan = Object.fromEntries(h.vorschau.vorgaben.map((v) => [v.schluessel, v]));
      assert.equal(plan.strom.zustand, 'aktualisiert');
      assert.equal(plan.miete.zustand, 'geaendert');
      assert.equal(plan.miete.neueFassung, true, 'Vorschau: neue Fassung im Paket, wird nicht übernommen');
      assert.equal(plan.wasser.zustand, 'geloescht');
      assert.equal(plan.gas.zustand, 'neu');
      const neu = await p.installiere({ upload: h.upload, bestaetigt: true }, ICH);
      assert.equal(neu.version, '1.1.0');
      const nachher = { strom: (await vorgabe(r, 'vertraege', 'strom'))!, miete: (await vorgabe(r, 'vertraege', 'miete'))! };
      assert.equal(nachher.strom.id, vorher.strom.id, 'gleiche Mappe – keine Doppel-Anlage');
      assert.equal(nachher.strom.werte.beschreibung, 'Ein Monat', 'unverändert → neue Fassung');
      assert.equal(nachher.miete.werte.beschreibung, 'Unsere Wohnung: 6 Monate', 'Änderung des Administrators bleibt');
      assert.equal(await vorgabe(r, 'vertraege', 'wasser'), undefined, 'gelöscht bleibt gelöscht');
      assert.ok(await vorgabe(r, 'vertraege', 'gas'), 'neue Vorgabe angelegt');
      assert.equal((await r.mappenMitVorgabe('paket:vertraege:')).length, 3, 'Strom, Miete, Gas – je einmal');
      assert.equal(neu.vorgaben?.wasser.geloescht, true);
      // Vorlagen: an unveränderter Vorgabe die neue Fassung, an geänderter die alte.
      const stromDoks = await d.listeDokumente(vorher.strom.id);
      assert.equal(stromDoks.length, 1);
      assert.notEqual(stromDoks[0].sha256, stromDok.sha256, 'neue Fassung der Vorlage');
      assert.deepEqual((await d.listeDokumente(vorher.miete.id)).map((x) => x.id), [mieteDok.id], 'Vorlage an geänderter Vorgabe bleibt');
      // Noch ein Update mit derselben Fassung ändert nichts.
      const v12 = { ...vertraege11, 'manifest.yaml': vertraege11['manifest.yaml'].replace('1.1.0', '1.2.0') };
      const h2 = await p.hochladen(zip(v12), ICH);
      assert.deepEqual(h2.vorschau.vorgaben.map((v) => v.zustand), ['gleich', 'geaendert', 'geloescht', 'gleich']);
    });

    it('fremdes Paket: Vorgabe im Typ der Abhängigkeit, Vorlage an deren Vorgabe; ändert sonst nichts; Entfernen fragt', async () => {
      const { d, p, r } = await aufbau();
      await installiere(p, vertraege10);
      const miete = (await vorgabe(r, 'vertraege', 'miete'))!;
      const mieteVorher = miete.werte;
      const { vorschau } = await installiere(p, fahrzeuge);
      assert.deepEqual(vorschau.vorgaben.map((v) => [v.name, v.typ, v.fremd]), [['Pkw-Kaufvertrag', 'Vertragsart', 'Verträge']]);
      assert.deepEqual(vorschau.ergaenzungen.map((e) => [e.ziel, e.name, e.paket, e.vorlagen]), [['vertraege:miete', 'Miete', 'Verträge', 1]]);
      const pkw = (await vorgabe(r, 'fahrzeuge', 'pkw'))!;
      assert.equal(pkw.typId, (await typVon(d, 'vertraege:vertragsart')).id);
      assert.equal(await vorgabe(r, 'vertraege', 'pkw'), undefined, 'Kennung gehört dem liefernden Paket');
      assert.deepEqual((await d.listeDokumente(miete.id)).map((x) => x.name).sort(), ['Garage kündigen.md', 'Kündigung Mietvertrag.md']);
      assert.deepEqual((await r.holeMappe(miete.id))!.werte, mieteVorher, 'Werte der fremden Vorgabe unverändert');
      // Ein Paket ändert keine Vorgabe eines anderen Pakets (auch nicht über die Schnittstelle).
      await assert.rejects(d.pruefeFremdeVorgabe({ paket: { id: 'fahrzeuge' } } as never, miete.id), (e: Fachfehler) => e.status === 403);
      await d.pruefeFremdeVorgabe({ paket: { id: 'vertraege' } } as never, miete.id);
      await d.pruefeFremdeVorgabe(undefined, miete.id);
      // Entfernen: Die unbenutzte Vorgabe in Verträge braucht eine Antwort; danach gehen nur die eigenen Dokumente mit.
      await assert.rejects(p.entferne('fahrzeuge', ICH), (e: Fachfehler) => e.status === 409 && (e.details as { vorgaben: Array<{ titel: string }> }).vorgaben[0].titel === 'Pkw-Kaufvertrag');
      const erg = await p.entferne('fahrzeuge', ICH, false, false, 'entfernen');
      assert.deepEqual(erg.vorgabenBehalten, []);
      assert.equal(await vorgabe(r, 'fahrzeuge', 'pkw'), undefined);
      assert.deepEqual((await d.listeDokumente(miete.id)).map((x) => x.name), ['Kündigung Mietvertrag.md'], 'nur die Vorlage des Pakets ging mit');
    });

    it('Entfernen lässt benutzte Vorgaben stehen; neue Installation nimmt sie wieder auf statt doppelt', async () => {
      const { d, p, r } = await aufbau();
      await installiere(p, vertraege10);
      await installiere(p, fahrzeuge);
      const pkw = (await vorgabe(r, 'fahrzeuge', 'pkw'))!;
      const vertrag = await typVon(d, 'vertraege:vertrag');
      const golf = await d.legeMappeAn({ typId: vertrag.id, werte: { bezeichnung: 'Golf Jonas', art: pkw.id } }, ICH.id);
      const erg = await p.entferne('fahrzeuge', ICH);
      assert.deepEqual(erg.vorgabenBehalten.map((x) => x.titel), ['Pkw-Kaufvertrag'], 'benutzt – bleibt, keine Rückfrage');
      assert.equal((await r.holeMappe(golf.id))!.werte.art, pkw.id, 'Verweis bricht nicht');
      const { vorschau, paket } = await installiere(p, fahrzeuge);
      assert.equal(vorschau.vorgaben[0].zustand, 'uebernommen');
      assert.equal(paket.vorgaben!.pkw.mappe, pkw.id);
      assert.equal((await r.mappenMitVorgabe('paket:fahrzeuge:')).length, 1, 'keine Doppel-Anlage');
      // Eine benutzte Vorgabe im eigenen Typ verhindert das Entfernen von Verträge (nach Fahrzeuge).
      await p.entferne('fahrzeuge', ICH, false, false, 'behalten');
      const miete = (await vorgabe(r, 'vertraege', 'miete'))!;
      await d.aendereMappe(golf.id, { werte: { art: miete.id } }, ICH.id);
      await assert.rejects(p.entferne('vertraege', ICH), gruende(/„Miete“ wird noch verwendet/));
    });

    it('Entfernen nimmt unbenutzte Vorgaben in eigenen Typen und unveränderte Beispiele mit', async () => {
      const { d, p, r } = await aufbau();
      await installiere(p, vertraege10, true);
      await p.entferne('vertraege', ICH);
      assert.equal((await r.mappenMitVorgabe('paket:vertraege:')).length, 0);
      assert.equal((await d.mappentypen.listeTypen()).some((t) => t.schluessel?.startsWith('vertraege:')), false);
    });

    it('Paket erstellen: „zeigt auf“ eine Vorgabe kommt mit ihrer Kennung ins Paket, das Paket hängt davon ab', async () => {
      const { d, p, r } = await aufbau();
      await installiere(p, vertraege10);
      const art = await typVon(d, 'vertraege:vertragsart');
      const miete = (await vorgabe(r, 'vertraege', 'miete'))!;
      const eigen = await d.mappentypen.legeTypAn({ name: 'Mietobjekt', schluessel: 'mietobjekt', titelVorlage: '{name}', felder: [
        { key: 'name', label: 'Name', typ: 'text' }, { key: 'art', label: 'Art', typ: 'referenz', zielTypen: [art.id] },
        { key: 'miete', label: 'Miete', typ: 'betrag', anzeigen: { modus: 'alle', bedingungen: [{ art: 'feld', bedingung: { art: 'feld', feld: 'art', op: 'zeigtAuf', wert: { art: 'fest', wert: [miete.id] } } }] } },
      ] });
      const e = new Paketerstellung(d, { version: () => VERSION });
      const eingabe = { typen: [eigen.id], sichten: [], beispiele: [], id: 'mietobjekte', name: 'Mietobjekte', version: '1.0.0', beschreibung: 'Mietobjekte mit ihrer Vertragsart.', autor: { name: 'Lena Beispiel', github: 'lena-beispiel' }, lizenz: 'MIT', dms: `>=${VERSION}`, aenderungen: '' };
      const pr = await e.pruefe(eingabe);
      assert.deepEqual(pr.probleme, []);
      assert.ok(pr.abhaengigkeiten.vertraege, 'hängt von Verträge ab');
      const archiv = await e.exportiere(eingabe, ICH);
      const dateien = liesZip(archiv.daten);
      const name = [...dateien.keys()].find((n) => n.endsWith('inhalt/mappentypen.yaml'))!;
      const typen = parse(dateien.get(name)!.toString('utf8')) as Array<{ felder: Array<{ key: string; anzeigen?: unknown }> }>;
      assert.deepEqual(typen[0].felder.find((f) => f.key === 'miete')!.anzeigen, { modus: 'alle', bedingungen: [{ art: 'vorgabe', feld: 'art', vorgabe: ['vertraege:miete'] }] });
    });

    it('Umzug (#1084): die feste Kennung zieht mit dem Paket um', async () => {
      const { d, r } = await aufbau();
      const typ = await d.mappentypen.legeTypAn({ name: 'Art', schluessel: 'art', titelVorlage: '{name}', felder: [{ key: 'name', label: 'Name', typ: 'text' }] });
      const m = await d.legeMappeAn({ typId: typ.id, werte: { name: 'Strom' } }, ICH.id);
      await r.setzeVorgabe(m.id, 'paket:alt:strom');
      await r.benennePaketUm('alt', 'neu');
      assert.equal((await r.holeMappe(m.id))!.vorgabe, 'paket:neu:strom');
      assert.equal((await r.mappenMitVorgabe('paket:alt:')).length, 0);
    });
  });
}
faelle(false);
faelle(true);
