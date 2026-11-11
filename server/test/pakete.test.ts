/** Paketverwaltung (#188): Katalog, Vorschau, Installieren, Aktualisieren, Entfernen. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { CODE_MAX, PAKET_MAX, legtEtwasAn, auswahlMitAbhaengigkeiten, nachAbhaengigkeiten, passt, vergleicheVersion, type Katalog } from '../../shared/src/pakete';
import { speicherDateien } from '../src/dateispeicher';
import { Dienst } from '../src/dienst';
import { speicherEinstellungen } from '../src/einstellungen';
import { Fachfehler } from '../src/fehler';
import { ARCHIV_MAX, holeDaten, liesPaket, liesZip, Paketverwaltung, SAMMEL_MAX, type Sammeldatei } from '../src/pakete';
import type { Repo } from '../src/repo';
import { speicherRepo } from '../src/repo-speicher';
import { zipPuffer } from '../src/zip';
import { basisMitAblageort, frueherAblageort } from './hilfen';
import { eigeneDatenbank } from './hilfe-db';

const ICH = { id: '00000000-0000-4000-8000-0000000000aa', email: 'admin@example.org' };
const BASIS = fileURLToPath(new URL('./pakete/basis', import.meta.url));
const KATALOG = 'https://katalog.test/katalog.json';

const offen: Array<{ end(): Promise<void> }> = [];
async function repo(pg: boolean): Promise<Repo> {
  if (!pg) return speicherRepo();
  const { migriere } = await import('../src/db');
  const { pgRepo } = await import('../src/repo-pg');
  // Eigene Datenbank (#900), nach dem letzten Test der Datei gelöscht.
  const sql = (await eigeneDatenbank('pk', { migrieren: false })).sql;
  offen.push(sql);
  await migriere(sql, new URL('../migrations', import.meta.url).pathname, () => {});
  await sql`INSERT INTO benutzer (id, haushalt_id, email, name, rolle) VALUES (${ICH.id}, '00000000-0000-4000-8000-000000000001', ${ICH.email}, 'Admin', 'admin')`.catch(async () => {
    await sql`INSERT INTO haushalte (id, name) VALUES ('00000000-0000-4000-8000-000000000001', 'Test') ON CONFLICT DO NOTHING`;
    await sql`INSERT INTO benutzer (id, haushalt_id, email, name, rolle) VALUES (${ICH.id}, '00000000-0000-4000-8000-000000000001', ${ICH.email}, 'Admin', 'admin')`;
  });
  return pgRepo(sql, '00000000-0000-4000-8000-000000000001') as never;
}

/** Dateien eines Ordners (rekursiv) als Name → Inhalt. */
function ordner(pfad: string, vor = ''): Record<string, string> {
  const erg: Record<string, string> = {};
  for (const n of readdirSync(pfad)) {
    const p = join(pfad, n);
    if (statSync(p).isDirectory()) Object.assign(erg, ordner(p, `${vor}${n}/`));
    else erg[`${vor}${n}`] = readFileSync(p, 'utf8');
  }
  return erg;
}
// Feste Zeit in den ZIP-Köpfen (#900): sonst unterscheidet sich die Prüfsumme zweier Bauten desselben Archivs
// gelegentlich (Uhrzeit im 2-Sekunden-Raster).
const archiv = (d: Record<string, string>) => zipPuffer(Object.entries(d).map(([name, inhalt]) => ({ name, daten: Buffer.from(inhalt) })), new Date('2026-01-01T12:00:00Z'));
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');

/** Sammeldatei (#461) wie von der Katalog-Webseite: Verzeichnis und Paket-Archive; aendern: Dateien danach verändern. */
function sammeldatei(pakete: Array<Record<string, string>>, aendern: (d: Map<string, Buffer>, vz: Record<string, unknown>) => void = () => {}) {
  const d = new Map<string, Buffer>();
  const eintraege = pakete.map((p) => {
    const id = /^id: (\S+)$/m.exec(p['manifest.yaml'])![1], version = /^version: (\S+)$/m.exec(p['manifest.yaml'])![1];
    const b = archiv(p);
    d.set(`pakete/${id}-${version}.zip`, b);
    return { id, version, name: id, archiv: `pakete/${id}-${version}.zip`, sha256: sha(b), groesse: b.length, gewaehlt: true };
  });
  const vz: Record<string, unknown> = { format: 1, art: 'dms-sammeldatei', erstellt: '2026-11-01T12:00:00Z', quelle: 'https://github.com/motom001/dms-registry', katalog: KATALOG, dms: '0.107.1', pakete: eintraege };
  aendern(d, vz);
  d.set('sammeldatei.json', Buffer.from(JSON.stringify(vz)));
  return zipPuffer([...d].map(([name, daten]) => ({ name, daten })));
}
const gruende = (re: RegExp) => (e: unknown) => e instanceof Fachfehler && ((e.details as { gruende?: string[] })?.gruende ?? [e.message]).some((g) => re.test(g));

/** Kleiner Katalog im Arbeitsspeicher: Archive je Paket und Version. */
function katalog(eintraege: Array<{ dateien: Record<string, string>; falscheSumme?: boolean; groesse?: number }>, url = KATALOG, daten = new Map<string, Buffer>()) {
  const basisUrl = url.slice(0, url.lastIndexOf('/') + 1);
  const pakete = new Map<string, Katalog['pakete'][number]>();
  for (const e of eintraege) {
    const m = /^id: (\S+)$/m.exec(e.dateien['manifest.yaml'])![1];
    const version = /^version: (\S+)$/m.exec(e.dateien['manifest.yaml'])![1];
    const dms = /^dms: "?([^"\n]+)"?$/m.exec(e.dateien['manifest.yaml'])![1];
    const b = archiv(e.dateien);
    daten.set(`${basisUrl}archive/${m}-${version}.zip`, b);
    const p = pakete.get(m) ?? { id: m, name: m, beschreibung: '', autor: { name: 'Test', github: 'test' }, lizenz: 'MIT', aktuell: version, versionen: [] };
    const abh: Record<string, string> = {};
    for (const z of /abhaengigkeiten:\n((?:  \S+: .+\n)*)/.exec(e.dateien['manifest.yaml'])?.[1]?.split('\n').filter(Boolean) ?? []) { const [k, v] = z.trim().split(': '); abh[k] = v.replace(/"/g, ''); }
    p.versionen.unshift({ version, dms, abhaengigkeiten: abh, inhalt: { mappentypen: [], sichten: [], beispiele: 0 }, code: false, archiv: `archive/${m}-${version}.zip`, sha256: e.falscheSumme ? '0'.repeat(64) : sha(b), groesse: e.groesse ?? b.length, veroeffentlicht: '2026-11-01T00:00:00Z', quelle: '', readme: '', changelog: '' });
    if (vergleicheVersion(version, p.aktuell) > 0) p.aktuell = version;
    pakete.set(m, p);
  }
  daten.set(url, Buffer.from(JSON.stringify({ format: 1, erstellt: '', quelle: '', pakete: [...pakete.values()] })));
  return async (url: string) => { const b = daten.get(url); if (!b) throw new Error(`404 ${url}`); return b; };
}

