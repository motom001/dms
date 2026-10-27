import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Fachfehler } from '../src/fehler';
import { Konten } from '../src/konten';
import { speicherKontoRepo } from '../src/konto-repo';
import type { Mailer } from '../src/mail';

const wirft = (p: Promise<unknown>, status: number) => assert.rejects(p, (e: unknown) => e instanceof Fachfehler && e.status === status);
const linkSchluessel = (link: string) => link.split('/passwort/')[1];

function postfach() {
  const mails: Array<{ an: string; betreff: string; text: string }> = [];
  const mailer: Mailer = { async sende(an, betreff, text) { mails.push({ an, betreff, text }); } };
  return { mails, mailer };
}

describe('Konten', () => {
  it('erlaubt die Einrichtung genau einmal', async () => {
    const k = new Konten(speicherKontoRepo(), null, 'http://nas:3000');
    assert.equal(await k.einrichtungNoetig(), true);
    await wirft(k.einrichten({ email: 'admin@example.org', passwort: 'kurz' }), 422);
    const { benutzer, schluessel } = await k.einrichten({ email: 'admin@example.org', name: 'Thomas', passwort: 'ein-langes-passwort' });
    assert.equal(benutzer.rolle, 'admin');
    assert.equal((await k.benutzerZu(schluessel))?.id, benutzer.id);
    await wirft(k.einrichten({ email: 'zweiter@example.org', passwort: 'ein-langes-passwort' }), 409);
  });

  it('meldet an, bremst Fehlversuche und meldet ab', async () => {
    const k = new Konten(speicherKontoRepo(), null, 'http://nas:3000');
    await k.einrichten({ email: 'admin@example.org', passwort: 'ein-langes-passwort' });
    await wirft(k.anmelden({ email: 'admin@example.org', passwort: 'falsch-falsch' }, '1.2.3.4'), 401);
    const { schluessel } = await k.anmelden({ email: 'ADMIN@example.org', passwort: 'ein-langes-passwort' }, '1.2.3.4');
    assert.ok(await k.benutzerZu(schluessel));
    await k.abmelden(schluessel);
    assert.equal(await k.benutzerZu(schluessel), undefined);
    for (let i = 0; i < 5; i++) await wirft(k.anmelden({ email: 'admin@example.org', passwort: 'falsch-falsch' }, '9.9.9.9'), 401);
    await wirft(k.anmelden({ email: 'admin@example.org', passwort: 'ein-langes-passwort' }, '9.9.9.9'), 429);
  });

  it('lädt ohne Mailserver per Link ein, der genau einmal funktioniert', async () => {
    const k = new Konten(speicherKontoRepo(), null, 'http://nas:3000/');
    await k.einrichten({ email: 'admin@example.org', passwort: 'ein-langes-passwort' });
    const r = await k.legeBenutzerAn({ email: 'sabine@example.org', name: 'Sabine', rolle: 'mitglied' });
    assert.equal(r.mailVerschickt, false);
    assert.match(r.link!, /^http:\/\/nas:3000\/passwort\/[\w-]{40,}$/);
    await wirft(k.legeBenutzerAn({ email: 'SABINE@example.org' }), 409);
    await wirft(k.anmelden({ email: 'sabine@example.org', passwort: 'irgendwas-langes' }, 'x'), 401);
    const s = linkSchluessel(r.link!);
    assert.equal((await k.linkPruefen(s)).zweck, 'einladung');
    const gesetzt = await k.passwortSetzen({ schluessel: s, passwort: 'sabines-passwort' });
    assert.equal(gesetzt.benutzer.hatPasswort, true);
    await wirft(k.passwortSetzen({ schluessel: s, passwort: 'noch-ein-passwort' }), 410);
    assert.ok(await k.anmelden({ email: 'sabine@example.org', passwort: 'sabines-passwort' }, 'x'));
  });

  it('verschickt Einladung und Passwort-vergessen per Mail', async () => {
    const { mails, mailer } = postfach();
    const k = new Konten(speicherKontoRepo(), mailer, 'http://nas:3000');
    await k.einrichten({ email: 'admin@example.org', passwort: 'ein-langes-passwort' });
    const r = await k.legeBenutzerAn({ email: 'sabine@example.org', name: 'Sabine' });
    assert.equal(r.mailVerschickt, true);
    assert.equal(r.link, undefined);
    assert.equal(mails[0].an, 'sabine@example.org');
    assert.match(mails[0].text, /Anmeldung mit: sabine@example.org/);

    await k.passwortVergessen({ email: 'gibt-es-nicht@example.org' });
    assert.equal(mails.length, 1);
    await k.passwortVergessen({ email: 'admin@example.org' });
    assert.equal(mails.length, 2);
    assert.match(mails[1].betreff, /zurücksetzen/);
    const s = mails[1].text.match(/passwort\/([\w-]+)/)![1];
    await k.passwortSetzen({ schluessel: s, passwort: 'ganz-neues-passwort' });
    await wirft(k.anmelden({ email: 'admin@example.org', passwort: 'ein-langes-passwort' }, 'y'), 401);
  });

  it('schützt den letzten Administrator und deaktiviert Sitzungen', async () => {
    const k = new Konten(speicherKontoRepo(), null, 'http://nas:3000');
    const { benutzer: admin } = await k.einrichten({ email: 'admin@example.org', passwort: 'ein-langes-passwort' });
    await wirft(k.aendereBenutzer(admin, admin.id, { rolle: 'mitglied' }), 409);
    await wirft(k.loescheBenutzer(admin, admin.id), 409);
    const r = await k.legeBenutzerAn({ email: 'b@example.org', rolle: 'mitglied' });
    const { schluessel } = await k.passwortSetzen({ schluessel: linkSchluessel(r.link!), passwort: 'passwort-von-b' });
    assert.ok(await k.benutzerZu(schluessel));
    await k.aendereBenutzer(admin, r.benutzer.id, { aktiv: false });
    assert.equal(await k.benutzerZu(schluessel), undefined);
    await k.aendereBenutzer(admin, r.benutzer.id, { aktiv: true, rolle: 'admin' });
    await k.aendereBenutzer(admin, admin.id, { rolle: 'mitglied' }); // jetzt gibt es einen anderen Admin
  });
});
