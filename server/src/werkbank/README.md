# Werkbank (#1078)

**Zweck:** Was die Werkbank selbst einstellt und nicht zu einem anderen Fachbereich gehört: die Ansicht (#281) –
welche Vorlage die Installation zeigt und was jede Person für sich ein- oder ausblendet, reine Navigation, keine
Funktion wird abgeschaltet – und die Merkmale der Ablage (#1032, „beruflich genutzt“; Werkbank → Nutzung). Schicht 3
(nicht in `SCHICHTEN` genannt).

- `werkbank.dienst.ts` – `WerkbankDienst`: `werkbankAnsicht`, `setzeWerkbankAnsicht`, `merkmale`, `setzeMerkmale`
  (Vorlage folgt dem Merkmal, solange die Leiste unverändert ist). Gelesen werden die Merkmale über `kern.merkmale()`.
- `index.ts` – die einzige Tür. `werkbank.routen.ts` (Routen, #960) holt `routen.ts` direkt; die Routen fragen
  die übrigen Bereiche wie bisher über den Dienst.

**Abhängigkeiten**

- Bekommt nur den **Kern** (Einstellungen). Importiert nur Kern, `shared/` und die Basis.
- Wer die Ansicht braucht, ruft `dienst.werkbank.werkbankAnsicht(…)` (seit #1079 ohne Weiterleitung im Dienst).

**Regeln**

- Die Einstellung der Installation (`werkbank_ansicht`) prüft `liesAnsicht` aus `shared/`; ohne gültige Vorlage
  422. Die eigene Auswahl liegt je Person unter `werkbank_ansicht:<id>`; leer wird sie gelöscht.
- Neue Einstellungen der Werkbank kommen hierher, wenn sie zu keinem Fachordner gehören.
- Neuer Code ohne neue Einträge in `eslint-suppressions.json`.

Mehr im Entwicklerhandbuch unter *Aufbau → Werkbank*.
