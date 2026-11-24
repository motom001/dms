/**
 * Rauchtests: Werkbank → Daten sichern (Sicherung, Vollexport, Papierkorb) – #1169, #1195, #1196, #1197.
 * Baut auf werkbank.mjs auf (dort entsteht die erste Sicherung); allein gestartet legt der Test selbst welche an.
 */
import assert from 'node:assert/strict';
import '../einrichtung.mjs';
import { api, BASIS, daten, LENA, rauchtest, schemaWechseln, sitzung, verwalten } from '../hilfen.mjs';
import { axePruefen, tippflaechenPruefen } from '../muster.mjs';

// Wiederherstellen (Abschnitt der Sicherung) antwortet außerhalb des Wartungsmodus mit 409 – das ist gewollt.
const SICHERUNG_ERWARTET = [{ status: 409, pfad: /^\/api\/wiederherstellung\/sicherungen$/ }];

/** Werkbank → Sicherung öffnen; gibt den Bereich „Bearbeitung“ zurück. */
async function sicherungOeffnen(s) {
  await s.goto(BASIS + '/werkbank/sicherung');
  const bearbeitung = s.getByRole('region', { name: 'Bearbeitung' });
  await bearbeitung.getByRole('heading', { name: 'Sicherung', level: 1 }).waitFor();
  return bearbeitung;
}

/** „Jetzt sichern“ und warten, bis die Liste eine Zeile mehr hat. */
async function sichern(bearbeitung) {
  const zeilen = bearbeitung.locator('#liste tbody tr');
  const vorher = await zeilen.count();
  await bearbeitung.getByRole('button', { name: 'Jetzt sichern' }).click();
  await zeilen.nth(vorher).waitFor({ timeout: 60_000 });
  await bearbeitung.getByRole('button', { name: 'Jetzt sichern' }).waitFor({ timeout: 60_000 });
}

// Mehrere Sicherungen auswählen und mit einer Rückfrage löschen (#1169, #1310): keine Sicherung ist geschützt, „Alle
// auswählen“ wählt alle, die Rückfrage nennt Anzahl und Platz und – sind alle gewählt – dass lokal keine mehr da ist.
// Danach sind alle weg; zum Schluss legt der Test wieder eine an, damit spätere Tests eine Sicherung vorfinden.
rauchtest(
  'Werkbank: Sicherungen auswählen und gemeinsam löschen, alle ohne Sonderschutz (#1169, #1310)',
  { als: LENA, erwartet: SICHERUNG_ERWARTET },
  async (s) => {
    await s.goto(BASIS + '/ablage/start');
    await verwalten(s);
    const bearbeitung = await sicherungOeffnen(s);
    await bearbeitung.getByText(/räumt Ablago selbst weg/).waitFor();
    await bearbeitung.getByRole('link', { name: 'Aufbewahrung ändern' }).waitFor();
    const zeilen = bearbeitung.locator('#liste tbody tr');
    while ((await zeilen.count()) < 3) await sichern(bearbeitung);
    const anzahl = await zeilen.count();
    // Kein Sonderschutz: auch die neueste ist wählbar, kein „geschützt“, kein Hinweis dazu.
    assert.equal(await zeilen.first().getByRole('checkbox').isDisabled(), false, 'neueste wählbar');
    assert.equal(await bearbeitung.getByText('geschützt').count(), 0, 'kein „geschützt“');
    // Zwei wählen und gemeinsam löschen; die Rückfrage sagt nichts von „alle“.
    await zeilen.nth(1).getByRole('checkbox').check();
    await zeilen.nth(2).getByRole('checkbox').check();
    await bearbeitung.getByRole('button', { name: 'Ausgewählte löschen (2)', exact: true }).click();
    let frage = s.getByRole('alertdialog', { name: '2 Sicherungen löschen?' });
    await frage.getByText(/Frei werden etwa/).waitFor();
    assert.equal(await frage.getByText(/lokal keine Sicherung mehr/).count(), 0, 'nicht alle gewählt');
    await frage.getByRole('button', { name: 'Endgültig löschen' }).click();
    await bearbeitung.getByText('2 Sicherungen gelöscht.').waitFor({ timeout: 30_000 });
    // Die Liste lädt nach der Meldung neu: warten, bis die beiden Zeilen weg sind.
    await zeilen.nth(anzahl - 2).waitFor({ state: 'detached' });
    assert.equal(await zeilen.count(), anzahl - 2);
    // „Alle auswählen“ wählt wirklich alle, die Rückfrage sagt es, danach ist keine lokale Sicherung mehr da.
    const rest = await zeilen.count();
    await bearbeitung.getByLabel('Alle auswählen').check();
    await bearbeitung.getByRole('button', { name: `Ausgewählte löschen (${rest})` }).click();
    frage = s.getByRole('alertdialog', { name: rest === 1 ? 'Eine Sicherung löschen?' : `${rest} Sicherungen löschen?` });
    await frage.getByText(/Damit sind alle gewählt: Danach ist lokal keine Sicherung mehr da\./).waitFor();
    await frage.getByRole('button', { name: 'Endgültig löschen' }).click();
    await bearbeitung.getByText(/Noch keine Sicherung im/).waitFor({ timeout: 30_000 });
    assert.equal(await zeilen.count(), 0, 'alle gelöscht');
    await sichern(bearbeitung);
  },
);

