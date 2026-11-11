/**
 * Stempel (#799): Deckkraft mit Vorgabe 70 %, Hinweis ab 80 %, „wie Tinte“ (Multiplizieren), mehrzeiliger Text,
 * neue Platzhalter {seite}, {seiten}, {archivnummer}, entfallene Haken (Umstellung ohne heimliche Änderung),
 * neue Lage „Stempel“, Drehen 0–360°, gemeinsame Lage-Rechnung für PDF und Vorschau.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, describe, it } from 'node:test';
import { PDFDocument, degrees } from 'pdf-lib';
import {
  DECKKRAFT_HINWEIS_AB, ersetzePlatzhalter, geltenderStempel, liesVorlagen, NEUER_STEMPEL, pruefeVorlage, STANDARD_VORLAGEN, stempelAus,
  stempelLayout, wunschAus, type Stempel,
} from '../../shared/src/stempel';
import { fuerAusgabe } from '../src/ausgabe';
import { beendeArbeiter } from '../src/arbeit';
import { speicherDateien } from '../src/dateispeicher';
import { Dienst } from '../src/dienst';
import { speicherEinstellungen } from '../src/einstellungen';
import { speicherRepo } from '../src/repo-speicher';
import { inhaltsstrom } from './hilfen-schriften';

after(() => beendeArbeiter());

const S = (x: Partial<Stempel> = {}): Stempel => ({ ...NEUER_STEMPEL, text: 'KOPIE', ...x });
const plan = (s: Stempel) => ({ stempel: s, empfaenger: 'Steuerbüro Petra', pflicht: false, vorlage: null });

/** Entpackter Inhaltsstrom und der daraus ausgelesene Text, je gezeichnete Zeile eine Zeile (#826: eingebettete Schrift). */
async function seiteninhalt(pdf: Buffer, i = 0): Promise<string> {
  const s = await inhaltsstrom(pdf, i);
  return `${s.roh}\n${s.text}`;
}
async function pdfMitSeiten(n: number, groesse: [number, number] = [595, 842]): Promise<Buffer> {
  const d = await PDFDocument.create();
  for (let i = 0; i < n; i++) d.addPage(groesse).drawText(`Betrag ${i + 1}`, { x: 72, y: 700, size: 20 });
  return Buffer.from(await d.save());
}
const stempele = async (s: Stempel, seiten = 1, archivnummer: string | null = 'A-000042') =>
  (await fuerAusgabe({ name: 'beleg.pdf', mime: 'application/pdf', inhalt: await pdfMitSeiten(seiten) }, { stempel: plan(s) }, { benutzer: 'Lena', mappe: 'Steuer 2026', archivnummer })).inhalt;
const breite = (z: string, g: number) => z.length * g * 0.55;

