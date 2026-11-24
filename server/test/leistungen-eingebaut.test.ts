/**
 * Eingebaute Anbieter (#1570): Jeder besteht die Testfälle, die zu seiner Meldung passen; die übrigen stehen sichtbar
 * als „nicht gemeldet“ da (Archivfassung: nur Dateien, die schon PDF/A sind). Eine Eingabe außerhalb der Meldung
 * bekommt `leistung.kein-anbieter` mit Grund und Katalog-Adresse. Ablago selbst ruft über `kern.leistung`, und der
 * Auftrag steht in der Liste – ohne Inhalte.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import { EINGEBAUTE_ANBIETER, katalogAdresse, type Leistungsname, type Testdatei } from '../../shared/src/leistungen';
import { speicherDateien } from '../src/dateien/dateispeicher';
import { Dienst } from '../src/dienst/dienst';
import { speicherEinstellungen } from '../src/einstellungen/einstellungen';
import { Fachfehler } from '../src/grundlagen/fehler';
import { pruefeEinschraenkung, pruefeTestfaelle, speicherAuftraege, textAnbieter } from '../src/leistungen';
import { speicherRepo } from '../src/repo/speicher';
import { Texterkennung } from '../src/volltext/texterkennung';

const lies = async (n: Testdatei) => new Uint8Array(await readFile(new URL(`../../shared/leistungen/testdateien/${n}`, import.meta.url)));

function aufbau() {
  const d = new Dienst(speicherRepo(), speicherDateien(), { einstellungen: speicherEinstellungen() });
  const te = new Texterkennung(speicherRepo(), speicherDateien());
  d.leistungen.anbieter.melde(textAnbieter((x, o) => te.alsAnbieter(x, o)));
  const speicher = speicherAuftraege();
  d.leistungen.verbindeSpeicher(speicher);
  return { d, speicher };
}

describe('Eingebaute Anbieter (#1570)', () => {
  it('alle sechs bestehen die Testfälle ihrer Meldung; Testfälle außerhalb stehen als „nicht gemeldet“ da', async () => {
    const { d } = aufbau();
    const ergebnis: Record<string, string> = {};
    for (const [id, bietet] of Object.entries(EINGEBAUTE_ANBIETER)) {
      const a = d.leistungen.anbieter.fuer(Object.keys(bietet)[0] as Leistungsname).find((x) => x.id === id);
      assert.ok(a, id);
      assert.equal(a.art, 'eingebaut');
      for (const n of Object.keys(bietet) as Leistungsname[])
        for (const r of await pruefeTestfaelle(a, n, lies, pruefeEinschraenkung)) {
          ergebnis[`${id} ${n} ${r.name}`] = r.stand;
          assert.notEqual(r.stand, 'gescheitert', `${id} ${n} ${r.name}: ${r.grund}`);
        }
    }
    assert.deepEqual(ergebnis, {
      'ablago.text dokument.lesen.text@1 textebene': 'bestanden',
      'ablago.archiv dokument.umwandeln.pdfa@1 pdf': 'nicht-gemeldet',
      'ablago.umwandeln dokument.umwandeln.pdf@1 bild': 'bestanden',
      'ablago.pdf dokument.bearbeiten.seiten@1 umdrehen': 'bestanden',
      'ablago.pdf dokument.bearbeiten.zusammenfuegen@1 zwei-pdfs': 'bestanden',
      'ablago.pdf dokument.bearbeiten.verkleinern@1 pdf': 'bestanden',
      'ablago.pdf dokument.bearbeiten.schwaerzen@1 oben-links': 'bestanden',
      'ablago.briefsatz dokument.erstellen.aus-text@1 kurzer-brief': 'bestanden',
      'ablago.briefsatz dokument.erstellen.aus-vorlage@1 mit-wert': 'bestanden',
      'ablago.erechnung dokument.lesen.erechnung@1 cii': 'bestanden',
    });
  });

  it('E-Rechnung: Steueraufteilung je Satz', async () => {
    const { d } = aufbau();
    const r = await d.kern.leistung('dokument.lesen.erechnung@1', {
      datei: { inhalt: await lies('rechnung.xml'), mime: 'application/xml', name: 'rechnung.xml' },
    });
    assert.deepEqual(r.daten.steuern, [{ satz: 19, ust: 41.8 }]);
    assert.equal((r.intern?.er as { nummer: string }).nummer, 'R-2026-0815');
  });

  it('außerhalb der Meldung: „kein Anbieter“ mit Grund und Katalog-Adresse; Dateityp ebenso', async () => {
    const { d } = aufbau();
    const brief = { inhalt: await lies('brief.pdf'), mime: 'application/pdf', name: 'brief.pdf' };
    const kein = (grund: string, n: Leistungsname) => (e: unknown) =>
      e instanceof Fachfehler &&
      e.status === 409 &&
      (e.details as { grund: string }).grund === grund &&
      (e.details as { katalog: string }).katalog === katalogAdresse(n);
    await assert.rejects(d.kern.leistung('dokument.umwandeln.pdfa@1', { datei: brief }), kein('eingabe', 'dokument.umwandeln.pdfa@1'));
    const xml = { inhalt: await lies('rechnung.xml'), mime: 'application/xml', name: 'r.xml' };
    await assert.rejects(d.kern.leistung('dokument.umwandeln.pdf@1', { datei: xml }), kein('dateityp', 'dokument.umwandeln.pdf@1'));
  });

  it('Ablago selbst ruft über die Leistung: Auftrag in der Liste, ohne Eingabe und ohne Ergebnis', async () => {
    const { d, speicher } = aufbau();
    const r = await d.kern.leistung('dokument.lesen.text@1', {
      datei: { inhalt: await lies('brief.pdf'), mime: 'application/pdf', name: 'b.pdf' },
    });
    assert.match(String(r.daten.text), /Testfall 4711/);
    assert.ok(r.intern?.ergebnis, 'das ganze Ergebnis der Textebene für Ablago');
    assert.deepEqual(
      speicher.alle().map((a) => [a.leistung, a.zustand, a.anbieter, a.eingabe, a.daten]),
      [['dokument.lesen.text@1', 'fertig', 'ablago.text', null, null]],
    );
  });

  it('Fehler der eingebauten Anbieter bleiben, wie sie sind (dieselben Meldungen wie bisher)', async () => {
    const { d } = aufbau();
    const kaputt = { inhalt: new Uint8Array([1, 2, 3]), mime: 'application/pdf', name: 'kaputt.pdf' };
    await assert.rejects(
      d.kern.leistung('dokument.bearbeiten.seiten@1', { datei: kaputt, seiten: [{ nr: 1 }] }),
      (e: unknown) => e instanceof Fachfehler && e.status === 422 && !(e.details as { code?: string } | undefined)?.code,
    );
  });
});
