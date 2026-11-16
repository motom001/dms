/**
 * Charakterisierung von `fuehreAus` (#1278, Schritt 6b-1): Vor dem Zerlegen der langen Funktion hält dieser Test fest,
 * was jeder Befehl von `dms` an den Server schickt, was er ausgibt (Text und JSON) und mit welchem Fehler er abbricht.
 * Der Server ist eine Attrappe, die jede Anfrage mitschreibt und feste Antworten gibt.
 *
 * Erwartung: `test/charakter/dms-befehle.json`. Neu schreiben nur, wenn sich das Verhalten bewusst ändert:
 * `CHARAKTER_SCHREIBEN=1 npm run test:datei -w server -- test/dms-befehle-charakter.test.ts` – dann den Unterschied prüfen.
 */
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { fuehreAus, KonsolenFehler, zerlege, type Ein, type Verbindung } from '../src/dms';

// Zeitpunkte erscheinen in der Ausgabe: feste Zeitzone, damit die Erwartung überall gilt.
process.env.TZ = 'UTC';

const DATEI = fileURLToPath(new URL('./charakter/dms-befehle.json', import.meta.url));

const BENUTZER = [
  {
    id: 'u1',
    email: 'anna@example.org',
    name: 'Anna',
    verwaltung: ['*'],
    aktiv: true,
    hatPasswort: true,
    letzteAnmeldung: '2026-01-02T03:04:00.000Z',
  },
  { id: 'u2', email: 'ben@example.org', name: 'Ben', verwaltung: ['sicherung'], aktiv: true, hatPasswort: false, letzteAnmeldung: null },
  { id: 'u3', email: 'carl@example.org', name: 'Carl', aktiv: false, hatPasswort: true, letzteAnmeldung: null },
];

type Stand = Record<string, unknown>;
/** Antworten der Attrappe je „METHODE /pfad“; Varianten über `stand`. */
const ANTWORTEN: Record<string, (stand: Stand) => unknown> = {
  'GET /api/benutzer': () => BENUTZER,
  'POST /api/konsole/passwort': (stand) => ({ email: 'anna@example.org', aktiv: !stand.inaktiv, zweifaktor: !!stand.zweifaktor }),
  'GET /api/werkbank/anmeldeschutz': (stand) => ({
    gesperrt: stand.leer
      ? []
      : [
          { ip: '203.0.113.7', grund: 'zu viele Versuche', seit: '2026-01-02T03:04:00.000Z', bis: null },
          { ip: '198.51.100.1', grund: 'Liste', seit: '2026-01-02T03:04:00.000Z', bis: '2026-01-03T03:04:00.000Z' },
        ],
  }),
  'GET /api/werkbank/wartung': (stand) =>
    stand.leer
      ? { stufe: 'aus' }
      : { stufe: 'aktiv', text: stand.ohneText ? undefined : 'Umzug', ende: stand.ohneText ? null : '2026-01-02T05:00:00.000Z' },
  'GET /api/werkbank/system': (stand) => ({
    dms: { version: '1.2.3', variante: 'voll', commit: stand.leer ? null : 'abcdef1234567' },
    laufzeit: { node: 'v22', laeuftSeit: '2026-01-02T03:04:00.000Z', zeitzone: 'Europe/Berlin' },
    datenbank: stand.leer ? { fehler: 'weg' } : { version: '16', groesse: 12, tabellen: { a: 1 } },
  }),
  'POST /api/werkbank/sicherung/jetzt': (stand) => (stand.leer ? {} : { name: 'sicherung-1', zustand: 'laeuft' }),
  'GET /api/werkbank/sicherung': (stand) =>
    stand.leer
      ? { lauf: null, liste: [] }
      : {
          lauf: { name: 'sicherung-2', zustand: 'packt' },
          liste: [{ name: 'sicherung-1', bytes: 3 * 1024 * 1024 }, { name: 'ohne-groesse' }],
        },
  'POST /api/benutzer': (stand) => ({
    benutzer: { ...BENUTZER[1], verwaltung: stand.admin ? ['*'] : [] },
    mailVerschickt: !!stand.mail,
    ...(stand.link ? { link: 'https://dms.example.org/einladung/x' } : {}),
  }),
};
function antwort(methode: string, pfad: string, stand: Stand): unknown {
  const k = `${methode} ${pfad}`;
  if (ANTWORTEN[k]) return ANTWORTEN[k](stand);
  if (k.startsWith('DELETE /api/benutzer/')) return { beendet: 2 };
  return { ok: true, echo: k };
}

