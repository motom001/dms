/**
 * Rauchtests KW48: Dokument umbenennen mit Endung und ursprünglichem Namen (#1594), Hinweis „von 600 auf 300 dpi
 * verkleinert“ an einem Scan (#1600), Zahl im Tab abschaltbar unter Mein Konto → Darstellung (#1625).
 * Allein starten (frisch gestartetes Ablago, siehe rauchtest.mjs): node web/rauchtest/bereiche/umbenennen-und-tab.mjs [fehlerordner]
 */
import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';
import '../einrichtung.mjs';
import { api, BASIS, beispielPdf, LENA, rauchtest, sitzung } from '../hilfen.mjs';
import { axePruefen } from '../muster.mjs';

/** Eigener Typ „Stromrechnung“ mit einer Mappe; je Aufruf eine neue Mappe. */
let typ;
async function mappeMit(cookie, name, inhalt, mime) {
  if (!typ) {
    const v = await sitzung(LENA);
    await api('POST', '/api/konto/verwaltung', { cookie: v, body: { passwort: LENA.passwort } });
    typ = (
      await api('POST', '/api/typen', {
        cookie: v,
        body: {
          name: 'Stromrechnung',
          schluessel: 'rauchtest_stromrechnung',
          titelVorlage: '{name}',
          felder: [{ key: 'name', label: 'Name', typ: 'text', pflicht: true }],
          register: [
            { key: 'allgemein', name: 'Allgemein', art: 'felder', felder: ['name'] },
            { key: 'dokumente', name: 'Dokumente', art: 'dokumente' },
          ],
        },
      })
    ).daten;
  }
  const m = (await api('POST', '/api/mappen', { cookie, body: { typId: typ.id, werte: { name: `Strom ${name}` } } })).daten;
  const d = (
    await api('POST', `/api/mappen/${m.id}/dokumente?register=dokumente&name=${encodeURIComponent(name)}&typ=${mime}`, {
      cookie,
      body: inhalt,
      roh: true,
    })
  ).daten.dokument;
  return { m, d };
}

/** Graues PNG mit Auflösung im Block pHYs (wie ein Scanner sie schreibt). */
function png(breite, hoehe, dpi) {
  const crc = (b) => {
    let c = ~0;
    for (const x of b) {
      c ^= x;
      for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
    }
    return ~c >>> 0;
  };
  const block = (art, daten) => {
    const kopf = Buffer.alloc(8);
    kopf.writeUInt32BE(daten.length, 0);
    kopf.write(art, 4, 'latin1');
    const p = Buffer.alloc(4);
    p.writeUInt32BE(crc(Buffer.concat([kopf.subarray(4), daten])));
    return Buffer.concat([kopf, daten, p]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(breite, 0);
  ihdr.writeUInt32BE(hoehe, 4);
  ihdr[8] = 8;
  const phys = Buffer.alloc(9);
  phys.writeUInt32BE(Math.round(dpi / 0.0254), 0);
  phys.writeUInt32BE(Math.round(dpi / 0.0254), 4);
  phys[8] = 1;
  const zeile = Buffer.concat([Buffer.from([0]), Buffer.alloc(breite, 220)]);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    block('IHDR', ihdr),
    block('pHYs', phys),
    block('IDAT', deflateSync(Buffer.concat(Array.from({ length: hoehe }, () => zeile)))),
    block('IEND', Buffer.alloc(0)),
  ]);
}

rauchtest('Dokument umbenennen: Endung bleibt, ursprünglicher Name unter „Über dieses Dokument“ (#1594)', { als: LENA }, async (s) => {
  const c = await sitzung(LENA);
  const { m } = await mappeMit(c, 'scan_0042.pdf', beispielPdf('Stromrechnung März 2027'), 'application/pdf');
  await s.goto(BASIS + `/ablage/${typ.id}/${m.id}`);
  const mappe = s.getByRole('region', { name: 'Mappe' });
  await mappe.getByRole('tab', { name: /^Dokumente/ }).click();
  await mappe.getByRole('button', { name: 'Weitere Handlungen für scan_0042.pdf' }).click();
  await s.getByRole('menu', { name: 'Weitere Handlungen für scan_0042.pdf' }).getByRole('menuitem', { name: 'Umbenennen …' }).click();
  const feld = mappe.getByRole('textbox', { name: 'Neuer Name' });
  assert.equal(await feld.inputValue(), 'scan_0042', 'die Endung steht nicht im Feld');
  await mappe.getByText('Die Endung .pdf bleibt.').waitFor();
  await feld.fill('Stromrechnung März');
  await mappe.getByRole('button', { name: 'Umbenennen', exact: true }).click();
  await mappe.getByText('„scan_0042.pdf“ heißt jetzt „Stromrechnung März.pdf“.').waitFor();
  await mappe.getByRole('button', { name: 'Weitere Handlungen für Stromrechnung März.pdf' }).click();
  await s.getByRole('menuitem', { name: 'Über dieses Dokument' }).click();
  const ueber = mappe.getByRole('definition').filter({ hasText: 'scan_0042.pdf' });
  await ueber.waitFor();
  await mappe.getByRole('term').filter({ hasText: 'Ursprünglicher Name' }).waitFor();
  const funde = await axePruefen(s, ['.spalte.mappe']);
  assert.deepEqual(funde, [], `axe meldet Verstöße:\n${funde.join('\n')}`);
});

