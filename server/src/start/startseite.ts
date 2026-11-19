/**
 * Start (#1278, aus `ablago.ts`): Prüfungen vor dem Start (Volume der Datenbank #943, frühere Ordner-Variablen),
 * Ordner anlegen und die Startseite „Ablago startet …“ (#802) mit dem Verhalten bei einem Startfehler.
 */
import { datenbankOhneVolume, DATENBANK_RETTEN } from '../datenbank/anbindung';
import { tDe } from '../sprache/sprache';
import { protokoll } from '../protokoll/protokoll';
import { VARIABLEN_GRUND } from '../../../shared/src/umgebungsvariablen';
import { mkdir } from 'node:fs/promises';
import { exportOrdnerVon } from '../export/exportordner';
import { Startmodus } from '../einrichtung/startmodus';
import { startseitenKennung } from '../einrichtung/dienstbenutzer';
import { NeuereDatenbankFehler } from '../datenbank/db';
import type { vorbereiten } from './vorbereiten';

/** Was oeffneStartseite von früher braucht. */
type Bisher = Pick<
  Awaited<ReturnType<typeof vorbereiten>>,
  'leiter' | 'log' | 'ordnerPruefung' | 'ordner' | 'cfg' | 'verbund' | 'lasttest'
> & {
  env: NodeJS.ProcessEnv;
};

/** Prüfungen, Ordner und Startseite. */
export async function oeffneStartseite(bisher: Bisher) {
  const { env, leiter, log, ordnerPruefung, ordner, cfg, verbund, lasttest } = bisher;
  // dms-komplett (#943): /data/postgres nicht eingebunden – die Datenbank ginge beim nächsten Update verloren.
  // Einmal beim Start geprüft (Einhängepunkte ändern sich zur Laufzeit nicht); Übersicht und Anbindung zeigen es rot.
  // Im Lasttest-Modus (#1251) ist das gewollt: nur ein Hinweis, keine Schreckmeldung.
  const ohneDatenbankVolume = datenbankOhneVolume(env);
  if (ohneDatenbankVolume && leiter && lasttest.wahl) log.info(tDe('meldungen.index.datenbank-ohne-volume-lasttest'));
  else if (ohneDatenbankVolume && leiter) log.error(tDe('meldungen.index.datenbank-ohne-volume', { link: DATENBANK_RETTEN }));

  // Unerwartete Fehler außerhalb von Anfragen nicht verschlucken.
  process.on('unhandledRejection', (e) =>
    protokoll.schreibe('error', 'system', tDe('meldungen.index.unbehandelter-fehler'), {
      fehler: e instanceof Error ? e.stack : String(e),
    }),
  );

  for (const f of ordnerPruefung.fehler) console.error(f);
  if (ordnerPruefung.fehler.length) {
    log.error('Start abgebrochen: frühere Variable für einen Ordner mit abweichendem Wert', { variablen: ordnerPruefung.fehler.length });
    process.exit(1);
  }
  for (const v of ordnerPruefung.ueberfluessig)
    log.warn(`${v} ist nicht mehr nötig und kann aus der Compose-Datei entfernt werden. ${VARIABLEN_GRUND.ordner}`);

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
  // dms-komplett (#1250): Bis hierher zeigte der Vorstart (vorstart.ts) die Seite, schon während PostgreSQL angelegt
  // wurde. Startmodus übernimmt den Port von ihm (DMS_VORSTART_PID) und zählt „Läuft seit“ weiter (DMS_VORSTART_SEIT).
  const vorgaenger = Number(env.DMS_VORSTART_PID) || null;
  const start = new Startmodus({
    port: cfg.port,
    host: cfg.host,
    webDir: cfg.web,
    proxy: cfg.proxy.trust,
    einbetten: cfg.einbetten,
    komplett: env.DMS_VARIANTE === 'komplett',
    vorgaenger,
    // Sekunden seit 1970 (date +%s in start.sh).
    seit: Number(env.DMS_VORSTART_SEIT) * 1000 || undefined,
    // Benutzer von Ablago und was das Start-Skript dafür geändert hat (#1466).
    kennung: () => startseitenKennung(env),
  });
  if (verbund.erster) await start.oeffne();
  let fehlerNeustart: NodeJS.Timeout | null = null;
  const beimStartfehler = (e: unknown) => {
    const f = start.fehler(e);
    log.error(`Start abgebrochen: ${(e as Error)?.message ?? String(e)}`, {
      schritt: start.stand.schritt,
      ...(e instanceof NeuereDatenbankFehler ? { unbekannt: e.unbekannt.join(', ') } : { fehler: (e as Error)?.stack ?? String(e) }),
    });
    // Ohne offene Startseite (Einrichtungsmodus, kurz vor dem Port von Ablago) zeigt niemand den Grund: gleich beenden wie bisher.
    if (!start.offen) process.exit(1);
    if (f.art !== 'neuere-datenbank' && !fehlerNeustart) fehlerNeustart = setTimeout(() => process.exit(1), FEHLER_NEUSTART_MS);
  };
  process.on('uncaughtException', beimStartfehler);
  return { ohneDatenbankVolume, ABSTURZ_MS, start, beimStartfehler };
}
