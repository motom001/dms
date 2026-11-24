/**
 * Ablauf des Lasttests als Tabelle (#1251): Plan aus dem Skript (lasttest.mjs, `ablaufPlan`) und Nachführen mit den
 * Meldungen (shared/src/lasttestablauf.ts) – so, wie das Skript sie bei `alle` schickt, mit der Grenze bei groß 50.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ablaufAusPlan,
  ablaufMelden,
  stufenZustand,
  type AblaufMeldung,
  type AblaufZeile,
  type LasttestAblauf,
} from '../../shared/src/lasttestablauf';

interface Lasttest {
  ablaufPlan(stufen: string[], o?: { dauer?: number; speichern?: boolean; zusatz?: boolean }): unknown;
  grenzFolge(stufe: string): { stufenfolge: number[]; kurz: string; ueberlastName: string };
}
const lt = (await import(new URL('./lasttest.mjs', import.meta.url).href)) as Lasttest;

const kurz = (z: AblaufZeile) => (z.art === 'schritt' ? z.schritt : z.name);
const zustaende = (a: LasttestAblauf, i: number) => a.stufen[i].zeilen.map((z) => `${kurz(z)}:${z.zustand}`);

describe('Lasttest-Ablauf (#1251)', () => {
  it('Plan je Stufe in der Reihenfolge des Skripts, mit denselben Namen wie die Durchgänge', () => {
    const a = ablaufAusPlan(lt.ablaufPlan(['klein', 'mittel', 'gross'], { dauer: 120 }))!;
    assert.deepEqual(
      a.stufen.map((s) => s.stufe),
      ['klein', 'mittel', 'gross'],
    );
    assert.deepEqual(a.stufen[0].zeilen.map(kurz), [
      'pruefen',
      'einrichten',
      'demo',
      'hintergrund',
      'vorbereiten',
      'klein',
      'klein + Speichern',
      'aufraeumen',
      'vorbereiten',
      'klein + Pakete und Tabellen',
      'aufraeumen',
      'vorbereiten',
      'klein + Anmeldeschutz',
    ]);
    const gross = a.stufen[2].zeilen.map(kurz);
    const folge = lt.grenzFolge('gross');
    assert.deepEqual(folge.stufenfolge.slice(0, 4), [5, 10, 25, 50]);
    assert.ok(gross.includes('groß 5') && gross.includes('groß 2000') && gross.includes('Überlast 1000'));
    assert.equal(gross.at(-1), 'auswerten', 'Auswerten nur am Ende der letzten Stufe');
    assert.ok(!a.stufen[0].zeilen.some((z) => z.art === 'schritt' && z.schritt === 'auswerten'));
    const klein = a.stufen[0].zeilen.find((z) => z.art === 'durchgang' && z.name === 'klein')!;
    assert.deepEqual([klein.art === 'durchgang' && klein.ziel, klein.art === 'durchgang' && klein.modus], [true, 'lesen']);
    // #1453: jeder Durchgang mit Ziel zeigt „Ziel erreicht“ – bei klein, mittel und groß auch die Zusatz-Durchgänge.
    for (const s of a.stufen)
      for (const z of s.zeilen) if (z.art === 'durchgang' && z.modus !== 'ueberlast') assert.equal(z.ziel, true, `${z.name} hat ein Ziel`);
    const extrem = ablaufAusPlan(lt.ablaufPlan(['extrem'], { dauer: 60 }))!;
    assert.ok(
      extrem.stufen[0].zeilen.some((z) => z.art === 'durchgang' && z.modus === 'speichern' && !z.ziel),
      'extrem ohne Ziel',
    );
    // Ohne „mit Speichern“ und ohne Zusatz-Durchgänge.
    const nur = ablaufAusPlan(lt.ablaufPlan(['klein'], { speichern: false, zusatz: false }))!;
    assert.deepEqual(nur.stufen[0].zeilen.map(kurz), ['pruefen', 'einrichten', 'demo', 'hintergrund', 'vorbereiten', 'klein', 'auswerten']);
  });

  it('füllt sich mit den Meldungen: ✓ mit Dauer und Werten, übersprungene „nicht nötig“, Grenze bei groß', () => {
    const a = ablaufAusPlan(lt.ablaufPlan(['klein', 'gross'], { dauer: 60, zusatz: false }))!;
    let jetzt = 1_000_000;
    const m = (x: AblaufMeldung, s = 10) => {
      ablaufMelden(a, x, jetzt);
      jetzt += s * 1000;
    };
    assert.equal(stufenZustand(a.stufen[0].zeilen), 'offen');
    m({ art: 'stufe', stufe: 'klein' });
    m({ art: 'schritt', schritt: 'pruefen' }, 2);
    m({ art: 'schritt', schritt: 'einrichten' }, 30);
    m({ art: 'schritt', schritt: 'demo' }, 120);
    m({ art: 'schritt', schritt: 'hintergrund' }, 60);
    m({ art: 'schritt', schritt: 'vorbereiten' });
    m({ art: 'schritt', schritt: 'vorbereiten' }, 5); // wiederholt: dieselbe Zeile
    m({ art: 'durchgang', name: 'klein', n: 25 }, 60);
    m({ art: 'durchgang-fertig', name: 'klein', p50: 48, p95: 131, jeSekunde: 210, fehlerquote: 0 }, 5);
    m({ art: 'ziel', name: 'klein', erreicht: true });
    const klein = a.stufen[0].zeilen.find((z) => kurz(z) === 'klein')!;
    assert.equal(klein.zustand, 'erledigt');
    assert.equal((klein.ende! - klein.beginn!) / 1000, 60);
    assert.deepEqual(klein.werte, { p50: 48, p95: 131, jeSekunde: 210, fehlerquote: 0 });
    assert.equal(klein.erreicht, true);
    assert.equal(a.stufen[0].zeilen.find((z) => kurz(z) === 'vorbereiten')!.zustand, 'erledigt');

    // Nächste Stufe: Einrichten nicht nötig (schon eingerichtet), Demo-Mappen dazu.
    m({ art: 'durchgang', name: 'klein + Speichern', n: 25 }, 60);
    m({ art: 'durchgang-fertig', name: 'klein + Speichern', p50: 70, p95: 240, jeSekunde: 150, fehlerquote: 0 });
    m({ art: 'schritt', schritt: 'aufraeumen' });
    m({ art: 'stufe', stufe: 'gross' });
    assert.equal(stufenZustand(a.stufen[0].zeilen), 'erledigt');
    m({ art: 'schritt', schritt: 'pruefen' });
    m({ art: 'schritt', schritt: 'demo' });
    m({ art: 'schritt', schritt: 'hintergrund' });
    m({ art: 'schritt', schritt: 'vorbereiten' });
    assert.equal(a.stufen[1].zeilen.find((z) => kurz(z) === 'einrichten')!.zustand, 'nicht-noetig');
    for (const [n, ok] of [
      [5, true],
      [10, true],
      [25, true],
      [50, false],
    ] as const) {
      m({ art: 'durchgang', name: `groß ${n}`, n });
      m({ art: 'durchgang-fertig', name: `groß ${n}`, p50: 100, p95: ok ? 900 : 3400, jeSekunde: 300, fehlerquote: 0 });
      m({ art: 'ziel', name: `groß ${n}`, erreicht: ok });
    }
    m({ art: 'grenze' });
    const z = zustaende(a, 1);
    assert.ok(z.includes('groß 50:erledigt') && z.includes('groß 75:nicht-noetig') && z.includes('groß 2000:nicht-noetig'));
    assert.equal(a.stufen[1].zeilen.find((x) => kurz(x) === 'groß 50')!.erreicht, false);
    m({ art: 'durchgang', name: 'Überlast 1000', n: 1000 });
    m({ art: 'durchgang-fertig', name: 'Überlast 1000', p50: 2000, p95: 9000, jeSekunde: 400, fehlerquote: 0.2 });
    // „+ Speichern“ bei groß mit der Zahl an der Grenze (im Plan geschätzt).
    m({ art: 'durchgang', name: 'groß + Speichern', n: 25 });
    assert.equal(
      a.stufen[1].zeilen.find((x) => kurz(x) === 'groß + Speichern')!.art === 'durchgang' &&
        a.stufen[1].zeilen.find((x) => kurz(x) === 'groß + Speichern')!.zustand,
      'laeuft',
    );
    const speichern = a.stufen[1].zeilen.find((x) => kurz(x) === 'groß + Speichern')!;
    assert.equal(speichern.art === 'durchgang' ? speichern.n : 0, 25);
    m({ art: 'durchgang-fertig', name: 'groß + Speichern', p50: 90, p95: 800, jeSekunde: 250, fehlerquote: 0 });
    m({ art: 'schritt', schritt: 'aufraeumen' });
    m({ art: 'schritt', schritt: 'auswerten' });
    m({ art: 'ende', fertig: true });
    assert.ok(a.stufen.every((s) => s.zeilen.every((x) => x.zustand === 'erledigt' || x.zustand === 'nicht-noetig')));
    assert.equal(stufenZustand(a.stufen[1].zeilen), 'erledigt');
  });

  it('Abbruch: Offenes bleibt offen; Unbekanntes im Plan fällt weg', () => {
    const a = ablaufAusPlan(lt.ablaufPlan(['klein'], { zusatz: false }))!;
    ablaufMelden(a, { art: 'stufe', stufe: 'klein' }, 1);
    ablaufMelden(a, { art: 'schritt', schritt: 'pruefen' }, 2);
    ablaufMelden(a, { art: 'ende', fertig: false }, 3);
    assert.deepEqual(zustaende(a, 0).slice(0, 3), ['pruefen:erledigt', 'einrichten:offen', 'demo:offen']);
    assert.equal(ablaufAusPlan('kaputt'), null);
    const b = ablaufAusPlan([
      { stufe: 'klein', zeilen: [{ art: 'schritt', schritt: 'boese' }, { art: 'durchgang', name: 'x\n<b>', modus: 'lesen', n: 5 }, null] },
      { stufe: 'unbekannt', zeilen: [] },
    ])!;
    assert.equal(b.stufen.length, 1);
    assert.deepEqual(b.stufen[0].zeilen.map(kurz), ['x <b>']);
  });
});
