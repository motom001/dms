/**
 * Start (#1278, aus `ablago.ts`): Texterkennung, Paket-Läufer und die wiederkehrenden Läufe des Leiters; die anderen
 * Prozesse fragen den Stand des Läufers ab.
 */
import { wiederkehrend } from '../zeitplan/streuung';
import type { Paketlaeufer } from '../laeufer/verwaltung';
import type { Fernlaeufer } from '../laeufer/fern';
import type { Notfallzugang } from '../notfall/notfall';
import type { Verwaltung } from '../werkbank/verwaltung';
import type { vorbereiten } from './vorbereiten';
import type { richteDokumenteEin } from './dokumente';
import type { verbindeDatenbank } from './datenbank';
import type { richteSicherungEin } from './sicherung';
import type { richteBetriebEin } from './betrieb';
import type { richteEingangEin } from './eingang';
import type { richteZugaengeEin } from './zugaenge';
import type { baueDienst } from './dienst';
import type { teileArbeitAuf } from './aufteilung';

/** Was starteHintergrund von früher braucht. */
type Bisher = Pick<Awaited<ReturnType<typeof vorbereiten>>, 'leiter' | 'log'> &
  Pick<Awaited<ReturnType<typeof richteDokumenteEin>>, 'texterkennung'> &
  Pick<Awaited<ReturnType<typeof verbindeDatenbank>>, 'lebt' | 'nurEiner' | 'zustandDb'> &
  Pick<Awaited<ReturnType<typeof richteSicherungEin>>, 'sicherung' | 'wiederherstellung'> &
  Pick<Awaited<ReturnType<typeof richteBetriebEin>>, 'speicherplatz'> &
  Pick<Awaited<ReturnType<typeof richteEingangEin>>, 'eingangsordner'> &
  Pick<Awaited<ReturnType<typeof richteZugaengeEin>>, 'postfaecher'> &
  Pick<Awaited<ReturnType<typeof baueDienst>>, 'wartung' | 'dienst'> &
  Pick<Awaited<ReturnType<typeof teileArbeitAuf>>, 'aufteilung'> & {
    laeufer: Paketlaeufer | Fernlaeufer;
    notfall: Notfallzugang;
    verwaltung: Verwaltung;
  };

