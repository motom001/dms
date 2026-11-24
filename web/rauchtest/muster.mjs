/**
 * Musterseite der Bausteine (#967) fotografieren und mit axe-core prüfen – gemeinsam für die Rauchtests
 * (rauchtest.mjs) und die Bilder der Handbücher (docs/handbuch/screenshots/aufnehmen.mjs). Die Seite gibt es nur im
 * Testbau (`VITE_MUSTER=1 npm run build`); beide Workflows bauen Ablago so.
 *
 * Bilder (feste Namen, das Entwicklerhandbuch bindet sie über bilder/<name>.png ein):
 *   muster-hell, muster-dunkel, muster-handy, muster-handy-dunkel – die ganze Seite;
 *   muster-feld, muster-feld-dunkel – der Bereich „Feld“;
 *   muster-feld-fokus, muster-feld-fokus-dunkel – Maus über einem Feld, Tastaturfokus im nächsten;
 *   muster-knopf, muster-knopf-dunkel – der Bereich „Knopf“ (#968) mit allen Arten und Zuständen, Hover und Fokus stehend;
 *   muster-bereiche, muster-bereiche-dunkel – der Bereich „Bereiche“ (#1000): Sprungleiste, zugeklappt, unter drei Bereichen;
 *   muster-fassungen, muster-fassungen-dunkel – der Bereich „Fassungen“ (#1006): Liste, leer, gelöschte Einträge;
 *   muster-speicherleiste, muster-speicherleiste-dunkel – der Bereich „Speicherleiste“ (#1210): „… löschen“ links,
 *     Verwerfen mit Rand, Hauptknopf blau, gesperrt aus einem Grund;
 *   muster-reiter, muster-reiter-dunkel – der Bereich „Reiter“ (#1210);
 *   muster-schalter, muster-schalter-dunkel – der Bereich „Schalter“ (#1188);
 *   muster-paketchip, muster-paketchip-dunkel – der Bereich „PaketChip“ (#1192);
 *   muster-menue, muster-wahlhaken, muster-mehrfachauswahl (je auch -dunkel) – die Bereiche „Menü“, „Wahlhaken“
 *     und „Mehrfachauswahl“ (#1211);
 *   muster-platzhalter, muster-platzhalter-dunkel – der Bereich „Platzhalter“ (#1177).
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

/**
 * axe-core in der Seite ausführen; Rückgabe: Verstöße als kurze Zeilen (leer = alles gut). `bereich` (CSS-Selektoren,
 * optional): nur diese Teile der Seite prüfen (#1211, #1212: z. B. die Spalten der Ablage ohne die Kopfzeile, die seit
 * #1218/#1219 eigene Rauchtests hat; #1271).
 */
export async function axePruefen(seite, bereich) {
  // Maus weg und warten, bis die Seite ruhig ist (#1266): Sonst misst axe den Kontrast eines Knopfs unter der Maus oder
  // mitten in der Überblendung nach dem Wechsel hell/dunkel (2,4:1 statt der fertigen Farbe).
  await seiteRuhig(seite);
  await seite.evaluate(AXE);
  const verstoesse = await seite.evaluate(
    async ([regeln, bereich]) => {
      const kontext = bereich ? { include: bereich.map((b) => [b]) } : document;
      // eslint-disable-next-line no-undef -- axe kommt mit evaluate(AXE) in die Seite
      const r = await axe.run(kontext, { runOnly: { type: 'tag', values: regeln }, resultTypes: ['violations'] });
      return r.violations.map((v) => ({
        id: v.id,
        hilfe: v.help,
        stellen: v.nodes.map((n) => `${n.target.join(' ')}: ${n.failureSummary?.split('\n').slice(1).join(' ').trim()}`),
      }));
    },
    [REGELN, bereich ?? null],
  );
  return verstoesse.map((v) => `${v.id} (${v.hilfe}): ${v.stellen.join(' | ')}`);
}

/* ---------- Ruhige Seite (#1266) ---------- */

