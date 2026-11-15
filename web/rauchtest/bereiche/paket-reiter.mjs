/**
 * Rauchtests: Reiter der Paketseite (#996 Übersicht liest, Einstellungen ändern) mit einem KI-Paket als Attrappe –
 * ohne Paket-Läufer und ohne Internet.
 * Allein starten (frisch gestartetes Ablago, siehe rauchtest.mjs): node web/rauchtest/bereiche/paket-reiter.mjs [fehlerordner] [musterordner]
 */
import assert from 'node:assert/strict';
import '../einrichtung.mjs';
import { BASIS, LENA, rauchtest, verwalten, WERKBANK_BEREICHE } from '../hilfen.mjs';
import { axePruefen, tippflaechenPruefen } from '../muster.mjs';

const ID = 'ki_probe';
const LAEUFER = { sprache: 'c', ereignisse: ['post.angelegt'], rechte: { lesen: [], schreiben: [], dokumente: 'lesen' }, netz: ['https://ki.example.org'],
  reiter: { anzeigen: [{ schluessel: 'stand', name: 'Dokumente mit Vektor', art: 'anteil' }] } };
const EIGENE = { art: 'abschnitt', titel: 'Dienst', felder: [{ schluessel: 'modell', name: 'Modell', typ: 'text', laengeMax: 20, muster: '[a-z-]+', meldung: 'Nur Kleinbuchstaben und Bindestrich.' }] };
const PAKET = {
  id: ID, name: 'KI-Probe', version: '1.0.0', beschreibung: 'KI-Dienst für die Rauchtests.', lizenz: 'Apache-2.0', autor: { name: 'Ablago-Projekt', github: '' }, herausgeber: 'app.ablago', herausgeberGeprueft: true,
  herkunft: { art: 'hochgeladen', von: null, am: '2026-11-01T08:00:00Z' }, installiert: '2026-11-01T08:00:00Z', installiertVon: null, aktualisiert: null, aktualisiertVon: null,
  typen: {}, sichten: {}, abhaengigkeiten: {}, code: true, laeufer: LAEUFER, einstellungen: { bloecke: [EIGENE], aktionen: [] },
};

/**
 * Attrappe: das KI-Paket in der Liste, seine Einstellungen (wie der Server sie mit der Feldart des Kerns liefert),
 * Anzeigen und die KI-Zulassung. Liefert, was gespeichert wurde.
 */
async function attrappe(s) {
  const z = { ki: [], werte: { modell: 'klein' }, typen: [{ id: 't1', name: 'Rechnung', zugelassen: true }, { id: 't2', name: 'Gesundheit', zugelassen: false }] };
  await s.route('**/api/werkbank/pakete', async (r) => {
    if (r.request().method() !== 'GET') return r.fallback();
    const echt = await (await r.fetch()).json();
    await r.fulfill({ json: { ...echt, installiert: [...echt.installiert, PAKET] } });
  });
  const kern = { art: 'abschnitt', titel: 'Was die KI lesen darf', felder: [{ schluessel: 'ki_mappentypen', name: 'Was die KI lesen darf', typ: 'ki_mappentypen' }] };
  const stand = () => ({ beschreibung: { bloecke: [EIGENE, kern], aktionen: [] }, werte: z.werte, fehlend: [], status: null, laeufer: true, auswahl: { typen: [], benutzer: [], rollen: [], sichten: [] } });
  await s.route(`**/api/werkbank/pakete/${ID}/einstellungen`, (r) => {
    if (r.request().method() === 'PUT') z.werte = { modell: r.request().postDataJSON().werte.modell };
    return r.fulfill({ json: stand() });
  });
  await s.route(`**/api/werkbank/pakete/${ID}/anzeigen`, (r) => r.fulfill({ json: { anzeigen: [{ ...LAEUFER.reiter.anzeigen[0], wert: { art: 'anteil', zahl: 12, von: 30 } }], status: { letzterLauf: '2026-11-14T09:00:00Z', meldungen: ['12 Dokumente neu berechnet.'] } } }));
  await s.route(`**/api/werkbank/pakete/${ID}/umwandlungen`, (r) => r.fulfill({ json: { felder: [], vorgaenge: [] } }));
  const ki = () => ({ typen: z.typen, pakete: [{ id: ID, name: 'KI-Probe', bekommt: z.typen.filter((x) => x.zugelassen).map((x) => x.id) }], hinweis: false });
  await s.route('**/api/werkbank/ki-typen', (r) => r.fulfill({ json: ki() }));
  await s.route('**/api/werkbank/ki-typen/*', (r) => {
    const id = new URL(r.request().url()).pathname.split('/').at(-1);
    const { zugelassen } = r.request().postDataJSON();
    z.ki.push(`${id}:${zugelassen}`);
    z.typen = z.typen.map((x) => (x.id === id ? { ...x, zugelassen } : x));
    return r.fulfill({ json: ki() });
  });
  return z;
}

