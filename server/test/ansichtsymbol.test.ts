/** Symbol je Ansicht (#428): feste Auswahl aus Lucide, Speichern, Paketformat und Paket erstellen. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { ANSICHT_SYMBOLE, ANSICHT_SYMBOL_NAMEN, ansichtSymbol } from '../../shared/src/ansichtsymbole';
import { ANSICHT_FORMEN } from '../../web/src/ansichtsymbol-formen';
import { speicherDateien } from '../src/dateispeicher';
import { Dienst } from '../src/dienst';
import { speicherEinstellungen } from '../src/einstellungen';
import { liesPaket } from '../src/pakete';
import { speicherRepo } from '../src/repo-speicher';

const dienst = () => new Dienst(speicherRepo(), speicherDateien(), { einstellungen: speicherEinstellungen() });

describe('Symbol je Ansicht (#428)', () => {
  it('Auswahl: eindeutige Namen, zu jedem Namen eine Form, Lucide-Namen', () => {
    const alle = ANSICHT_SYMBOLE.flatMap((g) => g.symbole.map((s) => s.name));
    assert.equal(new Set(alle).size, alle.length, 'keine doppelten Namen');
    assert.ok(alle.length >= 60, 'mindestens 60 Symbole');
    for (const n of alle) {
      assert.match(n, /^[a-z0-9]+(-[a-z0-9]+)*$/, n);
      assert.ok(ANSICHT_FORMEN[n]?.length, `Form für ${n}`);
    }
    assert.deepEqual(Object.keys(ANSICHT_FORMEN).sort(), [...ANSICHT_SYMBOL_NAMEN].sort());
    assert.equal(ansichtSymbol('house'), 'house');
    assert.equal(ansichtSymbol(' car '), 'car');
    for (const x of ['haus', '', null, 3, 'house-plus']) assert.equal(ansichtSymbol(x), null, String(x));
  });

  it('wird gespeichert, unbekannt heißt ohne Symbol, fehlt die Angabe, bleibt es', async () => {
    const d = dienst();
    const s = await d.sichtenVerwaltung.legeSichtAn({ name: 'Auto', typen: [], bedingungen: [], symbol: 'car' });
    assert.equal(s.symbol, 'car');
    assert.equal((await d.sichtenVerwaltung.aendereSicht(s.id, { name: 'Auto und Rad' })).symbol, 'car', 'ohne Angabe bleibt das Symbol');
    assert.equal((await d.sichtenVerwaltung.aendereSicht(s.id, { name: 'Auto', symbol: 'gibt-es-nicht' })).symbol, null);
    assert.equal((await d.sichtenVerwaltung.aendereSicht(s.id, { name: 'Auto', symbol: 'bike' })).symbol, 'bike');
    assert.equal((await d.sichtenVerwaltung.aendereSicht(s.id, { name: 'Auto', symbol: null })).symbol, null);
  });

  it('Paketformat: symbol an der Ansicht – gültig, unbekannt (ohne Fehler), fehlt', () => {
    const manifest = 'schema: 1\nid: symbole\nname: Symbole\nversion: 1.0.0\nbeschreibung: Test.\nautor: { name: Test, github: test }\nlizenz: Apache-2.0\ndms: ">=0.86.0"\ninhalt: { sichten: sichten.yaml }\n';
    const sichten = '- { schluessel: auto, name: Auto, symbol: car }\n- { schluessel: neu, name: Neu, symbol: rakete-2099 }\n- { schluessel: ohne, name: Ohne }\n';
    const p = liesPaket(new Map([['manifest.yaml', Buffer.from(manifest)], ['sichten.yaml', Buffer.from(sichten)]]));
    assert.deepEqual(p.sichten.map((s) => s.symbol), ['car', undefined, undefined]);
  });

  it('Migration ergänzt die Spalte und das Symbol der Ansicht „Neue Post“', () => {
    const sql = readFileSync(new URL('../migrations/065_sicht_symbol.sql', import.meta.url), 'utf8');
    assert.match(sql, /ADD COLUMN IF NOT EXISTS symbol text/);
    assert.match(sql, /'inbox'/);
  });
});
