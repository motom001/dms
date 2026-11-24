/**
 * Paketverwaltung (#188): Katalog der Registry, Versionen und installierte Pakete.
 * Format von Katalog und Paket: motom001/dms-registry (README, schema/). Server und Oberfläche teilen diese Datei.
 *
 * Seit #1278 nach Aufgabe aufgeteilt (vorher eine Datei `shared/src/pakete.ts`); diese Datei reicht alles weiter,
 * damit Importe von `…/shared/src/pakete` gleich bleiben.
 */
import { PAKET_ID } from '../kennungen';
import { DMS_UMWANDELN_AB } from '../dateiumwandlung';
import { DMS_PAKET_VOLLTEXT_AB } from '../paketvolltext';
import { DMS_ARCHIVFASSUNG_AB } from '../archivfassung';
import { DMS_UEBERSETZEN_AB } from '../uebersetzung';

/** Muster der Paket-Id (#1084: bis 40 Zeichen, optional ein Punkt-Zusatz) – zentral in kennungen.ts. */
export { PAKET_ID };
/** Ab dieser Version (#577) kennt das DMS Dateien umwandeln; siehe shared/src/dateiumwandlung.ts. */
export { DMS_UMWANDELN_AB };
/** Ab dieser Version (#614) kennt das DMS Volltext aus Paketen; siehe shared/src/paketvolltext.ts. */
export { DMS_PAKET_VOLLTEXT_AB };
/** Ab dieser Version (#631) kennt das DMS die Archivfassung; siehe shared/src/archivfassung.ts. */
export { DMS_ARCHIVFASSUNG_AB };
/** Ab dieser Version (#732) kennt das DMS Inhalte übersetzen; siehe shared/src/uebersetzung.ts. */
export { DMS_UEBERSETZEN_AB };

export * from './katalog';
export * from './versionen';
export * from './schnittstellen';
export * from './code';
export * from './rechtepunkte';
export * from './ablauf';
export * from './stufe';
