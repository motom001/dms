/**
 * Seitenbetrachter der Mappe (#1445): `GET /api/dokumente/:id/seitenmasse` liefert nur Seitenzahl und Seitengrößen –
 * dieselben Maße wie die Wortpositionen (quer, gedreht), aber ohne Wörter. Rechte wie die Wortpositionen (Leserecht an
 * der Mappe). Dazu das Lesen der Ausgabe von `pdfinfo -box`. Mit poppler (pdfinfo, pdftotext); ohne wird übersprungen.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { describe, it } from 'node:test';
import { degrees, PDFDocument, StandardFonts } from 'pdf-lib';
import { Archivfassung, speicherArchiv } from '../src/dateien/archivfassung';
import { speicherDateien } from '../src/dateien/dateispeicher';
import { Dienst } from '../src/dienst/dienst';
import { speicherEinstellungen } from '../src/einstellungen/einstellungen';
import { Fachfehler } from '../src/grundlagen/fehler';
import { routen, type Anfrage } from '../src/http/routen';
import { Konten } from '../src/konten';
import { speicherKontoRepo } from '../src/konten/konto-repo';
import { liesSeitenGroessen } from '../src/pdf/seitengroessen';
import { speicherRepo } from '../src/repo/speicher';

const POPPLER = spawnSync('pdfinfo', ['-v']).status === 0 && spawnSync('pdftotext', ['-v']).status === 0;

/** Drei Seiten: A4 hoch, A4 quer, A4 hoch mit /Rotate 90 – mit etwas Text. */
async function pdf(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const f = await doc.embedFont(StandardFonts.Helvetica);
  for (const [i, m] of (
    [
      [595, 842],
      [842, 595],
      [595, 842],
    ] as Array<[number, number]>
  ).entries()) {
    const p = doc.addPage(m);
    if (i === 2) p.setRotation(degrees(90));
    for (let z = 0; z < 8; z++)
      p.drawText(`Rechnung Seite ${i + 1} Zeile ${z} Stadtwerke Beispielstadt`, { x: 40, y: 500 - z * 20, size: 12, font: f });
  }
  return Buffer.from(await doc.save());
}

describe('Seitengrößen ohne Wörter (#1445)', () => {
  it('liest pdfinfo -box: Beschnitt, Drehung, Seiten ohne Angabe', () => {
    const aus = [
      'Pages:           3',
      'Page    1 size:  595 x 842 pts (A4)',
      'Page    1 rot:   0',
      'Page    2 rot:   270',
      'Page    1 MediaBox:      0.00     0.00   595.00   842.00',
      'Page    1 CropBox:      10.00    20.00   585.00   822.00',
      'Page    2 CropBox:       0.00     0.00   595.00   842.00',
    ].join('\n');
    assert.deepEqual(liesSeitenGroessen(aus), [
      { breite: 575, hoehe: 802 },
      { breite: 842, hoehe: 595 },
      { breite: 1, hoehe: 1 },
    ]);
    assert.equal(liesSeitenGroessen('Syntax Error: kein PDF'), null);
  });

  it(
    'GET /api/dokumente/:id/seitenmasse: Maße wie die Wortpositionen, ohne Wörter; nur mit Leserecht',
    { skip: !POPPLER && 'poppler fehlt' },
    async () => {
      const d = new Dienst(speicherRepo(), speicherDateien(), { einstellungen: speicherEinstellungen() });
      d.dokumentArchiv.verbindeArchivfassung(new Archivfassung(d.dokumentArchiv.archivAnbindung(speicherArchiv())));
      const konten = new Konten(
        speicherKontoRepo(),
        () => null,
        () => 'http://localhost',
        d.systemtypen.benutzerspiegel(),
      );
      d.verbindeKonten(konten.papierkorbHaken());
      const { benutzer: lena } = await konten.einrichten({ email: 'lena@example.org', name: 'Lena', passwort: 'ein-langes-passwort' });
      const jonas = (await konten.legeBenutzerAn({ email: 'jonas@example.org', name: 'Jonas' }, lena.id)).benutzer;
      const typ = await d.mappentypen.legeTypAn({
        name: 'Rechnung',
        felder: [{ key: 'nr', label: 'Nr', typ: 'text' }],
        register: [
          { key: 'allgemein', name: 'Allgemein', art: 'felder', felder: ['nr'] },
          { key: 'dokumente', name: 'Dokumente', art: 'dokumente' },
        ],
      });
      // Leserecht nur an der Rechnung R-1 (Grundeinstellung ohne Leserecht).
      await d.kern.repo.setzeBerechtigungen(typ.id, {
        grund: { C: true, R: false, U: false, D: false, P: false },
        regeln: [
          {
            id: 'r1',
            name: 'R-1',
            wenn: [{ art: 'feld', bedingung: { art: 'feld', feld: 'nr', op: 'gleich', wert: { art: 'fest', wert: 'R-1' } } }],
            dann: { R: 'erteilen' },
            stopp: false,
          },
        ],
      });
      const dokIn = async (nr: string) => {
        const m = await d.mappen.legeMappeAn({ typId: typ.id, werte: { nr } }, lena.id);
        return (
          await d.dokumente.ladeHoch(m.id, { register: 'dokumente', name: 'rechnung.pdf', typ: 'application/pdf' }, await pdf(), lena.id)
        ).dokument.id;
      };
      const lesbar = await dokIn('R-1'),
        verborgen = await dokIn('R-2');
      const tabelle = routen(d, konten, {});
      const rufe = async (b: { id: string }, pfad: string, id = lesbar) => {
        const benutzer = (await konten.listeBenutzer()).find((x) => x.id === b.id)!;
        const r = tabelle.find((y) => y.methode === 'GET' && y.pfad === pfad)!;
        return (
          (await r.handler({ body: {}, params: { id }, query: {}, ip: '1', benutzer } as unknown as Anfrage)) as {
            body: { seiten: Array<{ seite: number; breite?: number; hoehe?: number; woerter?: unknown[] }>; quelle: string };
          }
        ).body;
      };
      const masse = await rufe(lena, '/api/dokumente/:id/seitenmasse');
      const wp = await rufe(lena, '/api/dokumente/:id/wortpositionen');
      assert.equal(masse.quelle, 'original');
      assert.deepEqual(
        masse.seiten.map((s) => [s.seite, s.breite, s.hoehe]),
        [
          [1, 595, 842],
          [2, 842, 595],
          [3, 842, 595],
        ],
        'quer und gedreht wie gezeichnet',
      );
      assert.deepEqual(
        masse.seiten.map((s) => [s.breite, s.hoehe]),
        wp.seiten.map((s) => [s.breite, s.hoehe]),
        'dieselben Maße wie die Wortpositionen',
      );
      assert.ok(wp.seiten[0].woerter?.length, 'die Wortpositionen haben Wörter');
      assert.ok(
        masse.seiten.every((s) => !('woerter' in s)),
        'die Seitenmaße nicht',
      );
      // Gleiche Rechteprüfung: Die Rechnung R-2 liest niemand ohne Verwaltungsmodus.
      assert.equal((await rufe(jonas, '/api/dokumente/:id/seitenmasse')).seiten.length, 3, 'mit Leserecht auch ohne Verwaltung');
      for (const pfad of ['/api/dokumente/:id/seitenmasse', '/api/dokumente/:id/wortpositionen'])
        await assert.rejects(rufe(jonas, pfad, verborgen), (e: unknown) => e instanceof Fachfehler && [403, 404].includes(e.status), pfad);
    },
  );
});
