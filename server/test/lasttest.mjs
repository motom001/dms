/**
 * Lasttest in drei Stufen (#544, #563): viele gleichzeitige HTTP-Anfragen gegen ein laufendes DMS. Kein Test für
 * jeden PR – von Hand, im Workflow „Lasttest“ (wöchentlich und vor größeren Releases) oder von Betreibern gegen
 * eine eigene Test-Installation (Administratorhandbuch → Lasttest selbst durchführen). Ohne Abhängigkeiten: nur
 * `fetch` von Node.js. Im Image als Befehl `dms-lasttest`.
 *
 *   node server/test/lasttest.mjs klein|mittel|gross|alle [--ziel http://127.0.0.1:3000] [Optionen]
 *
 * | Stufe  | bildet ab                     | Last                                         | Daten          | Ziel (CI-Grenze)                    |
 * | klein  | Haushalt (2–5 Personen)       | 25 gleichzeitig                              | 5.000 Mappen   | p95 < 0,3 s (0,3 s), keine Fehler   |
 * | mittel | Kleinbetrieb (10–15 Personen) | 100 gleichzeitig, großer Export nebenher     | 50.000 Mappen  | p95 < 1 s (2,86 s), Fehler < 0,1 %  |
 * | gross  | Belastungsgrenze              | +25 alle 2 Minuten bis p95 > 3 s, Fehler > 1 % oder Überlastschutz greift; danach 1000 gleichzeitig | 200.000 Mappen | gemessen wird die Grenze; Pflicht: kein Absturz, Erholung |
 * | extrem | sehr großer Bestand (#739)    | wie gross                                    | 500.000 oder 1.000.000 Mappen (--mappen) | wie gross; nur von Hand, nicht in „alle“ und nicht im Zeitplan |
 *
 * Mit Speichern (#739): Nach dem bisherigen Durchgang jeder Stufe folgt ein zweiter mit gleicher Gleichzeitigkeit,
 * in dem rund 10 % der Anfragen schreiben (Mappe ändern, Stern, Notiz, Aufgabe anlegen und erledigen; PROFIL_SPEICHERN)
 * und 5 % die erste Seite der Historie einer Mappe öffnen (#800).
 * Bei gross und extrem läuft er nach der Erholung mit so vielen gleichzeitig, wie die Grenze war. Er ist eine Messung
 * ohne Ziel und ohne CI-Grenze und steht als eigene Zeile im Ergebnis („klein + Speichern“). Die bisherigen
 * Durchgänge, ihre Reihenfolge und ihre Grenzen bleiben unverändert; Arbeitsspeicher und Ereignisschleife der alten
 * Zeilen zählen nur die bisherigen Durchgänge. Danach räumt der Test auf (Werte zurück, Sterne und Notizen weg, Aufgaben
 * erledigt), damit die nächste Stufe dieselben Daten misst. `--ohne-speichern` lässt den Durchgang weg.
 *
 * klein und mittel sind eine Qualitätszusage mit Ziel und CI-Grenze: Das Ziel (p95) steht im Bericht; verfehlt heißt
 * „beschleunigen“ (Folge-Issue), nicht rot. Mit `--grenzen` richtet sich der Exit-Code (1) nach der CI-Grenze, die
 * aus dem ersten Lauf auf den Rechnern von GitHub stammt (+ 20 %) und nur strenger wird. groß ist eine Messung: Die
 * Grenze steht im Bericht; mit `--vorher <json>` warnt der Test, wenn sie mehr als 20 % unter der des letzten
 * Laufs liegt. Pflichten von groß (keine Anfrage ohne Antwort, Arbeitsspeicher begrenzt, Erholung, Anmeldeschutz)
 * zählen wie bisher als Grenzen.
 *
 * Schutz der echten Ablage: Ist das DMS frisch, richtet der Test es selbst ein (Lasttest-Konten, Beispiele,
 * Demo-Mappen). Ist es schon eingerichtet, misst er nur, wenn er sich mit seinen eigenen Konten anmelden kann und
 * höchstens ECHTE_MAPPEN_MAX Mappen keine Demo-Mappen sind – sonst bricht er ab, bevor er etwas anlegt. Fehlen
 * Demo-Mappen für die Stufe, legt er sie dazu (je Lauf höchstens 50.000).
 *
 * Lasttest-Modus (#612): Startet das DMS mit DMS_LASTTEST=klein|mittel|gross|alle, startet es dieses Skript selbst
 * (als Kindprozess) und zeigt Fortschritt und Ergebnis im Browser. Dafür meldet das Skript seine Schritte über den
 * IPC-Kanal (`process.send`), wenn es einen gibt – auf der Konsole ändert sich nichts. `--pruefen` prüft nur, ob das
 * Ziel eine frische oder eine eigene Test-Installation ist (Exit-Code 0) oder nicht (2), und legt nichts an.
 *
 * Optionen: --ziel <URL> (sonst DMS_URL, sonst http://127.0.0.1:$PORT), --dauer <s je Durchgang> (120),
 * --schritt-dauer <s je Schritt von groß> (120), --bis <n> (groß: höchstens so viele gleichzeitig),
 * --code <Einrichtungscode> (sonst aus /data/geheim/EINRICHTUNGSCODE), --geraet <Text>, --speicher <HDD|SSD|NVMe>,
 * --bericht <Datei> (Markdown), --json <Datei>, --vorher <Datei> (JSON eines früheren Laufs), --grenzen,
 * --gleichzeitig <n> [--ohne-export] [--mit-speichern] (ein einzelner Durchgang), --einrichten [--mappen <n>] (nur
 * einrichten), --mappen <n> (extrem: 500000 oder 1000000; kleinere Zahlen nur zum Ausprobieren), --ohne-speichern.
 *
 * Gemischtes Profil wie im Alltag: Startseite, Liste einer Ansicht, Mappe öffnen, Suche, Vorschaubild,
 * Dokument herunterladen. Jede „Person“ des Tests schickt eine Anfrage nach der anderen; „100 gleichzeitig“ heißt:
 * 100 Anfragen sind ständig unterwegs. Bekommt sie 503, wartet sie, wie `Retry-After` sagt (wie ein ordentliches
 * Programm), und macht dann weiter.
 *
 * Eigene Konten (#920): Jede Person meldet sich mit einem eigenen Konto an und hat eine eigene Sitzung – wie echte
 * Nutzer. Bis #920 teilten sich alle Personen drei Konten; gleichzeitige Änderungen warteten dann auf dieselbe Zeile
 * (Merker „eigene Änderung“, Sitzung), was echte Nutzer nicht tun. Der Test legt dafür PERSONEN_MAX Konten mit
 * erfundenen Namen an (zwei von drei mit der Rolle „Steuern und Finanzen“ wie Jonas, eines von drei ohne Rolle wie
 * Petra); bei mehr Personen teilen sie sich die Konten reihum. Am Ende meldet er sie wieder ab. Werkbank-Abfragen
 * (Messwerte, System, Export nebenher, Aufräumen) bleiben bei der Mess-Sitzung des Administrators im Verwaltungsmodus.
 * Grenzen und ihre Begründung: Entwicklerhandbuch → Leistung → Lasttest.
 */
import { randomInt } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { cpus } from 'node:os';
import { fileURLToPath } from 'node:url';

const arg = (n, std) => { const i = process.argv.indexOf(n); return i < 0 ? std : process.argv[i + 1]; };
const hat = (n) => process.argv.includes(n);
const BASIS = (arg('--ziel') ?? process.env.DMS_URL ?? `http://127.0.0.1:${process.env.PORT ?? 3000}`).replace(/\/$/, '');

/** Wie lange eine Anfrage höchstens auf ihre Antwort wartet; danach zählt sie als „ohne Antwort“. */
const ANTWORT_MAX_MS = 60_000;
/** Konten des Lasttests (Persona-Namen, reservierte Domain). Nur in einer Test-Installation. */
const BENUTZER = {
  admin: ['lena@example.org', 'lasttest-passwort-1'],
  mitRolle: ['jonas@example.org', 'lasttest-passwort-2'],
  ohneRolle: ['petra@example.org', 'lasttest-passwort-3'],
};
/**
 * Konten der simulierten Personen (#920): so viele höchstens; bei mehr gleichzeitigen Personen reihum. Erfundene Namen,
 * reservierte Domain, nur in einer Test-Installation des Lasttests.
 */
export const PERSONEN_MAX = 30;
/** Konto Nummer `nr` (1 …): jedes dritte ohne Rolle (wie Petra), die übrigen mit Rolle (wie Jonas). */
export function personKonto(nr) {
  const nn = String(nr).padStart(2, '0');
  return { nr, email: `lasttest-person-${nn}@example.org`, name: `Person ${nn} (Lasttest)`, passwort: `lasttest-person-passwort-${nn}`, art: nr % 3 === 0 ? 'ohneRolle' : 'mitRolle' };
}
/** Konto nur für die Prüfung des Anmeldeschutzes. */
const SPERRKONTO = ['markus@example.org', 'lasttest-passwort-4'];
/** Name des Haushalts, den der Test anlegt. */
const HAUSHALT = 'Lasttest';
/** So viele Mappen dürfen keine Demo-Mappen sein (Beispiele, Rolle); mehr sieht nach einer echten Ablage aus. */
const ECHTE_MAPPEN_MAX = 200;
/** Demo-Mappen je Lauf (Werkbank → Demo-Daten erlaubt höchstens 50.000). */
const DEMO_JE_LAUF = 50_000;

/**
 * Stufen (#563). Startwerte des Maintainers; nachgeschärft wird nur strenger. Die Ziele von klein und mittel
 * sind deutlich strenger als die Grenzen von #544 (p95 ≤ 5 s bzw. 6 s, Fehler ≤ 1 %).
 *
 * `ziel`: was das Projekt zusagen möchte (p95 und Fehlerquote). Ein verfehltes p95-Ziel steht im Bericht und führt
 * zu einem Folge-Issue „Beschleunigen“, macht den Lauf aber nicht rot.
 * `ciGrenze`: p95, ab dem `--grenzen` mit Exit-Code 1 endet (Entscheidung Thomas, #563): erster Lauf auf den
 * Rechnern von GitHub + 20 %, danach nur strenger, höchstens bis zum Ziel. Erster Lauf (Run 41448183378,
 * DMS 0.139.0): klein p95 95 ms → bleibt beim Ziel 300 ms; mittel p95 2384 ms → 2860 ms. Nach dem Beschleunigen
 * (#615; Run 41549943703, DMS 0.146.0): mittel p95 586 ms, + 20 % = 703 ms liegt unter dem Ziel → CI-Grenze = Ziel 1000 ms
 * (Frage 53). Damit sind Ziel und CI-Grenze bei klein und mittel gleich.
 * Fehlerquote, 503 und Export gelten unverändert als Grenze.
 */
export const STUFEN = {
  klein: { bildet: 'Haushalt (2–5 Personen)', gleichzeitig: 25, mappen: 5_000, export: false, ziel: { p95Ms: 300, fehlerquote: 0 }, ciGrenze: { p95Ms: 300 } },
  mittel: { bildet: 'Kleinbetrieb (10–15 Personen)', gleichzeitig: 100, mappen: 50_000, export: true, ziel: { p95Ms: 1000, fehlerquote: 0.001 }, ciGrenze: { p95Ms: 1000 } },
  gross: { bildet: 'Belastungsgrenze', mappen: 200_000, vorstufen: [5, 10], start: 25, schritt: 25, schrittSekunden: 120, hoechstens: 2000, abbruch: { p95Ms: 3000, fehlerquote: 0.01 }, ueberlast: 1000, verschlechterung: 0.2 },
  // #739: Ablauf wie gross (Grenze suchen), nur mit sehr viel mehr Mappen. Nur von Hand – nicht in „alle“.
  extrem: { bildet: 'sehr großer Bestand', mappen: 500_000, mappenWahl: [500_000, 1_000_000], vorstufen: [5, 10], start: 25, schritt: 25, schrittSekunden: 120, hoechstens: 2000, abbruch: { p95Ms: 3000, fehlerquote: 0.01 }, ueberlast: 1000, verschlechterung: 0.2 },
};
/** Stufen, die die Grenze suchen (Ablauf von gross). */
const GRENZSTUFEN = new Set(['gross', 'extrem']);
/** Pflichten der großen Stufe (wie „Überlast“ in #544): kein Absturz, begrenzter Speicher, Erholung, Anmeldeschutz. */
export const PFLICHT = { ohneAntwort: 0, speicherMb: 1536, erholungMs: 30_000, erholungP95Ms: 1000 };
/** Anteil der Demo-Mappen mit einem Brief als PDF (Vorschaubild, Herunterladen, Export). */
const DOKUMENTE_ANTEIL = Number(arg('--dokumente', 2));

/* ---------- HTTP ---------- */

async function anfrage(m, pfad, o = {}) {
  const r = await fetch(BASIS + pfad, {
    method: m,
    headers: { 'x-dms': '1', ...(o.cookie ? { cookie: o.cookie } : {}), ...(o.body !== undefined ? { 'content-type': 'application/json' } : {}), ...(o.koepfe ?? {}) },
    body: o.body === undefined ? undefined : JSON.stringify(o.body),
    signal: AbortSignal.timeout(o.zeit ?? ANTWORT_MAX_MS),
  });
  return r;
}

/**
 * Der Server hat geantwortet, aber nicht mit 2xx (#873). Anders als eine Zeitüberschreitung oder eine abgelehnte
 * Verbindung heißt das nie „Server nicht erreichbar“.
 */
export class Antwortfehler extends Error {
  constructor(m, pfad, status, text) {
    super(`${m} ${pfad}: ${status} ${text.slice(0, 300)}`);
    this.status = status;
    try { this.details = JSON.parse(text)?.details ?? null; } catch { this.details = null; }
  }
}

/**
 * Anfrage mit JSON-Antwort. Werkbank-Abfragen (#873) gehören zur Mess-Sitzung des Administrators und brauchen den
 * Verwaltungsmodus (#819): Sie senden `x-dms-aktiv: 1` (wie die Oberfläche bei Aktivität), damit der Modus über den
 * ganzen Lauf bestehen bleibt. Ist er trotzdem abgelaufen (403 mit `details.verwaltungsmodus`), beginnt der Test ihn
 * einmal neu und wiederholt die Abfrage. Am Server ändert sich dafür nichts.
 */
async function json(m, pfad, o = {}) {
  const werkbank = pfad.startsWith('/api/werkbank/');
  const o2 = werkbank ? { ...o, koepfe: { 'x-dms-aktiv': '1', ...(o.koepfe ?? {}) } } : o;
  try { return await jsonEinmal(m, pfad, o2); } catch (e) {
    if (!werkbank || !o.cookie || !(e instanceof Antwortfehler) || e.status !== 403 || !e.details?.verwaltungsmodus) throw e;
    if (!(await verwaltungNeu(o.cookie))) throw e;
    return jsonEinmal(m, pfad, o2);
  }
}

async function jsonEinmal(m, pfad, o) {
  const r = await anfrage(m, pfad, o);
  const t = await r.text();
  if (!r.ok) throw new Antwortfehler(m, pfad, r.status, t);
  return { daten: t ? JSON.parse(t) : null, cookie: r.headers.get('set-cookie')?.split(';')[0] };
}

/** Zu welchem Konto des Tests eine Sitzung gehört (für die erneute Anmeldung nach Mitternacht). */
const kontoDerSitzung = new Map();

/**
 * Verwaltungsmodus der Mess-Sitzung neu beginnen (#873). Am selben Tag geht das ohne Abfrage (Fall „heute
 * bestätigt“ in #819). Nach Mitternacht verlangt der Server die erneute Anmeldung – dann mit dem Passwort des
 * Lasttest-Kontos, wie es jede Person in der Oberfläche täte. Liefert, ob der Modus wieder läuft.
 */
async function verwaltungNeu(cookie) {
  const r = await anfrage('POST', '/api/konto/verwaltung', { cookie, body: {}, zeit: 30_000 }).catch(() => null);
  if (r?.ok) { await r.arrayBuffer(); console.log('  Verwaltungsmodus der Mess-Sitzung neu begonnen.'); return true; }
  const t = r ? await r.text() : '';
  let d = {}; try { d = JSON.parse(t)?.details ?? {}; } catch { /* ohne JSON */ }
  const konto = kontoDerSitzung.get(cookie);
  if (r?.status !== 401 || !d.bestaetigen || !konto) return false;
  const r2 = await anfrage('POST', '/api/konto/verwaltung', { cookie, body: { passwort: konto[1] }, zeit: 30_000 }).catch(() => null);
  if (!r2?.ok) return false;
  await r2.arrayBuffer();
  console.log('  Verwaltungsmodus der Mess-Sitzung nach erneuter Anmeldung neu begonnen.');
  return true;
}

export async function anmelden([email, passwort], { verwaltung = true } = {}) {
  const { cookie, daten } = await json('POST', '/api/konto/anmelden', { body: { email, passwort } });
  if (!cookie) throw new Error(`Anmeldung ${email}: kein Sitzungs-Cookie`);
  kontoDerSitzung.set(cookie, [email, passwort]);
  benutzerDerSitzung.set(cookie, daten?.benutzer?.id ?? null);
  // Verwaltungsmodus (#819): Wer verwalten darf, wechselt gleich hinein – die Anmeldung ist frisch, also ohne Abfrage.
  // Für alle anderen lehnt der Server ab; das ist hier kein Fehler. Die Personen (#920) fragen gar nicht erst.
  if (verwaltung) await anfrage('POST', '/api/konto/verwaltung', { cookie, body: {} }).catch(() => undefined);
  return cookie;
}
/** Id des angemeldeten Benutzers je Sitzung (#920: Aufgaben an die eigene Person). */
const benutzerDerSitzung = new Map();

