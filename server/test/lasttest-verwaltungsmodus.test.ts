/**
 * Lasttest und Verwaltungsmodus (#873): Die Mess-Sitzung des Administrators bleibt über einen langen Lauf im
 * Verwaltungsmodus, und eine Antwort des Servers (403, 503 …) zählt nie als „Server nicht erreichbar“. Statt 15
 * Minuten zu warten, stellt der Test die Uhr des Verwaltungsmodus vor (wie verwaltungsmodus.test.ts). Ablago läuft
 * hier im selben Prozess (Speicher-Repos), das Skript misst über HTTP wie im Betrieb.
 */
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, beforeEach, describe, it } from 'node:test';
import { Dienst } from '../src/dienst';
import { speicherDateien } from '../src/dateispeicher';
import { speicherEinstellungen } from '../src/einstellungen';
import { Konten } from '../src/konten';
import { speicherKontoRepo } from '../src/konto-repo';
import { speicherRepo } from '../src/repo-speicher';

const MIN = 60_000;
type Stand = { fehler?: string; status?: number; unerreichbar?: boolean; speicherMb?: number };
interface Lasttest {
  anmelden(z: [string, string]): Promise<string>;
  serverStand(cookie: string): Promise<Stand>;
  umgebung(cookie: string): Promise<{ version: string | null; datenbank: string | null; kerne: number | null; ramBegrenzt: boolean | null; grenzen: unknown }>;
  durchgang(v: unknown, o: { name: string; n: number; dauer: number; mitExport: boolean }): Promise<{ serverAusfaelle: number; zustandOhneWerte: number; speicherMbStart: number | null }>;
}

const jetzt = { t: Date.now() };
const zaehler = { verwaltung: 0, abgelehnt: 0 };
let app: Awaited<ReturnType<typeof import('../src/http')['baueApp']>>;
let lt: Lasttest;
const LENA: [string, string] = ['lena@example.org', 'lasttest-passwort-1'];
const PETRA: [string, string] = ['petra@example.org', 'lasttest-passwort-3'];

before(async () => {
  const d = new Dienst(speicherRepo(), speicherDateien(), { einstellungen: speicherEinstellungen() });
  const konten = new Konten(speicherKontoRepo(), null, 'http://nas.example.org', d.systemtypen.benutzerspiegel());
  d.verbindeKonten(konten.papierkorbHaken());
  const { benutzer: lena } = await konten.einrichten({ email: LENA[0], name: 'Lena (Lasttest)', passwort: LENA[1] });
  const r = await konten.legeBenutzerAn({ email: PETRA[0], name: 'Petra (Lasttest)' }, lena.id);
  await konten.passwortSetzen({ schluessel: r.link!.split('/passwort/')[1], passwort: PETRA[1] });
  await d.postSystemmappen.gleicheBenutzerAb(await konten.listeBenutzer());
  konten.uhr = () => jetzt.t;
  const { baueApp } = await import('../src/http');
  const { ApiSchluesselDienst, speicherApiSchluesselRepo } = await import('../src/apischluessel');
  const { Systemlast } = await import('../src/systemlast');
  app = await baueApp(d, konten, { apiSchluessel: new ApiSchluesselDienst(speicherApiSchluesselRepo()), systemlast: new Systemlast() });
  app.addHook('onResponse', async (req, reply) => {
    if (req.method === 'POST' && req.url === '/api/konto/verwaltung') zaehler.verwaltung++;
    if (req.url.startsWith('/api/werkbank/') && reply.statusCode === 403) zaehler.abgelehnt++;
  });
  await app.listen({ port: 0, host: '127.0.0.1' });
  // Das Skript liest das Ziel beim Laden (DMS_URL).
  process.env.DMS_URL = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
  lt = (await import(new URL('./lasttest.mjs', import.meta.url).href)) as Lasttest;
});
after(async () => { await app?.close().catch(() => {}); });

const v = (admin: string, mitglied: string) => ({ sitzungen: { admin, mitRolle: mitglied, ohneRolle: mitglied }, ansichten: ['keine'], mappen: ['keine'], dokumente: [] });

