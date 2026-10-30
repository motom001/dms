import { existsSync } from 'node:fs';
import { proxyVertrauen } from './proxy';
import { mkdir, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { migriere, verbinde } from './db';
import { Dienst } from './dienst';
import { mitPruefung, ordnerSpeicher } from './dateispeicher';
import { Speicherplatz, type SpeicherplatzDeps } from './speicherplatz';
import { baueApp } from './http';
import { Konten } from './konten';
import { pgKontoRepo } from './konto-repo';
import { Messung, pgMessSpeicher } from './messung';
import { protokoll } from './protokoll';
import { pgSystemQuelle } from './system';
import { Designs, pgDesignRepo } from './designs';
import { ApiSchluesselDienst, pgApiSchluesselRepo } from './apischluessel';
import { pgRepo } from './repo-pg';
import { Betrieb, pgBetriebSpeicher } from './betrieb';
import { Tresor } from './tresor';
import { pruefeOrdner, SCHLUESSELDATEI } from './ordner';
import { alsUrl, ANBINDUNG_DATEI, AnbindungVerwaltung, ausUrl, ausVariablen, liesAnbindung, pruefeAnbindung, schreibeAnbindung, type Anbindung } from './anbindung';
import { Einrichtungscode } from './einrichtungscode';
import { einrichtungsmodus } from './einrichtungsmodus';
import { Einrichtung } from './einrichtung';
import { bestimmeMandant, mandantNamen } from './mandant';
import { Texterkennung } from './texterkennung';
import { Aufgabenmail } from './aufgabenmail';
import { Fehlermeldungen, pgFehlerRepo } from './fehlermeldungen';
import { Wartung } from './wartung';
import { Notfallzugang } from './notfall';
import { anAlleAdmins } from './mail';
import { arch, release, type } from 'node:os';
import { pgDatenquelle } from './datenbankabzug';
import { pgEinstellungen } from './einstellungen';
import { Sicherung } from './sicherung';
import { eigeneVersion } from './system';
import { Wiederherstellung } from './wiederherstellung';
import { heuteIn } from '../../shared/src/sichten';

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
};

const log = protokoll.modul('system');
// Feste Ordner (#115): nur über die Volumes der Compose-Datei zugeordnet.
const ordnerPruefung = pruefeOrdner(env, pfad('../../data'));
const { ordner } = ordnerPruefung;
const version = env.DMS_VERSION ?? 'Entwicklung';
log.info(`DMS startet (Version ${version})`, { node: process.version, port: cfg.port, protokoll: protokoll.stufe, proxy: cfg.proxy.text });
if (cfg.proxy.fehler) log.warn(cfg.proxy.fehler);

// Unerwartete Fehler außerhalb von Anfragen nicht verschlucken.
process.on('unhandledRejection', (e) => protokoll.schreibe('error', 'system', 'Unbehandelter Fehler', { fehler: e instanceof Error ? e.stack : String(e) }));

for (const f of ordnerPruefung.fehler) console.error(f);
if (ordnerPruefung.fehler.length) {
  log.error('Start abgebrochen: frühere Variable für einen Ordner mit abweichendem Wert', { variablen: ordnerPruefung.fehler.length });
  process.exit(1);
}
for (const v of ordnerPruefung.ueberfluessig) log.warn(`${v} ist nicht mehr nötig und kann aus der Compose-Datei entfernt werden (die Ordner im Container sind fest).`);

for (const o of Object.values(ordner)) await mkdir(o, { recursive: true });

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
  if (env.DATABASE_URL) log.info(`DATABASE_URL in ${ANBINDUNG_DATEI} übernommen – die Variable ist nicht mehr nötig und kann aus der Compose-Datei entfernt werden`);
  else log.info(`Datenbank-Anbindung aus DMS_DB_PASSWORT in ${ANBINDUNG_DATEI} übernommen`);
}
if (!verbunden) {
  anbindung = await einrichtungsmodus({
    geheim: ordner.geheim, code: einrichtungscode, vorbelegt: kandidat, quelle, fehler: startfehler,
    port: cfg.port, host: cfg.host, webDir: cfg.web, proxy: cfg.proxy.trust, wiederholenMs: kandidat ? 10_000 : undefined,
  });
}
const db = anbindung!;
const datenbankUrl = alsUrl(db);
const sql = verbinde(datenbankUrl);
await migriere(sql, cfg.migrationen, (m) => protokoll.modul('datenbank').info(m));
const [{ server_version: pgVersion }] = await sql`SHOW server_version`;
protokoll.modul('datenbank').info('Datenbank verbunden', { postgres: pgVersion, host: db.host, datenbank: db.datenbank });
const mandant = await bestimmeMandant(sql, db, env, (a) => schreibeAnbindung(ordner.geheim, a));
cfg.haushalt = mandant.id;
if (mandant.hinweis) log.warn(mandant.hinweis);

