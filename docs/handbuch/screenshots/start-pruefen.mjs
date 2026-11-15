/**
 * Prüfung der Startseite und der Seite „nicht gefunden“ von help.ablago.app (#841) im Browser – gegen die mit
 * veroeffentlichen.py zusammengestellte Seite, ausgeliefert wie bei GitHub Pages (unbekannte Adresse → /404.html, 404).
 *
 *   node docs/handbuch/screenshots/start-pruefen.mjs <seite> [bilderordner]
 *
 * Prüft: 404 auf Deutsch und Englisch mit Logo, Suche (Fokus, Treffer aus mehreren Handbüchern, Pfeiltasten, Anzahl
 * für Bildschirmleser), Meldelink ohne fremde Adresse, Umleitung alter Adressen, dieselbe Suche auf der Startseite,
 * axe hell und dunkel (frisch geladen, Maus nicht über Knöpfen) und am Handy (375/393/402 px) nichts zu breit.
 * Bilder der Seiten landen im Bilderordner.
 */
import { createServer } from 'node:http';
import { mkdir, readFile, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { extname, join, resolve } from 'node:path';
import { chromium } from '../../../web/rauchtest/playwright.mjs';

const WURZEL = resolve(process.argv[2] ?? 'seite');
const BILDER = resolve(process.argv[3] ?? 'start-bilder');
await mkdir(BILDER, { recursive: true });
const AXE = await readFile(createRequire(join(import.meta.dirname, '..', '..', '..', 'package.json')).resolve('axe-core/axe.min.js'), 'utf8');
const TYP = { '.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };

const server = createServer(async (req, res) => {
  let p = join(WURZEL, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  try {
    if ((await stat(p)).isDirectory()) p = join(p, 'index.html');
    const b = await readFile(p);
    res.writeHead(200, { 'content-type': TYP[extname(p)] ?? 'application/octet-stream' });
    res.end(req.method === 'HEAD' ? undefined : b);
  } catch {
    res.writeHead(404, { 'content-type': TYP['.html'] });
    res.end(req.method === 'HEAD' ? undefined : await readFile(join(WURZEL, '404.html')));
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASIS = `http://127.0.0.1:${server.address().port}`;

const fehler = [];
const pruefe = (bedingung, text) => { if (!bedingung) fehler.push(text); };
const browser = await chromium.launch();

async function axe(s, name) {
  await s.evaluate(AXE);
  const v = await s.evaluate(async () => (await globalThis.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] } })).violations.map((x) => `${x.id}: ${x.nodes.map((n) => n.target.join(' ')).join(', ')}`));
  for (const x of v) fehler.push(`axe ${name}: ${x}`);
}

async function seite(optionen = {}) {
  const k = await browser.newContext({ locale: 'de-DE', ...optionen });
  const s = await k.newPage();
  s.on('pageerror', (e) => fehler.push(`Fehler in der Seite: ${e.message}`));
  return s;
}

try {
  // 404 auf Deutsch: Text, Fokus im Suchfeld, Suche über mehrere Handbücher, Pfeiltasten.
  let s = await seite();
  const antwort = await s.goto(`${BASIS}/gibt-es-nicht/`);
  pruefe(antwort.status() === 404, `/gibt-es-nicht/: Status ${antwort.status()} statt 404`);
  await s.getByRole('heading', { name: 'Diese Seite gibt es hier nicht', level: 1 }).waitFor();
  const feld = s.getByRole('searchbox', { name: 'In allen Handbüchern suchen' });
  pruefe(await feld.evaluate((el) => el === document.activeElement), 'Suchfeld hat beim Laden nicht den Fokus');
  pruefe(await s.getByRole('img', { name: 'Ablago' }).first().isVisible(), 'Logo fehlt');
  await feld.fill('Sicherung');
  await s.locator('.hs-liste a').first().filter({ hasText: /Sicherung/i }).waitFor();
  const treffer = s.locator('.hs-liste a');
  pruefe(await treffer.count() > 1 && await treffer.count() <= 10, `Treffer: ${await treffer.count()} (erwartet 2–10)`);
  const handbuecher = new Set(await s.locator('.hs-liste a').evaluateAll((as) => as.map((a) => a.className.replace('hs-treffer', '').trim() || 'benutzer')));
  pruefe(handbuecher.size >= 2, `Treffer nur aus ${[...handbuecher].join(', ')}`);
  await feld.press('ArrowDown');
  pruefe(await treffer.first().evaluate((el) => el === document.activeElement), 'Pfeil runter führt nicht in den ersten Treffer');
  await s.keyboard.press('ArrowDown');
  pruefe(await treffer.nth(1).evaluate((el) => el === document.activeElement), 'Pfeil runter führt nicht zum zweiten Treffer');
  await s.keyboard.press('Escape');
  pruefe(await feld.evaluate((el) => el === document.activeElement), 'Escape führt nicht zurück ins Feld');
  await feld.fill('ruckgangig zxqv');
  await s.getByRole('status').filter({ hasText: 'Nichts gefunden' }).waitFor();
  // Umlaut-Toleranz: „Gebuhr“/„Kuendigen“ wie „Gebühr“/„Kündigen“.
  await feld.fill('kuendigen');
  await s.locator('.hs-liste a').first().filter({ hasText: /kündigen/i }).waitFor();
  await feld.fill('Sicherung');
  await s.locator('.hs-liste a').first().filter({ hasText: /Sicherung/i }).waitFor();
  await s.screenshot({ path: join(BILDER, '404-hell.png'), fullPage: true });
  // Meldelink: Vorlage, Adresse vorausgefüllt – hier (nicht help.ablago.app) nur der Pfad, nie Rechnername.
  const melden = new URL(await s.getByRole('link', { name: 'Kaputten Link melden' }).getAttribute('href'));
  pruefe(melden.hostname === 'github.com' && melden.searchParams.get('template') === 'kaputter-link.yml', `Meldelink: ${melden}`);
  pruefe(melden.searchParams.get('adresse') === '/gibt-es-nicht/', `Meldelink adresse: ${melden.searchParams.get('adresse')}`);
  pruefe(!melden.searchParams.has('herkunft_genau'), 'Meldelink: Herkunft ohne help.ablago.app/ablago.app');
  pruefe(!melden.href.includes('127.0.0.1'), 'Meldelink enthält die eigene Adresse');
  await s.context().close();

  // axe hell und dunkel: frisch geladen, Maus nicht über Knöpfen.
  for (const schema of ['light', 'dark']) {
    for (const weg of ['/gibt-es-nicht/', '/en/gibt-es-nicht/', '/', '/en/']) {
      s = await seite({ colorScheme: schema });
      await s.mouse.move(0, 0);
      await s.goto(BASIS + weg);
      await s.locator('.handbuchsuche input').waitFor();
      await axe(s, `${weg} (${schema})`);
      if (weg === '/gibt-es-nicht/' && schema === 'dark') await s.screenshot({ path: join(BILDER, '404-dunkel.png'), fullPage: true });
      await s.context().close();
    }
  }

  // Englisch: Texte und Suche auf Englisch, Karten auf die englischen Handbücher.
  s = await seite({ locale: 'en-GB' });
  await s.goto(`${BASIS}/en/gibt-es-nicht/`);
  await s.getByRole('heading', { name: 'This page doesn’t exist here', level: 1 }).waitFor();
  pruefe(await s.evaluate(() => document.documentElement.lang) === 'en', 'lang nicht en');
  pruefe((await s.getByRole('link', { name: /^User manual/ }).getAttribute('href')).endsWith('benutzer/aktuell/en/'), 'Karte Benutzerhandbuch nicht englisch');
  await s.getByRole('searchbox', { name: 'Search all manuals' }).fill('backup');
  await s.getByRole('status').filter({ hasText: /\d+ results?/ }).waitFor();
  pruefe((await s.locator('.hs-liste a').first().getAttribute('href')).includes('/aktuell/en/'), 'Englische Suche trifft nicht die englischen Handbücher');
  await s.screenshot({ path: join(BILDER, '404-en.png'), fullPage: true });
  await s.context().close();

  // Umleitung alter Adressen (#846) bleibt: /admin/v0.22/sicherung/ → /admin/aktuell/sicherung/.
  s = await seite();
  await s.goto(`${BASIS}/admin/v0.22/sicherung/`);
  await s.waitForURL('**/admin/aktuell/sicherung/');
  await s.context().close();

  // Startseite: dieselbe Suche, kein Fokus beim Laden.
  s = await seite();
  await s.goto(`${BASIS}/`);
  const startfeld = s.getByRole('searchbox', { name: 'In allen Handbüchern suchen' });
  await startfeld.fill('Post');
  await s.getByRole('status').filter({ hasText: /\d+ Treffer/ }).waitFor();
  await s.screenshot({ path: join(BILDER, 'start-suche.png'), fullPage: true });
  await s.context().close();

  // Handy: nichts breiter als der Bildschirm.
  for (const breite of [375, 393, 402]) {
    for (const weg of ['/gibt-es-nicht/', '/']) {
      s = await seite({ viewport: { width: breite, height: 800 }, isMobile: true, hasTouch: true });
      await s.goto(BASIS + weg);
      await s.locator('.handbuchsuche input').fill('Sicherung');
      await s.locator('.hs-liste a').first().waitFor();
      const zuBreit = await s.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      pruefe(zuBreit <= 0, `${weg} bei ${breite} px: ${zuBreit} px zu breit`);
      if (breite === 393 && weg !== '/') await s.screenshot({ path: join(BILDER, '404-handy.png'), fullPage: true });
      await s.context().close();
    }
  }
} catch (e) {
  fehler.push(`Abbruch: ${e.message}`);
} finally {
  await browser.close();
  server.close();
}

if (fehler.length) {
  console.error(fehler.map((f) => `::error title=Startseite und 404 (#841)::${f}`).join('\n'));
  process.exit(1);
}
console.log('Startseite und Seite „nicht gefunden“: alles in Ordnung (#841)');
