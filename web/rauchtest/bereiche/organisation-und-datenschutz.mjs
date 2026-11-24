/**
 * Rauchtests: Eigene Organisation mit der Nutzung (#1170, #1182, #1183), die Gruppe Datenschutz (#1184) und #1311: Name
 * „Datenschutz-Auskünfte“, Rollen überall als Mehrfachauswahl, Hinweis bei privater Nutzung, Esc in der Mehrfachauswahl.
 * Allein starten (frisch gestartetes Ablago, siehe rauchtest.mjs): node web/rauchtest/bereiche/organisation-und-datenschutz.mjs [fehlerordner] [musterordner]
 */
import assert from 'node:assert/strict';
import '../einrichtung.mjs';
import { api, BASIS, LENA, rauchtest, sitzung, verwalten } from '../hilfen.mjs';

/** Haken „beruflich“ setzen und mit der Speicherleiste der Seite speichern (#1182: eine Leiste für alles). */
async function beruflich(s, an) {
  const bearbeitung = s.getByRole('region', { name: 'Bearbeitung' });
  const haken = bearbeitung.getByRole('checkbox', { name: 'Die Ablage wird auch beruflich genutzt' });
  if ((await haken.isChecked()) === an) return;
  await haken.setChecked(an);
  await bearbeitung.getByRole('button', { name: 'Eigene Organisation speichern' }).click();
  await bearbeitung.getByText('Gespeichert. Mappen zeigen ab jetzt, was dazugehört.').waitFor();
}

