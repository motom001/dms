/**
 * Rauchtests: Einrichtung und Nachweise für Pakete (#1054) auf der Paketseite – Haken je Bereich, Vorgabe nichts,
 * gesperrt mit Grund, „wirkt nicht“ am Haken, Speichern; axe hell/dunkel und Tippflächen am Handy. Katalog und Paket
 * kommen als Attrappe (ohne Internet, ohne Paket-Läufer); die Regeln selbst prüfen die Server-Tests.
 * Allein starten (frisch gestartetes Ablago, siehe rauchtest.mjs): node web/rauchtest/bereiche/paket-daten.mjs [fehlerordner] [musterordner]
 */
import assert from 'node:assert/strict';
import '../einrichtung.mjs';
import { BASIS, LENA, rauchtest, verwalten, WERKBANK_BEREICHE } from '../hilfen.mjs';
import { axePruefen, tippflaechenPruefen } from '../muster.mjs';

const LAEUFER = { sprache: 'c', ereignisse: [], netz: [], modul: { sha256: '0'.repeat(64), groesse: 1 },
  rechte: { lesen: [], schreiben: [], dokumente: 'keine', einrichtung: ['zugang', 'betrieb', 'sicherung'], nachweise: ['sicherung'] } };
const COMPLIANCE = { id: 'compliance', name: 'Compliance', version: '1.0.0', beschreibung: 'Verfahrensdokumentation aktuell halten.', lizenz: 'Apache-2.0', autor: { name: 'Ablago-Projekt', github: '' },
  herausgeber: 'app.ablago', herausgeberGeprueft: true, herkunft: { art: 'hochgeladen', von: null, am: '2026-11-01T08:00:00Z' }, installiert: '2026-11-01T08:00:00Z', installiertVon: null,
  aktualisiert: null, aktualisiertVon: null, typen: {}, sichten: {}, abhaengigkeiten: {}, code: true, laeufer: LAEUFER };
const NAMEN = { zugang: 'Zugang und Berechtigungen', betrieb: 'Betrieb', sicherung: 'Sicherung' };

/** Attrappe: installiertes Paket und die Freigabe; „Betrieb“ darf Lena hier nicht, „Zugang“ wirkt nicht mehr. */
async function attrappe(s) {
  const z = { angehakt: new Set(['einrichtung:zugang']), benutzer: 'Jonas Beispiel', am: '2026-11-10T09:00:00Z', verlauf: [{ am: '2026-11-10T09:00:00Z', von: 'jonas@example.org', einrichtung: ['zugang'], nachweise: [] }], gespeichert: [] };
  const ansicht = () => ({
    bereiche: [...LAEUFER.rechte.einrichtung.map((b) => ['einrichtung', b]), ...LAEUFER.rechte.nachweise.map((b) => ['nachweise', b])].map(([art, b]) => {
      const angehakt = z.angehakt.has(`${art}:${b}`);
      return { art, bereich: b, name: NAMEN[b], angehakt, wirksam: angehakt && !(art === 'einrichtung' && b === 'zugang' && z.benutzer === 'Jonas Beispiel'), darf: b !== 'betrieb', frisch: art === 'nachweise' || b === 'zugang' };
    }),
    benutzer: z.benutzer, am: z.am, verlauf: z.verlauf,
  });
  await s.route('**/api/werkbank/pakete', async (r) => {
    if (r.request().method() !== 'GET') return r.fallback();
    const echt = await (await r.fetch()).json();
    await r.fulfill({ json: { ...echt, installiert: [COMPLIANCE] } });
  });
  await s.route('**/api/werkbank/pakete/compliance/umwandlungen', (r) => r.fulfill({ json: { felder: [], vorgaenge: [] } }));
  await s.route('**/api/werkbank/pakete/compliance/paketdaten', (r) => {
    if (r.request().method() === 'PUT') {
      const b = r.request().postDataJSON();
      z.gespeichert.push(b);
      z.angehakt = new Set([...b.einrichtung.map((x) => `einrichtung:${x}`), ...b.nachweise.map((x) => `nachweise:${x}`)]);
      z.benutzer = LENA.name; z.am = new Date().toISOString();
      z.verlauf = [{ am: z.am, von: LENA.email, einrichtung: b.einrichtung, nachweise: b.nachweise }, ...z.verlauf];
    }
    return r.fulfill({ json: ansicht() });
  });
  return z;
}

