/**
 * Externe Dienste (#565): Laufzeit, Datenmenge, Fehler, Token und Kosten – gemessen an einer Stelle, nur Metadaten.
 * - Token aus `usage` (OpenAI, Anthropic, Ollama, Gemini), Kennzahlen (Mittel, p50, p95), Server-Timing `extern`.
 * - Monatsbudget: Warnung ab 80 %, harte Grenze pausiert kostenpflichtige KI-Funktionen bis zum Monatsanfang.
 * - Aufbewahrung: Rohdaten ROH_TAGE Tage, dann Monatssummen; Monatssummen MONATE Monate.
 * - Keine Inhalte: markante Frage, Antwort, Betreff, Adresse und URL mit Query laufen durch KI-Dienst (echter
 *   Paket-Läufer), Versand, Postfach und Anmeldeanbieter; danach steht keiner davon in Messwerten, Auswertung,
 *   Protokoll oder Server-Timing – mit TEST_DATABASE_URL auch nicht in den Tabellen.
 * Personen und Adressen sind erfunden (example.org).
 */
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { after, before, describe, it } from 'node:test';
import type postgres from 'postgres';
import {
  budgetStand, externTiming, kennzahlen, KOSTEN_STANDARD, kostenFuer, liesExternTiming, liesToken, MONATE, pruefeKosten, ROH_TAGE, WARNUNG_AB,
  type ExternAufruf,
} from '../../shared/src/extern';
import { liesServerTiming } from '../../shared/src/zeitmessung';
import { ApiSchluesselDienst, speicherApiSchluesselRepo } from '../src/apischluessel';
import { Betrieb, speicherBetrieb, type transport } from '../src/betrieb';
import { speicherDateien } from '../src/dateispeicher';
import { Dienst } from '../src/dienst';
import { pgEinstellungen, speicherEinstellungen } from '../src/einstellungen';
import { Externmessung, extern, externDerAnfrage, imapGemessen, istZeitueberschreitung, pgExternSpeicher, speicherExternSpeicher, type ExternSpeicher } from '../src/externmessung';
import { Fachfehler } from '../src/fehler';
import { Konten } from '../src/konten';
import { speicherKontoRepo } from '../src/konto-repo';
import { netzMesser } from '../src/laeufer/prozess';
import { Paketlaeufer } from '../src/laeufer/verwaltung';
import { serverTiming, zeitaufteilung } from '../src/messung';
import { Oidc, type Abruf } from '../src/oidc';
import { liesPaket } from '../src/pakete';
import type { ImapSitzung } from '../src/postfach';
import { kontext, protokoll, type Kontext } from '../src/protokoll';
import { speicherRepo } from '../src/repo-speicher';
import { eigeneDatenbank } from './hilfe-db';

const aufruf = (x: Partial<ExternAufruf> = {}): ExternAufruf => ({ dienst: 'ki', paket: 'ki_cloud', funktion: 'antworten', ersteMs: 100, ms: 500, hin: 1000, zurueck: 2000, ergebnis: 'ok', tokenEin: 0, tokenAus: 0, ...x });
const kontextMit = (benutzerId?: string): Kontext => ({ anfrage: 'test', db: { anzahl: 0, ms: 0 }, ...(benutzerId ? { benutzerId } : {}) });