/** Ein Befehl gegen die Attrappe: Anfragen, Ausgabe, Rückfragen und Fehler. */
async function lauf(args: string[], o: { stand?: Record<string, unknown>; eingaben?: string[]; interaktiv?: boolean } = {}) {
  const anfragen: unknown[] = [];
  const ausgabe: unknown[] = [];
  const fragen: unknown[] = [];
  const v: Verbindung = {
    anfrage: async <T>(methode: string, pfad: string, body?: unknown) => {
      anfragen.push(body === undefined ? [methode, pfad] : [methode, pfad, body]);
      return antwort(methode, pfad, o.stand ?? {}) as T;
    },
  };
  const eingaben = [...(o.eingaben ?? [])];
  const ein: Ein = {
    interaktiv: o.interaktiv ?? true,
    frage: async (text, verdeckt) => {
      fragen.push([text, !!verdeckt]);
      return eingaben.shift() ?? '';
    },
  };
  let fehler: unknown = null;
  try {
    await fuehreAus(zerlege(args), v, ein, { zeile: (t) => ausgabe.push(t), json: (d) => ausgabe.push({ json: d }) });
  } catch (e) {
    fehler = e instanceof KonsolenFehler ? { meldung: e.message, code: e.code } : { anderer: String(e) };
  }
  return { anfragen, ausgabe, fragen, fehler };
}

