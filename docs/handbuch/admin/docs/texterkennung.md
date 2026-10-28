# Texterkennung und Wartung

Damit die Suche auch den Text von Dokumenten findet, erzeugt das DMS zu jedem neuen Dokument einen **Volltext** – im Hintergrund, ohne dass jemand warten muss:

- **PDFs:** Zuerst liest das DMS die vorhandene Textebene. Nur Seiten ohne Text (gescannte Seiten) gehen durch die Texterkennung.
- **Bilder** (JPEG, PNG, TIFF, WebP, GIF, BMP) gehen direkt durch die Texterkennung.
- **Andere Dateien** (z. B. Word, Excel) bekommen vorerst keinen Volltext.

Die Texterkennung (Tesseract, Deutsch und Englisch) ist im Image enthalten; nichts muss zusätzlich installiert werden.

![Werkbank → Texterkennung](bilder/werkbank-texterkennung.png)

## Einstellungen

Unter **Werkbank → Texterkennung**:

| Einstellung | Bedeutung |
| --- | --- |
| **Volltext erzeugen** | Ausgeschaltet bleiben neue Dokumente in der Warteschlange, bis es wieder an ist. |
| **Gleichzeitige Aufträge** | 1–4 (Standard 1). Mehr ist schneller, braucht aber mehr Prozessor und Speicher – auf einem NAS reicht meist einer. |
| **Höchstens Seiten** | je Dokument (Standard 50); weitere Seiten werden nicht gelesen. |
| **Größere Dateien auslassen** | ab dieser Größe in MB (Standard 50). |
| **Sprachen** | z. B. `deu+eng`. |
| **Je Dateityp** | welches Verfahren – oder *keine Texterkennung*, um einen Dateityp auszuschließen. Externe Dienste kommen später dazu. |

Ob ein Dokumentenregister überhaupt einen Volltext erzeugt, stellst du am [Mappentyp](mappentypen.md#register) ein (*Volltext erzeugen*, Standard: an).

Darunter zeigt die Seite, welche Werkzeuge installiert sind, und die **Warteschlange**: wie viele Dokumente warten, gerade laufen, fertig sind, einen Fehler hatten oder ausgelassen wurden.

Am Dokument sehen alle Benutzer den Stand (*wartet*, *läuft*, *fertig*, *Fehler*, *ausgelassen*); bei einem Fehler lässt sich die Texterkennung dort **erneut versuchen**, und ein fertiger Text lässt sich anzeigen. Liegt dieselbe Datei schon mit Volltext in einer anderen Mappe, übernimmt das DMS diesen Text.

## Wartungsoperationen

**Werkbank → Wartungsoperationen** sammelt Arbeiten am ganzen Bestand, die du bei Bedarf anstößt:

- **Volltext nachholen** stellt alle Dokumente in die Warteschlange, die noch keinen Volltext haben – etwa alles, was vor Version 0.11 hochgeladen wurde. Je nach Menge und Seitenzahl kann das Stunden dauern; das DMS bleibt dabei benutzbar.

Sicherung, Wiederherstellung und Export kommen später an diese Stelle.
