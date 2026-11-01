/** Werkbank-Formulare (#370): „Verwerfen“ neben Anlegen/Speichern, Esc, ungespeicherte Änderungen. */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { gleicherStand, istGeaendert, leistenknoepfe, verwerfenSchritt } from '../../shared/src/entwurf';

describe('Entwurf in Werkbank-Formularen (#370)', () => {
  it('Vergleich: Schlüsselreihenfolge egal, undefined = fehlt, Listen in Reihenfolge', () => {
    assert.ok(gleicherStand({ a: 1, b: [1, { c: 'x' }] }, { b: [1, { c: 'x' }], a: 1 }));
    assert.ok(gleicherStand({ a: 1, b: undefined }, { a: 1 }));
    assert.ok(!gleicherStand({ a: 1 }, { a: '1' }));
    assert.ok(!gleicherStand([1, 2], [2, 1]));
    assert.ok(!gleicherStand({ a: null }, { a: undefined }));
    assert.ok(!gleicherStand([], {}));
  });

  it('Beispiel „Neuer Nummernkreis“: Anlegen + Entwurf verwerfen schließt, Esc fragt erst nach Eingabe', () => {
    const leer = { schluessel: '', name: '', muster: '{jjjj}{mm}-R{zaehler:7}', start: '1' };
    const getippt = { ...leer, name: 'Rechnungen', schluessel: 'rechnungen' };
    assert.equal(istGeaendert(leer, leer), false);
    assert.equal(istGeaendert(leer, getippt), true);

    const k = leistenknoepfe({ neu: true, geaendert: false }, 'Nummernkreis');
    assert.deepEqual(k.haupt, { text: 'Nummernkreis anlegen', aktiv: true });
    assert.equal(k.verwerfen.text, 'Entwurf verwerfen');
    assert.equal(k.verwerfen.aktiv, true, 'bei „Neu“ immer aktiv – es schließt');
    assert.equal(k.status, '');
    assert.equal(leistenknoepfe({ neu: true, geaendert: true, ungueltig: true }, 'Nummernkreis').haupt.aktiv, false);

    assert.deepEqual(verwerfenSchritt({ neu: true, geaendert: false }, 'esc'), { aktion: 'schliessen', rueckfrage: false });
    assert.deepEqual(verwerfenSchritt({ neu: true, geaendert: true }, 'esc'), { aktion: 'schliessen', rueckfrage: true });
    assert.deepEqual(verwerfenSchritt({ neu: true, geaendert: true }, 'knopf'), { aktion: 'schliessen', rueckfrage: false });
  });

  it('Beispiel „Nummernkreis bearbeiten“: Speichern und Verwerfen erst nach einer Änderung', () => {
    const gespeichert = { name: 'Rechnungen', muster: 'R{zaehler}', start: '1' };
    const ohne = leistenknoepfe({ neu: false, geaendert: istGeaendert(gespeichert, { ...gespeichert }) }, 'Nummernkreis');
    assert.deepEqual(ohne.haupt, { text: 'Nummernkreis speichern', aktiv: false });
    assert.equal(ohne.verwerfen.text, 'Änderungen verwerfen');
    assert.equal(ohne.verwerfen.aktiv, false);
    assert.deepEqual(verwerfenSchritt({ neu: false, geaendert: false }, 'esc'), { aktion: 'nichts', rueckfrage: false });

    const geaendert = istGeaendert(gespeichert, { ...gespeichert, muster: 'RE{zaehler}' });
    const mit = leistenknoepfe({ neu: false, geaendert }, 'Nummernkreis');
    assert.equal(mit.haupt.aktiv, true);
    assert.equal(mit.verwerfen.aktiv, true);
    assert.equal(mit.status, 'Ungespeicherte Änderungen');
    assert.deepEqual(verwerfenSchritt({ neu: false, geaendert }, 'knopf'), { aktion: 'zuruecksetzen', rueckfrage: false });
    assert.deepEqual(verwerfenSchritt({ neu: false, geaendert }, 'esc'), { aktion: 'zuruecksetzen', rueckfrage: true });

    const sendet = leistenknoepfe({ neu: false, geaendert, sendet: true }, 'Nummernkreis');
    assert.deepEqual(sendet.haupt, { text: 'Speichere …', aktiv: false });
    assert.equal(sendet.verwerfen.aktiv, false);
    assert.equal(leistenknoepfe({ neu: false, geaendert: true }).haupt.text, 'Speichern');
    assert.equal(leistenknoepfe({ neu: false, geaendert: false, speicherbar: true }).haupt.aktiv, true, 'z. B. fehlende Paket-Einstellungen');
  });

  it('alle Werkbank-Formulare nutzen die gemeinsame Speicherleiste', () => {
    const wb = new URL('../../web/src/werkbank', import.meta.url).pathname;
    const erwartet = ['Nummernkreise', 'Benutzer', 'Postfaecher', 'Eingangsordner', 'Anmeldeschutz', 'Aufgaben', 'Datenbank', 'Sicherung', 'Speicherplatz', 'PaketEinstellungen', 'Sichten', 'Designs', 'Betrieb', 'Texterkennung', 'Ansicht'];
    const dateien = new Set(readdirSync(wb).map((d) => d.replace(/\.tsx$/, '')));
    for (const f of erwartet) {
      assert.ok(dateien.has(f), f);
      const q = readFileSync(join(wb, `${f}.tsx`), 'utf8');
      assert.match(q, /<Speicherleiste\b/, `${f}.tsx ohne <Speicherleiste>`);
      assert.match(q, /useEntwurf\(/, `${f}.tsx ohne useEntwurf`);
    }
    for (const f of ['../einrichtung/Einrichtung.tsx', '../ablage/Papierkorb.tsx']) assert.match(readFileSync(join(wb, f), 'utf8'), /<Speicherleiste\b/, f);
  });
});
