/**
 * Scans mit hoher Auflösung (#1600): Bilder über 300 dpi kommen für Texterkennung und Bildanalyse mit 300 dpi, das
 * Original bleibt; das Dokument trägt danach `verkleinertDpi`. Auflösung aus JFIF, EXIF und pHYs. Arbeitsspeicher und –
 * mit TEST_DATABASE_URL – PostgreSQL. Bilder sind erfunden (einfarbig).
 */
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { deflateSync } from 'node:zlib';
import { bildDpi } from '../src/pdf';
import { lesePgm } from '../src/dateien/graubild';
import { speicherDateien } from '../src/dateien/dateispeicher';
import { Dienst } from '../src/dienst/dienst';
import { speicherEinstellungen } from '../src/einstellungen/einstellungen';
import type { Repo } from '../src/repo';
import { speicherRepo } from '../src/repo/speicher';
import { eigeneDatenbank } from './hilfe-db';

const HAUSHALT = '00000000-0000-4000-8000-000000000001';
const ANNA = '00000000-0000-4000-8000-0000000000bb';

/** CRC-32 für PNG-Blöcke. */
function crc32(b: Buffer): number {
  let c = ~0;
  for (const x of b) {
    c ^= x;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}
function block(art: string, daten: Buffer): Buffer {
  const kopf = Buffer.alloc(8);
  kopf.writeUInt32BE(daten.length, 0);
  kopf.write(art, 4, 'latin1');
  const pruef = Buffer.alloc(4);
  pruef.writeUInt32BE(crc32(Buffer.concat([kopf.subarray(4), daten])));
  return Buffer.concat([kopf, daten, pruef]);
}
/** Graues PNG (8 Bit Graustufen) mit `dpi` im Block pHYs (ohne dpi: kein pHYs). */
function png(breite: number, hoehe: number, dpi?: number): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(breite, 0);
  ihdr.writeUInt32BE(hoehe, 4);
  ihdr[8] = 8; // Bittiefe
  ihdr[9] = 0; // Graustufen
  const zeile = Buffer.concat([Buffer.from([0]), Buffer.alloc(breite, 200)]);
  const roh = Buffer.concat(Array.from({ length: hoehe }, () => zeile));
  const teile = [block('IHDR', ihdr)];
  if (dpi) {
    const phys = Buffer.alloc(9);
    phys.writeUInt32BE(Math.round(dpi / 0.0254), 0);
    phys.writeUInt32BE(Math.round(dpi / 0.0254), 4);
    phys[8] = 1;
    teile.push(block('pHYs', phys));
  }
  teile.push(block('IDAT', deflateSync(roh)), block('IEND', Buffer.alloc(0)));
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), ...teile]);
}
/** Nur der Anfang eines JPEG mit JFIF-Kopf (reicht für die Auflösung). */
function jfif(einheit: number, x: number): Buffer {
  const app0 = Buffer.from([0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, einheit, x >> 8, x & 255, x >> 8, x & 255, 0, 0]);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), app0, Buffer.from([0xff, 0xda, 0, 2])]);
}
/** JPEG-Anfang mit EXIF (Intel-Reihenfolge): XResolution als Bruch, ResolutionUnit. */
function exif(zaehler: number, nenner: number, einheit: number): Buffer {
  const t = Buffer.alloc(8 + 2 + 2 * 12 + 4 + 8);
  t.write('II', 0, 'latin1');
  t.writeUInt16LE(42, 2);
  t.writeUInt32LE(8, 4);
  t.writeUInt16LE(2, 8);
  const bruch = 8 + 2 + 24 + 4;
  // XResolution (RATIONAL, 1 Wert, Verweis auf den Bruch)
  t.writeUInt16LE(0x011a, 10);
  t.writeUInt16LE(5, 12);
  t.writeUInt32LE(1, 14);
  t.writeUInt32LE(bruch, 18);
  // ResolutionUnit (SHORT)
  t.writeUInt16LE(0x0128, 22);
  t.writeUInt16LE(3, 24);
  t.writeUInt32LE(1, 26);
  t.writeUInt16LE(einheit, 30);
  t.writeUInt32LE(zaehler, bruch);
  t.writeUInt32LE(nenner, bruch + 4);
  const inhalt = Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), t]);
  const kopf = Buffer.from([0xff, 0xe1, (inhalt.length + 2) >> 8, (inhalt.length + 2) & 255]);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), kopf, inhalt, Buffer.from([0xff, 0xda, 0, 2])]);
}

