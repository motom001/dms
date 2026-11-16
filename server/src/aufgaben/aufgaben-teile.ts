import type { EreignisseDienst } from '../ereignisse/index';
import type { MappenDienst, MappenHistorie } from '../mappen';
import type { PostSystemmappen } from '../post';
import type { ZugriffDienst } from '../zugriff';
import type { MappenAblaeufe } from './ablaeufe';
import type { AufgabenDienst } from './aufgaben.dienst';
import type { Fristen } from './fristen';
import type { OhneEmpfaenger } from './ohne-empfaenger';
import type { OhneLeserecht } from './ohne-leserecht';
import type { AufgabenVertretung } from './vertretung';

/*
 * Alle Teile der Aufgaben, wie der Dienst sie zusammensetzt (#1278, Schritt 5b; vorher in aufgaben.dienst.ts). Ganz
 * oben im Ordner: Keine Klasse hier bindet diese Datei ein – jede nennt nur die Teile, die sie ruft, die Vertretung
 * über `VertretungTeil` (vertretung-teil.ts).
 */

/** Die Teile, die die Aufgaben rufen – dazu alle Klassen dieses Ordners (zusammengesetzt im Dienst). */
export interface AufgabenTeile {
  rechte: ZugriffDienst;
  historie: MappenHistorie;
  mappen: MappenDienst;
  ereignisse: EreignisseDienst;
  systemmappen: PostSystemmappen;
  aufgaben: AufgabenDienst;
  vertretung: AufgabenVertretung;
  ohneLeserecht: OhneLeserecht;
  fristen: Fristen;
  ohneEmpfaenger: OhneEmpfaenger;
  /** Mappen-Abläufe aus Automatisierungsvorlagen (#1044). */
  ablaeufe: MappenAblaeufe;
}
