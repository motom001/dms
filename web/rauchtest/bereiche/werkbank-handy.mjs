/**
 * Rauchtests für die Werkbank am Handy (QS-Runde 11/2026, Phase E): kompakter Kopf, Bereiche als eigener Schritt mit dem
 * Handy-Schwerpunkt oben, Umschalten nach Breite (#1204).
 * Allein starten (frisch gestartetes Ablago, siehe rauchtest.mjs): node web/rauchtest/bereiche/werkbank-handy.mjs [fehlerordner]
 */
import assert from 'node:assert/strict';
import '../einrichtung.mjs';
import { BASIS, daten, keineWaagerechteRolle, LENA, rauchtest, schemaWechseln, verwalten, WERKBANK_BEREICHE } from '../hilfen.mjs';
import { axePruefen, tippflaechenPruefen } from '../muster.mjs';

/** Handy-Schwerpunkt in seiner Reihenfolge (HANDY_SCHWERPUNKT in shared/src/werkbankansicht.ts), als Namen der Leiste. */
const SCHWERPUNKT = ['Übersicht', 'Systemzustand', 'Sicherung', 'Postfächer', 'Wartung', 'Benutzer', 'Verschlüsselung', 'Pakete'];

/** Sichtbare Spalten der Dreiteilung (Name der Region bzw. Leiste). */
const sichtbareSpalten = (s) =>
  s.evaluate(() =>
    [...document.querySelectorAll('.drei > .spalte')].filter((e) => e.getClientRects().length > 0).map((e) => e.getAttribute('aria-label')),
  );

/** Alle Bereiche, die die Navigation gerade anbietet (Pfade aus `data-anker`), ohne Doppelte. */
const angebotene = (s) =>
  s.evaluate(() => [
    ...new Set([...document.querySelectorAll('a[data-anker^="werkbank.bereich:"]')].map((a) => a.dataset.anker.split(':')[1])),
  ]);

rauchtest('Werkbank am Handy: Kopf eine Zeile, der Inhalt beginnt oben, Weg zurück (#1204)', { als: LENA, handy: true }, async (s) => {
  await s.goto(BASIS + '/ablage/start');
  await verwalten(s);
  const funde = [];
  // Je Seite: welche Spalte allein steht, welcher Weg oben steht und wohin er führt.
  const faelle = [
    { weg: '/werkbank', spalte: 'Elemente', link: 'Bereiche', ziel: '/werkbank?bereiche' },
    { weg: '/werkbank/typen', spalte: 'Elemente', link: 'Ablage aufbauen', ziel: '/werkbank?bereiche=ablage' },
    { weg: '/werkbank/benutzer', spalte: 'Elemente', link: 'Bereiche', ziel: '/werkbank?bereiche' },
    { weg: '/werkbank/sicherung', spalte: 'Bearbeitung', link: 'Bereiche', ziel: '/werkbank?bereiche' },
    { weg: '/werkbank/region', spalte: 'Bearbeitung', link: 'Einstellungen', ziel: '/werkbank?bereiche=einstellungen' },
    { weg: '/werkbank/typen/neu', spalte: 'Bearbeitung', link: 'Zur Liste', ziel: '/werkbank/typen' },
  ];
  for (const f of faelle) {
    await s.goto(BASIS + f.weg);
    await s.locator('.rumpf h1:visible').first().waitFor();
    const spalten = await sichtbareSpalten(s);
    if (spalten.join() !== f.spalte) funde.push(`${f.weg}: Spalten ${spalten.join(', ')} statt nur ${f.spalte}`);
    const kopf = s.locator('.wb-handykopf:visible');
    const links = kopf.getByRole('link');
    if ((await links.count()) !== 1) funde.push(`${f.weg}: ${await links.count()} Wege in der Kopfzeile statt einem`);
    else {
      const name = ((await links.textContent()) ?? '').trim();
      if (name !== f.link) funde.push(`${f.weg}: Weg „${name}“ statt „${f.link}“`);
      if ((await links.getAttribute('href')) !== f.ziel) funde.push(`${f.weg}: Weg führt nach ${await links.getAttribute('href')}`);
    }
    // Kopf höchstens etwa eine Zeile: Die Spalte beginnt im obersten Fünftel, die Überschrift des Inhalts gleich darunter.
    const lage = await s.evaluate(() => {
      const spalte = [...document.querySelectorAll('.drei > .spalte')].find((e) => e.getClientRects().length > 0);
      const h1 = spalte.querySelector('h1');
      return { spalte: spalte.getBoundingClientRect().top, h1: h1.getBoundingClientRect().top, hoehe: innerHeight };
    });
    if (lage.spalte > lage.hoehe * 0.2) funde.push(`${f.weg}: Inhalt beginnt erst bei ${Math.round(lage.spalte)} px`);
    if (lage.h1 - lage.spalte > 140) funde.push(`${f.weg}: Überschrift ${Math.round(lage.h1 - lage.spalte)} px unter dem Spaltenanfang`);
    await keineWaagerechteRolle(s);
    for (const v of await tippflaechenPruefen(s, ['.wb-handykopf'])) funde.push(`${f.weg}: ${v}`);
  }
  assert.deepEqual(funde, [], funde.join('\n'));
});

