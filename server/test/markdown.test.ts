/** Formatierter Text (#53): sicheres Markdown. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { alsText, erwaehnungen, erwaehnung, inline, zerlege } from '../../shared/src/markdown';
import { formatiere, pruefeMappe } from '../../shared/src/model';

describe('Markdown (#53)', () => {
  it('zerlegt Überschriften, Listen, Zitate und Absätze', () => {
    const b = zerlege('# Titel\n\nEin **fetter** und *kursiver* Satz.\n\n- eins\n- zwei\n\n1. erstens\n2. zweitens\n\n> zitiert');
    assert.deepEqual(b.map((x) => x.art), ['ueberschrift', 'absatz', 'liste', 'liste', 'zitat']);
    assert.equal((b[2] as { punkte: unknown[] }).punkte.length, 2);
    assert.equal((b[3] as { nummeriert: boolean }).nummeriert, true);
    assert.deepEqual(inline('a **b** c').map((t) => t.art), ['text', 'fett', 'text']);
  });

  it('erlaubt nur sichere Links und kennt kein HTML', () => {
    assert.equal(inline('[x](https://example.org)')[0].art, 'link');
    assert.equal(inline('[x](mailto:a@b.de)')[0].art, 'link');
    assert.ok(!inline('[x](javascript:alert(1))').some((t) => t.art === 'link'), 'javascript: bleibt Text');
    const html = zerlege('<script>alert(1)</script> <img src=x onerror=alert(1)>');
    assert.equal(html[0].art, 'absatz');
    assert.equal(alsText('<b>x</b>'), '<b>x</b>', 'HTML bleibt sichtbarer Text');
  });

  it('liefert reinen Text und Erwähnungen', () => {
    const id = '11111111-1111-4111-8111-111111111111';
    const md = `## Hinweis\n\nBitte **${'prüfen'}**, ${erwaehnung('Ben Beispiel', id)}!\n\n- [Portal](https://x.de)`;
    assert.equal(alsText(md), 'Hinweis Bitte prüfen, @Ben Beispiel! Portal');
    assert.deepEqual(erwaehnungen(md), [id]);
    assert.equal(formatiere({ key: 'n', label: 'N', typ: 'formatiert' }, '**fett**'), 'fett');
    assert.equal(inline('snake_case_wort').length, 1, 'Unterstriche im Wort sind kein Kursiv');
    const p = pruefeMappe({ felder: [{ key: 'n', label: 'N', typ: 'formatiert', maxLen: 5 }] }, { n: 'zu lang' }, { typVon: () => undefined, doppelt: () => undefined });
    assert.ok(p.felder.n);
  });
});
