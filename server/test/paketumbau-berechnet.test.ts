/**
 * Umbau mit Übernahme eines Typs, der berechnete Felder hat (#1476): Danach gehören sie dem aufnehmenden Paket, wenn es
 * sie selbst als `berechnet: true` mitbringt – auch in weiteren Schritten desselben Umbaus –, und das neue Paket
 * schreibt sie. Ein Dokumentregister, das der Umbau zugeordnet hat (`register: { alt: neu }`), verschwindet, wenn es
 * danach leer ist und das Paket es nicht mitbringt. Nachgestellt wie der Umzug aus Rechnungen in „Rechnungen und
 * Bestellungen“ (dms-registry #216). Mit Speicher und – mit TEST_DATABASE_URL – PostgreSQL. Namen sind erfunden.
 */
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { after, describe, it } from 'node:test';
import { ApiSchluesselDienst, speicherApiSchluesselRepo } from '../src/anmeldung/apischluessel';
import { speicherDateien } from '../src/dateien/dateispeicher';
import { Dienst } from '../src/dienst/dienst';
import { speicherEinstellungen } from '../src/einstellungen/einstellungen';
import { Fachfehler } from '../src/grundlagen/fehler';
import { Konten } from '../src/konten';
import { speicherKontoRepo, type KontoRepo } from '../src/konten/konto-repo';
import { schluesselRecht } from '../src/laeufer/verwaltung';
import { Paketverwaltung } from '../src/pakete/verwaltung/index';
import type { Repo } from '../src/repo';
import { speicherRepo } from '../src/repo/speicher';
import { pruefeZugang, routen, type Anfrage, type Route } from '../src/http/routen';
import { zipPuffer } from '../src/formate/zip';
import { eigeneDatenbank } from './hilfe-db';

const url = process.env.TEST_DATABASE_URL;
const HAUSHALT = '00000000-0000-4000-8000-000000000001';
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Verbindungen nur zum Schließen
const offen: any[] = [];
after(async () => {
  for (const s of offen) await s.end();
});

async function pgRepos(name: string): Promise<{ repo: Repo; konto: KontoRepo }> {
  const { pgRepo } = await import('../src/repo/pg');
  const { pgKontoRepo } = await import('../src/konten/konto-repo');
  const { sql } = await eigeneDatenbank(name, { jeTest: true });
  offen.push(sql);
  await sql`INSERT INTO haushalte (id, name) VALUES (${HAUSHALT}, 'Test') ON CONFLICT DO NOTHING`;
  return { repo: pgRepo(sql, HAUSHALT), konto: pgKontoRepo(sql, HAUSHALT) };
}

const WASM = Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);
const archiv = (d: Record<string, string | Buffer>) =>
  zipPuffer(
    Object.entries(d).map(([name, inhalt]) => ({ name, daten: Buffer.isBuffer(inhalt) ? inhalt : Buffer.from(inhalt) })),
    new Date('2026-01-01T12:00:00Z'),
  );
const manifest = (id: string, name: string, version: string, extra: string) =>
  `schema: 1\nid: ${id}\nname: ${name}\nversion: ${version}\nbeschreibung: Test.\nautor: { name: Lena Beispiel, github: lena-beispiel }\nlizenz: MIT\ndms: ">=0.231.0"\nherausgeber: org.example\ninhalt:\n  mappentypen: inhalt/mappentypen.yaml\ncode:\n  sprache: c\n  quelle: code/\n  ereignisse: [mappe.geaendert]\n  mappentypen: [rechnung, rechnungsposition]\n  rechte:\n    lesen: [rechnung, rechnungsposition]\n    schreiben: [rechnung, rechnungsposition]\n${extra}`;

/** Rechnungen 1.3.0: Status und USt-Betrag berechnet; Dokumente im Register „Anlagen“ (und „Belege“). */
const rechnungen = {
  'manifest.yaml': manifest('rechnungen', 'Rechnungen', '1.3.0', ''),
  'inhalt/mappentypen.yaml': `- schluessel: rechnung
  name: Rechnung
  titelVorlage: "{nummer}"
  felder:
    - { key: nummer, label: Rechnungsnummer, typ: text }
    - { key: status, label: Status, typ: text, maxLen: 200, berechnet: true }
  register:
    - { key: allgemein, name: Allgemein, art: felder, felder: [nummer, status] }
    - { key: anlagen, name: Anlagen, art: dokumente }
    - { key: belege, name: Belege, art: dokumente }
- schluessel: rechnungsposition
  name: Rechnungsposition
  titelVorlage: "{bezeichnung}"
  felder:
    - { key: bezeichnung, label: Bezeichnung, typ: text }
    - { key: ust_betrag, label: USt-Betrag, typ: betrag, berechnet: true }
  register:
    - { key: allgemein, name: Allgemein, art: felder, felder: [bezeichnung, ust_betrag] }
`,
  'code/modul.wasm': WASM,
};

