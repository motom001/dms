/**
 * Rauchtests: Musterseite der Bausteine (#967), Baustein Knopf (#968, #1210), „+ Neu“ in Listen, Seiten-Hilfe (#985).
 * Allein starten (frisch gestartetes Ablago, siehe rauchtest.mjs): node web/rauchtest/bereiche/bausteine-und-knoepfe.mjs [fehlerordner] [musterordner]
 */
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { test } from 'node:test';
import '../einrichtung.mjs';
import { BASIS, browser, DESKTOP, LENA, MUSTERORDNER, rauchtest, verwalten, warteAufAblago } from '../hilfen.mjs';
import { musterAufnehmen } from '../muster.mjs';

/* ---------- Bausteine (#967) ---------- */

// Musterseite (nur im Testbau, VITE_MUSTER=1): hell und dunkel, Desktop und Handy fotografieren, mit axe-core prüfen –
// ohne Verstoß, ohne Fehler im Browser. Braucht keine Einrichtung und keine Daten.
// Seit #1210 mehr Bausteine und Zustände: Die Messung der Tippflächen am Handy braucht länger.
test('Musterseite der Bausteine: Bilder, axe ohne Verstoß (#967)', { timeout: 300_000 }, async () => {
  await warteAufAblago();
  await mkdir(MUSTERORDNER, { recursive: true });
  const fehler = [];
  const beobachte = (k) => {
    k.on('console', (m) => { if (m.type() === 'error') fehler.push(`Konsole: ${m.text()}`); });
    k.on('weberror', (e) => fehler.push(`Fehler in der Seite: ${e.error().message}`));
  };
  const { bilder, verstoesse } = await musterAufnehmen(browser, { basis: BASIS, ziel: MUSTERORDNER, beobachte });
  assert.equal(bilder.length, 30, `Bilder der Musterseite: ${bilder.join(', ')}`);
  assert.deepEqual(verstoesse, [], `axe meldet Verstöße auf der Musterseite:\n${verstoesse.join('\n')}`);
  assert.deepEqual(fehler, [], 'Fehler im Browser auf der Musterseite');
});

// Baustein Knopf (#968, #1011): Ein asynchroner Handler zeigt „läuft“ (aria-busy, Breite bleibt), danach das Ergebnis
// unter dem Knopf; ein Fehler landet am Knopf statt in der Konsole.
test('Baustein Knopf: läuft, Ergebnis und Fehler am Knopf (#968)', { timeout: 60_000 }, async () => {
  await warteAufAblago();
  const k = await browser.newContext({ ...DESKTOP, locale: 'de-DE' });
  const fehler = [];
  k.on('weberror', (e) => fehler.push(`Fehler in der Seite: ${e.error().message}`));
  try {
    const s = await k.newPage();
    await s.goto(BASIS + '/muster#knopf');
    const karte = s.locator('[data-zustand="knopf-ausprobieren"]');
    const pruefen = karte.getByRole('button', { name: 'Jetzt prüfen' });
    const breite = (await pruefen.boundingBox()).width;
    await pruefen.click();
    await karte.locator('button[aria-busy="true"]').waitFor();
    assert.equal(Math.round((await pruefen.boundingBox()).width), Math.round(breite), 'Der Knopf behält beim Laufen seine Breite');
    await pruefen.click({ force: true }); // zweiter Klick während „läuft“: darf nichts auslösen
    const gut = karte.locator('[role="status"][data-ergebnis="gut"]');
    await gut.waitFor();
    assert.equal(await karte.locator('[role="status"][data-ergebnis]').count(), 1, 'Ein Klick, ein Ergebnis');
    await karte.getByRole('button', { name: 'Verbindung testen' }).click();
    await karte.locator('[role="status"][data-ergebnis="schlecht"]').getByText('Der Server antwortet nicht').waitFor();
  } finally {
    await k.close();
  }
  assert.deepEqual(fehler, [], 'Fehler im Browser beim Knopf');
});

