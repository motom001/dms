/**
 * Vorschaubilder der ersten Seite (#332). poppler (pdftoppm) läuft nur, wenn installiert
 * (in GitHub Actions: ja); sonst prüft ein Ersatz-Erzeuger Warteschlange, Ablage und Rechte.
 */
import assert from 'node:assert/strict';
import { wieImModus } from './hilfen';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { Archivfassung, ordnerArchiv } from '../src/archivfassung';
import { speicherDateien } from '../src/dateispeicher';
import { Dienst } from '../src/dienst';
import { speicherEinstellungen } from '../src/einstellungen';
import { Fachfehler } from '../src/fehler';
import { Konten } from '../src/konten';
import { speicherKontoRepo } from '../src/konto-repo';
import { pdfAus } from './hilfen-einfach-pdf';
import { speicherRepo } from '../src/repo-speicher';
import { routen, type Anfrage, type Datei } from '../src/routen';
import { NACHLAUF_STAPEL, ordnerAblage, popplerErzeuger, speicherAblage, VORSCHAU_PX, Vorschaubilder, type ArchivQuelle, type Erzeuger, type NachlaufStand } from '../src/vorschau';

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
  d.dokumente.verbindeVorschau(v);
  const konten = new Konten(speicherKontoRepo(), null, 'http://nas', d.systemtypen.benutzerspiegel());
  d.verbindeKonten(konten.papierkorbHaken());
  const { benutzer: admin } = await konten.einrichten({ email: 'admin@example.org', name: 'Admin', passwort: 'ein-langes-passwort' });
  const anna = (await konten.legeBenutzerAn({ email: 'anna@example.org', name: 'Anna' }, admin.id)).benutzer;
  await d.postSystemmappen.gleicheBenutzerAb(await konten.listeBenutzer());
  const ALLES = { C: true, R: true, U: true, D: true, P: true };
  const typ = await d.mappentypen.legeTypAn({ name: 'Rechnung', felder: [{ key: 'nr', label: 'Nr', typ: 'text' }] });
  const geheim = await d.mappentypen.legeTypAn({ name: 'Gesundheit', felder: [{ key: 'nr', label: 'Nr', typ: 'text' }],
    berechtigungen: { grund: ALLES, regeln: [{ id: 'anna', name: 'Anna nicht', wenn: [{ art: 'benutzer', benutzer: [anna.id] }], dann: { R: 'entziehen' }, stopp: false }] } } as never);
  const ich = async (id: string) => (await konten.listeBenutzer()).find((b) => b.id === id)!;
  const tabelle = routen(d, konten, { vorschau: v });
  const rufe = async (b: { id: string }, m: string, pf: string, x: Partial<Anfrage> = {}) => tabelle.find((t) => t.methode === m && t.pfad === pf)!.handler({ body: {}, params: {}, query: {}, ip: '1', ...x, benutzer: wieImModus(await ich(b.id)) });
  return { d, v, ablage, typ, geheim, admin, anna, rufe };
}

