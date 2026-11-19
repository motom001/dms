#!/usr/bin/env node
/**
 * Upstream-Abgleich für wichtige Systemprogramme (#1417).
 *
 * Trivy und Grype kennen bei Alpine-Paketen nur, was die Alpine-Sicherheitsdatenbank (secdb) führt. Ist ein CVE dort
 * noch nicht eingetragen, bleibt er für beide unsichtbar. Dieses Werkzeug schlägt deshalb die ausgelieferten Versionen
 * der Programme aus upstream-programme.json direkt bei NVD nach:
 *   1. Meldungen, deren CPE-Angaben die Version betreffen (`cpeName` mit `isVulnerable`),
 *   2. Meldungen der letzten 120 Tage, die NVD noch nicht eingeordnet hat (ohne CPE-Angaben), über ein Suchwort und ein
 *      Muster in der Beschreibung – genau der Fall, in dem auch NVD-basierte Scanner nichts sehen.
 * Was die secdb für das Paket schon als behoben führt (gleiche oder ältere Paketversion), fällt weg.
 *
 * Ergebnis ist eine SARIF-Datei für den Sicherheits-Reiter von GitHub (nur mit Schreibrecht sichtbar). Auf der
 * Konsole erscheinen keine Funde: Die Protokolle der Läufe sind in einem öffentlichen Repository öffentlich.
 *
 * Aufruf (sicherheitsabgleich.yml):
 *   node .github/werkzeuge/upstream-abgleich.mjs --inventar <ordner mit <ort>.syft.json> --sarif <datei>
 *   node .github/werkzeuge/upstream-abgleich.mjs --probe     (bekannter Fall: Node.js 18.0.0 muss anschlagen)
 * Optional NVD_API_KEY (höhere Grenze bei NVD); ohne Schlüssel wartet das Werkzeug zwischen den Abfragen.
 *
 * Tests: node --test .github/werkzeuge/upstream-abgleich.test.mjs
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const NVD = 'https://services.nvd.nist.gov/rest/json/cves/2.0';
export const SECDB = 'https://secdb.alpinelinux.org';
/** Längster Zeitraum, den NVD für pubStartDate/pubEndDate erlaubt. */
export const TAGE = 120;
const PROGRAMME = join(import.meta.dirname, 'upstream-programme.json');

/** Teile einer Alpine-Version: „25.12.0-r1“ → { basis: '25.12.0', rel: 1 }. */
export function apkTeile(v) {
  const m = /^(.*?)(?:-r(\d+))?$/.exec(String(v));
  return { basis: m[1], rel: Number(m[2] ?? 0) };
}

/** Vergleich zweier Alpine-Versionen (vereinfacht wie apk: Zahlen als Zahlen, sonst als Text); <0, 0, >0. */
export function apkVergleich(a, b) {
  const x = apkTeile(a);
  const y = apkTeile(b);
  const tx = x.basis.match(/\d+|[^\d.]+/g) ?? [];
  const ty = y.basis.match(/\d+|[^\d.]+/g) ?? [];
  for (let i = 0; i < Math.max(tx.length, ty.length); i++) {
    const p = tx[i];
    const q = ty[i];
    if (p === undefined) return /^\d/.test(q) ? -1 : 1; // 1.2 < 1.2.1, aber 1.2_rc1 < 1.2
    if (q === undefined) return /^\d/.test(p) ? 1 : -1;
    if (p === q) continue;
    const zp = /^\d+$/.test(p);
    const zq = /^\d+$/.test(q);
    if (zp && zq) return Number(p) - Number(q);
    if (zp !== zq) return zp ? 1 : -1;
    return p < q ? -1 : 1;
  }
  return x.rel - y.rel;
}

/** Version für die CPE: Alpine-Revision und Zusätze wie „_git…“ ab. */
export const upstreamVersion = (v) => apkTeile(v).basis.replace(/_.*$/, '');

/**
 * Programme aus den Stücklisten von Syft (JSON) heraussuchen.
 * @param {Array<{ort: string, syft: any}>} listen
 * @returns {Map<string, {programm: any, version: string, paket: string, herkunft: string, orte: Set<string>}>}
 */
