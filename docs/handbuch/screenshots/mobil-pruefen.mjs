/**
 * Prüft die Oberfläche in iPhone-Größe mit WebKit (#174): Kein Eingabefeld ragt über seinen Kasten
 * oder den Bildschirm hinaus – besonders Datums- und Zeitfelder.
 *
 * Läuft im Workflow „Handbuch“ nach aufnehmen.mjs (gleiche Daten, gleicher Administrator).
 *
 *   DMS_URL=http://localhost:3000 node docs/handbuch/screenshots/mobil-pruefen.mjs [bilderordner]
 *
 * WebKit unter Linux ist nicht Safari auf dem iPhone; der Test fängt aber jedes Feld, das in
 * schmaler Breite über den Rand ragt. Bei einem Fehler liegt ein Bild im Bilderordner.
 */
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { devices, webkit } from 'playwright';

const BASIS = process.env.DMS_URL ?? 'http://localhost:3000';
const ZIEL = process.argv[2] ?? 'mobil-fehler';
const ADMIN = { email: 'anna@beispiel.de', passwort: 'handbuch-passwort-1' };
const SEITEN = [
  '/ablage/eingang',
  '/profil/konto',
  '/profil/sicherheit',
  '/profil/darstellung',
  '/profil/benachrichtigungen',
  '/profil/abwesenheit',
  '/werkbank/uebersicht',
  '/werkbank/aufgaben',
  '/werkbank/sicherung',
  '/werkbank/wartungsmodus',
  '/werkbank/sichten',
];

const anm = await fetch(`${BASIS}/api/konto/anmelden`, { method: 'POST', headers: { 'x-dms': '1', 'content-type': 'application/json' }, body: JSON.stringify(ADMIN) });
if (!anm.ok) throw new Error(`Anmelden: ${anm.status} ${await anm.text()}`);
const [name, wert] = (anm.headers.get('set-cookie') ?? '').split(';')[0].split('=');

const browser = await webkit.launch();
const k = await browser.newContext({ ...devices['iPhone 13'], locale: 'de-DE', timezoneId: 'Europe/Berlin' });
await k.addCookies([{ name, value: wert, url: BASIS }]);
const s = await k.newPage();
const fehler = [];

for (const pfad of SEITEN) {
  await s.goto(BASIS + pfad);
  await s.waitForLoadState('networkidle');
  await s.waitForTimeout(300);
  const zuBreit = await s.evaluate(() => {
    const raus = [];
    const breite = document.documentElement.clientWidth;
    for (const el of document.querySelectorAll('input, select, textarea')) {
      if (['checkbox', 'radio', 'hidden', 'file'].includes(el.type)) continue;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      const kasten = el.closest('.blatt, .karte, .eigenschaft, .feld')?.getBoundingClientRect();
      const grenze = Math.min(breite, kasten ? kasten.right : breite);
      if (r.right > grenze + 1) raus.push(`${el.tagName.toLowerCase()}[type=${el.type || '-'}] ${el.getAttribute('aria-label') ?? el.closest('label')?.textContent?.trim().slice(0, 40) ?? ''}: rechts ${Math.round(r.right)} > ${Math.round(grenze)}`);
    }
    return raus;
  });
  if (zuBreit.length) {
    await mkdir(ZIEL, { recursive: true });
    const bild = join(ZIEL, `mobil-${pfad.replace(/\W+/g, '-').replace(/^-|-$/g, '')}.png`);
    await s.screenshot({ path: bild, fullPage: true });
    fehler.push(`${pfad}:\n  ${zuBreit.join('\n  ')}\n  Bild: ${bild}`);
  } else console.log(`ok  ${pfad}`);
}
await browser.close();

if (fehler.length) {
  console.error(`Zu breit in iPhone-Größe (WebKit):\n${fehler.join('\n')}`);
  process.exit(1);
}
console.log(`Alle ${SEITEN.length} Seiten passen in iPhone-Größe.`);
