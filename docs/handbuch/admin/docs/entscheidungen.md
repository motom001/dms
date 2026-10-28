# Entscheidungen

Kurz festgehalten, damit spätere Änderungen wissen, warum etwas so ist.

## Fachmodell

- **Mappe als einziges Grundkonzept.** Vertragspartner, Vertrag, Rechnung, Gegenstand sind Mappen unterschiedlicher Mappentypen. Ein Mappentyp definiert Felder; eine Mappe speichert Werte je Feldschlüssel.
- **Verweise statt Ablageort.** Zusammenhänge entstehen über Referenzfelder (Rechnung → Vertrag → Vertragspartner). Rückverweise werden nicht gepflegt, sondern abgeleitet.
- **Zwei Verweisarten.** *Zugehörigkeit* („gehört zu“) zählt später bei „alles zu X“ und bei Auswertungen mit; *Bezug* (z. B. Aussteller) ist nur eine Verknüpfung. So landet bei „alles zum Haus“ nicht jede Rechnung desselben Handwerkers.
- **Hierarchie über Verweis auf den eigenen Typ.** Haus → Heizung → Wärmepumpe braucht keine Sonderlogik.
- **Feste Feldschlüssel.** Die Bezeichnung eines Feldes ist änderbar, der Schlüssel nach dem ersten Speichern nicht – gespeicherte Werte und spätere API-Abgleiche bleiben gültig.
- **Entfernte Felder löschen keine Werte.** Die Werte bleiben an der Mappe und werden als „Werte ohne Felddefinition“ angezeigt.
- **Definitionsänderungen machen Mappen nicht stillschweigend ungültig.** Passt eine Mappe nicht mehr (neues Pflichtfeld, entfernter Auswahlwert), wird sie markiert; korrigiert wird beim nächsten Speichern.

## Technik

- **PostgreSQL** statt SQLite: JSON-Felder mit Index, Volltextsuche mit deutscher Wortstammbildung, Row-Level-Security für die Trennung von Haushalten, parallele Schreibzugriffe.
- **`haushalt_id` in jeder Tabelle** von Anfang an; bis zur Benutzerverwaltung gibt es einen Standardhaushalt.
- **Verweise zusätzlich in einer eigenen Tabelle** (`verweise`): schnelle Rückverweise und Löschschutz in der Datenbank selbst.
- **SQL-Migrationen als Dateien, kein ORM.** Die offene Frage „Prisma oder Drizzle“ ist damit vertagt, nicht entschieden: Für das generische Mappenmodell (JSON-Werte, dynamische Felder) bringt ein ORM wenig, und reines SQL bleibt am leichtesten nachvollziehbar und portierbar. Migrationen laufen beim Start in einer Transaktion.
- **Ein Image** für Server und Oberfläche (modularer Monolith); auf dem NAS laufen nur App und Datenbank.

## Anmeldung

- **Erster Aufruf legt den Administrator an** (bewusst ohne Einrichtungscode). Nach dem ersten Start daher sofort selbst aufrufen.
- **Rollen:** Administrator (Einrichtung, Benutzer) und Mitglied (Ablage). Vorerst sehen alle angemeldeten Benutzer alle Mappen.
- **Passwörter** mit scrypt aus Node (keine native Bibliothek). **Sitzungen** als HttpOnly-Cookie, in der Datenbank nur als SHA-256-Hash. Gleiches gilt für Einladungs- und Passwort-Links (Einladung 7 Tage, Zurücksetzen 1 Stunde, jeweils nur einmal nutzbar).
- **Schutz vor fremden Seiten:** Ändernde Anfragen brauchen den Header `X-DMS`, den nur die eigene Oberfläche setzt; dazu `SameSite=Lax`.
- **E-Mail optional:** Ohne SMTP zeigt die Benutzerverwaltung die Links zum Kopieren an.
- **Routen zentral** in `server/src/routen.ts`, jede mit Zugriffsstufe (offen, angemeldet, admin).