const basis = ordner(BASIS);
/** Basis 1.1.0: neues Feld, neues Register, neue Sicht. */
const basis11 = {
  ...basis,
  'manifest.yaml': basis['manifest.yaml'].replace('version: 1.0.0', 'version: 1.1.0'),
  'inhalt/mappentypen.yaml': basis['inhalt/mappentypen.yaml']
    .replace('    - key: beschreibung\n', '    - key: steuernummer\n      label: Steuernummer\n      typ: text\n    - key: beschreibung\n')
    // Erkennung (#336): Kundennummer und Name werden für die Erkennung markiert.
    .replace('      label: Kundennummer\n      typ: text\n', '      label: Kundennummer\n      typ: text\n      erkennung: { art: nummer, hinweis: oben rechts }\n')
    .replace('      label: Name\n      typ: text\n', '      label: Name\n      typ: text\n      erkennung: {}\n')
    // Feldformate (#535): Telefon und PLZ (mit Land-Feld) bekommen ein Format.
    .replace('      label: Telefon\n      typ: text\n', '      label: Telefon\n      typ: text\n      format: telefon\n')
    .replace('      label: PLZ\n      typ: text\n', '      label: PLZ\n      typ: text\n      format: plz\n      landFeld: land\n')
    .replace('felder: [name, kuerzel, art, kundennummer, beschreibung]', 'felder: [name, kuerzel, art, kundennummer, steuernummer, beschreibung]')
    .replace('    - key: dokumente\n      name: Dokumente\n      art: dokumente\n', '    - key: dokumente\n      name: Dokumente\n      art: dokumente\n    - key: vertraege\n      name: Verträge\n      art: dokumente\n'),
  'inhalt/sichten.yaml': `${basis['inhalt/sichten.yaml']}\n- schluessel: vereine\n  name: Vereine\n  eltern: organisationen\n  typen: [organisation]\n  bedingungen:\n    - { feld: art, operator: einerVon, wert: [Verein] }\n`,
};
/** Paket mit Abhängigkeit auf basis und zwei Typen, die aufeinander verweisen. */
const vertraege = {
  'manifest.yaml': 'schema: 1\nid: vertraege\nname: Verträge\nversion: 1.0.0\nbeschreibung: Verträge mit Organisationen.\nautor: { name: Test, github: test }\nlizenz: MIT\ndms: ">=0.60.0"\nabhaengigkeiten:\n  basis: "^1.0.0"\ninhalt:\n  mappentypen: inhalt/mappentypen.yaml\n  sichten: inhalt/sichten.yaml\n',
  'inhalt/mappentypen.yaml': [
    '- schluessel: vertrag', '  name: Vertrag', '  beschreibung: Ein Vertrag', '  titelVorlage: "{nr}"', '  felder:',
    '    - { key: nr, label: Nummer, typ: text, pflicht: true }',
    '    - { key: partner, label: Partner, typ: referenz, ziel: "basis:organisation" }',
    '    - { key: letzte, label: Letzte Zahlung, typ: referenz, ziel: zahlung }',
    '  register:', '    - { key: daten, name: Daten, art: felder, felder: [nr, partner, letzte] }',
    '    - { key: zahlungen, name: Zahlungen, art: verknuepfungen, quellen: [{ typ: zahlung, feld: vertrag }] }',
    '- schluessel: zahlung', '  name: Zahlung', '  beschreibung: Eine Zahlung', '  titelVorlage: "{datum}"', '  felder:',
    '    - { key: datum, label: Datum, typ: datum, pflicht: true }',
    '    - { key: betrag, label: Betrag, typ: betrag, waehrung: EUR }',
    '    - { key: vertrag, label: Vertrag, typ: referenz, ziel: vertrag }',
    '  register:', '    - { key: daten, name: Daten, art: felder, felder: [datum, betrag, vertrag] }', '',
  ].join('\n'),
  'inhalt/sichten.yaml': '- { schluessel: vertraege, name: Verträge, typen: [vertrag] }\n',
};

/** Beispiele mit Verweisen (#347): Basis gibt der Stadtwerke-Mappe einen Schlüssel, Verträge zeigen darauf. */
const basisMitSchluessel = (b: Record<string, string>) => ({
  ...b,
  'manifest.yaml': b['manifest.yaml'].replace('version: 1.0.0', 'version: 1.0.1'),
  'inhalt/beispiele.yaml': b['inhalt/beispiele.yaml'].replace('- typ: organisation\n  werte:\n    name: Stadtwerke', '- typ: organisation\n  schluessel: stadtwerke\n  werte:\n    name: Stadtwerke'),
});
const vertraegeMitBeispielen = {
  ...vertraege,
  'manifest.yaml': vertraege['manifest.yaml'].replace('  sichten: inhalt/sichten.yaml\n', '  sichten: inhalt/sichten.yaml\n  beispiele: inhalt/beispiele.yaml\n'),
  'inhalt/beispiele.yaml': [
    // Zahlung zeigt auf den Vertrag, steht aber zuerst: Das DMS legt den Vertrag vorher an.
    '- typ: zahlung', '  werte: { datum: "2026-01-31", betrag: 89, vertrag: { beispiel: strom } }',
    '- typ: vertrag', '  schluessel: strom', '  werte: { nr: S-1, partner: { beispiel: "basis:stadtwerke" } }',
    '- typ: vertrag', '  werte: { nr: S-2, partner: { beispiel: "basis:gibtsnicht" } }', '',
  ].join('\n'),
};

/** Paket mit Verweisen auf Mappentypen des DMS (#310): Ablageort und Benutzer. */
const ordnerpaket = {
  'manifest.yaml': 'schema: 1\nid: ordnerpaket\nname: Ordner\nversion: 1.0.0\nbeschreibung: Test.\nautor: { name: Test, github: test }\nlizenz: MIT\ndms: ">=0.75.0"\ninhalt:\n  mappentypen: inhalt/mappentypen.yaml\n  sichten: inhalt/sichten.yaml\n',
  'inhalt/mappentypen.yaml': [
    '- schluessel: urkunde', '  name: Urkunde', '  titelVorlage: "{name}"', '  felder:',
    '    - { key: name, label: Name, typ: text, pflicht: true }',
    '    - { key: verbleib_original, label: Verbleib Originaldokumente, typ: referenz, ziel: "dms:ablageort" }',
    '    - { key: verantwortlich, label: Verantwortlich, typ: referenz, ziel: "dms:benutzer" }',
    '  register:', '    - { key: daten, name: Daten, art: felder, felder: [name, verbleib_original, verantwortlich] }', '',
  ].join('\n'),
  'inhalt/sichten.yaml': '- { schluessel: orte, name: Orte und Urkunden, typen: ["dms:ablageort", urkunde] }\n',
};

/** Basis 1.6.0 (#883, dms-registry #138): bringt den Ablageort mit. */
const basis16 = basisMitAblageort(basis);
/** Haushalt-ähnliches Paket nach #883: verweist auf basis:ablageort und braucht Basis ab 1.6.0. */
const ordnerpaketNeu = {
  ...ordnerpaket,
  'manifest.yaml': ordnerpaket['manifest.yaml'].replace('dms: ">=0.75.0"\n', 'dms: ">=0.75.0"\nabhaengigkeiten: { basis: ">=1.6.0" }\n'),
  'inhalt/mappentypen.yaml': ordnerpaket['inhalt/mappentypen.yaml'].replace('ziel: "dms:ablageort"', 'ziel: "basis:ablageort"'),
  'inhalt/sichten.yaml': ordnerpaket['inhalt/sichten.yaml'].replace('"dms:ablageort"', '"basis:ablageort"'),
};

/** Mappentypen ohne die, die das DMS selbst mitbringt (Systemtypen, Ablageort #168). */
const paketTypen = async (d: Dienst) => {
  const a = await d.systemtypen.ablageortTyp();
  return (await d.mappentypen.listeTypen()).filter((t) => !t.system && t.id !== a?.id);
};

