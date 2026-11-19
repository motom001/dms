/**
 * Oberfläche messen (#1276): die häufigsten Abläufe (ablaeufe.mjs) in Chromium bedienen und je Schritt messen, was man
 * am Bildschirm spürt – Zeit bis bedienbar, Reaktion auf Eingaben (INP), lange Aufgaben im Browser, dazu Anfragen und
 * ihre Server-Zeit. Normal und mit gedrosselter CPU (4×: schwacher Laptop, Handy). Ergebnis als JSON und Markdown,
 * Vergleich mit einem früheren Lauf (auswertung.mjs). Kein Test, keine Telemetrie: gemessen wird nur hier, nie bei
 * echten Personen.
 *
 *   # einmal: frisches Ablago (mit Datenbank, noch ohne Haushalt) einrichten und die Testdaten anlegen
 *   DMS_URL=http://localhost:3100 node web/rauchtest/messen/oberflaeche.mjs --einrichten [--mappen 5000]
 *   # messen
 *   DMS_URL=http://localhost:3100 node web/rauchtest/messen/oberflaeche.mjs --geraet "Laptop gegen NAS" \
 *     [--runden 5] [--drossel 1,4] [--nur post-zuordnen,suche] [--frist 60000] \
 *     [--vorher alt.json] [--json neu.json] [--bericht neu.md] [--grenzen]
 *
 * --grenzen: Exit-Code 1 bei Verschlechterung gegenüber --vorher (über der Schwelle), über einer CI-Grenze oder wenn
 * ein Schritt die Frist überschreitet. DMS_EINRICHTUNGSCODE wird beim Einrichten mitgeschickt, falls gesetzt.
 * Getrennt vom Lasttest und nicht im Image (Kommentar Thomas in #1276): Browser und Server sollen sich nicht dieselbe
 * CPU teilen – gemessen wird von einem anderen Rechner aus (CI-Runner, Laptop gegen DMS_URL).
 * Braucht Playwright mit Chromium (wie die Rauchtests, im Ordner web/rauchtest).
 */
import { writeFile, readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { ABLAEUFE } from './ablaeufe.mjs';
import { bericht, besseresVon, grenzenPruefen, istRot, rundeAuswerten, vergleichen, zusammenfassen } from './auswertung.mjs';
import { einrichten, laden, verwaltungsSitzung } from './daten.mjs';

const BASIS = (process.env.DMS_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const arg = (n, vorgabe) => {
  const i = process.argv.indexOf(n);
  return i < 0 ? vorgabe : process.argv[i + 1];
};
const hat = (n) => process.argv.includes(n);

/**
 * Feste Grenzen je Ablauf und Drossel (ms, Median), ab denen --grenzen rot wird: erst nach dem ersten Lauf auf den
 * Rechnern von GitHub (erster Lauf + 20 %, wie beim Lasttest #563), danach nur strenger. Bis dahin leer – rot macht
 * dann nur die Verschlechterung gegenüber dem Vorlauf.
 */
const CI_GRENZEN = {};

/** In jeder Seite vor ihren Skripten: lange Aufgaben und Eingaben mitschreiben (nur in diesem Mess-Lauf). */
function beobachter() {
  const m = { lange: [], ereignisse: [] };
  window.__messung = {
    holen: () => m,
    leeren: () => {
      m.lange.length = 0;
      m.ereignisse.length = 0;
    },
  };
  try {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) m.lange.push([e.startTime, e.duration]);
    }).observe({ type: 'longtask', buffered: true });
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) if (e.interactionId) m.ereignisse.push([e.duration, e.interactionId]);
    }).observe({ type: 'event', durationThreshold: 16, buffered: true });
  } catch {
    /* ohne Beobachter misst nur die Zeit bis bedienbar */
  }
}

/** Server-Zeit einer Antwort aus Server-Timing („gesamt“). */
async function serverZeit(antwort) {
  const st = (await antwort.allHeaders().catch(() => ({})))['server-timing'] ?? '';
  const m = /(?:^|,)\s*gesamt;dur=([\d.]+)/.exec(st);
  return m ? Number(m[1]) : 0;
}

