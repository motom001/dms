/**
 * Auskunft zustellen (#455): ZIP per E-Mail (nur verschlüsselt) und Abruf-Link mit Abrufcode auf der
 * öffentlichen Abrufseite – Hashes statt Klartext, gleiche Antwort für unbekannte Links und falsche Codes,
 * Sperre nach Fehlversuchen (Link und Anmeldeschutz je IP), Ablauf, Zurückziehen, Einmal-Tickets,
 * Nachweis in der Historie und Benachrichtigung. Arbeitsspeicher und – mit TEST_DATABASE_URL – PostgreSQL.
 */
import assert from 'node:assert/strict';
import { mkdtemp, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import { liesAnrede, TEXTE_DRITTE, textDritte } from '../../shared/src/anrede';
import {
  auskunftMail, CODE_ZEICHEN, liesDatenschutz, RECHTE_STANDARD, rechteStandard, LINK_FEHLVERSUCHE_MAX, liesLinkEingabe, linkStatus, normiereCode, oeffentlichErreichbar, zeigeCode,
} from '../../shared/src/auskunft';
import { AbrufTickets, kuerzeIp, neuerAbrufcode, TICKET_MS } from '../src/abruf';
import { auskuenfteIn } from '../src/auskunft';
import { speicherDateien } from '../src/dateispeicher';
import { Dienst } from '../src/dienst';
import { speicherEinstellungen } from '../src/einstellungen';
import { Fachfehler } from '../src/fehler';
import { Konten } from '../src/konten';
import { speicherKontoRepo } from '../src/konto-repo';
import type { MailOptionen, Mailer } from '../src/mail';
import { hashePasswort, hasheSchluessel, neuerSchluessel } from '../src/passwort';
import type { Repo } from '../src/repo';
import { speicherRepo } from '../src/repo-speicher';
import { routen, type Anfrage } from '../src/routen';
import { Tresor } from '../src/tresor';
import { pdfMitText } from './hilfen';

/** Wartet, bis die Bedingung gilt (Abruf-Nachweis und Meldungen entstehen erst nach dem Ende des Downloads) – höchstens 5 s. */
async function bis(ok: () => Promise<boolean> | boolean): Promise<void> {
  for (let i = 0; i < 100; i++) { if (await ok()) return; await new Promise((x) => setTimeout(x, 50)); }
}


const status = (s: number) => (e: unknown) => e instanceof Fachfehler && e.status === s;
const H = '00000000-0000-4000-8000-000000000001';

describe('Auskunft zustellen: reine Funktionen (#455)', () => {
  it('Abrufcode: 8 Zeichen aus dem Alphabet ohne Verwechsler, zufällig; Eingabe tolerant', () => {
    const codes = new Set(Array.from({ length: 200 }, () => neuerAbrufcode()));
    assert.equal(codes.size, 200);
    for (const c of codes) { assert.equal(c.length, 8); assert.ok([...c].every((z) => CODE_ZEICHEN.includes(z)), c); assert.ok(!/[01IO]/.test(c)); }
    assert.equal(normiereCode(' abcd-efgh '), 'ABCDEFGH');
    assert.equal(normiereCode('MV 2024.17'), 'MV202417');
    assert.equal(normiereCode(42), '');
    assert.equal(zeigeCode('ABCDEFGH'), 'ABCD-EFGH');
  });

  it('Eingaben für den Link: Grenzen, eigener Code mindestens 6 Zeichen', () => {
    assert.deepEqual(liesLinkEingabe({}), { tage: 30, abrufe: 3, code: null, an: '', senden: false, fehler: [] });
    assert.equal(liesLinkEingabe({ tage: 0 }).fehler.length, 1);
    assert.equal(liesLinkEingabe({ tage: 91 }).fehler.length, 1);
    assert.equal(liesLinkEingabe({ abrufe: 11 }).fehler.length, 1);
    assert.match(liesLinkEingabe({ code: 'K-47' }).fehler[0], /mindestens 6/);
    assert.equal(liesLinkEingabe({ code: 'mv-2024-17' }).code, 'MV202417');
  });

  it('Status: zurückgezogen vor gesperrt vor verbraucht vor abgelaufen', () => {
    const basis = { ablauf: new Date(Date.now() + 1000).toISOString(), maxAbrufe: 2, abrufe: 0, gesperrt: null, widerrufen: null };
    assert.equal(linkStatus(basis), 'aktiv');
    assert.equal(linkStatus({ ...basis, ablauf: new Date(Date.now() - 1).toISOString() }), 'abgelaufen');
    assert.equal(linkStatus({ ...basis, abrufe: 2 }), 'verbraucht');
    assert.equal(linkStatus({ ...basis, abrufe: 2, gesperrt: 'x' }), 'gesperrt');
    assert.equal(linkStatus({ ...basis, gesperrt: 'x', widerrufen: 'y' }), 'widerrufen');
  });

  it('Erreichbarkeit: Heimnetz und localhost nicht, echte Namen und Adressen schon', () => {
    for (const a of ['http://localhost:3000', 'http://192.168.1.20:8080', 'http://10.0.0.5', 'http://172.20.1.1', 'http://nas:3000', 'http://nas.local', 'https://dms.fritz.box', 'http://[::1]:3000', 'http://[fd00::1]', 'http://100.64.1.2', 'kaputt'])
      assert.equal(oeffentlichErreichbar(a), false, a);
    for (const a of ['https://dms.example.org', 'https://203.0.113.7', 'https://[2001:db8::1]', 'https://172.32.0.1'])
      assert.equal(oeffentlichErreichbar(a), true, a);
  });

  it('IP nur gekürzt fürs Protokoll', () => {
    assert.equal(kuerzeIp('203.0.113.77'), '203.0.113.0');
    assert.equal(kuerzeIp('::ffff:198.51.100.9'), '198.51.100.0');
    assert.equal(kuerzeIp('2001:db8:85a3:8d3:1319:8a2e:370:7348'), '2001:db8:85a3::');
    assert.equal(kuerzeIp(undefined), '–');
  });

  it('Tickets: genau einmal, nur zwei Minuten, unbekannte und kaputte nie', () => {
    let t = 1_000_000;
    const k = new AbrufTickets(() => t);
    const a = k.stelleAus('L1');
    assert.match(a, /^[A-Za-z0-9_-]{43}$/);
    assert.equal(k.loese(a), 'L1');
    assert.equal(k.loese(a), null, 'nur einmal');
    const b = k.stelleAus('L2');
    t += TICKET_MS + 1;
    assert.equal(k.loese(b), null, 'abgelaufen');
    assert.equal(k.loese('x'.repeat(43)), null);
    assert.equal(k.loese(undefined), null);
  });

  it('E-Mail-Texte: Du-Form, Link ohne Code, Hinweis auf den anderen Weg', () => {
    const l = auskunftMail.link('du', 'https://dms.example.org/abruf#abc', '01.12.2026', 3, 'Familie Beispiel');
    assert.match(l.nachricht, /du hast eine Auskunft/);
    assert.match(l.nachricht, /https:\/\/dms\.example\.org\/abruf#abc/);
    assert.match(l.nachricht, /bis 01\.12\.2026 hier abrufen \(höchstens 3-mal\):/);
    assert.match(l.nachricht, /anderen Weg/);
    assert.match(l.nachricht, /\nFamilie Beispiel\n$/);
    assert.doesNotMatch(l.nachricht, /\bSie\b|\bIhre?\b/);
    assert.match(auskunftMail.link('du', 'x', '01.12.2026', 1, '').nachricht, /\(einmal\):/);
    const z = auskunftMail.zip('du');
    assert.match(z.nachricht, /Passwort bekommst du auf einem anderen Weg/);
    assert.match(auskunftMail.zip('du', '01.12.2026').nachricht, /Bitte antworte bis 01\.12\.2026/);
  });

  it('Anrede für Dritte (#474): Sie-Fassung je Text, ohne „du“; beide Fassungen mit denselben Schlüsseln und Platzhaltern', () => {
    const l = auskunftMail.link('sie', 'https://dms.example.org/abruf#abc', '01.12.2026', 3, 'Familie Beispiel');
    assert.equal(l.betreff, 'Ihre Auskunft nach Art. 15 DSGVO zum Abrufen');
    assert.match(l.nachricht, /^Guten Tag,\n\nSie haben eine Auskunft/);
    assert.match(l.nachricht, /Ihren Abrufcode/);
    assert.match(l.nachricht, /https:\/\/dms\.example\.org\/abruf#abc/);
    const z = auskunftMail.zip('sie', '01.12.2026');
    assert.equal(z.betreff, 'Ihre Auskunft nach Art. 15 DSGVO');
    assert.match(z.nachricht, /Passwort erhalten Sie auf einem anderen Weg/);
    assert.match(z.nachricht, /Bitte antworten Sie bis 01\.12\.2026/);
    const duWort = /\b([Dd]u|[Dd]ich|[Dd]ir|[Dd]ein(e[mnrs]?)?)\b/;
    for (const [k, t] of Object.entries(TEXTE_DRITTE.sie)) assert.doesNotMatch(t, duWort, k);
    const platzhalter = (t: string) => [...t.matchAll(/\{([^{}]+)\}/g)].map((x) => x[1]).sort().join();
    assert.deepEqual(Object.keys(TEXTE_DRITTE.sie).sort(), Object.keys(TEXTE_DRITTE.du).sort());
    for (const k of Object.keys(TEXTE_DRITTE.du) as Array<keyof typeof TEXTE_DRITTE.du>) assert.equal(platzhalter(TEXTE_DRITTE.sie[k]), platzhalter(TEXTE_DRITTE.du[k]), k);
    assert.equal(textDritte('sie', 'abruf.rest', { 'wie oft': 'zweimal' }), 'Sie können sie mit diesem Link noch zweimal herunterladen.');
    assert.equal(liesAnrede('sie'), 'sie');
    for (const x of [undefined, null, 'Sie', 'ihr', 3]) assert.equal(liesAnrede(x), 'du');
  });

  it('Einstellung (#474): Vorgabe du; der unveränderte Vorschlag für die Rechte folgt der Anrede, ein eigener Text bleibt', () => {
    assert.equal(liesDatenschutz(undefined).anrede, 'du');
    assert.equal(liesDatenschutz({}).rechte, RECHTE_STANDARD);
    assert.equal(liesDatenschutz({ anrede: 'sie' }).rechte, rechteStandard('sie'));
    assert.match(rechteStandard('sie'), /^Sie haben das Recht/);
    assert.equal(liesDatenschutz({ anrede: 'sie', rechte: RECHTE_STANDARD }).rechte, rechteStandard('sie'));
    assert.equal(liesDatenschutz({ anrede: 'du', rechte: rechteStandard('sie') }).rechte, RECHTE_STANDARD);
    assert.equal(liesDatenschutz({ anrede: 'sie', rechte: 'Eigener Text.' }).rechte, 'Eigener Text.');
  });
});

/* ---------- Aufbau ---------- */

const offen: Array<{ end(): Promise<void> }> = [];
async function repos(pg: boolean): Promise<{ repo: Repo; konto: ReturnType<typeof speicherKontoRepo> }> {
  if (!pg) return { repo: speicherRepo(), konto: speicherKontoRepo() };
  const { ausUrl, alsUrl, legeDatenbankAn } = await import('../src/anbindung');
  const { verbinde, migriere } = await import('../src/db');
  const { pgRepo } = await import('../src/repo-pg');
  const { pgKontoRepo } = await import('../src/konto-repo');
  const a = { ...ausUrl(process.env.TEST_DATABASE_URL)!, datenbank: `dms_zust_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}` };
  await legeDatenbankAn(a);
  const sql = verbinde(alsUrl(a));
  offen.push(sql);
  await migriere(sql, new URL('../migrations', import.meta.url).pathname, () => {});
  return { repo: pgRepo(sql, H) as never, konto: pgKontoRepo(sql, H) as never };
}

interface Gesendet { an: string; betreff: string; text: string; optionen?: MailOptionen; anhang?: Buffer }

async function aufbau(pg: boolean, o: { mail?: boolean; adresse?: string } = {}) {
  const r = await repos(pg);
  const tresor = new Tresor(speicherEinstellungen(), join(await mkdtemp(join(tmpdir(), 'dms-zust-')), 'dms.schluessel'), () => null);
  await tresor.laden(); await tresor.erzeuge();
  const d = new Dienst(r.repo, speicherDateien(), { einstellungen: speicherEinstellungen(), tresor });
  const konten = new Konten(r.konto, null, 'http://nas', d.benutzerspiegel());
  d.verbindeKonten(konten.papierkorbHaken());
  const { benutzer: admin } = await konten.einrichten({ email: 'verwalter@example.org', name: 'Vera Verwalter', passwort: 'ein-langes-passwort' });
  const anna = (await konten.legeBenutzerAn({ email: 'anna@example.org', name: 'Anna', rolle: 'admin' }, admin.id)).benutzer;
  await d.gleicheBenutzerAb(await konten.listeBenutzer());
  const reg = [{ key: 'daten', name: 'Daten', art: 'felder' as const }, { key: 'dok', name: 'Unterlagen', art: 'dokumente' as const }];
  const mieterTyp = await d.legeTypAn({ name: 'Mieter', titelVorlage: '{name}', felder: [{ key: 'name', label: 'Name', typ: 'text' }], register: reg });
  const max = await d.legeMappeAn({ typId: mieterTyp.id, werte: { name: 'Max Mustermieter' } }, admin.id);
  const dok = (await d.ladeHoch(max.id, { register: 'dok', name: 'Mietvertrag.pdf' }, pdfMitText(['Mietvertrag Max Mustermieter']), admin.id)).dokument;
  // Anna hat Max als Favorit (Stern = Abo, #422) und bekommt die Benachrichtigung.
  await d.setzeFavorit(anna, max.id, true);
  const gesendet: Gesendet[] = [];
  const mailer: Mailer = {
    async sende(an, betreff, text, optionen) {
      const g: Gesendet = { an, betreff, text, optionen };
      const inhalt = optionen?.anhaenge?.[0]?.inhalt;
      if (inhalt) { if (Buffer.isBuffer(inhalt)) g.anhang = inhalt; else { const t: Buffer[] = []; for await (const c of inhalt) t.push(c as Buffer); g.anhang = Buffer.concat(t); } }
      gesendet.push(g);
    },
  };
  const ordner = await mkdtemp(join(tmpdir(), 'dms-zust-sich-'));
  const betrieb = { mailer: () => (o.mail === false ? null : mailer), adresseFuerLinks: () => o.adresse ?? 'https://dms.example.org' };
  const tabelle = routen(d, konten, { betrieb: betrieb as never, sicherung: { ordner } as never });
  const route = (m: string, p: string) => tabelle.find((x) => x.methode === m && x.pfad === p)!;
  const ich = async (id: string) => (await konten.listeBenutzer()).find((b) => b.id === id)!;
  const rufe = async (b: { id: string } | null, m: string, p: string, x: Partial<Anfrage> = {}) =>
    route(m, p).handler({ body: {}, params: {}, query: {}, ip: '203.0.113.5', ...x, benutzer: b ? await ich(b.id) : undefined } as Anfrage);
  /** Auskunft über den Hintergrundauftrag erzeugen. */
  async function auskunft(passwort = '') {
    await rufe(admin, 'POST', '/api/werkbank/auskunft', { body: { mappeId: max.id, auswahl: { mappen: [max.id], dokumente: [dok.id], notizen: [], historie: [] }, geprueft: true, passwort } });
    const f = await d.auftraege.warte();
    assert.equal(f?.status, 'fertig', f?.fehler);
    return f!.ergebnis as { id: string; bytes: number; verschluesselt: boolean; bis: string; name: string };
  }
  const zip = async (inhalt: unknown) => { const t: Buffer[] = []; for await (const c of inhalt as AsyncIterable<Buffer>) t.push(c); return Buffer.concat(t); };
  return { d, r, konten, admin, anna, max, gesendet, ordner, rufe, auskunft, zip };
}

for (const pg of [false, ...(process.env.TEST_DATABASE_URL ? [true] : [])]) {
  describe(`Auskunft zustellen (${pg ? 'PostgreSQL' : 'Arbeitsspeicher'})`, () => {
    after(async () => { if (pg) for (const s of offen.splice(0)) await s.end(); });

    it('Weg 1: per E-Mail nur verschlüsselt, ohne Passwort im Text; Nachweis in der Historie', async () => {
      const { d, admin, max, gesendet, rufe, auskunft } = await aufbau(pg);
      const offenZip = await auskunft();
      await assert.rejects(rufe(admin, 'POST', '/api/werkbank/auskunft/:id/email', { params: { id: offenZip.id }, body: { an: 'max@example.net' } }), status(422), 'unverschlüsselt nie per E-Mail');
      const passwort = 'Sommer-im-Garten-2026';
      const a = await auskunft(passwort);
      await assert.rejects(rufe(admin, 'POST', '/api/werkbank/auskunft/:id/email', { params: { id: a.id }, body: { an: 'kein-mail' } }), status(422));
      const r = await rufe(admin, 'POST', '/api/werkbank/auskunft/:id/email', { params: { id: a.id }, body: { an: 'max@example.net' } });
      assert.deepEqual(r.body, { an: ['max@example.net'] });
      assert.equal(gesendet.length, 1);
      const m = gesendet[0];
      assert.equal(m.an, 'max@example.net');
      assert.equal(m.betreff, 'Deine Auskunft nach Art. 15 DSGVO');
      assert.ok(!m.text.includes(passwort), 'Passwort nie in der E-Mail');
      assert.match(m.text, /anderen Weg/);
      assert.equal(m.optionen?.anhaenge?.[0].name, `${a.name}.zip`);
      assert.equal(m.anhang?.length, a.bytes);
      assert.match(m.optionen?.antwortAn ?? '', /verwalter@example\.org/);
      const h = (await d.historie(max.id)).find((x) => x.art === 'auskunft' && x.daten.zustellung === 'email');
      assert.match(String(h?.daten.text), /Auskunft per E-Mail gesendet an max@example\.net/);
      // Zu groß für E-Mail → Abruf-Link vorgeschlagen.
      await assert.rejects(d.auskunftPerEmail({ ...a, mappeId: max.id, titel: '', erstellt: '', mappen: 1, dokumente: 1, von: '', bytes: 60_000_000 }, () => { throw new Error('nicht lesen'); }, { an: 'max@example.net' }, { id: admin.id, name: '', email: admin.email }, { sende: async () => {} }),
        (e: unknown) => status(413)(e) && /Abruf-Link/.test((e as Error).message));
    });

    it('ohne E-Mail-Versand: E-Mail 409, Link nur zum Kopieren', async () => {
      const { admin, rufe, auskunft, gesendet } = await aufbau(pg, { mail: false });
      const a = await auskunft('Sommer-im-Garten-2026');
      await assert.rejects(rufe(admin, 'POST', '/api/werkbank/auskunft/:id/email', { params: { id: a.id }, body: { an: 'max@example.net' } }), status(409));
      await assert.rejects(rufe(admin, 'POST', '/api/werkbank/auskunft/:id/link', { params: { id: a.id }, body: { an: 'max@example.net', senden: true } }), status(409));
      const r = (await rufe(admin, 'POST', '/api/werkbank/auskunft/:id/link', { params: { id: a.id }, body: {} })).body as { url: string; gesendet: boolean };
      assert.equal(r.gesendet, false);
      assert.equal(gesendet.length, 0);
      const s = (await rufe(admin, 'GET', '/api/werkbank/datenschutz')).body as { mail: boolean; oeffentlich: boolean };
      assert.equal(s.mail, false);
      assert.equal(s.oeffentlich, true);
    });

    it('Anrede Sie (#474): E-Mails, Meldungen der Abrufseite und ihre Anrede-Abfrage; Vorgabe du', async () => {
      const { admin, gesendet, rufe, auskunft } = await aufbau(pg);
      assert.deepEqual((await rufe(null, 'GET', '/api/abruf/anrede')).body, { anrede: 'du' });
      await assert.rejects(rufe(null, 'POST', '/api/abruf', { body: { schluessel: neuerSchluessel(), code: 'AAAAAAAA' }, ip: '198.51.100.40' }), (e: unknown) => status(403)(e) && /Prüfe den Code/.test((e as Error).message));
      await rufe(admin, 'PUT', '/api/werkbank/datenschutz', { body: { anrede: 'sie' } });
      const st = (await rufe(admin, 'GET', '/api/werkbank/datenschutz')).body as { einstellung: { anrede: string; rechte: string } };
      assert.equal(st.einstellung.anrede, 'sie');
      assert.match(st.einstellung.rechte, /^Sie haben das Recht/);
      const anrede = await rufe(null, 'GET', '/api/abruf/anrede');
      assert.deepEqual(anrede.body, { anrede: 'sie' }, 'nur die Anrede, sonst nichts');
      // E-Mail mit ZIP (Vorlage) und mit Link
      const a = await auskunft('Sommer-im-Garten-2026');
      await rufe(admin, 'POST', '/api/werkbank/auskunft/:id/email', { params: { id: a.id }, body: { an: 'max@example.net' } });
      assert.equal(gesendet[0].betreff, 'Ihre Auskunft nach Art. 15 DSGVO');
      assert.match(gesendet[0].text, /Sie haben eine Auskunft/);
      const { url, code } = (await rufe(admin, 'POST', '/api/werkbank/auskunft/:id/link', { params: { id: a.id }, body: { an: 'max@example.net', senden: true } })).body as { url: string; code: string };
      assert.equal(gesendet[1].betreff, 'Ihre Auskunft nach Art. 15 DSGVO zum Abrufen');
      assert.match(gesendet[1].text, /benötigen Sie Ihren Abrufcode/);
      assert.doesNotMatch(gesendet[1].text, /\b(du|dich|dir|deinen?)\b/);
      // Meldungen der Abrufseite
      await assert.rejects(rufe(null, 'POST', '/api/abruf', { body: { schluessel: url.split('#')[1], code: 'AAAAAAAA' }, ip: '198.51.100.41' }), (e: unknown) => status(403)(e) && /Prüfen Sie den Code.*wenden Sie sich/.test((e as Error).message));
      await assert.rejects(rufe(null, 'GET', '/api/abruf/datei', { query: { ticket: 'x'.repeat(43) } }), (e: unknown) => status(410)(e) && /Geben Sie Ihren Abrufcode/.test((e as Error).message));
      for (let i = 0; i < 5; i++) await assert.rejects(rufe(null, 'POST', '/api/abruf', { body: { schluessel: url.split('#')[1], code: `FALSCH${i}X` }, ip: '192.0.2.77' }), status(403));
      await assert.rejects(rufe(null, 'POST', '/api/abruf', { body: { schluessel: url.split('#')[1], code }, ip: '192.0.2.77' }), (e: unknown) => status(429)(e) && /von Ihrem Anschluss/.test((e as Error).message));
    });

    it('Weg 2: Link nur mit Schlüssel im Fragment, Code nie in der Mail, nur Hashes gespeichert; Abruf mit Ticket, Nachweis, Benachrichtigung gebündelt', async () => {
      const { d, r, admin, anna, max, gesendet, ordner, rufe, auskunft, zip } = await aufbau(pg);
      const a = await auskunft();
      const neu = (await rufe(admin, 'POST', '/api/werkbank/auskunft/:id/link', { params: { id: a.id }, body: { an: 'max@example.net', senden: true, tage: 30, abrufe: 2 } }));
      assert.equal(neu.status, 201);
      const { url, code, link } = neu.body as { url: string; code: string; link: Record<string, unknown> };
      const schluessel = url.split('#')[1];
      assert.match(url, /^https:\/\/dms\.example\.org\/abruf#[A-Za-z0-9_-]{43}$/, 'nur der Schlüssel, keine weiteren Daten');
      assert.equal(code.length, 8);
      assert.ok(!('schluessel' in link) && !('code' in link), 'Hashes verlassen den Server nicht');
      // Mail: Link ja, Code nie.
      assert.equal(gesendet.length, 1);
      assert.ok(gesendet[0].text.includes(url));
      assert.ok(!gesendet[0].text.includes(code) && !gesendet[0].text.includes(zeigeCode(code)));
      // Gespeichert: nur Hashes.
      const [intern] = await r.repo.auskunftLinks({ auskunftId: a.id });
      assert.equal(intern.schluessel, hasheSchluessel(schluessel));
      assert.notEqual(intern.schluessel, schluessel);
      assert.match(intern.code, /^scrypt\$/);
      // Die ZIP bleibt so lange wie der Link (statt 7 Tagen).
      assert.equal((await auskuenfteIn(join(ordner, 'export', 'auskunft'), new Date(Date.now() + 8 * 24 * 3600 * 1000))).length, 1);
      // Eigenes Herunterladen löscht sie nicht, solange der Link gilt.
      await zip((await rufe(admin, 'GET', '/api/werkbank/auskunft/:id/zip', { params: { id: a.id } })).datei!.inhalt);
      await new Promise((x) => setTimeout(x, 30));
      assert.ok((await rufe(admin, 'GET', '/api/werkbank/auskunft/:id/zip', { params: { id: a.id } })).datei);

      // Öffentlich: falscher Code und unbekannter Link sehen gleich aus.
      const falsch = await rufe(null, 'POST', '/api/abruf', { body: { schluessel, code: 'AAAAAAAA' } }).catch((e) => e as Fachfehler);
      const unbekannt = await rufe(null, 'POST', '/api/abruf', { body: { schluessel: neuerSchluessel(), code }, ip: '198.51.100.1' }).catch((e) => e as Fachfehler);
      const kaputt = await rufe(null, 'POST', '/api/abruf', { body: { schluessel: '../../etc', code }, ip: '198.51.100.2' }).catch((e) => e as Fachfehler);
      for (const f of [falsch, unbekannt, kaputt]) { assert.ok(f instanceof Fachfehler); assert.equal(f.status, 403); assert.equal(f.message, (falsch as Fachfehler).message); }
      assert.ok((await d.historie(max.id)).some((h) => h.daten.zustellung === 'abruf' && h.daten.erfolg === false));
      // Richtig (Schreibweise egal): Ticket, dann Download genau einmal.
      const ok = (await rufe(null, 'POST', '/api/abruf', { body: { schluessel, code: zeigeCode(code).toLowerCase() } })).body as { ticket: string; groesse: number; maxAbrufe: number };
      assert.equal(ok.groesse, a.bytes);
      assert.equal(ok.maxAbrufe, 2);
      const dl = await rufe(null, 'GET', '/api/abruf/datei', { query: { ticket: ok.ticket } });
      const daten = await zip(dl.datei!.inhalt);
      assert.equal(daten.length, a.bytes);
      assert.equal(dl.datei!.name, `${a.name}.zip`);
      await assert.rejects(rufe(null, 'GET', '/api/abruf/datei', { query: { ticket: ok.ticket } }), status(410), 'Ticket nur einmal');
      await bis(async () => (await d.historie(max.id)).some((x) => x.daten.zustellung === 'abruf' && x.daten.erfolg === true));
      const h = await d.historie(max.id);
      assert.ok(h.some((x) => x.daten.zustellung === 'link' && /Abruf-Link erstellt: gültig bis .*höchstens 2 Abrufe, per E-Mail an max@example\.net/.test(String(x.daten.text))));
      assert.ok(h.some((x) => x.daten.zustellung === 'abruf' && x.daten.erfolg === true && /Auskunft abgerufen \(1\. von höchstens 2/.test(String(x.daten.text))));
      assert.ok(!JSON.stringify(h).includes('203.0.113'), 'keine IP in der Historie');
      assert.ok(!JSON.stringify(h).includes(code), 'kein Code in der Historie');
      // Benachrichtigung an Ersteller und Favoriten-Inhaberin, je eine.
      const meldungen = async () => (await r.repo.offeneAufgaben({ mappeIds: [max.id] })).filter((x) => x.art === 'auskunft');
      await bis(async () => (await meldungen()).length >= 2);
      assert.deepEqual((await meldungen()).map((x) => x.empfaengerId).sort(), [admin.id, anna.id].sort());
      assert.match((await meldungen())[0].text, /Auskunft an Max Mustermieter wurde abgerufen/);
      // Zweiter (letzter) Abruf: gebündelt – keine weitere Meldung; danach ist die ZIP weg.
      const ok2 = (await rufe(null, 'POST', '/api/abruf', { body: { schluessel, code } })).body as { ticket: string };
      await zip((await rufe(null, 'GET', '/api/abruf/datei', { query: { ticket: ok2.ticket } })).datei!.inhalt);
      await bis(async () => ((await rufe(admin, 'GET', '/api/werkbank/datenschutz')).body as { auskuenfte: unknown[] }).auskuenfte.length === 0);
      assert.equal((await meldungen()).length, 2);
      const st = (await rufe(admin, 'GET', '/api/werkbank/datenschutz')).body as { links: Array<{ abrufe: number; abgerufen: string | null }>; auskuenfte: unknown[] };
      assert.equal(st.links[0].abrufe, 2);
      assert.ok(st.links[0].abgerufen, 'abgerufen am …');
      assert.equal(st.auskuenfte.length, 0, 'alle Abrufe verbraucht → ZIP gelöscht');
      // Danach: richtiger Code → „gilt nicht mehr“ (410), falscher weiter → 403.
      await assert.rejects(rufe(null, 'POST', '/api/abruf', { body: { schluessel, code } }), status(410));
    });

    it('Sperre: nach zu vielen falschen Codes hilft auch der richtige nicht mehr; Anmeldeschutz je IP', async () => {
      const { r, admin, max, rufe, auskunft } = await aufbau(pg);
      const a = await auskunft();
      const { url, code } = (await rufe(admin, 'POST', '/api/werkbank/auskunft/:id/link', { params: { id: a.id }, body: {} })).body as { url: string; code: string };
      const schluessel = url.split('#')[1];
      // Anmeldeschutz: nach 5 Fehlversuchen von derselben IP ist sie gesperrt (429) – auch für den richtigen Code.
      for (let i = 0; i < 5; i++) await assert.rejects(rufe(null, 'POST', '/api/abruf', { body: { schluessel, code: `FALSCH${i}X` }, ip: '192.0.2.10' }), status(403));
      await assert.rejects(rufe(null, 'POST', '/api/abruf', { body: { schluessel, code }, ip: '192.0.2.10' }), (e: unknown) => status(429)(e) && !/Anmeldung/.test((e as Error).message));
      // Weitere Versuche von anderen Adressen, bis der Link selbst gesperrt ist.
      for (let i = 5; i < LINK_FEHLVERSUCHE_MAX; i++) await assert.rejects(rufe(null, 'POST', '/api/abruf', { body: { schluessel, code: 'ZZZZZZZZ' }, ip: `192.0.2.${100 + i}` }), status(403));
      const [l] = await r.repo.auskunftLinks({ auskunftId: a.id });
      assert.equal(l.fehlversuche, LINK_FEHLVERSUCHE_MAX);
      assert.ok(l.gesperrt);
      assert.equal(linkStatus(l), 'gesperrt');
      // Richtiger Code am gesperrten Link: dieselbe Antwort wie bei einem falschen, kein Ticket, kein weiterer Zähler.
      await assert.rejects(rufe(null, 'POST', '/api/abruf', { body: { schluessel, code }, ip: '192.0.2.200' }), status(403));
      assert.equal((await r.repo.auskunftLinks({ auskunftId: a.id }))[0].fehlversuche, LINK_FEHLVERSUCHE_MAX);
      const auf = (await r.repo.offeneAufgaben({ mappeIds: [max.id] })).filter((x) => x.art === 'auskunft');
      assert.ok(auf.some((x) => x.empfaengerId === admin.id && /gesperrt/.test(x.text)), 'Ersteller erfährt von der Sperre');
      // Ein neuer Link ersetzt den gesperrten nicht stillschweigend – der alte bleibt gesperrt, der neue gilt.
      const n2 = (await rufe(admin, 'POST', '/api/werkbank/auskunft/:id/link', { params: { id: a.id }, body: { code: 'MV-2024-17' } })).body as { url: string; code: string };
      assert.equal(n2.code, 'MV202417');
      assert.ok((await rufe(null, 'POST', '/api/abruf', { body: { schluessel: n2.url.split('#')[1], code: 'mv 2024 17' }, ip: '192.0.2.201' })).body);
    });

    it('Ablauf und Zurückziehen: mit richtigem Code „gilt nicht mehr“, ohne Zählen; die ZIP fällt aufs ursprüngliche Ende zurück', async () => {
      const { d, r, admin, max, ordner, rufe, auskunft } = await aufbau(pg);
      const a = await auskunft();
      // Abgelaufener Link (direkt angelegt).
      const s1 = neuerSchluessel();
      await r.repo.legeAuskunftLinkAn({ id: crypto.randomUUID(), auskunftId: a.id, mappeId: max.id, titel: 'Max', schluessel: hasheSchluessel(s1), code: await hashePasswort('ABCDEFGH'), codeArt: 'erzeugt', empfaenger: null,
        erstellt: new Date(Date.now() - 40 * 864e5).toISOString(), erstelltVon: admin.id, ablauf: new Date(Date.now() - 864e5).toISOString(), maxAbrufe: 3, abrufe: 0, fehlversuche: 0, gesperrt: null, widerrufen: null, abgerufen: null });
      await assert.rejects(rufe(null, 'POST', '/api/abruf', { body: { schluessel: s1, code: 'ABCDEFGH' } }), status(410));
      await assert.rejects(rufe(null, 'POST', '/api/abruf', { body: { schluessel: s1, code: 'ABCDEFGX' } }), status(403), 'falscher Code: nichts über den Ablauf');
      const ab = (await r.repo.auskunftLinks()).find((x) => x.schluessel === hasheSchluessel(s1))!;
      assert.equal(ab.abrufe, 0);
      assert.equal(await r.repo.auskunftLinkAbruf(ab.id), null, 'abgelaufen zählt nicht');
      assert.ok((await d.historie(max.id)).some((h) => /Link ist abgelaufen/.test(String(h.daten.text))));
      // Zurückziehen
      const n = (await rufe(admin, 'POST', '/api/werkbank/auskunft/:id/link', { params: { id: a.id }, body: { tage: 60 } })).body as { url: string; code: string; link: { id: string } };
      const ziel = join(ordner, 'export', 'auskunft');
      assert.ok(new Date((await auskuenfteIn(ziel))[0].bis).getTime() > Date.now() + 50 * 864e5);
      const w = (await rufe(admin, 'POST', '/api/werkbank/auskunft/link/:id/widerrufen', { params: { id: n.link.id } })).body as { widerrufen: string | null };
      assert.ok(w.widerrufen);
      assert.ok(new Date((await auskuenfteIn(ziel))[0].bis).getTime() < Date.now() + 8 * 864e5, 'zurück auf 7 Tage');
      await assert.rejects(rufe(null, 'POST', '/api/abruf', { body: { schluessel: n.url.split('#')[1], code: n.code } }), status(410));
      await assert.rejects(rufe(admin, 'POST', '/api/werkbank/auskunft/link/:id/widerrufen', { params: { id: crypto.randomUUID() } }), status(404));
      // Löschen der Auskunft zieht gültige Links mit zurück.
      const n3 = (await rufe(admin, 'POST', '/api/werkbank/auskunft/:id/link', { params: { id: a.id }, body: {} })).body as { link: { id: string } };
      await rufe(admin, 'DELETE', '/api/werkbank/auskunft/:id', { params: { id: a.id } });
      assert.equal(linkStatus((await r.repo.auskunftLinks()).find((x) => x.id === n3.link.id)!), 'widerrufen');
      assert.deepEqual((await readdir(ziel)).filter((x) => x.startsWith(a.id)), []);
      // Ohne ZIP kein Link
      await assert.rejects(rufe(admin, 'POST', '/api/werkbank/auskunft/:id/link', { params: { id: a.id }, body: {} }), status(404));
    });

    it('Abbruch: ein nicht zu Ende gelesener Download zählt, steht aber als abgebrochen in der Historie', async () => {
      const { d, admin, max, rufe, auskunft } = await aufbau(pg);
      const a = await auskunft();
      const { url, code } = (await rufe(admin, 'POST', '/api/werkbank/auskunft/:id/link', { params: { id: a.id }, body: {} })).body as { url: string; code: string };
      const t = (await rufe(null, 'POST', '/api/abruf', { body: { schluessel: url.split('#')[1], code } })).body as { ticket: string };
      const dl = await rufe(null, 'GET', '/api/abruf/datei', { query: { ticket: t.ticket } });
      (dl.datei!.inhalt as { destroy(): void }).destroy();
      await bis(async () => (await d.historie(max.id)).some((h) => /abgebrochen/.test(String(h.daten.text))));
      assert.ok((await d.historie(max.id)).some((h) => h.daten.zustellung === 'abruf' && h.daten.erfolg === false && /abgebrochen/.test(String(h.daten.text))));
    });
  });
}
