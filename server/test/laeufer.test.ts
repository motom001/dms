// Paket-Läufer (#338): Dienstkonten, Rechte aus dem Manifest, Ereignisse, Grenzen – mit kleinen,
// hier von Hand gebauten WebAssembly-Modulen (kein Compiler in der CI nötig).
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { PDFDocument } from 'pdf-lib';
import { speicherApiSchluesselRepo, ApiSchluesselDienst } from '../src/apischluessel';
import { speicherDateien } from '../src/dateispeicher';
import { Dienst } from '../src/dienst';
import { speicherEinstellungen } from '../src/einstellungen';
import { Konten } from '../src/konten';
import { speicherKontoRepo, type KontoRepo } from '../src/konto-repo';
import type { Repo } from '../src/repo';
import { Paketlaeufer, type ApiAufruf } from '../src/laeufer/verwaltung';
import { ladeArgumente, pruefeModul } from '../src/laeufer/modul';
import { netzErlaubt } from '../src/laeufer/prozess';
import { liesPaket, liesZip, Paketverwaltung } from '../src/pakete';
import { zipPuffer } from '../src/zip';
import { speicherRepo } from '../src/repo-speicher';
import { pruefeZugang, routen, type Anfrage, type Route } from '../src/routen';
import { CODE_MAX, gleicheRechte, laeuferZustandText, liesCode, netzText, rechtePunkte, rechteText } from '../../shared/src/pakete';
import { HILFE } from '../../shared/src/hilfe';

/* ---------- Kleiner WebAssembly-Assembler ---------- */
const u = (n: number): number[] => { const b: number[] = []; do { let x = n & 0x7f; n >>>= 7; if (n) x |= 0x80; b.push(x); } while (n); return b; };
const s = (n: number): number[] => { const b: number[] = []; for (;;) { const x = n & 0x7f; n >>= 7; if ((n === 0 && !(x & 0x40)) || (n === -1 && x & 0x40)) { b.push(x); return b; } b.push(x | 0x80); } };
const vec = (l: number[][]) => [...u(l.length), ...l.flat()];
const str = (t: string) => { const b = [...Buffer.from(t)]; return [...u(b.length), ...b]; };
const sek = (id: number, b: number[]) => [id, ...u(b.length), ...b];
const I32 = 0x7f;
const typ = (p: number[], r: number[]) => [0x60, ...vec(p.map((x) => [x])), ...vec(r.map((x) => [x]))];
/** Ein Modul nach der DMS-Paket-ABI: importiert Speicher und dms.log/api/ergebnis; exportiert dms_puffer, dms_ereignis, dms_aktion. */
function modul(o: { ereignis: number[]; aktion?: number[]; daten?: Array<[number, string]>; eigenerSpeicher?: boolean; fremd?: boolean }) {
  const typen = [typ([I32, I32, I32], [I32]), typ([I32, I32], [I32]), typ([], [I32]), typ([I32], [I32])];
  const importe = [
    ...(o.eigenerSpeicher ? [] : [[...str('env'), ...str('memory'), 0x02, 0x00, ...u(1)]]),
    [...str('dms'), ...str('log'), 0x00, 0], [...str('dms'), ...str('api'), 0x00, 1], [...str('dms'), ...str('ergebnis'), 0x00, 1],
    ...(o.fremd ? [[...str('env'), ...str('system'), 0x00, 1]] : []),
  ];
  const n = o.fremd ? 4 : 3;
  const funktionen = [[3], [1], [1]];
  const exporte = [[...str('dms_puffer'), 0x00, n], [...str('dms_ereignis'), 0x00, n + 1], [...str('dms_aktion'), 0x00, n + 2], ...(o.eigenerSpeicher ? [[...str('memory'), 0x02, 0]] : [])];
  const koerper = (b: number[]) => { const k = [0x00, ...b, 0x0b]; return [...u(k.length), ...k]; };
  const code = [koerper([0x41, ...s(1024)]), koerper(o.ereignis), koerper(o.aktion ?? [0x41, 0])];
  const daten = (o.daten ?? []).map(([ort, t]) => [0x00, 0x41, ...s(ort), 0x0b, ...str(t)]);
  return Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0, 0, 0,
    ...sek(1, vec(typen)), ...sek(2, vec(importe)), ...sek(3, vec(funktionen)),
    ...(o.eigenerSpeicher ? sek(5, vec([[0x00, ...u(1)]])) : []),
    ...sek(7, vec(exporte)), ...sek(10, vec(code)), ...(daten.length ? sek(11, vec(daten)) : [])]);
}
const LOG = 0, API = 1, ERGEBNIS = 2;
const anfrage = JSON.stringify({ methode: 'GET', pfad: '/typen' });
/** Schreibt die Eingabe ins Protokoll, fragt GET /typen und meldet 0 bei 200. */
const ECHO = modul({
  ereignis: [0x41, 1, 0x20, 0, 0x20, 1, 0x10, LOG, 0x1a, 0x41, ...s(64), 0x41, ...s(anfrage.length), 0x10, API, 0x41, ...s(200), 0x47],
  aktion: [0x41, ...s(512), 0x41, ...s(9), 0x10, ERGEBNIS, 0x1a, 0x41, 0],
  daten: [[64, anfrage], [512, 'Aktion ok']],
});
const SCHLEIFE = modul({ ereignis: [0x03, 0x40, 0x0c, 0x00, 0x0b, 0x41, 0] });
const GIERIG = modul({ ereignis: [0x41, ...s(20000), 0x40, 0x00, 0x41, ...s(-1), 0x46, 0x04, 0x40, 0x00, 0x0b, 0x41, 0] });

/** PDF mit leeren Seiten (für das Teilen von Post). */
async function pdf(seiten: number): Promise<Buffer> {
  const d = await PDFDocument.create();
  for (let i = 0; i < seiten; i++) d.addPage([100 + i, 200]);
  return Buffer.from(await d.save());
}

/** Eigene PostgreSQL-Datenbank (TEST_DATABASE_URL) mit Repo und Konto-Repo; `ende` räumt sie ab. */
async function pgDatenbank() {
  const { ausUrl, alsUrl, legeDatenbankAn } = await import('../src/anbindung');
  const { verbinde, migriere } = await import('../src/db');
  const { pgRepo } = await import('../src/repo-pg');
  const { pgKontoRepo } = await import('../src/konto-repo');
  const H = '00000000-0000-4000-8000-000000000001';
  const basis = ausUrl(process.env.TEST_DATABASE_URL)!;
  const a = { ...basis, datenbank: `dms_lf_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}` };
  await legeDatenbankAn(a);
  const sql = verbinde(alsUrl(a));
  await migriere(sql, new URL('../migrations', import.meta.url).pathname, () => {});
  await sql`INSERT INTO haushalte (id, name) VALUES (${H}, 'Test') ON CONFLICT DO NOTHING`;
  return {
    repo: pgRepo(sql, H) as never as Repo, konto: pgKontoRepo(sql, H) as never as KontoRepo,
    ende: async () => { await sql.end(); const admin = verbinde(alsUrl(basis)); await admin.unsafe(`DROP DATABASE IF EXISTS "${a.datenbank}" WITH (FORCE)`); await admin.end(); },
  };
}

/* ---------- Paket als Archiv-Dateien ---------- */
const manifest = (id: string, rechte: string, ereignisse = '[dokument.hochgeladen]') => `schema: 1\nid: ${id}\nname: Probe ${id}\nversion: 1.0.0\nbeschreibung: Test.\nautor: { name: Test, github: test }\nlizenz: MIT\ndms: ">=0.60.0"\ninhalt: {}\ncode:\n  sprache: c\n  quelle: code/\n  ereignisse: ${ereignisse}\n  rechte: ${rechte}\n`;
const archiv = (id: string, wasm: Buffer, rechte = '{ lesen: ["*"], dokumente: lesen }') => new Map<string, Buffer>([['manifest.yaml', Buffer.from(manifest(id, rechte))], ['code/modul.wasm', wasm]]);

