import { hatSchnittstelle, istKiPaket, type InstalliertesPaket } from './pakete';
import { KERN_TYPEN, type EinstellungBlock, type Einstellungsbeschreibung, type KernTyp } from './paketeinstellungen';
import { t } from './texte';

/**
 * Feldarten des Kerns auf der Paketseite (#996): Was früher als eigener Block unter der Übersicht stand, ist eine
 * Einstellung im Reiter „Einstellungen“. Ein Paket kann die Feldart im Manifest nennen (eigener Abschnitt, eigene
 * Überschrift); nennt es sie nicht, hängt Ablago sie in einem eigenen Abschnitt nach den Feldern des Manifests an.
 */
type PaketTeil = Pick<InstalliertesPaket, 'laeufer' | 'mappenaktionen'>;

/** Welche Feldarten des Kerns zu einem Paket gehören – aus seinen Schnittstellen und Aktionen. */
export function kernFelderVon(p: PaketTeil): KernTyp[] {
  const c = p.laeufer;
  return KERN_TYPEN.filter((k) =>
    k === 'ki_mappentypen'
      ? istKiPaket(c)
      : k === 'fragen_grenzen'
        ? hatSchnittstelle(c, 'dms:antworten')
        : k === 'erkennung_standard'
          ? hatSchnittstelle(c, 'dms:erkennen')
          : !!p.mappenaktionen?.length,
  );
}

/** Überschrift des Abschnitts, den Ablago für eine Feldart des Kerns anhängt. */
export function kernTitel(k: KernTyp): string {
  switch (k) {
    case 'ki_mappentypen':
      return t('gemeinsam.paketreiter.kern.ki-mappentypen');
    case 'fragen_grenzen':
      return t('gemeinsam.paketreiter.kern.fragen-grenzen');
    case 'erkennung_standard':
      return t('gemeinsam.paketreiter.kern.erkennung-standard');
    default:
      return t('gemeinsam.paketreiter.kern.mappenaktionen');
  }
}

/**
 * Was im Reiter „Einstellungen“ steht: die Beschreibung aus dem Manifest, dazu je fehlender Feldart des Kerns ein
 * Abschnitt. null: Das Paket hat nichts einzustellen (dann gibt es den Reiter nicht).
 */
export function mitKern(b: Einstellungsbeschreibung | null | undefined, p: PaketTeil): Einstellungsbeschreibung | null {
  const genannt = new Set((b?.bloecke ?? []).flatMap((x) => x.felder.map((f) => f.typ)));
  const dazu: EinstellungBlock[] = kernFelderVon(p)
    .filter((k) => !genannt.has(k))
    .map((k) => ({ art: 'abschnitt', titel: kernTitel(k), felder: [{ schluessel: k, name: kernTitel(k), typ: k }] }));
  if (!b && !dazu.length) return null;
  return { bloecke: [...(b?.bloecke ?? []), ...dazu], aktionen: b?.aktionen ?? [] };
}

/** Gibt es bei diesem Paket einen Reiter „Einstellungen“? */
export const hatEinstellungen = (p: PaketTeil & Pick<InstalliertesPaket, 'einstellungen'>) =>
  !!p.einstellungen || kernFelderVon(p).length > 0;
