/**
 * Ablago entdecken (#831, #832): Format von Rundgängen und Tipps, Ankerliste gegen die Oberfläche, Texte in beiden
 * Sprachen, Filter nach der Person, Tipp des Tages, Rundgang bei der ersten Anmeldung und Migration 088.
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { parse } from 'yaml';
import {
  istNeu, pruefeAnker, pruefeRundgaenge, pruefeTipps, RUNDGANG_TEXT_MAX, rundgangFuer, startetVonSelbst, TIPP_TEXT_MAX, tippDesTages, tippHandlung, tippPasst,
  type Texte, type Tipp,
} from '../../shared/src/entdecken';
import { Entdecken, entdeckenOrdner, ladeAblago } from '../src/entdecken';
import { Konten } from '../src/konten';
import { speicherKontoRepo } from '../src/konto-repo';
import { eigeneDatenbank } from './hilfe-db';

const WURZEL = new URL('../..', import.meta.url).pathname;
const ORDNER = join(WURZEL, 'shared/entdecken');
const yaml = (datei: string): unknown => parse(readFileSync(join(ORDNER, datei), 'utf8'));
const sprachdatei = (spr: string) => JSON.parse(readFileSync(join(WURZEL, `shared/src/sprachen/${spr}/entdecken.json`), 'utf8')) as Record<string, string>;
/** Texte einer Sprache wie im Server: Schlüssel „entdecken.…“. */
const texteIn = (spr: string): Texte => { const d = sprachdatei(spr); return (k) => d[k.replace(/^entdecken\./, '')]; };
const ANKER = pruefeAnker(yaml('anker.yaml')).anker;

function quelltexte(ordner: string): string {
  return readdirSync(ordner).map((n) => {
    const p = join(ordner, n);
    return statSync(p).isDirectory() ? quelltexte(p) : /\.tsx?$/.test(n) ? readFileSync(p, 'utf8') : '';
  }).join('\n');
}

