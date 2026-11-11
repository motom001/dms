/** Ereigniskatalog (#670): Ausgangskorb, Bündeln, Verteiler, Pakete nach code.mappentypen, still, Frist genau einmal. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { EREIGNISKATALOG, ereignisSchluessel, KATALOG_ARTEN, mischeFelder, WEBHOOK_KATALOG, type KatalogEreignis } from '../../shared/src/ereignisse';
import { EREIGNISSE, liesCode, MAPPEN_EREIGNISSE, type InstalliertesPaket } from '../../shared/src/pakete';
import { WEBHOOK_EREIGNISSE } from '../../shared/src/webhook';
import de from '../../shared/src/sprachen/de/ereignisse.json';
import { speicherDateien } from '../src/dateispeicher';
import { Dienst } from '../src/dienst';
import { speicherEinstellungen } from '../src/einstellungen';
import { Konten } from '../src/konten';
import { speicherKontoRepo, type KontoRepo } from '../src/konto-repo';
import type { Repo } from '../src/repo';
import { speicherRepo } from '../src/repo-speicher';
import { eigeneDatenbank } from './hilfe-db';

const url = process.env.TEST_DATABASE_URL;
const HAUSHALT = '00000000-0000-4000-8000-000000000001';

/** Uhr vorstellen (Bündelung, Wiederholung), danach zurück. */
async function spaeter<T>(ms: number, f: () => Promise<T>): Promise<T> {
  const echt = Date.now;
  Date.now = () => echt() + ms;
  try { return await f(); } finally { Date.now = echt; }
}

/** Mit TEST_DATABASE_URL zusätzlich gegen PostgreSQL (eigene Datenbank je Aufruf, #900). */
async function pgRepos(): Promise<{ repo: Repo; konto: KontoRepo }> {
  const { pgRepo } = await import('../src/repo-pg');
  const { pgKontoRepo } = await import('../src/konto-repo');
  const sql = (await eigeneDatenbank('ereignisse')).sql;
  return { repo: pgRepo(sql, HAUSHALT), konto: pgKontoRepo(sql, HAUSHALT) };
}

async function aufbau(repos?: { repo: Repo; konto: KontoRepo }) {
  const repo = repos?.repo ?? speicherRepo();
  const d = new Dienst(repo, speicherDateien(), { einstellungen: speicherEinstellungen() });
  const konten = new Konten(repos?.konto ?? speicherKontoRepo(), null, 'http://nas', d.benutzerspiegel());
  d.verbindeKonten(konten.papierkorbHaken());
  const { benutzer: admin } = await konten.einrichten({ email: 'admin@example.org', name: 'Lena', passwort: 'ein-langes-passwort' });
  await d.gleicheBenutzerAb(await konten.listeBenutzer());
  const vertrag = await d.legeTypAn({ name: 'Vertrag', felder: [
    { key: 'name', label: 'Name', typ: 'text', pflicht: true },
    { key: 'kuendigung', label: 'Kündigung bis', typ: 'datum', frist: { vorlauf: 2, einheit: 'wochen', text: '{feld} {datum}' } },
  ] });
  const notiz = await d.legeTypAn({ name: 'Zettel', felder: [{ key: 'name', label: 'Name', typ: 'text' }] });
  const gesehen: KatalogEreignis[] = [];
  d.ereignisse.abonniere('test', async (e) => { gesehen.push(e); });
  const verteile = () => spaeter(10_000, () => d.ereignisse.verteile());
  return { d, repo, konten, admin, vertrag, notiz, gesehen, verteile };
}

