/**
 * Rauchtests: Von Ablago mitgeliefert (#1570) – eigener Abschnitt unter den installierten Paketen, Seite je
 * mitgeliefertem Teil mit Schalter und umgezogenen Einstellungen, Rückfrage vor dem Ausschalten mit Folge, Ersatz und
 * Katalog, ausgeschaltet „aus“ und „ausgelassen“ statt eines Fehlers; alte Adressen leiten um, die Suche der Leiste findet
 * die alten Namen. axe hell und dunkel, am Rechner und am Handy.
 * Allein starten (frisch gestartetes Ablago, siehe rauchtest.mjs): node web/rauchtest/bereiche/werkbank-mitgeliefert.mjs [fehlerordner]
 */
import assert from 'node:assert/strict';
import '../einrichtung.mjs';
import {
  api,
  BASIS,
  beispielPdf,
  keineWaagerechteRolle,
  LENA,
  rauchtest,
  schemaWechseln,
  sitzung,
  verwalten,
  WERKBANK_BEREICHE,
} from '../hilfen.mjs';
import { axePruefen } from '../muster.mjs';

const NAMEN = ['Text aus PDF und Texterkennung', 'Archivfassung (PDF/A)', 'Umwandeln', 'PDF bearbeiten', 'Briefsatz', 'E-Rechnung lesen'];

/** axe hell und dunkel über die Bereiche; Rückgabe: Funde als Zeilen. */
async function axeHellDunkel(s, bereiche, wo) {
  const funde = [];
  for (const schema of ['light', 'dark']) {
    await schemaWechseln(s, schema);
    for (const v of await axePruefen(s, bereiche)) funde.push(`${wo} ${schema}: ${v}`);
  }
  await schemaWechseln(s, 'light');
  return funde;
}

/** Schalter wieder an (für spätere Bereiche) – über die Schnittstelle der Seite, auch wenn der Test vorher scheitert. */
async function wiederAn(s) {
  for (const id of ['ablago.text', 'ablago.pdf'])
    await s.request
      .put(`${BASIS}/api/werkbank/leistungen/anbieter/${id}`, { headers: { 'x-dms': '1' }, data: { an: true } })
      .catch(() => {});
}

/** Ein PDF in eine eigene Mappe legen und warten, bis die Texterkennung es erledigt hat; Rückgabe: Stand der Texterkennung. */
async function pdfAblegen(name) {
  const c = await sitzung(LENA);
  await api('POST', '/api/konto/verwaltung', { cookie: c, body: { passwort: LENA.passwort } });
  const typ = (
    await api('POST', '/api/typen', {
      cookie: c,
      body: {
        name: `Rauchtest ${name}`,
        schluessel: `rauchtest_${name}`,
        titelVorlage: '{name}',
        felder: [{ key: 'name', label: 'Name', typ: 'text', pflicht: true }],
        register: [
          { key: 'allgemein', name: 'Allgemein', art: 'felder', felder: ['name'] },
          { key: 'dokumente', name: 'Dokumente', art: 'dokumente' },
        ],
      },
    })
  ).daten;
  const m = (await api('POST', '/api/mappen', { cookie: c, body: { typId: typ.id, werte: { name } } })).daten;
  await api('POST', `/api/mappen/${m.id}/dokumente?register=dokumente&name=${name}.pdf&typ=application/pdf`, {
    cookie: c,
    body: beispielPdf('Ausgeschaltet ohne Ersatz'),
    roh: true,
  });
  let ocr;
  for (let i = 0; i < 100; i++) {
    ocr = (await api('GET', `/api/mappen/${m.id}`, { cookie: c })).daten.dokumente[0]?.ocr;
    if (['ausgelassen', 'fehler', 'fertig'].includes(ocr?.stand)) break;
    await new Promise((r) => setTimeout(r, 150));
  }
  return ocr;
}

