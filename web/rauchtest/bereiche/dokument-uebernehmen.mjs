/**
 * Rauchtests: Dokument übernehmen und Verweisfelder – Wege, die den gemeinsamen Zustand ändern (Post wird zur Mappe).
 * Allein starten (frisch gestartetes Ablago, siehe rauchtest.mjs): node web/rauchtest/bereiche/dokument-uebernehmen.mjs [fehlerordner] [musterordner]
 */
import assert from 'node:assert/strict';
import '../einrichtung.mjs';
import { api, BASIS, beispielPdf, daten, keineWaagerechteRolle, LENA, rauchtest, sitzung, verwalten } from '../hilfen.mjs';
import { axePruefen, tippflaechenPruefen } from '../muster.mjs';

/* ---------- Zum Schluss: Wege, die den gemeinsamen Zustand ändern ---------- */

/** Eigene Post für einen Test am Ende: Briefe als PDFs mit einer Zeile Text (die Textebene liest Ablago selbst). */
async function eigenePost(betreff, zeilen = [betreff]) {
  const cookie = await sitzung(LENA);
  const brief = (await api('POST', '/api/post', { cookie, body: { betreff } })).daten;
  for (const z of zeilen) await api('POST', `/api/mappen/${brief.id}/dokumente?register=dokumente&name=${encodeURIComponent(`${z.split('\n')[0]}.pdf`)}&typ=application/pdf`, { cookie, body: beispielPdf(z), roh: true });
  return brief;
}

rauchtest('Dokument übernehmen: Typ erkannt, Folgedokument abtrennen (#934)', { als: LENA }, async (s) => {
  // Steht am Ende: legt Post an und trennt ein Dokument als neue Post ab.
  const brief = await eigenePost('Werkstatt Kfz', ['Rechnung Werkstatt Beispiel 2027', 'Vertrag Leasing Kombi Beispiel 2027']);
  await s.goto(BASIS + `/ablage/eingang/${brief.id}`);
  // Auch von woanders geöffnet: weiter auf die Seite, unter „Neue Post“.
  await s.waitForURL(new RegExp(`/${brief.id}/uebernehmen$`));
  const mappe = s.getByRole('region', { name: 'Mappe' });
  // „Rechnung“ steht als Überschrift im ersten Dokument: vorgeschlagen, mit Grund.
  await mappe.getByText(/^Vorschlag, weil „Rechnung“ im Dokument steht/).waitFor();
  // Klassifizierung mehrstufig (#939): ein Vorschlag mit den Belegen der Wege – als gedrückter Chip, ohne Prozent (#1217).
  await mappe.getByText('Vorschlag – woran Ablago das erkennt:').waitFor();
  await mappe.getByRole('group', { name: 'Vorschläge' }).getByRole('button', { name: 'Rechnung', pressed: true }).waitFor();
  assert.equal(await mappe.getByText(/\d+ %/).count(), 0, 'Keine Prozente bei „Wohin gehört das?“ (#1217)');
  // Das zweite Dokument passt eher zu „Vertrag“: abtrennen.
  const dokument = s.getByRole('region', { name: 'Dokument' });
  await dokument.getByText('„Vertrag Leasing Kombi Beispiel 2027.pdf“ passt eher zu Vertrag.').waitFor();
  await dokument.getByRole('button', { name: 'Ab hier abtrennen und als neue Post in „Neue Post“ legen' }).click();
  await dokument.getByText('1 Dokument liegt jetzt als „Werkstatt Kfz (abgetrennt)“ in „Neue Post“.').waitFor();
  await dokument.getByRole('article', { name: 'Vertrag Leasing Kombi Beispiel 2027.pdf' }).waitFor({ state: 'detached' });
  // Text markieren (Textebene): Das zuletzt gewählte Feld übernimmt ihn.
  await mappe.getByRole('textbox', { name: 'Rechnungsnummer', exact: true }).click();
  const woerter = dokument.locator('.ue-wort');
  await woerter.nth(1).hover();
  await s.mouse.down();
  await woerter.nth(2).hover();
  await s.mouse.up();
  await s.waitForFunction(() => document.querySelector('#feld-rechnungsnummer')?.value === 'Werkstatt Beispiel');
  await dokument.getByText('„Werkstatt Beispiel“ steht jetzt in „Rechnungsnummer“.').waitFor();
});

