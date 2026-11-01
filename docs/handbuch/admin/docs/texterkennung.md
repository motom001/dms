# Texterkennung und Wartung

Damit die Suche auch den Text von Dokumenten findet, erzeugt das DMS zu jedem neuen Dokument einen **Volltext** – im Hintergrund, ohne dass jemand warten muss:

*Texterkennung* gehört zur Vorlage **Betrieb**, *Wartungsoperationen* nur zur Vorlage **Alles**.

--8<-- "ausgeblendet-schritt.md"

- **PDFs:** Zuerst liest das DMS die vorhandene Textebene. Nur Seiten ohne Text (gescannte Seiten) gehen durch die Texterkennung.
- **Bilder** (JPEG, PNG, TIFF, WebP, GIF, BMP) gehen direkt durch die Texterkennung.
- **Andere Dateien** (z. B. Word, Excel) bekommen vorerst keinen Volltext.

Die Texterkennung (Tesseract mit den Sprachpaketen Deutsch und Englisch und der Lageerkennung `osd`) ist im Image enthalten. Für Deutsch und Englisch muss nichts zusätzlich installiert werden; weitere Sprachen lädst du bei Bedarf nach (siehe [Sprachpakete nachinstallieren](#sprachpakete-nachinstallieren)).

![Werkbank → Texterkennung](bilder/werkbank-texterkennung.png)

## Einstellungen

Unter **Werkbank → Texterkennung**:

| Einstellung | Bedeutung |
| --- | --- |
| **Volltext erzeugen** | Ausgeschaltet bleiben neue Dokumente in der Warteschlange, bis es wieder an ist. |
| **Gleichzeitige Aufträge** | 1–4 (Standard 1). Mehr ist schneller, braucht aber mehr Prozessor und Speicher – auf einem NAS reicht meist einer. |
| **Höchstens Seiten** | je Dokument (Standard 50); weitere Seiten werden nicht gelesen. |
| **Größere Dateien auslassen** | ab dieser Größe in MB (Standard 50). |
| **Sprache** | **Automatisch** (Standard für neue Installationen) oder **Fest**. Siehe [Sprache automatisch erkennen](#sprache-automatisch-erkennen). |
| **Sprachen** | Tesseract-Kennungen, z. B. `deu+eng`. Bei *Automatisch* die Sprachen des ersten Durchlaufs, bei *Fest* immer genau diese. Ist eine eingestellte Sprache nicht installiert, steht das am Feld; die Texterkennung überspringt sie (siehe [Sprachpakete nachinstallieren](#sprachpakete-nachinstallieren)). |
| **Je Dateityp** | welches Verfahren – oder *keine Texterkennung*, um einen Dateityp auszuschließen. Externe Dienste kommen später dazu. |

Ob ein Dokumentenregister überhaupt einen Volltext erzeugt, stellst du am [Mappentyp](mappentypen.md#register) ein (*Volltext erzeugen*, Standard: an).

Darunter zeigt die Seite, welche Werkzeuge und Sprachpakete installiert sind, die **erkannten Sprachen** und die **Warteschlange**: wie viele Dokumente warten, gerade laufen, fertig sind, einen Fehler hatten oder ausgelassen wurden.

## Sprache automatisch erkennen

Mit **Sprache: Automatisch** erkennt das DMS selbst, in welcher Sprache ein Dokument geschrieben ist – die englische Rechnung, der französische Hotelbeleg oder der türkische Brief werden so richtig gelesen, ohne dass du Sprachen von Hand umstellst:

1. **Lage und Schrift:** Ist die Lageerkennung (`osd`) installiert, prüft Tesseract jede gescannte Seite. Quer liegende oder auf dem Kopf stehende Seiten werden vor dem Lesen aufgerichtet (am Dokument steht dann z. B. „1 Seite gedreht“). Erkennt Tesseract eine andere Schrift (z. B. Kyrillisch) und ist ein passendes Sprachpaket (z. B. `rus`) installiert, nimmt es dieses gleich dazu.
2. **Erster Durchlauf** mit den eingestellten *Sprachen* (Standard `deu+eng`).
3. Aus dem erkannten Text bestimmt das DMS die **Sprache**. Das geschieht offline und ohne fremde Dienste: Es zählt typische kurze Wörter (Artikel, Präpositionen, Grußformeln) und Sonderzeichen. Unterschieden werden Deutsch, Englisch, Französisch, Spanisch, Italienisch, Niederländisch, Türkisch, Polnisch, Portugiesisch, Russisch, Ukrainisch und Arabisch. Bei sehr wenig Text (z. B. nur Zahlen) bleibt die Sprache offen.
4. **Zweiter Durchlauf** – nur, wenn alles zusammenkommt: Die erkannte Sprache ist eindeutig, sie war im ersten Durchlauf nicht dabei, ihr Sprachpaket ist installiert und Tesseract war sich beim ersten Durchlauf unsicher (mittlere Konfidenz unter 85 %). Dann liest das DMS die Seite noch einmal mit dieser Sprache; **das bessere Ergebnis gilt** und auch die weiteren Seiten des Dokuments werden damit gelesen. So bleibt der Rechenaufwand klein: Die meisten Dokumente brauchen nur einen Durchlauf.

Die erkannte Sprache steht **am Dokument** neben dem Stand des Volltexts (z. B. „Volltext: fertig · 2 Seiten · Französisch“), auch bei PDFs mit Textebene.

Mit **Sprache: Fest** liest das DMS immer genau mit den eingestellten Sprachen, ohne zweiten Durchlauf. Die erkannte Sprache wird trotzdem angezeigt und gezählt.

!!! note "Nach einem Update"
    Hattest du die Sprachen vor Version 0.90 selbst geändert (also nicht mehr `deu+eng`), bleibt es bei deiner festen Auswahl. Sonst ist *Automatisch* eingeschaltet.

## Sprachpakete nachinstallieren

Steht in den Einstellungen eine Sprache, deren Sprachpaket fehlt, zeigt **Werkbank → Texterkennung** unter *Werkzeuge* deutlich „**Eingestellt, aber nicht installiert**“, und am Feld *Sprachen* steht, welche Sprache übersprungen wird. Die Texterkennung läuft dann mit den übrigen Sprachen weiter, schreibt aber an jedes betroffene Dokument „Sprachpaket fehlt: …“ und ins [Protokoll](fehlersuche.md) beim Start eine Warnung – nichts läuft still schlechter.

Unter **Erkannte Sprachen** siehst du, wie viele Dokumente in welcher Sprache vorliegen und ob das Sprachpaket installiert ist. Fehlt eins, macht die Seite einen Vorschlag, z. B. „12 Dokumente auf Französisch – Sprachpaket `fra` installieren?“.

Das DMS lädt Sprachpakete nicht selbst aus dem Internet. Zwei Wege:

**Eigenes Image** (dauerhaft, empfohlen): Eine kleine `Dockerfile` neben deiner Compose-Datei, die das Paket aus Alpine Linux dazunimmt:

```dockerfile
FROM ghcr.io/motom001/dms:main
RUN apk add --no-cache tesseract-ocr-data-fra tesseract-ocr-data-tur
```

In der Compose-Datei statt der Zeile `image: ghcr.io/motom001/dms:…` dann `build: .` eintragen und mit `docker compose up -d --build` starten. Bei jedem Update baust du neu; das Basis-Image wird dabei frisch geholt (`docker compose build --pull`). Die Paketnamen lauten `tesseract-ocr-data-` plus Kennung (`fra`, `spa`, `ita`, `nld`, `tur`, `pol`, `por`, `rus`, `ukr`, `ara` …).

**Einzelne Datei über ein Volume:** Die Datei `<kennung>.traineddata` (z. B. `fra.traineddata` aus dem Projekt *tessdata* von Tesseract – dieselbe Fassung, die Alpine verwendet) auf das NAS legen und in den Ordner der Sprachpakete einhängen – den Ordner zeigt die Werkbank unter *Sprachpakete* (im Image `/usr/share/tessdata/`):

```yaml
    volumes:
      - ./tessdata/fra.traineddata:/usr/share/tessdata/fra.traineddata:ro
```

Hänge nur einzelne Dateien ein, nicht den ganzen Ordner – sonst verdeckst du die mitgelieferten Pakete `deu`, `eng` und `osd`.

Danach unter *Werkzeuge* **Erneut prüfen**. Dokumente, die vorher ohne das Sprachpaket gelesen wurden, startest du unter **Aufträge → fertig** neu.

Steht die Warteschlange, sagt ein Hinweis oben auf der Seite und bei *Volltext nachholen* warum: **ausgeschaltet** (mit **Einschalten**) oder **pausiert, solange der Wartungsmodus an ist** (mit **Wartungsmodus beenden**). Ein nur angekündigter Wartungsmodus hält die Texterkennung nicht an.

## Aufträge

Unter **Aufträge** siehst du in einer Liste mit fester Höhe die Dokumente je Stand (*Fehler*, *wartet*, *läuft*, *ausgelassen*, *fertig*) – mit Mappe (als Link), Größe, Zeitpunkt und dem **Grund** bei Fehlern oder ausgelassenen Dokumenten.

- Dokumente auswählen und **Neu starten**: Sie kommen wieder in die Warteschlange.
- Wartende **aus der Warteschlange nehmen** bzw. laufende **abbrechen**: Sie gelten dann als *ausgelassen* („Vom Administrator abgebrochen“); ein laufender Vorgang (tesseract, pdftoppm) wird beendet.
- **Alle Fehler neu starten** reiht alle Dokumente mit Fehler wieder ein.

**Passwortgeschützte PDFs** erkennt das DMS und lässt sie mit dem Grund „Das PDF ist mit einem Passwort geschützt“ aus, statt einen Fehler zu melden – ein neuer Versuch würde nichts ändern.

Alle Meldungen der Texterkennung stehen im [Protokoll](fehlersuche.md) unter dem Modul `texterkennung`.

Am Dokument sehen alle Benutzer den Stand (*wartet*, *läuft*, *fertig*, *Fehler*, *ausgelassen*); bei einem Fehler lässt sich die Texterkennung dort **erneut versuchen**, und ein fertiger Text lässt sich anzeigen. Liegt dieselbe Datei schon mit Volltext in einer anderen Mappe, übernimmt das DMS diesen Text.

## Wartungsoperationen

**Werkbank → Wartungsoperationen** sammelt Arbeiten am ganzen Bestand, die du bei Bedarf anstößt:

- **Volltext nachholen** stellt alle Dokumente in die Warteschlange, die noch keinen Volltext haben – etwa alles, was vor Version 0.11 hochgeladen wurde. Je nach Menge und Seitenzahl kann das Stunden dauern; das DMS bleibt dabei benutzbar.
- **Vorschaubilder nachholen** erzeugt für ältere PDFs und Bilder das kleine Bild der ersten Seite, das neben jedem Dokument steht. Neue Dokumente bekommen es gleich nach dem Hochladen, ältere sonst beim ersten Anzeigen. Die Bilder entstehen eins nach dem anderen mit `pdftoppm` (poppler, im Image enthalten).
- **Alle Dateien prüfen** liest jede gespeicherte Datei, auch ältere Versionen, und vergleicht sie mit ihrem Prüfwert. So fällt auf, wenn eine Datei auf dem Speicher verändert wurde oder fehlt. Mehr dazu unter [Alle Dateien prüfen](archiv.md#alle-dateien-prufen).
- **Nummern nachträglich vergeben** gibt Mappen eine Nummer, die angelegt wurden, bevor ihr Feld einen Nummernkreis bekam. Mehr dazu unter [Nummern nachträglich vergeben](nummernkreise.md#nummern-nachtraglich-vergeben).

Alle vier laufen im Hintergrund; das DMS bleibt dabei benutzbar.