/**
 * Konten der simulierten Personen (#920) anlegen, soweit sie fehlen (frische Installation oder eine Test-Installation
 * von vor #920), als Administrator der Mess-Sitzung. Die Rolle nehmen sie von Jonas. Ein Konto ohne Passwort (etwa nach
 * einem abgebrochenen Lauf) bekommt einen neuen Link.
 */
async function personenAnlegen(admin) {
  const c = { cookie: admin };
  const { daten: liste } = await json('GET', '/api/benutzer', c);
  const rollen = liste.find((b) => b.email === BENUTZER.mitRolle[0])?.rollen ?? [];
  let neu = 0;
  for (let nr = 1; nr <= PERSONEN_MAX; nr++) {
    const k = personKonto(nr);
    const da = liste.find((b) => b.email === k.email);
    if (da?.hatPasswort) continue;
    const { daten: e } = da
      ? await json('POST', `/api/benutzer/${da.id}/link`, { ...c, body: {} })
      : await json('POST', '/api/benutzer', { ...c, body: { email: k.email, name: k.name, rolle: 'mitglied', rollen: k.art === 'mitRolle' ? rollen : [] } });
    await json('POST', '/api/konto/passwort-setzen', { body: { schluessel: e.link.split('/passwort/')[1], passwort: k.passwort } });
    neu++;
  }
  if (neu) console.log(`${neu} Konten für simulierte Personen angelegt.`);
}

/** Alle Personen anmelden (#920), je fünf gleichzeitig; jede mit eigener Sitzung. */
async function personenAnmelden(admin) {
  await personenAnlegen(admin);
  const personen = [];
  const offen = Array.from({ length: PERSONEN_MAX }, (_, i) => personKonto(i + 1));
  await Promise.all(Array.from({ length: 5 }, async () => {
    for (let k = offen.shift(); k; k = offen.shift()) {
      const cookie = await anmelden([k.email, k.passwort], { verwaltung: false });
      personen.push({ nr: k.nr, art: k.art, cookie, id: benutzerDerSitzung.get(cookie) ?? null });
    }
  }));
  return personen.sort((a, b) => a.nr - b.nr);
}

/** Personen wieder abmelden (#920) – ihre Sitzungen bleiben nicht liegen. */
async function personenAbmelden(v) {
  if (!v?.personen?.length || !v.eigeneKonten) return;
  await nebenher(v.personen.map((p) => () => anfrage('POST', '/api/konto/abmelden', { cookie: p.cookie, body: {}, zeit: 30_000 }).then(ohneInhalt)), 5);
}

/**
 * Personen eines Durchgangs (#920): die eigenen Konten; ohne (Tests mit fertigen Sitzungen) die drei Sitzungen von
 * früher, je eine Person reihum.
 */
export function personenVon(v) {
  if (v.personen?.length) return v.personen;
  return ['admin', 'mitRolle', 'ohneRolle'].map((art, i) => ({ nr: i + 1, art, cookie: v.sitzungen[art], id: null }));
}

const warte = (ms) => new Promise((r) => setTimeout(r, ms));
/** #895: Start des Skripts – Meldungen von davor (Start von Ablago) zeigt die Lasttest-Seite nicht. */
const SKRIPT_START = new Date().toISOString();
/** #895: p95 „der letzten Sekunden“ auf der Lasttest-Seite. */
export const LIVE_FENSTER_MS = 10_000;

/**
 * Schritt an den Lasttest-Modus melden (#612): nur mit IPC-Kanal (Kindprozess des DMS), sonst nichts. Nie mit
 * Zugangsdaten oder Adressen – die Seite im Browser zeigt, was hier ankommt.
 */
const melde = (e) => new Promise((fertig) => {
  if (!process.send || !process.connected) return fertig();
  process.send({ ...e, zeit: Date.now() }, () => fertig());
});

/** Laufende Messung vor den Durchgängen (#1117), höchstens eine. */
let vorlauf = null;

/**
 * Werte für die Lasttest-Seite schon vor den Durchgängen (#1117): beim Einrichten, beim Anlegen der Demo-Mappen, beim
 * Warten auf den Volltext und beim Vorbereiten. Dieselbe Messung wie im Durchgang ({@link serverStand} alle 2 s mit der
 * Sitzung des Administrators) – nur im Lasttest-Modus (mit IPC-Kanal), ohne Durchgang und p95. Endet, sobald ein
 * Durchgang selbst misst ({@link vorlaufStoppen}).
 */
export function vorlaufStarten(cookie, { senden = process.send ? melde : null, takt = 2000 } = {}) {
  void vorlaufStoppen();
  if (!senden || !cookie) return;
  let aktiv = true;
  let wecken = () => {};
  /** Für CPU und Gruppen reichen die letzten beiden Stände (wie liveAus sie nimmt). */
  const staende = [];
  const fertig = (async () => {
    while (aktiv) {
      const s = { t: Date.now(), ...(await serverStand(cookie)) };
      if (!aktiv) break;
      if (!s.fehler) { staende.push(s); if (staende.length > 2) staende.shift(); }
      await senden({ art: 'live', ...liveAus(staende, [], { name: null, n: null, seit: SKRIPT_START }) });
      await new Promise((r) => { wecken = r; setTimeout(r, takt).unref?.(); });
    }
  })().catch(() => {});
  vorlauf = { halt: () => { aktiv = false; wecken(); return fertig; } };
}

/** Messung vor den Durchgängen beenden (#1117); wartet, bis sie nichts mehr schickt. */
export async function vorlaufStoppen() {
  const v = vorlauf;
  vorlauf = null;
  await v?.halt();
}

/* ---------- Einrichten und Schutz der echten Ablage ---------- */

async function code() {
  if (arg('--code')) return arg('--code');
  for (const d of [process.env.DMS_GEHEIM, '/data/geheim'].filter(Boolean)) {
    try { return (await readFile(`${d}/EINRICHTUNGSCODE`, 'utf8')).trim(); } catch { /* weiter */ }
  }
  return undefined;
}

/** Demo-Mappen (Teil von höchstens 50.000) erzeugen und auf das Ende warten. */
async function demo(c, anzahl, nr) {
  const t0 = Date.now();
  await json('POST', '/api/werkbank/demo', { ...c, body: { anzahl, startwert: `lasttest-563-${nr}`, dokumente: DOKUMENTE_ANTEIL > 0 ? { anteil: DOKUMENTE_ANTEIL, von: 1, bis: 1, mischung: { brief: 100, mehrseitig: 0, scan: 0, bild: 0, gross: 0 } } : null } });
  for (;;) {
    const { daten: a } = await json('GET', '/api/werkbank/auftrag', c);
    if (a && typeof a.fertig === 'number') melde({ art: 'demo', fertig: a.fertig, gesamt: a.gesamt ?? anzahl });
    if (!a || a.status === 'fertig') break;
    if (a.status === 'fehler') throw new Error(a.fehler);
    await warte(2000);
  }
  console.log(`${anzahl} Demo-Mappen in ${Math.round((Date.now() - t0) / 1000)} s erzeugt.`);
}

/** Frisches DMS: Konten, Beispiele, Rolle, Mitglieder, Regeln wie in einem Haushalt (wie ladezeiten.mjs, #477). */
async function einrichten() {
  melde({ art: 'schritt', schritt: 'einrichten' });
  const [email, passwort] = BENUTZER.admin;
  const c0 = await code();
  const { cookie: admin } = await json('POST', '/api/konto/einrichten', { body: { mandant: HAUSHALT, email, name: 'Lena (Lasttest)', passwort }, koepfe: c0 ? { 'x-einrichtungscode': c0 } : {} });
  if (admin) kontoDerSitzung.set(admin, BENUTZER.admin);
  // #1117: Auslastung auf der Lasttest-Seite, sobald es eine Sitzung gibt.
  vorlaufStarten(admin);
  const c = { cookie: admin };
  // Den Assistenten schließen (#804): erst mit Schlüssel und heruntergeladenem Notfallblatt.
  await json('POST', '/api/werkbank/tresor/erzeugen', c).catch(() => {});
  await anfrage('GET', '/api/werkbank/notfallblatt', c).then((r) => r.arrayBuffer()).catch(() => {});
  await json('POST', '/api/werkbank/einrichtung/schritt', { ...c, body: { schritt: 'fertig' } }).catch(() => {});
  await json('POST', '/api/beispiele', c);
  const { daten: typen } = await json('GET', '/api/typen', c);
  const { daten: rolle } = await json('POST', '/api/mappen', { ...c, body: { typId: typen.find((t) => t.system === 'rolle').id, werte: { name: 'Steuern und Finanzen' } } });
  for (const [name, [e, p], rollen] of [['Jonas (Lasttest)', BENUTZER.mitRolle, [rolle.id]], ['Petra (Lasttest)', BENUTZER.ohneRolle, []], ['Markus (Sperrprobe)', SPERRKONTO, []]]) {
    const { daten: einladung } = await json('POST', '/api/benutzer', { ...c, body: { email: e, name, rolle: 'mitglied', rollen } });
    await json('POST', '/api/konto/passwort-setzen', { body: { schluessel: einladung.link.split('/passwort/')[1], passwort: p } });
  }
  const nichtRolle = { art: 'rolle', rollen: [rolle.id], nicht: true };
  for (const t of typen.filter((x) => !x.system)) {
    const regeln = [
      { id: 'r1', name: 'Steuern und Finanzen darf alles', wenn: [{ art: 'rolle', rollen: [rolle.id] }], dann: { D: 'erteilen', P: 'erteilen' }, stopp: false },
      { id: 'r2', name: 'Mit Aufgabe bearbeiten', wenn: [{ art: 'aufgabe' }], dann: { U: 'erteilen' }, stopp: false },
    ];
    if (t.name === 'Zahlung') regeln.push({ id: 'r3', name: 'Zahlungen nur Steuern', wenn: [nichtRolle], dann: { R: 'entziehen' }, stopp: true });
    if (t.name === 'Rechnung' || t.name === 'Vertrag') regeln.push({ id: 'r4', name: 'Große Beträge nur Steuern', wenn: [nichtRolle, { art: 'feld', bedingung: { art: 'feld', feld: 'betrag', op: 'groesser', wert: { art: 'fest', wert: 500 } } }], dann: { R: 'entziehen' }, stopp: true });
    await json('PUT', `/api/werkbank/berechtigungen/${t.id}`, { ...c, body: { berechtigungen: { grund: { C: true, R: true, U: true, D: false, P: false }, regeln }, bestaetigt: true } });
  }
  console.log('Test-Installation eingerichtet.');
  return admin;
}

const zaehle = async (c) => {
  const { daten } = await json('GET', '/api/werkbank/demo', c);
  return { demo: daten.reduce((a, t) => a + t.demo, 0), gesamt: daten.reduce((a, t) => a + t.gesamt, 0) };
};

/**
 * Schutz der echten Ablage, ohne etwas anzulegen: frisch (noch nicht eingerichtet) → `{ frisch: true }`; eingerichtet
 * vom Lasttest (eigene Konten) mit höchstens ECHTE_MAPPEN_MAX Mappen, die keine Demo-Mappen sind → Sitzung und
 * Bestand; sonst Abbruch. Dieselbe Prüfung vor jeder Messung und im Lasttest-Modus vor dem Start (#612).
 */
export async function pruefen() {
  const { daten: status } = await json('GET', '/api/konto/status');
  if (status.einrichtungNoetig) return { frisch: true };
  let admin;
  try { admin = await anmelden(BENUTZER.admin); } catch {
    throw new Abbruch('Dieses DMS ist schon eingerichtet, aber nicht vom Lasttest. Der Lasttest läuft nur gegen eine eigene, frische Test-Installation – nie gegen deine echte Ablage (Handbuch: Lasttest selbst durchführen).');
  }
  const z = await zaehle({ cookie: admin });
  if (z.gesamt - z.demo > ECHTE_MAPPEN_MAX) {
    throw new Abbruch(`Hier liegen ${z.gesamt - z.demo} Mappen, die keine Demo-Mappen sind – das sieht nach einer echten Ablage aus. Der Lasttest bricht ab und legt nichts an.`);
  }
  return { frisch: false, admin, bestand: z };
}

/**
 * Vor jeder Messung: frisch → einrichten; sonst nur mit den Konten des Tests und fast nur Demo-Mappen – sonst
 * Abbruch, ohne etwas anzulegen. Danach fehlende Demo-Mappen für die Stufe dazulegen.
 */
async function sicherstellen(mappen) {
  melde({ art: 'schritt', schritt: 'pruefen' });
  const p = await pruefen();
  const admin = p.frisch ? await einrichten() : p.admin;
  if (!p.frisch) vorlaufStarten(admin);
  const c = { cookie: admin };
  let z = p.frisch ? await zaehle(c) : p.bestand;
  let neu = false;
  // Wie lange das Anlegen dauert (#739: steht bei extrem im Ergebnis).
  const t0 = Date.now(); const anfang = z.demo; let laeufe = 0;
  for (let nr = 1; z.demo < mappen; nr++) {
    const n = Math.min(DEMO_JE_LAUF, mappen - z.demo);
    console.log(`Lege ${n} Demo-Mappen an (für ${mappen} insgesamt) …`);
    melde({ art: 'schritt', schritt: 'demo', anzahl: n, mappen });
    const vorher = z.demo; neu = true; laeufe++;
    await demo(c, n, `${mappen}-${nr}`);
    z = await zaehle(c);
    if (z.demo <= vorher) throw new Error('Es sind keine Demo-Mappen dazugekommen – Werkbank → Demo-Daten prüfen.');
  }
  const t1 = Date.now();
  if (neu) await ruhe(c);
  // Bestand übernommen (#877): Fehlen Dateien, misst der Test Fehler statt Last – also gleich am Anfang warnen.
  const ohneDatei = p.frisch ? 0 : await dokumenteOhneDatei(c);
  return { ...z, ohneDatei, anlegen: neu ? { mappen: z.demo - anfang, laeufe, sekunden: Math.round((t1 - t0) / 1000), hintergrundSekunden: Math.round((Date.now() - t1) / 1000) } : null };
}

/**
 * Dokumente ohne Datei (#877): Lag die Datenbank in einem eigenen Container (oder Volume) und `/data` nicht, ist der
 * Bestand noch da, die Dateien aber weg – Herunterladen, Vorschau und Export schlagen dann fehl und verfälschen die
 * Messung. Nur eine Warnung (der Test misst trotzdem); im Bericht und auf der Seite des Lasttest-Modus.
 */
async function dokumenteOhneDatei(c) {
  const { daten } = await json('GET', '/api/werkbank/wartung/dateien/fehlend', { ...c, zeit: 300_000 }).catch(() => ({ daten: null }));
  const n = daten?.dokumente ?? 0;
  if (!n) return 0;
  console.log(`WARNUNG: Dokumente ohne Datei: ${n} – ist /data als Volume eingebunden? Ohne Volumes vor jedem Lauf beide Container neu anlegen (docker compose down, dann up -d).`);
  melde({ art: 'warnung', ohneDatei: n });
  return n;
}

/** Größe der Datenbank und der Dokumente (Werkbank → System); null, wenn nicht lesbar. */
async function datenStand(cookie) {
  const { daten: s } = await json('GET', '/api/werkbank/system', { cookie, zeit: 120_000 }).catch(() => ({ daten: null }));
  const d = s?.datenbank;
  return { datenbankBytes: typeof d?.groesseBytes === 'number' ? d.groesseBytes : null, dokumenteBytes: typeof d?.dokumenteBytes === 'number' ? d.dokumenteBytes : null };
}

/**
 * Nach neuen Demo-Mappen arbeitet das DMS im Hintergrund (Texterkennung der Briefe, Vorschaubilder, Statistik).
 * Gemessen wird erst, wenn das vorbei ist – höchstens 15 Minuten warten.
 */
async function ruhe(c) {
  melde({ art: 'schritt', schritt: 'hintergrund' });
  const t0 = Date.now();
  for (;;) {
    const { daten: u } = await json('GET', '/api/werkbank/uebersicht', c).catch(() => ({ daten: null }));
    const offen = u?.texterkennung ? (u.texterkennung.wartet ?? 0) + (u.texterkennung.laeuft ?? 0) : 0;
    const { daten: l } = await json('GET', '/api/werkbank/last', c).catch(() => ({ daten: null }));
    if (!offen && (l?.schleife?.p99 ?? 0) < 100) break;
    if (Date.now() - t0 > 15 * 60_000) { console.log('  Hintergrundarbeit läuft noch – es wird trotzdem gemessen.'); break; }
    await warte(5000);
  }
  console.log(`Hintergrundarbeit abgewartet (${Math.round((Date.now() - t0) / 1000)} s).`);
}

class Abbruch extends Error {}

/* ---------- Vorbereiten: Sitzungen, Ansichten, Mappen, Dokumente ---------- */

const zufall = (a) => a[Math.floor(Math.random() * a.length)];

