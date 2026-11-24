/**
 * Zeitgrenze je Auftrag der Texterkennung (#1550): Ein Auftrag, der nie endet (die Arbeit hört nicht einmal auf das
 * Abbruchsignal), blockiert die Warteschlange nicht – nach der Zeitgrenze steht das Dokument auf „fehlgeschlagen –
 * Zeitgrenze“, der nächste Auftrag startet, und „Erneut versuchen“ reiht es wieder ein.
 */
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { speicherDateien } from '../src/dateien/dateispeicher';
import { Dienst } from '../src/dienst/dienst';
import { speicherEinstellungen } from '../src/einstellungen/einstellungen';
import { speicherRepo } from '../src/repo/speicher';
import { bereinigeOcr, OCR_STANDARD, Texterkennung, zeitgrenzeMs } from '../src/volltext/texterkennung';
import { pdfMitText } from './hilfen';

const angehalten: Texterkennung[] = [];
after(() => {
  for (const t of angehalten) t.stop();
});

const warte = async (bis: () => Promise<boolean>, ms = 5000) => {
  const ende = Date.now() + ms;
  while (!(await bis())) {
    if (Date.now() > ende) return false;
    await new Promise((r) => setTimeout(r, 20));
  }
  return true;
};

describe('Texterkennung: Zeitgrenze je Auftrag (#1550)', () => {
  it('Einstellung: Vorgabe abhängig von der Seitenzahl, Grenzen geprüft', () => {
    assert.deepEqual(OCR_STANDARD.zeitgrenze, { minuten: 5, jeSeiteSekunden: 30 });
    assert.equal(zeitgrenzeMs(OCR_STANDARD, null), 5 * 60_000);
    assert.equal(zeitgrenzeMs(OCR_STANDARD, 10), 5 * 60_000 + 10 * 30_000);
    assert.deepEqual(bereinigeOcr({ zeitgrenze: { minuten: 10 } }).zeitgrenze, { minuten: 10, jeSeiteSekunden: 30 });
    assert.throws(() => bereinigeOcr({ zeitgrenze: { minuten: 0 } }), /ganze Zahl zwischen 1 und 240/);
    assert.throws(() => bereinigeOcr({ zeitgrenze: { jeSeiteSekunden: -1 } }), /zwischen 0 und 600/);
  });

  it('künstlich hängender Auftrag: abgebrochen, „fehlgeschlagen – Zeitgrenze“, der nächste läuft, erneut versuchen geht', async () => {
    const repo = speicherRepo();
    const einstellungen = speicherEinstellungen();
    const dateien = speicherDateien();
    const d = new Dienst(repo, dateien, { einstellungen });
    let haengt = true;
    const t = new Texterkennung(
      repo,
      dateien,
      einstellungen,
      // Der erste Auftrag endet nie und hört nicht auf das Signal; danach geht es normal.
      async () => {
        if (haengt) {
          haengt = false;
          return new Promise(() => {});
        }
        return { text: 'Rechnung der Stadtwerke', seiten: 1, info: 'Ersatz' };
      },
      async () => ({ pdftotext: true, pdftoppm: true }),
    );
    angehalten.push(t);
    t.zeitgrenze = async () => 150;
    d.dokumente.verbindeTexterkennung(t);
    const typ = await d.mappentypen.legeTypAn({
      name: 'Beleg',
      felder: [{ key: 'name', label: 'Name', typ: 'text', pflicht: true }],
      register: [
        { key: 'allgemein', name: 'Allgemein', art: 'felder', felder: ['name'] },
        { key: 'dokumente', name: 'Dokumente', art: 'dokumente' },
      ],
    });
    const m = await d.mappen.legeMappeAn({ typId: typ.id, werte: { name: 'Belege' } });
    t.pause = () => true;
    const a = (await d.dokumente.ladeHoch(m.id, { register: 'dokumente', name: 'a.pdf', typ: 'application/pdf' }, pdfMitText(['a']), null))
      .dokument;
    const b = (await d.dokumente.ladeHoch(m.id, { register: 'dokumente', name: 'b.pdf', typ: 'application/pdf' }, pdfMitText(['b']), null))
      .dokument;
    t.pause = () => false;
    t.anstossen();
    const stand = async (id: string) => (await repo.holeDokument(id))?.ocr;
    assert.ok(await warte(async () => (await stand(b.id))?.stand === 'fertig'), 'der nächste Auftrag läuft trotz des hängenden');
    const fehler = await stand(a.id);
    assert.equal(fehler?.stand, 'fehler');
    assert.match(fehler?.info ?? '', /^Fehlgeschlagen – Zeitgrenze/);
    assert.equal(await t.zeitgrenzeAbbrueche(), 1);
    assert.equal(await t.zeitgrenzeHaeufung(), 0, 'ein Abbruch ist noch keine Häufung (Hinweis in der Übersicht ab 3)');
    await t.neuStarten([a.id], 'lena@example.org');
    assert.ok(await warte(async () => (await stand(a.id))?.stand === 'fertig'), 'erneut versucht und fertig');
  });
});
