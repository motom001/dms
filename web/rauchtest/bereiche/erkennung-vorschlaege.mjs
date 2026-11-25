/**
 * Rauchtests: Erkennung beim Sortieren der Post (KW49) – Rechnungsnummer direkt hinter „Rechnung“ (#1657), Zeitraum
 * aus zwei Daten (#1646), Steuerjahr aus „Bis“ (#1648, von Hand #1678) und „Wie sicher ist Ablago?“ samt Schwelle (#1645).
 * Allein starten (frisch gestartetes Ablago, siehe rauchtest.mjs): node web/rauchtest/bereiche/erkennung-vorschlaege.mjs [fehlerordner]
 */
import assert from 'node:assert/strict';
import '../einrichtung.mjs';
import { api, BASIS, beispielPdf, LENA, rauchtest, sitzung, verwalten } from '../hilfen.mjs';
import { axePruefen } from '../muster.mjs';

/** Eigene Post: Briefe als PDFs mit Text (die Textebene liest Ablago selbst). */
async function eigenePost(betreff, zeilen) {
  const cookie = await sitzung(LENA);
  const brief = (await api('POST', '/api/post', { cookie, body: { betreff } })).daten;
  for (const z of zeilen)
    await api(
      'POST',
      `/api/mappen/${brief.id}/dokumente?register=dokumente&name=${encodeURIComponent(`${z.split('\n')[0]}.pdf`)}&typ=application/pdf`,
      { cookie, body: beispielPdf(z), roh: true },
    );
  return brief;
}

rauchtest('Neue Post: „Rechnung R-…“ füllt die Rechnungsnummer, „Wie sicher ist Ablago?“ (#1657, #1645)', { als: LENA }, async (s) => {
  const brief = await eigenePost('Motorrad Beispiel', ['Rechnung R-2027-1120\nMotorrad Werkstatt Beispiel\nGesamtbetrag 588,20 EUR']);
  await s.goto(BASIS + `/ablage/eingang/${brief.id}/uebernehmen`);
  const mappe = s.getByRole('region', { name: 'Mappe' });
  await mappe.getByRole('group', { name: 'Vorschläge' }).getByRole('button', { name: 'Rechnung', pressed: true }).waitFor();
  await s.waitForFunction(() => document.querySelector('#feld-rechnungsnummer')?.value === 'R-2027-1120');
  // Zugeklappt keine Prozente (#1217); aufgeklappt die Typen in Worten, auf Wunsch mit Zahl und Schwelle.
  assert.equal(await mappe.getByText(/\d+ %/).count(), 0);
  const auf = mappe.getByRole('button', { name: 'Wie sicher ist Ablago?' });
  await auf.click();
  await mappe
    .locator('#ue-wie-sicher')
    .getByText(/^Rechnung – (sicher|wahrscheinlich)/)
    .waitFor();
  await mappe.getByRole('button', { name: 'Als Zahl zeigen', pressed: false }).click();
  await mappe
    .locator('#ue-wie-sicher')
    .getByText(/\d+ % – ab 30 % schlägt Ablago ihn vor/)
    .first()
    .waitFor();
  assert.deepEqual(await axePruefen(s, ['.spalte.mappe']), []);
});

