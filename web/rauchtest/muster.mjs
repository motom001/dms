/**
 * Musterseite der Bausteine (#967) fotografieren und mit axe-core prüfen – gemeinsam für die Rauchtests
 * (rauchtest.mjs) und die Bilder der Handbücher (docs/handbuch/screenshots/aufnehmen.mjs). Die Seite gibt es nur im
 * Testbau (`VITE_MUSTER=1 npm run build`); beide Workflows bauen Ablago so.
 *
 * Bilder (feste Namen, das Entwicklerhandbuch bindet sie über bilder/<name>.png ein):
 *   muster-hell, muster-dunkel, muster-handy, muster-handy-dunkel – die ganze Seite;
 *   muster-feld, muster-feld-dunkel – der Bereich „Feld“;
 *   muster-feld-fokus, muster-feld-fokus-dunkel – Maus über einem Feld, Tastaturfokus im nächsten;
 *   muster-knopf, muster-knopf-dunkel – der Bereich „Knopf“ (#968) mit allen Arten und Zuständen, Hover und Fokus stehend.
 *
 * Im Handy-Kontext (390 px, Touch: `pointer: coarse`) misst `tippflaechenPruefen` jedes Bedienelement der Seite
 * (#1027, Musterkatalog D6): Jedes muss eine eigene Tippfläche von mindestens 44 × 44 px haben.
 *
 * axe-core kommt aus den Abhängigkeiten im Wurzelordner (devDependency, exakt gepinnt). Playwright bringt der
 * Aufrufer mit (browser); dieses Modul lädt es nicht selbst.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

// Als Text, nicht per addScriptTag: Die Inhaltsrichtlinie (CSP) von Ablago erlaubt keine fremden Skripte, evaluate schon.
const AXE = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');
/** WCAG 2.2 A und AA samt bewährter Praxis (Landmarken, Überschriften). */
const REGELN = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];
const DESKTOP = { width: 1280, height: 900 };
const HANDY = { width: 390, height: 844 };

/** Die vier Ansichten der Seite: Desktop und Handy, je hell und dunkel. */
export const ANSICHTEN = [
  { name: 'muster-hell', schema: 'light', viewport: DESKTOP, handy: false },
  { name: 'muster-dunkel', schema: 'dark', viewport: DESKTOP, handy: false },
  { name: 'muster-handy', schema: 'light', viewport: HANDY, handy: true },
  { name: 'muster-handy-dunkel', schema: 'dark', viewport: HANDY, handy: true },
];

/** axe-core in der Seite ausführen; Rückgabe: Verstöße als kurze Zeilen (leer = alles gut). */
export async function axePruefen(seite) {
  await seite.evaluate(AXE);
  const verstoesse = await seite.evaluate(async (regeln) => {
    // eslint-disable-next-line no-undef -- axe kommt mit evaluate(AXE) in die Seite
    const r = await axe.run(document, { runOnly: { type: 'tag', values: regeln }, resultTypes: ['violations'] });
    return r.violations.map((v) => ({ id: v.id, hilfe: v.help, stellen: v.nodes.map((n) => `${n.target.join(' ')}: ${n.failureSummary?.split('\n').slice(1).join(' ').trim()}`) }));
  }, REGELN);
  return verstoesse.map((v) => `${v.id} (${v.hilfe}): ${v.stellen.join(' | ')}`);
}

/** Mindestmaß einer Tippfläche am Handy (#1027, Musterkatalog D6 „Tippziele ≥ 44 pt“). */
export const TIPPFLAECHE = 44;
/**
 * Ausnahmen von der Messung – nur mit Grund. Schlüssel: CSS-Selektor, Wert: Grund. Heute keine.
 * (Beispiel: Verweise mitten im Fließtext sind nach WCAG 2.5.8 ausgenommen.)
 */
export const TIPP_AUSNAHMEN = {};

/**
 * Tippflächen aller Bedienelemente messen (#1027): Für jedes sichtbare Element (Knopf, Verweis, Eingabe, Auswahl, Haken,
 * Hilfesymbol …) tastet die Seite die Umgebung in 2-px-Schritten mit `elementFromPoint` ab – so zählen unsichtbare
 * Tippflächen (Pseudo-Elemente) und Beschriftungen, die einen Haken mitschalten, genau so, wie der Browser einen
 * Fingertipp zuordnet. Verlangt ist ein Quadrat von mindestens 44 × 44 px, das ganz zum Element gehört – bis auf die
 * runden Ecken (höchstens 8 von 484 Rasterpunkten; ein 2 px breiter Streifen wären schon 22). Eine überlappende
 * Nachbarfläche nimmt ihm Punkte weg und fällt so ebenfalls auf. Gemessen wird um das Element samt seiner
 * Beschriftungen (`labels`).
 * Rückgabe: Zeilen „Beschreibung: gemessen“ für jedes zu kleine Element (leer = alles gut).
 */
