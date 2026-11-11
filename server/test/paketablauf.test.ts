/**
 * Mehrere Pakete in einem Ablauf (#405): Abhängigkeiten mit Code nach einer Bestätigung, Ergänzungen (z. B. Sprachen
 * der Texterkennung) beim ersten Installieren und nachträglich, Beispiele je Paket, Namen nur bei Konflikten,
 * Pflicht-Einstellungen im selben Ablauf oder bewusst später, kein halb installierter Zustand.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { auswahlMitAbhaengigkeiten, ergaenzungenVon, liesErgaenzt, liesKatalog, type Katalog } from '../../shared/src/pakete';
import { speicherDateien } from '../src/dateispeicher';
import { Dienst } from '../src/dienst';
import { speicherEinstellungen } from '../src/einstellungen';
import { Fachfehler } from '../src/fehler';
import { liesPaket, Paketverwaltung, type Sammeldatei } from '../src/pakete';
import type { Repo } from '../src/repo';
import { speicherRepo } from '../src/repo-speicher';
import { zipPuffer } from '../src/zip';

const ICH = { id: '00000000-0000-4000-8000-0000000000aa', email: 'admin@example.org' };
const KATALOG = 'https://katalog.test/katalog.json';
const BASIS = fileURLToPath(new URL('./pakete/basis', import.meta.url));
/** Kleinstes WebAssembly-Modul (nur Kopf) – liesPaket prüft nur den Kopf; ohne Läufer läuft nichts. */
const WASM = '\0asm\u0001\0\0\0';

const offen: Array<{ end(): Promise<void> }> = [];
after(async () => { for (const s of offen) await s.end(); });
async function repo(pg: boolean): Promise<Repo> {
  if (!pg) return speicherRepo();
  const { ausUrl, alsUrl, legeDatenbankAn } = await import('../src/anbindung');
  const { verbinde, migriere } = await import('../src/db');
  const { pgRepo } = await import('../src/repo-pg');
  const a = { ...ausUrl(process.env.TEST_DATABASE_URL)!, datenbank: `dms_pa_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}` };
  await legeDatenbankAn(a);
  const sql = verbinde(alsUrl(a));
  // Danach wieder weg: die eigene Testdatenbank löschen.
  offen.push({ end: async () => { await sql.end(); const w = verbinde(alsUrl(a, 'postgres')); await w.unsafe(`DROP DATABASE IF EXISTS "${a.datenbank}"`).catch(() => {}); await w.end(); } });
  await migriere(sql, new URL('../migrations', import.meta.url).pathname, () => {});
  await sql`INSERT INTO haushalte (id, name) VALUES ('00000000-0000-4000-8000-000000000001', 'Test') ON CONFLICT DO NOTHING`;
  await sql`INSERT INTO benutzer (id, haushalt_id, email, name, rolle) VALUES (${ICH.id}, '00000000-0000-4000-8000-000000000001', ${ICH.email}, 'Admin', 'admin') ON CONFLICT DO NOTHING`;
  return pgRepo(sql, '00000000-0000-4000-8000-000000000001') as never;
}

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
const kopf = (id: string, version: string, rest = '') => `schema: 1\nid: ${id}\nname: ${id[0].toUpperCase()}${id.slice(1)}\nversion: ${version}\nbeschreibung: Test.\nautor: { name: Test, github: test }\nlizenz: MIT\ndms: ">=0.133.0"\n${rest}`;

