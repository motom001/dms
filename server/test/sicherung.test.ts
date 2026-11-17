/** Sicherung (#103–#105): anlegen, Liste, Prüfsumme, Zeitplan, Aufbewahrung, Speicherplatz, Hinweise. */
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import type { Datenquelle } from '../src/sicherung/datenbankabzug';
import { speicherEinstellungen } from '../src/einstellungen/einstellungen';
import { Fachfehler } from '../src/grundlagen/fehler';
import { protokoll } from '../src/protokoll/protokoll';
import { behalten, bereinigePlan, isoWoche, ortszeit, PLAN_STANDARD, Sicherung, type Lauf, type Metadaten } from '../src/sicherung/sicherung';
import { liesSicherung, sammle, ZWECK } from '../src/sicherung/sicherungsformat';
import { leiteAb, Tresor } from '../src/geheimnisse/tresor';
import { mailText } from '../src/mail/mail';
import { Nachweisjournal, setzeNachweisjournal, speicherJournal } from '../src/protokoll/nachweisjournal';
import { nachweise } from '../src/paketdaten';

const HAUSHALT = '00000000-0000-4000-8000-000000000001';

function falscheDaten(): Datenquelle {
  return {
    async imSchnappschuss(f) {
      return f({
        postgres: '17.0', migrationen: ['001_a.sql', '002_b.sql'], tabellen: [{ name: 'mappen', spalten: ['id', 'titel'] }, { name: 'sitzungen', spalten: ['x'] }],
        zaehler: { mappen: 2, dokumente: 1, benutzer: 1 },
        inhalt: async () => (async function* () { yield Buffer.from('1\tA\n2\tB\n'); })(),
      });
    },
    async groesse() { return 4096; },
  };
}

async function aufbau(opt: { jetzt?: () => Date; daten?: Datenquelle; wartung?: () => boolean } = {}) {
  const wurzel = await mkdtemp(join(tmpdir(), 'dms-sich-'));
  const einstellungen = speicherEinstellungen();
  const tresor = new Tresor(einstellungen, join(wurzel, 'geheim', 'dms.schluessel'), () => null);
  await tresor.laden();
  await tresor.erzeuge();
  const dateien = join(wurzel, 'files');
  await mkdir(join(dateien, HAUSHALT, 'ab'), { recursive: true });
  await writeFile(join(dateien, HAUSHALT, 'ab', 'abcdef'), 'Inhalt eines Dokuments');
  await mkdir(join(dateien, HAUSHALT, 'designs'), { recursive: true });
  await writeFile(join(dateien, HAUSHALT, 'designs', 'logo'), 'LOGO');
  await writeFile(join(dateien, HAUSHALT, 'ab', 'halb.123.tmp'), 'halb geschrieben');
  const mails: string[] = [];
  const s = new Sicherung(join(wurzel, 'sicherung'), dateien, HAUSHALT, {
    tresor, einstellungen, daten: opt.daten ?? falscheDaten(),
    umgebung: async () => ({ dms: '0.20.0', node: '22', system: 'Linux', architektur: 'x64' }),
    wartungAktiv: opt.wartung, anAdmins: async (b) => { mails.push(mailText(b)); }, mountinfo: '/gibt-es-nicht', jetzt: opt.jetzt,
  });
  return { s, tresor, einstellungen, wurzel, mails };
}

