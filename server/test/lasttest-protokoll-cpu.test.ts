/**
 * Lasttest (#895): Warnungen und Fehler aus dem Protokoll aller Prozesse (zusammengefasst, ohne Einzelheiten), CPU und
 * Speicher je Prozessgruppe (wie `top`) und die Werte für die Lasttest-Seite.
 */
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import type { ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { ausnahmeArt, Buendel, ohneEinzelheiten, Protokollsammlung, rohAus, setzeLasttestModus, type Rohmeldung } from '../src/protokollsammlung';
import { Messung, speicherMessSpeicher } from '../src/messung';
import { Protokoll, protokoll } from '../src/protokoll';
import { artNachName, liesStat, Prozessgruppen } from '../src/prozessgruppen';
import { einzeln } from '../src/prozesse';
import { Lasttestmodus, liveAus } from '../src/lasttestmodus';
import type { LasttestStand } from '../../shared/src/lasttest';

const tmp = mkdtempSync(join(tmpdir(), 'dms-895-'));
after(() => rmSync(tmp, { recursive: true, force: true }));

type Lt = Record<string, (...a: never[]) => unknown> & {
  gruppenAus(s: unknown[]): G | null; gruppenText(g: unknown): string | null; gruppenBericht(n: string, g: unknown): string[];
  protokollAus(s: unknown[]): P | null; mitDauer(t: string, d: unknown): string; protokollGesamt(a: unknown, z: unknown, l: unknown[]): P | null; protokollZeile(g: unknown): string | null; protokollBericht(g: unknown): string[];
  liveAus(s: unknown[], ms: number[], o: { name: string | null; n: number | null; seit: string }): Record<string, unknown> & { gruppen: Array<{ art: string; nr?: number; cpu: number | null }> | null; meldungen: Array<{ text: string }> };
  vorlaufStarten(cookie: string, o: { senden: (m: Record<string, unknown>) => unknown; takt: number }): void;
  vorlaufStoppen(): Promise<void>;
  ergebnisblock(e: unknown[], x: unknown, u: unknown, a: unknown): string;
  anmelden(k: [string, string]): Promise<string>;
  durchgang(v: unknown, o: { name: string; n: number; dauer: number; mitExport: boolean }): Promise<Record<string, unknown> & { gruppen: G | null; protokoll: P | null; beginn: number; ende: number }>;
};
type G = { verfuegbar: boolean; postgresImContainer?: boolean; gruppen: Array<{ art: string; nr?: number; cpu: number | null; mbMax: number; anzahlMax: number }> };
type P = { gesamt: number; weitere: number; eintraege: Array<{ stufe: string; modul: string; text: string; ausnahme: string | null; anzahl: number; erste: string; durchgang?: string; dauer?: { max: number; mittel: number; n: number } }>; neustarts?: number | null; neustartListe?: Array<{ nr: number; grund: string }> };
// Das Skript liest die Adresse beim Laden: Port vorher festlegen (der Server unten lauscht dort).
const PORT = await new Promise<number>((r) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const a = s.address() as AddressInfo; s.close(() => r(a.port)); }); });
process.env.DMS_URL = `http://127.0.0.1:${PORT}`;
const lt = (await import(new URL('./lasttest.mjs', import.meta.url).href)) as Lt;

const roh = (text: string, x: Partial<Rohmeldung> = {}): Rohmeldung => ({ stufe: 'warn', modul: 'system', text, ausnahme: null, anzahl: 1, erste: '2026-11-05T10:00:00.000Z', letzte: '2026-11-05T10:00:00.000Z', ...x });

describe('Protokoll sammeln (#895): gleiche Meldungen zusammen, ohne Innenleben', () => {
  it('Einzelheiten aus dem Text: Pfade, Adressen, Prüfsummen, Ids, Zahlen, Angaben in Anführungszeichen', () => {
    assert.equal(ohneEinzelheiten('Datei fehlt: /data/files/ab/ab12cd34ef56ab12cd34ef56.pdf (Dokument 4711)'), 'Datei fehlt: <Pfad> (Dokument #)');
    assert.equal(ohneEinzelheiten('Mappe „Steuer Lena 2025“ nicht gefunden'), 'Mappe „…“ nicht gefunden');
    assert.equal(ohneEinzelheiten('Abruf von https://dms.example.org/api/x?y=1 für jonas@example.org gescheitert'), 'Abruf von <Adresse> für <E-Mail> gescheitert');
    assert.equal(ohneEinzelheiten('Prüfsumme 9f86d081884c7d659a2feaa0c55ad015 passt nicht zu 0b0e2c3a-1d1f-4a4e-9a9a-1234567890ab'), 'Prüfsumme <Prüfsumme> passt nicht zu <Id>');
    assert.equal(ohneEinzelheiten('Prozess 2 beendet (SIGKILL) – startet in 4 s neu'), 'Prozess # beendet (SIGKILL) – startet in # s neu');
    assert.equal(ohneEinzelheiten('Datenbankverbindungsfehlermeldungen bleiben PDF/A und und/oder'), 'Datenbankverbindungsfehlermeldungen bleiben PDF/A und und/oder', 'lange Wörter und Schrägstriche im Wort bleiben');
    assert.equal(ohneEinzelheiten('Zeile eins\nStapel /app/x.js:1'), 'Zeile eins');
    assert.ok(ohneEinzelheiten('x'.repeat(500)).length <= 160);
  });

  it('Art der Ausnahme ohne Nachricht und Stapel', () => {
    assert.equal(ausnahmeArt(Object.assign(new Error("ENOENT: no such file or directory, open '/data/files/a.pdf'"), { code: 'ENOENT' })), 'Error ENOENT');
    assert.equal(ausnahmeArt(new TypeError('Cannot read properties of undefined')), 'TypeError');
    assert.equal(ausnahmeArt("Error: ENOENT: no such file or directory, open '/data/files/a.pdf'\n    at open (node:fs)"), 'Error ENOENT');
    assert.equal(ausnahmeArt('RangeError [ERR_OUT_OF_RANGE]: The value'), 'RangeError ERR_OUT_OF_RANGE');
    assert.equal(ausnahmeArt('Verbindung weg'), null);
    assert.equal(ausnahmeArt(undefined), null);
  });

  it('Sammlung: Art, Modul, Anzahl, erster und letzter Zeitpunkt, Prozesse; Kontextobjekt bleibt draußen', () => {
    const s = new Protokollsammlung('2026-11-05T09:00:00.000Z', 3);
    const e = (text: string, zeit: string, daten?: Record<string, unknown>, stufe = 'warn', modul = 'dokumente') => rohAus({ stufe, modul, text, zeit, daten })!;
    assert.equal(rohAus({ stufe: 'info', modul: 'system', text: 'x', zeit: 'z' }), null, 'nur Warnungen und Fehler');
    s.nimm(e('Datei fehlt: /data/files/a.pdf', '2026-11-05T10:00:02.000Z', { mappe: 'Steuer Lena', sha: 'ab12' }), 1);
    s.nimm(e('Datei fehlt: /data/files/b.pdf', '2026-11-05T10:00:01.000Z', { mappe: 'Steuer Jonas' }), 2);
    s.nimm(e('Unerwarteter Fehler', '2026-11-05T10:00:03.000Z', { fehler: 'TypeError: x is undefined\n at /app/a.js:1' }, 'error', 'system'), 2);
    s.nimm(e('Dritte Art', '2026-11-05T10:00:04.000Z'), 0);
    s.nimm(e('Vierte Art', '2026-11-05T10:00:05.000Z'), 0);
    const st = s.stand();
    assert.equal(st.gesamt, 5);
    assert.equal(st.weitere, 1, 'mehr Arten als Platz: nur gezählt');
    assert.deepEqual(st.eintraege[0], { stufe: 'warn', modul: 'dokumente', text: 'Datei fehlt: <Pfad>', ausnahme: null, anzahl: 2, erste: '2026-11-05T10:00:01.000Z', letzte: '2026-11-05T10:00:02.000Z', prozesse: [1, 2] });
    assert.equal(st.eintraege.find((x) => x.stufe === 'error')?.ausnahme, 'TypeError');
    assert.doesNotMatch(JSON.stringify(st), /Lena|Jonas|\/data|ab12|a\.js/, 'keine Namen, Pfade, Prüfsummen');
  });

  it('Protokoll meldet nur Warnungen und Fehler weiter; Bündel schickt Fehler sofort, Warnungen gesammelt', async () => {
    const p = new Protokoll('info', () => {});
    const gesehen: string[] = [];
    const weg = p.beobachte((e) => gesehen.push(`${e.stufe} ${e.text}`));
    p.modul('system').info('nur Info');
    p.modul('system').warn('eine Warnung');
    p.modul('http').error('ein Fehler');
    weg();
    p.modul('http').error('nicht mehr');
    assert.deepEqual(gesehen, ['warn eine Warnung', 'error ein Fehler']);

    const gesendet: Rohmeldung[][] = [];
    const b = new Buendel((m) => gesendet.push(m), 30);
    b.nimm(roh('A')); b.nimm(roh('A')); b.nimm(roh('B'));
    assert.equal(gesendet.length, 0, 'Warnungen warten kurz');
    await new Promise((r) => setTimeout(r, 60));
    assert.deepEqual(gesendet[0].map((m) => [m.text, m.anzahl]), [['A', 2], ['B', 1]]);
    b.nimm(roh('C', { stufe: 'error' }));
    assert.equal(gesendet.length, 2, 'ein Fehler geht sofort – er übersteht so auch einen Absturz');
  });

  it('ein Prozess: Verbund sammelt im eigenen Prozess', async () => {
    const v = einzeln();
    const vorher = (await v.meldungen())!.gesamt;
    protokoll.modul('dokumente').warn('Probe #895: Datei /tmp/x fehlt', { pfad: '/tmp/x' });
    const s = (await v.meldungen())!;
    assert.equal(s.gesamt, vorher + 1);
    assert.ok(s.eintraege.some((e) => e.text === 'Probe ##: Datei <Pfad> fehlt' && e.prozesse.includes(1)));
  });
});