export function inventar(listen, programme) {
  const treffer = new Map();
  for (const { ort, syft } of listen) {
    for (const a of syft.artifacts ?? []) {
      for (const p of programme) {
        const passt = p.pakete
          ? a.type === 'apk' && new RegExp(`^(${p.pakete})$`).test(a.name)
          : a.type === 'binary' && a.name === p.binaer;
        if (!passt) continue;
        const herkunft = a.type === 'apk' ? (a.metadata?.originPackage ?? a.name) : '';
        const schluessel = `${p.name}|${a.version}|${herkunft}`;
        if (!treffer.has(schluessel))
          treffer.set(schluessel, { programm: p, version: a.version, paket: a.name, herkunft, orte: new Set() });
        treffer.get(schluessel).orte.add(ort);
      }
    }
  }
  return treffer;
}

/** Alpine-Zweig aus den Stücklisten („v3.24“), null ohne Alpine. */
export function alpineZweige(listen) {
  const z = new Set();
  for (const { syft } of listen) {
    const d = syft.distro ?? {};
    const m = /^(\d+)\.(\d+)/.exec(d.versionID ?? d.version ?? '');
    if ((d.id ?? d.name) === 'alpine' && m) z.add(`v${m[1]}.${m[2]}`);
  }
  return [...z];
}

/** secdb-Einträge zu { herkunft → { version → [CVE…] } } zusammenführen. */
export function secfixes(dbs) {
  const s = new Map();
  for (const db of dbs)
    for (const { pkg } of db.packages ?? []) {
      const alt = s.get(pkg.name) ?? {};
      for (const [v, cves] of Object.entries(pkg.secfixes ?? {})) alt[v] = [...(alt[v] ?? []), ...cves];
      s.set(pkg.name, alt);
    }
  return s;
}

/** Führt die secdb den CVE für dieses Paket als behoben in einer Version ≤ der ausgelieferten (oder „0“ = nie betroffen)? */
export function behoben(fixes, herkunft, version, cve) {
  for (const [v, cves] of Object.entries(fixes.get(herkunft) ?? {}))
    if (cves.some((c) => c.split(/\s+/)[0] === cve) && (v === '0' || apkVergleich(v, version) <= 0)) return true;
  return false;
}

/** Schwere und Punktzahl einer NVD-Meldung (CVSS 4.0, dann 3.1, 3.0, 2). */
export function schwere(cve) {
  const m = cve.metrics ?? {};
  for (const art of ['cvssMetricV40', 'cvssMetricV31', 'cvssMetricV30', 'cvssMetricV2']) {
    const e = (m[art] ?? []).find((x) => x.type === 'Primary') ?? m[art]?.[0];
    if (e) return { stufe: (e.cvssData?.baseSeverity ?? e.baseSeverity ?? '').toUpperCase(), punkte: Number(e.cvssData?.baseScore ?? 0) };
  }
  return { stufe: '', punkte: 0 };
}

export const beschreibung = (cve) => (cve.descriptions ?? []).find((d) => d.lang === 'en')?.value ?? '';
export const ohneEinordnung = (cve) => !(cve.configurations ?? []).length;

/** Meldung ohne Einordnung, die nach Muster wirklich das Programm betrifft. */
export function betrifft(programm, cve) {
  const text = beschreibung(cve);
  if (!new RegExp(programm.muster, 'i').test(text)) return false;
  return !(programm.ohne && new RegExp(programm.ohne, 'i').test(text));
}

const nvdZeit = (t) => new Date(t).toISOString().replace('Z', '');

/** Abfrage-Adressen für ein Programm in einer Version. */
export function abfragen(programm, version, jetzt = Date.now()) {
  const cpe = `${programm.cpe}:${version}:*:*:*:*:*:*:*`;
  const start = nvdZeit(jetzt - TAGE * 86_400_000 + 60_000);
  return {
    version: `${NVD}?cpeName=${encodeURIComponent(cpe)}&isVulnerable`,
    neu: `${NVD}?keywordSearch=${encodeURIComponent(programm.suchwort)}&pubStartDate=${start}&pubEndDate=${nvdZeit(jetzt)}`,
  };
}

