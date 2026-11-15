/**
 * Rauchtests: Werkbank → Rundgänge (#941) und Tipps (#942).
 * Allein starten (frisch gestartetes Ablago, siehe rauchtest.mjs): node web/rauchtest/bereiche/rundgaenge-und-tipps.mjs [fehlerordner] [musterordner]
 */
import assert from 'node:assert/strict';
import '../einrichtung.mjs';
import { BASIS, keineWaagerechteRolle, LENA, rauchtest, verwalten, WERKBANK_BEREICHE } from '../hilfen.mjs';
import { axePruefen, tippflaechenPruefen } from '../muster.mjs';

const EIGENER = `schluessel: rauchtest
titel: Rauchtest-Rundgang
beschreibung: Zeigt das Suchfeld.
schritte:
  - schluessel: suche
    ziel: startseite.suche
    ort: Oben in der Kopfzeile
    titel: Suchen
    text: Hier suchst du in allen Mappen.
`;

rauchtest('Werkbank → Rundgänge: Liste, Prüfen mit Zeile, eigenen speichern, an/aus (#941)', { als: LENA, timeout: 110_000 }, async (s) => {
  const funde = [];
  await s.goto(BASIS + '/ablage/start');
  await verwalten(s);
  await s.goto(BASIS + '/werkbank/rundgaenge');
  const liste = s.getByRole('region', { name: 'Elemente' });
  // Ablagos eigener Rundgang steht in der Liste, mit Start und Herkunft.
  const ablago = liste.getByRole('link', { name: /bei der ersten Anmeldung/ }).first();
  await ablago.waitFor();
  await ablago.click();
  const bearbeitung = s.getByRole('region', { name: 'Bearbeitung' });
  await bearbeitung.getByRole('switch', { name: 'Rundgang für alle' }).waitFor();
  await bearbeitung.getByRole('link', { name: 'Als eigenen kopieren' }).waitFor();
  // Neuer Rundgang: Fehler mit Zeile, dann speichern.
  await liste.getByRole('link', { name: '+ Neuer Rundgang' }).click();
  const datei = bearbeitung.getByRole('textbox', { name: 'Datei (YAML)' });
  await datei.waitFor();
  await datei.fill(EIGENER.replace('startseite.suche', 'gibt.es.nicht'));
  await bearbeitung.getByRole('button', { name: 'Prüfen' }).click();
  await bearbeitung.getByRole('button', { name: 'Zeile 6' }).waitFor();
  await bearbeitung.getByText(/unbekannter Anker „gibt\.es\.nicht“/).waitFor();
  for (const schema of ['light', 'dark']) {
    await s.emulateMedia({ colorScheme: schema });
    await s.waitForTimeout(400);
    for (const v of await axePruefen(s, WERKBANK_BEREICHE)) funde.push(`Editor mit Fehler (${schema}): ${v}`);
  }
  await s.emulateMedia({ colorScheme: 'light' });
  // Ankerhilfe: ein Klick setzt den Anker an der Schreibmarke ein.
  await datei.fill(EIGENER.replace('    ziel: startseite.suche\n', '    ziel: \n'));
  await datei.evaluate((el) => { const i = el.value.indexOf('ziel: ') + 6; el.focus(); el.setSelectionRange(i, i); });
  await bearbeitung.getByRole('button', { name: /^startseite\.suche / }).click();
  assert.match(await datei.inputValue(), /ziel: startseite\.suche\n/);
  await bearbeitung.getByRole('button', { name: 'Rundgang anlegen' }).click();
  await s.waitForURL(/\/werkbank\/rundgaenge\/eigen%3Arauchtest$/);
  const eigen = liste.getByRole('link', { name: /Rauchtest-Rundgang/ });
  await eigen.waitFor();
  // Ausschalten: in der Liste „ausgeschaltet“.
  const schalter = bearbeitung.getByRole('switch', { name: 'Rundgang für alle' });
  await schalter.click();
  await bearbeitung.locator('[role="switch"][aria-checked="false"]').waitFor();
  await liste.getByRole('link', { name: /Rauchtest-Rundgang.*ausgeschaltet/ }).waitFor();
  for (const schema of ['light', 'dark']) {
    await s.emulateMedia({ colorScheme: schema });
    await s.waitForTimeout(400);
    for (const v of await axePruefen(s, WERKBANK_BEREICHE)) funde.push(`Eigener Rundgang (${schema}): ${v}`);
  }
  assert.deepEqual(funde, [], `axe meldet Verstöße:\n${funde.join('\n')}`);
});

rauchtest('Handy: Werkbank → Rundgänge, Tippflächen (#941)', { handy: true, als: LENA }, async (s) => {
  await s.goto(BASIS + '/ablage/start');
  await verwalten(s);
  await s.goto(BASIS + '/werkbank/rundgaenge');
  await s.getByRole('region', { name: 'Elemente' }).getByRole('link', { name: /bei der ersten Anmeldung/ }).first().waitFor();
  await keineWaagerechteRolle(s);
  const zuKlein = await tippflaechenPruefen(s, ['.spalte.liste']);
  assert.deepEqual(zuKlein, [], `Zu kleine Tippflächen:\n${zuKlein.join('\n')}`);
});
