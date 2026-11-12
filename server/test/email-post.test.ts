/**
 * E-Mail-Postfach (#999): Eine abgeholte E-Mail ist genau eine Post; jeder Anhang wird ein eigenes Dokument in der
 * Reihenfolge der E-Mail (MIME-Struktur), die E-Mail selbst steht ganz hinten als „Original-E-Mail“ – als letzte Anlage
 * (#998) am letzten Anhang, ohne Anhänge als Hauptdokument. Sie wandert beim Zuordnen und Teilen mit, Erkennung und KI
 * lassen sie weg, kein Paket teilt solche Post (Trennblatt), „Post ab hier teilen“ geht von Hand. Bestehende Posts
 * bleiben, wie sie sind. Absender und Adressen sind erfunden (Personas, example.org). Der Kern läuft im Arbeitsspeicher
 * und – mit TEST_DATABASE_URL – gegen PostgreSQL.
 */
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { PDFDocument } from 'pdf-lib';
import { DMS_ANLAGEN_AB, eingangsreihenfolge, gruppiere, mitAnlagen, mitgehendeOriginalEmails, nurHauptdokumente, ohneErkennung } from '../../shared/src/anlagen';
import { POST_KANAL, type Dokument } from '../../shared/src/model';
import { ApiSchluesselDienst, speicherApiSchluesselRepo } from '../src/apischluessel';
import { speicherDateien } from '../src/dateispeicher';
import { Dienst } from '../src/dienst';
import { speicherEinstellungen } from '../src/einstellungen';
import { Fachfehler } from '../src/fehler';
import { liesMail } from '../src/imap';
import { Konten } from '../src/konten';
import { speicherKontoRepo, type KontoRepo } from '../src/konto-repo';
import { schluesselRecht } from '../src/laeufer/verwaltung';
import { Paketverwaltung } from '../src/pakete';
import { Postfaecher, type GeleseneMail, type ImapSitzung } from '../src/postfach';
import { anhaengeInReihenfolge, emlName } from '../src/postfach-anhaenge';
import type { Repo } from '../src/repo';
import { speicherRepo } from '../src/repo-speicher';
import { pruefeZugang, routen, type Anfrage, type Route } from '../src/routen';
import { zipPuffer } from '../src/zip';
import { eigeneDatenbank } from './hilfe-db';
import { wieImModus } from './hilfen';

const url = process.env.TEST_DATABASE_URL;
const HAUSHALT = '00000000-0000-4000-8000-000000000001';
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Verbindungen nur zum Schließen
const offen: any[] = [];
after(async () => { for (const s of offen) await s.end(); });

async function pgRepos(name: string): Promise<{ repo: Repo; konto: KontoRepo }> {
  const { pgRepo } = await import('../src/repo-pg');
  const { pgKontoRepo } = await import('../src/konto-repo');
  const { sql } = await eigeneDatenbank(name);
  offen.push(sql);
  await sql`INSERT INTO haushalte (id, name) VALUES (${HAUSHALT}, 'Test') ON CONFLICT DO NOTHING`;
  return { repo: pgRepo(sql, HAUSHALT), konto: pgKontoRepo(sql, HAUSHALT) };
}

const fehler = (s: number, re?: RegExp) => (e: unknown) => e instanceof Fachfehler && e.status === s && (!re || re.test(e.message));

async function pdf(seiten: number): Promise<Buffer> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < seiten; i++) doc.addPage([200 + i, 400]);
  return Buffer.from(await doc.save());
}

