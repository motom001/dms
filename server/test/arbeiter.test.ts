/**
 * Arbeiter-Pool (#542): PDF-Arbeiten und große Exporte laufen in Arbeiter-Fäden. Geprüft werden der Pool
 * selbst (Ergebnis, Fehler, Zeitgrenze, volle Warteschlange, Absturz), die Einstellung, die Warnung bei hoher
 * Wartezeit und – als Kern des Issues – dass die Ablage während eines großen PDF-Exports schnell lädt.
 */
import assert from 'node:assert/strict';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { after, describe, it } from 'node:test';
import { arbeiterAus, arbeiterStand, beendeArbeiter, richteArbeiterEin, vorgabeArbeiter } from '../src/arbeit';
import { Arbeiterpool } from '../src/arbeit/pool';
import { ladeBeispiele } from '../src/beispiele';
import { speicherDateien } from '../src/dateispeicher';
import { erzeugeDemo } from '../src/demo';
import { Dienst } from '../src/dienst';
import { Fachfehler } from '../src/fehler';
import { ladeArgumente } from '../src/laeufer/modul';
import { Auslastung } from '../src/messung';
import { speicherRepo } from '../src/repo-speicher';
import { SCHLEIFE_GRENZE_MS, SCHLEIFE_MINUTEN } from '../../shared/src/systemlast';

const status = (s: number, text?: RegExp) => (e: unknown) => e instanceof Fachfehler && e.status === s && (!text || text.test(e.message));
const datei = new URL('./hilfen-arbeitsfaden.ts', import.meta.url);
const pool = (o: Partial<ConstructorParameters<typeof Arbeiterpool>[0]> = {}) => new Arbeiterpool({ datei, groesse: 1, execArgv: ladeArgumente(process.execArgv), ...o });

after(() => beendeArbeiter());

describe('Arbeiter-Pool (#542)', () => {
  it('Ergebnis mit Buffer, Fachfehler kommen mit Status und Details an', async () => {
    const p = pool({ groesse: 2 });
    try {
      const r = await p.ausfuehren<{ ist: boolean; daten: Buffer }>('umdrehen', [Buffer.from('abc')]);
      assert.equal(r.ist, true, 'im Arbeiter wieder ein Buffer');
      assert.ok(Buffer.isBuffer(r.daten));
      assert.equal(r.daten.toString(), 'cba');
      await assert.rejects(p.ausfuehren('fachfehler', []), (e) => status(422, /Passwort/)(e) && (e as Fachfehler).details !== undefined);
      const s = p.stand();
      assert.equal(s.erledigt, 1); assert.equal(s.fehler, 1); assert.equal(s.wartend, 0);
    } finally { await p.beenden(); }
  });

  it('Zeitgrenze: Auftrag bricht mit 504 ab, der nächste läuft', async () => {
    const p = pool({ zeitMs: 2500 });
    try {
      await assert.rejects(p.ausfuehren('rechne', [8000]), status(504, /abgebrochen/));
      assert.equal(await p.ausfuehren('rechne', [10]), true);
      assert.equal(p.stand().zeitueberschreitungen, 1);
    } finally { await p.beenden(); }
  });

  it('volle Warteschlange: sofort 503 statt endlos warten', async () => {
    const p = pool({ warteschlangeMax: 1 });
    try {
      const a = p.ausfuehren('rechne', [300]);
      const b = p.ausfuehren('rechne', [10]);
      await assert.rejects(p.ausfuehren('rechne', [10]), (e) => status(503)(e) && (e as Fachfehler).details !== undefined);
      assert.deepEqual(await Promise.all([a, b]), [true, true]);
      assert.equal(p.stand().abgewiesen, 1);
    } finally { await p.beenden(); }
  });

  it('Absturz eines Arbeiters: verständlicher Fehler, danach geht es weiter', async () => {
    const p = pool();
    try {
      await assert.rejects(p.ausfuehren('absturz', []), status(500, /unerwartet abgebrochen/));
      assert.equal(await p.ausfuehren('rechne', [5]), true);
    } finally { await p.beenden(); }
  });

  it('Zahl der Arbeiter: Vorgabe nach Kernen, DMS_ARBEITER, 0 = aus', () => {
    assert.deepEqual([1, 2, 3, 4, 8, 16, 64].map(vorgabeArbeiter), [1, 1, 1, 2, 4, 4, 4]);
    assert.deepEqual(arbeiterAus({}, 6), { groesse: 3, quelle: 'vorgabe', kerne: 6 });
    assert.deepEqual(arbeiterAus({ DMS_ARBEITER: '3' }, 2), { groesse: 3, quelle: 'umgebung', kerne: 2 });
    assert.equal(arbeiterAus({ DMS_ARBEITER: '0' }, 2).groesse, 0);
    const falsch = arbeiterAus({ DMS_ARBEITER: 'viele' }, 4);
    assert.equal(falsch.groesse, 2); assert.match(falsch.fehler!, /DMS_ARBEITER/);
    assert.equal(arbeiterAus({ DMS_ARBEITER: '17' }, 4).quelle, 'vorgabe');
  });

  it(`Warnung erst, wenn ${SCHLEIFE_MINUTEN} Minutenfenster hintereinander p99 > ${SCHLEIFE_GRENZE_MS} ms haben`, () => {
    const a = new Auslastung();
    const w = (p99: number) => ({ median: 1, p99, max: p99, seitSekunden: 60 });
    for (let i = 0; i < SCHLEIFE_MINUTEN - 1; i++) a.fensterZu(w(250));
    assert.equal(a.warnung(), null);
    a.fensterZu(w(250));
    assert.ok(a.warnung());
    assert.ok(a.stand().warnungSeit);
    a.fensterZu(w(SCHLEIFE_GRENZE_MS));
    assert.equal(a.warnung(), null, 'genau an der Grenze ist nicht darüber');
    a.fensterZu(null);
    assert.equal(a.warnung(), null);
  });
});

