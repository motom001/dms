/**
 * Start (#1278, aus `ablago.ts`): Postfächer mit OAuth (#196, #358), Datenbank-Anbindung in der Werkbank, Konsole
 * (#244), Anmeldung über einen Anbieter (#241), API-Schlüssel und Notfallcode (#815).
 */
import { PostfachOAuth } from '../post/postfach-oauth';
import { pgEinstellungen } from '../einstellungen/einstellungen';
import { Postfaecher } from '../post/postfach';
import { verbindeImap, liesMail } from '../post/imap';
import { t } from '../sprache/sprache';
import { AnbindungVerwaltung, umgebungAusCompose } from '../datenbank/anbindung';
import { Konsolenzugang } from '../system/konsole';
import { Oidc } from '../anmeldung/oidc';
import { ApiSchluesselDienst, pgApiSchluesselRepo } from '../anmeldung/apischluessel';
import { Notfallcode } from '../notfall/notfallcode';
import { pgBetriebSpeicher } from '../einstellungen/betrieb';
import type { Benutzer } from '../../../shared/src/model';
import type { verbindeDatenbank } from './datenbank';
import type { vorbereiten } from './vorbereiten';
import type { richteBetriebEin } from './betrieb';
import type { baueDienst } from './dienst';
import type { richteSicherungEin } from './sicherung';
import type { richteEingangEin } from './eingang';
import type { bindeDatenbankAn } from './anbindung';
import type { liesUmgebung } from './umgebung';
import type { oeffneStartseite } from './startseite';

/** Was richteZugaengeEin von früher braucht. */
type Bisher = Pick<Awaited<ReturnType<typeof verbindeDatenbank>>, 'sql' | 'zustandDb'> &
  Pick<Awaited<ReturnType<typeof vorbereiten>>, 'cfg' | 'ordner' | 'verbund'> &
  Pick<Awaited<ReturnType<typeof richteBetriebEin>>, 'tresor' | 'betrieb' | 'speicherplatz' | 'messung'> &
  Pick<Awaited<ReturnType<typeof baueDienst>>, 'anVerwaltendeVon' | 'dienst' | 'wartung' | 'konten'> &
  Pick<Awaited<ReturnType<typeof richteSicherungEin>>, 'wiederherstellung' | 'sicherung'> &
  Pick<Awaited<ReturnType<typeof richteEingangEin>>, 'postSperre'> &
  Pick<Awaited<ReturnType<typeof bindeDatenbankAn>>, 'db'> &
  Pick<Awaited<ReturnType<typeof liesUmgebung>>, 'umgebung'> &
  Pick<Awaited<ReturnType<typeof oeffneStartseite>>, 'ohneDatenbankVolume'> & {
    env: NodeJS.ProcessEnv;
    ganzBeenden: (grund: string) => void;
  };

/** Postfächer, Konsole, Anbieter, API-Schlüssel und Notfallcode. */
export function richteZugaengeEin(bisher: Bisher) {
  const {
    sql,
    cfg,
    tresor,
    anVerwaltendeVon,
    zustandDb,
    betrieb,
    dienst,
    wartung,
    wiederherstellung,
    speicherplatz,
    postSperre,
    ordner,
    db,
    env,
    umgebung,
    ganzBeenden,
    ohneDatenbankVolume,
    verbund,
    konten,
    messung,
    sicherung,
  } = bisher;
  // Anmeldung per OAuth 2.0 (#358): Token verschlüsselt mit dem Schlüssel des DMS.
  const postfachOAuth = new PostfachOAuth({
    einstellungen: pgEinstellungen(sql, cfg.haushalt),
    verschluessele: (k) => tresor.verschluessele(k),
    entschluessele: (w) => tresor.entschluessele(w),
    anAdmins: anVerwaltendeVon('postfaecher'),
    zustand: zustandDb,
  });
  // E-Mail-Versand über OAuth (#813): dieselbe Anmeldung wie bei den Postfächern.
  betrieb.verbindeOAuth(postfachOAuth);
  const postfaecher = new Postfaecher({
    dienst,
    einstellungen: pgEinstellungen(sql, cfg.haushalt),
    verbinde: verbindeImap,
    lies: liesMail,
    oauth: postfachOAuth,
    verschluessele: (k) => tresor.verschluessele(k),
    entschluessele: (w) => tresor.entschluessele(w),
    pause: () => (wartung.aktiv ? 'Wartungsmodus' : wiederherstellung.laeuft() ? t('meldungen.index.wiederherstellung-laeuft') : null),
    platz: () => speicherplatz.pruefeHochladen(),
    anAdmins: anVerwaltendeVon('postfaecher'),
    sperre: () => postSperre.halte(),
  });
  // Hinweise zu DATABASE_URL nur, wenn sie aus der Compose-Datei kommt, nicht vom Start-Skript von dms-komplett (#805).
  const anbindungVerwaltung = new AnbindungVerwaltung(
    ordner.geheim,
    db,
    umgebungAusCompose(env, umgebung),
    () => ganzBeenden('Datenbank-Anbindung geändert'),
    undefined,
    ohneDatenbankVolume,
  );
  // Befehl dms im Container (#244).
  // Mehrere Prozesse (#745): ein gemeinsamer Schlüssel vom Hauptprozess; die Datei schreibt der Leiter.
  const konsole = new Konsolenzugang(undefined, verbund.konsole ?? undefined);
  // Anmeldung über einen Anbieter (#241); Client-Secret verschlüsselt mit dem Schlüssel des DMS.
  const oidc = new Oidc({
    einstellungen: pgEinstellungen(sql, cfg.haushalt),
    verschluessele: (k) => tresor.verschluessele(k),
    entschluessele: (w) => tresor.entschluessele(w),
    zustand: zustandDb,
  });
  konten.verbindeAnbieter(() => oidc.bereit());
  // Nach dem Schlüsselwechsel das zwischengespeicherte Client-Secret neu lesen (#410).
  tresor.beimWechsel(async () => oidc.vergiss());
  // Paket-Läufer (#338): Pakete mit Code in einem eigenen Prozess; ihre API-Anfragen laufen über app.inject.
  const apiSchluessel = new ApiSchluesselDienst(messung.umhuelle(pgApiSchluesselRepo(sql), 'apischluessel'));
  // Notfallzugang mit dem Notfallcode vom Notfallblatt (#815): /notfall, Vorgabe „nur aus dem Heimnetz“.
  const notfallcode = new Notfallcode({
    konten,
    einstellungen: pgBetriebSpeicher(sql, cfg.haushalt),
    mailer: () => betrieb.mailer(),
    proxy: cfg.proxy.trust,
    apiSchluessel: async (id) => (await apiSchluessel.liste({ id } as Benutzer)).length,
    codeBenutzt: () => sicherung.notfallcodeBenutzt(),
    zustand: zustandDb,
    verschluessele: (k) => tresor.verschluessele(k),
    entschluessele: (w) => tresor.entschluessele(w),
  });
  return { postfachOAuth, postfaecher, anbindungVerwaltung, konsole, oidc, apiSchluessel, notfallcode };
}
