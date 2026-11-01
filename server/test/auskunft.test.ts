/**
 * Baum-Sammlung über Verweise (#396, #424) und Auskunft nach Art. 15 DSGVO als ZIP (#396).
 * Erfundene Beispieldaten: Mieter mit Mietvertrag, Nebenkostenabrechnungen und Schriftverkehr,
 * eine zweite Mieterin in derselben Wohnung (Dritte), Kreise, Rechte. Arbeitsspeicher und – wenn
 * TEST_DATABASE_URL gesetzt ist – PostgreSQL.
 */
import assert from 'node:assert/strict';
import { createCipheriv, createHmac, pbkdf2Sync } from 'node:crypto';
import { mkdtemp, readdir } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import { auswahlProbleme, fristBis, liesAuswahl, type AuskunftVorschau } from '../../shared/src/auskunft';
import { bereinigeBaumOptionen, haengtAuchAnderswo, kinderVon, wirdAnderswoGebraucht, type Baum } from '../../shared/src/baum';
import { ALLES } from '../../shared/src/rechte';
import { auskuenfteIn, erzeugeAuskunft } from '../src/auskunft';
import { speicherDateien } from '../src/dateispeicher';
import { Dienst } from '../src/dienst';
import { speicherEinstellungen } from '../src/einstellungen';
import { Fachfehler } from '../src/fehler';
import { Konten } from '../src/konten';
import { speicherKontoRepo } from '../src/konto-repo';
import type { Repo } from '../src/repo';
import { speicherRepo } from '../src/repo-speicher';
import { routen, type Anfrage } from '../src/routen';
import { Tresor } from '../src/tresor';
import { zipStrom } from '../src/zip';
import { pdfMitText } from './hilfen';

const status = (s: number) => (e: unknown) => e instanceof Fachfehler && e.status === s;
const H = '00000000-0000-4000-8000-000000000001';

/* ---------- ZIP lesen (unkomprimiert bzw. AES) ---------- */

interface Eintrag { name: string; methode: number; daten: Buffer }
function liesZip(b: Buffer): Eintrag[] {
  const ende = b.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const anzahl = b.readUInt16LE(ende + 10); let p = b.readUInt32LE(ende + 16);
  const r: Eintrag[] = [];
  for (let i = 0; i < anzahl; i++) {
    const methode = b.readUInt16LE(p + 10); const komprimiert = b.readUInt32LE(p + 20);
    const nl = b.readUInt16LE(p + 28); const el = b.readUInt16LE(p + 30); const kl = b.readUInt16LE(p + 32); const versatz = b.readUInt32LE(p + 42);
    const name = b.subarray(p + 46, p + 46 + nl).toString('utf8');
    const lnl = b.readUInt16LE(versatz + 26); const lel = b.readUInt16LE(versatz + 28);
    const start = versatz + 30 + lnl + lel;
    r.push({ name, methode, daten: b.subarray(start, start + komprimiert) });
    p += 46 + nl + el + kl;
  }
  return r;
}
/** WinZip-AES (AE-2) entschlüsseln – unabhängig von zip.ts nach der Beschreibung des Formats. */
function aesAuf(d: Buffer, passwort: string): Buffer {
  const salz = d.subarray(0, 16); const pv = d.subarray(16, 18); const daten = d.subarray(18, d.length - 10); const mac = d.subarray(d.length - 10);
  const k = pbkdf2Sync(passwort, salz, 1000, 66, 'sha1');
  assert.deepEqual(k.subarray(64), pv, 'Prüfwert des Passworts');
  assert.deepEqual(createHmac('sha1', k.subarray(32, 64)).update(daten).digest().subarray(0, 10), mac, 'Authentifizierung');
  // Zählermodus: Schlüsselstrom = AES(Zähler), Zähler little-endian ab 1.
  const ecb = createCipheriv('aes-256-ecb', k.subarray(0, 32), null); ecb.setAutoPadding(false);
  const out = Buffer.alloc(daten.length);
  for (let i = 0; i < daten.length; i += 16) {
    const z = Buffer.alloc(16); z.writeUInt32LE(i / 16 + 1, 0);
    const ks = ecb.update(z);
    for (let j = 0; j < 16 && i + j < daten.length; j++) out[i + j] = daten[i + j] ^ ks[j];
  }
  return out;
}

/* ---------- Aufbau ---------- */