rauchtest(
  'Werkbank am Handy: Bereiche mit Schwerpunkt oben, „Alle Bereiche“ darunter, nichts fehlt (#1204)',
  { als: LENA, handy: true },
  async (s) => {
    await s.goto(BASIS + '/ablage/start');
    await verwalten(s);
    // Was die Leiste am Rechner anbietet (mit aufgeklappten ausgeblendeten Bereichen) – das muss am Handy alles da sein.
    await s.setViewportSize({ width: 1366, height: 900 });
    await s.goto(BASIS + '/werkbank');
    const leiste = s.locator('nav.werkbankleiste');
    await leiste.locator('a.sicht').nth(3).waitFor();
    const aufklappen = leiste.getByRole('button', { name: /ausgeblendet/ });
    if (await aufklappen.count()) await aufklappen.click();
    const amRechner = (await angebotene(s)).sort();
    await s.setViewportSize({ width: 390, height: 844 });
    await s.goto(BASIS + '/werkbank');
    await s.locator('.wb-handykopf').getByRole('link', { name: 'Bereiche' }).click();
    await s.waitForURL(/\/werkbank\?bereiche$/);
    await s.getByRole('heading', { name: 'Bereiche der Werkbank', level: 1 }).waitFor();
    assert.deepEqual(await sichtbareSpalten(s), ['Bereiche'], 'Am Handy stehen die Bereiche allein');
    // Oben der Schwerpunkt in fester Reihenfolge (was die Stufe ausblendet, fehlt auch hier).
    const vorn = s.locator('.wbgruppe').filter({ has: s.getByRole('heading', { name: 'Für unterwegs' }) });
    const namen = await vorn.locator('a.sicht .nm').allTextContents();
    assert.deepEqual(
      namen,
      SCHWERPUNKT.filter((n) => namen.includes(n)),
      'Reihenfolge des Schwerpunkts',
    );
    assert.ok(namen.length >= 5, `Zu wenig im Schwerpunkt: ${namen.join(', ')}`);
    // Darunter „Alle Bereiche“: die übrigen nach Gruppen als Reiter, jeder Bereich nur einmal.
    await s.getByRole('heading', { name: /^Alle Bereiche/ }).waitFor();
    const reihe = s.getByRole('tablist', { name: 'Bereiche der Werkbank' });
    const reiter = reihe.getByRole('tab');
    const gesehen = [...(await angebotene(s))];
    for (let i = 0; i < (await reiter.count()); i++) {
      await reiter.nth(i).click();
      assert.equal(await reiter.nth(i).getAttribute('aria-selected'), 'true');
      const inGruppe = await s.getByRole('tabpanel').locator('a.sicht .nm').allTextContents();
      assert.ok(inGruppe.length > 0, `Gruppe ${await reiter.nth(i).textContent()} ohne Bereiche`);
      for (const n of inGruppe) assert.ok(!SCHWERPUNKT.includes(n), `${n} steht doppelt (Schwerpunkt und Gruppe)`);
      gesehen.push(...(await angebotene(s)));
    }
    const aufklappenHandy = s.getByRole('button', { name: /ausgeblendet/ });
    if (await aufklappenHandy.count()) {
      await aufklappenHandy.click();
      for (let i = 0; i < (await reiter.count()); i++) {
        await reiter.nth(i).click();
        gesehen.push(...(await angebotene(s)));
      }
    }
    assert.deepEqual([...new Set(gesehen)].sort(), amRechner, 'Am Handy fehlt ein Bereich oder steht einer zu viel');
    // Suche, „Werkbank anpassen“, „Projekt unterstützen“ und das Handbuch stehen hier.
    await s.getByRole('searchbox', { name: 'Bereiche der Werkbank durchsuchen' }).waitFor();
    for (const name of ['Werkbank anpassen', /Projekt unterstützen/, /Handbuch für die Verwaltung/])
      assert.equal(await s.getByRole('link', { name }).count(), 1, `${name} fehlt`);
    await keineWaagerechteRolle(s);
    const funde = [...(await tippflaechenPruefen(s, ['.spalte.sichten']))];
    for (const schema of ['light', 'dark']) {
      await schemaWechseln(s, schema);
      for (const v of await axePruefen(s, ['.spalte.sichten'])) funde.push(`${schema}: ${v}`);
    }
    await schemaWechseln(s, 'light');
    assert.deepEqual(funde, [], funde.join('\n'));
    // Ein Bereich aus einer Gruppe: die Seite ohne die Bereiche darüber, zurück zur Gruppe mit gewähltem Reiter.
    await reiter.filter({ hasText: 'Ablage aufbauen' }).click();
    await s
      .getByRole('tabpanel')
      .getByRole('link', { name: /^Mappentypen/ })
      .click();
    await s.waitForURL(/\/werkbank\/typen$/);
    assert.deepEqual(await sichtbareSpalten(s), ['Elemente']);
    await s.locator('.wb-handykopf').getByRole('link', { name: 'Ablage aufbauen' }).click();
    await s.waitForURL(/\/werkbank\?bereiche=ablage$/);
    assert.equal(await reiter.filter({ hasText: 'Ablage aufbauen' }).getAttribute('aria-selected'), 'true');
  },
);

