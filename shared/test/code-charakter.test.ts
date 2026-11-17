/**
 * Charakterisierung von `liesCode` (#1278, Schritt 6b-3): Vor dem Zerlegen hält dieser Test fest, was die Funktion zu
 * vielen gültigen und kaputten `code:`-Angaben liefert – den gelesenen Code und die Fehler in Wortlaut und Reihenfolge.
 * Erwartung: `charakter/lies-code.json` (siehe charakter.ts).
 */
import { describe, it } from 'node:test';
import { liesCode } from '../src/pakete';
import { wieFestgehalten } from './charakter';

const MB = 1048576;
const mit = (x: Record<string, unknown>) => ({ sprache: 'rust', ...x });
const abschnitt = (felder: unknown[]) => ({ abschnitt: 'Allgemein', felder });
const JANEIN = [
  { schluessel: 'scans', typ: 'janein' },
  { schluessel: 'mails', typ: 'janein' },
  { schluessel: 'text', typ: 'text' },
];

const FAELLE: Record<string, [unknown, Array<{ name: string; groesse: number }>?]> = {
  ohne: [undefined],
  null: [null],
  zuGross: [
    undefined,
    [
      { name: 'code/a.wasm', groesse: 60 * MB },
      { name: 'code/b.wasm', groesse: 50 * MB },
      { name: 'x/c', groesse: 99 * MB },
    ],
  ],
  zuGrossMitCode: [mit({}), [{ name: 'code/a.wasm', groesse: 300 * MB }]],
  keinObjekt: ['rust'],
  liste: [[1, 2]],
  zahl: [5],
  leer: [{}],
  minimal: [mit({})],
  spracheFalsch: [{ sprache: 'cobol' }],
  allesSprachen: [{ sprache: 'javascript', ereignisse: ['post.angelegt', 'post.angelegt'] }],
  ereignisseKeineListe: [mit({ ereignisse: 'post.angelegt' })],
  ereignisseMitZahl: [mit({ ereignisse: ['post.angelegt', 3] })],
  ereignisUnbekannt: [mit({ ereignisse: ['gibt.es.nicht', 'dokument.hochgeladen'] })],
  mappenOhneTypen: [mit({ ereignisse: ['mappe.angelegt', 'mappe.geaendert'] })],
  typenOhneMappenEreignis: [mit({ mappentypen: ['akte'], rechte: { lesen: ['akte'] } })],
  mappenMitTypen: [
    mit({ ereignisse: ['mappe.angelegt', 'frist.erreicht'], mappentypen: ['akte', 'basis:person', 'akte'], rechte: { lesen: ['akte'] } }),
  ],
  mappenTypenOhneLesen: [mit({ ereignisse: ['mappe.angelegt'], mappentypen: ['akte', '*', 'basis:x'], rechte: { lesen: ['basis:x'] } })],
  mappenAlleMitAllen: [mit({ ereignisse: ['mappe.geloescht'], mappentypen: ['*'], rechte: { lesen: ['*'] } })],
  mappenTypUngueltig: [mit({ ereignisse: ['mappe.angelegt'], mappentypen: ['Akte!', 'dms:benutzer'], rechte: { lesen: ['*'] } })],
  mappenUeberSchreiben: [mit({ ereignisse: ['mappe.angelegt'], mappentypen: ['akte'], rechte: { schreiben: ['akte'] } })],
  rechteListe: [mit({ rechte: ['akte'] })],
  rechteText: [mit({ rechte: 'alles' })],
  rechteNull: [mit({ rechte: null })],
  rechteUngueltig: [mit({ rechte: { lesen: ['Akte X', 'dms:benutzer', 'dms:quatsch', 'dms:post', 'dms:rolle'], schreiben: 'akte' } })],
  rechteVoll: [
    mit({
      rechte: { lesen: ['akte', 'dms:post'], schreiben: ['vorgang', 'akte'], dokumente: 'schreiben', schnittstellen: ['dms:erkennen'] },
    }),
  ],
  dokumenteFalsch: [mit({ rechte: { dokumente: 'alles' } })],
  dokumenteLesen: [mit({ rechte: { lesen: ['akte'], dokumente: 'lesen' } })],
  schnittstelleUnbekannt: [mit({ rechte: { schnittstellen: ['dms:gibtsnicht', 'dms:antworten'] } })],
  schnittstellenKeineListe: [mit({ rechte: { schnittstellen: 'dms:antworten' } })],
  vektorenOhneDokumente: [mit({ rechte: { schnittstellen: ['dms:vektoren'] } })],
  vektorenMitDokumenten: [mit({ rechte: { lesen: ['*'], dokumente: 'lesen', schnittstellen: ['dms:vektoren'] } })],
  hinweiseOhneSchreiben: [mit({ rechte: { lesen: ['akte'], schnittstellen: ['dms:hinweise'] } })],
  hinweiseMitSchreiben: [mit({ rechte: { schreiben: ['akte'], schnittstellen: ['dms:hinweise'] } })],
  leerseitenOhne: [mit({ rechte: { schnittstellen: ['dms:leerseiten'] } })],
  leerseitenOhnePost: [mit({ rechte: { lesen: ['akte'], dokumente: 'lesen', schnittstellen: ['dms:leerseiten'] } })],
  leerseitenMitPost: [mit({ rechte: { lesen: ['dms:post'], dokumente: 'lesen', schnittstellen: ['dms:leerseiten'] } })],
  leerseitenMitAllen: [mit({ rechte: { lesen: ['*'], dokumente: 'schreiben', schnittstellen: ['dms:leerseiten'] } })],
  anlagenOhne: [mit({ rechte: { lesen: ['dms:post'], dokumente: 'lesen', schnittstellen: ['dms:anlagen'] } })],
  anlagenOhneSchreiben: [
    mit({ rechte: { lesen: ['dms:post'], schreiben: ['akte'], dokumente: 'schreiben', schnittstellen: ['dms:anlagen'] } }),
  ],
  anlagenMit: [mit({ rechte: { schreiben: ['dms:post'], dokumente: 'schreiben', schnittstellen: ['dms:anlagen'] } })],
  anlagenAlle: [mit({ rechte: { lesen: ['*'], schreiben: ['*'], dokumente: 'schreiben', schnittstellen: ['dms:anlagen'] } })],
  umwandelnGut: [
    mit({
      ereignisse: ['datei.umwandeln'],
      umwandeln: ['Image/TIFF', 'image/tiff', 'application/x-cad'],
      rechte: { dokumente: 'lesen', schnittstellen: ['dms:umwandeln'] },
    }),
  ],
  umwandelnFalsch: [mit({ umwandeln: ['kein mime', 'application/pdf', 'image/png', 3] })],
  umwandelnTypenFalsch: [mit({ umwandeln: ['kein mime', 'application/pdf', 'image/x-a'] })],
  umwandelnZuviele: [
    mit({
      ereignisse: ['datei.umwandeln'],
      umwandeln: Array.from({ length: 21 }, (_, i) => `application/x-${i}`),
      rechte: { dokumente: 'lesen', schnittstellen: ['dms:umwandeln'] },
    }),
  ],
  umwandelnOhneSchnittstelle: [mit({ ereignisse: ['datei.umwandeln'], umwandeln: ['image/x-a'] })],
  umwandelnNurSchnittstelle: [mit({ rechte: { schnittstellen: ['dms:umwandeln'] } })],
  volltextGut: [
    mit({
      ereignisse: ['datei.volltext'],
      volltext: ['Application/X-Foo', 'application/x-foo'],
      rechte: { dokumente: 'schreiben', schnittstellen: ['dms:volltext'] },
    }),
  ],
  volltextFalsch: [mit({ volltext: ['quatsch', 'application/pdf', 'text/x-a'] })],
  volltextZuviele: [
    mit({
      ereignisse: ['datei.volltext'],
      volltext: Array.from({ length: 41 }, (_, i) => `application/x-${i}`),
      rechte: { dokumente: 'lesen', schnittstellen: ['dms:volltext'] },
    }),
  ],
  volltextOhneSchnittstelle: [mit({ ereignisse: ['datei.volltext'], volltext: ['text/x-a'] })],
  volltextNurSchnittstelle: [mit({ rechte: { schnittstellen: ['dms:volltext'] } })],
  volltextKeineListe: [mit({ volltext: 'text/x-a' })],
  archivGut: [
    mit({
      ereignisse: ['datei.archivfassung'],
      archivfassung: { typen: ['Application/PDF', 'image/jpeg', 'application/pdf'] },
      rechte: { dokumente: 'lesen', schnittstellen: ['dms:archivfassung'] },
    }),
  ],
  archivMitAuswahl: [
    mit({
      ereignisse: ['datei.archivfassung'],
      archivfassung: { typen: ['application/pdf'], auswahl: { pdf_scan: 'scans', emails: 'mails' } },
      einstellungen: [abschnitt(JANEIN), { liste: 'l', felder: [{ schluessel: 'inliste', typ: 'janein' }] }, 'kaputt', null, ['x']],
      rechte: { dokumente: 'lesen', schnittstellen: ['dms:archivfassung'] },
    }),
  ],
  archivAuswahlFalsch: [
    mit({
      ereignisse: ['datei.archivfassung'],
      archivfassung: {
        typen: ['application/pdf'],
        auswahl: { pdf_scan: 'text', bilder: 'fehlt', emails: 3, pdf_text: 'inliste', video: 'x' },
      },
      einstellungen: [abschnitt(JANEIN), { liste: 'l', felder: [{ schluessel: 'inliste', typ: 'janein' }] }],
      rechte: { dokumente: 'lesen', schnittstellen: ['dms:archivfassung'] },
    }),
  ],
  archivAuswahlKeinObjekt: [
    mit({
      ereignisse: ['datei.archivfassung'],
      archivfassung: { typen: ['application/pdf'], auswahl: ['scans'] },
      rechte: { dokumente: 'lesen', schnittstellen: ['dms:archivfassung'] },
    }),
  ],
  archivAuswahlNull: [mit({ archivfassung: { typen: ['application/pdf'], auswahl: null }, einstellungen: 'keine' })],
  archivAuswahlLeer: [
    mit({
      ereignisse: ['datei.archivfassung'],
      archivfassung: { typen: ['application/pdf'], auswahl: {} },
      rechte: { dokumente: 'lesen', schnittstellen: ['dms:archivfassung'] },
    }),
  ],
  archivKeinObjekt: [mit({ archivfassung: 'pdf' })],
  archivNull: [mit({ archivfassung: null, rechte: { schnittstellen: ['dms:archivfassung'] } })],
  archivListe: [mit({ archivfassung: ['application/pdf'] })],
  archivFalsch: [mit({ archivfassung: { typen: ['kein mime'], nur_scans: true } })],
  archivOhneTypen: [mit({ archivfassung: {}, rechte: { schnittstellen: ['dms:archivfassung'] } })],
  archivZuviele: [mit({ archivfassung: { typen: Array.from({ length: 41 }, (_, i) => `application/x-${i}`) } })],
  archivNurSchnittstelle: [mit({ rechte: { schnittstellen: ['dms:archivfassung'] }, ereignisse: ['datei.archivfassung'] })],
  archivNurEreignis: [mit({ ereignisse: ['datei.archivfassung'] })],
  sicherungGut: [mit({ ereignisse: ['sicherung.fertig'], rechte: { schnittstellen: ['dms:sicherung-lesen', 'dms:sicherung-holen'] } })],
  sicherungOhneEreignis: [mit({ rechte: { schnittstellen: ['dms:sicherung-lesen'] } })],
  sicherungNurEreignis: [mit({ ereignisse: ['sicherung.fertig'] })],
  holenOhneLesen: [mit({ rechte: { schnittstellen: ['dms:sicherung-holen'] } })],
  netzGut: [mit({ netz: ['https://api.example.org/v1', 'https://example.org'] })],
  netzFalsch: [
    mit({
      netz: [
        'http://example.org',
        'https://u:p@example.org',
        'https://example.org/?a=1',
        'https://example.org/#x',
        'kaputt',
        'https://nur@example.org',
      ],
    }),
  ],
  netzKeineListe: [mit({ netz: 'https://example.org' })],
  adressen: [
    mit({
      einstellungen: [
        abschnitt([
          { schluessel: 'dienst', name: 'Dienst', typ: 'adresse' },
          { schluessel: 'ohne', typ: 'adresse' },
          { typ: 'adresse' },
          null,
          'x',
        ]),
        { liste: 'l', felder: [{ schluessel: 'inliste', typ: 'adresse' }] },
        { felder: 'keine' },
      ],
    }),
  ],
  karten: [
    mit({
      ereignisse: ['zeitplan.ausgefuehrt'],
      karten: [
        {
          schluessel: 'melden',
          name: ' Melden ',
          hilfe: ' Hilfe ',
          felder: [
            { schluessel: 'n', name: 'N', typ: 'zahl' },
            { schluessel: 't', name: 'T' },
          ],
        },
        { schluessel: 'melden', name: 'Doppelt' },
        { schluessel: 'Falsch', name: 'X' },
        { schluessel: 'ohne_name' },
        null,
        {
          schluessel: 'felder',
          name: 'Felder',
          felder: [{ schluessel: 'x', name: 'X', typ: 'datum' }, null, { schluessel: 'j', name: 'J', typ: 'janein' }],
        },
      ],
    }),
  ],
  kartenOhneEreignis: [mit({ karten: [{ schluessel: 'a', name: 'A' }] })],
  kartenKeineListe: [mit({ karten: { schluessel: 'a' } })],
  kartenZuviele: [
    mit({ ereignisse: ['zeitplan.ausgefuehrt'], karten: Array.from({ length: 22 }, (_, i) => ({ schluessel: `k${i}`, name: `K${i}` })) }),
  ],
  paketdaten: [
    mit({ rechte: { einrichtung: ['sicherung', 'allgemein', 'gibtsnicht'], nachweise: ['betrieb', 'allgemein', 'zugang', 'x'] } }),
  ],
  paketdatenGut: [mit({ rechte: { einrichtung: ['sicherung', 'allgemein'], nachweise: ['betrieb', 'zugang'] } })],
  paketdatenMitNetz: [mit({ netz: ['https://example.org'], rechte: { einrichtung: ['allgemein'] } })],
  paketdatenMitAdresse: [mit({ einstellungen: [abschnitt([{ schluessel: 'a', typ: 'adresse' }])], rechte: { nachweise: ['betrieb'] } })],
  paketdatenKeineListe: [mit({ rechte: { einrichtung: 'allgemein' } })],
  allesZusammen: [
    {
      sprache: 'go',
      ereignisse: [
        'mappe.angelegt',
        'datei.umwandeln',
        'datei.volltext',
        'datei.archivfassung',
        'sicherung.fertig',
        'zeitplan.ausgefuehrt',
      ],
      mappentypen: ['akte'],
      rechte: {
        lesen: ['akte'],
        schreiben: ['vorgang'],
        dokumente: 'schreiben',
        schnittstellen: [
          'dms:umwandeln',
          'dms:volltext',
          'dms:archivfassung',
          'dms:sicherung-lesen',
          'dms:sicherung-holen',
          'dms:vektoren',
        ],
      },
      umwandeln: ['image/x-a'],
      volltext: ['text/x-b'],
      archivfassung: { typen: ['application/pdf'], auswahl: { pdf_text: 'scans' } },
      einstellungen: [abschnitt([...JANEIN, { schluessel: 'url', name: '', typ: 'adresse' }])],
      netz: ['https://example.org/a'],
      karten: [{ schluessel: 'k', name: 'K' }],
    },
    [{ name: 'code/a.wasm', groesse: 10 }],
  ],
  allesFalsch: [
    {
      sprache: 3,
      ereignisse: ['x', 'mappe.angelegt', 'datei.umwandeln', 'datei.volltext', 'datei.archivfassung', 'sicherung.fertig'],
      mappentypen: ['*', 'dms:benutzer'],
      rechte: { lesen: ['dms:benutzer'], dokumente: 'x', schnittstellen: ['dms:hinweise', 'dms:leerseiten', 'dms:anlagen', 'y'] },
      umwandeln: ['application/pdf'],
      volltext: ['application/pdf'],
      archivfassung: { typen: [] },
      netz: ['ftp://x'],
      karten: 'x',
    },
    [{ name: 'code/x', groesse: 400 * MB }],
  ],
};

describe('liesCode: Charakterisierung (#1278)', () => {
  it('liest und lehnt ab wie festgehalten', () => {
    const ist: Record<string, unknown> = {};
    for (const [k, [c, dateien]] of Object.entries(FAELLE)) ist[k] = liesCode(c, dateien);
    wieFestgehalten('lies-code', ist);
  });
});
