# Wachsen und umziehen

Das DMS fängt klein an und kann mitwachsen. Alle Umzüge laufen über denselben Weg: **Sicherung anlegen, neues System starten, Sicherung einspielen**. Die Sicherung des DMS hängt nicht an einer bestimmten PostgreSQL-Version oder einem bestimmten Gerät. Sie enthält die ganze Datenbank und alle Dateien, verschlüsselt mit deinem Schlüssel.

--8<-- "ausgeblendet-schritt.md"

## Welche Variante?

| | **dms-komplett** (ein Container) | **dms** + eigene Datenbank (zwei Container oder mehr) |
| --- | --- | --- |
| Einrichten | ein Image, vier Ordner, fertig | Compose-Projekt oder App-Store, Datenbank-Passwort |
| Datenbank | PostgreSQL 17 im Container, nur von innen erreichbar | eigener Container oder Server, frei wählbar |
| Updates von PostgreSQL | mit dem nächsten DMS-Image | sofort (`postgres:17` neu ziehen) |
| Gut für | Ausprobieren, Testen, Umgebungen mit nur einem Container | den Dauerbetrieb (empfohlen), eigene Datenbank-Verwaltung, Datenbank auf einem anderen Gerät |
| App-Stores | – | umbrelOS, ZimaOS, CasaOS, TrueNAS, Unraid |

**Wir empfehlen zwei Container** für den Dauerbetrieb: PostgreSQL bekommt Sicherheits-Updates unabhängig vom DMS, beide lassen sich einzeln neu starten und untersuchen, und es ist der übliche Docker-Weg. `dms-komplett` ist die Alternative zum Ausprobieren und für Umgebungen, die nur einen Container zulassen. Ein Wechsel ist jederzeit möglich, in beide Richtungen.

## Umziehen, Schritt für Schritt

Das gilt für jeden Umzug: von zwei Containern zu `dms-komplett` und zurück, von einem NAS auf einen Server, auf neue Hardware.

1. **Auf dem alten System:** [Wartungsmodus](wartungsmodus.md) einschalten, unter **Werkbank → Sicherung** eine Sicherung anlegen. Das [Notfallblatt](sicherung.md#notfallblatt) mit dem Schlüssel bereitlegen.
2. Die beiden Sicherungsdateien (`.dms-sicherung` und `.json`) aus dem Ordner `sicherung` kopieren.
3. **Das neue System** starten, z. B. [dms-komplett](https://motom001.github.io/dms/installieren/aktuell/komplett/) oder eine der [Vorlagen](https://motom001.github.io/dms/installieren/aktuell/). Die beiden Dateien in dessen Ordner `sicherung` legen.
4. Im Browser den Einrichtungsassistenten öffnen, **Aus einer Sicherung wiederherstellen** wählen und den Schritten unter [Wiederherstellen → Neues NAS, alte Sicherung](wiederherstellen.md#neues-nas-alte-sicherung) folgen.
5. Mit den bisherigen Zugangsdaten anmelden und kurz prüfen: Mappen, Dokumente, **Werkbank → Technik**.
6. Das alte System erst abschalten, wenn das neue läuft. Die Ordner des alten Systems aufheben, bis du sicher bist.

Ändert sich die Adresse (neues Gerät, neuer Port), trage sie unter **Werkbank → E-Mail und Adresse** neu ein, damit Links in E-Mails stimmen.

## Neue Hauptversion von PostgreSQL

Eine Datenbank einer älteren Hauptversion (z. B. 17) lässt sich nicht einfach mit einer neueren (z. B. 18) starten.

- **dms-komplett:** Bringt ein künftiges Image eine neue Hauptversion mit, startet der Container mit dem alten Ordner `postgres` bewusst nicht. Im Protokoll steht, welche Version die Datenbank hat und welche das Image. Dann:
  1. Das bisherige Image (mit der alten Versionsnummer) noch einmal starten und eine Sicherung anlegen.
  2. Den Ordner `postgres` umbenennen (z. B. `postgres-17`) und einen leeren anlegen.
  3. Das neue Image starten und die Sicherung im Assistenten einspielen.
  4. Läuft alles, den alten Ordner löschen.
- **Eigene Datenbank:** genauso. Neuen, leeren PostgreSQL-Container in der neuen Version starten, das DMS darauf zeigen lassen, Sicherung einspielen.

## Wenn es mehr wird

- **Viele Dokumente:** Der Ordner `files` wächst mit den Dokumenten, die Datenbank viel langsamer. Lege `files` und `sicherung` dorthin, wo Platz ist. Die Ordner lassen sich einzeln verschieben, solange das Volume danach wieder auf denselben Ordner im Container zeigt. **Werkbank → Systemzustand** zeigt, was wie viel belegt.
- **Mehr Leistung:** Texterkennung und Volltextsuche profitieren von mehr Prozessorkernen und Arbeitsspeicher. Ein Umzug auf einen stärkeren Rechner geht wie oben.
- **Datenbank auf einem eigenen Server:** Umzug von `dms-komplett` auf das schlanke Image `dms` mit eigener Datenbank, wie oben beschrieben.

Führst du Belege für eine Tätigkeit (Freiberuf, Kleingewerbe, Vermietung), halte einen Umzug auch in deiner [Verfahrensdokumentation](verfahrensdokumentation.md) fest (Abschnitt 1 und 10).
