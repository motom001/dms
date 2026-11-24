/**
 * Rauchtests für die Werkbank am Handy, Teil 2 (#1291): Die Handgriffe für unterwegs sind am Handy voll bedienbar –
 * alle Felder erreichbar, Tippflächen ab 44 px, nichts breiter als der Bildschirm, Ergebnis am Knopf –, Rückfragen bei
 * Gefahr passen auf den Bildschirm und beginnen mit dem Fokus auf „Abbrechen“, heikle Handlungen fragen dieselbe frische
 * Anmeldung ab wie am Rechner, und ein Paket aus dem Katalog lässt sich bis zum Ende installieren.
 * Allein starten (frisch gestartetes Ablago, siehe rauchtest.mjs): node web/rauchtest/bereiche/werkbank-handy-handgriffe.mjs [fehlerordner]
 */
import assert from 'node:assert/strict';
import '../einrichtung.mjs';
import { api, BASIS, JONAS, LENA, rauchtest, sitzung, verwalten, WERKBANK_BEREICHE } from '../hilfen.mjs';
import { seiteRuhig, tippflaechenPruefen } from '../muster.mjs';

/** Lena im Verwaltungsmodus über die Schnittstelle (für Vorbereitungen, nicht für die geprüften Handgriffe). */
async function lenaVerwaltet() {
  const cookie = await sitzung(LENA);
  await api('POST', '/api/konto/verwaltung', { cookie, body: {} });
  return cookie;
}

/** Eine Person anlegen, die sich sperren lässt: Lena als Vertreterin (#78). */
async function sperrbar(cookie, name) {
  const email = `${name.toLowerCase().replace(/[^a-z]/g, '')}-${Date.now()}@example.org`;
  const { daten } = await api('POST', '/api/benutzer', { cookie, body: { email, name } });
  const lena = (await api('GET', '/api/konto/status', { cookie })).daten.benutzer;
  await api('PUT', `/api/benutzer/${daten.benutzer.id}/abwesenheit`, { cookie, body: { an: false, vertreterId: lena.id } });
  return daten.benutzer.id;
}

/** Bedienelemente der Spalten, die über den Bildschirm ragen (nichts darf breiter sein als der Bildschirm). */
const zuBreit = (s) =>
  s.evaluate(() => {
    const w = document.documentElement.clientWidth;
    const rollt = (e) => {
      for (let p = e.parentElement; p; p = p.parentElement)
        if (p.scrollWidth > p.clientWidth + 1 && /auto|scroll/.test(getComputedStyle(p).overflowX)) return true;
      return false;
    };
    return [...document.querySelectorAll('.drei .spalte :is(a[href], button, input, select, textarea, label, h1, h2, h3, p, li, td)')]
      .filter((e) => e.getClientRects().length && !rollt(e))
      .filter((e) => {
        const r = e.getBoundingClientRect();
        return r.width > 0 && (r.right > w + 1 || r.left < -1);
      })
      .slice(0, 5)
      .map(
        (e) =>
          `${e.tagName.toLowerCase()} „${(e.textContent ?? '').trim().slice(0, 40)}“ bis ${Math.round(e.getBoundingClientRect().right)} px`,
      );
  });

/**
 * Rückfrage bei Gefahr (B4) am Handy: ganz auf dem Bildschirm, der Fokus startet auf „Abbrechen“. Gibt den Dialog zurück.
 */
async function rueckfrageAmHandy(s, titel) {
  const dialog = s.getByRole('alertdialog', { name: titel });
  await dialog.waitFor();
  const lage = await dialog.evaluate((d) => {
    const r = d.getBoundingClientRect();
    return {
      links: r.left,
      rechts: r.right,
      oben: r.top,
      unten: r.bottom,
      w: innerWidth,
      h: innerHeight,
      fokus: document.activeElement?.textContent?.trim(),
    };
  });
  assert.ok(
    lage.links >= 0 && lage.rechts <= lage.w && lage.oben >= 0 && lage.unten <= lage.h,
    `Rückfrage „${titel}“ ragt aus dem Bild: ${JSON.stringify(lage)}`,
  );
  assert.equal(lage.fokus, 'Abbrechen', `Fokus in „${titel}“`);
  return dialog;
}

/* ---------- Handgriffe voll bedienbar ---------- */

