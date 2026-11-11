/**
 * Passwortgeschützte PDFs entsperren (#827): Erkennen, entsperrte Fassung mit qpdf (Passwort nur über die
 * Standardeingabe), Original unverändert, Historie, falsche Passwörter mit Grenze, Rechte-Sperre ohne Rückfrage,
 * Volltext/Vorschau/Stempel/Archivquelle aus der Fassung und gemerkte Passwörter im Konto (Variante A).
 * Beispiel-PDFs mit RC4 und AES entstehen im Test mit qpdf.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import { GEMERKT_MAX, namensvorschlag, VERSUCHE_MAX } from '../../shared/src/entsperren';
import { HISTORIENARTEN } from '../../shared/src/model';
import { ERSATZ_STEMPEL, type Stempel } from '../../shared/src/stempel';
import { fuerAusgabe } from '../src/ausgabe';
import { speicherFassungen } from '../src/dateiumwandlung';
import { speicherDateien } from '../src/dateispeicher';
import { Dienst } from '../src/dienst';
import { speicherEinstellungen } from '../src/einstellungen';
import { entsperrePdf, FalschesPasswort, gemerktSchluessel, passwortAus, PdfEntsperren, schutzVon } from '../src/entsperren';
import { Konten } from '../src/konten';
import { speicherKontoRepo } from '../src/konto-repo';
import { speicherRepo } from '../src/repo-speicher';
import { Texterkennung, textebeneEngine } from '../src/texterkennung';
import { entschluesseleMit, verschluesseleMit } from '../src/tresor';
import { speicherAblage, Vorschaubilder } from '../src/vorschau';
import { pdfMitText } from './hilfen';

const stempelVorlage = (x: Partial<Stempel> = {}): Stempel => ({ ...ERSATZ_STEMPEL, text: 'KOPIE', lage: 'diagonal', deckkraft: 0.3, seiten: 'alle', ...x });
const TEXT = 'Gehaltsabrechnung Oktober fuer Lena Beispiel';
const PW = 'Lena-2026!';

const hatQpdf = (() => { try { execFileSync('qpdf', ['--version'], { stdio: 'ignore' }); return true; } catch { return false; } })();
const ohneQpdf = hatQpdf ? false : 'qpdf nicht installiert';

const ordner: string[] = [];
after(async () => { for (const o of ordner) await rm(o, { recursive: true, force: true }); });

/** Geschütztes Beispiel-PDF mit qpdf: AES-256, RC4 (128 Bit) oder nur Rechte-Sperre. */
async function geschuetzt(art: 'aes' | 'rc4' | 'rechte', text = TEXT, pw = PW): Promise<Buffer> {
  const dir = await mkdtemp(join(tmpdir(), 'dms-a823-'));
  ordner.push(dir);
  await writeFile(join(dir, 'klar.pdf'), pdfMitText([text]));
  const args = art === 'aes' ? ['--encrypt', pw, 'Besitzer-1', '256', '--']
    : art === 'rc4' ? ['--allow-weak-crypto', '--encrypt', pw, 'Besitzer-1', '128', '--use-aes=n', '--']
      : ['--encrypt', '', 'Besitzer-1', '256', '--print=none', '--extract=n', '--'];
  execFileSync('qpdf', [...args, join(dir, 'klar.pdf'), join(dir, 'aus.pdf')], { stdio: 'ignore' });
  return readFile(join(dir, 'aus.pdf'));
}

const warte = async (bis: () => Promise<boolean>, ms = 20_000) => {
  const ende = Date.now() + ms;
  while (!(await bis())) {
    if (Date.now() > ende) throw new Error('Zeit abgelaufen');
    await new Promise((r) => setTimeout(r, 20));
  }
};

