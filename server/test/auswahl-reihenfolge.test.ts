/**
 * Reihenfolge der Auswahl an Verweisfeldern (#1671):
 * - Mappentyp: Einstellung gespeichert, bereinigt und geprüft (Feld des einen Zieltyps oder Titel/Angelegt/Geändert).
 * - Seite der Auswahl (`feld:<typ>:<feld>` und `typ:<id>`): ohne Einstellung Titel in natürlicher Reihenfolge, mit
 *   Einstellung nach dem Feld des Zieltyps – auch absteigend, damit das neueste Steuerjahr auf der ersten Seite steht.
 *   Im Arbeitsspeicher und – mit TEST_DATABASE_URL – in PostgreSQL.
 * - Paketformat: `auswahlReihenfolge` am Verweisfeld wird gelesen und installiert (Vorbelegung durch Pakete).
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';
import {
  auswahlReihenfolgeProbleme,
  auswahlSortierung,
  bereinigeAuswahlReihenfolge,
  natuerlicherSchluessel,
} from '../../shared/src/auswahlreihenfolge';
import { typBild, typUnterschiede } from '../../shared/src/typvergleich';
import type { Feld } from '../../shared/src/model';
import { speicherDateien } from '../src/dateien/dateispeicher';
import { Dienst } from '../src/dienst/dienst';
import { speicherEinstellungen } from '../src/einstellungen/einstellungen';
import { Fachfehler } from '../src/grundlagen/fehler';
import { zipPuffer } from '../src/formate/zip';
import { liesPaket, liesZip, Paketverwaltung } from '../src/pakete/verwaltung/index';
import type { Repo } from '../src/repo';
import { speicherRepo } from '../src/repo/speicher';
import { eigeneDatenbank } from './hilfe-db';

const ICH = { id: '00000000-0000-4000-8000-0000000000aa', rolle: 'admin', email: 'admin@example.org' };
const meldet = (re: RegExp) => (e: unknown) => e instanceof Fachfehler && re.test(JSON.stringify(e.details ?? {}) + e.message);

/** Steuerjahre 2009 … 2030 (mehr als die 20 der ersten Seite) und eine Steuererklärung mit zwei Verweisfeldern. */
async function aufbau(repo: Repo) {
  const d = new Dienst(repo, speicherDateien(), { einstellungen: speicherEinstellungen() });
  const steuerjahr = await d.mappentypen.legeTypAn({
    name: 'Steuerjahr',
    titelVorlage: '{name}',
    felder: [
      { key: 'name', label: 'Name', typ: 'text' },
      { key: 'jahr', label: 'Jahr', typ: 'zahl' },
      { key: 'notiz', label: 'Notiz', typ: 'langtext' },
    ],
  });
  const erklaerung = await d.mappentypen.legeTypAn({
    name: 'Steuererklärung',
    felder: [
      {
        key: 'jahr',
        label: 'Steuerjahr',
        typ: 'referenz',
        zielTypen: [steuerjahr.id],
        auswahlReihenfolge: { feld: 'jahr', absteigend: true },
      },
      { key: 'vorjahr', label: 'Vorjahr', typ: 'referenz', zielTypen: [steuerjahr.id], pflicht: false },
    ],
  });
  const jahr = (j: number) => d.mappen.legeMappeAn({ typId: steuerjahr.id, werte: { name: `Steuerjahr ${j}`, jahr: j } });
  for (let j = 2030; j >= 2009; j--) await jahr(j);
  // Titel mit unterschiedlich langen Zahlen: „Steuerjahr 9“ gehört vor „Steuerjahr 10“.
  await jahr(9);
  await jahr(10);
  return { d, steuerjahr, erklaerung };
}

const titel = async (d: Dienst, q: Record<string, unknown>) =>
  (await d.sichten.seite(ICH, { von: 0, anzahl: 20, ...q })).mappen.map((m) => m.titel);