// #1170: „Nutzung“ ist kein eigener Bereich mehr; der Haken steht oben auf „Eigene Organisation“ unter Einstellungen.
rauchtest('Werkbank: Nutzung oben auf „Eigene Organisation“, alte Adresse leitet um (#1170)', { als: LENA }, async (s) => {
  await s.goto(BASIS + '/ablage/start');
  await verwalten(s);
  await s.goto(BASIS + '/werkbank/nutzung');
  await s.waitForURL(/\/werkbank\/organisation#nutzung$/);
  const bereiche = s.getByRole('complementary', { name: 'Bereiche' });
  const bearbeitung = s.getByRole('region', { name: 'Bearbeitung' });
  await bearbeitung.getByRole('heading', { name: 'Eigene Organisation', level: 1 }).waitFor();
  assert.equal(await bereiche.getByRole('link', { name: 'Nutzung', exact: true }).count(), 0, 'kein eigener Bereich „Nutzung“');
  await bereiche.getByRole('link', { name: /^Eigene Organisation/ }).waitFor();
  // Privat: der Teil zur eigenen Organisation ist sichtbar, aber blass – mit dem Satz dazu.
  const hinweis = bearbeitung.getByText(/^Nur nötig, wenn die Ablage auch beruflich genutzt wird/);
  await hinweis.waitFor();
  assert.ok(await s.locator('#eigene-organisation.organisation-blass').isVisible());
  // Beruflich: nicht mehr blass; zurück auf privat.
  await beruflich(s, true);
  await s.locator('#eigene-organisation:not(.organisation-blass)').waitFor();
  assert.equal(await hinweis.count(), 0);
  await beruflich(s, false);
  await s.locator('#eigene-organisation.organisation-blass').waitFor();
});

// #1182: Rollen per Verweisfeld mit Mehrfachauswahl, Hinweis und Link zu den Rollen, übliche Speicherleiste, Verwendungen verlinkt.
rauchtest(
  'Eigene Organisation: Rollen als Mehrfachauswahl, eine Speicherleiste, Verwendungen verlinkt (#1182)',
  { als: LENA },
  async (s) => {
    await s.goto(BASIS + '/ablage/start');
    await verwalten(s);
    await s.goto(BASIS + '/werkbank/organisation');
    const bearbeitung = s.getByRole('region', { name: 'Bearbeitung' });
    const feld = bearbeitung.getByRole('combobox', { name: 'Welche Rollen „eigene Organisation“ setzen dürfen' });
    await feld.waitFor();
    await bearbeitung.getByText('Wer Ablago verwaltet, darf das immer.').waitFor();
    await bearbeitung.getByRole('link', { name: 'Rollen verwalten' }).waitFor();
    assert.equal(await bearbeitung.getByRole('checkbox', { name: 'Mitglied' }).count(), 0, 'keine Haken-Liste mehr');
    // Ohne Änderung ist „Speichern“ blass; nach einer Wahl aktiv, „Verwerfen“ nimmt sie zurück.
    const speichern = bearbeitung.getByRole('button', { name: 'Eigene Organisation speichern' });
    assert.equal(await speichern.isDisabled(), true);
    await feld.click();
    await feld.press('Enter');
    const entfernen = s.locator('#organisation-einstellungen').getByRole('button', { name: 'Entfernen' });
    await entfernen.first().waitFor();
    assert.equal(await speichern.isDisabled(), false);
    await bearbeitung.getByRole('button', { name: 'Änderungen verwerfen' }).click();
    await speichern.and(s.locator(':disabled')).waitFor();
    assert.equal(await entfernen.count(), 0);
    // Verwendungen führen in die Bereiche.
    await bearbeitung.getByRole('link', { name: /^Datenschutz-Auskünfte:/ }).waitFor();
    await bearbeitung.getByRole('link', { name: /^Löschkonzept:/ }).click();
    await s.waitForURL(/\/werkbank\/loeschkonzept$/);
  },
);

// #1183: Vorgaben der Auskünfte auf „Eigene Organisation“ – Anrede vor dem Text, Text folgt der Anrede, Zurücksetzen, Empfänger erklärt.
rauchtest('Eigene Organisation: Vorgaben der Auskünfte, Anrede zuerst, Text folgt der Anrede (#1183)', { als: LENA }, async (s) => {
  await s.goto(BASIS + '/ablage/start');
  await verwalten(s);
  await s.goto(BASIS + '/werkbank/auskuenfte/einstellungen');
  await s.waitForURL(/\/werkbank\/organisation#auskunft-vorgaben$/);
  const vorgaben = s.locator('#auskunft-vorgaben');
  await vorgaben.getByRole('heading', { name: 'Datenschutz-Auskünfte' }).waitFor();
  // Anrede steht vor „Rechte der Person“.
  await vorgaben.getByText('Anrede in Unterlagen für Dritte').waitFor();
  const anredeZuerst = await vorgaben.evaluate(
    (v) =>
      !!(v.querySelector('input[type="radio"]').compareDocumentPosition(v.querySelector('textarea')) & Node.DOCUMENT_POSITION_FOLLOWING),
  );
  assert.ok(anredeZuerst, 'Anrede steht vor „Rechte der Person“');
  await vorgaben.getByText(/^An wen die Daten der Person weitergegeben werden/).waitFor();
  // Der Text folgt der Anrede, solange er nicht von Hand geändert ist.
  const text = vorgaben.getByRole('textbox', { name: 'Rechte der Person' });
  const vorher = await text.inputValue();
  await vorgaben.getByRole('radio', { name: /^Sie/ }).check();
  const sie = await text.inputValue();
  assert.notEqual(sie, vorher, 'Text folgt der Anrede');
  // Von Hand geändert: folgt nicht mehr; „Auf Vorschlag zurücksetzen“ holt den Text zur Anrede.
  await text.fill(`${sie} Eigener Zusatz.`);
  await vorgaben.getByRole('radio', { name: /^du/ }).check();
  assert.equal(await text.inputValue(), `${sie} Eigener Zusatz.`);
  await vorgaben.getByRole('button', { name: 'Auf Vorschlag zurücksetzen' }).click();
  assert.equal(await text.inputValue(), vorher);
  assert.equal(await vorgaben.getByRole('button', { name: 'Auf Vorschlag zurücksetzen' }).count(), 0);
  // Gespeichert wird mit der Speicherleiste der Seite – hier ist nichts geändert.
  assert.equal(await s.getByRole('button', { name: 'Eigene Organisation speichern' }).isDisabled(), true);
});

// #1184: Gruppe „Datenschutz“, Löschprotokoll eigener Bereich, Löschkonzept aufgeräumt. Seit #1319 entscheidet nur die
// Stufe, ob die Gruppe in der Leiste steht – nicht mehr der Haken „beruflich“.
rauchtest('Werkbank: Gruppe Datenschutz, Löschprotokoll eigener Bereich, Löschkonzept aufgeräumt (#1184)', { als: LENA }, async (s) => {
  await s.goto(BASIS + '/ablage/start');
  await verwalten(s);
  const bereiche = s.getByRole('complementary', { name: 'Bereiche' });
  const bearbeitung = s.getByRole('region', { name: 'Bearbeitung' });
  // Stufe Haushalt (aus der Einrichtung): keine Gruppe Datenschutz in der Leiste – die Suche der Werkbank findet sie wie
  // jeden ausgeblendeten Bereich, die Seiten bleiben über ihre Adresse erreichbar.
  await s.goto(BASIS + '/werkbank/organisation');
  await bereiche.getByRole('link', { name: /^Eigene Organisation/ }).waitFor();
  for (const name of [/^Datenschutz-Auskünfte/, /^Löschkonzept/, /^Löschprotokoll/])
    assert.equal(await bereiche.getByRole('link', { name }).count(), 0, String(name));
  const suche = bereiche.getByRole('searchbox', { name: 'Bereiche der Werkbank durchsuchen' });
  await suche.fill('Löschprotokoll');
  await bereiche.getByRole('link', { name: /^Löschprotokoll/ }).waitFor();
  await suche.fill('');
  // Alte Adresse des Abschnitts führt auf den eigenen Bereich.
  await s.goto(BASIS + '/werkbank/loeschkonzept#loeschprotokoll');
  await s.waitForURL(/\/werkbank\/loeschprotokoll$/);
  await bearbeitung.getByRole('heading', { name: 'Löschprotokoll', level: 1 }).waitFor();
  await s.locator('#loeschprotokoll').waitFor();
  // Löschkonzept: Zusammenfassung oben, „ohne Personendaten“ zugeklappt; der Zustand bleibt nach dem Neuladen.
  await s.goto(BASIS + '/werkbank/loeschkonzept');
  await bearbeitung.getByText(/^(\d+ vollständig · \d+ mit Lücken|Noch kein Mappentyp mit Personendaten\.)$/).waitFor();
  await bearbeitung.getByRole('link', { name: 'Als PDF erzeugen' }).waitFor();
  const ohne = s.locator('#personendaten-ohne');
  await ohne.waitFor();
  assert.equal(await ohne.evaluate((d) => d.open), false, 'ohne Personendaten zugeklappt');
  await ohne.locator('summary').click();
  // Das toggle-Ereignis kommt verzögert; erst neu laden, wenn der Zustand gemerkt ist.
  await s.waitForFunction(() => Object.entries(localStorage).some(([k, v]) => k.includes('loeschkonzept') && v.includes('ohne')));
  await s.reload();
  await s.locator('#personendaten-ohne[open]').waitFor();
  await s.locator('#personendaten-ohne summary').click();
  assert.equal(await s.locator('#personendaten-ohne').evaluate((d) => d.open), false);
  // #1319: Beruflich ändert die Leiste nicht – die Stufe entscheidet; danach wieder privat. (Das Löschkonzept kann mit
  // Lücken als Warnung dastehen, wie jeder ausgeblendete Bereich mit Warnung – das gibt es nur bei beruflicher Nutzung.)
  await s.goto(BASIS + '/werkbank/organisation');
  await beruflich(s, true);
  await bereiche.getByRole('link', { name: /^Eigene Organisation/ }).waitFor();
  for (const name of [/^Datenschutz-Auskünfte/, /^Löschprotokoll/])
    assert.equal(await bereiche.getByRole('link', { name }).count(), 0, `beruflich, Stufe Haushalt: ${name}`);
  await beruflich(s, false);
});

/* ---------- #1311: Name, Rollen als Mehrfachauswahl, Hinweis bei privater Nutzung, Esc ---------- */

rauchtest(
  'Datenschutz bei privater Nutzung: Satz auf „Eigene Organisation“ und oben auf den drei Seiten (#1311)',
  { als: LENA },
  async (s) => {
    await s.goto(BASIS + '/ablage/start');
    await verwalten(s);
    const bearbeitung = s.getByRole('region', { name: 'Bearbeitung' });
    const satz =
      /^Die Ablage wird nicht beruflich genutzt – Auskünfte nennen deshalb keine eigene Organisation\. Die Gruppe „Datenschutz“ \(Datenschutz-Auskünfte, Löschkonzept, Löschprotokoll\) steht ab der Stufe „Selbständig“/;
    await s.goto(BASIS + '/werkbank/organisation');
    await s.locator('#nutzung').getByText(satz).waitFor();
    // Über die Adresse geöffnet: derselbe Satz oben, mit dem Weg zur Nutzung.
    for (const [weg, titel] of [
      ['/werkbank/auskuenfte', 'Datenschutz-Auskünfte'],
      ['/werkbank/loeschkonzept', 'Löschkonzept'],
      ['/werkbank/loeschprotokoll', 'Löschprotokoll'],
    ]) {
      await s.goto(BASIS + weg);
      await s
        .getByRole('heading', { name: titel, level: 1 })
        .or(s.getByRole('heading', { name: titel, level: 2 }))
        .first()
        .waitFor();
      await s.getByText(satz).waitFor();
    }
    await s.getByRole('link', { name: 'Zur Nutzung' }).click();
    await s.waitForURL(/\/werkbank\/organisation#nutzung$/);
    // Beruflich: kein Satz mehr, weder auf der Seite noch auf „Eigene Organisation“.
    await beruflich(s, true);
    await s.locator('#nutzung').getByText(satz).waitFor({ state: 'detached' });
    await s.goto(BASIS + '/werkbank/loeschprotokoll');
    await bearbeitung.getByRole('heading', { name: 'Löschprotokoll', level: 1 }).waitFor();
    assert.equal(await s.getByText(satz).count(), 0);
    await s.goto(BASIS + '/werkbank/organisation');
    await beruflich(s, false);
  },
);

rauchtest(
  'Rollen überall als Mehrfachauswahl: am Benutzer und an der Karte „Favoriten-Änderungen melden“ (#1311)',
  { als: LENA },
  async (s) => {
    const cookie = await sitzung(LENA);
    await api('POST', '/api/konto/verwaltung', { cookie, body: { passwort: LENA.passwort } });
    const auto = (
      await api('POST', '/api/werkbank/automatisierungen', {
        cookie,
        body: {
          name: 'Rauchtest Favoriten nach Rollen',
          aktiv: false,
          wenn: { art: 'favorit.geaendert', typ: null },
          dann: [{ id: 'f', art: 'favoriten' }],
        },
      })
    ).daten;
    await s.goto(BASIS + '/ablage/start');
    await verwalten(s);
    const bearbeitung = s.getByRole('region', { name: 'Bearbeitung' });
    // Am neuen Benutzer: Feld mit Vorschlägen statt Haken, darunter, wer ohnehin dazugehört.
    await s.goto(BASIS + '/werkbank/benutzer/neu');
    const rollen = bearbeitung.getByRole('combobox', { name: 'Rollen' });
    await rollen.waitFor();
    await bearbeitung.getByText('Die Rolle „Mitglied“ hat jeder ohnehin.').waitFor();
    assert.equal(await bearbeitung.locator('#rechte input[type="checkbox"]').count(), 0, 'keine Haken-Liste mehr');
    await rollen.click();
    await bearbeitung.getByRole('listbox', { name: 'Rollen' }).waitFor();
    // An der Dann-Karte: dasselbe Feld, ohne Wahl an alle.
    await s.goto(BASIS + `/werkbank/automatisierungen/${auto.id}`);
    // Editor mit Bereichen (#1000): alles aufklappen, dann die Karte öffnen.
    await bearbeitung.locator('[data-sprungleiste]').getByRole('button', { name: 'Alle aufklappen' }).click();
    await bearbeitung.getByRole('button', { name: 'Favoriten-Änderungen melden', exact: true }).click();
    const feld = bearbeitung.getByRole('combobox', { name: 'Nur an Mitglieder dieser Rollen' });
    await feld.waitFor();
    await bearbeitung.getByText(/^Keine Rolle gewählt: an alle\./).waitFor();
    await feld.click();
    await feld.press('Enter');
    await bearbeitung.locator('.mehrfachauswahl .gewaehlt li').first().waitFor();
    await api('DELETE', `/api/werkbank/automatisierungen/${auto.id}`, { cookie });
  },
);

// Esc in der Mehrfachauswahl (#1311): bei offener Liste schließt es nur sie – im Formular mit Speicherleiste.
rauchtest('Mehrfachauswahl: Esc schließt nur die Liste, erst das zweite Esc verwirft (#1311)', { als: LENA }, async (s) => {
  await s.goto(BASIS + '/ablage/start');
  await verwalten(s);
  await s.goto(BASIS + '/werkbank/organisation');
  const bearbeitung = s.getByRole('region', { name: 'Bearbeitung' });
  const feld = bearbeitung.getByRole('combobox', { name: 'Welche Rollen „eigene Organisation“ setzen dürfen' });
  const liste = bearbeitung.getByRole('listbox', { name: 'Welche Rollen „eigene Organisation“ setzen dürfen' });
  const speichern = bearbeitung.getByRole('button', { name: 'Eigene Organisation speichern' });
  const entfernen = s.locator('#organisation-einstellungen').getByRole('button', { name: 'Entfernen' });
  // Eine Änderung, dann wieder tippen: Die Liste ist offen.
  await feld.click();
  await feld.press('Enter');
  await entfernen.first().waitFor();
  await feld.fill('zz');
  await liste.waitFor();
  // Erstes Esc: nur die Liste zu; Fokus, Eingabe und Änderung bleiben, keine Rückfrage.
  await feld.press('Escape');
  await liste.waitFor({ state: 'detached' });
  assert.equal(await feld.evaluate((x) => x === document.activeElement), true, 'Fokus bleibt im Feld');
  assert.equal(await feld.inputValue(), 'zz', 'Eingabe bleibt');
  assert.equal(await speichern.isDisabled(), false, 'Änderung nicht verworfen');
  assert.equal(await s.locator('dialog[open]').count(), 0, 'keine Rückfrage');
  // Zweites Esc bei geschlossener Liste: wie überall – Rückfrage „Änderungen verwerfen?“.
  await feld.press('Escape');
  const frage = s.locator('dialog[open]');
  await frage.getByText('Änderungen verwerfen?').waitFor();
  await frage.getByRole('button', { name: 'Verwerfen', exact: true }).click();
  await speichern.and(s.locator(':disabled')).waitFor();
  assert.equal(await entfernen.count(), 0);
});
