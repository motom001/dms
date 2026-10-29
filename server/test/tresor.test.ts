/**
 * Schlüssel für verschlüsselte Zugangsdaten (#39).
 */
import assert from 'node:assert/strict';
import { mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { Fachfehler } from '../src/fehler';
import { istVerschluesselt, punktFuer, Tresor } from '../src/tresor';

/** Einstellungen im Arbeitsspeicher (wie speicherBetrieb, ohne den Mailversand zu laden). */
function speicherBetrieb() {
  const m = new Map<string, unknown>();
  return { async lies(k: string) { return m.get(k) ?? null; }, async schreibe(k: string, w: unknown) { m.set(k, structuredClone(w)); } };
}

const ordner = async () => join(await mkdtemp(join(tmpdir(), 'dms-tresor-')), 'geheim');

describe('Tresor (#39)', () => {
  it('erzeugt den Schlüssel als Datei, nicht in der Datenbank, und verschlüsselt je Wert anders', async () => {
    const einst = speicherBetrieb();
    const datei = join(await ordner(), 'dms.schluessel');
    const t = new Tresor(einst, datei, () => null);
    await t.laden();
    assert.equal(t.zustand, 'fehlt');
    assert.throws(() => t.verschluessele('x'), Fachfehler);
    const st = await t.erzeuge();
    assert.equal(st.zustand, 'vorhanden');
    assert.match(st.fingerabdruck!, /^[0-9A-F]{4}(-[0-9A-F]{4}){3}$/);
    const inhalt = (await readFile(datei, 'utf8')).trim();
    assert.equal(Buffer.from(inhalt, 'base64url').length, 32);
    assert.equal((await stat(datei)).mode & 0o777, 0o600);
    const gespeichert = JSON.stringify(await einst.lies('tresor'));
    assert.ok(!gespeichert.includes(inhalt), 'in der Datenbank steht nur der Fingerabdruck');

    const a = t.verschluessele('geheim'); const b = t.verschluessele('geheim');
    assert.ok(istVerschluesselt(a));
    assert.notEqual(a, b, 'eigene Nonce je Wert');
    assert.equal(t.entschluessele(a), 'geheim');
    assert.equal(t.entschluessele(a.slice(0, -2) + 'AA'), null, 'manipuliert = nicht lesbar');
    await assert.rejects(t.erzeuge(), /schon einen Schlüssel/);

    // Neustart: Schlüssel wird aus der Datei gelesen.
    const t2 = new Tresor(einst, datei, () => null);
    await t2.laden();
    assert.equal(t2.zustand, 'vorhanden');
    assert.equal(t2.entschluessele(a), 'geheim');
  });

  it('erkennt einen verlorenen und einen fremden Schlüssel', async () => {
    const einst = speicherBetrieb();
    const datei = join(await ordner(), 'dms.schluessel');
    const t = new Tresor(einst, datei, () => null);
    await t.laden();
    await t.erzeuge();
    const alt = t.verschluessele('geheim');

    const weg = new Tresor(einst, join(await ordner(), 'nicht-da'), () => null);
    await weg.laden();
    assert.equal(weg.zustand, 'verloren');
    assert.equal(weg.bereit, false);

    const fremdeDatei = join(await ordner(), 'fremd');
    await new Tresor(speicherBetrieb(), fremdeDatei, () => null).erzeuge();
    const fremd = new Tresor(einst, fremdeDatei, () => null);
    await fremd.laden();
    assert.equal(fremd.zustand, 'falsch');
    assert.equal(fremd.entschluessele(alt), null);
    assert.throws(() => fremd.verschluessele('x'), /passt nicht/);
    await assert.rejects(fremd.erzeuge(), /gehört nicht/);
  });

  it('überschreibt nie eine vorhandene Datei und lehnt ungültige Schlüssel ab', async () => {
    const datei = join(await ordner(), 'dms.schluessel');
    const t = new Tresor(speicherBetrieb(), datei, () => null);
    await t.laden();
    await new Tresor(speicherBetrieb(), datei, () => null).erzeuge();
    await assert.rejects(t.erzeuge(), /schon eine Datei/);
    await writeFile(datei, 'kaputt');
    const k = new Tresor(speicherBetrieb(), datei, () => null);
    await k.laden();
    assert.equal(k.zustand, 'fehlt');
  });

  it('findet den Einhängepunkt eines Ordners', () => {
    const info = [
      '1 0 0:1 / / rw - overlay overlay rw',
      '2 1 0:2 / /data/files rw - ext4 /dev/sda1 rw',
      '3 1 0:3 / /data/geheim rw - ext4 /dev/sda1 rw',
    ].join('\n');
    assert.equal(punktFuer('/data/geheim', info), '/data/geheim');
    assert.equal(punktFuer('/data/geheim/unter', info), '/data/geheim');
    assert.equal(punktFuer('/data/geheimnis', info), '/');
    assert.equal(punktFuer('/data', info), '/');
  });
});

describe('Schlüssel wechseln (#47)', () => {
  async function aufbau() {
    const { Dienst } = await import('../src/dienst');
    const { speicherRepo } = await import('../src/repo-speicher');
    const { speicherDateien } = await import('../src/dateispeicher');
    const { Betrieb } = await import('../src/betrieb');
    const einst = speicherBetrieb();
    const datei = join(await ordner(), 'dms.schluessel');
    const t = new Tresor(einst, datei, () => null);
    await t.laden(); await t.erzeuge();
    const repo = speicherRepo();
    const d = new Dienst(repo, speicherDateien(), { tresor: t, einstellungen: einst });
    const betrieb = new Betrieb(einst, 'http://nas', t);
    await betrieb.laden();
    await betrieb.speichereMail({ aktiv: true, host: 'smtp.example.org', port: 587, verbindung: 'starttls', benutzer: 'dms', passwort: 'mail-geheim', absender: 'dms@example.org' });
    const typ = await d.legeTypAn({ name: 'Zugang', felder: [{ key: 'name', label: 'Name', typ: 'text', pflicht: true }, { key: 'pw', label: 'Kennwort', typ: 'passwort' }] });
    const m1 = await d.legeMappeAn({ typId: typ.id, werte: { name: 'Bank', pw: { neu: 'bank-geheim' } } });
    const m2 = await d.legeMappeAn({ typId: typ.id, werte: { name: 'Alt', pw: { neu: 'weg-geheim' } } });
    await d.loescheMappe(m2.id);
    return { t, einst, datei, d, repo, betrieb, m1, m2 };
  }

  it('verschlüsselt Mappen, Papierkorb und Mailserver neu, ersetzt Datei, Fingerabdruck und Prüfwort', async () => {
    const { t, einst, datei, d, betrieb, m1, m2 } = await aufbau();
    const alt = t.fingerabdruck!;
    const altDatei = await readFile(datei, 'utf8');
    const vorher = (await d.holeMappe(m1.id)).mappe.werte.pw;
    const w = await d.schluesselWechseln('admin@example.org');
    assert.equal(w.alt, alt);
    assert.notEqual(w.neu, alt);
    assert.equal(w.umgeschluesselt, 2, 'Mappe und Papierkorb (Mail-Passwort liegt in den Einstellungen)');
    assert.equal(t.fingerabdruck, w.neu);
    assert.equal(t.zustand, 'vorhanden');
    assert.notEqual(await readFile(datei, 'utf8'), altDatei);
    await assert.rejects(stat(`${datei}.neu`), 'keine .neu-Datei übrig');
    assert.notEqual((await d.holeMappe(m1.id)).mappe.werte.pw, vorher);
    assert.equal((await d.zeigePasswort(m1.id, 'pw')).wert, 'bank-geheim');
    assert.equal(await t.pruefwort(), true);
    assert.equal(((await einst.lies('tresor')) as { fingerabdruck: string }).fingerabdruck, w.neu);
    // Mailserver: Passwort mit dem neuen Schlüssel lesbar.
    const mail = (await einst.lies('mail')) as { passwort: string };
    assert.equal(t.entschluessele(mail.passwort), 'mail-geheim');
    assert.ok(betrieb.ansicht().mail.passwortLesbar);
    // Papierkorb: wiederhergestellt und lesbar.
    await d.stelleWiederHer(m2.id, { id: 'x', rolle: 'admin' }, true);
    assert.equal((await d.zeigePasswort(m2.id, 'pw')).wert, 'weg-geheim');
    // Neu geladen (Neustart): derselbe Schlüssel.
    const t2 = new Tresor(einst, datei, () => null);
    await t2.laden();
    assert.equal(t2.zustand, 'vorhanden');
    assert.equal(t2.fingerabdruck, w.neu);
  });

  it('ganz oder gar nicht: Abbruch mittendrin lässt alten Schlüssel und alle Werte', async () => {
    const { t, datei, d, repo, m1 } = await aufbau();
    const alt = t.fingerabdruck;
    const altDatei = await readFile(datei, 'utf8');
    const vorher = (await d.holeMappe(m1.id)).mappe.werte.pw;
    await assert.rejects(t.wechsle(async (um) => { um(String(vorher)); throw new Error('Verbindung weg'); }, 'admin'), /abgebrochen.*bisherige Schlüssel/);
    assert.equal(t.fingerabdruck, alt);
    assert.equal(await readFile(datei, 'utf8'), altDatei);
    await assert.rejects(stat(`${datei}.neu`));
    assert.equal((await d.holeMappe(m1.id)).mappe.werte.pw, vorher);
    assert.equal((await d.zeigePasswort(m1.id, 'pw')).wert, 'bank-geheim');
    // Danach klappt es normal.
    await t.wechsle((um, e) => repo.umschluesseln(um, e), 'admin');
    assert.equal((await d.zeigePasswort(m1.id, 'pw')).wert, 'bank-geheim');
  });

  it('Neustart zwischen Datenbank und Datei: die .neu-Datei wird übernommen; ein Überbleibsel gelöscht', async () => {
    const { t, einst, datei } = await aufbau();
    // Zustand wie nach einem Absturz: Datenbank kennt den neuen Fingerabdruck, die Datei ist noch die alte.
    const { randomBytes } = await import('node:crypto');
    const { fingerabdruck } = await import('../src/tresor');
    const k = randomBytes(32);
    await writeFile(`${datei}.neu`, k.toString('base64url'));
    await einst.schreibe('tresor', { fingerabdruck: fingerabdruck(k), erstellt: new Date().toISOString() });
    const t2 = new Tresor(einst, datei, () => null);
    await t2.laden();
    assert.equal(t2.fingerabdruck, fingerabdruck(k));
    assert.equal(t2.zustand, 'vorhanden');
    assert.equal((await readFile(datei, 'utf8')).trim(), k.toString('base64url'));
    // Überbleibsel eines Abbruchs: passt nicht zur Datenbank → weg, alte Datei bleibt.
    await writeFile(`${datei}.neu`, randomBytes(32).toString('base64url'));
    const t3 = new Tresor(einst, datei, () => null);
    await t3.laden();
    assert.equal(t3.fingerabdruck, fingerabdruck(k));
    await assert.rejects(stat(`${datei}.neu`));
    assert.ok(t.fingerabdruck);
  });

  it('nur mit passendem Schlüssel', async () => {
    const t = new Tresor(speicherBetrieb(), join(await ordner(), 'dms.schluessel'), () => null);
    await t.laden();
    await assert.rejects(t.wechsle(async () => ({ umgeschluesselt: 0, unlesbar: 0 }), 'admin'), (e: unknown) => e instanceof Fachfehler && e.status === 409);
  });
});
