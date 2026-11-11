/**
 * Verwaltungsrecht an der Person (#818), Verwaltungsmodus (#819) und Spur in der Historie (#820).
 * Über HTTP (Fastify inject) wie im Betrieb: Anmeldung, Cookie, X-DMS, Zugangsprüfung.
 */
import assert from 'node:assert/strict';
import { cp, mkdtemp, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, describe, it } from 'node:test';
import { BEREICHE } from '../../shared/src/werkbankansicht';
import { darfBereich, darfVerwalten, GESAMT, hatGesamt, liesVerwaltung, NUR_GESAMT_BEREICHE, verwaltungsbaum } from '../../shared/src/verwaltungsrecht';
import { NICHTS } from '../../shared/src/rechte';
import { speicherDateien } from '../src/dateispeicher';
import { Dienst } from '../src/dienst';
import { speicherEinstellungen } from '../src/einstellungen';
import { Fachfehler } from '../src/fehler';
import { Konten, schutzGesamt } from '../src/konten';
import { speicherKontoRepo } from '../src/konto-repo';
import { protokoll } from '../src/protokoll';
import { speicherRepo } from '../src/repo-speicher';
import { pruefeVerwaltung, routen, type Anfrage } from '../src/routen';
import { bereicheDerRoute, heikleHandlung, JEDER, NUR_GESAMT } from '../src/verwaltungsbereiche';
import { speicherFassungen } from '../src/dateiumwandlung';
import { PdfEntsperren } from '../src/entsperren';
import { ausBase32, totp, Zweifaktor } from '../src/zweifaktor';
import { imModus } from './hilfen';
import { eigeneDatenbank } from './hilfe-db';

const PW = 'ein-langes-passwort';
const stundeBerlin = (t: number) => Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', hour: '2-digit', hourCycle: 'h23' }).format(t));
// Die Tests zum Tagesmerker rücken die Uhr bis zu 40 Minuten vor; „heute“ zählt in Europe/Berlin, die Anmeldung selbst
// läuft mit der echten Uhr. Kurz vor Mitternacht würde mitten im Test das Datum wechseln – dann werden sie übersprungen.
const minuteBerlin = (t: number) => Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', minute: '2-digit' }).format(t));
const kurzVorMitternacht = () => stundeBerlin(Date.now()) === 23 && minuteBerlin(Date.now()) >= 15;
const MIN = 60_000;
const status = (s: number) => (e: unknown) => e instanceof Fachfehler && e.status === s;
/** Letzte Nummer im Protokoll – danach Geschriebenes finden. */
const marke = () => Math.max(0, ...protokoll.eintraege({}).map((e) => e.nr));

async function aufbau() {
  const d = new Dienst(speicherRepo(), speicherDateien(), { einstellungen: speicherEinstellungen() });
  const konten = new Konten(speicherKontoRepo(), null, 'http://nas', d.systemtypen.benutzerspiegel());
  d.verbindeKonten(konten.papierkorbHaken());
  const zf = new Zweifaktor(speicherEinstellungen(), (k) => `v:${k}`, (w) => (w.startsWith('v:') ? w.slice(2) : null));
  konten.verbindeZweifaktor(zf);
  const { benutzer: lena } = await konten.einrichten({ email: 'lena@example.org', name: 'Lena', passwort: PW });
  const mitPasswort = async (email: string, name: string) => {
    const r = await konten.legeBenutzerAn({ email, name }, lena.id);
    await konten.passwortSetzen({ schluessel: r.link!.split('/passwort/')[1], passwort: PW });
    return r.benutzer;
  };
  const jonas = await mitPasswort('jonas@example.org', 'Jonas');
  const petra = await mitPasswort('petra@example.org', 'Petra');
  await konten.setzeVerwaltung(imModus(lena), jonas.id, ['benutzer']);
  await d.postSystemmappen.gleicheBenutzerAb(await konten.listeBenutzer());
  const { baueApp } = await import('../src/http');
  const { ApiSchluesselDienst, speicherApiSchluesselRepo } = await import('../src/apischluessel');
  const app = await baueApp(d, konten, { apiSchluessel: new ApiSchluesselDienst(speicherApiSchluesselRepo()) });
  const anmelden = async (email: string) => {
    const r = await app.inject({ method: 'POST', url: '/api/konto/anmelden', payload: { email, passwort: PW }, headers: { 'x-dms': '1' } });
    assert.equal(r.statusCode, 200, r.body);
    const c = ([] as string[]).concat(r.headers['set-cookie'] as string | string[])[0];
    return c.split(';')[0];
  };
  const rufe = (cookie: string, method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, payload?: unknown, kopf: Record<string, string> = {}) =>
    app.inject({ method, url, ...(payload === undefined ? {} : { payload: payload as object }), headers: { 'x-dms': '1', cookie, ...kopf } });
  const verwalten = async (cookie: string, angaben: Record<string, unknown> = {}) => rufe(cookie, 'POST', '/api/konto/verwaltung', angaben);
  const jetzt = { t: Date.now() };
  konten.uhr = () => jetzt.t;
  return { d, konten, zf, app, lena, jonas, petra, anmelden, rufe, verwalten, jetzt };
}

