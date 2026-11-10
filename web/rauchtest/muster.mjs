/**
 * Musterseite der Bausteine (#967) fotografieren und mit axe-core prüfen – gemeinsam für die Rauchtests
 * (rauchtest.mjs) und die Bilder der Handbücher (docs/handbuch/screenshots/aufnehmen.mjs). Die Seite gibt es nur im
 * Testbau (`VITE_MUSTER=1 npm run build`); beide Workflows bauen Ablago so.
 *
 * Bilder (feste Namen, das Entwicklerhandbuch bindet sie über bilder/<name>.png ein):
 *   muster-hell, muster-dunkel, muster-handy, muster-handy-dunkel – die ganze Seite;
 *   muster-feld, muster-feld-dunkel – der Bereich „Feld“;
 *   muster-feld-fokus, muster-feld-fokus-dunkel – Maus über einem Feld, Tastaturfokus im nächsten.
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
      await foto(s, a.name, { fullPage: true });
      if (!a.handy) {
        const suffix = a.schema === 'dark' ? '-dunkel' : '';
        await foto(s.locator('#feld'), `muster-feld${suffix}`);
        await foto(s, `muster-feld-fokus${suffix}`, { fullPage: true, clip: await hoverUndFokus(s) });
      }
    } finally {
      await k.close();
    }
  }
  return { bilder, verstoesse };
}
