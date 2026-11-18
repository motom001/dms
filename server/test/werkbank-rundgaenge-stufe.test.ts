/**
 * Werkbank: „Rundgänge“ erst ab der Stufe Betrieb (#1298). Wer Rundgänge schon eingerichtet hat (eigene oder einen
 * mitgelieferten ausgeschaltet), behält den Bereich als Einblendung – mit TEST_DATABASE_URL über die Migration 120.
 */
import assert from 'node:assert/strict';
import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import { fuerAlle, inVorlage, liesAnsicht, liesEigene, sichtbar, STUFEN } from '../../shared/src/werkbankansicht';

describe('Werkbank: Rundgänge ab Betrieb (#1298)', () => {
  it('nicht in Einsteiger, Haushalt und Selbständig, in Betrieb und Alles schon', () => {
    assert.deepEqual(
      STUFEN.filter((v) => inVorlage(v, 'rundgaenge')),
      ['organisation', 'alles'],
    );
    // Tipps bleiben ab Haushalt (nicht Teil der Entscheidung).
    assert.ok(inVorlage('haushalt', 'tipps'));
  });
  it('als Einblendung bleibt der Bereich in jeder Stufe sichtbar', () => {
    for (const v of STUFEN) {
      const a = liesAnsicht({ vorlage: v, ein: ['rundgaenge'], aus: [] })!;
      assert.ok(fuerAlle(a, 'rundgaenge'), v);
    }
    assert.ok(sichtbar({ vorlage: 'haushalt', ein: [], aus: [] }, liesEigene({ ein: ['rundgaenge'] }), 'rundgaenge'));
    assert.ok(!sichtbar({ vorlage: 'haushalt', ein: [], aus: [] }, liesEigene({ ein: [] }), 'rundgaenge'));
  });
});

const pg = process.env.TEST_DATABASE_URL;
describe('Werkbank: Rundgänge ab Betrieb (#1298): Migration 120', { skip: !pg && 'ohne TEST_DATABASE_URL' }, () => {
  const offen: Array<() => Promise<void>> = [];
  after(async () => {
    for (const f of offen.reverse()) await f();
  });

  it('eingerichtete Rundgänge bleiben eingeblendet, sonst ändert sich nichts', async () => {
    const { ausUrl, alsUrl, legeDatenbankAn } = await import('../src/datenbank/anbindung');
    const { verbinde, migriere } = await import('../src/datenbank/db');
    const a = { ...ausUrl(pg)!, datenbank: `dms_rundg_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}` };
    await legeDatenbankAn(a);
    const sql = verbinde(alsUrl(a));
    offen.push(async () => {
      await sql.end();
      const admin = verbinde(alsUrl(a, 'postgres'));
      await admin.unsafe(`DROP DATABASE IF EXISTS "${a.datenbank}" WITH (FORCE)`).catch(() => {});
      await admin.end();
    });
    // Stand vor #1298: alle Migrationen außer 120.
    const alle = new URL('../migrations', import.meta.url).pathname;
    const vorher = await mkdtemp(join(tmpdir(), 'dms-rundgaenge-'));
    offen.push(() => rm(vorher, { recursive: true, force: true }));
    await cp(alle, vorher, { recursive: true, filter: (q) => !q.endsWith('120_rundgaenge_eingeblendet.sql') });
    await migriere(sql, vorher, () => {});
    const H = '00000000-0000-4000-8000-000000000001';
    // Weitere Ablagen: nur ein Tipp ausgeschaltet (H2); eigene Rundgänge, einmal ausgeblendet (H3), einmal nicht (H4).
    const [H2, H3, H4] = ['2', '3', '4'].map((n) => `00000000-0000-4000-8000-00000000000${n}`);
    for (const h of [H2, H3, H4]) await sql`INSERT INTO haushalte (id, name) VALUES (${h}, 'Weitere Ablage')`;
    const P = 'werkbank_ansicht:00000000-0000-4000-8000-0000000000a1';
    const Q = 'werkbank_ansicht:00000000-0000-4000-8000-0000000000a2';
    const R = 'werkbank_ansicht:00000000-0000-4000-8000-0000000000a3';
    const eigene = { rundgaenge: [{ schluessel: 'ablegen', yaml: 'schluessel: ablegen' }], tipps: [], anpassungen: {}, aus: [] };
    await sql`INSERT INTO einstellungen (haushalt_id, schluessel, wert) VALUES
      (${H}, 'entdecken_werkbank', ${sql.json({ rundgaenge: [], tipps: [], anpassungen: {}, aus: ['rundgang:ablago'] })}),
      (${H}, 'werkbank_ansicht', ${sql.json({ vorlage: 'haushalt', ein: ['protokoll'], aus: [] })}),
      (${H}, ${P}, ${sql.json({ ein: [], vorlage: 'selbstaendig' })}),
      (${H}, ${Q}, ${sql.json({ ein: ['demo'], vorlage: 'einsteiger' })}),
      (${H}, ${R}, ${sql.json({ ein: [] })}),
      (${H2}, 'entdecken_werkbank', ${sql.json({ rundgaenge: [], tipps: [], anpassungen: {}, aus: ['tipp:suche'] })}),
      (${H2}, 'werkbank_ansicht', ${sql.json({ vorlage: 'selbstaendig', ein: [], aus: [] })}),
      (${H3}, 'entdecken_werkbank', ${sql.json(eigene)}),
      (${H3}, 'werkbank_ansicht', ${sql.json({ vorlage: 'haushalt', ein: [], aus: ['rundgaenge'] })}),
      (${H4}, 'entdecken_werkbank', ${sql.json(eigene)}),
      (${H4}, 'werkbank_ansicht', ${sql.json({ vorlage: 'selbstaendig', ein: [], aus: [] })})`;

    await migriere(sql, alle, () => {});
    const ansicht = async (h: string) =>
      Object.fromEntries(
        (await sql`SELECT schluessel, wert FROM einstellungen WHERE haushalt_id = ${h} AND schluessel LIKE 'werkbank_ansicht%'`).map(
          (r) => [r.schluessel, r.wert],
        ),
      );
    const x = await ansicht(H);
    assert.deepEqual(x.werkbank_ansicht, { vorlage: 'haushalt', ein: ['protokoll', 'rundgaenge'], aus: [] });
    assert.deepEqual(x[P], { ein: ['rundgaenge'], vorlage: 'selbstaendig' });
    // Einsteiger zeigte den Bereich auch vorher nicht; ohne eigene Stufe gilt die Installation.
    assert.deepEqual(x[Q], { ein: ['demo'], vorlage: 'einsteiger' });
    assert.deepEqual(x[R], { ein: [] });
    // Nur ein Tipp ausgeschaltet: an Rundgängen ist nichts eingerichtet.
    assert.deepEqual((await ansicht(H2)).werkbank_ansicht, { vorlage: 'selbstaendig', ein: [], aus: [] });
    // Ausgeblendet bleibt ausgeblendet; eigene Rundgänge zählen als eingerichtet.
    assert.deepEqual((await ansicht(H3)).werkbank_ansicht, { vorlage: 'haushalt', ein: [], aus: ['rundgaenge'] });
    assert.deepEqual((await ansicht(H4)).werkbank_ansicht, { vorlage: 'selbstaendig', ein: ['rundgaenge'], aus: [] });
    // Und so liest die Werkbank es: in der Leiste.
    assert.ok(fuerAlle(liesAnsicht((await ansicht(H4)).werkbank_ansicht)!, 'rundgaenge'));
  });
});
