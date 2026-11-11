/**
 * Installieren unabhängig von der Reihenfolge (#1122) und Namenskonflikte in der Vorschau (#1123). Mini-Pakete nach dem
 * Vorbild von dms-registry main (Basis, Verträge, Rechnungen, Fahrzeuge, Haushalt) – ohne Netz:
 * - Anzeige-Bedingung auf ein Feld, das erst im zweiten Durchgang entsteht (Rechnung „Menge“ ← „Erste Position“),
 * - „zeigt auf Mappe vom Typ …“ (verweistyp, zeigtAufTyp) auf ein optionales Ziel, dessen Paket fehlt,
 * - Quellen von Verknüpfungsregistern über zielOptional (Fahrzeug ← Rechnung „Betrifft“) und zwischen eigenen Typen,
 *   je in beiden Reihenfolgen; was sich nicht anlegen lässt, ist ein Fehler mit Stelle.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { after, describe, it } from 'node:test';
import { anzeigeProblemeVon, zeigtAn } from '../../shared/src/anzeige';
import type { Mappentyp } from '../../shared/src/model';
import type { Katalog } from '../../shared/src/pakete';
import { speicherDateien } from '../src/dateispeicher';
import { Dienst } from '../src/dienst';
import { speicherEinstellungen } from '../src/einstellungen';
import { Fachfehler } from '../src/fehler';
import { Paketverwaltung } from '../src/pakete';
import { aenderung } from '../src/paketerstellung';
import type { Repo } from '../src/repo';
import { speicherRepo } from '../src/repo-speicher';
import { zipPuffer } from '../src/zip';
import { eigeneDatenbank } from './hilfe-db';

const url = process.env.TEST_DATABASE_URL;
const ICH = { id: '00000000-0000-4000-8000-0000000000aa', email: 'markus@example.org' };
const HAUSHALT = '00000000-0000-4000-8000-000000000001';
const KATALOG = 'https://katalog.test/katalog.json';
const offen: Array<{ end(): Promise<void> }> = [];
after(async () => { for (const s of offen) await s.end(); });

async function repo(pg: boolean): Promise<Repo> {
  if (!pg) return speicherRepo();
  const { pgRepo } = await import('../src/repo-pg');
  const { sql } = await eigeneDatenbank('reihenfolge');
  offen.push(sql);
  await sql`INSERT INTO haushalte (id, name) VALUES (${HAUSHALT}, 'Test') ON CONFLICT DO NOTHING`;
  return pgRepo(sql, HAUSHALT) as never;
}

const archiv = (d: Record<string, string>) => zipPuffer(Object.entries(d).map(([name, inhalt]) => ({ name, daten: Buffer.from(inhalt) })), new Date('2026-01-01T12:00:00Z'));
function paket(id: string, name: string, typen: string, abh: string[] = [], sichten = ''): Record<string, string> {
  return {
    'manifest.yaml': `schema: 1\nid: ${id}\nname: ${name}\nversion: 1.0.0\nbeschreibung: Test.\nautor: { name: Test, github: test }\nlizenz: MIT\ndms: ">=0.60.0"\n`
      + (abh.length ? `abhaengigkeiten:\n${abh.map((a) => `  ${a}: ">=1.0.0"\n`).join('')}` : '')
      + `inhalt:\n  mappentypen: inhalt/mappentypen.yaml\n${sichten ? '  sichten: inhalt/sichten.yaml\n' : ''}`,
    'inhalt/mappentypen.yaml': typen,
    ...(sichten ? { 'inhalt/sichten.yaml': sichten } : {}),
  };
}

const BASIS = paket('basis', 'Basis', `- schluessel: organisation
  name: Organisation
  felder: [{ key: name, label: Name, typ: text }]
  register: [{ key: daten, name: Daten, art: felder, felder: [name] }]
`);
/** Verträge: „Kennzeichen“ nur bei einem Fahrzeug – verweistyp auf ein optionales Ziel (Fall 2). */
const VERTRAEGE = paket('vertraege', 'Verträge', `- schluessel: vertrag
  name: Vertrag
  felder:
    - { key: name, label: Name, typ: text }
    - { key: partner, label: Partner, typ: referenz, ziel: "basis:organisation" }
    - { key: betrifft, label: Betrifft, typ: referenz, zielOptional: ["fahrzeuge:fahrzeug", "haushalt:anschaffung"] }
    - { key: kennzeichen, label: Kennzeichen, typ: text, anzeigen: { bedingungen: [{ art: verweistyp, feld: betrifft, typ: "fahrzeuge:fahrzeug" }] } }
  register: [{ key: daten, name: Daten, art: felder, felder: [name, partner, betrifft, kennzeichen] }]
`, ['basis'], '- { schluessel: vertraege, name: Verträge, typen: [vertrag] }\n');