async function vorbereiten() {
  melde({ art: 'schritt', schritt: 'vorbereiten' });
  const sitzungen = {};
  for (const [k, z] of Object.entries(BENUTZER)) sitzungen[k] = await anmelden(z);
  const admin = { cookie: sitzungen.admin };
  // #920: je simulierter Person ein eigenes Konto mit eigener Sitzung.
  const personen = await personenAnmelden(sitzungen.admin);
  const { daten: typen } = await json('GET', '/api/typen', admin);
  const ansichten = typen.filter((t) => !t.system).map((t) => t.id);
  const mappen = []; const mappenJeTyp = new Map();
  for (const id of ansichten) {
    const { daten } = await json('GET', `/api/mappen?sicht=${id}&von=0&anzahl=200`, admin);
    for (const m of daten.mappen) mappen.push(m.id);
    mappenJeTyp.set(id, daten.mappen.map((m) => m.id));
  }
  // Dokumente: alle PDFs (ab 0 MB), wie Werkbank → Systemzustand → Verkleinern sie listet.
  const { daten: gross } = await json('GET', '/api/werkbank/verkleinern?ab=0', { ...admin, zeit: 300_000 });
  const dokumente = (gross.eintraege ?? gross.dokumente ?? []).map((d) => ({ id: d.id, mappe: d.mappeId, typ: d.typId }));
  const groesste = ansichten.map((id) => ({ id, n: 0 }));
  // Mappentypen, die Personen ohne Rolle ganz sehen (#920): dort holen sie Vorschaubild, Dokument und Historie – so
  // gibt es dafür kein 404, wie früher mit dem Administrator.
  const frei = new Set();
  for (const g of groesste) {
    g.n = (await json('GET', `/api/mappen?sicht=${g.id}&von=0&anzahl=1`, admin)).daten.gesamt ?? 0;
    const ohne = (await json('GET', `/api/mappen?sicht=${g.id}&von=0&anzahl=1`, { cookie: sitzungen.ohneRolle })).daten.gesamt ?? 0;
    if (g.n > 0 && ohne === g.n) frei.add(g.id);
  }
  groesste.sort((a, b) => b.n - a.n);
  const dokumenteFrei = dokumente.filter((d) => frei.has(d.typ));
  const mappenFrei = [...frei].flatMap((id) => mappenJeTyp.get(id) ?? []);
  // Großer Export: PDF der ersten 1000 Mappen der größten Ansicht (je Mappe eine Seite, Übersicht als Tabelle),
  // PDF der Mappen mit Dokumenten aus der Ansicht mit den meisten (Dokumente eingebunden), ZIP der größten Ansicht.
  const exportPdf = (await json('GET', `/api/mappen?sicht=${groesste[0].id}&von=0&anzahl=1000`, admin)).daten.mappen.map((m) => m.id);
  const jeTyp = new Map();
  for (const d of dokumente) { if (!jeTyp.has(d.typ)) jeTyp.set(d.typ, new Set()); jeTyp.get(d.typ).add(d.mappe); }
  const [dokSicht, dokMappen] = [...jeTyp.entries()].sort((a, b) => b[1].size - a[1].size)[0] ?? [null, new Set()];
  return {
    sitzungen, personen, eigeneKonten: true, ansichten, mappen, dokumente, exportSicht: groesste[0], exportPdf, dokSicht, dokMappen: [...dokMappen],
    // Ohne frei sichtbare Mappentypen wie bisher alle (dann zählt ein 404 als abgelehnt).
    dokumenteFrei: dokumenteFrei.length ? dokumenteFrei : dokumente, mappenFrei: mappenFrei.length ? mappenFrei : mappen,
  };
}

/* ---------- Profil ---------- */

const WOERTER = ['Rechnung', 'Vertrag', 'Versicherung', 'Strom', 'Auto', 'Miete', 'Steuer', 'Garantie', 'Wasser', 'Handy'];

/** Gewichte des gemischten Profils (Anteil der Anfragen). */
export const PROFIL = [
  ['Startseite', 15], ['Liste', 25], ['Mappe öffnen', 25], ['Suche', 15], ['Vorschaubild', 10], ['Herunterladen', 10],
];

/**
 * Schreibanteil des Durchgangs „mit Speichern“ (#739): zusammen 10 % – Mappe ändern, Stern setzen oder entfernen,
 * Notiz anlegen oder löschen, Aufgabe anlegen oder erledigen. Dazu 5 % Historie (#800): die erste Seite (100 Einträge)
 * der Historie einer Mappe – sie wächst im Durchgang durch das Schreiben und die Abrufe. Die übrigen Leseanfragen
 * behalten ihr Verhältnis aus PROFIL.
 */
export const SCHREIBEN = [['Mappe ändern', 4], ['Stern', 2], ['Notiz', 2], ['Aufgabe', 2]];
export const HISTORIE_LESEN = [['Historie', 5]];
export const PROFIL_SPEICHERN = [...PROFIL.map(([a, g]) => [a, g * 0.85]), ...HISTORIE_LESEN, ...SCHREIBEN];
const SCHREIBARTEN = new Set(SCHREIBEN.map(([a]) => a));

/**
 * Nächste Anfrage der Person `wer` (#920: eigenes Konto; ohne Angabe eine beliebige). Ohne `p` nur lesen; mit `p`
 * (Zustand der Person im Durchgang „mit Speichern“) nach PROFIL_SPEICHERN.
 */
function naechsteAnfrage(v, p = null, wer = zufall(personenVon(v))) {
  const cookie = wer.cookie;
  const profil = p ? PROFIL_SPEICHERN : PROFIL;
  let x = Math.random() * 100;
  let art = profil[0][0];
  for (const [a, g] of profil) { if ((x -= g) < 0) { art = a; break; } }
  if (p && SCHREIBARTEN.has(art)) return schreibAnfrage(v, p, art, wer);
  // Dokumente und Historie: Personen ohne Rolle nur in Mappentypen, die sie ganz sehen (#920) – wie früher mit dem
  // Administrator gibt es dafür kein 404. Personen mit Rolle (und die Sitzungen von früher) sehen alle.
  const alles = wer.art !== 'ohneRolle';
  const dokumente = alles ? v.dokumente : v.dokumenteFrei ?? v.dokumente;
  const doc = dokumente.length ? zufall(dokumente) : null;
  switch (art) {
    case 'Startseite': return { art, cookie, pfad: zufall(['/api/startseite', '/api/sichten', '/api/termine/naechster', '/api/typen']) };
    case 'Liste': return { art, cookie, pfad: `/api/mappen?sicht=${zufall(v.ansichten)}&von=${50 * Math.floor(Math.random() * 10)}&anzahl=50` };
    case 'Mappe öffnen': return { art, cookie, pfad: `/api/mappen/${zufall(v.mappen)}` };
    // Historie (#800): wie das Register – erste Seite.
    case 'Historie': return { art, cookie, pfad: `/api/mappen/${zufall(alles ? v.mappen : v.mappenFrei ?? v.mappen)}/historie?max=100` };
    case 'Suche': return { art, cookie, pfad: `/api/mappen?sicht=${zufall(v.ansichten)}&suche=${encodeURIComponent(zufall(WOERTER))}&von=0&anzahl=50` };
    case 'Vorschaubild': return doc ? { art, cookie, pfad: `/api/dokumente/${doc.id}/vorschau` } : { art: 'Liste', cookie, pfad: `/api/mappen?sicht=${zufall(v.ansichten)}&von=0&anzahl=50` };
    default: return doc ? { art, cookie, pfad: `/api/dokumente/${doc.id}/inhalt` } : { art: 'Mappe öffnen', cookie, pfad: `/api/mappen/${zufall(v.mappen)}` };
  }
}

/* ---------- Speichern (#739) ---------- */

/** Ein Wert, der sich vom ursprünglichen unterscheidet und in das Feld passt (maxLen). */
function geaendert(z, nr) {
  const zusatz = ` (L${nr % 1000})`;
  const basis = String(z.wert ?? 'Lasttest');
  return `${basis.slice(0, Math.max(1, (z.maxLen ?? 1000) - zusatz.length))}${zusatz}`;
}

/**
 * Schreibende Anfrage der Person `wer` (#920: eigenes Konto). Ziele sind Mappen, die alle Konten lesen und ändern
 * dürfen. Was angelegt oder geändert wird, merkt sich `s.spur`, damit `aufraeumen` es danach zurücknimmt. `danach`
 * bekommt die Antwort (nur bei 2xx).
 */
function schreibAnfrage(v, p, art, wer) {
  const s = p.s;
  const cookie = wer.cookie;
  switch (art) {
    case 'Mappe ändern': {
      const z = zufall(s.aendern);
      s.spur.geaendert.set(z.id, z);
      return { art, cookie, methode: 'PUT', pfad: `/api/mappen/${z.id}`, body: { werte: { [z.feld]: geaendert(z, ++s.zaehler) } } };
    }
    case 'Stern': {
      const z = zufall(s.ziele);
      const an = Math.random() < 0.5;
      if (an) s.spur.sterne.add(`${cookie} ${z.id}`);
      return { art, cookie, methode: an ? 'PUT' : 'DELETE', pfad: `/api/mappen/${z.id}/favorit` };
    }
    case 'Notiz': {
      if (p.notizen.length && Math.random() < 0.5) {
        const n = p.notizen.shift();
        return { art, cookie: n.cookie, methode: 'DELETE', pfad: `/api/notizen/${n.id}`, danach: () => s.spur.notizen.delete(n.id) };
      }
      const z = zufall(s.ziele);
      return {
        art, cookie, methode: 'POST', pfad: `/api/mappen/${z.id}/notizen`, body: { text: 'Lasttest: kurze Notiz beim Speichern' },
        danach: (d) => { if (d?.id) { const n = { id: d.id, cookie }; p.notizen.push(n); s.spur.notizen.set(d.id, n); } },
      };
    }
    default: {
      // Aufgabe: eine eigene anlegen, beim nächsten Mal erledigen.
      if (p.aufgabe) {
        const a = p.aufgabe; p.aufgabe = null;
        return { art, cookie: a.cookie, methode: 'POST', pfad: `/api/aufgaben/${a.id}/erledigt`, danach: () => s.spur.aufgaben.delete(a.id) };
      }
      const z = zufall(s.ziele);
      return {
        art, cookie, methode: 'POST', pfad: `/api/mappen/${z.id}/aufgaben`, body: { text: 'Lasttest: bitte prüfen', empfaengerId: s.benutzerIds.get(cookie) },
        danach: (d) => { if (d?.id) { p.aufgabe = { id: d.id, cookie }; s.spur.aufgaben.set(d.id, p.aufgabe); } },
      };
    }
  }
}

/** Feld, das „Mappe ändern“ ändert: Text oder langer Text, nicht eindeutig, ohne Muster und Format. */
const aenderbaresFeld = (t) => t.felder.find((f) => f.typ === 'langtext' && !f.eindeutig && !f.muster && !f.format)
  ?? t.felder.find((f) => f.typ === 'text' && !f.eindeutig && !f.muster && !f.format);

/**
 * Ziele für den Durchgang „mit Speichern“: je Ansicht bis zu 50 Mappen aus den ersten 200, die das Mitglied ohne Rolle
 * sieht (dann dürfen alle Konten sie lesen und ändern), mit dem ursprünglichen Wert des Felds, das sich ändert.
 */
async function vorbereitenSpeichern(v) {
  // Id je Sitzung für „Aufgabe an mich“ (#920: je Person).
  const benutzerIds = new Map();
  for (const p of personenVon(v)) benutzerIds.set(p.cookie, p.id ?? (await json('GET', '/api/konto/status', { cookie: p.cookie })).daten.benutzer.id);
  const { daten: typen } = await json('GET', '/api/typen', { cookie: v.sitzungen.admin });
  const felder = new Map(typen.filter((t) => !t.system).map((t) => [t.id, aenderbaresFeld(t) ?? null]));
  const ziele = [];
  for (const id of v.ansichten) {
    const { daten } = await json('GET', `/api/mappen?sicht=${id}&von=0&anzahl=200`, { cookie: v.sitzungen.ohneRolle });
    const liste = [...daten.mappen];
    for (let i = 0; i < 50 && liste.length; i++) {
      const m = liste.splice(Math.floor(Math.random() * liste.length), 1)[0];
      const f = felder.get(m.typId);
      ziele.push({ id: m.id, feld: f?.key ?? null, maxLen: f?.maxLen ?? null, wert: f ? m.werte?.[f.key] ?? null : null });
    }
  }
  if (!ziele.length) throw new Error('Für den Durchgang „mit Speichern“ gibt es keine Mappen, die alle Konten sehen.');
  return { benutzerIds, ziele, aendern: ziele.filter((z) => z.feld) };
}

/** Frischer Zustand für einen Durchgang „mit Speichern“. */
const schreibrunde = (vorlage) => ({ ...vorlage, zaehler: 0, spur: { geaendert: new Map(), sterne: new Set(), notizen: new Map(), aufgaben: new Map() } });

/** `n` Aufgaben gleichzeitig abarbeiten; Fehler zählen, nicht abbrechen. */
async function nebenher(jobs, n) {
  let i = 0; let fehler = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < jobs.length) {
      const j = jobs[i++];
      try { const r = await j(); if (r && r.status >= 400 && r.status !== 404) fehler++; } catch { fehler++; }
    }
  }));
  return fehler;
}
const ohneInhalt = async (r) => { await r.arrayBuffer(); return r; };

/**
 * Nach dem Durchgang „mit Speichern“: Sterne weg, Notizen weg, geänderte Werte zurück, offene Aufgaben aus dem Durchgang
 * erledigt (eigene und „Geändert“ zu Favoriten). Übrig bleiben nur Einträge in der Historie und erledigte Aufgaben.
 */
async function aufraeumen(v, s) {
  melde({ art: 'schritt', schritt: 'aufraeumen' });
  const t0 = Date.now();
  const admin = v.sitzungen.admin;
  let fehler = await nebenher([
    ...[...s.spur.sterne].map((k) => { const i = k.lastIndexOf(' '); return () => anfrage('DELETE', `/api/mappen/${k.slice(i + 1)}/favorit`, { cookie: k.slice(0, i) }).then(ohneInhalt); }),
    ...[...s.spur.notizen.values()].map((n) => () => anfrage('DELETE', `/api/notizen/${n.id}`, { cookie: n.cookie }).then(ohneInhalt)),
  ], 8);
  fehler += await nebenher([...s.spur.geaendert.values()].map((z) => () => anfrage('PUT', `/api/mappen/${z.id}`, { cookie: admin, body: { werte: { [z.feld]: z.wert } } }).then(ohneInhalt)), 8);
  const ziele = new Set(s.ziele.map((z) => z.id));
  let aufgaben = 0;
  for (const cookie of new Set([...Object.values(v.sitzungen), ...personenVon(v).map((p) => p.cookie)])) {
    const { daten } = await json('GET', '/api/aufgaben', { cookie, zeit: 120_000 }).catch(() => ({ daten: [] }));
    const ids = (daten ?? []).filter((a) => ziele.has(a.mappeId) && (a.art === 'aenderung' || (a.art === 'manuell' && String(a.text ?? '').startsWith('Lasttest:')))).map((a) => a.id);
    for (let i = 0; i < ids.length; i += 500) {
      const r = await json('POST', '/api/aufgaben/erledigt', { cookie, body: { ids: ids.slice(i, i + 500) }, zeit: 300_000 }).catch(() => null);
      if (!r) fehler++; else aufgaben += r.daten?.erledigt?.length ?? 0;
    }
  }
  const e = { sekunden: Math.round((Date.now() - t0) / 1000), werte: s.spur.geaendert.size, sterne: s.spur.sterne.size, notizen: s.spur.notizen.size, aufgaben, fehler };
  console.log(`  aufgeräumt in ${e.sekunden} s: ${e.werte} Werte zurück, ${e.sterne} Sterne, ${e.notizen} Notizen, ${e.aufgaben} Aufgaben${fehler ? `, ${fehler} Fehler` : ''}`);
  return e;
}

/* ---------- Messung ---------- */

const quantil = (a, q) => { if (!a.length) return null; const s = Float64Array.from(a).sort(); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };
const rund = (x) => (x === null || x === undefined ? null : Math.round(x));

/**
 * Werte des Servers (Werkbank → Systemzustand, Datenbank-Anbindung): Ereignisschleife, Speicher, Warten auf Verbindungen.
 * `unerreichbar` nur, wenn keine Antwort kam (Zeitüberschreitung, Verbindung abgelehnt). Antwortet der Server ohne
 * Werte (403, 503 …), ist er erreichbar – das zählt nicht als Ausfall (#873), nur die Werte fehlen.
 */
export async function serverStand(cookie) {
  const t0 = performance.now();
  const ohne = (e) => ({ fehler: e.message, ...(e instanceof Antwortfehler ? { status: e.status } : { unerreichbar: true }), antwortMs: performance.now() - t0 });
  try {
    const { daten: s } = await json('GET', '/api/werkbank/last', { cookie, zeit: 10_000 });
    return { ...s, antwortMs: performance.now() - t0 };
  } catch (e) {
    if (!(e instanceof Antwortfehler) || e.status !== 404) return ohne(e);
    // Ältere Fassungen (vor #544): Systemzustand.
    try {
      const { daten: s } = await json('GET', '/api/werkbank/systemlast', { cookie, zeit: 10_000 });
      const w = s.schleife?.aktuell ?? s.schleife?.vorher;
      return { schleife: w ? { p99: w.p99, max: w.max } : null, speicherMb: s.anteile?.dms ? s.anteile.dms / 1024 ** 2 : null, antwortMs: performance.now() - t0 };
    } catch (e2) { return ohne(e2); }
  }
}