export async function tippflaechenPruefen(seite) {
  const elemente = await seite.evaluate((ausnahmen) => {
    const AUSWAHL = 'a[href], button, input:not([type="hidden"]), select, textarea, summary, [role="button"], [tabindex]:not([tabindex="-1"])';
    const alle = [...document.querySelectorAll(AUSWAHL)].filter((el) => el.getClientRects().length > 0 && !Object.keys(ausnahmen).some((a) => el.matches(a)));
    alle.forEach((el, i) => { el.dataset.tippnr = String(i); });
    return alle.length;
  }, TIPP_AUSNAHMEN);
  const zuKlein = [];
  // axe rollt beim Prüfen; erst oben anfangen.
  await seite.evaluate(() => scrollTo(0, 0));
  for (let i = 0; i < elemente; i++) {
    const el = seite.locator(`[data-tippnr="${i}"]`);
    // Ins Bild holen und warten, bis das Element drei Bilder lang ruhig steht und die Trefferprüfung es in seiner
    // Mitte findet: Am Handy rollt Chromium nebenläufig, gleich danach trifft elementFromPoint oft noch eine andere
    // Stelle (höchstens 120 Bilder).
    await el.evaluate((e) => new Promise((fertig) => {
      e.scrollIntoView({ block: 'center', inline: 'center' });
      let n = 0, ruhig = 0, vorher = null;
      const pruefe = () => {
        const b = e.getBoundingClientRect();
        const stand = `${b.left},${b.top},${scrollX},${scrollY}`;
        ruhig = stand === vorher ? ruhig + 1 : 0;
        vorher = stand;
        const h = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
        const trifft = h && (h === e || e.contains(h) || h.closest('label')?.control === e);
        if (++n > 120 || (ruhig >= 3 && trifft)) fertig(); else requestAnimationFrame(pruefe);
      };
      requestAnimationFrame(pruefe);
    }));
    const r = await el.evaluate((ziel, mass) => {
      /** Gehört ein getroffener Punkt zum Element? Direkt, als Kind, oder über eine Beschriftung (label → control). */
      const gehoert = (h) => !!h && (ziel === h || ziel.contains(h) || h.closest('label')?.control === ziel);
      // Element samt Beschriftungen (ein Haken schaltet auch über sein label).
      const b = [ziel, ...(ziel.labels ?? [])].map((x) => x.getBoundingClientRect()).reduce((a, c) => ({ left: Math.min(a.left, c.left), top: Math.min(a.top, c.top), right: Math.max(a.right, c.right), bottom: Math.max(a.bottom, c.bottom) }));
      b.width = b.right - b.left;
      const schritt = 2;
      // Bei breiten Elementen genügt ein Streifen um die Mitte; senkrecht immer die ganze Höhe samt Rand.
      const x0 = b.width > 3 * mass ? b.left + b.width / 2 - 1.5 * mass : b.left - mass;
      const x1 = b.width > 3 * mass ? b.left + b.width / 2 + 1.5 * mass : b.right + mass;
      const y0 = b.top - mass, y1 = b.bottom + mass;
      const sp = Math.ceil((x1 - x0) / schritt), ze = Math.ceil((y1 - y0) / schritt);
      // Präfixsummen über das Raster der Treffer: gibt es ein volles Quadrat mass × mass?
      const summe = Array.from({ length: ze + 1 }, () => new Int32Array(sp + 1));
      let breit = 0, hoch = 0, minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (let y = 0; y < ze; y++) {
        for (let x = 0; x < sp; x++) {
          const px = x0 + x * schritt + 1, py = y0 + y * schritt + 1;
          const t = px >= 0 && py >= 0 && px < innerWidth && py < innerHeight && gehoert(document.elementFromPoint(px, py)) ? 1 : 0;
          if (t) { minX = Math.min(minX, px); maxX = Math.max(maxX, px); minY = Math.min(minY, py); maxY = Math.max(maxY, py); }
          summe[y + 1][x + 1] = t + summe[y][x + 1] + summe[y + 1][x] - summe[y][x];
        }
      }
      const n = Math.floor(mass / schritt);
      let voll = false;
      for (let y = n; y <= ze && !voll; y++) for (let x = n; x <= sp && !voll; x++) voll = summe[y][x] - summe[y - n][x] - summe[y][x - n] + summe[y - n][x - n] >= n * n - 8;
      if (minX !== Infinity) { breit = maxX - minX + schritt; hoch = maxY - minY + schritt; }
      const name = (ziel.getAttribute('aria-label') || ziel.textContent || ziel.getAttribute('title') || '').replace(/\s+/g, ' ').trim().slice(0, 40);
      const art = ziel.tagName.toLowerCase() + (ziel.type && ziel.tagName === 'INPUT' ? `[${ziel.type}]` : '');
      const ort = ziel.closest('[data-zustand]')?.dataset.zustand ?? ziel.closest('section, header, nav')?.id ?? '';
      return { voll, text: `${ort ? `${ort} › ` : ''}${art}${name ? ` „${name}“` : ''}: Tippfläche etwa ${Math.round(breit)} × ${Math.round(hoch)} px` };
    }, TIPPFLAECHE);
    if (!r.voll) zuKlein.push(r.text);
  }
  await seite.evaluate(() => { document.querySelectorAll('[data-tippnr]').forEach((e) => delete e.dataset.tippnr); scrollTo(0, 0); });
  return zuKlein;
}

