/**
 * Einrichtung (#897): der Assistent im Browser und die Daten, die alle übrigen Rauchtests brauchen.
 * Jeder Bereich bindet diese Datei zuerst ein – so läuft die Einrichtung immer als erster Test, auch allein.
 */
import assert from 'node:assert/strict';
import {
  api,
  BASIS,
  beispielPdf,
  bereitMelden,
  daten,
  einrichtungscode,
  JONAS,
  LENA,
  rauchtest,
  rundgaengeGesehen,
  schemaWechseln,
  warteAufAblago,
} from './hilfen.mjs';
import { axePruefen } from './muster.mjs';

/* ---------- Einrichtung und Daten ---------- */

rauchtest(
  'Einrichtung: Assistent im Browser',
  {
    einrichtung: true,
    // Nach „Übernehmen und weiter“ startet Ablago mit der Datenbank neu; bis dahin antworten Status und Gesundheit
    // mit 503 (die Gesundheit fragt die Oberfläche unter Last manchmal genau in diesem Moment ab).
    erwartet: [
      { status: 503, pfad: /^\/api\/konto\/status$/ },
      { status: 503, pfad: /^\/api\/gesundheit$/ },
    ],
    // … und zwischen Beenden und Start lehnt der Port die Verbindung kurz ab – für den Stand, den der Assistent abfragt,
    // und für die Gesundheit, die die Oberfläche nach einer gescheiterten Anfrage prüft (#1419). Laufende Anfragen
    // beantwortet Ablago vor dem Freigeben des Ports noch; ein Abbruch (Reset, leere Antwort) bleibt ein Fehler.
    neustart: [/^\/api\/konto\/status$/, /^\/api\/gesundheit$/],
  },
  async (s, k) => {
    const verlauf = mitschreiben(s);
    try {
      await warteAufAblago();
      await s.goto(BASIS + '/');
      await s.getByRole('heading', { name: 'Sprache' }).waitFor();
      await s.getByRole('button', { name: 'Weiter' }).click();
      await s.getByLabel('Einrichtungscode').fill(await einrichtungscode());
      await s.getByRole('button', { name: 'Weiter' }).click();
      await s.getByRole('heading', { name: 'Datenbank', exact: true }).waitFor();
      await s.getByRole('textbox', { name: /^Server/ }).fill(process.env.DB_HOST ?? 'localhost');
      await s.getByRole('textbox', { name: /^Datenbank/ }).fill(process.env.DB_NAME ?? 'dms_rauchtest');
      await s.getByRole('textbox', { name: /^Benutzer/ }).fill(process.env.DB_BENUTZER ?? 'dms');
      await s.getByLabel(/^Passwort/).fill(process.env.DB_PASSWORT ?? 'dms');
      await s.getByRole('button', { name: 'Verbindung prüfen' }).click();
      // Eine leere Datenbank legt der Assistent auf Wunsch selbst an.
      const anlegen = s.getByRole('button', { name: /^Datenbank „.*“ anlegen$/ });
      const weiter = s.getByRole('button', { name: 'Übernehmen und weiter' });
      await anlegen.or(weiter).first().waitFor();
      if (await anlegen.isVisible()) await anlegen.click();
      await weiter.click();
      await s.getByRole('heading', { name: 'Neu einrichten oder wiederherstellen?' }).waitFor({ timeout: 90_000 });
      await s.getByRole('button', { name: /^Neu einrichten/ }).click();
      await s.getByLabel(/Name deiner Ablage/).fill('Familie Beispiel');
      await s.getByRole('button', { name: 'Weiter' }).click();
      await s.getByRole('heading', { name: 'Dein Konto' }).waitFor();
      await s.getByLabel('Name', { exact: true }).fill(LENA.name);
      await s.getByLabel(/E-Mail-Adresse/).fill(LENA.email);
      await s.getByLabel('Passwort', { exact: true }).fill(LENA.passwort);
      await s.getByLabel('Passwort wiederholen').fill(LENA.passwort);
      await assistentAxe(s, 'Dein Konto');
      await s.getByRole('button', { name: 'Weiter' }).click();
      // Wofür nutzt du Ablago? (#1045) – Lena: zu Hause. Vorgewählt ist dann die Stufe Einsteiger (#987); die Rauchtests
      // nehmen Haushalt, damit Mappentypen, Automatisierungen & Co. in der Leiste stehen.
      await s.getByRole('heading', { name: 'Wofür nutzt du Ablago?' }).waitFor();
      await s.getByRole('radio', { name: /^Für zu Hause/ }).check();
      const stufen = s.getByRole('group', { name: 'Wie viel soll die Werkbank zeigen?' });
      assert.ok(await stufen.getByRole('radio', { name: /^Einsteiger/ }).isChecked(), 'Vorgabe zu Hause: Einsteiger');
      await stufen.getByRole('radio', { name: /^Haushalt/ }).check();
      await assistentAxe(s, 'Nutzung');
      await s.getByRole('button', { name: 'Weiter' }).click();
      await wasDarfAblago(s);
      await ablagoWaehltPakete(s);
      // Pakete: ohne Internet nur ein Hinweis – die Rauchtests brauchen keine Pakete.
      await s.getByRole('heading', { name: 'Diese Pakete richtet Ablago für euch ein' }).waitFor();
      await s.getByRole('button', { name: 'Überspringen' }).click({ timeout: 30_000 });
      await s.getByRole('heading', { name: 'Optionales' }).waitFor();
      // Notfallkontakt (#1215): „+ Notfallkontakt“ klein, Entfernen leise mit Rückfrage – danach ist die Liste wieder leer.
      const nk = s.locator('#notfallkontakte');
      await nk.getByRole('button', { name: '+ Notfallkontakt' }).click();
      await nk.getByLabel('Name', { exact: true }).fill('Markus Beispiel');
      await nk.getByLabel('E-Mail', { exact: true }).fill('markus@example.org');
      await nk.getByRole('button', { name: 'Übernehmen' }).click();
      await nk.getByText('markus@example.org').waitFor();
      await assistentAxe(s, 'Optionales');
      await nk.getByRole('button', { name: 'Entfernen' }).click();
      await s.getByRole('alertdialog').getByRole('button', { name: 'Entfernen' }).click();
      await nk.getByText('markus@example.org').waitFor({ state: 'detached' });
      await s.getByRole('button', { name: 'Weiter' }).click();
      await s.getByRole('heading', { name: 'Zusammenfassung' }).waitFor();
      await assistentAxe(s, 'Zusammenfassung');
      await s.getByRole('button', { name: 'Jetzt einrichten' }).click();
      await s.getByRole('heading', { name: /ist eingerichtet/ }).waitFor({ timeout: 60_000 });
      const download = s.waitForEvent('download');
      await s.getByRole('button', { name: 'Notfallblatt herunterladen' }).click();
      await (await download).cancel().catch(() => {});
      await s.getByText(/Notfallblatt heruntergeladen/).waitFor();
      // Auf localhost bietet der Assistent auch den Passkey an (#811) – beides „Später“, hier die Zwei-Faktor-Anmeldung.
      await s
        .getByRole('region', { name: /Zwei-Faktor/ })
        .getByRole('button', { name: 'Später' })
        .click();
      await s
        .getByRole('region', { name: /Passkey/ })
        .getByRole('button', { name: 'Jetzt hinzufügen' })
        .waitFor();
      await assistentAxe(s, 'Abschluss');
      await s.getByRole('button', { name: 'Einrichtung abschließen' }).click();
      await s.waitForURL(/\/werkbank/);
      // #1512: Nach der Einrichtung landet Lena in der Werkbank – dort startet zuerst deren Rundgang, nicht der der Ablage.
      const rundgang = s.getByRole('dialog');
      await rundgang.getByText(/Die Werkbank im Überblick/).waitFor();
      await rundgang.getByText('Schritt 1 von 8').waitFor();
      await rundgang.getByRole('button', { name: 'Später' }).click();
      await rundgang.waitFor({ state: 'detached' });
      const sitzungscookie = (await k.cookies()).find((c) => c.name === 'dms_sitzung');
      assert.ok(sitzungscookie, 'Nach der Einrichtung keine Sitzung im Browser');
      await vorbereiten(`${sitzungscookie.name}=${sitzungscookie.value}`);
      bereitMelden();
      assert.deepEqual(ASSISTENT_FUNDE, [], `axe meldet Verstöße im Assistenten (#1215):\n${ASSISTENT_FUNDE.join('\n')}`);
    } catch (e) {
      e.message += `\nVerlauf im Browser (QS-Runde 11/2026):\n${verlauf.join('\n')}`;
      throw e;
    }
  },
);

