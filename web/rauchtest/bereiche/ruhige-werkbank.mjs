/**
 * Rauchtests der QS-Runde 11/2026 für Navigation und Werkbank: ruhige Zahlen (#1287, Leitsatz 9), Werkbank-Übersicht
 * zweigeteilt (#1284), kleine Funde der Abnahme (#1271), ruhige Zeile des Verwaltungsmodus (#1252), Anlegen-Knöpfe mit
 * Gegenstand (#1296) und die Durchsicht der Werkbank-Seiten (#1290).
 * Allein starten (frisch gestartetes Ablago, siehe rauchtest.mjs): node web/rauchtest/bereiche/ruhige-werkbank.mjs [fehlerordner]
 */
import assert from 'node:assert/strict';
import '../einrichtung.mjs';
import { BASIS, LENA, rauchtest, schemaWechseln, verwalten } from '../hilfen.mjs';
import { axePruefen } from '../muster.mjs';

/** Zähler der Ablage (`GET /api/sichten`) umschreiben – z. B. leere Neue Post, ohne die Daten der anderen Tests zu ändern. */
async function zaehlerSetzen(s, aendern) {
  await s.route('**/api/sichten', async (r) => {
    if (r.request().method() !== 'GET') return r.fallback();
    const antwort = await r.fetch();
    const z = await antwort.json();
    aendern(z);
    await r.fulfill({ response: antwort, json: z });
  });
}

/* ---------- Ruhige Zahlen in der Navigation (#1287, Leitsatz 9) ---------- */

rauchtest('Navigation: Zahlen ruhig, Gelb nur für Warnungen, die 0 steht da (#1287)', { als: LENA }, async (s) => {
  await zaehlerSetzen(s, (z) => {
    z.eingang = 3;
    if (z.neuePost) z.sichten[z.neuePost] = 0;
  });
  await s.goto(BASIS + '/ablage/start');
  const leiste = s.getByRole('complementary', { name: 'Ansichten' }).locator('nav.sichtliste');
  const eintrag = (name) => leiste.getByRole('link', { name: new RegExp(`^${name}`) });
  // Zu erledigen wartet: fett in Textfarbe, für Screenreader mit Text – keine gelbe Pille.
  const erledigen = eintrag('Zu erledigen').locator('[data-zahl]');
  assert.equal(await erledigen.getAttribute('data-zahl'), 'wartet');
  assert.match((await eintrag('Zu erledigen').textContent()) ?? '', /3 warten auf dich/);
  // Leere Neue Post: „0“, leise grau.
  const post = eintrag('Neue Post').locator('[data-zahl]');
  assert.equal(await post.getAttribute('data-zahl'), 'menge');
  assert.equal((await post.textContent())?.trim(), '0');
  assert.equal(await leiste.locator('[data-zahl="warnung"]').count(), 0, 'Kein Gelb in der Navigation der Ablage');
  const funde = [];
  for (const schema of ['light', 'dark']) {
    await schemaWechseln(s, schema);
    for (const v of await axePruefen(s, ['.spalte.sichten'])) funde.push(`${schema}: ${v}`);
  }
  // Werkbank: Hinweise bleiben gelb (Übersicht), Mengen leise – auch die 0.
  await schemaWechseln(s, 'light');
  await verwalten(s);
  await s.goto(BASIS + '/werkbank');
  const wb = s.locator('nav.werkbankleiste');
  await wb.locator('a.sicht').nth(3).waitFor();
  assert.equal(
    await wb
      .getByRole('link', { name: /^Übersicht/ })
      .locator('[data-zahl]')
      .getAttribute('data-zahl'),
    'warnung',
  );
  assert.ok((await wb.locator('[data-zahl="menge"]').count()) > 0, 'Mengen in der Werkbank-Leiste');
  for (const schema of ['light', 'dark']) {
    await schemaWechseln(s, schema);
    for (const v of await axePruefen(s, ['.spalte.sichten'])) funde.push(`Werkbank ${schema}: ${v}`);
  }
  assert.deepEqual(funde, [], `axe in der Navigation:\n${funde.join('\n')}`);
});
