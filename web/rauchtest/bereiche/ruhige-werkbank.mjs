/**
 * Rauchtests der QS-Runde 11/2026 für Navigation und Werkbank: ruhige Zahlen (#1287, Leitsatz 9), Werkbank-Übersicht
 * zweigeteilt (#1284), kleine Funde der Abnahme (#1271), ruhige Zeile des Verwaltungsmodus (#1252), Anlegen-Knöpfe mit
 * Gegenstand (#1296) und die Durchsicht der Werkbank-Seiten (#1290).
 * Allein starten (frisch gestartetes Ablago, siehe rauchtest.mjs): node web/rauchtest/bereiche/ruhige-werkbank.mjs [fehlerordner]
 */
import assert from 'node:assert/strict';
import '../einrichtung.mjs';
import { api, archivfassungAblegen, BASIS, beispielPdf, daten, LENA, rauchtest, schemaWechseln, sitzung, verwalten } from '../hilfen.mjs';
import { axePruefen, tippflaechenPruefen } from '../muster.mjs';

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

/* ---------- Dokumentliste (#1211, Fund 7 aus #1271) ---------- */

const RECHNUNG_EML = Buffer.from(
  [
    'From: Lena Beispiel <lena@example.org>',
    'To: Jonas Beispiel <jonas@example.org>',
    'Subject: Rechnung Schornsteinfeger',
    'Date: Tue, 16 Nov 2027 08:00:00 +0100',
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    '',
    'Hallo Jonas, anbei die Rechnung vom Schornsteinfeger.',
    '',
  ].join('\r\n'),
);

rauchtest(
  'Dokumentliste: „Ansehen“, Menü „⋯“, Umschalter „PDF/A · Original“, Original nicht anzeigbar (#1211, #1271)',
  {
    als: LENA,
    // Das Vorschaubild entsteht im Hintergrund; der erste Abruf kann es noch nicht finden.
    erwartet: [{ status: 404, pfad: /^\/api\/dokumente\/[^/]+\/vorschau$/ }],
  },
  async (s) => {
    const cookie = await sitzung(LENA);
    const { typ } = daten.archiv;
    const mappe = (
      await api('POST', '/api/mappen', { cookie, body: { typId: typ.id, werte: { objekt: 'Schornstein Hofweg', beendet: '2027-02-28' } } })
    ).daten;
    const mail = (
      await api(
        'POST',
        `/api/mappen/${mappe.id}/dokumente?register=dokumente&name=${encodeURIComponent('Rechnung Schornsteinfeger.eml')}&typ=message/rfc822`,
        { cookie, body: RECHNUNG_EML, roh: true },
      )
    ).daten.dokument;
    await archivfassungAblegen(mail.sha256, beispielPdf('Von: Lena Beispiel\nBetreff: Rechnung Schornsteinfeger'));
    await s.goto(BASIS + `/ablage/${typ.id}/${mappe.id}`);
    const bereich = s.getByRole('region', { name: 'Mappe' });
    await bereich.getByRole('tab', { name: 'Dokumente 1' }).click();
    const zeile = s.locator('.dokzeile').filter({ hasText: 'Rechnung Schornsteinfeger.eml' });
    // Je Zeile genau zwei Knöpfe: „Ansehen“ und „⋯“.
    const knoepfe = zeile.locator('.zeilenaktionen').getByRole('button');
    assert.deepEqual(await knoepfe.evaluateAll((l) => l.map((b) => b.getAttribute('aria-label') || b.textContent?.trim())), [
      'Ansehen',
      'Weitere Handlungen für Rechnung Schornsteinfeger.eml',
    ]);
    // Menü „⋯“: öffnet mit Einträgen, Esc schließt es wieder.
    await zeile.getByRole('button', { name: 'Weitere Handlungen für Rechnung Schornsteinfeger.eml' }).click();
    const menue = s.getByRole('menu', { name: 'Weitere Handlungen für Rechnung Schornsteinfeger.eml' });
    assert.ok((await menue.getByRole('menuitem').count()) > 0, 'Menü mit Einträgen');
    await s.keyboard.press('Escape');
    await menue.waitFor({ state: 'hidden' });
    // „Ansehen“: Archivfassung im Betrachter, Umschalter „PDF/A · Original“.
    await zeile.getByRole('button', { name: 'Ansehen' }).click();
    const fassung = s.getByRole('radiogroup', { name: 'Fassung' });
    assert.ok(await fassung.getByRole('radio', { name: 'PDF/A' }).isChecked(), 'PDF/A ist gewählt');
    await s.locator('.dokansicht iframe').waitFor();
    const funde = [];
    for (const schema of ['light', 'dark']) {
      await schemaWechseln(s, schema);
      for (const v of await axePruefen(s, ['.spalte.mappe'])) funde.push(`PDF/A (${schema}): ${v}`);
    }
    await schemaWechseln(s, 'light');
    // „Original“: Die Mail kann der Browser nicht zeigen – ein Satz und „Original herunterladen“, kein Betrachter.
    await fassung.getByRole('radio', { name: 'Original' }).click();
    await s.getByText('Ein Original im Format .eml kann Ablago nicht direkt anzeigen.').waitFor();
    await s.locator('.dokansicht').getByRole('button', { name: 'Original herunterladen' }).waitFor();
    assert.equal(await s.locator('.dokansicht iframe').count(), 0, 'kein Betrachter für das Original');
    for (const v of await axePruefen(s, ['.spalte.mappe'])) funde.push(`Original: ${v}`);
    // Zurück auf PDF/A und schließen.
    await fassung.getByRole('radio', { name: 'PDF/A' }).click();
    await s.locator('.dokansicht iframe').waitFor();
    await zeile.getByRole('button', { name: 'Schließen' }).click();
    await s.locator('.dokansicht').waitFor({ state: 'detached' });
    assert.deepEqual(funde, [], `axe in der Dokumentliste:\n${funde.join('\n')}`);
  },
);

