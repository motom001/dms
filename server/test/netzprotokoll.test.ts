/**
 * Netzaufrufe der Pakete im Protokoll (#807): Je Aufruf von dms.netz ein Eintrag im Protokoll des Pakets (Zeit,
 * Methode, Host ohne Pfad/Query/Zugangsdaten, Bytes hin und zurück, Status), gleiche kurz hintereinander
 * zusammengefasst, abgelehnte als Warnung, eine Zeile mit der Summe im Systemprotokoll. Nie Inhalte oder Köpfe.
 * Der echte Paket-Läufer mit dem kleinen Modul aus fragen.test.ts (Antwort Stück für Stück). Texte sind erfunden.
 */
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { after, describe, it } from 'node:test';
import { ApiSchluesselDienst, speicherApiSchluesselRepo } from '../src/apischluessel';
import { speicherDateien } from '../src/dateispeicher';
import { Dienst } from '../src/dienst';
import { speicherEinstellungen } from '../src/einstellungen';
import { Konten } from '../src/konten';
import { speicherKontoRepo } from '../src/konto-repo';
import { netzHost, netzMethode, netzSammler, type NetzEintrag } from '../src/laeufer/prozess';
import { bytesText, merkeNetz, NETZ_ZUSAMMEN_MS, netzText, Paketlaeufer } from '../src/laeufer/verwaltung';
import { liesPaket } from '../src/pakete';
import { protokoll } from '../src/protokoll';
import { speicherRepo } from '../src/repo-speicher';

describe('Netzaufrufe im Protokoll (#807): Sammeln und Zusammenfassen', () => {
  it('nur der Host – ohne Pfad, Query und Zugangsdaten', () => {
    assert.equal(netzHost('https://nutzer:geheim@api.example.org:8443/v1/chat?schluessel=abc#x'), 'api.example.org:8443');
    assert.equal(netzHost('kaputt'), '?');
  });

  it('Methode nur ^[A-Z]{1,10}$ (klein wird groß, ohne Angabe GET); sonst abgelehnt und im Protokoll als „?“', () => {
    assert.equal(netzMethode(undefined), 'GET');
    assert.equal(netzMethode('post'), 'POST');
    for (const m of ['GET /x HTTP/1.1', 'GET\r\nX-A: 1', 'PROPFINDXXX', '', 'M-SEARCH', 7]) assert.equal(netzMethode(m), null, String(m));
    const s = netzSammler();
    s.log({ methode: 'GET\r\nX', url: 'https://api.example.org/', status: null, hin: 0, zurueck: 0, abgelehnt: true });
    assert.equal(s.liste()[0].methode, '?');
  });

  it('je Aufruf: gleiche Anfragen zählen in einen Eintrag, verschiedene Status getrennt, abgelehnte eigens', () => {
    const s = netzSammler();
    for (let i = 0; i < 12; i++) s.log({ methode: 'PUT', url: `https://cloud.example.org/remote.php/dav/teil-${i}`, status: 201, hin: 300_000, zurueck: 0 });
    s.log({ methode: 'PUT', url: 'https://cloud.example.org/x', status: 507, hin: 300_000, zurueck: 120 });
    s.log({ methode: 'GET', url: 'https://boese.example.net/raus?daten=geheim', status: null, hin: 0, zurueck: 0, abgelehnt: true });
    const l = s.liste();
    assert.equal(l.length, 3);
    assert.deepEqual([l[0].methode, l[0].host, l[0].status, l[0].anzahl, l[0].hin], ['PUT', 'cloud.example.org', 201, 12, 3_600_000]);
    assert.equal(l[2].abgelehnt, true);
    assert.ok(!JSON.stringify(l).includes('remote.php') && !JSON.stringify(l).includes('geheim'), 'kein Pfad, keine Query');
  });

  it('über Aufrufe hinweg: innerhalb von NETZ_ZUSAMMEN_MS zusammengefasst, danach neu; abgelehnte als Warnung; Text ohne Inhalt', () => {
    const t0 = Date.parse('2026-11-08T10:00:00Z');
    const e = (ms: number, x: Partial<NetzEintrag> = {}): NetzEintrag => ({ zeit: new Date(t0 + ms).toISOString(), bis: new Date(t0 + ms).toISOString(), methode: 'PUT', host: 'cloud.example.org', status: 201, anzahl: 4, hin: 1024 * 1024, zurueck: 10, ...x });
    const p: Array<{ zeit: string; stufe: number; text: string; netz?: NetzEintrag }> = [{ zeit: new Date(t0).toISOString(), stufe: 1, text: 'Ausgabe des Pakets' }];
    merkeNetz(p, [e(0)]);
    merkeNetz(p, [e(30_000)]);
    assert.equal(p.length, 2, 'zusammengefasst');
    assert.equal(p[1].netz!.anzahl, 8);
    assert.equal(p[1].netz!.hin, 2 * 1024 * 1024);
    assert.match(p[1].text, /8 × PUT cloud\.example\.org – 201, 2 MB hin, 20 B zurück/);
    merkeNetz(p, [e(30_000 + NETZ_ZUSAMMEN_MS + 1)]);
    assert.equal(p.length, 3, 'später: neuer Eintrag');
    merkeNetz(p, [e(200_000, { methode: 'GET', host: 'boese.example.net', status: null, anzahl: 1, hin: 0, zurueck: 0, abgelehnt: true })]);
    assert.equal(p.at(-1)!.stufe, 2);
    assert.match(p.at(-1)!.text, /abgelehnt.*boese\.example\.net/);
    // Höchstens 50 Einträge.
    for (let i = 0; i < 60; i++) merkeNetz(p, [e(1_000_000 + i * (NETZ_ZUSAMMEN_MS + 1))]);
    assert.equal(p.length, 50);
    assert.equal(bytesText(0), '0 B');
    assert.equal(netzText({ ...e(0), status: null }).includes('keine Antwort'), true);
  });
});

