/**
 * Einheitliche Symbole (#425): In der Oberfläche keine Emoji, die Systeme bunt zeichnen
 * (⏰, 🔗, ⚠ …). Symbole kommen aus `web/src/Symbol.tsx` (einfarbig, `currentColor`).
 * Diese Prüfung läuft in der CI – wie die Sperre gegen `confirm()` (#355).
 *
 * Verboten ist jedes Zeichen mit der Unicode-Eigenschaft `Emoji_Presentation` und jedes
 * Bildzeichen (`Extended_Pictographic`) ohne nachfolgendes U+FE0E (Textdarstellung).
 * Ausnahme: einfache Pfeile wie ↗ und ↔, die überall als Text erscheinen.
 *
 * Seit #507 auch Textzeichen als Symbol-Ersatz (⌕ ★ ☆ ✓ ✕ ✗ ➜ …) – in Navigation und Knöpfen gehört
 * ein `<Symbol>` hin. Erlaubt sind sie nur in den Dateien unten mit Grund; Kommentarzeilen zählen nicht.
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, it } from 'node:test';

const WEB = new URL('../../web/src', import.meta.url).pathname;
/** Sprachdateien (#473): Texte der Oberfläche stehen dort – dieselben Regeln. */
const SPRACHEN = new URL('../../shared/src/sprachen', import.meta.url).pathname;

/** Pfeile mit Textdarstellung als Standard; dürfen Textzeichen bleiben (#425). */
const ERLAUBT = new Set(['↔', '↕', '↖', '↗', '↘', '↙']);

const BUNT = /\p{Emoji_Presentation}|\p{Extended_Pictographic}(?!︎)|️/gu;

export function bunteZeichen(text: string): string[] {
  return [...text.matchAll(BUNT)].map((m) => m[0]).filter((z) => !ERLAUBT.has(z));
}

/** Textzeichen, die wie ein Symbol benutzt werden (#507). */
const ERSATZ = /[⌕★☆✓✔✕✖✗✘➜➔]/gu;
/** Ausdrücklich erlaubt (#507): Datei → Grund. */
const ERSATZ_ERLAUBT: Record<string, string> = {
  'werkbank/Berechtigungen.tsx': '✓/✗ sind die Werte der Rechte-Tabelle (erteilt/entzogen), kein Schmuck',
  'werkbank/SichtRechte.tsx': '✓/✗ sind die Werte der Rechte-Tabelle (erteilt/entzogen), kein Schmuck',
  'werkbank/Sichten.tsx': '✓/✗ im Meldungstext zu geerbten Rechten wie in der Rechte-Tabelle',
  'wiederherstellen.tsx': 'Statuszeichen ○ ◐ ✓ ✕ der Wiederherstellung (Textseite ohne React-Symbole)',
};

export function ersatzZeichen(text: string): string[] {
  const t = text.trim();
  if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return [];
  return [...text.matchAll(ERSATZ)].map((m) => m[0]);
}

function dateien(ordner: string): string[] {
  return readdirSync(ordner).flatMap((n) => {
    const p = join(ordner, n);
    if (statSync(p).isDirectory()) return dateien(p);
    return /\.(ts|tsx|css|json)$/.test(n) ? [p] : [];
  });
}

describe('Einheitliche Symbole (#425)', () => {
  it('keine bunten Emoji in web/src', () => {
    const funde: string[] = [];
    for (const p of [...dateien(WEB), ...dateien(SPRACHEN)]) {
      readFileSync(p, 'utf8').split('\n').forEach((z, i) => {
        const b = bunteZeichen(z);
        if (b.length) funde.push(`${relative(WEB, p)}:${i + 1}: ${b.join(' ')}`);
      });
    }
    assert.deepEqual(funde, [], 'Bitte <Symbol name="…" /> aus web/src/Symbol.tsx verwenden (einfarbig, aria-hidden).');
  });

  it('keine Textzeichen als Symbol-Ersatz in web/src (#507)', () => {
    const funde: string[] = [];
    for (const p of [...dateien(WEB), ...dateien(SPRACHEN)]) {
      const rel = relative(WEB, p);
      if (ERSATZ_ERLAUBT[rel]) continue;
      readFileSync(p, 'utf8').split('\n').forEach((z, i) => {
        const b = ersatzZeichen(z);
        if (b.length) funde.push(`${rel}:${i + 1}: ${b.join(' ')}`);
      });
    }
    assert.deepEqual(funde, [], 'Statt ⌕ ★ ☆ ✓ ✕ … bitte <Symbol name="…" /> aus web/src/Symbol.tsx (oder Datei mit Grund in ERSATZ_ERLAUBT).');
  });

  it('erkennt Ersatzzeichen, nicht in Kommentaren', () => {
    assert.deepEqual(ersatzZeichen('<span>⌕</span> Erweiterte Suche'), ['⌕']);
    assert.deepEqual(ersatzZeichen("{jetzt ? '★' : '☆'}"), ['★', '☆']);
    assert.deepEqual(ersatzZeichen('✓ erledigt · ✕ · ➜'), ['✓', '✕', '➜']);
    assert.deepEqual(ersatzZeichen('// Kommentar mit ✓'), []);
    assert.deepEqual(ersatzZeichen('Pfeile ↗ → ▾ bleiben'), []);
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
