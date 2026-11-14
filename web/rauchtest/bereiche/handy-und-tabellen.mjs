/**
 * Rauchtests: Handy (Anmelden, Post, Suche, Assistent, Fenster) sowie Tabellen, Teile, Archivmodus und Fassungen.
 * Allein starten (frisch gestartetes Ablago, siehe rauchtest.mjs): node web/rauchtest/bereiche/handy-und-tabellen.mjs [fehlerordner] [musterordner]
 */
import assert from 'node:assert/strict';
import '../einrichtung.mjs';
import { api, BASIS, daten, keineWaagerechteRolle, LENA, mitFragen, rauchtest, sitzung, verwalten } from '../hilfen.mjs';

/* ---------- Handy ---------- */

rauchtest('Handy: Anmelden und Startseite', { handy: true }, async (s) => {
  await s.goto(BASIS + '/');
  await s.getByLabel('E-Mail-Adresse').fill(LENA.email);
  await s.getByLabel('Passwort', { exact: true }).fill(LENA.passwort);
  await s.getByRole('button', { name: 'Anmelden', exact: true }).click();
  await s.waitForURL(/\/ablage\/start$/);
  // Am Handy: Ansicht oben als Auswahl, Startseite einspaltig mit „Post fotografieren“.
  await s.getByRole('heading', { name: 'Guten Tag, Lena', level: 1 }).waitFor();
  await s.getByRole('button', { name: /Post fotografieren/ }).waitFor();
  await s.getByRole('link', { name: /^Neue Post 2/ }).waitFor();
  await s.getByRole('button', { name: '+ Neu' }).waitFor();
  await keineWaagerechteRolle(s);
});

rauchtest('Handy: Neue Post öffnen', { handy: true, als: LENA }, async (s) => {
  await s.goto(BASIS + '/ablage/start');
  await s.getByRole('link', { name: /^Neue Post 2/ }).first().click();
  await s.locator(`a[href$="/${daten.briefHandy.id}"]`).click();
  // „Dokument übernehmen“ (#934): bis zur mobilen Fassung alles in einer Spalte untereinander.
  await s.waitForURL(/\/uebernehmen$/);
  await s.getByRole('heading', { name: 'Beitragsrechnung Hausrat 2027' }).waitFor();
  await s.getByRole('radiogroup', { name: 'Wohin gehört das?' }).waitFor();
  await s.getByRole('combobox', { name: 'Mappentyp suchen …' }).waitFor();
  await keineWaagerechteRolle(s);
});

// #1218: Am Handy steht oben nur die Lupe (44 px); sie öffnet das Feld über die ganze Kopfzeile.
rauchtest('Handy: Suche über die Lupe oben', { handy: true, als: LENA }, async (s) => {
  await s.goto(BASIS + '/ablage/start');
  const lupe = s.getByRole('banner').getByRole('button', { name: 'Suchen', exact: true });
  const box = await lupe.boundingBox();
  assert.ok(box && box.width >= 44 && box.height >= 44, `Lupe mindestens 44 px (${JSON.stringify(box)})`);
  await lupe.click();
  const feld = s.getByRole('banner').getByRole('searchbox', { name: 'In deiner Ablage suchen' });
  assert.ok(await feld.evaluate((e) => e === document.activeElement), 'Fokus im aufgeklappten Feld');
  await keineWaagerechteRolle(s);
  await feld.fill('Stromvertrag');
  await feld.press('Enter');
  await s.waitForURL(/\/ablage\/suche\?volltext=Stromvertrag$/);
  await s.getByRole('link', { name: /Stromvertrag Haus/ }).first().click();
  await s.getByRole('heading', { name: 'Stromvertrag Haus', level: 1 }).waitFor();
  await keineWaagerechteRolle(s);
});