/**
 * Teuerste Abfragen (#894): Vor jedem Durchgang setzt der Test die Werte von pg_stat_statements der Datenbank von
 * Ablago zurück, danach liest er die {@link ABFRAGEN_ANZAHL} teuersten. Ohne das Modul steht der Grund mit Abhilfe im
 * Ergebnis, der Test läuft weiter. null: ältere Fassung ohne diese Angabe oder keine Antwort.
 */
export const ABFRAGEN_ANZAHL = 10;
async function abfragenZuruecksetzen(cookie) {
  try { return (await json('POST', '/api/werkbank/last/abfragen-zuruecksetzen', { cookie, body: {}, zeit: 30_000 })).daten; } catch { return null; }
}
export async function teuersteAbfragen(cookie, zurueck) {
  let a;
  try { a = (await json('GET', `/api/werkbank/last?abfragen=${ABFRAGEN_ANZAHL}`, { cookie, zeit: 30_000 })).daten?.abfragen; } catch { return null; }
  if (!a) return null;
  if (!a.verfuegbar) return { verfuegbar: false, grund: a.grund, hinweis: a.hinweis };
  return { verfuegbar: true, zurueckgesetzt: zurueck?.zurueckgesetzt === true, ...(zurueck && !zurueck.zurueckgesetzt ? { hinweis: zurueck.hinweis } : {}), gesamtMs: a.gesamtMs, liste: a.abfragen };
}

/**
 * Ein Durchgang: `n` Personen schicken `dauer` Sekunden lang Anfragen; optional läuft nebenher ein großer
 * Export nach dem anderen (als Administrator).
 */
export async function durchgang(v, { name, n, dauer, mitExport, speichern = null }) {
  const ende = Date.now() + dauer * 1000;
  const zeiten = []; const jeArt = {};
  const z = { anfragen: 0, ok: 0, abgewiesen: 0, client: 0, fehler: 0, ohneAntwort: 0, retryAfter: 0, status: {} };
  const server = [];
  const exporte = [];
  /** Nur „mit Speichern“: Zeiten der schreibenden Anfragen und abgelehnte (4xx) je Art und Status. */
  const schreibZeiten = []; const abgelehnt = {};
  /** #895: Antworten der letzten Sekunden (Zeitpunkt, Dauer) für p95 auf der Lasttest-Seite. */
  const fenster = { t: [], ms: [] };
  let laeuft = true;

  // #920: Person i meldet sich mit Konto i an (reihum, wenn es mehr Personen als Konten gibt).
  const personen = personenVon(v);
  async function person(i) {
    const wer = personen[i % personen.length];
    // Zustand der Person im Durchgang „mit Speichern“ (eigene Notizen, offene Aufgabe); sonst nur lesen wie bisher.
    const p = speichern ? { s: speichern, notizen: [], aufgabe: null } : null;
    while (Date.now() < ende) {
      const a = naechsteAnfrage(v, p, wer);
      const t0 = performance.now();
      try {
        const r = await anfrage(a.methode ?? 'GET', a.pfad, { cookie: a.cookie, body: a.body });
        if (a.methode) {
          const t = await r.text();
          if (r.ok && a.danach) { try { a.danach(t ? JSON.parse(t) : null); } catch { /* Antwort ohne JSON */ } }
          if (r.status >= 400 && r.status < 500) abgelehnt[`${a.art} ${r.status}`] = (abgelehnt[`${a.art} ${r.status}`] ?? 0) + 1;
        } else await r.arrayBuffer();
        const ms = performance.now() - t0;
        if (a.methode && r.status !== 503) schreibZeiten.push(ms);
        z.anfragen++; z.status[r.status] = (z.status[r.status] ?? 0) + 1;
        if (r.status === 503) {
          // Wie ein ordentliches Programm: so lange warten, wie Retry-After sagt (höchstens 10 s).
          z.abgewiesen++;
          const w = Number(r.headers.get('retry-after'));
          if (w) { z.retryAfter++; await warte(Math.min(10, w) * 1000 * (0.5 + Math.random())); }
          continue;
        }
        zeiten.push(ms); (jeArt[a.art] ??= []).push(ms);
        fenster.t.push(Date.now()); fenster.ms.push(ms);
        if (r.status >= 500) z.fehler++; else if (r.status >= 400) z.client++; else z.ok++;
      } catch (e) {
        z.anfragen++;
        if (e.name === 'TimeoutError' || e.name === 'AbortError') { z.ohneAntwort++; (z.ohneAntwortJe ??= {})[a.art] = (z.ohneAntwortJe[a.art] ?? 0) + 1; } else { z.fehler++; const g = String(e.cause?.code ?? e.name); (z.fehlerJe ??= {})[g] = (z.fehlerJe[g] ?? 0) + 1; }
        // Verbindung abgelehnt (Server weg?): kurz warten, sonst dreht die Schleife leer.
        await warte(100);
      }
    }
  }

  async function messen() {
    while (laeuft) {
      server.push({ t: Date.now(), ...(await serverStand(v.sitzungen.admin)) });
      // #895: dieselben Werte an die Lasttest-Seite (nur im Lasttest-Modus) – keine zusätzliche Abfrage.
      if (process.send) {
        const grenze = Date.now() - LIVE_FENSTER_MS;
        const weg = fenster.t.findIndex((t) => t >= grenze);
        if (weg !== 0) { const n = weg < 0 ? fenster.t.length : weg; fenster.t.splice(0, n); fenster.ms.splice(0, n); }
        void melde({ art: 'live', ...liveAus(server.filter((x) => !x.fehler), fenster.ms, { name, n, seit: SKRIPT_START }) });
      }
      await warte(2000);
    }
  }

  async function exportieren() {
    const admin = v.sitzungen.admin;
    const arten = [
      { art: 'pdf', body: { format: 'pdf', sicht: v.exportSicht.id, ids: v.exportPdf, uebersicht: true }, mappen: v.exportPdf.length },
      ...(v.dokSicht ? [{ art: 'pdf+dok', body: { format: 'pdf', sicht: v.dokSicht, ids: v.dokMappen, uebersicht: true }, mappen: v.dokMappen.length }] : []),
      { art: 'zip', body: { format: 'zip', sicht: v.exportSicht.id }, mappen: v.exportSicht.n },
    ];
    let i = 0;
    while (Date.now() < ende) {
      const a = arten[i++ % arten.length];
      const t0 = performance.now();
      try {
        const r = await anfrage('POST', '/api/export', { cookie: admin, body: a.body, zeit: 600_000 });
        const b = await r.arrayBuffer();
        exporte.push({ art: a.art, status: r.status, ms: performance.now() - t0, mb: b.byteLength / 1024 ** 2, mappen: a.mappen });
      } catch (e) { exporte.push({ art: a.art, status: e.name, ms: performance.now() - t0, mb: 0, mappen: a.mappen }); }
    }
  }

  // #1117: Ab hier misst der Durchgang selbst.
  await vorlaufStoppen();
  const zurueck = await abfragenZuruecksetzen(v.sitzungen.admin);
  const start = Date.now();
  melde({ art: 'live', ...liveAus([], [], { name, n, seit: SKRIPT_START }) });
  const mess = messen();
  const ex = mitExport ? exportieren() : Promise.resolve();
  await Promise.all(Array.from({ length: n }, (_, i) => person(i)));
  await ex;
  laeuft = false;
  await mess;
  const sek = (Date.now() - start) / 1000;
  const abfragen = await teuersteAbfragen(v.sitzungen.admin, zurueck);
  const sv = server.filter((s) => !s.fehler);
  const max = (k) => { const w = sv.map(k).filter((x) => typeof x === 'number'); return w.length ? Math.max(...w) : null; };
  const ergebnis = {
    name, n, dauer: Math.round(sek), mitExport,
    // #739: Durchgang mit Schreibanteil – eigene Zeile, ohne Ziel und ohne CI-Grenze.
    ...(speichern ? { speichern: true, schreiben: { anfragen: schreibZeiten.length, median: rund(quantil(schreibZeiten, 0.5)), p95: rund(quantil(schreibZeiten, 0.95)) }, abgelehnt } : {}),
    anfragen: z.anfragen, jeSekunde: Math.round(z.anfragen / sek), ok: z.ok, client: z.client, fehler: z.fehler, abgewiesen: z.abgewiesen, retryAfter: z.retryAfter, ohneAntwort: z.ohneAntwort, status: z.status,
    ohneAntwortJe: z.ohneAntwortJe ?? {}, fehlerJe: z.fehlerJe ?? {},
    fehlerquote: z.anfragen ? (z.fehler + z.ohneAntwort) / z.anfragen : 0,
    median: rund(quantil(zeiten, 0.5)), p95: rund(quantil(zeiten, 0.95)), p99: rund(quantil(zeiten, 0.99)), max: rund(zeiten.length ? Math.max(...zeiten) : null),
    jeArt: Object.fromEntries(Object.entries(jeArt).map(([k, w]) => [k, { anzahl: w.length, median: rund(quantil(w, 0.5)), p95: rund(quantil(w, 0.95)) }])),
    schleifeP99: max((s) => s.schleife?.p99), schleifeMax: max((s) => s.schleife?.max),
    dbWartenP95: rund(quantil(sv.map((s) => s.datenbank?.wartenJetzt).filter((x) => typeof x === 'number'), 0.95)), dbWartenMax: rund(max((s) => s.datenbank?.wartenJetzt)),
    dbVerbindungen: sv.find((s) => s.datenbank)?.datenbank?.verbindungen ?? null, ueberlastGrenze: sv.find((s) => s.anfragen)?.anfragen?.max ?? null,
    speicherMbStart: rund(sv[0]?.speicherMb), speicherMbMax: rund(max((s) => s.speicherMb)), speicherMbEnde: rund(sv.at(-1)?.speicherMb),
    // Ganzer Container (#696) beim höchsten Stand dieses Durchgangs, mit Aufteilung; null, wenn nicht lesbar.
    container: (() => { const m = sv.filter((s) => typeof s.container?.mb === 'number').sort((a, b) => b.container.mb - a.container.mb)[0]?.container; return m ? { mb: m.mb, programmeMb: m.programmeMb, zwischenspeicherMb: m.zwischenspeicherMb, datenbankMb: m.datenbankMb } : null; })(),
    // Nur Abfragen ohne Antwort (#873); Antworten ohne Werte stehen getrennt.
    serverAusfaelle: server.filter((s) => s.unerreichbar).length, zustandOhneWerte: server.filter((s) => s.fehler && !s.unerreichbar).length,
    exporte: exporte.map((e) => ({ ...e, ms: Math.round(e.ms), mb: Math.round(e.mb * 10) / 10 })),
    // Wo es hakt (#874): Verbindungen, Sperren, CPU, Speicher je Prozess – über alle Prozesse; null bei älteren Fassungen.
    engpass: engpassAus(sv),
    // Teuerste Abfragen (#894) dieses Durchgangs; null bei älteren Fassungen.
    abfragen,
    // #895: CPU und Speicher je Gruppe, Warnungen und Fehler aus dem Protokoll dieses Durchgangs; null bei älteren Fassungen.
    gruppen: gruppenAus(sv),
    protokoll: protokollAus(sv),
    beginn: start, ende: Date.now(),
  };
  return ergebnis;
}

/** Quantil aus Klassen (Obergrenze der Klasse, #874); über der letzten Klasse null. */
export function quantilAusKlassen(zaehler, grenzen, q) {
  const n = zaehler.reduce((a, b) => a + b, 0);
  if (!n) return null;
  const ziel = Math.ceil(q * n);
  let summe = 0;
  for (let i = 0; i < zaehler.length; i++) { summe += zaehler[i]; if (summe >= ziel) return i < grenzen.length ? grenzen[i] : null; }
  return null;
}

/**
 * Engpass eines Durchgangs (#874) aus den Ständen von `/api/werkbank/last` (alle 2 s, `engpass`): Wartezeit auf eine
 * freie Verbindung (p95 aus dem Unterschied der Klassen zwischen erstem und letztem Stand, höchstens aus den Fenstern),
 * belegte und erlaubte Verbindungen, Sitzungen mit Sperren, Rechenzeit von PostgreSQL, Ablago und Container (in % eines
 * Kerns über den Durchgang) und der Arbeitsspeicher je Prozess (höchstens). null, wenn der Server das nicht meldet.
 */
export function engpassAus(staende) {
  const e = staende.filter((s) => s.engpass);
  if (!e.length) return null;
  const a = e[0], z = e.at(-1);
  const hoechstens = (k) => { const w = e.map(k).filter((x) => typeof x === 'number'); return w.length ? Math.max(...w) : null; };
  const grenzen = z.engpass.klassenMs ?? [];
  const k0 = a.engpass.pool?.klassen, k1 = z.engpass.pool?.klassen;
  const klassen = k0 && k1 && k0.length === k1.length ? k1.map((n, i) => Math.max(0, n - k0[i])) : null;
  const sek = (z.t - a.t) / 1000;
  const cpu = (k) => {
    const x = a.engpass.cpu?.[k], y = z.engpass.cpu?.[k];
    return sek >= 1 && typeof x === 'number' && typeof y === 'number' && y >= x ? Math.round(((y - x) / sek) * 100) : null;
  };
  const speicher = {};
  for (const s of e) {
    for (const p of s.engpass.speicher ?? []) {
      if (typeof p.mb !== 'number') continue;
      const alt = speicher[p.nr];
      speicher[p.nr] = { rolle: p.rolle, mb: Math.max(p.mb, alt?.mb ?? 0), haldeMb: typeof p.haldeMb === 'number' ? Math.max(p.haldeMb, alt?.haldeMb ?? 0) : alt?.haldeMb ?? null };
    }
  }
  return {
    wartenP95: klassen ? quantilAusKlassen(klassen, grenzen, 0.95) : null, wartenMax: hoechstens((s) => s.engpass.pool?.wartenMax),
    wartenAnzahl: klassen ? klassen.reduce((x, y) => x + y, 0) : null,
    belegtMax: hoechstens((s) => s.engpass.pool?.belegtMax), verbindungen: z.engpass.pool?.max ?? z.engpass.verbindungen?.gesamt ?? null,
    warteschlangeMax: hoechstens((s) => s.engpass.pool?.warteschlangeMax),
    sperrenMax: hoechstens((s) => s.engpass.sitzungen?.sperren), sperreMsMax: hoechstens((s) => s.engpass.sitzungen?.sperreMs),
    aktivMax: hoechstens((s) => s.engpass.sitzungen?.aktiv), sitzungenMax: hoechstens((s) => s.engpass.sitzungen?.offen),
    cpuPostgres: cpu('postgres'), cpuAblago: cpu('ablago'), cpuContainer: cpu('container'),
    // Abgestürzte Prozesse (#874): Unterschied der Zählung des Hauptprozesses, dazu Nummer und Code bzw. Signal.
    neustarts: typeof a.engpass.neustarts?.anzahl === 'number' && typeof z.engpass.neustarts?.anzahl === 'number' ? Math.max(0, z.engpass.neustarts.anzahl - a.engpass.neustarts.anzahl) : null,
    neustartGruende: (z.engpass.neustarts?.letzte ?? []).filter((x) => Date.parse(x.zeit) >= a.t - 2000).map((x) => `${x.nr} ${x.signal ?? `Code ${x.code}`}`),
    speicherJeProzess: Object.entries(speicher).map(([nr, p]) => ({ nr: Number(nr), rolle: p.rolle, mb: p.mb, haldeMb: p.haldeMb ?? null })).sort((x, y) => x.nr - y.nr),
  };
}

/**
 * Fehlerarten eines Durchgangs (#874): Status 5xx, abgebrochene Verbindungen (Code von Node.js, z. B. ECONNRESET) und
 * Anfragen ohne Antwort je Art – null, wenn es keine gab. Zeigt, ob der Server Fehler meldet oder Verbindungen wegbrechen
 * (z. B. weil ein Prozess abstürzt).
 */
export function fehlerText(l) {
  const teile = [
    ...Object.entries(l.status ?? {}).filter(([k]) => Number(k) >= 500 && k !== '503').map(([k, n]) => `${k} × ${n}`),
    ...Object.entries(l.fehlerJe ?? {}).map(([k, n]) => `${k} × ${n}`),
    ...Object.entries(l.ohneAntwortJe ?? {}).map(([k, n]) => `ohne Antwort (${k}) × ${n}`),
  ];
  return teile.length ? teile.join(', ') : null;
}

/**
 * „Engpass: Warten auf eine DB-Verbindung p95 ≤ 20 ms, höchstens 340 ms · Verbindungen belegt bis 16 von 16 (Warteschlange
 * bis 35) · Sperren: bis 2 Sitzungen, längste 120 ms · CPU (% eines Kerns): PostgreSQL 140 %, Ablago 210 %, Container
 * 360 % · Speicher je Prozess: Hauptprozess 32 MB, Prozess 1: 420 MB (Halde 250), Prozess 2: 380 MB (Halde 210)“ (#874, #891).
 * Was fehlt, steht als „–“.
 */
