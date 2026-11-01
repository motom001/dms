/**
 * Mess-Skript (#367): Laufzeit der wichtigsten Datenbankzugriffe bei vielen Mappen und Dokumenten,
 * wiederholbar mit festem Startwert. Kein Test – von Hand starten (aus `server/`):
 *
 *   MESS_DATABASE_URL=postgres://postgres:dms@127.0.0.1:5432/dmsmessung \
 *     node --import tsx test/leistungsmessung.ts [--neu] [--mappen 10000] [--export 2000] [--explain] [--last]
 *
 * `--last` misst dieselben Zugriffe zusätzlich, während im selben Prozess Demo-Daten mit Dokumenten
 * entstehen und die Texterkennung läuft – wie im Betrieb, wenn jemand Demo-Daten erzeugt und
 * gleichzeitig arbeitet. Dafür entsteht eine Kopie der Datenbank (`<name>_last`), danach gelöscht.
 *
 * `--neu` legt die Datenbank neu an (ACHTUNG: löscht sie) und erzeugt die Daten; ohne wird die
 * vorhandene gemessen. Ausgabe: Markdown-Tabelle (Median aus 7 Läufen) und mit `--explain` die Pläne.
 */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ausUrl, alsUrl, legeDatenbankAn } from '../src/anbindung';
import { ordnerSpeicher } from '../src/dateispeicher';
import { verbinde, migriere } from '../src/db';
import { Dienst } from '../src/dienst';
import { speicherEinstellungen } from '../src/einstellungen';
import { pgKontoRepo } from '../src/konto-repo';
import { pgRepo } from '../src/repo-pg';
import { vollexport } from '../src/vollexport';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { erzeugeDemo } from '../src/demo';
import { Texterkennung } from '../src/texterkennung';
import { baueLeistungsdaten, BENUTZER, HAUSHALT } from './leistung-daten';
import { messeAbfragen, zaehlend, type Zeit } from './leistung-messen';

const arg = (n: string) => { const i = process.argv.indexOf(n); return i < 0 ? undefined : process.argv[i + 1]; };
const url = process.env.MESS_DATABASE_URL ?? 'postgres://postgres:dms@127.0.0.1:5432/dmsmessung';
const a = ausUrl(url)!;
const mappenZahl = Number(arg('--mappen') ?? 10_000);
const exportMax = Number(arg('--export') ?? 2_000);
const dateiOrdner = join(tmpdir(), `dms-leistung-${a.datenbank}`);

if (process.argv.includes('--neu')) {
  const admin = verbinde(alsUrl(a, 'postgres'));
  await admin.unsafe(`DROP DATABASE IF EXISTS "${a.datenbank}" WITH (FORCE)`);
  await admin.end();
  await legeDatenbankAn(a);
  await rm(dateiOrdner, { recursive: true, force: true });
}
const tabelle = (zeiten: Zeit[]) => {
  console.log('| Messung | Median ms | Max ms |\n|---|---:|---:|');
  for (const e of zeiten) console.log(`| ${e.name} | ${e.median.toFixed(1)} | ${e.max.toFixed(1)} |`);
};
const sql = verbinde(url);
try {
  if (process.argv.includes('--neu')) {
    await migriere(sql, new URL('../migrations', import.meta.url).pathname, () => {});
    const t0 = Date.now();
    const r = await baueLeistungsdaten(sql, ordnerSpeicher(dateiOrdner, HAUSHALT), {
      mappen: mappenZahl, startwert: 'messung-367', dokumente: { von: 1, bis: 3 }, text: { von: 5_000, bis: 50_000 }, log: (m) => console.error(m),
    });
    console.error(`Daten erzeugt in ${Math.round((Date.now() - t0) / 1000)} s: ${JSON.stringify(r)}`);
  }
  const [stand] = await sql`SELECT (SELECT count(*) FROM mappen)::int AS mappen, (SELECT count(*) FROM dokumente)::int AS dokumente,
    (SELECT count(*) FROM verweise)::int AS verweise, pg_size_pretty(pg_total_relation_size('dokumente')) AS groesse`;
  console.log(`Datenbestand: ${stand.mappen} Mappen, ${stand.dokumente} Dokumente, ${stand.verweise} Verweise; Tabelle dokumente ${stand.groesse}\n`);

  const repo = pgRepo(sql, HAUSHALT);
  const konten = pgKontoRepo(sql, HAUSHALT);
  const ergebnisse = await messeAbfragen(sql, repo, konten, BENUTZER, { explain: process.argv.includes('--explain') });
  tabelle(ergebnisse.zeiten);

  // Export (Vollexport, wie „Meine Daten exportieren“) über die ersten `exportMax` Mappen.
  if (exportMax > 0) {
    const z = zaehlend(pgRepo(sql, HAUSHALT));
    const d = new Dienst(z.repo, ordnerSpeicher(dateiOrdner, HAUSHALT), { einstellungen: speicherEinstellungen() });
    const quelle = d.vollexportQuelle({ mandant: 'Messung', version: '0', benutzer: async () => ({ benutzer: [], vertretungen: [] }), designs: async () => [], protokoll: () => [] });
    let rest = exportMax;
    const mappen = quelle.mappen;
    quelle.mappen = async (typId) => { const ms = (await mappen(typId)).slice(0, Math.max(0, rest)); rest -= ms.length; return ms; };
    const ziel = await mkdtemp(join(tmpdir(), 'dms-leistung-export-'));
    z.zuruecksetzen();
    const t0 = performance.now();
    const r = await vollexport(quelle, ziel, {});
    const ms = performance.now() - t0;
    await rm(ziel, { recursive: true, force: true });
    console.log(`\nExport von ${r.mappen} Mappen / ${r.dokumente} Dokumenten: ${Math.round(ms)} ms gesamt, davon ${Math.round(z.zeit())} ms in ${z.aufrufe()} Datenbankzugriffen`);
    console.log('| Zugriff | Aufrufe | Summe ms |\n|---|---:|---:|');
    for (const [k, v] of [...z.je()].sort((x, y) => y[1].ms - x[1].ms).slice(0, 12)) console.log(`| ${k} | ${v.n} | ${Math.round(v.ms)} |`);
  }
  if (process.argv.includes('--last')) await unterLast();
  if (ergebnisse.plaene.length) {
    console.log('\n## Pläne (EXPLAIN ANALYZE, BUFFERS)');
    for (const p of ergebnisse.plaene) console.log(`\n### ${p.name}\n\n\`\`\`\n${p.plan}\n\`\`\``);
  }
} finally {
  await sql.end({ timeout: 1 });
}

