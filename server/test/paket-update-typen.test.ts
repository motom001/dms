/**
 * Paket-Update übernimmt Änderungen an Mappentypen (#1658): Titel-Vorlage, Typ-Eigenschaften, Feld-Eigenschaften,
 * Reihenfolge im Register und entfallene Felder – solange die Verwaltung den Teil nicht selbst geändert hat (Prüfwert
 * je Teil gegen den Paketstand, wie bei Ansichten #1125). Entfallende Felder mit Werten: Werte im Hintergrund in die
 * Notiz (Kommentar Entwicklung, „Mittelweg für Lena“), umbenannte ins neue Feld; „Feld behalten“ auf Wunsch; Fassung vor
 * dem Update bleibt. Testpakete wie Finanzen 2.2.0 → 3.1.0 (dms-registry #252, #256), nachgebaut – mit Speicher und
 * PostgreSQL.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { speicherDateien } from '../src/dateien/dateispeicher';
import { Dienst } from '../src/dienst/dienst';
import { speicherEinstellungen } from '../src/einstellungen/einstellungen';
import { liesPaket, liesZip, Paketverwaltung } from '../src/pakete/verwaltung/index';
import { UPDATE_WERTE, UpdateWerte, type WerteAuftrag } from '../src/pakete/index';
import type { Repo } from '../src/repo';
import { speicherRepo } from '../src/repo/speicher';
import { zipPuffer } from '../src/formate/zip';
import { Fachfehler } from '../src/grundlagen/fehler';
import { eigeneDatenbank } from './hilfe-db';

const ICH = { id: '00000000-0000-4000-8000-0000000000ab', email: 'admin@example.org' };
const HAUSHALT_ID = '00000000-0000-4000-8000-000000000002';

const manifest = (version: string, extra = '') =>
  `schema: 1\nid: finanzen\nname: Finanzen\nversion: ${version}\nbeschreibung: Test.\nautor: { name: Lena Beispiel, github: lena-beispiel }\nlizenz: MIT\ndms: ">=0.230.0"\nherausgeber: org.example\ninhalt:\n  mappentypen: inhalt/mappentypen.yaml\n${extra}`;
const zip = (d: Record<string, string>) =>
  zipPuffer(
    Object.entries(d).map(([name, inhalt]) => ({ name, daten: Buffer.from(inhalt) })),
    new Date('2026-01-01T12:00:00Z'),
  );

/** Finanzen 2.2.0: Kontoauszug mit „Zeitraum“, Titel aus dem Zeitraum. */
const FINANZEN_2 = {
  'manifest.yaml': manifest('2.2.0'),
  'inhalt/mappentypen.yaml': [
    '- schluessel: kontoauszug',
    '  name: Kontoauszug',
    '  beschreibung: Auszüge eines Kontos.',
    '  titelVorlage: "{konto} {zeitraum}"',
    '  felder:',
    '    - { key: konto, label: Konto, typ: text }',
    '    - { key: zeitraum, label: Zeitraum, typ: text }',
    '    - { key: datum, label: Datum, typ: datum }',
    '    - { key: art, label: Art, typ: auswahl, optionen: [Giro, Spar, Alt] }',
    '    - { key: saldo, label: Saldo, typ: betrag, hilfe: Stand am Ende. }',
    '  register:',
    '    - { key: allgemein, name: Allgemein, art: felder, felder: [konto, zeitraum, datum, art, saldo] }',
    '',
  ].join('\n'),
};
/**
 * Finanzen 3.1.0: „Zeitraum“ entfällt (#252), neue Titel-Vorlage (#256), „Datum“ heißt „Auszugsdatum“ mit Hilfe,
 * „Saldo“ bekommt eine Grenze, „Art“ neue Optionen ohne „Alt“, Reihenfolge im Register geändert.
 */
