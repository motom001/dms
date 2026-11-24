/**
 * Rauchtests: Werkbank-Übersicht nach der Einrichtung – ein Hinweis „Empfohlene Pakete“ (#1511), Hinweise ohne
 * „Neu laden“ aktuell (#1513) und die Karte „Was Ablago darf“ (#1562). Läuft direkt nach der Einrichtung (ohne Pakete).
 * Allein starten (frisch gestartetes Ablago, siehe rauchtest.mjs): node web/rauchtest/bereiche/werkbank-uebersicht.mjs [fehlerordner]
 */
import assert from 'node:assert/strict';
import '../einrichtung.mjs';
import { BASIS, keineWaagerechteRolle, LENA, rauchtest, schemaWechseln, TABLET_HOCH, verwalten, WERKBANK_BEREICHE } from '../hilfen.mjs';
import { axePruefen } from '../muster.mjs';

/** Texte der offenen Hinweise in der Übersicht. */
const hinweisTexte = (s) =>
  s.locator('main').evaluate((m) => [...m.querySelectorAll('.uebersicht-hinweisliste > li > p')].map((p) => p.textContent.trim()));

async function zurUebersicht(s) {
  await s.goto(BASIS + '/ablage/start');
  await verwalten(s);
  await s.goto(BASIS + '/werkbank');
  await s.locator('.uebersicht-hinweise').waitFor();
}

rauchtest(
  'Werkbank-Übersicht: Neueinrichtung ohne Pakete – genau ein Paket-Hinweis „Empfohlene Pakete“ (#1511)',
  { als: LENA },
  async (s) => {
    await zurUebersicht(s);
    const texte = await hinweisTexte(s);
    const paket = texte.filter((x) => /Paket/.test(x));
    assert.equal(paket.length, 1, `genau ein Paket-Hinweis, nicht:\n${paket.join('\n')}`);
    assert.match(paket[0], /Empfohlene Pakete\./);
    assert.ok(!texte.some((x) => /jetzt ein Paket|wieder Text/.test(x)), 'kein Umstiegs-Hinweis nach einer Neueinrichtung');
    const hinweis = s.locator('.hinweiszeile', { hasText: 'Empfohlene Pakete.' });
    // Je Paket eine Zeile mit demselben Knopf, darunter der Weg zu allen Paketen; kein zweiter Hauptknopf.
    assert.equal(await hinweis.getByRole('link', { name: /^Installieren: / }).count(), 2);
    await hinweis.getByRole('link', { name: 'Alle Pakete ansehen' }).waitFor();
    // Reiner Hinweis (#1587): „Ausblenden“ statt „Zur Kenntnis nehmen“.
    await hinweis.getByRole('button', { name: 'Ausblenden' }).waitFor();
    const reihe = await hinweis.locator('.empfohlen-zeile').allTextContents();
    assert.match(reihe[0], /^Texterkennung – damit Scans durchsuchbar werden\./);
    assert.match(reihe[1], /^Benachrichtigungen – tägliche Zusammenfassung, Post für dich\./);
    // Gleiche Breite untereinander.
    const breiten = await hinweis
      .getByRole('link', { name: /^Installieren: / })
      .evaluateAll((l) => l.map((a) => Math.round(a.getBoundingClientRect().width)));
    assert.equal(breiten[0], breiten[1], `gleich breit: ${breiten.join(', ')}`);
    // Installieren führt in den Ablauf „Installieren per Link“ (ohne Internet hier nicht weiter verfolgt).
    assert.equal(
      await hinweis.getByRole('link', { name: 'Installieren: Texterkennung' }).getAttribute('href'),
      '/werkbank/pakete?installieren=texterkennung',
    );
  },
);

