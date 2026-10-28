/**
 * E-Mail-Versand und Adresse des DMS in der Werkbank (#37) – mit einem kleinen SMTP-Server im Test.
 */
import assert from 'node:assert/strict';
import { createServer, type AddressInfo, type Server } from 'node:net';
import { after, before, describe, it } from 'node:test';
import { Betrieb, pruefeAdresse, speicherBetrieb } from '../src/betrieb';
import { Fachfehler } from '../src/fehler';
import { Konten } from '../src/konten';
import { speicherKontoRepo } from '../src/konto-repo';
import { kontext } from '../src/protokoll';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Tresor } from '../src/tresor';

/** Tresor mit eigener Schlüsseldatei in einem frischen Ordner. */
async function tresorMit(schluessel: boolean, speicher = speicherBetrieb()) {
  const t = new Tresor(speicher, join(await mkdtemp(join(tmpdir(), 'dms-tresor-')), 'geheim', 'dms.schluessel'), () => null);
  await t.laden();
  if (schluessel) await t.erzeuge();
  return t;
}

/** Minimaler SMTP-Server: nimmt alles an, merkt sich die Mails; optional mit Anmeldung. */
function smtpServer(opt: { passwort?: string } = {}) {
  const mails: Array<{ von: string; an: string[]; daten: string }> = [];
  const server: Server = createServer((s) => {
    let von = ''; let an: string[] = []; let daten = ''; let inDaten = false; let rest = '';
    const sag = (z: string) => s.write(`${z}\r\n`);
    sag('220 test ESMTP');
    s.on('data', (buf) => {
      rest += buf.toString('utf8');
      let i;
      while ((i = rest.indexOf('\r\n')) >= 0) {
        const zeile = rest.slice(0, i); rest = rest.slice(i + 2);
        if (inDaten) {
          if (zeile === '.') { inDaten = false; mails.push({ von, an, daten }); sag('250 OK'); } else daten += `${zeile}\n`;
          continue;
        }
        const cmd = zeile.slice(0, 4).toUpperCase();
        if (cmd === 'EHLO') { s.write('250-test\r\n'); sag(opt.passwort ? '250 AUTH PLAIN' : '250 OK'); }
        else if (cmd === 'HELO') sag('250 OK');
        else if (cmd === 'AUTH') {
          const teile = Buffer.from(zeile.split(' ')[2] ?? '', 'base64').toString().split('\0');
          sag(teile[2] === opt.passwort ? '235 OK' : '535 Authentication failed');
        }
        else if (cmd === 'MAIL') { von = zeile; an = []; daten = ''; sag('250 OK'); }
        else if (cmd === 'RCPT') { an.push(zeile); sag('250 OK'); }
        else if (cmd === 'DATA') { inDaten = true; sag('354 weiter'); }
        else if (cmd === 'QUIT') { sag('221 tschüss'); s.end(); }
        else if (cmd === 'RSET' || cmd === 'NOOP') sag('250 OK');
        else sag('502 unbekannt');
      }
    });
    s.on('error', () => {});
  });
  return { mails, server, start: () => new Promise<number>((r) => server.listen(0, '127.0.0.1', () => r((server.address() as AddressInfo).port))) };
}

const ohneAnmeldung = (port: number) => ({ aktiv: true, host: '127.0.0.1', port, verbindung: 'keine', benutzer: '', absender: 'DMS <dms@example.org>' });

describe('Adresse des DMS', () => {
  it('normalisiert und prüft Adressen', () => {
    assert.equal(pruefeAdresse('nas.local:8080'), 'http://nas.local:8080');
    assert.equal(pruefeAdresse('https://dms.example.org/'), 'https://dms.example.org');
    assert.equal(pruefeAdresse('https://example.org/dms//'), 'https://example.org/dms');
    assert.equal(pruefeAdresse('  '), '');
    assert.throws(() => pruefeAdresse('ftp://x'), Fachfehler);
    assert.throws(() => pruefeAdresse('http://x/?a=1'), Fachfehler);
  });

  it('nimmt ohne gepflegte Adresse die der Anfrage, mit gepflegter diese', async () => {
    const b = new Betrieb(speicherBetrieb(), 'http://localhost:3000');
    await b.laden();
    assert.equal(b.adresseFuerLinks(), 'http://localhost:3000');
    const imKontext = <T>(f: () => T) => kontext.run({ anfrage: 'x', db: { anzahl: 0, ms: 0 }, ursprung: 'https://dms.example.org' }, f);
    assert.equal(imKontext(() => b.adresseFuerLinks()), 'https://dms.example.org');
    assert.equal(imKontext(() => b.cookieNurHttps()), true);
    assert.equal(imKontext(() => b.ansicht().vorschlag), 'https://dms.example.org');
    await b.speichereAdresse('nas:8080');
    assert.equal(imKontext(() => b.adresseFuerLinks()), 'http://nas:8080');
    assert.equal(imKontext(() => b.cookieNurHttps()), false);
  });
});

