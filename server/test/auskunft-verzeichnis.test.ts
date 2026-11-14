/**
 * Datenschutz-Auskünfte (#668): Liste aus Historie, bereitliegenden Dateien und offenen Antwortfristen –
 * gelöschte Auskünfte bleiben als Nachweis, Zustand und Frist stimmen, die alte Adresse leitet um.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { auskunftVerzeichnis, istOffen, tageBisFrist, type AuskunftStand, type VerzeichnisQuelle } from '../../shared/src/auskunft';
import { hatMitte, werkbankUmleitung, BEREICHE } from '../../shared/src/werkbankansicht';
import { speicherRepo } from '../src/repo-speicher';

const P = '11111111-1111-4111-8111-111111111111';
const Q = '22222222-2222-4222-8222-222222222222';
const A1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const A2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const A3 = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const bereit = (id: string, mappeId: string, erstellt: string): AuskunftStand => ({ id, mappeId, titel: 'Lena', erstellt, bis: '2099-01-01T00:00:00Z', bytes: 2048, mappen: 2, dokumente: 3, verschluesselt: true, von: 'Markus' });
const erstellt = (auskunft: string, zeit: string, mappeId = P) => ({ mappeId, zeit, benutzerId: 'u1', daten: { text: 'Auskunft nach Art. 15 DSGVO erstellt: 2 Mappen, 3 Dokumente', mappen: 2, dokumente: 3, verschluesselt: true, auskunft } });

function quelle(x: Partial<VerzeichnisQuelle>): VerzeichnisQuelle {
  return { historie: [], bereit: [], fristen: [], titel: new Map([[P, 'Lena Beispiel'], [Q, 'Jonas Beispiel']]), namen: new Map([['u1', 'Markus']]), ...x };
}

describe('Datenschutz-Auskünfte: Verzeichnis (#668)', () => {
  it('bereit, zugestellt, abgerufen und gelöscht aus der Historie – Gelöschte bleiben als Nachweis', () => {
    const v = auskunftVerzeichnis(quelle({
      bereit: [bereit(A1, P, '2026-11-03T10:00:00Z'), bereit(A2, P, '2026-11-02T10:00:00Z')],
      historie: [
        erstellt(A1, '2026-11-03T10:00:00Z'),
        erstellt(A2, '2026-11-02T10:00:00Z'),
        { mappeId: P, zeit: '2026-11-02T11:00:00Z', benutzerId: 'u1', daten: { text: 'Abruf-Link erstellt', zustellung: 'link', link: 'l1', auskunft: A2, ablauf: '2026-12-01T00:00:00Z' } },
        erstellt(A3, '2026-11-01T10:00:00Z', Q),
        { mappeId: Q, zeit: '2026-11-01T12:00:00Z', benutzerId: null, daten: { text: 'Abruf fehlgeschlagen: falscher Abrufcode', zustellung: 'abruf', erfolg: false, auskunft: A3 } },
        { mappeId: Q, zeit: '2026-11-01T13:00:00Z', benutzerId: null, daten: { text: 'Auskunft abgerufen', zustellung: 'abruf', erfolg: true, auskunft: A3 } },
      ],
    }));
    assert.deepEqual(v.map((e) => [e.id, e.zustand]), [[A1, 'bereit'], [A2, 'zugestellt'], [A3, 'abgerufen']]);
    const a3 = v.find((e) => e.id === A3)!;
    assert.equal(a3.titel, 'Jonas Beispiel');
    assert.equal(a3.bereit, undefined, 'ohne Datei');
    assert.equal(a3.verlauf[0].text, 'Auskunft abgerufen', 'Verlauf neueste zuerst');
    assert.equal(a3.verlauf.at(-1)!.von, 'Markus');
    // Ohne Datei und ohne Zustellung: gelöscht (heruntergeladen zählt als zugestellt).
    const weg = auskunftVerzeichnis(quelle({ historie: [erstellt(A1, '2026-11-03T10:00:00Z'), erstellt(A2, '2026-11-02T10:00:00Z'), { mappeId: P, zeit: '2026-11-02T10:05:00Z', benutzerId: 'u1', daten: { text: 'Auskunft heruntergeladen', zustellung: 'download', auskunft: A2 } }] }));
    assert.deepEqual(weg.map((e) => e.zustand), ['geloescht', 'zugestellt']);
  });

  it('zurückgezogener Link ist keine Zustellung', () => {
    const v = auskunftVerzeichnis(quelle({
      bereit: [bereit(A1, P, '2026-11-03T10:00:00Z')],
      historie: [erstellt(A1, '2026-11-03T10:00:00Z'), { mappeId: P, zeit: '2026-11-03T11:00:00Z', benutzerId: 'u1', daten: { text: 'Abruf-Link zurückgezogen', zustellung: 'link', link: 'l1', auskunft: A1 } }],
    }));
    assert.equal(v[0].zustand, 'bereit');
  });

  it('Antwortfrist: an der offenen Auskunft der Person, sonst als Anfrage; laufender Auftrag „in Arbeit“', () => {
    const fristen = [{ id: 'f1', mappeId: P, datum: '2026-12-03', erstellt: '2026-11-03T09:00:00Z' }, { id: 'f2', mappeId: Q, datum: '2026-11-20', erstellt: '2026-10-20T09:00:00Z' }];
    const v = auskunftVerzeichnis(quelle({ bereit: [bereit(A1, P, '2026-11-03T10:00:00Z')], historie: [erstellt(A1, '2026-11-03T10:00:00Z')], fristen, laufend: { id: 'x', titel: 'Auskunft für Jonas Beispiel', gestartet: '2026-11-04T08:00:00Z' } }));
    assert.deepEqual(v.map((e) => [e.art, e.zustand, e.frist]), [['auftrag', 'inArbeit', null], ['auskunft', 'bereit', '2026-12-03'], ['anfrage', 'angefragt', '2026-11-20']]);
    assert.equal(v.find((e) => e.art === 'anfrage')!.titel, 'Jonas Beispiel');
    assert.ok(v.every((e) => istOffen(e.zustand)));
    // Frist vor einer älteren Auskunft wird nicht an diese gehängt.
    const alt = auskunftVerzeichnis(quelle({ bereit: [bereit(A1, P, '2026-11-01T10:00:00Z')], historie: [erstellt(A1, '2026-11-01T10:00:00Z')], fristen: [fristen[0]] }));
    assert.deepEqual(alt.map((e) => e.art), ['anfrage', 'auskunft']);
  });

  it('Tage bis zur Frist', () => {
    assert.equal(tageBisFrist('2026-11-16', '2026-11-04'), 12);
    assert.equal(tageBisFrist('2026-11-04', '2026-11-04'), 0);
    assert.equal(tageBisFrist('2026-11-01', '2026-11-04'), -3);
  });

  it('Werkbank: eigene Einträge in der Gruppe Datenschutz (#1184), Auskünfte mit Mitte, alte Adresse leitet um', () => {
    const pfade = BEREICHE.map((b) => b.pfad);
    assert.ok(pfade.includes('auskuenfte') && pfade.includes('loeschkonzept') && pfade.includes('loeschprotokoll') && !pfade.includes('datenschutz'));
    assert.equal(BEREICHE.find((b) => b.pfad === 'auskuenfte')!.gruppe, 'datenschutz');
    assert.ok(hatMitte('auskuenfte') && !hatMitte('loeschkonzept') && !hatMitte('loeschprotokoll'));
    assert.equal(werkbankUmleitung('datenschutz', undefined, '?mappe=x'), '/werkbank/auskuenfte?mappe=x');
  });

  it('Repo: Historie einer Art, neueste zuerst', async () => {
    const r = speicherRepo();
    await r.historieSchreibe([{ mappeId: P, benutzerId: null, art: 'auskunft', daten: { text: 'eins', auskunft: A1 } }, { mappeId: P, benutzerId: null, art: 'geaendert', daten: {} }, { mappeId: Q, benutzerId: null, art: 'auskunft', daten: { text: 'zwei', auskunft: A2 } }]);
    const h = await r.historieArt('auskunft', 10);
    assert.deepEqual(h.map((x) => x.daten.text), ['zwei', 'eins']);
    assert.equal((await r.historieArt('auskunft', 1)).length, 1);
  });
});
