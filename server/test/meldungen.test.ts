/** Werkbank-Übersicht (#816): Meldungen nach Schwere, Warnungen und Hinweise bewusst akzeptieren (protokolliert). */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { akzeptierbar, nachSchwere, ordneMeldungen, pruefeAkzeptanz, type Akzeptiert, type Meldung } from '../../shared/src/meldungen';
import { speicherDateien } from '../src/dateispeicher';
import { Dienst } from '../src/dienst';
import { speicherEinstellungen } from '../src/einstellungen';
import { Fachfehler } from '../src/fehler';
import { Konten } from '../src/konten';
import { speicherKontoRepo } from '../src/konto-repo';
import { protokoll } from '../src/protokoll';
import { speicherRepo } from '../src/repo-speicher';
import { routen, type Anfrage } from '../src/routen';

const WURZEL = new URL('../..', import.meta.url).pathname;
const m = (schluessel: string, art: Meldung['art'], datum?: string): Meldung => ({ schluessel, art, ...(datum ? { datum } : {}) });
const AM = '2026-11-04T10:00:00.000Z';

describe('Meldungen der Übersicht: Reihenfolge (#816)', () => {
  it('rot vor gelb vor Hinweis, egal in welcher Reihenfolge sie kommen', () => {
    // Wie gefunden: drei gelbe, ein Hinweis, wieder eine gelbe – dazu eine rote ganz hinten.
    const liste = [m('sicherung.volume', 'warn'), m('tresor.volume', 'warn'), m('wartung', 'warn'), m('variablen', 'info'), m('mail', 'warn'), m('notfallzugang:1', 'schlecht')];
    assert.deepEqual(nachSchwere(liste).map((x) => x.schluessel), ['notfallzugang:1', 'sicherung.volume', 'tresor.volume', 'wartung', 'mail', 'variablen']);
  });

  it('innerhalb einer Stufe nach Datum, neuere zuerst; ohne Datum danach in fester Reihenfolge', () => {
    const liste = [m('a', 'schlecht'), m('b', 'schlecht', '2026-11-01T08:00:00Z'), m('c', 'schlecht', '2026-11-03T08:00:00Z'), m('d', 'schlecht')];
    assert.deepEqual(nachSchwere(liste).map((x) => x.schluessel), ['c', 'b', 'a', 'd']);
  });
});