describe('Vorschaubilder (#332)', () => {
  it('entsteht nach dem Hochladen einmal im Hintergrund, je Prüfwert; andere Dateitypen bekommen keins', async () => {
    let aufrufe = 0;
    const { d, v, ablage, typ, admin } = await aufbau(async (_inhalt, mime) => { aufrufe++; return Buffer.from(`bild ${mime}`); });
    const m = await d.mappen.legeMappeAn({ typId: typ.id, werte: { nr: '1' } }, admin.id);
    const pdf = (await d.dokumente.ladeHoch(m.id, { register: 'dokumente', name: 'Scan.pdf' }, pdfAus([{ text: 'Rechnung' }]), admin.id)).dokument;
    const png = (await d.dokumente.ladeHoch(m.id, { register: 'dokumente', name: 'IMG_4711.png' }, PNG, admin.id)).dokument;
    const txt = (await d.dokumente.ladeHoch(m.id, { register: 'dokumente', name: 'notiz.txt' }, Buffer.from('nur Text'), admin.id)).dokument;
    // Gleicher Inhalt in einer zweiten Mappe: kein zweites Bild.
    const m2 = await d.mappen.legeMappeAn({ typId: typ.id, werte: { nr: '2' } }, admin.id);
    await d.dokumente.ladeHoch(m2.id, { register: 'dokumente', name: 'Kopie.pdf' }, pdfAus([{ text: 'Rechnung' }]), admin.id);
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
    const m = await d.mappen.legeMappeAn({ typId: typ.id, werte: { nr: '1' } }, admin.id);
    const doc = (await d.dokumente.ladeHoch(m.id, { register: 'dokumente', name: 'defekt.pdf' }, Buffer.from('%PDF-1.4 kaputt'), admin.id)).dokument;
    await v.fertig();
    assert.equal(await v.bild(doc), null);
    await v.fertig();
    assert.equal(aufrufe, 1);
  });

  it('Route: gleiche Rechte wie das Dokument, 404 ohne Bild, Bild mit eigener Zwischenspeicherung', async () => {
    const { d, v, typ, geheim, admin, anna, rufe } = await aufbau(async () => Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
    const m = await d.mappen.legeMappeAn({ typId: typ.id, werte: { nr: '1' } }, admin.id);
    const doc = (await d.dokumente.ladeHoch(m.id, { register: 'dokumente', name: 'Scan.pdf' }, pdfAus([{ text: 'x' }]), admin.id)).dokument;
    const txt = (await d.dokumente.ladeHoch(m.id, { register: 'dokumente', name: 'a.txt' }, Buffer.from('x'), admin.id)).dokument;
    const g = await d.mappen.legeMappeAn({ typId: geheim.id, werte: { nr: '1' } }, admin.id);
    const arzt = (await d.dokumente.ladeHoch(g.id, { register: 'dokumente', name: 'Befund.pdf' }, pdfAus([{ text: 'Befund' }]), admin.id)).dokument;
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
    const m = await d.mappen.legeMappeAn({ typId: typ.id, werte: { nr: '1' } }, admin.id);
    const a = (await d.dokumente.ladeHoch(m.id, { register: 'dokumente', name: 'a.pdf' }, pdfAus([{ text: 'a' }]), admin.id)).dokument;
    const b = (await d.dokumente.ladeHoch(m.id, { register: 'dokumente', name: 'b.png' }, PNG, admin.id)).dokument;
    await v.fertig();
    await ablage.loesche(b.sha256);
    const r = await rufe(admin, 'POST', '/api/werkbank/wartung/vorschau') as { body: { eingereiht: number } };
    assert.equal(r.body.eingereiht, 1);
    await v.fertig();
    assert.ok(await v.bild(b));
    await d.papierkorbVerwaltung.setzePapierkorbTage(0); // ohne Papierkorb (#344): Datei sofort weg
    await d.dokumente.loescheDokument(a.id, admin.id);
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
    assert.ok(((await ablage.fehlerSeit(sha)) ?? 0) > Date.now() - 60_000, 'Zeit des Fehlversuchs (#1216)');
    await ablage.loesche(sha);
    assert.equal(await ablage.lies(sha), null);
    assert.equal(await ablage.istFehlgeschlagen(sha), false);
  });
});

/**
 * Archivfassung als Quelle (#1216): eine Ersatz-Ablage der Archivfassungen (Prüfwert → Inhalt, erstellt) und ein
 * Erzeuger, der sich merkt, woraus er ein Bild machte (Anfang des Inhalts), und an „kaputt“ scheitert.
 */
function mitArchiv(v: Vorschaubilder) {
  const archive = new Map<string, { inhalt: Buffer; erstellt: string; imOriginal?: boolean }>();
  const quelle: ArchivQuelle = {
    info: async (sha) => { const a = archive.get(sha); return a ? { erstellt: a.erstellt, groesse: a.inhalt.length, ...(a.imOriginal ? { imOriginal: true } : {}) } : null; },
    lies: async (sha) => { const a = archive.get(sha); return a ? { inhalt: a.inhalt } : null; },
  };
  v.archiv = quelle;
  v.nachrangPauseMs = 0;
  const lege = (sha: string, o: { erstellt?: number; imOriginal?: boolean } = {}) => archive.set(sha, { inhalt: Buffer.from(`ARCHIV ${sha.slice(0, 6)}`), erstellt: new Date(o.erstellt ?? Date.now()).toISOString(), imOriginal: o.imOriginal });
  return { archive, lege };
}
const merkender = (quellen: string[]): Erzeuger => async (inhalt, mime) => {
  const anfang = inhalt.subarray(0, 6).toString('latin1');
  if (inhalt.includes('kaputt')) { quellen.push(`kaputt:${mime}`); throw new Error('kaputt'); }
  quellen.push(`${anfang}:${mime}`);
  return Buffer.from(`bild aus ${anfang}`);
};
const EML = Buffer.from('From: lena@example.org\r\nTo: jonas@example.org\r\nSubject: Termin\r\n\r\nHallo Jonas\r\n');

describe('Vorschaubild aus der Archivfassung (#1216)', () => {
  it('neue Quelle und Reihenfolge: Datei selbst → Lesefassung → Archivfassung → keins (Kästchen)', async () => {
    const quellen: string[] = [];
    const { d, v, typ, admin } = await aufbau(merkender(quellen));
    const { lege } = mitArchiv(v);
    const m = await d.mappen.legeMappeAn({ typId: typ.id, werte: { nr: '1' } }, admin.id);
    const hoch = async (name: string, inhalt: Buffer, typAngabe?: string) => (await d.dokumente.ladeHoch(m.id, { register: 'dokumente', name, ...(typAngabe ? { typ: typAngabe } : {}) }, inhalt, admin.id)).dokument;
    const mail = await hoch('Termin.eml', EML, 'message/rfc822');
    const png = await hoch('Zaehler.png', PNG);
    const kaputt = await hoch('defekt.pdf', Buffer.from('%PDF-1.4 kaputt'));
    const tiff = await hoch('Scan.tif', Buffer.from('II*\0 tiff'), 'image/tiff');
    await v.fertig();
    // PNG aus der Datei; das kaputte PDF ohne Archivfassung: kein Bild, Fehlversuch gemerkt.
    assert.deepEqual(quellen, ['\x89PNG\r\n:image/png', 'kaputt:application/pdf']);
    // Ohne Archivfassung: E-Mail bleibt ohne Bild (Kästchen), es wird nichts eingereiht und kein Fehler gemerkt.
    assert.equal(await v.bild(mail), null);
    assert.equal(v.wartend, 0);
    // Archivfassungen für alle vier, Lesefassung (#577) für das TIFF.
    for (const x of [mail, png, kaputt, tiff]) lege(x.sha256, { erstellt: Date.now() + 1000 });
    v.fassung = async (sha) => (sha === tiff.sha256 ? { info: { mime: 'image/png' }, inhalt: Buffer.from('LESEFASSUNG') } : null);
    quellen.length = 0;
    assert.equal(await v.bild(mail), null, 'erst eingereiht');
    assert.equal(await v.bild(kaputt), null, 'Archivfassung jünger als der Fehlversuch: neu eingereiht');
    assert.equal(await v.bild(tiff), null);
    await v.fertig();
    assert.equal(String(await v.bild(mail)), 'bild aus ARCHIV');
    assert.equal(String(await v.bild(png)), 'bild aus \x89PNG\r\n', 'die Datei selbst geht vor; ein vorhandenes Bild bleibt');
    assert.equal(String(await v.bild(kaputt)), 'bild aus ARCHIV', 'Datei scheitert → Archivfassung');
    assert.equal(String(await v.bild(tiff)), 'bild aus LESEFA', 'Lesefassung vor der Archivfassung');
    assert.deepEqual(quellen.sort(), ['ARCHIV:application/pdf', 'ARCHIV:application/pdf', 'LESEFA:image/png', 'kaputt:application/pdf'].sort());
  });

  it('Archivfassung kommt später: Bild danach, ein älterer Fehlversuch hindert nicht; „Original ist PDF/A“ ist keine eigene Quelle', async () => {
    const quellen: string[] = [];
    const { d, v, typ, admin } = await aufbau(merkender(quellen));
    const { lege } = mitArchiv(v);
    const m = await d.mappen.legeMappeAn({ typId: typ.id, werte: { nr: '1' } }, admin.id);
    const kaputt = (await d.dokumente.ladeHoch(m.id, { register: 'dokumente', name: 'defekt.pdf' }, Buffer.from('%PDF-1.4 kaputt'), admin.id)).dokument;
    await v.fertig();
    // Archivfassung älter als der Fehlversuch (z. B. aus der Sicherung): nicht noch einmal.
    lege(kaputt.sha256, { erstellt: Date.now() - 60_000 });
    assert.equal(await v.bild(kaputt), null);
    assert.equal(v.wartend, 0);
    // „Original ist schon PDF/A“ (imOriginal): dieselbe Datei – keine neue Quelle.
    lege(kaputt.sha256, { erstellt: Date.now() + 1000, imOriginal: true });
    assert.equal(await v.bild(kaputt), null);
    assert.equal(v.wartend, 0);
    // Eine neue Archivfassung über die Schnittstelle (Paket, PUT …/archivfassung): sofort eingereiht.
    lege(kaputt.sha256, { erstellt: Date.now() + 1000 });
    d.dokumentArchiv.verbindeArchivfassung({ setze: async () => ({ mime: 'application/pdf' }) } as never);
    d.dokumentArchiv.verbindeVorschau(v);
    await d.dokumentArchiv.setzeArchivfassung(undefined, kaputt.id, kaputt.sha256, Buffer.from('%PDF-'));
    assert.equal(v.wartend, 1);
    await v.fertig();
    assert.equal(String(await v.bild(kaputt)), 'bild aus ARCHIV');
  });

  it('Nachlauf für den Bestand: mit Nachrang hinter neuen Dokumenten, Stand für die Werkbank, nur was fehlt', async () => {
    const quellen: string[] = [];
    const { d, v, ablage, typ, admin } = await aufbau(merkender(quellen));
    const { lege } = mitArchiv(v);
    const merk: { s: NachlaufStand | null } = { s: null };
    v.nachlaufSpeicher = { lies: async () => merk.s, schreibe: async (s) => { merk.s = s; } };
    const m = await d.mappen.legeMappeAn({ typId: typ.id, werte: { nr: '1' } }, admin.id);
    const mails: Array<{ id: string; sha256: string; mime: string; groesse: number; name: string }> = [];
    for (let i = 0; i < 3; i++) mails.push((await d.dokumente.ladeHoch(m.id, { register: 'dokumente', name: `Mail ${i}.eml`, typ: 'message/rfc822' }, Buffer.concat([EML, Buffer.from(String(i))]), admin.id)).dokument);
    await v.fertig();
    for (const x of mails) lege(x.sha256);
    // Eins hat schon ein Bild: zählt nicht.
    await ablage.schreibe(mails[2].sha256, Buffer.from('schon da'));
    d.dokumentArchiv.verbindeArchivfassung({ alle: async () => mails.map((x) => x.sha256), info: async () => null, uebersicht: async () => ({ pakete: [], zaehler: { fertig: 3, bytes: 0, wartet: 0, ausgelassen: 0, fehler: 0 }, liste: [] }) } as never);
    d.dokumentArchiv.verbindeVorschau(v);
    // Nachrang: Während der Nachlauf wartet, kommt ein neues PDF dazu – es ist zuerst dran.
    v.nachrangPauseMs = 50;
    assert.equal(await d.dokumentArchiv.vorschauNachlauf(), 2);
    assert.deepEqual(merk.s && { offen: merk.s.offen, erledigt: merk.s.erledigt }, { offen: 2, erledigt: 0 });
    assert.equal(v.wartend, 0, 'der Nachlauf liegt nicht in der normalen Warteschlange');
    await d.dokumente.ladeHoch(m.id, { register: 'dokumente', name: 'neu.png' }, PNG, admin.id);
    // Ein zweiter Lauf, solange der erste noch arbeitet, reiht nichts doppelt ein.
    assert.equal(await d.dokumentArchiv.vorschauNachlauf(), 2);
    await v.fertig();
    assert.deepEqual(quellen, ['\x89PNG\r\n:image/png', 'ARCHIV:application/pdf', 'ARCHIV:application/pdf']);
    assert.equal(String(await v.bild(mails[0])), 'bild aus ARCHIV');
    assert.deepEqual(merk.s && { offen: merk.s.offen, erledigt: merk.s.erledigt, ohne: merk.s.ohne }, { offen: 0, erledigt: 2, ohne: 0 });
    // Stand in der Werkbank (Suche und Volltext → Archivfassung).
    assert.deepEqual((await d.dokumentArchiv.archivStand())?.vorschau?.erledigt, 2);
    // Nichts mehr offen: der nächste Lauf erzeugt nichts.
    assert.equal(await d.dokumentArchiv.vorschauNachlauf(), 0);
    await v.fertig();
    assert.equal(quellen.length, 3);
    // Ein anderer Prozess (ohne eigenen Lauf) liest den Stand aus dem Kurzzustand.
    const andere = new Vorschaubilder(speicherAblage(), speicherDateien());
    andere.nachlaufSpeicher = { lies: async () => merk.s, schreibe: async () => {} };
    assert.equal((await andere.nachlaufStand())?.erledigt, 2);
    assert.ok(NACHLAUF_STAPEL >= 100);
  });

  it('„Vorschaubilder nachholen“ nimmt Dokumente mit Archivfassung mit', async () => {
    const quellen: string[] = [];
    const { d, v, typ, admin, rufe } = await aufbau(merkender(quellen));
    const { lege } = mitArchiv(v);
    const m = await d.mappen.legeMappeAn({ typId: typ.id, werte: { nr: '1' } }, admin.id);
    const mail = (await d.dokumente.ladeHoch(m.id, { register: 'dokumente', name: 'Termin.eml', typ: 'message/rfc822' }, EML, admin.id)).dokument;
    await d.dokumente.ladeHoch(m.id, { register: 'dokumente', name: 'ohne.eml', typ: 'message/rfc822' }, Buffer.concat([EML, Buffer.from('x')]), admin.id);
    await v.fertig();
    lege(mail.sha256);
    const r = await rufe(admin, 'POST', '/api/werkbank/wartung/vorschau') as { body: { eingereiht: number } };
    assert.equal(r.body.eingereiht, 1);
    await v.fertig();
    assert.equal(String(await v.bild(mail)), 'bild aus ARCHIV');
  });

  it('echt mit poppler: E-Mail bekommt ihr Bild aus der Archivfassung im Ordner; alle Prüfwerte mit Archivfassung', { skip: !hatPoppler && 'pdftoppm nicht installiert' }, async () => {
    const wurzel = await mkdtemp(join(tmpdir(), 'dms-archiv-'));
    const archiv = ordnerArchiv(join(wurzel, 'archivfassungen'), join(wurzel, 'wortpositionen'));
    const dateien = speicherDateien();
    const v = new Vorschaubilder(speicherAblage(), dateien);
    const a = new Archivfassung({ ablage: archiv, datei: (sha: string) => dateien.lies(sha) } as never);
    v.archiv = { info: (sha) => a.info(sha), lies: (sha) => a.lies(sha) };
    const sha = 'cd'.repeat(32);
    await archiv.schreibe(sha, { mime: 'application/pdf', groesse: 1, sha256: 'ef'.repeat(32), seiten: 1, pdfa: { teil: 2, stufe: 'B' }, paket: { id: 'pdfa', name: 'PDF/A', version: '1.0.0' }, erstellt: new Date().toISOString() } as never, pdfAus([{ text: 'Von: lena@example.org' }]));
    assert.deepEqual(await archiv.alle(), [sha]);
    const mail = { sha256: sha, mime: 'message/rfc822', groesse: EML.length, name: 'Termin.eml' };
    assert.equal(await v.bild(mail), null);
    await v.fertig();
    const bild = await v.bild(mail);
    assert.ok(bild && istJpeg(bild));
    assert.equal(Math.max(...groesseJpeg(bild!)), VORSCHAU_PX);
  });
});
