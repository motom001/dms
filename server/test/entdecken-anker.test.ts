/**
 * Anker-Namen werden nie umbenannt oder entfernt, nur neue hinzugefügt (#1307): Rundgänge und Tipps aus Paketen und
 * eigene aus der Werkbank verlassen sich darauf, die Registry vergleicht ihre Kopie der Ankerliste mit Ablago.
 *
 * Gespeichert ist die Liste aller bisherigen Anker in `charakter/anker.json`. Kommt ein Anker hinzu, gehört er im
 * selben PR ans Ende dieser Liste; ein Anker, der aus `shared/entdecken/anker.yaml` verschwindet, macht den Test rot.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { parse } from 'yaml';
import { pruefeAnker } from '../../shared/src/entdecken';

const WURZEL = new URL('../..', import.meta.url).pathname;
const jetzt = pruefeAnker(parse(readFileSync(join(WURZEL, 'shared/entdecken/anker.yaml'), 'utf8'))).anker.map((a) => a.anker);
const bisher = JSON.parse(readFileSync(new URL('./charakter/anker.json', import.meta.url), 'utf8')) as string[];

describe('Anker: nie umbenennen, nur hinzufügen (#1307)', () => {
  it('kein bisheriger Anker fehlt', () => {
    const fehlt = bisher.filter((a) => !jetzt.includes(a));
    assert.deepEqual(fehlt, [], `Anker verschwunden oder umbenannt: ${fehlt.join(', ')} – Anker bleiben, neue kommen dazu.`);
  });
  it('neue Anker stehen in der gespeicherten Liste', () => {
    const neu = jetzt.filter((a) => !bisher.includes(a));
    assert.deepEqual(neu, [], `Neue Anker ans Ende von server/test/charakter/anker.json: ${neu.join(', ')}`);
    assert.equal(new Set(bisher).size, bisher.length, 'keine doppelten Einträge');
  });
});
