/**
 * Sprache automatisch erkennen (#395): Erkennung (reine Funktion), Kennzeichnung am Dokument und Statistik. Den
 * zweiten Durchlauf und gedrehte Seiten übernimmt seit #459 das Paket Texterkennung (dms-registry).
 * Alle Beispieltexte sind erfunden.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { erkenneSprache, schriftVon, spracheAusInfo, spracheZuInfo, sprachvorschlaege } from '../../shared/src/textsprache';
import { speicherDateien } from '../src/dateispeicher';
import { Dienst } from '../src/dienst';
import { speicherEinstellungen } from '../src/einstellungen';
import { speicherRepo } from '../src/repo-speicher';
import { Texterkennung, type Engine } from '../src/texterkennung';
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

describe('Einstellung und Werkbank (#395)', () => {
  it('schlägt Sprach-Zusatzpakete des Pakets Texterkennung für erkannte Sprachen vor (#459)', () => {
    assert.deepEqual(sprachvorschlaege({ deu: 40, fra: 12, tur: 3, xyz: 9 }, ['deu', 'eng']), [
      { sprache: 'fra', anzahl: 12, paket: 'texterkennung.fra' },
      { sprache: 'tur', anzahl: 3, paket: 'texterkennung.tur' },
    ]);
  });

  it('speichert die erkannte Sprache am Dokument und zählt sie für die Werkbank', async () => {
    const repo = speicherRepo();
    const dateien = speicherDateien();
    const einstellungen = speicherEinstellungen();
    const d = new Dienst(repo, dateien, { einstellungen });
    let text = BEISPIELE.fra;
    const engine: Engine = async () => ({ text, seiten: 1, info: 'Ersatz' });
    const t = new Texterkennung(repo, dateien, einstellungen, engine, async () => ({ pdftotext: true, pdftoppm: true }));
    d.dokumente.verbindeTexterkennung(t);
    const typ = await d.mappentypen.legeTypAn({ name: 'Beleg', felder: [{ key: 'nr', label: 'Nr', typ: 'text', pflicht: true }], register: [
      { key: 'allgemein', name: 'Allgemein', art: 'felder', felder: ['nr'] },
      { key: 'dokumente', name: 'Dokumente', art: 'dokumente' },
    ] });
    const m = await d.mappen.legeMappeAn({ typId: typ.id, werte: { nr: '1' } });
    const hoch = async (n: string) => (await d.dokumente.ladeHoch(m.id, { register: 'dokumente', name: `${n}.pdf`, typ: 'application/pdf' }, pdfMitText([n]), null)).dokument.id;
    const warte = async (id: string) => { for (let i = 0; i < 400 && (await repo.holeDokument(id))?.ocr?.stand !== 'fertig'; i++) await new Promise((r) => setTimeout(r, 25)); };
    const a = await hoch('a'); await warte(a);
    text = BEISPIELE.deu;
    const b = await hoch('b'); await warte(b);
    assert.match((await repo.holeDokument(a))!.ocr!.info!, /^Ersatz · Sprache: fra \(\d+ %\)$/);
    const s = await t.status();
    assert.deepEqual(s.erkannteSprachen, { fra: 1, deu: 1 });
  });

  it('Volltext eines Pakets (#338): PAKET_TEXT bleibt vorn, die Sprache hängt hinten an und wird gezählt', async () => {
    const repo = speicherRepo();
    const d = new Dienst(repo, speicherDateien(), { einstellungen: speicherEinstellungen() });
    const typ = await d.mappentypen.legeTypAn({ name: 'Beleg', felder: [{ key: 'nr', label: 'Nr', typ: 'text', pflicht: true }], register: [
      { key: 'allgemein', name: 'Allgemein', art: 'felder', felder: ['nr'] },
      { key: 'dokumente', name: 'Dokumente', art: 'dokumente' },
    ] });
    const m = await d.mappen.legeMappeAn({ typId: typ.id, werte: { nr: '1' } });
    const id = (await d.dokumente.ladeHoch(m.id, { register: 'dokumente', name: 'a.pdf', typ: 'application/pdf' }, pdfMitText(['a']), null)).dokument.id;
    // Eine Herkunft, die die Marke vortäuscht, zählt nicht.
    const doc = await d.schreibeVolltext(id, { text: BEISPIELE.tur }, { id: 'p', herkunft: 'Mein OCR · Sprache: eng (99 %)', paket: true });
    assert.ok(doc.ocr!.info!.startsWith(PAKET_TEXT));
    assert.equal(spracheAusInfo(doc.ocr!.info)?.sprache, 'tur');
    assert.match(doc.ocr!.info!, / · Sprache: tur \(\d+ %\)$/);
    assert.deepEqual(await repo.ocrSprachen(), { tur: 1 });
  });
});

describe('Graustufenbilder (#395)', () => {
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
});
