/**
 * „Wohin gehört das?“ ohne KI (#934): Überschrift auf der ersten Seite auch nach 1.500 Zeichen (#1713).
 * Ein erfundener Bericht zur Hauptuntersuchung der erfundenen „Beispielprüf GmbH“ für Lena Muster: Wasserzeichen in fast
 * jeder Zeile, zweispaltiger Kopf, die Überschrift erst darunter.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { TYP_FUND_WOERTER, TYP_FUND_ZEICHEN, typAusText } from '../src/erkennung';

const TYPEN = [
  { id: 'hu', name: 'Hauptuntersuchung' },
  { id: 'r', name: 'Rechnung' },
  { id: 'm', name: 'Mahnung' },
  { id: 'v', name: 'Vertrag' },
];
const WZ = 'BEISPIELPRÜF';
/** Eine Zeile wie bei pdftotext -layout: linke Spalte, viel Leerraum, rechte Spalte; dazwischen das Wasserzeichen. */
const zeile = (links: string, rechts = '') => `${links.padEnd(48)}${WZ}   ${WZ}${' '.repeat(14)}${rechts}`.trimEnd();
const KOPF = [
  zeile('Beispielprüf GmbH · Prüfstraße 1 · 01067 Musterstadt', 'Telefon 0351 000 000'),
  zeile('Akkreditierte Prüfstelle, Kennung D-IS-00000-00', 'www.example.org'),
  zeile(''),
  zeile('Beispielprüf GmbH, Prüfstraße 1, 01067 Musterstadt'),
  zeile('Lena Muster', 'FIN: WVWZZZ1KZAW000001'),
  zeile('Musterweg 2', 'Kennzeichen: MU-LM 123'),
  zeile('01069 Musterstadt', 'Prüfort: Musterstadt'),
  zeile('', 'km-Stand: 91.870'),
  zeile('', 'Hersteller: Beispielwerke'),
  zeile('', 'Typ: Kombi'),
  zeile('', 'zul. Gesamtgewicht: 1.950 kg'),
  zeile('', 'Erstzulassung: 03.04.2019'),
  zeile('', 'Letzte HU: 05/2023'),
  zeile('', 'Werkstatt-Nr.: 0000'),
  zeile(''),
];
const HU = [
  ...KOPF,
  zeile('Hauptuntersuchung gemäß § 29 StVZO', 'Ergebnis: ohne festgestellte Mängel'),
  zeile(''),
  zeile('Nächste Hauptuntersuchung: 05/2027'),
].join('\n');

