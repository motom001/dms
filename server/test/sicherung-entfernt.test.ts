/**
 * Entfernte Sicherungen (#976): Nach dem lokalen Löschen bleibt eine außer Haus angekommene Sicherung in der Liste;
 * ein Paket mit dms:sicherung-holen listet sein Ziel und liefert eine Sicherung in Stücken zurück. Ablago nimmt nur,
 * was es angefordert hat, lückenlos und nie über die Größe hinaus, und prüft Größe und SHA-256 gegen den eigenen Stand.
 */
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readdirSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import type { Datenquelle } from '../src/sicherung/datenbankabzug';
import { speicherEinstellungen } from '../src/einstellungen/einstellungen';
import { Sicherung, type Lauf, type SchlankeMetadaten } from '../src/sicherung/sicherung';
import { liesZielListe, schlankGueltig } from '../src/sicherung/sicherung-entfernt';
import { Tresor } from '../src/geheimnisse/tresor';
import { heikleHandlung } from '../src/werkbank/verwaltungsbereiche';
import { liesCode } from '../../shared/src/pakete';

const HAUSHALT = '00000000-0000-4000-8000-000000000001';
const ordner: string[] = [];
after(async () => { for (const o of ordner) await rm(o, { recursive: true, force: true }); });

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

/** Ziel außer Haus im Speicher: Dateien wie auf einem WebDAV-Ordner, dazu die Aufträge eines Pakets. */
type Ziel = { dateien: Map<string, Buffer>; meta: Map<string, unknown>; holen: boolean; verfaelschen?: boolean; stueck?: number };

async function aufbau(ziel: Ziel) {
  const wurzel = await mkdtemp(join(tmpdir(), 'dms-entfernt-'));
  ordner.push(wurzel);
  const einstellungen = speicherEinstellungen();
  const tresor = new Tresor(einstellungen, join(wurzel, 'geheim', 'dms.schluessel'), () => null);
  await tresor.laden();
  await tresor.erzeuge();
  await mkdir(join(wurzel, 'files', HAUSHALT, 'ab'), { recursive: true });
  await writeFile(join(wurzel, 'files', HAUSHALT, 'ab', 'gross'), randomBytes(200_000));
  const s = new Sicherung(join(wurzel, 'sicherung'), join(wurzel, 'files'), HAUSHALT, {
    tresor, einstellungen, daten: daten(), mountinfo: '/gibt-es-nicht',
    umgebung: async () => ({ dms: '0.250.0', node: '24', system: 'Linux', architektur: 'x64' }),
  });
  const aufrufe: Array<Record<string, unknown>> = [];
  s.extern = {
    pakete: async () => [{ id: 'webdav', name: 'Sicherungsziel WebDAV', adresse: 'https://cloud.example.org', holen: ziel.holen }],
    melde: async () => {},
    holen: async (paket, e) => {
      aufrufe.push(e);
      if (e.auftrag === 'auflisten') {
        return JSON.stringify({ ziel: 'WebDAV https://lena:geheim@cloud.example.org/Ablago', sicherungen: [...ziel.dateien].map(([name, b]) => ({ name, groesse: b.length, meta: ziel.meta.get(name) })) });
      }
      // Holen: Stücke an Ablago, wie ein Paket per PUT /sicherungen/{name}/holen.
      const datei = ziel.dateien.get(String(e.name))!;
      const quelle = ziel.verfaelschen ? Buffer.from(datei.map((x) => x ^ 1)) : datei;
      let versatz = Number(e.versatz);
      for (let i = 0; i < 2 && versatz < datei.length; i++) {
        const r = await s.entfernt.nimmStueck(paket, String(e.name), String(versatz), quelle.subarray(versatz, versatz + (ziel.stueck ?? 64_000)));
        versatz = r.versatz;
      }
      return JSON.stringify({ versatz });
    },
  };
  const meta = (await (await s.starte('manuell', 'markus@example.org')).fertig)!;
  const name = meta.datei.replace(/\.dms-sicherung$/, '');
  await s.externRueckmeldung('webdav', name, { status: 'geprueft', pruefung: 'pruefsumme', ziel: 'WebDAV https://cloud.example.org/Ablago' });
  // Was das Paket aufs Ziel gelegt hat: die Datei und die schlanken Metadaten.
  ziel.dateien.set(name, await readFile(join(s.ordner, meta.datei)));
  ziel.meta.set(name, JSON.parse(JSON.stringify(await s.externMeta('webdav', name))));
  return { s, name, aufrufe, meta };
}

