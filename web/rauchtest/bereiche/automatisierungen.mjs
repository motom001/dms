/**
 * Rauchtests: Werkbank → Automatisierungen und Ablaufvorlagen (#1172–#1177).
 * Allein starten (frisch gestartetes Ablago, siehe rauchtest.mjs): node web/rauchtest/bereiche/automatisierungen.mjs [fehlerordner] [musterordner]
 */
import assert from 'node:assert/strict';
import '../einrichtung.mjs';
import { BASIS, daten, inTagen, LENA, probeDialog, rauchtest, verwalten, WERKBANK_BEREICHE } from '../hilfen.mjs';
import { axePruefen, tippflaechenPruefen } from '../muster.mjs';

/* ---------- Werkbank → Automatisierungen und Ablaufvorlagen (#1172–#1177) ---------- */

rauchtest('Automatisierungen: kompakte Liste, Mehrfachauswahl, gruppieren, Schalter an fester Stelle (#1172, #1173)', { als: LENA }, async (s) => {
  const funde = [];
  await s.goto(BASIS + '/ablage/start');
  await verwalten(s);
  await s.goto(BASIS + '/werkbank/automatisierungen');
  const liste = s.getByRole('region', { name: 'Elemente' });
  const zeile = liste.getByRole('link', { name: /Rauchtest Auswahl A/ });
  await zeile.waitFor();
  // Höchstens zwei Zeilen je Eintrag (#1172).
  const hoehe = (await zeile.boundingBox()).height;
  assert.ok(hoehe < 70, `Eintrag ${hoehe} px hoch`);
  // Mehrfachauswahl: zwei wählen, gemeinsam ausschalten.
  for (const n of ['Rauchtest Auswahl A', 'Rauchtest Auswahl B']) await liste.getByRole('checkbox', { name: `${n} auswählen` }).check();
  const leiste = liste.getByRole('region', { name: 'Auswahl' });
  await leiste.getByText('2 ausgewählt').waitFor();
  for (const schema of ['light', 'dark']) {
    await s.emulateMedia({ colorScheme: schema });
    await s.waitForTimeout(400);
    for (const v of await axePruefen(s, WERKBANK_BEREICHE)) funde.push(`Liste mit Auswahl (${schema}): ${v}`);
  }
  await s.emulateMedia({ colorScheme: 'light' });
  await leiste.getByRole('button', { name: 'Ausschalten' }).click();
  await liste.getByText('2 Automatisierungen ausgeschaltet.').waitFor({ state: 'attached' });
  await leiste.waitFor({ state: 'detached' });
  // Gruppieren nach Ziel und nach Paket.
  const gruppieren = liste.getByRole('combobox', { name: 'Gruppieren' });
  await gruppieren.selectOption({ label: 'Nach Ziel' });
  await liste.getByRole('heading', { name: /^Aufgabe stellen/ }).waitFor();
  await gruppieren.selectOption({ label: 'Nach Paket' });
  await liste.getByRole('heading', { name: /^Eigene/ }).waitFor();
  // Editor (#1173): Schalter aus, kein Sprung, keine Meldung nach dem Umschalten.
  await zeile.click();
  const bearbeitung = s.getByRole('region', { name: 'Bearbeitung' });
  const schalter = bearbeitung.getByRole('switch', { name: 'Automatisierung an oder aus' });
  await schalter.waitFor();
  assert.equal(await schalter.getAttribute('aria-checked'), 'false');
  const vorher = await schalter.boundingBox();
  await schalter.click();
  await bearbeitung.locator('[role="switch"][aria-checked="true"]').waitFor();
  const nachher = await schalter.boundingBox();
  assert.deepEqual([nachher.x, nachher.y], [vorher.x, vorher.y], 'Schalter bleibt an seiner Stelle');
  assert.equal(await bearbeitung.getByText('Eingeschaltet.').count(), 0, 'keine zusätzliche Meldung');
  for (const schema of ['light', 'dark']) {
    await s.emulateMedia({ colorScheme: schema });
    await s.waitForTimeout(400);
    for (const v of await axePruefen(s, WERKBANK_BEREICHE)) funde.push(`Editor (${schema}): ${v}`);
  }
  assert.deepEqual(funde, [], `axe meldet Verstöße:\n${funde.join('\n')}`);
});

rauchtest('Automatisierung: Platzhalter zum Anklicken an der Schreibmarke (#1177)', { als: LENA }, async (s) => {
  await s.goto(BASIS + '/ablage/start');
  await verwalten(s);
  await s.goto(BASIS + '/werkbank/automatisierungen');
  await s.getByRole('region', { name: 'Elemente' }).getByRole('link', { name: /Rauchtest Auswahl B/ }).click();
  const bearbeitung = s.getByRole('region', { name: 'Bearbeitung' });
  await s.locator('[data-sprungleiste]').getByRole('button', { name: 'Dann' }).click();
  await bearbeitung.locator('.automatisierung-karten .karte-kopf button[aria-expanded]').first().click();
  const text = bearbeitung.getByRole('textbox', { name: 'Text' });
  await text.waitFor();
  const platzhalter = bearbeitung.getByRole('group', { name: 'Platzhalter einsetzen' });
  await platzhalter.getByRole('group', { name: 'Allgemein' }).waitFor();
  await platzhalter.getByRole('group', { name: 'Vertrag' }).waitFor();
  // Schreibmarke an den Anfang, dann einsetzen: vorn statt hinten.
  await text.fill('Bitte prüfen');
  await text.press('Home');
  await platzhalter.getByRole('button', { name: /^Mappentyp/ }).click();
  assert.equal(await text.inputValue(), '{mappentyp}Bitte prüfen');
  assert.equal(await platzhalter.getByRole('button', { name: /^Mappentyp/ }).getAttribute('title'), '{mappentyp}');
});

