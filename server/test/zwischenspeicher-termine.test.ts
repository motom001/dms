/**
 * Termine, Zahlen und Trefferzahl schneller (#918) – „Nachhinken ja, falsch nie“.
 *
 * - Vorfilter der Termine (fristtermine): liefert jede Mappe, die im Zeitraum einen Termin haben kann (auch
 *   wiederkehrend über Monats- und Jahresenden und den 29.02.), die Termine sind dieselben wie frisch gerechnet – im
 *   Arbeitsspeicher und mit PostgreSQL, mit und ohne Zwischenspeicher.
 * - Pflege des Vorfilters bei allen Wegen (anlegen, ändern, Papierkorb, wiederherstellen, endgültig löschen, viele auf
 *   einmal wie Import und Demo-Daten, Einspielen per COPY wie beim Wiederherstellen einer Sicherung, Änderung des Typs)
 *   und Füllen des Bestands durch die Migration.
 * - Zahlen je Typ und Ansicht: Stern und Notiz rechnen sie nicht neu; eigene Änderungen sind sofort sichtbar, auch über
 *   zwei Prozesse (Mappenstand).
 * - Zahl der Treffer: zwischengespeichert, genau wie frisch gezählt.
 * - DMS_ZWISCHENSPEICHER=aus: alles frisch, gleiche Ergebnisse.
 */
import assert from 'node:assert/strict';
import { copyFile, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { after, before, describe, it } from 'node:test';
import { fristFelder, folgetermine, istDatum, kannTerminHaben } from '../../shared/src/fristen';
import type { Mappe, Mappentyp } from '../../shared/src/model';
import { heuteIn, verschiebe } from '../../shared/src/sichten';
import { speicherDateien } from '../src/dateispeicher';
import { Dienst } from '../src/dienst';
import { speicherEinstellungen, type Einstellungen } from '../src/einstellungen';
import { Konten } from '../src/konten';
import { speicherKontoRepo } from '../src/konto-repo';
import { speicherKurzzustand } from '../src/kurzzustand';
import { kontext, type Kontext } from '../src/protokoll';
import type { Repo, SeitenAnfrage } from '../src/repo';
import { speicherRepo } from '../src/repo-speicher';
import { EIGENE_MAPPEN, Haushaltsstand, MINDESTENS_MS, mitFavoriten, NUR_FAVORITEN, richteZwischenspeicherEin, Zaehlerspeicher, zwischenspeicherAus } from '../src/zaehlerspeicher';
import { wieImModus } from './hilfen';

const PW = 'ein-langes-passwort';
const HEUTE = heuteIn();
const J = Number(HEUTE.slice(0, 4)) + 1;
const schalt = (j: number) => (j % 4 === 0 && j % 100 !== 0) || j % 400 === 0;
const L = [0, 1, 2, 3].map((i) => J + i).find(schalt)!;
const pad = (n: number) => String(n).padStart(2, '0');
const letzter = (j: number, m: number) => new Date(Date.UTC(j, m, 0)).getUTCDate();

/** Zeiträume über Monats- und Jahresenden und den 29.02. */
const ZEITRAEUME: Array<[string, string]> = [
  [`${J}-01-01`, `${J}-12-31`],
  [`${J}-02-01`, `${J}-02-${pad(letzter(J, 2))}`],
  [`${J}-12-15`, `${J + 1}-01-15`],
  [`${L}-02-01`, `${L}-03-31`],
  [`${L}-02-29`, `${L}-02-29`],
  [`${J}-03-31`, `${J}-04-30`],
  [`${J}-01-31`, `${J}-01-31`],
  [HEUTE, verschiebe(HEUTE, 31)],
  [HEUTE, verschiebe(HEUTE, 365)],
];
const RHYTHMEN = [1, 2, 3, 5, 6, 12, 24];

/** Zufällig, aber wiederholbar. */
function zufall(start: number) { let s = start; return () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; }; }
function datumZufall(r: () => number): string {
  const j = 2018 + Math.floor(r() * (J - 2018 + 2));
  const m = 1 + Math.floor(r() * 12);
  // Monatsenden häufig: 28.–31.
  const t = r() < 0.4 ? Math.max(1, letzter(j, m) - Math.floor(r() * 4)) : 1 + Math.floor(r() * letzter(j, m));
  return `${j}-${pad(m)}-${pad(t)}`;
}