function faelle(pg: boolean) {
  describe(`Paketverwaltung (#188)${pg ? ' – PostgreSQL' : ''}`, { skip: pg && !process.env.TEST_DATABASE_URL && 'ohne TEST_DATABASE_URL' }, () => {
    async function aufbau(eintraege: Parameters<typeof katalog>[0], version = '0.63.0') {
      const einstellungen = speicherEinstellungen();
      const d = new Dienst(await repo(pg), speicherDateien(), { einstellungen });
      const p = new Paketverwaltung(d, { version: () => version, abruf: katalog(eintraege), katalogUrl: KATALOG });
      return { d, p, einstellungen };
    }

    it('installiert das Basis-Paket (Abnahme), aktualisiert und entfernt es', async () => {
      const { d, p } = await aufbau([{ dateien: basis }, { dateien: basis11 }]);
      const k = await p.katalog();
      assert.deepEqual(k.katalog.pakete.map((x) => x.id), ['basis']);
      const v = await p.vorschau({ id: 'basis', version: '1.0.0' });
      assert.equal(v.dmsOk, true);
      assert.deepEqual(v.typen.map((t) => [t.dmsSchluessel, t.name, t.konflikt]), [['basis:organisation', 'Organisation', null]]);
      assert.deepEqual(v.sichten.map((s) => s.name), ['Organisationen', 'Versicherungen', 'Banken', 'Behörden', 'Ärzte und Praxen']);
      assert.equal(v.beispiele, 2);
      const inst = await p.installiere({ id: 'basis', version: '1.0.0', beispiele: true }, ICH);
      assert.equal(inst.version, '1.0.0');
      assert.deepEqual(inst.herkunft, { art: 'katalog', url: KATALOG });
      const typ = (await d.mappentypen.listeTypen()).find((t) => t.schluessel === 'basis:organisation')!;
      assert.equal(typ.id, inst.typen.organisation);
      assert.deepEqual(typ.register.map((r) => r.key), ['stammdaten', 'kontakt', 'anschrift', 'dokumente', 'protokoll']);
      const sichten = await d.sichtenVerwaltung.listeSichten();
      const oben = sichten.find((s) => s.id === inst.sichten.organisationen)!;
      assert.equal(sichten.filter((s) => s.elternId === oben.id).length, 4);
      assert.ok(!sichten.some((s) => s.id === typ.id), 'keine automatische Sicht je Typ');
      const ADMIN = { id: ICH.id, rolle: 'admin' };
      assert.equal((await d.sichten.seite(ADMIN, { sicht: oben.id })).gesamt, 2);
      assert.deepEqual((await d.sichten.seite(ADMIN, { sicht: inst.sichten.aerzte })).mappen.map((m) => m.titel), ['Praxis Dr. Beispiel']);
      assert.equal((await d.kern.repo.listePakete()).length, 1);

      // Der Administrator ändert selbst: Name, ein eigenes Feld. Das Update überschreibt das nicht.
      await d.mappentypen.aendereTyp(typ.id, { ...typ, name: 'Firma', felder: [...typ.felder.map((f) => (f.key === 'name' ? { ...f, erkennung: { art: 'name' as const, hinweis: 'eigener' } } : f)), { key: 'notiz', label: 'Notiz', typ: 'text' }] });
      assert.deepEqual(await p.updates(), [{ id: 'basis', installiert: '1.0.0', neu: '1.1.0', changelog: '', quelle: KATALOG }]);
      const uv = await p.vorschau({ id: 'basis' });
      assert.equal(uv.update, true);
      assert.deepEqual(uv.typen[0].neueFelder, ['Steuernummer']);
      assert.deepEqual(uv.typen[0].neueRegister, ['Verträge']);
      assert.deepEqual(uv.typen[0].erkennung, ['Kundennummer'], 'Name hat der Administrator schon selbst eingestellt');
      assert.deepEqual(uv.typen[0].formate, ['Telefon', 'PLZ']);
      assert.deepEqual(uv.sichten.filter((s) => !s.vorhanden).map((s) => s.name), ['Vereine']);
      const neu = await p.aktualisiere('basis', {}, ICH);
      assert.equal(neu.version, '1.1.0');
      assert.equal(neu.installiert, inst.installiert);
      const t2 = (await d.mappentypen.listeTypen()).find((t) => t.id === typ.id)!;
      assert.equal(t2.name, 'Firma');
      assert.ok(t2.felder.some((f) => f.key === 'notiz') && t2.felder.some((f) => f.key === 'steuernummer'));
      assert.ok(t2.register.find((r) => r.key === 'stammdaten')!.felder!.includes('steuernummer'));
      assert.ok(t2.register.some((r) => r.key === 'vertraege'));
      assert.deepEqual(t2.felder.find((f) => f.key === 'kundennummer')!.erkennung, { art: 'nummer', hinweis: 'oben rechts' });
      assert.deepEqual(t2.felder.find((f) => f.key === 'name')!.erkennung, { art: 'name', hinweis: 'eigener' }, 'bleibt, wie der Administrator es eingestellt hat');
      assert.equal(t2.felder.find((f) => f.key === 'telefon')!.format, 'telefon');
      assert.deepEqual([t2.felder.find((f) => f.key === 'plz')!.format, t2.felder.find((f) => f.key === 'plz')!.landFeld], ['plz', 'land']);
      assert.ok((await d.sichtenVerwaltung.listeSichten()).some((s) => s.id === neu.sichten.vereine && s.elternId === oben.id));
      await assert.rejects(p.aktualisiere('basis', {}, ICH), /schon installiert/);

      // Entfernen geht erst ohne eigene Mappen; unveränderte Beispiel-Mappen gehen mit (#878), geänderte werden genannt.
      const praxis = (await d.sichten.seite(ADMIN, { sicht: oben.id })).mappen.find((m) => m.titel === 'Praxis Dr. Beispiel')!;
      await d.mappen.aendereMappe(praxis.id, { werte: { ...praxis.werte, beschreibung: 'Neue Sprechzeiten.' } }, ICH.id);
      await assert.rejects(p.entferne('basis', ICH), (e) => e instanceof Fachfehler && e.status === 409 && JSON.stringify(e.details).includes('1 Mappe') && JSON.stringify(e.details).includes('„Praxis Dr. Beispiel“ wurde geändert'));
      assert.equal((await d.sichten.seite(ADMIN, { sicht: oben.id })).gesamt, 2, 'beim Scheitern bleiben beide Beispiele');
      await d.loeschen.entferneMappenEndgueltig([praxis.id]);
      await p.entferne('basis', ICH);
      assert.ok(!(await d.mappentypen.listeTypen()).some((t) => t.id === typ.id));
      assert.ok(!(await d.sichtenVerwaltung.listeSichten()).some((s) => Object.values(neu.sichten).includes(s.id)));
      assert.deepEqual(await d.kern.repo.listePakete(), []);
    });

    it('Paket über der gemeinsamen Grenze wird verständlich abgelehnt, ohne es zu laden (#644)', async () => {
      const { p } = await aufbau([{ dateien: basis, groesse: 200 * 1024 * 1024 }]);
      await assert.rejects(p.vorschau({ id: 'basis' }), /Das Paket ist 200 MB groß, höchstens 128 MB sind erlaubt/);
      const knapp = await aufbau([{ dateien: basis, groesse: ARCHIV_MAX }]);
      // Die Angabe im Katalog darf bis zur Grenze gehen; geprüft wird danach die Prüfsumme.
      assert.equal((await knapp.p.vorschau({ id: 'basis' })).dmsOk, true);
    });

    it('Prüfsumme falsch, Ablago zu alt, Abhängigkeit fehlt', async () => {
      const { d, p } = await aufbau([{ dateien: basis, falscheSumme: true }]);
      await assert.rejects(p.vorschau({ id: 'basis' }), /Prüfsumme/);
      assert.deepEqual(await paketTypen(d), [], 'nur noch die Typen von Ablago (System, Ablageort)');
      const alt = await aufbau([{ dateien: basis }], '0.62.0');
      const v = await alt.p.vorschau({ id: 'basis' });
      assert.equal(v.dmsOk, false);
      await assert.rejects(alt.p.installiere({ id: 'basis' }, ICH), /braucht Ablago >=0\.63\.0/);
      const ohne = await aufbau([{ dateien: vertraege }]);
      await assert.rejects(ohne.p.installiere({ id: 'vertraege' }, ICH), /Es fehlen Pakete.*basis/);
      await assert.rejects(ohne.p.installiere({ id: 'vertraege', mitAbhaengigkeiten: true }, ICH), /gibt es im Katalog nicht/);
      assert.deepEqual(await paketTypen(ohne.d), [], 'nichts angelegt');
    });

    it('installiert Abhängigkeiten mit, löst Verweise auf und sperrt das Entfernen', async () => {
      const { d, p } = await aufbau([{ dateien: basis }, { dateien: vertraege }]);
      const v = await p.vorschau({ id: 'vertraege' });
      assert.deepEqual(v.abhaengigkeiten, [{ id: 'basis', bereich: '^1.0.0', installiert: null, ok: false, verfuegbar: '1.0.0' }]);
      const inst = await p.installiere({ id: 'vertraege', mitAbhaengigkeiten: true }, ICH);
      const pakete = await d.kern.repo.listePakete();
      assert.deepEqual(pakete.map((x) => x.id), ['basis', 'vertraege']);
      const typen = await d.mappentypen.listeTypen();
      const vertrag = typen.find((t) => t.id === inst.typen.vertrag)!;
      assert.equal(vertrag.felder.find((f) => f.key === 'partner')!.zielTypen?.[0], pakete[0].typen.organisation);
      assert.equal(vertrag.felder.find((f) => f.key === 'letzte')!.zielTypen?.[0], inst.typen.zahlung);
      assert.deepEqual(vertrag.register.find((r) => r.key === 'zahlungen')!.quellen, [{ typId: inst.typen.zahlung, feldKey: 'vertrag' }]);
      assert.equal(typen.find((t) => t.id === inst.typen.zahlung)!.felder.find((f) => f.key === 'vertrag')!.zielTypen?.[0], vertrag.id);
      await assert.rejects(p.entferne('basis', ICH), (e) => e instanceof Fachfehler && JSON.stringify(e.details).includes('braucht'));
      await p.entferne('vertraege', ICH);
      await p.entferne('basis', ICH);
      assert.deepEqual(await paketTypen(d), [], 'nur noch die Typen von Ablago (System, Ablageort)');
    });

    it('Namenskonflikt mit Vorschlag; ein Fehler lässt nichts halb angelegt', async () => {
      const kaputt = { ...basis, 'inhalt/beispiele.yaml': '- typ: organisation\n  werte:\n    kuerzel: OHNE\n' };
      const { d, p } = await aufbau([{ dateien: kaputt }]);
      await d.mappentypen.legeTypAn({ name: 'Organisation', felder: [{ key: 'name', label: 'Name', typ: 'text' }] });
      const v = await p.vorschau({ id: 'basis' });
      assert.equal(v.typen[0].konflikt, 'Einen Mappentyp „Organisation“ gibt es schon.');
      assert.equal(v.typen[0].vorschlag, 'Organisation (Basis)');
      await assert.rejects(p.installiere({ id: 'basis' }, ICH), (e) => e instanceof Fachfehler && e.status === 409 && JSON.stringify(e.details).includes('Organisation (Basis)'));
      const typen = (await d.mappentypen.listeTypen()).length, sichten = (await d.sichtenVerwaltung.listeSichten()).length;
      // Beispiel ohne Pflichtfeld Name: alles wird zurückgenommen.
      await assert.rejects(p.installiere({ id: 'basis', namen: { organisation: 'Organisation (Basis)' }, beispiele: true }, ICH), /Beispiel/);
      assert.equal((await d.mappentypen.listeTypen()).length, typen);
      assert.equal((await d.sichtenVerwaltung.listeSichten()).length, sichten);
      assert.deepEqual(await d.kern.repo.listePakete(), []);
      const ok = await p.installiere({ id: 'basis', namen: { organisation: 'Organisation (Basis)' } }, ICH);
      assert.equal((await d.mappentypen.listeTypen()).find((t) => t.id === ok.typen.organisation)!.name, 'Organisation (Basis)');
    });

    it('erweiterte Ansicht: weitere Kataloge, Bestätigung, Updates nur aus der eigenen Quelle (#189)', async () => {
      const EIGEN = 'https://eigen.test/k/katalog.json';
      const daten = new Map<string, Buffer>();
      katalog([{ dateien: basis }], KATALOG, daten);
      katalog([{ dateien: basis11 }], EIGEN, daten);
      const abruf = async (url: string) => { const b = daten.get(url); if (!b) throw new Error(`404 ${url}`); return b; };
      const d = new Dienst(await repo(pg), speicherDateien(), { einstellungen: speicherEinstellungen() });
      const p = new Paketverwaltung(d, { version: () => '0.63.0', abruf, katalogUrl: KATALOG });
      await assert.rejects(p.quelleHinzufuegen({ url: 'http://eigen.test/k.json' }, ICH), /nur über HTTPS/);
      await assert.rejects(p.vorschau({ id: 'basis', quelle: EIGEN }), /nicht \(mehr\) eingerichtet/);
      assert.deepEqual((await p.quelleHinzufuegen({ url: EIGEN }, ICH)).map((q) => [q.url, q.offiziell, q.aktiv]), [[KATALOG, true, true], [EIGEN, false, true]]);
      await assert.rejects(p.quelleHinzufuegen({ url: EIGEN }, ICH), /schon eingetragen/);
      assert.deepEqual((await p.abrufen(false)).kataloge.map((k) => k.url), [KATALOG], 'normale Ansicht: nur offiziell');
      const alle = await p.abrufen(true);
      assert.deepEqual(alle.kataloge.map((k) => [k.url, k.katalog?.pakete[0].aktuell]), [[KATALOG, '1.0.0'], [EIGEN, '1.1.0']]);
      await assert.rejects(p.installiere({ id: 'basis', quelle: EIGEN }, ICH), (e) => e instanceof Fachfehler && (e.details as { warnung?: boolean }).warnung === true);
      const inst = await p.installiere({ id: 'basis', version: '1.1.0', quelle: EIGEN, bestaetigt: true }, ICH);
      assert.deepEqual(inst.herkunft, { art: 'katalog', url: EIGEN });
      assert.deepEqual(await p.updates(), [], 'im offiziellen Katalog gibt es nur 1.0.0 – zählt nicht');
      await p.quelleSchalten({ url: EIGEN, aktiv: false }, ICH);
      assert.deepEqual((await p.abrufen(true)).kataloge.map((k) => k.url), [KATALOG]);
      await assert.rejects(p.aktualisiere('basis', {}, ICH), /abgeschaltet/);
      await p.quelleEntfernen(EIGEN, ICH);
      assert.equal((await p.quellen()).length, 1);
    });

    it('Beispiele verweisen auf Beispiele – im Paket und in Abhängigkeiten (#347)', async () => {
      const b1 = basisMitSchluessel(basis);
      const { d, p } = await aufbau([{ dateien: b1 }, { dateien: vertraegeMitBeispielen }]);
      await p.katalog();
      const inst = await p.installiere({ id: 'vertraege', beispiele: true, mitAbhaengigkeiten: true }, ICH);
      const pakete = await d.kern.repo.listePakete();
      const bas = pakete.find((x) => x.id === 'basis')!;
      assert.ok(bas.beispiele?.stadtwerke, 'Beispiele der Abhängigkeit kamen mit und sind gemerkt');
      assert.ok(inst.beispiele?.strom);
      const vertrag = await d.mappen.listeMappen(inst.typen.vertrag);
      const s1 = vertrag.find((m) => m.werte.nr === 'S-1')!;
      assert.equal(s1.werte.partner, bas.beispiele!.stadtwerke, 'Vertrag → Organisation aus Basis');
      assert.ok(!vertrag.find((m) => m.werte.nr === 'S-2')!.werte.partner, 'unbekanntes Ziel in der Abhängigkeit: Feld bleibt leer');
      const [z] = await d.mappen.listeMappen(inst.typen.zahlung);
      assert.equal(z.werte.vertrag, s1.id, 'Zahlung → Vertrag, obwohl sie zuerst steht');

      // Basis schon ohne Beispiele installiert: Hinweis in der Vorschau, Verweis bleibt leer.
      const zwei = await aufbau([{ dateien: b1 }, { dateien: vertraegeMitBeispielen }]);
      await zwei.p.katalog();
      await zwei.p.installiere({ id: 'basis' }, ICH);
      const v = await zwei.p.vorschau({ id: 'vertraege' });
      assert.ok(v.hinweise.some((h) => /Beispiele von „Basis“/.test(h)), v.hinweise.join(' | '));
      const i2 = await zwei.p.installiere({ id: 'vertraege', beispiele: true }, ICH);
      assert.ok(!(await zwei.d.mappen.listeMappen(i2.typen.vertrag)).find((m) => m.werte.nr === 'S-1')!.werte.partner);

      // Prüfung beim Lesen: unbekannter Schlüssel, fremdes Paket ohne Abhängigkeit, doppelter Schlüssel, Kreis.
      const mit = (y: string) => ({ ...vertraegeMitBeispielen, 'inhalt/beispiele.yaml': y });
      const gruende = (y: string) => { try { liesPaket(liesZip(archiv(mit(y)))); return []; } catch (e) { return (e as Fachfehler & { details: { gruende: string[] } }).details.gruende; } };
      assert.ok(gruende('- { typ: zahlung, werte: { datum: "2026-01-01", vertrag: { beispiel: fehlt } } }\n').some((g) => /„fehlt“, das es im Paket nicht gibt/.test(g)));
      assert.ok(gruende('- { typ: vertrag, werte: { nr: X, partner: { beispiel: "haushalt:x" } } }\n').some((g) => /nicht unter abhaengigkeiten/.test(g)));
      assert.ok(gruende('- { typ: vertrag, schluessel: a, werte: { nr: A } }\n- { typ: vertrag, schluessel: a, werte: { nr: B } }\n').some((g) => /„a“ doppelt/.test(g)));
      const kreis = '- { typ: vertrag, schluessel: v, werte: { nr: V, letzte: { beispiel: z } } }\n- { typ: zahlung, schluessel: z, werte: { datum: "2026-01-01", vertrag: { beispiel: "vertraege:v" } } }\n';
      assert.ok(gruende(kreis).some((g) => /Kreis/.test(g)));
      assert.deepEqual(gruende('- { typ: vertrag, schluessel: v, werte: { nr: V } }\n- { typ: zahlung, werte: { datum: "2026-01-01", vertrag: { beispiel: "vertraege:v" } } }\n'), [], 'eigene Paket-Id als Präfix ist erlaubt');
    });

    it('verweist mit dms:… auf Mappentypen von Ablago (#310); dms:ablageort ist ein veralteter Alias (#883)', async () => {
      const { d, p, einstellungen } = await aufbau([{ dateien: ordnerpaket }], '0.75.0');
      // Ohne Ablageort (neue Ablage ohne Basis): Hinweis auf Basis statt eines Updates von Ablago.
      const ohne = await p.vorschau({ id: 'ordnerpaket' });
      assert.ok(ohne.probleme.some((x) => /„dms:ablageort“ steht für „basis:ablageort“.*Basis ab 1\.6\.0/.test(x)), ohne.probleme.join(' | '));
      await assert.rejects(p.installiere({ id: 'ordnerpaket' }, ICH), /Basis ab 1\.6\.0/);
      // Mit dem früheren Ablageort des Kerns: der Alias zeigt auf ihn, mit Hinweis in der Prüfung.
      const ablageort = await frueherAblageort(d, einstellungen);
      const v = await p.vorschau({ id: 'ordnerpaket' });
      assert.deepEqual(v.probleme, []);
      assert.ok(v.hinweise.some((h) => /Benutzer \(aus Ablago\)/.test(h) && !/Ablageort/.test(h)), v.hinweise.join(' | '));
      assert.ok(v.hinweise.some((h) => /„dms:ablageort“ ist veraltet.*„basis:ablageort“/.test(h)), v.hinweise.join(' | '));
      const ok = await p.installiere({ id: 'ordnerpaket' }, ICH);
      const urkunde = (await d.mappentypen.listeTypen()).find((t) => t.id === ok.typen.urkunde)!;
      assert.equal(urkunde.felder.find((f) => f.key === 'verbleib_original')!.zielTypen?.[0], ablageort.id);
      assert.equal(urkunde.felder.find((f) => f.key === 'verantwortlich')!.zielTypen?.[0], (await d.systemausstattung.sicherstellen()).benutzer.id);
      assert.deepEqual((await d.sichtenVerwaltung.listeSichten()).find((s) => s.id === ok.sichten.orte)!.typen.sort(), [ablageort.id, urkunde.id].sort());
      // Unbekannter DMS-Typ und reservierte Id: schon beim Lesen abgelehnt.
      const falsch = { ...ordnerpaket, 'inhalt/mappentypen.yaml': ordnerpaket['inhalt/mappentypen.yaml'].replace('dms:benutzer', 'dms:post') };
      assert.throws(() => liesPaket(liesZip(archiv(falsch))), (e) => e instanceof Fachfehler && (e.details as { gruende: string[] }).gruende.some((g) => /dms:post.*nicht mit/.test(g)));
      const dmsId = { ...ordnerpaket, 'manifest.yaml': ordnerpaket['manifest.yaml'].replace('id: ordnerpaket', 'id: dms') };
      assert.throws(() => liesPaket(liesZip(archiv(dmsId))), (e) => e instanceof Fachfehler && (e.details as { gruende: string[] }).gruende.some((g) => /reserviert/.test(g)));
    });

    it('Basis 1.6.0 übernimmt den früheren Ablageort: gleiche Id, Mappen, Verweise und Ansicht bleiben (#883)', async () => {
      const { d, p, einstellungen } = await aufbau([{ dateien: basis16 }, { dateien: ordnerpaketNeu }], '0.212.0');
      await d.systemausstattung.sicherstellen();
      const a = await frueherAblageort(d, einstellungen);
      const ort = await d.mappen.legeMappeAn({ typId: a.id, werte: { name: 'roter Ordner' } });
      const vertrag = await d.mappentypen.legeTypAn({ name: 'Vertrag', felder: [{ key: 'name', label: 'Name', typ: 'text', pflicht: true },
        { key: 'verbleib_original', label: 'Verbleib Originaldokumente', typ: 'referenz', zielTyp: a.id, verweisart: 'bezug' }] });
      const v1 = await d.mappen.legeMappeAn({ typId: vertrag.id, werte: { name: 'Strom', verbleib_original: ort.id } });
      const typenVorher = (await d.mappentypen.listeTypen()).length;
      const sichtenVorher = (await d.sichtenVerwaltung.listeSichten()).length;
      const plan = await p.vorschau({ id: 'basis' });
      assert.deepEqual(plan.probleme, []);
      assert.equal(plan.typen.find((x) => x.schluessel === 'ablageort')!.vorhanden, true, 'gilt als vorhanden, nicht neu');
      assert.equal(plan.sichten.find((x) => x.schluessel === 'ablageorte')!.vorhanden, true);
      assert.ok(plan.hinweise.some((h) => /„Ablageort“ \(Ablageort\) übernimmt das Paket/.test(h)), plan.hinweise.join(' | '));
      const inst = await p.installiere({ id: 'basis' }, ICH);
      assert.equal(inst.typen.ablageort, a.id, 'gleiche Id, Herkunft danach Basis');
      assert.equal(inst.sichten.ablageorte, a.id, 'die vorhandene Ansicht gehört jetzt zu Basis');
      assert.equal((await d.mappentypen.listeTypen()).length, typenVorher + 1, 'nur Organisation kommt dazu – kein zweiter Ablageort');
      assert.equal((await d.sichtenVerwaltung.listeSichten()).length, sichtenVorher + 5, 'nur die Ansichten der Organisation');
      assert.equal((await d.mappen.listeMappen(a.id)).length, 1, 'Mappen bleiben');
      assert.equal((await d.mappen.holeMappe(v1.id)).mappe.werte.verbleib_original, ort.id, 'Verweise bleiben');
      const jetzt = (await d.systemtypen.ablageortTyp())!;
      assert.equal(jetzt.id, a.id);
      assert.equal(jetzt.beschriftungen?.en?.name, 'Storage location', 'Beschriftungen von Basis ergänzt');
      assert.equal(await d.kern.frueherAblageortTyp(), undefined, 'kein früherer mehr');
      // Pakete mit basis:ablageort zeigen auf denselben Typ.
      const o = await p.installiere({ id: 'ordnerpaket' }, ICH);
      assert.equal((await d.mappentypen.listeTypen()).find((t) => t.id === o.typen.urkunde)!.felder.find((f) => f.key === 'verbleib_original')!.zielTypen?.[0], a.id);
      // Herkunft „Basis“: Erneute Vorschau übernimmt nichts mehr.
      assert.ok(!(await p.vorschau({ id: 'basis' })).hinweise.some((h) => /übernimmt das Paket/.test(h)));
    });

    it('Update von Basis auf 1.6.0 übernimmt den früheren Ablageort genauso (#883)', async () => {
      const { d, p, einstellungen } = await aufbau([{ dateien: basis }, { dateien: basis16 }], '0.212.0');
      await p.installiere({ id: 'basis', version: '1.0.0' }, ICH);
      const a = await frueherAblageort(d, einstellungen);
      const neu = await p.aktualisiere('basis', {}, ICH);
      assert.equal(neu.version, '1.6.0');
      assert.equal(neu.typen.ablageort, a.id);
      assert.equal((await d.mappentypen.listeTypen()).filter((t) => t.name === 'Ablageort').length, 1);
    });

    it('neue Ablage: Basis 1.6.0 legt den Ablageort an; dms:ablageort zeigt als Alias darauf (#883)', async () => {
      const { d, p } = await aufbau([{ dateien: basis16 }, { dateien: ordnerpaket }], '0.212.0');
      assert.equal(await d.systemtypen.ablageortTyp(), undefined);
      const inst = await p.installiere({ id: 'basis' }, ICH);
      const a = (await d.systemtypen.ablageortTyp())!;
      assert.equal(a.id, inst.typen.ablageort);
      assert.equal(a.schluessel, 'basis:ablageort');
      assert.deepEqual(a.register.map((r) => r.name), ['Allgemein', 'Enthält', 'Liegt hier', 'Fotos']);
      assert.deepEqual(a.register.find((r) => r.key === 'enthaelt')!.quellen, [{ typId: a.id, feldKey: 'liegt_in' }]);
      assert.equal(a.felder.find((f) => f.key === 'liegt_in')!.zielTypen?.[0], a.id);
      const o = await p.installiere({ id: 'ordnerpaket' }, ICH);
      assert.equal((await d.mappentypen.listeTypen()).find((t) => t.id === o.typen.urkunde)!.felder.find((f) => f.key === 'verbleib_original')!.zielTypen?.[0], a.id);
    });

    it('Paket hochladen: Prüfung, Bestätigung, Herkunft, Update durch erneutes Hochladen (#189)', async () => {
      const { d, p } = await aufbau([]);
      await assert.rejects(p.hochladen(Buffer.from('kein zip'), ICH), /kein gültiges ZIP/);
      const h = await p.hochladen(archiv(basis), ICH);
      assert.equal(h.vorschau.paket.id, 'basis');
      assert.equal(h.vorschau.typen[0].dmsSchluessel, 'basis:organisation');
      assert.deepEqual((await p.vorschau({ upload: h.upload })).sichten.length, 5);
      await assert.rejects(p.installiere({ upload: h.upload }, ICH), /nicht vom Ablago-Projekt geprüft/);
      const inst = await p.installiere({ upload: h.upload, bestaetigt: true, beispiele: true }, ICH);
      assert.equal(inst.herkunft.art, 'hochgeladen');
      assert.equal(inst.herkunft.art === 'hochgeladen' && inst.herkunft.von, ICH.email);
      await assert.rejects(p.installiere({ upload: h.upload, bestaetigt: true }, ICH), /abgelaufen/, 'ein Upload gilt nur einmal');
      await assert.rejects(p.aktualisiere('basis', {}, ICH), /erneutes Hochladen/);
      const gleich = await p.hochladen(archiv(basis), ICH);
      assert.deepEqual(gleich.vorschau.fehlercodes, ['schon-installiert'], 'Code statt Text für die Oberfläche (#729)');
      await assert.rejects(p.installiere({ upload: gleich.upload, bestaetigt: true }, ICH), /schon installiert/);
      const neu = await p.hochladen(archiv(basis11), ICH);
      assert.equal(neu.vorschau.update, true);
      const n = await p.installiere({ upload: neu.upload, bestaetigt: true }, ICH);
      assert.equal(n.version, '1.1.0');
      assert.equal(n.installiert, inst.installiert);
      assert.ok((await d.mappentypen.listeTypen()).find((t) => t.id === n.typen.organisation)!.felder.some((f) => f.key === 'steuernummer'));
      assert.equal((await d.mappentypen.listeTypen()).filter((t) => t.schluessel === 'basis:organisation').length, 1);
    });

    it('Sammeldatei: prüft alles vorher, ordnet nach Abhängigkeiten, installiert Paket für Paket (#461)', async () => {
      const { d, p } = await aufbau([]);
      // Verträge steht vorn, braucht aber Basis: Basis kommt zuerst.
      const r = await p.hochladenDatei(sammeldatei([vertraege, basis]), ICH);
      assert.ok('sammeldatei' in r);
      const s: Sammeldatei = r.sammeldatei;
      assert.deepEqual(s.pakete.map((x) => `${x.id}@${x.version}:${x.stand}:${x.katalog}`), ['basis@1.0.0:neu:unbekannt', 'vertraege@1.0.0:neu:unbekannt']);
      assert.equal(s.datei.dms, '0.107.1');
      assert.match(s.datei.sha256, /^[0-9a-f]{64}$/);
      // Je Paket: Herkunft bestätigen wie beim einzelnen Hochladen; installiert wird einzeln.
      await assert.rejects(p.installiere({ upload: s.pakete[0].upload }, ICH), /nicht vom Ablago-Projekt geprüft/);
      const b = await p.installiere({ upload: s.pakete[0].upload, bestaetigt: true }, ICH);
      assert.equal(b.herkunft.art, 'hochgeladen');
      assert.equal((await p.vorschau({ upload: s.pakete[1].upload })).abhaengigkeiten[0].installiert, '1.0.0');
      const v = await p.installiere({ upload: s.pakete[1].upload, bestaetigt: true }, ICH);
      assert.equal(v.id, 'vertraege');
      assert.equal(v.herkunft.art === 'hochgeladen' && v.herkunft.von, ICH.email);
      // Noch einmal dieselbe Datei: alles schon da.
      const nochmal = await p.hochladenDatei(sammeldatei([basis, vertraege]), ICH);
      assert.ok('sammeldatei' in nochmal && nochmal.sammeldatei.pakete.every((x) => x.stand === 'gleich'));
      // Ein einzelnes Paket geht weiter über denselben Weg.
      const einzeln = await p.hochladenDatei(archiv(basis11), ICH);
      assert.ok('upload' in einzeln && einzeln.vorschau.update);
      assert.ok((await d.kern.repo.listePakete()).length === 2);
    });

    it('Sammeldatei: verändert, unvollständig oder mit fremden Dateien – nichts wird angenommen (#461)', async () => {
      const { p } = await aufbau([]);
      const anzahl = (p as unknown as { uploads: Map<string, unknown> }).uploads;
      // Ein Byte im Archiv verändert, Verzeichnis nicht: Prüfsumme passt nicht.
      await assert.rejects(p.hochladenDatei(sammeldatei([basis], (dd) => { const b = Buffer.from(dd.get('pakete/basis-1.0.0.zip')!); b[40] ^= 1; dd.set('pakete/basis-1.0.0.zip', b); }), ICH), gruende(/Prüfsumme passt nicht zum Verzeichnis/));
      // Archiv ausgetauscht und Verzeichnis passend geändert, aber anderer Inhalt als angegeben.
      await assert.rejects(p.hochladenDatei(sammeldatei([basis], (dd, vz) => {
        const fremd = archiv(basis11); dd.delete('pakete/basis-1.0.0.zip'); dd.set('pakete/basis-1.0.0.zip', fremd);
        Object.assign((vz.pakete as Array<Record<string, unknown>>)[0], { sha256: sha(fremd), groesse: fremd.length });
      }), ICH), /enthält basis 1\.1\.0/);
      await assert.rejects(p.hochladenDatei(sammeldatei([basis], (dd) => dd.set('skript.sh', Buffer.from('rm -rf /'))), ICH), gruende(/skript\.sh: steht nicht im Verzeichnis/));
      await assert.rejects(p.hochladenDatei(sammeldatei([basis], (dd) => dd.delete('pakete/basis-1.0.0.zip')), ICH), gruende(/basis-1\.0\.0\.zip fehlt/));
      await assert.rejects(p.hochladenDatei(sammeldatei([basis], (_, vz) => { vz.format = 2; }), ICH), gruende(/Format 2/));
      await assert.rejects(p.hochladenDatei(sammeldatei([basis], (_, vz) => { (vz.pakete as unknown[]).push({ ...(vz.pakete as object[])[0] }); }), ICH), gruende(/zweimal/));
      await assert.rejects(p.hochladenDatei(sammeldatei([basis], (_, vz) => { (vz.pakete as Array<Record<string, unknown>>)[0].archiv = '../basis.zip'; }), ICH), gruende(/muss pakete\/basis-1\.0\.0\.zip heißen/));
      // Ein ungültiges Paket darin: ganze Sammeldatei abgelehnt, mit Namen.
      const kaputt = { ...vertraege, 'inhalt/sichten.yaml': '- { schluessel: X, name: "" }\n' };
      await assert.rejects(p.hochladenDatei(sammeldatei([basis, kaputt]), ICH), /vertraege 1\.0\.0 in der Sammeldatei: Das Paket ist ungültig/);
      assert.equal(anzahl.size, 0, 'keine Upload-Kennungen nach einer abgelehnten Sammeldatei');
      // Kreis in den Abhängigkeiten.
      const a = { 'manifest.yaml': basis['manifest.yaml'].replace('id: basis', 'id: aaa').replace('abhaengigkeiten: {}', 'abhaengigkeiten:\n  bbb: ">=1.0.0"') };
      const bb = { 'manifest.yaml': basis['manifest.yaml'].replace('id: basis', 'id: bbb').replace('abhaengigkeiten: {}', 'abhaengigkeiten:\n  aaa: ">=1.0.0"') };
      await assert.rejects(p.hochladenDatei(sammeldatei([{ ...basis, ...a }, { ...basis, ...bb }]), ICH), /Kreis/);
      // Entpackt-Budget über alle Pakete (Schutz gegen ZIP-Bomben verteilt auf viele Archive).
      assert.throws(() => liesZip(archiv(basis), { dateien: 500, entpackt: 1e9, budget: { rest: 10 } }), /zusammen zu groß/);
    });

    it('Sammeldatei: Abgleich mit dem offiziellen Katalog, wenn er schon abgerufen ist (#461)', async () => {
      const { p } = await aufbau([{ dateien: basis }]);
      await p.katalog();
      const ok = await p.hochladenDatei(sammeldatei([basis]), ICH);
      assert.ok('sammeldatei' in ok && ok.sammeldatei.pakete[0].katalog === 'gleich');
      // Gleiche Id und Version, anderer Inhalt als im offiziellen Katalog: abgelehnt.
      const anders = { ...basis, 'README.md': 'verändert' };
      await assert.rejects(p.hochladenDatei(sammeldatei([anders]), ICH), gruende(/passt nicht zum offiziellen Katalog/));
    });
  });
}

