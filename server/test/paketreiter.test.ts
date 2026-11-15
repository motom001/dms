/** Paketseite (#996): Prüfregeln und Feldarten des Kerns im Manifest, Anzeigen, Prüffunktion des Pakets. */
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { liesBeschreibung, pruefeWerte, textFehler } from '../../shared/src/paketeinstellungen';
import { hatEinstellungen, kernFelderVon, mitKern } from '../../shared/src/paketkern';
import { ampelVon, anzeigeWert, dateiartPasst, liesReiterAngaben, summeVon } from '../../shared/src/paketreiter';
import type { InstalliertesPaket, PaketCode } from '../../shared/src/pakete';
import { speicherDateien } from '../src/dateispeicher';
import { Dienst } from '../src/dienst';
import { speicherEinstellungen } from '../src/einstellungen';
import { Fachfehler } from '../src/fehler';
import { Paketverwaltung, type PaketLaeufer } from '../src/pakete';
import { setzePaketSpeicher } from '../src/pakete/index';
import { speicherRepo } from '../src/repo-speicher';
import type { Repo } from '../src/repo';
import { eigeneDatenbank } from './hilfe-db';
import { Tresor } from '../src/tresor';

const ICH = { id: null, email: 'admin@example.org' };
const q = { typen: [], benutzer: [], rollen: [], sichten: [], typVon: () => null };
const code = (x: Partial<PaketCode> = {}): PaketCode => ({ sprache: 'c', ereignisse: [], rechte: { lesen: [], schreiben: [], dokumente: 'keine' }, netz: [], ...x });
const KI = code({ netz: ['https://ki.example.org'], rechte: { lesen: [], schreiben: [], dokumente: 'lesen' } });

async function aufbau(laeufer?: PaketLaeufer) {
  const tresor = new Tresor(speicherEinstellungen(), join(await mkdtemp(join(tmpdir(), 'dms-pr-')), 'dms.schluessel'), () => null);
  await tresor.laden(); await tresor.erzeuge();
  const d = new Dienst(speicherRepo(), speicherDateien(), { einstellungen: speicherEinstellungen(), tresor });
  const p = new Paketverwaltung(d, { version: () => '0.66.0', abruf: async () => { throw new Error('kein Netz'); }, katalogUrl: 'https://katalog.test/k.json', laeufer });
  const installiere = (id: string, x: Partial<InstalliertesPaket>) => d.kern.repo.speicherePaket({
    id, name: `Probe ${id}`, version: '1.0.0', beschreibung: '', lizenz: 'MIT', autor: { name: 'T', github: 't' }, herkunft: { art: 'hochgeladen', von: null, am: '' },
    installiert: new Date().toISOString(), installiertVon: null, aktualisiert: null, aktualisiertVon: null, typen: {}, sichten: {}, abhaengigkeiten: {}, code: true, ...x,
  });
  return { d, p, installiere };
}

