/**
 * Oberflächentest der erweiterten Suche (#199, #426): Formular oben in der Mitte, Bedingungen bei Bedarf,
 * Zusammenfassung, Link in der Adresse, Handy-Ablauf.
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
const ADMIN = { email: 'lena@example.org', passwort: 'handbuch-passwort-1' };

const anm = await fetch(`${BASIS}/api/konto/anmelden`, { method: 'POST', headers: { 'x-dms': '1', 'content-type': 'application/json' }, body: JSON.stringify(ADMIN) });
if (!anm.ok) throw new Error(`Anmelden: ${anm.status} ${await anm.text()}`);
const [name, wert] = (anm.headers.get('set-cookie') ?? '').split(';')[0].split('=');
// Werkbank und Mappentypen gehen seit #819 nur im Verwaltungsmodus; direkt nach der Anmeldung ohne erneute Abfrage.
await fetch(`${BASIS}/api/konto/verwaltung`, { method: 'POST', headers: { 'x-dms': '1', 'content-type': 'application/json', cookie: `${name}=${wert}` }, body: '{}' });

const browser = await chromium.launch();
let s;
const pruefe = (bedingung, text) => { if (!bedingung) throw new Error(text); };
const zahl = async () => Number(((await s.locator('.listenzahl').first().textContent()) ?? '').match(/^\s*([\d.]+)\s+Treffer/)?.[1]?.replace(/\./g, '') ?? NaN);
// #601: Das „?“ steht direkt hinter der Überschrift, nicht allein in einer Zeile darunter.
const hilfeImKopf = async () => pruefe(await s.locator('.listenkopf h1 .hilfesymbol').isVisible(), 'Das Hilfe-Symbol sollte direkt hinter der Überschrift „Erweiterte Suche“ stehen');
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
  await form.waitFor();
  await hilfeImKopf();
  // #426: Formular oben in der Mitte; ohne geöffnete Mappe reicht die Mitte bis rechts, links bleibt die Navigation.
  pruefe(!(await s.locator('.spalte.mappe').isVisible()), 'Ohne geöffnete Mappe sollte es rechts keine Spalte geben');
  pruefe(await s.locator('.spalte.sichten .sichtliste').isVisible(), 'Links sollte die Navigation bleiben');
  // Mappentyp wie beim Verweisfeld (#602): Suchfeld, Vorschlag, gewählter Typ darunter.
  await form.getByLabel('Mappentyp suchen …').fill('Rechn');
  await form.getByRole('option', { name: 'Rechnung', exact: true }).click();
  await form.getByRole('list', { name: 'Mappentypen' }).getByText('Rechnung', { exact: true }).waitFor();
  // #602: Die gewählten Typen stehen unter dem Suchfeld – es bleibt auf einer Höhe mit „Volltext“.
  const hoehe = async (l) => (await form.getByLabel(l).boundingBox())?.y ?? NaN;
  pruefe(Math.abs(await hoehe('Mappentyp suchen …') - await hoehe('Suchbegriff im Volltext')) < 1, 'Das Feld „Mappentypen“ sollte auf einer Höhe mit „Volltext“ bleiben');
  // Felder nur bei Bedarf: „+ Bedingung“ → Rechnungsdatum.
  pruefe(!(await form.getByLabel('Rechnungsdatum von').count()), 'Felder sollten erst mit „+ Bedingung“ erscheinen');
  await form.getByLabel('Feld für eine neue Bedingung').selectOption({ label: 'Rechnungsdatum' });
  await form.getByLabel('Rechnungsdatum von').fill('2026-01-15');
  await form.getByLabel('Rechnungsdatum bis').fill('2026-01-15');
  await form.getByRole('button', { name: 'Suchen' }).click();
  await s.waitForURL(/rechnungsdatum\.von=2026-01-15/);
  await s.getByText('Rechnungsdatum 15.01.2026–15.01.2026').waitFor();
  pruefe(!(await form.isVisible()), 'Nach „Suchen“ sollte das Formular zugeklappt sein');
  // Beispieldaten und Demo-Daten: JA-2025-0815 ist am 15.01.2026, R-2026-117 nicht.
  await warteZahl((n) => n >= 1);
  const n1 = await zahl();
  await s.locator('.spalte.liste').getByText(/JA-2025-0815/).first().waitFor();
  console.log('ok  Formular → Treffer und Zusammenfassung');

  // × am Chip entfernt die Bedingung und sucht sofort neu.
  await s.getByRole('button', { name: /Bedingung „Rechnungsdatum .*“ entfernen/ }).click();
  await s.waitForURL((u) => !u.search.includes('rechnungsdatum'));
  await warteZahl((n) => n > n1);
  console.log('ok  Chip entfernen');

  // Zurück im Browser: wieder mit Datum.
  await s.goBack();
  await warteZahl((n) => n === n1);
  console.log('ok  Zurück im Browser');

  // Link öffnen: Bedingungen aus der Adresse; ein Klick auf die Zusammenfassung öffnet das Formular.
  await s.goto(`${BASIS}/ablage/suche?typ=Rechnung&bezahlt=nein`);
  await warteZahl((n) => n >= 1);
  await s.getByRole('button', { name: 'Bezahlt: nein', exact: true }).click();
  await form.waitFor();
  pruefe(await form.getByRole('list', { name: 'Mappentypen' }).getByText('Rechnung', { exact: true }).waitFor({ timeout: 10000 }).then(() => true, () => false), 'Typ aus dem Link nicht gewählt');
  pruefe(await form.getByRole('group', { name: 'Bezahlt' }).getByLabel('nein').isChecked(), 'Ja/Nein aus dem Link fehlt');
  console.log('ok  Link öffnen, Zusammenfassung anklicken');

  // Treffer öffnen: rechts die Mappe, die Mitte wird schmaler.
  await form.getByRole('button', { name: 'Formular einklappen' }).click();
  await form.waitFor({ state: 'hidden' });
  await warteZahl((n) => n >= 1);
  await s.locator('.spalte.liste .eintrag, .spalte.liste tbody a').first().click();
  await s.locator('.spalte.mappe').waitFor();
  console.log('ok  Treffer öffnen');
  await k.close();

  /* ---------- Handy ---------- */
  const h = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'de-DE', timezoneId: 'Europe/Berlin' });
  await h.addCookies([{ name, value: wert, url: BASIS }]);
  s = await h.newPage();
  await s.goto(`${BASIS}/ablage/suche`);
  const hform = s.getByRole('form', { name: 'Erweiterte Suche' });
  await hform.waitFor();
  await hilfeImKopf();
  pruefe(!(await s.locator('.listenrumpf').isVisible()), 'Am Handy sollte erst nur das Formular stehen');
  await hform.getByLabel('Mappentyp suchen …').fill('Rechnung');
  await hform.getByRole('option', { name: 'Rechnung', exact: true }).click();
  await hform.getByLabel('Suchbegriff im Volltext').fill('Rechnung');
  await hform.getByRole('button', { name: 'Suchen' }).click();
  await s.locator('.listenrumpf').waitFor();
  pruefe(!(await hform.isVisible()), 'Nach „Suchen“ sollte die Trefferliste stehen');
  await s.getByRole('button', { name: 'Filter', exact: true }).click();
  await hform.waitFor();
  pruefe(await hform.getByLabel('Suchbegriff im Volltext').inputValue() === 'Rechnung', 'Eingaben gingen verloren');
  console.log('ok  Handy: Filter, Treffer, wieder Filter');
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
