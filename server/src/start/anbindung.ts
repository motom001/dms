/**
 * Start (#1278, aus `ablago.ts`): Datenbank-Anbindung (#119) aus der Datei, der Umgebung oder dem
 * Einrichtungsassistenten.
 */
import {
  type Anbindung,
  liesAnbindung,
  pruefeAnbindung,
  schreibeAnbindung,
  datenbankVomImage,
  ANBINDUNG_DATEI,
  alsUrl,
} from '../datenbank/anbindung';
import { VARIABLEN_GRUND } from '../../../shared/src/umgebungsvariablen';
import { einrichtungsmodus } from '../einrichtung/einrichtungsmodus';
import type { vorbereiten } from './vorbereiten';
import type { liesUmgebung } from './umgebung';
import type { oeffneStartseite } from './startseite';

/** Was bindeDatenbankAn von früher braucht. */
type Bisher = Pick<Awaited<ReturnType<typeof vorbereiten>>, 'ordner' | 'log' | 'verbund' | 'cfg'> &
  Pick<Awaited<ReturnType<typeof liesUmgebung>>, 'umgebung' | 'einrichtungscode'> &
  Pick<Awaited<ReturnType<typeof oeffneStartseite>>, 'start'> & { env: NodeJS.ProcessEnv };

/** So oft und in diesem Abstand versucht Ablago, eine nicht erreichbare Datenbank zu erreichen (zusammen etwa 1 Minute). */
const VERSUCHE = 30;
const ABSTAND_MS = 2000;

/**
 * Datenbank erreichen: Der Datenbank-Container braucht nach dem Start manchmal einen Moment – auf einem NAS beim ersten
 * Start (initdb) auch eine Minute. Solange zeigt die Startseite „Datenbank ist noch nicht erreichbar – neuer Versuch n
 * von m“ (#1250); erst danach kommt der Einrichtungsassistent mit dem Grund. Andere Fehler (Passwort, Datenbank fehlt)
 * gehen gleich dorthin.
 */
async function warteAufDatenbank(kandidat: Anbindung, start: Bisher['start'], log: Bisher['log']) {
  let startfehler: string | null = null;
  start.schritt('datenbank');
  for (let versuch = 1; versuch <= VERSUCHE; versuch++) {
    const p = await pruefeAnbindung(kandidat);
    if (p.ok) return { verbunden: true, startfehler };
    startfehler = p.text;
    // Ins Protokoll der erste und dann jeder fünfte Versuch – sonst stünden dort 30 gleiche Zeilen.
    if (versuch === 1 || versuch % 5 === 0 || versuch === VERSUCHE || p.art !== 'nicht_erreichbar')
      log.warn(`Datenbank nicht verbunden (Versuch ${versuch}/${VERSUCHE}): ${p.text}`, { technisch: p.technisch });
    if (p.art !== 'nicht_erreichbar' || versuch === VERSUCHE) break;
    start.schritt('datenbank-warten', { nr: versuch + 1, von: VERSUCHE });
    await new Promise((r) => setTimeout(r, ABSTAND_MS));
  }
  return { verbunden: false, startfehler };
}

/** Anbindung an die Datenbank. */
export async function bindeDatenbankAn(bisher: Bisher) {
  const { ordner, log, umgebung, env, verbund, start, einrichtungscode, cfg } = bisher;
  let anbindung: Anbindung | null = null;
  try {
    anbindung = await liesAnbindung(ordner.geheim);
  } catch (e) {
    log.error('Datei der Datenbank-Anbindung nicht lesbar', { fehler: (e as Error).message });
  }
  const quelle = anbindung ? ('datei' as const) : umgebung ? ('umgebung' as const) : null;
  const kandidat = anbindung ?? umgebung;
  const { verbunden, startfehler } = kandidat ? await warteAufDatenbank(kandidat, start, log) : { verbunden: false, startfehler: null };
  if (verbunden && !anbindung && umgebung) {
    await schreibeAnbindung(ordner.geheim, umgebung);
    anbindung = umgebung;
    if (datenbankVomImage(env)) log.info(`Datenbank im Container (dms-komplett) in ${ANBINDUNG_DATEI} übernommen`);
    else if (env.DATABASE_URL)
      log.info(
        `DATABASE_URL in ${ANBINDUNG_DATEI} übernommen – die Variable ist nicht mehr nötig und kann aus der Compose-Datei entfernt werden. ${VARIABLEN_GRUND.datenbank}`,
      );
    else log.info(`Datenbank-Anbindung aus DMS_DB_PASSWORT in ${ANBINDUNG_DATEI} übernommen`);
  }
  if (!verbunden && !verbund.erster) {
    // Mehrere Prozesse (#745): Der Einrichtungsmodus bräuchte den Port, den die anderen gerade bedienen – neu versuchen.
    log.error(`Prozess ${verbund.nr}: Datenbank nicht verbunden – er beendet sich und wird neu gestartet`, { grund: startfehler });
    process.exit(1);
  }
  if (!verbunden) {
    // Der Einrichtungsmodus braucht den Port selbst; danach geht es mit der Startseite weiter.
    await start.schliesse();
    anbindung = await einrichtungsmodus({
      geheim: ordner.geheim,
      code: einrichtungscode,
      vorbelegt: kandidat,
      quelle,
      fehler: startfehler,
      port: cfg.port,
      host: cfg.host,
      webDir: cfg.web,
      proxy: cfg.proxy.trust,
      einbetten: cfg.einbetten,
      wiederholenMs: kandidat ? 10_000 : undefined,
    });
    start.schritt('datenbank');
    await start.oeffne();
  }
  const db = anbindung!;
  const datenbankUrl = alsUrl(db);
  return { db, datenbankUrl };
}
