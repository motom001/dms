/**
 * Texte des gemeinsamen Codes (#727): Hinweise, Fehler und Beschreibungen, die Weboberfläche und Server
 * gleichermaßen zeigen. Sie stehen in `sprachen/de/gemeinsam.json` und werden über `t` mit dem Schlüssel `gemeinsam.<datei>.<text>`
 * abgerufen. Bereiche mit eigener Datei (felder, werkbank …) holen ihre Texte weiter selbst.
 */
import { uebersetzer } from './sprache';
import gemeinsam from './sprachen/de/gemeinsam.json';

export const t = uebersetzer({ gemeinsam });