describe('Externe Dienste (#565): Bausteine', () => {
  it('Token aus usage: OpenAI, Anthropic, Ollama, Gemini; letzter Wert zählt; nichts anderes', () => {
    assert.deepEqual(liesToken('{"choices":[{"message":{"content":"x"}}],"usage":{"prompt_tokens":120,"completion_tokens":30,"total_tokens":150,"prompt_tokens_details":{"cached_tokens":5}}}'), { ein: 120, aus: 30 });
    assert.deepEqual(liesToken('event: message_start\ndata: {"message":{"usage":{"input_tokens":50,"output_tokens":1,"cache_read_input_tokens":7}}}\n\nevent: message_delta\ndata: {"usage":{"output_tokens":42}}'), { ein: 50, aus: 42 });
    assert.deepEqual(liesToken('{"model":"llama3.2","done":true,"prompt_eval_count":812,"eval_count":96}'), { ein: 812, aus: 96 });
    assert.deepEqual(liesToken('{"usageMetadata":{"promptTokenCount":10,"candidatesTokenCount":4}}'), { ein: 10, aus: 4 });
    assert.deepEqual(liesToken('{"content":"prompt_tokens: 99, \\"eval_count\\" ist kein Feld"}'), { ein: null, aus: null });
  });

  it('Kennzahlen: Mittel, p50, p95, erste Antwort, Fehler und Zeitüberschreitungen getrennt', () => {
    const l = Array.from({ length: 20 }, (_, i) => aufruf({ ms: (i + 1) * 100, ersteMs: 10, ergebnis: i === 0 ? 'fehler' : i === 1 ? 'zeit' : 'ok', tokenEin: 1, tokenAus: 2 }));
    const k = kennzahlen(l);
    assert.deepEqual([k.anzahl, k.mittelMs, k.p50Ms, k.p95Ms, k.ersteMs, k.fehler, k.zeit, k.tokenEin, k.tokenAus], [20, 1050, 1000, 1900, 10, 1, 1, 20, 40]);
    assert.equal(kennzahlen([]).p95Ms, null);
  });

  it('Kosten je 1 Mio. Token; Einstellung geprüft (Preis, Budget, Währung); harte Grenze nur mit Budget', () => {
    assert.equal(kostenFuer(1_000_000, 500_000, { ein: 3, aus: 15 }), 10.5);
    assert.equal(kostenFuer(1000, 1000, undefined), 0);
    const ok = pruefeKosten({ preise: { ki_cloud: { ein: '3', aus: 15 }, ki_lokal: { ein: 0, aus: '' }, 'BÖSE id': { ein: 1 } }, waehrung: 'eur', budget: '20', hart: true });
    assert.deepEqual(ok.fehler, {});
    assert.deepEqual(ok.wert, { preise: { ki_cloud: { ein: 3, aus: 15 } }, waehrung: 'EUR', budget: 20, hart: true });
    const falsch = pruefeKosten({ preise: { ki_cloud: { ein: -1 } }, budget: 0, waehrung: 'Euro' });
    assert.deepEqual(Object.keys(falsch.fehler).sort(), ['budget', 'preise.ki_cloud.ein', 'waehrung']);
    assert.equal(pruefeKosten({ hart: true }).wert.hart, false, 'ohne Budget keine harte Grenze');
  });

  it('Budget: Warnung ab 80 %, erreicht ab 100 %, pausiert nur mit harter Grenze – bis zum nächsten Monatsanfang', () => {
    const e = { ...KOSTEN_STANDARD, budget: 10, hart: false };
    const jetzt = new Date(2026, 10, 11, 15, 0);
    assert.equal(WARNUNG_AB, 0.8);
    assert.deepEqual([budgetStand(7.9, e, jetzt).warnung, budgetStand(8, e, jetzt).warnung, budgetStand(8, e, jetzt).erreicht], [false, true, false]);
    assert.equal(budgetStand(10, e, jetzt).pausiertBis, null);
    assert.equal(budgetStand(10, { ...e, hart: true }, jetzt).pausiertBis, new Date(2026, 11, 1).toISOString());
    assert.equal(budgetStand(1000, KOSTEN_STANDARD, jetzt).warnung, false, 'ohne Budget');
  });

  it('Server-Timing: Eintrag extern mit Summe, Anzahl und je Aufruf Dienst, Paket, erste Antwort, Bytes, Ergebnis', () => {
    const kopf = serverTiming(zeitaufteilung({ eingang: 0, start: 1, ende: 900, jetzt: 910, db: { anzahl: 1, ms: 2 } }), undefined, [aufruf({ ms: 812.4, ersteMs: 300 }), aufruf({ dienst: 'smtp', paket: null, funktion: 'versand', ms: 40, ersteMs: null, hin: 5, zurueck: 0, ergebnis: 'zeit' })]);
    assert.match(kopf, /extern;dur=852\.4;desc="2"/);
    assert.equal(liesServerTiming(kopf).werte.gesamt, 910, 'die übrigen Einträge bleiben lesbar');
    const x = liesExternTiming(kopf);
    assert.deepEqual(x.aufrufe, [
      { dienst: 'ki', paket: 'ki_cloud', ersteMs: 300, ms: 812.4, bytes: 3000, ergebnis: 'ok' },
      { dienst: 'smtp', paket: null, ersteMs: null, ms: 40, bytes: 5, ergebnis: 'zeit' },
    ]);
    assert.equal(externTiming([]), '');
    assert.ok(!externTiming([aufruf({ paket: 'a,b"c;d' })]).includes('a,b'), 'keine Trennzeichen aus der Paketkennung');
  });

  it('Zeitüberschreitungen werden erkannt (fetch, imapflow, nodemailer, Läufer)', () => {
    assert.ok(istZeitueberschreitung(Object.assign(new Error('x'), { name: 'TimeoutError' })));
    assert.ok(istZeitueberschreitung(Object.assign(new Error('Connection timeout'), { code: 'ETIMEDOUT' })));
    assert.ok(istZeitueberschreitung(new Error('Zeitgrenze erreicht')));
    assert.ok(!istZeitueberschreitung(new Error('Invalid login')));
  });

  it('Läufer: Netzaufrufe eines Aufrufs – erste Antwort, Dauer, Bytes, Token aus Strom-Stücken, Fehler', () => {
    const m = netzMesser();
    const json = { status: 200, headers: { get: () => 'application/x-ndjson' } };
    const a = m.aufruf(300);
    a.kopf(json);
    // Name des Felds über zwei Stücke geteilt.
    a.stueck(Buffer.from('{"message":{"content":"Hallo"},"done":false}\n{"done":true,"prompt_eval'));
    a.stueck(Buffer.from('_count":40,"eval_count":7}\n'));
    a.ende('ok');
    m.aufruf(10).ende('zeit');
    const c = m.aufruf(0);
    c.kopf({ status: 503, headers: { get: () => 'text/plain' } });
    c.stueck(Buffer.from('{"usage":{"prompt_tokens":5}}'));
    const r = m.ergebnis()!;
    assert.deepEqual([r.anzahl, r.hin, r.tokenEin, r.tokenAus, r.zeit, r.fehler], [3, 310, 40, 7, 1, 1], 'ohne JSON-Kopf keine Token; offener Aufruf zählt am Ende, 503 als Fehler');
    assert.ok(r.zurueck > 0 && r.ms >= r.ersteMs);
    assert.equal(netzMesser().ergebnis(), null);
  });
});

