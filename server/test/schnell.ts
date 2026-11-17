/**
 * Schnelle scrypt-Parameter für die Server-Tests (#1358): Die Skripte in package.json laden diese Datei mit `--import`,
 * Tests zu Passwort-Hashes binden sie selbst ein. Im Betrieb wählt nichts schwächere Parameter (`aktuelleParameter`).
 */
import { setzeTestParameter } from '../src/anmeldung/passwort';

export const SCHNELL = { N: 2 ** 10, r: 8, p: 1 } as const;
setzeTestParameter(SCHNELL);
