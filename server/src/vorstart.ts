/**
 * Vorstart in dms-komplett (#1250): zeigt die Startseite „Ablago startet …“ (#802) schon in der ersten Sekunde nach dem
 * Containerstart – während deploy/komplett/start.sh PostgreSQL anlegt und startet, also noch bevor Ablago selbst läuft.
 * Seit #1354 auch im Image dms, solange das Start-Skript die Ordner für den Benutzer von Ablago übernimmt.
 * Eigener kleiner Bündel (dist/vorstart.js), ohne Datenbank und ohne Ablage: nur Port, Schritt und Handbücher.
 *
 * - Den Schritt schreibt start.sh in eine Datei (DMS_VORSTART_DATEI): eine Zeile wie `pg-anlegen`, `pg-start`, `ablago`
 *   oder `fehler rechte`. Der Vorstart liest sie alle 300 ms; Unbekanntes lässt er liegen.
 * - Ablago übernimmt den Port ohne Lücke: Beide lauschen mit SO_REUSEPORT; sobald Ablago lauscht, schickt es SIGTERM an
 *   diesen Prozess (DMS_VORSTART_PID, setzt start.sh, startmodus.ts). Der Vorstart gibt den Port sanft frei und endet.
 * - Bei einem Fehler zeigt die Seite Grund und Ausweg; start.sh wartet dann einige Minuten und beendet den Container,
 *   damit Docker ihn neu startet.
 * - /api/gesundheit meldet 503 „startet“ – ohne Kennung des Stands (der Zufallswert der Installation ist hier unbekannt,
 *   ohne ihn verriete die Kennung die Version).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Startmodus } from './einrichtung/startmodus';
import { VORSTART_GRUENDE, type Startschritt, type VorstartGrund } from './einrichtung/startfehler';
import { einbettenAus } from './http/koepfe';
import { proxyVertrauen } from './http/proxy';
import { startseitenKennung } from './einrichtung/dienstbenutzer';

const env = process.env;
const DATEI = env.DMS_VORSTART_DATEI ?? '/tmp/ablago-vorstart';
const SCHRITTE: readonly Startschritt[] = ['pg-anlegen', 'pg-start', 'rechte', 'ablago'];

const start = new Startmodus({
  port: Number(env.PORT ?? 3000),
  host: env.HOST ?? '0.0.0.0',
  webDir: env.WEB_DIR ?? fileURLToPath(new URL('../../web/dist', import.meta.url)),
  proxy: proxyVertrauen(env.TRUST_PROXY).trust,
  einbetten: einbettenAus(env.DMS_EINBETTEN),
  seit: Number(env.DMS_VORSTART_SEIT) * 1000 || undefined,
  // Auch im Image dms (#1354), solange das Start-Skript die Ordner übernimmt oder dabei scheitert.
  komplett: env.DMS_VARIANTE === 'komplett',
  ohneStand: true,
  teilen: true,
  // Benutzer von Ablago und was das Start-Skript dafür geändert hat (#1466).
  kennung: () => startseitenKennung(env),
});
start.schritt('pg-start');

/** Schritt aus der Datei übernehmen. */
function uebernimm() {
  let zeile: string;
  try {
    zeile = readFileSync(DATEI, 'utf8').trim();
  } catch {
    return;
  }
  const [wort, grund] = zeile.split(/\s+/);
  if (wort === 'fehler' && VORSTART_GRUENDE.includes(grund as VorstartGrund)) start.vorstartFehler(grund as VorstartGrund);
  else if (SCHRITTE.includes(wort as Startschritt)) start.schritt(wort as Startschritt);
}

let endet = false;
async function ende() {
  if (endet) return;
  endet = true;
  clearInterval(takt);
  await start.schliesse().catch(() => {});
  process.exit(0);
}
process.on('SIGTERM', () => void ende());
process.on('SIGINT', () => void ende());

uebernimm();
const takt = setInterval(uebernimm, 300);
try {
  await start.oeffne();
} catch (e) {
  // Port belegt o. Ä.: ohne Seite weiter wie bisher – start.sh macht trotzdem weiter.
  console.error(`[dms-komplett] Vorstart ohne Seite: ${(e as Error).message}`);
  clearInterval(takt);
  process.exit(0);
}