describe('Deckkraft und „wie Tinte“ (#799)', () => {
  it('neue Vorlagen: 70 % und „wie Tinte“; höhere Werte bis 100 % erlaubt; Hinweis ab 80 %', async () => {
    assert.equal(NEUER_STEMPEL.deckkraft, 0.7);
    assert.equal(NEUER_STEMPEL.tinte, true);
    assert.equal(DECKKRAFT_HINWEIS_AB, 0.8);
    const texte = JSON.parse(readFileSync(new URL('../../shared/src/sprachen/de/werkbank.json', import.meta.url), 'utf8')) as Record<string, string>;
    assert.equal(texte['stempel.deckkraft.hinweis'], 'Bitte bedenke: Der Stempel kann Informationen aus dem Beleg verdecken und unlesbar machen.');
    assert.equal(texte['stempel.tinte'], 'Wie Tinte – Schrift darunter bleibt lesbar');
    assert.equal(stempelAus({ deckkraft: 1 }, NEUER_STEMPEL).deckkraft, 1);
    assert.equal(stempelAus({ deckkraft: 0.95 }, NEUER_STEMPEL).deckkraft, 0.95);
    assert.equal(stempelAus({ tinte: 'false' }, NEUER_STEMPEL).tinte, false);
    // Im Dienst: neue Vorlage ohne Angaben bekommt die Vorgaben.
    const d = new Dienst(speicherRepo(), speicherDateien(), { einstellungen: speicherEinstellungen() });
    const l = await d.stempelvorlagen.speichereStempelVorlage(null, { name: 'Nur für Lena', text: 'Nur für {empfänger}' }, 'admin');
    const neu = l.find((v) => v.name === 'Nur für Lena')!;
    assert.equal(neu.deckkraft, 0.7); assert.equal(neu.tinte, true);
  });

  it('„wie Tinte“ zeichnet mit dem Mischmodus Multiplizieren, sonst normal; Deckkraft steht im Grafikzustand', async () => {
    const mit = (await stempele(S({ tinte: true, deckkraft: 1 }))).toString('latin1');
    const ohne = (await stempele(S({ tinte: false, deckkraft: 0.7 }))).toString('latin1');
    assert.match(mit, /\/BM \/Multiply/);
    assert.doesNotMatch(ohne, /\/Multiply/);
    assert.match(ohne, /\/ca 0\.7/);
  });

  it('bestehende Vorlagen behalten ihr Aussehen: Deckkraft wie gespeichert, „wie Tinte“ aus – auch „Aus Ablago (Laufwerk)“', () => {
    for (const v of STANDARD_VORLAGEN) { assert.equal(v.tinte, false, v.id); assert.equal(v.lage === 'stempel', false); }
    assert.deepEqual(STANDARD_VORLAGEN.map((v) => v.deckkraft), [0.25, 0.8, 0.2, 0.9, 0.6]);
    // Gespeicherte Vorlagen von vor #799 (z. B. aus Migration 067) ohne die neuen Felder.
    const alt = liesVorlagen([{ id: 'webdav', name: 'Aus Ablago (Laufwerk)', text: 'Aus Ablago · {datum}', lage: 'fuss', deckkraft: 0.6, seiten: 'alle', seitenzahlen: false, archivnummer: false }]);
    assert.equal(alt[0].deckkraft, 0.6); assert.equal(alt[0].tinte, false); assert.equal(alt[0].lage, 'fuss');
    assert.equal(alt[0].drehung, 0); assert.equal(alt[0].farbe, 'rot'); assert.equal(alt[0].groesse, 100);
    assert.equal(alt[0].text, 'Aus Ablago · {datum}');
    assert.equal(alt[0].umgestellt, undefined);
  });
});

describe('Text und Platzhalter (#799)', () => {
  it('mehrzeilig: Zeilen bleiben, leere Ränder fallen weg, höchstens 6 Zeilen', async () => {
    assert.equal(stempelAus({ text: '\n  Kopie für {empfänger}\r\n\r\n  {datum}  \n' }).text, 'Kopie für {empfänger}\n\n{datum}');
    assert.equal(ersetzePlatzhalter('Kopie für {empfänger}\n\n{datum}', { empfaenger: 'Petra', datum: '04.11.2026' }), 'Kopie für Petra\n04.11.2026');
    assert.match(pruefeVorlage({ name: 'x', text: 'a\nb\nc\nd\ne\nf\ng' }, []).text, /6 Zeilen/);
    const s = await seiteninhalt(await stempele(S({ text: 'KOPIE\nfür {empfänger}' })));
    assert.ok(s.includes('KOPIE') && s.includes('für Steuerbüro Petra'), 'beide Zeilen, getrennt gezeichnet');
    assert.ok(!s.includes('KOPIE für'), 'nicht zu einer Zeile zusammengezogen');
  });

  it('{seite}, {seiten}, {archivnummer}: je Seite ersetzt – auch bei „nur erste Seite“, ohne Einschränkung', async () => {
    assert.deepEqual(pruefeVorlage({ name: 'x', text: '{seite}/{seiten} {archivnummer} {datum} {empfänger} {benutzer} {mappe}' }, []), {});
    const alle = await stempele(S({ text: 'Seite {seite} von {seiten} · {archivnummer}' }), 3);
    for (let i = 0; i < 3; i++) assert.ok((await seiteninhalt(alle, i)).includes(`Seite ${i + 1} von 3 · A-000042`), `Seite ${i + 1}`);
    const erste = await stempele(S({ text: 'Export aus Ablago – dieses Dokument umfasst {seiten} Seiten', seiten: 'erste' }), 3);
    assert.ok((await seiteninhalt(erste, 0)).includes(' dieses Dokument umfasst 3 Seiten'));
    assert.ok(!(await seiteninhalt(erste, 1)).includes('Export aus Ablago'));
    assert.equal((await PDFDocument.load(erste)).getPageCount(), 3, 'kein Deckblatt');
    // Ohne Archivnummer: leer, ein übrig gebliebenes „·“ am Zeilenrand fällt weg.
    const ohne = await stempele(S({ text: '{archivnummer} · Seite {seite} von {seiten}' }), 1, null);
    assert.ok((await seiteninhalt(ohne)).split('\n').includes('Seite 1 von 1'), 'eine Zeile ohne „·“ davor');
    // Historie: der Text wie auf Seite 1.
    const a = await fuerAusgabe({ name: 'b.pdf', mime: 'application/pdf', inhalt: await pdfMitSeiten(2) }, { stempel: plan(S({ text: 'KOPIE\nSeite {seite} von {seiten}' })) }, { benutzer: 'L', mappe: 'M' });
    assert.equal(a.stempeltext, 'KOPIE / Seite 1 von 2');
  });
});