// Vollexport mit Prüfsummen (#1195): erst „Prüfsummen (SHA256SUMS)“, dann „ZIP herunterladen“ mit Hinweis aufs Löschen;
// nach dem Herunterladen bleibt der Eintrag mit der SHA-256 der ZIP stehen – ohne Neuladen der Seite.
rauchtest('Werkbank: Vollexport mit Prüfsummen, Eintrag bleibt nach dem Herunterladen (#1195)', { als: LENA }, async (s) => {
  await s.goto(BASIS + '/ablage/start');
  await verwalten(s);
  await s.goto(BASIS + '/werkbank/vollexport');
  const bearbeitung = s.getByRole('region', { name: 'Bearbeitung' });
  await bearbeitung.getByRole('heading', { name: 'Vollexport', level: 1 }).waitFor();
  await bearbeitung.getByRole('button', { name: 'Export starten' }).click();
  const eintrag = bearbeitung.locator('#exporte li').first();
  await eintrag.getByRole('link', { name: 'ZIP herunterladen' }).waitFor({ timeout: 90_000 });
  const knoepfe = (await eintrag.locator('.knoepfe').first().locator('a, button').allInnerTexts()).map((x) => x.trim());
  assert.deepEqual(knoepfe.slice(0, 2), ['Prüfsummen (SHA256SUMS)', 'ZIP herunterladen'], 'Prüfsummen vor der ZIP');
  await eintrag.getByText(/wird der Export auf dem Server gelöscht/).waitFor();
  const summen = await Promise.all([
    s.waitForEvent('download'),
    eintrag.getByRole('link', { name: 'Prüfsummen (SHA256SUMS)' }).click(),
  ]).then(([d]) => d);
  assert.match(summen.suggestedFilename(), /SHA256SUMS$/);
  const zip = await Promise.all([s.waitForEvent('download'), eintrag.getByRole('link', { name: 'ZIP herunterladen' }).click()]).then(
    ([d]) => d,
  );
  assert.equal(await zip.failure(), null);
  await eintrag.getByText(/^Heruntergeladen am .* und auf dem Server gelöscht/).waitFor({ timeout: 30_000 });
  assert.match(await eintrag.locator('dd.mono').innerText(), /^[0-9a-f]{64}$/);
  await eintrag.getByRole('link', { name: 'Prüfsummen (SHA256SUMS)' }).waitFor();
  await eintrag.getByRole('button', { name: 'Prüfsumme kopieren' }).waitFor();
  // #1505: ein Satz mit Verweis aufs Handbuch, wenn Windows die ZIP als „ungültig“ meldet.
  const windows = bearbeitung.getByRole('link', { name: 'So kommst du an sie heran' });
  assert.match((await windows.getAttribute('href')) ?? '', /export\/#windows-ungueltig$/);
});

// „Benutzer dürfen ihre eigenen Daten exportieren“ unter Daten sichern → Einstellungen (#1196): im Vollexport nur ein
// leiser Satz mit Link.
rauchtest(
  'Werkbank: eigener Export der Benutzer unter Daten sichern → Einstellungen, nicht im Vollexport (#1196)',
  { als: LENA },
  async (s) => {
    await s.goto(BASIS + '/ablage/start');
    await verwalten(s);
    await s.goto(BASIS + '/werkbank/vollexport');
    const bearbeitung = s.getByRole('region', { name: 'Bearbeitung' });
    await bearbeitung.getByRole('heading', { name: 'Vollexport', level: 1 }).waitFor();
    assert.equal(await bearbeitung.getByRole('switch').count(), 0, 'kein Schalter im Vollexport');
    await bearbeitung
      .getByText('Ob Benutzer ihre eigenen Daten exportieren dürfen, stellst du unter Daten sichern → Einstellungen ein.')
      .waitFor();
    await bearbeitung.getByRole('link', { name: 'Daten sichern → Einstellungen', exact: true }).click();
    await s.waitForURL(/\/werkbank\/daten/);
    await bearbeitung.getByRole('heading', { name: 'Daten sichern → Einstellungen', level: 1 }).waitFor();
    const schalter = bearbeitung.getByRole('switch', { name: 'Benutzer dürfen ihre eigenen Daten exportieren' });
    const vorher = await schalter.getAttribute('aria-checked');
    await schalter.click();
    await bearbeitung
      .getByText(vorher === 'true' ? 'Meine Daten exportieren ist abgeschaltet.' : 'Benutzer dürfen ihre eigenen Daten exportieren.', {
        exact: true,
      })
      .waitFor();
    await schalter.click();
    await bearbeitung
      .getByText(vorher === 'true' ? 'Benutzer dürfen ihre eigenen Daten exportieren.' : 'Meine Daten exportieren ist abgeschaltet.', {
        exact: true,
      })
      .waitFor();
    // In der Leiste unter „Daten sichern“ kurz „Einstellungen“ (#1310).
    await s
      .getByRole('complementary', { name: 'Bereiche' })
      .getByRole('link', { name: /^Einstellungen/ })
      .waitFor();
  },
);

// Papierkorb (#1197): Suche, Filter und Mehrfachauswahl in der Ablage; die Aufbewahrung steht unter Daten sichern →
// Einstellungen, im Papierkorb der Werkbank nur eine Zeile mit Link dorthin.
rauchtest('Papierkorb: suchen, mehrere wiederherstellen; Aufbewahrung unter Einstellungen (#1197)', { als: LENA }, async (s) => {
  const cookie = await sitzung(LENA);
  for (const objekt of ['Korbtest Eins', 'Korbtest Zwei']) {
    const m = (await api('POST', '/api/mappen', { cookie, body: { typId: daten.bausteine.id, werte: { objekt } } })).daten;
    await api('DELETE', `/api/mappen/${m.id}?grund=nicht_noetig`, { cookie });
  }
  await s.goto(BASIS + '/ablage/papierkorb');
  const suche = s.getByRole('search', { name: 'Papierkorb durchsuchen' });
  await suche.getByRole('searchbox').fill('Korbtest Eins');
  await suche.getByText('1 Treffer').waitFor();
  await suche.getByRole('searchbox').fill('Korbtest');
  await suche.getByText('2 Treffer').waitFor();
  await suche.getByLabel('Mappentyp').selectOption({ label: 'Kellerraum' });
  await suche.getByText('2 Treffer').waitFor();
  await s.getByRole('checkbox', { name: 'Alle auswählen' }).check();
  await s.getByRole('button', { name: 'Wiederherstellen (2)' }).click();
  await s.getByText('2 Einträge wiederhergestellt.').waitFor({ timeout: 30_000 });
  await s
    .getByText(/Keine Treffer|Papierkorb ist leer/)
    .first()
    .waitFor();
  // Werkbank: keine Aufbewahrung mehr im Papierkorb, nur die Zeile mit Link zu den Einstellungen.
  await verwalten(s);
  await s.goto(BASIS + '/werkbank/papierkorb');
  await s.getByText(/im Papierkorb – ändern unter/).waitFor();
  assert.equal(await s.getByLabel('Tage im Papierkorb').count(), 0, 'Aufbewahrung nicht im Papierkorb');
  await s.getByRole('link', { name: 'Daten sichern → Einstellungen', exact: true }).first().click();
  await s.waitForURL(/\/werkbank\/daten/);
  await s.getByLabel('Tage im Papierkorb').waitFor();
  await s.getByLabel('Historie endgültig gelöschter Mappen behalten (Tage)').waitFor();
});

// Entfernte Sicherungen (#976): Ohne echtes Ziel außer Haus ergänzt der Test die Antwort der Werkbank um zwei Sicherungen,
// die es nur noch am Ziel gibt – eine holbar, eine von einem älteren Paket (nur Ort und Dateiname mit Anleitung).
const ENTFERNT = {
  nur: [
    {
      name: '2026-10-01_0200-automatisch',
      datei: '2026-10-01_0200-automatisch.dms-sicherung',
      paket: 'webdav',
      paketName: 'Sicherungsziel WebDAV',
      ziel: 'WebDAV https://cloud.example.org/Ablago',
      groesse: 52_428_800,
      sha256: 'a'.repeat(64),
      beginn: '2026-10-01T00:00:00.000Z',
      holbar: true,
    },
    {
      name: '2026-09-01_0200-automatisch',
      datei: '2026-09-01_0200-automatisch.dms-sicherung',
      paket: 'webdav',
      paketName: 'Sicherungsziel WebDAV',
      ziel: 'WebDAV https://cloud.example.org/Ablago',
      groesse: 51_380_224,
      sha256: 'b'.repeat(64),
      beginn: '2026-09-01T00:00:00.000Z',
      holbar: false,
      grund: 'kann-nicht',
    },
  ],
  auchAmZiel: {},
  fehler: [],
};
async function mitEntfernten(s) {
  await s.route(/\/api\/werkbank\/sicherung(\?.*)?$/, async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    const r = await route.fetch();
    await route.fulfill({ response: r, json: { ...(await r.json()), entfernt: ENTFERNT } });
  });
  await s.goto(BASIS + '/ablage/start');
  await verwalten(s);
  const bearbeitung = await sicherungOeffnen(s);
  const holbar = bearbeitung.locator('#liste tbody tr', { hasText: 'nur außer Haus' }).first();
  await holbar.waitFor();
  return bearbeitung;
}