/** Rechnung und Position zeigen aufeinander; „Menge“ hängt an „Erste Position“ (Fall 1); Abschnitt „Fahrzeug“ (Fall 2). */
const RECHNUNG = `- schluessel: rechnung
  name: Rechnung
  felder:
    - { key: nr, label: Nummer, typ: text }
    - { key: betrifft, label: Betrifft, typ: referenz, ziel: "vertraege:vertrag", zielOptional: ["fahrzeuge:fahrzeug", "haushalt:anschaffung"] }
    - { key: erste, label: Erste Position, typ: referenz, ziel: position }
    - { key: menge, label: Menge, typ: zahl, anzeigen: { bedingungen: [{ art: feld, bedingung: { feld: erste, op: nichtLeer } }] } }
    - { key: km, label: Kilometerstand, typ: zahl }
  register:
    - key: daten
      name: Daten
      art: felder
      felder: [nr, betrifft, erste, menge, km]
      abschnitte: [{ vor: km, titel: Fahrzeug, anzeigen: { bedingungen: [{ art: feld, bedingung: { feld: betrifft, op: zeigtAufTyp, wert: { art: fest, wert: ["fahrzeuge:fahrzeug"] } } }] } }]
    - { key: positionen, name: Positionen, art: verknuepfungen, quellen: [{ typ: position, feld: rechnung }] }
`;
const POSITION = `- schluessel: position
  name: Position
  felder:
    - { key: text, label: Text, typ: text }
    - { key: rechnung, label: Rechnung, typ: referenz, ziel: rechnung }
  register: [{ key: daten, name: Daten, art: felder, felder: [text, rechnung] }]
`;
const rechnungen = (positionZuerst = false) => paket('rechnungen', 'Rechnungen', positionZuerst ? POSITION + RECHNUNG : RECHNUNG + POSITION, ['vertraege']);
/** Fahrzeug bzw. Anschaffung: Register mit Quellen über zielOptional anderer Pakete (Fall 3). */
const mitQuellen = (id: string, name: string, schluessel: string, typName: string, feld = 'betrifft') => paket(id, name, `- schluessel: ${schluessel}
  name: ${typName}
  felder: [{ key: name, label: Name, typ: text }]
  register:
    - { key: daten, name: Daten, art: felder, felder: [name] }
    - { key: rechnungen, name: Rechnungen, art: verknuepfungen, quellen: [{ typ: "rechnungen:rechnung", feld: ${feld} }] }
    - { key: vertraege, name: Verträge, art: verknuepfungen, quellen: [{ typ: "vertraege:vertrag", feld: betrifft }] }
`, ['vertraege', 'rechnungen']);
const FAHRZEUGE = mitQuellen('fahrzeuge', 'Fahrzeuge', 'fahrzeug', 'Fahrzeug');
const HAUSHALT_PAKET = mitQuellen('haushalt', 'Haushalt', 'anschaffung', 'Anschaffung');

const fehlerMit = (status: number, re: RegExp) => (e: unknown) => e instanceof Fachfehler && e.status === status && [e.message, ...((e.details as { gruende?: string[] })?.gruende ?? [])].some((g) => re.test(g));