/**
 * Seiten der Handgriffe aus #1291: nachsehen (Übersicht, Systemzustand), Sicherung, Postfach abrufen, Wartungsmodus,
 * Benutzer (anlegen, ein Benutzer mit allen Bereichen), Notfall (Verschlüsselung, Notfallzugang unter Anmeldeschutz) und
 * Pakete. `weg` als Funktion: erst zur Laufzeit bekannt.
 */
const HANDGRIFFE = [
  { weg: '/werkbank' },
  { weg: '/werkbank/systemzustand' },
  { weg: '/werkbank/sicherung' },
  { weg: '/werkbank/postfaecher' },
  { weg: '/werkbank/postfaecher/neu' },
  { weg: '/werkbank/wartung' },
  { weg: '/werkbank/benutzer' },
  { weg: '/werkbank/benutzer/neu' },
  { weg: 'jonas', aufklappen: true },
  { weg: '/werkbank/verschluesselung' },
  { weg: '/werkbank/anmeldeschutz' },
  { weg: '/werkbank/pakete' },
];

// In vier Teilen: Die Messung jedes Bedienelements braucht Zeit (Grenze je Rauchtest 120 s).
for (const teil of [0, 1, 2, 3])
  rauchtest(`Handy: Handgriffe für unterwegs voll bedienbar, Teil ${teil + 1} (#1291)`, { handy: true, als: LENA }, async (s) => {
    await s.goto(BASIS + '/ablage/start');
    await verwalten(s);
    const cookie = await lenaVerwaltet();
    const jonas = (await api('GET', '/api/benutzer', { cookie })).daten.find((b) => b.email === JONAS.email);
    const funde = [];
    for (const seite of HANDGRIFFE.filter((_, i) => i % 4 === teil)) {
      const weg = seite.weg === 'jonas' ? `/werkbank/benutzer/${jonas.id}` : seite.weg;
      await s.goto(BASIS + weg);
      await s.locator('.rumpf h1:visible').first().waitFor();
      await s.waitForLoadState('networkidle');
      const alle = s.getByRole('button', { name: 'Alle aufklappen' });
      if (seite.aufklappen && (await alle.count())) await alle.first().click();
      const { breit, sicht } = await s.evaluate(() => ({
        breit: document.documentElement.scrollWidth,
        sicht: document.documentElement.clientWidth,
      }));
      if (breit > sicht) funde.push(`${weg}: Seite rollt waagerecht (${breit} > ${sicht} px)`);
      for (const v of await zuBreit(s)) funde.push(`${weg}: breiter als der Bildschirm: ${v}`);
      for (const v of await tippflaechenPruefen(s, WERKBANK_BEREICHE)) funde.push(`${weg}: ${v}`);
    }
    assert.deepEqual(funde, [], funde.join('\n'));
  });

rauchtest('Handy: Einleitung einer Seite in einer Zeile mit „Mehr“ (#1291)', { handy: true, als: LENA }, async (s) => {
  await s.goto(BASIS + '/ablage/start');
  await verwalten(s);
  for (const weg of ['/werkbank/systemzustand', '/werkbank/sicherung', '/werkbank/wartung']) {
    await s.goto(BASIS + weg);
    const kopf = s.locator('.spalte.mappe .mappenkopf');
    const mehr = kopf.getByRole('button', { name: 'Mehr' });
    await mehr.waitFor();
    const zeile = await kopf.locator('.wb-einleitung-text > :first-child').evaluate((p) => p.getBoundingClientRect().height);
    assert.ok(zeile < 30, `${weg}: Einleitung ${Math.round(zeile)} px hoch statt einer Zeile`);
    assert.equal(await mehr.getAttribute('aria-expanded'), 'false');
    await mehr.click();
    const weniger = kopf.getByRole('button', { name: 'Weniger' });
    assert.equal(await weniger.getAttribute('aria-expanded'), 'true');
    const offen = await kopf.locator('.wb-einleitung-text > :first-child').evaluate((p) => p.getBoundingClientRect().height);
    assert.ok(offen > zeile + 10, `${weg}: „Mehr“ zeigt nicht den ganzen Text`);
  }
  // Am Rechner wie bisher: ganzer Text, kein „Mehr“.
  await s.setViewportSize({ width: 1180, height: 900 });
  await s.goto(BASIS + '/werkbank/systemzustand');
  await s.locator('.spalte.mappe .mappenkopf p.leise').first().waitFor();
  assert.equal(await s.locator('.spalte.mappe .mappenkopf').getByRole('button', { name: 'Mehr' }).count(), 0);
});

