/**
 * Rauchtests: Startbild und „antwortet gerade nicht“ (#1198, #1199), Datum vorschlagen (#1180), allgemeine Suche (#1220).
 * Allein starten (frisch gestartetes Ablago, siehe rauchtest.mjs): node web/rauchtest/bereiche/startbild-und-vorschlaege.mjs [fehlerordner] [musterordner]
 */
import assert from 'node:assert/strict';
import '../einrichtung.mjs';
import { ABLAGE_BEREICHE, BASIS, daten, inTagen, LENA, probeDialog, rauchtest, verwalten, WERKBANK_BEREICHE } from '../hilfen.mjs';
import { axePruefen, tippflaechenPruefen } from '../muster.mjs';

/* ---------- Ablago antwortet nicht (#1198) ---------- */

rauchtest('Handy: Startbild, „antwortet gerade nicht“ ohne React, von selbst wieder da (#1198)', {
  handy: true,
  // Nachgestellt: Die Gesundheitsprüfung meldet „datenbank“ (503), solange die Datenbank hängt.
  erwartet: [{ status: 503, pfad: /^\/api\/gesundheit$/ }],
}, async (s, k) => {
  // Hängende Datenbank nachstellen: /api/sprache antwortet nie, die Gesundheitsprüfung meldet „datenbank“.
  await k.route('**/api/sprache', () => {});
  // #1199: mit Befund – Ablago hängt seit drei Minuten (wie /api/gesundheit ihn liefert).
  const befund = { ok: false, zustand: 'datenbank', datenbank: 'antwortet-nicht', seit: new Date(Date.now() - 180_000).toISOString(), dauerS: 180 };
  await k.route('**/api/gesundheit', (r) => r.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify(befund) }));
  await s.goto(BASIS + '/', { waitUntil: 'domcontentloaded' });
  // Sofort das Startbild aus index.html (ohne Skript), in der Sprache des Browsers.
  await s.getByText('Verbindung zu Ablago wird aufgebaut …').waitFor();
  assert.equal(await s.getByText('Connecting to Ablago …').isVisible(), false, 'nur eine Sprache sichtbar');
  // Nach einigen Sekunden (CSS): „antwortet noch nicht“.
  await s.waitForFunction(() => getComputedStyle(document.querySelector('.startbild-spaeter[data-sprache="de"]')).opacity === '1');
  // Nach der Zeitgrenze: Meldung ohne React mit „Erneut versuchen“.
  const meldung = s.locator('#keine-antwort');
  await meldung.getByRole('heading', { name: 'Ablago antwortet gerade nicht.' }).waitFor();
  // Hilfe zur Selbsthilfe (#1199): was los ist, was man tun kann, Handbuch, Uhrzeit – ohne Aktion und ohne Protokoll.
  await meldung.getByText('Ablago läuft, bekommt aber seit 3 Minuten keine Antwort von seiner Datenbank.', { exact: false }).waitFor();
  const schritte = await meldung.locator('ol.startbild-schritte li').allInnerTexts();
  assert.equal(schritte.length, 3, schritte.join(' | '));
  assert.match(schritte[1], /Ablago-Container neu starten/);
  assert.match(await meldung.getByRole('link', { name: /Alle Schritte im Handbuch/ }).getAttribute('href'), /^https:\/\/help\.ablago\.app\/.+laedt-nicht$/);
  await meldung.getByText(/^Zuletzt geprüft um \d\d:\d\d/).waitFor();
  assert.deepEqual(await meldung.getByRole('button').allInnerTexts(), ['Erneut versuchen'], 'kein Knopf außer „Erneut versuchen“ (kein Neustart ohne Anmeldung)');
  assert.equal(await meldung.getByText(/Schon neu geladen|allein hat nicht geholfen/).count(), 0);
  // Barrierefrei hell und dunkel, Tippflächen am Handy.
  const funde = [];
  for (const schema of ['light', 'dark']) {
    await s.emulateMedia({ colorScheme: schema });
    for (const v of await axePruefen(s, ['#keine-antwort'])) funde.push(`${schema}: ${v}`);
  }
  await s.emulateMedia({ colorScheme: 'light' });
  for (const v of await tippflaechenPruefen(s, ['#keine-antwort'])) funde.push(`Tippfläche: ${v}`);
  assert.deepEqual(funde, [], funde.join('\n'));
  await meldung.getByRole('button', { name: 'Erneut versuchen' }).click();
  // Neu geladen, Ablago antwortet weiter nicht: Hinweis, was dann hilft.
  await s.locator('#keine-antwort').getByText('Neu laden allein hat nicht geholfen – dann hilft meist Schritt 2.').waitFor();
  // Datenbank wieder da: Die Seite merkt es von selbst und startet die Oberfläche.
  await k.unrouteAll({ behavior: 'ignoreErrors' });
  await s.getByRole('heading', { name: 'Anmelden' }).waitFor({ timeout: 45_000 });
});

