/**
 * Einheitliche Symbole (#425): In der Oberfläche keine Emoji, die Systeme bunt zeichnen
 * (⏰, 🔗, ⚠ …). Symbole kommen aus `web/src/Symbol.tsx` (einfarbig, `currentColor`).
 * Diese Prüfung läuft in der CI – wie die Sperre gegen `confirm()` (#355).
 *
 * Verboten ist jedes Zeichen mit der Unicode-Eigenschaft `Emoji_Presentation` und jedes
 * Bildzeichen (`Extended_Pictographic`) ohne nachfolgendes U+FE0E (Textdarstellung).
 * Ausnahme: einfache Pfeile wie ↗ und ↔, die überall als Text erscheinen.
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, it } from 'node:test';

const WEB = new URL('../../web/src', import.meta.url).pathname;

/** Pfeile mit Textdarstellung als Standard; dürfen Textzeichen bleiben (#425). */
const ERLAUBT = new Set(['↔', '↕', '↖', '↗', '↘', '↙']);

const BUNT = /\p{Emoji_Presentation}|\p{Extended_Pictographic}(?!︎)|️/gu;

export function bunteZeichen(text: string): string[] {
  return [...text.matchAll(BUNT)].map((m) => m[0]).filter((z) => !ERLAUBT.has(z));
}

function dateien(ordner: string): string[] {
  return readdirSync(ordner).flatMap((n) => {
    const p = join(ordner, n);
    if (statSync(p).isDirectory()) return dateien(p);
    return /\.(ts|tsx|css)$/.test(n) ? [p] : [];
  });
}

describe('Einheitliche Symbole (#425)', () => {
  it('keine bunten Emoji in web/src', () => {
    const funde: string[] = [];
    for (const p of dateien(WEB)) {
      readFileSync(p, 'utf8').split('\n').forEach((z, i) => {
        const b = bunteZeichen(z);
        if (b.length) funde.push(`${relative(WEB, p)}:${i + 1}: ${b.join(' ')}`);
      });
    }
    assert.deepEqual(funde, [], 'Bitte <Symbol name="…" /> aus web/src/Symbol.tsx verwenden (einfarbig, aria-hidden).');
  });

  it('die Prüfung erkennt bunte Zeichen und lässt Text-Pfeile durch', () => {
    assert.deepEqual(bunteZeichen('⏰ Erinnern'), ['⏰']);
    assert.deepEqual(bunteZeichen('🔗 Link'), ['🔗']);
    assert.deepEqual(bunteZeichen("Einstellungen ⚠"), ['⚠']);
    assert.deepEqual(bunteZeichen('⏱ Messung · ✉ Mail · ♥'), ['⏱', '✉', '♥']);
    assert.deepEqual(bunteZeichen('⚠︎ nur Text'), []);
    assert.deepEqual(bunteZeichen('Handbuch ↗ · a ↔ b · ✓ ✗ → ← ↑ ↓ ★ ☆ ▾'), []);
  });
});
