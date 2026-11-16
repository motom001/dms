/**
 * Gemeinsame Hilfen der Rauchtests (#897, aufgeteilt in #1234): Browser, Anmelden über die Schnittstelle, Beispiel-PDF,
 * Rahmen `rauchtest(…)` mit Fehlersammlung und Knopf-Wächter (#1210), Verwaltungsmodus und kleine Hilfen, die mehrere
 * Bereiche brauchen. axe und Tippflächen stehen in muster.mjs, ebenso das Warten auf eine ruhige Seite (#1266);
 * `schemaWechseln` hier nutzt es. Diese Datei legt selbst keine Tests an.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test, after, before } from 'node:test';
import { chromium } from 'playwright';
import { anfragenZaehlen, seiteRuhig } from './muster.mjs';

export const BASIS = (process.env.DMS_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const FEHLERORDNER = process.argv[2] ?? process.env.DMS_RAUCHTEST_BILDER ?? 'rauchtest-fehler';
// Bilder der Musterseite (#967): immer, nicht nur bei Fehlern – zum Ansehen im Pull Request.
export const MUSTERORDNER = process.argv[3] ?? process.env.DMS_MUSTER_BILDER ?? 'rauchtest-muster';
// Persona-Namen (Lena richtet ein, Jonas ist neu dabei) und nur Beispiel-Domains.
export const LENA = { email: 'lena@example.org', name: 'Lena Beispiel', passwort: 'rauchtest-passwort-1' };
export const JONAS = { email: 'jonas@example.org', name: 'Jonas Beispiel', passwort: 'rauchtest-passwort-2' };
export const DESKTOP = { viewport: { width: 1366, height: 900 } };
const HANDY = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true };

export let browser;
/** Ist Ablago eingerichtet und sind die Daten angelegt? Sonst sind die übrigen Tests sinnlos. */
let bereit = false;
/** Die Einrichtung meldet, dass Ablago eingerichtet und die Daten angelegt sind. */
export function bereitMelden() {
  bereit = true;
}
/** Ids der Daten, die die Tests brauchen (vorbereiten). */
export const daten = {};

before(async () => {
  await mkdir(FEHLERORDNER, { recursive: true });
  browser = await chromium.launch();
});
after(async () => {
  await browser?.close();
});

/* ---------- Schnittstelle ---------- */

