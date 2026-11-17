/**
 * Bereich `meldungen` der Sprachdateien (#1279): je Fachordner des Servers eine Datei, hier zu einem Bereich
 * zusammengeführt. Die Schlüssel im Code bleiben `meldungen.<schluessel>`. In welche Datei ein neuer Schlüssel gehört,
 * steht im Entwicklerhandbuch (Aufbau → Texte und Sprachdateien); doppelte Schlüssel meldet
 * shared/test/sprachdateien-teile.test.ts.
 */
import ablage from './ablage.json';
import anmeldung from './anmeldung.json';
import dateien from './dateien.json';
import datenschutz from './datenschutz.json';
import dienst from './dienst.json';
import einstellungen from './einstellungen.json';
import erkennung from './erkennung.json';
import http from './http.json';
import pakete from './pakete.json';
import paketerstellung from './paketerstellung.json';
import post from './post.json';
import sicherung from './sicherung.json';
import start from './start.json';
import system from './system.json';

export default {
  ...ablage,
  ...anmeldung,
  ...dateien,
  ...datenschutz,
  ...dienst,
  ...einstellungen,
  ...erkennung,
  ...http,
  ...pakete,
  ...paketerstellung,
  ...post,
  ...sicherung,
  ...start,
  ...system,
};
