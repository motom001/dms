/**
 * Beschädigtes Paket (#1551): Bestand passt nicht zur installierten Version – ihm fehlen eigene Mappentypen oder
 * Ansichten (z. B. nach einem früher halb abgebrochenen Entfernen oder Installieren). Ablago bietet dann Lösungen an:
 * Reparieren (fehlende Teile derselben Version neu anlegen), Neu installieren, Ganz entfernen.
 */
import type { InstalliertesPaket } from './katalog';

export interface FehlendeTeile {
  /** Schlüssel der Mappentypen bzw. Ansichten im Paket, die in der Ablage fehlen. */
  typen: string[];
  sichten: string[];
}

/** Was einem installierten Paket fehlt; null = vollständig. */
export function fehlendeTeile(
  p: Pick<InstalliertesPaket, 'typen' | 'sichten'>,
  typIds: ReadonlySet<string>,
  sichtIds: ReadonlySet<string>,
): FehlendeTeile | null {
  const typen = Object.entries(p.typen ?? {})
    .filter(([, id]) => !typIds.has(id))
    .map(([k]) => k);
  const sichten = Object.entries(p.sichten ?? {})
    .filter(([, id]) => !sichtIds.has(id))
    .map(([k]) => k);
  return typen.length || sichten.length ? { typen, sichten } : null;
}
