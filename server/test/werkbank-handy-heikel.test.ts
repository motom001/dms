/**
 * Werkbank am Handy (#1291): Heikle Handlungen sind am Handy genauso geprüft wie am Rechner. Der Server kennt kein
 * „Handy“ – er prüft je Anfrage Verwaltungsmodus, Recht auf den Bereich und, wo #819 es verlangt, die frische Anmeldung.
 * Dieser Test belegt das je Handlung aus #1291 über HTTP (Fastify inject): dieselbe Anfrage aus einer Sitzung mit dem
 * Browser eines iPhones und aus einer mit dem Browser eines Rechners, jeweils ohne Verwaltungsmodus, im Modus mit
 * nicht mehr frischer Anmeldung und frisch bestätigt. Die Antworten müssen gleich sein – nie weniger Prüfung am Handy.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { speicherDateien } from '../src/dateien/dateispeicher';
import { Dienst } from '../src/dienst/dienst';
import { speicherEinstellungen } from '../src/einstellungen/einstellungen';
import { Konten } from '../src/konten';
import { speicherKontoRepo } from '../src/konten/konto-repo';
import { speicherRepo } from '../src/repo/speicher';
import { Notfallcode } from '../src/notfall/notfallcode';
import { Wartung } from '../src/wartung/wartung';
import { heikleHandlung } from '../src/werkbank/verwaltungsbereiche';
import { imModus } from './hilfen';

const PW = 'ein-langes-passwort';
const MIN = 60_000;
const GERAETE = {
  rechner: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0 Safari/537.36',
  handy:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 26_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.1 Mobile/15E148 Safari/604.1',
} as const;
type Geraet = keyof typeof GERAETE;

/** Eine Handlung aus #1291: Anfrage samt Rumpf; `id` = die Person, um die es geht (Jonas). */
interface Handlung {
  name: string;
  methode: 'POST' | 'PUT' | 'DELETE';
  url: (jonas: string) => string;
  /** Rumpf; als Funktion je Stufe neu (Benutzer anlegen: jedes Mal eine andere Adresse). */
  body?: unknown | ((stufe: number) => unknown);
  /** Verlangt #819 dafür immer eine frische Anmeldung? */
  frisch: boolean;
}

const HANDLUNGEN: Handlung[] = [
  {
    name: 'Benutzer anlegen',
    methode: 'POST',
    url: () => '/api/benutzer',
    body: (n: number) => ({ email: `neu${n}@example.org`, name: 'Neu' }),
    frisch: false,
  },
  { name: 'Benutzer sperren', methode: 'PUT', url: (j) => `/api/benutzer/${j}`, body: { aktiv: false }, frisch: false },
  { name: 'Sitzungen beenden', methode: 'DELETE', url: (j) => `/api/benutzer/${j}/sitzungen`, frisch: false },
  { name: 'Passwort-Link erzeugen', methode: 'POST', url: (j) => `/api/benutzer/${j}/link`, frisch: false },
  { name: 'Wartungsmodus sofort an', methode: 'POST', url: () => '/api/werkbank/wartung/jetzt', frisch: false },
  { name: 'Wartungsmodus aus', methode: 'POST', url: () => '/api/werkbank/wartung/aus', frisch: false },
  {
    name: 'Notfallzugang aus dem Internet erlauben',
    methode: 'PUT',
    url: () => '/api/werkbank/anmeldeschutz/notfallzugang',
    body: { internet: true },
    frisch: true,
  },
  // Verwaltungsrecht vergeben (#818) steht am Benutzer gleich daneben; heikel nach #819.
  {
    name: 'Verwaltungsrecht vergeben',
    methode: 'PUT',
    url: (j) => `/api/benutzer/${j}/verwaltung`,
    body: { verwaltung: ['benutzer'] },
    frisch: true,
  },
];

const rumpf = (h: Handlung, stufe: number) => (typeof h.body === 'function' ? (h.body as (n: number) => unknown)(stufe) : h.body);

