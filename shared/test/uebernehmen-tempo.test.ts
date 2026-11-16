/**
 * Tempo beim Markieren der Vorschläge (#1255): Bei langen Dokumenten baute `findeBegriff` je Suchbegriff den Text
 * jeder Seite neu und normalisierte dabei jedes Wort erneut. Jetzt wird der Seitentext je Seite einmal gebaut und
 * wiederverwendet. Hier: gleiche Treffer wie die alte Umsetzung (unten als Vergleich nachgebaut) und eine Messung
 * mit 200 Seiten × 400 Wörtern und einem Mappentyp mit 15 Feldern.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { findeBegriff, findeMuster, type Fund, type SchwaerzSeite, type Wort } from '../../shared/src/schwaerzen';
import { stelleVon, textformen } from '../../shared/src/uebernehmen';
import type { Feld, Wert } from '../../shared/src/model';

/* ---------- alte Umsetzung (vor #1255) als Vergleich ---------- */
const norm = (s: string) =>
  s
    .replace(/[\u00AD\u200B-\u200D\u2060\uFEFF]/g, '')
    .replace(/\u00A8/g, '\u0308')
    .normalize('NFKC')
    .toLocaleLowerCase('de-DE')
    .replace(/ß/g, 'ss')
    .replace(/[\u2010\u2011]/g, '-');
function alterSeitentext(woerter: Wort[], kompakt: boolean) {
  let text = '';
  const idx: number[] = [];
  woerter.forEach((w, i) => {
    let t = norm(w[0]);
    if (kompakt) t = t.replace(/[\s-]+/g, '');
    if (!t) return;
    if (!kompakt && text) {
      text += ' ';
      idx.push(-1);
    }
    text += t;
    for (let k = 0; k < t.length; k++) idx.push(i);
  });
  return { text, wortVon: Int32Array.from(idx) };
}
function alteFindeBegriff(seiten: SchwaerzSeite[], begriff: string): Fund[] {
  const b = norm(begriff).replace(/\s+/g, ' ').trim();
  if (!b) return [];
  const bKompakt = b.replace(/[\s-]+/g, '');
  const funde = new Map<string, Fund>();
  seiten.forEach((seite, i) => {
    const varianten: Array<[ReturnType<typeof alterSeitentext>, string]> = [[alterSeitentext(seite.woerter, false), b]];
    if (bKompakt.length >= 4) varianten.push([alterSeitentext(seite.woerter, true), bKompakt]);
    for (const [s, such] of varianten) {
      for (let pos = s.text.indexOf(such); pos >= 0; pos = s.text.indexOf(such, pos + 1)) {
        const r = new Set<number>();
        for (let k = pos; k < pos + such.length; k++) if (s.wortVon[k] >= 0) r.add(s.wortVon[k]);
        const w = [...r].sort((a, b2) => a - b2);
        if (!w.length) continue;
        const f: Fund = { seite: i + 1, text: w.map((k) => seite.woerter[k][0]).join(' '), woerter: w, art: 'begriff' };
        funde.set(`${f.seite}:${f.woerter.join(',')}`, f);
      }
    }
  });
  return [...funde.values()];
}

/* ---------- Testdokument ---------- */
const VORRAT = [
  'Versicherung',
  'Vertrag',
  'Beitrag',
  'Straße',
  'STRASSE',
  'Mül-',
  'ler',
  'Müller',
  'Groß\u00ADmann',
  'Null\u200Bbreite',
  'Lena',
  'Jonas',
  'Petra',
  'Ver\u2011sicherungsnehmer',
  'DE89',
  '3704',
  '0044',
  '0532',
  '0130',
  '00',
  'IBAN:',
  '01.03.2026',
  '1.3.2026',
  '84,20',
  '1.234,56',
  'EUR',
  '€',
  '3',
  'Monate',
  '19',
  '%',
  'ﬁnal',
  'Café',
  'Cafe\u0301',
  'Kündigungsfrist',
  'Policen-Nr.',
  'A-12345',
  'und',
  'der',
  'die',
  'das',
  'mit',
  'zum',
  'am',
  'Seite',
  '-',
  '–',
  'Beispielweg',
  '12',
  '01219',
  'Dresden',
  'lena@example.org',
];

function seiten(anzahl: number, jeSeite: number, saat = 1): SchwaerzSeite[] {
  let s = saat;
  const zufall = () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
  return Array.from({ length: anzahl }, () => ({
    breite: 595,
    hoehe: 842,
    woerter: Array.from({ length: jeSeite }, (_, i): Wort => [
      VORRAT[Math.floor(zufall() * VORRAT.length)],
      (i % 10) * 50,
      Math.floor(i / 10) * 20,
      40,
      12,
    ]),
  }));
}

