/**
 * Rauchtests: Werkbank → Rundgänge (#941) und Tipps (#942).
 * Allein starten (frisch gestartetes Ablago, siehe rauchtest.mjs): node web/rauchtest/bereiche/rundgaenge-und-tipps.mjs [fehlerordner] [musterordner]
 */
import assert from 'node:assert/strict';
import '../einrichtung.mjs';
import {
  api,
  BASIS,
  daten,
  keineWaagerechteRolle,
  LENA,
  rauchtest,
  schemaWechseln,
  sitzung,
  verwalten,
  WERKBANK_BEREICHE,
} from '../hilfen.mjs';
import { axePruefen, tippflaechenPruefen } from '../muster.mjs';

const EIGENER = `schluessel: rauchtest
titel: Rauchtest-Rundgang
beschreibung: Zeigt das Suchfeld.
schritte:
  - schluessel: suche
    ziel: startseite.suche
    ort: Oben in der Kopfzeile
    titel: Suchen
    text: Hier suchst du in allen Mappen.
`;

rauchtest('Werkbank → Rundgänge: Liste, Prüfen mit Zeile, eigenen speichern, an/aus (#941)', { als: LENA, timeout: 110_000 }, async (s) => {
  const funde = [];
  await s.goto(BASIS + '/ablage/start');
  await verwalten(s);
  await s.goto(BASIS + '/werkbank/rundgaenge');
  const liste = s.getByRole('region', { name: 'Elemente' });
  // Ablagos eigener Rundgang steht in der Liste, mit Start und Herkunft.
  const ablago = liste.getByRole('link', { name: /Deine Ablage im Überblick.*beim ersten Besuch der Seite/ });
  await ablago.waitFor();
  await ablago.click();
  const bearbeitung = s.getByRole('region', { name: 'Bearbeitung' });
  await bearbeitung.getByRole('switch', { name: 'Rundgang für alle' }).waitFor();
  // Ausprobieren (#1533): Ablagos Rundgang startet „nur für mich“ im eigenen Fenster, ohne Fehler wegen „erste_anmeldung“.
  // Am Ende schließt sich das Fenster wieder („Fertig – zurück zum Entwurf“).
  const [probe] = await Promise.all([s.waitForEvent('popup'), bearbeitung.getByRole('button', { name: 'Ausprobieren' }).click()]);
  const karte = probe.getByRole('dialog');
  await karte.waitFor();
  const fertig = karte.getByRole('button', { name: 'Fertig – zurück zum Entwurf' });
  for (let i = 0; i < 9 && !(await fertig.isVisible()); i++) await karte.getByRole('button', { name: 'Weiter' }).click();
  await Promise.all([probe.waitForEvent('close'), fertig.click()]);
  assert.equal(await bearbeitung.locator('.hinweis.schlecht').count(), 0, 'Ausprobieren ohne Fehlermeldung');
  // Knöpfe (#1533): Hauptknopf unten rechts, gleich hoch wie „Ausprobieren“.
  const kopieren = bearbeitung.getByRole('button', { name: 'Als eigenen kopieren' });
  const hoehen = await Promise.all([kopieren, bearbeitung.getByRole('button', { name: 'Ausprobieren' })].map((k) => k.boundingBox()));
  assert.equal(Math.round(hoehen[0].height), Math.round(hoehen[1].height), 'Haupt- und Nebenknopf gleich hoch');
  assert.ok(hoehen[0].x > hoehen[1].x, 'Hauptknopf rechts');
  // „Als eigenen kopieren“ legt die Kopie gleich an: ausgeschaltet, eigener Editor.
  await kopieren.click();
  await s.waitForURL(/\/werkbank\/rundgaenge\/eigen%3Aablago$/);
  await bearbeitung.locator('[role="switch"][aria-checked="false"]').waitFor();
  const kopie = await bearbeitung.getByRole('textbox', { name: 'Datei (YAML)' }).inputValue();
  assert.match(kopie, /^start: manuell$/m);
  assert.doesNotMatch(kopie, /^(seite|leise):/m, 'Seite und „leise“ gehören nur zu Ablagos erstem Besuch');
  // Neuer Rundgang: Fehler mit Zeile, dann speichern.
  await liste.getByRole('link', { name: '+ Rundgang' }).click();
  const datei = bearbeitung.getByRole('textbox', { name: 'Datei (YAML)' });
  await datei.waitFor();
  await datei.fill(EIGENER.replace('startseite.suche', 'gibt.es.nicht'));
  await bearbeitung.getByRole('button', { name: 'Prüfen' }).click();
  await bearbeitung.getByRole('button', { name: 'Zeile 6' }).waitFor();
  await bearbeitung.getByText(/unbekannter Anker „gibt\.es\.nicht“/).waitFor();
  for (const schema of ['light', 'dark']) {
    await schemaWechseln(s, schema);
    for (const v of await axePruefen(s, WERKBANK_BEREICHE)) funde.push(`Editor mit Fehler (${schema}): ${v}`);
  }
  await schemaWechseln(s, 'light');
  // Ankerhilfe: ein Klick setzt den Anker an der Schreibmarke ein.
  await datei.fill(EIGENER.replace('    ziel: startseite.suche\n', '    ziel: \n'));
  await datei.evaluate((el) => {
    const i = el.value.indexOf('ziel: ') + 6;
    el.focus();
    el.setSelectionRange(i, i);
  });
  await bearbeitung.getByRole('button', { name: /^startseite\.suche / }).click();
  assert.match(await datei.inputValue(), /ziel: startseite\.suche\n/);
  await bearbeitung.getByRole('button', { name: 'Rundgang anlegen' }).click();
  await s.waitForURL(/\/werkbank\/rundgaenge\/eigen%3Arauchtest$/);
  const eigen = liste.getByRole('link', { name: /Rauchtest-Rundgang/ });
  await eigen.waitFor();
  // Ausschalten: in der Liste „ausgeschaltet“.
  const schalter = bearbeitung.getByRole('switch', { name: 'Rundgang für alle' });
  await schalter.click();
  await bearbeitung.locator('[role="switch"][aria-checked="false"]').waitFor();
  await liste.getByRole('link', { name: /Rauchtest-Rundgang.*ausgeschaltet/ }).waitFor();
  for (const schema of ['light', 'dark']) {
    await schemaWechseln(s, schema);
    for (const v of await axePruefen(s, WERKBANK_BEREICHE)) funde.push(`Eigener Rundgang (${schema}): ${v}`);
  }
  assert.deepEqual(funde, [], `axe meldet Verstöße:\n${funde.join('\n')}`);
});