## Ablage

- **Drei Spalten:** Sichten → Liste → Mappe. Sichten sind vorerst „Eingang“ und eine pro Mappentyp; konfigurierbare Sichten folgen.
- **Eingang:** Mappen, die nicht zur aktuellen Definition passen, beim Ersteller; ohne bekannten Ersteller beim Administrator. Später kommen Aufgaben dazu.
- **Indexwerte** (erstellt/geändert am/von) sind feste Spalten, keine Felder eines Mappentyps.

- **Seitenweise statt alles:** Die Oberfläche lädt keine vollständige Mappenliste mehr. Eine Sicht holt je 100 Mappen, nach Titel sortiert, und beim Scrollen die nächsten; Suche, Zähler und Eingang rechnet der Server. Verweise wählt man über eine Suche statt einer Klappliste.
- **Trefferliste** als Liste von Spaltenschlüsseln am Mappentyp (`mappentypen.trefferliste`); Systemspalten beginnen mit `_` und kollidieren so nie mit Feldschlüsseln. Kompakt oder Tabelle entscheidet die Breite der Liste selbst (ResizeObserver), nicht die Bildschirmbreite.
- **Sortieren auf dem Server** (wegen des seitenweisen Ladens), leere Werte immer zuletzt; nicht nach Verweisen und langen Texten. Gespeichert je Benutzer und Sicht in `benutzer_einstellungen`.
- **Passung gespeichert** (`mappen.passt`, `mappen.problem`): Ob eine Mappe zur Definition passt, prüft der Server beim Ändern des Typs für alle Mappen dieses Typs (eindeutige Werte im Arbeitsspeicher statt je Mappe in der Datenbank) und nach dem Speichern für bisher unpassende Mappen desselben Typs.
- **Lange Arbeiten im Hintergrund:** Demo-Daten laufen als Auftrag mit Fortschritt, damit ein Reverse-Proxy nicht nach seiner Wartezeit abbricht.

## Register und Dokumente

- **Drei Registerarten** am Mappentyp: Feld-, Dokumenten- und Verknüpfungsregister. Jedes Feld liegt auf genau einem Feldregister; nicht zugeordnete Felder landen automatisch auf dem ersten.
- **Register haben feste Schlüssel**, damit Dokumente ihr Register behalten, wenn es umbenannt wird. Ein Dokumentenregister mit Dokumenten lässt sich nicht entfernen.
- **Verknüpfungsregister** zeigen alle Rückverweise oder nur gewählte Quellen (Typ + Referenzfeld).
- **Titel-Vorlage** mit Platzhaltern `{feld}`; Server und Oberfläche nutzen dieselbe Funktion (`titelAus`).
- **Titel gespeichert** (Spalte `mappen.titel`), damit der Server sortieren und seitenweise laden kann. Neu berechnet beim Speichern einer Mappe, beim Ändern des Typs und – weitergereicht über die Verweise – bei Mappen, deren Titel einen geänderten Titel enthält (bei Verweisen im Kreis höchstens sechs Runden). Fehlende Titel berechnet der Server beim Start.
- **Indexwerte im Titel:** `{angelegt}`, `{geaendert}` als Datum in der Zeitzone Europe/Berlin; diese Schlüssel sind für Felder gesperrt.
- **Dateien** unveränderlich unter ihrem SHA-256 im Dateiordner, gleicher Inhalt nur einmal; Hinweis beim Hochladen, wenn der Inhalt schon in einer anderen Mappe liegt.
- **Anzeige im Browser nur für PDF und Bilder**, erkannt am Inhalt (nicht an Endung oder angegebenem Typ). Alles andere wird als Download ausgeliefert, mit `nosniff` und einer Sandbox-CSP – eine hochgeladene HTML-Datei kann so keinen Code in der Sitzung ausführen.
- **Löschen einer Mappe** löscht ihre Dokumente nach Rückfrage mit; die Datei verschwindet, sobald kein Dokument mehr auf sie zeigt.

