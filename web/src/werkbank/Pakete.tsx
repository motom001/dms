import { t } from '../sprache';
import { MappenMenueBlock } from './PaketAktionen';
import { ERSTELLEN, PaketErstellen, SELBST } from './PaketErstellen';
import { AlleAktualisieren } from './PaketeAlle';
import type { PaketeZustand } from './paketeZustand';
import { SelbstErstelltAnsicht } from './SelbstErstellt';
import { PaketDetail } from './pakete/detail';
import { ALLE, SAMMEL, UPLOAD } from './pakete/pfade';
import { SammelDetail, UploadDetail } from './pakete/teile';
import { WerMachtDas } from './mitgeliefert/wer-macht';
import type { MitgeliefertZustand } from './mitgeliefert/zustand';

/**
 * Werkbank → Pakete (#188): Konfigurationspakete aus dem offiziellen Katalog.
 * Den Katalog fragt das DMS nur auf Knopfdruck ab, nie im Hintergrund.
 * Expertenmodus (#189, #369): weitere Katalogadressen und Hochladen als Datei, in einem
 * aufklappbaren Abschnitt direkt unter den Knöpfen.
 */
/** Seit #1279 in Teilen unter pakete/ (Liste, Paketseite, Reiter, Link, Teile); diese Datei bleibt die Tür. */
export { PaketeListe } from './pakete/liste';
export { PaketLink } from './pakete/link';

export function PaketePanel({ z, id, mitgeliefert }: { z: PaketeZustand; id?: string; mitgeliefert: MitgeliefertZustand }) {
  if (!id)
    return (
      <div className="einspaltig">
        <div className="mappenkopf">
          <p className="ueber">{t('werkbank.pakete.werkbank')}</p>
          <h1>{t('werkbank.pakete.pakete')}</h1>
          <p className="leise">{t('werkbank.pakete.ein-paket-bringt-fertige')}</p>
          <p className="leise">{t('werkbank.pakete.ein-update-ergaenzt-nur')}</p>
          <p className="leise">{t('werkbank.pakete.eigene-mappentypen-und-ansichten')}</p>
        </div>
        {/* Menü „Mappe“ (#1039): eingebaute Aktionen an einer Stelle, Aktionen der Pakete im Überblick. */}
        {z.stand && <MappenMenueBlock pakete={z.stand.installiert} />}
        {/* „Wer macht das?“ (#1570): nur, wenn eine Tätigkeit mehr als einen hat, der sie kann. */}
        <WerMachtDas z={mitgeliefert} />
      </div>
    );
  if (id === UPLOAD) return <UploadDetail z={z} />;
  if (id === SAMMEL) return <SammelDetail z={z} />;
  if (id === ALLE) return <AlleAktualisieren z={z} />;
  if (id === ERSTELLEN) return <PaketErstellen key={location.search} onErstellt={() => void z.laden()} />;
  if (id.startsWith(SELBST))
    return (
      <SelbstErstelltAnsicht
        id={id.slice(SELBST.length)}
        konflikt={z.konflikt(id.slice(SELBST.length))}
        onGeaendert={() => void z.laden()}
      />
    );
  const quelle = new URLSearchParams(location.search).get('quelle') ?? undefined;
  return <PaketDetail key={`${id}|${quelle ?? ''}`} z={z} id={id} quelle={quelle} mitgeliefert={mitgeliefert} />;
}