describe('Vorfilter der Termine: kann im Zeitraum liegen (#918)', () => {
  it('jede Mappe mit Termin im Zeitraum ist Kandidat (gegen folgetermine); jährlich in einem Monat nur wenige', () => {
    const r = zufall(918);
    const daten = [...Array.from({ length: 400 }, () => datumZufall(r)), '2024-02-29', '2023-01-31', '2022-12-31', '2025-11-30', `${L}-02-29`, `${J}-02-28`];
    let jaehrlichImMonat = 0; let jaehrlich = 0;
    for (const [von, bis] of ZEITRAEUME) {
      for (const d of daten) {
        for (const m of [null, ...RHYTHMEN]) {
          const hat = (d >= von && d <= bis) || (m !== null && folgetermine(d, m, von, bis).length > 0);
          const kann = kannTerminHaben(d, m, von, bis);
          if (hat) assert.ok(kann, `${d} alle ${m} Monate in ${von} … ${bis}`);
          if (m === null) assert.equal(kann, hat, 'einmalig: genau das Datum im Zeitraum');
          if (m === 12 && von === `${J}-02-01` && d < von) { jaehrlich++; if (kann) jaehrlichImMonat++; }
        }
      }
    }
    assert.ok(jaehrlichImMonat < jaehrlich / 4, `jährlich, Februar: ${jaehrlichImMonat} von ${jaehrlich} Kandidaten`);
  });

  it('unsichere Werte (Tag 00, Monat 13, Jahr vor 0100) sind immer Kandidaten, Daten nach dem Zeitraum nie', () => {
    for (const d of ['2026-02-00', '2026-13-05', '0099-05-05']) assert.equal(kannTerminHaben(d, 12, `${J}-02-01`, `${J}-02-28`), true, d);
    assert.equal(kannTerminHaben(`${J + 2}-02-01`, 1, `${J}-02-01`, `${J}-02-28`), false);
  });

  it('mitFavoriten erkennt Favoriten in Bedingungen und Anfragen', () => {
    assert.equal(mitFavoriten([{ typen: ['t'], filter: [{ art: 'favorit', benutzer: 'b' }] }]), true);
    assert.equal(mitFavoriten({ favoriten: { benutzerId: 'b' } }), true);
    assert.equal(mitFavoriten({ typId: 't', lesen: null }), false);
  });
});

/* ---------- Dienst: gemeinsam für Arbeitsspeicher und PostgreSQL ---------- */

const frist = (wiederholung: number | null) => ({ vorlauf: 1, einheit: 'tage', empfaengerFeld: null, text: '{feld} {datum}', wiederholung });
const FELDER = [
  { key: 'nr', label: 'Nummer', typ: 'text' },
  { key: 'einmal', label: 'Einmal', typ: 'datum', frist: frist(null) },
  { key: 'monat', label: 'Monatlich', typ: 'datum', frist: frist(1) },
  { key: 'quartal', label: 'Vierteljährlich', typ: 'datum', frist: frist(3) },
  { key: 'fuenf', label: 'Alle fünf Monate', typ: 'datum', frist: frist(5) },
  { key: 'jahr', label: 'Jährlich', typ: 'datum', frist: frist(12) },
  { key: 'zwei', label: 'Alle zwei Jahre', typ: 'datum', frist: frist(24) },
  { key: 'ohne', label: 'Ohne Frist', typ: 'datum' },
];

interface Aufbau {
  d: Dienst; roh: Repo; lena: { id: string; rolle: string }; jonas: { id: string; rolle: string };
  vertrag: Mappentyp; neu: () => Dienst; einstellungen: Einstellungen;
}

async function aufbau(roh: Repo, kontoRepo: ReturnType<typeof speicherKontoRepo>, einstellungen: Einstellungen): Promise<Aufbau> {
  const d = new Dienst(roh, speicherDateien(), { einstellungen });
  d.mindestensMs = 0;
  const konten = new Konten(kontoRepo, null, 'http://nas', d.systemtypen.benutzerspiegel());
  d.verbindeKonten(konten.papierkorbHaken());
  const { benutzer: lena } = await konten.einrichten({ email: 'lena@example.org', name: 'Lena', passwort: PW });
  const jonas = (await konten.legeBenutzerAn({ email: 'jonas@example.org', name: 'Jonas' }, lena.id)).benutzer;
  await d.postSystemmappen.gleicheBenutzerAb(await konten.listeBenutzer());
  const ich = async (id: string) => { const b = wieImModus((await konten.listeBenutzer()).find((x) => x.id === id)!); return { id: b.id, rolle: b.rolle }; };
  const vertrag = await d.mappentypen.legeTypAn({ name: 'Vertrag', felder: FELDER });
  return {
    d, roh, lena: await ich(lena.id), jonas: await ich(jonas.id), vertrag, einstellungen,
    neu: () => { const f = new Dienst(roh, speicherDateien(), { einstellungen }); f.mindestensMs = 0; return f; },
  };
}

/** Derselbe Bestand, aber ein eigener Dienst, dessen Anfragen an seite() mitgeschrieben werden. */
function mitProtokollDienst(h: Aufbau, aufrufe: SeitenAnfrage[]): Aufbau {
  const d = new Dienst(mitProtokoll(h.roh, aufrufe), speicherDateien(), { einstellungen: h.einstellungen });
  d.mindestensMs = 0;
  return { ...h, d };
}
/** Nach Änderungen: Die Datenbank zählt ihren Stand kurz danach hoch, Hintergrundarbeit läuft nach. */
const ruhe = () => new Promise((r) => setTimeout(r, 100));

/** Termine der Frist-Felder, wie sie frisch gerechnet werden: jede Mappe, jedes Feld, Datum und Rhythmus des Typs. */
function erwartet(mappen: Mappe[], typ: Mappentyp, von: string, bis: string): string[] {
  const ab = von > HEUTE ? von : HEUTE;
  const s: string[] = [];
  for (const m of mappen) {
    for (const f of fristFelder(typ)) {
      const w = m.werte[f.key];
      if (!istDatum(w)) continue;
      if (w >= ab && w <= bis) s.push(`${m.id}|${f.key}|${w}|e`);
      if (f.frist!.wiederholung) for (const x of folgetermine(w, f.frist!.wiederholung, ab, bis)) s.push(`${m.id}|${f.key}|${x}|f`);
    }
  }
  return s.sort();
}
const gesehen = (t: Awaited<ReturnType<Dienst['termine']>>, typId: string) =>
  t.eintraege.filter((e) => e.art === 'frist' && !e.faellig && e.typId === typId).map((e) => `${e.mappeId}|${e.feldKey}|${e.datum}|${e.folgetermin ? 'f' : 'e'}`).sort();