describe('Externe Dienste (#565): Messpunkt, Budget, Aufbewahrung', () => {
  const neu = (jetzt = new Date(2026, 10, 11, 12, 0)) => {
    const m = new Externmessung();
    const speicher = speicherExternSpeicher();
    const einst = speicherEinstellungen();
    m.setze({ speicher, einstellungen: einst });
    m.jetzt = () => jetzt;
    return { m, speicher, einst };
  };

  it('messe(): Dauer, erste Antwort, Bytes; Fehler und Zeitüberschreitung; Anfrage und Person aus dem Kontext', async () => {
    const { m, speicher } = neu(new Date());
    const k = kontextMit('person-1');
    await kontext.run(k, () => m.messe({ dienst: 'smtp', funktion: 'versand' }, async (p) => { p.ersteNach(5); p.bytes(1234, 0); return 1; }));
    await assert.rejects(kontext.run(k, () => m.messe({ dienst: 'oidc', funktion: 'token' }, async () => { throw Object.assign(new Error('x'), { name: 'TimeoutError' }); })));
    await m.messe({ dienst: 'imap', funktion: 'abruf' }, async (p) => { p.ergebnis('fehler'); });
    assert.deepEqual(speicher.zeilen.map((z) => [z.dienst, z.ergebnis, z.benutzerId]), [['imap', 'fehler', null], ['oidc', 'zeit', 'person-1'], ['smtp', 'ok', 'person-1']]);
    assert.equal(speicher.zeilen[2].ersteMs, 5);
    assert.equal(speicher.zeilen[2].hin, 1234);
    assert.equal(k.extern?.length, 2, 'für Server-Timing');
    const u = await m.uebersicht(1);
    assert.deepEqual(u.dienste.map((d) => [d.dienst, d.anzahl, d.fehler, d.zeit]), [['imap', 1, 1, 0], ['oidc', 1, 0, 1], ['smtp', 1, 0, 0]]);
  });

  it('Hintergrund (Ereignisse an Pakete): ohne Person und ohne Anfrage, auch wenn eine Anfrage sie anstieß', () => {
    const { m, speicher } = neu(new Date());
    const k = kontextMit('person-1');
    kontext.run(k, () => m.erfasse(aufruf({ funktion: 'volltext.fertig' }), { hintergrund: true }));
    assert.equal(speicher.zeilen[0].benutzerId, null);
    assert.equal(k.extern, undefined);
  });

  it('Budget-Warnung bei 80 % (einmal je Monat im Protokoll), Auswertung je Paket, Person und Funktion', async () => {
    const { m, einst } = neu();
    await einst.schreibe('extern_kosten', { preise: { ki_cloud: { ein: 10, aus: 30 } }, waehrung: 'EUR', budget: 1, hart: false });
    await m.frisch();
    const seit = protokoll.eintraege({ max: 1 })[0]?.nr ?? 0;
    // 50.000 Token ein, 10.000 aus: 0,50 + 0,30 = 0,80 €.
    kontext.run(kontextMit('lena'), () => m.erfasse(aufruf({ tokenEin: 50_000, tokenAus: 10_000 })));
    assert.equal(m.budget().warnung, true);
    assert.equal(m.budget().erreicht, false);
    kontext.run(kontextMit('jonas'), () => m.erfasse(aufruf({ funktion: 'erkennen', tokenEin: 1000, tokenAus: 0 })));
    const w = protokoll.eintraege({ seit }).filter((e) => /Monatsbudget/.test(e.text));
    assert.equal(w.length, 1, JSON.stringify(w));
    assert.match(w[0].text, /80 %/);
    assert.equal(m.pausiertBis('ki_cloud'), null, 'ohne harte Grenze nie pausiert');
    const a = await m.auswertung(new Date(2026, 10, 1));
    assert.equal(a.gesamt.anzahl, 2);
    assert.ok(Math.abs(a.gesamt.kosten - 0.81) < 1e-9, String(a.gesamt.kosten));
    assert.deepEqual(a.jePerson.map((x) => x.schluessel), ['lena', 'jonas']);
    assert.deepEqual(a.jeFunktion.map((x) => x.schluessel), ['antworten', 'erkennen']);
    assert.equal(a.teuerste[0].tokenEin, 50_000);
    assert.equal(a.budget.warnung, true);
  });

  it('harte Grenze: kostenpflichtige KI-Funktionen pausiert bis zum Monatsanfang mit verständlicher Meldung; kostenlose laufen weiter; neuer Monat oder höheres Budget hebt auf', async () => {
    let jetzt = new Date(2026, 10, 30, 23, 0);
    const { m, einst } = neu();
    m.jetzt = () => jetzt;
    await einst.schreibe('extern_kosten', { preise: { ki_cloud: { ein: 10, aus: 0 } }, waehrung: 'EUR', budget: 0.5, hart: true });
    await m.frisch();
    await m.pruefePause('ki_cloud');
    m.erfasse(aufruf({ tokenEin: 50_000 }));
    assert.equal(m.pausiertBis('ki_cloud'), new Date(2026, 11, 1).toISOString());
    await assert.rejects(m.pruefePause('ki_cloud'), (e) => e instanceof Fachfehler && e.status === 429 && /^KI-Funktionen pausiert bis 1\. Dezember 2026/.test(e.message));
    assert.equal(m.pausiertBis('ki_lokal'), null, 'ohne Preis: lokaler Dienst läuft weiter');
    await m.pruefePause('ki_lokal');
    // Höheres Budget: sofort wieder frei.
    await m.setzeKosten({ preise: { ki_cloud: { ein: 10, aus: 0 } }, budget: 5, hart: true }, 'katrin@example.org');
    assert.equal(m.pausiertBis('ki_cloud'), null);
    await m.setzeKosten({ preise: { ki_cloud: { ein: 10, aus: 0 } }, budget: 0.5, hart: true }, 'katrin@example.org');
    assert.ok(m.pausiertBis('ki_cloud'));
    // Neuer Monat.
    jetzt = new Date(2026, 11, 1, 0, 5);
    await m.frisch();
    assert.equal(m.pausiertBis('ki_cloud'), null);
  });

  it('harte Grenze im Paket-Läufer: eine Schnittstelle wirft mit der Meldung, bevor etwas hinausgeht', async () => {
    const d = new Dienst(speicherRepo(), speicherDateien(), { einstellungen: speicherEinstellungen() });
    const konten = new Konten(speicherKontoRepo(), () => null, () => 'http://localhost', d.systemtypen.benutzerspiegel());
    const l = new Paketlaeufer({ dienst: d, konten, schluessel: new ApiSchluesselDienst(speicherApiSchluesselRepo()), api: async () => ({ status: 404, kopf: {}, body: Buffer.from('{}') }), einstellungen: async () => ({}), speicher: { lies: async () => ({}), schreibe: async () => {} } });
    const einst = speicherEinstellungen();
    extern.setze({ speicher: speicherExternSpeicher(), einstellungen: einst });
    try {
      await einst.schreibe('extern_kosten', { preise: { ki_cloud: { ein: 10, aus: 0 } }, budget: 0.01, hart: true });
      await extern.frisch();
      extern.erfasse(aufruf({ tokenEin: 10_000 }));
      // Der Läufer läuft hier nicht – die Pause greift vorher mit eigener Meldung.
      (l as unknown as { kind: object; bereit: boolean }).kind = {}; (l as unknown as { bereit: boolean }).bereit = true;
      await assert.rejects(l.schnittstelle('ki_cloud', 'dms:antworten', { frage: 'x' }, { bezeichnung: 'Test' }), /KI-Funktionen pausiert bis/);
      // Paket-Aktionen im Menü „Mappe“ (#1039) ebenso: Ergebnis mit der Meldung, kein Aufruf.
      const a = await l.mappenaktion('ki_cloud', { aktion: 'dms:mappenaktion', mappenaktion: 'zusammenfassen' }, { ms: 1000, zugang: {} as never, bezeichnung: 'Test' });
      assert.equal(a.ok, false);
      assert.match(a.fehler ?? '', /KI-Funktionen pausiert bis/);
    } finally { extern.setze({ speicher: speicherExternSpeicher(), einstellungen: null }); (l as unknown as { kind: null }).kind = null; }
  });

  it('Aufbewahrung: Rohdaten nach ROH_TAGE Tagen in Monatssummen, Monatssummen nach MONATE Monaten gelöscht; Summen bleiben gleich', async () => {
    let jetzt = new Date(2026, 10, 11);
    const { m, speicher } = neu();
    m.jetzt = () => jetzt;
    const alt = new Date(2026, 8, 20);
    await speicher.merke({ ...aufruf({ tokenEin: 10 }), zeit: alt.toISOString(), benutzerId: 'lena', kosten: 1 });
    await speicher.merke({ ...aufruf({ tokenEin: 20, ergebnis: 'fehler' }), zeit: alt.toISOString(), benutzerId: 'lena', kosten: 2 });
    await speicher.merke({ ...aufruf({ tokenEin: 5 }), zeit: new Date(2026, 10, 10).toISOString(), benutzerId: 'jonas', kosten: 0.5 });
    const vorher = await m.auswertung(new Date(2026, 8, 1));
    await m.aufraeumen();
    assert.equal(speicher.zeilen.length, 1, 'nur die junge Zeile bleibt einzeln');
    assert.equal(speicher.monatssummen.length, 1);
    const nachher = await m.auswertung(new Date(2026, 8, 1));
    assert.deepEqual([nachher.gesamt.anzahl, nachher.gesamt.fehler, nachher.gesamt.tokenEin, nachher.gesamt.kosten], [vorher.gesamt.anzahl, vorher.gesamt.fehler, vorher.gesamt.tokenEin, vorher.gesamt.kosten]);
    assert.equal(nachher.teuerste.length, 0, 'einzelne Abfragen nur aus den Rohdaten');
    assert.ok(nachher.monate.includes('2026-09'));
    jetzt = new Date(2026 + Math.ceil(MONATE / 12) + 1, 0, 1);
    await m.aufraeumen();
    assert.equal(speicher.monatssummen.length, 0);
    assert.equal(ROH_TAGE, 35);
  });
});