/** Maus über das Feld „Maus darüber“, Tastaturfokus ins Feld „Fokus“ – und der Ausschnitt mit beiden Karten. */
async function hoverUndFokus(seite) {
  const hover = seite.locator('[data-zustand="hover"]');
  const fokus = seite.locator('[data-zustand="fokus"]');
  await hover.scrollIntoViewIfNeeded();
  await fokus.locator('input').focus();
  await hover.locator('input').hover();
  // Ausschnitt in Koordinaten der ganzen Seite (für screenshot mit fullPage).
  return seite.evaluate(() => {
    const r = ['hover', 'fokus'].map((z) => document.querySelector(`[data-zustand="${z}"]`).getBoundingClientRect());
    const x = Math.min(r[0].left, r[1].left) - 8 + scrollX, y = Math.min(r[0].top, r[1].top) - 8 + scrollY;
    return { x, y, width: Math.max(r[0].right, r[1].right) + 8 + scrollX - x, height: Math.max(r[0].bottom, r[1].bottom) + 8 + scrollY - y };
  });
}

/**
 * Musterseite in allen Ansichten aufnehmen und prüfen.
 * @param browser  Playwright-Browser (Chromium)
 * @param optionen basis (Adresse von Ablago), ziel (Ordner der Bilder), gebiet (z. B. de-DE), pruefen (axe, Vorgabe an),
 *                 beobachte (wird mit jedem neuen Browser-Kontext aufgerufen, z. B. um Fehler zu sammeln)
 * @returns { bilder: string[], verstoesse: string[] } – Verstöße je Ansicht mit ihrem Namen davor
 */
export async function musterAufnehmen(browser, { basis, ziel, gebiet = 'de-DE', pruefen = true, beobachte } = {}) {
  const bilder = [];
  const verstoesse = [];
  const foto = async (was, name, optionen) => {
    await was.screenshot({ path: join(ziel, `${name}.png`), ...optionen });
    bilder.push(name);
  };
  for (const a of ANSICHTEN) {
    const k = await browser.newContext({ viewport: a.viewport, colorScheme: a.schema, locale: gebiet, timezoneId: 'Europe/Berlin', deviceScaleFactor: 1, ...(a.handy ? { isMobile: true, hasTouch: true } : {}) });
    beobachte?.(k);
    try {
      const s = await k.newPage();
      await s.goto(`${basis}/muster`);
      await s.locator('[data-zustand="fokus"]').waitFor();
      await s.evaluate(() => document.fonts.ready);
      if (pruefen) verstoesse.push(...(await axePruefen(s)).map((v) => `${a.name}: ${v}`));
      // Handybreite: nie waagerecht rollen.
      const { breit, sicht } = await s.evaluate(() => ({ breit: document.documentElement.scrollWidth, sicht: document.documentElement.clientWidth }));
      if (pruefen && breit > sicht) verstoesse.push(`${a.name}: Seite breiter als der Bildschirm (${breit} > ${sicht} px)`);
      // Am Handy (#1027): jedes Bedienelement mit mindestens 44 × 44 px Tippfläche.
      if (pruefen && a.handy) verstoesse.push(...(await tippflaechenPruefen(s)).map((v) => `${a.name}: zu kleine Tippfläche – ${v}`));
      if (a.handy) {
        // fullPage schaltet in Chromium die Touch-Emulation ab (dann gilt pointer: fine, #1027) – am Handy daher das
        // Fenster selbst auf die volle Höhe ziehen, damit das Bild die Tippflächen zeigt.
        await s.setViewportSize({ width: a.viewport.width, height: await s.evaluate(() => document.documentElement.scrollHeight) });
        await foto(s, a.name);
      } else {
        await foto(s, a.name, { fullPage: true });
      }
      if (!a.handy) {
        const suffix = a.schema === 'dark' ? '-dunkel' : '';
        await foto(s.locator('#feld'), `muster-feld${suffix}`);
        await foto(s, `muster-feld-fokus${suffix}`, { fullPage: true, clip: await hoverUndFokus(s) });
        await s.mouse.move(0, 0);
        await s.evaluate(() => (document.activeElement instanceof HTMLElement) && document.activeElement.blur());
        await foto(s.locator('#knopf'), `muster-knopf${suffix}`);
      }
    } finally {
      await k.close();
    }
  }
  return { bilder, verstoesse };
}
