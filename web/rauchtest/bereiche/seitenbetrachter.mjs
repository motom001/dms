/**
 * Rauchtests: Seitenbetrachter (#1323, #1324, #1339) – ein Dokument als Seiten in Spaltenbreite, beim Übernehmen und in
 * der Mappe gleich: ein Scrollbereich (die Spalte), klebender Kopf mit „Seite n von N“, Springen per Eingabe und Enter,
 * Bilder und Wörter erst in der Nähe.
 * Allein starten (frisch gestartetes Ablago, siehe rauchtest.mjs): node web/rauchtest/bereiche/seitenbetrachter.mjs [fehlerordner]
 */
import assert from 'node:assert/strict';
import '../einrichtung.mjs';
import {
  api,
  archivfassungAblegen,
  BASIS,
  beispielPdfSeiten,
  daten,
  keineWaagerechteRolle,
  LENA,
  rauchtest,
  schemaWechseln,
  sitzung,
} from '../hilfen.mjs';
import { axePruefen, tippflaechenPruefen } from '../muster.mjs';

/** PDF mit `n` Seiten, je Seite ein paar Zeilen Text. */
const seitenPdf = (titel, n) =>
  beispielPdfSeiten(Array.from({ length: n }, (_, i) => `${titel} Seite ${i + 1}\nAbschnitt ${i + 1} Beispielweg 12 Dresden`));

async function hochladen(cookie, mappe, name, pdf) {
  return (
    await api('POST', `/api/mappen/${mappe}/dokumente?register=dokumente&name=${encodeURIComponent(name)}&typ=application/pdf`, {
      cookie,
      body: pdf,
      roh: true,
    })
  ).daten.dokument;
}

/** Elemente in `bereich`, die selbst senkrecht rollen (eigener Scrollbalken) – die Spalte zählt nicht. */
const eigeneRollen = (s, bereich) =>
  s.evaluate((sel) => {
    const wurzel = document.querySelector(sel);
    return [...wurzel.querySelectorAll('*')]
      .filter((el) => /(auto|scroll)/.test(getComputedStyle(el).overflowY) && el.scrollHeight > el.clientHeight + 1)
      .map((el) => `${el.tagName.toLowerCase()}.${[...el.classList].join('.')}`);
  }, bereich);

/** Die Spalte, in der `sel` steht, rollt nach oben; dann steht der Kopf noch oben an ihr (klebend)? */
const kopfKlebt = (s, kopf) =>
  kopf.evaluate((k) => {
    let spalte = k.parentElement;
    while (spalte && !spalte.classList.contains('spalte')) spalte = spalte.parentElement;
    return Math.abs(k.getBoundingClientRect().top - spalte.getBoundingClientRect().top) < 4;
  });

/** Springen über „Seite [n] von N“: Zahl eingeben, Enter – danach steht die Seite oben und hat den Fokus. */
async function springe(s, bereich, nr, anzahl) {
  const feld = bereich.getByRole('textbox', { name: `Seite (1 bis ${anzahl}), mit Enter dorthin springen` });
  await feld.fill(String(nr));
  await feld.press('Enter');
  await s.waitForFunction((n) => document.activeElement?.dataset?.seite === String(n), nr);
  await bereich.getByRole('img', { name: `Seite ${nr} von ${anzahl}`, exact: true }).waitFor();
  assert.equal(await feld.inputValue(), String(nr));
  return feld;
}

rauchtest(
  'Übernehmen: Seiten rollen mit der Spalte, klebender Kopf, „Seite n von N“ und Springen (#1323, #1324, #1339)',
  { als: LENA, timeout: 90_000 },
  async (s) => {
    const cookie = await sitzung(LENA);
    const brief = (await api('POST', '/api/post', { cookie, body: { betreff: 'Bedienungsanleitung Wärmepumpe' } })).daten;
    const dok = await hochladen(cookie, brief.id, 'Bedienungsanleitung Wärmepumpe.pdf', seitenPdf('Wärmepumpe', 14));
    // Mit Archivfassung: Der Umschalter „PDF/A · Original“ steht im klebenden Kopf neben „Seite n von N“.
    await archivfassungAblegen(dok.sha256, seitenPdf('Wärmepumpe', 14));
    try {
      await s.goto(BASIS + `/ablage/eingang/${brief.id}`);
      await s.waitForURL(new RegExp(`/${brief.id}/uebernehmen$`));
      const blatt = s.getByRole('region', { name: 'Dokument' }).getByRole('article', { name: 'Bedienungsanleitung Wärmepumpe.pdf' });
      await blatt.getByRole('img', { name: 'Seite 1 von 14', exact: true }).waitFor();
      await blatt.getByRole('radio', { name: 'PDF/A', checked: true }).waitFor();
      // Ein Scrollbereich (#1323): Innerhalb der Mitte rollt nichts selbst, nur die Spalte.
      assert.deepEqual(await eigeneRollen(s, '.ue-mitte'), [], 'Eigener Scrollbalken in der Mitte');
      // Nur die Seiten in der Nähe haben ein Bild (#1339).
      const bilder = await blatt.locator('figure[data-seite] img').count();
      assert.ok(bilder > 0 && bilder < 14, `Bilder aller Seiten auf einmal (${bilder})`);
      // Springen (#1324): Seite 11 steht oben, der Kopf klebt, die Zahl folgt.
      await springe(s, blatt, 11, 14);
      const kopf = blatt.locator('[data-seitenkopf]');
      assert.ok(await kopfKlebt(s, kopf), 'Der Kopf des Dokuments bleibt oben stehen');
      assert.ok((await blatt.locator('.ue-wort').count()) > 0, 'Wörter zum Markieren an den nahen Seiten');
      // Zurück nach oben rollen: Die Zahl folgt dem Rollen.
      await s.locator('.ue-mitte').evaluate((el) => el.scrollTo(0, 0));
      const zahl = await blatt.getByRole('textbox', { name: /^Seite \(1 bis 14\)/ }).elementHandle();
      await s.waitForFunction((el) => el.value === '1', zahl);
      // Tastatur: Der Betrachter bleibt fokussierbar, Bild ab rollt die Spalte.
      await blatt.getByRole('group', { name: 'Bedienungsanleitung Wärmepumpe.pdf' }).focus();
      await s.keyboard.press('PageDown');
      await s.waitForFunction(() => document.querySelector('.ue-mitte').scrollTop > 100);
      await s.waitForLoadState('networkidle');
      const funde = [];
      for (const schema of ['light', 'dark']) {
        await schemaWechseln(s, schema);
        for (const v of await axePruefen(s, ['.spalte.liste'])) funde.push(`${schema}: ${v}`);
      }
      assert.deepEqual(funde, [], `axe meldet Verstöße:\n${funde.join('\n')}`);
    } finally {
      await api('DELETE', `/api/mappen/${brief.id}?grund=nicht_noetig`, { cookie });
    }
  },
);

