/**
 * Warteschlange der Texterkennung (#1525): Ein Dokument auf „wartet“ wird spätestens beim nächsten Nachsehen bearbeitet,
 * auch wenn das Wecksignal verloren ging. Im Rauchtest zu #1487 blieb eine Anlage dauerhaft auf „wartet“: Direkt nach dem
 * Hochladen sperrt „Als Anlage anhängen“ ihre Zeile in einer Transaktion, `ocrNaechster` überspringt sie (SKIP LOCKED)
 * und meldet „nichts zu tun“ – danach weckte niemand mehr die Warteschlange. Der Kern läuft im Arbeitsspeicher und –
 * mit TEST_DATABASE_URL – gegen PostgreSQL mit einer echten Zeilensperre.
 */
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { speicherDateien } from '../src/dateien/dateispeicher';
import { Dienst } from '../src/dienst/dienst';
import { speicherEinstellungen } from '../src/einstellungen/einstellungen';
import type { Repo } from '../src/repo';
import { speicherRepo } from '../src/repo/speicher';
import { Texterkennung } from '../src/volltext/texterkennung';
import { eigeneDatenbank } from './hilfe-db';
import { pdfMitText } from './hilfen';

const url = process.env.TEST_DATABASE_URL;
const HAUSHALT = '00000000-0000-4000-8000-000000000001';
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Verbindungen nur zum Schließen
const offen: any[] = [];
const angehalten: Texterkennung[] = [];
after(async () => {
  for (const t of angehalten) t.stop();
  for (const s of offen) await s.end();
});

const warte = async (bis: () => Promise<boolean>, ms: number) => {
  const ende = Date.now() + ms;
  while (!(await bis())) {
    if (Date.now() > ende) return false;
    await new Promise((r) => setTimeout(r, 20));
  }
  return true;
};

/** Schlägt nach `ms` fehl; der Zeitgeber hält den Prozess nicht auf. */
const notbremse = (ms: number, text: string) => new Promise<never>((_, nein) => setTimeout(() => nein(new Error(text)), ms).unref());

/** Kern mit Texterkennung; `ocrNaechster` lässt sich beobachten (Zahl der Antworten „nichts zu tun“). */
async function aufbau(repo: Repo) {
  const einstellungen = speicherEinstellungen();
  const dateien = speicherDateien();
  const d = new Dienst(repo, dateien, { einstellungen });
  const t = new Texterkennung(
    repo,
    dateien,
    einstellungen,
    async () => ({ text: 'Protokoll der Wartung an der Heizung', seiten: 1, info: 'Ersatz' }),
    async () => ({ pdftotext: true, pdftoppm: true }),
  );
  angehalten.push(t);
  d.dokumente.verbindeTexterkennung(t);
  t.nachsehenMs = 50;
  const typ = await d.mappentypen.legeTypAn({
    name: 'Wartungsbeleg',
    felder: [{ key: 'name', label: 'Name', typ: 'text', pflicht: true }],
    register: [
      { key: 'allgemein', name: 'Allgemein', art: 'felder', felder: ['name'] },
      { key: 'dokumente', name: 'Dokumente', art: 'dokumente' },
    ],
  });
  const m = await d.mappen.legeMappeAn({ typId: typ.id, werte: { name: 'Beleg Wartung' } });
  /** Hochladen, während die Texterkennung pausiert – das Dokument steht danach auf „wartet“. `pausiert`: Pause bleibt. */
  const hochladen = async (name: string, o: { pausiert?: boolean } = {}) => {
    t.pause = () => true;
    const { dokument } = await d.dokumente.ladeHoch(m.id, { register: 'dokumente', name, typ: 'application/pdf' }, pdfMitText(['x']), null);
    if (!o.pausiert) t.pause = () => false;
    assert.equal(dokument.ocr?.stand, 'wartet');
    return dokument;
  };
  const stand = async (id: string) => (await repo.holeDokument(id))?.ocr?.stand;
  return { d, t, hochladen, stand };
}