rauchtest(
  'Handy: Systemzustand zeigt zuerst den Stand, Wartung zuerst „Jetzt sofort sperren“ (#1291)',
  { handy: true, als: LENA },
  async (s) => {
    await s.goto(BASIS + '/ablage/start');
    await verwalten(s);
    await s.goto(BASIS + '/werkbank/systemzustand');
    await s.locator('#schwellen').waitFor();
    const reihe = await s.evaluate(() =>
      ['#ordner', '#schwellen'].map((id) => Math.round(document.querySelector(id).getBoundingClientRect().top)),
    );
    assert.ok(reihe[0] < reihe[1], `Ordner (${reihe[0]}) vor den Schwellen (${reihe[1]})`);
    await s.goto(BASIS + '/werkbank/wartung');
    const sofort = s.getByRole('button', { name: 'Jetzt sofort sperren' });
    await sofort.waitFor();
    const [knopf, planen] = await Promise.all([sofort.boundingBox(), s.getByRole('textbox', { name: 'Text für alle' }).boundingBox()]);
    assert.ok(knopf.y < planen.y, 'Sofort-Knopf über dem Planen');
    // Am Rechner wie bisher: erst das Planen, dann der Sofort-Knopf; im Systemzustand die Schwellen oben.
    await s.setViewportSize({ width: 1180, height: 900 });
    await s.reload();
    await sofort.waitFor();
    const [k2, p2] = await Promise.all([sofort.boundingBox(), s.getByRole('textbox', { name: 'Text für alle' }).boundingBox()]);
    assert.ok(k2.y > p2.y, 'am Rechner der Sofort-Knopf unter dem Planen');
  },
);

/* ---------- Heikle Handlungen: Rückfragen, frische Anmeldung, Ergebnis am Knopf ---------- */

rauchtest(
  'Handy: Benutzer oben sperren und überall abmelden – Rückfrage passt, Fokus auf „Abbrechen“ (#1291)',
  { handy: true, als: LENA },
  async (s) => {
    await s.goto(BASIS + '/ablage/start');
    await verwalten(s);
    const cookie = await lenaVerwaltet();
    const pia = await sperrbar(cookie, 'Pia Beispiel');
    await s.goto(BASIS + `/werkbank/benutzer/${pia}`);
    const sofort = s.getByRole('group', { name: 'Sofort für Pia Beispiel' });
    // Oben am Benutzer, vor den Bereichen – ohne erst „Zugang“ aufzuklappen.
    const sperren = sofort.getByRole('button', { name: 'Zugang sperren' });
    await sperren.waitFor();
    const [knopf, grunddaten] = await Promise.all([sperren.boundingBox(), s.locator('#grunddaten').boundingBox()]);
    assert.ok(knopf.y < grunddaten.y, '„Zugang sperren“ steht über den Bereichen');
    await sperren.click();
    let dialog = await rueckfrageAmHandy(s, 'Pia Beispiel deaktivieren?');
    await dialog.getByRole('button', { name: 'Abbrechen' }).click();
    await dialog.waitFor({ state: 'detached' });
    await sperren.click();
    dialog = await rueckfrageAmHandy(s, 'Pia Beispiel deaktivieren?');
    await dialog.getByRole('button', { name: 'Deaktivieren' }).click();
    // Ergebnis gleich darunter, Status im Kopf.
    const ergebnis = s.getByText('Deaktiviert – alle Sitzungen beendet.');
    await ergebnis.waitFor();
    assert.ok((await ergebnis.boundingBox()).y < grunddaten.y + 200, 'Ergebnis steht oben beim Knopf');
    await s.locator('.mappenkopf').getByText('deaktiviert').waitFor();
    // Überall abmelden: Jonas hat eine Sitzung, danach keine mehr.
    const jonasCookie = await sitzung(JONAS);
    const jonas = (await api('GET', '/api/benutzer', { cookie })).daten.find((b) => b.email === JONAS.email);
    await s.goto(BASIS + `/werkbank/benutzer/${jonas.id}`);
    await s.getByRole('group', { name: 'Sofort für Jonas Beispiel' }).getByRole('button', { name: 'Überall abmelden' }).click();
    dialog = await rueckfrageAmHandy(s, 'Jonas Beispiel überall abmelden?');
    await dialog.getByRole('button', { name: 'Überall abmelden' }).click();
    await s.getByText('Jonas Beispiel ist überall abgemeldet.').waitFor();
    const r = await fetch(BASIS + '/api/konto/status', { headers: { 'x-dms': '1', cookie: jonasCookie } });
    const st = r.ok ? await r.json() : null;
    assert.ok(!st?.benutzer, 'Die Sitzung von Jonas ist beendet');
  },
);