rauchtest('Mappe: PDF als Seiten wie beim Übernehmen, ohne Browser-Betrachter, mit Seitensprung (#1324)', { als: LENA }, async (s) => {
  const cookie = await sitzung(LENA);
  const typ = daten.bausteine;
  const mappe = (await api('POST', '/api/mappen', { cookie, body: { typId: typ.id, werte: { objekt: 'Heizungsraum Seiten' } } })).daten;
  await hochladen(cookie, mappe.id, 'Wartungsheft Heizung.pdf', seitenPdf('Wartungsheft', 30));
  try {
    await s.goto(BASIS + `/ablage/${typ.id}/${mappe.id}`);
    const bereich = s.getByRole('region', { name: 'Mappe' });
    await bereich.getByRole('heading', { name: 'Heizungsraum Seiten', level: 1 }).waitFor();
    await bereich.getByRole('tab', { name: /^Dokumente/ }).click();
    await bereich.getByRole('button', { name: 'Wartungsheft Heizung.pdf', exact: true }).click();
    const anzeige = s.locator('.dokansicht');
    await anzeige.getByRole('img', { name: 'Seite 1 von 30', exact: true }).waitFor();
    assert.equal(await anzeige.locator('iframe').count(), 0, 'kein PDF-Betrachter des Browsers');
    assert.ok((await anzeige.locator('figure[data-seite] img').count()) < 30, 'Bilder erst in der Nähe');
    assert.deepEqual(await eigeneRollen(s, '.spalte.mappe'), [], 'Eigener Scrollbalken in der Mappe');
    await anzeige.getByRole('link', { name: 'Wartungsheft Heizung.pdf in neuem Tab öffnen' }).waitFor();
    await springe(s, anzeige, 27, 30);
    assert.ok(await kopfKlebt(s, anzeige.locator('[data-seitenkopf]')), 'Der Kopf der Anzeige bleibt oben stehen');
    // Eine Zahl über der letzten Seite springt ans Ende.
    await springe(s, anzeige, 30, 30);
    await s.waitForLoadState('networkidle');
    assert.deepEqual(await axePruefen(s, ['.spalte.mappe']), [], 'axe meldet Verstöße');
  } finally {
    await api('DELETE', `/api/mappen/${mappe.id}?grund=nicht_noetig`, { cookie });
  }
});

rauchtest(
  'Handy: Übernehmen mit Seitenzahl im Kopf – Seiten fließen mit der Seite, 44-px-Tippflächen (#1323)',
  { handy: true, als: LENA },
  async (s) => {
    const cookie = await sitzung(LENA);
    const brief = (await api('POST', '/api/post', { cookie, body: { betreff: 'Garantieheft Waschmaschine' } })).daten;
    await hochladen(cookie, brief.id, 'Garantieheft Waschmaschine.pdf', seitenPdf('Garantieheft', 6));
    try {
      await s.goto(BASIS + `/ablage/eingang/${brief.id}`);
      await s.waitForURL(new RegExp(`/${brief.id}/uebernehmen$`));
      const blatt = s.getByRole('region', { name: 'Dokument' }).getByRole('article', { name: 'Garantieheft Waschmaschine.pdf' });
      await blatt.getByRole('img', { name: 'Seite 1 von 6', exact: true }).waitFor();
      assert.deepEqual(await eigeneRollen(s, '.ue-mitte'), [], 'Eigener Scrollbalken am Handy');
      await springe(s, blatt, 5, 6);
      await s.waitForLoadState('networkidle');
      const funde = await tippflaechenPruefen(s, ['.ue-dokkopf']);
      assert.deepEqual(funde, [], `Zu kleine Tippflächen am Handy:\n${funde.join('\n')}`);
      await keineWaagerechteRolle(s);
    } finally {
      await api('DELETE', `/api/mappen/${brief.id}?grund=nicht_noetig`, { cookie });
    }
  },
);
