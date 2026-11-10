# Rechte prüfen (#1072)

**Zweck:** Wer was darf – an genau einer Stelle, damit die Rechteprüfung überall gleich wirkt und leicht nachzuprüfen ist.
Schicht 1 der Zielaufteilung: direkt über dem Kern, unter allen anderen Fachordnern.

- `zugriff.dienst.ts` – `ZugriffDienst`:
  - `zugriff(ich)` bildet einmal je Anfrage (#741), was jemand lesen darf: Menschen nach den Regeln am Mappentyp
    (Administratoren alles, #128), Dienstkonten der Pakete nach den bestätigten Rechten (#338, #686, #796),
    Systemkonten nach den Regeln ihrer Rolle (#673), dazu Leserechte auf Zeit (#798).
  - `rechteAn`, `rechteAnVielen` – wirksame Rechte an Mappen; `pruefeRecht` – Mappe holen und ein Recht verlangen
    (ohne Lesen 404); `lesbare`, `maskiereBezuege`, `mitPasswortRecht`.
  - Für andere Personen: `sichtbarFuer`, `kannLesen`, „Was sieht Benutzer X?“ (`wasSieht`, #125); `mappeVon`.
  - Für den Dienst: `bildeZugriff`, `typverweise`, `mappenquelle`, `aufloesung`.
- `index.ts` – die einzige Tür. Dazu `maskiert` und `NICHT_SICHTBAR` für Titel nicht lesbarer Mappen.

**Abhängigkeiten**

- Bekommt den **Kern** (`repo`, `system()`, `paketVerwehrt()`, `ablageortId()`) und einen `ZugriffAnschluss` vom Dienst:
  `kiSperre` (KI-Einstellung der Pakete, #796) und `konten` (alle Benutzer, vom Start verbunden).
- Importiert nur sich selbst, den Kern (über `kern/index.ts`), `shared/`, die Basis und `messung.ts`. Geprüft mit
  `npm run lint:abh` (Regel `fachordner` in `.dependency-cruiser.cjs`).
- Der Kern bindet `zugriff/` nicht ein; `kern.zugriff(ich)` ruft, was der Dienst beim Zusammenbau hereinreicht.
- Wer prüft, ruft weiter `dienst.…` (Fassade mit einzeiligen Weiterleitungen) oder als Fachordner den `ZugriffDienst`,
  den er beim Zusammenbau bekommt (wie die Suche).

**Regeln**

- Keine Fachlogik anderer Bereiche hier: Braucht die Rechteprüfung etwas von dort, kommt es über den Anschluss herein.
- `kern.repo` bei jedem Aufruf neu holen – in einer Transaktion sieht der Zugriff deren Änderungen und wird nicht
  über die Anfrage hinaus gemerkt.
- Noch im Dienst: die Werkbank der Berechtigungen (`berechtigungenListe`, `testlauf` …, künftig `berechtigungen/`),
  und `regulaerSichtbarFuer` (#798). `paketSiehtNicht` (#686) liegt seit #1073 in `mappentypen/pakete-am-typ.ts`.
- Neuer Code hier ohne neue Einträge in `eslint-suppressions.json` (umgetragen: `complexity` von `rechteAnEine`).

Mehr im Entwicklerhandbuch unter *Aufbau → Rechte prüfen*.