rauchtest('Neue Post: Mappentyp wählen, ausfüllen, speichern – die Post wird zur Mappe (#936, #934)', { als: LENA }, async (s) => {
  const betreff = 'Schornsteinfeger 2027';
  const brief = await eigenePost(betreff);
  await s.goto(BASIS + `/ablage/start`);
  await s.getByRole('link', { name: /^Neue Post \d/ }).first().click();
  await s.getByRole('region', { name: 'Mappen' }).locator(`a[href$="/${brief.id}"]`).click();
  await s.waitForURL(new RegExp(`/${brief.id}/uebernehmen$`));
  const mappe = s.getByRole('region', { name: 'Mappe' });
  await mappe.getByRole('combobox', { name: 'Mappentyp suchen …' }).click();
  await mappe.getByRole('option', { name: /^Vertragspartner/ }).click();
  await mappe.getByText('Beim Speichern wandern Dokumente und Historie der Post hierher, die Post kommt in den Papierkorb.').waitFor();
  await mappe.getByRole('tab', { name: 'Stammdaten' }).click();
  await mappe.getByRole('textbox', { name: 'Name', exact: true }).fill('Schornsteinfeger Beispiel');
  await mappe.getByRole('heading', { name: 'Schornsteinfeger Beispiel', level: 1 }).waitFor();
  await mappe.getByRole('button', { name: 'Mappe anlegen' }).click();
  // Danach die nächste Post aus „Neue Post“ auf derselben Seite, oben mit Link zur neuen Mappe.
  await mappe.getByText(/ist angelegt, Dokumente und Historie der Post liegen dort/).waitFor();
  await s.waitForURL((u) => u.pathname.endsWith('/uebernehmen') && !u.pathname.includes(brief.id));
  await mappe.getByRole('link', { name: 'Schornsteinfeger Beispiel' }).click();
  await mappe.getByRole('heading', { name: 'Schornsteinfeger Beispiel', level: 1 }).waitFor();
  await mappe.getByRole('tab', { name: 'Dokumente 1' }).waitFor();
  // Die Post liegt im Papierkorb – aufgelöst, mit Link zur Mappe, ohne „Wiederherstellen“.
  await s.goto(BASIS + `/ablage/papierkorb/${brief.id}`);
  await s.getByText(/^Aufgelöst in Vertragspartner „Schornsteinfeger Beispiel“\. Dokumente und Historie liegen dort/).waitFor();
  await s.getByRole('link', { name: 'Schornsteinfeger Beispiel' }).first().waitFor();
  assert.equal(await s.getByRole('button', { name: 'Wiederherstellen' }).count(), 0);
});

rauchtest('Dokument übernehmen: in eine vorhandene Mappe legen, auch dann wird die Post aufgelöst (#934)', { als: LENA }, async (s) => {
  await s.goto(BASIS + `/ablage/start`);
  await s.getByRole('link', { name: /^Neue Post \d/ }).first().click();
  await s.getByRole('region', { name: 'Mappen' }).locator(`a[href$="/${daten.brief.id}"]`).click();
  await s.waitForURL(/\/uebernehmen$/);
  const mappe = s.getByRole('region', { name: 'Mappe' });
  // „Vorhandene Mappe“ (#1217): ohne vorherige Typwahl, Suche über alle Mappentypen; ohne Wahl ist der Hauptknopf blass.
  await mappe.getByRole('radio', { name: 'Vorhandene Mappe' }).click();
  assert.ok(await mappe.getByRole('button', { name: 'Zur Mappe legen' }).isDisabled(), 'Ohne Wahl ist „Zur Mappe legen“ blass');
  await mappe.getByRole('combobox', { name: 'Mappe suchen …' }).fill('Stromvertrag');
  await mappe.getByRole('option', { name: 'Stromvertrag Haus' }).click();
  // Kurzansicht der Mappe: Typ, Titel, Felder, wohin die Dokumente kommen.
  await mappe.locator('.ue-kurz').getByText('Vertragsnummer').waitFor();
  await mappe.getByText('Dokumente und Historie der Post wandern dorthin, die Post kommt in den Papierkorb.').waitFor();
  await mappe.getByRole('button', { name: 'Zu „Stromvertrag Haus“ legen' }).click();
  // Weiter mit der nächsten Post; oben der Link zum Vertrag.
  await mappe.getByText(/^Die Post liegt jetzt in Vertrag „Stromvertrag Haus“/).waitFor();
  await mappe.getByRole('link', { name: 'Stromvertrag Haus' }).click();
  await mappe.getByRole('heading', { name: 'Stromvertrag Haus', level: 1 }).waitFor();
  await mappe.getByRole('tab', { name: 'Vertragsunterlagen 1' }).waitFor();
  await s.goto(BASIS + `/ablage/papierkorb/${daten.brief.id}`);
  await s.getByText(/^Aufgelöst in Vertrag „Stromvertrag Haus“\. Dokumente und Historie liegen dort/).waitFor();
});