async function mitSchalterAus<T>(f: () => Promise<T>): Promise<T> {
  richteZwischenspeicherEin({ DMS_ZWISCHENSPEICHER: 'aus' });
  try { assert.equal(zwischenspeicherAus(), true); return await f(); } finally { richteZwischenspeicherEin({}); }
}

async function pruefeTermine(h: Aufbau) {
  const { d, roh, lena, vertrag } = h;
  // Mappen über den Dienst und – mit Werten, die die Oberfläche nicht annimmt – direkt im Repo.
  const r = zufall(4711);
  const felder = ['einmal', 'monat', 'quartal', 'fuenf', 'jahr', 'zwei', 'ohne'];
  for (let i = 0; i < 40; i++) {
    const werte: Record<string, unknown> = { nr: `V${i}` };
    for (const k of felder) if (r() < 0.45) werte[k] = datumZufall(r);
    await d.mappen.legeMappeAn({ typId: vertrag.id, werte }, lena.id);
  }
  for (const werte of [
    { nr: 'S1', jahr: '2024-02-29', monat: '2023-01-31', quartal: '2022-12-31' },
    { nr: 'S2', zwei: `${L - 2}-02-29`, fuenf: '2025-11-30', einmal: `${L}-02-29` },
    { nr: 'S3', jahr: '2026-02-30', monat: '0099-05-05', quartal: 'kein Datum', einmal: '' },
    { nr: 'S4', jahr: `${J + 3}-01-01`, monat: ['2024-01-01'] },
  ]) await roh.legeMappeAn(crypto.randomUUID(), vertrag.id, werte as never, [], lena.id);
  const z = await d.rechtepruefung.zugriff(lena);
  const typ = (await roh.listeTypen()).find((t) => t.id === vertrag.id)!;
  const mappen = await roh.listeMappen(vertrag.id);
  const frisch = h.neu();
  for (const [von, bis] of ZEITRAEUME) {
    const soll = erwartet(mappen, typ, von, bis);
    const a = await d.termine(z, { von, bis });
    assert.deepEqual(gesehen(a, vertrag.id), soll, `frisch gerechnet ${von} … ${bis}`);
    const b = await d.termine(z, { von, bis });
    assert.deepEqual(b, a, `aus dem Zwischenspeicher gleich ${von} … ${bis}`);
    assert.deepEqual(await frisch.termine(await frisch.rechtepruefung.zugriff(lena), { von, bis }), a, `anderer Dienst gleich ${von} … ${bis}`);
    assert.deepEqual(await mitSchalterAus(() => d.termine(z, { von, bis })), a, `ohne Zwischenspeicher gleich ${von} … ${bis}`);
  }
  assert.ok(erwartet(mappen, typ, `${L}-02-29`, `${L}-02-29`).length > 0, 'der 29.02. hat Termine');
}

async function pruefeNaechsterTermin(h: Aufbau) {
  const { d, lena, vertrag } = h;
  const ausJahr = async (x: Dienst) => {
    const t = await x.termine(await x.rechtepruefung.zugriff(lena), { von: HEUTE, bis: verschiebe(HEUTE, 365) });
    return { termin: t.eintraege.find((e) => e.datum >= HEUTE) ?? null, ueberfaellig: t.eintraege.filter((e) => e.faellig && e.datum < HEUTE).length };
  };
  // Nur ein jährlicher Termin in gut zwei Monaten: nichts in den ersten 31 Tagen, dann das ganze Jahr.
  const typ2 = await d.mappentypen.legeTypAn({ name: 'Versicherung', felder: [{ key: 'nr', label: 'Nummer', typ: 'text' }, { key: 'jahr', label: 'Jährlich', typ: 'datum', frist: frist(12) }] });
  await d.mappen.legeMappeAn({ typId: typ2.id, werte: { nr: 'A', jahr: verschiebe(verschiebe(HEUTE, 65), -12, 'monate') } }, lena.id);
  const mitVertrag = async (x: Dienst) => { const t = await x.termine(await x.rechtepruefung.zugriff(lena), { von: HEUTE, bis: verschiebe(HEUTE, 365) }); return t.eintraege.some((e) => e.typId === vertrag.id); };
  if (!(await mitVertrag(d))) {
    const n = await d.naechsterTermin(await d.rechtepruefung.zugriff(lena));
    assert.equal(n.termin?.datum, verschiebe(HEUTE, 65));
  }
  assert.deepEqual(await d.naechsterTermin(await d.rechtepruefung.zugriff(lena)), await ausJahr(d));
  // Dazu ein Termin in zehn Tagen und zwei am selben Tag mit gleichem Titel: eindeutig, wie aus dem ganzen Jahr.
  await d.mappen.legeMappeAn({ typId: typ2.id, werte: { nr: 'B', jahr: verschiebe(HEUTE, 10) } }, lena.id);
  await d.mappen.legeMappeAn({ typId: typ2.id, werte: { nr: 'B', jahr: verschiebe(HEUTE, 10) } }, lena.id);
  // Der Zugriff (mit den Mappentypen) gilt je Anfrage – nach dem neuen Typ also neu.
  const z = await d.rechtepruefung.zugriff(lena);
  const n = await d.naechsterTermin(z);
  assert.deepEqual(n, await ausJahr(d));
  assert.deepEqual(n, await ausJahr(h.neu()));
  assert.deepEqual(await mitSchalterAus(() => d.naechsterTermin(z)), n);
  assert.ok(n.termin && n.termin.datum <= verschiebe(HEUTE, 10));
}

