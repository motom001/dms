/** Postfächer (#196): Ablauf ohne Mailserver – Mails werden Post, Filter, Nachher, keine Doppelten, Fehler. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { POST_KANAL } from '../../shared/src/model';
import { speicherDateien } from '../src/dateispeicher';
import { Dienst } from '../src/dienst';
import { speicherEinstellungen } from '../src/einstellungen';
import { Fachfehler } from '../src/fehler';
import { Konten } from '../src/konten';
import { speicherKontoRepo } from '../src/konto-repo';
import { absenderPasst, Postfaecher, pruefePostfach, verstaendlich, type GeleseneMail, type ImapSitzung } from '../src/postfach';
import { speicherRepo } from '../src/repo-speicher';

/** Eine Mail im Test: die „Quelle“ ist JSON, der Leser macht daraus wieder die Mail. */
type TestMail = Omit<GeleseneMail, 'anhaenge' | 'datum'> & { datum?: string; anhaenge?: Array<{ name: string; mime: string; text: string; eingebettet?: boolean }> };
const quelleVon = (m: TestMail) => Buffer.from(JSON.stringify(m));
const lies = async (q: Buffer): Promise<GeleseneMail> => {
  const m = JSON.parse(q.toString()) as TestMail;
  return { ...m, datum: m.datum ? new Date(m.datum) : null, anhaenge: (m.anhaenge ?? []).map((a) => ({ name: a.name, mime: a.mime, inhalt: Buffer.from(a.text), eingebettet: !!a.eingebettet })) };
};

class TestServer {
  mails = new Map<number, Buffer>();
  verschoben: Array<[number, string]> = [];
  gelesenMarkiert: number[] = [];
  geloescht: number[] = [];
  uidValidity = '1';
  naechste = 1;
  fehler: Error | null = null;
  lege(m: TestMail) { this.mails.set(this.naechste++, quelleVon(m)); }
  verbinde = async (): Promise<ImapSitzung> => {
    if (this.fehler) throw this.fehler;
    const s = this;
    return {
      uidValidity: s.uidValidity, anzahl: s.mails.size,
      async neue(ab) { return [...s.mails.entries()].filter(([u]) => u >= ab).map(([uid, q]) => ({ uid, messageId: (JSON.parse(q.toString()) as TestMail).messageId })); },
      async quelle(uid) { const q = s.mails.get(uid); if (!q) throw new Error('weg'); return q; },
      async verschiebe(uid, o) { s.verschoben.push([uid, o]); s.mails.delete(uid); },
      async gelesen(uid) { s.gelesenMarkiert.push(uid); },
      async loesche(uid) { s.geloescht.push(uid); s.mails.delete(uid); },
      async ordnerListe() { return ['INBOX', 'DMS']; },
      async schliessen() {},
    };
  };
}

async function aufbau(o: Record<string, unknown> = {}) {
  const d = new Dienst(speicherRepo(), speicherDateien(), { einstellungen: speicherEinstellungen() });
  const konten = new Konten(speicherKontoRepo(), null, 'http://nas', d.benutzerspiegel());
  d.verbindeKonten(konten.papierkorbHaken());
  const { benutzer: anna } = await konten.einrichten({ email: 'anna@example.org', name: 'Anna', passwort: 'ein-langes-passwort' });
  await d.gleicheBenutzerAb(await konten.listeBenutzer());
  const server = new TestServer();
  const einstellungen = speicherEinstellungen();
  const meldungen: string[] = [];
  const pf = new Postfaecher({
    dienst: d, einstellungen, verbinde: server.verbinde, lies,
    verschluessele: (k) => `v1:${Buffer.from(k).toString('base64')}`, entschluessele: (w) => Buffer.from(w.slice(3), 'base64').toString(),
    anAdmins: async (b) => { meldungen.push(b); },
  });
  const [p] = await pf.speichere({ name: 'Rechnungen', server: 'imap.example.org', port: 993, benutzer: 'dms@example.org', passwort: 'app-passwort', ...o }, null, 'test');
  const posten = async () => {
    const post = await d.postTyp();
    return Promise.all((await d.listeMappen(post.id)).map(async (m) => ({ m, x: await d.holeMappe(m.id) })));
  };
  return { d, pf, p, server, posten, einstellungen, anna, meldungen };
}

