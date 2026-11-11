/**
 * Bausteine der Oberfläche (#967): die Tür nach außen. Seiten importieren Bausteine nur von hier, nie aus den
 * Unterordnern – so bleibt das Innere eines Bausteins änderbar. Übersicht und Regeln: README.md in diesem Ordner und
 * Entwicklerhandbuch „Gestaltung und Bausteine“. Die Musterseite (muster.tsx) gehört nicht dazu: Sie lädt nur
 * start.tsx, und nur im Entwicklungsmodus und im Testbau.
 */
export { Feld, FeldGruppe, HakenFeld, NurLesenFeld, type FeldEingabe, type FeldGruppeProps, type FeldProps, type FeldVerknuepfung, type NurLesenFeldProps } from './feld/Feld';
export { ProzentEingabe, ZeitraumEingabe, type ProzentEingabeProps, type ZeitraumEingabeProps, type ZeitraumRoh } from './einheit/Einheit';
export { abfangen, Ergebnis, ErgebnisBlock, Knopf, KnopfLink, fehlerText, istKnopfErgebnis, knopfAussehen, type KnopfArt, type KnopfErgebnis, type KnopfGroesse, type KnopfLinkProps, type KnopfProps } from './knopf/Knopf';
export { Tabelle, type TabelleProps, type TabelleSpalte, type TabelleZeile } from './tabelle/Tabelle';
export { FilterHaken, Fundstellen, Hervorgehoben, KeineTreffer, ListenSuche, PaketFilter, Suchfeld, useListenSuche, type ListenSucheOptionen, type ListenSucheProps, type ListenSucheZustand, type PaketFilterProps, type SuchfeldProps } from './suche/Suche';