/** „Rechnungen und Bestellungen“ übernimmt beide Typen; Anlagen ziehen nach „Dokumente“. */
const rechnungBestellung = {
  'manifest.yaml': manifest(
    'rechnung_bestellung',
    'Rechnungen und Bestellungen',
    '1.0.0',
    [
      'umbau:',
      '  - von: rechnungen:rechnung',
      '    nach: rechnung',
      '    felder: { nummer: nummer }',
      '    register: { anlagen: dokumente }',
      '  - von: rechnungen:rechnungsposition',
      '    nach: rechnungsposition',
      '    felder: { bezeichnung: bezeichnung }',
      '',
    ].join('\n'),
  ),
  'inhalt/mappentypen.yaml': `- schluessel: rechnung
  name: Rechnung
  titelVorlage: "{nummer}"
  felder:
    - { key: nummer, label: Rechnungsnummer, typ: text }
    - { key: bestellnummer, label: Bestellnummer, typ: text }
    - { key: status, label: Status, typ: text, maxLen: 200, berechnet: true }
  register:
    - { key: allgemein, name: Allgemein, art: felder, felder: [nummer, bestellnummer, status] }
    - { key: dokumente, name: Dokumente, art: dokumente }
- schluessel: rechnungsposition
  name: Rechnungsposition
  titelVorlage: "{bezeichnung}"
  felder:
    - { key: bezeichnung, label: Bezeichnung, typ: text }
    - { key: ust_betrag, label: USt-Betrag, typ: betrag, berechnet: true }
  register:
    - { key: allgemein, name: Allgemein, art: felder, felder: [bezeichnung, ust_betrag] }
`,
  'code/modul.wasm': WASM,
};

async function aufbau(pg: boolean, name: string) {
  const r = pg ? await pgRepos(name) : { repo: speicherRepo(), konto: speicherKontoRepo() };
  const d = new Dienst(r.repo, speicherDateien(), { einstellungen: speicherEinstellungen() });
  const konten = new Konten(
    r.konto,
    () => null,
    () => 'http://localhost',
    d.systemtypen.benutzerspiegel(),
  );
  d.verbindeKonten(konten.papierkorbHaken());
  const { benutzer: lena } = await konten.einrichten({ email: 'lena@example.org', name: 'Lena', passwort: 'ein-langes-passwort' });
  await d.postSystemmappen.gleicheBenutzerAb(await konten.listeBenutzer());
  const ich = { id: lena.id, email: 'lena@example.org' };
  const p = new Paketverwaltung(d, {
    version: () => '0.290.10',
    abruf: async (u) => {
      throw new Error(`404 ${u}`);
    },
    katalogUrl: 'https://katalog.test/katalog.json',
  });
  const hoch = async (dateien: Record<string, string | Buffer>) => p.hochladen(archiv(dateien), ich);
  await p.installiere({ upload: (await hoch(rechnungen)).upload, bestaetigt: true, rechteBestaetigt: true }, ich);
  const typ = async (k: string) => (await d.mappentypen.listeTypen()).find((x) => x.schluessel === k);
  const schluessel = new ApiSchluesselDienst(speicherApiSchluesselRepo());
  const tabelle = routen(d, konten, { apiSchluessel: schluessel });
  /** Wie der Paket-Läufer: Dienstkonto des Pakets mit seinem Schlüssel (API v1). */
  const alsPaket = async (paketId: string, m: string, pfad: string, x: Partial<Anfrage> = {}) => {
    const konto = await konten.dienstkonto(paketId, paketId);
    d.kern.paketKonten.set(konto.id, paketId);
    const laeufer = (await d.kern.repo.listePakete()).find((y) => y.id === paketId)!.laeufer!;
    const k = await schluessel.fuerDienstkonto(konto, schluesselRecht(laeufer));
    const anfrage = { body: {}, params: {}, query: {}, ip: '127.0.0.1', ...x } as Anfrage;
    const route = tabelle.find((y) => y.methode === m && y.pfad === `/api/v1${pfad}`)!;
    await pruefeZugang(route as Route, anfrage, (n) => (n === 'authorization' ? `Bearer ${k}` : undefined), konten, schluessel);
    return route.handler(anfrage);
  };
  // Bestand: eine Rechnung mit einer Anlage und einem Beleg, eine Position.
  const rechnung = await d.mappen.legeMappeAn({ typId: (await typ('rechnungen:rechnung'))!.id, werte: { nummer: 'RE-2026-17' } }, lena.id);
  const position = await d.mappen.legeMappeAn(
    { typId: (await typ('rechnungen:rechnungsposition'))!.id, werte: { bezeichnung: 'Wartung Heizung' } },
    lena.id,
  );
  const dokument = async (registerKey: string, dateiname: string) =>
    (
      await d.kern.repo.legeDokumentAn({
        id: randomUUID(),
        mappeId: rechnung.id,
        registerKey,
        name: dateiname,
        mime: 'application/pdf',
        groesse: 10,
        sha256: createHash('sha256').update(dateiname).digest('hex'),
        anzeigbar: true,
        erstellt: new Date().toISOString(),
        erstelltVon: null,
      })
    ).id;
  const anlage = await dokument('anlagen', 'rechnung.pdf');
  const beleg = await dokument('belege', 'beleg.pdf');
  return { d, p, lena, ich, hoch, typ, alsPaket, rechnung, position, anlage, beleg };
}

