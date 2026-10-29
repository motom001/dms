# Notfall: kein Admin mehr

Hat niemand mehr Zugang als Administrator – Passwort vergessen, einziger Admin nicht erreichbar, kein E-Mail-Versand für „Passwort vergessen“ –, legst du dir über eine Datei auf dem NAS einen neuen Zugang an. Eine Kommandozeile brauchst du dafür nicht.

## So geht's

1. Öffne auf dem NAS (z. B. in der Dateiverwaltung) den Ordner mit der Schlüsseldatei, in der Vorlage `/volume1/docker/dms/geheim`.
2. Lege dort eine Textdatei **`RESCUE`** an (ohne Endung) mit genau diesem Inhalt:
   ```
   NOTFALLZUGANG
   ```
3. Warte eine Minute. Das DMS prüft den Ordner beim Start und alle 30 Sekunden. Es legt einen neuen Benutzer **„Notfall-Admin ‹Datum›“** mit Administratorrechten an und schreibt in die Datei `RESCUE` einen **Einmal-Link**.
4. Öffne die Datei erneut und den Link darin im Browser – innerhalb von **15 Minuten**. Lege dort ein eigenes Passwort fest; danach bist du angemeldet.
5. Gib dem Notfall-Admin in **Werkbank → Benutzer** einen richtigen Namen und im **Profil** eine echte E-Mail-Adresse – oder erzeuge damit einen Passwort-Link für dein eigentliches Konto und deaktiviere den Notfall-Admin danach.

Steht im Link `localhost`, ist noch keine Adresse des DMS eingestellt: Ersetze `http://localhost:3000` durch die Adresse, unter der du das DMS öffnest, z. B. `http://nas:8080`.

## Was dabei geschieht

- Ohne das Schlüsselwort `NOTFALLZUGANG` passiert nichts; eine leere oder andere Datei steht nur im Protokoll.
- In der Datei steht nie ein Passwort, nur der Link. Er gilt einmal und nur 15 Minuten; danach löscht das DMS die Datei selbst.
- Das [Protokoll](fehlersuche.md#protokoll) hält den Notfallzugang fest (Modul *konto*), und alle Administratoren bekommen eine E-Mail – sofern der Versand eingerichtet ist.
- Die Übersicht der Werkbank zeigt einen Hinweis, bis der Notfall-Admin umbenannt oder deaktiviert ist.

!!! info "Ist das nicht gefährlich?"
    Wer in den Ordner `geheim` schreiben kann, hat ohnehin vollen Zugriff auf die Daten: Dort liegt der Schlüssel, und daneben liegen Datenbank und Dokumente. Es entsteht kein neues Einfallstor – sorge aber dafür, dass nur du auf diese Ordner des NAS zugreifen kannst.