rauchtest('Handy: Werkbank → Rundgänge, Tippflächen (#941)', { handy: true, als: LENA }, async (s) => {
  await s.goto(BASIS + '/ablage/start');
  await verwalten(s);
  await s.goto(BASIS + '/werkbank/rundgaenge');
  await s
    .getByRole('region', { name: 'Elemente' })
    .getByRole('link', { name: /Deine Ablage im Überblick/ })
    .first()
    .waitFor();
  await keineWaagerechteRolle(s);
  const zuKlein = await tippflaechenPruefen(s, ['.spalte.liste']);
  assert.deepEqual(zuKlein, [], `Zu kleine Tippflächen:\n${zuKlein.join('\n')}`);
});

rauchtest(
  'Werkbank → Tipps: eigener Tipp mit Vorschau, Tipp von Ablago anpassen und zurücksetzen (#942)',
  { als: LENA, timeout: 110_000 },
  async (s) => {
    const funde = [];
    await s.goto(BASIS + '/ablage/start');
    await verwalten(s);
    await s.goto(BASIS + '/werkbank/tipps/neu');
    const bearbeitung = s.getByRole('region', { name: 'Bearbeitung' });
    const text = bearbeitung.getByRole('textbox', { name: 'Text' });
    await text.waitFor();
    await text.fill('Rauchtest: Oben suchst du in allen Mappen.');
    await bearbeitung.locator('.tipp-vorschau').getByText('Rauchtest: Oben suchst du in allen Mappen.').waitFor();
    await bearbeitung.getByRole('combobox', { name: 'Stelle' }).selectOption('startseite.suche');
    await bearbeitung.getByRole('button', { name: 'Tipp anlegen' }).click();
    await s.waitForURL(/\/werkbank\/tipps\/eigen%3Atipp_1$/);
    const liste = s.getByRole('region', { name: 'Elemente' });
    await liste.getByRole('link', { name: /Rauchtest: Oben suchst du/ }).waitFor();
    for (const schema of ['light', 'dark']) {
      await schemaWechseln(s, schema);
      for (const v of await axePruefen(s, WERKBANK_BEREICHE)) funde.push(`Eigener Tipp (${schema}): ${v}`);
    }
    await schemaWechseln(s, 'light');
    // Tipp von Ablago anpassen: Original bleibt, „angepasst“ in der Liste, zurücksetzen.
    await s.goto(BASIS + '/werkbank/tipps/favoriten');
    await text.waitFor();
    const original = await text.inputValue();
    await text.fill('Rauchtest: Bei uns heißen Favoriten Merkliste.');
    await bearbeitung.getByRole('button', { name: 'Tipp speichern' }).click();
    await liste.getByRole('link', { name: /Merkliste.*angepasst/ }).waitFor();
    await bearbeitung.getByText(`Original: ${original}`).waitFor();
    for (const schema of ['light', 'dark']) {
      await schemaWechseln(s, schema);
      for (const v of await axePruefen(s, WERKBANK_BEREICHE)) funde.push(`Angepasster Tipp (${schema}): ${v}`);
    }
    await schemaWechseln(s, 'light');
    await bearbeitung.getByRole('button', { name: 'Auf Original zurücksetzen' }).click();
    await liste
      .getByRole('link', { name: original.slice(0, 30) })
      .first()
      .waitFor();
    assert.equal(await liste.getByRole('link', { name: /Merkliste/ }).count(), 0);
    assert.deepEqual(funde, [], `axe meldet Verstöße:\n${funde.join('\n')}`);
  },
);

