/** Versionierung von Dokumenten (#194): Ersetzen, gleicher Name, Zurückholen, „nur die letzten N“, Löschen, Papierkorb. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { speicherDateien } from '../src/dateispeicher';
import { Dienst } from '../src/dienst';
import { speicherEinstellungen } from '../src/einstellungen';
import { Fachfehler } from '../src/fehler';
import { speicherRepo } from '../src/repo-speicher';

const status = (s: number) => (e: unknown) => e instanceof Fachfehler && e.status === s;
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
const PDF = (t: string) => Buffer.from(`%PDF-1.4\n% ${t}\n`);

async function aufbau(behalten?: number) {
  const dateien = speicherDateien();
  const d = new Dienst(speicherRepo(), dateien, { einstellungen: speicherEinstellungen() });
  const t = await d.legeTypAn({ name: 'Beleg', felder: [{ key: 'name', label: 'Name', typ: 'text' }], register: [
    { key: 'daten', name: 'Daten', art: 'felder' },
    { key: 'belege', name: 'Belege', art: 'dokumente', versionierung: true, versionenBehalten: behalten },
    { key: 'sonstiges', name: 'Sonstiges', art: 'dokumente' },
  ] });
  const m = await d.legeMappeAn({ typId: t.id, werte: { name: 'Einkauf' } });
  return { d, t, m, dateien };
}

describe('Versionierung von Dokumenten (#194)', () => {
  it('Schalter am Register wird gespeichert; „nur die letzten N“ ab 2', async () => {
    const { t } = await aufbau(3);
    assert.deepEqual(t.register.find((r) => r.key === 'belege'), { key: 'belege', name: 'Belege', art: 'dokumente', versionierung: true, versionenBehalten: 3 });
    assert.equal(t.register.find((r) => r.key === 'sonstiges')?.versionierung, undefined);
  });

  it('Ersetzen: neue Version, auch mit anderem Dateityp; ohne Versionierung abgelehnt', async () => {
    const { d, m } = await aufbau();
    const { dokument: bon } = await d.ladeHoch(m.id, { register: 'belege', name: 'Kassenbon.jpg', typ: 'image/png' }, PNG, null);
    assert.equal(bon.version, 1);
    const neu = await d.ersetzeDokument(bon.id, { name: 'Kassenbon.pdf', typ: 'application/pdf' }, PDF('a'), null);
    assert.equal(neu.id, bon.id);
    assert.equal(neu.version, 2);
    assert.equal(neu.name, 'Kassenbon.pdf');
    assert.equal(neu.mime, 'application/pdf');
    assert.equal(neu.aeltere, 1);
    const v = await d.versionen(bon.id);
    assert.equal(v.aeltere[0].nummer, 1);
    assert.equal(v.aeltere[0].name, 'Kassenbon.jpg');
    assert.deepEqual((await d.versionInhalt(bon.id, 1)).inhalt, PNG);
    // Nur die neueste in der Mappe
    assert.deepEqual((await d.holeMappe(m.id)).dokumente.map((x) => x.name), ['Kassenbon.pdf']);
    const h = (await d.historie(m.id)).find((x) => x.art === 'dokument_version');
    assert.equal(h?.daten.vorher, 'Kassenbon.jpg');
    const { dokument: s } = await d.ladeHoch(m.id, { register: 'sonstiges', name: 'x.pdf' }, PDF('x'), null);
    await assert.rejects(d.ersetzeDokument(s.id, {}, PDF('y'), null), (e) => e instanceof Fachfehler && e.status === 409 && /Versionierung ausgeschaltet/.test(e.message));
  });

  it('gleicher Name: mit Zähler (Standard), als neue Version, altes löschen', async () => {
    const { d, m } = await aufbau();
    const a = (await d.ladeHoch(m.id, { register: 'belege', name: 'Rechnung.pdf' }, PDF('1'), null)).dokument;
    assert.equal((await d.ladeHoch(m.id, { register: 'belege', name: 'Rechnung.pdf' }, PDF('2'), null)).dokument.name, 'Rechnung (2).pdf');
    assert.equal((await d.ladeHoch(m.id, { register: 'belege', name: 'rechnung.pdf' }, PDF('3'), null)).dokument.name, 'rechnung (3).pdf');
    const v = await d.ladeHoch(m.id, { register: 'belege', name: 'Rechnung.pdf', gleicherName: 'version' }, PDF('4'), null);
    assert.equal(v.dokument.id, a.id);
    assert.equal(v.dokument.version, 2);
    await assert.rejects(d.ladeHoch(m.id, { register: 'belege', name: 'Rechnung.pdf', gleicherName: 'ersetzen' }, PDF('5'), null), status(409));
    // Ohne Versionierung
    const s = (await d.ladeHoch(m.id, { register: 'sonstiges', name: 'Brief.pdf' }, PDF('b1'), null)).dokument;
    await assert.rejects(d.ladeHoch(m.id, { register: 'sonstiges', name: 'Brief.pdf', gleicherName: 'version' }, PDF('b2'), null), status(409));
    const e = await d.ladeHoch(m.id, { register: 'sonstiges', name: 'Brief.pdf', gleicherName: 'ersetzen' }, PDF('b3'), null);
    assert.notEqual(e.dokument.id, s.id);
    assert.equal(e.dokument.name, 'Brief.pdf');
    assert.equal((await d.holeMappe(m.id)).dokumente.filter((x) => x.registerKey === 'sonstiges').length, 1);
  });

  it('Zurückholen: als neue, höchste Version; nichts geht verloren', async () => {
    const { d, m } = await aufbau();
    const a = (await d.ladeHoch(m.id, { register: 'belege', name: 'Vertrag.pdf' }, PDF('v1'), null)).dokument;
    await d.ersetzeDokument(a.id, {}, PDF('v2'), null);
    await d.ersetzeDokument(a.id, {}, PDF('v3'), null);
    const z = await d.holeVersionZurueck(a.id, 1, null);
    assert.equal(z.version, 4);
    assert.equal(z.herkunft, 'zurueckgeholt');
    assert.deepEqual((await d.dokumentInhalt(a.id)).inhalt, PDF('v1'));
    assert.deepEqual((await d.versionen(a.id)).aeltere.map((v) => v.nummer), [3, 2, 1]);
    await assert.rejects(d.holeVersionZurueck(a.id, 9, null), status(404));
  });

  it('nur die letzten N; Löschen räumt alle Versionen und Dateien auf', async () => {
    const { d, m, dateien } = await aufbau(3);
    const a = (await d.ladeHoch(m.id, { register: 'belege', name: 'Plan.pdf' }, PDF('p1'), null)).dokument;
    for (const t of ['p2', 'p3', 'p4', 'p5']) await d.ersetzeDokument(a.id, {}, PDF(t), null);
    const v = await d.versionen(a.id);
    assert.equal(v.aktuell.version, 5);
    assert.deepEqual(v.aeltere.map((x) => x.nummer), [4, 3]);
    const sha1 = (await import('node:crypto')).createHash('sha256').update(PDF('p1')).digest('hex');
    await assert.rejects(dateien.lies(sha1));
    await d.setzePapierkorbTage(0); // ohne Papierkorb (#344): endgültig wie bisher
    await d.loescheDokument(a.id);
    const sha3 = (await import('node:crypto')).createHash('sha256').update(PDF('p3')).digest('hex');
    await assert.rejects(dateien.lies(sha3));
    const h = (await d.historie(m.id)).find((x) => x.art === 'dokument_geloescht');
    assert.equal(h?.daten.versionen, 3);
  });

  it('Papierkorb: Versionen gehen mit und kommen wieder', async () => {
    const { d, m } = await aufbau();
    await d.setzePapierkorbTage(30);
    const a = (await d.ladeHoch(m.id, { register: 'belege', name: 'A.pdf' }, PDF('a1'), null)).dokument;
    await d.ersetzeDokument(a.id, {}, PDF('a2'), null);
    await d.loescheMappe(m.id, null);
    await assert.rejects(d.versionen(a.id), status(404));
    await d.stelleWiederHer(m.id, { id: 'x', rolle: 'admin' }, true);
    assert.deepEqual((await d.versionen(a.id)).aeltere.map((v) => v.nummer), [1]);
    assert.equal((await d.versionen(a.id)).aktuell.version, 2);
  });
});
