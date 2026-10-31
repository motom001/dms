# Pakete

Ein **Paket** bringt fertige Mappentypen, Sichten und auf Wunsch Beispiel-Mappen mit – etwa das Basis-Paket mit dem Mappentyp „Organisation“ für Firmen, Behörden, Ärzte und Versicherungen. Statt Feld für Feld in der Werkbank zu bauen, installierst du es mit wenigen Klicks unter **Werkbank → Pakete**.

Pakete kommen aus dem **offiziellen Katalog** des DMS-Projekts ([dms-registry](https://github.com/motom001/dms-registry)). Jedes Paket dort ist Open Source und wurde vom Maintainer freigegeben. In dieser Stufe gibt es nur **Konfigurationspakete** (Mappentypen, Sichten, Beispiele), keine Pakete mit Code.

## Katalog abrufen

Das DMS fragt den Katalog **nur auf Knopfdruck** ab, nie im Hintergrund: Klicke **Katalog abrufen**. Die Seite zeigt dann zwei Listen:

- **Installiert** – Pakete in diesem DMS, mit Version und Herkunft
- **Verfügbar** – Pakete aus dem Katalog, die noch nicht installiert sind

Ein Klick auf ein Paket zeigt Name, Beschreibung, Version, Lizenz, Autor, die nötige DMS-Version, Abhängigkeiten, die enthaltenen Mappentypen und Sichten sowie Links zum README und zu den Änderungen.

Das DMS lädt den Katalog von `https://raw.githubusercontent.com/motom001/dms-registry/gh-pages/katalog.json`. Braucht dein DMS einen Proxy für das Internet, gilt derselbe wie für alle anderen Abrufe.

## Installieren

1. Wähle ein Paket unter **Verfügbar** und ggf. eine ältere Version.
2. Klicke **Installieren …**. Die **Vorschau** zeigt, was angelegt wird:
    - je Mappentyp die Zahl der Felder und den Schlüssel, z. B. `basis_organisation`
    - die Sichten, mit Elternsicht
    - die Abhängigkeiten und ob sie installiert sind
    - wie viele Beispiel-Mappen es gibt
3. **Namen:** Gibt es einen Mappentyp oder eine Sicht (auf oberster Ebene) mit gleichem Namen schon, sagt die Vorschau das und schlägt einen anderen vor, z. B. „Organisation (Basis)“. Du kannst jeden Namen ändern.
4. **Beispiel-Mappen** legt das DMS nur an, wenn du den Haken setzt.
5. **Fehlende Pakete mitinstallieren:** Braucht das Paket ein anderes, das noch fehlt, installiert das DMS es auf Wunsch vorher mit (die neueste passende Version aus dem Katalog).
6. Klicke **Installieren**.

Vor dem Anlegen prüft das DMS:

- ob die **eigene Version** passt (sonst erst das DMS [aktualisieren](aktualisieren.md)),
- ob alle **Abhängigkeiten** installiert sind und in einer passenden Version,
- ob das heruntergeladene Archiv zur **Prüfsumme (SHA-256)** im Katalog passt. Passt sie nicht, installiert das DMS nichts.

Angelegt wird über dieselben Funktionen wie in der Werkbank, mit allen Prüfregeln. Die Schlüssel bekommen das Paket-Präfix (`<paket>_<schluessel>`), damit sich Pakete nicht in die Quere kommen; Verweise auf Typen anderer Pakete löst das DMS auf. **Scheitert etwas, nimmt das DMS alles zurück** – es bleibt nichts halb angelegt.

Mappentypen aus Paketen tragen in **Werkbank → Mappentypen** den Hinweis **Paket …**. Du kannst sie danach wie jeden anderen Mappentyp anpassen.

## Installierte Pakete

Je Paket merkt sich das DMS Version, **Herkunft** (der Katalog), wann und von wem es installiert bzw. aktualisiert wurde und welche Mappentypen und Sichten dazugehören. Diese Angaben sind Teil der [Sicherung](sicherung.md) und des [Vollexports](export.md) (`struktur/pakete.json`). Installieren, Aktualisieren und Entfernen stehen im Protokoll.

## Aktualisieren

**Auf neue Versionen prüfen** fragt den Katalog ab (auf Knopfdruck) und markiert Pakete, für die es Neueres gibt. Im Paket zeigt **Auf … aktualisieren …** eine Vorschau mit dem, was dazukommt, und einem Link zu den Änderungen.

Ein Update **ergänzt nur**:

- neue Mappentypen und Sichten,
- neue Felder und Register bei vorhandenen Mappentypen.

Es **löscht nichts** und **überschreibt nichts**, was du selbst geändert hast: Hast du einen Typ umbenannt, Felder ergänzt oder eine Sicht gelöscht, bleibt das so.

## Entfernen

**Entfernen** löscht die Mappentypen und Sichten des Pakets und seinen Eintrag. Das geht nur,

- solange es **keine Mappen** dieser Typen gibt (auch nicht im Papierkorb) und
- **kein anderes Paket** davon abhängt.

Sonst nennt das DMS die Gründe. Beispiel-Mappen löschst du vorher wie andere Mappen.

## Erweiterte Ansicht: weitere Kataloge und Hochladen

Für Paketentwickler und für ein DMS ohne Internetzugang gibt es unter **Werkbank → Pakete** den Schalter **Erweiterte Ansicht**. Er gilt nur für dich (je Benutzer gemerkt) und ist standardmäßig aus. In der normalen Ansicht gibt es nur den offiziellen Katalog.

In der erweiterten Ansicht kannst du:

- **Weitere Katalogadressen** hinzufügen, abschalten und entfernen. Erlaubt ist nur HTTPS, das Format ist dasselbe wie beim offiziellen Katalog (`katalog.json` der Registry). **Katalog abrufen** fragt dann auch die eingeschalteten weiteren Kataloge ab; ihre Pakete tragen die Adresse als Kennzeichen.
- Ein **Paket als Datei hochladen** (`.zip` im Format der Registry, z. B. der Paketordner gepackt). Das DMS prüft es genauso wie ein Katalogpaket, nur ohne Prüfsumme aus dem Katalog, und zeigt die Vorschau.

!!! warning "Nicht vom DMS-Projekt geprüft"
    Pakete aus einer anderen Quelle als dem offiziellen Katalog hat niemand vom DMS-Projekt angesehen. Vor der Installation zeigt das DMS deshalb deutlich die Herkunft, und du musst ausdrücklich bestätigen, dass du weißt, woher das Paket stammt.

Die Liste der installierten Pakete zeigt bei jedem die **Herkunft**: „offizieller Katalog“, die Katalogadresse oder „hochgeladen von … am …“. **Updates sucht das DMS nur in der Quelle, aus der das Paket stammt.** Ein hochgeladenes Paket aktualisierst du, indem du eine höhere Version hochlädst; dann gelten dieselben Regeln wie bei jedem Update (nur ergänzen). Ist die Quelle eines Pakets abgeschaltet oder entfernt, gibt es dafür keine Updates.

Das Protokoll vermerkt, wer welche Quelle hinzugefügt, abgeschaltet oder entfernt und wer welches Paket hochgeladen hat.

## Eigene Pakete

Wie ein Paket aufgebaut ist und wie es in den Katalog kommt, steht im [Entwicklerhandbuch](https://motom001.github.io/dms/entwickler/aktuell/pakete/).
