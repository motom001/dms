/**
 * Rauchtests des Oberflächen-Bündels KW48 (Teil 2): Kalender nach der Lage-Regel der Menüs, auch am rechten Rand
 * (#1556, #1532), Datumsfeld nur mit Monat (#1722), Symbolsuche mit gleichbedeutenden Wörtern (#1548), Betrag mit zwei Nachkommastellen (#1608), kein
 * MD5-Hinweis bei SCRAM (#1612) und die Zahl im Titel des Tabs (#922).
 * Allein starten (frisch gestartetes Ablago, siehe rauchtest.mjs): node web/rauchtest/bereiche/datum-und-hinweise.mjs [fehlerordner]
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import '../einrichtung.mjs';
import { api, BASIS, browser, LENA, rauchtest, schemaWechseln, sitzung, TABLET_QUER, verwalten, warteAufAblago } from '../hilfen.mjs';
import { axePruefen } from '../muster.mjs';
import { rechnungAnlegen } from './spalten-und-leisten.mjs';

/** Der offene Kalender ganz im Fenster? Liefert seine Lage und die Fenstergröße. */
async function kalenderLage(s, dialog) {
  await dialog.waitFor();
  const b = await dialog.boundingBox();
  const f = await s.evaluate(() => ({
    breite: innerWidth,
    hoehe: innerHeight,
    frei: Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--platz-begleiter')),
  }));
  assert.ok(b.x >= 0 && b.x + b.width <= f.breite, `waagerecht im Fenster (${b.x} … ${b.x + b.width} von ${f.breite})`);
  assert.ok(b.y >= 0 && b.y + b.height <= f.hoehe, `senkrecht im Fenster (${b.y} … ${b.y + b.height} von ${f.hoehe})`);
  return { b, f };
}

/* ---------- Kalender (#1556, #1532) ---------- */

// Musterseite in eigenem Kontext wie in bausteine-und-knoepfe.mjs: Dort stehen bewusst auch Muster wie ein roter
// „Löschen“ in der geöffneten Rückfrage, die der Knopf-Wächter der übrigen Rauchtests meldete.
for (const [name, geraet] of [
  ['PC 1366 px', { viewport: { width: 1366, height: 768 } }],
  ['iPad quer', TABLET_QUER],
])
  test(`Musterseite: Datumsfeld am rechten Rand, Kalender ganz sichtbar – ${name} (#1556)`, { timeout: 60_000 }, async () => {
    await warteAufAblago();
    const k = await browser.newContext({ ...geraet, locale: 'de-DE' });
    const fehler = [];
    k.on('weberror', (e) => fehler.push(`Fehler in der Seite: ${e.error().message}`));
    try {
      const s = await k.newPage();
      await s.goto(BASIS + '/muster#datum');
      const karte = s.locator('[data-zustand="datum-rechts"]');
      await karte.scrollIntoViewIfNeeded();
      const feld = await karte.locator('input[type="date"]').boundingBox();
      await karte.getByRole('button', { name: 'Kalender öffnen' }).click();
      const { b } = await kalenderLage(s, karte.getByRole('dialog', { name: 'Kalender' }));
      // Links- oder rechtsbündig mit dem Feld – nie über den Rand geschoben.
      assert.ok(Math.abs(b.x - feld.x) < 1 || Math.abs(b.x + b.width - (feld.x + feld.width)) < 1, 'bündig mit dem Feld');
      assert.ok(await karte.getByRole('button', { name: 'Heute' }).isVisible(), '„Heute“ sichtbar');
    } finally {
      await k.close();
    }
    assert.deepEqual(fehler, []);
  });

