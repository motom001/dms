import type { EreignisseDienst } from '../ereignisse/index';
import type { MappenHistorie } from '../mappen';
import type { ZugriffDienst } from '../zugriff';
import type { AufgabenDienst } from './aufgaben.dienst';
import type { OhneLeserecht } from './ohne-leserecht';
import type { VertretungTeil } from './vertretung-teil';

/**
 * Die Teile, die die Abläufe (ablaeufe.ts) rufen (#1278, Schritt 5b: Auszug aus `AufgabenTeile`, aufgaben-teile.ts).
 * Eigene Datei, damit ablaeufe.ts unter der Grenze von 700 Zeilen bleibt.
 */
export interface AblaeufeTeile {
  rechte: ZugriffDienst;
  historie: MappenHistorie;
  ereignisse: EreignisseDienst;
  aufgaben: Pick<AufgabenDienst, 'pruefeEmpfaenger'>;
  ohneLeserecht: Pick<OhneLeserecht, 'faelleNach' | 'zugriffVon'>;
  vertretung: VertretungTeil;
}
