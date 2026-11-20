/**
 * Pakete mit Teil-Typen und Tabellen entfernen (#1521). Mini-Paket nach dem Vorbild von „Rechnungen und Bestellungen“:
 * Rechnung ↔ Rechnungsposition und Steuerzeile (Teil-Typen #1031 über `gehoertZu`, Tabellen #1030 an der Rechnung),
 * dazu ein Abschnitt „Fahrzeug“ und ein Feld mit Bedingungen auf das optionale Ziel `fahrzeuge:fahrzeug` (#1036, #1122).
 * - in einem Schritt entfernen, ohne und mit Mappen (Beispielen),
 * - nach dem Entfernen von Fahrzeuge lässt sich die Rechnung weiter speichern und das Paket entfernen,
 * - aus einem halb entfernten Stand gelingt ein weiterer Versuch,
 * - scheitert das Entfernen, bleibt alles wie vorher (nur PostgreSQL: der Arbeitsspeicher kennt kein Zurückrollen).
 * Der Kern läuft im Arbeitsspeicher und – mit TEST_DATABASE_URL – gegen PostgreSQL.
 */
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import type { Mappentyp } from '../../shared/src/model';
import { speicherDateien } from '../src/dateien/dateispeicher';
import { Dienst } from '../src/dienst/dienst';
import { speicherEinstellungen } from '../src/einstellungen/einstellungen';
import { Fachfehler } from '../src/grundlagen/fehler';
import { Paketverwaltung } from '../src/pakete/verwaltung/index';
import type { Repo } from '../src/repo';
import { speicherRepo } from '../src/repo/speicher';
import { zipPuffer } from '../src/formate/zip';
import { eigeneDatenbank } from './hilfe-db';

const url = process.env.TEST_DATABASE_URL;
const ICH = { id: '00000000-0000-4000-8000-0000000000aa', email: 'markus@example.org' };
const HAUSHALT = '00000000-0000-4000-8000-000000000001';
const offen: Array<{ end(): Promise<void> }> = [];
after(async () => {
  for (const s of offen) await s.end();
});

async function repo(pg: boolean): Promise<Repo> {
  if (!pg) return speicherRepo();
  const { pgRepo } = await import('../src/repo/pg');
  const { sql } = await eigeneDatenbank('entfernen_teile', { jeTest: true });
  offen.push(sql);
  await sql`INSERT INTO haushalte (id, name) VALUES (${HAUSHALT}, 'Test') ON CONFLICT DO NOTHING`;
  await sql`INSERT INTO benutzer (id, haushalt_id, email, name, rolle) VALUES (${ICH.id}, ${HAUSHALT}, ${ICH.email}, 'Markus', 'admin') ON CONFLICT DO NOTHING`;
  return pgRepo(sql, HAUSHALT) as never;
}

const archiv = (d: Record<string, string>) =>
  zipPuffer(
    Object.entries(d).map(([name, inhalt]) => ({ name, daten: Buffer.from(inhalt) })),
    new Date('2026-01-01T12:00:00Z'),
  );
function paket(id: string, name: string, typen: string, o: { abh?: string[]; sichten?: string; beispiele?: string } = {}) {
  return {
    'manifest.yaml':
      `schema: 1\nid: ${id}\nname: ${name}\nversion: 1.0.0\nbeschreibung: Test.\nautor: { name: Test, github: test }\nlizenz: MIT\ndms: ">=0.232.0"\n` +
      (o.abh?.length ? `abhaengigkeiten:\n${o.abh.map((a) => `  ${a}: ">=1.0.0"\n`).join('')}` : '') +
      `inhalt:\n  mappentypen: inhalt/mappentypen.yaml\n` +
      (o.sichten ? '  sichten: inhalt/sichten.yaml\n' : '') +
      (o.beispiele ? '  beispiele: inhalt/beispiele.yaml\n' : ''),
    'inhalt/mappentypen.yaml': typen,
    ...(o.sichten ? { 'inhalt/sichten.yaml': o.sichten } : {}),
    ...(o.beispiele ? { 'inhalt/beispiele.yaml': o.beispiele } : {}),
  };
}

