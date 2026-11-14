/**
 * Rauchtests: Werkbank → Daten sichern (Sicherung, Vollexport, Papierkorb) – #1169, #1195, #1196, #1197.
 * Baut auf werkbank.mjs auf (dort entsteht die erste Sicherung); allein gestartet legt der Test selbst welche an.
 */
import assert from 'node:assert/strict';
import '../einrichtung.mjs';
import { BASIS, LENA, rauchtest, verwalten } from '../hilfen.mjs';

// Wiederherstellen (Abschnitt der Sicherung) antwortet außerhalb des Wartungsmodus mit 409 – das ist gewollt.
const SICHERUNG_ERWARTET = [{ status: 409, pfad: /^\/api\/wiederherstellung\/sicherungen$/ }];

/** Werkbank → Sicherung öffnen; gibt den Bereich „Bearbeitung“ zurück. */
async function sicherungOeffnen(s) {
  await s.goto(BASIS + '/werkbank/sicherung');
  const bearbeitung = s.getByRole('region', { name: 'Bearbeitung' });
  await bearbeitung.getByRole('heading', { name: 'Sicherung', level: 1 }).waitFor();
  return bearbeitung;
}

/** „Jetzt sichern“ und warten, bis die Liste eine Zeile mehr hat. */
async function sichern(bearbeitung) {
  const zeilen = bearbeitung.locator('#liste tbody tr');
  const vorher = await zeilen.count();
  await bearbeitung.getByRole('button', { name: 'Jetzt sichern' }).click();
  await zeilen.nth(vorher).waitFor({ timeout: 60_000 });
  await bearbeitung.getByRole('button', { name: 'Jetzt sichern' }).waitFor({ timeout: 60_000 });
}

// Mehrere Sicherungen auswählen und mit einer Rückfrage löschen (#1169): die neueste ist geschützt, die Rückfrage nennt
// Anzahl und Platz, danach ist die gewählte weg. Über der Liste der Hinweis auf die Aufbewahrung.
rauchtest('Werkbank: Sicherungen auswählen und gemeinsam löschen (#1169)', { als: LENA, erwartet: SICHERUNG_ERWARTET }, async (s) => {
  await s.goto(BASIS + '/ablage/start');
  await verwalten(s);
  const bearbeitung = await sicherungOeffnen(s);
  await bearbeitung.getByText(/räumt Ablago selbst weg/).waitFor();
  await bearbeitung.getByRole('link', { name: 'Aufbewahrung ändern' }).waitFor();
  const zeilen = bearbeitung.locator('#liste tbody tr');
  while ((await zeilen.count()) < 3) await sichern(bearbeitung);
  const anzahl = await zeilen.count();
  // Die neueste (noch keine geprüft) ist geschützt: Haken gesperrt, „geschützt“ in der Zeile.
  await zeilen.first().getByText('geschützt').waitFor();
  assert.equal(await zeilen.first().getByRole('checkbox').isDisabled(), true, 'neueste nicht wählbar');
  // „Alle auswählen“ wählt alle außer der geschützten.
  await bearbeitung.getByLabel('Alle auswählen').check();
  await bearbeitung.getByRole('button', { name: `Ausgewählte löschen (${anzahl - 1})` }).waitFor();
  await bearbeitung.getByLabel('Alle auswählen').uncheck();
  // Zwei wählen und gemeinsam löschen.
  await zeilen.nth(1).getByRole('checkbox').check();
  await zeilen.nth(2).getByRole('checkbox').check();
  await bearbeitung.getByRole('button', { name: 'Ausgewählte löschen (2)' }).click();
  const frage = s.getByRole('alertdialog', { name: '2 Sicherungen löschen?' });
  await frage.getByText(/Frei werden etwa/).waitFor();
  await frage.getByRole('button', { name: 'Endgültig löschen' }).click();
  await bearbeitung.getByText('2 Sicherungen gelöscht.').waitFor({ timeout: 30_000 });
  assert.equal(await zeilen.count(), anzahl - 2);
  await zeilen.first().getByText('geschützt').waitFor();
});

// Vollexport mit Prüfsummen (#1195): erst „Prüfsummen (SHA256SUMS)“, dann „ZIP herunterladen“ mit Hinweis aufs Löschen;
// nach dem Herunterladen bleibt der Eintrag mit der SHA-256 der ZIP stehen – ohne Neuladen der Seite.
rauchtest('Werkbank: Vollexport mit Prüfsummen, Eintrag bleibt nach dem Herunterladen (#1195)', { als: LENA }, async (s) => {
  await s.goto(BASIS + '/ablage/start');
  await verwalten(s);
  await s.goto(BASIS + '/werkbank/vollexport');
  const bearbeitung = s.getByRole('region', { name: 'Bearbeitung' });
  await bearbeitung.getByRole('heading', { name: 'Vollexport', level: 1 }).waitFor();
  await bearbeitung.getByRole('button', { name: 'Export starten' }).click();
  const eintrag = bearbeitung.locator('#exporte li').first();
  await eintrag.getByRole('link', { name: 'ZIP herunterladen' }).waitFor({ timeout: 90_000 });
  const knoepfe = (await eintrag.locator('.knoepfe').first().locator('a, button').allInnerTexts()).map((x) => x.trim());
  assert.deepEqual(knoepfe.slice(0, 2), ['Prüfsummen (SHA256SUMS)', 'ZIP herunterladen'], 'Prüfsummen vor der ZIP');
  await eintrag.getByText(/wird der Export auf dem Server gelöscht/).waitFor();
  const summen = await Promise.all([s.waitForEvent('download'), eintrag.getByRole('link', { name: 'Prüfsummen (SHA256SUMS)' }).click()]).then(([d]) => d);
  assert.match(summen.suggestedFilename(), /SHA256SUMS$/);
  const zip = await Promise.all([s.waitForEvent('download'), eintrag.getByRole('link', { name: 'ZIP herunterladen' }).click()]).then(([d]) => d);
  assert.equal(await zip.failure(), null);
  await eintrag.getByText(/^Heruntergeladen am .* und auf dem Server gelöscht/).waitFor({ timeout: 30_000 });
  assert.match(await eintrag.locator('dd.mono').innerText(), /^[0-9a-f]{64}$/);
  await eintrag.getByRole('link', { name: 'Prüfsummen (SHA256SUMS)' }).waitFor();
  await eintrag.getByRole('button', { name: 'Prüfsumme kopieren' }).waitFor();
});
