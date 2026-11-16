/**
 * Start (#1278, aus `ablago.ts`): Sicherungen (#103–#105), Wiederherstellen und Probe (#107, #109), Erweiterungen der
 * Suche (#562).
 */
import { Sicherung } from '../sicherung/sicherung';
import { pgEinstellungen } from '../einstellungen/einstellungen';
import { pgDatenquelle } from '../sicherung/datenbankabzug';
import { eigeneVersion } from '../system/system';
import { type, release, arch } from 'node:os';
import { Wiederherstellung } from '../sicherung/wiederherstellung';
import { readdir } from 'node:fs/promises';
import { schreibeAnbindung } from '../datenbank/anbindung';
import { sichereErweiterungen } from '../datenbank/erweiterungen';
import { protokoll } from '../protokoll/protokoll';
import type { vorbereiten } from './vorbereiten';
import type { richteBetriebEin } from './betrieb';
import type { verbindeDatenbank } from './datenbank';
import type { baueDienst } from './dienst';
import type { bindeDatenbankAn } from './anbindung';
import type { liesUmgebung } from './umgebung';
import type { oeffneStartseite } from './startseite';

/** Was richteSicherungEin von früher braucht. */
type Bisher = Pick<Awaited<ReturnType<typeof vorbereiten>>, 'ordner' | 'cfg' | 'log' | 'leiter'> &
  Pick<Awaited<ReturnType<typeof richteBetriebEin>>, 'tresor'> &
  Pick<Awaited<ReturnType<typeof verbindeDatenbank>>, 'sql' | 'pgVersion'> &
  Pick<Awaited<ReturnType<typeof baueDienst>>, 'wartung' | 'anVerwaltendeVon' | 'konten'> &
  Pick<Awaited<ReturnType<typeof bindeDatenbankAn>>, 'datenbankUrl' | 'db'> &
  Pick<Awaited<ReturnType<typeof liesUmgebung>>, 'einrichtungscode'> &
  Pick<Awaited<ReturnType<typeof oeffneStartseite>>, 'start'> & { ganzBeenden: (grund: string) => void };

/** Sicherung und Wiederherstellung. */
export async function richteSicherungEin(bisher: Bisher) {
  const {
    ordner,
    cfg,
    tresor,
    sql,
    wartung,
    anVerwaltendeVon,
    datenbankUrl,
    pgVersion,
    konten,
    log,
    ganzBeenden,
    db,
    einrichtungscode,
    leiter,
    start,
  } = bisher;
  // Sicherungen (#103–#105): eigenes Volume, verschlüsselt mit dem Schlüssel der Werkbank.
  const sicherung = new Sicherung(ordner.sicherung, ordner.dateien, cfg.haushalt, {
    tresor,
    einstellungen: pgEinstellungen(sql, cfg.haushalt),
    daten: pgDatenquelle(sql),
    umgebung: async () => ({ dms: eigeneVersion(), node: process.versions.node, system: `${type()} ${release()}`, architektur: arch() }),
    wartungAktiv: () => wartung.aktiv,
    anAdmins: anVerwaltendeVon('sicherung'),
  });
  // Wiederherstellen und Probe (#107, #109): eigenes Schema, erst nach allen Prüfungen umschalten.
  const wiederherstellung = new Wiederherstellung({
    url: datenbankUrl,
    sql,
    migrationen: cfg.migrationen,
    dateiWurzel: ordner.dateien,
    sicherung,
    tresor,
    laufzeit: async () => ({
      dms: eigeneVersion(),
      postgres: String(pgVersion),
      architektur: arch(),
      haushaltId: cfg.haushalt,
      migrationen: (await readdir(cfg.migrationen)).filter((f) => f.endsWith('.sql')).sort(),
    }),
    wartungAktiv: () => wartung.aktiv,
    einrichtungNoetig: () => konten.einrichtungNoetig(),
    // Im Container startet Docker (restart: unless-stopped) das DMS gleich wieder.
    // Mehrere Prozesse (#745): alle – sie sprechen sonst mit dem alten Schema bzw. Mandanten.
    neustart: () => {
      log.warn('Neustart nach der Wiederherstellung');
      ganzBeenden('Neustart nach der Wiederherstellung');
    },
    // Gehört die Sicherung zu einem anderen Mandanten, gilt nach dem Neustart dessen Id (#119).
    mandantUebernehmen: async (id) => {
      await schreibeAnbindung(ordner.geheim, { ...db, mandant: id });
    },
    pruefeCode: (c) => einrichtungscode.pruefeGeteilt(c),
    anAdmins: anVerwaltendeVon('sicherung'),
  });
  sicherung.sperre = () => wiederherstellung.laeuft();
  // Einmalige Arbeiten beim Start (#745): nur im Leiter.
  if (leiter) await wiederherstellung.raeumeAuf();
  start.schritt('suchindex');
  // Erweiterungen der Suche (#562): pg_trgm anlegen bzw. umziehen, wenn sie fehlt; sonst Hinweis im Protokoll.
  if (leiter)
    await sichereErweiterungen(sql, protokoll.modul('datenbank')).catch((e) =>
      log.warn('Erweiterungen der Datenbank nicht geprüft', { fehler: (e as Error).message }),
    );
  const abschluss = leiter
    ? ((await pgEinstellungen(sql, cfg.haushalt).lies('wiederherstellung_abschluss')) as { sicherung?: string } | null)
    : null;
  if (abschluss) log.warn('Gestartet nach einer Wiederherstellung', { sicherung: abschluss.sicherung });
  start.schritt('ordner');
  return { sicherung, wiederherstellung };
}
