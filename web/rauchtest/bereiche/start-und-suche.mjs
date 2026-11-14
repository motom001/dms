/**
 * Rauchtests: Anmelden, Startseite, Mappe anlegen und ändern, Suchfeld oben, Assistent, Verwaltungsmodus.
 * Allein starten (frisch gestartetes Ablago, siehe rauchtest.mjs): node web/rauchtest/bereiche/start-und-suche.mjs [fehlerordner] [musterordner]
 */
import assert from 'node:assert/strict';
import '../einrichtung.mjs';
import { api, BASIS, daten, LENA, mitFragen, mitHandbuch, rauchtest, sitzung, verwalten } from '../hilfen.mjs';

/* ---------- Desktop ---------- */

rauchtest('Anmelden und Startseite', {}, async (s) => {
  await s.goto(BASIS + '/');
  await s.getByRole('heading', { name: 'Anmelden' }).waitFor();
  await s.getByLabel('E-Mail-Adresse').fill(LENA.email);
  await s.getByLabel('Passwort', { exact: true }).fill(LENA.passwort);
  await s.getByRole('button', { name: 'Anmelden', exact: true }).click();
  await s.waitForURL(/\/ablage\/start$/);
  // #1219: ruhige Startseite – Begrüßung, Kacheln, Zuletzt geöffnet; der Assistent ist zu.
  await s.getByRole('heading', { name: 'Guten Tag, Lena', level: 1 }).waitFor();
  assert.equal(await s.getByRole('dialog', { name: 'Assistent' }).count(), 0, 'der Assistent öffnet sich nie von selbst');
  // Kacheln der Startseite: zwei Briefe in „Neue Post“.
  await s.getByRole('link', { name: /^Neue Post 2 Noch nicht zugeordnet/ }).waitFor();
  await s.getByRole('link', { name: /^Zu erledigen/ }).first().waitFor();
});

// #934: Neue Post öffnet die Seite „Dokument übernehmen“. Nur ansehen und ausfüllen – gespeichert wird am Ende der Datei.
rauchtest('Dokument übernehmen: Neue Post öffnen, Mappentyp wählen, Text vom Dokument übernehmen', { als: LENA }, async (s) => {
  await s.goto(BASIS + '/ablage/start');
  await s.getByRole('link', { name: /^Neue Post 2/ }).first().click();
  const liste = s.getByRole('region', { name: 'Mappen' });
  await liste.getByRole('heading', { name: /^Neue Post/, level: 1 }).waitFor();
  await liste.locator(`a[href$="/${daten.brief.id}"]`).click();
  // Links bleibt „Neue Post“ markiert, in der Mitte das Dokument mit „Post … von 2“, rechts „Wohin gehört das?“ mit dem
  // Umschalter (#1217), gewählt „Neue Mappe“.
  await s.waitForURL(new RegExp(`/${daten.brief.id}/uebernehmen$`));
  await s.getByRole('complementary', { name: 'Ansichten' }).locator('a.sicht.an', { hasText: 'Neue Post' }).waitFor();
  const dokument = s.getByRole('region', { name: 'Dokument' });
  await dokument.getByRole('heading', { name: 'Preisanpassung Strom 2027' }).waitFor();
  await dokument.getByText(/^Post [12] von 2$/).waitFor();
  await dokument.getByRole('img', { name: 'Seite 1' }).waitFor();
  const mappe = s.getByRole('region', { name: 'Mappe' });
  await mappe.getByRole('radiogroup', { name: 'Wohin gehört das?' }).getByRole('radio', { name: 'Neue Mappe', checked: true }).waitFor();
  // „Als Post öffnen“ steht oben im Kopf neben „Post … von 2“ (ein Weg, der aussieht wie ein Knopf).
  await dokument.getByRole('link', { name: 'Als Post öffnen' }).waitFor();
  const wohin = mappe.getByRole('combobox', { name: 'Mappentyp suchen …' });
  await wohin.click();
  await mappe.getByRole('option', { name: /^Vertrag Laufender Vertrag/ }).click();
  // Gewählt ist er auch unter „Vorschläge“ (Knopf, gedrückt).
  await mappe.getByRole('group', { name: 'Vorschläge' }).getByRole('button', { name: 'Vertrag', pressed: true }).waitFor();
  // Die Mappe darunter: Kopf mit Typ und Titel (aus dem Betreff), Felder, Speicherleiste mit Hinweis zur Post.
  await mappe.getByRole('heading', { name: 'Preisanpassung Strom 2027', level: 1 }).waitFor();
  await mappe.getByText('Beim Speichern wandern Dokumente und Historie der Post hierher, die Post kommt in den Papierkorb.').waitFor();
  await mappe.getByRole('button', { name: 'Mappe anlegen' }).waitFor();
  assert.equal(await mappe.getByText(/Kopie in der Post behalten/).count(), 0, 'Kein „Kopie in der Post behalten“ mehr (#1217)');
  assert.equal(await mappe.getByRole('button', { name: /Aus Dokument ausfüllen/ }).count(), 0, '„Aus Dokument ausfüllen“ steht hier nicht');
  // Der Betreff steht auch im Dokument: Rahmen 1 an der Fundstelle, die Nummer 1 am Feld „Bezeichnung“.
  const rahmen = dokument.getByRole('button', { name: 'Rahmen 1: Preisanpassung Strom 2027' });
  await rahmen.waitFor();
  await rahmen.hover();
  await mappe.locator('.feld.ue-hervor[data-anker="mappe.feld:bezeichnung"]').waitFor();
  // Feld wählen, dann den Rahmen anklicken: Das Feld übernimmt den Wert.
  await mappe.getByRole('textbox', { name: 'Vertragsnummer' }).click();
  await rahmen.click();
  await s.waitForFunction(() => document.querySelector('#feld-vertragsnummer')?.value === 'Preisanpassung Strom 2027');
  await dokument.getByText('„Preisanpassung Strom 2027“ steht jetzt in „Vertragsnummer“.').waitFor();
});

