/**
 * Erkennungswörter am Feld (#1714) beim Speichern eines Felds (Werkbank, API, Paket): bleiben erhalten, Wörter je Option
 * nur für Optionen, die das Feld hat; danach füllt „Aus Dokument ausfüllen“ mit ihnen.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { vorschlaegeAus } from '../../shared/src/erkennung';
import { bereinigeFeld } from '../src/mappentypen';

describe('Erkennungswörter am Feld (#1714)', () => {
  it('bleiben beim Speichern erhalten; jeOption nur für vorhandene Optionen', () => {
    const f = bereinigeFeld({
      key: 'ergebnis',
      label: 'Ergebnis',
      typ: 'auswahl',
      optionen: ['ohne Mängel', 'geringe Mängel'],
      erkennung: {
        art: 'auswahl',
        woerter: { vor: ['(7)'], jeOption: { 'ohne Mängel': ['ohne festgestellte Mängel'], 'keine Option': ['irgendwas'] } },
      },
    });
    assert.deepEqual(f.erkennung, {
      art: 'auswahl',
      woerter: { vor: ['(7)'], jeOption: { 'ohne Mängel': ['ohne festgestellte Mängel'] } },
    });
    const v = vorschlaegeAus({ felder: [f] }, 'Prüfdienst Muster\nErgebnis: ohne festgestellte Mängel\fGeringe Mängel (GM) sind …');
    assert.equal(v.ergebnis?.wert, 'ohne Mängel');
  });

  it('am Zahlfeld ohne Art: füllbar über die Wörter vor dem Wert', () => {
    const f = bereinigeFeld({
      key: 'kilometerstand',
      label: 'Kilometerstand',
      typ: 'zahl',
      erkennung: { woerter: { vor: ['(4)', 'km-St.'] } },
    });
    assert.deepEqual(f.erkennung, { woerter: { vor: ['(4)', 'km-St.'] } });
    assert.equal(vorschlaegeAus({ felder: [f] }, 'Auftrag 4711\n(4) km-St. 9363').kilometerstand?.wert, 9363);
  });
});