// #1217: „Wohin gehört das?“ mit Umschalter – Tastatur, Vorschläge für „Vorhandene Mappe“ aus dem Brief, „Nur erledigen“.
rauchtest('Dokument übernehmen: Vorhandene Mappe aus dem Brief, Nur erledigen, Tastatur im Umschalter (#1217)', { als: LENA }, async (s) => {
  // Ein eigener Mappentyp mit „Zum Wiederfinden nutzen“ (die Beispiele haben keinen) und eine Mappe, deren Nummer im Brief steht.
  const verwaltung = await sitzung(LENA);
  await api('POST', '/api/konto/verwaltung', { cookie: verwaltung, body: { passwort: LENA.passwort } });
  const gas = (await api('POST', '/api/typen', { cookie: verwaltung, body: { name: 'Gasanschluss', schluessel: 'gasanschluss', titelVorlage: '{objekt}',
    felder: [{ key: 'objekt', label: 'Objekt', typ: 'text', pflicht: true }, { key: 'anschlussnummer', label: 'Anschlussnummer', typ: 'text', wiederfinden: true }] } })).daten;
  await api('POST', '/api/mappen', { cookie: verwaltung, body: { typId: gas.id, werte: { objekt: 'Gasanschluss Keller', anschlussnummer: 'GA-2027-881' } } });
  const brief = await eigenePost('Abschlag Gas Beispiel', ['Abschlag Gas\nAnschlussnummer GA-2027-881']);
  await s.goto(BASIS + `/ablage/eingang/${brief.id}`);
  await s.waitForURL(new RegExp(`/${brief.id}/uebernehmen$`));
  const mappe = s.getByRole('region', { name: 'Mappe' });
  const wohin = mappe.getByRole('radiogroup', { name: 'Wohin gehört das?' });
  await wohin.getByRole('radio', { name: 'Neue Mappe', checked: true }).focus();
  // Pfeiltasten wählen im Umschalter (wie Optionsfelder).
  await s.keyboard.press('ArrowRight');
  await wohin.getByRole('radio', { name: 'Vorhandene Mappe', checked: true }).waitFor();
  await s.waitForFunction(() => document.activeElement?.getAttribute('aria-checked') === 'true' && document.activeElement?.textContent === 'Vorhandene Mappe');
  // Die Erkennung kennt den Gasanschluss (Anschlussnummer im Brief): Vorschlag als Chip, ohne vorherige Typwahl.
  await mappe.getByRole('group', { name: 'Vorschläge' }).getByRole('button', { name: 'Gasanschluss Keller · Gasanschluss' }).click();
  await mappe.locator('.ue-kurz').getByText('GA-2027-881').waitFor();
  await mappe.getByRole('button', { name: 'Zu „Gasanschluss Keller“ legen' }).waitFor();
  // „Nur erledigen“: ein Satz, ein Knopf „Erledigt“ – nichts wird gelöscht.
  await wohin.getByRole('radio', { name: 'Nur erledigen' }).click();
  await mappe.getByText('Nichts wird gelöscht. Die Post verschwindet aus „Neue Post“ und bleibt unter „Post“ mit Stand „Erledigt“.').waitFor();
  await mappe.getByRole('button', { name: 'Erledigt' }).click();
  await s.waitForURL((u) => !u.pathname.includes(brief.id));
  const nachher = (await api('GET', `/api/mappen/${brief.id}`, { cookie: await sitzung(LENA) })).daten;
  assert.match(JSON.stringify(nachher.mappe.werte.stand), /Erledigt/);
  assert.equal(nachher.dokumente.length, 1, 'Die Dokumente bleiben in der Post');
});