rauchtest('„+ Neu“: Mappe anlegen und speichern', { als: LENA }, async (s) => {
  await s.goto(BASIS + '/ablage/start');
  await s.getByRole('button', { name: '+ Neu' }).click();
  const menue = s.getByRole('banner').getByRole('menu');
  await menue.getByRole('menuitem', { name: /^Post/ }).waitFor();
  await menue.getByRole('menuitem', { name: 'Mappe …' }).click();
  await menue.getByRole('menuitem', { name: 'Vertragspartner' }).click();
  await s.waitForURL(/\/neu$/);
  const mappe = s.getByRole('region', { name: 'Mappe' });
  await mappe.getByRole('heading', { name: 'Neue Mappe', level: 1 }).waitFor();
  await mappe.getByRole('textbox', { name: 'Name', exact: true }).fill('Versicherung Beispiel AG');
  await mappe.getByRole('textbox', { name: 'Kundennummer' }).fill('K-2027-42');
  await mappe.getByRole('button', { name: 'Mappe speichern' }).click();
  await mappe.getByRole('heading', { name: 'Versicherung Beispiel AG', level: 1 }).waitFor();
  await s.waitForURL((u) => !u.pathname.endsWith('/neu'));
  // Nach dem Neuladen noch da.
  await s.reload();
  await mappe.getByRole('heading', { name: 'Versicherung Beispiel AG', level: 1 }).waitFor();
  assert.equal(await mappe.getByRole('textbox', { name: 'Kundennummer' }).inputValue(), 'K-2027-42');
});

rauchtest('Mappe öffnen, ändern und speichern', { als: LENA }, async (s) => {
  await s.goto(BASIS + '/ablage/start');
  await s.getByRole('complementary', { name: 'Ansichten' }).getByRole('link', { name: /^Vertrag \d/ }).click();
  await s.getByRole('region', { name: 'Mappen' }).getByRole('link', { name: /Wartungsvertrag Heizung/ }).first().click();
  const mappe = s.getByRole('region', { name: 'Mappe' });
  await mappe.getByRole('heading', { name: 'Wartungsvertrag Heizung', level: 1 }).waitFor();
  // „Änderungen verwerfen“ geht nur mit ungespeicherten Änderungen – daran sieht man, dass gespeichert ist.
  const verwerfen = (gesperrt) => mappe.getByRole('button', { name: 'Änderungen verwerfen', disabled: gesperrt }).waitFor();
  await verwerfen(true);
  await mappe.getByRole('textbox', { name: 'Vertragsnummer' }).fill('WV-2027-1');
  await verwerfen(false);
  await mappe.getByRole('button', { name: 'Mappe speichern' }).click();
  await verwerfen(true);
  await s.reload();
  await mappe.getByRole('heading', { name: 'Wartungsvertrag Heizung', level: 1 }).waitFor();
  assert.equal(await mappe.getByRole('textbox', { name: 'Vertragsnummer' }).inputValue(), 'WV-2027-1');
});

