/**
 * Baustein „von selbst nachladen“ der Oberfläche (#919, web/src/nachladen.ts) als reine Logik. Die Teile über HTTP
 * (Stand der Ablage, „Gerade auch im Verwaltungsmodus“) stehen in server/test/nachladen.test.ts.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ANFANG, schritt, starteNachladen, TAKT_MS, type Umgebung } from '../../web/src/nachladen';

/** Umgebung zum Durchspielen: Sichtbarkeit von Hand, Zeitgeber als Liste. */
function probeUmgebung() {
  let sichtbar = true;
  const hoerer = new Set<() => void>();
  const wartend: Array<{ ms: number; f: () => void; weg: boolean }> = [];
  const u: Umgebung = {
    sichtbar: () => sichtbar,
    beiSichtbarkeit: (f) => {
      hoerer.add(f);
      return () => hoerer.delete(f);
    },
    spaeter: (ms, f) => {
      const w = { ms, f, weg: false };
      wartend.push(w);
      return () => {
        w.weg = true;
      };
    },
    zufall: () => 0.5,
  };
  const ruhe = () => new Promise((r) => setImmediate(r));
  return {
    u,
    /** Nächsten Takt auslösen (wenn einer geplant ist). */
    async takt() {
      const w = wartend.filter((x) => !x.weg).shift();
      if (!w) return false;
      w.weg = true;
      w.f();
      await ruhe();
      return true;
    },
    geplant: () => wartend.filter((x) => !x.weg),
    async setzeSichtbar(an: boolean) {
      sichtbar = an;
      for (const f of hoerer) f();
      await ruhe();
    },
    ruhe,
    hoerer: () => hoerer.size,
  };
}

describe('Baustein „von selbst nachladen“ (#919, web/src/nachladen.ts)', () => {
  it('Schritt: erster Wert nur merken, Nachlauf einmal, gleicher Stand → nichts, Änderung → laden', () => {
    let z = ANFANG;
    const lauf = (s: string, o = {}) => {
      const r = schritt(z, s, o);
      z = r.zustand;
      return r.melden;
    };
    assert.equal(lauf('a'), false, 'erster Wert: die Seite hat schon geladen');
    assert.equal(lauf('a'), true, 'Nachlauf: Zahlen anderer dürfen kurz nachhinken');
    assert.equal(lauf('a'), false);
    assert.equal(lauf('a'), false, 'Stand gleich → kein Nachladen');
    assert.equal(lauf('b'), true, 'Stand geändert → nachladen');
    assert.equal(lauf('b'), true, 'und noch einmal im nächsten Takt');
    assert.equal(lauf('b'), false);
    // Für Listen, die selbst angezeigt werden (#921): ersten Wert melden, kein Nachlauf.
    z = ANFANG;
    assert.equal(lauf('x', { erstesMelden: true, nachlauf: false }), true);
    assert.equal(lauf('x', { erstesMelden: true, nachlauf: false }), false);
    assert.equal(lauf('y', { erstesMelden: true, nachlauf: false }), true);
    assert.equal(lauf('y', { erstesMelden: true, nachlauf: false }), false);
  });

  it('Abfrage: Takt 10–15 s, gleicher Stand → keine weitere Anfrage der Seite; Hintergrund-Tab fragt nicht, zurück sofort', async () => {
    const p = probeUmgebung();
    let stand = 's1';
    let gefragt = 0;
    let geladen = 0;
    const stopp = starteNachladen({
      hole: async () => {
        gefragt++;
        return stand;
      },
      melde: () => {
        geladen++;
      },
      umgebung: p.u,
    });
    await p.ruhe();
    assert.equal(gefragt, 1, 'gleich beim Start einmal');
    assert.equal(p.geplant()[0].ms, TAKT_MS[0] + Math.floor(0.5 * (TAKT_MS[1] - TAKT_MS[0] + 1)));
    assert.ok(p.geplant()[0].ms >= 10_000 && p.geplant()[0].ms <= 15_000);
    await p.takt();
    assert.equal(geladen, 1, 'Nachlauf nach dem ersten Wert');
    for (let i = 0; i < 5; i++) await p.takt();
    assert.equal(gefragt, 7);
    assert.equal(geladen, 1, 'Stand gleich → die Seite lädt nichts nach');
    stand = 's2';
    await p.takt();
    assert.equal(geladen, 2, 'Stand geändert → einmal nachladen');
    await p.takt();
    await p.takt();
    assert.equal(geladen, 3, 'ein Nachlauf, dann Ruhe');
    // Hintergrund-Tab: kein Takt mehr geplant, keine Anfrage.
    await p.setzeSichtbar(false);
    assert.equal(p.geplant().length, 0);
    const vorher = gefragt;
    assert.equal(await p.takt(), false);
    assert.equal(gefragt, vorher, 'im Hintergrund wird nicht gefragt');
    // Zurück im Tab: sofort einmal, danach wieder im Takt.
    stand = 's3';
    await p.setzeSichtbar(true);
    assert.equal(gefragt, vorher + 1);
    assert.equal(geladen, 4);
    assert.equal(p.geplant().length, 1);
    // Fehler (nicht erreichbar): nichts melden, weiter im Takt.
    const geladenVorher = geladen;
    stopp();
    assert.equal(p.geplant().length, 0, 'beendet: nichts mehr geplant');
    assert.equal(p.hoerer(), 0, 'beendet: kein Hörer mehr');
    let fehler = 0;
    const p2 = probeUmgebung();
    const stopp2 = starteNachladen({
      hole: async () => {
        fehler++;
        throw new Error('weg');
      },
      melde: () => {
        geladen++;
      },
      umgebung: p2.u,
    });
    await p2.ruhe();
    await p2.takt();
    assert.equal(fehler, 2);
    assert.equal(geladen, geladenVorher);
    assert.equal(p2.geplant().length, 1);
    stopp2();
  });

  it('startet im Hintergrund-Tab nicht, sondern erst beim Zurückkehren', async () => {
    const p = probeUmgebung();
    await p.setzeSichtbar(false);
    let gefragt = 0;
    const stopp = starteNachladen({
      hole: async () => {
        gefragt++;
        return 1;
      },
      melde: () => {},
      umgebung: p.u,
    });
    await p.ruhe();
    assert.equal(gefragt, 0);
    await p.setzeSichtbar(true);
    assert.equal(gefragt, 1);
    stopp();
  });
});
