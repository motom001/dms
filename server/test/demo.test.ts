/** Demo-Daten für Wachstumstests (#248): Dokumente, Startwert, Pakete, Abschätzung. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ladeBeispiele } from '../src/beispiele';
import { speicherDateien } from '../src/dateispeicher';
import { erzeugeDemo, MAX_DEMO, pruefeDemoOptionen, schaetzeDemo } from '../src/demo';
import { DOKUMENTARTEN, erzeugeDokument, kannRastern, MISCHUNGEN, png, pruefeDokumentOptionen, schaetze } from '../src/demo-dokumente';
import { Dienst } from '../src/dienst';
import { Fachfehler } from '../src/fehler';
import { speicherRepo } from '../src/repo-speicher';
import { Zufall } from '../src/zufall';

const rastern = await kannRastern();
const status = (s: number) => (e: unknown) => e instanceof Fachfehler && e.status === s;
const inhalt = { titel: 'Rechnung R-2025-4711', typ: 'Rechnung', angaben: [['Rechnungsnummer', 'R-2025-4711'], ['Vertragspartner', 'Müller Heizungsbau GmbH']] as Array<[string, string]>, partner: 'Müller Heizungsbau GmbH', betrag: 99.5, datum: '01.02.2025' };

async function aufbau() {
  const d = new Dienst(speicherRepo(), speicherDateien());
  await ladeBeispiele(d);
  return d;
}

describe('Demo-Daten für Wachstumstests (#248)', () => {
  it('prüft die Angaben', () => {
    assert.equal(MAX_DEMO, 50_000);
    assert.equal(pruefeDemoOptionen({ anzahl: 50_000 }).anzahl, 50_000);
    assert.throws(() => pruefeDemoOptionen({ anzahl: 50_001 }), status(422));
    assert.equal(pruefeDemoOptionen({ anzahl: 5 }).dokumente, null);
    const o = pruefeDokumentOptionen({ anteil: 50, von: 1, bis: 2, stufe: 'schwer' })!;
    assert.deepEqual(o.mischung, MISCHUNGEN.schwer);
    assert.throws(() => pruefeDokumentOptionen({ von: 3, bis: 1 }), status(422));
    assert.throws(() => pruefeDokumentOptionen({ mischung: { brief: 0 } }), status(422));
  });

  it('Startwert: gleiche Folge, gleiche Datei', async () => {
    const a = new Zufall('x'), b = new Zufall('x');
    assert.deepEqual([a.zahl(), a.int(100), a.bytes(16)], [b.zahl(), b.int(100), b.bytes(16)]);
    const d1 = await erzeugeDokument(new Zufall('s'), 'brief', inhalt, 'k1', false);
    const d2 = await erzeugeDokument(new Zufall('s'), 'brief', inhalt, 'k1', false);
    assert.ok(d1.inhalt.equals(d2.inhalt), 'gleicher Startwert, gleiche Datei');
    const d3 = await erzeugeDokument(new Zufall('t'), 'brief', inhalt, 'k2', false);
    assert.ok(!d1.inhalt.equals(d3.inhalt));
  });

  it('Briefe tragen die Werte der Mappe; mehrseitige PDFs haben viele Seiten', async () => {
    const b = await erzeugeDokument(new Zufall('b'), 'brief', inhalt, 'k', false);
    assert.equal(b.mime, 'application/pdf');
    assert.match(b.inhalt.subarray(0, 5).toString(), /%PDF-/);
    const m = await erzeugeDokument(new Zufall('m'), 'mehrseitig', inhalt, 'k', false);
    assert.ok(m.seiten >= 2, `nur ${m.seiten} Seiten`);
    // Ohne pdftoppm werden Scans und Bilder zu Briefen.
    assert.equal((await erzeugeDokument(new Zufall('s'), 'scan', inhalt, 'k', false)).art, 'brief');
  });

  it('Scans haben keine Textebene, Bilder sind Bilder', { skip: !rastern && 'pdftoppm fehlt' }, async () => {
    const s = await erzeugeDokument(new Zufall('scan'), 'scan', inhalt, 'k', true);
    assert.equal(s.art, 'scan');
    assert.doesNotMatch(s.inhalt.toString('latin1'), /R-2025-4711/, 'kein Text im PDF');
    const bild = await erzeugeDokument(new Zufall('bild'), 'bild', inhalt, 'k', true);
    assert.match(bild.mime, /^image\/(jpeg|png)$/);
  });

  it('PNG ohne Bibliothek ist gültig', () => {
    const p = png(2, 1, Buffer.from([255, 0, 0, 0, 255, 0]));
    assert.equal(p.subarray(1, 4).toString(), 'PNG');
    assert.ok(p.includes(Buffer.from('IEND')));
  });

  it('erzeugt Mappen mit Dokumenten, reiht Volltext ein und entfernt alles in Paketen', async () => {
    const d = await aufbau();
    const stände: Array<[number, number]> = [];
    const r = await erzeugeDemo(d, { anzahl: 60, startwert: 'test', dokumente: { anteil: 100, von: 1, bis: 2, mischung: { brief: 80, mehrseitig: 20 }, duplikate: 20 } }, null, (f, g) => stände.push([f, g]));
    assert.equal(r.startwert, 'test');
    assert.ok(r.dokumente && r.dokumente.anzahl > 0, 'Dokumente erzeugt');
    assert.ok(r.dokumente!.bytes > 0 && r.dokumente!.seiten >= r.dokumente!.anzahl - r.dokumente!.duplikate);
    assert.equal(r.dokumente!.jeArt.scan + r.dokumente!.jeArt.bild + r.dokumente!.jeArt.gross, 0);
    assert.deepEqual(stände.at(-1)![0], stände.at(-1)![1], 'Fortschritt endet vollständig');
    const demo = (await d.listeMappen()).filter((m) => m.demo);
    let docs = 0;
    for (const m of demo) docs += (await d.holeMappe(m.id)).dokumente.length;
    assert.equal(docs, r.dokumente!.anzahl);

    const entf: number[] = [];
    const e = await d.entferneDemo((f) => entf.push(f), 25);
    assert.equal(e.entfernt, demo.length);
    assert.ok(entf.length >= 3, 'mehrere Pakete');
    assert.equal((await d.listeMappen()).filter((m) => m.demo).length, 0);
  });

  it('schätzt vorab und bricht bei zu wenig Platz gar nicht erst an', async () => {
    const d = await aufbau();
    const o = pruefeDemoOptionen({ anzahl: 1000, dokumente: { anteil: 50, von: 1, bis: 3, stufe: 'schwer' } });
    const knapp = { frei: async () => 1024 ** 3, mindest: async () => 2 * 1024 ** 3 };
    const s = await schaetzeDemo(d, o, knapp);
    assert.ok(s.mappenMitRegister > 0 && s.dokumente!.dokumente > 0 && s.dokumente!.bytes > 0);
    assert.equal(s.reicht, false);
    await assert.rejects(erzeugeDemo(d, o, null, () => {}, knapp), status(507));
    assert.equal((await d.listeMappen()).filter((m) => m.demo).length, 0, 'nichts angelegt');
    const e = schaetze(100, { anteil: 100, von: 1, bis: 1, mischung: { ...MISCHUNGEN.leicht }, duplikate: 0 });
    assert.equal(e.dokumente, 100);
    assert.deepEqual(Object.keys(e.jeArt), [...DOKUMENTARTEN]);
  });
});