/** Offene Anfragen je Seite (Anfrage → Beginn) – nur für Kontexte, die `anfragenZaehlen` beobachtet (die Rauchtests tun das immer). */
const offen = new WeakMap();
/**
 * Anfragen eines Browser-Kontexts mitschreiben, damit `seiteRuhig` auf ihr Ende warten kann. Einmal je Kontext aufrufen,
 * vor der ersten Seite (rauchtest() in hilfen.mjs und musterAufnehmen tun es).
 */
export function anfragenZaehlen(kontext) {
  const liste = (r) => {
    let seite;
    try {
      seite = r.frame().page();
    } catch {
      return null;
    } // Anfragen von Service Workern gehören zu keiner Seite.
    if (!offen.has(seite)) offen.set(seite, new Map());
    return offen.get(seite);
  };
  kontext.on('request', (r) => liste(r)?.set(r, Date.now()));
  kontext.on('requestfinished', (r) => liste(r)?.delete(r));
  kontext.on('requestfailed', (r) => liste(r)?.delete(r));
}

/** Höchstens so lange wartet `seiteRuhig` (ms). */
const RUHE_GRENZE = 3000;
/** Ältere offene Anfragen zählen nicht: Sie laufen dauerhaft oder ihr Ende kam nie an (z. B. abgebrochen beim Seitenwechsel). */
const ANFRAGE_HOECHSTENS = 2000;

/** Offene, junge Anfragen der Seite (für das Warten und das Protokoll). */
function offeneAnfragen(seite) {
  const jetzt = Date.now();
  return [...(offen.get(seite)?.entries() ?? [])].filter(([, t]) => jetzt - t < ANFRAGE_HOECHSTENS).map(([r]) => r);
}

/**
 * Warten, bis die Seite ruhig ist (#1266) – vor axe und vor der Messung der Tippflächen:
 *   - die Maus steht nicht über einem Element (Hover ändert Farben; abschaltbar mit `maus: false`),
 *   - keine junge Anfrage läuft mehr (nur mit `anfragenZaehlen` am Kontext; z. B. der Systemzustand, der nachlädt) –
 *     Anfragen, die schon 2 s offen sind, zählen nicht (dauerhafte Verbindungen, verlorene Enden),
 *   - Schriften sind geladen, keine endliche Animation und kein Übergang läuft (`document.getAnimations()`; Endlos-
 *     Animationen wie ein Ladekreis zählen nicht, sie enden nie),
 *   - das Layout ist über zwei Animationsbilder gleich (Rollstand, Seitengröße, Lage der Bedienelemente).
 * Gewartet wird auf Zustände, nie eine feste Zeit. Wird die Seite in 3 s nicht ruhig, steht im Testprotokoll eine
 * Zeile, welche Bedingung offen war, und der Aufrufer misst trotzdem.
 */