const FINANZEN_3 = (extra = '', felder = '') => ({
  'manifest.yaml': manifest('3.1.0', extra),
  'inhalt/mappentypen.yaml': [
    '- schluessel: kontoauszug',
    '  name: Kontoauszug',
    '  beschreibung: Auszüge eines Kontos, je Monat.',
    '  mehrzahl: Kontoauszüge',
    '  titelVorlage: "{konto} {datum}"',
    '  felder:',
    '    - { key: konto, label: Konto, typ: text }',
    '    - { key: datum, label: Auszugsdatum, typ: datum, hilfe: Datum auf dem Auszug. }',
    '    - { key: art, label: Art, typ: auswahl, optionen: [Giro, Spar, Kredit] }',
    '    - { key: saldo, label: Saldo, typ: betrag, hilfe: Stand am Ende., min: 0 }',
    felder,
    '  register:',
    `    - { key: allgemein, name: Allgemein, art: felder, felder: [datum, konto, art, saldo${felder ? ', abrechnungszeitraum' : ''}] }`,
    '',
  ]
    .filter((x) => x !== '')
    .join('\n')
    .concat('\n'),
});
/** Umbenennen per Umbau-Schritt in denselben Typ (#1041): zeitraum → abrechnungszeitraum. */
const FINANZEN_3_UMBENANNT = FINANZEN_3(
  'umbau:\n  - von: kontoauszug\n    nach: kontoauszug\n    felder: { zeitraum: abrechnungszeitraum }\n',
  '    - { key: abrechnungszeitraum, label: Abrechnungszeitraum, typ: text }',
);

async function repo(pg: boolean): Promise<Repo> {
  if (!pg) return speicherRepo();
  const { pgRepo } = await import('../src/repo/pg');
  const sql = (await eigeneDatenbank('updatetypen', { jeTest: true })).sql;
  await sql`INSERT INTO haushalte (id, name) VALUES (${HAUSHALT_ID}, 'Test') ON CONFLICT DO NOTHING`;
  await sql`INSERT INTO benutzer (id, haushalt_id, email, name, rolle) VALUES (${ICH.id}, ${HAUSHALT_ID}, ${ICH.email}, 'Admin', 'admin') ON CONFLICT DO NOTHING`;
  return pgRepo(sql, HAUSHALT_ID) as never;
}

describe('Paketformat: Felder umbenennen per Umbau-Schritt in denselben Typ (#1658)', () => {
  it('von = nach: nur „felder“, das alte Feld entfällt, das neue gibt es; landet in umbenennen, nicht im Umbau', () => {
    const p = liesPaket(liesZip(zip(FINANZEN_3_UMBENANNT)));
    assert.equal(p.umbau, undefined);
    assert.deepEqual(
      p.umbenennen?.map((s) => s.felder),
      [{ zeitraum: 'abrechnungszeitraum' }],
    );
    const falsch = (umbau: string) => () => liesPaket(liesZip(zip({ ...FINANZEN_3_UMBENANNT, 'manifest.yaml': manifest('3.1.0', umbau) })));
    const grund = (re: RegExp) => (e: unknown) =>
      e instanceof Fachfehler && ((e.details as { gruende?: string[] })?.gruende ?? []).some((g) => re.test(g));
    assert.throws(
      falsch('umbau:\n  - von: kontoauszug\n    nach: kontoauszug\n    felder: { konto: abrechnungszeitraum }\n'),
      grund(/„konto“ bringt der Mappentyp weiter mit/),
    );
    assert.throws(
      falsch(
        'umbau:\n  - von: kontoauszug\n    nach: kontoauszug\n    felder: { zeitraum: abrechnungszeitraum }\n    setzen: { konto: X }\n',
      ),
      grund(/benennt nur Felder um/),
    );
  });
});

