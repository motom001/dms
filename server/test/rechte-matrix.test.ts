/**
 * Rechte-Matrix (#1262): jede Route mit jeder Rolle, über HTTP (Fastify inject) wie im Betrieb.
 *
 * `routen-liste.test.ts` prüft, dass jede Route eine Zugriffsstufe nennt; hier wird geprüft, dass die Stufe auch
 * durchgesetzt wird – für alle Routen, auch für künftige, ohne dass jemand an einen eigenen Test denken muss.
 * Erwartet wird die Ablehnung, bevor der Handler etwas tut: Der Rumpf ist leer, ein 400/422 bei einer Rolle ohne
 * Recht hieße, dass der Handler vor der Rechteprüfung den Rumpf liest.
 *
 * Rollen: ohne Anmeldung, Person ohne Verwaltungsrecht, Person mit Verwaltungsrecht ohne Verwaltungsmodus,
 * Verwaltung mit nur einem Bereich, API-Schlüssel (lesen, schreiben), Anfrage ohne X-DMS.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { speicherDateien } from '../src/dateispeicher';
import { Dienst } from '../src/dienst';
import { speicherEinstellungen } from '../src/einstellungen';
import { Konten } from '../src/konten';
import { speicherKontoRepo } from '../src/konto-repo';
import { speicherRepo } from '../src/repo-speicher';
import { routen, type Route } from '../src/routen';
import { bereicheDerRoute, JEDER } from '../src/verwaltungsbereiche';
import { NICHTS, type Regelwerk } from '../../shared/src/rechte';
import { imModus } from './hilfen';

const PW = 'ein-langes-passwort';
const FREMD = '00000000-0000-4000-8000-000000000001';
type Methode = Route['methode'];

/**
 * Objektebene: Routen, die bei einer fremden Kennung bewusst nicht mit 403/404 antworten – mit Grund. Eine neue
 * Ausnahme macht den Test rot und gehört mit einem Satz Begründung in den PR (wie OFFEN in routen-liste.test.ts).
 */
const OBJEKT_AUSNAHMEN: Record<string, string> = {
  'DELETE /api/mappen/:id/favorit':
    'entfernt nur den eigenen Favoriten-Merker; muss auch gehen, wenn das Leserecht inzwischen fehlt; verrät nichts über die Mappe',
  'DELETE /api/v1/mappen/:id/favorit': 'wie intern: nur der eigene Favoriten-Merker',
};

/** Rumpf, der die Prüfung des Rumpfs besteht, damit die Rechteprüfung dahinter erreicht wird. */
const KOERPER: Record<string, unknown> = {
  'POST /api/mappen/:id/mit-verknuepften-loeschen': { auswahl: {} },
  'POST /api/v1/mappen/:id/mit-verknuepften-loeschen': { auswahl: {} },
};

/** Pfad mit Platzhaltern füllen; für die Zugriffsstufe genügt eine beliebige Kennung. */
const fuelle = (pfad: string) => pfad.replace(/:[A-Za-z]+/g, FREMD).replace(/\*$/, 'x');
const name = (r: Pick<Route, 'methode' | 'pfad'>) => `${r.methode} ${r.pfad}`;