const SZENARIEN: Record<string, () => ReturnType<typeof lauf>> = {
  'passwort ohne E-Mail': () => lauf(['passwort']),
  'passwort mit --passwort': () => lauf(['passwort', 'anna@example.org', '--passwort', 'neu-und-lang']),
  'passwort als JSON': () =>
    lauf(['passwort', 'anna@example.org', '--passwort', 'x', '--json'], { stand: { inaktiv: true, zweifaktor: true } }),
  'passwort inaktiv mit Zwei-Faktor': () =>
    lauf(['passwort', 'anna@example.org', '--passwort', 'x'], { stand: { inaktiv: true, zweifaktor: true } }),
  'passwort ohne Terminal': () => lauf(['passwort', 'anna@example.org'], { interaktiv: false }),
  'passwort im Terminal': () => lauf(['passwort', 'anna@example.org'], { eingaben: ['geheim-lang', 'geheim-lang'] }),
  'passwort im Terminal verschieden': () => lauf(['passwort', 'anna@example.org'], { eingaben: ['geheim-lang', 'anders'] }),
  'zweifaktor mit --ja': () => lauf(['zweifaktor-zuruecksetzen', 'ANNA@example.org', '--ja']),
  'zweifaktor bestätigt': () => lauf(['zweifaktor-zuruecksetzen', 'anna@example.org'], { eingaben: ['j'] }),
  'zweifaktor abgelehnt': () => lauf(['zweifaktor-zuruecksetzen', 'anna@example.org'], { eingaben: ['n'] }),
  'zweifaktor ohne Terminal': () => lauf(['zweifaktor-zuruecksetzen', 'anna@example.org'], { interaktiv: false }),
  'zweifaktor unbekannt': () => lauf(['zweifaktor-zuruecksetzen', 'niemand@example.org', '--ja']),
  'zweifaktor ohne E-Mail': () => lauf(['zweifaktor-zuruecksetzen']),
  'passkeys mit --ja als JSON': () => lauf(['passkeys-zuruecksetzen', 'ben@example.org', '--ja', '--json']),
  'passkeys mit yes': () => lauf(['passkeys-zuruecksetzen', 'ben@example.org'], { eingaben: [' YES '] }),
  gesperrt: () => lauf(['gesperrt']),
  'gesperrt leer': () => lauf(['gesperrt'], { stand: { leer: true } }),
  'gesperrt als JSON': () => lauf(['gesperrt', '--json']),
  entsperren: () => lauf(['entsperren', '203.0.113.7']),
  'entsperren ohne IP': () => lauf(['entsperren']),
  wartung: () => lauf(['wartung']),
  'wartung ohne Text': () => lauf(['wartung'], { stand: { ohneText: true } }),
  'wartung aus Stand': () => lauf(['wartung'], { stand: { leer: true } }),
  'wartung aus': () => lauf(['wartung', 'aus']),
  'wartung falsch': () => lauf(['wartung', 'an']),
  'abmelden einer': () => lauf(['abmelden', 'ben@example.org']),
  'abmelden alle': () => lauf(['abmelden', '--alle', '--ja']),
  'abmelden alle als JSON': () => lauf(['abmelden', '--alle', '--json'], { eingaben: ['ja'] }),
  status: () => lauf(['status']),
  'status ohne Commit, Datenbank-Fehler': () => lauf(['status'], { stand: { leer: true } }),
  'sicherung jetzt': () => lauf(['sicherung', 'jetzt']),
  'sicherung jetzt ohne Name': () => lauf(['sicherung', 'jetzt'], { stand: { leer: true } }),
  'sicherung pruefen': () => lauf(['sicherung', 'pruefen', 'sicherung 1/2']),
  'sicherung pruefen ohne Name': () => lauf(['sicherung', 'pruefen']),
  'sicherung falsch': () => lauf(['sicherung', 'weg']),
  'sicherung Liste': () => lauf(['sicherung']),
  'sicherung Liste leer': () => lauf(['sicherung'], { stand: { leer: true } }),
  benutzer: () => lauf(['benutzer']),
  'benutzer als JSON': () => lauf(['benutzer', '--json']),
  'benutzer anlegen': () => lauf(['benutzer', 'anlegen', 'ben@example.org', 'Ben', 'B.']),
  'benutzer anlegen Admin mit Mail': () =>
    lauf(['benutzer', 'anlegen', 'ben@example.org', 'Ben', '--admin'], { stand: { admin: true, mail: true } }),
  'benutzer anlegen mit Link': () => lauf(['benutzer', 'anlegen', 'ben@example.org'], { stand: { link: true } }),
  'benutzer anlegen ohne E-Mail': () => lauf(['benutzer', 'anlegen']),
  'benutzer deaktivieren': () => lauf(['benutzer', 'deaktivieren', 'ben@example.org', '--ja']),
  'benutzer deaktivieren abgelehnt': () => lauf(['benutzer', 'deaktivieren', 'ben@example.org']),
  'benutzer aktivieren': () => lauf(['benutzer', 'aktivieren', 'carl@example.org']),
  'benutzer aktivieren als JSON': () => lauf(['benutzer', 'aktivieren', 'carl@example.org', '--json']),
  'benutzer falsch': () => lauf(['benutzer', 'loeschen', 'x@example.org']),
  'api GET': () => lauf(['api', 'get', '/api/werkbank/anmeldeschutz']),
  'api POST mit JSON': () => lauf(['api', 'POST', '/api/werkbank/x', '{"a":1}']),
  'api JSON kaputt': () => lauf(['api', 'PUT', '/api/werkbank/x', '{kaputt']),
  'api falsche Methode': () => lauf(['api', 'PATCH', '/api/x']),
  'api falscher Pfad': () => lauf(['api', 'GET', '/werkbank']),
  'api ohne Pfad': () => lauf(['api', 'GET']),
  'ohne Befehl': () => lauf([]),
  hilfe: () => lauf(['hilfe']),
  help: () => lauf(['help']),
  '-h': () => lauf(['-h']),
  unbekannt: () => lauf(['zaubern']),
  'unbekannt wie Objekt-Eigenschaft': () => lauf(['toString']),
};

describe('dms: jeder Befehl (#1278, Schritt 6b-1)', async () => {
  const ist: Record<string, unknown> = {};
  for (const [name, f] of Object.entries(SZENARIEN)) ist[name] = await f();
  if (process.env.CHARAKTER_SCHREIBEN) {
    mkdirSync(dirname(DATEI), { recursive: true });
    writeFileSync(DATEI, `${JSON.stringify(ist, null, 2)}\n`);
  }
  const soll = existsSync(DATEI) ? (JSON.parse(readFileSync(DATEI, 'utf8')) as Record<string, unknown>) : {};
  it('alle Szenarien sind festgehalten', () => assert.deepEqual(Object.keys(soll).sort(), Object.keys(SZENARIEN).sort()));
  for (const name of Object.keys(SZENARIEN)) it(name, () => assert.deepEqual(ist[name], soll[name]));
});