rauchtest('Handy: Wartungsmodus sofort an und aus – Rückfrage passt, Ergebnis am Knopf (#1291)', { handy: true, als: LENA }, async (s) => {
  await s.goto(BASIS + '/ablage/start');
  await verwalten(s);
  await s.goto(BASIS + '/werkbank/wartung');
  await s.getByRole('button', { name: 'Jetzt sofort sperren' }).click();
  const dialog = await rueckfrageAmHandy(s, 'Jetzt sofort sperren?');
  await dialog.getByRole('button', { name: 'Jetzt sofort sperren' }).click();
  try {
    const gut = s.getByRole('status').filter({ hasText: 'Sofort gesperrt' });
    await gut.waitFor();
    const beenden = s.getByRole('button', { name: 'Wartung beenden' });
    const [m, k] = await Promise.all([gut.boundingBox(), beenden.boundingBox()]);
    assert.ok(m.y - (k.y + k.height) < 80, 'Ergebnis direkt unter den Knöpfen');
    assert.ok(k.y + k.height <= 844, '„Wartung beenden“ ohne Rollen erreichbar');
  } finally {
    // Immer wieder aus, auch wenn eine Prüfung scheitert: Die übrigen Rauchtests brauchen Ablago ohne Wartung.
    await s.getByRole('button', { name: 'Wartung beenden' }).click();
    await s.getByRole('status').filter({ hasText: 'Wartungsmodus beendet' }).waitFor();
  }
});

rauchtest(
  'Handy: Notfallzugang aus dem Internet fragt dieselbe frische Anmeldung ab wie am Rechner (#1291)',
  { handy: true, als: LENA, erwartet: [{ status: 403, pfad: /^\/api\/werkbank\/anmeldeschutz\/notfallzugang$/ }] },
  async (s) => {
    await s.goto(BASIS + '/ablage/start');
    await verwalten(s);
    // Die Anmeldung ist hier noch frisch (unter 10 Minuten): Die erste Antwort kommt wie nach 10 Minuten vom Server
    // (403 mit „frisch“), damit die Oberfläche ihre Abfrage zeigt; danach antwortet der echte Server.
    let einmal = true;
    await s.route('**/api/werkbank/anmeldeschutz/notfallzugang', (r) => {
      if (r.request().method() !== 'PUT' || !einmal) return r.fallback();
      einmal = false;
      return r.fulfill({
        status: 403,
        json: { fehler: 'Bitte bestätige diese Handlung mit einer frischen Anmeldung.', details: { frisch: true, handlung: 'notfall' } },
      });
    });
    await s.goto(BASIS + '/werkbank/anmeldeschutz');
    const haken = s.getByRole('checkbox', { name: /aus dem Internet/ });
    await haken.click();
    const frage = await rueckfrageAmHandy(s, 'Notfallzugang aus dem Internet erlauben?');
    await frage.getByRole('button', { name: 'Aus dem Internet erlauben' }).click();
    const anmeldung = s.locator('dialog.verwaltungsdialog');
    await anmeldung.waitFor();
    const lage = await anmeldung.evaluate((d) => {
      const r = d.getBoundingClientRect();
      return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight;
    });
    assert.ok(lage, 'Die Abfrage der frischen Anmeldung passt auf den Bildschirm');
    await anmeldung.getByLabel('Passwort').fill(LENA.passwort);
    await anmeldung.locator('button[type="submit"]').click();
    await s.getByText('Gespeichert.').or(s.locator('#notfallzugang .hinweis.warn')).first().waitFor();
    assert.equal(await haken.isChecked(), true);
    // Zurück auf „nur Heimnetz“ (geht ohne frische Anmeldung).
    await haken.click();
    await s.locator('#notfallzugang .hinweis.warn').waitFor({ state: 'detached' });
  },
);