// #940: „Alle anzeigen ›“ neben „Zuletzt geöffnet“ öffnet die Liste der letzten 25 (#1219: ein Link); Ändern zählt wie
// Öffnen (der Vertrag aus dem Test davor).
rauchtest('Startseite: Liste „Zuletzt geöffnet“', { als: LENA }, async (s) => {
  await s.goto(BASIS + '/ablage/start');
  const zuletzt = s.getByRole('region', { name: 'Zuletzt geöffnet' });
  await zuletzt.getByRole('link', { name: 'Alle anzeigen ›' }).waitFor();
  assert.equal(await zuletzt.getByRole('link', { name: /anzeigen/ }).count(), 1, 'genau ein Link „Alle anzeigen ›“');
  await zuletzt.getByRole('link', { name: 'Alle anzeigen ›' }).click();
  await s.waitForURL(/\/ablage\/zuletzt$/);
  const liste = s.getByRole('region', { name: 'Mappen' });
  await liste.getByRole('heading', { name: /^Zuletzt geöffnet/, level: 1 }).waitFor();
  await liste.getByRole('link', { name: /Wartungsvertrag Heizung.*Vertrag · geöffnet/ }).first().click();
  await s.getByRole('region', { name: 'Mappe' }).getByRole('heading', { name: 'Wartungsvertrag Heizung', level: 1 }).waitFor();
  await liste.getByRole('link', { name: '← Start' }).click();
  await s.waitForURL(/\/ablage\/start$/);
});

// #1218: ein Suchfeld oben auf jeder Seite; Enter führt in die erweiterte Suche, die Treffer kommen sofort. Die
// Startseite hat kein eigenes Suchfeld mehr.
rauchtest('Suchfeld oben: Enter führt in die erweiterte Suche (#1218)', { als: LENA }, async (s) => {
  await s.goto(BASIS + '/ablage/start');
  await s.getByRole('heading', { name: 'Guten Tag, Lena', level: 1 }).waitFor();
  const mitte = s.getByRole('region', { name: 'Mappen' });
  await mitte.getByRole('region', { name: 'Zuletzt geöffnet' }).waitFor();
  assert.equal(await mitte.getByRole('searchbox').count(), 0, 'kein Suchfeld auf der Startseite');
  assert.equal(await mitte.getByRole('link', { name: 'Erweiterte Suche' }).count(), 0, 'kein Link „Erweiterte Suche“ auf der Startseite');
  // „/“ springt hinein – nicht aus einem Eingabefeld heraus.
  await s.keyboard.press('/');
  const feld = s.getByRole('banner').getByRole('searchbox', { name: 'In deiner Ablage suchen' });
  assert.ok(await feld.evaluate((e) => e === document.activeElement), '„/“ setzt den Fokus ins Suchfeld oben');
  await s.keyboard.type('Stadtwerke');
  await s.keyboard.press('Enter');
  await s.waitForURL(/\/ablage\/suche\?volltext=Stadtwerke$/);
  const liste = s.getByRole('region', { name: 'Mappen' });
  await liste.getByRole('link', { name: /Stadtwerke Musterstadt/ }).first().click();
  await s.getByRole('region', { name: 'Mappe' }).getByRole('heading', { name: 'Stadtwerke Musterstadt', level: 1 }).waitFor();
  // Esc leert das Feld; ohne Treffer ein ruhiger Satz statt einer leeren Seite.
  await feld.fill('Xylofonunterricht');
  await feld.press('Escape');
  assert.equal(await feld.inputValue(), '');
  await feld.fill('Xylofonunterricht');
  await feld.press('Enter');
  await s.waitForURL(/volltext=Xylofonunterricht/);
  await liste.getByText('Keine Treffer. Entferne eine Bedingung, um mehr zu finden.').waitFor();
});