/** Grundpaket mit Code (wie die Texterkennung): liest Dokumente, kein Netz. */
const grund = (version = '1.0.0', rechte = 'dokumente: lesen') => ({
  'manifest.yaml': kopf('grund', version, `inhalt: {}\ncode:\n  sprache: c\n  ereignisse: []\n  rechte: { ${rechte} }\n  netz: []\n`),
  'code/modul.wasm': WASM,
});
/** Zusatzsprache: Code ohne Rechte, ergänzt das Grundpaket (#405). */
const sprache = (k: string, version = '1.0.0') => ({
  'manifest.yaml': kopf(`grund_${k}`, version, `abhaengigkeiten:\n  grund: ">=1.0.0"\nergaenzt: { paket: grund, gruppe: Weitere Sprachen }\ninhalt: {}\ncode:\n  sprache: c\n  ereignisse: []\n  rechte: { dokumente: keine }\n  netz: []\n`),
  'code/modul.wasm': WASM,
});
/** Paket mit Pflicht-Einstellungen, darunter eine Dienst-Adresse (wie der KI-Assistent). */
const dienstpaket = {
  'manifest.yaml': kopf('dienst', '1.0.0', [
    'inhalt: {}', 'code:', '  sprache: c', '  ereignisse: []', '  rechte: { dokumente: keine }', '  netz: []', '  einstellungen:', '    - abschnitt: Dienst', '      felder:',
    '        - { schluessel: adresse, name: Adresse, typ: adresse, pflicht: true, beispiel: "http://ollama:11434/v1" }',
    '        - { schluessel: modell, name: Modell, typ: text, pflicht: true }',
    '        - { schluessel: schluessel, name: Schlüssel, typ: geheim }',
    '        - { schluessel: grenze, name: Grenze, typ: zahl, standard: 5 }', '',
  ].join('\n')),
  'code/modul.wasm': WASM,
};
const basis = ordner(BASIS);
/** Zweites Paket mit Beispielen und einem Typ, dessen Name mit einem vorhandenen kollidiert. */
const kontakte = {
  'manifest.yaml': kopf('kontakte', '1.0.0', 'inhalt:\n  mappentypen: inhalt/mappentypen.yaml\n  sichten: inhalt/sichten.yaml\n  beispiele: inhalt/beispiele.yaml\n'),
  'inhalt/mappentypen.yaml': '- schluessel: kontakt\n  name: Kontakt\n  titelVorlage: "{name}"\n  felder:\n    - { key: name, label: Name, typ: text, pflicht: true }\n  register:\n    - { key: daten, name: Daten, art: felder, felder: [name] }\n',
  'inhalt/sichten.yaml': '- { schluessel: kontakte, name: Kontakte, typen: [kontakt] }\n',
  'inhalt/beispiele.yaml': '- typ: kontakt\n  werte: { name: Lena }\n- typ: kontakt\n  werte: { name: Jonas }\n',
};

/** Katalog im Arbeitsspeicher mit code und ergaenzt wie aus katalog.py; daten: Adresse → Inhalt (änderbar). */
function katalog(eintraege: Array<Record<string, string>>, daten = new Map<string, Buffer>()) {
  const pakete = new Map<string, Katalog['pakete'][number]>();
  for (const d of eintraege) {
    const m = liesPaket(new Map(Object.entries(d).map(([n, x]) => [n, Buffer.from(x)]))).manifest;
    const b = archiv(d);
    daten.set(`https://katalog.test/archive/${m.id}-${m.version}.zip`, b);
    const p = pakete.get(m.id) ?? { id: m.id, name: m.name, beschreibung: m.beschreibung, autor: m.autor, lizenz: m.lizenz, aktuell: m.version, versionen: [] };
    p.versionen = [{ version: m.version, dms: m.dms, abhaengigkeiten: m.abhaengigkeiten, inhalt: { mappentypen: [], sichten: [], beispiele: 0 }, code: m.code !== undefined, archiv: `archive/${m.id}-${m.version}.zip`, sha256: sha(b), groesse: b.length, veroeffentlicht: '2026-11-01T00:00:00Z', quelle: '', readme: '', changelog: '', ...(m.ergaenzt ? { ergaenzt: m.ergaenzt } : {}) }, ...p.versionen.filter((v) => v.version !== m.version)];
    p.aktuell = p.versionen.map((v) => v.version).sort().at(-1)!;
    pakete.set(m.id, p);
  }
  daten.set(KATALOG, Buffer.from(JSON.stringify({ format: 1, erstellt: '', quelle: '', pakete: [...pakete.values()] })));
  return daten;
}

async function aufbau(pg: boolean, eintraege: Array<Record<string, string>>, daten = new Map<string, Buffer>()) {
  katalog(eintraege, daten);
  const d = new Dienst(await repo(pg), speicherDateien(), { einstellungen: speicherEinstellungen() });
  const p = new Paketverwaltung(d, { version: () => '0.151.0', abruf: async (url) => { const b = daten.get(url); if (!b) throw new Error(`404 ${url}`); return b; }, katalogUrl: KATALOG, benutzer: async () => [] });
  return { d, p, daten };
}
const fehlerMit = (status: number, re: RegExp) => (e: unknown) => e instanceof Fachfehler && e.status === status && re.test([e.message, ...((e.details as { gruende?: string[] } | undefined)?.gruende ?? [])].join(' '));