rauchtest(
  'Werkbank: Kalender ganz unten am Bildschirm öffnet nicht unter den Assistenten, axe hell/dunkel (#1532)',
  { als: LENA },
  async (s) => {
    await s.setViewportSize({ width: 1366, height: 640 });
    await s.goto(BASIS + '/werkbank/loeschprotokoll');
    await verwalten(s);
    const knopf = s.locator('form.lp-filter').getByRole('button', { name: 'Kalender öffnen' }).first();
    // Das Feld ans untere Ende des Fensters rollen.
    await knopf.waitFor();
    await knopf.evaluate((e) => {
      const spalte = e.closest('.spalte');
      spalte.style.paddingBottom = '2000px';
      e.scrollIntoView({ block: 'end' });
    });
    const vorher = await knopf.boundingBox();
    await knopf.click();
    const dialog = s.locator('form.lp-filter').getByRole('dialog', { name: 'Kalender' });
    const { b, f } = await kalenderLage(s, dialog);
    if (b.y > vorher.y) assert.ok(b.y + b.height <= f.hoehe - f.frei + 1, 'nach unten nur über dem Assistenten');
    else assert.ok(b.y + b.height <= vorher.y, 'sonst über dem Feld');
    for (const schema of ['light', 'dark']) {
      await schemaWechseln(s, schema);
      assert.deepEqual(await axePruefen(s, ['form.lp-filter [role="dialog"]']), [], `axe ${schema}`);
    }
  },
);

rauchtest('Profil am Handy: Kalender der Abwesenheit als Blatt von unten (#1532)', { als: LENA, handy: true }, async (s) => {
  await s.goto(BASIS + '/profil/abwesenheit');
  const knopf = s.getByRole('button', { name: 'Kalender öffnen' }).first();
  await knopf.click();
  const { b, f } = await kalenderLage(s, s.getByRole('dialog', { name: 'Kalender' }));
  assert.ok(Math.abs(b.y + b.height - f.hoehe) <= 1, 'Blatt liegt unten');
  assert.ok(b.width >= f.breite - 1, 'über die volle Breite');
});

/* ---------- Datumsfeld nur mit Monat (#1722) ---------- */

rauchtest(
  'Mappe: Datumsfeld mit Genauigkeit Monat zeigt „04/2028“, nimmt „11/2029“ an und speichert den Monatsletzten (#1722)',
  { als: LENA },
  async (s) => {
    const c = await sitzung(LENA);
    await api('POST', '/api/konto/verwaltung', { cookie: c, body: { passwort: LENA.passwort } });
    const typ = (
      await api('POST', '/api/typen', {
        cookie: c,
        body: {
          name: 'Prüftermin',
          schluessel: 'prueftermin',
          titelVorlage: '{kennzeichen}',
          felder: [
            { key: 'kennzeichen', label: 'Kennzeichen', typ: 'text', pflicht: true },
            { key: 'naechste_hu', label: 'Nächste HU', typ: 'datum', genauigkeit: 'monat' },
          ],
        },
      })
    ).daten;
    const mappe = (
      await api('POST', '/api/mappen', { cookie: c, body: { typId: typ.id, werte: { kennzeichen: 'MU-LM 1722', naechste_hu: '2028-04' } } })
    ).daten;
    assert.equal(mappe.werte.naechste_hu, '2028-04-30', 'gespeichert: Monatsletzter');
    await s.goto(BASIS + `/ablage/${typ.id}/${mappe.id}`);
    const hu = s.getByRole('textbox', { name: /^Nächste HU/ });
    await hu.waitFor();
    assert.equal(await hu.inputValue(), '04/2028');
    assert.equal(await hu.getAttribute('placeholder'), 'MM/JJJJ');
    // Kalender: derselbe Knopf, ein Tag wählt seinen Monat.
    await s.locator('[data-anker="mappe.feld:naechste_hu"]').getByRole('button', { name: 'Kalender öffnen' }).click();
    const kalender = s.getByRole('dialog', { name: 'Kalender' });
    await kalender.getByText('April 2028').waitFor();
    await kalender.locator('[data-tag="2028-04-12"]').click();
    assert.equal(await hu.inputValue(), '04/2028', 'ein Tag im April bleibt April');
    await hu.fill('11/2029');
    await s.getByRole('button', { name: 'Mappe speichern' }).click();
    await assert.doesNotReject(async () => {
      for (let i = 0; i < 50; i++) {
        const w = (await api('GET', `/api/mappen/${mappe.id}`, { cookie: c })).daten.mappe.werte.naechste_hu;
        if (w === '2029-11-30') return;
        await s.waitForTimeout(100);
      }
      throw new Error('nicht als 2029-11-30 gespeichert');
    });
    await api('DELETE', `/api/mappen/${mappe.id}?grund=nicht_noetig`, { cookie: c });
  },
);