async function aufbau() {
  const d = new Dienst(speicherRepo(), speicherDateien(), { einstellungen: speicherEinstellungen() });
  const konten = new Konten(speicherKontoRepo(), null, 'http://nas', d.systemtypen.benutzerspiegel());
  d.verbindeKonten(konten.papierkorbHaken());
  const { benutzer: lena } = await konten.einrichten({ email: 'lena@example.org', name: 'Lena', passwort: PW });
  const r = await konten.legeBenutzerAn({ email: 'jonas@example.org', name: 'Jonas' }, lena.id);
  await konten.passwortSetzen({ schluessel: r.link!.split('/passwort/')[1], passwort: PW });
  // Sperren nur mit Vertreter (#78): Lena vertritt Jonas.
  await konten.setzeAbwesenheit(imModus(lena), r.benutzer.id, { an: false, vertreterId: lena.id });
  await d.postSystemmappen.gleicheBenutzerAb(await konten.listeBenutzer());
  const { baueApp } = await import('../src/http/http');
  const { ApiSchluesselDienst, speicherApiSchluesselRepo } = await import('../src/anmeldung/apischluessel');
  const app = await baueApp(d, konten, {
    apiSchluessel: new ApiSchluesselDienst(speicherApiSchluesselRepo()),
    wartung: new Wartung(speicherEinstellungen(), konten),
    notfallcode: new Notfallcode({ konten, einstellungen: speicherEinstellungen(), mailer: () => null }),
  });
  const jetzt = { t: Date.now() };
  konten.uhr = () => jetzt.t;
  return { app, jetzt, jonas: r.benutzer.id };
}

/**
 * Eine Handlung von einem Gerät aus, in drei Stufen: ohne Verwaltungsmodus, im Modus mit nicht mehr frischer Anmeldung,
 * frisch bestätigt. Rückgabe: Status und was der Server als fehlend meldet (`details`) je Stufe.
 */
async function ablauf(h: Handlung, geraet: Geraet) {
  const x = await aufbau();
  try {
    const kopf = { 'x-dms': '1', 'user-agent': GERAETE[geraet] };
    const an = await x.app.inject({
      method: 'POST',
      url: '/api/konto/anmelden',
      payload: { email: 'lena@example.org', passwort: PW },
      headers: kopf,
    });
    assert.equal(an.statusCode, 200, an.body);
    const cookie = ([] as string[]).concat(an.headers['set-cookie'] as string | string[])[0].split(';')[0];
    const rufe = (method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, payload?: unknown, mehr: Record<string, string> = {}) =>
      x.app.inject({
        method,
        url,
        ...(payload === undefined ? {} : { payload: payload as object }),
        headers: { ...kopf, cookie, ...mehr },
      });
    let n = 0;
    const stufe = async () => {
      const r = await rufe(h.methode, h.url(x.jonas), rumpf(h, n++));
      const details = r.statusCode === 403 ? ((r.json() as { details?: Record<string, unknown> }).details ?? {}) : {};
      return { status: r.statusCode, modus: details.verwaltungsmodus === true, frisch: details.frisch === true };
    };
    const ohneModus = await stufe();
    assert.equal((await rufe('POST', '/api/konto/verwaltung', {})).statusCode, 200);
    // 11 Minuten später, aber aktiv geblieben: Der Modus läuft, die Anmeldung ist nicht mehr frisch (#819).
    x.jetzt.t += 6 * MIN;
    await rufe('GET', '/api/werkbank/uebersicht', undefined, { 'x-dms-aktiv': '1' });
    x.jetzt.t += 5 * MIN;
    const nichtFrisch = await stufe();
    assert.equal((await rufe('POST', '/api/konto/verwaltung/bestaetigen', { passwort: PW })).statusCode, 200);
    const frisch = await stufe();
    return { ohneModus, nichtFrisch, frisch };
  } finally {
    await x.app.close();
  }
}

describe('Werkbank am Handy: heikle Handlungen genauso geprüft wie am Rechner (#1291)', () => {
  for (const h of HANDLUNGEN)
    it(`${h.name}: am Handy dieselbe Prüfung wie am Rechner`, async () => {
      const rechner = await ablauf(h, 'rechner');
      const handy = await ablauf(h, 'handy');
      assert.deepEqual(handy, rechner, 'Am Handy anders geprüft als am Rechner');
      // Ohne Verwaltungsmodus nie – auch nicht am Handy.
      assert.deepEqual([handy.ohneModus.status, handy.ohneModus.modus], [403, true], 'ohne Verwaltungsmodus');
      // Frische Anmeldung, wo #819 sie verlangt; danach geht es.
      if (h.frisch) assert.deepEqual([handy.nichtFrisch.status, handy.nichtFrisch.frisch], [403, true], 'ohne frische Anmeldung');
      else assert.ok(handy.nichtFrisch.status < 400, `im Modus: ${handy.nichtFrisch.status}`);
      assert.ok(handy.frisch.status < 400, `frisch bestätigt: ${handy.frisch.status}`);
      // Die Liste der heiklen Handlungen hängt nur an Methode, Pfad und Rumpf, nie am Gerät.
      const pfad = h.url(':id');
      assert.equal(heikleHandlung(h.methode, pfad, rumpf(h, 0)) !== null, h.frisch, `heikleHandlung(${h.methode} ${pfad})`);
    });
});