describe('Verwaltungsrecht an der Person (#818)', () => {
  const offen: Array<() => Promise<unknown>> = [];
  after(async () => { for (const f of offen) await f(); });

  it('Recht, Baum und Bereiche: „Gesamte Verwaltung“ steht allein, Dienstkonten nie', () => {
    assert.deepEqual(liesVerwaltung(['benutzer', '*', 'typen']), [GESAMT]);
    assert.deepEqual(liesVerwaltung(['typen', 'gibt-es-nicht', 'benutzer', 'typen']), ['typen', 'benutzer']);
    assert.deepEqual(liesVerwaltung('*'), []);
    assert.equal(darfBereich({ verwaltung: ['benutzer'] }, 'benutzer'), true);
    assert.equal(darfBereich({ verwaltung: ['benutzer'] }, 'sicherung'), false);
    assert.equal(darfBereich({ verwaltung: ['benutzer'] }, 'uebersicht'), true, 'Übersicht für alle, die verwalten');
    assert.equal(darfBereich({ verwaltung: [] }, 'uebersicht'), false);
    assert.equal(darfBereich({ verwaltung: ['*'] }, 'ein-kuenftiger-bereich'), true, 'Gesamte Verwaltung schließt künftige Bereiche ein');
    // Dienst- und Systemkonten bekommen nie ein Verwaltungsrecht – auch nicht, wenn eines gespeichert wäre.
    assert.equal(darfVerwalten({ art: 'dienst', verwaltung: ['*'] }), false);
    assert.equal(hatGesamt({ art: 'system', verwaltung: ['*'] }), false);
    // Der Baum entsteht aus BEREICHE: jede Route der ersten Ebene genau einmal, Gruppen gliedern nur. Bereiche nur für
    // „Gesamte Verwaltung“ (Nutzung, #1032) lassen sich nicht einzeln vergeben.
    const baum = verwaltungsbaum();
    assert.deepEqual(baum.flatMap((a) => a.bereiche.map((b) => b.pfad)).sort(), BEREICHE.map((b) => b.pfad).filter((p) => !NUR_GESAMT_BEREICHE.has(p)).sort());
    assert.equal(darfBereich({ verwaltung: ['nutzung'] }, 'nutzung'), false);
    assert.equal(darfBereich({ verwaltung: ['*'] }, 'nutzung'), true);
    const heikel = baum.flatMap((a) => a.bereiche).filter((b) => b.heikel).map((b) => b.pfad).sort();
    assert.deepEqual(heikel, ['anbindung', 'anmeldeschutz', 'automatisierungen', 'betrieb', 'pakete', 'sicherung', 'typen', 'verschluesselung', 'vollexport']);
  });

  it('jede Route der Werkbank ist einem Bereich zugeordnet (Vorgabe „nein“)', async () => {
    const { d, konten } = await aufbau();
    const bekannt = new Set([...BEREICHE.map((b) => b.pfad), JEDER, NUR_GESAMT]);
    const ohne: string[] = [];
    for (const r of routen(d, konten, {}).filter((x) => x.zugang === 'admin')) {
      const q = r.bereichVon ?? r;
      const b = bereicheDerRoute(q.methode, q.pfad);
      if (!b) ohne.push(`${q.methode} ${q.pfad}`);
      else for (const x of b) assert.ok(bekannt.has(x), `${q.methode} ${q.pfad}: unbekannter Bereich ${x}`);
    }
    assert.deepEqual(ohne, [], `Ohne Bereich:\n${ohne.join('\n')}`);
    // Ohne Zuordnung: nur „Gesamte Verwaltung“.
    const a = (v: string[]) => ({ benutzer: { id: 'x', verwaltung: v, rolle: 'admin' }, verwaltungsmodus: true, body: {}, params: {}, query: {}, ip: '1' }) as unknown as Anfrage;
    assert.throws(() => pruefeVerwaltung({ methode: 'GET', pfad: '/api/werkbank/neu-erfunden' }, a(['benutzer']), konten), status(403));
    pruefeVerwaltung({ methode: 'GET', pfad: '/api/werkbank/neu-erfunden' }, a(['*']), konten);
  });

  it('Teilrechte: nur die eigenen Bereiche, auch über die API; die Übersicht nur mit eigenen Meldungen', async () => {
    const x = await aufbau();
    offen.push(() => x.app.close());
    const c = await x.anmelden('jonas@example.org');
    assert.equal((await x.verwalten(c)).statusCode, 200, 'Anmeldung eben: ohne erneute Abfrage');
    assert.equal((await x.rufe(c, 'GET', '/api/benutzer')).statusCode, 200);
    const sicherung = await x.rufe(c, 'GET', '/api/werkbank/papierkorb');
    assert.equal(sicherung.statusCode, 403);
    assert.equal(sicherung.json().details.bereich, 'papierkorb');
    const u = await x.rufe(c, 'GET', '/api/werkbank/uebersicht');
    assert.equal(u.statusCode, 200);
    assert.deepEqual(u.json().notfallzugaenge, []);
    assert.equal(u.json().papierkorb.anzahl, 0);
    // Verwaltungsrechte vergibt nur „Gesamte Verwaltung“ …
    assert.equal((await x.rufe(c, 'PUT', `/api/benutzer/${x.petra.id}/verwaltung`, { verwaltung: ['benutzer'] })).statusCode, 403);
    // … und an Konten von Verwaltenden kommt man mit „Benutzer“ nicht heran.
    assert.equal((await x.rufe(c, 'POST', `/api/benutzer/${x.lena.id}/link`)).statusCode, 403);
    assert.equal((await x.rufe(c, 'PUT', `/api/benutzer/${x.lena.id}`, { aktiv: false })).statusCode, 403);
    assert.equal((await x.rufe(c, 'POST', `/api/benutzer/${x.lena.id}/vertreten`)).statusCode, 403);
    assert.equal((await x.rufe(c, 'POST', `/api/benutzer/${x.lena.id}/zweifaktor/zuruecksetzen`)).statusCode, 403);
    // #957: Sitzungen (Geräte, Adressen, Abmelden) und Abwesenheit Verwaltender ebenso nicht.
    assert.equal((await x.rufe(c, 'GET', `/api/benutzer/${x.lena.id}/sitzungen`)).statusCode, 403);
    assert.equal((await x.rufe(c, 'DELETE', `/api/benutzer/${x.lena.id}/sitzungen`)).statusCode, 403);
    assert.equal((await x.rufe(c, 'DELETE', `/api/benutzer/${x.lena.id}/sitzungen/egal`)).statusCode, 403);
    assert.equal((await x.rufe(c, 'PUT', `/api/benutzer/${x.lena.id}/abwesenheit`, { an: true, vertreterId: x.jonas.id })).statusCode, 403);
    assert.equal((await x.rufe(c, 'POST', `/api/benutzer/${x.lena.id}/aufgaben-uebergeben`)).statusCode, 403);
    assert.equal(((await x.konten.listeBenutzer()).find((b) => b.id === x.lena.id) as { abwesenheit?: { an?: boolean } }).abwesenheit?.an ?? false, false);
    // Bei Personen ohne Verwaltungsrecht geht es weiter.
    assert.equal((await x.rufe(c, 'GET', `/api/benutzer/${x.petra.id}/sitzungen`)).statusCode, 200);
    assert.equal((await x.rufe(c, 'DELETE', `/api/benutzer/${x.petra.id}/sitzungen`)).statusCode, 200);
    assert.equal((await x.rufe(c, 'PUT', `/api/benutzer/${x.petra.id}/abwesenheit`, { an: true, vertreterId: x.jonas.id })).statusCode, 200);
    // Mit „Benutzer“: Personen anlegen und Passwörter anderer zurücksetzen geht.
    assert.equal((await x.rufe(c, 'POST', `/api/benutzer/${x.petra.id}/link`)).statusCode, 200);
    assert.equal((await x.rufe(c, 'POST', '/api/benutzer', { email: 'katrin@example.org', name: 'Katrin', verwaltung: ['*'] })).json().benutzer.verwaltung.length, 0, 'beim Anlegen kein Verwaltungsrecht');
  });

  it('vergeben nur mit frischer Anmeldung; Protokoll mit Vorher/Nachher; Schutzregel für die letzte Person', async () => {
    const x = await aufbau();
    offen.push(() => x.app.close());
    const c = await x.anmelden('lena@example.org');
    assert.equal((await x.verwalten(c)).statusCode, 200);
    // 11 Minuten später, aber aktiv geblieben: Modus läuft, die Anmeldung ist nicht mehr frisch.
    x.jetzt.t += 6 * MIN; await x.rufe(c, 'GET', '/api/werkbank/uebersicht', undefined, { 'x-dms-aktiv': '1' });
    x.jetzt.t += 5 * MIN;
    const ohne = await x.rufe(c, 'PUT', `/api/benutzer/${x.petra.id}/verwaltung`, { verwaltung: ['benutzer', 'typen'] });
    assert.equal(ohne.statusCode, 403, ohne.body);
    assert.equal(ohne.json().details.frisch, true);
    assert.equal((await x.rufe(c, 'POST', '/api/konto/verwaltung/bestaetigen', { passwort: 'falsch-falsch' })).statusCode, 401);
    assert.equal((await x.rufe(c, 'POST', '/api/konto/verwaltung/bestaetigen', { passwort: PW })).statusCode, 200);
    const seit = marke();
    const mit = await x.rufe(c, 'PUT', `/api/benutzer/${x.petra.id}/verwaltung`, { verwaltung: ['typen', 'benutzer'] });
    assert.equal(mit.statusCode, 200, mit.body);
    assert.deepEqual(mit.json().verwaltung, ['typen', 'benutzer']);
    const e = protokoll.eintraege({ seit }).find((y) => y.text === 'Verwaltungsrecht vergeben')!;
    assert.deepEqual([e.daten?.person, e.daten?.vorher, e.daten?.nachher, e.daten?.von], ['petra@example.org', '–', 'typen, benutzer', 'lena@example.org']);
    // Schutzregel: Lena ist die letzte mit „Gesamte Verwaltung“.
    assert.equal((await x.rufe(c, 'PUT', `/api/benutzer/${x.lena.id}/verwaltung`, { verwaltung: ['benutzer'] })).statusCode, 409);
    assert.equal((await x.rufe(c, 'DELETE', `/api/benutzer/${x.lena.id}`)).statusCode, 409);
    // Erst mit einer zweiten Person darf sie sich das Recht nehmen.
    assert.equal((await x.rufe(c, 'PUT', `/api/benutzer/${x.petra.id}/verwaltung`, { verwaltung: ['*'] })).statusCode, 200);
    assert.equal((await x.rufe(c, 'PUT', `/api/benutzer/${x.lena.id}/verwaltung`, { verwaltung: [] })).statusCode, 200);
    // Rechte entzogen: Der Modus endet sofort.
    assert.equal((await x.rufe(c, 'GET', '/api/werkbank/uebersicht')).statusCode, 403);
  });

  it('Schutzregel zählt nur Personen, die sich anmelden können; Deaktivieren der letzten geht nicht', async () => {
    const p = (id: string, v: string[], o: { aktiv?: boolean; pw?: boolean } = {}) => ({ id, email: `${id}@example.org`, name: id, rolle: 'mitglied' as const, verwaltung: v, aktiv: o.aktiv ?? true, hatPasswort: o.pw ?? true, erstellt: '', letzteAnmeldung: null });
    assert.equal(schutzGesamt([p('a', []), p('b', ['*'], { pw: false })], [p('a', ['*']), p('b', ['*'], { pw: false })]) !== null, true, 'eine bloße Einladung zählt nicht');
    assert.equal(schutzGesamt([p('a', ['*'], { aktiv: false })], [p('a', ['*'])]) !== null, true);
    assert.equal(schutzGesamt([p('a', []), p('b', ['*'])], [p('a', ['*']), p('b', ['*'])]), null);
    // Gab es vorher niemanden, blockiert die Regel nichts.
    assert.equal(schutzGesamt([p('a', ['benutzer'])], [p('a', [])]), null);
  });

  it('API-Schlüssel bekommen nie Verwaltungsrechte – auch nicht von Personen mit „Gesamte Verwaltung“', async () => {
    const x = await aufbau();
    offen.push(() => x.app.close());
    const c = await x.anmelden('lena@example.org');
    assert.equal((await x.verwalten(c)).statusCode, 200);
    const s = (await x.rufe(c, 'POST', '/api/konto/api-schluessel', { name: 'Scanner', recht: 'schreiben' })).json().schluessel as string;
    const mit = (url: string) => x.app.inject({ method: 'GET', url, headers: { authorization: `Bearer ${s}` } });
    const r = await mit('/api/v1/benutzer');
    assert.equal(r.statusCode, 403, r.body);
    assert.match(r.json().fehler, /nie Verwaltungsrechte/);
    assert.equal((await mit('/api/v1/mappen?sicht=eingang')).statusCode, 200);
  });

  it('Dienstkonten bekommen nie ein Verwaltungsrecht', async () => {
    const { konten, lena } = await aufbau();
    const paket = await konten.dienstkonto('paket-a', 'Beispiel');
    await assert.rejects(konten.setzeVerwaltung(imModus(lena), paket.id, ['*']), status(404));
    assert.equal(darfVerwalten(paket), false);
  });
});