/* ---------- Echter Paket-Läufer: kleines Modul aus fragen.test.ts ---------- */

const u = (n: number): number[] => { const b: number[] = []; do { let x = n & 0x7f; n >>>= 7; if (n) x |= 0x80; b.push(x); } while (n); return b; };
const s = (n: number): number[] => { const b: number[] = []; for (;;) { const x = n & 0x7f; n >>= 7; if ((n === 0 && !(x & 0x40)) || (n === -1 && x & 0x40)) { b.push(x); return b; } b.push(x | 0x80); } };
const vec = (l: number[][]) => [...u(l.length), ...l.flat()];
const str = (t: string) => { const b = [...Buffer.from(t)]; return [...u(b.length), ...b]; };
const sek = (id: number, b: number[]) => [id, ...u(b.length), ...b];
const I32 = 0x7f;
const typ = (p: number, r: number) => [0x60, ...u(p), ...Array(p).fill(I32), ...u(r), ...Array(r).fill(I32)];

/**
 * Modul nach der Paket-ABI: dms_aktion öffnet die Anfrage `anfrage` mit netz_strom, gibt jedes Stück mit teil
 * weiter und meldet am Ende `ergebnis`. Importe: teil, ergebnis, netz_strom, netz_weiter, antwort_lesen.
 */
function stromModul(anfrage: string, ergebnis: string): Buffer {
  const TEIL = 0, ERG = 1, STROM = 2, WEITER = 3, LESEN = 4;
  const typen = [typ(4, 1), typ(2, 1), typ(0, 1), typ(1, 1)];
  const imp = (n: string, t: number) => [...str('dms'), ...str(n), 0x00, t];
  const importe = [[...str('env'), ...str('memory'), 0x02, 0x00, ...u(4)], imp('teil', 1), imp('ergebnis', 1), imp('netz_strom', 0), imp('netz_weiter', 2), imp('antwort_lesen', 1)];
  const A = 1024, E = 4096, P = 131072, B = 65536;
  const koerper = (lokale: number[], b: number[]) => { const k = [...lokale, ...b, 0x0b]; return [...u(k.length), ...k]; };
  const aktion = [
    0x41, ...s(A), 0x41, ...s(Buffer.byteLength(anfrage)), 0x41, 0, 0x41, 0, 0x10, STROM, 0x1a,
    0x02, 0x40, 0x03, 0x40,
    0x10, WEITER, 0x22, 2, 0x41, 0, 0x4c, 0x0d, 1,
    0x41, ...s(B), 0x20, 2, 0x10, LESEN, 0x1a,
    0x41, ...s(B), 0x20, 2, 0x10, TEIL, 0x1a,
    0x0c, 0, 0x0b, 0x0b,
    0x41, ...s(E), 0x41, ...s(Buffer.byteLength(ergebnis)), 0x10, ERG, 0x1a, 0x41, 0,
  ];
  const code = [koerper([0x00], [0x41, ...s(P)]), koerper([0x00], [0x41, 0]), koerper([0x01, 0x01, I32], aktion)];
  const daten = [[0x00, 0x41, ...s(A), 0x0b, ...str(anfrage)], [0x00, 0x41, ...s(E), 0x0b, ...str(ergebnis)]];
  return Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0, 0, 0,
    ...sek(1, vec(typen)), ...sek(2, vec(importe)), ...sek(3, vec([[3], [1], [1]])),
    ...sek(7, vec([[...str('dms_puffer'), 0x00, 5], [...str('dms_ereignis'), 0x00, 6], [...str('dms_aktion'), 0x00, 7]])),
    ...sek(10, vec(code)), ...sek(11, vec(daten))]);
}