export async function api(methode, pfad, { cookie, body, roh } = {}) {
  const r = await fetch(BASIS + pfad, {
    method: methode,
    headers: {
      'x-dms': '1',
      ...(cookie ? { cookie } : {}),
      ...(body !== undefined ? { 'content-type': roh ? 'application/octet-stream' : 'application/json' } : {}),
    },
    body: body === undefined ? undefined : roh ? body : JSON.stringify(body),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`${methode} ${pfad}: ${r.status} ${text}`);
  return { daten: text ? JSON.parse(text) : null, cookie: r.headers.get('set-cookie')?.split(';')[0] };
}

/** Anmelden über die Schnittstelle (schneller als das Formular, das nur „Anmelden“ selbst prüft). */
export async function sitzung(person) {
  const { cookie } = await api('POST', '/api/konto/anmelden', { body: { email: person.email, passwort: person.passwort } });
  if (!cookie) throw new Error(`Anmelden als ${person.email}: kein Cookie`);
  return cookie;
}

export async function warteAufAblago() {
  for (let i = 0; i < 120; i++) {
    // Auch im Einrichtungsmodus erreichbar.
    try {
      if ((await fetch(`${BASIS}/api/konto/status`)).ok) return;
    } catch {
      /* startet noch */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Ablago unter ${BASIS} antwortet nicht.`);
}

export async function einrichtungscode() {
  if (process.env.DMS_EINRICHTUNGSCODE) return process.env.DMS_EINRICHTUNGSCODE;
  const datei = join(process.env.DMS_DATENWURZEL ?? join(import.meta.dirname, '../../data'), 'geheim', 'EINRICHTUNGSCODE');
  for (let i = 0; i < 60; i++) {
    try {
      return (await readFile(datei, 'utf8')).trim();
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  throw new Error(`Einrichtungscode nicht gefunden (${datei}).`);
}

// Beispiel-PDFs stehen in pdf.mjs (#1276: auch die Oberflächen-Messung braucht sie, ohne node:test).
export { beispielPdf, beispielPdfSeiten } from './pdf.mjs';

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
    for (const el of document.querySelectorAll('[data-knopf="anlegen"]'))
      if (sichtbar(el) && !text(el).startsWith('+')) funde.push(['anlegen-ohne-plus', el]);
    for (const el of document.querySelectorAll('[data-knopf="gefahr"]')) {
      const gesperrt = el.disabled || el.getAttribute('aria-disabled') === 'true';
      if (sichtbar(el) && !gesperrt && el.getAttribute('aria-haspopup') !== 'dialog') funde.push(['gefahr-ohne-rueckfrage', el]);
    }
    for (const el of document.querySelectorAll('.knopf.gefahr, [data-knopf="entscheidung"]'))
      if (sichtbar(el) && !el.closest('dialog.rueckfrage')) funde.push(['rot-ausserhalb-rueckfrage', el]);
    for (const [art, el] of funde) {
      const f = { art, text: text(el), pfad: location.pathname };
      const schluessel = `${f.art}|${f.text}|${f.pfad}`;
      if (gemeldet.has(schluessel)) continue;
      gemeldet.add(schluessel);
      window.__knopfFund?.(f);
    }
  };
  let geplant = 0;
  const plane = () => {
    if (!geplant)
      geplant = setTimeout(() => {
        geplant = 0;
        pruefe();
      }, 120);
  };
  new MutationObserver(plane).observe(document, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['data-knopf', 'class', 'aria-haspopup', 'aria-disabled', 'disabled', 'hidden', 'open'],
  });
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
  if (ungenutzt.length)
    console.log(
      `# Knopf-Ausnahmen ohne Fund (#1210) – wenn umgestellt, bitte herausnehmen: ${ungenutzt.map((a) => `${a.art} ${a.text} (${a.issue})`).join('; ')}`,
    );
});

/* ---------- Rahmen für einen Rauchtest ---------- */

/**
 * Archivfassung einer Datei so ablegen, wie das Paket für PDF/A sie hinterlässt (#631) – im Rauchtest gibt es keins:
 * erst der Stand „wartet“ (archivfassungen/<ab>/<Prüfwert>.stand), dann die Fassung (.fassung und .json, Stand weg).
 */
async function archivOrdner(sha) {
  const dateien = join(process.env.DMS_DATENWURZEL ?? join(import.meta.dirname, '../data'), 'files');
  for (const haushalt of await readdir(dateien)) {
    const ablage = join(dateien, haushalt);
    if (
      !(await stat(join(ablage, sha.slice(0, 2), sha)).then(
        () => true,
        () => false,
      ))
    )
      continue;
    const ordner = join(ablage, 'archivfassungen', sha.slice(0, 2));
    await mkdir(ordner, { recursive: true });
    return ordner;
  }
  throw new Error(`Datei ${sha} nicht im Ordner ${dateien} gefunden.`);
}
const PDFA_PAKET = { id: 'pdfa', name: 'PDF/A', version: '1.0.0' };
export async function archivfassungWartet(sha) {
  await writeFile(
    join(await archivOrdner(sha), `${sha}.stand`),
    JSON.stringify({ stand: 'wartet', info: null, paket: PDFA_PAKET, zeit: new Date().toISOString() }),
  );
}
export async function archivfassungAblegen(sha, pdf) {
  const ordner = await archivOrdner(sha);
  await writeFile(join(ordner, `${sha}.fassung`), pdf);
  await writeFile(
    join(ordner, `${sha}.json`),
    JSON.stringify({
      mime: 'application/pdf',
      groesse: pdf.length,
      sha256: createHash('sha256').update(pdf).digest('hex'),
      seiten: 1,
      pdfa: { teil: 2, stufe: 'B' },
      paket: PDFA_PAKET,
      erstellt: new Date().toISOString(),
    }),
  );
  await rm(join(ordner, `${sha}.stand`), { force: true });
}

/**
 * Ein Rauchtest: eigener Browser-Kontext (Desktop oder Handy), auf Wunsch schon angemeldet. Sammelt Fehler der
 * Konsole und der Seite, fehlgeschlagene Anfragen und Antworten ab 400; am Ende muss die Liste leer sein.
 *
 * optionen.erwartet: Antworten, die zu diesem Weg gehören – je { status, pfad: RegExp }.
 * optionen.neustart: Pfade, bei denen eine abgelehnte Verbindung erwartet ist, weil Ablago gerade neu startet.
 * optionen.timeout: eigene Zeitgrenze in ms (Vorgabe und höchstens 120 s).
 * Nicht als Fehler zählen:
 *   - „Failed to load resource“ in der Konsole: Chromium meldet so jede Antwort ab 400 – die prüft der Test selbst
 *     (mit den erwarteten Ausnahmen);
 *   - net::ERR_ABORTED: abgebrochene Anfragen (Seitenwechsel, Download abgebrochen) und Antworten ohne gelesenen
 *     Inhalt (z. B. 204 auf einen Merker) meldet Chromium so, obwohl Ablago geantwortet hat.
 */
export function rauchtest(name, optionen, ablauf) {
  test(name, { timeout: Math.min(optionen.timeout ?? 120_000, 120_000) }, async (t) => {
    if (!optionen.einrichtung && !bereit) {
      t.skip('Einrichtung gescheitert');
      return;
    }
    const k = await browser.newContext({ locale: 'de-DE', timezoneId: 'Europe/Berlin', ...(optionen.handy ? HANDY : DESKTOP) });
    // Kürzer als die Vorgabe von Playwright (30 s): Ein kaputter Weg soll schnell auffallen.
    k.setDefaultTimeout(15_000);
    k.setDefaultNavigationTimeout(30_000);
    // Offene Anfragen mitzählen: axe und Tippflächen messen erst, wenn keine mehr läuft (#1266).
    anfragenZaehlen(k);
    const erwartet = optionen.erwartet ?? [];
    const fehler = [];
    k.on('console', (m) => {
      if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) fehler.push(`Konsole: ${m.text()}`);
    });
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
      if (a) genutzteAusnahmen.add(a);
      else fehler.push(`Knopf (#1210): ${f.art} „${f.text}“ auf ${f.pfad}`);
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
      // Umgeschriebene Antworten (page.route) können beim Schließen noch laufen; ihr „Response has been disposed“
      // käme sonst nach dem Test als unbehandelter Fehler an und machte den ganzen Lauf rot.
      await k.unrouteAll({ behavior: 'ignoreErrors' }).catch(() => {});
      for (const p of k.pages()) await p.unrouteAll({ behavior: 'ignoreErrors' }).catch(() => {});
      await k.close();
    }
    assert.deepEqual(fehler, [], `Fehler im Browser bei „${name}“`);
  });
}

