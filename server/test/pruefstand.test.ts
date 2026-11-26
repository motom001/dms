/**
 * Prüfstand Erkennung (#1679, server/werkzeuge/pruefstand/): Satz lesen, Werte vergleichen, Wertung, Bericht mit
 * Vergleich, Auffüllen fürs Ungleichgewicht (#1672) und das PDF der aufgefüllten Dokumente – mit einem winzigen,
 * erfundenen Mini-Satz (Personas, example.org). Der Lauf gegen Ablago steht in pruefstand-lauf.test.ts.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import { miniSatz, type Ergebnis, type Pruefstand } from './pruefstand-hilfen';

const w = (n: string) => new URL(`../werkzeuge/pruefstand/${n}`, import.meta.url).href;
const ps = {
  satz: await import(w('satz.mjs')),
  wertung: await import(w('wertung.mjs')),
  bericht: await import(w('bericht.mjs')),
  fuellen: await import(w('fuellen.mjs')),
  pdf: await import(w('pdf.mjs')),
  cli: await import(w('pruefstand.mjs')),
} as Pruefstand;

const ordner = mkdtempSync(join(tmpdir(), 'pruefstand-'));
after(() => rmSync(ordner, { recursive: true, force: true }));
const wurzel = miniSatz(join(ordner, 'satz'));

const ergebnis = (id: string, x: Partial<Ergebnis> = {}): Ergebnis => ({
  id,
  form: 'pdf',
  seltenheit: 'haeufig',
  erwartet: { typ: 'vertraege:vertrag', typId: 't-v', mappe: 'vertrag_strom', mappeDa: true, absenderMappe: 'org_strom' },
  typen: [{ typ: 'vertraege:vertrag', sicherheit: 0.8, belege: [{ weg: 'kern', sicherheit: 0.6 }] }],
  vorschlag: 'vertraege:vertrag',
  absender: ['org_strom'],
  ziele: ['vertrag_strom'],
  felder: { 'vertrag_strom.vertragsnummer': 'richtig' },
  text: { zeichen: 100 },
  ...x,
});

describe('Prüfstand: Satz lesen (#1679)', () => {
  const satz = ps.satz.liesSatz(wurzel);
  it('liest alle Dokumente nach Datum, ohne feste Zahl, und meldet Dokumente ohne Datei', () => {
    assert.deepEqual(
      satz.dokumente.map((d) => d.id),
      ['a1-01', 'b1-01', 'a1-02'],
    );
    assert.equal(satz.fehler.length, 1);
    assert.match(satz.fehler[0], /a1-03|03-ohne-datei/);
    assert.equal(satz.commit, '');
  });
  it('Grundmappen stehen von Anfang an da, die übrigen entstehen mit ihrem ersten Dokument', () => {
    const { grund, mitDokument } = ps.satz.entstehung(satz);
    assert.deepEqual(grund.sort(), ['haus_becker', 'org_strom', 'org_wasser']);
    assert.equal(mitDokument.get('vertrag_strom'), 'a1-01');
    assert.equal(mitDokument.get('re_wasser'), 'b1-01');
  });
  it('Absender über org_<schlüssel> oder den Namen, Typen über die Aliasse aus pruefstand.yaml', () => {
    assert.equal(ps.satz.absenderMappe(satz, 'strom'), 'org_strom');
    assert.equal(ps.satz.absenderMappe(satz, 'wasserwerk'), 'org_wasser');
    assert.equal(ps.satz.absenderMappe(satz, 'unbekannt'), null);
    assert.equal(ps.satz.typKennung(satz, 'rechnungen:rechnung'), 'rechnung_bestellung:rechnung');
    assert.deepEqual(ps.satz.noetigePakete(satz), ['basis', 'haus', 'rechnung_bestellung', 'vertraege']);
  });
  it('Ungleichgewicht misst die häufigen Stücke des aufgefüllten Typs nicht', () => {
    const a = ps.cli.auswahl(satz, {}, 'vertraege:vertrag');
    assert.deepEqual(
      a.map((x) => `${x.d.id}:${x.messen}`),
      ['a1-01:false', 'b1-01:true', 'a1-02:true'],
    );
    assert.equal(ps.cli.auswahl(satz, { hoechstens: '1' }, null).length, 1);
  });
});

describe('Prüfstand: Werte vergleichen und werten', () => {
  const { gleich, auswerten, bewerte, anteil } = ps.wertung;
  it('vergleicht Beträge, Zeiträume, Verweise, Vorgaben, Texte und Daten', () => {
    assert.ok(gleich({ betrag: 12.5, waehrung: 'EUR' }, { betrag: 12.5, waehrung: 'EUR' }));
    assert.ok(gleich(12.5, { betrag: 12.501, waehrung: 'EUR' }));
    assert.ok(!gleich({ betrag: 12.5, waehrung: 'EUR' }, { betrag: 12.5, waehrung: 'USD' }));
    assert.ok(gleich({ anzahl: 3, einheit: 'monate' }, { anzahl: '3', einheit: 'monate' }));
    assert.ok(gleich({ beispiel: 'org_strom' }, ['org_wasser', 'org_strom']));
    assert.ok(gleich({ vorgabe: 'strom' }, 'vorgabe:strom'));
    assert.ok(gleich('WV-1043', 'wv - 1043'.replace(/ /g, '')));
    assert.ok(gleich('Beispiel  Strom', 'beispiel strom'));
    assert.ok(gleich('2026-01-31', '2026-01-31'));
    assert.ok(!gleich('2026-01-31', '2026-02-01'));
    assert.ok(!gleich('x', null));
  });
  it('zählt nur Messbares und jeden Weg für sich', () => {
    const e = [
      ergebnis('a'),
      ergebnis('b', {
        typen: [
          { typ: 'finanzen:kontoauszug', sicherheit: 0.9, belege: [{ weg: 'aehnlichkeit', sicherheit: 0.9 }] },
          { typ: 'vertraege:vertrag', sicherheit: 0.2, belege: [{ weg: 'kern', sicherheit: 0.2 }] },
        ],
        vorschlag: 'finanzen:kontoauszug',
        fuellTyp: 'finanzen:kontoauszug',
        felder: { 'vertrag_strom.vertragsnummer': 'falsch', 'vertrag_strom.beginn': 'fehlt' },
      }),
      ergebnis('c', { erwartet: { typ: 'x:y', typId: null, mappe: 'm', mappeDa: false, absenderMappe: null }, text: { zeichen: 0 } }),
    ];
    const k = auswerten(e);
    assert.deepEqual(k.gesamt.typ1, { ja: 1, von: 2 });
    assert.deepEqual(k.gesamt.typ3, { ja: 2, von: 2 });
    assert.deepEqual(k.gesamt.sicherFalsch, { ja: 1, von: 2 });
    assert.deepEqual(k.gesamt.fuellVorn, { ja: 1, von: 1 });
    assert.deepEqual(k.gesamt.ziel1, { ja: 2, von: 2 });
    assert.deepEqual(k.gesamt.felder, { ja: 2, von: 4 });
    assert.equal(k.ohneText, 1);
    assert.equal(k.typFehlt, 1);
    assert.equal(k.wege.aehnlichkeit.geliefert, 1);
    assert.deepEqual(k.wege.kern.typ1, { ja: 2, von: 2 });
    assert.equal(anteil(k.gesamt.felder), 50);
    assert.equal(bewerte(e[2]).typ1, null);
  });
});

describe('Prüfstand: Felder je Feldart (#1693)', () => {
  const { feldart, feldarten } = ps.wertung;
  it('Feldart: eingestellte Erkennungsart, Feldart, Format, Nummern an der Bezeichnung, sonst die Feldart', () => {
    assert.equal(feldart({ key: 'x', label: 'X', typ: 'text', erkennung: { art: 'name' } }), 'name');
    assert.equal(feldart({ key: 'faellig_am', label: 'Fällig am', typ: 'datum' }), 'datum');
    assert.equal(feldart({ key: 'von', label: 'Von', typ: 'referenz' }), 'verweis');
    assert.equal(feldart({ key: 'konto', label: 'Konto', typ: 'text', format: 'iban' }), 'iban');
    assert.equal(feldart({ key: 'vertragsnummer', label: 'Vertragsnummer', typ: 'text' }), 'nummer');
    assert.equal(feldart({ key: 'rg', label: 'Rechnungs-Nr.', typ: 'text' }), 'nummer');
    assert.equal(feldart({ key: 'bemerkung', label: 'Bemerkung', typ: 'langtext' }), 'langtext');
    assert.equal(feldart(undefined), '–');
  });
  it('zählt richtig, falsch, fehlt und „sicher“, aber falsch je Feldart; ältere Ergebnisse unter „–“', () => {
    const e = [
      ergebnis('a', {
        felder: { 'm.nr': 'richtig', 'm.datum': 'falsch', 'm.betrag': 'falsch', 'm.netto': 'fehlt' },
        feldInfo: {
          'm.nr': { art: 'nummer', sicherheit: 'hoch' },
          'm.datum': { art: 'datum', sicherheit: 'hoch' },
          'm.betrag': { art: 'betrag', sicherheit: 'niedrig' },
          'm.netto': { art: 'betrag', sicherheit: null },
        },
      }),
      ergebnis('alt'),
    ];
    assert.deepEqual(feldarten(e), {
      nummer: { richtig: 1, falsch: 0, fehlt: 0, sicherFalsch: 0 },
      datum: { richtig: 0, falsch: 1, fehlt: 0, sicherFalsch: 1 },
      betrag: { richtig: 0, falsch: 1, fehlt: 1, sicherFalsch: 0 },
      '–': { richtig: 1, falsch: 0, fehlt: 0, sicherFalsch: 0 },
    });
  });
});

describe('Prüfstand: Bericht mit Vergleich zum letzten', () => {
  const lauf = (name: string, e: Ergebnis[]) => ({
    name,
    satz: { name: 'mini', commit: 'abc', dokumente: e.length },
    ablago: { version: '0.1.0', pakete: [{ id: 'basis', version: '1.0.0' }] },
    lauf: {
      lernen: false,
      auffuellen: name.startsWith('ungleich') ? 50 : null,
      fuellTyp: 'finanzen:kontoauszug',
      ergebnisse: e,
      hinweise: ['org_x: ohne iban'],
    },
  });
  const datei = (n: string, inhalt: unknown) => {
    const f = join(ordner, n);
    writeFileSync(f, JSON.stringify(inhalt));
    return f;
  };
  it('legt JSON und Markdown ab und vergleicht beim nächsten Mal nur gleiche Dokumente', () => {
    const ber = join(ordner, 'berichte');
    const l1 = datei('l1.json', lauf('messen', [ergebnis('a'), ergebnis('b')]));
    const u1 = datei('u1.json', lauf('ungleichgewicht-50', [ergebnis('a')]));
    const r1 = ps.cli.bericht({ ordner: ber, dateien: [l1, u1] }, new Date('2026-11-30T10:00:00Z'));
    assert.deepEqual(r1.hinweise, []);
    const md1 = readFileSync(`${r1.stamm}.md`, 'utf8');
    assert.match(md1, /Commit `abc` · 2 Dokumente/);
    assert.match(md1, /## Bei Ungleichgewicht/);
    assert.match(md1, /Kein früherer Bericht/);
    assert.match(md1, /## Felder je Feldart/);
    assert.match(md1, /\| – \| richtig 100\.0 % \(2\/2\) · falsch 0 · fehlt 0 · „sicher“, aber falsch 0 \|/);
    // Zweiter Lauf: „b“ verliert Platz 1, „neu“ kommt dazu und zählt im Vergleich nicht.
    const schlecht = ergebnis('b', { typen: [{ typ: 'aemter:bescheid', sicherheit: 0.9, belege: [] }] });
    const l2 = datei('l2.json', lauf('messen', [ergebnis('a'), schlecht, ergebnis('neu')]));
    const r2 = ps.cli.bericht({ ordner: ber, dateien: [l2] }, new Date('2026-12-07T10:00:00Z'));
    assert.equal(readdirSync(ber).filter((n) => n.endsWith('.json')).length, 2);
    assert.ok(r2.hinweise.some((h) => /Mappentyp Platz 1 schlechter \(100 % → 50 %, 2 gleiche Dokumente\)/.test(h)));
    assert.ok(r2.hinweise.some((h) => /„sicher“, aber falscher Typ schlechter/.test(h)));
    const md2 = readFileSync(`${r2.stamm}.md`, 'utf8');
    assert.match(md2, /> \*\*Hinweis:\*\*/);
    assert.match(md2, /jetzt nicht: messen: b/);
    assert.match(md2, /org_x: ohne iban/);
  });
});

