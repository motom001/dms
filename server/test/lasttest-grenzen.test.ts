/**
 * Lasttest (#563): Ziel und CI-Grenze getrennt. Das Ziel (klein p95 < 300 ms, mittel < 1000 ms) steht im Bericht,
 * der Exit-Code richtet sich nach der CI-Grenze (erster GitHub-Lauf + 20 %, danach nur strenger).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

interface Durchgang { p95: number | null; fehler: number; ohneAntwort: number; fehlerquote: number; abgewiesen: number; exporte: { status: number }[] }
interface Stufe { ziel: { p95Ms: number; fehlerquote: number }; ciGrenze: { p95Ms: number } }
interface Lasttest {
  STUFEN: Record<'klein' | 'mittel', Stufe & { gleichzeitig: number; mappen: number; export: boolean }> & Record<'gross' | 'extrem', Record<string, unknown> & { mappen: number }>;
  PFLICHT: { speicherMb: number };
  PROFIL: Array<[string, number]>;
  PROFIL_SPEICHERN: Array<[string, number]>;
  HISTORIE_LESEN: Array<[string, number]>;
  SCHREIBEN: Array<[string, number]>;
  mappenFuer(stufe: string, wert?: string): number;
  pruefeFesteStufe(name: string, e: Durchgang): { verfehlt: string[]; zielVerfehlt: string[] };
  zielText(name: string): string;
}
const pfad = new URL('./lasttest.mjs', import.meta.url).href;
const lt = (await import(pfad)) as Lasttest;
const lauf = (p95: number, x: Partial<Durchgang> = {}): Durchgang => ({ p95, fehler: 0, ohneAntwort: 0, fehlerquote: 0, abgewiesen: 0, exporte: [], ...x });

describe('Lasttest: Ziel und CI-Grenze (#563)', () => {
  it('Ziel bleibt, CI-Grenze aus dem ersten GitHub-Lauf + 20 %', () => {
    assert.equal(lt.STUFEN.klein.ziel.p95Ms, 300);
    assert.equal(lt.STUFEN.mittel.ziel.p95Ms, 1000);
    assert.equal(lt.STUFEN.klein.ciGrenze.p95Ms, 300);
    assert.equal(lt.STUFEN.mittel.ciGrenze.p95Ms, 1000);
    // Nur strenger: nie lockerer als der letzte GitHub-Lauf + 20 % (586 ms → 703 ms), nie strenger als das Ziel – also das Ziel selbst.
    for (const s of [lt.STUFEN.klein, lt.STUFEN.mittel]) assert.ok(s.ciGrenze.p95Ms >= s.ziel.p95Ms);
    assert.equal(lt.STUFEN.mittel.ciGrenze.p95Ms, Math.max(lt.STUFEN.mittel.ziel.p95Ms, Math.round(586 * 1.2)));
    assert.equal(lt.PFLICHT.speicherMb, 1536, 'Arbeitsspeicher: entscheidet der Maintainer noch');
  });

  it('knapp unter Ziel und CI-Grenze: eingehalten', () => {
    const r = lt.pruefeFesteStufe('mittel', lauf(999));
    assert.deepEqual(r.verfehlt, []);
    assert.deepEqual(r.zielVerfehlt, []);
  });

  it('p95 über der CI-Grenze: verfehlt', () => {
    const r = lt.pruefeFesteStufe('mittel', lauf(1000));
    assert.equal(r.verfehlt.length, 1);
    assert.match(r.verfehlt[0], /CI-Grenze 1000 ms \(Ziel < 1000 ms\)/);
    assert.deepEqual(lt.pruefeFesteStufe('klein', lauf(301)).verfehlt.length, 1);
  });

  it('Ziel eingehalten; Fehler und 503 zählen weiter als Grenze', () => {
    const ok = lt.pruefeFesteStufe('klein', lauf(95));
    assert.deepEqual([ok.verfehlt, ok.zielVerfehlt], [[], []]);
    assert.equal(lt.pruefeFesteStufe('klein', lauf(95, { fehler: 1 })).verfehlt.length, 1);
    assert.equal(lt.pruefeFesteStufe('mittel', lauf(500, { abgewiesen: 3 })).verfehlt.length, 1);
  });

  it('Arbeitsspeicher je Prozess (#970): auch klein und mittel prüfen die Grenze', () => {
    const mit = (mb: number) => ({ ...lauf(500), speicherMbMax: mb, engpass: null } as unknown as Durchgang);
    assert.deepEqual(lt.pruefeFesteStufe('mittel', mit(1500)).verfehlt, []);
    const r = lt.pruefeFesteStufe('mittel', mit(1742));
    assert.equal(r.verfehlt.length, 1);
    assert.match(r.verfehlt[0], /1742 MB > 1536 MB \(1 Prozess\)/);
  });

  it('Bericht nennt Ziel und CI-Grenze', () => {
    assert.equal(lt.zielText('mittel'), 'Ziel p95 < 1000 ms, CI-Grenze 1000 ms, Fehler < 0,10 %');
    assert.equal(lt.zielText('klein'), 'Ziel p95 < 300 ms, CI-Grenze 300 ms, keine Fehler');
  });
});

describe('Lasttest: mit Speichern und extrem (#739) – alte Stufen bleiben vergleichbar', () => {
  it('bisherige Stufen und Mischung unverändert (gleiche Last, gleiche Bestände)', () => {
    assert.deepEqual([lt.STUFEN.klein.gleichzeitig, lt.STUFEN.klein.mappen, lt.STUFEN.klein.export], [25, 5_000, false]);
    assert.deepEqual([lt.STUFEN.mittel.gleichzeitig, lt.STUFEN.mittel.mappen, lt.STUFEN.mittel.export], [100, 50_000, true]);
    const { mappenWahl: _w, mappen: mExtrem, bildet: _b, ...ablaufExtrem } = lt.STUFEN.extrem;
    const { mappen: mGross, bildet: _g, ...ablaufGross } = lt.STUFEN.gross;
    assert.equal(mGross, 200_000);
    assert.deepEqual(ablaufGross, { vorstufen: [5, 10], start: 25, schritt: 25, schrittSekunden: 120, hoechstens: 2000, abbruch: { p95Ms: 3000, fehlerquote: 0.01 }, ueberlast: 1000, verschlechterung: 0.2 });
    assert.deepEqual(ablaufExtrem, ablaufGross, 'extrem läuft wie groß');
    assert.equal(mExtrem, 500_000);
    assert.deepEqual(lt.PROFIL, [['Startseite', 15], ['Liste', 25], ['Mappe öffnen', 25], ['Suche', 15], ['Vorschaubild', 10], ['Herunterladen', 10]]);
  });

  it('Mischung mit Speichern: 10 % schreibend, 5 % Historie (#800), Lesen im selben Verhältnis wie bisher', () => {
    const summe = (p: Array<[string, number]>) => p.reduce((a, [, g]) => a + g, 0);
    assert.equal(Math.round(summe(lt.PROFIL_SPEICHERN) * 1000) / 1000, 100);
    assert.equal(summe(lt.SCHREIBEN), 10);
    assert.deepEqual(lt.SCHREIBEN.map(([a]) => a), ['Mappe ändern', 'Stern', 'Notiz', 'Aufgabe']);
    assert.deepEqual(lt.HISTORIE_LESEN, [['Historie', 5]]);
    for (const [a, g] of lt.PROFIL) assert.equal(lt.PROFIL_SPEICHERN.find(([b]) => b === a)![1], g * 0.85);
  });

  it('extrem: 500.000 als Vorgabe, 1 Mio. wählbar; sonst feste Bestände', () => {
    assert.equal(lt.mappenFuer('extrem', undefined), 500_000);
    assert.equal(lt.mappenFuer('extrem', '1000000'), 1_000_000);
    assert.equal(lt.mappenFuer('extrem', '1.000.000'), 1_000_000);
    assert.equal(lt.mappenFuer('extrem', '20000'), 20_000, 'kleiner nur zum Ausprobieren');
    assert.throws(() => lt.mappenFuer('extrem', 'viele'), /keine Anzahl/);
    assert.equal(lt.mappenFuer('gross', '1000000'), 200_000, '--mappen ändert die bisherigen Stufen nicht');
    assert.equal(lt.mappenFuer('klein', '1000000'), 5_000);
  });
});

describe('Lasttest (#920): eigene Konten je Person, Speicher je Prozess', () => {
  type Sp = { prozesse: number; summeMb: number | null; grenzeSummeMb: number; jeProzessMb: number | null; grenzeJeProzessMb: number };
  const x = lt as unknown as Lasttest & {
    PERSONEN_MAX: number; personKonto(nr: number): { email: string; name: string; passwort: string; art: string };
    personenVon(v: unknown): Array<{ art: string; cookie: string }>;
    personenText(n: number): string; personenZeile(n: number): string | null;
    speicherJeProzess(e: unknown): Sp; speicherVerfehlt(e: unknown): string | null; speicherHoechstens(l: unknown[]): Sp; speicherText(s: Sp): string;
    protokollGesamt(a: unknown, z: unknown, l: unknown[]): { eintraege: Array<{ durchgang: string; erste: string }> } | null;
  };

  it('Konten mit erfundenen Namen und reservierter Domain, zwei von drei mit Rolle; reihum', () => {
    assert.ok(x.PERSONEN_MAX >= 25 && x.PERSONEN_MAX <= 50);
    const alle = Array.from({ length: x.PERSONEN_MAX }, (_, i) => x.personKonto(i + 1));
    assert.equal(new Set(alle.map((k) => k.email)).size, alle.length);
    for (const k of alle) {
      assert.match(k.email, /^lasttest-person-\d{2}@example\.org$/);
      assert.match(k.name, /^Person \d{2} \(Lasttest\)$/);
      assert.ok(k.passwort.length >= 12);
    }
    assert.equal(alle.filter((k) => k.art === 'ohneRolle').length, x.PERSONEN_MAX / 3);
    assert.ok(alle.every((k) => k.art === 'mitRolle' || k.art === 'ohneRolle'));
    // Ohne eigene Konten (fertige Sitzungen): die drei von früher.
    assert.deepEqual(x.personenVon({ sitzungen: { admin: 'a', mitRolle: 'b', ohneRolle: 'c' } }).map((p) => [p.art, p.cookie]), [['admin', 'a'], ['mitRolle', 'b'], ['ohneRolle', 'c']]);
    const eigene = [{ nr: 1, art: 'mitRolle', cookie: 'x' }];
    assert.equal(x.personenVon({ sitzungen: {}, personen: eigene }), eigene);
  });

  it('Hinweis im Bericht und Zeile im Ergebnisblock: ab wann mit eigenen Konten gemessen wird', () => {
    assert.match(x.personenText(30), /je Person ein eigenes Konto mit eigener Sitzung – 30 Konten.*nicht direkt vergleichbar/);
    assert.match(x.personenText(0), /drei geteilte Konten/);
    assert.equal(x.personenZeile(30), 'Personen: je Person ein eigenes Konto (30 Konten, reihum; seit #920)');
    assert.equal(x.personenZeile(0), null);
  });

  it('Speicherpflicht je Prozess: zwei Prozesse mit zusammen über 1.536 MB sind kein Verstoß', () => {
    const zwei = (a: number, b: number, summe: number) => ({ name: 'groß 350', speicherMbMax: summe, engpass: { speicherJeProzess: [{ nr: 0, rolle: 'haupt', mb: 40 }, { nr: 1, rolle: 'leiter', mb: a }, { nr: 2, rolle: 'anfragen', mb: b }] } });
    const ok = zwei(900, 1100, 2040);
    assert.deepEqual(x.speicherJeProzess(ok), { prozesse: 2, summeMb: 2040, grenzeSummeMb: 3072, jeProzessMb: 1100, grenzeJeProzessMb: 1536 });
    assert.equal(x.speicherVerfehlt(ok), null, 'früher: 2040 MB > 1536 MB „verfehlt“');
    assert.match(x.speicherVerfehlt(zwei(900, 1600, 2540))!, /^groß 350: Arbeitsspeicher eines Prozesses 1600 MB > 1536 MB \(je Prozess; zusammen 2540 MB bei 2 Prozessen\)$/);
    // Ein Prozess bzw. ältere Fassung ohne Angabe je Prozess: die Summe gegen die Grenze.
    assert.equal(x.speicherVerfehlt({ name: 'groß 25', speicherMbMax: 1500, engpass: null }), null);
    assert.match(x.speicherVerfehlt({ name: 'groß 25', speicherMbMax: 1600, engpass: null })!, /1600 MB > 1536 MB \(1 Prozess\)/);
    const h = x.speicherHoechstens([ok, zwei(1200, 1000, 2300), { name: 'a', speicherMbMax: null, engpass: null }]);
    assert.deepEqual(h, { prozesse: 2, summeMb: 2300, grenzeSummeMb: 3072, jeProzessMb: 1200, grenzeJeProzessMb: 1536 });
    assert.equal(x.speicherText(h), 'je Prozess höchstens 1.200 MB (Grenze 1.536 MB je Prozess) · zusammen höchstens 2.300 MB bei 2 Prozessen (Grenze 2 × 1.536 MB = 3.072 MB)');
  });

  it('Zusammengefasste Meldungen zählen beim Durchgang ihres ersten Auftretens', () => {
    const t = Date.parse('2026-11-06T10:00:00Z');
    const iso = (s: number) => new Date(t + s * 1000).toISOString();
    const text = 'Lange Anfrage: GET /api/mappen/:id dauerte <Dauer>';
    const m = (anzahl: number, erste: string) => ({ stufe: 'warn', modul: 'datenbank', text, ausnahme: null, anzahl, erste, letzte: iso(150), prozesse: [1] });
    const laeufe = [
      { name: 'groß 25', beginn: t, ende: t + 120_000, protokoll: { eintraege: [] } },
      // Die Zusammenfassung der letzten Minute von „groß 25“ kommt erst während „groß 50“ an.
      { name: 'groß 50', beginn: t + 125_000, ende: t + 245_000, protokoll: { eintraege: [m(40, iso(100))] } },
    ];
    const g = x.protokollGesamt({ t, engpass: { protokoll: { gesamt: 0, weitere: 0, eintraege: [] } } }, { t: t + 250_000, engpass: { protokoll: { gesamt: 40, weitere: 0, eintraege: [m(40, iso(100))] } } }, laeufe)!;
    assert.deepEqual([g.eintraege[0].durchgang, g.eintraege[0].erste], ['groß 25', iso(100)]);
  });
});

describe('Lasttest (#1254): Pakete, Tabellenfeld, Anmeldeschutz mit vollem Journal', () => {
  interface Zusatz {
    PROFIL: Array<[string, number]>;
    PROFIL_PAKETE: Array<[string, number]>;
    ZUSATZ: { paket: string; fehlParallel: number; journalFuellen: number };
    lasttestPaket(): Buffer;
    paketAufrufe(e: Array<{ art: string; ms: number | null; ergebnis: string | null }>): { anzahl: number; median: number | null; p95: number | null; fehler: number; verlauf: number };
    verloreneNachweise(p: { eintraege: Array<{ text: string; anzahl: number }> } | null): number;
    zusatzZeilen(e: Record<string, unknown>): string[];
  }
  const z = lt as unknown as Zusatz;

  it('das Lasttest-Paket kommt aus dem Skript (ohne Netz) und ist ein gültiges Paket mit Code', async () => {
    const { liesPaket, liesZip } = await import('../src/pakete');
    const p = liesPaket(liesZip(z.lasttestPaket()));
    assert.equal(p.manifest.id, z.ZUSATZ.paket);
    assert.deepEqual(p.code?.info.ereignisse, ['mappe.geaendert']);
    assert.ok(new WebAssembly.Module(new Uint8Array(p.code!.dateien.find((d) => d.name === 'modul.wasm')!.inhalt)));
  });

  it('eigenes Profil: Leseanteile wie bisher × 0,85, dazu Tabelle und Mappe ändern; das bisherige Profil bleibt', () => {
    assert.equal(Math.round(z.PROFIL_PAKETE.reduce((s, [, g]) => s + g, 0)), 100);
    assert.deepEqual(z.PROFIL.map(([a]) => a), ['Startseite', 'Liste', 'Mappe öffnen', 'Suche', 'Vorschaubild', 'Herunterladen']);
    assert.deepEqual(z.PROFIL_PAKETE.slice(-2), [['Tabelle', 10], ['Mappe ändern', 5]]);
  });

  it('Paketaufrufe aus dem Verlauf, verlorene Nachweise aus dem Protokoll, neue Zeilen im Ergebnisblock', () => {
    const a = z.paketAufrufe([{ art: 'installiert', ms: null, ergebnis: null }, ...Array.from({ length: 20 }, (_, i) => ({ art: 'ereignis', ms: i + 1, ergebnis: i === 0 ? 'fehler' : 'ok' }))]);
    assert.deepEqual(a, { anzahl: 20, median: 11, p95: 20, fehler: 1, verlauf: 21 });
    assert.equal(z.verloreneNachweise({ eintraege: [{ text: 'Nachweis nicht eingetragen', anzahl: 3 }, { text: 'Nachweis nach mehreren Versuchen nicht eingetragen', anzahl: 2 }, { text: 'Lange Anfrage', anzahl: 9 }] }), 5);
    assert.equal(z.verloreneNachweise(null), 0);
    const zeilen = z.zusatzZeilen({
      pakete: { name: 'klein + Pakete und Tabellen', n: 25, median: 60, p95: 200, p99: 300, fehlerquote: 0, jeArt: { Tabelle: { median: 20, p95: 50 } }, tabelle: { seiten: 100, mitHinweis: 30 }, paket: { anzahl: 400, median: 3, p95: 9, fehler: 0, verlauf: 401 } },
      anmeldung: { name: 'klein + Anmeldeschutz', n: 25, jeArt: { 'Mappe öffnen': { p95: 54 } }, anmeldung: { jeSekunde: 19.5, median: 500, p95: 700, bekannt: 600, unbekannt: 590, verloren: 0, gefuellt: { versuche: 1800, jeSekunde: 21 } } },
    });
    assert.equal(zeilen.length, 3);
    assert.match(zeilen[0], /^klein \+ Pakete und Tabellen +25 gleichzeitig: p50 60 ms, p95 200 ms.*Tabelle p50 20 ms, p95 50 ms; Hinweis „n von m“ bei 30 von 100 Seiten/);
    assert.match(zeilen[1], /Paketaufrufe .*: 400 \(p50 3 ms, p95 9 ms, Fehler 0\) · Einträge im Paket-Verlauf: 401/);
    assert.match(zeilen[2], /Fehlversuche 19,5 je s .* Mappe öffnen p95 54 ms · verlorene Nachweise 0 – Journal vorher mit 1800 Fehlanmeldungen gefüllt/);
    assert.deepEqual(z.zusatzZeilen({}), [], 'ohne Zusatz-Durchgänge (ältere Läufe, --ohne-zusatz) keine Zeile');
  });
});