// #1219: Am Handy liegt der Assistent als Blatt unten über die volle Breite.
rauchtest('Handy: Assistent als Blatt von unten (#1219)', { handy: true, als: LENA }, async (s) => {
  await mitFragen(s);
  await s.goto(BASIS + '/ablage/start');
  await s.getByRole('button', { name: /^Assistent öffnen/ }).click();
  const fenster = s.getByRole('dialog', { name: 'Assistent' });
  await fenster.getByRole('textbox', { name: 'Frag deine Ablage' }).waitFor();
  const box = await fenster.boundingBox();
  const breite = await s.evaluate(() => document.documentElement.clientWidth);
  assert.ok(box && box.x <= 1 && Math.abs(box.x + box.width - breite) <= 1, `Blatt über die volle Breite (${JSON.stringify(box)})`);
  await keineWaagerechteRolle(s);
});

// #935: „+ … anlegen“ öffnet am Handy dasselbe Fenster – unten, so breit wie der Bildschirm; Esc schließt es.

rauchtest('Handy: Fenster „+ … anlegen“ passt auf den Bildschirm (#935)', { handy: true, als: LENA }, async (s) => {
  const typen = (await api('GET', '/api/typen', { cookie: await sitzung(LENA) })).daten;
  await s.goto(BASIS + `/ablage/${typen.find((x) => x.name === 'Rechnung').id}/neu`);
  const feld = s.locator('[data-anker="mappe.feld:aussteller"]');
  await feld.getByRole('button', { name: '+ Vertragspartner anlegen' }).click();
  const fenster = s.getByRole('dialog', { name: 'Vertragspartner anlegen' });
  await fenster.getByRole('textbox', { name: 'Name', exact: true }).waitFor();
  const box = await fenster.boundingBox();
  assert.ok(box && box.x >= 0 && box.x + box.width <= 390, `Fenster breiter als der Bildschirm (${JSON.stringify(box)})`);
  await keineWaagerechteRolle(s);
  await s.keyboard.press('Escape');
  await fenster.waitFor({ state: 'detached' });
});

rauchtest('Tabelle: Positionen zwischen den Feldern, „+ Position“ im Fenster (#1030)', { als: LENA }, async (s) => {
  const { auftrag, mappe } = daten.tabelle;
  await s.goto(BASIS + `/ablage/${auftrag.id}/${mappe.id}`);
  const tabelle = s.getByRole('table', { name: 'Positionen' });
  await tabelle.getByRole('link', { name: '1' }).waitFor();
  assert.deepEqual(await tabelle.getByRole('columnheader').allTextContents(), ['Nr.', 'Beschreibung', 'Menge', 'Einzelpreis']);
  assert.equal(await tabelle.getByRole('row').count(), 3);
  // „+ Position“: Knopfart Anlegen (#989), öffnet das Fenster mit dem Verweis auf diesen Auftrag.
  const neu = s.getByRole('button', { name: '+ Position' });
  assert.equal(await neu.getAttribute('data-knopf'), 'anlegen');
  await neu.click();
  const fenster = s.getByRole('dialog', { name: 'Auftragsposition anlegen' });
  await fenster.getByText('A-1').first().waitFor();
  await fenster.getByRole('textbox', { name: 'Beschreibung', exact: true }).fill('Bremsen vorne');
  await fenster.getByRole('button', { name: /speichern/i }).click();
  await fenster.waitFor({ state: 'detached' });
  await tabelle.getByRole('cell', { name: 'Bremsen vorne', exact: true }).waitFor();
  await s.getByRole('status').filter({ hasText: 'angelegt' }).waitFor();
});

rauchtest('Handy: Tabelle als Liste mit den ersten zwei Spalten (#1030)', { handy: true, als: LENA }, async (s) => {
  const { auftrag, mappe } = daten.tabelle;
  await s.goto(BASIS + `/ablage/${auftrag.id}/${mappe.id}`);
  const liste = s.getByRole('list', { name: 'Positionen' });
  await liste.getByRole('listitem').first().waitFor();
  assert.equal(await s.getByRole('table', { name: 'Positionen' }).count(), 0);
  assert.match(await liste.getByRole('listitem').filter({ hasText: 'Ölfilter' }).textContent(), /^1\s*Beschreibung:\s*Ölfilter$/);
  await keineWaagerechteRolle(s);
});

