/**
 * Prüft die Oberfläche in iPhone-Größe mit WebKit.
 *
 * 1. Eingabefelder (#174): Kein Feld ragt über seinen Kasten oder den Bildschirm hinaus – besonders
 *    Datums- und Zeitfelder (iPhone 13).
 * 2. Handy-Größen (#489): iPhone SE (375 × 667), iPhone 15 (393 × 852), iPhone 17 Pro (402 × 874) –
 *    Startseite, Zu erledigen, Neue Post, eine Ansicht, eine Mappe, eine Post, Werkbank:
 *    - kein Element breiter als der Bildschirm (außer in einem Bereich, der selbst waagerecht scrollt),
 *      `scrollWidth <= clientWidth` für die Seite und jeden Hauptbereich;
 *    - Kopfzeile mit „+ Neu“ vollständig im Bild;
 *    - Eingabefelder mit mindestens 16 px Schrift (sonst vergrößert iOS die Seite beim Tippen und sie
 *      bleibt links und rechts abgeschnitten);
 *    - Kacheln der Startseite einspaltig;
 *    - geöffnete Menüs („+ Neu“, Benutzermenü, „Mappe ▾“) liegen vollständig im Bildschirm;
 *    - Suchfeld der Startseite (#497) liefert Treffer, ohne dass etwas zu breit wird;
 *    - „Ansicht ▾“ (#498) öffnet ein Blatt im Bildschirm mit Tippzielen von mindestens 44 px;
 *    - Dokumente einer Post (#505): kein eingebetteter PDF-Rahmen, Tippziele mindestens 44 px.
 *    Von jeder Seite und jedem Menü entsteht ein Bild im Bilderordner (<breite>/<name>.png).
 *
 * Läuft im Workflow „Handbuch“ nach aufnehmen.mjs (gleiche Daten, gleicher Administrator).
 *
 *   DMS_URL=http://localhost:3000 node docs/handbuch/screenshots/mobil-pruefen.mjs [bilderordner]
 *   MOBIL_BROWSER=chromium …   (lokal ohne WebKit; dann mit iPhone-Größe und Touch in Chromium)
 *
 * WebKit unter Linux ist nicht Safari auf dem iPhone; der Test fängt aber jedes Element, das in
 * schmaler Breite über den Rand ragt.
 */
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium, devices, webkit } from 'playwright';