/** Eine Mail im Test: Die „Quelle“ ist JSON mit den Anhängen als Base64; der Leser macht daraus wieder die Mail. */
type TestMail = Omit<GeleseneMail, 'anhaenge' | 'datum'> & { datum?: string; anhaenge?: Array<{ name: string; mime: string; b64: string; eingebettet?: boolean }> };
const lies = async (q: Buffer): Promise<GeleseneMail> => {
  const m = JSON.parse(q.toString()) as TestMail;
  return { ...m, datum: m.datum ? new Date(m.datum) : null, anhaenge: (m.anhaenge ?? []).map((a) => ({ name: a.name, mime: a.mime, inhalt: Buffer.from(a.b64, 'base64'), eingebettet: !!a.eingebettet })) };
};
const anhang = (name: string, inhalt: Buffer, mime = 'application/pdf', eingebettet = false) => ({ name, mime, b64: inhalt.toString('base64'), eingebettet });

class TestServer {
  mails = new Map<number, Buffer>();
  naechste = 1;
  lege(m: TestMail) { this.mails.set(this.naechste++, Buffer.from(JSON.stringify(m))); }
  verbinde = async (): Promise<ImapSitzung> => {
    const s = { mails: this.mails };
    return {
      uidValidity: '1', anzahl: s.mails.size,
      async neue(ab) { return [...s.mails.entries()].filter(([u]) => u >= ab).map(([uid, q]) => ({ uid, messageId: (JSON.parse(q.toString()) as TestMail).messageId })); },
      async quelle(uid) { const q = s.mails.get(uid); if (!q) throw new Error('weg'); return q; },
      async verschiebe(uid) { s.mails.delete(uid); },
      async gelesen() {}, async loesche(uid) { s.mails.delete(uid); },
      async ordnerListe() { return ['INBOX', 'Ablago']; }, async schliessen() {},
    };
  };
}

/* ---------- Paket „Trennblatt“ als Archiv (teilt Post ohne Anlagen; braucht dafür kein dms:anlagen) ---------- */
const WASM = Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);
const archiv = (d: Record<string, string | Buffer>) => zipPuffer(Object.entries(d).map(([name, inhalt]) => ({ name, daten: Buffer.isBuffer(inhalt) ? inhalt : Buffer.from(inhalt) })), new Date('2026-01-01T12:00:00Z'));
const TRENNBLATT = {
  'manifest.yaml': `schema: 1\nid: trennblatt\nname: Trennblatt\nversion: 1.0.0\nbeschreibung: Test.\nautor: { name: Test, github: test }\nlizenz: MIT\ndms: ">=${DMS_ANLAGEN_AB}"\ninhalt: {}\ncode:\n  sprache: c\n  quelle: code/\n  ereignisse: [dokument.hochgeladen]\n  rechte:\n    lesen: [dms:post]\n    schreiben: [dms:post]\n    dokumente: schreiben\n    schnittstellen: []\n  netz: []\n`,
  'code/modul.wasm': WASM,
};
const ICH = { id: '00000000-0000-4000-8000-0000000000aa', email: 'admin@example.org' };