describe('Ereigniskatalog (#670): Katalog', () => {
  it('jeder Eintrag hat Name, Text und Gruppe; Webhooks und Pakete stimmen mit dem Katalog überein', () => {
    const texte = de as Record<string, string>;
    for (const a of KATALOG_ARTEN) {
      assert.ok(texte[`name.${ereignisSchluessel(a)}`] && texte[`text.${ereignisSchluessel(a)}`], `Texte für ${a}`);
      assert.ok(texte[`gruppe.${EREIGNISKATALOG[a].gruppe}`], `Gruppe für ${a}`);
      for (const f of EREIGNISKATALOG[a].felder) assert.doesNotMatch(f, /titel|name|wert|text/i, `${a}: nur Ids/Schlüssel/Datum (${f})`);
    }
    assert.deepEqual([...WEBHOOK_EREIGNISSE], WEBHOOK_KATALOG);
    for (const a of MAPPEN_EREIGNISSE) assert.ok(Object.keys(EREIGNISSE).includes(a), `${a} für Pakete`);
    assert.deepEqual(mischeFelder({ felder: ['a', 'b'] }, { felder: ['b', 'c'] }).felder, ['a', 'b', 'c']);
  });

  it('code.mappentypen: Pflicht mit Mappen-Ereignissen, nur mit ihnen, nur eigene und lesbare Typen', () => {
    const basis = { sprache: 'c', ereignisse: ['mappe.geaendert'], mappentypen: ['vertrag'], rechte: { lesen: ['vertrag'] } };
    const f = (x: Record<string, unknown>) => liesCode({ ...basis, ...x }).fehler.join(' ');
    assert.deepEqual(liesCode(basis).fehler, []);
    assert.deepEqual(liesCode(basis).code!.mappentypen, ['vertrag']);
    assert.match(f({ mappentypen: [] }), /braucht code.mappentypen/);
    assert.match(f({ ereignisse: ['post.angelegt'] }), /nur mit Mappen-Ereignissen/);
    assert.match(f({ rechte: { lesen: ['rechnung'] } }), /auch lesen dürfen/);
    // #686: fremde Typen und „*“, wenn das Paket sie lesen darf.
    assert.deepEqual(liesCode({ ...basis, mappentypen: ['basis:organisation'], rechte: { lesen: ['basis:organisation'] } }).fehler, []);
    assert.match(f({ mappentypen: ['basis:organisation'] }), /auch lesen dürfen/);
    assert.deepEqual(liesCode({ ...basis, mappentypen: ['*'], rechte: { lesen: ['*'] } }).fehler, []);
    assert.match(f({ mappentypen: ['*'] }), /geht nur mit code.rechte.lesen: \["\*"\]/);
    assert.match(f({ mappentypen: ['Vertrag!'] }), /Verweis wie paket:typ/);
  });
});

