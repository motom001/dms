/**
 * Rauchtests: Formularfelder (KW47) – Anlegen ohne verborgene Werte (#1492), leeres Betragsfeld ohne Minus (#1493),
 * Datumsfeld mit Kalender und Kalenderwochen (#1496).
 * Allein starten (frisch gestartetes Ablago, siehe rauchtest.mjs): node web/rauchtest/bereiche/formularfelder.mjs [fehlerordner]
 */
import assert from 'node:assert/strict';
import '../einrichtung.mjs';
import { api, BASIS, keineWaagerechteRolle, LENA, rauchtest, schemaWechseln, sitzung } from '../hilfen.mjs';
import { axePruefen, tippflaechenPruefen } from '../muster.mjs';

/** Rechnung mit Abschnitt „Vermietung“, der nur bei Art „Miete“ zu sehen ist; Netto mit „nur negativ“. */
let typ;
async function rechnungstyp() {
  if (typ) return typ;
  const felder = [
    { key: 'nr', label: 'Rechnungsnummer', typ: 'text', pflicht: true },
    { key: 'art', label: 'Art', typ: 'auswahl', optionen: ['Reparatur', 'Miete'] },
    { key: 'netto', label: 'Netto', typ: 'betrag', negativ: true },
    { key: 'faellig', label: 'Fällig am', typ: 'datum' },
    { key: 'umlage', label: 'Umlagefähig', typ: 'janein' },
    { key: 'objekt', label: 'Mietobjekt', typ: 'text', standard: 'Gartenstraße' },
    { key: 'notiz', label: 'Notiz', typ: 'langtext' },
  ];
  const miete = {
    modus: 'alle',
    bedingungen: [{ art: 'feld', bedingung: { art: 'feld', feld: 'art', op: 'einerVon', wert: { art: 'fest', wert: ['Miete'] } } }],
  };
  // Eigene Sitzung im Verwaltungsmodus (die Sitzung des Browsers bleibt in der Ablage).
  const verwaltung = await sitzung(LENA);
  await api('POST', '/api/konto/verwaltung', { cookie: verwaltung, body: { passwort: LENA.passwort } });
  typ = (
    await api('POST', '/api/typen', {
      cookie: verwaltung,
      body: {
        name: 'Handwerkerrechnung',
        schluessel: 'handwerkerrechnung',
        titelVorlage: '{nr}',
        felder,
        register: [
          {
            key: 'allgemein',
            name: 'Allgemein',
            art: 'felder',
            felder: felder.map((f) => f.key),
            abschnitte: [
              { vor: 'umlage', titel: 'Vermietung', anzeigen: miete },
              { vor: 'notiz', titel: 'Sonstiges' },
            ],
          },
          { key: 'protokoll', name: 'Historie', art: 'protokoll' },
        ],
      },
    })
  ).daten;
  return typ;
}

async function neueRechnung(s) {
  const t = await rechnungstyp();
  await s.goto(BASIS + `/ablage/${t.id}/neu`);
  const mappe = s.getByRole('region', { name: 'Mappe' });
  await mappe.getByRole('heading', { name: 'Neue Mappe', level: 1 }).waitFor();
  return mappe;
}

rauchtest('Anlegen: ausgeblendeter Abschnitt bekommt keinen Wert, Betrag ohne „-0,00“ (#1492, #1493)', { als: LENA }, async (s) => {
  const mappe = await neueRechnung(s);
  // #1493: „nur negativ“ zeigt den Hinweis, der Platzhalter bleibt „0,00“.
  const netto = mappe.getByRole('textbox', { name: /^Netto/ });
  assert.equal(await netto.getAttribute('placeholder'), '0,00');
  await mappe.getByText('Gutschrift oder Erstattung? Mit Minus eintragen.').waitFor();
  await mappe.getByRole('textbox', { name: 'Rechnungsnummer', exact: true }).fill('HR-1492');
  await mappe.getByRole('combobox', { name: /^Art/ }).selectOption('Reparatur');
  await mappe.getByRole('heading', { name: 'Vermietung' }).waitFor({ state: 'detached' });
  await mappe.getByRole('button', { name: 'Mappe speichern' }).click();
  await mappe.getByRole('heading', { name: /^HR-1492/, level: 1 }).waitFor();
  const id = new URL(s.url()).pathname.split('/').pop();
  const cookie = await sitzung(LENA);
  const m = (await api('GET', `/api/mappen/${id}`, { cookie })).daten.mappe;
  assert.equal(m.werte.objekt ?? null, null, 'Vorgabe „Gartenstraße“ im ausgeblendeten Abschnitt nicht gespeichert');
  const angelegt = (await api('GET', `/api/mappen/${id}/historie`, { cookie })).daten.find((e) => e.art === 'angelegt');
  assert.deepEqual(
    angelegt.daten.aenderungen.map((a) => a.feld),
    ['nr', 'art'],
    'Historie zählt nur Felder mit Wert – kein „Umlagefähig: Nein“, kein Mietobjekt',
  );
});

