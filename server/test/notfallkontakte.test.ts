/**
 * Notfallkontakte (#812) mit den Kriterien der Durchsicht Sicherheit (12.11.2026): Grenzen (auch gleichzeitig),
 * Mails je Kontakt, Inhalt der Mail (nur Text, kein Link, keine Adresse von Ablago, keine Notiz), Namen bereinigt und
 * Link-Artiges abgelehnt, Reply-To nur mit Haken, Bereich „verschluesselung“, nicht in einer Vertretung, Protokoll mit
 * gekürzter Adresse, Notfallblatt, Exporte. Namen sind Personas, Adressen unter example.org. Läuft im Arbeitsspeicher
 * und – mit TEST_DATABASE_URL – gegen PostgreSQL (Grenzen über alle Verbindungen).
 */
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { speicherDateien } from '../src/dateispeicher';
import { Dienst } from '../src/dienst';
import { speicherEinstellungen } from '../src/einstellungen';
import { Fachfehler } from '../src/fehler';
import { speicherKurzzustand, type Kurzzustand } from '../src/kurzzustand';
import type { Mailer, MailOptionen } from '../src/mail';
import { notfallblatt, notfallblattPlan } from '../src/notfallblatt';
import { notfallMail } from '../src/notfallkontakte';
import { protokoll } from '../src/protokoll';
import type { Repo } from '../src/repo';
import { speicherRepo } from '../src/repo-speicher';
import type { Anfrage } from '../src/routen';
import { bereicheDerRoute } from '../src/verwaltungsbereiche';
import { ladePdf } from '../src/pdf/laden';
import { blattFingerabdruck, gekuerzteAdresse, linkartig, mailName, NOTFALLKONTAKT_MAILS_JE_TAG, pruefeNotfallkontakt } from '../../shared/src/notfallkontakte';
import { darfBereich } from '../../shared/src/verwaltungsrecht';
import { eigeneDatenbank } from './hilfe-db';

const url = process.env.TEST_DATABASE_URL;
const HAUSHALT = '00000000-0000-4000-8000-000000000001';
const LENA = { id: '00000000-0000-4000-8000-0000000000a1', name: 'Lena', email: 'lena@example.org', sprache: 'de' };
const MARKUS = { id: '00000000-0000-4000-8000-0000000000a2', name: 'Markus', email: 'markus@example.org', sprache: 'de' };
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Verbindungen nur zum Schließen
const offen: any[] = [];
after(async () => { for (const s of offen) await s.end(); });

interface Gesendet { an: string; betreff: string; text: string; o?: MailOptionen }
function postausgang(): Mailer & { mails: Gesendet[] } {
  const mails: Gesendet[] = [];
  return { mails, async sende(an, betreff, text, o) { mails.push({ an, betreff, text, o }); } };
}

const fehler = (s: number, re?: RegExp) => (e: unknown) => e instanceof Fachfehler && e.status === s && (!re || re.test(e.message));

async function umgebung(o: { repo?: Repo; zustand?: Kurzzustand; mailer?: Mailer | null; ablage?: string } = {}) {
  const d = new Dienst(o.repo ?? speicherRepo(), speicherDateien(), { einstellungen: speicherEinstellungen(), zustand: o.zustand ?? speicherKurzzustand() });
  const post = postausgang();
  let mailer: Mailer | null = o.mailer === undefined ? post : o.mailer;
  const personen = new Map([[LENA.id, LENA], [MARKUS.id, MARKUS]]);
  d.notfallkontakte.verbinde({ mailer: () => mailer, ablageName: async () => o.ablage ?? 'Familie Beispiel', person: async (id) => personen.get(id) });
  return { d, n: d.notfallkontakte, post, setzeMailer: (m: Mailer | null) => { mailer = m; }, personen };
}

const jonas = (x: Record<string, unknown> = {}) => ({ name: 'Jonas', email: 'jonas@example.org', telefon: '0151 0000000', notiz: 'mein Bruder, hat beim Einrichten geholfen', ...x });

