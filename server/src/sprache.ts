/**
 * Texte des Servers aus den Sprachdateien (#473): E-Mails, Fehlermeldungen der API, später PDFs.
 * Neue oder geänderte Texte kommen in `shared/src/sprachen/de/<bereich>.json` und werden hier mit
 * `t('<bereich>.<schluessel>', { platzhalter })` abgerufen; ein neuer Bereich wird unten ergänzt.
 */
import { uebersetzer } from '../../shared/src/sprache';
import anmeldung from '../../shared/src/sprachen/de/anmeldung.json';
import mail from '../../shared/src/sprachen/de/mail.json';
import werkbank from '../../shared/src/sprachen/de/werkbank.json';

export const t = uebersetzer({ anmeldung, mail, werkbank });