/* ---------- Keine Inhalte (#565, Akzeptanzkriterium): echter Paket-Läufer, Versand, Postfach, Anmeldung ---------- */

const PROMPT = 'MARKANTE-FRAGE-7f3a: Wann kündigt Petra den Vertrag?';
const ANTWORT = 'MARKANTE-ANTWORT-9c1d: am 31.12.2026';
const BETREFF = 'MARKANTER-BETREFF-4b2e';
const ADRESSE = 'jonas.markant@example.org';
/** Inhalte: dürfen nirgends stehen. */
const GEHEIMNISSE = [PROMPT, 'MARKANTE-FRAGE', ANTWORT, 'MARKANTE-ANTWORT', '31.12.2026', BETREFF, 'MARKANTER-BETREFF', ADRESSE, 'jonas.markant', 'geheim-query', '/v1/chat', 'Bearer', 'MARKANTER-TEXT'];
/** Adressen der Dienste: stehen auch nicht in den Messwerten (das Protokoll des Pakets nennt den Host, #807). */
const ADRESSEN = ['login.example.org', 'imap.example.org', 'smtp.example.org', '127.0.0.1'];

const u = (n: number): number[] => { const b: number[] = []; do { let x = n & 0x7f; n >>>= 7; if (n) x |= 0x80; b.push(x); } while (n); return b; };
const s = (n: number): number[] => { const b: number[] = []; for (;;) { const x = n & 0x7f; n >>= 7; if ((n === 0 && !(x & 0x40)) || (n === -1 && x & 0x40)) { b.push(x); return b; } b.push(x | 0x80); } };
const vec = (l: number[][]) => [...u(l.length), ...l.flat()];
const str = (t: string) => { const b = [...Buffer.from(t)]; return [...u(b.length), ...b]; };
const sek = (id: number, b: number[]) => [id, ...u(b.length), ...b];
const I32 = 0x7f;
const typ = (p: number, r: number) => [0x60, ...u(p), ...Array(p).fill(I32), ...u(r), ...Array(r).fill(I32)];
/** Modul wie in netzprotokoll.test.ts: dms_aktion öffnet `anfrage` mit netz_strom, reicht die Stücke weiter, meldet `ergebnis`. */
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