rauchtest('Werkbank nach Breite: iPad hoch und quer wie der Rechner, Handy bis 767 px (#1204)', { als: LENA }, async (s) => {
  await s.goto(BASIS + '/ablage/start');
  await verwalten(s);
  const funde = [];
  // iPad mini hoch 744 ist ein schmaler Bildschirm; iPad hoch 768, 810, 820, 834 und quer 1180 zeigen die volle Werkbank.
  for (const [breite, voll] of [
    [767, false],
    [768, true],
    [820, true],
    [834, true],
    [1180, true],
  ]) {
    await s.setViewportSize({ width: breite, height: 1000 });
    await s.goto(BASIS + '/werkbank/typen');
    await s.locator('.rumpf h1:visible').first().waitFor();
    const spalten = await sichtbareSpalten(s);
    const erwartet = voll ? ['Bereiche', 'Elemente', 'Bearbeitung'] : ['Elemente'];
    if (spalten.join() !== erwartet.join()) funde.push(`${breite} px: ${spalten.join(', ')} statt ${erwartet.join(', ')}`);
    const kopf = await s.locator('.wb-handykopf').count();
    if (voll === kopf > 0) funde.push(`${breite} px: Zeile mit dem Weg zurück ${kopf ? 'da' : 'fehlt'}`);
    // Voll: die Leiste ist zu sehen und hat ihre Griffe; die Bereiche als eigener Schritt gibt es dort nicht.
    if (voll && !(await s.locator('.griff').count())) funde.push(`${breite} px: keine Griffe zum Einklappen`);
    const { breit, sicht } = await s.evaluate(() => ({ breit: document.documentElement.scrollWidth, sicht: innerWidth }));
    if (breit > sicht) funde.push(`${breite} px: Seite breiter als der Bildschirm (${breit} px)`);
  }
  // „?bereiche“ am Rechner: einfach die Übersicht mit der Leiste.
  await s.setViewportSize({ width: 1180, height: 900 });
  await s.goto(BASIS + '/werkbank?bereiche');
  await s.locator('.spalte.liste .uebersicht').waitFor();
  if ((await sichtbareSpalten(s)).join() !== 'Bereiche,Elemente') funde.push('?bereiche am Rechner nicht die Übersicht');
  assert.deepEqual(funde, [], funde.join('\n'));
});

