/** Post fotografieren (#490): Fotos → ein PDF → eine Post, Seite anhängen, zwei Posts zusammenlegen. */
import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { PDFDocument } from 'pdf-lib';
import { fotoBetreff, POST_KANAL, POST_STAND } from '../../shared/src/model';
import { speicherDateien } from '../src/dateispeicher';
import { Dienst } from '../src/dienst';
import { speicherEinstellungen } from '../src/einstellungen';
import { Fachfehler } from '../src/fehler';
import { Fotostapel } from '../src/fotostapel';
import { Konten } from '../src/konten';
import { speicherKontoRepo } from '../src/konto-repo';
import { bilderZuPdf, bildArt } from '../src/pdfseiten';
import { speicherRepo } from '../src/repo-speicher';
import { routen, type Anfrage } from '../src/routen';

const status = (s: number) => (e: unknown) => e instanceof Fachfehler && e.status === s;

/** Kleinstes JPEG mit Maßen (Breite × Höhe) und optional EXIF-Ausrichtung – pdf-lib liest nur SOF. */
function jpeg(breite: number, hoehe: number, ausrichtung?: number): Buffer {
  const sof = Buffer.from([0xff, 0xc0, 0, 0x11, 8, hoehe >> 8, hoehe & 255, breite >> 8, breite & 255, 3, 1, 0x11, 0, 2, 0x11, 0, 3, 0x11, 0]);
  const teile = [Buffer.from([0xff, 0xd8])];
  if (ausrichtung) {
    const tiff = Buffer.from([0x4d, 0x4d, 0, 42, 0, 0, 0, 8, 0, 1, 0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, ausrichtung, 0, 0, 0, 0, 0, 0, 0, 0]);
    teile.push(Buffer.from([0xff, 0xe1]), Buffer.from([0, tiff.length + 8]), Buffer.from('Exif\0\0', 'latin1'), tiff);
  }
  teile.push(sof, Buffer.from([0xff, 0xd9]));
  return Buffer.concat(teile);
}
const seiten = async (b: Buffer) => (await PDFDocument.load(b)).getPages();

async function aufbau() {
  const dateien = speicherDateien();
  const d = new Dienst(speicherRepo(), dateien, { einstellungen: speicherEinstellungen() });
  const konten = new Konten(speicherKontoRepo(), null, 'http://nas', d.benutzerspiegel());
  d.verbindeKonten(konten.papierkorbHaken());
  const { benutzer: anna } = await konten.einrichten({ email: 'anna@example.org', name: 'Anna', passwort: 'ein-langes-passwort' });
  await d.gleicheBenutzerAb(await konten.listeBenutzer());
  const wurzel = await mkdtemp(join(tmpdir(), 'dms-fotostapel-test-'));
  const stapel = new Fotostapel(wurzel);
  const tabelle = routen(d, konten, { fotostapel: stapel });
  const rufe = async (m: string, p: string, x: Partial<Anfrage> = {}) =>
    tabelle.find((r) => r.methode === m && r.pfad === p)!.handler({ body: {}, params: {}, query: {}, ip: '1', ...x, benutzer: (await konten.listeBenutzer()).find((u) => u.id === anna.id)! }) as Promise<{ status: number; body: Record<string, unknown> }>;
  const foto = async (b: Buffer) => (await rufe('POST', '/api/fotostapel', { body: b })).body.id as string;
  const pdfVon = async (id: string) => { const s = await dateien.lies((await d.holeMappe(id)).dokumente[0].sha256); return Buffer.isBuffer(s) ? s : Buffer.concat(await s.toArray() as Buffer[]); };
  return { d, anna, rufe, foto, pdfVon, stapel, wurzel, aufraeumen: () => rm(wurzel, { recursive: true, force: true }) };
}