/* ---------- Kleine Funde der Abnahme (#1271) ---------- */

rauchtest(
  'Kleine Funde (#1271): Leerflächen ohne Strichrand, kein Wortbruch, leer nicht grün, ganzer Platzhalter',
  { als: LENA },
  async (s) => {
    // Startseite: Favoriten leer → leise, ohne Haken; „Nichts zu erledigen“ darf grün sein.
    await s.goto(BASIS + '/ablage/start');
    const fav = s.locator('[data-kachel="wahl"]');
    await fav.waitFor();
    if (await fav.locator('[data-leer]').count()) assert.equal(await fav.locator('[data-leer]').getAttribute('data-leer'), 'leise');
    // Suchfeld „Ansicht suchen …“: leer ohne Platz für das „×“, der Platzhalter passt ganz hinein.
    const feld = s.getByRole('complementary', { name: 'Ansichten' }).getByPlaceholder('Ansicht suchen …');
    const passt = await feld.evaluate((el) => {
      const st = getComputedStyle(el);
      const c = document.createElement('canvas').getContext('2d');
      c.font = `${st.fontSize} ${st.fontFamily}`;
      return c.measureText(el.placeholder).width <= el.clientWidth - parseFloat(st.paddingLeft) - parseFloat(st.paddingRight);
    });
    assert.ok(passt, 'Platzhalter „Ansicht suchen …“ wird abgeschnitten');
    // Ablage: Ansicht ohne gewählte Mappe – ruhige Fläche ohne Strichrand.
    await s.goto(BASIS + '/ablage/favoriten');
    const leer = s.locator('.spalte.mappe .platzhalter');
    await leer.waitFor();
    assert.equal(await leer.evaluate((el) => getComputedStyle(el).borderTopStyle), 'none', 'Leerfläche der Ablage gestrichelt');
    // Werkbank: Leerfläche, Leistenname ohne Silbentrennung.
    await verwalten(s);
    await s.goto(BASIS + '/werkbank/typen');
    const wb = s.locator('.spalte.mappe .platzhalter');
    await wb.waitFor();
    assert.equal(await wb.evaluate((el) => getComputedStyle(el).borderTopStyle), 'none', 'Leerfläche der Werkbank gestrichelt');
    const vorlagen = s.locator('nav.werkbankleiste a[href="/werkbank/ablaufvorlagen"] .nm');
    assert.equal((await vorlagen.textContent())?.trim(), 'Vorlagen für Automatisierungen');
    assert.equal(await vorlagen.evaluate((el) => getComputedStyle(el).hyphens), 'manual');
  },
);

rauchtest('Werkbank am Handy: Gruppen als Reiter, axe hell/dunkel (#1271)', { als: LENA, handy: true }, async (s) => {
  await s.goto(BASIS + '/ablage/start');
  await verwalten(s);
  await s.goto(BASIS + '/werkbank');
  const reihe = s.getByRole('tablist', { name: 'Bereiche der Werkbank' });
  await reihe.waitFor();
  // Nur Reiter in der Registerliste – die Übersicht steht als Link davor.
  assert.equal(await reihe.getByRole('link').count(), 0, 'Links in der Registerliste');
  const reiter = reihe.getByRole('tab');
  assert.ok((await reiter.count()) > 2);
  await reiter.nth(1).click();
  assert.equal(await reiter.nth(1).getAttribute('aria-selected'), 'true');
  const flaeche = s.getByRole('tabpanel');
  await flaeche.locator('nav.werkbankleiste .wbgruppe.gewaehlt a.sicht').first().waitFor();
  const funde = [];
  for (const schema of ['light', 'dark']) {
    await schemaWechseln(s, schema);
    for (const v of await axePruefen(s, ['.spalte.sichten'])) funde.push(`${schema}: ${v}`);
  }
  assert.deepEqual(funde, [], `axe an den Reitern der Werkbank:\n${funde.join('\n')}`);
});

/* ---------- Werkbank-Übersicht zweigeteilt (#1284) ---------- */

