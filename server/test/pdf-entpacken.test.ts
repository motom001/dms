/** PDFs mit gepackten Objektströmen, die sich auf ein Vielfaches entpacken (#823): abgelehnt, bevor pdf-lib sie lädt. */
import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';
import { describe, it } from 'node:test';
import { PDFDocument } from 'pdf-lib';
import { bereinigePdf } from '../src/pdf/anzeige';
import { liesPdfA } from '../src/pdf/archiv';
import { ladePdf, OBJEKTSTROM_MAX, pruefeObjektstroeme } from '../src/pdf/laden';
import { seitenInfo } from '../src/pdf/seiten';

/** Kleines PDF, dessen Objekt 4 ein Objektstrom ist (Inhalt: entpackt, Filter wie angegeben). */
function pdfMitObjektstrom(strom: Buffer, filter = '/FlateDecode'): Buffer {
  const objs = [
    Buffer.from('<< /Type /Catalog /Pages 2 0 R >>'),
    Buffer.from('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'),
    Buffer.from('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] >>'),
    Buffer.concat([
      Buffer.from(`<< /Type /ObjStm /N 1 /First 4 /Filter ${filter} /Length ${strom.length} >>\nstream\n`),
      strom,
      Buffer.from('\nendstream'),
    ]),
  ];
  const teile: Buffer[] = [Buffer.from('%PDF-1.7\n')];
  const offs: number[] = [];
  let n = teile[0].length;
  objs.forEach((o, i) => {
    offs.push(n);
    const t = Buffer.concat([Buffer.from(`${i + 1} 0 obj\n`), o, Buffer.from('\nendobj\n')]);
    teile.push(t);
    n += t.length;
  });
  const xref = `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offs.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${n}\n%%EOF\n`;
  return Buffer.concat([...teile, Buffer.from(xref)]);
}

describe('Entpack-Grenze für Objektströme (#823)', () => {
  it('lehnt einen Objektstrom ab, der sich über die Grenze entpackt – vor pdf-lib, ohne den Speicher zu füllen', async () => {
    const bombe = pdfMitObjektstrom(deflateSync(Buffer.alloc(OBJEKTSTROM_MAX + 1024 * 1024, 32), { level: 9 }));
    assert.ok(bombe.length < 1024 * 1024, `nur ${Math.round(bombe.length / 1024)} KB gepackt`);
    assert.throws(() => pruefeObjektstroeme(bombe), /Vielfaches/);
    await assert.rejects(ladePdf(bombe), /Vielfaches/);
    await assert.rejects(bereinigePdf(bombe), /Vielfaches/);
    await assert.rejects(seitenInfo(bombe));
    assert.equal((await liesPdfA(bombe)).lesbar, false, 'Archivprüfung: nicht lesbar statt Speicher voll');
  });

  it('andere Filter für Objektströme: abgelehnt; harmlose PDFs mit Objektströmen laden wie bisher', async () => {
    assert.throws(() => pruefeObjektstroeme(pdfMitObjektstrom(Buffer.from('1 0 '), '/LZWDecode')), /ungewöhnlich verpackt/);
    const d = await PDFDocument.create();
    d.addPage();
    d.addPage();
    const mitStroemen = Buffer.from(await d.save({ useObjectStreams: true }));
    assert.equal((await ladePdf(mitStroemen)).getPageCount(), 2);
    assert.equal((await seitenInfo(mitStroemen)).anzahl, 2);
    assert.doesNotThrow(() => pruefeObjektstroeme(pdfMitObjektstrom(deflateSync(Buffer.from('5 0 << /A 1 >>')))));
  });

  it('unmögliche Angaben in Querverweis- und Objektströmen (gefunden mit den Fuzz-Tests): abgelehnt statt Hänger', async () => {
    const xref = (dict: string, strom = Buffer.from([1, 0, 0, 0])) => {
      const kopf = Buffer.from('%PDF-1.7\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
      return Buffer.concat([
        kopf,
        Buffer.from(`3 0 obj\n<< /Type /XRef ${dict} /Length ${strom.length} >>\nstream\n`),
        strom,
        Buffer.from('\nendstream\nendobj\nstartxref\n0\n%%EOF\n'),
      ]);
    };
    assert.throws(() => pruefeObjektstroeme(xref('/Size 1 /W [1 2 2147483647]')), /unstimmige Querverweise/);
    assert.throws(() => pruefeObjektstroeme(xref('/Size 2 /W [1 1 1] /Index [0 2147483647]')), /unstimmige Querverweise/);
    assert.throws(() => pruefeObjektstroeme(xref('/Size 99999 /W [1 1 1]')), /unstimmige Querverweise/);
    assert.throws(
      () =>
        pruefeObjektstroeme(
          Buffer.from(
            pdfMitObjektstrom(deflateSync(Buffer.from('5 0 << /A 1 >>')))
              .toString('latin1')
              .replace('/N 1', '/N 2147483647'),
            'latin1',
          ),
        ),
      /unstimmige/,
    );
    assert.doesNotThrow(() => pruefeObjektstroeme(xref('/Size 1 /W [1 2 1]')));
    await assert.rejects(ladePdf(xref('/Size 1 /W [1 2 2147483647]')), /unstimmige Querverweise/);
  });
});