/** Falsches /proc: Datei → Inhalt. */
function proc(p: Record<number, { comm: string; ppid: number; u: number; c?: number; start?: number; rssKb?: number }>) {
  const dateien = new Map<string, string>();
  for (const [pid, x] of Object.entries(p)) {
    dateien.set(`/proc/${pid}/stat`, `${pid} (${x.comm}) S ${x.ppid} 1 1 0 -1 0 0 0 0 0 ${x.u} 0 ${x.c ?? 0} 0 20 0 1 0 ${x.start ?? 100} 0 0`);
    dateien.set(`/proc/${pid}/status`, `Name:\t${x.comm}\nVmRSS:\t${x.rssKb ?? 1024} kB\n`);
  }
  return { lies: (f: string) => dateien.get(f) ?? null, pids: () => Object.keys(p).map(Number) };
}

describe('Wer belegt die CPU (#895): Gruppen aus /proc', () => {
  it('Zeile aus /proc/<pid>/stat, auch mit Klammern und Leerzeichen im Namen; Gruppe nach Programm', () => {
    assert.deepEqual(liesStat('42 (a b) c) S 7 1 1 0 -1 0 0 0 0 0 150 50 20 10 20 0 1 0 999 0'), { comm: 'a b) c', ppid: 7, eigen: 2, kinder: 0.3, start: 999 });
    assert.equal(liesStat(null), null);
    assert.deepEqual(['postgres', 'tesseract', 'ocrmypdf', 'pdftoppm', 'qpdf', 'gs', 'node', 'bash'].map((c) => artNachName(c)), ['postgres', 'texterkennung', 'texterkennung', 'bilder', 'bilder', 'bilder', 'rest', 'rest']);
    assert.equal(artNachName('python3', () => 'python3 /usr/bin/ocrmypdf a b'), 'texterkennung');
  });

  it('Rechenzeit je Gruppe fortlaufend; beendete Kinder bei ihrer Gruppe, kurzlebige ohne Gruppe bei „andere Programme“', () => {
    const bekannt = { ablago: [{ nr: 0, pid: 10, rolle: 'haupt' as const }, { nr: 1, pid: 11, rolle: 'leiter' as const }, { nr: 2, pid: 12, rolle: 'anfragen' as const }], lastgenerator: 20 };
    let p = proc({ 10: { comm: 'node', ppid: 1, u: 100 }, 11: { comm: 'node', ppid: 10, u: 1000 }, 12: { comm: 'node', ppid: 10, u: 500 }, 20: { comm: 'node', ppid: 11, u: 300 },
      30: { comm: 'postgres', ppid: 1, u: 50 }, 31: { comm: 'postgres', ppid: 30, u: 200, rssKb: 51200 }, 40: { comm: 'tesseract', ppid: 11, u: 30 }, 50: { comm: 'bash', ppid: 1, u: 5 } });
    let zeit = 1000;
    const g = new Prozessgruppen({ lies: (f) => p.lies(f), pids: () => p.pids(), postgresImContainer: true, jetzt: () => zeit });
    const a = g.stand(bekannt);
    assert.ok(a.verfuegbar);
    assert.ok(a.gruppen.every((x) => x.cpuSekunden === 0), 'die erste Frage legt nur den Anfang fest');
    assert.deepEqual(a.gruppen.map((x) => (x.art === 'ablago' ? `ablago:${x.nr}` : x.art)), ['ablago:0', 'ablago:1', 'ablago:2', 'lastgenerator', 'postgres', 'texterkennung', 'rest']);
    assert.deepEqual(a.gruppen.find((x) => x.art === 'postgres'), { art: 'postgres', anzahl: 2, cpuSekunden: 0, mb: 51 });
    // Zwei Sekunden später: Leiter +1 s, Lastgenerator +0,6 s, Datenbank +0,5 s; tesseract (0,3 s gezählt) endete mit 0,8 s;
    // pdftoppm neu (0,2 s); Prozess 2 hatte ein Kind, das zwischen den Fragen kam und ging (0,4 s).
    p = proc({ 10: { comm: 'node', ppid: 1, u: 100 }, 11: { comm: 'node', ppid: 10, u: 1100, c: 80 }, 12: { comm: 'node', ppid: 10, u: 500, c: 40 }, 20: { comm: 'node', ppid: 11, u: 360 },
      30: { comm: 'postgres', ppid: 1, u: 50 }, 31: { comm: 'postgres', ppid: 30, u: 250 }, 41: { comm: 'pdftoppm', ppid: 11, u: 20 }, 50: { comm: 'bash', ppid: 1, u: 5 } });
    zeit = 3000;
    const b = g.stand(bekannt);
    assert.ok(b.verfuegbar);
    const sek = (k: string) => b.gruppen.find((x) => (x.art === 'ablago' ? `ablago:${x.nr}` : x.art) === k)?.cpuSekunden;
    assert.deepEqual(['ablago:0', 'ablago:1', 'ablago:2', 'lastgenerator', 'postgres', 'texterkennung', 'bilder', 'rest'].map(sek), [0, 1, 0, 0.6, 0.5, 0.5, 0.2, 0.4]);
    assert.equal(b.gruppen.find((x) => x.art === 'texterkennung')?.anzahl, 0, 'beendet: keine Prozesse mehr, die Zeit bleibt');
    assert.equal(b.zeit, 3000);
    // Gleiche Prozess-Id, anderer Start: ein neuer Prozess – alles zählt.
    p = proc({ 50: { comm: 'bash', ppid: 1, u: 30, start: 500 } });
    const c = g.stand({ ablago: [], lastgenerator: null });
    assert.ok(c.verfuegbar);
    assert.equal(c.gruppen.find((x) => x.art === 'rest')?.cpuSekunden, 0.7);
  });

  it('nicht Linux bzw. /proc leer: nicht verfügbar', () => {
    const g = new Prozessgruppen({ lies: () => null, pids: () => [], postgresImContainer: false });
    assert.deepEqual(g.stand({ ablago: [], lastgenerator: null }), { verfuegbar: false });
  });
});

