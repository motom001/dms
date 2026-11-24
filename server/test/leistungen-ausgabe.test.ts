/**
 * Leistungen (#1569): Testfälle an einem Anbieter ausführen (Pflicht für jeden Anbieter, auch Ablago) und die Ausgabe je
 * Release für dms-registry – Katalog (Name, Version, Ergebnisart, Dateitypen, Formate, Schemas, Anzeigename de/en),
 * eingebaute Anbieter, Mappentypen und Testfälle samt Testdateien. Der Release-Workflow hängt
 * `shared/leistungen/ablago-leistungen.json` an das Release. Neu schreiben, wenn sich der Katalog bewusst ändert:
 * `CHARAKTER_SCHREIBEN=1 npm run test:datei -w server -- test/leistungen-ausgabe.test.ts`, danach Prettier.
 */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { LEISTUNGEN, TESTDATEIEN, leistung, teileDesNamens, type Testdatei } from '../../shared/src/leistungen';
import { SYSTEMTYPEN } from '../../shared/src/model';
import deP from '../../shared/src/sprachen/de/pakete.json';
import enP from '../../shared/src/sprachen/en/pakete.json';
import { pruefeTestfaelle, type Anbieter } from '../src/leistungen';
import { pdfMitText } from './hilfen';

const ORDNER = new URL('../../shared/leistungen/', import.meta.url);
const DATEI = fileURLToPath(new URL('ablago-leistungen.json', ORDNER));
const lies = async (n: Testdatei) => new Uint8Array(await readFile(new URL(`testdateien/${n}`, ORDNER)));

/** Die Ausgabe je Release (Format 1). Eingebaute Anbieter kommen mit #1570. */
async function ausgabe() {
  const name = (n: (typeof LEISTUNGEN)[number]) => {
    const k = `leistung.name.${teileDesNamens(n).ohneVersion}`;
    return { de: (deP as Record<string, string>)[k], en: (enP as Record<string, string>)[k] };
  };
  const testdateien: Record<string, { mime: string; base64: string }> = {};
  for (const [n, mime] of Object.entries(TESTDATEIEN))
    testdateien[n] = { mime, base64: Buffer.from(await lies(n as Testdatei)).toString('base64') };
  return {
    format: 1,
    katalog: LEISTUNGEN.map((n) => {
      const l = leistung(n);
      const { ohneVersion, gruppe, version } = teileDesNamens(n);
      return {
        name: ohneVersion,
        version,
        kennung: n,
        gruppe,
        anzeigename: name(n),
        ergebnis: l.ergebnis,
        dateitypen: l.dateitypen,
        formate: l.formate,
        zeitgrenzeS: l.zeitgrenzeS,
        eingabe: l.eingabe,
        ausgabe: l.ausgabe,
        testfaelle: l.testfaelle,
      };
    }),
    eingebaut: [] as Array<{ id: string; leistungen: string[] }>,
    mappentypen: Object.keys(SYSTEMTYPEN),
    testdateien,
  };
}

describe('Leistungen: Testfälle und Ausgabe je Release (#1569)', () => {
  it('Testfälle: ein passender Anbieter besteht, ein falscher fällt mit Grund durch', async () => {
    const gut: Anbieter = {
      id: 'test.gut',
      art: 'paket',
      bietet: { 'dokument.erstellen.aus-text@1': {}, 'text.uebersetzen@1': {} },
      async fuehreAus(a) {
        if (a.leistung === 'text.uebersetzen@1') return { daten: { text: 'Good day' } };
        return { daten: { seiten: 1 }, datei: { inhalt: pdfMitText([String(a.eingabe.text)]), mime: 'application/pdf', name: 'a.pdf' } };
      },
    };
    assert.deepEqual(await pruefeTestfaelle(gut, 'dokument.erstellen.aus-text@1', lies), [{ name: 'kurzer-brief', ok: true }]);
    assert.deepEqual(await pruefeTestfaelle(gut, 'text.uebersetzen@1', lies), [{ name: 'de-en', ok: true }]);
    const falsch: Anbieter = {
      ...gut,
      fuehreAus: async () => ({ daten: { seiten: 2 }, datei: { inhalt: new Uint8Array(1), mime: 'image/png', name: 'a.png' } }),
    };
    const r = await pruefeTestfaelle(falsch, 'dokument.erstellen.aus-text@1', lies);
    assert.equal(r[0].ok, false);
    assert.match(r[0].grund!, /image\/png/);
    // Die Testdatei kommt als Datei beim Anbieter an.
    let bekam: unknown;
    await pruefeTestfaelle(
      { ...gut, fuehreAus: async (a) => ((bekam = a.eingabe.datei), { daten: { text: 'Ablago Testfall 4711' } }) },
      'dokument.lesen.text@1',
      lies,
    );
    assert.equal((bekam as { mime: string }).mime, 'application/pdf');
  });

  it('Ausgabe je Release stimmt mit shared/leistungen/ablago-leistungen.json überein', async () => {
    const ist = await ausgabe();
    if (process.env.CHARAKTER_SCHREIBEN) writeFileSync(DATEI, `${JSON.stringify(ist, null, 2)}\n`);
    assert.deepEqual(JSON.parse(readFileSync(DATEI, 'utf8')), JSON.parse(JSON.stringify(ist)));
  });
});