describe('Ergänzungen im Paketformat (#405)', () => {
  it('ergaenzt im Manifest: Kurzform, mit Gruppe, muss unter abhaengigkeiten stehen', () => {
    assert.deepEqual(liesErgaenzt('grund', { grund: '>=1.0.0' }), { ergaenzt: { paket: 'grund' }, fehler: [] });
    assert.deepEqual(liesErgaenzt({ paket: 'grund', gruppe: ' Weitere Sprachen ' }, { grund: '>=1.0.0' }).ergaenzt, { paket: 'grund', gruppe: 'Weitere Sprachen' });
    assert.match(liesErgaenzt('grund', {}).fehler.join(), /muss auch unter abhaengigkeiten stehen/);
    assert.match(liesErgaenzt({ paket: 'grund', farbe: 'rot' }, { grund: '1.0.0' }).fehler.join(), /„farbe“ gibt es nicht/);
    assert.match(liesErgaenzt({ paket: 'grund', gruppe: 'x'.repeat(41) }, { grund: '1.0.0' }).fehler.join(), /höchstens 40 Zeichen/);
    const m = liesPaket(new Map(Object.entries(sprache('fra')).map(([n, x]) => [n, Buffer.from(x)]))).manifest;
    assert.deepEqual(m.ergaenzt, { paket: 'grund', gruppe: 'Weitere Sprachen' });
    const ohne = { ...sprache('fra'), 'manifest.yaml': sprache('fra')['manifest.yaml'].replace('abhaengigkeiten:\n  grund: ">=1.0.0"\n', '') };
    assert.throws(() => liesPaket(new Map(Object.entries(ohne).map(([n, x]) => [n, Buffer.from(x)]))), fehlerMit(422, /ergaenzt: „grund“ muss auch unter abhaengigkeiten stehen/));
  });

  it('Katalog: ergaenzt bleibt erhalten, ungültig zählt nicht; Angebot ohne Installierte, nach Gruppe', () => {
    const daten = katalog([grund(), sprache('fra'), sprache('ita'), dienstpaket]);
    const k = liesKatalog(JSON.parse(daten.get(KATALOG)!.toString()));
    assert.deepEqual(ergaenzungenVon(k, 'grund', '0.151.0').map((x) => [x.id, x.gruppe, x.code]), [['grund_fra', 'Weitere Sprachen', true], ['grund_ita', 'Weitere Sprachen', true]]);
    assert.deepEqual(ergaenzungenVon(k, 'grund', '0.151.0', [{ id: 'grund_fra' }]).map((x) => x.id), ['grund_ita']);
    const roh = JSON.parse(daten.get(KATALOG)!.toString());
    roh.pakete.find((p: { id: string }) => p.id === 'grund_ita').versionen[0].ergaenzt = { paket: 'gibtsnicht' };
    assert.deepEqual(ergaenzungenVon(liesKatalog(roh), 'grund', '0.151.0').map((x) => x.id), ['grund_fra'], 'ungültig: nicht als Häkchen, aber installierbar');
    assert.equal(liesKatalog(roh).pakete.find((p) => p.id === 'grund_ita')?.versionen.length, 1);
    // Bestimmte Version für ein selbst gewähltes Paket.
    const zwei = liesKatalog(JSON.parse(katalog([grund(), grund('1.1.0')]).get(KATALOG)!.toString()));
    assert.equal(auswahlMitAbhaengigkeiten(zwei, ['grund'], '0.151.0').pakete[0].version, '1.1.0');
    assert.equal(auswahlMitAbhaengigkeiten(zwei, ['grund'], '0.151.0', [], { grund: '1.0.0' }).pakete[0].version, '1.0.0');
  });
});

