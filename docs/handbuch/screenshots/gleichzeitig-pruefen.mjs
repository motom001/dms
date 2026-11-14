/**
 * Oberflächentest „Gleichzeitig bearbeiten“ (#609): dieselbe Mappe in zwei Fenstern (wie Laptop und Handy).
 * - verschiedene Felder: beide Änderungen bleiben, keine Rückfrage
 * - dasselbe Feld: Rückfrage mit Uhrzeit und beiden Werten; „hier übernehmen“ und „anderen behalten“ wirken
 * - Mehrfachauswahl wie ein Feld; Rückfrage hell und dunkel, breit und in Handy-Größe ohne Überstand
 *
 * Läuft im Workflow „Handbuch“ nach aufnehmen.mjs (gleicher Administrator). Legt einen eigenen Mappentyp an
 * und löscht ihn am Ende wieder.
 *
 *   DMS_URL=http://localhost:3000 node docs/handbuch/screenshots/gleichzeitig-pruefen.mjs [bilderordner]
 *
 * Bei einem Fehler liegt ein Bild im Bilderordner.
 */
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';

const BASIS = process.env.DMS_URL ?? 'http://localhost:3000';
const ZIEL = process.argv[2] ?? 'gleichzeitig-fehler';
const ADMIN = { email: process.env.DMS_EMAIL ?? 'lena@example.org', passwort: process.env.DMS_PASSWORT ?? 'handbuch-passwort-1' };