for (const handy of [false, true])
  rauchtest(
    `Pakete: „Von Ablago mitgeliefert“ unter den installierten, Seite mit Schalter (#1570)${handy ? ', Handy' : ''}`,
    { als: LENA, handy },
    async (s) => {
      await s.goto(BASIS + '/ablage/start');
      await verwalten(s);
      await s.goto(BASIS + '/werkbank/pakete');
      const abschnitt = s.locator('[data-anker="werkbank.pakete.mitgeliefert"]');
      await abschnitt.getByRole('heading', { name: 'Von Ablago mitgeliefert' }).waitFor();
      const zeilen = abschnitt.getByRole('link');
      await zeilen.first().waitFor();
      assert.deepEqual(
        (await zeilen.locator('.titel').allTextContents()).map((x) => x.replace(/\s*Ablago$/, '').trim()),
        NAMEN,
        'Namen ohne „Ablago ·“, mit dem Etikett „Ablago“',
      );
      assert.equal(await abschnitt.getByText('aus', { exact: true }).count(), 0, 'nach dem Update alles an');
      // Unter den installierten, vor den verfügbaren Paketen.
      assert.ok(
        await s.evaluate(() => {
          const ueber = [...document.querySelectorAll('.spalte.liste h2.ueber')].map((h) => h.textContent);
          return (
            ueber.indexOf('Installiert') < ueber.indexOf('Von Ablago mitgeliefert') &&
            ueber.indexOf('Von Ablago mitgeliefert') < ueber.indexOf('Verfügbar')
          );
        }),
        'Reihenfolge: Installiert, Von Ablago mitgeliefert, Verfügbar',
      );
      // „Wer macht das?“ nur mit mehr als einem je Tätigkeit – hier macht alles Ablago.
      assert.equal(await s.locator('#wer-macht-das').count(), 0, '„Wer macht das?“ nicht sichtbar');
      const funde = handy ? [] : await axeHellDunkel(s, ['.spalte.liste'], 'Liste');
      // Seite „Text aus PDF und Texterkennung“: Schalter, was es macht, die umgezogenen Einstellungen.
      await zeilen.filter({ hasText: NAMEN[0] }).click();
      await s.waitForURL(/\/werkbank\/pakete\/ablago\.text$/);
      const seite = s.locator('.spalte.mappe');
      await seite.getByRole('heading', { name: /^Text aus PDF und Texterkennung/, level: 1 }).waitFor();
      const schalter = seite.getByRole('switch', { name: 'Eingeschaltet' });
      assert.equal(await schalter.getAttribute('aria-checked'), 'true');
      await seite.locator('#macht').getByRole('cell', { name: 'Text lesen' }).waitFor();
      await seite.locator('#macht').getByText('Für Fachleute: technische Namen').waitFor();
      assert.equal(await seite.getByText('dokument.lesen.text@1').isVisible(), false, 'technischer Name nur aufgeklappt');
      await seite.getByRole('heading', { name: 'Warteschlange', exact: true }).waitFor();
      await seite.locator('#suche').getByRole('heading', { name: 'Suche: Tippfehler' }).waitFor();
      assert.equal(await seite.getByText(/Anbieter|Leistung/).count(), 0, 'keine Wörter „Anbieter“ oder „Leistung“');
      await s.waitForLoadState('networkidle');
      funde.push(...(await axeHellDunkel(s, WERKBANK_BEREICHE, 'Seite')));
      if (handy) await keineWaagerechteRolle(s);
      // PDF bearbeiten: „Neue PDFs automatisch verkleinern“ steht jetzt hier; Briefsatz hat nichts einzustellen.
      await s.goto(BASIS + '/werkbank/pakete/ablago.pdf');
      await s
        .locator('#automatisch-verkleinern')
        .getByRole('heading', { name: /Neue PDFs automatisch verkleinern/ })
        .waitFor();
      await s.goto(BASIS + '/werkbank/pakete/ablago.briefsatz');
      await s.getByText('Hier gibt es nichts einzustellen.').waitFor();
      if (handy) await keineWaagerechteRolle(s);
      assert.deepEqual(funde, [], `axe meldet Verstöße:\n${funde.join('\n')}`);
    },
  );