export function engpassText(g) {
  const ms = (x) => (x === null || x === undefined ? '–' : `${String(x).replace('.', ',')} ms`);
  const pz = (x) => (x === null || x === undefined ? '–' : `${x} %`);
  const teile = [
    `Warten auf DB-Verbindung p95 ${g.wartenP95 === null && g.wartenAnzahl ? '> 30 s' : g.wartenP95 === null ? '–' : `≤ ${ms(g.wartenP95)}`}, höchstens ${ms(g.wartenMax)}`,
    `Verbindungen belegt bis ${f(g.belegtMax)} von ${f(g.verbindungen)}${g.warteschlangeMax ? ` (Warteschlange bis ${g.warteschlangeMax})` : ''}`,
    `Sperren: ${g.sperrenMax === null ? '–' : g.sperrenMax === 0 ? 'keine' : `bis ${g.sperrenMax} ${g.sperrenMax === 1 ? 'Sitzung' : 'Sitzungen'}, längste ${ms(g.sperreMsMax)}`}`,
    `CPU (% eines Kerns): PostgreSQL ${pz(g.cpuPostgres)}, Ablago ${pz(g.cpuAblago)}, Container ${pz(g.cpuContainer)}`,
    `Neustarts von Prozessen: ${g.neustarts === null || g.neustarts === undefined ? '–' : g.neustarts}${g.neustartGruende?.length ? ` (${g.neustartGruende.join(', ')})` : ''}`,
    `Speicher je Prozess: ${g.speicherJeProzess.length ? g.speicherJeProzess.map((p) => `${p.nr === 0 ? 'Hauptprozess' : `Prozess ${p.nr}:`} ${p.mb} MB${typeof p.haldeMb === 'number' ? ` (Halde ${p.haldeMb})` : ''}`).join(', ') : '–'}`,
  ];
  return teile.join(' · ');
}

/* ---------- Wer belegt die CPU, Protokoll (#895) ---------- */

const GRUPPEN_FOLGE = ['ablago', 'lastgenerator', 'postgres', 'texterkennung', 'bilder', 'rest'];
const GRUPPEN_NAME = { lastgenerator: 'Lastgenerator', postgres: 'PostgreSQL', texterkennung: 'Texterkennung', bilder: 'Seiten-/Vorschaubilder', rest: 'andere Programme' };
const gruppeSchluessel = (g) => (g.art === 'ablago' ? `ablago:${g.nr}` : g.art);
export const gruppenName = (g) => (g.art === 'ablago' ? (g.nr === 0 ? 'Ablago Hauptprozess' : `Ablago Prozess ${g.nr}`) : GRUPPEN_NAME[g.art] ?? g.art);
const prozentKern = (dSek, sek) => (sek >= 1 && dSek >= 0 ? Math.round((dSek / sek) * 100) : null);

/**
 * CPU und Speicher je Gruppe eines Durchgangs (#895) aus den Ständen von `/api/werkbank/last` (`engpass.gruppen`):
 * Rechenzeit in % eines Kerns über den Durchgang (Unterschied zwischen erstem und letztem Stand), Speicher (RSS) und
 * Zahl der Prozesse höchstens. `{ verfuegbar: false }` ohne /proc (nicht Linux), null bei älteren Fassungen.
 */
export function gruppenAus(staende) {
  const mit = staende.filter((s) => s.engpass && 'gruppen' in s.engpass && s.engpass.gruppen);
  if (!mit.length) return null;
  const e = mit.filter((s) => s.engpass.gruppen.verfuegbar);
  if (!e.length) return { verfuegbar: false };
  const a = e[0].engpass.gruppen, z = e.at(-1).engpass.gruppen;
  const sek = (z.zeit - a.zeit) / 1000;
  const anfang = new Map(a.gruppen.map((g) => [gruppeSchluessel(g), g.cpuSekunden]));
  const hoch = new Map();
  for (const s of e) {
    for (const g of s.engpass.gruppen.gruppen) {
      const k = gruppeSchluessel(g); const h = hoch.get(k) ?? { mb: 0, anzahl: 0 };
      hoch.set(k, { mb: Math.max(h.mb, g.mb ?? 0), anzahl: Math.max(h.anzahl, g.anzahl ?? 0) });
    }
  }
  const gruppen = z.gruppen.map((g) => {
    const k = gruppeSchluessel(g);
    return { art: g.art, ...(g.art === 'ablago' ? { nr: g.nr, rolle: g.rolle } : {}), cpu: prozentKern(g.cpuSekunden - (anfang.get(k) ?? 0), sek), mbMax: hoch.get(k)?.mb ?? g.mb, anzahlMax: hoch.get(k)?.anzahl ?? g.anzahl };
  }).sort((x, y) => GRUPPEN_FOLGE.indexOf(x.art) - GRUPPEN_FOLGE.indexOf(y.art) || (x.nr ?? 0) - (y.nr ?? 0));
  return { verfuegbar: true, postgresImContainer: !!z.postgresImContainer, sekunden: Math.round(sek), gruppen };
}

/**
 * Knapp für den Ergebnisblock (#895): „CPU je Gruppe (% eines Kerns, Speicher RSS höchstens): Ablago Hauptprozess 1 %
 * 40 MB, Ablago Prozess 1 120 % 450 MB · Lastgenerator 60 % 120 MB · PostgreSQL 140 % 600 MB (12 Prozesse) ·
 * Texterkennung 0 % · Seiten-/Vorschaubilder 0 % · andere Programme 2 % 30 MB“. null: keine Angabe (ältere Fassung).
 */
export function gruppenText(g) {
  if (!g) return null;
  if (!g.verfuegbar) return 'CPU je Gruppe: nicht verfügbar (nur unter Linux messbar)';
  const pz = (x) => (x === null || x === undefined ? '–' : `${x} %`);
  const eins = (x) => `${gruppenName(x)} ${pz(x.cpu)}${x.mbMax ? ` ${x.mbMax} MB` : ''}${x.art === 'postgres' || (x.art !== 'ablago' && x.anzahlMax > 1) ? ` (${x.anzahlMax} ${x.anzahlMax === 1 ? 'Prozess' : 'Prozesse'})` : ''}`;
  const ablago = g.gruppen.filter((x) => x.art === 'ablago');
  const teile = [ablago.length ? ablago.map(eins).join(', ') : null];
  for (const art of GRUPPEN_FOLGE.slice(1)) {
    const x = g.gruppen.find((y) => y.art === art);
    if (x) teile.push(eins(x));
    else if (art === 'postgres') teile.push(g.postgresImContainer ? 'PostgreSQL –' : 'PostgreSQL im eigenen Container – nicht messbar');
    else teile.push(`${GRUPPEN_NAME[art]} 0 %`);
  }
  return `CPU je Gruppe (% eines Kerns, Speicher RSS höchstens): ${teile.filter(Boolean).join(' · ')}`;
}

/** Ausführlich für den Bericht (#895): je Durchgang eine Tabelle mit Gruppe, Prozessen, CPU und Speicher. */
export function gruppenBericht(name, g) {
  if (!g) return [];
  if (!g.verfuegbar) return [`CPU und Speicher je Gruppe „${name}“: nicht verfügbar (nur unter Linux messbar).`];
  const zeilen = [`CPU und Speicher je Gruppe „${name}“ (über ${g.sekunden} s; aus /proc im Container):`, '', '| Gruppe | Prozesse höchstens | CPU (% eines Kerns) | Speicher MB (RSS) höchstens |', '|---|---:|---:|---:|'];
  for (const x of g.gruppen) zeilen.push(`| ${gruppenName(x)} | ${x.anzahlMax} | ${f(x.cpu)} | ${f(x.mbMax)} |`);
  if (!g.gruppen.some((x) => x.art === 'postgres')) zeilen.push(`| PostgreSQL | – | ${g.postgresImContainer ? '–' : 'im eigenen Container – nicht messbar'} | – |`);
  return zeilen;
}

const meldungsSchluessel = (m) => `${m.stufe}\u0000${m.modul}\u0000${m.text}\u0000${m.ausnahme ?? ''}`;
const protokollVon = (s) => s?.engpass?.protokoll ?? null;

/**
 * Warnungen und Fehler eines Durchgangs (#895): Unterschied der Sammlung aller Prozesse (`engpass.protokoll`) zwischen
 * erstem und letztem Stand. Erster Zeitpunkt: bei neuen Arten wie gesammelt, sonst der erste Stand mit mehr. null ohne Angabe.
 */
export function protokollAus(staende) {
  const e = staende.filter((s) => protokollVon(s));
  if (!e.length) return null;
  return protokollZwischen(protokollVon(e[0]), protokollVon(e.at(-1)), e);
}

function protokollZwischen(a, z, staende = []) {
  const vorher = new Map((a?.eintraege ?? []).map((m) => [meldungsSchluessel(m), m.anzahl]));
  const eintraege = [];
  for (const m of z.eintraege ?? []) {
    const k = meldungsSchluessel(m);
    const n = m.anzahl - (vorher.get(k) ?? 0);
    if (n <= 0) continue;
    let erste = vorher.has(k) ? null : m.erste;
    if (!erste) {
      const s = staende.find((x) => (protokollVon(x)?.eintraege ?? []).some((y) => meldungsSchluessel(y) === k && y.anzahl > vorher.get(k)));
      erste = s ? new Date(s.t).toISOString() : m.letzte;
    }
    const dauer = dauerZwischen(a?.eintraege?.find((x) => meldungsSchluessel(x) === k)?.dauer, m.dauer);
    eintraege.push({ stufe: m.stufe, modul: m.modul, text: m.text, ausnahme: m.ausnahme ?? null, anzahl: n, erste, prozesse: m.prozesse ?? [], ...(dauer ? { dauer } : {}) });
  }
  eintraege.sort((x, y) => y.anzahl - x.anzahl || (x.erste < y.erste ? -1 : 1));
  return { gesamt: Math.max(0, (z.gesamt ?? 0) - (a?.gesamt ?? 0)), weitere: Math.max(0, (z.weitere ?? 0) - (a?.weitere ?? 0)), eintraege };
}

/**
 * Dauer gleicher Meldungen zwischen zwei Ständen (#909): Mittel aus Summe und Anzahl der neuen; höchste Dauer aus dem
 * späteren Stand (die Sammlung kennt nur die höchste seit ihrem Start). null ohne Angabe.
 */
export function dauerZwischen(a, z) {
  if (!z || !(z.n > 0)) return null;
  const n = z.n - (a?.n ?? 0), summe = z.summe - (a?.summe ?? 0);
  if (!(n > 0) || !(summe >= 0)) return null;
  return { max: z.max, mittel: Math.round(summe / n), n };
}

/**
 * Text einer Meldung mit Dauer (#909): `<Dauer>` → „1.240 ms“ bzw. „bis 1.240 ms (Ø 610 ms)“; ohne Angabe „… ms“.
 */
export function mitDauer(text, dauer) {
  if (!String(text).includes('<Dauer>')) return text;
  const d = dauer && typeof dauer.max === 'number' ? (dauer.n === 1 || dauer.mittel === dauer.max ? `${zahl(dauer.max)} ms` : `bis ${zahl(dauer.max)} ms (Ø ${zahl(dauer.mittel)} ms)`) : '… ms';
  return String(text).replace('<Dauer>', d);
}

/**
 * Warnungen und Fehler des ganzen Laufs (#895): vom ersten Stand (nach dem Vorbereiten der ersten Stufe) bis zum Ende –
 * mit dem Durchgang, in dem eine Art zuerst auftrat (sonst „zwischen den Durchgängen“), dazu Abstürze und Neustarts mit
 * Grund (Code bzw. Signal, Art der Ausnahme). null ohne Angabe (ältere Fassung).
 */
export function protokollGesamt(anfang, ende, laeufe) {
  const a = protokollVon(anfang), z = protokollVon(ende);
  if (!z) return null;
  const g = protokollZwischen(a, z);
  const imLauf = (zeit) => { const t = Date.parse(zeit); return laeufe.find((x) => t >= x.beginn - 2000 && t <= x.ende + 2000) ?? null; };
  const ort = (k, zeit) => {
    for (const l of laeufe) {
      const m = l.protokoll?.eintraege?.find((x) => meldungsSchluessel(x) === k);
      // Zusammengefasste Meldungen (#920) kommen bis zu einer Minute später an – zählt der Zeitpunkt des ersten Auftretens.
      if (m) return { erste: m.erste, durchgang: (m.erste && imLauf(m.erste)?.name) || l.name };
    }
    const l = imLauf(zeit);
    return { erste: zeit, durchgang: l ? l.name : 'zwischen den Durchgängen' };
  };
  g.eintraege = g.eintraege.map((m) => ({ ...m, ...ort(meldungsSchluessel(m), m.erste) }));
  const n0 = anfang?.engpass?.neustarts?.anzahl, n1 = ende?.engpass?.neustarts?.anzahl;
  const seit = (anfang?.t ?? 0) - 2000;
  g.neustarts = typeof n1 === 'number' ? Math.max(0, n1 - (typeof n0 === 'number' ? n0 : 0)) : null;
  g.neustartListe = (ende?.engpass?.neustarts?.letzte ?? []).filter((x) => Date.parse(x.zeit) >= seit).map((x) => {
    const t = Date.parse(x.zeit);
    const l = laeufe.find((y) => t >= y.beginn - 2000 && t <= y.ende + 2000);
    return { nr: x.nr, grund: `${x.signal ?? `Code ${x.code}`}${x.ausnahme ? `, ${x.ausnahme}` : ''}`, zeit: x.zeit, durchgang: l ? l.name : 'zwischen den Durchgängen' };
  });
  return g;
}

const STUFE_NAME = { warn: 'Warnung', error: 'Fehler', fatal: 'Schwerer Fehler' };
const meldungText = (m) => `${STUFE_NAME[m.stufe] ?? m.stufe} [${m.modul}] ${mitDauer(m.text, m.dauer)}${m.ausnahme ? ` (${m.ausnahme})` : ''}`;
const neustartText = (x) => `Prozess ${x.nr} ${x.grund}`;

/**
 * Eine Zeile für den Ergebnisblock (#895): „Protokoll: 1.234 Warnungen und Fehler, 3 Arten – 1.200× Warnung [http] …
 * · 30× Fehler [dokumente] … (Error ENOENT) · …; Neustarts: Prozess 2 SIGKILL“ bzw. „Protokoll: keine Warnungen und
 * Fehler“. null ohne Angabe.
 */
export function protokollZeile(g) {
  if (!g) return null;
  const neu = g.neustartListe?.length ? `; Neustarts: ${g.neustartListe.map(neustartText).join(', ')}` : g.neustarts ? `; Neustarts: ${g.neustarts}` : '';
  if (!g.gesamt) return `Protokoll: keine Warnungen und Fehler${neu}`;
  const arten = g.eintraege.length + (g.weitere ? 1 : 0);
  return `Protokoll: ${zahl(g.gesamt)} Warnungen und Fehler, ${arten} ${arten === 1 ? 'Art' : 'Arten'} – ${g.eintraege.slice(0, 3).map((m) => `${zahl(m.anzahl)}× ${meldungText(m)}`).join(' · ')}${neu}`;
}

/** Ausführlich für den Bericht (#895): die 20 häufigsten als Tabelle, dazu Abstürze und Neustarts. */
export function protokollBericht(g) {
  if (!g) return [];
  const zelle = (t) => String(t ?? '').replace(/[\\|]/g, (z) => `\\${z}`);
  const uhr = (iso) => (iso ? `${String(iso).slice(11, 19)} UTC` : '–');
  const z = ['Warnungen und Fehler im Protokoll (#895, alle Prozesse; nur Art und Text der Meldung, ohne Einzelheiten):', ''];
  if (!g.gesamt) z.push('Keine Warnungen und Fehler.');
  else {
    z.push('| # | Anzahl | Stufe | Modul | Meldung | Ausnahme | erstmals | Durchgang | Prozesse |', '|---:|---:|---|---|---|---|---|---|---|');
    g.eintraege.slice(0, PROTOKOLL_ANZAHL).forEach((m, i) => z.push(`| ${i + 1} | ${zahl(m.anzahl)} | ${STUFE_NAME[m.stufe] ?? m.stufe} | ${zelle(m.modul)} | ${zelle(mitDauer(m.text, m.dauer))} | ${zelle(m.ausnahme ?? '–')} | ${uhr(m.erste)} | ${zelle(m.durchgang ?? '–')} | ${(m.prozesse ?? []).map((n) => (n === 0 ? 'Haupt' : n)).join(', ') || '–'} |`));
    const rest = g.eintraege.length - PROTOKOLL_ANZAHL;
    if (rest > 0 || g.weitere) z.push('', `Dazu ${rest > 0 ? `${rest} weitere Arten` : ''}${rest > 0 && g.weitere ? ' und ' : ''}${g.weitere ? `${zahl(g.weitere)} Meldungen ohne eigene Zeile (Sammlung voll)` : ''}.`);
  }
  z.push('', `Abstürze und Neustarts von Prozessen: ${g.neustarts === null ? '–' : g.neustarts === 0 ? 'keine' : g.neustarts}`);
  for (const x of g.neustartListe ?? []) z.push(`- ${neustartText(x)} um ${uhr(x.zeit)} (${x.durchgang})`);
  return z;
}
export const PROTOKOLL_ANZAHL = 20;

/**
 * Werte für die Lasttest-Seite (#895) aus den Ständen, die der Durchgang ohnehin alle 2 s holt: CPU und Speicher des
 * Containers in Prozent (wie Werkbank → Systemzustand → Auslastung), p95 der letzten Sekunden, Warteschlange an der
 * Datenbank, CPU je Gruppe (aus den letzten beiden Ständen) und die neuesten Warnungen und Fehler seit `seit`.
 */
