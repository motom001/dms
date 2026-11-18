/**
 * Start (#1278, aus `ablago.ts`): Tresor (#39), Betrieb und Mail (#37), Messung, Hintergrund (#893), Arbeiter (#542),
 * Region (#726), Sprachen (#729), Speicherplatz (#116) und temporäre Uploads (#746).
 */
import { Tresor } from '../geheimnisse/tresor';
import { pgBetriebSpeicher, Betrieb } from '../einstellungen/betrieb';
import { join } from 'node:path';
import { SCHLUESSELDATEI } from '../dateien/ordner';
import { Messung, pgMessSpeicher } from '../datenbank/messung';
import { extern, pgExternSpeicher } from '../system/externmessung';
import { pgEinstellungen } from '../einstellungen/einstellungen';
import { meldeBenutzer, richteHintergrundEin } from '../prozesse/hintergrund';
import { tDe } from '../sprache/sprache';
import { richteZwischenspeicherEin } from '../zwischenspeicher/zaehlerspeicher';
import { richteArbeiterEin } from '../arbeit';
import { RegionDienst } from '../einstellungen/region';
import { SprachDienst } from '../sprache/sprachwahl';
import { type SpeicherplatzDeps, Speicherplatz } from '../dateien/speicherplatz';
import { richteHochladenEin, raeumeHochladenAuf } from '../dateien/hochladen';
import { UPLOAD_ALTER_MS } from '../prozesse/aufteilung';
import type { verbindeDatenbank } from './datenbank';
import type { vorbereiten } from './vorbereiten';

/** Was richteBetriebEin von früher braucht. */
type Bisher = Pick<Awaited<ReturnType<typeof verbindeDatenbank>>, 'sql' | 'zustandDb' | 'lebt'> &
  Pick<Awaited<ReturnType<typeof vorbereiten>>, 'cfg' | 'ordner' | 'leiter' | 'log' | 'verbund'> & { env: NodeJS.ProcessEnv };

/** Tresor, Betrieb, Messung, Arbeiter, Region, Sprachen und Speicherplatz. */
export async function richteBetriebEin(bisher: Bisher) {
  const { sql, cfg, ordner, leiter, env, log, verbund, zustandDb, lebt } = bisher;

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
  if (leiter)
    log.info(hintergrund.wert ? tDe('meldungen.hintergrund.start', { wert: hintergrund.wert }) : tDe('meldungen.hintergrund.aus'));
  // Ohne root (#1354): Benutzer von Ablago und, gemessen, Benutzer und Grenzen der Dokumentwerkzeuge ins Protokoll.
  meldeBenutzer(log, env, leiter);
  // Zwischenspeicher der Zahlen, Trefferzahlen und Termine (#918): DMS_ZWISCHENSPEICHER=aus nur zur Fehlersuche.
  if (!richteZwischenspeicherEin(env) && leiter) log.warn(tDe('meldungen.zwischenspeicher.aus'));
  // Arbeiter für PDF und große Exporte (#542): ein kleiner Pool von Fäden neben dem Hauptfaden.
  // Mehrere Prozesse (#745): Der Pool gilt je Prozess; die Vorgabe teilt sich auf die Prozesse auf.
  const arbeiter = richteArbeiterEin(env, { vorwaermen: true, prozesse: verbund.anzahl });
  if (arbeiter.fehler && leiter) log.warn(arbeiter.fehler);
  if (leiter)
    log.info(
      arbeiter.groesse
        ? `Arbeiter für PDF und Exporte: ${arbeiter.groesse}${arbeiter.quelle === 'umgebung' ? ' (DMS_ARBEITER)' : ` (Vorgabe bei ${arbeiter.kerne} Kernen)`}`
        : 'Arbeiter für PDF und Exporte ausgeschaltet (DMS_ARBEITER=0): PDF-Arbeiten laufen im Hauptfaden',
    );
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
  return { tresor, betrieb, messung, region, sprachen, spDeps, speicherplatz, hochladen };
}
