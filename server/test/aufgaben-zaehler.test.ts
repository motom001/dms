/**
 * Aufgabe und Notiz speichern schneller (#928) – mit PostgreSQL über HTTP („Nachhinken ja, falsch nie“):
 * - Zahl „Zu erledigen“ und Ansichten nur mit Favoriten: neue Abfrage (zwei Zweige, Index aus Migration 087, Favoriten
 *   als Ausgangspunkt) zählt genau wie die bisherige – mit und ohne Zwischenspeicher (`DMS_ZWISCHENSPEICHER=aus`), mit
 *   Vertretung, Leserecht auf Zeit (#798), Aufgaben ohne Empfänger und Aufgaben aus Automatisierungen.
 * - Eigene Änderung sofort: Aufgabe und Notiz sind in der nächsten Anfrage zu sehen, auch wenn der Abgleich der Fälle
 *   (#798) und das Wecken des Verteilers erst nach der Antwort laufen (Nachlauf, #741).
 * - Leserecht auf Zeit endet mit dem Erledigen sofort, nicht erst im Nachlauf.
 */
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import type postgres from 'postgres';
import { NICHTS, type Regelwerk } from '../../shared/src/rechte';
import { richteZwischenspeicherEin } from '../src/zaehlerspeicher';
import { eigeneDatenbank } from './hilfe-db';

const url = process.env.TEST_DATABASE_URL;
const HAUSHALT = '00000000-0000-4000-8000-000000000001';
const PW = 'ein-langes-passwort';