describe('Auflösung eines Scans aus der Datei (#1600)', () => {
  it('PNG (pHYs), JPEG (JFIF in dpi und je cm, EXIF in Zoll und cm); ohne Angabe null', () => {
    assert.equal(bildDpi(png(4, 4, 600)), 600);
    assert.equal(bildDpi(png(4, 4)), null);
    assert.equal(bildDpi(jfif(1, 600)), 600);
    assert.equal(bildDpi(jfif(2, 118)), 300);
    assert.equal(bildDpi(jfif(0, 1)), null, 'Einheit 0: nur Seitenverhältnis');
    assert.equal(bildDpi(exif(600, 1, 2)), 600);
    assert.equal(bildDpi(exif(23622, 100, 3)), 600);
    assert.equal(bildDpi(Buffer.from('%PDF-1.4')), null);
  });
});

const offen: Array<{ end(): Promise<void> }> = [];
after(async () => {
  for (const s of offen) await s.end();
});
async function repo(pg: boolean): Promise<Repo> {
  if (!pg) return speicherRepo();
  const { pgRepo } = await import('../src/repo/pg');
  const { sql } = await eigeneDatenbank('scan_dpi');
  offen.push(sql);
  await sql`INSERT INTO haushalte (id, name) VALUES (${HAUSHALT}, 'Test') ON CONFLICT DO NOTHING`;
  await sql`INSERT INTO benutzer (id, haushalt_id, email, name, rolle) VALUES (${ANNA}, ${HAUSHALT}, 'anna@example.org', 'Anna', 'mitglied') ON CONFLICT DO NOTHING`;
  return pgRepo(sql, HAUSHALT) as never;
}

for (const pg of [false, ...(process.env.TEST_DATABASE_URL ? [true] : [])]) {
  describe(`Scan über 300 dpi für die Texterkennung (#1600, ${pg ? 'PostgreSQL' : 'Arbeitsspeicher'})`, () => {
    it('600 dpi kommt mit 300 dpi (halb so viele Bildpunkte), das Original bleibt, das Dokument trägt den Hinweis', async () => {
      const d = new Dienst(await repo(pg), speicherDateien(), { einstellungen: speicherEinstellungen() });
      const typ = await d.mappentypen.legeTypAn({
        name: 'Beleg',
        felder: [{ key: 'nr', label: 'Nr', typ: 'text' }],
        register: [
          { key: 'allgemein', name: 'Allgemein', art: 'felder', felder: ['nr'] },
          { key: 'dokumente', name: 'Dokumente', art: 'dokumente' },
        ],
      });
      const m = await d.mappen.legeMappeAn({ typId: typ.id, werte: { nr: '1' } }, ANNA);
      const scan = png(600, 400, 600);
      const x = (await d.dokumente.ladeHoch(m.id, { register: 'dokumente', name: 'scan.png' }, scan, ANNA)).dokument;
      const bild = lesePgm(await d.pdfBearbeiten.seiteAlsGraubild(x.id, 1, 300))!;
      assert.deepEqual([bild.breite, bild.hoehe], [300, 200]);
      const nachher = (await d.kern.repo.holeDokument(x.id))!;
      assert.equal(nachher.verkleinertDpi, 600);
      assert.equal(nachher.sha256, x.sha256, 'Original unverändert');
      // Farbbild (Archivfassung) ebenso verkleinert: P6 mit 300 × 200 Bildpunkten.
      const farbe = await d.pdfBearbeiten.seiteAlsGraubild(x.id, 1, 300, true);
      assert.match(farbe.subarray(0, 15).toString('latin1'), /^P6\s+300\s+200\s/);

      // 300 dpi und ohne Angabe: Originalgröße, kein Hinweis.
      for (const [name, inhalt] of [
        ['dreihundert.png', png(600, 400, 300)],
        ['ohne.png', png(600, 400)],
      ] as const) {
        const y = (await d.dokumente.ladeHoch(m.id, { register: 'dokumente', name }, inhalt, ANNA)).dokument;
        const g = lesePgm(await d.pdfBearbeiten.seiteAlsGraubild(y.id, 1, 300))!;
        assert.deepEqual([g.breite, g.hoehe], [600, 400], name);
        assert.equal((await d.kern.repo.holeDokument(y.id))!.verkleinertDpi, undefined, name);
      }
    });
  });
}