describe('Paket-Läufer (#338): Modul und Manifest', () => {
  it('prüft Module: Speicher importieren, nur erlaubte Importe, Exporte', () => {
    const p = pruefeModul(new WebAssembly.Module(ECHO), ECHO);
    assert.deepEqual([p.speicherMin, p.speicherMax, p.dms, p.aktion], [1, null, ['log', 'api', 'ergebnis'], true]);
    const eigen = modul({ ereignis: [0x41, 0], eigenerSpeicher: true });
    assert.throws(() => pruefeModul(new WebAssembly.Module(eigen), eigen), /eigenen Speicher/);
    const fremd = modul({ ereignis: [0x41, 0], fremd: true });
    assert.throws(() => pruefeModul(new WebAssembly.Module(fremd), fremd), /env\.system/);
  });
  it('liest code: im Manifest und verlangt das gebaute Modul', () => {
    assert.deepEqual(liesCode({ sprache: 'c', quelle: 'code/', rechte: { schreiben: ['notiz'], dokumente: 'schreiben' }, netz: ['https://api.example.org/v1'], ereignisse: ['post.angelegt'] }).code?.rechte, { lesen: ['notiz'], schreiben: ['notiz'], dokumente: 'schreiben' });
    assert.match(liesCode({ sprache: 'c', rechte: {}, netz: ['http://x.example'] }).fehler.join(), /nur https/);
    assert.match(liesCode({ sprache: 'c', rechte: {}, ereignisse: ['mappe.geloescht'] }).fehler.join(), /gibt es nicht/);
    const ohne = new Map(archiv('ohne', ECHO)); ohne.delete('code/modul.wasm');
    assert.equal(liesPaket(ohne).code, null, 'ohne gebautes Modul: installierbar, aber ohne Code');
    const kaputt = new Map(archiv('kaputt', Buffer.from('kein wasm')));
    assert.throws(() => liesPaket(kaputt), (e: Error & { details?: { gruende: string[] } }) => /kein WebAssembly-Modul/.test(e.details!.gruende.join()));
    assert.equal(liesPaket(archiv('mit', ECHO)).code?.info.rechte.dokumente, 'lesen');
  });
  it('gibt dem Läufer nur Lade-Argumente weiter', () => {
    assert.deepEqual(ladeArgumente(['--import', 'tsx', '--test-reporter=tap', '--permission', '--allow-worker', '--enable-source-maps', '--inspect', '--import=x', '--max-old-space-size=99']), ['--import', 'tsx', '--enable-source-maps', '--import=x']);
  });

  it('Netz nur zu Adressen aus dem Manifest', () => {
    const erlaubt = ['https://api.example.org/v1'];
    assert.equal(netzErlaubt('https://api.example.org/v1/rechnung', erlaubt), true);
    assert.equal(netzErlaubt('https://api.example.org/v10', erlaubt), false);
    assert.equal(netzErlaubt('https://api.example.org.boese.example/v1', erlaubt), false);
    assert.equal(netzErlaubt('http://api.example.org/v1', erlaubt), false);
    assert.equal(netzErlaubt('https://user:pw@api.example.org/v1', erlaubt), false);
  });
});

describe('Paket-Läufer: Nacharbeiten (#403)', () => {
  it('Größengrenze für code/: höchstens 32 MB je Paket, mit klarer Meldung', () => {
    assert.equal(CODE_MAX, 32 * 1024 * 1024);
    assert.deepEqual(liesCode({ sprache: 'c' }, [{ name: 'code/modul.wasm', groesse: CODE_MAX - 10 }, { name: 'README.md', groesse: 100 }]).fehler, []);
    const zuGross = liesCode({ sprache: 'c' }, [{ name: 'code/modul.wasm', groesse: 30 * 1048576 }, { name: 'code/daten/deu.traineddata', groesse: 3 * 1048576 }]);
    assert.equal(zuGross.code, null);
    assert.match(zuGross.fehler.join(), /zusammen 33,0 MB groß – erlaubt sind höchstens 32 MB je Paket/);
    // Im Paket: Meldung ohne „manifest.yaml:“ davor.
    const a = archiv('gross', ECHO);
    a.set('code/daten/gross.bin', Buffer.alloc(CODE_MAX));
    assert.throws(() => liesPaket(a), (e: Error & { details?: { gruende: string[] } }) => /^Die Dateien unter code\/ sind zusammen 32,0 MB groß – erlaubt sind höchstens 32 MB/.test(e.details!.gruende[0]));
    // Als ZIP: code/ zählt nicht zur allgemeinen Grenze von 20 MB, sondern zu seiner eigenen.
    const zip = zipPuffer([{ name: 'manifest.yaml', daten: Buffer.from(manifest('gross', '{ dokumente: keine }')) }, { name: 'code/modul.wasm', daten: ECHO }, { name: 'code/daten/gross.bin', daten: Buffer.alloc(25 * 1048576) }]);
    assert.equal(liesZip(zip).get('code/daten/gross.bin')?.length, 25 * 1048576);
    assert.ok(liesPaket(liesZip(zip)).code, '25 MB unter code/ sind erlaubt');
  });

  it('Zustandstexte passen zu dem, was der Läufer tut', () => {
    const zeit = (iso: string) => iso.slice(11, 16);
    const p = (x: Partial<{ geladen: boolean; fehler: string | null; aufrufe: number }> = {}) => ({ geladen: true, fehler: null, aufrufe: 0, ...x });
    const t = (zustand: Parameters<typeof laeuferZustandText>[0]['zustand'], paket: ReturnType<typeof p> | null, absturz: string | null = null) => laeuferZustandText({ zustand, absturz, paket }, zeit);
    assert.deepEqual(t('bereit', p()), { text: 'bereit – wartet auf das erste Ereignis', fehler: false, wartet: false });
    assert.equal(t('bereit', p({ aufrufe: 3 })).text, 'bereit');
    assert.deepEqual(t('startet', null), { text: 'startet …', fehler: false, wartet: true }, 'direkt nach der Installation: nicht „läuft nicht“');
    assert.equal(t('bereit', p({ geladen: false })).text, 'startet …');
    assert.deepEqual(t('neustart', p(), '2026-11-01T14:03:00.000Z'), { text: 'abgestürzt um 14:03 – startet neu …', fehler: true, wartet: true });
    assert.equal(t('bereit', p({ aufrufe: 3 }), '2026-11-01T14:03:00.000Z').text, 'neu gestartet nach Absturz um 14:03');
    assert.equal(t('pausiert', p()).text, 'pausiert (Wartungsmodus)');
    assert.deepEqual(t('bereit', p({ geladen: false, fehler: 'Modul abgelehnt' })), { text: 'Modul abgelehnt', fehler: true, wartet: false });
  });

  it('Update scheitert: der alte Code ist wieder da (und bei einer Neuinstallation keiner)', async () => {
    const d = new Dienst(speicherRepo(), speicherDateien(), { einstellungen: speicherEinstellungen() });
    const geaendert: string[] = [];
    const p = new Paketverwaltung(d, { version: () => '0.91.2', abruf: async () => { throw new Error('offline'); }, katalogUrl: 'https://katalog.test/katalog.json', laeufer: { aktion: async () => '', codeGeaendert: () => { geaendert.push('x'); } } });
    const ICH = { id: null, email: 'admin@example.org' };
    const zip = (version: string, wasm: Buffer) => zipPuffer([{ name: 'manifest.yaml', daten: Buffer.from(manifest('wechsel', '{ dokumente: keine }').replace('version: 1.0.0', `version: ${version}`)) }, { name: 'code/modul.wasm', daten: wasm }]);
    const installiere = async (version: string, wasm: Buffer) => { const { upload } = await p.hochladen(zip(version, wasm), ICH); return p.installiere({ upload, bestaetigt: true, rechteBestaetigt: true }, ICH); };
    const NEU = modul({ ereignis: [0x41, 1] });
    // Neuinstallation scheitert beim Speichern des Eintrags: kein Code bleibt zurück.
    const speichere = d.speicherePaket.bind(d);
    let scheitern = true;
    d.speicherePaket = async (x) => { if (scheitern) throw new Error('Platte voll'); return speichere(x); };
    await assert.rejects(installiere('1.0.0', ECHO), /Platte voll/);
    assert.deepEqual(await d.paketCode('wechsel'), []);
    scheitern = false;
    await installiere('1.0.0', ECHO);
    assert.deepEqual((await d.paketCode('wechsel')).find((x) => x.name === 'modul.wasm')?.inhalt, ECHO);
    // Update scheitert nach dem Speichern des neuen Codes: altes Modul zurück, alter Eintrag bleibt.
    scheitern = true;
    await assert.rejects(installiere('1.1.0', NEU), /Platte voll/);
    assert.deepEqual((await d.paketCode('wechsel')).find((x) => x.name === 'modul.wasm')?.inhalt, ECHO, 'alter Code wiederhergestellt');
    assert.equal((await d.listePakete()).find((x) => x.id === 'wechsel')?.version, '1.0.0');
    assert.equal(geaendert.length, 1, 'der Läufer lädt nach dem gescheiterten Update nichts neu');
    scheitern = false;
    await installiere('1.1.0', NEU);
    assert.deepEqual((await d.paketCode('wechsel')).find((x) => x.name === 'modul.wasm')?.inhalt, NEU);
  });
});