async function aufbau() {
  const d = new Dienst(speicherRepo(), speicherDateien(), { einstellungen: speicherEinstellungen() });
  const konten = new Konten(speicherKontoRepo(), null, 'http://nas', d.systemtypen.benutzerspiegel());
  d.verbindeKonten(konten.papierkorbHaken());
  const { benutzer: lena } = await konten.einrichten({ email: 'lena@example.org', name: 'Lena', passwort: PW });
  const mitPasswort = async (email: string, n: string) => {
    const r = await konten.legeBenutzerAn({ email, name: n }, lena.id);
    await konten.passwortSetzen({ schluessel: r.link!.split('/passwort/')[1], passwort: PW });
    return r.benutzer;
  };
  const markus = await mitPasswort('markus@example.org', 'Markus');
  const jonas = await mitPasswort('jonas@example.org', 'Jonas');
  const katrin = await mitPasswort('katrin@example.org', 'Katrin');
  await konten.setzeVerwaltung(imModus(lena), jonas.id, ['benutzer']);
  await d.postSystemmappen.gleicheBenutzerAb(await konten.listeBenutzer());
  const { baueApp } = await import('../src/http');
  const { ApiSchluesselDienst, speicherApiSchluesselRepo } = await import('../src/apischluessel');
  const schluessel = new ApiSchluesselDienst(speicherApiSchluesselRepo());
  const app = await baueApp(d, konten, { apiSchluessel: schluessel });
  const anmelden = async (email: string) => {
    const r = await app.inject({ method: 'POST', url: '/api/konto/anmelden', payload: { email, passwort: PW }, headers: { 'x-dms': '1' } });
    assert.equal(r.statusCode, 200, r.body);
    return ([] as string[]).concat(r.headers['set-cookie'] as string | string[])[0].split(';')[0];
  };
  const lesen = (await schluessel.lege(markus, { name: 'Lesen', recht: 'lesen' })).schluessel;
  const schreiben = (await schluessel.lege(markus, { name: 'Schreiben', recht: 'schreiben' })).schluessel;
  // Lena hat „Gesamte Verwaltung“, ist aber nicht im Verwaltungsmodus; Jonas ist im Modus, mit nur „Benutzer“.
  const cLena = await anmelden('lena@example.org');
  const cMarkus = await anmelden('markus@example.org');
  const cJonas = await anmelden('jonas@example.org');
  const cKatrin = await anmelden('katrin@example.org');
  const schluesselKatrin = (await schluessel.lege(katrin, { name: 'Katrin', recht: 'schreiben' })).schluessel;
  const modus = await app.inject({ method: 'POST', url: '/api/konto/verwaltung', payload: {}, headers: { 'x-dms': '1', cookie: cJonas } });
  assert.equal(modus.statusCode, 200, modus.body);
  // Objektebene: Markus' private Mappen – nur er darf lesen; Katrin hat keine Rechte daran.
  const nurMarkus: Regelwerk = {
    grund: { ...NICHTS, C: true },
    regeln: [
      {
        id: 'r',
        name: 'Nur Markus',
        wenn: [{ art: 'benutzer', benutzer: [markus.id] }],
        dann: { R: 'erteilen', U: 'erteilen', D: 'erteilen' },
        stopp: false,
      },
    ],
  };
  const privat = await d.mappentypen.legeTypAn({
    name: 'Privat',
    felder: [{ key: 'name', label: 'Name', typ: 'text', pflicht: true }],
    titelVorlage: '{name}',
  });
  await d.berechtigungen.setzeBerechtigungen(privat.id, nurMarkus, true);
  const mappe = await d.mappen.legeMappeAn({ typId: privat.id, werte: { name: 'Gehalt' } }, markus.id);
  const pdf = Buffer.from('%PDF-1.4 a');
  const dok = (await d.dokumente.ladeHoch(mappe.id, { register: 'dokumente', name: 'A.pdf', typ: 'application/pdf' }, pdf, markus.id))
    .dokument;
  const dokWeg = (await d.dokumente.ladeHoch(mappe.id, { register: 'dokumente', name: 'B.pdf', typ: 'application/pdf' }, pdf, markus.id))
    .dokument;
  await d.dokumente.loescheDokument(dokWeg.id, markus.id, { weg: 'dokument' });
  const mappeWeg = await d.mappen.legeMappeAn({ typId: privat.id, werte: { name: 'Alt' } }, markus.id);
  await d.loeschen.loescheMappe(mappeWeg.id, markus.id);
  const notiz = await d.mappenNotizen.legeNotizAn(mappe.id, 'Notiz', markus.id);
  const aufgabe = await d.vertretung.legeAufgabeAn(mappe.id, { empfaengerId: markus.id, text: 'Prüfen' }, markus.id);
  const ablauf = (await d.ablaeufe.anwenden(mappe.id, 'erinnern', { datum: '2099-01-01', text: 'Später' }, markus.id)).ablauf!;
  const fremd = {
    mappe: mappe.id,
    dok: dok.id,
    dokWeg: dokWeg.id,
    mappeWeg: mappeWeg.id,
    notiz: notiz.id,
    aufgabe: aufgabe.id,
    ablauf: ablauf.id,
    markus: markus.id,
  };
  return { d, konten, app, cLena, cMarkus, cJonas, cKatrin, lesen, schreiben, schluesselKatrin, fremd };
}

type Aufbau = Awaited<ReturnType<typeof aufbau>>;

