/** Symbol je Ansicht (#428): Speichern, Paketformat und Paket erstellen; die Auswahl prüft web/test/ansichtsymbol.test.ts. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { speicherDateien } from '../src/dateien/dateispeicher';
import { Dienst } from '../src/dienst/dienst';
import { speicherEinstellungen } from '../src/einstellungen/einstellungen';
import { liesPaket } from '../src/pakete/verwaltung/index';
import { speicherRepo } from '../src/repo/speicher';
import { eigeneDatenbank, MIGRATIONEN } from './hilfe-db';
import type { Sicht } from '../../shared/src/sichten';

const dienst = () => new Dienst(speicherRepo(), speicherDateien(), { einstellungen: speicherEinstellungen() });

describe('Symbol je Ansicht (#428)', () => {
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
    const manifest =
      'schema: 1\nid: symbole\nname: Symbole\nversion: 1.0.0\nbeschreibung: Test.\nautor: { name: Test, github: test }\nlizenz: Apache-2.0\ndms: ">=0.86.0"\ninhalt: { sichten: sichten.yaml }\n';
    const sichten =
      '- { schluessel: auto, name: Auto, symbol: car }\n- { schluessel: neu, name: Neu, symbol: rakete-2099 }\n- { schluessel: ohne, name: Ohne }\n';
    const p = liesPaket(
      new Map([
        ['manifest.yaml', Buffer.from(manifest)],
        ['sichten.yaml', Buffer.from(sichten)],
      ]),
    );
    assert.deepEqual(
      p.sichten.map((s) => s.symbol),
      ['car', undefined, undefined],
    );
  });

  it('Migration ergänzt die Spalte und das Symbol der Ansicht „Neue Post“', () => {
    const sql = readFileSync(new URL('../migrations/065_sicht_symbol.sql', import.meta.url), 'utf8');
    assert.match(sql, /ADD COLUMN IF NOT EXISTS symbol text/);
    assert.match(sql, /'inbox'/);
  });

  /** Name → Symbol der eingebauten Ansichten (#1519): je Systemtyp, „Eingegangen“, „Versendet“, „Neue Post“, „Favoriten“. */
  const eingebaute = (alle: Sicht[], typen: Array<{ id: string; system?: string | null }>) => {
    const sys = Object.fromEntries(typen.filter((x) => x.system).map((x) => [x.id, x.system]));
    const post = typen.find((x) => x.system === 'post')!.id;
    return Object.fromEntries(
      alle
        .filter((x) => sys[x.id] || x.elternId === post || x.symbol === 'inbox' || x.symbol === 'star')
        .map((x) => [sys[x.id] ?? x.name, x.symbol]),
    );
  };
  const ERWARTET = {
    benutzer: 'users',
    rolle: 'id-card-lanyard',
    post: 'mail',
    Eingegangen: 'mailbox',
    Versendet: 'send',
    'Neue Post': 'inbox',
    Favoriten: 'star',
  };

  it('eingebaute Ansichten bekommen beim Anlegen ein Symbol (#1519)', async () => {
    const d = dienst();
    await d.systemausstattung.sicherstellen();
    assert.deepEqual(eingebaute(await d.kern.repo.listeSichten(), await d.kern.repo.listeTypen()), ERWARTET);
  });

  it(
    'Migration 123: bestehende eingebaute Ansichten bekommen ihr Symbol, ein selbst gesetztes bleibt (#1519)',
    { skip: !process.env.TEST_DATABASE_URL && 'ohne TEST_DATABASE_URL' },
    async () => {
      const { pgRepo } = await import('../src/repo/pg');
      const { migriere } = await import('../src/datenbank/db');
      const { sql } = await eigeneDatenbank('symbol_1519', { jeTest: true });
      const H = '00000000-0000-4000-8000-000000001519';
      await sql`INSERT INTO haushalte (id, name) VALUES (${H}, 'Test')`;
      const d = new Dienst(pgRepo(sql, H), speicherDateien(), { einstellungen: speicherEinstellungen() });
      await d.systemausstattung.sicherstellen();
      // Wie vor #1519: ohne Symbole; „Rolle“ hat jemand selbst auf „star“ gesetzt.
      const typen = await d.kern.repo.listeTypen();
      const rolle = typen.find((x) => x.system === 'rolle')!.id;
      await sql`UPDATE sichten SET symbol = NULL WHERE symbol IN ('users', 'id-card-lanyard', 'mail', 'mailbox', 'send')`;
      await sql`UPDATE sichten SET symbol = 'star' WHERE id = ${rolle}`;
      await sql`DELETE FROM schema_migrationen WHERE name = '123_eingebaute_ansichten_symbol.sql'`;
      await migriere(sql, MIGRATIONEN, () => {});
      assert.deepEqual(eingebaute(await d.kern.repo.listeSichten(), typen), { ...ERWARTET, rolle: 'star' });
      // Eigene Ansichten ohne Symbol bleiben ohne.
      const eigen = await d.sichtenVerwaltung.legeSichtAn({ name: 'Eigene', typen: [], bedingungen: [] });
      await sql`DELETE FROM schema_migrationen WHERE name = '123_eingebaute_ansichten_symbol.sql'`;
      await migriere(sql, MIGRATIONEN, () => {});
      assert.equal((await d.kern.repo.listeSichten()).find((x) => x.id === eigen.id)?.symbol, null);
    },
  );
});
