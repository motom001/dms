/**
 * Rauchtests: Eigene Organisation mit der Nutzung (#1170, #1182, #1183) und die Gruppe Datenschutz (#1184).
 * Allein starten (frisch gestartetes Ablago, siehe rauchtest.mjs): node web/rauchtest/bereiche/organisation-und-datenschutz.mjs [fehlerordner] [musterordner]
 */
import assert from 'node:assert/strict';
import '../einrichtung.mjs';
import { BASIS, LENA, rauchtest, verwalten } from '../hilfen.mjs';

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
rauchtest('Eigene Organisation: Rollen als Mehrfachauswahl, eine Speicherleiste, Verwendungen verlinkt (#1182)', { als: LENA }, async (s) => {
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
  const entfernen = bearbeitung.getByRole('button', { name: / entfernen$/ });
  await entfernen.first().waitFor();
  assert.equal(await speichern.isDisabled(), false);
  await bearbeitung.getByRole('button', { name: 'Verwerfen' }).click();
  await speichern.and(s.locator(':disabled')).waitFor();
  assert.equal(await entfernen.count(), 0);
  // Verwendungen führen in die Bereiche.
  await bearbeitung.getByRole('link', { name: /^Datenschutz-Auskünfte:/ }).waitFor();
  await bearbeitung.getByRole('link', { name: /^Löschkonzept:/ }).click();
  await s.waitForURL(/\/werkbank\/loeschkonzept$/);
});