describe('Paket-Läufer: Recht nur für Post (#435)', () => {
  it('code.rechte kennt dms:post; unbekannte dms:-Kennungen und dms:benutzer nicht', () => {
    const r = liesCode({ sprache: 'c', rechte: { lesen: ['dms:post'], schreiben: ['dms:post'], dokumente: 'schreiben' } });
    assert.deepEqual([r.fehler, r.code?.rechte], [[], { lesen: ['dms:post'], schreiben: ['dms:post'], dokumente: 'schreiben' }]);
    assert.deepEqual(liesCode({ sprache: 'c', rechte: { lesen: ['dms:ablageort', 'dms:rolle'] } }).fehler, []);
    assert.match(liesCode({ sprache: 'c', rechte: { lesen: ['dms:brief'] } }).fehler.join(), /„dms:brief“ – diesen Mappentyp bringt das DMS nicht mit\. Erlaubt sind dms:ablageort, dms:rolle, dms:post/);
    assert.match(liesCode({ sprache: 'c', rechte: { schreiben: ['dms:benutzer'] } }).fehler.join(), /Pakete sehen keine Benutzer/);
  });

  it('die Rechte-Rückfrage bei der Installation nennt „Post“', async () => {
    const d = new Dienst(speicherRepo(), speicherDateien(), { einstellungen: speicherEinstellungen() });
    const p = new Paketverwaltung(d, { version: () => '0.94.0', abruf: async () => { throw new Error('offline'); }, katalogUrl: 'https://katalog.test/katalog.json' });
    const zip = zipPuffer([{ name: 'manifest.yaml', daten: Buffer.from(manifest('trenner', '{ lesen: ["dms:post"], schreiben: ["dms:post"], dokumente: schreiben }')) }, { name: 'code/modul.wasm', daten: ECHO }]);
    const { upload } = await p.hochladen(zip, { id: null, email: 'admin@example.org' });
    const v = await p.vorschau({ upload });
    assert.deepEqual(v.laeufer?.rechte.slice(0, 2).map((r) => r.text), ['Mappen lesen: Post', 'Mappen anlegen und ändern: Post']);
    assert.equal(v.laeufer?.bestaetigen, true);
  });

  it('Rechte-Vorschau (#449): Netzwerkzugriff ausgeschrieben, Ereignisse als Unterliste, je Punkt eine Handbuch-Stelle', () => {
    assert.equal(netzText([]), 'kein Zugriff auf Netzwerk und Internet');
    assert.equal(netzText(['https://a.example/v1', 'https://b.example']), 'Zugriff auf Netzwerk/Internet nur zu: https://a.example/v1, https://b.example');
    const c = liesCode({ sprache: 'c', rechte: { lesen: ['dms:post'], schreiben: ['dms:post'], dokumente: 'schreiben' }, ereignisse: ['post.angelegt', 'dokument.hochgeladen'] }).code!;
    const p = rechtePunkte(c, (v) => (v === 'dms:post' ? 'Post' : v));
    assert.deepEqual(p.map((x) => x.text), ['Mappen lesen: Post', 'Mappen anlegen und ändern: Post', 'Dokumente lesen und Volltext schreiben', 'kein Zugriff auf Netzwerk und Internet', 'Reagiert auf diese Ereignisse:']);
    assert.deepEqual(p[4].unter?.map((u) => u.text), ['Neue Post ist angelegt', 'Ein Dokument wurde hochgeladen']);
    // Jede Stelle steht in der Hilfe-Tabelle (die CI prüft die Anker gegen das gebaute Handbuch).
    for (const h of [...p.map((x) => x.hilfe), ...p[4].unter!.map((u) => u.hilfe)]) assert.equal(HILFE[h].seite, 'pakete/', h);
    assert.ok(!rechteText(c, (v) => v).some((z) => /\bNetz\b/.test(z)), 'kein „Netz“ als Kurzform');
    assert.equal(rechteText(c, (v) => v).at(-1), 'Reagiert auf diese Ereignisse: Neue Post ist angelegt; Ein Dokument wurde hochgeladen');
  });
});

