/**
 * Leistungen mit PostgreSQL (#1569): Aufträge in der Tabelle `leistungsauftraege` – zwei Prozesse nehmen nie denselben
 * (SKIP LOCKED), eine abgelaufene Frist gibt ihn wieder frei (mit Wirkung nach außen nicht), Neustart stellt zurück,
 * abgeschlossene behalten keine Eingabe. Sicherung: nur offene Aufträge als Merkzettel; nach dem Einspielen in eine
 * neue Datenbank laufen sie weiter. Nur mit TEST_DATABASE_URL.
 */
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { describe, it } from 'node:test';
import { speicherDateien } from '../src/dateien/dateispeicher';
import { Dienst } from '../src/dienst/dienst';
import { speicherEinstellungen } from '../src/einstellungen/einstellungen';
import type { Anbieter } from '../src/leistungen';
import { eigeneDatenbank } from './hilfe-db';

const HAUSHALT = '00000000-0000-4000-8000-000000000001';
const ABLAGO = { art: 'ablago' as const };
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const uebersetzer: Anbieter = {
  id: 'test.uebersetzer',
  art: 'paket',
  bietet: { 'text.uebersetzen@1': {} },
  fuehreAus: async (a) => ({ daten: { text: String(a.eingabe.text).toUpperCase() } }),
};

async function datenbank(name: string) {
  const db = await eigeneDatenbank(name, { jeTest: true });
  await db.sql`INSERT INTO haushalte (id, name) VALUES (${HAUSHALT}, 'Test') ON CONFLICT DO NOTHING`;
  const { pgAuftraege } = await import('../src/leistungen');
  return { ...db, auftraege: pgAuftraege(db.sql, HAUSHALT) };
}

const auftrag = (n: number, zustand: 'wartet' | 'laeuft', wirkung = false) => ({
  id: id(n),
  leistung: wirkung ? ('nachricht.senden.mail@1' as const) : ('text.uebersetzen@1' as const),
  art: 'hintergrund' as const,
  zustand,
  eingabe: wirkung ? { an: ['lena@example.org'], betreff: 'b', text: 't' } : { text: `t${n}`, nach: 'en' },
  kontext: { n },
  ziel: null,
  wer: ABLAGO,
  wirkung,
  zeitgrenzeS: 60,
});

describe('Leistungen mit PostgreSQL (#1569)', { skip: process.env.TEST_DATABASE_URL ? false : 'TEST_DATABASE_URL nicht gesetzt' }, () => {
  it('zwei nehmen nie denselben; Frist abgelaufen: wieder frei, mit Wirkung „unterbrochen“; Neustart; Aufräumen', async () => {
    const { sql, auftraege: a } = await datenbank('k48l_auftraege');
    for (let n = 1; n <= 3; n++) await a.lege(auftrag(n, 'wartet'));
    const [x, y] = await Promise.all([a.naechster(), a.naechster()]);
    assert.ok(x && y && x.id !== y.id);
    assert.equal(x.versuche, 1);
    // Prozess „gestorben“: Frist abgelaufen – der Auftrag ist wieder frei.
    await sql`UPDATE leistungsauftraege SET gesperrt_bis = now() - interval '1 second' WHERE id = ${x.id}`;
    const frei = [await a.naechster(), await a.naechster()].map((z) => z?.id).sort();
    assert.deepEqual(frei, [x.id, id(3)].sort());
    assert.equal(await a.naechster(), undefined);
    // Mit Wirkung: nach Ablauf der Frist nicht noch einmal, sondern „unterbrochen“.
    await a.lege(auftrag(4, 'laeuft', true));
    await sql`UPDATE leistungsauftraege SET gesperrt_bis = now() - interval '1 second' WHERE id = ${id(4)}`;
    assert.equal(await a.naechster(), undefined);
    assert.equal(await a.fristUnterbrechen(), 1);
    assert.equal((await a.hole(id(4)))?.zustand, 'unterbrochen');
    assert.equal((await a.hole(id(4)))?.eingabe, null);
    // Neustart: alles Laufende zurück.
    assert.deepEqual(await a.zurueckstellen(), { wiederholt: 3, unterbrochen: 0 });
    await a.setze(id(1), { zustand: 'fertig', daten: { text: 'T1' }, anbieter: 'test.uebersetzer' });
    const f = await a.hole(id(1));
    assert.equal(f?.eingabe, null, 'abgeschlossen ohne Inhalte');
    assert.deepEqual(f?.kontext, { n: 1 });
    await sql`UPDATE leistungsauftraege SET beendet = now() - interval '49 hours' WHERE id = ${id(1)}`;
    assert.equal(await a.raeumeAuf(48), 1);
    assert.equal(await a.hole(id(1)), undefined);
  });

  it('Sicherung: nur offene Aufträge; eingespielt in eine neue Datenbank laufen sie weiter', async () => {
    const quelle = await datenbank('k48l_sicherung');
    const ziel = await datenbank('k48l_wiederher');
    const { pgDatenquelle, bezeichner } = await import('../src/sicherung/datenbankabzug');
    await quelle.auftraege.lege(auftrag(1, 'wartet'));
    await quelle.auftraege.lege(auftrag(2, 'laeuft'));
    await quelle.auftraege.lege(auftrag(3, 'laeuft', true));
    await quelle.auftraege.lege(auftrag(4, 'wartet'));
    await quelle.auftraege.setze(id(4), { zustand: 'fertig', daten: { text: 'T4' } });
    const { spalten, text } = await pgDatenquelle(quelle.sql).imSchnappschuss(async (s) => {
      const t = s.tabellen.find((x) => x.name === 'leistungsauftraege')!;
      const teile: Buffer[] = [];
      for await (const c of await s.inhalt(t)) teile.push(c);
      return { spalten: t.spalten, text: Buffer.concat(teile) };
    });
    assert.equal(text.toString().trim().split('\n').length, 3, 'der fertige Auftrag ist nicht in der Sicherung');
    // Einspielen wie die Wiederherstellung (COPY … FROM STDIN), dann Start wie nach dem Neustart.
    const w = await ziel.sql.unsafe(`COPY leistungsauftraege (${spalten.map(bezeichner).join(', ')}) FROM STDIN`).writable();
    w.end(text);
    await once(w, 'finish');
    const { pgRepo } = await import('../src/repo/pg');
    const d = new Dienst(pgRepo(ziel.sql, HAUSHALT), speicherDateien(), { einstellungen: speicherEinstellungen() });
    d.leistungen.verbindeSpeicher(ziel.auftraege);
    d.leistungen.anbieter.melde(uebersetzer);
    await d.leistungen.start({ zurueckstellen: true });
    try {
      const offen = async () =>
        (await ziel.sql`SELECT count(*)::int AS n FROM leistungsauftraege WHERE zustand IN ('wartet', 'laeuft')`)[0].n;
      for (let i = 0; i < 200 && (d.leistungen.beschaeftigt || (await offen()) > 0); i++) await new Promise((r) => setTimeout(r, 20));
      const zustand = async (n: number) => (await ziel.auftraege.hole(id(n)))?.zustand;
      assert.deepEqual(
        [await zustand(1), await zustand(2), await zustand(3), await zustand(4)],
        ['fertig', 'fertig', 'unterbrochen', undefined],
      );
      assert.deepEqual((await d.leistungen.auftrag({ fragender: ABLAGO }, id(2))).daten, { text: 'T2' });
    } finally {
      d.leistungen.stop();
    }
  });
});