describe('Prüfregeln im Manifest (#996)', () => {
  const lies = (feld: Record<string, unknown>) => liesBeschreibung({ einstellungen: [{ abschnitt: 'A', felder: [{ schluessel: 'x', name: 'X', typ: 'text', ...feld }] }] });

  it('Länge und Muster mit eigener Meldung – im Manifest geprüft, beim Speichern angewandt', () => {
    const r = lies({ laenge_min: 3, laenge_max: 8, muster: '[A-Z]{2}-\\d+', meldung: 'Bitte wie „AB-12“.' });
    assert.deepEqual(r.fehler, []);
    const b = r.beschreibung!;
    assert.equal(pruefeWerte(b, { x: 'A' }, q).fehler.x, 'Bitte mindestens 3 Zeichen.');
    assert.equal(pruefeWerte(b, { x: 'AB-123456' }, q).fehler.x, 'Bitte höchstens 8 Zeichen.');
    assert.equal(pruefeWerte(b, { x: 'ab-12' }, q).fehler.x, 'Bitte wie „AB-12“.');
    assert.equal(pruefeWerte(b, { x: ' AB-12 ' }, q).werte.x, 'AB-12', 'Muster gilt für den ganzen, getrimmten Wert');
    assert.equal(pruefeWerte(b, {}, q).fehler.x, undefined, 'leer und optional: keine Regel');
    assert.equal(textFehler({ muster: '\\d+' }, '12a'), 'Der Wert hat nicht die erwartete Form.');
  });

  it('lehnt falsche Regeln ab: Muster nur bei text und übersetzbar, Länge nicht bei Zahlen, Meldung nur mit Muster', () => {
    assert.match(lies({ muster: '([a-z' }).fehler.join(), /gültiger regulärer Ausdruck/);
    assert.match(lies({ typ: 'zahl', muster: '\\d' }).fehler.join(), /muster nur bei text/);
    assert.match(lies({ typ: 'zahl', laenge_max: 3 }).fehler.join(), /laenge_max nur bei text/);
    assert.match(lies({ laenge_min: 5, laenge_max: 2 }).fehler.join(), /größer als laenge_max/);
    assert.match(lies({ meldung: 'x' }).fehler.join(), /meldung nur zusammen mit muster/);
  });

  it('Feldarten des Kerns: ohne Vorgabe und Pflicht, nur in Abschnitten, je einmal; gespeichert wird nichts beim Paket', () => {
    assert.match(liesBeschreibung({ einstellungen: [{ abschnitt: 'KI', felder: [{ schluessel: 'k', typ: 'ki_mappentypen', standard: [] }] }] }).fehler.join(), /keine Vorgabe/);
    assert.match(liesBeschreibung({ einstellungen: [{ liste: 'l', felder: [{ schluessel: 'k', typ: 'fragen_grenzen' }] }] }).fehler.join(), /nur in einem Abschnitt/);
    assert.match(liesBeschreibung({ einstellungen: [{ abschnitt: 'A', felder: [{ schluessel: 'a', typ: 'mappenaktionen' }, { schluessel: 'b', typ: 'mappenaktionen' }] }] }).fehler.join(), /höchstens einmal/);
    const b = liesBeschreibung({ einstellungen: [{ abschnitt: 'Was die KI liest', felder: [{ schluessel: 'typen', name: 'Mappentypen', typ: 'ki_mappentypen' }, { schluessel: 't', typ: 'text' }] }] }).beschreibung!;
    assert.deepEqual(Object.keys(pruefeWerte(b, { typen: ['x'], t: 'a' }, q).werte), ['t']);
  });
});

describe('Feldarten des Kerns an der Paketseite (#996)', () => {
  it('kommen aus den Schnittstellen; was das Manifest nicht nennt, hängt Ablago als eigenen Abschnitt an', () => {
    assert.deepEqual(kernFelderVon({ laeufer: KI }), ['ki_mappentypen']);
    assert.deepEqual(kernFelderVon({ laeufer: code({ rechte: { lesen: [], schreiben: [], dokumente: 'keine', schnittstellen: ['dms:antworten', 'dms:erkennen'] } }), mappenaktionen: [{ schluessel: 'a' } as never] }), ['fragen_grenzen', 'erkennung_standard', 'mappenaktionen']);
    assert.equal(mitKern(null, { laeufer: code() }), null);
    assert.equal(hatEinstellungen({ laeufer: KI, einstellungen: null }), true);
    const eigen = liesBeschreibung({ einstellungen: [{ abschnitt: 'Allgemein', felder: [{ schluessel: 'a', typ: 'janein' }] }] }).beschreibung!;
    const b = mitKern(eigen, { laeufer: KI })!;
    assert.deepEqual(b.bloecke.map((x) => (x.art === 'abschnitt' ? x.titel : '')), ['Allgemein', 'Was die KI lesen darf'], 'nach den Feldern des Manifests');
    const genannt = liesBeschreibung({ einstellungen: [{ abschnitt: 'Datenschutz', felder: [{ schluessel: 'typen', typ: 'ki_mappentypen' }] }] }).beschreibung!;
    assert.equal(mitKern(genannt, { laeufer: KI })!.bloecke.length, 1, 'im Manifest genannt: kein zweiter Abschnitt');
  });

  it('Paket ohne Felder im Manifest: Reiter „Einstellungen“ mit der Feldart; Warnzeichen, solange die KI nichts bekommt', async () => {
    const { p, installiere } = await aufbau();
    await installiere('ki', { laeufer: KI });
    const e = await p.einstellungen('ki');
    assert.deepEqual(e.beschreibung.bloecke.flatMap((x) => x.felder.map((f) => f.typ)), ['ki_mappentypen']);
    assert.equal((await p.installierte()).find((x) => x.id === 'ki')?.einstellungenNoetig, true);
    await installiere('ohne', { laeufer: code() });
    await assert.rejects(p.einstellungen('ohne'), (x) => x instanceof Fachfehler && x.status === 404);
  });
});

