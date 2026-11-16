/**
 * Start (#1278, aus `ablago.ts`): Ablago an den Port, Sicherheitsnetz für unerwartete Fehler (#877), „bereit“ und die
 * langen Läufe danach (#802, #724).
 */
import { protokoll } from '../protokoll/protokoll';
import { tDe } from '../sprache/sprache';
import { lokaleUrl } from '../system/konsole';
import type { Lasttestmodus } from '../lasttest/lasttestmodus';
import type { baueApp } from '../http/http';
import type { Server } from 'node:http';
import type { oeffneStartseite } from './startseite';
import type { vorbereiten } from './vorbereiten';
import type { richteZeitplaeneEin } from './zeitplaene';
import type { richteZugaengeEin } from './zugaenge';

/** Was laufe von früher braucht. */
type Bisher = Pick<Awaited<ReturnType<typeof oeffneStartseite>>, 'start' | 'beimStartfehler' | 'ABSTURZ_MS'> &
  Pick<Awaited<ReturnType<typeof vorbereiten>>, 'cfg' | 'verbund' | 'leiter' | 'log'> &
  Pick<Awaited<ReturnType<typeof richteZeitplaeneEin>>, 'papierkorbLauf' | 'abwesenheiten' | 'fristen'> &
  Pick<Awaited<ReturnType<typeof richteZugaengeEin>>, 'konsole'> & {
    lasttestSeite: Lasttestmodus | null;
    lasttestIntern: boolean;
    app: Awaited<ReturnType<typeof baueApp>>;
    intern: Server | null;
  };

/** Ablago an den Port und die ersten Läufe. */
export async function laufe(bisher: Bisher) {
  const {
    start,
    lasttestSeite,
    lasttestIntern,
    app,
    cfg,
    beimStartfehler,
    verbund,
    ABSTURZ_MS,
    leiter,
    log,
    papierkorbLauf,
    abwesenheiten,
    fristen,
    intern,
    konsole,
  } = bisher;

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
      fehler: e instanceof Error ? (e.stack ?? e.message) : String(e),
      herkunft,
      pid: process.pid,
      ...(verbund.mehrere ? { prozess: verbund.nr } : {}),
    });
    // Art der Ausnahme (#895, ohne Nachricht) an den Hauptprozess – sie steht dann beim Neustart (Lasttest, Systemzustand).
    verbund.absturz(e);
    process.exitCode = 1;
    setTimeout(() => process.exit(1), ABSTURZ_MS);
    void app
      .close()
      .catch(() => {})
      .finally(() => process.exit(1));
  });
  verbund.bereit();
  // Bei mehreren Prozessen meldet der Hauptprozess jeden bereiten Prozess.
  if (leiter) log.info('Ablago ist bereit', { sekunden: Math.round((Date.now() - start.stand.seit) / 100) / 10 });
  if (leiter) {
    // Lange Läufe erst jetzt im Hintergrund (#802, #724): Papierkorb, Abwesenheiten und der erste Fristenabgleich.
    void papierkorbLauf();
    void abwesenheiten();
    void fristen().catch((e) => log.error('Fristen prüfen fehlgeschlagen', { fehler: (e as Error).message }));
    const konsolenAdresse =
      lasttestSeite && intern
        ? (() => {
            const a = intern.address();
            return `http://127.0.0.1:${typeof a === 'object' && a ? a.port : cfg.port}`;
          })()
        : lokaleUrl(cfg.port, cfg.host);
    await konsole
      .schreibe(konsolenAdresse)
      .catch((e) =>
        log.warn('Konsolenzugang nicht angelegt – der Befehl dms geht nicht', { datei: konsole.datei, fehler: (e as Error).message }),
      );
  }
  return {};
}
