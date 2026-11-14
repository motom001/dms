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
import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test, after, before } from 'node:test';
import { chromium } from 'playwright';
import { axePruefen, musterAufnehmen, tippflaechenPruefen } from './muster.mjs';

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

/* ---------- Knöpfe auf jeder besuchten Seite (#1210) ---------- */

/**
 * Wächter für die Leitsätze der Knöpfe (#1210), läuft in jeder Seite jedes Rauchtests (addInitScript): Nach jeder
 * Änderung im Dokument prüft er die sichtbaren Knöpfe und meldet Funde einmal je Seite an den Test (`__knopfFund`):
 *   - anlegen-ohne-plus: `data-knopf="anlegen"`, dessen Beschriftung nicht mit „+“ beginnt (Leitsatz 2);
 *   - gefahr-ohne-rueckfrage: `data-knopf="gefahr"`, der keine Rückfrage öffnet (`aria-haspopup="dialog"`) und nicht
 *     gesperrt ist (Leitsatz 5);
 *   - rot-ausserhalb-rueckfrage: rot gefüllt (`.knopf.gefahr`, `data-knopf="entscheidung"`) außerhalb des Fensters
 *     einer Rückfrage (Leitsatz 5).
 */
function knopfWaechter() {
  const gemeldet = new Set();
  const sichtbar = (el) => el.getClientRects().length > 0;
  const text = (el) => (el.textContent || el.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim();
  const pruefe = () => {
    const funde = [];
    for (const el of document.querySelectorAll('[data-knopf="anlegen"]')) if (sichtbar(el) && !text(el).startsWith('+')) funde.push(['anlegen-ohne-plus', el]);
    for (const el of document.querySelectorAll('[data-knopf="gefahr"]')) {
      const gesperrt = el.disabled || el.getAttribute('aria-disabled') === 'true';
      if (sichtbar(el) && !gesperrt && el.getAttribute('aria-haspopup') !== 'dialog') funde.push(['gefahr-ohne-rueckfrage', el]);
    }
    for (const el of document.querySelectorAll('.knopf.gefahr, [data-knopf="entscheidung"]')) if (sichtbar(el) && !el.closest('dialog.rueckfrage')) funde.push(['rot-ausserhalb-rueckfrage', el]);
    for (const [art, el] of funde) {
      const f = { art, text: text(el), pfad: location.pathname };
      const schluessel = `${f.art}|${f.text}|${f.pfad}`;
      if (gemeldet.has(schluessel)) continue;
      gemeldet.add(schluessel);
      window.__knopfFund?.(f);
    }
  };
  let geplant = 0;
  const plane = () => { if (!geplant) geplant = setTimeout(() => { geplant = 0; pruefe(); }, 120); };
  new MutationObserver(plane).observe(document, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['data-knopf', 'class', 'aria-haspopup', 'aria-disabled', 'disabled', 'hidden', 'open'] });
}

/**
 * Bekannter Bestand (#1210): Knöpfe, die die Leitsätze noch nicht erfüllen und in den Bereichs-Issues umgestellt
 * werden. Jeder Eintrag nennt sein Issue; wer eine Stelle umstellt, nimmt ihren Eintrag heraus. Neue Funde lassen den
 * Rauchtest scheitern. `text` und `pfad` sind reguläre Ausdrücke.
 */
const KNOPF_AUSNAHMEN = [];
const knopfAusnahme = (f) => KNOPF_AUSNAHMEN.find((a) => a.art === f.art && a.text.test(f.text) && (!a.pfad || a.pfad.test(f.pfad)));
const genutzteAusnahmen = new Set();
after(() => {
  const ungenutzt = KNOPF_AUSNAHMEN.filter((a) => !genutzteAusnahmen.has(a));
  if (ungenutzt.length) console.log(`# Knopf-Ausnahmen ohne Fund (#1210) – wenn umgestellt, bitte herausnehmen: ${ungenutzt.map((a) => `${a.art} ${a.text} (${a.issue})`).join('; ')}`);
});

/* ---------- Rahmen für einen Rauchtest ---------- */

/**
 * Ein Rauchtest: eigener Browser-Kontext (Desktop oder Handy), auf Wunsch schon angemeldet. Sammelt Fehler der
 * Konsole und der Seite, fehlgeschlagene Anfragen und Antworten ab 400; am Ende muss die Liste leer sein.
 *
 * optionen.erwartet: Antworten, die zu diesem Weg gehören – je { status, pfad: RegExp }.
 * optionen.neustart: Pfade, bei denen eine abgelehnte Verbindung erwartet ist, weil Ablago gerade neu startet.
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
    k.on('requestfailed', (r) => {
      const text = r.failure()?.errorText;
      if (text === 'net::ERR_ABORTED') return;
      // Während eines erwarteten Neustarts lauscht kurz niemand auf dem Port (optionen.neustart: Pfade, z. B. der Status).
      if (text === 'net::ERR_CONNECTION_REFUSED' && (optionen.neustart ?? []).some((p) => p.test(new URL(r.url()).pathname))) return;
      fehler.push(`Anfrage fehlgeschlagen: ${r.method()} ${r.url()} (${r.failure()?.errorText})`);
    });
    k.on('response', (r) => {
      if (r.status() < 400 || !r.url().startsWith(BASIS)) return;
      const pfad = new URL(r.url()).pathname;
      if (erwartet.some((e) => e.status === r.status() && e.pfad.test(pfad))) return;
      fehler.push(`Antwort ${r.status()}: ${r.request().method()} ${pfad}`);
    });
    // Leitsätze der Knöpfe (#1210) auf jeder Seite dieses Wegs.
    await k.exposeBinding('__knopfFund', (_quelle, f) => {
      const a = knopfAusnahme(f);
      if (a) genutzteAusnahmen.add(a); else fehler.push(`Knopf (#1210): ${f.art} „${f.text}“ auf ${f.pfad}`);
    });
    await k.addInitScript(knopfWaechter);
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

/** Das Benutzermenü oben rechts öffnen (Knopf mit dem eigenen Namen); seit #1215 ein Aufklapper ohne role="menu". */
async function benutzermenue(s, person) {
  await s.getByRole('banner').getByRole('button', { name: person.name }).click();
  return s.locator('.benutzermenue .menue');
}

/* ---------- Einrichtung und Daten ---------- */

rauchtest('Einrichtung: Assistent im Browser', {
  einrichtung: true,
  // Nach „Übernehmen und weiter“ startet Ablago mit der Datenbank neu; bis dahin antwortet der Status mit 503.
  erwartet: [{ status: 503, pfad: /^\/api\/konto\/status$/ }],
  // … und zwischen Beenden und Start lehnt der Port die Verbindung kurz ab.
  neustart: [/^\/api\/konto\/status$/],
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
  await s.getByLabel('Passwort', { exact: true }).fill(LENA.passwort);
  await s.getByLabel('Passwort wiederholen').fill(LENA.passwort);
  await assistentAxe(s, 'Dein Konto');
  await s.getByRole('button', { name: 'Weiter' }).click();
  // Wofür nutzt du Ablago? (#1045) – Lena: zu Hause.
  await s.getByRole('heading', { name: 'Wofür nutzt du Ablago?' }).waitFor();
  await s.getByRole('radio', { name: /^Für zu Hause/ }).check();
  await s.getByRole('button', { name: 'Weiter' }).click();
  // Pakete: ohne Internet nur ein Hinweis – die Rauchtests brauchen keine Pakete.
  await s.getByRole('heading', { name: 'Pakete dazuholen' }).waitFor();
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
  await s.getByRole('region', { name: /Zwei-Faktor/ }).getByRole('button', { name: 'Später' }).click();
  await s.getByRole('region', { name: /Passkey/ }).getByRole('button', { name: 'Jetzt hinzufügen' }).waitFor();
  await assistentAxe(s, 'Abschluss');
  await s.getByRole('button', { name: 'Einrichtung abschließen' }).click();
  await s.waitForURL(/\/werkbank/);
  const sitzungscookie = (await k.cookies()).find((c) => c.name === 'dms_sitzung');
  assert.ok(sitzungscookie, 'Nach der Einrichtung keine Sitzung im Browser');
  await vorbereiten(`${sitzungscookie.name}=${sitzungscookie.value}`);
  bereit = true;
  assert.deepEqual(ASSISTENT_FUNDE, [], `axe meldet Verstöße im Assistenten (#1215):\n${ASSISTENT_FUNDE.join('\n')}`);
});

/**
 * Assistent aus Bausteinen (#1215): axe auf der Karte des Assistenten, hell und dunkel. Die Funde sammelt der Test und
 * meldet sie am Ende – so läuft die Einrichtung trotzdem durch und die übrigen Rauchtests bleiben möglich.
 */
const ASSISTENT_FUNDE = [];
async function assistentAxe(s, schritt) {
  for (const schema of ['light', 'dark']) {
    await s.emulateMedia({ colorScheme: schema });
    // Knöpfe wechseln ihre Fläche mit einem kurzen Übergang – erst danach messen.
    await s.waitForTimeout(400);
    for (const v of await axePruefen(s, ['.karte.assistent'])) ASSISTENT_FUNDE.push(`${schritt} (${schema}): ${v}`);
  }
  await s.emulateMedia({ colorScheme: 'light' });
}

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
  // Feldart Tabelle (#1030): Auftrag mit Positionen – eigene Typen, damit die Beispiele unverändert bleiben.
  daten.tabelle = await tabellenDaten(cookie);
  // Beim Auswählen übernehmen (#1037): Tarifart mit üblichen Angaben, Abo übernimmt sie.
  daten.vorbelegen = await vorbelegenDaten(cookie);
  // Archivmodus „Ist der Stichtag leer: läuft noch nicht ab“ (#1051): ein laufender und ein beendeter Mietvertrag.
  daten.archiv = await archivDaten(cookie);
  // Datum vorschlagen (#1180): eigener Typ ohne Ansicht.
  daten.vorschlag = await vorschlagDaten(cookie);
  // Ablage aus Bausteinen (#1211, #1212): ein Mappentyp ohne Archivmodus, damit Löschen in den Papierkorb geht.
  daten.bausteine = (await api('POST', '/api/typen', { cookie, body: { name: 'Kellerraum', schluessel: 'kellerraum', titelVorlage: '{objekt}',
    felder: [{ key: 'objekt', label: 'Objekt', typ: 'text', pflicht: true }, { key: 'notiz', label: 'Notiz', typ: 'langtext' }, { key: 'seit', label: 'Seit', typ: 'datum' }] } })).daten;
  const einladung = (await api('POST', '/api/benutzer',{ cookie, body: { email: JONAS.email, name: JONAS.name, rolle: 'mitglied', rollen: [] } })).daten;
  await api('POST', '/api/konto/passwort-setzen', { body: { schluessel: einladung.link.split('/passwort/')[1], passwort: JONAS.passwort } });
}

/** Typen „Auftrag“ mit Tabelle „Positionen“ und „Auftragsposition“, ein Auftrag mit zwei Positionen (#1030). */
async function tabellenDaten(cookie) {
  const auftrag = (await api('POST', '/api/typen', { cookie, body: { name: 'Auftrag', schluessel: 'auftrag', titelVorlage: '{nr}', felder: [{ key: 'nr', label: 'Auftragsnummer', typ: 'text', pflicht: true }] } })).daten;
  // Ist Teil einer anderen Mappe (#1031): Positionen erscheinen nur am Auftrag.
  const position = (await api('POST', '/api/typen', { cookie, body: { name: 'Auftragsposition', schluessel: 'auftragsposition', titelVorlage: '{nr}. {beschreibung}', teilVon: 'auftrag', trefferliste: ['nr', 'beschreibung', 'menge', 'preis'], felder: [
    { key: 'auftrag', label: 'Auftrag', typ: 'referenz', zielTypen: [auftrag.id], pflicht: true, verweisart: 'zugehoerigkeit' },
    { key: 'nr', label: 'Nr.', typ: 'zahl' }, { key: 'beschreibung', label: 'Beschreibung', typ: 'text', pflicht: true },
    { key: 'menge', label: 'Menge', typ: 'zahl' }, { key: 'preis', label: 'Einzelpreis', typ: 'betrag', waehrung: 'EUR' },
  ] } })).daten;
  await api('PUT', `/api/typen/${auftrag.id}`, { cookie, body: { ...auftrag, felder: [...auftrag.felder, { key: 'positionen', label: 'Positionen', typ: 'tabelle', quelle: { typId: position.id, feldKey: 'auftrag', neu: '+ Position' } }] } });
  const mappe = (await api('POST', '/api/mappen', { cookie, body: { typId: auftrag.id, werte: { nr: 'A-1' } } })).daten;
  const positionen = [];
  for (const [nr, beschreibung, menge, betrag] of [[1, 'Ölfilter', 2, 12], [2, 'Inspektion', 1, 189.9]]) {
    positionen.push((await api('POST', '/api/mappen', { cookie, body: { typId: position.id, werte: { auftrag: mappe.id, nr, beschreibung, menge, preis: { betrag, waehrung: 'EUR' } } } })).daten);
  }
  return { auftrag, position, mappe, positionen };
}

/** Typen „Tarifart“ (mit Frist und Hinweis) und „Abo“, das beides beim Auswählen übernimmt; zwei Tarifarten (#1037). */
async function vorbelegenDaten(cookie) {
  const tarifart = (await api('POST', '/api/typen', { cookie, body: { name: 'Tarifart', schluessel: 'tarifart', titelVorlage: '{name}', felder: [
    { key: 'name', label: 'Name', typ: 'text', pflicht: true }, { key: 'frist', label: 'Kündigungsfrist', typ: 'zeitraum' }, { key: 'hinweis', label: 'Hinweis', typ: 'text' },
  ] } })).daten;
  const abo = (await api('POST', '/api/typen', { cookie, body: { name: 'Abo', schluessel: 'abo', titelVorlage: '{bezeichnung}', felder: [
    { key: 'bezeichnung', label: 'Bezeichnung', typ: 'text', pflicht: true },
    { key: 'tarifart', label: 'Tarifart', typ: 'referenz', zielTypen: [tarifart.id], vorbelegen: [{ von: 'frist', nach: 'frist' }, { von: 'hinweis', nach: 'notiz' }] },
    { key: 'frist', label: 'Kündigungsfrist', typ: 'zeitraum' }, { key: 'notiz', label: 'Notiz', typ: 'text' },
  ] } })).daten;
  const mobilfunk = (await api('POST', '/api/mappen', { cookie, body: { typId: tarifart.id, werte: { name: 'Mobilfunk', frist: 'P3M', hinweis: 'Rufnummer mitnehmen' } } })).daten;
  const strom = (await api('POST', '/api/mappen', { cookie, body: { typId: tarifart.id, werte: { name: 'Strom', frist: 'P2W', hinweis: 'Zählerstand notieren' } } })).daten;
  return { tarifart, abo, mobilfunk, strom };
}