describe('Meldungen der Übersicht: bewusst akzeptieren (#816)', () => {
  const ak = (art: Meldung['art']): Akzeptiert[string] => ({ art, von: 'Lena', am: AM });

  it('akzeptierte wandern nach unten, der Rest bleibt oben', () => {
    const g = ordneMeldungen([m('mail', 'warn'), m('sicherung.volume', 'warn'), m('variablen', 'info')], { 'sicherung.volume': ak('warn'), variablen: ak('info') });
    assert.deepEqual(g.offen.map((x) => x.schluessel), ['mail']);
    assert.deepEqual(g.akzeptiert.map((x) => x.schluessel), ['sicherung.volume', 'variablen']);
    assert.equal(g.akzeptiert[0].akzeptanz.von, 'Lena');
    assert.deepEqual(g.aufheben, []);
  });

  it('rote lassen sich nicht akzeptieren – nur gelbe Warnungen und Hinweise', () => {
    assert.equal(akzeptierbar('schlecht'), false);
    assert.equal(akzeptierbar('warn'), true);
    assert.equal(akzeptierbar('info'), true);
    assert.equal(pruefeAkzeptanz({ schluessel: 'sicherung.fehler', art: 'schlecht' }), 'rot');
    assert.equal(pruefeAkzeptanz({ schluessel: 'mail', art: 'warn' }), null);
    assert.equal(pruefeAkzeptanz({ schluessel: 'postfach.anmelden:4f1c-aa', art: 'warn', grund: 'Test' }), null);
    assert.equal(pruefeAkzeptanz({ schluessel: 'Mail mit Leerzeichen', art: 'warn' }), 'ungueltig');
    assert.equal(pruefeAkzeptanz({ schluessel: 'mail', art: 'warn', grund: 'x'.repeat(301) }), 'grund');
  });

  it('wird die Lage schlimmer (gelb → rot, Hinweis → gelb), steht die Meldung wieder oben', () => {
    const g = ordneMeldungen([m('export.umzug', 'schlecht'), m('texterkennung.paket', 'warn')], { 'export.umzug': ak('info'), 'texterkennung.paket': ak('info') });
    assert.deepEqual(g.offen.map((x) => x.schluessel), ['export.umzug', 'texterkennung.paket']);
    assert.deepEqual(g.akzeptiert, []);
    assert.deepEqual(g.aufheben, [{ schluessel: 'export.umzug', anlass: 'schwerer' }, { schluessel: 'texterkennung.paket', anlass: 'schwerer' }]);
  });

  it('wird sie leichter (gelb → Hinweis), bleibt sie akzeptiert', () => {
    const g = ordneMeldungen([m('texterkennung.paket', 'info')], { 'texterkennung.paket': ak('warn') });
    assert.deepEqual(g.akzeptiert.map((x) => x.schluessel), ['texterkennung.paket']);
  });

  it('verschwindet eine akzeptierte Meldung (behoben), ist die Akzeptanz aufgehoben – tritt sie erneut auf, steht sie oben', () => {
    const vorher: Akzeptiert = { mail: ak('warn') };
    const behoben = ordneMeldungen([], vorher);
    assert.deepEqual(behoben.aufheben, [{ schluessel: 'mail', anlass: 'erledigt' }]);
    const danach: Akzeptiert = {}; // die Übersicht meldet „erledigt“, der Server entfernt sie
    assert.deepEqual(ordneMeldungen([m('mail', 'warn')], danach).offen.map((x) => x.schluessel), ['mail']);
  });
});

async function aufbau() {
  const einstellungen = speicherEinstellungen();
  const d = new Dienst(speicherRepo(), speicherDateien(), { einstellungen });
  const konten = new Konten(speicherKontoRepo(), null, 'http://nas', d.systemtypen.benutzerspiegel());
  const { benutzer: lena } = await konten.einrichten({ email: 'lena@example.org', name: 'Lena', passwort: 'ein-langes-passwort' });
  await d.postSystemmappen.gleicheBenutzerAb(await konten.listeBenutzer());
  const tabelle = routen(d, konten, {});
  const rufe = (methode: string, pfad: string, body: Record<string, unknown> = {}) => {
    const r = tabelle.find((x) => x.methode === methode && x.pfad === pfad);
    assert.ok(r, `${methode} ${pfad}`);
    return r.handler({ body, params: {}, query: {}, ip: '1', benutzer: lena } as Anfrage) as Promise<{ body: unknown }>;
  };
  return { einstellungen, rufe, tabelle };
}

