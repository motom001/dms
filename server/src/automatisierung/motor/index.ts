/**
 * Motor der Automatisierungen (#674, #1278, vorher `server/src/automatisierung.ts`). Er bekommt den ganzen Dienst und
 * steht damit über ihm – daher eine eigene Tür (wie `pakete/verwaltung/index.ts`); `automatisierung/index.ts` reicht
 * dieselben Namen weiter, damit Importe von `./automatisierung` gleich bleiben. Nur Namen, die außerhalb des Motors
 * gebraucht werden (knip); Typen wie `AutomatisierungDeps` holen die Teile direkt aus ihrer Datei.
 */
export { Automatisierungen } from './automatisierungen';
export { uuidAus } from './hilfen';
export { DANN_AUSFUEHRER, KarteLeer, type KartenKontext } from './karten';
export { pgAutomatisierungRepo, speicherAutomatisierungRepo } from './repo';
export { BENACHRICHTIGUNGEN_PAKET, istPostFuerDich, postFuerDichDaten } from './umzug';
