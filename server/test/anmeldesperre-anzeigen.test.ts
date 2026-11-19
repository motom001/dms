/**
 * Gesperrte Anmeldungen (#1481): alle aktiven Sperren der drei Ebenen anzeigen und aufheben – je E-Mail-Adresse und IP,
 * je IP, je Konto (#1295). Mit zwei Instanzen an einem Kurzzustand wie mit zwei Prozessen an einer Datenbank. Am
 * Verhalten des Schutzes (Schwellen, Zählung, Dauer) ändert sich nichts.
 */
import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { Anmeldesperre, KONTO_GESAMT } from '../src/anmeldung/anmeldesperre';
import { speicherEinstellungen } from '../src/einstellungen/einstellungen';
import { Fachfehler } from '../src/grundlagen/fehler';
import { speicherKurzzustand } from '../src/zwischenspeicher/kurzzustand';
import { Nachweisjournal, setzeNachweisjournal, speicherJournal, type JournalSpeicher } from '../src/protokoll/nachweisjournal';

const MIN = 60_000;
const START = Date.parse('2026-11-19T10:00:00Z');
const gesperrt = (p: Promise<unknown>) => assert.rejects(p, (e) => e instanceof Fachfehler && e.status === 429);

describe('Gesperrte Anmeldungen (#1481)', () => {
  let journal: JournalSpeicher;
  beforeEach(() => {
    journal = speicherJournal();
    setzeNachweisjournal(new Nachweisjournal(journal, () => new Date(START)));
  });
  afterEach(() => setzeNachweisjournal(null));
  const entsperrt = async () => (await journal.monat('2026-11')).eintraege.filter((e) => e.art === 'zugang.entsperrt').map((e) => e.daten);

  it('je E-Mail-Adresse und IP: erscheint erst ab der Grenze, mit Fehlversuchen, seit und bis; Entsperren hebt nur sie auf', async () => {
    let t = START;
    const s = new Anmeldesperre(speicherEinstellungen(), undefined, () => t);
    await s.speichere({ konto: { versuche: 3, minuten: 10 } }, 'test');
    for (let i = 0; i < 2; i++)
      await s.fehlschlag('lena@example.org', '203.0.113.5', true, await s.versuch('lena@example.org', '203.0.113.5'));
    assert.deepEqual(await s.aktiveSperren(), [], 'unter der Grenze keine Sperre');
    t += MIN;
    await s.fehlschlag('lena@example.org', '203.0.113.5', true, await s.versuch('lena@example.org', '203.0.113.5'));
    await gesperrt(s.pruefe('lena@example.org', '203.0.113.5'));
    const [g, ...rest] = await s.aktiveSperren();
    assert.deepEqual(rest, []);
    assert.deepEqual(g, {
      art: 'konto-ip',
      email: 'lena@example.org',
      ip: '203.0.113.5',
      versuche: 3,
      seit: new Date(t).toISOString(),
      bis: new Date(t + 10 * MIN).toISOString(),
    });
    // Weitere Versuche zählen nicht und verschieben nichts (wie bisher).
    t += MIN;
    await gesperrt(s.versuch('lena@example.org', '203.0.113.5'));
    assert.equal((await s.aktiveSperren())[0].bis, g.bis);
    assert.equal(await s.entsperreKontoIp('lena@example.org', '203.0.113.5', 'jonas@example.org', true), true);
    assert.deepEqual(await s.aktiveSperren(), []);
    await s.pruefe('lena@example.org', '203.0.113.5');
    assert.equal(await s.entsperreKontoIp('lena@example.org', '203.0.113.5', 'jonas@example.org', true), false, 'nur einmal');
    assert.deepEqual(await entsperrt(), [{ art: 'konto-ip', konto: 'lena@example.org', netz: '203.0.113.0', von: 'jonas@example.org' }]);
    // Danach gilt wieder dieselbe Grenze.
    for (let i = 0; i < 3; i++)
      await s.fehlschlag('lena@example.org', '203.0.113.5', true, await s.versuch('lena@example.org', '203.0.113.5'));
    await gesperrt(s.pruefe('lena@example.org', '203.0.113.5'));
  });

  it('je IP: mit Fehlversuchen, dauerhaft „bis entsperrt“; im Nachweis nur das gekürzte Netz', async () => {
    const s = new Anmeldesperre(speicherEinstellungen(), undefined, () => START);
    await s.speichere({ ip: { versuche: 4, minuten: 0 } }, 'test');
    for (let i = 0; i < 4; i++) await s.fehlschlag(`n${i}@example.org`, `2001:db8:1:2::${i + 1}`);
    const [g, ...rest] = await s.aktiveSperren();
    assert.deepEqual(rest, []);
    assert.equal(g.art, 'ip');
    assert.equal(g.ip, '2001:db8:1:2::/64');
    assert.equal(g.email, null);
    assert.equal(g.versuche, 4);
    assert.equal(g.bis, null);
    assert.equal(g.seit, new Date(START).toISOString());
    assert.match(g.grund ?? '', /4/);
    // Die bisherige Liste (nur IPs, für `dms gesperrt`) bleibt gleich.
    assert.deepEqual(
      (await s.gesperrt()).map((x) => x.ip),
      ['2001:db8:1:2::/64'],
    );
    assert.equal(await s.entsperre('2001:db8:1:2::/64', 'jonas@example.org'), true);
    assert.deepEqual(await s.aktiveSperren(), []);
    assert.deepEqual(await entsperrt(), [{ art: 'ip', netz: '2001:db8:1::', von: 'jonas@example.org' }]);
  });

  it('je Konto (#1295): mit Beginn; Entsperren hebt auch die Sperren je Adresse auf; unbekannte Konten nicht im Nachweis', async () => {
    let t = START;
    const s = new Anmeldesperre(speicherEinstellungen(), undefined, () => t);
    const fremd = (i: number) => `198.51.100.${i}`;
    for (const email of ['lena@example.org', 'gibt-es-nicht@example.org']) {
      for (let i = 0; i < KONTO_GESAMT.versuche; i++) {
        t += 1000;
        await s.fehlschlag(email, fremd(i), false, await s.versuch(email, fremd(i)));
      }
    }
    const konto = (await s.aktiveSperren()).filter((x) => x.art === 'konto');
    assert.deepEqual(
      konto.map((x) => [x.email, x.versuche]),
      [
        ['lena@example.org', KONTO_GESAMT.versuche],
        ['gibt-es-nicht@example.org', KONTO_GESAMT.versuche],
      ],
    );
    const lena = konto[0];
    assert.equal(lena.ip, null);
    assert.equal(lena.seit, new Date(START + KONTO_GESAMT.versuche * 1000).toISOString(), 'Beginn = Fehlversuch an der Grenze');
    assert.ok(lena.bis && lena.bis > lena.seit!);
    await gesperrt(s.pruefe('lena@example.org', '203.0.113.9'));
    // Dazu je Adresse und IP: ab der Grenze für Konto und IP auch dort gesperrt.
    await s.speichere({ konto: { versuche: 2, minuten: 10 } }, 'test');
    await s.fehlschlag('lena@example.org', '203.0.113.9');
    await s.fehlschlag('lena@example.org', '203.0.113.9');
    assert.equal((await s.aktiveSperren()).filter((x) => x.email === 'lena@example.org').length, 2);
    assert.equal(await s.entsperreKonto('lena@example.org', 'jonas@example.org', true), true);
    assert.deepEqual(
      (await s.aktiveSperren()).map((x) => x.email),
      ['gibt-es-nicht@example.org'],
      'andere Konten bleiben gesperrt',
    );
    await s.pruefe('lena@example.org', '203.0.113.9');
    assert.equal(await s.entsperreKonto('gibt-es-nicht@example.org', 'jonas@example.org', false), true);
    assert.deepEqual(await s.aktiveSperren(), []);
    assert.deepEqual(await entsperrt(), [
      { art: 'konto', konto: 'lena@example.org', von: 'jonas@example.org' },
      { art: 'konto', von: 'jonas@example.org' },
    ]);
    // Danach zählt ein neues Fenster mit derselben Grenze.
    for (let i = 0; i < KONTO_GESAMT.versuche - 1; i++)
      await s.fehlschlag('lena@example.org', fremd(i), false, await s.versuch('lena@example.org', fremd(i)));
    assert.deepEqual(
      (await s.aktiveSperren()).filter((x) => x.art === 'konto'),
      [],
    );
  });

  it('leer erst, wenn keine Ebene sperrt', async () => {
    const s = new Anmeldesperre(speicherEinstellungen(), undefined, () => START);
    await s.speichere({ konto: { versuche: 2, minuten: 5 }, ip: { versuche: 3, minuten: 5 } }, 'test');
    await s.fehlschlag('lena@example.org', '203.0.113.1');
    await s.fehlschlag('lena@example.org', '203.0.113.1');
    assert.deepEqual(await s.gesperrt(), [], 'die IP ist frei …');
    assert.deepEqual(
      (await s.aktiveSperren()).map((x) => x.art),
      ['konto-ip'],
      '… die Anmeldung aber gesperrt',
    );
  });

  it('mehrere Prozesse: Sperren aus dem einen erscheinen im anderen, Entsperren gilt für beide', async () => {
    const zustand = speicherKurzzustand(() => START);
    const einst = speicherEinstellungen();
    const a = new Anmeldesperre(einst, undefined, () => START, zustand);
    const b = new Anmeldesperre(einst, undefined, () => START, zustand);
    await a.speichere({ konto: { versuche: 2, minuten: 5 } }, 'test');
    await a.fehlschlag('lena@example.org', '203.0.113.7', true, await a.versuch('lena@example.org', '203.0.113.7'));
    await b.fehlschlag('lena@example.org', '203.0.113.7', true, await b.versuch('lena@example.org', '203.0.113.7'));
    assert.deepEqual(
      (await b.aktiveSperren()).map((x) => [x.art, x.email, x.ip, x.versuche]),
      [['konto-ip', 'lena@example.org', '203.0.113.7', 2]],
    );
    assert.deepEqual(await a.aktiveSperren(), await b.aktiveSperren());
    assert.equal(await b.entsperreKontoIp('lena@example.org', '203.0.113.7', 'jonas@example.org', true), true);
    assert.deepEqual(await a.aktiveSperren(), []);
    await a.pruefe('lena@example.org', '203.0.113.7');
  });
});
