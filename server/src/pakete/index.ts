/**
 * Paket-Einstellungen (#961) – die Tür für die Fachlogik (Routen: pakete.routen.ts); der Import heißt `./pakete/index`.
 * Paketverwaltung und Paketerstellung stehen über dem Dienst und haben eigene Türen: `verwaltung/index.ts`,
 * `erstellung/index.ts` (#1278).
 */
export {
  paketArchive,
  paketEinstellungen,
  paketEntwuerfe,
  paketKatalogStaende,
  paketQuellen,
  paketSpeicher,
  paketUmwandlungen,
  setzePaketArchive,
  setzePaketEinstellungen,
  setzePaketEntwuerfe,
  setzePaketKatalogStand,
  setzePaketQuellen,
  setzePaketSpeicher,
  setzePaketUmwandlungen,
  type KatalogSchluessel,
  type Paketablage,
  type PaketQuelleEintrag,
} from './pakete.einstellungen';
/** Vorgaben (#1038): Paketformat, Vorschau, Anlegen; Text-Vorlagen prüfen. */
export {
  anzeigeMitVorgaben,
  anzeigeVorgaben,
  bedingungsVorgaben,
  istVorgabeBedingung,
  legeVorgaben,
  liesVorgaben,
  ordneVorgaben,
  passwortFelder,
  planeErgaenzungen,
  planeVorgaben,
  pruefwert,
  vorgabeMappen,
  vorgabenLage,
  vorgabeVerweisFehler,
  vorlagenFehlerText,
  vorlagenName,
  vorlagenRegister,
  werteIn,
  type PaketErgaenzung,
  type PaketVorgabe,
  type PaketVorgabenTeil,
  type PaketVorlage,
  type VorgabenDienst,
  type VorgabenErgebnis,
  type VorgabenLage,
} from './vorgaben';
export { pruefeVorlage, vorlagenPlatzhalter, type VorlagenFehler } from './vorlagen';
/** Umbau (#1041): Umbau-Schritte lesen, planen, ausführen. */
export { liesUmbau, planeUmbau, wendeEntscheidungenAn, type GeplanterSchritt, type UmbauDienst, type UmbauLage } from './umbau';
export { fuehreUmbauAus, nimmEinstellungenZurueck, uebernahmeDaten, type UmbauErgebnis } from './umbau-ausfuehren';
export { titelKennung, wandle, type TitelSuche } from './umbau-werte';
/** Ansichten aus Paketen mit Prüfwert (#1125): ersetzen, solange unverändert; Stand zieht beim Umbau mit. */
export { sichtFassung, sichtPruefwert, sichtStandNach, sichtZustand, standNachUmbau } from './sichtstand';
/** Installieren unabhängig von der Reihenfolge (#1122): zweiter Durchgang, optionale Ziele in Bedingungen, Quellen. */
export { anzeigeTypIds, anzeigeWartet, optionaleInTyp, quelleAnlegbar, quellenNachtragen, type SollQuelle } from './installation';
/** Was mitkommt (#1047): Inhalt eines Pakets für Vorschau und Paketseite. */
export { mitkommtVon, type MitkommtNamen } from './mitkommt';
/** Namenskonflikte in der Vorschau (#1123). */
export { abhaengigeTypen, abhaengigkeitsKonflikte, eigeneKonflikte, Namensherkunft, type AbhaengigeTypen } from './namen';
// Was Ablago darf (#1562): Grenze für Pakete, Stand, Ändern.
export { DARF_HINWEIS, darfStand, setzeDarf, type DarfKontext } from './darf';