/**
 * Hell/dunkel umschalten und warten, bis die Seite ruhig ist (#1266): Die Farben blenden nach dem Umschalten über; axe
 * misst sonst eine Zwischenfarbe (2,4:1 statt 4,5:1). Statt eigener Wartezeiten, Neuladen oder `mouse.move(0, 0)` in
 * jedem Test immer diesen Helfer nehmen. `schema`: 'light' oder 'dark'.
 */
export async function schemaWechseln(s, schema) {
  await s.emulateMedia({ colorScheme: schema });
  await seiteRuhig(s);
}

/** Das Benutzermenü oben rechts öffnen (Knopf mit dem eigenen Namen); seit #1215 ein Aufklapper ohne role="menu". */
export async function benutzermenue(s, person) {
  await s.getByRole('banner').getByRole('button', { name: person.name }).click();
  return s.locator('.benutzermenue .menue');
}

/** Heute (Europe/Berlin, wie der Browser der Rauchtests) plus `tage` als JJJJ-MM-TT. */
export function inTagen(tage) {
  const heute = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin' }).format(new Date());
  const d = new Date(`${heute}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + tage);
  return d.toISOString().slice(0, 10);
}

export const mitFragen = (s) => s.route('**/api/fragen', (r) => r.fulfill({ json: { verfuegbar: true, paket: 'KI-Assistent' } }));
const HANDBUCH_VERZEICHNIS = {
  config: { lang: ['de'] },
  docs: [
    { location: 'post/', title: 'Post', text: '<p>Neue Post kommt per Scan, Mail oder + Neu.</p>' },
    {
      location: 'post/#dokument-ubernehmen',
      title: 'Dokument übernehmen',
      text: '<p>Klickst du in Neue Post eine Post an, öffnet sich die Seite Dokument übernehmen.</p>',
    },
  ],
};
export const mitHandbuch = (s) => s.route('**/hilfe/*/search/search_index.json', (r) => r.fulfill({ json: HANDBUCH_VERZEICHNIS }));

/** Verwaltungsmodus über das Benutzermenü; fragt Ablago nach dem Passwort, wird es eingegeben. */
export async function verwalten(s) {
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

/** Am Handy darf die Seite nicht waagerecht rollen (die genaue Prüfung je Element macht mobil-pruefen.mjs). */
export async function keineWaagerechteRolle(s) {
  const { breit, sicht } = await s.evaluate(() => ({
    breit: document.documentElement.scrollWidth,
    sicht: document.documentElement.clientWidth,
  }));
  assert.ok(breit <= sicht, `Die Seite ist am Handy breiter als der Bildschirm (${breit} > ${sicht} px)`);
}

/** Bereiche der Ablage, die #1211/#1212 umgestellt haben – ohne die Kopfzeile (#1218, #1219 bauen sie neu). */
export const ABLAGE_BEREICHE = ['.spalte.sichten', '.spalte.liste', '.spalte.mappe'];

/** Mitte und rechte Spalte der Werkbank – ohne Kopfzeile und Bereichsliste (andere Issues). */
export const WERKBANK_BEREICHE = ['.spalte.liste', '.spalte.mappe'];

/** Werkbank → Ablaufvorlage → Ausprobieren (#1176): Mappe „Bohrhammer“ wählen und den Dialog als Probe öffnen. */
export async function probeDialog(bearbeitung, name) {
  await bearbeitung.getByRole('combobox', { name: 'Mappe', exact: true }).fill('Bohr');
  await bearbeitung.getByRole('option', { name: /Bohrhammer/ }).click();
  await bearbeitung.getByRole('button', { name: 'Ausprobieren', exact: true }).click();
  const dialog = bearbeitung.getByRole('region', { name });
  await dialog.getByText('Probe – es wird nichts angelegt.').waitFor();
  return dialog;
}