describe('Ereigniskatalog (#670): Ausgangskorb und Verteiler', () => {
  it('Mappe angelegt, geändert (gebündelt, nur Feldschlüssel), verknüpft, Notiz, gelöscht, wiederhergestellt – mit Auslöser', async () => {
    const { d, admin, vertrag, gesehen, verteile } = await aufbau();
    const m = await d.legeMappeAn({ typId: vertrag.id, werte: { name: 'Strom' } }, admin.id);
    await d.aendereMappe(m.id, { werte: { name: 'Strom Haus' } }, admin.id);
    await d.aendereMappe(m.id, { werte: { name: 'Strom Haus', kuendigung: '2031-09-30' } }, admin.id);
    await d.legeNotizAn(m.id, 'Anruf', admin.id);
    await verteile();
    const arten = gesehen.map((e) => e.art);
    assert.ok(arten.includes('mappe.angelegt'));
    assert.ok(arten.includes('mappe.notiz'));
    const geaendert = gesehen.filter((e) => e.art === 'mappe.geaendert');
    assert.equal(geaendert.length, 1, 'schnelle Änderungen werden ein Ereignis');
    assert.deepEqual([...(geaendert[0].daten.felder as string[])].sort(), ['kuendigung', 'name']);
    assert.ok(!JSON.stringify(gesehen).includes('Strom'), 'nie Werte');
    assert.deepEqual(gesehen[0].ausloeser, { art: 'benutzer', id: admin.id, konto: admin.id });
    assert.equal(gesehen[0].daten.mappe, m.id);
    assert.equal(gesehen[0].daten.typ, vertrag.id);
    gesehen.length = 0;
    await d.loescheMappe(m.id, admin.id);
    await d.stelleWiederHer(m.id, { id: admin.id, rolle: 'admin' });
    await verteile();
    assert.deepEqual(gesehen.map((e) => e.art).filter((a) => a.startsWith('mappe.')), ['mappe.geloescht', 'mappe.wiederhergestellt']);
  });

  it('scheitert ein Abnehmer, kommt dasselbe Ereignis (gleiche Id) noch einmal; die anderen bekommen es auch wieder', async () => {
    const { d, admin, notiz, gesehen, verteile } = await aufbau();
    let mal = 0;
    d.ereignisse.abonniere('wackelt', async () => { if (mal++ === 0) throw new Error('kurz weg'); });
    await d.legeMappeAn({ typId: notiz.id, werte: { name: 'A' } }, admin.id);
    await verteile();
    assert.equal(gesehen.length, 1);
    assert.equal(await verteile(), 0, 'vor der Wiederholung nichts');
    await spaeter(2 * 60_000, () => d.ereignisse.verteile());
    assert.equal(gesehen.length, 2);
    assert.equal(gesehen[0].id, gesehen[1].id, 'Wiederholung an der Id erkennbar');
    assert.equal(await verteile(), 0, 'danach verteilt');
  });

  it('mitAusloeser kennzeichnet eine Automatisierung; ohneEreignisse (Beispiele, Demo) ist still', async () => {
    const { d, admin, notiz, gesehen, verteile } = await aufbau();
    await d.kern.mitAusloeser({ art: 'automatisierung', id: 'regel-1', konto: 'sys', kette: 1 }, () => d.legeMappeAn({ typId: notiz.id, werte: { name: 'B' } }, admin.id));
    await d.kern.ohneEreignisse(() => d.legeMappeAn({ typId: notiz.id, werte: { name: 'C' } }, admin.id));
    await verteile();
    assert.equal(gesehen.length, 1);
    assert.deepEqual(gesehen[0].ausloeser, { art: 'automatisierung', id: 'regel-1', konto: 'sys', kette: 1 });
  });

  it('Pakete bekommen Mappen-Ereignisse nur zu ihren code.mappentypen – und bei Wiederholung nicht doppelt', async () => {
    const { d, repo, admin, vertrag, notiz, verteile } = await aufbau();
    const code = { sprache: 'c', ereignisse: ['mappe.angelegt', 'frist.erreicht'], mappentypen: ['vertrag'], rechte: { lesen: ['vertrag'] } };
    const p: InstalliertesPaket = {
      id: 'fristen', name: 'Fristen', version: '1.0.0', beschreibung: '', lizenz: 'Apache-2.0', autor: { name: 'T', github: 't' }, dms: '>=0.153.0',
      herkunft: { art: 'hochgeladen', von: null, am: '' }, installiert: new Date().toISOString(), installiertVon: null, aktualisiert: null, aktualisiertVon: null,
      typen: { vertrag: vertrag.id }, sichten: {}, abhaengigkeiten: {}, code: true, laeufer: liesCode(code).code!, einstellungen: undefined,
    };
    await repo.speicherePaket(p);
    let mal = 0;
    d.ereignisse.abonniere('wackelt', async () => { if (mal++ === 0) throw new Error('kurz weg'); });
    const m = await d.legeMappeAn({ typId: vertrag.id, werte: { name: 'Strom' } }, admin.id);
    await d.legeMappeAn({ typId: notiz.id, werte: { name: 'Zettel' } }, admin.id);
    await verteile();
    await spaeter(2 * 60_000, () => d.ereignisse.verteile());
    // Verteilt wird erst nach dem Speichern (#743: Anlegen in einer Transaktion) – im Test also mit vorgestellter Uhr.
    const beimPaket = (await spaeter(2 * 60_000, () => repo.faelligeEreignisse(50))).filter((e) => e.paketId === 'fristen');
    assert.equal(beimPaket.length, 1, 'nur der Vertrag, und nur einmal');
    assert.equal(beimPaket[0].art, 'mappe.angelegt');
    assert.equal(beimPaket[0].daten.mappe, m.id);
    assert.equal(typeof beimPaket[0].daten.ereignis, 'string');
  });

  it('#686: fremde Mappentypen – nur, was der Paket-Benutzer lesen darf; Verwehren am Mappentyp wirkt sofort', async () => {
    const { d, repo, konten, admin, vertrag, notiz, verteile } = await aufbau();
    const code = { sprache: 'c', ereignisse: ['mappe.angelegt', 'mappe.geaendert'], mappentypen: ['*'], rechte: { lesen: ['*'] } };
    const p: InstalliertesPaket = {
      id: 'vertraege', name: 'Vertragsverwaltung', version: '1.0.0', beschreibung: '', lizenz: 'Apache-2.0', autor: { name: 'T', github: 't' }, dms: '>=0.166.0',
      herkunft: { art: 'hochgeladen', von: null, am: '' }, installiert: new Date().toISOString(), installiertVon: null, aktualisiert: null, aktualisiertVon: null,
      typen: {}, sichten: {}, abhaengigkeiten: {}, code: true, laeufer: liesCode(code).code!, einstellungen: undefined,
    };
    await repo.speicherePaket(p);
    await konten.dienstkonto('vertraege', 'Vertragsverwaltung');
    const beimPaket = async () => (await spaeter(30 * 60_000, () => repo.faelligeEreignisse(100))).filter((e) => e.paketId === 'vertraege').map((e) => e.daten.mappe);
    const a = await d.legeMappeAn({ typId: vertrag.id, werte: { name: 'Strom' } }, admin.id);
    const b = await d.legeMappeAn({ typId: notiz.id, werte: { name: 'Zettel' } }, admin.id);
    await verteile();
    assert.deepEqual((await beimPaket()).sort(), [a.id, b.id].sort(), 'fremde Typen über „*“');
    // Abschnitt „Pakete“ am Mappentyp: das Paket liest Vertrag und bekommt Ereignisse dazu.
    assert.deepEqual(await d.paketeAmTyp(vertrag.id), [{ id: 'vertraege', name: 'Vertragsverwaltung', schreiben: false, verwehrt: false, ereignisse: true }]);
    await d.setzePaketVerwehrt(vertrag.id, 'vertraege', true, admin.email);
    assert.equal((await d.paketeAmTyp(vertrag.id))[0].verwehrt, true);
    const z = await d.rechtepruefung.zugriff({ id: 'paket:vertraege', rolle: 'mitglied', art: 'dienst', paketId: 'vertraege' });
    assert.equal(z.typen.has(vertrag.id), false, 'verwehrt: Paket sieht den Typ nicht mehr');
    assert.equal(z.typen.has(notiz.id), true);
    const c = await d.legeMappeAn({ typId: vertrag.id, werte: { name: 'Gas' } }, admin.id);
    const e = await d.legeMappeAn({ typId: notiz.id, werte: { name: 'Noch ein Zettel' } }, admin.id);
    await spaeter(60_000, () => d.ereignisse.verteile());
    const danach = await beimPaket();
    assert.ok(danach.includes(e.id), 'erlaubter Typ kommt an');
    assert.ok(!danach.includes(c.id), 'verwehrter Typ: still nichts');
    // Wieder erlauben wirkt sofort.
    await d.setzePaketVerwehrt(vertrag.id, 'vertraege', false, admin.email);
    const f = await d.legeMappeAn({ typId: vertrag.id, werte: { name: 'Wasser' } }, admin.id);
    await spaeter(120_000, () => d.ereignisse.verteile());
    assert.ok((await beimPaket()).includes(f.id));
    // Ein Paket ohne Leserecht am Typ taucht am Mappentyp nicht auf und lässt sich nicht verwehren.
    await assert.rejects(() => d.setzePaketVerwehrt(vertrag.id, 'gibtsnicht', true, null), /ohnehin nicht lesen/);
  });

  it('#686: Regel für die Rolle „Paket“ am Typ – Ereignisse nur zu Mappen, die das Paket lesen darf', async () => {
    const { d, repo, konten, admin, vertrag, verteile } = await aufbau();
    const code = { sprache: 'c', ereignisse: ['mappe.angelegt'], mappentypen: ['basis:vertrag'], rechte: { lesen: ['basis:vertrag'] } };
    const basis: InstalliertesPaket = {
      id: 'basis', name: 'Basis', version: '1.0.0', beschreibung: '', lizenz: 'Apache-2.0', autor: { name: 'T', github: 't' }, dms: '>=0.1.0',
      herkunft: { art: 'hochgeladen', von: null, am: '' }, installiert: new Date().toISOString(), installiertVon: null, aktualisiert: null, aktualisiertVon: null,
      typen: { vertrag: vertrag.id }, sichten: {}, abhaengigkeiten: {}, code: false, einstellungen: undefined,
    };
    await repo.speicherePaket(basis);
    await repo.speicherePaket({ ...basis, id: 'kuendigen', name: 'Kündigen', typen: {}, code: true, laeufer: liesCode(code).code! });
    await konten.dienstkonto('kuendigen', 'Kündigen');
    // Regel: Paket darf Verträge mit Name „Geheim“ nicht lesen.
    const paketRolle = (await d.rechtepruefung.zugriff({ id: 'x', rolle: 'mitglied', art: 'dienst', paketId: 'kuendigen' })).wer.rollen[0];
    await d.setzeBerechtigungen(vertrag.id, { grund: { C: true, R: true, U: true, D: true, P: true }, regeln: [{ id: 'r1', name: 'Geheim', wenn: [{ art: 'rolle', rollen: [paketRolle] }, { art: 'feld', bedingung: { art: 'feld', feld: 'name', op: 'gleich', wert: { art: 'fest', wert: 'Geheim' } } }], dann: { R: 'entziehen' }, stopp: false }] }, true);
    const offen = await d.legeMappeAn({ typId: vertrag.id, werte: { name: 'Strom' } }, admin.id);
    const geheim = await d.legeMappeAn({ typId: vertrag.id, werte: { name: 'Geheim' } }, admin.id);
    await verteile();
    const da = (await spaeter(30 * 60_000, () => repo.faelligeEreignisse(100))).filter((e) => e.paketId === 'kuendigen').map((e) => e.daten.mappe);
    assert.ok(da.includes(offen.id));
    assert.ok(!da.includes(geheim.id), 'Mappe, die das Paket nicht lesen darf: kein Ereignis');
  });

  it('#958: mappe.geloescht nur an Pakete, die die Mappe lesen durften – geprüft mit der Mappe im Papierkorb', async () => {
    for (const repos of [undefined, ...(url ? [await pgRepos()] : [])]) {
      const { d, repo, konten, admin, vertrag, verteile } = await aufbau(repos);
      const code = { sprache: 'c', ereignisse: ['mappe.geloescht'], mappentypen: ['basis:vertrag'], rechte: { lesen: ['basis:vertrag'] } };
      const basis: InstalliertesPaket = {
        id: 'basis', name: 'Basis', version: '1.0.0', beschreibung: '', lizenz: 'Apache-2.0', autor: { name: 'T', github: 't' }, dms: '>=0.1.0',
        herkunft: { art: 'hochgeladen', von: null, am: '' }, installiert: new Date().toISOString(), installiertVon: null, aktualisiert: null, aktualisiertVon: null,
        typen: { vertrag: vertrag.id }, sichten: {}, abhaengigkeiten: {}, code: false, einstellungen: undefined,
      };
      await repo.speicherePaket(basis);
      await repo.speicherePaket({ ...basis, id: 'kuendigen', name: 'Kündigen', typen: {}, code: true, laeufer: liesCode(code).code! });
      await konten.dienstkonto('kuendigen', 'Kündigen');
      const paketRolle = (await d.rechtepruefung.zugriff({ id: 'x', rolle: 'mitglied', art: 'dienst', paketId: 'kuendigen' })).wer.rollen[0];
      await d.setzeBerechtigungen(vertrag.id, { grund: { C: true, R: true, U: true, D: true, P: true }, regeln: [{ id: 'r1', name: 'Geheim', wenn: [{ art: 'rolle', rollen: [paketRolle] }, { art: 'feld', bedingung: { art: 'feld', feld: 'name', op: 'gleich', wert: { art: 'fest', wert: 'Geheim' } } }], dann: { R: 'entziehen' }, stopp: false }] }, true);
      const offen = await d.legeMappeAn({ typId: vertrag.id, werte: { name: 'Strom' } }, admin.id);
      const geheim = await d.legeMappeAn({ typId: vertrag.id, werte: { name: 'Geheim' } }, admin.id);
      const weg = await d.legeMappeAn({ typId: vertrag.id, werte: { name: 'Gas' } }, admin.id);
      await d.loescheMappe(offen.id, admin.id);
      await d.loescheMappe(geheim.id, admin.id);
      await d.loescheMappe(weg.id, admin.id);
      assert.equal(await repo.holeMappe(geheim.id), undefined, 'im Papierkorb');
      // Papierkorb schon geleert, bevor verteilt wird: Das Leserecht lässt sich nicht mehr prüfen – nichts zustellen.
      await repo.leerePapierkorb([weg.id]);
      await verteile();
      const da = (await spaeter(30 * 60_000, () => repo.faelligeEreignisse(100))).filter((e) => e.paketId === 'kuendigen' && e.art === 'mappe.geloescht').map((e) => e.daten.mappe);
      assert.deepEqual(da, [offen.id], 'nur die Mappe, die das Paket lesen durfte');
    }
  });

  it('Frist erreicht: zum Erinnerungszeitpunkt und am Tag selbst je genau einmal', async () => {
    const { d, admin, vertrag, gesehen, verteile } = await aufbau();
    const m = await d.legeMappeAn({ typId: vertrag.id, werte: { name: 'Strom', kuendigung: '2031-06-30' } }, admin.id);
    await d.fristenAbgleichen({}, '2031-06-10');
    await d.fristenAbgleichen({}, '2031-06-20');
    await d.fristenAbgleichen({}, '2031-06-21');
    await d.fristenAbgleichen({}, '2031-06-30');
    await d.fristenAbgleichen({}, '2031-06-30');
    await verteile();
    const f = gesehen.filter((e) => e.art === 'frist.erreicht');
    assert.deepEqual(f.map((e) => e.daten.zeitpunkt), ['vorlauf', 'faellig']);
    assert.deepEqual(f[0].daten, { mappe: m.id, typ: vertrag.id, feld: 'kuendigung', datum: '2031-06-30', zeitpunkt: 'vorlauf', empfaenger: f[0].daten.empfaenger });
    assert.equal(f[0].ausloeser.art, 'system');
  });
});
