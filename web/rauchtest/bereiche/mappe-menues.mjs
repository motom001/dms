/**
 * Rauchtests: Mappe – Menüs, Anlagen, Navigation (KW47): „Aus Dokument ausfüllen“ fest im Menü „Mappe“ mit Prüfansicht
 * (#1494), Anlage „Anlage zu …“ mit dem Menü des Dokuments (#1487), Menüs ohne Überdecken und ohne Rollleiste der Seite,
 * Spalten bis unten, Freiraum am Ende der Spalte (#1488, #1590), Pfeil klappt einen Bereich auch über der gewählten Sicht zu (#1495).
 * Allein starten (frisch gestartetes Ablago, siehe rauchtest.mjs): node web/rauchtest/bereiche/mappe-menues.mjs [fehlerordner]
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import '../einrichtung.mjs';
import { api, BASIS, beispielPdf, LENA, rauchtest, schemaWechseln, sitzung } from '../hilfen.mjs';
import { axePruefen } from '../muster.mjs';

/** Sitzung im Verwaltungsmodus, für Typen und Ansichten. */
async function verwaltung() {
  const c = await sitzung(LENA);
  await api('POST', '/api/konto/verwaltung', { cookie: c, body: { passwort: LENA.passwort } });
  return c;
}

/**
 * Warten, bis die Texterkennung des Hauptdokuments fertig ist (die Anlage braucht im ganzen Lauf mit dem Paket
 * „Texterkennung“ länger). Großzügig, in einem eigenen Schritt mit längerer Zeitgrenze (unten).
 */