function faelle(neuesRepo: () => Promise<Repo>) {
  it('ohne Einstellung: Titel aufsteigend, Zahlen als Zahlen', async () => {
    const { d, erklaerung } = await aufbau(await neuesRepo());
    const s = auswahlSortierung(erklaerung.felder.find((f) => f.key === 'vorjahr')!.auswahlReihenfolge);
    const t = await titel(d, { sicht: `feld:${erklaerung.id}:vorjahr`, sortierung: s.spalte, absteigend: String(s.absteigend) });
    assert.deepEqual(t.slice(0, 4), ['Steuerjahr 9', 'Steuerjahr 10', 'Steuerjahr 2009', 'Steuerjahr 2010']);
    // Absteigend nach Titel, ebenfalls natürlich.
    const ab = await titel(d, { sicht: `feld:${erklaerung.id}:vorjahr`, sortierung: s.spalte, absteigend: 'true' });
    assert.deepEqual(ab.slice(0, 2), ['Steuerjahr 2030', 'Steuerjahr 2029']);
  });

  it('mit Einstellung: nach „Jahr“ absteigend – das neueste Jahr steht auf der ersten Seite', async () => {
    const { d, steuerjahr, erklaerung } = await aufbau(await neuesRepo());
    const s = auswahlSortierung(erklaerung.felder.find((f) => f.key === 'jahr')!.auswahlReihenfolge);
    assert.deepEqual(s, { spalte: 'jahr', absteigend: true });
    for (const sicht of [`feld:${erklaerung.id}:jahr`, `typ:${steuerjahr.id}`]) {
      const t = await titel(d, { sicht, sortierung: s.spalte, absteigend: 'true' });
      assert.equal(t.length, 20, sicht);
      assert.deepEqual(t.slice(0, 3), ['Steuerjahr 2030', 'Steuerjahr 2029', 'Steuerjahr 2028'], sicht);
    }
    // Mit Suche gilt dieselbe Reihenfolge.
    const mitSuche = await titel(d, { sicht: `feld:${erklaerung.id}:jahr`, suche: 'Steuerjahr', sortierung: 'jahr', absteigend: 'true' });
    assert.equal(mitSuche[0], 'Steuerjahr 2030');
  });
}

describe('Reihenfolge der Auswahl – Mappentyp (#1671)', () => {
  it('wird bereinigt, gespeichert, im Typvergleich genannt und geprüft', async () => {
    assert.deepEqual(bereinigeAuswahlReihenfolge({ feld: ' jahr ', absteigend: true, x: 1 }), { feld: 'jahr', absteigend: true });
    assert.deepEqual(bereinigeAuswahlReihenfolge({ feld: '_erstellt', absteigend: 'ja' }), { feld: '_erstellt' });
    assert.equal(bereinigeAuswahlReihenfolge({ feld: '_typ' }), undefined);
    assert.equal(bereinigeAuswahlReihenfolge('jahr'), undefined);
    assert.equal(natuerlicherSchluessel('A 9') < natuerlicherSchluessel('A 10'), true);

    const { d, steuerjahr, erklaerung } = await aufbau(speicherRepo());
    assert.deepEqual(erklaerung.felder[0].auswahlReihenfolge, { feld: 'jahr', absteigend: true });
    assert.equal(erklaerung.felder[1].auswahlReihenfolge, undefined);
    // Nur an Verweisfeldern – an anderen fällt die Angabe weg.
    const text = await d.mappentypen.legeTypAn({
      name: 'Notiz',
      felder: [{ key: 'x', label: 'X', typ: 'text', auswahlReihenfolge: { feld: '_titel' } } as Feld],
    });
    assert.equal(text.felder[0].auswahlReihenfolge, undefined);
    // Feld, das es im Zieltyp nicht gibt oder nach dem sich nicht sortieren lässt (Langtext): gemeldet.
    for (const feld of ['gibtsnicht', 'notiz'])
      await assert.rejects(
        d.mappentypen.legeTypAn({
          name: `Falsch ${feld}`,
          felder: [{ key: 'j', label: 'J', typ: 'referenz', zielTypen: [steuerjahr.id], auswahlReihenfolge: { feld } }],
        }),
        meldet(/Reihenfolge der Auswahl/),
      );
    // Mehrere Zieltypen: nur Titel, Angelegt, Zuletzt geändert.
    const andere = await d.mappentypen.legeTypAn({ name: 'Anderes', felder: [{ key: 'jahr', label: 'Jahr', typ: 'zahl' }] });
    await assert.rejects(
      d.mappentypen.legeTypAn({
        name: 'Zwei Ziele',
        felder: [{ key: 'j', label: 'J', typ: 'referenz', zielTypen: [steuerjahr.id, andere.id], auswahlReihenfolge: { feld: 'jahr' } }],
      }),
      meldet(/genau einem Ziel-Mappentyp/),
    );
    const zwei = await d.mappentypen.legeTypAn({
      name: 'Zwei Ziele',
      felder: [
        {
          key: 'j',
          label: 'J',
          typ: 'referenz',
          zielTypen: [steuerjahr.id, andere.id],
          auswahlReihenfolge: { feld: '_geaendert', absteigend: true },
        },
      ],
    });
    assert.deepEqual(zwei.felder[0].auswahlReihenfolge, { feld: '_geaendert', absteigend: true });
    const ohne = { ...erklaerung, felder: erklaerung.felder.map((f) => ({ ...f, auswahlReihenfolge: undefined })) };
    assert.match(typUnterschiede(typBild(ohne), typBild(erklaerung))?.liste.join(' ') ?? '', /Steuerjahr“: Reihenfolge der Auswahl/);
    assert.deepEqual(
      auswahlReihenfolgeProbleme({ key: 'x', label: 'X', typ: 'text', auswahlReihenfolge: { feld: '_titel' } }, () => []),
      ['„Reihenfolge der Auswahl“ gibt es nur bei Verweisfeldern.'],
    );
  });
});

