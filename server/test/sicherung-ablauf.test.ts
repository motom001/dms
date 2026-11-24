/**
 * Sicherung in KW48: „Wozu?“ (#1529), kein Nachholen direkt nach einer Sicherung und „nachgeholt“ (#1531), Platz für
 * die nächste Sicherung und die erste Sicherung samt Probe nach der Einrichtung (#1509).
 */
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, truncate, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import type { Datenquelle } from '../src/sicherung/datenbankabzug';
import { speicherEinstellungen } from '../src/einstellungen/einstellungen';
import { Fachfehler } from '../src/grundlagen/fehler';
import { istNachgeholt, PLAN_STANDARD, Sicherung } from '../src/sicherung/sicherung';
import { liesSicherung, ZWECK } from '../src/sicherung/sicherungsformat';
import { leiteAb, Tresor } from '../src/geheimnisse/tresor';
import { laufeErste, vormerkeErste } from '../src/sicherung/erste-sicherung';
import { faelligBis } from '../src/sicherung/betriebsangaben';

const HAUSHALT = '00000000-0000-4000-8000-000000000001';
const ordner: string[] = [];
after(async () => {
  for (const o of ordner) await rm(o, { recursive: true, force: true });
});

function daten(): Datenquelle {
  return {
    async imSchnappschuss(f) {
      return f({
        postgres: '17.0', migrationen: ['001_a.sql'], tabellen: [{ name: 'mappen', spalten: ['id'] }],
        zaehler: { mappen: 1, dokumente: 0, benutzer: 1 },
        inhalt: async () => (async function* () { yield Buffer.from('1\n'); })(),
      });
    },
    async groesse() { return 10; },
  };
}

async function aufbau(jetzt?: () => Date) {
  const wurzel = await mkdtemp(join(tmpdir(), 'dms-ablauf-'));
  ordner.push(wurzel);
  const einstellungen = speicherEinstellungen();
  const tresor = new Tresor(einstellungen, join(wurzel, 'geheim', 'dms.schluessel'), () => null);
  await tresor.laden();
  await tresor.erzeuge();
  await mkdir(join(wurzel, 'files', HAUSHALT, 'ab'), { recursive: true });
  await writeFile(join(wurzel, 'files', HAUSHALT, 'ab', 'abc'), 'Inhalt');
  const s = new Sicherung(join(wurzel, 'sicherung'), join(wurzel, 'files'), HAUSHALT, {
    tresor, einstellungen, daten: daten(), mountinfo: '/gibt-es-nicht', jetzt,
    umgebung: async () => ({ dms: '0.305.0', node: '24', system: 'Linux', architektur: 'x64' }),
  });
  return { s, tresor, einstellungen };
}
const fertig = async (s: Sicherung) => {
  while (s.laeuft()) await new Promise((r) => setTimeout(r, 10));
};

describe('Sicherung von Hand mit „Wozu?“ (#1529)', () => {
  it('steht in den Angaben und verschlüsselt in der Sicherung, lässt sich ändern und leeren; höchstens 80 Zeichen', async () => {
    const { s, tresor } = await aufbau();
    await assert.rejects(s.starte('manuell', 'markus@example.org', { wozu: 'x'.repeat(81) }), (e: unknown) => e instanceof Fachfehler && e.status === 422);
    const meta = (await (await s.starte('manuell', 'markus@example.org', { wozu: '  Vor dem   Entfernen von Rechnungen ' })).fertig)!;
    assert.equal(meta.wozu, 'Vor dem Entfernen von Rechnungen');
    const name = meta.datei.replace(/\.dms-sicherung$/, '');
    assert.equal((await s.liste())[0].meta?.wozu, 'Vor dem Entfernen von Rechnungen');
    // Auch in der Sicherung selbst (Inhaltsangabe), damit er mit nur den schlanken Angaben vom Ziel lesbar bleibt.
    const it0 = liesSicherung(join(s.ordner, meta.datei), leiteAb(Buffer.from(tresor.alsText()!, 'base64url'), ZWECK))[Symbol.asyncIterator]();
    const erst = await it0.next();
    await it0.return?.(undefined);
    assert.equal((erst.value as { kopf: { wozu?: string } }).kopf.wozu, 'Vor dem Entfernen von Rechnungen');
    assert.equal(await s.setzeWozu(name, 'Test nach dem Update', 'markus@example.org'), 'Test nach dem Update');
    assert.equal(JSON.parse(await readFile(join(s.ordner, `${name}.json`), 'utf8')).wozu, 'Test nach dem Update');
    assert.equal(await s.setzeWozu(name, '', 'markus@example.org'), null);
    assert.equal((await s.liste())[0].meta?.wozu, undefined);
    await assert.rejects(s.setzeWozu('gibt-es-nicht', 'x', 'markus@example.org'), /fehlen/);
    // Automatische Sicherungen haben kein „Wozu?“.
    const auto = (await (await s.starte('automatisch', 'Zeitplan', { wozu: 'soll nicht' })).fertig)!;
    assert.equal(auto.wozu, undefined);
  });
});

