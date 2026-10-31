/**
 * Oberflächentest der erweiterten Suche (#199): Formular, Chips, Link in der Adresse, Handy-Ablauf.
 *
 * Läuft im Workflow „Handbuch“ nach aufnehmen.mjs (gleiche Daten, gleicher Administrator).
 *
 *   DMS_URL=http://localhost:3000 node docs/handbuch/screenshots/suche-pruefen.mjs [bilderordner]
 *
 * Bei einem Fehler liegt ein Bild im Bilderordner.
 */
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';

const BASIS = process.env.DMS_URL ?? 'http://localhost:3000';
const ZIEL = process.argv[2] ?? 'suche-fehler';
const ADMIN = { email: 'anna@beispiel.de', passwort: 'handbuch-passwort-1' };

const anm = await fetch(`${BASIS}/api/konto/anmelden`, { method: 'POST', headers: { 'x-dms': '1', 'content-type': 'application/json' }, body: JSON.stringify(ADMIN) });
if (!anm.ok) throw new Error(`Anmelden: ${anm.status} ${await anm.text()}`);
const [name, wert] = (anm.headers.get('set-cookie') ?? '').split(';')[0].split('=');

const browser = await chromium.launch();
let s;
const pruefe = (bedingung, text) => { if (!bedingung) throw new Error(text); };
const zahl = async () => Number(((await s.locator('.listenzahl').first().textContent()) ?? '').match(/^\s*([\d.]+)\s+Treffer/)?.[1]?.replace(/\./g, '') ?? NaN);
const warteZahl = async (soll) => {
  for (let i = 0; i < 40; i++) { if (await soll(await zahl().catch(() => NaN))) return; await s.waitForTimeout(150); }
  throw new Error(`Trefferzahl passt nicht: ${await zahl().catch(() => '–')}`);
};

try {
  /* ---------- Breiter Bildschirm ---------- */
  const k = await browser.newContext({ viewport: { width: 1400, height: 900 }, locale: 'de-DE', timezoneId: 'Europe/Berlin' });
  await k.addCookies([{ name, value: wert, url: BASIS }]);
  s = await k.newPage();
  await s.goto(`${BASIS}/ablage/eingang`);
  await s.getByRole('link', { name: /Erweiterte Suche/ }).first().click();
  await s.waitForURL(/\/ablage\/suche/);
  const form = s.getByRole('form', { name: 'Erweiterte Suche' });
  await form.getByLabel('Rechnung', { exact: true }).check();
  await form.getByLabel('Rechnungsdatum von').fill('2026-01-15');
  await form.getByLabel('Rechnungsdatum bis').fill('2026-01-15');
  await form.getByRole('button', { name: 'Suchen' }).click();
  await s.waitForURL(/rechnungsdatum\.von=2026-01-15/);
  await s.getByText('Rechnungsdatum 15.01.2026–15.01.2026').waitFor();
  // Beispieldaten und Demo-Daten: JA-2025-0815 ist am 15.01.2026, R-2026-117 nicht.
  await warteZahl((n) => n >= 1);
  const n1 = await zahl();
  await s.locator('.spalte.liste').getByText(/JA-2025-0815/).first().waitFor();
  console.log('ok  Formular → Treffer und Chips');

  // × am Chip entfernt die Bedingung und sucht sofort neu.
  await s.getByRole('button', { name: /Bedingung „Rechnungsdatum .*“ entfernen/ }).click();
  await s.waitForURL((u) => !u.search.includes('rechnungsdatum'));
  await warteZahl((n) => n > n1);
  console.log('ok  Chip entfernen');

  // Zurück im Browser: wieder mit Datum.
  await s.goBack();
  await warteZahl((n) => n === n1);
  console.log('ok  Zurück im Browser');

  // Link öffnen: Formular aus der Adresse, erste Bedingung wirkt.
  await s.goto(`${BASIS}/ablage/suche?typ=Rechnung&bezahlt=nein`);
  await warteZahl((n) => n >= 1);
  pruefe(await s.getByLabel('Rechnung', { exact: true }).isChecked(), 'Typ aus dem Link nicht gewählt');
  pruefe(await s.getByRole('radiogroup', { name: 'Bezahlt' }).getByLabel('nein').isChecked(), 'Ja/Nein aus dem Link fehlt');
  await s.getByText('Bezahlt: nein').waitFor();
  console.log('ok  Link öffnen');
  await k.close();

  /* ---------- Handy ---------- */
  const h = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'de-DE', timezoneId: 'Europe/Berlin' });
  await h.addCookies([{ name, value: wert, url: BASIS }]);
  s = await h.newPage();
  await s.goto(`${BASIS}/ablage/suche`);
  const hform = s.getByRole('form', { name: 'Erweiterte Suche' });
  await hform.waitFor();
  pruefe(!(await s.locator('.spalte.liste').isVisible()), 'Am Handy sollte erst nur das Formular stehen');
  await hform.getByLabel('Rechnung', { exact: true }).check();
  await hform.getByLabel('Suchbegriff im Volltext').fill('Rechnung');
  await hform.getByRole('button', { name: 'Suchen' }).click();
  await s.locator('.spalte.liste').waitFor();
  pruefe(!(await hform.isVisible()), 'Nach „Suchen“ sollte die Trefferliste stehen');
  await s.getByRole('button', { name: /Suche ändern/ }).click();
  await hform.waitFor();
  pruefe(await hform.getByLabel('Suchbegriff im Volltext').inputValue() === 'Rechnung', 'Eingaben gingen verloren');
  console.log('ok  Handy: Formular, Treffer, Suche ändern');
  await h.close();
} catch (e) {
  await mkdir(ZIEL, { recursive: true });
  const bild = join(ZIEL, 'suche-fehler.png');
  await s?.screenshot({ path: bild, fullPage: true }).catch(() => {});
  console.error(`Erweiterte Suche: ${e.message}\n  Bild: ${bild}`);
  await browser.close();
  process.exit(1);
}
await browser.close();
console.log('Erweiterte Suche in Ordnung.');