async function aufbau(pg: boolean, katalog?: Katalog, archive: Record<string, Buffer> = {}) {
  const d = new Dienst(await repo(pg), speicherDateien(), { einstellungen: speicherEinstellungen() });
  const abruf = async (u: string) => {
    if (u === KATALOG && katalog) return Buffer.from(JSON.stringify(katalog));
    const a = Object.entries(archive).find(([k]) => u.endsWith(k));
    if (a) return a[1];
    throw new Error(`404 ${u}`);
  };
  const p = new Paketverwaltung(d, { version: () => '0.245.0', abruf, katalogUrl: KATALOG });
  const hoch = async (dateien: Record<string, string>) => p.hochladen(archiv(dateien), ICH);
  const installiere = async (dateien: Record<string, string>, mehr: Record<string, unknown> = {}) => p.installiere({ upload: (await hoch(dateien)).upload, bestaetigt: true, ...mehr }, ICH);
  const typ = async (k: string) => (await d.mappentypen.listeTypen()).find((x) => x.schluessel === k)!;
  return { d, p, hoch, installiere, typ };
}

/** Quellen eines Registers als „kennung.feld“. */
async function quellen(d: Dienst, t: Mappentyp, register: string): Promise<string[]> {
  const typen = await d.mappentypen.listeTypen();
  return (t.register.find((r) => r.key === register)?.quellen ?? []).map((q) => `${typen.find((x) => x.id === q.typId)?.schluessel}.${q.feldKey}`).sort();
}

