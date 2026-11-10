/**
 * Paket-Einstellungen (#961) – die einzige Tür für die Fachlogik (Routen: pakete.routen.ts). Neben `pakete.ts` heißt
 * der Import `./pakete/index`, sonst fände Node die Datei `pakete.ts`.
 */
export {
  paketArchive, paketEinstellungen, paketEntwuerfe, paketKatalogStaende, paketQuellen, paketSpeicher, paketUmwandlungen, setzePaketArchive,
  setzePaketEinstellungen, setzePaketEntwuerfe, setzePaketKatalogStand, setzePaketQuellen, setzePaketSpeicher, setzePaketUmwandlungen,
  type KatalogSchluessel, type Paketablage, type PaketQuelleEintrag,
} from './pakete.einstellungen';
