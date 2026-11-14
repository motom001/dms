/**
 * Rauchtests: Werkbank: Mappentyp, Stempel, Sprungleiste, Notfallblatt, Sicherung; Rundgang und Abmelden.
 * Allein starten (frisch gestartetes Ablago, siehe rauchtest.mjs): node web/rauchtest/bereiche/werkbank.mjs [fehlerordner] [musterordner]
 */
import assert from 'node:assert/strict';
import '../einrichtung.mjs';
import { BASIS, benutzermenue, JONAS, LENA, rauchtest, verwalten } from '../hilfen.mjs';

rauchtest('Werkbank: Mappentyp bearbeiten (Felder)', { als: LENA }, async (s) => {
  await s.goto(BASIS + '/ablage/start');
  await verwalten(s);
  await s.getByRole('complementary', { name: 'Bereiche' }).getByRole('link', { name: /^Mappentypen/ }).click();
  await s.getByRole('link', { name: /^Vertrag \d+ Felder/ }).click();
  const bearbeitung = s.getByRole('region', { name: 'Bearbeitung' });
  await bearbeitung.getByRole('heading', { name: 'Vertrag', level: 1 }).waitFor();
  const felder = bearbeitung.getByRole('region', { name: 'Felder' });
  await felder.getByRole('button', { name: 'Felder' }).click();
  await felder.getByRole('button', { name: '+ Feld hinzufügen' }).click();
  await felder.getByRole('textbox', { name: 'Bezeichnung' }).fill('Kundenportal');
  await bearbeitung.getByRole('button', { name: 'Mappentyp speichern' }).click();
  await bearbeitung.getByRole('button', { name: 'Mappentyp speichern', disabled: true }).waitFor();
  await felder.getByRole('button', { name: /^Kundenportal kundenportal/ }).waitFor();
  // Das neue Feld steht im Formular der Mappen.
  await s.goto(BASIS + '/ablage/start');
  await s.getByRole('complementary', { name: 'Ansichten' }).getByRole('link', { name: /^Vertrag \d/ }).click();
  await s.getByRole('region', { name: 'Mappen' }).getByRole('link', { name: /Stromvertrag Haus/ }).first().click();
  await s.getByRole('region', { name: 'Mappe' }).getByRole('textbox', { name: 'Kundenportal' }).waitFor();
});

rauchtest('Werkbank: Stempel-Vorlage aus der Mitte öffnen (#990)', { als: LENA }, async (s) => {
  await s.goto(BASIS + '/ablage/start');
  await verwalten(s);
  await s.getByRole('complementary', { name: 'Bereiche' }).getByRole('link', { name: /^Stempel/ }).click();
  const elemente = s.getByRole('region', { name: 'Elemente' });
  await elemente.getByRole('link', { name: '+ Neu' }).waitFor();
  await elemente.getByRole('link', { name: /^Kopie für/ }).click();
  await s.waitForURL(/\/werkbank\/stempel\/kopie$/);
  const bearbeitung = s.getByRole('region', { name: 'Bearbeitung' });
  await bearbeitung.getByRole('heading', { name: /^Kopie für/, level: 1 }).waitFor();
  // Live-Vorschau (#799) und Speicherleiste rechts; bestehende Vorlagen öffnen zugeklappt mit Sprungleiste (#1000).
  await bearbeitung.getByRole('heading', { name: 'Vorschau' }).waitFor();
  await bearbeitung.getByRole('navigation', { name: 'Bereiche der Vorlage' }).getByRole('button', { name: 'Alle aufklappen' }).click();
  await bearbeitung.getByRole('textbox', { name: 'Name' }).fill('Kopie für Rauchtest');
  await bearbeitung.getByRole('button', { name: 'Vorlage speichern' }).click();
  await bearbeitung.locator('.hinweis.gut').getByText('Gespeichert.').waitFor();
  await elemente.getByRole('link', { name: /^Kopie für Rauchtest/ }).waitFor();
  // Alter Link mit ?offen=… führt auf die Vorlage rechts.
  await s.goto(BASIS + '/werkbank/stempel?offen=entwurf');
  await s.waitForURL(/\/werkbank\/stempel\/entwurf$/);
  await bearbeitung.getByRole('heading', { name: 'Entwurf', level: 1 }).waitFor();
});