describe('Netzaufrufe im Protokoll (#807): echter Paket-Läufer', () => {
  const offen: Array<{ stop(): Promise<void> } | Server> = [];
  after(async () => { for (const x of offen) { if ('stop' in x) await x.stop(); else x.close(); } });
  const warte = async (f: () => boolean, ms = 10_000) => { const ende = Date.now() + ms; while (!f()) { if (Date.now() > ende) throw new Error('Zeit abgelaufen'); await new Promise((r) => setTimeout(r, 50)); } };

  it('Eintrag je Netzaufruf (Host, Bytes, Status), abgelehnt als Warnung, Summe im Systemprotokoll – ohne Inhalte', async () => {
    const ANTWORT = 'Die Police läuft am 31.12.2026 aus.';
    let anfragen = 0;
    const dienst = createServer((q, a) => {
      anfragen++;
      if (!q.url?.startsWith('/v1/chat/completions?')) { a.writeHead(404).end(); return; }
      a.writeHead(200, { 'content-type': 'text/plain' });
      a.end(ANTWORT);
    });
    await new Promise<void>((ok) => dienst.listen(0, '127.0.0.1', ok));
    offen.push(dienst);
    const port = (dienst.address() as { port: number }).port;
    const host = `127.0.0.1:${port}`;
    const adresse = `http://${host}/v1`;
    const wasm = stromModul(JSON.stringify({ methode: 'POST', url: `${adresse}/chat/completions?schluessel=geheim`, kopf: { authorization: 'Bearer geheim' } }), '{"text":"ok"}');

    const d = new Dienst(speicherRepo(), speicherDateien(), { einstellungen: speicherEinstellungen() });
    const konten = new Konten(speicherKontoRepo(), () => null, () => 'http://localhost', d.systemtypen.benutzerspiegel());
    let werte: Record<string, unknown> = {};
    const l = new Paketlaeufer({ dienst: d, konten, schluessel: new ApiSchluesselDienst(speicherApiSchluesselRepo()), api: async () => ({ status: 404, kopf: {}, body: Buffer.from('{}') }), einstellungen: async () => werte, speicher: { lies: async () => ({}), schreibe: async () => {} }, grenzen: { sekunden: 10, speicherMB: 16 }, abrufMs: 100, nachlaufMs: 3_600_000 });
    offen.push(l);
    const manifest = `schema: 1\nid: ki_probe\nname: KI Probe\nversion: 1.0.0\nbeschreibung: Test.\nautor: { name: Test, github: test }\nlizenz: Apache-2.0\ndms: ">=0.124.0"\ninhalt: {}\ncode:\n  sprache: c\n  quelle: code/\n  rechte: { schnittstellen: ["dms:antworten"] }\n  einstellungen:\n    - abschnitt: Dienst\n      felder:\n        - { schluessel: dienst, name: Dienst-Adresse, typ: adresse }\n`;
    const p = liesPaket(new Map([['manifest.yaml', Buffer.from(manifest)], ['code/modul.wasm', wasm]]));
    await d.kern.repo.speicherePaketCode('ki_probe', p.code!.dateien);
    await d.kern.repo.speicherePaket({ id: 'ki_probe', name: 'KI Probe', version: '1.0.0', beschreibung: '', lizenz: 'Apache-2.0', autor: { name: 'T', github: 't' }, herkunft: { art: 'hochgeladen', von: null, am: '' }, installiert: new Date().toISOString(), installiertVon: null, aktualisiert: null, aktualisiertVon: null, typen: {}, sichten: {}, abhaengigkeiten: {}, code: true, einstellungen: p.einstellungen, laeufer: { ...p.code!.info, modul: { sha256: 'x', groesse: wasm.length } } });
    await l.start();
    await warte(() => !!d.fragen.anbieter?.paket());
    const seit = protokoll.eintraege({ max: 1 })[0]?.nr ?? 0;

    // Ohne bestätigte Adresse: abgelehnt – als Warnung im Protokoll des Pakets.
    await d.fragen.anbieter!.antworte('ki_probe', { frage: 'x' }, () => {});
    let stand = (await l.uebersicht()).pakete[0];
    const abgelehnt = stand.protokoll.find((x) => x.netz?.abgelehnt);
    assert.ok(abgelehnt, JSON.stringify(stand.protokoll));
    assert.equal(abgelehnt!.stufe, 2);
    assert.equal(abgelehnt!.netz!.host, host);

    // Mit Adresse: zweimal kurz hintereinander → ein Eintrag mit 2 Anfragen und den Bytes der Antworten.
    werte = { dienst: adresse };
    await l.codeGeaendert();
    await d.fragen.anbieter!.antworte('ki_probe', { frage: 'Wann läuft die Police aus?' }, () => {});
    await d.fragen.anbieter!.antworte('ki_probe', { frage: 'Und die andere?' }, () => {});
    stand = (await l.uebersicht()).pakete[0];
    const ok = stand.protokoll.filter((x) => x.netz && !x.netz.abgelehnt);
    assert.equal(ok.length, 1, JSON.stringify(stand.protokoll));
    assert.deepEqual([ok[0].netz!.methode, ok[0].netz!.host, ok[0].netz!.status, ok[0].netz!.anzahl, ok[0].netz!.zurueck], ['POST', host, 200, 2, 2 * Buffer.byteLength(ANTWORT)]);
    assert.equal(ok[0].stufe, 1);
    const alles = JSON.stringify(stand);
    for (const geheim of ['/v1/chat', 'schluessel=geheim', 'Bearer', '31.12.2026', 'Police']) assert.ok(!alles.includes(geheim), `nicht in der Werkbank: ${geheim}`);

    // Systemprotokoll: eine Zeile je Aufruf mit der Summe, Stufe info, ohne Inhalte.
    const zeilen = protokoll.eintraege({ seit, suche: 'Netzaufrufe' }).filter((x) => x.text.includes('ki_probe'));
    assert.ok(zeilen.length >= 3, JSON.stringify(zeilen));
    assert.ok(zeilen.every((x) => x.stufe === 'info'));
    assert.ok(zeilen.some((x) => x.daten?.anfragen === 1 && x.daten?.hosts === host && x.daten?.zurueck === Buffer.byteLength(ANTWORT)), JSON.stringify(zeilen.map((x) => x.daten)));
    assert.ok(zeilen.some((x) => x.daten?.abgelehnt === 1));
    assert.ok(!JSON.stringify(zeilen).includes('31.12.2026') && !JSON.stringify(zeilen).includes('/v1/chat'));

    // Ungültige Methode (Sicherheit zu #807): nichts geht hinaus, im Protokoll abgelehnt mit „?“.
    const vorher = anfragen;
    const boese = stromModul(JSON.stringify({ methode: 'GET /v1/x HTTP/1.1\r\nX-Boese: 1', url: `${adresse}/chat/completions?x=1` }), '{"text":"ok"}');
    const p2 = liesPaket(new Map([['manifest.yaml', Buffer.from(manifest.replace(/ki_probe/g, 'ki_boese').replace('KI Probe', 'KI Boese'))], ['code/modul.wasm', boese]]));
    await d.kern.repo.speicherePaketCode('ki_boese', p2.code!.dateien);
    await d.kern.repo.speicherePaket({ id: 'ki_boese', name: 'KI Boese', version: '1.0.0', beschreibung: '', lizenz: 'Apache-2.0', autor: { name: 'T', github: 't' }, herkunft: { art: 'hochgeladen', von: null, am: '' }, installiert: new Date().toISOString(), installiertVon: null, aktualisiert: null, aktualisiertVon: null, typen: {}, sichten: {}, abhaengigkeiten: {}, code: true, einstellungen: p2.einstellungen, laeufer: { ...p2.code!.info, modul: { sha256: 'y', groesse: boese.length } } });
    await l.codeGeaendert();
    let geladen = false;
    await warte(() => { void l.uebersicht().then((u) => { geladen = !!u.pakete.find((x) => x.id === 'ki_boese')?.geladen; }); return geladen; });
    await l.schnittstelle('ki_boese', 'dms:antworten', { frage: 'x' }, { bezeichnung: 'Test' });
    assert.equal(anfragen, vorher, 'keine Anfrage beim Dienst');
    const b = (await l.uebersicht()).pakete.find((x) => x.id === 'ki_boese')!;
    const e = b.protokoll.find((x) => x.netz);
    assert.ok(e?.netz?.abgelehnt && e.netz.methode === '?' && e.stufe === 2, JSON.stringify(b.protokoll));
  });
});
