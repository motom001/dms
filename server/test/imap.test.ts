/**
 * Postfächer gegen einen echten IMAP-Server (#196): GreenMail in der CI (IMAP_TEST_HOST, SMTP 3025, IMAP 3143).
 * Ohne IMAP_TEST_HOST übersprungen; die Abläufe ohne Server prüft postfach.test.ts.
 */
import assert from 'node:assert/strict';
import { connect } from 'node:net';
import { describe, it } from 'node:test';
import { POST_KANAL } from '../../shared/src/model';
import { speicherDateien } from '../src/dateispeicher';
import { Dienst } from '../src/dienst';
import { speicherEinstellungen } from '../src/einstellungen';
import { Konten } from '../src/konten';
import { speicherKontoRepo } from '../src/konto-repo';
import { speicherRepo } from '../src/repo-speicher';

const HOST = process.env.IMAP_TEST_HOST;

const offen = (port: number) => new Promise<boolean>((ok) => { const s = connect(port, HOST!, () => { s.end(); ok(true); }); s.on('error', () => ok(false)); });

describe('Postfächer mit GreenMail (#196)', { skip: HOST ? false : 'IMAP_TEST_HOST nicht gesetzt' }, () => {
  it('holt Mails ab, übernimmt Anhänge, verschiebt; meldet falsches Passwort und fehlenden Server', async () => {
    for (let i = 0; i < 60 && !(await offen(3143)); i++) await new Promise((r) => setTimeout(r, 1000));
    const { verbindeImap, liesMail } = await import('../src/imap');
    const { Postfaecher } = await import('../src/postfach');
    const nodemailer = (await import('nodemailer')).default;
    const smtp = nodemailer.createTransport({ host: HOST, port: 3025, secure: false, ignoreTLS: true });
    await smtp.sendMail({ from: 'Stadtwerke <rechnung@stadtwerke.de>', to: 'dms@dms.test', subject: 'Rechnung Oktober', text: 'Anbei die Rechnung.',
      attachments: [{ filename: 'Rechnung.pdf', content: Buffer.from('%PDF-1.4 Rechnung'), contentType: 'application/pdf' }] });
    await smtp.sendMail({ from: 'werbung@shop.de', to: 'dms@dms.test', subject: 'Angebot', html: '<p>Nur <b>heute</b></p>' });

    const d = new Dienst(speicherRepo(), speicherDateien(), { einstellungen: speicherEinstellungen() });
    const konten = new Konten(speicherKontoRepo(), null, 'http://nas', d.benutzerspiegel());
    await konten.einrichten({ email: 'anna@example.org', name: 'Anna', passwort: 'ein-langes-passwort' });
    await d.gleicheBenutzerAb(await konten.listeBenutzer());
    const pf = new Postfaecher({ dienst: d, einstellungen: speicherEinstellungen(), verbinde: verbindeImap, lies: liesMail, verschluessele: (k) => k, entschluessele: (w) => w });
    const zugang = { name: 'Test', server: HOST, port: 3143, verschluesselung: 'keine', unverschluesseltBestaetigt: true, benutzer: 'dms', passwort: 'geheim', absender: 'stadtwerke.de' };
    assert.match((await pf.teste(zugang, null)).text, /Verbunden/);
    assert.match((await pf.teste({ ...zugang, passwort: 'falsch' }, null)).text, /Anmeldung abgelehnt/);
    assert.match((await pf.teste({ ...zugang, port: 1 }, null)).text, /nicht erreichbar/);

    const [p] = await pf.speichere(zugang, null, 'test');
    assert.equal(await pf.abrufen(p.id), 1, 'nur die Mail der Stadtwerke');
    const post = await d.postTyp();
    const [m] = await d.listeMappen(post.id);
    assert.equal(m.werte.kanal, POST_KANAL.email);
    assert.equal(m.werte.betreff, 'Rechnung Oktober');
    assert.match(String(m.werte.absender), /rechnung@stadtwerke\.de/);
    assert.deepEqual((await d.holeMappe(m.id)).dokumente.map((x) => x.name).sort(), ['Rechnung Oktober.eml', 'Rechnung.pdf']);
    assert.equal(await pf.abrufen(p.id), 0, 'keine Doppelten');

    const s = await verbindeImap({ server: HOST!, port: 3143, verschluesselung: 'keine', benutzer: 'dms', passwort: 'geheim' }, 'DMS');
    try { assert.equal(s.anzahl, 1, 'in den Ordner DMS verschoben'); } finally { await s.schliessen(); }
    const html = await liesMail(Buffer.from('From: a@b.de\r\nSubject: X\r\nContent-Type: text/html\r\n\r\n<p>Nur <b>heute</b><img src="https://tracker.example/x.gif"></p>'));
    assert.match(html.text, /Nur heute/);
    assert.doesNotMatch(html.text, /tracker/);
  });
});