async function aufbau(pg: boolean, name: string, postfach: Record<string, unknown> = {}) {
  const r = pg ? await pgRepos(name) : { repo: speicherRepo(), konto: speicherKontoRepo() };
  const d = new Dienst(r.repo, speicherDateien(), { einstellungen: speicherEinstellungen() });
  const konten = new Konten(r.konto, () => null, () => 'http://localhost', d.systemtypen.benutzerspiegel());
  d.verbindeKonten(konten.papierkorbHaken());
  const { benutzer: lena } = await konten.einrichten({ email: 'lena@example.org', name: 'Lena', passwort: 'ein-langes-passwort' });
  await d.postSystemmappen.gleicheBenutzerAb(await konten.listeBenutzer());
  const server = new TestServer();
  const pf = new Postfaecher({ dienst: d, einstellungen: speicherEinstellungen(), verbinde: server.verbinde, lies, verschluessele: (k) => `v1:${k}`, entschluessele: (w) => w.slice(3) });
  const [p] = await pf.speichere({ name: 'Rechnungen', server: 'imap.example.org', port: 993, benutzer: 'ablage@example.org', passwort: 'app-passwort', ...postfach }, null, 'test');
  const postTyp = await d.eingangskanaele.postTyp();
  /** Mail einwerfen, abrufen und die eine neue Post mit ihren Dokumenten liefern. */
  const hole = async (m: TestMail) => {
    const vorher = new Set((await d.mappen.listeMappen(postTyp.id)).map((x) => x.id));
    server.lege(m);
    assert.equal(await pf.abrufen(p.id), 1);
    const neu = (await d.mappen.listeMappen(postTyp.id)).filter((x) => !vorher.has(x.id));
    assert.equal(neu.length, 1, 'genau eine Post je E-Mail');
    return { post: neu[0], dokumente: (await d.mappen.holeMappe(neu[0].id)).dokumente };
  };
  const pakete = new Paketverwaltung(d, { version: () => DMS_ANLAGEN_AB, abruf: async (u) => { throw new Error(`404 ${u}`); }, katalogUrl: 'https://katalog.test/katalog.json' });
  const h = await pakete.hochladen(archiv(TRENNBLATT), ICH);
  await pakete.installiere({ upload: h.upload, bestaetigt: true, rechteBestaetigt: true }, ICH);
  const schluessel = new ApiSchluesselDienst(speicherApiSchluesselRepo());
  const tabelle = routen(d, konten, { apiSchluessel: schluessel });
  const route = (m: string, pfad: string) => { const x = tabelle.find((y) => y.methode === m && y.pfad === pfad); assert.ok(x, `${m} ${pfad}`); return x!; };
  const alsLena = async (m: string, pfad: string, x: Partial<Anfrage> = {}) => route(m, pfad).handler({ body: {}, params: {}, query: {}, ip: '1', ...x, benutzer: wieImModus((await konten.listeBenutzer()).find((b) => b.id === lena.id)!) } as Anfrage);
  const alsPaket = async (m: string, pfad: string, x: Partial<Anfrage> = {}) => {
    const konto = await konten.dienstkonto('trennblatt', 'trennblatt');
    d.kern.paketKonten.set(konto.id, 'trennblatt');
    const laeufer = (await d.kern.repo.listePakete()).find((y) => y.id === 'trennblatt')!.laeufer!;
    const k = await schluessel.fuerDienstkonto(konto, schluesselRecht(laeufer));
    const anfrage = { body: {}, params: {}, query: {}, ip: '127.0.0.1', ...x } as Anfrage;
    const rt = route(m, `/api/v1${pfad}`);
    await pruefeZugang(rt as Route, anfrage, (n) => (n === 'authorization' ? `Bearer ${k}` : undefined), konten, schluessel);
    return rt.handler(anfrage);
  };
  const werkstatt = await d.mappentypen.legeTypAn({ name: 'Werkstatt', titelVorlage: '{nr}', felder: [{ key: 'nr', label: 'Nummer', typ: 'text' }], register: [
    { key: 'allgemein', name: 'Allgemein', art: 'felder', felder: ['nr'] },
    { key: 'belege', name: 'Belege', art: 'dokumente' },
  ] } as never);
  let nummer = 0;
  const neueMappe = async () => (await d.mappen.legeMappeAn({ typId: werkstatt.id, werte: { nr: `W-2026-${++nummer}` } }, lena.id)).id;
  return { d, pf, lena, hole, alsLena, alsPaket, neueMappe };
}

/** In der Reihenfolge, in der die Post sie zeigt: Eingang, Anlagen unter ihrem Hauptdokument. */
const wieInDerPost = (doks: Dokument[]) => gruppiere(eingangsreihenfolge(doks)).flatMap((g) => [g.haupt, ...g.anlagen]);

const DREI = async (): Promise<TestMail> => ({
  messageId: '<werkstatt-1@example.org>', betreff: 'Werkstatt: Unterlagen zum Auftrag', datum: '2026-11-10T08:00:00Z',
  absenderName: 'Jonas', absenderAdresse: 'jonas@example.org', text: 'Hallo Lena, anbei die Unterlagen.',
  // Bewusst nicht alphabetisch – die Reihenfolge der E-Mail gilt.
  anhaenge: [anhang('Zahlungsplan.pdf', await pdf(2)), anhang('logo.png', Buffer.from('png'), 'image/png', true), anhang('Angebot.pdf', await pdf(1)), anhang('Muster.pdf', await pdf(1))],
});