describe('Aufgabe und Notiz speichern (#928, PostgreSQL)', { skip: url ? false : 'TEST_DATABASE_URL nicht gesetzt' }, () => {
  type App = { inject: (o: { method: string; url: string; payload?: unknown; headers?: Record<string, string> }) => Promise<{ statusCode: number; body: string; headers: Record<string, unknown> }>; close(): Promise<void> };
  let app!: App;
  let sql!: postgres.Sql;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Module erst nach dem Setzen der Umgebung dynamisch geladen; Typ im Test ohne Belang
  let dienst!: any; let konten!: any; let repo!: any;
  let nachlauf!: { alle(): Promise<void> };
  const ids = { lena: '', jonas: '', petra: '', markus: '', vertrag: '' };
  const mappen: string[] = [];
  const cookies: Record<string, string> = {};

  const anmelden = async (email: string) => {
    const r = await app.inject({ method: 'POST', url: '/api/konto/anmelden', payload: { email, passwort: PW }, headers: { 'x-dms': '1' } });
    assert.equal(r.statusCode, 200, r.body);
    return String(([] as string[]).concat(r.headers['set-cookie'] as string)[0]).split(';')[0];
  };
  const rufe = async (wer: string, method: string, pfad: string, payload?: unknown) => {
    const r = await app.inject({ method, url: pfad, ...(payload === undefined ? {} : { payload }), headers: { 'x-dms': '1', cookie: cookies[wer] } });
    return { status: r.statusCode, body: r.body ? JSON.parse(r.body) : null };
  };
  /** Zahlen der Ablage (eingang = „Zu erledigen“, favoriten, Ansichten). */
  const zahlen = async (wer: string) => {
    const r = await rufe(wer, 'GET', '/api/sichten');
    assert.equal(r.status, 200, JSON.stringify(r.body));
    return { eingang: r.body.eingang as number, favoriten: r.body.favoriten as number, sichten: r.body.sichten as Record<string, number> };
  };
  /** Die Zählung bis #928, wörtlich: Mappen mit offenen Aufgaben (für ihn, als Admin auch ohne Empfänger). */
  const eingangBisher = async (id: string, ohne: boolean) =>
    (await sql`SELECT count(DISTINCT a.mappe_id)::int AS n FROM aufgaben a JOIN mappen m ON m.id = a.mappe_id
      WHERE m.haushalt_id = ${HAUSHALT} AND a.erledigt IS NULL AND (a.empfaenger_id = ${id}::uuid OR (${ohne} AND a.empfaenger_id IS NULL))`)[0].n as number;
  const aufgabe = async (wer: string, mappe: string, an: string, text = 'Bitte prüfen') => {
    const r = await rufe(wer, 'POST', `/api/mappen/${mappe}/aufgaben`, { text, empfaengerId: an });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    return r.body as { id: string; empfaengerId: string; hinweis?: string };
  };

  before(async () => {
    const db = await eigeneDatenbank('aufgaben_zaehler');
    sql = db.sql;
    const { baueApp, Nachlauf } = await import('../src/http');
    const { Dienst } = await import('../src/dienst');
    const { pgRepo } = await import('../src/repo-pg');
    const { Konten } = await import('../src/konten');
    const { pgKontoRepo } = await import('../src/konto-repo');
    const { ordnerSpeicher } = await import('../src/dateispeicher');
    const { pgEinstellungen } = await import('../src/einstellungen');
    repo = pgRepo(sql, HAUSHALT);
    dienst = new Dienst(repo, ordnerSpeicher(await mkdtemp(join(tmpdir(), 'dms-a928-')), HAUSHALT), { einstellungen: pgEinstellungen(sql, HAUSHALT) });
    konten = new Konten(pgKontoRepo(sql, HAUSHALT), null, 'http://nas', dienst.systemtypen.benutzerspiegel());
    dienst.verbindeKonten(konten.papierkorbHaken());
    nachlauf = new Nachlauf();
    app = await baueApp(dienst, konten, { nachlauf: nachlauf as InstanceType<typeof Nachlauf> }) as unknown as App;
    const { benutzer: lena } = await konten.einrichten({ email: 'lena@example.org', name: 'Lena', passwort: PW });
    ids.lena = lena.id;
    const mitPasswort = async (email: string, name: string) => {
      const r = await konten.legeBenutzerAn({ email, name }, lena.id);
      await konten.passwortSetzen({ schluessel: r.link!.split('/passwort/')[1], passwort: PW });
      return r.benutzer.id as string;
    };
    ids.jonas = await mitPasswort('jonas@example.org', 'Jonas');
    ids.petra = await mitPasswort('petra@example.org', 'Petra');
    ids.markus = await mitPasswort('markus@example.org', 'Markus');
    await dienst.gleicheBenutzerAb(await konten.listeBenutzer());
    // Verträge lesen Lena, Jonas und Markus – Petra nicht.
    ids.vertrag = (await dienst.mappentypen.legeTypAn({ name: 'Vertrag', felder: [{ key: 'name', label: 'Name', typ: 'text', pflicht: true }], titelVorlage: '{name}' })).id;
    const rw: Regelwerk = { grund: { ...NICHTS, C: true }, regeln: [{ id: 'r', name: 'Lesen', wenn: [{ art: 'benutzer', benutzer: [ids.lena, ids.jonas, ids.markus] }], dann: { R: 'erteilen', U: 'erteilen' }, stopp: false }] } as unknown as Regelwerk;
    await dienst.setzeBerechtigungen(ids.vertrag, rw, true);
    for (let i = 1; i <= 12; i++) mappen.push((await dienst.legeMappeAn({ typId: ids.vertrag, werte: { name: `Vertrag ${i}` } }, lena.id)).id);
    for (const [k, email] of [['lena', 'lena@example.org'], ['jonas', 'jonas@example.org'], ['petra', 'petra@example.org'], ['markus', 'markus@example.org']]) cookies[k] = await anmelden(email);
  });
  after(async () => { richteZwischenspeicherEin({}); await app?.close(); });

  it('„Zu erledigen“ und Favoriten-Ansicht: gleiche Zahlen wie bisher, mit und ohne Zwischenspeicher', async () => {
    // Zwei Aufgaben an derselben Mappe zählen einmal; Aufgaben ohne Empfänger zählen für die Administratorin.
    await aufgabe('lena', mappen[0], ids.jonas);
    await aufgabe('lena', mappen[1], ids.jonas);
    await aufgabe('lena', mappen[1], ids.jonas, 'Noch einmal');
    await repo.legeAufgabeAn({ id: crypto.randomUUID(), mappeId: mappen[2], empfaengerId: null, art: 'manuell', text: 'Ohne Empfänger', erstellt: '', erstelltVon: null, erledigt: null, erledigtVon: null });
    await aufgabe('lena', mappen[3], ids.lena);
    // Vertretung: Markus ist abwesend, Jonas vertritt ihn – die Aufgabe für Markus zählt bei Jonas.
    await konten.setzeAbwesenheit((await konten.listeBenutzer()).find((b: { id: string }) => b.id === ids.markus), ids.markus, { an: true, vertreterId: ids.jonas });
    const v = await aufgabe('lena', mappen[4], ids.markus);
    assert.equal(v.empfaengerId, ids.jonas, 'an den Vertreter weitergegeben');
    // Leserecht auf Zeit (#798): Petra darf Verträge nicht lesen; Lena gibt ihr das Recht für die Aufgabe.
    const p = await aufgabe('lena', mappen[5], ids.petra);
    assert.ok(p.hinweis, 'Hinweis: Petra darf die Mappe nicht lesen');
    await nachlauf.alle();
    const fall = (await dienst.offeneFaelle()).find((f: { aufgabeId: string }) => f.aufgabeId === p.id);
    assert.ok(fall, 'Fall nach dem Nachlauf angelegt');
    await dienst.leserechtAufZeitGeben(fall.id, ids.lena);
    // Aufgabe aus einer Automatisierung (#676, #724).
    await dienst.aufgabeAusAutomatisierung({ mappeId: mappen[6], empfaengerId: ids.jonas, text: 'Aus der Automatisierung', datum: null, von: ids.lena, buendeln: null, anlass: {} });
    // Erledigte zählen nicht.
    const erl = await aufgabe('lena', mappen[7], ids.jonas);
    assert.equal((await rufe('jonas', 'POST', `/api/aufgaben/${erl.id}/erledigt`)).status, 200);
    // Favoriten: die Ansicht „Favoriten“ zählt von den Favoriten aus.
    for (const m of [mappen[0], mappen[8]]) assert.equal((await rufe('jonas', 'PUT', `/api/mappen/${m}/favorit`)).status, 200);
    await dienst.stand.hochgezaehlt();

    const erwartet = { lena: await eingangBisher(ids.lena, true), jonas: await eingangBisher(ids.jonas, false), petra: await eingangBisher(ids.petra, false), markus: await eingangBisher(ids.markus, false) };
    assert.deepEqual(erwartet, { lena: 2, jonas: 4, petra: 1, markus: 0 }, 'Ausgangslage wie gedacht');
    const mit: Record<string, Awaited<ReturnType<typeof zahlen>>> = {};
    for (const wer of Object.keys(erwartet)) {
      mit[wer] = await zahlen(wer);
      assert.equal((await zahlen(wer)).eingang, mit[wer].eingang, 'zweimal gleich (Zwischenspeicher)');
      assert.equal(mit[wer].eingang, erwartet[wer as keyof typeof erwartet], `${wer}: Zahl wie bisher`);
    }
    assert.equal(mit.jonas.favoriten, 2);
    const favSicht = await dienst.favoritenSicht();
    assert.ok(favSicht, 'Ansicht „Favoriten“ gibt es');
    assert.equal(mit.jonas.sichten[favSicht], 2, 'Ansicht „Favoriten“ zählt nur die eigenen');
    assert.equal(mit.lena.sichten[favSicht], 0);
    richteZwischenspeicherEin({ DMS_ZWISCHENSPEICHER: 'aus' });
    try {
      for (const wer of Object.keys(erwartet)) assert.deepEqual(await zahlen(wer), mit[wer], `${wer}: ohne Zwischenspeicher gleich`);
    } finally { richteZwischenspeicherEin({}); }
  });

  it('eigene Änderung sofort: Aufgabe und Notiz in der nächsten Anfrage, Fälle und Verteiler nach der Antwort', async () => {
    const vorher = await zahlen('jonas');
    await zahlen('jonas');
    await aufgabe('jonas', mappen[9], ids.jonas, 'Für mich');
    assert.equal((await zahlen('jonas')).eingang, vorher.eingang + 1, 'ohne Warten');
    const n = await rufe('jonas', 'POST', `/api/mappen/${mappen[9]}/notizen`, { text: 'Gleich zu sehen' });
    assert.equal(n.status, 201, JSON.stringify(n.body));
    const liste = await rufe('jonas', 'GET', `/api/mappen/${mappen[9]}/notizen`);
    assert.ok(liste.body.some((x: { id: string }) => x.id === n.body.id), 'Notiz sofort in der Liste');
    const h = await rufe('jonas', 'GET', `/api/mappen/${mappen[9]}/historie`);
    assert.equal(h.status, 200);
    // Petra ohne Leserecht: der Fall entsteht im Nachlauf.
    const p = await aufgabe('jonas', mappen[10], ids.petra);
    await nachlauf.alle();
    assert.ok((await dienst.offeneFaelle()).some((f: { aufgabeId: string }) => f.aufgabeId === p.id));
    // Das Ereignis „aufgabe.neu“ steht schon im Ausgangskorb, bevor der Verteiler geweckt wird.
    const [e] = await sql`SELECT count(*)::int AS n FROM ereignisse WHERE art = 'aufgabe.neu' AND daten ->> 'aufgabe' = ${p.id}`;
    assert.equal(e.n, 1);
  });

  it('Leserecht auf Zeit endet mit dem Erledigen sofort (nicht erst im Nachlauf)', async () => {
    const p = await aufgabe('lena', mappen[11], ids.petra);
    await nachlauf.alle();
    const fall = (await dienst.offeneFaelle()).find((f: { aufgabeId: string }) => f.aufgabeId === p.id);
    await dienst.leserechtAufZeitGeben(fall.id, ids.lena);
    assert.equal((await rufe('petra', 'GET', `/api/mappen/${mappen[11]}`)).status, 200, 'mit Leserecht auf Zeit');
    assert.equal((await rufe('petra', 'POST', `/api/aufgaben/${p.id}/erledigt`)).status, 200);
    assert.equal((await rufe('petra', 'GET', `/api/mappen/${mappen[11]}`)).status, 404, 'gleich danach kein Leserecht mehr');
  });
});