/** Dienst mit Texterkennung (Textebene mit pdftotext), Vorschaubildern, Fassungen und Entsperren im Speicher. */
async function aufbau() {
  const repo = speicherRepo();
  const dateien = speicherDateien();
  const einstellungen = speicherEinstellungen();
  const d = new Dienst(repo, dateien, { einstellungen });
  const konten = new Konten(speicherKontoRepo(), null, 'http://nas', d.systemtypen.benutzerspiegel());
  d.verbindeKonten(konten.papierkorbHaken());
  const { benutzer: lena } = await konten.einrichten({ email: 'lena@example.org', name: 'Lena Beispiel', passwort: 'ein-langes-passwort' });
  const { benutzer: jonas } = await konten.legeBenutzerAn({ email: 'jonas@example.org', name: 'Jonas Beispiel' }, lena.id);
  await d.postSystemmappen.gleicheBenutzerAb(await konten.listeBenutzer());
  const t = new Texterkennung(repo, dateien, einstellungen, textebeneEngine, async () => ({ pdftotext: true, pdftoppm: true }));
  d.dokumente.verbindeTexterkennung(t);
  const bilder = speicherAblage();
  const erzeugt: string[] = [];
  const vorschau = new Vorschaubilder(bilder, dateien, async (inhalt) => { erzeugt.push(inhalt.subarray(0, 8).toString('latin1')); return Buffer.from('bild'); });
  d.dokumente.verbindeVorschau(vorschau);
  const ablage = speicherFassungen();
  vorschau.fassung = (sha) => ablage.lies(sha);
  const schluessel = randomBytes(32);
  const e = new PdfEntsperren(d.geschuetztePdfs.entsperrenAnbindung({ ablage, speicher: einstellungen, verschluessele: (k) => verschluesseleMit(schluessel, k), entschluessele: (w) => entschluesseleMit(schluessel, w) }));
  d.geschuetztePdfs.verbindeEntsperren(e);
  t.entsperrt = (sha) => e.fassung(sha);
  const post = await d.eingangskanaele.postTyp();
  const register = post.register.find((r) => r.art === 'dokumente')!.key;
  /** Neue Post mit einem PDF; `fuer`: Konto aus „Für“. Wartet, bis der Volltext feststeht. */
  const ablegen = async (inhalt: Buffer, o: { fuer?: string; betreff?: string } = {}) => {
    const m = await d.post.legePostAn({ betreff: o.betreff ?? 'Gehaltsabrechnung Oktober 2026', ...(o.fuer ? { fuer: o.fuer } : {}) }, { id: lena.id, name: 'Lena' });
    const id = (await d.dokumente.ladeHoch(m.id, { register, name: 'abrechnung.pdf', typ: 'application/pdf' }, inhalt, lena.id)).dokument.id;
    await warte(async () => !['wartet', 'laeuft'].includes((await repo.holeDokument(id))!.ocr?.stand ?? 'wartet'));
    return { m, id };
  };
  const inMappe = async (mappeId: string, id: string) => (await d.mappen.holeMappe(mappeId)).dokumente.find((x) => x.id === id)!;
  return { d, e, t, repo, dateien, einstellungen, ablage, vorschau, erzeugt, lena, jonas, ablegen, inMappe, schluessel };
}