describe('E-Mail-Postfach (#999): Regeln', () => {
  it('Eingangsreihenfolge: erst nach eingangNr, dann nach dem Hochladen – nie nach Namen', () => {
    const d = (id: string, name: string, erstellt: string, eingangNr?: number) => ({ id, name, erstellt, ...(eingangNr ? { eingangNr } : {}) });
    const liste = [d('c', 'A-Nachtrag.pdf', '2026-11-10T09:00:00Z'), d('b', 'Angebot.pdf', '2026-11-10T08:00:03Z', 2), d('a', 'Zahlungsplan.pdf', '2026-11-10T08:00:05Z', 1), d('e', 'B.pdf', '2026-11-10T08:30:00Z')];
    assert.deepEqual(eingangsreihenfolge(liste).map((x) => x.id), ['a', 'b', 'e', 'c']);
  });

  it('Erkennung und KI lassen Anlagen und die Original-E-Mail weg, auch als Hauptdokument', () => {
    assert.equal(ohneErkennung({ originalEmail: true }), true);
    assert.equal(ohneErkennung({ anlageZu: 'x' }), true);
    assert.equal(ohneErkennung({}), false);
    assert.deepEqual(nurHauptdokumente([{ id: 'a', originalEmail: true }, { id: 'b' }, { id: 'c', anlageZu: 'b' }]).map((x) => x.id), ['b']);
  });

  it('Original-E-Mail geht als Anlage mit, sichtbar in der Liste und abwählbar (Wunsch Sicherheit, PR #1159)', () => {
    const alle = [{ id: 'a', name: 'A.pdf' }, { id: 'm', name: 'M.pdf' }, { id: 'h', name: 'HU.pdf', anlageZu: 'm', anlageNr: 1 }, { id: 'e', name: 'Mail.eml', anlageZu: 'm', anlageNr: 2, originalEmail: true }];
    const m = alle.filter((x) => x.id === 'm');
    assert.deepEqual(mitAnlagen(m, alle).map((x) => x.id), ['m', 'h', 'e'], 'Vorgabe: geht mit');
    assert.deepEqual(mitAnlagen(m, alle, true, false).map((x) => x.id), ['m', 'h'], 'abgewählt');
    assert.deepEqual(mitAnlagen(alle.filter((x) => x.id === 'm' || x.id === 'e'), alle, true, false).map((x) => x.id), ['m', 'h', 'e'], 'ausdrücklich gewählt geht sie');
    assert.deepEqual(mitgehendeOriginalEmails(m, alle).map((x) => x.id), ['e']);
    assert.deepEqual(mitgehendeOriginalEmails(alle.filter((x) => x.id === 'a'), alle), []);
  });

  it('Anhänge in der Reihenfolge der E-Mail, ohne eingebettete; Name der Original-E-Mail aus dem Betreff', () => {
    const a = (name: string, eingebettet = false) => ({ name, mime: 'application/pdf', inhalt: Buffer.from(name), eingebettet });
    assert.deepEqual(anhaengeInReihenfolge({ anhaenge: [a('Z.pdf'), a('logo.png', true), a('A.pdf')] }).map((x) => x.name), ['Z.pdf', 'A.pdf']);
    assert.equal(emlName('Re: Angebot 4711 / Mai'), 'Re Angebot 4711 Mai.eml');
    assert.equal(emlName(''), 'Mail.eml');
  });

  it('liesMail (mailparser): Anhänge genau in der MIME-Reihenfolge, Logo in multipart/related eingebettet', async () => {
    const b64 = (s: string) => Buffer.from(s).toString('base64');
    const teil = (grenze: string, typ: string, name: string, inhalt: string, cid?: string) =>
      `--${grenze}\r\nContent-Type: ${typ}; name="${name}"\r\nContent-Disposition: ${cid ? 'inline' : 'attachment'}; filename="${name}"\r\nContent-Transfer-Encoding: base64\r\n${cid ? `Content-ID: <${cid}>\r\n` : ''}\r\n${b64(inhalt)}\r\n`;
    const roh = 'From: Petra <petra@example.org>\r\nTo: ablage@example.org\r\nSubject: Drei Anlagen\r\nMessage-ID: <drei@example.org>\r\nMIME-Version: 1.0\r\n'
      + 'Content-Type: multipart/mixed; boundary="aussen"\r\n\r\n'
      + '--aussen\r\nContent-Type: multipart/related; boundary="innen"\r\n\r\n'
      + '--innen\r\nContent-Type: text/html; charset=utf-8\r\n\r\n<p>Hallo <img src="cid:logo1"></p>\r\n'
      + teil('innen', 'image/png', 'logo.png', 'kleines-logo', 'logo1') + '--innen--\r\n'
      + teil('aussen', 'application/pdf', 'Zahlungsplan.pdf', '%PDF-1.4 a')
      + teil('aussen', 'application/pdf', 'Angebot.pdf', '%PDF-1.4 b')
      + teil('aussen', 'image/jpeg', 'Foto Schaden.jpg', 'jpeg')
      + '--aussen--\r\n';
    const m = await liesMail(Buffer.from(roh));
    assert.deepEqual(m.anhaenge.map((a) => [a.name, a.eingebettet]), [['logo.png', true], ['Zahlungsplan.pdf', false], ['Angebot.pdf', false], ['Foto Schaden.jpg', false]]);
    assert.deepEqual(anhaengeInReihenfolge(m).map((a) => a.name), ['Zahlungsplan.pdf', 'Angebot.pdf', 'Foto Schaden.jpg']);
  });
});

