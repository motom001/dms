/**
 * Sprache automatisch erkennen (#395): Erkennung (reine Funktion), Entscheidung über den zweiten
 * Durchlauf, Kennzeichnung am Dokument, Statistik und – wenn tesseract mit osd da ist – gedrehte Seiten.
 * Alle Beispieltexte sind erfunden.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { erkenneSprache, schriftVon, spracheAusInfo, spracheZuInfo, sprachvorschlaege } from '../../shared/src/textsprache';
import { speicherDateien } from '../src/dateispeicher';
import { Dienst } from '../src/dienst';
import { speicherEinstellungen } from '../src/einstellungen';
import { speicherRepo } from '../src/repo-speicher';
import { fehlendeSprachen, konfidenzAusTsv, leseOsd, OCR_STANDARD, ocrAusGespeichert, pruefeWerkzeuge, spracheFuerSchrift, tesseractEngine, Texterkennung, zweiterDurchlauf, type Engine } from '../src/texterkennung';
import { dreheGraubild, lesePgm, schreibePgm } from '../src/graubild';
import { pdfMitText } from './hilfen';
import { PAKET_TEXT } from '../../shared/src/pakete';

const BEISPIELE: Record<string, string> = {
  deu: 'Sehr geehrte Damen und Herren, anbei erhalten Sie die Rechnung für den Monat Oktober. Bitte überweisen Sie den Betrag bis zum 15. November auf das unten genannte Konto. Mit freundlichen Grüßen, Ihre Stadtwerke Musterstadt',
  eng: 'Dear customer, thank you for your order. Please find attached the invoice for the services provided in October. The amount is due within 14 days. If you have any questions, please contact us at any time.',
  fra: "Madame, Monsieur, nous vous remercions pour votre séjour à l'hôtel des Pins. Vous trouverez ci-joint la facture de votre réservation. Le montant a été débité de votre carte. Avec nos salutations distinguées.",
  tur: 'Sayın Ayşe Hanım, siparişiniz için teşekkür ederiz. Faturanız ekte yer almaktadır. Ödeme için son tarih 15 Kasım. Herhangi bir sorunuz varsa lütfen bizimle iletişime geçin. Saygılarımızla, Örnek Mağazası',
  spa: 'Estimado cliente, le enviamos la factura de su compra en nuestra tienda. El importe se ha cargado en su tarjeta. Muchas gracias por su confianza y esperamos verle pronto.',
  nld: 'Beste klant, hartelijk dank voor uw bestelling. In de bijlage vindt u de factuur van de maand oktober. Het bedrag wordt binnen 14 dagen van uw rekening afgeschreven.',
  pol: 'Szanowny Panie, dziękujemy za zakup w naszym sklepie. W załączniku przesyłamy fakturę za październik. Kwota została pobrana z karty. W razie pytań prosimy o kontakt.',
  rus: 'Уважаемый клиент, благодарим вас за заказ. Счёт за октябрь находится во вложении. Сумма будет списана с вашей карты в течение трёх дней. Если у вас есть вопросы, напишите нам.',
};

describe('Spracherkennung (#395)', () => {
  it('erkennt erfundene Briefe auf Deutsch, Englisch, Französisch, Türkisch und weiteren Sprachen', () => {
    for (const [sprache, text] of Object.entries(BEISPIELE)) {
      const e = erkenneSprache(text);
      assert.equal(e?.sprache, sprache, `${sprache}: ${JSON.stringify(e)}`);
      assert.ok(e!.konfidenz >= 0.5, `${sprache} sicher genug: ${e!.konfidenz}`);
    }
    assert.equal(erkenneSprache(BEISPIELE.rus)?.schrift, 'kyrillisch');
  });

  it('erkennt Texterkennungs-Ergebnisse mit Fehlern (fehlende Akzente) noch', () => {
    const ohneAkzente = BEISPIELE.fra.normalize('NFD').replace(/[̀-ͯ]/g, '');
    assert.equal(erkenneSprache(ohneAkzente)?.sprache, 'fra');
    const tuerkischMitDeutsch = BEISPIELE.tur.replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g');
    assert.equal(erkenneSprache(tuerkischMitDeutsch)?.sprache, 'tur');
  });

  it('gibt bei zu wenig Text kein Ergebnis', () => {
    assert.equal(erkenneSprache(''), null);
    assert.equal(erkenneSprache('12345 678 9,99 EUR 2026'), null);
    assert.equal(erkenneSprache('Rechnung'), null);
    assert.equal(erkenneSprache('Pos 1 Druckerpapier 9,99 Pos 2 Toner 49,00 Summe 58,99 MwSt 19 % Gesamt 70,20'), null);
    assert.equal(schriftVon('ab'), null);
  });

  it('kennzeichnet die Sprache im Hinweis und liest sie wieder aus', () => {
    const info = 'Texterkennung (fra+deu)' + spracheZuInfo({ sprache: 'fra', konfidenz: 0.874 });
    assert.equal(info, 'Texterkennung (fra+deu) · Sprache: fra (87 %)');
    assert.deepEqual(spracheAusInfo(info), { sprache: 'fra', konfidenz: 0.87 });
    assert.deepEqual(spracheAusInfo(`übernommen (gleicher Inhalt): ${info}`), { sprache: 'fra', konfidenz: 0.87 });
    assert.equal(spracheAusInfo('Textebene des PDFs'), null);
    assert.equal(spracheAusInfo(null), null);
  });
});

describe('Zweiter Durchlauf (#395)', () => {
  const fra = { sprache: 'fra', konfidenz: 0.86, schrift: 'latein' as const };
  const basis = { automatisch: true, sprachen: 'deu+eng', erkannt: fra, ocrKonfidenz: 70, installiert: ['deu', 'eng', 'fra'] };
  it('ja: andere Sprache, Paket da, unsicherer erster Durchlauf – erkannte Sprache zuerst', () => {
    assert.equal(zweiterDurchlauf(basis), 'fra+deu+eng');
  });
  it('nein: fest eingestellt, Paket fehlt, Sprache schon dabei, erster Durchlauf gut, Erkennung unsicher oder keine Texterkennung', () => {
    assert.equal(zweiterDurchlauf({ ...basis, automatisch: false }), null);
    assert.equal(zweiterDurchlauf({ ...basis, installiert: ['deu', 'eng'] }), null);
    assert.equal(zweiterDurchlauf({ ...basis, erkannt: { ...fra, sprache: 'eng' } }), null);
    assert.equal(zweiterDurchlauf({ ...basis, ocrKonfidenz: 91 }), null);
    assert.equal(zweiterDurchlauf({ ...basis, erkannt: { ...fra, konfidenz: 0.3 } }), null);
    assert.equal(zweiterDurchlauf({ ...basis, erkannt: null }), null);
    assert.equal(zweiterDurchlauf({ ...basis, ocrKonfidenz: null }), null, 'nur Textebene: nichts zu wiederholen');
  });
  it('lässt fehlende Pakete der Grundeinstellung im zweiten Durchlauf weg', () => {
    assert.equal(zweiterDurchlauf({ ...basis, erkannt: { ...fra, sprache: 'tur' }, installiert: ['deu', 'tur'] }), 'tur+deu');
  });
  it('nimmt bei fremder Schrift (OSD) ein passendes installiertes Paket dazu', () => {
    assert.equal(spracheFuerSchrift('Cyrillic', 'deu+eng', ['deu', 'eng', 'rus']), 'rus+deu+eng');
    assert.equal(spracheFuerSchrift('Cyrillic', 'deu+eng', ['deu', 'eng']), null, 'Paket fehlt');
    assert.equal(spracheFuerSchrift('Cyrillic', 'rus', ['rus']), null, 'schon dabei');
    assert.equal(spracheFuerSchrift('Latin', 'deu', ['deu', 'rus']), null);
    assert.equal(spracheFuerSchrift(null, 'deu', ['deu']), null);
  });
  it('rechnet die mittlere Konfidenz aus der TSV-Ausgabe', () => {
    const kopf = 'level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext';
    const tsv = [kopf, '1\t1\t0\t0\t0\t0\t0\t0\t10\t10\t-1\t', '5\t1\t1\t1\t1\t1\t0\t0\t10\t10\t90\tRechnung', '5\t1\t1\t1\t1\t2\t0\t0\t10\t10\t40\tab', '5\t1\t1\t1\t1\t3\t0\t0\t10\t10\t10\t '].join('\n');
    assert.equal(konfidenzAusTsv(tsv), 80, '(90·8 + 40·2) / 10');
    assert.equal(konfidenzAusTsv(kopf), null);
  });
});

describe('Einstellung und Werkbank (#395)', () => {
  it('„Automatisch“ für neue Installationen; wer Sprachen selbst gewählt hat, behält sie', () => {
    assert.equal(OCR_STANDARD.automatisch, true);
    assert.equal(ocrAusGespeichert({ sprachen: 'deu+eng', auftraege: 2 }).automatisch, true, 'alte Vorgabe');
    assert.equal(ocrAusGespeichert({ sprachen: 'deu+fra' }).automatisch, false, 'selbst gewählt');
    assert.equal(ocrAusGespeichert({ sprachen: 'deu+fra', automatisch: true }).automatisch, true);
    assert.equal(ocrAusGespeichert({ sprachen: 'deu+eng', automatisch: false }).automatisch, false);
  });

  it('meldet eingestellte, aber fehlende Sprachpakete und schlägt Pakete für erkannte Sprachen vor', () => {
    assert.deepEqual(fehlendeSprachen('deu+eng', ['deu', 'osd']), ['eng']);
    assert.deepEqual(sprachvorschlaege({ deu: 40, fra: 12, tur: 3, xyz: 9 }, ['deu', 'eng']), [
      { sprache: 'fra', anzahl: 12, paket: 'tesseract-ocr-data-fra' },
      { sprache: 'tur', anzahl: 3, paket: 'tesseract-ocr-data-tur' },
    ]);
  });

  it('speichert die erkannte Sprache am Dokument und zählt sie für die Werkbank', async () => {
    const repo = speicherRepo();
    const dateien = speicherDateien();
    const einstellungen = speicherEinstellungen();
    const d = new Dienst(repo, dateien, { einstellungen });
    let text = BEISPIELE.fra;
    const engine: Engine = async (_p, _m, o) => { assert.equal(o.automatisch, true); return { text, seiten: 1, info: 'Ersatz' }; };
    const t = new Texterkennung(repo, dateien, einstellungen, engine, async () => ({ tesseract: 'tesseract 5', sprachen: ['deu'], osd: true, pdftotext: true, pdftoppm: true }));
    d.verbindeTexterkennung(t);
    const typ = await d.legeTypAn({ name: 'Beleg', felder: [{ key: 'nr', label: 'Nr', typ: 'text', pflicht: true }], register: [
      { key: 'allgemein', name: 'Allgemein', art: 'felder', felder: ['nr'] },
      { key: 'dokumente', name: 'Dokumente', art: 'dokumente' },
    ] });
    const m = await d.legeMappeAn({ typId: typ.id, werte: { nr: '1' } });
    const hoch = async (n: string) => (await d.ladeHoch(m.id, { register: 'dokumente', name: `${n}.pdf`, typ: 'application/pdf' }, pdfMitText([n]), null)).dokument.id;
    const warte = async (id: string) => { for (let i = 0; i < 400 && (await repo.holeDokument(id))?.ocr?.stand !== 'fertig'; i++) await new Promise((r) => setTimeout(r, 25)); };
    const a = await hoch('a'); await warte(a);
    text = BEISPIELE.deu;
    const b = await hoch('b'); await warte(b);
    assert.match((await repo.holeDokument(a))!.ocr!.info!, /^Ersatz · Sprache: fra \(\d+ %\)$/);
    const s = await t.status();
    assert.deepEqual(s.erkannteSprachen, { fra: 1, deu: 1 });
    assert.deepEqual(s.fehlendeSprachen, ['eng'], 'deu+eng eingestellt, nur deu installiert');
  });

  it('Volltext eines Pakets (#338): PAKET_TEXT bleibt vorn, die Sprache hängt hinten an und wird gezählt', async () => {
    const repo = speicherRepo();
    const d = new Dienst(repo, speicherDateien(), { einstellungen: speicherEinstellungen() });
    const typ = await d.legeTypAn({ name: 'Beleg', felder: [{ key: 'nr', label: 'Nr', typ: 'text', pflicht: true }], register: [
      { key: 'allgemein', name: 'Allgemein', art: 'felder', felder: ['nr'] },
      { key: 'dokumente', name: 'Dokumente', art: 'dokumente' },
    ] });
    const m = await d.legeMappeAn({ typId: typ.id, werte: { nr: '1' } });
    const id = (await d.ladeHoch(m.id, { register: 'dokumente', name: 'a.pdf', typ: 'application/pdf' }, pdfMitText(['a']), null)).dokument.id;
    // Eine Herkunft, die die Marke vortäuscht, zählt nicht.
    const doc = await d.schreibeVolltext(id, { text: BEISPIELE.tur }, { id: 'p', herkunft: 'Mein OCR · Sprache: eng (99 %)', paket: true });
    assert.ok(doc.ocr!.info!.startsWith(PAKET_TEXT));
    assert.equal(spracheAusInfo(doc.ocr!.info)?.sprache, 'tur');
    assert.match(doc.ocr!.info!, / · Sprache: tur \(\d+ %\)$/);
    assert.deepEqual(await repo.ocrSprachen(), { tur: 1 });
  });
});

describe('Gedrehte Seiten (#395)', () => {
  it('liest die Lage aus der OSD-Ausgabe von tesseract', () => {
    const osd = (r: number, o: number, schrift = 'Latin', sc = 20) => `Page number: 0\nOrientation in degrees: ${(360 - r) % 360}\nRotate: ${r}\nOrientation confidence: ${o}\nScript: ${schrift}\nScript confidence: ${sc}\n`;
    assert.deepEqual(leseOsd(osd(180, 4.8)), { drehung: 180, schrift: 'Latin' });
    assert.deepEqual(leseOsd(osd(90, 1.2, 'Cyrillic')), { drehung: 0, schrift: 'Cyrillic' }, 'zu unsicher zum Drehen');
    assert.deepEqual(leseOsd(osd(0, 9, 'Latin', 0.5)), { drehung: 0, schrift: null });
    assert.deepEqual(leseOsd('Too few characters. Skipping this page'), { drehung: 0, schrift: null });
  });

  it('dreht Graustufenbilder (PGM) im Uhrzeigersinn', () => {
    // 3 × 2:  1 2 3 / 4 5 6
    const g = lesePgm(Buffer.concat([Buffer.from('P5\n# Kommentar\n3 2\n255\n', 'latin1'), Buffer.from([1, 2, 3, 4, 5, 6])]))!;
    assert.deepEqual([g.breite, g.hoehe, [...g.pixel]], [3, 2, [1, 2, 3, 4, 5, 6]]);
    const d90 = dreheGraubild(g, 90);
    assert.deepEqual([d90.breite, d90.hoehe, [...d90.pixel]], [2, 3, [4, 1, 5, 2, 6, 3]]);
    assert.deepEqual([...dreheGraubild(g, 180).pixel], [6, 5, 4, 3, 2, 1]);
    const d270 = dreheGraubild(g, 270);
    assert.deepEqual([d270.breite, d270.hoehe, [...d270.pixel]], [2, 3, [3, 6, 2, 5, 1, 4]]);
    assert.deepEqual([...dreheGraubild(dreheGraubild(g, 90), 270).pixel], [...g.pixel]);
    assert.deepEqual(lesePgm(schreibePgm(g)), g);
    assert.equal(lesePgm(Buffer.from('P6\n1 1\n255\nabc')), null, 'nur Graustufen');
  });

  for (const grad of [180, 90]) {
    it(`liest eine um ${grad}° gedrehte gescannte Seite richtig (mit tesseract und osd)`, async (k) => {
      const w = await pruefeWerkzeuge();
      if (!w.tesseract || !w.osd || !w.pdftoppm || !w.sprachen.includes('eng')) { k.skip('tesseract mit osd und eng oder poppler fehlt'); return; }
      const dir = await mkdtemp(join(tmpdir(), 'dms-osd-test-'));
      const pdf = join(dir, 'gedreht.pdf');
      await writeFile(pdf, pdfMitText(['Invoice number 4711', 'Musterstadt Utilities Ltd', 'Please pay within fourteen days', 'Dear customer, thank you for your order.'], 18, grad));
      // So wie die Texterkennung eine gescannte PDF-Seite rendert: Graustufen-PGM.
      execFileSync('pdftoppm', ['-r', '300', '-gray', '-singlefile', pdf, join(dir, 'seite')], { stdio: 'ignore' });
      const r = await tesseractEngine(join(dir, 'seite.pgm'), 'image/x-portable-graymap', { maxSeiten: 1, sprachen: 'eng', automatisch: true, werkzeuge: w });
      assert.match(r.text, /Invoice number 4711/);
      assert.match(r.text, /Utilities Ltd/);
      if (grad === 180) assert.match(r.info, /1 Seite gedreht/);
    });
  }
});

describe('Erkannte Sprachen in PostgreSQL (#395)', { skip: process.env.TEST_DATABASE_URL ? false : 'TEST_DATABASE_URL nicht gesetzt' }, () => {
  it('zählt die Sprachen fertiger Dokumente aus dem Hinweis der Texterkennung', async () => {
    const { verbinde, migriere } = await import('../src/db');
    const { pgRepo } = await import('../src/repo-pg');
    const { randomUUID } = await import('node:crypto');
    const url = process.env.TEST_DATABASE_URL!;
    const db = `dms_textsprache_${process.pid}`;
    const haupt = verbinde(url);
    await haupt.unsafe(`DROP DATABASE IF EXISTS ${db}`);
    await haupt.unsafe(`CREATE DATABASE ${db}`);
    const u = new URL(url); u.pathname = `/${db}`;
    const sql = verbinde(u.toString());
    try {
      await migriere(sql, new URL('../migrations', import.meta.url).pathname, () => {});
      const h = randomUUID();
      await sql`INSERT INTO haushalte (id, name) VALUES (${h}, 'Test')`;
      const repo = pgRepo(sql, h);
      const d = new Dienst(repo, speicherDateien(), { einstellungen: speicherEinstellungen() });
      const typ = await d.legeTypAn({ name: 'Beleg', felder: [{ key: 'nr', label: 'Nr', typ: 'text', pflicht: true }] });
      const m = await d.legeMappeAn({ typId: typ.id, werte: { nr: '1' } });
      const ids: string[] = [];
      for (const n of ['a', 'b', 'c', 'd']) ids.push((await d.ladeHoch(m.id, { register: 'dokumente', name: `${n}.pdf`, typ: 'application/pdf' }, pdfMitText([n]), null)).dokument.id);
      await repo.ocrSetze(ids[0], { stand: 'fertig', text: BEISPIELE.fra, info: 'Texterkennung (deu)' + spracheZuInfo({ sprache: 'fra', konfidenz: 0.9 }) });
      await repo.ocrSetze(ids[1], { stand: 'fertig', text: BEISPIELE.fra, info: 'übernommen (gleicher Inhalt): Texterkennung (deu) · Sprache: fra (90 %)' });
      await repo.ocrSetze(ids[2], { stand: 'fertig', text: BEISPIELE.tur, info: 'Textebene des PDFs · Sprache: tur (80 %)' });
      await repo.ocrSetze(ids[3], { stand: 'fertig', text: '4711', info: 'Textebene des PDFs' });
      assert.deepEqual(await repo.ocrSprachen(), { fra: 2, tur: 1 });
    } finally {
      await sql.end();
      await haupt.unsafe(`DROP DATABASE IF EXISTS ${db}`);
      await haupt.end();
    }
  });
});