function faelle(pg: boolean) {
  describe(`Mehrere Pakete in einem Ablauf (#405)${pg ? ' – PostgreSQL' : ''}`, { skip: pg && !process.env.TEST_DATABASE_URL && 'ohne TEST_DATABASE_URL' }, () => {
    it('Abhängigkeit mit Code: eine Bestätigung nennt jedes Recht; ohne sie wird nichts installiert', async () => {
      const { d, p } = await aufbau(pg, [grund(), sprache('fra'), sprache('ita')]);
      // Bisher: 409 „Abhängigkeit enthält Code – bitte zuerst selbst installieren“.
      await assert.rejects(p.installiere({ id: 'grund_fra', mitAbhaengigkeiten: true, rechteBestaetigt: true }, ICH), fehlerMit(409, /enthält Code/));
      const plan = await p.ablaufPlan({ pakete: ['grund_fra', 'grund_ita'] });
      assert.deepEqual(plan.pakete.map((x) => [x.id, x.gewaehlt, x.fuer]), [['grund', false, ['grund_fra', 'grund_ita']], ['grund_fra', true, []], ['grund_ita', true, []]]);
      assert.deepEqual(plan.pakete.map((x) => x.ergaenzt?.paket ?? null), [null, 'grund', 'grund']);
      assert.equal(plan.rechte.bestaetigen, true);
      assert.deepEqual(plan.probleme, []);
      assert.equal(plan.pakete[1].vorschau.abhaengigkeiten[0].verfuegbar, '1.0.0', 'die Abhängigkeit kommt im selben Ablauf');
      // Ohne Bestätigung: 409 mit allen Rechten aller Pakete, nichts installiert.
      await assert.rejects(p.ablaufInstallieren({ pakete: ['grund_fra', 'grund_ita'] }, ICH), (e) => {
        const r = (e as Fachfehler).details as { rechte: string[]; rechteStand: string };
        assert.equal(r.rechteStand, plan.rechte.stand);
        assert.ok(r.rechte.some((z) => z.startsWith('Grund: Dokumente lesen')), r.rechte.join('\n'));
        assert.ok(r.rechte.some((z) => z.startsWith('Grund_fra: kein Zugriff auf Netzwerk')), r.rechte.join('\n'));
        return true;
      });
      assert.deepEqual(await d.kern.repo.listePakete(), []);
      const erg = await p.ablaufInstallieren({ pakete: ['grund_fra', 'grund_ita'], rechteStand: plan.rechte.stand }, ICH);
      assert.deepEqual(erg.installiert.map((x) => x.id), ['grund', 'grund_fra', 'grund_ita']);
      assert.equal(erg.fehler, null);
      // Jedes Paket behält seine eigenen Rechte (eigenes Dienstkonto im Läufer).
      const inst = await d.kern.repo.listePakete();
      assert.deepEqual(inst.map((x) => [x.id, x.laeufer?.rechte.dokumente]), [['grund', 'lesen'], ['grund_fra', 'keine'], ['grund_ita', 'keine']]);
      assert.equal((await p.installierte()).find((x) => x.id === 'grund_fra')!.version, '1.0.0', 'jede Sprache bleibt ein eigenes Paket mit eigener Version');
    });

    it('Ergänzung nachträglich am installierten Paket; schon installiert zählt als Problem', async () => {
      const { d, p } = await aufbau(pg, [grund(), sprache('fra'), sprache('ita')]);
      const eins = await p.ablaufPlan({ pakete: ['grund'] });
      await p.ablaufInstallieren({ pakete: ['grund'], rechteStand: eins.rechte.stand }, ICH);
      const plan = await p.ablaufPlan({ pakete: ['grund_ita'] });
      assert.deepEqual(plan.pakete.map((x) => x.id), ['grund_ita'], 'das Grundpaket ist da und kommt nicht noch einmal');
      const erg = await p.ablaufInstallieren({ pakete: ['grund_ita'], rechteStand: plan.rechte.stand }, ICH);
      assert.deepEqual(erg.installiert.map((x) => x.id), ['grund_ita']);
      assert.deepEqual((await d.kern.repo.listePakete()).map((x) => x.id).sort(), ['grund', 'grund_ita']);
      const noch = await p.ablaufPlan({ pakete: ['grund'] });
      assert.match(noch.probleme.join(), /schon installiert/);
      await assert.rejects(p.ablaufInstallieren({ pakete: ['grund'] }, ICH), fehlerMit(409, /schon installiert/));
    });

    it('Rechte einer Abhängigkeit geändert → neue Bestätigung, vorher nichts installiert', async () => {
      const { d, p, daten } = await aufbau(pg, [grund(), sprache('fra')]);
      const plan = await p.ablaufPlan({ pakete: ['grund_fra'] });
      // Inzwischen gibt es Grund 1.1.0 mit mehr Rechten (z. B. Volltext schreiben).
      katalog([grund(), grund('1.1.0', 'dokumente: schreiben'), sprache('fra')], daten);
      await p.katalog();
      await assert.rejects(p.ablaufInstallieren({ pakete: ['grund_fra'], rechteStand: plan.rechte.stand }, ICH), (e) => {
        assert.ok(e instanceof Fachfehler && e.status === 409);
        assert.match(e.message, /seit deiner Bestätigung geändert/);
        const r = e.details as { rechte: string[]; rechteStand: string };
        assert.notEqual(r.rechteStand, plan.rechte.stand);
        assert.ok(r.rechte.some((z) => /Grund: Dokumente lesen und Volltext schreiben/.test(z)));
        return true;
      });
      assert.deepEqual(await d.kern.repo.listePakete(), []);
      const neu = await p.ablaufPlan({ pakete: ['grund_fra'] });
      const erg = await p.ablaufInstallieren({ pakete: ['grund_fra'], rechteStand: neu.rechte.stand }, ICH);
      assert.deepEqual(erg.installiert.map((x) => `${x.id}@${x.version}`), ['grund@1.1.0', 'grund_fra@1.0.0']);
    });

    it('mehrere Pakete: Beispiele je Paket, Namen nur bei Konflikt, Einstellungen im Ablauf oder später', async () => {
      const { d, p } = await aufbau(pg, [basis, kontakte, dienstpaket, grund()]);
      await d.mappentypen.legeTypAn({ name: 'Kontakt', felder: [{ key: 'name', label: 'Name', typ: 'text' }] });
      const plan = await p.ablaufPlan({ pakete: ['basis', 'kontakte', 'dienst', 'grund'] });
      assert.deepEqual(plan.probleme, []);
      const pk = (id: string) => plan.pakete.find((x) => x.id === id)!;
      assert.deepEqual(pk('kontakte').vorschau.typen.map((x) => [x.name, x.vorschlag]), [['Kontakt', 'Kontakt (Kontakte)']], 'nur der Konflikt braucht einen Namen');
      assert.equal(pk('basis').vorschau.typen[0].konflikt, null);
      assert.deepEqual(pk('dienst').einstellungen.map((f) => f.schluessel), ['adresse', 'modell'], 'nur Pflichtfelder ohne Vorgabe');
      assert.deepEqual(pk('basis').einstellungen, []);
      assert.deepEqual(plan.pakete.filter((x) => x.vorschau.beispiele > 0).map((x) => x.id), ['basis', 'kontakte']);
      // Namenskonflikt: nichts installiert.
      await assert.rejects(p.ablaufInstallieren({ pakete: ['basis', 'kontakte', 'dienst', 'grund'], rechteStand: plan.rechte.stand, spaeter: ['dienst'] }, ICH), fehlerMit(409, /Kontakt \(Kontakte\)/));
      const namen = { kontakte: { kontakt: 'Kontakt (Kontakte)' } };
      // Einstellungen fehlen und nicht „später“: 422 je Feld, nichts installiert.
      await assert.rejects(p.ablaufInstallieren({ pakete: ['basis', 'kontakte', 'dienst', 'grund'], rechteStand: plan.rechte.stand, namen, einstellungen: { dienst: { adresse: 'http://ollama:11434/v1' } } }, ICH), (e) => {
        assert.ok(e instanceof Fachfehler && e.status === 422);
        assert.deepEqual(Object.keys((e.details as { felderFehler: Record<string, string> }).felderFehler), ['dienst.modell']);
        return true;
      });
      // Dienst-Adresse ohne Bestätigung: 409, nichts installiert.
      const einstellungen = { dienst: { adresse: 'http://ollama:11434/v1', modell: 'klein' } };
      await assert.rejects(p.ablaufInstallieren({ pakete: ['basis', 'kontakte', 'dienst', 'grund'], rechteStand: plan.rechte.stand, namen, einstellungen }, ICH), fehlerMit(409, /Dienst-Adressen bestätigen.*ollama/));
      assert.deepEqual(await d.kern.repo.listePakete(), []);
      const erg = await p.ablaufInstallieren({ pakete: ['basis', 'kontakte', 'dienst', 'grund'], rechteStand: plan.rechte.stand, namen, einstellungen, adresseBestaetigt: true, beispiele: ['kontakte'] }, ICH);
      assert.deepEqual(erg.installiert.map((x) => [x.id, x.einstellungen]), [['basis', 'keine'], ['kontakte', 'keine'], ['dienst', 'fertig'], ['grund', 'keine']]);
      const inst = await p.installierte();
      assert.equal(inst.find((x) => x.id === 'dienst')!.einstellungenNoetig, false);
      assert.deepEqual(await p.einstellungenFuerPaket('dienst'), { adresse: 'http://ollama:11434/v1', modell: 'klein', schluessel: null, grenze: 5 });
      const typen = await d.mappentypen.listeTypen();
      const kontaktTyp = typen.find((x) => x.id === inst.find((y) => y.id === 'kontakte')!.typen.kontakt)!;
      assert.equal(kontaktTyp.name, 'Kontakt (Kontakte)');
      assert.equal((await d.listeMappen(kontaktTyp.id)).length, 2, 'Beispiele nur für Kontakte');
      assert.equal((await d.listeMappen(inst.find((y) => y.id === 'basis')!.typen.organisation)).length, 0, 'für Basis abgewählt');
    });

    it('Einstellungen später: installiert mit „Einstellungen nötig“', async () => {
      const { p } = await aufbau(pg, [dienstpaket]);
      const plan = await p.ablaufPlan({ pakete: ['dienst'] });
      const erg = await p.ablaufInstallieren({ pakete: ['dienst'], rechteStand: plan.rechte.stand, spaeter: ['dienst'] }, ICH);
      assert.deepEqual(erg.installiert.map((x) => x.einstellungen), ['spaeter']);
      assert.equal((await p.installierte())[0].einstellungenNoetig, true);
    });

    it('Namenskonflikt zwischen zwei Paketen desselben Ablaufs', async () => {
      const zweite = { ...kontakte, 'manifest.yaml': kontakte['manifest.yaml'].replace('id: kontakte', 'id: adressen').replace('name: Kontakte', 'name: Adressen') };
      const { p } = await aufbau(pg, [kontakte, zweite]);
      const plan = await p.ablaufPlan({ pakete: ['kontakte', 'adressen'] });
      const konflikte = plan.pakete.flatMap((x) => [...x.vorschau.typen, ...x.vorschau.sichten].filter((y) => y.konflikt).map((y) => `${x.id}:${y.name}`));
      assert.deepEqual(konflikte.sort(), ['adressen:Kontakt', 'adressen:Kontakte'], 'das zweite Paket stößt auf die Namen des ersten');
      const erg = await p.ablaufInstallieren({ pakete: ['kontakte', 'adressen'], namen: { adressen: { kontakt: 'Person' } }, sichtNamen: { adressen: { kontakte: 'Personen' } } }, ICH);
      assert.deepEqual(erg.installiert.map((x) => x.id), ['kontakte', 'adressen']);
    });

    it('fünf Pakete, das vierte scheitert: 1–3 und 5 sind installiert, was es braucht, fällt mit Grund weg (#646)', async () => {
      const leer = (id: string, rest = '') => ({ 'manifest.yaml': kopf(id, '1.0.0', `${rest}inhalt: {}\n`) });
      const kaputt = { ...kontakte, 'manifest.yaml': kontakte['manifest.yaml'].replace('id: kontakte', 'id: dritte'), 'inhalt/beispiele.yaml': '- typ: kontakt\n  werte: { gibtsnicht: 1 }\n' };
      const { d, p } = await aufbau(pg, [leer('eins'), leer('zwei'), leer('drei'), kaputt, leer('fuenf'), leer('sechs', 'abhaengigkeiten:\n  dritte: ">=1.0.0"\n')]);
      const wahl = ['eins', 'zwei', 'drei', 'dritte', 'fuenf', 'sechs'];
      const plan = await p.ablaufPlan({ pakete: wahl });
      assert.equal(plan.ausgelassen, undefined);
      const erg = await p.ablaufInstallieren({ pakete: wahl, rechteStand: plan.rechte.stand, beispiele: ['dritte'] }, ICH);
      assert.deepEqual(erg.installiert.map((x) => x.id).sort(), ['drei', 'eins', 'fuenf', 'zwei']);
      assert.deepEqual(erg.fehlgeschlagen.map((x) => x.id), ['dritte']);
      assert.equal(erg.fehler?.id, 'dritte');
      assert.deepEqual(erg.nichtInstalliert.map((x) => [x.id, x.grund]), [['sechs', 'braucht „Kontakte“, das sich nicht installieren ließ']]);
      assert.deepEqual((await d.kern.repo.listePakete()).map((x) => x.id).sort(), ['drei', 'eins', 'fuenf', 'zwei']);
    });

    it('ein Paket lässt sich nicht laden: nur es und was es braucht fallen weg, die übrigen lassen sich installieren (#646)', async () => {
      const daten = new Map<string, Buffer>();
      const leer = (id: string, rest = '') => ({ 'manifest.yaml': kopf(id, '1.0.0', `${rest}inhalt: {}\n`) });
      const { d, p } = await aufbau(pg, [leer('eins'), leer('gross'), leer('nutzt', 'abhaengigkeiten:\n  gross: ">=1.0.0"\n'), leer('fuenf')], daten);
      daten.delete('https://katalog.test/archive/gross-1.0.0.zip');
      const wahl = ['eins', 'gross', 'nutzt', 'fuenf'];
      const plan = await p.ablaufPlan({ pakete: wahl });
      assert.deepEqual(plan.pakete.map((x) => x.id).sort(), ['eins', 'fuenf']);
      assert.deepEqual(plan.ausgelassen?.map((x) => x.id), ['gross', 'nutzt']);
      assert.match(plan.ausgelassen![0].grund, /lässt sich nicht herunterladen/);
      assert.match(plan.ausgelassen![1].grund, /braucht „Gross“/);
      assert.deepEqual(plan.probleme, []);
      const erg = await p.ablaufInstallieren({ pakete: wahl, rechteStand: plan.rechte.stand }, ICH);
      assert.deepEqual(erg.installiert.map((x) => x.id).sort(), ['eins', 'fuenf']);
      assert.deepEqual(erg.nichtInstalliert.map((x) => x.id), ['gross', 'nutzt']);
      assert.deepEqual((await d.kern.repo.listePakete()).map((x) => x.id).sort(), ['eins', 'fuenf']);
    });

    it('Fehler bei einem Paket: es ist zurückgenommen, die davor bleiben, was es braucht, kommt nicht dran', async () => {
      const kaputt = { ...kontakte, 'inhalt/beispiele.yaml': '- typ: kontakt\n  werte: { gibtsnicht: 1 }\n' };
      const nachher = { ...sprache('fra'), 'manifest.yaml': sprache('fra')['manifest.yaml'].replace('grund: ">=1.0.0"', 'kontakte: ">=1.0.0"').replace('paket: grund', 'paket: kontakte') };
      const { d, p } = await aufbau(pg, [grund(), kaputt, nachher]);
      const plan = await p.ablaufPlan({ pakete: ['grund', 'grund_fra'] });
      assert.deepEqual(plan.pakete.map((x) => x.id), ['grund', 'kontakte', 'grund_fra']);
      const typenVorher = (await d.mappentypen.listeTypen()).length;
      const erg = await p.ablaufInstallieren({ pakete: ['grund', 'grund_fra'], rechteStand: plan.rechte.stand, beispiele: ['kontakte'] }, ICH);
      assert.deepEqual(erg.installiert.map((x) => x.id), ['grund']);
      assert.equal(erg.fehler?.id, 'kontakte');
      assert.match(erg.fehler!.meldung, /Beispiel/);
      assert.deepEqual(erg.nichtInstalliert.map((x) => x.id), ['grund_fra']);
      assert.deepEqual((await d.kern.repo.listePakete()).map((x) => x.id), ['grund']);
      assert.equal((await d.mappentypen.listeTypen()).length, typenVorher, 'vom gescheiterten Paket bleibt kein Mappentyp');
    });
  });
}
faelle(false);
faelle(true);