describe('Entfallene Haken (#799): Umstellung, bei der sich nichts heimlich ändert', () => {
  const ALT = [
    { id: 'kopie', name: 'Kopie für …', text: 'Kopie für {empfänger}', lage: 'diagonal', deckkraft: 0.25, seiten: 'erste', seitenzahlen: true, archivnummer: true },
    { id: 'entwurf', name: 'Entwurf', text: 'ENTWURF', lage: 'diagonal', deckkraft: 0.2, seiten: 'alle', seitenzahlen: false, archivnummer: false },
  ];

  it('gesetzte Haken werden zu einer Zeile im Text, die Vorlage ist als umgestellt markiert', () => {
    const [k, e] = liesVorlagen(ALT);
    assert.equal(k.text, 'Kopie für {empfänger}\n{archivnummer} · Seite {seite} von {seiten}');
    assert.equal(k.umgestellt, true);
    assert.equal(k.deckkraft, 0.25); assert.equal(k.tinte, false); assert.equal(k.seiten, 'erste');
    assert.equal(e.umgestellt, undefined); assert.equal(e.text, 'ENTWURF');
    assert.equal(liesVorlagen([{ ...ALT[0], seitenzahlen: false, archivnummer: true }])[0].text, 'Kopie für {empfänger}\n{archivnummer}');
    assert.ok(!('seitenzahlen' in k) && !('archivnummer' in k), 'die Haken selbst gibt es nicht mehr');
  });

  it('der Hinweis bleibt, bis die Vorlage gespeichert ist; andere Vorlagen zu speichern ändert daran nichts', async () => {
    const einstellungen = speicherEinstellungen();
    await einstellungen.schreibe('stempel', { vorlagen: ALT, typen: {} });
    const d = new Dienst(speicherRepo(), speicherDateien(), { einstellungen });
    await d.stempelvorlagen.speichereStempelVorlage('entwurf', { text: 'ENTWURF!' }, 'admin');
    const gespeichert = (await einstellungen.lies('stempel')) as { vorlagen: Array<Record<string, unknown>> };
    assert.equal(gespeichert.vorlagen[0].umgestellt, true, 'Markierung bleibt gespeichert');
    assert.equal(gespeichert.vorlagen[0].text, 'Kopie für {empfänger}\n{archivnummer} · Seite {seite} von {seiten}');
    // „So lassen“ in der Werkbank speichert die Vorlage, wie sie ist – danach kein Hinweis mehr.
    const k = (await d.stempelvorlagen.stempelVorlagen()).find((v) => v.id === 'kopie')!;
    const l = await d.stempelvorlagen.speichereStempelVorlage('kopie', { name: k.name, text: k.text }, 'admin');
    assert.equal(l.find((v) => v.id === 'kopie')!.umgestellt, undefined);
  });

  it('API mit seitenzahlen/archivnummer wirkt weiter (als Zeile im Text)', () => {
    const w = wunschAus({ stempel: 'KOPIE', seitenzahlen: 'true' })!;
    assert.equal(geltenderStempel(w, null, STANDARD_VORLAGEN)!.stempel.text, 'KOPIE\nSeite {seite} von {seiten}');
    const nur = geltenderStempel(wunschAus({ archivnummer: '1' }), null, STANDARD_VORLAGEN)!;
    assert.equal(nur.stempel.text, '{archivnummer}'); assert.equal(nur.stempel.lage, 'fuss');
  });
});

