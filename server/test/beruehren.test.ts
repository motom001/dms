/** „Zuletzt geändert“ folgt Dokumenten, nicht Notizen (#76). */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { speicherDateien } from '../src/dateispeicher';
import { Dienst } from '../src/dienst';
import { speicherEinstellungen } from '../src/einstellungen';
import { speicherRepo } from '../src/repo-speicher';

const A = '00000000-0000-4000-8000-00000000000a';
const B = '00000000-0000-4000-8000-00000000000b';

describe('Zuletzt geändert (#76)', () => {
  it('Hochladen und Entfernen von Dokumenten zählen als Änderung, Notizen nicht', async () => {
    const d = new Dienst(speicherRepo(), speicherDateien(), { einstellungen: speicherEinstellungen() });
    const t = await d.legeTypAn({ name: 'Beleg', titelVorlage: '{nr} ({geaendert})', felder: [{ key: 'nr', label: 'Nr', typ: 'text', pflicht: true }], register: [
      { key: 'allgemein', name: 'Allgemein', art: 'felder', felder: ['nr'] }, { key: 'dokumente', name: 'Dokumente', art: 'dokumente' },
    ] });
    const m = await d.legeMappeAn({ typId: t.id, werte: { nr: 'B-1' } }, A);
    await d.legeNotizAn(m.id, 'nur eine Notiz', B);
    assert.equal((await d.holeMappe(m.id)).mappe.geaendertVon, A, 'Notiz ändert nichts');
    const { dokument } = await d.ladeHoch(m.id, { register: 'dokumente', name: 'a.pdf' }, Buffer.from('%PDF-1.4 a'), B);
    let x = (await d.holeMappe(m.id)).mappe;
    assert.equal(x.geaendertVon, B);
    assert.ok(x.geaendert >= m.geaendert);
    assert.match(x.titel ?? '', /^B-1 \(\d\d\.\d\d\.\d{4}\)$/, 'Titel mit {geaendert} nachgezogen');
    await d.loescheDokument(dokument.id, A);
    x = (await d.holeMappe(m.id)).mappe;
    assert.equal(x.geaendertVon, A);
  });
});

describe('Löschen vorab prüfen (#79)', () => {
  it('liefert loeschbar wie das Löschen selbst', async () => {
    const d = new Dienst(speicherRepo(), speicherDateien(), { einstellungen: speicherEinstellungen() });
    const p = await d.legeTypAn({ name: 'Partner', felder: [{ key: 'name', label: 'Name', typ: 'text', pflicht: true }] });
    const v = await d.legeTypAn({ name: 'Vertrag', felder: [{ key: 'nr', label: 'Nr', typ: 'text', pflicht: true }, { key: 'partner', label: 'Partner', typ: 'referenz', zielTyp: p.id }] });
    const pm = await d.legeMappeAn({ typId: p.id, werte: { name: 'Stadtwerke' } }, A);
    assert.deepEqual((await d.holeMappe(pm.id)).loeschbar, { ok: true });
    const vm = await d.legeMappeAn({ typId: v.id, werte: { nr: 'V-1', partner: pm.id } }, A);
    const l = (await d.holeMappe(pm.id)).loeschbar;
    assert.equal(l.ok, false);
    assert.match(l.grund ?? '', /verweist noch eine andere Mappe/);
    assert.deepEqual(l.rueckverweise?.map((r) => r.quelleId), [vm.id]);
    await assert.rejects(d.loescheMappe(pm.id, A));
    await d.loescheMappe(vm.id, A);
    assert.deepEqual((await d.holeMappe(pm.id)).loeschbar, { ok: true });
  });
});
