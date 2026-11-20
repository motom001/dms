/**
 * Rauchtests: Werkbank → Rundgänge (#941) und Tipps (#942).
 * Allein starten (frisch gestartetes Ablago, siehe rauchtest.mjs): node web/rauchtest/bereiche/rundgaenge-und-tipps.mjs [fehlerordner] [musterordner]
 */
import assert from 'node:assert/strict';
import '../einrichtung.mjs';
import { BASIS, keineWaagerechteRolle, LENA, rauchtest, schemaWechseln, verwalten, WERKBANK_BEREICHE } from '../hilfen.mjs';
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
  // Ausprobieren (#1533): Ablagos Rundgang startet „nur für mich“ im eigenen Fenster, ohne Fehler wegen „erste_anmeldung“.
  // Am Ende schließt sich das Fenster wieder („Fertig – zurück zum Entwurf“).
  const [probe] = await Promise.all([s.waitForEvent('popup'), bearbeitung.getByRole('button', { name: 'Ausprobieren' }).click()]);
  const karte = probe.getByRole('dialog');
  await karte.waitFor();
  const fertig = karte.getByRole('button', { name: 'Fertig – zurück zum Entwurf' });
  for (let i = 0; i < 9 && !(await fertig.isVisible()); i++) await karte.getByRole('button', { name: 'Weiter' }).click();
  await Promise.all([probe.waitForEvent('close'), fertig.click()]);
  assert.equal(await bearbeitung.locator('.hinweis.schlecht').count(), 0, 'Ausprobieren ohne Fehlermeldung');
  // Knöpfe (#1533): Hauptknopf unten rechts, gleich hoch wie „Ausprobieren“.
  const kopieren = bearbeitung.getByRole('button', { name: 'Als eigenen kopieren' });
  const hoehen = await Promise.all([kopieren, bearbeitung.getByRole('button', { name: 'Ausprobieren' })].map((k) => k.boundingBox()));
  assert.equal(Math.round(hoehen[0].height), Math.round(hoehen[1].height), 'Haupt- und Nebenknopf gleich hoch');
  assert.ok(hoehen[0].x > hoehen[1].x, 'Hauptknopf rechts');
  // „Als eigenen kopieren“ legt die Kopie gleich an: ausgeschaltet, eigener Editor.
  await kopieren.click();
  await s.waitForURL(/\/werkbank\/rundgaenge\/eigen%3Aablago$/);
  await bearbeitung.locator('[role="switch"][aria-checked="false"]').waitFor();
  assert.match(await bearbeitung.getByRole('textbox', { name: 'Datei (YAML)' }).inputValue(), /^start: manuell$/m);
  // Neuer Rundgang: Fehler mit Zeile, dann speichern.
  await liste.getByRole('link', { name: '+ Rundgang' }).click();
  const datei = bearbeitung.getByRole('textbox', { name: 'Datei (YAML)' });
  await datei.waitFor();
  await datei.fill(EIGENER.replace('startseite.suche', 'gibt.es.nicht'));
  await bearbeitung.getByRole('button', { name: 'Prüfen' }).click();
  await bearbeitung.getByRole('button', { name: 'Zeile 6' }).waitFor();
  await bearbeitung.getByText(/unbekannter Anker „gibt\.es\.nicht“/).waitFor();
  for (const schema of ['light', 'dark']) {
    await schemaWechseln(s, schema);
    for (const v of await axePruefen(s, WERKBANK_BEREICHE)) funde.push(`Editor mit Fehler (${schema}): ${v}`);
  }
  await schemaWechseln(s, 'light');
  // Ankerhilfe: ein Klick setzt den Anker an der Schreibmarke ein.
  await datei.fill(EIGENER.replace('    ziel: startseite.suche\n', '    ziel: \n'));
  await datei.evaluate((el) => {
    const i = el.value.indexOf('ziel: ') + 6;
    el.focus();
    el.setSelectionRange(i, i);
  });
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
    await schemaWechseln(s, schema);
    for (const v of await axePruefen(s, WERKBANK_BEREICHE)) funde.push(`Eigener Rundgang (${schema}): ${v}`);
  }
  assert.deepEqual(funde, [], `axe meldet Verstöße:\n${funde.join('\n')}`);
});

