# Eingangsordner

Ablago kann einen Ordner überwachen und **jede Datei, die dort landet, als neue [Post](https://help.ablago.app/benutzer/aktuell/post/) übernehmen**. So bringen Scanner („Scan to Folder“), das NAS oder jedes andere Programm Dokumente in Ablago, ohne dass jemand den Browser öffnet.

--8<-- "ausgeblendet-organisation.md"

## Einbinden

Der Eingangsordner ist ein eigener Ordner im Container: **`/eingang`**. Die Vorlagen für Synology, UGREEN, QNAP, TrueNAS, Unraid und `dms-komplett` binden ihn schon ein, z. B.

```yaml
      # Eingangsordner (optional): Scanner und NAS legen hier Dateien ab → neue Post
      - /volume1/docker/dms/eingang:/eingang
```

Fehlt die Zeile, gibt es keinen Eingangsordner und die Werkbank zeigt ihn nicht an – bestehende Installationen laufen unverändert weiter. Nach dem Hinzufügen das Projekt neu erstellen.

Den Ordner `eingang` gibst du im NAS für den Scanner frei (SMB), z. B. als Unterordner einer vorhandenen Freigabe. Im Scanner trägst du diese Freigabe als Ziel für „Scan to Folder“ ein.

!!! warning "Geändert in dieser Version: nur noch die vollständige E-Mail-Adresse"
    Bisher setzte auch ein Ordner mit dem Namen, Vornamen oder dem Teil der E-Mail-Adresse vor dem @ (z. B. `eingang/thomas/`) **An**. Das gilt nicht mehr: Nur ein Ordner, der **genau der E-Mail-Adresse** eines aktiven Benutzers entspricht, z. B. `eingang/thomas@example.org/`, setzt „An“. Post aus einem bisherigen Ordner kommt ohne „An“ an, und die Werkbank-Übersicht weist auf den Ordner hin („Ordner „thomas“ gehört zu keinem Benutzer“). Benenne solche Ordner um oder lege sie mit **Ordner für alle Benutzer anlegen** neu an und stelle den Scanner um.

## Einstellungen

Unter **Werkbank → Eingangsordner**:

- **Eingangsordner** (Schalter) – an oder aus (Standard: an).
- **Prüfabstand** – wie oft Ablago nachsieht, 5 bis 3600 Sekunden (Standard: 30).
- **Nach dem Übernehmen** – die Datei löschen oder nach `erledigt/` verschieben. Wer den Eingangsordner neu einrichtet, bekommt **löschen** vorgeschlagen: Die Datei steckt danach ja in der Post. Gibt es schon ein `erledigt/` und wurde nie gespeichert, bleibt es beim Verschieben wie bisher.
- **Doppelte Dateien überspringen** – liegt genau diese Datei (gleicher Prüfwert) schon in Ablago, entsteht keine Post; die Datei wird wie eine übernommene weggeräumt und in der Liste als „doppelt – übersprungen“ geführt (Standard: aus).
- **Ordner für neue Benutzer von selbst anlegen** – jede neue Person bekommt ihren [Ordner](#ordner-je-person) (Standard: aus).
- **Warnen, wenn sich etwas ansammelt** – Grenzen für die [Überwachung](#uberwachung): Dateien älter als **180** Tage, alle zusammen größer als **2** GB, mehr als **100** Dateien. 0 schaltet eine Warnung ab.
- **Jetzt prüfen** – sofort nachsehen.

Darunter stehen die Ordner je Person, die Überwachung, die letzte Prüfung, Dateien, die noch geschrieben werden, die zuletzt übernommenen Dateien mit Link zur Post und Fehler.

## Ordner je Person { #ordner-je-person }

Ein Ordner, der **genau der E-Mail-Adresse** eines aktiven Benutzers entspricht (ohne Unterschied der Groß-/Kleinschreibung), trägt diesen Benutzer bei **An** ein, z. B. `eingang/lena@example.org/`. Die Post erscheint bei ihm unter „Zu erledigen“. Name, Vorname oder der Teil vor dem @ zählen bewusst nicht – nur die E-Mail-Adresse ist eindeutig, und ein Dokument darf nie bei der falschen Person landen.

- **Ordner für alle Benutzer anlegen** (Werkbank → Eingangsordner) legt für jede aktive Person ihren Ordner an, sofern es ihn noch nicht gibt. Mit **Ordner für neue Benutzer von selbst anlegen** geschieht das für jede neue Person.
- **Ändert sich die E-Mail-Adresse**, benennt Ablago einen Ordner, den es selbst angelegt hat, mit um. Geht das nicht – etwa weil es den neuen Ordner schon gibt –, steht es als Warnung in der Werkbank-Übersicht. Von Hand angelegte Ordner fasst Ablago nicht an.
- **Unterordner** unter einem Personenordner, z. B. Datumsordner, die manche Scanner anlegen (`eingang/lena@example.org/2026/11/`), gehören zur selben Person. Es zählt der nächste Personenordner über der Datei.
- **Andere Unterordner** (z. B. `eingang/scanner/`) zählen wie der Hauptordner: Post ohne „An“. Die Werkbank-Übersicht nennt jeden solchen Ordner, aus dem Post kam („Ordner „scanner“ gehört zu keinem Benutzer“); ist das so gewollt, nimmst du die Warnung zur Kenntnis.
- **`erledigt/` je Person:** Übernommene Dateien aus einem Personenordner wandern nach `eingang/<e-mail>/erledigt/`, nicht in ein gemeinsames `erledigt/`. So sieht niemand über das NAS die Post der anderen.

### Freigaben im NAS je Ordner

Gib im NAS jeden Personenordner nur **der Person selbst und Ablago** frei (Lesen und Schreiben). Den Hauptordner `eingang/` brauchen nur der Scanner, Ablago und wer Post ohne Empfänger einwirft. So kann am iPhone jede Person per SMB direkt in ihren Ordner sichern ([Als Laufwerk einbinden](https://help.ablago.app/benutzer/aktuell/laufwerk/#iphone-und-ipad-dateien-app)), ohne fremde Post zu sehen. Ablago selbst braucht Lesen, Schreiben und Löschen im ganzen Eingangsordner.

## „An“ ist kein Leserecht { #fuer-ist-kein-leserecht }

**An** sagt, für wen die Post gedacht ist – sie erscheint bei dieser Person unter „Zu erledigen“. Wer die Post **lesen** darf, regeln allein die [Berechtigungen](berechtigungen.md) des Mappentyps *Post*. Ohne eigene Regeln sieht jeder, der Post lesen darf, auch Post für andere.

Soll jede Person nur ihre eigene Post sehen, richtest du unter **Werkbank → Mappentypen → Post → Berechtigungen** Folgendes ein:

1. **Standard:** Lesen aus (Anlegen nach Bedarf an, damit alle weiter Post erfassen können).
2. **Regel „Meine Post“:** *Wenn* **Feld der Mappe** · **An** · **zeigt auf** · **aktueller Benutzer** → Lesen und Bearbeiten erlaubt.
3. **Regel „Post ohne Empfänger sortieren“:** *Wenn* **Benutzer hat Rolle** · *Posteingang* (eine eigene Rolle, z. B. für Lena bzw. die Büroleitung) *und* **Feld der Mappe** · **An** · **ist leer** → Lesen und Bearbeiten erlaubt. So landet nichts im Niemandsland.
4. **Regel „Vertretung“:** *Wenn* **Offene Aufgabe für den Benutzer** → Lesen erlaubt. Vertreter bekommen die Aufgabe über die [Vertretung](https://help.ablago.app/benutzer/aktuell/profil/#abwesenheit) und sehen damit die Post.
5. Mit dem **Testlauf** je Person prüfen: Jonas sieht nur seine Post, Lena zusätzlich die ohne Empfänger.
6. **Achtung:** Das ändert die Sichtbarkeit **aller** bestehenden Post, nicht nur der neuen.

## Überwachung { #uberwachung }

Damit sich im Eingangsordner nichts unbemerkt ansammelt, zeigt die Werkbank-Übersicht gelbe Warnungen, wenn

- Dateien **älter als 180 Tage** dort liegen,
- alle Dateien zusammen **über 2 GB** groß sind,
- **`fehler/`** Dateien enthält (konnten nicht verarbeitet werden),
- insgesamt **mehr als 100 Dateien** dort liegen.

Gezählt werden alle Dateien unter `/eingang`, auch in `erledigt/` und `fehler/` – nur die Ordner der NAS-Systeme (`@eaDir`, `#recycle` …) nicht. Die Grenzen stellst du unter Werkbank → Eingangsordner ein; wie andere Warnungen lassen sie sich [zur Kenntnis nehmen](uebersicht.md#bewusst-akzeptieren).

Ein Klick auf **Ordner ansehen** zeigt unter **Überwachung** eine Baumansicht: je Ordner die Anzahl der Dateien, den Speicherbedarf und das Datum der ältesten Datei. Die Ursache der Warnung ist hervorgehoben – das zu alte Datum, die Ordner mit dem größten Anteil, die Zeile `fehler/`. Dateien, die tiefer als 5 Ebenen liegen und deshalb nicht übernommen werden, stehen dort ebenfalls („zu tief“).

Ablago rechnet die Übersicht mit der normalen Prüfung, aber höchstens alle fünf Minuten neu – so bremst sie den Eingangsordner nicht. **Jetzt prüfen** rechnet sofort. Die Überwachung läuft auch, wenn das Prüfen ausgeschaltet ist.

## Was beim Übernehmen passiert

- **Jede Datei wird eine eigene Post** mit Kanal *Ordner*, Richtung eingehend, Stand *Neu*. Der Betreff ist der Dateiname ohne Endung. In der Historie steht „aus dem Eingangsordner übernommen (eingang/…)“; angelegt hat sie der *Eingangsordner*, kein Benutzer.
- **Ordner je Person:** Liegt die Datei in einem Ordner mit der vollständigen E-Mail-Adresse eines Benutzers (z. B. `eingang/thomas@example.org/`) oder darunter, steht dieser Benutzer bei **An** – siehe [Ordner je Person](#ordner-je-person). So wählt jeder am Scanner sein eigenes Ziel. Andere Unterordner zählen wie der Hauptordner. Ablago sieht in Unterordnern bis zu **5 Ebenen** tief nach; Dateien in tieferen Ordnern bleiben liegen und erscheinen in der [Überwachung](#uberwachung).
- **Nur fertige Dateien:** Eine Datei wird erst übernommen, wenn sich Größe und Änderungszeit über zwei Prüfungen nicht geändert haben – Scanner schreiben langsam.
- **Übersprungen** werden versteckte und temporäre Dateien (`.*`, `~*`, `*.tmp`, `*.part`, `*.crdownload`, `*.partial`, `Thumbs.db`, `desktop.ini`), die Ordner der NAS-Systeme (`@eaDir`, `#recycle`, `.@__thumb`, `@Recycle`, `.Trash*`) sowie `erledigt/` (auch `<e-mail>/erledigt/`) und `fehler/`.
- **Abgelehnt** werden leere Dateien und Dateien über 100 MB: Sie wandern nach **`fehler/`**, daneben eine Textdatei mit dem Grund; die Werkbank zeigt eine Meldung. Ist die Grenze für den [Speicherplatz](speicherplatz.md) erreicht, bleibt die Datei liegen und kommt dran, sobald wieder Platz ist.
- **Gleicher Inhalt:** Gibt es schon Mappen mit derselben Datei, entsteht trotzdem eine neue Post (außer mit *Doppelte Dateien überspringen*). Ihre Historie sagt „Diese Datei liegt schon in Ablago“ – ohne Titel, denn die Post sehen oft mehr Leute als die andere Mappe. Wo die Datei liegt, zeigt **Zuordnen** jedem, der die Mappe lesen darf.
- **Keine doppelte Übernahme**, auch nicht nach einem Neustart oder Absturz mitten im Übernehmen: Erst wenn die Post gespeichert ist, wird die Datei verschoben oder gelöscht.
- Im [Wartungsmodus](wartungsmodus.md) und während einer [Wiederherstellung](wiederherstellen.md) ruht der Eingangsordner. Laufen mehrere Instanzen von Ablago mit derselben Datenbank, übernimmt nur eine.

!!! tip "Prüft nicht, sondern fragt ab"
    Ablago sieht regelmäßig nach, statt auf Meldungen des Dateisystems zu warten. Solche Meldungen kommen über SMB/NFS und manche Docker-Einbindungen nicht zuverlässig an.