rauchtest(
  'Werkbank: Sicherungen nur außer Haus in der Liste, axe hell und dunkel (#976)',
  { als: LENA, erwartet: SICHERUNG_ERWARTET },
  async (s) => {
    const bearbeitung = await mitEntfernten(s);
    const zeilen = bearbeitung.locator('#liste tbody tr', { hasText: 'nur außer Haus (Sicherungsziel WebDAV)' });
    assert.equal(await zeilen.count(), 2);
    await zeilen.nth(0).getByRole('button', { name: 'Herunterladen' }).waitFor();
    await zeilen.nth(0).getByRole('button', { name: 'Prüfen' }).waitFor();
    await zeilen.nth(1).getByText('Liegt am Ziel als 2026-09-01_0200-automatisch.dms-sicherung').waitFor();
    assert.match(
      await zeilen.nth(1).getByRole('link', { name: 'Anleitung' }).getAttribute('href'),
      /wiederherstellen\/#aus-einer-kopie-ausser-haus$/,
    );
    // Kein toter Knopf: weder Herunterladen noch Prüfen – nur „Aus der Liste nehmen“ (#1320).
    assert.deepEqual(
      (await zeilen.nth(1).getByRole('button').allInnerTexts()).map((x) => x.trim()),
      ['Aus der Liste nehmen'],
      'kein toter Knopf',
    );
    await bearbeitung.getByRole('button', { name: 'Ziele außer Haus neu abfragen' }).waitFor();
    // axe hell und dunkel ohne Maus über den Knöpfen und erst nach dem Farbübergang (Hover und Übergang beim Wechsel des
    // Schemas verfälschen sonst den Kontrast, vgl. #1189).
    const funde = [];
    for (const schema of ['light', 'dark']) {
      await schemaWechseln(s, schema);
      for (const v of await axePruefen(s, ['#liste'])) funde.push(`${schema}: ${v}`);
    }
    assert.deepEqual(funde, [], `axe meldet Verstöße:\n${funde.join('\n')}`);
  },
);

