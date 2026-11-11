# Pakete

Ein **Paket** bringt fertige Mappentypen, Ansichten und auf Wunsch Beispiel-Mappen mit – etwa das Basis-Paket mit dem Mappentyp „Organisation“ für Firmen, Behörden, Ärzte und Versicherungen. Statt Feld für Feld in der Werkbank zu bauen, installierst du es mit wenigen Klicks unter **Werkbank → Pakete**.

Pakete kommen aus dem **offiziellen Katalog** des Ablago-Projekts ([dms-registry](https://github.com/motom001/dms-registry)). Jedes Paket dort ist Open Source und wurde vom Maintainer freigegeben. Meist sind es **Konfigurationspakete** (Mappentypen, Ansichten, Beispiele). Pakete mit Code lassen sich installieren und einstellen, ihr Code läuft aber erst mit dem Paket-Läufer.

## Katalog abrufen

Ablago fragt den Katalog **nur auf Knopfdruck** ab, nie im Hintergrund: Klicke **Katalog abrufen**. Die Seite zeigt dann zwei Listen:

- **Installiert** – Pakete in dieser Installation, mit Version und Herkunft
- **Verfügbar** – Pakete aus dem Katalog, die noch nicht installiert sind

Ein Klick auf ein Paket zeigt Name, Beschreibung, Version, Lizenz, Autor, die nötige Ablago-Version, Abhängigkeiten, die enthaltenen Mappentypen und Ansichten sowie Links zum README und zu den Änderungen.

Ablago lädt den Katalog von `https://catalog.ablago.app/katalog.json` und prüft seine **Signatur** (siehe [Herkunft](#herkunft-signiert-oder-nicht)). Weiterleitungen folgt es dabei nur auf `https://`-Adressen. Dafür muss Ablago selbst ins Internet kommen. Einen Proxy für ausgehende Abrufe kann Ablago nicht einstellen. Ohne Internetzugang lädst du ein Paket als Datei hoch (siehe [Expertenmodus](#expertenmodus-weitere-kataloge-und-hochladen)).

Lässt du Ablago nur zu bestimmten Adressen ins Netz (Firewall-Liste, ausgehender Filter am NAS), braucht es diese drei:

- `catalog.ablago.app`: Katalog und Signatur
- `github.com`: die Paket-Dateien liegen als Release-Datei bei GitHub; von dort leitet GitHub einmal weiter
- `release-assets.githubusercontent.com`: Ziel dieser Weiterleitung

GitHub kann das Ziel der Weiterleitung ändern. Maßgeblich ist dann die Adresse, die Ablago in der Fehlermeldung beim Laden nennt. Die Prüfsumme jedes Pakets steht im signierten Katalog, an der Prüfung ändert der Ort der Datei nichts.

GitHub zählt, wie oft eine Release-Datei heruntergeladen wird; daraus kommen die Zahlen im Katalog. Ablago sendet dafür nichts mit: keine Kennung, keine Version, nur einen festen User-Agent.

## Installieren

1. Wähle ein Paket unter **Verfügbar** und ggf. eine ältere Version.
2. Klicke **Installieren …**. Es öffnet sich der [gemeinsame Ablauf](#mehrere-pakete-in-einem-schritt-installieren): oben das Paket, darunter, was es braucht („Braucht: …“), und seine **Ergänzungen** als Häkchen – bei der Texterkennung etwa **Weitere Sprachen?** mit Französisch, Spanisch, Türkisch …
3. Klicke **Weiter mit … Paketen**. Auf **einer Seite** fragt Ablago jetzt alles, was nötig ist, und nur das:
    - bei Paketen mit Code **was der Code darf** – je Paket als Liste, Ereignisse als Unterliste, mit **?** zur Erklärung (siehe [Rechte eines Pakets](#rechte-eines-pakets)). Darunter **ein** Haken für alle, sonst bleibt **Installieren** grau
    - **Namen**, die es schon gibt: Gibt es einen Mappentyp oder eine Ansicht (auf oberster Ebene) mit gleichem Namen schon, schlägt Ablago einen anderen vor, z. B. „Organisation (Basis)“. Alles andere bekommt den Namen aus dem Paket, ohne Rückfrage. Wer den Namen schon hat (ein Paket, selbst angelegt, ein Paket davor im Ablauf), steht vor **Installieren** unter **Namen schon vergeben**; übernimmt ein Umbau den vorhandenen Typ, ist das kein Konflikt (#1123)
    - **Beispiel-Mappen** – nur, wenn du den Haken setzt; bringen sie **Beispiel-Dokumente** mit, stehen Anzahl und Größe dabei (siehe [Beispiele](#beispiele))
    - **Einstellungen**, ohne die ein Paket nicht läuft – oder **Später ausfüllen** (siehe [Einstellungen](#einstellungen))
4. Unten steht die **Zusammenfassung**: welche Pakete in welcher Reihenfolge, wie viele Mappentypen und Ansichten, Beispiele, Pakete mit Code. Darunter die Hinweise des Pakets, z. B. ob es **gleichbedeutende Wörter** für die Suche mitbringt (Wortlisten, siehe [Suche](suche.md#gleichbedeutende-worter)) oder Mappentypen aus Ablago nutzt.
5. Klicke **Installieren**.

Vor dem Anlegen prüft Ablago:

- ob die **eigene Version** passt (sonst erst Ablago [aktualisieren](aktualisieren.md)),
- ob alle **Abhängigkeiten** installiert sind und in einer passenden Version,
- ob ein **Name** schon vergeben ist – auch durch einen Mappentyp einer Abhängigkeit, die mitinstalliert würde (#1123). Das steht schon in der Vorschau; Namen des Pakets selbst änderst du dort, bei einer Abhängigkeit installierst du sie vorher einzeln,
- ob das heruntergeladene Archiv zur **Prüfsumme (SHA-256)** im Katalog passt. Passt sie nicht, installiert Ablago nichts.

Angelegt wird über dieselben Funktionen wie in der Werkbank, mit allen Prüfregeln. Mappentypen aus Paketen haben die [Kennung](mappentypen.md) `paket:schluessel`, z. B. `basis:person` – so kommen sich Pakete nicht in die Quere, auch wenn Paket-Id und Kennung selbst einen Unterstrich enthalten (bis Ablago 0.228 hieß es `basis_person`; beim Update hat Ablago alle Kennungen umgestellt, #1084). Eigene Mappentypen haben eine Kennung ohne Doppelpunkt. Verweise auf Mappentypen anderer Pakete löst Ablago auf. **Scheitert etwas, nimmt Ablago alles zurück** – es bleibt nichts halb angelegt.

### Mehrere Pakete in einem Schritt installieren { #mehrere-pakete-in-einem-schritt-installieren }

Ob ein Paket mit seinen Abhängigkeiten, die Texterkennung mit drei Sprachen oder zehn Pakete im [Einrichtungsassistenten](installation.md#pakete-dazuholen) oder aus einer [Sammeldatei](#pakete-ohne-internet-installieren): Ablago installiert alles in **einem Ablauf** – ohne Kette von Rückfragen je Paket.

1. **Auswahl:** Die Pakete als Kacheln wie im Katalog – mit Symbol, Kurzbeschreibung und Größe des Downloads; oben lässt sich nach **Kategorie** filtern (was du schon gewählt hast, bleibt sichtbar). Im Einrichtungsassistenten sieht die Auswahl genauso aus. Was ein Paket braucht, kommt automatisch mit und ist mit „kommt mit – gebraucht von …“ markiert – **auch Pakete mit Code**. **Ergänzungen** eines Pakets (Pakete, die es erweitern, z. B. die Zusatzsprachen der Texterkennung) stehen als Häkchen direkt darunter, sobald du das Paket wählst; jede Ergänzung bleibt ein eigenes Paket mit eigener Version und eigenem Update.
2. **Jede Frage einmal, mit Ausnahme je Paket:**
    - **Herkunft** (nur außerhalb des offiziellen Katalogs bzw. ohne gültige Signatur): ein Haken für alle.
    - **Rechte:** alle Pakete mit Code untereinander, je Paket mit seinen Rechten, und **ein** Haken „Ich erlaube diesen Paketen jeweils diese Rechte“. Jedes Paket bekommt trotzdem nur seine **eigenen** Rechte und sein eigenes Dienstkonto.
    - **Namen:** nur Mappentypen und Ansichten, deren Name schon vergeben ist.
    - **Beispiel-Mappen:** ein Haken für alle Pakete mit Beispielen; unter **Je Paket abwählen** nimmst du einzelne heraus.
    - **Einstellungen:** die Pflichtfelder aller Pakete, je Paket ein Kasten. Eine Dienst-Adresse ist nie voreingestellt – **Beispiel übernehmen** trägt das Beispiel des Pakets ein, und du bestätigst die Adressen mit einem Haken. Mit **Später ausfüllen** wird das Paket trotzdem installiert, steht aber auf **Einstellungen nötig**, und die [Übersicht der Werkbank](uebersicht.md) zeigt dir die Aufgabe „… braucht noch Einstellungen“, bis du sie ausgefüllt hast.
3. **Zusammenfassung** und **ein** Knopf „… Pakete installieren“.

Ablago prüft **vor dem ersten Paket** alles: Herkunft, Rechte, Namen, Einstellungen und Dienst-Adressen. Fehlt etwas, installiert es **nichts**. Dann geht es Paket für Paket vor, Abhängigkeiten zuerst. Scheitert ein Paket trotzdem (z. B. ein ungültiges Beispiel), ist **dieses Paket vollständig zurückgenommen**; die übrigen werden weiter installiert. Nur Pakete, die das gescheiterte brauchen, fallen mit Begründung weg. Lässt sich ein Paket schon gar nicht laden (z. B. keine Verbindung), zeigt Ablago das vor dem Installieren an, mit **Nochmal versuchen** – die übrigen kannst du trotzdem installieren. Am Ende nennt das Ergebnis, was installiert ist und was nicht, jeweils mit Grund; Fehlendes holst du später unter **Werkbank → Pakete** nach.

Deine Bestätigung gilt nur für **genau die Rechte, die du gesehen hast**. Ändern sie sich bis zum Klick (z. B. weil der Katalog inzwischen eine neue Version mit mehr Rechten hat), zeigt Ablago die neuen Rechte und fragt noch einmal. Während eine Installation läuft, warten andere Installationen, Updates und das Entfernen von Paketen – auch auf einem zweiten Server mit derselben Datenbank.

**Nachträglich:** Unter **Werkbank → Pakete → *Paket*** stehen die Ergänzungen, die es dazu im Katalog gibt (z. B. **Weitere Sprachen** bei der Texterkennung), mit **Auswählen …** – danach derselbe Ablauf. Die Seite der [Texterkennung](texterkennung.md#weitere-sprachen) schlägt Sprachen vor, die in deinen Dokumenten vorkommen.

Mappentypen aus Paketen tragen in **Werkbank → Mappentypen** den Hinweis **Paket …**. Du kannst sie danach wie jeden anderen Mappentyp anpassen.

### Über die Katalog-Webseite

Den Katalog gibt es auch als Webseite: [Paketkatalog](https://catalog.ablago.app/) (auch auf der Startseite der Handbücher). Dort siehst du je Paket die Beschreibung, was angelegt wird, Rechte, Änderungen und ältere Versionen.

1. Klicke beim Paket **In meinem Ablago installieren**.
2. Beim ersten Mal fragt die Seite nach der **Adresse deines Ablago**, z. B. `https://dms.example.org`. Sie merkt sie sich nur in deinem Browser; über **Ablago-Adresse** oben änderst du sie. Die Webseite sendet nichts an dein Ablago und speichert keine Zugangsdaten.
3. Dein Ablago öffnet **Werkbank → Pakete** mit der **Vorschau** genau dieses Pakets (Adresse `…/werkbank/pakete?installieren=<paket>@<version>`). Bist du nicht angemeldet, meldest du dich zuerst an und landest danach wieder dort. Andere Benutzer sehen einen Hinweis, dass nur Administratoren Pakete installieren.
4. Ablago holt Paket und Prüfsumme **selbst aus dem offiziellen Katalog** – Angaben im Link, die auf andere Quellen zeigen, zählen nicht. Gibt es das Paket oder die Version dort nicht, sagt Ablago es.
5. Installiert wird **erst, wenn du auf „Installieren“ klickst**. Der Link allein ändert nichts. Ist das Paket schon installiert, zeigt die Vorschau das; ein Update bietet sie an, wenn der Link eine neuere Version nennt.

### Im Katalog ansehen { #im-katalog-ansehen }

Unter **Werkbank → Pakete** steht über der Liste **Verfügbar** der Link **Im Katalog ansehen**; bei jedem Paket aus dem offiziellen Katalog gibt es ihn zusätzlich unter **Mehr** für die Seite genau dieses Pakets. Der Link öffnet die Katalog-Webseite in einem neuen Tab und gibt ihr die **Version deines Ablago** mit. Die Webseite zeigt dann gleich, welche Pakete zu deinem Ablago passen, und filtert auf Wunsch danach – du musst die Version nicht suchen und eintippen.

**Was übertragen wird:** nichts außer dem Seitenaufruf selbst, wie bei jeder anderen Webseite. Die Version steht im **Fragment** der Adresse, also hinter dem `#`, z. B. `https://catalog.ablago.app/#dms=0.146.0`. Diesen Teil schickt der Browser nie an den Server; er steht in keinem Zugriffsprotokoll. Nur das Skript der Katalogseite liest ihn in deinem Browser, merkt sich die Version dort und entfernt das Fragment gleich wieder aus der Adresse, damit sie nicht mit einem geteilten Link weitergeht.

- Im Fragment steht **nur die Version** – keine Adresse deines Ablago, kein Haushaltsname, keine Liste deiner Pakete, keine Kennung.
- Der Link öffnet ohne **Herkunftsadresse** (`rel="noopener noreferrer"`): Die Katalogseite erfährt nicht, von welcher Adresse du kommst, und hat keinen Zugriff auf den Tab deines Ablago.
- Ist der offizielle Katalog gerade nicht erreichbar (nach **Katalog abrufen**), steht statt des Links ein Hinweis auf [Pakete ohne Internet](#pakete-ohne-internet-installieren).
- Weitere Kataloge aus dem [Expertenmodus](#expertenmodus-weitere-kataloge-und-hochladen) haben keine bekannte Webseite; den Link gibt es nur für den offiziellen Katalog.

## Herkunft: signiert oder nicht { #herkunft-signiert-oder-nicht }

Das Ablago-Projekt **signiert** den offiziellen Katalog (ab Ablago 0.141.0). Weil der Katalog die Prüfsumme jedes Pakets enthält, belegt eine einzige Signatur, dass alle Pakete darin vom Ablago-Projekt stammen. Die **Vorschau** zeigt deshalb vor jeder Installation eine Zeile **Herkunft**:

| Herkunft | Bedeutung | Was du tust |
| --- | --- | --- |
| **signiert vom Ablago-Projekt** (Katalog vom …) | Katalog und Paket sind nachweislich vom Ablago-Projekt und unverändert. | Nichts – installieren. |
| **signiert vom Anbieter dieses Katalogs** | Ein [weiterer Katalog](#expertenmodus-weitere-kataloge-und-hochladen) mit eigenem Schlüssel, dessen Fingerabdruck du bestätigt hast. | Nichts – du hast dem Anbieter beim Hinzufügen vertraut. |
| **nicht signiert** | Niemand belegt, woher das Paket kommt. | Nur installieren, wenn du die Quelle kennst; du bestätigst die Herkunft mit einem Haken. |
| **Signatur ungültig** | Der Katalog ist verändert oder nicht vom Ablago-Projekt. Ablago vermerkt das im Protokoll. | Im Zweifel nicht installieren und später erneut abrufen. Installieren geht nur mit ausdrücklicher Bestätigung. |

**Übergang:** In dieser Version gibt es beim offiziellen Katalog **ohne** Signatur nur einen Hinweis. Eine Minor-Version später verlangt Ablago die Signatur; Pakete aus weiteren Quellen, hochgeladene Pakete und Sammeldateien ohne Signatur gehen dann weiter mit Bestätigung.

**Älterer Katalog:** Ablago merkt sich, welchen Stand des Katalogs es zuletzt signiert gesehen hat. Bekommt es danach online einen **älteren** signierten Katalog, nimmt es ihn nicht – so kann niemand einen alten Katalog mit einer inzwischen korrigierten Paketversion unterschieben. Die Meldung nennt beide Zeitpunkte. Meist hilft es, später noch einmal abzurufen; bleibt es so, melde es dem Ablago-Projekt.

**Ältere Versionen:** Ablago 0.141.0 bis 0.144.1 kennen nur Testschlüssel. Sobald das Ablago-Projekt den Katalog mit seinen echten Schlüsseln signiert, zeigen sie beim offiziellen Katalog „Signatur ungültig“ – aktualisiere dann Ablago. Die Fingerabdrücke der echten Schlüssel stehen in der [Sicherheitsrichtlinie](https://github.com/motom001/dms/blob/main/SECURITY.md).

### Herausgeber { #herausgeber }

Neben dem Namen eines Pakets steht sein **Herausgeber** (#1084), z. B. „Verträge · app.ablago“ – in der Liste, im Katalog, in der Vorschau und im Installationsablauf. Der Herausgeber ist eine umgedrehte Domain: Die offiziellen Pakete haben `app.ablago`, Pakete anderer Anbieter deren Domain, z. B. `org.example`.

- **Kein Ersatz durch Fremde:** Ist ein Paket schon installiert, nimmt Ablago kein Paket mit derselben Id von einem **anderen** Herausgeber – weder als Installation noch als Update, auch nicht hochgeladen. Die Meldung lautet etwa „Ein anderes Paket „vertraege“ von app.ablago ist schon installiert …“. Willst du wirklich wechseln, entferne zuerst das installierte Paket.
- **`app.ablago` nur offiziell:** Ein Paket, das sich als `app.ablago` (oder `app.ablago.…`) ausgibt, installiert Ablago nur aus dem offiziellen Katalog, aus einer Sammeldatei mit dessen Signatur oder als Datei, deren Prüfsumme dort steht.
- **Andere Herausgeber sind nicht geprüft:** Ablago zeigt sie als „Herausgeber laut Paket: org.example – nicht geprüft“ – das Paket sagt es nur selbst. Bei einem weiteren Katalog mit eigenem Schlüssel bindet Ablago den Herausgeber an diesen Schlüssel; ein Update mit anderem Schlüssel nimmt es nicht. Angezeigt wird der Herausgeber immer vollständig.
- **Ergänzungen und Abhängigkeiten:** Ein Paket mit Punkt in der Id (z. B. `texterkennung.fra`) muss vom selben Herausgeber sein wie das Paket vor dem Punkt. Eine Abhängigkeit zählt nur, wenn das installierte Paket vom selben Herausgeber oder vom Ablago-Projekt stammt – ein fremdes „basis“ ersetzt nie das offizielle.
- **Ältere Pakete** nennen noch keinen Herausgeber. Dann gilt der Herausgeber ihres Katalogs: Aus dem offiziellen Katalog ist das `app.ablago` – alle Pakete dort gibt das Ablago-Projekt heraus, und nur seine Signatur belegt es. Bei anderen Quellen ist er unbekannt; dann schützt wie bisher, dass Updates nur aus derselben Quelle kommen. Nennt ein solches Paket mit einem Update zum ersten Mal einen Herausgeber, fragt die Vorschau ausdrücklich nach („Ab diesem Update gilt … als Herausgeber dieses Pakets“); ohne den Haken gibt es kein Update. Danach gilt dieser Herausgeber.

## Installierte Pakete

Je Paket merkt sich Ablago Version, **Herkunft** (der Katalog), **Herausgeber**, wann und von wem es installiert bzw. aktualisiert wurde und welche Mappentypen und Ansichten dazugehören. Diese Angaben sind Teil der [Sicherung](sicherung.md) und des [Vollexports](export.md) (`struktur/pakete.json`). Installieren, Aktualisieren und Entfernen stehen im Protokoll.

## Beispiele { #beispiele }

Viele Pakete bringen **Beispiel-Mappen** mit erfundenen Daten mit, damit du siehst, was in eine Mappe gehört. Seit Ablago 0.223.0 können sie auch **Beispiel-Dokumente** mitbringen – etwa einen Wartungsvertrag und zwei Rechnungen zur Mappe „Heizung“. Angelegt wird beides nur, wenn du beim Installieren den Haken **Beispiel-Mappen** setzt; bei einem Update entstehen keine Beispiele.

- **Wie hochgeladen:** Die Dokumente landen im Register, das das Paket nennt, und bekommen Vorschau, Volltext (Texterkennung) und – wenn du sie eingeschaltet hast – eine Archivfassung, genau wie ein Dokument, das du selbst hochlädst. Herkunft: *von einem Paket*; als Datum steht das Datum aus dem Paket.
- **Nur sichere Dateiarten:** PDF, PNG und JPEG, jede höchstens so groß wie beim Hochladen. Alle zusammen zählen zur Größengrenze eines Pakets (128 MB).
- **Still:** Beispiel-Mappen und ihre Dokumente lösen keine [Automatisierungen](automatisierungen.md) und keine Mappen-Ereignisse aus. Pakete, die Dateien verarbeiten (etwa Texterkennung oder *KI lokal – Ähnlichkeit*), bekommen die Dokumente trotzdem – sonst fehlte ihnen der Text.
- **Wieder entfernen:** Unter **Werkbank → Pakete → *Paket*** entfernt **Beispiele entfernen** alle Beispiel-Mappen des Pakets **samt ihren Dokumenten** endgültig, ohne Papierkorb – solange sie **unverändert** sind. Beispiele, an denen du etwas geändert hast (Felder, Dokumente, Notizen) oder auf die eine deiner Mappen verweist, **bleiben** als normale Mappen; Ablago nennt sie. Beim [Entfernen](#entfernen) des Pakets geschieht dasselbe von selbst. Das Löschprotokoll vermerkt die entfernten Beispiele als „Beispiele eines Pakets entfernt“.
- **Sicherung:** Beispiel-Dokumente sind normale Dokumente – sie sind in der [Sicherung](sicherung.md) und im Export, bis du sie entfernst.

Bei Paketen, die vor 0.223.0 installiert wurden, kennt Ablago die Beispiele nicht als solche; die löschst du wie andere Mappen.

## Vorgaben { #vorgaben }

Manche Pakete bringen **Vorgaben** mit: Mappen zum **Behalten**, nicht zum Ausprobieren. Das Paket *Verträge* etwa legt die üblichen **Vertragsarten** an – Strom, Gas, Mobilfunk, Miete, Versicherung … – mit typischen Fristen und Vorlagen wie einem Kündigungsschreiben. Anders als [Beispiele](#beispiele) kommen Vorgaben **immer** mit (kein Haken) und sind echte Daten deiner Ablage.

- **In der Vorschau:** Unter **Vorgaben** steht je Mappentyp, was angelegt wird. Liefert das Paket Vorgaben in Mappentypen **eines anderen Pakets** oder hängt es Vorlagen an dessen Vorgaben (etwa *Fahrzeuge* die Vertragsart „Pkw-Kaufvertrag“ in *Verträge*), steht das zusätzlich im Kasten **Ergänzt Mappen anderer Pakete** – mit dem Namen des Pakets. Stammt dieses Paket von einem anderen Herausgeber, sagt die Vorschau das ausdrücklich.
- **Kennzeichnung:** Eine Vorgabe zeigt über den Registern „Vorgabe aus dem Paket *Verträge*“ – dieselbe Marke wie bei Hinweisen von Paketen. Sonst ist sie eine gewöhnliche Mappe: Du kannst sie ändern, löschen und ihr Dokumente anhängen; Berechtigungen gelten wie für jede Mappe ihres Mappentyps. In der Historie steht als Ersteller das Konto des Pakets („Paket Verträge“).
- **Sprache:** Bringt das Paket Texte in mehreren Sprachen mit, legt Ablago die Vorgaben in der **Sprache der Installation** an (siehe [Sprachen](sprachen.md)) – „Electricity“ statt „Strom“, wenn sie Englisch ist.
- **Vorlagen:** Vorgaben können **Text-Vorlagen** mitbringen (schlichtes Markdown, z. B. „Kündigung Mietvertrag.md“). Sie liegen als Dokument im Register der Vorgabe, Herkunft *von einem Paket*. Vorlagen sind reiner Text: kein HTML, keine Bilder, Links nur `https://`, höchstens 256 KB je Vorlage – Ablago prüft das beim Installieren noch einmal. Aus ihnen machen Benutzer über **Mappe ▾ → Brief aus Vorlage …** einen Brief als PDF ([Benutzerhandbuch](https://help.ablago.app/benutzer/aktuell/versenden/#brief-aus-vorlage), #1040); die Vorlage bleibt dabei unverändert.
- **Still:** Vorgaben lösen beim Installieren keine [Automatisierungen](automatisierungen.md) und keine Mappen-Ereignisse aus – wie Beispiele.

**Updates** ergänzen neue Vorgaben und Vorlagen. Eine Vorgabe, die noch genau so ist, wie das Paket sie angelegt hat, bekommt die neue Fassung. **Hast du sie geändert, bleibt sie so** – die Vorschau sagt dann „von dir geändert – bleibt so, die neue Fassung im Paket wird nicht übernommen“. **Hast du eine Vorgabe gelöscht, bleibt sie gelöscht**; ein Update legt sie nicht wieder an. Doppelt entsteht nichts: Jede Vorgabe hat eine feste Kennung, über die Ablago sie wiederfindet.

**Entfernen** des Pakets:

- Vorgaben, die **benutzt** werden – eine andere Mappe verweist darauf, sie hat Notizen oder Dokumente, die nicht vom Paket kommen –, **bleiben**. In den eigenen Mappentypen des Pakets verhindern sie das Entfernen; Ablago nennt sie („Die Vorgabe „Miete“ wird noch verwendet“).
- Unbenutzte Vorgaben in den eigenen Mappentypen gehen mit dem Paket.
- Unbenutzte Vorgaben in Mappentypen **anderer** Pakete: Ablago **fragt** – **Mit entfernen** oder **Behalten** (dann bleiben sie als gewöhnliche Mappen).
- Vorlagen, die das Paket an Vorgaben anderer Pakete gehängt hat, gehen mit – **nur diese**; was du oder andere Pakete dort abgelegt haben, bleibt.
- Vorgaben, die stehen bleiben, behalten ihre Kennung: Installierst du das Paket später wieder, nimmt es sie wieder auf, statt sie doppelt anzulegen (Vorschau: „gibt es schon – wird wieder aufgenommen“). Es ändert sie dabei nicht.

Das Löschprotokoll vermerkt entfernte Vorgaben als „Unbenutzte Vorgaben eines Pakets entfernt“.

## Aktualisieren { #aktualisieren }

**Auf neue Versionen prüfen** fragt den Katalog ab (auf Knopfdruck) und markiert Pakete, für die es Neueres gibt. Im Paket zeigt **Auf … aktualisieren …** eine Vorschau mit dem, was dazukommt, und einem Link zu den Änderungen.

Ein Update **ergänzt nur** – außer es [baut um](#umbau), dann sagt die Vorschau das ausdrücklich:

- neue Mappentypen und Ansichten,
- neue Felder und Register bei vorhandenen Mappentypen,
- neue [Vorgaben](#vorgaben) und Vorlagen; unveränderte Vorgaben bekommen die neue Fassung,
- neue Fassungen der **Ansichten** des Pakets – nur für Ansichten, die noch so sind, wie das Paket sie angelegt hat (#1125).

Es **löscht nichts** und **überschreibt nichts**, was du selbst geändert hast: Hast du einen Mappentyp umbenannt, Felder ergänzt oder eine Ansicht gelöscht, bleibt das so.

**Ansichten des Pakets** (#1125): Unter **Ansichten** sagt die Vorschau je vorhandener Ansicht, was geschieht:

- „wird durch die neue Fassung im Paket ersetzt“ – du hast sie nicht geändert. Es bleibt dieselbe Ansicht (Links, Rechte an der Ansicht, Platz im Baum), nur Mappentypen, Bedingungen, Name und Beschreibung kommen aus dem Paket.
- „von dir geändert, bleibt so“ – du hast sie umbenannt, Bedingungen oder Mappentypen geändert. Willst du trotzdem die Fassung des Pakets, setze **Trotzdem durch die Fassung im Paket ersetzen**.
- „weicht von der Fassung im Paket ab und bleibt so“ – die Ansicht kam mit einer älteren Ablago-Version, Ablago weiß nicht, ob du sie geändert hast. Auch hier kannst du sie ersetzen lassen. Nach einem [Umbau](#umbau) ist das oft sinnvoll: Die alte Ansicht „Versicherungen“ zeigt danach alle Verträge, die neue Fassung nur Versicherungen. Den [Archivmodus](archiv.md#archivmodus-aus-einem-paket) eines vorhandenen Mappentyps ändert ein Update nie – weder kürzer noch länger, weder an noch aus.

**Neue Id (Umzug, #1084):** Benennt ein Paket seine Id um – etwa die Zusatzsprachen der Texterkennung von `texterkennung_fra` auf `texterkennung.fra` –, erscheint das als gewöhnliches Update des installierten Pakets. Die Vorschau sagt „Das Paket heißt jetzt …“. Danach steht es unter der neuen Id da, mit allen Mappentypen, Mappen, Einstellungen und Daten; ein zweites Paket entsteht nicht. Das geht nur aus derselben Quelle und vom selben Herausgeber. Eine Id mit Punkt heißt übrigens immer: Das Paket **ergänzt** das Paket vor dem Punkt.


## Umbau: Mappentypen ziehen in ein anderes Paket { #umbau }

Manche Updates **bauen um** (#1041): Mappentypen ziehen in ein anderes Paket, mit allen Mappen und Werten. Beispiel: Haushalt 2.0 gibt *Vertrag* und *Versicherung* an das Paket *Verträge* ab – deine Verträge und Versicherungen landen danach im einen Mappentyp *Vertrag*, eine Versicherung mit der Vertragsart „Versicherung“. Solche Updates sind **Major-Versionen** (die erste Zahl steigt) und stehen im CHANGELOG.

Die Vorschau zeigt unter **Umbau** je Schritt:

- ob ein Mappentyp **übernommen** wird („Vertrag wird zu Vertrag“ – gleicher Mappentyp mit denselben Mappen, Rechten, Ansichten und Direktlinks, nur jetzt aus dem neuen Paket) oder in einem anderen **aufgeht** („Versicherung geht in Vertrag auf“) und wie viele Mappen umziehen,
- welche Werte in welche Felder kommen und wie viele davon nicht genau passen – etwa eine Kündigungsfrist „3 Monate zum Ende der Laufzeit“, aus der der Zeitraum „3 Monate“ wird,
- was **in die Notiz** kommt: Werte ohne passendes Feld stehen danach in einer Notiz an der Mappe. **Es geht nichts verloren.**
- **Rückfragen** zu Feldern, die **du** am alten Mappentyp angelegt oder geändert hast: als eigenes Feld behalten, in die Notiz oder in ein Feld des neuen Typs. Vorausgewählt ist ein Vorschlag; ein Update überfährt deine Änderungen nie still.
- was sich an **Rechten** ändert: Die Rechte-Regeln des alten Mappentyps gelten für die umgezogenen Mappen weiter (sie stehen danach vorn in den Regeln des neuen Typs, „Versicherung: …“, für Mappen mit „Übernommen aus = haushalt:versicherung“). War der alte Mappentyp für [KI-Dienste](#ki-dienste) nicht zugelassen, ist es der neue danach auch nicht. **Ein Umbau macht Mappen nie für mehr Personen oder Dienste lesbar.**
- **Auswahl → Verweis** (#1125): Wird aus einer Auswahl ein Verweis – etwa die „Art“ eines Haushalt-Vertrags („Strom“) zur Vertragsart –, sucht Ablago die Mappe mit diesem Titel (die Vertragsart „Strom“). Werte, zu denen es keine oder mehrere solche Mappen gibt, nennt die Vorschau: Das Feld bleibt dort leer, der Wert steht in der Notiz. **Ablago legt dafür nie Mappen an** – lege die fehlende Vertragsart danach selbst an und wähle sie an der Mappe.
- **Ansichten** über den alten Mappentyp (#1125): Geht er in einem anderen auf, zeigt eine Ansicht wie „Versicherungen“ danach **alle** Mappen des neuen Typs, also alle Verträge – die Vorschau sagt, wie viele dazukommen. Fragt eine Ansicht ein Feld ab, das es danach nicht mehr gibt, nennt die Vorschau es auch; die Bedingung trifft dann nicht mehr zu. Gehört die Ansicht zu einem Paket, bringt dessen nächstes Update meist eine passende Fassung (siehe [Ansichten des Pakets](#aktualisieren)); sonst passe sie selbst an.

Bestätigen darf nur, wer **Gesamte Verwaltung** hat, mit einer erneuten Anmeldung. **Vorher sichern** ist vorausgewählt: Ablago startet eine [Sicherung](sicherung.md) und baut erst danach um. Der Umbau läuft **ganz oder gar nicht** – bricht er ab, ist nichts verändert, und die Meldung sagt das. Danach:

- Jede Mappe hat in der **Historie** den Eintrag „Umgebaut durch Paket Verträge 1.0.0“ mit vorher und nachher; das Systemprotokoll nennt jeden Schritt.
- Verweisfelder, Ansichten, Rechte-Regeln und Automatisierungen zeigen auf den neuen Mappentyp, Direktlinks auf Mappen funktionieren weiter (die Mappen behalten ihre Id).
- [Archivmodus](archiv.md) und Fristen bleiben. Würde der Archivmodus durch den Umbau lockerer, lehnt die Vorschau ihn ab – schalte ihn dann vorher am neuen Mappentyp mindestens genauso streng ein.
- Liegen Mappen des alten Typs im Papierkorb, bleibt er als eigener Mappentyp stehen.

Mehrere Pakete mit Umbau aktualisierst du **einzeln**, jedes mit seiner eigenen Vorschau – im gemeinsamen Ablauf lehnt Ablago sie ab.

## Text in Verweise umwandeln { #text-in-verweise-umwandeln }

Manche Pakete hatten früher ein **Textfeld**, wo eigentlich ein **Verweis** hingehört – zum Beispiel „Halter: Lena Muster“ am Fahrzeug statt eines Verweises auf die **Person** Lena Muster. Eine neuere Version des Pakets bringt dafür ein Verweisfeld mit und sagt, aus welchem Textfeld es sich füllen lässt. **Updates ändern nichts heimlich:**

- Das Update legt das Verweisfeld **zusätzlich** an. Das alte Textfeld bleibt mit allen Werten, nichts wird umgeschrieben. Die Vorschau des Updates sagt schon, wie viele Angaben sich danach umwandeln lassen.
- Danach steht im Paket unter **Text in Verweise umwandeln**, was offen ist, etwa „Fahrzeug – Halter: 3 Angaben in „Halter“ (Text) können Verweise auf Person werden“.

**Vorschau …** zeigt je Name einen Vorschlag, den du in jeder Zeile ändern kannst:

- **vorhandene Person:** gleicher Name, ohne Groß- und Kleinschreibung und Leerzeichen („lena muster“ = „Lena Muster“, auch „Muster Lena“). Passen mehrere, steht das dabei – wähle dann die richtige.
- **Neu anlegen:** legt eine Person mit Vor- und Nachname an. Vorgeschlagen, wenn der Text wie ein Name aussieht.
- **Überspringen:** Der Text bleibt, z. B. bei „Familie“ oder „Auto MU-ST 123“.

Darf ein Feld mehrere Verweise haben (Inhaber eines Kontos, Versicherte), teilt Ablago den Text an „und“, Komma, Schrägstrich oder „&“: „Lena und Tom Muster“ wird zu „Lena Muster“ und „Tom Muster“. Umgewandelt wird eine Mappe nur, wenn **jeder** ihrer Namen eine Person bekommt.

**Ausgelassen** werden Mappen, die du nicht bearbeiten darfst, Mappen im [Archivmodus](archiv.md) innerhalb der Aufbewahrungsfrist und Mappen, deren Verweis schon gesetzt ist. Die Vorschau nennt jede mit Grund.

**Umwandeln** setzt den Verweis und leert das Textfeld. Jede Änderung steht in der **Historie** der Mappe („Paket-Update: Text in Verweis umgewandelt“). Außerdem:

- Das alte Textfeld ist keine Pflicht mehr. Ist es leer, zeigt die Ablage es in der Mappe nicht mehr.
- Titel-Vorlage und Trefferlisten zeigen den Verweis statt des Texts, das Verweisfeld rückt an die Stelle des Textfelds. Mappen, die du übersprungen hast, zeigen dort weiter ihren Text.

**Rückgängig …** unter „Bisherige Umwandlungen“ nimmt einen ganzen Vorgang zurück: Text zurück, Verweis leer, neu angelegte Personen in den Papierkorb, sofern nichts anderes mehr auf sie verweist, Mappentyp wie vorher. Was seit der Umwandlung jemand geändert hat, bleibt und wird genannt. Die Vorgänge sind Teil der [Sicherung](sicherung.md).

Für Paket-Autoren steht das Format (`aus_text`) in den [Regeln der Registry](https://github.com/motom001/dms-registry/blob/main/REGELN.md#text-in-verweis-umwandeln).

## Entfernen

**Entfernen** löscht die Mappentypen, Ansichten und Wortlisten des Pakets und seinen Eintrag – und **unveränderte Beispiel-Mappen** samt ihren Dokumenten (siehe [Beispiele](#beispiele)) sowie unbenutzte [Vorgaben](#vorgaben). Das geht nur,

- solange es **sonst keine Mappen** dieser Mappentypen gibt (auch nicht im Papierkorb) und
- **kein anderes Paket** davon abhängt.

Sonst nennt Ablago die Gründe – auch jedes Beispiel, das du geändert hast; das löschst du vorher selbst, wenn du es nicht mehr brauchst. Geänderte Beispiele in Mappentypen anderer Pakete (etwa eine „Organisation“ aus *Basis*) bleiben stehen; Ablago nennt sie nach dem Entfernen.

Ein **Sprachpaket** hat keine Mappentypen. Hat jemand seine Sprache gewählt oder ist sie die Sprache der Installation, fragt Ablago nach, bevor es entfernt – siehe [Sprachen → Sprachpakete](sprachen.md#sprachpakete).

Liefert das Paket Volltext oder wandelt es Dateien um (z. B. **Office und E-Mail**, **Bildformate**), warten danach keine Dokumente mehr darauf: Ohne Text steht am Dokument wieder, dass es für diesen Dateityp kein Paket gibt; hatte es schon Text, bleibt der Text stehen.

## Einstellungen

Manche Pakete brauchen Einstellungen – etwa Regeln, nach denen sie Post zuordnen, oder ein Zugangsschlüssel für einen Dienst. Das Paket **beschreibt** sie nur; Ablago baut daraus ein Formular, prüft die Werte und speichert sie. Du findest es unter **Werkbank → Pakete → *Paket* → Reiter „Einstellungen“** – den Reiter gibt es nur bei Paketen, die Einstellungen haben.

- **Abschnitte** mit Feldern und **Listen** gleich aufgebauter Einträge (z. B. eine Regel je Eintrag) mit **+ Eintrag**, Löschen und – wenn das Paket es erlaubt – Sortieren mit ↑/↓.
- **Felder** wie bei den Mappentypen: Text, mehrzeiliger Text, Zahl, Ja/Nein, Datum, Auswahl, Mehrfachauswahl und **Verweise** auf einen Mappentyp, ein Feld eines Mappentyps, einen Benutzer, eine Rolle oder eine Ansicht. Verweise wählst du aus Listen; gespeichert wird die feste Id, nicht der Name – Umbenennen schadet also nicht.
- **Dienst-Adresse** (z. B. eines KI-Dienstes): Die einzige Adresse, zu der das Paket außer den festen Adressen aus seinem Manifest ins Netz darf – siehe [Dienst-Adresse](#dienst-adresse). Sie ist nie voreingestellt; im leeren Feld steht höchstens ein Beispiel. Beim Speichern einer neuen oder geänderten Adresse fragt Ablago nach und zeigt, wohin Daten gehen.
- **Geheimnisse** (z. B. Zugangsdaten) verschlüsselt Ablago mit seinem Schlüssel (siehe [Verschlüsselung](verschluesselung.md)). Nach dem Speichern zeigt es sie nie wieder an, nur **gesetzt** mit **Ändern** und **Löschen**.
- Beim **Speichern** prüft Ablago Mappentyp, Pflichtfelder, Auswahlwerte und ob Verweise existieren, und zeigt Fehler am Feld.
- **Aktionen** des Pakets erscheinen als Knöpfe (z. B. „Regeln jetzt anwenden“), die Antwort des Pakets steht darüber. Eine Zeitgrenze verhindert, dass ein Knopf hängt.
- Der **Status** (letzter Lauf, Meldungen) kommt vom Paket selbst und ist schreibgeschützt.

**Lebenszyklus:**

- **Installieren** setzt die Vorgaben. Pflichtfelder ohne Vorgabe fragt der [Ablauf](#mehrere-pakete-in-einem-schritt-installieren) gleich mit ab; wählst du **Später ausfüllen**, steht das Paket auf **Einstellungen nötig**, die Übersicht der Werkbank nennt es als Aufgabe, und es läuft erst danach.
- **Aktualisieren:** Neue Felder bekommen ihre Vorgabe, vorhandene Werte bleiben. Felder, die die neue Version nicht mehr kennt, werden entfernt – die Vorschau vor dem Update nennt sie.
- **Entfernen** fragt, ob die Einstellungen für eine spätere Neuinstallation **bleiben** sollen (Standard: nein).

Die Einstellungen sind **Teil der Sicherung**; Geheimnisse bleiben dabei verschlüsselt und werden beim Schlüsselwechsel mit umgeschlüsselt. Über die API v1 sind sie nicht lesbar; das Paket selbst bekommt sie über den Paket-Läufer. Das Protokoll vermerkt „Einstellungen von Paket … geändert (Felder …)“ – nie die Werte von Geheimnissen. Nur Administratoren sehen und ändern Einstellungen.

## Aktionen im Menü „Mappe“ { #aktionen-im-menue-mappe }

Pakete können Aktionen ins Menü **Mappe ▾** passender Mappen bringen, z. B. **Vorlage hinzufügen** am Vertrag oder **Als bezahlt markieren** an der Rechnung. Jede Aktion nennt im Manifest, an welchen Mappentypen sie steht und **welche Rechte sie am Ende braucht**: lesen, Dokument hinzufügen, ändern, Mappen anlegen, herausgeben (wie Herunterladen, Recht E).

- **Vor der Installation:** Die Vorschau nennt unter „Aktionen im Menü „Mappe““ jede Aktion mit Mappentypen und Rechten. Kommt mit einem Update eine Aktion dazu oder braucht sie andere Rechte, steht **neu** daran, und die Rechte des Codes sind neu zu bestätigen.
- **Wer sie sieht:** Nur Personen, die an der Mappe genau diese Rechte haben – und nur, wenn das Paket sie auch hat (seine bestätigten Rechte, die Regeln für die Rolle „Paket“, „Pakete“ am Mappentyp). Ein Paket mit Netz (KI-Dienst) bietet an Mappentypen, die nicht für KI-Dienste zugelassen sind, keine Aktion an.
- **Im Auftrag der Person:** Das Paket handelt nur in der Schnittmenge aus angekündigten Rechten, Rechten der Person und Rechten des Pakets; Ablago prüft sie bei jedem Schritt neu. Während einer Aktion sieht das Paket nur diese Mappe (und ihre Dokumente, wenn es Dokumente lesen darf) – nicht über sein Dienstkonto. Dialoge sind nur Daten (Text, Auswahl, Haken, Textfeld, Datum), nie mit Passwort-Eingabe; der Paketname steht immer im Kopf.
- **Ausschalten:** **Werkbank → Pakete → *Paket*** zeigt unter „Aktionen im Menü „Mappe““ jede Aktion mit ihren Rechten; ohne Haken steht sie bei niemandem im Menü. Die **eingebauten** Aktionen (Aufgabe vergeben, Erinnern, Per E-Mail versenden, Als PDF exportieren, Link kopieren) blendest du an einer Stelle aus: **Werkbank → Pakete**, Abschnitt **Menü „Mappe“**. Ausblenden ist Ordnung, kein Recht – die Wege über die API bleiben.
- **Nachvollziehbar:** Jede Ausführung steht in der Historie der Mappe (Person und Paket, Gruppe „Aktionen von Paketen“) und im Verlauf des Paket-Läufers („Aktion „…“ für …, Schritt 1“); das Protokoll nennt Paket, Aktion und Mappe, nie Inhalte.

Höchstens eine Aktion je Person und Paket läuft gleichzeitig; ein Schritt wartet höchstens 30 Sekunden auf das Paket. Die Schalter sind Teil der Sicherung (Einstellung `mappenaktionen`).

## Pakete mit Code

Manche Pakete bringen **Code** mit – etwa eine eigene Texterkennung oder Regeln, die neue Post zuordnen. Der Code reagiert auf Ereignisse (neue Post, hochgeladenes Dokument, fertige Texterkennung, fertiger Volltext, geänderte Einstellungen) und auf die **Aktionen** im Reiter „Einstellungen“. Ablago führt ihn im **Paket-Läufer** aus:

- **Abgeschottet:** Der Code ist WebAssembly und läuft in einem eigenen Prozess von Ablago, ohne Zugriff auf Dateien, Schlüssel oder Datenbank. Netzwerk und Internet erreicht er nur unter den Adressen, die das Paket angibt, und unter der [Dienst-Adresse](#dienst-adresse), die du in seinen Einstellungen einträgst – meist gar nicht.
- **Nur bestätigte Rechte:** Vor der Installation zeigt Ablago, was der Code darf – welche Mappentypen er lesen bzw. anlegen und ändern darf, ob er Dokumente lesen oder schreiben darf, ob er aufs Netzwerk oder Internet zugreifen darf und auf welche Ereignisse er reagiert (siehe [Rechte eines Pakets](#rechte-eines-pakets) und [Ereignisse](#ereignisse)). Erst wenn du das bestätigst, installiert Ablago. Kommen mehrere Pakete mit Code zusammen (etwa eine Zusatzsprache samt Texterkennung), stehen alle Rechte aller Pakete auf einer Seite und du bestätigst sie **einmal** (siehe [Mehrere Pakete in einem Schritt](#mehrere-pakete-in-einem-schritt-installieren)). Will ein **Update** mehr Rechte oder andere Adressen, fragt Ablago erneut.
- **Dienstkonto:** Für jedes Paket mit Code legt Ablago ein Dienstkonto „Paket *Name*“ an. Mit ihm arbeitet der Code über die API; die Historie zeigt deshalb, was ein Paket geändert hat. Dienstkonten erscheinen nicht unter **Benutzer**, melden sich nie an und können **nie löschen** – auch nicht mit Rechten auf alle Mappentypen. Benutzer und Passwörter sehen sie nicht.
- **Grenzen:** Jeder Aufruf hat höchstens 256 MB Speicher und 2 Minuten Zeit; es laufen höchstens zwei Aufrufe gleichzeitig. Was die Grenzen reißt, bricht ab, ohne Ablago zu stören.
- **Wiederholen:** Ereignisse merkt sich Ablago. Scheitert ein Aufruf, versucht es der Läufer nach 1, 5, 30, 120 und 360 Minuten erneut und gibt dann auf. Während einer Wartung (z. B. beim Wiederherstellen) ruht der Läufer.

**Werkbank → Pakete → *Paket*** zeigt im Abschnitt **Paket-Läufer** den Stand, die letzten Aufrufe mit Dauer und Speicher, offene und aufgegebene Ereignisse und das Protokoll des Pakets – mit seinen [Netzaufrufen](#netzaufrufe). Meldungen stehen zusätzlich im [Protokoll](fehlersuche.md#protokoll) von Ablago. Der **Stand** ist einer von diesen:

| Stand | Bedeutung |
|---|---|
| **startet …** | Der Läufer startet oder lädt das Modul des Pakets – etwa direkt nach der Installation. Die Seite fragt von selbst nach. |
| **bereit – wartet auf das erste Ereignis** | Das Modul ist geladen; das Paket wurde aber noch nie aufgerufen. Es läuft, sobald ein Ereignis kommt, auf das es reagiert, oder du eine Aktion auslöst. |
| **bereit** | Das Modul ist geladen und wurde schon aufgerufen. |
| **abgestürzt um … – startet neu …** | Der Läufer-Prozess ist abgestürzt. Ablago startet ihn nach einer kurzen Pause selbst neu (bei wiederholten Abstürzen wartet es länger, höchstens eine Minute). Ereignisse gehen dabei nicht verloren. |
| **neu gestartet nach Absturz um …** | Der Läufer läuft wieder; die Zeit nennt den letzten Absturz. Die Ursache steht im Protokoll von Ablago. |
| **pausiert (Wartungsmodus)** | Während einer Wartung ruht der Läufer. |
| *Fehlermeldung in Rot* | Das Modul ließ sich nicht laden (z. B. fehlt der Code nach einer Wiederherstellung) – das Paket neu installieren. |

Schlägt ein **Update** fehl, bleibt die alte Version mit ihrem alten Code installiert. Ein Paket darf höchstens **128 MB** groß sein – das gilt für das Archiv beim Herunterladen, Hochladen und in der Sammeldatei ebenso wie für alle Dateien unter `code/` zusammen. Ist ein Paket größer, nennt Ablago Größe und Grenze und lädt es gar nicht erst herunter.

**Entfernen** beendet den Code, löscht seine offenen Ereignisse und seinen Speicher und schaltet das Dienstkonto ab.

!!! note "Volltext aus einem Paket"
    Setzt ein Paket den Volltext eines Dokuments (z. B. das Paket **Texterkennung**), vermerkt die Historie „Volltext gesetzt“ mit dem Namen des Pakets, und Ablago überschreibt diesen Text nicht.

### Rechte eines Pakets { #rechte-eines-pakets }

Vor der Installation zeigt die Vorschau unter **„Das Paket enthält Code.“** eine Liste der Rechte. Hinter jedem Punkt führt ein **?** zur passenden Stelle hier. **Unter der Liste** steht links der Haken **„Ich erlaube dem Paket diese Rechte.“** – lies erst die Liste, dann setze den Haken. Ohne ihn bleibt **Installieren** gesperrt. Bei einem **Update** mit geänderten Rechten heißt der Haken **„Die Rechte haben sich geändert. Ich erlaube sie.“**; sind die Rechte gleich geblieben, steht dort nur „Die Rechte sind dieselben wie bisher.“

Was nicht in der Liste steht, darf der Code nicht. Benutzer und Passwörter sieht ein Paket nie, und löschen darf es nichts. **Passwörter und andere Geheimnisse** (Passwortfelder, Zugangsdaten von Postfächern und Diensten, Schlüssel, Tokens) bekommt ein Paket mit keinem Recht und keinem Haken – wo eines eingerichtet ist, sieht es nur „eingerichtet: ja/nein“. Eine Einstellung dafür gibt es nicht. Nur die eigenen Einstellungen des Pakets (etwa das Passwort seines Sicherungsziels) bekommt es zum Arbeiten.

#### Mappen lesen { #recht-mappen-lesen }

**„Mappen lesen: *Mappentypen*“** – Der Code darf Mappen dieser Mappentypen lesen, mit allen Feldern und Verweisen. **„alle Mappentypen“** heißt jede Mappe (außer Benutzern). Stammt ein Mappentyp aus einem anderen Paket, steht dessen Kennung in Klammern dahinter, z. B. „Organisation (basis)“; **Post**, **Ablageort** und **Rolle** bringt Ablago selbst mit.

#### Mappen anlegen und ändern { #recht-mappen-anlegen-und-andern }

**„Mappen anlegen und ändern: *Mappentypen*“** – Der Code darf Mappen dieser Mappentypen anlegen und ihre Felder ändern; lesen darf er sie damit auch. Löschen darf ein Paket nie. Jede Änderung steht in der Historie der Mappe mit dem Dienstkonto „Paket *Name*“.

#### Dokumente lesen oder Volltext schreiben { #recht-dokumente }

- **„Dokumente lesen“** – Der Code darf die Dokumente in den Mappen lesen, die er lesen darf: die Datei, den Volltext und die Seiten als Bild.
- **„Dokumente lesen und Volltext schreiben“** – zusätzlich darf er dort Dokumente hochladen und ersetzen und den Volltext setzen, etwa für eine eigene Texterkennung.

Braucht ein Paket nur den Volltext bestimmter Dateitypen (z. B. Word oder E-Mails), genügt seit Version 0.145 **„Dokumente lesen“** zusammen mit dem Recht [Volltext liefern](#recht-volltext) – ohne Schreibrecht auf Dokumente.

Steht keins von beiden in der Liste, sieht der Code keine Dokumente.

#### Vektoren zu Dokumenten { #recht-vektoren }

**„Vektoren zu Dokumenten speichern und ähnliche Dokumente finden (dms:vektoren)“** – Der Code darf zu Dokumenten, die er lesen darf, einen **Vektor** ablegen: eine Liste von Zahlen, die den Inhalt des Volltexts beschreibt. Ablago vergleicht diese Vektoren und zeigt damit [ähnliche Dokumente](#aehnlichkeit) an der Mappe und in der Suche. Außerdem fragt die Suche das Paket nach dem Vektor des Suchbegriffs. Ablago selbst rechnet dabei nichts – es speichert und vergleicht nur, was das Paket liefert. Dokumente, Mappen und Volltext ändern darf der Code mit diesem Recht nicht; ähnliche Dokumente sieht jeder nur aus Mappen, die er lesen darf.

#### Zugriff auf Netzwerk und Internet { #recht-netzwerk-und-internet }

- **„kein Zugriff auf Netzwerk und Internet“** – Der Code erreicht weder Geräte in deinem Heimnetz noch das Internet. Das ist der Normalfall: Die Daten bleiben in Ablago.
- **„Zugriff auf Netzwerk/Internet nur zu: *Adressen*“** – Der Code darf nur diese Adressen erreichen (immer `https://`, auch Pfade darunter), z. B. einen Dienst im Internet oder ein Gerät in deinem Netzwerk. Alles andere sperrt der Paket-Läufer, auch Weiterleitungen. Wozu das Paket die Adressen braucht, erklärt sein README – was du dorthin schickst, verlässt dein Ablago.

Will ein Update andere Adressen, fragt Ablago erneut.

- **„… zu: der Adresse aus der Einstellung „*Name*“ (trägst du ein und bestätigst sie)“** – Das Paket bringt keine feste Adresse mit, sondern fragt nach einer [Dienst-Adresse](#dienst-adresse), etwa der deines KI-Dienstes. Erst wenn du sie in den Einstellungen einträgst und bestätigst, erreicht der Code genau diese Adresse.

#### Fragen an die Ablage beantworten { #recht-antworten }

**„Fragen an die Ablage beantworten („Frag deine Ablage“) – nur aus Ausschnitten, die Ablago mitgibt (dms:antworten)“** – Mit diesem Recht erscheint in der Ablage das Feld [Frag deine Ablage](#frag-deine-ablage). Das Paket bekommt je Frage nur die Frage, den bisherigen Chat und wenige Ausschnitte, die Ablago selbst herausgesucht hat – **mit den Rechten des Fragenden**. Es liest dabei nichts selbst aus der Ablage (dafür bräuchte es die Rechte oben) und kann nichts ändern: Ablago zeigt nur seinen Text und prüft die Quellen.

#### Felder aus Dokumenten vorschlagen { #recht-erkennen }

**„Felder aus Dokumenten vorschlagen („Aus Dokument ausfüllen“) – nur aus dem Text, den Ablago mitgibt (dms:erkennen)“** – Das Paket kann statt der eingebauten Erkennung die Felder beim Knopf **Aus Dokument ausfüllen** vorschlagen, wenn du es wählst (siehe [Erkennung durch ein Paket](#erkennung-durch-ein-paket)). Es bekommt dabei nur den Text des Dokuments und die Beschreibung der Felder – keine Rechte an Mappen oder Dokumenten. Was es liefert, prüft Ablago und zeigt es nur als Vorschlag.

#### Mappentyp vorschlagen { #recht-klassifizieren }

**„Mappentyp vorschlagen („Wohin gehört das?“) – nur aus dem Anfang des Dokuments und der Liste der Mappentypen, die Ablago mitgibt (dms:klassifizieren)“** – Das Paket schlägt auf der Seite *Dokument übernehmen* vor, zu welchem Mappentyp neue Post gehört (siehe [Wohin gehört das? durch Pakete](#wohin-gehoert-das)). Es bekommt nur den Anfang des Dokuments und Name, Kurzbeschreibung und „Woran man ihn erkennt“ der Mappentypen, die in Frage kommen und für KI-Dienste zugelassen sind – keine Mappen. Was es liefert, prüft Ablago und zeigt es nur als Vorschlag.

#### Hinweise an Mappen setzen { #recht-hinweise }

**„Setzt Hinweise an Mappen, die es schreiben darf (z. B. „Die Positionen ergeben 118,40 €“) – nur Text, immer mit dem Namen des Pakets; Speichern hindern sie nie (dms:hinweise)“** – Seit Version 0.231. Das Paket kann an Mappen, die es [anlegen und ändern](#recht-mappen-anlegen-und-andern) darf, kurze Hinweise setzen und wieder entfernen, etwa wenn die Positionen einer Rechnung nicht zum Betrag passen. Sie stehen gelb in der Hinweiszeile über den Registern, immer mit dem Namen des Pakets davor – nie rot und nie so, dass sie wie eine Meldung von Ablago aussehen. Ablago nimmt nur Text an: kein HTML, kein Markdown, keine Links, höchstens 300 Zeichen und höchstens 3 Hinweise je Paket und Mappe. Ein Hinweis ändert die Mappe nicht (kein „zuletzt geändert“, kein Eintrag in der Historie) und hält niemanden vom Speichern ab. Entfernst du das Paket, gehen seine Hinweise mit.

#### Berechnete Felder { #recht-berechnet }

**„Berechnet Felder, die nur dieses Paket schreibt (in Ablago nur lesbar): *Mappentyp: Felder*“** – Seit Version 0.231. Die genannten Felder sind in der Mappe nur lesbar; ihren Wert schreibt nur das Paket (siehe [Berechnete Felder](mappentypen.md#berechnete-felder)). Dafür braucht es das Recht [Mappen anlegen und ändern](#recht-mappen-anlegen-und-andern) auf den eigenen Mappentyp.

Hat ein Paket berechnete Felder oder setzt es Hinweise, steht zusätzlich da: **„Schreibt Werte und Hinweise, die alle sehen, die die Mappe lesen – auch, wenn das Paket sie aus Mappen errechnet, die nicht jeder sehen darf“**. Ein Paket mit Leserecht auf andere Mappentypen könnte so etwas aus Mappen, die eine Person nicht sehen darf, an eine Mappe schreiben, die sie sehen darf. Verhindern lässt sich das technisch nicht – das gilt für jedes Schreibrecht. Bestätige solche Pakete deshalb nur, wenn du ihnen das zutraust; welche Mappen ein Paket liest, steht unter [Mappen lesen](#recht-mappen-lesen).

#### Inhalte übersetzen { #recht-uebersetzen }

**„Inhalte übersetzen – auf Knopfdruck bekommt das Paket einen einzelnen Text (Feld, Notiz oder Volltext), den die Person lesen darf, und gibt die Übersetzung zurück; ändern oder speichern kann es nichts (dms:uebersetzen)“** – Seit Version 0.204. Das Paket übersetzt, wenn jemand **Übersetzung anzeigen** drückt (siehe [Sprachen → Inhalte übersetzen](sprachen.md#inhalte-ubersetzen)). Es bekommt dabei nur diesen einen Text und die Sprachen – keine Rechte an Mappen oder Dokumenten. Darf das Paket außerdem ins Netz, nimmt Ablago es nur, wenn du es ausdrücklich wählst und den Datenabfluss bestätigst.

#### Texterkennung übernehmen { #recht-texterkennung }

**„Texterkennung für Scans und Bilder übernehmen – Ablago meldet Dokumente ohne Text und zeigt „wartet auf Texterkennung“, bis das Paket den Volltext schreibt (dms:texterkennung)“** – Das Paket ist dann die [Texterkennung](texterkennung.md) von Ablago: Der Kern liest selbst nur die Textebene von PDFs und gibt Scans und Bilder an das Paket. Am Dokument steht so lange „wartet auf Texterkennung (Paket …)“. Das Recht allein gibt keinen Zugriff auf Dokumente; den Volltext schreiben darf das Paket nur mit [Dokumente lesen und Volltext schreiben](#recht-dokumente).

#### Dateien umwandeln { #recht-umwandeln }

**„Dateien umwandeln, die Ablago nicht selbst lesen kann – das Paket liest die Originaldatei und liefert eine Fassung (PDF, PNG oder JPEG) für Vorschaubild und Volltext; das Original bleibt unverändert (dms:umwandeln): TIFF, WebP, …“** – Seit Version 0.137 liest Ablago selbst nur PDF, JPEG und PNG. Für andere Dateitypen – hinter dem Recht stehen die, für die das Paket zuständig sein will – bekommt das Paket die Datei (Ereignis [Datei umwandeln](#ereignis-datei-umwandeln)) und gibt eine **umgewandelte Fassung** zurück, z. B. ein mehrseitiges TIFF als PDF. Daraus macht Ablago das Vorschaubild und den Volltext wie bei einem PDF oder Foto (siehe [Andere Dateitypen](texterkennung.md#andere-dateitypen)). Das Dokument selbst bleibt die Originaldatei; ändern, ersetzen oder löschen kann das Paket damit nichts. Dafür braucht es außerdem [Dokumente lesen](#recht-dokumente) (die Originaldatei).

#### Volltext liefern { #recht-volltext }

**„Volltext für Dateien liefern, die Ablago nicht selbst lesen kann – das Paket liest die Datei und schreibt nur ihren Volltext; Dokumente ändern, ersetzen oder löschen kann es nicht (dms:volltext): Word, Excel, E-Mail, …“** – Seit Version 0.145. Hinter dem Recht stehen die Dateitypen, für die das Paket den Volltext liefert. Für jede solche Datei bekommt es das Ereignis [Datei braucht Volltext](#ereignis-datei-volltext), liest die Datei und schreibt ihren Text – für **genau diese Dateitypen**, für andere Dokumente nicht. Am Dokument steht so lange **„wartet auf Volltext (Paket …)“**; kann das Paket eine Datei nicht lesen (z. B. weil sie mit einem Passwort verschlüsselt ist), steht sein Grund am Dokument. Dafür braucht es außerdem [Dokumente lesen](#recht-dokumente); Schreibrecht auf Dokumente braucht es nicht. Das Paket **Office und E-Mail** nutzt dieses Recht (ab 1.1.0). PDF, JPEG und PNG liest Ablago selbst; Scans erkennt das Recht [Texterkennung übernehmen](#recht-texterkennung).

#### Archivfassung ablegen { #recht-archivfassung }

**„Archivfassung (PDF/A) ablegen – das Paket liest Dokumente mit ihrem Volltext und den Wortpositionen und legt daneben ein durchsuchbares PDF/A ab; das Original bleibt unverändert, ändern, ersetzen oder löschen kann es nichts (dms:archivfassung): PDF, JPEG, PNG, TIFF, …“** – Seit Version 0.149. Hinter dem Recht stehen die Dateitypen, zu denen das Paket eine Archivfassung macht. Für jedes solche Dokument bekommt es das Ereignis [Archivfassung erstellen](#ereignis-datei-archivfassung) – **erst, wenn der Volltext feststeht** –, liest die Datei (bei TIFF und Co. die Lesefassung aus [Dateien umwandeln](#recht-umwandeln)), den Volltext und die **Wortpositionen** (wo jedes Wort auf der Seite steht) und legt ein PDF/A ab. Ablago nimmt nur ein PDF mit PDF/A-Kennung an, das nichts aus dem Netz nachlädt (kein JavaScript, keine Aktionen, keine externen Verweise); sonst steht der Grund am Dokument und unter [Werkbank → Suche und Volltext → Archivfassung](texterkennung.md#archivfassung-pdfa). Dafür braucht es außerdem [Dokumente lesen](#recht-dokumente). Die Archivfassung kommt mit in Sicherung und Vollexport (siehe [Sicherung](sicherung.md)).

#### Sicherung lesen { #recht-sicherung-lesen }

**„Die verschlüsselte Sicherung lesen, um sie außer Haus zu kopieren – kann sie nicht öffnen (kein Schlüssel, keine Inhalte) (dms:sicherung-lesen)“** – Seit Version 0.142. Nach jeder Sicherung bekommt das Paket das Ereignis [Sicherung fertig](#ereignis-sicherung-fertig) und darf **genau diese** Sicherungsdatei in Stücken lesen – verschlüsselt, so wie sie im Sicherungsordner liegt – und ihre schlanken Metadaten (Größe, Prüfsumme, Zeitpunkt, Fingerabdruck des Schlüssels). Den Schlüssel, die Inhalte und andere Dateien des Sicherungsordners bekommt es nie. Es meldet je Sicherung zurück, ob die Kopie angekommen und geprüft ist; das zeigt **Werkbank → Sicherung**. Seit Version 0.158.1 darf sein API-Schlüssel nur lesen – den Stand meldet es in der Antwort auf das Ereignis. Mappen und Dokumente sieht es mit diesem Recht nicht. Siehe [Sicherung außer Haus](sicherung-ausser-haus.md).

### Dienst-Adresse { #dienst-adresse }

Ein Paket wie **KI-Assistent** rechnet nicht selbst, sondern fragt einen Dienst, den du betreibst oder wählst – z. B. **Ollama** auf deinem Heimserver (fertiges Beispiel und Anleitung: [KI lokal betreiben](ki-lokal.md)). Die Adresse dieses Dienstes trägst du in den **Einstellungen** des Pakets ein (Werkbank → Pakete → *Paket* → Reiter „Einstellungen“):

- **Nie voreingestellt.** Im leeren Feld steht höchstens ein Beispiel wie `http://ollama:11434/v1` – gespeichert ist nichts, bis du eine Adresse einträgst.
- **Bestätigen.** Beim Speichern einer neuen oder geänderten Adresse fragt Ablago **„Daten an diese Adresse schicken?“** und nennt sie. Erst mit **Adresse bestätigen und speichern** gilt sie; das Protokoll vermerkt „Dienst-Adresse von Paket … bestätigt“ mit der Adresse.
- **Nur dorthin.** Der Paket-Läufer erlaubt Netz nur zu dieser Adresse und Pfaden darunter (gleicher Rechner, gleicher Port), ohne Weiterleitungen. Weil Dienste im Heimnetz selten HTTPS sprechen, ist hier auch `http://` erlaubt. Zugangsdaten gehören nicht in die Adresse, sondern in ein eigenes Feld (Geheimnis).
- **Betrieb und Hosting dieses Dienstes liegen außerhalb von Ablago.** Läuft er bei dir im eigenen Netz, verlassen die Daten das Haus nicht. Gehört er einem anderen Anbieter, ist das eine **Vertrauensbeziehung zu diesem Dienstleister** – wie beim Hosten von Ablago selbst: Standort, Auftragsverarbeitung, Speicherung, Nutzung zum Training. Diese Entscheidung triffst du mit dem Eintragen und Bestätigen; Ablago hat dafür keinen weiteren Schalter. Den Hinweis zeigt es auch schon in der Vorschau vor der Installation.

### KI-Dienste und Mappentypen { #ki-dienste }

Ein **KI-Paket** – Ablago sagt auch *KI-Dienst* – ist ein Paket mit Code, das **ins Netz darf** (feste Adresse oder [Dienst-Adresse](#dienst-adresse)) und **Inhalte bekommen kann**: Mappen oder Dokumente lesen, Ausschnitte, Text und Dateien vom Kern bekommen (z. B. *Frag deine Ablage*, *Aus Dokument ausfüllen*, *Übersetzung anzeigen*, Vektoren, Volltext) **oder Ereignisse zu Mappen, Dokumenten oder Post abonnieren** – auch ohne weitere Rechte, denn schon ein Ereignis nennt Dateinamen, Ids oder „Für“. Nur die Ereignisse *Sicherung fertig* und *Einstellungen geändert* tragen keinen Inhalt. Pakete, die **ohne Netz** im Haus rechnen – etwa *KI lokal – Ähnlichkeit* oder *Texterkennung* –, sind keine KI-Pakete. Auch die *Kopie außer Haus* nicht: Sie bekommt nur die verschlüsselte Sicherung.

Ein KI-Paket bekommt **nur Inhalte aus Mappentypen, die für KI-Dienste zugelassen sind**:

- **Je Mappentyp:** Werkbank → Mappentypen → *Mappentyp* → Abschnitt **KI-Dienste** → **Darf an KI-Dienste gehen**. Ohne Haken bekommt kein KI-Paket etwas aus diesem Mappentyp – keine Mappen, keine Dokumente, keine Ausschnitte, keine Ereignisse. Das gilt sofort und für alle KI-Pakete.
- **Auf der Seite des Pakets:** Werkbank → Pakete → *KI-Paket* → **KI-Dienst: Mappentypen** zeigt, aus welchen Mappentypen das Paket Inhalte bekommt, und darunter alle Mappentypen zum Zulassen oder Sperren. Bei Paketen, die selbst Mappen lesen, zählen dafür auch ihre Rechte und [Pakete am Mappentyp](berechtigungen.md#pakete-am-mappentyp).
- **Neue Mappentypen sind gesperrt, bis du sie zulässt.** So gehen sensible Mappentypen wie *Gesundheit* nie ungewollt hinaus – auch nicht, wenn ein Paket sie mitbringt oder du einen Mappentyp kopierst. Eine **neue Installation** hat noch nichts zugelassen; nach dem Installieren eines KI-Pakets lässt du auf seiner Seite zu, was es bekommen soll.
- **Nach dem Update** bleiben deine bisherigen Mappentypen wie vorher zugelassen, damit nichts unbemerkt aufhört zu funktionieren. Die [Übersicht](uebersicht.md) weist einmal darauf hin (*Neu: Mappentypen von KI-Diensten ausschließen*), solange KI-Pakete installiert sind; **Verstanden** blendet den Hinweis aus.
- **Benutzer** gehen nie an ein Paket.

**Was gesperrt heißt, je Weg:**

| Weg | Gesperrter Mappentyp |
|---|---|
| Lesen über die API (Mappen, Dokumente, Volltext, Suche, Ähnliche) | Das Paket sieht den Mappentyp nicht – wie bei [Pakete am Mappentyp](berechtigungen.md#pakete-am-mappentyp). |
| Ereignisse (z. B. *Volltext fertig*, *Dokument hochgeladen*, Mappen-Ereignisse) | Gehen nicht an das Paket, auch nicht Ids oder Dateinamen; das Protokoll vermerkt „Ereignis nicht an Paket zugestellt“. |
| Aufträge (Volltext, Umwandeln, Archivfassung) und Nachberechnung der Vektoren | Gehen nicht an das Paket; das Dokument wartet nicht, sondern ist ausgelassen. Liegt dieselbe Datei auch in einem zugelassenen Mappentyp, geht der Auftrag (Umwandeln, Archivfassung) über dieses Dokument – das Paket erfährt vom gesperrten nichts. |
| Frag deine Ablage | Keine Ausschnitte aus diesem Mappentyp, auch keine Titel verknüpfter Mappen daraus. |
| Aus Dokument ausfüllen | Ist der Ziel-Mappentyp oder der eines Quelldokuments gesperrt, geht nichts an das Paket; die eingebaute Erkennung übernimmt mit Hinweis. |
| Übersetzung anzeigen | Abgelehnt mit Hinweis – nichts geht an das Paket. |
| Wohin gehört das? (Mappentyp vorschlagen) | Ein gesperrter Mappentyp steht nicht in der Liste, die an das Paket geht – weder Name noch Beschreibung –, und ein Vorschlag dafür wird abgelehnt. Liegt das Dokument selbst in einem gesperrten Mappentyp (etwa *Post*), geht an kein Paket etwas – hier auch nicht an Pakete ohne Netz wie *KI lokal – Ähnlichkeit*. |

Nicht betroffen: Suchbegriffe, die für die Ähnlichkeitssuche an ein Vektor-Paket gehen, gehören zu keinem Mappentyp.

### Netzaufrufe im Protokoll { #netzaufrufe }

Jeden Aufruf eines Pakets ins Netz schreibt der Paket-Läufer ins **Protokoll des Pakets** (Werkbank → Pakete → *Paket* → Paket-Läufer → **Protokoll: Ausgaben und Netzaufrufe**): Zeit, Methode, **Host** (mit Port, ohne Pfad, Query und Zugangsdaten), Bytes **hin** und **zurück** und den Status, etwa „Netz: 12 × PUT cloud.example.org – 201, 3,4 MB hin, 2 KB zurück“. Gleiche Aufrufe kurz hintereinander (innerhalb einer Minute) stehen in einem Eintrag, damit z. B. Teile-Uploads der Kopie außer Haus das Protokoll nicht fluten.

- **Abgelehnte** Aufrufe (Adresse weder im Paket noch als Dienst-Adresse bestätigt, oder eine Methode, die nicht nur aus Großbuchstaben besteht – im Protokoll dann „?“) stehen als **Warnung** darin – hinaus ging dabei nichts.
- Im [Protokoll](fehlersuche.md#protokoll) von Ablago steht je Ereignis bzw. Aktion **eine Zeile** „Paket *id*: Netzaufrufe“ (Stufe *info*) mit der Summe: Anzahl, abgelehnte, Hosts, Bytes hin und zurück.
- **Nie Inhalte und keine Köpfe:** weder was geschickt wurde noch die Antwort, keine Pfade, keine Query, keine Schlüssel.

So prüfst du ein Paket, dem du vertraut hast: wann es wie viel an welchen Dienst geschickt hat.

Wie **lange** die Netzaufrufe dauern, steht darunter unter **Externe Dienste** (letzte Stunde oder 24 Stunden): Mittel, p50, p95, Zeit bis zur ersten Antwort, Fehler, Zeitüberschreitungen, Daten und – bei einem KI-Dienst – Token. Der Läufer misst das selbst und gibt es mit dem Ergebnis zurück; mehr unter [Systemzustand → Externe Dienste](speicherplatz.md#externe-dienste), Kosten und Budget unter [KI-Kosten](speicherplatz.md#ki-kosten).

### Erkennung durch ein Paket { #erkennung-durch-ein-paket }

**Aus Dokument ausfüllen** (Knopf in der Mappe) nutzt normalerweise die **eingebaute Erkennung** – Muster für E-Mail, Telefon, Datum, Betrag und Ähnliches, ohne KI. Ein Paket mit dem Recht [Felder aus Dokumenten vorschlagen](#recht-erkennen) – etwa ein KI-Assistent über Ollama – erkennt auch Freitext, Briefköpfe und schwierige Belege. Das Paket **QR-Code lesen** übernimmt bei Visitenkarten die Angaben aus dem QR-Code (vCard) und lässt ohne Code die eingebaute Erkennung arbeiten; es liest dafür die Seitenbilder der Dokumente, die schon abgelegt sind (Recht *Dokumente lesen*), und braucht kein Netz.

- **Standard für alle Mappentypen:** Werkbank → Pakete → *Paket* → Abschnitt **Aus Dokument ausfüllen** → **Dieses Paket als Standard für alle Mappentypen nutzen**. Ohne Haken bleibt die eingebaute Erkennung der Standard.
- **Je Mappentyp:** In der [Erkennung des Mappentyps](mappentypen.md#erkennung) wählst du *Standard aus der Werkbank*, *eingebaut* oder ein bestimmtes Paket.
- **Datenabfluss:** Darf das Paket ins Netz (feste Adresse oder [Dienst-Adresse](#dienst-adresse)), schickt es den Text der Dokumente dorthin. Diese Wahl geht nur ausdrücklich: Ablago fragt **„Text der Dokumente an einen Dienst schicken?“**, und erst mit **Bestätigen und wählen** gilt sie.

**Was das Paket bekommt:** den Text, aus dem ausgefüllt wird (höchstens 50 000 Zeichen), den Namen des Mappentyps und eine Beschreibung der Felder als JSON Schema – **nie Passwortfelder** und nie Felder, die der Benutzer nicht bearbeiten darf. **Verweise** (z. B. *Organisation*) gleicht Ablago weiterhin selbst mit vorhandenen Mappen ab.

**Was Ablago mit der Antwort macht:** Es prüft jeden Wert gegen die Feldart wie bei der eingebauten Erkennung. Falsche Typen, unbekannte Felder und Werte außerhalb einer Auswahl verwirft es und vermerkt das im [Protokoll](fehlersuche.md#protokoll) (Feld und Grund, ohne Werte). Die Werte erscheinen nur als **Vorschlag**; gespeichert wird erst mit *Mappe speichern*. Unter dem Ergebnis steht „Erkannt mit „*Paket*“.“

**Wenn das Paket nicht antwortet** (läuft nicht, Dienst nicht erreichbar, keine Antwort nach 60 Sekunden, Antwort unbrauchbar), übernimmt die eingebaute Erkennung; der Benutzer sieht einen Hinweis darauf. Antwortet es, aber ohne einen Wert, der die Prüfung besteht, heißt der Hinweis „*Paket* hat nichts Brauchbares geliefert“ – auch dann übernimmt die eingebaute Erkennung.

**Gekürzter Text:** Liest das Paket nur einen Teil des Texts – weil Ablago höchstens 50 000 Zeichen mitgibt oder das Paket für seinen KI-Dienst kürzt (beim KI-Assistenten: Einstellung *Kontextlänge*, siehe [KI lokal betreiben](ki-lokal.md#kontext-speicher)) –, steht unter dem Ergebnis „Dokumenttext gekürzt“. Angaben weiter hinten im Dokument fehlen dann vielleicht.

**Fundstellen:** Ein Paket nennt zu jedem Wert die Stelle im Text, an der es ihn gefunden hat. Ablago übernimmt sie nur, wenn sie **wörtlich im Dokument steht** (bis auf Leerraum und Groß-/Kleinschreibung), und sucht sie in der Textebene bzw. der Texterkennung – daraus entstehen auf der Seite *Dokument übernehmen* die farbigen Rahmen. Steht die Fundstelle nicht im Dokument, fällt sie weg; der Wert bleibt, nur ohne Rahmen (Protokoll: „Fundstellen aus Paket verworfen“, mit Anzahl, ohne Werte). Pakete ohne Fundstellen laufen unverändert weiter.

### Wohin gehört das? durch Pakete { #wohin-gehoert-das }

Auf der Seite *Dokument übernehmen* schlägt Ablago unter **Wohin gehört das?** einen Mappentyp vor. Dafür verbindet es bis zu vier Wege zu **einem** Vorschlag und zeigt die Belege jedes Wegs („Woran Ablago das erkennt“):

| Weg | Woher | Was geht hinaus? |
|---|---|---|
| **KI** (Sprachmodell) | ein Paket mit [Mappentyp vorschlagen](#recht-klassifizieren) **und Netz**, z. B. *KI-Assistent* – nur, wenn es unter [Erkennung durch ein Paket](#erkennung-durch-ein-paket) als **Standard für alle Mappentypen** gewählt und der Datenabfluss bestätigt ist | der Anfang des Dokuments (höchstens 6 000 Zeichen) und die Liste der Mappentypen (siehe unten) |
| **Ähnliche Dokumente** | ein Paket mit *Mappentyp vorschlagen* **ohne Netz**, das auch die [Vektoren](#recht-vektoren) liefert, z. B. *KI lokal – Ähnlichkeit* | dazu, in welchen Mappentypen die ähnlichsten abgelegten Dokumente liegen – **nur Typ und Maß der Ähnlichkeit**, keine Titel, keine Inhalte. Gezählt werden nur Mappen, die die Person **und** das Paket lesen dürfen. |
| **Überschrift** | eingebaut: Der Name eines Mappentyps steht als Überschrift im Text („Rechnung“) | nichts |
| **Abgleich** | eingebaut: Eine vorhandene Mappe findet sich über [Zum Wiederfinden nutzen](mappentypen.md#zum-wiederfinden-nutzen) im Text, und ein Verweisfeld des Mappentyps zeigt auf ihren Typ (eine *Rechnung* zum *Vertrag* WV-1043) | nichts |

**Die Liste der Mappentypen** für Pakete enthält nur Mappentypen mit [Kann aus Post angelegt werden](mappentypen.md#dokument-ubernehmen), in denen die Person Mappen anlegen darf, **und die für [KI-Dienste](#ki-dienste) zugelassen sind** – je Mappentyp Kennung, Name, die ersten 200 Zeichen der Beschreibung und von „Woran man ihn erkennt“. Mappen, Felder oder Werte gehen nie mit.

**Was Ablago mit der Antwort macht:** Die Antwort hat ein festes Format (JSON Schema): höchstens drei Mappentypen mit Sicherheit (0–1), einer kurzen Begründung und einem Zitat. Ablago prüft sie streng – ein Mappentyp, der nicht in der Liste stand, wird abgelehnt; ein Zitat, das nicht im Dokument steht, fällt weg. Ist die Antwort ungültig oder bleibt nichts übrig, steht unter dem Vorschlag „*Paket* hat nichts Brauchbares geliefert“; antwortet ein Paket nicht (45 Sekunden), „*Paket* hat nicht geantwortet“. In beiden Fällen gelten die übrigen Wege. Abgelehntes steht im [Protokoll](fehlersuche.md#protokoll) mit Grund, ohne Werte; die Netzaufrufe des Pakets im [Protokoll des Pakets](#netzaufrufe).

**Nur ein Vorschlag:** Ablago speichert nichts und das Paket schreibt nichts. Wechselt die Person den Mappentyp, fragt Ablago nur noch die Felder des neuen Typs ab ([Erkennung](#erkennung-durch-ein-paket)), nicht noch einmal den Typ.

### Frag deine Ablage { #frag-deine-ablage }

Ist ein Paket mit dem Recht [Fragen an die Ablage beantworten](#recht-antworten) installiert und geladen, steht auf der Startseite der Ablage das Feld **„Frag deine Ablage“** (siehe [Benutzerhandbuch](https://help.ablago.app/benutzer/aktuell/startseite/#frag-deine-ablage)). So läuft eine Frage ab:

1. Der Browser schickt die Frage und den bisherigen Chat an Ablago.
2. Ablago sucht **selbst** passende Stellen – im Volltext der Dokumente, in Titel und Feldern der Mappen und, wenn ein Paket mit [Vektoren](#recht-vektoren) da ist, nach Ähnlichkeit –, **nur in Mappen, die der Fragende lesen darf**. Passwortfelder und Benutzer sind nie dabei.
3. Es schneidet höchstens so viele **Ausschnitte** heraus, wie unten eingestellt, und gibt sie mit der Frage dem Paket – als **Daten gekennzeichnet**, mit dem Hinweis an den KI-Dienst, darin stehende Anweisungen nicht zu befolgen.
4. Das Paket fragt den Dienst unter der [Dienst-Adresse](#dienst-adresse) und gibt die Antwort Stück für Stück zurück.
5. Ablago zeigt die Antwort als **Text** (nichts davon wird ausgeführt oder gespeichert) und darunter die genannten **Quellen** – nur Mappen aus den mitgegebenen Ausschnitten, noch einmal auf Lesbarkeit geprüft. Unter jeder Antwort steht aufklappbar **„An die KI geschickt: n Ausschnitte aus m Mappen“** mit genau diesen Stellen.

**Werkbank → Pakete → *Paket*** zeigt im Abschnitt **Frag deine Ablage** die **Höchstmenge je Frage**:

| Einstellung | Bereich | Standard |
|---|---|---|
| **Höchstens Ausschnitte je Frage** | 1 bis 20 | 8 |
| **Höchstens Zeichen je Frage** (alle Ausschnitte zusammen) | 500 bis 30 000 | 6 000 |

Ein einzelner Ausschnitt ist höchstens 1 500 Zeichen lang. Weniger heißt: weniger Daten an den Dienst und schnellere Antworten, aber eher „steht nicht in den Ausschnitten“.

**Kein Protokoll der Inhalte:** Den Chat hält nur der Browser (bis zum Neuladen); der Server speichert weder Fragen noch Ausschnitte noch Antworten. Das Protokoll von Ablago vermerkt nur „Frage an die Ablage gestellt“ mit Anzahl der Ausschnitte und Dauer, die Werkbank beim Paket nur „Frage beantwortet“ mit der Länge der Antwort. Je Benutzer läuft eine Frage zur Zeit, im ganzen Ablago höchstens vier.

### Ereignisse { #ereignisse }

Unter **„Reagiert auf diese Ereignisse:“** nennt die Vorschau, wann der Code von selbst läuft – je Ereignis eine Zeile mit **?**. Ohne Ereignisse läuft er nur, wenn du im Reiter **Einstellungen** eine Aktion auslöst. Ein Ereignis gibt dem Paket keine weiteren Rechte: Es erfährt nur, *dass* etwas passiert ist (z. B. die Kennung der neuen Post), und arbeitet dann mit den Rechten oben. Kommen in einem Update nur Ereignisse dazu, fragt Ablago deshalb nicht erneut. Was ein Paket selbst ändert, wird ihm nicht zurückgemeldet.

#### Neue Post ist angelegt { #ereignis-post-angelegt }

**Wann:** Sobald eine neue Post entsteht – mit **+ Post** in der Ablage, über die API, aus einem Eingangsordner oder Postfach und beim **Post teilen** für jede neue Post.

**Typisch:** Post prüfen, zuordnen oder zählen – das Beispielpaket **Hallo Post** etwa zählt neue Post.

#### Ein Dokument wurde hochgeladen { #ereignis-dokument-hochgeladen }

**Wann:** Bei jedem neuen Dokument – Hochladen in der Oberfläche oder über die API, aus Eingangsordner und Postfach, und für die neuen Dokumente beim **PDF teilen**, **Zusammenfügen**, **Post teilen** und **Schwärzen** (als Kopie). Eine neue Version eines vorhandenen Dokuments ist kein neues Dokument.

**Typisch:** Das Dokument ansehen und etwas daraus machen – das Paket **Trennblatt** teilt Post an Trennblättern, **Texterkennung** erkennt Text in Scans.

#### Die Texterkennung eines Dokuments ist fertig { #ereignis-texterkennung-fertig }

**Veraltet** – gibt es weiter für Pakete, die vor Version 0.133 entstanden sind. **Wann:** Gleichzeitig mit [Volltext fertig](#ereignis-volltext-fertig), wenn Ablago ein Dokument selbst gelesen hat (Textebene).

**Typisch:** Ältere Fassungen des Pakets **Texterkennung** (1.x) erkennen damit Scans ohne Text. Seit Version 0.134 gibt es keine eingebaute Texterkennung mehr – aktualisiere das Paket auf 2.0, damit Ablago es als Texterkennung kennt.

#### Der Volltext eines Dokuments ist fertig { #ereignis-volltext-fertig }

**Wann:** Sobald der Volltext eines Dokuments feststeht – egal, woher er kommt: aus der Textebene eines PDFs, von einem Paket wie **Texterkennung** oder über die API. Seit Version 0.133 auch dann, wenn Ablago **keinen Text** gefunden hat (z. B. bei einem Scan) – genau das braucht ein Paket, das die [Texterkennung übernimmt](#recht-texterkennung). Pakete von vor 0.133 bekommen es weiter nur mit Text. Für ein Paket mit dem Recht [Vektoren zu Dokumenten](#recht-vektoren) schickt Ablago dieses Ereignis außerdem für den **Bestand** nach (siehe [Ähnlichkeit](#aehnlichkeit)).

**Typisch:** Scans erkennen – das Paket **Texterkennung** (ab 2.0); aus dem Volltext etwas berechnen – das Paket **KI lokal – Ähnlichkeit** rechnet daraus den Vektor des Dokuments.

#### Eine Datei soll umgewandelt werden { #ereignis-datei-umwandeln }

**Wann:** Seit Version 0.137 für jede Datei eines Typs, den Ablago nicht selbst liest und für den das Paket mit dem Recht [Dateien umwandeln](#recht-umwandeln) zuständig ist – beim Hochladen und bei einer neuen Version, wenn das Paket neu installiert wird (für die vorhandenen Dateien), bei **Vorschaubilder nachholen** und bei **Volltext neu erzeugen** (für Dateien ohne Fassung). Dateien über 50 MB meldet Ablago nicht. Nur das zuständige Paket bekommt es (bei mehreren für denselben Typ das erste nach Id).

**Typisch:** Das Paket **Bildformate** macht aus einem TIFF-Scan ein PDF, aus WebP ein JPEG und aus GIF und BMP ein PNG.

#### Eine Datei braucht ihren Volltext { #ereignis-datei-volltext }

**Wann:** Seit Version 0.145 für jede Datei eines Typs, den Ablago nicht selbst liest und für den das Paket mit dem Recht [Volltext liefern](#recht-volltext) zuständig ist – beim **Hochladen**, bei einer **neuen Version**, wenn das Paket **neu installiert** wird (für die vorhandenen Dateien ohne Text), bei **Volltext neu erzeugen** und bei **Erneut versuchen** bzw. **Neu erzeugen** am Dokument. Dateien über 50 MB meldet Ablago nicht. Nur das zuständige Paket bekommt es (bei mehreren für denselben Typ das erste nach Id). Bis das Paket schreibt, bleibt ein vorhandener Text für die Suche stehen.

**Typisch:** Das Paket **Office und E-Mail** liest den Text aus Word-, Excel- und PowerPoint-Dateien, OpenDocument, RTF, Textdateien und E-Mails.

#### Archivfassung erstellen { #ereignis-datei-archivfassung }

**Wann:** Seit Version 0.149 für jedes Dokument eines Typs, für den das Paket mit dem Recht [Archivfassung ablegen](#recht-archivfassung) zuständig ist – **sobald sein Volltext feststeht**: nach dem Hochladen (bei Scans also erst nach der Texterkennung), bei einer **neuen Version** oder einer Änderung am PDF (drehen, Seiten löschen, teilen, schwärzen), bei **Volltext neu erzeugen** und wenn das Paket **neu installiert** wird (für alle vorhandenen Dokumente mit fertigem Volltext). Welche Dokumente eine bekommen, kreuzt du in den Einstellungen des Pakets an: **PDFs mit Text** (Online-Rechnungen, Kontoauszüge), **gescannte PDFs**, **Fotos und Bilder** und seit 0.221 **E-Mails** (`.eml`, `.msg`) – Vorgabe alle. E-Mails meldet Ablago auch ohne Volltext: Liefert kein Paket ihn, gilt er als feststehend (leer). Was du abwählst, steht am Dokument als „ausgelassen – laut Einstellung“; kreuzt du eine Art später an, holt Ablago die passenden Dokumente nach. Nicht gemeldet werden: verschlüsselte PDFs (Grund am Dokument), PDFs, die schon gültiges PDF/A sind (das Original gilt dann als Archivfassung), und Dateien über 50 MB. Nur das zuständige Paket bekommt es (bei mehreren das erste nach Id).

**Typisch:** Das Paket **PDF/A** legt zu jedem Scan, Foto und PDF ein durchsuchbares PDF/A-2b ab.

#### Eine Sicherung ist fertig { #ereignis-sicherung-fertig }

**Wann:** Seit Version 0.142 nach jeder erfolgreichen Sicherung – von Hand, automatisch oder vor einer Wiederherstellung –, sobald sie vollständig im Sicherungsordner liegt. Nur Pakete mit dem Recht [Sicherung lesen](#recht-sicherung-lesen) bekommen es. Schlägt die Kopie fehl, wiederholt Ablago das Ereignis (nach 1, 5, 30 Minuten, 2 und 6 Stunden); danach gilt sie als fehlgeschlagen und die Administratoren bekommen eine E-Mail.

**Typisch:** Das Paket **Sicherungsziel WebDAV** lädt die verschlüsselte Sicherung auf Nextcloud, ein NAS oder zum Hoster und prüft sie dort.

#### Die Einstellungen des Pakets wurden geändert { #ereignis-einstellungen-geandert }

**Wann:** Wenn ein Administrator die [Einstellungen des Pakets](#einstellungen) speichert. Nur das Paket selbst bekommt dieses Ereignis.

**Typisch:** Die neuen Werte übernehmen, z. B. eine Verbindung neu prüfen oder den Status aktualisieren.

#### Ereignisse zu Mappen { #ereignis-mappe }

**Wann:** Seit Version 0.153 – eine Mappe ist **angelegt**, **gespeichert** (und dabei geändert), **gelöscht** (in den Papierkorb) oder **wiederhergestellt**. Ein Paket bekommt diese Ereignisse nur für die Mappentypen, die es im Manifest nennt – seine eigenen und, seit Version 0.166, auch Mappentypen anderer Pakete oder „alle, die es lesen darf“; die Vorschau zeigt sie als „– zu: *Typen*“ (fremde mit dem Paket in Klammern). Zugestellt wird nur, was das Paket **gerade lesen darf**: Hast du ihm einen Mappentyp unter [Pakete am Mappentyp](berechtigungen.md#pakete-am-mappentyp) verwehrt oder schränkt eine Regel für die Rolle *Paket* es ein, bekommt es dazu nichts – der Grund steht im Protokoll. Viele schnelle Änderungen an derselben Mappe kommen als **ein** Ereignis (binnen etwa 5 Sekunden), mit den Schlüsseln aller geänderten Felder. Das Paket erfährt nur Kennung, Typ und Feldschlüssel – nie Werte –, und liest mit seinen Rechten nach. Beispiel-Mappen, Demo-Daten und eine Wiederherstellung lösen nichts aus.

**Typisch:** Aus einer geänderten Mappe etwas nachrechnen oder einen Stand an einen anderen Dienst geben.

#### Frist erreicht { #ereignis-frist-erreicht }

**Wann:** Seit Version 0.153 für jedes Datumsfeld mit einer [Frist](mappentypen.md#fristen-erinnerungen-an-datumsfeldern) – zum **Erinnerungszeitpunkt** (so viele Tage vorher, wie die Frist vorsieht) und **am Tag selbst**, je Mappe, Feld, Datum und Zeitpunkt **genau einmal**, auch mit mehreren Servern und nach einem Neustart. Wie bei den Mappen-Ereignissen nur für die Mappentypen aus dem Manifest. Ändert jemand das Datum, gilt der neue Tag wieder als offen.

**Typisch:** Zu einer Kündigungsfrist etwas vorbereiten, eine Erinnerung an einen anderen Dienst schicken.

#### Nach Zeitplan ausgeführt { #ereignis-zeitplan-ausgefuehrt }

**Wann:** Wenn eine Automatisierung mit der Karte [Paket nach Zeitplan ausführen](automatisierungen.md#paket-nach-zeitplan) läuft – nur an das Paket, das die Karte nennt, je Automatisierung und Tag **genau einmal**. Das Paket erfährt Datum, geplanten Zeitpunkt und die Aufgabe (z. B. `taeglich`), keine Inhalte der Ablage. Uhrzeit, Tage und an/aus bestimmst du an der Automatisierung; das Paket bekommt dadurch **keine zusätzlichen Rechte**.

**Typisch:** Jeden Morgen den Status aller Verträge oder Rechnungen neu rechnen, der sich nur durch das Datum ändert.

### Ähnlichkeit { #aehnlichkeit }

Ein Paket mit dem Recht [Vektoren zu Dokumenten](#recht-vektoren) – etwa **KI lokal – Ähnlichkeit** – rechnet zu jedem Dokument mit Volltext einen Vektor. Damit zeigt Ablago:

- an der Mappe unter den Dokumenten **„Ähnliche Dokumente“** aus anderen Mappen,
- in der Suche der [Startseite](https://help.ablago.app/benutzer/aktuell/startseite/#schnell-finden) mit **„auch in Dokumenten“** zusätzlich **ähnliche Treffer** – Mappen ohne passendes Wort, deren Dokument dem Suchbegriff ähnlich ist, gekennzeichnet mit **„ähnlich“**.

Jeder sieht dabei nur Mappen, die er lesen darf. Den Vektor des Suchbegriffs liefert das Paket; antwortet es nicht innerhalb von 1,5 Sekunden, sucht Ablago wie bisher ohne Ähnlichkeit.

**Werkbank → Pakete → *Paket*** zeigt im Abschnitt **Ähnlichkeit**:

| Angabe | Bedeutung |
|---|---|
| **Modell** | womit das Paket rechnet (meldet das Paket selbst) |
| **Stand** | für wie viele Dokumente mit Volltext es schon einen Vektor gibt |
| **Zwischenspeicher** | wie viel Arbeitsspeicher die Vektoren in Ablago belegen |
| **Ähnliche Treffer in der Suche zeigen** | Einstellung, Standard: an. Aus: Die Suche fragt das Paket nicht mehr; „Ähnliche Dokumente“ an der Mappe bleiben. |
| **Neu berechnen** | löscht alle Vektoren; das Paket rechnet sie im Hintergrund neu |

**Bestand und Modellwechsel:** Nach der Installation rechnet das Paket zuerst nur neue Dokumente. Den Bestand holt Ablago gedrosselt nach: Hat das Paket nichts mehr offen, bekommt es alle 30 Sekunden bis zu 50 Dokumente ohne Vektor (Ereignis [Volltext ist da](#ereignis-volltext-fertig)). Meldet das Paket nach einem Update ein **anderes Modell**, sind die alten Vektoren ungültig: Ablago löscht sie und lässt sie auf dieselbe Weise neu berechnen. Bis dahin fehlen ähnliche Dokumente für die noch offenen Dokumente.

**Daten:** Vektoren sind abgeleitet. Sie stehen in der Datenbank (Tabelle `vektoren`), nicht im [Vollexport](export.md), und verschwinden mit ihrem Dokument. Nach einer Wiederherstellung rechnet das Paket sie neu.

**Speicher und Antwortzeit** (256 Zahlen je Vektor, gemessen auf einem Rechner mit 2 Kernen, PostgreSQL 16):

| Dokumente | Datenbank | Zwischenspeicher | erstes Laden | Ähnliche Dokumente | zum Vergleich: Kosinus in SQL |
|---|---|---|---|---|---|
| 10 000 | 12 MB | 4 MB | 0,4 s | 4 ms | 0,3 s |
| 100 000 | 118 MB | 33 MB | 3,2 s | 37 ms | 3,0 s |

Ablago braucht dafür keine Datenbank-Erweiterung (wie pgvector, die im Image `postgres:17` fehlt). Es vergleicht im eigenen Arbeitsspeicher mit 8 Bit je Zahl; den Zwischenspeicher lädt es nach dem Start im Hintergrund – bis er da ist, sucht die Suche ohne Ähnlichkeit. Gemessen mit `server/test/vektoren-messen.ts`.

## Expertenmodus: weitere Kataloge und Hochladen

Für Paketentwickler und für Ablago ohne Internetzugang gibt es unter **Werkbank → Pakete** direkt unter den Knöpfen den Abschnitt **Expertenmodus**. Er ist zugeklappt; ein Klick auf **▸ Expertenmodus** (oder Enter bzw. Leertaste) klappt ihn an Ort und Stelle auf. Ob er auf- oder zugeklappt ist, merkt sich dein Browser für dich – das ist nur Bequemlichkeit, kein Recht: Was dort steht, dürfen alle Administratoren.

![Werkbank → Pakete mit aufgeklapptem Expertenmodus](bilder/werkbank-pakete.png)

Im Expertenmodus kannst du:

- **Weitere Quellen** – Katalogadressen hinzufügen, abschalten und entfernen, höchstens 20. Erlaubt ist nur HTTPS, das Format ist dasselbe wie beim offiziellen Katalog (`katalog.json` der Registry). Wie ein Katalog mit **eigenem Schlüssel** behandelt wird, steht [unten](#katalog-mit-eigenem-schlussel). **Katalog abrufen** fragt neben dem offiziellen Katalog alle **eingeschalteten** weiteren Kataloge ab – egal, ob der Abschnitt gerade auf- oder zugeklappt ist; ihre Pakete tragen die Adresse als Kennzeichen. Willst du eine Quelle nicht mehr nutzen, schalte sie ab oder entferne sie. Ohne weitere Quellen gibt es nur den offiziellen Katalog.
- Ein **Paket als Datei hochladen** (`.zip` im Format der Registry, z. B. der Paketordner gepackt, höchstens 128 MB). Ablago prüft es genauso wie ein Katalogpaket, nur ohne Prüfsumme aus dem Katalog, und zeigt die Vorschau. Eine [Sammeldatei](#pakete-ohne-internet-installieren) erkennt es selbst.

!!! warning "Nicht vom Ablago-Projekt geprüft"
    Pakete aus einer anderen Quelle als dem offiziellen Katalog hat niemand vom Ablago-Projekt angesehen. Vor der Installation zeigt Ablago deshalb deutlich die Herkunft, und du musst ausdrücklich bestätigen, dass du weißt, woher das Paket stammt.

Die Liste der installierten Pakete zeigt bei jedem die **Herkunft**: „offizieller Katalog“, die Katalogadresse oder „hochgeladen von … am …“. **Updates sucht Ablago nur in der Quelle, aus der das Paket stammt.** Ein hochgeladenes Paket aktualisierst du, indem du eine höhere Version hochlädst; dann gelten dieselben Regeln wie bei jedem Update (nur ergänzen). Ist die Quelle eines Pakets abgeschaltet oder entfernt, gibt es dafür keine Updates.

Lädst du ein einzelnes Paket hoch, dessen Prüfsumme genau so im (schon abgerufenen) offiziellen Katalog steht, zeigt die Vorschau „entspricht Katalogversion …“. Die Herkunft bestätigst du trotzdem, wie bei jedem hochgeladenen Paket.

Das Protokoll vermerkt, wer welche Quelle hinzugefügt, abgeschaltet oder entfernt und wer welches Paket hochgeladen hat.

### Katalog mit eigenem Schlüssel { #katalog-mit-eigenem-schlussel }

Ein weiterer Katalog kann einen **eigenen Schlüssel** haben (Datei `katalog.schluessel` neben `katalog.json`; wie ein Anbieter das einrichtet, steht im [Entwicklerhandbuch](https://help.ablago.app/entwickler/aktuell/pakete/#eigener-katalog-mit-eigenem-schluessel)). Ablago geht damit um wie SSH beim ersten Kontakt:

1. **Hinzufügen:** Hat der Katalog einen Schlüssel, zeigt Ablago dessen **Fingerabdruck** – 64 Zeichen in Vierergruppen, z. B. `3f9a 0c12 …`. Vergleiche ihn mit dem, den der Anbieter auf seiner Webseite nennt. Erst wenn du **Fingerabdruck stimmt** klickst, merkt sich Ablago den Schlüssel. Stimmt auch nur ein Zeichen nicht, klicke **Abbrechen**.
2. **Danach** muss jeder Abruf dieses Katalogs gültig signiert sein; dafür fragt Ablago beim Installieren nicht mehr nach der Herkunft. Fehlt die Signatur oder passt sie nicht, nimmt Ablago den Katalog nicht und vermerkt es im Protokoll.
3. **Geordneter Schlüsselwechsel:** Hat der Anbieter seinen neuen Schlüssel mit dem alten signiert, übernimmt Ablago ihn selbst. Die Vorschau zeigt einen Hinweis, das Protokoll den Wechsel.
4. **Schlüssel geändert ohne diesen Nachweis:** Ablago **sperrt** den Katalog. In der Liste der Quellen steht „Gesperrt seit …“ mit dem neuen Fingerabdruck, und das Protokoll vermerkt es. Pakete daraus lassen sich nicht installieren oder aktualisieren.

**Was tun bei einem gesperrten Katalog?**

- Frag beim Anbieter nach (nicht über einen Link aus dem Katalog selbst), ob er den Schlüssel wirklich gewechselt hat, und vergleiche den neuen Fingerabdruck mit seiner Webseite.
- Stimmt er, klicke bei der Quelle **Schlüssel prüfen …** und bestätige den Fingerabdruck. Die Sperre ist dann aufgehoben.
- Stimmt er nicht oder erreichst du den Anbieter nicht: Schalte die Quelle ab oder entferne sie. Schon installierte Pakete bleiben, bekommen aber keine Updates mehr.

Ein Katalog **ohne** Schlüssel funktioniert wie bisher: Bei jeder Installation bestätigst du die Herkunft. Veröffentlicht der Anbieter später einen Schlüssel, übernimmst du ihn mit **Schlüssel prüfen …**.

## Pakete ohne Internet installieren

Kommt dein Ablago nicht ins Internet, holst du mehrere Pakete auf einmal als **Sammeldatei**:

1. Öffne an einem Gerät mit Internet die Seite **[Pakete ohne Internet](https://catalog.ablago.app/sammeldatei.html)** des Katalogs. Am schnellsten über **Werkbank → Pakete → Ohne Internet …** und den Link dort – dann ist die Version deines Ablago schon eingetragen. Wie bei [Im Katalog ansehen](#im-katalog-ansehen) steht sie nur im **Fragment** der Adresse (`…/sammeldatei.html#dms=0.147.0`): Der Browser schickt sie an keinen Server, die Seite merkt sie sich nur in deinem Browser und entfernt das Fragment gleich wieder aus der Adresse.
2. Kreuze die Pakete an. Die **Ablago-Version** bestimmt, welche Paketversionen passen (Vorgabe: die Version, die sich dein Browser gemerkt hat, sonst die neueste). **Abhängigkeiten** wie „Basis“ kommen automatisch mit und sind mit „kommt mit – gebraucht von …“ markiert. Texterkennung und Benachrichtigungen sind vorausgewählt.
3. **Sammeldatei herunterladen.** Die Seite holt die Pakete aus dem Katalog, prüft jedes gegen seine Prüfsumme und packt sie zusammen – mit einer Kopie des signierten Katalogs. Sie zeigt den **SHA-256** der fertigen Datei.
4. Bring die Datei zu Ablago (USB-Stick, Netzlaufwerk) und lade sie unter **Werkbank → Pakete → Ohne Internet …** hoch – oder im [Einrichtungsassistenten](installation.md#pakete-dazuholen), wenn der Katalog dort nicht erreichbar ist. Ein einzelnes Paket oder eine Sammeldatei nimmt auch **Paket hochladen** im Expertenmodus an.
5. Ablago zeigt den Inhalt: je Paket die Version und ob es **neu**, ein **Update**, **schon installiert** oder **älter als installiert** ist und ob es zur Ablago-Version passt. Ergänzungen (z. B. Zusatzsprachen) stehen unter ihrem Paket. Enthält die Datei den signierten Katalog, steht dort **Herkunft: aus dem offiziellen Katalog vom …**; sonst bestätigst du im Ablauf einmal, dass du weißt, woher die Datei stammt. Abwählen kannst du jedes Paket, das kein anderes gewähltes braucht. Danach geht es weiter wie unter [Mehrere Pakete in einem Schritt](#mehrere-pakete-in-einem-schritt-installieren): eine Rechte-Bestätigung, Namen nur bei Konflikten, Beispiele, Einstellungen, ein Knopf.

### Wie Ablago einer Sammeldatei traut { #wie-das-dms-einer-sammeldatei-traut }

Die Sammeldatei ist ein ZIP mit dem Verzeichnis `sammeldatei.json` (je Paket Id, Version, Größe und SHA-256), einer kurzen `LIESMICH.txt`, den Paket-Archiven aus dem Katalog, Byte für Byte unverändert, und – bei Sammeldateien aus dem signierten Katalog – einer Kopie von `katalog.json` mit `katalog.sig`. Ablago nimmt sie **nur ganz oder gar nicht** an:

- Jedes Archiv muss genau die **Größe und Prüfsumme (SHA-256)** aus dem Verzeichnis haben. Hat Ablago den offiziellen Katalog in dieser Sitzung schon abgerufen, muss die Prüfsumme **auch zum Katalog** passen – sonst lehnt es die Datei ab.
- Es dürfen **keine anderen Dateien** darin liegen; Dateinamen mit `..` oder `/` am Anfang, verschlüsselte Einträge und doppelte Namen lehnt es ab.
- **Grenzen gegen ZIP-Bomben:** höchstens 256 MB je Sammeldatei, 50 Pakete, 128 MB je Paket-Archiv, entpackt 20 MB je Paket (plus 128 MB für Code) und 512 MB für alle Pakete zusammen. Ein großes Paket braucht beim Installieren etwa doppelt so viel Arbeitsspeicher, wie es groß ist. Ablago entpackt nie mehr, als im Archiv angegeben ist.
- Jedes Paket durchläuft **dieselben Prüfungen wie ein einzeln hochgeladenes**; Id und Version im Paket müssen zum Verzeichnis passen. Ist eins ungültig, wird nichts übernommen.
- Enthält die Datei den **signierten Katalog**, prüft Ablago die Signatur – ohne Internet – und vergleicht jedes Archiv mit der Prüfsumme darin. Passt eines nicht dazu, lehnt es die ganze Datei ab.

**Mit gültig signiertem Katalog**, in dem jedes Archiv mit seiner Prüfsumme steht, zeigt Ablago „aus dem offiziellen Katalog vom …, signiert vom Ablago-Projekt“, und du musst die Herkunft **nicht bestätigen**. Ist der Katalogstand älter als **90 Tage**, weist Ablago darauf hin: Neuere Paketversionen fehlen darin vielleicht – stell bei Gelegenheit eine neue Sammeldatei zusammen. Steht ein Paket nicht im signierten Katalog, nennt Ablago es; für dieses bestätigst du die Herkunft wie bisher.

**Ohne Signatur** (ältere Sammeldateien) oder mit **ungültiger Signatur** beweisen die Prüfsummen nur, dass die Datei vollständig und seit dem Zusammenstellen **unverändert** ist – nicht, **wer** sie zusammengestellt hat. Dann gilt sie wie ein hochgeladenes Paket als „nicht vom Ablago-Projekt geprüft“: Du bestätigst die Herkunft. Eine ungültige Signatur steht außerdem im Protokoll. In jedem Fall tragen die installierten Pakete als Herkunft „hochgeladen von … am …“. Vergleiche bei Zweifel den SHA-256, den Ablago nach dem Hochladen zeigt, mit dem auf der Katalog-Seite. Updates dieser Pakete holst du mit einer neuen Sammeldatei; Pakete, die aus dem Katalog installiert sind, aktualisiert eine Sammeldatei nicht.

## Paket aus deinem Ablago erstellen { #paket-aus-deinem-dms-erstellen }

Hast du dir eigene Mappentypen und Ansichten gebaut – etwa für Verträge mit Zahlungen –, nimmst du sie als Paket in eine andere Ablage mit, etwa zu einer anderen Familie oder in einen anderen Betrieb, ohne YAML von Hand zu schreiben. Unter **Werkbank → Pakete → Paket erstellen** führt dich ein Assistent in vier Schritten – **Auswählen · Prüfen · Angaben · Erstellen**; unten stehen **Zurück** und **Weiter**, am Ende **Paket erstellen** und **Erstellen und als ZIP herunterladen**.

Hast du schon Pakete erstellt, fragt der erste Schritt zuerst: **Neues Paket** (ohne Auswahl, ohne Angaben) oder **Neue Version von …** (übernimmt Auswahl und Angaben eines früheren Pakets und schlägt die nächste Version vor; Mappentypen und Ansichten, die es nicht mehr gibt, fallen mit Hinweis weg, eigene Typen, die du seitdem angelegt hast, nimmst du selbst dazu).

1. **Auswählen** – Mappentypen, Ansichten und **Wortlisten** (deine eigenen Gruppen aus Werkbank → Gleichbedeutende Wörter) mit Haken, oben eine Suche. Wortlisten aus installierten Paketen stehen ausgegraut da und kommen nicht mit; ein Paket nur mit Wortlisten geht auch (ab Ablago 0.127.0 beim Empfänger, dort unter „aus Paketen“). Optional **Beispiel-Mappen**: Ohne Auswahl enthält das Paket keine einzige Mappe. Wählst du Mappen der gewählten Typen aus, kommen ihre Feldwerte als Beispiele mit – nimm nur Mappen mit erfundenen Daten, z. B. Demo-Mappen. Mit dem Haken **Mit ihren Dokumenten** kommen auch die Dokumente dieser Mappen mit (nur PDF, PNG und JPEG, unter `inhalt/beispiele/`; das Paket braucht dann Ablago ab 0.223.0) – nimm dafür nur Dokumente mit erfundenen Inhalten, nie echte Rechnungen, Verträge oder Briefe.
2. **Prüfen** – Ablago prüft automatisch und sagt, was es daraus macht:
    - **Aus einem Paket:** Ein Mappentyp oder eine Ansicht, die ein installiertes Paket mitgebracht hat (etwa „Organisation“ aus *Basis*), wird **nicht kopiert**, sondern als **Abhängigkeit** eingetragen, z. B. `basis: ">=1.1.0"` mit der hier installierten Version. Hast du so einen Typ hier nachträglich geändert, weist Ablago darauf hin: Deine Änderungen gehören nicht zu deinem Paket – lege dafür einen eigenen Typ an. Am Typ steht dann **„geändert“** mit einer Kurzfassung (z. B. „+2 Felder · 1 Feld geändert“); aufgeklappt siehst du jedes Feld und Register, das vom Stand des Pakets abweicht. Speichern ohne Änderung zählt nicht. Bei Paketen, die vor dieser Version installiert wurden, kennt Ablago die Einzelheiten erst nach dem nächsten Update des Pakets.
    - **Benutzer, Rolle:** Verweise darauf werden zu `dms:benutzer` und `dms:rolle` – die bringt jede Ablago-Installation mit.
    - **Ablageort:** Verweise darauf werden zu `basis:ablageort` mit der Abhängigkeit `basis: ">=1.6.0"` – auch, wenn deine Ablage noch den früheren Ablageort von Ablago hat (Issue #883).
    - **Nicht gewählt:** Verweist ein gewählter Typ (Feld, Verknüpfungsregister) auf einen **eigenen** Typ, den du nicht gewählt hast, steht er unter „Nicht gewählt, aber gebraucht“ mit **Mit aufnehmen**. So lange geht der Export nicht. Eine Ansicht, deren Elternansicht fehlt, kommt auf die oberste Ebene.
    - **Nur Ansichten** darfst du ausdrücklich exportieren – etwa Ansichten für jemanden, der die Mappentypen schon hat. Zeigt eine Ansicht auf einen eigenen Typ, der nicht ins Paket kommt, sagt die Prüfung „Vorsicht“ und bietet **Mit aufnehmen** an; der Export geht trotzdem. Der Typ bleibt über seine Kennung in der Ansicht. Beim Empfänger ordnet Ablago ihn dem Typ mit derselben Kennung zu; gibt es ihn dort nicht, wird die Ansicht übersprungen und die Vorschau sagt es vorher – der Rest des Pakets wird installiert. Kommt der Typ aus einem Paket, steht er als Abhängigkeit in der Prüfung.
    - **Was nicht ins Paket passt**, nennt die Prüfung als Hinweis: weitere Trefferlisten (nur die Standard-Trefferliste kommt mit), Berechtigungen, Nummernkreise an Feldern, Bedingungen auf Anzahlen, Favoriten oder Fristen und alles, was auf bestimmte Mappen oder Benutzer dieser Installation zeigt. Der [Archivmodus](archiv.md#archivmodus-aus-einem-paket) kommt mit – beim Empfänger als Vorgabe für den neu angelegten Mappentyp.
3. **Angaben** – Name, Id (Kleinbuchstaben, Ziffern und `_`, wird aus dem Namen vorgeschlagen), Beschreibung (ein, zwei Sätze, daraus wird auch die README), Autor und optional dein GitHub-Name. Unter „Was ist neu“ steht, was ins CHANGELOG kommt. Dazu:
    - **Version** – du wählst sie, statt sie zu tippen. Ein neues Paket beginnt mit **1.0.0**. Für jede weitere Version wählst du die Art der Änderung: **Kleine Korrektur** (z. B. 1.0.1 – Texte, Beschreibungen), **Neue Inhalte** (z. B. 1.1.0 – neue Felder, Ansichten, Mappentypen) oder **Größere Änderung** (z. B. 2.0.0 – Felder entfernt oder umgebaut). Ablago schlägt die Art vor, wenn es sie erkennt, und sagt warum. Eine Version, die nicht höher ist als die zuletzt weitergegebene, gibt es nicht zur Auswahl – sonst erkennt der Empfänger kein Update. Hast du das Paket auf einem anderen Gerät erstellt, nimm **Letzte Version des Pakets hochladen**: Ablago liest daraus nur Id, Name und Version und zählt von dort weiter.
    - **Nötige Ablago-Version** – Ablago ermittelt die **Mindestversion** aus dem, was das Paket nutzt (z. B. Feldformate ab 0.121.0), und schlägt sie vor. Zur Auswahl stehen die Versionen von dort bis zu deiner eigenen („nur ab meiner Version“); niedriger geht nicht. Gespeichert wird immer `>=X.Y.0`.
    - **Lizenz** – drei Wege: eine **freie Lizenz** aus der Liste (Vorgabe Apache-2.0 wie Ablago selbst; tippe Kürzel oder Name, z. B. „apa“ oder „gnu“, die Liste ist alphabetisch, je Lizenz ein Satz, was sie verlangt), eine **eigene Lizenz** (Name und Text, z. B. für Pakete, die ein IT-Dienstleister nur an seine Kunden gibt – der Text kommt als LICENSE ins Paket) oder **keine Lizenz** (dann bleiben alle Rechte bei dir). Mit eigener oder ohne Lizenz lässt sich das Paket überall installieren, kommt aber nicht in den offiziellen Katalog – dort gelten nur freie Lizenzen. Die Installations-Vorschau zeigt die Lizenz immer an, bei eigener oder fehlender mit Hinweis.
    - **Expertenmodus** (unter **Werkbank → Werkbank anpassen**): Version und Ablago-Version gehen dann auch von Hand – Ablago prüft trotzdem, dass die Version höher ist und die Mindestversion reicht. Für ein Paket, das noch nicht fertig ist, gibt es dort außerdem 0.1.0.
4. **Erstellen** – Ablago prüft das fertige Archiv genauso wie beim Hochladen. **Paket erstellen** legt es dann an: Es steht unter **Werkbank → Pakete → Installiert** mit dem Zeichen **selbst erstellt**. **Erstellen und als ZIP herunterladen** gibt dir zusätzlich gleich die Datei `<id>-<version>.zip` (Format der Registry mit `manifest.yaml`, `inhalt/…`, README, CHANGELOG, LICENSE).

In der anderen Ablago-Installation installierst du zuerst die Abhängigkeiten (z. B. *Basis* aus dem Katalog) und lädst die Datei dann unter **Expertenmodus → Paket hochladen** hoch.

**Selbst erstellte Pakete** zeigt die Paketverwaltung unter **Installiert** mit dem Zeichen **selbst erstellt** und der zuletzt erstellten Version. Ein Klick zeigt, was damals erstellt wurde – Mappentypen, Ansichten, Beispiele, Angaben, Version und Datum –, und markiert Mappentypen, die du seitdem geändert hast. Dort gibt es:

- **Neue Version erstellen** – öffnet „Paket erstellen“ mit dieser Auswahl und schlägt die nächste Version vor,
- **Als ZIP herunterladen** – jede gespeicherte Version genau so, wie sie erstellt wurde (die letzten zehn, je bis 5 MB; sie sind Teil der Sicherung),
- **Aus der Liste nehmen** – vergisst nur die Angaben und die gespeicherten Archive. Ein **Entfernen**, das Mappentypen oder Ansichten löscht, gibt es nicht: Sie sind das Original in diesem Ablago, bleiben eigene Typen und lassen sich wieder exportieren.

Updates aus einem Katalog gibt es für selbst erstellte Pakete nicht. Hat ein Katalog ein Paket mit derselben Id, weist die Paketverwaltung darauf hin.

**Nächste Version:** Ablago merkt sich Id, Version, Autor, Lizenz, Auswahl und die Felder jedes erstellten Pakets. Mit **Neue Version von …** schlägt der Assistent dieselbe Id mit höherer Version vor (Vorgabe nach der erkannten Art der Änderung). Lädt die andere Ablage die höhere Version hoch, **aktualisiert** ihr Ablago das Paket wie jedes Update: Es ergänzt neue Felder, Register und Ansichten und löscht nichts.

!!! note "Keine Daten im Paket"
    Ein Paket enthält nur den Aufbau – Mappentypen und Ansichten. Notizen, Benutzer und Passwörter kommen nie mit; aus ausdrücklich gewählten Beispiel-Mappen nur Feldwerte ohne Passwörter und – nur mit dem Haken **Mit ihren Dokumenten** – ihre Dokumente. Paket erstellen dürfen nur Administratoren; das Protokoll vermerkt jeden Export.

## Eigene Pakete

Ein selbst erstelltes Paket kannst du auch in die Registry einreichen. Wie ein Paket aufgebaut ist und wie es in den Katalog kommt, steht im [Entwicklerhandbuch](https://help.ablago.app/entwickler/aktuell/pakete/).
