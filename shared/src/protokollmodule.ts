/**
 * Module des Protokolls (#682): eine feste Liste, damit der Filter in Werkbank → Protokoll alle zeigt – auch ohne
 * Einträge – und jedes Modul einen verständlichen Namen hat (Sprachdatei werkbank/wartung.json, `protokoll.modul.<kürzel>`).
 * Der Server schreibt nur in diese Module (Protokoll.modul nimmt nur sie an), ein Test prüft die Namen.
 * Dieselbe Liste nutzt später die Wenn-Karte „Neue Protokollmeldung“ (#677).
 */
export const MODULE = [
  'system',
  'http',
  'konto',
  'ablage',
  'dokumente',
  'werkbank',
  'datenschutz',
  'texterkennung',
  'umwandlung',
  'archivfassung',
  'vorschau',
  'datenbank',
  'mail',
  'sicherung',
  'ereignisse',
  'automatisierung',
  // #1490: Paket-Läufer und Paket-Code (Ausgaben, Fehler, Abstürze).
  'pakete',
  // #1569: Aufträge an Leistungen (Arbeit für Ablago und Pakete).
  'auftraege',
] as const;
export type Modul = (typeof MODULE)[number];