/** Alles, was über externe Dienste gespeichert oder gezeigt wird, als ein Text. */
async function allesGespeicherte(m: Externmessung, speicher: ExternSpeicher & { zeilen?: unknown[]; monatssummen?: unknown[] }, sql?: postgres.Sql) {
  await m.schreibe();
  const teile: unknown[] = [
    speicher.zeilen, speicher.monatssummen, await m.uebersicht(24), await m.auswertung(new Date()), await m.kostenEinstellung(),
    await speicher.aufrufe(new Date(0), 1000), await speicher.summen(new Date(0), new Date(Date.now() + 86_400_000)),
  ];
  if (sql) teile.push(await sql`SELECT * FROM extern_aufrufe`, await sql`SELECT * FROM extern_monate`);
  return JSON.stringify(teile);
}

async function durchAlleDienste(person: string) {
  const offen: Array<{ stop(): Promise<void> } | Server> = [];
  try {
    // KI-Dienst: eigener kleiner Dienst mit Antwort im Format von OpenAI (JSON mit usage).
    const dienst = createServer((q, a) => {
      q.resume();
      q.on('end', () => {
        a.writeHead(200, { 'content-type': 'application/json' });
        a.end(JSON.stringify({ choices: [{ message: { content: ANTWORT } }], usage: { prompt_tokens: 1234, completion_tokens: 56 } }));
      });
    });
    await new Promise<void>((ok) => dienst.listen(0, '127.0.0.1', ok));
    offen.push(dienst);
    const adresse = `http://127.0.0.1:${(dienst.address() as { port: number }).port}/v1`;
    const wasm = stromModul(JSON.stringify({ methode: 'POST', url: `${adresse}/chat/completions?geheim-query=1`, kopf: { authorization: 'Bearer abc' } }), JSON.stringify({ text: ANTWORT }));
    const d = new Dienst(speicherRepo(), speicherDateien(), { einstellungen: speicherEinstellungen() });
    const konten = new Konten(speicherKontoRepo(), () => null, () => 'http://localhost', d.systemtypen.benutzerspiegel());
    const l = new Paketlaeufer({ dienst: d, konten, schluessel: new ApiSchluesselDienst(speicherApiSchluesselRepo()), api: async () => ({ status: 404, kopf: {}, body: Buffer.from('{}') }), einstellungen: async () => ({ dienst: adresse }), speicher: { lies: async () => ({}), schreibe: async () => {} }, grenzen: { sekunden: 10, speicherMB: 16 }, abrufMs: 100, nachlaufMs: 3_600_000 });
    offen.push(l);
    const manifest = `schema: 1\nid: ki_cloud\nname: KI Cloud\nversion: 1.0.0\nbeschreibung: Test.\nautor: { name: Test, github: test }\nlizenz: Apache-2.0\ndms: ">=0.124.0"\ninhalt: {}\ncode:\n  sprache: c\n  quelle: code/\n  rechte: { schnittstellen: ["dms:antworten"] }\n  einstellungen:\n    - abschnitt: Dienst\n      felder:\n        - { schluessel: dienst, name: Dienst-Adresse, typ: adresse }\n`;
    const p = liesPaket(new Map([['manifest.yaml', Buffer.from(manifest)], ['code/modul.wasm', wasm]]));
    await d.kern.repo.speicherePaketCode('ki_cloud', p.code!.dateien);
    await d.kern.repo.speicherePaket({ id: 'ki_cloud', name: 'KI Cloud', version: '1.0.0', beschreibung: '', lizenz: 'Apache-2.0', autor: { name: 'T', github: 't' }, herkunft: { art: 'hochgeladen', von: null, am: '' }, installiert: new Date().toISOString(), installiertVon: null, aktualisiert: null, aktualisiertVon: null, typen: {}, sichten: {}, abhaengigkeiten: {}, code: true, einstellungen: p.einstellungen, laeufer: { ...p.code!.info, modul: { sha256: 'x', groesse: wasm.length } } });
    await l.start();
    const ende = Date.now() + 10_000;
    while (!d.fragen.anbieter?.paket()) { if (Date.now() > ende) throw new Error('Paket nicht geladen'); await new Promise((r) => setTimeout(r, 50)); }
    const k = kontextMit(person);
    const r = await kontext.run(k, () => d.fragen.anbieter!.antworte('ki_cloud', { frage: PROMPT, ausschnitte_text: PROMPT }, () => {}));
    assert.ok(r.text.includes('MARKANTE-ANTWORT'), 'das Paket bekam die Antwort');
    const timing = serverTiming(zeitaufteilung({ eingang: 0, start: 1, ende: 2, jetzt: 3, db: { anzahl: 0, ms: 0 } }), undefined, k.extern);
    const strom = kontext.run(k, () => externDerAnfrage());

    // Versand: Betreff, Empfänger und Text gehen nur an den Mailserver.
    const tr: typeof transport = () => ({ verify: async () => true, sendMail: async () => ({ envelopeTime: 12, messageSize: 2048 }) }) as never;
    const sp = speicherBetrieb();
    await sp.schreibe('mail', { aktiv: true, host: 'smtp.example.org', port: 587, verbindung: 'starttls', benutzer: 'lena@example.org', passwort: 'x', absender: '', selbstsigniert: false });
    const b = new Betrieb(sp, 'http://nas', undefined, { transport: tr });
    await b.laden();
    await kontext.run(kontextMit(person), () => b.mailer()!.sende(ADRESSE, BETREFF, 'MARKANTER-TEXT im Körper'));

    // Postfach: Sitzung mit einer Mail mit markantem Betreff.
    const sitzung: ImapSitzung = {
      uidValidity: '1', anzahl: 1, neue: async () => [{ uid: 1, messageId: `<${BETREFF}@example.org>` }], quelle: async () => Buffer.from(`Subject: ${BETREFF}\r\nFrom: ${ADRESSE}\r\n\r\nMARKANTER-TEXT`),
      verschiebe: async () => {}, gelesen: async () => {}, loesche: async () => {}, ordnerListe: async () => ['INBOX'], schliessen: async () => {}, bytes: () => ({ hin: 100, zurueck: 900 }),
    };
    const verbinde = imapGemessen(async () => sitzung);
    const x = await verbinde({ server: 'imap.example.org', port: 993, verschluesselung: 'ssl', benutzer: ADRESSE, passwort: 'p' }, BETREFF);
    await x.neue(1); await x.quelle(1); await x.schliessen();

    // Anmeldung über einen Anbieter: Konfiguration unter einer Adresse mit Query.
    const abruf: Abruf = async () => ({ ok: true, status: 200, json: async () => ({ issuer: 'https://login.example.org', authorization_endpoint: 'https://login.example.org/a?geheim-query=1', token_endpoint: 'https://login.example.org/t', jwks_uri: 'https://login.example.org/k' }), text: async () => '' });
    const oidc = new Oidc({ einstellungen: speicherEinstellungen(), verschluessele: (k2) => k2, entschluessele: (w) => w, abruf });
    await (oidc as unknown as { discovery(a: string, f: boolean): Promise<unknown> }).discovery('https://login.example.org', true);

    return { timing, strom };
  } finally { for (const o of offen) { if ('stop' in o) await o.stop(); else o.close(); } }
}