describe('Verwaltungsmodus (#819)', () => {
  const offen: Array<() => Promise<unknown>> = [];
  after(async () => { for (const f of offen) await f(); });

  it('Einstieg über „Ablago verwalten“: frisch ohne Abfrage, sonst erneut anmelden; Werkbank nur im Modus', async () => {
    const x = await aufbau();
    offen.push(() => x.app.close());
    const c = await x.anmelden('lena@example.org');
    const st = (await x.rufe(c, 'GET', '/api/konto/status')).json();
    assert.deepEqual([st.verwaltungsmodus.darf, st.verwaltungsmodus.aktiv, st.verwaltungsmodus.frisch, st.benutzer.rolle], [true, false, true, 'mitglied']);
    const ohne = await x.rufe(c, 'GET', '/api/werkbank/uebersicht');
    assert.equal(ohne.statusCode, 403, 'ohne Modus keine Werkbank');
    assert.equal(ohne.json().details.verwaltungsmodus, true);
    // Petra darf nicht verwalten: kein Modus, kein Menüeintrag.
    const p = await x.anmelden('petra@example.org');
    assert.equal((await x.rufe(p, 'GET', '/api/konto/status')).json().verwaltungsmodus.darf, false);
    assert.equal((await x.verwalten(p)).statusCode, 403);
    // Anmeldung länger als 10 Minuten her: erneut anmelden.
    x.jetzt.t += 11 * MIN;
    const r = await x.verwalten(c);
    assert.equal(r.statusCode, 401);
    assert.equal(r.json().details.bestaetigen, true);
    assert.equal((await x.verwalten(c, { passwort: 'falsch-falsch' })).statusCode, 401);
    const seit = marke();
    assert.equal((await x.verwalten(c, { passwort: PW })).statusCode, 200);
    assert.ok(protokoll.eintraege({ seit }).some((e) => e.text === 'Verwaltungsmodus begonnen' && e.daten?.person === 'lena@example.org'));
    const st2 = (await x.rufe(c, 'GET', '/api/konto/status')).json();
    assert.deepEqual([st2.verwaltungsmodus.aktiv, st2.benutzer.rolle], [true, 'admin']);
    assert.equal((await x.rufe(c, 'GET', '/api/werkbank/uebersicht')).statusCode, 200);
    // Protokoll: jede Verwaltungshandlung mit Person und „im Verwaltungsmodus“ (ändernde Anfragen stehen auf „info“).
    assert.equal((await x.rufe(c, 'POST', '/api/werkbank/uebersicht/akzeptieren', { schluessel: 'test', grund: 'Probe' })).statusCode < 500, true);
    assert.ok(protokoll.eintraege({ seit }).some((e) => /POST \/api\/werkbank\/uebersicht\/akzeptieren/.test(e.text) && /lena@example\.org \(im Verwaltungsmodus\)/.test(e.benutzer ?? '')));
    await x.rufe(c, 'POST', '/api/konto/verwaltung/beenden');
    assert.ok(protokoll.eintraege({ seit }).some((e) => e.text === 'Verwaltungsmodus beendet' && e.daten?.imVerwaltungsmodus === true));
  });

  it('endet nach 15 Minuten ohne Aktivität; Abfragen im Hintergrund verlängern nicht; Wiedereinstieg heute mit einem Klick', async (t) => {
    if (kurzVorMitternacht()) return t.skip('kurz vor Mitternacht (Europe/Berlin)');
    const x = await aufbau();
    offen.push(() => x.app.close());
    const c = await x.anmelden('lena@example.org');
    assert.equal((await x.verwalten(c)).statusCode, 200);
    x.jetzt.t += 10 * MIN;
    assert.equal((await x.rufe(c, 'GET', '/api/werkbank/uebersicht', undefined, { 'x-dms-aktiv': '1' })).statusCode, 200, 'Eingabe: verlängert');
    x.jetzt.t += 10 * MIN;
    assert.equal((await x.rufe(c, 'GET', '/api/werkbank/uebersicht')).statusCode, 200, 'Abfrage ohne Eingabe: läuft noch');
    x.jetzt.t += 6 * MIN;
    const seit = marke();
    const weg = await x.rufe(c, 'GET', '/api/werkbank/uebersicht');
    assert.equal(weg.statusCode, 403, '16 Minuten nach der letzten Eingabe');
    assert.ok(protokoll.eintraege({ seit }).some((e) => e.text === 'Verwaltungsmodus abgelaufen'));
    assert.equal(weg.json().details.heuteBestaetigt, true);
    // Wiedereinstieg am selben Tag: ein Klick, ohne Passwort.
    assert.equal((await x.verwalten(c)).statusCode, 200);
    assert.equal((await x.rufe(c, 'POST', '/api/konto/verwaltung/beenden')).statusCode, 200);
    assert.equal((await x.rufe(c, 'GET', '/api/werkbank/uebersicht')).statusCode, 403, 'Verwaltung beendet');
    assert.equal((await x.verwalten(c)).statusCode, 200, 'Wiedereinstieg nach „Verwaltung beenden“');
    // Am nächsten Tag gilt der Merker nicht mehr.
    x.jetzt.t += 24 * 60 * MIN;
    assert.equal((await x.verwalten(c)).statusCode, 401);
  });

  it('Tagesmerker hängt an der Sitzung: neue Sitzung, Zwei-Faktor geändert oder Recht entzogen heben ihn auf', async (t) => {
    if (kurzVorMitternacht()) return t.skip('kurz vor Mitternacht (Europe/Berlin)');
    const x = await aufbau();
    offen.push(() => x.app.close());
    const c = await x.anmelden('jonas@example.org');
    x.jetzt.t += 11 * MIN;
    assert.equal((await x.verwalten(c, { passwort: PW })).statusCode, 200);
    await x.rufe(c, 'POST', '/api/konto/verwaltung/beenden');
    // Eine andere Sitzung (anderer Browser) hat keinen Merker.
    const c2 = await x.anmelden('jonas@example.org');
    x.jetzt.t += 11 * MIN;
    assert.equal((await x.verwalten(c2)).statusCode, 401);
    assert.equal((await x.verwalten(c)).statusCode, 200, 'im ersten Browser gilt er noch');
    // Zwei-Faktor geändert: Modus und Merker weg.
    await x.konten.zweifaktorGeaendert(x.jonas.id);
    assert.equal((await x.rufe(c, 'GET', '/api/benutzer')).statusCode, 403);
    assert.equal((await x.verwalten(c)).statusCode, 401);
    // Erneut angemeldet, dann entzieht Lena das Recht: Modus endet.
    assert.equal((await x.verwalten(c, { passwort: PW })).statusCode, 200);
    await x.konten.setzeVerwaltung(imModus(x.lena), x.jonas.id, []);
    assert.equal((await x.rufe(c, 'GET', '/api/benutzer')).statusCode, 403);
    assert.equal((await x.verwalten(c)).statusCode, 403);
  });

  it('mit Zwei-Faktor gehört der Code zur erneuten Anmeldung; Fehlversuche zählen in den Anmeldeschutz', async () => {
    const x = await aufbau();
    offen.push(() => x.app.close());
    const { geheimnis } = await x.zf.beginne({ id: x.lena.id, email: x.lena.email });
    const codes = await x.zf.bestaetige(x.lena.id, totp(ausBase32(geheimnis), Math.floor(Date.now() / 30_000) - 1), x.lena.email);
    // Anmelden mit einem Wiederherstellungscode (der Zeitschritt bleibt für die erneute Anmeldung frei).
    const a = await x.app.inject({ method: 'POST', url: '/api/konto/anmelden', payload: { email: 'lena@example.org', passwort: PW }, headers: { 'x-dms': '1' } });
    const kennung = a.json().zweiterSchritt as string;
    const code = await x.app.inject({ method: 'POST', url: '/api/konto/anmelden/code', payload: { kennung, code: codes[0] }, headers: { 'x-dms': '1' } });
    assert.equal(code.statusCode, 200, code.body);
    const c = ([] as string[]).concat(code.headers['set-cookie'] as string | string[])[0].split(';')[0];
    x.jetzt.t += 11 * MIN;
    const r = await x.verwalten(c);
    assert.equal(r.json().details.code, true, 'die Oberfläche fragt den Code mit ab');
    assert.equal((await x.verwalten(c, { passwort: PW })).statusCode, 401, 'Passwort allein genügt nicht');
    const seit = marke();
    assert.equal((await x.verwalten(c, { passwort: PW, code: '000000' })).statusCode, 401);
    assert.ok(protokoll.eintraege({ seit }).some((e) => e.text === 'Erneute Anmeldung fehlgeschlagen' && e.daten?.grund === 'Code'));
    assert.equal((await x.verwalten(c, { passwort: PW, code: totp(ausBase32(geheimnis), Math.floor(Date.now() / 30_000)) })).statusCode, 200);
  });

  it('nicht in einer Vertretung: wer in jemandes Namen arbeitet, ist nie im Verwaltungsmodus', async () => {
    const x = await aufbau();
    offen.push(() => x.app.close());
    const c = await x.anmelden('lena@example.org');
    await x.verwalten(c);
    const v = await x.rufe(c, 'POST', `/api/benutzer/${x.jonas.id}/vertreten`);
    assert.equal(v.statusCode, 200, v.body);
    const als = ([] as string[]).concat(v.headers['set-cookie'] as string | string[])[0].split(';')[0];
    const st = (await x.rufe(als, 'GET', '/api/konto/status')).json();
    assert.deepEqual([st.benutzer.id, st.verwaltungsmodus.darf, st.verwaltungsmodus.aktiv], [x.jonas.id, false, false]);
    assert.equal((await x.verwalten(als)).statusCode, 403);
  });
});