describe('Notfallkontakte (#812): Eingaben', () => {
  it('Namen mit ://, www. oder @ werden abgelehnt; Steuerzeichen und Zeilenumbrüche fallen weg, höchstens 60 Zeichen', () => {
    for (const name of ['https://example.org', 'Jonas www.example.org', 'jonas@example.org', 'ftp://x']) {
      assert.ok(pruefeNotfallkontakt(jonas({ name })).fehler.includes('name-link'), name);
    }
    assert.deepEqual(pruefeNotfallkontakt(jonas()).fehler, []);
    const w = pruefeNotfallkontakt(jonas({ name: 'Jonas\r\nBcc: x‮\u0000', email: ' Jonas@Example.org ' })).wert;
    assert.equal(w.name, 'Jonas Bcc: x');
    assert.equal(w.email, 'jonas@example.org');
    assert.ok(pruefeNotfallkontakt(jonas({ name: 'x'.repeat(61) })).fehler.includes('name-lang'));
    assert.equal(mailName(`Lena\nBcc: markus@example.org ${'x'.repeat(80)}`).length, 60);
    assert.ok(!/[\r\n]/.test(mailName('Lena\r\nBcc')));
    assert.ok(linkartig('www.example.org'));
    assert.ok(!linkartig('Lena B.'));
    assert.equal(gekuerzteAdresse('lena@example.org'), 'l***@example.org');
  });
});

describe('Notfallkontakte (#812): Mails je Kontakt', () => {
  it('eine beim Anlegen, keine bei geändertem Namen, eine an die neue Adresse, eine beim Löschen', async () => {
    const { n, post } = await umgebung();
    const r = await n.anlegen(jonas(), LENA);
    assert.equal(r.mail, 'verschickt');
    assert.equal(r.kontakt?.mailStand, 'verschickt');
    assert.equal(r.kontakt?.eingetragenVon, LENA.id);
    assert.equal(post.mails.length, 1);
    assert.equal(post.mails[0].an, 'jonas@example.org');
    const id = r.kontakt!.id;
    assert.equal((await n.aendern(id, jonas({ name: 'Jonas Beispiel', telefon: '0152 1111111' }), LENA)).mail, 'keine');
    assert.equal(post.mails.length, 1, 'Name und Telefon geändert: keine Mail');
    assert.equal((await n.aendern(id, jonas({ email: 'jonas.neu@example.org' }), LENA)).mail, 'verschickt');
    assert.equal(post.mails.length, 2);
    assert.equal(post.mails[1].an, 'jonas.neu@example.org', 'an die neue Adresse');
    assert.equal((await n.loeschen(id, LENA)).mail, 'verschickt');
    assert.equal(post.mails.length, 3);
    assert.match(post.mails[2].betreff, /nicht mehr Notfallkontakt/);
    assert.deepEqual(await n.liste(), []);
  });

  it('„Erneut senden“ höchstens einmal je Kontakt und Tag', async () => {
    const { n, post } = await umgebung();
    const { kontakt } = await n.anlegen(jonas(), LENA);
    await n.erneutSenden(kontakt!.id, LENA);
    await assert.rejects(n.erneutSenden(kontakt!.id, LENA), fehler(429));
    assert.equal(post.mails.length, 2);
    const s = await n.stand(null);
    assert.equal(s.kontakte[0].erneutMoeglich, false);
  });

  it('ohne E-Mail-Versand: „offen“, keine Löschmail; sobald eingerichtet, verschickt der Zeitplan', async () => {
    const { n, post, setzeMailer } = await umgebung({ mailer: null });
    const r = await n.anlegen(jonas(), LENA);
    assert.equal(r.mail, 'offen');
    assert.equal((await n.stand(null)).versand, false);
    await assert.rejects(n.erneutSenden(r.kontakt!.id, LENA), fehler(409));
    const petra = await n.anlegen(jonas({ name: 'Petra', email: 'petra@example.org' }), LENA);
    assert.equal((await n.loeschen(petra.kontakt!.id, LENA)).mail, 'keine', 'nie informiert: keine Mitteilung');
    setzeMailer(post);
    assert.equal(await n.zustellen(), 1);
    assert.equal(post.mails.length, 1);
    assert.equal((await n.liste())[0].mailStand, 'verschickt');
    assert.equal(await n.zustellen(), 0, 'nichts doppelt');
  });
});