export async function seiteRuhig(seite, { maus = true } = {}) {
  if (maus) await seite.mouse.move(0, 0);
  const ende = Date.now() + RUHE_GRENZE;
  let grund = '';
  while (Date.now() < ende) {
    const anfragen = offeneAnfragen(seite);
    if (anfragen.length) {
      grund = `Anfragen offen: ${anfragen
        .slice(0, 3)
        .map((r) => new URL(r.url()).pathname)
        .join(', ')}`;
      await new Promise((r) => setTimeout(r, 25));
      continue;
    }
    grund = await seite.evaluate(
      (frist) =>
        new Promise((fertig) => {
          const BEDIEN = 'a[href], button, input, select, textarea, summary, [role="button"]';
          const lage = () => {
            const d = document.documentElement;
            const teile = [scrollX, scrollY, d.scrollWidth, d.scrollHeight];
            // Höchstens 300 Elemente: genug, um ein nachrückendes Layout zu sehen, ohne jedes Bild teuer zu machen.
            for (const el of [...document.querySelectorAll(BEDIEN)].slice(0, 300)) {
              const r = el.getBoundingClientRect();
              teile.push(Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height));
            }
            return teile.join(',');
          };
          const laufend = () =>
            document.getAnimations().filter((a) => a.playState === 'running' && a.effect?.getComputedTiming().iterations !== Infinity);
          let vorher = null,
            gleich = 0;
          const pruefe = () => {
            const jetzt = lage();
            const an = laufend();
            gleich = jetzt === vorher && !an.length ? gleich + 1 : 0;
            const war = vorher;
            vorher = jetzt;
            if (gleich >= 2) fertig('');
            else if (Date.now() > frist) {
              const ziel = (x) => {
                const t = x.effect?.target;
                return t
                  ? `${t.tagName.toLowerCase()}${t.className && typeof t.className === 'string' ? `.${t.className.split(' ')[0]}` : ''}`
                  : '?';
              };
              fertig(
                an.length
                  ? `Animation läuft: ${an
                      .slice(0, 3)
                      .map((x) => `${x.animationName ?? x.transitionProperty ?? x.constructor.name} an ${ziel(x)}`)
                      .join(', ')}`
                  : war !== jetzt
                    ? 'Layout bewegt sich'
                    : 'unbekannt',
              );
            } else requestAnimationFrame(pruefe);
          };
          void document.fonts.ready.then(() => requestAnimationFrame(pruefe));
        }),
      ende,
    );
    // Hat das Warten neue Anfragen ausgelöst (z. B. ein Übergang, der nachlädt), noch eine Runde.
    if (!grund && !offeneAnfragen(seite).length) return;
  }
  console.log(
    `# seiteRuhig: nach ${RUHE_GRENZE / 1000} s nicht ruhig auf ${new URL(seite.url()).pathname} – ${grund || 'Anfragen offen'}; gemessen wird trotzdem`,
  );
}

/** Mindestmaß einer Tippfläche am Handy (#1027, Musterkatalog D6 „Tippziele ≥ 44 pt“). */
export const TIPPFLAECHE = 44;
/**
 * Ausnahmen von der Messung – nur mit Grund. Schlüssel: CSS-Selektor, Wert: Grund.
 */