const schlafe = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * NVD und secdb abrufen: mit Pause zwischen den NVD-Abfragen (ohne Schlüssel höchstens 5 je 30 Sekunden) und
 * Wiederholung bei Überlast. Bleibt eine Abfrage erfolglos, bricht der Lauf ab – ein stilles „nichts gefunden“ wäre
 * schlimmer als ein roter Lauf.
 */
export function holer({ fetchen = fetch, warte = schlafe, schluessel = process.env.NVD_API_KEY, pause } = {}) {
  const abstand = pause ?? (schluessel ? 700 : 6500);
  let zuletzt = 0;
  return async function hole(url) {
    const istNvd = url.startsWith(NVD);
    for (let versuch = 1; ; versuch++) {
      if (istNvd) {
        const warten = zuletzt + abstand - Date.now();
        if (warten > 0) await warte(warten);
        zuletzt = Date.now();
      }
      let antwort;
      try {
        antwort = await fetchen(url, { headers: istNvd && schluessel ? { apiKey: schluessel } : {}, signal: AbortSignal.timeout(60_000) });
      } catch (e) {
        antwort = { ok: false, status: `Netz (${e.message})` };
      }
      if (antwort.ok) return antwort.json();
      const nochmal = typeof antwort.status !== 'number' || [403, 429, 500, 502, 503, 504].includes(antwort.status);
      if (!nochmal || versuch >= 5) throw new Error(`Abruf gescheitert (${antwort.status}): ${url.split('?')[0]}`);
      await warte(15_000 * versuch);
    }
  };
}

/** Ein Fund für die SARIF-Datei. */
function fund(t, cve, art) {
  const { stufe, punkte } = schwere(cve);
  return {
    cve: cve.id,
    programm: t.programm.name,
    version: t.version,
    paket: t.paket,
    orte: [...t.orte].sort(),
    art,
    stufe: art === 'neu' ? stufe || 'UNBEWERTET' : stufe,
    punkte,
    text: beschreibung(cve),
  };
}

/**
 * Abgleich für alle gefundenen Programme. Jede Upstream-Version wird nur einmal abgefragt.
 * @returns {Promise<Array<ReturnType<typeof fund>>>}
 */
export async function abgleich(treffer, fixes, hole, jetzt = Date.now()) {
  const cache = new Map();
  const abrufen = async (url) => {
    if (!cache.has(url)) cache.set(url, await hole(url));
    return cache.get(url);
  };
  const funde = [];
  const gesehen = new Set();
  for (const t of treffer.values()) {
    const q = abfragen(t.programm, upstreamVersion(t.version), jetzt);
    const version = (await abrufen(q.version)).vulnerabilities ?? [];
    const neu = ((await abrufen(q.neu)).vulnerabilities ?? []).filter(({ cve }) => ohneEinordnung(cve) && betrifft(t.programm, cve));
    for (const [liste, art] of [
      [version, 'version'],
      [neu, 'neu'],
    ])
      for (const { cve } of liste) {
        const k = `${cve.id}|${t.programm.name}|${t.version}`;
        if (gesehen.has(k) || (t.herkunft && behoben(fixes, t.herkunft, t.version, cve.id))) continue;
        gesehen.add(k);
        funde.push(fund(t, cve, art));
      }
  }
  return funde.sort((a, b) => b.punkte - a.punkte || a.cve.localeCompare(b.cve));
}

const STUFE = { CRITICAL: 9.5, HIGH: 8, MEDIUM: 5.5, LOW: 2, UNBEWERTET: 7 };
const ebene = (f) =>
  f.art === 'neu' ? 'warning' : ['CRITICAL', 'HIGH'].includes(f.stufe) ? 'error' : f.stufe === 'MEDIUM' ? 'warning' : 'note';

