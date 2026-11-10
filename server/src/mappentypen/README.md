# Mappentypen (#1073)

**Zweck:** Alles, was einen Mappentyp ausmacht, an einer Stelle: Typen anlegen und ändern, Systemtypen, Nummernkreise,
Passung der Mappen und Pakete am Typ. Schicht 2 der Zielaufteilung – über Kern und Rechteprüfung, neben `mappen/` und
`dokumente/`.

- `mappentypen.dienst.ts` – `MappentypenDienst`: `listeTypen`, `typenFuer`, `rechteUebersicht`, `legeTypAn`,
  `aendereTyp` (mit Stempel- und Erkennungseinstellung, #394, #391, #337; in einer Transaktion, #962; Stand #917),
  `loescheTyp`, `belegteTypen`, `ausDokumentVon`, `typErkennungen`.
- `eingabe.ts` – Eingaben bereinigen (reine Funktionen): `bereinigeTyp`, `bereinigeFeld`, `bereinigeRegister`,
  `bereinigeTrefferlisten`, `behalte…` beim Ändern, `liesStand` (#609), Beschriftungen (#728, #729).
- `passung.ts` – `Passung`: Passt eine Mappe zu ihrem Typ? `pruefePassung`, `passungFuer`, `pruefeUnpassende`,
  `passungNachziehen` (beim Start).
- `nummernkreise.ts` – `Nummernkreise` (#171): Kreise pflegen, Zählerstand, Nummern nachträglich vergeben (Auftrag);
  `ARCHIV_KREIS` (#345).
- `systemtypen.ts` – `Systemtypen`: `sichereSystemtypen` (Schritt der Mappentypen in der Systemausstattung, #963),
  Benutzer-Mappen für die Benutzerverwaltung (`benutzerspiegel`, `entferneBenutzerMappe`, `weitereRollen`),
  `ablageortTyp` (#883), Spur im Verwaltungsmodus (#820).
- `pakete-am-typ.ts` – `TypPakete` (#686): `paketeAmTyp`, `setzePaketVerwehrt`, `paketSiehtNicht` (Zustellung).
- `index.ts` – die einzige Tür. `mappentypen.routen.ts` (Routen, #960) holt `routen.ts` direkt.

**Abhängigkeiten**

- Jede Klasse bekommt den **Kern** (`repo`, `einstellungen`, `inEinemZug`, `historie`, `anlaesse`, `system()`,
  `paketVerwehrt()`, `ablageortId()`), `TypPakete` und `Systemtypen` dazu die Rechteprüfung (`ZugriffDienst`).
- Was noch im Dienst liegt, kommt über einen Anschluss je Klasse herein: Stempel, Erkennung und Berechtigungen am Typ
  (`MappentypenAnschluss`), „passt nicht“-Aufgaben, Archivkreis, Titel, Aufträge, Systemmappen schreiben und löschen,
  Benutzer spiegeln, Kurzzustand.
- Importiert nur sich selbst, Kern und Rechteprüfung (je über `index.ts`), `shared/` und die Basis – geprüft mit
  `npm run lint:abh` (Regel `fachordner`, Schicht 2 in `SCHICHTEN`).
- Wer Mappentypen braucht, ruft weiter `dienst.…` (Fassade mit einzeiligen Weiterleitungen); die Systemausstattung
  bekommt `sichereSystemtypen` beim Zusammenbau.

**Regeln**

- Keine Fachlogik anderer Bereiche hier: Braucht ein Mappentyp etwas von dort, kommt es über den Anschluss.
- `kern.repo` bei jedem Aufruf neu holen (Getter `repo`) – in einer Transaktion sieht es deren Änderungen.
- Noch im Dienst: Stempel am Typ (`mitStempel`, künftig `pdf/`/`ausgang/`), Berechtigungen am Typ
  (`berechtigungenAusEingabe`, seit #1076 in `berechtigungen/`, über den Anschluss) und `ausPostZiele` (#937). Titel und Archivkreis liegen seit
  #1074 in `mappen/` und kommen weiter über den Anschluss.
- Neuer Code ohne neue Einträge in `eslint-suppressions.json` (umgetragen: drei `complexity` und ein
  `no-unused-vars` in `eingabe.ts`, ein `no-unused-vars` in `mappentypen.dienst.ts`, ein `max-lines-per-function` in
  `systemtypen.ts`).

Mehr im Entwicklerhandbuch unter *Aufbau → Mappentypen*.
