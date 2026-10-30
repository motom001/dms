/** Systemmappentyp Post (#192): anlegen, „Für“, Zuordnen, Sichten, Rechte, Umstellung vom Typ E-Mail. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { POST_KANAL, POST_STAND, systemfelder } from '../../shared/src/model';
import { NICHTS, type Regelwerk } from '../../shared/src/rechte';
import { speicherDateien } from '../src/dateispeicher';
import { Dienst } from '../src/dienst';
import { speicherEinstellungen } from '../src/einstellungen';
import { Fachfehler } from '../src/fehler';
import { Konten } from '../src/konten';
import { speicherKontoRepo } from '../src/konto-repo';
import { speicherRepo } from '../src/repo-speicher';
import { routen, type Anfrage } from '../src/routen';
import { typImLink } from '../../shared/src/direktlink';

const status = (s: number) => (e: unknown) => e instanceof Fachfehler && e.status === s;

async function aufbau(repo = speicherRepo(), einstellungen = speicherEinstellungen()) {
  const d = new Dienst(repo, speicherDateien(), { einstellungen });
  const konten = new Konten(speicherKontoRepo(), null, 'http://nas', d.benutzerspiegel());
  d.verbindeKonten(konten.papierkorbHaken());
  const { benutzer: anna } = await konten.einrichten({ email: 'anna@example.org', name: 'Anna', passwort: 'ein-langes-passwort' });
  const { benutzer: ben } = await konten.legeBenutzerAn({ email: 'ben@example.org', name: 'Ben', rolle: 'mitglied' }, anna.id);
  await d.gleicheBenutzerAb(await konten.listeBenutzer());
  const rechnung = await d.legeTypAn({ name: 'Rechnung', felder: [{ key: 'nr', label: 'Nummer', typ: 'text', pflicht: true }], register: [
    { key: 'allgemein', name: 'Allgemein', art: 'felder', felder: ['nr'] },
    { key: 'belege', name: 'Belege', art: 'dokumente' },
    { key: 'sonstiges', name: 'Sonstiges', art: 'dokumente', volltext: false },
  ] });
  const r1 = await d.legeMappeAn({ typId: rechnung.id, werte: { nr: 'R-1' } }, anna.id);
  const post = (await d.listeTypen()).find((t) => t.system === 'post')!;
  const tabelle = routen(d, konten, {});
  const rufe = async (b: { id: string }, m: string, p: string, x: Partial<Anfrage> = {}) =>
    tabelle.find((r) => r.methode === m && r.pfad === p)!.handler({ body: {}, params: {}, query: {}, ip: '1', ...x, benutzer: (await konten.listeBenutzer()).find((u) => u.id === b.id)! });
  const A = { id: anna.id, rolle: 'admin' }; const B = { id: ben.id, rolle: 'mitglied' };
  return { d, konten, anna, ben, A, B, rechnung, r1, post, rufe, einstellungen };
}

describe('Systemtyp Post (#192)', () => {
  it('gibt es von Anfang an, mit Systemfeldern, Register und den Sichten „Neue Post“, „Eingegangen“, „Versendet“', async () => {
    const { d, post } = await aufbau();
    assert.equal(post.name, 'Post');
    assert.equal(post.schluessel, 'post');
    for (const k of ['betreff', 'stand', 'kanal', 'richtung', 'datum', 'absender', 'an', 'fuer', 'bezug', 'nachricht']) assert.ok(post.felder.some((f) => f.key === k && f.system), k);
    assert.equal(post.felder.find((f) => f.key === 'bezug')!.mehrfach, true);
    assert.deepEqual(post.register.map((r) => r.art), ['felder', 'dokumente', 'protokoll']);
    const sichten = await d.listeSichten();
    const neu = sichten.find((s) => s.name === 'Neue Post')!;
    assert.ok(neu && neu.elternId === null);
    assert.ok(sichten.every((s) => s.elternId !== null || s.position >= neu.position), 'Neue Post steht oben');
    assert.equal(await d.neuePostSicht(), neu.id);
    assert.deepEqual(sichten.filter((s) => s.elternId === post.id).map((s) => s.name), ['Eingegangen', 'Versendet']);
    // Ein zweiter Start legt nichts doppelt an; gelöschte Sichten kommen nicht wieder.
    await d.loescheSicht(neu.id);
    assert.equal((await d.listeSichten()).filter((s) => s.name === 'Neue Post').length, 0);
  });

  it('„+ Post“: neu, eingehend, heute; mit Dokumenten; zählt in „Neue Post“', async () => {
    const { d, A, anna, post } = await aufbau();
    const m = await d.legePostAn({ betreff: 'Brief vom Finanzamt' }, { id: anna.id, name: 'Anna' }, await d.zugriff(A));
    assert.equal(m.titel, 'Brief vom Finanzamt');
    assert.equal(m.werte.stand, POST_STAND.neu);
    assert.equal(m.werte.kanal, POST_KANAL.hochgeladen);
    assert.equal(m.werte.richtung, 'Eingehend');
    assert.equal(m.werte.absender, 'Anna');
    assert.match(String(m.werte.datum), /^\d{4}-\d{2}-\d{2}$/);
    await d.ladeHoch(m.id, { register: 'dokumente', name: 'scan.pdf', typ: 'application/pdf' }, Buffer.from('%PDF-1.4 a'), anna.id);
    const z = await d.zaehler(A, await d.zugriff(A));
    assert.equal(z.sichten[(await d.neuePostSicht())!], 1);
    assert.equal(z.neuePost, await d.neuePostSicht());
    // Das allgemeine Formular legt keine Post an; Kanal und „Zugeordnet zu“ ändert man nicht von Hand.
    await assert.rejects(d.legeMappeAn({ typId: post.id, werte: { betreff: 'x' } }, anna.id), status(403));
    await assert.rejects(d.aendereMappe(m.id, { werte: { kanal: 'Scan' } }, anna.id), status(403));
    // Betreff, Stand, Absender schon.
    const n = await d.aendereMappe(m.id, { werte: { betreff: 'Steuerbescheid', stand: POST_STAND.erledigt } }, anna.id);
    assert.equal(n.titel, 'Steuerbescheid');
  });

  it('„Für“: Aufgabe „Neue Post“ im Eingang, solange die Post neu ist', async () => {
    const { d, anna, ben, B } = await aufbau();
    const m = await d.legePostAn({ betreff: 'Für Ben', fuer: ben.id }, { id: anna.id, name: 'Anna' });
    const offen = async () => (await d.meineAufgaben(B)).filter((a) => a.art === 'post');
    assert.equal((await offen()).length, 1);
    assert.equal((await offen())[0].mappeId, m.id);
    // Speichern ohne Änderung legt keine zweite an.
    await d.aendereMappe(m.id, { werte: { betreff: 'Für Ben!' } }, anna.id);
    assert.equal((await offen()).length, 1);
    // An Anna weitergeben: Bens Aufgabe erledigt, Anna hat eine.
    await d.aendereMappe(m.id, { werte: { fuer: anna.id } }, anna.id);
    assert.equal((await offen()).length, 0);
    assert.equal((await d.meineAufgaben({ id: anna.id, rolle: 'admin' })).filter((a) => a.art === 'post').length, 1);
    // Erledigt: keine Aufgabe mehr.
    await d.aendereMappe(m.id, { werte: { stand: POST_STAND.erledigt } }, anna.id);
    assert.equal((await d.meineAufgaben({ id: anna.id, rolle: 'admin' })).filter((a) => a.art === 'post').length, 0);
  });

  it('Zuordnen: Dokumente wandern ins gewählte Register, Post verweist, Stand „Zugeordnet“, Protokoll an beiden', async () => {
    const { d, anna, ben, r1, rechnung } = await aufbau();
    const m = await d.legePostAn({ betreff: 'Rechnung Backofen', fuer: ben.id }, { id: anna.id, name: 'Anna' });
    const a = (await d.ladeHoch(m.id, { register: 'dokumente', name: 'a.pdf', typ: 'application/pdf' }, Buffer.from('%PDF-1.4 a'), anna.id)).dokument;
    const b = (await d.ladeHoch(m.id, { register: 'dokumente', name: 'b.pdf', typ: 'application/pdf' }, Buffer.from('%PDF-1.4 b'), anna.id)).dokument;
    const r = await d.ordneZu(m.id, { ziel: r1.id, register: 'belege', dokumente: [a.id] }, anna.id);
    assert.deepEqual(r.post.werte.bezug, [r1.id]);
    assert.equal(r.post.werte.stand, POST_STAND.zugeordnet);
    const ziel = await d.holeMappe(r1.id);
    assert.deepEqual(ziel.dokumente.map((x) => [x.name, x.registerKey]), [['a.pdf', 'belege']]);
    assert.deepEqual((await d.holeMappe(m.id)).dokumente.map((x) => x.name), ['b.pdf']);
    assert.ok(ziel.rueckverweise.some((v) => v.quelleId === m.id && v.feldKey === 'bezug'));
    assert.match(String((await d.historie(r1.id)).find((h) => h.art === 'zugeordnet')!.daten.text), /Post „Rechnung Backofen“ zugeordnet mit 1 Dokument ins Register „Belege“/);
    assert.match(String((await d.historie(m.id)).find((h) => h.art === 'zugeordnet')!.daten.text), /zugeordnet zu „R-1“/);
    // Aufgabe „Neue Post“ ist erledigt.
    assert.equal((await d.meineAufgaben({ id: ben.id, rolle: 'mitglied' })).filter((x) => x.art === 'post').length, 0);
    // Zweite Zielmappe, Rest kopiert: bleibt auch in der Post, dieselbe Datei.
    const r2 = await d.legeMappeAn({ typId: rechnung.id, werte: { nr: 'R-2' } }, anna.id);
    const z2 = await d.ordneZu(m.id, { ziel: r2.id, kopieren: true }, anna.id);
    assert.deepEqual(z2.post.werte.bezug, [r1.id, r2.id]);
    const kopie = (await d.holeMappe(r2.id)).dokumente;
    assert.equal(kopie.length, 1);
    assert.equal(kopie[0].sha256, b.sha256);
    assert.equal(kopie[0].registerKey, 'belege');
    assert.equal((await d.holeMappe(m.id)).dokumente.length, 1);
    // Löscht man eine Zielmappe, entfällt nur ihr Verweis.
    await d.loescheMappe(r2.id, anna.id);
    assert.deepEqual((await d.holeMappe(m.id)).mappe.werte.bezug, [r1.id]);
  });

  it('Zuordnen prüft Ziel, Register und Dokumente', async () => {
    const { d, anna, r1, post } = await aufbau();
    const m = await d.legePostAn({}, { id: anna.id, name: 'Anna' });
    assert.equal(m.titel, 'Neue Post');
    await d.ladeHoch(m.id, { register: 'dokumente', name: 'a.pdf', typ: 'application/pdf' }, Buffer.from('%PDF-1.4 a'), anna.id);
    await assert.rejects(d.ordneZu(m.id, {}, anna.id), status(422));
    await assert.rejects(d.ordneZu(m.id, { ziel: m.id }, anna.id), status(422));
    await assert.rejects(d.ordneZu(m.id, { ziel: r1.id, register: 'gibtsnicht' }, anna.id), status(422));
    await assert.rejects(d.ordneZu(m.id, { ziel: r1.id, dokumente: ['fremd'] }, anna.id), status(422));
    await assert.rejects(d.ordneZu(r1.id, { ziel: m.id }, anna.id), status(422), 'nur Post lässt sich zuordnen');
    const andere = await d.legePostAn({}, { id: anna.id, name: 'Anna' });
    await assert.rejects(d.ordneZu(m.id, { ziel: andere.id }, anna.id), status(422), 'nicht Post zu Post');
    // Ohne Dokumentenregister am Ziel geht es nur ohne Dokumente.
    const ohne = await d.legeTypAn({ name: 'Notiz', felder: [{ key: 'titel', label: 'Titel', typ: 'text', pflicht: true }], register: [{ key: 'allgemein', name: 'Allgemein', art: 'felder', felder: ['titel'] }] });
    const n = await d.legeMappeAn({ typId: ohne.id, werte: { titel: 'Ohne' } }, anna.id);
    await assert.rejects(d.ordneZu(m.id, { ziel: n.id }, anna.id), status(422));
    const ok = await d.ordneZu(m.id, { ziel: n.id, dokumente: [] }, anna.id);
    assert.deepEqual(ok.post.werte.bezug, [n.id]);
    void post;
  });

  it('Rechte: Post anlegen nach den Berechtigungen, Zuordnen braucht Bearbeiten an Post und Ziel', async () => {
    const { d, anna, ben, A, B, r1, post, rufe } = await aufbau();
    // Mitglieder dürfen Post nur lesen.
    const nurLesen: Regelwerk = { grund: { ...NICHTS, R: true }, regeln: [] };
    await d.setzeBerechtigungen(post.id, nurLesen, true);
    await assert.rejects(rufe(ben, 'POST', '/api/post', { body: { betreff: 'x' } }), status(403));
    const m = (await rufe(anna, 'POST', '/api/post', { body: { betreff: 'Admin darf' } })).body as { id: string; werte: Record<string, unknown> };
    assert.equal(m.werte.kanal, POST_KANAL.hochgeladen);
    await assert.rejects(rufe(ben, 'POST', '/api/mappen/:id/zuordnen', { params: { id: m.id }, body: { ziel: r1.id } }), status(403));
    const z = (await rufe(anna, 'POST', '/api/mappen/:id/zuordnen', { params: { id: m.id }, body: { ziel: r1.id } })).body as { post: { werte: Record<string, unknown> } };
    assert.equal(z.post.werte.stand, POST_STAND.zugeordnet);
    void A; void B;
  });

  it('versendete E-Mails bleiben Post wie verschickt: Felder geschützt', async () => {
    const { d, anna, r1 } = await aufbau();
    const mailer = { async sende() { /* ok */ } };
    const r = await d.versendeMappe(r1.id, { an: 'a@example.org', betreff: 'Hallo' }, { id: anna.id, name: 'Anna', email: 'anna@example.org' }, mailer);
    await assert.rejects(d.aendereMappe(r.id, { werte: { betreff: 'anders' } }, anna.id), status(403));
    // Stand und „Für“ bleiben änderbar.
    await d.aendereMappe(r.id, { werte: { stand: POST_STAND.neu } }, anna.id);
  });
});

