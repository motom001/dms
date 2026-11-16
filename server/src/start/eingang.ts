/**
 * Start (#1278, aus `ablago.ts`): Tägliche Zusammenfassung (#54), Designs, Einrichtung (#119), Eingangsordner (#195)
 * und die Sperre der Postfächer.
 */
import { Aufgabenmail } from '../aufgaben/aufgabenmail';
import { FAVORIT_ERWAEHNT_OFFEN } from '../../../shared/src/erwaehnen';
import { Designs, pgDesignRepo } from '../oberflaeche/designs';
import { mitPruefung, ordnerSpeicher } from '../dateien/dateispeicher';
import { existsSync } from 'node:fs';
import { Einrichtung } from '../einrichtung/einrichtung';
import { pgEinstellungen } from '../einstellungen/einstellungen';
import { mandantNamen } from '../datenbank/mandant';
import { Eingangsordner } from '../post/eingangsordner';
import { t } from '../sprache/sprache';
import type { baueDienst } from './dienst';
import type { richteBetriebEin } from './betrieb';
import type { verbindeDatenbank } from './datenbank';
import type { vorbereiten } from './vorbereiten';
import type { liesUmgebung } from './umgebung';
import type { bindeDatenbankAn } from './anbindung';
import type { richteSicherungEin } from './sicherung';

/** Was richteEingangEin von früher braucht. */
type Bisher = Pick<Awaited<ReturnType<typeof baueDienst>>, 'dienst' | 'konten' | 'wartung'> &
  Pick<Awaited<ReturnType<typeof richteBetriebEin>>, 'betrieb' | 'messung' | 'hochladen'> &
  Pick<Awaited<ReturnType<typeof verbindeDatenbank>>, 'sql' | 'sperren'> &
  Pick<Awaited<ReturnType<typeof vorbereiten>>, 'cfg' | 'ordner' | 'leiter'> &
  Pick<Awaited<ReturnType<typeof liesUmgebung>>, 'einrichtungscode'> &
  Pick<Awaited<ReturnType<typeof bindeDatenbankAn>>, 'db'> &
  Pick<Awaited<ReturnType<typeof richteSicherungEin>>, 'sicherung' | 'wiederherstellung'> & { env: NodeJS.ProcessEnv };

/** Aufgaben-Mail, Designs, Einrichtung und Eingangsordner. */
export async function richteEingangEin(bisher: Bisher) {
  const {
    dienst,
    konten,
    betrieb,
    messung,
    sql,
    cfg,
    ordner,
    hochladen,
    leiter,
    einrichtungscode,
    db,
    sicherung,
    sperren,
    env,
    wartung,
    wiederherstellung,
  } = bisher;
  // Tägliche Zusammenfassung der offenen Aufgaben (#54).
  const typName = async (id: string | undefined) => (await dienst.mappentypen.listeTypen()).find((t) => t.id === id)?.name ?? '';
  const aufgabenmail = new Aufgabenmail(
    {
      benutzer: () => konten.listeBenutzer(),
      einstellungenVon: (b) => konten.einstellungen(b),
      // Aufgaben zu Mappen, die der Empfänger nicht lesen darf, ohne Titel (#127).
      aufgabenVon: async (b) => dienst.vertretung.meineAufgaben(b, await dienst.rechtepruefung.zugriff(b)),
      typName,
      // Erwähnte Favoriten (#889): gemerkt bis zur nächsten Zusammenfassung, nur lesbare.
      favoritenErwaehnt: async (b) =>
        dienst.erwaehnungen.fuerZusammenfassung(
          await dienst.rechtepruefung.zugriff(b),
          (await konten.einstellungen(b))[FAVORIT_ERWAEHNT_OFFEN],
        ),
      favoritenErwaehntGesendet: (b) => konten.setzeEinstellung(b, FAVORIT_ERWAEHNT_OFFEN, null),
    },
    () => betrieb.mailer(),
    () => betrieb.adresseFuerMails(),
  );
  const designs = new Designs(
    messung.umhuelle(pgDesignRepo(sql, cfg.haushalt), 'designs'),
    mitPruefung(ordnerSpeicher(ordner.dateien, `${cfg.haushalt}/designs`), hochladen),
  );
  // Einrichtungsassistent (#119): Mandant und Administrator mit Code, danach die weiteren Schritte.
  const einrichtungNoetig = await konten.einrichtungNoetig();
  if (einrichtungNoetig && !leiter) await einrichtungscode.uebernimm();
  else if (einrichtungNoetig) await einrichtungscode.bereitstellen();
  else if (existsSync(einrichtungscode.datei) && leiter) await einrichtungscode.entfernen();
  const einrichtung = new Einrichtung({
    konten,
    code: einrichtungNoetig ? einrichtungscode : null,
    einstellungen: pgEinstellungen(sql, cfg.haushalt),
    mandant: mandantNamen(sql, cfg.haushalt),
    schriftzug: (t) => designs.setzeSchriftzug(t),
    // Konfigurationsdatei (#806): die verbundene Datenbank, ohne Passwort.
    datenbank: () => ({ host: db.host, port: db.port, datenbank: db.datenbank, benutzer: db.benutzer }),
    // „Einrichtung abschließen“ erst mit Notfallblatt (#804).
    notfallblattAktuell: async () => (await sicherung.notfallblatt()).aktuell,
  });
  // Eingangsordner (#195): /eingang, wenn eingebunden; nur eine Instanz übernimmt (Sperre in PostgreSQL, seit #1198 auf
  // der Sperrverbindung – geht sie verloren, holt der nächste Lauf sie neu oder überlässt ihn dem anderen Server).
  const eingangSperre = sperren.dauerhaft({ klasse: 4711195 }, 'eingangsordner');
  const eingangsordner = new Eingangsordner(env.DMS_EINGANG ?? '/eingang', {
    dienst,
    einstellungen: pgEinstellungen(sql, cfg.haushalt),
    benutzer: () => konten.listeBenutzer(),
    pause: () => (wartung.aktiv ? 'Wartungsmodus' : wiederherstellung.laeuft() ? t('meldungen.index.wiederherstellung-laeuft') : null),
    sperre: () => eingangSperre.halte(),
  });
  // Postfächer (#196): Mails per IMAP abholen; nur eine Instanz ruft ab (Sperre wie beim Eingangsordner).
  const postSperre = sperren.dauerhaft({ klasse: 4711196 }, 'postfaecher');
  return { aufgabenmail, designs, einrichtungNoetig, einrichtung, eingangsordner, postSperre };
}