describe('Warteschlange der Texterkennung (#1525)', () => {
  it('verlorenes Wecksignal: ein „wartet“-Dokument wird beim nächsten Nachsehen bearbeitet', async () => {
    const repo = speicherRepo();
    // Wie SKIP LOCKED bei einer gesperrten Zeile: die erste Abfrage findet nichts, obwohl ein Dokument wartet.
    let verdeckt = 1;
    const naechster = repo.ocrNaechster.bind(repo);
    repo.ocrNaechster = async () => (verdeckt-- > 0 ? undefined : naechster());
    const { t, hochladen, stand } = await aufbau(repo);
    await t.start();
    const a = await hochladen('Wartungsprotokoll.pdf');
    t.anstossen();
    assert.ok(await warte(async () => (await stand(a.id)) === 'fertig', 5_000), `bleibt auf „${await stand(a.id)}“`);
  });

  it('während einer Pause angekommen, danach nicht angestoßen: das Nachsehen holt es nach', async () => {
    const { t, hochladen, stand } = await aufbau(speicherRepo());
    await t.start();
    const a = await hochladen('Nachtrag.pdf');
    assert.ok(await warte(async () => (await stand(a.id)) === 'fertig', 5_000), `bleibt auf „${await stand(a.id)}“`);
  });

  it('beendet: kein Nachsehen mehr', async () => {
    const { t, hochladen, stand } = await aufbau(speicherRepo());
    await t.start();
    t.stop();
    const a = await hochladen('Spaet.pdf');
    assert.equal(await warte(async () => (await stand(a.id)) !== 'wartet', 300), false);
  });

  it(
    'PostgreSQL: gesperrte Zeile beim Anstoßen (SKIP LOCKED) – danach bearbeitet',
    { skip: url ? false : 'TEST_DATABASE_URL nicht gesetzt' },
    async () => {
      const { pgRepo } = await import('../src/repo/pg');
      const { sql } = await eigeneDatenbank('ocr_warteschlange', { jeTest: true });
      offen.push(sql);
      await sql`INSERT INTO haushalte (id, name) VALUES (${HAUSHALT}, 'Test') ON CONFLICT DO NOTHING`;
      const repo = pgRepo(sql, HAUSHALT);
      // #1626: Ereignisse statt fester Zeit. „Übersprungen“ meldet die erste Antwort „nichts zu tun“, während die Zeile
      // gesperrt ist. Bis die Sperre steht, bleibt die Texterkennung pausiert: Sonst nahm das Nachsehen (alle 200 ms) oder
      // das Wecksignal des Hochladens das Dokument unter Last schon vor der Sperre, und der Test wartete vergeblich.
      let gesperrt = false;
      let uebersprungen!: () => void;
      const beiUebersprungen = new Promise<void>((ok) => (uebersprungen = ok));
      const naechster = repo.ocrNaechster.bind(repo);
      repo.ocrNaechster = async () => {
        const x = await naechster();
        if (!x && gesperrt) uebersprungen();
        return x;
      };
      const { t, hochladen, stand } = await aufbau(repo);
      t.nachsehenMs = 200;
      t.pause = () => true;
      await t.start();
      const a = await hochladen('Wartungsprotokoll.pdf', { pausiert: true });
      // Wie „Als Anlage anhängen“ direkt nach dem Hochladen: eine Transaktion hält die Zeile, während angestoßen wird.
      await sql.begin(async (tx) => {
        await tx`SELECT id FROM dokumente WHERE id = ${a.id} FOR UPDATE`;
        gesperrt = true;
        t.pause = () => false;
        t.anstossen();
        // Die Grenze ist nur die Notbremse für einen echten Fehler; gewartet wird auf das Ereignis.
        await Promise.race([beiUebersprungen, notbremse(30_000, 'ocrNaechster hat die gesperrte Zeile nicht übersprungen')]);
        assert.equal((await tx`SELECT ocr_stand FROM dokumente WHERE id = ${a.id}`)[0].ocr_stand, 'wartet');
        gesperrt = false;
      });
      assert.ok(await warte(async () => (await stand(a.id)) === 'fertig', 30_000), `bleibt auf „${await stand(a.id)}“`);
    },
  );
});