describe('Format und Inhalt (Build-Test, #831, #832)', () => {
  it('Ankerliste, Rundgänge und Tipps von Ablago sind fehlerfrei – in Deutsch und Englisch', () => {
    assert.deepEqual(pruefeAnker(yaml('anker.yaml')).fehler, []);
    for (const spr of ['de', 'en']) {
      const x = ladeAblago(ORDNER, texteIn(spr));
      assert.deepEqual(x.fehler, [], `${spr}:\n${x.fehler.join('\n')}`);
      assert.equal(x.rundgaenge.length, 1);
      assert.deepEqual(x.rundgaenge[0].schritte.map((s) => s.schluessel), ['dreiteilung', 'neu', 'suche', 'erledigen', 'konto']);
      assert.ok(x.tipps.length >= 15, `${spr}: rund 15 Tipps, sind ${x.tipps.length}`);
      for (const t of x.tipps) assert.ok(t.text.length <= TIPP_TEXT_MAX, `${spr} ${t.schluessel}: ${t.text.length} Zeichen`);
      for (const s of x.rundgaenge[0].schritte) assert.ok(s.text.length <= RUNDGANG_TEXT_MAX);
    }
  });

  it('jeder Text in der Sprachdatei gehört zu einem Rundgang, Tipp oder zur Oberfläche; Deutsch und Englisch haben dieselben', () => {
    const de = sprachdatei('de'), en = sprachdatei('en');
    assert.deepEqual(Object.keys(en).sort(), Object.keys(de).sort());
    // Ohne Text in der Sprachdatei kein Tipp: Eine Datei ohne Englisch fällt durch.
    const ohne = pruefeTipps(yaml('tipps.yaml'), { herkunft: 'ablago', anker: ANKER, rundgaenge: ['ablago'], texte: (k) => (k.endsWith('.favoriten') ? undefined : texteIn('en')(k)) });
    assert.match(ohne.fehler.join('\n'), /Tipp „favoriten“: Text „text“ fehlt/);
  });

  it('jeder dokumentierte Anker kommt in der Oberfläche vor (data-anker bzw. anker)', () => {
    const code = quelltexte(join(WURZEL, 'web/src'));
    const fehlen = ANKER.filter((a) => {
      if (a.muster) return !code.includes(`\`${a.anker.slice(0, a.anker.indexOf('<'))}\${`);
      const m = a.anker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return !new RegExp(`(?:data-anker|anker)(?:=|: )["'\`]${m}["'\`]`).test(code);
    });
    assert.deepEqual(fehlen.map((a) => a.anker), []);
  });

  it('die Prüfung lehnt unbekannte Felder, Anker und Rundgänge, zu lange Texte und zu viele Schritte ab', () => {
    const texte: Texte = (k) => (k.endsWith('.ort') ? undefined : 'Text');
    const r = pruefeRundgaenge([
      { schluessel: 'gut', schritte: [{ schluessel: 'a', ziel: 'neu', ort: 'Oben' }] },
      { schluessel: 'feld', farbe: 'rot', schritte: [{ schluessel: 'a' }] },
      { schluessel: 'anker', schritte: [{ schluessel: 'a', ziel: 'gibt.es.nicht', ort: 'x' }] },
      { schluessel: 'lang', schritte: [{ schluessel: 'a', text: 'x'.repeat(RUNDGANG_TEXT_MAX + 1) }] },
      { schluessel: 'viele', schritte: Array.from({ length: 9 }, (_, i) => ({ schluessel: `s${i}` })) },
      { schluessel: 'ohne_ort', schritte: [{ schluessel: 'a', ziel: 'neu' }] },
      { schluessel: 'muster', schritte: [{ schluessel: 'a', ziel: 'mappe.register:dokumente', ort: 'x' }] },
    ], { herkunft: 'ablago', anker: ANKER, texte });
    assert.deepEqual(r.rundgaenge.map((x) => x.schluessel), ['gut', 'muster']);
    const f = r.fehler.join('\n');
    assert.match(f, /unbekanntes Feld „farbe“/);
    assert.match(f, /unbekannter Anker „gibt\.es\.nicht“/);
    assert.match(f, /„text“ ist 201 Zeichen lang, höchstens 200/);
    assert.match(f, /9 Schritte, höchstens 8/);
    assert.match(f, /Zu einem Ziel gehört „ort“/);
    // Pakete (Stufe 2): Texte stehen direkt in der Datei; „erste_anmeldung“ gibt es für sie nicht.
    const paket = pruefeRundgaenge([{ schluessel: 'vertraege', titel: 'Verträge', beschreibung: 'Kurz', start: 'erste_anmeldung', schritte: [{ schluessel: 'a', titel: 'A', text: 'B' }] }], { herkunft: 'paket:vertraege', anker: ANKER });
    assert.match(paket.fehler.join('\n'), /„erste_anmeldung“ gibt es nur für Ablagos eigenen Rundgang/);
    assert.equal(pruefeRundgaenge([{ schluessel: 'vertraege', titel: 'Verträge', beschreibung: 'Kurz', schritte: [{ schluessel: 'a', titel: 'A', text: 'B' }] }], { herkunft: 'paket:vertraege', anker: ANKER }).rundgaenge.length, 1);

    const x = pruefeTipps([
      { schluessel: 'gut', bereich: 'suche', ziel: 'startseite.suche' },
      { schluessel: 'beides', bereich: 'suche', ziel: 'neu', rundgang: 'ablago' },
      { schluessel: 'kein_rundgang', bereich: 'suche', rundgang: 'fehlt' },
      { schluessel: 'muster', bereich: 'suche', ziel: 'mappe.feld:betrag' },
      { schluessel: 'lang', bereich: 'suche', ziel: 'neu', text: 'x'.repeat(TIPP_TEXT_MAX + 1) },
      { schluessel: 'saetze', bereich: 'suche', ziel: 'neu', text: 'Eins. Zwei. Drei.' },
      { schluessel: 'bereich', bereich: 'wetter', ziel: 'neu' },
      { schluessel: 'version', bereich: 'suche', ziel: 'neu', ab_version: 'bald' },
    ], { herkunft: 'ablago', anker: ANKER, rundgaenge: ['ablago'], texte });
    assert.deepEqual(x.tipps.map((y) => y.schluessel), ['gut']);
    const g = x.fehler.join('\n');
    for (const m of [/genau eines von „ziel“/, /unbekannter Rundgang „fehlt“/, /keine feste Seite/, /161 Zeichen/, /höchstens zwei Sätze/, /„bereich“ muss/, /„ab_version“/]) assert.match(g, m);
    assert.match(pruefeTipps(Array.from({ length: 21 }, (_, i) => ({ schluessel: `t${i}`, bereich: 'suche', ziel: 'neu', text: 'Ein Tipp.' })), { herkunft: 'paket:p', anker: ANKER, rundgaenge: [] }).fehler.join('\n'), /21 Tipps, höchstens 20/);
  });
});