// #1218: In einer Ansicht zeigt das Feld oben den Bereich als Chip und filtert die Liste beim Tippen; „×“ bzw. die
// Rücktaste sucht wieder in allem. Die Ansicht hat kein eigenes Suchfeld mehr; „Suchen in ▾“ mit drei Haken.
rauchtest('Suchfeld oben in einer Ansicht: Chip, Filtern, „Suchen in“ (#1218)', { als: LENA }, async (s) => {
  const typen = (await api('GET', '/api/typen', { cookie: await sitzung(LENA) })).daten;
  const vertrag = typen.find((x) => x.name === 'Vertrag');
  await s.goto(BASIS + `/ablage/${vertrag.id}`);
  const kopf = s.getByRole('banner');
  const feld = kopf.getByRole('searchbox', { name: 'Vertrag durchsuchen' });
  await kopf.getByText('in: Vertrag').waitFor();
  assert.equal(await s.getByRole('region', { name: 'Mappen' }).getByRole('searchbox').count(), 0, 'kein zweites Suchfeld in der Ansicht');
  const liste = s.getByRole('region', { name: 'Mappen' });
  await feld.fill('Wartungsvertrag');
  await liste.getByText(/^1 Treffer/).waitFor();
  // „Suchen in ▾“: Titel und Felder (immer), Text der Dokumente, Notizen; „Mehr Filter …“ in die erweiterte Suche.
  await kopf.getByRole('button', { name: /Suchen in/ }).click();
  const in_ = kopf.getByRole('group', { name: 'Suchen in' });
  assert.ok(await in_.getByRole('checkbox', { name: 'Titel und Felder' }).isDisabled());
  await in_.getByRole('checkbox', { name: 'Text der Dokumente' }).waitFor();
  await in_.getByRole('checkbox', { name: 'Notizen' }).waitFor();
  assert.match(await in_.getByRole('link', { name: 'Mehr Filter …' }).getAttribute('href'), /\/ablage\/suche\?typ=.+&volltext=Wartungsvertrag$/);
  await s.keyboard.press('Escape');
  // Rücktaste im leeren Feld nimmt den Bereich weg: Die Liste zeigt wieder alles, Enter führt in die erweiterte Suche.
  await feld.fill('');
  await feld.press('Backspace');
  const alle = kopf.getByRole('searchbox', { name: 'In deiner Ablage suchen' });
  await alle.waitFor();
  assert.equal(await kopf.getByText('in: Vertrag').count(), 0);
  await liste.getByText(/^\d+ Mappen?/).waitFor();
});

// #1219: Assistent unten rechts – öffnet sich nie von selbst; Fragen nur mit Antwort-Paket (im Rauchtest nur gemeldet,
// eine Frage stellt der Test nicht); Handbuch aus dem Suchverzeichnis des mitgelieferten Handbuchs (hier vorgegeben, weil
// der Rauchtest ohne gebaute Handbücher läuft); Fokus ins Fenster und zurück zum Knopf.