describe('Neues seit 0.188 im Modell von #818', () => {
  const offen: Array<() => Promise<unknown>> = [];
  after(async () => { for (const f of offen) await f(); });

  it('Passwörter für Dokumente (#827) bleiben auch im Verwaltungsmodus bei ihrer Person', async () => {
    const x = await aufbau();
    offen.push(() => x.app.close());
    const e = new PdfEntsperren(x.d.geschuetztePdfs.entsperrenAnbindung({ ablage: speicherFassungen(), speicher: speicherEinstellungen(), verschluessele: (k) => `v:${k}`, entschluessele: (w) => (w.startsWith('v:') ? w.slice(2) : null) }));
    x.d.geschuetztePdfs.verbindeEntsperren(e);
    const fremd = await e.merke(x.petra.id, 'Gehaltsabrechnung', 'petras-geheimnis');
    const c = await x.anmelden('lena@example.org');
    assert.equal((await x.verwalten(c)).statusCode, 200);
    assert.equal((await x.rufe(c, 'GET', '/api/konto/status')).json().verwaltungsmodus.aktiv, true);
    const liste = await x.rufe(c, 'GET', '/api/konto/dokument-passwoerter');
    assert.equal(liste.statusCode, 200, liste.body);
    assert.deepEqual(liste.json().eintraege, [], 'nur die eigenen – keine fremden, auch im Modus nicht');
    assert.equal((await x.rufe(c, 'POST', '/api/konto/dokument-passwoerter/bestaetigen', { passwort: PW })).statusCode, 200);
    const zeige = await x.rufe(c, 'GET', `/api/konto/dokument-passwoerter/${fremd.id}`);
    assert.ok(zeige.statusCode >= 400 && !zeige.body.includes('petras-geheimnis'), zeige.body);
    assert.ok((await x.rufe(c, 'PUT', `/api/konto/dokument-passwoerter/${fremd.id}`, { name: 'Umbenannt' })).statusCode >= 400);
    assert.ok((await x.rufe(c, 'DELETE', `/api/konto/dokument-passwoerter/${fremd.id}`)).statusCode >= 400);
    assert.equal((await e.liste(x.petra.id)).length, 1, 'Petras Eintrag bleibt unberührt');
    // In Petras Namen (Vertretung) auch nicht.
    const v = await x.rufe(c, 'POST', `/api/benutzer/${x.petra.id}/vertreten`);
    assert.equal(v.statusCode, 200, v.body);
    const als = ([] as string[]).concat(v.headers['set-cookie'] as string | string[])[0].split(';')[0];
    assert.equal((await x.rufe(als, 'GET', '/api/konto/dokument-passwoerter')).statusCode, 403);
  });

  it('Notfallblatt (Schlüssel aller Sicherungen) nur mit „Verschlüsselung“, nicht mit „Sicherung“ (#993)', () => {
    assert.deepEqual(bereicheDerRoute('GET', '/api/werkbank/notfallblatt'), ['verschluesselung']);
    assert.equal(heikleHandlung('GET', '/api/werkbank/notfallblatt', null), 'schluessel');
  });

  it('E-Mail-Versand über OAuth (#813) an- und abmelden braucht eine frische Anmeldung', () => {
    for (const p of ['/api/werkbank/betrieb/mail/oauth/start', '/api/werkbank/betrieb/mail/oauth/geraet', '/api/werkbank/betrieb/mail/oauth/abmelden']) {
      assert.equal(heikleHandlung('POST', p, {}), 'mailversand', p);
      assert.deepEqual(bereicheDerRoute('POST', p), ['betrieb'], p);
    }
    assert.equal(heikleHandlung('POST', '/api/werkbank/betrieb/mail/oauth/geraet/pruefen', {}), null, 'nur nachsehen');
  });
});

