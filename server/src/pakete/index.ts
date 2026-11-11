/**
 * Paket-Einstellungen (#961) – die einzige Tür für die Fachlogik (Routen: pakete.routen.ts). Neben `pakete.ts` heißt
 * der Import `./pakete/index`, sonst fände Node die Datei `pakete.ts`.
 */
export {
  paketArchive, paketEinstellungen, paketEntwuerfe, paketKatalogStaende, paketQuellen, paketSpeicher, paketUmwandlungen, setzePaketArchive,
  setzePaketEinstellungen, setzePaketEntwuerfe, setzePaketKatalogStand, setzePaketQuellen, setzePaketSpeicher, setzePaketUmwandlungen,
  type KatalogSchluessel, type Paketablage, type PaketQuelleEintrag,
} from './pakete.einstellungen';
/** Vorgaben (#1038): Paketformat, Vorschau, Anlegen; Text-Vorlagen prüfen. */
export {
  anzeigeMitVorgaben, anzeigeVorgaben, bedingungsVorgaben, istVorgabeBedingung, legeVorgaben, liesVorgaben, ordneVorgaben, passwortFelder, planeErgaenzungen, planeVorgaben,
  pruefwert, vorgabeMappen, vorgabenLage, vorgabeVerweisFehler, vorlagenFehlerText, vorlagenName, vorlagenRegister, werteIn,
  type PaketErgaenzung, type PaketVorgabe, type PaketVorgabenTeil, type PaketVorlage, type VorgabenDienst, type VorgabenErgebnis, type VorgabenLage,
} from './vorgaben';
export { pruefeVorlage, vorlagenPlatzhalter, type VorlagenFehler } from './vorlagen';
