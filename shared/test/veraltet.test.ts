/**
 * Veraltete Oberfläche (#933): wann eine fehlende Datei als „veraltet“ zählt, wann die Seite sich selbst neu lädt
 * (Schutz gegen eine Schleife) – und dass eine Seite mit altem Stand gegen einen neuen Server die neue Version erkennt.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Erreichbarkeit, type Gesundheit } from '../../shared/src/erreichbarkeit';
import { automatischNeuLaden, darfNeuLaden, istOberflaechenDatei, NEU_LADEN_ABSTAND_MS } from '../../shared/src/veraltet';

const URSPRUNG = 'https://ablago.example.org';

describe('Veraltete Oberfläche (#933)', () => {
  it('fehlendes Stylesheet, Skript oder vorgeladenes Modul der Oberfläche zählt', () => {
    assert.equal(istOberflaechenDatei({ tagName: 'LINK', rel: 'stylesheet', href: `${URSPRUNG}/assets/index-alt.css` }, URSPRUNG), true);
    assert.equal(istOberflaechenDatei({ tagName: 'link', rel: 'modulepreload', href: '/assets/start-alt.js' }, URSPRUNG), true);
    assert.equal(istOberflaechenDatei({ tagName: 'SCRIPT', src: `${URSPRUNG}/assets/start-alt.js` }, URSPRUNG), true);
  });

  it('anderes zählt nicht: Bilder, fremde Server, Dateien außerhalb von /assets/, Symbol', () => {
    assert.equal(istOberflaechenDatei({ tagName: 'IMG', src: `${URSPRUNG}/assets/logo.png` } as never, URSPRUNG), false);
    assert.equal(istOberflaechenDatei({ tagName: 'LINK', rel: 'stylesheet', href: 'https://fonts.example.com/assets/a.css' }, URSPRUNG), false);
    assert.equal(istOberflaechenDatei({ tagName: 'LINK', rel: 'icon', href: `${URSPRUNG}/assets/symbol.svg` }, URSPRUNG), false);
    assert.equal(istOberflaechenDatei({ tagName: 'SCRIPT', src: `${URSPRUNG}/api/x.js` }, URSPRUNG), false);
    assert.equal(istOberflaechenDatei({ tagName: 'SCRIPT', src: '' }, URSPRUNG), false);
    assert.equal(istOberflaechenDatei(null, URSPRUNG), false);
    assert.equal(istOberflaechenDatei({} as never, URSPRUNG), false);
  });

  it('selbst neu laden höchstens einmal je Minute', () => {
    const t = 1_000_000;
    assert.equal(darfNeuLaden(null, t), true);
    assert.equal(darfNeuLaden(Number.NaN, t), true);
    assert.equal(darfNeuLaden(t - 10_000, t), false);
    assert.equal(darfNeuLaden(t - NEU_LADEN_ABSTAND_MS, t), true);
    assert.equal(darfNeuLaden(t + 5000, t), true, 'Uhr zurückgestellt');
  });

  it('Assistent: ohne Rückfrage neu laden – nur bei neuer Version und nicht, während „Jetzt einrichten“ läuft', () => {
    const jetzt = 5_000_000;
    assert.equal(automatischNeuLaden({ neueVersion: true, laeuft: false, zuletzt: null, jetzt }), true);
    assert.equal(automatischNeuLaden({ neueVersion: false, laeuft: false, zuletzt: null, jetzt }), false);
    assert.equal(automatischNeuLaden({ neueVersion: true, laeuft: true, zuletzt: null, jetzt }), false);
    assert.equal(automatischNeuLaden({ neueVersion: true, laeuft: false, zuletzt: jetzt - 1000, jetzt }), false, 'gerade erst neu geladen');
  });

  it('Seite mit altem Stand gegen neuen Server: neue Version erkannt (auch ohne Ausfall dazwischen)', async () => {
    let stand = 'alt';
    const e = new Erreichbarkeit({
      gesundheit: async (): Promise<Gesundheit> => ({ ok: true, zustand: 'einrichtung', stand }),
      jetzt: () => 0, spaeter: () => null, abbrechen: () => {},
    });
    await e.pruefe();
    assert.equal(e.zustand.neueVersion, false);
    stand = 'neu';
    // Schrittwechsel im Assistenten (#933): sofort nachsehen.
    await e.pruefe();
    assert.equal(e.zustand.neueVersion, true);
    assert.equal(e.zustand.stufe, 'ok');
  });

  it('fehlende Datei meldet „veraltet“ ohne Abfrage', () => {
    const e = new Erreichbarkeit({ gesundheit: async () => null, jetzt: () => 0, spaeter: () => null, abbrechen: () => {} });
    e.veraltet();
    assert.equal(e.zustand.neueVersion, true);
  });
});