for (const handy of [false, true])
  rauchtest(
    `Werkbank-Übersicht zweigeteilt, jeder Hinweis genau einmal${handy ? ' (Handy)' : ''} (#1284)`,
    { als: LENA, handy },
    async (s) => {
      await s.goto(BASIS + '/ablage/start');
      await verwalten(s);
      await s.goto(BASIS + '/werkbank');
      const seite = s.locator('.spalte.liste .uebersicht');
      await seite.locator('.uebersicht-hinweise').waitFor();
      // Zweigeteilt: keine rechte Spalte, Kacheln und Hinweise in derselben Spalte.
      assert.equal(await s.locator('.spalte.mappe').count(), 0, 'keine dritte Spalte');
      assert.ok((await seite.locator('[data-kachel], a').count()) > 0);
      const texte = await s
        .locator('main')
        .evaluate((m) => [...m.querySelectorAll('.uebersicht-hinweisliste > li > p')].map((p) => p.textContent.trim()));
      assert.ok(texte.length > 0, 'die Testinstallation hat Hinweise');
      for (const x of texte) {
        const kern = x.replace(/^[^:]*: /, '').slice(0, 40);
        assert.equal(await s.locator('main').getByText(kern, { exact: false }).count(), 1, `„${kern}“ steht mehr als einmal`);
      }
      // Die Zahl an „Übersicht“ in der Navigation bleibt.
      assert.equal(await s.locator('a[data-anker="werkbank.bereich:uebersicht"] [data-zahl]').first().getAttribute('data-zahl'), 'warnung');
      const funde = [];
      for (const schema of ['light', 'dark']) {
        await schemaWechseln(s, schema);
        for (const v of await axePruefen(s, ['.spalte.sichten', '.spalte.liste'])) funde.push(`${schema}: ${v}`);
      }
      assert.deepEqual(funde, [], `axe auf der Übersicht:\n${funde.join('\n')}`);
    },
  );

/* ---------- Verwaltungsmodus: ruhige Zeile in der Werkbank, rot in der Ablage (#1252) ---------- */

for (const handy of [false, true])
  rauchtest(
    `Verwaltungsmodus: Werkbank ruhig mit Restzeit, Ablage rot${handy ? ' (Handy)' : ''} (#1252)`,
    { als: LENA, handy },
    async (s) => {
      await s.goto(BASIS + '/ablage/start');
      await verwalten(s);
      await s.goto(BASIS + '/werkbank/typen');
      const oben = s.getByRole('region', { name: 'Du verwaltest gerade Ablago.' });
      await oben.locator('.vb-zeile').waitFor();
      // Werkbank: ruhige Zeile mit Restzeit, nichts Rotes, kein Satz in der Statusmeldung.
      assert.match((await oben.locator('.vb-zeile').textContent()) ?? '', /^Verwaltung · noch 1[45] Min\.$/);
      assert.equal(((await oben.locator('.vb-satz').textContent()) ?? '').trim(), '', 'kein Satz zum Vorlesen in der Werkbank');
      const farbe = await oben.evaluate((el) => getComputedStyle(el).backgroundColor);
      const flaeche = await s.evaluate(() => {
        const p = document.createElement('div');
        p.style.background = 'var(--flaeche)';
        document.body.append(p);
        const f = getComputedStyle(p).backgroundColor;
        p.remove();
        return f;
      });
      assert.equal(farbe, flaeche, 'Zeile ohne rote Fläche');
      const beenden = oben.getByRole('button', { name: 'Verwaltung beenden' });
      assert.equal(await beenden.getAttribute('data-knopf'), 'neben');
      if (handy) {
        // Tippfläche 44 px (unsichtbar über und unter dem kleinen Knopf, #1027) – gemessen wie auf der Musterseite.
        assert.deepEqual(await tippflaechenPruefen(s, ['.verwaltungsbalken']), [], 'Tippflächen der Zeile');
        const { breit, sicht } = await s.evaluate(() => ({ breit: document.documentElement.scrollWidth, sicht: innerWidth }));
        assert.ok(breit <= sicht, 'breiter als der Bildschirm');
      }
      const funde = [];
      for (const schema of ['light', 'dark']) {
        await schemaWechseln(s, schema);
        for (const v of await axePruefen(s, ['.verwaltungsbalken'])) funde.push(`Werkbank ${schema}: ${v}`);
      }
      await schemaWechseln(s, 'light');
      // Ablage: der rote Balken mit dem Grund – derselbe Statusbereich bekommt jetzt den Satz (einmal vorgelesen).
      await s.getByRole('banner').getByRole('link', { name: 'Ablage', exact: true }).click();
      await oben.getByText('Du siehst auch gesperrte Mappen, und was du öffnest, steht in deren Historie.').waitFor();
      assert.equal(await oben.locator('.vb-zeile').count(), 0);
      assert.match((await oben.locator('.vb-satz').textContent()) ?? '', /Du verwaltest gerade Ablago\./);
      for (const schema of ['light', 'dark']) {
        await schemaWechseln(s, schema);
        for (const v of await axePruefen(s, ['.verwaltungsbalken'])) funde.push(`Ablage ${schema}: ${v}`);
      }
      // Mein Konto zählt wie die Werkbank.
      await s.goto(BASIS + '/profil');
      await oben.locator('.vb-zeile').waitFor();
      assert.deepEqual(funde, [], `axe am Verwaltungsmodus:\n${funde.join('\n')}`);
    },
  );