/** Die drei Wahlen auf „Dokument übernehmen“ (#1217) und worauf je Wahl gewartet wird. */
const UEBERNEHMEN_WAHLEN = [
  ['Neue Mappe', (m) => m.getByRole('combobox', { name: 'Mappentyp suchen …' }).waitFor()],
  ['Vorhandene Mappe', (m) => m.getByRole('combobox', { name: 'Mappe suchen …' }).waitFor()],
  ['Nur erledigen', (m) => m.getByRole('button', { name: 'Erledigt' }).waitFor()],
];

rauchtest('Dokument übernehmen aus Bausteinen: axe ohne Verstoß in allen drei Wahlen, hell und dunkel (#1217)', { als: LENA }, async (s) => {
  const brief = await eigenePost('Werbung Möbelhaus Beispiel', ['Werbung Möbelhaus Beispiel']);
  const funde = [];
  for (const schema of ['light', 'dark']) {
    await s.emulateMedia({ colorScheme: schema });
    await s.goto(BASIS + `/ablage/eingang/${brief.id}`);
    await s.waitForURL(new RegExp(`/${brief.id}/uebernehmen$`));
    const mappe = s.getByRole('region', { name: 'Mappe' });
    await s.getByRole('region', { name: 'Dokument' }).getByRole('img', { name: 'Seite 1' }).waitFor();
    for (const [wahl, warte] of UEBERNEHMEN_WAHLEN) {
      await mappe.getByRole('radio', { name: wahl }).click();
      await warte(mappe);
      await s.waitForLoadState('networkidle');
      for (const v of await axePruefen(s, ['.spalte.liste', '.spalte.mappe'])) funde.push(`${wahl} (${schema}): ${v}`);
    }
  }
  assert.deepEqual(funde, [], `axe meldet Verstöße:\n${funde.join('\n')}`);
});

rauchtest('Handy: Dokument übernehmen mit 44-px-Tippflächen in allen drei Wahlen (#1217)', { handy: true, als: LENA }, async (s) => {
  const brief = await eigenePost('Werbung Gartenmarkt Beispiel', ['Werbung Gartenmarkt Beispiel']);
  await s.goto(BASIS + `/ablage/eingang/${brief.id}`);
  await s.waitForURL(new RegExp(`/${brief.id}/uebernehmen$`));
  const mappe = s.getByRole('region', { name: 'Mappe' });
  // Am Handy stehen die drei Wahlen untereinander, keine ist abgeschnitten.
  await mappe.getByRole('radio', { name: 'Nur erledigen' }).waitFor();
  const breiten = await mappe.getByRole('radio').evaluateAll((l) => l.map((e) => e.scrollWidth <= e.clientWidth));
  assert.deepEqual(breiten, [true, true, true], 'Wahlen am Handy abgeschnitten');
  const funde = [];
  for (const [wahl, warte] of UEBERNEHMEN_WAHLEN) {
    await mappe.getByRole('radio', { name: wahl }).click();
    await warte(mappe);
    await s.waitForLoadState('networkidle');
    for (const v of await tippflaechenPruefen(s, ['.ue-kopf', '.ue-dokkopf', '.ue-wohin', '.ue-leiste'])) funde.push(`${wahl}: ${v}`);
  }
  await keineWaagerechteRolle(s);
  assert.deepEqual(funde, [], `Zu kleine Tippflächen am Handy:\n${funde.join('\n')}`);
});

