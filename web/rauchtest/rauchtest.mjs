/**
 * Rauchtests für die Oberfläche (#897): die wichtigsten Wege einmal im echten Browser.
 *
 * Erwartet ein frisch gestartetes Ablago ohne Datenbank-Anbindung (Einrichtungsmodus), wie im Job „pruefen“:
 * Der erste Test geht den Einrichtungsassistenten durch (die Datenbank legt er selbst an), danach legt das Skript
 * über die Schnittstelle ein paar Daten an (Beispiele, zwei Briefe in „Neue Post“, ein zweites Konto). Jeder
 * weitere Test öffnet einen eigenen Browser-Kontext und prüft
 *   - das sichtbare Ergebnis seines Wegs (Überschrift, Meldung, gespeicherter Wert),
 *   - keine Fehler in der Konsole und keine Fehler im Skript der Seite,
 *   - keine fehlgeschlagene Anfrage und keine Antwort ab 400 von Ablago (außer den beim Test erwarteten).
 *
 *   DMS_URL=http://localhost:3000 DMS_DATENWURZEL=… DB_HOST=localhost DB_PASSWORT=dms node web/rauchtest/rauchtest.mjs [fehlerordner] [musterordner]
 *
 * Ablago muss als Testbau gebaut sein (`VITE_MUSTER=1 npm run build`): Der Test „Musterseite der Bausteine“ (#967)
 * fotografiert /muster nach [musterordner] (Vorgabe rauchtest-muster) und prüft die Seite mit axe-core.
 *
 * Weitere Variablen: DB_NAME (Vorgabe dms_rauchtest), DB_BENUTZER (Vorgabe dms), DMS_EINRICHTUNGSCODE (statt der
 * Datei unter DMS_DATENWURZEL/geheim). Bei einem Fehler liegt ein Bild der Seite im Fehlerordner.
 *
 * Braucht Playwright mit Chromium (im Workflow: npm install --no-save playwright im Ordner web/rauchtest).
 * Gewartet wird immer auf Elemente oder Ereignisse, nie eine feste Zeit – sonst wackeln die Tests.
 * Neue Abläufe bekommen ihren Rauchtest im selben PR: einen Block `rauchtest(…)` unten ergänzen
 * (Entwicklerhandbuch, Seite „Tests“).
 */
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test, after, before } from 'node:test';
import { chromium } from 'playwright';
import { musterAufnehmen } from './muster.mjs';

const BASIS = (process.env.DMS_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const FEHLERORDNER = process.argv[2] ?? process.env.DMS_RAUCHTEST_BILDER ?? 'rauchtest-fehler';
// Bilder der Musterseite (#967): immer, nicht nur bei Fehlern – zum Ansehen im Pull Request.
const MUSTERORDNER = process.argv[3] ?? process.env.DMS_MUSTER_BILDER ?? 'rauchtest-muster';
// Persona-Namen (Lena richtet ein, Jonas ist neu dabei) und nur Beispiel-Domains.
const LENA = { email: 'lena@example.org', name: 'Lena Beispiel', passwort: 'rauchtest-passwort-1' };
const JONAS = { email: 'jonas@example.org', name: 'Jonas Beispiel', passwort: 'rauchtest-passwort-2' };
const DESKTOP = { viewport: { width: 1366, height: 900 } };
const HANDY = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true };

let browser;
/** Ist Ablago eingerichtet und sind die Daten angelegt? Sonst sind die übrigen Tests sinnlos. */
let bereit = false;
/** Ids der Daten, die die Tests brauchen (vorbereiten). */
const daten = {};

before(async () => {
  await mkdir(FEHLERORDNER, { recursive: true });
  browser = await chromium.launch();
});
after(async () => { await browser?.close(); });

/* ---------- Schnittstelle ---------- */

