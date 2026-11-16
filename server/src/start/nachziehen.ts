/**
 * Start (#1278, aus `ablago.ts`): Arbeiten beim Start im Leiter (Titel, Benutzer, Typen, Fassungen), Systemkonto
 * und Ereigniskatalog (#670).
 */
import type { richteBetriebEin } from './betrieb';
import type { vorbereiten } from './vorbereiten';
import type { oeffneStartseite } from './startseite';
import type { baueDienst } from './dienst';
import type { richteSicherungEin } from './sicherung';
import type { richteAutomatisierungenEin } from './automatisierungen';

/** Was zieheNach von früher braucht. */
type Bisher = Pick<Awaited<ReturnType<typeof richteBetriebEin>>, 'betrieb'> &
  Pick<Awaited<ReturnType<typeof vorbereiten>>, 'leiter' | 'log' | 'version'> &
  Pick<Awaited<ReturnType<typeof oeffneStartseite>>, 'start'> &
  Pick<Awaited<ReturnType<typeof baueDienst>>, 'dienst' | 'konten' | 'wartung'> &
  Pick<Awaited<ReturnType<typeof richteSicherungEin>>, 'wiederherstellung'> &
  Pick<Awaited<ReturnType<typeof richteAutomatisierungenEin>>, 'automatisierungen'>;

/** Arbeiten beim Start, Systemkonto und Ereigniskatalog. */
export async function zieheNach(bisher: Bisher) {
  const { betrieb, leiter, log, start, dienst, konten, wartung, wiederherstellung, automatisierungen, version } = bisher;

  const kurz = betrieb.kurz();
  if (leiter) {
    log.info(
      `E-Mail-Versand: ${kurz.mail === 'aus' ? 'aus – Links werden in der Benutzerverwaltung angezeigt (einrichten in Werkbank → E-Mail und Adresse)' : kurz.mail}`,
    );
    log.info(`Adresse für Links: ${kurz.adresse}`);
    start.schritt('titel');
    const nachgezogen = await dienst.mappenTitel.titelNachziehen();
    if (nachgezogen) log.info(`Titel von ${nachgezogen} Mappen berechnet`);
    // Systemtypen Benutzer und Rolle anlegen und jedem Benutzer seine Mappe geben (auch nach einem Update).
    start.schritt('benutzer');
    await dienst.postSystemmappen.gleicheBenutzerAb(await konten.listeBenutzer(), (f, g) => start.menge(f, g));
    // Titel „… (ehemalig)“ aus älteren Versionen zurücksetzen (#663); deaktiviert zeigt die Oberfläche durchgestrichen.
    const ehemalig = await dienst.mappenTitel.ehemaligZuruecksetzen();
    if (ehemalig) log.info(`Titel von ${ehemalig} deaktivierten Benutzern ohne „(ehemalig)“ neu berechnet`);
  }
  // Systemkonto „Automatisierung“ (#673): sichtbar, nie anmeldbar; Automatisierungen (#674) laufen darunter.
  await konten.systemkonto('automatisierung');
  dienst.systemkonten = (k) => konten.systemkonto(k);
  // Ereigniskatalog (#670): verteilt aus der Datenbank; ruht in Wartung und Wiederherstellung.
  dienst.ereignisseRuhen = () => wartung.aktiv || wiederherstellung.laeuft();
  // Mehrere Prozesse (#745): verteilt nur der Leiter – bei den anderen fehlen die Abnehmer (Automatisierungen).
  if (leiter) {
    dienst.ereignisse.starte();
    automatisierungen.start();
    wartung.beimAusschalten(() => dienst.ereignisse.wecke());
    // Schlüssel für Mappentypen (#145), einmalig nach dem Update.
    start.schritt('typen');
    // Fassungen (#1006): Umzüge beim Start erscheinen als „Update auf Ablago <Version>“.
    await dienst.kern.mitFassungsKontext({ urheber: { art: 'update', version } }, async () => {
      await dienst.mappenTitel.typSchluesselNachziehen();
      // Haken „Neue Mappen/Löschen erlauben“ → Berechtigungen (#146), einmalig nach dem Update.
      await dienst.mappenTitel.hakenUeberfuehren();
    });
    // Was die Migrationen geändert haben, bekommt seine Fassung – einmal je Version; Einträge ohne Fassung ihre erste.
    await dienst.fassungen
      .abgleich(version)
      .catch((e: unknown) => log.warn('Fassungen nicht abgeglichen', { fehler: (e as Error).message }));
    const geprueft = await dienst.passung.passungNachziehen((f, g) => start.menge(f, g));
    if (geprueft) log.info(`Mappen von ${geprueft} Mappentypen gegen ihre Definition geprüft`);
  }
  return {};
}
