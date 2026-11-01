/** Demo-Daten in der Oberfläche (#365): Mischung bleibt bei 100 %, von ≤ bis, Abschätzung live. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DOKUMENTARTEN, JE_MAPPE_STUFEN, MAX_DEMO_DOKUMENTE, MAX_JE_MAPPE, mengenWarnung, MISCHUNGEN, normiereMischung, schaetze, schaetzeMenge,
  stelleMischung, stelleVonBis, stufeVon, verteilung, type Mischung,
} from '../../shared/src/demodaten';
import { ladeBeispiele } from '../src/beispiele';
import { speicherDateien } from '../src/dateispeicher';
import { erzeugeDemo, schaetzeDemo } from '../src/demo';
import { pruefeDokumentOptionen } from '../src/demo-dokumente';
import { Dienst } from '../src/dienst';
import { Fachfehler } from '../src/fehler';
import { speicherRepo } from '../src/repo-speicher';

const summe = (m: Mischung) => DOKUMENTARTEN.reduce((a, k) => a + m[k], 0);
const status = (s: number) => (e: unknown) => e instanceof Fachfehler && e.status === s;

describe('Demo-Daten: Regler und Abschätzung (#365)', () => {
  it('Mischung: ein Regler bewegt, die anderen passen sich an, Summe immer 100', () => {
    for (const m of Object.values(MISCHUNGEN)) assert.equal(summe(m), 100);
    const r = MISCHUNGEN.realistisch; // 45/20/20/14/1
    const a = stelleMischung(r, 'brief', 65);
    assert.equal(a.brief, 65);
    assert.equal(summe(a), 100);
    // Die anderen behalten ihr Verhältnis (20:20:14:1 auf 35).
    assert.equal(a.mehrseitig, a.scan);
    assert.ok(a.mehrseitig > a.bild && a.bild > a.gross);
    assert.deepEqual(stelleMischung(r, 'gross', 100), { brief: 0, mehrseitig: 0, scan: 0, bild: 0, gross: 100 });
    // Alle anderen auf 0: der Rest wird gleich verteilt.
    const b = stelleMischung({ brief: 100, mehrseitig: 0, scan: 0, bild: 0, gross: 0 }, 'brief', 60);
    assert.deepEqual(b, { brief: 60, mehrseitig: 10, scan: 10, bild: 10, gross: 10 });
    // Unmögliche Werte werden begrenzt.
    assert.equal(stelleMischung(r, 'scan', 150).scan, 100);
    assert.equal(stelleMischung(r, 'scan', -5).scan, 0);
    // Viele kleine Schritte hintereinander: nie ≠ 100.
    let m = r;
    for (const [i, art] of DOKUMENTARTEN.entries()) for (const w of [3, 97, 33, 50, 7]) { m = stelleMischung(m, art, (w + i * 11) % 101); assert.equal(summe(m), 100); }
  });

  it('Gewichte (z. B. 55/20/20/14/1 = 110) werden zu Prozent mit Summe 100', () => {
    const n = normiereMischung({ brief: 55, mehrseitig: 20, scan: 20, bild: 14, gross: 1 });
    assert.equal(summe(n), 100);
    assert.equal(n.brief, 50);
    assert.deepEqual(normiereMischung({ brief: 50, mehrseitig: 50, scan: 50, bild: 50, gross: 50 }), { brief: 20, mehrseitig: 20, scan: 20, bild: 20, gross: 20 });
    assert.equal(summe(normiereMischung({})), 100);
  });

  it('Dokumente je Mappe: von ≤ bis, Stufen nicht linear bis 250', () => {
    assert.deepEqual(stelleVonBis({ von: 1, bis: 3 }, 'von', 5), { von: 5, bis: 5 });
    assert.deepEqual(stelleVonBis({ von: 5, bis: 10 }, 'bis', 2), { von: 2, bis: 2 });
    assert.deepEqual(stelleVonBis({ von: 1, bis: 3 }, 'bis', 999), { von: 1, bis: MAX_JE_MAPPE });
    assert.equal(JE_MAPPE_STUFEN[0], 1);
    assert.equal(JE_MAPPE_STUFEN.at(-1), 250);
    assert.ok(JE_MAPPE_STUFEN.slice(0, 5).every((s, i) => s === i + 1), 'kleine Werte einzeln');
    assert.equal(JE_MAPPE_STUFEN[stufeVon(3)], 3);
    assert.equal(JE_MAPPE_STUFEN[stufeVon(48)], 50);
    // Server: bis 250 erlaubt, darüber nicht; bis < von weiterhin abgelehnt.
    assert.equal(pruefeDokumentOptionen({ von: 100, bis: 250 })!.bis, 250);
    assert.throws(() => pruefeDokumentOptionen({ von: 1, bis: 251 }), status(422));
    assert.throws(() => pruefeDokumentOptionen({ anteil: 150 }), status(422));
    assert.throws(() => pruefeDokumentOptionen({ von: 3, bis: 1 }), status(422));
  });

  it('Verteilung ergibt genau die Anzahl; Abschätzung wie auf dem Server', async () => {
    const d = new Dienst(speicherRepo(), speicherDateien());
    await ladeBeispiele(d);
    const typen = await d.listeTypen();
    const eigene = typen.filter((t) => !t.system);
    for (const n of [40, 1000, 4711]) assert.equal([...verteilung(eigene, n).values()].reduce((a, b) => a + b, 0), n);
    const o = { anzahl: 1000, dokumente: { anteil: 30, von: 1, bis: 3, mischung: MISCHUNGEN.realistisch, duplikate: 0 } };
    const lokal = schaetzeMenge(typen, o);
    const server = await schaetzeDemo(d, o);
    assert.deepEqual([lokal.mappen, lokal.mappenMitRegister, lokal.dokumente], [server.mappen, server.mappenMitRegister, server.dokumente]);
    assert.equal(lokal.dokumente!.dokumente, schaetze(lokal.mappenMitRegister, o.dokumente).dokumente);
    // Schieben ändert die Abschätzung.
    const mehr = schaetzeMenge(typen, { ...o, dokumente: { ...o.dokumente, anteil: 60 } });
    assert.ok(mehr.dokumente!.dokumente > lokal.dokumente!.dokumente);
    const schwer = schaetzeMenge(typen, { ...o, dokumente: { ...o.dokumente, mischung: MISCHUNGEN.schwer } });
    assert.ok(schwer.dokumente!.bytes > lokal.dokumente!.bytes);
    assert.equal(schaetzeMenge(typen, { anzahl: 10 }).dokumente, null);
  });

  it('warnt bei großen Mengen und lehnt zu viele Dokumente je Lauf ab', async () => {
    const d = new Dienst(speicherRepo(), speicherDateien());
    await ladeBeispiele(d);
    const typen = await d.listeTypen();
    const klein = schaetzeMenge(typen, { anzahl: 100, dokumente: { anteil: 30, von: 1, bis: 3, mischung: MISCHUNGEN.leicht, duplikate: 0 } });
    assert.equal(mengenWarnung(klein), null);
    const gross = schaetzeMenge(typen, { anzahl: 5000, dokumente: { anteil: 100, von: 10, bis: 20, mischung: MISCHUNGEN.leicht, duplikate: 0 } });
    assert.match(mengenWarnung(gross)!, /Stunden/);
    const zuviel = { anzahl: 50_000, dokumente: { anteil: 100, von: 100, bis: 250, mischung: MISCHUNGEN.leicht, duplikate: 0 } };
    assert.ok(schaetzeMenge(typen, zuviel).dokumente!.dokumente > MAX_DEMO_DOKUMENTE);
    assert.match(mengenWarnung(schaetzeMenge(typen, zuviel))!, /nicht möglich/);
    await assert.rejects(erzeugeDemo(d, zuviel, null), status(422));
  });
});