/** SARIF 2.1.0 für upload-sarif; Ort ist das Dockerfile (dort kommen die Programme ins Image). */
export function sarif(funde, kategorie = 'upstream-abgleich') {
  const regeln = new Map();
  const ergebnisse = funde.map((f) => {
    const id = `${f.cve}/${f.programm}`;
    const art =
      f.art === 'neu' ? 'NVD noch ohne Einordnung – bitte von Hand prüfen' : `NVD: ${f.programm} ${upstreamVersion(f.version)} betroffen`;
    regeln.set(id, {
      id,
      name: f.cve,
      shortDescription: { text: `${f.cve} in ${f.programm}` },
      fullDescription: { text: f.text.slice(0, 1000) || f.cve },
      helpUri: `https://nvd.nist.gov/vuln/detail/${f.cve}`,
      help: {
        text: `${art}. Die Alpine-Sicherheitsdatenbank führt für dieses Paket keine Korrektur. Prüfen: Betrifft es Ablago? Gibt es ein neueres Alpine-Paket? Ablauf: SECURITY.md.`,
      },
      properties: { tags: ['security', 'upstream', f.programm], 'security-severity': String(f.punkte || STUFE[f.stufe] || 5) },
    });
    return {
      ruleId: id,
      level: ebene(f),
      message: { text: `${f.cve}: ${f.programm} ${f.version} (Paket ${f.paket}) in ${f.orte.join(', ')} – ${art}.` },
      locations: [{ physicalLocation: { artifactLocation: { uri: 'Dockerfile' }, region: { startLine: 1 } } }],
      partialFingerprints: { 'ablago/upstream/v1': `${f.cve}|${f.programm}|${f.version}` },
    };
  });
  return {
    version: '2.1.0',
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
    runs: [
      {
        tool: {
          driver: {
            name: 'Ablago Upstream-Abgleich',
            informationUri: 'https://github.com/motom001/dms/blob/main/SECURITY.md',
            rules: [...regeln.values()],
          },
        },
        automationDetails: { id: `${kategorie}/` },
        results: ergebnisse,
      },
    ],
  };
}

/** Bekannter Fall, der anschlagen muss: Node.js 18.0.0 (u. a. CVE-2022-32213). */
export const PROBE = { ort: 'probe', syft: { artifacts: [{ type: 'binary', name: 'node', version: '18.0.0' }] } };

function argumente(argv) {
  const a = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--probe') a.probe = true;
    else if (argv[i].startsWith('--')) a[argv[i].slice(2)] = argv[++i];
  }
  return a;
}

export async function main(argv = process.argv.slice(2), hole = holer()) {
  const a = argumente(argv);
  const { programme } = JSON.parse(readFileSync(PROGRAMME, 'utf8'));
  if (a.probe) {
    const funde = await abgleich(inventar([PROBE], programme), new Map(), hole);
    const n = funde.filter((f) => f.art === 'version').length;
    if (!n) throw new Error('Probe: Node.js 18.0.0 ergibt keinen Fund – der Abgleich mit NVD schlägt nicht an.');
    console.log(`Probe in Ordnung: Node.js 18.0.0 ergibt ${n} Funde bei NVD.`);
    return funde;
  }
  if (!a.inventar || !a.sarif) throw new Error('Aufruf: --inventar <ordner> --sarif <datei> | --probe');
  const listen = readdirSync(a.inventar)
    .filter((d) => d.endsWith('.syft.json'))
    .sort()
    .map((d) => ({ ort: d.replace(/\.syft\.json$/, ''), syft: JSON.parse(readFileSync(join(a.inventar, d), 'utf8')) }));
  if (!listen.length) throw new Error('Keine Stücklisten (*.syft.json) gefunden.');
  const treffer = inventar(listen, programme);
  const fehlen = programme.filter((p) => ![...treffer.values()].some((t) => t.programm === p)).map((p) => p.name);
  if (fehlen.length) throw new Error(`Nicht in den Images gefunden: ${fehlen.join(', ')} – upstream-programme.json prüfen.`);
  const dbs = [];
  for (const z of alpineZweige(listen)) for (const r of ['main', 'community']) dbs.push(await hole(`${SECDB}/${z}/${r}.json`));
  const funde = await abgleich(treffer, secfixes(dbs), hole);
  writeFileSync(a.sarif, `${JSON.stringify(sarif(funde), null, 1)}\n`);
  // Bewusst ohne Anzahl und ohne Namen: Das Protokoll ist öffentlich.
  console.log(`Abgleich fertig: ${treffer.size} Programmversionen in ${listen.length} Images geprüft. Ergebnis im Sicherheits-Reiter.`);
  return funde;
}

if (import.meta.url === `file://${process.argv[1]}`)
  main().catch((e) => {
    console.error(`::error title=Upstream-Abgleich::${e.message}`);
    process.exit(1);
  });