const offen: Array<{ end(): Promise<void> }> = [];
async function repos(pg: boolean): Promise<{ repo: Repo; konto: ReturnType<typeof speicherKontoRepo> }> {
  if (!pg) return { repo: speicherRepo(), konto: speicherKontoRepo() };
  const { ausUrl, alsUrl, legeDatenbankAn } = await import('../src/anbindung');
  const { verbinde, migriere } = await import('../src/db');
  const { pgRepo } = await import('../src/repo-pg');
  const { pgKontoRepo } = await import('../src/konto-repo');
  const a = { ...ausUrl(process.env.TEST_DATABASE_URL)!, datenbank: `dms_ausk_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}` };
  await legeDatenbankAn(a);
  const sql = verbinde(alsUrl(a));
  offen.push(sql);
  await migriere(sql, new URL('../migrations', import.meta.url).pathname, () => {});
  return { repo: pgRepo(sql, H) as never, konto: pgKontoRepo(sql, H) as never };
}

async function aufbau(pg: boolean) {
  const r = await repos(pg);
  const tresor = new Tresor(speicherEinstellungen(), join(await mkdtemp(join(tmpdir(), 'dms-ausk-')), 'dms.schluessel'), () => null);
  await tresor.laden(); await tresor.erzeuge();
  const d = new Dienst(r.repo, speicherDateien(), { einstellungen: speicherEinstellungen(), tresor });
  const konten = new Konten(r.konto, null, 'http://nas', d.benutzerspiegel());
  d.verbindeKonten(konten.papierkorbHaken());
  const { benutzer: admin } = await konten.einrichten({ email: 'verwalter@example.org', name: 'Vera Verwalter', passwort: 'ein-langes-passwort' });
  const anna = (await konten.legeBenutzerAn({ email: 'anna@example.org', name: 'Anna', rolle: 'mitglied' }, admin.id)).benutzer;
  await d.gleicheBenutzerAb(await konten.listeBenutzer());
  const reg = [{ key: 'daten', name: 'Daten', art: 'felder' as const }, { key: 'dok', name: 'Unterlagen', art: 'dokumente' as const, versionierung: true }];
  const wohnungTyp = await d.legeTypAn({ name: 'Wohnung', titelVorlage: '{lage}', felder: [{ key: 'lage', label: 'Lage', typ: 'text' }] });
  const mieterTyp = await d.legeTypAn({ name: 'Mieter', schluessel: 'mieter', titelVorlage: '{name}', felder: [
    { key: 'name', label: 'Name', typ: 'text' }, { key: 'email', label: 'E-Mail', typ: 'text' }, { key: 'kundennummer', label: 'Kundennummer', typ: 'text' },
    { key: 'portal', label: 'Portal-Passwort', typ: 'passwort' }, { key: 'wohnung', label: 'Wohnung', typ: 'referenz', zielTyp: wohnungTyp.id },
  ], register: reg });
  const vertragTyp = await d.legeTypAn({ name: 'Mietvertrag', titelVorlage: '{nr}', archiv: { jahre: 10, stichtag: null }, felder: [
    { key: 'nr', label: 'Vertragsnummer', typ: 'text' }, { key: 'mieter', label: 'Mieter', typ: 'referenz', zielTyp: mieterTyp.id },
    { key: 'wohnung', label: 'Wohnung', typ: 'referenz', zielTyp: wohnungTyp.id },
  ], register: reg });
  await d.aendereTyp(vertragTyp.id, { ...(await d.listeTypen()).find((t) => t.id === vertragTyp.id)!, felder: [...vertragTyp.felder, { key: 'vorgaenger', label: 'Vorgänger', typ: 'referenz', zielTyp: vertragTyp.id }] });
  const nkTyp = await d.legeTypAn({ name: 'Nebenkostenabrechnung', titelVorlage: 'NK {jahr}', felder: [
    { key: 'jahr', label: 'Jahr', typ: 'text' }, { key: 'vertrag', label: 'Mietvertrag', typ: 'referenz', zielTyp: vertragTyp.id }, { key: 'privat', label: 'Privat', typ: 'janein' },
  ], register: reg });
  const hinweisTyp = await d.legeTypAn({ name: 'Hinweis', titelVorlage: '{text}', felder: [{ key: 'text', label: 'Text', typ: 'text' }] });

  const wohnung = await d.legeMappeAn({ typId: wohnungTyp.id, werte: { lage: 'Musterweg 1, EG links' } }, admin.id);
  const max = await d.legeMappeAn({ typId: mieterTyp.id, werte: { name: 'Max Mustermieter', email: 'max@example.net', kundennummer: 'K-4711', portal: 'geheim-portal-123', wohnung: wohnung.id } }, admin.id);
  const bea = await d.legeMappeAn({ typId: mieterTyp.id, werte: { name: 'Bea Beispiel', email: 'bea@example.net', wohnung: wohnung.id } }, admin.id);
  const v1 = await d.legeMappeAn({ typId: vertragTyp.id, werte: { nr: 'MV-2020', mieter: max.id, wohnung: wohnung.id } }, admin.id);
  // Kreis: der neue Vertrag nennt den alten als Vorgänger, der alte (fälschlich) den neuen.
  const v2 = await d.legeMappeAn({ typId: vertragTyp.id, werte: { nr: 'MV-2024', mieter: max.id, wohnung: wohnung.id, vorgaenger: v1.id } }, admin.id);
  await d.aendereMappe(v1.id, { werte: { nr: 'MV-2020', mieter: max.id, wohnung: wohnung.id, vorgaenger: v2.id } }, admin.id);
  const vBea = await d.legeMappeAn({ typId: vertragTyp.id, werte: { nr: 'MV-2022-B', mieter: bea.id, wohnung: wohnung.id } }, admin.id);
  const nk1 = await d.legeMappeAn({ typId: nkTyp.id, werte: { jahr: '2024', vertrag: v2.id } }, admin.id);
  const nk2 = await d.legeMappeAn({ typId: nkTyp.id, werte: { jahr: '2025', vertrag: v2.id, privat: true } }, admin.id);
  const hinweis = await d.legeMappeAn({ typId: hinweisTyp.id, werte: { text: 'Rückruf an max@example.net wegen Schlüssel' } }, admin.id);
  // Schriftverkehr als Post, zugeordnet zum Mieter
  const post = await d.legePostAn({ betreff: 'Mieterhöhung', kanal: 'E-Mail', richtung: 'Eingehend', fuer: admin.id }, { id: admin.id, name: 'Vera' });
  await d.ordneZu(post.id, { ziel: max.id, dokumente: [] }, admin.id);
  // Dokumente: Nebenkostenabrechnung mit Daten der Nachbarin und eine geschwärzte Fassung davon
  const nkPdf = (await d.ladeHoch(nk1.id, { register: 'dok', name: 'NK 2024.pdf' }, pdfMitText(['Abrechnung 2024', 'Max Mustermieter', 'Bea Beispiel 312,00 EUR']), admin.id)).dokument;
  const nkGeschwaerzt = (await d.ladeHoch(nk1.id, { register: 'dok', name: 'NK 2024 (geschwärzt).pdf', herkunft: 'geschwaerzt' }, pdfMitText(['Abrechnung 2024', 'Max Mustermieter', '████ 312,00 EUR']), admin.id)).dokument;
  const vertragPdf = (await d.ladeHoch(v2.id, { register: 'dok', name: 'Mietvertrag.pdf' }, pdfMitText(['Mietvertrag MV-2024']), admin.id)).dokument;
  const notizOk = await d.legeNotizAn(max.id, 'Zahlt immer pünktlich.', admin.id);
  const notizIntern = await d.legeNotizAn(max.id, 'Interne Einschätzung: Klage prüfen.', admin.id);
  const tabelle = routen(d, konten, {});
  const route = (m: string, p: string) => tabelle.find((x) => x.methode === m && x.pfad === p)!;
  const ich = async (id: string) => (await konten.listeBenutzer()).find((b) => b.id === id)!;
  const rufe = async (b: { id: string }, m: string, p: string, x: Partial<Anfrage> = {}) => route(m, p).handler({ body: {}, params: {}, query: {}, ip: '1', ...x, benutzer: await ich(b.id) } as Anfrage);
  return { d, konten, admin, anna, typen: { mieterTyp, wohnungTyp, vertragTyp, nkTyp, hinweisTyp }, m: { wohnung, max, bea, v1, v2, vBea, nk1, nk2, hinweis, post }, doks: { nkPdf, nkGeschwaerzt, vertragPdf }, notizen: { notizOk, notizIntern }, rufe };
}