describe('Pakete dazuholen: Auswahl mit Abhängigkeiten (#460)', () => {
  const kv = (version: string, dms: string, abhaengigkeiten: Record<string, string> = {}, code = false) => ({ version, dms, abhaengigkeiten, inhalt: { mappentypen: [], sichten: [], beispiele: 0 }, code, archiv: `archive/x-${version}.zip`, sha256: '0'.repeat(64), groesse: 1, veroeffentlicht: '', quelle: '', readme: '', changelog: '' });
  const kp = (id: string, versionen: ReturnType<typeof kv>[]) => ({ id, name: id[0].toUpperCase() + id.slice(1), beschreibung: '', autor: { name: '', github: '' }, lizenz: 'MIT', aktuell: versionen[0].version, versionen });
  const k: Katalog = { format: 1, erstellt: '', quelle: '', pakete: [
    kp('basis', [kv('1.1.1', '>=0.79.0'), kv('1.0.0', '>=0.63.0')]),
    kp('haushalt', [kv('1.0.2', '>=0.79.0', { basis: '>=1.0.0' })]),
    kp('vermietung', [kv('1.0.1', '>=0.79.0', { basis: '>=1.1.0', haushalt: '>=1.0.0', haus: '>=1.0.0' })]),
    kp('haus', [kv('1.0.2', '>=0.79.0', { basis: '>=1.0.0', haushalt: '>=1.0.0' })]),
    kp('texterkennung', [kv('1.0.0', '>=0.88.0', {}, true)]),
  ] };
  it('nimmt Abhängigkeiten mit, Abhängigkeiten zuerst, passend zur Ablago-Version', () => {
    const r = auswahlMitAbhaengigkeiten(k, ['vermietung', 'texterkennung'], '0.107.1');
    assert.deepEqual(r.probleme, []);
    assert.deepEqual(r.pakete.map((p) => `${p.id}@${p.version}${p.gewaehlt ? '' : '*'}`), ['basis@1.1.1*', 'haushalt@1.0.2*', 'haus@1.0.2*', 'vermietung@1.0.1', 'texterkennung@1.0.0']);
    assert.deepEqual(r.pakete.find((p) => p.id === 'basis')!.fuer, ['vermietung', 'haushalt', 'haus']);
    // Selbst gewählt, obwohl auch Abhängigkeit: gilt als gewählt.
    assert.equal(auswahlMitAbhaengigkeiten(k, ['haushalt', 'basis'], '0.107.1').pakete.find((p) => p.id === 'basis')!.gewaehlt, true);
  });
  it('lässt passend Installiertes weg und meldet, was nicht passt', () => {
    assert.deepEqual(auswahlMitAbhaengigkeiten(k, ['haushalt'], '0.107.1', [{ id: 'basis', version: '1.0.0' }]).pakete.map((p) => p.id), ['haushalt']);
    const alt = auswahlMitAbhaengigkeiten(k, ['texterkennung', 'basis'], '0.70.0');
    assert.deepEqual(alt.pakete.map((p) => `${p.id}@${p.version}`), ['basis@1.0.0']);
    assert.match(alt.probleme[0], /Texterkennung.*keine Version passt zu Ablago 0\.70\.0/);
    assert.match(auswahlMitAbhaengigkeiten({ ...k, pakete: k.pakete.filter((p) => p.id !== 'basis') }, ['haushalt'], '0.107.1').probleme[0], /braucht „basis“/);
  });
  it('Reihenfolge nach Abhängigkeiten, Kreis = null', () => {
    assert.deepEqual(nachAbhaengigkeiten([{ id: 'b', abhaengigkeiten: { a: '1.0.0' } }, { id: 'a', abhaengigkeiten: { x: '1.0.0' } }])!.map((x) => x.id), ['a', 'b']);
    assert.equal(nachAbhaengigkeiten([{ id: 'b', abhaengigkeiten: { a: '1.0.0' } }, { id: 'a', abhaengigkeiten: { b: '1.0.0' } }]), null);
  });
});

