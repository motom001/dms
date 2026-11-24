/**
 * Neues im Tab (#922, Stufe 1): Zahl im Titel des Tabs aus „Zu erledigen“ und „Neue Post“ – nur Zahlen, keine Inhalte.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const g = globalThis as Record<string, unknown>;
g.location = new URL('http://127.0.0.1/');
const leer = { getItem: () => null, setItem() {}, removeItem() {}, clear() {}, key: () => null, length: 0 };
g.localStorage = leer;
g.sessionStorage = leer;
g.addEventListener = () => {};
g.removeEventListener = () => {};
g.window = globalThis;
g.document = {
  title: '',
  documentElement: { lang: 'de', dataset: {}, style: { setProperty() {} } },
  addEventListener() {},
  removeEventListener() {},
};
const { tabTitel, tabZahl, HINTERGRUND_MS } = await import('../src/tabzeichen');

describe('Neues im Tab (#922)', () => {
  it('zählt Zu erledigen und Neue Post', () => {
    assert.equal(tabZahl({ eingang: 1, neuePost: 'np', sichten: { np: 2, andere: 7 } }), 3);
    assert.equal(tabZahl({ eingang: 0, neuePost: null, sichten: { np: 2 } }), 0, 'ohne Ansicht „Neue Post“ nur Zu erledigen');
    assert.equal(tabZahl({ eingang: 0, neuePost: 'np' }), 0);
  });

  it('Titel: Zahl davor, ohne Neues unverändert, ab 100 „99+“', () => {
    assert.equal(tabTitel('Ablago – Ablage', 3), '(3) Ablago – Ablage');
    assert.equal(tabTitel('Ablago – Ablage', 0), 'Ablago – Ablage');
    assert.equal(tabTitel('Ablago – Werkbank', 120), '(99+) Ablago – Werkbank');
  });

  it('im Hintergrund höchstens einmal je Minute', () => {
    assert.equal(HINTERGRUND_MS, 60_000);
  });
});