/**
 * Kern von #542: Während ein großer PDF-Export läuft, lädt die Ablage weiterhin schnell. Gemessen werden
 * Seiten der Ablage (`Dienst.seite`) und die Verzögerung der Ereignisschleife – einmal ohne Pool
 * (wie vor #542, nur als Hinweis ausgegeben) und einmal mit Pool (fest geprüft).
 */
describe('Ablage während eines großen Exports (#542)', () => {
  /** Grenzen mit viel Luft für langsame CI-Rechner; vor #542 lagen die Werte bei mehreren Sekunden. */
  const ABLAGE_MAX_MS = 1500;
  const SCHLEIFE_MAX_MS = 1000;

  it('Ablage lädt weiter, die Ereignisschleife bleibt frei', async () => {
    const d = new Dienst(speicherRepo(), speicherDateien());
    await ladeBeispiele(d);
    await erzeugeDemo(d, { anzahl: 2500, startwert: 'arbeiter-542' }, null);
    const ich = { id: 'admin', rolle: 'admin' };
    const z = await d.rechtepruefung.zugriff(ich);
    const typen = (await d.listeTypen()).filter((t) => !t.system);
    const zahl = await Promise.all(typen.map(async (t) => ({ t, n: (await d.seite(ich, { sicht: t.id, von: 0, anzahl: 1 }, z)).gesamt })));
    const gross = zahl.sort((a, b) => b.n - a.n)[0].t;

    const messe = async () => {
      const h = monitorEventLoopDelay({ resolution: 10 });
      h.enable();
      const ablage: number[] = [];
      let fertig = false;
      const t0 = performance.now();
      const exp = d.exportiere(ich, { format: 'pdf', sicht: gross.id, uebersicht: true }, z).finally(() => { fertig = true; });
      // Wie die Oberfläche: Listen verschiedener Ansichten laden, solange der Export läuft.
      while (!fertig) {
        const s = performance.now();
        await d.seite(ich, { sicht: typen[ablage.length % typen.length].id, von: 0, anzahl: 50 }, z);
        ablage.push(performance.now() - s);
        await new Promise((r) => setTimeout(r, 20));
      }
      const e = await exp;
      h.disable();
      return { exportMs: performance.now() - t0, mappen: e.mappen, ablageMax: Math.max(...ablage), ablage: ablage.length, schleifeMax: h.max / 1e6 };
    };

    richteArbeiterEin({ DMS_ARBEITER: '0' });
    const ohne = await messe();
    richteArbeiterEin({ DMS_ARBEITER: '1' });
    await messe(); // Arbeiter warm laufen lassen (Laden von pdf-lib)
    const mit = await messe();
    const r = (x: number) => Math.round(x);
    console.log(`Export von ${mit.mappen} Mappen als PDF – ohne Pool: Export ${r(ohne.exportMs)} ms, Ablage höchstens ${r(ohne.ablageMax)} ms (${ohne.ablage}×), Ereignisschleife höchstens ${r(ohne.schleifeMax)} ms; mit Pool: Export ${r(mit.exportMs)} ms, Ablage höchstens ${r(mit.ablageMax)} ms (${mit.ablage}×), Ereignisschleife höchstens ${r(mit.schleifeMax)} ms`);
    assert.ok(mit.ablage >= 3, 'die Ablage wurde während des Exports mehrmals geladen');
    assert.ok(mit.ablageMax < ABLAGE_MAX_MS, `Ablage ${r(mit.ablageMax)} ms während des Exports (Grenze ${ABLAGE_MAX_MS} ms)`);
    assert.ok(mit.schleifeMax < SCHLEIFE_MAX_MS, `Ereignisschleife ${r(mit.schleifeMax)} ms (Grenze ${SCHLEIFE_MAX_MS} ms)`);
    assert.equal(arbeiterStand().aus, false);
  });
});