/**
 * „Was darf Ablago?“ (#1566): zwei Optionsgruppen, die empfohlenen Antworten gewählt, der Satz nur unter der gewählten.
 * Die Rauchtests bleiben bei der Vorgabe „Auch Helfer, die nur hier arbeiten“.
 */
async function wasDarfAblago(s) {
  await s.getByRole('heading', { name: 'Was darf Ablago?' }).waitFor();
  const pakete = s.getByRole('group', { name: 'Welche Pakete darf Ablago nutzen?' });
  assert.ok(await pakete.getByRole('radio', { name: /^Auch Helfer, die nur hier arbeiten/ }).isChecked(), 'Vorgabe Frage 1');
  assert.ok(
    await s
      .getByRole('group', { name: 'Wie viel soll Ablago von sich aus tun?' })
      .getByRole('radio', { name: /^Erkennen und vorlegen/ })
      .isChecked(),
    'Vorgabe Frage 2',
  );
  await pakete.getByText('Nichts verlässt Ablago.', { exact: false }).waitFor();
  assert.equal(await pakete.getByText(/Sicherung an ein entferntes Ziel/).count(), 0, 'Satz nur unter der gewählten Antwort');
  // Tastatur: Pfeil nach unten wählt die nächste Antwort, Pfeil nach oben wieder die Vorgabe.
  await pakete.getByRole('radio', { name: /^Auch Helfer, die nur hier arbeiten/ }).focus();
  await s.keyboard.press('ArrowDown');
  await pakete.getByText(/Sicherung an ein entferntes Ziel/).waitFor();
  await s.keyboard.press('ArrowUp');
  await pakete.getByText('Nichts verlässt Ablago.', { exact: false }).waitFor();
  await assistentAxe(s, 'Was darf Ablago?');
  await s.getByRole('button', { name: 'Weiter' }).click();
}