for (const handy of [false, true])
  rauchtest(
    `Mitgeliefert ausschalten: Rückfrage mit Folge und Ersatz, „aus“, ausgelassen statt Fehler (#1570)${handy ? ', Handy' : ''}`,
    { als: LENA, handy },
    async (s) => {
      try {
        await s.goto(BASIS + '/ablage/start');
        await verwalten(s);
        await s.goto(BASIS + '/werkbank/pakete/ablago.text');
        const seite = s.locator('.spalte.mappe');
        const schalter = seite.getByRole('switch', { name: 'Eingeschaltet' });
        await schalter.waitFor();
        // Abbrechen lässt alles an.
        await schalter.click();
        const dialog = s.getByRole('alertdialog');
        await dialog.getByText('„Text aus PDF und Texterkennung“ ausschalten?').waitFor();
        await dialog.getByText(/liest Ablago den Text neuer PDFs nicht mehr/).waitFor();
        await dialog.getByText(/Ein anderes Paket dafür ist nicht installiert\./).waitFor();
        const katalog = dialog.getByRole('link', { name: /Im Katalog suchen/ });
        assert.match(await katalog.getAttribute('href'), /^https:\/\/catalog\.ablago\.app\/leistungen\/dokument\.lesen\.text%401$/);
        assert.equal(await katalog.getAttribute('target'), '_blank');
        const funde = await axeHellDunkel(s, ['[role="alertdialog"]'], 'Rückfrage');
        await dialog.getByRole('button', { name: 'Abbrechen' }).click();
        await dialog.waitFor({ state: 'detached' });
        assert.equal(await schalter.getAttribute('aria-checked'), 'true', 'abgebrochen: bleibt an');
        // Ausschalten.
        await schalter.click();
        await s.getByRole('alertdialog').getByRole('button', { name: 'Ausschalten' }).click();
        await s.waitForFunction(() => document.querySelector('.spalte.mappe [role="switch"]')?.getAttribute('aria-checked') === 'false');
        const hinweis = seite.locator('#schalter [role="status"]');
        await hinweis.getByText(/^Ausgeschaltet\. Ohne „Text aus PDF und Texterkennung“/).waitFor();
        await hinweis.getByRole('link', { name: /Im Katalog suchen/ }).waitFor();
        await seite.locator('h1').getByText('aus', { exact: true }).waitFor();
        await s.waitForLoadState('networkidle');
        funde.push(...(await axeHellDunkel(s, WERKBANK_BEREICHE, 'aus')));
        if (handy) await keineWaagerechteRolle(s);
        // In der Liste bleibt die Zeile stehen, mit „aus“.
        await s.goto(BASIS + '/werkbank/pakete');
        const zeile = s.locator('[data-anker="werkbank.pakete.mitgeliefert"] a', { hasText: 'Text aus PDF und Texterkennung' });
        await zeile.getByText('aus', { exact: true }).waitFor();
        // Ein neues PDF: kein Fehler, sondern „ausgelassen“ mit dem Grund und dem Weg in den Katalog.
        if (!handy) {
          const ocr = await pdfAblegen('mitgeliefert_aus');
          assert.equal(ocr?.stand, 'ausgelassen', JSON.stringify(ocr));
          assert.match(ocr.info, /macht hier gerade niemand.*Im Katalog nachsehen: https:\/\/catalog\.ablago\.app\//);
        }
        // Wieder einschalten: sofort, ohne Rückfrage.
        await s.goto(BASIS + '/werkbank/pakete/ablago.text');
        await seite.getByRole('switch', { name: 'Eingeschaltet' }).click();
        await s.waitForFunction(() => document.querySelector('.spalte.mappe [role="switch"]')?.getAttribute('aria-checked') === 'true');
        assert.equal(await s.getByRole('alertdialog').count(), 0, 'Einschalten ohne Rückfrage');
        assert.deepEqual(funde, [], `axe meldet Verstöße:\n${funde.join('\n')}`);
      } finally {
        await wiederAn(s);
      }
    },
  );

for (const handy of [false, true])
  rauchtest(
    `Alte Adressen und Namen führen unter Pakete → Von Ablago mitgeliefert (#1570)${handy ? ', Handy' : ''}`,
    { als: LENA, handy },
    async (s) => {
      await s.goto(BASIS + '/ablage/start');
      await verwalten(s);
      for (const [alt, neu] of [
        ['/werkbank/texterkennung', /\/werkbank\/pakete\/ablago\.text$/],
        ['/werkbank/texterkennung#zeitgrenze', /\/werkbank\/pakete\/ablago\.text#zeitgrenze$/],
        ['/werkbank/suche', /\/werkbank\/pakete\/ablago\.text#suche$/],
        ['/werkbank/texterkennung#archivfassung', /\/werkbank\/pakete\/ablago\.archiv#archivfassung$/],
        ['/werkbank/texterkennung#umwandlung', /\/werkbank\/pakete\/ablago\.umwandeln#umwandlung$/],
        ['/werkbank/systemzustand#automatisch-verkleinern', /\/werkbank\/pakete\/ablago\.pdf#automatisch-verkleinern$/],
      ]) {
        await s.goto(BASIS + alt);
        await s.waitForURL(neu);
        await s.locator('.spalte.mappe h1').first().waitFor();
      }
      // Die Sprungmarke trägt: der Abschnitt steht da.
      await s.locator('#automatisch-verkleinern').waitFor();
      await s.waitForLoadState('networkidle');
      const funde = await axeHellDunkel(s, WERKBANK_BEREICHE, 'PDF bearbeiten');
      if (handy) await keineWaagerechteRolle(s);
      // Leiste: „Suche und Volltext“ steht nicht mehr da; die Suche findet es unter altem Namen und führt zur neuen Seite.
      await s.goto(BASIS + (handy ? '/werkbank?bereiche' : '/werkbank'));
      const nav = s.locator('nav.werkbankleiste');
      await nav.waitFor();
      await s.waitForFunction(() => document.querySelector('nav.werkbankleiste')?.getAttribute('aria-busy') !== 'true');
      assert.equal(await nav.locator('a[href="/werkbank/texterkennung"]').count(), 0, 'kein Eintrag „Suche und Volltext“ mehr');
      await nav.getByRole('searchbox').fill('Suche und Volltext');
      const treffer = nav.getByRole('link', { name: 'Text aus PDF und Texterkennung' });
      await treffer.waitFor();
      await treffer.click();
      await s.waitForURL(/\/werkbank\/pakete\/ablago\.text$/);
      await s.getByRole('heading', { name: /^Text aus PDF und Texterkennung/, level: 1 }).waitFor();
      assert.deepEqual(funde, [], `axe meldet Verstöße:\n${funde.join('\n')}`);
    },
  );

// „Wer macht das?“ erscheint erst, wenn eine Tätigkeit mehr als einer kann. Pakete, die Tätigkeiten anbieten, kommen mit
// #1572 – bis dahin spielt der Test ein zweites für „Text lesen“ über die Antwort des Servers vor.
rauchtest('Pakete: „Wer macht das?“ nur mit mehr als einem je Tätigkeit, Wahl speichert (#1570)', { als: LENA }, async (s) => {
  await s.goto(BASIS + '/ablage/start');
  await verwalten(s);
  const gesendet = [];
  const mitPaket = (stand, gewaehlt = null) => ({
    ...stand,
    taetigkeiten: stand.taetigkeiten.map((x) =>
      x.leistung === 'dokument.lesen.text@1'
        ? { ...x, gewaehlt, macher: [...x.macher, { id: 'texterkennung', art: 'paket', name: 'Texterkennung', an: true }] }
        : x,
    ),
  });
  await s.route(/\/api\/werkbank\/leistungen\/(anbieter|wahl)$/, async (r) => {
    const echt = await (await r.fetch({ method: 'GET', url: BASIS + '/api/werkbank/leistungen/anbieter' })).json();
    if (r.request().method() === 'PUT') {
      const b = r.request().postDataJSON();
      gesendet.push(b);
      return r.fulfill({ json: mitPaket(echt, b.anbieter) });
    }
    return r.fulfill({ json: mitPaket(echt) });
  });
  await s.goto(BASIS + '/werkbank/pakete');
  const abschnitt = s.locator('#wer-macht-das');
  await abschnitt.getByRole('heading', { name: 'Wer macht das?' }).waitFor();
  assert.deepEqual(await abschnitt.locator('th').allTextContents(), ['Tätigkeit', 'macht', 'Dateitypen']);
  assert.equal(await abschnitt.locator('tbody tr').count(), 1, 'nur die Tätigkeit mit mehr als einem');
  const wahl = abschnitt.getByLabel('Wer macht „Text lesen“?');
  assert.equal(await wahl.locator('option:checked').textContent(), 'Ablago (Vorgabe)');
  const funde = await axeHellDunkel(s, ['#wer-macht-das'], 'Wer macht das?');
  await wahl.selectOption('texterkennung');
  await abschnitt.getByText('„Text lesen“ macht jetzt Texterkennung.').waitFor();
  assert.deepEqual(gesendet, [{ leistung: 'dokument.lesen.text@1', anbieter: 'texterkennung' }]);
  await wahl.selectOption('');
  await abschnitt.getByText('„Text lesen“ macht jetzt Ablago.').waitFor();
  assert.deepEqual(gesendet.at(-1), { leistung: 'dokument.lesen.text@1', anbieter: null });
  assert.deepEqual(funde, [], `axe meldet Verstöße:\n${funde.join('\n')}`);
});