/* ---------- Paket aus dem Katalog installieren, am Handy bis zum Ende ---------- */

/** Katalog ohne Internet (wie in pakete.mjs): ein Paket mit Code, das Rechte verlangt. */
const PAKET = {
  id: 'haushalt',
  name: 'Haushalt',
  beschreibung: 'Haushalt für die Ablage. Ein zweiter Satz.',
  autor: { name: 'Ablago-Projekt', github: '' },
  lizenz: 'Apache-2.0',
  aktuell: '1.2.0',
  herausgeber: 'app.ablago',
  versionen: [
    {
      version: '1.2.0',
      dms: '>=0.0.0',
      abhaengigkeiten: {},
      inhalt: { mappentypen: [], sichten: [], beispiele: 0 },
      code: true,
      archiv: 'haushalt.zip',
      sha256: '0'.repeat(64),
      groesse: 2048,
      veroeffentlicht: '2026-11-01T00:00:00Z',
      quelle: '',
      readme: '',
      changelog: '',
    },
  ],
};

/** Vorschau im Ablauf: nur, was die Seite braucht – Rechte, die bestätigt werden müssen. */
const VORSCHAU = {
  paket: {
    ...PAKET,
    version: '1.2.0',
    readme: null,
    changelog: null,
    quelle: null,
    dms: '>=0.0.0',
    abhaengigkeiten: {},
    herausgeberGeprueft: true,
  },
  dmsVersion: 'rauchtest',
  dmsOk: true,
  installiert: null,
  update: false,
  herkunft: null,
  umzug: null,
  herausgeberBestaetigen: null,
  pruefung: null,
  abhaengigkeiten: [],
  typen: [],
  sichten: [],
  beispiele: 0,
  beispielDokumente: { anzahl: 0, bytes: 0 },
  vorgaben: [],
  ergaenzungen: [],
  umbau: [],
  probleme: [],
  fehlercodes: [],
  namenskonflikte: [],
  hinweise: [],
  automatisierungen: [],
  einstellungen: null,
  laeufer: { bestaetigen: true, rechte: [{ text: 'Dokumente lesen', hilfe: 'pakete.recht.dokumente' }] },
  sprache: null,
};

/** Katalog, Plan und Installation als Attrappe; der Rest der Seite ist echt. Liefert, was installiert wurde. */
async function katalogAttrappe(s) {
  const z = { installiert: [], antworten: null, katalogUrl: '' };
  await s.route('**/api/werkbank/pakete', async (r) => {
    if (r.request().method() !== 'GET') return r.fallback();
    const echt = await (await r.fetch()).json();
    z.katalogUrl = echt.katalogUrl;
    await r.fulfill({ json: { ...echt, installiert: [...echt.installiert, ...z.installiert] } });
  });
  await s.route('**/api/werkbank/pakete/katalog', (r) =>
    r.fulfill({
      json: {
        kataloge: [
          {
            url: z.katalogUrl,
            offiziell: true,
            katalog: { format: 1, erstellt: '2026-11-14T08:00:00Z', quelle: 'https://github.com/motom001/dms-registry', pakete: [PAKET] },
            fehler: null,
            pruefung: null,
          },
        ],
        abgerufen: new Date().toISOString(),
      },
    }),
  );
  await s.route('**/api/werkbank/pakete/ablauf/plan', (r) =>
    r.fulfill({
      json: {
        pakete: [
          {
            schluessel: 'haushalt',
            id: 'haushalt',
            name: 'Haushalt',
            version: '1.2.0',
            gewaehlt: true,
            fuer: [],
            ergaenzt: null,
            vorschau: VORSCHAU,
            einstellungen: [],
          },
        ],
        probleme: [],
        herkunft: null,
        herkunftBestaetigen: false,
        rechte: { bestaetigen: true, stand: 'rauchtest' },
        auswahl: { typen: [], benutzer: [], rollen: [], sichten: [] },
      },
    }),
  );
  await s.route('**/api/werkbank/pakete/ablauf/installieren', (r) => {
    z.antworten = r.request().postDataJSON();
    z.installiert.push({
      id: 'haushalt',
      name: 'Haushalt',
      version: '1.2.0',
      beschreibung: PAKET.beschreibung,
      lizenz: 'Apache-2.0',
      autor: PAKET.autor,
      herausgeber: 'app.ablago',
      herausgeberGeprueft: true,
      herkunft: { art: 'katalog', url: z.katalogUrl },
      installiert: new Date().toISOString(),
      installiertVon: LENA.email,
      aktualisiert: null,
      aktualisiertVon: null,
      typen: {},
      sichten: {},
      abhaengigkeiten: {},
    });
    return r.fulfill({
      json: {
        installiert: [{ id: 'haushalt', name: 'Haushalt', version: '1.2.0', einstellungen: 'keine' }],
        fehlgeschlagen: [],
        fehler: null,
        nichtInstalliert: [],
      },
    });
  });
  await s.route('**/api/werkbank/pakete/*/umwandlungen', (r) => r.fulfill({ json: { felder: [], vorgaenge: [] } }));
  return z;
}