describe('Lasttest: Mess-Sitzung im Verwaltungsmodus (#873)', () => {
  // Jede Anmeldung ist echt (Date.now); die Uhr des Modus beginnt deshalb in jedem Test wieder bei „jetzt“.
  beforeEach(() => { jetzt.t = Date.now(); });

  it('Zustandsabfragen zählen als Aktivität: 20 Minuten mit Abfragen, Modus läuft ohne Neubeginn', async () => {
    const c = await lt.anmelden(LENA);
    const vorher = { ...zaehler };
    for (let i = 0; i < 4; i++) {
      jetzt.t += 5 * MIN;
      const s = await lt.serverStand(c);
      assert.equal(s.fehler, undefined, `nach ${(i + 1) * 5} Minuten: ${s.fehler}`);
      assert.equal(typeof s.speicherMb, 'number');
    }
    assert.deepEqual(zaehler, vorher, 'kein 403, kein erneuter Beginn');
  });

  it('nach mehr als 15 Minuten ohne Abfrage: einmal neu beginnen (heute bestätigt) und wiederholen – Kopf vollständig', async (t) => {
    // „Heute bestätigt“ zählt in Europe/Berlin; die Uhr rückt hier um 16 Minuten vor, die Anmeldung läuft mit der echten.
    // Kurz vor Mitternacht würde mitten im Test das Datum wechseln.
    const berlin = (o: Intl.DateTimeFormatOptions) => Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', ...o }).format(Date.now()));
    if (berlin({ hour: '2-digit', hourCycle: 'h23' }) === 23 && berlin({ minute: '2-digit' }) >= 15) return t.skip('kurz vor Mitternacht (Europe/Berlin)');
    const c = await lt.anmelden(LENA);
    jetzt.t += 16 * MIN;
    const vorher = { ...zaehler };
    const s = await lt.serverStand(c);
    assert.equal(s.fehler, undefined, s.fehler);
    assert.equal(zaehler.abgelehnt - vorher.abgelehnt, 1, 'genau eine 403 mit details.verwaltungsmodus');
    // Kurz vor Mitternacht braucht der Neubeginn die erneute Anmeldung (ein Versuch mehr).
    if (new Date(jetzt.t - 16 * MIN).toDateString() === new Date(jetzt.t).toDateString()) assert.equal(zaehler.verwaltung - vorher.verwaltung, 1, 'einmal neu begonnen, ohne Passwort');
    // Auch der Kopf des Ergebnisblocks nach einer langen Pause (wie am Ende von groß).
    jetzt.t += 16 * MIN;
    const u = await lt.umgebung(c);
    assert.ok(u.version, 'Version');
    assert.ok(u.datenbank, 'Datenbank');
    assert.equal(typeof u.kerne, 'number', 'Kerne');
    assert.equal(typeof u.ramBegrenzt, 'boolean', 'RAM');
    assert.ok(u.grenzen, 'Grenzen');
  });

  it('nach Mitternacht: erneute Anmeldung mit dem Passwort des Lasttest-Kontos', async () => {
    const c = await lt.anmelden(LENA);
    jetzt.t += 24 * 60 * MIN;
    const s = await lt.serverStand(c);
    assert.equal(s.fehler, undefined, s.fehler);
  });

  it('langer Durchgang: Werte da, keine Ausfälle', async () => {
    const admin = await lt.anmelden(LENA);
    const petra = await lt.anmelden(PETRA);
    jetzt.t += 20 * MIN;
    const e = await lt.durchgang(v(admin, petra), { name: 'lang', n: 2, dauer: 2, mitExport: false });
    assert.equal(e.serverAusfaelle, 0);
    assert.equal(e.zustandOhneWerte, 0);
    assert.equal(typeof e.speicherMbStart, 'number', 'Werte des Servers trotz Pause');
  });

  it('eine Antwort des Servers (403) zählt nie als „Server nicht erreichbar“', async () => {
    // Ohne Verwaltungsrecht antwortet der Server auf jede Zustandsabfrage mit 403 – er ist aber erreichbar.
    const petra = await lt.anmelden(PETRA);
    const s = await lt.serverStand(petra);
    assert.equal(s.status, 403);
    assert.equal(s.unerreichbar, undefined);
    const e = await lt.durchgang(v(petra, petra), { name: 'ohne Recht', n: 2, dauer: 2, mitExport: false });
    assert.equal(e.serverAusfaelle, 0, 'kein Ausfall');
    assert.ok(e.zustandOhneWerte >= 1, 'Antworten ohne Werte stehen getrennt');
  });

  it('nur ausbleibende Antworten zählen als Ausfall', async () => {
    const c = await lt.anmelden(LENA);
    await app.close();
    const s = await lt.serverStand(c);
    assert.equal(s.unerreichbar, true);
  });
});