/**
 * Ablago wählt die Pakete (#1566, #1591) – mit einem nachgestellten Katalog (die Rauchtests laufen ohne Internet): Die
 * Sicherung mit Internet bietet Ablago unter „nur hier“ nicht an, sondern nennt sie mit Grund unter „Nicht dabei“; unter
 * „Selbst auswählen“ ist sie ausgegraut, mit demselben Grund. Danach ohne Nachstellung weiter.
 */
async function ablagoWaehltPakete(s) {
  const version = (code) => ({
    version: '1.0.0',
    dms: '>=0.1.0',
    abhaengigkeiten: {},
    inhalt: { mappentypen: [], sichten: [], beispiele: 0 },
    code,
    archiv: 'x.zip',
    sha256: '0'.repeat(64),
    groesse: 1000,
    veroeffentlicht: '2026-11-01T00:00:00Z',
    quelle: '',
    readme: '',
    changelog: '',
  });
  const paket = (id, name, beschreibung, code) => ({
    id,
    name,
    beschreibung,
    autor: { name: 'Ablago-Projekt', github: '' },
    lizenz: 'Apache-2.0',
    aktuell: '1.0.0',
    versionen: [version(code)],
  });
  const katalog = {
    format: 1,
    erstellt: '2026-11-01T00:00:00Z',
    quelle: '',
    empfohlen: ['haushalt', 'sicherung_webdav'],
    pakete: [
      paket('haushalt', 'Haushalt', 'Mappentypen für den Haushalt. Mit Ansichten.', false),
      paket('sicherung_webdav', 'Sicherung WebDAV', 'Sicherung an ein WebDAV-Ziel.', true),
    ],
  };
  const grund = '„Sicherung WebDAV“ nutzt das Internet – das habt ihr nicht erlaubt.';
  const stufen = {
    signiert: true,
    pakete: [
      { id: 'haushalt', stufe: 'vorlagen', erlaubt: true, netz: [], adressen: [] },
      { id: 'sicherung_webdav', stufe: 'netz', erlaubt: false, grund, netz: ['https://dav.example.org'], adressen: [] },
    ],
  };
  const plan = {
    pakete: [
      {
        schluessel: 'haushalt',
        id: 'haushalt',
        name: 'Haushalt',
        version: '1.0.0',
        gewaehlt: true,
        fuer: [],
        ergaenzt: null,
        vorschau: { fehlercodes: [], probleme: [], beispiele: 0 },
        einstellungen: [],
      },
    ],
    probleme: [],
    herkunft: { art: 'projekt', offiziell: true, bestaetigen: false },
    herkunftBestaetigen: false,
    rechte: { bestaetigen: false, stand: 'x' },
    auswahl: { typen: [], benutzer: [], rollen: [], sichten: [] },
  };
  const json = (daten) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(daten) });
  const routen = {
    '**/api/einrichtung/pakete/katalog': json({
      kataloge: [{ url: 'https://catalog.ablago.app/katalog.json', offiziell: true, katalog, fehler: null }],
      abgerufen: '2026-11-24T10:00:00Z',
    }),
    '**/api/einrichtung/pakete/stufen': json(stufen),
    '**/api/einrichtung/pakete/plan': json(plan),
  };
  for (const [muster, antwort] of Object.entries(routen)) await s.route(muster, (r) => r.fulfill(antwort));
  try {
    await s.getByRole('heading', { name: 'Diese Pakete richtet Ablago für euch ein' }).waitFor();
    const liste = s.getByRole('list', { name: 'Diese Pakete richtet Ablago für euch ein' });
    await liste.getByText('Haushalt').waitFor();
    assert.equal(await liste.getByRole('checkbox').count(), 0, 'Ablagos Auswahl ohne Haken');
    assert.equal(await liste.getByText('Sicherung WebDAV').count(), 0, 'nie ein Paket mit Netz unter „nur hier“');
    const nicht = s.getByRole('region', { name: 'Nicht dabei' });
    await nicht.getByText(grund).waitFor();
    assert.equal(await s.getByText(grund).count(), 1, 'jede Meldung einmal');
    await assistentAxe(s, 'Pakete (Ablagos Auswahl)');
    await s.getByRole('button', { name: 'Selbst auswählen' }).click();
    await s.getByRole('heading', { name: 'Pakete dazuholen' }).waitFor();
    const gesperrt = s.getByRole('group', { name: 'Sicherung WebDAV' }).getByRole('checkbox');
    assert.ok(await gesperrt.isDisabled(), 'ausgegraut');
    await s.getByText(grund).waitFor();
    await assistentAxe(s, 'Pakete (selbst auswählen)');
    await s.getByRole('button', { name: 'Ablagos Auswahl zeigen' }).click();
  } finally {
    for (const muster of Object.keys(routen)) await s.unroute(muster);
  }
}