describe('Für die Person (#831, #832)', () => {
  const ablago = ladeAblago(ORDNER, texteIn('de'));
  const jonas = { verwalten: false, funktionen: new Set<never>() };
  const lena = { verwalten: true, funktionen: new Set(['fragen', 'mail'] as const) };

  it('Jonas bekommt keine Schritte und Tipps fürs Verwalten; Lena den Text mit „Ablago verwalten“', () => {
    const r = ablago.rundgaenge[0];
    const mitWerkbank = { ...r, schritte: [...r.schritte, { schluessel: 'werkbank', ziel: [], fuer: 'verwalten' as const, titel: 'Werkbank', text: 'Nur für Verwaltende' }] };
    const fuerJonas = rundgangFuer(mitWerkbank, jonas)!;
    assert.equal(fuerJonas.schritte.length, 5);
    assert.doesNotMatch(fuerJonas.schritte.at(-1)!.text, /Ablago verwalten/);
    const fuerLena = rundgangFuer(mitWerkbank, lena)!;
    assert.equal(fuerLena.schritte.length, 6);
    assert.match(fuerLena.schritte[4].text, /„Ablago verwalten“/);
    assert.ok(!ablago.tipps.filter((x) => tippPasst(x, jonas)).some((x) => x.bereich === 'verwalten' || x.funktion));
    assert.ok(ablago.tipps.filter((x) => tippPasst(x, lena)).some((x) => x.bereich === 'verwalten'));
    assert.ok(ablago.tipps.filter((x) => tippPasst(x, lena)).some((x) => x.funktion === 'fragen'));
    assert.ok(!ablago.tipps.filter((x) => tippPasst(x, lena)).some((x) => x.funktion === 'laufwerk'));
  });

  it('Tipp des Tages: höchstens einer am Tag, Neues zuerst mit „und n weitere“, Ausgeblendetes nie', () => {
    const l = [{ schluessel: 'a', neu: false }, { schluessel: 'b', neu: true }, { schluessel: 'c', neu: true }, { schluessel: 'd', neu: true }];
    const erster = tippDesTages(l, {}, '2026-11-07');
    assert.deepEqual(erster && { s: erster.tipp.schluessel, w: erster.weitere }, { s: 'b', w: 2 });
    let st = tippHandlung({}, 'b', 'gezeigt', '2026-11-07');
    assert.equal(tippDesTages(l, st, '2026-11-07')?.tipp.schluessel, 'b', 'am selben Tag derselbe');
    st = tippHandlung(st, 'b', 'erledigt', '2026-11-07');
    assert.equal(tippDesTages(l, st, '2026-11-07'), null, 'angeklickt: heute keiner mehr');
    assert.equal(tippDesTages(l, st, '2026-11-08')?.tipp.schluessel, 'c', 'am nächsten Tag der nächste');
    st = tippHandlung(tippHandlung(st, 'c', 'gezeigt', '2026-11-08'), 'c', 'ausblenden', '2026-11-08');
    assert.equal(tippDesTages(l, st, '2026-11-08'), null);
    assert.ok(st.aus?.includes('c'));
    assert.equal(tippDesTages(l, st, '2026-11-09')?.tipp.schluessel, 'd');
    st = tippHandlung(st, 'c', 'einblenden', '2026-11-09');
    assert.ok(!st.aus?.includes('c') && !st.gesehen?.includes('c'));
  });

  it('„Neu seit deinem letzten Besuch“ nach Version', () => {
    const x = { abVersion: '0.216.0' } as Tipp;
    assert.equal(istNeu(x, '0.215.0', '0.216.0'), true);
    assert.equal(istNeu(x, '0.216.0', '0.216.0'), false);
    assert.equal(istNeu(x, '0.215.0', '0.215.3'), false, 'noch nicht in dieser Version');
    assert.equal(istNeu(x, null, '0.216.0'), false);
    assert.equal(istNeu(x, 'Entwicklung', '0.216.0'), false);
  });

  it('Rundgang von selbst: nur ohne Merker oder nach „Später“ und neuer Anmeldung', () => {
    const r = ablago.rundgaenge[0];
    assert.equal(startetVonSelbst(r, {}, '2026-11-07T10:00:00Z'), true);
    assert.equal(startetVonSelbst(r, { ablago: { stand: 'gesehen' } }, '2026-11-07T10:00:00Z'), false);
    assert.equal(startetVonSelbst(r, { ablago: { stand: 'spaeter', am: '2026-11-07T10:05:00Z' } }, '2026-11-07T10:00:00Z'), false);
    assert.equal(startetVonSelbst(r, { ablago: { stand: 'spaeter', am: '2026-11-07T10:05:00Z' } }, '2026-11-08T08:00:00Z'), true);
    assert.equal(startetVonSelbst({ ...r, start: 'manuell' }, {}, null), false);
  });
});

