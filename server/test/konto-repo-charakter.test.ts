/**
 * Charakterisierung der Konten-Ablage (#1278, Schritt 6b-1): Vor dem Zerlegen von speicherKontoRepo und pgKontoRepo
 * hält dieser Test fest, was beide Ablagen auf dieselbe Folge von Aufrufen über alle Methoden der Schnittstelle
 * KontoRepo antworten – Zeitpunkte und Sitzungs-Ids ersetzt. PostgreSQL nur mit TEST_DATABASE_URL (eigene Datenbank).
 *
 * Erwartung: `test/charakter/konto-repo.json`. Neu schreiben nur, wenn sich das Verhalten bewusst ändert:
 * `CHARAKTER_SCHREIBEN=1 TEST_DATABASE_URL=… npm run test:datei -w server -- test/konto-repo-charakter.test.ts` – dann
 * den Unterschied prüfen.
 */
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { after, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { pgKontoRepo, speicherKontoRepo, type KontoRepo } from '../src/konten/konto-repo';
import { eigeneDatenbank, type EigeneDatenbank } from './hilfe-db';

const DATEI = fileURLToPath(new URL('./charakter/konto-repo.json', import.meta.url));
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const HAUSHALT = id(1);
const maske = (v: unknown) =>
  JSON.parse(
    JSON.stringify(v ?? null, (_k, w: unknown) => (w instanceof Set ? [...w] : w))
      .replace(/\d{4}-\d\d-\d\dT[\d:.]+Z/g, 'ZEIT')
      .replace(/"id":"(?!00000000-0000-4000-8000)[0-9a-f-]{36}"/g, '"id":"SITZUNG"'),
  ) as unknown;

/** Dieselbe Folge von Aufrufen über alle Methoden; je Aufruf Name und Ergebnis (oder Fehlercode). */
async function folge(repo: KontoRepo) {
  const r = repo as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>;
  const aus: Array<[string, unknown]> = [];
  const f = async (name: string, ...a: unknown[]) => {
    try {
      aus.push([name, maske(await r[name](...a))]);
    } catch (e) {
      aus.push([name, { fehler: (e as { code?: string }).code ?? (e as Error).message }]);
    }
  };
  const A = id(10),
    B = id(11),
    C = id(12);
  await f('anzahlBenutzer');
  await f('legeBenutzerAn', { id: A, email: 'anna@example.org', name: 'Anna', passwortHash: 'h1', verwaltung: ['*'] });
  await f('legeBenutzerAn', { id: B, email: 'ben@example.org', name: 'Ben', passwortHash: null });
  await f('legeBenutzerAn', { id: C, email: 'ANNA@example.org', name: 'Doppelt', passwortHash: null });
  await f('anzahlBenutzer');
  await f('holeBenutzer', A);
  await f('holeBenutzer', 'keine-uuid');
  await f('holeHash', 'Anna@Example.org');
  await f('holeHash', 'niemand@example.org');
  await f('aendereBenutzer', B, { name: 'Benjamin', aktiv: false });
  await f('aendereBenutzer', B, { aktiv: true, sprache: 'en', entwicklermodus: true });
  await f('aendereGeschuetzt', A, { verwaltung: [] }, () => 'niemand mehr');
  await f('aendereGeschuetzt', B, { verwaltung: ['sicherung'], aktiv: false }, () => null);
  await f('aendereGeschuetzt', B, { aktiv: true }, () => null);
  await f('setzeAbwesenheit', A, { an: true, von: '2026-01-01', bis: '2026-01-05', vertreterId: B });
  await f('setzeHash', B, 'h2');
  await f('notiereAnmeldung', A);
  await f('holeHash', 'ben@example.org');
  await f('legeDienstkontoAn', { id: id(20), paketId: 'ocr', name: 'Texterkennung' });
  await f('dienstkonto', 'ocr');
  await f('dienstkonto', 'gibt-es-nicht');
  await f('listeDienstkonten');
  await f('legeSystemkontoAn', { id: id(21), kennung: 'automatik', name: 'Automatik' });
  await f('legeSystemkontoAn', { id: id(22), kennung: 'automatik', name: 'Zweiter' });
  await f('systemkonto', 'automatik');
  await f('listeSystemkonten');
  const morgen = new Date(Date.now() + 86_400_000);
  // Sitzungen sortieren nach „zuletzt aktiv“: Zeitpunkte nie im selben Augenblick.
  const pause = () => new Promise((r) => setTimeout(r, 5));
  await f('legeSitzungAn', 's1', A, morgen, { geraet: 'Browser', ip: '127.0.0.1', voll: true });
  await pause();
  await f('legeSitzungAn', 's2', A, morgen, { geraet: 'Handy', ip: '127.0.0.2' });
  await pause();
  await f('legeSitzungAn', 's3', B, morgen, { geraet: 'Laptop', ip: '127.0.0.3', vertretungId: null });
  await pause();
  await f('legeSitzungAn', 'alt', B, new Date(Date.now() - 1000), { geraet: 'Alt', ip: '127.0.0.4' });
  await pause();
  await f('legeSitzungAn', 'sys', id(21), morgen, { geraet: 'x', ip: 'x' });
  await pause();
  await f('holeSitzung', 's1');
  await f('holeSitzung', 'gibt-es-nicht');
  await f('holeAnmeldung', 's1');
  await f('holeAnmeldung', 'alt');
  await f('holeAnmeldung', 'sys');
  await f('beruehreSitzung', 's2');
  await pause();
  await f('setzeSitzungsVerwaltung', 's1', {
    verwaltungSeit: new Date('2026-01-01T00:00:00Z'),
    verwaltungAktiv: new Date('2026-01-01T00:00:00Z'),
  });
  await f('sitzungenImVerwaltungsmodus');
  await f('setzeSitzungsVerwaltung', 's1', { frisch: new Date('2026-01-01T00:00:00Z') });
  await f('holeSitzung', 's1');
  await f('vergissVerwaltungVon', A);
  await f('vergissVerwaltungVon', 'keine-uuid');
  await f('sitzungenImVerwaltungsmodus');
  await f('listeSitzungen', A);
  await f('listeSitzungen', 'keine-uuid');
  await f('listeBenutzer');
  await f('loescheSitzung', 's2');
  await f('loescheSitzungMitId', A, id(99));
  await f('loescheSitzungMitId', 'x', 'y');
  await f('listeSitzungen', A);
  await f('legeVertretungAn', { id: id(30), benutzerId: B, adminId: A, adminName: 'Anna' });
  await f('holeVertretung', id(30));
  await f('holeVertretung', 'keine-uuid');
  await f('ungeseheneVertretungen', B);
  await f('beendeVertretung', id(30));
  await f('beendeVertretung', id(30));
  await f('alleVertretungen');
  await f('markiereGesehen', B);
  await f('ungeseheneVertretungen', B);
  await f('einstellungen', A);
  await f('einstellungen', 'keine-uuid');
  await f('setzeEinstellung', A, 'farbe', { wert: 'blau' });
  await f('setzeEinstellung', A, 'liste', [1, 2]);
  await f('setzeEinstellung', A, 'liste', null);
  await f('merkeVorn', A, 'zuletzt', id(40), 3);
  await f('merkeVorn', A, 'zuletzt', id(41), 3);
  await f('merkeVorn', A, 'zuletzt', id(41), 3);
  await f('merkeVorn', A, 'zuletzt', id(42), 3);
  await f('merkeVorn', A, 'zuletzt', id(43), 3);
  await f('merkeVorn', 'keine-uuid', 'zuletzt', id(43), 3);
  await f('einstellungen', A);
  await f('legeLinkAn', 'l1', B, 'einladung', morgen);
  await f('holeLink', 'l1');
  await f('verbraucheLink', 'l1');
  await f('verbraucheLink', 'l1');
  await f('holeLink', 'gibt-es-nicht');
  await f('loescheLinksVon', B);
  await f('holeLink', 'l1');
  await f('notfallcode');
  await f('setzeNotfallcode', 'nh');
  await f('notfallcode');
  await f('legeLinkAn', 'l2', A, 'zuruecksetzen', morgen);
  await f('loeseNotfallcodeEin', 'falsch', A, 'h3');
  await f('loeseNotfallcodeEin', 'nh', 'keine-uuid', 'h3');
  await f('loeseNotfallcodeEin', 'nh', A, 'h3');
  await f('loeseNotfallcodeEin', 'nh', A, 'h4');
  await f('notfallcode');
  await f('holeHash', 'anna@example.org');
  await f('listeSitzungen', A);
  await f('holeLink', 'l2');
  await f('loescheSitzungenVon', B);
  await f('listeSitzungen', B);
  await f('loescheBenutzer', B);
  await f('holeBenutzer', B);
  await f('listeBenutzer');
  // #1358: Hash nur ersetzen, wenn noch der erwartete gespeichert ist.
  await f('setzeHash', A, 'h5');
  await f('ersetzeHash', A, 'nicht-h5', 'h6');
  await f('ersetzeHash', A, 'h5', 'h6');
  await f('ersetzeHash', id(99), 'h5', 'h6');
  await f('holeHash', 'anna@example.org');
  return aus;
}

const soll = existsSync(DATEI) ? (JSON.parse(readFileSync(DATEI, 'utf8')) as Record<string, unknown>) : {};
const ist: Record<string, unknown> = { ...soll };
const schreibe = () => {
  if (!process.env.CHARAKTER_SCHREIBEN) return;
  mkdirSync(dirname(DATEI), { recursive: true });
  writeFileSync(DATEI, `${JSON.stringify(ist, null, 2)}\n`);
};

describe('Konten-Ablage: dieselbe Folge in beiden Ablagen (#1278, Schritt 6b-1)', () => {
  it('im Arbeitsspeicher', async () => {
    ist.speicher = await folge(speicherKontoRepo());
    schreibe();
    assert.deepEqual(ist.speicher, soll.speicher);
  });

  let db: EigeneDatenbank | undefined;
  after(async () => db?.ende());
  it('in PostgreSQL', { skip: process.env.TEST_DATABASE_URL ? false : 'TEST_DATABASE_URL nicht gesetzt' }, async () => {
    db = await eigeneDatenbank('konto_repo');
    // Die Migrationen legen den Haushalt schon an.
    await db.sql`INSERT INTO haushalte (id, name) VALUES (${HAUSHALT}, 'Test') ON CONFLICT DO NOTHING`;
    ist.pg = await folge(pgKontoRepo(db.sql, HAUSHALT));
    schreibe();
    assert.deepEqual(ist.pg, soll.pg);
  });
});
