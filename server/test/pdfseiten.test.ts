/**
 * PDF bearbeiten (#335): drehen, Seiten löschen, umsortieren, teilen (Mappe und Post), zusammenfügen.
 * Seiten erkennt der Test an ihrer Breite (Seite n ist 100 + n Punkte breit).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PDFDocument } from 'pdf-lib';
import { POST_STAND, auswahlText } from '../../shared/src/model';
import { speicherDateien } from '../src/dateispeicher';
import { Dienst } from '../src/dienst';
import { speicherEinstellungen } from '../src/einstellungen';
import { Fachfehler } from '../src/fehler';
import { fuegeZusammen, pruefeAuswahl, pruefeTeile, Seitenbilder, seitenInfo, teilName } from '../src/pdfseiten';
import type { Repo } from '../src/repo';
import { speicherRepo } from '../src/repo-speicher';

const ANNA = '00000000-0000-4000-8000-0000000000bb';
const status = (s: number, text?: RegExp) => (e: unknown) => e instanceof Fachfehler && e.status === s && (!text || text.test(e.message));

async function pdf(seiten: number, start = 1): Promise<Buffer> {
  const d = await PDFDocument.create();
  for (let i = 0; i < seiten; i++) d.addPage([100 + start + i, 200]);
  return Buffer.from(await d.save());
}
async function breiten(b: Buffer): Promise<number[]> {
  return (await PDFDocument.load(b)).getPages().map((p) => p.getWidth() - 100);
}
const postRegister = async (d: Dienst, typId: string) =>
  (await (d as unknown as { repo: Repo }).repo.holeTyp(typId))!.register.find((x) => x.art === 'dokumente')!.key;
const drehungen = async (b: Buffer) => (await seitenInfo(b)).drehungen;

async function aufbau(versionierung = true) {
  const dateien = speicherDateien();
  const d = new Dienst(speicherRepo(), dateien, { einstellungen: speicherEinstellungen() });
  const typ = await d.legeTypAn({ name: 'Vertrag', titelVorlage: '{nr}', felder: [{ key: 'nr', label: 'Nr', typ: 'text' }], register: [
    { key: 'allgemein', name: 'Allgemein', art: 'felder', felder: ['nr'] },
    { key: 'dokumente', name: 'Unterlagen', art: 'dokumente', versionierung },
  ] });
  const m = await d.legeMappeAn({ typId: typ.id, werte: { nr: 'Strom' } }, ANNA);
  const doc = (await d.ladeHoch(m.id, { register: 'dokumente', name: 'Scan.pdf', typ: 'application/pdf' }, await pdf(5), ANNA)).dokument;
  const inhalt = async (id: string) => {
    const s = (await d.dokumentInhalt(id)).inhalt;
    return Buffer.isBuffer(s) ? s : Buffer.concat(await s.toArray() as Buffer[]);
  };
  return { d, typ, m, doc, inhalt };
}

describe('PDF bearbeiten (#335)', () => {
  it('Bausteine: Auswahl und Teile prüfen, Namen der Teile', () => {
    assert.throws(() => pruefeAuswahl([], 3), status(422, /Mindestens eine Seite/));
    assert.throws(() => pruefeAuswahl([{ nr: 4 }], 3), status(422, /gibt es nicht/));
    assert.throws(() => pruefeAuswahl([{ nr: 1, drehung: 45 }], 3), status(422, /90 Grad/));
    assert.deepEqual(pruefeAuswahl([{ nr: 2, drehung: -90 }], 3), [{ nr: 2, drehung: 270 }]);
    assert.deepEqual(pruefeTeile(undefined, 3), [0]);
    assert.deepEqual(pruefeTeile([2, 1, 2], 3), [0, 1, 2]);
    assert.throws(() => pruefeTeile([3], 3), status(422));
    assert.equal(teilName('Rechnung.pdf', 2), 'Rechnung (Teil 2).pdf');
    assert.equal(teilName('ohne', 1), 'ohne (Teil 1)');
  });

  it('drehen, löschen, umsortieren → neue Version; das Original bleibt als ältere Version', async () => {
    const { d, m, doc, inhalt } = await aufbau();
    const info = await d.pdfSeiten(doc.id);
    assert.equal(info.anzahl, 5);
    await assert.rejects(d.bearbeitePdf(doc.id, { seiten: [1, 2, 3, 4, 5].map((nr) => ({ nr })) }, ANNA), status(422, /nichts geändert/));
    const r = await d.bearbeitePdf(doc.id, { seiten: [{ nr: 3 }, { nr: 1, drehung: 90 }, { nr: 5 }] }, ANNA);
    assert.equal(r.dokumente.length, 1);
    assert.equal(r.dokumente[0].id, doc.id, 'gleiches Dokument');
    assert.equal(r.dokumente[0].version, 2);
    assert.equal(r.dokumente[0].herkunft, 'bearbeitet');
    const neu = await inhalt(doc.id);
    assert.deepEqual(await breiten(neu), [3, 1, 5]);
    assert.deepEqual(await drehungen(neu), [0, 90, 0]);
    assert.equal((await d.versionen(doc.id)).aeltere.length, 1, 'Original als Version 1');
    const h = (await d.historie(m.id)).find((x) => x.art === 'pdf_bearbeitet');
    assert.match(String(h?.daten.text), /5 → 3 Seiten, 1 Seite gedreht/);
    // Noch einmal drehen addiert sich.
    await d.bearbeitePdf(doc.id, { seiten: [{ nr: 1 }, { nr: 2, drehung: 270 }, { nr: 3 }] }, ANNA);
    assert.deepEqual(await drehungen(await inhalt(doc.id)), [0, 0, 0]);
  });

  it('ohne Versionierung nur nach Rückfrage; das bisherige kommt in den Papierkorb', async () => {
    const { d, m, doc, inhalt } = await aufbau(false);
    await assert.rejects(d.bearbeitePdf(doc.id, { seiten: [{ nr: 2 }] }, ANNA), (e) => e instanceof Fachfehler && e.status === 409 && (e.details as { rueckfrage?: boolean }).rueckfrage === true);
    const r = await d.bearbeitePdf(doc.id, { seiten: [{ nr: 2 }], bestaetigt: true }, ANNA);
    assert.notEqual(r.dokumente[0].id, doc.id);
    assert.equal(r.dokumente[0].name, 'Scan.pdf');
    assert.deepEqual(await breiten(await inhalt(r.dokumente[0].id)), [2]);
    assert.deepEqual((await d.holeMappe(m.id)).dokumente.map((x) => x.name), ['Scan.pdf']);
    assert.equal((await d.papierkorbDokumente({ id: ANNA, rolle: 'mitglied' })).length, 1, 'Original im Papierkorb');
  });

  it('teilen in einer Mappe: Teil 1 als neue Version, weitere Teile als eigene Dokumente', async () => {
    const { d, m, doc, inhalt } = await aufbau();
    const r = await d.bearbeitePdf(doc.id, { seiten: [1, 2, 3, 4, 5].map((nr) => ({ nr })), teile: [2, 4] }, ANNA);
    assert.deepEqual(r.dokumente.map((x) => x.name), ['Scan (Teil 1).pdf', 'Scan (Teil 2).pdf', 'Scan (Teil 3).pdf']);
    assert.equal(r.dokumente[0].id, doc.id);
    assert.deepEqual(await breiten(await inhalt(r.dokumente[1].id)), [3, 4]);
    assert.deepEqual(await breiten(await inhalt(r.dokumente[2].id)), [5]);
    assert.equal((await d.holeMappe(m.id)).dokumente.length, 3);
    assert.equal((await d.versionen(doc.id)).aeltere.length, 1, 'das ganze Original bleibt als Version 1');
  });

  it('Post teilen: je Teil eine neue Post, die Ausgangspost ist erledigt und verweist auf die neuen', async () => {
    const { d, inhalt } = await aufbau();
    const post = await d.legePostAn({ betreff: 'Sammelscan', absender: 'Scanner' }, { id: ANNA, name: 'Anna' });
    const reg = { key: await postRegister(d, post.typId) };
    const doc = (await d.ladeHoch(post.id, { register: reg.key, name: 'Stapel.pdf', typ: 'application/pdf' }, await pdf(4), ANNA)).dokument;
    const r = await d.bearbeitePdf(doc.id, { seiten: [1, 2, 3, 4].map((nr) => ({ nr })), teile: [1, 3] }, ANNA);
    assert.equal(r.posten.length, 3);
    assert.deepEqual(r.posten.map((p) => p.werte.betreff), ['Sammelscan (Teil 1)', 'Sammelscan (Teil 2)', 'Sammelscan (Teil 3)']);
    assert.ok(r.posten.every((p) => auswahlText(p.werte.stand) === POST_STAND.neu && p.werte.absender === 'Scanner'));
    assert.deepEqual(await breiten(await inhalt(r.dokumente[1].id)), [2, 3]);
    const alt = await d.holeMappe(post.id);
    assert.equal(auswahlText(alt.mappe.werte.stand), POST_STAND.erledigt);
    assert.deepEqual(alt.mappe.werte.bezug, r.posten.map((p) => p.id));
    assert.equal(alt.dokumente.length, 1, 'die Ausgangspost behält ihr Dokument');
    assert.deepEqual(await breiten(await inhalt(doc.id)), [1, 2, 3, 4], 'unverändert');
    assert.ok((await d.historie(r.posten[0].id)).some((h) => h.art === 'post_geteilt' && h.daten.post === post.id));
  });

  it('zusammenfügen: aus zwei Posts in die erste; die leere Post ist danach erledigt', async () => {
    const { d, inhalt } = await aufbau();
    const p1 = await d.legePostAn({ betreff: 'Brief Seite 1' }, { id: ANNA, name: 'Anna' });
    const p2 = await d.legePostAn({ betreff: 'Brief Seite 2' }, { id: ANNA, name: 'Anna' });
    const reg = await postRegister(d, p1.typId);
    const a = (await d.ladeHoch(p1.id, { register: reg, name: 'Brief.pdf', typ: 'application/pdf' }, await pdf(2, 1), ANNA)).dokument;
    const b = (await d.ladeHoch(p2.id, { register: reg, name: 'Brief2.pdf', typ: 'application/pdf' }, await pdf(1, 3), ANNA)).dokument;
    await assert.rejects(d.fuegePdfZusammen({ dokumente: [a.id] }, ANNA), status(422, /mindestens zwei/));
    const r = await d.fuegePdfZusammen({ dokumente: [a.id, b.id], originaleEntfernen: true }, ANNA);
    assert.equal(r.dokument.name, 'Brief.pdf', 'Name des ersten ohne „(2)“');
    assert.equal(r.dokument.mappeId, p1.id);
    assert.deepEqual(await breiten(await inhalt(r.dokument.id)), [1, 2, 3]);
    assert.deepEqual(r.erledigtePost, [p2.id]);
    const x = await d.holeMappe(p2.id);
    assert.equal(auswahlText(x.mappe.werte.stand), POST_STAND.erledigt);
    assert.deepEqual(x.mappe.werte.bezug, [p1.id]);
    assert.equal((await d.holeMappe(p1.id)).dokumente.length, 1);
  });

  it('zusammenfügen ohne Entfernen lässt die Originale; Nicht-PDFs werden abgelehnt', async () => {
    const { d, m, doc } = await aufbau();
    const b = (await d.ladeHoch(m.id, { register: 'dokumente', name: 'b.pdf', typ: 'application/pdf' }, await pdf(1, 9), ANNA)).dokument;
    const r = await d.fuegePdfZusammen({ dokumente: [doc.id, b.id], name: 'Alles' }, ANNA);
    assert.equal(r.dokument.name, 'Alles.pdf');
    assert.equal((await d.holeMappe(m.id)).dokumente.length, 3);
    const txt = (await d.ladeHoch(m.id, { register: 'dokumente', name: 'n.txt', typ: 'text/plain' }, Buffer.from('hallo'), ANNA)).dokument;
    await assert.rejects(d.fuegePdfZusammen({ dokumente: [doc.id, txt.id] }, ANNA), status(422, /kein PDF/));
    await assert.rejects(d.pdfSeiten(txt.id), status(422, /kein PDF/));
  });

  it('Seitenbilder: einmal erzeugt, für die letzten Dokumente gemerkt', async () => {
    let laeufe = 0;
    const sb = new Seitenbilder(2, async () => { laeufe++; return [Buffer.from('s1'), Buffer.from('s2')]; });
    const quelle = async () => Buffer.alloc(0);
    assert.equal(String(await sb.bild('a', 2, quelle)), 's2');
    assert.equal(await sb.bild('a', 3, quelle), null);
    assert.equal(laeufe, 1);
    await sb.bild('b', 1, quelle); await sb.bild('c', 1, quelle);
    await sb.bild('a', 1, quelle);
    assert.equal(laeufe, 4, '„a“ war verdrängt');
    const zwei = await fuegeZusammen([await pdf(1), await pdf(1, 2)]);
    assert.equal((await seitenInfo(zwei)).anzahl, 2);
  });
});