// #935: Steht am Ende – legt einen Vertragspartner an. Die Mappe dahinter (aus der Post) bleibt ungespeichert offen.
rauchtest('Verweisfeld: „+ … anlegen“ im Fenster, mit Werten vom Dokument (#935)', { als: LENA }, async (s) => {
  const brief = await eigenePost('Heizungsbau Rechnung', ['Rechnung R-2027-55\nHeizungsbau Muster KG · Musterweg 1 · 01234 Musterstadt\nKundennummer K-4711']);
  await s.goto(BASIS + `/ablage/eingang/${brief.id}`);
  await s.waitForURL(new RegExp(`/${brief.id}/uebernehmen$`));
  const mappe = s.getByRole('region', { name: 'Mappe' });
  const dokument = s.getByRole('region', { name: 'Dokument' });
  await mappe.getByText(/^Vorschlag, weil „Rechnung“ im Dokument steht/).waitFor();
  await dokument.getByRole('img', { name: 'Seite 1' }).waitFor();
  const aussteller = mappe.locator('[data-anker="mappe.feld:aussteller"]');
  const anlegen = aussteller.getByRole('button', { name: '+ Vertragspartner anlegen' });
  // Abbrechen und Esc schließen ohne Änderung; danach steht der Fokus wieder am Verweisfeld.
  await anlegen.click();
  const fenster = s.getByRole('dialog', { name: 'Vertragspartner anlegen' });
  await fenster.getByRole('button', { name: 'Entwurf verwerfen' }).click();
  await fenster.waitFor({ state: 'detached' });
  await anlegen.click();
  await fenster.getByRole('textbox', { name: 'Name', exact: true }).waitFor();
  await s.waitForFunction(() => document.activeElement?.closest('[role="dialog"]'));
  await s.keyboard.press('Escape');
  await fenster.waitFor({ state: 'detached' });
  await s.waitForFunction(() => document.activeElement?.textContent === '+ Vertragspartner anlegen');
  // Wie die rechte Spalte einer Mappe: Kopf, Register, Felder, Speicherleiste – vorausgefüllt mit dem Briefkopf.
  await anlegen.click();
  await fenster.getByText('Neue Mappe').or(fenster.getByText('Heizungsbau Muster KG', { exact: true })).first().waitFor();
  await fenster.getByRole('tab', { name: 'Stammdaten' }).waitFor();
  await fenster.getByRole('button', { name: 'Mappe speichern' }).waitFor();
  const name = fenster.getByRole('textbox', { name: 'Name', exact: true });
  if (!(await name.inputValue())) await name.fill('Heizungsbau Muster KG');
  // Anklicken vom Dokument geht auch im Fenster: Feld wählen, Text markieren – er landet im Fenster.
  await fenster.getByRole('textbox', { name: 'Kundennummer' }).click();
  const wort = dokument.locator('.ue-wort').last();
  await wort.hover();
  await s.mouse.down();
  await s.mouse.up();
  await s.waitForFunction(() => document.querySelector('[role="dialog"] #feld-kundennummer')?.value === 'K-4711');
  await fenster.getByRole('button', { name: 'Mappe speichern' }).click();
  await fenster.waitFor({ state: 'detached' });
  // Im Feld steht die neue Mappe, mit kurzer Bestätigung; die Mappe dahinter ist noch nicht gespeichert.
  await aussteller.getByRole('link', { name: 'Heizungsbau Muster KG' }).waitFor();
  await aussteller.getByText('„Heizungsbau Muster KG“ angelegt und eingetragen.').waitFor();
  assert.match(s.url(), new RegExp(`/${brief.id}/uebernehmen$`));
  await mappe.getByText('Beim Speichern wandern Dokumente und Historie der Post hierher, die Post kommt in den Papierkorb.').waitFor();
});