describe('Kein Nachholen direkt nach einer Sicherung (#1531)', () => {
  it('nachgeholt heißt: anderer Tag oder mehr als 15 Minuten nach der Uhrzeit', () => {
    assert.equal(istNachgeholt('2026-11-24', { datum: '2026-11-24', uhr: '02:00' }, '02:00'), false);
    assert.equal(istNachgeholt('2026-11-24', { datum: '2026-11-24', uhr: '02:14' }, '02:00'), false);
    assert.equal(istNachgeholt('2026-11-24', { datum: '2026-11-24', uhr: '02:24' }, '02:00'), true);
    assert.equal(istNachgeholt('2026-11-23', { datum: '2026-11-24', uhr: '01:00' }, '02:00'), true);
    assert.equal(faelligBis({ datum: '2026-11-24', uhr: '01:59' }, '02:00'), '2026-11-23');
    assert.equal(faelligBis({ datum: '2026-11-24', uhr: '02:00' }, '02:00'), '2026-11-24');
  });

  it('Sicherung von Hand vor 20 Minuten: kein Nachholen, sie zählt für heute; sonst „automatisch · nachgeholt“', async () => {
    let jetzt = new Date('2026-11-24T01:04:00Z'); // 02:04 deutscher Zeit
    const { s, einstellungen } = await aufbau(() => jetzt);
    await einstellungen.schreibe('sicherung_plan', { ...PLAN_STANDARD, aktiv: true, uhrzeit: '02:00', aktivSeit: jetzt.toISOString() });
    await einstellungen.schreibe('sicherung_zuletzt_auto', '2026-11-23');
    await (await s.starte('manuell', 'markus@example.org')).fertig;
    jetzt = new Date('2026-11-24T01:24:00Z'); // 02:24: zu spät für „pünktlich“
    assert.equal(await s.tick(), 'nichts');
    assert.equal(await einstellungen.lies('sicherung_zuletzt_auto'), '2026-11-24', 'zählt für heute');
    assert.deepEqual((await s.liste()).map((x) => x.meta?.art), ['manuell']);
    // Am nächsten Tag verpasst (Gerät aus), keine Sicherung in der letzten Stunde: nachgeholt.
    jetzt = new Date('2026-11-25T09:00:00Z');
    assert.equal(await s.tick(), 'gestartet');
    await fertig(s);
    const neu = (await s.liste())[0].meta!;
    assert.deepEqual([neu.art, neu.nachgeholt], ['automatisch', true]);
    // Pünktlich zur Uhrzeit: nicht nachgeholt.
    jetzt = new Date('2026-11-26T01:00:00Z');
    assert.equal(await s.tick(), 'gestartet');
    await fertig(s);
    assert.equal((await s.liste())[0].meta!.nachgeholt, undefined);
  });
});

