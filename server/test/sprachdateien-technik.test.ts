/**
 * Keine technischen Werte in den Sprachdateien (#1264): Content-Security-Policy, Permissions-Policy, Cache-Control,
 * Content-Disposition und SQL gehören als Konstanten in den Code. `t()` richtet sich nach der Sprache der Anfrage – eine
 * Übersetzung (neue Sprache, Korrektur, automatischer Lauf) würde sie sonst still nur für diese Sprache ändern, im
 * schlimmsten Fall ohne Sandbox für hochgeladene Dateien oder mit kaputtem Schreibbefehl an die Datenbank.
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const SPRACHEN = new URL('../../shared/src/sprachen', import.meta.url).pathname;

/** Muster, die nur in technischen Werten vorkommen – mit Namen für die Meldung. */
const MUSTER: Array<[string, RegExp]> = [
  ['CSP-Quelle', /'(self|none|unsafe-inline|unsafe-eval)'/],
  ['CSP-Anweisung', /\b(default|script|style|img|font|connect|frame|worker|object)-src\b|\bframe-ancestors\b|\bbase-uri\b|\bform-action\b/],
  ['Permissions-Policy', /\b(geolocation|microphone|camera|payment|usb)=\(\)/],
  ['Cache-Control', /\bmax-age=|\bmust-revalidate\b|\bno-store\b/],
  ['Content-Disposition', /filename\*?=/],
  [
    'SQL',
    /\b(SELECT\s+\S+\s+FROM|INSERT\s+INTO|DELETE\s+FROM|UPDATE\s+\w+\s+SET)\b|\b(date_trunc|clock_timestamp|haushalt_id)\b|\bStartSel=/,
  ],
];

function werte(): Array<{ datei: string; schluessel: string; wert: string }> {
  const aus: Array<{ datei: string; schluessel: string; wert: string }> = [];
  for (const sprache of readdirSync(SPRACHEN)) {
    let dateien: string[];
    try {
      dateien = readdirSync(join(SPRACHEN, sprache)).filter((f) => f.endsWith('.json'));
    } catch {
      continue;
    }
    for (const f of dateien) {
      const d = JSON.parse(readFileSync(join(SPRACHEN, sprache, f), 'utf8')) as Record<string, unknown>;
      for (const [k, w] of Object.entries(d)) if (typeof w === 'string') aus.push({ datei: `${sprache}/${f}`, schluessel: k, wert: w });
    }
  }
  return aus;
}

describe('Sprachdateien ohne technische Werte (#1264)', () => {
  it('keine CSP, Permissions-Policy, Cache-Control, Content-Disposition oder SQL', () => {
    const alle = werte();
    assert.ok(alle.length > 1000, 'Sprachdateien gefunden');
    const funde = alle.flatMap((x) =>
      MUSTER.filter(([, re]) => re.test(x.wert)).map(([name]) => `${x.datei} ${x.schluessel} (${name}): ${x.wert.slice(0, 80)}`),
    );
    assert.deepEqual(funde, [], `Technische Werte gehören als Konstanten in den Code:\n${funde.join('\n')}`);
  });

  it('die Prüfung erkennt die früheren Werte', () => {
    const frueher = [
      "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
      "frame-ancestors 'self'{map}",
      'geolocation=(), microphone=(), payment=(), usb=()',
      'private, max-age=60',
      '{wert}; filename="{ascii}"; filename*=UTF-8\'\'{x}',
      "greatest(date_trunc('milliseconds', clock_timestamp()), date_trunc('milliseconds', geaendert) + interval '1 millisecond')",
      'id, haushalt_id, mappe_id',
      'StartSel={A}, StopSel={B}',
    ];
    for (const w of frueher)
      assert.ok(
        MUSTER.some(([, re]) => re.test(w)),
        w,
      );
  });
});
