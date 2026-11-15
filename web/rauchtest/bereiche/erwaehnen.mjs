/**
 * Rauchtests: Erwähnen mit @ – alle Mappen (#889). Auswahl mit Mappentyp vor dem Titel, „Erwähnen“ in der Leiste,
 * Anzeige mit aktuellem Titel (gespeichert nur die Kennung, #1293), Hinweis „Erwähnt in …“ in der erwähnten Mappe; axe hell und dunkel, Tippflächen am Handy.
 * Allein starten (frisch gestartetes Ablago, siehe rauchtest.mjs): node web/rauchtest/bereiche/erwaehnen.mjs [fehlerordner] [musterordner]
 */
import assert from 'node:assert/strict';
import '../einrichtung.mjs';
import { api, BASIS, daten, LENA, rauchtest, schemaWechseln, sitzung } from '../hilfen.mjs';
import { axePruefen, tippflaechenPruefen } from '../muster.mjs';

/** Zwei Mappen: die eine erwähnt die andere – Ziel und Quelle mit eigenem Namen je Lauf. */
async function zweiMappen(zusatz) {
  const cookie = await sitzung(LENA);
  const neu = async (objekt) => (await api('POST', '/api/mappen', { cookie, body: { typId: daten.bausteine.id, werte: { objekt } } })).daten;
  return { ziel: await neu(`Erwähnziel ${zusatz}`), quelle: await neu(`Erwähnquelle ${zusatz}`), cookie };
}

/** Register „Notizen“ der Mappe öffnen. */
async function notizen(s, m) {
  await s.goto(BASIS + `/ablage/${daten.bausteine.id}/${m.id}`);
  await s.getByRole('tab', { name: /Notizen/ }).click();
  await s.locator('.notizregister').waitFor();
}

rauchtest('Erwähnen mit @: Mappe auswählen, aktueller Titel, Hinweis in der erwähnten Mappe (#889)', { als: LENA }, async (s) => {
  const { ziel, quelle, cookie } = await zweiMappen('Eins');
  await notizen(s, quelle);
  // „Erwähnen“ in der Leiste öffnet dieselbe Auswahl wie @.
  await s.getByRole('button', { name: 'Erwähnen' }).last().click();
  // Erst tippen, wenn das @ im Feld steht (sonst überschreibt das Einsetzen die ersten Zeichen).
  await s.waitForFunction(() => document.querySelector('#neue-notiz')?.value === '@');
  await s.keyboard.type('Erwähnziel Eins');
  const auswahl = s.getByRole('listbox', { name: 'Mappe oder Benutzer erwähnen' });
  const option = auswahl.getByRole('option', { name: /Kellerraum · Erwähnziel Eins/ });
  await option.waitFor();
  await option.click();
  assert.match(await s.locator('#neue-notiz').inputValue(), new RegExp(`@\\[Erwähnziel Eins\\]\\(mappe:${ziel.id}\\)`));
  await s.getByRole('button', { name: 'Notiz hinzufügen' }).click();
  // Angezeigt wird der aktuelle Titel – auch nach dem Umbenennen.
  await api('PUT', `/api/mappen/${ziel.id}`, { cookie, body: { werte: { objekt: 'Erwähnziel Eins neu' } } });
  await notizen(s, quelle);
  const link = s.locator('.notizliste').getByRole('link', { name: '@Erwähnziel Eins neu' });
  await link.waitFor();
  assert.match(await link.getAttribute('title'), /^Kellerraum: Erwähnziel Eins neu/);
  // Gespeichert ist nur die Kennung (#1293), der Titel kommt erst beim Anzeigen hinzu.
  const gespeichert = (await api('GET', `/api/mappen/${quelle.id}/notizen`, { cookie })).daten.map((n) => n.text);
  assert.deepEqual(gespeichert, [`@[](mappe:${ziel.id})`]);
  // In der erwähnten Mappe: ruhiger Hinweis oben im Register Notizen, mit Link zurück.
  await notizen(s, ziel);
  const hinweis = s.getByRole('list', { name: 'Hier erwähnt' });
  await hinweis.getByText(/^Erwähnt in einer Notiz bei/).waitFor();
  await hinweis.getByRole('link', { name: 'Erwähnquelle Eins' }).waitFor();
  const funde = [];
  for (const schema of ['light', 'dark']) {
    await schemaWechseln(s, schema);
    for (const v of await axePruefen(s, ['.erwaehnt-in'])) funde.push(`Hinweis (${schema}): ${v}`);
  }
  await notizen(s, quelle);
  await s.getByRole('button', { name: 'Erwähnen' }).last().click();
  await s.waitForFunction(() => document.querySelector('#neue-notiz')?.value === '@');
  await s.keyboard.type('Erwähnziel');
  await auswahl.getByRole('option').first().waitFor();
  for (const schema of ['light', 'dark']) {
    await schemaWechseln(s, schema);
    // Nur Auswahl und erwähnte Mappe: Die übrigen Werkzeuge der Leiste gehören nicht zu #889 (siehe Bericht).
    for (const v of await axePruefen(s, ['.wahlliste', '.notizliste .formatiert'])) funde.push(`Auswahl (${schema}): ${v}`);
  }
  assert.deepEqual(funde, [], `axe meldet Verstöße:\n${funde.join('\n')}`);
});

rauchtest('Handy: Erwähnen mit 44-px-Tippflächen (#889)', { handy: true, als: LENA }, async (s) => {
  const { ziel, quelle, cookie } = await zweiMappen('Zwei');
  await api('POST', `/api/mappen/${quelle.id}/notizen`, { cookie, body: { text: `Siehe @[Erwähnziel Zwei](mappe:${ziel.id})` } });
  await notizen(s, ziel);
  await s.getByRole('list', { name: 'Hier erwähnt' }).getByRole('link').first().waitFor();
  const funde = (await tippflaechenPruefen(s, ['.notizregister'])).map((v) => `Hinweis: ${v}`);
  await notizen(s, quelle);
  await s.locator('.notizliste').getByRole('link', { name: '@Erwähnziel Zwei' }).waitFor();
  // Erwähnungen im Text sind Verweise im Fließtext (WCAG 2.5.8, Ausnahme „Inline“): gemessen wird die Eingabe mit „Erwähnen“.
  for (const v of await tippflaechenPruefen(s, ['.neuenotiz'])) funde.push(`Eingabe: ${v}`);
  assert.deepEqual(funde, [], `Zu kleine Tippflächen am Handy:\n${funde.join('\n')}`);
});