describe('Anzeigen und Prüffunktion (#996)', () => {
  it('liest code.anzeigen und code.einstellungen_pruefen; Werte kommen aus dem Speicher des Pakets', async () => {
    const r = liesReiterAngaben({ anzeigen: [{ schluessel: 'stand', name: 'Dokumente mit Vektor', art: 'anteil' }, { schluessel: 'modell', art: 'zustand' }, { schluessel: 'x', art: 'bild' }], einstellungen_pruefen: true });
    assert.match(r.fehler.join(), /art ist eine von/);
    assert.deepEqual(r.angaben?.anzeigen?.map((a) => a.schluessel), ['stand', 'modell']);
    assert.equal(r.angaben?.einstellungenPruefen, true);
    assert.deepEqual(anzeigeWert('anteil', '1234/1300'), { art: 'anteil', zahl: 1234, von: 1300 });
    assert.deepEqual(anzeigeWert('zustand', 'warnung: Modell fehlt'), { art: 'zustand', zustand: 'warnung', text: 'Modell fehlt' });
    assert.equal(anzeigeWert('zahl', 'viel'), null);
    assert.equal(anzeigeWert('zustand', 'bunt'), null);

    const { d, p, installiere } = await aufbau();
    await installiere('vektor', { laeufer: code({ reiter: r.angaben! }) });
    await setzePaketSpeicher(d.kern, 'vektor', { 'anzeige.stand': '12/30', 'anzeige.modell': 'ok', geheim: 'bleibt' });
    const a = await p.anzeigen('vektor');
    assert.deepEqual(a.anzeigen.map((x) => x.wert), [{ art: 'anteil', zahl: 12, von: 30 }, { art: 'zustand', zustand: 'ok', text: '' }]);
    assert.equal(a.status, null);
  });

  it('Prüffunktion: bekommt die Werte im Klartext, ihre Meldungen stehen am Feld; ohne Läufer gilt nur die Prüfung von Ablago', async () => {
    const gesehen: Array<Record<string, unknown>> = [];
    const laeufer: PaketLaeufer = { aktion: async () => '', pruefeEinstellungen: async (_paket, w): Promise<Record<string, string>> => { gesehen.push(w); return w.konto === 'falsch' ? { konto: 'Dieses Konto kennt der Dienst nicht.' } : {}; } };
    const { p, installiere } = await aufbau(laeufer);
    const b = liesBeschreibung({ einstellungen: [{ abschnitt: 'Dienst', felder: [{ schluessel: 'konto', typ: 'text', pflicht: true }, { schluessel: 'token', typ: 'geheim' }] }] }).beschreibung!;
    await installiere('dienst', { laeufer: code({ reiter: { einstellungenPruefen: true } }), einstellungen: b });
    await assert.rejects(p.speichereEinstellungen('dienst', { werte: { konto: 'falsch', token: 'abc' } }, ICH),
      (x) => x instanceof Fachfehler && x.status === 422 && (x.details as { felderFehler: Record<string, string> }).felderFehler.konto === 'Dieses Konto kennt der Dienst nicht.');
    assert.equal(gesehen[0].token, 'abc', 'Geheimnis im Klartext, nur für das Paket');
    const e = await p.speichereEinstellungen('dienst', { werte: { konto: 'richtig', token: { behalten: true } } }, ICH);
    assert.equal(e.werte.konto, 'richtig');
    // Pflicht verletzt: Die Prüffunktion läuft gar nicht erst.
    const vorher = gesehen.length;
    await assert.rejects(p.speichereEinstellungen('dienst', { werte: { konto: '' } }, ICH));
    assert.equal(gesehen.length, vorher);
  });

  it('Ausprobieren im Manifest: Ereignis muss abonniert sein, Dateiarten wie „image/*“', () => {
    assert.match(liesReiterAngaben({ ausprobieren: { ereignis: 'post.eingegangen', dateiarten: ['application/pdf'] } }, []).fehler.join(), /muss in code.ereignisse stehen/);
    assert.match(liesReiterAngaben({ ausprobieren: { ereignis: 'post.eingegangen', dateiarten: ['pdf'] } }, ['post.eingegangen']).fehler.join(), /dateiarten/);
    const r = liesReiterAngaben({ ausprobieren: { ereignis: 'post.eingegangen', dateiarten: ['application/pdf', 'image/*'] } }, ['post.eingegangen']);
    assert.deepEqual(r.fehler, []);
    assert.ok(dateiartPasst(r.angaben!.ausprobieren!.dateiarten, 'image/png'));
    assert.ok(!dateiartPasst(r.angaben!.ausprobieren!.dateiarten, 'text/plain'));
  });
});