/**
 * Verlauf im Browser für die Fehlermeldung (QS-Runde 11/2026): Seitenwechsel und Neuladen, Antworten der Schnittstelle
 * (Stand und Zustand aus Gesundheit und Status gekürzt), Konsole. Nur bei einem Fehlschlag ausgegeben – der Fall
 * scheiterte in der CI mit zwei Prozessen, lokal nicht.
 */
function mitschreiben(s) {
  const t0 = Date.now();
  const verlauf = [];
  const merke = (text) => verlauf.push(`  ${String(Date.now() - t0).padStart(6)} ms ${text}`);
  s.on('framenavigated', (f) => {
    if (f === s.mainFrame()) merke(`Seite ${f.url()}`);
  });
  s.on('console', (m) => merke(`Konsole ${m.type()}: ${m.text().slice(0, 160)}`));
  s.on('response', async (r) => {
    const pfad = new URL(r.url()).pathname;
    if (!pfad.startsWith('/api/') || pfad === '/api/sprache') return;
    const kurz = /^\/api\/(gesundheit|konto\/status)$/.test(pfad) ? ` ${(await r.text().catch(() => '')).slice(0, 200)}` : '';
    merke(`${r.status()} ${r.request().method()} ${pfad}${kurz}`);
  });
  return verlauf;
}

/**
 * Assistent aus Bausteinen (#1215): axe auf der Karte des Assistenten, hell und dunkel. Die Funde sammelt der Test und
 * meldet sie am Ende – so läuft die Einrichtung trotzdem durch und die übrigen Rauchtests bleiben möglich.
 */
const ASSISTENT_FUNDE = [];
async function assistentAxe(s, schritt) {
  for (const schema of ['light', 'dark']) {
    await schemaWechseln(s, schema);
    for (const v of await axePruefen(s, ['.karte.assistent'])) ASSISTENT_FUNDE.push(`${schritt} (${schema}): ${v}`);
  }
  await schemaWechseln(s, 'light');
}

