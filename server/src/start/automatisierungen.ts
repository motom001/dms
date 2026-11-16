/**
 * Start (#1278, aus `ablago.ts`): Automatisierungen (#674) und die Wenn-Karte „Protokollmeldung“ (#677).
 */
import { pgAutomatisierungRepo, Automatisierungen } from '../automatisierung';
import { pgAufrufRepo, pgAusgangRepo, pgAussenGeheimnisRepo } from '../automatisierung/index';
import { t } from '../sprache/sprache';
import { Betriebsmelder } from '../automatisierung/automatisierung-werkbank';
import type { richteBetriebEin } from './betrieb';
import type { verbindeDatenbank } from './datenbank';
import type { vorbereiten } from './vorbereiten';
import type { baueDienst } from './dienst';
import type { verbindePakete } from './pakete';
import type { richteSicherungEin } from './sicherung';

/** Was richteAutomatisierungenEin von früher braucht. */
type Bisher = Pick<Awaited<ReturnType<typeof richteBetriebEin>>, 'messung' | 'betrieb'> &
  Pick<Awaited<ReturnType<typeof verbindeDatenbank>>, 'sql'> &
  Pick<Awaited<ReturnType<typeof vorbereiten>>, 'cfg'> &
  Pick<Awaited<ReturnType<typeof baueDienst>>, 'dienst' | 'wartung'> &
  Pick<Awaited<ReturnType<typeof verbindePakete>>, 'systemwerkbank'> &
  Pick<Awaited<ReturnType<typeof richteSicherungEin>>, 'wiederherstellung'>;

/** Automatisierungen und Betriebsmelder. */
export function richteAutomatisierungenEin(bisher: Bisher) {
  const { messung, sql, cfg, dienst, systemwerkbank, betrieb, wartung, wiederherstellung } = bisher;
  // Automatisierungen (#674): Wenn · Und · Dann · Sonst unter dem Systemkonto „Automatisierung“; Läufe je Ereignis genau einmal.
  const automatisierungRepo = messung.umhuelle(pgAutomatisierungRepo(sql, cfg.haushalt), 'automatisierungen');
  const automatisierungen = new Automatisierungen({
    dienst,
    repo: automatisierungRepo,
    werkbank: systemwerkbank,
    // Aufruf von außen (#679): Adressen in der Datenbank; Bremse und Wiederholschutz im Kurzzustand des Dienstes, Geheimnis mit dessen Tresor.
    aufruf: { repo: pgAufrufRepo(sql, cfg.haushalt), basis: () => betrieb.adresseFuerLinks() },
    // Karten nach außen (#671): Ausgangskorb und Geheimnisse in der Datenbank, Mailversand wie überall, Adresse für Links.
    aussen: {
      repo: pgAusgangRepo(sql, cfg.haushalt),
      geheimnisse: pgAussenGeheimnisRepo(sql, cfg.haushalt),
      mailer: () => betrieb.mailer(),
      basis: () => betrieb.adresseFuerMails(),
    },
    pause: () => (wartung.aktiv ? 'Wartungsmodus' : wiederherstellung.laeuft() ? t('meldungen.index.wiederherstellung-laeuft') : null),
  });
  // Wenn-Karte „Protokollmeldung“ (#677): jeder Prozess meldet seine Warnungen und Fehler in den Ausgangskorb – nur solange
  // eine passende Automatisierung an ist, nie die einer Automatisierung selbst.
  const betriebsmelder = new Betriebsmelder({
    werkbank: systemwerkbank,
    automatisierungen: () => automatisierungRepo.liste(),
    ereignis: (m) => dienst.kern.ereignis('protokoll.meldung', { ...m }, null),
    inAutomatisierung: () => dienst.kern.ausloeser(null).art === 'automatisierung',
  });
  betriebsmelder.start();
  return { automatisierungen };
}
