/**
 * Rauchtest (#1619): Ein Paket ruft über den Paket-Läufer wirklich einen Dienst im Netz ab – im Betriebsmodus des
 * Läufers (gebautes Ablago, Berechtigungsmodell von Node mit `--permission`). Seit Node 25 sperrt das Modell ohne
 * `--allow-net` jeden Abruf (#1588); dann scheiterte jedes Paket mit Netz, ohne dass ein Test es merkte.
 *
 * Das Test-Paket ist ein kleines, hier gebautes WebAssembly-Modul (kein Compiler nötig) mit einer Dienst-Adresse in
 * den Einstellungen, wie der KI-Assistent. Beim „Ausprobieren“ fragt es zuerst eine Adresse ab, die es nicht nennt
 * (Gegenprobe: der Läufer lehnt ab, beim Test-Dienst kommt nichts an), dann die bestätigte Dienst-Adresse eines lokalen
 * Test-Dienstes, und gibt dessen Antwort als Ergebnis zurück. Danach ist das Paket wieder weg und „Was Ablago darf“
 * wieder wie vorher.
 * Allein starten (frisch gestartetes Ablago, siehe rauchtest.mjs): node web/rauchtest/bereiche/paket-netz.mjs [fehlerordner]
 */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { crc32 } from 'node:zlib';
import '../einrichtung.mjs';
import { api, LENA, rauchtest, sitzung } from '../hilfen.mjs';

const ID = 'netzprobe';

/* ---------- Kleiner WebAssembly-Assembler (wie server/test/laeufer.test.ts) ---------- */
const u = (n) => {
  const b = [];
  do {
    let x = n & 0x7f;
    n >>>= 7;
    if (n) x |= 0x80;
    b.push(x);
  } while (n);
  return b;
};
const s = (n) => {
  const b = [];
  for (;;) {
    const x = n & 0x7f;
    n >>= 7;
    if ((n === 0 && !(x & 0x40)) || (n === -1 && x & 0x40)) {
      b.push(x);
      return b;
    }
    b.push(x | 0x80);
  }
};
const vec = (l) => [...u(l.length), ...l.flat()];
const str = (t) => {
  const b = [...Buffer.from(t)];
  return [...u(b.length), ...b];
};
const sek = (id, b) => [id, ...u(b.length), ...b];
const I32 = 0x7f;
const typ = (p, r) => [0x60, ...vec(p.map((x) => [x])), ...vec(r.map((x) => [x]))];
const koerper = (b) => {
  const k = [0x00, ...b, 0x0b];
  return [...u(k.length), ...k];
};

/**
 * Modul nach der Paket-ABI: importiert Speicher und dms.netz, dms.antwort_lesen, dms.ergebnis. `dms_ereignis` fragt
 * erst `verboten` ab und erwartet −2 (vom Läufer abgelehnt), dann `erlaubt`, und gibt die Antwort als Ergebnis zurück.
 */
function modul(erlaubt, verboten) {
  const FEHLT = 'Gegenprobe: Der Läufer hat die nicht erlaubte Adresse nicht abgelehnt.';
  const [NETZ, LESEN, ERGEBNIS] = [0, 1, 2];
  const ORT = { erlaubt: 64, verboten: 256, fehlt: 512, antwort: 4096 };
  const netz = (ort, text) => [0x41, ...s(ort), 0x41, ...s(Buffer.byteLength(text)), 0x41, 0, 0x41, 0, 0x10, NETZ];
  const ereignis = [
    ...netz(ORT.verboten, verboten),
    ...[0x41, ...s(-2), 0x47, 0x04, 0x40], // if (status != -2)
    ...[0x41, ...s(ORT.fehlt), 0x41, ...s(Buffer.byteLength(FEHLT)), 0x10, ERGEBNIS, 0x1a, 0x41, 1, 0x0f, 0x0b],
    ...netz(ORT.erlaubt, erlaubt),
    0x1a,
    ...[0x41, ...s(ORT.antwort), 0x41, ...s(ORT.antwort), 0x41, ...s(1000), 0x10, LESEN, 0x10, ERGEBNIS, 0x1a],
    ...[0x41, 0],
  ];
  const daten = [
    [ORT.erlaubt, erlaubt],
    [ORT.verboten, verboten],
    [ORT.fehlt, FEHLT],
  ].map(([ort, t]) => [0x00, 0x41, ...s(ort), 0x0b, ...str(t)]);
  return Buffer.from([
    ...[0x00, 0x61, 0x73, 0x6d, 0x01, 0, 0, 0],
    ...sek(1, vec([typ([I32, I32, I32, I32], [I32]), typ([I32, I32], [I32]), typ([I32], [I32])])),
    ...sek(
      2,
      vec([
        [...str('env'), ...str('memory'), 0x02, 0x00, ...u(1)],
        [...str('dms'), ...str('netz'), 0x00, 0],
        [...str('dms'), ...str('antwort_lesen'), 0x00, 1],
        [...str('dms'), ...str('ergebnis'), 0x00, 1],
      ]),
    ),
    ...sek(3, vec([[2], [1], [1]])),
    ...sek(
      7,
      vec([
        [...str('dms_puffer'), 0x00, 3],
        [...str('dms_ereignis'), 0x00, 4],
        [...str('dms_aktion'), 0x00, 5],
      ]),
    ),
    ...sek(10, vec([koerper([0x41, ...s(1024)]), koerper(ereignis), koerper([0x41, 0])])),
    ...sek(11, vec(daten)),
  ]);
}