describe('Geschützte PDFs: qpdf (#827)', { skip: ohneQpdf }, () => {
  it('erkennt AES, RC4 und reine Rechte-Sperre; ungeschützte PDFs ohne Prozess', async () => {
    assert.equal(await schutzVon(pdfMitText([TEXT])), null);
    assert.equal(await schutzVon(await geschuetzt('aes')), 'passwort');
    assert.equal(await schutzVon(await geschuetzt('rc4')), 'passwort');
    assert.equal(await schutzVon(await geschuetzt('rechte')), 'rechte');
    assert.equal(await schutzVon(Buffer.from('kein PDF /Encrypt')), null);
  });

  it('entsperrt mit richtigem Passwort (AES, RC4), falsches Passwort ist ein eigener Fehler, Rechte-Sperre ohne Passwort', async () => {
    for (const art of ['aes', 'rc4'] as const) {
      const pdf = await geschuetzt(art);
      const frei = await entsperrePdf(pdf, PW);
      assert.equal(await schutzVon(frei), null, `${art}: entsperrt`);
      await assert.rejects(entsperrePdf(pdf, 'falsch'), FalschesPasswort);
      await assert.rejects(entsperrePdf(pdf, null), FalschesPasswort);
    }
    assert.equal(await schutzVon(await entsperrePdf(await geschuetzt('rechte'), null)), null);
    await assert.rejects(entsperrePdf(Buffer.from('%PDF-1.4 kaputt'), null), /nicht entsperren/);
  });

  it('das Passwort steht nie in der Befehlszeile von qpdf (geht über die Standardeingabe)', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'dms-a823-pfad-'));
    ordner.push(dir);
    const echt = execFileSync('sh', ['-c', 'command -v qpdf'], { encoding: 'utf8' }).trim();
    await writeFile(join(dir, 'qpdf'), `#!/bin/sh\nprintf '%s\\n' "$@" >> "${dir}/aufrufe"\nexec "${echt}" "$@"\n`);
    await chmod(join(dir, 'qpdf'), 0o755);
    const pdf = await geschuetzt('aes');
    const pfad = process.env.PATH;
    process.env.PATH = `${dir}:${pfad}`;
    try { await entsperrePdf(pdf, PW); } finally { process.env.PATH = pfad; }
    const aufrufe = await readFile(join(dir, 'aufrufe'), 'utf8');
    assert.match(aufrufe, /--password-file=-/);
    assert.ok(!aufrufe.includes(PW), 'Passwort nicht in den Argumenten');
  });

  it('Eingabe: Passwort Pflicht, ohne Zeilenumbruch, nicht zu lang; Namensvorschlag aus dem Betreff', () => {
    assert.throws(() => passwortAus(''), /eingeben/);
    assert.throws(() => passwortAus('a\nb'), /Zeilenumbruch/);
    assert.throws(() => passwortAus('x'.repeat(300)), /zu lang/);
    assert.equal(passwortAus(' mit Leerzeichen '), ' mit Leerzeichen ');
    assert.equal(namensvorschlag('AW: Gehaltsabrechnung Oktober 2026'), 'Gehaltsabrechnung');
    assert.equal(namensvorschlag('Befund vom 03.11.2026'), 'Befund vom');
  });
});