describe('Überschrift auf der ersten Seite (#1713)', () => {
  it('Wasserzeichen und zweispaltiger Kopf: die Überschrift nach mehr als 1.500 Zeichen zählt', () => {
    assert.ok(HU.indexOf('Hauptuntersuchung') > TYP_FUND_ZEICHEN, 'Aufbau wie im Issue');
    const f = typAusText(HU, TYPEN);
    assert.equal(f?.typId, 'hu');
    assert.equal(f?.wort, 'Hauptuntersuchung');
    assert.match(f!.fundstelle, /^Hauptuntersuchung gemäß § 29 StVZO/);
    // Dasselbe für die Frage „Überschrift fehlt?“ (#1645): nur der eine Typ, derselbe Bereich.
    assert.notEqual(typAusText(HU, [TYPEN[0]]), null);
  });

  it('Wasserzeichen vor der Überschrift in derselben Zeile (Texterkennung ohne Spalten)', () => {
    const ocr = HU.replace(/^ *Hauptuntersuchung gemäß/m, `${WZ} · ${WZ} Hauptuntersuchung gemäß`);
    assert.equal(typAusText(ocr, TYPEN)?.typId, 'hu');
    // Ein Wort, das nur zweimal vorkommt, ist kein Wasserzeichen.
    assert.equal(typAusText('Lena Muster\nBEISPIELPRÜF Hauptuntersuchung\nBEISPIELPRÜF', TYPEN), null);
  });

  it('Wasserzeichen-Wörter verbrauchen das Fenster nicht', () => {
    const fuell = (n: number) => Array.from({ length: n }, (_, i) => `${WZ} ${WZ} ${i} ${WZ}`).join('\n');
    // 150 Zeilen mit je einem gezählten Wort (450 Wasserzeichen-Wörter), dann die Überschrift.
    assert.equal(typAusText(`${fuell(150)}\nHauptuntersuchung`, TYPEN)?.typId, 'hu');
    // Ohne Wasserzeichen: 450 gezählte Wörter sind mehr als eine erste Seite.
    const ohne = Array.from({ length: 150 }, (_, i) => `${10000 + i} ${20000 + i} ${30000 + i}`).join('\n');
    assert.equal(typAusText(`${ohne}\nHauptuntersuchung`, TYPEN), null);
  });

  it('mit Seitenvorschub: die ganze erste Seite mit Text, nicht die zweite', () => {
    const lang = Array.from({ length: TYP_FUND_WOERTER }, (_, i) => `Wort${i}`).join(' ');
    assert.equal(typAusText(`${lang}\nHauptuntersuchung\fSeite 2`, TYPEN)?.typId, 'hu');
    assert.equal(typAusText(`${lang}\fHauptuntersuchung gemäß § 29 StVZO`, TYPEN), null);
    // Ein leeres Deckblatt zählt nicht als erste Seite.
    assert.equal(typAusText(`  \f${'x '.repeat(TYP_FUND_ZEICHEN)}\n\nRechnung\fMahnung`, TYPEN)?.typId, 'r');
  });

  it('Name nur mitten im Satz auf Seite 2: kein Fund – mit und ohne Seitenvorschub', () => {
    const seite1 = HU.replace(/Hauptuntersuchung/g, 'Prüfung');
    const seite2 = 'Bitte bewahren Sie diesen Bericht zur Hauptuntersuchung bei den Fahrzeugpapieren auf.';
    assert.equal(typAusText(`${seite1}\f${seite2}`, TYPEN), null);
    assert.equal(typAusText(`${seite1}\n\n${seite2}`, TYPEN), null);
  });

  it('nach 1.500 Zeichen: kein Fund im fortgesetzten Satz und in Tabellenzeilen mit Betrag', () => {
    const vorn = `${'Sehr geehrte Frau Muster, '.repeat(60)}\n`;
    assert.ok(vorn.length > TYP_FUND_ZEICHEN);
    const satz = 'Der monatliche Abschlag für den neuen Zeitraum beträgt voraussichtlich 118,00 €. Er ist nicht Teil dieser';
    assert.equal(typAusText(`${vorn}${satz}\nRechnung. Eine gesonderte Mitteilung folgt.`, TYPEN), null);
    assert.equal(typAusText(`${vorn}Pos. 1  Überführung      400,00 €\nVertrag und Zubehör        29.450,00 €`, TYPEN), null);
    // Eine echte Überschrift dort zählt, auch nach einer Zeile mit Spaltenlücke.
    assert.equal(typAusText(`${vorn}${satz}.\nRechnung Nr. 4711`, TYPEN)?.typId, 'r');
    assert.equal(typAusText(`${vorn}${zeile('Lena Muster', 'Hersteller: Beispielwerke')}\nRechnung`, TYPEN)?.typId, 'r');
  });

  it('frühere Stellen gewinnen weiter: „Rechnung“ im Betreff vor „Mahnung“ weiter unten', () => {
    const brief = `${KOPF.join('\n')}\nBetreff: Rechnung R-2026-1120\n${zeile('')}\nMahnung\nVertrag`;
    assert.equal(typAusText(brief, TYPEN)?.typId, 'r');
    assert.equal(typAusText('Stadtwerke\nRechnung Nr. 1\nIhr Vertrag WV-1', TYPEN)?.typId, 'r');
  });
});
