/** Paketverwaltung (#188): Katalog, Vorschau, Installieren, Aktualisieren, Entfernen. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { passt, vergleicheVersion, type Katalog } from '../../shared/src/pakete';
import { speicherDateien } from '../src/dateispeicher';
import { Dienst } from '../src/dienst';
import { speicherEinstellungen } from '../src/einstellungen';
import { Fachfehler } from '../src/fehler';
import { liesPaket, liesZip, Paketverwaltung } from '../src/pakete';
import type { Repo } from '../src/repo';
import { speicherRepo } from '../src/repo-speicher';
import { zipPuffer } from '../src/zip';

const ICH = { id: '00000000-0000-4000-8000-0000000000aa', email: 'admin@example.org' };
const BASIS = fileURLToPath(new URL('./pakete/basis', import.meta.url));
const KATALOG = 'https://katalog.test/katalog.json';

const offen: Array<{ end(): Promise<void> }> = [];
async function repo(pg: boolean): Promise<Repo> {
  if (!pg) return speicherRepo();
  const { ausUrl, alsUrl, legeDatenbankAn } = await import('../src/anbindung');
  const { verbinde, migriere } = await import('../src/db');
  const { pgRepo } = await import('../src/repo-pg');
  const a = { ...ausUrl(process.env.TEST_DATABASE_URL)!, datenbank: `dms_pk_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}` };
  await legeDatenbankAn(a);
  const sql = verbinde(alsUrl(a));
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
const archiv = (d: Record<string, string>) => zipPuffer(Object.entries(d).map(([name, inhalt]) => ({ name, daten: Buffer.from(inhalt) })));
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');

/** Kleiner Katalog im Arbeitsspeicher: Archive je Paket und Version. */
function katalog(eintraege: Array<{ dateien: Record<string, string>; falscheSumme?: boolean }>, url = KATALOG, daten = new Map<string, Buffer>()) {
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
    p.versionen.unshift({ version, dms, abhaengigkeiten: abh, inhalt: { mappentypen: [], sichten: [], beispiele: 0 }, code: false, archiv: `archive/${m}-${version}.zip`, sha256: e.falscheSumme ? '0'.repeat(64) : sha(b), groesse: b.length, veroeffentlicht: '2026-11-01T00:00:00Z', quelle: '', readme: '', changelog: '' });
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

/** Mappentypen ohne die, die das DMS selbst mitbringt (Systemtypen, Ablageort #168). */
const paketTypen = async (d: Dienst) => {
  const a = await d.ablageortTyp();
  return (await d.listeTypen()).filter((t) => !t.system && t.id !== a?.id);
};

function faelle(pg: boolean) {
  describe(`Paketverwaltung (#188)${pg ? ' – PostgreSQL' : ''}`, { skip: pg && !process.env.TEST_DATABASE_URL && 'ohne TEST_DATABASE_URL' }, () => {
    async function aufbau(eintraege: Parameters<typeof katalog>[0], version = '0.63.0') {
      const d = new Dienst(await repo(pg), speicherDateien(), { einstellungen: speicherEinstellungen() });
      const p = new Paketverwaltung(d, { version: () => version, abruf: katalog(eintraege), katalogUrl: KATALOG });
      return { d, p };
    }

    it('installiert das Basis-Paket (Abnahme), aktualisiert und entfernt es', async () => {
      const { d, p } = await aufbau([{ dateien: basis }, { dateien: basis11 }]);
      const k = await p.katalog();
      assert.deepEqual(k.katalog.pakete.map((x) => x.id), ['basis']);
      const v = await p.vorschau({ id: 'basis', version: '1.0.0' });
      assert.equal(v.dmsOk, true);
      assert.deepEqual(v.typen.map((t) => [t.dmsSchluessel, t.name, t.konflikt]), [['basis_organisation', 'Organisation', null]]);
      assert.deepEqual(v.sichten.map((s) => s.name), ['Organisationen', 'Versicherungen', 'Banken', 'Behörden', 'Ärzte und Praxen']);
      assert.equal(v.beispiele, 2);
      const inst = await p.installiere({ id: 'basis', version: '1.0.0', beispiele: true }, ICH);
      assert.equal(inst.version, '1.0.0');
      assert.deepEqual(inst.herkunft, { art: 'katalog', url: KATALOG });
      const typ = (await d.listeTypen()).find((t) => t.schluessel === 'basis_organisation')!;
      assert.equal(typ.id, inst.typen.organisation);
      assert.deepEqual(typ.register.map((r) => r.key), ['stammdaten', 'kontakt', 'anschrift', 'dokumente', 'protokoll']);
      const sichten = await d.listeSichten();
      const oben = sichten.find((s) => s.id === inst.sichten.organisationen)!;
      assert.equal(sichten.filter((s) => s.elternId === oben.id).length, 4);
      assert.ok(!sichten.some((s) => s.id === typ.id), 'keine automatische Sicht je Typ');
      const ADMIN = { id: ICH.id, rolle: 'admin' };
      assert.equal((await d.seite(ADMIN, { sicht: oben.id })).gesamt, 2);
      assert.deepEqual((await d.seite(ADMIN, { sicht: inst.sichten.aerzte })).mappen.map((m) => m.titel), ['Praxis Dr. Beispiel']);
      assert.equal((await d.listePakete()).length, 1);

      // Der Administrator ändert selbst: Name, ein eigenes Feld. Das Update überschreibt das nicht.
      await d.aendereTyp(typ.id, { ...typ, name: 'Firma', felder: [...typ.felder, { key: 'notiz', label: 'Notiz', typ: 'text' }] });
      assert.deepEqual(await p.updates(), [{ id: 'basis', installiert: '1.0.0', neu: '1.1.0', changelog: '', quelle: KATALOG }]);
      const uv = await p.vorschau({ id: 'basis' });
      assert.equal(uv.update, true);
      assert.deepEqual(uv.typen[0].neueFelder, ['Steuernummer']);
      assert.deepEqual(uv.typen[0].neueRegister, ['Verträge']);
      assert.deepEqual(uv.sichten.filter((s) => !s.vorhanden).map((s) => s.name), ['Vereine']);
      const neu = await p.aktualisiere('basis', {}, ICH);
      assert.equal(neu.version, '1.1.0');
      assert.equal(neu.installiert, inst.installiert);
      const t2 = (await d.listeTypen()).find((t) => t.id === typ.id)!;
      assert.equal(t2.name, 'Firma');
      assert.ok(t2.felder.some((f) => f.key === 'notiz') && t2.felder.some((f) => f.key === 'steuernummer'));
      assert.ok(t2.register.find((r) => r.key === 'stammdaten')!.felder!.includes('steuernummer'));
      assert.ok(t2.register.some((r) => r.key === 'vertraege'));
      assert.ok((await d.listeSichten()).some((s) => s.id === neu.sichten.vereine && s.elternId === oben.id));
      await assert.rejects(p.aktualisiere('basis', {}, ICH), /schon installiert/);

      // Entfernen geht erst ohne Mappen.
      await assert.rejects(p.entferne('basis', ICH), (e) => e instanceof Fachfehler && e.status === 409 && JSON.stringify(e.details).includes('2 Mappen'));
      const ids = (await d.seite(ADMIN, { sicht: oben.id })).mappen.map((m) => m.id);
      await d.entferneMappenEndgueltig(ids);
      await p.entferne('basis', ICH);
      assert.ok(!(await d.listeTypen()).some((t) => t.id === typ.id));
      assert.ok(!(await d.listeSichten()).some((s) => Object.values(neu.sichten).includes(s.id)));
      assert.deepEqual(await d.listePakete(), []);
    });

    it('Prüfsumme falsch, DMS zu alt, Abhängigkeit fehlt', async () => {
      const { d, p } = await aufbau([{ dateien: basis, falscheSumme: true }]);
      await assert.rejects(p.vorschau({ id: 'basis' }), /Prüfsumme/);
      assert.deepEqual(await paketTypen(d), [], 'nur noch die Typen des DMS (System, Ablageort)');
      const alt = await aufbau([{ dateien: basis }], '0.62.0');
      const v = await alt.p.vorschau({ id: 'basis' });
      assert.equal(v.dmsOk, false);
      await assert.rejects(alt.p.installiere({ id: 'basis' }, ICH), /braucht DMS >=0\.63\.0/);
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
      const pakete = await d.listePakete();
      assert.deepEqual(pakete.map((x) => x.id), ['basis', 'vertraege']);
      const typen = await d.listeTypen();
      const vertrag = typen.find((t) => t.id === inst.typen.vertrag)!;
      assert.equal(vertrag.felder.find((f) => f.key === 'partner')!.zielTyp, pakete[0].typen.organisation);
      assert.equal(vertrag.felder.find((f) => f.key === 'letzte')!.zielTyp, inst.typen.zahlung);
      assert.deepEqual(vertrag.register.find((r) => r.key === 'zahlungen')!.quellen, [{ typId: inst.typen.zahlung, feldKey: 'vertrag' }]);
      assert.equal(typen.find((t) => t.id === inst.typen.zahlung)!.felder.find((f) => f.key === 'vertrag')!.zielTyp, vertrag.id);
      await assert.rejects(p.entferne('basis', ICH), (e) => e instanceof Fachfehler && JSON.stringify(e.details).includes('braucht'));
      await p.entferne('vertraege', ICH);
      await p.entferne('basis', ICH);
      assert.deepEqual(await paketTypen(d), [], 'nur noch die Typen des DMS (System, Ablageort)');
    });

    it('Namenskonflikt mit Vorschlag; ein Fehler lässt nichts halb angelegt', async () => {
      const kaputt = { ...basis, 'inhalt/beispiele.yaml': '- typ: organisation\n  werte:\n    kuerzel: OHNE\n' };
      const { d, p } = await aufbau([{ dateien: kaputt }]);
      await d.legeTypAn({ name: 'Organisation', felder: [{ key: 'name', label: 'Name', typ: 'text' }] });
      const v = await p.vorschau({ id: 'basis' });
      assert.equal(v.typen[0].konflikt, 'Einen Mappentyp „Organisation“ gibt es schon.');
      assert.equal(v.typen[0].vorschlag, 'Organisation (Basis)');
      await assert.rejects(p.installiere({ id: 'basis' }, ICH), (e) => e instanceof Fachfehler && e.status === 409 && JSON.stringify(e.details).includes('Organisation (Basis)'));
      const typen = (await d.listeTypen()).length, sichten = (await d.listeSichten()).length;
      // Beispiel ohne Pflichtfeld Name: alles wird zurückgenommen.
      await assert.rejects(p.installiere({ id: 'basis', namen: { organisation: 'Organisation (Basis)' }, beispiele: true }, ICH), /Beispiel/);
      assert.equal((await d.listeTypen()).length, typen);
      assert.equal((await d.listeSichten()).length, sichten);
      assert.deepEqual(await d.listePakete(), []);
      const ok = await p.installiere({ id: 'basis', namen: { organisation: 'Organisation (Basis)' } }, ICH);
      assert.equal((await d.listeTypen()).find((t) => t.id === ok.typen.organisation)!.name, 'Organisation (Basis)');
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
      const pakete = await d.listePakete();
      const bas = pakete.find((x) => x.id === 'basis')!;
      assert.ok(bas.beispiele?.stadtwerke, 'Beispiele der Abhängigkeit kamen mit und sind gemerkt');
      assert.ok(inst.beispiele?.strom);
      const vertrag = await d.listeMappen(inst.typen.vertrag);
      const s1 = vertrag.find((m) => m.werte.nr === 'S-1')!;
      assert.equal(s1.werte.partner, bas.beispiele!.stadtwerke, 'Vertrag → Organisation aus Basis');
      assert.ok(!vertrag.find((m) => m.werte.nr === 'S-2')!.werte.partner, 'unbekanntes Ziel in der Abhängigkeit: Feld bleibt leer');
      const [z] = await d.listeMappen(inst.typen.zahlung);
      assert.equal(z.werte.vertrag, s1.id, 'Zahlung → Vertrag, obwohl sie zuerst steht');

      // Basis schon ohne Beispiele installiert: Hinweis in der Vorschau, Verweis bleibt leer.
      const zwei = await aufbau([{ dateien: b1 }, { dateien: vertraegeMitBeispielen }]);
      await zwei.p.katalog();
      await zwei.p.installiere({ id: 'basis' }, ICH);
      const v = await zwei.p.vorschau({ id: 'vertraege' });
      assert.ok(v.hinweise.some((h) => /Beispiele von „Basis“/.test(h)), v.hinweise.join(' | '));
      const i2 = await zwei.p.installiere({ id: 'vertraege', beispiele: true }, ICH);
      assert.ok(!(await zwei.d.listeMappen(i2.typen.vertrag)).find((m) => m.werte.nr === 'S-1')!.werte.partner);

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

    it('verweist mit dms:… auf Mappentypen des DMS (#310)', async () => {
      const { d, p } = await aufbau([{ dateien: ordnerpaket }], '0.75.0');
      const ablageort = (await d.ablageortTyp())!;
      const v = await p.vorschau({ id: 'ordnerpaket' });
      assert.deepEqual(v.probleme, []);
      assert.ok(v.hinweise.some((h) => /Ablageort \(aus dem DMS\)/.test(h) && /Benutzer \(aus dem DMS\)/.test(h)), v.hinweise.join(' | '));
      const ok = await p.installiere({ id: 'ordnerpaket' }, ICH);
      const urkunde = (await d.listeTypen()).find((t) => t.id === ok.typen.urkunde)!;
      assert.equal(urkunde.felder.find((f) => f.key === 'verbleib_original')!.zielTyp, ablageort.id);
      assert.equal(urkunde.felder.find((f) => f.key === 'verantwortlich')!.zielTyp, (await d.sichereSystem()).benutzer.id);
      assert.deepEqual((await d.listeSichten()).find((s) => s.id === ok.sichten.orte)!.typen.sort(), [ablageort.id, urkunde.id].sort());
      // Unbekannter DMS-Typ und reservierte Id: schon beim Lesen abgelehnt.
      const falsch = { ...ordnerpaket, 'inhalt/mappentypen.yaml': ordnerpaket['inhalt/mappentypen.yaml'].replace('dms:benutzer', 'dms:post') };
      assert.throws(() => liesPaket(liesZip(archiv(falsch))), (e) => e instanceof Fachfehler && (e.details as { gruende: string[] }).gruende.some((g) => /dms:post.*nicht mit/.test(g)));
      const dmsId = { ...ordnerpaket, 'manifest.yaml': ordnerpaket['manifest.yaml'].replace('id: ordnerpaket', 'id: dms') };
      assert.throws(() => liesPaket(liesZip(archiv(dmsId))), (e) => e instanceof Fachfehler && (e.details as { gruende: string[] }).gruende.some((g) => /reserviert/.test(g)));
    });

    it('Paket hochladen: Prüfung, Bestätigung, Herkunft, Update durch erneutes Hochladen (#189)', async () => {
      const { d, p } = await aufbau([]);
      await assert.rejects(p.hochladen(Buffer.from('kein zip'), ICH), /kein gültiges ZIP/);
      const h = await p.hochladen(archiv(basis), ICH);
      assert.equal(h.vorschau.paket.id, 'basis');
      assert.equal(h.vorschau.typen[0].dmsSchluessel, 'basis_organisation');
      assert.deepEqual((await p.vorschau({ upload: h.upload })).sichten.length, 5);
      await assert.rejects(p.installiere({ upload: h.upload }, ICH), /nicht vom DMS-Projekt geprüft/);
      const inst = await p.installiere({ upload: h.upload, bestaetigt: true, beispiele: true }, ICH);
      assert.equal(inst.herkunft.art, 'hochgeladen');
      assert.equal(inst.herkunft.art === 'hochgeladen' && inst.herkunft.von, ICH.email);
      await assert.rejects(p.installiere({ upload: h.upload, bestaetigt: true }, ICH), /abgelaufen/, 'ein Upload gilt nur einmal');
      await assert.rejects(p.aktualisiere('basis', {}, ICH), /erneutes Hochladen/);
      const gleich = await p.hochladen(archiv(basis), ICH);
      await assert.rejects(p.installiere({ upload: gleich.upload, bestaetigt: true }, ICH), /schon installiert/);
      const neu = await p.hochladen(archiv(basis11), ICH);
      assert.equal(neu.vorschau.update, true);
      const n = await p.installiere({ upload: neu.upload, bestaetigt: true }, ICH);
      assert.equal(n.version, '1.1.0');
      assert.equal(n.installiert, inst.installiert);
      assert.ok((await d.listeTypen()).find((t) => t.id === n.typen.organisation)!.felder.some((f) => f.key === 'steuernummer'));
      assert.equal((await d.listeTypen()).filter((t) => t.schluessel === 'basis_organisation').length, 1);
    });
  });
}

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