const FAHRZEUG_BEDINGUNG =
  '{ bedingungen: [{ art: feld, bedingung: { feld: betrifft, op: zeigtAufTyp, wert: { art: fest, wert: ["fahrzeuge:fahrzeug"] } } }] }';
const teil = (schluessel: string, name: string) => `- schluessel: ${schluessel}
  name: ${name}
  gehoertZu: rechnung
  felder:
    - { key: rechnung, label: Rechnung, typ: referenz, ziel: rechnung, pflicht: true, verweisart: zugehoerigkeit }
    - { key: text, label: Text, typ: text }
  register: [{ key: daten, name: Daten, art: felder, felder: [rechnung, text] }]
`;
const TYPEN =
  `- schluessel: vertrag
  name: Vertrag
  felder:
    - { key: name, label: Name, typ: text }
    - { key: rechnungen, label: Rechnungen, typ: referenz, mehrfach: true, ziel: rechnung }
  register: [{ key: daten, name: Daten, art: felder, felder: [name, rechnungen] }]
- schluessel: rechnung
  name: Rechnung
  felder:
    - { key: nr, label: Nummer, typ: text }
    - { key: betrifft, label: Betrifft, typ: referenz, mehrfach: true, ziel: vertrag, zielOptional: ["fahrzeuge:fahrzeug"] }
    - { key: kennzeichen, label: Kennzeichen, typ: text, anzeigen: { bedingungen: [{ art: verweistyp, feld: betrifft, typ: "fahrzeuge:fahrzeug" }] } }
    - { key: km, label: Kilometerstand, typ: zahl }
    - { key: positionen, label: Positionen, typ: tabelle, quelle: { typ: rechnungsposition, feld: rechnung } }
    - { key: steuer, label: Umsatzsteuer aufteilen, typ: tabelle, quelle: { typ: steuerzeile, feld: rechnung } }
  register:
    - key: daten
      name: Daten
      art: felder
      felder: [nr, betrifft, kennzeichen, km, positionen, steuer]
      abschnitte: [{ vor: km, titel: Fahrzeug, anzeigen: ${FAHRZEUG_BEDINGUNG} }]
` +
  teil('rechnungsposition', 'Rechnungsposition') +
  teil('steuerzeile', 'Steuerzeile');
const SICHTEN = '- { schluessel: rechnungen, name: Rechnungen, typen: [rechnung] }\n';
const BEISPIELE = [
  '- { typ: vertrag, schluessel: strom, werte: { name: Strom } }',
  '- { typ: rechnung, schluessel: r1, werte: { nr: R-1, betrifft: [{ beispiel: strom }] } }',
  '- { typ: rechnungsposition, werte: { rechnung: { beispiel: r1 }, text: Grundpreis } }',
  '- { typ: steuerzeile, werte: { rechnung: { beispiel: r1 }, text: "19 %" } }',
  '',
].join('\n');
const RECHNUNGEN = paket('rechnungen', 'Rechnungen und Bestellungen', TYPEN, { sichten: SICHTEN, beispiele: BEISPIELE });
const FAHRZEUGE = paket(
  'fahrzeuge',
  'Fahrzeuge',
  `- schluessel: fahrzeug
  name: Fahrzeug
  felder: [{ key: name, label: Name, typ: text }]
  register:
    - { key: daten, name: Daten, art: felder, felder: [name] }
    - { key: rechnungen, name: Rechnungen, art: verknuepfungen, quellen: [{ typ: "rechnungen:rechnung", feld: betrifft }] }
`,
  { abh: ['rechnungen'] },
);