for (const pg of [false, true]) {
  describe(
    `Umbau: übernommener Typ mit berechneten Feldern (#1476)${pg ? ' – PostgreSQL' : ''}`,
    { skip: pg && !url ? 'TEST_DATABASE_URL nicht gesetzt' : false },
    () => {
      it('berechnete Felder gehören danach dem neuen Paket, es schreibt sie; das leere zugeordnete Register ist weg', async () => {
        const x = await aufbau(pg, 'umbau_berechnet');
        const vorher = (await x.typ('rechnungen:rechnung'))!;
        assert.equal(vorher.felder.find((f) => f.key === 'status')?.berechnetVon, 'rechnungen');
        const { upload, vorschau } = await x.hoch(rechnungBestellung);
        assert.deepEqual(vorschau.probleme, []);
        assert.deepEqual(
          vorschau.umbau.map((u) => [u.von.kennung, u.art]),
          [
            ['rechnungen:rechnung', 'uebernehmen'],
            ['rechnungen:rechnungsposition', 'uebernehmen'],
          ],
        );
        await x.p.installiere({ upload, bestaetigt: true, rechteBestaetigt: true, gesamteVerwaltung: true, umbauBestaetigt: true }, x.ich);
        const rechnung = (await x.typ('rechnung_bestellung:rechnung'))!;
        const position = (await x.typ('rechnung_bestellung:rechnungsposition'))!;
        assert.equal(rechnung.id, vorher.id, 'Übernahme: gleiche Id');
        assert.equal(rechnung.felder.find((f) => f.key === 'status')?.berechnetVon, 'rechnung_bestellung');
        assert.equal(position.felder.find((f) => f.key === 'ust_betrag')?.berechnetVon, 'rechnung_bestellung', 'weiterer Schritt');
        // Das neue Paket schreibt Status und USt-Betrag (vorher: 400 „berechnet.nur-paket“).
        await x.alsPaket('rechnung_bestellung', 'PUT', '/mappen/:id', {
          params: { id: x.rechnung.id },
          body: { werte: { status: 'bezahlt' } },
        });
        await x.alsPaket('rechnung_bestellung', 'PUT', '/mappen/:id', {
          params: { id: x.position.id },
          body: { werte: { ust_betrag: { betrag: 19, waehrung: 'EUR' } } },
        });
        assert.equal((await x.d.kern.repo.holeMappe(x.rechnung.id))!.werte.status, 'bezahlt');
        assert.deepEqual((await x.d.kern.repo.holeMappe(x.position.id))!.werte.ust_betrag, { betrag: 19, waehrung: 'EUR' });
        // Wer das Feld nicht berechnet, schreibt es weiterhin nicht.
        await assert.rejects(
          x.d.mappen.aendereMappe(
            x.rechnung.id,
            { werte: { status: 'offen' } },
            x.lena.id,
            await x.d.rechtepruefung.zugriff({ id: x.lena.id, rolle: 'admin' }),
          ),
          (e: unknown) => e instanceof Fachfehler && e.status === 400,
        );
        // Register: „Anlagen“ ist zugeordnet und danach leer – weg; „Belege“ kennt der Umbau nicht und hat ein Dokument – bleibt.
        assert.deepEqual(
          rechnung.register.map((r) => r.key),
          ['allgemein', 'dokumente', 'belege'],
        );
        const doks = await x.d.kern.repo.dokumenteVon([x.rechnung.id]);
        assert.equal(doks.find((y) => y.id === x.anlage)?.registerKey, 'dokumente');
        assert.equal(doks.find((y) => y.id === x.beleg)?.registerKey, 'belege');
      });
    },
  );
}
