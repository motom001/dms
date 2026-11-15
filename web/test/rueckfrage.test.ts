/**
 * Eigene Rückfragen (#355): In der Oberfläche gibt es kein `confirm()`, `alert()` oder `prompt()`
 * des Browsers mehr – dafür `rueckfrage()` und `hinweis()` aus `web/src/rueckfrage.tsx`.
 * Diese Prüfung läuft in der CI und verhindert, dass neue Aufrufe hinzukommen.
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, it } from 'node:test';

const WEB = new URL('../../web/src', import.meta.url).pathname;

function dateien(ordner: string): string[] {
  return readdirSync(ordner).flatMap((n) => {
    const p = join(ordner, n);
    if (statSync(p).isDirectory()) return dateien(p);
    return /\.(ts|tsx)$/.test(n) ? [p] : [];
  });
}

/** Kommentare entfernen (grob, reicht für den Zweck): Block- und Zeilenkommentare. */
const ohneKommentare = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

describe('Rückfragen (#355)', () => {
  it('kein confirm(), alert() oder prompt() des Browsers in web/src', () => {
    const funde: string[] = [];
    for (const p of dateien(WEB)) {
      ohneKommentare(readFileSync(p, 'utf8')).split('\n').forEach((z, i) => {
        if (/(^|[^\w.$])(window\.|globalThis\.)?(confirm|alert|prompt)\s*\(/.test(z)) funde.push(`${relative(WEB, p)}:${i + 1}: ${z.trim()}`);
      });
    }
    assert.deepEqual(funde, [], 'Bitte rueckfrage() bzw. hinweis() aus web/src/rueckfrage.tsx verwenden.');
  });

  it('die Prüfung findet einen Aufruf', () => {
    const z = ohneKommentare("onClick={() => { if (confirm('x')) tu(); }} // confirm('kommentar')");
    assert.match(z, /(^|[^\w.$])(window\.|globalThis\.)?(confirm|alert|prompt)\s*\(/);
    assert.doesNotMatch(ohneKommentare('// alert(1)\nconst a = rueckfrage({});'), /(^|[^\w.$])(confirm|alert|prompt)\s*\(/);
  });
});
