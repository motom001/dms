/** Schnell finden auf der Startseite (#497): Grund des Treffers, Gruppen, Suche über alle lesbaren Mappen. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Mappentyp } from '../../shared/src/model';
import { gruppiereTreffer, suchWoerter, trefferGrund } from '../../shared/src/schnellsuche';
import { speicherDateien } from '../src/dateispeicher';
import { Dienst } from '../src/dienst';
import { speicherEinstellungen } from '../src/einstellungen';
import { speicherRepo } from '../src/repo-speicher';

const typ = (id: string, name: string, felder: Mappentyp['felder']) => ({ id, name, felder, register: [] }) as unknown as Mappentyp;
const kfz = typ('k', 'Versicherung', [{ key: 'name', label: 'Bezeichnung', typ: 'text' }, { key: 'nr', label: 'Vertragsnummer', typ: 'text' }, { key: 'pw', label: 'Passwort', typ: 'passwort' }]);
const auto = typ('a', 'Fahrzeug', [{ key: 'kz', label: 'Kennzeichen', typ: 'text' }]);

describe('Schnell finden (#497)', () => {
  it('nennt das passende Feld, nie ein Passwort', () => {
    const m = { werte: { name: 'Kfz-Versicherung', nr: 'KV-123456', pw: 'KV-geheim' } };
    assert.deepEqual(trefferGrund(m, kfz, suchWoerter('kv-123')), { feld: 'Vertragsnummer', wert: 'KV-123456' });
    assert.deepEqual(trefferGrund(m, kfz, suchWoerter('KFZ')), { feld: 'Bezeichnung', wert: 'Kfz-Versicherung' });
    assert.equal(trefferGrund({ werte: { pw: 'geheim' } }, kfz, ['geheim']), null);
  });

  it('gruppiert nach Typ, Titeltreffer zuerst', () => {
    const t = (id: string) => (id === 'k' ? kfz : auto);
    const g = gruppiereTreffer([
      { id: '1', typId: 'a', titel: 'Golf', werte: { kz: 'DD-KV 12' } },
      { id: '2', typId: 'k', titel: 'Haftpflicht', werte: { nr: 'KV-1' } },
      { id: '3', typId: 'k', titel: 'KV Auto', werte: { nr: 'KV-2' } },
    ], t, suchWoerter('kv'));
    assert.deepEqual(g.map((x) => x.name), ['Versicherung', 'Fahrzeug']);
    assert.deepEqual(g[0].treffer.map((x) => x.m.id), ['3', '2']);
    assert.deepEqual(g[1].treffer[0].grund, { feld: 'Kennzeichen', wert: 'DD-KV 12' });
  });

  it('Suche über alle Mappentypen (Ansicht „suche“ ohne Bedingungen) findet Feldwerte', async () => {
    const d = new Dienst(speicherRepo(), speicherDateien(), { einstellungen: speicherEinstellungen() });
    const v = await d.legeTypAn({ name: 'Versicherung', felder: [{ key: 'name', label: 'Bezeichnung', typ: 'text', pflicht: true }, { key: 'nr', label: 'Vertragsnummer', typ: 'text' }], register: [{ key: 'a', name: 'Allgemein', art: 'felder', felder: ['name', 'nr'] }] });
    const f = await d.legeTypAn({ name: 'Fahrzeug', felder: [{ key: 'kz', label: 'Kennzeichen', typ: 'text', pflicht: true }], register: [{ key: 'a', name: 'Allgemein', art: 'felder', felder: ['kz'] }] });
    await d.legeMappeAn({ typId: v.id, werte: { name: 'Kfz-Versicherung', nr: 'KV-123456' } }, null);
    await d.legeMappeAn({ typId: f.id, werte: { kz: 'DD-AB 123' } }, null);
    await d.legeMappeAn({ typId: v.id, werte: { name: 'Hausrat', nr: 'HR-9' } }, null);
    const s = await d.seite({ id: 'x', rolle: 'admin' }, { sicht: 'suche', link: '', suche: '123' });
    assert.equal(s.gesamt, 2);
    assert.deepEqual(new Set(s.mappen.map((m) => m.typId)), new Set([v.id, f.id]));
  });
});