// Gefahr und gesperrt (#1210): Der Gefahr-Knopf stellt seine Rückfrage selbst (Fokus auf „Abbrechen“, Esc bricht ab,
// erst „Löschen“ handelt; rot gefüllt nur dort). Gesperrt aus einem Grund: Klick auf Knopf oder ⓘ öffnet die
// Erklärung am Knopf, Esc schließt sie und gibt den Fokus zurück, ein Klick daneben schließt sie.
test('Baustein Knopf: Gefahr mit Rückfrage, gesperrt mit Erklärung (#1210)', { timeout: 60_000 }, async () => {
  await warteAufAblago();
  const k = await browser.newContext({ ...DESKTOP, locale: 'de-DE' });
  const fehler = [];
  k.on('weberror', (e) => fehler.push(`Fehler in der Seite: ${e.error().message}`));
  try {
    const s = await k.newPage();
    await s.goto(BASIS + '/muster#knopf');
    const karte = s.locator('[data-zustand="knopf-ausprobieren"]');
    const loeschen = karte.getByRole('button', { name: 'Löschen' });
    assert.equal(await loeschen.getAttribute('aria-haspopup'), 'dialog');
    assert.equal(await s.locator('.knopf.gefahr, [data-knopf="entscheidung"]').filter({ visible: true }).count(), 1, 'rot gefüllt nur die stehende Rückfrage der Musterseite');
    await loeschen.click();
    const frage = s.getByRole('alertdialog', { name: 'Notiz löschen?' });
    await frage.waitFor();
    assert.equal(await s.evaluate(() => document.activeElement?.textContent), 'Abbrechen', 'Fokus startet auf „Abbrechen“');
    assert.equal(await frage.locator('[data-knopf="entscheidung"]').count(), 1, 'Bestätigung rot gefüllt');
    await s.keyboard.press('Escape');
    await frage.waitFor({ state: 'detached' });
    assert.equal(await karte.locator('[data-ergebnis]').count(), 0, 'Abbrechen handelt nicht');
    await loeschen.click();
    await frage.getByRole('button', { name: 'Löschen' }).click();
    await karte.locator('[role="status"][data-ergebnis="gut"]').getByText('Gelöscht').waitFor();

    // Gesperrt aus einem Grund: kein Satz in der Zeile, Erklärung auf Klick.
    const grund = s.locator('[data-zustand="knopf-grund"]');
    const abrufen = grund.getByRole('button', { name: 'Jetzt abrufen', exact: true });
    assert.equal(await abrufen.getAttribute('aria-disabled'), 'true');
    // Der Grund steht nur für Screenreader am Knopf (1 × 1 px), nicht als Satz in der Zeile.
    const satz = await grund.getByText('Erst speichern, dann abrufen.').boundingBox();
    assert.ok(!satz || satz.width <= 1, `Grund nicht als Satz in der Zeile (${JSON.stringify(satz)})`);
    // Mit der Tastatur (Playwright klickt nichts mit aria-disabled an – Menschen schon, das prüft der Klick aufs ⓘ).
    await abrufen.focus();
    await s.keyboard.press('Enter');
    const erklaerung = grund.getByRole('region', { name: 'Warum gesperrt? Jetzt abrufen' });
    await erklaerung.getByText('Erst speichern, dann abrufen.').waitFor();
    await s.keyboard.press('Escape');
    await erklaerung.waitFor({ state: 'detached' });
    assert.equal(await s.evaluate(() => document.activeElement?.textContent), 'Jetzt abrufen', 'Esc gibt den Fokus an den Knopf');
    await grund.getByRole('button', { name: 'Warum gesperrt? Jetzt abrufen' }).click();
    await erklaerung.waitFor();
    await s.locator('h1').click();
    await erklaerung.waitFor({ state: 'detached' });
  } finally {
    await k.close();
  }
  assert.deepEqual(fehler, [], 'Fehler im Browser bei Gefahr und gesperrt');
});

/* ---------- Knöpfe in Listen und Ergebnisse am Knopf (#989, #986) ---------- */

/**
 * Anlege-Knöpfe auf der Seite (#989): sichtbare Knöpfe und Wege, deren Text mit „+ Neu“ beginnt, und alles mit
 * data-knopf="anlegen". Rückgabe: Texte aller gefundenen und die ohne Knopfart „Anlegen“.
 */
async function anlegeKnoepfe(s) {
  return s.evaluate(() => {
    const sichtbar = (el) => el.getClientRects().length > 0;
    const text = (el) => el.textContent.replace(/\s+/g, ' ').trim();
    const alle = [...document.querySelectorAll('a, button, summary, [data-knopf="anlegen"]')].filter(sichtbar)
      .filter((el) => el.dataset.knopf === 'anlegen' || /^\+ ?Neu/.test(text(el)) || /^\+ /.test(text(el)));
    return { alle: alle.map(text), ohneArt: alle.filter((el) => el.dataset.knopf !== 'anlegen').map(text) };
  });
}