async function pruefeTypaenderung(h: Aufbau) {
  const { d, roh, lena } = h;
  const typ = await d.mappentypen.legeTypAn({ name: 'Wartung', felder: [{ key: 'nr', label: 'Nummer', typ: 'text' }, { key: 'datum', label: 'Datum', typ: 'datum' }] });
  await d.mappen.legeMappeAn({ typId: typ.id, werte: { nr: 'W1', datum: `${J - 3}-03-31` } }, lena.id);
  const zeitraum = { von: `${J}-01-01`, bis: `${J}-12-31` };
  // Je Abruf ein neuer Zugriff – wie je Anfrage; er bringt die Mappentypen mit.
  const zahl = async () => (await d.termine(await d.rechtepruefung.zugriff(lena), zeitraum)).eintraege.filter((e) => e.typId === typ.id).map((e) => e.datum);
  assert.deepEqual(await zahl(), [], 'noch keine Frist');
  // Feld wird zur jährlichen Frist: sofort der Termin, ohne dass die Mappe gespeichert wird.
  const t = (await roh.listeTypen()).find((x) => x.id === typ.id)!;
  const mitFrist = (w: number | null) => ({ ...t, felder: t.felder.map((f) => (f.key === 'datum' ? { ...f, frist: frist(w) } : f)) });
  await d.mappentypen.aendereTyp(typ.id, mitFrist(12));
  assert.deepEqual(await zahl(), [`${J}-03-31`]);
  // Rhythmus vierteljährlich: 30.06., 30.09., 31.12. dazu (Monatsende gekappt, vom Datum aus gerechnet).
  await d.mappentypen.aendereTyp(typ.id, mitFrist(3));
  assert.deepEqual(await zahl(), [`${J}-03-31`, `${J}-06-30`, `${J}-09-30`, `${J}-12-31`]);
  await d.mappentypen.aendereTyp(typ.id, mitFrist(null));
  assert.deepEqual(await zahl(), [], 'einmalig, Datum liegt vor dem Zeitraum');
}

async function pruefeZahlen(h: Aufbau) {
  const { d, lena, jonas, vertrag } = h;
  const zahlen = async (ich: { id: string; rolle: string }, benutzerId?: string) => {
    const k: Kontext = { anfrage: 't', db: { anzahl: 0, ms: 0 }, ...(benutzerId ? { benutzerId } : {}) };
    const z = await kontext.run(k, async () => d.sichten.zaehler(ich, await d.rechtepruefung.zugriff(ich)));
    return { z, art: k.zwischenspeicher?.art };
  };
  const frisch = async (ich: { id: string; rolle: string }) => { const f = h.neu(); return f.sichten.zaehler(ich, await f.rechtepruefung.zugriff(ich)); };
  const teil = (x: Awaited<ReturnType<Dienst['sichten']['zaehler']>>) => ({ typen: x.typen, eingang: x.eingang, favoriten: x.favoriten, sichten: x.sichten, papierkorb: x.papierkorb });
  const m = await d.mappen.legeMappeAn({ typId: vertrag.id, werte: { nr: 'Z1' } }, lena.id);
  await ruhe();
  await zahlen(jonas); await zahlen(lena);
  assert.equal((await zahlen(jonas)).art, 'treffer');
  // Stern (von Lena) und Notiz: keine neue Zählung für Jonas – und Lenas Zahl der Favoriten stimmt trotzdem sofort.
  await d.mappen.setzeFavorit({ id: lena.id }, m.id, true);
  await ruhe();
  assert.equal((await zahlen(jonas)).art, 'treffer', 'Stern: Zahlen nicht neu gerechnet');
  const l = await zahlen(lena);
  assert.equal(l.art, 'treffer', 'Stern: auch für Lena nicht die Zahlen je Typ');
  assert.equal(l.z.favoriten, 1, 'die eigene Zahl der Favoriten sofort');
  assert.deepEqual(teil(l.z), teil(await frisch(lena)));
  await d.mappenNotizen.legeNotizAn(m.id, 'Bitte prüfen', lena.id);
  await ruhe();
  assert.equal((await zahlen(jonas)).art, 'treffer', 'Notiz: Zahlen nicht neu gerechnet');
  // Mappe ändern: neu gerechnet, wie frisch.
  await d.mappen.legeMappeAn({ typId: vertrag.id, werte: { nr: 'Z2' } }, lena.id);
  const j = await zahlen(jonas);
  assert.equal(j.art, 'neu');
  assert.deepEqual(teil(j.z), teil(await frisch(jonas)));
  assert.deepEqual(teil((await mitSchalterAus(() => zahlen(jonas))).z), teil(j.z));
  // Mit Mindestgültigkeit (wie in Anfragen): die Änderung eines anderen darf kurz nachhinken, die eigene nie.
  d.mindestensMs = MINDESTENS_MS;
  try {
    const vorher = (await zahlen(jonas, jonas.id)).z.typen[vertrag.id].anzahl;
    await kontext.run({ anfrage: 'l', db: { anzahl: 0, ms: 0 }, benutzerId: lena.id }, () => d.mappen.legeMappeAn({ typId: vertrag.id, werte: { nr: 'Z3' } }, lena.id));
    assert.equal((await zahlen(lena, lena.id)).z.typen[vertrag.id].anzahl, vorher + 1, 'Lena sieht ihre Änderung sofort');
    const kurz = await zahlen(jonas, jonas.id);
    assert.ok([vorher, vorher + 1].includes(kurz.z.typen[vertrag.id].anzahl), 'Jonas: bisheriger oder neuer Wert');
    await kontext.run({ anfrage: 'j', db: { anzahl: 0, ms: 0 }, benutzerId: jonas.id }, () => d.mappen.legeMappeAn({ typId: vertrag.id, werte: { nr: 'Z4' } }, jonas.id));
    assert.equal((await zahlen(jonas, jonas.id)).z.typen[vertrag.id].anzahl, vorher + 2, 'Jonas sieht seine Änderung sofort');
  } finally { d.mindestensMs = 0; }
}