function pruefeOhneInhalte(alles: string, wo: string, auchAdressen = true) {
  for (const g of [...GEHEIMNISSE, ...(auchAdressen ? ADRESSEN : [])]) assert.ok(!alles.includes(g), `${wo}: „${g}“ darf nicht gespeichert sein`);
}
/** Neue Zeilen im Protokoll – ohne die, die es schon vor #565 gab (Versand nennt Empfänger und Betreff, #807 die Hosts). */
const neueProtokollzeilen = (seit: number) => JSON.stringify(protokoll.eintraege({ seit }).filter((e) => !/^(E-Mail verschickt|Paket .*: Netzaufrufe)/.test(e.text)));

describe('Externe Dienste (#565): keine Inhalte – Arbeitsspeicher', () => {
  it('Frage, Antwort, Betreff, Adresse und URL stehen nirgends; Token, Dauer und Kosten schon', async () => {
    const speicher = speicherExternSpeicher();
    const einst = speicherEinstellungen();
    await einst.schreibe('extern_kosten', { preise: { ki_cloud: { ein: 2, aus: 10 } }, budget: 100 });
    extern.setze({ speicher, einstellungen: einst });
    try {
      await extern.frisch();
      const seit = protokoll.eintraege({ max: 1 })[0]?.nr ?? 0;
      const { timing, strom } = await durchAlleDienste('lena-id');
      const alles = await allesGespeicherte(extern, speicher);
      pruefeOhneInhalte(alles, 'Messwerte');
      pruefeOhneInhalte(timing, 'Server-Timing');
      pruefeOhneInhalte(JSON.stringify(strom), 'Messpanel (Strom)');
      pruefeOhneInhalte(neueProtokollzeilen(seit), 'Protokoll', false);
      const ki = speicher.zeilen.find((z) => z.dienst === 'ki')!;
      assert.deepEqual([ki.paket, ki.funktion, ki.benutzerId, ki.tokenEin, ki.tokenAus, ki.ergebnis], ['ki_cloud', 'antworten', 'lena-id', 1234, 56, 'ok']);
      assert.ok(Math.abs(ki.kosten - (1234 * 2 + 56 * 10) / 1e6) < 1e-12);
      assert.ok(ki.zurueck > 0 && ki.ersteMs !== null);
      assert.deepEqual(speicher.zeilen.map((z) => z.dienst).sort(), ['imap', 'ki', 'oidc', 'smtp']);
      const smtp = speicher.zeilen.find((z) => z.dienst === 'smtp')!;
      assert.deepEqual([smtp.ersteMs, smtp.hin, smtp.benutzerId], [12, 2048, 'lena-id']);
      assert.deepEqual(speicher.zeilen.find((z) => z.dienst === 'imap')!.zurueck, 900);
      assert.match(timing, /extern;dur=[\d.]+;desc="1"/);
      assert.equal(strom?.[0].paket, 'ki_cloud');
    } finally { extern.setze({ speicher: speicherExternSpeicher(), einstellungen: null }); }
  });
});