rauchtest('„+ Neu“ in Listen: überall Knopfart „Anlegen“ (#989)', { als: LENA }, async (s) => {
  const gefunden = [];
  const ohneArt = [];
  const pruefe = async (pfad) => {
    const r = await anlegeKnoepfe(s);
    gefunden.push(...r.alle.map((x) => `${pfad}: ${x}`));
    ohneArt.push(...r.ohneArt.map((x) => `${pfad}: ${x}`));
  };
  // Ablage: eine Ansicht mit „+ Neu“ und das Menü „+ Neu“ oben.
  await s.goto(BASIS + '/ablage/start');
  await s.getByRole('complementary', { name: 'Ansichten' }).getByRole('link', { name: /^Vertrag \d/ }).click();
  // Kopf der Ansicht (#1212): „+ <Typ>“ statt „+ Neu“.
  await s.getByRole('region', { name: 'Mappen' }).getByRole('link', { name: /^\+ Vertrag/ }).waitFor();
  await pruefe('Ablage → Vertrag');
  // Mein Konto: API-Schlüssel.
  for (const b of ['sicherheit', 'benachrichtigungen']) {
    await s.goto(BASIS + `/profil/${b}`);
    await s.getByRole('heading', { level: 1 }).first().waitFor();
    await s.waitForLoadState('networkidle');
    await pruefe(`Mein Konto → ${b}`);
  }
  // Werkbank: alle Listen mit „+ Neu“.
  await s.goto(BASIS + '/ablage/start');
  await verwalten(s);
  const elemente = s.getByRole('region', { name: 'Elemente' });
  for (const b of ['typen', 'sichten', 'benutzer', 'designs', 'automatisierungen', 'nummernkreise', 'postfaecher', 'auskuenfte', 'stempel']) {
    await s.goto(BASIS + `/werkbank/${b}`);
    await elemente.getByRole('heading', { level: 1 }).first().waitFor();
    await s.waitForLoadState('networkidle');
    await pruefe(`Werkbank → ${b}`);
  }
  assert.deepEqual(ohneArt, [], `Anlege-Knöpfe ohne Knopfart „Anlegen“:\n${ohneArt.join('\n')}`);
  // Die Erkennung selbst: In der Werkbank stehen mindestens Mappentypen, Ansichten, Benutzer und Designs.
  assert.ok(gefunden.filter((x) => x.startsWith('Werkbank')).length >= 4, `Zu wenige Anlege-Knöpfe gefunden: ${gefunden.join(' | ')}`);
  assert.ok(gefunden.some((x) => x.startsWith('Ablage')), 'Kein „+ Neu“ in der Ablage gefunden');
});

/* ---------- Seiten-Hilfe hinter der Überschrift (#985) ---------- */

/**
 * Hilfesymbole in den Seitenköpfen (#985): Texte der Köpfe (Beschreibung unter h1 bzw. Abschnitts-h2) enthalten kein
 * „?“ mehr – es steht direkt hinter der Überschrift. Rückgabe: Köpfe mit „?“ in der Überschrift und die mit „?“ im Text.
 */
async function kopfHilfen(s) {
  return s.evaluate(() => {
    const koepfe = [...document.querySelectorAll('.mappenkopf, .teilkopf, .listenkopf')].filter((k) => k.getClientRects().length > 0);
    const name = (k) => (k.querySelector('h1, h2')?.textContent ?? '').replace(/\s+/g, ' ').trim();
    return {
      inUeberschrift: koepfe.filter((k) => k.querySelector(':is(h1, h2) > .hilfesymbol')).map(name),
      imText: koepfe.filter((k) => [...k.querySelectorAll('.hilfesymbol')].some((h) => !h.parentElement?.matches('h1, h2'))).map(name),
    };
  });
}