describe('Sammeldatei im selben Ablauf (#405, #461)', () => {
  it('eine Herkunfts-Bestätigung und eine Rechte-Bestätigung für alle Pakete der Datei', async () => {
    const d = new Dienst(speicherRepo(), speicherDateien(), { einstellungen: speicherEinstellungen() });
    const p = new Paketverwaltung(d, { version: () => '0.151.0', abruf: async () => { throw new Error('ohne Internet'); }, katalogUrl: KATALOG });
    const inhalt = new Map<string, Buffer>();
    const eintraege = [grund(), sprache('fra'), sprache('ita')].map((x) => {
      const m = liesPaket(new Map(Object.entries(x).map(([n, y]) => [n, Buffer.from(y)]))).manifest;
      const b = archiv(x);
      inhalt.set(`pakete/${m.id}-${m.version}.zip`, b);
      return { id: m.id, version: m.version, name: m.name, archiv: `pakete/${m.id}-${m.version}.zip`, sha256: sha(b), groesse: b.length, gewaehlt: m.id !== 'grund' };
    });
    inhalt.set('sammeldatei.json', Buffer.from(JSON.stringify({ format: 1, art: 'dms-sammeldatei', erstellt: '2026-11-01T12:00:00Z', quelle: '', katalog: KATALOG, dms: '0.151.0', pakete: eintraege })));
    const r = await p.hochladenDatei(zipPuffer([...inhalt].map(([name, daten]) => ({ name, daten }))), ICH) as { sammeldatei: Sammeldatei };
    assert.deepEqual(r.sammeldatei.pakete.map((x) => [x.id, x.ergaenzt?.paket ?? null]), [['grund', null], ['grund_fra', 'grund'], ['grund_ita', 'grund']]);
    const uploads = r.sammeldatei.pakete.map((x) => x.upload);
    // Ohne das Grundpaket fehlt eine Abhängigkeit, die weder installiert noch in der Auswahl ist.
    assert.match((await p.ablaufPlan({ uploads: uploads.slice(1) })).probleme.join(), /weder installiert noch in der Sammeldatei/);
    const plan = await p.ablaufPlan({ uploads });
    assert.equal(plan.herkunftBestaetigen, true);
    await assert.rejects(p.ablaufInstallieren({ uploads, rechteStand: plan.rechte.stand }, ICH), fehlerMit(409, /Herkunft bestätigen/));
    const erg = await p.ablaufInstallieren({ uploads, rechteStand: plan.rechte.stand, bestaetigt: true }, ICH);
    assert.deepEqual(erg.installiert.map((x) => x.id), ['grund', 'grund_fra', 'grund_ita']);
    assert.deepEqual((await d.kern.repo.listePakete()).map((x) => x.herkunft.art), ['hochgeladen', 'hochgeladen', 'hochgeladen']);
    await assert.rejects(p.ablaufPlan({ uploads }), fehlerMit(410, /abgelaufen/), 'Upload-Kennungen gelten nur bis zur Installation');
  });
});