async function pruefeTrefferzahl(h: Aufbau, aufrufe: SeitenAnfrage[]) {
  const { d, lena, jonas, vertrag } = h;
  const seite = async (x: Dienst, ich: { id: string; rolle: string }, q: Record<string, unknown>) => x.sichten.seite(ich, { sicht: `typ:${vertrag.id}`, anzahl: 5, ...q }, await x.rechtepruefung.zugriff(ich));
  /** Wie oft der Dienst (nicht der frische zum Vergleich) gezählt hat. */
  const gezaehlt = () => aufrufe.filter((a) => a.zahl === undefined).length;
  const vergleiche = async (q: Record<string, unknown>, was: string) => {
    const a = await seite(d, jonas, q);
    const f = await seite(h.neu(), jonas, q);
    assert.equal(a.gesamt, f.gesamt, `${was}: Zahl wie frisch gezählt`);
    assert.deepEqual(a.mappen.map((m) => m.id), f.mappen.map((m) => m.id), `${was}: dieselbe Seite`);
    return a.gesamt;
  };
  for (let i = 0; i < 7; i++) await d.mappen.legeMappeAn({ typId: vertrag.id, werte: { nr: `L${i}` } }, lena.id);
  await ruhe();
  const n = await vergleiche({}, 'erstes Mal');
  let x = gezaehlt();
  assert.ok(x >= 1);
  assert.equal(await vergleiche({ sortierung: 'nr', absteigend: 'true' }, 'andere Reihenfolge'), n);
  assert.equal(await vergleiche({ von: 5 }, 'zweites Blatt'), n);
  assert.equal(gezaehlt(), x, 'nicht noch einmal gezählt');
  // Stern: keine neue Zählung; neue Mappe: neu gezählt, eine mehr.
  await d.mappen.setzeFavorit({ id: lena.id }, (await seite(d, jonas, {})).mappen[0].id, true);
  await ruhe();
  await seite(d, jonas, {});
  assert.equal(gezaehlt(), x, 'Stern zählt nicht neu');
  await d.mappen.legeMappeAn({ typId: vertrag.id, werte: { nr: 'T1' } }, lena.id);
  assert.equal(await vergleiche({}, 'nach dem Anlegen'), n + 1, 'sofort');
  assert.equal(gezaehlt(), x + 1);
  await ruhe();
  // Suche in Titel und Werten: zwischengespeichert; in Notizen: immer gezählt (Notizen ändern keinen Stand).
  assert.equal(await vergleiche({ suche: 'T1' }, 'Suche'), 1);
  x = gezaehlt();
  await seite(d, jonas, { suche: 'T1' });
  assert.equal(gezaehlt(), x, 'Suche: Zahl aus dem Zwischenspeicher');
  const notiz = await d.mappen.legeMappeAn({ typId: vertrag.id, werte: { nr: 'T2' } }, lena.id);
  assert.equal(await vergleiche({ suche: 'Wasserschaden', notizen: 'true' }, 'Suche in Notizen'), 0);
  await d.mappenNotizen.legeNotizAn(notiz.id, 'Wasserschaden im Keller', lena.id);
  assert.equal(await vergleiche({ suche: 'Wasserschaden', notizen: 'true' }, 'Suche in Notizen nach neuer Notiz'), 1);
  // Favoriten: am Haushaltsstand – ein Stern gilt sofort.
  const fav = async () => (await d.sichten.seite(lena, { sicht: 'favoriten' }, await d.rechtepruefung.zugriff(lena))).gesamt;
  const f0 = await fav();
  await d.mappen.setzeFavorit({ id: lena.id }, notiz.id, true);
  assert.equal(await fav(), f0 + 1, 'Favoriten: Stern sofort gezählt');
  // Ohne Zwischenspeicher: dieselbe Zahl, jedes Mal gezählt.
  await ruhe();
  const mit = (await seite(d, jonas, {})).gesamt;
  x = gezaehlt();
  assert.equal((await mitSchalterAus(() => seite(d, jonas, {}))).gesamt, mit);
  assert.equal((await mitSchalterAus(() => seite(d, jonas, {}))).gesamt, mit);
  assert.equal(gezaehlt(), x + 2);
}

