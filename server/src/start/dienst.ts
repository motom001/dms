/**
 * Start (#1278, aus `ablago.ts`): Dienst, Nachweis-Journal (#1053), Konten, Sprachpakete (#731), Wartung (#102) und
 * Mails an die Verwaltenden (#818).
 */
import { Dienst } from '../dienst/dienst';
import { pgRepo } from '../repo/pg';
import { mitPruefung, ordnerSpeicher, beiFehlenderDatei } from '../dateien/dateispeicher';
import { pgBetriebSpeicher } from '../einstellungen/betrieb';
import { pgEinstellungen } from '../einstellungen/einstellungen';
import { pgJournal, setzeNachweisjournal, Nachweisjournal, merkeVersion, SAMMELN_MS } from '../protokoll/nachweisjournal';
import { eigeneVersion } from '../system/system';
import { Konten } from '../konten';
import { pgKontoRepo } from '../konten/konto-repo';
import { Sprachpakete } from '../sprache/sprachpakete';
import { Wartung } from '../wartung/wartung';
import { anVerwaltende } from '../mail/mail';
import type { richteBetriebEin } from './betrieb';
import type { verbindeDatenbank } from './datenbank';
import type { vorbereiten } from './vorbereiten';

/** Was baueDienst von früher braucht. */
type Bisher = Pick<Awaited<ReturnType<typeof richteBetriebEin>>, 'messung' | 'hochladen' | 'tresor' | 'betrieb' | 'sprachen' | 'spDeps'> &
  Pick<Awaited<ReturnType<typeof verbindeDatenbank>>, 'sql' | 'zustandDb'> &
  Pick<Awaited<ReturnType<typeof vorbereiten>>, 'cfg' | 'ordner' | 'log'>;

/** Dienst, Konten, Sprachpakete und Wartung. */
export async function baueDienst(bisher: Bisher) {
  const { messung, sql, cfg, ordner, hochladen, tresor, zustandDb, log, betrieb, sprachen, spDeps } = bisher;
  const dienst = new Dienst(
    messung.umhuelle(pgRepo(sql, cfg.haushalt), 'mappen'),
    mitPruefung(ordnerSpeicher(ordner.dateien, cfg.haushalt), hochladen),
    {
      tresor,
      einstellungen: pgBetriebSpeicher(sql, cfg.haushalt),
      zustand: zustandDb,
    },
  );
  // Nachweis-Journal (#1053): Fehlanmeldungen, Rechteänderungen, Updates, Paket-Verlauf, Wartung … je Monat für Pakete.
  // Seit #1253 in eigenen Tabellen; das alte Format aus den Einstellungen übernimmt es gleich beim Start. Fehlanmeldungen
  // gesammelt (#1415): je Prozess höchstens alle SAMMELN_MS eine Anweisung statt einer je Versuch auf dieselbe Zeile.
  const nachweisEinstellungen = pgEinstellungen(sql, cfg.haushalt);
  const nachweisSpeicher = pgJournal(sql, cfg.haushalt);
  void nachweisSpeicher.uebernimm();
  setzeNachweisjournal(new Nachweisjournal(nachweisSpeicher, undefined, SAMMELN_MS));
  void merkeVersion(nachweisEinstellungen, eigeneVersion()).catch((e) =>
    log.warn('Version für die Nachweise nicht gemerkt', { fehler: (e as Error).message }),
  );
  // Fehlende Dokumentdatei (#877): einmal je Datei mit Mappe ins Protokoll und als Hinweis in die Werkbank-Übersicht.
  beiFehlenderDatei((f) => {
    void dienst.dateienFehlen
      .merkeFehlendeDatei(f)
      .catch((e) => log.warn('Fehlende Datei nicht vermerkt', { fehler: (e as Error).message }));
  });
  // Benutzer erscheinen als Mappen (#26); die Konten halten sie auf dem neuesten Stand.
  const konten = new Konten(
    messung.umhuelle(pgKontoRepo(sql, cfg.haushalt), 'konto'),
    () => betrieb.mailer(),
    () => betrieb.adresseFuerLinks(),
    dienst.systemtypen.benutzerspiegel(),
  );
  // Links in Mails nur mit gepflegter Adresse, nie aus dem Host-Kopf der Anfrage.
  konten.verbindeMailAdresse(() => betrieb.gepflegteAdresse());
  dienst.verbindeKonten(konten.papierkorbHaken());
  // Startseite „Zuletzt geöffnet“ (#940): Anlegen und Ändern zählen wie Öffnen.
  dienst.kern.beiEigenerAenderung = (benutzerId, mappeId) => konten.merkeGeoeffnet({ id: benutzerId }, mappeId);
  konten.verbindeZustand(zustandDb);
  // Sprachpakete (#731): ihre Sprachen kommen dazu, sobald die Pakete lesbar sind; danach lädt der SprachDienst sie mit.
  const personenMitSprache = async (k: string) => (await konten.listeBenutzer()).filter((b) => b.aktiv !== false && b.sprache === k).length;
  const sprachpakete = new Sprachpakete({
    pakete: () => dienst.kern.repo.listePakete(),
    sprachpakete: () => dienst.kern.repo.sprachpakete(),
    personen: personenMitSprache,
  });
  sprachen.pakete = sprachpakete;
  await sprachen.lade().catch((e) => log.warn(`Sprachpakete nicht lesbar: ${(e as Error).message}`));
  // Texterkennung im Hintergrund (#45); dieselbe Datenbank, eigener Messbereich.
  // Wartungsmodus (#102): überdauert einen Neustart; pausiert die Hintergrundarbeiten.
  const wartung = new Wartung(pgBetriebSpeicher(sql, cfg.haushalt), konten);
  await wartung.laden();
  wartung.start();
  // Notfallzugang über eine RESCUE-Datei neben der Schlüsseldatei (#108).
  // Hinweise an die Verwaltenden (#818, statt „an die Administratoren“): je Werkbank-Bereich an alle, die ihn verwalten
  // dürfen (auch „Gesamte Verwaltung“); ohne Bereich an „Gesamte Verwaltung“.
  const anVerwaltendeVon =
    (bereich?: string) => async (betreff: import('../mail/mail').MailText, text: import('../mail/mail').MailText) => {
      await anVerwaltende(await konten.listeBenutzer(), betrieb.mailer(), betreff, text, bereich);
    };
  spDeps.wartung = wartung;
  // Eigene Organisation (#995): Notiz an die Verwaltenden, wenn sich Merkmal oder Verantwortliche ändern.
  dienst.verbindeVerwaltungsmail((bereich) => anVerwaltendeVon(bereich));
  return { dienst, konten, personenMitSprache, sprachpakete, wartung, anVerwaltendeVon };
}
