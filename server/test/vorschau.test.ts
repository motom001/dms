/**
 * Vorschaubilder der ersten Seite (#332). poppler (pdftoppm) läuft nur, wenn installiert
 * (in GitHub Actions: ja); sonst prüft ein Ersatz-Erzeuger Warteschlange, Ablage und Rechte.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { speicherDateien } from '../src/dateispeicher';
import { Dienst } from '../src/dienst';
import { speicherEinstellungen } from '../src/einstellungen';
import { Fachfehler } from '../src/fehler';
import { Konten } from '../src/konten';
import { speicherKontoRepo } from '../src/konto-repo';
import { pdfAus } from '../src/pdf';
import { speicherRepo } from '../src/repo-speicher';
import { routen, type Anfrage, type Datei } from '../src/routen';
import { ordnerAblage, popplerErzeuger, speicherAblage, VORSCHAU_PX, Vorschaubilder, type Erzeuger } from '../src/vorschau';

// 1×1-PNG und ein kleines JPEG (8×8, grau)
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const hatPoppler = (() => { try { execFileSync('pdftoppm', ['-v'], { stdio: 'ignore' }); return true; } catch { return false; } })();
const istJpeg = (b: Buffer) => b[0] === 0xff && b[1] === 0xd8;
const groesseJpeg = (b: Buffer): [number, number] => {
  // SOF0/SOF2 suchen: FF C0/C2, Länge, Präzision, Höhe, Breite
  for (let i = 2; i < b.length - 9; i++) if (b[i] === 0xff && (b[i + 1] === 0xc0 || b[i + 1] === 0xc2)) return [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)];
  return [0, 0];
};

const status = (s: number) => (e: unknown) => e instanceof Fachfehler && e.status === s;

async function aufbau(erzeuger?: Erzeuger) {
  const dateien = speicherDateien();
  const d = new Dienst(speicherRepo(), dateien, { einstellungen: speicherEinstellungen() });
  const ablage = speicherAblage();
  const v = new Vorschaubilder(ablage, dateien, erzeuger);
  d.verbindeVorschau(v);
  const konten = new Konten(speicherKontoRepo(), null, 'http://nas', d.benutzerspiegel());
  d.verbindeKonten(konten.papierkorbHaken());
  const { benutzer: admin } = await konten.einrichten({ email: 'admin@example.org', name: 'Admin', passwort: 'ein-langes-passwort' });
  const anna = (await konten.legeBenutzerAn({ email: 'anna@example.org', name: 'Anna', rolle: 'mitglied' }, admin.id)).benutzer;
  await d.gleicheBenutzerAb(await konten.listeBenutzer());
  const ALLES = { C: true, R: true, U: true, D: true, P: true };
  const typ = await d.legeTypAn({ name: 'Rechnung', felder: [{ key: 'nr', label: 'Nr', typ: 'text' }] });
  const geheim = await d.legeTypAn({ name: 'Gesundheit', felder: [{ key: 'nr', label: 'Nr', typ: 'text' }],
    berechtigungen: { grund: ALLES, regeln: [{ id: 'anna', name: 'Anna nicht', wenn: [{ art: 'benutzer', benutzer: [anna.id] }], dann: { R: 'entziehen' }, stopp: false }] } } as never);
  const ich = async (id: string) => (await konten.listeBenutzer()).find((b) => b.id === id)!;
  const tabelle = routen(d, konten, { vorschau: v });
  const rufe = async (b: { id: string }, m: string, pf: string, x: Partial<Anfrage> = {}) => tabelle.find((t) => t.methode === m && t.pfad === pf)!.handler({ body: {}, params: {}, query: {}, ip: '1', ...x, benutzer: await ich(b.id) });
  return { d, v, ablage, typ, geheim, admin, anna, rufe };
}

describe('Vorschaubilder (#332)', () => {
  it('entsteht nach dem Hochladen einmal im Hintergrund, je Prüfwert; andere Dateitypen bekommen keins', async () => {
    let aufrufe = 0;
    const { d, v, ablage, typ, admin } = await aufbau(async (_inhalt, mime) => { aufrufe++; return Buffer.from(`bild ${mime}`); });
    const m = await d.legeMappeAn({ typId: typ.id, werte: { nr: '1' } }, admin.id);
    const pdf = (await d.ladeHoch(m.id, { register: 'dokumente', name: 'Scan.pdf' }, pdfAus([{ text: 'Rechnung' }]), admin.id)).dokument;
    const png = (await d.ladeHoch(m.id, { register: 'dokumente', name: 'IMG_4711.png' }, PNG, admin.id)).dokument;
    const txt = (await d.ladeHoch(m.id, { register: 'dokumente', name: 'notiz.txt' }, Buffer.from('nur Text'), admin.id)).dokument;
    // Gleicher Inhalt in einer zweiten Mappe: kein zweites Bild.
    const m2 = await d.legeMappeAn({ typId: typ.id, werte: { nr: '2' } }, admin.id);
    await d.ladeHoch(m2.id, { register: 'dokumente', name: 'Kopie.pdf' }, pdfAus([{ text: 'Rechnung' }]), admin.id);
    await v.fertig();
    assert.equal(aufrufe, 2);
    assert.equal(ablage.bilder.size, 2);
    assert.equal(String(await v.bild(pdf)), 'bild application/pdf');
    assert.equal(String(await v.bild(png)), 'bild image/png');
    assert.equal(await v.bild(txt), null);
    assert.equal(v.wartend, 0);
    // Nochmal abrufen erzeugt nichts neu.
    await v.bild(pdf); await v.fertig();
    assert.equal(aufrufe, 2);
    assert.deepEqual(await v.belegung(), { anzahl: 2, bytes: 'bild application/pdf'.length + 'bild image/png'.length });
  });

  it('merkt sich Fehler und versucht es nicht bei jedem Anzeigen neu', async () => {
    let aufrufe = 0;
    const { d, v, typ, admin } = await aufbau(async () => { aufrufe++; throw new Error('kaputt'); });
    const m = await d.legeMappeAn({ typId: typ.id, werte: { nr: '1' } }, admin.id);
    const doc = (await d.ladeHoch(m.id, { register: 'dokumente', name: 'defekt.pdf' }, Buffer.from('%PDF-1.4 kaputt'), admin.id)).dokument;
    await v.fertig();
    assert.equal(await v.bild(doc), null);
    await v.fertig();
    assert.equal(aufrufe, 1);
  });

  it('Route: gleiche Rechte wie das Dokument, 404 ohne Bild, Bild mit eigener Zwischenspeicherung', async () => {
    const { d, v, typ, geheim, admin, anna, rufe } = await aufbau(async () => Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
    const m = await d.legeMappeAn({ typId: typ.id, werte: { nr: '1' } }, admin.id);
    const doc = (await d.ladeHoch(m.id, { register: 'dokumente', name: 'Scan.pdf' }, pdfAus([{ text: 'x' }]), admin.id)).dokument;
    const txt = (await d.ladeHoch(m.id, { register: 'dokumente', name: 'a.txt' }, Buffer.from('x'), admin.id)).dokument;
    const g = await d.legeMappeAn({ typId: geheim.id, werte: { nr: '1' } }, admin.id);
    const arzt = (await d.ladeHoch(g.id, { register: 'dokumente', name: 'Befund.pdf' }, pdfAus([{ text: 'Befund' }]), admin.id)).dokument;
    await v.fertig();
    const r = await rufe(anna, 'GET', '/api/dokumente/:id/vorschau', { params: { id: doc.id } }) as { datei: Datei };
    assert.equal(r.datei.mime, 'image/jpeg');
    assert.equal(r.datei.koepfe?.['cache-control'], 'private, max-age=604800');
    await assert.rejects(rufe(anna, 'GET', '/api/dokumente/:id/vorschau', { params: { id: txt.id } }), status(404));
    // Ohne Leserecht: wie beim Dokument „gibt es nicht oder du darfst sie nicht sehen“.
    await assert.rejects(rufe(anna, 'GET', '/api/dokumente/:id/vorschau', { params: { id: arzt.id } }), /darfst sie nicht sehen/);
    assert.ok(await rufe(admin, 'GET', '/api/dokumente/:id/vorschau', { params: { id: arzt.id } }));
  });

  it('Nachholen erzeugt nur Fehlendes; Löschen der Datei nimmt das Bild mit', async () => {
    const { d, v, ablage, typ, admin, rufe } = await aufbau(async () => Buffer.from('bild'));
    const m = await d.legeMappeAn({ typId: typ.id, werte: { nr: '1' } }, admin.id);
    const a = (await d.ladeHoch(m.id, { register: 'dokumente', name: 'a.pdf' }, pdfAus([{ text: 'a' }]), admin.id)).dokument;
    const b = (await d.ladeHoch(m.id, { register: 'dokumente', name: 'b.png' }, PNG, admin.id)).dokument;
    await v.fertig();
    await ablage.loesche(b.sha256);
    const r = await rufe(admin, 'POST', '/api/werkbank/wartung/vorschau') as { body: { eingereiht: number } };
    assert.equal(r.body.eingereiht, 1);
    await v.fertig();
    assert.ok(await v.bild(b));
    await d.loescheDokument(a.id, admin.id);
    assert.equal(ablage.bilder.has(a.sha256), false);
    assert.equal(ablage.bilder.has(b.sha256), true);
  });

  it('echte Bilder mit poppler: PDF und PNG, längste Seite 104 px, Ablage im Ordner', { skip: !hatPoppler && 'pdftoppm nicht installiert' }, async () => {
    const pdf = await popplerErzeuger(pdfAus([{ text: 'Rechnung Nr. 4711' }]), 'application/pdf');
    assert.ok(pdf && istJpeg(pdf));
    const [b, h] = groesseJpeg(pdf!);
    assert.equal(Math.max(b, h), VORSCHAU_PX);
    assert.ok(h > b, 'A4 hochkant');
    const png = await popplerErzeuger(PNG, 'image/png');
    assert.ok(png && istJpeg(png));
    assert.equal(await popplerErzeuger(Buffer.from('x'), 'text/plain'), null);
    const wurzel = await mkdtemp(join(tmpdir(), 'dms-vorschau-'));
    const ablage = ordnerAblage(wurzel);
    const sha = 'ab'.repeat(32);
    await ablage.schreibe(sha, pdf!);
    assert.deepEqual(await ablage.lies(sha), pdf);
    assert.deepEqual(await readdir(join(wurzel, 'ab')), [`${sha}.v1.jpg`]);
    assert.deepEqual(await ablage.belegung(), { anzahl: 1, bytes: pdf!.length });
    await ablage.merkeFehler(sha);
    assert.equal(await ablage.istFehlgeschlagen(sha), true);
    await ablage.loesche(sha);
    assert.equal(await ablage.lies(sha), null);
    assert.equal(await ablage.istFehlgeschlagen(sha), false);
  });
});