const RECHNUNG: TestMail = { messageId: '<r1@example.org>', betreff: 'Ihre Rechnung 4711', datum: '2026-10-30T09:15:00Z', absenderName: 'Stadtwerke', absenderAdresse: 'rechnung@stadtwerke.de', text: 'Anbei Ihre Rechnung.', anhaenge: [{ name: 'Rechnung 4711.pdf', mime: 'application/pdf', text: '%PDF-1.4 x' }, { name: 'logo.png', mime: 'image/png', text: 'png', eingebettet: true }] };

describe('Postfächer (#196)', () => {
  it('prüft Eingaben; Passwort verschlüsselt und nie in der Ansicht', async () => {
    const v = (k: string) => `enc:${k}`;
    assert.throws(() => pruefePostfach({ name: 'X', server: 'imap.x.de', benutzer: 'a' }, null, v), (e) => e instanceof Fachfehler && /Passwort/.test(e.message));
    assert.throws(() => pruefePostfach({ name: 'X', server: 'imap.x.de', benutzer: 'a', passwort: 'p', verschluesselung: 'keine' }, null, v), /ausdrücklich/);
    const p = pruefePostfach({ name: 'X', server: 'imap.x.de', benutzer: 'a', passwort: 'p', absender: 'chef@firma.de, bank.de' }, null, v);
    assert.equal(p.passwort, 'enc:p');
    assert.deepEqual(p.absender, ['chef@firma.de', 'bank.de']);
    assert.equal(pruefePostfach({ name: 'Y' }, p, v).passwort, 'enc:p', 'leeres Passwort behält das alte');
    const { pf } = await aufbau();
    const [a] = await pf.ansicht();
    assert.equal((a as unknown as { passwort?: string }).passwort, undefined);
    assert.equal(a.passwortGesetzt, true);
    assert.ok(absenderPasst('x@mail.bank.de', ['bank.de']));
    assert.ok(!absenderPasst('x@andere.de', ['bank.de', 'chef@firma.de']));
  });

  it('macht aus jeder Mail eine Post mit Anhängen, Text und Original; verschiebt danach', async () => {
    const { pf, p, server, posten } = await aufbau();
    server.lege(RECHNUNG);
    assert.equal(await pf.abrufen(p.id), 1);
    const [{ m, x }] = await posten();
    assert.equal(m.werte.kanal, POST_KANAL.email);
    assert.equal(m.werte.betreff, 'Ihre Rechnung 4711');
    assert.equal(m.werte.absender, 'Stadtwerke <rechnung@stadtwerke.de>');
    assert.equal(m.werte.datum, '2026-10-30');
    assert.equal(m.werte.nachricht, 'Anbei Ihre Rechnung.');
    assert.deepEqual(x.dokumente.map((dok) => dok.name).sort(), ['Ihre Rechnung 4711.eml', 'Rechnung 4711.pdf'], 'Logo übersprungen, Original dabei');
    assert.deepEqual(server.verschoben, [[1, 'DMS']]);
    assert.equal(await pf.abrufen(p.id), 0, 'nichts doppelt');
    assert.equal((await pf.ansicht())[0].stand.uebernommen[0].mappeId, m.id);
  });

  it('Absenderfilter und „nur mit Anhang“ lassen Mails unverändert liegen; Markieren und Löschen', async () => {
    const { pf, p, server, posten } = await aufbau({ absender: 'stadtwerke.de', nurMitAnhang: true, nachher: 'gelesen', fuer: undefined });
    server.lege({ ...RECHNUNG, messageId: '<a>', absenderAdresse: 'spam@werbung.de' });
    server.lege({ ...RECHNUNG, messageId: '<b>', anhaenge: [] });
    server.lege({ ...RECHNUNG, messageId: '<c>' });
    assert.equal(await pf.abrufen(p.id), 1);
    assert.equal((await posten()).length, 1);
    assert.deepEqual(server.gelesenMarkiert, [3]);
    assert.equal(server.mails.size, 3, 'übersprungene bleiben');
    await pf.speichere({ nachher: 'loeschen' }, p.id, 'test');
    server.lege({ ...RECHNUNG, messageId: '<d>' });
    assert.equal(await pf.abrufen(p.id), 1);
    assert.deepEqual(server.geloescht, [4]);
  });

  it('keine Doppelten: nach geänderter UIDVALIDITY und nach einem Abbruch', async () => {
    const { pf, p, server, posten, einstellungen, d } = await aufbau({ nachher: 'gelesen' });
    server.lege(RECHNUNG);
    await pf.abrufen(p.id);
    server.uidValidity = '2';
    assert.equal(await pf.abrufen(p.id), 0, 'gleiche Message-ID nach UIDVALIDITY-Wechsel');
    assert.equal((await posten()).length, 1);
    // Abbruch nach dem Anlegen der Post, vor dem Wegräumen: Journal liegt noch da.
    server.lege({ ...RECHNUNG, messageId: '<neu>' });
    const id = '11111111-2222-4333-8444-555555555555';
    await d.legePostAn({ betreff: 'x' }, { id: null, name: 'Postfach' }, undefined, POST_KANAL.email, undefined, id);
    await einstellungen.schreibe('postfach_journal', { postfach: p.id, uid: 2, schluessel: '<neu>', mappeId: id, erstellt: false });
    assert.equal(await pf.abrufen(p.id), 0);
    assert.equal((await posten()).length, 2, 'keine dritte Post');
    assert.equal((await d.holeMappe(id)).dokumente.length, 2, 'Anhänge nachgeholt');
  });

  it('meldet Fehler verständlich, wartet länger und benachrichtigt nach dem dritten Mal', async () => {
    const { pf, p, server, meldungen } = await aufbau();
    server.fehler = Object.assign(new Error('Command failed'), { authenticationFailed: true });
    for (let i = 0; i < 3; i++) await assert.rejects(pf.abrufen(p.id), (e) => e instanceof Fachfehler && /Anmeldung abgelehnt/.test(e.message));
    const [a] = await pf.ansicht();
    assert.equal(a.stand.fehlerFolge, 3);
    assert.ok(a.stand.naechsterAbruf);
    assert.equal(meldungen.length, 1);
    assert.match(verstaendlich(Object.assign(new Error('getaddrinfo ENOTFOUND'), { code: 'ENOTFOUND' })), /nicht erreichbar/);
    assert.match(verstaendlich(Object.assign(new Error('self-signed certificate'), { code: 'DEPTH_ZERO_SELF_SIGNED_CERT' })), /Zertifikat/);
    const t = await pf.teste({}, p.id);
    assert.equal(t.ok, false);
    server.fehler = null;
    assert.match((await pf.teste({}, p.id)).text, /Verbunden/);
  });

  it('zu große Anhänge stehen mit Grund in der Historie', async () => {
    const { pf, p, server, posten, d } = await aufbau({ original: false });
    const gross = 'x'.repeat(100 * 1024 * 1024 + 1);
    server.lege({ ...RECHNUNG, anhaenge: [{ name: 'riesig.bin', mime: 'application/octet-stream', text: gross }, { name: 'ok.pdf', mime: 'application/pdf', text: '%PDF' }] });
    await pf.abrufen(p.id);
    const [{ m, x }] = await posten();
    assert.deepEqual(x.dokumente.map((dok) => dok.name), ['ok.pdf']);
    const h = await d.historie(m.id);
    assert.ok(h.some((e) => e.art === 'uebernommen' && /riesig\.bin: größer als 100 MB/.test(String(e.daten.text))));
  });
});
