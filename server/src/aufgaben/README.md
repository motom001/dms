# Aufgaben (#1078)

**Zweck:** Alles rund um Aufgaben an einer Stelle: vergeben, erledigen, weitergeben, Vertretung bei Abwesenheit,
@-Erwähnungen, Fristen, Erinnerungen und Termine, Aufgaben bei Personen ohne Leserecht und der Alltags-Benutzer für
Aufgaben ohne Empfänger. Schicht 3 der Zielaufteilung – über Mappen, Ereignissen und Rechteprüfung.

- `aufgaben.dienst.ts` – `AufgabenDienst`: `pruefeEmpfaenger`, Erwähnungen (#56, #81), `aufgabenEmpfaenger` und
  `aufgabeAusAutomatisierung` (#676, #724; „Post für dich“ #1001), `erledigeNachAnlass`.
  Dazu die gemeinsamen Typen `AufgabenTeile` und `AufgabenAnschluss`.
- `vertretung.ts` – `AufgabenVertretung` (#77, #78, #415): Empfänger auflösen, umleiten, übergeben,
  `abwesenheitGeaendert`, vergeben, erledigen, weitergeben (auch gesammelt), gebündelt benachrichtigen, „Zu erledigen“.
- `ohne-leserecht.ts` – `OhneLeserecht` (#798, #958): Hinweis statt Text, Fälle abgleichen, Leserecht auf Zeit.
- `fristen.ts` – `Fristen` (#129–#133, #528, #725): Frist-Aufgaben abgleichen, „Frist erreicht“, Erinnerungen,
  Termine samt Zwischenspeicher, Folgetermin; der tägliche Lauf ruft die fälligen Mappen-Abläufe.
- `ohne-empfaenger.ts` – `OhneEmpfaenger` (#719, #422): Alltags-Benutzer, Favoriten benachrichtigen (wer, seit #1001
  aus der Automatisierung „Favoriten-Änderungen melden“).
- `ablaeufe.ts` – `MappenAblaeufe` (#1044): Automatisierungsvorlagen („Aufgabe vergeben“, „Erinnern“, aus Paketen,
  eigene) und Mappen-Abläufe – anwenden, laufen lassen mit den Rechten der Person zur Laufzeit, Werkbank.
- `index.ts` – die einzige Tür. `aufgaben.routen.ts` (Routen, #960) holt `routen.ts` direkt.

**Abhängigkeiten**

- Alle Klassen bekommen den **Kern** und dieselben `AufgabenTeile`: Rechteprüfung, Historie und `MappenDienst`
  (`mappen/`), `EreignisseDienst` (`ereignisse/`, neue Aufgabe melden), die Rollen (`post/`) – und einander. Der
  Dienst setzt die Teile in `baueAufgaben()` zusammen, so kennen sich die Klassen ohne Kreis beim Bauen.
- Über den Anschluss: Ereignis auslösen (`kern.ereignis`), Konten (vom Start angebunden), die Gültigkeit der Zahlen
  (`mindestensMs` am Dienst).
- Importiert nur sich selbst, Kern, tiefere Fachordner, `post/` (nur Typ) und die Basis (je über `index.ts`).

**Regeln**

- Die Empfänger `aufgaben.erwaehnungen`, `aufgaben.fristen` und `aufgaben.abwesenheit` an den Anschlusspunkten
  meldet weiter der Dienst an (`schliesseEmpfaengerAn()`, unverändert); sie rufen `pruefeErwaehnungen`,
  `fristenAbgleichen` und `abwesenheitGeaendert` an den Klassen – Tests ersetzen die beiden letzten dort
  (`dienst.fristen`, `dienst.vertretung`).
- „Frist erreicht“: Merken und Ereignis in einer Transaktion; je Mappe, Feld, Datum und Zeitpunkt genau einmal.
- Leserecht auf Zeit endet mit der Aufgabe sofort (`faelleNach` ohne Aufschub, sobald eins daran hängt).
- Umgetragen aus `dienst.ts`: vier `complexity`, ein `max-depth`, ein `no-useless-assignment`, ein `no-unused-vars`.

Mehr im Entwicklerhandbuch unter *Aufbau → Aufgaben*.