rauchtest(
  'Handy: Sicherungen nur außer Haus mit 44-px-Tippflächen (#976)',
  { handy: true, als: LENA, erwartet: SICHERUNG_ERWARTET },
  async (s) => {
    await mitEntfernten(s);
    const funde = await tippflaechenPruefen(s, ['#liste']);
    assert.deepEqual(funde, [], `Zu kleine Tippflächen am Handy:\n${funde.join('\n')}`);
  },
);

// „Lokal nur die neueste behalten“ (#1194): ohne erfolgreiche Kopie außer Haus gesperrt, mit Grund und Link; gesetzt,
// aber nicht wirksam: Hinweis. Der Test ergänzt die Antwort der Werkbank um den Stand (kein echtes Ziel außer Haus).
async function nurNeuesteStand(s, nurNeueste, plan = {}) {
  await s.route(/\/api\/werkbank\/sicherung(\?.*)?$/, async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    const r = await route.fetch();
    const j = await r.json();
    await route.fulfill({ response: r, json: { ...j, plan: { ...j.plan, ...plan }, zustand: { ...j.zustand, nurNeueste } } });
  });
  await s.goto(BASIS + '/ablage/start');
  await verwalten(s);
  const bearbeitung = await sicherungOeffnen(s);
  const zeitplan = bearbeitung.locator('#zeitplan');
  await zeitplan.getByRole('checkbox', { name: 'Lokal nur die neueste behalten' }).waitFor();
  return zeitplan;
}