async function warte(l: Lauf, s: Sicherung) {
  for (let i = 0; i < 400 && s.aktuellerLauf()?.status === 'laeuft'; i++) await new Promise((r) => setTimeout(r, 10));
  return { ...s.aktuellerLauf()!, gestartet: l.gestartet };
}

describe('Entfernte Sicherungen (#976)', () => {
  it('lokal gelöscht, außer Haus angekommen: bleibt in der Liste; älteres Paket zeigt nur, wo sie liegt', async () => {
    const ziel: Ziel = { dateien: new Map(), meta: new Map(), holen: false };
    const { s, name } = await aufbau(ziel);
    assert.deepEqual((await s.entfernt.stand([name]))?.nur, [], 'lokal: keine entfernte Zeile');
    await s.loesche(name, 'markus@example.org');
    const st = (await s.entfernt.stand([]))!;
    assert.equal(st.nur.length, 1);
    const e = st.nur[0];
    assert.equal(e.name, name);
    assert.equal(e.datei, `${name}.dms-sicherung`);
    assert.equal(e.holbar, false);
    assert.equal(e.grund, 'kann-nicht');
    assert.equal(e.ziel, 'WebDAV https://cloud.example.org/Ablago');
    assert.match(e.sha256 ?? '', /^[0-9a-f]{64}$/);
    await assert.rejects(s.entfernt.hole(name, 'webdav', 'markus@example.org'), /kann Sicherungen nicht zurückholen/);
  });

  it('„Letzte Kopie außer Haus“ (#1327): Kopie erfolgreich, lokale Sicherung weggeräumt – die Anzeige zeigt die Kopie mit Datum und Ziel', async () => {
    const ziel: Ziel = { dateien: new Map(), meta: new Map(), holen: false };
    const { s, name, meta } = await aufbau(ziel);
    assert.equal((await s.externZustand())?.letzte?.name, name);
    await s.loesche(name, 'markus@example.org');
    const x = (await s.zustand()).extern!;
    assert.equal(x.letzte?.name, name, 'nicht „keine“');
    assert.equal(x.letzte?.paket, 'webdav');
    assert.equal(x.letzte?.beginn, meta.beginn);
    assert.equal(x.letzte?.stand.status, 'geprueft');
    assert.equal(x.letzte?.stand.ziel, 'WebDAV https://cloud.example.org/Ablago');
    assert.equal((x.letzte as { entfernt?: boolean }).entfernt, true);
    // Damit bleibt auch „lokal nur die neueste“ wählbar (#1194).
    assert.equal((await s.zustand()).nurNeueste.moeglich, true);
  });

  it('zurückholen: in Stücken, Größe und Prüfsumme geprüft, danach lokal mit .json und „unverändert“', async () => {
    const ziel: Ziel = { dateien: new Map(), meta: new Map(), holen: true };
    const { s, name, aufrufe, meta } = await aufbau(ziel);
    await s.loesche(name, 'markus@example.org');
    const st = (await s.entfernt.stand([]))!;
    assert.equal(st.nur[0].holbar, true);
    assert.equal(st.nur[0].ziel, 'WebDAV https://cloud.example.org/Ablago', 'ohne Zugangsdaten');
    const l = await warte(await s.entfernt.hole(name, 'webdav', 'markus@example.org'), s);
    assert.equal(l.status, 'fertig', String(l.fehler));
    assert.equal(l.art, 'holen');
    assert.ok(aufrufe.filter((a) => a.auftrag === 'holen').length >= 2, 'mehrere Aufrufe mit Fortsetzung');
    assert.deepEqual(await readFile(join(s.ordner, `${name}.dms-sicherung`)), ziel.dateien.get(name), 'unverändert');
    const j = JSON.parse(await readFile(join(s.ordner, `${name}.json`), 'utf8')) as SchlankeMetadaten;
    assert.equal(j.schlank, true);
    assert.equal(j.sha256, meta.sha256);
    const eintrag = (await s.liste()).find((x) => x.name === name)!;
    assert.equal(eintrag.pruefung?.ok, true);
    assert.equal(eintrag.schlank?.sha256, meta.sha256);
    assert.deepEqual((await s.entfernt.stand([name]))!.nur, [], 'wieder lokal');
    assert.deepEqual((await readdir(s.ordner)).filter((n) => n.startsWith('.')), [], 'keine Teildatei');
  });

  it('verfälschte Lieferung: verworfen, nichts lokal', async () => {
    const ziel: Ziel = { dateien: new Map(), meta: new Map(), holen: true, verfaelschen: true };
    const { s, name } = await aufbau(ziel);
    await s.loesche(name, 'markus@example.org');
    const l = await warte(await s.entfernt.hole(name, 'webdav', 'markus@example.org'), s);
    assert.equal(l.status, 'fehler');
    assert.match(l.fehler ?? '', /Prüfsumme/);
    assert.deepEqual((await readdir(s.ordner)).filter((n) => n.startsWith(name) || n.startsWith('.')), []);
  });

  it('erst aufräumen, dann melden (#1373): beim Wechsel auf „fehler“ oder „fertig“ liegt keine .holen-Datei mehr', async () => {
    for (const verfaelschen of [true, false]) {
      const ziel: Ziel = { dateien: new Map(), meta: new Map(), holen: true, verfaelschen };
      const { s, name } = await aufbau(ziel);
      await s.loesche(name, 'markus@example.org');
      // Im Augenblick des Zustandswechsels nachsehen – synchron, ohne dass ein anderer Schritt dazwischen läuft.
      const gesehen: Array<{ status: string; liegt: string[] }> = [];
      const belege = s.belege.bind(s);
      s.belege = (art, titel) => {
        const lauf = belege(art, titel);
        let status = lauf.status;
        Object.defineProperty(lauf, 'status', {
          enumerable: true,
          get: () => status,
          set: (w: Lauf['status']) => {
            gesehen.push({ status: w, liegt: readdirSync(s.ordner).filter((n) => n.startsWith('.holen-')) });
            status = w;
          },
        });
        return lauf;
      };
      const l = await warte(await s.entfernt.hole(name, 'webdav', 'markus@example.org'), s);
      assert.equal(l.status, verfaelschen ? 'fehler' : 'fertig', String(l.fehler));
      assert.deepEqual(gesehen, [{ status: l.status, liegt: [] }], 'ein Wechsel, danach nichts Vorläufiges mehr');
    }
  });

  it('Vorbereiten scheitert (#1375): Lauf endet mit „fehler“ und Grund, nichts Vorläufiges bleibt, neue Abholung startet sofort', async () => {
    // Schreiben scheitern lassen, auch als root: ein Ordner dort, wo die Teildatei bzw. der Stand hin soll.
    for (const hindernis of ['teil', 'json']) {
      const ziel: Ziel = { dateien: new Map(), meta: new Map(), holen: true };
      const { s, name } = await aufbau(ziel);
      await s.loesche(name, 'markus@example.org');
      const weg = join(s.ordner, `.holen-${name}.${hindernis}`);
      await mkdir(weg);
      const l = await s.entfernt.hole(name, 'webdav', 'markus@example.org');
      assert.equal(l.status, 'fehler', hindernis);
      assert.match(l.fehler ?? '', /vorläufigen Dateien im Sicherungsordner nicht anlegen \(EISDIR\)/);
      assert.ok(l.beendet);
      assert.equal(s.laeuft(), false, 'blockiert nichts');
      const liegt = (await readdir(s.ordner)).filter((n) => n.startsWith('.holen-'));
      assert.deepEqual(liegt, [`.holen-${name}.${hindernis}`], 'nur das Hindernis des Tests, keine vorläufige Datei');
      await rm(weg, { recursive: true });
      const zweite = await warte(await s.entfernt.hole(name, 'webdav', 'markus@example.org'), s);
      assert.equal(zweite.status, 'fertig', String(zweite.fehler));
      assert.deepEqual(await readFile(join(s.ordner, `${name}.dms-sicherung`)), ziel.dateien.get(name));
      assert.deepEqual((await readdir(s.ordner)).filter((n) => n.startsWith('.')), [], 'keine Teildatei');
    }
  });

  it('Ziel meldet andere Prüfsumme als Ablago gemerkt hat: nicht holbar', async () => {
    const ziel: Ziel = { dateien: new Map(), meta: new Map(), holen: true };
    const { s, name } = await aufbau(ziel);
    await s.loesche(name, 'markus@example.org');
    ziel.meta.set(name, { ...(ziel.meta.get(name) as object), sha256: 'a'.repeat(64) });
    const e = (await s.entfernt.stand([], true))!.nur[0];
    assert.equal(e.holbar, false);
    assert.equal(e.grund, 'abweichend');
  });

  it('nur mit Liste des Ziels (neu aufgesetzt, nichts gemerkt): holbar mit den Metadaten vom Ziel', async () => {
    const ziel: Ziel = { dateien: new Map(), meta: new Map(), holen: true };
    const { s, name } = await aufbau(ziel);
    await rm(join(s.ordner, `${name}.dms-sicherung`));
    await rm(join(s.ordner, `${name}.json`));
    const st = (await s.entfernt.stand([], true))!;
    assert.equal(st.nur[0].holbar, true);
    assert.deepEqual((await s.entfernt.stand([name], true))!.auchAmZiel, { [name]: ['webdav'] }, 'lokal und am Ziel');
  });

  it('Stücke: nur angefordert, nur dieses Paket, lückenlos, nie über die Größe', async () => {
    const ziel: Ziel = { dateien: new Map(), meta: new Map(), holen: true };
    const { s, name } = await aufbau(ziel);
    await assert.rejects(s.entfernt.nimmStueck('webdav', name, '0', Buffer.from('x')), /nicht angefordert/);
    await s.loesche(name, 'markus@example.org');
    // Holen anstoßen, aber das Paket liefert nichts: Ablago wartet auf Stücke.
    s.extern!.holen = async (p, e) => (e.auftrag === 'auflisten' ? JSON.stringify({ sicherungen: [{ name, groesse: ziel.dateien.get(name)!.length, meta: ziel.meta.get(name) }] }) : new Promise<string>((r) => setTimeout(() => r('{}'), 200)));
    const l = await s.entfernt.hole(name, 'webdav', 'markus@example.org');
    await assert.rejects(s.entfernt.nimmStueck('anderes', name, '0', Buffer.from('x')), /nicht angefordert/);
    await assert.rejects(s.entfernt.nimmStueck('webdav', '../geheim', '0', Buffer.from('x')), /Name/);
    await assert.rejects(s.entfernt.nimmStueck('webdav', name, '5', Buffer.from('x')), (e: Error & { status?: number }) => /ab Byte 0/.test(e.message));
    await assert.rejects(s.entfernt.nimmStueck('webdav', name, '0', Buffer.alloc(ziel.dateien.get(name)!.length + 1)), /über die Größe/);
    await warte(l, s);
  });

  it('Liste des Ziels streng gelesen; heikle Handlung; Recht nur mit dms:sicherung-lesen', () => {
    const r = liesZielListe(JSON.stringify({ ziel: 'x', sicherungen: [{ name: '../a', groesse: 1 }, { name: '.b', groesse: 1 }, { name: 'c', groesse: -1 }, { name: 'd', groesse: 5, meta: { schlank: true } }] }));
    assert.deepEqual(r.eintraege, [{ name: 'd', groesse: 5, meta: null }]);
    assert.throws(() => liesZielListe('kein json'), /keine gültige Liste/);
    assert.equal(schlankGueltig({ schlank: true, format: 1, datei: 'n.dms-sicherung', groesse: 3, sha256: 'a'.repeat(64), beginn: '2026-11-02T02:00:00.000Z', verschluesselung: { verfahren: 'AES', fingerabdruck: 'ab' } }, 'n', 4), null, 'Größe passt nicht');
    assert.equal(heikleHandlung('POST', '/api/werkbank/sicherung/:name/holen', {}), 'sicherung');
    assert.match(liesCode({ sprache: 'c', rechte: { schnittstellen: ['dms:sicherung-holen'] } }).fehler.join(' '), /nur zusammen mit dms:sicherung-lesen/);
    assert.deepEqual(liesCode({ sprache: 'c', ereignisse: ['sicherung.fertig'], rechte: { schnittstellen: ['dms:sicherung-lesen', 'dms:sicherung-holen'] } }).fehler, []);
  });
});
