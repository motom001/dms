# Suche (#964)

**Zweck:** Alles, was die Suche über die Mappenliste hinaus kann – an einer Stelle.

- `suche.dienst.ts` – `SucheDienst`: unscharfe Suche (#356: Tippfehler an/aus, gleichbedeutende Wörter von Werkbank
  und Paketen, Wörterverzeichnis), Vektoren zu Dokumenten (#442: Zwischenspeicher je Modell, Einstellung, Stand für die
  Werkbank) und ähnliche Dokumente (zu einem Vektor, einer Mappe, einem Suchbegriff, einem Text #444, Mappentypen #939).
- `suche.routen.ts` – Routen der Werkbank (Suche, Vektoren, Erkennung) und „Frag deine Ablage“ (#960).
- `index.ts` – die einzige Tür für die Fachlogik. Die Routen holt nur `routen.ts` direkt.

**Abhängigkeiten**

- Bekommt den **Kern** (`repo`, `repoOhneTransaktion` für den Zwischenspeicher der Vektoren, der über Transaktionen
  hinweg gilt, `einstellungen`, `zugriff`), die **Rechteprüfung** (`ZugriffDienst` aus `zugriff/index.ts`: `lesbare`,
  `pruefeRecht`) und einen `SucheAnschluss` vom Dienst: `konten` (Dienstkonto eines Pakets für `aehnlicheTypen`).
- Schicht 3: importiert nur sich selbst, tiefere Fachordner und den Kern (je über `index.ts`), `shared/`, die Basis und
  `vektoren.ts`. Geprüft mit `npm run lint:abh` (Regel `fachordner` in `.dependency-cruiser.cjs`).
- Wer sucht, ruft weiter `dienst.…` (Fassade mit einzeiligen Weiterleitungen) oder `dienst.suche.…`.

**Regeln**

- Nie den Dienst, Rechte nur über `zugriff/`. Was die Suche sonst vom Dienst braucht, kommt über den Anschluss herein.
- `kern.repo` bei jedem Aufruf neu holen; nur Zwischenspeicher, die über Transaktionen hinweg gelten, nehmen
  `kern.repoOhneTransaktion`.
- Neuer Code hier ohne neue Einträge in `eslint-suppressions.json` (umgetragen: `max-params` von `aehnlicheTypen`).
- `vektorNachlauf` liegt seit #1078 in `ereignisse/`. Noch im Dienst, weil sie andere Fachbereiche braucht:
  die Suche in der Mappenliste (`listeMappen`: Varianten, Vorschlag, ähnliche Treffer).

Mehr im Entwicklerhandbuch unter *Aufbau → Suche*.