describe('Rechte-Matrix (#1262)', () => {
  let x: Aufbau;
  let alle: Route[];
  before(async () => {
    x = await aufbau();
    alle = routen(x.d, x.konten, {});
  });
  after(async () => {
    await x.app.close();
  });

  const rufe = (r: Route, kopf: Record<string, string>) =>
    x.app.inject({ method: r.methode as Methode, url: fuelle(r.pfad), ...(r.methode === 'GET' ? {} : { payload: {} }), headers: kopf });

  /** Ruft jede passende Route auf und sammelt alle, deren Status nicht in `erwartet` liegt. */
  async function pruefe(auswahl: (r: Route) => boolean, kopf: Record<string, string>, erwartet: number[], mindestens = 1) {
    const abweichend: string[] = [];
    const auswahlListe = alle.filter((q) => !q.konsole && auswahl(q));
    // Schutz gegen eine leere Auswahl, die immer grün wäre.
    assert.ok(auswahlListe.length >= mindestens, `nur ${auswahlListe.length} Routen geprüft, erwartet mindestens ${mindestens}`);
    for (const r of auswahlListe) {
      const a = await rufe(r, kopf);
      if (!erwartet.includes(a.statusCode)) abweichend.push(`${name(r)} → ${a.statusCode} ${a.body.slice(0, 120)}`);
    }
    return abweichend;
  }

  it('ohne Anmeldung: jede Route außer den offenen → 401', async () => {
    const ab = await pruefe((r) => r.zugang !== 'offen', { 'x-dms': '1' }, [401], 700);
    assert.deepEqual(ab, [], ab.join('\n'));
  });

  it('ohne X-DMS: ändernde Anfragen mit Sitzung → 403', async () => {
    const ab = await pruefe((r) => r.zugang !== 'offen' && r.methode !== 'GET', { cookie: x.cMarkus }, [403], 300);
    assert.deepEqual(ab, [], ab.join('\n'));
  });

  it('Person ohne Verwaltungsrecht: jede Route der Verwaltung → 403', async () => {
    const ab = await pruefe((r) => r.zugang === 'admin', { 'x-dms': '1', cookie: x.cMarkus }, [403], 300);
    assert.deepEqual(ab, [], ab.join('\n'));
  });

  it('Verwaltungsrecht, aber nicht im Verwaltungsmodus: jede Route der Verwaltung → 403', async () => {
    const ab = await pruefe((r) => r.zugang === 'admin', { 'x-dms': '1', cookie: x.cLena }, [403], 300);
    assert.deepEqual(ab, [], ab.join('\n'));
  });

  it('Verwaltung nur „Benutzer“: Routen anderer Bereiche → 403', async () => {
    const fremd = (r: Route) => {
      if (r.zugang !== 'admin') return false;
      const q = r.bereichVon ?? r;
      const b = bereicheDerRoute(q.methode, q.pfad) ?? [];
      return !b.includes('benutzer') && !b.includes(JEDER);
    };
    const ab = await pruefe(fremd, { 'x-dms': '1', cookie: x.cJonas }, [403], 200);
    assert.deepEqual(ab, [], ab.join('\n'));
  });

  it('API-Schlüssel: interne Routen nehmen keinen Schlüssel → 401', async () => {
    const ab = await pruefe((r) => !r.api && r.zugang !== 'offen', { authorization: `Bearer ${x.schreiben}` }, [401, 403]);
    assert.deepEqual(ab, [], ab.join('\n'));
  });

  it('API-Schlüssel nur lesen: ändernde Routen der API → 403', async () => {
    // Übergang #636 (bis 1.0.0): zwei PUT-Routen der Sicherung prüfen selbst, ob ein Paket fragt.
    const uebergang = new Set(['PUT /api/v1/sicherungen/:name/extern', 'PUT /api/v1/sicherungen/:name/holen']);
    const ab = await pruefe(
      (r) => !!r.api && r.methode !== 'GET' && r.zugang !== 'offen' && !uebergang.has(name(r)),
      { authorization: `Bearer ${x.lesen}` },
      [403],
    );
    assert.deepEqual(ab, [], ab.join('\n'));
  });

  it('Gegenprobe: mit dem passenden Recht kommt die Anfrage durch', async () => {
    const r = (methode: Methode, pfad: string) => alle.find((q) => q.methode === methode && q.pfad === pfad)!;
    // Angemeldet: eigene Mappenliste; Verwaltung „Benutzer“ im Modus: Benutzerliste; Schlüssel: API-Route lesend.
    assert.equal((await rufe(r('GET', '/api/konto/status'), { cookie: x.cMarkus })).statusCode, 200);
    assert.equal((await rufe(r('GET', '/api/benutzer'), { 'x-dms': '1', cookie: x.cJonas })).statusCode, 200);
    const api = alle.find((q) => q.api && q.methode === 'GET' && q.zugang === 'angemeldet' && !q.pfad.includes(':'))!;
    const a = await rufe(api, { authorization: `Bearer ${x.lesen}` });
    assert.ok(![401, 403].includes(a.statusCode), `${name(api)} → ${a.statusCode}`);
  });

  it('API-Schlüssel schreiben: Routen der Verwaltung → 403', async () => {
    const ab = await pruefe((r) => !!r.api && r.zugang === 'admin', { authorization: `Bearer ${x.schreiben}` }, [403]);
    assert.deepEqual(ab, [], ab.join('\n'));
  });

  /**
   * Objektebene: Routen mit Kennungen von Mappen, Dokumenten, Notizen, Aufgaben, Abläufen und Papierkorb-Einträgen,
   * gefüllt mit Markus' Kennungen, aufgerufen von Katrin (Sitzung bzw. eigener Schlüssel). Erwartet: 403 oder 404.
   */
  const ziel = (pfad: string, f: Aufbau['fremd']): string | null => {
    const rest = pfad.replace(/^\/api(\/v1)?/, '');
    const art: Array<[RegExp, string]> = [
      [/^\/papierkorb\/dokumente\/:id/, f.dokWeg],
      [/^\/papierkorb\/(vorgang\/)?:id/, f.mappeWeg],
      [/^\/mappen\/:id/, f.mappe],
      [/^\/dokumente\/:id/, f.dok],
      [/^\/notizen\/:id/, f.notiz],
      [/^\/aufgaben\/:id/, f.aufgabe],
      [/^\/(erinnerungen|ablaeufe)\/:id/, f.ablauf],
    ];
    const id = art.find(([m]) => m.test(rest))?.[1];
    if (!id) return null;
    return pfad
      .replace(':id', id)
      .replace(':dokument', f.dok)
      .replace(':anlage', f.dok)
      .replace(':benutzer', f.markus)
      .replace(':nummer', '1')
      .replace(':nr', '1')
      .replace(':feld', 'name')
      .replace(/:[A-Za-z]+/g, 'x');
  };

  it('Gegenprobe Objektebene: der Besitzer liest dieselben Kennungen', async () => {
    // Sonst wäre die Objektebene schon grün, weil es die Kennungen gar nicht gibt (404 für alle).
    const lesend = alle.filter(
      (q) => q.zugang === 'angemeldet' && !q.api && q.methode === 'GET' && ziel(q.pfad, x.fremd) && !/:(?!id\b)[A-Za-z]+/.test(q.pfad),
    );
    const ok: string[] = [];
    for (const r of lesend) {
      const a = await x.app.inject({ method: 'GET', url: ziel(r.pfad, x.fremd)!, headers: { cookie: x.cMarkus } });
      if (a.statusCode === 200) ok.push(r.pfad);
    }
    for (const p of [
      '/api/mappen/:id',
      '/api/dokumente/:id/inhalt',
      '/api/dokumente/:id/versionen',
      '/api/mappen/:id/notizen',
      '/api/mappen/:id/aufgaben',
      '/api/papierkorb/:id',
    ]) {
      assert.ok(ok.includes(p), `Markus bekommt ${p} nicht – Aufbau der Objektebene prüfen`);
    }
    assert.ok(ok.length >= 15, `nur ${ok.length} Lese-Routen mit 200`);
  });

  it('Objektebene: fremde Mappen, Dokumente, Notizen, Aufgaben, Abläufe und Papierkorb → 403/404', async () => {
    const abweichend: string[] = [];
    let geprueft = 0;
    const ausnahmenGesehen = new Set<string>();
    for (const r of alle.filter((q) => q.zugang === 'angemeldet' && !q.konsole)) {
      const url = ziel(r.pfad, x.fremd);
      if (!url) continue;
      geprueft++;
      const kopf: Record<string, string> = r.api ? { authorization: `Bearer ${x.schluesselKatrin}` } : { 'x-dms': '1', cookie: x.cKatrin };
      const payload = (KOERPER[name(r)] ?? {}) as object;
      const a = await x.app.inject({ method: r.methode as Methode, url, ...(r.methode === 'GET' ? {} : { payload }), headers: kopf });
      if (name(r) in OBJEKT_AUSNAHMEN) {
        ausnahmenGesehen.add(name(r));
        continue;
      }
      if (![403, 404].includes(a.statusCode)) abweichend.push(`${name(r)} → ${a.statusCode} ${a.body.slice(0, 160)}`);
    }
    assert.ok(geprueft >= 150, `nur ${geprueft} Routen geprüft`);
    assert.deepEqual(
      abweichend,
      [],
      `Fremde Kennung ohne 403/404 – Recht prüfen oder bewusst in OBJEKT_AUSNAHMEN:\n${abweichend.join('\n')}`,
    );
    assert.deepEqual(
      Object.keys(OBJEKT_AUSNAHMEN).filter((k) => !ausnahmenGesehen.has(k)),
      [],
      'Ausnahme ohne passende Route: aus OBJEKT_AUSNAHMEN streichen',
    );
    for (const [k, grund] of Object.entries(OBJEKT_AUSNAHMEN)) assert.ok(grund.trim().length >= 10, `${k}: Grund fehlt`);
  });
});
