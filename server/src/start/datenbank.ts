/**
 * Start (#1278, aus `ablago.ts`): Pool und Sperrverbindung (#1198), Migrationen, Mandant (#119), Überlastschutz (#544)
 * und Kurzzustand (#744).
 */
import { verbinde, poolGroesse, VERBINDUNG_WARTEN_S, migriere, Verbindungswarten, Datenbankpruefung } from '../datenbank/db';
import { Sperrverbindung, eigeneSperrquelle } from '../datenbank/sperrverbindung';
import { pruefePgVersion } from '../datenbank/pg-version';
import { protokoll } from '../protokoll/protokoll';
import { Poolmessung } from '../datenbank/poolmessung';
import { maxAnfragenAus, Ueberlastschutz } from '../http/ueberlast';
import { bestimmeMandant } from '../datenbank/mandant';
import { schreibeAnbindung } from '../datenbank/anbindung';
import { istUuid } from '../repo';
import { protokolliereKennungsUmzug } from '../mappentypen/index';
import { pgEinstellungen } from '../einstellungen/einstellungen';
import { pgKurzzustand, lebenszeichen } from '../zwischenspeicher/kurzzustand';
import type { bindeDatenbankAn } from './anbindung';
import type { teileVerbindungen } from './verbindungen';
import type { vorbereiten } from './vorbereiten';
import type { oeffneStartseite } from './startseite';
import type { liesUmgebung } from './umgebung';

/** Was verbindeDatenbank von früher braucht. */
type Bisher = Pick<Awaited<ReturnType<typeof bindeDatenbankAn>>, 'datenbankUrl' | 'db'> &
  Pick<Awaited<ReturnType<typeof teileVerbindungen>>, 'eigeneVerbindungen' | 'verbindungsteile' | 'verbindungsZahl'> &
  Pick<Awaited<ReturnType<typeof vorbereiten>>, 'leiter' | 'cfg' | 'verbund' | 'log' | 'ordner'> &
  Pick<Awaited<ReturnType<typeof oeffneStartseite>>, 'start'> &
  Pick<Awaited<ReturnType<typeof liesUmgebung>>, 'einrichtungscode'> & { env: NodeJS.ProcessEnv };

/** Verbindungen, Migrationen, Mandant und Kurzzustand. */
export async function verbindeDatenbank(bisher: Bisher) {
  const {
    datenbankUrl,
    eigeneVerbindungen,
    leiter,
    cfg,
    start,
    db,
    verbindungsteile,
    verbindungsZahl,
    verbund,
    env,
    log,
    ordner,
    einrichtungscode,
  } = bisher;
  // Sperrverbindung (#1198): Sitzungssperren laufen über eine eigene Verbindung außerhalb des Pools. Im Leiter (er hält
  // immer das Lebenszeichen) zählt sie zu seinem Anteil; weitere Prozesse öffnen sie nur kurz (Pakete installieren).
  // Wartet eine Anfrage länger als VERBINDUNG_WARTEN_S auf eine freie Verbindung, bricht sie ab (503) statt ewig zu hängen.
  const sql = verbinde(datenbankUrl, poolGroesse(eigeneVerbindungen, leiter), { wartenS: VERBINDUNG_WARTEN_S });
  const sperren = new Sperrverbindung(eigeneSperrquelle(datenbankUrl));
  // Hauptversion von PostgreSQL (#1464): zu alt → Abbruch vor den Migrationen, Grund auf der Startseite.
  if (leiter) await pruefePgVersion(sql, (h) => log.warn(h));
  // Datenbank von einer neueren Version (#714) oder fehlgeschlagene Migration: Grund auf der Startseite (beimStartfehler).
  // Mehrere Prozesse (#745): nur der Leiter – die anderen starten erst, wenn er fertig ist.
  if (leiter)
    await migriere(
      sql,
      cfg.migrationen,
      (m) => protokoll.modul('datenbank').info(m),
      (nr, von, datei) => start.schritt('migration', { nr, von, datei }),
      () => start.schritt('sperre'),
    );
  start.schritt('schluessel');
  const [{ server_version: pgVersion }] = await sql`SHOW server_version`;
  if (leiter)
    protokoll.modul('datenbank').info('Datenbank verbunden', {
      postgres: pgVersion,
      host: db.host,
      datenbank: db.datenbank,
      verbindungen: `${verbindungsteile.gesamt}${verbindungsZahl.quelle === 'umgebung' ? ' (DMS_DB_VERBINDUNGEN)' : ''}${verbund.mehrere ? ` zusammen: Leiter ${verbindungsteile.leiter}, jeder weitere Prozess ${verbindungsteile.andere}` : ''}`,
    });
  const verbindungswarten = new Verbindungswarten(sql, eigeneVerbindungen, verbindungsZahl.quelle, verbindungsteile, {
    sperren,
    pool: poolGroesse(eigeneVerbindungen, leiter),
  });
  verbindungswarten.start();
  // Gesundheitsprüfung mit Datenbank (#1198): kurze Abfrage mit Zeitgrenze, Ergebnis kurz zwischengespeichert.
  const datenbankpruefung = new Datenbankpruefung(sql);
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
  if (leiter && istUuid(cfg.haushalt))
    await protokolliereKennungsUmzug(pgEinstellungen(sql, cfg.haushalt)).catch((e: Error) =>
      log.warn('Protokoll der umgestellten Kennungen nicht geschrieben', { fehler: e.message }),
    );
  if (mandant.hinweis) log.warn(mandant.hinweis);
  // Zustand zwischen Anfragen (#744): Fehlversuche, Sperren, Einmal-Tickets und Merker für alle Prozesse und Server
  // derselben Datenbank. Das Lebenszeichen sagt, ob dieser Prozess allein an der Datenbank ist (z. B. für die Texterkennung).
  const zustandDb = pgKurzzustand(sql, cfg.haushalt, Date.now, sperren);
  // Fehlversuche beim Einrichtungscode über alle Prozesse (#956).
  einrichtungscode.teileZaehler(zustandDb);
  // Mehrere Prozesse (#745): Das Lebenszeichen hält nur der Leiter – „allein“ heißt dann: kein anderer Leiter (anderer
  // Server) an dieser Datenbank. Startet der Leiter nach einem Absturz neu, sind die Aufträge der Texterkennung seine.
  const lebt = leiter ? await lebenszeichen(sperren, cfg.haushalt) : { allein: false, ende: async () => {} };
  if (leiter && !lebt.allein) log.info('Weitere Server von Ablago an derselben Datenbank: Zeitpläne laufen je Lauf nur in einem davon');
  /** Zeitgesteuerte Arbeit nur in einem Prozess zugleich (#744, Datenbanksperre je Name). */
  const nurEiner = (name: string, f: () => Promise<unknown>) => zustandDb.exklusiv(name, f).then(() => {});
  return { sql, sperren, pgVersion, verbindungswarten, datenbankpruefung, poolmessung, ueberlast, mandant, zustandDb, lebt, nurEiner };
}
