/** Anmeldeschutz (#240): Sperre je Konto+IP und je IP, dauerhaft, Ausnahmen, Neustart, Entsperren. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Anmeldesperre, pruefeSperrEinstellung, SPERRE_STANDARD } from '../src/anmeldesperre';
import { speicherEinstellungen } from '../src/einstellungen';
import { Fachfehler } from '../src/fehler';

const gesperrt = (p: Promise<unknown>) => assert.rejects(p, (e) => e instanceof Fachfehler && e.status === 429);

describe('Anmeldeschutz (#240)', () => {
  it('sperrt je Konto und IP nach der eingestellten Zahl, für die eingestellte Zeit', async () => {
    let t = 0;
    const s = new Anmeldesperre(speicherEinstellungen(), undefined, () => t);
    await s.speichere({ konto: { versuche: 3, minuten: 10 } }, 'test');
    for (let i = 0; i < 3; i++) await s.fehlschlag('a@x.de', '1.2.3.4');
    await gesperrt(s.pruefe('a@x.de', '1.2.3.4'));
    await s.pruefe('b@x.de', '1.2.3.4');
    await s.pruefe('a@x.de', '5.6.7.8');
    t += 11 * 60_000;
    await s.pruefe('a@x.de', '1.2.3.4');
  });

  it('sperrt eine IP über alle Adressen, auch dauerhaft; Entsperren; übersteht einen Neustart', async () => {
    const speicher = speicherEinstellungen();
    const mails: string[] = [];
    const s = new Anmeldesperre(speicher, async (b) => { mails.push(b); });
    await s.speichere({ ip: { versuche: 4, minuten: 0 } }, 'test');
    for (let i = 0; i < 4; i++) await s.fehlschlag(`n${i}@x.de`, '::ffff:9.9.9.9');
    await gesperrt(s.pruefe('neu@x.de', '9.9.9.9'));
    const [g] = await s.gesperrt();
    assert.equal(g.ip, '9.9.9.9');
    assert.equal(g.bis, null, 'dauerhaft');
    assert.equal(mails.length, 1);
    const nachNeustart = new Anmeldesperre(speicher);
    await gesperrt(nachNeustart.pruefe('neu@x.de', '9.9.9.9'));
    assert.equal(await nachNeustart.entsperre('9.9.9.9', 'admin'), true);
    await nachNeustart.pruefe('neu@x.de', '9.9.9.9');
  });

  it('Ausnahmen werden nie gesperrt; Einstellungen werden geprüft', async () => {
    const s = new Anmeldesperre();
    await s.speichere({ ip: { versuche: 2, minuten: 5 }, konto: { versuche: 2, minuten: 5 }, ausnahmen: '192.168.0.0/16, 10.0.0.7' }, 'test');
    for (let i = 0; i < 5; i++) await s.fehlschlag('a@x.de', '192.168.1.20');
    await s.pruefe('a@x.de', '192.168.1.20');
    assert.deepEqual(await s.gesperrt(), []);
    assert.throws(() => pruefeSperrEinstellung({ ausnahmen: 'kein-netz' }, SPERRE_STANDARD), (e) => e instanceof Fachfehler && e.status === 422);
    assert.throws(() => pruefeSperrEinstellung({ konto: { minuten: 0 } }, SPERRE_STANDARD), (e) => e instanceof Fachfehler);
    assert.equal(pruefeSperrEinstellung({ ip: { minuten: 0 } }, SPERRE_STANDARD).ip.minuten, 0);
  });

  it('erfolgreiche Anmeldung setzt die Zähler zurück', async () => {
    const s = new Anmeldesperre();
    await s.speichere({ konto: { versuche: 2, minuten: 5 } }, 'test');
    await s.fehlschlag('a@x.de', '1.1.1.1');
    await s.erfolg('a@x.de', '1.1.1.1');
    await s.fehlschlag('a@x.de', '1.1.1.1');
    await s.pruefe('a@x.de', '1.1.1.1');
  });
});