/** Stände, wie sie der Durchgang alle 2 s holt (nur, was hier zählt). */
const stand = (t: number, o: { gruppen?: unknown; protokoll?: unknown; neustarts?: unknown; cpu?: number; mb?: number; pool?: unknown } = {}) => ({
  t, container: { mb: o.mb ?? 1000, grenzeMb: 4000, ohneGrenze: false, kerne: 2, kerneBegrenzt: true },
  engpass: { cpu: { container: o.cpu ?? 0 }, pool: o.pool ?? { warteschlangeMax: 3, belegt: 8, max: 10 }, neustarts: o.neustarts ?? { anzahl: 0, letzte: [] }, gruppen: o.gruppen ?? null, protokoll: o.protokoll ?? null },
});
const gs = (zeit: number, w: Record<string, [number, number]>, postgresImContainer = true) => ({
  verfuegbar: true, zeit, postgresImContainer,
  gruppen: Object.entries(w).map(([k, [sek, mb]]) => { const [art, nr] = k.split(':'); return { art, ...(nr ? { nr: Number(nr), rolle: nr === '0' ? 'haupt' : nr === '1' ? 'leiter' : 'anfragen' } : {}), anzahl: art === 'postgres' ? 12 : 1, cpuSekunden: sek, mb }; }),
});
const ps = (gesamt: number, eintraege: Array<[string, number, string, string?]>) => ({
  seit: '2026-11-05T09:00:00.000Z', gesamt, weitere: 0,
  eintraege: eintraege.map(([text, anzahl, erste, stufe = 'warn']) => ({ stufe, modul: 'dokumente', text, ausnahme: stufe === 'error' ? 'Error ENOENT' : null, anzahl, erste, letzte: erste, prozesse: [1] })),
});