describe('Server: Stand je Person und Merker (#831, #832)', () => {
  async function aufbau(o: { fragen?: boolean } = {}) {
    const konten = new Konten(speicherKontoRepo(), null, 'http://nas');
    const { benutzer: lena } = await konten.einrichten({ email: 'lena@example.org', name: 'Lena', passwort: 'ein-langes-passwort' });
    const { benutzer: jonas } = await konten.legeBenutzerAn({ email: 'jonas@example.org', name: 'Jonas' }, lena.id);
    let heute = '2026-11-07';
    const e = new Entdecken({
      einstellungen: (b) => konten.einstellungen(b), setzeEinstellung: (b, k, w) => konten.setzeEinstellung(b, k, w),
      version: () => '0.215.0', heute: () => heute, funktionen: async () => new Set(o.fragen ? ['fragen' as const] : []),
    });
    return { e, konten, lena: { ...lena, letzteAnmeldung: '2026-11-07T09:00:00Z' }, jonas: { ...jonas, letzteAnmeldung: '2026-11-07T09:00:00Z' }, morgen: () => { heute = '2026-11-08'; } };
  }

  it('liest Ablagos Dateien, filtert nach der Person und startet den Rundgang einmal von selbst', async () => {
    assert.ok(entdeckenOrdner(), 'shared/entdecken gefunden');
    const { e, lena, jonas } = await aufbau({ fragen: true });
    const sl = await e.stand(lena), sj = await e.stand(jonas);
    assert.equal(sl.starten, 'ablago');
    assert.ok(sl.tipps.some((x) => x.bereich === 'verwalten') && !sj.tipps.some((x) => x.bereich === 'verwalten'));
    assert.ok(sj.tipps.find((x) => x.schluessel === 'suche_in_dokumenten')?.ziel?.seite === '/ablage/start');
    assert.equal(sj.tipps.find((x) => x.schluessel === 'pakete'), undefined);
    assert.ok(sj.tipps.filter((x) => x.rundgang).every((x) => !x.clients), 'Rundgang-Tipps sind nichts für Clients');
    assert.ok(sj.tipps.some((x) => x.clients));
    // In Vertretung startet nichts von selbst.
    assert.equal((await e.stand(jonas, { vertretung: true })).starten, null);
    await e.rundgang(jonas, 'ablago', 'spaeter');
    assert.equal((await e.stand(jonas)).starten, null, 'nach „Später“ erst bei der nächsten Anmeldung');
    assert.equal((await e.stand({ ...jonas, letzteAnmeldung: new Date(Date.now() + 60_000).toISOString() })).starten, 'ablago');
    await e.rundgang(jonas, 'ablago', 'gesehen');
    await e.rundgang(jonas, 'ablago', 'spaeter');
    assert.equal((await e.stand({ ...jonas, letzteAnmeldung: new Date(Date.now() + 120_000).toISOString() })).starten, null, 'gesehen bleibt gesehen');
    await assert.rejects(e.rundgang(jonas, 'gibt_es_nicht', 'gesehen'));
    await assert.rejects(e.rundgang(jonas, 'ablago', 'irgendwas'));
  });

  it('Tipp des Tages je Person; × blendet aus, „Ablago entdecken“ zeigt ihn weiter; Tipps aus', async () => {
    const { e, konten, jonas, morgen } = await aufbau();
    const a = await e.stand(jonas);
    assert.equal(a.tipp?.schluessel, 'suche_in_dokumenten');
    assert.equal(a.tipp?.gesehen, false, 'neu: Punkt am Assistenten (#1219)');
    await e.tipp(jonas, 'suche_in_dokumenten', 'gezeigt');
    assert.deepEqual((await e.stand(jonas)).tipp, { schluessel: 'suche_in_dokumenten', weitere: 0, gesehen: true }, 'angesehen: derselbe Tipp, ohne Punkt');
    await e.tipp(jonas, 'suche_in_dokumenten', 'ausblenden');
    const b = await e.stand(jonas);
    assert.equal(b.tipp, null, 'heute keiner mehr');
    assert.equal(b.tipps.find((x) => x.schluessel === 'suche_in_dokumenten')?.ausgeblendet, true, 'auf „Ablago entdecken“ weiter sichtbar');
    morgen();
    assert.equal((await e.stand(jonas)).tipp?.schluessel, 'favoriten');
    await konten.setzeEinstellung(jonas, 'tipps', false);
    const c = await e.stand(jonas);
    assert.equal(c.tippsAn, false);
    assert.equal(c.tipp, null);
    assert.ok(c.tipps.length > 0);
    await assert.rejects(e.tipp(jonas, 'favoriten', 'loeschen'));
    // Gemerkt wird nur in den Einstellungen der Person – nichts geht nach außen.
    const st = await konten.einstellungen(jonas);
    assert.ok('entdecken_tipps' in st);
    assert.equal((st.entdecken_version as { jetzt: string }).jetzt, '0.215.0');
  });
});

