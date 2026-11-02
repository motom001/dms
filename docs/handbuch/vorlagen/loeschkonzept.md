# Löschkonzept: Aufbewahren, Sperren und Löschen mit dem DMS

> **Vorlage.** Alles in [eckigen Klammern] ersetzt du durch deine Angaben oder streichst es. Die übrigen Texte beschreiben, was das DMS tut, und passen, solange du es so einsetzt wie beschrieben. Die Vorlage ist ein Ausgangspunkt, **keine Rechtsberatung** – stimme Fristen und Gründe mit deiner Steuerberatung bzw. deinem Datenschutzbeauftragten ab. Bewahre dieses Löschkonzept selbst auf (z. B. als Mappe im DMS) und halte die Änderungstabelle am Ende aktuell.

## 1. Allgemeines

| | |
| --- | --- |
| Verantwortlicher | [Name, Anschrift – wie unter Werkbank → Datenschutz → Einstellungen] |
| Ansprechpartner für Datenschutz | [Name, E-Mail – ggf. Datenschutzbeauftragter] |
| Verantwortlich für Löschungen | [Name] |
| Vertretung | [Name] |
| Eingesetzte Software | DMS (Open Source, https://github.com/motom001/dms), Version [z. B. 0.99.0] (Werkbank → Technik), selbst betrieben auf [Gerät / Anbieter] |
| Geltungsbereich | [Welche Daten: z. B. Mieter und Mietverhältnisse, Kunden, Lieferanten, Beschäftigte …] |
| Gültig ab | [Datum] |

## 2. Datenarten und Fristen

Jeder **Mappentyp** im DMS ist eine Datenart. Die Liste der Mappentypen steht unter **Werkbank → Mappentypen**; der Zweck je Mappentyp, der eine Person betrifft, unter **Werkbank → Datenschutz → Einstellungen**.

| Datenart (Mappentyp) | Betroffene | Zweck | Frist | Grund der Frist | Beginn der Frist (Stichtag) | Sperre im DMS | Löschweg |
| --- | --- | --- | --- | --- | --- | --- | --- |
| [Rechnung] | [Kunden, Lieferanten] | [Buchführung] | [8 Jahre] | [§ 147 AO, § 14b UStG] | [Rechnungsdatum, ab Ende des Kalenderjahres] | Archivmodus | Darf weg |
| [Geschäftsbrief / Post] | [Absender, Empfänger] | [Geschäftsverkehr] | [6 Jahre] | [§ 147 AO, § 257 HGB] | [Datum, ab Ende des Kalenderjahres] | Archivmodus | Darf weg |
| [Mietvertrag] | [Mieter] | [Durchführung des Mietverhältnisses] | [Ende des Mietverhältnisses + 3 Jahre] | [Verjährung, § 195 BGB] | [Vertragsende] | [Archivmodus / Ansicht] | [Darf weg / Ansicht] |
| [Mieter / Kunde / Kontakt] | [die Person] | [Kontakt, Vertragsdurchführung] | [solange ein Vertrag besteht + …] | [Zweck entfällt] | [letzter Vertrag endet] | [keine] | [Ansicht „…“, löschen von Hand] |
| [Bewerbung] | [Bewerber] | [Stellenbesetzung] | [6 Monate nach Absage] | [Abwehr von Ansprüchen nach AGG] | [Datum der Absage] | [keine] | [Ansicht „…“, löschen von Hand] |
| [Weitere] | | | | | | | |

**Sperre im DMS:**

- **Archivmodus** (Werkbank → Mappentypen → Archivmodus): Mappen und Dokumente dieses Mappentyps lassen sich bis zum Ende der Aufbewahrungsfrist nicht löschen – auch nicht von Administratoren, über den Papierkorb oder die Schnittstelle. Dokumente ändern sich nur als neue Version. Die Frist läuft bis zum 31.12. des Stichtagsjahres plus die Jahre.
- **Keine:** Die Mappen lassen sich jederzeit löschen. Wer das darf, regeln die Berechtigungen (Abschnitt 5).

**Löschweg:**

- **Darf weg:** Nach Fristende stehen die Mappen unter **Werkbank → Darf weg**. Das DMS löscht nie von selbst.
- **Ansicht:** Für Fristen ohne Archivmodus zeigt die Ansicht [Name] die fälligen Mappen nach dem Feld [Datumsfeld].

## 3. Regelmäßiges Löschen

- [Wer] geht [jährlich, z. B. im Januar] **Werkbank → Darf weg** und die Ansichten aus Abschnitt 2 durch und löscht, was weg darf. [Wer] hält fest, wann das geschah (Abschnitt 8).
- Gelöschte Mappen und Dokumente kommen in den **Papierkorb** (Werkbank → Papierkorb, Aufbewahrung [z. B. 30 Tage]). Danach löscht das DMS sie mit ihren Dateien und dem Volltext endgültig. [Oder: Der Papierkorb wird nach dem Löschen sofort geleert.]
- Die **Historie endgültig gelöschter Mappen** bleibt [z. B. 365 Tage] (Werkbank → Papierkorb), damit sich nachvollziehen lässt, was mit ihnen geschah. Die Historie lebender Mappen und von Mappen im Archivmodus bleibt immer.

## 4. Sperren auf Verlangen

Verlangt eine Person die Löschung, aber eine Aufbewahrungsfrist steht entgegen (Art. 17 Abs. 3 DSGVO), werden ihre Daten bis Fristende **gesperrt** (Art. 18 DSGVO):

- Mappen im Archivmodus sind gegen Löschen gesperrt (Abschnitt 2).
- **Zugriff:** Der Mappentyp hat das Ja/Nein-Feld [Gesperrt]. Eine Regel in den Berechtigungen erlaubt bei „Gesperrt ist ja“ Lesen und Bearbeiten nur der Rolle [Datenschutz]. Administratoren sehen weiterhin alles.
- An der Mappe steht eine Notiz mit Datum der Anfrage und dem Ende der Sperre.
- Nach Fristende wird gelöscht wie in Abschnitt 3.

## 5. Wer löschen darf

- Löschen dürfen [z. B. nur die Rolle … / alle, die die Mappe bearbeiten dürfen] (Werkbank → Mappentypen → Berechtigungen, Recht „Löschen“).
- Endgültig löschen und den Papierkorb leeren: jeder Benutzer für das, was er selbst gelöscht hat; Administratoren für alles (Werkbank → Papierkorb).
- Administratoren: [Namen]. Für sie gelten die Berechtigungen nicht.

## 6. Kopien außerhalb der Ablage

Gelöschte Daten können noch an diesen Stellen liegen; sie fallen so weg:

| Wo | Wie lange | Wie gelöscht |
| --- | --- | --- |
| Automatische Sicherungen (Werkbank → Sicherung) | [7 tägliche, 4 wöchentliche, 12 monatliche] | das DMS entfernt ältere Sicherungen nach jeder automatischen Sicherung |
| Von Hand angelegte Sicherungen | bis zum Löschen | [Wer] löscht sie [wann] |
| Kopie der Sicherungen außer Haus | [z. B. die letzten 4 Wochen] | [Wer, wie] |
| Vollexporte (`export/` im Sicherungsordner) | bis zum Löschen | Werkbank → Vollexport → Löschen, [spätestens nach …] |
| Persönliche Exporte der Benutzer | bis zum nächsten Export des Benutzers | [Hinweis an die Benutzer] |
| Bereitliegende Auskünfte | höchstens 7 Tage, mit Abruf-Link bis dieser abläuft | das DMS löscht sie selbst |
| Protokoll (Werkbank → Protokoll, Container-Logs) | 24 Stunden in der Werkbank; Container-Logs [nach Einstellung von Docker] | [ggf. Log-Rotation einstellen] |
| Heruntergeladene Dateien, Ausdrucke, E-Mails | [Regel] | [Regel] |

## 7. Benutzerkonten

- Konten, die schon benutzt wurden, werden **deaktiviert**, nicht gelöscht (Werkbank → Benutzer → Zugang sperren). Der Name bleibt bei „angelegt von“ und in der Historie stehen.
- Einladungen, die nie angenommen wurden, werden gelöscht.
- [Wer] deaktiviert Konten von Personen, die gehen, [am letzten Arbeitstag].

## 8. Nachweis

- Das DMS führt ein **Löschprotokoll** (Werkbank → Datenschutz → Löschprotokoll): je gelöschter Mappe Mappentyp, Id und Nummer, wann, von wem, warum und in welchem Vorgang; je gelöschtem Dokument die Prüfsumme (SHA-256), Größe, Dateityp und Seitenzahl – **ohne** Titel, Feldwerte und Dateinamen. Es lässt sich nicht ändern und bleibt [10] Jahre.
- Bei Löschungen auf Verlangen wählt, wer löscht, den Grund „Auf Verlangen der betroffenen Person“. [Wer] gibt das Löschprotokoll bei Bedarf als PDF aus.
- Auskünfte nach Art. 15 DSGVO stehen mit Nachweis in der Historie der Person (Werkbank → Datenschutz).

## 9. Änderungen dieses Löschkonzepts

| Datum | Was geändert | Wer |
| --- | --- | --- |
| [Datum] | erste Version | [Name] |
