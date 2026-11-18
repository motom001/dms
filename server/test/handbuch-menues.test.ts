/**
 * Menüs der Handbücher je Sprache (#1273): Jedes Handbuch hat ein Menü je Sprache (`mkdocs.yml`, `mkdocs.en.yml`) –
 * getrennt, weil die Titel übersetzt sind. Damit keine Seite nur in einer Sprache im Menü steht, prüft dieser Test,
 * dass beide Menüs dieselben Seiten in derselben Reihenfolge nennen und dass es jede Seite auf Deutsch gibt (eine
 * fehlende englische Seite holt `werkzeuge/sprache_hook.py` aus dem deutschen Ordner). Bei mehr Sprachen neu bewerten.
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const HANDBUECHER = ['benutzer', 'admin', 'installieren', 'entwickler'];
const ordner = (h: string) => fileURLToPath(new URL(`../../docs/handbuch/${h}/`, import.meta.url));

/** Die Seiten im Menü (`nav:`) in ihrer Reihenfolge; Links nach draußen zählen nicht. */
function seitenImMenue(datei: string): string[] {
  const text = readFileSync(datei, 'utf8');
  const start = text.search(/^nav:\s*$/m);
  assert.ok(start >= 0, `${datei}: kein Menü (nav:)`);
  return [...text.slice(start).matchAll(/^\s*-\s+(?:"[^"]*"|'[^']*'|[^:\n]+):\s*"?([\w./-]+\.md)"?\s*$/gm)].map((m) => m[1]!);
}

describe('Menüs der Handbücher je Sprache (#1273)', () => {
  for (const h of HANDBUECHER) {
    it(`${h}: Deutsch und Englisch nennen dieselben Seiten in derselben Reihenfolge`, () => {
      const de = seitenImMenue(`${ordner(h)}mkdocs.yml`);
      const en = seitenImMenue(`${ordner(h)}mkdocs.en.yml`);
      assert.ok(de.length > 0, `${h}: keine Seiten im deutschen Menü gefunden`);
      const nurDe = de.filter((s) => !en.includes(s));
      const nurEn = en.filter((s) => !de.includes(s));
      assert.deepEqual(
        { nurDe, nurEn },
        { nurDe: [], nurEn: [] },
        `${h}: Seiten nur in einem Menü – in mkdocs.yml und mkdocs.en.yml eintragen`,
      );
      assert.deepEqual(en, de, `${h}: Reihenfolge der Menüs weicht ab`);
    });

    it(`${h}: jede Seite im Menü gibt es auf Deutsch`, () => {
      const fehlt = seitenImMenue(`${ordner(h)}mkdocs.yml`).filter((s) => !existsSync(`${ordner(h)}docs/${s}`));
      assert.deepEqual(fehlt, [], `${h}: Seiten fehlen in docs/`);
    });
  }

  it('erkennt Einträge mit und ohne Anführungszeichen, Links nach draußen nicht', () => {
    const datei = fileURLToPath(new URL('../../docs/handbuch/entwickler/mkdocs.yml', import.meta.url));
    const seiten = seitenImMenue(datei);
    assert.ok(seiten.includes('server.md'), 'Titel in Anführungszeichen');
    assert.ok(seiten.includes('entscheidungen/index.md'), 'Seite in einem Unterordner');
    assert.ok(!seiten.some((s) => s.startsWith('http')), 'Links nach draußen');
  });
});