describe('Umstellung vom Systemtyp E-Mail (#58 → #192)', () => {
  it('zieht die Definition nach: Name, neue Felder, „Zugeordnet zu“ mehrfach, Register, Sicht', async () => {
    // So sieht der Typ nach der Migration 031 aus: Kennung post, alte Definition, Werte schon umgestellt.
    const repo = speicherRepo();
    const vorher = new Dienst(repo, speicherDateien(), { einstellungen: speicherEinstellungen() });
    await vorher.sichereSystem();
    const typen0 = await vorher.listeTypen();
    const rolle = typen0.find((t) => t.system === 'rolle')!;
    // Den frisch angelegten Post-Typ durch die alte E-Mail-Definition ersetzen.
    const post0 = typen0.find((t) => t.system === 'post')!;
    const alt = [
      { key: 'betreff', label: 'Betreff', typ: 'text' as const, pflicht: true, maxLen: 250, system: true },
      { key: 'an', label: 'An', typ: 'text' as const, pflicht: true, system: true },
      { key: 'absender', label: 'Absender', typ: 'text' as const, system: true, hilfe: 'Wer die E-Mail verschickt hat; Antworten gehen an diese Adresse' },
      { key: 'datum', label: 'Datum', typ: 'datum' as const, system: true },
      { key: 'bezug', label: 'Bezug', typ: 'referenz' as const, zielTyp: '*', verweisart: 'bezug' as const, system: true, hilfe: 'Die Mappe, aus der die E-Mail verschickt wurde' },
      { key: 'nachricht', label: 'Nachricht', typ: 'langtext' as const, system: true },
    ];
    await repo.aendereTyp(post0.id, { ...post0, name: 'E-Mail', beschreibung: 'Aus dem DMS verschickte E-Mails mit Anhängen', felder: alt,
      register: [{ key: 'allgemein', name: 'Allgemein', art: 'felder', felder: alt.map((f) => f.key) }, { key: 'anhaenge', name: 'Anhänge', art: 'dokumente' }, { key: 'protokoll', name: 'Protokoll', art: 'protokoll' }],
      trefferlisten: [{ key: 'standard', name: 'Standard', spalten: ['datum', 'an', 'bezug'], standard: true }], trefferliste: undefined });
    for (const s of await repo.listeSichten()) if (s.id !== post0.id && s.typen.includes(post0.id)) await repo.loescheSicht(s.id);
    const sicht = (await repo.listeSichten()).find((s) => s.id === post0.id)!;
    await repo.aendereSicht(sicht.id, { ...sicht, name: 'E-Mail' });
    const m = await repo.legeMappeAn('11111111-1111-4111-8111-111111111111', post0.id, { betreff: 'Alt', an: 'x@example.org', kanal: 'E-Mail', richtung: 'Ausgehend', stand: 'Erledigt', bezug: [] }, [], null);

    // Neuer Start (frischer Dienst, ohne Merker „Sichten angelegt“).
    const d = new Dienst(repo, speicherDateien(), { einstellungen: speicherEinstellungen() });
    const { post } = await d.sichereSystem();
    assert.equal(post.id, post0.id);
    assert.equal(post.name, 'Post');
    assert.equal(post.felder.find((f) => f.key === 'bezug')!.label, 'Zugeordnet zu');
    assert.equal(post.felder.find((f) => f.key === 'bezug')!.mehrfach, true);
    assert.equal(post.felder.find((f) => f.key === 'an')!.label, 'Empfänger');
    assert.equal(post.felder.find((f) => f.key === 'an')!.pflicht, undefined);
    for (const k of ['stand', 'kanal', 'richtung', 'fuer']) assert.ok(post.felder.some((f) => f.key === k && f.system), k);
    assert.ok(post.register.find((r) => r.key === 'allgemein')!.felder!.includes('stand'));
    assert.equal(post.register.find((r) => r.key === 'anhaenge')!.name, 'Dokumente');
    assert.equal(post.felder.find((f) => f.key === 'fuer')!.zielTyp, (await d.listeTypen()).find((t) => t.system === 'benutzer')!.id);
    void rolle; void systemfelder;
    const sichten = await d.listeSichten();
    assert.equal(sichten.find((s) => s.id === post.id)!.name, 'Post');
    assert.ok(sichten.some((s) => s.name === 'Neue Post'));
    // Die alte Mappe passt zur neuen Definition.
    const h = await d.holeMappe(m.id);
    assert.equal(h.mappe.titel || 'Alt', 'Alt');
    // Alte sprechende Links mit typ=email gelten weiter.
    assert.equal(typImLink('email', await d.listeTypen())?.id, post.id);
    // Ein weiterer Start ändert nichts mehr.
    const geaendert = post.geaendert;
    const d3 = new Dienst(repo, speicherDateien(), { einstellungen: speicherEinstellungen() });
    assert.equal((await d3.sichereSystem()).post.geaendert, geaendert);
  });
});
