/**
 * Paketverwaltung (#1278, vorher `server/src/pakete.ts`): Kataloge und ihre Signatur, Hochladen, Vorschau,
 * Installieren, Updates, Paket-Einstellungen, Entfernen. Sie bekommt den ganzen Dienst und steht damit über ihm – daher
 * eine eigene Tür neben `pakete/index.ts`, das der Dienst selbst einbindet (sonst liefe ein Kreis über `dienst.ts`).
 */
export { ARCHIV_MAX, liesZip } from './zip-lesen';
export { beispielDateiart, beispielName } from './beispiele';
export { berechnetAenderung, beschriftungenNeu } from './update-neu';
export { holeDaten } from './abruf';
export { KLEIN_MAX, liesSammelVerzeichnis, SAMMEL_MAX, type Sammeldatei } from './sammeldatei';
export { liesPaket } from './lesen';
export { neueKennung, type Manifest, type PaketAutomatisierung } from './format';
export { Paketverwaltung } from './paketverwaltung';
export { type Handelnder, type PaketLaeufer, type SprachpaketHaken } from './optionen';
export { type InstallierenEingabe, type UmbauEingabe } from './plan';
// Zeitpunkte in Meldungen der Paketverwaltung (#1451: in der Zone der Region; der Test prüft das von außen).
export { zeitText } from './hilfen';
// Dienste im Netz (#1635): wer was bekommt – die Vorschau prüft der Test von außen.
export { diensteImNetz } from './dienste-im-netz';
