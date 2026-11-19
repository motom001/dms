// Tests für upstream-abgleich.mjs (#1417): node --test .github/werkzeuge/upstream-abgleich.test.mjs
// Ohne Netz: NVD und secdb kommen aus den Testdaten unten. Der Fall „bekannter CVE in festgehaltener Version“ läuft
// zusätzlich echt gegen NVD im Workflow (Schritt „Probe“).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  abfragen,
  abgleich,
  alpineZweige,
  apkVergleich,
  behoben,
  betrifft,
  holer,
  inventar,
  NVD,
  sarif,
  schwere,
  secfixes,
  upstreamVersion,
} from './upstream-abgleich.mjs';

const { programme } = JSON.parse(readFileSync(join(import.meta.dirname, 'upstream-programme.json'), 'utf8'));
const prog = (n) => programme.find((p) => p.name === n);
const JETZT = Date.parse('2026-11-19T12:00:00Z');

/** Stückliste wie von Syft 1.55 (nur die Felder, die das Werkzeug liest). */
const syft = (artifacts) => ({ distro: { id: 'alpine', versionID: '3.24.4' }, artifacts });
const apk = (name, version, origin = name) => ({ type: 'apk', name, version, metadata: { originPackage: origin } });
const LISTEN = [
  {
    ort: 'stabil/dms',
    syft: syft([
      apk('poppler', '24.02.0-r3'),
      apk('poppler-utils', '24.02.0-r3', 'poppler'),
      apk('qpdf', '11.9.0-r0'),
      { type: 'binary', name: 'node', version: '24.1.0' },
    ]),
  },
  {
    ort: 'stabil/dms-komplett',
    syft: syft([apk('poppler-utils', '24.02.0-r3', 'poppler'), apk('postgresql17', '17.1-r0'), apk('postgresql-common', '1.3-r0')]),
  },
];

const cve = (id, { text = 'x', konfig = true, stufe = 'HIGH', punkte = 7.8 } = {}) => ({
  cve: {
    id,
    descriptions: [{ lang: 'en', value: text }],
    configurations: konfig ? [{ nodes: [] }] : [],
    metrics: { cvssMetricV31: [{ type: 'Primary', cvssData: { baseSeverity: stufe, baseScore: punkte } }] },
  },
});

test('Alpine-Versionen vergleichen', () => {
  assert.ok(apkVergleich('24.02.0-r3', '24.02.0-r4') < 0);
  assert.ok(apkVergleich('3.1.0-r10', '3.1.0-r9') > 0);
  assert.ok(apkVergleich('25.10.0-r0', '25.9.0-r5') > 0);
  assert.equal(apkVergleich('17.1-r0', '17.1-r0'), 0);
  assert.ok(apkVergleich('1.2.1-r0', '1.2-r0') > 0);
  assert.ok(apkVergleich('1.2_rc1-r0', '1.2-r0') < 0);
  assert.equal(upstreamVersion('24.02.0-r3'), '24.02.0');
  assert.equal(upstreamVersion('1.2.3_git20260101-r0'), '1.2.3');
  assert.equal(upstreamVersion('24.1.0'), '24.1.0');
});

test('Programme aus den Stücklisten, je Version und Herkunft einmal', () => {
  const t = inventar(LISTEN, programme);
  const namen = [...t.values()].map((x) => `${x.programm.name} ${x.version} ${x.paket}`).sort();
  assert.deepEqual(namen, ['Node.js 24.1.0 node', 'PostgreSQL 17.1-r0 postgresql17', 'poppler 24.02.0-r3 poppler', 'qpdf 11.9.0-r0 qpdf']);
  const poppler = [...t.values()].find((x) => x.programm.name === 'poppler');
  assert.deepEqual([...poppler.orte].sort(), ['stabil/dms', 'stabil/dms-komplett']);
  assert.equal(poppler.herkunft, 'poppler');
  assert.deepEqual(alpineZweige(LISTEN), ['v3.24']);
});

test('secdb: behoben nur in gleicher oder älterer Paketversion', () => {
  const f = secfixes([
    { packages: [{ pkg: { name: 'poppler', secfixes: { '24.02.0-r4': ['CVE-1999-9010'], 0: ['CVE-2020-1 nie betroffen'] } } }] },
  ]);
  assert.equal(behoben(f, 'poppler', '24.02.0-r3', 'CVE-1999-9010'), false);
  assert.equal(behoben(f, 'poppler', '24.02.0-r4', 'CVE-1999-9010'), true);
  assert.equal(behoben(f, 'poppler', '24.02.0-r3', 'CVE-2020-1'), true);
  assert.equal(behoben(f, 'qpdf', '1-r0', 'CVE-1999-9010'), false);
});

test('Abfragen: CPE mit Version, Zeitraum höchstens 120 Tage', () => {
  const q = abfragen(prog('poppler'), '24.02.0', JETZT);
  assert.equal(q.version, `${NVD}?cpeName=${encodeURIComponent('cpe:2.3:a:freedesktop:poppler:24.02.0:*:*:*:*:*:*:*')}&isVulnerable`);
  const u = new URL(q.neu);
  assert.equal(u.searchParams.get('keywordSearch'), 'poppler');
  const tage = (Date.parse(`${u.searchParams.get('pubEndDate')}Z`) - Date.parse(`${u.searchParams.get('pubStartDate')}Z`)) / 86_400_000;
  assert.ok(tage <= 120 && tage > 119, String(tage));
});

