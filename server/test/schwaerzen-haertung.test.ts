/**
 * Schwärzen – Härtung nach der Nachprüfung durch den Chat Sicherheit (#392/#459): ungültige Drehangaben,
 * Schreibweisen von Suchbegriffen (Silbentrennung, weiches Trennzeichen, ß/SS, freistehendes Trema).
 */
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { bereicheVon, findeBegriff, type SchwaerzSeite, type Wort } from '../../shared/src/schwaerzen';
import { Fachfehler } from '../src/fehler';
import { analysiere, lagePasst, pnmKopf, schwaerze } from '../src/pdf/schwaerzen';

const lauf = (cmd: string, args: string[]) => new Promise<void>((ok, f) => execFile(cmd, args, (e) => (e ? f(e) : ok())));

/** Ein PDF von Hand: eine Seite mit beliebigem Seitenwörterbuch-Zusatz, roter Text (Helvetica). */
function pdf(seite: string, inhalt: string): Buffer {
  const objekte = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R ${seite} /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>`,
    `<< /Length ${Buffer.byteLength(inhalt, 'latin1')} >>\nstream\n${inhalt}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
  ];
  let t = '%PDF-1.6\n';
  const v: number[] = [];
  objekte.forEach((o, i) => {
    v.push(Buffer.byteLength(t, 'latin1'));
    t += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const x = Buffer.byteLength(t, 'latin1');
  t += `xref\n0 ${objekte.length + 1}\n0000000000 65535 f \n${v.map((n) => `${String(n).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objekte.length + 1} /Root 1 0 R >>\nstartxref\n${x}\n%%EOF\n`;
  return Buffer.from(t, 'latin1');
}

/** Rote Bildpunkte nach dem Rendern mit poppler – rot ist nur das geheime Wort. */
async function rot(b: Buffer): Promise<number> {
  const dir = await mkdtemp(join(tmpdir(), 'dms-test-rot-'));
  try {
    await writeFile(join(dir, 'a.pdf'), b);
    await lauf('pdftoppm', ['-r', '100', join(dir, 'a.pdf'), join(dir, 'r')]);
    let n = 0;
    for (const name of (await readdir(dir)).filter((x) => x.endsWith('.ppm'))) {
      const px = await readFile(join(dir, name));
      const k = pnmKopf(px);
      for (let i = 0; i < k.breite * k.hoehe; i++) {
        const o = k.start + i * 3;
        if (px[o] > 140 && px[o + 1] < 110 && px[o + 2] < 110) n++;
      }
    }
    return n;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const seite = (text: string): SchwaerzSeite => ({
  breite: 600,
  hoehe: 800,
  woerter: text.split('\n').flatMap((z, zeile) => z.split(' ').map((w, i): Wort => [w, 0.05 + i * 0.1, 0.1 + zeile * 0.05, 0.08, 0.02])),
});

describe('Schwärzen: Härtung (Nachprüfung Sicherheit)', () => {
  it('Suchbegriff findet auch Silbentrennung, weiches Trennzeichen, Null-Breite, ß/SS und freistehendes Trema', () => {
    const s = [seite('Herr Mül-\nler wohnt hier\nGROSSMANN und Gross­mann und Zim​mer\nMu¨ller und Muller')];
    const w = (b: string) =>
      findeBegriff(s, b)
        .map((f) => f.woerter)
        .sort((x, y) => x[0] - y[0]);
    assert.deepEqual(w('Müller'), [[1, 2], [10]], 'über die Silbentrennung und mit freistehendem Trema');
    assert.deepEqual(w('Großmann'), [[5], [7]], 'Versalien mit SS und weiches Trennzeichen im Wort');
    assert.deepEqual(w('Zimmer'), [[9]], 'Null-Breite-Zeichen');
    assert.deepEqual(w('Muller'), [[12]], '„Muller“ ohne Umlaut bleibt ein anderes Wort');
  });

  it('Lage der Seite: hoch und quer werden unterschieden', () => {
    assert.equal(lagePasst(1240, 1754, 595, 842), true);
    assert.equal(lagePasst(1754, 1240, 595, 842), false);
    assert.equal(lagePasst(0, 10, 595, 842), false);
  });

  it('/Rotate 90.0 (ungültig, poppler zeichnet ungedreht): das Wort ist im Bild wirklich weg', async () => {
    const p = pdf(
      '/MediaBox [0 0 595 842] /Rotate 90.0',
      'BT 1 0 0 rg /F1 24 Tf 72 700 Td (Geheimwort) Tj 0 0 0 rg 0 -40 Td (bleibt stehen) Tj ET',
    );
    assert.ok((await rot(p)) > 500, 'vorher rot sichtbar');
    try {
      const a = await analysiere(p, 'application/pdf');
      const r = await schwaerze(p, 'application/pdf', a, bereicheVon(a.seiten, findeBegriff(a.seiten, 'geheimwort')));
      assert.equal(await rot(r.inhalt), 0, 'kein roter Bildpunkt mehr');
    } catch (e) {
      // Erlaubt ist nur der ausdrückliche Abbruch – nie eine Schwärzung, unter der das Wort sichtbar bleibt.
      assert.ok(e instanceof Fachfehler && e.status === 422 && /Lage der Seite/.test(e.message), (e as Error).message);
    }
  });
});
