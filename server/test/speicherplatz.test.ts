/** Feste Ordner (#115) und Speicherplatz-Überwachung (#116). */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { mitPruefung, speicherDateien } from '../src/dateispeicher';
import { speicherEinstellungen } from '../src/einstellungen';
import { Fachfehler } from '../src/fehler';
import { ordnerUnter, pruefeOrdner } from '../src/ordner';
import { inBytes, LIMIT_TEXT, Speicherplatz } from '../src/speicherplatz';
import { Wartung } from '../src/wartung';

const GB = 1024 ** 3;

describe('Feste Ordner (#115)', () => {
  it('im Image /data, ohne Docker ./data, DMS_DATENWURZEL für Entwicklung', () => {
    assert.deepEqual(pruefeOrdner({ NODE_ENV: 'production' }, '/projekt/data').ordner, { dateien: '/data/files', geheim: '/data/geheim', sicherung: '/data/sicherung' });
    assert.equal(pruefeOrdner({}, '/projekt/data').ordner.dateien, '/projekt/data/files');
    assert.equal(pruefeOrdner({ NODE_ENV: 'production', DMS_DATENWURZEL: '/tmp/x' }, '/p').ordner.sicherung, '/tmp/x/sicherung');
  });

  it('frühere Variable mit festem Wert: nur Hinweis', () => {
    const p = pruefeOrdner({ NODE_ENV: 'production', FILES_DIR: '/data/files/', DMS_SCHLUESSEL_DATEI: '/data/geheim/dms.schluessel', DMS_SICHERUNG_DIR: '/data/sicherung' }, '/p');
    assert.deepEqual(p.ueberfluessig, ['FILES_DIR', 'DMS_SCHLUESSEL_DATEI', 'DMS_SICHERUNG_DIR']);
    assert.deepEqual(p.fehler, []);
  });

  it('frühere Variable mit anderem Wert: Start bricht ab, Meldung nennt das Volume', () => {
    const p = pruefeOrdner({ NODE_ENV: 'production', FILES_DIR: '/daten/dms', DMS_SCHLUESSEL_DATEI: '/schluessel/k' }, '/p');
    assert.equal(p.fehler.length, 2);
    assert.match(p.fehler[0], /FILES_DIR=\/daten\/dms wird nicht mehr unterstützt/);
    assert.match(p.fehler[0], /:\/data\/files\) und entferne FILES_DIR/);
    assert.match(p.fehler[1], /Ordner der Datei \/schluessel\/k/);
    assert.match(p.fehler[1], /\/data\/geheim/);
  });
});

function aufbau(freiGB: number, gesamtGB = 100) {
  let frei = freiGB * GB;
  const einstellungen = speicherEinstellungen();
  const mails: string[] = [];
  const konten = { beendeAlleSitzungenAusser: async () => 0 };
  let jetzt = new Date('2026-10-29T10:00:00Z');
  const wartung = new Wartung(einstellungen, konten, () => jetzt);
  const sp = new Speicherplatz(ordnerUnter('/data'), {
    einstellungen, wartung, anAdmins: async (b) => { mails.push(b); },
    messer: async () => ({ gesamt: gesamtGB * GB, frei }), jetzt: () => jetzt,
  });
  return { sp, wartung, mails, setzeFrei: (gb: number) => { frei = gb * GB; }, spaeter: (min: number) => { jetzt = new Date(jetzt.getTime() + min * 60_000); } };
}

describe('Speicherplatz-Überwachung (#116)', () => {
  it('Schwellen in Prozent und GB', () => {
    assert.equal(inBytes({ wert: 10, einheit: 'prozent' }, 100 * GB), 10 * GB);
    assert.equal(inBytes({ wert: 2, einheit: 'gb' }, 100 * GB), 2 * GB);
  });

  it('genug Platz: ok, keine Mail', async () => {
    const t = aufbau(50);
    const s = await t.sp.pruefe();
    assert.equal(s.zustand, 'ok');
    assert.equal(s.ordner.length, 3);
    assert.equal(t.mails.length, 0);
  });

  it('Warnschwelle: einmal Mail je Unterschreiten', async () => {
    const t = aufbau(8);
    assert.equal((await t.sp.pruefe()).zustand, 'warnung');
    await t.sp.pruefe();
    assert.deepEqual(t.mails, ['DMS: Speicherplatz wird knapp']);
    t.setzeFrei(20); await t.sp.pruefe();
    t.setzeFrei(9); await t.sp.pruefe();
    assert.equal(t.mails.length, 2);
    assert.equal(t.wartung.stand.stufe, 'aus');
  });

  it('Grenze: Hochladen gesperrt, Wartung mit 5 Minuten Vorlauf, kein automatisches Ende', async () => {
    const t = aufbau(1.5);
    const s = await t.sp.pruefe();
    assert.equal(s.zustand, 'grenze');
    assert.ok(t.mails.includes(`DMS: ${LIMIT_TEXT}`));
    const w = t.wartung.stand;
    assert.equal(w.stufe, 'angekuendigt');
    assert.equal(w.text, LIMIT_TEXT);
    assert.equal(w.ausloeser, 'speicherplatz');
    assert.equal(Date.parse(w.aktivAb!) - Date.parse('2026-10-29T10:00:00Z'), 5 * 60_000);
    // Hochladen sofort gesperrt
    const dateien = mitPruefung(speicherDateien(), () => t.sp.pruefeHochladen());
    await assert.rejects(dateien.schreibe('a'.repeat(64), Buffer.from('x')), (e: unknown) => e instanceof Fachfehler && e.status === 507 && /Speicherplatzlimit erreicht/.test(e.message));
    t.spaeter(6); await t.wartung.pruefe();
    assert.equal(t.wartung.stand.stufe, 'aktiv');
    // wieder Platz: Wartung bleibt, Werkbank bietet das Beenden an
    t.setzeFrei(40);
    const neu = await t.sp.pruefe();
    assert.equal(neu.zustand, 'ok');
    assert.equal(neu.wartungBeenden, true);
    assert.equal(t.wartung.stand.stufe, 'aktiv');
    await dateien.schreibe('a'.repeat(64), Buffer.from('x'));
  });

  it('Grenze löst die Wartung nur einmal aus; eine laufende Wartung bleibt unverändert', async () => {
    const t = aufbau(1);
    await t.wartung.einschalten({ text: 'Update', vorlauf: 0 }, { email: 'admin@example.org' }, null);
    await t.sp.pruefe();
    assert.equal(t.wartung.stand.text, 'Update');
    await t.wartung.ausschalten('admin@example.org');
    await t.sp.pruefe();
    assert.equal(t.wartung.stand.stufe, 'aus', 'nach bewusstem Beenden nicht erneut auslösen, solange die Grenze nicht neu unterschritten wird');
  });

  it('Einstellung prüfen', async () => {
    const t = aufbau(50);
    await assert.rejects(t.sp.speichere({ warnung: { wert: 1, einheit: 'gb' }, grenze: { wert: 2, einheit: 'gb' } }, 'a'), /Warnschwelle/);
    await assert.rejects(t.sp.speichere({ grenze: { wert: 2, einheit: 'tb' } }, 'a'), /Einheit/);
    const s = await t.sp.speichere({ warnung: { wert: 60, einheit: 'gb' } }, 'a');
    assert.equal(s.zustand, 'warnung');
    assert.deepEqual(s.einstellung.grenze, { wert: 2, einheit: 'gb' });
  });
});