rauchtest('Ablaufvorlage: Mappentypen, „In“ immer sichtbar, Platzhalter, Ausprobieren als Probe (#1175, #1176, #1177)', { als: LENA }, async (s) => {
  const { vorlage } = daten.vorschlag;
  const funde = [];
  await s.goto(BASIS + '/ablage/start');
  await verwalten(s);
  await s.goto(BASIS + `/werkbank/ablaufvorlagen/${encodeURIComponent(vorlage.kennung)}`);
  const bearbeitung = s.getByRole('region', { name: 'Bearbeitung' });
  // Mappentypen wie ein Verweisfeld (#1175): der gewählte Typ darunter mit „Entfernen“.
  await bearbeitung.getByRole('combobox', { name: 'Im Menü „Mappe“ bei' }).waitFor();
  await bearbeitung.getByRole('list', { name: 'Im Menü „Mappe“ bei' }).getByText('Werkzeug').waitFor();
  // Ausprobieren (#1176): Dialog wie an der Mappe, dann die Vorschau – angelegt wird nichts.
  const probe = await probeDialog(bearbeitung, vorlage.name);
  await probe.getByLabel('Text').fill('Akku laden');
  for (const schema of ['light', 'dark']) {
    await s.emulateMedia({ colorScheme: schema });
    await s.waitForTimeout(400);
    for (const v of await axePruefen(s, WERKBANK_BEREICHE)) funde.push(`Probe-Dialog (${schema}): ${v}`);
  }
  await s.emulateMedia({ colorScheme: 'light' });
  await probe.getByRole('button', { name: vorlage.name }).click();
  const [j, m, t] = inTagen(14).split('-');
  const vorschau = bearbeitung.locator('.probe-vorschau');
  await vorschau.getByText('Aufgabe für Lena').waitFor();
  await vorschau.getByText(`fällig am ${t}.${m}.${j}`).waitFor();
  await vorschau.getByText('Akku laden', { exact: true }).waitFor();
  await bearbeitung.getByRole('button', { name: 'Nochmal' }).waitFor();
  for (const schema of ['light', 'dark']) {
    await s.emulateMedia({ colorScheme: schema });
    await s.waitForTimeout(400);
    for (const v of await axePruefen(s, WERKBANK_BEREICHE)) funde.push(`Vorschau (${schema}): ${v}`);
  }
  await s.emulateMedia({ colorScheme: 'light' });
  // „In“ (#1175): Felder immer da; der Umschalter behält seine Breite; ein Klick in die Zahl wählt „In“.
  const wann = bearbeitung.getByRole('radiogroup', { name: 'Wann' });
  const breite = (await wann.boundingBox()).width;
  await wann.getByRole('radio', { name: 'Sofort' }).click();
  assert.equal((await wann.boundingBox()).width, breite, 'Umschalter ändert seine Breite nicht');
  const zahl = bearbeitung.getByRole('textbox', { name: 'Zeitraum für „In“' });
  assert.equal(await zahl.inputValue(), '14', 'Felder bleiben sichtbar');
  await zahl.click();
  assert.equal(await wann.getByRole('radio', { name: 'In', exact: true }).getAttribute('aria-checked'), 'true', 'Klick in die Zahl wählt „In“');
  // Platzhalter (#1177): gruppiert, an der Schreibmarke.
  const text = bearbeitung.getByRole('textbox', { name: 'Text', exact: true });
  await text.fill('X');
  await text.press('Home');
  await bearbeitung.getByRole('group', { name: 'Werkzeug' }).getByRole('button', { name: 'Name' }).click();
  assert.equal(await text.inputValue(), '{name}X');
  assert.deepEqual(funde, [], `axe meldet Verstöße:\n${funde.join('\n')}`);
});

rauchtest('Handy: Automatisierungen und Ausprobieren mit 44-px-Tippflächen (#1172, #1176, #1177)', { handy: true, als: LENA }, async (s) => {
  const { vorlage } = daten.vorschlag;
  const funde = [];
  await s.goto(BASIS + '/ablage/start');
  await verwalten(s);
  await s.goto(BASIS + '/werkbank/automatisierungen');
  await s.getByRole('checkbox', { name: 'Rauchtest Auswahl A auswählen' }).check();
  await s.getByRole('region', { name: 'Auswahl' }).waitFor();
  await s.waitForLoadState('networkidle');
  for (const v of await tippflaechenPruefen(s, WERKBANK_BEREICHE)) funde.push(`Liste: ${v}`);
  await s.goto(BASIS + `/werkbank/ablaufvorlagen/${encodeURIComponent(vorlage.kennung)}`);
  const bearbeitung = s.getByRole('region', { name: 'Bearbeitung' });
  const probe = await probeDialog(bearbeitung, vorlage.name);
  await s.waitForLoadState('networkidle');
  for (const v of await tippflaechenPruefen(s, WERKBANK_BEREICHE)) funde.push(`Probe: ${v}`);
  await probe.getByLabel('Text').fill('Akku laden');
  await probe.getByRole('button', { name: vorlage.name }).click();
  await bearbeitung.getByRole('button', { name: 'Nochmal' }).waitFor();
  for (const v of await tippflaechenPruefen(s, WERKBANK_BEREICHE)) funde.push(`Vorschau: ${v}`);
  assert.deepEqual(funde, [], `Zu kleine Tippflächen am Handy:\n${funde.join('\n')}`);
});