describe('Sicherung (#103–#105)', () => {
  it('legt eine verschlüsselte Sicherung mit Metadaten an; ohne Sitzungen, mit allen Dateien', async () => {
    const { s, tresor } = await aufbau();
    const vorher = protokoll.letzteNr;
    const { fertig } = await s.starte('manuell', 'admin@example.org');
    const meta = (await fertig)!;
    assert.ok(meta, JSON.stringify(s.aktuellerLauf()));
    assert.equal(meta.haushaltId, HAUSHALT);
    assert.equal(meta.verschluesselung.fingerabdruck, tresor.fingerabdruck);
    assert.equal(meta.umgebung.datenbankStand, '002_b.sql');
    assert.deepEqual(meta.anzahl, { mappen: 2, dokumente: 1, benutzer: 1, dateien: 2, tabellen: 1, fassungen: 0, archivfassungen: 0 });
    const namen = (await readdir(s.ordner)).sort();
    assert.equal(namen.length, 2, namen.join(', '));
    assert.ok(namen.some((n) => n.endsWith('.json')) && namen.some((n) => n.endsWith('.dms-sicherung')));
    const json = JSON.parse(await readFile(join(s.ordner, namen.find((n) => n.endsWith('.json'))!), 'utf8')) as Metadaten;
    assert.equal(json.sha256, meta.sha256);
    assert.ok(!JSON.stringify(json).includes(tresor.alsText()!), 'der Schlüssel steht nicht in den Metadaten');

    // Lesen mit dem abgeleiteten Schlüssel: Inhaltsangabe, Tabelle, Dateien, Ende.
    const arten: string[] = []; const pfade: string[] = []; let tabelle = '';
    for await (const e of liesSicherung(join(s.ordner, meta.datei), leiteAb(Buffer.from(tresor.alsText()!, 'base64url'), ZWECK))) {
      arten.push(e.art);
      const d = await sammle(e.daten);
      if (e.art === 'T') tabelle = `${e.kopf.tabelle}:${d}`;
      if (e.art === 'D') pfade.push(`${e.kopf.pfad}=${d}`);
    }
    assert.deepEqual(arten, ['M', 'T', 'D', 'D', 'E']);
    assert.equal(tabelle, 'mappen:1\tA\n2\tB\n', 'sitzungen ohne Inhalt');
    assert.deepEqual(pfade, ['ab/abcdef=Inhalt eines Dokuments', 'designs/logo=LOGO']);
    const texte = protokoll.eintraege({ seit: vorher, modul: 'sicherung' }).map((e) => e.text);
    assert.ok(texte.includes('Sicherung begonnen') && texte.includes('Sicherung fertig'), texte.join(' | '));

    // Liste und Prüfsumme
    const liste = await s.liste();
    assert.equal(liste.length, 1);
    assert.equal(liste[0].meta?.art, 'manuell');
    s.pruefe(liste[0].name, 'admin');
    while (s.laeuft()) await new Promise((r) => setTimeout(r, 10));
    assert.deepEqual(s.aktuellerLauf()?.ergebnis, { ok: true });
    const datei = join(s.ordner, meta.datei);
    const b = await readFile(datei); b[b.length - 1] ^= 1; await writeFile(datei, b);
    s.pruefe(liste[0].name, 'admin');
    while (s.laeuft()) await new Promise((r) => setTimeout(r, 10));
    assert.deepEqual(s.aktuellerLauf()?.ergebnis, { ok: false });
    assert.equal((await s.liste())[0].pruefung?.ok, false);
  });

  it('ohne Schlüssel keine Sicherung; bei zu wenig Platz auch nicht', async () => {
    const wurzel = await mkdtemp(join(tmpdir(), 'dms-sich-'));
    const t = new Tresor(speicherEinstellungen(), join(wurzel, 'k'), () => null);
    await t.laden();
    const s = new Sicherung(join(wurzel, 's'), join(wurzel, 'f'), HAUSHALT, { tresor: t, einstellungen: speicherEinstellungen(), daten: falscheDaten(), umgebung: async () => ({ dms: '', node: '', system: '', architektur: '' }) });
    await assert.rejects(s.starte('manuell', 'x'), (e: unknown) => e instanceof Fachfehler && e.status === 409 && /Verschlüsselung/.test(e.message));
    const { s: s2, einstellungen } = await aufbau();
    await einstellungen.schreibe('sicherung_plan', { ...PLAN_STANDARD, mindestFreiGB: 100_000 });
    await assert.rejects(s2.starte('manuell', 'x'), /Zu wenig freier Speicherplatz/);
    assert.match((await s2.zustand()).fehler!.grund, /Speicherplatz/);
  });

  it('Schlüssel eben in einem anderen Prozess erzeugt (#1419): „Sicherung jetzt“ liest ihn nach, statt abzulehnen', async () => {
    const wurzel = await mkdtemp(join(tmpdir(), 'dms-sich-'));
    // Zwei Prozesse: dieselbe Schlüsseldatei, dieselben Einstellungen, je ein eigener Tresor im Arbeitsspeicher.
    const einstellungen = speicherEinstellungen();
    const datei = join(wurzel, 'geheim', 'dms.schluessel');
    const anderer = new Tresor(einstellungen, datei, () => null);
    const dieser = new Tresor(einstellungen, datei, () => null);
    await anderer.laden();
    await dieser.laden();
    const s = new Sicherung(join(wurzel, 's'), join(wurzel, 'f'), HAUSHALT, { tresor: dieser, einstellungen, daten: falscheDaten(), umgebung: async () => ({ dms: '', node: '', system: '', architektur: '' }), mountinfo: '/gibt-es-nicht' });
    await anderer.erzeuge();
    assert.equal(dieser.bereit, false, 'dieser Prozess kennt den neuen Schlüssel noch nicht');
    const meta = await (await s.starte('manuell', 'admin@example.org')).fertig;
    assert.equal(meta?.verschluesselung.fingerabdruck, anderer.fingerabdruck);
  });

  it('behält je Tag, Woche und Monat die neueste Sicherung (7/4/12)', () => {
    const liste = Array.from({ length: 120 }, (_, i) => ({ name: `s${i}`, beginn: new Date(Date.UTC(2026, 9, 29, 1) - i * 24 * 3600 * 1000).toISOString() }));
    const bleibt = behalten(liste, { taeglich: 7, woechentlich: 4, monatlich: 12 });
    for (let i = 0; i < 7; i++) assert.ok(bleibt.has(`s${i}`), `Tag ${i}`);
    assert.ok(bleibt.size <= 7 + 4 + 12 && bleibt.size >= 10, String(bleibt.size));
    assert.ok(bleibt.has('s59') && bleibt.has('s90'), 'je Monat die neueste: 31.08. und 31.07.');
    assert.equal(isoWoche('2026-01-01'), '2026-W01');
    assert.equal(isoWoche('2027-01-01'), '2026-W53');
    assert.deepEqual(ortszeit(new Date('2026-10-29T01:30:00Z')), { datum: '2026-10-29', uhr: '02:30', wochentag: 4 });
  });

  it('prüft den Zeitplan und schaltet ihn erst nach dem Notfallblatt ein', async () => {
    assert.throws(() => bereinigePlan({ uhrzeit: '25:00' }), /HH:MM/);
    assert.throws(() => bereinigePlan({ aufbewahrung: { taeglich: -1 } }), /zwischen/);
    let jetzt = new Date('2026-10-29T00:30:00Z'); // 01:30 deutscher Zeit
    let wartung = false;
    const { s, mails } = await aufbau({ jetzt: () => jetzt, wartung: () => wartung });
    await assert.rejects(s.speicherePlan({ aktiv: true }, 'admin'), /Notfallblatt/);
    await s.notfallblattErstellt('admin');
    assert.ok((await s.notfallblatt()).aktuell);
    // #815: Notfallcode benutzt – das Blatt gilt nicht mehr, bis ein neues heruntergeladen ist.
    await s.notfallcodeBenutzt();
    assert.deepEqual([(await s.notfallblatt()).aktuell, !!(await s.notfallblatt()).codeBenutzt], [false, true]);
    await s.notfallblattErstellt('admin');
    assert.deepEqual([(await s.notfallblatt()).aktuell, (await s.notfallblatt()).codeBenutzt, (await s.notfallblatt()).ohneCode], [true, null, false]);
    await s.speicherePlan({ aktiv: true, uhrzeit: '02:00', aufbewahrung: { taeglich: 2, woechentlich: 0, monatlich: 0 } }, 'admin');
    assert.equal(await s.tick(), 'nichts', 'noch nicht 02:00');
    jetzt = new Date('2026-10-29T01:05:00Z');
    wartung = true;
    assert.equal(await s.tick(), 'nichts', 'pausiert im Wartungsmodus');
    wartung = false;
    assert.equal(await s.tick(), 'gestartet');
    while (s.laeuft()) await new Promise((r) => setTimeout(r, 10));
    assert.equal(await s.tick(), 'nichts', 'nur einmal am Tag');
    // Zwei weitere Tage: es bleiben die zwei neuesten.
    for (const iso of ['2026-10-30T01:05:00Z', '2026-10-31T01:05:00Z']) {
      jetzt = new Date(iso);
      assert.equal(await s.tick(), 'gestartet');
      while (s.laeuft()) await new Promise((r) => setTimeout(r, 10));
      await new Promise((r) => setTimeout(r, 20));
    }
    const liste = await s.liste();
    assert.deepEqual(liste.map((x) => x.meta?.beginn.slice(0, 10)), ['2026-10-31', '2026-10-30']);
    assert.deepEqual(mails, [], 'alles in Ordnung: keine Mail');
    // Vier Tage später ohne Sicherung: einmal eine Mail.
    await s.speicherePlan({ uhrzeit: '23:59' }, 'admin');
    jetzt = new Date('2026-11-04T10:00:00Z');
    await s.tick(); await s.tick();
    assert.deepEqual(mails, ['Ablago: Die letzte Sicherung ist zu alt']);
    const sp = await s.speicher();
    assert.equal(sp.anzahl, 2);
    assert.equal(sp.dateien, 2);
    assert.equal(sp.datenbankBytes, 4096);
    assert.equal(sp.hochrechnung.stueck, 2);
  });

  it('meldet eine fehlgeschlagene Sicherung einmal', async () => {
    const kaputt: Datenquelle = { ...falscheDaten(), async imSchnappschuss() { throw new Error('Datenbank weg'); } };
    const { s, mails } = await aufbau({ daten: kaputt });
    const { fertig } = await s.starte('manuell', 'admin');
    assert.equal(await fertig, null);
    assert.equal(s.aktuellerLauf()?.status, 'fehler');
    assert.deepEqual(await readdir(s.ordner), [], 'keine halben Dateien');
    await s.melde(); await s.melde();
    assert.deepEqual(mails, ['Ablago: Sicherung fehlgeschlagen']);
    assert.equal((await s.zustand()).fehler?.grund, 'Datenbank weg');
  });

  /**
   * Erst ankündigen und aufräumen, dann melden (#1378): Jeder Zustandswechsel des Laufs wird im Augenblick des
   * Setzens mitgeschnitten – synchron, ohne dass ein anderer Schritt dazwischen läuft.
   */
  function schneideMit(s: Sicherung, schritte: string[]) {
    const gesehen: Array<{ status: string; schritte: string[]; beendet: boolean }> = [];
    const belege = s.belege.bind(s);
    s.belege = (art, titel) => {
      const lauf = belege(art, titel);
      let status = lauf.status;
      Object.defineProperty(lauf, 'status', {
        enumerable: true,
        get: () => status,
        set: (w: Lauf['status']) => {
          gesehen.push({ status: w, schritte: [...schritte], beendet: !!lauf.beendet });
          status = w;
        },
      });
      return lauf;
    };
    return gesehen;
  }
  type Nacharbeiten = { kuendigeAn: () => Promise<void>; raeumeAuf: () => Promise<string[]>; freierName: () => Promise<string> };

  it('meldet „fertig“ erst nach Ankündigen und Aufräumen, nie „fertig“ und danach „fehler“ (#1378)', async () => {
    for (const scheitert of [null, 'kuendigeAn', 'raeumeAuf'] as const) {
      const { s, einstellungen } = await aufbau();
      const schritte: string[] = [];
      const n = s as unknown as Nacharbeiten;
      const kuendigeAn = n.kuendigeAn.bind(s);
      const raeumeAuf = n.raeumeAuf.bind(s);
      n.kuendigeAn = async (...a: unknown[]) => {
        await (kuendigeAn as (...x: unknown[]) => Promise<void>)(...a);
        schritte.push('angekuendigt');
        if (scheitert === 'kuendigeAn') throw new Error('Ankündigen gescheitert');
      };
      n.raeumeAuf = async () => {
        const weg = await raeumeAuf();
        schritte.push('aufgeraeumt');
        if (scheitert === 'raeumeAuf') throw new Error('Aufräumen gescheitert');
        return weg;
      };
      const gesehen = schneideMit(s, schritte);
      const meta = await (await s.starte('automatisch', 'zeitplan')).fertig;
      const lauf = s.aktuellerLauf()!;
      const erwartet = scheitert === 'kuendigeAn' ? ['angekuendigt'] : ['angekuendigt', 'aufgeraeumt'];
      // Bisheriges Endergebnis bleibt: Scheitert eine Nacharbeit, endet der Lauf mit „fehler“ und gemerktem Fehlerstand.
      assert.deepEqual(gesehen, [{ status: scheitert ? 'fehler' : 'fertig', schritte: erwartet, beendet: true }], String(scheitert));
      assert.equal(meta === null, scheitert !== null, String(scheitert));
      assert.equal(lauf.schritt, scheitert ? 'Abgebrochen' : 'Fertig');
      if (scheitert) {
        assert.equal(lauf.fehler, scheitert === 'kuendigeAn' ? 'Ankündigen gescheitert' : 'Aufräumen gescheitert');
        assert.equal(lauf.ergebnis, undefined, 'ein gescheiterter Lauf trägt kein Ergebnis');
        assert.equal(((await einstellungen.lies('sicherung_fehler')) as { grund?: string } | null)?.grund, lauf.fehler);
      } else {
        assert.equal(lauf.ergebnis, meta);
        assert.equal(await einstellungen.lies('sicherung_fehler'), null);
      }
      // Die neue Sicherung selbst ist vollständig und bleibt liegen.
      assert.equal((await s.liste()).length, 1, String(scheitert));
    }
  });

  it('beendet den Lauf auch, wenn schon die Suche nach einem freien Namen scheitert (#1378)', async () => {
    const { s } = await aufbau();
    (s as unknown as Nacharbeiten).freierName = async () => {
      throw new Error('Ordner nicht lesbar');
    };
    const gesehen = schneideMit(s, []);
    assert.equal(await (await s.starte('manuell', 'admin')).fertig, null);
    assert.deepEqual(gesehen, [{ status: 'fehler', schritte: [], beendet: true }]);
    assert.equal(s.laeuft(), false, 'der Lauf blockiert keine weitere Sicherung');
    assert.equal(s.aktuellerLauf()?.fehler, 'Ordner nicht lesbar');
    assert.equal((await s.zustand()).fehler?.grund, 'Ordner nicht lesbar');
  });
});

