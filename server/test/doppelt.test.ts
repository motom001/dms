/**
 * Doppelte Dateien erkennen (#333): Fundstellen nur in lesbaren Mappen, Hochladen nennt nur lesbare,
 * Eingangsordner und Postfach mit Hinweis ohne Titel, Eingangsordner wahlweise überspringen.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { speicherDateien } from '../src/dateispeicher';
import { Dienst, type Fundstelle } from '../src/dienst';
import { EINGANG_STANDARD, Eingangsordner, pruefeEingangEinstellung } from '../src/eingangsordner';
import { speicherEinstellungen } from '../src/einstellungen';
import { Fachfehler } from '../src/fehler';
import { Konten } from '../src/konten';
import { speicherKontoRepo } from '../src/konto-repo';
import { Postfaecher, type GeleseneMail, type ImapSitzung } from '../src/postfach';
import { speicherRepo } from '../src/repo-speicher';
import { routen, type Anfrage } from '../src/routen';

const sha = (b: Buffer | string) => createHash('sha256').update(b).digest('hex');
const SCAN = Buffer.from('%PDF-1.4 Rechnung Stadtwerke 4711');
const BEFUND = Buffer.from('%PDF-1.4 Befund vertraulich');

async function aufbau() {
  const d = new Dienst(speicherRepo(), speicherDateien(), { einstellungen: speicherEinstellungen() });
  const konten = new Konten(speicherKontoRepo(), null, 'http://nas', d.benutzerspiegel());
  d.verbindeKonten(konten.papierkorbHaken());
  const { benutzer: admin } = await konten.einrichten({ email: 'admin@example.org', name: 'Admin', passwort: 'ein-langes-passwort' });
  const anna = (await konten.legeBenutzerAn({ email: 'anna@example.org', name: 'Anna', rolle: 'mitglied' }, admin.id)).benutzer;
  await d.gleicheBenutzerAb(await konten.listeBenutzer());
  const ALLES = { C: true, R: true, U: true, D: true, P: true };
  const vertrag = await d.legeTypAn({ name: 'Vertrag', titelVorlage: '{nr}', felder: [{ key: 'nr', label: 'Nr', typ: 'text' }] });
  const gesundheit = await d.legeTypAn({ name: 'Gesundheit', titelVorlage: '{nr}', felder: [{ key: 'nr', label: 'Nr', typ: 'text' }],
    berechtigungen: { grund: ALLES, regeln: [{ id: 'anna', name: 'Anna nicht', wenn: [{ art: 'benutzer', benutzer: [anna.id] }], dann: { R: 'entziehen' }, stopp: false }] } } as never);
  const strom = await d.legeMappeAn({ typId: vertrag.id, werte: { nr: 'Stromvertrag Haus' } }, admin.id);
  await d.ladeHoch(strom.id, { register: 'dokumente', name: 'Scan_2026-10-12.pdf' }, SCAN, admin.id);
  const arzt = await d.legeMappeAn({ typId: gesundheit.id, werte: { nr: 'Arztbrief' } }, admin.id);
  await d.ladeHoch(arzt.id, { register: 'dokumente', name: 'Befund.pdf' }, BEFUND, admin.id);
  const ich = async (id: string) => (await konten.listeBenutzer()).find((b) => b.id === id)!;
  const tabelle = routen(d, konten, {});
  const rufe = async (b: { id: string }, m: string, pf: string, x: Partial<Anfrage> = {}) => tabelle.find((t) => t.methode === m && t.pfad === pf)!.handler({ body: {}, params: {}, query: {}, ip: '1', ...x, benutzer: await ich(b.id) });
  return { d, konten, admin, anna, vertrag, strom, arzt, rufe };
}

describe('Doppelte Dateien (#333)', () => {
  it('nennt Fundstellen mit Titel, Register und Datum – nur in Mappen, die man lesen darf', async () => {
    const { anna, admin, strom, arzt, rufe } = await aufbau();
    const frage = async (b: { id: string }, pruefwerte: string[], ohneMappe?: string) =>
      ((await rufe(b, 'POST', '/api/dokumente/gleiche', { body: { pruefwerte, ohneMappe } })) as { body: { fundstellen: Record<string, Fundstelle[]> } }).body.fundstellen;
    const f = await frage(anna, [sha(SCAN), sha('gibt es nicht'), sha(BEFUND)]);
    assert.deepEqual(Object.keys(f), [sha(SCAN)], 'Befund liegt nur in einer Mappe, die Anna nicht lesen darf: kein Hinweis');
    const [x] = f[sha(SCAN)];
    assert.equal(x.mappeId, strom.id);
    assert.equal(x.titel, 'Stromvertrag Haus');
    assert.equal(x.typ, 'Vertrag');
    assert.equal(x.register, 'Dokumente');
    assert.equal(x.name, 'Scan_2026-10-12.pdf');
    assert.ok(x.erstellt);
    assert.deepEqual(Object.keys(await frage(admin, [sha(BEFUND)])), [sha(BEFUND)]);
    assert.equal((await frage(admin, [sha(BEFUND)], arzt.id))[sha(BEFUND)], undefined, 'die eigene Mappe zählt nicht');
    // Unsinnige Eingaben werden übergangen; zu viele abgelehnt.
    assert.deepEqual(await frage(anna, ['kein-pruefwert', 42 as never]), {});
    await assert.rejects(frage(anna, Array.from({ length: 101 }, (_, i) => sha(String(i)))), (e) => e instanceof Fachfehler && e.status === 422);
  });

  it('Hochladen (auch per API) nennt gleichen Inhalt nur aus lesbaren Mappen', async () => {
    const { d, anna, vertrag, rufe } = await aufbau();
    const m = await d.legeMappeAn({ typId: vertrag.id, werte: { nr: 'Neu' } }, anna.id);
    const hoch = async (inhalt: Buffer, name: string) => ((await rufe(anna, 'POST', '/api/mappen/:id/dokumente', { params: { id: m.id }, query: { register: 'dokumente', name }, body: inhalt })) as { body: { gleicherInhalt: Array<{ titel?: string }> } }).body.gleicherInhalt;
    assert.deepEqual((await hoch(SCAN, 'a.pdf')).map((g) => g.titel), ['Stromvertrag Haus']);
    assert.deepEqual(await hoch(BEFUND, 'b.pdf'), [], 'kein Titel aus der Gesundheitsmappe');
  });

  it('Eingangsordner: Hinweis ohne Titel in der Historie; wahlweise doppelte überspringen', async () => {
    const { d, konten } = await aufbau();
    const ordner = await mkdtemp(join(tmpdir(), 'dms-doppelt-'));
    const einstellungen = speicherEinstellungen();
    const e = new Eingangsordner(ordner, { dienst: d, einstellungen, benutzer: () => konten.listeBenutzer(), pause: () => null });
    await writeFile(join(ordner, 'Scan.pdf'), SCAN);
    await e.pruefe(); assert.equal(await e.pruefe(), 1);
    const post = await d.postTyp();
    const [p] = await d.listeMappen(post.id);
    const eintrag = (await d.historie(p.id)).find((h) => h.art === 'uebernommen')!;
    assert.equal((eintrag.daten as Record<string, unknown>).doppelt, 1);
    assert.equal(JSON.stringify(eintrag.daten).includes('Stromvertrag'), false, 'kein Titel einer anderen Mappe');

    assert.equal(pruefeEingangEinstellung({}, EINGANG_STANDARD).doppelteUeberspringen, false);
    await einstellungen.schreibe('eingangsordner', pruefeEingangEinstellung({ doppelteUeberspringen: true }, EINGANG_STANDARD));
    await writeFile(join(ordner, 'Nochmal.pdf'), SCAN);
    await writeFile(join(ordner, 'Neu.pdf'), '%PDF-1.4 etwas Neues');
    await e.pruefe(); await e.pruefe();
    assert.deepEqual((await d.listeMappen(post.id)).map((m) => m.werte.betreff).sort(), ['Neu', 'Scan'], 'keine Post für die doppelte Datei');
    assert.ok(existsSync(join(ordner, 'erledigt', 'Nochmal.pdf')), 'weggeräumt wie eine übernommene Datei');
    assert.ok((await e.stand()).uebernommen.some((x) => x.datei.endsWith('Nochmal.pdf') && /doppelt/.test(x.grund ?? '')));
  });

  it('Postfach: Hinweis „Doppelt“ an der Post, ohne Titel', async () => {
    const { d } = await aufbau();
    const mail: GeleseneMail = { messageId: '<x@example.org>', betreff: 'Rechnung', datum: null, absenderName: 'Stadtwerke', absenderAdresse: 'a@stadtwerke.de', text: '',
      anhaenge: [{ name: 'Rechnung.pdf', mime: 'application/pdf', inhalt: SCAN, eingebettet: false }, { name: 'AGB.pdf', mime: 'application/pdf', inhalt: Buffer.from('%PDF-1.4 AGB'), eingebettet: false }] };
    const sitzung: ImapSitzung = {
      uidValidity: '1', anzahl: 1,
      async neue() { return [{ uid: 1, messageId: mail.messageId }]; }, async quelle() { return Buffer.from('x'); },
      async verschiebe() {}, async gelesen() {}, async loesche() {}, async ordnerListe() { return ['INBOX', 'DMS']; }, async schliessen() {},
    };
    const pf = new Postfaecher({ dienst: d, einstellungen: speicherEinstellungen(), verbinde: async () => sitzung, lies: async () => mail,
      verschluessele: (k) => k, entschluessele: (w) => w, anAdmins: async () => {} });
    const [p] = await pf.speichere({ name: 'Post', server: 'imap.example.org', port: 993, benutzer: 'a', passwort: 'b' }, null, 'test');
    assert.equal(await pf.abrufen(p.id), 1);
    const post = await d.postTyp();
    const [m] = await d.listeMappen(post.id);
    const texte = (await d.historie(m.id)).map((h) => String((h.daten as Record<string, unknown>).text ?? ''));
    assert.ok(texte.some((t) => t === 'Doppelt: „Rechnung.pdf“ liegt schon im DMS – vor dem Zuordnen prüfen.'), texte.join(' | '));
  });
});