describe('Anzeige wie im Katalog (#645)', () => {
  it('Symbol, Kürzel und Kategorien werden übernommen, Ungültiges weggelassen', () => {
    const v = { version: '1.0.0', sha256: 'a'.repeat(64), archiv: 'archive/x-1.0.0.zip', dms: '>=0.1.0' };
    const k = liesKatalog({ format: 1, erstellt: '', quelle: '', pakete: [
      { id: 'texterkennung_fra', name: 'Französisch', versionen: [v], symbol: 'languages', kuerzel: 'fr', kategorien: ['sprachen', 'volltext'] },
      { id: 'boese', name: 'Böse', versionen: [v], symbol: '<svg onload=x>', kuerzel: 'ABCD', kategorien: ['ok', 'Nicht Gültig', 3] },
    ] });
    const fra = k.pakete.find((p) => p.id === 'texterkennung_fra')!;
    assert.equal(fra.symbol, 'languages'); assert.equal(fra.kuerzel, 'FR'); assert.deepEqual(fra.kategorien, ['sprachen', 'volltext']);
    const b = k.pakete.find((p) => p.id === 'boese')!;
    assert.equal(b.symbol, undefined); assert.equal(b.kuerzel, undefined); assert.deepEqual(b.kategorien, ['ok']);
  });
});