/** Zur Paketseite im Verwaltungsmodus (er gilt für die Sitzung – nur einschalten, wenn er noch aus ist). */
async function zumPaket(s) {
  await s.goto(BASIS + '/ablage/start');
  await s.waitForLoadState('networkidle');
  if (!(await s.getByRole('region', { name: 'Du verwaltest gerade Ablago.' }).isVisible())) await verwalten(s);
  await s.goto(BASIS + `/werkbank/pakete/${ID}`);
  await s.getByRole('tab', { name: 'Übersicht' }).waitFor();
}

rauchtest('Paketseite: Übersicht liest, Einstellungen ändern – KI-Zulassung mit einem Speichern (#996)', { als: LENA, timeout: 90_000 }, async (s) => {
  const z = await attrappe(s);
  await zumPaket(s);
  // Übersicht: nur lesen – eine Zeile zur KI, was das Paket meldet; keine Haken der KI-Zulassung.
  await s.getByText('Bekommt Inhalte aus 1 Mappentyp.').waitFor();
  await s.getByText('12 von 30').waitFor();
  await s.getByText('12 Dokumente neu berechnet.').waitFor();
  assert.equal(await s.getByRole('checkbox', { name: 'Gesundheit' }).count(), 0, 'Zulassen steht nicht in der Übersicht');
  // „Ändern“ führt in die Einstellungen; Feld des Pakets mit Prüfregel und die Feldart des Kerns.
  await s.getByRole('button', { name: 'Ändern' }).click();
  await s.getByRole('tab', { name: 'Einstellungen', selected: true }).waitFor();
  await s.getByRole('heading', { name: 'Was die KI lesen darf' }).waitFor();
  await s.getByLabel('Modell').fill('Groß');
  await s.getByText('Nur Kleinbuchstaben und Bindestrich.').waitFor();
  await s.getByLabel('Modell').fill('mittel');
  await s.getByRole('checkbox', { name: 'Gesundheit' }).check();
  await s.getByRole('button', { name: 'Einstellungen speichern' }).click();
  await s.getByText('Gespeichert.').waitFor();
  assert.deepEqual(z.ki, ['t2:true']);
  assert.equal(z.werte.modell, 'mittel');
});

/** Übersicht und Einstellungen für axe und Tippflächen. */
const SEITEN = [
  { name: 'Übersicht', weg: async (s) => { await zumPaket(s); await s.getByText('12 von 30').waitFor(); } },
  { name: 'Einstellungen', weg: async (s) => { await s.getByRole('tab', { name: 'Einstellungen' }).click(); await s.getByRole('heading', { name: 'Was die KI lesen darf' }).waitFor(); } },
];

rauchtest('Paketseite: Reiter ohne axe-Verstoß, hell und dunkel (#996)', { als: LENA, timeout: 100_000 }, async (s) => {
  await attrappe(s);
  const funde = [];
  for (const schema of ['light', 'dark']) {
    await s.emulateMedia({ colorScheme: schema });
    for (const seite of SEITEN) {
      await seite.weg(s);
      await s.waitForLoadState('networkidle');
      for (const v of await axePruefen(s, WERKBANK_BEREICHE)) funde.push(`${seite.name} (${schema}): ${v}`);
    }
  }
  assert.deepEqual(funde, [], `axe meldet Verstöße:\n${funde.join('\n')}`);
});

rauchtest('Handy: Reiter der Paketseite mit 44-px-Tippflächen (#996)', { handy: true, als: LENA, timeout: 90_000 }, async (s) => {
  await attrappe(s);
  const funde = [];
  for (const seite of SEITEN) {
    await seite.weg(s);
    await s.waitForLoadState('networkidle');
    for (const v of await tippflaechenPruefen(s, WERKBANK_BEREICHE)) funde.push(`${seite.name}: ${v}`);
  }
  assert.deepEqual(funde, [], `Zu kleine Tippflächen am Handy:\n${funde.join('\n')}`);
});
