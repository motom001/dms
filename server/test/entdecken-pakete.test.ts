/**
 * Rundgänge aus Paketen (#831): Format im Paket (`inhalt.rundgaenge`), Prüfung beim Installieren, Anzeige je Person,
 * Angebot als Tipp nach der Installation, „oeffne“ mit Ersatztext.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { HANDBUCH_VERWEIS, pruefeRundgaenge, rundgangFuer } from '../../shared/src/entdecken';
import type { InstalliertesPaket } from '../../shared/src/pakete';
import { ankerListe, Entdecken } from '../src/entdecken';
import { Fachfehler } from '../src/fehler';
import { liesPaket } from '../src/pakete';
import { Konten } from '../src/konten';
import { speicherKontoRepo } from '../src/konto-repo';

const MANIFEST = 'schema: 1\nid: vertraege\nname: Verträge\nversion: 2.1.0\nbeschreibung: x\nautor: { name: x, github: x }\nlizenz: Apache-2.0\ndms: ">=0.256.0"\n'
  + 'inhalt:\n  mappentypen: inhalt/mappentypen.yaml\n  rundgaenge: inhalt/rundgaenge.yaml\n';
const TYPEN = '- schluessel: vertrag\n  name: Vertrag\n  felder:\n    - { key: anbieter, label: Anbieter, typ: text }\n    - { key: kuendigen_bis, label: Kündigen bis, typ: datum }\n'
  + '  register:\n    - { key: dokumente, name: Dokumente, art: dokumente }\n';
const RUNDGANG = `- schluessel: kennenlernen
  titel: Verträge im Überblick
  beschreibung: Wo Fristen und Unterlagen eines Vertrags stehen.
  start: nach_installation
  oeffne:
    mappe: { typ: vertrag }
  ersatz: Sobald du einen Vertrag angelegt hast, zeigt dir Ablago hier, wie es geht.
  schritte:
    - schluessel: frist
      ziel: mappe.feld:kuendigen_bis
      ort: Rechts in der Mappe
      titel: Kündigen bis
      text: Hier steht, bis wann du kündigen musst.
      handbuch: admin/pakete/#so-nutzt-du-es
      sonst_verwalten: Frag die Person, die Ablago bei euch verwaltet.
    - schluessel: dokumente
      ziel: mappe.register:dokumente
      ort: Register oben in der Mappe
      titel: Dokumente
      text: Hier liegen der Vertrag und alle Briefe dazu.
`;
const lies = (rundgaenge: string) => liesPaket(new Map([['manifest.yaml', Buffer.from(MANIFEST)], ['inhalt/mappentypen.yaml', Buffer.from(TYPEN)], ['inhalt/rundgaenge.yaml', Buffer.from(rundgaenge)]]));
const gruende = (f: () => unknown) => { try { f(); } catch (e) { if (e instanceof Fachfehler) return JSON.stringify(e.details); throw e; } return ''; };

describe('Rundgänge aus Paketen: Prüfung beim Installieren (#831)', () => {
  it('ein gültiger Rundgang kommt roh ans Paket; Felder und Register gibt es im eigenen Mappentyp', () => {
    const p = lies(RUNDGANG);
    assert.equal(p.entdecken?.rundgaenge?.length, 1);
  });

  it('lehnt unbekannte Anker, fehlende Felder und Register, doppeltes nach_installation und falsche Verweise ab', () => {
    assert.match(gruende(() => lies(RUNDGANG.replace('mappe.feld:kuendigen_bis', 'mappe.feld:gibt_es_nicht'))), /Das Feld „gibt_es_nicht“ gibt es im Mappentyp „vertraege:vertrag“ nicht/);
    assert.match(gruende(() => lies(RUNDGANG.replace('mappe.register:dokumente', 'mappe.register:briefe'))), /Das Register „briefe“/);
    assert.match(gruende(() => lies(RUNDGANG.replace('mappe.register:dokumente', 'gibt.es.nicht'))), /unbekannter Anker/);
    assert.match(gruende(() => lies(RUNDGANG.replace('typ: vertrag', 'typ: fremd:vertrag'))), /Den Mappentyp „fremd:vertrag“ gibt es nicht/);
    assert.match(gruende(() => lies(RUNDGANG + RUNDGANG.replace('kennenlernen', 'zweiter'))), /„nach_installation“ darf es nur einmal je Paket geben/);
    assert.match(gruende(() => lies(RUNDGANG.replace('admin/pakete/#so-nutzt-du-es', 'https://example.org'))), /„handbuch“ muss eine Seite im Handbuch sein/);
    assert.match(gruende(() => lies(RUNDGANG.replace('start: nach_installation', 'start: erste_anmeldung'))), /nur für Ablagos eigenen Rundgang/);
  });

  it('Fehler tragen ihren Ort in der Datei; Ablagos eigene Rundgänge öffnen keinen Mappentyp', () => {
    const r = pruefeRundgaenge([{ schluessel: 'a', titel: 'A', beschreibung: 'B', schritte: [{ schluessel: 's', titel: 'T', text: 'X', ziel: 'gibt.es.nicht', ort: 'O' }] }], { herkunft: 'paket:p', anker: ankerListe() });
    assert.deepEqual(r.orte, [[0, 'schritte', 0, 'ziel']]);
    const a = pruefeRundgaenge([{ schluessel: 'a', titel: 'A', beschreibung: 'B', oeffne: { mappe: { typ: 'x' } }, schritte: [{ schluessel: 's', titel: 'T', text: 'X' }] }], { herkunft: 'ablago', anker: ankerListe() });
    assert.match(a.fehler.join('\n'), /„oeffne: mappe“ gibt es nur für Rundgänge aus Paketen und eigene Rundgänge/);
    assert.ok(HANDBUCH_VERWEIS.test('benutzer/') && HANDBUCH_VERWEIS.test('admin/pakete/#so-nutzt-du-es') && !HANDBUCH_VERWEIS.test('entwickler/x/'));
  });
});

describe('Rundgänge aus Paketen: Anzeige je Person (#831)', () => {
  const tag = 24 * 3600 * 1000;
  async function aufbau(o: { installiert: number; lesbar: string[]; oeffnen?: string | null }) {
    const konten = new Konten(speicherKontoRepo(), null, 'http://nas');
    const { benutzer: lena } = await konten.einrichten({ email: 'lena@example.org', name: 'Lena', passwort: 'ein-langes-passwort' });
    const { benutzer: jonas } = await konten.legeBenutzerAn({ email: 'jonas@example.org', name: 'Jonas' }, lena.id);
    const jetzt = Date.parse('2026-11-15T10:00:00Z');
    const paket = { id: 'vertraege', version: '2.1.0', installiert: new Date(jetzt - o.installiert * tag).toISOString(), aktualisiert: null, entdecken: { rundgaenge: lies(RUNDGANG).entdecken!.rundgaenge } } as unknown as InstalliertesPaket;
    const gefragt: string[] = [];
    const e = new Entdecken({
      einstellungen: (b) => konten.einstellungen(b), setzeEinstellung: (b, k, w) => konten.setzeEinstellung(b, k, w),
      version: () => '0.260.0', heute: () => '2026-11-15', funktionen: async () => new Set(), jetzt: () => jetzt,
      pakete: async () => [paket],
      typen: async () => [{ kennung: 'vertraege:vertrag', felder: ['anbieter', 'kuendigen_bis'], register: ['dokumente'] }],
      lesbareTypen: async (b) => new Set(b.id === jonas.id ? o.lesbar : ['vertraege:vertrag']),
      oeffnen: async (_b, typ, art) => { gefragt.push(`${art}:${typ}`); return o.oeffnen === undefined ? '/ablage/t1/m1' : o.oeffnen; },
    });
    return { e, lena: { ...lena, letzteAnmeldung: null }, jonas: { ...jonas, letzteAnmeldung: null }, gefragt };
  }

  it('Paket-Rundgang mit Präfix, nie von selbst; nach der Installation einmal als Tipp angeboten', async () => {
    const { e, jonas } = await aufbau({ installiert: 2, lesbar: ['vertraege:vertrag'] });
    const s = await e.stand(jonas);
    const r = s.rundgaenge.find((x) => x.schluessel === 'vertraege:kennenlernen');
    assert.ok(r, 'Rundgang des Pakets');
    assert.equal(r.herkunft, 'paket:vertraege');
    assert.deepEqual(r.oeffne, { mappe: 'vertraege:vertrag' });
    assert.equal(r.schritte[0].sonstVerwalten, 'Frag die Person, die Ablago bei euch verwaltet.', 'Jonas verwaltet nicht');
    assert.equal(s.starten, 'ablago', 'von selbst startet nur Ablagos eigener Rundgang');
    const angebot = s.tipps.find((x) => x.rundgang === 'vertraege:kennenlernen');
    assert.ok(angebot?.neu, 'als „Neu“ angeboten');
    assert.equal(angebot.text, 'Verträge im Überblick – kurzer Rundgang');
    assert.equal(s.tipp?.schluessel, angebot.schluessel, 'Neues zuerst – höchstens ein Tipp am Tag');
    await e.tipp(jonas, angebot.schluessel, 'erledigt');
  });

  it('nach 30 Tagen kein Angebot mehr; ohne Leserecht auf den Mappentyp kein Rundgang', async () => {
    const alt = await aufbau({ installiert: 40, lesbar: ['vertraege:vertrag'] });
    const s = await alt.e.stand(alt.jonas);
    assert.ok(s.rundgaenge.some((x) => x.schluessel === 'vertraege:kennenlernen'));
    assert.ok(!s.tipps.some((x) => x.rundgang === 'vertraege:kennenlernen'));
    const ohne = await aufbau({ installiert: 2, lesbar: [] });
    const s2 = await ohne.e.stand(ohne.jonas);
    assert.ok(!s2.rundgaenge.some((x) => x.schluessel === 'vertraege:kennenlernen'));
    assert.ok(!s2.tipps.some((x) => x.rundgang === 'vertraege:kennenlernen'), 'kein Angebot für einen Rundgang, den es nicht gibt');
    const lena = (await ohne.e.stand(ohne.lena)).rundgaenge.find((x) => x.schluessel === 'vertraege:kennenlernen');
    assert.equal(lena?.schritte[0].sonstVerwalten, undefined, 'wer verwaltet, braucht den Satz nicht');
  });

  it('„oeffne“: Pfad der ersten lesbaren Mappe bzw. null für den Ersatztext', async () => {
    const a = await aufbau({ installiert: 2, lesbar: ['vertraege:vertrag'] });
    assert.deepEqual(await a.e.oeffnen(a.jonas, 'vertraege:kennenlernen'), { pfad: '/ablage/t1/m1' });
    assert.deepEqual(a.gefragt, ['mappe:vertraege:vertrag']);
    const b = await aufbau({ installiert: 2, lesbar: ['vertraege:vertrag'], oeffnen: null });
    assert.deepEqual(await b.e.oeffnen(b.jonas, 'vertraege:kennenlernen'), { pfad: null });
    assert.deepEqual(await b.e.oeffnen(b.jonas, 'ablago'), { pfad: null }, 'Ablagos Rundgang öffnet nur eine Seite');
    await assert.rejects(b.e.oeffnen(b.jonas, 'gibt:es_nicht'));
  });

  it('rundgangFuer: Mappentyp nur für Personen, die ihn lesen dürfen', () => {
    const r = pruefeRundgaenge([{ schluessel: 'a', titel: 'A', beschreibung: 'B', oeffne: { neu: { typ: 'rechnung' } }, schritte: [{ schluessel: 's', titel: 'T', text: 'X' }] }],
      { herkunft: 'paket:p', anker: ankerListe(), typ: (k) => ({ kennung: `p:${k}` }) }).rundgaenge[0];
    assert.deepEqual(r.oeffne, { neu: 'p:rechnung' });
    assert.equal(rundgangFuer(r, { verwalten: false, funktionen: new Set(), lesbar: new Set() }), null);
    assert.ok(rundgangFuer(r, { verwalten: false, funktionen: new Set(), lesbar: new Set(['p:rechnung']) }));
  });
});