describe('Reihenfolge der Auswahl – Seite im Arbeitsspeicher (#1671)', () => faelle(async () => speicherRepo()));

const url = process.env.TEST_DATABASE_URL;
describe('Reihenfolge der Auswahl – Seite in PostgreSQL (#1671)', { skip: url ? false : 'TEST_DATABASE_URL nicht gesetzt' }, () => {
  faelle(async () => {
    const db = await eigeneDatenbank('reihenfolge', { jeTest: true });
    const { pgRepo } = await import('../src/repo/pg');
    const h = randomUUID();
    await db.sql`INSERT INTO haushalte (id, name) VALUES (${h}, 'Test')`;
    await db.sql`INSERT INTO benutzer (id, haushalt_id, email, name, rolle) VALUES (${ICH.id}, ${h}, ${ICH.email}, 'Ich', 'admin')`;
    return pgRepo(db.sql, h);
  });
});

/* ---------- Paketformat ---------- */

const archiv = (d: Record<string, string>) =>
  zipPuffer(
    Object.entries(d).map(([name, inhalt]) => ({ name, daten: Buffer.from(inhalt) })),
    new Date('2026-01-01T12:00:00Z'),
  );
const PAKET = {
  'manifest.yaml': `schema: 1\nid: steuern\nname: Steuern\nversion: 1.0.0\nbeschreibung: Test.\nautor: { name: Test, github: test }\nlizenz: MIT\ndms: ">=0.60.0"\ninhalt:\n  mappentypen: inhalt/mappentypen.yaml\n`,
  'inhalt/mappentypen.yaml': `- schluessel: steuerjahr
  name: Steuerjahr
  titelVorlage: "Steuerjahr {jahr}"
  felder:
    - { key: jahr, label: Jahr, typ: zahl }
  register:
    - { key: daten, name: Daten, art: felder, felder: [jahr] }
- schluessel: beleg
  name: Beleg
  felder:
    - { key: steuerjahr, label: Steuerjahr, typ: referenz, ziel: steuerjahr, auswahlReihenfolge: { feld: jahr, absteigend: true } }
  register:
    - { key: daten, name: Daten, art: felder, felder: [steuerjahr] }
`,
};

describe('Reihenfolge der Auswahl – Paketformat (#1671)', () => {
  it('Pakete belegen die Reihenfolge vor: lesen und installieren', async () => {
    const p = liesPaket(liesZip(archiv(PAKET)));
    assert.deepEqual(p.typen.find((x) => x.schluessel === 'beleg')?.felder[0].auswahlReihenfolge, { feld: 'jahr', absteigend: true });
    const d = new Dienst(speicherRepo(), speicherDateien(), { einstellungen: speicherEinstellungen() });
    const v = new Paketverwaltung(d, {
      version: () => '0.326.0',
      abruf: async (u) => {
        throw new Error(`404 ${u}`);
      },
      katalogUrl: 'https://katalog.test/katalog.json',
    });
    const h = await v.hochladen(archiv(PAKET), ICH);
    const r = await v.installiere({ upload: h.upload, bestaetigt: true }, ICH);
    const beleg = (await d.mappentypen.listeTypen()).find((x) => x.id === r.typen.beleg)!;
    assert.deepEqual(beleg.felder[0].auswahlReihenfolge, { feld: 'jahr', absteigend: true });
  });
});
