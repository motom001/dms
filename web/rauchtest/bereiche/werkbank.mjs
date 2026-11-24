/**
 * Rauchtests: Werkbank: Mappentyp, Stempel, Sprungleiste, Notfallblatt, Sicherung, Stufen der Leiste, Beispiel-Ablage; Rundgang und
 * Abmelden.
 * Allein starten (frisch gestartetes Ablago, siehe rauchtest.mjs): node web/rauchtest/bereiche/werkbank.mjs [fehlerordner] [musterordner]
 */
import assert from 'node:assert/strict';
import '../einrichtung.mjs';
import {
  BASIS,
  benutzermenue,
  JONAS,
  keineWaagerechteRolle,
  LENA,
  rauchtest,
  rundgaengeGesehen,
  schemaWechseln,
  sitzung,
  verwalten,
  WERKBANK_BEREICHE,
} from '../hilfen.mjs';
import { axePruefen, tippflaechenPruefen } from '../muster.mjs';

rauchtest('Werkbank: Mappentyp bearbeiten (Felder)', { als: LENA }, async (s) => {
  await s.goto(BASIS + '/ablage/start');
  await verwalten(s);
  await s
    .getByRole('complementary', { name: 'Bereiche' })
    .getByRole('link', { name: /^Mappentypen/ })
    .click();
  await s.getByRole('link', { name: /^Vertrag \d+ Felder/ }).click();
  const bearbeitung = s.getByRole('region', { name: 'Bearbeitung' });
  await bearbeitung.getByRole('heading', { name: 'Vertrag', level: 1 }).waitFor();
  const felder = bearbeitung.getByRole('region', { name: 'Felder' });
  await felder.getByRole('button', { name: 'Felder' }).click();
  await felder.getByRole('button', { name: '+ Feld hinzufügen' }).click();
  await felder.getByRole('textbox', { name: 'Bezeichnung' }).fill('Kundenportal');
  await bearbeitung.getByRole('button', { name: 'Mappentyp speichern' }).click();
  // Gesperrt ist der Knopf auch, solange gespeichert wird – erst die Meldung sagt, dass der Server fertig ist. Sonst
  // bricht der Wechsel in die Ablage das Speichern ab oder lädt die Typen, bevor das Feld da ist.
  await bearbeitung.getByText('Mappentyp gespeichert.').waitFor();
  await bearbeitung.getByRole('button', { name: 'Mappentyp speichern', disabled: true }).waitFor();
  await felder.getByRole('button', { name: /^Kundenportal kundenportal/ }).waitFor();
  // Das neue Feld steht im Formular der Mappen.
  await s.goto(BASIS + '/ablage/start');
  await s
    .getByRole('complementary', { name: 'Ansichten' })
    .getByRole('link', { name: /^Vertrag \d/ })
    .click();
  await s
    .getByRole('region', { name: 'Mappen' })
    .getByRole('link', { name: /Stromvertrag Haus/ })
    .first()
    .click();
  await s.getByRole('region', { name: 'Mappe' }).getByRole('textbox', { name: 'Kundenportal' }).waitFor();
});