export function liveAus(staende, letzteMs, { name, n, seit }) {
  const e = staende.filter((s) => s.engpass);
  const z = e.at(-1), a = e.at(-2);
  const c = z?.container ?? null;
  const sek = a && z ? (z.t - a.t) / 1000 : 0;
  const x0 = a?.engpass?.cpu?.container, x1 = z?.engpass?.cpu?.container;
  const cpu = sek >= 1 && typeof x0 === 'number' && typeof x1 === 'number' && c?.kerne ? Math.min(100, Math.max(0, Math.round(((x1 - x0) / sek / c.kerne) * 1000) / 10)) : null;
  const ga = a?.engpass?.gruppen, gz = z?.engpass?.gruppen;
  let gruppen = null;
  if (gz?.verfuegbar) {
    const vorher = new Map((ga?.verfuegbar ? ga.gruppen : []).map((g) => [gruppeSchluessel(g), g.cpuSekunden]));
    const gs = ga?.verfuegbar ? (gz.zeit - ga.zeit) / 1000 : 0;
    gruppen = gz.gruppen.map((g) => ({ art: g.art, ...(g.art === 'ablago' ? { nr: g.nr, rolle: g.rolle } : {}), anzahl: g.anzahl, mb: g.mb, cpu: vorher.has(gruppeSchluessel(g)) ? prozentKern(g.cpuSekunden - vorher.get(gruppeSchluessel(g)), gs) : null }));
  }
  const meldungen = (protokollVon(z)?.eintraege ?? []).filter((m) => m.letzte >= seit).sort((x, y) => (x.letzte < y.letzte ? 1 : -1)).slice(0, 5)
    .map((m) => { const dauer = dauerZwischen(null, m.dauer); return { stufe: m.stufe, modul: m.modul, text: m.text, ausnahme: m.ausnahme ?? null, anzahl: m.anzahl, letzte: m.letzte, ...(dauer ? { dauer: { max: dauer.max, mittel: dauer.mittel } } : {}) }; });
  const pool = z?.engpass?.pool;
  return {
    name, n, p95: rund(quantil(letzteMs, 0.95)), anfragen: letzteMs.length,
    cpu, speicher: c?.mb != null && c.grenzeMb ? Math.min(100, Math.round((c.mb / c.grenzeMb) * 1000) / 10) : null,
    speicherMb: c?.mb ?? null, grenzeMb: c?.grenzeMb ?? null, ohneGrenze: !!c?.ohneGrenze, kerne: c?.kerne ?? null, kerneBegrenzt: !!c?.kerneBegrenzt,
    warteschlange: pool ? pool.warteschlangeMax : null, belegt: pool ? pool.belegt : null, verbindungen: pool ? pool.max : null,
    gruppen, postgresExtern: !!gz?.verfuegbar && !gz.postgresImContainer, meldungen,
  };
}

const komma = (x, n = 1) => (x === null || x === undefined ? '–' : Number(x).toLocaleString('de-DE', { maximumFractionDigits: n }));
const anteilText = (q) => `${Math.round(q * 100)} %`;
/** Abfrage für die Ausgabe: Leerraum zusammengezogen, auf `max` Zeichen gekürzt (der Server kürzt schon auf 120). */
export const kurzeAbfrage = (q, max = 120) => { const t = String(q ?? '').replace(/\s+/g, ' ').trim(); return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t; };

/**
 * Eine Zeile für den Ergebnisblock (#894): die drei teuersten Abfragen knapp – „Teuerste Abfragen: 41 % 12.300× Ø 4,1 ms
 * SELECT … · 18 % …“; ohne pg_stat_statements der Grund mit Abhilfe. null: keine Angabe (ältere Fassung).
 */
export function abfragenZeile(a) {
  if (!a) return null;
  if (!a.verfuegbar) return `Teuerste Abfragen: – (${a.hinweis ?? 'pg_stat_statements nicht verfügbar'})`;
  if (!a.liste.length) return 'Teuerste Abfragen: keine gezählt';
  return `Teuerste Abfragen: ${a.liste.slice(0, 3).map((q) => `${anteilText(q.anteil)} ${zahl(q.anzahl)}× Ø ${komma(q.mittelMs, 2)} ms ${kurzeAbfrage(q.abfrage, 60)}`).join(' · ')}`;
}

/** Tabelle für den Bericht (#894): die zehn teuersten Abfragen eines Durchgangs mit Gesamtzeit, Anzahl, Mittel, Zeilen, Anteil. */
export function abfragenBericht(name, a) {
  if (!a) return [];
  if (!a.verfuegbar) return [`Teuerste Abfragen „${name}“: – (${a.hinweis ?? 'pg_stat_statements nicht verfügbar'})`];
  const kopf = `Teuerste Abfragen „${name}“ (pg_stat_statements, normalisiert; Rechenzeit aller Abfragen ${komma(a.gesamtMs / 1000)} s${a.zurueckgesetzt ? '' : ` – nicht zurückgesetzt, Werte seit dem letzten Zurücksetzen${a.hinweis ? `: ${a.hinweis}` : ''}`}):`;
  if (!a.liste.length) return [kopf, '', 'Keine Abfragen gezählt.'];
  const zelle = (q) => `\`${kurzeAbfrage(q).replace(/`/g, "'").replace(/[\\|]/g, (z) => `\\${z}`)}\``;
  return [kopf, '', '| # | Abfrage | Gesamt ms | Anzahl | Mittel ms | Zeilen | Anteil |', '|---:|---|---:|---:|---:|---:|---:|',
    ...a.liste.slice(0, ABFRAGEN_ANZAHL).map((q, i) => `| ${i + 1} | ${zelle(q.abfrage)} | ${zahl(Math.round(q.gesamtMs))} | ${zahl(q.anzahl)} | ${komma(q.mittelMs, 2)} | ${zahl(q.zeilen)} | ${anteilText(q.anteil)} |`)];
}

/** Nach der Überlast: wie schnell antwortet das DMS wieder normal? */
async function erholung(v) {
  const t0 = Date.now();
  for (;;) {
    const zeiten = [];
    let fehler = 0;
    await Promise.all(Array.from({ length: 5 }, async () => {
      for (let i = 0; i < 4; i++) {
        const a = naechsteAnfrage(v);
        const s = performance.now();
        try { const r = await anfrage('GET', a.pfad, { cookie: a.cookie, zeit: 10_000 }); await r.arrayBuffer(); if (r.status >= 500) fehler++; zeiten.push(performance.now() - s); } catch { fehler++; }
      }
    }));
    const p95 = quantil(zeiten, 0.95);
    if (!fehler && p95 !== null && p95 <= PFLICHT.erholungP95Ms) return { ms: Date.now() - t0, p95: Math.round(p95) };
    if (Date.now() - t0 > 120_000) return { ms: null, p95: p95 === null ? null : Math.round(p95), fehler };
    await warte(1000);
  }
}

/**
 * Anmeldeschutz unter Last (#240): falsche Passwörter für ein eigenes Konto, von einer eigenen (vorgetäuschten)
 * Adresse über X-Forwarded-For – so sperrt der Test nicht die eigene. Erwartet: nach der Grenze ist auch das
 * richtige Passwort gesperrt.
 */
async function anmeldeschutz() {
  const ip = `10.${randomInt(256)}.${randomInt(256)}.${randomInt(1, 251)}`;
  const koepfe = { 'x-forwarded-for': ip };
  // Abgewiesen (503) zählt nicht als Versuch: wiederholen, bis das DMS das Passwort wirklich geprüft hat.
  const versuch = async (passwort) => {
    for (let i = 0; i < 60; i++) {
      try {
        const r = await anfrage('POST', '/api/konto/anmelden', { body: { email: SPERRKONTO[0], passwort }, koepfe, zeit: 30_000 });
        await r.text();
        if (r.status !== 503) return r.status;
        await warte(Math.min(5000, 1000 * Number(r.headers.get('retry-after') ?? 1)));
      } catch (e) { if (i === 59) return e.name; await warte(1000); }
    }
    return 503;
  };
  const status = [];
  for (let i = 0; i < 6; i++) status.push(await versuch(`falsch-${i}`));
  const richtig = await versuch(SPERRKONTO[1]);
  return { falsch: status, richtig, wirkt: richtig === 429 && !status.includes(200) };
}

/* ---------- Stufen ---------- */

const f = (x) => (x === null || x === undefined ? '–' : String(x));
const sek = (ms) => (ms / 1000).toFixed(1).replace('.', ',');
const prozent = (q) => `${(q * 100).toFixed(2).replace('.', ',')} %`;

/**
 * klein oder mittel: ein Durchgang mit fester Last. `verfehlt` (CI-Grenze, Fehler, 503, Export) bestimmt den
 * Exit-Code, `zielVerfehlt` (p95 über dem Ziel, aber unter der CI-Grenze) steht nur im Bericht.
 */
export function pruefeFesteStufe(name, e) {
  const s = STUFEN[name];
  const verfehlt = [];
  const zielVerfehlt = [];
  if (e.p95 !== null && e.p95 >= s.ciGrenze.p95Ms) verfehlt.push(`${name}: p95 ${e.p95} ms ≥ CI-Grenze ${s.ciGrenze.p95Ms} ms (Ziel < ${s.ziel.p95Ms} ms)`);
  else if (e.p95 !== null && e.p95 >= s.ziel.p95Ms) zielVerfehlt.push(`${name}: p95 ${e.p95} ms ≥ Ziel ${s.ziel.p95Ms} ms (CI-Grenze ${s.ciGrenze.p95Ms} ms eingehalten)`);
  if (s.ziel.fehlerquote === 0 ? e.fehler + e.ohneAntwort > 0 : e.fehlerquote >= s.ziel.fehlerquote) {
    verfehlt.push(`${name}: Fehlerquote ${prozent(e.fehlerquote)} (${e.fehler} Fehler, ${e.ohneAntwort} ohne Antwort) – erlaubt ${s.ziel.fehlerquote === 0 ? 'keine' : `< ${prozent(s.ziel.fehlerquote)}`}`);
  }
  if (e.abgewiesen) verfehlt.push(`${name}: ${e.abgewiesen} Anfragen abgewiesen (503) – bei ${s.gleichzeitig} gleichzeitig darf der Überlastschutz nicht greifen`);
  if (e.exporte.some((x) => x.status !== 200)) verfehlt.push(`${name}: Export fehlgeschlagen (${e.exporte.filter((x) => x.status !== 200).map((x) => x.status).join(', ')})`);
  return { stufe: name, art: 'zusage', durchgang: e, verfehlt, zielVerfehlt };
}

async function festeStufe(v, name, dauer, lauf) {
  const s = STUFEN[name];
  const mitExport = s.export && !hat('--ohne-export');
  const e = pruefeFesteStufe(name, await lauf({ name, n: s.gleichzeitig, dauer, mitExport }));
  // #739: danach derselbe Durchgang mit Schreibanteil – zählt nicht für Ziel, CI-Grenze und Exit-Code.
  if (v.speichern) Object.assign(e, await mitSpeichern(v, lauf, { name: `${name} + Speichern`, n: s.gleichzeitig, dauer, mitExport }));
  return e;
}

/** Durchgang „mit Speichern“ und Aufräumen danach (#739). */
async function mitSpeichern(v, lauf, o) {
  v.speichernZiele ??= await vorbereitenSpeichern(v);
  const runde = schreibrunde(v.speichernZiele);
  const speichern = await lauf({ ...o, speichern: runde });
  return { speichern, aufgeraeumt: await aufraeumen(v, runde) };
}

/** Ziel und CI-Grenze in einem Satz, z. B. „Ziel p95 < 1000 ms, CI-Grenze 1000 ms, Fehler < 0,10 %“. */
export function zielText(name) {
  const s = STUFEN[name];
  return `Ziel p95 < ${s.ziel.p95Ms} ms, CI-Grenze ${s.ciGrenze.p95Ms} ms, ${s.ziel.fehlerquote === 0 ? 'keine Fehler' : `Fehler < ${prozent(s.ziel.fehlerquote)}`}`;
}

/** Kurzurteil einer festen Stufe. */
const urteil = (e) => (e.verfehlt.length ? 'CI-Grenze verfehlt' : e.zielVerfehlt.length ? 'Ziel verfehlt, CI-Grenze eingehalten' : 'Ziel eingehalten');

/**
 * groß: Last stufenweise steigern, bis p95 > 3 s, Fehler > 1 % oder der Überlastschutz greift. Die Grenze ist die
 * höchste Zahl gleichzeitiger Anfragen, bei der das noch nicht passiert ist. Danach 1000 gleichzeitig (wie
 * „Überlast“ in #544) mit Anmeldeschutz nebenher, dann Erholung.
 */
async function grosseStufe(v, lauf, dauer, stufe = 'gross') {
  const s = STUFEN[stufe];
  // Namen der Durchgänge wie bisher („groß 25“, „Überlast 1000“); extrem mit eigenem Namen.
  const kurz = stufe === 'gross' ? 'groß' : stufe;
  const schrittDauer = Number(arg('--schritt-dauer', s.schrittSekunden));
  const bis = Number(arg('--bis', s.hoechstens));
  const start = Number(arg('--start', s.start));
  const schritt = Number(arg('--schritt', s.schritt));
  // Vorgabe 5, 10, dann ab 25 in 25er-Schritten – damit auch eine Grenze unter 25 eine echte Zahl ist (#563).
  // Mit --start beginnt die Steigerung genau dort.
  const stufenfolge = [...(hat('--start') ? [] : s.vorstufen.filter((n) => n < start && n <= bis))];
  for (let n = start; n <= bis; n += schritt) stufenfolge.push(n);
  const schritte = [];
  let grenze = null; let grund = null;
  for (const n of stufenfolge) {
    const e = await lauf({ name: `${kurz} ${n}`, n, dauer: schrittDauer, mitExport: false });
    schritte.push(e);
    grund = e.serverAusfaelle > 2 ? 'Server nicht erreichbar'
      : e.abgewiesen > 0 ? 'Überlastschutz greift (503)'
        : e.fehlerquote > s.abbruch.fehlerquote ? `Fehlerquote ${prozent(e.fehlerquote)} > 1 %`
          : e.p95 !== null && e.p95 > s.abbruch.p95Ms ? `p95 ${e.p95} ms > 3 s` : null;
    if (grund) break;
    grenze = e;
  }
  if (!grund) grund = `höchste geprüfte Last (${bis} gleichzeitig) ohne Abbruch`;
  const schutz = anmeldeschutz();
  const ueberlast = await lauf({ name: `Überlast ${s.ueberlast}${stufe === 'gross' ? '' : ` (${kurz})`}`, n: s.ueberlast, dauer: Math.min(dauer, 60), mitExport: false });
  const anmelde = await schutz;
  const erholt = await erholung(v);
  const verfehlt = [];
  for (const e of [...schritte, ueberlast]) {
    if (e.ohneAntwort > PFLICHT.ohneAntwort) verfehlt.push(`${e.name}: ${e.ohneAntwort} Anfragen ohne Antwort nach ${ANTWORT_MAX_MS / 1000} s`);
    // #920: Die Grenze gilt je Prozess (mit zwei Prozessen nicht für die Summe).
    const sp = speicherVerfehlt(e);
    if (sp) verfehlt.push(sp);
  }
  if (ueberlast.serverAusfaelle > 2) verfehlt.push(`${ueberlast.name}: Server ${ueberlast.serverAusfaelle}-mal nicht erreichbar`);
  if (erholt.ms === null || erholt.ms > PFLICHT.erholungMs) verfehlt.push(`Erholung nach der Überlast: ${erholt.ms === null ? 'keine' : `${erholt.ms} ms`} > ${PFLICHT.erholungMs} ms`);
  if (!anmelde.wirkt) verfehlt.push('Anmeldeschutz wirkt unter Last nicht');
  // #739: nach der Erholung so viele gleichzeitig wie an der Grenze (sonst wie der erste Schritt), mit Schreibanteil.
  // Erst nach allem Bisherigen, damit Schritte, Überlast und Erholung genau so laufen wie vorher.
  const nSpeichern = grenze?.n ?? stufenfolge[0] ?? start;
  const extra = v.speichern ? await mitSpeichern(v, lauf, { name: `${kurz} + Speichern`, n: nSpeichern, dauer: schrittDauer, mitExport: false }) : {};
  return {
    stufe, art: 'messung', schritte, ueberlast, erholung: erholt, anmeldeschutz: anmelde, verfehlt, speicher: speicherHoechstens([...schritte, ueberlast]),
    // Schon der erste Schritt zu viel: Grenze 0 heißt „unter dem ersten Schritt“.
    grenze: grenze ? { gleichzeitig: grenze.n, jeSekunde: grenze.jeSekunde, p95: grenze.p95 } : { gleichzeitig: 0, jeSekunde: 0, p95: null, unter: stufenfolge[0] ?? start },
    grund, ...extra,
  };
}

/**
 * Arbeitsspeicher eines Durchgangs gegen die Pflicht (#920): Die Grenze PFLICHT.speicherMb gilt für einen Prozess. Mit
 * mehreren Prozessen (`engpass.speicherJeProzess`, ohne Hauptprozess) zählt der höchste Prozess gegen die Grenze; die
 * Summe aller Prozesse (mit Hauptprozess) steht daneben mit Grenze × Prozesse. Ohne Angabe je Prozess (ein Prozess,
 * ältere Fassung) zählt die Summe gegen Grenze × 1.
 */
export function speicherJeProzess(e) {
  const liste = (e.engpass?.speicherJeProzess ?? []).filter((p) => p.rolle !== 'haupt' && typeof p.mb === 'number');
  const prozesse = Math.max(1, liste.length);
  return {
    prozesse, summeMb: e.speicherMbMax ?? null, grenzeSummeMb: PFLICHT.speicherMb * prozesse,
    jeProzessMb: liste.length ? Math.max(...liste.map((p) => p.mb)) : null, grenzeJeProzessMb: PFLICHT.speicherMb,
  };
}