async function aufbau(pg: boolean) {
  const d = new Dienst(await repo(pg), speicherDateien(), { einstellungen: speicherEinstellungen() });
  const p = new Paketverwaltung(d, {
    version: () => '0.300.0',
    katalogUrl: 'https://katalog.test/katalog.json',
    abruf: async (u) => {
      throw new Error(`404 ${u}`);
    },
  });
  const installiere = async (dateien: Record<string, string>, beispiele = false) => {
    const h = await p.hochladen(archiv(dateien), ICH);
    return p.installiere({ upload: h.upload, bestaetigt: true, beispiele }, ICH);
  };
  // Was das DMS beim ersten Installieren selbst anlegt (Systemtypen, Ansichten), soll den Vergleich nicht stören.
  await installiere(
    paket(
      'grund',
      'Grund',
      '- { schluessel: notiz, name: Notiz, felder: [{ key: text, label: Text, typ: text }], register: [{ key: daten, name: Daten, art: felder, felder: [text] }] }\n',
    ),
  );
  const typ = async (id: string) => (await d.mappentypen.listeTypen()).find((t) => t.id === id);
  const stand = async () => ({
    pakete: (await p.installierte()).map((x) => x.id).sort(),
    typen: (await d.mappentypen.listeTypen()).map((t) => ({ id: t.id, felder: t.felder.map((f) => f.key), teilVon: t.teilVon ?? null })),
    sichten: (await d.sichtenVerwaltung.listeSichten()).map((s) => s.id).sort(),
    mappen: (await Promise.all((await d.mappentypen.listeTypen()).map((t) => d.mappen.listeMappen(t.id)))).flat().length,
  });
  return { d, p, installiere, typ, stand };
}

const abschnitt = (t: Mappentyp) => t.register.find((r) => r.key === 'daten')!.abschnitte![0].anzeigen!.bedingungen[0];