/* ---------- Fehlgeschlagene Sicherungen im Nachweis-Journal (#1308) ---------- */

describe('Fehlgeschlagene Sicherungen im Nachweis-Journal (#1308)', () => {
  /** Journal im Arbeitsspeicher mit fester Zeit; nach dem Test wieder abgemeldet. */
  async function mitJournal(f: (j: Nachweisjournal, zeit: (iso: string) => void) => Promise<void>) {
    let jetzt = new Date('2026-11-03T01:00:00Z');
    const j = new Nachweisjournal(speicherJournal(), () => jetzt);
    setzeNachweisjournal(j);
    try {
      await f(j, (iso) => { jetzt = new Date(iso); });
    } finally {
      setzeNachweisjournal(null);
    }
  }
  const daten = async (j: Nachweisjournal) => (await j.monat('2026-11')).eintraege.filter((e) => e.art === 'sicherung.fehlgeschlagen').map((e) => e.daten);

  it('Lauf scheitert: ein Eintrag mit festem Grund, ohne Fehlertext und Pfad – auch in den Nachweisen', async () => {
    const geheim = 'Konto-Geheim-7f3a9c2e5b';
    const kaputt: Datenquelle = { ...falscheDaten(), async imSchnappschuss() { throw new Error(`postgres://ablago:${geheim}@db/ablago: /data/files/geheimer-ordner`); } };
    await mitJournal(async (j, zeit) => {
      const { s } = await aufbau({ daten: kaputt });
      assert.equal(await (await s.starte('automatisch', 'Zeitplan')).fertig, null);
      zeit('2026-11-03T01:30:00Z');
      assert.equal(await (await s.starte('automatisch', 'Zeitplan')).fertig, null);
      zeit('2026-11-03T09:00:00Z');
      assert.equal(await (await s.starte('manuell', 'admin@example.org')).fertig, null);
      assert.deepEqual(await daten(j), [
        { tag: '2026-11-03', art: 'automatisch', ort: 'lokal', ziel: null, grund: 'fehler', anzahl: 2, letzte: '2026-11-03T01:30:00.000Z' },
        { tag: '2026-11-03', art: 'hand', ort: 'lokal', ziel: null, grund: 'fehler', anzahl: 1, letzte: '2026-11-03T09:00:00.000Z' },
      ]);
      const n = await nachweise('sicherung', '2026-11', { journal: (m) => j.monat(m), jetzt: () => new Date('2026-11-20T00:00:00Z') });
      assert.deepEqual(n.eintraege.map((e) => [e.kennung, e.zeit, e.daten.grund, e.daten.anzahl]), [
        ['sicherung.fehlgeschlagen', '2026-11-03T01:00:00.000Z', 'fehler', 2],
        ['sicherung.fehlgeschlagen', '2026-11-03T09:00:00.000Z', 'fehler', 1],
      ]);
      const text = JSON.stringify(n);
      assert.ok(!text.includes(geheim) && !text.includes('/data/files') && !text.includes('postgres://'), text);
    });
  });

  it('Gründe: kein Schlüssel, zu wenig Platz (auch ENOSPC), abgebrochener Lauf nach dem Neustart', async () => {
    await mitJournal(async (j) => {
      const wurzel = await mkdtemp(join(tmpdir(), 'dms-sich-'));
      const t = new Tresor(speicherEinstellungen(), join(wurzel, 'k'), () => null);
      await t.laden();
      const ohne = new Sicherung(join(wurzel, 's'), join(wurzel, 'f'), HAUSHALT, { tresor: t, einstellungen: speicherEinstellungen(), daten: falscheDaten(), umgebung: async () => ({ dms: '', node: '', system: '', architektur: '' }) });
      await assert.rejects(ohne.starte('automatisch', 'Zeitplan'), /Verschlüsselung/);
      const { s, einstellungen } = await aufbau();
      await einstellungen.schreibe('sicherung_plan', { ...PLAN_STANDARD, mindestFreiGB: 100_000 });
      await assert.rejects(s.starte('manuell', 'x'), /Zu wenig freier Speicherplatz/);
      const voll: Datenquelle = { ...falscheDaten(), async imSchnappschuss() { throw Object.assign(new Error('no space left on device, write /sicherung/x'), { code: 'ENOSPC' }); } };
      const { s: s2 } = await aufbau({ daten: voll });
      assert.equal(await (await s2.starte('vor-wiederherstellung', 'x')).fertig, null);
      // Neustart mitten im Lauf: die halbe Datei bleibt liegen; beim Start aufgeräumt und als Abbruch vermerkt.
      await mkdir(s2.ordner, { recursive: true });
      await writeFile(join(s2.ordner, '.2026-11-03_0100-automatisch.dms-sicherung.teil'), 'halb');
      await writeFile(join(s2.ordner, '.2026-11-03_0100-automatisch.json.teil'), '{}');
      await s2.raeumeTeileAuf();
      assert.deepEqual(await readdir(s2.ordner), []);
      assert.deepEqual((await daten(j)).map((d) => `${d.art}:${d.grund}:${d.anzahl}`), ['automatisch:schluessel:1', 'hand:platz:2', 'automatisch:abbruch:1']);
    });
  });

  it('scheitert nur die Nacharbeit, fehlt keine Sicherung: kein Eintrag', async () => {
    await mitJournal(async (j) => {
      const { s } = await aufbau();
      (s as unknown as { raeumeAuf: () => Promise<string[]> }).raeumeAuf = async () => { throw new Error('Aufräumen gestört'); };
      assert.equal(await (await s.starte('automatisch', 'Zeitplan')).fertig, null);
      assert.equal((await s.liste()).length, 1, 'die Sicherung selbst liegt vor');
      assert.deepEqual(await daten(j), []);
    });
  });
});