describe('Prüfstand: Ungleichgewicht auffüllen (#1672)', () => {
  const satz = ps.satz.liesSatz(wurzel);
  const f = ps.fuellen;
  it('verschiebt Daten um Monate (Monatsende bleibt gültig) und macht schlichte Zeilen aus Markdown', () => {
    assert.equal(f.datenZurueck('31.03.2025 und 2025-03-31', 1), '28.02.2025 und 2025-02-28');
    assert.equal(f.datenZurueck('15.01.2025', 3), '15.10.2024');
    assert.deepEqual(f.zeilenAusMarkdown('**Titel**\n| A | B |\n|---|---:|\n| 1 | 2 |'), ['Titel', 'A   B', '1   2']);
  });
  it('Abwandlungen: gleiche Saat gleiches Ergebnis, andere Daten, Nummer und Beträge, gleicher Briefkopf', () => {
    const v = f.vorlagen(satz, 'vertraege:vertrag');
    assert.deepEqual(
      v.map((d) => d.id),
      ['a1-01'],
    );
    const a = f.abwandlung(v[0], 0, { werte: { vertragsnummer: 'ST-100', beginn: '2025-01-01' }, kopf: ['Beispiel Strom AG'] });
    const b = f.abwandlung(v[0], 0, { werte: { vertragsnummer: 'ST-100', beginn: '2025-01-01' }, kopf: ['Beispiel Strom AG'] });
    const c = f.abwandlung(v[0], 1, { kopf: ['Beispiel Strom AG'] });
    assert.deepEqual(a, b);
    assert.equal(a.zeilen[0], 'Beispiel Strom AG');
    assert.equal(a.werte.beginn, '2024-10-01');
    assert.equal(a.werte.vertragsnummer, '1/2024');
    const text = a.zeilen.join('\n');
    assert.ok(!text.includes('ST-100'));
    assert.ok(!text.includes('48,00'));
    assert.notDeepEqual(a.zeilen, c.zeilen);
  });
  it('PDF mit Textebene: Kopf, WinAnsi für Umlaute und Euro, gültiger Verweis auf die xref', () => {
    assert.deepEqual([...ps.pdf.winAnsi('ä€(−)')], [0xe4, 0x80, 0x5c, 0x28, 0x2d, 0x5c, 0x29]);
    const pdf = ps.pdf.pdfAusZeilen(
      Array.from({ length: 70 }, (_, i) => `Zeile ${i}`),
      { titel: 'Probe' },
    );
    const s = pdf.toString('latin1');
    assert.ok(s.startsWith('%PDF-1.4'));
    assert.match(s, /\/Count 2/);
    const start = Number(/startxref\n(\d+)/.exec(s)![1]);
    assert.equal(s.slice(start, start + 4), 'xref');
  });
});