/** Hintergrund und wiederkehrende Läufe. */
export async function starteHintergrund(bisher: Bisher) {
  const {
    leiter,
    texterkennung,
    lebt,
    laeufer,
    log,
    nurEiner,
    notfall,
    sicherung,
    speicherplatz,
    eingangsordner,
    postfaecher,
    wartung,
    wiederherstellung,
    dienst,
    verwaltung,
    zustandDb,
    aufteilung,
  } = bisher;
  if (leiter) {
    await texterkennung.start({ zurueckstellen: lebt.allein });
    await laeufer.start().catch((e: unknown) => log.error('Paket-Läufer startet nicht', { fehler: (e as Error).message }));
    // RESCUE-Datei (#108): Sie liegt neben der Schlüsseldatei, also für alle Prozesse dieselbe – prüfen nur unter Sperre.
    const notfallLauf = () =>
      void nurEiner('notfall-datei', () => notfall.pruefe()).catch((e) =>
        log.error('Notfallzugang prüfen fehlgeschlagen', { fehler: (e as Error).message }),
      );
    notfallLauf();
    wiederkehrend('notfall-datei', 30_000, notfallLauf);
    sicherung.start();
    speicherplatz.start();
    await eingangsordner.start();
    postfaecher.start();
    // Technische Aufgaben des Admin-Kontos (#719): alle 5 Minuten prüfen, höchstens einmal am Tag gebündelt mailen.
    // Vorher die Aufgaben bei Personen ohne Leserecht abgleichen (#798: Rechte geändert, Erwähnungen, Fristen …).
    wiederkehrend('verwaltung', 5 * 60 * 1000, () => {
      if (wartung.aktiv || wiederherstellung.laeuft()) return;
      void nurEiner('verwaltung', async () => {
        await dienst.ohneLeserecht
          .faelleAbgleichen()
          .catch((e) => log.warn('Aufgaben ohne Leserecht nicht abgeglichen', { fehler: (e as Error).message }));
        await verwaltung.tick();
      }).catch((e) => log.error('Technische Aufgaben prüfen fehlgeschlagen', { fehler: (e as Error).message }));
    });
    // Wörterverzeichnis der Suche (#575): neue Wörter aus dem Eingang übernehmen – entkoppelt von Mappen und Texterkennung.
    let woerterFehler = '';
    setInterval(() => {
      if (wiederherstellung.laeuft()) return;
      void dienst.suche.woerterEinarbeiten().then(
        () => {
          woerterFehler = '';
        },
        (e) => {
          // Nur einmal je Fehlerbild melden, nicht alle fünf Sekunden.
          if ((e as Error).message !== woerterFehler)
            log.warn('Wörterverzeichnis: neue Wörter nicht übernommen', { fehler: (e as Error).message });
          woerterFehler = (e as Error).message;
        },
      );
    }, 5000).unref();
    wiederkehrend(
      'probe',
      60_000,
      () =>
        void nurEiner('probe', () => wiederherstellung.tick()).catch((e) =>
          log.error('Zeitplan der Probe gestört', { fehler: (e as Error).message }),
        ),
    );
    // Notfallkontakte (#812): Info-Mails, die auf den E-Mail-Versand gewartet haben – sobald er eingerichtet ist.
    wiederkehrend('notfallkontakte', 5 * 60_000, () => {
      if (wartung.aktiv || wiederherstellung.laeuft()) return;
      void nurEiner('notfallkontakte', () => dienst.notfallkontakte.zustellen()).catch((e) =>
        log.warn('Info-Mails an Notfallkontakte nicht verschickt', { fehler: (e as Error).message }),
      );
    });
    // Vorschaubilder aus der Archivfassung für den Bestand (#1216): Dateien mit Archivfassung ohne Bild nachholen – mit
    // Nachrang in der Warteschlange der Vorschaubilder (Pause vor jedem Bild), je Lauf ein Stapel; nur ein Prozess zugleich.
    wiederkehrend('vorschau-archiv', 10 * 60_000, () => {
      if (wartung.aktiv || wiederherstellung.laeuft()) return;
      void nurEiner('vorschau-archiv', () => dienst.dokumentArchiv.vorschauNachlauf()).catch((e) =>
        log.warn('Vorschaubilder aus Archivfassungen nicht nachgeholt', { fehler: (e as Error).message }),
      );
    });
    // Schriften (#1329): einmalig nach dem Update Archivfassungen und Vorschaubilder von PDFs mit nicht eingebetteten
    // Schriften neu erzeugen – gedrosselt, je Lauf ein kleiner Stapel; danach nur noch ein Blick in die Einstellung.
    wiederkehrend('schrift-nachlauf', 10 * 60_000, () => {
      if (wartung.aktiv || wiederherstellung.laeuft()) return;
      void nurEiner('schrift-nachlauf', () => dienst.dokumentArchiv.schriftNachlauf()).catch((e) =>
        log.warn('PDFs mit nicht eingebetteten Schriften nicht neu erzeugt', { fehler: (e as Error).message }),
      );
    });
    // Abgelaufenes aus dem Kurzzustand (#744) wegräumen – Fehlversuche, Tickets, Merker.
    wiederkehrend(
      'kurzzustand',
      10 * 60_000,
      () =>
        void nurEiner('kurzzustand', () => zustandDb.raeumeAuf()).catch((e) =>
          log.warn('Kurzzustand nicht aufgeräumt', { fehler: (e as Error).message }),
        ),
    );
  } else {
    await laeufer.start().catch((e: unknown) => log.warn('Stand des Paket-Läufers nicht abgefragt', { fehler: (e as Error).message }));
    await aufteilung.start();
  }
  return {};
}