describe('Lage „Stempel“ und Drehen (#799)', () => {
  it('kleiner Stempel mit doppeltem Rahmen, frei platziert und nicht über den Rand', () => {
    const L = stempelLayout(S({ lage: 'stempel', x: 0.25, y: 0.5, drehung: 0 }), 'BEZAHLT\n04.11.2026', 595, 842, breite);
    assert.ok(L.rahmen?.doppelt);
    assert.equal(L.zeilen.length, 2);
    assert.ok(Math.abs(L.cx - 0.25 * 595) < 0.01 && Math.abs(L.cy - 421) < 0.01);
    assert.ok(L.rahmen!.b < 595 * 0.7, 'klein, nicht quer über die Seite');
    const rand = stempelLayout(S({ lage: 'stempel', x: 1, y: 0 }), 'BEZAHLT', 595, 842, breite);
    assert.ok(rand.cx + rand.rahmen!.b / 2 <= 595 + 1e-6 && rand.cy - rand.rahmen!.h / 2 >= -1e-6);
    // Andere Lagen: ohne Rahmen bzw. mit einfachem Rahmen in der Ecke.
    assert.equal(stempelLayout(S({ lage: 'kopf' }), 'X', 595, 842, breite).rahmen, null);
    assert.equal(stempelLayout(S({ lage: 'ecke' }), 'X', 595, 842, breite).rahmen!.doppelt, false);
  });

  it('Drehen 0–359° für alle Lagen außer der festen Diagonale', () => {
    assert.equal(stempelAus({ drehung: 370 }).drehung, 10);
    assert.equal(stempelAus({ drehung: -90 }).drehung, 270);
    assert.equal(stempelAus({ drehung: '180' }).drehung, 180);
    for (const lage of ['kopf', 'fuss', 'ecke', 'stempel'] as const) assert.equal(stempelLayout(S({ lage, drehung: 180 }), 'X', 595, 842, breite).winkel, 180, lage);
    const d0 = stempelLayout(S({ lage: 'diagonal', drehung: 0 }), 'X', 595, 842, breite);
    const d9 = stempelLayout(S({ lage: 'diagonal', drehung: 90 }), 'X', 595, 842, breite);
    assert.equal(d0.winkel, d9.winkel);
    assert.ok(Math.abs(d0.winkel + (Math.atan2(842, 595) * 180) / Math.PI) < 1e-9);
  });

  it('im PDF: Rahmen und Text in einem gedrehten Koordinatensystem auf der Seite selbst', async () => {
    const pdf = await stempele(S({ lage: 'stempel', text: 'BEZAHLT', drehung: 90, x: 0.5, y: 0.5 }));
    const s = await seiteninhalt(pdf);
    assert.ok(s.includes('BEZAHLT'));
    assert.equal(s.match(/\bh\s+S\b/g)?.length, 2, 'doppelter Rahmen (zwei Pfade)');
    // Drehung 90° im Uhrzeigersinn: cm mit a ≈ 0, b = -1, c = 1.
    const cm = /(-?[\d.e-]+) (-?[\d.e-]+) (-?[\d.e-]+) (-?[\d.e-]+) (-?[\d.e-]+) (-?[\d.e-]+) cm/.exec(s)!;
    assert.ok(cm, 'Transformationsmatrix');
    assert.ok(Math.abs(Number(cm[1])) < 1e-6 && Math.abs(Number(cm[2]) + 1) < 1e-6 && Math.abs(Number(cm[3]) - 1) < 1e-6, cm[0]);
    assert.ok(Math.abs(Number(cm[5]) - 297.5) < 0.5 && Math.abs(Number(cm[6]) - 421) < 0.5, 'Mitte der Seite');
    assert.equal((await PDFDocument.load(pdf)).getPageCount(), 1);
  });

  it('gedrehte Seite (/Rotate 90): der Stempel sitzt auf der sichtbaren Seite', async () => {
    const doc = await PDFDocument.create();
    const p = doc.addPage([595, 842]); p.setRotation(degrees(90));
    const a = await fuerAusgabe({ name: 'q.pdf', mime: 'application/pdf', inhalt: Buffer.from(await doc.save()) }, { stempel: plan(S({ lage: 'stempel', x: 0.5, y: 0.5 })) }, { benutzer: 'L', mappe: 'M' });
    const cm = /(-?[\d.e-]+) (-?[\d.e-]+) (-?[\d.e-]+) (-?[\d.e-]+) (-?[\d.e-]+) (-?[\d.e-]+) cm/.exec(await seiteninhalt(a.inhalt))!;
    // Sichtbar 842 × 595, Mitte (421, 297.5) → Seite (297.5, 421); waagerecht lesbar heißt im Seitenraum um 90° gedreht.
    assert.ok(Math.abs(Number(cm[5]) - 297.5) < 0.5 && Math.abs(Number(cm[6]) - 421) < 0.5, cm[0]);
    assert.ok(Math.abs(Number(cm[1])) < 1e-6 && Math.abs(Number(cm[2]) - 1) < 1e-6, cm[0]);
  });
});