describe('Lasttest-Skript (#895): Gruppen, Protokoll, Ergebnisblock, Bericht, Live', () => {
  it('CPU je Gruppe eines Durchgangs: % eines Kerns, Speicher höchstens; PostgreSQL im eigenen Container; nicht verfügbar', () => {
    const s = [
      stand(0, { gruppen: gs(0, { 'ablago:0': [1, 40], 'ablago:1': [10, 400], 'ablago:2': [5, 300], lastgenerator: [2, 100], postgres: [20, 500], rest: [1, 30] }) }),
      stand(2000, { gruppen: gs(2000, { 'ablago:0': [1, 45], 'ablago:1': [11, 480], 'ablago:2': [6, 350], lastgenerator: [2.5, 110], postgres: [22, 600], rest: [1, 30] }) }),
      stand(10_000, { gruppen: gs(10_000, { 'ablago:0': [1.1, 42], 'ablago:1': [22, 450], 'ablago:2': [14.5, 380], lastgenerator: [8, 120], postgres: [34, 580], rest: [1.2, 30], bilder: [0.4, 20] }) }),
    ];
    const g = lt.gruppenAus(s)!;
    assert.deepEqual(g.gruppen.map((x) => [x.art, x.nr ?? null, x.cpu, x.mbMax]), [
      ['ablago', 0, 1, 45], ['ablago', 1, 120, 480], ['ablago', 2, 95, 380], ['lastgenerator', null, 60, 120], ['postgres', null, 140, 600], ['bilder', null, 4, 20], ['rest', null, 2, 30],
    ]);
    assert.equal(lt.gruppenText(g), 'CPU je Gruppe (% eines Kerns, Speicher RSS höchstens): Ablago Hauptprozess 1 % 45 MB, Ablago Prozess 1 120 % 480 MB, Ablago Prozess 2 95 % 380 MB · Lastgenerator 60 % 120 MB · PostgreSQL 140 % 600 MB (12 Prozesse) · Texterkennung 0 % · Seiten-/Vorschaubilder 4 % 20 MB · andere Programme 2 % 30 MB');
    const b = lt.gruppenBericht('mittel', g);
    assert.equal(b[0], 'CPU und Speicher je Gruppe „mittel“ (über 10 s; aus /proc im Container):');
    assert.equal(b[2], '| Gruppe | Prozesse höchstens | CPU (% eines Kerns) | Speicher MB (RSS) höchstens |');
    assert.ok(b.includes('| PostgreSQL | 12 | 140 | 600 |'));
    const extern = lt.gruppenAus([stand(0, { gruppen: gs(0, { 'ablago:1': [0, 300] }, false) }), stand(4000, { gruppen: gs(4000, { 'ablago:1': [2, 300] }, false) })])!;
    assert.match(lt.gruppenText(extern)!, /Ablago Prozess 1 50 % 300 MB · Lastgenerator 0 % · PostgreSQL im eigenen Container – nicht messbar · /);
    assert.ok(lt.gruppenBericht('klein', extern).includes('| PostgreSQL | – | im eigenen Container – nicht messbar | – |'));
    assert.deepEqual(lt.gruppenAus([stand(0, { gruppen: { verfuegbar: false } })]), { verfuegbar: false });
    assert.equal(lt.gruppenText({ verfuegbar: false }), 'CPU je Gruppe: nicht verfügbar (nur unter Linux messbar)');
    assert.equal(lt.gruppenAus([stand(0)]), null, 'ältere Fassung ohne Angabe');
  });

  it('Protokoll: Unterschied je Durchgang und für den Lauf, mit erstem Zeitpunkt und Durchgang; Zeile mit den 3 häufigsten; Bericht mit 20', () => {
    const t0 = Date.parse('2026-11-05T10:00:00.000Z');
    const iso = (s: number) => new Date(t0 + s * 1000).toISOString();
    const vorher = ps(5, [['Lasttest-Modus: Stufe alle startet', 1, iso(-60)], ['Datei fehlt: <Pfad>', 4, iso(-30)]]);
    const d1 = [stand(t0, { protokoll: vorher }), stand(t0 + 2000, { protokoll: ps(9, [['Lasttest-Modus: Stufe alle startet', 1, iso(-60)], ['Datei fehlt: <Pfad>', 8, iso(-30)]]) }),
      stand(t0 + 4000, { protokoll: ps(30, [['Lasttest-Modus: Stufe alle startet', 1, iso(-60)], ['Datei fehlt: <Pfad>', 9, iso(-30)], ['Anfrage abgebrochen', 20, iso(3)], ['Unerwarteter Fehler', 1, iso(3.5), 'error']]) })];
    const p1 = lt.protokollAus(d1)!;
    assert.equal(p1.gesamt, 25);
    assert.deepEqual(p1.eintraege.map((m) => [m.text, m.anzahl, m.erste]), [['Anfrage abgebrochen', 20, iso(3)], ['Datei fehlt: <Pfad>', 5, iso(2)], ['Unerwarteter Fehler', 1, iso(3.5)]]);
    const laeufe = [{ name: 'klein', beginn: t0, ende: t0 + 4000, protokoll: p1 }];
    const ende = stand(t0 + 60_000, {
      protokoll: ps(31 + 21, [...Array.from({ length: 21 }, (_, i) => [`Art ${i}`, 1, iso(30)] as [string, number, string]), ['Lasttest-Modus: Stufe alle startet', 1, iso(-60)], ['Datei fehlt: <Pfad>', 9, iso(-30)], ['Anfrage abgebrochen', 20, iso(3)], ['Unerwarteter Fehler', 1, iso(3.5), 'error']]),
      neustarts: { anzahl: 1, letzte: [{ nr: 2, code: 1, signal: null, zeit: iso(4), ausnahme: 'TypeError' }, { nr: 2, code: null, signal: 'SIGKILL', zeit: iso(-120) }] },
    });
    const g = lt.protokollGesamt(stand(t0, { protokoll: vorher }), ende, laeufe)!;
    assert.equal(g.gesamt, 47);
    assert.equal(g.eintraege.find((m) => m.text === 'Datei fehlt: <Pfad>')?.durchgang, 'klein');
    assert.equal(g.eintraege.find((m) => m.text === 'Art 0')?.durchgang, 'zwischen den Durchgängen');
    assert.ok(!g.eintraege.some((m) => m.text.startsWith('Lasttest-Modus')), 'was vor dem ersten Durchgang war, zählt nicht');
    assert.deepEqual(g.neustartListe?.map((x) => [x.nr, x.grund]), [[2, 'Code 1, TypeError']], 'Neustart mit Grund, nur während des Laufs');
    assert.equal(lt.protokollZeile(g), 'Protokoll: 47 Warnungen und Fehler, 24 Arten – 20× Warnung [dokumente] Anfrage abgebrochen · 5× Warnung [dokumente] Datei fehlt: <Pfad> · 1× Fehler [dokumente] Unerwarteter Fehler (Error ENOENT); Neustarts: Prozess 2 Code 1, TypeError');
    const b = lt.protokollBericht(g);
    assert.equal(b[2], '| # | Anzahl | Stufe | Modul | Meldung | Ausnahme | erstmals | Durchgang | Prozesse |');
    assert.equal(b.filter((z) => /^\| \d+ \|/.test(z)).length, 20, 'die 20 häufigsten');
    assert.ok(b.includes('| 1 | 20 | Warnung | dokumente | Anfrage abgebrochen | – | 10:00:03 UTC | klein | 1 |'));
    assert.ok(b.includes('Dazu 4 weitere Arten.'));
    assert.ok(b.includes('- Prozess 2 Code 1, TypeError um 10:00:04 UTC (klein)'));
    const leer = lt.protokollGesamt(stand(t0, { protokoll: vorher }), stand(t0 + 1000, { protokoll: vorher }), []);
    assert.equal(lt.protokollZeile(leer), 'Protokoll: keine Warnungen und Fehler');
    assert.equal(lt.protokollZeile(null), null);
    assert.equal(lt.protokollGesamt(null, stand(0), []), null, 'ältere Fassung ohne Angabe');
  });

  it('Ergebnisblock: bisherige Zeilen bleiben, CPU je Gruppe unter der Stufe, Protokoll als Zeile', () => {
    const umgebung = { version: '0.208.0', image: 'dms-komplett', datenbank: 'im Container', architektur: 'x64', cpu: 'Beispiel-CPU', kerne: 4, kerneBegrenzt: false, rechnerKerne: 4, ramGb: 8, ramBegrenzt: false, grenzen: null };
    const gruppen = lt.gruppenAus([stand(0, { gruppen: gs(0, { 'ablago:1': [0, 300] }) }), stand(4000, { gruppen: gs(4000, { 'ablago:1': [2, 300] }) })]);
    const d = { name: 'klein', n: 25, median: 20, p95: 80, p99: 120, fehlerquote: 0, speicherMbMax: 300, schleifeP99: 10, engpass: null, abfragen: null, status: {} };
    const ergebnisse = [{ stufe: 'klein', art: 'zusage', verfehlt: [], zielVerfehlt: [], durchgang: d }];
    const x = { bestand: { gesamt: 5013, demo: 5000 }, dokumente: 110, laeufe: [d] };
    const alt = lt.ergebnisblock(ergebnisse, x, umgebung, {});
    const prot = { gesamt: 0, weitere: 0, eintraege: [], neustarts: 0, neustartListe: [] };
    const neu = lt.ergebnisblock([{ ...ergebnisse[0], durchgang: { ...d, gruppen } }], { ...x, laeufe: [{ ...d, gruppen }], protokoll: prot }, umgebung, {});
    const ohneNeu = neu.split('\n').filter((z) => !/^  CPU je Gruppe klein |^Protokoll: /.test(z)).join('\n');
    assert.equal(ohneNeu, alt, 'nur ergänzt');
    assert.match(neu, /\nklein    25 gleichzeitig: [^\n]*\n  CPU je Gruppe klein \(% eines Kerns, Speicher RSS höchstens\): Ablago Prozess 1 50 % 300 MB · /);
    assert.match(neu, /\nProtokoll: keine Warnungen und Fehler\nGemessen: /);
  });

  it('Live: CPU und Speicher in Prozent, p95 der letzten Sekunden, Warteschlange, Gruppen aus den letzten beiden Ständen, neueste Meldungen', () => {
    const seit = '2026-11-05T10:00:00.000Z';
    const s = [
      stand(0, { cpu: 100, gruppen: gs(0, { 'ablago:1': [10, 400], postgres: [20, 500] }) }),
      stand(2000, { cpu: 103, mb: 1500, gruppen: gs(2000, { 'ablago:1': [12, 420], postgres: [21, 510], bilder: [0.1, 10] }),
        protokoll: ps(3, [['vor dem Test', 1, '2026-11-05T09:59:00.000Z'], ['Datei fehlt: <Pfad>', 2, '2026-11-05T10:00:05.000Z', 'error']]) }),
    ];
    const l = lt.liveAus(s, [10, 20, 30, 40, 500], { name: 'mittel', n: 100, seit });
    assert.equal(l.cpu, 75, '3 s Rechenzeit in 2 s bei 2 Kernen');
    assert.equal(l.speicher, 37.5);
    assert.deepEqual([l.p95, l.anfragen, l.warteschlange, l.belegt, l.verbindungen, l.kerne], [500, 5, 3, 8, 10, 2]);
    assert.deepEqual(l.gruppen!.map((g) => [g.art, g.nr ?? null, g.cpu]), [['ablago', 1, 100], ['postgres', null, 50], ['bilder', null, null]]);
    assert.deepEqual(l.meldungen.map((m) => m.text), ['Datei fehlt: <Pfad>'], 'nur seit dem Start des Tests');
    const leer = lt.liveAus([], [], { name: 'klein', n: 25, seit });
    assert.deepEqual([leer.cpu, leer.speicher, leer.p95, leer.gruppen, leer.meldungen], [null, null, null, null, []]);
  });
});