rauchtest(
  'Handy: Paket aus dem Katalog installieren – Vorschau, Rechte bestätigen, fertig (#1291)',
  { handy: true, als: LENA },
  async (s) => {
    const z = await katalogAttrappe(s);
    await s.goto(BASIS + '/ablage/start');
    await verwalten(s);
    await s.goto(BASIS + '/werkbank/pakete');
    const liste = s.getByRole('region', { name: 'Elemente' });
    await liste.getByRole('button', { name: /^(Katalog abrufen|Nach neuen Versionen suchen)$/ }).click();
    await liste
      .getByRole('link', { name: /^Haushalt/ })
      .first()
      .click();
    // Am Handy steht die Seite allein, der Weg zurück führt zur Liste.
    const seite = s.getByRole('region', { name: 'Bearbeitung' });
    await seite.getByRole('heading', { name: 'Haushalt', level: 1 }).waitFor();
    await seite.getByRole('button', { name: 'Installieren …' }).click();
    // Auswahl (Abhängigkeiten kommen mit), dann alle Fragen auf einer Seite.
    const weiter = seite.getByRole('button', { name: 'Weiter mit 1 Paket …' });
    await weiter.waitFor();
    await keineRolleUndTippflaechen(s, 'Auswahl');
    await weiter.click();
    // Rechte: erst nach dem Haken lässt sich installieren.
    const rechte = seite.getByRole('region', { name: 'Rechte der Pakete mit Code' });
    await rechte.getByText('Dokumente lesen').waitFor();
    const los = seite.getByRole('button', { name: '1 Paket installieren' });
    assert.ok((await los.isDisabled()) || (await los.getAttribute('aria-disabled')) === 'true', 'ohne Haken gesperrt');
    await keineRolleUndTippflaechen(s, 'Ablauf');
    await rechte.getByRole('checkbox', { name: 'Ich erlaube diesen Paketen jeweils diese Rechte.' }).check();
    await los.click();
    await seite.getByText('Installiert: Haushalt 1.2.0.').waitFor();
    assert.equal(z.antworten?.rechteStand, 'rauchtest', 'Die Rechte sind bestätigt mitgeschickt');
    // #1538: Nach dem Installieren lädt die Seite Liste und Paket neu und zeichnet das installierte Paket – erst dann
    // messen (auf den fertigen Zustand warten, keine feste Zeit): „Entfernen“ steht da, die Seite ist ruhig.
    await seite.getByRole('button', { name: 'Entfernen' }).waitFor();
    await seiteRuhig(s);
    await keineRolleUndTippflaechen(s, 'Fertig');
  },
);

/** Kein waagerechtes Rollen, nichts zu breit, Tippflächen ab 44 px – für einen Schritt des Ablaufs. */
async function keineRolleUndTippflaechen(s, schritt) {
  await s.waitForLoadState('networkidle');
  const funde = [...(await zuBreit(s)), ...(await tippflaechenPruefen(s, WERKBANK_BEREICHE))];
  const { breit, sicht } = await s.evaluate(() => ({
    breit: document.documentElement.scrollWidth,
    sicht: document.documentElement.clientWidth,
  }));
  if (breit > sicht) funde.push(`Seite rollt waagerecht (${breit} > ${sicht} px)`);
  assert.deepEqual(funde, [], `${schritt}:\n${funde.join('\n')}`);
}
