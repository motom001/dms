/**
 * Wartungsmodus: nichts geht rein, nichts geht raus (#1549) – je Weg ein Test: E-Mail-Versand (ausgelassen, Fehler
 * 503), Postfach-Abruf (ruht, kein Verbindungsaufbau), Zustellung nach außen (Webhook-Ziele: nichts zugestellt,
 * später nachgeholt), Pakete (keine Aufrufe), Zeitplan der Automatisierungen
 * (ruht) – und der
 * Modus bleibt über einen Neustart erhalten.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Betrieb, speicherBetrieb, type transport } from '../src/einstellungen/betrieb';
import { speicherEinstellungen } from '../src/einstellungen/einstellungen';
import { Fachfehler } from '../src/grundlagen/fehler';
import { Wartung } from '../src/wartung/wartung';
import { Dienst } from '../src/dienst/dienst';
import { speicherRepo } from '../src/repo/speicher';
import { speicherDateien } from '../src/dateien/dateispeicher';
import { Konten } from '../src/konten';
import { speicherKontoRepo } from '../src/konten/konto-repo';
import { ApiSchluesselDienst, speicherApiSchluesselRepo } from '../src/anmeldung/apischluessel';
import { Paketlaeufer, type ApiAufruf } from '../src/laeufer/verwaltung';
import { Postfaecher } from '../src/post/postfach';
import { Automatisierungen, speicherAutomatisierungRepo } from '../src/automatisierung';

describe('Wartungsmodus: nichts geht rein, nichts geht raus (#1549)', () => {
  it('Versand: keine E-Mail im Wartungsmodus (Fehler 503, nicht verschickt); danach wieder', async () => {
    let verschickt = 0;
    const tr: typeof transport = () =>
      ({
        verify: async () => true,
        sendMail: async () => {
          verschickt++;
          return {};
        },
      }) as never;
    const sp = speicherBetrieb();
    await sp.schreibe('mail', {
      aktiv: true,
      host: 'smtp.example.org',
      port: 587,
      verbindung: 'starttls',
      benutzer: 'lena@example.org',
      passwort: 'x',
      absender: '',
      selbstsigniert: false,
    });
    const b = new Betrieb(sp, 'http://nas', undefined, { transport: tr });
    await b.laden();
    let wartung = true;
    b.ruht = () => wartung;
    await assert.rejects(
      b.mailer()!.sende('markus@example.org', 'Zusammenfassung', 'Text'),
      (e) => e instanceof Fachfehler && e.status === 503,
    );
    assert.equal(verschickt, 0);
    wartung = false;
    await b.mailer()!.sende('markus@example.org', 'Zusammenfassung', 'Text');
    assert.equal(verschickt, 1);
  });

  it('Abruf: das Postfach ruht, keine Verbindung zum Mailserver', async () => {
    const d = new Dienst(speicherRepo(), speicherDateien(), { einstellungen: speicherEinstellungen() });
    let verbindungen = 0;
    const pf = new Postfaecher({
      dienst: d,
      einstellungen: speicherEinstellungen(),
      verbinde: async () => {
        verbindungen++;
        throw new Error('nicht erwartet');
      },
      lies: (async () => {
        throw new Error('nicht erwartet');
      }) as never,
      verschluessele: (k) => `v1:${k}`,
      entschluessele: (w) => w.slice(3),
      pause: () => 'Wartungsmodus',
    });
    const [p] = await pf.speichere(
      { name: 'Rechnungen', server: 'imap.example.org', port: 993, benutzer: 'ablage@example.org', passwort: 'x' },
      null,
      'test',
    );
    await assert.rejects(pf.abrufen(p.id), /Wartungsmodus/);
    assert.equal(verbindungen, 0);
  });

  it('Zustellung nach außen (Webhook-Ziele): im Wartungsmodus nichts, danach nachgeholt', async () => {
    let gefragt = 0;
    let pause: string | null = 'Wartungsmodus';
    const d = new Dienst(speicherRepo(), speicherDateien(), { einstellungen: speicherEinstellungen() });
    const repo = {
      faellige: async () => {
        gefragt++;
        return [];
      },
      raeumeAuf: async () => 0,
    } as never;
    const a = new Automatisierungen({ dienst: d, repo: speicherAutomatisierungRepo(), pause: () => pause, aussen: { repo } }).ausleitung;
    assert.equal(await a.zustellen(), 0);
    assert.equal(gefragt, 0, 'nicht einmal nachgesehen');
    pause = null;
    await a.zustellen();
    assert.equal(gefragt, 1, 'nach dem Wartungsmodus wird zugestellt');
  });

  it('Zeitplan der Automatisierungen ruht und wird danach nachgeholt', async () => {
    const d = new Dienst(speicherRepo(), speicherDateien(), { einstellungen: speicherEinstellungen() });
    const repo = speicherAutomatisierungRepo();
    let gefragt = 0;
    const liste = repo.liste.bind(repo);
    repo.liste = async (...a: Parameters<typeof liste>) => {
      gefragt++;
      return liste(...a);
    };
    let pause: string | null = 'Wartungsmodus';
    const m = new Automatisierungen({ dienst: d, repo, pause: () => pause });
    await m.zeitplan();
    assert.equal(gefragt, 0);
    pause = null;
    await m.zeitplan();
    assert.ok(gefragt > 0, 'nach dem Wartungsmodus läuft der Zeitplan (fällige Tage werden nachgeholt)');
  });

  it('Pakete: keine Aufrufe im Wartungsmodus', async () => {
    const d = new Dienst(speicherRepo(), speicherDateien(), { einstellungen: speicherEinstellungen() });
    const konten = new Konten(
      speicherKontoRepo(),
      () => null,
      () => 'http://localhost',
      d.systemtypen.benutzerspiegel(),
    );
    const api: ApiAufruf = async () => ({ status: 404, kopf: {}, body: Buffer.from('{}') });
    const l = new Paketlaeufer({
      dienst: d,
      konten,
      schluessel: new ApiSchluesselDienst(speicherApiSchluesselRepo()),
      api,
      einstellungen: async () => ({}),
      speicher: { lies: async () => ({}), schreibe: async () => {} },
      grenzen: { sekunden: 3, speicherMB: 16 },
      pausiert: () => true,
    });
    await assert.rejects(l.aktion('rechnungen', 'pruefen', {}), /Während der Wartung laufen keine Pakete/);
    await assert.rejects(l.schnittstelle('rechnungen', 'x', {}, { bezeichnung: 'Test' }), /Während der Wartung laufen keine Pakete/);
  });

  it('bleibt über einen Neustart erhalten – ein Testsystem aus einem Snapshot startet ruhig', async () => {
    const e = speicherEinstellungen();
    const konten = { beendeAlleSitzungenAusser: async () => 0 };
    const w = new Wartung(e, konten);
    await w.laden();
    await w.einschalten({ text: 'Testsystem', ende: null, vorlauf: 0 }, { email: 'lena@example.org' }, null);
    await w.jetztAktiv({ email: 'lena@example.org' }, null);
    const neu = new Wartung(e, konten);
    await neu.laden();
    assert.equal(neu.aktiv, true);
    neu.stop?.();
    w.stop?.();
  });
});