rauchtest(
  'Werkbank: „Lokal nur die neueste“ nur mit Sicherung außer Haus, axe hell und dunkel (#1194)',
  { als: LENA, erwartet: SICHERUNG_ERWARTET, timeout: 90_000 },
  async (s) => {
    const zeitplan = await nurNeuesteStand(s, { gesetzt: false, moeglich: false, wirksam: false });
    assert.equal(await zeitplan.getByRole('checkbox', { name: 'Lokal nur die neueste behalten' }).isDisabled(), true);
    await zeitplan.getByText('Erst möglich, wenn eine Sicherung außer Haus eingerichtet ist').waitFor();
    assert.equal(await zeitplan.getByRole('link', { name: 'Zur Sicherung außer Haus' }).getAttribute('href'), '#ausser-haus');
    assert.equal(await zeitplan.getByRole('spinbutton', { name: 'Wöchentliche' }).isDisabled(), false, 'die Aufbewahrung bleibt änderbar');
    const funde = [];
    for (const schema of ['light', 'dark']) {
      await schemaWechseln(s, schema);
      for (const v of await axePruefen(s, ['#zeitplan'])) funde.push(`${schema}: ${v}`);
    }
    assert.deepEqual(funde, [], `axe meldet Verstöße:\n${funde.join('\n')}`);
  },
);