async function api(methode, pfad, { cookie, body, roh } = {}) {
  const r = await fetch(BASIS + pfad, {
    method: methode,
    headers: { 'x-dms': '1', ...(cookie ? { cookie } : {}), ...(body !== undefined ? { 'content-type': roh ? 'application/octet-stream' : 'application/json' } : {}) },
    body: body === undefined ? undefined : roh ? body : JSON.stringify(body),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`${methode} ${pfad}: ${r.status} ${text}`);
  return { daten: text ? JSON.parse(text) : null, cookie: r.headers.get('set-cookie')?.split(';')[0] };
}

/** Anmelden über die Schnittstelle (schneller als das Formular, das nur „Anmelden“ selbst prüft). */
async function sitzung(person) {
  const { cookie } = await api('POST', '/api/konto/anmelden', { body: { email: person.email, passwort: person.passwort } });
  if (!cookie) throw new Error(`Anmelden als ${person.email}: kein Cookie`);
  return cookie;
}

async function warteAufAblago() {
  for (let i = 0; i < 120; i++) {
    // Auch im Einrichtungsmodus erreichbar.
    try { if ((await fetch(`${BASIS}/api/konto/status`)).ok) return; } catch { /* startet noch */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Ablago unter ${BASIS} antwortet nicht.`);
}

async function einrichtungscode() {
  if (process.env.DMS_EINRICHTUNGSCODE) return process.env.DMS_EINRICHTUNGSCODE;
  const datei = join(process.env.DMS_DATENWURZEL ?? join(import.meta.dirname, '../../data'), 'geheim', 'EINRICHTUNGSCODE');
  for (let i = 0; i < 60; i++) {
    try { return (await readFile(datei, 'utf8')).trim(); } catch { await new Promise((r) => setTimeout(r, 500)); }
  }
  throw new Error(`Einrichtungscode nicht gefunden (${datei}).`);
}

/** Kleines, gültiges PDF mit einer Zeile Text (mehrere Zeilen mit \n getrennt). */
function beispielPdf(zeile) {
  const inhalt = `BT /F1 18 Tf 60 760 Td ${zeile.split('\n').map((z) => `(${z}) Tj`).join(' 0 -28 Td ')} ET`;
  const objekte = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${inhalt.length} >>\nstream\n${inhalt}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let pdf = '%PDF-1.4\n';
  const pos = [];
  objekte.forEach((o, i) => { pos.push(pdf.length); pdf += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = pdf.length;
  pdf += `xref\n0 ${objekte.length + 1}\n0000000000 65535 f \n${pos.map((p) => `${String(p).padStart(10, '0')} 00000 n \n`).join('')}`;
  pdf += `trailer\n<< /Size ${objekte.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}

/* ---------- Rahmen für einen Rauchtest ---------- */

/**
 * Ein Rauchtest: eigener Browser-Kontext (Desktop oder Handy), auf Wunsch schon angemeldet. Sammelt Fehler der
 * Konsole und der Seite, fehlgeschlagene Anfragen und Antworten ab 400; am Ende muss die Liste leer sein.
 *
 * optionen.erwartet: Antworten, die zu diesem Weg gehören – je { status, pfad: RegExp }.
 * Nicht als Fehler zählen:
 *   - „Failed to load resource“ in der Konsole: Chromium meldet so jede Antwort ab 400 – die prüft der Test selbst
 *     (mit den erwarteten Ausnahmen);
 *   - net::ERR_ABORTED: abgebrochene Anfragen (Seitenwechsel, Download abgebrochen) und Antworten ohne gelesenen
 *     Inhalt (z. B. 204 auf einen Merker) meldet Chromium so, obwohl Ablago geantwortet hat.
 */
function rauchtest(name, optionen, ablauf) {
  test(name, { timeout: 120_000 }, async (t) => {
    if (!optionen.einrichtung && !bereit) { t.skip('Einrichtung gescheitert'); return; }
    const k = await browser.newContext({ locale: 'de-DE', timezoneId: 'Europe/Berlin', ...(optionen.handy ? HANDY : DESKTOP) });
    // Kürzer als die Vorgabe von Playwright (30 s): Ein kaputter Weg soll schnell auffallen.
    k.setDefaultTimeout(15_000);
    k.setDefaultNavigationTimeout(30_000);
    const erwartet = optionen.erwartet ?? [];
    const fehler = [];
    k.on('console', (m) => { if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) fehler.push(`Konsole: ${m.text()}`); });
    k.on('weberror', (e) => fehler.push(`Fehler in der Seite: ${e.error().message}`));
    k.on('requestfailed', (r) => { if (r.failure()?.errorText !== 'net::ERR_ABORTED') fehler.push(`Anfrage fehlgeschlagen: ${r.method()} ${r.url()} (${r.failure()?.errorText})`); });
    k.on('response', (r) => {
      if (r.status() < 400 || !r.url().startsWith(BASIS)) return;
      const pfad = new URL(r.url()).pathname;
      if (erwartet.some((e) => e.status === r.status() && e.pfad.test(pfad))) return;
      fehler.push(`Antwort ${r.status()}: ${r.request().method()} ${pfad}`);
    });
    if (optionen.als) {
      const c = await sitzung(optionen.als);
      const i = c.indexOf('=');
      await k.addCookies([{ name: c.slice(0, i), value: c.slice(i + 1), url: BASIS }]);
    }
    const s = await k.newPage();
    try {
      await ablauf(s, k);
    } catch (e) {
      const datei = join(FEHLERORDNER, `${name.replace(/[^a-z0-9äöüß]+/gi, '-').toLowerCase()}.png`);
      await s.screenshot({ path: datei, fullPage: true }).catch(() => {});
      throw new Error(`${e.message}\n(Bild: ${datei}${fehler.length ? `; außerdem: ${fehler.join(' | ')}` : ''})`, { cause: e });
    } finally {
      await k.close();
    }
    assert.deepEqual(fehler, [], `Fehler im Browser bei „${name}“`);
  });
}

/** Das Benutzermenü oben rechts öffnen (Knopf mit dem eigenen Namen). */
async function benutzermenue(s, person) {
  await s.getByRole('banner').getByRole('button', { name: person.name }).click();
  return s.getByRole('banner').getByRole('menu');
}

/* ---------- Einrichtung und Daten ---------- */

rauchtest('Einrichtung: Assistent im Browser', {
  einrichtung: true,
  // Nach „Übernehmen und weiter“ startet Ablago mit der Datenbank neu; bis dahin antwortet der Status mit 503.
  erwartet: [{ status: 503, pfad: /^\/api\/konto\/status$/ }],
}, async (s, k) => {
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
  await s.locator('label').filter({ has: s.getByText(/^mindestens .* Zeichen$/) }).locator('input').fill(LENA.passwort);
  await s.getByLabel('Passwort wiederholen').fill(LENA.passwort);
  await s.getByRole('button', { name: 'Weiter' }).click();
  // Pakete: ohne Internet nur ein Hinweis – die Rauchtests brauchen keine Pakete.
  await s.getByRole('heading', { name: 'Pakete dazuholen' }).waitFor();
  await s.getByRole('button', { name: 'Überspringen' }).click({ timeout: 30_000 });
  await s.getByRole('heading', { name: 'Optionales' }).waitFor();
  await s.getByRole('button', { name: 'Weiter' }).click();
  await s.getByRole('heading', { name: 'Zusammenfassung' }).waitFor();
  await s.getByRole('button', { name: 'Jetzt einrichten' }).click();
  await s.getByRole('heading', { name: /ist eingerichtet/ }).waitFor({ timeout: 60_000 });
  const download = s.waitForEvent('download');
  await s.getByRole('button', { name: 'Notfallblatt herunterladen' }).click();
  await (await download).cancel().catch(() => {});
  await s.getByText(/Notfallblatt heruntergeladen/).waitFor();
  await s.getByRole('button', { name: 'Später' }).click();
  await s.getByRole('button', { name: 'Einrichtung abschließen' }).click();
  await s.waitForURL(/\/werkbank/);
  const sitzungscookie = (await k.cookies()).find((c) => c.name === 'dms_sitzung');
  assert.ok(sitzungscookie, 'Nach der Einrichtung keine Sitzung im Browser');
  await vorbereiten(`${sitzungscookie.name}=${sitzungscookie.value}`);
  bereit = true;
});

/** Daten für die Tests über die Schnittstelle – mit der Sitzung aus dem Assistenten (im Verwaltungsmodus). */
async function vorbereiten(cookie) {
  // Lena kennt Ablago schon: kein Rundgang über ihren Tests. Den zeigt der Test mit dem neuen Konto.
  await api('POST', '/api/entdecken/rundgaenge/ablago', { cookie, body: { stand: 'gesehen' } });
  await api('POST', '/api/beispiele', { cookie });
  for (const [schluessel, betreff] of [['brief', 'Preisanpassung Strom 2027'], ['briefHandy', 'Beitragsrechnung Hausrat 2027']]) {
    const brief = (await api('POST', '/api/post', { cookie, body: { betreff } })).daten;
    await api('POST', `/api/mappen/${brief.id}/dokumente?register=dokumente&name=${encodeURIComponent(`${betreff}.pdf`)}&typ=application/pdf`, { cookie, body: beispielPdf(betreff), roh: true });
    daten[schluessel] = brief;
  }
  // Eine Automatisierung für die Dreiteilung der Werkbank (#1063): Ihre Bearbeitung ist länger als das Fenster.
  const vertrag = (await api('GET', '/api/typen', { cookie })).daten.find((x) => x.name === 'Vertrag');
  await api('POST', '/api/werkbank/automatisierungen', { cookie, body: { name: 'Rauchtest Vertrag angelegt', wenn: { art: 'mappe.angelegt', typ: vertrag.id }, dann: [{ id: 's', art: 'stopp' }] } });
  const einladung = (await api('POST', '/api/benutzer',{ cookie, body: { email: JONAS.email, name: JONAS.name, rolle: 'mitglied', rollen: [] } })).daten;
  await api('POST', '/api/konto/passwort-setzen', { body: { schluessel: einladung.link.split('/passwort/')[1], passwort: JONAS.passwort } });
}

/* ---------- Desktop ---------- */

rauchtest('Anmelden und Startseite', {}, async (s) => {
  await s.goto(BASIS + '/');
  await s.getByRole('heading', { name: 'Anmelden' }).waitFor();
  await s.getByLabel('E-Mail-Adresse').fill(LENA.email);
  await s.getByLabel('Passwort', { exact: true }).fill(LENA.passwort);
  await s.getByRole('button', { name: 'Anmelden' }).click();
  await s.waitForURL(/\/ablage\/start$/);
  await s.getByRole('heading', { name: /^Start/, level: 1 }).waitFor();
  await s.getByText('Hallo Lena! Hier fängst du an.').waitFor();
  // Kacheln der Startseite: zwei Briefe in „Neue Post“.
  await s.getByRole('link', { name: /^Neue Post 2 Noch nicht zugeordnet/ }).waitFor();
  await s.getByRole('link', { name: /^Zu erledigen/ }).first().waitFor();
});

// #934: Neue Post öffnet die Seite „Dokument übernehmen“. Nur ansehen und ausfüllen – gespeichert wird am Ende der Datei.
rauchtest('Dokument übernehmen: Neue Post öffnen, Mappentyp wählen, Text vom Dokument übernehmen', { als: LENA }, async (s) => {
  await s.goto(BASIS + '/ablage/start');
  await s.getByRole('link', { name: /^Neue Post 2/ }).first().click();
  const liste = s.getByRole('region', { name: 'Mappen' });
  await liste.getByRole('heading', { name: /^Neue Post/, level: 1 }).waitFor();
  await liste.locator(`a[href$="/${daten.brief.id}"]`).click();
  // Links bleibt „Neue Post“ markiert, in der Mitte das Dokument mit „Post … von 2“, rechts „Wohin gehört das?“.
  await s.waitForURL(new RegExp(`/${daten.brief.id}/uebernehmen$`));
  await s.getByRole('complementary', { name: 'Ansichten' }).locator('a.sicht.an', { hasText: 'Neue Post' }).waitFor();
  const dokument = s.getByRole('region', { name: 'Dokument' });
  await dokument.getByRole('heading', { name: 'Preisanpassung Strom 2027' }).waitFor();
  await dokument.getByText(/^Post [12] von 2$/).waitFor();
  await dokument.getByRole('img', { name: 'Seite 1' }).waitFor();
  const mappe = s.getByRole('region', { name: 'Mappe' });
  const wohin = mappe.getByRole('combobox', { name: 'Wohin gehört das?' });
  await wohin.click();
  await mappe.getByRole('option', { name: /^Vertrag Laufender Vertrag/ }).click();
  // Die Mappe darunter: Kopf mit Typ und Titel (aus dem Betreff), Felder, Speicherleiste mit Hinweis zur Post.
  await mappe.getByRole('heading', { name: 'Preisanpassung Strom 2027', level: 1 }).waitFor();
  await mappe.getByText('Beim Speichern wandern Dokumente und Historie der Post hierher, die Post kommt in den Papierkorb.').waitFor();
  await mappe.getByRole('button', { name: 'Mappe speichern' }).waitFor();
  assert.equal(await mappe.getByRole('button', { name: /Aus Dokument ausfüllen/ }).count(), 0, '„Aus Dokument ausfüllen“ steht hier nicht');
  // Der Betreff steht auch im Dokument: Rahmen 1 an der Fundstelle, die Nummer 1 am Feld „Bezeichnung“.
  const rahmen = dokument.getByRole('button', { name: 'Rahmen 1: Preisanpassung Strom 2027' });
  await rahmen.waitFor();
  await rahmen.hover();
  await mappe.locator('.feld.ue-hervor[data-anker="mappe.feld:bezeichnung"]').waitFor();
  // Feld wählen, dann den Rahmen anklicken: Das Feld übernimmt den Wert.
  await mappe.getByRole('textbox', { name: 'Vertragsnummer' }).click();
  await rahmen.click();
  await s.waitForFunction(() => document.querySelector('#feld-vertragsnummer')?.value === 'Preisanpassung Strom 2027');
  await dokument.getByText('„Preisanpassung Strom 2027“ steht jetzt in „Vertragsnummer“.').waitFor();
});

rauchtest('„+ Neu“: Mappe anlegen und speichern', { als: LENA }, async (s) => {
  await s.goto(BASIS + '/ablage/start');
  await s.getByRole('button', { name: '+ Neu' }).click();
  const menue = s.getByRole('banner').getByRole('menu');
  await menue.getByRole('menuitem', { name: /^Post/ }).waitFor();
  await menue.getByRole('menuitem', { name: 'Mappe …' }).click();
  await menue.getByRole('menuitem', { name: 'Vertragspartner' }).click();
  await s.waitForURL(/\/neu$/);
  const mappe = s.getByRole('region', { name: 'Mappe' });
  await mappe.getByRole('heading', { name: 'Neue Mappe', level: 1 }).waitFor();
  await mappe.getByRole('textbox', { name: 'Name*' }).fill('Versicherung Beispiel AG');
  await mappe.getByRole('textbox', { name: 'Kundennummer' }).fill('K-2027-42');
  await mappe.getByRole('button', { name: 'Mappe speichern' }).click();
  await mappe.getByRole('heading', { name: 'Versicherung Beispiel AG', level: 1 }).waitFor();
  await s.waitForURL((u) => !u.pathname.endsWith('/neu'));
  // Nach dem Neuladen noch da.
  await s.reload();
  await mappe.getByRole('heading', { name: 'Versicherung Beispiel AG', level: 1 }).waitFor();
  assert.equal(await mappe.getByRole('textbox', { name: 'Kundennummer' }).inputValue(), 'K-2027-42');
});

rauchtest('Mappe öffnen, ändern und speichern', { als: LENA }, async (s) => {
  await s.goto(BASIS + '/ablage/start');
  await s.getByRole('complementary', { name: 'Ansichten' }).getByRole('link', { name: /^Vertrag \d/ }).click();
  await s.getByRole('region', { name: 'Mappen' }).getByRole('link', { name: /Wartungsvertrag Heizung/ }).first().click();
  const mappe = s.getByRole('region', { name: 'Mappe' });
  await mappe.getByRole('heading', { name: 'Wartungsvertrag Heizung', level: 1 }).waitFor();
  // „Änderungen verwerfen“ geht nur mit ungespeicherten Änderungen – daran sieht man, dass gespeichert ist.
  const verwerfen = (gesperrt) => mappe.getByRole('button', { name: 'Änderungen verwerfen', disabled: gesperrt }).waitFor();
  await verwerfen(true);
  await mappe.getByRole('textbox', { name: 'Vertragsnummer' }).fill('WV-2027-1');
  await verwerfen(false);
  await mappe.getByRole('button', { name: 'Mappe speichern' }).click();
  await verwerfen(true);
  await s.reload();
  await mappe.getByRole('heading', { name: 'Wartungsvertrag Heizung', level: 1 }).waitFor();
  assert.equal(await mappe.getByRole('textbox', { name: 'Vertragsnummer' }).inputValue(), 'WV-2027-1');
});

// #940: „Zuletzt geöffnet ›“ öffnet die Liste der letzten 25; Ändern zählt wie Öffnen (der Vertrag aus dem Test davor).
rauchtest('Startseite: Liste „Zuletzt geöffnet“', { als: LENA }, async (s) => {
  await s.goto(BASIS + '/ablage/start');
  await s.getByRole('link', { name: 'Zuletzt geöffnet ›' }).click();
  await s.waitForURL(/\/ablage\/zuletzt$/);
  const liste = s.getByRole('region', { name: 'Mappen' });
  await liste.getByRole('heading', { name: /^Zuletzt geöffnet/, level: 1 }).waitFor();
  await liste.getByRole('link', { name: /Wartungsvertrag Heizung.*Vertrag · geöffnet/ }).first().click();
  await s.getByRole('region', { name: 'Mappe' }).getByRole('heading', { name: 'Wartungsvertrag Heizung', level: 1 }).waitFor();
  await liste.getByRole('link', { name: '← Start' }).click();
  await s.waitForURL(/\/ablage\/start$/);
});

rauchtest('Suche auf der Startseite', { als: LENA }, async (s) => {
  await s.goto(BASIS + '/ablage/start');
  const schnell = s.getByRole('region', { name: 'Schnell finden' });
  await schnell.getByRole('searchbox', { name: 'Alle Mappen durchsuchen' }).fill('Stadtwerke');
  await schnell.getByText('Ein Treffer').waitFor();
  await schnell.getByRole('link', { name: 'Stadtwerke Musterstadt' }).click();
  await s.getByRole('region', { name: 'Mappe' }).getByRole('heading', { name: 'Stadtwerke Musterstadt', level: 1 }).waitFor();
  // Ohne Treffer: ein Hinweis statt einer leeren Seite.
  await s.goto(BASIS + '/ablage/start');
  await schnell.getByRole('searchbox', { name: 'Alle Mappen durchsuchen' }).fill('Xylofonunterricht');
  await schnell.getByText('Nichts gefunden für „Xylofonunterricht“.').waitFor();
});

/** Verwaltungsmodus über das Benutzermenü; fragt Ablago nach dem Passwort, wird es eingegeben. */
async function verwalten(s) {
  const menue = await benutzermenue(s, LENA);
  await menue.getByRole('button', { name: 'Ablago verwalten' }).click();
  const balken = s.getByRole('region', { name: 'Du verwaltest gerade Ablago.' });
  const dialog = s.getByRole('dialog');
  await balken.or(dialog).first().waitFor();
  if (await dialog.isVisible()) {
    await dialog.getByLabel('Passwort').fill(LENA.passwort);
    await dialog.locator('button[type="submit"]').click();
  }
  await balken.waitFor();
}

rauchtest('Verwaltungsmodus betreten, Werkbank und Pakete', { als: LENA }, async (s) => {
  await s.goto(BASIS + '/ablage/start');
  await verwalten(s);
  await s.waitForURL(/\/werkbank/);
  const bereiche = s.getByRole('complementary', { name: 'Bereiche' });
  await bereiche.getByRole('link', { name: 'Pakete', exact: true }).click();
  const elemente = s.getByRole('region', { name: 'Elemente' });
  await elemente.getByRole('heading', { name: /^Pakete/, level: 1 }).first().waitFor();
  await elemente.getByRole('button', { name: 'Katalog abrufen' }).waitFor();
  // Zurück in die Ablage: Der rote Balken bleibt, bis man die Verwaltung beendet.
  await s.getByRole('button', { name: 'Verwaltung beenden' }).click();
  await s.getByRole('region', { name: 'Du verwaltest gerade Ablago.' }).waitFor({ state: 'detached' });
  await s.waitForURL(/\/ablage/);
});

rauchtest('Werkbank: Mappentyp bearbeiten (Felder)', { als: LENA }, async (s) => {
  await s.goto(BASIS + '/ablage/start');
  await verwalten(s);
  await s.getByRole('complementary', { name: 'Bereiche' }).getByRole('link', { name: /^Mappentypen/ }).click();
  await s.getByRole('link', { name: /^Vertrag \d+ Felder/ }).click();
  const bearbeitung = s.getByRole('region', { name: 'Bearbeitung' });
  await bearbeitung.getByRole('heading', { name: 'Vertrag', level: 1 }).waitFor();
  const felder = bearbeitung.getByRole('region', { name: 'Felder' });
  await felder.getByRole('button', { name: 'Felder' }).click();
  await felder.getByRole('button', { name: '+ Feld hinzufügen' }).click();
  await felder.getByRole('textbox', { name: 'Bezeichnung' }).fill('Kundenportal');
  await bearbeitung.getByRole('button', { name: 'Mappentyp speichern' }).click();
  await bearbeitung.getByRole('button', { name: 'Mappentyp speichern', disabled: true }).waitFor();
  await felder.getByRole('button', { name: /^Kundenportal kundenportal/ }).waitFor();
  // Das neue Feld steht im Formular der Mappen.
  await s.goto(BASIS + '/ablage/start');
  await s.getByRole('complementary', { name: 'Ansichten' }).getByRole('link', { name: /^Vertrag \d/ }).click();
  await s.getByRole('region', { name: 'Mappen' }).getByRole('link', { name: /Stromvertrag Haus/ }).first().click();
  await s.getByRole('region', { name: 'Mappe' }).getByRole('textbox', { name: 'Kundenportal' }).waitFor();
});

rauchtest('Werkbank: Stempel-Vorlage aus der Mitte öffnen (#990)', { als: LENA }, async (s) => {
  await s.goto(BASIS + '/ablage/start');
  await verwalten(s);
  await s.getByRole('complementary', { name: 'Bereiche' }).getByRole('link', { name: /^Stempel/ }).click();
  const elemente = s.getByRole('region', { name: 'Elemente' });
  await elemente.getByRole('link', { name: '+ Neu' }).waitFor();
  await elemente.getByRole('link', { name: /^Kopie für/ }).click();
  await s.waitForURL(/\/werkbank\/stempel\/kopie$/);
  const bearbeitung = s.getByRole('region', { name: 'Bearbeitung' });
  await bearbeitung.getByRole('heading', { name: /^Kopie für/, level: 1 }).waitFor();
  // Live-Vorschau (#799) und Speicherleiste rechts.
  await bearbeitung.getByRole('heading', { name: 'Vorschau' }).waitFor();
  await bearbeitung.getByRole('textbox', { name: 'Name' }).fill('Kopie für Rauchtest');
  await bearbeitung.getByRole('button', { name: 'Vorlage speichern' }).click();
  await bearbeitung.locator('.hinweis.gut').getByText('Gespeichert.').waitFor();
  await elemente.getByRole('link', { name: /^Kopie für Rauchtest/ }).waitFor();
  // Alter Link mit ?offen=… führt auf die Vorlage rechts.
  await s.goto(BASIS + '/werkbank/stempel?offen=entwurf');
  await s.waitForURL(/\/werkbank\/stempel\/entwurf$/);
  await bearbeitung.getByRole('heading', { name: 'Entwurf', level: 1 }).waitFor();
});

// Wiederherstellen (Abschnitt der Sicherung) antwortet außerhalb des Wartungsmodus mit 409 – das ist gewollt.
rauchtest('Werkbank: Notfallblatt nur unter Verschlüsselung, Sicherung verweist dorthin (#993)', { als: LENA, erwartet: [{ status: 409, pfad: /^\/api\/wiederherstellung\/sicherungen$/ }] }, async (s) => {
  await s.goto(BASIS + '/ablage/start');
  await verwalten(s);
  await s.getByRole('complementary', { name: 'Bereiche' }).getByRole('link', { name: /^Sicherung/ }).click();
  const bearbeitung = s.getByRole('region', { name: 'Bearbeitung' });
  await bearbeitung.getByRole('heading', { name: 'Sicherung', level: 1 }).waitFor();
  assert.equal(await bearbeitung.getByRole('heading', { name: /^Notfallblatt/ }).count(), 0, 'kein Abschnitt Notfallblatt in der Sicherung');
  await bearbeitung.getByRole('link', { name: /^Notfallblatt heruntergeladen/ }).click();
  await s.waitForURL(/\/werkbank\/verschluesselung#notfallblatt$/);
  await bearbeitung.getByRole('heading', { name: /^Notfallblatt/ }).waitFor();
  await bearbeitung.getByRole('link', { name: 'Notfallblatt herunterladen (PDF)' }).waitFor();
});

rauchtest('Rundgang beim ersten Anmelden und „Ablago entdecken“', {}, async (s) => {
  await s.goto(BASIS + '/');
  await s.getByLabel('E-Mail-Adresse').fill(JONAS.email);
  await s.getByLabel('Passwort', { exact: true }).fill(JONAS.passwort);
  await s.getByRole('button', { name: 'Anmelden' }).click();
  const rundgang = s.getByRole('dialog');
  await rundgang.getByText('Schritt 1 von 5').waitFor();
  for (let i = 2; i <= 5; i++) {
    await rundgang.getByRole('button', { name: 'Weiter' }).click();
    await rundgang.getByText(`Schritt ${i} von 5`).waitFor();
  }
  await rundgang.getByRole('button', { name: 'Fertig' }).click();
  await rundgang.waitFor({ state: 'detached' });
  await s.getByText('Hallo Jonas! Hier fängst du an.').waitFor();
  // „Ablago entdecken“ im Benutzermenü: Tipps und der Rundgang zum Wiederholen.
  const menue = await benutzermenue(s, JONAS);
  await menue.getByRole('link', { name: 'Ablago entdecken' }).click();
  await s.getByRole('heading', { name: 'Ablago entdecken', level: 1 }).waitFor();
  await s.getByRole('region', { name: 'Tipps' }).getByRole('link').first().waitFor();
  await s.getByRole('region', { name: 'Rundgänge' }).getByRole('button', { name: 'Rundgang starten' }).click();
  await rundgang.getByText('Schritt 1 von 5').waitFor();
  await rundgang.getByRole('button', { name: 'Überspringen' }).click();
  await rundgang.waitFor({ state: 'detached' });
});

rauchtest('Abmelden', { als: LENA }, async (s) => {
  await s.goto(BASIS + '/ablage/start');
  await s.getByText('Hallo Lena! Hier fängst du an.').waitFor();
  const menue = await benutzermenue(s, LENA);
  await menue.getByRole('button', { name: 'Abmelden' }).click();
  await s.getByRole('heading', { name: 'Anmelden' }).waitFor();
  // Die Sitzung ist wirklich weg: Die Ablage führt wieder zur Anmeldung.
  await s.goto(BASIS + '/ablage/start');
  await s.getByRole('heading', { name: 'Anmelden' }).waitFor();
});

/* ---------- Handy ---------- */

rauchtest('Handy: Anmelden und Startseite', { handy: true }, async (s) => {
  await s.goto(BASIS + '/');
  await s.getByLabel('E-Mail-Adresse').fill(LENA.email);
  await s.getByLabel('Passwort', { exact: true }).fill(LENA.passwort);
  await s.getByRole('button', { name: 'Anmelden' }).click();
  await s.waitForURL(/\/ablage\/start$/);
  // Am Handy: Ansicht oben als Auswahl, Startseite einspaltig mit „Post fotografieren“.
  await s.getByRole('heading', { name: /^Start/, level: 1 }).waitFor();
  await s.getByRole('button', { name: /Post fotografieren/ }).waitFor();
  await s.getByRole('link', { name: /^Neue Post 2/ }).waitFor();
  await s.getByRole('button', { name: '+ Neu' }).waitFor();
  await keineWaagerechteRolle(s);
});

rauchtest('Handy: Neue Post öffnen', { handy: true, als: LENA }, async (s) => {
  await s.goto(BASIS + '/ablage/start');
  await s.getByRole('link', { name: /^Neue Post 2/ }).first().click();
  await s.locator(`a[href$="/${daten.briefHandy.id}"]`).click();
  // „Dokument übernehmen“ (#934): bis zur mobilen Fassung alles in einer Spalte untereinander.
  await s.waitForURL(/\/uebernehmen$/);
  await s.getByRole('heading', { name: 'Beitragsrechnung Hausrat 2027' }).waitFor();
  await s.getByRole('combobox', { name: 'Wohin gehört das?' }).waitFor();
  await keineWaagerechteRolle(s);
});

rauchtest('Handy: Suche', { handy: true, als: LENA }, async (s) => {
  await s.goto(BASIS + '/ablage/start');
  await s.getByRole('searchbox', { name: 'Alle Mappen durchsuchen' }).fill('Stromvertrag');
  await s.getByRole('link', { name: 'Stromvertrag Haus' }).click();
  await s.getByRole('heading', { name: 'Stromvertrag Haus', level: 1 }).waitFor();
  await keineWaagerechteRolle(s);
});

// #935: „+ … anlegen“ öffnet am Handy dasselbe Fenster – unten, so breit wie der Bildschirm; Esc schließt es.
rauchtest('Handy: Fenster „+ … anlegen“ passt auf den Bildschirm (#935)', { handy: true, als: LENA }, async (s) => {
  const typen = (await api('GET', '/api/typen', { cookie: await sitzung(LENA) })).daten;
  await s.goto(BASIS + `/ablage/${typen.find((x) => x.name === 'Rechnung').id}/neu`);
  const feld = s.locator('[data-anker="mappe.feld:aussteller"]');
  await feld.getByRole('button', { name: '+ Vertragspartner anlegen' }).click();
  const fenster = s.getByRole('dialog', { name: 'Vertragspartner anlegen' });
  await fenster.getByRole('textbox', { name: 'Name*' }).waitFor();
  const box = await fenster.boundingBox();
  assert.ok(box && box.x >= 0 && box.x + box.width <= 390, `Fenster breiter als der Bildschirm (${JSON.stringify(box)})`);
  await keineWaagerechteRolle(s);
  await s.keyboard.press('Escape');
  await fenster.waitFor({ state: 'detached' });
});

/* ---------- Zum Schluss: Wege, die den gemeinsamen Zustand ändern ---------- */

/** Eigene Post für einen Test am Ende: Briefe als PDFs mit einer Zeile Text (die Textebene liest Ablago selbst). */
async function eigenePost(betreff, zeilen = [betreff]) {
  const cookie = await sitzung(LENA);
  const brief = (await api('POST', '/api/post', { cookie, body: { betreff } })).daten;
  for (const z of zeilen) await api('POST', `/api/mappen/${brief.id}/dokumente?register=dokumente&name=${encodeURIComponent(`${z.split('\n')[0]}.pdf`)}&typ=application/pdf`, { cookie, body: beispielPdf(z), roh: true });
  return brief;
}

rauchtest('Dokument übernehmen: Typ erkannt, Folgedokument abtrennen (#934)', { als: LENA }, async (s) => {
  // Steht am Ende: legt Post an und trennt ein Dokument als neue Post ab.
  const brief = await eigenePost('Werkstatt Kfz', ['Rechnung Werkstatt Beispiel 2027', 'Vertrag Leasing Kombi Beispiel 2027']);
  await s.goto(BASIS + `/ablage/eingang/${brief.id}`);
  // Auch von woanders geöffnet: weiter auf die Seite, unter „Neue Post“.
  await s.waitForURL(new RegExp(`/${brief.id}/uebernehmen$`));
  const mappe = s.getByRole('region', { name: 'Mappe' });
  // „Rechnung“ steht als Überschrift im ersten Dokument: vorgeschlagen, mit Grund.
  await mappe.getByText(/^Vorschlag, weil „Rechnung“ im Dokument steht/).waitFor();
  // Klassifizierung mehrstufig (#939): ein Vorschlag mit Sicherheit und den Belegen der Wege.
  await mappe.getByText(/^Vorschlag \(\d+ %\) – woran Ablago das erkennt:$/).waitFor();
  await mappe.getByText('Eingegangene Rechnung, gehört zu einem Vertrag oder steht für sich').waitFor();
  // Das zweite Dokument passt eher zu „Vertrag“: abtrennen.
  const dokument = s.getByRole('region', { name: 'Dokument' });
  await dokument.getByText('„Vertrag Leasing Kombi Beispiel 2027.pdf“ passt eher zu Vertrag.').waitFor();
  await dokument.getByRole('button', { name: 'Ab hier abtrennen und als neue Post in „Neue Post“ legen' }).click();
  await dokument.getByText('1 Dokument liegt jetzt als „Werkstatt Kfz (abgetrennt)“ in „Neue Post“.').waitFor();
  await dokument.getByRole('article', { name: 'Vertrag Leasing Kombi Beispiel 2027.pdf' }).waitFor({ state: 'detached' });
  // Text markieren (Textebene): Das zuletzt gewählte Feld übernimmt ihn.
  await mappe.getByRole('textbox', { name: 'Rechnungsnummer*' }).click();
  const woerter = dokument.locator('.ue-wort');
  await woerter.nth(1).hover();
  await s.mouse.down();
  await woerter.nth(2).hover();
  await s.mouse.up();
  await s.waitForFunction(() => document.querySelector('#feld-rechnungsnummer')?.value === 'Werkstatt Beispiel');
  await dokument.getByText('„Werkstatt Beispiel“ steht jetzt in „Rechnungsnummer“.').waitFor();
});

rauchtest('Neue Post: Mappentyp wählen, ausfüllen, speichern – die Post wird zur Mappe (#936, #934)', { als: LENA }, async (s) => {
  const betreff = 'Schornsteinfeger 2027';
  const brief = await eigenePost(betreff);
  await s.goto(BASIS + `/ablage/start`);
  await s.getByRole('link', { name: /^Neue Post \d/ }).first().click();
  await s.getByRole('region', { name: 'Mappen' }).locator(`a[href$="/${brief.id}"]`).click();
  await s.waitForURL(new RegExp(`/${brief.id}/uebernehmen$`));
  const mappe = s.getByRole('region', { name: 'Mappe' });
  await mappe.getByRole('combobox', { name: 'Wohin gehört das?' }).click();
  await mappe.getByRole('option', { name: /^Vertragspartner/ }).click();
  await mappe.getByText('Beim Speichern wandern Dokumente und Historie der Post hierher, die Post kommt in den Papierkorb.').waitFor();
  await mappe.getByRole('tab', { name: 'Stammdaten' }).click();
  await mappe.getByRole('textbox', { name: 'Name*' }).fill('Schornsteinfeger Beispiel');
  await mappe.getByRole('heading', { name: 'Schornsteinfeger Beispiel', level: 1 }).waitFor();
  await mappe.getByRole('button', { name: 'Mappe speichern' }).click();
  // Danach die nächste Post aus „Neue Post“ auf derselben Seite, oben mit Link zur neuen Mappe.
  await mappe.getByText(/ist angelegt, Dokumente und Historie der Post liegen dort/).waitFor();
  await s.waitForURL((u) => u.pathname.endsWith('/uebernehmen') && !u.pathname.includes(brief.id));
  await mappe.getByRole('link', { name: 'Schornsteinfeger Beispiel' }).click();
  await mappe.getByRole('heading', { name: 'Schornsteinfeger Beispiel', level: 1 }).waitFor();
  await mappe.getByRole('tab', { name: 'Dokumente 1' }).waitFor();
  // Die Post liegt im Papierkorb – aufgelöst, mit Link zur Mappe, ohne „Wiederherstellen“.
  await s.goto(BASIS + `/ablage/papierkorb/${brief.id}`);
  await s.getByText(/^Aufgelöst in Vertragspartner „Schornsteinfeger Beispiel“\. Dokumente und Historie liegen dort/).waitFor();
  await s.getByRole('link', { name: 'Schornsteinfeger Beispiel' }).first().waitFor();
  assert.equal(await s.getByRole('button', { name: 'Wiederherstellen' }).count(), 0);
});

rauchtest('Dokument übernehmen: in eine vorhandene Mappe legen, auch dann wird die Post aufgelöst (#934)', { als: LENA }, async (s) => {
  await s.goto(BASIS + `/ablage/start`);
  await s.getByRole('link', { name: /^Neue Post \d/ }).first().click();
  await s.getByRole('region', { name: 'Mappen' }).locator(`a[href$="/${daten.brief.id}"]`).click();
  await s.waitForURL(/\/uebernehmen$/);
  const mappe = s.getByRole('region', { name: 'Mappe' });
  await mappe.getByRole('combobox', { name: 'Wohin gehört das?' }).click();
  await mappe.getByRole('option', { name: /^Vertrag Laufender Vertrag/ }).click();
  await mappe.getByRole('button', { name: 'In eine vorhandene Mappe „Vertrag“ legen …' }).click();
  await mappe.getByPlaceholder('Vertrag suchen …').fill('Stromvertrag');
  await mappe.getByRole('option', { name: 'Stromvertrag Haus' }).click();
  await mappe.getByText('Dokumente und Historie der Post wandern dorthin, die Post kommt in den Papierkorb.').waitFor();
  await mappe.getByRole('button', { name: 'Zu „Stromvertrag Haus“ legen' }).click();
  // Weiter mit der nächsten Post; oben der Link zum Vertrag.
  await mappe.getByText(/^Die Post liegt jetzt in Vertrag „Stromvertrag Haus“/).waitFor();
  await mappe.getByRole('link', { name: 'Stromvertrag Haus' }).click();
  await mappe.getByRole('heading', { name: 'Stromvertrag Haus', level: 1 }).waitFor();
  await mappe.getByRole('tab', { name: 'Vertragsunterlagen 1' }).waitFor();
  await s.goto(BASIS + `/ablage/papierkorb/${daten.brief.id}`);
  await s.getByText(/^Aufgelöst in Vertrag „Stromvertrag Haus“\. Dokumente und Historie liegen dort/).waitFor();
});

// #935: Steht am Ende – legt einen Vertragspartner an. Die Mappe dahinter (aus der Post) bleibt ungespeichert offen.
rauchtest('Verweisfeld: „+ … anlegen“ im Fenster, mit Werten vom Dokument (#935)', { als: LENA }, async (s) => {
  const brief = await eigenePost('Heizungsbau Rechnung', ['Rechnung R-2027-55\nHeizungsbau Muster KG · Musterweg 1 · 01234 Musterstadt\nKundennummer K-4711']);
  await s.goto(BASIS + `/ablage/eingang/${brief.id}`);
  await s.waitForURL(new RegExp(`/${brief.id}/uebernehmen$`));
  const mappe = s.getByRole('region', { name: 'Mappe' });
  const dokument = s.getByRole('region', { name: 'Dokument' });
  await mappe.getByText(/^Vorschlag, weil „Rechnung“ im Dokument steht/).waitFor();
  await dokument.getByRole('img', { name: 'Seite 1' }).waitFor();
  const aussteller = mappe.locator('[data-anker="mappe.feld:aussteller"]');
  const anlegen = aussteller.getByRole('button', { name: '+ Vertragspartner anlegen' });
  // Abbrechen und Esc schließen ohne Änderung; danach steht der Fokus wieder am Verweisfeld.
  await anlegen.click();
  const fenster = s.getByRole('dialog', { name: 'Vertragspartner anlegen' });
  await fenster.getByRole('button', { name: 'Abbrechen' }).click();
  await fenster.waitFor({ state: 'detached' });
  await anlegen.click();
  await fenster.getByRole('textbox', { name: 'Name*' }).waitFor();
  await s.waitForFunction(() => document.activeElement?.closest('[role="dialog"]'));
  await s.keyboard.press('Escape');
  await fenster.waitFor({ state: 'detached' });
  await s.waitForFunction(() => document.activeElement?.textContent === '+ Vertragspartner anlegen');
  // Wie die rechte Spalte einer Mappe: Kopf, Register, Felder, Speicherleiste – vorausgefüllt mit dem Briefkopf.
  await anlegen.click();
  await fenster.getByText('Neue Mappe').or(fenster.getByText('Heizungsbau Muster KG', { exact: true })).first().waitFor();
  await fenster.getByRole('tab', { name: 'Stammdaten' }).waitFor();
  await fenster.getByRole('button', { name: 'Mappe speichern' }).waitFor();
  const name = fenster.getByRole('textbox', { name: 'Name*' });
  if (!(await name.inputValue())) await name.fill('Heizungsbau Muster KG');
  // Anklicken vom Dokument geht auch im Fenster: Feld wählen, Text markieren – er landet im Fenster.
  await fenster.getByRole('textbox', { name: 'Kundennummer' }).click();
  const wort = dokument.locator('.ue-wort').last();
  await wort.hover();
  await s.mouse.down();
  await s.mouse.up();
  await s.waitForFunction(() => document.querySelector('[role="dialog"] #feld-kundennummer')?.value === 'K-4711');
  await fenster.getByRole('button', { name: 'Mappe speichern' }).click();
  await fenster.waitFor({ state: 'detached' });
  // Im Feld steht die neue Mappe, mit kurzer Bestätigung; die Mappe dahinter ist noch nicht gespeichert.
  await aussteller.getByRole('link', { name: 'Heizungsbau Muster KG' }).waitFor();
  await aussteller.getByText('„Heizungsbau Muster KG“ angelegt und eingetragen.').waitFor();
  assert.match(s.url(), new RegExp(`/${brief.id}/uebernehmen$`));
  await mappe.getByText('Beim Speichern wandern Dokumente und Historie der Post hierher, die Post kommt in den Papierkorb.').waitFor();
});

// #886, #887: Steht am Ende – stellt im Mappentyp Rechnung ein, dass der Aussteller aus dem Vertrag folgt, und legt eine Rechnung an.
rauchtest('Verweisfeld folgt aus einem anderen; passt es nicht, sagt die Mappe womit (#886, #887)', { als: LENA }, async (s) => {
  // Im Mappentyp-Editor: Aussteller → „Folgt aus“ Vertrag, Angabe Vertragspartner.
  await s.goto(BASIS + '/ablage/start');
  await verwalten(s);
  await s.getByRole('complementary', { name: 'Bereiche' }).getByRole('link', { name: /^Mappentypen/ }).click();
  await s.getByRole('link', { name: /^Rechnung \d+ Felder/ }).click();
  const bearbeitung = s.getByRole('region', { name: 'Bearbeitung' });
  await bearbeitung.getByRole('heading', { name: 'Rechnung', level: 1 }).waitFor();
  const felder = bearbeitung.getByRole('region', { name: 'Felder' });
  await felder.getByRole('button', { name: 'Felder' }).click();
  await felder.getByRole('button', { name: /^Aussteller aussteller/ }).click();
  await felder.getByLabel('Folgt aus').selectOption({ label: 'Vertrag' });
  assert.equal(await felder.getByLabel('Angabe aus „Vertrag“').inputValue(), 'vertragspartner');
  await bearbeitung.getByRole('button', { name: 'Mappentyp speichern' }).click();
  await bearbeitung.getByRole('button', { name: 'Mappentyp speichern', disabled: true }).waitFor();
  await felder.getByText('folgt aus Vertrag').waitFor();
  await s.getByRole('button', { name: 'Verwaltung beenden' }).click();
  await s.getByRole('region', { name: 'Du verwaltest gerade Ablago.' }).waitFor({ state: 'detached' });
  const rechnung = (await api('GET', '/api/typen', { cookie: await sitzung(LENA) })).daten.find((x) => x.name === 'Rechnung');
  assert.deepEqual(rechnung.felder.find((f) => f.key === 'aussteller').folgtAus, { feld: 'vertrag', zielFeld: 'vertragspartner' });
  await s.goto(BASIS + `/ablage/${rechnung.id}/neu`);
  const mappe = s.getByRole('region', { name: 'Mappe' });
  await mappe.getByRole('heading', { name: 'Neue Mappe', level: 1 }).waitFor();
  await mappe.getByRole('textbox', { name: 'Rechnungsnummer*' }).fill('R-2027-88');
  await mappe.getByLabel('Rechnungsdatum*').fill('2027-01-15');
  await mappe.getByRole('textbox', { name: 'Rechnungsbetrag*' }).fill('120,00');
  // Vertrag gewählt → der Aussteller füllt sich und ist markiert.
  const vertrag = mappe.locator('[data-anker="mappe.feld:vertrag"]');
  await vertrag.getByRole('combobox').fill('Wartungsvertrag');
  await vertrag.getByRole('option', { name: 'Wartungsvertrag Heizung' }).click();
  const aussteller = mappe.locator('[data-anker="mappe.feld:aussteller"]');
  await aussteller.getByRole('link', { name: 'Heizungsbau Beispiel GmbH' }).waitFor();
  await aussteller.getByText('aus Vertrag').waitFor();
  // Von Hand etwas anderes: keine Sperre, aber die Frage, ob der Vertrag geleert werden soll – „Behalten“.
  await aussteller.getByRole('button', { name: 'Ändern' }).click();
  await aussteller.getByRole('combobox').fill('Stadtwerke');
  await aussteller.getByRole('option', { name: 'Stadtwerke Musterstadt' }).click();
  const frage = s.getByRole('alertdialog', { name: 'Vertrag leeren?' });
  await frage.getByText('Vertrag „Wartungsvertrag Heizung“ gehört zu „Heizungsbau Beispiel GmbH“, nicht zu „Stadtwerke Musterstadt“.').waitFor();
  await frage.getByRole('button', { name: 'Behalten' }).click();
  // Gelb am Feld, mit dem Grund statt „Filter“; Speichern geht trotzdem.
  await vertrag.getByText('passt nicht zu „Aussteller“').waitFor();
  await mappe.getByRole('button', { name: 'Mappe speichern' }).click();
  await mappe.getByRole('heading', { name: /^R-2027-88/, level: 1 }).waitFor();
  // Über den Registern die Zeile; ein Klick springt ins Register zum Feld.
  await mappe.getByRole('button', { name: 'Achtung: Vertrag passt nicht zu „Aussteller“.' }).click();
  await s.waitForFunction(() => document.activeElement?.closest('[data-anker="mappe.feld:vertrag"]'));
});

/* ---------- Bausteine (#967) ---------- */

// Musterseite (nur im Testbau, VITE_MUSTER=1): hell und dunkel, Desktop und Handy fotografieren, mit axe-core prüfen –
// ohne Verstoß, ohne Fehler im Browser. Braucht keine Einrichtung und keine Daten.
test('Musterseite der Bausteine: Bilder, axe ohne Verstoß (#967)', { timeout: 120_000 }, async () => {
  await warteAufAblago();
  await mkdir(MUSTERORDNER, { recursive: true });
  const fehler = [];
  const beobachte = (k) => {
    k.on('console', (m) => { if (m.type() === 'error') fehler.push(`Konsole: ${m.text()}`); });
    k.on('weberror', (e) => fehler.push(`Fehler in der Seite: ${e.error().message}`));
  };
  const { bilder, verstoesse } = await musterAufnehmen(browser, { basis: BASIS, ziel: MUSTERORDNER, beobachte });
  assert.equal(bilder.length, 10, `Bilder der Musterseite: ${bilder.join(', ')}`);
  assert.deepEqual(verstoesse, [], `axe meldet Verstöße auf der Musterseite:\n${verstoesse.join('\n')}`);
  assert.deepEqual(fehler, [], 'Fehler im Browser auf der Musterseite');
});

// Baustein Knopf (#968, #1011): Ein asynchroner Handler zeigt „läuft“ (aria-busy, Breite bleibt), danach das Ergebnis
// unter dem Knopf; ein Fehler landet am Knopf statt in der Konsole.
test('Baustein Knopf: läuft, Ergebnis und Fehler am Knopf (#968)', { timeout: 60_000 }, async () => {
  await warteAufAblago();
  const k = await browser.newContext({ ...DESKTOP, locale: 'de-DE' });
  const fehler = [];
  k.on('weberror', (e) => fehler.push(`Fehler in der Seite: ${e.error().message}`));
  try {
    const s = await k.newPage();
    await s.goto(BASIS + '/muster#knopf');
    const karte = s.locator('[data-zustand="knopf-ausprobieren"]');
    const pruefen = karte.getByRole('button', { name: 'Jetzt prüfen' });
    const breite = (await pruefen.boundingBox()).width;
    await pruefen.click();
    await karte.locator('button[aria-busy="true"]').waitFor();
    assert.equal(Math.round((await pruefen.boundingBox()).width), Math.round(breite), 'Der Knopf behält beim Laufen seine Breite');
    await pruefen.click({ force: true }); // zweiter Klick während „läuft“: darf nichts auslösen
    const gut = karte.locator('[role="status"][data-ergebnis="gut"]');
    await gut.waitFor();
    assert.equal(await karte.locator('[role="status"][data-ergebnis]').count(), 1, 'Ein Klick, ein Ergebnis');
    await karte.getByRole('button', { name: 'Verbindung testen' }).click();
    await karte.locator('[role="status"][data-ergebnis="schlecht"]').getByText('Der Server antwortet nicht').waitFor();
  } finally {
    await k.close();
  }
  assert.deepEqual(fehler, [], 'Fehler im Browser beim Knopf');
});

/* ---------- Knöpfe in Listen und Ergebnisse am Knopf (#989, #986) ---------- */

/**
 * Anlege-Knöpfe auf der Seite (#989): sichtbare Knöpfe und Wege, deren Text mit „+ Neu“ beginnt, und alles mit
 * data-knopf="anlegen". Rückgabe: Texte aller gefundenen und die ohne Knopfart „Anlegen“.
 */
async function anlegeKnoepfe(s) {
  return s.evaluate(() => {
    const sichtbar = (el) => el.getClientRects().length > 0;
    const text = (el) => el.textContent.replace(/\s+/g, ' ').trim();
    const alle = [...document.querySelectorAll('a, button, summary, [data-knopf="anlegen"]')].filter(sichtbar)
      .filter((el) => el.dataset.knopf === 'anlegen' || /^\+ ?Neu/.test(text(el)));
    return { alle: alle.map(text), ohneArt: alle.filter((el) => el.dataset.knopf !== 'anlegen').map(text) };
  });
}

rauchtest('„+ Neu“ in Listen: überall Knopfart „Anlegen“ (#989)', { als: LENA }, async (s) => {
  const gefunden = [];
  const ohneArt = [];
  const pruefe = async (pfad) => {
    const r = await anlegeKnoepfe(s);
    gefunden.push(...r.alle.map((x) => `${pfad}: ${x}`));
    ohneArt.push(...r.ohneArt.map((x) => `${pfad}: ${x}`));
  };
  // Ablage: eine Ansicht mit „+ Neu“ und das Menü „+ Neu“ oben.
  await s.goto(BASIS + '/ablage/start');
  await s.getByRole('complementary', { name: 'Ansichten' }).getByRole('link', { name: /^Vertrag \d/ }).click();
  await s.getByRole('region', { name: 'Mappen' }).getByRole('link', { name: '+ Neu' }).waitFor();
  await pruefe('Ablage → Vertrag');
  // Mein Konto: API-Schlüssel und Webhooks.
  for (const b of ['sicherheit', 'benachrichtigungen']) {
    await s.goto(BASIS + `/profil/${b}`);
    await s.getByRole('heading', { level: 1 }).first().waitFor();
    await s.waitForLoadState('networkidle');
    await pruefe(`Mein Konto → ${b}`);
  }
  // Werkbank: alle Listen mit „+ Neu“.
  await s.goto(BASIS + '/ablage/start');
  await verwalten(s);
  const elemente = s.getByRole('region', { name: 'Elemente' });
  for (const b of ['typen', 'sichten', 'benutzer', 'designs', 'automatisierungen', 'nummernkreise', 'postfaecher', 'auskuenfte', 'stempel']) {
    await s.goto(BASIS + `/werkbank/${b}`);
    await elemente.getByRole('heading', { level: 1 }).first().waitFor();
    await s.waitForLoadState('networkidle');
    await pruefe(`Werkbank → ${b}`);
  }
  assert.deepEqual(ohneArt, [], `Anlege-Knöpfe ohne Knopfart „Anlegen“:\n${ohneArt.join('\n')}`);
  // Die Erkennung selbst: In der Werkbank stehen mindestens Mappentypen, Ansichten, Benutzer und Designs.
  assert.ok(gefunden.filter((x) => x.startsWith('Werkbank')).length >= 4, `Zu wenige Anlege-Knöpfe gefunden: ${gefunden.join(' | ')}`);
  assert.ok(gefunden.some((x) => x.startsWith('Ablage')), 'Kein „+ Neu“ in der Ablage gefunden');
});

/* ---------- Seiten-Hilfe hinter der Überschrift (#985) ---------- */

/**
 * Hilfesymbole in den Seitenköpfen (#985): Texte der Köpfe (Beschreibung unter h1 bzw. Abschnitts-h2) enthalten kein
 * „?“ mehr – es steht direkt hinter der Überschrift. Rückgabe: Köpfe mit „?“ in der Überschrift und die mit „?“ im Text.
 */
async function kopfHilfen(s) {
  return s.evaluate(() => {
    const koepfe = [...document.querySelectorAll('.mappenkopf, .teilkopf, .listenkopf')].filter((k) => k.getClientRects().length > 0);
    const name = (k) => (k.querySelector('h1, h2')?.textContent ?? '').replace(/\s+/g, ' ').trim();
    return {
      inUeberschrift: koepfe.filter((k) => k.querySelector(':is(h1, h2) > .hilfesymbol')).map(name),
      imText: koepfe.filter((k) => [...k.querySelectorAll('.hilfesymbol')].some((h) => !h.parentElement?.matches('h1, h2'))).map(name),
    };
  });
}

// Alle Bereiche der Werkbank (shared/src/werkbankansicht.ts) und was die Leiste darüber hinaus zeigt, dazu Seiten, die
// erst beim Anlegen einen Kopf mit Beschreibung zeigen.
// Wiederherstellen (Abschnitt der Sicherung) antwortet außerhalb des Wartungsmodus mit 409 – das ist gewollt.
rauchtest('Werkbank: Hilfesymbol direkt hinter der Überschrift, nie im Text des Kopfs (#985)', { als: LENA, erwartet: [{ status: 409, pfad: /^\/api\/wiederherstellung\/sicherungen$/ }] }, async (s) => {
  await s.goto(BASIS + '/ablage/start');
  await verwalten(s);
  await s.waitForURL(/\/werkbank/);
  const bereiche = s.getByRole('complementary', { name: 'Bereiche' });
  await bereiche.getByRole('link').first().waitFor();
  const alle = ['pakete', 'typen', 'sichten', 'nummernkreise', 'automatisierungen', 'benutzer', 'verschluesselung', 'auskuenfte', 'loeschkonzept',
    'aufbewahrung', 'stempel', 'postfaecher', 'eingangsordner', 'webdav', 'webhooks', 'texterkennung', 'sicherung', 'vollexport', 'papierkorb',
    'betrieb', 'region', 'sprachen', 'aufgaben', 'anmeldeschutz', 'designs', 'anbindung', 'systemzustand', 'protokoll', 'fehlermeldungen', 'wartung', 'demo']
    .map((b) => `/werkbank/${b}`);
  const leiste = await bereiche.evaluate((b) => [...b.querySelectorAll('a[href^="/werkbank/"]')].map((a) => a.getAttribute('href').split(/[?#]/)[0]));
  const wege = [...new Set([...alle, ...leiste, '/werkbank/stempel/neu', '/werkbank/auskuenfte/neu'])];
  const imText = [];
  const mitHilfe = [];
  for (const weg of wege) {
    await s.goto(BASIS + weg);
    await s.getByRole('heading', { level: 1 }).first().waitFor();
    await s.waitForLoadState('networkidle');
    const r = await kopfHilfen(s);
    imText.push(...r.imText.map((x) => `${weg}: ${x}`));
    mitHilfe.push(...r.inUeberschrift.map((x) => `${weg}: ${x}`));
  }
  assert.deepEqual(imText, [], `Hilfesymbol im Text eines Seitenkopfs statt hinter der Überschrift:\n${imText.join('\n')}`);
  // Die Erkennung selbst: Eingangsordner, WebDAV, Webhooks und Stempel haben ihre Hilfe hinter der Überschrift.
  for (const weg of ['/werkbank/eingangsordner', '/werkbank/webdav', '/werkbank/webhooks', '/werkbank/stempel/neu']) {
    if (wege.includes(weg)) assert.ok(mitHilfe.some((x) => x.startsWith(`${weg}: `)), `Keine Hilfe hinter der Überschrift auf ${weg}: ${mitHilfe.join(' | ')}`);
  }
  assert.ok(wege.length >= 20, `Zu wenige Bereiche der Werkbank gefunden: ${wege.join(' ')}`);
});

// Eingangsordner (#986): „Jetzt prüfen“ steht unten im Block „Einstellungen“; das Ergebnis erscheint direkt unter dem
// Knopf – auch wenn die Seite dorthin gerollt ist –, nicht oben auf der Seite. Braucht einen Eingangsordner
// (DMS_EINGANG, im Workflow ein leerer Ordner).
rauchtest('Eingangsordner: „Jetzt prüfen“ – Ergebnis unter dem Knopf (#986)', { als: LENA }, async (s) => {
  await s.goto(BASIS + '/ablage/start');
  await verwalten(s);
  await s.goto(BASIS + '/werkbank/eingangsordner');
  const knopf = s.getByRole('button', { name: 'Jetzt prüfen' });
  await knopf.or(s.getByText('Es ist kein Eingangsordner eingebunden')).first().waitFor();
  assert.ok(await knopf.isVisible(), 'Kein Eingangsordner eingebunden – DMS_EINGANG auf einen vorhandenen Ordner setzen');
  await knopf.scrollIntoViewIfNeeded();
  const vorher = await s.evaluate(() => scrollY);
  await knopf.click();
  const ergebnis = s.locator('[role="status"][data-ergebnis]').filter({ hasText: /Geprüft|übernommen/ });
  await ergebnis.waitFor();
  const k = await knopf.boundingBox();
  const e = await ergebnis.boundingBox();
  assert.ok(e.y >= k.y + k.height - 1, `Ergebnis steht unter dem Knopf (Knopf unten ${k.y + k.height}, Ergebnis oben ${e.y})`);
  assert.ok(e.y - (k.y + k.height) < 80, 'Ergebnis steht direkt unter dem Knopf');
  assert.ok(e.y + e.height <= (s.viewportSize()?.height ?? 900) && e.y >= 0, 'Ergebnis ist zu sehen, ohne zu rollen');
  assert.ok(Math.abs((await s.evaluate(() => scrollY)) - vorher) < 200, 'Die Seite springt nicht');
  assert.equal(await s.locator('.einspaltig > .hinweis').filter({ hasText: /Geprüft – nichts/ }).count(), 0, 'Kein Ergebnis oben auf der Seite');
});

/* ---------- Dreiteilung fest im Fenster (#1063) ---------- */

/**
 * Die Dreiteilung steht fest im Fenster (#1063): Nur die Spalten rollen, nie die Seite unter ihnen. Rollt die rechte
 * Spalte ans Ende; dann ist die Seite genau so hoch wie das Fenster. Die rechte Spalte muss dafür länger sein als ihr
 * Platz – sonst prüft der Test nichts.
 */
async function dreiteilungSteht(s, wo) {
  const r = await s.evaluate(() => {
    const rechts = document.querySelector('.drei .spalte.mappe');
    rechts.scrollTop = rechts.scrollHeight;
    return { seite: document.scrollingElement.scrollHeight, fenster: innerHeight, spalte: rechts.scrollHeight, platz: rechts.clientHeight };
  });
  assert.ok(r.spalte > r.platz + 100, `${wo}: Die rechte Spalte ist nicht länger als ihr Platz (${r.spalte} / ${r.platz} px) – der Test prüft so nichts`);
  assert.equal(r.seite, r.fenster, `${wo}: Die Seite rollt unter der Dreiteilung weiter (Seite ${r.seite} px, Fenster ${r.fenster} px)`);
}

rauchtest('Ablage und Werkbank: Die Seite rollt nicht unter der Dreiteilung, versteckte Beschriftungen bleiben lesbar (#1063)', { als: LENA }, async (s) => {
  await s.setViewportSize({ width: 1366, height: 640 });
  const mappeOeffnen = async () => {
    await s.goto(BASIS + '/ablage/start');
    await s.getByRole('complementary', { name: 'Ansichten' }).getByRole('link', { name: /^Vertrag \d/ }).click();
    await s.getByRole('region', { name: 'Mappen' }).getByRole('link', { name: /Stromvertrag Haus/ }).first().click();
    await s.getByRole('region', { name: 'Mappe' }).getByRole('button', { name: 'Mappe speichern' }).waitFor();
    await s.waitForLoadState('networkidle');
  };
  // Ablage: eine Mappe rechts, ohne und mit Verwaltungsmodus (roter Balken oben).
  await mappeOeffnen();
  await dreiteilungSteht(s, 'Ablage → Mappe');
  await verwalten(s);
  await mappeOeffnen();
  await s.getByRole('region', { name: 'Du verwaltest gerade Ablago.' }).waitFor();
  await dreiteilungSteht(s, 'Ablage → Mappe im Verwaltungsmodus');
  // Werkbank → Automatisierungen: In „Ausprobieren“ steht die versteckte Beschriftung „Mappe suchen …“.
  await s.goto(BASIS + '/werkbank/automatisierungen');
  await s.getByRole('region', { name: 'Elemente' }).getByRole('link', { name: /Rauchtest Vertrag angelegt/ }).click();
  const bearbeitung = s.getByRole('region', { name: 'Bearbeitung' });
  const suche = bearbeitung.getByLabel('Mappe suchen …');
  await suche.waitFor();
  await s.waitForLoadState('networkidle');
  await dreiteilungSteht(s, 'Werkbank → Automatisierung');
  // Gegenprobe: Die Beschriftungen bleiben unsichtbar, aber im Barrierefreiheitsbaum – auch die der Marke oben.
  const beschriftung = bearbeitung.locator('label[for="ausprobieren-mappe"]');
  const kasten = await beschriftung.boundingBox();
  assert.ok(kasten && kasten.width <= 1 && kasten.height <= 1, `Die Beschriftung „Mappe suchen …“ ist zu sehen (${JSON.stringify(kasten)})`);
  assert.equal(await suche.count(), 1, 'Das Suchfeld ist über seine versteckte Beschriftung zu finden');
  await s.getByRole('banner').getByRole('link', { name: /– Startseite$/ }).waitFor();
});

/* ---------- Hilfen ---------- */

/** Am Handy darf die Seite nicht waagerecht rollen (die genaue Prüfung je Element macht mobil-pruefen.mjs). */
async function keineWaagerechteRolle(s) {
  const { breit, sicht } = await s.evaluate(() => ({ breit: document.documentElement.scrollWidth, sicht: document.documentElement.clientWidth }));
  assert.ok(breit <= sicht, `Die Seite ist am Handy breiter als der Bildschirm (${breit} > ${sicht} px)`);
}