rauchtest('Werkbank: Stempel-Vorlage aus der Mitte öffnen (#990)', { als: LENA }, async (s) => {
  await s.goto(BASIS + '/ablage/start');
  await verwalten(s);
  await s
    .getByRole('complementary', { name: 'Bereiche' })
    .getByRole('link', { name: /^Stempel/ })
    .click();
  const elemente = s.getByRole('region', { name: 'Elemente' });
  await elemente.getByRole('link', { name: '+ Stempel' }).waitFor();
  await elemente.getByRole('link', { name: /^Kopie für/ }).click();
  await s.waitForURL(/\/werkbank\/stempel\/kopie$/);
  const bearbeitung = s.getByRole('region', { name: 'Bearbeitung' });
  await bearbeitung.getByRole('heading', { name: /^Kopie für/, level: 1 }).waitFor();
  // Live-Vorschau (#799) und Speicherleiste rechts; bestehende Vorlagen öffnen zugeklappt mit Sprungleiste (#1000).
  await bearbeitung.getByRole('heading', { name: 'Vorschau' }).waitFor();
  await bearbeitung.getByRole('navigation', { name: 'Bereiche der Vorlage' }).getByRole('button', { name: 'Alle aufklappen' }).click();
  await bearbeitung.getByRole('textbox', { name: 'Name' }).fill('Kopie für Rauchtest');
  await bearbeitung.getByRole('button', { name: 'Vorlage speichern' }).click();
  await bearbeitung.locator('.hinweis.gut').getByText('Gespeichert.').waitFor();
  await elemente.getByRole('link', { name: /^Kopie für Rauchtest/ }).waitFor();
  // Alter Link mit ?offen=… führt auf die Vorlage rechts.
  await s.goto(BASIS + '/werkbank/stempel?offen=entwurf');
  await s.waitForURL(/\/werkbank\/stempel\/entwurf$/);
  await bearbeitung.getByRole('heading', { name: 'Entwurf', level: 1 }).waitFor();
});

// Editor rechts: Sprungleiste und Bereiche (#1000) – wie beim Mappentyp auch bei Nummernkreisen, Postfächern und Benutzern.
// „Alle aufklappen“ merkt sich das Gerät; ein Fehler beim Speichern markiert und öffnet den betroffenen Bereich.
rauchtest(
  'Werkbank: Sprungleiste und Bereiche in allen Editoren (#1000)',
  { als: LENA, erwartet: [{ status: 422, pfad: /^\/api\/werkbank\/postfaecher$/ }] },
  async (s) => {
    await s.goto(BASIS + '/ablage/start');
    await verwalten(s);
    const bearbeitung = s.getByRole('region', { name: 'Bearbeitung' });
    await s.goto(BASIS + '/werkbank/nummernkreise/archivnummer');
    const leiste = bearbeitung.getByRole('navigation', { name: 'Bereiche des Nummernkreises' });
    for (const name of ['Grunddaten', 'Stand', 'Aufkleber drucken', 'Verwendet in'])
      await leiste.getByRole('button', { name, exact: true }).waitFor();
    await leiste.getByRole('button', { name: 'Alle aufklappen' }).click();
    await bearbeitung.getByRole('textbox', { name: 'Name' }).waitFor();
    await s.reload();
    await bearbeitung.getByRole('textbox', { name: 'Name' }).waitFor();
    await leiste.getByRole('button', { name: 'Alle zuklappen' }).waitFor();
    // Tastatur: Enter auf einem Sprung setzt den Fokus auf den Kopf des Bereichs, Tab geht im Bereich weiter.
    await leiste.getByRole('button', { name: 'Stand', exact: true }).focus();
    await s.keyboard.press('Enter');
    await s.waitForFunction(() => document.activeElement?.id === 'stand-kopf', null, { timeout: 5000 });
    assert.equal(
      await s.evaluate(() => document.activeElement?.closest('[data-sprungleiste]') === null),
      true,
      'Fokus nicht mehr in der Sprungleiste',
    );
    // Neues Postfach: alles offen, ohne „Stand“; ohne Namen und Benutzer meldet der Server Grunddaten und Verbindung.
    await s.goto(BASIS + '/werkbank/postfaecher/neu');
    const pf = bearbeitung.getByRole('navigation', { name: 'Bereiche des Postfachs' });
    await pf.getByRole('button', { name: 'Abholen', exact: true }).waitFor();
    // An/aus als Schalter (#1188), nicht als Haken.
    await bearbeitung.getByRole('switch', { name: 'Automatischer Abruf' }).waitFor();
    assert.equal(await pf.getByRole('button', { name: 'Stand', exact: true }).count(), 0, 'Ein neues Postfach hat noch keinen Stand');
    await bearbeitung.getByRole('textbox', { name: 'Server' }).fill('imap.example.org');
    await s.getByRole('button', { name: 'Postfach anlegen' }).click();
    await pf
      .getByRole('button', { name: /^Grunddaten/ })
      .and(s.locator('[title="Grunddaten: Fehler"]'))
      .waitFor();
    await pf
      .getByRole('button', { name: /^Verbindung/ })
      .and(s.locator('[title="Verbindung: Fehler"]'))
      .waitFor();
    assert.equal(await pf.locator('[title="Abholen: Fehler"]').count(), 0, 'Abholen hat keinen Fehler');
    // Benutzer: die Bereiche aus dem Vorschlag in #1000.
    await s.goto(BASIS + '/werkbank/benutzer');
    await s.getByRole('region', { name: 'Elemente' }).getByRole('link', { name: /^Lena/ }).first().click();
    const bl = bearbeitung.getByRole('navigation', { name: 'Bereiche des Benutzers' });
    for (const name of ['Grunddaten', 'Rollen und Rechte', 'Vertretung', 'Anmeldung und Sicherheit'])
      await bl.getByRole('button', { name, exact: true }).waitFor();
    await bearbeitung.locator('.ueber', { hasText: /^Benutzer$/ }).waitFor();
  },
);