## Designs

- **Farben werden abgeleitet, nicht einzeln gepflegt:** Aus Grundlage, Primär- und Sekundärfarbe entstehen alle CSS-Variablen (`design.ts`). Farben werden bei Bedarf aufgehellt oder abgedunkelt, bis sie auf dem Hintergrund lesbar sind (WCAG 4,5:1, beim Kontrast-Design 7:1).
- **Design je Konto, Schriftgröße je Gerät** (`benutzer_einstellungen` bzw. localStorage). Schriftgrößen skalieren über `--skala`.
- **Eigenes CSS** nur durch Administratoren, ohne `<style>`-Tags; Rettungsweg `?design=standard`.

## Schnittstelle

- **Eigener Namensraum `/api/v1`** mit festen Adressen; intern nutzt er dieselben Funktionen wie die Oberfläche. API-Schlüssel gelten nur dort, nicht an den internen Adressen der Oberfläche.
- **Schlüssel** `dms_…` (240 Bit Zufall), gespeichert nur als SHA-256; sichtbar bleibt der Anfang. Rechte: höchstens die des Benutzers, dazu „nur lesen“ (nur GET); Werkbank-Funktionen nur mit dem Schlüssel eines Administrators.
- **OpenAPI aus derselben Tabelle** wie die Routen (`api-v1.ts`), daher immer passend zur installierten Version; die lesbare Seite rendert sie selbst, ohne fremde Bibliothek.

## Betrieb und Fehlersuche

