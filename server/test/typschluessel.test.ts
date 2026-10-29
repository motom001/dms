/** Schlüssel am Mappentyp (#145). */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { liesDirektlink, linkZuMappe } from '../../shared/src/direktlink';
import { speicherDateien } from '../src/dateispeicher';
import { Dienst } from '../src/dienst';
import { Fachfehler } from '../src/fehler';
import { speicherRepo } from '../src/repo-speicher';

const status = (s: number) => (e: unknown) => e instanceof Fachfehler && e.status === s;

describe('Schlüssel am Mappentyp (#145)', () => {
  it('aus dem Namen, eindeutig, fest nach dem Anlegen; Links überstehen das Umbenennen', async () => {
    const repo = speicherRepo();
    const d = new Dienst(repo, speicherDateien());
    const r = await d.legeTypAn({ name: 'Rechnung Ärzte', felder: [{ key: 'nr', label: 'Nummer', typ: 'text', eindeutig: true }] });
    assert.equal(r.schluessel, 'rechnung_aerzte');
    const r2 = await d.legeTypAn({ name: 'Rechnung-Ärzte', felder: [] });
    assert.equal(r2.schluessel, 'rechnung_aerzte_2');
    await assert.rejects(d.legeTypAn({ name: 'X', schluessel: 'rechnung_aerzte', felder: [] }), status(422));
    await assert.rejects(d.legeTypAn({ name: 'Y', schluessel: '1falsch', felder: [] }), status(422));
    const eigen = await d.legeTypAn({ name: 'Vertrag', schluessel: 'vtg', felder: [] });
    assert.equal(eigen.schluessel, 'vtg');
    // Umbenennen: Schlüssel bleibt, auch wenn ein anderer mitgeschickt wird.
    const um = await d.aendereTyp(r.id, { ...r, name: 'Arztrechnung', schluessel: 'anders' });
    assert.equal(um.name, 'Arztrechnung');
    assert.equal(um.schluessel, 'rechnung_aerzte');
    // Links: mit Schlüssel und weiter mit dem Namen.
    const m = await d.legeMappeAn({ typId: r.id, werte: { nr: 'A-1' } });
    const typen = await d.listeTypen();
    const link = linkZuMappe(typen.find((t) => t.id === r.id)!, m)!;
    assert.match(link, /typ=rechnung_aerzte&nr=A-1/);
    const ok = liesDirektlink(new URL(`http://x${link}`).searchParams, typen);
    assert.ok(ok.ok && ok.link.typ.id === r.id);
    const alt = liesDirektlink(new URLSearchParams('typ=Arztrechnung&nr=A-1'), typen);
    assert.ok(alt.ok && alt.link.typ.id === r.id, 'Name geht weiter');
  });

  it('zieht fehlende Schlüssel nach: Systemtypen zuerst, dann aus dem Namen', async () => {
    const repo = speicherRepo();
    const d = new Dienst(repo, speicherDateien());
    await repo.legeTypAn('00000000-0000-4000-8000-0000000000a1', { name: 'Benutzer', beschreibung: '', titelVorlage: '', felder: [], register: [] });
    await repo.legeTypAn('00000000-0000-4000-8000-0000000000a2', { name: 'Leute', beschreibung: '', titelVorlage: '', felder: [], register: [] }, 'benutzer');
    assert.equal(await d.typSchluesselNachziehen(), 2);
    const typen = await d.listeTypen();
    assert.equal(typen.find((t) => t.system === 'benutzer')!.schluessel, 'benutzer');
    assert.equal(typen.find((t) => t.name === 'Benutzer')!.schluessel, 'benutzer_2');
    assert.equal(await d.typSchluesselNachziehen(), 0);
  });
});