/* ---------- Werkbank „Ablage aufbauen“ am Handy: 44-px-Tippflächen (#1227) ---------- */

/**
 * Seiten aus #1213 (Ablage aufbauen), gemessen wie die Seiten aus #1214: je Liste und Eintrag. Pakete, Beispiel-Ablage,
 * Rundgänge und Tipps haben eigene Rauchtests am Handy. `eintrag`: erster Eintrag der Liste (Adresse aus der Liste).
 */
const ABLAGE_AUFBAUEN = [
  { weg: '/werkbank' },
  { weg: '/werkbank/ansicht' },
  { weg: '/werkbank/typen' },
  { weg: () => `/werkbank/typen/${daten.bausteine.id}`, aufklappen: true },
  { weg: '/werkbank/sichten' },
  { weg: '/werkbank/sichten', eintrag: true, aufklappen: true },
  { weg: '/werkbank/sichten/neu' },
  { weg: '/werkbank/nummernkreise' },
  { weg: '/werkbank/nummernkreise/archivnummer' },
  { weg: '/werkbank/automatisierungen' },
  { weg: '/werkbank/automatisierungen', eintrag: true },
  { weg: '/werkbank/automatisierungen/neu' },
  { weg: '/werkbank/automatisierungen/ziele' },
  { weg: '/werkbank/ablaufvorlagen' },
  { weg: '/werkbank/ablaufvorlagen', eintrag: true },
  { weg: '/werkbank/stempel' },
  { weg: '/werkbank/stempel/neu' },
  { weg: '/werkbank/designs' },
  { weg: '/werkbank/designs', eintrag: true },
  { weg: '/werkbank/designs/neu' },
  { weg: '/werkbank/woerter' },
  { weg: '/werkbank/woerter', eintrag: true },
  { weg: '/werkbank/woerter/neu' },
];

/**
 * Seite öffnen und warten, bis Liste oder Seite steht; mit `eintrag` den ersten Eintrag der Liste (ist die Liste leer,
 * etwa die Wortgruppen allein gestartet, bleibt es bei der Liste).
 */
async function oeffnen(s, seite) {
  let weg = typeof seite.weg === 'function' ? seite.weg() : seite.weg;
  await s.goto(BASIS + weg);
  await s.locator('.rumpf h1:visible').first().waitFor();
  if (seite.eintrag) {
    await s.waitForLoadState('networkidle');
    const link = s.locator(`.spalte.liste a[href^="${weg}/"]:not([href$="/neu"]):not([href$="/ziele"])`).first();
    if (await link.count()) {
      weg = (await link.getAttribute('href')) ?? weg;
      await s.goto(BASIS + weg);
      await s.locator('.spalte.mappe h1:visible, .spalte.mappe h2:visible').first().waitFor();
    }
  }
  await s.waitForLoadState('networkidle');
  // Editoren mit Bereichen (#1000): alles aufklappen, damit die Messung auch die Felder darin sieht.
  const alle = s.getByRole('button', { name: 'Alle aufklappen' });
  if (seite.aufklappen && (await alle.count()) && (await alle.first().isVisible())) await alle.first().click();
  return weg;
}

// Am Handy in fünf Teilen: Die Messung jedes Bedienelements braucht Zeit (Grenze je Rauchtest 120 s).
for (const teil of [0, 1, 2, 3, 4])
  rauchtest(
    `Handy: Werkbank „Ablage aufbauen“ mit 44-px-Tippflächen, Teil ${teil + 1} (#1213, #1227)`,
    { handy: true, als: LENA },
    async (s) => {
      await s.goto(BASIS + '/ablage/start');
      await verwalten(s);
      const funde = [];
      for (const seite of ABLAGE_AUFBAUEN.filter((_, i) => i % 5 === teil)) {
        const beginn = Date.now();
        const weg = await oeffnen(s, seite);
        await keineWaagerechteRolle(s);
        for (const v of await tippflaechenPruefen(s, WERKBANK_BEREICHE)) funde.push(`${weg}: ${v}`);
        console.log(`# Ablage aufbauen Handy ${weg}: ${Math.round((Date.now() - beginn) / 1000)} s`);
      }
      assert.deepEqual(funde, [], `Zu kleine Tippflächen am Handy:\n${funde.join('\n')}`);
    },
  );