- **Eigenes Protokoll** (`server/src/protokoll.ts`) statt Fastify/pino direkt: jede Meldung mit Modul, Benutzer und Anfrage-Kennung (über AsyncLocalStorage), lesbar in den Container-Logs, zusätzlich ein Ringpuffer (24 h, 10.000 Einträge) für die Werkbank. Fastify schreibt über einen pino-kompatiblen Adapter hinein.
- **Live-Ansicht per Abfrage alle zwei Sekunden** statt Server-Sent Events: funktioniert hinter jedem Reverse-Proxy ohne Sonderkonfiguration (nginx puffert SSE sonst).
- **Messung je Datenbankzugriff:** Jede Methode der Repos wird über einen Proxy gezählt und gestoppt (ein Zugriff kann mehrere SQL-Anweisungen umfassen). Die Summe je Anfrage geht im Header `Server-Timing` an die Oberfläche; die übrigen Schritte misst der Browser (Resource Timing). „Netzwerk“ ist dabei eine Näherung.
- **Langläufer** stehen in der Datenbank (Tabelle `langlaeufer`), Schwelle und Aufbewahrung in `einstellungen`.
- **Debug-Modus** nur im Arbeitsspeicher und höchstens eine Stunde; nach einem Neustart ist er aus.
- **Als anderer Benutzer anmelden:** eigene Sitzung des Benutzers mit Verweis auf die Vertretung; der Benutzer sieht beim nächsten Mal, wer wann als er agiert hat. Ein manipulationssicheres Protokoll ist bewusst nicht Teil davon (#16).

## Benutzer und Rollen als Mappen (#26, #27)

- **Systemmappentypen** *Benutzer* und *Rolle* (Spalte `mappentypen.system`): erweiterbar, nie löschbar. Der Server legt sie beim Start an, falls sie fehlen; heißt schon ein eigener Typ so, bekommt der Systemtyp den Zusatz „(System)“.
- **Systemfelder** (`Feld.system`) sind fest: Schlüssel, Datentyp und Eigenschaften gibt der Server vor, nur Bezeichnung, Hilfetext und Register darf der Administrator ändern.
- **Das Konto ist führend, die Mappe spiegelt es.** Die Mappe eines Benutzers hat dieselbe Id wie sein Konto. Konten melden jede Änderung an Name, E-Mail, Rolle und „aktiv“ an die Mappe; beim Start werden alle Benutzer abgeglichen (auch nach einem Update).
- **Sicherheit:** Die Systemfelder einer Benutzer-Mappe sind in der Ablage nur lesbar – der Server lehnt Änderungen ab. Sonst könnte ein Mitglied die E-Mail-Adresse eines Administrators ändern und dessen Konto über „Passwort vergessen“ übernehmen, oder sich selbst eine Systemrolle geben.
- **Systemrollen** *Administrator* und *Mitglied* sind Rollen-Mappen mit fester Kennung (`mappen.system_kennung`, z. B. `rolle:admin`). Wer sie hat, folgt der Rolle des Kontos; sie lassen sich nicht löschen und nicht umbenennen. So kann das spätere Berechtigungskonzept Rechte an Rollen-Mappen hängen, ohne die bestehende Anmeldung umzubauen.
- **Zuordnung Benutzer ↔ Rolle** ist das Systemfeld `rollen` der Benutzer-Mappe (Mehrfachverweis). Die Rolle zeigt ihre Benutzer als Rückverweise. Gesetzt wird es nur über die Benutzerverwaltung; ungültige Rollen werden geprüft, bevor sich etwas ändert.
- **Rollen sind vorerst fachlich** und von jedem Benutzer in der Ablage anlegbar; Einschränkungen kommen mit der Berechtigungsverwaltung. Keine verschachtelten Rollen.
- **Rolle löschen:** erlaubt, auch wenn Benutzer sie haben – deren Zuordnung fällt weg. Verweise aus normalen Feldern (z. B. „verantwortliche Rolle“) verhindern das Löschen wie bei jeder Mappe.
- **Deaktivieren statt löschen:** Wer sich schon angemeldet hat, wird deaktiviert; seine Mappe heißt dann „… (ehemalig)“ und Verweise bleiben gültig. Löschen geht nur für nie angenommene Einladungen.
- **Neue Mappen / Löschen erlauben** als Eigenschaft jedes Mappentyps (`erstellen_erlaubt`, `loeschen_erlaubt`); die Oberfläche blendet die Knöpfe aus, der Server prüft es. Beim Typ *Benutzer* ist beides fest aus.
- Demo-Daten und Beispiele lassen die Systemtypen aus.

## Handbuch und Releases (#25)

- **Zwei getrennte Handbücher** (MkDocs Material, je eine eigene Seite mit eigener Suche): Benutzer sollen sich auf ihre Möglichkeiten konzentrieren und nicht in Technik suchen müssen. Sie verweisen aufeinander, statt Inhalte doppelt zu pflegen. Technik und Entscheidungen gehören zum Administratorhandbuch.
- **Deutsche Suche** über das Suchplugin von MkDocs (`lang: de`, mit Wortstammbildung); läuft im Browser, ohne Server.
- **Screenshots werden erzeugt, nicht gepflegt:** Der Workflow *Handbuch* startet das DMS mit leerer Datenbank, legt Beispiele und Demo-Daten an und nimmt die Seiten mit Playwright auf (`docs/handbuch/screenshots/aufnehmen.mjs`). So passen die Bilder immer zur Version auf `main`. Die Bilder liegen nicht im Repository.
- **GitHub Pages** über GitHub Actions; Pull Requests bauen nur und legen die Screenshots als Artefakt ab.
- **Changelog = GitHub Releases.** Ein Tag `v*` erzeugt das Release; der Text kommt aus `docs/releases/<tag>.md` oder, falls es die Datei nicht gibt, aus den Commit-Überschriften seit dem vorigen Tag.
- **Hilfe-Link** im Benutzermenü auf das Benutzerhandbuch, für Administratoren zusätzlich auf das Administratorhandbuch.

## Bewusst noch nicht drin

Texterkennung (OCR), Suche, Papierkorb, Rechte pro Mappe, Fristen, Verschlüsselung, Backup-Funktion in der Anwendung, Zwei-Faktor-Anmeldung.