describe('Sammlung im Lasttest (#909): ohne Spur der Mess-Sitzung, mit Dauer', () => {
  const zeit = '2026-11-06T10:00:00.000Z';
  const ID = '0b0e2c3a-1d1f-4a4e-9a9a-1234567890ab';

  it('Lasttest-Modus: Spur des Verwaltungsmodus zählt nicht mit, steht aber im Protokoll', async () => {
    const spur = { stufe: 'warn', modul: 'ablage', text: 'Im Verwaltungsmodus: fremde Mappe', zeit, daten: { was: 'gelesen', anzahl: 3, von: 'markus@example.org', imVerwaltungsmodus: true } };
    assert.equal(rohAus(spur, { lasttest: true }), null);
    assert.equal(rohAus(spur, { lasttest: false })?.text, 'Im Verwaltungsmodus: fremde Mappe', 'ohne Lasttest-Modus wie bisher');
    assert.equal(rohAus({ ...spur, text: 'Verwaltungsmodus begonnen' }, { lasttest: true }), null, 'auch andere Meldungen der Spur');
    assert.equal(rohAus({ ...spur, daten: { imVerwaltungsmodus: false } }, { lasttest: true })?.text, 'Im Verwaltungsmodus: fremde Mappe', 'nur mit dem Merkmal');
    assert.ok(rohAus({ ...spur, text: 'Datei fehlt', daten: {} }, { lasttest: true }), 'andere Meldungen zählen weiter');

    const v = einzeln();
    const vorher = (await v.meldungen())!;
    const n = (s: typeof vorher, text: string) => s.eintraege.find((e) => e.text === text)?.anzahl ?? 0;
    setzeLasttestModus(true);
    try {
      protokoll.modul('ablage').warn('Im Verwaltungsmodus: fremde Mappe', { was: 'gelesen', anzahl: 1, von: 'markus@example.org', imVerwaltungsmodus: true });
      protokoll.modul('ablage').warn('Probe #909: andere Warnung');
    } finally { setzeLasttestModus(false); }
    const s = (await v.meldungen())!;
    assert.equal(n(s, 'Im Verwaltungsmodus: fremde Mappe'), n(vorher, 'Im Verwaltungsmodus: fremde Mappe'), 'nicht gezählt');
    assert.equal(s.gesamt, vorher.gesamt + 1);
    assert.ok(protokoll.eintraege({ suche: 'fremde Mappe', max: 5 }).length >= 1, 'im Protokoll steht sie weiter');
  });

  it('Lange Anfrage und langer Datenbankzugriff: Dauer bleibt, Routenmuster statt Pfad; andere Zahlen, Pfade und Ids nicht', () => {
    const lang = rohAus({ stufe: 'warn', modul: 'datenbank', text: `Lange Anfrage: GET /api/mappen/${ID} dauerte 1240 ms`, zeit, daten: { anfrage: `GET /api/mappen/${ID}`, muster: 'GET /api/mappen/:id', dauerMs: 1240, db: 800 } })!;
    assert.equal(lang.text, 'Lange Anfrage: GET /api/mappen/:id dauerte <Dauer>');
    assert.deepEqual(lang.dauer, { max: 1240, summe: 1240, n: 1 });
    const ohneMuster = rohAus({ stufe: 'warn', modul: 'datenbank', text: `Lange Anfrage: GET /api/mappen/${ID} dauerte 900 ms`, zeit, daten: { anfrage: `GET /api/mappen/${ID}`, dauerMs: 900 } })!;
    assert.equal(ohneMuster.text, 'Lange Anfrage: GET <Pfad> dauerte <Dauer>', 'ohne Muster wie bisher <Pfad>');
    const falsch = rohAus({ stufe: 'warn', modul: 'datenbank', text: `Lange Anfrage: GET /api/mappen/${ID} dauerte 900 ms`, zeit, daten: { anfrage: `GET /api/mappen/${ID}`, muster: 'GET /api/mappen/"Lena"', dauerMs: 900 } })!;
    assert.equal(falsch.text, 'Lange Anfrage: GET <Pfad> dauerte <Dauer>', 'kein gültiges Muster: Pfad ersetzt');
    const db = rohAus({ stufe: 'warn', modul: 'datenbank', text: 'Langer Datenbankzugriff: repo.holeMappen dauerte 700 ms', zeit, daten: { zugriff: 'repo.holeMappen', dauerMs: 700, anfrage: `GET /api/mappen/${ID}`, muster: 'GET /api/mappen/:id' } })!;
    assert.equal(db.text, 'Langer Datenbankzugriff: repo.holeMappen dauerte <Dauer>');
    const sonst = rohAus({ stufe: 'warn', modul: 'system', text: 'Paket 7: Aufruf nach 300 ms fehlgeschlagen', zeit, daten: { ms: 300 } })!;
    assert.equal(sonst.text, 'Paket #: Aufruf nach # ms fehlgeschlagen', 'ohne dauerMs: Zahlen ersetzt');
    assert.equal(sonst.dauer, undefined);

    // Zusammen: höchste, Summe, Anzahl – im Bündel und in der Sammlung (die das Muster beim Bereinigen stehen lässt).
    const gesendet: Rohmeldung[][] = [];
    const b = new Buendel((m) => gesendet.push(m), 10_000);
    b.nimm(lang);
    b.nimm(rohAus({ stufe: 'warn', modul: 'datenbank', text: 'Lange Anfrage: GET /api/mappen/a1b2c3d4e5f6 dauerte 600 ms', zeit, daten: { anfrage: 'GET /api/mappen/a1b2c3d4e5f6', muster: 'GET /api/mappen/:id', dauerMs: 600 } })!);
    b.leeren();
    assert.equal(gesendet[0].length, 1, 'verschiedene Ids, eine Art');
    assert.deepEqual(gesendet[0][0].dauer, { max: 1240, summe: 1840, n: 2 });
    const s = new Protokollsammlung(zeit);
    s.nimm(gesendet[0][0], 1);
    s.nimm({ ...lang, dauer: { max: 20, summe: 20, n: 1 } }, 2);
    s.nimm({ ...lang, dauer: { max: 'x', summe: 1, n: 1 } as never }, 2);
    const e = s.stand().eintraege[0];
    assert.equal(e.text, 'Lange Anfrage: GET /api/mappen/:id dauerte <Dauer>');
    assert.equal(e.anzahl, 4);
    assert.deepEqual(e.dauer, { max: 1240, summe: 1860, n: 3 }, 'unbrauchbare Angaben zählen nicht zur Dauer');
    assert.ok(!('muster' in e));
  });

  it('Messung schreibt Dauer und Muster in den Kontext der Meldung', async () => {
    const m = new Messung(speicherMessSpeicher());
    await m.setze({ schwelleMs: 10 });
    const gesehen: Array<Rohmeldung | null> = [];
    const weg = protokoll.beobachte((x) => { if (x.modul === 'datenbank') gesehen.push(rohAus(x, { lasttest: false })); });
    try {
      m.erfasseAnfrage({ pfad: `GET /api/mappen/${ID}`, muster: 'GET /api/mappen/:id' }, { vor: 1, app: 40, db: 20, dbAnzahl: 1, rechte: 2, json: 1, gesamt: 42 });
      assert.equal(gesehen.length, 0, '#920: erst am Ende der Minute');
      m.leeren();
    } finally { weg(); }
    assert.equal(gesehen[0]?.text, 'Lange Anfrage: GET /api/mappen/:id dauerte <Dauer>');
    assert.deepEqual(gesehen[0]?.dauer, { max: 42, summe: 42, n: 1 });
  });

  it('#920: lange Anfragen und Datenbankzugriffe je Minute und Art zusammengefasst – Sammlung zählt weiter mit Dauer', async () => {
    const m = new Messung(speicherMessSpeicher(), 60_000);
    await m.setze({ schwelleMs: 10 });
    const zeilen: Array<{ text: string; daten?: Record<string, unknown>; benutzer?: string }> = [];
    const gesehen: Array<Rohmeldung | null> = [];
    const weg = protokoll.beobachte((x) => { if (x.modul === 'datenbank') { zeilen.push(x); gesehen.push(rohAus(x, { lasttest: false })); } });
    const t = (gesamt: number) => ({ vor: 1, app: gesamt - 2, db: 5, dbAnzahl: 1, rechte: 1, json: 1, gesamt });
    const repo = m.umhuelle({ async langsam() { await new Promise((r) => setTimeout(r, 15)); } }, 'test');
    try {
      for (const [id, ms] of [[ID, 100], ['a1b2c3d4e5f6', 300], [ID, 200]] as const) m.erfasseAnfrage({ pfad: `GET /api/mappen/${id}`, muster: 'GET /api/mappen/:id', benutzer: 'lena@example.org' }, t(ms));
      m.erfasseAnfrage({ pfad: 'GET /api/sichten', muster: 'GET /api/sichten' }, t(50));
      await repo.langsam(); await repo.langsam();
      assert.equal(zeilen.length, 0, 'nichts einzeln');
      m.leeren();
      m.leeren();
    } finally { weg(); }
    assert.equal(zeilen.length, 3, `je Art eine Zeile: ${JSON.stringify(zeilen.map((z) => z.text))}`);
    const mappe = zeilen.find((z) => z.text.includes('/api/mappen/:id'))!;
    assert.equal(mappe.text, 'Lange Anfrage: GET /api/mappen/:id dauerte 300 ms (längste von 3 in einer Minute, Ø 200 ms)');
    assert.equal(mappe.benutzer, undefined, 'gehört zu keiner einzelnen Anfrage');
    assert.deepEqual([mappe.daten?.zusammengefasst, mappe.daten?.dauerMs, mappe.daten?.mittelMs, mappe.daten?.summeMs], [3, 300, 200, 600]);
    assert.doesNotMatch(JSON.stringify(mappe), new RegExp(ID), 'Ids nur im Langläufer der Werkbank');
    const sichten = zeilen.find((z) => z.text.includes('/api/sichten'))!;
    assert.equal(sichten.text, 'Lange Anfrage: GET /api/sichten dauerte 50 ms', 'eine: wie bisher ohne Zusatz');
    assert.match(zeilen.find((z) => z.text.startsWith('Langer Datenbankzugriff'))!.text, /^Langer Datenbankzugriff: test\.langsam dauerte \d+ ms \(längste von 2 in einer Minute, Ø \d+ ms\)$/);
    // Sammlung: dieselbe Art wie einzelne Meldungen, Anzahl und Dauer aus dem Kontext.
    const r = gesehen.find((x) => x?.text.includes('/api/mappen/:id'))!;
    assert.equal(r.text, 'Lange Anfrage: GET /api/mappen/:id dauerte <Dauer>');
    assert.equal(r.anzahl, 3);
    assert.deepEqual(r.dauer, { max: 300, summe: 600, n: 3 });
    assert.ok(r.erste <= r.letzte);
    assert.equal(gesehen.find((x) => x?.text.startsWith('Langer Datenbankzugriff'))!.text, 'Langer Datenbankzugriff: test.langsam dauerte <Dauer>');
    const s = new Protokollsammlung(zeit);
    s.nimm(r, 1);
    s.nimm(rohAus({ stufe: 'warn', modul: 'datenbank', text: 'Lange Anfrage: GET /api/mappen/:id dauerte 900 ms', zeit, daten: { anfrage: 'GET /api/mappen/:id', muster: 'GET /api/mappen/:id', dauerMs: 900 } })!, 2);
    const e = s.stand().eintraege[0];
    assert.deepEqual([e.anzahl, e.dauer], [4, { max: 900, summe: 1500, n: 4 }]);
    assert.equal(lt.mitDauer(e.text, { max: 900, mittel: 375, n: 4 }), 'Lange Anfrage: GET /api/mappen/:id dauerte bis 900 ms (Ø 375 ms)');
    // Unbrauchbare Angaben: wie eine einzelne Meldung.
    const komisch = rohAus({ stufe: 'warn', modul: 'datenbank', text: 'Lange Anfrage: GET /api/x dauerte 70 ms', zeit, daten: { muster: 'GET /api/x', dauerMs: 70, zusammengefasst: 'viele', summeMs: 1 } })!;
    assert.deepEqual([komisch.anzahl, komisch.dauer], [1, { max: 70, summe: 70, n: 1 }]);
  });

  it('#920: Zusammenfassung schreibt sich am Ende des Fensters selbst', async () => {
    const m = new Messung(speicherMessSpeicher(), 30);
    await m.setze({ schwelleMs: 10 });
    const zeilen: string[] = [];
    const weg = protokoll.beobachte((x) => { if (x.modul === 'datenbank') zeilen.push(x.text); });
    try {
      m.erfasseAnfrage({ pfad: 'GET /api/typen', muster: 'GET /api/typen' }, { vor: 1, app: 20, db: 5, dbAnzahl: 1, rechte: 1, json: 1, gesamt: 22 });
      m.erfasseAnfrage({ pfad: 'GET /api/typen', muster: 'GET /api/typen' }, { vor: 1, app: 20, db: 5, dbAnzahl: 1, rechte: 1, json: 1, gesamt: 42 });
      await new Promise((r) => setTimeout(r, 120));
    } finally { weg(); }
    assert.deepEqual(zeilen, ['Lange Anfrage: GET /api/typen dauerte 42 ms (längste von 2 in einer Minute, Ø 32 ms)']);
    assert.equal((await m.speicher.liste(10)).length, 2, 'Langläufer der Werkbank weiter einzeln');
  });

  it('Bericht, Zeile und Live: „dauerte bis 1.240 ms (Ø 610 ms)“, Mittel je Durchgang', () => {
    const t0 = Date.parse(zeit);
    const text = 'Lange Anfrage: GET /api/mappen/:id dauerte <Dauer>';
    const eintrag = (anzahl: number, dauer: { max: number; summe: number; n: number }) => ({ stufe: 'warn', modul: 'datenbank', text, ausnahme: null, anzahl, erste: zeit, letzte: zeit, prozesse: [1], dauer });
    const a = stand(t0, { protokoll: { seit: zeit, gesamt: 1, weitere: 0, eintraege: [eintrag(1, { max: 700, summe: 700, n: 1 })] } });
    const z = stand(t0 + 4000, { protokoll: { seit: zeit, gesamt: 32, weitere: 0, eintraege: [eintrag(32, { max: 1240, summe: 700 + 31 * 610, n: 32 })] } });
    const p = lt.protokollAus([a, z])!;
    assert.deepEqual(p.eintraege[0].dauer, { max: 1240, mittel: 610, n: 31 });
    assert.equal(lt.protokollZeile(p), 'Protokoll: 31 Warnungen und Fehler, 1 Art – 31× Warnung [datenbank] Lange Anfrage: GET /api/mappen/:id dauerte bis 1.240 ms (Ø 610 ms)');
    assert.ok(lt.protokollBericht(p).some((x) => x.includes('| Lange Anfrage: GET /api/mappen/:id dauerte bis 1.240 ms (Ø 610 ms) |')));
    assert.equal(lt.mitDauer(text, { max: 1240, mittel: 1240, n: 1 }), 'Lange Anfrage: GET /api/mappen/:id dauerte 1.240 ms', 'eine: nur die Dauer');
    assert.equal(lt.mitDauer(text, null), 'Lange Anfrage: GET /api/mappen/:id dauerte … ms');
    assert.equal(lt.mitDauer('Datei fehlt: <Pfad>', null), 'Datei fehlt: <Pfad>');
    const l = lt.liveAus([z], [], { name: 'klein', n: 25, seit: zeit }) as { meldungen: Array<{ dauer?: unknown }> };
    assert.deepEqual(l.meldungen[0].dauer, { max: 1240, mittel: 613 }, 'Live: Mittel seit Start der Sammlung');
    assert.deepEqual(liveAus({ name: 'klein', meldungen: [{ stufe: 'warn', modul: 'datenbank', text, anzahl: 2, letzte: zeit, dauer: { max: 9, mittel: 'x' } }, { stufe: 'warn', modul: 'datenbank', text, anzahl: 2, letzte: zeit, dauer: { max: 9, mittel: 5, geheim: 1 } }] })!.meldungen.map((x) => x.dauer ?? null),
      [null, { max: 9, mittel: 5 }], 'nur Zahlen');
  });
});

