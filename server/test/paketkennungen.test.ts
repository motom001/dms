/**
 * Pakete und Kennungen (#1084): Ergänzungen mit Punkt, Herausgeber (Anzeige, Herkunftsprüfung), Umzug auf eine neue Id
 * per `ersetzt` – gleiche Installation, keine doppelten Einträge.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { describe, it } from 'node:test';
import { ergaenzungenVon, liesKatalog, type Katalog } from '../../shared/src/pakete';
import { speicherDateien } from '../src/dateispeicher';
import { Dienst } from '../src/dienst';
import { speicherEinstellungen } from '../src/einstellungen';
import { Fachfehler } from '../src/fehler';
import { liesPaket, liesZip, Paketverwaltung } from '../src/pakete';
import type { Repo } from '../src/repo';
import { speicherRepo } from '../src/repo-speicher';
import { zipPuffer } from '../src/zip';
import { eigeneDatenbank } from './hilfe-db';

const ICH = { id: '00000000-0000-4000-8000-0000000000aa', email: 'admin@example.org' };
const KATALOG = 'https://katalog.test/katalog.json';
const HAUSHALT = '00000000-0000-4000-8000-000000000001';

const archiv = (d: Record<string, string>) => zipPuffer(Object.entries(d).map(([name, inhalt]) => ({ name, daten: Buffer.from(inhalt) })), new Date('2026-01-01T12:00:00Z'));
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
const gruende = (re: RegExp) => (e: unknown) => e instanceof Fachfehler && [e.message, ...((e.details as { gruende?: string[] })?.gruende ?? [])].some((g) => re.test(g));

/** Ein kleines Paket: Manifest-Zeilen dazu, optional ein Mappentyp. */
function paket(id: string, version: string, extra = '', typ = false): Record<string, string> {
  return {
    'manifest.yaml': `schema: 1\nid: ${id}\nname: ${id}\nversion: ${version}\nbeschreibung: Test.\nautor: { name: Test, github: test }\nlizenz: MIT\ndms: ">=0.60.0"\n${extra}${typ ? 'inhalt:\n  mappentypen: inhalt/mappentypen.yaml\n' : ''}`,
    ...(typ ? { 'inhalt/mappentypen.yaml': '- schluessel: sprache\n  name: Sprache\n  felder:\n    - { key: name, label: Name, typ: text }\n  register:\n    - { key: daten, name: Daten, art: felder, felder: [name] }\n' } : {}),
  };
}