// Wiederherstellen (Abschnitt der Sicherung) antwortet außerhalb des Wartungsmodus mit 409 – das ist gewollt.
rauchtest(
  'Werkbank: Notfallblatt nur unter Verschlüsselung, Sicherung verweist dorthin (#993, #1193)',
  { als: LENA, erwartet: [{ status: 409, pfad: /^\/api\/wiederherstellung\/sicherungen$/ }] },
  async (s) => {
    await s.goto(BASIS + '/ablage/start');
    await verwalten(s);
    await s
      .getByRole('complementary', { name: 'Bereiche' })
      .getByRole('link', { name: /^Sicherung/ })
      .click();
    const bearbeitung = s.getByRole('region', { name: 'Bearbeitung' });
    await bearbeitung.getByRole('heading', { name: 'Sicherung', level: 1 }).waitFor();
    assert.equal(
      await bearbeitung.getByRole('heading', { name: /^Notfallblatt/ }).count(),
      0,
      'kein Abschnitt Notfallblatt in der Sicherung',
    );
    // #1193: In der Statuszeile nichts zum Notfallblatt (es ist aktuell), auch kein Handbuch-Link neben dem Hilfesymbol bei „Außer Haus“.
    assert.equal(await bearbeitung.getByText(/Notfallblatt heruntergeladen/).count(), 0, 'kein Datum des Notfallblatts in der Sicherung');
    assert.equal(await bearbeitung.getByRole('link', { name: /im Handbuch/ }).count(), 0, 'kein doppelter Handbuch-Link');
    await bearbeitung.getByRole('link', { name: 'Verschlüsselung', exact: true }).first().click();
    await s.waitForURL(/\/werkbank\/verschluesselung/);
    await bearbeitung.getByRole('heading', { name: /^Notfallblatt/ }).waitFor();
    await bearbeitung.getByText(/^Zuletzt heruntergeladen/).waitFor();
    await bearbeitung.getByRole('link', { name: 'Notfallblatt herunterladen (PDF)' }).waitFor();
  },
);

