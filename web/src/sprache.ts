/**
 * Texte der Weboberfläche aus den Sprachdateien (#473). Neue oder geänderte Texte kommen in
 * `shared/src/sprachen/de/<bereich>.json` und werden mit `t('<bereich>.<schluessel>', { platzhalter })`
 * abgerufen; ein neuer Bereich wird unten ergänzt. Anleitung: Entwicklerhandbuch → Aufbau → Texte.
 */
import { uebersetzer } from '../../shared/src/sprache';
import anmeldung from '../../shared/src/sprachen/de/anmeldung.json';
import pakete from '../../shared/src/sprachen/de/pakete.json';
import felder from '../../shared/src/sprachen/de/felder.json';
import profil from '../../shared/src/sprachen/de/profil.json';
import spalten from '../../shared/src/sprachen/de/spalten.json';
import systemzustand from '../../shared/src/sprachen/de/systemzustand.json';
import werkbank from '../../shared/src/sprachen/de/werkbank.json';

export const t = uebersetzer({ anmeldung, felder, pakete, profil, spalten, systemzustand, werkbank });
