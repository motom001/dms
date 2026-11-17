import { t } from '../sprache';
import { Kopf } from './Kopf';
import { AngabenSchritt } from './paket-erstellen/angaben';
import { Auswahl } from './paket-erstellen/auswahl';
import { ErstellenSchritt, istAngabe, Leiste, NeuOderVersion, PruefenSchritt, Schrittleiste } from './paket-erstellen/schritte';
import { usePaketErstellen, type ErstellenZustand } from './paket-erstellen/zustand';

/**
 * Werkbank → Pakete → Paket erstellen (#374): eigene Mappentypen und Ansichten als Paket im Format der
 * Registry, zum Mitnehmen in ein anderes DMS („Paket hochladen“ im Expertenmodus).
 * Prüfung und Erzeugung macht der Server; hier wird nur ausgewählt, angezeigt und heruntergeladen.
 * Seit #1279 in Teilen unter paket-erstellen/ (Zustand, Auswahl, Angaben, Schritte); diese Datei bleibt die Tür.
 */
export { ERSTELLEN, SELBST } from './paket-erstellen/schritte';

export function PaketErstellen({ onErstellt }: { onErstellt?: () => void } = {}) {
  const z = usePaketErstellen(onErstellt);
  const { stand, e, schritt, fehler } = z;
  if (fehler && !stand)
    return (
      <div className="leer">
        <p>{fehler}</p>
      </div>
    );
  if (!stand || !e)
    return (
      <div className="leer">
        <p>{t('werkbank.paketerstellen.lade')}</p>
      </div>
    );
  const p = z.pruefung;
  const auswahlProbleme = p?.probleme.filter((x) => !istAngabe(x)) ?? [];
  const angabeProbleme = p?.probleme.filter(istAngabe) ?? [];
  return (
    <div className="einspaltig">
      <Kopf
        titel={t('werkbank.paketerstellen.paket-erstellen')}
        ueber={t('werkbank.paketerstellen.werkbank-pakete')}
        hilfe="werkbank.pakete.erstellen">
        <p className="leise">{t('werkbank.paketerstellen.mach-aus-deinen-eigenen')}</p>
      </Kopf>
      <Schrittleiste schritt={schritt} setSchritt={z.setSchritt} />

      {schritt === 0 && <ErsterSchritt z={z} />}
      {schritt === 1 && <PruefenSchritt z={z} probleme={auswahlProbleme} />}
      {schritt === 2 && <AngabenSchritt z={z} probleme={angabeProbleme} />}
      {schritt === 3 && <ErstellenSchritt z={z} />}

      {fehler && (
        <div className="hinweis schlecht" role="alert">
          <p>{fehler}</p>
        </div>
      )}

      <Leiste z={z} />
    </div>
  );
}

/** Schritt 1: erst „Neues Paket oder neue Version?“ (#652), dann die Auswahl – mit Hinweis, was weggefallen ist. */
function ErsterSchritt({ z }: { z: ErstellenZustand }) {
  const { stand, e, frage, weg } = z;
  if (frage) return <NeuOderVersion stand={stand!} neu={z.neuesPaket} version={z.ausEntwurf} />;
  return (
    <>
      {weg && (
        <div className="hinweis warn" role="status">
          <p>{weg}</p>
        </div>
      )}
      <Auswahl
        stand={stand!}
        e={e!}
        suche={z.suche}
        setSuche={z.setSuche}
        umschalten={z.umschalten}
        mitDokumenten={(an) => z.setze({ beispielDokumente: an })}
        pruefung={z.pruefung}
      />
    </>
  );
}