test('Muster: Meldungen ohne Einordnung nur, wenn sie das Programm meinen', () => {
  const t = (p, text) => betrifft(prog(p), cve('CVE-1', { text }).cve);
  assert.equal(t('poppler', 'A crafted file crashes Poppler …'), true);
  assert.equal(t('poppler', 'A flaw in pdf.js …'), false);
  assert.equal(t('Node.js', 'A flaw in Node.js core allows …'), true);
  assert.equal(t('Node.js', 'The foo package for Node.js allows prototype pollution'), false);
  assert.equal(t('PostgreSQL', 'In PostgreSQL before 17.13, a crafted query …'), true);
  assert.equal(t('PostgreSQL', 'The pgjdbc JDBC driver for PostgreSQL allows …'), false);
});

test('Schwere: CVSS 3.1 Primary, sonst leer', () => {
  assert.deepEqual(schwere(cve('CVE-1').cve), { stufe: 'HIGH', punkte: 7.8 });
  assert.deepEqual(schwere({ id: 'CVE-2' }), { stufe: '', punkte: 0 });
});

/** NVD und secdb aus Testdaten: eine Meldung ohne Einordnung bei NVD und ohne Korrektur in der secdb muss anschlagen. */
function nvdTestdaten(url) {
  const u = new URL(url);
  const cpe = u.searchParams.get('cpeName') ?? '';
  const wort = u.searchParams.get('keywordSearch') ?? '';
  if (cpe.includes(':qpdf:')) return { vulnerabilities: [cve('CVE-1999-9001', { stufe: 'MEDIUM', punkte: 5.5 })] };
  if (cpe.includes(':poppler:')) return { vulnerabilities: [cve('CVE-1999-9002'), cve('CVE-1999-9003')] };
  if (wort === 'poppler')
    return {
      vulnerabilities: [
        cve('CVE-1999-9010', { text: 'Poppler: a crafted file causes a crash', konfig: false }),
        cve('CVE-1999-9004', { text: 'poppler: already analysed', konfig: true }),
        cve('CVE-1999-9005', { text: 'pdf.js flaw', konfig: false }),
      ],
    };
  return { vulnerabilities: [] };
}

test('Abgleich: bekannter Fall schlägt an, behobene und fremde fallen weg', async () => {
  const fixes = secfixes([{ packages: [{ pkg: { name: 'poppler', secfixes: { '24.02.0-r2': ['CVE-1999-9002'] } } }] }]);
  const hole = async (url) => nvdTestdaten(url);
  const funde = await abgleich(inventar(LISTEN, programme), fixes, hole, JETZT);
  const kurz = funde.map((f) => `${f.cve} ${f.programm} ${f.art}`);
  assert.deepEqual(kurz.sort(), ['CVE-1999-9001 qpdf version', 'CVE-1999-9003 poppler version', 'CVE-1999-9010 poppler neu']);
  const p = funde.find((f) => f.cve === 'CVE-1999-9010');
  assert.equal(p.stufe, 'HIGH');
  assert.deepEqual(p.orte, ['stabil/dms', 'stabil/dms-komplett']);
});

test('SARIF: Kategorie, Ebenen, stabile Fingerabdrücke', async () => {
  const funde = await abgleich(inventar(LISTEN, programme), new Map(), async (u) => nvdTestdaten(u), JETZT);
  const s = sarif(funde);
  const run = s.runs[0];
  assert.equal(run.automationDetails.id, 'upstream-abgleich/');
  assert.equal(run.results.length, funde.length);
  const r = run.results.find((x) => x.ruleId === 'CVE-1999-9010/poppler');
  assert.equal(r.level, 'warning');
  assert.equal(r.partialFingerprints['ablago/upstream/v1'], 'CVE-1999-9010|poppler|24.02.0-r3');
  assert.equal(run.results.find((x) => x.ruleId === 'CVE-1999-9001/qpdf').level, 'warning');
  assert.equal(run.results.find((x) => x.ruleId === 'CVE-1999-9003/poppler').level, 'error');
  for (const regel of run.tool.driver.rules) assert.match(regel.properties['security-severity'], /^\d+(\.\d+)?$/);
});

test('Abruf: wiederholt bei Überlast, bricht sonst ab, wartet zwischen NVD-Abfragen', async () => {
  const antworten = [
    { ok: false, status: 503 },
    { ok: true, json: async () => ({ a: 1 }) },
  ];
  const gewartet = [];
  const hole = holer({ fetchen: async () => antworten.shift(), warte: async (ms) => gewartet.push(ms), schluessel: '' });
  assert.deepEqual(await hole(`${NVD}?x`), { a: 1 });
  assert.ok(gewartet.includes(15_000));
  const kaputt = holer({ fetchen: async () => ({ ok: false, status: 404 }), warte: async () => {}, schluessel: '' });
  await assert.rejects(kaputt(`${NVD}?y`), /Abruf gescheitert \(404\)/);
});