/** Typ „Mietvertrag“ im Archivmodus, 6 Jahre ab „Beendet am“, leer: läuft noch nicht ab (#1051). */
async function archivDaten(cookie) {
  const typ = (await api('POST', '/api/typen', { cookie, body: { name: 'Mietvertrag', schluessel: 'mietvertrag', titelVorlage: '{objekt}',
    archiv: { jahre: 6, stichtag: 'beendet', leererStichtag: 'laeuftNicht' },
    felder: [{ key: 'objekt', label: 'Mietobjekt', typ: 'text', pflicht: true }, { key: 'beendet', label: 'Beendet am', typ: 'datum' }] } })).daten;
  const laufend = (await api('POST', '/api/mappen', { cookie, body: { typId: typ.id, werte: { objekt: 'Lager Gartenstraße' } } })).daten;
  const beendet = (await api('POST', '/api/mappen', { cookie, body: { typId: typ.id, werte: { objekt: 'Garage Hofweg', beendet: '2027-06-30' } } })).daten;
  return { typ, laufend, beendet };
}

/** #1180: Typ „Werkzeug“ mit einer Mappe und der Vorlage „Erinnere mich in 14 Tagen“ (nur dort, Datum als Vorschlag). */
async function vorschlagDaten(cookie) {
  const werkzeug = (await api('POST', '/api/typen', { cookie, body: { name: 'Werkzeug', schluessel: 'werkzeug', titelVorlage: '{name}', sichtAnlegen: false,
    felder: [{ key: 'name', label: 'Name', typ: 'text', pflicht: true }] } })).daten;
  const mappe = (await api('POST', '/api/mappen', { cookie, body: { typId: werkzeug.id, werte: { name: 'Bohrhammer' } } })).daten;
  const vorlage = (await api('POST', '/api/werkbank/ablaufvorlagen', { cookie, body: { name: 'Erinnere mich in 14 Tagen', typen: [werkzeug.id],
    wann: { art: 'in', anzahl: 14, einheit: 'tage' }, fragen: ['datum', 'text'], karten: [{ art: 'aufgabe', als: 'aufgabe', empfaenger: [{ art: 'selbst' }], text: '{eingabe}' }] } })).daten;
  return { werkzeug, mappe, vorlage };
}