class Frist extends Error {}
const mitFrist = (p, ms) => {
  let timer;
  return Promise.race([
    p,
    new Promise((_, nein) => {
      timer = setTimeout(() => nein(new Frist()), ms);
    }),
  ]).finally(() => clearTimeout(timer));
};

/** Neue Seite mit Drossel (CDP, nur Chromium). */
async function neueSeite(kontext, drossel) {
  const s = await kontext.newPage();
  if (drossel > 1) await (await kontext.newCDPSession(s)).send('Emulation.setCPUThrottlingRate', { rate: drossel });
  return s;
}

/**
 * Eine Runde in einer frischen Seite (der Zwischenspeicher des Kontexts bleibt): vorbereiten (ungemessen), Schritt
 * messen, aufräumen, Seite schließen – eine hängende Seite rechnet so nicht in die nächste Runde hinein. Scheitert
 * schon das Vorbereiten an der Frist (die Seite der Runde davor hing den Rechner auf), zählt die Runde wie eine
 * Zeitüberschreitung.
 */
async function runde(kontext, ablauf, d, { nr, drossel, frist }) {
  const s = await neueSeite(kontext, drossel);
  const antworten = [];
  const hoerer = (a) => {
    if (a.url().startsWith(BASIS + '/api/')) antworten.push(serverZeit(a));
  };
  let zeitueberschritten = false,
    dauer = frist,
    roh = { lange: [[0, frist]], ereignisse: [] };
  // Aufräumen auch nach überschrittener Frist (Nachtrag zu #1339): Sonst bleibt z. B. ein Messbrief in „Neue Post“, und
  // ein späterer Lauf auf derselben Datenbank lädt denselben Brief erneut hoch – Ablago erkennt die Dublette, der
  // Schritt kommt nie an und läuft wieder in die Frist.
  try {
    try {
      if (ablauf.vorbereiten) await mitFrist(ablauf.vorbereiten(s, d, nr), frist);
      // Erst messen, wenn die Seite nach dem Vorbereiten ein Bild gemalt hat und frei ist (eine leere Seite malt nicht).
      if (s.url() !== 'about:blank') {
        await mitFrist(
          s.evaluate(() => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)))),
          frist,
        );
        await s.evaluate(() => window.__messung?.leeren());
      }
      s.on('response', hoerer);
      const t0 = performance.now();
      await mitFrist(ablauf.schritt(s, d, nr), frist);
      // Bedienbar: Das Ergebnis ist zu sehen, ein Bild ist gemalt und die Seite nimmt wieder Eingaben an.
      await mitFrist(
        s.evaluate(() => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)))),
        frist,
      );
      dauer = performance.now() - t0;
      roh = await s.evaluate(() => window.__messung?.holen() ?? { lange: [], ereignisse: [] });
    } catch (e) {
      if (!(e instanceof Frist) && e?.name !== 'TimeoutError') throw e;
      if (process.env.DEBUG_Q4) console.log(e);
      zeitueberschritten = true;
    }
  } finally {
    s.off('response', hoerer);
    if (ablauf.aufraeumen)
      await mitFrist(ablauf.aufraeumen(s, d, nr), frist).catch((e) =>
        console.warn(`Aufräumen nach „${ablauf.name}“ gescheitert: ${e?.message ?? e}`),
      );
  }
  const zeiten = await Promise.all(antworten);
  await s.close().catch(() => {});
  return {
    ...rundeAuswerten({ dauer, ...roh }),
    anfragen: zeiten.length,
    serverMs: Math.round(zeiten.reduce((a, b) => a + b, 0)),
    zeitueberschritten,
  };
}

async function kontextMit(browser, cookie) {
  const k = await browser.newContext({ locale: 'de-DE', timezoneId: 'Europe/Berlin', viewport: { width: 1366, height: 900 } });
  k.setDefaultTimeout(60_000);
  const i = cookie.indexOf('=');
  await k.addCookies([{ name: cookie.slice(0, i), value: cookie.slice(i + 1), url: BASIS }]);
  await k.addInitScript(beobachter);
  return k;
}

