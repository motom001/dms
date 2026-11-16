/**
 * Motor der Automatisierungen (#674, #1278, vorher `server/src/automatisierung.ts`). Er bekommt den ganzen Dienst und
 * steht damit über ihm – daher eine eigene Tür (wie `pakete/verwaltung/index.ts`); `automatisierung/index.ts` reicht
 * dieselben Namen weiter, damit Importe von `./automatisierung` gleich bleiben.
 */
export { Automatisierungen } from './automatisierungen';
export { type AutomatisierungDeps, uuidAus } from './hilfen';
export { DANN_AUSFUEHRER, type DannAusfuehrer, KarteLeer, type KartenKontext } from './karten';
export { type AutomatisierungRepo, pgAutomatisierungRepo, speicherAutomatisierungRepo } from './repo';
export { BENACHRICHTIGUNGEN_PAKET, istPostFuerDich, postFuerDichDaten } from './umzug';
