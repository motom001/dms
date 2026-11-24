/**
 * Start (#1278, aus `ablago.ts`): Texterkennung (#45), Vorschaubilder (#332), Umwandeln (#577), Exporte (#797),
 * geschützte PDFs (#827) und Archivfassung (#631).
 */
import { Texterkennung } from '../volltext/texterkennung';
import { pgRepo } from '../repo/pg';
import { ordnerSpeicher } from '../dateien/dateispeicher';
import { pgBetriebSpeicher } from '../einstellungen/betrieb';
import { Vorschaubilder, ordnerAblage, type NachlaufStand } from '../dateien/vorschau';
import { join } from 'node:path';
import { zieheFassungenUm, ordnerFassungen, fassungsOrdner, Dateiumwandlung } from '../dateien/dateiumwandlung';
import { exportOrt, zieheExporteUm, alterExportOrdner, merkeUmzug } from '../export/exportordner';
import { pgEinstellungen } from '../einstellungen/einstellungen';
import { t } from '../sprache/sprache';
import { PdfEntsperren } from '../dateien/entsperren';
import { Archivfassung, ordnerArchiv, archivOrdner, woerterOrdner } from '../dateien/archivfassung';
import type { richteBetriebEin } from './betrieb';
import type { verbindeDatenbank } from './datenbank';
import type { vorbereiten } from './vorbereiten';
import type { baueDienst } from './dienst';
import { pgAuftraege } from '../leistungen';

/** Was richteDokumenteEin von früher braucht. */
type Bisher = Pick<Awaited<ReturnType<typeof richteBetriebEin>>, 'messung' | 'tresor'> &
  Pick<Awaited<ReturnType<typeof verbindeDatenbank>>, 'sql' | 'zustandDb'> &
  Pick<Awaited<ReturnType<typeof vorbereiten>>, 'cfg' | 'ordner' | 'leiter' | 'log'> &
  Pick<Awaited<ReturnType<typeof baueDienst>>, 'dienst' | 'wartung'>;