/** Daten für die Tests über die Schnittstelle – mit der Sitzung aus dem Assistenten (im Verwaltungsmodus). */
async function vorbereiten(cookie) {
  // Lena kennt Ablago schon: keine Rundgänge über ihren Tests. Die zeigen die Tests mit den neuen Konten.
  await rundgaengeGesehen(cookie);
  await api('POST', '/api/beispiele', { cookie });
  for (const [schluessel, betreff] of [
    ['brief', 'Preisanpassung Strom 2027'],
    ['briefHandy', 'Beitragsrechnung Hausrat 2027'],
  ]) {
    const brief = (await api('POST', '/api/post', { cookie, body: { betreff } })).daten;
    await api(
      'POST',
      `/api/mappen/${brief.id}/dokumente?register=dokumente&name=${encodeURIComponent(`${betreff}.pdf`)}&typ=application/pdf`,
      { cookie, body: beispielPdf(betreff), roh: true },
    );
    daten[schluessel] = brief;
  }
  // Eine Automatisierung für die Dreiteilung der Werkbank (#1063): Ihre Bearbeitung ist länger als das Fenster.
  const vertrag = (await api('GET', '/api/typen', { cookie })).daten.find((x) => x.name === 'Vertrag');
  await api('POST', '/api/werkbank/automatisierungen', {
    cookie,
    body: { name: 'Rauchtest Vertrag angelegt', wenn: { art: 'mappe.angelegt', typ: vertrag.id }, dann: [{ id: 's', art: 'stopp' }] },
  });
  // Liste der Automatisierungen (#1172): zwei eigene zum gemeinsamen Ein- und Ausschalten, eine mit Aufgabe (Ziel, Platzhalter).
  for (const name of ['Rauchtest Auswahl A', 'Rauchtest Auswahl B']) {
    await api('POST', '/api/werkbank/automatisierungen', {
      cookie,
      body: {
        name,
        aktiv: true,
        wenn: { art: 'mappe.angelegt', typ: vertrag.id },
        dann: [{ id: 'a', art: 'aufgabe', als: 'aufgabe', empfaenger: [{ art: 'ersteller' }], text: 'Prüfen: {titel}', faellig: 7 }],
      },
    });
  }
  // Feldart Tabelle (#1030): Auftrag mit Positionen – eigene Typen, damit die Beispiele unverändert bleiben.
  daten.tabelle = await tabellenDaten(cookie);
  // Beim Auswählen übernehmen (#1037): Tarifart mit üblichen Angaben, Abo übernimmt sie.
  daten.vorbelegen = await vorbelegenDaten(cookie);
  // Archivmodus „Ist der Stichtag leer: läuft noch nicht ab“ (#1051): ein laufender und ein beendeter Mietvertrag.
  daten.archiv = await archivDaten(cookie);
  // Datum vorschlagen (#1180) und „In der allgemeinen Suche zeigen“ (#1220): eigene Typen ohne Ansicht.
  daten.vorschlag = await vorschlagDaten(cookie);
  // Ablage aus Bausteinen (#1211, #1212): ein Mappentyp ohne Archivmodus, damit Löschen in den Papierkorb geht.
  daten.bausteine = (
    await api('POST', '/api/typen', {
      cookie,
      body: {
        name: 'Kellerraum',
        schluessel: 'kellerraum',
        titelVorlage: '{objekt}',
        felder: [
          { key: 'objekt', label: 'Objekt', typ: 'text', pflicht: true },
          { key: 'notiz', label: 'Notiz', typ: 'langtext' },
          { key: 'seit', label: 'Seit', typ: 'datum' },
        ],
      },
    })
  ).daten;
  const einladung = (
    await api('POST', '/api/benutzer', { cookie, body: { email: JONAS.email, name: JONAS.name, rolle: 'mitglied', rollen: [] } })
  ).daten;
  await api('POST', '/api/konto/passwort-setzen', {
    body: { schluessel: einladung.link.split('/passwort/')[1], passwort: JONAS.passwort },
  });
}