rauchtest('Datumsfeld: Klick ins Feld öffnet den Kalender mit Kalenderwochen, Tippen bleibt direkt (#1496)', { als: LENA }, async (s) => {
  const mappe = await neueRechnung(s);
  const feld = mappe.locator('[data-anker="mappe.feld:faellig"]');
  const eingabe = feld.getByLabel(/^Fällig am/);
  const kalender = feld.getByRole('dialog', { name: 'Kalender' });
  // Klick mit der Maus ins Feld: Kalender auf, der Fokus bleibt im Feld – getippt wird weiter Tag, Monat, Jahr.
  await eingabe.click({ position: { x: 12, y: 10 } });
  await kalender.waitFor();
  assert.ok(await eingabe.evaluate((el) => el === document.activeElement), 'Fokus bleibt im Feld');
  // Getippt (die Reihenfolge von Tag, Monat und Jahr hängt am Gebietsschema): der Kalender folgt dem Feld.
  await eingabe.fill('2026-12-11');
  await kalender.getByText('Dezember 2026').waitFor();
  await s.keyboard.press('ArrowUp');
  assert.notEqual(await eingabe.inputValue(), '2026-12-11', 'Pfeil hoch ändert den Wert im Feld – die Tastatur bleibt im Feld');
  await eingabe.fill('2026-12-11');
  await kalender.locator('[data-kw="50"]').waitFor();
  assert.deepEqual(await kalender.locator('tbody th').allTextContents(), [
    '49Kalenderwoche 49',
    '50Kalenderwoche 50',
    '51Kalenderwoche 51',
    '52Kalenderwoche 52',
    '53Kalenderwoche 53',
  ]);
  // axe mit offenem Kalender, hell und dunkel.
  const funde = [];
  for (const schema of ['light', 'dark']) {
    await schemaWechseln(s, schema);
    for (const v of await axePruefen(s, ['.spalte.mappe'])) funde.push(`${schema}: ${v}`);
  }
  assert.deepEqual(funde, [], `axe meldet Verstöße:\n${funde.join('\n')}`);
  // Kein Überlauf: Die Seite rollt nicht waagerecht, der Kalender liegt ganz im Fenster.
  await keineWaagerechteRolle(s);
  const box = await kalender.boundingBox();
  const fenster = s.viewportSize();
  assert.ok(box.x >= 0 && box.x + box.width <= fenster.width && box.y + box.height <= fenster.height + 1, 'Kalender im Fenster');
  // Ein Tag per Klick: Wert gesetzt, Kalender zu, Fokus zurück im Feld.
  await kalender.getByRole('button', { name: 'Freitag, 18. Dezember 2026' }).click();
  await kalender.waitFor({ state: 'detached' });
  assert.equal(await eingabe.inputValue(), '2026-12-18');
  // Tastatur: Alt + Pfeil runter öffnet mit dem Fokus auf dem Tag, Pfeil rechts wandert, Enter wählt.
  await eingabe.focus();
  await s.keyboard.press('Alt+ArrowDown');
  await kalender.waitFor();
  await s.waitForFunction(() => document.activeElement?.getAttribute('data-tag') === '2026-12-18');
  await s.keyboard.press('ArrowRight');
  await s.keyboard.press('Enter');
  await kalender.waitFor({ state: 'detached' });
  assert.equal(await eingabe.inputValue(), '2026-12-19');
  // Esc schließt und gibt den Fokus ans Feld; Tab öffnet nichts.
  await feld.getByRole('button', { name: 'Kalender öffnen' }).click();
  await kalender.waitFor();
  await s.keyboard.press('Escape');
  await kalender.waitFor({ state: 'detached' });
  assert.ok(await eingabe.evaluate((el) => el === document.activeElement), 'Fokus nach Esc im Feld');
});

rauchtest('Handy: Datumsfeld mit Kalenderknopf, Kalender als Blatt ohne Überlauf (#1496)', { handy: true, als: LENA }, async (s) => {
  const mappe = await neueRechnung(s);
  const feld = mappe.locator('[data-anker="mappe.feld:faellig"]');
  await feld.getByRole('button', { name: 'Kalender öffnen' }).click();
  const kalender = feld.getByRole('dialog', { name: 'Kalender' });
  await kalender.waitFor();
  await kalender.locator('tbody th').first().waitFor();
  await keineWaagerechteRolle(s);
  const box = await kalender.boundingBox();
  const fenster = s.viewportSize();
  assert.ok(box.x >= 0 && box.x + box.width <= fenster.width + 1, `Kalender breiter als das Fenster (${box.width} px)`);
  const funde = await tippflaechenPruefen(s, ['[data-anker="datum.kalender"]']);
  assert.deepEqual(funde, [], `Zu kleine Tippflächen:\n${funde.join('\n')}`);
  await kalender.getByRole('button', { name: 'Heute' }).click();
  await kalender.waitFor({ state: 'detached' });
  assert.match(await feld.getByLabel(/^Fällig am/).inputValue(), /^\d{4}-\d{2}-\d{2}$/);
});