describe('Geschützte PDFs ablegen und entsperren (#827)', { skip: ohneQpdf }, () => {
  it('Hinweis am Dokument, ohne Volltext; mit Passwort: Fassung, Volltext, Historie – Original unverändert, Passwort nirgends gespeichert', async () => {
    const x = await aufbau();
    const pdf = await geschuetzt('aes');
    const { m, id } = await x.ablegen(pdf);
    const vorher = await x.inMappe(m.id, id);
    assert.deepEqual(vorher.pdfSchutz, { art: 'passwort', entsperrt: null });
    assert.equal(vorher.ocr?.stand, 'ausgelassen');
    assert.match(vorher.ocr?.info ?? '', /Passwort/);

    const r = await x.d.geschuetztePdfs.entsperreDokument(id, x.lena.id, { passwort: PW }, true);
    assert.equal(r.pdfSchutz?.entsperrt?.art, 'passwort');
    assert.equal(r.gemerkt, false);
    await warte(async () => (await x.repo.holeDokument(id))!.ocr?.stand === 'fertig');
    const nachher = await x.inMappe(m.id, id);
    assert.match(nachher.ocr?.info ?? '', /entsperrten Fassung/);
    assert.match((await x.d.volltexte.volltext(id)).text ?? '', /Gehaltsabrechnung Oktober/);
    // Original unverändert: gleicher Prüfwert, gleiche Bytes.
    assert.equal(nachher.sha256, vorher.sha256);
    assert.ok((((await x.d.dokumente.dokumentInhalt(id)).inhalt) as Buffer).equals(pdf));
    // Fassung zum Ansehen und für Pakete (GET /dokumente/{id}/fassung).
    const f = await x.d.dokumentUmwandlung.fassungVon(id);
    assert.equal(f.info.entsperrt?.art, 'passwort');
    assert.equal(await schutzVon(f.inhalt), null);
    // Historie: „Passwortschutz entfernt“ mit Person und Zeit.
    const h = (await x.repo.historie(m.id)).filter((e) => e.art === 'entsperrt');
    assert.equal(h.length, 1);
    assert.equal(h[0].benutzerId, x.lena.id);
    assert.equal(HISTORIENARTEN[h[0].art], 'Passwortschutz entfernt');
    // Vorschaubild aus der Fassung.
    await x.vorschau.fertig();
    assert.ok(x.erzeugt.length >= 1);
    // Das Passwort steht weder in den Einstellungen noch in der Historie.
    const alles = JSON.stringify([await x.repo.historie(m.id), await x.einstellungen.lies(gemerktSchluessel(x.lena.id))]);
    assert.ok(!alles.includes(PW));
  });

  it('falsches Passwort: verständliche Meldung mit Zahl der Versuche, danach gesperrt (429); kein Absturz', async () => {
    const x = await aufbau();
    const { id } = await x.ablegen(await geschuetzt('rc4'));
    for (let i = 1; i < VERSUCHE_MAX; i++) {
      await assert.rejects(x.d.geschuetztePdfs.entsperreDokument(id, x.jonas.id, { passwort: `falsch-${i}` }, true), (e: Error & { status?: number }) => e.status === 422 && /stimmt nicht\. Noch \d Versuch/.test(e.message));
    }
    await assert.rejects(x.d.geschuetztePdfs.entsperreDokument(id, x.jonas.id, { passwort: 'falsch-letzt' }, true), (e: Error & { status?: number }) => e.status === 422 && /Zu viele/.test(e.message));
    await assert.rejects(x.d.geschuetztePdfs.entsperreDokument(id, x.jonas.id, { passwort: PW }, true), (e: Error & { status?: number }) => e.status === 429);
    // Eine andere Person ist davon nicht betroffen.
    const r = await x.d.geschuetztePdfs.entsperreDokument(id, x.lena.id, { passwort: PW }, true);
    assert.equal(r.pdfSchutz?.entsperrt?.von, x.lena.id);
  });

  it('nur Rechte-Sperre: ohne Rückfrage entsperrt, ohne Eintrag in der Historie; Original bleibt', async () => {
    const x = await aufbau();
    const pdf = await geschuetzt('rechte');
    const { m, id } = await x.ablegen(pdf);
    await warte(async () => !!(await x.e.fassung((await x.repo.holeDokument(id))!.sha256)));
    const s = (await x.inMappe(m.id, id)).pdfSchutz;
    assert.equal(s?.art, 'rechte');
    assert.equal(s?.entsperrt?.art, 'rechte');
    assert.equal((await x.repo.historie(m.id)).filter((e) => e.art === 'entsperrt').length, 0);
    assert.ok((((await x.d.dokumente.dokumentInhalt(id)).inhalt) as Buffer).equals(pdf));
  });

  it('Stempel und Verkleinern nehmen die entsperrte Fassung; ohne Fassung bleibt die Meldung „verschlüsselt“', async () => {
    const x = await aufbau();
    const pdf = await geschuetzt('aes');
    const plan = { stempel: stempelVorlage({ text: 'Kopie' }), empfaenger: '', pflicht: false, vorlage: null };
    await assert.rejects(fuerAusgabe({ name: 'a.pdf', mime: 'application/pdf', inhalt: pdf }, { stempel: plan }, { benutzer: 'Lena', mappe: 'Post' }, true), /verschlüsselt/);
    const { id } = await x.ablegen(pdf);
    await x.d.geschuetztePdfs.entsperreDokument(id, x.lena.id, { passwort: PW }, true);
    const frei = (await x.e.fassung((await x.repo.holeDokument(id))!.sha256))!.inhalt;
    const a = await fuerAusgabe({ name: 'a.pdf', mime: 'application/pdf', inhalt: pdf }, { stempel: plan }, { benutzer: 'Lena', mappe: 'Post', entsperrt: async (b) => (b.equals(pdf) ? frei : null) }, true);
    assert.equal(a.gestempelt, true);
    assert.equal(await schutzVon(a.inhalt), null);
  });
});