/* ---------- Symbolsuche mit gleichbedeutenden Wörtern (#1548) ---------- */

rauchtest('Ansicht: Symbolsuche „Kfz“ findet mit „Kfz = Auto“ aus der Werkbank das Auto (#1548)', { als: LENA }, async (s) => {
  const c = await sitzung(LENA);
  await api('POST', '/api/konto/verwaltung', { cookie: c, body: { passwort: LENA.passwort } });
  const gruppe = (await api('POST', '/api/werkbank/suche/synonyme', { cookie: c, body: { woerter: ['Kfz', 'Auto'] } })).daten.id;
  try {
    await s.goto(BASIS + '/werkbank/sichten/neu');
    await verwalten(s);
    await s
      .getByRole('button', { name: /^Symbol/ })
      .first()
      .click();
    await s.getByLabel('Symbol suchen …').first().fill('Kfz');
    await s.getByRole('button', { name: 'Auto', exact: true }).waitFor();
  } finally {
    await api('DELETE', `/api/werkbank/suche/synonyme/${gruppe}`, { cookie: c });
  }
});

/* ---------- Betrag mit Nachkommastellen (#1608) ---------- */

rauchtest('Mappe: Betrag mit zwei Nachkommastellen, auch nach dem Verlassen des Felds (#1608)', { als: LENA }, async (s) => {
  const { typ, mappe } = await rechnungAnlegen(await sitzung(LENA), 'R-1608');
  await s.goto(BASIS + `/ablage/${typ.id}/${mappe.id}`);
  const betrag = s.getByRole('textbox', { name: /^Rechnungsbetrag/ });
  await betrag.waitFor();
  assert.equal(await betrag.inputValue(), '12,50');
  await betrag.fill('7,5');
  await betrag.blur();
  assert.equal(await betrag.inputValue(), '7,50');
});

/* ---------- MD5-Hinweis (#1612) und Zahl im Tab (#922) ---------- */

rauchtest('Werkbank: kein MD5-Hinweis bei Anmeldung mit SCRAM (#1612)', { als: LENA }, async (s) => {
  await s.goto(BASIS + '/werkbank');
  await verwalten(s);
  await s.locator('.uebersicht-hinweise').waitFor();
  assert.equal(await s.getByText('Ablago meldet sich noch mit MD5').count(), 0);
  await s.goto(BASIS + '/werkbank/systemzustand');
  await s.locator('.spalte.mappe .speicherleiste').waitFor();
  assert.equal(await s.locator('#datenbank-md5').count(), 0);
});

rauchtest('Tab: Zahl aus Zu erledigen und Neue Post vorn im Titel, Punkt im Symbol (#922)', { als: LENA }, async (s) => {
  const c = await sitzung(LENA);
  const z = (await api('GET', '/api/sichten', { cookie: c })).daten;
  const zahl = (z.eingang ?? 0) + (z.neuePost ? (z.sichten?.[z.neuePost] ?? 0) : 0);
  assert.ok(zahl > 0, 'Rauchtest-Daten: zwei Briefe in Neue Post');
  await s.goto(BASIS + '/ablage/start');
  await s.waitForFunction((n) => document.title.startsWith(`(${n}) `), zahl);
  await s.waitForFunction(() => document.querySelector('link[rel="icon"]')?.getAttribute('href')?.startsWith('data:image/png'));
});