rauchtest('Handy: Werkbank → Tipps, Tippflächen (#942)', { handy: true, als: LENA }, async (s) => {
  await s.goto(BASIS + '/ablage/start');
  await verwalten(s);
  await s.goto(BASIS + '/werkbank/tipps');
  await s.getByRole('region', { name: 'Elemente' }).getByRole('link').nth(2).waitFor();
  await keineWaagerechteRolle(s);
  const zuKlein = await tippflaechenPruefen(s, ['.spalte.liste']);
  assert.deepEqual(zuKlein, [], `Zu kleine Tippflächen:\n${zuKlein.join('\n')}`);
});

rauchtest('Tipp „Erinnern“: öffnet eine lesbare Mappe und hebt „Mappe ▾“ hervor (#1307)', { als: LENA }, async (s) => {
  await s.goto(BASIS + '/entdecken');
  await s.getByRole('link', { name: /„Mappe ▾“ → „Erinnern“/ }).click();
  // Die zuletzt geänderte Mappe, die Lena lesen darf; die Stelle ist kurz hervorgehoben.
  await s.waitForURL(/\/ablage\/[^/]+\/[^/]+$/);
  await s.locator('[data-anker="mappe.aktionen"].anker-hervor').first().waitFor();
});

/* ---------- #1512, #1522, #1523: Rundgänge beim ersten Besuch einer Seite ---------- */

/** Eine neue Person (Administratorin), die Ablago noch nicht kennt, mit eigener Mappe; angemeldet im Browser. */
async function neuePerson(s, name) {
  const verwaltung = await sitzung(LENA);
  await api('POST', '/api/konto/verwaltung', { cookie: verwaltung, body: { passwort: LENA.passwort } });
  const person = { email: `${name.toLowerCase()}@example.org`, name, passwort: `rauchtest-passwort-${name}` };
  const einladung = (
    await api('POST', '/api/benutzer', { cookie: verwaltung, body: { email: person.email, name, rolle: 'admin', rollen: [] } })
  ).daten;
  await api('POST', '/api/konto/passwort-setzen', {
    body: { schluessel: einladung.link.split('/passwort/')[1], passwort: person.passwort },
  });
  // Administratorin mit „Gesamter Verwaltung“ (#818), damit sie die Werkbank sieht.
  const id = (await api('GET', '/api/benutzer', { cookie: verwaltung })).daten.find((b) => b.email === person.email).id;
  await api('PUT', `/api/benutzer/${id}/verwaltung`, { cookie: verwaltung, body: { verwaltung: ['*'] } });
  const cookie = await sitzung(person);
  const mappe = (await api('POST', '/api/mappen', { cookie, body: { typId: daten.bausteine.id, werte: { objekt: `Keller ${name}` } } }))
    .daten;
  const [k, v] = cookie.split('=');
  await s.context().addCookies([{ name: k, value: v, url: BASIS }]);
  return { cookie, mappe };
}

/** Geht einen laufenden Rundgang durch und gibt je Schritt die Hervorhebung zurück (null: ohne Hervorhebung). */
async function durchgehen(s, titel, anzahl) {
  const rundgang = s.getByRole('dialog');
  await rundgang.getByText(`Rundgang: ${titel}`, { exact: true }).waitFor();
  const licht = [];
  for (let i = 1; i <= anzahl; i++) {
    await rundgang.getByText(`Schritt ${i} von ${anzahl}`).waitFor();
    await s.waitForTimeout(400);
    licht.push(await s.locator('.rg-licht').boundingBox());
    await rundgang.getByRole('button', { name: i < anzahl ? 'Weiter' : 'Fertig' }).click();
  }
  await rundgang.waitFor({ state: 'detached' });
  return licht;
}

const vonLinksNachRechts = (licht) => licht.every((l, i) => i === 0 || l.x >= licht[i - 1].x - 4);
const vonObenNachUnten = (licht) => licht.every((l, i) => i === 0 || l.y >= licht[i - 1].y - 4);

