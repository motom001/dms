import { existsSync } from 'node:fs';
import { liesMail, verbindeImap } from './imap';
import { Postfaecher } from './postfach';
import { PostfachOAuth } from './postfach-oauth';
import { Anmeldesperre } from './anmeldesperre';
import { Zweifaktor } from './zweifaktor';
import { Konsolenzugang, lokaleUrl } from './konsole';
import { Oidc } from './oidc';
import { Eingangsordner } from './eingangsordner';
import { Webdav } from './webdav';
import { pgWebhookRepo, Webhooks } from './webhook';
import { Automatisierungen, pgAutomatisierungRepo } from './automatisierung';
// Dann-Karten „Feld ändern“ und „Aufgabe / Benachrichtigung“ (#676) melden sich beim Motor an.
import './automatisierung-karten';
import { einbettenAus } from './koepfe';
import { proxyVertrauen } from './proxy';
import { mkdir, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { migriere, NeuereDatenbankFehler, verbinde, VERBINDUNGEN_LEITER_MIN, VERBINDUNGEN_MIN, VERBINDUNGEN_RESERVE, verbindungenAus, verbindungenFuer, verbindungsaufteilung, Verbindungswarten } from './db';
import { Poolmessung, sitzungsstand } from './poolmessung';
import { abfragenZuruecksetzen, teuersteAbfragen } from './abfragestatistik';
import { teileZwischenspeicher } from './zwischenspeicher';
import { Dienst } from './dienst';
import { beiFehlenderDatei, mitPruefung, ordnerSpeicher } from './dateispeicher';
import { Speicherplatz, type SpeicherplatzDeps } from './speicherplatz';
import { baueApp } from './http';
import { Konten } from './konten';
import { kuerzeIp } from './abruf';
import { pgKontoRepo } from './konto-repo';
import { Messung, pgMessSpeicher } from './messung';
import { extern, pgExternSpeicher } from './externmessung';
import { protokoll } from './protokoll';
import { pgSystemQuelle } from './system';
import { Designs, pgDesignRepo } from './designs';
import { ApiSchluesselDienst, pgApiSchluesselRepo } from './apischluessel';
import { pgRepo } from './repo-pg';
import { lebenszeichen, pgKurzzustand } from './kurzzustand';
import { Betrieb, pgBetriebSpeicher } from './betrieb';
import { Tresor } from './tresor';
import { pruefeOrdner, SCHLUESSELDATEI } from './ordner';
import { alsUrl, ANBINDUNG_DATEI, AnbindungVerwaltung, ausUrl, ausVariablen, DATENBANK_RETTEN, datenbankOhneVolume, datenbankVomImage, liesAnbindung, pruefeAnbindung, schreibeAnbindung, umgebungAusCompose, type Anbindung } from './anbindung';
import { Einrichtungscode } from './einrichtungscode';
import { einrichtungsmodus } from './einrichtungsmodus';
import { Einrichtung } from './einrichtung';
import { bestimmeMandant, mandantNamen } from './mandant';
import { ordnerAblage, Vorschaubilder } from './vorschau';
import { Dateiumwandlung, fassungsOrdner, ordnerFassungen, zieheFassungenUm } from './dateiumwandlung';
import { PdfEntsperren } from './entsperren';
import { Archivfassung, archivOrdner, ordnerArchiv, woerterOrdner } from './archivfassung';
import { Texterkennung } from './texterkennung';
import { Paketlaeufer } from './laeufer/verwaltung';
import { hatSchnittstelle } from '../../shared/src/pakete';
import { adressfelder } from '../../shared/src/paketeinstellungen';
import { beendeArbeiter, richteArbeiterEin } from './arbeit';
import { richteZwischenspeicherEin } from './zaehlerspeicher';
import { richteHintergrundEin } from './hintergrund';
import { maxAnfragenAus, Ueberlastschutz } from './ueberlast';
import { Systemlast } from './systemlast';
import { liesErweiterungen, sichereErweiterungen } from './erweiterungen';
import { Paketverwaltung } from './pakete';
import { Aufgabenmail } from './aufgabenmail';
import { RegionDienst } from './region';
import { SprachDienst } from './sprachwahl';
import { Sprachpakete } from './sprachpakete';
import { Fehlermeldungen, pgFehlerRepo } from './fehlermeldungen';
import { Fachfehler } from './fehler';
import { mitSpracheVon, t, tAuto, tDe } from './sprache';
import { Wartung } from './wartung';
import { Notfallzugang } from './notfall';
import { Notfallcode } from './notfallcode';
import type { Benutzer } from '../../shared/src/model';
import { anVerwaltende, mailText } from './mail';
import { Verwaltung } from './verwaltung';
import { arch, release, type } from 'node:os';
import { pgDatenquelle } from './datenbankabzug';
import { pgEinstellungen } from './einstellungen';
import { protokolliereKennungsUmzug } from './mappentypen/index';
import { istUuid } from './repo';
import { Sicherung } from './sicherung';
import { eigeneVersion } from './system';
import { Wiederherstellung } from './wiederherstellung';
import { heuteIn } from '../../shared/src/sichten';
import { VARIABLEN_GRUND } from '../../shared/src/umgebungsvariablen';
import { createServer, type Server } from 'node:http';
import { Lasttestmodus, lasttestAus, lasttestSkript, pruefeZiel } from './lasttestmodus';
import { Prozessgruppen, type GruppenStand } from './prozessgruppen';
import { erkenneSpeicherart } from './speicherart';
import { alterExportOrdner, exportOrdnerVon, exportOrt, merkeUmzug, raeumeExporteAuf, zieheExporteUm } from './exportordner';
import { Startmodus } from './startmodus';
import { raeumeHochladenAuf, richteHochladenEin } from './hochladen';
import { PROZESSE_MAX, prozesseAus, verbundFuerProzess } from './prozesse';
import { setzeLasttestModus } from './protokollsammlung';
import { teileArbeit, UPLOAD_ALTER_MS } from './aufteilung';
import { Fernlaeufer } from './laeufer/fern';
import type { PaketLaeufer } from './pakete';
import { paketEinstellungen, paketSpeicher, setzePaketSpeicher } from './pakete/index';

const pfad = (rel: string) => fileURLToPath(new URL(rel, import.meta.url));
const env = process.env;

const cfg = {
  port: Number(env.PORT ?? 3000),
  host: env.HOST ?? '0.0.0.0',
  web: env.WEB_DIR ?? pfad('../../web/dist'),
  migrationen: env.MIGRATIONS_DIR ?? pfad('../migrations'),
  /** Mandant (früher HAUSHALT_ID): steht nach dem Verbinden fest (#119). */
  haushalt: '',
  proxy: proxyVertrauen(env.TRUST_PROXY),
  /** Einbetten in fremde Seiten (#239). */
  einbetten: einbettenAus(env.DMS_EINBETTEN),
};

const log = protokoll.modul('system');
// Feste Ordner (#115): nur über die Volumes der Compose-Datei zugeordnet.
const ordnerPruefung = pruefeOrdner(env, pfad('../../data'));
const { ordner } = ordnerPruefung;
const version = env.DMS_VERSION ?? 'Entwicklung';
// Mehrere Prozesse (#745): Rolle dieses Prozesses. Mit einem Prozess (Vorgabe) ist er Leiter und erledigt alles selbst.
const prozessEinstellung = prozesseAus(env);
const verbund = await verbundFuerProzess();
const { leiter } = verbund;
// Zwischenspeicher (#874): mit mehreren Prozessen bekommt jeder seinen Anteil, zusammen wie mit einem.
teileZwischenspeicher(verbund.anzahl);
if (leiter) log.info(`Ablago startet (Version ${version})`, { node: process.version, port: cfg.port, protokoll: protokoll.stufe, proxy: cfg.proxy.text, ...(verbund.mehrere ? { prozesse: verbund.anzahl } : {}) });
else log.info(`Prozess ${verbund.nr} für Anfragen startet`, { pid: process.pid });
if (prozessEinstellung.ungueltig && leiter) log.warn(tDe('meldungen.prozesse.ungueltig', { roh: prozessEinstellung.ungueltig, max: PROZESSE_MAX }));
if (cfg.proxy.fehler) log.warn(cfg.proxy.fehler);
if (cfg.einbetten.fehler) log.warn(cfg.einbetten.fehler);
// Lasttest-Modus (#612): DMS_LASTTEST=klein|mittel|gross|extrem|alle – nur in einer eigenen Test-Installation (unten geprüft).
// Nur im Leiter: Die Seite mit Fortschritt und das Skript gibt es einmal.
const lasttest = lasttestAus(leiter ? env : {});
if (lasttest.fehler) log.warn(lasttest.fehler);
/** Grund, warum der Lasttest trotz DMS_LASTTEST nicht läuft (echte Ablage) – für die Werkbank-Übersicht. */
let lasttestAbbruch: string | null = null;
// dms-komplett (#943): /data/postgres nicht eingebunden – die Datenbank ginge beim nächsten Update verloren.
// Einmal beim Start geprüft (Einhängepunkte ändern sich zur Laufzeit nicht); Übersicht und Anbindung zeigen es rot.
const ohneDatenbankVolume = datenbankOhneVolume(env);
if (ohneDatenbankVolume && leiter) log.error(tDe('meldungen.index.datenbank-ohne-volume', { link: DATENBANK_RETTEN }));

// Unerwartete Fehler außerhalb von Anfragen nicht verschlucken.
process.on('unhandledRejection', (e) => protokoll.schreibe('error', 'system', tDe('meldungen.index.unbehandelter-fehler'), { fehler: e instanceof Error ? e.stack : String(e) }));

for (const f of ordnerPruefung.fehler) console.error(f);
if (ordnerPruefung.fehler.length) {
  log.error('Start abgebrochen: frühere Variable für einen Ordner mit abweichendem Wert', { variablen: ordnerPruefung.fehler.length });
  process.exit(1);
}
for (const v of ordnerPruefung.ueberfluessig) log.warn(`${v} ist nicht mehr nötig und kann aus der Compose-Datei entfernt werden. ${VARIABLEN_GRUND.ordner}`);

for (const o of Object.values(ordner)) await mkdir(o, { recursive: true });
// Export-Ordner (#797): neben files/, nie im Sicherungsordner; einstellbar nur über ein eigenes Volume.
await mkdir(exportOrdnerVon(ordner), { recursive: true });

// Startseite „Ablago startet …“ (#802): Der Port ist sofort offen. Bis Ablago bereit ist, zeigt er nur Schritte und
// Zahlen; API und WebDAV antworten mit 503, /api/gesundheit meldet „startet“ (Docker und Proxy warten). Scheitert der
// Start, steht der Grund dort und im Protokoll. Nach einem Fehler beendet sich Ablago nach FEHLER_NEUSTART_MS, damit
// der Container neu startet – außer bei der Sperre gegen ein Downgrade (#714): Da hilft kein Neustart.
const FEHLER_NEUSTART_MS = 5 * 60_000;
/** Nach einem unerwarteten Fehler (#877): so lange dürfen offene Anfragen noch zu Ende laufen. */
const ABSTURZ_MS = 3000;
// Mehrere Prozesse (#745): nur beim ersten Start des Leiters – danach beantworten die anderen Prozesse schon Anfragen.
const start = new Startmodus({ port: cfg.port, host: cfg.host, webDir: cfg.web, proxy: cfg.proxy.trust, einbetten: cfg.einbetten });
if (verbund.erster) await start.oeffne();
let fehlerNeustart: NodeJS.Timeout | null = null;
const beimStartfehler = (e: unknown) => {
  const f = start.fehler(e);
  log.error(`Start abgebrochen: ${(e as Error)?.message ?? String(e)}`, {
    schritt: start.stand.schritt, ...(e instanceof NeuereDatenbankFehler ? { unbekannt: e.unbekannt.join(', ') } : { fehler: (e as Error)?.stack ?? String(e) }),
  });
  // Ohne offene Startseite (Einrichtungsmodus, kurz vor dem Port von Ablago) zeigt niemand den Grund: gleich beenden wie bisher.
  if (!start.offen) process.exit(1);
  if (f.art !== 'neuere-datenbank' && !fehlerNeustart) fehlerNeustart = setTimeout(() => process.exit(1), FEHLER_NEUSTART_MS);
};
process.on('uncaughtException', beimStartfehler);

// Datenbank-Anbindung (#119): Datei unter /data/geheim, führend; sonst DATABASE_URL übernehmen;
// sonst (oder wenn sie nicht funktioniert) der Einrichtungsassistent im Browser.
// App-Stores (#176): DMS_EINRICHTUNGSCODE=aus – ohne Code einrichten.
const einrichtungscode = new Einrichtungscode(ordner.geheim, Date.now, env.DMS_EINRICHTUNGSCODE === 'aus');
// Vorlagen für NAS-Systeme (#184): nur DMS_DB_PASSWORT statt einer ganzen DATABASE_URL.
const umgebung = ausUrl(env.DATABASE_URL) ?? ausVariablen(env);
if (env.DMS_DB_PASSWORT?.startsWith('HIER-')) log.warn('DMS_DB_PASSWORT ist noch das Beispiel aus der Vorlage – bitte in der Compose-Datei ein eigenes Passwort eintragen und das Projekt neu erstellen');
if (env.DATABASE_URL && !umgebung) log.error('DATABASE_URL ist keine gültige postgres://-Adresse und wird ignoriert');
let anbindung: Anbindung | null = null;
try { anbindung = await liesAnbindung(ordner.geheim); } catch (e) { log.error('Datei der Datenbank-Anbindung nicht lesbar', { fehler: (e as Error).message }); }
const quelle = anbindung ? 'datei' as const : umgebung ? 'umgebung' as const : null;
const kandidat = anbindung ?? umgebung;
let verbunden = false;
let startfehler: string | null = null;
if (kandidat) {
  // Der Datenbank-Container braucht nach dem Start manchmal einen Moment.
  for (let versuch = 1; versuch <= 5; versuch++) {
    const p = await pruefeAnbindung(kandidat);
    if (p.ok) { verbunden = true; break; }
    startfehler = p.text;
    log.warn(`Datenbank nicht verbunden (Versuch ${versuch}/5): ${p.text}`, { technisch: p.technisch });
    if (p.art !== 'nicht_erreichbar') break;
    await new Promise((r) => setTimeout(r, 2000));
  }
}
if (verbunden && !anbindung && umgebung) {
  await schreibeAnbindung(ordner.geheim, umgebung);
  anbindung = umgebung;
  if (datenbankVomImage(env)) log.info(`Datenbank im Container (dms-komplett) in ${ANBINDUNG_DATEI} übernommen`);
  else if (env.DATABASE_URL) log.info(`DATABASE_URL in ${ANBINDUNG_DATEI} übernommen – die Variable ist nicht mehr nötig und kann aus der Compose-Datei entfernt werden. ${VARIABLEN_GRUND.datenbank}`);
  else log.info(`Datenbank-Anbindung aus DMS_DB_PASSWORT in ${ANBINDUNG_DATEI} übernommen`);
}
if (!verbunden && !verbund.erster) {
  // Mehrere Prozesse (#745): Der Einrichtungsmodus bräuchte den Port, den die anderen gerade bedienen – neu versuchen.
  log.error(`Prozess ${verbund.nr}: Datenbank nicht verbunden – er beendet sich und wird neu gestartet`, { grund: startfehler });
  process.exit(1);
}
if (!verbunden) {
  // Der Einrichtungsmodus braucht den Port selbst; danach geht es mit der Startseite weiter.
  await start.schliesse();
  anbindung = await einrichtungsmodus({
    geheim: ordner.geheim, code: einrichtungscode, vorbelegt: kandidat, quelle, fehler: startfehler,
    port: cfg.port, host: cfg.host, webDir: cfg.web, proxy: cfg.proxy.trust, einbetten: cfg.einbetten, wiederholenMs: kandidat ? 10_000 : undefined,
  });
  await start.oeffne();
}
const db = anbindung!;
const datenbankUrl = alsUrl(db);
// Verbindungen zur Datenbank (#544): Vorgabe 10, für größere Installationen DMS_DB_VERBINDUNGEN.
// Mehrere Prozesse (#874): DMS_DB_VERBINDUNGEN gilt für alle zusammen und wird aufgeteilt (verbindungsaufteilung);
// zusammen nie mehr, als die Datenbank erlaubt.
const verbindungsZahl = verbindungenAus(env, verbund.anzahl);
if (verbindungsZahl.fehler && leiter) log.warn(verbindungsZahl.fehler);
let erlaubteVerbindungen: number | null = null;
if (verbund.mehrere) {
  const probe = verbinde(datenbankUrl, 1);
  try { erlaubteVerbindungen = Number((await probe`SHOW max_connections`)[0].max_connections) || null; } catch { /* dann ohne Abgleich */ } finally { await probe.end({ timeout: 5 }); }
}
const verbindungsteile = verbindungsaufteilung(verbindungsZahl.max, verbund.anzahl, erlaubteVerbindungen);
const eigeneVerbindungen = verbindungenFuer(verbindungsteile, verbund.nr);
if (verbindungsteile.gekuerzt && leiter) log.warn(`Verbindungen zur Datenbank: ${verbindungsZahl.max} wären mehr, als die Datenbank erlaubt (max_connections ${erlaubteVerbindungen}, ${VERBINDUNGEN_RESERVE} bleiben frei) – Ablago nimmt zusammen ${verbindungsteile.gesamt}`);
if (verbindungsteile.angehoben && leiter) log.warn(`Verbindungen zur Datenbank: ${verbindungsZahl.max} sind für ${verbund.anzahl} Prozesse zu wenig (der Leiter braucht ${VERBINDUNGEN_LEITER_MIN}, jeder weitere ${VERBINDUNGEN_MIN}) – Ablago nimmt zusammen ${verbindungsteile.gesamt}`);
const sql = verbinde(datenbankUrl, eigeneVerbindungen);
// Datenbank von einer neueren Version (#714) oder fehlgeschlagene Migration: Grund auf der Startseite (beimStartfehler).
// Mehrere Prozesse (#745): nur der Leiter – die anderen starten erst, wenn er fertig ist.
if (leiter) await migriere(sql, cfg.migrationen, (m) => protokoll.modul('datenbank').info(m), (nr, von, datei) => start.schritt('migration', { nr, von, datei }));
start.schritt('schluessel');
const [{ server_version: pgVersion }] = await sql`SHOW server_version`;
if (leiter) protokoll.modul('datenbank').info('Datenbank verbunden', { postgres: pgVersion, host: db.host, datenbank: db.datenbank, verbindungen: `${verbindungsteile.gesamt}${verbindungsZahl.quelle === 'umgebung' ? ' (DMS_DB_VERBINDUNGEN)' : ''}${verbund.mehrere ? ` zusammen: Leiter ${verbindungsteile.leiter}, jeder weitere Prozess ${verbindungsteile.andere}` : ''}` });
const verbindungswarten = new Verbindungswarten(sql, eigeneVerbindungen, verbindungsZahl.quelle, verbindungsteile);
verbindungswarten.start();
// Wo es unter Last hakt (#874): Wartezeit auf eine freie Verbindung, nur während der Lasttest fragt.
const poolmessung = new Poolmessung(sql, eigeneVerbindungen);
// Überlastschutz (#544): mehr als DMS_MAX_ANFRAGEN gleichzeitig (Vorgabe 250) → sofort 503 mit Retry-After.
// Mehrere Prozesse (#745): je Prozess – jeder hat seine eigene Ereignisschleife.
const ueberlastZahl = maxAnfragenAus(env);
if (ueberlastZahl.fehler && leiter) log.warn(ueberlastZahl.fehler);
const ueberlast = new Ueberlastschutz(ueberlastZahl.max, ueberlastZahl.quelle);
const mandant = await bestimmeMandant(sql, db, env, (a) => schreibeAnbindung(ordner.geheim, a));
cfg.haushalt = mandant.id;
// Umzug der Kennungen (#1084): je umgestellte Kennung alt → neu ins Systemprotokoll, einmal nach der Migration.
if (leiter && istUuid(cfg.haushalt)) await protokolliereKennungsUmzug(pgEinstellungen(sql, cfg.haushalt)).catch((e: Error) => log.warn('Protokoll der umgestellten Kennungen nicht geschrieben', { fehler: e.message }));
if (mandant.hinweis) log.warn(mandant.hinweis);
// Zustand zwischen Anfragen (#744): Fehlversuche, Sperren, Einmal-Tickets und Merker für alle Prozesse und Server
// derselben Datenbank. Das Lebenszeichen sagt, ob dieser Prozess allein an der Datenbank ist (z. B. für die Texterkennung).
const zustandDb = pgKurzzustand(sql, cfg.haushalt);
// Fehlversuche beim Einrichtungscode über alle Prozesse (#956).
einrichtungscode.teileZaehler(zustandDb);
// Mehrere Prozesse (#745): Das Lebenszeichen hält nur der Leiter – „allein“ heißt dann: kein anderer Leiter (anderer
// Server) an dieser Datenbank. Startet der Leiter nach einem Absturz neu, sind die Aufträge der Texterkennung seine.
const lebt = leiter ? await lebenszeichen(sql, cfg.haushalt) : { allein: false, ende: async () => {} };
if (leiter && !lebt.allein) log.info('Weitere Server von Ablago an derselben Datenbank: Zeitpläne laufen je Lauf nur in einem davon');
/** Zeitgesteuerte Arbeit nur in einem Prozess zugleich (#744, Datenbanksperre je Name). */
const nurEiner = (name: string, f: () => Promise<unknown>) => zustandDb.exklusiv(name, f).then(() => {});

// E-Mail-Versand und Adresse des DMS stehen in der Werkbank (#37); frühere Umgebungsvariablen
// werden beim ersten Start nach dem Update einmalig übernommen.
// Schlüssel für verschlüsselte Zugangsdaten (#39): eine Datei, nie in der Datenbank.
const tresor = new Tresor(pgBetriebSpeicher(sql, cfg.haushalt), join(ordner.geheim, SCHLUESSELDATEI));
await tresor.laden();
const betrieb = new Betrieb(pgBetriebSpeicher(sql, cfg.haushalt), `http://localhost:${cfg.port}`, tresor);
await betrieb.laden();
if (leiter) await betrieb.uebernimmAlteVariablen(env);

// Jeder Datenbankzugriff der Repos wird gezählt und gestoppt (Entwicklermodus, lange Zugriffe).
const messung = new Messung(pgMessSpeicher(sql, cfg.haushalt));
await messung.start();
messung.auslastung.start();
// Externe Dienste (#565): Laufzeit, Datenmenge, Fehler, Token und Kosten – nur Metadaten, nichts geht nach außen.
extern.setze({ speicher: pgExternSpeicher(sql), einstellungen: pgEinstellungen(sql, cfg.haushalt) });
void extern.frisch();
// Arbeit im Hintergrund mit niedrigerer Priorität (#893): Arbeiter, Paket-Läufer und gestartete Programme.
const hintergrund = richteHintergrundEin(env);
if (hintergrund.fehler && leiter) log.warn(hintergrund.fehler);
if (leiter) log.info(hintergrund.wert ? tDe('meldungen.hintergrund.start', { wert: hintergrund.wert }) : tDe('meldungen.hintergrund.aus'));
// Zwischenspeicher der Zahlen, Trefferzahlen und Termine (#918): DMS_ZWISCHENSPEICHER=aus nur zur Fehlersuche.
if (!richteZwischenspeicherEin(env) && leiter) log.warn(tDe('meldungen.zwischenspeicher.aus'));
// Arbeiter für PDF und große Exporte (#542): ein kleiner Pool von Fäden neben dem Hauptfaden.
// Mehrere Prozesse (#745): Der Pool gilt je Prozess; die Vorgabe teilt sich auf die Prozesse auf.
const arbeiter = richteArbeiterEin(env, { vorwaermen: true, prozesse: verbund.anzahl });
if (arbeiter.fehler && leiter) log.warn(arbeiter.fehler);
if (leiter) log.info(arbeiter.groesse ? `Arbeiter für PDF und Exporte: ${arbeiter.groesse}${arbeiter.quelle === 'umgebung' ? ' (DMS_ARBEITER)' : ` (Vorgabe bei ${arbeiter.kerne} Kernen)`}` : 'Arbeiter für PDF und Exporte ausgeschaltet (DMS_ARBEITER=0): PDF-Arbeiten laufen im Hauptfaden');
// Region (#726): Zeitzone aus der Datenbank, bevor irgendetwas „heute“ oder Uhrzeiten rechnet; jede Minute neu gelesen.
const region = new RegionDienst(pgEinstellungen(sql, cfg.haushalt));
await region.lade().catch((e) => log.warn(`Region nicht lesbar, es gilt Europe/Berlin: ${(e as Error).message}`));
region.starte();
// Sprachen (#729): erlaubte Sprachen und Sprache der Installation, jede Minute neu gelesen wie die Region.
const sprachen = new SprachDienst(pgEinstellungen(sql, cfg.haushalt));
await sprachen.lade().catch((e) => log.warn(`Sprachen nicht lesbar, es gilt Deutsch: ${(e as Error).message}`));
sprachen.starte();
// Speicherplatz (#116): an der Grenze ist das Hochladen gesperrt; Wartung und Mail kommen unten dazu.
const spDeps: SpeicherplatzDeps = { einstellungen: pgEinstellungen(sql, cfg.haushalt), exklusiv: (n, f) => zustandDb.exklusiv(n, f) };
const speicherplatz = new Speicherplatz(ordner, spDeps);
const hochladen = () => speicherplatz.pruefeHochladen();
// Hochladen als Strom (#746): temporäre Dateien neben der Ablage (gleiches Laufwerk, nicht in der Sicherung).
richteHochladenEin({ ordner: join(ordner.dateien, 'hochladen'), vorher: hochladen });
// Mehrere Prozesse (#745): Wer nicht allein startet, löscht nur alte – die frischen gehören vielleicht laufenden Uploads.
const uebrig = await raeumeHochladenAuf(undefined, verbund.erster && lebt.allein ? 0 : UPLOAD_ALTER_MS);
if (uebrig) log.info('Übrig gebliebene temporäre Uploads gelöscht', { anzahl: uebrig });
const dienst = new Dienst(messung.umhuelle(pgRepo(sql, cfg.haushalt), 'mappen'), mitPruefung(ordnerSpeicher(ordner.dateien, cfg.haushalt), hochladen), {
  tresor, einstellungen: pgBetriebSpeicher(sql, cfg.haushalt), zustand: zustandDb,
});
// Fehlende Dokumentdatei (#877): einmal je Datei mit Mappe ins Protokoll und als Hinweis in die Werkbank-Übersicht.
beiFehlenderDatei((f) => { void dienst.dateienFehlen.merkeFehlendeDatei(f).catch((e) => log.warn('Fehlende Datei nicht vermerkt', { fehler: (e as Error).message })); });
// Benutzer erscheinen als Mappen (#26); die Konten halten sie auf dem neuesten Stand.
const konten = new Konten(messung.umhuelle(pgKontoRepo(sql, cfg.haushalt), 'konto'), () => betrieb.mailer(), () => betrieb.adresseFuerLinks(), dienst.systemtypen.benutzerspiegel());
dienst.verbindeKonten(konten.papierkorbHaken());
// Startseite „Zuletzt geöffnet“ (#940): Anlegen und Ändern zählen wie Öffnen.
dienst.kern.beiEigenerAenderung = (benutzerId, mappeId) => konten.merkeGeoeffnet({ id: benutzerId }, mappeId);
konten.verbindeZustand(zustandDb);
// Sprachpakete (#731): ihre Sprachen kommen dazu, sobald die Pakete lesbar sind; danach lädt der SprachDienst sie mit.
const personenMitSprache = async (k: string) => (await konten.listeBenutzer()).filter((b) => b.aktiv !== false && b.sprache === k).length;
const sprachpakete = new Sprachpakete({ pakete: () => dienst.kern.repo.listePakete(), sprachpakete: () => dienst.kern.repo.sprachpakete(), personen: personenMitSprache });
sprachen.pakete = sprachpakete;
await sprachen.lade().catch((e) => log.warn(`Sprachpakete nicht lesbar: ${(e as Error).message}`));
// Texterkennung im Hintergrund (#45); dieselbe Datenbank, eigener Messbereich.
// Wartungsmodus (#102): überdauert einen Neustart; pausiert die Hintergrundarbeiten.
const wartung = new Wartung(pgBetriebSpeicher(sql, cfg.haushalt), konten);
await wartung.laden();
wartung.start();
// Notfallzugang über eine RESCUE-Datei neben der Schlüsseldatei (#108).
// Hinweise an die Verwaltenden (#818, statt „an die Administratoren“): je Werkbank-Bereich an alle, die ihn verwalten
// dürfen (auch „Gesamte Verwaltung“); ohne Bereich an „Gesamte Verwaltung“.
const anVerwaltendeVon = (bereich?: string) => async (betreff: import('./mail').MailText, text: import('./mail').MailText) => { await anVerwaltende(await konten.listeBenutzer(), betrieb.mailer(), betreff, text, bereich); };
spDeps.wartung = wartung;
// Eigene Organisation (#995): Notiz an die Verwaltenden, wenn sich Merkmal oder Verantwortliche ändern.
dienst.verbindeVerwaltungsmail((bereich) => anVerwaltendeVon(bereich));
spDeps.anAdmins = anVerwaltendeVon('systemzustand');
// Anmeldeschutz (#240): Sperren in der Datenbank, einstellbar in der Werkbank.
const anmeldesperre = new Anmeldesperre(pgEinstellungen(sql, cfg.haushalt), anVerwaltendeVon('anmeldeschutz'), Date.now, zustandDb);
konten.verbindeSperre(anmeldesperre);
// Ereigniskatalog (#670): Kontosperre als Ereignis (Id des Benutzers, Zeitpunkt, Fehlversuche, IP gekürzt).
anmeldesperre.beiKontosperre = async (x) => {
  const b = await konten.personMitEmail(x.email);
  if (b) await dienst.kern.ereignis('benutzer.gesperrt', { benutzer: b.id, zeitpunkt: new Date().toISOString(), fehlversuche: x.versuche, bis: x.bis, ip: kuerzeIp(x.ip) });
};
// Zwei-Faktor-Anmeldung (#242): Geheimnis verschlüsselt mit dem Schlüssel des DMS.
konten.verbindeZweifaktor(new Zweifaktor(pgEinstellungen(sql, cfg.haushalt), (k) => tresor.verschluessele(k), (w) => tresor.entschluessele(w), Date.now, zustandDb));
const notfall = new Notfallzugang(join(dirname(tresor.datei), 'RESCUE'), konten, pgBetriebSpeicher(sql, cfg.haushalt), anVerwaltendeVon());
// Sicherungen (#103–#105): eigenes Volume, verschlüsselt mit dem Schlüssel der Werkbank.
const sicherung = new Sicherung(ordner.sicherung, ordner.dateien, cfg.haushalt, {
  tresor, einstellungen: pgEinstellungen(sql, cfg.haushalt), daten: pgDatenquelle(sql),
  umgebung: async () => ({ dms: eigeneVersion(), node: process.versions.node, system: `${type()} ${release()}`, architektur: arch() }),
  wartungAktiv: () => wartung.aktiv, anAdmins: anVerwaltendeVon('sicherung'),
});
// Wiederherstellen und Probe (#107, #109): eigenes Schema, erst nach allen Prüfungen umschalten.
const wiederherstellung = new Wiederherstellung({
  url: datenbankUrl, sql, migrationen: cfg.migrationen, dateiWurzel: ordner.dateien, sicherung, tresor,
  laufzeit: async () => ({ dms: eigeneVersion(), postgres: String(pgVersion), architektur: arch(), haushaltId: cfg.haushalt, migrationen: (await readdir(cfg.migrationen)).filter((f) => f.endsWith('.sql')).sort() }),
  wartungAktiv: () => wartung.aktiv,
  einrichtungNoetig: () => konten.einrichtungNoetig(),
  // Im Container startet Docker (restart: unless-stopped) das DMS gleich wieder.
  // Mehrere Prozesse (#745): alle – sie sprechen sonst mit dem alten Schema bzw. Mandanten.
  neustart: () => { log.warn('Neustart nach der Wiederherstellung'); ganzBeenden('Neustart nach der Wiederherstellung'); },
  // Gehört die Sicherung zu einem anderen Mandanten, gilt nach dem Neustart dessen Id (#119).
  mandantUebernehmen: async (id) => { await schreibeAnbindung(ordner.geheim, { ...db, mandant: id }); },
  pruefeCode: (c) => einrichtungscode.pruefeGeteilt(c),
  anAdmins: anVerwaltendeVon('sicherung'),
});
sicherung.sperre = () => wiederherstellung.laeuft();
// Einmalige Arbeiten beim Start (#745): nur im Leiter.
if (leiter) await wiederherstellung.raeumeAuf();
start.schritt('suchindex');
// Erweiterungen der Suche (#562): pg_trgm anlegen bzw. umziehen, wenn sie fehlt; sonst Hinweis im Protokoll.
if (leiter) await sichereErweiterungen(sql, protokoll.modul('datenbank')).catch((e) => log.warn('Erweiterungen der Datenbank nicht geprüft', { fehler: (e as Error).message }));
const abschluss = leiter ? await pgEinstellungen(sql, cfg.haushalt).lies('wiederherstellung_abschluss') as { sicherung?: string } | null : null;
if (abschluss) log.warn('Gestartet nach einer Wiederherstellung', { sicherung: abschluss.sicherung });
start.schritt('ordner');
const texterkennung = new Texterkennung(messung.umhuelle(pgRepo(sql, cfg.haushalt), 'texterkennung'), ordnerSpeicher(ordner.dateien, cfg.haushalt), pgBetriebSpeicher(sql, cfg.haushalt));
dienst.dokumente.verbindeTexterkennung(texterkennung);
texterkennung.pause = () => wartung.aktiv;
wartung.beimAusschalten(() => texterkennung.anstossen());
// Vorschaubilder der ersten Seite (#332): außerhalb des Haushaltsordners, damit sie nicht in die Sicherung gehen.
const vorschau = new Vorschaubilder(ordnerAblage(join(ordner.dateien, 'vorschau', cfg.haushalt)), ordnerSpeicher(ordner.dateien, cfg.haushalt));
dienst.dokumente.verbindeVorschau(vorschau);
vorschau.pause = () => wartung.aktiv;
wartung.beimAusschalten(() => vorschau.anstossen());
// Dateien umwandeln (#577): Fassungen aus Paketen mit dms:umwandeln im Haushaltsordner – sie gehen mit in die
// Sicherung (seit 0.140.1; vorher lagen sie daneben und ziehen beim Start um). Daraus Vorschaubild und Volltext.
if (leiter) await zieheFassungenUm(ordner.dateien, cfg.haushalt).catch((e) => log.warn('Umgewandelte Fassungen nicht verschoben', { fehler: (e as Error).message }));
// Exporte (#797): Was noch unter sicherung/export/ liegt, zieht in den Export-Ordner um – mit Hinweis in der Werkbank.
const exporte = await exportOrt(ordner);
if (leiter) try {
  const u = await zieheExporteUm(alterExportOrdner(ordner), exporte.pfad);
  if (u.anzahl || u.uebrig) {
    await merkeUmzug(pgEinstellungen(sql, cfg.haushalt), u);
    log[u.uebrig ? 'warn' : 'info'](t('meldungen.index.exporte-aus-dem-sicherungsordner'),
      { anzahl: u.anzahl, nach: exporte.pfad, ...(u.uebrig ? { uebrig: alterExportOrdner(ordner) } : {}) });
  }
} catch (e) { log.warn('Exporte nicht aus dem Sicherungsordner verschoben', { fehler: (e as Error).message }); }
if (exporte.imSicherungsordner && leiter) log.warn('Der Export-Ordner liegt im Sicherungsordner: Unverschlüsselte Exporte gehen mit jeder Kopie der Sicherung mit. Lege das Volume für /data/export an einen anderen Ort.', { pfad: exporte.pfad });
const fassungen = ordnerFassungen(fassungsOrdner(ordner.dateien, cfg.haushalt));
const umwandlung = new Dateiumwandlung(dienst.dokumentUmwandlung.umwandlungAnbindung(fassungen, vorschau));
dienst.dokumentUmwandlung.verbindeUmwandlung(umwandlung, vorschau);
vorschau.fassung = (sha) => umwandlung.lies(sha);
texterkennung.umwandlung = { lies: (sha) => umwandlung.lies(sha), paketFuer: (m) => umwandlung.paketFuer(m), anfordern: (d) => umwandlung.anfordern(d), gesperrt: (sha) => umwandlung.gesperrt(sha) };
// Geschützte PDFs (#827): entsperrte Fassungen (qpdf) neben den umgewandelten; gemerkte Passwörter je Konto verschlüsselt.
const entsperren = new PdfEntsperren(dienst.geschuetztePdfs.entsperrenAnbindung({ ablage: fassungen, speicher: pgEinstellungen(sql, cfg.haushalt), verschluessele: (k) => tresor.verschluessele(k), entschluessele: (w) => tresor.entschluessele(w), zustand: zustandDb }));
dienst.geschuetztePdfs.verbindeEntsperren(entsperren);
texterkennung.entsperrt = (sha) => entsperren.fassung(sha);
// Volltext aus Paketen (#614): Dateitypen, für die ein Paket mit dms:volltext den Text liefert.
texterkennung.volltextPaket = dienst.paketVolltext;
// Archivfassung (PDF/A, #631): Pakete mit dms:archivfassung legen sie im Haushaltsordner ab (Sicherung, Vollexport);
// Wortpositionen der Texterkennung daneben. Der Kern meldet Dokumente erst mit feststehendem Volltext.
const archivfassung = new Archivfassung(dienst.dokumentArchiv.archivAnbindung(ordnerArchiv(archivOrdner(ordner.dateien, cfg.haushalt), woerterOrdner(ordner.dateien, cfg.haushalt))));
dienst.dokumentArchiv.verbindeArchivfassung(archivfassung);
// Tägliche Zusammenfassung der offenen Aufgaben (#54).
const typName = async (id: string | undefined) => (await dienst.mappentypen.listeTypen()).find((t) => t.id === id)?.name ?? '';
const aufgabenmail = new Aufgabenmail({
  benutzer: () => konten.listeBenutzer(),
  einstellungenVon: (b) => konten.einstellungen(b),
  // Aufgaben zu Mappen, die der Empfänger nicht lesen darf, ohne Titel (#127).
  aufgabenVon: async (b) => dienst.vertretung.meineAufgaben(b, await dienst.rechtepruefung.zugriff(b)),
  typName,
}, () => betrieb.mailer(), () => betrieb.adresseFuerLinks(), pgBetriebSpeicher(sql, cfg.haushalt));
const designs = new Designs(messung.umhuelle(pgDesignRepo(sql, cfg.haushalt), 'designs'), mitPruefung(ordnerSpeicher(ordner.dateien, `${cfg.haushalt}/designs`), hochladen));
// Einrichtungsassistent (#119): Mandant und Administrator mit Code, danach die weiteren Schritte.
const einrichtungNoetig = await konten.einrichtungNoetig();
if (einrichtungNoetig && !leiter) await einrichtungscode.uebernimm();
else if (einrichtungNoetig) await einrichtungscode.bereitstellen();
else if (existsSync(einrichtungscode.datei) && leiter) await einrichtungscode.entfernen();
const einrichtung = new Einrichtung({
  konten, code: einrichtungNoetig ? einrichtungscode : null, einstellungen: pgEinstellungen(sql, cfg.haushalt),
  mandant: mandantNamen(sql, cfg.haushalt), schriftzug: (t) => designs.setzeSchriftzug(t),
  // Konfigurationsdatei (#806): die verbundene Datenbank, ohne Passwort.
  datenbank: () => ({ host: db.host, port: db.port, datenbank: db.datenbank, benutzer: db.benutzer }),
  // „Einrichtung abschließen“ erst mit Notfallblatt (#804).
  notfallblattAktuell: async () => (await sicherung.notfallblatt()).aktuell,
});
// Eingangsordner (#195): /eingang, wenn eingebunden; nur eine Instanz übernimmt (Sperre in PostgreSQL).
let eingangSperre: Promise<boolean> | null = null;
const eingangsordner = new Eingangsordner(env.DMS_EINGANG ?? '/eingang', {
  dienst, einstellungen: pgEinstellungen(sql, cfg.haushalt),
  benutzer: () => konten.listeBenutzer(),
  pause: () => (wartung.aktiv ? 'Wartungsmodus' : wiederherstellung.laeuft() ? t('meldungen.index.wiederherstellung-laeuft') : null),
  sperre: () => (eingangSperre ??= (async () => {
    // Eine eigene Verbindung hält die Sperre, solange das DMS läuft.
    const v = await sql.reserve();
    const [r] = await v`SELECT pg_try_advisory_lock(4711195) AS ok`;
    if (!r.ok) { v.release(); eingangSperre = null; }
    return r.ok as boolean;
  })()),
});
// Postfächer (#196): Mails per IMAP abholen; nur eine Instanz ruft ab.
let postSperre: Promise<boolean> | null = null;
// Anmeldung per OAuth 2.0 (#358): Token verschlüsselt mit dem Schlüssel des DMS.
const postfachOAuth = new PostfachOAuth({ einstellungen: pgEinstellungen(sql, cfg.haushalt), verschluessele: (k) => tresor.verschluessele(k), entschluessele: (w) => tresor.entschluessele(w), anAdmins: anVerwaltendeVon('postfaecher'), zustand: zustandDb });
// E-Mail-Versand über OAuth (#813): dieselbe Anmeldung wie bei den Postfächern.
betrieb.verbindeOAuth(postfachOAuth);
const postfaecher = new Postfaecher({
  dienst, einstellungen: pgEinstellungen(sql, cfg.haushalt), verbinde: verbindeImap, lies: liesMail, oauth: postfachOAuth,
  verschluessele: (k) => tresor.verschluessele(k), entschluessele: (w) => tresor.entschluessele(w),
  pause: () => (wartung.aktiv ? 'Wartungsmodus' : wiederherstellung.laeuft() ? t('meldungen.index.wiederherstellung-laeuft') : null),
  platz: () => speicherplatz.pruefeHochladen(),
  anAdmins: anVerwaltendeVon('postfaecher'),
  sperre: () => (postSperre ??= (async () => {
    const v = await sql.reserve();
    const [r] = await v`SELECT pg_try_advisory_lock(4711196) AS ok`;
    if (!r.ok) { v.release(); postSperre = null; }
    return r.ok as boolean;
  })()),
});
// Hinweise zu DATABASE_URL nur, wenn sie aus der Compose-Datei kommt, nicht vom Start-Skript von dms-komplett (#805).
const anbindungVerwaltung = new AnbindungVerwaltung(ordner.geheim, db, umgebungAusCompose(env, umgebung), () => ganzBeenden('Datenbank-Anbindung geändert'), undefined, ohneDatenbankVolume);
// Befehl dms im Container (#244).
// Mehrere Prozesse (#745): ein gemeinsamer Schlüssel vom Hauptprozess; die Datei schreibt der Leiter.
const konsole = new Konsolenzugang(undefined, verbund.konsole ?? undefined);
// Anmeldung über einen Anbieter (#241); Client-Secret verschlüsselt mit dem Schlüssel des DMS.
const oidc = new Oidc({ einstellungen: pgEinstellungen(sql, cfg.haushalt), verschluessele: (k) => tresor.verschluessele(k), entschluessele: (w) => tresor.entschluessele(w), zustand: zustandDb });
konten.verbindeAnbieter(() => oidc.bereit());
// Nach dem Schlüsselwechsel das zwischengespeicherte Client-Secret neu lesen (#410).
tresor.beimWechsel(async () => oidc.vergiss());
// Paket-Läufer (#338): Pakete mit Code in einem eigenen Prozess; ihre API-Anfragen laufen über app.inject.
const apiSchluessel = new ApiSchluesselDienst(messung.umhuelle(pgApiSchluesselRepo(sql), 'apischluessel'));
// Notfallzugang mit dem Notfallcode vom Notfallblatt (#815): /notfall, Vorgabe „nur aus dem Heimnetz“.
const notfallcode = new Notfallcode({
  konten, einstellungen: pgBetriebSpeicher(sql, cfg.haushalt), mailer: () => betrieb.mailer(), proxy: cfg.proxy.trust,
  apiSchluessel: async (id) => (await apiSchluessel.liste({ id } as Benutzer)).length,
  codeBenutzt: () => sicherung.notfallcodeBenutzt(),
  zustand: zustandDb, verschluessele: (k) => tresor.verschluessele(k), entschluessele: (w) => tresor.entschluessele(w),
});
let appFuerPakete: Awaited<ReturnType<typeof baueApp>> | null = null;
// Mehrere Prozesse (#745): genau einmal, im Leiter (er hält die API-Schlüssel der Pakete). Die anderen fragen ihn (Fernlaeufer).
const paketlaeufer: Paketlaeufer | null = !leiter ? null : new Paketlaeufer({
  dienst, konten, schluessel: apiSchluessel,
  api: async (q) => {
    if (!appFuerPakete) return { status: 503, kopf: {}, body: Buffer.from('Ablago startet noch.') };
    const r = await appFuerPakete.inject({ method: q.methode as 'GET', url: q.pfad, headers: q.kopf, payload: q.body, remoteAddress: '127.0.0.1' });
    return { status: r.statusCode, kopf: Object.fromEntries(Object.entries(r.headers).map(([k, v]) => [k, String(v)])), body: r.rawPayload };
  },
  einstellungen: (id): Promise<Record<string, unknown>> => pakete.einstellungenFuerPaket(id).catch(() => ({})),
  speicher: { lies: (id) => paketSpeicher(dienst.kern, id), schreibe: (id, w) => setzePaketSpeicher(dienst.kern, id, w) },
  pausiert: () => wartung.aktiv,
});
const fernlaeufer = paketlaeufer ? null : new Fernlaeufer(verbund, dienst);
const laeufer = paketlaeufer ?? fernlaeufer!;
const pakete: Paketverwaltung = new Paketverwaltung(dienst, {
  version: eigeneVersion,
  benutzer: async () => (await konten.listeBenutzer()).filter((b) => b.aktiv !== false).map((b) => ({ id: b.id, name: b.name || b.email })),
  // Vorgaben (#1038): Werte in der Sprache der Installation; Ersteller ist das Dienstkonto des Pakets (Herkunft in der
  // Historie). Pakete ohne Code melden sich nie an – ihr Konto bleibt aus (wie nach dem Entfernen) und steht nur für die Herkunft.
  standardSprache: async () => (await sprachen.lies()).standard,
  dienstkonto: async (id, name, code) => { const b = await konten.dienstkonto(id, name); if (!code) await konten.dienstkontoAus(id); return b.id; },
  laeufer: laeufer as PaketLaeufer,
  // Mehrere Prozesse (#745): hochgeladene Pakete bis zur Installation neben den temporären Uploads (nicht in der Sicherung).
  ...(verbund.mehrere ? { uploadOrdner: join(ordner.dateien, 'hochladen', 'pakete') } : {}),
  // Sprachpakete (#731): sofort laden, Nutzung vor dem Entfernen, danach aus der Einstellung nehmen.
  sprachen: {
    geaendert: async () => { await sprachpakete.lade(true); await sprachen.lade(); },
    nutzung: async (k) => ({ personen: await personenMitSprache(k), standard: (await sprachen.lies()).standard === k }),
    entfernt: async (k) => { await sprachen.ohne(k); },
    abdeckung: (k) => sprachpakete.abdeckung(k),
  },
  // Installieren, Aktualisieren, Entfernen (#405): nacheinander über alle Instanzen – Sperre in PostgreSQL, solange es läuft.
  sperre: async (f) => {
    const v = await sql.reserve();
    try {
      const [r] = await v`SELECT pg_try_advisory_lock(4711405) AS ok`;
      if (!r.ok) throw new Fachfehler(409, t('pakete.ablauf.fehler.belegt'));
      try { return await f(); } finally { await v`SELECT pg_advisory_unlock(4711405)`.catch(() => {}); }
    } finally { v.release(); }
  },
});
// Ereignis „Volltext fertig“ (#336, #458) nach dem Schritt des Kerns – auch ohne Text, damit ein Paket für die
// Texterkennung übernehmen kann; nicht bei Fehler, ausgelassen oder abgebrochen.
texterkennung.nachher = (d, e, k) => {
  // Ausgelassen: E-Mails bekommen trotzdem ihre Archivfassung (#946) – ohne Paket, das ihren Text liefert, steht ihr
  // Volltext damit fest (leer).
  if (e.stand === 'ausgelassen') { void dienst.volltexte.volltextAusgelassen(d.id); return; }
  if (e.stand !== 'fertig' && e.stand !== 'paket') return;
  // Umgewandelte Datei (#577): mime ist der Typ der Fassung, original der des Dokuments.
  void dienst.volltexte.volltextFertig({ dokument: d.id, mappe: d.mappeId }, { quelle: 'kern', text: k.text, mime: k.mime ?? d.mime, ...(k.original ? { original: k.original } : {}), seiten: e.seiten ?? null, neu: k.neu, seitenOhneText: k.seitenOhneText });
};
// Texterkennung als Paket (#458): das installierte Paket mit dms:texterkennung.
texterkennung.paket = () => dienst.volltexte.texterkennungPaket();
// Sicherung außer Haus (#585): Pakete mit dms:sicherung-lesen bekommen jede fertige Sicherung (Ereignis sicherung.fertig),
// lesen die verschlüsselte Datei in Stücken und melden je Sicherung zurück. Adresse: die bestätigte aus den Einstellungen.
sicherung.extern = {
  pakete: async () => Promise.all((await dienst.kern.repo.listePakete()).filter((p) => hatSchnittstelle(p.laeufer, 'dms:sicherung-lesen')).map(async (p) => {
    const werte = p.einstellungen ? (await paketEinstellungen(dienst.kern, p.id))?.werte ?? {} : {};
    const adresse = p.einstellungen ? adressfelder(p.einstellungen).map((f) => werte[f.schluessel]).find((v): v is string => typeof v === 'string' && !!v) ?? null : null;
    return { id: p.id, name: p.name, adresse };
  })),
  melde: (daten) => dienst.kern.ereignis('sicherung.fertig', { ...daten }),
};
dienst.sicherungAufgegeben = (paket, name, fehler) => sicherung.externAufgegeben(paket, name, fehler);
dienst.sicherungAntwort = (paket, name, r) => sicherung.externAntwort(paket, name, r);
if (paketlaeufer) wartung.beimAusschalten(() => void paketlaeufer.stelleZu());
// Systemzustand → Auslastung (#409): CPU, Arbeitsspeicher, Netzwerk jede Minute, nur im Arbeitsspeicher.
const systemlast = new Systemlast({ laeufer: () => laeufer.pid, postgres: process.env.DMS_VARIANTE === 'komplett', schleife: () => !!messung.auslastung.warnung() });
systemlast.start();

// Webhooks (#627): melden geänderte Zahlen eines Benutzers (wie GET /api/v1/ich/zaehler) an freigegebene Ziele.
// Geheimnis verschlüsselt mit dem Schlüssel des DMS; regelmäßige Läufe nur auf dem Server mit der Sperre.
let webhookSperre: Promise<boolean> | null = null;
const webhooks = new Webhooks({
  repo: messung.umhuelle(pgWebhookRepo(sql, cfg.haushalt), 'webhooks'),
  einstellungen: pgEinstellungen(sql, cfg.haushalt),
  verschluessele: (k) => tresor.verschluessele(k), entschluessele: (w) => tresor.entschluessele(w),
  zahlen: async (b) => { const r = await dienst.sichten.zaehlerAbruf(await dienst.rechtepruefung.zugriff(b)); return { ...r.zahlen, stand: r.stand, geaendert: r.geaendert }; },
  benutzer: (id) => konten.benutzerMitId(id),
  pause: () => (wartung.aktiv ? 'Wartungsmodus' : wiederherstellung.laeuft() ? t('meldungen.index.wiederherstellung-laeuft') : null),
  anAdmins: anVerwaltendeVon('webhooks'),
  anBesitzer: async (b, betreff, text) => { const m = betrieb.mailer(); if (m && b.email && !b.email.endsWith('.invalid')) { const [bt, tx] = mitSpracheVon(b, () => [mailText(betreff), mailText(text)]); await m.sende(b.email, bt, tx); } },
  sperre: () => (webhookSperre ??= (async () => {
    const v = await sql.reserve();
    const [r] = await v`SELECT pg_try_advisory_lock(4711197) AS ok`;
    if (!r.ok) { v.release(); webhookSperre = null; }
    return r.ok as boolean;
  })()),
});
dienst.sichten.beiAenderung(() => webhooks.anstossen());
// Automatisierungen (#674): Wenn · Und · Dann unter dem Systemkonto „Automatisierung“; Läufe je Ereignis genau einmal.
const automatisierungen = new Automatisierungen({
  dienst, repo: messung.umhuelle(pgAutomatisierungRepo(sql, cfg.haushalt), 'automatisierungen'),
  pause: () => (wartung.aktiv ? 'Wartungsmodus' : wiederherstellung.laeuft() ? t('meldungen.index.wiederherstellung-laeuft') : null),
});
// Fehlermeldungen der Benutzer (#70) – Screenshots getrennt von den Dokumenten.
const fehlermeldungen = new Fehlermeldungen(pgFehlerRepo(sql, cfg.haushalt), ordnerSpeicher(ordner.dateien, `${cfg.haushalt}/fehlermeldungen`));
// Technische Aufgaben (#719, #818): gebündelte Mail an die Verwaltenden je Bereich, Hinweis ohne Einzelheiten außerhalb
// des Verwaltungsmodus. Jede Quelle liefert Punkte mit festem Schlüssel und Bereich; die Texte nur in der Mail.
const verwaltung = new Verwaltung({
  einstellungen: pgEinstellungen(sql, cfg.haushalt),
  personen: () => konten.listeBenutzer(),
  sende: async (an, betreff, text) => { await betrieb.mailer()?.sende(an, betreff, text); },
  adresse: () => betrieb.adresseFuerLinks(),
  quellen: [
    async () => {
      const z = await sicherung.zustand();
      return [
        ...(z.fehler ? [{ bereich: 'sicherung', schluessel: `sicherung-fehler:${z.fehler.am}`, text: t('werkbank.verwaltung.sicherung.fehler'), eigeneMail: true }] : []),
        ...(!z.fehler && z.planAktiv && z.zuAlt ? [{ bereich: 'sicherung', schluessel: `sicherung-alt:${z.letzte?.ende ?? 'nie'}`, text: t('werkbank.verwaltung.sicherung.alt'), eigeneMail: true }] : []),
        ...(z.probe.ampel === 'rot' ? [{ bereich: 'sicherung', schluessel: `probe:${z.probe.letzte?.am ?? ''}`, text: t('werkbank.verwaltung.probe') }] : []),
      ];
    },
    async () => (tresor.zustand === 'vorhanden' ? [] : [{ bereich: 'verschluesselung', schluessel: `tresor:${tresor.zustand}`, text: t('werkbank.verwaltung.tresor') }]),
    // #797: Unverschlüsselte Exporte gingen mit jeder Kopie der Sicherung mit.
    async () => (exporte.imSicherungsordner ? [{ bereich: 'vollexport', schluessel: 'export-im-sicherungsordner', text: t('werkbank.verwaltung.export') }] : []),
    async () => (await pakete.installierte()).filter((p) => p.einstellungenNoetig).map((p) => ({ bereich: 'pakete', schluessel: `paket:${p.id}`, text: t('werkbank.verwaltung.paket', { name: p.name }) })),
    async () => {
      const w = await automatisierungen.warnungen();
      return [
        ...w.angehalten.map((a) => ({ bereich: 'automatisierungen', schluessel: `automatisierung:${a.id}:${a.grund}`, text: t('werkbank.verwaltung.automatisierung', { name: a.name }) })),
        ...(w.fehlgeschlagen ? [{ bereich: 'automatisierungen', schluessel: `automatisierung-fehler:${w.fehlgeschlagen}`, text: t('werkbank.verwaltung.automatisierung.fehler', { anzahl: w.fehlgeschlagen }) }] : []),
      ];
    },
    async () => { const z = (await speicherplatz.stand()).zustand; return z === 'ok' ? [] : [{ bereich: 'systemzustand', schluessel: `speicher:${z}`, text: t('werkbank.verwaltung.speicher'), eigeneMail: true }]; },
    async () => (await postfaecher.anmeldungFehlt()).map((p) => ({ bereich: 'postfaecher', schluessel: `postfach:${p.id}:${p.zustand}`, text: t('werkbank.verwaltung.postfach', { name: p.name }) })),
    async () => { const n = await fehlermeldungen.offen(); return n ? [{ bereich: 'fehlermeldungen', schluessel: `fehlermeldungen:${n}`, text: t('werkbank.verwaltung.fehlermeldungen', { anzahl: n }) }] : []; },
    async () => (await notfall.offen()).map((e) => ({ schluessel: `notfall:${e.id}`, text: t('werkbank.verwaltung.notfall'), eigeneMail: true })),
    async () => { const n = (await texterkennung.zaehler()).fehler; return n ? [{ bereich: 'texterkennung', schluessel: `texterkennung:${n}`, text: t('werkbank.verwaltung.texterkennung', { anzahl: n }) }] : []; },
    async () => ((await liesErweiterungen(sql)).some((e) => e.zustand !== 'ok') ? [{ bereich: 'systemzustand', schluessel: 'erweiterungen', text: t('werkbank.verwaltung.erweiterungen') }] : []),
    // Aufgaben bei Personen ohne Leserecht (#798): je Fall einmal gemeldet; der Alltags-Benutzer sieht nur „etwas liegt an“.
    async () => Promise.all((await dienst.ohneLeserecht.offeneFaelle()).map(async (f) => ({ bereich: 'aufgaben', schluessel: `ohne-leserecht:${f.id}`, text: t('werkbank.verwaltung.ohne-leserecht', { name: await dienst.kern.name(f.benutzerId) }) }))),
  ],
});
// WebDAV-Laufwerk (#346): Anmeldung mit API-Schlüssel, im Standard aus (Werkbank → WebDAV-Laufwerk).
const webdav = new Webdav({ dienst, konten, schluessel: apiSchluessel, einstellungen: pgEinstellungen(sql, cfg.haushalt), adresse: () => betrieb.adresseFuerLinks(), wartung, zustand: zustandDb });
const app = await baueApp(dienst, konten, {
  webdav,
  webhooks,
  automatisierungen,
  pakete,
  paketlaeufer: laeufer,
  konsole,
  oidc,
  einbetten: cfg.einbetten,
  webDir: cfg.web,
  sicher: () => betrieb.cookieNurHttps(),
  proxy: cfg.proxy.trust,
  messung,
  system: pgSystemQuelle(sql, cfg.haushalt),
  designs,
  einrichtung,
  anbindung: anbindungVerwaltung,
  mandantHinweis: mandant.hinweis,
  mandantName: () => mandantNamen(sql, cfg.haushalt).name(),
  apiSchluessel,
  betrieb,
  tresor,
  texterkennung,
  vorschau,
  aufgabenmail,
  region,
  sprachen,
  // Screenshots der Fehlermeldungen getrennt von den Dokumenten (#70).
  wartung,
  notfall,
  notfallcode,
  sicherung,
  exporte,
  wiederherstellung,
  speicherplatz,
  systemlast,
  ueberlast,
  verbindungen: verbindungswarten,
  poolmessung,
  sitzungen: () => sitzungsstand(sql),
  abfragen: { stand: (n: number) => teuersteAbfragen(sql, n), zuruecksetzen: () => abfragenZuruecksetzen(sql) },
  // #895: gemessen im Leiter – er kennt das Skript des Lasttests; so zählt die Rechenzeit an einer Stelle fortlaufend.
  prozessgruppen: () => verbund.rufe<GruppenStand>('prozessgruppen.stand', [], { ms: 5000 }),
  erweiterungen: () => liesErweiterungen(sql),
  eingangsordner,
  postfaecher,
  postfachOAuth,
  ordner: ordnerPruefung,
  lasttestAbbruch: () => lasttestAbbruch,
  fehlermeldungen,
  verwaltung,
  verbund,
  prozessEinstellung,
});

const kurz = betrieb.kurz();
if (leiter) {
  log.info(`E-Mail-Versand: ${kurz.mail === 'aus' ? 'aus – Links werden in der Benutzerverwaltung angezeigt (einrichten in Werkbank → E-Mail und Adresse)' : kurz.mail}`);
  log.info(`Adresse für Links: ${kurz.adresse}`);
  start.schritt('titel');
  const nachgezogen = await dienst.mappenTitel.titelNachziehen();
  if (nachgezogen) log.info(`Titel von ${nachgezogen} Mappen berechnet`);
  // Systemtypen Benutzer und Rolle anlegen und jedem Benutzer seine Mappe geben (auch nach einem Update).
  start.schritt('benutzer');
  await dienst.postSystemmappen.gleicheBenutzerAb(await konten.listeBenutzer(), (f, g) => start.menge(f, g));
  // Titel „… (ehemalig)“ aus älteren Versionen zurücksetzen (#663); deaktiviert zeigt die Oberfläche durchgestrichen.
  const ehemalig = await dienst.mappenTitel.ehemaligZuruecksetzen();
  if (ehemalig) log.info(`Titel von ${ehemalig} deaktivierten Benutzern ohne „(ehemalig)“ neu berechnet`);
}
// Systemkonto „Automatisierung“ (#673): sichtbar, nie anmeldbar; Automatisierungen (#674) laufen darunter.
await konten.systemkonto('automatisierung');
dienst.systemkonten = (k) => konten.systemkonto(k);
// Ereigniskatalog (#670): verteilt aus der Datenbank; ruht in Wartung und Wiederherstellung.
dienst.ereignisseRuhen = () => wartung.aktiv || wiederherstellung.laeuft();
// Mehrere Prozesse (#745): verteilt nur der Leiter – bei den anderen fehlen die Abnehmer (Automatisierungen).
if (leiter) {
  dienst.ereignisse.starte();
  automatisierungen.start();
  wartung.beimAusschalten(() => dienst.ereignisse.wecke());
  // Schlüssel für Mappentypen (#145), einmalig nach dem Update.
  start.schritt('typen');
  await dienst.mappenTitel.typSchluesselNachziehen();
  // Haken „Neue Mappen/Löschen erlauben“ → Berechtigungen (#146), einmalig nach dem Update.
  await dienst.mappenTitel.hakenUeberfuehren();
  const geprueft = await dienst.passung.passungNachziehen((f, g) => start.menge(f, g));
  if (geprueft) log.info(`Mappen von ${geprueft} Mappentypen gegen ihre Definition geprüft`);
}
// Papierkorb (#43): Abgelaufenes stündlich endgültig löschen.
// Auskünfte (#396): nach 7 Tagen weg – im selben stündlichen Lauf.
// Exporte (#797): nach dem Herunterladen bzw. nach 7 Tagen weg – derselbe Lauf wie für die Auskünfte.
// Zeitpläne (#744): jeder Lauf unter einer Datenbanksperre – mit mehreren Prozessen arbeitet je Lauf nur einer.
const papierkorb = async () => { if (!wartung.aktiv) await dienst.papierkorbVerwaltung.raeumePapierkorbAuf(); await raeumeExporteAuf(exporte.pfad); };
const papierkorbLauf = () => nurEiner('papierkorb', papierkorb).catch((e) => log.error('Papierkorb aufräumen fehlgeschlagen', { fehler: (e as Error).message }));
if (leiter) setInterval(() => void papierkorbLauf(), 60 * 60 * 1000).unref();
// Abwesenheit (#78): Abgelaufenes beenden, „abwesend“ an den Benutzer-Mappen nachziehen.
const abwesenheiten = () => nurEiner('abwesenheiten', () => konten.abwesenheitenPruefen()).catch((e) => log.error('Abwesenheiten prüfen fehlgeschlagen', { fehler: (e as Error).message }));
if (leiter) setInterval(() => void abwesenheiten(), 60 * 60 * 1000).unref();
// Anmeldeschutz (#368) und Tägliche Zusammenfassung (#54): Wann gemeldet wird, entscheiden seit #678 die
// Automatisierungen (Wenn-Karte „Zeitplan“, Paket „Benachrichtigungen“); die Dann-Karten rufen das hier auf.
dienst.zusammenfassungAn = async (id, trocken) => {
  const r = await aufgabenmail.fuerAutomatisierung(id, trocken);
  return { gesendet: r.gesendet, grund: tAuto(`automatisierung.karte.zusammenfassung.${r.schluessel}` as never, { name: r.name, anzahl: r.anzahl }) };
};
dienst.anmeldeschutzMelden = async (was, daten, trocken) => {
  let ok: boolean;
  if (was === 'sammel') ok = await anmeldesperre.meldeTaeglich(trocken);
  else {
    const b = typeof daten.benutzer === 'string' ? (await konten.listeBenutzer()).find((x) => x.id === daten.benutzer) : undefined;
    ok = !!b?.email && await anmeldesperre.kontoMelden(b.email, String(daten.ip ?? '?'), Number(daten.fehlversuche) || 0, trocken);
  }
  return { gesendet: ok && !trocken, grund: tAuto(ok ? (trocken ? 'automatisierung.karte.anmeldeschutz.trocken' : 'automatisierung.karte.anmeldeschutz.gesendet') : 'automatisierung.karte.anmeldeschutz.nichts') };
};
// Fristen und Erinnerungen (#129, #131): einmal am Tag – gleich nach Mitternacht bzw. beim Start –, vor der Zusammenfassung.
// Der erste Lauf beim Start (bei vielen Mappen lang) kommt seit #802 erst, wenn Ablago erreichbar ist (unten).
// Mehrere Prozesse (#744): Tag des letzten Laufs in der Datenbank, der Lauf selbst unter Sperre.
const fristen = () => nurEiner('fristen', async () => {
  const heute = heuteIn();
  if (wartung.aktiv || (await zustandDb.lies('fristen-tag', 'lauf'))?.wert === heute) return;
  const r = await dienst.fristen.fristenLauf(heute);
  await zustandDb.setze('fristen-tag', 'lauf', heute, null);
  if (r.angelegt || r.erledigt || r.erinnerungen) log.info('Fristen und Erinnerungen geprüft', r);
});
if (leiter) setInterval(() => void fristen().catch((e) => log.error('Fristen prüfen fehlgeschlagen', { fehler: (e as Error).message })), 5 * 60 * 1000).unref();
if (einrichtungNoetig && leiter) log.warn(`Noch kein Benutzer vorhanden: Öffne Ablago im Browser (Port ${cfg.port}) und richte es mit dem Einrichtungscode ein.`);

appFuerPakete = app;
start.schritt('dienste');
// Mehrere Prozesse (#745): Arbeit im Hintergrund nur im Leiter; die anderen geben Anstöße an ihn weiter (aufteilung.ts).
const aufteilung = teileArbeit(verbund, {
  dienst, texterkennung, vorschau, sicherung, wiederherstellung, postfaecher, eingangsordner, paketlaeufer, fernlaeufer,
  tresor, betrieb, oidc, messung, einstellungen: pgEinstellungen(sql, cfg.haushalt), zustand: zustandDb, sql, haushalt: cfg.haushalt,
  ueberlast, verbindungen: verbindungswarten, pool: poolmessung,
});
if (leiter) {
  await texterkennung.start({ zurueckstellen: lebt.allein });
  await laeufer.start().catch((e: unknown) => log.error('Paket-Läufer startet nicht', { fehler: (e as Error).message }));
  // RESCUE-Datei (#108): Sie liegt neben der Schlüsseldatei, also für alle Prozesse dieselbe – prüfen nur unter Sperre.
  const notfallLauf = () => void nurEiner('notfall-datei', () => notfall.pruefe()).catch((e) => log.error('Notfallzugang prüfen fehlgeschlagen', { fehler: (e as Error).message }));
  notfallLauf();
  setInterval(notfallLauf, 30_000).unref();
  sicherung.start();
  speicherplatz.start();
  await eingangsordner.start();
  postfaecher.start();
  webhooks.start();
  // Technische Aufgaben des Admin-Kontos (#719): alle 5 Minuten prüfen, höchstens einmal am Tag gebündelt mailen.
  // Vorher die Aufgaben bei Personen ohne Leserecht abgleichen (#798: Rechte geändert, Erwähnungen, Fristen …).
  setInterval(() => {
    if (wartung.aktiv || wiederherstellung.laeuft()) return;
    void nurEiner('verwaltung', async () => {
      await dienst.ohneLeserecht.faelleAbgleichen().catch((e) => log.warn('Aufgaben ohne Leserecht nicht abgeglichen', { fehler: (e as Error).message }));
      await verwaltung.tick();
    }).catch((e) => log.error('Technische Aufgaben prüfen fehlgeschlagen', { fehler: (e as Error).message }));
  }, 5 * 60 * 1000).unref();
  // Wörterverzeichnis der Suche (#575): neue Wörter aus dem Eingang übernehmen – entkoppelt von Mappen und Texterkennung.
  let woerterFehler = '';
  setInterval(() => {
    if (wiederherstellung.laeuft()) return;
    void dienst.suche.woerterEinarbeiten().then(() => { woerterFehler = ''; }, (e) => {
      // Nur einmal je Fehlerbild melden, nicht alle fünf Sekunden.
      if ((e as Error).message !== woerterFehler) log.warn('Wörterverzeichnis: neue Wörter nicht übernommen', { fehler: (e as Error).message });
      woerterFehler = (e as Error).message;
    });
  }, 5000).unref();
  setInterval(() => void nurEiner('probe', () => wiederherstellung.tick()).catch((e) => log.error('Zeitplan der Probe gestört', { fehler: (e as Error).message })), 60_000).unref();
  // Abgelaufenes aus dem Kurzzustand (#744) wegräumen – Fehlversuche, Tickets, Merker.
  setInterval(() => void nurEiner('kurzzustand', () => zustandDb.raeumeAuf()).catch((e) => log.warn('Kurzzustand nicht aufgeräumt', { fehler: (e as Error).message })), 10 * 60_000).unref();
} else {
  await laeufer.start().catch((e: unknown) => log.warn('Stand des Paket-Läufers nicht abgefragt', { fehler: (e as Error).message }));
  await aufteilung.start();
}

// Lasttest-Modus (#612): Das DMS läuft nur intern (127.0.0.1, freier Port) – dorthin misst das Skript. Unter dem Port des
// Containers steht nur die Seite mit Fortschritt und Ergebnis. Vorher prüft das Skript ohne etwas anzulegen, ob dies eine
// frische oder eine eigene Test-Installation ist; sonst läuft das DMS normal weiter und meldet den Abbruch.
let lasttestSeite: Lasttestmodus | null = null;
let intern: Server | null = null;
/** Interner Server auf 127.0.0.1 – bei mehreren Prozessen teilen sie sich denselben freien Port (listen(0) unter cluster). */
const internerServer = async () => {
  await app.ready();
  const s = createServer(app.routing);
  // Wie der Server des DMS (Fastify): dieselben Wartezeiten für Verbindungen.
  s.keepAliveTimeout = app.server.keepAliveTimeout; s.requestTimeout = app.server.requestTimeout; s.headersTimeout = app.server.headersTimeout;
  await new Promise<void>((r) => s.listen({ port: 0, host: '127.0.0.1', backlog: 2048 }, () => r()));
  return s;
};
// Weitere Prozesse (#745): Misst der Leiter gerade, beantworten auch sie nur den internen Port.
const lasttestIntern = !leiter && await verbund.rufe<boolean>('lasttest.intern').catch(() => false);
if (lasttestIntern) intern = await internerServer();
if (lasttest.wahl) {
  start.schritt('lasttest');
  const skript = lasttestSkript(env, [pfad('../../lasttest/lasttest.mjs'), pfad('../test/lasttest.mjs')]);
  if (!skript) lasttestAbbruch = t('meldungen.index.das-skript-des-lasttests');
  else {
    const s = await internerServer();
    intern = s;
    const adresse = s.address();
    const ziel = `http://127.0.0.1:${typeof adresse === 'object' && adresse ? adresse.port : 0}`;
    const skriptEnv = { ...env, DMS_GEHEIM: ordner.geheim };
    const p = await pruefeZiel(skript, ziel, skriptEnv);
    if (p.ok) {
      const daten = dirname(ordner.geheim);
      lasttestSeite = new Lasttestmodus({
        wahl: lasttest.wahl, dauer: lasttest.dauer, mappen: lasttest.mappen, speichern: lasttest.speichern, skript, ziel, ergebnisOrdner: join(daten, 'ergebnis'), env: skriptEnv,
        speicherart: erkenneSpeicherart(daten), port: cfg.port, host: cfg.host, webDir: cfg.web, proxy: cfg.proxy.trust, einbetten: cfg.einbetten,
        beenden: async () => { ganzBeenden('Lasttest beendet'); },
      });
    } else {
      lasttestAbbruch = p.grund;
      await new Promise<void>((r) => { s.closeAllConnections(); s.close(() => r()); });
      intern = null;
    }
  }
  if (lasttestAbbruch) log.error(`DMS_LASTTEST ist gesetzt, der Lasttest startet aber nicht: ${lasttestAbbruch} Ablago läuft normal weiter – entferne die Variable.`);
}

verbund.bediene('lasttest.intern', () => !!lasttestSeite);
// Sammlung für den Lasttest (#909): die Spur des Verwaltungsmodus der Mess-Sitzung nicht mitzählen – in jedem Prozess.
if (lasttestSeite || lasttestIntern) setzeLasttestModus(true);
// CPU und Speicher je Prozessgruppe (#895): nur im Leiter, nur wenn jemand fragt (der Lasttest alle 2 Sekunden).
if (leiter) {
  const gruppen = new Prozessgruppen({ postgresImContainer: env.DMS_VARIANTE === 'komplett' });
  verbund.bediene('prozessgruppen.stand', () => gruppen.stand({
    ablago: [...(verbund.primaer ? [{ nr: 0, pid: verbund.primaer, rolle: 'haupt' as const }] : []), ...verbund.prozesse().map((p) => ({ nr: p.nr, pid: p.pid, rolle: p.leiter ? 'leiter' as const : 'anfragen' as const }))],
    lastgenerator: lasttestSeite?.lastgenerator() ?? null,
  }));
}

/** Ganz Ablago beenden – bei mehreren Prozessen alle (über den Hauptprozess), sonst diesen. */
function ganzBeenden(grund: string) { if (!verbund.beendeAlle(grund)) void beenden(); }

/**
 * Geordnet beenden (#1011): Jeder Schritt läuft, auch wenn ein früherer scheitert; Fehler kommen ins Protokoll.
 * Danach endet der Prozess mit 0, oder mit 1, wenn ein Schritt gescheitert ist. Ein zweites Signal während des
 * Beendens ändert nichts.
 */
let beendetSchon = false;
const beenden = async () => {
  if (beendetSchon) return;
  beendetSchon = true;
  let gescheitert = 0;
  const schritt = async (name: string, f: () => unknown) => {
    try { await f(); } catch (e) { gescheitert++; log.error(`Beenden: ${name} fehlgeschlagen`, { fehler: (e as Error).message }); }
  };
  log.info(leiter ? 'Ablago wird beendet' : `Prozess ${verbund.nr} wird beendet`);
  await schritt('start.schliesse', () => start.schliesse());
  await schritt('lasttestSeite.stop', () => lasttestSeite?.stop());
  await schritt('interner Server', () => { if (intern) { const s = intern; return new Promise<void>((r) => { s.closeAllConnections(); s.close(() => r()); }); } });
  await schritt('texterkennung.stop', () => texterkennung.stop());
  await schritt('paketlaeufer.stop', () => paketlaeufer?.stop());
  await schritt('dienst.ereignisse.stoppe', () => dienst.ereignisse.stoppe());
  await schritt('vorschau.stop', () => vorschau.stop());
  await schritt('wartung.stop', () => wartung.stop());
  await schritt('sicherung.stop', () => sicherung.stop());
  await schritt('speicherplatz.stop', () => speicherplatz.stop());
  await schritt('webhooks.stop', () => webhooks.stop());
  await schritt('Konsole', () => leiter && konsole.entferne());
  await schritt('app.close', () => app.close());
  // Zusammenfassungen der letzten Minute (#920) noch ins Protokoll.
  await schritt('messung.leeren', () => messung.leeren());
  await schritt('extern.schreibe', () => extern.schreibe());
  await schritt('ueberlast.leeren', () => ueberlast.leeren());
  await schritt('beendeArbeiter', () => beendeArbeiter());
  await schritt('verbindungswarten.stop', () => verbindungswarten.stop());
  await schritt('poolmessung.aus', () => poolmessung.aus());
  await schritt('aufteilung.stop', () => aufteilung.stop());
  await schritt('lebt.ende', () => lebt.ende());
  await schritt('sql.end', () => sql.end({ timeout: 5 }));
  process.exit(gescheitert ? 1 : 0);
};
const beendenSignal = () => void beenden();
process.on('SIGTERM', beendenSignal);
process.on('SIGINT', beendenSignal);

// Startseite (#802) weg, Ablago selbst an den Port – die Lücke dazwischen ist nur ein Augenblick.
await start.schliesse();
// Warteschlange für neue Verbindungen (#544): Bei Überlast nimmt der Server sie verzögert an; mit 511 (Vorgabe von Node)
// bekamen einzelne Programme gar keine Verbindung mehr.
if (lasttestSeite) await lasttestSeite.start();
else if (!lasttestIntern) await app.listen({ port: cfg.port, host: cfg.host, backlog: 2048 });
// Ab jetzt läuft Ablago. Sicherheitsnetz (#877): Ein unerwarteter Fehler (etwa ein 'error'-Ereignis ohne Empfänger)
// lässt den Prozess in ungewissem Zustand zurück – darum nicht weiterlaufen, sondern mit Zusammenhang ins Protokoll,
// offene Anfragen kurz zu Ende bringen und mit Code 1 beenden. Bei mehreren Prozessen (DMS_PROZESSE) startet der
// Hauptprozess ihn neu, sonst Docker (restart: unless-stopped). Abgelehnte Promises ohne Empfänger (oben) stehen
// weiter nur im Protokoll: Sie lassen den Prozess heil, und ein Neustart beendete auch alle anderen Anfragen.
process.off('uncaughtException', beimStartfehler);
let absturz = false;
process.on('uncaughtException', (e, herkunft) => {
  if (absturz) return;
  absturz = true;
  protokoll.schreibe('error', 'system', tDe('meldungen.index.unerwarteter-fehler'), {
    fehler: e instanceof Error ? e.stack ?? e.message : String(e), herkunft, pid: process.pid, ...(verbund.mehrere ? { prozess: verbund.nr } : {}),
  });
  // Art der Ausnahme (#895, ohne Nachricht) an den Hauptprozess – sie steht dann beim Neustart (Lasttest, Systemzustand).
  verbund.absturz(e);
  process.exitCode = 1;
  setTimeout(() => process.exit(1), ABSTURZ_MS);
  void app.close().catch(() => {}).finally(() => process.exit(1));
});
verbund.bereit();
// Bei mehreren Prozessen meldet der Hauptprozess jeden bereiten Prozess.
if (leiter) log.info('Ablago ist bereit', { sekunden: Math.round((Date.now() - start.stand.seit) / 100) / 10 });
if (leiter) {
  // Lange Läufe erst jetzt im Hintergrund (#802, #724): Papierkorb, Abwesenheiten und der erste Fristenabgleich.
  void papierkorbLauf();
  void abwesenheiten();
  void fristen().catch((e) => log.error('Fristen prüfen fehlgeschlagen', { fehler: (e as Error).message }));
  const konsolenAdresse = lasttestSeite && intern ? (() => { const a = intern.address(); return `http://127.0.0.1:${typeof a === 'object' && a ? a.port : cfg.port}`; })() : lokaleUrl(cfg.port, cfg.host);
  await konsole.schreibe(konsolenAdresse)
    .catch((e) => log.warn('Konsolenzugang nicht angelegt – der Befehl dms geht nicht', { datei: konsole.datei, fehler: (e as Error).message }));
}
