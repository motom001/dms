/** Anmeldeschutz (#240): Sperre je Konto+IP und je IP, dauerhaft, Ausnahmen, Neustart, Entsperren. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Anmeldesperre, leseSperrEinstellung, pruefeSperrEinstellung, sammelText, SPERRE_STANDARD } from '../src/anmeldesperre';
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
    assert.equal(mails.length, 0, 'im Standard keine Mail (#368)');
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

describe('Anmeldeschutz: Mails (#368)', () => {
  const TAG = 24 * 60 * 60_000;
  const start = Date.parse('2026-11-02T10:00:00Z');

  it('Standard aus; bestehende Installationen ohne eigene Wahl bekommen den neuen Standard', async () => {
    assert.equal(SPERRE_STANDARD.mail, false);
    assert.equal(SPERRE_STANDARD.mailKonto, false);
    // Bis 0.84.7 schrieb die Werkbank immer mail: true mit – das gilt nicht als eigene Wahl.
    assert.equal(leseSperrEinstellung({ konto: { versuche: 5, minuten: 1 }, ip: { versuche: 30, minuten: 60 }, ausnahmen: [], mail: true }).e.mail, false);
    assert.equal(leseSperrEinstellung(null).e.mail, false);
    assert.equal(leseSperrEinstellung({ mail: true, mailGewaehlt: true }).e.mail, true, 'ausdrücklich eingeschaltet bleibt an');
  });

  it('nur ein umgelegter Schalter wird als eigene Wahl gespeichert', async () => {
    const speicher = speicherEinstellungen();
    const s = new Anmeldesperre(speicher);
    await s.speichere({ ...SPERRE_STANDARD, ausnahmen: ['10.0.0.0/8'] }, 'admin');
    assert.equal(((await speicher.lies('anmeldesperre')) as { mailGewaehlt?: boolean }).mailGewaehlt, undefined, 'Standard bestätigt');
    await s.speichere({ mail: true }, 'admin');
    assert.equal(((await speicher.lies('anmeldesperre')) as { mailGewaehlt?: boolean }).mailGewaehlt, true);
    assert.equal((await new Anmeldesperre(speicher).einstellung()).mail, true, 'übersteht einen Neustart');
  });

  it('eingeschaltet: höchstens eine Sammelmeldung am Tag, über die Sperren des Vortags', async () => {
    let t = start;
    const speicher = speicherEinstellungen();
    const mails: { betreff: string; text: string }[] = [];
    const s = new Anmeldesperre(speicher, async (betreff, text) => { mails.push({ betreff, text }); }, () => t);
    await s.speichere({ ip: { versuche: 2, minuten: 60 }, mail: true }, 'admin');
    for (let i = 1; i <= 7; i++) for (let k = 0; k < 2; k++) await s.fehlschlag(`x${k}@x.de`, `203.0.113.${i}`);
    assert.equal((await s.gesperrt()).length, 7);
    assert.equal(mails.length, 0, 'keine Mail je Sperre');
    assert.equal(await s.meldeTaeglich(), false, 'am selben Tag noch nichts');
    t = start + TAG;
    assert.equal(await s.meldeTaeglich(), true);
    assert.equal(await s.meldeTaeglich(), false, 'nur eine am Tag');
    assert.equal(mails.length, 1);
    assert.match(mails[0].betreff, /7 IP-Adressen/);
    assert.match(mails[0].text, /Die fünf mit den meisten Fehlversuchen/);
    assert.equal(mails[0].text.split('\n').filter((z) => z.startsWith('- 203.0.113.')).length, 5);
    // Neue Sperren am selben Tag warten bis morgen.
    for (let k = 0; k < 2; k++) await s.fehlschlag('y@x.de', '198.51.100.1');
    assert.equal(await s.meldeTaeglich(), false);
    t = start + 2 * TAG;
    assert.equal(await s.meldeTaeglich(), true);
    assert.equal(mails.length, 2);
    assert.match(mails[1].betreff, /eine IP-Adresse/);
    t = start + 3 * TAG;
    assert.equal(await s.meldeTaeglich(), false, 'ohne Sperre keine Mail');
  });

  it('ausgeschaltet: keine Mail, auch nicht am nächsten Tag', async () => {
    let t = start;
    const mails: string[] = [];
    const s = new Anmeldesperre(speicherEinstellungen(), async (b) => { mails.push(b); }, () => t);
    await s.speichere({ ip: { versuche: 1, minuten: 60 }, konto: { versuche: 1, minuten: 5 } }, 'admin');
    await s.fehlschlag('a@x.de', '203.0.113.9', true);
    t += 2 * TAG;
    assert.equal(await s.meldeTaeglich(), false);
    assert.deepEqual(mails, []);
  });

  it('wahlweise sofort bei Sperre eines bestehenden Kontos, je Konto einmal am Tag', async () => {
    let t = start;
    const mails: string[] = [];
    const s = new Anmeldesperre(speicherEinstellungen(), async (b) => { mails.push(b); }, () => t);
    await s.speichere({ konto: { versuche: 2, minuten: 1 }, mailKonto: true }, 'admin');
    for (let k = 0; k < 2; k++) await s.fehlschlag('fremd@x.de', '203.0.113.1', false);
    assert.equal(mails.length, 0, 'unbekannte Adresse: keine Mail');
    for (let k = 0; k < 2; k++) await s.fehlschlag('anna@x.de', '203.0.113.1', true);
    assert.equal(mails.length, 1);
    assert.match(mails[0], /Benutzerkonto/);
    for (let k = 0; k < 2; k++) await s.fehlschlag('anna@x.de', '203.0.113.2', true);
    assert.equal(mails.length, 1, 'am selben Tag nicht noch einmal');
    t += TAG;
    for (let k = 0; k < 2; k++) await s.fehlschlag('anna@x.de', '203.0.113.3', true);
    assert.equal(mails.length, 2);
  });

  it('Sammeltext nennt Zeitraum, Konten und den Weg zum Entsperren', () => {
    const { betreff, text } = sammelText([
      { tag: '2026-11-01', art: 'ip', wer: '203.0.113.1', versuche: 30 },
      { tag: '2026-11-02', art: 'konto', wer: 'anna@x.de', versuche: 5 },
      { tag: '2026-11-02', art: 'konto', wer: 'anna@x.de', versuche: 5 },
    ]);
    assert.match(betreff, /eine IP-Adresse und ein Benutzerkonto/);
    assert.match(text, /Vom 01\.11\.2026 bis 02\.11\.2026/);
    assert.match(text, /anna@x\.de \(2×\)/);
    assert.match(text, /Werkbank → Anmeldeschutz/);
  });
});