rauchtest(
  'Werkbank: „Lokal nur die neueste“ gesetzt, aber ohne Wirkung – Hinweis, Aufbewahrung änderbar (#1194)',
  { als: LENA, erwartet: SICHERUNG_ERWARTET, timeout: 90_000 },
  async (s) => {
    const zeitplan = await nurNeuesteStand(s, { gesetzt: true, moeglich: false, wirksam: false }, { nurNeueste: true });
    const haken = zeitplan.getByRole('checkbox', { name: 'Lokal nur die neueste behalten' });
    assert.equal(await haken.isDisabled(), false, 'abwählen geht immer');
    await zeitplan.getByText('Es gibt gerade keine erfolgreiche Kopie außer Haus').waitFor();
    assert.equal(await zeitplan.getByRole('spinbutton', { name: 'Wöchentliche' }).isDisabled(), false);
  },
);

rauchtest(
  'Handy: Zeitplan der Sicherung mit 44-px-Tippflächen (#1194)',
  { handy: true, als: LENA, erwartet: SICHERUNG_ERWARTET, timeout: 90_000 },
  async (s) => {
    await nurNeuesteStand(s, { gesetzt: false, moeglich: false, wirksam: false });
    const funde = await tippflaechenPruefen(s, ['#zeitplan']);
    assert.deepEqual(funde, [], `Zu kleine Tippflächen am Handy:\n${funde.join('\n')}`);
  },
);

// „Wozu?“ (#1529): beim Sichern von Hand ein kurzer Name; er steht in der Liste und in der Meldung und lässt sich ändern.
rauchtest(
  'Werkbank: Sicherung von Hand mit „Wozu?“, nachträglich ändern (#1529)',
  { als: LENA, erwartet: SICHERUNG_ERWARTET },
  async (s) => {
    await s.goto(BASIS + '/ablage/start');
    await verwalten(s);
    const bearbeitung = await sicherungOeffnen(s);
    const jetzt = bearbeitung.locator('#jetzt');
    await jetzt.getByRole('textbox', { name: /Wozu\?/ }).fill('Vor dem Rauchtest');
    await jetzt.getByRole('button', { name: 'Jetzt sichern' }).click();
    await jetzt.getByText(/Sicherung fertig .*„Vor dem Rauchtest“/).waitFor({ timeout: 60_000 });
    const zeile = bearbeitung.locator('#liste tbody tr', { hasText: '„Vor dem Rauchtest“' });
    await zeile.waitFor();
    await zeile.getByText('von Hand').waitFor();
    await zeile.getByRole('button', { name: 'Wozu? ändern' }).click();
    // Das Feld steht an derselben Stelle in der Zeile (die Zeile zeigt den Namen dann nur im Feld).
    const liste = bearbeitung.locator('#liste');
    await liste.getByRole('textbox', { name: /Wozu\?/ }).fill('Nach dem Rauchtest');
    await liste.getByRole('button', { name: 'Speichern' }).click();
    await bearbeitung.locator('#liste tbody tr', { hasText: '„Nach dem Rauchtest“' }).waitFor();
    assert.equal(await jetzt.getByRole('textbox', { name: /Wozu\?/ }).inputValue(), '', 'Feld nach dem Sichern leer');
    const funde = await axePruefen(s, ['#jetzt', '#liste']);
    assert.deepEqual(funde, [], `axe meldet Verstöße:\n${funde.join('\n')}`);
  },
);