/** Typen „Auftrag“ mit Tabelle „Positionen“ und „Auftragsposition“, ein Auftrag mit zwei Positionen (#1030). */
async function tabellenDaten(cookie) {
  const auftrag = (
    await api('POST', '/api/typen', {
      cookie,
      body: {
        name: 'Auftrag',
        schluessel: 'auftrag',
        titelVorlage: '{nr}',
        felder: [{ key: 'nr', label: 'Auftragsnummer', typ: 'text', pflicht: true }],
      },
    })
  ).daten;
  // Ist Teil einer anderen Mappe (#1031): Positionen erscheinen nur am Auftrag.
  const position = (
    await api('POST', '/api/typen', {
      cookie,
      body: {
        name: 'Auftragsposition',
        schluessel: 'auftragsposition',
        titelVorlage: '{nr}. {beschreibung}',
        teilVon: 'auftrag',
        trefferliste: ['nr', 'beschreibung', 'menge', 'preis'],
        felder: [
          { key: 'auftrag', label: 'Auftrag', typ: 'referenz', zielTypen: [auftrag.id], pflicht: true, verweisart: 'zugehoerigkeit' },
          { key: 'nr', label: 'Nr.', typ: 'zahl' },
          { key: 'beschreibung', label: 'Beschreibung', typ: 'text', pflicht: true },
          { key: 'menge', label: 'Menge', typ: 'zahl' },
          { key: 'preis', label: 'Einzelpreis', typ: 'betrag', waehrung: 'EUR' },
        ],
      },
    })
  ).daten;
  await api('PUT', `/api/typen/${auftrag.id}`, {
    cookie,
    body: {
      ...auftrag,
      felder: [
        ...auftrag.felder,
        { key: 'positionen', label: 'Positionen', typ: 'tabelle', quelle: { typId: position.id, feldKey: 'auftrag', neu: '+ Position' } },
      ],
    },
  });
  const mappe = (await api('POST', '/api/mappen', { cookie, body: { typId: auftrag.id, werte: { nr: 'A-1' } } })).daten;
  const positionen = [];
  for (const [nr, beschreibung, menge, betrag] of [
    [1, 'Ölfilter', 2, 12],
    [2, 'Inspektion', 1, 189.9],
  ]) {
    positionen.push(
      (
        await api('POST', '/api/mappen', {
          cookie,
          body: { typId: position.id, werte: { auftrag: mappe.id, nr, beschreibung, menge, preis: { betrag, waehrung: 'EUR' } } },
        })
      ).daten,
    );
  }
  // Verborgene Zeilen (#1208): Auftrag A-2 mit drei Positionen, eine davon („Vertraulich“) darf niemand außerhalb des
  // Verwaltungsmodus lesen – auch Lena nicht. Die Regel trifft nur diese eine Position.
  const teils = (await api('POST', '/api/mappen', { cookie, body: { typId: auftrag.id, werte: { nr: 'A-2' } } })).daten;
  for (const [nr, beschreibung] of [
    [1, 'Reifenwechsel'],
    [2, 'Vertraulich'],
    [3, 'Wuchten'],
  ]) {
    await api('POST', '/api/mappen', { cookie, body: { typId: position.id, werte: { auftrag: teils.id, nr, beschreibung } } });
  }
  await api('PUT', `/api/werkbank/berechtigungen/${position.id}`, {
    cookie,
    body: {
      bestaetigt: true,
      berechtigungen: {
        grund: { C: true, R: true, U: true, D: true, P: true },
        regeln: [
          {
            id: 'vertraulich',
            name: 'Vertrauliche Positionen',
            wenn: [
              { art: 'feld', bedingung: { art: 'feld', feld: 'beschreibung', op: 'gleich', wert: { art: 'fest', wert: 'Vertraulich' } } },
            ],
            dann: { R: 'entziehen', U: 'entziehen', D: 'entziehen', P: 'entziehen' },
            stopp: true,
          },
        ],
      },
    },
  });
  return { auftrag, position, mappe, positionen, teils };
}

