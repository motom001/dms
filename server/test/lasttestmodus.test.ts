/**
 * Lasttest-Modus (#612): Variable, Speicherart, Ergebnisblock mit Gerät und Speicher, Seite mit Fortschritt,
 * Herunterfahren und Neustart danach. Das Skript ist hier ein Stellvertreter (Meldungen wie lasttest.mjs); der echte
 * Lauf steht in lasttestmodus-e2e.test.ts.
 */
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ChildProcess } from 'node:child_process';
import { after, describe, it } from 'node:test';
import { bereinigeGeraet, fuelleErgebnis, PLATZHALTER, restMinuten, stufenVon, type LasttestStand } from '../../shared/src/lasttest';
import { Lasttestmodus, lasttestAus } from '../src/lasttestmodus';
import { erkenneSpeicherart, geraeteNummer } from '../src/speicherart';

const WURZEL = new URL('../..', import.meta.url).pathname;
const tmp = mkdtempSync(join(tmpdir(), 'dms-lasttest-'));
// Der letzte Lauf der Seite speichert seinen Stand nach dem Ende noch (ohne darauf zu warten): erst kurz warten, sonst
// legt er den Ergebnisordner während des Aufräumens neu an (ENOTEMPTY).
after(async () => { await new Promise((r) => setTimeout(r, 500)); rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); });

async function freierPort(): Promise<number> {
  return new Promise((r) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const a = s.address(); s.close(() => r(typeof a === 'object' && a ? a.port : 0)); }); });
}

describe('Lasttest-Modus (#612): Variable', () => {
  it('klein, mittel, gross, groß, extrem, alle – sonst aus mit Hinweis', () => {
    const aus = { wahl: null, dauer: null, mappen: null, speichern: true, fehler: null };
    assert.deepEqual(lasttestAus({}), aus);
    assert.equal(lasttestAus({ DMS_LASTTEST: 'klein' }).wahl, 'klein');
    assert.equal(lasttestAus({ DMS_LASTTEST: ' Mittel ' }).wahl, 'mittel');
    assert.equal(lasttestAus({ DMS_LASTTEST: 'groß' }).wahl, 'gross');
    assert.equal(lasttestAus({ DMS_LASTTEST: 'alle' }).wahl, 'alle');
    for (const a of ['', 'aus', '0', 'nein']) assert.deepEqual(lasttestAus({ DMS_LASTTEST: a }), aus);
    const falsch = lasttestAus({ DMS_LASTTEST: 'riesig' });
    assert.equal(falsch.wahl, null);
    assert.match(falsch.fehler!, /keine Stufe.*startet normal/);
    assert.equal(lasttestAus({ DMS_LASTTEST: 'klein', DMS_LASTTEST_DAUER: '10' }).dauer, 10);
    assert.match(lasttestAus({ DMS_LASTTEST: 'klein', DMS_LASTTEST_DAUER: 'kurz' }).fehler!, /DMS_LASTTEST_DAUER/);
  });

  it('extrem (#739): 500.000 oder 1 Mio. Mappen; „mit Speichern“ an, mit DMS_LASTTEST_SPEICHERN=nein aus', () => {
    assert.deepEqual(lasttestAus({ DMS_LASTTEST: 'extrem' }), { wahl: 'extrem', dauer: null, mappen: 500_000, speichern: true, fehler: null });
    assert.equal(lasttestAus({ DMS_LASTTEST: 'extrem', DMS_LASTTEST_MAPPEN: '1.000.000' }).mappen, 1_000_000);
    assert.equal(lasttestAus({ DMS_LASTTEST: 'extrem', DMS_LASTTEST_MAPPEN: '1000000' }).mappen, 1_000_000);
    const falsch = lasttestAus({ DMS_LASTTEST: 'extrem', DMS_LASTTEST_MAPPEN: '20' });
    assert.equal(falsch.mappen, 500_000);
    assert.match(falsch.fehler!, /DMS_LASTTEST_MAPPEN/);
    assert.equal(lasttestAus({ DMS_LASTTEST: 'klein', DMS_LASTTEST_MAPPEN: '1000000' }).mappen, null, 'nur für extrem');
    assert.equal(lasttestAus({ DMS_LASTTEST: 'klein', DMS_LASTTEST_SPEICHERN: 'nein' }).speichern, false);
    assert.equal(lasttestAus({ DMS_LASTTEST: 'klein', DMS_LASTTEST_SPEICHERN: 'ja' }).speichern, true);
  });

  it('steht in keiner Vorlage für App-Stores und NAS (nur in der Anleitung)', () => {
    const dateien = (d: string): string[] => readdirSync(d).flatMap((n) => (statSync(join(d, n)).isDirectory() ? dateien(join(d, n)) : [join(d, n)]));
    // Vorlagen: Compose-Dateien, App-Store-Vorlagen, Einrichtungsskripte – nicht die Probe der CI (deploy/*-probe.sh).
    const vorlagen = [...dateien(join(WURZEL, 'deploy')), join(WURZEL, 'docker-compose.yml')].filter((f) => !f.endsWith('-probe.sh'));
    assert.ok(vorlagen.length > 5);
    const treffer = vorlagen.filter((f) => readFileSync(f, 'utf8').includes('DMS_LASTTEST'));
    assert.deepEqual(treffer, []);
  });
});