describe('Passwörter für Dokumente merken (#827, Variante A)', { skip: ohneQpdf }, () => {
  it('merken beim Entsperren: verschlüsselt im Konto, Liste ohne Passwort, Anzeigen nur nach Bestätigung, höchstens 20', async () => {
    const x = await aufbau();
    const { id } = await x.ablegen(await geschuetzt('aes'));
    const r = await x.d.geschuetztePdfs.entsperreDokument(id, x.lena.id, { passwort: PW, merken: true, name: 'Gehaltsabrechnung' }, true);
    assert.equal(r.gemerkt, true);
    const roh = JSON.stringify(await x.einstellungen.lies(gemerktSchluessel(x.lena.id)));
    assert.ok(!roh.includes(PW), 'nicht im Klartext');
    assert.match(roh, /dms1\$/);
    const liste = await x.e.liste(x.lena.id);
    assert.deepEqual(liste.map((p) => p.name), ['Gehaltsabrechnung']);
    assert.ok(!JSON.stringify(liste).includes(PW));
    assert.deepEqual(await x.e.liste(x.jonas.id), [], 'gehört nur Lena');
    // Anzeigen erst nach Bestätigung, je Sitzung; falsche Bestätigung zählt.
    await assert.rejects(x.e.pruefeBestaetigt('sitzung-1'), (e: Error & { status?: number }) => e.status === 403);
    await assert.rejects(x.e.bestaetige(x.lena.id, 'sitzung-1', async () => { throw new Error('Das Passwort stimmt nicht.'); }), /stimmt nicht/);
    assert.equal(await x.e.bestaetigtBis('sitzung-1'), null);
    await x.e.bestaetige(x.lena.id, 'sitzung-1', async () => {});
    await assert.doesNotReject(x.e.pruefeBestaetigt('sitzung-1'));
    await assert.rejects(x.e.pruefeBestaetigt('sitzung-2'), 'andere Sitzung braucht eigene Bestätigung');
    assert.equal(await x.e.zeige(x.lena.id, liste[0].id), PW);
    // Merken in einer Vertretung oder mit API-Schlüssel: abgelehnt.
    const { id: id2 } = await x.ablegen(await geschuetzt('aes', 'Zweites Schreiben fuer Lena', 'anderes-pw'));
    await assert.rejects(x.d.geschuetztePdfs.entsperreDokument(id2, x.lena.id, { passwort: 'anderes-pw', merken: true, name: 'X' }, false), (e: Error & { status?: number }) => e.status === 403);
    // Ändern und Löschen.
    await x.e.aendere(x.lena.id, liste[0].id, { name: 'Lohn' });
    assert.equal((await x.e.liste(x.lena.id))[0].name, 'Lohn');
    for (let i = 1; i < GEMERKT_MAX; i++) await x.e.merke(x.lena.id, `P${i}`, `pw-${i}`);
    await assert.rejects(x.e.merke(x.lena.id, 'zu viel', 'pw-x'), (e: Error & { status?: number }) => e.status === 409);
    await x.e.loesche(x.lena.id, liste[0].id);
    assert.equal((await x.e.liste(x.lena.id)).length, GEMERKT_MAX - 1);
  });

  it('neue Post für eine Person: gemerktes Passwort passt → sofort entsperrt, Historie nennt den Namen; Post für alle: nichts', async () => {
    const x = await aufbau();
    await x.e.merke(x.jonas.id, 'Sonstiges', 'passt-nicht');
    await x.e.merke(x.jonas.id, 'Arztbrief', PW);
    const { m, id } = await x.ablegen(await geschuetzt('aes', 'Befund der Praxis fuer Jonas Beispiel'), { fuer: x.jonas.id });
    await warte(async () => (await x.inMappe(m.id, id)).pdfSchutz?.entsperrt != null);
    const s = (await x.inMappe(m.id, id)).pdfSchutz!;
    assert.equal(s.entsperrt?.art, 'gemerkt');
    assert.equal(s.entsperrt?.name, 'Arztbrief');
    const h = (await x.repo.historie(m.id)).find((e) => e.art === 'entsperrt')!;
    assert.match(String(h.daten.text), /gemerktem Passwort „Arztbrief“/);
    assert.ok((await x.e.liste(x.jonas.id)).find((p) => p.name === 'Arztbrief')!.zuletzt, '„zuletzt benutzt“ gesetzt');

    await warte(async () => (await x.repo.holeDokument(id))!.ocr?.stand === 'fertig');
    // Post für alle (ohne „Für“): kein stilles Durchprobieren.
    const b = await x.ablegen(await geschuetzt('aes', 'Brief an alle im Haushalt Beispiel'));
    await new Promise((r) => setTimeout(r, 300));
    assert.equal((await x.inMappe(b.m.id, b.id)).pdfSchutz?.entsperrt, null);
    // Post für Lena: Jonas' Passwörter gelten nicht.
    const c = await x.ablegen(await geschuetzt('aes', 'Brief an Lena Beispiel vom Amt'), { fuer: x.lena.id });
    await new Promise((r) => setTimeout(r, 300));
    assert.equal((await x.inMappe(c.m.id, c.id)).pdfSchutz?.entsperrt, null);
  });
});
