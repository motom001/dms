/**
 * Start (#1278, aus `ablago.ts`): Volltext-Ereignis und Texterkennung als Paket (#336, #458), Sicherung außer Haus
 * (#585, #976), Systemlast (#409), Fehlermeldungen (#70) und Werkbank-Rechte des Systemkontos (#677).
 */
import { hatSchnittstelle } from '../../../shared/src/pakete';
import { paketEinstellungen } from '../pakete/index';
import { adressfelder } from '../../../shared/src/paketeinstellungen';
import { tDe } from '../sprache/sprache';
import { Systemlast } from '../system/systemlast';
import { Fehlermeldungen, pgFehlerRepo } from '../system/fehlermeldungen';
import { ordnerSpeicher } from '../dateien/dateispeicher';
import { systemWerkbank } from '../automatisierung/automatisierung-werkbank';
import type { Paketlaeufer } from '../laeufer/verwaltung';
import type { Fernlaeufer } from '../laeufer/fern';
import type { richteDokumenteEin } from './dokumente';
import type { baueDienst } from './dienst';
import type { richteSicherungEin } from './sicherung';
import type { richteBetriebEin } from './betrieb';
import type { verbindeDatenbank } from './datenbank';
import type { vorbereiten } from './vorbereiten';

/** Was verbindePakete von früher braucht. */
type Bisher = Pick<Awaited<ReturnType<typeof richteDokumenteEin>>, 'texterkennung'> &
  Pick<Awaited<ReturnType<typeof baueDienst>>, 'dienst' | 'wartung'> &
  Pick<Awaited<ReturnType<typeof richteSicherungEin>>, 'sicherung'> &
  Pick<Awaited<ReturnType<typeof richteBetriebEin>>, 'messung'> &
  Pick<Awaited<ReturnType<typeof verbindeDatenbank>>, 'sql'> &
  Pick<Awaited<ReturnType<typeof vorbereiten>>, 'cfg' | 'ordner'> & {
    paketlaeufer: Paketlaeufer | null;
    laeufer: Paketlaeufer | Fernlaeufer;
  };

/** Pakete an Texterkennung und Sicherung, Systemlast und Fehlermeldungen. */
export function verbindePakete(bisher: Bisher) {
  const { texterkennung, dienst, sicherung, paketlaeufer, wartung, laeufer, messung, sql, cfg, ordner } = bisher;
  // Ereignis „Volltext fertig“ (#336, #458) nach dem Schritt des Kerns – auch ohne Text, damit ein Paket für die
  // Texterkennung übernehmen kann; nicht bei Fehler, ausgelassen oder abgebrochen.
  texterkennung.nachher = (d, e, k) => {
    // Ausgelassen: E-Mails bekommen trotzdem ihre Archivfassung (#946) – ohne Paket, das ihren Text liefert, steht ihr
    // Volltext damit fest (leer).
    if (e.stand === 'ausgelassen') {
      void dienst.volltexte.volltextAusgelassen(d.id);
      return;
    }
    if (e.stand !== 'fertig' && e.stand !== 'paket') return;
    // Umgewandelte Datei (#577): mime ist der Typ der Fassung, original der des Dokuments.
    void dienst.volltexte.volltextFertig(
      { dokument: d.id, mappe: d.mappeId },
      {
        quelle: 'kern',
        text: k.text,
        mime: k.mime ?? d.mime,
        ...(k.original ? { original: k.original } : {}),
        seiten: e.seiten ?? null,
        neu: k.neu,
        seitenOhneText: k.seitenOhneText,
      },
    );
  };
  // Texterkennung als Paket (#458): das installierte Paket mit dms:texterkennung.
  texterkennung.paket = () => dienst.volltexte.texterkennungPaket();
  // Sicherung außer Haus (#585): Pakete mit dms:sicherung-lesen bekommen jede fertige Sicherung (Ereignis sicherung.fertig),
  // lesen die verschlüsselte Datei in Stücken und melden je Sicherung zurück. Adresse: die bestätigte aus den Einstellungen.
  sicherung.extern = {
    pakete: async () =>
      Promise.all(
        (await dienst.kern.repo.listePakete())
          .filter((p) => hatSchnittstelle(p.laeufer, 'dms:sicherung-lesen'))
          .map(async (p) => {
            const werte = p.einstellungen ? ((await paketEinstellungen(dienst.kern, p.id))?.werte ?? {}) : {};
            const adresse = p.einstellungen
              ? (adressfelder(p.einstellungen)
                  .map((f) => werte[f.schluessel])
                  .find((v): v is string => typeof v === 'string' && !!v) ?? null)
              : null;
            return { id: p.id, name: p.name, adresse, holen: hatSchnittstelle(p.laeufer, 'dms:sicherung-holen') };
          }),
      ),
    melde: (daten) => dienst.kern.ereignis('sicherung.fertig', { ...daten }),
    // Entfernte Sicherungen (#976): Aufträge an Pakete mit dms:sicherung-holen über den Paket-Läufer.
    holen: (paket, eingang, ms) => {
      if (!dienst.sicherungHolen) throw new Error(tDe('meldungen.sicherung.entfernt.laeufer'));
      return dienst.sicherungHolen.rufe(paket, eingang, ms);
    },
  };
  dienst.sicherungAufgegeben = (paket, name, fehler) => sicherung.externAufgegeben(paket, name, fehler);
  dienst.sicherungAntwort = (paket, name, r) => sicherung.externAntwort(paket, name, r);
  if (paketlaeufer) wartung.beimAusschalten(() => void paketlaeufer.stelleZu());
  // Systemzustand → Auslastung (#409): CPU, Arbeitsspeicher, Netzwerk jede Minute, nur im Arbeitsspeicher.
  const systemlast = new Systemlast({
    laeufer: () => laeufer.pid,
    postgres: process.env.DMS_VARIANTE === 'komplett',
    schleife: () => !!messung.auslastung.warnung(),
  });
  systemlast.start();

  // Fehlermeldungen der Benutzer (#70) – Screenshots getrennt von den Dokumenten; Ereignis „Fehler gemeldet“ (#677).
  const fehlermeldungen = new Fehlermeldungen(
    pgFehlerRepo(sql, cfg.haushalt),
    ordnerSpeicher(ordner.dateien, `${cfg.haushalt}/fehlermeldungen`),
  );
  fehlermeldungen.beimMelden = (m) =>
    dienst.kern.ereignis('fehler.gemeldet', { fehlermeldung: m.id, benutzer: m.benutzerId, zeitpunkt: m.erstellt }, m.benutzerId);
  // Werkbank-Rechte des Systemkontos „Automatisierung“ (#677): genau Sicherung anstoßen, neue Version, gemeldete Fehler, Protokoll.
  const systemwerkbank = systemWerkbank({ sicherung, fehlermeldungen });
  return { systemlast, fehlermeldungen, systemwerkbank };
}