describe('Lasttest-Modus (#612): Speicherart erkennen', () => {
  /** Nachgebautes /sys: Platten mit queue/rotational, Partitionen, RAID mit slaves, dev/block-Verweise. */
  function sys(platten: Record<string, '0' | '1'>, extra: (s: string) => void = () => {}) {
    const s = mkdtempSync(join(tmp, 'sys-'));
    for (const d of ['devices', 'block', 'class/block', 'dev/block']) mkdirSync(join(s, d), { recursive: true });
    for (const [n, rot] of Object.entries(platten)) {
      const p = join(s, 'devices', n);
      mkdirSync(join(p, 'queue'), { recursive: true });
      mkdirSync(join(p, 'device'));
      writeFileSync(join(p, 'queue/rotational'), `${rot}\n`);
      symlinkSync(p, join(s, 'block', n));
      symlinkSync(p, join(s, 'class/block', n));
    }
    extra(s);
    return s;
  }
  const dev = (major: number, minor: number) => major * 256 + minor;

  it('Gerätenummer aus stat().dev', () => {
    assert.deepEqual(geraeteNummer(dev(8, 1)), { major: 8, minor: 1 });
    assert.deepEqual(geraeteNummer(dev(259, 3)), { major: 259, minor: 3 });
  });

  it('Partition einer SSD, NVMe, Festplatte', () => {
    const s = sys({ sda: '0', sdb: '1', nvme0n1: '0' }, (x) => {
      mkdirSync(join(x, 'devices/sda/sda1')); writeFileSync(join(x, 'devices/sda/sda1/partition'), '1');
      symlinkSync(join(x, 'devices/sda/sda1'), join(x, 'dev/block/8:1'));
      symlinkSync(join(x, 'devices/sdb'), join(x, 'dev/block/8:16'));
      symlinkSync(join(x, 'devices/nvme0n1'), join(x, 'dev/block/259:0'));
    });
    assert.equal(erkenneSpeicherart('/', { sys: s, dev: dev(8, 1) }), 'SSD');
    assert.equal(erkenneSpeicherart('/', { sys: s, dev: dev(8, 16) }), 'HDD');
    assert.equal(erkenneSpeicherart('/', { sys: s, dev: dev(259, 0) }), 'NVMe');
  });

  it('RAID aus zwei Festplatten; gemischt oder ohne Blockgerät nur, wenn alle Platten gleich sind', () => {
    const s = sys({ sda: '1', sdb: '1', sdc: '0' }, (x) => {
      mkdirSync(join(x, 'devices/md0/slaves'), { recursive: true });
      for (const n of ['sda', 'sdb']) symlinkSync(join(x, 'devices', n), join(x, 'devices/md0/slaves', n));
      symlinkSync(join(x, 'devices/md0'), join(x, 'dev/block/9:0'));
      mkdirSync(join(x, 'devices/md1/slaves'), { recursive: true });
      for (const n of ['sda', 'sdc']) symlinkSync(join(x, 'devices', n), join(x, 'devices/md1/slaves', n));
      symlinkSync(join(x, 'devices/md1'), join(x, 'dev/block/9:1'));
    });
    assert.equal(erkenneSpeicherart('/', { sys: s, dev: dev(9, 0) }), 'HDD');
    assert.equal(erkenneSpeicherart('/', { sys: s, dev: dev(9, 1) }), null, 'gemischt: lieber fragen');
    // overlay des Containers (Hauptnummer 0): alle Platten – hier gemischt.
    assert.equal(erkenneSpeicherart('/', { sys: s, dev: dev(0, 52) }), null);
    assert.equal(erkenneSpeicherart('/', { sys: sys({ nvme0n1: '0', nvme1n1: '0' }), dev: dev(0, 52) }), 'NVMe');
    assert.equal(erkenneSpeicherart('/', { sys: join(tmp, 'gibt-es-nicht'), dev: dev(8, 0) }), null);
  });
});

