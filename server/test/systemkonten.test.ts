/** Systemrollen „Systemkonto“ und „Paket“, Konto „Automatisierung“ (#673). */
import assert from 'node:assert/strict';
import { imModus } from './hilfen';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { kontorolleKennung } from '../../shared/src/model';
import { SYSTEMKONTEN_AUF, systemkontenKopf, systemkontoAuffaellig, type SystemkontoFehler } from '../../shared/src/systemkonten';
import { NICHTS } from '../../shared/src/rechte';
import { speicherDateien } from '../src/dateispeicher';
import { Dienst } from '../src/dienst';
import { speicherEinstellungen } from '../src/einstellungen';
import { Fachfehler } from '../src/fehler';
import { Konten } from '../src/konten';
import { hasheSchluessel } from '../src/passwort';
import { speicherKontoRepo } from '../src/konto-repo';
import { speicherRepo } from '../src/repo-speicher';
import { routen, type Anfrage } from '../src/routen';
import { Tresor } from '../src/tresor';

const status = (s: number) => (e: unknown) => e instanceof Fachfehler && e.status === s;

async function aufbau() {
  const tresor = new Tresor(speicherEinstellungen(), join(await mkdtemp(join(tmpdir(), 'dms-system-')), 'dms.schluessel'), () => null);
  await tresor.laden(); await tresor.erzeuge();
  const repo = speicherRepo();
  const kontoRepo = speicherKontoRepo();
  const d = new Dienst(repo, speicherDateien(), { einstellungen: speicherEinstellungen(), tresor });
  const konten = new Konten(kontoRepo, null, 'http://nas', d.systemtypen.benutzerspiegel());
  d.verbindeKonten(konten.papierkorbHaken());
  d.systemkonten = (k) => konten.systemkonto(k);
  const admin = imModus((await konten.einrichten({ email: 'admin@example.org', name: 'Lena', passwort: 'ein-langes-passwort' })).benutzer);
  const jonas = (await konten.legeBenutzerAn({ email: 'jonas@example.org', name: 'Jonas' }, admin.id)).benutzer;
  await d.postSystemmappen.gleicheBenutzerAb(await konten.listeBenutzer());
  const auto = await konten.systemkonto('automatisierung');
  const typen = await d.mappentypen.listeTypen();
  const rolleTyp = typen.find((t) => t.system === 'rolle')!;
  const rolleId = async (k: 'systemkonto' | 'paket') => (await repo.holeSystemMappe(kontorolleKennung(k)))!.id;
  const gesundheit = await d.mappentypen.legeTypAn({ name: 'Gesundheit', felder: [{ key: 'titel', label: 'Titel', typ: 'text' }, { key: 'kennwort', label: 'Kennwort', typ: 'passwort' }] });
  const tabelle = routen(d, konten, {});
  const route = (m: string, p: string) => tabelle.find((r) => r.methode === m && r.pfad === p)!;
  const rufe = (m: string, p: string, x: Partial<Anfrage> = {}) => route(m, p).handler({ body: {}, params: {}, query: {}, ip: '1', ...x, benutzer: admin });
  return { d, repo, kontoRepo, konten, admin, jonas, auto, rolleTyp, rolleId, gesundheit, rufe };
}