describe('Fotos als PDF (#490)', () => {
  it('erkennt JPEG/PNG am Inhalt, je Foto eine Seite (längste Seite A4), Lage laut EXIF', async () => {
    assert.equal(bildArt(jpeg(4, 3)), 'image/jpeg');
    assert.equal(bildArt(Buffer.from('ftypheic')), null);
    // Buffer mit Versatz (Node-Pool): nur über eigenerPuffer einbettbar.
    const versetzt = Buffer.concat([Buffer.from([1, 2, 3]), jpeg(400, 300, 6)]).subarray(3);
    const s = await seiten(await bilderZuPdf([jpeg(300, 400), versetzt]));
    assert.equal(s.length, 2);
    assert.deepEqual([Math.round(s[0].getWidth()), Math.round(s[0].getHeight())], [632, 842]);
    assert.deepEqual([Math.round(s[1].getWidth()), Math.round(s[1].getHeight())], [842, 632]);
    assert.equal(s[0].getRotation().angle, 0);
    assert.equal(s[1].getRotation().angle, 90);
    await assert.rejects(bilderZuPdf([Buffer.from('kein Bild')]), status(422));
    await assert.rejects(bilderZuPdf([]), status(422));
  });

  it('mehrere Fotos → ein PDF → eine Post mit Betreff „Post vom …“; Stapel ist danach leer', async () => {
    const { d, rufe, foto, pdfVon, wurzel, anna, aufraeumen } = await aufbau();
    try {
      await assert.rejects(rufe('POST', '/api/fotostapel', { body: Buffer.from('<html>') }), status(422));
      const ids = [await foto(jpeg(30, 40)), await foto(jpeg(30, 40)), await foto(jpeg(40, 30))];
      const r = await rufe('POST', '/api/post/fotos', { body: { stapel: ids } });
      assert.equal(r.status, 201);
      const post = (r.body.post as { id: string; werte: Record<string, unknown> });
      assert.match(String(post.werte.betreff), /^Post vom \d{2}\.\d{2}\.\d{4}, \d{2}:\d{2}$/);
      assert.equal(post.werte.kanal, POST_KANAL.hochgeladen);
      assert.equal(post.werte.stand, POST_STAND.neu);
      assert.equal(post.werte.absender ?? null, null);
      const doks = (await d.holeMappe(post.id)).dokumente;
      assert.equal(doks.length, 1);
      assert.equal(doks[0].mime, 'application/pdf');
      assert.equal(doks[0].name, `${post.werte.betreff}.pdf`);
      assert.equal((await seiten(await pdfVon(post.id))).length, 3);
      assert.deepEqual(await readdir(join(wurzel, anna.id)), [], 'Fotos nach Fertig weg');
      // Fotos sind nur einmal verwendbar.
      await assert.rejects(rufe('POST', '/api/post/fotos', { body: { stapel: ids } }), status(410));
      // Eigener Betreff bleibt.
      const r2 = await rufe('POST', '/api/post/fotos', { body: { stapel: [await foto(jpeg(10, 10))], betreff: 'Brief Finanzamt' } });
      assert.equal((r2.body.post as { werte: Record<string, unknown> }).werte.betreff, 'Brief Finanzamt');
      assert.match(fotoBetreff(new Date('2026-11-01T19:52:00Z')), /^Post vom 01\.11\.2026, 20:52$/);
    } finally { await aufraeumen(); }
  });

  it('Seite hinzufügen: hängt an das PDF der Post an (neue Version), ohne PDF entsteht eins', async () => {
    const { d, rufe, foto, pdfVon, aufraeumen } = await aufbau();
    try {
      const r = await rufe('POST', '/api/post/fotos', { body: { stapel: [await foto(jpeg(30, 40))] } });
      const post = r.body.post as { id: string };
      const dok = (await d.holeMappe(post.id)).dokumente[0];
      const a = await rufe('POST', '/api/mappen/:id/fotos', { params: { id: post.id }, body: { stapel: [await foto(jpeg(30, 40)), await foto(jpeg(30, 40))], dokument: dok.id } });
      assert.equal(a.body.seiten, 3);
      const doks = (await d.holeMappe(post.id)).dokumente;
      assert.equal(doks.length, 1);
      assert.equal(doks[0].name, dok.name);
      assert.equal((await seiten(await pdfVon(post.id))).length, 3);
      assert.match(String((await d.historie(post.id)).find((h) => h.art === 'pdf_bearbeitet')!.daten.text), /2 Seiten an „.*“ angehängt/);
      // Fremdes Dokument: 422.
      const anders = await rufe('POST', '/api/post/fotos', { body: { stapel: [await foto(jpeg(5, 5))] } });
      const fremd = (await d.holeMappe((anders.body.post as { id: string }).id)).dokumente[0];
      await assert.rejects(rufe('POST', '/api/mappen/:id/fotos', { params: { id: post.id }, body: { stapel: [await foto(jpeg(5, 5))], dokument: fremd.id } }), status(422));
      // Post ohne Dokument: neues PDF.
      const leer = await rufe('POST', '/api/post', { body: { betreff: 'leer' } });
      const n = await rufe('POST', '/api/mappen/:id/fotos', { params: { id: (leer.body as { id: string }).id }, body: { stapel: [await foto(jpeg(5, 5))] } });
      assert.match(String((n.body.dokument as { name: string }).name), /^Fotos vom .*\.pdf$/);
    } finally { await aufraeumen(); }
  });

  it('zwei Posts zusammenlegen: Seiten der zweiten ans PDF der ersten, zweite in den Papierkorb', async () => {
    const { d, rufe, foto, pdfVon, anna, aufraeumen } = await aufbau();
    try {
      const vorne = (await rufe('POST', '/api/post/fotos', { body: { stapel: [await foto(jpeg(30, 40))], betreff: 'Brief Vorderseite' } })).body.post as { id: string };
      const hinten = (await rufe('POST', '/api/post/fotos', { body: { stapel: [await foto(jpeg(30, 40)), await foto(jpeg(30, 40))], betreff: 'Brief Rückseite' } })).body.post as { id: string };
      // Ein Foto als eigenes Dokument kommt auch mit.
      await d.ladeHoch(hinten.id, { register: 'dokumente', name: 'image.jpg', typ: 'image/jpeg' }, jpeg(20, 20), anna.id);
      const r = await rufe('POST', '/api/post/:id/zusammenlegen', { params: { id: vorne.id }, body: { quelle: hinten.id } });
      assert.equal(r.body.seiten, 4);
      assert.equal((await seiten(await pdfVon(vorne.id))).length, 4);
      await assert.rejects(d.holeMappe(hinten.id), status(404));
      assert.ok((await d.papierkorb({ id: anna.id, rolle: 'admin' })).some((m: { id: string }) => m.id === hinten.id));
      await assert.rejects(rufe('POST', '/api/post/:id/zusammenlegen', { params: { id: vorne.id }, body: { quelle: vorne.id } }), status(422));
      // Andere Dateien lassen sich nicht anhängen.
      const word = (await rufe('POST', '/api/post', { body: { betreff: 'Word' } })).body as { id: string };
      await d.ladeHoch(word.id, { register: 'dokumente', name: 'brief.docx', typ: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }, Buffer.from('PK\x03\x04 docx'), anna.id);
      await assert.rejects(rufe('POST', '/api/post/:id/zusammenlegen', { params: { id: vorne.id }, body: { quelle: word.id } }), status(422));
    } finally { await aufraeumen(); }
  });

  it('Fotostapel: verfällt nach zwei Stunden, fremde Kennungen gehen nicht', async () => {
    const wurzel = await mkdtemp(join(tmpdir(), 'dms-fotostapel-test-'));
    try {
      let jetzt = Date.now();
      const s = new Fotostapel(wurzel, () => jetzt);
      const ben = '11111111-1111-4111-8111-111111111111';
      const id = await s.lege(ben, jpeg(2, 2));
      assert.equal((await s.nimm(ben, [id])).length, 1);
      await assert.rejects(s.nimm('22222222-2222-4222-8222-222222222222', [id]), status(410));
      await assert.rejects(s.nimm(ben, ['../x']), status(422));
      const alt = new Date(Date.now() - 3 * 60 * 60 * 1000);
      await utimes(join(wurzel, ben, id), alt, alt);
      jetzt = Date.now();
      await s.aufraeumen();
      await assert.rejects(s.nimm(ben, [id]), status(410));
    } finally { await rm(wurzel, { recursive: true, force: true }); }
  });
});