describe('Notfallkontakte (#812): Inhalt der Mail', () => {
  it('nur Text, kein Link, keine Adresse von Ablago, keine Notiz; nennt Person, Ablage, Kontakt und den Widerspruch', async () => {
    const { n, post } = await umgebung();
    await n.anlegen(jonas({ notiz: 'Schlüssel liegt im Flurschrank' }), LENA);
    const m = post.mails[0];
    assert.ok(!/<[a-z!/]/i.test(m.text), 'kein HTML');
    assert.ok(!/https?:|www\.|:\/\//i.test(m.text + m.betreff), 'kein Link');
    assert.ok(!/Flurschrank|Bruder/.test(m.text), 'keine Notiz');
    assert.ok(!m.o?.anhaenge, 'kein Anhang');
    assert.ok(!/ablage\.example|localhost|127\.0\.0\.1|\d+\.\d+\.\d+\.\d+/.test(m.text), 'keine Adresse von Ablago');
    assert.match(m.text, /Hallo Jonas,/);
    assert.match(m.text, /Lena hat dich als Notfallkontakt für die Ablage „Familie Beispiel“/);
    assert.match(m.text, /keinen Zugang/);
    assert.match(m.text, /Möchtest du nicht als Notfallkontakt eingetragen sein, sag es Lena\./);
    assert.match(m.text, /Kennst du Lena nicht/);
    assert.equal(m.betreff, 'Lena hat dich als Notfallkontakt eingetragen');
    assert.equal(m.o?.anImProtokoll, 'j***@example.org');
  });

  it('Zeilenumbruch im Namen kommt nicht in den Betreff; Link-Artiges in eigenem Namen oder Ablage: 422', async () => {
    const { n, post, personen } = await umgebung();
    // Die Mail nennt die eintragende Person mit ihrem aktuellen Namen aus dem Konto.
    personen.set(LENA.id, { ...LENA, name: 'Lena\r\nBcc: markus' });
    await n.anlegen(jonas({ name: 'Jonas\nBcc: x' }), { ...LENA, name: 'Lena\r\nBcc: markus' });
    assert.ok(!/[\r\n]/.test(post.mails[0].betreff));
    assert.equal(post.mails[0].betreff, 'Lena Bcc: markus hat dich als Notfallkontakt eingetragen');
    await assert.rejects(n.anlegen(jonas({ name: 'Jonas https://example.org' }), LENA), fehler(422));
    await assert.rejects(n.anlegen(jonas({ name: 'jonas@example.org' }), LENA), fehler(422));
    await assert.rejects(n.anlegen(jonas(), { ...LENA, name: 'www.example.org' }), fehler(422));
    const b = await umgebung({ ablage: 'Ablage www.example.org' });
    await assert.rejects(b.n.anlegen(jonas(), LENA), fehler(422));
    // Platzhalter nur drei Namen – auch auf Englisch.
    const [betreff, text] = notfallMail('info', { wer: 'Lena', ablage: 'Familie Beispiel', kontakt: 'Jonas' });
    assert.ok(betreff && text.includes('Jonas'));
  });

  it('Reply-To nur mit Haken, und einschalten nur, wer eingetragen hat', async () => {
    const { n, post } = await umgebung();
    const ohne = await n.anlegen(jonas(), LENA);
    assert.equal(post.mails[0].o?.antwortAn, undefined);
    await n.anlegen(jonas({ name: 'Petra', email: 'petra@example.org', antwortAn: true }), LENA);
    assert.equal(post.mails[1].o?.antwortAn, 'lena@example.org');
    await assert.rejects(n.aendern(ohne.kontakt!.id, jonas({ antwortAn: true }), MARKUS), fehler(403));
    const r = await n.aendern(ohne.kontakt!.id, jonas({ antwortAn: true }), LENA);
    assert.equal(r.kontakt?.antwortAn, true);
  });
});

describe('Notfallkontakte (#812): Zugang', () => {
  it('nur mit Bereich „verschluesselung“ (oder Gesamter Verwaltung)', () => {
    for (const [m, p] of [['GET', '/api/werkbank/notfallkontakte'], ['POST', '/api/werkbank/notfallkontakte'], ['PUT', '/api/werkbank/notfallkontakte/:id'], ['DELETE', '/api/werkbank/notfallkontakte/:id'], ['POST', '/api/werkbank/notfallkontakte/:id/erneut']]) {
      assert.deepEqual(bereicheDerRoute(m, p), ['verschluesselung'], `${m} ${p}`);
    }
    assert.equal(darfBereich({ verwaltung: ['verschluesselung'] }, 'verschluesselung'), true);
    assert.equal(darfBereich({ verwaltung: ['sicherung'] }, 'verschluesselung'), false);
    assert.equal(darfBereich({ verwaltung: ['*'] }, 'verschluesselung'), true);
  });

  it('nicht in einer Vertretung (#43)', async () => {
    const { d } = await umgebung();
    const { routen } = await import('../src/routen');
    const { Konten } = await import('../src/konten');
    const { speicherKontoRepo } = await import('../src/konto-repo');
    const tabelle = routen(d, new Konten(speicherKontoRepo(), () => null, () => 'http://localhost', d.systemtypen.benutzerspiegel()), {});
    const route = tabelle.find((r) => r.methode === 'POST' && r.pfad === '/api/werkbank/notfallkontakte')!;
    const a = { body: jonas(), params: {}, query: {}, ip: '1', verwaltungsmodus: true, benutzer: { ...LENA, rolle: 'admin', verwaltung: ['*'], aktiv: true }, sitzungsDaten: { vertretungId: 'v1' } } as unknown as Anfrage;
    await assert.rejects(route.handler(a), fehler(403, /Vertretung/));
    const ohne = { ...a, sitzungsDaten: {} } as Anfrage;
    const r = await route.handler(ohne) as { status: number };
    assert.equal(r.status, 201);
  });
});

describe('Notfallkontakte (#812): Protokoll und Notfallblatt', () => {
  it('Protokoll mit gekürzter Adresse und wer es getan hat – nie die volle Adresse', async () => {
    const seit = protokoll.eintraege({ max: 1 })[0]?.nr ?? 0;
    const { n } = await umgebung();
    const { kontakt } = await n.anlegen(jonas({ email: 'katrin.lang@example.org', name: 'Katrin' }), LENA);
    await n.loeschen(kontakt!.id, LENA);
    const zeilen = protokoll.eintraege({ seit, max: 100 });
    const texte = zeilen.map((e) => e.text);
    for (const x of ['Notfallkontakt angelegt', 'Info-Mail an Notfallkontakt verschickt', 'Notfallkontakt gelöscht']) assert.ok(texte.includes(x), x);
    const alles = JSON.stringify(zeilen);
    assert.ok(!alles.includes('katrin.lang@example.org'), 'volle Adresse nicht im Protokoll');
    assert.ok(alles.includes('k***@example.org'));
    assert.ok(zeilen.some((e) => e.text === 'Notfallkontakt angelegt' && (e.daten as Record<string, unknown>).von === 'lena@example.org'));
  });

  it('auf dem Notfallblatt unter „Wen fragen?“ mit Telefon, E-Mail und Notiz; Änderung: neu ausdrucken', async () => {
    const { n } = await umgebung();
    const { kontakt } = await n.anlegen(jonas(), LENA);
    const blatt = { name: 'Familie Beispiel', haushaltId: HAUSHALT, adresse: 'https://ablage.example.org', version: '0.257.0', erstellt: new Date('2026-11-12T10:00:00Z'), schluessel: 'O0o1lI-_AbCdEfGhJkMnPqRsTuVwXyZ23456789aBcD', fingerabdruck: 'a1b2c3d4e5f60718' };
    const p = notfallblattPlan({ ...blatt, kontakte: (await n.fuerBlatt()).map((k) => ({ name: k.name, erreichbar: `${k.telefon} · ${k.email}`, notiz: k.notiz })) });
    assert.deepEqual(p.fragen.kontakte, [{ name: 'Jonas', erreichbar: '0151 0000000 · jonas@example.org', notiz: 'mein Bruder, hat beim Einrichten geholfen' }]);
    assert.equal(p.fragen.leer, null);
    assert.equal(await n.blattVeraltet(null), false, 'ohne Blatt kein Hinweis');
    await n.blattErstellt();
    assert.equal(await n.blattVeraltet('2026-11-12T10:00:00Z'), false);
    await n.aendern(kontakt!.id, jonas({ telefon: '0152 2222222' }), LENA);
    assert.equal(await n.blattVeraltet('2026-11-12T10:00:00Z'), true);
    assert.equal((await n.stand('2026-11-12T10:00:00Z')).blattVeraltet, true);
    assert.equal(blattFingerabdruck([]), '', 'Blatt vor #812 ohne Kontakte gilt als aktuell');
  });

  it('zehn lange Kontakte: weichen auf Seite 2 aus, die erste Seite verweist dorthin', async () => {
    const lang = Array.from({ length: 10 }, (_, i) => ({ name: `Katrin Beispiel-Mustermann ${i}`.padEnd(60, 'x'), erreichbar: `+49 151 0000000${i} · katrin.beispiel-mustermann.${i}@example.org`, notiz: 'Schwester, kennt das NAS im Keller und weiß, wo der Ordner mit den Unterlagen steht. '.repeat(2).slice(0, 120) }));
    const d = { name: 'Familie Beispiel', haushaltId: HAUSHALT, adresse: 'https://ablage.example.org', version: '0.257.0', erstellt: new Date(), schluessel: 'O0o1lI-_AbCdEfGhJkMnPqRsTuVwXyZ23456789aBcD', fingerabdruck: 'a1b2c3d4e5f60718', notfallcode: 'WXYZ2345ABCDEFGHJKLMNPQRSTUV' };
    const doc = await ladePdf(await notfallblatt({ ...d, kontakte: lang }));
    assert.equal(doc.getPageCount(), 2);
    const zwei = await ladePdf(await notfallblatt({ ...d, kontakte: lang.slice(0, 2).map((k) => ({ ...k, notiz: '' })) }));
    assert.equal(zwei.getPageCount(), 1, 'wenige Kontakte: eine Seite');
  });
});

describe('Notfallkontakte (#812): Exporte', () => {
  it('Vollexport alle, persönlicher Export die eigenen', async () => {
    const { d, n } = await umgebung();
    await n.anlegen(jonas(), LENA);
    await n.anlegen(jonas({ name: 'Petra', email: 'petra@example.org' }), MARKUS);
    const voll = d.vollexport.vollexportQuelle({ mandant: 'Familie Beispiel', version: '0', benutzer: async () => ({ benutzer: [], vertretungen: [] }), designs: async () => [], protokoll: () => [] });
    assert.equal((await voll.notfallkontakte!()).length, 2);
    const z = await d.rechtepruefung.zugriff({ id: LENA.id, rolle: 'mitglied' });
    const eigen = await d.vollexport.persoenlicheQuelle(z, { mandant: 'Familie Beispiel', version: '0', ich: { benutzer: [], vertretungen: [] } });
    assert.deepEqual((await eigen.notfallkontakte!() as Array<{ name: string }>).map((k) => k.name), ['Jonas']);
  });
});

describe('Notfallkontakte (#812): Grenzen', () => {
  async function pruefeGrenzen(repo: () => Promise<Repo>, zustand: () => Promise<Kurzzustand>) {
    // Höchstens 10 Kontakte – auch bei 14 gleichzeitigen Anfragen.
    const a = await umgebung({ repo: await repo(), zustand: await zustand(), mailer: null });
    const r = await Promise.allSettled(Array.from({ length: 14 }, (_, i) => a.n.anlegen(jonas({ name: `Jonas ${i}`, email: `jonas${i}@example.org` }), LENA)));
    assert.equal(r.filter((x) => x.status === 'fulfilled').length, 10);
    assert.ok(r.filter((x) => x.status === 'rejected').every((x) => fehler(409)((x as PromiseRejectedResult).reason)));
    assert.equal((await a.n.liste()).length, 10);
    // Höchstens 20 Mails je Ablage und Tag – über alle Prozesse (zwei Dienste, ein Kurzzustand), auch gleichzeitig.
    const geteilt = await zustand();
    const gemeinsam = await repo();
    const p1 = await umgebung({ repo: gemeinsam, zustand: geteilt });
    const p2 = await umgebung({ repo: gemeinsam, zustand: geteilt });
    const erste = await Promise.allSettled(Array.from({ length: 10 }, (_, i) => (i % 2 ? p1 : p2).n.anlegen(jonas({ name: `Petra ${i}`, email: `petra${i}@example.org` }), LENA)));
    assert.equal(erste.filter((x) => x.status === 'fulfilled').length, 10);
    const ids = (await p1.n.liste()).map((k) => k.id);
    const zweite = await Promise.allSettled(ids.flatMap((id, i) => [p1, p2].map((p) => p.n.aendern(id, jonas({ name: `Petra ${i}`, email: `petra${i}.${p === p1 ? 'a' : 'b'}@example.org` }), LENA))));
    const ok = zweite.filter((x) => x.status === 'fulfilled').length;
    assert.equal(ok, NOTFALLKONTAKT_MAILS_JE_TAG - 10, 'genau bis zur Grenze');
    assert.ok(zweite.filter((x) => x.status === 'rejected').every((x) => fehler(429)((x as PromiseRejectedResult).reason)));
    assert.equal(p1.post.mails.length + p2.post.mails.length, NOTFALLKONTAKT_MAILS_JE_TAG);
    // Löschen geht auch über der Grenze – nur ohne Mitteilung.
    assert.equal((await p1.n.loeschen(ids[0], LENA)).mail, 'grenze');
    assert.equal(p1.post.mails.length + p2.post.mails.length, NOTFALLKONTAKT_MAILS_JE_TAG);
  }

  it('im Arbeitsspeicher', async () => {
    const z = speicherKurzzustand();
    let repo: Repo | null = null;
    await pruefeGrenzen(async () => (repo = speicherRepo()), async () => z);
    assert.ok(repo);
  });

  it('PostgreSQL: über alle Verbindungen', { skip: !url }, async () => {
    const { sql } = await eigeneDatenbank('notfallkontakte', { max: 10 });
    offen.push(sql);
    await sql`INSERT INTO haushalte (id, name) VALUES (${HAUSHALT}, 'Test') ON CONFLICT DO NOTHING`;
    await sql`INSERT INTO benutzer (id, haushalt_id, email, name, rolle, verwaltung) VALUES (${LENA.id}, ${HAUSHALT}, ${LENA.email}, 'Lena', 'mitglied', '{verschluesselung}'), (${MARKUS.id}, ${HAUSHALT}, ${MARKUS.email}, 'Markus', 'mitglied', '{}')`;
    const { pgRepo } = await import('../src/repo-pg');
    const { pgKurzzustand } = await import('../src/kurzzustand');
    let n = 0;
    await pruefeGrenzen(async () => {
      // Jeder Durchgang eine leere Tabelle.
      if (n++ < 2) await sql`DELETE FROM notfallkontakte`;
      return pgRepo(sql, HAUSHALT);
    }, async () => { await sql`DELETE FROM kurzzustand`; return pgKurzzustand(sql, HAUSHALT); });
    // Eingetragen von: Verweis auf das Konto.
    const k = (await pgRepo(sql, HAUSHALT).notfallkontakte())[0];
    assert.ok(k);
    assert.equal(k.eingetragenVon, LENA.id);
  });
});