describe('Systemkonten (#673)', () => {
  it('Konto „Automatisierung“: einmal angelegt, sichtbar, aber in keiner Liste und Auswahl', async () => {
    const { konten, auto, admin, rufe } = await aufbau();
    assert.equal(auto.art, 'system');
    assert.equal(auto.systemkonto, 'automatisierung');
    assert.equal(auto.name, 'Automatisierung');
    assert.equal((await konten.systemkonto('automatisierung')).id, auto.id, 'zweiter Aufruf liefert dasselbe Konto');
    assert.ok(!(await konten.listeBenutzer()).some((b) => b.id === auto.id), 'nicht in der Benutzerliste');
    assert.equal(await konten.einrichtungNoetig(), false);
    const personen = await konten.personen();
    const p = personen.find((x) => x.id === auto.id);
    assert.ok(p && p.aktiv === false && 'art' in p && p.art === 'system', 'nur für Namen, nie auswählbar');
    const liste = await rufe('GET', '/api/benutzer/systemkonten') as { body: Array<{ id: string; rolle: string; automatisierungen: unknown[] }> };
    const k = liste.body.find((x) => x.id === auto.id)!;
    assert.equal(k.rolle, 'systemkonto');
    assert.deepEqual(k.automatisierungen, []);
    const benutzer = await rufe('GET', '/api/benutzer') as { body: Array<{ id: string }> };
    assert.ok(!benutzer.body.some((x) => x.id === auto.id));
    assert.ok(admin);
  });

  it('nicht anmeldbar: Anmeldung, Passwort vergessen, Sitzung, API-Schlüssel, Benutzerwechsel, Ändern scheitern', async () => {
    const { konten, kontoRepo, auto, admin } = await aufbau();
    await assert.rejects(konten.anmelden({ email: auto.email, passwort: 'irgendein-langes-passwort' }, '1.2.3.4'), status(401));
    await konten.passwortVergessen?.({ email: auto.email }).catch(() => undefined);
    assert.equal((await kontoRepo.holeHash(auto.email)), undefined, 'kein Konto für „Passwort vergessen“');
    // Eine untergeschobene Sitzung gilt nicht.
    await kontoRepo.legeSitzungAn(hasheSchluessel('untergeschoben'), auto.id, new Date(Date.now() + 60_000), { geraet: 'x', ip: '1' });
    assert.equal(await konten.benutzerZu('untergeschoben'), undefined);
    assert.equal(await konten.benutzerMitId(auto.id), undefined, 'kein API-Schlüssel');
    await assert.rejects(konten.vertrete(admin, undefined, auto.id, { geraet: 'x', ip: '1' }), status(404));
    await assert.rejects(konten.aendereBenutzer(admin, auto.id, { aktiv: false }), status(404));
    await assert.rejects(konten.loescheBenutzer(admin, auto.id), status(404));
  });

  it('Systemrollen „Systemkonto“ und „Paket“ als Rollen-Mappen, nie an Menschen vergeben', async () => {
    const { d, jonas, rolleId } = await aufbau();
    const s = await rolleId('systemkonto'), p = await rolleId('paket');
    assert.ok(s && p);
    assert.ok(!(await d.postSystemmappen.listeRollen()).some((r) => r.id === s || r.id === p), 'nicht in der Auswahl der Benutzerverwaltung');
    assert.ok((await d.postSystemmappen.listeRollen(true)).some((r) => r.id === s && r.konto));
    await assert.rejects(d.postSystemmappen.setzeRollen(jonas.id, [s]), status(422));
    // Name fest, nicht löschbar wie die anderen Systemrollen.
    await assert.rejects(d.loeschen.loescheMappe(s), (e: unknown) => e instanceof Fachfehler);
  });

  it('Rechte: ohne Regeln alles außer Passwörter; Regeln mit der Rolle Systemkonto schränken ein; der Standard für Mitglieder gilt nicht', async () => {
    const { d, auto, admin, gesundheit, rolleId } = await aufbau();
    const m = await d.mappen.legeMappeAn({ typId: gesundheit.id, werte: { titel: 'Impfung', kennwort: { neu: 'geheim' } } }, admin.id);
    let z = await d.rechtepruefung.zugriff(auto);
    let r = await d.rechtepruefung.rechteAn(z, m);
    assert.deepEqual(r, { C: true, R: true, U: true, D: true, P: false });
    // Standard „nichts“ für Mitglieder: das Systemkonto ist davon nicht betroffen.
    await d.berechtigungen.setzeBerechtigungen(gesundheit.id, { grund: NICHTS, regeln: [] }, true);
    z = await d.rechtepruefung.zugriff(auto);
    assert.equal((await d.rechtepruefung.rechteAn(z, m)).R, true);
    // Regel „Systemkonto darf von Gesundheit nichts“.
    await d.berechtigungen.setzeBerechtigungen(gesundheit.id, { grund: NICHTS, regeln: [{ id: 's', name: 'Keine Automatisierung', wenn: [{ art: 'rolle', rollen: [await rolleId('systemkonto')] }], dann: { C: 'entziehen', R: 'entziehen', U: 'entziehen', D: 'entziehen', P: 'entziehen' }, stopp: true }] }, true);
    z = await d.rechtepruefung.zugriff(auto);
    r = await d.rechtepruefung.rechteAn(z, m);
    assert.deepEqual(r, { C: false, R: false, U: false, D: false, P: false });
    assert.equal((await d.rechtepruefung.lesbare(z, [m.id])).has(m.id), false, 'auch in Listen und Suche nicht lesbar');
    assert.equal(z.admin, false, 'das Systemkonto ist kein Administrator');
    const sz = await d.postSystemmappen.systemZugriff();
    assert.equal(sz.ich.id, auto.id);
  });

  it('Paket: bestätigte Rechte bleiben; Regeln mit der Rolle Paket schränken nur ein', async () => {
    const { d, repo, konten, admin, gesundheit, rolleId } = await aufbau();
    const andere = await d.mappentypen.legeTypAn({ name: 'Notiz', felder: [{ key: 'titel', label: 'Titel', typ: 'text' }] });
    await repo.speicherePaket({
      id: 'probe', name: 'Probe', version: '1.0.0', beschreibung: '', lizenz: 'Apache-2.0', autor: { name: 'Lena', github: 'lena' }, herkunft: 'katalog' as never,
      installiert: new Date().toISOString(), installiertVon: admin.id, aktualisiert: null, aktualisiertVon: null,
      typen: { gesundheit: gesundheit.id, notiz: andere.id }, sichten: {}, abhaengigkeiten: {}, code: true,
      laeufer: { sprache: 'wasm', ereignisse: [], rechte: { lesen: ['gesundheit', 'notiz'], schreiben: ['notiz'], dokumente: 'keine' }, netz: [] } as never,
    });
    const konto = await konten.dienstkonto('probe', 'Probe');
    const g = await d.mappen.legeMappeAn({ typId: gesundheit.id, werte: { titel: 'Impfung' } }, admin.id);
    const n = await d.mappen.legeMappeAn({ typId: andere.id, werte: { titel: 'Zettel' } }, admin.id);
    let z = await d.rechtepruefung.zugriff(konto);
    assert.deepEqual(await d.rechtepruefung.rechteAn(z, g), { C: false, R: true, U: false, D: false, P: false }, 'wie bestätigt: nur lesen');
    assert.deepEqual(await d.rechtepruefung.rechteAn(z, n), { C: true, R: true, U: true, D: false, P: false });
    // Strenger Standard für Mitglieder ändert nichts; eine Regel für die Rolle Paket entzieht das Lesen.
    await d.berechtigungen.setzeBerechtigungen(gesundheit.id, { grund: NICHTS, regeln: [{ id: 'p', name: 'Pakete nicht', wenn: [{ art: 'rolle', rollen: [await rolleId('paket')] }], dann: { R: 'entziehen' }, stopp: true }] }, true);
    // Erteilen über die bestätigten Rechte hinaus geht nicht.
    await d.berechtigungen.setzeBerechtigungen(andere.id, { grund: NICHTS, regeln: [{ id: 'q', name: 'Pakete alles', wenn: [{ art: 'rolle', rollen: [await rolleId('paket')] }], dann: { C: 'erteilen', R: 'erteilen', U: 'erteilen', D: 'erteilen', P: 'erteilen' }, stopp: true }] }, true);
    z = await d.rechtepruefung.zugriff(konto);
    assert.equal((await d.rechtepruefung.rechteAn(z, g)).R, false);
    assert.equal((await d.rechtepruefung.lesbare(z, [g.id, n.id])).has(g.id), false);
    assert.ok((await d.rechtepruefung.lesbare(z, [n.id])).has(n.id));
    assert.deepEqual(await d.rechtepruefung.rechteAn(z, n), { C: true, R: true, U: true, D: false, P: false });
  });

  it('Paket: Regeln der Rolle Paket, die das Lesen nicht berühren, öffnen keine fremden Mappentypen', async () => {
    const { d, repo, konten, admin, gesundheit, rolleId } = await aufbau();
    const andere = await d.mappentypen.legeTypAn({ name: 'Notiz', felder: [{ key: 'titel', label: 'Titel', typ: 'text' }] });
    await repo.speicherePaket({
      id: 'probe', name: 'Probe', version: '1.0.0', beschreibung: '', lizenz: 'Apache-2.0', autor: { name: 'Lena', github: 'lena' }, herkunft: 'katalog' as never,
      installiert: new Date().toISOString(), installiertVon: admin.id, aktualisiert: null, aktualisiertVon: null,
      typen: { notiz: andere.id }, sichten: {}, abhaengigkeiten: {}, code: true,
      laeufer: { sprache: 'wasm', ereignisse: [], rechte: { lesen: ['notiz'], schreiben: [], dokumente: 'keine' }, netz: [] } as never,
    });
    const konto = await konten.dienstkonto('probe', 'Probe');
    const g = await d.mappen.legeMappeAn({ typId: gesundheit.id, werte: { titel: 'Impfung' } }, admin.id);
    const n = await d.mappen.legeMappeAn({ typId: andere.id, werte: { titel: 'Zettel' } }, admin.id);
    // Eine Regel für die Rolle Paket, die nur das Löschen nimmt: Lesen bleibt für „Notiz“ offen.
    await d.berechtigungen.setzeBerechtigungen(andere.id, { grund: NICHTS, regeln: [{ id: 'p', name: 'Pakete löschen nicht', wenn: [{ art: 'rolle', rollen: [await rolleId('paket')] }], dann: { D: 'entziehen' }, stopp: false }] }, true);
    const z = await d.rechtepruefung.zugriff(konto);
    assert.ok(z.lesen, 'ein Paket hat immer einen Lesefilter – nie „alles“');
    assert.deepEqual([...await d.rechtepruefung.lesbare(z, [g.id, n.id])], [n.id], '„Gesundheit“ hat das Paket nie bestätigt bekommen');
    assert.equal((await d.rechtepruefung.rechteAn(z, g)).R, false);
  });

  it('Testlauf der Rechte (#710): Systemkonten und Paket-Benutzer wählbar, mit entscheidender Regel', async () => {
    const { d, repo, konten, admin, auto, gesundheit, rolleId, rufe } = await aufbau();
    const m = await d.mappen.legeMappeAn({ typId: gesundheit.id, werte: { titel: 'Impfung' } }, admin.id);
    const verbot = { grund: NICHTS, regeln: [{ id: 's', name: 'System- und Paketrollen verboten', wenn: [{ art: 'rolle' as const, rollen: [await rolleId('systemkonto'), await rolleId('paket')] }], dann: { C: 'entziehen' as const, R: 'entziehen' as const, U: 'entziehen' as const, D: 'entziehen' as const, P: 'entziehen' as const }, stopp: true }] };
    type T = { konto?: string; admin: boolean; wirksam: Record<string, boolean>; spur: Array<{ name: string; traf: boolean | null }>; benutzer: { name: string }; unbestaetigt?: boolean };
    const lauf = async (benutzerId: string, berechtigungen?: unknown) => (await rufe('POST', '/api/werkbank/berechtigungen/testlauf', { body: { mappeId: m.id, benutzerId, ...(berechtigungen ? { berechtigungen } : {}) } })).body as T;
    // Ohne Regel für die Kontorolle: Systemkonto darf alles außer Passwörter – die Grundeinstellung gilt für es nicht.
    let t = await lauf(auto.id);
    assert.equal(t.konto, 'systemkonto');
    assert.equal(t.benutzer.name, 'Automatisierung');
    assert.deepEqual(t.wirksam, { C: true, R: true, U: true, D: true, P: false });
    // Mit ungespeicherter Regel „verboten“: kein Leserecht, die Regel hat entschieden.
    t = await lauf(auto.id, verbot);
    assert.equal(t.wirksam.R, false);
    assert.deepEqual(t.spur.map((s) => [s.name, s.traf]), [['System- und Paketrollen verboten', true]]);
    // Gespeichert gilt dasselbe – und deckt sich mit den echten Rechten des Kontos.
    await d.berechtigungen.setzeBerechtigungen(gesundheit.id, verbot, true);
    assert.equal((await lauf(auto.id)).wirksam.R, (await d.rechtepruefung.rechteAn(await d.rechtepruefung.zugriff(auto), m)).R);
    // Paket ohne bestätigten Zugriff auf den Typ: nichts, gekennzeichnet.
    await repo.speicherePaket({
      id: 'probe', name: 'Probe', version: '1.0.0', beschreibung: '', lizenz: 'Apache-2.0', autor: { name: 'Lena', github: 'lena' }, herkunft: 'katalog' as never,
      installiert: new Date().toISOString(), installiertVon: admin.id, aktualisiert: null, aktualisiertVon: null,
      typen: {}, sichten: {}, abhaengigkeiten: {}, code: true,
      laeufer: { sprache: 'wasm', ereignisse: [], rechte: { lesen: [], schreiben: [], dokumente: 'keine' }, netz: [] } as never,
    });
    const paket = await konten.dienstkonto('probe', 'Probe');
    t = await lauf(paket.id);
    assert.equal(t.konto, 'paket');
    assert.equal(t.benutzer.name, 'Paket: Probe');
    assert.equal(t.unbestaetigt, true);
    assert.equal(t.wirksam.R, false);
    // Unbekannte Kennung bleibt 404; in der Benutzerliste tauchen die Konten weiter nicht auf.
    await assert.rejects(lauf('00000000-0000-4000-8000-000000000000'), status(404));
    const liste = await rufe('GET', '/api/benutzer') as { body: Array<{ id: string }> };
    assert.ok(!liste.body.some((x) => x.id === auto.id || x.id === paket.id));
  });

  it('Gruppe „Systemkonten“ (#817): Zusammensetzung für die Kopfzeile, Auffälligkeiten je Konto', async () => {
    const { repo, konten, admin, rufe } = await aufbau();
    const paket = (id: string, name: string, rechte: { lesen: string[]; schreiben: string[] }, netz: string[] = []) => repo.speicherePaket({
      id, name, version: '1.0.0', beschreibung: '', lizenz: 'Apache-2.0', autor: { name: 'Lena', github: 'lena' }, herkunft: 'katalog' as never,
      installiert: new Date().toISOString(), installiertVon: admin.id, aktualisiert: null, aktualisiertVon: null,
      typen: {}, sichten: {}, abhaengigkeiten: {}, code: true,
      laeufer: { sprache: 'wasm', ereignisse: [], rechte: { ...rechte, dokumente: 'keine' }, netz } as never,
    });
    await paket('ruhig', 'Ruhig', { lesen: ['notiz'], schreiben: [] });
    await paket('alles', 'Alles ändern', { lesen: [], schreiben: ['*'] });
    await paket('netz', 'Liest alles mit Netz', { lesen: ['*'], schreiben: [] }, ['https://dienst.example.org']);
    await paket('ohnenetz', 'Liest alles ohne Netz', { lesen: ['*'], schreiben: [] });
    for (const [id, name] of [['ruhig', 'Ruhig'], ['alles', 'Alles ändern'], ['netz', 'Liest alles mit Netz'], ['ohnenetz', 'Liest alles ohne Netz'], ['weg', 'Entfernt']]) await konten.dienstkonto(id, name);
    await konten.dienstkontoAus('weg'); // Paket „weg“ gibt es nicht (mehr): Konto bleibt für die Historie
    await konten.dienstkontoAus('ruhig'); // Paket noch da, Konto aber aus: Fehler
    type K = { name: string; rolle: 'systemkonto' | 'paket'; fehler?: SystemkontoFehler; weitreichend?: boolean };
    const liste = (await rufe('GET', '/api/benutzer/systemkonten')).body as K[];
    const je = (n: string) => liste.find((k) => k.name === `Paket ${n}`)!;
    assert.equal(je('Ruhig').fehler, 'deaktiviert');
    assert.equal(je('Entfernt').fehler, undefined, 'entferntes Paket: nur Historie, kein Fehler');
    assert.equal(je('Alles ändern').weitreichend, true);
    assert.equal(je('Liest alles mit Netz').weitreichend, true);
    assert.equal(je('Liest alles ohne Netz').weitreichend, undefined);
    assert.deepEqual(systemkontenKopf(liste), { anzahl: 6, pakete: 5, automatisierung: 1, fehler: 1, weitreichend: 2 });
  });

  it('Auffälligkeiten (#817): angehaltene Automatisierung, deaktiviertes Systemkonto', () => {
    const basis = { aktiv: true, rolle: 'systemkonto' as const, automatisierungen: [{}] };
    assert.deepEqual(systemkontoAuffaellig(basis), { fehler: null, weitreichend: false });
    assert.equal(systemkontoAuffaellig({ ...basis, automatisierungen: [{}, { angehalten: true }] }).fehler, 'angehalten');
    assert.equal(systemkontoAuffaellig({ ...basis, aktiv: false }).fehler, 'deaktiviert');
  });

  it('Kopfzeile und Merker: eingeklappt als Vorgabe, Einstellung je Person', () => {
    assert.equal(SYSTEMKONTEN_AUF, 'benutzer_systemkonten_auf');
    assert.deepEqual(systemkontenKopf([]), { anzahl: 0, pakete: 0, automatisierung: 0, fehler: 0, weitreichend: 0 });
    // Die Gruppe steht über den Benutzern und ist zu, solange die Person sie nicht aufklappt.
    const quelle = readFileSync(new URL('../../web/src/werkbank/Benutzer.tsx', import.meta.url), 'utf8');
    const liste = quelle.slice(quelle.indexOf('export function BenutzerListe'), quelle.indexOf('/** Systemkonten und Dienstkonten der Pakete'));
    assert.ok(liste.indexOf('<SystemkontenListe') < liste.indexOf('<ul className="mappenliste">'), 'Gruppe über der Liste der Menschen');
    assert.match(quelle, /d\.einstellungen\[SYSTEMKONTEN_AUF\] === true/);
    assert.match(readFileSync(new URL('../../web/src/werkbank/TestlaufWahl.tsx', import.meta.url), 'utf8'), /<SystemkontenGruppe/, 'gleiches Muster im Testlauf');
  });
});