// Sicherung herunterladen (#975): anlegen, „Herunterladen“ als Erstes in der Zeile, der Browser lädt die verschlüsselte
// Datei (Name mit Datum), darunter Hinweis auf das Notfallblatt, Größe und Prüfsumme.
rauchtest(
  'Werkbank: Sicherung anlegen und herunterladen (#975)',
  { als: LENA, erwartet: [{ status: 409, pfad: /^\/api\/wiederherstellung\/sicherungen$/ }] },
  async (s) => {
    await s.goto(BASIS + '/ablage/start');
    await verwalten(s);
    await s
      .getByRole('complementary', { name: 'Bereiche' })
      .getByRole('link', { name: /^Sicherung/ })
      .click();
    const bearbeitung = s.getByRole('region', { name: 'Bearbeitung' });
    await bearbeitung.getByRole('heading', { name: 'Sicherung', level: 1 }).waitFor();
    await bearbeitung.getByRole('button', { name: 'Jetzt sichern' }).click();
    const zeile = bearbeitung.locator('#liste tbody tr').first();
    const laden = zeile.getByRole('button', { name: 'Herunterladen' });
    await laden.waitFor({ timeout: 60_000 });
    const knoepfe = await zeile.locator('td').last().getByRole('button').allInnerTexts();
    assert.deepEqual(
      knoepfe.map((x) => x.trim()),
      ['Herunterladen', 'Prüfen', 'Löschen'],
      'Herunterladen · Prüfen · Löschen',
    );
    const [download] = await Promise.all([s.waitForEvent('download'), laden.click()]);
    assert.match(download.suggestedFilename(), /^\d{4}-\d{2}-\d{2}_\d{4}-manuell(-\d+)?\.dms-sicherung$/);
    assert.equal(await download.failure(), null);
    await bearbeitung.getByText('Zum Wiederherstellen brauchst du dein Notfallblatt (Schlüssel).').waitFor();
    await bearbeitung.getByText('Prüfsumme (SHA-256)').waitFor();
    await bearbeitung.getByRole('link', { name: '.json herunterladen' }).waitFor();
  },
);

/* ---------- Stufen der Werkbank (#987) ---------- */

// Bereiche je Stufe, aufsteigend (shared/src/werkbankansicht.ts, Feld `ab`); jede Stufe enthält die vorige.
const STUFE_NEU = {
  einsteiger: ['pakete', 'beispielablage', 'benutzer', 'verschluesselung', 'sicherung', 'papierkorb', 'betrieb', 'region', 'systemzustand'],
  haushalt: [
    'typen',
    'sichten',
    'automatisierungen',
    'ablaufvorlagen',
    'tipps',
    'stempel',
    'postfaecher',
    'eingangsordner',
    'webdav',
    'texterkennung',
    'woerter',
    'vollexport',
    'daten',
    'sprachen',
    'organisation',
    'aufgaben',
    'anmeldeschutz',
    'protokoll',
    'fehlermeldungen',
    'wartung',
  ],
  selbstaendig: ['nummernkreise', 'aufbewahrung', 'auskuenfte', 'loeschkonzept', 'loeschprotokoll'],
  // Rundgänge ab Betrieb (#1298).
  organisation: ['rundgaenge', 'designs'],
  alles: ['anbindung', 'demo'],
};
// Stehen nur unter einer Bedingung in der Leiste (Archivmodus, eingebundener Ordner). Die Gruppe Datenschutz hängt seit
// #1319 nur an der Stufe – auch in dieser privat genutzten Testinstallation steht sie ab Selbständig da.
const BEDINGT = ['aufbewahrung', 'eingangsordner'];
const ansichtSetzen = (s, data) => s.request.put(BASIS + '/api/werkbank/ansicht', { headers: { 'x-dms': '1' }, data });

