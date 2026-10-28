import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { migriere, verbinde } from './db';
import { Dienst } from './dienst';
import { ordnerSpeicher } from './dateispeicher';
import { baueApp } from './http';
import { Konten } from './konten';
import { pgKontoRepo } from './konto-repo';
import { Messung, pgMessSpeicher } from './messung';
import { protokoll } from './protokoll';
import { pgSystemQuelle } from './system';
import { Designs, pgDesignRepo } from './designs';
import { ApiSchluesselDienst, pgApiSchluesselRepo } from './apischluessel';
import { pgRepo } from './repo-pg';
import { erstelleMailer } from './smtp';

const pfad = (rel: string) => fileURLToPath(new URL(rel, import.meta.url));
const env = process.env;

const cfg = {
  datenbank: env.DATABASE_URL,
  port: Number(env.PORT ?? 3000),
  host: env.HOST ?? '0.0.0.0',
  dateien: env.FILES_DIR ?? pfad('../../data/files'),
  web: env.WEB_DIR ?? pfad('../../web/dist'),
  migrationen: env.MIGRATIONS_DIR ?? pfad('../migrations'),
  haushalt: env.HAUSHALT_ID ?? '00000000-0000-4000-8000-000000000001',
  /** Adresse, unter der Benutzer das DMS erreichen – für Links in E-Mails. */
  appUrl: env.APP_URL ?? `http://localhost:${env.PORT ?? 3000}`,
  proxy: env.TRUST_PROXY === 'true',
};

const log = protokoll.modul('system');
const version = env.DMS_VERSION ?? 'Entwicklung';
log.info(`DMS startet (Version ${version})`, { node: process.version, port: cfg.port, protokoll: protokoll.stufe });

// Unerwartete Fehler außerhalb von Anfragen nicht verschlucken.
process.on('unhandledRejection', (e) => protokoll.schreibe('error', 'system', 'Unbehandelter Fehler', { fehler: e instanceof Error ? e.stack : String(e) }));

if (!cfg.datenbank) {
  console.error('DATABASE_URL fehlt, z. B. postgres://dms:geheim@localhost:5432/dms');
  process.exit(1);
}

const sql = verbinde(cfg.datenbank);
await migriere(sql, cfg.migrationen, (m) => protokoll.modul('datenbank').info(m));
const [{ server_version: pgVersion }] = await sql`SHOW server_version`;
protokoll.modul('datenbank').info('Datenbank verbunden', { postgres: pgVersion });
await mkdir(cfg.dateien, { recursive: true });

const mailer = erstelleMailer({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT ? Number(env.SMTP_PORT) : undefined,
  secure: env.SMTP_SECURE ? env.SMTP_SECURE === 'true' : undefined,
  user: env.SMTP_USER,
  pass: env.SMTP_PASS,
  absender: env.SMTP_FROM,
});

// Jeder Datenbankzugriff der Repos wird gezählt und gestoppt (Entwicklermodus, lange Zugriffe).
const messung = new Messung(pgMessSpeicher(sql, cfg.haushalt));
await messung.start();
const dienst = new Dienst(messung.umhuelle(pgRepo(sql, cfg.haushalt), 'mappen'), ordnerSpeicher(cfg.dateien, cfg.haushalt));
// Benutzer erscheinen als Mappen (#26); die Konten halten sie auf dem neuesten Stand.
const konten = new Konten(messung.umhuelle(pgKontoRepo(sql, cfg.haushalt), 'konto'), mailer, cfg.appUrl, dienst.benutzerspiegel());
const app = await baueApp(dienst, konten, {
  webDir: cfg.web,
  sicher: cfg.appUrl.startsWith('https://'),
  proxy: cfg.proxy,
  messung,
  system: pgSystemQuelle(sql, cfg.haushalt),
  designs: new Designs(messung.umhuelle(pgDesignRepo(sql, cfg.haushalt), 'designs')),
  apiSchluessel: new ApiSchluesselDienst(messung.umhuelle(pgApiSchluesselRepo(sql), 'apischluessel')),
  mailHost: mailer ? env.SMTP_HOST : undefined,
});

log.info(`E-Mail-Versand: ${mailer ? `über ${env.SMTP_HOST}` : 'aus (SMTP_HOST nicht gesetzt) – Links werden in der Benutzerverwaltung angezeigt'}`);
log.info(`Links in E-Mails zeigen auf ${cfg.appUrl}`);
const nachgezogen = await dienst.titelNachziehen();
if (nachgezogen) log.info(`Titel von ${nachgezogen} Mappen berechnet`);
// Systemtypen Benutzer und Rolle anlegen und jedem Benutzer seine Mappe geben (auch nach einem Update).
await dienst.gleicheBenutzerAb(await konten.listeBenutzer());
const geprueft = await dienst.passungNachziehen();
if (geprueft) log.info(`Mappen von ${geprueft} Mappentypen gegen ihre Definition geprüft`);
if (await konten.einrichtungNoetig()) log.warn(`Noch kein Benutzer vorhanden: Der erste Aufruf von ${cfg.appUrl} legt den Administrator an.`);

const beenden = async () => {
  log.info('DMS wird beendet');
  await app.close();
  await sql.end({ timeout: 5 });
  process.exit(0);
};
process.on('SIGTERM', beenden);
process.on('SIGINT', beenden);

await app.listen({ port: cfg.port, host: cfg.host });