/** Verfehlt ein Durchgang die Speicherpflicht (#920)? Text für die Liste „verfehlt“, sonst null. */
export function speicherVerfehlt(e) {
  const s = speicherJeProzess(e);
  if (s.jeProzessMb !== null) {
    return s.jeProzessMb > s.grenzeJeProzessMb ? `${e.name}: Arbeitsspeicher eines Prozesses ${s.jeProzessMb} MB > ${s.grenzeJeProzessMb} MB (je Prozess; zusammen ${f(s.summeMb)} MB bei ${s.prozesse} Prozessen)` : null;
  }
  return s.summeMb !== null && s.summeMb > s.grenzeSummeMb ? `${e.name}: Arbeitsspeicher ${s.summeMb} MB > ${s.grenzeSummeMb} MB (${s.prozesse} Prozess)` : null;
}

/** Höchste Werte über mehrere Durchgänge (#920): Summe, je Prozess, Zahl der Prozesse. */
export function speicherHoechstens(laeufe) {
  const w = laeufe.map(speicherJeProzess);
  const max = (k) => { const x = w.map((y) => y[k]).filter((y) => typeof y === 'number'); return x.length ? Math.max(...x) : null; };
  const prozesse = max('prozesse') ?? 1;
  return { prozesse, summeMb: max('summeMb'), grenzeSummeMb: PFLICHT.speicherMb * prozesse, jeProzessMb: max('jeProzessMb'), grenzeJeProzessMb: PFLICHT.speicherMb };
}

/**
 * „Arbeitsspeicher (Pflicht, #920): je Prozess höchstens 1.300 MB (Grenze 1.536 MB je Prozess) · zusammen höchstens
 * 2.640 MB bei 2 Prozessen (Grenze 2 × 1.536 MB = 3.072 MB)“. Ohne Angabe je Prozess nur die Summe.
 */
export function speicherText(s) {
  const je = s.jeProzessMb === null ? 'je Prozess –' : `je Prozess höchstens ${zahl(s.jeProzessMb)} MB (Grenze ${zahl(s.grenzeJeProzessMb)} MB je Prozess)`;
  const summe = `zusammen höchstens ${s.summeMb === null ? '–' : `${zahl(s.summeMb)} MB`} bei ${s.prozesse} ${s.prozesse === 1 ? 'Prozess' : 'Prozessen'} (Grenze ${s.prozesse} × ${zahl(PFLICHT.speicherMb)} MB = ${zahl(s.grenzeSummeMb)} MB)`;
  return `${je} · ${summe}`;
}

/** Grenze gegenüber dem letzten Lauf: mehr als 20 % schlechter → Warnung (kein Abbruch). */
async function vergleiche(gross) {
  const datei = arg('--vorher');
  if (!datei || !gross) return null;
  let alt;
  try { alt = JSON.parse(await readFile(datei, 'utf8')); } catch { return null; }
  const vorher = alt?.stufen?.find?.((s) => s.stufe === 'gross')?.grenze?.gleichzeitig;
  if (!vorher) return null;
  const jetzt = gross.grenze.gleichzeitig;
  const schlechter = (vorher - jetzt) / vorher;
  return { vorher, jetzt, schlechter, warnung: schlechter > STUFEN.gross.verschlechterung };
}

/* ---------- Bericht und Ergebnisblock ---------- */

const zahl = (n) => Number(n).toLocaleString('de-DE');
const gb = (b) => (b < 1024 ** 3 ? `${Math.round(b / 1024 ** 2)} MB` : `${(b / 1024 ** 3).toFixed(1).replace('.', ',')} GB`);
const dauerText = (s) => (s < 120 ? `${s} s` : `${Math.round(s / 60)} min`);
/** Bisherige Durchgänge – ohne „mit Speichern“; nur sie zählen für die alten Zeilen (Speicher, Schleife). */
const bisherige = (laeufe) => laeufe.filter((l) => !l.speichern);

/** Durchgang „mit Speichern“ im Bericht (#739). */
function speichernBericht(e) {
  const d = e.speichern;
  const abgelehnt = Object.entries(d.abgelehnt ?? {});
  const a = e.aufgeraeumt;
  return [
    `**${d.name}** (${d.n} gleichzeitig, rund 10 % schreibend: Mappe ändern, Stern, Notiz, Aufgabe; 5 % Historie): p50 ${f(d.median)} ms, p95 ${f(d.p95)} ms, p99 ${f(d.p99)} ms, Fehlerquote ${prozent(d.fehlerquote)}; schreibende Anfragen: ${d.schreiben.anfragen}, p50 ${f(d.schreiben.median)} ms, p95 ${f(d.schreiben.p95)} ms${d.jeArt?.Historie ? `; Historie (erste Seite, #800): ${d.jeArt.Historie.anzahl}, p50 ${f(d.jeArt.Historie.median)} ms, p95 ${f(d.jeArt.Historie.p95)} ms` : ''} – Messung ohne Ziel und ohne CI-Grenze.`,
    '', `Median und p95 je Art (${d.name}):`, '', ...Object.entries(d.jeArt).map(([k, w]) => `- ${k}: ${w.anzahl} Anfragen, Median ${w.median} ms, p95 ${w.p95} ms`),
    ...(abgelehnt.length ? ['', `Abgelehnt (4xx): ${abgelehnt.map(([k, n]) => `${k} × ${n}`).join(', ')}.`] : []),
    ...(a ? ['', `Aufgeräumt in ${a.sekunden} s: ${a.werte} Werte zurück, ${a.sterne} Sterne und ${a.notizen} Notizen entfernt, ${a.aufgaben} Aufgaben erledigt${a.fehler ? ` – ${a.fehler} Fehler` : ''}.`] : []),
  ];
}

/** Demo-Daten der Stufe: wie lange das Anlegen dauerte, wie groß Datenbank und Dokumente sind (#739). */
function datenText(e) {
  const { anlegen: a, datenbankBytes: db, dokumenteBytes: dok } = e.daten;
  const angelegt = a ? `${zahl(a.mappen)} Demo-Mappen in ${dauerText(a.sekunden)} angelegt (${a.laeufe} ${a.laeufe === 1 ? 'Lauf' : 'Läufe'}), danach ${dauerText(a.hintergrundSekunden)} Arbeit im Hintergrund` : 'keine neuen Demo-Mappen nötig';
  return `Demo-Daten (${e.stufe}): ${angelegt}; Datenbank ${db === null ? 'nicht lesbar' : gb(db)}, Dokumente ${dok === null ? 'nicht lesbar' : gb(dok)}.`;
}

export function bericht(ergebnisse, x) {
  const z = [];
  z.push(`## Lasttest (${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC)`, '');
  // #1117: welche Fassung gemessen hat (wie im Ergebnisblock).
  if (x.version) z.push(`Ablago-Version: ${x.version}`, '');
  // Ohne Adresse des Ziels: Der Bericht soll sich ohne Netzadressen weitergeben lassen (#563).
  // #918: Mit abgeschalteten Zwischenspeichern ist die Messung nicht mit anderen vergleichbar.
  if (x.zwischenspeicherAus) z.push('**Hinweis:** Zwischenspeicher ausgeschaltet (`DMS_ZWISCHENSPEICHER=aus`) – Zahlen, Trefferzahlen und Termine wurden bei jeder Anfrage frisch gerechnet; nicht mit anderen Läufen vergleichbar.', '');
  if (x.bestand.ohneDatei) z.push(`**Warnung:** Dokumente ohne Datei: ${x.bestand.ohneDatei} – ist \`/data\` als Volume eingebunden? Herunterladen, Vorschau und Export dieser Dokumente schlagen fehl; die Messung ist so nicht vergleichbar.`, '');
  z.push(personenText(x.personen), '');
  z.push(`Bestand: ${x.bestand.gesamt} Mappen (${x.bestand.demo} Demo-Mappen), in den Listen ${x.mappen}, Dokumente ${x.dokumente}.${x.exportPdf ? ` Export nebenher (mittel), einer nach dem anderen: PDF von ${x.exportPdf} Mappen mit Übersicht, PDF von ${x.exportDok} Mappen mit ihren Dokumenten, ZIP der größten Ansicht (${x.exportZip} Mappen).` : ''}`, '');
  z.push('| Durchgang | Gleichzeitig | Anfragen | je s | Median ms | p95 ms | p99 ms | Fehlerquote | abgewiesen (503) | ohne Antwort | Schleife p99/max ms | DB warten p95/max ms | Speicher MB Start/max/Ende |');
  z.push('|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---|---|');
  for (const l of x.laeufe) {
    z.push(`| ${l.name} | ${l.n} | ${l.anfragen} | ${l.jeSekunde} | ${f(l.median)} | ${f(l.p95)} | ${f(l.p99)} | ${prozent(l.fehlerquote)} | ${l.abgewiesen}${l.abgewiesen ? ` (${l.retryAfter} mit Retry-After)` : ''} | ${l.ohneAntwort} | ${f(rund(l.schleifeP99))} / ${f(rund(l.schleifeMax))} | ${f(rund(l.dbWartenP95))} / ${f(rund(l.dbWartenMax))} | ${f(l.speicherMbStart)} / ${f(l.speicherMbMax)} / ${f(l.speicherMbEnde)} |`);
  }
  // Wo es hakt (#874): je Durchgang über alle Prozesse.
  const mitEngpass = x.laeufe.filter((l) => l.engpass);
  if (mitEngpass.length) {
    z.push('', 'Engpass je Durchgang (#874, über alle Prozesse; CPU in % eines Kerns):', '');
    for (const l of mitEngpass) z.push(`- ${l.name}: ${engpassText(l.engpass)}${fehlerText(l) ? ` · Fehler: ${fehlerText(l)}` : ''}`);
  }
  // Teuerste Abfragen (#894): je Durchgang die zehn teuersten.
  for (const l of x.laeufe.filter((y) => y.abfragen)) z.push('', ...abfragenBericht(l.name, l.abfragen));
  // Wer belegt die CPU (#895): je Durchgang nach Gruppen.
  for (const l of x.laeufe.filter((y) => y.gruppen)) z.push('', ...gruppenBericht(l.name, l.gruppen));
  // Warnungen und Fehler aus dem Protokoll (#895): die 20 häufigsten des ganzen Laufs, Abstürze und Neustarts.
  if (x.protokoll) z.push('', ...protokollBericht(x.protokoll));
  for (const l of x.laeufe.filter((y) => y.exporte.length)) {
    z.push('', `Exporte im Durchgang „${l.name}“: ${l.exporte.map((e) => `${e.art.toUpperCase()} ${e.status} ${(e.ms / 1000).toFixed(1)} s ${e.mb} MB`).join(' · ')}`);
  }
  for (const e of ergebnisse) {
    if (e.art === 'zusage') {
      const s = STUFEN[e.stufe];
      z.push('', `**${e.stufe}** (${s.bildet}, ${s.gleichzeitig} gleichzeitig${s.export ? ', Export nebenher' : ''}): ${zielText(e.stufe)} – p95 ${f(e.durchgang.p95)} ms: ${e.verfehlt.length ? 'CI-Grenze VERFEHLT' : urteil(e)}.`);
      z.push('', `Median und p95 je Art (${e.stufe}):`, '', ...Object.entries(e.durchgang.jeArt).map(([k, w]) => `- ${k}: ${w.anzahl} Anfragen, Median ${w.median} ms, p95 ${w.p95} ms`));
    } else {
      // gross wie bisher; extrem mit eigener Überschrift (#739).
      const titel = e.stufe === 'gross' ? '**groß** (Belastungsgrenze)' : `**${e.stufe}** (${STUFEN[e.stufe].bildet}, Belastungsgrenze)`;
      z.push('', e.grenze.unter
        ? `${titel}: schon **${e.grenze.unter} gleichzeitige Anfragen** sind zu viel: ${e.grund}.`
        : `${titel}: Grenze bei **${e.grenze.gleichzeitig} gleichzeitigen Anfragen** (${e.grenze.jeSekunde} Anfragen je Sekunde, p95 ${f(e.grenze.p95)} ms); danach: ${e.grund}.`);
      z.push(`Schritte: ${e.schritte.map((d) => `${d.n} → p95 ${f(d.p95)} ms`).join(' · ')}.`);
      if (x.vergleich && e.stufe === 'gross') z.push(`Letzter Lauf: ${x.vergleich.vorher} gleichzeitig – ${x.vergleich.warnung ? `**WARNUNG: ${Math.round(x.vergleich.schlechter * 100)} % schlechter**` : `Abweichung ${Math.round(-x.vergleich.schlechter * 100)} %`}.`);
      z.push(`Erholung nach ${STUFEN[e.stufe].ueberlast} gleichzeitig: ${e.erholung.ms === null ? 'nicht innerhalb von 120 s' : `nach ${sek(e.erholung.ms)} s`} (p95 ${f(e.erholung.p95)} ms).`);
      z.push(`Anmeldeschutz unter Last: falsche Passwörter → ${e.anmeldeschutz.falsch.join(', ')}; danach richtiges Passwort → ${e.anmeldeschutz.richtig} – ${e.anmeldeschutz.wirkt ? 'wirkt' : 'WIRKT NICHT'}.`);
      if (e.speicher) z.push(`Arbeitsspeicher (Pflicht): ${speicherText(e.speicher)}.`);
    }
    if (e.speichern) z.push('', ...speichernBericht(e));
    if (e.daten) z.push('', datenText(e));
  }
  const verfehlt = ergebnisse.flatMap((e) => e.verfehlt);
  const ziel = ergebnisse.flatMap((e) => e.zielVerfehlt ?? []);
  if (verfehlt.length) z.push('', '**CI-Grenze oder Pflicht verfehlt:**', '', ...verfehlt.map((v) => `- ${v}`));
  else if (x.geprueft) z.push('', 'Alle CI-Grenzen und Pflichten eingehalten.');
  if (ziel.length) z.push('', '**Ziel verfehlt** (der Lauf wird deshalb nicht rot; Folge-Issue „Beschleunigen“, #563):', '', ...ziel.map((v) => `- ${v}`));
  return z.join('\n');
}

/**
 * Hinweis zu den Konten der Personen (#920) für den Bericht: Seitdem misst der Test mit einem Konto je Person – frühere
 * Werte (drei geteilte Konten) sind vor allem bei „+ Speichern“ nicht direkt vergleichbar.
 */
export function personenText(n) {
  if (!n) return 'Simulierte Personen: drei geteilte Konten (Administrator, Mitglied mit und ohne Rolle).';
  return `Simulierte Personen (#920): je Person ein eigenes Konto mit eigener Sitzung – ${n} Konten (zwei von drei mit der Rolle „Steuern und Finanzen“, eines von drei ohne Rolle), bei mehr gleichzeitigen Personen reihum. Messungen ohne diese Zeile teilten sich drei Konten und sind – vor allem „+ Speichern“ – nicht direkt vergleichbar.`;
}

/** Zeile für den Ergebnisblock (#920): woran man Messungen mit eigenen Konten erkennt. */
export const personenZeile = (n) => (n ? `Personen: je Person ein eigenes Konto (${n} Konten, reihum; seit #920)` : null);

/** Was der Server über sich sagt (ohne Adressen und Namen). */
export async function umgebung(cookie) {
  const s = await json('GET', '/api/werkbank/system', { cookie }).then((r) => r.daten, () => null);
  const l = await json('GET', '/api/werkbank/systemlast', { cookie }).then((r) => r.daten, () => null);
  // Das CPU-Modell kennt nur der Rechner, auf dem der Test läuft – also nur, wenn er im selben Container bzw. auf
  // demselben Gerät läuft (Ziel 127.0.0.1/localhost).
  const lokal = /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:|\/|$)/.test(BASIS);
  return {
    version: s?.dms?.version ?? null,
    image: s?.dms?.variante === 'komplett' ? 'dms-komplett' : s?.laufzeit?.container ? 'dms' : 'ohne Container',
    datenbank: l ? (l.datenbankImContainer ? 'im Container' : 'getrennt') : null,
    architektur: s?.laufzeit?.architektur ?? null,
    cpu: lokal ? cpus()[0]?.model?.replace(/\s+/g, ' ').trim() ?? null : null,
    kerne: l?.kerne ?? null, kerneBegrenzt: l?.kerneBegrenzt ?? null, rechnerKerne: l?.hostKerne ?? null,
    ramGb: l?.speicher?.grenze ? Math.round((l.speicher.grenze / 1024 ** 3) * 10) / 10 : null, ramBegrenzt: l ? !l.speicher.ohneGrenze : null,
    zwischenspeicher: l?.zwischenspeicher ?? null,
    grenzen: l?.grenzen ? Object.fromEntries(Object.entries(l.grenzen).map(([k, g]) => [g.variable, `${g.wert}${g.quelle === 'umgebung' ? ' (gesetzt)' : ''}`])) : null,
  };
}

/**
 * Platzhalter für Gerät und Speicher im Ergebnisblock des Lasttest-Modus (#612): Die Seite im Browser setzt dort ein,
 * was man ins Feld „Beschreibe dein Gerät“ tippt bzw. welche Speicherart erkannt oder gewählt ist.
 */
export const PLATZHALTER = { geraet: '{{geraet}}', speicher: '{{speicher}}' };

/**
 * Ergebnis zum Kopieren (#563): ohne personenbezogene Daten, ohne Adressen, Rechner- oder Haushaltsnamen. Gerät
 * und Speicher trägt man mit --geraet und --speicher ein (oder im Formular „Messergebnis Lasttest“); im
 * Lasttest-Modus stehen dort die PLATZHALTER.
 */