/** Heute (Europe/Berlin, wie der Browser der Rauchtests) plus `tage` als JJJJ-MM-TT. */
function inTagen(tage) {
  const heute = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin' }).format(new Date());
  const d = new Date(`${heute}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + tage);
  return d.toISOString().slice(0, 10);
}

/* ---------- Desktop ---------- */

rauchtest('Anmelden und Startseite', {}, async (s) => {
  await s.goto(BASIS + '/');
  await s.getByRole('heading', { name: 'Anmelden' }).waitFor();
  await s.getByLabel('E-Mail-Adresse').fill(LENA.email);
  await s.getByLabel('Passwort', { exact: true }).fill(LENA.passwort);
  await s.getByRole('button', { name: 'Anmelden', exact: true }).click();
  await s.waitForURL(/\/ablage\/start$/);
  // #1219: ruhige Startseite – Begrüßung, Kacheln, Zuletzt geöffnet; der Assistent ist zu.
  await s.getByRole('heading', { name: 'Guten Tag, Lena', level: 1 }).waitFor();
  assert.equal(await s.getByRole('dialog', { name: 'Assistent' }).count(), 0, 'der Assistent öffnet sich nie von selbst');
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
  // Links bleibt „Neue Post“ markiert, in der Mitte das Dokument mit „Post … von 2“, rechts „Wohin gehört das?“ mit dem
  // Umschalter (#1217), gewählt „Neue Mappe“.
  await s.waitForURL(new RegExp(`/${daten.brief.id}/uebernehmen$`));
  await s.getByRole('complementary', { name: 'Ansichten' }).locator('a.sicht.an', { hasText: 'Neue Post' }).waitFor();
  const dokument = s.getByRole('region', { name: 'Dokument' });
  await dokument.getByRole('heading', { name: 'Preisanpassung Strom 2027' }).waitFor();
  await dokument.getByText(/^Post [12] von 2$/).waitFor();
  await dokument.getByRole('img', { name: 'Seite 1' }).waitFor();
  const mappe = s.getByRole('region', { name: 'Mappe' });
  await mappe.getByRole('radiogroup', { name: 'Wohin gehört das?' }).getByRole('radio', { name: 'Neue Mappe', checked: true }).waitFor();
  // „Als Post öffnen“ steht oben im Kopf neben „Post … von 2“ (ein Weg, der aussieht wie ein Knopf).
  await dokument.getByRole('link', { name: 'Als Post öffnen' }).waitFor();
  const wohin = mappe.getByRole('combobox', { name: 'Mappentyp suchen …' });
  await wohin.click();
  await mappe.getByRole('option', { name: /^Vertrag Laufender Vertrag/ }).click();
  // Gewählt ist er auch unter „Vorschläge“ (Knopf, gedrückt).
  await mappe.getByRole('group', { name: 'Vorschläge' }).getByRole('button', { name: 'Vertrag', pressed: true }).waitFor();
  // Die Mappe darunter: Kopf mit Typ und Titel (aus dem Betreff), Felder, Speicherleiste mit Hinweis zur Post.
  await mappe.getByRole('heading', { name: 'Preisanpassung Strom 2027', level: 1 }).waitFor();
  await mappe.getByText('Beim Speichern wandern Dokumente und Historie der Post hierher, die Post kommt in den Papierkorb.').waitFor();
  await mappe.getByRole('button', { name: 'Mappe anlegen' }).waitFor();
  assert.equal(await mappe.getByText(/Kopie in der Post behalten/).count(), 0, 'Kein „Kopie in der Post behalten“ mehr (#1217)');
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
  await mappe.getByRole('textbox', { name: 'Name', exact: true }).fill('Versicherung Beispiel AG');
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

// #940: „Alle anzeigen ›“ neben „Zuletzt geöffnet“ öffnet die Liste der letzten 25 (#1219: ein Link); Ändern zählt wie
// Öffnen (der Vertrag aus dem Test davor).
rauchtest('Startseite: Liste „Zuletzt geöffnet“', { als: LENA }, async (s) => {
  await s.goto(BASIS + '/ablage/start');
  const zuletzt = s.getByRole('region', { name: 'Zuletzt geöffnet' });
  await zuletzt.getByRole('link', { name: 'Alle anzeigen ›' }).waitFor();
  assert.equal(await zuletzt.getByRole('link', { name: /anzeigen/ }).count(), 1, 'genau ein Link „Alle anzeigen ›“');
  await zuletzt.getByRole('link', { name: 'Alle anzeigen ›' }).click();
  await s.waitForURL(/\/ablage\/zuletzt$/);
  const liste = s.getByRole('region', { name: 'Mappen' });
  await liste.getByRole('heading', { name: /^Zuletzt geöffnet/, level: 1 }).waitFor();
  await liste.getByRole('link', { name: /Wartungsvertrag Heizung.*Vertrag · geöffnet/ }).first().click();
  await s.getByRole('region', { name: 'Mappe' }).getByRole('heading', { name: 'Wartungsvertrag Heizung', level: 1 }).waitFor();
  await liste.getByRole('link', { name: '← Start' }).click();
  await s.waitForURL(/\/ablage\/start$/);
});

// #1218: ein Suchfeld oben auf jeder Seite; Enter führt in die erweiterte Suche, die Treffer kommen sofort. Die
// Startseite hat kein eigenes Suchfeld mehr.
rauchtest('Suchfeld oben: Enter führt in die erweiterte Suche (#1218)', { als: LENA }, async (s) => {
  await s.goto(BASIS + '/ablage/start');
  await s.getByRole('heading', { name: 'Guten Tag, Lena', level: 1 }).waitFor();
  const mitte = s.getByRole('region', { name: 'Mappen' });
  await mitte.getByRole('region', { name: 'Zuletzt geöffnet' }).waitFor();
  assert.equal(await mitte.getByRole('searchbox').count(), 0, 'kein Suchfeld auf der Startseite');
  assert.equal(await mitte.getByRole('link', { name: 'Erweiterte Suche' }).count(), 0, 'kein Link „Erweiterte Suche“ auf der Startseite');
  // „/“ springt hinein – nicht aus einem Eingabefeld heraus.
  await s.keyboard.press('/');
  const feld = s.getByRole('banner').getByRole('searchbox', { name: 'In deiner Ablage suchen' });
  assert.ok(await feld.evaluate((e) => e === document.activeElement), '„/“ setzt den Fokus ins Suchfeld oben');
  await s.keyboard.type('Stadtwerke');
  await s.keyboard.press('Enter');
  await s.waitForURL(/\/ablage\/suche\?volltext=Stadtwerke$/);
  const liste = s.getByRole('region', { name: 'Mappen' });
  await liste.getByRole('link', { name: /Stadtwerke Musterstadt/ }).first().click();
  await s.getByRole('region', { name: 'Mappe' }).getByRole('heading', { name: 'Stadtwerke Musterstadt', level: 1 }).waitFor();
  // Esc leert das Feld; ohne Treffer ein ruhiger Satz statt einer leeren Seite.
  await feld.fill('Xylofonunterricht');
  await feld.press('Escape');
  assert.equal(await feld.inputValue(), '');
  await feld.fill('Xylofonunterricht');
  await feld.press('Enter');
  await s.waitForURL(/volltext=Xylofonunterricht/);
  await liste.getByText('Keine Treffer. Entferne eine Bedingung, um mehr zu finden.').waitFor();
});

// #1218: In einer Ansicht zeigt das Feld oben den Bereich als Chip und filtert die Liste beim Tippen; „×“ bzw. die
// Rücktaste sucht wieder in allem. Die Ansicht hat kein eigenes Suchfeld mehr; „Suchen in ▾“ mit drei Haken.
rauchtest('Suchfeld oben in einer Ansicht: Chip, Filtern, „Suchen in“ (#1218)', { als: LENA }, async (s) => {
  const typen = (await api('GET', '/api/typen', { cookie: await sitzung(LENA) })).daten;
  const vertrag = typen.find((x) => x.name === 'Vertrag');
  await s.goto(BASIS + `/ablage/${vertrag.id}`);
  const kopf = s.getByRole('banner');
  const feld = kopf.getByRole('searchbox', { name: 'Vertrag durchsuchen' });
  await kopf.getByText('in: Vertrag').waitFor();
  assert.equal(await s.getByRole('region', { name: 'Mappen' }).getByRole('searchbox').count(), 0, 'kein zweites Suchfeld in der Ansicht');
  const liste = s.getByRole('region', { name: 'Mappen' });
  await feld.fill('Wartungsvertrag');
  await liste.getByText(/^1 Treffer/).waitFor();
  // „Suchen in ▾“: Titel und Felder (immer), Text der Dokumente, Notizen; „Mehr Filter …“ in die erweiterte Suche.
  await kopf.getByRole('button', { name: /Suchen in/ }).click();
  const in_ = kopf.getByRole('group', { name: 'Suchen in' });
  assert.ok(await in_.getByRole('checkbox', { name: 'Titel und Felder' }).isDisabled());
  await in_.getByRole('checkbox', { name: 'Text der Dokumente' }).waitFor();
  await in_.getByRole('checkbox', { name: 'Notizen' }).waitFor();
  assert.match(await in_.getByRole('link', { name: 'Mehr Filter …' }).getAttribute('href'), /\/ablage\/suche\?typ=.+&volltext=Wartungsvertrag$/);
  await s.keyboard.press('Escape');
  // Rücktaste im leeren Feld nimmt den Bereich weg: Die Liste zeigt wieder alles, Enter führt in die erweiterte Suche.
  await feld.fill('');
  await feld.press('Backspace');
  const alle = kopf.getByRole('searchbox', { name: 'In deiner Ablage suchen' });
  await alle.waitFor();
  assert.equal(await kopf.getByText('in: Vertrag').count(), 0);
  await liste.getByText(/^\d+ Mappen?/).waitFor();
});

// #1219: Assistent unten rechts – öffnet sich nie von selbst; Fragen nur mit Antwort-Paket (im Rauchtest nur gemeldet,
// eine Frage stellt der Test nicht); Handbuch aus dem Suchverzeichnis des mitgelieferten Handbuchs (hier vorgegeben, weil
// der Rauchtest ohne gebaute Handbücher läuft); Fokus ins Fenster und zurück zum Knopf.
const mitFragen = (s) => s.route('**/api/fragen', (r) => r.fulfill({ json: { verfuegbar: true, paket: 'KI-Assistent' } }));
const HANDBUCH_VERZEICHNIS = { config: { lang: ['de'] }, docs: [
  { location: 'post/', title: 'Post', text: '<p>Neue Post kommt per Scan, Mail oder + Neu.</p>' },
  { location: 'post/#dokument-ubernehmen', title: 'Dokument übernehmen', text: '<p>Klickst du in Neue Post eine Post an, öffnet sich die Seite Dokument übernehmen.</p>' },
] };
const mitHandbuch = (s) => s.route('**/hilfe/*/search/search_index.json', (r) => r.fulfill({ json: HANDBUCH_VERZEICHNIS }));

rauchtest('Assistent: Fragen · Tipps · Handbuch, Tastatur (#1219)', { als: LENA }, async (s) => {
  await mitFragen(s);
  await mitHandbuch(s);
  await s.goto(BASIS + '/ablage/start');
  const knopf = s.getByRole('button', { name: /^Assistent öffnen/ });
  await knopf.waitFor();
  assert.equal(await s.getByRole('dialog', { name: 'Assistent' }).count(), 0, 'öffnet sich nie von selbst');
  await knopf.focus();
  await s.keyboard.press('Enter');
  const fenster = s.getByRole('dialog', { name: 'Assistent' });
  await fenster.waitFor();
  assert.ok(await fenster.evaluate((e) => e.contains(document.activeElement)), 'der Fokus geht ins Fenster');
  const reiter = fenster.getByRole('radiogroup', { name: 'Assistent' });
  assert.deepEqual((await reiter.getByRole('radio').allTextContents()).map((x) => x.replace(/\s*\(neu\)$/, '')), ['Fragen', 'Tipps', 'Handbuch']);
  await fenster.getByRole('textbox', { name: 'Frag deine Ablage' }).waitFor();
  await fenster.getByText(/KI-Dienst des Pakets „KI-Assistent“/).waitFor();
  await reiter.getByRole('radio', { name: /^Tipps/ }).click();
  await fenster.getByRole('link', { name: 'Alle Tipps ansehen ›' }).waitFor();
  await reiter.getByRole('radio', { name: 'Handbuch' }).click();
  await fenster.getByText('Benutzerhandbuch – weil du in der Ablage bist').waitFor();
  await fenster.getByRole('searchbox', { name: 'Im Handbuch suchen' }).fill('übernehmen');
  const treffer = fenster.getByRole('link', { name: /Dokument übernehmen/ });
  assert.match(await treffer.getAttribute('href'), /^\/hilfe\/benutzer\/post\/#dokument-ubernehmen$/);
  assert.equal(await treffer.getAttribute('target'), '_blank');
  // Esc leert erst das Suchfeld, dann schließt es das Fenster; der Fokus kehrt zum Knopf zurück.
  await s.keyboard.press('Escape');
  await s.keyboard.press('Escape');
  await fenster.waitFor({ state: 'detached' });
  // Der Fokus kommt nach dem Abbau des Fensters zurück – darauf warten statt sofort zu prüfen.
  await s.waitForFunction(() => document.activeElement?.closest('[data-anker="assistent"]'), null, { timeout: 5000 })
    .catch(() => assert.fail('der Fokus kehrt zum Knopf zurück'));
  assert.ok(await knopf.evaluate((e) => e === document.activeElement), 'der Fokus kehrt zum Knopf zurück');
  // Das Gespräch und die Wahl bleiben beim Seitenwechsel; in der Werkbank sucht das Handbuch im Admin-Handbuch.
  await s.getByRole('link', { name: /^Zu erledigen/ }).first().click();
  await knopf.click();
  await fenster.getByText('Benutzerhandbuch – weil du in der Ablage bist').waitFor();
  await fenster.getByRole('button', { name: 'Assistent schließen' }).click();
});

rauchtest('Assistent ohne Antwort-Paket: nur Tipps · Handbuch (#1219)', { als: LENA }, async (s) => {
  await mitHandbuch(s);
  await s.goto(BASIS + '/ablage/start');
  await s.getByRole('button', { name: /^Assistent öffnen/ }).click();
  const reiter = s.getByRole('dialog', { name: 'Assistent' }).getByRole('radiogroup', { name: 'Assistent' });
  await reiter.waitFor();
  assert.deepEqual((await reiter.getByRole('radio').allTextContents()).map((x) => x.replace(/\s*\(neu\)$/, '')), ['Tipps', 'Handbuch']);
  assert.equal(await s.getByRole('textbox', { name: 'Frag deine Ablage' }).count(), 0);
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
  // Menü „Mappe“ (#1039) lädt seine Einstellung selbst: erst abwarten – sonst trifft die Anfrage nach dem Ende des Modus
  // ein und bekommt 403.
  await s.locator('[data-anker="werkbank.mappenmenue"] input[type="checkbox"]:enabled').first().waitFor();
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
rauchtest('Werkbank: Sprungleiste und Bereiche in allen Editoren (#1000)', { als: LENA, erwartet: [{ status: 422, pfad: /^\/api\/werkbank\/postfaecher$/ }] }, async (s) => {
  await s.goto(BASIS + '/ablage/start');
  await verwalten(s);
  const bearbeitung = s.getByRole('region', { name: 'Bearbeitung' });
  await s.goto(BASIS + '/werkbank/nummernkreise/archivnummer');
  const leiste = bearbeitung.getByRole('navigation', { name: 'Bereiche des Nummernkreises' });
  for (const name of ['Grunddaten', 'Stand', 'Aufkleber drucken', 'Verwendet in']) await leiste.getByRole('button', { name, exact: true }).waitFor();
  await leiste.getByRole('button', { name: 'Alle aufklappen' }).click();
  await bearbeitung.getByRole('textbox', { name: 'Name' }).waitFor();
  await s.reload();
  await bearbeitung.getByRole('textbox', { name: 'Name' }).waitFor();
  await leiste.getByRole('button', { name: 'Alle zuklappen' }).waitFor();
  // Tastatur: Enter auf einem Sprung setzt den Fokus auf den Kopf des Bereichs, Tab geht im Bereich weiter.
  await leiste.getByRole('button', { name: 'Stand', exact: true }).focus();
  await s.keyboard.press('Enter');
  await s.waitForFunction(() => document.activeElement?.id === 'stand-kopf', null, { timeout: 5000 });
  assert.equal(await s.evaluate(() => document.activeElement?.closest('[data-sprungleiste]') === null), true, 'Fokus nicht mehr in der Sprungleiste');
  // Neues Postfach: alles offen, ohne „Stand“; ohne Namen und Benutzer meldet der Server Grunddaten und Verbindung.
  await s.goto(BASIS + '/werkbank/postfaecher/neu');
  const pf = bearbeitung.getByRole('navigation', { name: 'Bereiche des Postfachs' });
  await pf.getByRole('button', { name: 'Abholen', exact: true }).waitFor();
  // An/aus als Schalter (#1188), nicht als Haken.
  await bearbeitung.getByRole('switch', { name: 'Automatischer Abruf' }).waitFor();
  assert.equal(await pf.getByRole('button', { name: 'Stand', exact: true }).count(), 0, 'Ein neues Postfach hat noch keinen Stand');
  await bearbeitung.getByRole('textbox', { name: 'Server' }).fill('imap.example.org');
  await s.getByRole('button', { name: 'Postfach anlegen' }).click();
  await pf.getByRole('button', { name: /^Grunddaten/ }).and(s.locator('[title="Grunddaten: Fehler"]')).waitFor();
  await pf.getByRole('button', { name: /^Verbindung/ }).and(s.locator('[title="Verbindung: Fehler"]')).waitFor();
  assert.equal(await pf.locator('[title="Abholen: Fehler"]').count(), 0, 'Abholen hat keinen Fehler');
  // Benutzer: die Bereiche aus dem Vorschlag in #1000.
  await s.goto(BASIS + '/werkbank/benutzer');
  await s.getByRole('region', { name: 'Elemente' }).getByRole('link', { name: /^Lena/ }).first().click();
  const bl = bearbeitung.getByRole('navigation', { name: 'Bereiche des Benutzers' });
  for (const name of ['Grunddaten', 'Rollen und Rechte', 'Vertretung', 'Anmeldung und Sicherheit']) await bl.getByRole('button', { name, exact: true }).waitFor();
  await bearbeitung.locator('.ueber', { hasText: /^Benutzer$/ }).waitFor();
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

// Sicherung herunterladen (#975): anlegen, „Herunterladen“ als Erstes in der Zeile, der Browser lädt die verschlüsselte
// Datei (Name mit Datum), darunter Hinweis auf das Notfallblatt, Größe und Prüfsumme.
rauchtest('Werkbank: Sicherung anlegen und herunterladen (#975)', { als: LENA, erwartet: [{ status: 409, pfad: /^\/api\/wiederherstellung\/sicherungen$/ }] }, async (s) => {
  await s.goto(BASIS + '/ablage/start');
  await verwalten(s);
  await s.getByRole('complementary', { name: 'Bereiche' }).getByRole('link', { name: /^Sicherung/ }).click();
  const bearbeitung = s.getByRole('region', { name: 'Bearbeitung' });
  await bearbeitung.getByRole('heading', { name: 'Sicherung', level: 1 }).waitFor();
  await bearbeitung.getByRole('button', { name: 'Jetzt sichern' }).click();
  const zeile = bearbeitung.locator('#liste tbody tr').first();
  const laden = zeile.getByRole('button', { name: 'Herunterladen' });
  await laden.waitFor({ timeout: 60_000 });
  const knoepfe = await zeile.locator('td').last().getByRole('button').allInnerTexts();
  assert.deepEqual(knoepfe.map((x) => x.trim()), ['Herunterladen', 'Prüfen', 'Löschen'], 'Herunterladen · Prüfen · Löschen');
  const [download] = await Promise.all([s.waitForEvent('download'), laden.click()]);
  assert.match(download.suggestedFilename(), /^\d{4}-\d{2}-\d{2}_\d{4}-manuell(-\d+)?\.dms-sicherung$/);
  assert.equal(await download.failure(), null);
  await bearbeitung.getByText('Zum Wiederherstellen brauchst du dein Notfallblatt (Schlüssel).').waitFor();
  await bearbeitung.getByText('Prüfsumme (SHA-256)').waitFor();
  await bearbeitung.getByRole('link', { name: '.json herunterladen' }).waitFor();
});

rauchtest('Rundgang beim ersten Anmelden und „Ablago entdecken“', {}, async (s) => {
  await s.goto(BASIS + '/');
  await s.getByLabel('E-Mail-Adresse').fill(JONAS.email);
  await s.getByLabel('Passwort', { exact: true }).fill(JONAS.passwort);
  await s.getByRole('button', { name: 'Anmelden', exact: true }).click();
  const rundgang = s.getByRole('dialog');
  await rundgang.getByText('Schritt 1 von 5').waitFor();
  for (let i = 2; i <= 5; i++) {
    await rundgang.getByRole('button', { name: 'Weiter' }).click();
    await rundgang.getByText(`Schritt ${i} von 5`).waitFor();
  }
  await rundgang.getByRole('button', { name: 'Fertig' }).click();
  await rundgang.waitFor({ state: 'detached' });
  await s.getByRole('heading', { name: 'Guten Tag, Jonas', level: 1 }).waitFor();
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
  await s.getByRole('heading', { name: 'Guten Tag, Lena', level: 1 }).waitFor();
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
  await s.getByRole('button', { name: 'Anmelden', exact: true }).click();
  await s.waitForURL(/\/ablage\/start$/);
  // Am Handy: Ansicht oben als Auswahl, Startseite einspaltig mit „Post fotografieren“.
  await s.getByRole('heading', { name: 'Guten Tag, Lena', level: 1 }).waitFor();
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
  await s.getByRole('radiogroup', { name: 'Wohin gehört das?' }).waitFor();
  await s.getByRole('combobox', { name: 'Mappentyp suchen …' }).waitFor();
  await keineWaagerechteRolle(s);
});

// #1218: Am Handy steht oben nur die Lupe (44 px); sie öffnet das Feld über die ganze Kopfzeile.
rauchtest('Handy: Suche über die Lupe oben', { handy: true, als: LENA }, async (s) => {
  await s.goto(BASIS + '/ablage/start');
  const lupe = s.getByRole('banner').getByRole('button', { name: 'Suchen', exact: true });
  const box = await lupe.boundingBox();
  assert.ok(box && box.width >= 44 && box.height >= 44, `Lupe mindestens 44 px (${JSON.stringify(box)})`);
  await lupe.click();
  const feld = s.getByRole('banner').getByRole('searchbox', { name: 'In deiner Ablage suchen' });
  assert.ok(await feld.evaluate((e) => e === document.activeElement), 'Fokus im aufgeklappten Feld');
  await keineWaagerechteRolle(s);
  await feld.fill('Stromvertrag');
  await feld.press('Enter');
  await s.waitForURL(/\/ablage\/suche\?volltext=Stromvertrag$/);
  await s.getByRole('link', { name: /Stromvertrag Haus/ }).first().click();
  await s.getByRole('heading', { name: 'Stromvertrag Haus', level: 1 }).waitFor();
  await keineWaagerechteRolle(s);
});

// #1219: Am Handy liegt der Assistent als Blatt unten über die volle Breite.
rauchtest('Handy: Assistent als Blatt von unten (#1219)', { handy: true, als: LENA }, async (s) => {
  await mitFragen(s);
  await s.goto(BASIS + '/ablage/start');
  await s.getByRole('button', { name: /^Assistent öffnen/ }).click();
  const fenster = s.getByRole('dialog', { name: 'Assistent' });
  await fenster.getByRole('textbox', { name: 'Frag deine Ablage' }).waitFor();
  const box = await fenster.boundingBox();
  const breite = await s.evaluate(() => document.documentElement.clientWidth);
  assert.ok(box && box.x <= 1 && Math.abs(box.x + box.width - breite) <= 1, `Blatt über die volle Breite (${JSON.stringify(box)})`);
  await keineWaagerechteRolle(s);
});

// #935: „+ … anlegen“ öffnet am Handy dasselbe Fenster – unten, so breit wie der Bildschirm; Esc schließt es.

rauchtest('Handy: Fenster „+ … anlegen“ passt auf den Bildschirm (#935)', { handy: true, als: LENA }, async (s) => {
  const typen = (await api('GET', '/api/typen', { cookie: await sitzung(LENA) })).daten;
  await s.goto(BASIS + `/ablage/${typen.find((x) => x.name === 'Rechnung').id}/neu`);
  const feld = s.locator('[data-anker="mappe.feld:aussteller"]');
  await feld.getByRole('button', { name: '+ Vertragspartner anlegen' }).click();
  const fenster = s.getByRole('dialog', { name: 'Vertragspartner anlegen' });
  await fenster.getByRole('textbox', { name: 'Name', exact: true }).waitFor();
  const box = await fenster.boundingBox();
  assert.ok(box && box.x >= 0 && box.x + box.width <= 390, `Fenster breiter als der Bildschirm (${JSON.stringify(box)})`);
  await keineWaagerechteRolle(s);
  await s.keyboard.press('Escape');
  await fenster.waitFor({ state: 'detached' });
});

rauchtest('Tabelle: Positionen zwischen den Feldern, „+ Position“ im Fenster (#1030)', { als: LENA }, async (s) => {
  const { auftrag, mappe } = daten.tabelle;
  await s.goto(BASIS + `/ablage/${auftrag.id}/${mappe.id}`);
  const tabelle = s.getByRole('table', { name: 'Positionen' });
  await tabelle.getByRole('link', { name: '1' }).waitFor();
  assert.deepEqual(await tabelle.getByRole('columnheader').allTextContents(), ['Nr.', 'Beschreibung', 'Menge', 'Einzelpreis']);
  assert.equal(await tabelle.getByRole('row').count(), 3);
  // „+ Position“: Knopfart Anlegen (#989), öffnet das Fenster mit dem Verweis auf diesen Auftrag.
  const neu = s.getByRole('button', { name: '+ Position' });
  assert.equal(await neu.getAttribute('data-knopf'), 'anlegen');
  await neu.click();
  const fenster = s.getByRole('dialog', { name: 'Auftragsposition anlegen' });
  await fenster.getByText('A-1').first().waitFor();
  await fenster.getByRole('textbox', { name: 'Beschreibung', exact: true }).fill('Bremsen vorne');
  await fenster.getByRole('button', { name: /speichern/i }).click();
  await fenster.waitFor({ state: 'detached' });
  await tabelle.getByRole('cell', { name: 'Bremsen vorne', exact: true }).waitFor();
  await s.getByRole('status').filter({ hasText: 'angelegt' }).waitFor();
});

rauchtest('Handy: Tabelle als Liste mit den ersten zwei Spalten (#1030)', { handy: true, als: LENA }, async (s) => {
  const { auftrag, mappe } = daten.tabelle;
  await s.goto(BASIS + `/ablage/${auftrag.id}/${mappe.id}`);
  const liste = s.getByRole('list', { name: 'Positionen' });
  await liste.getByRole('listitem').first().waitFor();
  assert.equal(await s.getByRole('table', { name: 'Positionen' }).count(), 0);
  assert.match(await liste.getByRole('listitem').filter({ hasText: 'Ölfilter' }).textContent(), /^1\s*Beschreibung:\s*Ölfilter$/);
  await keineWaagerechteRolle(s);
});

rauchtest('Teile: Suche findet den Auftrag über seine Position, „Teil von …“ am direkten Link (#1031)', { als: LENA }, async (s) => {
  const { auftrag, mappe, positionen, position } = daten.tabelle;
  // Suche über alle Mappen (#1218: Enter im Suchfeld oben): der Auftrag mit „gefunden in Auftragsposition …“, die Position selbst nicht.
  await s.goto(BASIS + '/ablage/start');
  const feld = s.getByRole('banner').getByRole('searchbox', { name: 'In deiner Ablage suchen' });
  await feld.fill('Ölfilter');
  await feld.press('Enter');
  const liste = s.getByRole('region', { name: 'Mappen' });
  await liste.getByText('gefunden in Auftragsposition „1. Ölfilter“').first().waitFor();
  assert.equal(await liste.getByRole('link', { name: /^1\. Ölfilter/ }).count(), 0);
  // Direkter Link auf die Position: oben „Teil von Auftrag „A-1““ mit Link zurück; in der Mitte keine Liste aller Positionen.
  await s.goto(BASIS + `/ablage/${position.id}/${positionen[0].id}`);
  const zurueck = s.getByRole('link', { name: 'Auftrag „A-1“' });
  await zurueck.waitFor();
  await s.getByText('Mappen vom Typ Auftragsposition erscheinen nur an ihrer übergeordneten Mappe', { exact: false }).waitFor();
  await zurueck.click();
  await s.waitForURL(new RegExp(`/ablage/${auftrag.id}/${mappe.id}`));
});

rauchtest('Archivmodus: „Frist beginnt mit …“ an der Mappe, „Ist der Stichtag leer“ im Mappentyp (#1051)', { als: LENA }, async (s) => {
  const { typ, laufend, beendet } = daten.archiv;
  await s.goto(BASIS + `/ablage/${typ.id}/${laufend.id}`);
  await s.getByText('aufbewahren, Frist beginnt mit „Beendet am“').waitFor();
  await s.goto(BASIS + `/ablage/${typ.id}/${beendet.id}`);
  await s.getByText('aufbewahren bis 31.12.2033').waitFor();
  await verwalten(s);
  await s.goto(BASIS + `/werkbank/typen/${typ.id}#archiv`);
  const wahl = s.getByLabel('Ist „Beendet am“ leer');
  await wahl.waitFor();
  assert.equal(await wahl.inputValue(), 'laeuftNicht');
  await s.getByText('Bei 1 Mappe ist „Beendet am“ leer – dort läuft die Frist noch nicht.').waitFor();
  await keineWaagerechteRolle(s);
});