rauchtest('Neue Post: Zeitraum an Von und Bis, Steuerjahr aus „Bis“ – sonst „anlegen“ (#1646, #1648)', { als: LENA }, async (s) => {
  const verwaltung = await sitzung(LENA);
  await api('POST', '/api/konto/verwaltung', { cookie: verwaltung, body: { passwort: LENA.passwort } });
  const steuer = (
    await api('POST', '/api/typen', {
      cookie: verwaltung,
      body: {
        name: 'Steuerjahr Probe',
        schluessel: 'steuerjahr_probe',
        titelVorlage: 'Steuerjahr {jahr}',
        felder: [{ key: 'jahr', label: 'Jahr', typ: 'text', pflicht: true }],
      },
    })
  ).daten;
  await api('POST', '/api/typen', {
    cookie: verwaltung,
    body: {
      name: 'Auszug Probe',
      schluessel: 'auszug_probe',
      titelVorlage: 'Auszug {ende}',
      felder: [
        { key: 'beginn', label: 'Von', typ: 'datum', erkennung: { art: 'datum' } },
        { key: 'ende', label: 'Bis', typ: 'datum', erkennung: { art: 'datum' } },
        {
          key: 'steuerjahr',
          label: 'Steuerjahr',
          typ: 'referenz',
          zielTypen: [steuer.id],
          ausDatum: { datumFeld: 'ende', zielFeld: 'jahr' },
        },
      ],
      register: [
        { key: 'allgemein', name: 'Allgemein', art: 'felder', felder: ['beginn', 'ende', 'steuerjahr'] },
        { key: 'dokumente', name: 'Dokumente', art: 'dokumente' },
      ],
    },
  });
  await api('POST', '/api/mappen', { cookie: verwaltung, body: { typId: steuer.id, werte: { jahr: '2012' } } });
  const brief = await eigenePost('Auszug Beispiel', ['Auszug Probe\nF I N A N Z S T A T U S vom 01.07.2012 -\n31.07.2012']);
  await s.goto(BASIS + `/ablage/eingang/${brief.id}/uebernehmen`);
  const mappe = s.getByRole('region', { name: 'Mappe' });
  await mappe.getByRole('group', { name: 'Vorschläge' }).getByRole('button', { name: 'Auszug Probe', pressed: true }).waitFor();
  // Von und Bis aus dem Zeitraum, das Steuerjahr als Vorschlag mit Grund.
  await mappe.getByText('aus „Bis“: Jahr 2012', { exact: false }).waitFor();
  await mappe.getByText('Steuerjahr 2012').first().waitFor();
  const werte = await s.evaluate(() => [...document.querySelectorAll('#feld-beginn, #feld-ende')].map((x) => x.value));
  assert.equal(new Set(werte).size, 2, `Von und Bis verschieden: ${werte.join(', ')}`);
  // Bis auf 2013: kein Steuerjahr 2013 – Ablago bietet an, es anzulegen, legt aber nichts an.
  const bis = mappe.locator('#feld-ende');
  await bis.fill(/^\d{4}-/.test(werte[1]) ? '2013-07-31' : '31.07.2013');
  await bis.blur();
  await mappe.getByText('Für „Steuerjahr“ gibt es noch keine passende Mappe: 2013').waitFor();
  await mappe.getByRole('button', { name: '„Steuerjahr Probe“ mit diesen Angaben anlegen' }).waitFor();
  const jahre = (
    await api('GET', `/api/mappen?${new URLSearchParams({ sicht: steuer.id, von: '0', anzahl: '50' })}`, { cookie: verwaltung })
  ).daten;
  assert.equal(jahre.mappen.length, 1, 'nichts ohne Klick angelegt');
});

