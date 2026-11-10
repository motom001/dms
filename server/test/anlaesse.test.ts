/**
 * Anschlusspunkte (#962): feste Reihenfolge, nur in einer Transaktion, der Reihe nach abgewartet, kein `emit()`,
 * Rekursion höchstens Tiefe 2. Dazu die erzeugte Liste „Anlass → Empfänger“ im Entwicklerhandbuch:
 * `ANLAESSE_SCHREIBEN=1 npm run test:datei -w server -- test/anlaesse.test.ts` schreibt sie neu.
 */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { Dienst } from '../src/dienst';
import { speicherDateien } from '../src/dateispeicher';
import { speicherRepo } from '../src/repo-speicher';
import { Anlaesse, Anschlusspunkt } from '../src/kern';

const HANDBUCH = ['docs', 'docs-en'].map((d) => fileURLToPath(new URL(`../../docs/handbuch/entwickler/${d}/aufbau.md`, import.meta.url)));
const ANFANG = '<!-- anlaesse:anfang (erzeugt von server/test/anlaesse.test.ts) -->';
const ENDE = '<!-- anlaesse:ende -->';

/** Die Liste fürs Handbuch – in beiden Sprachen gleich (Namen aus dem Code). */
function liste(a: Anlaesse): string {
  return a.liste().map((x) => `- \`${x.anlass}\` → ${x.empfaenger.map((e, i) => `${i + 1}. \`${e}\``).join(' ')}`).join('\n');
}

describe('Anschlusspunkte (#962)', () => {
  it('Empfänger in fester Reihenfolge, angemeldet beim Zusammenbau; danach ist die Liste zu', () => {
    const d = new Dienst(speicherRepo(), speicherDateien(), {});
    assert.deepEqual(d.kern.anlaesse.liste(), [
      { anlass: 'mappeGeaendert', empfaenger: ['mappentypen.passung', 'aufgaben.erwaehnungen', 'aufgaben.fristen', 'post.aufgaben'] },
      { anlass: 'typGeaendert', empfaenger: ['sichten.umbenennen', 'mappen.titel', 'mappentypen.passung', 'aufgaben.fristen'] },
      { anlass: 'typAngelegt', empfaenger: ['sichten.eigeneSicht'] },
      { anlass: 'benutzerGespiegelt', empfaenger: ['aufgaben.abwesenheit'] },
    ]);
    assert.throws(() => d.kern.anlaesse.mappeGeaendert.anmelden('spaeter', async () => {}), /nur beim Zusammenbau/);
  });

  it('melde() wirft außerhalb einer Transaktion; in einer laufen die Empfänger der Reihe nach, jeder abgewartet', async () => {
    const d = new Dienst(speicherRepo(), speicherDateien(), {});
    await assert.rejects(d.kern.anlaesse.typAngelegt.melde({ typ: (await d.kern.system()).post, sicht: false }), /nur in einer Transaktion/);
    let tx = false;
    const a = new Anschlusspunkt<number>('mappeGeaendert', () => tx);
    const spur: string[] = [];
    a.anmelden('langsam', async (n) => { spur.push(`langsam ${n} an`); await new Promise((r) => setTimeout(r, 20)); spur.push(`langsam ${n} aus`); });
    a.anmelden('schnell', async (n) => { spur.push(`schnell ${n}`); });
    assert.throws(() => a.anmelden('schnell', async () => {}), /schon angemeldet/);
    tx = true;
    await a.melde(1);
    assert.deepEqual(spur, ['langsam 1 an', 'langsam 1 aus', 'schnell 1']);
    // Ein Fehler hält die Reihe an und geht an den Aufrufer (der dann zurückrollt).
    const b = new Anschlusspunkt<number>('typGeaendert', () => true);
    b.anmelden('wirft', async () => { throw new Error('Empfänger wirft'); });
    b.anmelden('danach', async () => { spur.push('nie'); });
    await assert.rejects(b.melde(1), /Empfänger wirft/);
    assert.ok(!spur.includes('nie'));
  });

  it('emit() ist verboten (Kommentar und Fehler); im Code wird es nirgends gerufen', () => {
    const a = new Anschlusspunkt<number>('mappeGeaendert', () => true);
    const liste = (a as unknown as { liste: { emit(art: string, ...x: unknown[]): boolean } }).liste;
    assert.throws(() => liste.emit('empfaenger', 1), /emit\(\) ist an Anschlusspunkten verboten/);
    const quelle = readFileSync(fileURLToPath(new URL('../src/kern/anlaesse.ts', import.meta.url)), 'utf8');
    assert.match(quelle, /`emit\(\)` ist verboten/);
    assert.equal((quelle.match(/\.emit\(/g) ?? []).length, 0, 'kein Aufruf von emit()');
  });

  it('Rekursion: ein anderer Anlass geht (Tiefe 2), derselbe im eigenen Empfänger und Tiefe 3 nicht', async () => {
    const a = new Anlaesse(() => true);
    const spur: string[] = [];
    a.mappeGeaendert.anmelden('x.mappe', async () => { spur.push('mappe'); await a.typGeaendert.melde({} as never); });
    a.typGeaendert.anmelden('x.typ', async () => { spur.push('typ'); });
    await a.mappeGeaendert.melde({} as never);
    assert.deepEqual(spur, ['mappe', 'typ']);

    const selbst = new Anlaesse(() => true);
    selbst.mappeGeaendert.anmelden('x.zurueck', async () => { await selbst.typGeaendert.melde({} as never); });
    selbst.typGeaendert.anmelden('x.wieder', async () => { await selbst.mappeGeaendert.melde({} as never); });
    await assert.rejects(selbst.mappeGeaendert.melde({} as never), /„mappeGeaendert“ erneut gemeldet, während sein Empfänger „x\.zurueck“ läuft/);
    const eigen = new Anlaesse(() => true);
    eigen.typAngelegt.anmelden('x.eigen', async () => { await eigen.typAngelegt.melde({} as never); });
    await assert.rejects(eigen.typAngelegt.melde({} as never), /erneut gemeldet/);

    const tief = new Anlaesse(() => true);
    tief.mappeGeaendert.anmelden('x.1', async () => { await tief.typGeaendert.melde({} as never); });
    tief.typGeaendert.anmelden('x.2', async () => { await tief.typAngelegt.melde({} as never); });
    tief.typAngelegt.anmelden('x.3', async () => {});
    await assert.rejects(tief.mappeGeaendert.melde({} as never), /höchstens 2 Anlässe ineinander \(mappeGeaendert → typGeaendert\)/);
  });

  it('Liste „Anlass → Empfänger“ im Entwicklerhandbuch ist erzeugt und aktuell (de und en)', () => {
    const soll = `${ANFANG}\n${liste(new Dienst(speicherRepo(), speicherDateien(), {}).kern.anlaesse)}\n${ENDE}`;
    for (const datei of HANDBUCH) {
      const text = readFileSync(datei, 'utf8');
      const von = text.indexOf(ANFANG), bis = text.indexOf(ENDE);
      assert.ok(von >= 0 && bis > von, `${datei}: Marken fehlen`);
      const neu = text.slice(0, von) + soll + text.slice(bis + ENDE.length);
      if (process.env.ANLAESSE_SCHREIBEN) writeFileSync(datei, neu);
      else assert.equal(text, neu, `${datei}: Liste veraltet – mit ANLAESSE_SCHREIBEN=1 neu schreiben`);
    }
  });
});