// Editor rechts: Sprungleiste und Bereiche (#1000) – wie beim Mappentyp auch bei Nummernkreisen, Postfächern und Benutzern.
// „Alle aufklappen“ merkt sich das Gerät; ein Fehler beim Speichern markiert und öffnet den betroffenen Bereich.
rauchtest('Werkbank: Sprungleiste und Bereiche in allen Editoren (#1000)', { als: LENA, erwartet: [{ status: 422, pfad: /^\/api\/werkbank\/postfaecher$/ }] }, async (s) => {
  await s.goto(BASIS + '/ablage/start');
  await verwalten(s);
  const bearbeitung = s.getByRole('region', { name: 'Bearbeitung' });
  await s.goto(BASIS + '/werkbank/nummernkreise/archivnummer');
  const leiste = bearbeitung.getByRole('navigation', { name: 'Bereiche des Nummernkreises' });
  for (const name of ['Grunddaten', 'Stand', 'Aufkleber drucken', 'Verwendet in']) await leiste.getByRole('button', { name, exact: true }).waitFor();
  await leiste.getByRole('button', { name: 'Alle aufklappen' }).click();
  await bearbeitung.getByRole('textbox', { name: 'Name' }).waitFor();
  await s.reload();
  await bearbeitung.getByRole('textbox', { name: 'Name' }).waitFor();
  await leiste.getByRole('button', { name: 'Alle zuklappen' }).waitFor();
  // Tastatur: Enter auf einem Sprung setzt den Fokus auf den Kopf des Bereichs, Tab geht im Bereich weiter.
  await leiste.getByRole('button', { name: 'Stand', exact: true }).focus();
  await s.keyboard.press('Enter');
  await s.waitForFunction(() => document.activeElement?.id === 'stand-kopf', null, { timeout: 5000 });
  assert.equal(await s.evaluate(() => document.activeElement?.closest('[data-sprungleiste]') === null), true, 'Fokus nicht mehr in der Sprungleiste');
  // Neues Postfach: alles offen, ohne „Stand“; ohne Namen und Benutzer meldet der Server Grunddaten und Verbindung.
  await s.goto(BASIS + '/werkbank/postfaecher/neu');
  const pf = bearbeitung.getByRole('navigation', { name: 'Bereiche des Postfachs' });
  await pf.getByRole('button', { name: 'Abholen', exact: true }).waitFor();
  // An/aus als Schalter (#1188), nicht als Haken.
  await bearbeitung.getByRole('switch', { name: 'Automatischer Abruf' }).waitFor();
  assert.equal(await pf.getByRole('button', { name: 'Stand', exact: true }).count(), 0, 'Ein neues Postfach hat noch keinen Stand');
  await bearbeitung.getByRole('textbox', { name: 'Server' }).fill('imap.example.org');
  await s.getByRole('button', { name: 'Postfach anlegen' }).click();
  await pf.getByRole('button', { name: /^Grunddaten/ }).and(s.locator('[title="Grunddaten: Fehler"]')).waitFor();
  await pf.getByRole('button', { name: /^Verbindung/ }).and(s.locator('[title="Verbindung: Fehler"]')).waitFor();
  assert.equal(await pf.locator('[title="Abholen: Fehler"]').count(), 0, 'Abholen hat keinen Fehler');
  // Benutzer: die Bereiche aus dem Vorschlag in #1000.
  await s.goto(BASIS + '/werkbank/benutzer');
  await s.getByRole('region', { name: 'Elemente' }).getByRole('link', { name: /^Lena/ }).first().click();
  const bl = bearbeitung.getByRole('navigation', { name: 'Bereiche des Benutzers' });
  for (const name of ['Grunddaten', 'Rollen und Rechte', 'Vertretung', 'Anmeldung und Sicherheit']) await bl.getByRole('button', { name, exact: true }).waitFor();
  await bearbeitung.locator('.ueber', { hasText: /^Benutzer$/ }).waitFor();
});

// Wiederherstellen (Abschnitt der Sicherung) antwortet außerhalb des Wartungsmodus mit 409 – das ist gewollt.
rauchtest('Werkbank: Notfallblatt nur unter Verschlüsselung, Sicherung verweist dorthin (#993, #1193)', { als: LENA, erwartet: [{ status: 409, pfad: /^\/api\/wiederherstellung\/sicherungen$/ }] }, async (s) => {
  await s.goto(BASIS + '/ablage/start');
  await verwalten(s);
  await s.getByRole('complementary', { name: 'Bereiche' }).getByRole('link', { name: /^Sicherung/ }).click();
  const bearbeitung = s.getByRole('region', { name: 'Bearbeitung' });
  await bearbeitung.getByRole('heading', { name: 'Sicherung', level: 1 }).waitFor();
  assert.equal(await bearbeitung.getByRole('heading', { name: /^Notfallblatt/ }).count(), 0, 'kein Abschnitt Notfallblatt in der Sicherung');
  // #1193: In der Statuszeile nichts zum Notfallblatt (es ist aktuell), auch kein Handbuch-Link neben dem Hilfesymbol bei „Außer Haus“.
  assert.equal(await bearbeitung.getByText(/Notfallblatt heruntergeladen/).count(), 0, 'kein Datum des Notfallblatts in der Sicherung');
  assert.equal(await bearbeitung.getByRole('link', { name: /im Handbuch/ }).count(), 0, 'kein doppelter Handbuch-Link');
  await bearbeitung.getByRole('link', { name: 'Verschlüsselung', exact: true }).first().click();
  await s.waitForURL(/\/werkbank\/verschluesselung/);
  await bearbeitung.getByRole('heading', { name: /^Notfallblatt/ }).waitFor();
  await bearbeitung.getByText(/^Zuletzt heruntergeladen/).waitFor();
  await bearbeitung.getByRole('link', { name: 'Notfallblatt herunterladen (PDF)' }).waitFor();
});