const BEGRIFFE = [
  'Müller',
  'Grossmann',
  'GROSSMANN',
  'Straße',
  'strasse',
  'Nullbreite',
  'Versicherungsnehmer',
  'Ver-sicherungsnehmer',
  'DE89 3704',
  'DE893704',
  'IBAN: DE89',
  '01.03.2026',
  '84,20 EUR',
  'final',
  'Café',
  'Lena Jonas',
  'der die das',
  'A-12345',
  'A12345',
  'Policen-Nr. A-12345',
  '3 Monate',
  '19 %',
  'ab',
  'xyz nicht da',
  '  ',
  'lena@example.org',
];

describe('Übernehmen: Seitentext je Seite einmal (#1255)', () => {
  it('findeBegriff liefert dieselben Treffer wie vorher', () => {
    const doc = seiten(12, 300, 7);
    for (const b of BEGRIFFE) assert.deepEqual(findeBegriff(doc, b), alteFindeBegriff(doc, b), b);
    // zweiter Durchlauf (aus dem Zwischenspeicher) gleich
    for (const b of BEGRIFFE) assert.deepEqual(findeBegriff(doc, b), alteFindeBegriff(doc, b), b);
  });

  it('Silbentrennung, ß/ss, Bindestriche, Null-Breite, mehrere Wörter', () => {
    const w = (t: string, i: number): Wort => [t, i * 10, 0, 9, 10];
    const doc: SchwaerzSeite[] = [
      {
        breite: 1,
        hoehe: 1,
        woerter: ['Herr', 'Mül-', 'ler', 'GROSSMANN', 'Ver\u2011trag', 'Null\u200Bbreite', 'DE89', '3704', '\u00AD'].map(w),
      },
    ];
    const woerter = (b: string) => findeBegriff(doc, b).map((f) => f.woerter);
    assert.deepEqual(woerter('Müller'), [[1, 2]]);
    assert.deepEqual(woerter('Großmann'), [[3]]);
    assert.deepEqual(woerter('Vertrag'), [[4]]);
    assert.deepEqual(woerter('Ver-trag'), [[4]]);
    assert.deepEqual(woerter('Nullbreite'), [[5]]);
    assert.deepEqual(woerter('DE893704'), [[6, 7]]);
    assert.deepEqual(woerter('Herr Mül'), [[0, 1]]);
  });

  it('Zwischenspeicher folgt dem Wörter-Array: geänderte Seite, neue Treffer', () => {
    const doc: SchwaerzSeite[] = [{ breite: 1, hoehe: 1, woerter: [['Alt', 0, 0, 1, 1]] }];
    assert.equal(findeBegriff(doc, 'Neu').length, 0);
    doc[0] = { ...doc[0], woerter: [['Neu', 0, 0, 1, 1]] };
    assert.equal(findeBegriff(doc, 'Neu').length, 1);
  });

  it('findeMuster unverändert über den Zwischenspeicher', () => {
    const doc = seiten(5, 200, 3);
    const vorher = findeMuster(doc);
    assert.deepEqual(findeMuster(doc), vorher);
    findeBegriff(doc, 'Müller');
    assert.deepEqual(findeMuster(doc), vorher);
  });

  it('Messung: 200 Seiten × 400 Wörter, 15 Felder unter 500 ms', () => {
    const doc = seiten(200, 400, 11);
    const felder: Array<[Pick<Feld, 'typ' | 'beschriftungen'>, Wert, string]> = [
      [{ typ: 'datum' }, '2026-03-01', '… Beginn 01.03.2026 …'],
      [{ typ: 'datum' }, '2027-12-31', ''],
      [{ typ: 'datum' }, '2025-07-04', '… am 4.7.2025'],
      [{ typ: 'betrag' }, { betrag: 84.2, waehrung: 'EUR' } as Wert, '84,20 EUR'],
      [{ typ: 'betrag' }, { betrag: 1234.56, waehrung: 'EUR' } as Wert, ''],
      [{ typ: 'betrag' }, { betrag: 99.99, waehrung: 'EUR' } as Wert, ''],
      [{ typ: 'text' }, 'A-12345', 'Policen-Nr. A-12345'],
      [{ typ: 'text' }, 'Lena Müller', 'Versicherungsnehmer Lena Müller'],
      [{ typ: 'text' }, 'Beispielweg 12', ''],
      [{ typ: 'text' }, 'Nirgendwo', ''],
      [{ typ: 'zahl' }, 3, ''],
      [{ typ: 'prozent' }, 19, '19 %'],
      [{ typ: 'zeitraum' }, { anzahl: 3, einheit: 'monate' } as Wert, '3 Monate'],
      [{ typ: 'text' }, 'DE89 3704 0044 0532 0130 00', 'IBAN: DE89 3704 0044 0532 0130 00'],
      [{ typ: 'text' }, 'lena@example.org', ''],
    ];
    const start = performance.now();
    const stellen = felder.map(([f, w, fs]) => stelleVon(doc, textformen(f, w), fs));
    const ms = performance.now() - start;
    console.log(`# Markieren 200×400, 15 Felder: ${ms.toFixed(0)} ms`);
    assert.ok(stellen.filter(Boolean).length >= 5, 'einige Stellen gefunden');
    assert.ok(ms < 500, `${ms.toFixed(0)} ms`);
  });
});