rauchtest('Fassungen: Bereich im Mappentyp, Liste mit der ersten Fassung (#1006)', { als: LENA }, async (s) => {
  const { typ } = daten.archiv;
  await s.goto(BASIS + '/ablage/start');
  await verwalten(s);
  await s.goto(BASIS + `/werkbank/typen/${typ.id}#fassungen`);
  const bereich = s.locator('#fassungen');
  // Der Anker öffnet den Bereich; die Liste nennt die Fassung mit lesbarer Änderung und „Aktuell“.
  await bereich.locator('.historie').waitFor();
  await bereich.getByText('Aktuell', { exact: true }).waitFor();
  await bereich.locator('.historie summary').first().click();
  await bereich.getByText('Angelegt', { exact: false }).first().waitFor();
  assert.ok(await s.locator('[data-sprungleiste]').getByRole('button', { name: 'Fassungen' }).count() > 0, 'Fassungen in der Sprungleiste');
  await keineWaagerechteRolle(s);
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
  // Klassifizierung mehrstufig (#939): ein Vorschlag mit den Belegen der Wege – als gedrückter Chip, ohne Prozent (#1217).
  await mappe.getByText('Vorschlag – woran Ablago das erkennt:').waitFor();
  await mappe.getByRole('group', { name: 'Vorschläge' }).getByRole('button', { name: 'Rechnung', pressed: true }).waitFor();
  assert.equal(await mappe.getByText(/\d+ %/).count(), 0, 'Keine Prozente bei „Wohin gehört das?“ (#1217)');
  // Das zweite Dokument passt eher zu „Vertrag“: abtrennen.
  const dokument = s.getByRole('region', { name: 'Dokument' });
  await dokument.getByText('„Vertrag Leasing Kombi Beispiel 2027.pdf“ passt eher zu Vertrag.').waitFor();
  await dokument.getByRole('button', { name: 'Ab hier abtrennen und als neue Post in „Neue Post“ legen' }).click();
  await dokument.getByText('1 Dokument liegt jetzt als „Werkstatt Kfz (abgetrennt)“ in „Neue Post“.').waitFor();
  await dokument.getByRole('article', { name: 'Vertrag Leasing Kombi Beispiel 2027.pdf' }).waitFor({ state: 'detached' });
  // Text markieren (Textebene): Das zuletzt gewählte Feld übernimmt ihn.
  await mappe.getByRole('textbox', { name: 'Rechnungsnummer', exact: true }).click();
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
  await mappe.getByRole('combobox', { name: 'Mappentyp suchen …' }).click();
  await mappe.getByRole('option', { name: /^Vertragspartner/ }).click();
  await mappe.getByText('Beim Speichern wandern Dokumente und Historie der Post hierher, die Post kommt in den Papierkorb.').waitFor();
  await mappe.getByRole('tab', { name: 'Stammdaten' }).click();
  await mappe.getByRole('textbox', { name: 'Name', exact: true }).fill('Schornsteinfeger Beispiel');
  await mappe.getByRole('heading', { name: 'Schornsteinfeger Beispiel', level: 1 }).waitFor();
  await mappe.getByRole('button', { name: 'Mappe anlegen' }).click();
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
  // „Vorhandene Mappe“ (#1217): ohne vorherige Typwahl, Suche über alle Mappentypen; ohne Wahl ist der Hauptknopf blass.
  await mappe.getByRole('radio', { name: 'Vorhandene Mappe' }).click();
  assert.ok(await mappe.getByRole('button', { name: 'Zur Mappe legen' }).isDisabled(), 'Ohne Wahl ist „Zur Mappe legen“ blass');
  await mappe.getByRole('combobox', { name: 'Mappe suchen …' }).fill('Stromvertrag');
  await mappe.getByRole('option', { name: 'Stromvertrag Haus' }).click();
  // Kurzansicht der Mappe: Typ, Titel, Felder, wohin die Dokumente kommen.
  await mappe.locator('.ue-kurz').getByText('Vertragsnummer').waitFor();
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

// #1217: „Wohin gehört das?“ mit Umschalter – Tastatur, Vorschläge für „Vorhandene Mappe“ aus dem Brief, „Nur erledigen“.
rauchtest('Dokument übernehmen: Vorhandene Mappe aus dem Brief, Nur erledigen, Tastatur im Umschalter (#1217)', { als: LENA }, async (s) => {
  // Ein eigener Mappentyp mit „Zum Wiederfinden nutzen“ (die Beispiele haben keinen) und eine Mappe, deren Nummer im Brief steht.
  const verwaltung = await sitzung(LENA);
  await api('POST', '/api/konto/verwaltung', { cookie: verwaltung, body: { passwort: LENA.passwort } });
  const gas = (await api('POST', '/api/typen', { cookie: verwaltung, body: { name: 'Gasanschluss', schluessel: 'gasanschluss', titelVorlage: '{objekt}',
    felder: [{ key: 'objekt', label: 'Objekt', typ: 'text', pflicht: true }, { key: 'anschlussnummer', label: 'Anschlussnummer', typ: 'text', wiederfinden: true }] } })).daten;
  await api('POST', '/api/mappen', { cookie: verwaltung, body: { typId: gas.id, werte: { objekt: 'Gasanschluss Keller', anschlussnummer: 'GA-2027-881' } } });
  const brief = await eigenePost('Abschlag Gas Beispiel', ['Abschlag Gas\nAnschlussnummer GA-2027-881']);
  await s.goto(BASIS + `/ablage/eingang/${brief.id}`);
  await s.waitForURL(new RegExp(`/${brief.id}/uebernehmen$`));
  const mappe = s.getByRole('region', { name: 'Mappe' });
  const wohin = mappe.getByRole('radiogroup', { name: 'Wohin gehört das?' });
  await wohin.getByRole('radio', { name: 'Neue Mappe', checked: true }).focus();
  // Pfeiltasten wählen im Umschalter (wie Optionsfelder).
  await s.keyboard.press('ArrowRight');
  await wohin.getByRole('radio', { name: 'Vorhandene Mappe', checked: true }).waitFor();
  await s.waitForFunction(() => document.activeElement?.getAttribute('aria-checked') === 'true' && document.activeElement?.textContent === 'Vorhandene Mappe');
  // Die Erkennung kennt den Gasanschluss (Anschlussnummer im Brief): Vorschlag als Chip, ohne vorherige Typwahl.
  await mappe.getByRole('group', { name: 'Vorschläge' }).getByRole('button', { name: 'Gasanschluss Keller · Gasanschluss' }).click();
  await mappe.locator('.ue-kurz').getByText('GA-2027-881').waitFor();
  await mappe.getByRole('button', { name: 'Zu „Gasanschluss Keller“ legen' }).waitFor();
  // „Nur erledigen“: ein Satz, ein Knopf „Erledigt“ – nichts wird gelöscht.
  await wohin.getByRole('radio', { name: 'Nur erledigen' }).click();
  await mappe.getByText('Nichts wird gelöscht. Die Post verschwindet aus „Neue Post“ und bleibt unter „Post“ mit Stand „Erledigt“.').waitFor();
  await mappe.getByRole('button', { name: 'Erledigt' }).click();
  await s.waitForURL((u) => !u.pathname.includes(brief.id));
  const nachher = (await api('GET', `/api/mappen/${brief.id}`, { cookie: await sitzung(LENA) })).daten;
  assert.match(JSON.stringify(nachher.mappe.werte.stand), /Erledigt/);
  assert.equal(nachher.dokumente.length, 1, 'Die Dokumente bleiben in der Post');
});

/** Die drei Wahlen auf „Dokument übernehmen“ (#1217) und worauf je Wahl gewartet wird. */
const UEBERNEHMEN_WAHLEN = [
  ['Neue Mappe', (m) => m.getByRole('combobox', { name: 'Mappentyp suchen …' }).waitFor()],
  ['Vorhandene Mappe', (m) => m.getByRole('combobox', { name: 'Mappe suchen …' }).waitFor()],
  ['Nur erledigen', (m) => m.getByRole('button', { name: 'Erledigt' }).waitFor()],
];

rauchtest('Dokument übernehmen aus Bausteinen: axe ohne Verstoß in allen drei Wahlen, hell und dunkel (#1217)', { als: LENA }, async (s) => {
  const brief = await eigenePost('Werbung Möbelhaus Beispiel', ['Werbung Möbelhaus Beispiel']);
  const funde = [];
  for (const schema of ['light', 'dark']) {
    await s.emulateMedia({ colorScheme: schema });
    await s.goto(BASIS + `/ablage/eingang/${brief.id}`);
    await s.waitForURL(new RegExp(`/${brief.id}/uebernehmen$`));
    const mappe = s.getByRole('region', { name: 'Mappe' });
    await s.getByRole('region', { name: 'Dokument' }).getByRole('img', { name: 'Seite 1' }).waitFor();
    for (const [wahl, warte] of UEBERNEHMEN_WAHLEN) {
      await mappe.getByRole('radio', { name: wahl }).click();
      await warte(mappe);
      await s.waitForLoadState('networkidle');
      for (const v of await axePruefen(s, ['.spalte.liste', '.spalte.mappe'])) funde.push(`${wahl} (${schema}): ${v}`);
    }
  }
  assert.deepEqual(funde, [], `axe meldet Verstöße:\n${funde.join('\n')}`);
});

rauchtest('Handy: Dokument übernehmen mit 44-px-Tippflächen in allen drei Wahlen (#1217)', { handy: true, als: LENA }, async (s) => {
  const brief = await eigenePost('Werbung Gartenmarkt Beispiel', ['Werbung Gartenmarkt Beispiel']);
  await s.goto(BASIS + `/ablage/eingang/${brief.id}`);
  await s.waitForURL(new RegExp(`/${brief.id}/uebernehmen$`));
  const mappe = s.getByRole('region', { name: 'Mappe' });
  // Am Handy stehen die drei Wahlen untereinander, keine ist abgeschnitten.
  await mappe.getByRole('radio', { name: 'Nur erledigen' }).waitFor();
  const breiten = await mappe.getByRole('radio').evaluateAll((l) => l.map((e) => e.scrollWidth <= e.clientWidth));
  assert.deepEqual(breiten, [true, true, true], 'Wahlen am Handy abgeschnitten');
  const funde = [];
  for (const [wahl, warte] of UEBERNEHMEN_WAHLEN) {
    await mappe.getByRole('radio', { name: wahl }).click();
    await warte(mappe);
    await s.waitForLoadState('networkidle');
    for (const v of await tippflaechenPruefen(s, ['.ue-kopf', '.ue-dokkopf', '.ue-wohin', '.ue-leiste'])) funde.push(`${wahl}: ${v}`);
  }
  await keineWaagerechteRolle(s);
  assert.deepEqual(funde, [], `Zu kleine Tippflächen am Handy:\n${funde.join('\n')}`);
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
  await fenster.getByRole('button', { name: 'Entwurf verwerfen' }).click();
  await fenster.waitFor({ state: 'detached' });
  await anlegen.click();
  await fenster.getByRole('textbox', { name: 'Name', exact: true }).waitFor();
  await s.waitForFunction(() => document.activeElement?.closest('[role="dialog"]'));
  await s.keyboard.press('Escape');
  await fenster.waitFor({ state: 'detached' });
  await s.waitForFunction(() => document.activeElement?.textContent === '+ Vertragspartner anlegen');
  // Wie die rechte Spalte einer Mappe: Kopf, Register, Felder, Speicherleiste – vorausgefüllt mit dem Briefkopf.
  await anlegen.click();
  await fenster.getByText('Neue Mappe').or(fenster.getByText('Heizungsbau Muster KG', { exact: true })).first().waitFor();
  await fenster.getByRole('tab', { name: 'Stammdaten' }).waitFor();
  await fenster.getByRole('button', { name: 'Mappe speichern' }).waitFor();
  const name = fenster.getByRole('textbox', { name: 'Name', exact: true });
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
  await mappe.getByRole('textbox', { name: 'Rechnungsnummer', exact: true }).fill('R-2027-88');
  await mappe.getByLabel('Rechnungsdatum', { exact: true }).fill('2027-01-15');
  await mappe.getByRole('textbox', { name: 'Rechnungsbetrag', exact: true }).fill('120,00');
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
// Seit #1210 mehr Bausteine und Zustände: Die Messung der Tippflächen am Handy braucht länger.
test('Musterseite der Bausteine: Bilder, axe ohne Verstoß (#967)', { timeout: 300_000 }, async () => {
  await warteAufAblago();
  await mkdir(MUSTERORDNER, { recursive: true });
  const fehler = [];
  const beobachte = (k) => {
    k.on('console', (m) => { if (m.type() === 'error') fehler.push(`Konsole: ${m.text()}`); });
    k.on('weberror', (e) => fehler.push(`Fehler in der Seite: ${e.error().message}`));
  };
  const { bilder, verstoesse } = await musterAufnehmen(browser, { basis: BASIS, ziel: MUSTERORDNER, beobachte });
  assert.equal(bilder.length, 28, `Bilder der Musterseite: ${bilder.join(', ')}`);
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

// Gefahr und gesperrt (#1210): Der Gefahr-Knopf stellt seine Rückfrage selbst (Fokus auf „Abbrechen“, Esc bricht ab,
// erst „Löschen“ handelt; rot gefüllt nur dort). Gesperrt aus einem Grund: Klick auf Knopf oder ⓘ öffnet die
// Erklärung am Knopf, Esc schließt sie und gibt den Fokus zurück, ein Klick daneben schließt sie.
test('Baustein Knopf: Gefahr mit Rückfrage, gesperrt mit Erklärung (#1210)', { timeout: 60_000 }, async () => {
  await warteAufAblago();
  const k = await browser.newContext({ ...DESKTOP, locale: 'de-DE' });
  const fehler = [];
  k.on('weberror', (e) => fehler.push(`Fehler in der Seite: ${e.error().message}`));
  try {
    const s = await k.newPage();
    await s.goto(BASIS + '/muster#knopf');
    const karte = s.locator('[data-zustand="knopf-ausprobieren"]');
    const loeschen = karte.getByRole('button', { name: 'Löschen' });
    assert.equal(await loeschen.getAttribute('aria-haspopup'), 'dialog');
    assert.equal(await s.locator('.knopf.gefahr, [data-knopf="entscheidung"]').filter({ visible: true }).count(), 1, 'rot gefüllt nur die stehende Rückfrage der Musterseite');
    await loeschen.click();
    const frage = s.getByRole('alertdialog', { name: 'Notiz löschen?' });
    await frage.waitFor();
    assert.equal(await s.evaluate(() => document.activeElement?.textContent), 'Abbrechen', 'Fokus startet auf „Abbrechen“');
    assert.equal(await frage.locator('[data-knopf="entscheidung"]').count(), 1, 'Bestätigung rot gefüllt');
    await s.keyboard.press('Escape');
    await frage.waitFor({ state: 'detached' });
    assert.equal(await karte.locator('[data-ergebnis]').count(), 0, 'Abbrechen handelt nicht');
    await loeschen.click();
    await frage.getByRole('button', { name: 'Löschen' }).click();
    await karte.locator('[role="status"][data-ergebnis="gut"]').getByText('Gelöscht').waitFor();

    // Gesperrt aus einem Grund: kein Satz in der Zeile, Erklärung auf Klick.
    const grund = s.locator('[data-zustand="knopf-grund"]');
    const abrufen = grund.getByRole('button', { name: 'Jetzt abrufen', exact: true });
    assert.equal(await abrufen.getAttribute('aria-disabled'), 'true');
    // Der Grund steht nur für Screenreader am Knopf (1 × 1 px), nicht als Satz in der Zeile.
    const satz = await grund.getByText('Erst speichern, dann abrufen.').boundingBox();
    assert.ok(!satz || satz.width <= 1, `Grund nicht als Satz in der Zeile (${JSON.stringify(satz)})`);
    // Mit der Tastatur (Playwright klickt nichts mit aria-disabled an – Menschen schon, das prüft der Klick aufs ⓘ).
    await abrufen.focus();
    await s.keyboard.press('Enter');
    const erklaerung = grund.getByRole('region', { name: 'Warum gesperrt? Jetzt abrufen' });
    await erklaerung.getByText('Erst speichern, dann abrufen.').waitFor();
    await s.keyboard.press('Escape');
    await erklaerung.waitFor({ state: 'detached' });
    assert.equal(await s.evaluate(() => document.activeElement?.textContent), 'Jetzt abrufen', 'Esc gibt den Fokus an den Knopf');
    await grund.getByRole('button', { name: 'Warum gesperrt? Jetzt abrufen' }).click();
    await erklaerung.waitFor();
    await s.locator('h1').click();
    await erklaerung.waitFor({ state: 'detached' });
  } finally {
    await k.close();
  }
  assert.deepEqual(fehler, [], 'Fehler im Browser bei Gefahr und gesperrt');
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
      .filter((el) => el.dataset.knopf === 'anlegen' || /^\+ ?Neu/.test(text(el)) || /^\+ /.test(text(el)));
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
  // Kopf der Ansicht (#1212): „+ <Typ>“ statt „+ Neu“.
  await s.getByRole('region', { name: 'Mappen' }).getByRole('link', { name: /^\+ Vertrag/ }).waitFor();
  await pruefe('Ablage → Vertrag');
  // Mein Konto: API-Schlüssel.
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
  const alle = ['pakete', 'typen', 'sichten', 'nummernkreise', 'automatisierungen', 'benutzer', 'verschluesselung', 'organisation', 'auskuenfte', 'loeschkonzept',
    'aufbewahrung', 'stempel', 'postfaecher', 'eingangsordner', 'webdav', 'texterkennung', 'sicherung', 'vollexport', 'papierkorb',
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
  // Die Erkennung selbst: Eingangsordner, WebDAV und Stempel haben ihre Hilfe hinter der Überschrift.
  for (const weg of ['/werkbank/eingangsordner', '/werkbank/webdav', '/werkbank/stempel/neu']) {
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
  assert.ok(r.spalte > r.platz + 50, `${wo}: Die rechte Spalte ist nicht länger als ihr Platz (${r.spalte} / ${r.platz} px) – der Test prüft so nichts`);
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
  // „Ausprobieren“ ist ein Bereich (#1000): über die Sprungleiste aufklappen.
  await bearbeitung.getByRole('navigation', { name: 'Bereiche der Automatisierung' }).getByRole('button', { name: 'Ausprobieren' }).click();
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

// #1037: Beim Auswählen übernehmen – Vorschläge nur in leere Felder, markiert; eine andere Wahl ersetzt nur Unberührtes.
rauchtest('Werte aus der gewählten Mappe vorschlagen (#1037)', { als: LENA }, async (s) => {
  const { abo } = daten.vorbelegen;
  await s.goto(BASIS + `/ablage/${abo.id}/neu`);
  const mappe = s.getByRole('region', { name: 'Mappe' });
  await mappe.getByRole('heading', { name: 'Neue Mappe', level: 1 }).waitFor();
  await mappe.getByRole('textbox', { name: 'Bezeichnung', exact: true }).fill('Handy Lena');
  const tarifart = mappe.locator('[data-anker="mappe.feld:tarifart"]');
  await tarifart.getByRole('combobox').fill('Mobil');
  await tarifart.getByRole('option', { name: 'Mobilfunk' }).click();
  const notiz = mappe.locator('[data-anker="mappe.feld:notiz"]');
  const frist = mappe.locator('[data-anker="mappe.feld:frist"]');
  await notiz.getByText('vorgeschlagen aus Tarifart Mobilfunk').waitFor();
  await frist.getByText('vorgeschlagen aus Tarifart Mobilfunk').waitFor();
  assert.equal(await notiz.getByRole('textbox').inputValue(), 'Rufnummer mitnehmen');
  // Selbst geändert: bleibt, auch wenn eine andere Tarifart kommt; die unberührte Frist wechselt.
  await notiz.getByRole('textbox').fill('Vertrag läuft über Jonas');
  await notiz.getByText('vorgeschlagen aus Tarifart Mobilfunk').waitFor({ state: 'detached' });
  await tarifart.getByRole('button', { name: 'Ändern' }).click();
  await tarifart.getByRole('combobox').fill('Strom');
  await tarifart.getByRole('option', { name: 'Strom' }).click();
  await frist.getByText('vorgeschlagen aus Tarifart Strom').waitFor();
  assert.equal(await notiz.getByRole('textbox').inputValue(), 'Vertrag läuft über Jonas');
  await mappe.getByRole('button', { name: 'Mappe speichern' }).click();
  await s.waitForURL(new RegExp(`/ablage/${abo.id}/[0-9a-f-]{36}$`));
  const id = s.url().split('/').pop();
  const gespeichert = (await api('GET', `/api/mappen/${id}`, { cookie: await sitzung(LENA) })).daten.mappe.werte;
  assert.deepEqual([gespeichert.frist, gespeichert.notiz], [{ anzahl: 2, einheit: 'wochen' }, 'Vertrag läuft über Jonas']);
});

// Externe Dienste und KI-Kosten (#565): Systemzustand zeigt beide Abschnitte; Zeitraum umschalten, Monatsbudget mit harter
// Grenze speichern und wieder leeren (ohne KI-Paket ohne Wirkung).
rauchtest('Systemzustand: Externe Dienste und KI-Kosten, Monatsbudget speichern (#565)', { als: LENA, erwartet: [{ status: 409, pfad: /^\/api\/wiederherstellung\/sicherungen$/ }] }, async (s) => {
  await s.goto(BASIS + '/ablage/start');
  await verwalten(s);
  await s.goto(BASIS + '/werkbank/systemzustand');
  const extern = s.locator('#externe-dienste');
  await extern.getByRole('heading', { name: 'Externe Dienste' }).waitFor();
  await extern.getByRole('button', { name: 'Letzte Stunde' }).click();
  await extern.getByText(/In der letzten Stunde hat Ablago keinen externen Dienst aufgerufen|Aufrufe/).first().waitFor();
  const kosten = s.locator('#ki-kosten');
  await kosten.getByRole('heading', { name: 'KI-Kosten und Budget' }).waitFor();
  await kosten.getByLabel(/^Monatsbudget/).fill('20');
  await kosten.getByLabel(/^Harte Grenze/).check();
  await kosten.getByRole('button', { name: /speichern$/ }).click();
  await kosten.getByText('Gespeichert.', { exact: true }).first().waitFor();
  assert.equal(await kosten.getByLabel(/^Monatsbudget/).inputValue(), '20');
  assert.ok(await kosten.getByLabel(/^Harte Grenze/).isChecked());
  await kosten.getByLabel(/^Monatsbudget/).fill('');
  await kosten.getByRole('button', { name: /speichern$/ }).click();
  await s.waitForFunction(() => document.querySelector('#ki-kosten-budget')?.value === '' && !document.querySelector('#ki-kosten-hart')?.checked);
});

// Passkeys (#811): Chromium mit einem virtuellen Authenticator (DevTools-Protokoll, Fingerabdruck „ja“). Lena fügt in Mein
// Konto → Sicherheit einen Passkey hinzu, meldet sich ab und mit dem Passkey wieder an (ohne E-Mail-Adresse) und entfernt
// ihn – die Anmeldung mit Passkey ist frisch, also ohne erneute Abfrage. Am Ende ist kein Passkey mehr da.
rauchtest('Passkey: hinzufügen, damit anmelden, entfernen (#811)', { als: LENA }, async (s, k) => {
  const cdp = await k.newCDPSession(s);
  await cdp.send('WebAuthn.enable');
  await cdp.send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
  await s.goto(BASIS + '/profil/sicherheit');
  const blatt = s.locator('#passkeys');
  await blatt.getByRole('heading', { name: 'Passkeys' }).waitFor();
  await blatt.getByRole('button', { name: 'Passkey hinzufügen' }).click();
  await blatt.getByLabel('Name').fill('Rauchtest-Laptop');
  await blatt.getByRole('button', { name: 'Weiter' }).click();
  await blatt.getByText(/„Rauchtest-Laptop“ ist hinzugefügt/).waitFor();
  await blatt.getByText('Rauchtest-Laptop', { exact: true }).waitFor();
  // Abmelden, dann mit dem Passkey wieder hinein.
  await k.clearCookies();
  await s.goto(BASIS + '/');
  await s.getByRole('heading', { name: 'Anmelden' }).waitFor();
  await s.getByRole('button', { name: 'Mit Passkey anmelden' }).click();
  await s.getByRole('heading', { name: 'Guten Tag, Lena', level: 1 }).waitFor();
  await s.goto(BASIS + '/profil/sicherheit');
  await blatt.getByText(/zuletzt benutzt am/).waitFor();
  await blatt.getByRole('button', { name: 'Entfernen' }).click();
  await s.getByRole('alertdialog', { name: '„Rauchtest-Laptop“ entfernen?' }).getByRole('button', { name: 'Entfernen' }).click();
  await blatt.getByText('Rauchtest-Laptop', { exact: true }).waitFor({ state: 'detached' });
});

// Baum der Ansichten ohne Neuladen (#888): Eine für alle gesperrte Ansicht (R entzogen) sieht Lena nur im
// Verwaltungsmodus. Beginnen und Beenden des Modus und Änderungen an Ansichten aus einer anderen Sitzung zeigt der Baum
// sofort bzw. nach dem nächsten Nachfragen (#919) – ohne F5. Ein Link auf einen Mappentyp zeigt „Alle Mappen: …“.
rauchtest('Ansichten: Baum ohne Neuladen nach Verwaltungsmodus und Änderungen (#888)', { als: LENA }, async (s) => {
  const verwaltung = await sitzung(LENA);
  await api('POST', '/api/konto/verwaltung', { cookie: verwaltung, body: { passwort: LENA.passwort } });
  const vertrag = (await api('GET', '/api/typen', { cookie: verwaltung })).daten.find((x) => x.name === 'Vertrag');
  const gesperrt = { grund: { R: false, C: false, E: false }, regeln: [] };
  const sicht = (await api('POST', '/api/sichten/definitionen', { cookie: verwaltung, body: { name: 'Rauchtest gesperrt', typen: [vertrag.id], berechtigungen: gesperrt } })).daten;
  try {
    const baum = s.getByRole('complementary', { name: 'Ansichten' });
    const eintrag = (name) => baum.getByRole('link', { name: new RegExp(`^${name}`) });
    await s.goto(BASIS + '/ablage/start');
    await eintrag('Vertrag').first().waitFor();
    assert.equal(await eintrag('Rauchtest gesperrt').count(), 0, 'gesperrte Ansicht ohne Verwaltungsmodus nicht im Baum');
    // Im Verwaltungsmodus erscheint sie, nach „Verwaltung beenden“ ist sie wieder weg – ohne Neuladen.
    await verwalten(s);
    await s.getByRole('navigation', { name: 'Bereiche' }).getByRole('link', { name: 'Ablage' }).click();
    await eintrag('Rauchtest gesperrt').waitFor();
    await s.getByRole('button', { name: 'Verwaltung beenden' }).click();
    await s.getByRole('region', { name: 'Du verwaltest gerade Ablago.' }).waitFor({ state: 'detached' });
    await eintrag('Rauchtest gesperrt').waitFor({ state: 'detached' });
    // Eine andere Sitzung gibt die Ansicht frei und benennt sie um: Der Baum holt den neuen Stand selbst.
    await api('PUT', `/api/sichten/definitionen/${sicht.id}`, { cookie: verwaltung, body: { name: 'Rauchtest offen', typen: [vertrag.id], berechtigungen: { grund: { R: true, C: true, E: true }, regeln: [] } } });
    await eintrag('Rauchtest offen').waitFor({ timeout: 40_000 });
    // Ist die Ansicht des Mappentyps (gleiche Id) gesperrt, zeigt ein Link auf den Mappentyp – wie nach einem Klick auf
    // eine Erwähnung – klar die Liste des Mappentyps, nicht die gesperrte Ansicht.
    const typSicht = (await api('GET', '/api/sichten/definitionen', { cookie: verwaltung })).daten.find((x) => x.id === vertrag.id);
    await api('PUT', `/api/sichten/definitionen/${vertrag.id}`, { cookie: verwaltung, body: { ...typSicht, name: 'Rauchtest Verträge gesperrt', berechtigungen: gesperrt } });
    try {
      await s.goto(BASIS + `/ablage/${vertrag.id}`);
      const liste = s.getByRole('region', { name: 'Mappen' });
      await liste.getByRole('heading', { name: /^Alle Mappen: Vertrag/, level: 1 }).waitFor();
      await liste.getByRole('link', { name: /Stromvertrag Haus/ }).first().waitFor();
      assert.equal(await s.getByText('Rauchtest Verträge gesperrt').count(), 0, 'kein Name der gesperrten Ansicht');
    } finally {
      await api('PUT', `/api/sichten/definitionen/${vertrag.id}`, { cookie: verwaltung, body: typSicht });
    }
  } finally {
    await api('DELETE', `/api/sichten/definitionen/${sicht.id}`, { cookie: verwaltung });
  }
});

/* ---------- Hilfen ---------- */

/** Am Handy darf die Seite nicht waagerecht rollen (die genaue Prüfung je Element macht mobil-pruefen.mjs). */
async function keineWaagerechteRolle(s) {
  const { breit, sicht } = await s.evaluate(() => ({ breit: document.documentElement.scrollWidth, sicht: document.documentElement.clientWidth }));
  assert.ok(breit <= sicht, `Die Seite ist am Handy breiter als der Bildschirm (${breit} > ${sicht} px)`);
}

// #978: Suche über der Liste der Mappentypen wie in der Ablage – Fundstelle, Trefferzahl, Esc, keine Treffer, zurücksetzen.
rauchtest('Werkbank: Mappentypen und Ansichten durchsuchen, Fundstellen, keine Treffer (#978)', { als: LENA }, async (s) => {
  await s.goto(BASIS + '/ablage/start');
  await verwalten(s);
  await s.goto(BASIS + '/werkbank/typen');
  const elemente = s.getByRole('region', { name: 'Elemente' });
  const suche = elemente.getByRole('searchbox', { name: 'Mappentypen durchsuchen' });
  await suche.fill('einzelpreis');
  // Gefunden im Feld der Auftragsposition (Teil von Auftrag, #1031) – mit Fundstelle unter dem Namen.
  const treffer = elemente.getByRole('link', { name: /^Auftragsposition/ });
  await treffer.waitFor();
  await treffer.getByText('Teil von Auftrag').waitFor();
  await treffer.locator('mark', { hasText: 'Einzelpreis' }).waitFor();
  await elemente.getByText('1 Treffer', { exact: true }).waitFor();
  assert.equal(await elemente.getByRole('link', { name: /^Vertrag \d+ Felder/ }).count(), 0, 'Vertrag passt nicht und steht nicht da');
  // Esc leert das Feld, die Liste ist wieder vollständig.
  await suche.press('Escape');
  assert.equal(await suche.inputValue(), '');
  await elemente.getByRole('link', { name: /^Vertrag \d+ Felder/ }).waitFor();
  await elemente.getByText(/^\d+ Mappentypen$/).waitFor();
  // Nichts gefunden: ruhiger Satz und der Weg zurück.
  await suche.fill('xylofonunterricht');
  await elemente.getByText('Keine Treffer.').waitFor();
  await elemente.getByRole('button', { name: 'Suche und Filter zurücksetzen' }).click();
  assert.equal(await suche.inputValue(), '');
  // „×“ leert ebenfalls; Ansichten haben dasselbe Feld.
  await suche.fill('vertrag');
  await elemente.getByRole('button', { name: 'Suche leeren' }).click();
  assert.equal(await suche.inputValue(), '');
  await s.goto(BASIS + '/werkbank/sichten');
  await elemente.getByRole('searchbox', { name: 'Ansichten durchsuchen' }).fill('xylofonunterricht');
  await elemente.getByText('Keine Treffer.').waitFor();
});

// #994: Auskünfte – Haken „Nur offene zeigen“ statt „offen · alle“, die Vorgaben rechts statt „Einstellungen“ in der Liste;
// gemeldete Fehler mit Suchfeld und „Erledigte zeigen“ darunter.
rauchtest('Werkbank: Auskünfte und gemeldete Fehler – Suchfeld oben, Filter darunter (#994)', { als: LENA }, async (s) => {
  await s.goto(BASIS + '/ablage/start');
  await verwalten(s);
  await s.goto(BASIS + '/werkbank/auskuenfte');
  const elemente = s.getByRole('region', { name: 'Elemente' });
  const bearbeitung = s.getByRole('region', { name: 'Bearbeitung' });
  await elemente.getByRole('searchbox', { name: 'Auskünfte durchsuchen' }).waitFor();
  const offene = elemente.getByRole('checkbox', { name: 'Nur offene zeigen' });
  assert.equal(await offene.isChecked(), true, 'Vorgabe: nur offene');
  assert.equal(await elemente.getByRole('link', { name: 'Einstellungen' }).count(), 0, 'kein Link „Einstellungen“ mehr in der Liste');
  await bearbeitung.getByRole('heading', { name: 'Vorgaben für jede Auskunft' }).waitFor();
  await bearbeitung.getByRole('button', { name: 'Einstellungen speichern' }).waitFor();
  await offene.uncheck();
  await elemente.getByText('Noch keine Auskunft.').waitFor();
  // Der Assistent verweist auf die Vorgaben (am Handy der Weg dorthin).
  await elemente.getByRole('link', { name: '+ Neu' }).click();
  await bearbeitung.getByRole('link', { name: 'Vorgaben für jede Auskunft' }).click();
  await s.waitForURL(/\/werkbank\/auskuenfte\/einstellungen$/);
  await bearbeitung.getByRole('heading', { name: 'Vorgaben für jede Auskunft', level: 1 }).waitFor();
  // Gemeldete Fehler.
  await s.goto(BASIS + '/werkbank/fehlermeldungen');
  await elemente.getByRole('searchbox', { name: 'Gemeldete Fehler durchsuchen' }).waitFor();
  await elemente.getByRole('checkbox', { name: 'Erledigte zeigen' }).check();
  await elemente.getByText('Noch keine Meldungen.').waitFor();
});

rauchtest('Handy: Mappentypen durchsuchen (#978)', { handy: true, als: LENA }, async (s) => {
  await s.goto(BASIS + '/ablage/start');
  await verwalten(s);
  await s.goto(BASIS + '/werkbank/typen');
  const suche = s.getByRole('searchbox', { name: 'Mappentypen durchsuchen' });
  await suche.fill('einzelpreis');
  await s.getByRole('link', { name: /^Auftragsposition/ }).waitFor();
  await keineWaagerechteRolle(s);
});

// #992: Gleichbedeutende Wörter als eigener Bereich – anlegen mit „+ Neu“, Prüfung (doppelt), Reihenfolge, Suche über
// jedes Wort, Hinweis auf eine andere Gruppe mit Link, Entfernen mit Rückfrage; „Suche und Volltext“ verweist hierher.
rauchtest('Werkbank: Gleichbedeutende Wörter – Liste mit Suche, Wörter einzeln bearbeiten (#992)', { als: LENA }, async (s) => {
  await s.goto(BASIS + '/ablage/start');
  await verwalten(s);
  await s.goto(BASIS + '/werkbank/texterkennung');
  await s.getByRole('link', { name: 'Gleichbedeutende Wörter' }).last().click();
  await s.waitForURL(/\/werkbank\/woerter$/);
  const elemente = s.getByRole('region', { name: 'Elemente' });
  const bearbeitung = s.getByRole('region', { name: 'Bearbeitung' });
  await elemente.getByRole('link', { name: '+ Neu' }).click();
  await s.waitForURL(/\/werkbank\/woerter\/neu$/);
  await bearbeitung.getByRole('textbox', { name: 'Wort 1' }).fill('Beleg');
  await bearbeitung.getByRole('textbox', { name: 'Wort 2' }).fill('beleg');
  await bearbeitung.getByRole('button', { name: 'Gruppe anlegen' }).click();
  await bearbeitung.getByText('Steht schon weiter oben.').waitFor();
  await bearbeitung.getByRole('textbox', { name: 'Wort 2' }).fill('Rechnung');
  await bearbeitung.getByRole('button', { name: '+ Wort' }).click();
  await bearbeitung.getByRole('textbox', { name: 'Wort 3' }).fill('Faktura');
  // Reihenfolge: „Rechnung“ nach oben – unter dem ersten Wort steht die Gruppe in der Liste.
  await bearbeitung.getByRole('button', { name: '„Rechnung“ nach oben' }).click();
  assert.equal(await bearbeitung.getByRole('textbox', { name: 'Wort 1' }).inputValue(), 'Rechnung');
  await bearbeitung.getByRole('button', { name: 'Gruppe anlegen' }).click();
  await s.waitForURL(/\/werkbank\/woerter\/[0-9a-f-]{36}$/);
  await bearbeitung.getByRole('heading', { name: 'Rechnung', level: 1 }).waitFor();
  // Zweite Gruppe mit „Beleg“: Hinweis mit Link auf die erste.
  await elemente.getByRole('link', { name: '+ Neu' }).click();
  await bearbeitung.getByRole('textbox', { name: 'Wort 1' }).fill('Quittung');
  await bearbeitung.getByRole('textbox', { name: 'Wort 2' }).fill('Beleg');
  await bearbeitung.getByText('Steht auch in:').getByRole('link', { name: 'Rechnung' }).waitFor();
  await bearbeitung.getByRole('button', { name: 'Gruppe anlegen' }).click();
  await s.waitForURL(/\/werkbank\/woerter\/[0-9a-f-]{36}$/);
  // Suche findet jedes Wort, nicht nur das erste.
  const suche = elemente.getByRole('searchbox', { name: 'Gleichbedeutende Wörter durchsuchen' });
  await suche.fill('faktura');
  await elemente.getByText('1 Treffer', { exact: true }).waitFor();
  await elemente.locator('mark', { hasText: 'Faktura' }).waitFor();
  await suche.fill('beleg');
  await elemente.getByText('2 Treffer', { exact: true }).waitFor();
  // Entfernen mit Rückfrage.
  await elemente.getByRole('link', { name: /^Quittung/ }).click();
  await bearbeitung.getByRole('button', { name: 'Entfernen', exact: true }).click();
  await s.getByRole('alertdialog').getByRole('button', { name: 'Entfernen' }).click();
  await s.waitForURL(/\/werkbank\/woerter$/);
  await suche.fill('');
  await elemente.getByText('1 Gruppe', { exact: true }).waitFor();
});

/* ---------- Vorschaubild aus der Archivfassung (#1216) ---------- */

/** Eine kleine E-Mail (nur Persona-Adressen), wie sie ein Postfach oder Hochladen ablegt. */
const BEISPIEL_EML = Buffer.from([
  'From: Lena Beispiel <lena@example.org>', 'To: Jonas Beispiel <jonas@example.org>', 'Subject: Termin Heizungswartung',
  'Date: Mon, 15 Nov 2027 09:30:00 +0100', 'MIME-Version: 1.0', 'Content-Type: text/plain; charset=utf-8', '',
  'Hallo Jonas, der Termin für die Heizungswartung ist am Donnerstag um 10 Uhr.', '',
].join('\r\n'));

/**
 * Archivfassung einer Datei so ablegen, wie das Paket für PDF/A sie hinterlässt (#631) – im Rauchtest gibt es keins:
 * erst der Stand „wartet“ (archivfassungen/<ab>/<Prüfwert>.stand), dann die Fassung (.fassung und .json, Stand weg).
 */
async function archivOrdner(sha) {
  const dateien = join(process.env.DMS_DATENWURZEL ?? join(import.meta.dirname, '../../data'), 'files');
  for (const haushalt of await readdir(dateien)) {
    const ablage = join(dateien, haushalt);
    if (!(await stat(join(ablage, sha.slice(0, 2), sha)).then(() => true, () => false))) continue;
    const ordner = join(ablage, 'archivfassungen', sha.slice(0, 2));
    await mkdir(ordner, { recursive: true });
    return ordner;
  }
  throw new Error(`Datei ${sha} nicht im Ordner ${dateien} gefunden.`);
}
const PDFA_PAKET = { id: 'pdfa', name: 'PDF/A', version: '1.0.0' };
async function archivfassungWartet(sha) {
  await writeFile(join(await archivOrdner(sha), `${sha}.stand`), JSON.stringify({ stand: 'wartet', info: null, paket: PDFA_PAKET, zeit: new Date().toISOString() }));
}
async function archivfassungAblegen(sha, pdf) {
  const ordner = await archivOrdner(sha);
  await writeFile(join(ordner, `${sha}.fassung`), pdf);
  await writeFile(join(ordner, `${sha}.json`), JSON.stringify({ mime: 'application/pdf', groesse: pdf.length, sha256: createHash('sha256').update(pdf).digest('hex'), seiten: 1,
    pdfa: { teil: 2, stufe: 'B' }, paket: PDFA_PAKET, erstellt: new Date().toISOString() }));
  await rm(join(ordner, `${sha}.stand`), { force: true });
}

rauchtest('Dokumentliste: E-Mail mit fertiger Archivfassung zeigt ihr Vorschaubild, ohne nur „EML“ (#1216)', {
  als: LENA,
  // Beim ersten Abruf gibt es das Bild noch nicht (404) – es entsteht im Hintergrund, die Liste fragt kurz darauf noch einmal.
  erwartet: [{ status: 404, pfad: /^\/api\/dokumente\/[^/]+\/vorschau$/ }],
}, async (s) => {
  const cookie = await sitzung(LENA);
  // Eine eigene Mappe im Mappentyp aus den Daten (beendet: ändert nichts an „Ist der Stichtag leer“).
  const { typ } = daten.archiv;
  const mappe = (await api('POST', '/api/mappen', { cookie, body: { typId: typ.id, werte: { objekt: 'Heizungsraum Hofweg', beendet: '2027-01-31' } } })).daten;
  const mail = (await api('POST', `/api/mappen/${mappe.id}/dokumente?register=dokumente&name=${encodeURIComponent('Termin Heizungswartung.eml')}&typ=message/rfc822`, { cookie, body: BEISPIEL_EML, roh: true })).daten.dokument;
  // Archivfassung wird noch erstellt: das Kästchen mit der Endung.
  await archivfassungWartet(mail.sha256);
  await s.goto(BASIS + `/ablage/${typ.id}/${mappe.id}`);
  await s.getByRole('region', { name: 'Mappe' }).getByRole('tab', { name: 'Dokumente 1' }).click();
  const liste = s.locator('.dokzeile').filter({ hasText: 'Termin Heizungswartung.eml' });
  await liste.locator('.vorschaubild.ohne', { hasText: 'EML' }).waitFor();
  // Archivfassung fertig: Ohne die Mappe neu zu laden, kommt das Bild aus ihrer ersten Seite – gekennzeichnet.
  await archivfassungAblegen(mail.sha256, beispielPdf('Von: Lena Beispiel\nBetreff: Termin Heizungswartung'));
  const bild = liste.locator('img.vorschaubild');
  await bild.waitFor({ timeout: 45_000 });
  assert.equal(await bild.getAttribute('title'), 'Vorschau aus der umgewandelten Fassung eines Pakets');
  await s.waitForFunction((el) => el.complete && el.naturalWidth > 0, await bild.elementHandle(), { timeout: 20_000 });
  assert.equal(await liste.locator('.vorschaubild.ohne').count(), 0);
});

/* ---------- Ablage aus Bausteinen: axe und Tippflächen (#1211, #1212) ---------- */

/** Bereiche der Ablage, die #1211/#1212 umgestellt haben – ohne die Kopfzeile (#1218, #1219 bauen sie neu). */
const ABLAGE_BEREICHE = ['.spalte.sichten', '.spalte.liste', '.spalte.mappe'];

/**
 * Die Seiten der Ablage, die #1211/#1212 auf Bausteine umgestellt haben: Mappe (Formular und Speicherleiste),
 * Dokumentliste, Post, erweiterte Suche, Zu erledigen (Liste und Monat), Papierkorb. Je Seite ein Name und der Weg
 * dorthin (Daten über die Schnittstelle).
 */
async function ablageSeiten(cookie) {
  const typ = daten.bausteine;
  // Eine Mappe mit einem PDF für die Dokumentliste; eine zweite für den Papierkorb.
  const mitDok = (await api('POST', '/api/mappen', { cookie, body: { typId: typ.id, werte: { objekt: 'Keller Bausteine' } } })).daten;
  await api('POST', `/api/mappen/${mitDok.id}/dokumente?register=dokumente&name=${encodeURIComponent('Übergabeprotokoll.pdf')}&typ=application/pdf`, { cookie, body: beispielPdf('Übergabeprotokoll Keller'), roh: true });
  const weg = (await api('POST', '/api/mappen', { cookie, body: { typId: typ.id, werte: { objekt: 'Abstellraum Bausteine' } } })).daten;
  const post = (await api('POST', '/api/post', { cookie, body: { betreff: 'Kellerschlüssel Bausteine' } })).daten;
  await api('POST', `/api/mappen/${post.id}/dokumente?register=dokumente&name=${encodeURIComponent('Kellerschlüssel.pdf')}&typ=application/pdf`, { cookie, body: beispielPdf('Kellerschluessel'), roh: true });
  await api('DELETE', `/api/mappen/${weg.id}?grund=nicht_noetig`, { cookie });
  return [
    { name: 'Mappe', weg: async (s) => {
      await s.goto(BASIS + `/ablage/${typ.id}/${mitDok.id}`);
      await s.getByRole('region', { name: 'Mappe' }).getByRole('button', { name: 'Mappe speichern' }).waitFor();
    } },
    { name: 'Dokumente', weg: async (s) => {
      await s.goto(BASIS + `/ablage/${typ.id}/${mitDok.id}`);
      await s.getByRole('region', { name: 'Mappe' }).getByRole('tab', { name: /^Dokumente/ }).click();
      await s.locator('.dokzeile').filter({ hasText: 'Übergabeprotokoll.pdf' }).first().waitFor();
    } },
    { name: 'Post', weg: async (s) => {
      // Die Post-Mappe selbst (Leiste mit Stand, Zuordnen, Erkannt), nicht die Seite „Dokument übernehmen“ (#1217).
      await s.goto(BASIS + `/ablage/${post.typId}/${post.id}?als=post`);
      await s.getByRole('region', { name: 'Mappe' }).getByRole('tab').first().waitFor();
    } },
    { name: 'Suche', weg: async (s) => {
      await s.goto(BASIS + '/ablage/suche');
      await s.getByRole('form', { name: 'Erweiterte Suche' }).waitFor();
    } },
    { name: 'Aufgaben', weg: async (s) => {
      await s.goto(BASIS + '/ablage/eingang');
      await s.getByRole('radiogroup', { name: /Ansicht/ }).waitFor();
    } },
    { name: 'Termine', weg: async (s) => {
      await s.goto(BASIS + '/ablage/eingang');
      await s.getByRole('radio', { name: 'Monat' }).click();
      await s.locator('.ka-raster, .ka-monat').first().waitFor();
    } },
    { name: 'Papierkorb', weg: async (s) => {
      await s.goto(BASIS + '/ablage/papierkorb');
      await s.getByRole('region', { name: 'Mappen' }).getByRole('link', { name: /Abstellraum Bausteine/ }).first().click();
      await s.getByRole('heading', { name: 'Abstellraum Bausteine', level: 1 }).first().waitFor();
    } },
  ];
}

/** Kopfzeile mit dem Suchfeld oben (#1218) und der Assistent (#1219) – in den Zuständen, die es gibt. */
const KOPF_BEREICHE = ['[data-anker="startseite.suche"]', '[data-begleiter]'];
async function kopfUndAssistent(s, pruefe) {
  await mitFragen(s);
  await mitHandbuch(s);
  const typen = (await api('GET', '/api/typen', { cookie: await sitzung(LENA) })).daten;
  await s.goto(BASIS + '/ablage/start');
  await s.getByRole('heading', { name: 'Guten Tag, Lena', level: 1 }).waitFor();
  await pruefe('Startseite');
  await s.goto(BASIS + `/ablage/${typen.find((x) => x.name === 'Vertrag').id}`);
  const kopf = s.getByRole('banner');
  const lupe = kopf.getByRole('button', { name: 'Suchen', exact: true });
  const feld = kopf.getByRole('searchbox', { name: 'Vertrag durchsuchen' });
  // Am Handy steht nur die Lupe; erst sie klappt das Feld auf.
  await feld.or(lupe).first().waitFor();
  if (await lupe.isVisible()) await lupe.click();
  await feld.fill('Haus');
  await kopf.getByRole('button', { name: /Suchen in/ }).click();
  await kopf.getByRole('group', { name: 'Suchen in' }).waitFor();
  await pruefe('Ansicht mit „Suchen in“');
  await s.keyboard.press('Escape');
  await s.getByRole('button', { name: /^Assistent öffnen/ }).click();
  const fenster = s.getByRole('dialog', { name: 'Assistent' });
  for (const r of ['Fragen', 'Tipps', 'Handbuch']) {
    await fenster.getByRole('radio', { name: new RegExp(`^${r}`) }).click();
    if (r === 'Handbuch') await fenster.getByRole('searchbox', { name: 'Im Handbuch suchen' }).fill('Post');
    await s.waitForTimeout(300);
    await pruefe(`Assistent ${r}`);
  }
}

rauchtest('Kopfzeile und Assistent: axe ohne Verstoß, hell und dunkel (#1218, #1219)', { als: LENA }, async (s) => {
  const funde = [];
  for (const schema of ['light', 'dark']) {
    await s.emulateMedia({ colorScheme: schema });
    await kopfUndAssistent(s, async (name) => { for (const v of await axePruefen(s, KOPF_BEREICHE)) funde.push(`${name} (${schema}): ${v}`); });
  }
  assert.deepEqual(funde, [], `axe meldet Verstöße:\n${funde.join('\n')}`);
});

rauchtest('Handy: Kopfzeile und Assistent mit 44-px-Tippflächen (#1218, #1219)', { handy: true, als: LENA }, async (s) => {
  const funde = [];
  await kopfUndAssistent(s, async (name) => { for (const v of await tippflaechenPruefen(s, KOPF_BEREICHE)) funde.push(`${name}: ${v}`); });
  assert.deepEqual(funde, [], `Zu kleine Tippflächen am Handy:\n${funde.join('\n')}`);
});

rauchtest('Ablage aus Bausteinen: axe ohne Verstoß, hell und dunkel (#1211, #1212)', { als: LENA }, async (s) => {
  const seiten = await ablageSeiten(await sitzung(LENA));
  const funde = [];
  for (const schema of ['light', 'dark']) {
    await s.emulateMedia({ colorScheme: schema });
    for (const seite of seiten) {
      await seite.weg(s);
      await s.waitForLoadState('networkidle');
      for (const v of await axePruefen(s, ABLAGE_BEREICHE)) funde.push(`${seite.name} (${schema}): ${v}`);
    }
  }
  assert.deepEqual(funde, [], `axe meldet Verstöße:\n${funde.join('\n')}`);
});

rauchtest('Handy: Ablage aus Bausteinen mit 44-px-Tippflächen (#1211, #1212)', { handy: true, als: LENA }, async (s) => {
  const seiten = await ablageSeiten(await sitzung(LENA));
  const funde = [];
  for (const seite of seiten) {
    await seite.weg(s);
    await s.waitForLoadState('networkidle');
    for (const v of await tippflaechenPruefen(s, ABLAGE_BEREICHE)) funde.push(`${seite.name}: ${v}`);
  }
  assert.deepEqual(funde, [], `Zu kleine Tippflächen am Handy:\n${funde.join('\n')}`);
});

/* ---------- Werkbank aus Bausteinen: axe und Tippflächen (#1214) ---------- */

/** Mitte und rechte Spalte der Werkbank – ohne Kopfzeile und Bereichsliste (andere Issues). */
const WERKBANK_BEREICHE = ['.spalte.liste', '.spalte.mappe'];

/**
 * Seiten der Werkbank, die #1214 auf Bausteine umgestellt hat: Pakete, Benutzer und Sicherheit, Post und Eingänge,
 * Daten sichern, Betrieb. Je Seite ein Name, der Weg und worauf gewartet wird.
 */
async function werkbankSeiten(s) {
  // Im Verwaltungsmodus über die Seite selbst (die Sitzung des Browsers darf die Werkbank lesen).
  const lena = (await s.evaluate(async () => (await fetch('/api/benutzer', { headers: { 'x-dms': '1' } })).json())).find((b) => b.email === 'lena@example.org');
  const seite = (name, weg, warte) => ({ name, weg: async (p) => {
    await p.goto(BASIS + weg);
    await (warte ? warte(p) : p.locator('.spalte.liste:visible, .spalte.mappe:visible').first().waitFor());
  } });
  return [
    seite('Pakete', '/werkbank/pakete'),
    seite('Paket erstellen', '/werkbank/pakete/erstellen'),
    seite('Benutzer', `/werkbank/benutzer/${lena.id}`, (s) => s.locator('[data-sprungleiste]').waitFor()),
    seite('Neuer Benutzer', '/werkbank/benutzer/neu'),
    seite('Verschlüsselung', '/werkbank/verschluesselung', (s) => s.locator('#notfallkontakte').waitFor()),
    seite('Auskünfte', '/werkbank/auskuenfte'),
    seite('Löschkonzept', '/werkbank/loeschkonzept'),
    seite('Postfach neu', '/werkbank/postfaecher/neu', (s) => s.locator('[data-sprungleiste]').waitFor()),
    seite('Eingangsordner', '/werkbank/eingangsordner'),
    seite('WebDAV', '/werkbank/webdav'),
    seite('Texterkennung', '/werkbank/texterkennung', (s) => s.getByRole('tablist').first().waitFor()),
    seite('Sicherung', '/werkbank/sicherung'),
    seite('Vollexport', '/werkbank/vollexport'),
    seite('Betrieb', '/werkbank/betrieb'),
    seite('Region', '/werkbank/region'),
    seite('Sprachen', '/werkbank/sprachen'),
    seite('Aufgaben', '/werkbank/aufgaben', (s) => s.locator('[data-anker="werkbank.aufgaben.suche"]').waitFor()),
    seite('Anmeldeschutz', '/werkbank/anmeldeschutz'),
    seite('Systemzustand', '/werkbank/systemzustand'),
    seite('Protokoll', '/werkbank/protokoll'),
    seite('Fehlermeldungen', '/werkbank/fehlermeldungen', (s) => s.getByRole('searchbox').first().waitFor()),
    seite('Wartung', '/werkbank/wartung'),
    seite('Demo-Daten', '/werkbank/demo'),
  ];
}

// Wiederherstellen (Abschnitt der Sicherung) antwortet außerhalb des Wartungsmodus mit 409 – das ist gewollt.
const WERKBANK_ERWARTET = [{ status: 409, pfad: /^\/api\/wiederherstellung\/sicherungen$/ }];

rauchtest('Werkbank aus Bausteinen: axe ohne Verstoß, hell und dunkel (#1214)', { als: LENA, erwartet: WERKBANK_ERWARTET }, async (s) => {
  await s.goto(BASIS + '/ablage/start');
  await verwalten(s);
  const seiten = await werkbankSeiten(s);
  const funde = [];
  for (const schema of ['light', 'dark']) {
    await s.emulateMedia({ colorScheme: schema });
    for (const seite of seiten) {
      await seite.weg(s);
      await s.waitForLoadState('networkidle');
      for (const v of await axePruefen(s, WERKBANK_BEREICHE)) funde.push(`${seite.name} (${schema}): ${v}`);
    }
  }
  assert.deepEqual(funde, [], `axe meldet Verstöße:\n${funde.join('\n')}`);
});

// Am Handy in fünf Teilen: Die Messung jedes Bedienelements braucht Zeit (Grenze je Rauchtest 120 s).
for (const teil of [0, 1, 2, 3, 4]) {
  rauchtest(`Handy: Werkbank aus Bausteinen mit 44-px-Tippflächen, Teil ${teil + 1} (#1214)`, { handy: true, als: LENA, erwartet: WERKBANK_ERWARTET }, async (s) => {
    await s.goto(BASIS + '/ablage/start');
    await verwalten(s);
    const alle = await werkbankSeiten(s);
    const seiten = alle.filter((_, i) => i % 5 === teil);
    const funde = [];
    for (const seite of seiten) {
      const beginn = Date.now();
      await seite.weg(s);
      await s.waitForLoadState('networkidle');
      for (const v of await tippflaechenPruefen(s, WERKBANK_BEREICHE)) funde.push(`${seite.name}: ${v}`);
      // Dauer je Seite im Protokoll, damit eine langsame Seite in der CI sofort auffällt.
      console.log(`# Werkbank Handy ${seite.name}: ${Math.round((Date.now() - beginn) / 1000)} s`);
    }
    assert.deepEqual(funde, [], `Zu kleine Tippflächen am Handy:\n${funde.join('\n')}`);
  });
}

/* ---------- Werkbank „Ablage aufbauen“ aus Bausteinen: axe (#1213) ---------- */

rauchtest('Werkbank „Ablage aufbauen“ aus Bausteinen: axe ohne Verstoß, hell und dunkel (#1213)', { als: LENA }, async (s) => {
  const typ = daten.bausteine;
  await s.goto(BASIS + '/ablage/start');
  await verwalten(s);
  const seiten = ['/werkbank', '/werkbank/ansicht', `/werkbank/typen/${typ.id}`, '/werkbank/sichten/neu', '/werkbank/automatisierungen/ziele',
    '/werkbank/nummernkreise/archivnummer', '/werkbank/stempel/neu', '/werkbank/designs/neu', '/werkbank/woerter/neu', '/werkbank/organisation'];
  const funde = [];
  for (const schema of ['light', 'dark']) {
    await s.emulateMedia({ colorScheme: schema });
    for (const weg of seiten) {
      await s.goto(BASIS + weg);
      await s.waitForLoadState('networkidle');
      // Editoren mit Bereichen (#1000): alles aufklappen, damit axe auch die Felder darin sieht.
      const alle = s.locator('[data-sprungleiste]').getByRole('button', { name: 'Alle aufklappen' });
      if (await alle.count() && await alle.isVisible()) await alle.click();
      for (const v of await axePruefen(s, WERKBANK_BEREICHE)) funde.push(`${weg} (${schema}): ${v}`);
    }
  }
  assert.deepEqual(funde, [], `axe meldet Verstöße:\n${funde.join('\n')}`);
});

/* ---------- Mein Konto, Entdecken und Systemseiten aus Bausteinen: axe und Tippflächen (#1215) ---------- */

/** Inhalt der Seite und das Benutzermenü – ohne die Kopfzeile selbst (#1218, #1219 bauen sie neu). */
const KONTO_BEREICHE = ['main.rumpf', '.benutzermenue .menue'];

/** Seiten, die #1215 auf Bausteine umgestellt hat: je Name, Weg, worauf gewartet wird und welcher Bereich zählt. */
function kontoSeiten() {
  const seite = (name, weg, warte, bereich = KONTO_BEREICHE) => ({ name, bereich, weg: async (p) => { await p.goto(BASIS + weg); await warte(p); } });
  return [
    seite('Konto', '/profil/konto', (p) => p.getByRole('heading', { name: /^Meine Rechte/ }).waitFor()),
    seite('Sicherheit', '/profil/sicherheit', (p) => p.locator('.sitzungsliste').first().waitFor()),
    seite('Darstellung', '/profil/darstellung', (p) => p.getByRole('radiogroup', { name: 'Schriftgröße' }).waitFor()),
    seite('Benachrichtigungen', '/profil/benachrichtigungen', (p) => p.getByRole('switch').first().waitFor()),
    seite('Abwesenheit', '/profil/abwesenheit', (p) => p.getByRole('switch', { name: 'Abwesend' }).waitFor()),
    seite('Fehler melden', '/profil/fehler-melden', (p) => p.getByLabel('Was ist passiert?').waitFor()),
    seite('Ablago entdecken', '/entdecken', (p) => p.getByRole('region', { name: 'Tipps' }).getByRole('link').first().waitFor()),
    seite('Benutzermenü', '/profil/konto', async (p) => { await p.locator('.benutzermenue .wer').click(); await p.locator('.benutzermenue .menue').waitFor(); }, ['.benutzermenue .menue']),
    seite('Notfallzugang', '/notfall', (p) => p.getByRole('heading', { level: 1 }).waitFor(), ['main.kartenseite']),
  ];
}

rauchtest('Mein Konto und Systemseiten aus Bausteinen: axe ohne Verstoß, hell und dunkel (#1215)', { als: LENA }, async (s) => {
  const funde = [];
  for (const schema of ['light', 'dark']) {
    await s.emulateMedia({ colorScheme: schema });
    for (const seite of kontoSeiten()) {
      await seite.weg(s);
      await s.waitForLoadState('networkidle');
      for (const v of await axePruefen(s, seite.bereich)) funde.push(`${seite.name} (${schema}): ${v}`);
    }
  }
  assert.deepEqual(funde, [], `axe meldet Verstöße:\n${funde.join('\n')}`);
});

rauchtest('Handy: Mein Konto und Systemseiten aus Bausteinen mit 44-px-Tippflächen (#1215)', { handy: true, als: LENA }, async (s) => {
  const funde = [];
  for (const seite of kontoSeiten()) {
    await seite.weg(s);
    await s.waitForLoadState('networkidle');
    for (const v of await tippflaechenPruefen(s, seite.bereich)) funde.push(`${seite.name}: ${v}`);
  }
  assert.deepEqual(funde, [], `Zu kleine Tippflächen am Handy:\n${funde.join('\n')}`);
});

/* ---------- Ablago antwortet nicht (#1198) ---------- */

rauchtest('Handy: Startbild, „antwortet gerade nicht“ ohne React, von selbst wieder da (#1198)', {
  handy: true,
  // Nachgestellt: Die Gesundheitsprüfung meldet „datenbank“ (503), solange die Datenbank hängt.
  erwartet: [{ status: 503, pfad: /^\/api\/gesundheit$/ }],
}, async (s, k) => {
  // Hängende Datenbank nachstellen: /api/sprache antwortet nie, die Gesundheitsprüfung meldet „datenbank“.
  await k.route('**/api/sprache', () => {});
  // #1199: mit Befund – Ablago hängt seit drei Minuten (wie /api/gesundheit ihn liefert).
  const befund = { ok: false, zustand: 'datenbank', datenbank: 'antwortet-nicht', seit: new Date(Date.now() - 180_000).toISOString(), dauerS: 180 };
  await k.route('**/api/gesundheit', (r) => r.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify(befund) }));
  await s.goto(BASIS + '/', { waitUntil: 'domcontentloaded' });
  // Sofort das Startbild aus index.html (ohne Skript), in der Sprache des Browsers.
  await s.getByText('Verbindung zu Ablago wird aufgebaut …').waitFor();
  assert.equal(await s.getByText('Connecting to Ablago …').isVisible(), false, 'nur eine Sprache sichtbar');
  // Nach einigen Sekunden (CSS): „antwortet noch nicht“.
  await s.waitForFunction(() => getComputedStyle(document.querySelector('.startbild-spaeter[data-sprache="de"]')).opacity === '1');
  // Nach der Zeitgrenze: Meldung ohne React mit „Erneut versuchen“.
  const meldung = s.locator('#keine-antwort');
  await meldung.getByRole('heading', { name: 'Ablago antwortet gerade nicht.' }).waitFor();
  // Hilfe zur Selbsthilfe (#1199): was los ist, was man tun kann, Handbuch, Uhrzeit – ohne Aktion und ohne Protokoll.
  await meldung.getByText('Ablago läuft, bekommt aber seit 3 Minuten keine Antwort von seiner Datenbank.', { exact: false }).waitFor();
  const schritte = await meldung.locator('ol.startbild-schritte li').allInnerTexts();
  assert.equal(schritte.length, 3, schritte.join(' | '));
  assert.match(schritte[1], /Ablago-Container neu starten/);
  assert.match(await meldung.getByRole('link', { name: /Alle Schritte im Handbuch/ }).getAttribute('href'), /^https:\/\/help\.ablago\.app\/.+laedt-nicht$/);
  await meldung.getByText(/^Zuletzt geprüft um \d\d:\d\d/).waitFor();
  assert.deepEqual(await meldung.getByRole('button').allInnerTexts(), ['Erneut versuchen'], 'kein Knopf außer „Erneut versuchen“ (kein Neustart ohne Anmeldung)');
  assert.equal(await meldung.getByText(/Schon neu geladen|allein hat nicht geholfen/).count(), 0);
  // Barrierefrei hell und dunkel, Tippflächen am Handy.
  const funde = [];
  for (const schema of ['light', 'dark']) {
    await s.emulateMedia({ colorScheme: schema });
    for (const v of await axePruefen(s, ['#keine-antwort'])) funde.push(`${schema}: ${v}`);
  }
  await s.emulateMedia({ colorScheme: 'light' });
  for (const v of await tippflaechenPruefen(s, ['#keine-antwort'])) funde.push(`Tippfläche: ${v}`);
  assert.deepEqual(funde, [], funde.join('\n'));
  await meldung.getByRole('button', { name: 'Erneut versuchen' }).click();
  // Neu geladen, Ablago antwortet weiter nicht: Hinweis, was dann hilft.
  await s.locator('#keine-antwort').getByText('Neu laden allein hat nicht geholfen – dann hilft meist Schritt 2.').waitFor();
  // Datenbank wieder da: Die Seite merkt es von selbst und startet die Oberfläche.
  await k.unrouteAll({ behavior: 'ignoreErrors' });
  await s.getByRole('heading', { name: 'Anmelden' }).waitFor({ timeout: 45_000 });
});

rauchtest('Handy: „antwortet gerade nicht“ bei abgewiesener Datenbank nennt den Datenbank-Container (#1199)', {
  handy: true,
  erwartet: [{ status: 503, pfad: /^\/api\/gesundheit$/ }],
}, async (s, k) => {
  // Datenbank aus: Die Verbindung wird abgelehnt – Schritt 2 heißt dann nicht „Ablago neu starten“, sondern Datenbank prüfen.
  await k.route('**/api/sprache', () => {});
  await k.route('**/api/gesundheit', (r) => r.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ ok: false, zustand: 'datenbank', datenbank: 'abgewiesen', seit: new Date().toISOString(), dauerS: 20 }) }));
  await s.goto(BASIS + '/', { waitUntil: 'domcontentloaded' });
  const meldung = s.locator('#keine-antwort');
  await meldung.getByText(/erreicht aber seit weniger als einer Minute seine Datenbank nicht – sie ist vermutlich aus\./).waitFor({ timeout: 30_000 });
  assert.match((await meldung.locator('ol.startbild-schritte li').allInnerTexts())[1], /Container der Datenbank läuft/);
  await k.unrouteAll({ behavior: 'ignoreErrors' });
});

/* ---------- Datum vorschlagen (#1180) ---------- */

/** Den Dialog der Vorlage an der Mappe öffnen (Menü „Mappe“). */
async function vorschlagDialog(s) {
  const { werkzeug, mappe, vorlage } = daten.vorschlag;
  await s.goto(BASIS + `/ablage/${werkzeug.id}/${mappe.id}`);
  const bereich = s.getByRole('region', { name: 'Mappe' });
  await bereich.getByRole('heading', { name: 'Bohrhammer', level: 1 }).waitFor();
  await bereich.getByRole('button', { name: 'Mappe', exact: true }).click();
  await s.getByRole('menuitem', { name: vorlage.name }).click();
  const dialog = bereich.getByRole('region', { name: vorlage.name });
  await dialog.getByLabel('Am').waitFor();
  return dialog;
}

rauchtest('Automatisierungsvorlage: Datum „in 14 Tagen“ vorbelegt und änderbar, an der Mappe und beim Ausprobieren (#1180)', { als: LENA }, async (s) => {
  const { vorlage } = daten.vorschlag;
  const funde = [];
  const dialog = await vorschlagDialog(s);
  assert.equal(await dialog.getByLabel('Am').inputValue(), inTagen(14), 'vorbelegt mit heute + 14 Tage');
  await dialog.getByText(/^Vorgeschlagen: /).waitFor();
  for (const schema of ['light', 'dark']) {
    await s.emulateMedia({ colorScheme: schema });
    // Knöpfe wechseln ihre Fläche mit einem kurzen Übergang – erst danach messen (wie im Assistenten).
    await s.waitForTimeout(400);
    for (const v of await axePruefen(s, ['.spalte.mappe'])) funde.push(`Dialog an der Mappe (${schema}): ${v}`);
  }
  await s.emulateMedia({ colorScheme: 'light' });
  // Geändert: Der Ablauf steht unter „Geplant“ mit dem neuen Datum.
  await dialog.getByLabel('Am').fill(inTagen(20));
  await dialog.getByLabel('Text').fill('Akku prüfen');
  await dialog.getByRole('button', { name: vorlage.name }).click();
  await dialog.waitFor({ state: 'detached' });
  const [j, m, t] = inTagen(20).split('-');
  await s.getByRole('region', { name: 'Mappe' }).getByText(`${t}.${m}.${j}`).first().waitFor();
  // Werkbank: Haken „Datum“ frei wählbar und an, Kurzform „(änderbar)“, Ausprobieren vorbelegt.
  await verwalten(s);
  await s.goto(BASIS + `/werkbank/ablaufvorlagen/${encodeURIComponent(vorlage.kennung)}`);
  const bearbeitung = s.getByRole('region', { name: 'Bearbeitung' });
  const fragen = bearbeitung.getByRole('group', { name: 'Fragt beim Anwenden' });
  const haken = fragen.getByRole('checkbox', { name: 'Datum' });
  await haken.waitFor();
  assert.ok(await haken.isChecked() && await haken.isEnabled(), 'bei „In …“ frei wählbar und an');
  await bearbeitung.getByText('Läuft: In 14 Tagen (änderbar).').waitFor();
  assert.equal(await bearbeitung.locator('input[type="date"]').inputValue(), inTagen(14), 'Ausprobieren wie der Dialog vorbelegt');
  for (const schema of ['light', 'dark']) {
    await s.emulateMedia({ colorScheme: schema });
    // Knöpfe wechseln ihre Fläche mit einem kurzen Übergang – erst danach messen (wie im Assistenten).
    await s.waitForTimeout(400);
    for (const v of await axePruefen(s, WERKBANK_BEREICHE)) funde.push(`Vorlage in der Werkbank (${schema}): ${v}`);
  }
  // Ohne Haken: fest – die Kurzform ohne „(änderbar)“ (nicht gespeichert).
  await haken.uncheck();
  await bearbeitung.getByText('Läuft: In 14 Tagen.').waitFor();
  assert.deepEqual(funde, [], `axe meldet Verstöße:\n${funde.join('\n')}`);
});

rauchtest('Handy: Dialog „Erinnere mich in 14 Tagen“ mit 44-px-Tippflächen (#1180)', { handy: true, als: LENA }, async (s) => {
  const funde = [];
  await vorschlagDialog(s);
  await s.waitForLoadState('networkidle');
  for (const v of await tippflaechenPruefen(s, ['.spalte.mappe'])) funde.push(`Dialog an der Mappe: ${v}`);
  assert.deepEqual(funde, [], `Zu kleine Tippflächen am Handy:\n${funde.join('\n')}`);
});

rauchtest('Handy: Vorlage in der Werkbank mit 44-px-Tippflächen (#1180)', { handy: true, als: LENA }, async (s) => {
  const { vorlage } = daten.vorschlag;
  const funde = [];
  await s.goto(BASIS + '/ablage/start');
  await verwalten(s);
  await s.goto(BASIS + `/werkbank/ablaufvorlagen/${encodeURIComponent(vorlage.kennung)}`);
  await s.getByRole('group', { name: 'Fragt beim Anwenden' }).waitFor();
  await s.waitForLoadState('networkidle');
  for (const v of await tippflaechenPruefen(s, WERKBANK_BEREICHE)) funde.push(`Vorlage: ${v}`);
  assert.deepEqual(funde, [], `Zu kleine Tippflächen am Handy:\n${funde.join('\n')}`);
});