async function textFertig(cookie, mappeId, name) {
  let stand = [];
  for (let i = 0; i < 400; i++) {
    const d = (await api('GET', `/api/mappen/${mappeId}`, { cookie })).daten;
    stand = d.dokumente.map((x) => `${x.name}: ${x.ocr?.stand}`);
    if (d.dokumente.some((x) => x.name === name && x.ocr?.stand === 'fertig')) return d;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Texterkennung nicht fertig (${stand.join(', ')})`);
}

async function hochladen(cookie, mappeId, name, text) {
  return (
    await api('POST', `/api/mappen/${mappeId}/dokumente?register=dokumente&name=${encodeURIComponent(name)}&typ=application/pdf`, {
      cookie,
      body: beispielPdf(text),
      roh: true,
    })
  ).daten.dokument;
}

/** „Wartungsvertrag“ ohne Dokument und „Wartungsbeleg“ mit PDF, der auf ihn verweist; dazu eine Anlage am Beleg. */
let vorbereitung;
const vertragUndBeleg = () => (vorbereitung ??= vorbereiten());
async function vorbereiten() {
  const v = await verwaltung();
  const register = (felder) => [
    { key: 'allgemein', name: 'Allgemein', art: 'felder', felder },
    { key: 'dokumente', name: 'Dokumente', art: 'dokumente' },
  ];
  const vertragTyp = (
    await api('POST', '/api/typen', {
      cookie: v,
      body: {
        name: 'Wartungsvertrag',
        schluessel: 'rauchtest_wartungsvertrag',
        titelVorlage: '{name}',
        felder: [
          { key: 'name', label: 'Name', typ: 'text', pflicht: true },
          { key: 'nummer', label: 'Vertragsnummer', typ: 'text' },
        ],
        register: register(['name', 'nummer']),
      },
    })
  ).daten;
  const belegTyp = (
    await api('POST', '/api/typen', {
      cookie: v,
      body: {
        name: 'Wartungsbeleg',
        schluessel: 'rauchtest_wartungsbeleg',
        titelVorlage: '{name}',
        felder: [
          { key: 'name', label: 'Name', typ: 'text', pflicht: true },
          { key: 'vertrag', label: 'Vertrag', typ: 'referenz', zielTyp: vertragTyp.id },
        ],
        register: register(['name', 'vertrag']),
      },
    })
  ).daten;
  const c = await sitzung(LENA);
  const vertrag = (await api('POST', '/api/mappen', { cookie: c, body: { typId: vertragTyp.id, werte: { name: 'Wartung Heizung 2027' } } }))
    .daten;
  const beleg = (
    await api('POST', '/api/mappen', { cookie: c, body: { typId: belegTyp.id, werte: { name: 'Beleg Wartung', vertrag: vertrag.id } } })
  ).daten;
  const haupt = await hochladen(c, beleg.id, 'Wartungsrechnung.pdf', 'Rechnung Wartung Vertragsnummer WV-2027-17');
  const anlage = await hochladen(c, beleg.id, 'Wartungsprotokoll.pdf', 'Protokoll der Wartung an der Heizung vom 12.01.2027');
  await api('POST', `/api/dokumente/${haupt.id}/anlagen`, { cookie: c, body: { dokument: anlage.id } });
  await textFertig(c, beleg.id, 'Wartungsrechnung.pdf');
  // Die Anlage auch (#1525): Ein verlorenes Wecksignal holt das regelmäßige Nachsehen der Texterkennung nach.
  await textFertig(c, beleg.id, 'Wartungsprotokoll.pdf');
  return { vertragTyp, belegTyp, vertrag, beleg, haupt, anlage };
}

// Daten in einem eigenen Schritt (bis 4 Minuten): Die Texterkennung braucht im ganzen Lauf länger, als ein Rauchtest darf.
test('Mappe – Menüs, Anlagen: Daten vorbereiten (#1494, #1487)', { timeout: 240_000 }, async () => {
  await vertragUndBeleg();
});

rauchtest(
  'Menü „Mappe“: „Aus Dokument ausfüllen“ immer, Prüfansicht mit verknüpften Mappen und Upload (#1494)',
  { als: LENA },
  async (s) => {
    const { vertragTyp, vertrag, haupt } = await vertragUndBeleg();
    await s.goto(BASIS + `/ablage/${vertragTyp.id}/${vertrag.id}`);
    const mappe = s.getByRole('region', { name: 'Mappe' });
    await mappe.getByRole('heading', { name: 'Wartung Heizung 2027', level: 1 }).waitFor();
    // Keine eigene Zeile mehr über dem Formular – auch ohne Dokument steht es fest im Menü.
    assert.equal(await mappe.locator('.ad-leiste').count(), 0, 'keine Zeile „Aus Dokument ausfüllen“ über dem Formular');
    await mappe.getByRole('button', { name: 'Mappe', exact: true }).click();
    await s.getByRole('menuitem', { name: 'Aus Dokument ausfüllen' }).click();
    await s.waitForURL(/\/uebernehmen$/);
    const mitte = s.getByRole('region', { name: 'Dokument' });
    await mitte.getByText('Wähle oben ein Dokument dieser oder einer verknüpften Mappe – oder lade ein neues hoch.').waitFor();
    // Verknüpfte Mappen: Die Rechnung am Beleg ist wählbar, getrennt von „Diese Mappe“ – die Anlage nicht.
    const wahl = mitte.locator('[data-anker="uebernehmen.quelle"]');
    await wahl.locator('optgroup[label="Verknüpfte Mappen"] option').first().waitFor({ state: 'attached' });
    const optionen = await wahl.locator('optgroup[label="Verknüpfte Mappen"] option').allTextContents();
    assert.deepEqual(optionen, ['Wartungsbeleg: Beleg Wartung – Wartungsrechnung.pdf']);
    await wahl.selectOption(haupt.id);
    await mitte.locator('article.ue-dokument').first().waitFor();
    // Vorschlag aus dem fremden Dokument rechts – ausgefüllt wird nur diese Mappe.
    await s
      .locator('.ue-rechts')
      .getByRole('textbox', { name: /^Vertragsnummer/ })
      .waitFor();
    // axe hell und dunkel mit Wahl und Upload.
    const funde = [];
    for (const schema of ['light', 'dark']) {
      await schemaWechseln(s, schema);
      for (const v of await axePruefen(s, ['.ue-mitte'])) funde.push(`${schema}: ${v}`);
    }
    assert.deepEqual(funde, [], `axe meldet Verstöße:\n${funde.join('\n')}`);
    // Neues Dokument hochladen: erst „Nur zum Ausfüllen“ – nichts wird gespeichert.
    const datei = { name: 'Nachtrag.pdf', mimeType: 'application/pdf', buffer: beispielPdf('Nachtrag Vertragsnummer WV-2027-18') };
    await mitte.locator('[data-anker="uebernehmen.neu-datei"]').setInputFiles(datei);
    const frage = s.getByRole('alertdialog', { name: 'Dokument auch in der Mappe speichern?' });
    await frage.getByRole('button', { name: 'Nur zum Ausfüllen' }).click();
    await mitte.getByText('„Nachtrag.pdf“ ist nur zum Ausfüllen gelesen und wird nicht gespeichert.', { exact: false }).waitFor();
    const cookie = await sitzung(LENA);
    assert.equal((await api('GET', `/api/mappen/${vertrag.id}`, { cookie })).daten.dokumente.length, 0, 'nichts gespeichert');
    // Dann „In der Mappe speichern“: liegt im Register und steht unter „Diese Mappe“.
    await mitte.locator('[data-anker="uebernehmen.neu-datei"]').setInputFiles(datei);
    await frage.getByRole('button', { name: 'In der Mappe speichern' }).click();
    await wahl.locator('optgroup[label="Diese Mappe"] option', { hasText: 'Nachtrag.pdf' }).waitFor({ state: 'attached', timeout: 60_000 });
    assert.equal((await api('GET', `/api/mappen/${vertrag.id}`, { cookie })).daten.dokumente.length, 1, 'in der Mappe gespeichert');
  },
);

rauchtest(
  'Anlage: „Anlage zu …“, nur „Ansehen“ und das Menü des Dokuments, Zahl am Register ohne Anlagen (#1487)',
  { als: LENA },
  async (s) => {
    const { belegTyp, beleg } = await vertragUndBeleg();
    await s.goto(BASIS + `/ablage/${belegTyp.id}/${beleg.id}`);
    const mappe = s.getByRole('region', { name: 'Mappe' });
    // Zahl am Register: ein Dokument, nicht Dokument plus Anlage.
    await mappe.getByRole('tab', { name: /^Dokumente/ }).click();
    assert.match(await mappe.getByRole('tab', { name: /^Dokumente/ }).innerText(), /^Dokumente\s*1$/);
    const zeile = mappe.locator('li.anlagezeile');
    await zeile.getByText('Anlage zu „Wartungsrechnung.pdf“').waitFor();
    const knoepfe = zeile.locator('.zeilenaktionen > button, .zeilenaktionen > a, .zeilenaktionen .menue-baustein > button');
    assert.deepEqual(await knoepfe.evaluateAll((l) => l.map((b) => b.getAttribute('aria-label') || b.textContent?.trim())), [
      'Ansehen',
      'Weitere Handlungen für Wartungsprotokoll.pdf',
    ]);
    await zeile.getByRole('button', { name: 'Weitere Handlungen für Wartungsprotokoll.pdf' }).click();
    const menue = s.getByRole('menu', { name: 'Weitere Handlungen für Wartungsprotokoll.pdf' });
    const punkte = await menue.getByRole('menuitem').allTextContents();
    for (const p of ['Umbenennen', 'Zum eigenen Dokument machen'])
      assert.ok(
        punkte.some((x) => x.includes(p)),
        `fehlt: ${p}`,
      );
    assert.ok(!punkte.some((x) => x.includes('Mit Anlagen (ZIP)')), '„Mit Anlagen (ZIP)“ an einer Anlage');
    // „Text anzeigen“: Die Texterkennung der Anlage ist fertig (in der Vorbereitung abgewartet, #1525).
    assert.ok(
      punkte.some((x) => x.includes('Text anzeigen')),
      'fehlt: Text anzeigen',
    );
    await menue.getByRole('menuitem', { name: 'Text anzeigen' }).click();
    await zeile.getByText('Protokoll der Wartung an der Heizung', { exact: false }).waitFor();
    const funde = [];
    for (const schema of ['light', 'dark']) {
      await schemaWechseln(s, schema);
      for (const v of await axePruefen(s, ['.spalte.mappe'])) funde.push(`${schema}: ${v}`);
    }
    assert.deepEqual(funde, [], `axe meldet Verstöße:\n${funde.join('\n')}`);
  },
);

rauchtest(
  'Langes Menü nahe dem Assistenten: klappt nach oben, keine Rollleiste, Spalten bis unten (#1488, #1590)',
  { als: LENA },
  async (s) => {
    const { belegTyp, beleg } = await vertragUndBeleg();
    await s.setViewportSize({ width: 1366, height: 640 });
    await s.goto(BASIS + `/ablage/${belegTyp.id}/${beleg.id}`);
    const mappe = s.getByRole('region', { name: 'Mappe' });
    await mappe.getByRole('tab', { name: /^Dokumente/ }).click();
    const zeile = mappe.locator('.dokumentliste li').filter({ hasText: 'Wartungsrechnung.pdf' }).first();
    await zeile.waitFor();
    // Die Zeile ans untere Ende der Spalte rollen, dicht über den Assistenten.
    const spalte = s.locator('.spalte.mappe');
    await zeile.evaluate((el) => el.scrollIntoView({ block: 'end' }));
    const vorher = await spalte.evaluate((el) => ({ hoehe: el.scrollHeight, seite: document.documentElement.scrollHeight }));
    await zeile.getByRole('button', { name: 'Weitere Handlungen für Wartungsrechnung.pdf' }).click();
    const menue = s.getByRole('menu', { name: 'Weitere Handlungen für Wartungsrechnung.pdf' });
    await menue.waitFor();
    const box = await menue.boundingBox();
    const knopf = await zeile.getByRole('button', { name: 'Weitere Handlungen für Wartungsrechnung.pdf' }).boundingBox();
    const fenster = s.viewportSize();
    const frei = await s.evaluate(() =>
      Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--platz-begleiter')),
    );
    assert.ok(box.y >= 0 && box.y + box.height <= fenster.height, 'Menü ganz im Fenster');
    if (box.y > knopf.y) assert.ok(box.y + box.height <= fenster.height - frei + 1, 'nach unten nur, wenn es über dem Assistenten endet');
    const nachher = await spalte.evaluate((el) => ({ hoehe: el.scrollHeight, seite: document.documentElement.scrollHeight }));
    assert.deepEqual(nachher, vorher, 'Das offene Menü verlängert weder Spalte noch Seite');
    await s.keyboard.press('Escape');
    // Seit #1590: Alle Spalten reichen bis unten, der Assistent schwebt; der Freiraum liegt am Ende der Spalte
    // (Prüfung im Einzelnen: spalten-und-leisten.mjs).
    const unten = await s.evaluate(() => ({
      navigation: Math.round(document.querySelector('.spalte.sichten').getBoundingClientRect().bottom),
      mappe: Math.round(document.querySelector('.spalte.mappe').getBoundingClientRect().bottom),
      hoehe: innerHeight,
    }));
    assert.equal(unten.navigation, unten.hoehe, 'Navigation reicht bis unten');
    assert.equal(unten.mappe, unten.hoehe, 'Mappe reicht bis unten (#1590)');
  },
);

rauchtest('Navigation: Pfeil klappt einen Bereich zu, auch wenn darin eine Sicht gewählt ist (#1495)', { als: LENA }, async (s) => {
  const v = await verwaltung();
  const typen = (await api('GET', '/api/typen', { cookie: v })).daten;
  const kellerraum = typen.find((x) => x.name === 'Kellerraum');
  const eltern = (
    await api('POST', '/api/sichten/definitionen', { cookie: v, body: { name: 'Rauchtest Haushalt', typen: [kellerraum.id] } })
  ).daten;
  const kind = (await api('POST', '/api/sichten/definitionen', { cookie: v, body: { name: 'Rauchtest Konten', typen: [kellerraum.id] } }))
    .daten;
  await api('POST', `/api/sichten/definitionen/${kind.id}/verschieben`, { cookie: v, body: { elternId: eltern.id } });
  try {
    await pfeilKlappt(s, kind);
  } finally {
    // Wieder weg: Spätere Bereiche zählen die Ansichten am Mappentyp „Kellerraum“ (Werkbank am Handy).
    await api('DELETE', `/api/sichten/definitionen/${kind.id}`, { cookie: v });
    await api('DELETE', `/api/sichten/definitionen/${eltern.id}`, { cookie: v });
  }
});

async function pfeilKlappt(s, kind) {
  await s.goto(BASIS + `/ablage/${kind.id}`);
  const baum = s.getByRole('complementary', { name: 'Ansichten' });
  const kindLink = baum.getByRole('link', { name: /^Rauchtest Konten/ });
  await kindLink.waitFor();
  const pfeil = baum.getByRole('button', { name: 'Rauchtest Haushalt zuklappen' });
  await pfeil.click();
  await kindLink.waitFor({ state: 'detached' });
  // Die gewählte Sicht ist verborgen: der Bereich selbst ist als gewählt markiert.
  assert.match((await baum.getByRole('link', { name: /^Rauchtest Haushalt/ }).getAttribute('class')) ?? '', /\ban\b/);
  await baum.getByRole('button', { name: 'Rauchtest Haushalt aufklappen' }).click();
  await kindLink.waitFor();
  assert.doesNotMatch((await baum.getByRole('link', { name: /^Rauchtest Haushalt/ }).getAttribute('class')) ?? '', /\ban\b/);
}