describe('Verlauf und Auslastung (#1003)', () => {
  const tag = (aufrufe: number, fehler: number, x: Partial<{ zeit: number; speicher: number; msMax: number; speicherMax: number }> = {}) => ({ tag: '2026-11-15', aufrufe, fehler, zeit: 0, speicher: 0, msSumme: aufrufe * 1000, msMax: 1000, speicherMax: 20, ...x });
  const G = { speicherMB: 256, sekunden: 120, parallel: 2 };

  it('Ampel in einfacher Sprache: ruhig, unauffällig, Grenzen, scheitert', () => {
    assert.equal(ampelVon([], G), 'ruhig');
    assert.equal(ampelVon([tag(40, 2)], G), 'unauffaellig');
    assert.equal(ampelVon([tag(40, 3, { zeit: 3 })], G), 'grenzen', 'drei Abbrüche wegen Zeit');
    assert.equal(ampelVon([tag(40, 0, { speicherMax: 230 })], G), 'grenzen', '90 % des Speichers');
    assert.equal(ampelVon([tag(10, 3)], G), 'scheitert');
    assert.equal(ampelVon([tag(100, 3)], G), 'unauffaellig', 'drei von hundert sind nicht häufig');
    assert.deepEqual(summeVon([tag(2, 1, { msMax: 5000 }), tag(4, 0)]), { aufrufe: 6, fehler: 1, zeit: 0, speicher: 0, msSumme: 6000, msMax: 5000, speicherMax: 20, msMittel: 1000 });
  });

  async function pruefeRepo(repo: Repo) {
    await repo.notiereVerlauf([
      { paket: 'a', art: 'installiert', was: '1.0.0', wer: 'markus@example.org' },
      { paket: 'a', art: 'ereignis', was: 'post.angelegt', ergebnis: 'ok', ms: 900, speicherMB: 30, bezug: { mappe: 'm1' }, netz: ['Netz: 1 × GET ki.example.org – 200, 1 KB hin, 2 KB zurück'] },
      { paket: 'a', art: 'ereignis', was: 'post.angelegt', ergebnis: 'zeit', ms: 120_000, speicherMB: 60, text: 'Zeitgrenze erreicht (120 s) – abgebrochen.' },
      { paket: 'a', art: 'protokoll', ergebnis: 'warnung', text: 'Modell 100% geladen' },
      { paket: 'b', art: 'aufruf', was: 'Frage beantwortet', ergebnis: 'ok', ms: 10 },
    ]);
    const alle = await repo.paketVerlauf('a', { anzahl: 10 });
    assert.deepEqual(alle.map((e) => e.art), ['protokoll', 'ereignis', 'ereignis', 'installiert'], 'neueste zuerst, nur dieses Paket');
    assert.deepEqual(alle[2].netz, ['Netz: 1 × GET ki.example.org – 200, 1 KB hin, 2 KB zurück']);
    assert.deepEqual(alle[2].bezug, { mappe: 'm1' });
    assert.deepEqual((await repo.paketVerlauf('a', { anzahl: 10, nurFehler: true })).map((e) => e.ergebnis), ['warnung', 'zeit']);
    assert.deepEqual((await repo.paketVerlauf('a', { anzahl: 10, suche: '100%' })).map((e) => e.art), ['protokoll'], 'Suche wörtlich, auch mit %');
    assert.deepEqual((await repo.paketVerlauf('a', { anzahl: 1, vor: alle[1].nr })).map((e) => e.nr), [alle[2].nr], 'blättern');
    const a = await repo.paketAuslastung('a', 30);
    assert.equal(a.tage.length, 1);
    assert.deepEqual({ ...a.tage[0], tag: '' }, { tag: '', aufrufe: 2, fehler: 1, zeit: 1, speicher: 0, msSumme: 120_900, msMax: 120_000, speicherMax: 60 });
    assert.ok(a.zuletzt);
    await repo.loescheVerlauf('a');
    assert.deepEqual(await repo.paketVerlauf('a', { anzahl: 10 }), []);
    assert.equal((await repo.paketVerlauf('b', { anzahl: 10 })).length, 1);
  }

  it('Speicher-Repo: schreiben, filtern, suchen, blättern, Auslastung je Tag, löschen', async () => { await pruefeRepo(speicherRepo()); });
  it('PostgreSQL: dasselbe', { skip: !process.env.TEST_DATABASE_URL && 'ohne TEST_DATABASE_URL' }, async () => {
    const db = await eigeneDatenbank('verlauf');
    const { pgRepo } = await import('../src/repo-pg');
    try { await pruefeRepo(pgRepo(db.sql, '00000000-0000-4000-8000-000000000001') as never as Repo); } finally { await db.ende(); }
  });

  it('Paketverwaltung: Mappe nur mit Titel, wenn man sie lesen darf; Einstellungen geändert ohne Werte', async () => {
    const { d, p, installiere } = await aufbau();
    const b = liesBeschreibung({ einstellungen: [{ abschnitt: 'Dienst', felder: [{ schluessel: 'konto', name: 'Konto', typ: 'text' }, { schluessel: 'token', name: 'Token', typ: 'geheim' }] }] }).beschreibung!;
    await installiere('dienst', { laeufer: code(), einstellungen: b });
    const typ = await d.mappentypen.legeTypAn({ name: 'Brief', felder: [{ key: 'nr', label: 'Nr', typ: 'text' }] });
    const m = await d.mappen.legeMappeAn({ typId: typ.id, werte: { nr: 'B-1' } }, null);
    await d.kern.repo.notiereVerlauf([{ paket: 'dienst', art: 'ereignis', was: 'post.angelegt', ergebnis: 'ok', bezug: { mappe: m.id } }]);
    await p.speichereEinstellungen('dienst', { werte: { konto: 'lena', token: 'geheim-123' } }, ICH);
    const alle = { lesen: null } as never;
    const keine = { lesen: { offen: [], je: [] } } as never;
    const v = await p.verlauf('dienst', {}, alle);
    assert.equal(v.eintraege[0].art, 'einstellungen');
    assert.equal(v.eintraege[0].was, 'Konto, Token');
    assert.equal(v.eintraege[0].wer, 'admin@example.org');
    assert.ok(!JSON.stringify(v).includes('geheim-123'), 'nie Werte');
    assert.equal(v.eintraege[1].bezug?.mappe, m.id);
    assert.ok(v.eintraege[1].bezug?.titel);
    assert.equal((await p.verlauf('dienst', {}, keine)).eintraege[1].bezug, null, 'ohne Leserecht kein Bezug');
    assert.equal(v.mehr, false);
  });
});
