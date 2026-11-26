/**
 * Rauchtest (#1658): Ein Paket-Update übernimmt Änderungen an einem vorhandenen Mappentyp. Ein kleines Test-Paket wie
 * Finanzen 2.2.0 → 3.1.0: „Zeitraum“ entfällt (zwei Mappen haben einen Wert), neue Titel-Vorlage. Die Vorschau sagt es
 * in einem Satz, „Feld behalten“ gibt es nur aufgeklappt; nach dem Update stehen die Werte in der Notiz der Mappen. Danach
 * ist das Paket wieder weg.
 * Dazu ein Regionspaket (#1696): Regionen und Feiertage kommen aus dem Paket, Werkbank → Region nennt es; danach wieder
 * ohne Bundesland und ohne Paket.
 * Allein starten (frisch gestartetes Ablago, siehe rauchtest.mjs): node web/rauchtest/bereiche/paket-update.mjs [fehlerordner]
 */
import assert from 'node:assert/strict';
import { crc32 } from 'node:zlib';
import '../einrichtung.mjs';
import { api, BASIS, LENA, rauchtest, schemaWechseln, sitzung, verwalten } from '../hilfen.mjs';
import { axePruefen } from '../muster.mjs';

const ID = 'updateprobe';

/** ZIP ohne Komprimierung (genügt für das kleine Test-Paket; wie in paket-netz.mjs). */
function zip(dateien) {
  const lokal = [];
  const zentral = [];
  let ort = 0;
  for (const [name, inhalt] of Object.entries(dateien)) {
    const n = Buffer.from(name);
    const d = Buffer.from(inhalt);
    const c = crc32(d);
    const kopf = Buffer.alloc(30);
    kopf.writeUInt32LE(0x04034b50, 0);
    kopf.writeUInt16LE(20, 4);
    kopf.writeUInt32LE(c, 14);
    kopf.writeUInt32LE(d.length, 18);
    kopf.writeUInt32LE(d.length, 22);
    kopf.writeUInt16LE(n.length, 26);
    const z = Buffer.alloc(46);
    z.writeUInt32LE(0x02014b50, 0);
    z.writeUInt16LE(20, 4);
    z.writeUInt16LE(20, 6);
    z.writeUInt32LE(c, 16);
    z.writeUInt32LE(d.length, 20);
    z.writeUInt32LE(d.length, 24);
    z.writeUInt16LE(n.length, 28);
    z.writeUInt32LE(ort, 42);
    lokal.push(kopf, n, d);
    zentral.push(z, n);
    ort += 30 + n.length + d.length;
  }
  const zl = Buffer.concat(zentral);
  const ende = Buffer.alloc(22);
  ende.writeUInt32LE(0x06054b50, 0);
  ende.writeUInt16LE(Object.keys(dateien).length, 8);
  ende.writeUInt16LE(Object.keys(dateien).length, 10);
  ende.writeUInt32LE(zl.length, 12);
  ende.writeUInt32LE(ort, 16);
  return Buffer.concat([...lokal, zl, ende]);
}

const paket = (version, titel, felder) =>
  zip({
    'manifest.yaml': [
      'schema: 1',
      `id: ${ID}`,
      'name: Update-Probe',
      `version: ${version}`,
      'beschreibung: Rauchtest für das Update vorhandener Mappentypen.',
      'autor: { name: Rauchtest, github: "" }',
      'lizenz: MIT',
      'dms: ">=0.124.0"',
      'inhalt:',
      '  mappentypen: inhalt/mappentypen.yaml',
      '',
    ].join('\n'),
    'inhalt/mappentypen.yaml': [
      '- schluessel: auszug',
      '  name: Probeauszug',
      `  titelVorlage: "${titel}"`,
      '  felder:',
      ...felder.map((f) => `    - { key: ${f}, label: ${f[0].toUpperCase()}${f.slice(1)}, typ: text }`),
      '  register:',
      `    - { key: allgemein, name: Allgemein, art: felder, felder: [${felder.join(', ')}] }`,
      '',
    ].join('\n'),
  });