rauchtest('Handy: „antwortet gerade nicht“ bei abgewiesener Datenbank nennt den Datenbank-Container (#1199)', {
  handy: true,
  erwartet: [{ status: 503, pfad: /^\/api\/gesundheit$/ }],
}, async (s, k) => {
  // Datenbank aus: Die Verbindung wird abgelehnt – Schritt 2 heißt dann nicht „Ablago neu starten“, sondern Datenbank prüfen.
  await k.route('**/api/sprache', () => {});
  await k.route('**/api/gesundheit', (r) => r.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ ok: false, zustand: 'datenbank', datenbank: 'abgewiesen', seit: new Date().toISOString(), dauerS: 20 }) }));
  await s.goto(BASIS + '/', { waitUntil: 'domcontentloaded' });
  const meldung = s.locator('#keine-antwort');
  await meldung.getByText(/erreicht aber seit weniger als einer Minute seine Datenbank nicht – sie ist vermutlich aus\./).waitFor({ timeout: 30_000 });
  assert.match((await meldung.locator('ol.startbild-schritte li').allInnerTexts())[1], /Container der Datenbank läuft/);
  await k.unrouteAll({ behavior: 'ignoreErrors' });
});

/* ---------- Datum vorschlagen (#1180) und „In der allgemeinen Suche zeigen“ (#1220) ---------- */

/** Den Dialog der Vorlage an der Mappe öffnen (Menü „Mappe“). */
async function vorschlagDialog(s) {
  const { werkzeug, mappe, vorlage } = daten.vorschlag;
  await s.goto(BASIS + `/ablage/${werkzeug.id}/${mappe.id}`);
  const bereich = s.getByRole('region', { name: 'Mappe' });
  await bereich.getByRole('heading', { name: 'Bohrhammer', level: 1 }).waitFor();
  await bereich.getByRole('button', { name: 'Mappe', exact: true }).click();
  await s.getByRole('menuitem', { name: vorlage.name }).click();
  const dialog = bereich.getByRole('region', { name: vorlage.name });
  await dialog.getByLabel('Am').waitFor();
  return dialog;
}

