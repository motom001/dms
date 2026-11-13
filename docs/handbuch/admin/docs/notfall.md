# Notfall: kein Admin mehr

!!! abstract "Andere Notfälle"
    Diese Seite hilft, wenn niemand mit Verwaltungsrecht mehr hineinkommt. **Lädt Ablago gar nicht oder bleibt die Seite schwarz** („Ablago antwortet gerade nicht“, „Die Datenbank antwortet nicht“), hilft [Ablago lädt nicht oder bleibt schwarz](was-ist-passiert.md#laedt-nicht). Alle Notfälle im Überblick: [Was ist dir passiert?](was-ist-passiert.md#uebersicht) – auch unter **https://help.ablago.app/notfall**.

!!! tip "Erst das Notfallblatt, dann die Konsole"
    Hast du das [Notfallblatt](verschluesselung.md#notfallblatt), geht es am einfachsten mit dem **Notfallcode** darauf – ohne Dateien auf dem NAS: [Mit dem Notfallcode wieder hinein](was-ist-passiert.md#notfallcode). Gibt es noch eine Person mit „Gesamte Verwaltung“ und du kommst nur nicht hinein (Passwort vergessen, IP gesperrt, Handy für die Zwei-Faktor-Anmeldung verloren), geht es auch mit dem [Befehl `dms`](konsole.md) im Container, z. B. `dms passwort <email>`. Die RESCUE-Datei unten ist der Weg, wenn auch das Notfallblatt verloren ist.

Kommt niemand mit Verwaltungsrecht mehr hinein – Passwort vergessen, die einzige Person mit „Gesamte Verwaltung“ nicht erreichbar, kein E-Mail-Versand für „Passwort vergessen“ –, legst du dir über eine Datei auf dem NAS einen neuen Zugang an. Eine Kommandozeile brauchst du dafür nicht.

## So geht's

1. Öffne auf dem NAS (z. B. in der Dateiverwaltung) den Ordner mit der Schlüsseldatei, in der Vorlage `/volume1/docker/dms/geheim`.
2. Lege dort eine Textdatei **`RESCUE`** an (ohne Endung) mit genau diesem Inhalt:
   ```
   NOTFALLZUGANG
   ```
3. Warte eine Minute. Ablago prüft den Ordner beim Start und alle 30 Sekunden. Es legt einen neuen Benutzer **„Notfall-Admin ‹Datum›“** mit „Gesamte Verwaltung“ an und schreibt in die Datei `RESCUE` einen **Einmal-Link**.
4. Öffne die Datei erneut und den Link darin im Browser – innerhalb von **15 Minuten**. Lege dort ein eigenes Passwort fest; danach bist du angemeldet.
5. Gib dem Notfall-Admin in **Werkbank → Benutzer** einen richtigen Namen und unter **Mein Konto** eine echte E-Mail-Adresse – oder erzeuge damit einen Passwort-Link für dein eigentliches Konto und deaktiviere den Notfall-Admin danach.

Steht im Link `localhost`, ist noch keine Adresse von Ablago eingestellt: Ersetze `http://localhost:3000` durch die Adresse, unter der du Ablago öffnest, z. B. `http://nas.home.arpa:8080`.

## Was dabei geschieht

- Ohne das Schlüsselwort `NOTFALLZUGANG` passiert nichts; eine leere oder andere Datei steht nur im Protokoll.
- In der Datei steht nie ein Passwort, nur der Link. Er gilt einmal und nur 15 Minuten; danach löscht Ablago die Datei selbst.
- Das [Protokoll](fehlersuche.md#protokoll) hält den Notfallzugang fest (Modul *konto*), und alle mit „Gesamte Verwaltung“ bekommen eine E-Mail – sofern der Versand eingerichtet ist.
- Die Übersicht der Werkbank zeigt einen Hinweis, bis der Notfall-Admin umbenannt oder deaktiviert ist.

!!! info "Ist das nicht gefährlich?"
    Wer in den Ordner `geheim` schreiben kann, hat ohnehin vollen Zugriff auf die Daten: Dort liegt der Schlüssel, und daneben liegen Datenbank und Dokumente. Es entsteht kein neues Einfallstor – sorge aber dafür, dass nur du auf diese Ordner des NAS zugreifen kannst.