rauchtest('Handy: Werkbank → Rundgänge, Tippflächen (#941)', { handy: true, als: LENA }, async (s) => {
  await s.goto(BASIS + '/ablage/start');
  await verwalten(s);
  await s.goto(BASIS + '/werkbank/rundgaenge');
  await s
    .getByRole('region', { name: 'Elemente' })
    .getByRole('link', { name: /bei der ersten Anmeldung/ })
    .first()
    .waitFor();
  await keineWaagerechteRolle(s);
  const zuKlein = await tippflaechenPruefen(s, ['.spalte.liste']);
  assert.deepEqual(zuKlein, [], `Zu kleine Tippflächen:\n${zuKlein.join('\n')}`);
});

rauchtest(
  'Werkbank → Tipps: eigener Tipp mit Vorschau, Tipp von Ablago anpassen und zurücksetzen (#942)',
  { als: LENA, timeout: 110_000 },
  async (s) => {
    const funde = [];
    await s.goto(BASIS + '/ablage/start');
    await verwalten(s);
    await s.goto(BASIS + '/werkbank/tipps/neu');
    const bearbeitung = s.getByRole('region', { name: 'Bearbeitung' });
    const text = bearbeitung.getByRole('textbox', { name: 'Text' });
    await text.waitFor();
    await text.fill('Rauchtest: Oben suchst du in allen Mappen.');
    await bearbeitung.locator('.tipp-vorschau').getByText('Rauchtest: Oben suchst du in allen Mappen.').waitFor();
    await bearbeitung.getByRole('combobox', { name: 'Stelle' }).selectOption('startseite.suche');
    await bearbeitung.getByRole('button', { name: 'Tipp anlegen' }).click();
    await s.waitForURL(/\/werkbank\/tipps\/eigen%3Atipp_1$/);
    const liste = s.getByRole('region', { name: 'Elemente' });
    await liste.getByRole('link', { name: /Rauchtest: Oben suchst du/ }).waitFor();
    for (const schema of ['light', 'dark']) {
      await schemaWechseln(s, schema);
      for (const v of await axePruefen(s, WERKBANK_BEREICHE)) funde.push(`Eigener Tipp (${schema}): ${v}`);
    }
    await schemaWechseln(s, 'light');
    // Tipp von Ablago anpassen: Original bleibt, „angepasst“ in der Liste, zurücksetzen.
    await s.goto(BASIS + '/werkbank/tipps/favoriten');
    await text.waitFor();
    const original = await text.inputValue();
    await text.fill('Rauchtest: Bei uns heißen Favoriten Merkliste.');
    await bearbeitung.getByRole('button', { name: 'Tipp speichern' }).click();
    await liste.getByRole('link', { name: /Merkliste.*angepasst/ }).waitFor();
    await bearbeitung.getByText(`Original: ${original}`).waitFor();
    for (const schema of ['light', 'dark']) {
      await schemaWechseln(s, schema);
      for (const v of await axePruefen(s, WERKBANK_BEREICHE)) funde.push(`Angepasster Tipp (${schema}): ${v}`);
    }
    await schemaWechseln(s, 'light');
    await bearbeitung.getByRole('button', { name: 'Auf Original zurücksetzen' }).click();
    await liste
      .getByRole('link', { name: original.slice(0, 30) })
      .first()
      .waitFor();
    assert.equal(await liste.getByRole('link', { name: /Merkliste/ }).count(), 0);
    assert.deepEqual(funde, [], `axe meldet Verstöße:\n${funde.join('\n')}`);
  },
);

rauchtest('Handy: Werkbank → Tipps, Tippflächen (#942)', { handy: true, als: LENA }, async (s) => {
  await s.goto(BASIS + '/ablage/start');
  await verwalten(s);
  await s.goto(BASIS + '/werkbank/tipps');
  await s.getByRole('region', { name: 'Elemente' }).getByRole('link').nth(2).waitFor();
  await keineWaagerechteRolle(s);
  const zuKlein = await tippflaechenPruefen(s, ['.spalte.liste']);
  assert.deepEqual(zuKlein, [], `Zu kleine Tippflächen:\n${zuKlein.join('\n')}`);
});

rauchtest('Tipp „Erinnern“: öffnet eine lesbare Mappe und hebt „Mappe ▾“ hervor (#1307)', { als: LENA }, async (s) => {
  await s.goto(BASIS + '/entdecken');
  await s.getByRole('link', { name: /„Mappe ▾“ → „Erinnern“/ }).click();
  // Die zuletzt geänderte Mappe, die Lena lesen darf; die Stelle ist kurz hervorgehoben.
  await s.waitForURL(/\/ablage\/[^/]+\/[^/]+$/);
  await s.locator('[data-anker="mappe.aktionen"].anker-hervor').first().waitFor();
});