// „Aus der Liste nehmen“ (#1320): Haken auch an Sicherungen, die nur außer Haus liegen; der Knopf ist nur aktiv, wenn
// alle gewählten nur außer Haus liegen (sonst mit Grund), die Rückfrage ist nicht rot und sagt, dass die Dateien am Ziel
// bleiben; danach unter „Ausgeblendete (1)“ mit „Wieder zeigen“. Ohne echtes Ziel beantwortet der Test die Aufrufe.
rauchtest(
  'Werkbank: Sicherungen nur außer Haus aus der Liste nehmen und wieder zeigen, axe (#1320)',
  { als: LENA, erwartet: SICHERUNG_ERWARTET },
  async (s) => {
    let stand = structuredClone(ENTFERNT);
    await s.route(/\/api\/werkbank\/sicherung\/ausblenden$/, async (route) => {
      const { namen } = route.request().postDataJSON();
      const weg = stand.nur.filter((e) => namen.includes(e.name)).map((e) => ({ ...e, von: LENA.email, am: new Date().toISOString() }));
      stand = { ...stand, nur: stand.nur.filter((e) => !namen.includes(e.name)), ausgeblendet: [...(stand.ausgeblendet ?? []), ...weg] };
      await route.fulfill({ json: { namen } });
    });
    await s.route(/\/api\/werkbank\/sicherung\/[^/]+\/einblenden$/, async (route) => {
      const name = decodeURIComponent(route.request().url().split('/').at(-2));
      const e = stand.ausgeblendet.find((x) => x.name === name);
      stand = { ...stand, nur: [...stand.nur, e], ausgeblendet: stand.ausgeblendet.filter((x) => x.name !== name) };
      await route.fulfill({ status: 204, body: '' });
    });
    await s.route(/\/api\/werkbank\/sicherung(\?.*)?$/, async (route) => {
      if (route.request().method() !== 'GET') return route.continue();
      const r = await route.fetch();
      await route.fulfill({ response: r, json: { ...(await r.json()), entfernt: stand } });
    });
    await s.goto(BASIS + '/ablage/start');
    await verwalten(s);
    const bearbeitung = await sicherungOeffnen(s);
    const entfernt = bearbeitung.locator('#liste tbody tr', { hasText: 'nur außer Haus' });
    await entfernt.first().waitFor();
    const lokal = bearbeitung.locator('#liste tbody tr:not(.entfernt)').first();
    // Gemischt gewählt: beide Knöpfe gesperrt, mit Grund.
    await entfernt.nth(1).getByRole('checkbox').check();
    await lokal.getByRole('checkbox').check();
    const aus = bearbeitung.getByRole('button', { name: 'Aus der Liste nehmen (2)', exact: true });
    assert.equal(await aus.getAttribute('aria-disabled'), 'true', 'gemischt: Aus der Liste nehmen gesperrt');
    assert.equal(
      await bearbeitung.getByRole('button', { name: 'Ausgewählte löschen (2)', exact: true }).getAttribute('aria-disabled'),
      'true',
    );
    const gemischt = [];
    for (const schema of ['light', 'dark']) {
      await schemaWechseln(s, schema);
      for (const v of await axePruefen(s, ['#liste'])) gemischt.push(`${schema}: ${v}`);
    }
    assert.deepEqual(gemischt, [], `axe meldet Verstöße:\n${gemischt.join('\n')}`);
    await lokal.getByRole('checkbox').uncheck();
    await bearbeitung.getByRole('button', { name: 'Aus der Liste nehmen (1)', exact: true }).click();
    const frage = s.getByRole('alertdialog', { name: 'Eine Sicherung aus der Liste nehmen?' });
    await frage
      .getByText(/Die Dateien bleiben am Ziel Sicherungsziel WebDAV \(WebDAV https:\/\/cloud\.example\.org\/Ablago\) liegen\./)
      .waitFor();
    await frage.getByRole('button', { name: 'Aus der Liste nehmen' }).click();
    await entfernt.nth(1).waitFor({ state: 'detached' });
    assert.equal(await entfernt.count(), 1);
    const abschnitt = bearbeitung.getByRole('button', { name: /^Ausgeblendete \(1\)/ });
    await abschnitt.click();
    const liste = bearbeitung.locator('#sicherung-ausgeblendet');
    await liste.getByText(`Aus der Liste genommen von ${LENA.email}`, { exact: false }).waitFor();
    await liste.getByRole('button', { name: 'Wieder zeigen' }).click();
    await entfernt.nth(1).waitFor();
    assert.equal(await abschnitt.count(), 0, 'nichts mehr ausgeblendet');
  },
);