// Sicherung herunterladen (#975): anlegen, „Herunterladen“ als Erstes in der Zeile, der Browser lädt die verschlüsselte
// Datei (Name mit Datum), darunter Hinweis auf das Notfallblatt, Größe und Prüfsumme.
rauchtest('Werkbank: Sicherung anlegen und herunterladen (#975)', { als: LENA, erwartet: [{ status: 409, pfad: /^\/api\/wiederherstellung\/sicherungen$/ }] }, async (s) => {
  await s.goto(BASIS + '/ablage/start');
  await verwalten(s);
  await s.getByRole('complementary', { name: 'Bereiche' }).getByRole('link', { name: /^Sicherung/ }).click();
  const bearbeitung = s.getByRole('region', { name: 'Bearbeitung' });
  await bearbeitung.getByRole('heading', { name: 'Sicherung', level: 1 }).waitFor();
  await bearbeitung.getByRole('button', { name: 'Jetzt sichern' }).click();
  const zeile = bearbeitung.locator('#liste tbody tr').first();
  const laden = zeile.getByRole('button', { name: 'Herunterladen' });
  await laden.waitFor({ timeout: 60_000 });
  const knoepfe = await zeile.locator('td').last().getByRole('button').allInnerTexts();
  assert.deepEqual(knoepfe.map((x) => x.trim()), ['Herunterladen', 'Prüfen', 'Löschen'], 'Herunterladen · Prüfen · Löschen');
  const [download] = await Promise.all([s.waitForEvent('download'), laden.click()]);
  assert.match(download.suggestedFilename(), /^\d{4}-\d{2}-\d{2}_\d{4}-manuell(-\d+)?\.dms-sicherung$/);
  assert.equal(await download.failure(), null);
  await bearbeitung.getByText('Zum Wiederherstellen brauchst du dein Notfallblatt (Schlüssel).').waitFor();
  await bearbeitung.getByText('Prüfsumme (SHA-256)').waitFor();
  await bearbeitung.getByRole('link', { name: '.json herunterladen' }).waitFor();
});

rauchtest('Rundgang beim ersten Anmelden und „Ablago entdecken“', {}, async (s) => {
  await s.goto(BASIS + '/');
  await s.getByLabel('E-Mail-Adresse').fill(JONAS.email);
  await s.getByLabel('Passwort', { exact: true }).fill(JONAS.passwort);
  await s.getByRole('button', { name: 'Anmelden', exact: true }).click();
  const rundgang = s.getByRole('dialog');
  await rundgang.getByText('Schritt 1 von 5').waitFor();
  for (let i = 2; i <= 5; i++) {
    await rundgang.getByRole('button', { name: 'Weiter' }).click();
    await rundgang.getByText(`Schritt ${i} von 5`).waitFor();
  }
  await rundgang.getByRole('button', { name: 'Fertig' }).click();
  await rundgang.waitFor({ state: 'detached' });
  await s.getByRole('heading', { name: 'Guten Tag, Jonas', level: 1 }).waitFor();
  // „Ablago entdecken“ im Benutzermenü: Tipps und der Rundgang zum Wiederholen.
  const menue = await benutzermenue(s, JONAS);
  await menue.getByRole('link', { name: 'Ablago entdecken' }).click();
  await s.getByRole('heading', { name: 'Ablago entdecken', level: 1 }).waitFor();
  await s.getByRole('region', { name: 'Tipps' }).getByRole('link').first().waitFor();
  await s.getByRole('region', { name: 'Rundgänge' }).getByRole('button', { name: 'Rundgang starten' }).click();
  await rundgang.getByText('Schritt 1 von 5').waitFor();
  await rundgang.getByRole('button', { name: 'Überspringen' }).click();
  await rundgang.waitFor({ state: 'detached' });
});

rauchtest('Abmelden', { als: LENA }, async (s) => {
  await s.goto(BASIS + '/ablage/start');
  await s.getByRole('heading', { name: 'Guten Tag, Lena', level: 1 }).waitFor();
  const menue = await benutzermenue(s, LENA);
  await menue.getByRole('button', { name: 'Abmelden' }).click();
  await s.getByRole('heading', { name: 'Anmelden' }).waitFor();
  // Die Sitzung ist wirklich weg: Die Ablage führt wieder zur Anmeldung.
  await s.goto(BASIS + '/ablage/start');
  await s.getByRole('heading', { name: 'Anmelden' }).waitFor();
});