// E-Mail-Versand und Adresse des DMS stehen in der Werkbank (#37); frühere Umgebungsvariablen
// werden beim ersten Start nach dem Update einmalig übernommen.
// Schlüssel für verschlüsselte Zugangsdaten (#39): eine Datei, nie in der Datenbank.
const tresor = new Tresor(pgBetriebSpeicher(sql, cfg.haushalt), join(ordner.geheim, SCHLUESSELDATEI));
await tresor.laden();
const betrieb = new Betrieb(pgBetriebSpeicher(sql, cfg.haushalt), `http://localhost:${cfg.port}`, tresor);
await betrieb.laden();
await betrieb.uebernimmAlteVariablen(env);

// Jeder Datenbankzugriff der Repos wird gezählt und gestoppt (Entwicklermodus, lange Zugriffe).
const messung = new Messung(pgMessSpeicher(sql, cfg.haushalt));
await messung.start();
// Speicherplatz (#116): an der Grenze ist das Hochladen gesperrt; Wartung und Mail kommen unten dazu.
const spDeps: SpeicherplatzDeps = { einstellungen: pgEinstellungen(sql, cfg.haushalt) };
const speicherplatz = new Speicherplatz(ordner, spDeps);
const hochladen = () => speicherplatz.pruefeHochladen();
const dienst = new Dienst(messung.umhuelle(pgRepo(sql, cfg.haushalt), 'mappen'), mitPruefung(ordnerSpeicher(ordner.dateien, cfg.haushalt), hochladen), {
  tresor, einstellungen: pgBetriebSpeicher(sql, cfg.haushalt),
});
// Benutzer erscheinen als Mappen (#26); die Konten halten sie auf dem neuesten Stand.
const konten = new Konten(messung.umhuelle(pgKontoRepo(sql, cfg.haushalt), 'konto'), () => betrieb.mailer(), () => betrieb.adresseFuerLinks(), dienst.benutzerspiegel());
dienst.verbindeKonten(konten.papierkorbHaken());
// Texterkennung im Hintergrund (#45); dieselbe Datenbank, eigener Messbereich.
// Wartungsmodus (#102): überdauert einen Neustart; pausiert die Hintergrundarbeiten.
const wartung = new Wartung(pgBetriebSpeicher(sql, cfg.haushalt), konten);
await wartung.laden();
wartung.start();
// Notfallzugang über eine RESCUE-Datei neben der Schlüsseldatei (#108).
const anAdmins = async (betreff: string, text: string) => { await anAlleAdmins(await konten.listeBenutzer(), betrieb.mailer(), betreff, text); };
spDeps.wartung = wartung;
spDeps.anAdmins = anAdmins;
const notfall = new Notfallzugang(join(dirname(tresor.datei), 'RESCUE'), konten, pgBetriebSpeicher(sql, cfg.haushalt), anAdmins);
// Sicherungen (#103–#105): eigenes Volume, verschlüsselt mit dem Schlüssel der Werkbank.
const sicherung = new Sicherung(ordner.sicherung, ordner.dateien, cfg.haushalt, {
  tresor, einstellungen: pgEinstellungen(sql, cfg.haushalt), daten: pgDatenquelle(sql),
  umgebung: async () => ({ dms: eigeneVersion(), node: process.versions.node, system: `${type()} ${release()}`, architektur: arch() }),
  wartungAktiv: () => wartung.aktiv, anAdmins,
});
// Wiederherstellen und Probe (#107, #109): eigenes Schema, erst nach allen Prüfungen umschalten.
const wiederherstellung = new Wiederherstellung({
  url: datenbankUrl, sql, migrationen: cfg.migrationen, dateiWurzel: ordner.dateien, sicherung, tresor,
  laufzeit: async () => ({ dms: eigeneVersion(), postgres: String(pgVersion), architektur: arch(), haushaltId: cfg.haushalt, migrationen: (await readdir(cfg.migrationen)).filter((f) => f.endsWith('.sql')).sort() }),
  wartungAktiv: () => wartung.aktiv,
  einrichtungNoetig: () => konten.einrichtungNoetig(),
  // Im Container startet Docker (restart: unless-stopped) das DMS gleich wieder.
  neustart: () => { log.warn('Neustart nach der Wiederherstellung'); void beenden(); },
  // Gehört die Sicherung zu einem anderen Mandanten, gilt nach dem Neustart dessen Id (#119).
  mandantUebernehmen: async (id) => { await schreibeAnbindung(ordner.geheim, { ...db, mandant: id }); },
  pruefeCode: (c) => einrichtungscode.pruefe(c),
  anAdmins,
});
sicherung.sperre = () => wiederherstellung.laeuft();
await wiederherstellung.raeumeAuf();
const abschluss = await pgEinstellungen(sql, cfg.haushalt).lies('wiederherstellung_abschluss') as { sicherung?: string } | null;
if (abschluss) log.warn('Gestartet nach einer Wiederherstellung', { sicherung: abschluss.sicherung });
const texterkennung = new Texterkennung(messung.umhuelle(pgRepo(sql, cfg.haushalt), 'texterkennung'), ordnerSpeicher(ordner.dateien, cfg.haushalt), pgBetriebSpeicher(sql, cfg.haushalt));
dienst.verbindeTexterkennung(texterkennung);
texterkennung.pause = () => wartung.aktiv;
wartung.beimAusschalten(() => texterkennung.anstossen());
// Tägliche Zusammenfassung der offenen Aufgaben (#54).
const typName = async (id: string | undefined) => (await dienst.listeTypen()).find((t) => t.id === id)?.name ?? '';
const aufgabenmail = new Aufgabenmail({
  benutzer: () => konten.listeBenutzer(),
  einstellungenVon: (b) => konten.einstellungen(b),
  // Aufgaben zu Mappen, die der Empfänger nicht lesen darf, ohne Titel (#127).
  aufgabenVon: async (b) => dienst.meineAufgaben(b, await dienst.zugriff(b)),
  typName,
}, () => betrieb.mailer(), () => betrieb.adresseFuerLinks(), pgBetriebSpeicher(sql, cfg.haushalt));
const designs = new Designs(messung.umhuelle(pgDesignRepo(sql, cfg.haushalt), 'designs'), mitPruefung(ordnerSpeicher(ordner.dateien, `${cfg.haushalt}/designs`), hochladen));
// Einrichtungsassistent (#119): Mandant und Administrator mit Code, danach die weiteren Schritte.
const einrichtungNoetig = await konten.einrichtungNoetig();
if (einrichtungNoetig) await einrichtungscode.bereitstellen();
else if (existsSync(einrichtungscode.datei)) await einrichtungscode.entfernen();
const einrichtung = new Einrichtung({
  konten, code: einrichtungNoetig ? einrichtungscode : null, einstellungen: pgEinstellungen(sql, cfg.haushalt),
  mandant: mandantNamen(sql, cfg.haushalt), schriftzug: (t) => designs.setzeSchriftzug(t),
});
const anbindungVerwaltung = new AnbindungVerwaltung(ordner.geheim, db, umgebung, () => { void beenden(); });
const app = await baueApp(dienst, konten, {
  webDir: cfg.web,
  sicher: () => betrieb.cookieNurHttps(),
  proxy: cfg.proxy.trust,
  messung,
  system: pgSystemQuelle(sql, cfg.haushalt),
  designs,
  einrichtung,
  anbindung: anbindungVerwaltung,
  mandantHinweis: mandant.hinweis,
  apiSchluessel: new ApiSchluesselDienst(messung.umhuelle(pgApiSchluesselRepo(sql), 'apischluessel')),
  betrieb,
  tresor,
  texterkennung,
  aufgabenmail,
  // Screenshots der Fehlermeldungen getrennt von den Dokumenten (#70).
  wartung,
  notfall,
  sicherung,
  wiederherstellung,
  speicherplatz,
  ordner: ordnerPruefung,
  fehlermeldungen: new Fehlermeldungen(pgFehlerRepo(sql, cfg.haushalt), ordnerSpeicher(ordner.dateien, `${cfg.haushalt}/fehlermeldungen`)),
});