rauchtest('Teile: Suche findet den Auftrag über seine Position, „Teil von …“ am direkten Link (#1031)', { als: LENA }, async (s) => {
  const { auftrag, mappe, positionen, position } = daten.tabelle;
  // Suche über alle Mappen (#1218: Enter im Suchfeld oben): der Auftrag mit „gefunden in Auftragsposition …“, die Position selbst nicht.
  await s.goto(BASIS + '/ablage/start');
  const feld = s.getByRole('banner').getByRole('searchbox', { name: 'In deiner Ablage suchen' });
  await feld.fill('Ölfilter');
  await feld.press('Enter');
  const liste = s.getByRole('region', { name: 'Mappen' });
  await liste.getByText('gefunden in Auftragsposition „1. Ölfilter“').first().waitFor();
  assert.equal(await liste.getByRole('link', { name: /^1\. Ölfilter/ }).count(), 0);
  // Direkter Link auf die Position: oben „Teil von Auftrag „A-1““ mit Link zurück; in der Mitte keine Liste aller Positionen.
  await s.goto(BASIS + `/ablage/${position.id}/${positionen[0].id}`);
  const zurueck = s.getByRole('link', { name: 'Auftrag „A-1“' });
  await zurueck.waitFor();
  await s.getByText('Mappen vom Typ Auftragsposition erscheinen nur an ihrer übergeordneten Mappe', { exact: false }).waitFor();
  await zurueck.click();
  await s.waitForURL(new RegExp(`/ablage/${auftrag.id}/${mappe.id}`));
});

rauchtest('Archivmodus: „Frist beginnt mit …“ an der Mappe, „Ist der Stichtag leer“ im Mappentyp (#1051)', { als: LENA }, async (s) => {
  const { typ, laufend, beendet } = daten.archiv;
  await s.goto(BASIS + `/ablage/${typ.id}/${laufend.id}`);
  await s.getByText('aufbewahren, Frist beginnt mit „Beendet am“').waitFor();
  await s.goto(BASIS + `/ablage/${typ.id}/${beendet.id}`);
  await s.getByText('aufbewahren bis 31.12.2033').waitFor();
  await verwalten(s);
  await s.goto(BASIS + `/werkbank/typen/${typ.id}#archiv`);
  const wahl = s.getByLabel('Ist „Beendet am“ leer');
  await wahl.waitFor();
  assert.equal(await wahl.inputValue(), 'laeuftNicht');
  await s.getByText('Bei 1 Mappe ist „Beendet am“ leer – dort läuft die Frist noch nicht.').waitFor();
  await keineWaagerechteRolle(s);
});

rauchtest('Fassungen: Bereich im Mappentyp, Liste mit der ersten Fassung (#1006)', { als: LENA }, async (s) => {
  const { typ } = daten.archiv;
  await s.goto(BASIS + '/ablage/start');
  await verwalten(s);
  await s.goto(BASIS + `/werkbank/typen/${typ.id}#fassungen`);
  const bereich = s.locator('#fassungen');
  // Der Anker öffnet den Bereich; die Liste nennt die Fassung mit lesbarer Änderung und „Aktuell“.
  await bereich.locator('.historie').waitFor();
  await bereich.getByText('Aktuell', { exact: true }).waitFor();
  await bereich.locator('.historie summary').first().click();
  await bereich.getByText('Angelegt', { exact: false }).first().waitFor();
  assert.ok(await s.locator('[data-sprungleiste]').getByRole('button', { name: 'Fassungen' }).count() > 0, 'Fassungen in der Sprungleiste');
  await keineWaagerechteRolle(s);
});