describe('Paket-Läufer (#338): Ablauf', () => {
  const laeufer: Paketlaeufer[] = [];
  after(async () => { for (const l of laeufer) await l.stop(); });

  async function aufbau(grenzen = {}, db?: { repo: Repo; konto: KontoRepo }) {
    const d = new Dienst(db?.repo ?? speicherRepo(), speicherDateien(), { einstellungen: speicherEinstellungen() });
    const konten = new Konten(db?.konto ?? speicherKontoRepo(), () => null, () => 'http://localhost', d.benutzerspiegel());
    const schluessel = new ApiSchluesselDienst(speicherApiSchluesselRepo());
    const tabelle = routen(d, konten, { apiSchluessel: schluessel });
    // Wie http.ts: Route suchen, Zugang prüfen (API-Schlüssel), Handler.
    const api: ApiAufruf = async (q) => {
      const r = tabelle.find((x) => x.methode === q.methode && new RegExp(`^${x.pfad.replace(/:[a-zA-Z]+/g, '[^/]+')}$`).test(q.pfad.split('?')[0]));
      if (!r) return { status: 404, kopf: {}, body: Buffer.from('{}') };
      const namen = [...r.pfad.matchAll(/:([a-zA-Z]+)/g)].map((m) => m[1]);
      const werte = new RegExp(`^${r.pfad.replace(/:[a-zA-Z]+/g, '([^/]+)')}$`).exec(q.pfad.split('?')[0])!.slice(1);
      const a: Anfrage = { body: q.body ? JSON.parse(q.body.toString('utf8')) : {}, params: Object.fromEntries(namen.map((n, i) => [n, werte[i]])), query: Object.fromEntries(new URLSearchParams(q.pfad.split('?')[1] ?? '')), ip: '127.0.0.1' } as Anfrage;
      try {
        await pruefeZugang(r as Route, a, (n) => q.kopf[n], konten, schluessel);
        const x = await r.handler(a);
        const datei = (x as { datei?: { inhalt: Buffer } }).datei;
        return { status: x.status ?? 200, kopf: {}, body: datei ? datei.inhalt : Buffer.from(JSON.stringify(x.body ?? null)) };
      } catch (e) { return { status: (e as { status?: number }).status ?? 500, kopf: {}, body: Buffer.from((e as Error).message) }; }
    };
    const speicher = new Map<string, Record<string, string>>();
    const l = new Paketlaeufer({ dienst: d, konten, schluessel, api, einstellungen: async () => ({ a: 1 }), speicher: { lies: async (p) => speicher.get(p) ?? {}, schreibe: async (p, w) => { speicher.set(p, w); } }, grenzen: { sekunden: 3, speicherMB: 16, ...grenzen }, abrufMs: 100 });
    laeufer.push(l);
    return { d, konten, l, schluessel };
  }
  async function installiere(d: Dienst, id: string, wasm: Buffer, rechte?: string) {
    const p = liesPaket(archiv(id, wasm, rechte));
    await d.speicherePaketCode(id, p.code!.dateien);
    await d.speicherePaket({ id, name: p.manifest.name, version: '1.0.0', beschreibung: '', lizenz: 'MIT', autor: { name: 'T', github: 't' }, herkunft: { art: 'hochgeladen', von: null, am: '' }, installiert: new Date().toISOString(), installiertVon: null, aktualisiert: null, aktualisiertVon: null, typen: {}, sichten: {}, abhaengigkeiten: {}, code: true, laeufer: { ...p.code!.info, modul: { sha256: 'x', groesse: wasm.length } } });
  }
  const warte = async (f: () => Promise<boolean> | boolean, ms = 10_000) => { const ende = Date.now() + ms; while (!(await f())) { if (Date.now() > ende) throw new Error('Zeit abgelaufen'); await new Promise((r) => setTimeout(r, 50)); } };

  it('Dienstkonto je Paket (nicht in Benutzerlisten), Ereignis zugestellt, API mit eigenem Schlüssel, Aktion', async () => {
    const { d, konten, l } = await aufbau();
    await installiere(d, 'echo', ECHO);
    await l.start();
    await warte(async () => (await l.uebersicht()).laeuft);
    const konto = (await konten.listeDienstkonten())[0];
    assert.equal(konto.name, 'Paket Probe echo');
    assert.equal(konto.art, 'dienst');
    assert.deepEqual(await konten.listeBenutzer(), [], 'nicht in der Benutzerliste');
    await d.melde('dokument.hochgeladen', { dokument: 'd1' });
    await d.melde('post.angelegt', { mappe: 'm1' });
    await warte(async () => (await d.ereignisStand()).echo?.zugestellt === 1);
    const u1 = await l.uebersicht();
    const echo = u1.pakete[0];
    assert.equal(echo.aufrufe, 1, 'nur das abonnierte Ereignis');
    assert.equal(echo.letzte[0].ok, true, JSON.stringify(echo.letzte));
    assert.match(echo.protokoll[0].text, /"art":"dokument.hochgeladen".*"dokument":"d1".*"einstellungen":\{"a":1\}/);
    assert.equal(await l.aktion('echo', 'test', {}), 'Aktion ok');
  });

  it('Rechte aus dem Manifest: nur bestätigte Typen, Dokumente nur mit Recht, nie Administrator', async () => {
    const { d, konten, schluessel } = await aufbau();
    await installiere(d, 'blind', ECHO, '{ dokumente: keine }');
    await installiere(d, 'alles', ECHO, '{ lesen: ["*"], dokumente: lesen }');
    const blind = await konten.dienstkonto('blind', 'Blind');
    const alles = await konten.dienstkonto('alles', 'Alles');
    const zb = await d.zugriff(blind), za = await d.zugriff(alles);
    assert.equal(zb.typen.size, 0);
    assert.equal(za.admin, false);
    const sys = await d.sichereSystem();
    assert.ok(za.typen.has(sys.post.id) && !za.typen.has(sys.benutzer.id), '„*“ = alle außer Benutzer');
    const post = await d.legePostAn({ betreff: 'Brief' }, { id: null, name: 'Test' });
    assert.equal((await d.rechteAn(za, post)).R, true);
    assert.equal((await d.rechteAn(za, post)).U, false, 'ohne „schreiben“ nicht bearbeiten');
    assert.equal((await d.rechteAn(zb, post)).R, false);
    // Über die API: Dokument-Routen nur mit dem Recht aus dem Manifest.
    const tabelle = routen(d, konten, { apiSchluessel: schluessel });
    const key = await schluessel.fuerDienstkonto(blind, 'lesen');
    const r = tabelle.find((x) => x.methode === 'GET' && x.pfad === '/api/v1/dokumente/:id/volltext')!;
    const a = { body: {}, params: { id: '00000000-0000-4000-8000-000000000001' }, query: {}, ip: '127.0.0.1' } as unknown as Anfrage;
    await pruefeZugang(r as Route, a, (n) => (n === 'authorization' ? `Bearer ${key}` : undefined), konten, schluessel);
    assert.equal(a.benutzer?.art, 'dienst');
    await assert.rejects(r.handler(a), /darf das mit Dokumenten nicht/);
    // Anmelden mit der Adresse des Dienstkontos geht nicht.
    await assert.rejects(konten.anmelden({ email: blind.email, passwort: 'x' }, '1.2.3.4'), /stimmen nicht/);
    // Verwaltung, Vertretung und Links kennen Dienstkonten nicht – auch nicht für einen Administrator.
    const admin = (await konten.legeBenutzerAn({ email: 'admin@example.org', name: 'Admin', rolle: 'admin' })).benutzer;
    await assert.rejects(konten.aendereBenutzer(admin, blind.id, { rolle: 'admin' }), (e: { status?: number }) => e.status === 404);
    await assert.rejects(konten.vertrete(admin, undefined, blind.id, { geraet: '', ip: '' }), (e: { status?: number }) => e.status === 404);
    await assert.rejects(konten.neuerLink(blind.id), (e: { status?: number }) => e.status === 404);
    await assert.rejects(konten.loescheBenutzer(admin, blind.id), (e: { status?: number }) => e.status === 404);
  });

  it('Pakete ohne Dokumentrecht: keine Dokumentliste an der Mappe, nie E-Mail; Namen in der Historie', async () => {
    const { d, konten, schluessel } = await aufbau();
    await installiere(d, 'ohnedok', ECHO, '{ lesen: ["*"], dokumente: keine }');
    await installiere(d, 'mitdok', ECHO, '{ lesen: ["*"], dokumente: lesen }');
    const ohne = await konten.dienstkonto('ohnedok', 'Ohne');
    const mit = await konten.dienstkonto('mitdok', 'Mit');
    const post = await d.legePostAn({ betreff: 'Brief' }, { id: null, name: 'Test' });
    const sys = await d.sichereSystem();
    const reg = sys.post.register.find((x) => x.art === 'dokumente')!.key;
    await d.ladeHoch(post.id, { register: reg, name: 'a.pdf' }, Buffer.from('%PDF-1.4 a'), null);
    const tabelle = routen(d, konten, { apiSchluessel: schluessel });
    const rufe = async (b: typeof ohne, methode: string, pfad: string, params: Record<string, string>, body: unknown = {}) => {
      const r = tabelle.find((x) => x.methode === methode && x.pfad === pfad)!;
      const a = { body, params, query: {}, ip: '127.0.0.1' } as unknown as Anfrage;
      const key = await schluessel.fuerDienstkonto(b, methode === 'GET' ? 'lesen' : 'schreiben');
      await pruefeZugang(r as Route, a, (n) => (n === 'authorization' ? `Bearer ${key}` : undefined), konten, schluessel);
      return r.handler(a);
    };
    const m1 = (await rufe(mit, 'GET', '/api/v1/mappen/:id', { id: post.id })).body as { dokumente?: unknown[] };
    const m2 = (await rufe(ohne, 'GET', '/api/v1/mappen/:id', { id: post.id })).body as { dokumente?: unknown[] };
    assert.equal(m1.dokumente?.length, 1);
    assert.equal(m2.dokumente, undefined, 'ohne Dokumentrecht keine Dokumentliste');
    await assert.rejects(rufe(mit, 'POST', '/api/v1/mappen/:id/email', { id: post.id }, { an: 'x@example.org' }), /keine E-Mails/);
    // Namen der Dienstkonten für Historie und „angelegt von“ – nicht auswählbar.
    const personen = await konten.personen();
    const p = personen.find((x) => x.id === mit.id) as { art?: string; aktiv?: boolean; name: string };
    assert.deepEqual([p.art, p.aktiv, p.name], ['dienst', false, 'Paket Mit']);
  });

  it('Recht nur für Post (dms:post, #435): Post lesen, teilen, Archivnummer und Volltext setzen – keine anderen Mappen', async () => {
    const { d, konten, schluessel } = await aufbau();
    await installiere(d, 'trenner', ECHO, '{ lesen: ["dms:post"], schreiben: ["dms:post"], dokumente: schreiben }');
    const konto = await konten.dienstkonto('trenner', 'Trenner');
    const sys = await d.sichereSystem();
    const z = await d.zugriff(konto);
    assert.deepEqual([...z.typen.keys()], [sys.post.id], 'sieht nur den Mappentyp Post');
    const vertragTyp = await d.legeTypAn({ name: 'Vertrag', titelVorlage: '{nr}', felder: [{ key: 'nr', label: 'Nr', typ: 'text' }], register: [
      { key: 'allgemein', name: 'Allgemein', art: 'felder', felder: ['nr'] }, { key: 'dokumente', name: 'Unterlagen', art: 'dokumente' },
    ] });
    const vertrag = await d.legeMappeAn({ typId: vertragTyp.id, werte: { nr: 'Strom' } }, null);
    const vdok = (await d.ladeHoch(vertrag.id, { register: 'dokumente', name: 'v.pdf', typ: 'application/pdf' }, await pdf(1), null)).dokument;
    const post = await d.legePostAn({ betreff: 'Stapel' }, { id: null, name: 'Test' });
    const reg = sys.post.register.find((x) => x.art === 'dokumente')!.key;
    const pdok = (await d.ladeHoch(post.id, { register: reg, name: 'Stapel.pdf', typ: 'application/pdf' }, await pdf(2), null)).dokument;
    assert.deepEqual(await d.rechteAn(z, post), { C: true, R: true, U: true, D: false, P: false });
    assert.equal((await d.rechteAn(z, vertrag)).R, false);
    assert.deepEqual([...await d.lesbare(z, [post.id, vertrag.id])], [post.id]);
    // Über die API wie im Paket-Läufer.
    const tabelle = routen(d, konten, { apiSchluessel: schluessel });
    const rufe = async (methode: string, pfad: string, params: Record<string, string>, body: unknown = {}) => {
      const r = tabelle.find((x) => x.methode === methode && x.pfad === pfad)!;
      const a = { body, params, query: {}, ip: '127.0.0.1' } as unknown as Anfrage;
      const key = await schluessel.fuerDienstkonto(konto, methode === 'GET' ? 'lesen' : 'schreiben');
      await pruefeZugang(r as Route, a, (n) => (n === 'authorization' ? `Bearer ${key}` : undefined), konten, schluessel);
      return r.handler(a);
    };
    const gelesen = (await rufe('GET', '/api/v1/mappen/:id', { id: post.id })).body as { dokumente?: unknown[] };
    assert.equal(gelesen.dokumente?.length, 1);
    await rufe('PUT', '/api/v1/dokumente/:id/volltext', { id: pdok.id }, { text: 'Sehr geehrte Damen und Herren' });
    assert.match((await d.volltext(pdok.id)).text ?? '', /Sehr geehrte/);
    await rufe('PUT', '/api/v1/dokumente/:id/archivnummer', { id: pdok.id }, { archivnummer: 'A-17' });
    const geteilt = (await rufe('POST', '/api/v1/dokumente/:id/seiten', { id: pdok.id }, { seiten: [{ nr: 1 }, { nr: 2 }], teile: [0, 1] })).body as { posten: Array<{ typId: string }> };
    assert.equal(geteilt.posten.length, 2);
    assert.ok(geteilt.posten.every((p) => p.typId === sys.post.id));
    // Andere Mappen: nicht sichtbar, nicht änderbar.
    const verborgen = (e: { status?: number }) => e.status === 404;
    await assert.rejects(rufe('GET', '/api/v1/mappen/:id', { id: vertrag.id }), verborgen);
    await assert.rejects(rufe('PUT', '/api/v1/dokumente/:id/archivnummer', { id: vdok.id }, { archivnummer: 'B-1' }), verborgen);
    await assert.rejects(rufe('PUT', '/api/v1/dokumente/:id/volltext', { id: vdok.id }, { text: 'x' }), verborgen);
    await assert.rejects(rufe('POST', '/api/v1/dokumente/:id/seiten', { id: vdok.id }, { seiten: [{ nr: 1 }], teile: [0] }), verborgen);
  });

  for (const pg of [false, true]) {
    it(`Post mit „Für“ teilen (#445): übernimmt „Für“; ein neues „Für“ setzt ein Paket nicht${pg ? ' – PostgreSQL' : ''}`, { skip: pg && !process.env.TEST_DATABASE_URL && 'ohne TEST_DATABASE_URL' }, async () => {
      const db = pg ? await pgDatenbank() : undefined;
      try {
        const { d, konten, schluessel } = await aufbau({}, db);
        await installiere(d, 'trenner', ECHO, '{ lesen: ["dms:post"], schreiben: ["dms:post"], dokumente: schreiben }');
        const konto = await konten.dienstkonto('trenner', 'Trenner');
        const { benutzer: anna } = await konten.einrichten({ email: 'anna@example.org', name: 'Anna', passwort: 'ein-langes-passwort' });
        const { benutzer: ben } = await konten.legeBenutzerAn({ email: 'ben@example.org', name: 'Ben', rolle: 'mitglied' }, anna.id);
        const sys = await d.sichereSystem();
        const z = await d.zugriff(konto);
        assert.equal((await d.lesbare(z, [ben.id])).size, 0, 'Pakete sehen keine Benutzer');
        // „Für“ setzt ein Benutzer im DMS (hier: Anna als Administratorin).
        const post = await d.legePostAn({ betreff: 'Stapel', fuer: ben.id }, { id: anna.id, name: 'Anna' }, await d.zugriff({ id: anna.id, rolle: 'admin' }));
        assert.deepEqual(post.werte.fuer, ben.id);
        const reg = sys.post.register.find((x) => x.art === 'dokumente')!.key;
        const pdok = (await d.ladeHoch(post.id, { register: reg, name: 'Stapel.pdf', typ: 'application/pdf' }, await pdf(3), anna.id)).dokument;
        const tabelle = routen(d, konten, { apiSchluessel: schluessel });
        const rufe = async (methode: string, pfad: string, params: Record<string, string>, body: unknown = {}) => {
          const r = tabelle.find((x) => x.methode === methode && x.pfad === pfad)!;
          const a = { body, params, query: {}, ip: '127.0.0.1' } as unknown as Anfrage;
          const key = await schluessel.fuerDienstkonto(konto, methode === 'GET' ? 'lesen' : 'schreiben');
          await pruefeZugang(r as Route, a, (n) => (n === 'authorization' ? `Bearer ${key}` : undefined), konten, schluessel);
          return r.handler(a);
        };
        const geteilt = (await rufe('POST', '/api/v1/dokumente/:id/seiten', { id: pdok.id }, { seiten: [{ nr: 1 }, { nr: 2 }, { nr: 3 }], teile: [0, 2] })).body as { posten: Array<{ id: string }> };
        assert.equal(geteilt.posten.length, 2);
        for (const p of geteilt.posten) assert.deepEqual((await d.holeMappe(p.id)).mappe.werte.fuer, ben.id, 'dasselbe „Für“ wie die Ausgangspost');
        // Neues „Für“ über die API: weiterhin abgelehnt – beim Anlegen und beim Ändern.
        const abgelehnt = (e: { status?: number; message?: string }) => e.status === 422 && /nicht sehen darfst/.test(e.message ?? '');
        await assert.rejects(rufe('POST', '/api/v1/post', {}, { betreff: 'Neu', fuer: ben.id }), abgelehnt);
        const ohne = await d.legePostAn({ betreff: 'Ohne' }, { id: null, name: 'Test' });
        await assert.rejects(rufe('PUT', '/api/v1/mappen/:id', { id: ohne.id }, { werte: { fuer: ben.id } }), abgelehnt);
        await assert.rejects(rufe('PUT', '/api/v1/mappen/:id', { id: post.id }, { werte: { fuer: anna.id } }), abgelehnt);
        assert.equal((await rufe('POST', '/api/v1/post', {}, { betreff: 'Ohne Für' })).status, 201, 'ohne „Für“ geht es');
      } finally { await db?.ende(); }
    });
  }

  it('Entfernen während eines Aufrufs hängt nichts; Reihenfolge je Paket; eigene Änderungen werden nicht gemeldet', async () => {
    const { d, l, konten } = await aufbau({ sekunden: 5 });
    await installiere(d, 'schleife', SCHLEIFE);
    await l.start();
    await warte(async () => (await l.uebersicht()).laeuft);
    await d.melde('dokument.hochgeladen', { dokument: 'd1' });
    await new Promise((r) => setTimeout(r, 400)); // Aufruf läuft (Endlosschleife)
    await d.loeschePaket('schleife');
    await d.loescheEreignisse('schleife');
    l.codeGeaendert();
    await warte(async () => !(await l.uebersicht()).laeuft);
    // Neues Paket: die Zustellung darf nicht mehr am alten Aufruf hängen.
    await installiere(d, 'echo', ECHO);
    l.codeGeaendert();
    await warte(async () => (await l.uebersicht()).laeuft);
    await d.melde('dokument.hochgeladen', { dokument: 'd2' });
    await warte(async () => (await d.ereignisStand()).echo?.zugestellt === 1);
    // Eigene Änderungen: was das Dienstkonto von echo hochlädt, meldet das DMS echo nicht.
    const konto = (await konten.listeDienstkonten()).find((b) => b.paketId === 'echo')!;
    const post = await d.legePostAn({ betreff: 'Brief' }, { id: null, name: 'Test' });
    const reg = (await d.sichereSystem()).post.register.find((x) => x.art === 'dokumente')!.key;
    await d.ladeHoch(post.id, { register: reg, name: 'b.pdf' }, Buffer.from('%PDF-1.4 b'), konto.id);
    await new Promise((r) => setTimeout(r, 300));
    assert.equal((await d.ereignisStand()).echo.offen + (await d.ereignisStand()).echo.zugestellt, 1, 'kein Ereignis für die eigene Änderung');
  });

  it('Ausgangskorb: ein wartendes Ereignis hält spätere desselben Pakets zurück', async () => {
    const d = new Dienst(speicherRepo(), speicherDateien(), { einstellungen: speicherEinstellungen() });
    await installiere(d, 'echo', ECHO);
    await d.melde('dokument.hochgeladen', { n: 1 });
    await new Promise((r) => setTimeout(r, 5));
    await d.melde('dokument.hochgeladen', { n: 2 });
    const [e1] = await d.faelligeEreignisse(10);
    assert.equal(e1.daten.n, 1);
    await d.ereignisFehlgeschlagen(e1.id, 'x', new Date(Date.now() + 60_000));
    assert.deepEqual(await d.faelligeEreignisse(10), [], 'Nr. 2 wartet auf die Wiederholung von Nr. 1');
    await d.ereignisFehlgeschlagen(e1.id, 'x', null);
    assert.deepEqual((await d.faelligeEreignisse(10)).map((e) => e.daten.n), [2], 'aufgegeben: Nr. 2 ist dran');
  });

  it('lädt bei einer Änderung nur das geänderte Modul; Zustand nach Installation und nach Absturz (#403)', async () => {
    const { d, l } = await aufbau();
    const gelesen: string[] = [];
    const lies = d.paketCode.bind(d);
    d.paketCode = async (id: string) => { gelesen.push(id); return lies(id); };
    await installiere(d, 'eins', ECHO);
    await installiere(d, 'zwei', ECHO);
    await l.start();
    await warte(async () => (await l.uebersicht()).pakete.every((p) => p.geladen));
    const u0 = await l.uebersicht();
    assert.equal(u0.zustand, 'bereit');
    assert.deepEqual(u0.pakete.map((p) => laeuferZustandText({ zustand: u0.zustand, absturz: u0.absturz, paket: p }, String).text), ['bereit – wartet auf das erste Ereignis', 'bereit – wartet auf das erste Ereignis']);
    assert.deepEqual(gelesen.sort(), ['eins', 'zwei']);
    gelesen.length = 0;
    await installiere(d, 'drei', ECHO);
    await l.codeGeaendert();
    await warte(async () => (await l.uebersicht()).pakete.length === 3 && (await l.uebersicht()).pakete.every((p) => p.geladen));
    assert.deepEqual(gelesen, ['drei'], 'nur das neue Paket aus der Datenbank');
    // Die anderen laufen mit ihrem behaltenen Modul weiter.
    await d.melde('dokument.hochgeladen', { dokument: 'd1' });
    await warte(async () => { const e = await d.ereignisStand(); return e.eins?.zugestellt === 1 && e.zwei?.zugestellt === 1 && e.drei?.zugestellt === 1; });
    // Absturz: Zustand „neustart“ mit Zeit, danach „neu gestartet nach Absturz“; nach dem Neustart wieder alle Module.
    gelesen.length = 0;
    (l as unknown as { kind: { kill(s: string): void } }).kind.kill('SIGKILL');
    await warte(async () => (await l.uebersicht()).zustand === 'neustart');
    const u1 = await l.uebersicht();
    assert.ok(u1.absturz);
    assert.match(laeuferZustandText({ zustand: u1.zustand, absturz: u1.absturz, paket: u1.pakete[0] }, () => 'HH:MM').text, /^abgestürzt um HH:MM – startet neu/);
    await warte(async () => { const u = await l.uebersicht(); return u.zustand === 'bereit' && u.pakete.every((p) => p.geladen); });
    const u2 = await l.uebersicht();
    assert.equal(laeuferZustandText({ zustand: u2.zustand, absturz: u2.absturz, paket: u2.pakete[0] }, () => 'HH:MM').text, 'neu gestartet nach Absturz um HH:MM');
    assert.deepEqual(gelesen.sort(), ['drei', 'eins', 'zwei'], 'neuer Prozess: alle Module');
  });

  it('Grenzen: Endlosschleife und zu viel Speicher brechen ab und erscheinen in der Übersicht', async () => {
    const { d, l } = await aufbau({ sekunden: 1 });
    await installiere(d, 'schleife', SCHLEIFE);
    await installiere(d, 'gierig', GIERIG);
    await l.start();
    await warte(async () => (await l.uebersicht()).laeuft);
    await d.melde('dokument.hochgeladen', { dokument: 'd1' });
    await warte(async () => (await l.uebersicht()).pakete.every((p) => p.fehlgeschlagen === 1));
    const u2 = await l.uebersicht();
    assert.match(u2.pakete.find((p) => p.id === 'schleife')!.letzte[0].text, /Zeitgrenze/);
    assert.match(u2.pakete.find((p) => p.id === 'gierig')!.letzte[0].text, /Abbruch im Modul|Speicher/);
    assert.equal((await d.ereignisStand()).schleife.offen, 1, 'wird später wiederholt');
  });
});