/* ---------- Gegen PostgreSQL: echter Schnappschuss ---------- */

const url = process.env.TEST_DATABASE_URL;
describe('Sicherung mit PostgreSQL', { skip: url ? false : 'TEST_DATABASE_URL nicht gesetzt' }, () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Module erst nach dem Setzen der Umgebung dynamisch geladen; Typ im Test ohne Belang
  let haupt: any; let sql: any;
  const db = `dms_sicherung_${process.pid}`;
  before(async () => {
    const { verbinde } = await import('../src/datenbank/db');
    haupt = verbinde(url!);
    await haupt.unsafe(`DROP DATABASE IF EXISTS ${db}`);
    await haupt.unsafe(`CREATE DATABASE ${db}`);
    const u = new URL(url!); u.pathname = `/${db}`;
    sql = verbinde(u.toString());
  });
  after(async () => {
    await sql?.end();
    await haupt?.unsafe(`DROP DATABASE IF EXISTS ${db}`);
    await haupt?.end();
  });

  it('sichert alle Tabellen in einem Schnappschuss, Eltern vor Kindern, ohne Sitzungen', async () => {
    const { fileURLToPath } = await import('node:url');
    const { migriere } = await import('../src/datenbank/db');
    const { pgDatenquelle, tabellenIn } = await import('../src/sicherung/datenbankabzug');
    const { pgRepo } = await import('../src/repo/pg');
    const { Dienst } = await import('../src/dienst/dienst');
    const { ordnerSpeicher } = await import('../src/dateien/dateispeicher');
    const { ladeBeispiele } = await import('../src/beispiele/beispiele');
    const { pgEinstellungen: pgBetriebSpeicher } = await import('../src/einstellungen/einstellungen');
    await migriere(sql, fileURLToPath(new URL('../migrations', import.meta.url)), () => {});
    await sql`INSERT INTO haushalte (id, name) VALUES (${HAUSHALT}, 'Test') ON CONFLICT DO NOTHING`;
    const wurzel = await mkdtemp(join(tmpdir(), 'dms-sich-pg-'));
    const d = new Dienst(pgRepo(sql, HAUSHALT), ordnerSpeicher(join(wurzel, 'files'), HAUSHALT), { einstellungen: pgBetriebSpeicher(sql, HAUSHALT) });
    await ladeBeispiele(d, null);
    // Eine Mappe mit Register „dokumente“ (Vertragspartner); die Ablageorte haben keins.
    const partner = (await d.mappentypen.listeTypen()).find((t) => t.name === 'Vertragspartner')!;
    const m = (await d.mappen.listeMappen(partner.id))[0];
    await d.dokumente.ladeHoch(m.id, { register: 'dokumente', name: 'brief.txt', typ: 'text/plain' }, Buffer.from('Hallo Welt'), null);

    const reihenfolge = (await tabellenIn(sql)).map((t) => t.name);
    assert.ok(reihenfolge.indexOf('haushalte') < reihenfolge.indexOf('mappen'));
    assert.ok(reihenfolge.indexOf('mappen') < reihenfolge.indexOf('dokumente'));
    assert.ok(reihenfolge.indexOf('benutzer') < reihenfolge.indexOf('sitzungen'));

    const tresor = new Tresor(pgBetriebSpeicher(sql, HAUSHALT), join(wurzel, 'geheim', 'k'), () => null);
    await tresor.laden(); await tresor.erzeuge();
    assert.equal(await tresor.pruefwort(), true);
    const s = new Sicherung(join(wurzel, 'sicherung'), join(wurzel, 'files'), HAUSHALT, {
      tresor, einstellungen: pgBetriebSpeicher(sql, HAUSHALT), daten: pgDatenquelle(sql),
      umgebung: async () => ({ dms: 'test', node: process.versions.node, system: 'Linux', architektur: 'x64' }), mountinfo: '/gibt-es-nicht',
    });
    const meta = (await (await s.starte('manuell', 'test')).fertig)!;
    assert.ok(meta, JSON.stringify(s.aktuellerLauf()));
    assert.equal(meta.anzahl.mappen, (await d.mappen.listeMappen()).length);
    assert.equal(meta.anzahl.dokumente, 1);
    assert.equal(meta.anzahl.dateien, 1);
    assert.ok(meta.migrationen.includes('001_grundgeruest.sql'));
    const tabellen: string[] = []; let pruefwort = false;
    for await (const e of liesSicherung(join(s.ordner, meta.datei), tresor.abgeleitet(ZWECK)!)) {
      const daten = (await sammle(e.daten)).toString();
      if (e.art === 'T') tabellen.push(e.kopf.tabelle as string);
      if (e.art === 'T' && e.kopf.tabelle === 'einstellungen' && daten.includes('pruefwort')) pruefwort = true;
      if (e.art === 'D') assert.equal(daten, 'Hallo Welt');
    }
    assert.ok(!tabellen.includes('sitzungen') && !tabellen.includes('schema_migrationen'));
    assert.ok(tabellen.includes('mappen') && tabellen.includes('dokumente') && tabellen.includes('benutzer'));
    assert.ok(pruefwort, 'das Prüfwort ist in der Sicherung');
  });
});