rauchtest(
  'Paket-Update: entfallendes Feld mit Werten in die Notiz, neue Titel-Vorlage, „Feld behalten“ aufgeklappt, axe (#1658)',
  { als: LENA, timeout: 90_000 },
  async (s) => {
    const cookie = await sitzung(LENA);
    await api('POST', '/api/konto/verwaltung', { cookie, body: { passwort: LENA.passwort } });
    const ids = [];
    try {
      const hoch = async (z) => (await api('POST', '/api/werkbank/pakete/hochladen', { cookie, body: z, roh: true })).daten.upload;
      await api('POST', '/api/werkbank/pakete/installieren', {
        cookie,
        body: { upload: await hoch(paket('2.2.0', '{konto} {zeitraum}', ['konto', 'zeitraum'])), bestaetigt: true },
      });
      const typ = (await api('GET', '/api/typen', { cookie })).daten.find((x) => x.schluessel === `${ID}:auszug`);
      for (const zeitraum of ['Januar 2026', 'Februar 2026'])
        ids.push((await api('POST', '/api/mappen', { cookie, body: { typId: typ.id, werte: { konto: 'Giro', zeitraum } } })).daten.id);

      // Die neue Version über „Paket hochladen“ in der Werkbank – die Vorschau sagt, was geschieht.
      await s.goto(BASIS + '/ablage/start');
      await verwalten(s);
      await s.goto(BASIS + '/werkbank/pakete');
      await s.getByRole('button', { name: /^Expertenmodus/ }).click();
      await s.getByLabel('Paket oder Sammeldatei als ZIP hochladen').setInputFiles({
        name: 'update-probe-3.1.0.zip',
        mimeType: 'application/zip',
        buffer: paket('3.1.0', '{konto}', ['konto']),
      });
      await s.getByText('„Zeitraum“ entfällt – die Werte aus 2 Mappen stehen danach in deren Notiz.').waitFor();
      await s.getByText(/Übernimmt aus dem Paket: Mappentyp \(Titel-Vorlage\)/).waitFor();
      assert.equal(await s.getByRole('checkbox', { name: '„Zeitraum“ als eigenes Feld behalten' }).count(), 0, 'nur aufgeklappt');
      await s.getByRole('button', { name: /^Für Fortgeschrittene: Felder behalten/ }).click();
      await s.getByRole('checkbox', { name: '„Zeitraum“ als eigenes Feld behalten' }).waitFor();
      for (const schema of ['light', 'dark']) {
        await schemaWechseln(s, schema);
        assert.deepEqual(await axePruefen(s, ['main']), [], `axe ${schema}`);
      }
      await schemaWechseln(s, 'light');
      // Hochgeladen, nicht signiert: die Herkunft bestätigen.
      await s.getByRole('checkbox', { name: /Ich weiß, woher das Paket stammt/ }).check();
      await s.getByRole('button', { name: 'Aktualisieren', exact: true }).click();
      await s.waitForURL(new RegExp(`/werkbank/pakete/${ID}`));

      // Danach: Feld weg, Titel-Vorlage neu, Werte in der Notiz (im Hintergrund – kurz warten).
      const nachher = (await api('GET', '/api/typen', { cookie })).daten.find((x) => x.id === typ.id);
      assert.equal(nachher.titelVorlage, '{konto}');
      assert.ok(!nachher.felder.some((f) => f.key === 'zeitraum'));
      let notizen = [];
      for (let i = 0; i < 40 && notizen.length < 1; i++) {
        notizen = (await api('GET', `/api/mappen/${ids[0]}/notizen`, { cookie })).daten;
        if (!notizen.length) await new Promise((f) => setTimeout(f, 250));
      }
      assert.match(notizen[0]?.text ?? '', /^Aus dem Update von „Update-Probe“ 3\.1\.0:\nZeitraum: Januar 2026/);
    } finally {
      for (const id of ids) await api('DELETE', `/api/mappen/${id}`, { cookie }).catch(() => {});
      await api('DELETE', `/api/werkbank/pakete/${ID}`, { cookie }).catch(() => {});
    }
  },
);

/* ---------- Regionspaket (#1696) ---------- */

const REGION_ID = 'regionsprobe';
const regionspaket = () =>
  zip({
    'manifest.yaml': [
      'schema: 1',
      `id: ${REGION_ID}`,
      'name: Regionsprobe',
      'version: 1.0.0',
      'beschreibung: Rauchtest für Regionspakete.',
      'autor: { name: Rauchtest, github: "" }',
      'lizenz: MIT',
      'dms: ">=0.124.0"',
      'inhalt:',
      '  region: inhalt/region.yaml',
      '',
    ].join('\n'),
    'inhalt/region.yaml': [
      'land: DE',
      'regionen:',
      '  - { id: SN, name: { de: Sachsen (Probe), en: Saxony (test) } }',
      'feiertage:',
      "  - { name: { de: Probetag, en: Test day }, datum: '01-02', regionen: [SN] }",
      '',
    ].join('\n'),
  });

rauchtest('Regionspaket: Bundesländer und Feiertage aus dem Paket, Werkbank → Region nennt es (#1696)', { als: LENA }, async (s) => {
  const cookie = await sitzung(LENA);
  await api('POST', '/api/konto/verwaltung', { cookie, body: { passwort: LENA.passwort } });
  try {
    const upload = (await api('POST', '/api/werkbank/pakete/hochladen', { cookie, body: regionspaket(), roh: true })).daten.upload;
    await api('POST', '/api/werkbank/pakete/installieren', { cookie, body: { upload, bestaetigt: true } });
    await s.goto(BASIS + '/ablage/start');
    await verwalten(s);
    await s.goto(BASIS + '/werkbank/region');
    const wahl = s.locator('#region-bundesland');
    await wahl.locator('option', { hasText: 'Sachsen (Probe)' }).waitFor({ state: 'attached' });
    assert.equal(await wahl.locator('option').count(), 2, 'keins und die Region aus dem Paket');
    await wahl.selectOption('SN');
    await s.getByRole('button', { name: 'Region speichern' }).click();
    await s.getByText('Die Feiertage kommen aus dem Paket „Regionsprobe“; das Bundesland wählst du oben.').waitFor();
    await s.getByText('Probetag').waitFor();
  } finally {
    await api('PUT', '/api/werkbank/region', { cookie, body: { bundesland: null } }).catch(() => {});
    await api('DELETE', `/api/werkbank/pakete/${REGION_ID}`, { cookie }).catch(() => {});
  }
});
