/**
 * Rauchtests: Reiter der Paketseite (#996 Übersicht liest, Einstellungen ändern; #1003 Verlauf; #1004 Ausprobieren) mit einem KI-Paket als Attrappe –
 * ohne Paket-Läufer und ohne Internet.
 * Allein starten (frisch gestartetes Ablago, siehe rauchtest.mjs): node web/rauchtest/bereiche/paket-reiter.mjs [fehlerordner] [musterordner]
 */
import assert from 'node:assert/strict';
import '../einrichtung.mjs';
import { BASIS, LENA, rauchtest, schemaWechseln, verwalten, WERKBANK_BEREICHE } from '../hilfen.mjs';
import { axePruefen, tippflaechenPruefen } from '../muster.mjs';

const ID = 'ki_probe';
const LAEUFER = { sprache: 'c', ereignisse: ['post.angelegt'], rechte: { lesen: [], schreiben: [], dokumente: 'lesen' }, netz: ['https://ki.example.org'],
  reiter: { anzeigen: [{ schluessel: 'stand', name: 'Dokumente mit Vektor', art: 'anteil' }], ausprobieren: { ereignis: 'post.angelegt', dateiarten: ['application/pdf'] } } };
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
export async function attrappe(s) {
  const z = { ki: [], verlauf: [], probe: [], werte: { modell: 'klein' }, typen: [{ id: 't1', name: 'Rechnung', zugelassen: true }, { id: 't2', name: 'Gesundheit', zugelassen: false }] };
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
  // Ausprobieren (#1004): merkt sich, womit ausprobiert wurde; Seitenhinweise und eine erzeugte Datei.
  await s.route(`**/api/werkbank/pakete/${ID}/ausprobieren`, (r) => {
    z.probe.push(r.request().postDataJSON());
    return r.fulfill({ json: { ok: true, fehler: null, ms: 1400, speicherMB: 22, zeilen: ['2 leere Seiten'], seiten: [{ seite: 1, text: 'Barcode ABLAGO-TRENNEN' }], dateien: [{ name: 'archiv.pdf', typ: 'application/pdf', daten: Buffer.from('%PDF-1.7').toString('base64') }] } });
  });
  // Läufer: läuft, das Paket ist geladen (Grenzen für die Ampel).
  await s.route('**/api/werkbank/pakete/laeufer', (r) => r.fulfill({ json: { laeuft: true, pausiert: false, grenzen: { speicherMB: 256, sekunden: 120, parallel: 2 }, zustand: 'bereit', absturz: null,
    pakete: [{ id: ID, name: 'KI-Probe', version: '1.0.0', dienstkonto: 'Paket KI-Probe', geladen: true, fehler: null, aufrufe: 3, fehlgeschlagen: 1, letzterAufruf: null, dauerMs: null, speicherMB: null,
      ereignisse: { offen: 0, aufgegeben: 0, zugestellt: 3 }, letzte: [], protokoll: [] }] } }));
  // Verlauf (#1003): heute drei Aufrufe, einer an der Zeitgrenze; die Liste mit und ohne „Nur Fehler zeigen“.
  const heute = new Date().toISOString().slice(0, 10);
  await s.route(`**/api/werkbank/pakete/${ID}/auslastung`, (r) => r.fulfill({ json: { zuletzt: new Date(Date.now() - 300_000).toISOString(),
    tage: [{ tag: heute, aufrufe: 3, fehler: 1, zeit: 1, speicher: 0, msSumme: 140_000, msMax: 120_000, speicherMax: 40 }] } }));
  const eintraege = [
    { nr: 3, zeit: new Date(Date.now() - 300_000).toISOString(), art: 'ereignis', was: 'post.angelegt', ergebnis: 'zeit', ms: 120_000, speicherMB: 40, text: 'Zeitgrenze erreicht (120 s) – abgebrochen.', wer: null, bezug: null, netz: ['Netz: 2 × POST ki.example.org – 200, 3 KB hin, 1 KB zurück'] },
    { nr: 2, zeit: new Date(Date.now() - 600_000).toISOString(), art: 'ereignis', was: 'post.angelegt', ergebnis: 'ok', ms: 9_000, speicherMB: 31, text: '', wer: null, bezug: null, netz: [] },
    { nr: 1, zeit: new Date(Date.now() - 900_000).toISOString(), art: 'einstellungen', was: 'Modell', ergebnis: null, ms: null, speicherMB: null, text: '', wer: 'lena@example.org', bezug: null, netz: [] },
  ];
  await s.route(`**/api/werkbank/pakete/${ID}/verlauf*`, (r) => {
    const nurFehler = new URL(r.request().url()).searchParams.get('nurFehler') === '1';
    z.verlauf.push(nurFehler);
    return r.fulfill({ json: { eintraege: eintraege.filter((e) => !nurFehler || (e.ergebnis && e.ergebnis !== 'ok')), mehr: false } });
  });
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
export async function zumPaket(s) {
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

rauchtest('Paketseite: Verlauf mit Auslastung, Ampel und „Nur Fehler zeigen“ (#1003)', { als: LENA, timeout: 90_000 }, async (s) => {
  const z = await attrappe(s);
  await zumPaket(s);
  // Übersicht: nur eine Zeile zum Läufer, mit Link in den Verlauf.
  await s.getByText('1 Fehler in 7 Tagen').waitFor();
  await s.getByRole('button', { name: 'Verlauf', exact: true }).click();
  await s.getByRole('tab', { name: 'Verlauf', selected: true }).waitFor();
  await s.getByText('stößt oft an seine Grenzen').waitFor();
  const liste = s.getByRole('list', { name: 'Verlauf' });
  await liste.getByText('Einstellungen geändert: Modell').waitFor();
  assert.equal(await liste.locator('li').count(), 3);
  await s.getByLabel('Nur Fehler zeigen').check();
  await liste.getByText('Einstellungen geändert: Modell').waitFor({ state: 'detached' });
  await liste.getByText('Zeitgrenze erreicht (120 s) – abgebrochen.').waitFor();
  assert.equal(await liste.locator('li').count(), 1);
  assert.deepEqual(z.verlauf, [false, true]);
});

rauchtest('Paketseite: Ausprobieren mit noch nicht gespeicherten Einstellungen, ohne „Verlassen?“ (#1004)', { als: LENA, timeout: 90_000 }, async (s) => {
  const z = await attrappe(s);
  await zumPaket(s);
  await s.getByRole('tab', { name: 'Einstellungen' }).click();
  await s.getByLabel('Modell').fill('gross-x');
  // Zwischen Einstellungen und Ausprobieren bleibt der Entwurf – keine Rückfrage.
  await s.getByRole('tab', { name: 'Ausprobieren' }).click();
  await s.getByText('Ausprobiert wird mit deinen noch nicht gespeicherten Einstellungen.').waitFor();
  await s.getByLabel('Datei zum Ausprobieren').setInputFiles({ name: 'scan.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.7 Probe') });
  await s.getByRole('button', { name: 'Ausprobieren', exact: true }).click();
  await s.getByText('Barcode ABLAGO-TRENNEN').waitFor();
  await s.getByRole('link', { name: 'Herunterladen' }).waitFor();
  assert.equal(z.probe[0].werte.modell, 'gross-x');
  assert.equal(z.probe[0].typ, 'application/pdf');
  assert.equal(Buffer.from(z.probe[0].daten, 'base64').toString(), '%PDF-1.7 Probe');
  await s.getByRole('tab', { name: 'Einstellungen' }).click();
  assert.equal(await s.getByLabel('Modell').inputValue(), 'gross-x', 'der Entwurf ist noch da');
  assert.equal(z.werte.modell, 'klein', 'nichts gespeichert');
});

/** Übersicht, Einstellungen, Ausprobieren und Verlauf für axe und Tippflächen. */
const SEITEN = [
  { name: 'Übersicht', weg: async (s) => { await zumPaket(s); await s.getByText('12 von 30').waitFor(); } },
  { name: 'Einstellungen', weg: async (s) => { await s.getByRole('tab', { name: 'Einstellungen' }).click(); await s.getByRole('heading', { name: 'Was die KI lesen darf' }).waitFor(); } },
  { name: 'Ausprobieren', weg: async (s) => {
    await s.getByRole('tab', { name: 'Ausprobieren' }).click();
    await s.getByLabel('Datei zum Ausprobieren').setInputFiles({ name: 'scan.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.7') });
    await s.getByRole('button', { name: 'Ausprobieren', exact: true }).click();
    await s.getByText('Barcode ABLAGO-TRENNEN').waitFor();
  } },
  { name: 'Verlauf', weg: async (s) => { await s.getByRole('tab', { name: 'Verlauf' }).click(); await s.getByRole('list', { name: 'Verlauf' }).locator('li').first().waitFor(); } },
];

