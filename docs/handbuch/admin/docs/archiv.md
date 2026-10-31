# Archivmodus und Aufbewahrung

Manche Belege musst du aufbewahren: Handwerkerrechnungen privat 2 Jahre (§ 14b UStG), mit Buchführung oder Einnahmen-Überschuss-Rechnung Buchungsbelege 8 Jahre (seit 2025), Bücher 10 Jahre, Geschäftsbriefe 6 Jahre – jeweils ab Ende des Kalenderjahres. Der **Archivmodus** hebt solche Mappen bis zum Ende ihrer Frist unveränderbar auf und sagt dir danach, was weg darf.

--8<-- "ausgeblendet-organisation.md"

!!! warning "Unterstützt – ersetzt nichts"
    Der Archivmodus **unterstützt eine GoBD-gerechte Aufbewahrung**. Ein amtliches „GoBD-Zertifikat“ für Software gibt es nicht: Ordnungsgemäß wird es erst durch Software, Verfahren und eine **Verfahrensdokumentation** zusammen (eine Vorlage liegt im Repository unter `docs/handbuch/vorlagen/verfahrensdokumentation.md`). Er ersetzt weder diese noch eine Steuerberatung.

## Einschalten

Im Mappentyp unter **Archivmodus**:

- **Archivmodus einschalten** (Standard: aus).
- **Aufbewahrungsfrist** in Jahren: Vorschläge 2, 6, 8, 10 oder eine eigene Zahl (bis 30).
- **Stichtag:** welches Datumsfeld zählt, z. B. *Rechnungsdatum*; ohne Feld das Anlagedatum der Mappe. Die Frist läuft bis zum **31.12.** des Stichtagsjahres plus die Jahre – eine Rechnung vom 2. März 2026 mit 8 Jahren also bis zum 31.12.2034. Ist das Datumsfeld einer Mappe leer, zählt ihr Anlagedatum.

Das gilt sofort auch für vorhandene Mappen. Beim Einschalten zeigt das DMS, wie viele Mappen betroffen sind und wie viele davon schon „darf weg“ wären. Ein-, Um- und Ausschalten stehen im [Protokoll](fehlersuche.md#protokoll); das Ausschalten fragt vorher nach.

## Während der Frist

- An jeder Mappe steht **Archiv · aufbewahren bis 31.12.JJJJ**, in der Liste ein Hinweis **Archiv**. Ändert sich das Datumsfeld, ändert sich die Frist – das steht in der Historie der Mappe.
- **Keine Löschung vor Fristende:** weder die Mappe noch einzelne Dokumente, auch nicht durch Administratoren, über Mehrfachauswahl, Papierkorb oder die [Schnittstelle](api.md) (409 mit Datum). Mappen, die schon vor dem Einschalten im Papierkorb lagen, bleiben dort bis Fristende und werden nicht automatisch geleert.
- **Dokumente ändern sich nur als neue Version:** Die [Versionierung](mappentypen.md#register) ist für alle Dokumentenregister des Typs Pflicht; ältere Versionen bleiben bis Fristende („nur die letzten N“ gilt hier nicht).
- **Feldänderungen** bleiben möglich und stehen wie immer in der Historie. Die Historie dieser Mappen wird nie aufgeräumt.

## Nach der Frist: „Darf weg“

Unter **Werkbank → Darf weg** stehen alle Mappen aus Typen im Archivmodus, deren Frist abgelaufen ist, mit Datum. Du wählst einzelne oder alle und löschst sie – mit Papierkorb dorthin, sonst endgültig. **Gelöscht wird nie automatisch.**

## Alle Dateien prüfen

Unter **Werkbank → Wartungsoperationen → Alle Dateien prüfen** liest das DMS jede gespeicherte Datei – auch ältere Versionen – und vergleicht sie mit ihrem Prüfwert (SHA-256). Abweichungen („Inhalt verändert“, „Datei fehlt“) stehen mit Dokument und Mappe in der Liste und im Protokoll. Prüfe das z. B. nach einem Umzug des Speichers und vor dem Vernichten von Papier.

## Sicherung

Die Archiveinstellungen gehören zum Mappentyp und sind Teil jeder [Sicherung](sicherung.md); nach einer Wiederherstellung gelten sie unverändert.