describe('Schnittstelle: Meldungen akzeptieren (#816)', () => {
  it('nur für Administratoren', async () => {
    const { tabelle } = await aufbau();
    for (const p of ['/api/werkbank/uebersicht/akzeptieren', '/api/werkbank/uebersicht/aufheben']) assert.equal(tabelle.find((x) => x.pfad === p)?.zugang, 'admin');
  });

  it('akzeptieren: gespeichert mit wer, wann, Begründung, im Protokoll – und in der Übersicht', async () => {
    const { rufe } = await aufbau();
    const vorher = protokoll.letzteNr;
    const r = await rufe('POST', '/api/werkbank/uebersicht/akzeptieren', { schluessel: 'sicherung.volume', art: 'warn', grund: '  Testinstallation  ' });
    const a = (r.body as Akzeptiert)['sicherung.volume'];
    assert.equal(a.von, 'Lena');
    assert.equal(a.art, 'warn');
    assert.equal(a.grund, 'Testinstallation');
    assert.ok(!Number.isNaN(Date.parse(a.am)));
    const e = protokoll.eintraege({ seit: vorher }).find((x) => x.text === 'Meldung der Übersicht bewusst akzeptiert');
    assert.ok(e, 'im Protokoll');
    assert.equal(e.modul, 'werkbank');
    assert.deepEqual([e.daten?.meldung, e.daten?.von, e.daten?.grund], ['sicherung.volume', 'Lena', 'Testinstallation']);
    const u = (await rufe('GET', '/api/werkbank/uebersicht')).body as { akzeptiert: Akzeptiert };
    assert.deepEqual(Object.keys(u.akzeptiert), ['sicherung.volume']);
  });

  it('ohne Begründung geht es auch', async () => {
    const { rufe } = await aufbau();
    const r = await rufe('POST', '/api/werkbank/uebersicht/akzeptieren', { schluessel: 'mail', art: 'warn' });
    assert.equal('grund' in (r.body as Akzeptiert).mail, false);
  });

  it('rote Meldungen: abgelehnt, nichts gespeichert', async () => {
    const { rufe, einstellungen } = await aufbau();
    await assert.rejects(rufe('POST', '/api/werkbank/uebersicht/akzeptieren', { schluessel: 'sicherung.fehler', art: 'schlecht' }),
      (e: unknown) => e instanceof Fachfehler && e.status === 400 && /lassen sich nicht akzeptieren/.test(e.message));
    await assert.rejects(rufe('POST', '/api/werkbank/uebersicht/akzeptieren', { schluessel: '../x', art: 'warn' }), (e: unknown) => e instanceof Fachfehler && e.status === 400);
    assert.equal(await einstellungen.lies('uebersicht_akzeptiert'), null);
  });

  it('wieder einblenden und „behoben“: Akzeptanz weg, jeweils im Protokoll', async () => {
    const { rufe, einstellungen } = await aufbau();
    await rufe('POST', '/api/werkbank/uebersicht/akzeptieren', { schluessel: 'mail', art: 'warn' });
    await rufe('POST', '/api/werkbank/uebersicht/akzeptieren', { schluessel: 'variablen', art: 'info' });
    const vorher = protokoll.letzteNr;
    let r = await rufe('POST', '/api/werkbank/uebersicht/aufheben', { schluessel: ['mail'], anlass: 'eingeblendet' });
    assert.deepEqual(Object.keys(r.body as Akzeptiert), ['variablen']);
    r = await rufe('POST', '/api/werkbank/uebersicht/aufheben', { schluessel: ['variablen', 'gibt-es-nicht'], anlass: 'erledigt' });
    assert.deepEqual(r.body, {});
    assert.equal(await einstellungen.lies('uebersicht_akzeptiert'), null);
    const texte = protokoll.eintraege({ seit: vorher }).map((e) => e.text);
    assert.ok(texte.includes('Akzeptierte Meldung wieder eingeblendet'));
    assert.ok(texte.includes('Akzeptierte Meldung ist behoben, Akzeptanz aufgehoben'));
  });
});

describe('Alle Meldungen der Übersicht haben einen Schlüssel und stehen im Admin-Handbuch (#816)', () => {
  it('jeder Schlüssel aus der Übersicht steht in der Tabelle unter „Meldungen der Übersicht“', () => {
    const quellen = ['web/src/werkbank/Uebersicht.tsx', 'web/src/werkbank/Sicherung.tsx', 'web/src/werkbank/Vollexport.tsx'].map((f) => readFileSync(join(WURZEL, f), 'utf8')).join('\n');
    const schluessel = [...quellen.matchAll(/schluessel: (?:'([a-z0-9.-]+)'|`([a-z0-9.-]+):\$\{)/g)].map((x) => x[1] ?? x[2]);
    assert.ok(schluessel.length >= 40, `nur ${schluessel.length} gefunden`);
    const handbuch = readFileSync(join(WURZEL, 'docs/handbuch/admin/docs/uebersicht.md'), 'utf8');
    const fehlt = [...new Set(schluessel)].filter((k) => !handbuch.includes(`\`${k}\``));
    assert.deepEqual(fehlt, [], 'im Handbuch fehlen');
  });
});