describe('Historie: fremde Mappen im Verwaltungsmodus (#820)', () => {
  const offen: Array<() => Promise<unknown>> = [];
  after(async () => { for (const f of offen) await f(); });

  it('vermerkt Öffnen, Herunterladen und Ändern dauerhaft – einmal kurz hintereinander, nur bei fremden Mappen', async () => {
    const x = await aufbau();
    offen.push(() => x.app.close());
    const gesperrt = await x.d.mappentypen.legeTypAn({ name: 'Personalakte', felder: [{ key: 'name', label: 'Name', typ: 'text', pflicht: true }], titelVorlage: '{name}' });
    await x.d.berechtigungen.setzeBerechtigungen(gesperrt.id, { grund: NICHTS, regeln: [] }, true);
    const offenTyp = await x.d.mappentypen.legeTypAn({ name: 'Notiz', felder: [{ key: 'name', label: 'Name', typ: 'text' }] });
    const m = await x.d.mappen.legeMappeAn({ typId: gesperrt.id, werte: { name: 'Akte Herr Özdemir' } });
    const eigen = await x.d.mappen.legeMappeAn({ typId: offenTyp.id, werte: { name: 'Einkauf' } });
    const c = await x.anmelden('lena@example.org');
    assert.equal((await x.rufe(c, 'GET', `/api/mappen/${m.id}`)).statusCode, 404, 'ohne Modus nicht lesbar');
    await x.verwalten(c);
    const r = await x.rufe(c, 'GET', `/api/mappen/${m.id}`);
    assert.equal(r.statusCode, 200);
    assert.equal(r.json().nurImVerwaltungsmodus, true, 'Hinweis für die Oberfläche');
    await x.rufe(c, 'GET', `/api/mappen/${m.id}`);
    const eigeneSicht = await x.rufe(c, 'GET', `/api/mappen/${eigen.id}`);
    assert.equal(eigeneSicht.json().nurImVerwaltungsmodus, undefined);
    assert.equal((await x.rufe(c, 'PUT', `/api/mappen/${m.id}`, { werte: { name: 'Akte Herr Özdemir (2)' } })).statusCode, 200);
    const h = (await x.d.mappenHistorie.historie(m.id)).filter((e) => e.art === 'verwaltungsmodus');
    assert.deepEqual(h.map((e) => [e.daten.was, e.benutzerId]).sort(), [['angesehen', x.lena.id], ['geaendert', x.lena.id]], 'kurz hintereinander nur einmal');
    assert.equal((await x.d.mappenHistorie.historie(eigen.id)).some((e) => e.art === 'verwaltungsmodus'), false);
    // Werkbank: Liste nur für „Gesamte Verwaltung“.
    const liste = (await x.rufe(c, 'GET', '/api/werkbank/verwaltungsmodus')).json() as Array<{ person: string; titel: string; was: string }>;
    assert.deepEqual(liste.map((e) => [e.person, e.was]).sort(), [['Lena', 'angesehen'], ['Lena', 'geaendert']]);
    const j = await x.anmelden('jonas@example.org');
    await x.verwalten(j);
    assert.equal((await x.rufe(j, 'GET', '/api/werkbank/verwaltungsmodus')).statusCode, 403);
    // Nach der Sperrfrist wieder ein Eintrag.
    await x.d.kurzzustand.loesche('modusspur');
    await x.rufe(c, 'GET', `/api/mappen/${m.id}`);
    assert.equal((await x.d.mappenHistorie.historie(m.id)).filter((e) => e.art === 'verwaltungsmodus' && e.daten.was === 'angesehen').length, 2);
  });

  it('nicht löschbar: auch das Aufräumen der Historie gelöschter Mappen lässt sie stehen', async () => {
    const repo = speicherRepo();
    const id = '00000000-0000-4000-8000-0000000000e1';
    await repo.historieSchreibe([{ mappeId: id, benutzerId: null, art: 'verwaltungsmodus', daten: { was: 'angesehen' } }, { mappeId: id, benutzerId: null, art: 'endgueltig' }]);
    await repo.historieAufraeumen(new Date(Date.now() + 60_000).toISOString());
    assert.deepEqual((await repo.historie(id)).map((e) => e.art), ['verwaltungsmodus']);
  });
});