describe('Notfallblatt (#106)', () => {
  it('liefert ein PDF mit Schlüssel und Fingerabdruck und merkt sich den Download', async () => {
    const { notfallblatt, notfallblattPlan, inGruppen } = await import('../src/notfall/notfallblatt');
    const { routen } = await import('../src/http/routen');
    const { Dienst } = await import('../src/dienst/dienst');
    const { speicherRepo } = await import('../src/repo/speicher');
    const { speicherDateien } = await import('../src/dateien/dateispeicher');
    const { Konten } = await import('../src/konten');
    const { speicherKontoRepo } = await import('../src/konten/konto-repo');
    assert.equal(inGruppen('abcdefghij'), 'abcd efgh ij');
    const { s, tresor } = await aufbau();
    const daten = { name: 'Familie Muster', haushaltId: HAUSHALT, adresse: 'http://nas:8080', version: '0.20.0', erstellt: new Date(), schluessel: tresor.alsText()!, fingerabdruck: tresor.fingerabdruck! };
    const pdf = await notfallblatt(daten);
    assert.equal(pdf.subarray(0, 5).toString('latin1'), '%PDF-');
    const plan = notfallblattPlan(daten);
    assert.equal(plan.schluessel.gruppen.map((g) => g.map((z) => z.zeichen).join('')).join(' '), inGruppen(tresor.alsText()!), 'Schlüssel in Vierergruppen');
    assert.equal(plan.schluessel.fingerabdruck, tresor.fingerabdruck);

    const konten = new Konten(speicherKontoRepo(), null, 'x');
    const { benutzer } = await konten.einrichten({ email: 'admin@example.org', passwort: 'ein-langes-passwort' });
    const route = routen(new Dienst(speicherRepo(), speicherDateien()), konten, { tresor, sicherung: s }).find((r) => r.pfad === '/api/werkbank/notfallblatt')!;
    const vorher = protokoll.letzteNr;
    const a = await route.handler({ body: {}, params: {}, query: {}, ip: '', benutzer });
    assert.equal(a.datei?.mime, 'application/pdf');
    assert.match(a.datei!.name, /^Ablago-Notfallblatt-\d{4}-\d{2}-\d{2}\.pdf$/);
    assert.equal((await s.notfallblatt()).aktuell, true);
    const eintrag = protokoll.eintraege({ seit: vorher }).find((e) => e.text === 'Notfallblatt heruntergeladen');
    assert.ok(eintrag && !JSON.stringify(eintrag).includes(tresor.alsText()!), 'im Protokoll, ohne Schlüssel');
  });
});
