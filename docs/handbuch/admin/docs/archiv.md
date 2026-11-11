# Archivmodus und Aufbewahrung

Manche Belege musst du aufbewahren: Handwerkerrechnungen privat 2 Jahre (§ 14b UStG), mit Buchführung oder Einnahmen-Überschuss-Rechnung Buchungsbelege 8 Jahre (seit 2025), Bücher 10 Jahre, Geschäftsbriefe 6 Jahre – jeweils ab Ende des Kalenderjahres. Der **Archivmodus** hebt solche Mappen bis zum Ende ihrer Frist unveränderbar auf und sagt dir danach, was weg darf.

--8<-- "ausgeblendet-organisation.md"

!!! tip "Lesbar über viele Jahre"
    Damit die Dokumente die ganze Frist über lesbar bleiben, helfen drei Dinge: die [Archivfassung (PDF/A)](texterkennung.md#archivfassung-pdfa), ein Format, das auch in vielen Jahren noch jedes Programm öffnet; [Alle Dateien prüfen](#alle-dateien-prufen), das jede Datei mit ihrem Prüfwert vergleicht; und der [Vollexport](export.md), eine Kopie in offenen Formaten, die du ohne Ablago lesen kannst.

!!! warning "Unterstützt – ersetzt nichts"
    Der Archivmodus **unterstützt eine GoBD-gerechte Aufbewahrung**. Ein amtliches „GoBD-Zertifikat“ für Software gibt es nicht: Ordnungsgemäß wird es erst durch Software, Verfahren und eine **Verfahrensdokumentation** zusammen (eine Vorlage findest du unter [Verfahrensdokumentation](verfahrensdokumentation.md)). Er ersetzt weder diese noch eine Steuerberatung.

## Einschalten

Im Mappentyp unter **Archivmodus**:

- **Archivmodus einschalten** (Standard: aus).
- **Aufbewahrungsfrist** in Jahren: Vorschläge 2, 6, 8, 10 oder eine eigene Zahl (bis 30).
- **Stichtag:** welches Datumsfeld zählt, z. B. *Rechnungsdatum*; ohne Feld das Anlagedatum der Mappe. Die Frist läuft bis zum **31.12.** des Stichtagsjahres plus die Jahre – eine Rechnung vom 2. März 2026 mit 8 Jahren also bis zum 31.12.2034.
- **Ist ‹Stichtag› leer** (nur mit Datumsfeld): **ab Anlagedatum (wie bisher)** oder **läuft noch nicht ab** – siehe [unten](#ist-der-stichtag-leer).

Das gilt sofort auch für vorhandene Mappen. Beim Einschalten und Umschalten zeigt Ablago, wie viele Mappen betroffen sind, wie viele davon schon „darf weg“ wären und bei wie vielen das Datumsfeld leer ist. Ein-, Um- und Ausschalten stehen im [Protokoll](fehlersuche.md#protokoll) – erst beim **Speichern** des Mappentyps, mit dem Zustand vorher und nachher (an/aus, Frist, Stichtag, und „Ist der Stichtag leer“, sobald eine Seite „läuft noch nicht ab“ ist); Ausprobieren im Editor ohne Speichern hinterlässt keinen Eintrag. Das Ausschalten fragt vorher nach.

### Ist der Stichtag leer { #ist-der-stichtag-leer }

Bei manchem steht der Stichtag erst später fest: Ein Vertrag läuft, bis er beendet ist; ein Dokumentationsstand gilt, bis er abgelöst ist. Was gilt, solange das Datumsfeld einer Mappe leer ist, stellst du ein:

- **ab Anlagedatum (wie bisher)** – die Vorgabe. Die Frist läuft ab dem Anlagedatum der Mappe; vorhandene Mappentypen bleiben so.
- **läuft noch nicht ab** – die Mappe ist gesperrt wie in der Frist, ein Ende gibt es aber noch nicht. An der Mappe steht **Archiv · aufbewahren, Frist beginnt mit ‹Stichtag-Feld›**, unter „Aufbewahrung abgelaufen“ erscheint sie nicht. Wird das Feld gefüllt, beginnt die Frist ab diesem Datum (31.12. des Jahres plus die Jahre, wie oben) – das steht in der Historie der Mappe, ebenso, wenn es wieder geleert wird.

Beispiel: Ein Mietvertrag mit dem Stichtag *Beendet am* und 6 Jahren steht, solange er läuft, unter Aufbewahrung; wird er zum 30.6.2027 beendet, ist er bis zum 31.12.2033 aufzubewahren.

## Während der Frist

- An jeder Mappe steht **Archiv · aufbewahren bis 31.12.JJJJ**, in der Liste ein Hinweis **Archiv**. Ändert sich das Datumsfeld, ändert sich die Frist – das steht in der Historie der Mappe.
- **Keine Löschung vor Fristende:** weder die Mappe noch einzelne Dokumente, auch nicht durch Administratoren, über Mehrfachauswahl, Papierkorb oder die [Schnittstelle](api.md) (409 mit Datum, bei „läuft noch nicht ab“ mit dem Stichtag-Feld). Mappen, die schon vor dem Einschalten im Papierkorb lagen, bleiben dort bis Fristende und werden nicht automatisch geleert.
- **Dokumente ändern sich nur als neue Version:** Die [Versionierung](mappentypen.md#register) ist für alle Dokumentenregister des Mappentyps Pflicht; ältere Versionen bleiben bis Fristende („nur die letzten N“ gilt hier nicht).
- **Feldänderungen** bleiben möglich und stehen wie immer in der Historie. Die Historie dieser Mappen wird nie aufgeräumt.

<a id="nach-der-frist-darf-weg"></a>

## Nach der Frist: „Aufbewahrung abgelaufen“

Unter **Werkbank → Aufbewahrung abgelaufen** stehen alle Mappen aus Mappentypen im Archivmodus, deren Frist abgelaufen ist, mit Datum. Du wählst einzelne oder alle und löschst sie – mit Papierkorb dorthin, sonst endgültig. **Gelöscht wird nie automatisch.** Wie Archivmodus, „Aufbewahrung abgelaufen“ und Papierkorb zu einem Sperr- und Löschkonzept nach der DSGVO zusammenpassen, steht unter [Datenschutz in Ablago](datenschutz.md#sperr-und-loschkonzept-aufsetzen), mit einer [Vorlage Löschkonzept](loeschkonzept.md).

## Archivmodus aus einem Paket { #archivmodus-aus-einem-paket }

Ein [Paket](pakete.md) kann für die Mappentypen, die es **neu anlegt**, einen Archivmodus vorschlagen – etwa „2 Jahre, bei beruflicher Nutzung 10 Jahre, ab *Abgelöst am*, ist es leer: läuft noch nicht ab“. Die Vorschau beim Installieren nennt ihn je Mappentyp; mit dem Merkmal [„beruflich genutzt“](nutzung.md) gilt die längere Frist. Danach ist es dein Archivmodus: Du änderst ihn am Mappentyp wie jeden anderen.

Den Archivmodus eines **vorhandenen** Mappentyps ändert ein Paket nie – weder die Installation noch ein Update kürzt die Frist, schaltet den Archivmodus aus oder an oder ändert, was du eingestellt hast. Das Einschalten durch ein Paket steht im [Protokoll](fehlersuche.md#protokoll) mit dem Paket.

## Alle Dateien prüfen

Unter **Werkbank → Wartung → Wartungsoperationen → Alle Dateien prüfen** liest Ablago jede gespeicherte Datei – auch ältere Versionen – und vergleicht sie mit ihrem Prüfwert (SHA-256). Abweichungen („Inhalt verändert“, „Datei fehlt“) stehen mit Dokument und Mappe in der Liste und im Protokoll. Prüfe das z. B. nach einem Umzug des Speichers und vor dem Vernichten von Papier.

## Sicherung

Die Archiveinstellungen gehören zum Mappentyp und sind Teil jeder [Sicherung](sicherung.md); nach einer Wiederherstellung gelten sie unverändert.