// #886, #887: Steht am Ende – stellt im Mappentyp Rechnung ein, dass der Aussteller aus dem Vertrag folgt, und legt eine Rechnung an.
rauchtest('Verweisfeld folgt aus einem anderen; passt es nicht, sagt die Mappe womit (#886, #887)', { als: LENA }, async (s) => {
  // Im Mappentyp-Editor: Aussteller → „Folgt aus“ Vertrag, Angabe Vertragspartner.
  await s.goto(BASIS + '/ablage/start');
  await verwalten(s);
  await s.getByRole('complementary', { name: 'Bereiche' }).getByRole('link', { name: /^Mappentypen/ }).click();
  await s.getByRole('link', { name: /^Rechnung \d+ Felder/ }).click();
  const bearbeitung = s.getByRole('region', { name: 'Bearbeitung' });
  await bearbeitung.getByRole('heading', { name: 'Rechnung', level: 1 }).waitFor();
  const felder = bearbeitung.getByRole('region', { name: 'Felder' });
  await felder.getByRole('button', { name: 'Felder' }).click();
  await felder.getByRole('button', { name: /^Aussteller aussteller/ }).click();
  await felder.getByLabel('Folgt aus').selectOption({ label: 'Vertrag' });
  assert.equal(await felder.getByLabel('Angabe aus „Vertrag“').inputValue(), 'vertragspartner');
  await bearbeitung.getByRole('button', { name: 'Mappentyp speichern' }).click();
  await bearbeitung.getByRole('button', { name: 'Mappentyp speichern', disabled: true }).waitFor();
  await felder.getByText('folgt aus Vertrag').waitFor();
  await s.getByRole('button', { name: 'Verwaltung beenden' }).click();
  await s.getByRole('region', { name: 'Du verwaltest gerade Ablago.' }).waitFor({ state: 'detached' });
  const rechnung = (await api('GET', '/api/typen', { cookie: await sitzung(LENA) })).daten.find((x) => x.name === 'Rechnung');
  assert.deepEqual(rechnung.felder.find((f) => f.key === 'aussteller').folgtAus, { feld: 'vertrag', zielFeld: 'vertragspartner' });
  await s.goto(BASIS + `/ablage/${rechnung.id}/neu`);
  const mappe = s.getByRole('region', { name: 'Mappe' });
  await mappe.getByRole('heading', { name: 'Neue Mappe', level: 1 }).waitFor();
  await mappe.getByRole('textbox', { name: 'Rechnungsnummer', exact: true }).fill('R-2027-88');
  await mappe.getByLabel('Rechnungsdatum', { exact: true }).fill('2027-01-15');
  await mappe.getByRole('textbox', { name: 'Rechnungsbetrag', exact: true }).fill('120,00');
  // Vertrag gewählt → der Aussteller füllt sich und ist markiert.
  const vertrag = mappe.locator('[data-anker="mappe.feld:vertrag"]');
  await vertrag.getByRole('combobox').fill('Wartungsvertrag');
  await vertrag.getByRole('option', { name: 'Wartungsvertrag Heizung' }).click();
  const aussteller = mappe.locator('[data-anker="mappe.feld:aussteller"]');
  await aussteller.getByRole('link', { name: 'Heizungsbau Beispiel GmbH' }).waitFor();
  await aussteller.getByText('aus Vertrag').waitFor();
  // Von Hand etwas anderes: keine Sperre, aber die Frage, ob der Vertrag geleert werden soll – „Behalten“.
  await aussteller.getByRole('button', { name: 'Ändern' }).click();
  await aussteller.getByRole('combobox').fill('Stadtwerke');
  await aussteller.getByRole('option', { name: 'Stadtwerke Musterstadt' }).click();
  const frage = s.getByRole('alertdialog', { name: 'Vertrag leeren?' });
  await frage.getByText('Vertrag „Wartungsvertrag Heizung“ gehört zu „Heizungsbau Beispiel GmbH“, nicht zu „Stadtwerke Musterstadt“.').waitFor();
  await frage.getByRole('button', { name: 'Behalten' }).click();
  // Gelb am Feld, mit dem Grund statt „Filter“; Speichern geht trotzdem.
  await vertrag.getByText('passt nicht zu „Aussteller“').waitFor();
  await mappe.getByRole('button', { name: 'Mappe speichern' }).click();
  await mappe.getByRole('heading', { name: /^R-2027-88/, level: 1 }).waitFor();
  // Über den Registern die Zeile; ein Klick springt ins Register zum Feld.
  await mappe.getByRole('button', { name: 'Achtung: Vertrag passt nicht zu „Aussteller“.' }).click();
  await s.waitForFunction(() => document.activeElement?.closest('[data-anker="mappe.feld:vertrag"]'));
});
