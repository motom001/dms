import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { migriere, verbinde } from './db';
import { Dienst } from './dienst';
import { baueApp } from './http';
import { pgRepo } from './repo-pg';

const pfad = (rel: string) => fileURLToPath(new URL(rel, import.meta.url));

const cfg = {
  datenbank: process.env.DATABASE_URL,
  port: Number(process.env.PORT ?? 3000),
  host: process.env.HOST ?? '0.0.0.0',
  dateien: process.env.FILES_DIR ?? pfad('../../data/files'),
  web: process.env.WEB_DIR ?? pfad('../../web/dist'),
  migrationen: process.env.MIGRATIONS_DIR ?? pfad('../migrations'),
  haushalt: process.env.HAUSHALT_ID ?? '00000000-0000-4000-8000-000000000001',
};

if (!cfg.datenbank) {
  console.error('DATABASE_URL fehlt, z. B. postgres://dms:geheim@localhost:5432/dms');
  process.exit(1);
}

const sql = verbinde(cfg.datenbank);
await migriere(sql, cfg.migrationen);
await mkdir(cfg.dateien, { recursive: true });

const app = await baueApp(new Dienst(pgRepo(sql, cfg.haushalt)), { webDir: cfg.web, logger: { level: process.env.LOG_LEVEL ?? 'info' } });

const beenden = async () => {
  await app.close();
  await sql.end({ timeout: 5 });
  process.exit(0);
};
process.on('SIGTERM', beenden);
process.on('SIGINT', beenden);

await app.listen({ port: cfg.port, host: cfg.host });