rauchtest(
  'Neue Post: „Bis“ von Hand – getippt, nach „Zurücknehmen“ und im Kalender – schlägt das Steuerjahr vor (#1678)',
  { als: LENA },
  async (s) => {
    const verwaltung = await sitzung(LENA);
    await api('POST', '/api/konto/verwaltung', { cookie: verwaltung, body: { passwort: LENA.passwort } });
    const steuer = (
      await api('POST', '/api/typen', {
        cookie: verwaltung,
        body: {
          name: 'Steuerjahr Hand',
          schluessel: 'steuerjahr_hand',
          titelVorlage: 'Steuerjahr {jahr}',
          felder: [{ key: 'jahr', label: 'Jahr', typ: 'text', pflicht: true }],
        },
      })
    ).daten;
    await api('POST', '/api/typen', {
      cookie: verwaltung,
      body: {
        name: 'Beleg Hand',
        schluessel: 'beleg_hand',
        felder: [
          { key: 'ende', label: 'Bis', typ: 'datum' },
          {
            key: 'steuerjahr',
            label: 'Steuerjahr',
            typ: 'referenz',
            zielTypen: [steuer.id],
            ausDatum: { datumFeld: 'ende', zielFeld: 'jahr' },
          },
        ],
        register: [
          { key: 'allgemein', name: 'Allgemein', art: 'felder', felder: ['ende', 'steuerjahr'] },
          { key: 'dokumente', name: 'Dokumente', art: 'dokumente' },
        ],
      },
    });
    for (const jahr of ['2025', '2026'])
      await api('POST', '/api/mappen', { cookie: verwaltung, body: { typId: steuer.id, werte: { jahr } } });
    const brief = await eigenePost('Beleg Hand', ['Beleg Hand\nOhne Datum im Text']);
    await s.goto(BASIS + `/ablage/eingang/${brief.id}/uebernehmen`);
    const mappe = s.getByRole('region', { name: 'Mappe' });
    await mappe.getByRole('group', { name: 'Vorschläge' }).getByRole('button', { name: 'Beleg Hand', pressed: true }).waitFor();
    const feld = mappe.locator('[data-anker="mappe.feld:steuerjahr"]');
    // „Zurücknehmen“ am Vorschlag des Steuerjahrs („aus „Bis“: Jahr …“).
    const zuruecknehmen = () => mappe.locator('.ad-hinweis').filter({ hasText: 'aus „Bis“' }).getByRole('button', { name: 'Zurücknehmen' });
    const bis = mappe.locator('#feld-ende');
    // Getippt: Beim Jahr meldet das Datumsfeld jede Stelle einzeln (0002, 0020, 0202, 2026) – so wie hier nacheinander.
    await bis.fill('');
    for (const jahr of ['0002', '0020', '0202', '2026']) await bis.fill(`${jahr}-05-20`);
    await feld.getByText('Steuerjahr 2026').first().waitFor();
    // Zurückgenommen: leer – ein neues Datum schlägt es wieder vor.
    await zuruecknehmen().click();
    await feld.getByText('Steuerjahr 2026').waitFor({ state: 'detached' });
    await bis.fill('2026-06-30');
    await feld.getByText('Steuerjahr 2026').first().waitFor();
    // Im Kalender gewählt: vom 30.12.2024 (kein Steuerjahr) zwei Tage weiter ins Jahr 2025.
    await zuruecknehmen().click();
    await feld.getByText('Steuerjahr 2026').waitFor({ state: 'detached' });
    await bis.fill('2024-12-30');
    await mappe.getByText('Für „Steuerjahr“ gibt es noch keine passende Mappe: 2024').waitFor();
    await bis.focus();
    await s.keyboard.press('Alt+ArrowDown');
    const kalender = mappe.getByRole('dialog', { name: 'Kalender' });
    await kalender.waitFor();
    await s.waitForFunction(() => document.activeElement?.getAttribute('data-tag') === '2024-12-30');
    await s.keyboard.press('ArrowRight');
    await s.keyboard.press('ArrowRight');
    await s.keyboard.press('Enter');
    await kalender.waitFor({ state: 'detached' });
    assert.equal(await bis.inputValue(), '2025-01-01');
    await feld.getByText('Steuerjahr 2025').first().waitFor();
  },
);

rauchtest('Werkbank: „Woran man ihn erkennt“ unter Erkennung, Schwelle im Expertenmodus (#1645)', { als: LENA }, async (s) => {
  const typ = (await api('GET', '/api/typen', { cookie: await sitzung(LENA) })).daten.find((x) => x.name === 'Rechnung');
  await s.goto(BASIS + '/ablage/start');
  await verwalten(s);
  await s.goto(BASIS + `/werkbank/typen/${typ.id}#erkennung`);
  await s.locator('#erkennung').getByLabel('Woran man ihn erkennt').waitFor();
  assert.equal(await s.locator('#grunddaten').getByLabel('Woran man ihn erkennt').count(), 0);
  await s.goto(BASIS + '/werkbank/pakete/ablago.text');
  await s.getByRole('button', { name: /^Expertenmodus Ab wann Ablago/ }).click();
  const feld = s.getByLabel('Schwelle für den Vorschlag (Prozent)');
  await s.waitForFunction(() => document.querySelector('#schwelle-inhalt input')?.value === '30');
  await feld.fill('40');
  await s.getByRole('button', { name: 'Schwelle speichern' }).click();
  await s.getByText('Gespeichert – Ablago schlägt ab 40 % einen Mappentyp vor.').waitFor();
  await s.getByRole('button', { name: 'Zurück zur Vorgabe' }).click();
  await s.getByText('Gespeichert – Ablago schlägt ab 30 % einen Mappentyp vor.').waitFor();
});