rauchtest('Werkbank-Übersicht: Hinweis erledigt, zurück – weg ohne „Neu laden“ (#1513)', { als: LENA }, async (s) => {
  const satz = 'Ein Werkzeug zum Bearbeiten von PDFs fehlt.';
  // Bis der Knopf geklickt ist, meldet der Server ein fehlendes Werkzeug; danach ist es „erledigt“.
  let fehlt = true;
  await s.route(/\/api\/werkbank\/uebersicht$/, async (r) => {
    if (r.request().method() !== 'GET') return r.fallback();
    const echt = await (await r.fetch()).json();
    await r.fulfill({ json: fehlt ? { ...echt, werkzeugeFehlen: ['qpdf'] } : echt });
  });
  await zurUebersicht(s);
  const hinweis = s.locator('.hinweiszeile', { hasText: satz });
  await hinweis.waitFor();
  await hinweis.getByRole('link', { name: 'Ansehen und erneut prüfen' }).click();
  await s.waitForURL(/\/werkbank\/systemzustand#werkzeuge$/);
  fehlt = false;
  // Zurück über die Navigation der Werkbank – nicht über „Neu laden“.
  await s.locator('a[data-anker="werkbank.bereich:uebersicht"]').first().click();
  await s.waitForURL(/\/werkbank$/);
  await hinweis.waitFor({ state: 'detached' });
  // Dasselbe beim Zurückholen des Tabs: wieder da, Tab vorn, wieder weg.
  fehlt = true;
  await s.getByRole('button', { name: 'Neu laden' }).click();
  await hinweis.waitFor();
  assert.equal(await s.getByRole('button', { name: 'Neu laden' }).getAttribute('title'), 'Hinweise und Stand neu laden');
  fehlt = false;
  await s.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await hinweis.waitFor({ state: 'detached' });
});

rauchtest('Werkbank-Übersicht: Ausblenden wirkt sofort, „Rückgängig“ und Begründung danach (#1587)', { als: LENA }, async (s) => {
  await zurUebersicht(s);
  const liste = s.locator('.uebersicht-hinweise');
  const hinweis = s.locator('.hinweiszeile', { hasText: 'Empfohlene Pakete.' });
  await hinweis.getByRole('button', { name: 'Ausblenden' }).click();
  // Sofort weg, ohne Formular; oben steht „Rückgängig“.
  await hinweis.waitFor({ state: 'detached' });
  const eben = liste.getByRole('status').filter({ hasText: 'Ausgeblendet.' });
  await eben.waitFor();
  assert.equal(await s.getByRole('textbox', { name: /Begründung/ }).count(), 0, 'kein Formular vorher');
  await eben.getByRole('button', { name: 'Rückgängig' }).click();
  await hinweis.waitFor();
  await eben.waitFor({ state: 'detached' });
  // Noch einmal – diesmal mit Begründung danach.
  await hinweis.getByRole('button', { name: 'Ausblenden' }).click();
  await eben.getByRole('button', { name: 'Begründung ergänzen' }).click();
  await eben.getByRole('textbox', { name: /Begründung/ }).fill('Testinstallation');
  // Mit offener Begründung bleibt der Hinweis stehen – Zeit für axe, hell und dunkel.
  const funde = [];
  for (const schema of ['light', 'dark']) {
    await schemaWechseln(s, schema);
    for (const v of await axePruefen(s, WERKBANK_BEREICHE)) funde.push(`${schema}: ${v}`);
  }
  await schemaWechseln(s, 'light');
  assert.deepEqual(funde, [], `axe an „Ausgeblendet“ mit Begründung:\n${funde.join('\n')}`);
  await eben.getByRole('button', { name: 'Begründung speichern' }).click();
  await eben.waitFor({ state: 'detached' });
  const akzeptiert = s.locator('.aufklappbereich.akzeptiert');
  await akzeptiert.getByRole('button', { name: /Bewusst akzeptiert \(1\)/ }).click();
  const zeile = akzeptiert.locator('li', { hasText: 'Empfohlene Pakete.' });
  await zeile.getByText('Begründung: Testinstallation', { exact: false }).waitFor();
  assert.equal(await zeile.getByRole('button', { name: 'Begründung ergänzen' }).count(), 0, 'mit Begründung kein „ergänzen“');
  // Aufräumen für die anderen Fälle: wieder einblenden.
  await zeile.getByRole('button', { name: 'Wieder einblenden' }).click();
  await hinweis.waitFor();
});

/* ---------- Was Ablago darf (#1562): Karte oben in der Übersicht ---------- */

const GERAETE = [
  ['PC', {}],
  ['iPad', { geraet: TABLET_HOCH }],
  ['Handy', { handy: true }],
];

for (const [name, geraet] of GERAETE)
  rauchtest(`Werkbank-Übersicht: Karte „Was Ablago darf“ – ${name}, hell und dunkel, axe (#1562)`, { als: LENA, ...geraet }, async (s) => {
    await zurUebersicht(s);
    const karte = s.getByRole('region', { name: 'Was Ablago darf' });
    await karte.waitFor();
    // Ganz oben: vor den Kacheln und den Hinweisen.
    assert.equal(await s.locator('.uebersicht > *').first().getAttribute('id'), 'was-ablago-darf');
    // Neue Installation: die empfohlenen Antworten, als zwei Sätze, ohne Stufennummern.
    const satz = (await karte.locator('p').first().textContent()).trim();
    assert.equal(satz, 'Ablago nutzt auch Helfer mit eigenem Code, die nur hier arbeiten. Von sich aus erkennt Ablago und legt euch vor.');
    assert.doesNotMatch(await karte.textContent(), /Stufe|\d/);
    await karte.getByRole('button', { name: 'Ändern …' }).click();
    const pakete = karte.getByRole('group', { name: 'Welche Pakete darf Ablago nutzen?' });
    const selbst = karte.getByRole('group', { name: 'Wie viel soll Ablago von sich aus tun?' });
    assert.equal(await pakete.getByRole('radio').count(), 4);
    assert.equal(await selbst.getByRole('radio').count(), 3);
    assert.ok(await pakete.getByRole('radio', { name: /Auch Helfer, die nur hier arbeiten/ }).isChecked());
    // Der Satz steht nur unter der gewählten Antwort; darunter „Das heißt für euch“.
    await pakete.getByText('Nichts verlässt Ablago.', { exact: false }).waitFor();
    assert.equal(await pakete.getByText('ohne eigenen Code', { exact: false }).count(), 0);
    await pakete.getByRole('radio', { name: /Nur Vorlagen/ }).check();
    await pakete.getByText('Pakete mit eigenem Code lassen sich nicht installieren.').waitFor();
    if (name === 'Handy') await keineWaagerechteRolle(s);
    const funde = [];
    for (const schema of ['light', 'dark']) {
      await schemaWechseln(s, schema);
      for (const v of await axePruefen(s, WERKBANK_BEREICHE)) funde.push(`${schema}: ${v}`);
    }
    assert.deepEqual(funde, [], `axe an der Karte „Was Ablago darf“:\n${funde.join('\n')}`);
    await karte.getByRole('button', { name: 'Abbrechen' }).click();
    await karte.getByRole('button', { name: 'Ändern …' }).waitFor();
  });

rauchtest('Werkbank-Übersicht: Was Ablago darf senken und wieder erhöhen (#1562)', { als: LENA }, async (s) => {
  await zurUebersicht(s);
  const karte = s.getByRole('region', { name: 'Was Ablago darf' });
  const aendern = async (pakete, selbst) => {
    await karte.getByRole('button', { name: 'Ändern …' }).click();
    await karte.getByRole('radio', { name: pakete }).check();
    await karte.getByRole('radio', { name: selbst }).check();
    await karte.getByRole('button', { name: 'Speichern' }).click();
    await karte.getByRole('button', { name: 'Ändern …' }).waitFor();
  };
  // Senken: ohne installierte Pakete gibt es nichts anzuhalten.
  await aendern(/Keine – nur Ablago selbst/, /Nichts von sich aus/);
  await karte.getByText('Ablago nutzt keine Pakete, nur seine eingebauten Helfer. Von sich aus tut Ablago nichts.').waitFor();
  // Wieder auf die Vorgabe: Erhöhen geht mit frischer Anmeldung (gerade angemeldet).
  await aendern(/Auch Helfer, die nur hier arbeiten/, /Erkennen und vorlegen/);
  await karte.getByText('Ablago nutzt auch Helfer mit eigenem Code, die nur hier arbeiten.', { exact: false }).waitFor();
});
