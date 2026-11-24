/**
 * Mitgelieferte Automatisierungen nach Entfernen und Neuinstallieren eines Pakets (#1586) und an/aus beim Speichern
 * (#1601). Paket und Namen sind erfunden; der Kern läuft im Arbeitsspeicher.
 * - Entfernen räumt Unveränderte auf, die ohne das Paket nicht mehr passen – auch eingeschaltete.
 * - Geänderte bleiben; verwaist lassen sie sich ausschalten und löschen; eine Neuinstallation verknüpft sie mit dem
 *   neuen Mappentyp (keine Dublette, „angehalten, passt nicht mehr“ aufgehoben).
 * - Speichern ohne an/aus (Editor) ändert an/aus nicht; ausgeschaltet bleibt aus.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { automatisierungsProbleme } from '../../shared/src/automatisierung';
import { Automatisierungen, speicherAutomatisierungRepo } from '../src/automatisierung';
import '../src/automatisierung/automatisierung-karten';
import { speicherDateien } from '../src/dateien/dateispeicher';
import { Dienst } from '../src/dienst/dienst';
import { speicherEinstellungen } from '../src/einstellungen/einstellungen';
import { Fachfehler } from '../src/grundlagen/fehler';
import { Konten } from '../src/konten';
import { speicherKontoRepo } from '../src/konten/konto-repo';
import { Paketverwaltung } from '../src/pakete/verwaltung/index';
import { speicherRepo } from '../src/repo/speicher';
import { zipPuffer } from '../src/formate/zip';

const ICH = { id: '00000000-0000-4000-8000-0000000000aa', email: 'admin@example.org' };
const NAME = 'Ausweis läuft ab';
const archiv = (d: Record<string, string>) =>
  zipPuffer(
    Object.entries(d).map(([name, inhalt]) => ({ name, daten: Buffer.from(inhalt) })),
    new Date('2026-01-01T12:00:00Z'),
  );
const HAUSHALT = {
  'manifest.yaml':
    'schema: 1\nid: haushalt\nname: Haushalt\nversion: 1.0.0\nbeschreibung: Test.\nautor: { name: Test, github: test }\nlizenz: MIT\ndms: ">=0.231.0"\ninhalt:\n  mappentypen: inhalt/mappentypen.yaml\n  automatisierungen: inhalt/automatisierungen.yaml\n',
  'inhalt/mappentypen.yaml': `- schluessel: ausweis
  name: Ausweis
  felder:
    - { key: bezeichnung, label: Bezeichnung, typ: text }
    - { key: gueltig_bis, label: Gültig bis, typ: datum }
  register:
    - { key: ausweis, name: Ausweis, art: felder, felder: [bezeichnung, gueltig_bis] }
`,
  'inhalt/automatisierungen.yaml': `- schluessel: ablauf
  name: ${NAME}
  wenn: { art: datum, typ: ausweis, feld: gueltig_bis, vorlauf: 30, einheit: tage }
  dann:
    - { art: aufgabe, als: aufgabe, empfaenger: [{ art: ersteller }], text: "Ausweis erneuern" }
`,
};

const ist409 = (e: unknown) => e instanceof Fachfehler && e.status === 409;

async function aufbau() {
  const d = new Dienst(speicherRepo(), speicherDateien(), { einstellungen: speicherEinstellungen() });
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
  const repo = speicherAutomatisierungRepo(() => Date.now());
  const motor = new Automatisierungen({ dienst: d, repo });
  const p = new Paketverwaltung(d, {
    version: () => '0.231.0',
    abruf: async (u) => {
      throw new Error(`404 ${u}`);
    },
    katalogUrl: 'https://katalog.test/katalog.json',
  });
  const installiere = async (ein: string[] = []) => {
    const h = await p.hochladen(archiv(HAUSHALT), ICH);
    return p.installiere({ upload: h.upload, bestaetigt: true, rechteBestaetigt: true, automatisierungen: ein }, ICH);
  };
  const alle = async () => (await motor.uebersicht()).automatisierungen.filter((a) => a.name === NAME);
  const typId = async () => (await d.kern.repo.listePakete()).find((x) => x.id === 'haushalt')?.typen.ausweis;
  return { d, markus, motor, repo, p, installiere, alle, typId };
}

describe('Verwaiste Automatisierung nach Entfernen und Neuinstallieren (#1586)', () => {
  it('unverändert: Entfernen räumt sie mit auf – auch eingeschaltet; Neuinstallation legt genau eine an', async () => {
    const x = await aufbau();
    await x.installiere(['ablauf']);
    assert.equal((await x.alle())[0].aktiv, true);
    await x.p.entferne('haushalt', ICH);
    assert.deepEqual(await x.alle(), [], 'mit dem Paket entfernt');
    await x.installiere();
    const [a, ...mehr] = await x.alle();
    assert.equal(mehr.length, 0, 'keine Dublette');
    assert.equal((a.wenn as { typ: string }).typ, await x.typId());
    assert.deepEqual(a.probleme, []);
  });

  it('geändert: bleibt verwaist, lässt sich aus- und einschalten bzw. löschen; Neuinstallation verknüpft den neuen Typ', async () => {
    const x = await aufbau();
    await x.installiere();
    const vorher = await x.typId();
    const [a] = await x.alle();
    // Eingeschaltet von Hand (zählt als geändert, wie eine Änderung im Editor).
    await x.motor.schalte(a.id, true, x.markus.id);
    await x.p.entferne('haushalt', ICH);
    const [v] = await x.alle();
    assert.ok(v, 'geändert bleibt sie stehen');
    assert.ok(v.probleme.length > 0, 'ohne Paket passt sie nicht mehr');
    // Angehalten wie nach einem Lauf, der den Mappentyp nicht fand.
    await x.repo.setze(v.id, { angehalten: { grund: 'fehlerhaft', text: v.probleme.join(' '), zeit: new Date().toISOString() } });
    // Neu installiert: dieselbe Automatisierung zeigt auf den neuen Mappentyp, läuft wieder, keine zweite.
    await x.installiere();
    const nachher = await x.typId();
    assert.ok(nachher);
    assert.notEqual(nachher, vorher, 'der Mappentyp hat nach der Neuinstallation eine neue Id');
    const liste = await x.alle();
    assert.equal(liste.length, 1, 'keine Dublette');
    const [n] = liste;
    assert.equal(n.id, a.id);
    assert.equal((n.wenn as { typ: string }).typ, nachher, `Typ neu verknüpft (vorher ${vorher})`);
    assert.deepEqual(n.probleme, []);
    assert.equal(n.angehalten, null, '„passt nicht mehr“ aufgehoben');
    assert.equal(n.aktiv, true, 'an/aus bleibt');
    assert.notEqual(n.geaendertVon, null, 'gilt weiter als geändert');
  });

  it('verwaist: ausschalten und löschen gehen immer; mitgeliefert und gültig bleibt Löschen gesperrt', async () => {
    const x = await aufbau();
    await x.installiere();
    const [a] = await x.alle();
    await assert.rejects(x.motor.loesche(a.id), ist409, 'gültig und mitgeliefert: nicht löschbar (#1174)');
    await x.motor.schalte(a.id, true, x.markus.id);
    await x.p.entferne('haushalt', ICH);
    const [v] = await x.alle();
    assert.ok(automatisierungsProbleme(v, await x.motor.kontext()).length > 0);
    assert.equal((await x.motor.schalte(v.id, false, x.markus.id)).aktiv, false, 'ausschalten');
    await x.motor.loesche(v.id);
    assert.deepEqual(await x.alle(), [], 'gelöscht');
  });
});

describe('An/aus beim Speichern (#1601)', () => {
  it('Speichern ohne an/aus (Editor) lässt sie aus; über die Liste ebenso; ausdrücklich gesetzt gilt weiter', async () => {
    const x = await aufbau();
    await x.installiere(['ablauf']);
    const [a] = await x.alle();
    // Editor: Schalter aus (wirkt sofort), dann Name ändern und speichern – ohne aktiv im Rumpf.
    let s = await x.motor.schalte(a.id, false, x.markus.id);
    s = await x.motor.aendere(a.id, { name: 'Ausweis bald abgelaufen', version: s.version }, x.markus.id);
    assert.equal(s.aktiv, false, 'nach dem Speichern weiter aus');
    // Liste: ein, wieder aus, dann speichern.
    await x.motor.schalte(a.id, true, x.markus.id);
    s = await x.motor.schalte(a.id, false, x.markus.id);
    s = await x.motor.aendere(a.id, { reihenfolge: 40, version: s.version }, x.markus.id);
    assert.equal(s.aktiv, false);
    // Die API nimmt aktiv weiter an, wenn es ausdrücklich mitkommt.
    s = await x.motor.aendere(a.id, { aktiv: true, version: s.version }, x.markus.id);
    assert.equal(s.aktiv, true);
  });
});
