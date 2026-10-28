# Verschlüsselung

Passwörter, die das DMS speichert – das Passwort des Mailservers und [Passwortfelder](mappentypen.md#passwortfelder) in Mappen –, liegen verschlüsselt in der Datenbank. Den Schlüssel dazu hält das DMS in einer **eigenen Datei**, nie in der Datenbank. Eine Datenbanksicherung allein verrät damit keine Passwörter.

![Werkbank → Verschlüsselung](bilder/werkbank-verschluesselung.png)

## Schlüssel erzeugen

1. In der Compose-Datei muss der Ordner `/data/geheim` ein eigenes Volume sein (siehe [Installation](installation.md)), z. B.
   ```yaml
   - /volume1/docker/dms/geheim:/data/geheim
   ```
2. **Werkbank → Verschlüsselung → Schlüssel erzeugen.** Ein Neustart ist nicht nötig.

Danach zeigt die Seite den Zustand **vorhanden** und den **Fingerabdruck** des Schlüssels (z. B. `5E27-9473-05C5-D6A0`). Solange kein Schlüssel da ist, steht über der ganzen Werkbank ein Hinweis, und es lassen sich keine Passwörter speichern.

!!! warning "Schlüssel getrennt sichern"
    Kopiere die Datei `geheim/dms.schluessel` an einen sicheren Ort, getrennt von der Datenbanksicherung. Eine Datenbank lässt sich nur mit diesem Schlüssel vollständig wiederherstellen – ohne ihn sind die Passwörter darin nicht mehr lesbar.

Die Seite prüft auch, ob der Ordner wirklich ein eigenes Volume ist. Wenn nicht, weist sie darauf hin: Ohne Volume wäre die Datei weg, sobald der Container neu erstellt wird (z. B. beim Update).

## Zustände

| Zustand | Bedeutung | Was tun |
| --- | --- | --- |
| **fehlt** | Es gab noch nie einen Schlüssel. | Schlüssel erzeugen. |
| **vorhanden** | Alles in Ordnung. | – |
| **verloren** | Es gab einen Schlüssel, die Datei fehlt aber. | Datei aus der Sicherung nach `geheim/` zurücklegen und das DMS neu starten. Ist sie verloren, einen neuen Schlüssel erzeugen und die Passwörter neu eingeben. |
| **passt nicht** | Unter `geheim/` liegt ein anderer Schlüssel als der, mit dem die Passwörter verschlüsselt sind. | Die richtige Datei ablegen und neu starten – oder die falsche entfernen, neu starten und einen neuen Schlüssel erzeugen. |

Unter **Nicht lesbare oder unverschlüsselte Werte** listet die Seite, welche Passwörter mit dem vorhandenen Schlüssel nicht lesbar sind (z. B. nach einem neuen Schlüssel) und wo du sie neu eingibst. Ein SMTP-Passwort aus einer Version vor 0.11 erscheint dort als „unverschlüsselt“, bis es einen Schlüssel gibt; dann wird es automatisch verschlüsselt.

Den Schlüssel zu wechseln, ist eine eigene, spätere Funktion (#47).