describe('E-Mail-Versand (#37)', () => {
  const smtp = smtpServer();
  const mitPw = smtpServer({ passwort: 'geheim' });
  let port = 0; let portPw = 0;
  before(async () => { port = await smtp.start(); portPw = await mitPw.start(); });
  after(() => { smtp.server.close(); mitPw.server.close(); });

  it('ist ohne Einstellungen aus, gilt nach dem Speichern sofort und lässt sich abschalten', async () => {
    const b = new Betrieb(speicherBetrieb());
    await b.laden();
    assert.equal(b.mailer(), null);
    const k = new Konten(speicherKontoRepo(), () => b.mailer(), () => 'http://nas:8080');
    assert.equal(k.mailAktiv, false);
    await b.speichereMail(ohneAnmeldung(port));
    assert.equal(k.mailAktiv, true, 'ohne Neustart');
    await k.einrichten({ email: 'admin@example.org', passwort: 'ein-langes-passwort' });
    const r = await k.legeBenutzerAn({ email: 'neu@example.org' });
    assert.equal(r.mailVerschickt, true);
    const mail = smtp.mails.at(-1)!;
    assert.match(mail.an[0], /neu@example\.org/);
    assert.match(mail.daten, /http:\/\/nas:8080\/passwort\//);
    await b.speichereMail({ ...ohneAnmeldung(port), aktiv: false });
    assert.equal(k.mailAktiv, false);
    const ohne = await k.neuerLink(r.benutzer.id);
    assert.equal(ohne.mailVerschickt, false);
    assert.match(ohne.link!, /^http:\/\/nas:8080\/passwort\//);
  });

  it('speichert Passwörter nur mit Schlüssel, verschlüsselt, gibt sie nie heraus und behält sie bei leerem Feld', async () => {
    const speicher = speicherBetrieb();
    const ohneSchluessel = new Betrieb(speicher, undefined, await tresorMit(false));
    await ohneSchluessel.laden();
    assert.equal(ohneSchluessel.ansicht().passwoerterMoeglich, false);
    await assert.rejects(ohneSchluessel.speichereMail({ ...ohneAnmeldung(portPw), benutzer: 'dms', passwort: 'geheim' }), /Schlüssel/);
    assert.equal(await speicher.lies('mail'), null, 'ohne Schlüssel wird nichts gespeichert');
    assert.equal((await ohneSchluessel.pruefeVerbindung({ ...ohneAnmeldung(portPw), benutzer: 'dms', passwort: 'geheim' })).ok, true, 'Prüfen geht auch ohne Schlüssel');

    const t = await tresorMit(true);
    const b = new Betrieb(speicher, undefined, t);
    await b.laden();
    const a = await b.speichereMail({ ...ohneAnmeldung(portPw), verbindung: 'keine', benutzer: 'dms', passwort: 'geheim' });
    assert.equal(a.mail.passwortGesetzt, true);
    assert.equal(a.passwoerterMoeglich, true);
    assert.ok(!JSON.stringify(a).includes('geheim'));
    const gespeichert = ((await speicher.lies('mail')) as { passwort: string }).passwort;
    assert.match(gespeichert, /^dms1\$/, 'verschlüsselt gespeichert');
    assert.ok(!gespeichert.includes('geheim'));
    await b.speichereMail({ ...ohneAnmeldung(portPw), benutzer: 'dms', passwort: '' });
    assert.equal(((await speicher.lies('mail')) as { passwort: string }).passwort, gespeichert, 'leeres Feld behält das Passwort');
    assert.equal((await b.pruefeVerbindung({ ...ohneAnmeldung(portPw), benutzer: 'dms' })).ok, true, 'Prüfen nimmt das gespeicherte Passwort');
    const falsch = await b.pruefeVerbindung({ ...ohneAnmeldung(portPw), benutzer: 'dms', passwort: 'falsch' });
    assert.equal(falsch.ok, false);
    assert.match(falsch.meldung, /Anmeldung abgelehnt/);
    await b.speichereMail({ ...ohneAnmeldung(portPw), benutzer: 'dms', passwortLoeschen: true });
    assert.equal(b.ansicht().mail.passwortGesetzt, false);
  });

  it('verschlüsselt ein Klartext-Passwort aus älteren Ständen, sobald es einen Schlüssel gibt', async () => {
    const speicher = speicherBetrieb();
    await speicher.schreibe('mail', { ...ohneAnmeldung(portPw), aktiv: true, verbindung: 'keine', benutzer: 'dms', passwort: 'geheim' });
    const t = await tresorMit(false);
    const b = new Betrieb(speicher, undefined, t);
    await b.laden();
    assert.equal(b.ansicht().mail.passwortUnverschluesselt, true);
    assert.equal((await t.status()).betroffen.length, 1, 'die Werkbank nennt das Passwort');
    assert.equal((await b.pruefeVerbindung({ ...ohneAnmeldung(portPw), benutzer: 'dms' })).ok, true, 'funktioniert weiter');
    await t.erzeuge();
    const gespeichert = ((await speicher.lies('mail')) as { passwort: string }).passwort;
    assert.match(gespeichert, /^dms1\$/);
    assert.equal(b.ansicht().mail.passwortUnverschluesselt, false);
    assert.deepEqual((await t.status()).betroffen, []);
    assert.equal((await b.pruefeVerbindung({ ...ohneAnmeldung(portPw), benutzer: 'dms' })).ok, true, 'und weiter mit dem entschlüsselten Passwort');
  });

  it('meldet ein Passwort, das mit einem verlorenen Schlüssel verschlüsselt ist', async () => {
    const speicher = speicherBetrieb();
    const t = await tresorMit(true, speicher);
    const b = new Betrieb(speicher, undefined, t);
    await b.laden();
    await b.speichereMail({ ...ohneAnmeldung(portPw), benutzer: 'dms', passwort: 'geheim' });
    // Schlüsseldatei weg: neuer Tresor ohne Datei, aber mit dem Fingerabdruck in den Einstellungen.
    const ohne = new Tresor(speicher, join(await mkdtemp(join(tmpdir(), 'dms-tresor-')), 'weg.schluessel'), () => null);
    await ohne.laden();
    assert.equal(ohne.zustand, 'verloren');
    const b2 = new Betrieb(speicher, undefined, ohne);
    await b2.laden();
    await ohne.erzeuge();
    assert.equal(b2.ansicht().mail.passwortLesbar, false);
    const st = await ohne.status();
    assert.equal(st.zustand, 'vorhanden');
    assert.deepEqual(st.betroffen.map((x) => x.was), ['Passwort des Mailservers']);
    await b2.speichereMail({ ...ohneAnmeldung(portPw), benutzer: 'dms', passwort: 'neu' });
    assert.deepEqual((await ohne.status()).betroffen, []);
  });

  it('prüft die Verbindung und schickt Testmails mit den Werten aus dem Formular', async () => {
    const b = new Betrieb(speicherBetrieb());
    await b.laden();
    assert.equal((await b.pruefeVerbindung(ohneAnmeldung(port))).ok, true);
    const t = await b.sendeTestmail(ohneAnmeldung(port), 'ich@example.org');
    assert.equal(t.ok, true);
    assert.match(smtp.mails.at(-1)!.daten, /Testmail vom DMS/);
    assert.equal(b.mailer(), null, 'Prüfen speichert nichts');
    const weg = await b.pruefeVerbindung({ ...ohneAnmeldung(1), host: '127.0.0.1' });
    assert.equal(weg.ok, false);
    assert.match(weg.meldung, /Verbindung|Server/);
    await assert.rejects(b.sendeTestmail(ohneAnmeldung(port), 'keine-adresse'), Fachfehler);
  });

  it('prüft Eingaben', async () => {
    const b = new Betrieb(speicherBetrieb());
    await b.laden();
    await assert.rejects(b.speichereMail({ aktiv: true, host: '' }), /Server/);
    await assert.rejects(b.speichereMail({ host: 'smtp.example.org', port: 70000 }), /Port/);
    await assert.rejects(b.speichereMail({ host: 'smtp example', port: 587 }), /Rechnername/);
    await assert.rejects(b.speichereMail({ host: 'smtp.example.org', absender: 'kein absender' }), /Absender/);
  });

  it('übernimmt frühere Umgebungsvariablen einmalig', async () => {
    const speicher = speicherBetrieb();
    const b = new Betrieb(speicher);
    await b.laden();
    await b.uebernimmAlteVariablen({ SMTP_HOST: 'smtp.example.org', SMTP_PORT: '465', SMTP_USER: 'dms', SMTP_PASS: 'pw', SMTP_FROM: 'dms@example.org', APP_URL: 'https://dms.example.org/' });
    const a = b.ansicht();
    assert.deepEqual([a.mail.aktiv, a.mail.host, a.mail.port, a.mail.verbindung, a.mail.passwortGesetzt, a.adresse], [true, 'smtp.example.org', 465, 'ssl', true, 'https://dms.example.org']);
    await b.speichereMail({ ...a.mail, aktiv: false });
    await b.uebernimmAlteVariablen({ SMTP_HOST: 'anderer.example.org', APP_URL: 'http://anders' });
    assert.equal(b.ansicht().mail.host, 'smtp.example.org', 'nur einmal');
    assert.equal(b.ansicht().mail.aktiv, false);
    assert.equal(b.ansicht().adresse, 'https://dms.example.org');
    const neu = new Betrieb(speicher);
    await neu.laden();
    assert.equal(neu.ansicht().mail.host, 'smtp.example.org', 'gespeichert');
  });
});
