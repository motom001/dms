import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { migriere, verbinde } from './db';
import { Dienst } from './dienst';
import { ordnerSpeicher } from './dateispeicher';
import { baueApp } from './http';
import { Konten } from './konten';
import { pgKontoRepo } from './konto-repo';
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

if (!cfg.datenbank) {
  console.error('DATABASE_URL fehlt, z. B. postgres://dms:geheim@localhost:5432/dms');
  process.exit(1);
}

const sql = verbinde(cfg.datenbank);
await migriere(sql, cfg.migrationen);
await mkdir(cfg.dateien, { recursive: true });

const mailer = erstelleMailer({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT ? Number(env.SMTP_PORT) : undefined,
  secure: env.SMTP_SECURE ? env.SMTP_SECURE === 'true' : undefined,
  user: env.SMTP_USER,
  pass: env.SMTP_PASS,
  absender: env.SMTP_FROM,
});

const konten = new Konten(pgKontoRepo(sql, cfg.haushalt), mailer, cfg.appUrl);
const app = await baueApp(new Dienst(pgRepo(sql, cfg.haushalt), ordnerSpeicher(cfg.dateien, cfg.haushalt)), konten, {
  webDir: cfg.web,
  logger: { level: env.LOG_LEVEL ?? 'info' },
  sicher: cfg.appUrl.startsWith('https://'),
  proxy: cfg.proxy,
});

app.log.info(`E-Mail-Versand: ${mailer ? `über ${env.SMTP_HOST}` : 'aus (SMTP_HOST nicht gesetzt) – Links werden in der Benutzerverwaltung angezeigt'}`);
app.log.info(`Links in E-Mails zeigen auf ${cfg.appUrl}`);
if (await konten.einrichtungNoetig()) app.log.warn(`Noch kein Benutzer vorhanden: Der erste Aufruf von ${cfg.appUrl} legt den Administrator an.`);

const beenden = async () => {
  await app.close();
  await sql.end({ timeout: 5 });
  process.exit(0);
};
process.on('SIGTERM', beenden);
process.on('SIGINT', beenden);

await app.listen({ port: cfg.port, host: cfg.host });
