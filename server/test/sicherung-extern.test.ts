/**
 * Sicherung außer Haus (#585): Ereignis nach der Sicherung, Lesen nur der gemeldeten, verschlüsselten Datei in Stücken,
 * Rückmeldung je Sicherung, Hinweise und E-Mail, Aufbewahrung („lokal nur die neueste“), Notfallblatt.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import type { Datenquelle } from '../src/datenbankabzug';
import { speicherEinstellungen } from '../src/einstellungen';
import { notfallblatt, notfallblattPlan } from '../src/notfallblatt';
import { schluesselRecht } from '../src/laeufer/verwaltung';
import { ohneZugangsdaten, Sicherung, schlankeMetadaten, type ExternAnbindung, type SchlankeMetadaten } from '../src/sicherung';
import { Tresor } from '../src/tresor';
import { EREIGNISSE, liesCode, rechteText, SCHNITTSTELLEN } from '../../shared/src/pakete';
import { HILFE } from '../../shared/src/hilfe';
import { mailText } from '../src/mail';

const HAUSHALT = '00000000-0000-4000-8000-000000000001';
const TAG = 24 * 3600_000;
const ordnerListe: string[] = [];
after(async () => { for (const o of ordnerListe) await rm(o, { recursive: true, force: true }); });

function daten(): Datenquelle {
  return {
    async imSchnappschuss(f) {
      return f({
        postgres: '17.0', migrationen: ['001_a.sql'], tabellen: [{ name: 'mappen', spalten: ['id'] }],
        zaehler: { mappen: 1, dokumente: 0, benutzer: 1 },
        inhalt: async () => (async function* () { yield Buffer.from('1\n'); })(),
      });
    },
    async groesse() { return 10; },
  };
}

async function aufbau(o: { pakete?: Array<{ id: string; name: string; adresse: string | null }> } = {}) {
  const wurzel = await mkdtemp(join(tmpdir(), 'dms-extern-'));
  ordnerListe.push(wurzel);
  const einstellungen = speicherEinstellungen();
  const tresor = new Tresor(einstellungen, join(wurzel, 'geheim', 'dms.schluessel'), () => null);
  await tresor.laden();
  await tresor.erzeuge();
  await mkdir(join(wurzel, 'files', HAUSHALT, 'ab'), { recursive: true });
  // Etwas Zufall, damit die Datei größer ist als ein paar Bytes (Stücke lesen).
  await writeFile(join(wurzel, 'files', HAUSHALT, 'ab', 'gross'), Buffer.from(Array.from({ length: 300_000 }, (_, i) => (i * 7919) % 251)));
  let jetzt = new Date('2026-11-02T03:00:00Z');
  const mails: Array<{ betreff: string; text: string }> = [];
  const s = new Sicherung(join(wurzel, 'sicherung'), join(wurzel, 'files'), HAUSHALT, {
    tresor, einstellungen, daten: daten(), mountinfo: '/gibt-es-nicht', jetzt: () => jetzt,
    umgebung: async () => ({ dms: '0.142.0', node: '24', system: 'Linux', architektur: 'x64' }),
    anAdmins: async (betreff, text) => { mails.push({ betreff: mailText(betreff), text: mailText(text) }); },
  });
  const gemeldet: Array<SchlankeMetadaten & { name: string }> = [];
  const pakete = o.pakete ?? [{ id: 'sicherung_webdav', name: 'Sicherungsziel WebDAV', adresse: 'https://cloud.example.org' }];
  const ext: ExternAnbindung = { pakete: async () => pakete, melde: async (d) => { gemeldet.push(d); } };
  s.extern = ext;
  const sichere = async (art: 'manuell' | 'automatisch' = 'manuell') => (await (await s.starte(art, 'lena@example.org')).fertig)!;
  return { s, wurzel, einstellungen, mails, gemeldet, pakete, sichere, tresor, stelle: (d: Date) => { jetzt = d; } };
}

describe('Sicherung außer Haus (#585)', () => {
  it('meldet jede fertige Sicherung mit schlanken Metadaten – ohne Person, Umgebung, Zähler, Haushalt', async () => {
    const { s, gemeldet, sichere } = await aufbau();
    const meta = await sichere();
    assert.equal(gemeldet.length, 1);
    const d = gemeldet[0];
    assert.deepEqual(Object.keys(d).sort(), ['beginn', 'datei', 'format', 'groesse', 'name', 'schlank', 'sha256', 'verschluesselung']);
    assert.equal(d.datei, meta.datei);
    assert.equal(d.sha256, meta.sha256);
    assert.equal(d.groesse, meta.groessen.sicherungBytes);
    const text = JSON.stringify(d);
    for (const weg of ['lena@example.org', HAUSHALT, '0.142.0', 'Linux', 'mappen']) assert.ok(!text.includes(weg), `${weg} gehört nicht in die schlanken Metadaten`);
    const e = (await s.liste())[0];
    assert.deepEqual(Object.keys(e.extern!), ['sicherung_webdav']);
    assert.equal(e.extern!.sicherung_webdav.status, 'offen');
    assert.deepEqual(await s.externMeta('sicherung_webdav', e.name), { name: e.name, ...schlankeMetadaten(meta) });
  });

  it('ohne Paket kein Ereignis und kein Stand; die Sicherung selbst bleibt unberührt', async () => {
    const { s, gemeldet, sichere } = await aufbau({ pakete: [] });
    const meta = await sichere();
    assert.ok(meta);
    assert.equal(gemeldet.length, 0);
    assert.equal((await s.liste())[0].extern, undefined);
    assert.equal((await s.zustand()).extern, null);
  });

  it('liest nur die gemeldete Sicherung, in Stücken, genau die verschlüsselte Datei', async () => {
    const { s, sichere } = await aufbau();
    const meta = await sichere();
    const name = meta.datei.replace('.dms-sicherung', '');
    const datei = await readFile(join(s.ordner, meta.datei));
    const teile: Buffer[] = [];
    for (let ab = 0; ; ) {
      const { inhalt, groesse } = await s.externStueck('sicherung_webdav', name, String(ab), '65536');
      assert.equal(groesse, datei.length);
      if (!inhalt.length) break;
      teile.push(inhalt); ab += inhalt.length;
    }
    const zusammen = Buffer.concat(teile);
    assert.ok(zusammen.equals(datei));
    assert.equal(createHash('sha256').update(zusammen).digest('hex'), meta.sha256);
    // Fremdes Paket, unbekannte Sicherung, Pfade daneben, ungültige Grenzen.
    await assert.rejects(s.externStueck('anderes', name, '0', '10'), /nicht gemeldet/);
    await assert.rejects(s.externStueck('sicherung_webdav', '2026-01-01_0000-manuell', '0', '10'), /gibt es nicht/);
    await assert.rejects(s.externStueck('sicherung_webdav', '../geheim/dms', '0', '10'), /Ungültiger Name/);
    await assert.rejects(s.externStueck('sicherung_webdav', `.${name}`, '0', '10'), /Ungültiger Name/);
    await assert.rejects(s.externStueck('sicherung_webdav', name, '-1', '10'), /versatz/);
    await assert.rejects(s.externStueck('sicherung_webdav', name, '0', String(9 * 1024 * 1024)), /laenge/);
    await assert.rejects(s.externMeta('anderes', name), /nicht gemeldet/);
  });

  it('Rückmeldung je Sicherung: prüft die Angaben, entfernt Zugangsdaten, zeigt den Stand', async () => {
    const { s, sichere } = await aufbau();
    const meta = await sichere();
    const name = meta.datei.replace('.dms-sicherung', '');
    await assert.rejects(s.externRueckmeldung('sicherung_webdav', name, { status: 'toll' }), /status/);
    await assert.rejects(s.externRueckmeldung('sicherung_webdav', name, { status: 'geprueft' }), /pruefsumme oder stichprobe/);
    await assert.rejects(s.externRueckmeldung('sicherung_webdav', name, { status: 'hochgeladen', pruefung: 'pruefsumme' }), /status: geprueft/);
    await assert.rejects(s.externRueckmeldung('sicherung_webdav', name, { status: 'fehlgeschlagen' }), /Grund/);
    await assert.rejects(s.externRueckmeldung('fremd', name, { status: 'laeuft' }), /nicht gemeldet/);
    const l = await s.externRueckmeldung('sicherung_webdav', name, { status: 'laeuft', bytes: 10, gesamt: meta.groessen.sicherungBytes, ziel: 'WebDAV https://lena:geheim@cloud.example.org/remote.php/dav/files/lena/DMS' });
    assert.equal(l.ziel, 'WebDAV https://cloud.example.org/remote.php/dav/files/lena/DMS', 'ohne Benutzer und Passwort');
    const g = await s.externRueckmeldung('sicherung_webdav', name, { status: 'geprueft', pruefung: 'pruefsumme' });
    assert.equal(g.status, 'geprueft');
    assert.equal(g.ziel, l.ziel, 'das Ziel bleibt stehen');
    const z = await s.zustand();
    assert.equal(z.extern?.letzte?.name, name);
    assert.equal(z.extern?.zuAlt, false);
    assert.equal(z.extern?.fehler, null);
    assert.deepEqual((await s.externZiele()).map((x) => x.ziel), [l.ziel]);
    assert.equal(ohneZugangsdaten('https://a:b@x.example.org/p und http://c@y.example.org'), 'https://x.example.org/p und http://y.example.org');
  });

  it('Antwort auf das Ereignis (#636): Stand als „extern“, auch neben „weiter“; Fehler nach Rückgabewert', async () => {
    const { s, sichere, mails, stelle } = await aufbau();
    const meta = await sichere();
    const name = meta.datei.replace('.dms-sicherung', '');
    const st = async () => (await s.liste())[0].extern!.sicherung_webdav;
    const antwort = (x: Partial<{ ok: boolean; text: string; fehler: string | null; rc: number | null; beginn: number }>) =>
      s.externAntwort('sicherung_webdav', name, { ok: true, text: '', fehler: null, rc: 0, beginn: Date.parse('2026-11-02T03:30:00Z'), ...x });
    stelle(new Date('2026-11-02T03:31:00Z'));
    await antwort({ text: JSON.stringify({ weiter: { versatz: 8 }, extern: { status: 'laeuft', bytes: 8, gesamt: 100, ziel: 'WebDAV https://lena:geheim@cloud.example.org/DMS' } }) });
    assert.deepEqual([(await st()).status, (await st()).bytes, (await st()).ziel], ['laeuft', 8, 'WebDAV https://cloud.example.org/DMS']);
    // Ungültig: geprüft, aber nicht wie (wird nicht übernommen, wirft nicht).
    await antwort({ text: JSON.stringify({ extern: { status: 'geprueft' } }) });
    assert.equal((await st()).status, 'laeuft');
    // Fehler ohne „extern“: läuft mit Grund (Wiederholung), Zugangsdaten entfernt, Fortschritt und Ziel bleiben.
    stelle(new Date('2026-11-02T03:35:00Z'));
    await antwort({ ok: false, text: 'Netz weg: https://lena:geheim@cloud.example.org', fehler: 'Netz weg: https://lena:geheim@cloud.example.org', rc: 1, beginn: Date.parse('2026-11-02T03:34:00Z') });
    assert.deepEqual([(await st()).status, (await st()).grund, (await st()).bytes, (await st()).ziel], ['laeuft', 'Netz weg: https://cloud.example.org', 8, 'WebDAV https://cloud.example.org/DMS']);
    assert.equal(mails.length, 0);
    // Rückgabewert 2: endgültig, E-Mail.
    stelle(new Date('2026-11-02T03:40:00Z'));
    await antwort({ ok: false, text: 'Passwort falsch', fehler: 'Passwort falsch', rc: 2, beginn: Date.parse('2026-11-02T03:39:00Z') });
    await new Promise((r) => setTimeout(r, 20));
    assert.deepEqual([(await st()).status, (await st()).endgueltig, (await st()).grund], ['fehlgeschlagen', true, 'Passwort falsch']);
    assert.equal(mails.length, 1);
    // Ein Paket vor #636 hat während des Aufrufs schon per PUT gemeldet: die Antwort überschreibt das nicht.
    await antwort({ ok: false, text: 'x', fehler: 'x', rc: 1, beginn: Date.parse('2026-11-02T03:39:30Z') });
    assert.equal((await st()).grund, 'Passwort falsch');
    // Nächster Versuch, vorübergehend: wieder „läuft“, nicht mehr endgültig.
    stelle(new Date('2026-11-02T04:40:00Z'));
    await antwort({ ok: false, text: 'Zeitüberschreitung', fehler: 'Zeitüberschreitung', rc: 1, beginn: Date.parse('2026-11-02T04:39:00Z') });
    assert.deepEqual([(await st()).status, (await st()).endgueltig], ['laeuft', undefined]);
    // Erfolg mit Stand; danach ändern weder Erfolg ohne Stand noch ein Fehler etwas.
    await antwort({ text: JSON.stringify({ extern: { status: 'geprueft', pruefung: 'pruefsumme', bytes: 100, gesamt: 100 } }), beginn: Date.parse('2026-11-02T04:39:30Z') });
    await antwort({ text: 'Sicherung außer Haus', beginn: Date.parse('2026-11-02T05:00:00Z') });
    await antwort({ ok: false, text: 'x', fehler: 'x', rc: 1, beginn: Date.parse('2026-11-02T05:00:00Z') });
    assert.equal((await st()).status, 'geprueft');
    // Fremdes Paket oder unbekannte Sicherung: nichts.
    await s.externAntwort('fremd', name, { ok: true, text: JSON.stringify({ extern: { status: 'laeuft' } }), fehler: null, rc: 0, beginn: 0 });
    await s.externAntwort('sicherung_webdav', 'gibt-es-nicht', { ok: false, text: '', fehler: 'x', rc: 2, beginn: 0 });
    assert.deepEqual(Object.keys((await s.liste())[0].extern!), ['sicherung_webdav']);
  });

  it('gleichzeitige Rückmeldungen und eine neue Sicherung gehen nicht verloren', async () => {
    const { s, sichere, stelle } = await aufbau({ pakete: [{ id: 'a', name: 'A', adresse: null }, { id: 'b', name: 'B', adresse: null }] });
    const erste = (await sichere()).datei.replace('.dms-sicherung', '');
    stelle(new Date('2026-11-02T04:00:00Z'));
    const [, , zweite] = await Promise.all([
      s.externRueckmeldung('a', erste, { status: 'geprueft', pruefung: 'pruefsumme' }),
      s.externRueckmeldung('b', erste, { status: 'hochgeladen', pruefung: 'groesse' }),
      sichere(),
    ]);
    const liste = await s.liste();
    const e1 = liste.find((x) => x.name === erste)!;
    assert.deepEqual([e1.extern!.a.status, e1.extern!.b.status], ['geprueft', 'hochgeladen']);
    assert.deepEqual(Object.keys(liste.find((x) => x.name === zweite.datei.replace('.dms-sicherung', ''))!.extern!).sort(), ['a', 'b']);
  });

  it('falsche Prüfsumme am Ziel: fehlgeschlagen, Hinweis und genau eine E-Mail, die nur das Ziel nennt', async () => {
    const { s, sichere, mails } = await aufbau();
    const meta = await sichere();
    const name = meta.datei.replace('.dms-sicherung', '');
    await s.externRueckmeldung('sicherung_webdav', name, { status: 'fehlgeschlagen', grund: 'Die Prüfsumme am Ziel weicht ab.', endgueltig: true });
    await new Promise((r) => setTimeout(r, 20));
    const z = await s.zustand();
    assert.equal(z.extern?.fehler?.stand.grund, 'Die Prüfsumme am Ziel weicht ab.');
    assert.equal(mails.length, 1);
    assert.match(mails[0].betreff, /Kopie außer Haus fehlgeschlagen/);
    assert.match(mails[0].text, /Sicherungsziel WebDAV \(https:\/\/cloud\.example\.org\)/);
    assert.match(mails[0].text, /lokale Sicherung ist davon nicht betroffen/);
    assert.equal(await s.melde(), null, 'einmal je Vorfall');
    assert.equal(mails.length, 1);
    // Ein Fehlversuch, den die Wiederholung behebt: kein Fehler mehr.
    await s.externRueckmeldung('sicherung_webdav', name, { status: 'geprueft', pruefung: 'pruefsumme' });
    assert.equal((await s.zustand()).extern?.fehler, null);
  });

  it('vorübergehender Fehler ohne „endgueltig“: Hinweis ja, E-Mail nein; aufgegeben: endgültig mit E-Mail', async () => {
    const { s, sichere, mails } = await aufbau();
    const meta = await sichere();
    const name = meta.datei.replace('.dms-sicherung', '');
    await s.externRueckmeldung('sicherung_webdav', name, { status: 'fehlgeschlagen', grund: 'Netz unterbrochen' });
    assert.equal(await s.melde(), null);
    assert.equal(mails.length, 0);
    await s.externAufgegeben('sicherung_webdav', name, 'Zeitgrenze erreicht');
    await new Promise((r) => setTimeout(r, 20));
    const st = (await s.liste())[0].extern!.sicherung_webdav;
    assert.equal(st.status, 'fehlgeschlagen');
    assert.equal(st.endgueltig, true);
    assert.match(st.grund!, /aufgegeben: Netz unterbrochen/);
    assert.equal(mails.length, 1);
    // Schon erfolgreich: aufgeben ändert nichts.
    await s.externRueckmeldung('sicherung_webdav', name, { status: 'hochgeladen', pruefung: 'groesse' });
    await s.externAufgegeben('sicherung_webdav', name, 'x');
    assert.equal((await s.liste())[0].extern!.sicherung_webdav.status, 'hochgeladen');
  });

  it('mehr als 2 Tage ohne neue Kopie außer Haus: Hinweis und E-Mail; frische Kopie beendet den Vorfall', async () => {
    const { s, sichere, mails, stelle } = await aufbau();
    const erste = await sichere();
    await s.externRueckmeldung('sicherung_webdav', erste.datei.replace('.dms-sicherung', ''), { status: 'geprueft', pruefung: 'stichprobe' });
    stelle(new Date('2026-11-03T03:00:00Z'));
    const zweite = await sichere();
    assert.equal((await s.zustand()).extern?.zuAlt, false, 'erst einen Tag offen');
    stelle(new Date('2026-11-05T04:00:00Z'));
    const z = await s.zustand();
    assert.equal(z.extern?.zuAlt, true);
    assert.equal(z.extern?.letzte?.name, erste.datei.replace('.dms-sicherung', ''));
    assert.equal(await s.melde(), `extern-alt:${erste.datei.replace('.dms-sicherung', '')}`);
    assert.match(mails.at(-1)!.betreff, /Kopie außer Haus ist zu alt/);
    assert.ok(!mails.at(-1)!.text.includes('geheim'));
    await s.externRueckmeldung('sicherung_webdav', zweite.datei.replace('.dms-sicherung', ''), { status: 'geprueft', pruefung: 'pruefsumme' });
    assert.equal((await s.zustand()).extern?.zuAlt, false);
    // Ein entferntes Paket zählt nicht mehr (kein Dauer-Alarm).
  });

  it('Aufbewahrung: „lokal nur die neueste“, laufende Kopien bleiben stehen (höchstens 2 Tage), Stand verschwindet mit der Sicherung', async () => {
    const { s, sichere, stelle } = await aufbau();
    const nm = (m: { datei: string }) => m.datei.replace('.dms-sicherung', '');
    const a = await sichere('automatisch');
    stelle(new Date('2026-11-03T03:00:00Z'));
    const b = await sichere('automatisch');
    // #1194: erst wählbar, wenn eine Kopie außer Haus erfolgreich war.
    await assert.rejects(s.speicherePlan({ nurNeueste: true }, 'test'), /außer Haus/);
    await s.externRueckmeldung('sicherung_webdav', nm(a), { status: 'geprueft', pruefung: 'pruefsumme' });
    await s.speicherePlan({ nurNeueste: true }, 'test');
    assert.equal((await s.plan()).nurNeueste, true);
    assert.deepEqual((await s.zustand()).nurNeueste, { gesetzt: true, moeglich: true, wirksam: true });
    stelle(new Date('2026-11-04T03:00:00Z'));
    const c = await sichere('automatisch');
    const namen = (await s.liste()).map((x) => x.name);
    // a ist außer Haus und weg; b ist noch unterwegs (1 Tag) und bleibt; c ist die neueste.
    assert.deepEqual(namen, [nm(c), nm(b)]);
    const ext = (await s.einstellungen.lies('sicherung_extern')) as Record<string, unknown>;
    assert.ok(!(nm(a) in ext), 'Stand der entfernten Sicherung ist weg');
    stelle(new Date('2026-11-05T03:00:00Z'));
    await s.externRueckmeldung('sicherung_webdav', nm(c), { status: 'geprueft', pruefung: 'pruefsumme' });
    stelle(new Date('2026-11-07T03:00:00Z'));
    await sichere('automatisch');
    assert.equal((await s.liste()).length, 1, 'nach 2 Tagen gilt die Aufbewahrung auch für hängende Kopien');
    assert.equal((await s.speicher()).hochrechnung.stueck, 1);
    // „lokal keine“ gibt es nicht.
    assert.equal((await s.speicherePlan({ aufbewahrung: { taeglich: 0, woechentlich: 0, monatlich: 0 }, nurNeueste: true }, 't')).nurNeueste, true);
  });

  it('#1194: ohne erfolgreiche Kopie außer Haus löscht „lokal nur die neueste“ keine älteren Sicherungen', async () => {
    // Ohne Paket: nicht wählbar; ein schon gespeicherter Haken wirkt nicht.
    const ohne = await aufbau({ pakete: [] });
    await assert.rejects(ohne.s.speicherePlan({ nurNeueste: true }, 'test'), /außer Haus/);
    await ohne.einstellungen.schreibe('sicherung_plan', { ...(await ohne.s.plan()), nurNeueste: true });
    for (const tag of ['02', '03', '04']) { ohne.stelle(new Date(`2026-11-${tag}T03:00:00Z`)); await ohne.sichere('automatisch'); }
    assert.equal((await ohne.s.liste()).length, 3);
    assert.deepEqual((await ohne.s.zustand()).nurNeueste, { gesetzt: true, moeglich: false, wirksam: false });
    assert.notEqual((await ohne.s.speicher()).hochrechnung.stueck, 1);
    // Ziel fällt weg (Paket entfernt): Die Wirkung endet, ältere Sicherungen bleiben.
    const mit = await aufbau();
    const a = await mit.sichere('automatisch');
    await mit.s.externRueckmeldung('sicherung_webdav', a.datei.replace('.dms-sicherung', ''), { status: 'geprueft', pruefung: 'pruefsumme' });
    await mit.s.speicherePlan({ nurNeueste: true }, 'test');
    mit.pakete.splice(0);
    for (const tag of ['03', '04']) { mit.stelle(new Date(`2026-11-${tag}T03:00:00Z`)); await mit.sichere('automatisch'); }
    assert.equal((await mit.s.liste()).length, 3);
    assert.deepEqual((await mit.s.zustand()).nurNeueste, { gesetzt: true, moeglich: false, wirksam: false });
    // Letzte Kopie fehlgeschlagen: ebenfalls die normale Aufbewahrung.
    const fehl = await aufbau();
    const f1 = await fehl.sichere('automatisch');
    await fehl.s.externRueckmeldung('sicherung_webdav', f1.datei.replace('.dms-sicherung', ''), { status: 'geprueft', pruefung: 'pruefsumme' });
    await fehl.s.speicherePlan({ nurNeueste: true }, 'test');
    fehl.stelle(new Date('2026-11-03T03:00:00Z'));
    await fehl.sichere('automatisch'); // f1 ist außer Haus und darf weg
    const f2 = (await fehl.s.liste())[0].name;
    await fehl.s.externRueckmeldung('sicherung_webdav', f2, { status: 'fehlgeschlagen', grund: 'Netz weg', endgueltig: true });
    fehl.stelle(new Date('2026-11-04T03:00:00Z'));
    await fehl.sichere('automatisch');
    assert.equal((await fehl.s.liste()).length, 2, 'die fehlgeschlagene Kopie bleibt lokal');
  });

  it('Prüfen (Prüfsumme) geht auch mit der schlanken Metadaten-Datei vom Ziel', async () => {
    const { s, sichere } = await aufbau();
    const meta = await sichere();
    const name = meta.datei.replace('.dms-sicherung', '');
    await writeFile(join(s.ordner, `${name}.json`), JSON.stringify(schlankeMetadaten(meta)));
    const e = (await s.liste())[0];
    assert.equal(e.meta, null);
    assert.equal(e.schlank?.sha256, meta.sha256);
    s.pruefe(name, 'test');
    for (let i = 0; i < 200 && s.laeuft(); i++) await new Promise((r) => setTimeout(r, 10));
    assert.deepEqual(s.aktuellerLauf()?.ergebnis, { ok: true });
    assert.deepEqual((await readdir(s.ordner)).filter((n) => n.startsWith('.')), []);
  });

  it('Notfallblatt nennt das Ziel ohne Passwort und warnt, den Schlüssel dazuzulegen', async () => {
    const plan = notfallblattPlan({
      name: 'Ablago', haushaltId: HAUSHALT, adresse: 'https://ablage.example.org', version: '0.142.0', erstellt: new Date('2026-11-02T10:00:00Z'),
      schluessel: 'A'.repeat(43), fingerabdruck: 'ab12',
      aussenziele: [{ name: 'Sicherungsziel WebDAV', adresse: 'https://lena:geheim@cloud.example.org', ziel: null }],
    });
    const alles = JSON.stringify(plan);
    const hat = (t: string) => alles.includes(t);
    assert.ok(hat('Kopie außer Haus'));
    assert.ok(hat('Sicherungsziel WebDAV (https://cloud.example.org)'), 'Paket und Adresse');
    assert.ok(!hat('geheim@') && !hat('lena:'), 'kein Benutzer, kein Passwort');
    assert.ok(hat('liegt nicht auf dem Ziel'));
    assert.equal((await notfallblatt({ name: 'Ablago', haushaltId: HAUSHALT, adresse: '', version: '0.142.0', erstellt: new Date(), schluessel: 'A'.repeat(43), fingerabdruck: 'ab12' })).subarray(0, 5).toString('latin1'), '%PDF-');
  });

  it('Recht und Ereignis: nur zusammen, im Manifest lesbar, in der Rückfrage verständlich, Schlüssel darf nur lesen', () => {
    assert.ok('sicherung.fertig' in EREIGNISSE);
    assert.match(SCHNITTSTELLEN['dms:sicherung-lesen'], /kann sie nicht öffnen/);
    const gut = liesCode({ sprache: 'c', ereignisse: ['sicherung.fertig'], rechte: { schnittstellen: ['dms:sicherung-lesen'] } });
    assert.deepEqual(gut.fehler, []);
    assert.deepEqual(gut.code!.rechte.lesen, []);
    assert.equal(schluesselRecht(gut.code!), 'lesen', 'meldet in der Antwort, schreibt nichts (#636)');
    assert.match(liesCode({ sprache: 'c', rechte: { schnittstellen: ['dms:sicherung-lesen'] } }).fehler.join(' '), /braucht das Ereignis sicherung.fertig/);
    assert.match(liesCode({ sprache: 'c', ereignisse: ['sicherung.fertig'] }).fehler.join(' '), /nur mit code.rechte.schnittstellen: \[dms:sicherung-lesen\]/);
    const zeilen = rechteText(gut.code!, (v) => v);
    assert.ok(zeilen.some((z) => /verschlüsselte Sicherung lesen.*\(dms:sicherung-lesen\)/.test(z)), zeilen.join('\n'));
    assert.ok(zeilen.some((z) => /Sicherung ist fertig/.test(z)), zeilen.join('\n'));
    assert.ok(HILFE['pakete.recht.sicherung'] && HILFE['pakete.ereignis.sicherung_fertig'] && HILFE['sicherung.extern']);
  });
});
