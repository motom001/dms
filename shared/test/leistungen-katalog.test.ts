/**
 * Leistungskatalog (#1569): Jeder Eintrag ist vollständig – Name in der festen Form, Ergebnisart, Schemas mit Grenzen,
 * Formate und Dateitypen, Zeitgrenze, mindestens ein Testfall, dessen Eingabe zum Schema passt, Testdateien vorhanden,
 * Anzeigename auf Deutsch und Englisch. Dazu die Prüfung der Schemas selbst.
 */
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { describe, it } from 'node:test';
import {
  LEISTUNGEN,
  LEISTUNGSKATALOG,
  NAME_MUSTER,
  TESTDATEIEN,
  dokumentFelder,
  leistung,
  ohneGrenzen,
  pruefe,
  teileDesNamens,
  type Schema,
} from '../src/leistungen';
import deP from '../src/sprachen/de/pakete.json';
import enP from '../src/sprachen/en/pakete.json';

/** Testdateien in der Eingabe durch eine Dokument-Id ersetzen – so kommt sie von außen. */
const alsIds = (w: unknown): unknown =>
  Array.isArray(w)
    ? w.map(alsIds)
    : w && typeof w === 'object'
      ? 'testdatei' in w
        ? '00000000-0000-4000-8000-000000000001'
        : Object.fromEntries(Object.entries(w).map(([k, v]) => [k, alsIds(v)]))
      : w;
const testdateienIn = (w: unknown): string[] =>
  Array.isArray(w)
    ? w.flatMap(testdateienIn)
    : w && typeof w === 'object'
      ? 'testdatei' in w
        ? [String((w as { testdatei: unknown }).testdatei)]
        : Object.values(w).flatMap(testdateienIn)
      : [];

describe('Leistungskatalog (#1569)', () => {
  it('enthält die Leistungen aus dem Konzept', () => {
    for (const n of [
      'dokument.erstellen.aus-text@1',
      'dokument.erstellen.aus-vorlage@1',
      'dokument.umwandeln.pdf@1',
      'dokument.umwandeln.pdfa@1',
      'dokument.bearbeiten.seiten@1',
      'dokument.bearbeiten.zusammenfuegen@1',
      'dokument.bearbeiten.verkleinern@1',
      'dokument.bearbeiten.schwaerzen@1',
      'dokument.lesen.text@1',
      'dokument.lesen.erechnung@1',
      'dokument.lesen.barcode@1',
      'inhalt.erkennen.felder@1',
      'inhalt.erkennen.mappentyp@1',
      'inhalt.beantworten.frage@1',
      'text.uebersetzen@1',
      'text.vektor@1',
      'nachricht.senden.mail@1',
      'nachricht.aufrufen.url@1',
    ])
      assert.ok(Object.hasOwn(LEISTUNGSKATALOG, n), n);
  });

  for (const n of LEISTUNGEN) {
    it(`${n} ist vollständig`, () => {
      const l = leistung(n);
      assert.match(n, NAME_MUSTER);
      const { ohneVersion, gruppe } = teileDesNamens(n);
      assert.ok(['exakt', 'vorschlag', 'intern', 'wirkung'].includes(l.ergebnis));
      // Wirkung nach außen nur bei nachricht.*, nachricht.* immer mit Wirkung; Deutungen (inhalt.*) sind Vorschläge.
      assert.equal(l.ergebnis === 'wirkung', gruppe === 'nachricht');
      if (gruppe === 'inhalt') assert.equal(l.ergebnis, 'vorschlag');
      assert.deepEqual(ohneGrenzen(l.eingabe), [], 'Eingabe mit Grenzen');
      assert.deepEqual(ohneGrenzen(l.ausgabe), [], 'Ausgabe mit Grenzen');
      assert.ok(l.zeitgrenzeS > 0 && l.zeitgrenzeS <= 600);
      for (const f of l.formate) assert.match(f, /^[a-z]+\/[a-z0-9.+-]+$/);
      // Wer Dokumente annimmt, nennt Dateitypen; wer keine annimmt, keine.
      assert.equal(dokumentFelder(l.eingabe).length > 0, l.dateitypen.length > 0, 'Dateitypen passen zu den Dokumentfeldern');
      assert.ok(l.testfaelle.length >= 1, 'mindestens ein Testfall');
      assert.equal(new Set(l.testfaelle.map((f) => f.name)).size, l.testfaelle.length);
      for (const f of l.testfaelle) {
        assert.equal(pruefe(l.eingabe, alsIds(f.eingabe)), null, `Eingabe von ${f.name}`);
        for (const d of testdateienIn(f.eingabe)) {
          assert.ok(Object.hasOwn(TESTDATEIEN, d), d);
          assert.ok(existsSync(new URL(`../leistungen/testdateien/${d}`, import.meta.url)), d);
        }
        if (f.erwartet.format) assert.ok(l.formate.includes(f.erwartet.format), `Format von ${f.name}`);
        if (l.formate.length && l.ergebnis === 'exakt') assert.ok(f.erwartet.format, `${f.name} erwartet eine Datei`);
      }
      const k = `leistung.name.${ohneVersion}`;
      assert.ok((deP as Record<string, string>)[k], `Anzeigename de ${k}`);
      assert.ok((enP as Record<string, string>)[k], `Anzeigename en ${k}`);
    });
  }

  it('jede Testdatei wird gebraucht und liegt bei den Testdateien', () => {
    const benutzt = new Set(LEISTUNGEN.flatMap((n) => leistung(n).testfaelle.flatMap((f) => testdateienIn(f.eingabe))));
    assert.deepEqual([...benutzt].sort(), Object.keys(TESTDATEIEN).sort());
  });
});

