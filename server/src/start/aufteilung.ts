/**
 * Start (#1278, aus `ablago.ts`): Arbeit im Hintergrund (#745): nur im Leiter, die anderen geben Anstöße an ihn
 * weiter (`aufteilung.ts`).
 */
import { teileArbeit } from '../prozesse/aufteilung';
import { pgEinstellungen } from '../einstellungen/einstellungen';
import type { Paketlaeufer } from '../laeufer/verwaltung';
import type { Fernlaeufer } from '../laeufer/fern';
import type { oeffneStartseite } from './startseite';
import type { vorbereiten } from './vorbereiten';
import type { baueDienst } from './dienst';
import type { richteDokumenteEin } from './dokumente';
import type { richteSicherungEin } from './sicherung';
import type { richteZugaengeEin } from './zugaenge';
import type { richteEingangEin } from './eingang';
import type { richteBetriebEin } from './betrieb';
import type { verbindeDatenbank } from './datenbank';

/** Was teileArbeitAuf von früher braucht. */
type Bisher = Pick<Awaited<ReturnType<typeof oeffneStartseite>>, 'start'> &
  Pick<Awaited<ReturnType<typeof vorbereiten>>, 'verbund' | 'cfg'> &
  Pick<Awaited<ReturnType<typeof baueDienst>>, 'dienst'> &
  Pick<Awaited<ReturnType<typeof richteDokumenteEin>>, 'texterkennung' | 'vorschau'> &
  Pick<Awaited<ReturnType<typeof richteSicherungEin>>, 'sicherung' | 'wiederherstellung'> &
  Pick<Awaited<ReturnType<typeof richteZugaengeEin>>, 'postfaecher' | 'oidc'> &
  Pick<Awaited<ReturnType<typeof richteEingangEin>>, 'eingangsordner'> &
  Pick<Awaited<ReturnType<typeof richteBetriebEin>>, 'tresor' | 'betrieb' | 'messung'> &
  Pick<Awaited<ReturnType<typeof verbindeDatenbank>>, 'sql' | 'zustandDb' | 'ueberlast' | 'verbindungswarten' | 'poolmessung'> & {
    paketlaeufer: Paketlaeufer | null;
    fernlaeufer: Fernlaeufer | null;
  };

/** Aufteilung der Arbeit auf die Prozesse. */
export function teileArbeitAuf(bisher: Bisher) {
  const {
    start,
    verbund,
    dienst,
    texterkennung,
    vorschau,
    sicherung,
    wiederherstellung,
    postfaecher,
    eingangsordner,
    paketlaeufer,
    fernlaeufer,
    tresor,
    betrieb,
    oidc,
    messung,
    sql,
    cfg,
    zustandDb,
    ueberlast,
    verbindungswarten,
    poolmessung,
  } = bisher;
  start.schritt('dienste');
  // Mehrere Prozesse (#745): Arbeit im Hintergrund nur im Leiter; die anderen geben Anstöße an ihn weiter (aufteilung.ts).
  const aufteilung = teileArbeit(verbund, {
    dienst,
    texterkennung,
    vorschau,
    sicherung,
    wiederherstellung,
    postfaecher,
    eingangsordner,
    paketlaeufer,
    fernlaeufer,
    tresor,
    betrieb,
    oidc,
    messung,
    einstellungen: pgEinstellungen(sql, cfg.haushalt),
    zustand: zustandDb,
    sql,
    haushalt: cfg.haushalt,
    ueberlast,
    verbindungen: verbindungswarten,
    pool: poolmessung,
  });
  return { aufteilung };
}
