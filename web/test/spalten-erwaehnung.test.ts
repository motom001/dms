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
const namen = { person: () => '', personen: [] };

describe('Zelle eines formatierten Felds mit Erwähnungen (#1333)', () => {
  it('Titel nach den Rechten aus bezuege; nie der gespeicherte', () => {
    const text = `**Siehe** @[](mappe:${LESBAR}), @[Abmahnung](mappe:${VERBORGEN}), @[Alt](mappe:${WEG}) und @[](mappe:${OHNE})`;
    assert.equal(
      zelle('text', mappe(text), typ, bezuege, namen),
      'Siehe @Gemeinsamer Vertrag, @Mappe (nicht sichtbar), @gelöschte Mappe und @Ohne Titel',
    );
  });

  it('leer bleibt leer; lange Texte gekürzt', () => {
    assert.equal(zelle('text', mappe(''), typ, bezuege, namen), '');
    const lang = zelle('text', mappe(`${'a '.repeat(100)}@[](mappe:${LESBAR})`), typ, bezuege, namen);
    assert.ok(lang.length <= 140 && lang.endsWith(' …'), lang);
  });
});

/**
 * Erwähnte Personen (#1333): dieselbe Quelle und Regel wie die Mappe (`Formatiert.tsx`, `Person`) – der Name aus der
 * Personenliste (`/api/personen`: lesbare Benutzer-Mappen, dazu Dienst- und Systemkonten), nicht der Titel der
 * Benutzer-Mappe. Fehlt die Person dort, gilt wie in der Mappe: neue Schreibweise als Mappe, alte (`benutzer:`) als Person.
 */
describe('Zelle eines formatierten Felds mit erwähnten Personen (#1333)', () => {
  const LENA = '00000000-0000-4000-8000-0000000000a1';
  const DEAKTIVIERT = '00000000-0000-4000-8000-0000000000a2';
  const SYSTEM = '00000000-0000-4000-8000-0000000000a3';
  const JONAS = '00000000-0000-4000-8000-0000000000a4';
  const personen = [
    { id: LENA, name: 'Lena Beispiel' },
    { id: DEAKTIVIERT, name: 'Paul Muster', aktiv: false },
    { id: SYSTEM, name: 'Automatisierung', aktiv: false, art: 'system' as const },
  ];
  const mit = { person: () => '', personen };
  // Die Benutzer-Mappe trägt einen anderen Titel – maßgeblich ist wie in der Mappe der Name aus der Personenliste.
  const bezuegeP = {
    ...bezuege,
    [LENA]: { titel: 'Titel der Benutzer-Mappe', typId: 'b' },
    [JONAS]: { titel: '', typId: '', verborgen: true },
  };

  it('Name aus der Personenliste – auch deaktiviert und Systemkonto (ohne Benutzer-Mappe)', () => {
    const text = `@[](mappe:${LENA}), @[](benutzer:${DEAKTIVIERT}) und @[Alt](mappe:${SYSTEM})`;
    assert.equal(zelle('text', mappe(text), typ, bezuegeP, mit), '@Lena Beispiel, @Paul Muster und @Automatisierung');
  });

  it('nicht in der Personenliste: wie in der Mappe, nie der gespeicherte Name', () => {
    const neu = `@[Jonas](mappe:${JONAS}) @[Weg](mappe:${WEG})`;
    assert.equal(zelle('text', mappe(neu), typ, bezuegeP, mit), '@Mappe (nicht sichtbar) @gelöschte Mappe');
    const alt = `@[Jonas](benutzer:${JONAS}) @[Weg](benutzer:${WEG}) @[x](benutzer:${LESBAR})`;
    assert.equal(zelle('text', mappe(alt), typ, bezuegeP, mit), '@Benutzer (nicht sichtbar) @gelöschter Benutzer @Benutzer');
  });
});