/** Dieselben Messungen, während Demo-Daten mit Dokumenten entstehen (eigene Kopie der Datenbank). */
async function unterLast() {
  const kopie = `${a.datenbank}_last`;
  const admin = verbinde(alsUrl(a, 'postgres'));
  await sql.end({ timeout: 1 });
  await admin.unsafe(`DROP DATABASE IF EXISTS "${kopie}" WITH (FORCE)`);
  await admin.unsafe(`CREATE DATABASE "${kopie}" TEMPLATE "${a.datenbank}"`);
  const lsql = verbinde(alsUrl(a, kopie));
  const ordner = await mkdtemp(join(tmpdir(), 'dms-leistung-last-'));
  const dateien = ordnerSpeicher(ordner, HAUSHALT);
  const d = new Dienst(pgRepo(lsql, HAUSHALT), dateien, { einstellungen: speicherEinstellungen() });
  const ocr = new Texterkennung(pgRepo(lsql, HAUSHALT), dateien, speicherEinstellungen());
  d.verbindeTexterkennung(ocr);
  await ocr.start();
  let stopp = false, phase = '', dokumente = 0;
  const demo = erzeugeDemo(d, { anzahl: 3000, startwert: 'last-367', dokumente: { anteil: 100, von: 1, bis: 3, stufe: 'realistisch' } }, BENUTZER, (f, _g, p) => {
    if (stopp) throw new Error('Messung beendet');
    phase = p ?? phase; if (p === 'dokumente') dokumente = f;
  }).catch((e: Error) => e.message);
  while (phase !== 'dokumente') await new Promise((r) => setTimeout(r, 100));
  await new Promise((r) => setTimeout(r, 5000));
  const verzoegerung = monitorEventLoopDelay({ resolution: 10 });
  verzoegerung.enable();
  const t0 = Date.now();
  // Vier Runden mit Pausen, damit die Messung verschiedene Momente der Erzeugung trifft.
  const runden: Zeit[][] = [];
  for (let i = 0; i < 4; i++) {
    runden.push((await messeAbfragen(lsql, pgRepo(lsql, HAUSHALT), pgKontoRepo(lsql, HAUSHALT), BENUTZER, { n: 9 })).zeiten);
    await new Promise((r2) => setTimeout(r2, 2000));
  }
  verzoegerung.disable();
  const r = { zeiten: runden[0].map((z, i) => {
    const m = runden.map((x) => x[i].median).sort((x, y) => x - y);
    return { name: z.name, median: m[Math.floor(m.length / 2)], max: Math.max(...runden.map((x) => x[i].max)) };
  }) };
  const vorher = dokumente;
  stopp = true;
  await demo;
  ocr.stop();
  console.log(`\n## Unter Last (Demo-Daten mit Dokumenten und Texterkennung laufen; bis Messende ${vorher} Dokumente erzeugt, Messdauer ${Math.round((Date.now() - t0) / 1000)} s)\n`);
  tabelle(r.zeiten);
  console.log(`\nVerzögerung der Ereignisschleife während der Messung: Median ${(verzoegerung.percentile(50) / 1e6).toFixed(0)} ms, 99 % ${(verzoegerung.percentile(99) / 1e6).toFixed(0)} ms, max ${(verzoegerung.max / 1e6).toFixed(0)} ms`);
  await new Promise((r2) => setTimeout(r2, 2000)); // laufende OCR-Aufträge auslaufen lassen
  await lsql.end({ timeout: 1 });
  await admin.unsafe(`DROP DATABASE IF EXISTS "${kopie}" WITH (FORCE)`);
  await admin.end();
  await rm(ordner, { recursive: true, force: true });
}
