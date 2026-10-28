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

## Bewusst noch nicht drin

Texterkennung (OCR), Suche, Papierkorb, Rechte pro Mappe, Fristen, Verschlüsselung, Backup-Funktion in der Anwendung, Zwei-Faktor-Anmeldung.
