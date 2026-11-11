/**
 * Werkbank → Gleichbedeutende Wörter (#992): eigener Bereich mit Mitte, Prüfung einer Gruppe beim Bearbeiten,
 * Rechte der Schnittstellen und – mit TEST_DATABASE_URL – die Migration (Stand je Gruppe, Rechte und Leiste von
 * „Suche und Volltext“ gehen auf den neuen Bereich über).
 */
import assert from 'node:assert/strict';
import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import { gruppenMitWort, pruefeWortgruppe } from '../../shared/src/suche';
import { liesVerwaltung } from '../../shared/src/verwaltungsrecht';
import { BEREICHE, hatMitte, inVorlage, nurImExpertenmodus, werkbankEbene } from '../../shared/src/werkbankansicht';
import { bereicheDerRoute } from '../src/verwaltungsbereiche';

describe('Gleichbedeutende Wörter (#992): Prüfung einer Gruppe', () => {
  it('mindestens zwei Wörter, leere Zeilen zählen nicht', () => {
    assert.equal(pruefeWortgruppe(['Rechnung', 'Beleg']).fehler, null);
    assert.match(pruefeWortgruppe(['Rechnung', '', '  ']).fehler ?? '', /mindestens zwei/);
  });
  it('doppelte Wörter sind ein Fehler (gefaltet verglichen), mit Stelle', () => {
    const p = pruefeWortgruppe(['Kfz', 'Auto', 'KFZ', 'Gebühr', 'gebuhr']);
    assert.deepEqual(p.doppelt, [2, 4]);
    assert.match(p.fehler ?? '', /„KFZ“ steht doppelt/);
  });
  it('Längen wie bisher (liesWortgruppe)', () => {
    assert.match(pruefeWortgruppe(['A', 'Auto']).fehler ?? '', /zu kurz/);
    assert.match(pruefeWortgruppe(['Auto', 'x'.repeat(61)]).fehler ?? '', /zu lang/);
  });
  it('findet andere Gruppen mit demselben Wort, nicht die eigene', () => {
    const gruppen = [{ id: 'a', woerter: ['Rechnung', 'Beleg'] }, { id: 'b', woerter: ['Quittung', 'beleg'] }, { id: 'c', woerter: ['Auto', 'Kfz'] }];
    assert.deepEqual(gruppenMitWort(gruppen, ' Beleg ', 'a').map((g) => g.id), ['b']);
    assert.deepEqual(gruppenMitWort(gruppen, '', 'a'), []);
  });
});

describe('Gleichbedeutende Wörter (#992): Bereich und Rechte', () => {
  it('eigener Bereich direkt unter „Suche und Volltext“, mit Mitte, sichtbar wie dort', () => {
    const pfade = BEREICHE.map((b) => b.pfad);
    assert.equal(pfade.indexOf('woerter'), pfade.indexOf('texterkennung') + 1);
    assert.equal(BEREICHE.find((b) => b.pfad === 'woerter')?.gruppe, 'post');
    assert.ok(hatMitte('woerter'));
    assert.equal(werkbankEbene('woerter'), 'liste');
    assert.equal(werkbankEbene('woerter', 'neu'), 'mappe');
    for (const v of ['haushalt', 'organisation', 'alles'] as const) {
      assert.equal(inVorlage(v, 'woerter'), inVorlage(v, 'texterkennung'), v);
      assert.equal(nurImExpertenmodus(v, 'woerter'), nurImExpertenmodus(v, 'texterkennung'), v);
    }
    assert.deepEqual(liesVerwaltung(['woerter']), ['woerter']);
  });
  it('Schnittstellen: Gruppen gehören zum neuen Bereich, den Stand lesen beide', () => {
    assert.deepEqual(bereicheDerRoute('POST', '/api/werkbank/suche/synonyme'), ['woerter']);
    assert.deepEqual(bereicheDerRoute('PUT', '/api/werkbank/suche/synonyme/:id'), ['woerter']);
    assert.deepEqual(bereicheDerRoute('DELETE', '/api/werkbank/suche/synonyme/:id'), ['woerter']);
    assert.deepEqual(bereicheDerRoute('GET', '/api/werkbank/suche'), ['texterkennung', 'woerter']);
    assert.deepEqual(bereicheDerRoute('PUT', '/api/werkbank/suche'), ['texterkennung']);
    assert.deepEqual(bereicheDerRoute('POST', '/api/werkbank/suche/woerter'), ['texterkennung']);
  });
});