export const TIPP_AUSNAHMEN = {
  // #1214: Verweise mitten im Fließtext eines Absatzes nimmt WCAG 2.5.8 aus („Inline“); am Handy wachsen sie in der
  // Werkbank trotzdem unsichtbar auf 44 px, stoßen dabei aber an die Zeilen darüber und darunter.
  'p > a.verweis': 'Verweis im Fließtext (WCAG 2.5.8, Ausnahme „Inline“)',
};

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
export async function tippflaechenPruefen(seite, bereich) {
  const elemente = await seite.evaluate(
    ([ausnahmen, bereich]) => {
      const AUSWAHL =
        'a[href], button, input:not([type="hidden"]), select, textarea, summary, [role="button"], [tabindex]:not([tabindex="-1"])';
      // Inhalt zugeklappter Einzelheiten (<details> ohne open, außer ihrem summary) ist nicht zu sehen – auch wenn Chromium
      // ihm eine leere Fläche gibt (#1006: Fassungen in der Musterseite).
      const verborgen = (el) => {
        const d = el.closest('details:not([open])');
        return !!d && !(el.matches('summary') && el.parentElement === d);
      };
      // Nur in den Bereichen (#1211, #1212), wenn angegeben.
      const drin = (el) => !bereich || bereich.some((b) => el.closest(b));
      // Unsichtbar (visibility: hidden) heißt: kein Tippziel – der Finger trifft, was darunter liegt (#1227: die Auswahl
      // der Trefferliste steht unsichtbar und gesperrt da, bis die Quelle angehakt ist, damit keine Zeile springt).
      const unsichtbar = (el) => getComputedStyle(el).visibility !== 'visible';
      const sichtbar = [...document.querySelectorAll(AUSWAHL)].filter(
        (el) =>
          el.getClientRects().length > 0 &&
          !verborgen(el) &&
          !unsichtbar(el) &&
          drin(el) &&
          !Object.keys(ausnahmen).some((a) => el.matches(a)),
      );
      // Lange Listen (z. B. das Protokoll, das mit jedem Rauchtest wächst) bestehen aus vielen gleichen Zeilen: Von
      // gleich gebauten und gleich großen Elementen genügen drei – sonst läuft die Prüfung in die Zeitgrenze.
      const gesehen = new Map();
      const alle = sichtbar.filter((el) => {
        const r = el.getBoundingClientRect();
        const art = `${el.tagName}|${el.getAttribute('role') ?? ''}|${el.className}|${el.parentElement?.className ?? ''}|${Math.round(r.width)}x${Math.round(r.height)}`;
        const n = (gesehen.get(art) ?? 0) + 1;
        gesehen.set(art, n);
        return n <= 3;
      });
      alle.forEach((el, i) => {
        el.dataset.tippnr = String(i);
      });
      return alle.length;
    },
    [TIPP_AUSNAHMEN, bereich ?? null],
  );
  const zuKlein = [];
  // Oben anfangen (die Seite selbst rollt nicht, das prüft musterAufnehmen vorher) – und erst, wenn sie ruhig ist (#1266):
  // Lädt z. B. der Systemzustand noch nach, rückt das Layout während der Messung um 1 px.
  await seite.evaluate(() => scrollTo(0, 0));
  await seiteRuhig(seite);
  for (let i = 0; i < elemente; i++) {
    const el = seite.locator(`[data-tippnr="${i}"]`);
    // Bewegt sich die Seite trotzdem während der Messung, nach erneuter Ruhe noch einmal messen (höchstens dreimal).
    for (let versuch = 1; ; versuch++) {
      // Ins Bild holen und warten, bis das Element drei Bilder lang ruhig steht und die Trefferprüfung es in seiner
      // Mitte findet: Am Handy rollt Chromium nebenläufig, gleich danach trifft elementFromPoint oft noch eine andere
      // Stelle (höchstens 120 Bilder).
      const stand = await el.evaluate(
        (e) =>
          new Promise((fertig) => {
            e.scrollIntoView({ block: 'center', inline: 'center' });
            let n = 0,
              ruhig = 0,
              vorher = null;
            const pruefe = () => {
              const b = e.getBoundingClientRect();
              const jetzt = `${Math.round(b.left)},${Math.round(b.top)} bei ${Math.round(scrollX)},${Math.round(scrollY)}`;
              ruhig = jetzt === vorher ? ruhig + 1 : 0;
              vorher = jetzt;
              const h = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
              const trifft = h && (h === e || e.contains(h) || h.closest('label')?.control === e);
              if (++n > 120 || (ruhig >= 3 && trifft)) fertig(jetzt);
              else requestAnimationFrame(pruefe);
            };
            requestAnimationFrame(pruefe);
          }),
      );
      const r = await el.evaluate(
        (ziel, [mass, stand]) => {
          /** Gehört ein getroffener Punkt zum Element? Direkt, als Kind, oder über eine Beschriftung (label → control). */
          const gehoert = (h) => !!h && (ziel === h || ziel.contains(h) || h.closest('label')?.control === ziel);
          // Element samt Beschriftungen (ein Haken schaltet auch über sein label).
          const b = [ziel, ...(ziel.labels ?? [])]
            .map((x) => x.getBoundingClientRect())
            .reduce((a, c) => ({
              left: Math.min(a.left, c.left),
              top: Math.min(a.top, c.top),
              right: Math.max(a.right, c.right),
              bottom: Math.max(a.bottom, c.bottom),
            }));
          b.width = b.right - b.left;
          const schritt = 2;
          // Bei breiten Elementen genügt ein Streifen um die Mitte; senkrecht immer die ganze Höhe samt Rand.
          const x0 = b.width > 3 * mass ? b.left + b.width / 2 - 1.5 * mass : b.left - mass;
          const x1 = b.width > 3 * mass ? b.left + b.width / 2 + 1.5 * mass : b.right + mass;
          const y0 = b.top - mass,
            y1 = b.bottom + mass;
          const sp = Math.ceil((x1 - x0) / schritt),
            ze = Math.ceil((y1 - y0) / schritt);
          // Präfixsummen über das Raster der Treffer: gibt es ein volles Quadrat mass × mass?
          const summe = Array.from({ length: ze + 1 }, () => new Int32Array(sp + 1));
          let breit = 0,
            hoch = 0,
            minX = Infinity,
            maxX = -Infinity,
            minY = Infinity,
            maxY = -Infinity;
          for (let y = 0; y < ze; y++) {
            for (let x = 0; x < sp; x++) {
              const px = x0 + x * schritt + 1,
                py = y0 + y * schritt + 1;
              const t = px >= 0 && py >= 0 && px < innerWidth && py < innerHeight && gehoert(document.elementFromPoint(px, py)) ? 1 : 0;
              if (t) {
                minX = Math.min(minX, px);
                maxX = Math.max(maxX, px);
                minY = Math.min(minY, py);
                maxY = Math.max(maxY, py);
              }
              summe[y + 1][x + 1] = t + summe[y][x + 1] + summe[y + 1][x] - summe[y][x];
            }
          }
          const n = Math.floor(mass / schritt);
          let voll = false;
          for (let y = n; y <= ze && !voll; y++)
            for (let x = n; x <= sp && !voll; x++)
              voll = summe[y][x] - summe[y - n][x] - summe[y][x - n] + summe[y - n][x - n] >= n * n - 8;
          if (minX !== Infinity) {
            breit = maxX - minX + schritt;
            hoch = maxY - minY + schritt;
          }
          const name = (ziel.getAttribute('aria-label') || ziel.textContent || ziel.getAttribute('title') || '')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 40);
          const art = ziel.tagName.toLowerCase() + (ziel.type && ziel.tagName === 'INPUT' ? `[${ziel.type}]` : '');
          const ort = ziel.closest('[data-zustand]')?.dataset.zustand ?? ziel.closest('section, header, nav')?.id ?? '';
          const was = `${ort ? `${ort} › ` : ''}${art}${name ? ` „${name}“` : ''}`;
          // Hat sich die Seite seit dem Warten bewegt, gilt die Messung nicht: lieber das sagen als eine falsche Größe.
          const e = ziel.getBoundingClientRect();
          const jetzt = `${Math.round(e.left)},${Math.round(e.top)} bei ${Math.round(scrollX)},${Math.round(scrollY)}`;
          if (jetzt !== stand)
            return {
              bewegt: true,
              voll: false,
              text: `${was}: Seite hat sich während der Messung bewegt (Element und Rollstand ${stand} → ${jetzt})`,
            };
          return { voll, text: `${was}: Tippfläche etwa ${Math.round(breit)} × ${Math.round(hoch)} px` };
        },
        [TIPPFLAECHE, stand],
      );
      if (r.bewegt && versuch < 3) {
        await seiteRuhig(seite);
        continue;
      }
      if (!r.voll) zuKlein.push(r.text);
      break;
    }
  }
  await seite.evaluate(() => {
    document.querySelectorAll('[data-tippnr]').forEach((e) => delete e.dataset.tippnr);
    scrollTo(0, 0);
  });
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
    const x = Math.min(r[0].left, r[1].left) - 8 + scrollX,
      y = Math.min(r[0].top, r[1].top) - 8 + scrollY;
    return {
      x,
      y,
      width: Math.max(r[0].right, r[1].right) + 8 + scrollX - x,
      height: Math.max(r[0].bottom, r[1].bottom) + 8 + scrollY - y,
    };
  });
}

