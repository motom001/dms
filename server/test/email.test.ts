/** E-Mail aus der Mappe (#58); die versendete E-Mail ist Post (#192). */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { speicherDateien } from '../src/dateispeicher';
import { Dienst } from '../src/dienst';
import { speicherEinstellungen } from '../src/einstellungen';
import { Fachfehler } from '../src/fehler';
import type { Mailer, MailOptionen } from '../src/mail';
import { speicherRepo } from '../src/repo-speicher';

const status = (s: number) => (e: unknown) => e instanceof Fachfehler && e.status === s;
const ich = { id: '00000000-0000-4000-8000-000000000001', name: 'Anna', email: 'anna@example.org' };

async function aufbau() {
  const d = new Dienst(speicherRepo(), speicherDateien(), { einstellungen: speicherEinstellungen() });
  const t = await d.legeTypAn({ name: 'Rechnung', felder: [{ key: 'nr', label: 'Nummer', typ: 'text', pflicht: true }], register: [
    { key: 'allgemein', name: 'Allgemein', art: 'felder', felder: ['nr'] },
    { key: 'dokumente', name: 'Dokumente', art: 'dokumente' },
    { key: 'emails', name: 'E-Mails', art: 'verknuepfungen', quellen: [] },
  ] });
  const m = await d.legeMappeAn({ typId: t.id, werte: { nr: 'R-1' } }, null);
  const { dokument } = await d.ladeHoch(m.id, { register: 'dokumente', name: 'rechnung.pdf', typ: 'application/pdf' }, Buffer.from('%PDF-1.4 test'), null);
  const mails: Array<{ an: string; betreff: string; text: string; o?: MailOptionen }> = [];
  const mailer: Mailer = { async sende(an, betreff, text, o) { mails.push({ an, betreff, text, o }); } };
  return { d, t, m, dokument, mails, mailer };
}

describe('E-Mail aus der Mappe (#58)', () => {
  it('verschickt mit Antworten-an und Anhang, legt E-Mail-Mappe mit Bezug an und protokolliert', async () => {
    const { d, m, dokument, mails, mailer } = await aufbau();
    const r = await d.versendeMappe(m.id, { an: 'steuer@example.org, b@example.org', betreff: 'Rechnung R-1', nachricht: 'Hallo', dokumente: [dokument.id] }, ich, mailer);
    assert.equal(mails.length, 1);
    assert.equal(mails[0].an, 'steuer@example.org, b@example.org');
    assert.equal(mails[0].o?.antwortAn, '"Anna" <anna@example.org>');
    assert.equal(mails[0].o?.anhaenge?.[0].name, 'rechnung.pdf');
    const e = await d.holeMappe(r.id);
    const typ = (await d.listeTypen()).find((t) => t.id === e.mappe.typId)!;
    assert.equal(typ.system, 'post');
    assert.deepEqual(e.mappe.werte.bezug, [m.id]);
    assert.equal(e.mappe.werte.kanal, 'E-Mail');
    assert.equal(e.mappe.werte.richtung, 'Ausgehend');
    assert.equal(e.mappe.werte.stand, 'Erledigt');
    assert.equal(e.mappe.titel, 'Rechnung R-1');
    assert.equal(e.dokumente.length, 1);
    assert.equal(e.dokumente[0].sha256, dokument.sha256);
    // Rückverweis an der Ursprungsmappe; Protokolleintrag.
    const q = await d.holeMappe(m.id);
    assert.ok(q.rueckverweise.some((v) => v.quelleId === r.id));
    const h = await d.historie(m.id);
    assert.equal(h[0].art, 'email');
    assert.match(String(h[0].daten.text), /an steuer@example.org/);
    // Die Ursprungsmappe lässt sich trotzdem löschen; der Verweis der Post entfällt.
    await d.loescheMappe(m.id, null);
    assert.ok(!(await d.holeMappe(r.id)).mappe.werte.bezug);
  });

  it('prüft Eingaben und den eingerichteten Versand', async () => {
    const { d, m, mailer } = await aufbau();
    await assert.rejects(d.versendeMappe(m.id, { an: 'x', betreff: 'a' }, ich, mailer), status(422));
    await assert.rejects(d.versendeMappe(m.id, { an: 'a@example.org', betreff: '' }, ich, mailer), status(422));
    await assert.rejects(d.versendeMappe(m.id, { an: 'a@example.org', betreff: 'a', dokumente: ['fremd'] }, ich, mailer), status(422));
    await assert.rejects(d.versendeMappe(m.id, { an: 'a@example.org', betreff: 'a' }, ich, null), status(409));
    const kaputt: Mailer = { async sende() { throw new Error('550 abgelehnt'); } };
    await assert.rejects(d.versendeMappe(m.id, { an: 'a@example.org', betreff: 'a' }, ich, kaputt), status(502));
    assert.equal((await d.historie(m.id)).filter((x) => x.art === 'email').length, 0);
  });

  it('versendete E-Mails lassen sich nicht über das Formular anlegen, ihre Felder nicht ändern', async () => {
    const { d, m, mailer } = await aufbau();
    const r = await d.versendeMappe(m.id, { an: 'a@example.org', betreff: 'Hallo' }, ich, mailer);
    await assert.rejects(d.legeMappeAn({ typId: r.typId, werte: { betreff: 'x', an: 'a@example.org' } }, null), status(403));
    await assert.rejects(d.aendereMappe(r.id, { werte: { betreff: 'anders' } }, null), status(403));
  });
});

describe('Mehrere Mappen per E-Mail (#151)', () => {
  it('eine E-Mail mit Angaben als PDF und Dokumenten; Post verweist auf alle, Historie in jeder', async () => {
    const { d, t, m, dokument, mails, mailer } = await aufbau();
    const m2 = await d.legeMappeAn({ typId: t.id, werte: { nr: 'R-2' } }, null);
    const z = await d.zugriff({ id: ich.id, rolle: 'admin' });
    const wer = { ...ich, rolle: 'admin' };
    const r = await d.versendeMappen({ ids: [m.id, m2.id], an: 'steuer@example.org', betreff: 'Belege 2026', dokumente: 'alle' }, wer, z, mailer);
    assert.equal(mails.length, 1);
    assert.deepEqual(mails[0].o?.anhaenge?.map((a) => a.name), ['R-1.pdf', 'rechnung.pdf', 'R-2.pdf']);
    assert.equal(r.mappen, 2);
    const post = await d.holeMappe(r.id);
    assert.deepEqual(post.mappe.werte.bezug, [m.id, m2.id]);
    assert.equal(post.dokumente.length, 3, 'in der Post liegt, was verschickt wurde');
    for (const id of [m.id, m2.id]) assert.ok((await d.historie(id)).some((h) => h.art === 'email' && h.daten.email === r.id));
    // Ohne Angaben, nur gewählte Dokumente.
    await d.versendeMappen({ ids: [m.id, m2.id], an: 'a@example.org', betreff: 'Nur Beleg', angaben: false, dokumente: [dokument.id] }, wer, z, mailer);
    assert.deepEqual(mails[1].o?.anhaenge?.map((a) => a.name), ['rechnung.pdf']);
    await assert.rejects(d.versendeMappen({ ids: [m.id], an: 'a@example.org', betreff: 'x', dokumente: ['fremd'] }, wer, z, mailer), status(422));
    await assert.rejects(d.versendeMappen({ ids: [], an: 'a@example.org', betreff: 'x' }, wer, z, mailer), status(422));
    await assert.rejects(d.versendeMappen({ ids: [m.id], an: 'a@example.org', betreff: 'x' }, wer, z, null), status(409));
  });
});