const ids = (b: Baum) => new Set(b.knoten.map((k) => k.id));

describe('Baum und Auskunft: reine Funktionen (#396)', () => {
  it('Frist: ein Monat ab Eingang, Monatsende beachtet', () => {
    assert.equal(fristBis('2026-11-01'), '2026-12-01');
    assert.equal(fristBis('2026-01-31'), '2026-02-28');
    assert.equal(fristBis('2028-01-31'), '2028-02-29');
    assert.equal(fristBis('2026-12-15'), '2027-01-15');
  });
  it('Optionen: begrenzt, Unbekanntes fällt weg', () => {
    const o = bereinigeBaumOptionen({ tiefe: 99, max: '0', richtungen: 'verweistAuf,quer', seitwaerts: 'true' });
    assert.deepEqual(o, { richtungen: ['verweistAuf'], tiefe: 10, max: 1, seitwaerts: true, ohneTypen: [] });
    assert.equal(bereinigeBaumOptionen({}).tiefe, 2);
  });
  it('Auswahl: nichts Fremdes, jede abgewählte Notiz mit Begründung', () => {
    const bekannt = { a: { dokumente: [{ id: 'd1' }], notizen: [{ id: 'n1' }, { id: 'n2' }], historie: 1, dritte: [], ohneFelder: [] } } as never;
    assert.deepEqual(auswahlProbleme(liesAuswahl({ mappen: ['a'], dokumente: ['d1'], notizen: ['n1', 'n2'] }), bekannt), []);
    assert.match(auswahlProbleme(liesAuswahl({ mappen: ['a'], notizen: ['n1'] }), bekannt).join(), /keine Begründung/);
    assert.deepEqual(auswahlProbleme(liesAuswahl({ mappen: ['a'], notizen: ['n1'], ohneNotizen: [{ id: 'n2', grund: 'Interne Bewertung, Art. 15 Abs. 4' }] }), bekannt), []);
    assert.match(auswahlProbleme(liesAuswahl({ mappen: ['a', 'x'], dokumente: ['d9'], notizen: ['n1', 'n2'] }), bekannt).join(), /nicht zur Sammlung.*Dokumente nur/);
    assert.match(auswahlProbleme(liesAuswahl({}), bekannt).join(), /mindestens eine Mappe/);
  });
  it('ZIP mit AES-256 (AE-2): verschlüsselt, mit Passwort lesbar', async () => {
    const inhalt = Buffer.from('Max Mustermieter, IBAN DE02 1203 0000 0000 2020 51 '.repeat(40));
    const teile: Buffer[] = [];
    for await (const c of zipStrom([{ name: 'a/Auskunft.txt', groesse: inhalt.length, inhalt: async () => inhalt }], new Date(), 'ein-sicheres-passwort')) teile.push(c as Buffer);
    const zip = Buffer.concat(teile);
    assert.ok(!zip.includes(Buffer.from('Mustermieter')), 'kein Klartext');
    const [e] = liesZip(zip);
    assert.equal(e.methode, 99);
    assert.deepEqual(aesAuf(e.daten, 'ein-sicheres-passwort'), inhalt);
    assert.throws(() => aesAuf(e.daten, 'falsches-passwort'));
  });
});

