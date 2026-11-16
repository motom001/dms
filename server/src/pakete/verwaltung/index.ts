/**
 * Paketverwaltung (#1278, vorher `server/src/pakete.ts`): Kataloge und ihre Signatur, Hochladen, Vorschau,
 * Installieren, Updates, Paket-Einstellungen, Entfernen. Sie bekommt den ganzen Dienst und steht damit über ihm – daher
 * eine eigene Tür neben `pakete/index.ts`, das der Dienst selbst einbindet (sonst liefe ein Kreis über `dienst.ts`).
 */
export {
  ARCHIV_MAX,
  beispielDateiart,
  beispielName,
  berechnetAenderung,
  beschriftungenNeu,
  holeDaten,
  KLEIN_MAX,
  liesPaket,
  liesSammelVerzeichnis,
  liesZip,
  neueKennung,
  Paketverwaltung,
  SAMMEL_MAX,
  type Handelnder,
  type InstallierenEingabe,
  type Manifest,
  type PaketAutomatisierung,
  type PaketLaeufer,
  type Sammeldatei,
  type SprachpaketHaken,
  type UmbauEingabe,
} from './paketverwaltung';