const pg = process.env.TEST_DATABASE_URL;
describe('Gleichbedeutende Wörter (#992): Migration', { skip: !pg && 'ohne TEST_DATABASE_URL' }, () => {
  const offen: Array<() => Promise<void>> = [];
  after(async () => { for (const f of offen.reverse()) await f(); });

  it('Stand je Gruppe; Recht und Leiste von „Suche und Volltext“ gelten auch für den neuen Bereich', async () => {
    const { ausUrl, alsUrl, legeDatenbankAn } = await import('../src/anbindung');
    const { verbinde, migriere } = await import('../src/db');
    const a = { ...ausUrl(pg)!, datenbank: `dms_woerter_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}` };
    await legeDatenbankAn(a);
    const sql = verbinde(alsUrl(a));
    offen.push(async () => {
      await sql.end();
      const admin = verbinde(alsUrl(a, 'postgres'));
      await admin.unsafe(`DROP DATABASE IF EXISTS "${a.datenbank}" WITH (FORCE)`).catch(() => {});
      await admin.end();
    });
    // Stand vor #992: alle Migrationen außer 101.
    const alle = new URL('../migrations', import.meta.url).pathname;
    const vorher = await mkdtemp(join(tmpdir(), 'dms-woerter-'));
    offen.push(() => rm(vorher, { recursive: true, force: true }));
    await cp(alle, vorher, { recursive: true, filter: (q) => !q.endsWith('101_woerter.sql') });
    await migriere(sql, vorher, () => {});
    const H = '00000000-0000-4000-8000-000000000001';
    await sql`INSERT INTO benutzer (id, haushalt_id, email, name, rolle, verwaltung) VALUES
      ('00000000-0000-4000-8000-0000000000a1', ${H}, 'markus@example.org', 'Markus', 'mitglied', '{texterkennung,typen}'),
      ('00000000-0000-4000-8000-0000000000a2', ${H}, 'petra@example.org', 'Petra', 'mitglied', '{typen}')`;
    await sql`INSERT INTO einstellungen (haushalt_id, schluessel, wert) VALUES
      (${H}, 'werkbank_ansicht', ${sql.json({ vorlage: 'haushalt', ein: ['texterkennung'], aus: [] })}),
      (${H}, 'werkbank_ansicht:00000000-0000-4000-8000-0000000000a2', ${sql.json({ ein: ['typen'] })})`;
    await sql`INSERT INTO synonyme (id, haushalt_id, woerter, quelle, erstellt) VALUES ('00000000-0000-4000-8000-0000000000b1', ${H}, '{Kfz,Auto}', 'werkbank', '2026-01-02T03:04:05.678912Z')`;

    await migriere(sql, alle, () => {});
    const rechte = Object.fromEntries((await sql`SELECT name, verwaltung FROM benutzer WHERE haushalt_id = ${H} AND name IN ('Markus', 'Petra')`).map((r) => [r.name, r.verwaltung]));
    assert.deepEqual(rechte, { Markus: ['texterkennung', 'typen', 'woerter'], Petra: ['typen'] });
    const ansicht = Object.fromEntries((await sql`SELECT schluessel, wert FROM einstellungen WHERE haushalt_id = ${H} AND schluessel LIKE 'werkbank_ansicht%'`).map((r) => [r.schluessel, r.wert]));
    assert.deepEqual(ansicht.werkbank_ansicht, { vorlage: 'haushalt', ein: ['texterkennung', 'woerter'], aus: [] });
    assert.deepEqual(ansicht['werkbank_ansicht:00000000-0000-4000-8000-0000000000a2'], { ein: ['typen'] });
    const [g] = await sql`SELECT geaendert FROM synonyme WHERE id = '00000000-0000-4000-8000-0000000000b1'`;
    assert.equal((g.geaendert as Date).toISOString(), '2026-01-02T03:04:05.678Z');
  });
});