/* ---------- Vektoren (#442) ---------- */
const VEKTOR_JSON = JSON.stringify({ modell: 'probe/8', vektor: [1, 0.1, 0, 0, 0, 0, 0, 0], schwelle: 0.3 });
/** Antwortet auf jede Aktion (auch „dms:vektor“) mit demselben Vektor; Ereignisse: nichts zu tun. */
const VEKTOR = modul({ ereignis: [0x41, 0], aktion: [0x41, ...s(512), 0x41, ...s(VEKTOR_JSON.length), 0x10, ERGEBNIS, 0x1a, 0x41, 0], daten: [[512, VEKTOR_JSON]] });
/** Antwortet nie (Endlosschleife in der Aktion). */
const STUMM = modul({ ereignis: [0x41, 0], aktion: [0x03, 0x40, 0x0c, 0x00, 0x0b, 0x41, 0] });
const KI_RECHTE = '{ lesen: ["*"], dokumente: lesen, schnittstellen: ["dms:vektoren"] }';

describe('Vektoren (#442): Recht dms:vektoren im Manifest', () => {
  it('code.rechte.schnittstellen: bekannt, braucht Dokumente lesen, erscheint in der Rückfrage, ändert die Rechte', () => {
    const c = liesCode({ sprache: 'c', ereignisse: ['volltext.fertig'], rechte: { lesen: ['*'], dokumente: 'lesen', schnittstellen: ['dms:vektoren'] } });
    assert.deepEqual(c.fehler, []);
    assert.deepEqual(c.code!.rechte.schnittstellen, ['dms:vektoren']);
    assert.match(liesCode({ sprache: 'c', rechte: { schnittstellen: ['dms:alles'] } }).fehler.join(' '), /„dms:alles“ gibt es nicht/);
    assert.match(liesCode({ sprache: 'c', rechte: { schnittstellen: ['dms:vektoren'] } }).fehler.join(' '), /braucht auch code.rechte.dokumente: lesen/);
    const punkte = rechtePunkte(c.code!, (v) => v);
    const p = punkte.find((x) => x.text.includes('dms:vektoren'))!;
    assert.equal(p.text, 'Vektoren zu Dokumenten speichern und ähnliche Dokumente finden (dms:vektoren)');
    assert.ok(HILFE[p.hilfe], 'Handbuch-Stelle');
    assert.ok(punkte.some((x) => x.unter?.some((u) => u.text === 'Der Volltext eines Dokuments ist da' && HILFE[u.hilfe])));
    const ohne = liesCode({ sprache: 'c', ereignisse: ['volltext.fertig'], rechte: { lesen: ['*'], dokumente: 'lesen' } }).code!;
    assert.equal(gleicheRechte(c.code!, ohne), false, 'neues Recht → beim Update neu bestätigen');
    assert.equal(gleicheRechte(ohne, liesCode({ sprache: 'c', ereignisse: ['volltext.fertig'], rechte: { lesen: ['*'], dokumente: 'lesen' } }).code!), true);
  });
});