const kurz = betrieb.kurz();
log.info(`E-Mail-Versand: ${kurz.mail === 'aus' ? 'aus – Links werden in der Benutzerverwaltung angezeigt (einrichten in Werkbank → E-Mail und Adresse)' : kurz.mail}`);
log.info(`Adresse für Links: ${kurz.adresse}`);
const nachgezogen = await dienst.titelNachziehen();
if (nachgezogen) log.info(`Titel von ${nachgezogen} Mappen berechnet`);
// Systemtypen Benutzer und Rolle anlegen und jedem Benutzer seine Mappe geben (auch nach einem Update).
await dienst.gleicheBenutzerAb(await konten.listeBenutzer());
// Schlüssel für Mappentypen (#145), einmalig nach dem Update.
await dienst.typSchluesselNachziehen();
// Haken „Neue Mappen/Löschen erlauben“ → Berechtigungen (#146), einmalig nach dem Update.
await dienst.hakenUeberfuehren();
const geprueft = await dienst.passungNachziehen();
if (geprueft) log.info(`Mappen von ${geprueft} Mappentypen gegen ihre Definition geprüft`);
// Papierkorb (#43): Abgelaufenes stündlich endgültig löschen.
const papierkorb = async () => { if (!wartung.aktiv) await dienst.raeumePapierkorbAuf(); };
const papierkorbLauf = () => papierkorb().catch((e) => log.error('Papierkorb aufräumen fehlgeschlagen', { fehler: (e as Error).message }));
await papierkorbLauf();
setInterval(papierkorbLauf, 60 * 60 * 1000).unref();
// Abwesenheit (#78): Abgelaufenes beenden, „abwesend“ an den Benutzer-Mappen nachziehen.
const abwesenheiten = () => konten.abwesenheitenPruefen().catch((e) => log.error('Abwesenheiten prüfen fehlgeschlagen', { fehler: (e as Error).message }));
await abwesenheiten();
setInterval(abwesenheiten, 60 * 60 * 1000).unref();
// Fristen und Erinnerungen (#129, #131): einmal am Tag – gleich nach Mitternacht bzw. beim Start –, vor der Zusammenfassung.
let fristenTag = '';
const fristen = async () => {
  const heute = heuteIn();
  if (wartung.aktiv || heute === fristenTag) return;
  const r = await dienst.fristenLauf(heute);
  fristenTag = heute;
  if (r.angelegt || r.erledigt || r.erinnerungen) log.info('Fristen und Erinnerungen geprüft', r);
};
await fristen().catch((e) => log.error('Fristen prüfen fehlgeschlagen', { fehler: (e as Error).message }));
setInterval(() => void fristen().then(() => (wartung.aktiv ? 0 : aufgabenmail.pruefe()))
  .catch((e) => log.error('Fristen oder Aufgaben-Mail fehlgeschlagen', { fehler: (e as Error).message })), 5 * 60 * 1000).unref();
if (einrichtungNoetig) log.warn(`Noch kein Benutzer vorhanden: Öffne das DMS im Browser (Port ${cfg.port}) und richte es mit dem Einrichtungscode ein.`);

await texterkennung.start();
notfall.start();
sicherung.start();
speicherplatz.start();
setInterval(() => void wiederherstellung.tick().catch((e) => log.error('Zeitplan der Probe gestört', { fehler: (e as Error).message })), 60_000).unref();

const beenden = async () => {
  log.info('DMS wird beendet');
  texterkennung.stop();
  wartung.stop();
  notfall.stop();
  sicherung.stop();
  speicherplatz.stop();
  await app.close();
  await sql.end({ timeout: 5 });
  process.exit(0);
};
process.on('SIGTERM', beenden);
process.on('SIGINT', beenden);

await app.listen({ port: cfg.port, host: cfg.host });
