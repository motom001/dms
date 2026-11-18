/**
 * Sicherungen auswählen und löschen (#1169, #1310): Keine Sicherung hat einen Sonderschutz – „Alle auswählen“ wählt
 * alle, und gelöscht werden genau die gewählten (nach Namen; eine später hinzugekommene ist nie dabei). Die Rückfrage
 * nennt Anzahl, Zeitraum und Platz; sind alle gewählt, sagt sie, dass danach lokal keine Sicherung mehr da ist.
 * Ohne Browser; das Löschen selbst prüft der Rauchtest „Sicherungen auswählen und gemeinsam löschen“.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import React from 'react';

const g = globalThis as Record<string, unknown>;
const speicher = () => {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
    key: () => null,
    get length() {
      return m.size;
    },
  };
};
g.location = new URL('http://127.0.0.1/werkbank/sicherung');
g.localStorage = speicher();
g.sessionStorage = speicher();
g.addEventListener = () => {};
g.removeEventListener = () => {};
g.dispatchEvent = () => true;
g.window = globalThis;
g.document = {
  title: '',
  querySelector: () => null,
  documentElement: { lang: 'de', dataset: {}, style: { setProperty() {} } },
  addEventListener() {},
  removeEventListener() {},
  createElement: () => ({ style: {} }),
};
g.React = React;
const WEB = new URL('../../web/src/', import.meta.url).href;

type Eintrag = { name: string; bytes: number; meta?: { beginn: string } | null; pruefung?: { ok: boolean } | null };
const { gewaehlteSicherungen, sammelFrage } = (await import(WEB + 'werkbank/SicherungListe.tsx')) as {
  gewaehlteSicherungen: (liste: Eintrag[], auswahl: ReadonlySet<string>) => Eintrag[];
  sammelFrage: (auswahl: Eintrag[], alle: boolean) => { titel: string; text: string; ja: string };
};

const sicherung = (name: string, beginn: string, geprueft = false): Eintrag => ({
  name,
  bytes: 1024 * 1024,
  meta: { beginn },
  pruefung: geprueft ? { ok: true } : null,
});
// Neueste zuerst, die neueste geprüft – früher war sie geschützt (#1169).
const liste = [
  sicherung('2026-11-03_0200-automatisch', '2026-11-03T01:00:00Z', true),
  sicherung('2026-11-02_0200-automatisch', '2026-11-02T01:00:00Z'),
  sicherung('2026-11-01_0900-manuell', '2026-11-01T08:00:00Z'),
];
const ALLE = 'Damit sind alle gewählt: Danach ist lokal keine Sicherung mehr da.';

describe('Sicherungen: alle auswählen, alle löschen – ohne Sonderschutz (#1310)', () => {
  it('„Alle auswählen“ wählt alle, auch die neueste geprüfte', () => {
    const alle = new Set(liste.map((x) => x.name));
    assert.deepEqual(
      gewaehlteSicherungen(liste, alle).map((x) => x.name),
      liste.map((x) => x.name),
    );
  });

  it('gelöscht werden genau die gewählten: keine später hinzugekommene, keine nicht gewählte', () => {
    const auswahl = new Set(liste.map((x) => x.name));
    // Während die Auswahl steht, entsteht eine neue Sicherung (Zeitplan): Sie ist nicht gewählt.
    const neu = sicherung('2026-11-04_0200-automatisch', '2026-11-04T01:00:00Z');
    const danach = [neu, ...liste];
    assert.deepEqual(
      gewaehlteSicherungen(danach, auswahl).map((x) => x.name),
      liste.map((x) => x.name),
    );
    assert.ok(!gewaehlteSicherungen(danach, auswahl).includes(neu));
    // Eine gewählte, die es nicht mehr gibt (schon gelöscht), wird nicht noch einmal gelöscht.
    assert.deepEqual(gewaehlteSicherungen([neu], auswahl), []);
    // Nur zwei gewählt: die dritte bleibt.
    const zwei = new Set([liste[1].name, liste[2].name]);
    assert.deepEqual(
      gewaehlteSicherungen(liste, zwei).map((x) => x.name),
      [liste[1].name, liste[2].name],
    );
  });

  it('Rückfrage: Anzahl, Zeitraum, Platz; sind alle gewählt, dazu „lokal keine Sicherung mehr“', () => {
    const alle = sammelFrage(liste, true);
    assert.equal(alle.titel, '3 Sicherungen löschen?');
    assert.match(alle.text, /^Vom .+ bis .+\. Frei werden etwa 3(,0)? MB\. Sie sind danach endgültig weg\. /);
    assert.ok(alle.text.endsWith(ALLE), alle.text);
    assert.equal(alle.ja, 'Endgültig löschen');
    const teil = sammelFrage(liste.slice(1), false);
    assert.equal(teil.titel, '2 Sicherungen löschen?');
    assert.ok(!teil.text.includes(ALLE), teil.text);
  });
});