const BASIS = process.env.DMS_URL ?? 'http://localhost:3000';
const ZIEL = process.argv[2] ?? 'mobil-fehler';
const ADMIN = { email: process.env.DMS_EMAIL ?? 'anna@beispiel.de', passwort: process.env.DMS_PASSWORT ?? 'handbuch-passwort-1' };
const BROWSER = process.env.MOBIL_BROWSER === 'chromium' ? chromium : webkit;
const SEITEN = [
  '/ablage/eingang',
  '/ablage/suche',
  '/ablage/suche?typ=Rechnung',
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
const GROESSEN = [
  { name: 'iPhone SE', breite: 375, hoehe: 667 },
  { name: 'iPhone 15', breite: 393, hoehe: 852 },
  { name: 'iPhone 17 Pro', breite: 402, hoehe: 874 },
];

const anm = await fetch(`${BASIS}/api/konto/anmelden`, { method: 'POST', headers: { 'x-dms': '1', 'content-type': 'application/json' }, body: JSON.stringify(ADMIN) });
if (!anm.ok) throw new Error(`Anmelden: ${anm.status} ${await anm.text()}`);
const [name, wert] = (anm.headers.get('set-cookie') ?? '').split(';')[0].split('=');
const holen = async (pfad) => (await fetch(BASIS + pfad, { headers: { 'x-dms': '1', cookie: `${name}=${wert}` } })).json();

const browser = await BROWSER.launch();
const fehler = [];

/* ---------- 1. Eingabefelder (#174) ---------- */
{
  const k = await browser.newContext({ ...devices['iPhone 13'], locale: 'de-DE', timezoneId: 'Europe/Berlin' });
  await k.addCookies([{ name, value: wert, url: BASIS }]);
  const s = await k.newPage();
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
  await k.close();
}

/* ---------- 2. Handy-Größen (#489) ---------- */
const mappen = await holen('/api/mappen');
const typen = await holen('/api/typen');
const zaehler = await holen('/api/sichten');
const postTyp = typen.find((t) => t.system === 'post');
const eineMappe = mappen.find((m) => m.titel === 'Stromvertrag Haus') ?? mappen.find((m) => typen.find((t) => t.id === m.typId && !t.system));
const einePost = mappen.find((m) => m.typId === postTyp?.id);
const rechnung = typen.find((t) => t.name === 'Rechnung');
const HANDY = [
  { name: 'start', pfad: '/ablage/start', kacheln: true },
  { name: 'zu-erledigen', pfad: '/ablage/eingang' },
  ...(zaehler.neuePost ? [{ name: 'neue-post', pfad: `/ablage/${zaehler.neuePost}` }] : []),
  ...(rechnung ? [{ name: 'ablage', pfad: `/ablage/${rechnung.id}` }] : []),
  ...(eineMappe ? [{ name: 'mappe', pfad: `/ablage/${eineMappe.typId}/${eineMappe.id}`, mappenmenue: true }] : []),
  ...(einePost ? [{ name: 'post', pfad: `/ablage/${einePost.typId}/${einePost.id}` }] : []),
  { name: 'werkbank', pfad: '/werkbank/uebersicht' },
];

/** Alles, was über den Bildschirm hinausragt (ohne Inhalt eines Bereichs, der selbst waagerecht scrollt oder abschneidet). */
function zuBreiteElemente() {
  const bw = document.documentElement.clientWidth;
  const raus = [];
  const eingefasst = (el) => {
    for (let e = el.parentElement; e && e !== document.body && e !== document.documentElement; e = e.parentElement) {
      if (/(auto|scroll|hidden|clip)/.test(getComputedStyle(e).overflowX)) return true;
    }
    return false;
  };
  for (const el of document.querySelectorAll('body *')) {
    const st = getComputedStyle(el);
    if (st.visibility === 'hidden' || st.display === 'contents') continue;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    if ((r.right > bw + 1 || r.left < -1) && !eingefasst(el)) raus.push(`${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? `.${el.className.trim().split(/\s+/).join('.')}` : ''} [${Math.round(r.left)} … ${Math.round(r.right)}]`);
  }
  // Hauptbereiche: scrollWidth <= clientWidth
  for (const sel of ['html', '.kopf', '.rumpf', '.spalte.sichten', '.spalte.liste', '.spalte.mappe']) {
    for (const el of document.querySelectorAll(sel)) {
      if (!el.clientWidth) continue;
      if (el.scrollWidth > el.clientWidth + 1) raus.push(`${sel}: scrollWidth ${el.scrollWidth} > clientWidth ${el.clientWidth}`);
    }
  }
  const kopf = document.querySelector('.kopf')?.getBoundingClientRect();
  const neu = document.querySelector('.neuknopf > button')?.getBoundingClientRect();
  if (kopf && (kopf.left < -1 || kopf.right > bw + 1)) raus.push('Kopfzeile ragt über den Rand');
  if (neu && (neu.left < 0 || neu.right > bw || neu.top < 0)) raus.push('„+ Neu“ nicht vollständig im Bild');
  for (const el of document.querySelectorAll('input, select, textarea')) {
    if (['checkbox', 'radio', 'hidden', 'file', 'range', 'color'].includes(el.type)) continue;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    const px = parseFloat(getComputedStyle(el).fontSize);
    if (px < 16) raus.push(`${el.tagName.toLowerCase()}[type=${el.type || '-'}] ${el.getAttribute('aria-label') ?? el.getAttribute('placeholder') ?? ''}: Schrift ${px} px < 16 px (iOS vergrößert beim Tippen)`);
  }
  return raus;
}

/** Ein geöffnetes Menü muss vollständig im Bildschirm liegen. */
async function pruefeMenue(s, ort, knopf, menue, bild) {
  const k = s.locator(knopf).first();
  if (!(await k.count())) { fehler.push(`${ort}: Knopf ${knopf} fehlt`); return; }
  await k.click();
  await s.waitForTimeout(250);
  const m = s.locator(menue).first();
  if (!(await m.isVisible())) { fehler.push(`${ort}: Menü ${menue} geht nicht auf`); return; }
  const r = await m.boundingBox();
  const vp = s.viewportSize();
  if (r.x < -1 || r.y < -1 || r.x + r.width > vp.width + 1 || r.y + r.height > vp.height + 1) fehler.push(`${ort}: Menü ${menue} ragt aus dem Bildschirm [${Math.round(r.x)}, ${Math.round(r.y)}, ${Math.round(r.x + r.width)} × ${Math.round(r.y + r.height)}]`);
  await s.screenshot({ path: bild });
  const schleier = s.locator('.hy-schleier');
  if (await schleier.count() && await schleier.first().isVisible()) await schleier.first().click({ position: { x: 5, y: 5 } });
  else await s.keyboard.press('Escape');
  await s.waitForTimeout(150);
  if (await m.isVisible()) fehler.push(`${ort}: Menü ${menue} schließt nicht`);
}

for (const g of GROESSEN) {
  const k = await browser.newContext({ viewport: { width: g.breite, height: g.hoehe }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, locale: 'de-DE', timezoneId: 'Europe/Berlin', userAgent: devices['iPhone 13'].userAgent });
  await k.addCookies([{ name, value: wert, url: BASIS }]);
  const s = await k.newPage();
  const ordner = join(ZIEL, String(g.breite));
  await mkdir(ordner, { recursive: true });
  for (const seite of HANDY) {
    const ort = `${g.name} (${g.breite} px) ${seite.name}`;
    await s.goto(BASIS + seite.pfad);
    await s.waitForLoadState('networkidle');
    await s.waitForTimeout(400);
    const raus = await s.evaluate(zuBreiteElemente);
    if (seite.kacheln) {
      const spalten = await s.evaluate(() => new Set([...document.querySelectorAll('.start-raster .kachel')].map((k) => Math.round(k.getBoundingClientRect().left))).size);
      if (spalten > 1) raus.push(`Kacheln ${spalten}-spaltig statt einspaltig`);
    }
    await s.screenshot({ path: join(ordner, `${seite.name}.png`) });
    if (raus.length) fehler.push(`${ort}:\n  ${raus.slice(0, 15).join('\n  ')}${raus.length > 15 ? `\n  … und ${raus.length - 15} weitere` : ''}\n  Bild: ${join(ordner, `${seite.name}.png`)}`);
    else console.log(`ok  ${ort}`);
    if (seite.name === 'start') {
      await s.evaluate(() => scrollTo(0, 0));
      await pruefeMenue(s, `${ort} „+ Neu“`, '.neuknopf > button', '.neuknopf .menue', join(ordner, 'menue-neu.png'));
      await pruefeMenue(s, `${ort} Benutzermenü`, '.benutzermenue .wer', '.benutzermenue .menue', join(ordner, 'menue-benutzer.png'));
      // Ansicht wählen (#498): Blatt im Bildschirm, Tippziele mindestens 44 px hoch.
      await pruefeMenue(s, `${ort} „Ansicht ▾“`, '.aw-knopf', '.aw-blatt', join(ordner, 'menue-ansicht.png'));
      await s.locator('.aw-knopf').click();
      const klein = await s.evaluate(() => [...document.querySelectorAll('.aw-blatt a, .aw-blatt button, .aw-blatt input')]
        .filter((e) => { const r = e.getBoundingClientRect(); return r.height > 0 && r.height < 43.5; }).map((e) => `${(e.textContent || e.getAttribute('aria-label') || e.getAttribute('placeholder') || '').trim().slice(0, 30)} (${Math.round(e.getBoundingClientRect().height)} px)`));
      if (klein.length) fehler.push(`${ort} „Ansicht ▾“: Tippziele unter 44 px: ${klein.join(', ')}`);
      await s.keyboard.press('Escape');
      // Schnell finden (#497): Suchfeld oben, Treffer in unter einer Sekunde, nichts zu breit.
      const feld = s.locator('#ss-feld');
      if (!(await feld.count())) fehler.push(`${ort}: Suchfeld der Startseite fehlt`);
      else {
        const t0 = Date.now();
        await feld.fill('Strom');
        await s.locator('.ss-treffer').waitFor({ timeout: 5000 }).catch(() => fehler.push(`${ort}: keine Treffer-Anzeige für „Strom“`));
        if (Date.now() - t0 > 1500) fehler.push(`${ort}: Suche brauchte ${Date.now() - t0} ms`);
        const raus = await s.evaluate(zuBreiteElemente);
        await s.screenshot({ path: join(ordner, 'start-suche.png') });
        if (raus.length) fehler.push(`${ort} Suche:\n  ${raus.slice(0, 10).join('\n  ')}`);
        await feld.fill('');
      }
    }
    // Dokument vorzeigen (#505): Register mit Dokumenten – kein eingebetteter Rahmen, Tippziele mindestens 44 px.
    if (seite.name === 'post') {
      await s.goto(`${BASIS}${seite.pfad}?register=dokumente`);
      await s.waitForLoadState('networkidle');
      await s.waitForTimeout(300);
      const karten = await s.locator('.dokumentliste li').count();
      const probleme = await s.evaluate(() => [
        ...[...document.querySelectorAll('.dokumentliste a, .dokumentliste button')].filter((e) => { const r = e.getBoundingClientRect(); return r.height > 0 && (r.height < 43.5 || r.width < 43.5); })
          .map((e) => `Tippziel ${(e.textContent || e.getAttribute('aria-label') || '').trim().slice(0, 25)} ${Math.round(e.getBoundingClientRect().width)}×${Math.round(e.getBoundingClientRect().height)} px`),
        ...[...document.querySelectorAll('.dokansicht iframe')].filter((e) => e.getBoundingClientRect().height > 0).map(() => 'eingebetteter PDF-Rahmen sichtbar'),
      ]);
      await s.screenshot({ path: join(ordner, 'post-dokumente.png') });
      if (karten && probleme.length) fehler.push(`${ort} Dokumente:\n  ${probleme.slice(0, 10).join('\n  ')}`);
    }
    if (seite.mappenmenue) await pruefeMenue(s, `${ort} „Mappe ▾“`, '.aktionsmenue > button', '.aktionsmenue .menue', join(ordner, 'menue-mappe.png'));
  }
  await k.close();
}
await browser.close();

if (fehler.length) {
  console.error(`Zu breit in iPhone-Größe (${BROWSER === webkit ? 'WebKit' : 'Chromium'}):\n${fehler.join('\n')}`);
  process.exit(1);
}
console.log(`Alle ${SEITEN.length} Seiten und ${HANDY.length} Seiten in ${GROESSEN.length} Handy-Größen passen.`);
