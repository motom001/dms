# Eingangsordner

Das DMS kann einen Ordner überwachen und **jede Datei, die dort landet, als neue [Post](https://motom001.github.io/dms/benutzer/aktuell/post/) übernehmen**. So bringen Scanner („Scan to Folder“), das NAS oder jedes andere Programm Dokumente ins DMS, ohne dass jemand den Browser öffnet.

--8<-- "ausgeblendet-organisation.md"

## Einbinden

Der Eingangsordner ist ein eigener Ordner im Container: **`/eingang`**. Die Vorlagen für Synology, UGREEN, QNAP, TrueNAS, Unraid und `dms-komplett` binden ihn schon ein, z. B.

```yaml
      # Eingangsordner (optional): Scanner und NAS legen hier Dateien ab → neue Post
      - /volume1/docker/dms/eingang:/eingang
```

Fehlt die Zeile, gibt es keinen Eingangsordner und die Werkbank zeigt ihn nicht an – bestehende Installationen laufen unverändert weiter. Nach dem Hinzufügen das Projekt neu erstellen.

Den Ordner `eingang` gibst du im NAS für den Scanner frei (SMB), z. B. als Unterordner einer vorhandenen Freigabe. Im Scanner trägst du diese Freigabe als Ziel für „Scan to Folder“ ein.

## Einstellungen

Unter **Werkbank → Eingangsordner**:

- **Eingangsordner prüfen** – ein oder aus (Standard: ein).
- **Prüfabstand** – wie oft das DMS nachsieht, 5 bis 3600 Sekunden (Standard: 30).
- **Nach dem Übernehmen** – die Datei nach `erledigt/` verschieben (Standard) oder löschen.
- **Jetzt prüfen** – sofort nachsehen.

Darunter stehen die letzte Prüfung, Dateien, die noch geschrieben werden, die zuletzt übernommenen Dateien mit Link zur Post und Fehler.

## Was beim Übernehmen passiert

- **Jede Datei wird eine eigene Post** mit Kanal *Ordner*, Richtung eingehend, Stand *Neu*. Der Betreff ist der Dateiname ohne Endung. In der Historie steht „aus dem Eingangsordner übernommen (eingang/…)“; angelegt hat sie der *Eingangsordner*, kein Benutzer.
- **Unterordner für Benutzer:** Liegt die Datei in einem Unterordner mit dem Namen, Vornamen oder dem Teil der E-Mail-Adresse vor dem @ eines Benutzers (z. B. `eingang/thomas/`), steht dieser Benutzer bei **Für** – die Post erscheint bei ihm unter „Zu erledigen“. So wählt jeder am Scanner sein eigenes Ziel. Andere Unterordner zählen wie der Hauptordner. Das DMS sieht in Unterordnern bis zu **5 Ebenen** tief nach; Dateien in tieferen Ordnern bleiben liegen.
- **Nur fertige Dateien:** Eine Datei wird erst übernommen, wenn sich Größe und Änderungszeit über zwei Prüfungen nicht geändert haben – Scanner schreiben langsam.
- **Übersprungen** werden versteckte und temporäre Dateien (`.*`, `~*`, `*.tmp`, `*.part`, `*.crdownload`, `*.partial`, `Thumbs.db`, `desktop.ini`), die Ordner der NAS-Systeme (`@eaDir`, `#recycle`, `.@__thumb`, `@Recycle`, `.Trash*`) sowie `erledigt/` und `fehler/`.
- **Abgelehnt** werden leere Dateien und Dateien über 100 MB: Sie wandern nach **`fehler/`**, daneben eine Textdatei mit dem Grund; die Werkbank zeigt eine Meldung. Ist die [Speicherplatz](speicherplatz.md)-Grenze erreicht, bleibt die Datei liegen und kommt dran, sobald wieder Platz ist.
- **Gleicher Inhalt:** Gibt es schon Mappen mit derselben Datei, entsteht trotzdem eine neue Post; ihre Historie nennt die anderen Mappen.
- **Keine doppelte Übernahme**, auch nicht nach einem Neustart oder Absturz mitten im Übernehmen: Erst wenn die Post gespeichert ist, wird die Datei verschoben oder gelöscht.
- Im [Wartungsmodus](wartungsmodus.md) und während einer [Wiederherstellung](wiederherstellen.md) ruht der Eingangsordner. Laufen mehrere Instanzen des DMS mit derselben Datenbank, übernimmt nur eine.

!!! tip "Prüft nicht, sondern fragt ab"
    Das DMS sieht regelmäßig nach, statt auf Meldungen des Dateisystems zu warten. Solche Meldungen kommen über SMB/NFS und manche Docker-Einbindungen nicht zuverlässig an.
