/**
 * Quarantäne für wackelnde Tests (#900): Auswertung des TAP-Protokolls und die Liste selbst.
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { liesListe, liesTap, werteAus, zusammenfassung, type QuarantaeneEintrag } from './quarantaene';

const TAP = `TAP version 13
# Subtest: Abschnitt A
    # Subtest: stabil
    ok 1 - stabil
      ---
      duration_ms: 1
      ...
    # Subtest: wackelt (\\#1)
    not ok 2 - wackelt (\\#1)
      ---
      error: 'x'
      ...
    # Subtest: übersprungen
    ok 3 - übersprungen # SKIP ohne Datenbank
    1..3
not ok 1 - Abschnitt A
# Subtest: Abschnitt B
    # Subtest: Gruppe
        # Subtest: kaputt
        not ok 1 - kaputt
        1..1
    not ok 1 - Gruppe
    1..1
not ok 2 - Abschnitt B
# Subtest: Abschnitt C
    # Subtest: gut
    ok 1 - gut
    1..1
ok 3 - Abschnitt C
1..3
`;
const eintrag = (name: string, faellig = '2026-12-31'): QuarantaeneEintrag => ({
  name,
  datei: 'x.test.ts',
  issue: 900,
  faellig,
  grund: 'Test',
});

describe('Quarantäne (#900)', () => {
  it('liest den Baum: Untertests stehen vor ihrem Abschnitt, \\# und SKIP entfernt', () => {
    const b = liesTap(TAP);
    assert.deepEqual(
      b.map((k) => [k.name, k.ok]),
      [
        ['Abschnitt A', false],
        ['Abschnitt B', false],
        ['Abschnitt C', true],
      ],
    );
    assert.deepEqual(
      b[0].kinder.map((k) => k.name),
      ['stabil', 'wackelt (#1)', 'übersprungen'],
    );
    assert.deepEqual(
      b[1].kinder[0].kinder.map((k) => [k.name, k.ok]),
      [['kaputt', false]],
    );
  });

  it('ohne Liste: nur die untersten Fehlschläge zählen, mit Pfad', () => {
    const a = werteAus(liesTap(TAP), [], '2026-11-06', 1);
    assert.deepEqual(a.echt, ['Abschnitt A › wackelt (#1)', 'Abschnitt B › Gruppe › kaputt']);
    assert.equal(a.scheitert, true);
  });

  it('Test in Quarantäne bricht nicht ab; ein Abschnitt nimmt alle darin mit; Ergebnis je Eintrag', () => {
    const a = werteAus(liesTap(TAP), [eintrag('wackelt (#1)'), eintrag('Gruppe'), eintrag('gut'), eintrag('umbenannt')], '2026-11-06', 1);
    assert.deepEqual(a.echt, []);
    assert.equal(a.scheitert, false);
    assert.deepEqual(
      a.quarantaene.map((q) => [q.name, q.ergebnis]),
      [
        ['wackelt (#1)', 'fehlgeschlagen'],
        ['Gruppe', 'fehlgeschlagen'],
        ['gut', 'bestanden'],
        ['umbenannt', 'nicht gefunden'],
      ],
    );
    const md = zusammenfassung(a);
    assert.match(md, /\| wackelt \(#1\) \| x\.test\.ts \| #900 \| 2026-12-31 \| fehlgeschlagen \|/);
  });

  it('überfällig: CI scheitert, auch wenn der Test bestanden hat; am Tag der Fälligkeit noch nicht', () => {
    assert.equal(
      werteAus(liesTap(TAP), [eintrag('wackelt (#1)'), eintrag('Gruppe'), eintrag('gut', '2026-11-06')], '2026-11-06', 1).scheitert,
      false,
    );
    const a = werteAus(liesTap(TAP), [eintrag('wackelt (#1)'), eintrag('Gruppe'), eintrag('gut', '2026-11-05')], '2026-11-06', 1);
    assert.equal(a.scheitert, true);
    assert.deepEqual(
      a.quarantaene.filter((q) => q.ueberfaellig).map((q) => q.name),
      ['gut'],
    );
    assert.match(zusammenfassung(a), /2026-11-05 \*\*überfällig\*\*/);
  });

  it('Lauf gescheitert ohne Fehlschlag im Protokoll (Absturz): zählt als Fehler', () => {
    const ok = 'TAP version 13\n# Subtest: a\nok 1 - a\n1..1\n';
    assert.equal(werteAus(liesTap(ok), [], '2026-11-06', 0).scheitert, false);
    assert.deepEqual(werteAus(liesTap(ok), [], '2026-11-06', 1).echt, ['Testlauf mit Exit-Code 1 beendet, ohne Fehlschlag im Protokoll']);
  });

  it('quarantaene.json: vollständig, Datei und Testname gibt es, Fälligkeit höchstens 90 Tage nach heute', () => {
    const heute = Date.now();
    for (const e of liesListe()) {
      assert.ok(e.name && e.grund && Number.isInteger(e.issue) && e.issue > 0, JSON.stringify(e));
      assert.match(e.faellig, /^\d{4}-\d{2}-\d{2}$/);
      const datei = new URL(`./${e.datei}`, import.meta.url);
      assert.ok(existsSync(datei), `${e.datei} fehlt`);
      assert.ok(readFileSync(datei, 'utf8').includes(e.name), `„${e.name}“ steht nicht in ${e.datei}`);
      assert.ok(Date.parse(e.faellig) - heute < 90 * 86_400_000, `${e.name}: Fälligkeit zu weit weg`);
    }
  });
});