async function messen() {
  const runden = Number(arg('--runden', 5));
  const drosseln = arg('--drossel', '1,4').split(',').map(Number);
  const frist = Number(arg('--frist', 60_000));
  const nur = arg('--nur')?.split(',');
  const ablaeufe = ABLAEUFE.filter((a) => !nur || nur.includes(a.id));
  const d = await laden(BASIS);
  const verwaltung = await verwaltungsSitzung(BASIS);
  const system = await verwaltung.api('GET', '/api/werkbank/system').catch(() => null);
  const demo = await verwaltung.api('GET', '/api/werkbank/demo').catch(() => null);
  const browser = await chromium.launch();
  const ergebnis = {
    version: 1,
    ablago: system?.dms?.version ?? null,
    zeit: new Date().toISOString(),
    geraet: arg('--geraet', 'unbekannt'),
    runden,
    daten: d.beschreibung(Array.isArray(demo) ? demo.reduce((n, x) => n + (x.demo ?? 0), 0) : null),
    ergebnisse: {},
  };
  let nr = 0;
  /** Ein Ablauf mit einer Drossel: eigener Kontext, eine Runde zum Aufwärmen (Zwischenspeicher), dann die gezählten. */
  const messeAblauf = async (ablauf, drossel) => {
    const k = await kontextMit(browser, ablauf.verwaltung ? verwaltung.cookie : d.cookie);
    const liste = [];
    for (let i = 0; i <= runden; i++) {
      const r = await runde(k, ablauf, d, { nr: ++nr, drossel, frist });
      if (i > 0) liste.push(r);
    }
    await k.close();
    const z = zusammenfassen(liste);
    console.log(
      `${ablauf.name} (${drossel}×): bedienbar ${z.bedienbar.median} ms, INP ${z.inp.median ?? '–'} ms, längste Aufgabe ${z.laengste.median} ms${z.zeitueberschritten ? `, ${z.zeitueberschritten}× Frist überschritten` : ''}`,
    );
    return z;
  };
  const vorherDatei = arg('--vorher');
  const vorher = vorherDatei ? await readFile(vorherDatei, 'utf8').then(JSON.parse, () => null) : null;
  if (vorherDatei && !vorher) console.log(`Kein Vorlauf unter ${vorherDatei} – ohne Vergleich.`);
  let vergleich;
  try {
    for (const ablauf of ablaeufe) {
      const e = (ergebnis.ergebnisse[ablauf.id] = { name: ablauf.name, drosseln: {} });
      for (const drossel of drosseln) e.drosseln[drossel] = await messeAblauf(ablauf, drossel);
    }
    vergleich = vergleichen(ergebnis, vorher);
    // Schlechter als vorher? Einmal nachmessen und je Kennzahl den besseren Lauf nehmen: Ein kurzer Ausreißer des
    // Rechners (andere Arbeit nebenher) soll den Lauf nicht rot machen, eine echte Bremse ist beide Male da.
    const nach = [...new Set(vergleich.filter((v) => v.art === 'schlechter').map((v) => `${v.ablauf}|${v.drossel}`))];
    for (const x of nach) {
      const [id, drossel] = x.split('|');
      console.log(`Nachmessen: ${ergebnis.ergebnisse[id].name} (${drossel}×)`);
      const e = ergebnis.ergebnisse[id];
      e.drosseln[drossel] = besseresVon(
        e.drosseln[drossel],
        await messeAblauf(
          ablaeufe.find((a) => a.id === id),
          Number(drossel),
        ),
      );
    }
    if (nach.length) vergleich = vergleichen(ergebnis, vorher);
  } finally {
    await browser.close();
  }
  const pruefung = grenzenPruefen(ergebnis, CI_GRENZEN);
  const text = bericht(ergebnis, { vergleich, pruefung, vorher });
  if (arg('--json')) await writeFile(arg('--json'), JSON.stringify(ergebnis, null, 2) + '\n');
  if (arg('--bericht')) await writeFile(arg('--bericht'), text);
  console.log('\n' + text);
  if (hat('--grenzen') && istRot(vergleich, pruefung)) {
    console.log('Rot: Verschlechterung gegenüber dem Vorlauf, CI-Grenze überschritten oder Frist überschritten (siehe oben).');
    process.exitCode = 1;
  }
}

if (hat('--einrichten')) await einrichten(BASIS, { code: process.env.DMS_EINRICHTUNGSCODE, mappen: Number(arg('--mappen', 5000)) });
else await messen();
