/** Notizen an Mappen (#55). */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { speicherDateien } from '../src/dateispeicher';
import { Dienst } from '../src/dienst';
import { speicherEinstellungen } from '../src/einstellungen';
import { Fachfehler } from '../src/fehler';
import { speicherRepo } from '../src/repo-speicher';

const anna = '00000000-0000-4000-8000-0000000000aa';
const ben = '00000000-0000-4000-8000-0000000000bb';

describe('Notizen (#55)', () => {
  it('legt an, ändert, löscht (jeder darf), protokolliert, findet und zieht mit in den Papierkorb', async () => {
    const d = new Dienst(speicherRepo(), speicherDateien(), { einstellungen: speicherEinstellungen() });
    const t = await d.legeTypAn({ name: 'Vertrag', felder: [{ key: 'nr', label: 'Nummer', typ: 'text', pflicht: true }] });
    const m = await d.legeMappeAn({ typId: t.id, werte: { nr: 'V-1' } }, anna);
    await assert.rejects(d.legeNotizAn(m.id, '   ', anna), (e: unknown) => e instanceof Fachfehler && e.status === 422);
    const n = await d.legeNotizAn(m.id, 'Kündigung **telefonisch** angekündigt', anna);
    await d.aendereNotiz(n.id, 'Kündigung schriftlich bestätigt', ben);
    assert.equal((await d.holeMappe(m.id)).notizen[0].geaendertVon, ben, 'auch andere dürfen ändern');
    const s = await d.seite({ id: anna, rolle: 'admin' }, { sicht: `typ:${t.id}`, suche: 'schriftlich', notizen: 'true' });
    assert.equal(s.gesamt, 1);
    assert.match((s as { ausschnitte?: Record<string, { dokument: string; text: string }> }).ausschnitte![m.id].text, /\u0002schriftlich\u0003/);
    assert.equal((await d.seite({ id: anna, rolle: 'admin' }, { sicht: `typ:${t.id}`, suche: 'schriftlich' })).gesamt, 0, 'nur mit Haken');

    await d.loescheMappe(m.id, anna);
    await d.stelleWiederHer(m.id, { id: anna, rolle: 'admin' });
    assert.equal((await d.notizen(m.id)).length, 1, 'Notiz kommt mit aus dem Papierkorb');
    await d.loescheNotiz(n.id, ben);
    assert.equal((await d.notizen(m.id)).length, 0);
    const h = (await d.historie(m.id)).filter((e) => e.art === 'notiz').map((e) => e.daten.text);
    assert.deepEqual(h, ['gelöscht: Kündigung schriftlich bestätigt', 'geändert: Kündigung schriftlich bestätigt', 'angelegt: Kündigung telefonisch angekündigt']);
  });
});
