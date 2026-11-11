/**
 * Archivmodus „Ist der Stichtag leer: läuft noch nicht ab“ (#1051) und der Archivmodus aus dem Paket (Schreibweise der
 * Entwürfe Compliance, Verträge und Rechnungen in dms-registry): Sperre ohne Datum, Frist ab dem später gefüllten
 * Stichtag mit Eintrag in der Historie, Vorschau beim Umschalten, Protokoll vorher/nachher – und ein Paket gibt den
 * Archivmodus nur neuen eigenen Typen vor, lockert nie den eines vorhandenen Typs und ändert beim Update nichts daran.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parse } from 'yaml';
import { archivAus, archivAusPaket, aufbewahrenBis, DMS_ARCHIV_PAKET_AB, gesperrt, laeuftNochNicht, paketArchivFehler } from '../../shared/src/archiv';
import { datenarten } from '../../shared/src/loeschkonzept';
import { MERKMALE_EINSTELLUNG } from '../../shared/src/merkmale';
import { speicherDateien } from '../src/dateispeicher';
import { Dienst } from '../src/dienst';
import { speicherEinstellungen } from '../src/einstellungen';
import { Fachfehler } from '../src/fehler';
import { Konten } from '../src/konten';
import { speicherKontoRepo } from '../src/konto-repo';
import { liesPaket, liesZip, Paketverwaltung } from '../src/pakete';
import { mindestversion, Paketerstellung } from '../src/paketerstellung';
import { protokoll } from '../src/protokoll';
import { speicherRepo } from '../src/repo-speicher';
import { routen, type Anfrage } from '../src/routen';
import { zipPuffer } from '../src/zip';
import { eigeneDatenbank } from './hilfe-db';
import type { Repo } from '../src/repo';
import '../src/sprache';

const ICH = { id: '00000000-0000-4000-8000-0000000000aa', email: 'admin@example.org' };
const offen = (e: unknown) => e instanceof Fachfehler && e.status === 409 && /beginnt erst mit „Gilt nicht mehr seit“/.test(e.message);
const LEER = { jahre: 2, stichtag: 'bis', leererStichtag: 'laeuftNicht' as const };

async function aufbau(repo: Repo = speicherRepo(), papierkorb = 0) {
  const einstellungen = speicherEinstellungen();
  const d = new Dienst(repo, speicherDateien(), { einstellungen });
  if (papierkorb) await d.papierkorbVerwaltung.setzePapierkorbTage(papierkorb);
  const t = await d.mappentypen.legeTypAn({ name: 'Verfahren', titelVorlage: '{name}', archiv: LEER,
    felder: [{ key: 'name', label: 'Name', typ: 'text' }, { key: 'bis', label: 'Gilt nicht mehr seit', typ: 'datum' }],
    register: [{ key: 'daten', name: 'Daten', art: 'felder' }, { key: 'belege', name: 'Belege', art: 'dokumente' }] });
  const aktuell = await d.mappen.legeMappeAn({ typId: t.id, werte: { name: 'Aktuell' } });
  const abgeloest = await d.mappen.legeMappeAn({ typId: t.id, werte: { name: 'Abgelöst', bis: '2015-06-30' } });
  return { d, t, aktuell, abgeloest, einstellungen };
}

describe('Ist der Stichtag leer: läuft noch nicht ab (#1051)', () => {
  it('Berechnung: leerer Stichtag sperrt ohne Datum; gefüllt ab dem 31.12. plus Jahre; Vorgabe bleibt das Anlagedatum', () => {
    const m = { werte: {}, erstellt: '2020-05-05T10:00:00Z' };
    assert.equal(laeuftNochNicht(LEER, m), true);
    assert.equal(aufbewahrenBis(LEER, m), null);
    assert.equal(gesperrt(LEER, m, new Date('2099-01-01')), true, 'ohne Ende gesperrt');
    assert.equal(aufbewahrenBis(LEER, { ...m, werte: { bis: '2026-03-02' } }), '2028-12-31');
    assert.equal(gesperrt(LEER, { ...m, werte: { bis: '2015-03-02' } }), false);
    // Wie bisher: ab Anlagedatum.
    assert.equal(aufbewahrenBis({ jahre: 2, stichtag: 'bis' }, m), '2022-12-31');
    assert.equal(laeuftNochNicht({ jahre: 2, stichtag: 'bis' }, m), false);
    // Gespeichert wird nur „laeuftNicht“ und nur mit Stichtag – „anlage“ ist die Vorgabe, vorhandene Typen bleiben gleich.
    assert.deepEqual(archivAus({ jahre: 8, stichtag: 'bis', leererStichtag: 'anlage' }), { jahre: 8, stichtag: 'bis' });
    assert.deepEqual(archivAus({ jahre: 8, stichtag: null, leererStichtag: 'laeuftNicht' }), { jahre: 8, stichtag: null });
    assert.deepEqual(archivAus({ jahre: 8, stichtag: 'bis', leererStichtag: 'laeuftNicht' }), { jahre: 8, stichtag: 'bis', leererStichtag: 'laeuftNicht' });
    assert.deepEqual(archivAus({ jahre: 8, stichtag: 'bis', leererStichtag: 'irgendwas' }), { jahre: 8, stichtag: 'bis' });
  });

  it('An der Mappe „aufbewahren, Frist beginnt mit …“; Löschsperre auf allen Wegen; nicht unter „Aufbewahrung abgelaufen“', async () => {
    const { d, t, aktuell, abgeloest } = await aufbau();
    assert.deepEqual(t.archiv, LEER);
    const det = await d.mappen.holeMappe(aktuell.id);
    assert.equal(det.aufbewahrenBis, null);
    assert.equal((det as { fristBeginntMit?: string }).fristBeginntMit, 'Gilt nicht mehr seit');
    assert.equal(det.loeschbar.ok, false);
    assert.equal((await d.mappen.holeMappe(abgeloest.id) as { fristBeginntMit?: string }).fristBeginntMit, undefined);
    await assert.rejects(d.loeschen.loescheMappe(aktuell.id, ICH.id), offen);
    const { dokument } = await d.dokumente.ladeHoch(aktuell.id, { register: 'belege', name: 'V.pdf' }, Buffer.from('%PDF-1.4 a'), null);
    await assert.rejects(d.dokumente.loescheDokument(dokument.id), (e) => e instanceof Fachfehler && e.status === 409 && /beginnt erst mit/.test(e.message));
    assert.deepEqual((await d.mappenArchiv.darfWeg()).map((x) => x.titel), ['Abgelöst']);
    // Baum (Löschen mit verknüpften Mappen, Auskunft): gesperrt ohne Datum.
    const baum = await d.mitVerknuepften.baum(aktuell.id, {}, await d.rechtepruefung.zugriff({ id: ICH.id, rolle: 'admin' } as never));
    const k = baum.knoten.find((x) => x.id === aktuell.id)!;
    assert.equal(k.gesperrt, true);
    assert.equal(k.aufbewahrenBis, null);
  });

  it('Stichtag später gefüllt: Frist ab diesem Datum, steht in der Historie; danach darf die Mappe weg', async () => {
    const { d, aktuell } = await aufbau();
    await d.mappen.aendereMappe(aktuell.id, { werte: { ...aktuell.werte, bis: '2016-01-01' } });
    const h = (await d.mappenHistorie.historie(aktuell.id)).find((x) => x.art === 'geaendert');
    const a = h?.daten.aenderungen?.find((x) => x.label === 'Aufbewahren bis');
    assert.deepEqual([a?.alt, a?.neu], ['Frist läuft noch nicht (beginnt mit „Gilt nicht mehr seit“)', '31.12.2018']);
    assert.equal((await d.mappen.holeMappe(aktuell.id)).aufbewahrenBis, '2018-12-31');
    assert.ok((await d.mappenArchiv.darfWeg()).some((x) => x.id === aktuell.id));
    // Wieder geleert: Die Frist läuft wieder nicht – auch das steht in der Historie.
    await d.mappen.aendereMappe(aktuell.id, { werte: { ...aktuell.werte, bis: null } });
    const h2 = (await d.mappenHistorie.historie(aktuell.id)).filter((x) => x.art === 'geaendert').map((x) => x.daten.aenderungen?.find((y) => y.label === 'Aufbewahren bis')?.neu);
    assert.ok(h2.includes('Frist läuft noch nicht (beginnt mit „Gilt nicht mehr seit“)'));
    await assert.rejects(d.loeschen.loescheMappe(aktuell.id, ICH.id), offen);
  });

  it('Vorschau beim Umschalten nennt die Mappen mit leerem Stichtag; Papierkorb hält sie fest', async () => {
    const { d, t } = await aufbau();
    assert.deepEqual(await d.mappenArchiv.archivVorschau(t.id, { jahre: 2, stichtag: 'bis' }), { mappen: 2, darfWeg: 1, stichtagLeer: 1 });
    assert.deepEqual(await d.mappenArchiv.archivVorschau(t.id, LEER), { mappen: 2, darfWeg: 1, stichtagLeer: 1 });
    assert.deepEqual(await d.mappenArchiv.archivVorschau(t.id, { jahre: 2, stichtag: null }), { mappen: 2, darfWeg: 0, stichtagLeer: 0 });
    // Vorher im Papierkorb: bleibt dort, bis der Stichtag gefüllt und die Frist abgelaufen ist.
    const p = await aufbau(speicherRepo(), 30);
    const ohne = await p.d.mappentypen.aendereTyp(p.t.id, { ...p.t, archiv: null });
    await p.d.loeschen.loescheMappe(p.aktuell.id, ICH.id);
    await p.d.mappentypen.aendereTyp(p.t.id, { ...ohne, archiv: LEER });
    await assert.rejects(p.d.papierkorbVerwaltung.loescheEndgueltig([p.aktuell.id], { id: ICH.id, rolle: 'admin' }, true), (e) => e instanceof Fachfehler && e.status === 409 && /„Aktuell“ nicht endgültig/.test(e.message));
  });

  it('Löschkonzept nennt „läuft noch nicht“', async () => {
    const { t } = await aufbau();
    const arten = datenarten({ typen: [t], datenschutz: { typen: { [t.id]: { person: true, zweck: 'Nachweis' } } }, papierkorbTage: 30 } as never);
    assert.equal(arten[0].stichtag, '„Gilt nicht mehr seit“, ab Ende des Kalenderjahres; ist es leer, läuft die Frist noch nicht');
  });
});

describe('Archivmodus im Protokoll (#1051)', () => {
  it('Umschalten nennt „Ist der Stichtag leer“ vorher und nachher', async () => {
    const d = new Dienst(speicherRepo(), speicherDateien(), { einstellungen: speicherEinstellungen() });
    const konten = new Konten(speicherKontoRepo(), null, 'x');
    const { benutzer } = await konten.einrichten({ email: 'admin@example.org', passwort: 'ein-langes-passwort' });
    const t = await d.mappentypen.legeTypAn({ name: 'Vertrag', archiv: { jahre: 6, stichtag: 'ende' }, felder: [{ key: 'name', label: 'Name', typ: 'text' }, { key: 'ende', label: 'Beendet am', typ: 'datum' }] });
    const r = routen(d, konten, {}).find((y) => y.methode === 'PUT' && y.pfad === '/api/typen/:id')!;
    const n = protokoll.letzteNr;
    await r.handler({ body: { ...t, archiv: { jahre: 6, stichtag: 'ende', leererStichtag: 'laeuftNicht' } }, params: { id: t.id }, query: {}, ip: '127.0.0.1', benutzer } as unknown as Anfrage);
    const e = protokoll.eintraege({ seit: n, stufe: 'info' }).filter((x) => /Archivmodus/.test(x.text));
    assert.equal(e.length, 1);
    assert.deepEqual(e[0].daten, { typ: 'Vertrag', vorher: { an: true, jahre: 6, stichtag: 'ende', leererStichtag: 'ab Anlagedatum' }, nachher: { an: true, jahre: 6, stichtag: 'ende', leererStichtag: 'läuft noch nicht ab' } });
  });
});

describe('Archivmodus aus dem Paket (#1051)', () => {
  const manifest = (version = '1.0.0') => `schema: 1\nid: compliance_test\nname: Compliance (Test)\nversion: ${version}\nbeschreibung: Test.\nautor: { name: Test, github: test }\nlizenz: Apache-2.0\ndms: ">=${DMS_ARCHIV_PAKET_AB}"\ninhalt: { mappentypen: inhalt/mappentypen.yaml }\n`;
  // Schreibweise wie im Entwurf Compliance (dms-registry #175).
  const typen = (archiv: string, nachweis = '') => `- schluessel: verfahren
  name: Verfahren
  ${archiv}
  felder:
    - { key: name, label: Name, typ: text }
    - { key: gilt_nicht_mehr_seit, label: Gilt nicht mehr seit, typ: datum }
  register:
    - { key: daten, name: Daten, art: felder, felder: [name, gilt_nicht_mehr_seit] }
- schluessel: nachweis
  name: Nachweise
  ${nachweis}
  felder:
    - { key: monat, label: Monat, typ: text }
    - { key: stichtag, label: Stichtag, typ: datum }
  register:
    - { key: daten, name: Daten, art: felder, felder: [monat, stichtag] }
`;
  const COMPLIANCE = 'archiv: { jahre: 2, jahreBeruflich: 10, stichtag: gilt_nicht_mehr_seit, leererStichtag: laeuftNicht }';
  const lies = (archiv: string) => liesPaket(new Map([['manifest.yaml', Buffer.from(manifest())], ['inhalt/mappentypen.yaml', Buffer.from(typen(archiv))]]));
  const gruende = (e: unknown) => (e instanceof Fachfehler ? ((e.details as { gruende?: string[] })?.gruende ?? [e.message]) : []).join(' | ');
  const zip = (archiv: string, version = '1.0.0', nachweis = '') => zipPuffer([{ name: 'compliance_test/manifest.yaml', daten: Buffer.from(manifest(version)) }, { name: 'compliance_test/inhalt/mappentypen.yaml', daten: Buffer.from(typen(archiv, nachweis)) }]);
  const dms = (repo: Repo = speicherRepo()) => {
    const einstellungen = speicherEinstellungen();
    const d = new Dienst(repo, speicherDateien(), { einstellungen });
    return { d, einstellungen, p: new Paketverwaltung(d, { version: () => DMS_ARCHIV_PAKET_AB, katalogUrl: 'https://katalog.test/katalog.json', abruf: async () => { throw new Error('ohne Netz'); } }), e: new Paketerstellung(d, { version: () => DMS_ARCHIV_PAKET_AB }) };
  };
  const installiere = async (a: ReturnType<typeof dms>, archiv: string, version = '1.0.0', nachweis = '') => {
    const h = await a.p.hochladen(zip(archiv, version, nachweis), ICH);
    assert.deepEqual(h.vorschau.probleme, []);
    return { vorschau: h.vorschau, paket: await a.p.installiere({ upload: h.upload, bestaetigt: true }, ICH) };
  };

  it('Lesen und Prüfen wie pruefen.py der Registry', () => {
    assert.deepEqual(lies(COMPLIANCE).typen[0].archiv, { jahre: 2, jahreBeruflich: 10, stichtag: 'gilt_nicht_mehr_seit', leererStichtag: 'laeuftNicht' });
    assert.deepEqual(lies('archiv: { jahre: 2 }').typen[0].archiv, { jahre: 2 });
    assert.equal(lies('').typen[0].archiv, undefined);
    assert.throws(() => lies('archiv: { jahre: 0 }'), (e) => /archiv.jahre muss/.test(gruende(e)));
    assert.throws(() => lies('archiv: { jahre: 2, stichtag: name }'), (e) => /muss ein Datumsfeld/.test(gruende(e)));
    assert.throws(() => lies('archiv: { jahre: 2, leererStichtag: laeuftNicht }'), (e) => /nur mit archiv.stichtag/.test(gruende(e)));
    assert.throws(() => lies('archiv: { jahre: 2, stichtag: gilt_nicht_mehr_seit, leererStichtag: nie }'), (e) => /„anlage“ oder „laeuftNicht“/.test(gruende(e)));
    assert.throws(() => lies('archiv: { jahre: 10, jahreBeruflich: 2 }'), (e) => /kürzer als jahre/.test(gruende(e)));
    assert.throws(() => lies('archiv: { jahre: 2, aus: true }'), (e) => /kennt „aus“ nicht/.test(gruende(e)));
    assert.deepEqual(paketArchivFehler(undefined, [], 'x'), []);
    assert.deepEqual(archivAusPaket({ jahre: 2, jahreBeruflich: 10, stichtag: 's', leererStichtag: 'anlage' }, true), { jahre: 10, stichtag: 's' });
  });

  it('Installieren: neuer Typ bekommt den Archivmodus, mit „beruflich genutzt“ jahreBeruflich; die Vorschau zeigt ihn', async () => {
    const a = dms();
    const { vorschau, paket } = await installiere(a, COMPLIANCE, '1.0.0', 'archiv: { jahre: 2, stichtag: stichtag }');
    assert.deepEqual(vorschau.typen.find((x) => x.schluessel === 'verfahren')?.archiv, { jahre: 2, stichtag: 'gilt_nicht_mehr_seit', leererStichtag: 'laeuftNicht', stichtagName: 'Gilt nicht mehr seit' });
    const typ = async (s: string) => (await a.d.mappentypen.listeTypen()).find((x) => x.id === paket.typen[s])!;
    assert.deepEqual((await typ('verfahren')).archiv, { jahre: 2, stichtag: 'gilt_nicht_mehr_seit', leererStichtag: 'laeuftNicht' });
    assert.deepEqual((await typ('nachweis')).archiv, { jahre: 2, stichtag: 'stichtag' });
    const b = dms();
    await b.einstellungen.schreibe(MERKMALE_EINSTELLUNG, { beruflich: true });
    const p2 = (await installiere(b, COMPLIANCE)).paket;
    assert.equal((await b.d.mappentypen.listeTypen()).find((x) => x.id === p2.typen.verfahren)?.archiv?.jahre, 10);
  });

  it('Sicherheit: Ein Update lockert nie (kürzer, aus, ab Anlagedatum) und ändert nichts, was der Administrator gesetzt hat', async () => {
    const a = dms();
    const { paket } = await installiere(a, COMPLIANCE);
    const id = paket.typen.verfahren, nId = paket.typen.nachweis;
    // Update mit kürzerer Frist, ohne „läuft noch nicht ab“ – und für einen vorhandenen Typ ohne Archivmodus eine Vorgabe.
    const u = await installiere(a, 'archiv: { jahre: 1 }', '1.1.0', 'archiv: { jahre: 30, stichtag: stichtag }');
    assert.equal(u.vorschau.typen.every((x) => x.archiv === undefined), true, 'kein Archivmodus für vorhandene Typen in der Vorschau');
    assert.deepEqual((await a.d.mappentypen.listeTypen()).find((x) => x.id === id)?.archiv, { jahre: 2, stichtag: 'gilt_nicht_mehr_seit', leererStichtag: 'laeuftNicht' });
    assert.equal((await a.d.mappentypen.listeTypen()).find((x) => x.id === nId)?.archiv, null);
    // Update ohne archiv: bleibt.
    await installiere(a, '', '1.2.0');
    assert.equal((await a.d.mappentypen.listeTypen()).find((x) => x.id === id)?.archiv?.jahre, 2);
    // Vom Administrator gesetzte Werte bleiben, auch wenn das Paket etwas anderes vorgibt.
    const t = (await a.d.mappentypen.listeTypen()).find((x) => x.id === id)!;
    await a.d.mappentypen.aendereTyp(id, { ...t, archiv: { jahre: 6, stichtag: null } });
    await installiere(a, COMPLIANCE, '1.3.0');
    assert.deepEqual((await a.d.mappentypen.listeTypen()).find((x) => x.id === id)?.archiv, { jahre: 6, stichtag: null });
  });

  it('Paket erstellen schreibt den Archivmodus in der Schreibweise der Registry und hebt die Mindestversion', async () => {
    assert.equal(mindestversion(['archiv']).version, DMS_ARCHIV_PAKET_AB);
    const b = dms();
    const t = await b.d.mappentypen.legeTypAn({ name: 'Verfahren', schluessel: 'verfahren', titelVorlage: '{name}', archiv: { jahre: 2, stichtag: 'bis', leererStichtag: 'laeuftNicht' },
      felder: [{ key: 'name', label: 'Name', typ: 'text' }, { key: 'bis', label: 'Gilt nicht mehr seit', typ: 'datum' }], register: [{ key: 'daten', name: 'Daten', art: 'felder', felder: ['name', 'bis'] }] });
    const ohne = await b.d.mappentypen.legeTypAn({ name: 'Notiz', schluessel: 'notiz', felder: [{ key: 'name', label: 'Name', typ: 'text' }], register: [{ key: 'daten', name: 'Daten', art: 'felder', felder: ['name'] }] });
    const z = await b.e.exportiere({ typen: [t.id, ohne.id], sichten: [], beispiele: [], id: 'verfahren_eigen', name: 'Verfahren (eigen)', version: '1.0.0', beschreibung: 'Verfahren.',
      autor: { name: 'Lena Beispiel', github: 'lena' }, lizenz: 'MIT', dms: `>=${DMS_ARCHIV_PAKET_AB}`, aenderungen: '' }, ICH);
    const inhalt = parse(liesZip(z.daten).get('verfahren_eigen/inhalt/mappentypen.yaml')!.toString()) as Array<{ schluessel: string; archiv?: unknown }>;
    assert.deepEqual(inhalt.find((x) => x.schluessel === 'verfahren')?.archiv, { jahre: 2, stichtag: 'bis', leererStichtag: 'laeuftNicht' });
    assert.equal(inhalt.find((x) => x.schluessel === 'notiz')?.archiv, undefined);
  });
});

describe('Ist der Stichtag leer – PostgreSQL (#1051)', { skip: !process.env.TEST_DATABASE_URL && 'ohne TEST_DATABASE_URL' }, () => {
  it('Einstellung bleibt gespeichert, Sperre und Frist wie im Speicher', async () => {
    const db = await eigeneDatenbank('archiv_leer');
    const { pgRepo } = await import('../src/repo-pg');
    try {
      const { d, t, aktuell } = await aufbau(pgRepo(db.sql, '00000000-0000-4000-8000-000000000001') as never as Repo);
      assert.deepEqual((await d.mappentypen.listeTypen()).find((x) => x.id === t.id)?.archiv, LEER);
      await assert.rejects(d.loeschen.loescheMappe(aktuell.id, ICH.id), offen);
      await d.mappen.aendereMappe(aktuell.id, { werte: { ...aktuell.werte, bis: '2016-01-01' } });
      assert.equal((await d.mappen.holeMappe(aktuell.id)).aufbewahrenBis, '2018-12-31');
    } finally { await db.ende(); }
  });
});