const url = process.env.TEST_DATABASE_URL;
describe('Externe Dienste (#565): Datenbank', { skip: !url && 'TEST_DATABASE_URL fehlt' }, () => {
  let sql: postgres.Sql;
  before(async () => { sql = (await eigeneDatenbank('extern', { max: 3 })).sql; });
  after(() => extern.setze({ speicher: speicherExternSpeicher(), einstellungen: null }));

  it('keine Inhalte in extern_aufrufe und extern_monate; Summen und Verdichten in PostgreSQL', async () => {
    const haushalt = '00000000-0000-4000-8000-000000000565';
    await sql`INSERT INTO haushalte (id, name) VALUES (${haushalt}, 'Test') ON CONFLICT DO NOTHING`;
    const einst = pgEinstellungen(sql, haushalt);
    const speicher = pgExternSpeicher(sql);
    extern.setze({ speicher, einstellungen: einst });
    await einst.schreibe('extern_kosten', { preise: { ki_cloud: { ein: 2, aus: 10 } }, budget: 100 });
    await extern.frisch();
    // Eine Person, die es in dieser Datenbank nicht gibt (z. B. gerade gelöscht): Messwerte ohne Person.
    const { timing } = await durchAlleDienste('00000000-0000-4000-8000-00000000abcd');
    pruefeOhneInhalte(await allesGespeicherte(extern, speicher, sql), 'Datenbank');
    pruefeOhneInhalte(timing, 'Server-Timing');
    const zeilen = await sql`SELECT dienst, paket, funktion, token_ein, token_aus, benutzer_id FROM extern_aufrufe ORDER BY dienst`;
    assert.deepEqual(zeilen.map((z) => z.dienst), ['imap', 'ki', 'oidc', 'smtp']);
    assert.deepEqual([zeilen[1].paket, zeilen[1].funktion, zeilen[1].token_ein, zeilen[1].token_aus, zeilen[1].benutzer_id], ['ki_cloud', 'antworten', 1234, 56, null], 'Person unbekannt (keine Konten in dieser Datenbank): ohne Person gespeichert');

    // Verdichten: alte Rohdaten wandern in die Monatssumme, die Summe des Monats bleibt.
    await sql`UPDATE extern_aufrufe SET zeit = now() - interval '40 days'`;
    const alt = new Date(Date.now() - 40 * 86_400_000);
    const von = new Date(alt.getFullYear(), alt.getMonth(), 1), bis = new Date(alt.getFullYear(), alt.getMonth() + 1, 1);
    const vorher = (await speicher.summen(von, bis)).reduce((n, x) => n + x.anzahl, 0);
    await speicher.verdichte(new Date(Date.now() - ROH_TAGE * 86_400_000), new Date(2000, 0, 1));
    assert.equal((await sql`SELECT count(*)::int AS n FROM extern_aufrufe`)[0].n, 0);
    assert.ok((await sql`SELECT count(*)::int AS n FROM extern_monate`)[0].n >= 1);
    assert.equal((await speicher.summen(von, bis)).reduce((n, x) => n + x.anzahl, 0), vorher);
    assert.ok((await speicher.monate()).length >= 1);
    pruefeOhneInhalte(await allesGespeicherte(extern, speicher, sql), 'Datenbank nach dem Verdichten');
  });
});
