# Mappen (#1074)

**Zweck:** Alles, was eine einzelne Mappe ausmacht, an einer Stelle: anlegen, ändern und holen, Titel, Eingaben
prüfen, Historie lesen, Passwortfelder, Archivnummer und Archivmodus. Schicht 2 der Zielaufteilung – über Kern und
Rechteprüfung, neben `mappentypen/` und `dokumente/`.

- `mappen.dienst.ts` – `MappenDienst`: `holeMappe`, `legeMappeAn`, `aendereMappe` (Transaktion je Versuch, #609,
  #743), `verweisende`, Notizen lesen (#55), Favoriten und „gesehen“ (#62, #422), persönliche Einstellungen.
- `eingaben.ts` – `MappenEingaben`: `pruefeWerte`, Formate (#535), Auswahlfilter (#172, #173), „folgt aus“ (#886), „beim Auswählen übernehmen“ (#1037, nur Vorschläge mit den Rechten der Person),
  Verweisziele, `rechteVorschau`/`hinweisDanach` (#126), `feldkonflikte` (#609); `bereinigeWerte` (Modulebene).
  Nicht verwechseln mit `mappentypen/eingabe.ts` (Eingaben für Mappentypen).
- `titel.ts` – `MappenTitel`: `aktualisiereTitel`, `titelVorab` (#743), Nachziehen beim Start, „Absender bereinigen“.
- `historie.ts` – `MappenHistorie`: `historie` lesen (#800), `notiereAbruf`, `notiereBerechnet` (#1034, je Mappe und Tag ein Eintrag), Aufbewahrung; `notiere` schreibt über
  `kern.historie`.
- `passwortfelder.ts` – `Passwortfelder` (#46): `zeigePasswort`, `entschluesselePasswoerter`, `unlesbarePasswoerter`.
- `berechnet.ts` – berechnete Felder (#1034): `pruefeBerechnete` – die eine Prüfstelle in `legeMappeAn`/`aendereMappe`,
  nur das Paket aus `berechnetVon` schreibt (sonst 400 mit Paketnamen).
- `hinweise.ts` – `MappenHinweise` (#1034): Hinweise von Paketen setzen, entfernen und mit der Mappe lesen.
- `archiv.ts` – `MappenArchiv`: Archivnummer (#345) mit Aufkleberbogen, Archivmodus (#212), „Alle Dateien prüfen“.
- `index.ts` – die einzige Tür. `mappen.routen.ts` (Routen, #960) holt `routen.ts` direkt.

**Abhängigkeiten**

- Jede Klasse bekommt den **Kern**; `MappenDienst`, `MappenEingaben` und `MappenArchiv` dazu die Rechteprüfung
  (`ZugriffDienst`). `MappenDienst` bekommt die übrigen Klassen als `MappenTeile`.
- Was noch im Dienst liegt oder über ihn kommt, kommt über einen Anschluss herein: Konten, Aufgaben ohne Leserecht,
  Archivfassung, PDF-Schutz und fehlende Dateien (aus `dokumente/`, #1075), Datenschutz, `loeschPruefung`,
  `meldeVerknuepft`, Schlüssel (`verschluessele`, Tresor), Aufkleber, Aufträge.
- Importiert nur sich selbst, Kern, Rechteprüfung und Mappentypen (je über `index.ts`), `shared/` und die Basis –
  geprüft mit `npm run lint:abh` (Regel `fachordner`, Schicht 2 in `SCHICHTEN`).
- Wer Mappen braucht, ruft weiter `dienst.…` (Fassade mit einzeiligen Weiterleitungen).

**Regeln**

- Sofortiges beim Anlegen und Ändern nur über `kern.anlaesse.mappeGeaendert.melde(…)` am Ende der Transaktion
  (Passung, Erwähnungen, Fristen, Post-Aufgaben, #962). Die Empfänger meldet der Dienst beim Zusammenbau an; ihre
  Reihenfolge ändert sich nur in einem eigenen Pull Request.
- `kern.repo` bei jedem Aufruf neu holen (Getter `repo`) – in einer Transaktion sieht es deren Änderungen.
- Notizen schreiben seit #1078 in `notizen.ts` (`MappenNotizen`; Ereignis, Erwähnungen und Übersetzungen über den
  Anschluss). `loeschPruefung` (`loeschen/`), Aufgaben (`aufgaben/`) und `meldeVerknuepft` (`ereignisse/`) kommen
  weiter über den Anschluss am Dienst.
- Neuer Code ohne neue Einträge in `eslint-suppressions.json` (umgetragen: zwei `complexity` in `mappen.dienst.ts`,
  ein `max-params` in `eingaben.ts`).

Mehr im Entwicklerhandbuch unter *Aufbau → Mappen*.