describe('Lasttest-Seite (#895): Werte der laufenden Messung', () => {
  class FalschesKind extends EventEmitter { kill() { setImmediate(() => this.emit('exit', 0)); return true; } }
  const freierPort = () => new Promise<number>((r) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const a = s.address() as AddressInfo; s.close(() => r(a.port)); }); });

  it('Meldung des Skripts → Stand mit Verlauf; nur bekannte Felder; nach dem Ende weg', async () => {
    let kind: FalschesKind | null = null;
    const port = await freierPort();
    const m = new Lasttestmodus({ wahl: 'klein', dauer: 5, skript: '/x/lasttest.mjs', ziel: 'http://127.0.0.1:1', ergebnisOrdner: join(tmp, 'e'), env: {}, speicherart: null, port, host: '127.0.0.1', beenden: () => {},
      starte: () => { kind = new FalschesKind(); return kind as unknown as ChildProcess; } });
    await m.start();
    try {
      const holen = async () => (await (await fetch(`http://127.0.0.1:${port}/api/lasttest`)).json()) as LasttestStand;
      assert.equal((await holen()).live ?? null, null);
      assert.equal(m.lastgenerator(), null, 'das falsche Kind hat keine Prozess-Id');
      const live = { art: 'live', name: 'klein', n: 25, p95: 80, anfragen: 400, cpu: 42.5, speicher: 30, speicherMb: 1200, grenzeMb: 4000, ohneGrenze: false, kerne: 2, kerneBegrenzt: true, warteschlange: 0, belegt: 3, verbindungen: 10,
        gruppen: [{ art: 'ablago', nr: 1, rolle: 'leiter', anzahl: 1, cpu: 80, mb: 400 }, { art: 'unbekannt', anzahl: 1, cpu: 1, mb: 1 }], postgresExtern: true,
        meldungen: [{ stufe: 'error', modul: 'dokumente', text: 'Datei fehlt: <Pfad>', ausnahme: 'Error ENOENT', anzahl: 2, letzte: '2026-11-05T10:00:00.000Z' }, { stufe: 'info', modul: 'x', text: 'y', anzahl: 1, letzte: '' }], geheim: 'nicht übernehmen' };
      kind!.emit('message', live);
      kind!.emit('message', { ...live, cpu: 50 });
      const s = await holen();
      assert.equal(s.live?.jetzt.cpu, 50);
      assert.deepEqual(s.live?.verlauf.map((p) => p.cpu), [42.5, 50]);
      assert.deepEqual(s.live?.jetzt.gruppen?.map((g) => g.art), ['ablago'], 'unbekannte Gruppen weg');
      assert.deepEqual(s.live?.jetzt.meldungen.map((x) => x.stufe), ['error'], 'nur Warnungen und Fehler');
      assert.ok(!('geheim' in (s.live?.jetzt ?? {})));
      // #1117: vor den Durchgängen ohne Namen – Durchgang und Gleichzeitigkeit bleiben leer, der Rest gilt.
      assert.deepEqual([liveAus({ art: 'live', cpu: 12 }).name, liveAus({ art: 'live', n: 5 }).n, liveAus({ art: 'live', cpu: 12 }).cpu], [null, null, 12]);
      kind!.emit('exit', 0);
      assert.equal((await holen()).live, null);
    } finally { await m.stop(); }
  });
});

