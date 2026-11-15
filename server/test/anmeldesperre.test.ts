/** Anmeldeschutz (#240): Sperre je Konto+IP und je IP, dauerhaft, Ausnahmen, Neustart, Entsperren. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Anmeldesperre, ipv6Netz64, KONTO_GESAMT, leseSperrEinstellung, pruefeSperrEinstellung, sammelText, SPERRE_STANDARD } from '../src/anmeldesperre';
import { speicherEinstellungen } from '../src/einstellungen';
import { Fachfehler } from '../src/fehler';
import { speicherKurzzustand } from '../src/kurzzustand';
import { mailText } from '../src/mail';

const gesperrt = (p: Promise<unknown>) => assert.rejects(p, (e) => e instanceof Fachfehler && e.status === 429);

describe('Anmeldeschutz (#240)', () => {
  it('sperrt je Konto und IP nach der eingestellten Zahl, für die eingestellte Zeit', async () => {
    let t = 0;
    const s = new Anmeldesperre(speicherEinstellungen(), undefined, () => t);
    await s.speichere({ konto: { versuche: 3, minuten: 10 } }, 'test');
    for (let i = 0; i < 3; i++) await s.fehlschlag('a@x.example', '1.2.3.4');
    await gesperrt(s.pruefe('a@x.example', '1.2.3.4'));
    await s.pruefe('b@x.example', '1.2.3.4');
    await s.pruefe('a@x.example', '5.6.7.8');
    t += 11 * 60_000;
    await s.pruefe('a@x.example', '1.2.3.4');
  });

  it('sperrt eine IP über alle Adressen, auch dauerhaft; Entsperren; übersteht einen Neustart', async () => {
    const speicher = speicherEinstellungen();
    // Die Sperren liegen seit #744 im Kurzzustand (Datenbank) – ein Neustart behält ihn.
    const zustand = speicherKurzzustand();
    const mails: string[] = [];
    const s = new Anmeldesperre(speicher, async (b) => { mails.push(mailText(b)); }, Date.now, zustand);
    await s.speichere({ ip: { versuche: 4, minuten: 0 } }, 'test');
    for (let i = 0; i < 4; i++) await s.fehlschlag(`n${i}@x.example`, '::ffff:9.9.9.9');
    await gesperrt(s.pruefe('neu@x.example', '9.9.9.9'));
    const [g] = await s.gesperrt();
    assert.equal(g.ip, '9.9.9.9');
    assert.equal(g.bis, null, 'dauerhaft');
    assert.equal(mails.length, 0, 'im Standard keine Mail (#368)');
    const nachNeustart = new Anmeldesperre(speicher, undefined, Date.now, zustand);
    await gesperrt(nachNeustart.pruefe('neu@x.example', '9.9.9.9'));
    assert.equal(await nachNeustart.entsperre('9.9.9.9', 'admin'), true);
    await nachNeustart.pruefe('neu@x.example', '9.9.9.9');
  });

  it('Ausnahmen werden nie gesperrt; Einstellungen werden geprüft', async () => {
    const s = new Anmeldesperre();
    await s.speichere({ ip: { versuche: 2, minuten: 5 }, konto: { versuche: 2, minuten: 5 }, ausnahmen: '192.168.0.0/16, 10.0.0.7' }, 'test');
    for (let i = 0; i < 5; i++) await s.fehlschlag('a@x.example', '192.168.1.20');
    await s.pruefe('a@x.example', '192.168.1.20');
    assert.deepEqual(await s.gesperrt(), []);
    assert.throws(() => pruefeSperrEinstellung({ ausnahmen: 'kein-netz' }, SPERRE_STANDARD), (e) => e instanceof Fachfehler && e.status === 422);
    assert.throws(() => pruefeSperrEinstellung({ konto: { minuten: 0 } }, SPERRE_STANDARD), (e) => e instanceof Fachfehler);
    assert.equal(pruefeSperrEinstellung({ ip: { minuten: 0 } }, SPERRE_STANDARD).ip.minuten, 0);
  });

  it('erfolgreiche Anmeldung setzt die Zähler zurück', async () => {
    const s = new Anmeldesperre();
    await s.speichere({ konto: { versuche: 2, minuten: 5 } }, 'test');
    await s.fehlschlag('a@x.example', '1.1.1.1');
    await s.erfolg('a@x.example', '1.1.1.1');
    await s.fehlschlag('a@x.example', '1.1.1.1');
    await s.pruefe('a@x.example', '1.1.1.1');
  });
});

describe('Anmeldeschutz über viele Adressen (#1295)', () => {
  it('IPv6 zählt je /64', async () => {
    assert.equal(ipv6Netz64('2001:db8:1:2:aaaa:bbbb:cccc:dddd'), '2001:db8:1:2::/64');
    assert.equal(ipv6Netz64('2001:0db8:0001:0002::1'), '2001:db8:1:2::/64');
    assert.equal(ipv6Netz64('2001:db8::1'), '2001:db8:0:0::/64');
    assert.equal(ipv6Netz64('::1'), '0:0:0:0::/64');
    assert.equal(ipv6Netz64('fe80::1%eth0'), 'fe80:0:0:0::/64');
    assert.equal(ipv6Netz64('1.2.3.4'), null);
    const s = new Anmeldesperre();
    await s.speichere({ konto: { versuche: 3, minuten: 10 }, ip: { versuche: 5, minuten: 10 } }, 'test');
    // Jede Anfrage von einer anderen Adresse aus demselben /64: zählt wie eine Adresse.
    for (let i = 1; i <= 3; i++) await s.fehlschlag('a@x.example', `2001:db8:1:2::${i}`);
    await gesperrt(s.pruefe('a@x.example', '2001:db8:1:2::99'));
    await s.pruefe('a@x.example', '2001:db8:1:3::1');
    for (let i = 4; i <= 5; i++) await s.fehlschlag(`n${i}@x.example`, `2001:db8:1:2::${i}`);
    await gesperrt(s.pruefe('neu@x.example', '2001:db8:1:2:ffff::1'));
    assert.equal((await s.gesperrt())[0].ip, '2001:db8:1:2::/64');
    // Entsperren mit der Angabe aus der Liste oder mit einer Adresse daraus.
    assert.equal(await s.entsperre('2001:db8:1:2::/64', 'admin'), true);
    await s.pruefe('neu@x.example', '2001:db8:1:2::7');
  });

  it('bremst ein Konto bei Fehlversuchen von vielen Adressen – auch für unbekannte Konten gleich', async () => {
    let t = 0;
    const s = new Anmeldesperre(speicherEinstellungen(), undefined, () => t);
    const fremd = (i: number) => `198.51.${Math.floor(i / 250)}.${i % 250}`;
    for (const email of ['lena@x.example', 'gibt-es-nicht@x.example']) {
      for (let i = 0; i < KONTO_GESAMT.versuche; i++) { const v = await s.versuch(email, fremd(i)); await s.fehlschlag(email, fremd(i), false, v); }
      // Auch eine neue Adresse kommt für dieses Konto nicht weiter – andere Konten schon.
      await gesperrt(s.pruefe(email, '203.0.113.9'));
      await gesperrt(s.versuch(email, '203.0.113.10'));
    }
    await s.pruefe('jonas@x.example', '203.0.113.9');
    // Das Laufwerk (nur API-Schlüssel) bleibt frei, sonst legte ein Fremder es mit falschen Passwörtern still.
    await s.pruefe('lena@x.example', '203.0.113.9', { kontoBremse: false });
    // Eine erfolgreiche Anmeldung ohne vorab gezählten Versuch (z. B. WebDAV mit Schlüssel) setzt die Bremse nicht zurück.
    for (let i = 0; i < 5; i++) await s.erfolg('lena@x.example', '203.0.113.11');
    await gesperrt(s.pruefe('lena@x.example', '203.0.113.12'));
    t += KONTO_GESAMT.minuten * 60_000 + 1;
    await s.pruefe('lena@x.example', '203.0.113.12');
  });

  it('erfolgreiche Anmeldungen verbrauchen die Bremse nicht; Ausnahmen bleiben frei', async () => {
    const s = new Anmeldesperre();
    await s.speichere({ ausnahmen: '192.168.0.0/16' }, 'test');
    for (let i = 0; i < KONTO_GESAMT.versuche + 5; i++) { const v = await s.versuch('lena@x.example', `203.0.113.${i}`); await s.erfolg('lena@x.example', `203.0.113.${i}`, v); }
    await s.pruefe('lena@x.example', '203.0.113.200');
    for (let i = 0; i < KONTO_GESAMT.versuche; i++) { const v = await s.versuch('lena@x.example', `198.51.100.${i}`); await s.fehlschlag('lena@x.example', `198.51.100.${i}`, true, v); }
    await gesperrt(s.pruefe('lena@x.example', '198.51.100.250'));
    await s.pruefe('lena@x.example', '192.168.1.20');
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
    const s = new Anmeldesperre(speicher, async (betreff, text) => { mails.push({ betreff: mailText(betreff), text: mailText(text) }); }, () => t);
    await s.speichere({ ip: { versuche: 2, minuten: 60 }, mail: true }, 'admin');
    for (let i = 1; i <= 7; i++) for (let k = 0; k < 2; k++) await s.fehlschlag(`x${k}@x.example`, `203.0.113.${i}`);
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
    for (let k = 0; k < 2; k++) await s.fehlschlag('y@x.example', '198.51.100.1');
    assert.equal(await s.meldeTaeglich(), false);
    t = start + 2 * TAG;
    assert.equal(await s.meldeTaeglich(), true);
    assert.equal(mails.length, 2);
    assert.match(mails[1].betreff, /eine IP-Adresse/);
    t = start + 3 * TAG;
    assert.equal(await s.meldeTaeglich(), false, 'ohne Sperre keine Mail');
  });

  it('#678: ob gemeldet wird, entscheidet die Automatisierung – vorgemerkt wird immer', async () => {
    let t = start;
    const mails: string[] = [];
    const s = new Anmeldesperre(speicherEinstellungen(), async (b) => { mails.push(mailText(b)); }, () => t);
    await s.speichere({ ip: { versuche: 1, minuten: 60 }, konto: { versuche: 1, minuten: 5 } }, 'admin');
    await s.fehlschlag('a@x.example', '203.0.113.9', true);
    assert.deepEqual(mails, [], 'keine Sofortmeldung vom Kern');
    t += 2 * TAG;
    assert.equal(await s.meldeTaeglich(true), true, 'Probelauf: es gäbe etwas zu melden');
    assert.deepEqual(mails, [], 'Probelauf schickt nichts');
    assert.equal(await s.meldeTaeglich(), true);
    assert.equal(mails.length, 1);
  });

  it('Kontosperre melden (Dann-Karte, #678): je Konto einmal am Tag', async () => {
    let t = start;
    const mails: string[] = [];
    const s = new Anmeldesperre(speicherEinstellungen(), async (b) => { mails.push(mailText(b)); }, () => t);
    assert.equal(await s.kontoMelden('anna@x.example', '203.0.113.1', 5), true);
    assert.equal(mails.length, 1);
    assert.match(mails[0], /Benutzerkonto/);
    assert.equal(await s.kontoMelden('anna@x.example', '203.0.113.2', 5), false, 'am selben Tag nicht noch einmal');
    assert.equal(await s.kontoMelden('ben@x.example', '203.0.113.2', 5), true, 'anderes Konto schon');
    t += TAG;
    assert.equal(await s.kontoMelden('anna@x.example', '203.0.113.3', 5), true);
    assert.equal(mails.length, 3);
  });

  it('Sammeltext nennt Zeitraum, Konten und den Weg zum Entsperren', () => {
    const { betreff, text } = sammelText([
      { tag: '2026-11-01', art: 'ip', wer: '203.0.113.1', versuche: 30 },
      { tag: '2026-11-02', art: 'konto', wer: 'anna@x.example', versuche: 5 },
      { tag: '2026-11-02', art: 'konto', wer: 'anna@x.example', versuche: 5 },
    ]);
    assert.match(betreff, /eine IP-Adresse und ein Benutzerkonto/);
    assert.match(text, /Vom 01\.11\.2026 bis 02\.11\.2026/);
    assert.match(text, /anna@x\.example \(2×\)/);
    assert.match(text, /Werkbank → Anmeldeschutz/);
  });
});