/** Ergebnisblock aus dem Skript (dieselbe Funktion wie auf der Konsole) mit den Platzhaltern des Lasttest-Modus. */
interface Skript {
  PLATZHALTER: typeof PLATZHALTER;
  ergebnisblock(e: unknown[], x: unknown, u: unknown, a?: { geraet?: string; speicher?: string }): string;
  bericht(e: unknown[], x: unknown): string;
  containerZeile(laeufe: unknown[]): string;
  speichernZeile(d: unknown): string;
  engpassAus(staende: unknown[]): Record<string, unknown> | null;
  engpassText(g: unknown): string;
  fehlerText(l: unknown): string | null;
  quantilAusKlassen(zaehler: number[], grenzen: number[], q: number): number | null;
}
const skript = (await import(new URL('./lasttest.mjs', import.meta.url).href)) as Skript;
const umgebung = { version: '0.144.0', image: 'dms-komplett', datenbank: 'im Container', architektur: 'x64', cpu: 'Beispiel-CPU', kerne: 4, kerneBegrenzt: false, rechnerKerne: 4, ramGb: 15.5, ramBegrenzt: false, grenzen: null };
const ergebnisse = [{ stufe: 'klein', art: 'zusage', verfehlt: [], zielVerfehlt: [], durchgang: { n: 25, median: 40, p95: 90, p99: 120, fehlerquote: 0 } }];
const x = { bestand: { gesamt: 5013, demo: 5000 }, dokumente: 110, laeufe: [{ speicherMbMax: 300, schleifeP99: 12 }] };

