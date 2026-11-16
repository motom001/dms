/**
 * Gemeinsames Fachmodell für Server und Weboberfläche.
 *
 * Ein Mappentyp definiert Felder. Eine Mappe ist eine Instanz eines
 * Mappentyps und speichert ihre Werte je Feldschlüssel.
 * Die Prüfregeln hier gelten auf beiden Seiten: die Oberfläche zeigt
 * Fehler früh an, der Server lässt nichts Ungültiges in die Datenbank.
 *
 * Seit #1278 nach Fachgebieten aufgeteilt (vorher eine Datei `shared/src/model.ts`); diese Datei reicht alles weiter,
 * damit Importe von `…/shared/src/model` gleich bleiben. Die Form von Feld, Mappentyp und Mappe kommt aus basis.ts, der
 * zweiten Tür für Teile, die das Fachmodell selbst einbindet (#1278, Schritt 5).
 */
export * from './basis';
export * from './konto';
export * from './systemtypen';
export * from './werte';
export * from './pruefen';
export * from './texterkennung';
export * from './dokument';
export * from './aufgaben';
export * from './historie';
export { zeitzone } from '../region';
export {
  BELIEBIGER_TYP,
  ZIELTYPEN_MAX,
  einzigesZiel,
  gemeinsameFelder,
  gleicheZiele,
  jedeMappe,
  mehrereZiele,
  normalisiereZiele,
  zielErlaubt,
  zieleVon,
  zielTypenAus,
} from '../verweisziele';
export type { Zeitraum } from '../feldarten';
