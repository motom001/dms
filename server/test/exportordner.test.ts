/**
 * Export-Ordner (#797): Exporte liegen neben files/, nie im Sicherungsordner; Umzug aus sicherung/export/ beim Start,
 * Löschen nach dem Herunterladen bzw. nach 7 Tagen, Warnung, wenn der Ordner doch im Sicherungsordner liegt.
 */
import assert from 'node:assert/strict';
import { wieImModus } from './hilfen';
import { mkdir, mkdtemp, readdir, readFile, stat, symlink, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { EXPORT_TAGE } from '../../shared/src/auskunft';
import { auskunftOrdner } from '../src/auskunft';
import { speicherDateien } from '../src/dateispeicher';
import { Dienst } from '../src/dienst';
import { speicherEinstellungen } from '../src/einstellungen';
import {
  alterExportOrdner, exportOrdnerVon, exportOrt, herkunft, liegtIn, merkeUmzug, persoenlicherOrdner, raeumeExporteAuf, umzugHinweis, zieheExporteUm,
} from '../src/exportordner';
import { Konten } from '../src/konten';
import { speicherKontoRepo } from '../src/konto-repo';
import { ordnerUnter, pruefeOrdner } from '../src/ordner';
import { speicherRepo } from '../src/repo-speicher';
import { routen, type Anfrage } from '../src/routen';
import { exporteIn } from '../src/vollexport';

const TAG = 24 * 3600 * 1000;
const name = (d: Date) => `dms-export-${d.toISOString().slice(0, 19).replace(/[T:]/g, '-')}`;
const da = (p: string) => stat(p).then(() => true, () => false);

/** Ein Export, wie vollexport() ihn schreibt: Ordner mit manifest.json und einer Datei. */
async function legeExport(ziel: string, erstellt: Date, mitManifest = true) {
  const ordner = join(ziel, name(erstellt));
  await mkdir(join(ordner, 'daten'), { recursive: true });
  await writeFile(join(ordner, 'daten', 'mappen.csv'), 'titel\r\nStromvertrag Lena\r\n');
  if (mitManifest) {
    await writeFile(join(ordner, 'manifest.json'), JSON.stringify({ erstellt: erstellt.toISOString(), dateien: [{ pfad: 'daten/mappen.csv', bytes: 30, sha256: 'x' }], anzahlen: { mappen: 1 }, passwoerter: false }));
    await utimes(join(ordner, 'manifest.json'), erstellt, erstellt);
  }
  return ordner;
}

/** /proc/self/mountinfo eines Containers: zwei Volumes vom selben Gerät (98:1). */
const mountinfo = (sicherung: string, exporte: string) => [
  '500 400 0:61 / / rw,relatime - overlay overlay rw',
  '510 500 98:1 /volume1/docker/dms/files /data/files rw,relatime - btrfs /dev/md2 rw',
  `511 500 98:1 ${sicherung} /data/sicherung rw,relatime - btrfs /dev/md2 rw`,
  ...(exporte ? [`512 500 98:1 ${exporte} /data/export rw,relatime - btrfs /dev/md2 rw`] : []),
].join('\n');

describe('Export-Ordner (#797): Ablageort', () => {
  it('liegt neben files/, nicht im Sicherungsordner – im Container wie ohne Docker', () => {
    assert.equal(exportOrdnerVon(ordnerUnter('/data')), '/data/export');
    assert.equal(alterExportOrdner(ordnerUnter('/data')), '/data/sicherung/export');
    assert.equal(exportOrdnerVon(pruefeOrdner({ NODE_ENV: 'production' }, '/projekt/data').ordner), '/data/export');
    assert.equal(exportOrdnerVon(pruefeOrdner({}, '/projekt/data').ordner), '/projekt/data/export');
    assert.equal(exportOrdnerVon(pruefeOrdner({ DMS_DATENWURZEL: '/ci/daten' }, '/projekt/data').ordner), '/ci/daten/export');
    // Auskünfte und persönliche Exporte darunter
    assert.equal(auskunftOrdner('/data/export'), '/data/export/auskunft');
    assert.equal(persoenlicherOrdner('/data/export', 'b1'), '/data/export/persoenlich/b1');
  });

  it('Herkunft eines Pfads aus den Einhängepunkten', () => {
    const m = mountinfo('/volume1/docker/dms/sicherung', '/volume1/docker/dms/export');
    assert.deepEqual(herkunft('/data/export/auskunft', m), { geraet: '98:1', pfad: '/volume1/docker/dms/export/auskunft' });
    assert.deepEqual(herkunft('/data/sicherung', m), { geraet: '98:1', pfad: '/volume1/docker/dms/sicherung' });
    assert.deepEqual(herkunft('/tmp', m), { geraet: '0:61', pfad: '/tmp' });
  });
});

describe('Export-Ordner (#797): Warnung im Sicherungsordner', () => {
  it('Vorgabe und eigenes Volume außerhalb: keine Warnung', async () => {
    const w = await mkdtemp(join(tmpdir(), 'dms-797-ort-'));
    const o = ordnerUnter(w);
    await mkdir(o.sicherung, { recursive: true });
    await mkdir(exportOrdnerVon(o), { recursive: true });
    assert.equal((await exportOrt(o, null)).imSicherungsordner, false);
    // Volume für /data/export neben dem Sicherungsordner – ähnlicher Name, aber nicht darin.
    assert.equal(await liegtIn('/data/export', '/data/sicherung', mountinfo('/volume1/docker/dms/sicherung', '/volume1/docker/dms/sicherung-export')), false);
    // Ohne eigenes Volume liegt der Ordner im Container (anderes Gerät als die Sicherung).
    assert.equal(await liegtIn('/data/export', '/data/sicherung', mountinfo('/volume1/docker/dms/sicherung', '')), false);
  });

  it('nach realpath: Verknüpfung in den Sicherungsordner', async () => {
    const w = await mkdtemp(join(tmpdir(), 'dms-797-link-'));
    const o = ordnerUnter(w);
    await mkdir(join(o.sicherung, 'export'), { recursive: true });
    await symlink(join(o.sicherung, 'export'), exportOrdnerVon(o));
    assert.equal((await exportOrt(o, null)).imSicherungsordner, true);
    assert.equal(await liegtIn(o.sicherung, o.sicherung, null), true, 'derselbe Ordner zählt');
  });

  it('über die Volumes: /data/export zeigt auf einen Unterordner der Sicherung (oder auf sie selbst)', async () => {
    assert.equal(await liegtIn('/data/export', '/data/sicherung', mountinfo('/volume1/docker/dms/sicherung', '/volume1/docker/dms/sicherung/export')), true);
    assert.equal(await liegtIn('/data/export', '/data/sicherung', mountinfo('/volume1/docker/dms/sicherung', '/volume1/docker/dms/sicherung')), true);
    // Gleicher Pfad auf einem anderen Gerät: nicht derselbe Ort.
    const anders = mountinfo('/volume1/docker/dms/sicherung', '/volume1/docker/dms/sicherung/export').replace('512 500 98:1', '512 500 98:2');
    assert.equal(await liegtIn('/data/export', '/data/sicherung', anders), false);
  });
});

describe('Export-Ordner (#797): Umzug aus sicherung/export/', () => {
  async function alterStand() {
    const w = await mkdtemp(join(tmpdir(), 'dms-797-umzug-'));
    const o = ordnerUnter(w);
    const alt = alterExportOrdner(o);
    const jetzt = new Date();
    const voll = await legeExport(alt, jetzt);
    const pers = await legeExport(join(alt, 'persoenlich', 'jonas'), new Date(jetzt.getTime() - 1000));
    await mkdir(join(alt, 'auskunft'), { recursive: true });
    await writeFile(join(alt, 'auskunft', '00000000-0000-4000-8000-000000000001.zip'), 'zip');
    await writeFile(join(alt, 'auskunft', '00000000-0000-4000-8000-000000000001.json'), '{}');
    // Die Sicherungen selbst bleiben, wo sie sind.
    await writeFile(join(o.sicherung, 'dms-2026-11-04.dms-sicherung'), 'verschlüsselt');
    return { o, alt, neu: exportOrdnerVon(o), voll, pers };
  }

  it('verschiebt alles in den Export-Ordner, zählt die Exporte und entfernt den alten Ordner', async () => {
    const { o, alt, neu, voll, pers } = await alterStand();
    const u = await zieheExporteUm(alt, neu, { mountinfo: null });
    assert.deepEqual(u, { anzahl: 3, uebrig: false });
    assert.equal(await da(alt), false, 'sicherung/export/ ist weg');
    assert.deepEqual(await readdir(o.sicherung), ['dms-2026-11-04.dms-sicherung']);
    assert.match(await readFile(join(neu, voll.split('/').pop()!, 'daten', 'mappen.csv'), 'utf8'), /Stromvertrag Lena/);
    assert.ok(await da(join(neu, 'persoenlich', 'jonas', pers.split('/').pop()!, 'manifest.json')));
    assert.deepEqual((await readdir(join(neu, 'auskunft'))).sort(), ['00000000-0000-4000-8000-000000000001.json', '00000000-0000-4000-8000-000000000001.zip']);
    // Mehrfach ausführbar: beim nächsten Start ist nichts mehr zu tun.
    assert.deepEqual(await zieheExporteUm(alt, neu, { mountinfo: null }), { anzahl: 0, uebrig: false });
  });

  it('Schonfrist: ein alter Vollexport verschwindet nicht gleich nach dem Update, die 7 Tage laufen ab dem Umzug', async () => {
    const w = await mkdtemp(join(tmpdir(), 'dms-797-schon-'));
    const o = ordnerUnter(w);
    const jetzt = new Date();
    const alt = await legeExport(alterExportOrdner(o), new Date(jetzt.getTime() - 30 * TAG));
    const pers = await legeExport(join(alterExportOrdner(o), 'persoenlich', 'herr-oezdemir'), new Date(jetzt.getTime() - 20 * TAG));
    // Ohne Umzug wäre er abgelaufen.
    assert.equal((await exporteIn(alterExportOrdner(o), jetzt)).length, 0);
    const alt2 = await legeExport(alterExportOrdner(o), new Date(jetzt.getTime() - 30 * TAG));
    assert.equal(alt2, alt);
    await zieheExporteUm(alterExportOrdner(o), exportOrdnerVon(o), { mountinfo: null, jetzt });
    const [e] = await exporteIn(exportOrdnerVon(o), jetzt);
    assert.ok(e, 'noch da');
    assert.equal(e.erstellt, new Date(jetzt.getTime() - 30 * TAG).toISOString(), 'Erstellt bleibt, wie es war');
    assert.ok(Math.abs(new Date(e.bis).getTime() - (jetzt.getTime() + EXPORT_TAGE * TAG)) < 2000, 'bereit bis: 7 Tage ab dem Umzug');
    assert.equal((await exporteIn(persoenlicherOrdner(exportOrdnerVon(o), 'herr-oezdemir'), jetzt)).length, 1, pers);
    await raeumeExporteAuf(exportOrdnerVon(o), new Date(jetzt.getTime() + (EXPORT_TAGE + 1) * TAG));
    assert.deepEqual(await exporteIn(exportOrdnerVon(o)), []);
  });

  it('anderes Dateisystem (EXDEV): kopieren, dann löschen', async () => {
    const { alt, neu, voll } = await alterStand();
    let versuche = 0;
    const umbenennen = async () => { versuche++; throw Object.assign(new Error('cross-device link not permitted'), { code: 'EXDEV' }); };
    const u = await zieheExporteUm(alt, neu, { umbenennen, mountinfo: null });
    assert.deepEqual(u, { anzahl: 3, uebrig: false });
    assert.ok(versuche > 0);
    assert.equal(await da(alt), false);
    assert.match(await readFile(join(neu, voll.split('/').pop()!, 'daten', 'mappen.csv'), 'utf8'), /Stromvertrag Lena/);
    assert.ok(!(await readdir(neu)).some((n) => n.endsWith('.umzug')), 'keine Zwischenkopie übrig');
  });

  it('gleichnamig am Ziel: bleibt am alten Ort liegen, „übrig“ für den Hinweis', async () => {
    const { alt, neu } = await alterStand();
    await mkdir(join(neu, 'auskunft'), { recursive: true });
    await writeFile(join(neu, 'auskunft', '00000000-0000-4000-8000-000000000001.zip'), 'neuer');
    const u = await zieheExporteUm(alt, neu, { mountinfo: null });
    assert.deepEqual(u, { anzahl: 2, uebrig: true }, 'gezählt nur, was umzog');
    assert.equal(await readFile(join(neu, 'auskunft', '00000000-0000-4000-8000-000000000001.zip'), 'utf8'), 'neuer');
    assert.deepEqual(await readdir(alt), ['auskunft']);
    assert.deepEqual(await readdir(join(alt, 'auskunft')), ['00000000-0000-4000-8000-000000000001.zip']);
  });

  it('Export-Ordner ist der alte Ordner (Volume in die Sicherung): nichts verschieben', async () => {
    const w = await mkdtemp(join(tmpdir(), 'dms-797-gleich-'));
    const o = ordnerUnter(w);
    const voll = await legeExport(alterExportOrdner(o), new Date());
    await symlink(alterExportOrdner(o), exportOrdnerVon(o));
    assert.deepEqual(await zieheExporteUm(alterExportOrdner(o), exportOrdnerVon(o), { mountinfo: null }), { anzahl: 0, uebrig: false });
    assert.ok(await da(voll));
  });

  it('Hinweis für die Werkbank: gemerkt, bis er gelesen ist', async () => {
    const e = speicherEinstellungen();
    await merkeUmzug(e, { anzahl: 0, uebrig: false });
    assert.equal(await umzugHinweis(e), null, 'ohne Umzug kein Hinweis');
    await merkeUmzug(e, { anzahl: 2, uebrig: false }, new Date('2026-11-04T08:00:00Z'));
    assert.deepEqual(await umzugHinweis(e), { am: '2026-11-04T08:00:00.000Z', anzahl: 2, uebrig: false });
  });
});

describe('Export-Ordner (#797): Löschfrist', () => {
  it('Vollexporte und persönliche Exporte nach 7 Tagen weg, wie die Auskünfte', async () => {
    const wurzel = await mkdtemp(join(tmpdir(), 'dms-797-frist-'));
    const jetzt = new Date();
    const frisch = await legeExport(wurzel, new Date(jetzt.getTime() - 2 * TAG));
    const alt = await legeExport(wurzel, new Date(jetzt.getTime() - (EXPORT_TAGE + 1) * TAG));
    // Noch ohne Manifest (läuft gerade): gilt die Zeit im Namen, nicht das Alter des Ordners.
    const laeuft = await legeExport(wurzel, new Date(jetzt.getTime() - 60_000), false);
    await utimes(laeuft, new Date(0), new Date(0));
    const unvollstaendig = await legeExport(wurzel, new Date(jetzt.getTime() - (EXPORT_TAGE + 2) * TAG), false);
    const persAlt = await legeExport(persoenlicherOrdner(wurzel, 'petra'), new Date(jetzt.getTime() - (EXPORT_TAGE + 1) * TAG));
    const persFrisch = await legeExport(persoenlicherOrdner(wurzel, 'markus'), new Date(jetzt.getTime() - TAG));
    await mkdir(auskunftOrdner(wurzel), { recursive: true });
    const aid = '00000000-0000-4000-8000-0000000000a1';
    await writeFile(join(auskunftOrdner(wurzel), `${aid}.zip`), 'zip');
    await writeFile(join(auskunftOrdner(wurzel), `${aid}.json`), JSON.stringify({ id: aid, erstellt: new Date(jetzt.getTime() - 8 * TAG).toISOString(), bis: new Date(jetzt.getTime() - TAG).toISOString() }));

    const liste = await exporteIn(wurzel, jetzt);
    assert.deepEqual(liste.map((e) => e.name).sort(), [frisch, laeuft].map((p) => p.split('/').pop()).sort());
    const f = liste.find((e) => frisch.endsWith(e.name))!;
    assert.equal(new Date(f.bis).getTime() - new Date(f.erstellt!).getTime(), EXPORT_TAGE * TAG, 'bereit bis: erstellt + 7 Tage');
    assert.equal(await da(alt), false);
    assert.equal(await da(unvollstaendig), false);

    await raeumeExporteAuf(wurzel, jetzt);
    assert.equal(await da(persAlt), false);
    assert.equal(await da(persoenlicherOrdner(wurzel, 'petra')), false, 'leerer Benutzerordner weg');
    assert.ok(await da(persFrisch));
    assert.deepEqual(await readdir(auskunftOrdner(wurzel)), [], 'abgelaufene Auskunft weg');
    // Eine Woche später ist alles weg.
    await raeumeExporteAuf(wurzel, new Date(jetzt.getTime() + EXPORT_TAGE * TAG));
    assert.deepEqual((await readdir(wurzel)).sort(), ['auskunft', 'persoenlich']);
    assert.deepEqual(await readdir(join(wurzel, 'persoenlich')), []);
  });
});

describe('Export-Ordner (#797): Werkbank und Herunterladen', () => {
  async function aufbau(imSicherungsordner = false) {
    const einstellungen = speicherEinstellungen();
    const d = new Dienst(speicherRepo(), speicherDateien(), { einstellungen });
    const konten = new Konten(speicherKontoRepo(), null, 'http://nas', d.systemtypen.benutzerspiegel());
    const { benutzer: katrin } = await konten.einrichten({ email: 'katrin@example.org', name: 'Katrin', passwort: 'ein-langes-passwort' });
    const jonas = (await konten.legeBenutzerAn({ email: 'jonas@example.org', name: 'Jonas' }, katrin.id)).benutzer;
    await d.postSystemmappen.gleicheBenutzerAb(await konten.listeBenutzer());
    const pfad = join(await mkdtemp(join(tmpdir(), 'dms-797-routen-')), 'export');
    const tabelle = routen(d, konten, { exporte: { pfad, imSicherungsordner, volume: false } });
    const route = (m: string, p: string) => tabelle.find((x) => x.methode === m && x.pfad === p)!;
    const ich = async (id: string) => (await konten.listeBenutzer()).find((b) => b.id === id)!;
    const rufe = async (b: { id: string }, m: string, p: string, x: Partial<Anfrage> = {}) => route(m, p).handler({ body: {}, params: {}, query: {}, ip: '1', ...x, benutzer: wieImModus(await ich(b.id)) } as Anfrage);
    return { einstellungen, katrin, jonas, pfad, rufe };
  }
  const leer = async (inhalt: unknown) => { for await (const _ of inhalt as AsyncIterable<Buffer>) { /* lesen */ } await new Promise((r) => setTimeout(r, 20)); };

  it('Vollexport: Frist, Ort, Umzug-Hinweis und Löschen nach dem Herunterladen', async () => {
    const { einstellungen, katrin, pfad, rufe } = await aufbau();
    const ordner = await legeExport(pfad, new Date());
    await merkeUmzug(einstellungen, { anzahl: 1, uebrig: false });
    const s = (await rufe(katrin, 'GET', '/api/werkbank/export')).body as { ordner: string; tage: number; imSicherungsordner: boolean; volume: boolean | null; umzug: { anzahl: number } | null; exporte: Array<{ name: string; bis: string }> };
    assert.equal(s.ordner, pfad);
    assert.equal(s.tage, 7);
    assert.equal(s.imSicherungsordner, false);
    assert.equal(s.volume, false);
    assert.equal(s.umzug?.anzahl, 1);
    assert.equal(s.exporte.length, 1);
    await rufe(katrin, 'POST', '/api/werkbank/export/umzug-gesehen');
    assert.equal(((await rufe(katrin, 'GET', '/api/werkbank/export')).body as { umzug: unknown }).umzug, null);

    const dl = await rufe(katrin, 'GET', '/api/werkbank/export/:name/zip', { params: { name: s.exporte[0].name } });
    assert.ok(await da(ordner), 'erst nach dem vollständigen Lesen gelöscht');
    await leer(dl.datei!.inhalt);
    // Gelöscht wird nach dem Ende des Stroms – unter Last kann das ein paar Millisekunden dauern.
    for (let i = 0; i < 100 && (await da(ordner)); i++) await new Promise((r) => setTimeout(r, 20));
    assert.equal(await da(ordner), false);
  });

  it('Meine Daten exportieren: nach dem Herunterladen gelöscht, „bereit bis“ für die Anzeige', async () => {
    const { jonas, pfad, rufe } = await aufbau();
    const ordner = await legeExport(persoenlicherOrdner(pfad, jonas.id), new Date());
    const s = (await rufe(jonas, 'GET', '/api/konto/export')).body as { fertig: { bis: string } | null };
    assert.ok(s.fertig && new Date(s.fertig.bis).getTime() > Date.now() + 6 * TAG);
    await leer((await rufe(jonas, 'GET', '/api/konto/export/zip')).datei!.inhalt);
    // Gelöscht wird nach dem Ende des Stroms – unter Last kann das ein paar Millisekunden dauern (wie oben).
    for (let i = 0; i < 100 && (await da(ordner)); i++) await new Promise((r) => setTimeout(r, 20));
    assert.equal(await da(ordner), false);
    assert.equal(((await rufe(jonas, 'GET', '/api/konto/export')).body as { fertig: unknown }).fertig, null);
  });

  it('Werkbank-Übersicht warnt, wenn der Export-Ordner im Sicherungsordner liegt', async () => {
    const { katrin, rufe } = await aufbau(true);
    const u = (await rufe(katrin, 'GET', '/api/werkbank/uebersicht')).body as { exporte: { imSicherungsordner: boolean } | null };
    assert.equal(u.exporte?.imSicherungsordner, true);
    assert.equal(((await rufe(katrin, 'GET', '/api/werkbank/export')).body as { imSicherungsordner: boolean }).imSicherungsordner, true);
  });
});