describe('Platz und erste Sicherung nach der Einrichtung (#1509)', () => {
  it('reicht der Platz für die nächste Sicherung voraussichtlich nicht, lässt Ablago sie aus und meldet das', async () => {
    const { s } = await aufbau();
    const meta = (await (await s.starte('manuell', 'x')).fertig)!;
    const p = await s.platzFuerNaechste();
    assert.ok(p.frei !== null && p.geschaetzt === meta.groessen.sicherungBytes && p.reicht);
    // Die letzte Sicherung „wächst“ (dünn belegte Datei) über den freien Platz: Die nächste passt voraussichtlich nicht.
    await truncate(join(s.ordner, meta.datei), p.frei! + 2 * 1024 ** 3);
    assert.equal((await s.platzFuerNaechste()).reicht, false);
    await assert.rejects(s.starte('manuell', 'x'), (e: unknown) => e instanceof Fachfehler && e.status === 507 && /voraussichtlich nicht/.test(e.message));
    assert.match((await s.zustand()).fehler!.grund, /voraussichtlich nicht/);
  });

  it('vormerken nur bei Neueinrichtung; erst Sicherung, dann Probe mit genau ihr; Ergebnis im Zustand', async () => {
    const jetzt = new Date('2026-11-24T20:14:00Z');
    const { s, einstellungen } = await aufbau(() => jetzt);
    assert.equal(await laufeErste(s, { starteProbe: async () => ({ fertig: Promise.resolve(true) }), aktuellerLauf: () => null }), false, 'nichts vorgemerkt');
    assert.equal(await vormerkeErste(s, 'lena@example.org', jetzt), true);
    assert.equal(await vormerkeErste(s, 'lena@example.org', jetzt), false, 'nur einmal');
    const plan = await s.plan();
    assert.deepEqual([plan.aktiv, plan.uhrzeit, plan.haeufigkeit, plan.aufbewahrung], [true, '02:00', 'taeglich', { taeglich: 7, woechentlich: 4, monatlich: 3 }]);
    assert.equal(await einstellungen.lies('sicherung_zuletzt_auto'), '2026-11-24', 'die erste zählt für heute');
    assert.equal((await s.zustand()).erste?.status, 'offen');
    const proben: string[] = [];
    assert.equal(await laufeErste(s, { starteProbe: async (name) => (proben.push(name), { fertig: Promise.resolve(true) }), aktuellerLauf: () => null }, () => jetzt), true);
    const z = await s.zustand();
    assert.equal(z.erste?.status, 'ok');
    assert.deepEqual(proben, [z.erste?.sicherung], 'Probe mit genau dieser Sicherung');
    assert.equal(z.letzte?.art, 'automatisch');
    assert.equal(await laufeErste(s, { starteProbe: async () => ({ fertig: Promise.resolve(true) }), aktuellerLauf: () => null }), false, 'nur einmal');
  });

  it('bestehende Installation (schon ein Plan oder eine Sicherung): nichts ändert sich', async () => {
    const a = await aufbau();
    await a.einstellungen.schreibe('sicherung_plan', { ...PLAN_STANDARD });
    assert.equal(await vormerkeErste(a.s, 'x'), false);
    assert.equal((await a.s.plan()).aktiv, false);
    const b = await aufbau();
    await (await b.s.starte('manuell', 'x')).fertig;
    assert.equal(await vormerkeErste(b.s, 'x'), false);
    assert.equal(await b.einstellungen.lies('sicherung_plan'), null);
  });

  it('Probe scheitert: „fehler“ mit Schritt und Grund', async () => {
    const { s } = await aufbau();
    await vormerkeErste(s, 'lena@example.org');
    await laufeErste(s, { starteProbe: async () => ({ fertig: Promise.resolve(false) }), aktuellerLauf: () => ({ fehler: 'Prüfwort passt nicht' }) });
    const e = (await s.zustand()).erste!;
    assert.deepEqual([e.status, e.schritt, e.grund], ['fehler', 'probe', 'Prüfwort passt nicht']);
  });
});