/** Katalog im Arbeitsspeicher; je Paket optional Herausgeber und frühere Ids (wie dms-registry #173 sie liefern soll). */
function katalog(eintraege: Array<{ dateien: Record<string, string>; herausgeber?: string; ersetzt?: string[] }>) {
  const daten = new Map<string, Buffer>();
  const pakete: Katalog['pakete'] = [];
  for (const e of eintraege) {
    const id = /^id: (\S+)$/m.exec(e.dateien['manifest.yaml'])![1], version = /^version: (\S+)$/m.exec(e.dateien['manifest.yaml'])![1];
    const b = archiv(e.dateien);
    daten.set(`https://katalog.test/archive/${id}-${version}.zip`, b);
    const abh: Record<string, string> = {};
    for (const z of /abhaengigkeiten:\n((?: {2}\S+: .+\n)*)/.exec(e.dateien['manifest.yaml'])?.[1]?.split('\n').filter(Boolean) ?? []) { const [k, v] = z.trim().split(': '); abh[k] = v.replace(/"/g, ''); }
    const ergaenzt = /^ergaenzt: (\S+)$/m.exec(e.dateien['manifest.yaml'])?.[1];
    const v = { version, dms: '>=0.60.0', abhaengigkeiten: abh, inhalt: { mappentypen: [], sichten: [], beispiele: 0 }, code: false, archiv: `archive/${id}-${version}.zip`, sha256: sha(b), groesse: b.length, veroeffentlicht: '2026-11-01T00:00:00Z', quelle: '', readme: '', changelog: '', ...(ergaenzt ? { ergaenzt: { paket: ergaenzt } } : {}) };
    const da = pakete.find((p) => p.id === id);
    if (da) { da.versionen.unshift(v); da.aktuell = version; } else pakete.push({ id, name: id, beschreibung: '', autor: { name: 'Test', github: 'test' }, lizenz: 'MIT', aktuell: version, versionen: [v], ...(e.herausgeber ? { herausgeber: e.herausgeber } : {}), ...(e.ersetzt ? { ersetzt: e.ersetzt } : {}) });
  }
  return { daten, setze: (liste: typeof pakete) => daten.set(KATALOG, Buffer.from(JSON.stringify({ format: 1, erstellt: '', quelle: '', pakete: liste }))), pakete };
}

async function repo(pg: boolean): Promise<Repo> {
  if (!pg) return speicherRepo();
  const { pgRepo } = await import('../src/repo-pg');
  const sql = (await eigeneDatenbank('pkk')).sql;
  await sql`INSERT INTO haushalte (id, name) VALUES (${HAUSHALT}, 'Test') ON CONFLICT DO NOTHING`;
  return pgRepo(sql, HAUSHALT) as never;
}

describe('Ergänzungen mit Punkt (#1084)', () => {
  it('Punkt-Id ohne ergaenzt wird abgelehnt, mit ergaenzt auf das Hauptpaket angenommen', () => {
    assert.throws(() => liesPaket(liesZip(archiv(paket('texterkennung.fra', '1.0.0')))), gruende(/ergaenzt: texterkennung/));
    assert.throws(() => liesPaket(liesZip(archiv(paket('texterkennung.fra', '1.0.0', 'abhaengigkeiten:\n  basis: "^1.0.0"\nergaenzt: basis\n')))), gruende(/ergaenzt: texterkennung/), 'ergänzt ein anderes Paket');
    const p = liesPaket(liesZip(archiv(paket('texterkennung.fra', '1.0.0', 'abhaengigkeiten:\n  texterkennung: "^2.0.0"\nergaenzt: texterkennung\nersetzt: texterkennung_fra\nherausgeber: app.ablago\n'))));
    assert.deepEqual([p.manifest.id, p.manifest.ergaenzt?.paket, p.manifest.ersetzt, p.manifest.herausgeber], ['texterkennung.fra', 'texterkennung', ['texterkennung_fra'], 'app.ablago']);
    assert.throws(() => liesPaket(liesZip(archiv(paket('vertraege', '1.0.0', 'herausgeber: Ablago\n')))), gruende(/herausgeber „Ablago“/));
    assert.throws(() => liesPaket(liesZip(archiv(paket('vertraege', '1.0.0', 'ersetzt: [vertraege]\n')))), gruende(/ersetzt/));
    // Lange sprechende Kennungen gehen jetzt (Paket bis 40, Schlüssel bis 60).
    let lang;
    try { lang = liesPaket(liesZip(archiv({ ...paket('haushalt_und_garten_mit_allem_drum_und', '1.0.0', '', true), 'inhalt/mappentypen.yaml': `- schluessel: rechnungsposition_mit_besonders_ausfuehrlicher_beschreibung\n  name: Position\n  felder:\n    - { key: ${'f'.repeat(60)}, label: F, typ: text }\n  register:\n    - { key: daten, name: Daten, art: felder }\n` }))); } catch (e) { assert.fail(JSON.stringify((e as Fachfehler).details)); }
    assert.equal(lang.typen[0].schluessel.length, 59);
  });

  it('Katalog: Herausgeber und frühere Ids; eine umgezogene Ergänzung wird nicht neu angeboten', () => {
    const k = liesKatalog({ format: 1, pakete: [
      { id: 'texterkennung', name: 'Texterkennung', versionen: [{ version: '2.0.0', sha256: '0'.repeat(64), archiv: 'a.zip' }], herausgeber: 'app.ablago' },
      { id: 'texterkennung.fra', name: 'Französisch', versionen: [{ version: '1.1.0', sha256: '0'.repeat(64), archiv: 'b.zip', abhaengigkeiten: { texterkennung: '^2.0.0' }, ergaenzt: 'texterkennung' }], herausgeber: 'app.ablago', ersetzt: ['texterkennung_fra'] },
      { id: 'kaputt', name: 'K', versionen: [{ version: '1.0.0', sha256: '0'.repeat(64), archiv: 'c.zip' }], herausgeber: 'Kein Herausgeber', ersetzt: 'kaputt' },
    ] });
    assert.equal(k.pakete.find((p) => p.id === 'texterkennung.fra')?.herausgeber, 'app.ablago');
    assert.deepEqual(k.pakete.find((p) => p.id === 'texterkennung.fra')?.ersetzt, ['texterkennung_fra']);
    assert.equal(k.pakete.find((p) => p.id === 'kaputt')?.herausgeber, undefined, 'ungültig zählt nicht');
    assert.deepEqual(ergaenzungenVon(k, 'texterkennung', '1.0.0', []).map((x) => x.id), ['texterkennung.fra']);
    assert.deepEqual(ergaenzungenVon(k, 'texterkennung', '1.0.0', [{ id: 'texterkennung_fra' }]), [], 'unter der alten Id installiert');
  });
});

for (const pg of [false, true]) {
  describe(`Herausgeber und Umzug (#1084)${pg ? ' – PostgreSQL' : ''}`, { skip: pg && !process.env.TEST_DATABASE_URL ? 'TEST_DATABASE_URL nicht gesetzt' : false }, () => {
    async function aufbau(k: ReturnType<typeof katalog>) {
      const einstellungen = speicherEinstellungen();
      const d = new Dienst(await repo(pg), speicherDateien(), { einstellungen });
      const p = new Paketverwaltung(d, { version: () => '0.230.0', abruf: async (u) => { const b = k.daten.get(u); if (!b) throw new Error(`404 ${u}`); return b; }, katalogUrl: KATALOG });
      return { d, p, einstellungen };
    }

    it('fremder Herausgeber mit derselben Id wird abgelehnt; app.ablago nur aus dem offiziellen Katalog', async () => {
      const k = katalog([{ dateien: paket('vertraege', '1.0.0') }]);
      k.setze(k.pakete);
      const { p } = await aufbau(k);
      // Bestand ohne herausgeber aus dem offiziellen Katalog: gilt als app.ablago.
      const inst = await p.installiere({ id: 'vertraege' }, ICH);
      assert.equal(inst.herausgeber, 'app.ablago');
      assert.equal((await p.installierte())[0].herausgeber, 'app.ablago');
      // Hochgeladen, gleiche Id, anderer Herausgeber: weder Vorschau noch Installation nehmen es.
      const h = await p.hochladen(archiv(paket('vertraege', '2.0.0', 'herausgeber: org.example\n')), ICH);
      assert.ok(h.vorschau.probleme.some((x) => /Ein anderes Paket „vertraege“ von app\.ablago ist schon installiert/.test(x)), h.vorschau.probleme.join(' | '));
      assert.ok(h.vorschau.fehlercodes.includes('anderer-herausgeber'));
      assert.equal(h.vorschau.paket.herausgeber, 'org.example');
      await assert.rejects(p.installiere({ upload: h.upload, bestaetigt: true }, ICH), gruende(/von app\.ablago ist schon installiert/));
      // Sich als app.ablago ausgeben geht nur aus dem offiziellen Katalog.
      const f = await p.hochladen(archiv(paket('rechnungen', '1.0.0', 'herausgeber: app.ablago\n')), ICH);
      assert.ok(f.vorschau.fehlercodes.includes('herausgeber-nicht-offiziell'));
      await assert.rejects(p.installiere({ upload: f.upload, bestaetigt: true }, ICH), gruende(/nur die offiziellen Pakete/));
      // Eigener Herausgeber, hochgeladen: angenommen und gespeichert; ein Update ohne oder mit anderem Herausgeber nicht.
      const e1 = await p.hochladen(archiv(paket('familie', '1.0.0', 'herausgeber: org.example\n')), ICH);
      assert.equal((await p.installiere({ upload: e1.upload, bestaetigt: true }, ICH)).herausgeber, 'org.example');
      const e2 = await p.hochladen(archiv(paket('familie', '1.1.0')), ICH);
      assert.ok(e2.vorschau.fehlercodes.includes('anderer-herausgeber'), 'ohne Angabe ist es nicht derselbe Herausgeber');
      const e3 = await p.hochladen(archiv(paket('familie', '1.2.0', 'herausgeber: org.example\n')), ICH);
      assert.deepEqual(e3.vorschau.probleme, []);
      assert.equal((await p.installiere({ upload: e3.upload, bestaetigt: true }, ICH)).version, '1.2.0');
    });

    it('Umzug texterkennung_fra → texterkennung.fra als Update: gleiche Installation, kein zweiter Eintrag', async () => {
      const k = katalog([
        { dateien: paket('texterkennung', '2.0.0') },
        { dateien: paket('texterkennung_fra', '1.0.0', 'abhaengigkeiten:\n  texterkennung: "^2.0.0"\nergaenzt: texterkennung\n', true) },
        { dateien: paket('texterkennung.fra', '1.1.0', 'abhaengigkeiten:\n  texterkennung: "^2.0.0"\nergaenzt: texterkennung\nersetzt: texterkennung_fra\nherausgeber: app.ablago\n', true), herausgeber: 'app.ablago', ersetzt: ['texterkennung_fra'] },
      ]);
      k.setze(k.pakete.filter((x) => x.id !== 'texterkennung.fra'));
      const { d, p, einstellungen } = await aufbau(k);
      await p.installiere({ id: 'texterkennung' }, ICH);
      const alt = await p.installiere({ id: 'texterkennung_fra' }, ICH);
      const typId = alt.typen.sprache;
      assert.equal((await d.listeTypen()).find((x) => x.id === typId)?.schluessel, 'texterkennung_fra:sprache');
      await d.legeMappeAn({ typId, werte: { name: 'Französisch' } });
      await einstellungen.schreibe('paketspeicher:texterkennung_fra', { stand: 3 });
      await einstellungen.schreibe('paket_verwehrt', { [typId]: ['texterkennung_fra'] });
      // Die Registry zieht um: neue Id mit ersetzt, die alte fehlt im Katalog.
      k.setze(k.pakete.filter((x) => x.id !== 'texterkennung_fra'));
      await p.abrufen(true);
      assert.deepEqual((await p.updates()).map((u) => [u.id, u.neu]), [['texterkennung_fra', '1.1.0']]);
      const v = await p.vorschau({ id: 'texterkennung_fra' });
      assert.equal(v.umzug, 'texterkennung_fra');
      assert.equal(v.update, true);
      assert.ok(v.hinweise.some((x) => /heißt jetzt „texterkennung\.fra“/.test(x)));
      // Neu installieren unter der neuen Id geht nicht – es ist schon da (unter der alten Id).
      await assert.rejects(p.installiere({ id: 'texterkennung.fra' }, ICH), /schon installiert/);
      const plan = await p.ablaufPlan({ pakete: ['texterkennung.fra'] });
      assert.ok(plan.probleme.some((x) => /texterkennung_fra/.test(x)), plan.probleme.join(' | '));
      const neu = await p.aktualisiere('texterkennung_fra', {}, ICH);
      assert.equal(neu.id, 'texterkennung.fra');
      assert.equal(neu.version, '1.1.0');
      assert.deepEqual(neu.ersetzt, ['texterkennung_fra']);
      assert.equal(neu.typen.sprache, typId, 'derselbe Mappentyp');
      assert.equal(neu.installiert, alt.installiert, 'dieselbe Installation');
      assert.deepEqual((await p.installierte()).map((x) => x.id).sort(), ['texterkennung', 'texterkennung.fra'], 'kein doppelter Eintrag');
      assert.equal((await d.listeTypen()).find((x) => x.id === typId)?.schluessel, 'texterkennung.fra:sprache');
      assert.equal((await d.listeMappen(typId)).length, 1, 'Mappen bleiben');
      assert.deepEqual(await einstellungen.lies('paketspeicher:texterkennung.fra'), { stand: 3 }, 'Speicher des Pakets zieht mit');
      assert.equal(await einstellungen.lies('paketspeicher:texterkennung_fra') ?? null, null);
      assert.deepEqual(await einstellungen.lies('paket_verwehrt'), { [typId]: ['texterkennung.fra'] });
      assert.deepEqual(await p.updates(), []);
    });

    it('app.ablago auch als Präfix nur offiziell; Ergänzung mit Punkt nur vom Herausgeber des Hauptpakets; Abhängigkeit über Id und Herausgeber', async () => {
      const k = katalog([{ dateien: paket('texterkennung', '2.0.0') }]);
      k.setze(k.pakete);
      const { p } = await aufbau(k);
      await p.installiere({ id: 'texterkennung' }, ICH);
      for (const h of ['app.ablago', 'app.ablago.foo']) {
        const x = await p.hochladen(archiv(paket('neu_offiziell', '1.0.0', `herausgeber: ${h}\n`)), ICH);
        assert.ok(x.vorschau.fehlercodes.includes('herausgeber-nicht-offiziell'), h);
        await assert.rejects(p.installiere({ upload: x.upload, bestaetigt: true }, ICH), gruende(/gibt sich|nur die offiziellen Pakete/));
      }
      // texterkennung.xyz eines anderen Herausgebers hängt sich nicht in die offizielle Familie.
      const xyz = await p.hochladen(archiv(paket('texterkennung.xyz', '1.0.0', 'abhaengigkeiten:\n  texterkennung: "^2.0.0"\nergaenzt: texterkennung\nherausgeber: org.example\n')), ICH);
      assert.ok(xyz.vorschau.fehlercodes.includes('ergaenzung-herausgeber'), xyz.vorschau.probleme.join(' | '));
      await assert.rejects(p.installiere({ upload: xyz.upload, bestaetigt: true }, ICH), gruende(/nicht von dessen Herausgeber/));
      // Nicht geprüfte Herausgeber stehen als solche in der Vorschau; offizielle sind belegt.
      assert.equal(xyz.vorschau.paket.herausgeberGeprueft, false);
      assert.equal((await p.vorschau({ id: 'texterkennung' })).paket.herausgeberGeprueft, true);
      // Ein fremdes Paket erfüllt keine Abhängigkeit eines Pakets eines anderen Herausgebers.
      const fremd = await p.hochladen(archiv(paket('kalender', '1.0.0', 'herausgeber: org.boese\n')), ICH);
      await p.installiere({ upload: fremd.upload, bestaetigt: true }, ICH);
      const abh = await p.hochladen(archiv(paket('termine', '1.0.0', 'abhaengigkeiten:\n  kalender: "^1.0.0"\nherausgeber: org.example\n')), ICH);
      assert.ok(abh.vorschau.fehlercodes.includes('abhaengigkeit-herausgeber'), abh.vorschau.probleme.join(' | '));
      await assert.rejects(p.installiere({ upload: abh.upload, bestaetigt: true }, ICH));
      // Vom selben Herausgeber geht es; vom Projekt (app.ablago) ebenso – texterkennung zählt für jeden.
      const gleich = await p.hochladen(archiv(paket('termine', '1.0.0', 'abhaengigkeiten:\n  kalender: "^1.0.0"\nherausgeber: org.boese\n')), ICH);
      assert.deepEqual(gleich.vorschau.probleme, []);
      const offiziell = await p.hochladen(archiv(paket('sprachhilfe', '1.0.0', 'abhaengigkeiten:\n  texterkennung: "^2.0.0"\nherausgeber: org.example\n')), ICH);
      assert.deepEqual(offiziell.vorschau.probleme, []);
    });

    it('ersetzt nur vom selben, bekannten Herausgeber', async () => {
      const k = katalog([{ dateien: paket('basis', '1.0.0') }]);
      k.setze(k.pakete);
      const { p } = await aufbau(k);
      const a = await p.hochladen(archiv(paket('altes_paket', '1.0.0')), ICH);
      await p.installiere({ upload: a.upload, bestaetigt: true }, ICH);
      // Herausgeber vorher unbekannt: kein Umzug.
      const b = await p.hochladen(archiv(paket('neues_paket', '2.0.0', 'ersetzt: altes_paket\nherausgeber: org.example\n')), ICH);
      assert.ok(b.vorschau.fehlercodes.includes('umzug-herausgeber'), b.vorschau.probleme.join(' | '));
      // Mit bekanntem, gleichem Herausgeber geht er – mit anderem nicht.
      const c = await p.hochladen(archiv(paket('eigen', '1.0.0', 'herausgeber: org.example\n')), ICH);
      await p.installiere({ upload: c.upload, bestaetigt: true }, ICH);
      const fremd = await p.hochladen(archiv(paket('eigen.neu', '2.0.0', 'abhaengigkeiten:\n  eigen: "^1.0.0"\nergaenzt: eigen\nersetzt: eigen\nherausgeber: org.fremd\n')), ICH);
      assert.ok(fremd.vorschau.probleme.length > 0);
      const gut = await p.hochladen(archiv(paket('eigen_neu', '2.0.0', 'ersetzt: eigen\nherausgeber: org.example\n')), ICH);
      assert.deepEqual(gut.vorschau.probleme, []);
      assert.equal(gut.vorschau.umzug, 'eigen');
      assert.equal((await p.installiere({ upload: gut.upload, bestaetigt: true }, ICH)).id, 'eigen_neu');
      assert.deepEqual((await p.installierte()).map((x) => x.id).sort(), ['altes_paket', 'eigen_neu']);
    });

    it('Kollisionsfall: haus + garten_pflanze und haus_garten + pflanze installieren sich nebeneinander', async () => {
      const typ = (s: string) => `- schluessel: ${s}\n  name: ${s}\n  felder:\n    - { key: name, label: Name, typ: text }\n  register:\n    - { key: daten, name: Daten, art: felder, felder: [name] }\n`;
      const haus = { ...paket('haus', '1.0.0', '', true), 'inhalt/mappentypen.yaml': typ('garten_pflanze') };
      const hausGarten = { ...paket('haus_garten', '1.0.0', '', true), 'inhalt/mappentypen.yaml': typ('pflanze').replace('name: pflanze', 'name: Pflanze im Garten') };
      const k = katalog([{ dateien: haus }, { dateien: hausGarten }]);
      k.setze(k.pakete);
      const { d, p } = await aufbau(k);
      const a = await p.installiere({ id: 'haus' }, ICH);
      const b = await p.installiere({ id: 'haus_garten' }, ICH);
      const typen = await d.listeTypen();
      assert.equal(typen.find((x) => x.id === a.typen.garten_pflanze)?.schluessel, 'haus:garten_pflanze');
      assert.equal(typen.find((x) => x.id === b.typen.pflanze)?.schluessel, 'haus_garten:pflanze');
      assert.notEqual(a.typen.garten_pflanze, b.typen.pflanze);
    });

    it('Umzug nur aus derselben Quelle: ein hochgeladenes Paket mit ersetzt übernimmt keine Katalog-Installation', async () => {
      const k = katalog([{ dateien: paket('basis', '1.0.0') }]);
      k.setze(k.pakete);
      const { p } = await aufbau(k);
      await p.installiere({ id: 'basis' }, ICH);
      const h = await p.hochladen(archiv(paket('basis.fremd', '2.0.0', 'abhaengigkeiten:\n  basis: "^1.0.0"\nergaenzt: basis\nersetzt: basis\n')), ICH);
      assert.ok(h.vorschau.fehlercodes.includes('anderer-herausgeber') || h.vorschau.fehlercodes.includes('umzug-quelle'), h.vorschau.probleme.join(' | '));
      await assert.rejects(p.installiere({ upload: h.upload, bestaetigt: true }, ICH));
      assert.deepEqual((await p.installierte()).map((x) => x.id), ['basis']);
    });
  });
}
