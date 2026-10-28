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
