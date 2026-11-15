/**
 * Oberfläche messen (#1276): Auswertung ohne Browser – Kennzahlen je Runde, Median/p95, Vergleich mit dem Vorlauf
 * (Schwelle +20 % und mindestens +100 ms), Ziele und CI-Grenzen, Bericht. Das Messen selbst läuft im Workflow
 * „Oberfläche messen“ (web/rauchtest/messen/oberflaeche.mjs).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

type Wert = { median: number | null; p95: number | null };
interface Zusammenfassung { runden: number; bedienbar: Wert; inp: Wert; laengste: Wert; blockiert: Wert; anfragen: number | null; serverMs: number | null; zeitueberschritten: number }
interface Ergebnis { ablago?: string; zeit?: string; geraet: string; runden: number; daten?: string; ergebnisse: Record<string, { name: string; drosseln: Record<string, Zusammenfassung> }> }
interface Fund { ablauf: string; drossel: number; kennzahl: string; art: string; vorher?: number; jetzt?: number; wert?: number; grenze?: number | null }
interface Auswertung {
  SCHWELLE: { anteil: number; ms: number };
  ZIEL: { bedienbar: number; inp: number };
  quantil(werte: Array<number | null>, q: number): number | null;
  rundeAuswerten(r: { dauer: number; lange?: Array<[number, number]>; ereignisse?: Array<[number, number]> }): { bedienbar: number; inp: number | null; laengste: number; blockiert: number };
  zusammenfassen(runden: Array<Record<string, unknown>>): Zusammenfassung;
  vergleichen(jetzt: Ergebnis, vorher: Ergebnis | null): Fund[];
  grenzenPruefen(e: Ergebnis, grenzen?: Record<string, Record<string, Record<string, number>>>): Fund[];
  bericht(e: Ergebnis, o: { vergleich?: Fund[]; pruefung?: Fund[]; vorher?: Ergebnis | null }): string;
  istRot(vergleich: Fund[], pruefung: Fund[]): boolean;
  besseresVon(a: Zusammenfassung, b: Zusammenfassung): Zusammenfassung & { nachgemessen?: boolean };
}
const a = (await import(new URL('../../web/rauchtest/messen/auswertung.mjs', import.meta.url).href)) as Auswertung;

const runde = (bedienbar: number, inp: number | null = null) => ({ bedienbar, inp, laengste: 0, blockiert: 0, anfragen: 2, serverMs: 5 });
const lauf = (bedienbar: number, inp: number | null, drossel = '1'): Ergebnis => ({
  geraet: 'Container', runden: 5,
  ergebnisse: { 'post-zuordnen': { name: 'Neue Post zuordnen', drosseln: { [drossel]: a.zusammenfassen([runde(bedienbar, inp), runde(bedienbar, inp), runde(bedienbar, inp)]) } } },
});

describe('Oberfläche messen: Auswertung (#1276)', () => {
  it('Quantile nach Rang, ohne leere Werte', () => {
    assert.equal(a.quantil([5, 1, 3, null, 4, 2], 0.5), 3);
    assert.equal(a.quantil([5, 1, 3, 4, 2], 0.95), 5);
    assert.equal(a.quantil([null], 0.5), null);
  });

  it('Runde: INP ist die längste Interaktion, Blockierzeit die Anteile über 50 ms', () => {
    const r = a.rundeAuswerten({ dauer: 812.4, lange: [[10, 120], [300, 49], [400, 70]], ereignisse: [[24, 1], [64, 1], [40, 2]] });
    assert.deepEqual(r, { bedienbar: 812, inp: 64, laengste: 120, blockiert: 90 });
    assert.equal(a.rundeAuswerten({ dauer: 100 }).inp, null, 'ohne Eingabe kein INP');
  });

  it('Vergleich: schlechter erst über +20 % und mindestens +100 ms', () => {
    assert.deepEqual(a.vergleichen(lauf(1150, 40), lauf(1000, 40)), [], '+15 % ist keine Verschlechterung');
    assert.deepEqual(a.vergleichen(lauf(190, 40), lauf(100, 40)), [], '+90 % aber nur +90 ms');
    const f = a.vergleichen(lauf(1300, 40), lauf(1000, 40));
    assert.equal(f.length, 1);
    assert.equal(f[0].art, 'schlechter');
    assert.equal(f[0].kennzahl, 'bedienbar');
    assert.equal(a.vergleichen(lauf(700, 40), lauf(1000, 40))[0].art, 'besser');
    assert.deepEqual(a.vergleichen(lauf(1300, 40), null), [], 'ohne Vorlauf nichts zu vergleichen');
  });

  it('Die Bremse aus #1255 wird rot: INP von Sekunden gegenüber dem Vorlauf', () => {
    // Stand nach PR #1257 (Container): Tippen nach der Typwahl ~600 ms bis bedienbar, INP < 100 ms; vorher hing der Tab.
    const vergleich = a.vergleichen(lauf(20_000, 19_000), lauf(600, 80));
    const pruefung = a.grenzenPruefen(lauf(20_000, 19_000));
    assert.ok(vergleich.some((v) => v.art === 'schlechter' && v.kennzahl === 'inp'));
    assert.ok(pruefung.some((p) => p.art === 'ziel' && p.kennzahl === 'inp'), 'INP über dem Ziel 200 ms');
    assert.equal(a.istRot(vergleich, pruefung), true);
    assert.equal(a.istRot([], a.grenzenPruefen(lauf(1500, 300))), false, 'ein verfehltes Ziel allein macht nicht rot');
  });

  it('Nachmessen: je Kennzahl zählt der bessere Lauf – ein Ausreißer wird nicht rot, eine echte Bremse schon', () => {
    const z = (b: number, inp: number) => lauf(b, inp).ergebnisse['post-zuordnen'].drosseln['1'];
    const besser = a.besseresVon(z(1300, 40), z(1020, 60));
    assert.equal(besser.bedienbar.median, 1020);
    assert.equal(besser.inp.median, 40);
    assert.equal(besser.nachgemessen, true);
    const vorher = lauf(1000, 40);
    const jetzt = lauf(1300, 40);
    jetzt.ergebnisse['post-zuordnen'].drosseln['1'] = besser;
    assert.deepEqual(a.vergleichen(jetzt, vorher), [], 'Ausreißer: nach dem Nachmessen nicht mehr schlechter');
    const bremse = lauf(16_000, 3400);
    bremse.ergebnisse['post-zuordnen'].drosseln['1'] = a.besseresVon(z(16_000, 3400), z(15_800, 3300));
    assert.ok(a.istRot(a.vergleichen(bremse, lauf(2900, 430)), []), 'die Bremse aus #1255 bleibt rot');
  });

  it('Ziele nur ohne Drossel; CI-Grenzen je Ablauf und Drossel; Zeitüberschreitung ist rot', () => {
    assert.deepEqual(a.grenzenPruefen(lauf(5000, 900, '4')), [], 'gedrosselt kein Ziel');
    const g = a.grenzenPruefen(lauf(5000, 900, '4'), { 'post-zuordnen': { 4: { bedienbar: 4000 } } });
    assert.equal(g.length, 1);
    assert.equal(g[0].art, 'grenze');
    const zeit = lauf(60_000, null);
    zeit.ergebnisse['post-zuordnen'].drosseln['1'].zeitueberschritten = 1;
    assert.equal(a.istRot([], a.grenzenPruefen(zeit)), true);
  });

  it('Bericht: Tabelle je Drossel, Vergleich und Hinweis auf ein anderes Gerät', () => {
    const jetzt = { ...lauf(1300, 40), ablago: '0.291.0', zeit: '2026-11-15T20:00:00Z' };
    const vorher = { ...lauf(1000, 40), geraet: 'GitHub-Rechner', ablago: '0.290.2', zeit: '2026-11-08T20:00:00Z' };
    const text = a.bericht(jetzt, { vergleich: a.vergleichen(jetzt, vorher), pruefung: a.grenzenPruefen(jetzt), vorher });
    assert.match(text, /### normal/);
    assert.match(text, /\| Neue Post zuordnen \| 1\.300 \| 1\.300 \| 40 \| 40 \|/);
    assert.match(text, /\*\*schlechter\*\*: Neue Post zuordnen, normal, bis bedienbar 1\.000 → 1\.300 ms/);
    assert.match(text, /anderes Gerät/);
    assert.match(text, /Ziel verfehlt: Neue Post zuordnen, normal, bis bedienbar 1\.300 ms/);
  });
});