/** Typen „Tarifart“ (mit Frist und Hinweis) und „Abo“, das beides beim Auswählen übernimmt; zwei Tarifarten (#1037). */
async function vorbelegenDaten(cookie) {
  const tarifart = (
    await api('POST', '/api/typen', {
      cookie,
      body: {
        name: 'Tarifart',
        schluessel: 'tarifart',
        titelVorlage: '{name}',
        felder: [
          { key: 'name', label: 'Name', typ: 'text', pflicht: true },
          { key: 'frist', label: 'Kündigungsfrist', typ: 'zeitraum' },
          { key: 'hinweis', label: 'Hinweis', typ: 'text' },
        ],
      },
    })
  ).daten;
  const abo = (
    await api('POST', '/api/typen', {
      cookie,
      body: {
        name: 'Abo',
        schluessel: 'abo',
        titelVorlage: '{bezeichnung}',
        felder: [
          { key: 'bezeichnung', label: 'Bezeichnung', typ: 'text', pflicht: true },
          {
            key: 'tarifart',
            label: 'Tarifart',
            typ: 'referenz',
            zielTypen: [tarifart.id],
            vorbelegen: [
              { von: 'frist', nach: 'frist' },
              { von: 'hinweis', nach: 'notiz' },
            ],
          },
          { key: 'frist', label: 'Kündigungsfrist', typ: 'zeitraum' },
          { key: 'notiz', label: 'Notiz', typ: 'text' },
        ],
      },
    })
  ).daten;
  const mobilfunk = (
    await api('POST', '/api/mappen', {
      cookie,
      body: { typId: tarifart.id, werte: { name: 'Mobilfunk', frist: 'P3M', hinweis: 'Rufnummer mitnehmen' } },
    })
  ).daten;
  const strom = (
    await api('POST', '/api/mappen', {
      cookie,
      body: { typId: tarifart.id, werte: { name: 'Strom', frist: 'P2W', hinweis: 'Zählerstand notieren' } },
    })
  ).daten;
  return { tarifart, abo, mobilfunk, strom };
}

/** Typ „Mietvertrag“ im Archivmodus, 6 Jahre ab „Beendet am“, leer: läuft noch nicht ab (#1051). */
async function archivDaten(cookie) {
  const typ = (
    await api('POST', '/api/typen', {
      cookie,
      body: {
        name: 'Mietvertrag',
        schluessel: 'mietvertrag',
        titelVorlage: '{objekt}',
        archiv: { jahre: 6, stichtag: 'beendet', leererStichtag: 'laeuftNicht' },
        felder: [
          { key: 'objekt', label: 'Mietobjekt', typ: 'text', pflicht: true },
          { key: 'beendet', label: 'Beendet am', typ: 'datum' },
        ],
      },
    })
  ).daten;
  const laufend = (await api('POST', '/api/mappen', { cookie, body: { typId: typ.id, werte: { objekt: 'Lager Gartenstraße' } } })).daten;
  const beendet = (
    await api('POST', '/api/mappen', { cookie, body: { typId: typ.id, werte: { objekt: 'Garage Hofweg', beendet: '2027-06-30' } } })
  ).daten;
  return { typ, laufend, beendet };
}

/**
 * #1180: Typ „Werkzeug“ mit einer Mappe und der Vorlage „Erinnere mich in 14 Tagen“ (nur dort, Datum als Vorschlag).
 * #1220: Typ „Vertragsart“ mit „In der allgemeinen Suche zeigen: nein“ und der Mappe „Kilometerleasing“.
 */
async function vorschlagDaten(cookie) {
  const werkzeug = (
    await api('POST', '/api/typen', {
      cookie,
      body: {
        name: 'Werkzeug',
        schluessel: 'werkzeug',
        titelVorlage: '{name}',
        sichtAnlegen: false,
        felder: [{ key: 'name', label: 'Name', typ: 'text', pflicht: true }],
      },
    })
  ).daten;
  const mappe = (await api('POST', '/api/mappen', { cookie, body: { typId: werkzeug.id, werte: { name: 'Bohrhammer' } } })).daten;
  const vorlage = (
    await api('POST', '/api/werkbank/ablaufvorlagen', {
      cookie,
      body: {
        name: 'Erinnere mich in 14 Tagen',
        typen: [werkzeug.id],
        wann: { art: 'in', anzahl: 14, einheit: 'tage' },
        fragen: ['datum', 'text'],
        karten: [{ art: 'aufgabe', als: 'aufgabe', empfaenger: [{ art: 'selbst' }], text: '{eingabe}' }],
      },
    })
  ).daten;
  const vertragsart = (
    await api('POST', '/api/typen', {
      cookie,
      body: {
        name: 'Vertragsart',
        schluessel: 'vertragsart',
        titelVorlage: '{name}',
        sichtAnlegen: false,
        inSuche: false,
        felder: [{ key: 'name', label: 'Name', typ: 'text', pflicht: true }],
      },
    })
  ).daten;
  const leasing = (await api('POST', '/api/mappen', { cookie, body: { typId: vertragsart.id, werte: { name: 'Kilometerleasing' } } }))
    .daten;
  return { werkzeug, mappe, vorlage, vertragsart, leasing };
}