describe('Pakete: eine Größengrenze überall (#644)', () => {
  it('Archiv, code/ und Sammeldatei hängen an derselben Zahl', () => {
    assert.equal(PAKET_MAX, 128 * 1024 * 1024);
    assert.equal(ARCHIV_MAX, PAKET_MAX);
    assert.equal(CODE_MAX, PAKET_MAX);
    assert.ok(SAMMEL_MAX >= PAKET_MAX, 'eine Sammeldatei fasst mindestens ein Paket an der Grenze');
  });

  it('ein Paket mit 25 MB Modell (KI lokal – Ähnlichkeit) lässt sich lesen', () => {
    const modell = Buffer.alloc(25 * 1024 * 1024, 7);
    const b = zipPuffer([...Object.entries(basis).map(([name, inhalt]) => ({ name, daten: Buffer.from(inhalt) })), { name: 'code/daten/modell.bin', daten: modell }]);
    assert.equal(liesZip(b).get('code/daten/modell.bin')!.length, modell.length);
  });

  it('holeDaten lädt knapp unter der Grenze und bricht darüber mit Größe und Grenze ab', async () => {
    // Feste Größen je Pfad – der Test-Server legt nie Puffer in einer Größe aus der Anfrage an (CodeQL).
    const GROESSE: Record<string, number> = { '/genau': 3 * 1048576, '/zu-gross': 4 * 1048576 };
    const server = createServer((q, a) => {
      const [pfad, rest] = (q.url ?? '').split('?');
      const n = GROESSE[pfad] ?? 0;
      if (rest === 'ohne-laenge') { a.writeHead(200); a.write(Buffer.alloc(n - 10)); a.end(Buffer.alloc(10)); return; }
      a.writeHead(200, { 'content-length': n }); a.end(Buffer.alloc(n));
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    try {
      const max = 3 * 1048576;
      assert.equal((await holeDaten(`${url}/genau`, max)).length, max);
      await assert.rejects(holeDaten(`${url}/zu-gross`, max), /4 MB groß, höchstens 3 MB/);
      await assert.rejects(holeDaten(`${url}/zu-gross?ohne-laenge`, max), /höchstens 3 MB/);
    } finally { server.close(); }
  });
});

describe('Paket-Vorschau: „Das wird angelegt“ nur, wenn etwas angelegt wird (#643)', () => {
  it('Paket nur mit Code legt nichts an, Pakete mit Typen, Ansichten oder Beispielen schon', () => {
    assert.equal(legtEtwasAn({ typen: [], sichten: [], beispiele: 0 }), false, 'z. B. Texterkennung, Bildformate, Zusatzsprachen');
    assert.equal(legtEtwasAn({ typen: [{ vorhanden: true }], sichten: [{ vorhanden: true }], beispiele: 0 }), false, 'alles schon da');
    assert.equal(legtEtwasAn({ typen: [{ vorhanden: false, geloescht: true }], sichten: [], beispiele: 0 }), false, 'selbst gelöscht – bleibt weg');
    assert.equal(legtEtwasAn({ typen: [{ vorhanden: false }], sichten: [], beispiele: 0 }), true);
    assert.equal(legtEtwasAn({ typen: [], sichten: [{ vorhanden: false }], beispiele: 0 }), true);
    assert.equal(legtEtwasAn({ typen: [], sichten: [], beispiele: 2 }), true);
  });
});

describe('Pakete: Versionen und Archiv (#188)', () => {
  it('Versionsbereiche', () => {
    assert.ok(passt('1.2.3', '>=1.0.0') && passt('1.2.3', '^1.0.0') && !passt('2.0.0', '^1.0.0'));
    assert.ok(passt('0.2.5', '^0.2.0') && !passt('0.3.0', '^0.2.0'));
    assert.ok(passt('1.2.9', '~1.2.0') && !passt('1.3.0', '~1.2.0'));
    assert.ok(passt('1.0.0', '1.0.0') && !passt('1.0.1', '=1.0.0') && passt('1.5.0', '>=1.0.0 <2.0.0') && !passt('2.0.0', '>=1.0.0 <2.0.0'));
  });

  it('liest ein Archiv mit Ordner davor und meldet Fehler gesammelt', () => {
    const mitOrdner = archiv(Object.fromEntries(Object.entries(basis).map(([k, v]) => [`basis/${k}`, v])));
    const p = liesPaket(liesZip(mitOrdner));
    assert.equal(p.manifest.id, 'basis');
    assert.equal(p.typen[0].felder.length, 14);
    assert.equal(p.sichten.length, 5);
    assert.match(p.readme, /^# Basis/);
    assert.throws(() => liesPaket(liesZip(archiv({ 'manifest.yaml': 'schema: 1\nid: X\nversion: 1\n' }))), (e) => e instanceof Fachfehler && (e.details as { gruende: string[] }).gruende.length >= 3);
    assert.throws(() => liesZip(Buffer.from('kein zip')), /kein gültiges ZIP/);
  });
});

faelle(false);
faelle(true);
after(async () => { for (const s of offen) await s.end(); });