rauchtest('Paketseite: Reiter ohne axe-Verstoß, hell und dunkel (#996, #1003, #1004)', { als: LENA, timeout: 115_000 }, async (s) => {
  await attrappe(s);
  const funde = [];
  for (const schema of ['light', 'dark']) {
    await schemaWechseln(s, schema);
    for (const seite of SEITEN) {
      await seite.weg(s);
      await s.waitForLoadState('networkidle');
      for (const v of await axePruefen(s, WERKBANK_BEREICHE)) funde.push(`${seite.name} (${schema}): ${v}`);
    }
  }
  assert.deepEqual(funde, [], `axe meldet Verstöße:\n${funde.join('\n')}`);
});

rauchtest('Handy: Reiter der Paketseite mit 44-px-Tippflächen (#996, #1003, #1004)', { handy: true, als: LENA, timeout: 100_000 }, async (s) => {
  await attrappe(s);
  const funde = [];
  for (const seite of SEITEN) {
    await seite.weg(s);
    await s.waitForLoadState('networkidle');
    for (const v of await tippflaechenPruefen(s, WERKBANK_BEREICHE)) funde.push(`${seite.name}: ${v}`);
  }
  assert.deepEqual(funde, [], `Zu kleine Tippflächen am Handy:\n${funde.join('\n')}`);
});