/** Was die Leiste regulär zeigt (ohne Bereiche, die nur wegen eines Hinweises dastehen), als Pfade. */
async function leisteRegulaer(s) {
  const bereiche = s.getByRole('complementary', { name: 'Bereiche' });
  // Bis die gewählte Stufe geladen ist, zeigt die Leiste alles und ist `aria-busy` (#1409) – erst danach lesen.
  await bereiche.locator('nav.werkbankleiste:not([aria-busy])').waitFor();
  await bereiche.getByRole('link').first().waitFor();
  // Ohne Doppelte: Die Übersicht steht als eigener Eintrag und als Kopf der Leiste.
  return [
    ...new Set(
      await bereiche.evaluate((b) =>
        [...b.querySelectorAll('a.sicht[href^="/werkbank"]:not(.ausgeblendet)')].map(
          (a) =>
            a
              .getAttribute('href')
              .split(/[?#]/)[0]
              .replace(/^\/werkbank\/?/, '') || 'uebersicht',
        ),
      ),
    ),
  ];
}

rauchtest('Werkbank: fünf Stufen – Einträge je Stufe, Meine Leiste nur für mich (#987)', { als: LENA }, async (s) => {
  await s.goto(BASIS + '/ablage/start');
  await verwalten(s);
  try {
    let bisher = ['uebersicht'];
    let vorher = 0;
    for (const [stufe, dazu] of Object.entries(STUFE_NEU)) {
      bisher = [...bisher, ...dazu];
      await ansichtSetzen(s, { installation: { vorlage: stufe, ein: [], aus: [] }, eigene: { ein: [] } });
      await s.goto(BASIS + '/werkbank');
      const leiste = await leisteRegulaer(s);
      const fremd = leiste.filter((p) => !bisher.includes(p));
      const fehlt = bisher.filter((p) => !leiste.includes(p) && !BEDINGT.includes(p));
      assert.deepEqual([fremd, fehlt], [[], []], `Stufe ${stufe}: nicht in der Stufe ${fremd.join(', ')} | fehlt ${fehlt.join(', ')}`);
      assert.ok(leiste.length > vorher, `Stufe ${stufe} zeigt mehr als die vorige (${leiste.length} > ${vorher})`);
      if (stufe === 'einsteiger') assert.equal(leiste.length, 10, 'Einsteiger: Übersicht und neun Bereiche');
      vorher = leiste.length;
    }
    // Meine Leiste: für alle Einsteiger, für mich Alles.
    await ansichtSetzen(s, { installation: { vorlage: 'einsteiger', ein: [], aus: [] }, eigene: { ein: [], vorlage: 'alles' } });
    await s.goto(BASIS + '/werkbank/ansicht');
    await s.getByRole('heading', { name: 'Werkbank anpassen', level: 1 }).waitFor();
    // Die Auswahl übernimmt den geladenen Stand erst nach dem ersten Zeichnen – auf die gewählte Stufe warten.
    await s.getByRole('group', { name: 'Meine Leiste' }).getByRole('radio', { name: 'Alles', checked: true }).waitFor();
    assert.ok((await leisteRegulaer(s)).includes('protokoll'), 'Meine Leiste zeigt Alles');
  } finally {
    // Zurück auf die Stufe aus der Einrichtung (einrichtung.mjs: Haushalt).
    await ansichtSetzen(s, { installation: { vorlage: 'haushalt', ein: [], aus: [] }, eigene: { ein: [] } });
  }
});

/* ---------- Beispiel-Ablage (#988) ---------- */

/** Seite der Beispiel-Ablage: nötige Pakete mit Stand; ohne sie ist „Anlegen“ gesperrt und der Weg zu den Paketen steht da. */
async function beispielAblageOeffnen(s) {
  await s.goto(BASIS + '/ablage/start');
  await verwalten(s);
  await s.goto(BASIS + '/werkbank/beispielablage');
  await s.getByRole('heading', { name: 'Beispiel-Ablage', level: 1 }).waitFor();
  await s.getByRole('heading', { name: 'Anlegen', level: 2 }).waitFor();
}

rauchtest('Werkbank → Beispiel-Ablage: nötige Pakete vorher genannt, axe hell und dunkel (#988)', { als: LENA }, async (s) => {
  await beispielAblageOeffnen(s);
  const stand = await (await s.request.get(BASIS + '/api/werkbank/beispielablage', { headers: { 'x-dms': '1' } })).json();
  assert.deepEqual(
    stand.noetig.map((p) => p.id),
    ['basis', 'haushalt', 'vertraege'],
  );
  const anlegen = s.getByRole('button', { name: /^Beispiel-Ablage anlegen/ });
  if (stand.noetig.some((p) => !p.installiert)) {
    await s.getByText(/Installiere zuerst unter/).waitFor();
    assert.equal(await anlegen.getAttribute('aria-disabled'), 'true', 'Ohne nötige Pakete ist „Anlegen“ gesperrt');
  }
  // Getrennt von den Lasttest-Daten (früher „Demo-Daten“): eigener Name in der Leiste.
  const leiste = s.getByRole('complementary', { name: 'Bereiche' });
  await leiste.getByRole('link', { name: /^Beispiel-Ablage/ }).waitFor();
  const funde = [];
  for (const schema of ['light', 'dark']) {
    await schemaWechseln(s, schema);
    for (const v of await axePruefen(s, WERKBANK_BEREICHE)) funde.push(`${schema}: ${v}`);
  }
  assert.deepEqual(funde, [], `axe meldet Verstöße:\n${funde.join('\n')}`);
});

rauchtest('Handy: Werkbank → Beispiel-Ablage, Tippflächen (#988)', { handy: true, als: LENA }, async (s) => {
  await beispielAblageOeffnen(s);
  await keineWaagerechteRolle(s);
  const zuKlein = await tippflaechenPruefen(s, WERKBANK_BEREICHE);
  assert.deepEqual(zuKlein, [], `Zu kleine Tippflächen:\n${zuKlein.join('\n')}`);
});

rauchtest('Rundgang beim ersten Anmelden und „Ablago entdecken“', {}, async (s) => {
  await s.goto(BASIS + '/');
  await s.getByLabel('E-Mail-Adresse').fill(JONAS.email);
  await s.getByLabel('Passwort', { exact: true }).fill(JONAS.passwort);
  await s.getByRole('button', { name: 'Anmelden', exact: true }).click();
  const rundgang = s.getByRole('dialog');
  // #1300, #1522: sieben Schritte in Leserichtung, der erste zeigt auf das Logo oben links, der letzte auf den Assistenten.
  await rundgang.getByText(/Deine Ablage im Überblick/).waitFor();
  await rundgang.getByRole('heading', { name: 'Zurück zum Anfang' }).waitFor();
  await rundgang.getByText('Schritt 1 von 7').waitFor();
  for (let i = 2; i <= 7; i++) {
    await rundgang.getByRole('button', { name: 'Weiter' }).click();
    await rundgang.getByText(`Schritt ${i} von 7`).waitFor();
  }
  await rundgang.getByRole('heading', { name: 'Hilfe ist immer da' }).waitFor();
  await rundgang.getByRole('button', { name: 'Fertig' }).click();
  await rundgang.waitFor({ state: 'detached' });
  await s.getByRole('heading', { name: 'Guten Tag, Jonas', level: 1 }).waitFor();
  // „Ablago entdecken“ über den Assistenten (#1331): Tipps und der Rundgang zum Wiederholen.
  await s.getByRole('button', { name: /^Assistent öffnen/ }).click();
  await s.getByRole('radio', { name: /^Tipps/ }).click();
  await s.getByRole('dialog', { name: 'Assistent' }).getByRole('link', { name: 'Alle Tipps und Rundgänge ›' }).click();
  await s.getByRole('heading', { name: 'Ablago entdecken', level: 1 }).waitFor();
  await s.getByRole('region', { name: 'Tipps' }).getByRole('link').first().waitFor();
  const rundgaenge = s.getByRole('region', { name: 'Rundgänge' });
  // Die Werkbank hat ihren Rundgang nur für Verwaltende (#1512).
  assert.equal(await rundgaenge.getByText('Die Werkbank im Überblick').count(), 0);
  await rundgaenge
    .getByRole('listitem')
    .filter({ hasText: 'Deine Ablage im Überblick' })
    .getByRole('button', { name: 'Rundgang starten' })
    .click();
  await rundgang.getByText('Schritt 1 von 7').waitFor();
  await rundgang.getByRole('button', { name: 'Überspringen' }).click();
  await rundgang.waitFor({ state: 'detached' });
  // Die Rundgänge der Mappe und von Mein Konto prüft rundgaenge-und-tipps.mjs; über Jonas' weiteren Tests liegen sie nicht.
  await rundgaengeGesehen(await sitzung(JONAS));
});

rauchtest('Abmelden', { als: LENA }, async (s) => {
  await s.goto(BASIS + '/ablage/start');
  await s.getByRole('heading', { name: 'Guten Tag, Lena', level: 1 }).waitFor();
  const menue = await benutzermenue(s, LENA);
  await menue.getByRole('button', { name: 'Abmelden' }).click();
  await s.getByRole('heading', { name: 'Anmelden' }).waitFor();
  // Die Sitzung ist wirklich weg: Die Ablage führt wieder zur Anmeldung.
  await s.goto(BASIS + '/ablage/start');
  await s.getByRole('heading', { name: 'Anmelden' }).waitFor();
});

// Systemkonto mit Fehler (#1181): „Zum Konto mit Fehler“ unter der eingeklappten Gruppe führt zum Konto; dort der Grund
// und der Weg zum Paket. Der Test ergänzt die Antwort um ein Paket-Konto mit Fehler (kein echtes Paket nötig).
rauchtest(
  'Werkbank: Systemkonto mit Fehler – Link, Grund und Weg zum Paket, axe hell und dunkel (#1181)',
  { als: LENA, timeout: 90_000 },
  async (s) => {
    const konto = {
      id: '00000000-0000-4000-8000-0000000011a1',
      name: 'Paket Werkzeuge',
      rolle: 'paket',
      aktiv: false,
      paketId: 'werkzeuge',
      paket: 'Werkzeuge',
      automatisierungen: [],
      fehler: 'deaktiviert',
    };
    await s.route(/\/api\/benutzer\/systemkonten$/, async (route) => {
      const r = await route.fetch();
      await route.fulfill({ response: r, json: [...(await r.json()), konto] });
    });
    await s.goto(BASIS + '/ablage/start');
    await verwalten(s);
    await s.goto(BASIS + '/werkbank/benutzer');
    await s.getByRole('link', { name: 'Zum Konto mit Fehler: Paket Werkzeuge' }).click();
    await s.waitForURL(/\/werkbank\/benutzer\/konto-/);
    const bearbeitung = s.getByRole('region', { name: 'Bearbeitung' });
    await bearbeitung.getByText('Ablago schaltet es beim nächsten Abgleich der Pakete').waitFor();
    assert.match(await bearbeitung.getByRole('link', { name: 'Zum Paket' }).getAttribute('href'), /\/werkbank\/pakete\/werkzeuge$/);
    const funde = [];
    for (const schema of ['light', 'dark']) {
      await schemaWechseln(s, schema);
      for (const v of await axePruefen(s, ['[aria-label="Bearbeitung"]', '.systemkontengruppe > .systemkonten-zumfehler']))
        funde.push(`${schema}: ${v}`);
    }
    assert.deepEqual(funde, [], `axe meldet Verstöße:\n${funde.join('\n')}`);
  },
);

// Inaktive Systemkonten (#1326): nicht mehr abgeblendet, sondern mit Etikett „ausgeschaltet“ (bzw. dem Fehler) – axe hell
// und dunkel auf der aufgeklappten Gruppe. Der Test ergänzt die Antwort um zwei ausgeschaltete Paket-Konten.
rauchtest('Werkbank: inaktive Systemkonten gut lesbar, Etikett „ausgeschaltet“, axe hell und dunkel (#1326)', { als: LENA }, async (s) => {
  const konto = (id, name, mehr) => ({ id, name, rolle: 'paket', aktiv: false, paketId: id, paket: name, automatisierungen: [], ...mehr });
  const ohneCode = konto('00000000-0000-4000-8000-000000001326', 'Paket Vorlagen', { ohneCode: true });
  const mitFehler = konto('00000000-0000-4000-8000-000000001327', 'Paket Werkzeuge', { fehler: 'deaktiviert' });
  await s.route(/\/api\/benutzer\/systemkonten$/, async (route) => {
    const r = await route.fetch();
    await route.fulfill({ response: r, json: [...(await r.json()), ohneCode, mitFehler] });
  });
  await s.goto(BASIS + '/ablage/start');
  await verwalten(s);
  // Ist ein Systemkonto geöffnet, steht die Gruppe offen – ohne die gemerkte Wahl zu ändern.
  await s.goto(BASIS + `/werkbank/benutzer/konto-${ohneCode.id}`);
  const gruppe = s.locator('.systemkontengruppe');
  const eintrag = (name) => gruppe.getByRole('link', { name: new RegExp(`^${name}`) });
  await eintrag('Paket Vorlagen').getByText('ausgeschaltet', { exact: true }).waitFor();
  await eintrag('Paket Werkzeuge').getByText('deaktiviert', { exact: true }).waitFor();
  assert.equal(await eintrag('Paket Werkzeuge').getByText('ausgeschaltet', { exact: true }).count(), 0, 'der Fehler sagt es schon');
  for (const name of ['Paket Vorlagen', 'Paket Werkzeuge'])
    assert.equal(await eintrag(name).evaluate((a) => getComputedStyle(a).opacity), '1', `${name} nicht abgeblendet`);
  const funde = [];
  for (const schema of ['light', 'dark']) {
    await schemaWechseln(s, schema);
    for (const v of await axePruefen(s, ['.systemkontengruppe'])) funde.push(`${schema}: ${v}`);
  }
  assert.deepEqual(funde, [], `axe meldet Verstöße:\n${funde.join('\n')}`);
});

// Heimnetz nicht bestimmbar (#1355): Kommen Anfragen mit der Gateway-Adresse an, nennt die Übersicht es gelb mit dem Weg
// zum Notfallzugang; dort steht die gesehene Adresse samt Abhilfe – auch mit „aus dem Internet erlauben“. Der Test
// ergänzt die Antworten (im Testaufbau kommt keine Anfrage vom Gateway). axe hell und dunkel auf dem Hinweis.
rauchtest('Werkbank: Heimnetz nicht bestimmbar – Hinweis auf Übersicht und beim Notfallzugang, axe (#1355)', { als: LENA }, async (s) => {
  const gateway = { adresse: '172.17.0.1', zuletzt: new Date().toISOString() };
  await s.route(/\/api\/werkbank\/uebersicht$/, async (route) => {
    const r = await route.fetch();
    await route.fulfill({ response: r, json: { ...(await r.json()), heimnetzGateway: gateway } });
  });
  await s.route(/\/api\/werkbank\/anmeldeschutz\/notfallzugang$/, async (route) => {
    const r = await route.fetch();
    await route.fulfill({ response: r, json: { ...(await r.json()), heimnetz: false, grund: 'gateway', internet: true } });
  });
  await s.goto(BASIS + '/ablage/start');
  await verwalten(s);
  await s.goto(BASIS + '/werkbank');
  const meldung = s.locator('li, .hinweis').filter({ hasText: 'Ablago kann Heimnetz und Internet nicht unterscheiden.' }).last();
  await meldung.waitFor();
  assert.match(await meldung.innerText(), /172\.17\.0\.1/);
  await meldung.getByRole('link', { name: 'Zum Notfallzugang' }).click();
  await s.waitForURL(/\/werkbank\/anmeldeschutz/);
  const hinweis = s.locator('#notfall-gateway');
  await hinweis.getByText('Gateway-Adresse des eigenen Netzes').waitFor();
  assert.match(await hinweis.innerText(), /TRUST_PROXY auf die Gateway-Adresse.*macvlan/s);
  assert.equal(await s.locator('#notfall-grund').count(), 0, 'kein zweiter Grund');
  const funde = [];
  for (const schema of ['light', 'dark']) {
    await schemaWechseln(s, schema);
    for (const v of await axePruefen(s, ['#notfall-gateway'])) funde.push(`${schema}: ${v}`);
  }
  assert.deepEqual(funde, [], `axe meldet Verstöße:\n${funde.join('\n')}`);
});