/** ZIP ohne Komprimierung (genügt für das kleine Test-Paket). */
function zip(dateien) {
  const lokal = [];
  const zentral = [];
  let ort = 0;
  for (const [name, inhalt] of Object.entries(dateien)) {
    const n = Buffer.from(name);
    const d = Buffer.isBuffer(inhalt) ? inhalt : Buffer.from(inhalt);
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

const MANIFEST = [
  'schema: 1',
  `id: ${ID}`,
  'name: Netzprobe',
  'version: 1.0.0',
  'beschreibung: Ruft für den Rauchtest einen lokalen Dienst im Netz ab.',
  'autor: { name: Rauchtest, github: "" }',
  'lizenz: MIT',
  'dms: ">=0.124.0"',
  'inhalt: {}',
  'code:',
  '  sprache: c',
  '  quelle: code/',
  '  ereignisse: [paket.einstellungen_geaendert]',
  '  rechte: { dokumente: keine }',
  '  netz: []',
  '  ausprobieren: { ereignis: paket.einstellungen_geaendert, dateiarten: [text/plain] }',
  '  einstellungen:',
  '    - abschnitt: Dienst',
  '      felder:',
  '        - { schluessel: adresse, name: Adresse, typ: adresse, pflicht: true, beispiel: "http://dienst.example:8080/probe" }',
  '',
].join('\n');

/** Lokaler Test-Dienst: antwortet unter /probe/… mit `token`, merkt sich jeden Aufruf. */
async function testDienst(token) {
  const aufrufe = [];
  const server = createServer((q, r) => {
    aufrufe.push(q.url);
    r.writeHead(q.url.startsWith('/probe/') ? 200 : 404, { 'content-type': 'text/plain' });
    r.end(q.url.startsWith('/probe/') ? token : 'nicht hier');
  });
  await new Promise((fertig) => server.listen(0, '127.0.0.1', fertig));
  return { basis: `http://127.0.0.1:${server.address().port}`, aufrufe, ende: () => new Promise((f) => server.close(f)) };
}

rauchtest(
  'Paket ruft einen Dienst im Netz wirklich ab, nicht erlaubte Adresse abgelehnt (#1619)',
  { als: LENA, timeout: 90_000 },
  async () => {
    const token = `netzprobe-${randomBytes(6).toString('hex')}`;
    const dienst = await testDienst(token);
    const cookie = await sitzung(LENA);
    await api('POST', '/api/konto/verwaltung', { cookie, body: { passwort: LENA.passwort } });
    const vorher = (await api('GET', '/api/werkbank/darf', { cookie })).daten;
    try {
      // Eine Dienst-Adresse ist Netz: „Was Ablago darf“ für die Dauer des Tests auf „Auch Helfer, die Dienste im Netz nutzen“.
      await api('PUT', '/api/werkbank/darf', { cookie, body: { pakete: 'netz' } });
      const adresse = `${dienst.basis}/probe`;
      const wasm = modul(
        JSON.stringify({ methode: 'GET', url: `${dienst.basis}/probe/antwort` }),
        JSON.stringify({ methode: 'GET', url: `${dienst.basis}/anders` }),
      );
      const { upload } = (
        await api('POST', '/api/werkbank/pakete/hochladen', {
          cookie,
          body: zip({ 'manifest.yaml': MANIFEST, 'code/modul.wasm': wasm }),
          roh: true,
        })
      ).daten;
      const plan = (await api('POST', '/api/werkbank/pakete/ablauf/plan', { cookie, body: { uploads: [upload] } })).daten;
      assert.deepEqual(plan.pakete[0].vorschau.probleme, [], 'Vorschau ohne Probleme');
      const erg = (
        await api('POST', '/api/werkbank/pakete/ablauf/installieren', {
          cookie,
          body: {
            uploads: [upload],
            bestaetigt: true,
            rechteStand: plan.rechte.stand,
            einstellungen: { [ID]: { adresse } },
            adresseBestaetigt: true,
          },
        })
      ).daten;
      assert.deepEqual(
        erg.installiert.map((p) => p.id),
        [ID],
        JSON.stringify(erg),
      );
      // Der Läufer lädt das Paket nach der Installation; bis dahin meldet „Ausprobieren“, dass er noch nicht bereit ist.
      let r;
      for (let i = 0; i < 60; i++) {
        r = (
          await api('POST', `/api/werkbank/pakete/${ID}/ausprobieren`, {
            cookie,
            body: { name: 'probe.txt', typ: 'text/plain', daten: Buffer.from('Probe').toString('base64'), werte: { adresse } },
          })
        ).daten;
        if (r.ok || !/Läufer/.test(r.fehler ?? '')) break;
        await new Promise((f) => setTimeout(f, 500));
      }
      assert.equal(r.fehler, null, `Ausprobieren: ${JSON.stringify(r)}`);
      assert.deepEqual(r.zeilen, [token], 'die Antwort des Test-Dienstes kommt beim Paket an');
      // Auch das Ereignis „Einstellungen geändert“ nach der Installation ruft den Dienst ab – nie aber /anders.
      assert.ok(dienst.aufrufe.length >= 1, 'der Test-Dienst wurde abgerufen');
      assert.deepEqual([...new Set(dienst.aufrufe)], ['/probe/antwort'], 'die nicht erlaubte Adresse hat den Test-Dienst nie erreicht');
    } finally {
      await api('DELETE', `/api/werkbank/pakete/${ID}`, { cookie }).catch(() => {});
      await api('PUT', '/api/werkbank/darf', { cookie, body: { pakete: vorher.pakete, bestaetigt: true } }).catch(() => {});
      await dienst.ende();
    }
  },
);