rauchtest('Automatisierungsvorlage: Datum „in 14 Tagen“ vorbelegt und änderbar, an der Mappe und beim Ausprobieren (#1180)', { als: LENA }, async (s) => {
  const { vorlage } = daten.vorschlag;
  const funde = [];
  const dialog = await vorschlagDialog(s);
  assert.equal(await dialog.getByLabel('Am').inputValue(), inTagen(14), 'vorbelegt mit heute + 14 Tage');
  await dialog.getByText(/^Vorgeschlagen: /).waitFor();
  for (const schema of ['light', 'dark']) {
    await s.emulateMedia({ colorScheme: schema });
    // Knöpfe wechseln ihre Fläche mit einem kurzen Übergang – erst danach messen (wie im Assistenten).
    await s.waitForTimeout(400);
    for (const v of await axePruefen(s, ['.spalte.mappe'])) funde.push(`Dialog an der Mappe (${schema}): ${v}`);
  }
  await s.emulateMedia({ colorScheme: 'light' });
  // Geändert: Der Ablauf steht unter „Geplant“ mit dem neuen Datum.
  await dialog.getByLabel('Am').fill(inTagen(20));
  await dialog.getByLabel('Text').fill('Akku prüfen');
  await dialog.getByRole('button', { name: vorlage.name }).click();
  await dialog.waitFor({ state: 'detached' });
  const [j, m, t] = inTagen(20).split('-');
  await s.getByRole('region', { name: 'Mappe' }).getByText(`${t}.${m}.${j}`).first().waitFor();
  // Werkbank: Haken „Datum“ frei wählbar und an, Kurzform „(änderbar)“, Ausprobieren vorbelegt.
  await verwalten(s);
  await s.goto(BASIS + `/werkbank/ablaufvorlagen/${encodeURIComponent(vorlage.kennung)}`);
  const bearbeitung = s.getByRole('region', { name: 'Bearbeitung' });
  const fragen = bearbeitung.getByRole('group', { name: 'Fragt beim Anwenden' });
  const haken = fragen.getByRole('checkbox', { name: 'Datum' });
  await haken.waitFor();
  assert.ok(await haken.isChecked() && await haken.isEnabled(), 'bei „In“ frei wählbar und an');
  await bearbeitung.getByText('Läuft: In 14 Tagen (änderbar).').waitFor();
  // Ausprobieren (#1176): derselbe Dialog wie an der Mappe, als Probe, mit demselben Datum.
  const probe = await probeDialog(bearbeitung, vorlage.name);
  assert.equal(await probe.getByLabel('Am').inputValue(), inTagen(14), 'Ausprobieren wie der Dialog vorbelegt');
  for (const schema of ['light', 'dark']) {
    await s.emulateMedia({ colorScheme: schema });
    // Knöpfe wechseln ihre Fläche mit einem kurzen Übergang – erst danach messen (wie im Assistenten).
    await s.waitForTimeout(400);
    for (const v of await axePruefen(s, WERKBANK_BEREICHE)) funde.push(`Vorlage in der Werkbank (${schema}): ${v}`);
  }
  // Ohne Haken: fest – die Kurzform ohne „(änderbar)“ (nicht gespeichert).
  await haken.uncheck();
  await bearbeitung.getByText('Läuft: In 14 Tagen.').waitFor();
  assert.deepEqual(funde, [], `axe meldet Verstöße:\n${funde.join('\n')}`);
});