/** Repo, das die Anfragen an seite() mitschreibt. */
function mitProtokoll(roh: Repo, aufrufe: SeitenAnfrage[]): Repo {
  return new Proxy(roh, { get(z, p, e) { const w = Reflect.get(z, p, e); if (p === 'seite') return (o: SeitenAnfrage) => { aufrufe.push(o); return (w as Repo['seite']).call(z, o); }; return w; } });
}

describe('Dienst im Arbeitsspeicher (#918)', () => {
  const neu = async () => { const aufrufe: SeitenAnfrage[] = []; const h = await aufbau(speicherRepo(), speicherKontoRepo(), speicherEinstellungen()); return { h, aufrufe }; };
  it('Termine wie frisch gerechnet – wiederkehrend über Monats- und Jahresenden und den 29.02., mit und ohne Zwischenspeicher', async () => { await pruefeTermine((await neu()).h); });
  it('Startseite: nächster Termin wie aus dem ganzen Jahr', async () => { await pruefeNaechsterTermin((await neu()).h); });
  it('Typ ändern (Frist dazu, Rhythmus ändern, Frist weg) wirkt sofort', async () => { await pruefeTypaenderung((await neu()).h); });
  it('Zahlen: Stern und Notiz rechnen nicht neu; eigene Änderung sofort', async () => { await pruefeZahlen((await neu()).h); });
  it('Zahl der Treffer: zwischengespeichert und genau', async () => { const x = await neu(); await pruefeTrefferzahl(mitProtokollDienst(x.h, x.aufrufe), x.aufrufe); });
});

describe('Mappenstand über zwei Prozesse (#918)', () => {
  it('Stern zählt nur den Haushaltsstand; eigene Änderung im anderen Prozess sofort, die anderer kurz später', async () => {
    let db = 1; let dbM = 1;
    const z = speicherKurzzustand();
    const prozess = () => {
      const stand = new Haushaltsstand(new Set(), { lies: async () => db, erhoehe: async () => ++db });
      const mappen = new Haushaltsstand(new Set(), { lies: async () => dbM, erhoehe: async () => ++dbM }, { ohne: NUR_FAVORITEN, art: EIGENE_MAPPEN });
      stand.teileEigene(z); mappen.teileEigene(z);
      const repo = stand.umhuelle({ setzeFavorit: async () => {}, aendereMappe: async () => {}, holeMappe: async () => 1 }, mappen);
      return { stand, mappen, repo };
    };
    const A = prozess(); const B = prozess();
    const speicherB = new Zaehlerspeicher<number>(B.mappen);
    let zaehlungen = 0;
    const zaehle = async () => ({ wert: ++zaehlungen, zeitabhaengig: false });
    const g = (wer: string) => ({ mindestensMs: MINDESTENS_MS, wer });
    await speicherB.hole('k', zaehle, g('jonas'));
    await kontext.run({ benutzerId: 'lena' } as never, () => A.repo.holeMappe());
    await kontext.run({ benutzerId: 'lena' } as never, () => A.repo.setzeFavorit());
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(db, 2, 'Stern: Haushaltsstand');
    assert.equal(dbM, 1, 'Stern: nicht der Mappenstand');
    assert.equal((await speicherB.hole('k', zaehle, g('lena'))).art, 'treffer', 'nach einem Stern keine neue Zählung, auch nicht für Lena');
    await kontext.run({ benutzerId: 'lena' } as never, () => A.repo.aendereMappe());
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(dbM, 2);
    assert.equal((await speicherB.hole('k', zaehle, g('jonas'))).art, 'treffer', 'Jonas: kurz noch der bisherige Wert');
    assert.equal((await speicherB.hole('k', zaehle, g('lena'))).art, 'neu', 'Lena: ihre Änderung sofort, auch im anderen Prozess');
  });

  it('eigene Änderung im selben Prozess sofort, auch bevor die Datenbank hochgezählt hat', async () => {
    const stand = new Haushaltsstand(new Set(), { lies: async () => 7, erhoehe: () => new Promise<number>(() => {}) });
    const zs = new Zaehlerspeicher<number>(stand);
    let n = 0;
    const zaehle = async () => ({ wert: ++n, zeitabhaengig: false });
    assert.equal((await zs.hole('k', zaehle)).art, 'neu');
    assert.equal((await zs.hole('k', zaehle)).art, 'treffer');
    await kontext.run({ benutzerId: 'lena' } as never, () => stand.erhoehe());
    assert.deepEqual(await zs.hole('k', zaehle, { mindestensMs: MINDESTENS_MS, wer: 'lena' }), { wert: 2, art: 'neu' });
  });

  it('DMS_ZWISCHENSPEICHER: aus, 0, nein, off schalten ab; sonst an', () => {
    try {
      for (const w of ['aus', 'AUS', '0', 'nein', 'false', 'off']) { richteZwischenspeicherEin({ DMS_ZWISCHENSPEICHER: w }); assert.equal(zwischenspeicherAus(), true, w); }
      for (const w of [undefined, '', 'an', '1']) { richteZwischenspeicherEin({ DMS_ZWISCHENSPEICHER: w }); assert.equal(zwischenspeicherAus(), false, String(w)); }
    } finally { richteZwischenspeicherEin({}); }
  });
});