rauchtest('Scan mit 600 dpi: Hinweis „von 600 auf 300 dpi verkleinert“ am Dokument (#1600)', { als: LENA }, async (s) => {
  const c = await sitzung(LENA);
  const { m, d } = await mappeMit(c, 'scan-600.png', png(1200, 800, 600), 'image/png');
  // So holt ein Paket (Texterkennung) die Seite: mit 300 dpi, halb so viele Bildpunkte wie das Original.
  const r = await fetch(`${BASIS}/api/dokumente/${d.id}/seiten/1/scan`, { headers: { cookie: c } });
  assert.equal(r.status, 200);
  assert.match(
    Buffer.from(await r.arrayBuffer())
      .subarray(0, 12)
      .toString('latin1'),
    /^P5\s+600\s+400\s/,
  );
  await s.goto(BASIS + `/ablage/${typ.id}/${m.id}`);
  const mappe = s.getByRole('region', { name: 'Mappe' });
  await mappe.getByRole('tab', { name: /^Dokumente/ }).click();
  await mappe.getByRole('button', { name: 'Weitere Handlungen für scan-600.png' }).click();
  await s.getByRole('menuitem', { name: 'Über dieses Dokument' }).click();
  await mappe.getByText('für die Texterkennung von 600 auf 300 dpi verkleinert, das Original bleibt', { exact: false }).waitFor();
});

rauchtest(
  'Mein Konto → Darstellung: Zahl im Tab abschalten – kein Titel mit Zahl, keine Nachfrage im Hintergrund (#1625)',
  { als: LENA },
  async (s) => {
    const c = await sitzung(LENA);
    const stand = [];
    s.on('request', (q) => {
      if (q.url().endsWith('/api/ablage/stand')) stand.push(q.url());
    });
    /** Tab in den Hintergrund bzw. wieder nach vorn (wie beim Wechsel des Tabs). */
    const sichtbar = (an) =>
      s.evaluate((an) => {
        Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (an ? 'visible' : 'hidden') });
        document.dispatchEvent(new Event('visibilitychange'));
      }, an);
    // Neue Post aus der Einrichtung: Mit der Vorgabe steht die Zahl vorn im Titel, im Hintergrund fragt Ablago nach.
    await s.goto(BASIS + '/profil/darstellung');
    await s.waitForFunction(() => /^\(\d+\+?\) /.test(document.title));
    const schalter = s.getByRole('switch', { name: 'Offene Aufgaben und neue Post im Tab zeigen' });
    assert.equal(await schalter.getAttribute('aria-checked'), 'true', 'Vorgabe an');
    const gefragt = s.waitForRequest((q) => q.url().endsWith('/api/ablage/stand'));
    await sichtbar(false);
    await gefragt;
    await sichtbar(true);
    try {
      await schalter.click();
      await s.waitForFunction(() => !/^\(\d+\+?\) /.test(document.title));
      assert.equal((await api('GET', '/api/konto/einstellungen', { cookie: c })).daten.tab_neues, false, 'je Konto gespeichert');
      // Aus: Im Hintergrund keine Nachfrage. Eine Anfrage danach zeigt, dass keine davor lag (Reihenfolge der Ereignisse).
      stand.length = 0;
      await sichtbar(false);
      await s.evaluate(() => fetch('/api/gesundheit').then((r) => r.status));
      assert.deepEqual(stand, [], 'keine Abfrage im Hintergrund');
      assert.equal(await s.evaluate(() => document.title.startsWith('(')), false);
    } finally {
      await api('PUT', '/api/konto/einstellungen/tab_neues', { cookie: c, body: { wert: null } });
    }
  },
);
