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

describe('Profil', () => {
  it('ändert Name, E-Mail und Passwort nur mit dem aktuellen Passwort', async () => {
    const { mails, mailer } = postfach();
    const k = new Konten(speicherKontoRepo(), mailer, 'http://nas:3000');
    const { benutzer: ich, schluessel: alteSitzung } = await k.einrichten({ email: 'admin@example.org', passwort: 'ein-langes-passwort' });
    assert.equal((await k.aendereProfil(ich, { name: 'Thomas' })).name, 'Thomas');
    await wirft(k.aendereEmail(ich, { email: 'neu@example.org', passwort: 'falsch-falsch' }), 403);
    const r = await k.legeBenutzerAn({ email: 'belegt@example.org' });
    assert.ok(r);
    await wirft(k.aendereEmail(ich, { email: 'BELEGT@example.org', passwort: 'ein-langes-passwort' }), 409);
    const neu = await k.aendereEmail(ich, { email: 'neu@example.org', passwort: 'ein-langes-passwort' });
    assert.equal(neu.email, 'neu@example.org');
    assert.equal(mails.at(-1)!.an, 'admin@example.org'); // Hinweis an die alte Adresse

    await wirft(k.aenderePasswort(neu, { passwortAlt: 'falsch-falsch', passwortNeu: 'noch-ein-passwort' }), 403);
    await wirft(k.aenderePasswort(neu, { passwortAlt: 'ein-langes-passwort', passwortNeu: 'kurz' }), 422);
    const p = await k.aenderePasswort(neu, { passwortAlt: 'ein-langes-passwort', passwortNeu: 'noch-ein-passwort' });
    assert.equal(await k.benutzerZu(alteSitzung), undefined); // andere Sitzungen beendet
    assert.ok(await k.benutzerZu(p.schluessel));
    assert.ok(await k.anmelden({ email: 'neu@example.org', passwort: 'noch-ein-passwort' }, 'x'));
    assert.match(mails.at(-1)!.betreff, /Passwort/);
  });
});

describe('Sitzungen und Vertretung', () => {
  async function zwei() {
    const k = new Konten(speicherKontoRepo(), null, 'http://nas:3000');
    const admin = await k.einrichten({ email: 'admin@example.org', name: 'Admin', passwort: 'ein-langes-passwort' }, { ip: '10.0.0.1', geraet: 'Mozilla/5.0 (Windows NT 10.0) Firefox/130.0' });
    const neu = await k.legeBenutzerAn({ email: 'sabine@example.org', name: 'Sabine' });
    const s = await k.passwortSetzen({ schluessel: linkSchluessel(neu.link!), passwort: 'sabines-passwort' }, { ip: '10.0.0.2', geraet: 'Mozilla/5.0 (iPhone) Safari/604.1' });
    return { k, admin, sabine: s };
  }

  it('zeigt Sitzungen mit Gerät und letzter Aktivität und beendet sie gezielt', async () => {
    const { k, sabine } = await zwei();
    const zweite = await k.anmelden({ email: 'sabine@example.org', passwort: 'sabines-passwort' }, '10.0.0.3', 'Mozilla/5.0 (Macintosh; Mac OS X) Chrome/129.0');
    const liste = await k.sitzungenVon(sabine.benutzer.id);
    assert.equal(liste.length, 2);
    assert.ok(liste.every((s) => s.zuletztAktiv && s.geraet && s.ip));
    const benutzer = (await k.listeBenutzer()).find((b) => b.id === sabine.benutzer.id)!;
    assert.ok(benutzer.zuletztAktiv, 'zuletzt aktiv');
    assert.ok(benutzer.letzteAnmeldung, 'letzte Anmeldung');
    const iphone = liste.find((s) => s.geraet.includes('iPhone'))!;
    await k.beendeSitzung(sabine.benutzer.id, iphone.id);
    assert.equal(await k.benutzerZu(sabine.schluessel), undefined, 'iPhone abgemeldet');
    assert.ok(await k.benutzerZu(zweite.schluessel), 'Mac bleibt angemeldet');
    assert.deepEqual(await k.beendeAlleSitzungen(sabine.benutzer.id), { beendet: 1 });
    assert.equal(await k.benutzerZu(zweite.schluessel), undefined);
  });

  it('lässt den Admin als Benutzer agieren und zurückkehren; der Benutzer erfährt davon', async () => {
    const { k, admin, sabine } = await zwei();
    await wirft(k.vertrete(sabine.benutzer, sabine.schluessel, admin.benutzer.id, { ip: '', geraet: '' }), 403);
    const v = await k.vertrete(admin.benutzer, admin.schluessel, sabine.benutzer.id, { ip: '10.0.0.1', geraet: 'Firefox' });
    assert.equal(await k.benutzerZu(admin.schluessel), undefined, 'Admin-Sitzung beendet');
    const a = (await k.anmeldungZu(v.schluessel))!;
    assert.equal(a.benutzer.id, sabine.benutzer.id);
    assert.deepEqual((await k.vertretungZu(a.sitzung))?.adminName, 'Admin');
    assert.equal((await k.hinweise(sabine.benutzer.id)).length, 1);
    const zurueck = await k.vertretungBeenden(v.schluessel, { ip: '10.0.0.1', geraet: 'Firefox' });
    assert.equal(zurueck.benutzer?.id, admin.benutzer.id);
    assert.equal(await k.benutzerZu(v.schluessel), undefined);
    assert.equal((await k.benutzerZu(zurueck.schluessel!))?.id, admin.benutzer.id);
    await wirft(k.vertretungBeenden(zurueck.schluessel!, { ip: '', geraet: '' }), 409);
    const h = await k.hinweise(sabine.benutzer.id);
    assert.equal(h.length, 1);
    assert.ok(h[0].ende, 'Ende vermerkt');
    await k.hinweiseGesehen(sabine.benutzer.id);
    assert.equal((await k.hinweise(sabine.benutzer.id)).length, 0);
  });
});