rauchtest('Suche: Vertragsart nicht in der allgemeinen Suche, mit gewähltem Typ schon, Haken im Mappentyp (#1220)', { als: LENA }, async (s) => {
  const { vertragsart } = daten.vorschlag;
  const funde = [];
  await s.goto(BASIS + '/ablage/start');
  const feld = s.getByRole('banner').getByRole('searchbox', { name: 'In deiner Ablage suchen' });
  await feld.fill('Kilometerleasing');
  await feld.press('Enter');
  await s.waitForURL(/volltext=Kilometerleasing/);
  const liste = s.getByRole('region', { name: 'Mappen' });
  await liste.getByText('Keine Treffer. Entferne eine Bedingung, um mehr zu finden.').waitFor();
  await liste.getByText('Nicht dabei: Vertragsart – wähle den Mappentyp, um darin zu suchen.').waitFor();
  for (const schema of ['light', 'dark']) {
    await s.emulateMedia({ colorScheme: schema });
    // Knöpfe wechseln ihre Fläche mit einem kurzen Übergang – erst danach messen (wie im Assistenten).
    await s.waitForTimeout(400);
    for (const v of await axePruefen(s, ABLAGE_BEREICHE)) funde.push(`Erweiterte Suche (${schema}): ${v}`);
  }
  await s.emulateMedia({ colorScheme: 'light' });
  // Mit gewähltem Mappentyp: gefunden.
  await s.goto(BASIS + '/ablage/suche?typ=vertragsart&volltext=Kilometerleasing');
  await liste.getByRole('link', { name: /Kilometerleasing/ }).first().waitFor();
  // Werkbank: Haken in den Grunddaten, abgewählt; Kurzinfo nennt es.
  await verwalten(s);
  await s.goto(BASIS + `/werkbank/typen/${vertragsart.id}`);
  const bearbeitung = s.getByRole('region', { name: 'Bearbeitung' });
  await bearbeitung.getByText('nicht in der allgemeinen Suche').first().waitFor();
  await s.locator('[data-sprungleiste]').getByRole('button', { name: 'Grunddaten' }).click();
  const haken = bearbeitung.getByRole('checkbox', { name: 'In der allgemeinen Suche zeigen' });
  await haken.waitFor();
  assert.equal(await haken.isChecked(), false);
  for (const schema of ['light', 'dark']) {
    await s.emulateMedia({ colorScheme: schema });
    // Knöpfe wechseln ihre Fläche mit einem kurzen Übergang – erst danach messen (wie im Assistenten).
    await s.waitForTimeout(400);
    for (const v of await axePruefen(s, WERKBANK_BEREICHE)) funde.push(`Mappentyp (${schema}): ${v}`);
  }
  assert.deepEqual(funde, [], `axe meldet Verstöße:\n${funde.join('\n')}`);
});

rauchtest('Handy: Dialog „Erinnere mich in 14 Tagen“ und erweiterte Suche mit 44-px-Tippflächen (#1180, #1220)', { handy: true, als: LENA }, async (s) => {
  const funde = [];
  await vorschlagDialog(s);
  await s.waitForLoadState('networkidle');
  for (const v of await tippflaechenPruefen(s, ['.spalte.mappe'])) funde.push(`Dialog an der Mappe: ${v}`);
  await s.goto(BASIS + '/ablage/suche?volltext=Kilometerleasing');
  await s.getByText('Nicht dabei: Vertragsart – wähle den Mappentyp, um darin zu suchen.').waitFor();
  await s.waitForLoadState('networkidle');
  for (const v of await tippflaechenPruefen(s, ABLAGE_BEREICHE)) funde.push(`Erweiterte Suche: ${v}`);
  assert.deepEqual(funde, [], `Zu kleine Tippflächen am Handy:\n${funde.join('\n')}`);
});

rauchtest('Handy: Vorlage und Mappentyp in der Werkbank mit 44-px-Tippflächen (#1180, #1220)', { handy: true, als: LENA }, async (s) => {
  const { vorlage, vertragsart } = daten.vorschlag;
  const funde = [];
  await s.goto(BASIS + '/ablage/start');
  await verwalten(s);
  await s.goto(BASIS + `/werkbank/ablaufvorlagen/${encodeURIComponent(vorlage.kennung)}`);
  await s.getByRole('group', { name: 'Fragt beim Anwenden' }).waitFor();
  await s.waitForLoadState('networkidle');
  for (const v of await tippflaechenPruefen(s, WERKBANK_BEREICHE)) funde.push(`Vorlage: ${v}`);
  await s.goto(BASIS + `/werkbank/typen/${vertragsart.id}`);
  await s.locator('[data-sprungleiste]').getByRole('button', { name: 'Grunddaten' }).click();
  await s.getByRole('checkbox', { name: 'In der allgemeinen Suche zeigen' }).waitFor();
  await s.waitForLoadState('networkidle');
  for (const v of await tippflaechenPruefen(s, WERKBANK_BEREICHE)) funde.push(`Mappentyp: ${v}`);
  assert.deepEqual(funde, [], `Zu kleine Tippflächen am Handy:\n${funde.join('\n')}`);
});