const anm = await fetch(`${BASIS}/api/konto/anmelden`, { method: 'POST', headers: { 'x-dms': '1', 'content-type': 'application/json' }, body: JSON.stringify(ADMIN) });
if (!anm.ok) throw new Error(`Anmelden: ${anm.status} ${await anm.text()}`);
const [name, wert] = (anm.headers.get('set-cookie') ?? '').split(';')[0].split('=');
// Werkbank und Mappentypen gehen seit #819 nur im Verwaltungsmodus; direkt nach der Anmeldung ohne erneute Abfrage.
await fetch(`${BASIS}/api/konto/verwaltung`, { method: 'POST', headers: { 'x-dms': '1', 'content-type': 'application/json', cookie: `${name}=${wert}` }, body: '{}' });
const api = async (methode, pfad, body) => {
  const r = await fetch(`${BASIS}${pfad}`, { method: methode, headers: { 'x-dms': '1', cookie: `${name}=${wert}`, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  if (!r.ok) throw new Error(`${methode} ${pfad}: ${r.status} ${await r.text()}`);
  return r.status === 204 ? null : r.json();
};

const typ = await api('POST', '/api/typen', { name: `Testlauf gleichzeitig ${Date.now()}`, titelVorlage: '{bezeichnung}', felder: [
  { key: 'bezeichnung', label: 'Bezeichnung', typ: 'text', pflicht: true },
  { key: 'beitrag', label: 'Beitrag', typ: 'betrag' },
  { key: 'notiz', label: 'Notiz', typ: 'langtext' },
  { key: 'arten', label: 'Arten', typ: 'auswahl', optionen: ['Haftpflicht', 'Kasko', 'Schutzbrief'], mehrfach: true },
] });
const mappe = await api('POST', '/api/mappen', { typId: typ.id, werte: { bezeichnung: 'Kfz-Versicherung', beitrag: { betrag: 398, waehrung: 'EUR' }, notiz: 'alt', arten: ['Haftpflicht'] } });
const werte = async () => (await api('GET', `/api/mappen/${mappe.id}`)).mappe.werte;

const browser = await chromium.launch();
const pruefe = (bedingung, text) => { if (!bedingung) throw new Error(text); };
let seiten = [];

/** Zwei Fenster, wie zwei Geräte: eigener Browser-Kontext je Fenster, dieselbe Anmeldung. */
async function fenster(optionen = {}) {
  const k = await browser.newContext({ viewport: { width: 1400, height: 900 }, locale: 'de-DE', timezoneId: 'Europe/Berlin', ...optionen });
  await k.addCookies([{ name, value: wert, url: BASIS }]);
  const s = await k.newPage();
  seiten.push(s);
  await s.goto(`${BASIS}/ablage/${typ.id}/${mappe.id}`);
  await s.getByLabel('Beitrag').first().waitFor();
  return s;
}
const speichere = async (s) => { await s.locator('.speicherleiste').getByRole('button', { name: /speichern/i }).click(); };
const gespeichert = async (s) => { await s.locator('.speicherleiste .status').getByText('Gespeichert.').waitFor(); };
const rueckfrage = (s) => s.getByRole('group', { name: /Gleichzeitig geändert/ });

try {
  /* ---------- Verschiedene Felder ---------- */
  const a = await fenster();
  const b = await fenster();
  await a.getByLabel('Beitrag').first().fill('412,00');
  await speichere(a); await gespeichert(a);
  await b.getByRole('textbox', { name: /^Notiz( \(optional\))?$/ }).fill('Laptop');
  await speichere(b); await gespeichert(b);
  pruefe(!(await rueckfrage(b).count()), 'Verschiedene Felder: Es sollte keine Rückfrage geben');
  let w = await werte();
  pruefe(w.beitrag?.betrag === 412 && w.notiz === 'Laptop', `Beide Änderungen sollten bleiben: ${JSON.stringify(w)}`);
  // Fenster B hat jetzt beide Werte im Formular.
  for (let i = 0; (await b.getByLabel('Beitrag').first().inputValue()) !== '412'; i++) { pruefe(i < 40, 'Fenster B sollte den Beitrag von A zeigen'); await b.waitForTimeout(150); }
  console.log('ok  verschiedene Felder: beide bleiben, keine Rückfrage');

  /* ---------- Dasselbe Feld: hier übernehmen ---------- */
  await a.reload(); await a.getByLabel('Beitrag').first().waitFor();
  await b.reload(); await b.getByLabel('Beitrag').first().waitFor();
  await a.getByLabel('Beitrag').first().fill('420,00');
  await speichere(a); await gespeichert(a);
  await b.getByLabel('Beitrag').first().fill('398,50');
  await b.getByRole('textbox', { name: /^Notiz( \(optional\))?$/ }).fill('Laptop 2');
  await speichere(b);
  const r = rueckfrage(b);
  await r.waitFor();
  const text = await r.textContent();
  pruefe(/„Beitrag“/.test(text) && /um \d\d:\d\d/.test(text) && /420,00/.test(text) && /398,50/.test(text), `Rückfrage sollte Feld, Uhrzeit, alten und neuen Wert nennen: ${text}`);
  pruefe(!/Notiz/.test(text), 'Die Notiz hat niemand sonst geändert – sie gehört nicht in die Rückfrage');
  pruefe(await r.getByRole('button', { name: 'So speichern' }).isDisabled(), '„So speichern“ geht erst nach einer Wahl');
  await mkdir(ZIEL, { recursive: true });
  await r.screenshot({ path: join(ZIEL, 'gleichzeitig-hell.png') });
  await r.getByLabel(/Den Wert von hier übernehmen/).check();
  await r.getByRole('button', { name: 'So speichern' }).click();
  await gespeichert(b);
  w = await werte();
  pruefe(w.beitrag?.betrag === 398.5 && w.notiz === 'Laptop 2', `Meins übernehmen: ${JSON.stringify(w)}`);
  const h = (await api('GET', `/api/mappen/${mappe.id}/historie`)).filter((e) => e.art === 'geaendert' && e.daten.aenderungen?.some((x) => x.feld === 'beitrag'));
  pruefe(/398,50/.test(h[0].daten.aenderungen.find((x) => x.feld === 'beitrag').neu) && /420,00/.test(h[1].daten.aenderungen.find((x) => x.feld === 'beitrag').neu), 'Historie: erst 420,00, dann 398,50');
  console.log('ok  dasselbe Feld: Rückfrage, „hier übernehmen“, Historie');

  /* ---------- Dasselbe Feld: anderen behalten (Mehrfachauswahl, dunkel, Handy) ---------- */
  const c = await fenster({ colorScheme: 'dark', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await a.reload(); await a.getByLabel('Beitrag').first().waitFor();
  await a.getByRole('checkbox', { name: 'Kasko' }).check();
  await speichere(a); await gespeichert(a);
  await c.getByRole('checkbox', { name: 'Schutzbrief' }).check();
  await speichere(c);
  const r2 = rueckfrage(c);
  await r2.waitFor();
  pruefe(/„Arten“/.test(await r2.textContent()), 'Mehrfachauswahl: Rückfrage zu „Arten“');
  const ueber = await c.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  pruefe(ueber <= 1, `Handy: Die Seite ragt ${ueber} px über den Rand`);
  const farbe = await r2.evaluate((e) => getComputedStyle(e).backgroundColor);
  pruefe(farbe !== 'rgb(250, 240, 217)', 'Dunkel: Die Rückfrage sollte die dunkle Warnfarbe haben');
  await r2.screenshot({ path: join(ZIEL, 'gleichzeitig-dunkel-handy.png') });
  await r2.getByLabel(/Den anderen Wert behalten/).check();
  await r2.getByRole('button', { name: 'So speichern' }).click();
  // Am Handy steht „Gespeichert.“ nicht in der Leiste – auf die Rückfrage warten, die verschwindet.
  await r2.waitFor({ state: 'detached' });
  await c.locator('.speicherleiste').getByRole('button', { name: /speichern/i }).and(c.locator(':enabled')).waitFor();
  w = await werte();
  pruefe(JSON.stringify(w.arten) === JSON.stringify(['Haftpflicht', 'Kasko']), `Anderen behalten: ${JSON.stringify(w.arten)}`);
  // Das Formular zeigt jetzt den Wert vom anderen Fenster.
  await c.getByRole('checkbox', { name: 'Kasko' }).and(c.locator(':checked')).waitFor();
  pruefe(!(await c.getByRole('checkbox', { name: 'Schutzbrief' }).isChecked()), 'Nach „anderen behalten“ sollte Schutzbrief nicht mehr gewählt sein');
  console.log('ok  Mehrfachauswahl: „anderen behalten“, dunkel und Handy ohne Überstand');
} catch (e) {
  await mkdir(ZIEL, { recursive: true });
  for (const [i, s] of seiten.entries()) await s.screenshot({ path: join(ZIEL, `gleichzeitig-fehler-${i + 1}.png`), fullPage: true }).catch(() => {});
  console.error(`FEHLER: ${e.message}`);
  process.exitCode = 1;
} finally {
  await browser.close();
  // Aufräumen: Mappe auch aus dem Papierkorb, dann den Mappentyp.
  await api('DELETE', `/api/mappen/${mappe.id}?grund=nicht_noetig`).catch(() => {});
  await api('DELETE', `/api/papierkorb/${mappe.id}`).catch(() => {});
  await api('DELETE', `/api/typen/${typ.id}`).catch((e) => console.error(`Aufräumen: ${e.message}`));
}