/** Texterkennung, Vorschau, Fassungen und Exporte. */
export async function richteDokumenteEin(bisher: Bisher) {
  const { messung, sql, cfg, ordner, dienst, wartung, leiter, log, tresor, zustandDb } = bisher;
  const texterkennung = new Texterkennung(
    messung.umhuelle(pgRepo(sql, cfg.haushalt), 'texterkennung'),
    ordnerSpeicher(ordner.dateien, cfg.haushalt),
    pgBetriebSpeicher(sql, cfg.haushalt),
  );
  dienst.dokumente.verbindeTexterkennung(texterkennung);
  texterkennung.pause = () => wartung.aktiv;
  wartung.beimAusschalten(() => texterkennung.anstossen());
  // Leistungen (#1569): Aufträge in der Datenbank; der Wartungsmodus hält den Hintergrund an, danach geht es weiter.
  dienst.leistungen.verbindeSpeicher(pgAuftraege(sql, cfg.haushalt));
  dienst.leistungen.pause = () => wartung.aktiv;
  wartung.beimAusschalten(() => dienst.leistungen.anstossen());
  // Vorschaubilder der ersten Seite (#332): außerhalb des Haushaltsordners, damit sie nicht in die Sicherung gehen.
  const vorschau = new Vorschaubilder(
    ordnerAblage(join(ordner.dateien, 'vorschau', cfg.haushalt)),
    ordnerSpeicher(ordner.dateien, cfg.haushalt),
  );
  dienst.dokumente.verbindeVorschau(vorschau);
  vorschau.pause = () => wartung.aktiv;
  wartung.beimAusschalten(() => vorschau.anstossen());
  // Dateien umwandeln (#577): Fassungen aus Paketen mit dms:umwandeln im Haushaltsordner – sie gehen mit in die
  // Sicherung (seit 0.140.1; vorher lagen sie daneben und ziehen beim Start um). Daraus Vorschaubild und Volltext.
  if (leiter)
    await zieheFassungenUm(ordner.dateien, cfg.haushalt).catch((e) =>
      log.warn('Umgewandelte Fassungen nicht verschoben', { fehler: (e as Error).message }),
    );
  // Exporte (#797): Was noch unter sicherung/export/ liegt, zieht in den Export-Ordner um – mit Hinweis in der Werkbank.
  const exporte = await exportOrt(ordner);
  if (leiter)
    try {
      const u = await zieheExporteUm(alterExportOrdner(ordner), exporte.pfad);
      if (u.anzahl || u.uebrig) {
        await merkeUmzug(pgEinstellungen(sql, cfg.haushalt), u);
        log[u.uebrig ? 'warn' : 'info'](t('meldungen.index.exporte-aus-dem-sicherungsordner'), {
          anzahl: u.anzahl,
          nach: exporte.pfad,
          ...(u.uebrig ? { uebrig: alterExportOrdner(ordner) } : {}),
        });
      }
    } catch (e) {
      log.warn('Exporte nicht aus dem Sicherungsordner verschoben', { fehler: (e as Error).message });
    }
  if (exporte.imSicherungsordner && leiter)
    log.warn(
      'Der Export-Ordner liegt im Sicherungsordner: Unverschlüsselte Exporte gehen mit jeder Kopie der Sicherung mit. Lege das Volume für /data/export an einen anderen Ort.',
      { pfad: exporte.pfad },
    );
  const fassungen = ordnerFassungen(fassungsOrdner(ordner.dateien, cfg.haushalt));
  const umwandlung = new Dateiumwandlung(dienst.dokumentUmwandlung.umwandlungAnbindung(fassungen, vorschau));
  dienst.dokumentUmwandlung.verbindeUmwandlung(umwandlung, vorschau);
  vorschau.fassung = (sha) => umwandlung.lies(sha);
  texterkennung.umwandlung = {
    lies: (sha) => umwandlung.lies(sha),
    paketFuer: (m) => umwandlung.paketFuer(m),
    anfordern: (d) => umwandlung.anfordern(d),
    gesperrt: (sha) => umwandlung.gesperrt(sha),
  };
  // Geschützte PDFs (#827): entsperrte Fassungen (qpdf) neben den umgewandelten; gemerkte Passwörter je Konto verschlüsselt.
  const entsperren = new PdfEntsperren(
    dienst.geschuetztePdfs.entsperrenAnbindung({
      ablage: fassungen,
      speicher: pgEinstellungen(sql, cfg.haushalt),
      verschluessele: (k) => tresor.verschluessele(k),
      entschluessele: (w) => tresor.entschluessele(w),
      zustand: zustandDb,
    }),
  );
  dienst.geschuetztePdfs.verbindeEntsperren(entsperren);
  texterkennung.entsperrt = (sha) => entsperren.fassung(sha);
  // Volltext aus Paketen (#614): Dateitypen, für die ein Paket mit dms:volltext den Text liefert.
  texterkennung.volltextPaket = dienst.paketVolltext;
  // Archivfassung (PDF/A, #631): Pakete mit dms:archivfassung legen sie im Haushaltsordner ab (Sicherung, Vollexport);
  // Wortpositionen der Texterkennung daneben. Der Kern meldet Dokumente erst mit feststehendem Volltext.
  const archivfassung = new Archivfassung(
    dienst.dokumentArchiv.archivAnbindung(
      ordnerArchiv(archivOrdner(ordner.dateien, cfg.haushalt), woerterOrdner(ordner.dateien, cfg.haushalt)),
    ),
  );
  dienst.dokumentArchiv.verbindeArchivfassung(archivfassung);
  // Vorschaubild auch aus der Archivfassung (#1216): als letzte Quelle; Stand des Nachlaufs für alle Prozesse im Kurzzustand.
  vorschau.archiv = { info: (sha) => archivfassung.info(sha), lies: (sha) => archivfassung.lies(sha) };
  vorschau.nachlaufSpeicher = {
    lies: async () => ((await zustandDb.lies('vorschau-nachlauf', 'stand'))?.wert ?? null) as NachlaufStand | null,
    schreibe: (s) => zustandDb.setze('vorschau-nachlauf', 'stand', s, Date.now() + 7 * 24 * 60 * 60_000),
  };
  dienst.dokumentArchiv.verbindeVorschau(vorschau);
  return { texterkennung, vorschau, exporte };
}