for (const pg of [false, true]) {
  describe(`Installieren unabhängig von der Reihenfolge (#1122)${pg ? ' – PostgreSQL' : ''}`, { skip: pg && !url ? 'TEST_DATABASE_URL nicht gesetzt' : false }, () => {
    for (const reihe of [['fahrzeuge', 'haushalt'], ['haushalt', 'fahrzeuge']]) {
      it(`Fall 3: Quellen über zielOptional vollständig – ${reihe.join(' vor ')}`, async () => {
        const { d, p, installiere, typ } = await aufbau(pg);
        for (const x of [BASIS, VERTRAEGE, rechnungen()]) await installiere(x);
        for (const id of reihe) await installiere(id === 'fahrzeuge' ? FAHRZEUGE : HAUSHALT_PAKET);
        for (const k of ['fahrzeuge:fahrzeug', 'haushalt:anschaffung']) {
          assert.deepEqual(await quellen(d, await typ(k), 'rechnungen'), ['rechnungen:rechnung.betrifft'], `${k}: Rechnungen`);
          assert.deepEqual(await quellen(d, await typ(k), 'vertraege'), ['vertraege:vertrag.betrifft'], `${k}: Verträge`);
        }
        const fz = (await typ('fahrzeuge:fahrzeug')).id, an = (await typ('haushalt:anschaffung')).id;
        const rechnung = await typ('rechnungen:rechnung'), vertrag = await typ('vertraege:vertrag');
        assert.deepEqual(new Set(rechnung.felder.find((f) => f.key === 'betrifft')!.zielTypen), new Set([vertrag.id, fz, an]));
        // Fall 2, danach: Die Kennung in den Bedingungen ist jetzt die Id des Fahrzeugs.
        assert.deepEqual(vertrag.felder.find((f) => f.key === 'kennzeichen')!.anzeigen!.bedingungen, [{ art: 'verweistyp', feld: 'betrifft', typ: fz }]);
        const abschnitt = rechnung.register.find((r) => r.key === 'daten')!.abschnitte![0].anzeigen!.bedingungen[0];
        assert.deepEqual(abschnitt.art === 'feld' && abschnitt.bedingung.wert, { art: 'fest', wert: [fz] });
        // Das spätere Paket ist keine eigene Änderung an Verträge und Rechnungen.
        const inst = await p.installierte(), typen = await d.mappentypen.listeTypen();
        for (const id of ['vertraege', 'rechnungen']) {
          const ip = inst.find((x) => x.id === id)!;
          for (const tid of Object.values(ip.typen)) assert.equal(aenderung(typen.find((x) => x.id === tid)!, ip, (i) => typen.find((x) => x.id === i)?.schluessel).geaendert, false, `${id}: ${tid}`);
        }
      });
    }

    for (const positionZuerst of [false, true]) {
      it(`Fall 1: Bedingung auf ein Feld aus dem zweiten Durchgang, Quelle zwischen eigenen Typen – ${positionZuerst ? 'Position' : 'Rechnung'} zuerst`, async () => {
        const { d, installiere, typ } = await aufbau(pg);
        for (const x of [BASIS, VERTRAEGE, rechnungen(positionZuerst)]) await installiere(x);
        const rechnung = await typ('rechnungen:rechnung');
        assert.deepEqual(rechnung.felder.find((f) => f.key === 'menge')!.anzeigen, { modus: 'alle', bedingungen: [{ art: 'feld', bedingung: { art: 'feld', feld: 'erste', op: 'nichtLeer' } }] });
        assert.ok(rechnung.felder.some((f) => f.key === 'erste'));
        assert.deepEqual(await quellen(d, rechnung, 'positionen'), ['rechnungen:position.rechnung']);
        assert.deepEqual(anzeigeProblemeVon(rechnung), {});
      });
    }

    it('Fall 2: verweistyp und zeigtAufTyp auf ein fehlendes optionales Ziel – kein Fehler, trifft nie zu', async () => {
      const { installiere, typ } = await aufbau(pg);
      for (const x of [BASIS, VERTRAEGE, rechnungen()]) await installiere(x);
      const vertrag = await typ('vertraege:vertrag'), rechnung = await typ('rechnungen:rechnung');
      const regel = vertrag.felder.find((f) => f.key === 'kennzeichen')!.anzeigen!;
      assert.deepEqual(regel.bedingungen, [{ art: 'verweistyp', feld: 'betrifft', typ: 'fahrzeuge:fahrzeug' }], 'Kennung bleibt stehen');
      assert.deepEqual(anzeigeProblemeVon(vertrag), {});
      assert.deepEqual(anzeigeProblemeVon(rechnung), {});
      const typVon = () => 'irgendein-typ';
      assert.equal(zeigtAn(regel, vertrag, { betrifft: 'm1' }, { typVon }), false, 'trifft nie zu');
      assert.equal(zeigtAn({ ...regel, bedingungen: [{ ...regel.bedingungen[0], nicht: true }] }, vertrag, { betrifft: 'm1' }, { typVon }), true, 'umgekehrt immer');
      const abschnitt = rechnung.register.find((r) => r.key === 'daten')!.abschnitte![0].anzeigen!;
      assert.equal(zeigtAn(abschnitt, rechnung, { betrifft: ['m1'] }, { typVon }), false);
    });

    it('Fall 2: Fahrzeuge vor Rechnungen – die Bedingungen nennen gleich die Id', async () => {
      const { installiere, typ } = await aufbau(pg);
      const fahrzeugeAllein = paket('fahrzeuge', 'Fahrzeuge', '- schluessel: fahrzeug\n  name: Fahrzeug\n  felder: [{ key: name, label: Name, typ: text }]\n  register: [{ key: daten, name: Daten, art: felder, felder: [name] }]\n');
      for (const x of [BASIS, fahrzeugeAllein, VERTRAEGE, rechnungen()]) await installiere(x);
      const fz = (await typ('fahrzeuge:fahrzeug')).id;
      const rechnung = await typ('rechnungen:rechnung'), vertrag = await typ('vertraege:vertrag');
      assert.deepEqual(vertrag.felder.find((f) => f.key === 'kennzeichen')!.anzeigen!.bedingungen, [{ art: 'verweistyp', feld: 'betrifft', typ: fz }]);
      const b = rechnung.register.find((r) => r.key === 'daten')!.abschnitte![0].anzeigen!.bedingungen[0];
      assert.deepEqual(b.art === 'feld' && b.bedingung.wert, { art: 'fest', wert: [fz] });
      assert.equal(zeigtAn(rechnung.register.find((r) => r.key === 'daten')!.abschnitte![0].anzeigen, rechnung, { betrifft: ['m1'] }, { typVon: () => fz }), true, 'wirkt');
    });

    it('Fall 2: ein Ziel außerhalb von zielOptional bleibt ein Fehler', async () => {
      const { installiere, p } = await aufbau(pg);
      for (const x of [BASIS, VERTRAEGE]) await installiere(x);
      const falsch = paket('notizen', 'Notizen', `- schluessel: notiz
  name: Notiz
  felder:
    - { key: zu, label: Zu, typ: referenz, ziel: "vertraege:vertrag", zielOptional: ["fahrzeuge:fahrzeug"] }
    - { key: kennzeichen, label: Kennzeichen, typ: text, anzeigen: { bedingungen: [{ art: verweistyp, feld: zu, typ: "haushalt:anschaffung" }] } }
  register: [{ key: daten, name: Daten, art: felder, felder: [zu, kennzeichen] }]
`, ['vertraege']);
      await assert.rejects(installiere(falsch), (e) => e instanceof Fachfehler && /haushalt:anschaffung/.test(e.message));
      assert.equal((await p.installierte()).some((x) => x.id === 'notizen'), false);
    });

    it('nichts fällt still weg: eine Quelle, die sich nicht anlegen lässt, ist ein Fehler mit Stelle', async () => {
      const { d, p, installiere } = await aufbau(pg);
      for (const x of [BASIS, VERTRAEGE, rechnungen()]) await installiere(x);
      const typen = (await d.mappentypen.listeTypen()).length;
      // „Nummer“ der Rechnung ist kein Verweis auf das Fahrzeug – früher fiel die Quelle beim Speichern still weg.
      await assert.rejects(installiere(mitQuellen('fahrzeuge', 'Fahrzeuge', 'fahrzeug', 'Fahrzeug', 'nr')), fehlerMit(422, /Fahrzeug.*Rechnungen.*„rechnungen:rechnung\.nr“/));
      assert.equal((await d.mappentypen.listeTypen()).length, typen, 'zurückgenommen');
      assert.equal((await p.installierte()).some((x) => x.id === 'fahrzeuge'), false);
    });
  });

  describe(`Namenskonflikte in der Vorschau (#1123)${pg ? ' – PostgreSQL' : ''}`, { skip: pg && !url ? 'TEST_DATABASE_URL nicht gesetzt' : false }, () => {
    it('Mappentyp und Ansicht: selbst angelegt bzw. aus einem Paket – in probleme, vor dem Anlegen, mit Namen gelöst', async () => {
      const { d, p, hoch, installiere } = await aufbau(pg);
      await installiere(BASIS);
      await d.mappentypen.legeTypAn({ name: 'Vertrag', felder: [{ key: 'name', label: 'Name', typ: 'text' }] });
      await d.legeSichtAn({ name: 'Verträge', typen: [] });
      const { vorschau: v } = await hoch(VERTRAEGE);
      const erwartet = [
        'Mappentyp „Vertrag“: Den Namen hat schon ein selbst angelegter Mappentyp. Bitte einen anderen wählen, etwa „Vertrag (Verträge)“.',
        'Ansicht „Verträge“: Den Namen hat auf der obersten Ebene schon eine selbst angelegte Ansicht. Bitte einen anderen wählen, etwa „Verträge (Verträge)“.',
      ];
      assert.deepEqual(v.namenskonflikte, erwartet);
      assert.deepEqual(v.probleme, erwartet);
      assert.ok(v.fehlercodes.includes('namenskonflikt'));
      const typen = (await d.mappentypen.listeTypen()).length;
      await assert.rejects(installiere(VERTRAEGE), (e) => e instanceof Fachfehler && e.status === 409 && (e.details as { konflikte?: boolean }).konflikte === true);
      assert.equal((await d.mappentypen.listeTypen()).length, typen, 'nichts angelegt');
      const ok = await installiere(VERTRAEGE, { namen: { vertrag: 'Vertrag (Verträge)' }, sichtNamen: { vertraege: 'Verträge (Paket)' } });
      assert.equal((await d.mappentypen.listeTypen()).find((x) => x.id === ok.typen.vertrag)!.name, 'Vertrag (Verträge)');
      // Aus einem Paket: „Position“ gibt es schon in „Lager“.
      await installiere(paket('lager', 'Lager', '- schluessel: position\n  name: Position\n  felder: [{ key: text, label: Text, typ: text }]\n  register: [{ key: daten, name: Daten, art: felder, felder: [text] }]\n'));
      const { vorschau: r } = await hoch(rechnungen());
      assert.deepEqual(r.namenskonflikte, ['Mappentyp „Position“: Den Namen hat schon der Mappentyp aus dem Paket „Lager“. Bitte einen anderen wählen, etwa „Position (Rechnungen)“.']);
      assert.equal((await p.installierte()).some((x) => x.id === 'rechnungen'), false);
    });

    it('Abhängigkeit, die mitinstalliert würde: Konflikt in probleme (nicht durch Umbenennen lösbar), eigene Typen dagegen geprüft', async () => {
      const zip = archiv(VERTRAEGE);
      const katalog: Katalog = { format: 1, erstellt: '', quelle: '', pakete: [
        { id: 'vertraege', name: 'Verträge', beschreibung: '', autor: { name: 'Test', github: 'test' }, lizenz: 'MIT', aktuell: '1.0.0', versionen: [{ version: '1.0.0', dms: '>=0.60.0', abhaengigkeiten: { basis: '>=1.0.0' }, inhalt: { mappentypen: [{ schluessel: 'vertrag', name: 'Vertrag' }], sichten: [], beispiele: 0 }, code: false, archiv: 'archive/vertraege-1.0.0.zip', sha256: createHash('sha256').update(zip).digest('hex'), groesse: zip.length, veroeffentlicht: '2026-11-01T00:00:00Z', quelle: '', readme: '', changelog: '' }] },
      ] } as unknown as Katalog;
      const { d, p, hoch, installiere } = await aufbau(pg, katalog, { 'archive/vertraege-1.0.0.zip': zip });
      assert.deepEqual((await p.abrufen(false)).kataloge.map((k) => k.fehler), [null]);
      await installiere(BASIS);
      await d.mappentypen.legeTypAn({ name: 'Vertrag', felder: [{ key: 'name', label: 'Name', typ: 'text' }] });
      // Ein Paket, das Verträge braucht und selbst einen Typ „Vertrag“ mitbrächte.
      const fremd = paket('kfz', 'Kfz', '- schluessel: vertrag\n  name: Vertrag\n  felder: [{ key: name, label: Name, typ: text }]\n  register: [{ key: daten, name: Daten, art: felder, felder: [name] }]\n', ['vertraege']);
      const { vorschau: v } = await hoch(fremd);
      assert.ok(v.probleme.includes('Abhängigkeit „Verträge“: Ihren Mappentyp „Vertrag“ gibt es schon – ein selbst angelegter Mappentyp. Installiere „Verträge“ vorher einzeln und wähle dort einen anderen Namen.'), v.probleme.join('\n'));
      assert.ok(v.fehlercodes.includes('namenskonflikt-abhaengigkeit'));
      assert.deepEqual(v.namenskonflikte, ['Mappentyp „Vertrag“: Den Namen hat schon ein selbst angelegter Mappentyp. Bitte einen anderen wählen, etwa „Vertrag (Kfz)“.']);
      // Ohne den eigenen Typ: Der Typ der Abhängigkeit zählt schon, bevor sie installiert ist.
      await d.mappentypen.loescheTyp((await d.mappentypen.listeTypen()).find((x) => x.name === 'Vertrag')!.id);
      const { vorschau: w } = await hoch(fremd);
      assert.deepEqual(w.namenskonflikte, ['Mappentyp „Vertrag“: Den Namen hat schon ein Mappentyp aus „Verträge“, das als Abhängigkeit mitinstalliert wird. Bitte einen anderen wählen, etwa „Vertrag (Kfz)“.']);
      assert.deepEqual(w.probleme, w.namenskonflikte);
    });
  });
}
