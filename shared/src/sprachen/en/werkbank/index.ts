/**
 * Bereich `werkbank` der Sprachdateien (#1279): je Teil der Werkbank eine Datei, hier zu einem Bereich zusammengeführt.
 * Die Schlüssel im Code bleiben `werkbank.<schluessel>`. In welche Datei ein neuer Schlüssel gehört, steht im
 * Entwicklerhandbuch (Texte und Sprachen → Texte und Sprachdateien); doppelte Schlüssel meldet shared/test/sprachdateien-teile.test.ts.
 */
import ablage from './ablage.json';
import benutzer from './benutzer.json';
import datenschutz from './datenschutz.json';
import einstellungen from './einstellungen.json';
import pakete from './pakete.json';
import paketerstellen from './paketerstellen.json';
import post from './post.json';
import postfaecher from './postfaecher.json';
import rahmen from './rahmen.json';
import sicherung from './sicherung.json';
import sichten from './sichten.json';
import stempel from './stempel.json';
import uebersicht from './uebersicht.json';
import verschluesselung from './verschluesselung.json';
import wartung from './wartung.json';

export default {
  ...ablage,
  ...benutzer,
  ...datenschutz,
  ...einstellungen,
  ...pakete,
  ...paketerstellen,
  ...post,
  ...postfaecher,
  ...rahmen,
  ...sicherung,
  ...sichten,
  ...stempel,
  ...uebersicht,
  ...verschluesselung,
  ...wartung,
};
