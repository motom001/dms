/**
 * Mehrzahl eines Mappentyps (#1446): optional, Deutsch als Ausgangstext und weitere Sprachen unter
 * `beschriftungen.<sprache>.mehrzahl`, in der Werkbank pflegbar (bleibt ohne Angabe), aus Paketen beim Installieren und –
 * nur, wenn der Typ noch keine hat – beim Update; Benutzer, Rollen und die Beispiel-Mappentypen haben ihre. Mit Speicher
 * und – mit TEST_DATABASE_URL – PostgreSQL (eigene Spalte, Migration 123).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { typMehrzahl } from '../../shared/src/beschriftung';
import { beschreibeTyp } from '../../shared/src/fassungsvergleich';
import type { Mappentyp } from '../../shared/src/model';
import { speicherDateien } from '../src/dateien/dateispeicher';
import { Dienst } from '../src/dienst/dienst';
import { speicherEinstellungen } from '../src/einstellungen/einstellungen';
import { zipPuffer } from '../src/formate/zip';
import { bereinigeTyp } from '../src/mappentypen/index';
import { Paketverwaltung } from '../src/pakete/verwaltung/index';
import type { Repo } from '../src/repo';
import { speicherRepo } from '../src/repo/speicher';
import { eigeneDatenbank } from './hilfe-db';

const HAUSHALT = '00000000-0000-4000-8000-000000000001';
const ICH = { id: '00000000-0000-4000-8000-0000000000aa', email: 'admin@example.org' };

describe('Mehrzahl (#1446): Lesen und Sprachen', () => {
  it('bereinigt: getrimmt, höchstens 80 Zeichen, Deutsch aus beschriftungen.de, andere Sprachen in den Beschriftungen', () => {
    const t = bereinigeTyp({
      name: 'Vertrag',
      mehrzahl: '  Verträge  ',
      beschriftungen: { en: { name: 'Contract', mehrzahl: 'Contracts' } },
      felder: [{ key: 'name', label: 'Name', typ: 'text' }],
    });
    assert.equal(t.mehrzahl, 'Verträge');
    assert.equal(t.beschriftungen?.en?.mehrzahl, 'Contracts');
    assert.equal(bereinigeTyp({ name: 'Vertrag', beschriftungen: { de: { mehrzahl: 'Verträge' } } }).mehrzahl, 'Verträge');
    assert.equal(bereinigeTyp({ name: 'Vertrag', mehrzahl: 'x'.repeat(200) }).mehrzahl?.length, 80);
    assert.equal(bereinigeTyp({ name: 'Vertrag' }).mehrzahl, undefined);
  });

  it('in einer Sprache: eigene Mehrzahl, sonst die deutsche nur ohne übersetzten Namen', () => {
    const t = { name: 'Vertrag', mehrzahl: 'Verträge', beschriftungen: { en: { name: 'Contract', mehrzahl: 'Contracts' } } };
    assert.equal(typMehrzahl(t, 'de'), 'Verträge');
    assert.equal(typMehrzahl(t, 'en'), 'Contracts');
    // Name übersetzt, Mehrzahl nicht: keine – sonst stünde „12 Verträge“ neben „Contract“.
    assert.equal(typMehrzahl({ ...t, beschriftungen: { en: { name: 'Contract' } } }, 'en'), '');
    // Nichts übersetzt: der deutsche Name und die deutsche Mehrzahl.
    const nurDeutsch = { name: 'Vertrag', mehrzahl: 'Verträge' };
    assert.equal(typMehrzahl(nurDeutsch, 'en'), 'Verträge');
    const ohne: { mehrzahl?: string } = {};
    assert.equal(typMehrzahl(ohne, 'de'), '');
  });

  it('Fassungen: „Mehrzahl: – → Verträge“', () => {
    const alt = { name: 'Vertrag', beschreibung: '', titelVorlage: '', felder: [], register: [] } as unknown as Mappentyp;
    assert.ok(beschreibeTyp(alt, { ...alt, mehrzahl: 'Verträge' }).some((s) => s === 'Mehrzahl: – → Verträge'));
  });
});

const zip = (d: Record<string, string>) =>
  zipPuffer(
    Object.entries(d).map(([name, inhalt]) => ({ name, daten: Buffer.from(inhalt) })),
    new Date('2026-01-01T12:00:00Z'),
  );
const paket = (version: string, typ: string) => ({
  'manifest.yaml': `schema: 1\nid: vertraege\nname: Verträge\nversion: ${version}\nbeschreibung: Test.\nautor: { name: Lena Beispiel, github: lena-beispiel }\nlizenz: MIT\ndms: ">=0.230.0"\ninhalt:\n  mappentypen: inhalt/mappentypen.yaml\n`,
  'inhalt/mappentypen.yaml': `- schluessel: vertrag\n  name: Vertrag\n${typ}  felder:\n    - { key: name, label: Name, typ: text }\n  register:\n    - { key: allgemein, name: Allgemein, art: felder, felder: [name] }\n`,
});

async function repo(pg: boolean): Promise<Repo> {
  if (!pg) return speicherRepo();
  const { pgRepo } = await import('../src/repo/pg');
  const { sql } = await eigeneDatenbank('mehrzahl', { jeTest: true });
  await sql`INSERT INTO haushalte (id, name) VALUES (${HAUSHALT}, 'Test') ON CONFLICT DO NOTHING`;
  await sql`INSERT INTO benutzer (id, haushalt_id, email, name, rolle) VALUES (${ICH.id}, ${HAUSHALT}, ${ICH.email}, 'Admin', 'admin') ON CONFLICT DO NOTHING`;
  return pgRepo(sql, HAUSHALT) as never;
}

for (const pg of [false, true]) {
  describe(
    `Mehrzahl (#1446): Werkbank, Pakete, mitgelieferte Typen${pg ? ' – PostgreSQL' : ''}`,
    { skip: pg && !process.env.TEST_DATABASE_URL ? 'TEST_DATABASE_URL nicht gesetzt' : false },
    () => {
      async function aufbau() {
        const d = new Dienst(await repo(pg), speicherDateien(), { einstellungen: speicherEinstellungen() });
        const p = new Paketverwaltung(d, {
          version: () => '0.300.0',
          katalogUrl: 'https://katalog.test/katalog.json',
          abruf: async () => {
            throw new Error('ohne Netz');
          },
        });
        const installiere = async (dateien: Record<string, string>) =>
          p.installiere({ upload: (await p.hochladen(zip(dateien), ICH)).upload, bestaetigt: true }, ICH);
        return { d, installiere };
      }

      it('Werkbank: speichern, ohne Angabe behalten, leer entfernen', async () => {
        const { d } = await aufbau();
        const typ = await d.mappentypen.legeTypAn({
          name: 'Gartengerät',
          mehrzahl: 'Gartengeräte',
          beschriftungen: { en: { name: 'Garden tool', mehrzahl: 'Garden tools' } },
          felder: [{ key: 'name', label: 'Name', typ: 'text' }],
        });
        assert.equal(typ.mehrzahl, 'Gartengeräte');
        const { mehrzahl: _m, ...ohne } = typ;
        // Ein älteres Programm ohne die Angabe: Die Mehrzahl bleibt.
        assert.equal((await d.mappentypen.aendereTyp(typ.id, { ...ohne, beschreibung: 'Werkzeug' })).mehrzahl, 'Gartengeräte');
        const gelesen = (await d.mappentypen.listeTypen()).find((x) => x.id === typ.id)!;
        assert.deepEqual([gelesen.mehrzahl, gelesen.beschriftungen?.en?.mehrzahl], ['Gartengeräte', 'Garden tools']);
        assert.equal((await d.mappentypen.aendereTyp(typ.id, { ...gelesen, mehrzahl: '' })).mehrzahl ?? '', '');
        assert.equal((await d.mappentypen.listeTypen()).find((x) => x.id === typ.id)!.mehrzahl ?? '', '');
      });

      it('Pakete: Installation mit Mehrzahl; Update ergänzt sie nur, wo noch keine steht', async () => {
        const { d, installiere } = await aufbau();
        const typ = async () => (await d.mappentypen.listeTypen()).find((x) => x.schluessel === 'vertraege:vertrag')!;
        // Ohne Mehrzahl bleibt „n × Typ“.
        await installiere(paket('1.0.0', ''));
        assert.equal((await typ()).mehrzahl ?? '', '');
        // Update bringt sie (Deutsch und Englisch) – der Typ hatte noch keine.
        await installiere(paket('1.1.0', '  mehrzahl: Verträge\n  beschriftungen: { en: { name: Contract, mehrzahl: Contracts } }\n'));
        assert.deepEqual([(await typ()).mehrzahl, (await typ()).beschriftungen?.en?.mehrzahl], ['Verträge', 'Contracts']);
        // Der Administrator ändert sie; ein weiteres Update überschreibt das nicht.
        await d.mappentypen.aendereTyp((await typ()).id, { ...(await typ()), mehrzahl: 'Unsere Verträge' });
        await installiere(paket('1.2.0', '  mehrzahl: Vertragsunterlagen\n'));
        assert.equal((await typ()).mehrzahl, 'Unsere Verträge');
      });

      it('mitgeliefert: Benutzer und Rollen, Beispiel-Mappentypen', async () => {
        const { d } = await aufbau();
        await d.systemtypen.sichereSystemtypen();
        const typen = await d.mappentypen.listeTypen();
        const sys = (s: string) => typen.find((x) => x.system === s)!;
        assert.deepEqual([sys('benutzer').mehrzahl, sys('rolle').mehrzahl, sys('post').mehrzahl ?? ''], ['Benutzer', 'Rollen', '']);
        assert.equal(sys('rolle').beschriftungen?.en?.mehrzahl, 'Roles');
        const { ladeBeispiele } = await import('../src/beispiele/beispiele');
        await ladeBeispiele(d);
        const beispiele = await d.mappentypen.listeTypen();
        const name = (n: string) => beispiele.find((x) => x.name === n)?.mehrzahl ?? '';
        assert.deepEqual(['Vertragspartner', 'Vertrag', 'Rechnung', 'Zahlung'].map(name), [
          'Vertragspartner',
          'Verträge',
          'Rechnungen',
          'Zahlungen',
        ]);
      });
    },
  );
}
