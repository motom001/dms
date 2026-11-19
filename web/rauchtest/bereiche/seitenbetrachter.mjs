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

/** Liegt das Seitenbild genau auf seiner Fläche (gleiche Größe, Seitenverhältnis wie das Bild)? */
const bildFuelltFlaeche = (bild) =>
  bild.evaluate((img) => {
    const b = img.getBoundingClientRect(),
      f = img.parentElement.getBoundingClientRect();
    return {
      breite: Math.round(b.width),
      flaeche: Math.round(f.width),
      passt: Math.abs(b.width - f.width) < 2 && Math.abs(b.height - f.height) < 2,
      verhaeltnis: Math.abs(b.width / b.height - img.naturalWidth / img.naturalHeight) < 0.02,
    };
  });

/**
 * Bildschirmfoto der Seite (#1486): Wo beginnt links der erste dunkle Bildpunkt (Text), in Prozent der Breite? Bei
 * einer A4-Seite mit Rand um 7 %; war das Bild wie „auf A3“ in der Mitte geschrumpft, läge er bei über 20 %.
 */
async function textBeginntBei(s, flaeche) {
  const png = (await flaeche.screenshot()).toString('base64');
  return s.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = Object.assign(document.createElement('canvas'), { width: img.width, height: img.height });
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    const { data } = g.getImageData(0, 0, img.width, Math.round(img.height / 3));
    let links = img.width;
    for (let i = 0; i < data.length; i += 4) if (data[i] + data[i + 1] + data[i + 2] < 300) links = Math.min(links, (i / 4) % img.width);
    return Math.round((links / img.width) * 100);
  }, png);
}

rauchtest(
  'Breite Spalte: Die Seite füllt ihre Fläche wie A4, nicht „wie A3“; Mappe lädt nur Seitengrößen (#1486, #1445)',
  { als: LENA },
  async (s) => {
    await s.setViewportSize({ width: 2400, height: 1300 });
    const cookie = await sitzung(LENA);
    const typ = daten.bausteine;
    const mappe = (await api('POST', '/api/mappen', { cookie, body: { typId: typ.id, werte: { objekt: 'Heizungsraum breit' } } })).daten;
    await hochladen(cookie, mappe.id, 'Wartungsheft breit.pdf', seitenPdf('Wartungsheft', 3));
    const anfragen = [];
    s.on('request', (r) => anfragen.push(new URL(r.url()).pathname));
    try {
      await s.goto(BASIS + `/ablage/${typ.id}/${mappe.id}`);
      const bereich = s.getByRole('region', { name: 'Mappe' });
      await bereich.getByRole('tab', { name: /^Dokumente/ }).click();
      await bereich.getByRole('button', { name: 'Wartungsheft breit.pdf', exact: true }).click();
      const bild = s.locator('.dokansicht').getByRole('img', { name: 'Seite 1 von 3', exact: true });
      await bild.waitFor();
      await s.waitForFunction((img) => img.complete && img.naturalWidth > 0, await bild.elementHandle());
      const lage = await bildFuelltFlaeche(bild);
      assert.ok(lage.breite > 760, `Die Spalte ist nicht breit genug für den Test (${lage.breite} px)`);
      assert.ok(lage.passt && lage.verhaeltnis, `Seitenbild füllt seine Fläche nicht: ${JSON.stringify(lage)}`);
      const links = await textBeginntBei(s, bild.locator('xpath=..'));
      assert.ok(links < 15, `Der Text beginnt erst bei ${links} % der Breite – die Seite ist geschrumpft`);
      // #1445: nur Seitengrößen, nicht die Wörter des ganzen Dokuments.
      assert.ok(
        anfragen.some((p) => /\/api\/dokumente\/[^/]+\/seitenmasse$/.test(p)),
        'Seitengrößen geladen',
      );
      assert.ok(!anfragen.some((p) => p.endsWith('/wortpositionen')), 'Mappe lädt keine Wortpositionen');
    } finally {
      await api('DELETE', `/api/mappen/${mappe.id}?grund=nicht_noetig`, { cookie });
    }
    // Übernehmen in breiter Spalte: Seite füllt ihre Fläche, die Wörter zum Markieren liegen auf dem Bild.
    const brief = (await api('POST', '/api/post', { cookie, body: { betreff: 'Prospekt breit' } })).daten;
    await hochladen(cookie, brief.id, 'Prospekt breit.pdf', seitenPdf('Prospekt', 2));
    try {
      await s.goto(BASIS + `/ablage/eingang/${brief.id}`);
      await s.waitForURL(new RegExp(`/${brief.id}/uebernehmen$`));
      const blatt = s.getByRole('region', { name: 'Dokument' }).getByRole('article', { name: 'Prospekt breit.pdf' });
      const bild = blatt.getByRole('img', { name: 'Seite 1 von 2', exact: true });
      await bild.waitFor();
      await s.waitForFunction((img) => img.complete && img.naturalWidth > 0, await bild.elementHandle());
      const lage = await bildFuelltFlaeche(bild);
      assert.ok(lage.passt && lage.verhaeltnis, `Übernehmen: Seitenbild füllt seine Fläche nicht: ${JSON.stringify(lage)}`);
      await blatt.locator('figure[data-seite="1"] .ue-wort').first().waitFor();
      const aussen = await blatt.locator('figure[data-seite="1"]').evaluate((fig) => {
        const b = fig.querySelector('img').getBoundingClientRect();
        return [...fig.querySelectorAll('.ue-wort')]
          .map((w) => w.getBoundingClientRect())
          .filter((r) => r.left < b.left - 1 || r.right > b.right + 1 || r.top < b.top - 1 || r.bottom > b.bottom + 1).length;
      });
      assert.equal(aussen, 0, 'Wörter zum Markieren liegen außerhalb des Seitenbilds');
    } finally {
      await api('DELETE', `/api/mappen/${brief.id}?grund=nicht_noetig`, { cookie });
    }
  },
);

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
