/**
 * Trefferlisten mit Erwähnungen (#1333): Eine Zelle eines formatierten Felds zeigt den Titel der erwähnten Mappe aus den
 * `bezuege` der Seite – lesbar mit Titel, maskiert „Mappe (nicht sichtbar)“, fehlend „gelöschte Mappe“, wie in der Mappe
 * selbst. Nie ein in Klammern gespeicherter Titel. Beispiele erfunden.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Mappe, Mappentyp } from '../../shared/src/model';

// Die Oberfläche liest beim Laden `location` und den Speicher des Browsers (wie baustein-feld.test.ts).
const g = globalThis as Record<string, unknown>;
const speicher = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, String(v)), removeItem: () => {} };
};
g.location ??= new URL('http://127.0.0.1/');
g.localStorage ??= speicher();
g.sessionStorage ??= speicher();
g.addEventListener ??= () => {};
g.window ??= globalThis;
const { zelle } = await import('../src/ablage/spalten');

const LESBAR = '00000000-0000-4000-8000-000000000001';
const VERBORGEN = '00000000-0000-4000-8000-000000000002';
const WEG = '00000000-0000-4000-8000-000000000003';
const OHNE = '00000000-0000-4000-8000-000000000004';
const typ = {
  id: 't',
  name: 'Vorgang',
  felder: [{ key: 'text', label: 'Beschreibung', typ: 'formatiert' }],
} as unknown as Mappentyp;
const mappe = (text: string) => ({ id: 'm', typId: 't', titel: 'x', werte: { text } }) as unknown as Mappe;
const bezuege = {
  [LESBAR]: { titel: 'Gemeinsamer Vertrag', typId: 't' },
  [VERBORGEN]: { titel: 'nicht sichtbare Mappe', typId: '', verborgen: true },
  [OHNE]: { titel: '', typId: 't' },
};
const person = () => '';

describe('Zelle eines formatierten Felds mit Erwähnungen (#1333)', () => {
  it('Titel nach den Rechten aus bezuege; nie der gespeicherte', () => {
    const text = `**Siehe** @[](mappe:${LESBAR}), @[Abmahnung](mappe:${VERBORGEN}), @[Alt](mappe:${WEG}) und @[](mappe:${OHNE})`;
    assert.equal(
      zelle('text', mappe(text), typ, bezuege, person),
      'Siehe @Gemeinsamer Vertrag, @Mappe (nicht sichtbar), @gelöschte Mappe und @Ohne Titel',
    );
  });

  it('leer bleibt leer; lange Texte gekürzt', () => {
    assert.equal(zelle('text', mappe(''), typ, bezuege, person), '');
    const lang = zelle('text', mappe(`${'a '.repeat(100)}@[](mappe:${LESBAR})`), typ, bezuege, person);
    assert.ok(lang.length <= 140 && lang.endsWith(' …'), lang);
  });
});