export function ergebnisblock(ergebnisse, x, u, angaben = { geraet: arg('--geraet'), speicher: arg('--speicher') }) {
  const kz = ['```text', 'Messergebnis Lasttest (#563)'];
  const nv = 'bitte ergänzen';
  kz.push(`Ablago-Version: ${f(u.version)} · Image: ${u.image} · Datenbank: ${f(u.datenbank)}`);
  kz.push(`Gerät/Modell: ${angaben.geraet ?? nv}`);
  kz.push(`CPU: ${u.cpu ?? nv} · ${f(u.kerne)} Kerne für Ablago${u.kerneBegrenzt ? ' (Grenze des Containers)' : ''}, Rechner ${f(u.rechnerKerne)} · ${f(u.architektur)}`);
  kz.push(`RAM: ${u.ramGb === null ? nv : `${String(u.ramGb).replace('.', ',')} GB${u.ramBegrenzt ? ' (Grenze des Containers)' : ''}`} · Speicher: ${angaben.speicher ?? `${nv} (HDD/SSD/NVMe)`}`);
  kz.push(`Bestand: ${x.bestand.gesamt} Mappen, ${x.dokumente} Dokumente (PDF)`);
  if (u.grenzen) kz.push(`Einstellungen: ${Object.entries(u.grenzen).map(([k, w]) => `${k}=${w}`).join(', ')}`);
  if (personenZeile(x.personen)) kz.push(personenZeile(x.personen));
  if (u.zwischenspeicher === 'aus') kz.push('Zwischenspeicher: aus (DMS_ZWISCHENSPEICHER=aus)');
  for (const e of ergebnisse) {
    if (e.art === 'zusage') {
      const d = e.durchgang;
      kz.push(`${e.stufe.padEnd(6)} ${String(d.n).padStart(4)} gleichzeitig: p50 ${f(d.median)} ms, p95 ${f(d.p95)} ms, p99 ${f(d.p99)} ms, Fehler ${prozent(d.fehlerquote)} – ${urteil(e)} (Ziel < ${STUFEN[e.stufe].ziel.p95Ms} ms, CI-Grenze ${STUFEN[e.stufe].ciGrenze.p95Ms} ms)`);
    } else {
      kz.push(`${(e.stufe === 'gross' ? 'groß' : e.stufe).padEnd(6)} Grenze: ${e.grenze.unter ? `unter ${e.grenze.unter}` : e.grenze.gleichzeitig} gleichzeitig (${e.grenze.jeSekunde}/s, p95 ${f(e.grenze.p95)} ms), Abbruch: ${e.grund}; Erholung ${e.erholung.ms === null ? 'keine' : `${sek(e.erholung.ms)} s`}`);
    }
    // #874: Engpass des Durchgangs (bei groß: der Schritt an der Grenze) – eigene Zeile, die bisherige bleibt.
    const haupt = e.art === 'zusage' ? e.durchgang : e.schritte?.find((d) => d.n === e.grenze.gleichzeitig);
    if (haupt?.engpass) kz.push(`  Engpass ${haupt.name}: ${engpassText(haupt.engpass)}`);
    // Fehlerarten (#874): beim Durchgang selbst und – bei groß – beim Schritt, an dem es abbrach.
    const abbruch = e.art === 'messung' ? e.schritte?.at(-1) : null;
    if (haupt && fehlerText(haupt)) kz.push(`  Fehler ${haupt.name}: ${fehlerText(haupt)}`);
    if (abbruch && abbruch !== haupt) {
      if (abbruch.engpass) kz.push(`  Engpass ${abbruch.name} (Abbruch): ${engpassText(abbruch.engpass)}`);
      if (fehlerText(abbruch)) kz.push(`  Fehler ${abbruch.name} (Abbruch): ${fehlerText(abbruch)}`);
    }
    // #894: je Stufe die drei teuersten Abfragen (bei groß: an der Grenze, sonst beim ersten Schritt); ausführlich im Bericht.
    const mitAbfragen = haupt ?? e.schritte?.[0];
    if (abfragenZeile(mitAbfragen?.abfragen)) kz.push(`  ${abfragenZeile(mitAbfragen.abfragen).replace(/^Teuerste Abfragen/, `Teuerste Abfragen ${mitAbfragen.name}`)}`);
    // #895: CPU und Speicher je Gruppe – eigene Zeile beim selben Durchgang; ausführlich im Bericht.
    if (gruppenText(mitAbfragen?.gruppen)) kz.push(`  ${gruppenText(mitAbfragen.gruppen).replace(/^CPU je Gruppe/, `CPU je Gruppe ${mitAbfragen.name}`)}`);
    // #739: neue Zeilen unter der bisherigen – die bisherige bleibt genau so.
    if (e.speichern) kz.push(speichernZeile(e.speichern));
    if (e.speichern?.engpass) kz.push(`  Engpass ${e.speichern.name}: ${engpassText(e.speichern.engpass)}`);
    if (e.speichern && fehlerText(e.speichern)) kz.push(`  Fehler ${e.speichern.name}: ${fehlerText(e.speichern)}`);
    if (e.stufe === 'extrem' && e.daten) kz.push(`extrem Demo-Daten: ${datenText(e).replace(/^Demo-Daten \(extrem\): /, '')}`);
  }
  // Wie bisher nur über die bisherigen Durchgänge; „mit Speichern“ in einer eigenen Zeile (#739).
  const alle = bisherige(x.laeufe);
  const spitze = Math.max(0, ...alle.map((l) => l.speicherMbMax ?? 0));
  const schleife = Math.max(0, ...alle.map((l) => l.schleifeP99 ?? 0));
  kz.push(`Arbeitsspeicher Ablago höchstens: ${spitze} MB · Ereignisschleife p99 höchstens: ${Math.round(schleife)} ms`);
  // #920: Die Pflicht gilt je Prozess – beides nennen.
  const sp = speicherHoechstens(alle);
  if (sp.jeProzessMb !== null) kz.push(`Arbeitsspeicher je Prozess höchstens: ${sp.jeProzessMb} MB bei ${sp.prozesse} ${sp.prozesse === 1 ? 'Prozess' : 'Prozessen'} (Pflicht je Prozess ≤ ${PFLICHT.speicherMb} MB, zusammen ≤ ${sp.prozesse} × ${PFLICHT.speicherMb} MB)`);
  kz.push(containerZeile(alle));
  const mit = x.laeufe.filter((l) => l.speichern);
  if (mit.length) kz.push(`Mit Speichern: Arbeitsspeicher Ablago höchstens: ${Math.max(0, ...mit.map((l) => l.speicherMbMax ?? 0))} MB · Ereignisschleife p99 höchstens: ${Math.round(Math.max(0, ...mit.map((l) => l.schleifeP99 ?? 0)))} ms`);
  // #895: Warnungen und Fehler des ganzen Laufs – eine Zeile, die 20 häufigsten im Bericht.
  if (protokollZeile(x.protokoll)) kz.push(protokollZeile(x.protokoll));
  kz.push(`Gemessen: ${new Date().toISOString().slice(0, 10)}`, '```');
  return kz.join('\n');
}

/** „mittel + Speichern  100 gleichzeitig: p50 …, p95 …, p99 …, Fehler … – Messung ohne Ziel (Speichern p95 … ms)“ (#739). */
export function speichernZeile(d) {
  return `${d.name} ${String(d.n).padStart(4)} gleichzeitig: p50 ${f(d.median)} ms, p95 ${f(d.p95)} ms, p99 ${f(d.p99)} ms, Fehler ${prozent(d.fehlerquote)} – Messung ohne Ziel (Speichern p50 ${f(d.schreiben?.median)} ms, p95 ${f(d.schreiben?.p95)} ms)`;
}

/**
 * „Arbeitsspeicher Container höchstens: 1950 MB (davon Programme 1700 MB, Dateizwischenspeicher 250 MB; PostgreSQL
 * 600 MB)“ (#696) – der Wert, den die NAS für den Container anzeigt. Ohne lesbare cgroup: „nicht verfügbar“.
 */
export function containerZeile(laeufe) {
  const c = laeufe.map((l) => l.container).filter((x) => x && typeof x.mb === 'number').sort((a, b) => b.mb - a.mb)[0];
  if (!c) return 'Arbeitsspeicher Container höchstens: nicht verfügbar';
  const teile = [c.programmeMb != null ? `Programme ${c.programmeMb} MB` : null, c.zwischenspeicherMb != null ? `Dateizwischenspeicher ${c.zwischenspeicherMb} MB` : null].filter(Boolean);
  const db = c.datenbankMb != null ? `PostgreSQL ${c.datenbankMb} MB` : null;
  const klammer = [teile.length ? `davon ${teile.join(', ')}` : null, db].filter(Boolean).join('; ');
  return `Arbeitsspeicher Container höchstens: ${c.mb} MB${klammer ? ` (${klammer})` : ''}`;
}

/* ---------- Ablauf ---------- */

async function messen(stufen) {
  const dauer = Number(arg('--dauer', 120));
  const laeufe = [];
  const lauf = async (o) => {
    console.log(`Durchgang „${o.name}“: ${o.n} gleichzeitig, ${o.dauer} s …`);
    melde({ art: 'durchgang', name: o.name, n: o.n, dauer: o.dauer });
    const e = await durchgang(v, o);
    console.log(`  p95 ${e.p95} ms, Fehlerquote ${prozent(e.fehlerquote)}, abgewiesen ${e.abgewiesen}, ohne Antwort ${e.ohneAntwort}`);
    melde({ art: 'durchgang-fertig', name: o.name, n: o.n, p95: e.p95, fehlerquote: e.fehlerquote });
    laeufe.push(e); await warte(5000); return e;
  };
  const ergebnisse = [];
  let v = null; let bestand = null; let x = null;
  /** #895: Stand des Protokolls aller Prozesse vor dem ersten Durchgang – gezählt wird, was danach dazukommt. */
  let protokollAnfang = null;
  for (const s of stufen) {
    melde({ art: 'stufe', stufe: s, nr: stufen.indexOf(s) + 1, von: stufen.length });
    bestand = await sicherstellen(mappenFuer(s));
    // Sitzungen der Personen aus der vorigen Stufe nicht liegen lassen (#920).
    await personenAbmelden(v);
    v = await vorbereiten();
    protokollAnfang ??= { t: Date.now(), ...(await serverStand(v.sitzungen.admin)) };
    // „mit Speichern“ (#739): Die Ziele holt erst der Durchgang selbst – der bisherige startet genau wie vorher.
    v.speichern = !hat('--ohne-speichern');
    console.log(`Stufe ${s}: ${bestand.gesamt} Mappen; vorbereitet: ${v.mappen.length} Mappen, ${v.dokumente.length} Dokumente, ${v.ansichten.length} Ansichten.`);
    x = { ...(x ?? {}), mappen: v.mappen.length, dokumente: v.dokumente.length, ...(STUFEN[s].export ? { exportPdf: v.exportPdf.length, exportDok: v.dokMappen.length, exportZip: v.exportSicht.n } : {}) };
    const e = GRENZSTUFEN.has(s) ? await grosseStufe(v, lauf, dauer, s) : await festeStufe(v, s, dauer, lauf);
    // Dauer des Anlegens und Größe von Datenbank und Dokumenten (#739) – erst nach der Messung gefragt.
    e.daten = { anlegen: bestand.anlegen, ...await datenStand(v.sitzungen.admin) };
    ergebnisse.push(e);
  }
  x = { ...x, bestand, laeufe, geprueft: hat('--grenzen'), personen: v.personen?.length ?? 0 };
  // #895: Warnungen und Fehler des ganzen Laufs, Abstürze und Neustarts mit Grund.
  x.protokoll = protokollGesamt(protokollAnfang, { t: Date.now(), ...(await serverStand(v.sitzungen.admin)) }, laeufe);
  x.vergleich = await vergleiche(ergebnisse.find((e) => e.stufe === 'gross'));
  const u = await umgebung(v.sitzungen.admin);
  await personenAbmelden(v);
  x.zwischenspeicherAus = u.zwischenspeicher === 'aus';
  x.version = u.version;
  const text = `${bericht(ergebnisse, x)}\n\n### Ergebnis zum Kopieren\n\nOhne Namen und Adressen – zum Einfügen in das Formular „Messergebnis Lasttest“.\n\n${ergebnisblock(ergebnisse, x, u)}`;
  console.log(`\n${text}`);
  await melde({ art: 'ergebnis', bericht: bericht(ergebnisse, x), vorlage: ergebnisblock(ergebnisse, x, u, PLATZHALTER), verfehlt: ergebnisse.some((e) => e.verfehlt.length) });
  if (x.vergleich?.warnung) {
    const w = `Belastungsgrenze ${Math.round(x.vergleich.schlechter * 100)} % schlechter als beim letzten Lauf (${x.vergleich.vorher} → ${x.vergleich.jetzt} gleichzeitig).`;
    console.log(process.env.GITHUB_ACTIONS ? `::warning title=Lasttest groß::${w}` : `WARNUNG: ${w}`);
  }
  for (const z of ergebnisse.flatMap((e) => e.zielVerfehlt ?? [])) console.log(process.env.GITHUB_ACTIONS ? `::notice title=Lasttest Ziel verfehlt::${z}` : `HINWEIS: Ziel verfehlt – ${z}`);
  if (arg('--bericht')) await writeFile(arg('--bericht'), `${text}\n`);
  if (arg('--json')) await writeFile(arg('--json'), JSON.stringify({ stufen: ergebnisse.map(({ durchgang: _d, schritte: _s, ueberlast: _u, speichern: _sp, ...r }) => r), laeufe, umgebung: u, bestand, vergleich: x.vergleich, protokoll: x.protokoll }, null, 2));
  if (x.geprueft && ergebnisse.some((e) => e.verfehlt.length)) process.exitCode = 1;
}

/** Ein einzelner Durchgang mit n gleichzeitig (Entwicklung, z. B. vorher/nachher). */
async function einzeln(n) {
  const bestand = await sicherstellen(Number(arg('--mappen', STUFEN.mittel.mappen)));
  const v = await vorbereiten();
  // --mit-speichern: derselbe Durchgang mit Schreibanteil (#739), danach aufräumen.
  const runde = hat('--mit-speichern') ? schreibrunde(await vorbereitenSpeichern(v)) : null;
  const e = await durchgang(v, { name: `${n} gleichzeitig${runde ? ' + Speichern' : ''}`, n, dauer: Number(arg('--dauer', 120)), mitExport: !hat('--ohne-export'), speichern: runde });
  const aufgeraeumt = runde ? await aufraeumen(v, runde) : undefined;
  await personenAbmelden(v);
  console.log(JSON.stringify({ bestand, ...e, exporte: e.exporte.length, aufgeraeumt }, null, 2));
}

/**
 * Mappen der Stufe; extrem mit --mappen 500000 oder 1000000 (#739). Kleinere Zahlen gehen zum Ausprobieren (der Bericht
 * nennt den Bestand); für die übrigen Stufen bleibt der Bestand fest.
 */
export function mappenFuer(stufe, wert = arg('--mappen')) {
  if (stufe !== 'extrem' || wert === undefined) return STUFEN[stufe].mappen;
  const n = Number(String(wert).replace(/[._]/g, ''));
  if (!Number.isInteger(n) || n < 1) throw new Abbruch(`--mappen „${wert}“ ist keine Anzahl. Für extrem: ${STUFEN.extrem.mappenWahl.join(' oder ')}.`);
  if (!STUFEN.extrem.mappenWahl.includes(n)) console.log(`Hinweis: extrem mit ${n} Mappen – zum Ausprobieren; gemessen wird mit ${STUFEN.extrem.mappenWahl.map(zahl).join(' oder ')}.`);
  return n;
}

const ALT = { normal: 'mittel', ueberlast: 'gross' };
// Nur als Programm starten, nicht beim Import (Test der Grenzen: lasttest-grenzen.test.ts).
const direkt = (() => { try { return !!process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url); } catch { return false; } })();
if (direkt) {
  const wahl = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : arg('--stufe', hat('--einrichten') ? 'einrichten' : 'alle');
  try {
    if (hat('--pruefen')) {
      const p = await pruefen();
      console.log(p.frisch ? 'Frische Installation – der Lasttest richtet sie selbst ein.' : `Test-Installation des Lasttests (${p.bestand.demo} Demo-Mappen).`);
    } else if (wahl === 'einrichten' || hat('--einrichten')) console.log(await sicherstellen(Number(arg('--mappen', STUFEN.mittel.mappen))));
    else if (arg('--gleichzeitig')) await einzeln(Number(arg('--gleichzeitig')));
    else {
      const stufe = ALT[wahl] ?? wahl;
      const stufen = stufe === 'alle' ? ['klein', 'mittel', 'gross'] : [stufe];
      if (!stufen.every((s) => s in STUFEN)) throw new Abbruch(`Unbekannte Stufe „${wahl}“. Möglich: klein, mittel, gross, extrem, alle.`);
      await messen(stufen);
    }
  } catch (e) {
    await vorlaufStoppen();
    if (!(e instanceof Abbruch)) { await melde({ art: 'fehler', text: e instanceof Error ? e.message : String(e) }); throw e; }
    await melde({ art: 'abbruch', text: e.message });
    console.error(`Abbruch: ${e.message}`);
    process.exitCode = 2;
  } finally {
    // #1117: z. B. nach --einrichten oder --gleichzeitig ohne Durchgang nichts mehr schicken.
    await vorlaufStoppen();
  }
}
