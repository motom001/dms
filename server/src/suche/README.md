# Suche (#964)

**Zweck:** Alles, was die Suche über die Mappenliste hinaus kann – an einer Stelle.

- `suche.dienst.ts` – `SucheDienst`: unscharfe Suche (#356: Tippfehler an/aus, gleichbedeutende Wörter von Werkbank
  und Paketen, Wörterverzeichnis), Vektoren zu Dokumenten (#442: Zwischenspeicher je Modell, Einstellung, Stand für die
  Werkbank) und ähnliche Dokumente (zu einem Vektor, einer Mappe, einem Suchbegriff, einem Text #444, Mappentypen #939).
- `suche.routen.ts` – Routen der Werkbank (Suche, Vektoren, Erkennung) und „Frag deine Ablage“ (#960).
- `index.ts` – die einzige Tür für die Fachlogik. Die Routen holt nur `routen.ts` direkt.

**Abhängigkeiten**

- Bekommt den **Kern** (`repo`, `einstellungen`, `zugriff`) und einen `SucheAnschluss` vom Dienst: `grundRepo` (das Repo
  außerhalb jeder Transaktion – der Zwischenspeicher der Vektoren gilt über Transaktionen hinweg), `lesbare` und
  `pruefeRecht` (Schicht „zugriff“, noch im Dienst) und `konten` (Dienstkonto eines Pakets für `aehnlicheTypen`).
- Importiert nur sich selbst, den Kern (über `kern/index.ts`), `shared/`, die Basis und `vektoren.ts`. Geprüft mit
  `npm run lint:abh` (`suche-nur-abwaerts`, `suche-nur-ueber-index` in `.dependency-cruiser.cjs`).
- Wer sucht, ruft weiter `dienst.…` (Fassade mit einzeiligen Weiterleitungen) oder `dienst.suche.…`.

**Regeln**

- Kein anderer Fachbereich wird importiert. Braucht die Suche etwas von dort, kommt es über den Anschluss herein.
- `kern.repo` bei jedem Aufruf neu holen; nur Zwischenspeicher, die über Transaktionen hinweg gelten, nehmen `grundRepo`.
- Neuer Code hier ohne neue Einträge in `eslint-suppressions.json` (umgetragen: `max-params` von `aehnlicheTypen`).
- Noch im Dienst, weil sie andere Fachbereiche brauchen: `vektorNachlauf` (KI-Sperre der Pakete, Ereignis-Wecker) und
  die Suche in der Mappenliste (`listeMappen`: Varianten, Vorschlag, ähnliche Treffer).

Mehr im Entwicklerhandbuch unter *Aufbau → Suche*.