describe('Vektoren (#442): Schnittstelle und Suche', () => {
  const laeufer: Paketlaeufer[] = [];
  after(async () => { for (const l of laeufer) await l.stop(); });
  const warte = async (f: () => Promise<boolean> | boolean, ms = 10_000) => { const ende = Date.now() + ms; while (!(await f())) { if (Date.now() > ende) throw new Error('Zeit abgelaufen'); await new Promise((r) => setTimeout(r, 50)); } };

  async function aufbau() {
    const d = new Dienst(speicherRepo(), speicherDateien(), { einstellungen: speicherEinstellungen() });
    const konten = new Konten(speicherKontoRepo(), () => null, () => 'http://localhost', d.benutzerspiegel());
    const schluessel = new ApiSchluesselDienst(speicherApiSchluesselRepo());
    const tabelle = routen(d, konten, { apiSchluessel: schluessel });
    const api: ApiAufruf = async () => ({ status: 404, kopf: {}, body: Buffer.from('{}') });
    const l = new Paketlaeufer({ dienst: d, konten, schluessel, api, einstellungen: async () => ({}), speicher: { lies: async () => ({}), schreibe: async () => {} }, grenzen: { sekunden: 3, speicherMB: 16 }, abrufMs: 100, nachlaufMs: 3_600_000 });
    laeufer.push(l);
    const installiere = async (id: string, wasm: Buffer, rechte: string, ereignisse = '[volltext.fertig]') => {
      const p = liesPaket(new Map([['manifest.yaml', Buffer.from(manifest(id, rechte, ereignisse))], ['code/modul.wasm', wasm]]));
      await d.speicherePaketCode(id, p.code!.dateien);
      await d.speicherePaket({ id, name: `Probe ${id}`, version: '1.0.0', beschreibung: '', lizenz: 'MIT', autor: { name: 'T', github: 't' }, herkunft: { art: 'hochgeladen', von: null, am: '' }, installiert: new Date().toISOString(), installiertVon: null, aktualisiert: null, aktualisiertVon: null, typen: {}, sichten: {}, abhaengigkeiten: {}, code: true, laeufer: { ...p.code!.info, modul: { sha256: 'x', groesse: wasm.length } } });
    };
    /** Ein Aufruf der API v1 mit dem Schlüssel eines Dienstkontos – wie ein Paket. */
    const rufe = async (paket: string, methode: string, pfad: string, params: Record<string, string>, body: unknown = {}, query: Record<string, string> = {}) => {
      const konto = await konten.dienstkonto(paket, paket);
      const r = tabelle.find((x) => x.methode === methode && x.pfad === pfad)!;
      const a = { body, params, query, ip: '127.0.0.1' } as unknown as Anfrage;
      const key = await schluessel.fuerDienstkonto(konto, 'schreiben');
      await pruefeZugang(r as Route, a, (n) => (n === 'authorization' ? `Bearer ${key}` : undefined), konten, schluessel);
      return (await r.handler(a)).body;
    };
    // Zwei Briefe (Post) und ein Vertrag mit je einem Dokument und Volltext.
    const post = await d.legePostAn({ betreff: 'Heizung' }, { id: null, name: 'Test' });
    const post2 = await d.legePostAn({ betreff: 'Strom' }, { id: null, name: 'Test' });
    const reg = (await d.sichereSystem()).post.register.find((x) => x.art === 'dokumente')!.key;
    const typ = await d.legeTypAn({ name: 'Vertrag', felder: [{ key: 'name', label: 'Name', typ: 'text' }] });
    const vertrag = await d.legeMappeAn({ typId: typ.id, werte: { name: 'Gastherme' } });
    const regV = typ.register.find((x) => x.art === 'dokumente')!.key;
    const dok = async (m: string, r: string, name: string, text: string) => {
      const x = (await d.ladeHoch(m, { register: r, name }, Buffer.from(`%PDF-1.4 ${name}`), null)).dokument;
      await d.schreibeVolltext(x.id, { text }, { id: null as never, herkunft: 'Test', paket: false });
      return x.id;
    };
    const d1 = await dok(post.id, reg, 'rechnung.pdf', 'Rechnung Heizung');
    const d2 = await dok(post2.id, reg, 'strom.pdf', 'Abschlag Strom');
    const d3 = await dok(vertrag.id, regV, 'wartung.pdf', 'Wartung Gastherme');
    return { d, konten, l, installiere, rufe, post, post2, vertrag, d1, d2, d3 };
  }

  it('Pakete mit dms:vektoren setzen und löschen Vektoren; ohne das Recht 403; ähnliche nur aus lesbaren Mappen', async () => {
    const x = await aufbau();
    await x.installiere('ki', VEKTOR, KI_RECHTE);
    await x.installiere('ohne', VEKTOR, '{ lesen: ["*"], dokumente: lesen }');
    await x.installiere('nurpost', VEKTOR, '{ lesen: ["dms:post"], dokumente: lesen, schnittstellen: ["dms:vektoren"] }');
    const setze = (paket: string, dok: string, vektor: number[], modell = 'probe/8') => x.rufe(paket, 'PUT', '/api/v1/dokumente/:id/vektor', { id: dok }, { modell, vektor });
    assert.deepEqual(await setze('ki', x.d1, [1, 0, 0, 0, 0, 0, 0, 0]), { dokument: x.d1, modell: 'probe/8', dimension: 8 });
    await setze('ki', x.d2, [0, 1, 0, 0, 0, 0, 0, 0]);
    await setze('ki', x.d3, [0.9, 0.2, 0, 0, 0, 0, 0, 0]);
    await assert.rejects(setze('ohne', x.d1, [1, 0, 0, 0, 0, 0, 0, 0]), /Recht „dms:vektoren“ nicht/);
    await assert.rejects(setze('ki', x.d1, [1, 0, 0]), /8 bis 4096 Werte/);
    await assert.rejects(setze('ki', x.d1, new Array(9).fill(1)), /haben 8 Werte, dieser hat 9/);
    // Ein Paket, das nur Post lesen darf, kommt an den Vertrag nicht heran – weder schreiben noch finden.
    await assert.rejects(setze('nurpost', x.d3, [1, 0, 0, 0, 0, 0, 0, 0]), (e: { status?: number }) => e.status === 404);
    const ki = await x.rufe('ki', 'GET', '/api/v1/dokumente/:id/aehnliche', { id: x.d1 }) as { treffer: Array<{ dokumentId: string; aehnlichkeit: number }> };
    assert.deepEqual(ki.treffer.map((t) => t.dokumentId), [x.d3, x.d2], 'absteigend, ohne das Dokument selbst');
    assert.ok(ki.treffer[0].aehnlichkeit > 0.97);
    const np = await x.rufe('nurpost', 'POST', '/api/v1/vektoren/aehnliche', {}, { vektor: [1, 0, 0, 0, 0, 0, 0, 0] }) as { treffer: Array<{ dokumentId: string }> };
    assert.deepEqual(np.treffer.map((t) => t.dokumentId), [x.d1, x.d2], 'nur lesbare Mappen');
    // An der Mappe (Oberfläche): je Mappe, ohne die eigene.
    await x.l.start();
    await warte(() => x.l.vektorPaket() === 'ki');
    const anMappe = await x.d.aehnlicheZurMappe(undefined, x.post.id);
    assert.equal(anMappe.verfuegbar, true);
    assert.deepEqual(anMappe.mappen.map((m) => [m.id, m.dokument.name]), [[x.vertrag.id, 'wartung.pdf']], 'nur ab der Schwelle');
    // Löschen: nur dieses Dokument und Modell.
    assert.deepEqual(await x.rufe('ki', 'DELETE', '/api/v1/dokumente/:id/vektor', { id: x.d3 }, {}, { modell: 'probe/8' }), { entfernt: 1 });
    await assert.rejects(x.rufe('ki', 'GET', '/api/v1/dokumente/:id/aehnliche', { id: x.d3 }), /noch\) keinen Vektor/);
    // Modellwechsel: alte Vektoren des Pakets sind ungültig und weg.
    await setze('ki', x.d3, [1, 0, 0, 0, 0, 0, 0, 0, 1], 'probe/9');
    assert.deepEqual((await x.d.vektorStand()).modelle.map((m) => m.modell), ['probe/9']);
  });

  it('Suche fragt das Paket nach dem Vektor (Kennzeichen „ähnlich“); ohne Antwort in der Zeit wie bisher', async () => {
    const x = await aufbau();
    await x.installiere('ki', VEKTOR, KI_RECHTE);
    await x.l.start();
    await warte(() => x.l.vektorPaket() === 'ki' && x.l.uebersicht().then((u) => u.pakete[0]?.geladen));
    await x.rufe('ki', 'PUT', '/api/v1/dokumente/:id/vektor', { id: x.d1 }, { modell: 'probe/8', vektor: [0, 1, 0, 0, 0, 0, 0, 0] });
    await x.rufe('ki', 'PUT', '/api/v1/dokumente/:id/vektor', { id: x.d3 }, { modell: 'probe/8', vektor: [1, 0, 0, 0, 0, 0, 0, 0] });
    const ich = { id: 'u1', rolle: 'admin' };
    // „Heizung“ trifft die Post per Wort; der Vertrag (Gastherme) kommt als ähnlicher Treffer dazu.
    const s1 = await x.d.seite(ich, { sicht: 'suche', link: '', suche: 'Heizung', volltext: 'true' });
    assert.deepEqual(s1.mappen.map((m) => m.id), [x.post.id]);
    assert.deepEqual(s1.aehnlich?.map((a) => [a.id, a.dokument.name]), [[x.vertrag.id, 'wartung.pdf']]);
    assert.ok(s1.aehnlich![0].aehnlichkeit > 0.9);
    // Nur mit „auch in Dokumenten“, nur auf der ersten Seite, nicht in Ansichten.
    assert.equal((await x.d.seite(ich, { sicht: 'suche', link: '', suche: 'Heizung' })).aehnlich, undefined);
    assert.equal((await x.d.seite(ich, { sicht: 'suche', link: '', suche: 'Heizung', volltext: 'true', von: 1 })).aehnlich, undefined);
    assert.equal((await x.d.seite(ich, { sicht: x.post.typId, suche: 'Heizung', volltext: 'true' })).aehnlich, undefined);
    // Einstellung aus: keine ähnlichen Treffer.
    await x.d.setzeVektorEinstellung({ suche: false });
    assert.equal((await x.d.seite(ich, { sicht: 'suche', link: '', suche: 'Heizung', volltext: 'true' })).aehnlich, undefined);
    await x.d.setzeVektorEinstellung({ suche: true });
    // Werkbank: Stand.
    const st = await x.d.vektorStand();
    assert.deepEqual([st.paket, st.modell, st.mitVektor, st.mitVolltext, st.suche], ['ki', 'probe/8', 2, 3, true]);

    // Ein Paket, das nicht antwortet: die Suche wartet höchstens die Zeitgrenze und läuft wie bisher.
    const y = await aufbau();
    await y.installiere('ki', STUMM, KI_RECHTE);
    await y.l.start();
    await warte(() => y.l.vektorPaket() === 'ki' && y.l.uebersicht().then((u) => u.pakete[0]?.geladen));
    const t0 = Date.now();
    assert.equal(await y.d.aehnlicheZurSuche(undefined, 'Heizung', { typen: null, ohneMappen: new Set(), ms: 300 }).then((r) => r.length), 0);
    assert.ok(Date.now() - t0 < 2000, `${Date.now() - t0} ms`);
    const s2 = await y.d.seite(ich, { sicht: 'suche', link: '', suche: 'Heizung', volltext: 'true' });
    assert.deepEqual(s2.mappen.map((m) => m.id), [y.post.id]);
    assert.equal(s2.aehnlich, undefined);
  });

  it('Ereignis volltext.fertig an das Paket; Nachberechnung des Bestands gedrosselt bis alles da ist', async () => {
    const x = await aufbau();
    await x.installiere('ki', VEKTOR, KI_RECHTE);
    const neu = await x.d.legePostAn({ betreff: 'Neu' }, { id: null, name: 'Test' });
    const reg = (await x.d.sichereSystem()).post.register.find((r) => r.art === 'dokumente')!.key;
    const d4 = (await x.d.ladeHoch(neu.id, { register: reg, name: 'neu.pdf' }, Buffer.from('%PDF-1.4 neu'), null)).dokument.id;
    await x.d.schreibeVolltext(d4, { text: 'Neuer Text' }, { id: null as never, herkunft: 'Test', paket: false });
    assert.equal((await x.d.ereignisStand()).ki?.offen, 1, 'nur das Dokument, das nach der Installation Volltext bekam');
    await x.l.start();
    await warte(async () => (await x.d.ereignisStand()).ki?.offen === 0);
    // Bestand: die anderen 3 Dokumente (Volltext vor der Installation) holt die Nachberechnung.
    await x.l.nachberechnen();
    assert.equal((await x.d.vektorStand()).modell, 'probe/8', 'Modell beim Paket erfragt');
    const offen = (await x.d.ereignisStand()).ki?.offen ?? 0;
    const zugestellt = (await x.d.ereignisStand()).ki?.zugestellt ?? 0;
    assert.ok(offen + zugestellt >= 4, `${offen} offen, ${zugestellt} zugestellt`);
    // Solange etwas offen ist, kommt nichts dazu; das Paket hier schreibt keine Vektoren – der nächste Durchgang pausiert.
    await warte(async () => (await x.d.ereignisStand()).ki?.offen === 0);
    await x.l.nachberechnen();
    assert.equal((await x.d.ereignisStand()).ki?.offen, 0, 'nach einem vollständigen Durchgang Pause');
  });
});