describe('Lasttest-Modus (#612): Ergebnisblock', () => {
  it('Platzhalter wie im Skript; Gerät und Speicher werden eingesetzt', () => {
    assert.deepEqual(skript.PLATZHALTER, PLATZHALTER);
    const vorlage = skript.ergebnisblock(ergebnisse, x, umgebung, skript.PLATZHALTER);
    assert.match(vorlage, /Gerät\/Modell: \{\{geraet\}\}/);
    assert.match(vorlage, /Speicher: \{\{speicher\}\}/);
    const block = fuelleErgebnis(vorlage, { geraet: 'UGREEN DXP4800 Plus, 16 GB RAM', speicher: 'SSD' }, 'SSD');
    assert.match(block, /Gerät\/Modell: UGREEN DXP4800 Plus, 16 GB RAM\n/);
    assert.match(block, /Speicher: SSD \(erkannt\)/);
    assert.match(fuelleErgebnis(vorlage, { geraet: '', speicher: 'HDD' }, 'SSD'), /Gerät\/Modell: bitte ergänzen\n[\s\S]*Speicher: HDD\n/);
    assert.match(fuelleErgebnis(vorlage, { geraet: '', speicher: 'unbekannt' }, null), /Speicher: weiß nicht/);
    assert.match(fuelleErgebnis(vorlage, { geraet: '', speicher: null }, null), /Speicher: bitte ergänzen \(HDD\/SSD\/NVMe\)/);
    // Wie bisher auf der Konsole: ohne Angaben „bitte ergänzen“.
    assert.match(skript.ergebnisblock(ergebnisse, x, umgebung, {}), /Gerät\/Modell: bitte ergänzen/);
  });

  it('#1117: Version im Bericht und im Ergebnisblock zum Kopieren', () => {
    assert.match(skript.ergebnisblock(ergebnisse, x, umgebung, skript.PLATZHALTER), /\nAblago-Version: 0\.144\.0 · /);
    // Bericht nur mit dem Kopf (ohne Durchgänge und Stufen) – es geht um die Zeile der Version.
    const kopf = { ...x, laeufe: [] };
    assert.match(skript.bericht([], { ...kopf, version: '0.144.0' }), /^## Lasttest \([^)]+\)\n\nAblago-Version: 0\.144\.0\n/);
    assert.doesNotMatch(skript.bericht([], kopf), /Ablago-Version/, 'ohne Angabe keine leere Zeile');
  });

  it('Arbeitsspeicher des Containers (#696): höchster Stand mit Aufteilung, sonst „nicht verfügbar“', () => {
    assert.match(skript.ergebnisblock(ergebnisse, x, umgebung, {}), /Arbeitsspeicher Ablago höchstens: 300 MB.*\nArbeitsspeicher Container höchstens: nicht verfügbar\n/);
    const laeufe = [
      { container: { mb: 1200, programmeMb: 1000, zwischenspeicherMb: 200, datenbankMb: 400 } },
      { container: { mb: 1950, programmeMb: 1700, zwischenspeicherMb: 250, datenbankMb: 600 } },
      { container: null },
    ];
    assert.equal(skript.containerZeile(laeufe), 'Arbeitsspeicher Container höchstens: 1950 MB (davon Programme 1700 MB, Dateizwischenspeicher 250 MB; PostgreSQL 600 MB)');
    assert.equal(skript.containerZeile([{ container: { mb: 800, programmeMb: null, zwischenspeicherMb: null, datenbankMb: null } }]), 'Arbeitsspeicher Container höchstens: 800 MB');
  });

  it('mit Speichern und extrem (#739): bisherige Zeilen bleiben genau so, neue kommen darunter', () => {
    const alt = skript.ergebnisblock(ergebnisse, x, umgebung, {});
    const speichern = { name: 'klein + Speichern', n: 25, median: 45, p95: 110, p99: 150, fehlerquote: 0, speichern: true, schreiben: { anfragen: 300, median: 80, p95: 160 }, speicherMbMax: 900, schleifeP99: 30 };
    const mit = [{ ...ergebnisse[0], speichern }];
    const neu = skript.ergebnisblock(mit, { ...x, laeufe: [...x.laeufe, speichern] }, umgebung, {});
    // Jede bisherige Zeile steht unverändert im neuen Block (auch Arbeitsspeicher: nur über die bisherigen Durchgänge).
    for (const z of alt.split('\n').filter((l) => !l.startsWith('Gemessen'))) assert.ok(neu.split('\n').includes(z), `fehlt: ${z}`);
    assert.match(neu, /\nklein    25 gleichzeitig: p50 40 ms[^\n]*\nklein \+ Speichern   25 gleichzeitig: p50 45 ms, p95 110 ms, p99 150 ms, Fehler 0,00 % – Messung ohne Ziel \(Speichern p50 80 ms, p95 160 ms\)\n/);
    assert.match(neu, /\nArbeitsspeicher Ablago höchstens: 300 MB[^\n]*\n[^\n]*\nMit Speichern: Arbeitsspeicher Ablago höchstens: 900 MB · Ereignisschleife p99 höchstens: 30 ms\n/);
    const extrem = {
      stufe: 'extrem', art: 'messung', verfehlt: [], grenze: { gleichzeitig: 10, jeSekunde: 20, p95: 2500 }, grund: 'p95 3500 ms > 3 s', erholung: { ms: 2000, p95: 400 },
      daten: { anlegen: { mappen: 1_000_000, laeufe: 20, sekunden: 2700, hintergrundSekunden: 360 }, datenbankBytes: 5 * 1024 ** 3, dokumenteBytes: 300 * 1024 ** 2 },
    };
    const b = skript.ergebnisblock([extrem], { ...x, bestand: { gesamt: 1_000_013, demo: 1_000_000 } }, umgebung, {});
    assert.match(b, /\nextrem Grenze: 10 gleichzeitig \(20\/s, p95 2500 ms\), Abbruch: p95 3500 ms > 3 s; Erholung 2,0 s\n/);
    assert.match(b, /\nextrem Demo-Daten: 1\.000\.000 Demo-Mappen in 45 min angelegt \(20 Läufe\), danach 6 min Arbeit im Hintergrund; Datenbank 5,0 GB, Dokumente 300 MB\.\n/);
    // groß wie bisher.
    assert.match(skript.ergebnisblock([{ ...extrem, stufe: 'gross', daten: undefined }], x, umgebung, {}), /\ngroß   Grenze: 10 gleichzeitig/);
  });

  it('Engpass je Durchgang (#874): Wartezeit über alle Prozesse, Verbindungen, Sperren, CPU, Speicher je Prozess', () => {
    const grenzen = [1, 2, 5, 10, 20, 50];
    assert.equal(skript.quantilAusKlassen([90, 5, 3, 2, 0, 0, 0], grenzen, 0.95), 2);
    assert.equal(skript.quantilAusKlassen([0, 0, 0, 0, 0, 0, 0], grenzen, 0.95), null);
    assert.equal(skript.quantilAusKlassen([0, 0, 0, 0, 0, 0, 10], grenzen, 0.95), null, 'über der letzten Klasse');
    const stand = (t: number, klassen: number[], o: { warten: number; belegt: number; schlange: number; sperren: number; sperreMs: number; pg: number; ab: number; c: number; mb: number[] }) => ({
      t, engpass: {
        klassenMs: grenzen,
        pool: { klassen, wartenMax: o.warten, belegtMax: o.belegt, warteschlangeMax: o.schlange, max: 12 },
        verbindungen: { gesamt: 12, leiter: 6, andere: 6 },
        sitzungen: { sperren: o.sperren, sperreMs: o.sperreMs, aktiv: 5, offen: 12 },
        cpu: { postgres: o.pg, ablago: o.ab, container: o.c },
        speicher: o.mb.map((mb, i) => ({ nr: i, rolle: i === 0 ? 'haupt' : i === 1 ? 'leiter' : 'anfragen', mb })),
        neustarts: { anzahl: t > 5000 ? 3 : 2, letzte: [{ nr: 2, code: null, signal: 'SIGKILL', zeit: new Date(t > 5000 ? 5500 : 0).toISOString() }] },
      },
    });
    const g = skript.engpassAus([
      { t: 0, speicherMb: 1 },
      stand(1000, [100, 0, 0, 0, 0, 0, 0], { warten: 3, belegt: 4, schlange: 0, sperren: 0, sperreMs: 0, pg: 10, ab: 20, c: 40, mb: [60, 500, 400] }),
      stand(6000, [150, 30, 10, 5, 4, 1, 0], { warten: 45, belegt: 12, schlange: 7, sperren: 2, sperreMs: 130, pg: 15, ab: 30, c: 56, mb: [61, 650, 420] }),
      stand(11000, [190, 40, 10, 5, 4, 1, 0], { warten: 8, belegt: 9, schlange: 0, sperren: 1, sperreMs: 20, pg: 20, ab: 35, c: 60, mb: [60, 600, 480] }),
    ])!;
    // Unterschied der Klassen: [90, 40, 10, 5, 4, 1, 0] = 150 Wartezeiten, p95 liegt in der Klasse ≤ 10 ms.
    assert.equal(g.wartenAnzahl, 150);
    assert.equal(g.wartenP95, 10);
    assert.equal(g.wartenMax, 45);
    assert.deepEqual([g.belegtMax, g.verbindungen, g.warteschlangeMax, g.sperrenMax, g.sperreMsMax], [12, 12, 7, 2, 130]);
    // 10 s: PostgreSQL 10 s Rechenzeit = 100 %, Ablago 15 s = 150 %, Container 20 s = 200 %.
    assert.deepEqual([g.cpuPostgres, g.cpuAblago, g.cpuContainer], [100, 150, 200]);
    assert.deepEqual(g.speicherJeProzess, [{ nr: 0, rolle: 'haupt', mb: 61, haldeMb: null }, { nr: 1, rolle: 'leiter', mb: 650, haldeMb: null }, { nr: 2, rolle: 'anfragen', mb: 480, haldeMb: null }]);
    assert.equal(g.neustarts, 1, 'nur die im Durchgang');
    assert.equal(skript.engpassText(g), 'Warten auf DB-Verbindung p95 ≤ 10 ms, höchstens 45 ms · Verbindungen belegt bis 12 von 12 (Warteschlange bis 7) · Sperren: bis 2 Sitzungen, längste 130 ms · CPU (% eines Kerns): PostgreSQL 100 %, Ablago 150 %, Container 200 % · Neustarts von Prozessen: 1 (2 SIGKILL) · Speicher je Prozess: Hauptprozess 61 MB, Prozess 1: 650 MB, Prozess 2: 480 MB');
    // #891: Rolle und Nummer lesbar getrennt, Halde in Klammern.
    assert.match(skript.engpassText({ ...g, speicherJeProzess: [{ nr: 0, rolle: 'haupt', mb: 32, haldeMb: null }, { nr: 1, rolle: 'leiter', mb: 1588, haldeMb: 977 }, { nr: 2, rolle: 'anfragen', mb: 862, haldeMb: 370 }] }),
      / · Speicher je Prozess: Hauptprozess 32 MB, Prozess 1: 1588 MB \(Halde 977\), Prozess 2: 862 MB \(Halde 370\)$/);
    assert.equal(skript.fehlerText({ status: { 200: 10, 502: 3, 503: 4 }, fehlerJe: { ECONNRESET: 2 }, ohneAntwortJe: { Suche: 1 } }), '502 × 3, ECONNRESET × 2, ohne Antwort (Suche) × 1', '503 zählt als abgewiesen, nicht als Fehler');
    assert.equal(skript.fehlerText({ status: { 200: 10 }, fehlerJe: {}, ohneAntwortJe: {} }), null);
    const gross = { stufe: 'gross', art: 'messung', verfehlt: [], grenze: { gleichzeitig: 25, jeSekunde: 50, p95: 900 }, grund: 'Fehlerquote 1,10 % > 1 %', erholung: { ms: 100, p95: 300 },
      schritte: [{ name: 'groß 25', n: 25, engpass: g, status: { 200: 5 } }, { name: 'groß 50', n: 50, engpass: g, status: { 200: 90, 502: 2 }, fehlerJe: { ECONNRESET: 9 } }] };
    const bg = skript.ergebnisblock([gross], x, umgebung, {});
    assert.match(bg, /\ngroß   Grenze: 25 gleichzeitig[^\n]*\n  Engpass groß 25: [^\n]*\n  Engpass groß 50 \(Abbruch\): [^\n]*\n  Fehler groß 50 \(Abbruch\): 502 × 2, ECONNRESET × 9\n/);
    assert.equal(skript.engpassAus([{ t: 0, speicherMb: 1 }]), null, 'ältere Fassung ohne engpass');
    // Im Ergebnisblock: eigene Zeile unter dem Durchgang; die bisherigen Zeilen bleiben.
    const alt = skript.ergebnisblock(ergebnisse, x, umgebung, {});
    const neu = skript.ergebnisblock([{ ...ergebnisse[0], durchgang: { ...ergebnisse[0].durchgang, name: 'klein', engpass: g } }], x, umgebung, {});
    for (const z of alt.split('\n').filter((l) => !l.startsWith('Gemessen'))) assert.ok(neu.split('\n').includes(z), `fehlt: ${z}`);
    assert.match(neu, /\nklein    25 gleichzeitig: [^\n]*\n  Engpass klein: Warten auf DB-Verbindung p95 ≤ 10 ms/);
    const ohne = skript.engpassText({ ...g, wartenP95: null, wartenAnzahl: 0, sperrenMax: 0, cpuPostgres: null, warteschlangeMax: 0, speicherJeProzess: [], neustarts: 0, neustartGruende: [] });
    assert.match(ohne, /p95 –, höchstens 45 ms · Verbindungen belegt bis 12 von 12 · Sperren: keine · CPU \(% eines Kerns\): PostgreSQL –, Ablago 150 %, Container 200 % · Neustarts von Prozessen: 0 · Speicher je Prozess: –$/);
  });

  it('Gerät: eine Zeile, ohne Backticks, höchstens 120 Zeichen', () => {
    assert.equal(bereinigeGeraet('NAS\n```\nmehr'), "NAS ''' mehr");
    assert.equal(bereinigeGeraet('x'.repeat(300)).length, 120);
    assert.equal(bereinigeGeraet(undefined), '');
  });

  it('Restdauer: Schätzung der Stufe minus vergangene Zeit, mindestens der laufende Durchgang', () => {
    const s = { wahl: 'alle' as const, stufe: 'klein' as const, fertigeStufen: [], stufeBegonnen: 0, jetzt: 60_000, durchgang: null, zustand: 'laeuft' as const };
    // Mit dem Durchgang „mit Speichern“ (#739): klein 5–8, mittel 18–35, groß 35–70 Minuten.
    assert.deepEqual(restMinuten(s), [4 + 18 + 35, 7 + 35 + 70]);
    assert.deepEqual(restMinuten({ ...s, wahl: 'klein' }), [4, 7]);
    assert.equal(restMinuten({ ...s, wahl: 'klein', jetzt: 10 * 60_000 }), null, 'gleich fertig');
    assert.deepEqual(restMinuten({ ...s, wahl: 'klein', jetzt: 10 * 60_000, durchgang: { name: 'klein', n: 25, ende: 12 * 60_000 } }), [2, 2]);
    // extrem: 500.000 Mappen 60–150 Minuten, 1 Mio. doppelt so lang; „alle“ ohne extrem.
    const e = { ...s, wahl: 'extrem' as const, stufe: 'extrem' as const, jetzt: 0 };
    assert.deepEqual(restMinuten({ ...e, mappen: 500_000 }), [60, 150]);
    assert.deepEqual(restMinuten({ ...e, mappen: 1_000_000 }), [120, 300]);
    assert.deepEqual(stufenVon('alle'), ['klein', 'mittel', 'gross']);
    assert.equal(restMinuten({ ...s, zustand: 'fertig' }), null);
  });
});

/** Stellvertreter für den Kindprozess: nimmt Meldungen an wie fork() mit IPC. */
class FalschesKind extends EventEmitter {
  getoetet = false;
  kill() { this.getoetet = true; setImmediate(() => this.emit('exit', null)); return true; }
  sende(m: object) { this.emit('message', m); }
}

describe('Lasttest-Modus (#612): Seite', () => {
  const ordner = join(tmp, 'ergebnis');
  let kind: FalschesKind | null = null;
  let aufrufe: string[][] = [];
  let beendet = 0;
  let port = 0;
  const neu = async (extra: Partial<ConstructorParameters<typeof Lasttestmodus>[0]> = {}) => {
    port = await freierPort();
    const m = new Lasttestmodus({
      wahl: 'klein', dauer: 5, skript: '/x/lasttest.mjs', ziel: 'http://127.0.0.1:1', ergebnisOrdner: ordner, env: {}, speicherart: 'SSD',
      port, host: '127.0.0.1', beenden: () => { beendet++; }, ...extra,
      starte: (_s, args) => { aufrufe.push(args); kind = new FalschesKind(); return kind as unknown as ChildProcess; }, version: '0.244.0',
    });
    await m.start();
    return m;
  };
  const hole = async (pfad: string, o: RequestInit = {}) => fetch(`http://127.0.0.1:${port}${pfad}`, o);
  const stand = async () => (await (await hole('/api/lasttest')).json()) as LasttestStand;
  const post = (pfad: string, body: unknown, mitKennung = true) => hole(pfad, { method: 'POST', headers: { 'content-type': 'application/json', ...(mitKennung ? { 'x-dms': '1' } : {}) }, body: JSON.stringify(body) });

  it('Fortschritt, Gerät und Speicher, Ergebnis, Datei – ohne Zugangsdaten; keine Ablage', async () => {
    const m = await neu();
    try {
      assert.deepEqual(aufrufe[0], ['klein', '--ziel', 'http://127.0.0.1:1', '--dauer', '5']);
      assert.equal(((await (await hole('/api/konto/status')).json()) as { lasttest: boolean }).lasttest, true);
      assert.equal((await hole('/api/mappen')).status, 503, 'keine nutzbare Ablage');
      assert.equal((await hole('/api/konto/anmelden', { method: 'POST' })).status, 503);
      let s = await stand();
      assert.equal(s.zustand, 'laeuft');
      assert.equal(s.version, '0.244.0', '#1117: Version des Containers von Anfang an');
      assert.equal(s.speicherErkannt, 'SSD');
      assert.equal(s.angaben.speicher, 'SSD');
      kind!.sende({ art: 'stufe', stufe: 'klein', nr: 1, von: 1 });
      kind!.sende({ art: 'schritt', schritt: 'demo', anzahl: 5000, mappen: 5000 });
      kind!.sende({ art: 'demo', fertig: 1200, gesamt: 5000 });
      s = await stand();
      assert.deepEqual([s.stufe, s.schritt, s.demo], ['klein', 'demo', { fertig: 1200, gesamt: 5000 }]);
      assert.equal(s.live ?? null, null, 'noch nichts gemessen');
      // #1117: Auslastung schon beim Anlegen der Demo-Mappen – ohne Durchgang.
      kind!.sende({ art: 'live', name: null, n: null, p95: null, anfragen: 0, cpu: 35, speicher: 20, speicherMb: 800, grenzeMb: 4000, ohneGrenze: false, kerne: 4, kerneBegrenzt: false,
        warteschlange: 0, belegt: 2, verbindungen: 10, gruppen: [{ art: 'postgres', anzahl: 8, cpu: 60, mb: 300 }], postgresExtern: false, meldungen: [] });
      s = await stand();
      assert.equal(s.schritt, 'demo');
      assert.deepEqual([s.live?.jetzt.name, s.live?.jetzt.n, s.live?.jetzt.p95, s.live?.jetzt.cpu, s.live?.jetzt.kerne, s.live?.jetzt.speicherMb], [null, null, null, 35, 4, 800]);
      assert.deepEqual(s.live?.jetzt.gruppen?.map((g) => g.art), ['postgres']);
      kind!.sende({ art: 'durchgang', name: 'klein', n: 25, dauer: 5 });
      s = await stand();
      assert.equal(s.schritt, 'messen');
      assert.ok(s.durchgang && s.durchgang.ende > s.jetzt);
      kind!.sende({ art: 'durchgang-fertig', name: 'klein', n: 25, p95: 90, fehlerquote: 0 });
      // Gerät ohne Kennung der Oberfläche: abgelehnt.
      assert.equal((await post('/api/lasttest/angaben', { geraet: 'X' }, false)).status, 403);
      assert.equal((await post('/api/lasttest/angaben', { speicher: 'Diskette' })).status, 400);
      assert.equal((await post('/api/lasttest/angaben', { geraet: 'Beispiel-NAS\n16 GB', speicher: 'HDD' })).status, 200);
      const vorlage = skript.ergebnisblock(ergebnisse, x, umgebung, skript.PLATZHALTER);
      kind!.sende({ art: 'ergebnis', bericht: '## Lasttest', vorlage, verfehlt: false });
      kind!.emit('exit', 0);
      s = await stand();
      assert.equal(s.zustand, 'fertig');
      assert.deepEqual(s.fertigeStufen, ['klein']);
      assert.equal(s.durchgaenge[0].p95, 90);
      assert.equal(s.angaben.geraet, 'Beispiel-NAS 16 GB');
      const text = JSON.stringify(s);
      for (const geheim of ['passwort', 'lasttest-passwort', 'einrichtungscode', '127.0.0.1']) assert.ok(!text.toLowerCase().includes(geheim), `Stand enthält ${geheim}`);
      // Datei unter /data/ergebnis mit Gerät und Speicher.
      await new Promise((r) => setTimeout(r, 100));
      const datei = readFileSync(join(ordner, 'lasttest-klein.md'), 'utf8');
      assert.match(datei, /Gerät\/Modell: Beispiel-NAS 16 GB/);
      assert.match(datei, /Speicher: HDD\n/);
      assert.equal(s.datei, join(ordner, 'lasttest-klein.md'));

      // Herunterfahren nur mit Kennung; danach Merker, Stand und beenden().
      assert.equal((await post('/api/lasttest/beenden', {}, false)).status, 403);
      assert.equal(beendet, 0);
      assert.equal((await post('/api/lasttest/beenden', {})).status, 200);
      await new Promise((r) => setTimeout(r, 600));
      assert.equal(beendet, 1);
      assert.ok(existsSync(join(ordner, 'beendet')));
      await assert.rejects(hole('/api/lasttest'), 'Seite ist zu');
    } finally { await m.stop(); }
  });

  it('nach dem Beenden neu gestartet (Neustart-Regel): kein zweiter Lauf, Ergebnis bleibt sichtbar', async () => {
    aufrufe = [];
    const m = await neu();
    try {
      const s = await stand();
      assert.equal(s.zustand, 'beendet');
      assert.equal(s.version, '0.244.0', '#1117: Version auch nach „Beenden“');
      assert.deepEqual(aufrufe, [], 'Skript nicht noch einmal gestartet');
      assert.match(s.ergebnis!.vorlage, /\{\{geraet\}\}/);
      assert.equal(s.angaben.geraet, 'Beispiel-NAS 16 GB');
    } finally { await m.stop(); }
  });

  it('extrem mit 1 Mio. Mappen und ohne „mit Speichern“ (#739): Optionen gehen an das Skript', async () => {
    aufrufe = [];
    const m = await neu({ wahl: 'extrem', dauer: null, mappen: 1_000_000, speichern: false, ergebnisOrdner: join(tmp, 'ergebnis-extrem') });
    try {
      assert.deepEqual(aufrufe[0], ['extrem', '--ziel', 'http://127.0.0.1:1', '--mappen', '1000000', '--ohne-speichern']);
      const s = await stand();
      assert.deepEqual([s.wahl, s.mappen, s.speichern, s.von], ['extrem', 1_000_000, false, 1]);
      kind!.sende({ art: 'stufe', stufe: 'extrem', nr: 1, von: 1 });
      kind!.sende({ art: 'schritt', schritt: 'aufraeumen' });
      assert.equal((await stand()).schritt, 'aufraeumen');
    } finally { await m.stop(); }
    aufrufe = [];
    const k = await neu({ ergebnisOrdner: join(tmp, 'ergebnis-klein2'), mappen: 1_000_000 });
    try { assert.deepEqual(aufrufe[0], ['klein', '--ziel', 'http://127.0.0.1:1', '--dauer', '5'], 'mappen nur für extrem, Speichern an'); } finally { await k.stop(); }
  });

  it('Abbruch des Skripts (Schutz der echten Ablage) und unerwartetes Ende', async () => {
    rmSync(ordner, { recursive: true, force: true });
    aufrufe = [];
    let m = await neu();
    try {
      kind!.sende({ art: 'abbruch', text: 'Diese Installation ist schon eingerichtet, aber nicht vom Lasttest.' });
      kind!.emit('exit', 2);
      const s = await stand();
      assert.equal(s.zustand, 'abbruch');
      assert.match(s.meldung!, /nicht vom Lasttest/);
    } finally { await m.stop(); }
    m = await neu();
    try {
      kind!.emit('exit', 1);
      assert.equal((await stand()).zustand, 'fehler');
    } finally { await m.stop(); }
  });
});
