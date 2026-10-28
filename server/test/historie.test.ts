/** Änderungshistorie an der Mappe (#57). */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { speicherDateien } from '../src/dateispeicher';
import { Dienst } from '../src/dienst';
import { speicherEinstellungen } from '../src/einstellungen';
import { speicherRepo } from '../src/repo-speicher';

const ich = { id: '00000000-0000-4000-8000-0000000000aa', rolle: 'admin' };

describe('Historie (#57)', () => {
  it('hält Anlegen, Änderungen je Speichern, Dokumente und Papierkorb fest', async () => {
    const d = new Dienst(speicherRepo(), speicherDateien(), { einstellungen: speicherEinstellungen() });
    const p = await d.legeTypAn({ name: 'Partner', felder: [{ key: 'name', label: 'Name', typ: 'text', pflicht: true }] });
    const t = await d.legeTypAn({ name: 'Vertrag', felder: [
      { key: 'nr', label: 'Nummer', typ: 'text', pflicht: true }, { key: 'betrag', label: 'Betrag', typ: 'betrag' },
      { key: 'partner', label: 'Partner', typ: 'referenz', zielTyp: p.id }, { key: 'pw', label: 'Kennwort', typ: 'passwort' },
    ] });
    const a = await d.legeMappeAn({ typId: p.id, werte: { name: 'Stadtwerke' } }, ich.id);
    const m = await d.legeMappeAn({ typId: t.id, werte: { nr: 'V-1', betrag: { betrag: 10, waehrung: 'EUR' } } }, ich.id);
    await d.aendereMappe(m.id, { werte: { nr: 'V-2', betrag: { betrag: 12.5, waehrung: 'EUR' }, partner: a.id } }, ich.id);
    await d.aendereMappe(m.id, { werte: { nr: 'V-2', betrag: { betrag: 12.5, waehrung: 'EUR' }, partner: a.id } }, ich.id);
    await d.ladeHoch(m.id, { register: 'dokumente', name: 'v.pdf', typ: 'application/pdf' }, Buffer.from('%PDF-1.4 h'), ich.id);
    await d.loescheMappe(m.id, ich.id);
    await d.stelleWiederHer(m.id, ich);
    const h = await d.historie(m.id);
    assert.deepEqual(h.map((e) => e.art), ['wiederhergestellt', 'papierkorb', 'dokument_hochgeladen', 'geaendert', 'angelegt'], 'unverändertes Speichern ohne Eintrag');
    const g = h.find((e) => e.art === 'geaendert')!;
    assert.equal(g.benutzerId, ich.id);
    assert.deepEqual(JSON.parse(JSON.stringify(g.daten.aenderungen).replace(/\u00a0/g, ' ')), [
      { feld: 'nr', label: 'Nummer', alt: 'V-1', neu: 'V-2' },
      { feld: 'betrag', label: 'Betrag', alt: '10,00 €', neu: '12,50 €' },
      { feld: 'partner', label: 'Partner', alt: '', neu: 'Stadtwerke' },
    ]);
    assert.equal(h.find((e) => e.art === 'dokument_hochgeladen')!.daten.dokument, 'v.pdf');
  });

  it('behält die Historie endgültig gelöschter Mappen bis zur Frist', async () => {
    const d = new Dienst(speicherRepo(), speicherDateien(), { einstellungen: speicherEinstellungen() });
    const t = await d.legeTypAn({ name: 'X', felder: [{ key: 'n', label: 'N', typ: 'text' }] });
    const m = await d.legeMappeAn({ typId: t.id, werte: { n: 'a' } }, ich.id);
    await d.setzePapierkorbTage(0);
    await d.loescheMappe(m.id, ich.id);
    assert.equal(await d.historieTage(), 365);
    await d.raeumePapierkorbAuf(Date.now() + 100 * 86_400_000);
    // Die Mappe gibt es nicht mehr; die Historie steht noch im Repo.
    const repo = (d as unknown as { repo: { historie(id: string): Promise<unknown[]> } }).repo;
    assert.equal((await repo.historie(m.id)).length, 2);
    await d.raeumePapierkorbAuf(Date.now() + 400 * 86_400_000);
    assert.equal((await repo.historie(m.id)).length, 0);
    await assert.rejects(d.setzeHistorieTage(-1), /ganze Zahl/);
  });
});