rauchtest(
  'Erster Besuch: Ablage, dann Mappe, Mein Konto nur als stiller Hinweis – in Leserichtung (#1512, #1522, #1523)',
  { timeout: 90_000 },
  async (s) => {
    const { mappe } = await neuePerson(s, 'Mia');
    await s.goto(BASIS + '/ablage/start');
    // Ablage: von selbst, sieben Schritte.
    const ablage = await durchgehen(s, 'Deine Ablage im Überblick', 7);
    assert.ok(ablage.every(Boolean), 'jeder Schritt hebt etwas hervor');
    // Nach dem Ende folgt kein weiterer Rundgang von selbst auf derselben Seite.
    await s.waitForTimeout(1500);
    assert.equal(await s.getByRole('dialog').count(), 0, 'nach dem Rundgang Ruhe');
    // Mappe: beim ersten Öffnen einer Mappe, oben von links nach rechts, dann nach unten.
    await s.goto(BASIS + `/ablage/${daten.bausteine.id}/${mappe.id}`);
    const m = await durchgehen(s, 'So arbeitest du in einer Mappe', 5);
    assert.ok(m.every(Boolean), 'jeder Schritt der Mappe hebt etwas hervor');
    assert.ok(vonLinksNachRechts(m.slice(0, 3)), `Kopf der Mappe nicht von links nach rechts: ${m.map((l) => Math.round(l.x)).join(', ')}`);
    assert.ok(vonObenNachUnten(m.slice(2)), `Mappe nicht von oben nach unten: ${m.map((l) => Math.round(l.y)).join(', ')}`);
    // Mein Konto: kein Rundgang von selbst, nur ein Satz; der startet ihn, von oben nach unten.
    await s.goto(BASIS + '/profil/konto');
    const hinweis = s.locator('.stiller-hinweis');
    await hinweis.getByRole('link', { name: /^Neu hier\?/ }).waitFor();
    await s.waitForTimeout(1500);
    assert.equal(await s.getByRole('dialog').count(), 0, 'Mein Konto startet nichts von selbst');
    await hinweis.getByRole('link', { name: /^Neu hier\?/ }).click();
    const k = await durchgehen(s, 'Mein Konto', 7);
    assert.ok(k.every(Boolean), 'jeder Schritt in Mein Konto hebt etwas hervor');
    assert.ok(vonObenNachUnten(k), `Mein Konto nicht von oben nach unten: ${k.map((l) => Math.round(l.y)).join(', ')}`);
    await hinweis.waitFor({ state: 'detached' });
    // Ein zweites Laden: Ablage und Mappe bleiben ruhig.
    await s.goto(BASIS + `/ablage/${daten.bausteine.id}/${mappe.id}`);
    await s.getByRole('heading', { name: 'Keller Mia' }).first().waitFor();
    await s.waitForTimeout(1500);
    assert.equal(await s.getByRole('dialog').count(), 0, 'gesehen bleibt gesehen');
  },
);

rauchtest(
  'Erster Besuch: Werkbank für Verwaltende, × blendet den Hinweis in Mein Konto aus (#1512, #1523)',
  { timeout: 60_000 },
  async (s) => {
    const { cookie } = await neuePerson(s, 'Ben');
    // Im Verwaltungsmodus (dieselbe Sitzung wie im Browser) direkt in die Werkbank.
    await api('POST', '/api/konto/verwaltung', { cookie, body: { passwort: 'rauchtest-passwort-Ben' } });
    await s.goto(BASIS + '/werkbank');
    await s.getByText('Rundgang: Die Werkbank im Überblick', { exact: true }).waitFor();
    assert.deepEqual(await axePruefen(s, ['dialog.rundgang']), [], 'axe im Rundgang');
    const w = await durchgehen(s, 'Die Werkbank im Überblick', 8);
    assert.ok(w.every(Boolean), 'jeder Schritt der Werkbank hebt etwas hervor');
    assert.ok(vonLinksNachRechts(w.slice(0, 3)), `Kopfzeile nicht von links nach rechts: ${w.map((l) => Math.round(l.x)).join(', ')}`);
    // Hinweis in Mein Konto ausblenden: bleibt weg, auch nach dem Neuladen.
    await s.goto(BASIS + '/profil/konto');
    const hinweis = s.locator('.stiller-hinweis');
    await hinweis.getByRole('button', { name: 'Hinweis ausblenden' }).waitFor();
    const funde = [];
    for (const schema of ['light', 'dark']) {
      await schemaWechseln(s, schema);
      for (const v of await axePruefen(s, ['.stiller-hinweis'])) funde.push(`${schema}: ${v}`);
    }
    await schemaWechseln(s, 'light');
    assert.deepEqual(funde, [], `axe meldet Verstöße:\n${funde.join('\n')}`);
    await hinweis.getByRole('button', { name: 'Hinweis ausblenden' }).click();
    await hinweis.waitFor({ state: 'detached' });
    await s.reload();
    await s.getByRole('heading', { name: 'Ben', level: 1 }).waitFor();
    assert.equal(await hinweis.count(), 0);
  },
);
