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

## Schlüssel wechseln

Könnte der Schlüssel bekannt geworden sein – etwa weil ein ausgedrucktes Notfallblatt verloren ging – oder willst du ihn turnusmäßig erneuern: **Werkbank → Verschlüsselung → Schlüssel wechseln.**

![Schlüssel gewechselt](bilder/werkbank-schluesselwechsel.png)

Nach einer Rückfrage

1. erzeugt das DMS einen neuen Schlüssel,
2. verschlüsselt alle Passwörter – in Mappen, im Papierkorb und den des Mailservers – **ganz oder gar nicht** neu; bricht dabei etwas ab, gilt weiter der bisherige Schlüssel,
3. setzt das Prüfwort neu und
4. ersetzt die Schlüsseldatei. Der alte Schlüssel wird nicht aufbewahrt.

Werte, die schon vorher nicht lesbar waren, bleiben, wie sie sind; das DMS sagt, wie viele es sind. Der Wechsel steht im Protokoll mit altem und neuem Fingerabdruck (ohne Schlüssel). Während einer Sicherung lässt sich nicht wechseln.

**Danach:**

- **Neues Notfallblatt herunterladen.** Bis dahin weisen Übersicht und Sicherung darauf hin.
- **Neue Sicherung anlegen** – der Knopf steht gleich auf der Seite.
- **Ältere Sicherungen** bleiben mit dem alten Schlüssel verschlüsselt. Die Liste unter [Sicherung](sicherung.md) kennzeichnet sie mit „früherer Schlüssel“. Zum [Wiederherstellen](wiederherstellen.md) einer solchen Sicherung fragt das DMS nach dem Schlüssel vom alten Notfallblatt. Bewahre es auf, solange du diese Sicherungen brauchst – oder lösche sie mit **Sicherungen mit früherem Schlüssel löschen**.

!!! warning "Schlüsseldatei-Kopien"
    Hast du die Datei `geheim/dms.schluessel` irgendwo kopiert, ersetze die Kopie durch die neue Datei.

## Zustände

| Zustand | Bedeutung | Was tun |
| --- | --- | --- |
| **fehlt** | Es gab noch nie einen Schlüssel. | Schlüssel erzeugen. |
| **vorhanden** | Alles in Ordnung. | – |
| **verloren** | Es gab einen Schlüssel, die Datei fehlt aber. | Datei aus der Sicherung nach `geheim/` zurücklegen und das DMS neu starten. Ist sie verloren, einen neuen Schlüssel erzeugen und die Passwörter neu eingeben. |
| **passt nicht** | Unter `geheim/` liegt ein anderer Schlüssel als der, mit dem die Passwörter verschlüsselt sind. | Die richtige Datei ablegen und neu starten – oder die falsche entfernen, neu starten und einen neuen Schlüssel erzeugen. |

Unter **Nicht lesbare oder unverschlüsselte Werte** listet die Seite, welche Passwörter mit dem vorhandenen Schlüssel nicht lesbar sind (z. B. nach einem neuen Schlüssel) und wo du sie neu eingibst. Ein SMTP-Passwort aus einer Version vor 0.11 erscheint dort als „unverschlüsselt“, bis es einen Schlüssel gibt; dann wird es automatisch verschlüsselt.

Den Schlüssel zu wechseln, ist eine eigene, spätere Funktion (#47).