describe('Lasttest (#895): Route und Durchgang', () => {
  let app: Awaited<ReturnType<typeof import('../src/http')['baueApp']>>;
  const LENA: [string, string] = ['lena@example.org', 'lasttest-passwort-1'];
  let gefragt = 0;
  const messung = new Messung(speicherMessSpeicher());
  before(async () => {
    const { Dienst } = await import('../src/dienst');
    const { speicherRepo } = await import('../src/repo-speicher');
    const { speicherDateien } = await import('../src/dateispeicher');
    const { speicherEinstellungen } = await import('../src/einstellungen');
    const { Konten } = await import('../src/konten');
    const { speicherKontoRepo } = await import('../src/konto-repo');
    const d = new Dienst(speicherRepo(), speicherDateien(), { einstellungen: speicherEinstellungen() });
    const konten = new Konten(speicherKontoRepo(), null, 'http://nas.example.org', d.systemtypen.benutzerspiegel());
    d.verbindeKonten(konten.papierkorbHaken());
    await konten.einrichten({ email: LENA[0], name: 'Lena (Lasttest)', passwort: LENA[1] });
    await d.gleicheBenutzerAb(await konten.listeBenutzer());
    const { baueApp } = await import('../src/http');
    const { Systemlast } = await import('../src/systemlast');
    // Echte Gruppen aus /proc dieses Rechners (nur Linux) – mit diesem Prozess als Ablago-Prozess 1.
    const gruppen = new Prozessgruppen({ postgresImContainer: false });
    app = await baueApp(d, konten, {
      systemlast: new Systemlast(), verbund: einzeln(), messung,
      prozessgruppen: async () => { gefragt++; return gruppen.stand({ ablago: [{ nr: 1, pid: process.pid, rolle: 'leiter' }], lastgenerator: null }); },
    });
    await app.listen({ port: PORT, host: '127.0.0.1' });
  });
  after(async () => { await app?.close().catch(() => {}); });

  it('/api/werkbank/last liefert Protokoll und Gruppen; der Durchgang zählt Warnungen und CPU je Gruppe', async () => {
    const admin = await lt.anmelden(LENA);
    const v = { sitzungen: { admin, mitRolle: admin, ohneRolle: admin }, ansichten: ['keine'], mappen: ['keine'], dokumente: [] };
    gefragt = 0;
    const uhr = setInterval(() => protokoll.modul('dokumente').warn('Datei fehlt beim Lesen', { pfad: '/data/files/x.pdf', mappe: 'Steuer Lena' }), 300);
    let e;
    try { e = await lt.durchgang(v, { name: 'klein', n: 1, dauer: 3, mitExport: false }); } finally { clearInterval(uhr); }
    assert.ok(gefragt >= 2, 'nur gemessen, wenn der Lasttest fragt');
    const m = e.protokoll!.eintraege.find((x) => x.text === 'Datei fehlt beim Lesen');
    assert.ok(m && m.anzahl >= 3, JSON.stringify(e.protokoll));
    assert.equal(m.modul, 'dokumente');
    assert.doesNotMatch(JSON.stringify(e.protokoll), /Lena|\/data/);
    assert.ok(e.ende >= e.beginn);
    if (process.platform === 'linux') {
      assert.equal(e.gruppen?.verfuegbar, true);
      assert.ok(e.gruppen!.gruppen.some((x) => x.art === 'ablago' && x.nr === 1 && x.mbMax > 0));
      assert.match(lt.gruppenText(e.gruppen)!, /^CPU je Gruppe \(% eines Kerns, Speicher RSS höchstens\): Ablago Prozess 1 \d+ % \d+ MB · /);
    }
    const c = (await (await fetch(`${process.env.DMS_URL}/api/werkbank/last`, { headers: { 'x-dms': '1', 'x-dms-aktiv': '1', cookie: admin } })).json()) as { container: Record<string, unknown> | null };
    if (c.container) assert.ok('grenzeMb' in c.container && 'kerne' in c.container, 'Grenze und Kerne für die Prozentwerte der Seite');
  });

  it('#1117: schon vor den Durchgängen dieselbe Messung – ohne Durchgang und p95; der Durchgang beendet sie', async () => {
    const admin = await lt.anmelden(LENA);
    const gesendet: Array<Record<string, unknown>> = [];
    gefragt = 0;
    lt.vorlaufStarten(admin, { senden: (m) => { gesendet.push(m); }, takt: 50 });
    for (let i = 0; i < 100 && gesendet.length < 3; i++) await new Promise((r) => setTimeout(r, 20));
    assert.ok(gesendet.length >= 3, `${gesendet.length} Meldungen`);
    const l = gesendet.at(-1)!;
    assert.equal(l.art, 'live');
    assert.deepEqual([l.name, l.n, l.p95, l.anfragen], [null, null, null, 0], 'ohne Durchgang');
    assert.ok(gefragt >= 3, 'dieselbe Abfrage wie im Durchgang (/api/werkbank/last)');
    const c = (await (await fetch(`${process.env.DMS_URL}/api/werkbank/last`, { headers: { 'x-dms': '1', 'x-dms-aktiv': '1', cookie: admin } })).json()) as { container: Record<string, unknown> | null };
    if (c.container) assert.ok(typeof l.kerne === 'number' && typeof l.speicherMb === 'number', JSON.stringify(l));
    if (process.platform === 'linux') assert.ok(Array.isArray(l.gruppen), 'CPU je Gruppe aus den letzten beiden Ständen');
    // Ein Durchgang beendet die Messung davor: danach kommt nichts mehr ohne Namen.
    const v = { sitzungen: { admin, mitRolle: admin, ohneRolle: admin }, ansichten: ['keine'], mappen: ['keine'], dokumente: [] };
    await lt.durchgang(v, { name: 'klein', n: 1, dauer: 1, mitExport: false });
    const n = gesendet.length;
    await new Promise((r) => setTimeout(r, 200));
    assert.equal(gesendet.length, n, 'gestoppt');
    await lt.vorlaufStoppen();
  });

  it('#909: Routenmuster der Anfrage im Kontext – lange Anfragen mit Muster und Dauer', async () => {
    const admin = await lt.anmelden(LENA);
    await messung.setze({ schwelleMs: 1 });
    const gesehen: Array<Rohmeldung | null> = [];
    const weg = protokoll.beobachte((x) => { if (x.text.startsWith('Lange Anfrage')) gesehen.push(rohAus(x, { lasttest: true })); });
    try {
      await (await fetch(`${process.env.DMS_URL}/api/werkbank/last?x=1`, { headers: { 'x-dms': '1', 'x-dms-aktiv': '1', cookie: admin } })).arrayBuffer();
      await new Promise((r) => setTimeout(r, 20));
      messung.leeren();
    } finally { weg(); await messung.setze({ schwelleMs: 500 }); }
    assert.equal(gesehen[0]?.text, 'Lange Anfrage: GET /api/werkbank/last dauerte <Dauer>', JSON.stringify(gesehen));
    assert.ok((gesehen[0]?.dauer?.n ?? 0) === 1);
  });
});