describe('Schemas der Leistungen (#1569)', () => {
  const s: Schema = {
    type: 'object',
    properties: {
      text: { type: 'string', maxLength: 5, enum: ['a', 'bb'] },
      n: { type: 'integer', minimum: 1, maximum: 3 },
      liste: { type: 'array', items: { type: 'string', maxLength: 36, format: 'dokument' }, maxItems: 2, minItems: 1 },
      ja: { type: 'boolean' },
    },
    required: ['text'],
    additionalProperties: false,
  };
  const id = '00000000-0000-4000-8000-000000000001';

  it('passt, oder nennt Pfad und Grund', () => {
    assert.equal(pruefe(s, { text: 'a', n: 2, liste: [id], ja: true }), null);
    assert.deepEqual(pruefe(s, {}), { pfad: 'text', grund: 'fehlt' });
    assert.deepEqual(pruefe(s, { text: 'c' }), { pfad: 'text', grund: 'wert' });
    assert.deepEqual(pruefe(s, { text: 'a', x: 1 }), { pfad: 'x', grund: 'unbekannt' });
    assert.deepEqual(pruefe(s, { text: 'a', n: 1.5 }), { pfad: 'n', grund: 'typ' });
    assert.deepEqual(pruefe(s, { text: 'a', n: 4 }), { pfad: 'n', grund: 'zu-gross' });
    assert.deepEqual(pruefe(s, { text: 'a', liste: [] }), { pfad: 'liste', grund: 'zu-kurz' });
    assert.deepEqual(pruefe(s, { text: 'a', liste: [id, id, id] }), { pfad: 'liste', grund: 'zu-lang' });
    assert.deepEqual(pruefe(s, { text: 'a', liste: ['../etc'] }), { pfad: 'liste[0]', grund: 'muster' });
    assert.deepEqual(pruefe(s, null), { pfad: '.', grund: 'typ' });
  });

  it('Dateien statt Dokument-Ids nur im Kern', () => {
    const datei = { inhalt: new Uint8Array([1]), mime: 'application/pdf', name: 'a.pdf' };
    assert.deepEqual(pruefe(s, { text: 'a', liste: [datei] }), { pfad: 'liste[0]', grund: 'typ' });
    assert.equal(pruefe(s, { text: 'a', liste: [datei] }, { dateien: true }), null);
  });

  it('findet fehlende Grenzen und Dokumentfelder', () => {
    assert.deepEqual(dokumentFelder(s), ['liste[]']);
    const ohne = {
      type: 'object',
      properties: { t: { type: 'string', maxLength: 0 } },
      required: ['u'],
      additionalProperties: false,
    } as Schema;
    assert.deepEqual(ohneGrenzen(ohne), ['u', 't']);
  });
});