/**
 * Musterseite in allen Ansichten aufnehmen und prüfen.
 * @param browser  Playwright-Browser (Chromium)
 * @param optionen basis (Adresse von Ablago), ziel (Ordner der Bilder), gebiet (z. B. de-DE), pruefen (axe, Vorgabe an),
 *                 beobachte (wird mit jedem neuen Browser-Kontext aufgerufen, z. B. um Fehler zu sammeln)
 * @returns { bilder: string[], verstoesse: string[] } – Verstöße je Ansicht mit ihrem Namen davor
 */
/** Bilder fürs Benutzerhandbuch „So sehen Knöpfe aus“ (#1524): Name und Karte der Musterseite. */
const KNOEPFE_BILDER = [
  ['arten', '[data-zustand="knopf-arten"]'],
  ['wege', '[data-zustand="knopf-wege"]'],
  ['gefahr', '[data-zustand="knopf-gefahr"]'],
  ['rueckfrage', '[data-zustand="knopf-rueckfrage"]'],
  ['blass', '[data-zustand="knopf-gesperrt"]'],
  // Die breite Karte nur so breit wie die geöffnete Erklärung.
  ['gesperrt', '[data-zustand="knopf-erklaerung"]', 'justify-self: start; width: 560px; max-width: 100%'],
  ['etikett', '[data-zustand="etikett-arten"]'],
  ['schalter', '[data-zustand="schalter-an"]'],
  ['haken', '#feld [data-zustand="haken"]'],
];