describe('Migration 088 (#831)', () => {
  it('Konten, die sich schon angemeldet hatten, haben Ablagos Rundgang gesehen; offene Einladungen nicht', async () => {
    if (!process.env.TEST_DATABASE_URL) return;
    const db = await eigeneDatenbank('entdecken');
    const { sql } = db;
    const h = '00000000-0000-4000-8000-000000000831';
    await sql`INSERT INTO haushalte (id, name) VALUES (${h}, 'Test') ON CONFLICT DO NOTHING`;
    await sql`INSERT INTO benutzer (id, haushalt_id, email, name, rolle, letzte_anmeldung) VALUES
      ('00000000-0000-4000-8000-000000000001', ${h}, 'lena@example.org', 'Lena', 'mitglied', now()),
      ('00000000-0000-4000-8000-000000000002', ${h}, 'jonas@example.org', 'Jonas', 'mitglied', NULL)`;
    await sql.unsafe(readFileSync(join(WURZEL, 'server/migrations/088_entdecken.sql'), 'utf8'));
    const zeilen = await sql`SELECT benutzer_id::text AS id, wert FROM benutzer_einstellungen WHERE schluessel = 'entdecken_rundgaenge'`;
    assert.deepEqual(zeilen.map((z) => z.id), ['00000000-0000-4000-8000-000000000001']);
    assert.equal((zeilen[0].wert as { ablago: { stand: string } }).ablago.stand, 'gesehen');
    assert.ok(!Number.isNaN(Date.parse((zeilen[0].wert as { ablago: { am: string } }).ablago.am)));
    await db.ende();
  });
});