async function zurPaketseite(s) {
  await s.goto(BASIS + '/ablage/start');
  await verwalten(s);
  // Anhaken im Reiter „Einstellungen“ (#996: Übersicht liest, Einstellungen ändern).
  await s.goto(BASIS + '/werkbank/pakete/compliance?reiter=einstellungen');
  const bereich = s.getByRole('region', { name: 'Einrichtung und Nachweise' });
  await bereich.getByRole('checkbox', { name: 'Sicherung' }).first().waitFor();
  return bereich;
}

rauchtest('Paketseite: Einrichtung und Nachweise je Bereich freigeben (#1054)', { als: LENA, timeout: 90_000 }, async (s) => {
  const z = await attrappe(s);
  const b = await zurPaketseite(s);
  const einrichtung = b.getByRole('group', { name: 'Einrichtung lesen' });
  const nachweise = b.getByRole('group', { name: 'Nachweise lesen' });
  // Vorgabe nichts außer dem, was schon freigegeben ist; Betrieb darf Lena nicht anhaken; Zugang wirkt nicht mehr.
  assert.equal(await einrichtung.getByRole('checkbox', { name: 'Sicherung' }).isChecked(), false);
  assert.equal(await einrichtung.getByRole('checkbox', { name: 'Betrieb' }).isDisabled(), true);
  await einrichtung.getByText('Nur, wer diesen Bereich verwaltet').waitFor();
  await einrichtung.getByText(/Angehakt, wirkt aber nicht: Jonas Beispiel/).waitFor();
  await nachweise.getByText('Enthält Benutzer und Fehlanmeldungen – verrechte den Mappentyp, in dem das Paket sie ablegt.').waitFor();
  const speichern = b.getByRole('button', { name: 'Freigabe speichern' });
  assert.equal(await speichern.isDisabled(), true, 'ohne Änderung nichts zu speichern');
  await einrichtung.getByRole('checkbox', { name: 'Sicherung' }).check();
  await nachweise.getByRole('checkbox', { name: 'Sicherung' }).check();
  await speichern.click();
  await b.getByText('Freigabe gespeichert.').waitFor();
  await b.getByText(/^Freigegeben von Lena Beispiel am/).waitFor();
  assert.deepEqual(z.gespeichert.at(-1), { einrichtung: ['zugang', 'sicherung'], nachweise: ['sicherung'] });
  await b.getByText('Änderungen der Freigabe').click();
  await b.getByText(/lena@example\.org: Einrichtung zugang, sicherung; Nachweise sicherung/).waitFor();
});

rauchtest('Paketseite mit Einrichtung und Nachweisen: axe ohne Verstoß, hell und dunkel (#1054)', { als: LENA, timeout: 90_000 }, async (s) => {
  await attrappe(s);
  const funde = [];
  for (const schema of ['light', 'dark']) {
    await s.emulateMedia({ colorScheme: schema });
    const b = schema === 'light' ? await zurPaketseite(s) : s.getByRole('region', { name: 'Einrichtung und Nachweise' });
    if (schema === 'dark') await s.reload();
    await b.getByRole('checkbox', { name: 'Betrieb' }).waitFor();
    await b.getByText('Änderungen der Freigabe').click();
    await s.waitForLoadState('networkidle');
    for (const v of await axePruefen(s, WERKBANK_BEREICHE)) funde.push(`${schema}: ${v}`);
  }
  assert.deepEqual(funde, [], `axe meldet Verstöße:\n${funde.join('\n')}`);
});

rauchtest('Handy: Einrichtung und Nachweise mit 44-px-Tippflächen (#1054)', { handy: true, als: LENA, timeout: 90_000 }, async (s) => {
  await attrappe(s);
  await zurPaketseite(s);
  await s.waitForLoadState('networkidle');
  const funde = await tippflaechenPruefen(s, WERKBANK_BEREICHE);
  assert.deepEqual(funde, [], `Zu kleine Tippflächen am Handy:\n${funde.join('\n')}`);
});
