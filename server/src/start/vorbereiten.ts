/**
 * Start (#1278, vorher oben in `ablago.ts`): Einstellungen aus der Umgebung, feste Ordner, Version, Rolle dieses
 * Prozesses (#745) und Lasttest-Modus (#612). Pfade löst `pfad` aus `ablago.ts` auf – relativ zu dessen Ort.
 */
import { proxyVertrauen } from '../http/proxy';
import { einbettenAus } from '../http/koepfe';
import { protokoll } from '../protokoll/protokoll';
import { pruefeOrdner } from '../dateien/ordner';
import { eigeneVersion, setzeStandSalz } from '../system/system';
import { prozesseAus, verbundFuerProzess, PROZESSE_MAX } from '../prozesse/prozesse';
import { teileZwischenspeicher } from '../zwischenspeicher/zwischenspeicher';
import { MB } from '../grundlagen/grenzen';
import { tDe } from '../sprache/sprache';
import { lasttestAus } from '../lasttest/lasttestmodus';

/** Was vorbereiten von früher braucht. */
type Bisher = { env: NodeJS.ProcessEnv; pfad: (rel: string) => string };

/** Einstellungen, Ordner und Prozess. */
export async function vorbereiten(bisher: Bisher) {
  const { env, pfad } = bisher;

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
  // Kennung des Stands ohne erkennbare Version (#1067): Zufallswert der Installation, vor jedem Startmodus.
  setzeStandSalz(ordner.geheim);
  const version = env.DMS_VERSION ?? 'Entwicklung';
  // Mehrere Prozesse (#745): Rolle dieses Prozesses. Mit einem Prozess (Vorgabe) ist er Leiter und erledigt alles selbst.
  const prozessEinstellung = prozesseAus(env);
  const verbund = await verbundFuerProzess();
  const { leiter } = verbund;
  // Zwischenspeicher (#874): mit mehreren Prozessen bekommt jeder seinen Anteil, zusammen wie mit einem.
  teileZwischenspeicher(verbund.anzahl);
  if (leiter)
    // Im Protokoll dieselbe Version wie auf der Lasttest-Seite und in der Werkbank (#1251, Nachtrag): DMS_VERSION, sonst
    // package.json – das Image setzt DMS_VERSION nicht, dort stand bisher „Entwicklung“.
    log.info(`Ablago startet (Version ${eigeneVersion()})`, {
      node: process.version,
      port: cfg.port,
      protokoll: protokoll.stufe,
      proxy: cfg.proxy.text,
      ...(verbund.mehrere || prozessEinstellung.quelle === 'auto' ? { prozesse: verbund.anzahl } : {}),
      ...(prozessEinstellung.quelle === 'auto'
        ? {
            prozesseAutomatisch: {
              kerne: prozessEinstellung.kerne,
              speicherMb: prozessEinstellung.speicher === null ? null : Math.round(prozessEinstellung.speicher / MB),
              herkunft: prozessEinstellung.herkunft,
              begrenzt: prozessEinstellung.begrenzt,
              vorgabe: !!prozessEinstellung.autoVorgabe,
            },
          }
        : {}),
    });
  else log.info(`Prozess ${verbund.nr} für Anfragen startet`, { pid: process.pid });
  if (prozessEinstellung.ungueltig && leiter)
    log.warn(tDe('meldungen.prozesse.ungueltig', { roh: prozessEinstellung.ungueltig, max: PROZESSE_MAX }));
  if (cfg.proxy.fehler) log.warn(cfg.proxy.fehler);
  if (cfg.einbetten.fehler) log.warn(cfg.einbetten.fehler);
  // Lasttest-Modus (#612): DMS_LASTTEST=klein|mittel|gross|extrem|alle – nur in einer eigenen Test-Installation (unten geprüft).
  // Nur im Leiter: Die Seite mit Fortschritt und das Skript gibt es einmal.
  const lasttest = lasttestAus(leiter ? env : {});
  if (lasttest.fehler) log.warn(lasttest.fehler);
  return { cfg, log, ordnerPruefung, ordner, version, prozessEinstellung, verbund, leiter, lasttest };
}