const url = process.env.TEST_DATABASE_URL;
describe('PostgreSQL: Umstellung und Sperre (#818)', { skip: url ? false : 'TEST_DATABASE_URL nicht gesetzt' }, () => {
  it('Migration: Admin-Konten werden Personen mit „Gesamte Verwaltung“; gleichzeitiges Entziehen landet nie bei null', async () => {
    const { migriere } = await import('../src/db');
    const { pgKontoRepo } = await import('../src/konto-repo');
    const db = await eigeneDatenbank('verwaltungsmodus', { migrieren: false });
    const sql = db.sql;
    try {
      const alle = fileURLToPath(new URL('../migrations', import.meta.url));
      const vorher = await mkdtemp(join(tmpdir(), 'dms-a818-mig-'));
      for (const f of (await readdir(alle)).filter((n) => n.endsWith('.sql') && n < '073')) await cp(join(alle, f), join(vorher, f));
      await migriere(sql, vorher, () => {});
      const H = '00000000-0000-4000-8000-000000000001';
      const A = '00000000-0000-4000-8000-0000000000a1', B = '00000000-0000-4000-8000-0000000000a2', M = '00000000-0000-4000-8000-0000000000a3';
      await sql`INSERT INTO benutzer (id, haushalt_id, email, name, rolle, passwort_hash) VALUES (${A}, ${H}, 'lena@example.org', 'Lena', 'admin', 'x'), (${B}, ${H}, 'markus@example.org', 'Markus', 'admin', 'x'), (${M}, ${H}, 'jonas@example.org', 'Jonas', 'mitglied', 'x')`;
      await migriere(sql, alle, () => {});
      const repo = pgKontoRepo(sql, H);
      const liste = await repo.listeBenutzer();
      assert.deepEqual(liste.map((b) => [b.name, b.rolle, b.verwaltung]), [['Jonas', 'mitglied', []], ['Lena', 'mitglied', ['*']], ['Markus', 'mitglied', ['*']]]);
      // Dienstkonten: die Datenbank lehnt ein Verwaltungsrecht ab.
      await assert.rejects(sql`INSERT INTO benutzer (id, haushalt_id, email, name, rolle, art, paket_id, verwaltung) VALUES (gen_random_uuid(), ${H}, 'p@dienst.invalid', 'Paket', 'mitglied', 'dienst', 'p', '{*}')`);
      // Lena und Markus nehmen sich gleichzeitig gegenseitig das Recht: genau eine Änderung gelingt.
      const [r1, r2] = await Promise.all([
        repo.aendereGeschuetzt(B, { verwaltung: [] }, schutzGesamt),
        repo.aendereGeschuetzt(A, { verwaltung: [] }, schutzGesamt),
      ]);
      assert.equal(['benutzer' in r1, 'benutzer' in r2].filter(Boolean).length, 1, JSON.stringify([r1, r2]));
      assert.equal((await repo.listeBenutzer()).filter((b) => hatGesamt(b)).length, 1);
    } finally { await db.ende(); }
  });
});