for (const pg of [false, ...(process.env.TEST_DATABASE_URL ? [true] : [])]) {
  describe(`Baum über Verweise (#396, #424, ${pg ? 'PostgreSQL' : 'Arbeitsspeicher'})`, () => {
    after(async () => { for (const s of offen.splice(0)) await s.end(); });

    it('sammelt in beiden Richtungen, ohne quer weiterzugehen; Kreise, Verweise nach außen, Fristen, Dokumente', async () => {
      const { d, admin, m, typen } = await aufbau(pg);
      const z = await d.zugriff({ id: admin.id, rolle: 'admin' });
      const b = await d.baum(m.max.id, {}, z);
      const k = new Map(b.knoten.map((x) => [x.id, x]));
      assert.equal(b.knoten[0].id, m.max.id);
      assert.equal(b.knoten[0].ueber, null);
      // Ebene 1: Wohnung (verweist auf), beide Verträge und die Post (verwiesen von); Ebene 2: Abrechnungen
      for (const x of [m.wohnung, m.v1, m.v2, m.post]) assert.equal(k.get(x.id)?.ebene, 1);
      assert.equal(k.get(m.wohnung.id)!.ueber!.richtung, 'verweistAuf');
      assert.equal(k.get(m.v2.id)!.ueber!.feld, 'Mieter');
      for (const x of [m.nk1, m.nk2]) assert.equal(k.get(x.id)?.ebene, 2);
      assert.equal(k.get(m.nk1.id)!.ueber!.vonId, m.v2.id);
      // Bea und ihr Vertrag nicht: die Wohnung geht nur „nach oben“ weiter
      assert.ok(!ids(b).has(m.bea.id) && !ids(b).has(m.vBea.id) && !ids(b).has(m.hinweis.id));
      // … aber die Wohnung zeigt, dass weitere Mappen an ihr hängen
      assert.ok(wirdAnderswoGebraucht(k.get(m.wohnung.id)!));
      assert.deepEqual(new Set(k.get(m.wohnung.id)!.aussen.verwiesenVon.map((a) => a.titel)), new Set(['Bea Beispiel', 'MV-2022-B']));
      // Verträge hängen auch an der Wohnung (im Baum) – nicht „anderswo“; die Post hängt am Benutzer „für“
      assert.ok(!haengtAuchAnderswo(k.get(m.v2.id)!));
      assert.ok(haengtAuchAnderswo(k.get(m.post.id)!), 'Post → Benutzer (außerhalb, Benutzer sind ausgenommen)');
      // Kreis MV-2020 ↔ MV-2024: beide erkannt, nichts doppelt
      assert.equal(b.kreise, 2);
      assert.equal(k.get(m.v1.id)!.auchUeber.length + k.get(m.v2.id)!.auchUeber.length, 2);
      assert.equal(b.knoten.length, ids(b).size);
      // Archivmodus (#212): Verträge 10 Jahre gesperrt
      assert.equal(k.get(m.v2.id)!.gesperrt, true);
      assert.match(k.get(m.v2.id)!.aufbewahrenBis!, /^20\d\d-12-31$/);
      assert.equal(k.get(m.max.id)!.gesperrt, false);
      assert.equal(k.get(m.nk1.id)!.dokumente, 2);
      assert.equal(k.get(m.v2.id)!.rechte.D, true);
      assert.deepEqual(kinderVon(b, m.v2.id).map((x) => x.id).sort(), [m.nk1.id, m.nk2.id].sort());
      assert.equal(b.abgeschnitten, false);
      void typen;
    });

    it('Tiefe, Richtung, Obergrenze, seitwärts und große Kreise enden', async () => {
      const { d, admin, m } = await aufbau(pg);
      const z = await d.zugriff({ id: admin.id, rolle: 'admin' });
      const flach = await d.baum(m.max.id, { tiefe: 1 }, z);
      assert.ok(!ids(flach).has(m.nk1.id));
      assert.equal(flach.tieferMoeglich, true);
      const unten = await d.baum(m.max.id, { richtungen: ['verwiesenVon'] }, z);
      assert.ok(!ids(unten).has(m.wohnung.id) && ids(unten).has(m.nk1.id));
      const knapp = await d.baum(m.max.id, { max: 3 }, z);
      assert.equal(knapp.knoten.length, 3);
      assert.equal(knapp.abgeschnitten, true);
      // Seitwärts über 10 Ebenen: alles Erreichbare genau einmal, Benutzer bleiben draußen, keine Endlosschleife
      const quer = await d.baum(m.max.id, { tiefe: 10, seitwaerts: true }, z);
      for (const x of [m.bea, m.vBea]) assert.ok(ids(quer).has(x.id));
      assert.ok(!ids(quer).has(admin.id), 'Benutzer-Mappen sind ausgenommen');
      assert.equal(quer.knoten.length, ids(quer).size);
      await assert.rejects(d.baum('00000000-0000-4000-8000-00000000ffff', {}, z), status(404));
    });

    it('nur innerhalb der Rechte: Nicht Lesbares fehlt und wird nicht weiterverfolgt', async () => {
      const { d, anna, m, typen, rufe } = await aufbau(pg);
      await d.setzeBerechtigungen(typen.nkTyp.id, { grund: ALLES, regeln: [
        { id: 'p', name: 'Privat', wenn: [{ art: 'feld', bedingung: { art: 'feld', feld: 'privat', op: 'ja' } }], dann: { R: 'entziehen' }, stopp: true },
      ] }, true);
      await d.setzeBerechtigungen(typen.vertragTyp.id, { grund: { ...ALLES, D: false }, regeln: [] }, true);
      const b = (await rufe(anna, 'GET', '/api/mappen/:id/baum', { params: { id: m.max.id } })).body as Baum;
      assert.ok(ids(b).has(m.nk1.id));
      assert.ok(!ids(b).has(m.nk2.id));
      assert.equal(b.verborgen, 1);
      assert.equal(b.knoten.find((x) => x.id === m.v2.id)!.rechte.D, false, '⛔ kein Löschrecht für #424');
      // Über eine nicht lesbare Mappe geht es nicht weiter
      await d.setzeBerechtigungen(typen.vertragTyp.id, { grund: { ...ALLES, R: false }, regeln: [] }, true);
      const ohne = (await rufe(anna, 'GET', '/api/mappen/:id/baum', { params: { id: m.max.id } })).body as Baum;
      assert.ok(!ids(ohne).has(m.v2.id) && !ids(ohne).has(m.nk1.id));
      assert.ok(ohne.verborgen >= 2);
      // Start nicht lesbar: 404
      await assert.rejects(rufe(anna, 'GET', '/api/mappen/:id/baum', { params: { id: m.v2.id } }), status(404));
    });
  });

  describe(`Auskunft nach Art. 15 DSGVO (#396, ${pg ? 'PostgreSQL' : 'Arbeitsspeicher'})`, () => {
    after(async () => { for (const s of offen.splice(0)) await s.end(); });

    it('Vorschau, Prüfung, ZIP mit Deckblatt, Übersicht, Dokumenten und JSON – ohne Passwörter; Nachweis ohne Inhalte', async () => {
      const { d, admin, anna, m, typen, doks, notizen, rufe } = await aufbau(pg);
      await rufe(admin, 'PUT', '/api/werkbank/datenschutz', { body: { verantwortlicher: 'Hausverwaltung Beispiel GmbH\nMusterweg 9, 01067 Dresden', empfaenger: 'Steuerberatung (Nebenkosten)', typen: { [typen.mieterTyp.id]: { person: true, zweck: 'Durchführung des Mietverhältnisses' }, [typen.vertragTyp.id]: { person: false, zweck: 'Mietvertrag (Art. 6 Abs. 1 lit. b DSGVO)' } } } });
      // Nur für Administratoren (die Zugangsprüfung macht der HTTP-Teil anhand von `zugang`)
      for (const p of ['/api/werkbank/datenschutz', '/api/werkbank/auskunft/vorschau', '/api/werkbank/auskunft', '/api/werkbank/auskunft/frist', '/api/werkbank/auskunft/:id/zip', '/api/werkbank/auskunft/:id']) {
        assert.ok(routen(d, null as never).filter((x) => x.pfad === p).every((x) => x.zugang === 'admin'), p);
      }
      void anna;
      const v = (await rufe(admin, 'POST', '/api/werkbank/auskunft/vorschau', { body: { mappeId: m.max.id } })).body as AuskunftVorschau;
      assert.ok(v.mappen[m.nk1.id]);
      const nk = v.mappen[m.nk1.id].dokumente.find((x) => x.id === doks.nkPdf.id)!;
      assert.equal(nk.geschwaerzteFassung, doks.nkGeschwaerzt.id, 'geschwärzte Fassung wird erkannt');
      assert.equal(v.mappen[m.nk1.id].dokumente.find((x) => x.id === doks.nkGeschwaerzt.id)!.geschwaerzt, true);
      assert.deepEqual(v.mappen[m.max.id].ohneFelder, ['Portal-Passwort']);
      assert.ok(v.mappen[m.wohnung.id].dritte.includes('Bea Beispiel'), 'Hinweis „Daten Dritter?“');
      assert.equal(v.mappen[m.max.id].notizen.length, 2);
      // Volltext-/Werte-Treffer außerhalb des Baums nur als Vorschlag
      assert.ok(v.vorschlaege.some((x) => x.mappeId === m.hinweis.id), 'Hinweis mit der E-Mail-Adresse');
      assert.ok(!v.vorschlaege.some((x) => v.mappen[x.mappeId]));

      const auswahl = {
        mappen: [m.max.id, m.v2.id, m.nk1.id, m.post.id, m.hinweis.id],
        dokumente: [doks.nkGeschwaerzt.id, doks.vertragPdf.id],
        notizen: [notizen.notizOk.id], historie: [m.max.id],
        ohneNotizen: [{ id: notizen.notizIntern.id, grund: 'Interne Bewertung (Art. 15 Abs. 4 DSGVO)' }],
      };
      const body = { mappeId: m.max.id, auswahl, geprueft: true, empfaenger: 'Steuerberatung', passwort: '' };
      // Nichts geht ungeprüft raus
      await assert.rejects(rufe(admin, 'POST', '/api/werkbank/auskunft', { body: { ...body, geprueft: false } }), status(422));
      await assert.rejects(rufe(admin, 'POST', '/api/werkbank/auskunft', { body: { ...body, auswahl: { ...auswahl, ohneNotizen: [] } } }), /Begründung/);
      await assert.rejects(rufe(admin, 'POST', '/api/werkbank/auskunft', { body: { ...body, auswahl: { ...auswahl, mappen: [...auswahl.mappen, m.bea.id] } } }), /nicht zur Sammlung/);
      await assert.rejects(rufe(admin, 'POST', '/api/werkbank/auskunft', { body: { ...body, passwort: 'kurz' } }), /mindestens 10/);

      const ordner = await mkdtemp(join(tmpdir(), 'dms-ausk-zip-'));
      const z = await d.zugriff({ id: admin.id, rolle: 'admin' });
      const daten = await d.auskunftDaten(body, z, { mandant: 'Hausverwaltung', version: '0.96.0' });
      assert.deepEqual(daten.gruende, ['Interne Bewertung (Art. 15 Abs. 4 DSGVO)']);
      const r = await erzeugeAuskunft(daten, ordner, { von: { id: admin.id, name: 'Vera Verwalter', email: 'verwalter@example.org' }, mandant: 'Hausverwaltung' });
      assert.equal(r.mappen, 5); assert.equal(r.dokumente, 2);
      assert.match(r.name, /^Auskunft-Max-Mustermieter-\d{4}-\d{2}-\d{2}$/);
      const zip = readFileSync(join(ordner, `${r.id}.zip`));
      const e = new Map(liesZip(zip).map((x) => [x.name.slice(r.name.length + 1), x]));
      for (const n of ['Deckblatt.pdf', 'Uebersicht.html', 'Uebersicht.csv', 'manifest.json', 'LIESMICH.md', 'daten/mieter.csv', 'daten/notizen.jsonl', 'daten/historie.jsonl', 'struktur/mappentypen.json']) assert.ok(e.has(n), `${n} fehlt`);
      const text = (n: string) => e.get(n)!.daten.toString('utf8');
      assert.ok(zip.subarray(0, 4).equals(Buffer.from('PK\x03\x04', 'latin1')));
      // Passwortfelder und verschlüsselte Werte nie – weder Klartext noch verschlüsselt, auch nicht als Feld
      assert.ok(!zip.includes(Buffer.from('geheim-portal-123')) && !zip.includes(Buffer.from('dms1$')));
      assert.ok(!text('struktur/mappentypen.json').includes('Portal-Passwort'));
      assert.ok(!text('struktur/mappentypen.json').includes('berechtigungen'));
      assert.ok(!text('daten/mieter.csv').includes('portal'));
      // Nur Ausgewähltes: geschwärzte Fassung statt Original, abgewählte Notiz fehlt, Bea fehlt
      const namen = [...e.keys()];
      assert.ok(namen.some((n) => n.endsWith('NK 2024 (geschwärzt).pdf')));
      assert.ok(!namen.some((n) => n.endsWith('/NK 2024.pdf')));
      assert.ok(!namen.some((n) => n.includes('/Versionen/')), 'keine älteren Versionen');
      assert.match(text('daten/notizen.jsonl'), /pünktlich/);
      assert.ok(!zip.includes(Buffer.from('Klage prüfen')));
      assert.ok(!zip.includes(Buffer.from('Bea Beispiel 312')), 'Original mit Daten Dritter nicht enthalten');
      assert.ok(!text('Uebersicht.csv').includes('Bea'));
      assert.match(text('Uebersicht.html'), /Max Mustermieter/);
      assert.match(text('Uebersicht.html'), /href="ablage\/Nebenkostenabrechnung\//);
      assert.match(text('Uebersicht.csv'), /Max Mustermieter/);
      assert.equal(JSON.parse(text('manifest.json')).format, 'dms-vollexport');
      assert.equal(JSON.parse(text('manifest.json')).zweck, 'auskunft-art-15');
      assert.deepEqual(JSON.parse(text('struktur/benutzer.json')), []);
      const pdf = e.get('Deckblatt.pdf')!.daten;
      assert.ok(pdf.subarray(0, 5).toString() === '%PDF-');
      // Nachweis: Historie des Betroffenen ohne Inhalte
      await d.auskunftNachweis(daten, { id: admin.id, email: 'verwalter@example.org' }, r);
      const h = (await d.historie(m.max.id)).find((x) => x.art === 'auskunft')!;
      assert.match(String(h.daten.text), /5 Mappen, 2 Dokumente/);
      assert.equal(h.daten.ohneNotizen, 1);
      assert.ok(!JSON.stringify(h).includes('pünktlich') && !JSON.stringify(h).includes('Mustermieter'));
      // Bereit zum Herunterladen; nach 7 Tagen weg
      assert.equal((await auskuenfteIn(ordner)).length, 1);
      assert.equal((await auskuenfteIn(ordner, new Date(Date.now() + 8 * 24 * 3600 * 1000))).length, 0);
      assert.deepEqual(await readdir(ordner), []);
    });

    it('über den Hintergrundauftrag: verschlüsselt, Herunterladen löscht die Datei; Frist als Aufgabe', async () => {
      const { d, admin, m, doks, notizen, rufe } = await aufbau(pg);
      const passwort = 'Sommer-im-Garten-2026';
      const auswahl = { mappen: [m.max.id, m.v2.id], dokumente: [doks.vertragPdf.id], notizen: [notizen.notizOk.id, notizen.notizIntern.id], historie: [] };
      const a = await rufe(admin, 'POST', '/api/werkbank/auskunft', { body: { mappeId: m.max.id, auswahl, geprueft: true, passwort } });
      assert.equal(a.status, 202);
      const fertig = await d.auftraege.warte();
      assert.equal(fertig?.status, 'fertig', fertig?.fehler);
      const stand = fertig!.ergebnis as { id: string; verschluesselt: boolean };
      assert.equal(stand.verschluesselt, true);
      const liste = ((await rufe(admin, 'GET', '/api/werkbank/datenschutz')).body as { auskuenfte: Array<{ id: string }> }).auskuenfte;
      assert.ok(liste.some((x) => x.id === stand.id));
      assert.ok((await d.historie(m.max.id)).some((x) => x.art === 'auskunft' && x.daten.verschluesselt === true));
      const dl = await rufe(admin, 'GET', '/api/werkbank/auskunft/:id/zip', { params: { id: stand.id } });
      const teile: Buffer[] = [];
      for await (const c of dl.datei!.inhalt as AsyncIterable<Buffer>) teile.push(c);
      const zip = Buffer.concat(teile);
      assert.equal(zip.length, dl.datei!.groesse);
      // Verschlüsselt: eine einzige Datei „Auskunft.zip“ darin – so verraten auch die Dateinamen nichts.
      const eintraege = liesZip(zip);
      assert.deepEqual(eintraege.map((x) => [x.name, x.methode]), [['Auskunft.zip', 99]]);
      assert.ok(!zip.includes(Buffer.from('Mustermieter')) && !zip.includes(Buffer.from('Mietvertrag')));
      assert.match(dl.datei!.name, /^Auskunft-\d{4}-\d{2}-\d{2}\.zip$/);
      const innen = liesZip(aesAuf(eintraege[0].daten, passwort));
      const deck = innen.find((x) => x.name.endsWith('/Deckblatt.pdf'))!;
      assert.equal(deck.daten.subarray(0, 5).toString(), '%PDF-');
      assert.ok(innen.some((x) => x.name.endsWith('/Mietvertrag.pdf')));
      await new Promise((r) => setTimeout(r, 50));
      await assert.rejects(rufe(admin, 'GET', '/api/werkbank/auskunft/:id/zip', { params: { id: stand.id } }), status(404), 'nach dem Herunterladen gelöscht');
      // Frist: Aufgabe „Auskunft an … bis Eingang + 1 Monat“
      const auf = (await rufe(admin, 'POST', '/api/werkbank/auskunft/frist', { body: { mappeId: m.max.id, eingang: '2026-01-31' } })).body as { datum: string; text: string; empfaengerId: string };
      assert.equal(auf.datum, '2026-02-28');
      assert.match(auf.text, /Auskunft nach Art\. 15 DSGVO an Max Mustermieter bis 28\.02\.2026/);
      assert.equal(auf.empfaengerId, admin.id);
    });
  });
}