for (const pg of [false, true]) {
  describe(
    `Paket-Update übernimmt Änderungen an Mappentypen (#1658)${pg ? ' – PostgreSQL' : ''}`,
    { skip: pg && !process.env.TEST_DATABASE_URL ? 'TEST_DATABASE_URL nicht gesetzt' : false },
    () => {
      async function aufbau() {
        const r = await repo(pg);
        const d = new Dienst(r, speicherDateien(), { einstellungen: speicherEinstellungen() });
        const p = new Paketverwaltung(d, {
          version: () => '0.330.0',
          katalogUrl: 'https://katalog.test/katalog.json',
          abruf: async () => {
            throw new Error('ohne Netz');
          },
          dienstkonto: async () => (pg ? ICH.id : '00000000-0000-4000-8000-0000000000de'),
        });
        const hoch = async (dateien: Record<string, string>) => p.hochladen(zip(dateien), ICH);
        const installiere = async (dateien: Record<string, string>, mehr: Record<string, unknown> = {}) =>
          p.installiere({ upload: (await hoch(dateien)).upload, bestaetigt: true, ...mehr }, ICH);
        const typ = async () => (await d.mappentypen.listeTypen()).find((x) => x.schluessel === 'finanzen:kontoauszug')!;
        const mappe = async (werte: Record<string, unknown>) => (await d.mappen.legeMappeAn({ typId: (await typ()).id, werte }, ICH.id)).id;
        const notizen = async (id: string) => (await d.kern.repo.notizenVon([id])).map((n) => n.text);
        return { d, p, hoch, installiere, typ, mappe, notizen };
      }

      it('ohne Werte: „Zeitraum“ entfällt, neue Titel-Vorlage, Feld-Eigenschaften, Optionen und Reihenfolge – Vorschau sagt es', async () => {
        const x = await aufbau();
        await x.installiere(FINANZEN_2);
        // Eine Mappe nutzt „Alt“, aber keine den Zeitraum.
        await x.mappe({ konto: 'Giro 1', art: 'Alt' });
        const { vorschau, upload } = await x.hoch(FINANZEN_3());
        const t = vorschau.typen[0];
        assert.deepEqual(
          t.entfaellt?.map((e) => [e.label, e.anzahl, e.zustand]),
          [['Zeitraum', 0, 'aktualisiert']],
        );
        assert.deepEqual(
          t.aenderungen?.map((a) => [a.art, a.name, a.was, a.zustand]),
          [
            ['typ', 'Kontoauszug', ['titelVorlage', 'beschreibung', 'mehrzahl'], 'aktualisiert'],
            ['feld', 'Datum', ['label', 'hilfe'], 'aktualisiert'],
            ['feld', 'Art', ['optionen'], 'aktualisiert'],
            ['feld', 'Saldo', ['min'], 'aktualisiert'],
            ['register', 'Allgemein', ['felder'], 'aktualisiert'],
          ],
        );
        await x.p.installiere({ upload, bestaetigt: true }, ICH);
        const ty = await x.typ();
        assert.equal(ty.titelVorlage, '{konto} {datum}');
        assert.equal(ty.beschreibung, 'Auszüge eines Kontos, je Monat.');
        assert.equal(ty.mehrzahl, 'Kontoauszüge');
        assert.ok(!ty.felder.some((f) => f.key === 'zeitraum'), 'Zeitraum entfernt');
        const datum = ty.felder.find((f) => f.key === 'datum')!;
        assert.deepEqual([datum.label, datum.hilfe], ['Auszugsdatum', 'Datum auf dem Auszug.']);
        assert.equal(ty.felder.find((f) => f.key === 'saldo')!.min, 0);
        assert.deepEqual(
          ty.felder.find((f) => f.key === 'art')!.optionen,
          ['Giro', 'Spar', 'Kredit', 'Alt'],
          '„Alt“ nutzt eine Mappe: bleibt',
        );
        assert.deepEqual(ty.register.find((r) => r.key === 'allgemein')!.felder, ['datum', 'konto', 'art', 'saldo']);
        // Paketstand danach: so, wie das Update geschrieben hat – das nächste Update sieht alles als unverändert.
        const stand = (await x.p.installierte()).find((y) => y.id === 'finanzen')!.typStand![ty.id];
        assert.equal(stand.titelVorlage, '{konto} {datum}');
        assert.ok(!stand.felder.some((f) => f.key === 'zeitraum'));
        assert.equal(stand.felder.find((f) => f.key === 'datum')!.label, 'Auszugsdatum');
        const nochmal = await x.hoch(FINANZEN_3());
        assert.deepEqual(nochmal.vorschau.typen[0].aenderungen ?? [], [], 'nichts mehr zu tun');
        assert.deepEqual(nochmal.vorschau.typen[0].entfaellt ?? [], []);
      });

      it('mit Werten: Feld weg, Werte im Hintergrund in die Notiz mit Kopfzeile, Historie, Fassung davor bleibt – kein zweites Mal', async () => {
        const x = await aufbau();
        await x.installiere(FINANZEN_2);
        const ids = [
          await x.mappe({ konto: 'Giro 1', zeitraum: 'Januar 2026' }),
          await x.mappe({ konto: 'Giro 1', zeitraum: 'Februar 2026' }),
        ];
        const leer = await x.mappe({ konto: 'Giro 2' });
        const { vorschau, upload } = await x.hoch(FINANZEN_3());
        assert.deepEqual(
          vorschau.typen[0].entfaellt?.map((e) => [e.label, e.anzahl]),
          [['Zeitraum', 2]],
        );
        await x.p.installiere({ upload, bestaetigt: true }, ICH);
        await x.d.updateWerte.anstossen();
        assert.ok(!(await x.typ()).felder.some((f) => f.key === 'zeitraum'));
        assert.deepEqual(await x.notizen(ids[0]), ['Aus dem Update von „Finanzen“ 3.1.0:\nZeitraum: Januar 2026']);
        assert.deepEqual(await x.notizen(ids[1]), ['Aus dem Update von „Finanzen“ 3.1.0:\nZeitraum: Februar 2026']);
        assert.deepEqual(await x.notizen(leer), [], 'ohne Wert keine Notiz');
        assert.equal((await x.d.kern.repo.holeMappe(ids[0]))!.werte.zeitraum, 'Januar 2026', 'der Wert bleibt an der Mappe (Rückweg)');
        assert.ok(
          (await x.d.kern.repo.historie(ids[0])).some((h) => /Update von Paket Finanzen 3\.1\.0/.test(String(h.daten.text))),
          'Historie',
        );
        assert.deepEqual(await x.d.updateWerte.stand(), [], 'fertig');
        // Rückweg: Die Fassung vor dem Update hat das Feld noch.
        const fassungen = await x.d.fassungen.liste('typ', (await x.typ()).id);
        assert.ok(fassungen.fassungen.length >= 2);
        // Noch einmal derselbe Auftrag (etwa nach einem Absturz mitten im Schub): keine zweite Notiz.
        await x.d.updateWerte.einreihen([
          {
            paket: { id: 'finanzen', name: 'Finanzen', version: '3.1.0' },
            typId: (await x.typ()).id,
            typName: 'Kontoauszug',
            felder: [{ key: 'zeitraum', label: 'Zeitraum', typ: 'text' }],
            von: ICH.id,
          },
        ]);
        await x.d.updateWerte.anstossen();
        assert.equal((await x.notizen(ids[0])).length, 1);
      });

      it('setzt nach einem Neustart fort: Auftrag mit Stand, Frist eines anderen Prozesses abgelaufen', async () => {
        const x = await aufbau();
        await x.installiere(FINANZEN_2);
        const ids = (await Promise.all([1, 2, 3].map((i) => x.mappe({ konto: `K${i}`, zeitraum: `Monat ${i}` })))).sort();
        // Dieser Prozess „stirbt“ gleich nach dem Update: Er stößt nichts mehr an.
        x.d.updateWerte.anstossen = async () => {};
        await x.installiere(FINANZEN_3());
        // Wie nach einem Absturz: die erste Mappe erledigt, ein anderer Prozess war eingetragen.
        const liste = (await x.d.kern.einstellungen!.lies(UPDATE_WERTE)) as WerteAuftrag[];
        assert.equal(liste.length, 1);
        await x.d.kern.einstellungen!.schreibe(UPDATE_WERTE, [
          { ...liste[0], nach: ids[0], fertig: 1, gesamt: 3, lauf: { id: 'weg', bis: 0 } },
        ]);
        await new UpdateWerte(x.d.kern).anstossen();
        assert.deepEqual(await x.notizen(ids[0]), [], 'erledigt vor dem Neustart (hier ohne Notiz) – nicht noch einmal');
        assert.equal((await x.notizen(ids[1])).length, 1);
        assert.equal((await x.notizen(ids[2])).length, 1);
        assert.equal(await x.d.kern.einstellungen!.lies(UPDATE_WERTE), null);
      });

      it('von der Verwaltung geändert: bleibt mit Hinweis; „Trotzdem ersetzen“, „Feld behalten“; eigene Felder bleiben immer', async () => {
        const x = await aufbau();
        await x.installiere(FINANZEN_2);
        const vorher = await x.typ();
        // Lena ändert die Titel-Vorlage, die Hilfe am Saldo und den Zeitraum (Pflicht); dazu ein eigenes Feld.
        await x.d.mappentypen.aendereTyp(vorher.id, {
          ...vorher,
          titelVorlage: '{konto}',
          felder: [
            ...vorher.felder.map((f) =>
              f.key === 'saldo' ? { ...f, hilfe: 'Meine Hilfe' } : f.key === 'zeitraum' ? { ...f, pflicht: true } : f,
            ),
            { key: 'notiz_lena', label: 'Lenas Notiz', typ: 'text' },
          ],
        });
        const { vorschau, upload } = await x.hoch(FINANZEN_3());
        const t = vorschau.typen[0];
        assert.deepEqual(
          t.entfaellt?.map((e) => [e.label, e.zustand]),
          [['Zeitraum', 'geaendert']],
          'geändert: bleibt',
        );
        const zustand = (name: string) => t.aenderungen?.find((a) => a.name === name)?.zustand;
        assert.equal(zustand('Kontoauszug'), 'geaendert');
        assert.equal(zustand('Saldo'), 'geaendert');
        assert.equal(zustand('Datum'), 'aktualisiert');
        // Trotzdem ersetzen: die Typ-Eigenschaften – der Saldo bleibt, wie Lena ihn hat.
        await x.p.installiere({ upload, bestaetigt: true, typTeileErsetzen: ['kontoauszug/typ'] }, ICH);
        const ty = await x.typ();
        assert.equal(ty.titelVorlage, '{konto} {datum}');
        assert.equal(ty.felder.find((f) => f.key === 'saldo')!.hilfe, 'Meine Hilfe');
        assert.equal(ty.felder.find((f) => f.key === 'saldo')!.min ?? null, null);
        assert.ok(
          ty.felder.some((f) => f.key === 'zeitraum'),
          'geändertes Feld bleibt',
        );
        assert.ok(
          ty.felder.some((f) => f.key === 'notiz_lena'),
          'eigenes Feld bleibt immer',
        );
        assert.equal(ty.felder.find((f) => f.key === 'datum')!.label, 'Auszugsdatum');
      });

      it('„Feld behalten“: das Feld bleibt als eigenes und kommt beim nächsten Update nicht wieder zur Sprache', async () => {
        const x = await aufbau();
        await x.installiere(FINANZEN_2);
        await x.mappe({ zeitraum: 'März 2026' });
        const { upload } = await x.hoch(FINANZEN_3());
        await x.p.installiere({ upload, bestaetigt: true, felderBehalten: ['kontoauszug/feld:zeitraum'] }, ICH);
        await x.d.updateWerte.anstossen();
        assert.ok((await x.typ()).felder.some((f) => f.key === 'zeitraum'));
        assert.equal(await x.d.kern.einstellungen!.lies(UPDATE_WERTE), null, 'keine Werte zu übertragen');
        const nochmal = await x.hoch(FINANZEN_3());
        assert.deepEqual(nochmal.vorschau.typen[0].entfaellt ?? [], []);
      });

      it('umbenennen per Umbau-Schritt: Werte ziehen ins neue Feld, nichts in die Notiz; ein belegtes neues Feld bleibt', async () => {
        const x = await aufbau();
        await x.installiere(FINANZEN_2);
        const a = await x.mappe({ zeitraum: 'April 2026' });
        const { vorschau, upload } = await x.hoch(FINANZEN_3_UMBENANNT);
        assert.deepEqual(vorschau.typen[0].entfaellt?.[0].nach, { key: 'abrechnungszeitraum', label: 'Abrechnungszeitraum' });
        await x.p.installiere({ upload, bestaetigt: true }, ICH);
        await x.d.updateWerte.anstossen();
        const m = (await x.d.kern.repo.holeMappe(a))!;
        assert.equal(m.werte.abrechnungszeitraum, 'April 2026');
        assert.deepEqual(await x.notizen(a), []);
      });
    },
  );
}
