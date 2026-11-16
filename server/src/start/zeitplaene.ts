/**
 * Start (#1278, aus `ablago.ts`): Zeitpläne für Papierkorb, Abwesenheiten und Fristen (#43, #78, #129), dazu die
 * Meldungen der Dann-Karten (#678).
 */
import { raeumeExporteAuf } from '../export/exportordner';
import { wiederkehrend } from '../zeitplan/streuung';
import { tAuto } from '../sprache/sprache';
import { heuteIn } from '../../../shared/src/sichten';
import type { baueDienst } from './dienst';
import type { richteDokumenteEin } from './dokumente';
import type { verbindeDatenbank } from './datenbank';
import type { vorbereiten } from './vorbereiten';
import type { richteEingangEin } from './eingang';
import type { richteAnmeldungEin } from './anmeldung';

/** Was richteZeitplaeneEin von früher braucht. */
type Bisher = Pick<Awaited<ReturnType<typeof baueDienst>>, 'wartung' | 'dienst' | 'konten'> &
  Pick<Awaited<ReturnType<typeof richteDokumenteEin>>, 'exporte'> &
  Pick<Awaited<ReturnType<typeof verbindeDatenbank>>, 'nurEiner' | 'zustandDb'> &
  Pick<Awaited<ReturnType<typeof vorbereiten>>, 'log' | 'leiter' | 'cfg'> &
  Pick<Awaited<ReturnType<typeof richteEingangEin>>, 'aufgabenmail' | 'einrichtungNoetig'> &
  Pick<Awaited<ReturnType<typeof richteAnmeldungEin>>, 'anmeldesperre'>;

/** Zeitpläne und Meldungen der Dann-Karten. */
export function richteZeitplaeneEin(bisher: Bisher) {
  const { wartung, dienst, exporte, nurEiner, log, leiter, konten, aufgabenmail, anmeldesperre, zustandDb, einrichtungNoetig, cfg } =
    bisher;
  // Papierkorb (#43): Abgelaufenes stündlich endgültig löschen.
  // Auskünfte (#396): nach 7 Tagen weg – im selben stündlichen Lauf.
  // Exporte (#797): nach dem Herunterladen bzw. nach 7 Tagen weg – derselbe Lauf wie für die Auskünfte.
  // Zeitpläne (#744): jeder Lauf unter einer Datenbanksperre – mit mehreren Prozessen arbeitet je Lauf nur einer.
  const papierkorb = async () => {
    if (!wartung.aktiv) await dienst.papierkorbVerwaltung.raeumePapierkorbAuf();
    await raeumeExporteAuf(exporte.pfad);
  };
  const papierkorbLauf = () =>
    nurEiner('papierkorb', papierkorb).catch((e) => log.error('Papierkorb aufräumen fehlgeschlagen', { fehler: (e as Error).message }));
  // Zeitpläne gestreut (#1198): erster Lauf mit festem Versatz je Name, nicht alle zur selben Sekunde.
  if (leiter) wiederkehrend('papierkorb', 60 * 60 * 1000, () => void papierkorbLauf());
  // Abwesenheit (#78): Abgelaufenes beenden, „abwesend“ an den Benutzer-Mappen nachziehen.
  const abwesenheiten = () =>
    nurEiner('abwesenheiten', () => konten.abwesenheitenPruefen()).catch((e) =>
      log.error('Abwesenheiten prüfen fehlgeschlagen', { fehler: (e as Error).message }),
    );
  if (leiter) wiederkehrend('abwesenheiten', 60 * 60 * 1000, () => void abwesenheiten());
  // Anmeldeschutz (#368) und Tägliche Zusammenfassung (#54): Wann gemeldet wird, entscheiden seit #678 die
  // Automatisierungen (Wenn-Karte „Zeitplan“, Paket „Benachrichtigungen“); die Dann-Karten rufen das hier auf.
  dienst.zusammenfassungAn = async (id, trocken) => {
    const r = await aufgabenmail.fuerAutomatisierung(id, trocken);
    return {
      gesendet: r.gesendet,
      grund: tAuto(`automatisierung.karte.zusammenfassung.${r.schluessel}` as never, { name: r.name, anzahl: r.anzahl }),
    };
  };
  dienst.anmeldeschutzMelden = async (was, daten, trocken) => {
    let ok: boolean;
    if (was === 'sammel') ok = await anmeldesperre.meldeTaeglich(trocken);
    else {
      const b = typeof daten.benutzer === 'string' ? (await konten.listeBenutzer()).find((x) => x.id === daten.benutzer) : undefined;
      ok = !!b?.email && (await anmeldesperre.kontoMelden(b.email, String(daten.ip ?? '?'), Number(daten.fehlversuche) || 0, trocken));
    }
    return {
      gesendet: ok && !trocken,
      grund: tAuto(
        ok
          ? trocken
            ? 'automatisierung.karte.anmeldeschutz.trocken'
            : 'automatisierung.karte.anmeldeschutz.gesendet'
          : 'automatisierung.karte.anmeldeschutz.nichts',
      ),
    };
  };
  // Fristen und Erinnerungen (#129, #131): einmal am Tag – gleich nach Mitternacht bzw. beim Start –, vor der Zusammenfassung.
  // Der erste Lauf beim Start (bei vielen Mappen lang) kommt seit #802 erst, wenn Ablago erreichbar ist (unten).
  // Mehrere Prozesse (#744): Tag des letzten Laufs in der Datenbank, der Lauf selbst unter Sperre.
  const fristen = () =>
    nurEiner('fristen', async () => {
      const heute = heuteIn();
      if (wartung.aktiv || (await zustandDb.lies('fristen-tag', 'lauf'))?.wert === heute) return;
      const r = await dienst.fristen.fristenLauf(heute);
      await zustandDb.setze('fristen-tag', 'lauf', heute, null);
      if (r.angelegt || r.erledigt || r.erinnerungen) log.info('Fristen und Erinnerungen geprüft', r);
    });
  if (leiter)
    wiederkehrend(
      'fristen',
      5 * 60 * 1000,
      () => void fristen().catch((e) => log.error('Fristen prüfen fehlgeschlagen', { fehler: (e as Error).message })),
    );
  if (einrichtungNoetig && leiter)
    log.warn(`Noch kein Benutzer vorhanden: Öffne Ablago im Browser (Port ${cfg.port}) und richte es mit dem Einrichtungscode ein.`);
  return { papierkorbLauf, abwesenheiten, fristen };
}