for (const pg of [false, true]) {
  const wo = pg ? ' (PostgreSQL)' : '';
  let nr = 0;
  const neu = (o?: Record<string, unknown>) => aufbau(pg, `dmstest_x999_${++nr}`, o);
  describe(`E-Mail-Postfach (#999)${wo}`, { skip: pg && !url ? 'TEST_DATABASE_URL nicht gesetzt' : false }, () => {
    it('eine Post, jeder Anhang ein Dokument in der Reihenfolge der E-Mail, ganz hinten die Original-E-Mail', async () => {
      const x = await neu();
      const { post, dokumente } = await x.hole(await DREI());
      assert.equal(post.werte.kanal, POST_KANAL.email);
      const reihe = wieInDerPost(dokumente);
      assert.deepEqual(reihe.map((dok) => dok.name), ['Zahlungsplan.pdf', 'Angebot.pdf', 'Muster.pdf', 'Werkstatt Unterlagen zum Auftrag.eml'], 'Logo kein Dokument, keine Sortierung nach Namen');
      assert.deepEqual(reihe.map((dok) => dok.eingangNr), [1, 2, 3, 4]);
      const eml = reihe[3];
      assert.equal(eml.originalEmail, true);
      assert.equal(eml.anlageZu, reihe[2].id, 'als Anlage am letzten Anhang');
      assert.equal(eml.anlageNr, 1);
      assert.ok(reihe.slice(0, 3).every((dok) => !dok.originalEmail && !dok.anlageZu), 'die Anhänge sind eigene Dokumente');
    });

    it('ohne Anhänge ist die E-Mail das Hauptdokument; ohne „Original-Mail“ gibt es keine .eml', async () => {
      const x = await neu();
      const { dokumente } = await x.hole({ messageId: '<nur-text@example.org>', betreff: 'Kurze Frage', absenderName: 'Markus', absenderAdresse: 'markus@example.org', text: 'Passt Dienstag?' });
      assert.equal(dokumente.length, 1);
      assert.equal(dokumente[0].originalEmail, true);
      assert.equal(dokumente[0].anlageZu, undefined);
      const y = await neu({ original: false });
      const r = await y.hole(await DREI());
      assert.deepEqual(wieInDerPost(r.dokumente).map((dok) => dok.name), ['Zahlungsplan.pdf', 'Angebot.pdf', 'Muster.pdf']);
      assert.ok(r.dokumente.every((dok) => !dok.originalEmail));
    });

    it('Erkennung und Abgleich nutzen die Anhänge, nie die Original-E-Mail', async () => {
      const x = await neu();
      const { dokumente } = await x.hole({ messageId: '<ohne@example.org>', betreff: 'Nur Text', absenderName: 'Petra', absenderAdresse: 'petra@example.org', text: 'Gruß' });
      const A = await x.d.rechtepruefung.zugriff({ id: x.lena.id, rolle: 'admin' });
      // Ohne Volltext stünde die .eml in ohneText – sie wird gar nicht erst angesehen.
      assert.deepEqual((await x.d.erkennung.abgleichDokumente({ dokumente: [dokumente[0].id] }, A)).ohneText, []);
    });

    it('wandert beim Zuordnen mit dem letzten Anhang; „Post ab hier teilen“ nimmt sie mit', async () => {
      const x = await neu();
      const a = await x.hole(await DREI());
      const [z, , m] = wieInDerPost(a.dokumente);
      const ziel = await x.neueMappe();
      await x.d.post.ordneZu(a.post.id, { ziel, register: 'belege', dokumente: [m.id] }, x.lena.id);
      const inZiel = (await x.d.mappen.holeMappe(ziel)).dokumente;
      const eml = inZiel.find((dok) => dok.originalEmail);
      assert.ok(eml, 'Original-E-Mail ist mitgekommen');
      assert.equal(eml.anlageZu, m.id);
      assert.deepEqual((await x.d.mappen.holeMappe(a.post.id)).dokumente.map((dok) => dok.id).sort(), [z.id, wieInDerPost(a.dokumente)[1].id].sort());

      const b = await x.hole({ ...(await DREI()), messageId: '<werkstatt-2@example.org>' });
      const [z2, an2, m2, eml2] = wieInDerPost(b.dokumente);
      // Von Hand ab dem zweiten Dokument: der Rest (samt Original-E-Mail) wird eine neue Post.
      const r = await x.alsLena('POST', '/api/mappen/:id/abtrennen', { params: { id: b.post.id }, body: { dokumente: [an2.id, m2.id] } }) as { body: { neu: { id: string } } };
      const rest = (await x.d.mappen.holeMappe(b.post.id)).dokumente;
      assert.deepEqual(rest.map((dok) => dok.id), [z2.id]);
      const neuDoks = wieInDerPost((await x.d.mappen.holeMappe(r.body.neu.id)).dokumente);
      assert.deepEqual(neuDoks.map((dok) => dok.id), [an2.id, m2.id, eml2.id], 'Reihenfolge bleibt');
      assert.equal(neuDoks[2].anlageZu, m2.id);
    });

    it('„Original-E-Mail mitnehmen“ abgewählt: bleibt beim Übernehmen in der Post, fehlt im ZIP und in der E-Mail', async () => {
      const x = await neu();
      const a = await x.hole(await DREI());
      const [z, an, m, eml] = wieInDerPost(a.dokumente);
      const ziel = await x.neueMappe();
      await x.d.post.ordneZu(a.post.id, { ziel, register: 'belege', dokumente: [z.id, an.id, m.id], originalEmail: false }, x.lena.id);
      assert.deepEqual((await x.d.mappen.holeMappe(ziel)).dokumente.map((dok) => dok.id).sort(), [z.id, an.id, m.id].sort(), 'ohne Original-E-Mail');
      const inPost = (await x.d.mappen.holeMappe(a.post.id)).dokumente;
      assert.deepEqual(inPost.map((dok) => dok.id), [eml.id], 'sie bleibt in der Post');
      assert.ok(!inPost[0].anlageZu, 'als eigenes Dokument');
      assert.equal(inPost[0].originalEmail, true, 'Kennzeichen bleibt');

      // Herunterladen „mit Anlagen“: Vorgabe mit Original-E-Mail (ZIP), abgewählt nur das Dokument.
      const b = await x.hole({ ...(await DREI()), messageId: '<werkstatt-3@example.org>' });
      const m2 = wieInDerPost(b.dokumente)[2];
      const lade = async (body: Record<string, unknown>) => ((await x.alsLena('POST', '/api/dokumente/:id/herunterladen', { params: { id: m2.id }, body })) as { datei: { name: string } }).datei.name;
      assert.match(await lade({ mitAnlagen: true }), /\.zip$/);
      assert.equal(await lade({ mitAnlagen: true, originalEmail: false }), 'Muster.pdf');
      // E-Mail-Versand: dieselbe Auswahl über AusgangDienst.mitAnlagen.
      const alle = (await x.d.mappen.holeMappe(b.post.id)).dokumente;
      assert.deepEqual(x.d.ausgang.mitAnlagen([m2], alle, true).map((dok) => dok.name), ['Muster.pdf', 'Werkstatt Unterlagen zum Auftrag.eml']);
      assert.deepEqual(x.d.ausgang.mitAnlagen([m2], alle, true, false).map((dok) => dok.name), ['Muster.pdf']);
    });

    it('Trennblatt: kein Paket teilt Post aus dem Postfach (409); andere Post schon, von Hand auch die E-Mail', async () => {
      const x = await neu();
      const { post, dokumente } = await x.hole(await DREI());
      const plan = wieInDerPost(dokumente)[0];
      const body = { seiten: [{ nr: 1 }, { nr: 2 }], teile: [0, 1] };
      await assert.rejects(x.alsPaket('POST', '/dokumente/:id/seiten', { params: { id: plan.id }, body }), fehler(409, /E-Mail-Postfach/));
      assert.equal((await x.d.mappen.holeMappe(post.id)).dokumente.length, 4, 'nichts geteilt');
      // Andere Post (Kanal „Hochgeladen“): das Paket darf.
      const andere = await x.d.post.legePostAn({ betreff: 'Sammelscan' }, { id: x.lena.id, name: 'Lena' });
      const scan = (await x.d.dokumente.ladeHoch(andere.id, { register: 'dokumente', name: 'Scan.pdf', typ: 'application/pdf' }, await pdf(2), x.lena.id)).dokument;
      const r = await x.alsPaket('POST', '/dokumente/:id/seiten', { params: { id: scan.id }, body }) as { body: { posten: unknown[] } };
      assert.equal(r.body.posten.length, 2);
      // Von Hand teilt Lena auch die E-Mail-Post.
      const h = await x.alsLena('POST', '/api/dokumente/:id/seiten', { params: { id: plan.id }, body }) as { body: { posten: unknown[] } };
      assert.equal(h.body.posten.length, 2);
    });

    it('Bearbeiten ohne Versionierung: das neue Dokument behält seinen Platz und das Kennzeichen bleibt', async () => {
      const x = await neu();
      const { post, dokumente } = await x.hole(await DREI());
      const plan = wieInDerPost(dokumente)[0];
      // Seite 2 weglassen – das Ergebnis ersetzt das Dokument (oder wird eine neue Version).
      await x.alsLena('POST', '/api/dokumente/:id/seiten', { params: { id: plan.id }, body: { seiten: [{ nr: 1 }], bestaetigt: true } });
      const reihe = wieInDerPost((await x.d.mappen.holeMappe(post.id)).dokumente);
      assert.deepEqual(reihe.map((dok) => [dok.name, dok.eingangNr]), [['Zahlungsplan.pdf', 1], ['Angebot.pdf', 2], ['Muster.pdf', 3], ['Werkstatt Unterlagen zum Auftrag.eml', 4]]);
      assert.equal(reihe[3].originalEmail, true);
    });
  });
}