describe('Paket-Läufer (#338): gebaut wie im Betrieb', () => {
  // Wie „npm run build“: prozess.mjs und arbeiter.mjs gebündelt in dist/ (mit package.json darüber wie im Image), gestartet mit dem
  // Berechtigungsmodell von Node (nur dieser Ordner lesbar, Worker erlaubt).
  it('läuft gebündelt unter --permission', async (t) => {
    let esbuild: typeof import('esbuild');
    try { esbuild = await import('esbuild'); } catch { t.skip('esbuild nicht installiert'); return; }
    const { mkdtemp } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const { fork } = await import('node:child_process');
    const { mkdir, writeFile } = await import('node:fs/promises');
    const app = await mkdtemp(join(tmpdir(), 'dms-laeufer-'));
    await writeFile(join(app, 'package.json'), '{ "type": "module" }');
    const dir = join(app, 'dist');
    await mkdir(dir);
    const quelle = (n: string) => new URL(`../src/laeufer/${n}`, import.meta.url).pathname;
    await esbuild.build({ entryPoints: [quelle('prozess.ts'), quelle('arbeiter.ts')], bundle: true, platform: 'node', format: 'esm', packages: 'external', outdir: dir, outExtension: { '.js': '.mjs' }, logLevel: 'silent' });
    const kind = fork(join(dir, 'prozess.mjs'), [], { serialization: 'advanced', execArgv: ['--permission', '--allow-worker', `--allow-fs-read=${dir}`, '--disable-warning=SecurityWarning'], stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
    const ergebnisse: Array<{ ok: boolean; text: string; fehler: string | null }> = [];
    const logs: string[] = [];
    await new Promise<void>((fertig, fehler) => {
      const uhr = setTimeout(() => { kind.kill(); fehler(new Error('Zeit abgelaufen')); }, 20_000);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      kind.on('message', (m: any) => {
        if (m.art === 'bereit') kind.send({ art: 'pakete', pakete: [{ id: 'echo', version: '1.0.0', modul: new Uint8Array(ECHO), daten: [], netz: [] }], grenzen: { speicherMB: 16, sekunden: 5, parallel: 1 } });
        else if (m.art === 'geladen') { assert.equal(m.pakete[0].fehler, null); kind.send({ art: 'aufruf', nr: 1, paket: 'echo', eingang: { art: 'ereignis', json: '{"art":"x"}' } }); }
        else if (m.art === 'frage') kind.send({ art: 'antwort', nr: m.nr, antwort: { status: 200, body: new TextEncoder().encode('{}') } });
        else if (m.art === 'log') logs.push(m.text);
        else if (m.art === 'ergebnis') {
          ergebnisse.push(m);
          if (m.nr === 1) kind.send({ art: 'aufruf', nr: 2, paket: 'echo', eingang: { art: 'aktion', json: '{}' } });
          else { clearTimeout(uhr); kind.disconnect(); fertig(); }
        }
      });
      kind.on('error', fehler);
    });
    assert.deepEqual(ergebnisse.map((e) => [e.ok, e.fehler]), [[true, null], [true, null]]);
    assert.equal(ergebnisse[1].text, 'Aktion ok');
    assert.match(logs.join(), /"art":"x"/);
  });
});