export async function musterAufnehmen(browser, { basis, ziel, gebiet = 'de-DE', pruefen = true, beobachte } = {}) {
  const bilder = [];
  const verstoesse = [];
  const foto = async (was, name, optionen) => {
    await was.screenshot({ path: join(ziel, `${name}.png`), ...optionen });
    bilder.push(name);
  };
  for (const a of ANSICHTEN) {
    const k = await browser.newContext({
      viewport: a.viewport,
      colorScheme: a.schema,
      locale: gebiet,
      timezoneId: 'Europe/Berlin',
      deviceScaleFactor: 1,
      ...(a.handy ? { isMobile: true, hasTouch: true } : {}),
    });
    beobachte?.(k);
    anfragenZaehlen(k);
    try {
      const s = await k.newPage();
      await s.goto(`${basis}/muster`);
      await s.locator('[data-zustand="fokus"]').waitFor();
      await s.evaluate(() => document.fonts.ready);
      if (pruefen) verstoesse.push(...(await axePruefen(s)).map((v) => `${a.name}: ${v}`));
      // Die Seite rollt nach dem Laden nicht von selbst (#1027): Früher holte jedes Ergebnis, das schon beim Öffnen am
      // Knopf stand, sich sanft ins Bild – die Seite rollte dann noch während der Messung der Tippflächen.
      const gerollt = await s.evaluate(() => Math.round(scrollY));
      if (pruefen && gerollt !== 0) verstoesse.push(`${a.name}: Seite rollt nach dem Laden von selbst (${gerollt} px nach unten)`);
      // Handybreite: nie waagerecht rollen.
      const { breit, sicht } = await s.evaluate(() => ({
        breit: document.documentElement.scrollWidth,
        sicht: document.documentElement.clientWidth,
      }));
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
        await s.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());
        await foto(s.locator('#knopf'), `muster-knopf${suffix}`);
        await foto(s.locator('#bereiche'), `muster-bereiche${suffix}`);
        await foto(s.locator('#fassungen'), `muster-fassungen${suffix}`);
        await foto(s.locator('#speicherleiste'), `muster-speicherleiste${suffix}`);
        await foto(s.locator('#reiter'), `muster-reiter${suffix}`);
        await foto(s.locator('#schalter'), `muster-schalter${suffix}`);
        await foto(s.locator('#paketchip'), `muster-paketchip${suffix}`);
        for (const b of ['menue', 'wahlhaken', 'mehrfachauswahl', 'platzhalter', 'etikett', 'zahl', 'kachel', 'aufklapper', 'datum'])
          await foto(s.locator(`#${b}`), `muster-${b}${suffix}`);
        // Benutzerhandbuch „So sehen Knöpfe aus“ (#1524): einzelne Karten der Musterseite, damit die Bilder von selbst
        // stimmen, wenn sich ein Baustein ändert.
        // Ohne die Überschrift der Musterseite (Fachwörter für Entwickler) und nur so hoch wie der Inhalt.
        const stil = await s.addStyleTag({
          content: KNOEPFE_BILDER.map(
            ([, wo, mehr = '']) => `${wo} > h3 { display: none } ${wo} { align-self: start; height: auto; ${mehr} }`,
          ).join('\n'),
        });
        for (const [name, wo] of KNOEPFE_BILDER) await foto(s.locator(wo).first(), `knoepfe-${name}${suffix}`);
        await stil.evaluate((el) => el.remove());
      }
    } finally {
      await k.close();
    }
  }
  return { bilder, verstoesse };
}
