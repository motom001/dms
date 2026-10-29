/** Notfallzugang über eine RESCUE-Datei (#108). */
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { speicherEinstellungen } from '../src/einstellungen';
import { Konten } from '../src/konten';
import { speicherKontoRepo } from '../src/konto-repo';
import { anAlleAdmins } from '../src/mail';
import { Notfallzugang } from '../src/notfall';
import { protokoll } from '../src/protokoll';

async function aufbau() {
  // Nahe an der echten Zeit: der Einmal-Link läuft nach der echten Uhr ab (linkPruefen).
  const start = new Date(Math.floor(Date.now() / 60_000) * 60_000);
  let jetzt = start;
  const konten = new Konten(speicherKontoRepo(), null, 'http://nas:8080');
  await konten.einrichten({ email: 'admin@example.org', name: 'Admin', passwort: 'ein-langes-passwort' });
  const mails: Array<{ an: string; betreff: string }> = [];
  const mailer = { async sende(an: string, betreff: string) { mails.push({ an, betreff }); } };
  const datei = join(await mkdtemp(join(tmpdir(), 'dms-rescue-')), 'RESCUE');
  const n = new Notfallzugang(datei, konten, speicherEinstellungen(),
    async (b, t) => { await anAlleAdmins(await konten.listeBenutzer(), mailer, b, t); }, () => jetzt);
  return { konten, n, datei, mails, start, stelle: (iso: string) => { jetzt = new Date(iso); } };
}

describe('Notfallzugang (#108)', () => {
  it('legt mit dem Schlüsselwort einen Notfall-Admin mit 15-Minuten-Link an und löscht die Datei danach', async () => {
    const { konten, n, datei, mails, stelle, start } = await aufbau();
    assert.equal(await n.pruefe(), 'nichts', 'ohne Datei geschieht nichts');
    await writeFile(datei, '  notfallzugang\n');
    const vorher = protokoll.letzteNr;
    assert.equal(await n.pruefe(), 'angelegt');
    const inhalt = await readFile(datei, 'utf8');
    const link = /http:\/\/nas:8080\/passwort\/(\S+)/.exec(inhalt);
    assert.ok(link, inhalt);
    assert.ok(!/passwort:/i.test(inhalt.replace(/\/passwort\//, '')), 'kein Passwort in der Datei');
    const admin = (await konten.listeBenutzer()).find((b) => b.name.startsWith('Notfall-Admin'))!;
    assert.equal(admin.rolle, 'admin');
    assert.match(admin.name, /^Notfall-Admin \d\d\.\d\d\.\d{4} \d\d:\d\d$/);
    assert.equal((await konten.linkPruefen(link[1])).zweck, 'einladung');
    assert.deepEqual(mails.map((m) => m.an), ['admin@example.org'], 'Mail an die Administratoren (nicht an die .invalid-Adresse)');
    assert.ok(protokoll.eintraege({ seit: vorher }).some((e) => e.text === 'Notfallzugang angelegt (RESCUE-Datei)'));
    assert.deepEqual((await n.offen()).map((x) => x.name), [admin.name], 'Hinweis in der Werkbank');

    assert.equal(await n.pruefe(), 'wartet', 'der eigene Inhalt löst nichts Neues aus');
    assert.equal((await konten.listeBenutzer()).length, 2);
    stelle(new Date(start.getTime() + 15 * 60_000).toISOString());
    assert.equal(await n.pruefe(), 'geloescht');
    assert.ok(!existsSync(datei));

    // Mit dem Link ein eigenes Passwort setzen, danach umbenennen: kein Hinweis mehr.
    await konten.passwortSetzen({ schluessel: link[1], passwort: 'neues-langes-passwort' });
    await konten.aendereBenutzer((await konten.listeBenutzer())[0], admin.id, { name: 'Thomas' });
    assert.deepEqual(await n.offen(), []);
  });

  it('meldet eine leere oder fremde Datei nur', async () => {
    const { konten, n, datei } = await aufbau();
    await writeFile(datei, '');
    const vorher = protokoll.letzteNr;
    assert.equal(await n.pruefe(), 'gemeldet');
    await writeFile(datei, 'bitte hilfe');
    assert.equal(await n.pruefe(), 'gemeldet');
    assert.equal((await konten.listeBenutzer()).length, 1, 'kein neuer Benutzer');
    assert.ok(existsSync(datei), 'eine fremde Datei bleibt liegen');
    assert.ok(protokoll.eintraege({ seit: vorher }).some((e) => /ohne das Schlüsselwort/.test(e.text)));
  });

  it('der Link verfällt nach 15 Minuten', async () => {
    const { konten, n, datei } = await aufbau();
    await writeFile(datei, 'NOTFALLZUGANG');
    const echt = new Date();
    const n2 = new Notfallzugang(datei, konten, speicherEinstellungen(), undefined, () => new Date(echt.getTime() - 16 * 60_000));
    assert.equal(await n2.pruefe(), 'angelegt');
    const link = /\/passwort\/(\S+)/.exec(await readFile(datei, 'utf8'))![1];
    await assert.rejects(konten.linkPruefen(link), /nicht mehr gültig|abgelaufen|ungültig/i);
    const jetzt = new Notfallzugang(datei, konten, speicherEinstellungen(), undefined, () => echt);
    assert.equal(await jetzt.pruefe(), 'geloescht');
    void n;
  });
});