rauchtest('Assistent: Fragen · Tipps · Handbuch, Tastatur (#1219)', { als: LENA }, async (s) => {
  await mitFragen(s);
  await mitHandbuch(s);
  await s.goto(BASIS + '/ablage/start');
  const knopf = s.getByRole('button', { name: /^Assistent öffnen/ });
  await knopf.waitFor();
  assert.equal(await s.getByRole('dialog', { name: 'Assistent' }).count(), 0, 'öffnet sich nie von selbst');
  await knopf.focus();
  await s.keyboard.press('Enter');
  const fenster = s.getByRole('dialog', { name: 'Assistent' });
  await fenster.waitFor();
  assert.ok(await fenster.evaluate((e) => e.contains(document.activeElement)), 'der Fokus geht ins Fenster');
  const reiter = fenster.getByRole('radiogroup', { name: 'Assistent' });
  assert.deepEqual((await reiter.getByRole('radio').allTextContents()).map((x) => x.replace(/\s*\(neu\)$/, '')), ['Fragen', 'Tipps', 'Handbuch']);
  await fenster.getByRole('textbox', { name: 'Frag deine Ablage' }).waitFor();
  await fenster.getByText(/KI-Dienst des Pakets „KI-Assistent“/).waitFor();
  await reiter.getByRole('radio', { name: /^Tipps/ }).click();
  await fenster.getByRole('link', { name: 'Alle Tipps ansehen ›' }).waitFor();
  await reiter.getByRole('radio', { name: 'Handbuch' }).click();
  await fenster.getByText('Benutzerhandbuch – weil du in der Ablage bist').waitFor();
  await fenster.getByRole('searchbox', { name: 'Im Handbuch suchen' }).fill('übernehmen');
  const treffer = fenster.getByRole('link', { name: /Dokument übernehmen/ });
  assert.match(await treffer.getAttribute('href'), /^\/hilfe\/benutzer\/post\/#dokument-ubernehmen$/);
  assert.equal(await treffer.getAttribute('target'), '_blank');
  // Esc leert erst das Suchfeld, dann schließt es das Fenster; der Fokus kehrt zum Knopf zurück.
  await s.keyboard.press('Escape');
  await s.keyboard.press('Escape');
  await fenster.waitFor({ state: 'detached' });
  // Der Fokus kommt nach dem Abbau des Fensters zurück – darauf warten statt sofort zu prüfen.
  await s.waitForFunction(() => document.activeElement?.closest('[data-anker="assistent"]'), null, { timeout: 5000 })
    .catch(() => assert.fail('der Fokus kehrt zum Knopf zurück'));
  assert.ok(await knopf.evaluate((e) => e === document.activeElement), 'der Fokus kehrt zum Knopf zurück');
  // Das Gespräch und die Wahl bleiben beim Seitenwechsel; in der Werkbank sucht das Handbuch im Admin-Handbuch.
  await s.getByRole('link', { name: /^Zu erledigen/ }).first().click();
  await knopf.click();
  await fenster.getByText('Benutzerhandbuch – weil du in der Ablage bist').waitFor();
  await fenster.getByRole('button', { name: 'Assistent schließen' }).click();
});

rauchtest('Assistent ohne Antwort-Paket: nur Tipps · Handbuch (#1219)', { als: LENA }, async (s) => {
  await mitHandbuch(s);
  await s.goto(BASIS + '/ablage/start');
  await s.getByRole('button', { name: /^Assistent öffnen/ }).click();
  const reiter = s.getByRole('dialog', { name: 'Assistent' }).getByRole('radiogroup', { name: 'Assistent' });
  await reiter.waitFor();
  assert.deepEqual((await reiter.getByRole('radio').allTextContents()).map((x) => x.replace(/\s*\(neu\)$/, '')), ['Tipps', 'Handbuch']);
  assert.equal(await s.getByRole('textbox', { name: 'Frag deine Ablage' }).count(), 0);
});


rauchtest('Verwaltungsmodus betreten, Werkbank und Pakete', { als: LENA }, async (s) => {
  await s.goto(BASIS + '/ablage/start');
  await verwalten(s);
  await s.waitForURL(/\/werkbank/);
  const bereiche = s.getByRole('complementary', { name: 'Bereiche' });
  await bereiche.getByRole('link', { name: 'Pakete', exact: true }).click();
  const elemente = s.getByRole('region', { name: 'Elemente' });
  await elemente.getByRole('heading', { name: /^Pakete/, level: 1 }).first().waitFor();
  await elemente.getByRole('button', { name: 'Katalog abrufen' }).waitFor();
  // Menü „Mappe“ (#1039) lädt seine Einstellung selbst: erst abwarten – sonst trifft die Anfrage nach dem Ende des Modus
  // ein und bekommt 403.
  await s.locator('[data-anker="werkbank.mappenmenue"] input[type="checkbox"]:enabled').first().waitFor();
  // Zurück in die Ablage: Der rote Balken bleibt, bis man die Verwaltung beendet.
  await s.getByRole('button', { name: 'Verwaltung beenden' }).click();
  await s.getByRole('region', { name: 'Du verwaltest gerade Ablago.' }).waitFor({ state: 'detached' });
  await s.waitForURL(/\/ablage/);
});