for (const pg of [false, true]) {
  describe(
    `Pakete mit Teil-Typen und Tabellen entfernen (#1521)${pg ? ' – PostgreSQL' : ''}`,
    { skip: pg && !url ? 'TEST_DATABASE_URL nicht gesetzt' : false },
    () => {
      it('in einem Schritt, ohne Mappen', async () => {
        const { d, p, installiere, stand } = await aufbau(pg);
        const vorher = await stand();
        const r = await installiere(RECHNUNGEN);
        const pos = (await d.mappentypen.listeTypen()).find((t) => t.id === r.typen.rechnungsposition)!;
        assert.equal(pos.teilVon, 'rechnung', 'Teil-Typ wie in Rechnungen und Bestellungen');
        await p.entferne('rechnungen', ICH);
        assert.deepEqual(await stand(), vorher);
      });

      it('in einem Schritt, mit Mappen (unveränderte Beispiele samt Positionen und Steuerzeilen)', async () => {
        const { d, p, installiere, stand } = await aufbau(pg);
        const vorher = await stand();
        const r = await installiere(RECHNUNGEN, true);
        assert.equal((await d.mappen.listeMappen(r.typen.rechnungsposition)).length, 1);
        assert.equal((await stand()).mappen - vorher.mappen, 4);
        await p.entferne('rechnungen', ICH);
        assert.deepEqual(await stand(), vorher);
      });

      it('nach dem Entfernen von Fahrzeuge: Rechnung lässt sich speichern, Rechnungen entfernen; Fahrzeuge kommt wieder', async () => {
        const { d, p, installiere, typ, stand } = await aufbau(pg);
        const vorher = await stand();
        const r = await installiere(RECHNUNGEN);
        const f = await installiere(FAHRZEUGE);
        const mit = (await typ(r.typen.rechnung))!;
        assert.deepEqual(abschnitt(mit), {
          art: 'feld',
          bedingung: { art: 'feld', feld: 'betrifft', op: 'zeigtAufTyp', wert: { art: 'fest', wert: [f.typen.fahrzeug] } },
        });
        await p.entferne('fahrzeuge', ICH);
        const ohne = (await typ(r.typen.rechnung))!;
        assert.deepEqual(abschnitt(ohne), {
          art: 'feld',
          bedingung: { art: 'feld', feld: 'betrifft', op: 'zeigtAufTyp', wert: { art: 'fest', wert: ['fahrzeuge:fahrzeug'] } },
        });
        assert.deepEqual(ohne.felder.find((x) => x.key === 'kennzeichen')!.anzeigen!.bedingungen, [
          { art: 'verweistyp', feld: 'betrifft', typ: 'fahrzeuge:fahrzeug' },
        ]);
        await d.mappentypen.aendereTyp(ohne.id, { ...ohne, beschreibung: 'Nur der Text ist neu.' });
        // Kommt Fahrzeuge wieder, zeigen die Bedingungen wieder auf den Typ.
        const f2 = await installiere(FAHRZEUGE);
        const b = abschnitt((await typ(r.typen.rechnung))!);
        assert.deepEqual(b.art === 'feld' && b.bedingung.wert, { art: 'fest', wert: [f2.typen.fahrzeug] });
        await p.entferne('fahrzeuge', ICH);
        await p.entferne('rechnungen', ICH);
        assert.deepEqual(await stand(), vorher);
      });

      it('aus einem halb entfernten Stand gelingt ein weiterer Versuch', async () => {
        const { d, p, installiere, typ, stand } = await aufbau(pg);
        const vorher = await stand();
        const r = await installiere(RECHNUNGEN);
        // So stand es bei Thomas: Tabellen schon weg, Bedingung zeigt auf die Id des entfernten Fahrzeug-Typs.
        const t = (await typ(r.typen.rechnung))!;
        const daten = t.register.find((x) => x.key === 'daten')!;
        await d.kern.repo.aendereTyp(t.id, {
          ...t,
          felder: t.felder.filter((x) => x.typ !== 'tabelle'),
          register: [
            {
              ...daten,
              felder: daten.felder!.filter((x) => x !== 'positionen' && x !== 'steuer'),
              abschnitte: [
                {
                  ...daten.abschnitte![0],
                  anzeigen: {
                    modus: 'alle',
                    bedingungen: [
                      {
                        art: 'feld',
                        bedingung: {
                          art: 'feld',
                          feld: 'betrifft',
                          op: 'zeigtAufTyp',
                          wert: { art: 'fest', wert: ['f0000000-0000-4000-8000-00000000dead'] },
                        },
                      },
                    ],
                  },
                },
              ],
            },
          ],
        });
        await p.entferne('rechnungen', ICH);
        assert.deepEqual(await stand(), vorher);
      });

      it(
        'scheitert das Entfernen, bleibt alles wie vorher; danach gelingt es',
        { skip: pg ? false : 'Arbeitsspeicher ohne Zurückrollen' },
        async () => {
          const { d, p, installiere, stand } = await aufbau(pg);
          const leer = await stand();
          const r = await installiere(RECHNUNGEN, true);
          const vorher = await stand();
          // Wie bei Basis: Ein Typ lässt sich erst ganz am Ende nicht löschen.
          const loescheTyp = d.mappentypen.loescheTyp.bind(d.mappentypen);
          d.mappentypen.loescheTyp = async (id: string) => {
            if (id === r.typen.vertrag) throw new Fachfehler(409, 'Vertrag wird noch gebraucht.');
            return loescheTyp(id);
          };
          await assert.rejects(
            p.entferne('rechnungen', ICH),
            (e) =>
              e instanceof Fachfehler &&
              /nichts verändert/.test(e.message) &&
              ((e.details as { gruende?: string[] }).gruende ?? []).some((g) => /noch gebraucht/.test(g)),
          );
          assert.deepEqual(await stand(), vorher, 'Typen samt Tabellen, Ansichten, Beispiele und Paket wie vorher');
          d.mappentypen.loescheTyp = loescheTyp;
          await p.entferne('rechnungen', ICH);
          assert.deepEqual(await stand(), leer);
        },
      );
    },
  );
}
