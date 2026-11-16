/**
 * Paket selbst erstellen (#374; #1278, vorher `server/src/paketerstellung.ts`). Eigene Tür wie `verwaltung/index.ts`:
 * Die Paketerstellung bekommt den ganzen Dienst.
 */
export { aenderung, baue, dmsOptionen, FELDARTEN_AB, mindestversion, Paketerstellung } from './paketerstellung';
