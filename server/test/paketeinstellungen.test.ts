/** Paket-Einstellungen (#197): Formular aus dem Manifest, Prüfung, Geheimnisse, Lebenszyklus. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { EINTRAG_ID, liesBeschreibung, pruefeWerte, ueberfuehre, zahlFehler, type Verweisquelle } from '../../shared/src/paketeinstellungen';
import { speicherDateien } from '../src/dateispeicher';
import { Dienst } from '../src/dienst';
import { speicherEinstellungen } from '../src/einstellungen';
import { Fachfehler } from '../src/fehler';
import { Paketverwaltung, type PaketLaeufer } from '../src/pakete';
import { speicherRepo } from '../src/repo-speicher';
import { Tresor } from '../src/tresor';
import { zipPuffer } from '../src/zip';
import { eigeneDatenbank } from './hilfe-db';

const ICH = { id: null, email: 'admin@example.org' };
const KATALOG = 'https://katalog.test/katalog.json';

function manifest(version: string, einstellungen: string) {
  return `schema: 1
id: zuordnung
name: Zuordnung
version: ${version}
beschreibung: Ordnet Post nach Regeln zu.
autor: { name: Test, github: test }
lizenz: MIT
dms: ">=0.60.0"
inhalt:
  mappentypen: inhalt/mappentypen.yaml
code:
  sprache: rust
  quelle: code/
  rechte: { lesen: [vorgang] }
  einstellungen:
${einstellungen}
  aktionen:
    - { schluessel: anwenden, name: Regeln jetzt anwenden, bestaetigen: true }
`;
}
const V1 = `    - abschnitt: Allgemein
      felder:
        - { schluessel: aktiv, name: Aktiv, typ: janein, standard: true }
        - { schluessel: titel, name: Titel, typ: text, standard: Post }
        - { schluessel: notiz, name: Notiz, typ: mehrzeilig }
        - { schluessel: grenze, name: Grenze, typ: zahl, min: 0, max: 10, standard: 3 }
        - { schluessel: ab, name: Ab, typ: datum }
        - { schluessel: sprache, name: Sprache, typ: auswahl, optionen: [Deutsch, Englisch], standard: Deutsch }
        - { schluessel: tage, name: Tage, typ: mehrfachauswahl, optionen: [Mo, Di, Mi] }
        - { schluessel: token, name: Token, typ: geheim, pflicht: true }
        - { schluessel: typ, name: Typ, typ: mappentyp }
        - { schluessel: feld, name: Feld, typ: feld, mappentyp: vorgang }
        - { schluessel: wer, name: Wer, typ: benutzer }
        - { schluessel: rolle, name: Rolle, typ: rolle }
        - { schluessel: sicht, name: Sicht, typ: sicht }
        - { schluessel: alt, name: Altes Feld, typ: text, standard: weg }
    - liste: regeln
      name: Regeln
      eintrag: Regel
      sortierbar: true
      felder:
        - { schluessel: absender, name: Absender enthält, typ: text, pflicht: true }
        - { schluessel: kennwort, name: Kennwort, typ: geheim }`;
const V2 = V1.replace('        - { schluessel: alt, name: Altes Feld, typ: text, standard: weg }\n', '        - { schluessel: neu, name: Neues Feld, typ: zahl, standard: 7 }\n');
const TYPEN = '- schluessel: vorgang\n  name: Vorgang\n  beschreibung: Ein Vorgang\n  titelVorlage: "{name}"\n  felder:\n    - { key: name, label: Name, typ: text }\n  register:\n    - { key: daten, name: Daten, art: felder, felder: [name] }\n';
const paket = (version: string, e: string) => ({ 'manifest.yaml': manifest(version, e), 'inhalt/mappentypen.yaml': TYPEN, 'code/main.rs': 'fn main() {}\n' });

function katalog(pakete: Array<Record<string, string>>) {
  const daten = new Map<string, Buffer>();
  const versionen = pakete.map((d) => {
    const b = zipPuffer(Object.entries(d).map(([name, x]) => ({ name, daten: Buffer.from(x) })));
    const v = /^version: (\S+)$/m.exec(d['manifest.yaml'])![1];
    daten.set(`https://katalog.test/archive/zuordnung-${v}.zip`, b);
    return { version: v, dms: '>=0.60.0', abhaengigkeiten: {}, inhalt: { mappentypen: [], sichten: [], beispiele: 0 }, code: true, archiv: `archive/zuordnung-${v}.zip`, sha256: createHash('sha256').update(b).digest('hex'), groesse: b.length, veroeffentlicht: '', quelle: '', readme: '', changelog: '' };
  }).reverse();
  daten.set(KATALOG, Buffer.from(JSON.stringify({ format: 1, erstellt: '', quelle: '', pakete: [{ id: 'zuordnung', name: 'Zuordnung', beschreibung: '', autor: { name: 'T', github: 't' }, lizenz: 'MIT', aktuell: versionen[0].version, versionen }] })));
  return async (url: string) => { const b = daten.get(url); if (!b) throw new Error(`404 ${url}`); return b; };
}

async function aufbau(laeufer?: PaketLaeufer) {
  const tresor = new Tresor(speicherEinstellungen(), join(await mkdtemp(join(tmpdir(), 'dms-pe-')), 'dms.schluessel'), () => null);
  await tresor.laden(); await tresor.erzeuge();
  const einst = speicherEinstellungen();
  const d = new Dienst(speicherRepo(), speicherDateien(), { einstellungen: einst, tresor });
  const p = new Paketverwaltung(d, { version: () => '0.66.0', abruf: katalog([paket('1.0.0', V1), paket('1.1.0', V2)]), katalogUrl: KATALOG, benutzer: async () => [{ id: 'u1', name: 'Anna' }], laeufer });
  return { d, p, einst };
}

describe('Zahlen in Paket-Einstellungen (#657)', () => {
  const code = (feld: Record<string, unknown>) => ({ einstellungen: [{ abschnitt: 'Lesen', felder: [{ schluessel: 'dpi', name: 'Auflösung (dpi)', typ: 'zahl', min: 150, max: 400, ...feld }] }] });
  const q = { typen: [], benutzer: [], rollen: [], sichten: [], typVon: () => null };

  it('Buchstaben, unter min und über max werden abgelehnt – mit Bereich in der Meldung', () => {
    const b = liesBeschreibung(code({ standard: 300 })).beschreibung!;
    for (const v of ['456fggdhf', '12a', 'abc', 100, '401']) assert.equal(pruefeWerte(b, { dpi: v }, q).fehler.dpi, 'Bitte eine Zahl zwischen 150 und 400.', String(v));
    assert.equal(pruefeWerte(b, { dpi: '300' }, q).werte.dpi, 300);
    assert.equal(pruefeWerte(b, { dpi: 250 }, q).werte.dpi, 250);
    assert.equal(zahlFehler({ min: 0.5 }, '0,75'), null, 'Komma als Dezimaltrennzeichen');
    assert.equal(zahlFehler({ schritt: 1 }, '2,5'), 'Bitte eine ganze Zahl.');
    assert.equal(zahlFehler({ min: 150, schritt: 50 }, '275'), 'Bitte in Schritten von 50.');
  });

  it('vorschlaege: Auswahl mit Beschriftung, in min/max, Vorgabe ist einer davon; ohne vorschlaege ein Zahlenfeld', () => {
    const vorschlaege = [{ wert: 150, name: 'gering – schneller' }, { wert: 300, name: 'normal – empfohlen' }, { wert: 400, name: 'hoch – dauert länger' }];
    const r = liesBeschreibung(code({ standard: 300, vorschlaege }));
    assert.deepEqual(r.fehler, []);
    const f = (r.beschreibung!.bloecke[0] as unknown as { felder: Array<Record<string, unknown>> }).felder[0];
    assert.deepEqual(f.vorschlaege, vorschlaege);
    assert.equal(f.standard, 300);
    assert.match(liesBeschreibung(code({ standard: 300, vorschlaege: [{ wert: 600, name: 'zu hoch' }, { wert: 300, name: 'normal' }] })).fehler.join(), /600 liegt nicht zwischen min und max/);
    assert.match(liesBeschreibung(code({ standard: 250, vorschlaege })).fehler.join(), /standard muss einer der vorschlaege sein/);
    assert.match(liesBeschreibung({ einstellungen: [{ abschnitt: 'A', felder: [{ schluessel: 'x', name: 'X', typ: 'text', vorschlaege }] }] }).fehler.join(), /vorschlaege nur bei zahl/);
    assert.equal((liesBeschreibung(code({ standard: 300 })).beschreibung!.bloecke[0] as unknown as { felder: Array<Record<string, unknown>> }).felder[0].vorschlaege, undefined);
  });
});

describe('Paket-Einstellungen (#197)', () => {
  it('liest die Beschreibung; Schlüssel eindeutig, Auswahl braucht Optionen, Geheimnis ohne Vorgabe', () => {
    const ok = liesBeschreibung({ einstellungen: [{ abschnitt: 'A', felder: [{ schluessel: 'a', name: 'A', typ: 'text' }] }, { liste: 'l', name: 'L', eintrag: 'E', felder: [{ schluessel: 'a', name: 'A', typ: 'text' }] }] });
    assert.deepEqual(ok.fehler, []);
    assert.equal(ok.beschreibung!.bloecke.length, 2);
    const f = liesBeschreibung({ einstellungen: [{ abschnitt: 'A', felder: [{ schluessel: 'a', name: 'A', typ: 'auswahl' }, { schluessel: 'a', name: 'B', typ: 'geheim', standard: 'x' }] }] }).fehler;
    assert.ok(f.some((x) => x.includes('braucht optionen')) && f.some((x) => x.includes('doppelt')) && f.some((x) => x.includes('geheim hat keine Vorgabe')));
  });

  it('Mehrfachauswahl für Verweise (#658): mehrfach und schliesst_aus – Manifest und Prüfung', () => {
    const code = (felder: unknown[]) => ({ einstellungen: [{ abschnitt: 'Typen', felder }] });
    const gut = liesBeschreibung(code([
      { schluessel: 'nur', name: 'Nur diese Mappentypen', typ: 'mappentyp', mehrfach: true, schliesst_aus: 'ohne' },
      { schluessel: 'ohne', name: 'Diese Mappentypen ausschließen', typ: 'mappentyp', mehrfach: true, schliesst_aus: 'nur' },
    ]));
    assert.deepEqual(gut.fehler, []);
    const [nur, ohne] = gut.beschreibung!.bloecke[0].felder;
    assert.equal(nur.mehrfach, true);
    assert.equal(ohne.schliesstAus, 'nur');
    assert.match(liesBeschreibung(code([{ schluessel: 'x', name: 'X', typ: 'text', mehrfach: true }])).fehler.join(' '), /mehrfach: true gibt es nur bei mappentyp, benutzer, rolle, sicht/);
    assert.match(liesBeschreibung(code([{ schluessel: 'x', name: 'X', typ: 'mappentyp', mehrfach: true, schliesst_aus: 'y' }, { schluessel: 'y', name: 'Y', typ: 'benutzer', mehrfach: true }])).fehler.join(' '), /schliesst_aus „y“ muss ein anderes Feld/);
    const q: Verweisquelle = { typen: [{ id: 't1', felder: [] }, { id: 't2', felder: [] }, { id: 't3', felder: [] }], benutzer: [], rollen: [], sichten: [], typVon: () => null };
    const r = pruefeWerte(gut.beschreibung!, { nur: ['t1', 't2', 't1'], ohne: ['t3'] }, q);
    assert.deepEqual(r.fehler, {});
    assert.deepEqual(r.werte, { nur: ['t1', 't2'], ohne: ['t3'] });
    assert.deepEqual(pruefeWerte(gut.beschreibung!, {}, q).werte, { nur: [], ohne: [] });
    assert.match(pruefeWerte(gut.beschreibung!, { nur: ['t1', 'weg'] }, q).fehler.nur, /Einen der Mappentypen gibt es nicht/);
    const beide = pruefeWerte(gut.beschreibung!, { nur: ['t1'], ohne: ['t1', 't3'] }, q);
    assert.match(beide.fehler.nur, /Steht auch in „Diese Mappentypen ausschließen“/);
    // Update: Liste mit einem Verweisfeld → Mehrfachauswahl unter demselben Schlüssel, Werte bleiben.
    assert.deepEqual(ueberfuehre(gut.beschreibung!, { nur: [{ [EINTRAG_ID]: 'e1', typ: 't1' }, { [EINTRAG_ID]: 'e2', typ: 't2' }] }).werte.nur, ['t1', 't2']);
  });

  it('alle Feldtypen, Pflicht, Liste mit Sortierung, Geheimnisse, Aktionen, Update, Entfernen', async () => {
    const aufrufe: string[] = [];
    const { d, p, einst } = await aufbau({ aktion: async (paket, a, e) => { aufrufe.push(`${paket}:${a}:${String(e.token)}`); return 'Drei Regeln angewendet.'; }, ereignis: (paket, name, felder) => aufrufe.push(`${name}:${felder.join(',')}`) });
    const v = await p.vorschau({ id: 'zuordnung', version: '1.0.0' });
    assert.deepEqual(v.probleme, []);
    assert.match(v.hinweise[0], /Paket-Läufer/);
    const inst = await p.installiere({ id: 'zuordnung', version: '1.0.0' }, ICH);
    assert.equal(inst.code, true);
    // Vorgaben gesetzt; Pflichtfeld fehlt → „Einstellungen nötig“.
    let e = await p.einstellungen('zuordnung');
    assert.equal(e.werte.aktiv, true); assert.equal(e.werte.grenze, 3); assert.deepEqual(e.werte.regeln, []);
    assert.deepEqual(e.fehlend, ['Token']);
    assert.deepEqual(await p.aktion('zuordnung', 'anwenden', ICH), { ok: false, text: 'Einstellungen nötig: Token.' });

    // Prüfung mit Fehlern am Feld.
    await assert.rejects(p.speichereEinstellungen('zuordnung', { werte: { grenze: 11, sprache: 'Klingonisch', ab: '31.12.2026', typ: 'x', regeln: [{ absender: '' }] } }, ICH),
      (x) => x instanceof Fachfehler && x.status === 422 && Object.keys((x.details as { felderFehler: Record<string, string> }).felderFehler).sort().join() === 'ab,grenze,regeln.1.absender,sprache,token,typ');

    const typ = (await d.mappentypen.listeTypen()).find((t) => t.id === inst.typen.vorgang)!;
    const rolle = (await d.listeRollen())[0].id;
    const sicht = (await d.legeSichtAn({ name: 'S', typen: [typ.id] })).id;
    const gueltig = {
      aktiv: false, titel: ' Eingang ', notiz: 'Zeile 1\nZeile 2', grenze: '2,5', ab: '2027-01-31', sprache: 'Englisch', tage: ['Mo', 'Mi'], token: 'geheim-123',
      typ: typ.id, feld: { typ: typ.id, feld: 'name' }, wer: 'u1', rolle, sicht,
      regeln: [{ [EINTRAG_ID]: 'a', absender: 'Stadtwerke', kennwort: 'pw-a' }, { [EINTRAG_ID]: 'b', absender: 'Bank' }],
    };
    e = await p.speichereEinstellungen('zuordnung', { werte: gueltig }, ICH);
    assert.deepEqual(e.fehlend, []);
    assert.equal(e.werte.titel, 'Eingang'); assert.equal(e.werte.grenze, 2.5);
    assert.deepEqual(e.werte.token, { gesetzt: true }, 'Geheimnis wird nie ausgegeben');
    assert.ok(!JSON.stringify(e).includes('geheim-123') && !JSON.stringify(e).includes('pw-a'));
    const roh = await einst.lies('paket:zuordnung') as { werte: Record<string, unknown> };
    assert.match(String(roh.werte.token), /^dms1\$/, 'verschlüsselt gespeichert');
    assert.ok(aufrufe.some((a) => a.startsWith('paket.einstellungen_geaendert:')));

    // Sortieren: Geheimnis bleibt beim Eintrag; behalten / löschen.
    e = await p.speichereEinstellungen('zuordnung', { werte: { ...gueltig, token: { behalten: true }, regeln: [{ [EINTRAG_ID]: 'b', absender: 'Bank', kennwort: null }, { [EINTRAG_ID]: 'a', absender: 'Stadtwerke', kennwort: { behalten: true } }] } }, ICH);
    assert.deepEqual((e.werte.regeln as Array<Record<string, unknown>>).map((r) => [r.absender, r.kennwort]), [['Bank', { gesetzt: false }], ['Stadtwerke', { gesetzt: true }]]);
    const klar = await p.einstellungenFuerPaket('zuordnung');
    assert.equal(klar.token, 'geheim-123');
    assert.equal((klar.regeln as Array<Record<string, unknown>>)[1].kennwort, 'pw-a');
    await assert.rejects(p.speichereEinstellungen('zuordnung', { werte: { ...gueltig, token: null } }, ICH), /prüfen/, 'Pflicht-Geheimnis darf nicht weg');

    // Aktion über den Läufer.
    assert.deepEqual(await p.aktion('zuordnung', 'anwenden', ICH), { ok: true, text: 'Drei Regeln angewendet.' });
    assert.ok(aufrufe.includes('zuordnung:anwenden:geheim-123'));
    await p.setzeStatus('zuordnung', { letzterLauf: '2026-11-01T10:00:00Z', meldungen: ['3 zugeordnet'] });
    assert.deepEqual((await p.einstellungen('zuordnung')).status, { letzterLauf: '2026-11-01T10:00:00Z', meldungen: ['3 zugeordnet'] });

    // Update: neues Feld mit Vorgabe, wegfallendes Feld weg, Werte bleiben.
    const uv = await p.vorschau({ id: 'zuordnung' });
    assert.deepEqual(uv.einstellungen, { neu: ['Neues Feld'], weg: ['Altes Feld'] });
    await p.aktualisiere('zuordnung', {}, ICH);
    e = await p.einstellungen('zuordnung');
    assert.equal(e.werte.neu, 7); assert.ok(!('alt' in e.werte)); assert.equal(e.werte.titel, 'Eingang'); assert.deepEqual(e.werte.token, { gesetzt: true });
    assert.equal(e.status?.meldungen[0], '3 zugeordnet');

    // Entfernen mit Behalten → Neuinstallation übernimmt die Werte; ohne Behalten → weg.
    await p.entferne('zuordnung', ICH, true);
    assert.ok(await einst.lies('paket:zuordnung'));
    await p.installiere({ id: 'zuordnung' }, ICH);
    assert.equal((await p.einstellungen('zuordnung')).werte.titel, 'Eingang');
    await p.entferne('zuordnung', ICH);
    assert.equal(await einst.lies('paket:zuordnung'), null);
  });

  it('Sicherung: Werte liegen in der Tabelle einstellungen (im Abzug), Geheimnisse verschlüsselt, Schlüsselwechsel inklusive', { skip: !process.env.TEST_DATABASE_URL && 'ohne TEST_DATABASE_URL' }, async () => {
    const { migriere } = await import('../src/db');
    const { pgRepo } = await import('../src/repo-pg');
    const { pgEinstellungen } = await import('../src/einstellungen');
    const { OHNE_INHALT } = await import('../src/datenbankabzug');
    // Eigene Datenbank (#900), nach dem letzten Test der Datei gelöscht.
    const sql = (await eigeneDatenbank('pe', { migrieren: false })).sql;
    try {
      await migriere(sql, new URL('../migrations', import.meta.url).pathname, () => {});
      const h = '00000000-0000-4000-8000-000000000001';
      const tresor = new Tresor(speicherEinstellungen(), join(await mkdtemp(join(tmpdir(), 'dms-pe-')), 'dms.schluessel'), () => null);
      await tresor.laden(); await tresor.erzeuge();
      const repo = pgRepo(sql, h);
      const d = new Dienst(repo, speicherDateien(), { einstellungen: pgEinstellungen(sql, h), tresor });
      const p = new Paketverwaltung(d, { version: () => '0.66.0', abruf: katalog([paket('1.0.0', V1)]), katalogUrl: KATALOG });
      await p.installiere({ id: 'zuordnung' }, ICH);
      await p.speichereEinstellungen('zuordnung', { werte: { token: 'geheim-123' } }, ICH);
      const [zeile] = await sql`SELECT wert FROM einstellungen WHERE haushalt_id = ${h} AND schluessel = 'paket:zuordnung'`;
      assert.match(String((zeile.wert as { werte: { token: string } }).werte.token), /^dms1\$/);
      assert.ok(!JSON.stringify(zeile.wert).includes('geheim-123'));
      assert.ok(!OHNE_INHALT.has('einstellungen') && !OHNE_INHALT.has('pakete'), 'beide Tabellen sind Teil der Sicherung');
      const r = await repo.umschluesseln((v) => v.replace('dms1$', 'dms1$x'), {});
      assert.ok(r.umgeschluesselt >= 1, 'Schlüsselwechsel erfasst die Geheimnisse der Pakete');
    } finally { await sql.end(); }
  });

  it('ohne Paket-Läufer: Aktion meldet das, statt zu hängen', async () => {
    const { p } = await aufbau();
    await p.installiere({ id: 'zuordnung', version: '1.0.0' }, ICH);
    await p.speichereEinstellungen('zuordnung', { werte: { token: 'x' } }, ICH);
    const r = await p.aktion('zuordnung', 'anwenden', ICH);
    assert.equal(r.ok, false); assert.match(r.text, /Paket-Läufer fehlt/);
    await assert.rejects(p.aktion('zuordnung', 'gibtsnicht', ICH), /gibt es nicht/);
  });
});