// Alle Bereiche der Werkbank (shared/src/werkbankansicht.ts) und was die Leiste darüber hinaus zeigt, dazu Seiten, die
// erst beim Anlegen einen Kopf mit Beschreibung zeigen.
// Wiederherstellen (Abschnitt der Sicherung) antwortet außerhalb des Wartungsmodus mit 409 – das ist gewollt.
rauchtest('Werkbank: Hilfesymbol direkt hinter der Überschrift, nie im Text des Kopfs (#985)', { als: LENA, erwartet: [{ status: 409, pfad: /^\/api\/wiederherstellung\/sicherungen$/ }] }, async (s) => {
  await s.goto(BASIS + '/ablage/start');
  await verwalten(s);
  await s.waitForURL(/\/werkbank/);
  const bereiche = s.getByRole('complementary', { name: 'Bereiche' });
  await bereiche.getByRole('link').first().waitFor();
  const alle = ['pakete', 'typen', 'sichten', 'nummernkreise', 'automatisierungen', 'benutzer', 'verschluesselung', 'organisation', 'auskuenfte', 'loeschkonzept', 'loeschprotokoll',
    'aufbewahrung', 'stempel', 'postfaecher', 'eingangsordner', 'webdav', 'texterkennung', 'sicherung', 'vollexport', 'papierkorb',
    'betrieb', 'region', 'sprachen', 'aufgaben', 'anmeldeschutz', 'designs', 'anbindung', 'systemzustand', 'protokoll', 'fehlermeldungen', 'wartung', 'demo']
    .map((b) => `/werkbank/${b}`);
  const leiste = await bereiche.evaluate((b) => [...b.querySelectorAll('a[href^="/werkbank/"]')].map((a) => a.getAttribute('href').split(/[?#]/)[0]));
  const wege = [...new Set([...alle, ...leiste, '/werkbank/stempel/neu', '/werkbank/auskuenfte/neu'])];
  const imText = [];
  const mitHilfe = [];
  for (const weg of wege) {
    await s.goto(BASIS + weg);
    await s.getByRole('heading', { level: 1 }).first().waitFor();
    await s.waitForLoadState('networkidle');
    const r = await kopfHilfen(s);
    imText.push(...r.imText.map((x) => `${weg}: ${x}`));
    mitHilfe.push(...r.inUeberschrift.map((x) => `${weg}: ${x}`));
  }
  assert.deepEqual(imText, [], `Hilfesymbol im Text eines Seitenkopfs statt hinter der Überschrift:\n${imText.join('\n')}`);
  // Die Erkennung selbst: Eingangsordner, WebDAV und Stempel haben ihre Hilfe hinter der Überschrift.
  for (const weg of ['/werkbank/eingangsordner', '/werkbank/webdav', '/werkbank/stempel/neu']) {
    if (wege.includes(weg)) assert.ok(mitHilfe.some((x) => x.startsWith(`${weg}: `)), `Keine Hilfe hinter der Überschrift auf ${weg}: ${mitHilfe.join(' | ')}`);
  }
  assert.ok(wege.length >= 20, `Zu wenige Bereiche der Werkbank gefunden: ${wege.join(' ')}`);
});

// Eingangsordner (#986): „Jetzt prüfen“ steht unten im Block „Einstellungen“; das Ergebnis erscheint direkt unter dem
// Knopf – auch wenn die Seite dorthin gerollt ist –, nicht oben auf der Seite. Braucht einen Eingangsordner
// (DMS_EINGANG, im Workflow ein leerer Ordner).
rauchtest('Eingangsordner: „Jetzt prüfen“ – Ergebnis unter dem Knopf (#986)', { als: LENA }, async (s) => {
  await s.goto(BASIS + '/ablage/start');
  await verwalten(s);
  await s.goto(BASIS + '/werkbank/eingangsordner');
  const knopf = s.getByRole('button', { name: 'Jetzt prüfen' });
  await knopf.or(s.getByText('Es ist kein Eingangsordner eingebunden')).first().waitFor();
  assert.ok(await knopf.isVisible(), 'Kein Eingangsordner eingebunden – DMS_EINGANG auf einen vorhandenen Ordner setzen');
  await knopf.scrollIntoViewIfNeeded();
  const vorher = await s.evaluate(() => scrollY);
  await knopf.click();
  const ergebnis = s.locator('[role="status"][data-ergebnis]').filter({ hasText: /Geprüft|übernommen/ });
  await ergebnis.waitFor();
  const k = await knopf.boundingBox();
  const e = await ergebnis.boundingBox();
  assert.ok(e.y >= k.y + k.height - 1, `Ergebnis steht unter dem Knopf (Knopf unten ${k.y + k.height}, Ergebnis oben ${e.y})`);
  assert.ok(e.y - (k.y + k.height) < 80, 'Ergebnis steht direkt unter dem Knopf');
  assert.ok(e.y + e.height <= (s.viewportSize()?.height ?? 900) && e.y >= 0, 'Ergebnis ist zu sehen, ohne zu rollen');
  assert.ok(Math.abs((await s.evaluate(() => scrollY)) - vorher) < 200, 'Die Seite springt nicht');
  assert.equal(await s.locator('.einspaltig > .hinweis').filter({ hasText: /Geprüft – nichts/ }).count(), 0, 'Kein Ergebnis oben auf der Seite');
});