const url = process.env.TEST_DATABASE_URL;
const EIGENE_DB = `dms_test_918_${process.pid}`;
describe('PostgreSQL: Vorfilter, Pflege und Migration (#918)', { skip: url ? false : 'TEST_DATABASE_URL nicht gesetzt' }, () => {
  const HAUSHALT = '00000000-0000-4000-8000-000000000001';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Module erst nach dem Setzen der Umgebung dynamisch geladen; Typ im Test ohne Belang
  let sql: any; let haupt: any;
  let ordner = '';
  let h!: Aufbau;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Module erst nach dem Setzen der Umgebung dynamisch geladen; Typ im Test ohne Belang
  let mod: any;
  /** fristtermine stimmt genau mit den Datumswerten der Mappen überein. */
  const abgleich = async (was: string) => {
    const soll = sql`SELECT m.id AS mappe_id, m.haushalt_id, m.typ_id, e.key AS feld, e.value #>> '{}' AS datum
      FROM mappen m, jsonb_each(m.werte) e WHERE jsonb_typeof(e.value) = 'string' AND (e.value #>> '{}') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'`;
    const ist = sql`SELECT mappe_id, haushalt_id, typ_id, feld, datum::text FROM fristtermine`;
    const [r] = await sql`SELECT (SELECT count(*) FROM (${soll} EXCEPT ${ist}) x)::int AS fehlt, (SELECT count(*) FROM (${ist} EXCEPT ${soll}) y)::int AS zuviel,
      (SELECT count(*) FROM fristtermine WHERE monat IS DISTINCT FROM dms_fristmonat(datum))::int AS monat`;
    assert.deepEqual(r, { fehlt: 0, zuviel: 0, monat: 0 }, was);
  };

  before(async () => {
    const { verbinde, migriere } = await import('../src/db');
    mod = { ...await import('../src/repo-pg'), ...await import('../src/konto-repo'), ...await import('../src/einstellungen') };
    // Eigene Datenbank: die Testdateien laufen parallel auf derselben Test-Datenbank; das Schema dort zu leeren
    // würde anderen Dateien mitten im Lauf die Tabellen wegnehmen.
    haupt = verbinde(url!);
    await haupt.unsafe(`DROP DATABASE IF EXISTS ${EIGENE_DB}`);
    await haupt.unsafe(`CREATE DATABASE ${EIGENE_DB}`);
    const u = new URL(url!); u.pathname = `/${EIGENE_DB}`;
    sql = verbinde(u.toString());
    // Migration füllt den Bestand: erst alle Migrationen außer 086 (spätere ändern Tabellen, die legeTypAn braucht), Mappen anlegen, dann der Rest.
    const alle = fileURLToPath(new URL('../migrations', import.meta.url));
    ordner = await mkdtemp(join(tmpdir(), 'dms-918-'));
    for (const f of (await readdir(alle)).filter((x) => x.endsWith('.sql') && !x.startsWith('086'))) await copyFile(join(alle, f), join(ordner, f));
    await migriere(sql, ordner, () => {});
    const repo = mod.pgRepo(sql, HAUSHALT) as Repo;
    const typ = await repo.legeTypAn(crypto.randomUUID(), { name: 'Bestand', beschreibung: '', titelVorlage: '', felder: FELDER, register: [] } as never);
    for (const werte of [{ jahr: '2024-02-29', nr: 'B1' }, { monat: '2023-01-31', einmal: '2026-02-30' }, { ohne: '2020-01-01', zwei: ['x'] }, {}]) {
      await repo.legeMappeAn(crypto.randomUUID(), typ.id, werte as never, [], null);
    }
    await migriere(sql, alle, () => {});
    await abgleich('nach der Migration');
    h = await aufbau(mod.pgRepo(sql, HAUSHALT), mod.pgKontoRepo(sql, HAUSHALT), mod.pgEinstellungen(sql, HAUSHALT));
  });
  after(async () => { if (ordner) await rm(ordner, { recursive: true, force: true }); if (sql) await sql.end(); if (haupt) { await haupt.unsafe(`DROP DATABASE IF EXISTS ${EIGENE_DB}`); await haupt.end(); } });

  it('die Migration füllt den Vorfilter für den Bestand', async () => {
    const [r] = await sql`SELECT count(*)::int AS n FROM fristtermine`;
    assert.ok(r.n >= 4);
    const [b] = await sql`SELECT count(*)::int AS n FROM fristtermine f JOIN mappentypen t ON t.id = f.typ_id WHERE t.name = 'Bestand'`;
    assert.equal(b.n, 4, 'jahr; monat und einmal (auch 30.02.); ohne – nicht die Liste');
  });

  it('Termine wie frisch gerechnet; Vorfilter wie im Arbeitsspeicher', async () => {
    await pruefeTermine(h);
    await abgleich('nach dem Anlegen');
    // Dieselben Kandidaten wie die Rechnung im Arbeitsspeicher, in jedem Zeitraum.
    const speicher = speicherRepo();
    const typ = (await h.roh.listeTypen()).find((t) => t.id === h.vertrag.id)!;
    await speicher.legeTypAn(typ.id, typ as never);
    for (const m of await h.roh.listeMappen(typ.id)) await speicher.legeMappeAn(m.id, typ.id, m.werte, [], null);
    const felder = fristFelder(typ).map((f) => ({ key: f.key, monate: f.frist!.wiederholung ?? null }));
    for (const [von, bis] of ZEITRAEUME) {
      const pg = (await h.roh.fristKandidaten(typ.id, felder, von, bis)).map((m) => m.id).sort();
      const sp = (await speicher.fristKandidaten(typ.id, felder, von, bis)).map((m) => m.id).sort();
      assert.deepEqual(pg, sp, `${von} … ${bis}`);
    }
    // Nur die nötigen Werte.
    const [k] = await h.roh.fristKandidaten(typ.id, [{ key: 'jahr', monate: 12 }], `${J}-01-01`, `${J}-12-31`);
    assert.ok(k && Object.keys(k.werte).every((x) => x === 'jahr'));
    await pruefeTypaenderung(h);
    await pruefeNaechsterTermin(h);
  });

  it('Pflege bei allen Wegen: ändern, Papierkorb, wiederherstellen, endgültig löschen, viele auf einmal, COPY', async () => {
    const { d, roh, lena, vertrag } = h;
    const z = await d.rechtepruefung.zugriff(lena);
    const termine = async () => gesehen(await d.termine(z, { von: `${J}-01-01`, bis: `${J}-12-31` }), vertrag.id).filter((x) => x.startsWith(m.id));
    const m = await d.mappen.legeMappeAn({ typId: vertrag.id, werte: { nr: 'P1', jahr: `${J - 1}-05-17` } }, lena.id);
    await abgleich('anlegen');
    assert.deepEqual(await termine(), [`${m.id}|jahr|${J}-05-17|f`]);
    await d.mappen.aendereMappe(m.id, { werte: { jahr: `${J - 1}-08-01`, monat: `${J}-11-30` } }, lena.id);
    await abgleich('ändern');
    assert.deepEqual(await termine(), [`${m.id}|jahr|${J}-08-01|f`, `${m.id}|monat|${J}-11-30|e`, `${m.id}|monat|${J}-12-30|f`]);
    await d.mappen.aendereMappe(m.id, { werte: { jahr: null, monat: null } }, lena.id);
    await abgleich('leeren');
    assert.deepEqual(await termine(), []);
    await d.mappen.aendereMappe(m.id, { werte: { jahr: `${J - 1}-05-17` } }, lena.id);
    await d.loescheMappe(m.id, lena.id);
    await abgleich('Papierkorb');
    assert.deepEqual(await termine(), [], 'im Papierkorb kein Termin');
    await d.stelleWiederHer(m.id, lena);
    await abgleich('wiederhergestellt');
    assert.deepEqual(await termine(), [`${m.id}|jahr|${J}-05-17|f`]);
    // Viele auf einmal (Import, Demo-Daten).
    const ids = [crypto.randomUUID(), crypto.randomUUID()];
    await roh.legeMappenAn(ids.map((id, i) => ({ id, typId: vertrag.id, werte: { nr: `D${i}`, quartal: `${J - 1}-0${i + 1}-31` }, verweise: [], titel: `D${i}`, benutzerId: lena.id, demo: true })));
    await abgleich('viele auf einmal');
    // Einspielen per COPY wie beim Wiederherstellen einer Sicherung (wiederherstellung.ts): Der Trigger füllt neu.
    const spalten = ['id', 'haushalt_id', 'typ_id', 'werte', 'erstellt', 'geaendert'];
    const zeilen: string[] = [];
    for await (const c of await sql.unsafe(`COPY (SELECT ${spalten.join(', ')} FROM mappen WHERE id = ANY('{${ids.join(',')}}'::uuid[])) TO STDOUT`).readable()) zeilen.push(String(c));
    await sql`DELETE FROM mappen WHERE id = ANY(${ids}::uuid[])`;
    assert.equal((await sql`SELECT count(*)::int AS n FROM fristtermine WHERE mappe_id = ANY(${ids}::uuid[])`)[0].n, 0, 'mit der Mappe gelöscht');
    await pipeline(Readable.from(zeilen), await sql.unsafe(`COPY mappen (${spalten.join(', ')}) FROM STDIN`).writable());
    await abgleich('COPY');
    assert.equal((await sql`SELECT count(*)::int AS n FROM fristtermine WHERE mappe_id = ANY(${ids}::uuid[])`)[0].n, 2);
    // Endgültig löschen.
    await d.loescheMappe(m.id, lena.id);
    await d.leerePapierkorb(lena, true);
    await abgleich('Papierkorb geleert');
  });

  it('Zahlen und Trefferzahl mit dem Mappenstand der Datenbank', async () => {
    const aufrufe: SeitenAnfrage[] = [];
    await pruefeZahlen(h);
    await pruefeTrefferzahl(mitProtokollDienst(h, aufrufe), aufrufe);
  });
});