// Wiederherstellen (#1530): „Vorher den jetzigen Stand sichern (empfohlen)“ ist angehakt, mit Größe; Abwählen fragt
// einmal nach. Scheitert die Sicherung davor schon beim Beginn, steht der Fehler da mit „Trotzdem ohne Sicherung
// wiederherstellen“ – Ablago wiederholt nichts von selbst. Ohne echten Wartungsmodus beantwortet der Test die Aufrufe.
rauchtest(
  'Werkbank: Wiederherstellen – Sicherung vorher sichtbar, abwählbar, ihr Scheitern mit Rückfrage (#1530)',
  { als: LENA, erwartet: [{ status: 507, pfad: /^\/api\/wiederherstellung\/start$/ }] },
  async (s) => {
    await s.goto(BASIS + '/ablage/start');
    await verwalten(s);
    const z = await (await s.request.get(BASIS + '/api/werkbank/sicherung', { headers: { 'x-dms': '1' } })).json();
    const eintrag = z.liste.find((x) => x.meta);
    assert.ok(eintrag, 'eine Sicherung liegt bereit');
    await s.route(/\/api\/wartung$/, (r) => r.fulfill({ json: { stufe: 'aktiv', text: '', ende: null, aktivAb: null, sekunden: null } }));
    await s.route(/\/api\/wiederherstellung\/sicherungen$/, (r) =>
      r.fulfill({
        json: { art: 'laufend', ordner: '/data/backup', liste: [{ name: eintrag.name, bytes: eintrag.bytes, meta: eintrag.meta }] },
      }),
    );
    await s.route(/\/api\/wiederherstellung\/abgleich$/, (r) =>
      r.fulfill({
        json: {
          name: eintrag.name,
          meta: eintrag.meta,
          vergleich: [],
          probleme: [],
          hinweise: [],
          schluesselNoetig: false,
          vorher: { reicht: true, frei: 20 * 1024 ** 3, geschaetzt: 1.6 * 1024 ** 3, mindest: 1024 ** 3 },
        },
      }),
    );
    await s.route(/\/api\/wiederherstellung\/start$/, (r) =>
      r.fulfill({
        status: 507,
        json: {
          fehler: 'Die Sicherung des jetzigen Stands ließ sich nicht beginnen: Zu wenig freier Speicherplatz.',
          details: { vorherGescheitert: true },
        },
      }),
    );
    await sicherungOeffnen(s);
    await s.getByRole('radio').first().check();
    const haken = s.getByRole('checkbox', { name: 'Vorher den jetzigen Stand sichern (empfohlen)' });
    await haken.waitFor();
    assert.equal(await haken.isChecked(), true, 'angehakt');
    await s.getByText(/etwa 1,6 GB/).waitFor();
    // Abwählen fragt einmal nach; „Abbrechen“ lässt den Haken.
    await haken.click();
    let frage = s.getByRole('alertdialog', { name: 'Ohne Sicherung wiederherstellen?' });
    await frage.getByText('Ohne Sicherung kannst du den jetzigen Stand nicht mehr zurückholen.').waitFor();
    await frage.getByRole('button', { name: 'Abbrechen' }).click();
    assert.equal(await haken.isChecked(), true, 'nach „Abbrechen“ weiter angehakt');
    // Starten: Die Sicherung davor scheitert schon beim Beginn – Fehler und „Trotzdem ohne Sicherung“.
    await s.getByRole('checkbox', { name: /Mir ist klar/ }).check();
    await s.getByRole('button', { name: 'Wiederherstellen', exact: true }).click();
    frage = s.getByRole('alertdialog');
    await frage.getByRole('textbox').fill('wiederherstellen');
    await frage.getByRole('button', { name: 'Wiederherstellen' }).click();
    await s.getByText('Die Sicherung des jetzigen Stands ließ sich nicht beginnen: Zu wenig freier Speicherplatz.').waitFor();
    await s.getByRole('button', { name: 'Trotzdem ohne Sicherung wiederherstellen' }).waitFor();
    const funde = await axePruefen(s, ['.wiederherstellen']);
    assert.deepEqual(funde, [], `axe meldet Verstöße:\n${funde.join('\n')}`);
  },
);
