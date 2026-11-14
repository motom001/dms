# Löschkonzept (Vorlage)

Wer Daten von Mietern, Kunden oder Beschäftigten verwaltet, sollte festhalten, **wie lange welche Daten bleiben, warum, wie sie bis dahin gesperrt sind und auf welchem Weg sie gelöscht werden** – ein Löschkonzept. Es zeigt dir selbst, wann was weg darf, und belegt bei einer Nachfrage, dass du die Speicherbegrenzung (Art. 5 Abs. 1 e DSGVO) und das Recht auf Löschung (Art. 17) ernst nimmst.

Ablago **unterstützt** dabei: Mappentypen als Datenarten, der [Archivmodus](archiv.md) mit Löschsperre bis Fristende und der Liste **Aufbewahrung abgelaufen**, der [Papierkorb](papierkorb.md) mit Aufbewahrung, die Aufbewahrung der [Sicherungen](sicherung.md#zeitplan-und-aufbewahrung). Wie du es Schritt für Schritt einrichtest, steht unter [Sperr- und Löschkonzept aufsetzen](datenschutz.md#sperr-und-loschkonzept-aufsetzen).

## Aus Ablago erzeugen { #aus-dem-dms-erzeugen }

Statt die Vorlage von Hand auszufüllen, lässt du Ablago ein Löschkonzept erzeugen: **Werkbank → Datenschutz → Löschkonzept → Als PDF erzeugen** oder **Als Word-Datei (.docx)** (nur Administratoren). Die Gliederung ist dieselbe wie in der Vorlage (Abschnitte 1–9), vorbelegt mit dem, was Ablago weiß:

- **Abschnitt 2 „Datenarten und Fristen“** aus deinen Mappentypen. In der Tabelle steht jeder Mappentyp, der **eine Person betrifft** (Werkbank → Datenschutz → Löschkonzept → Personendaten in Mappentypen), der **auf einen solchen verweist** (z. B. Rechnung → Kunde) oder für den ein **Zweck** hinterlegt ist. Je Zeile: Betroffene, Zweck, Frist und Stichtag aus dem [Archivmodus](archiv.md), Sperre in Ablago (Archivmodus oder keine) und der Löschweg („Aufbewahrung abgelaufen“ → Papierkorb → endgültig nach … Tagen). Mappentypen ohne Personenbezug stehen darunter in einer Zeile, damit du siehst, ob einer fehlt.
- **Weitere Abschnitte** mit deinen Einstellungen: Verantwortlicher, Ablago-Version, Aufbewahrung im [Papierkorb](papierkorb.md) und der Historie gelöschter Mappen, Aufbewahrung der automatischen [Sicherungen](sicherung.md#zeitplan-und-aufbewahrung), bereitliegende Auskünfte, Benutzer werden deaktiviert statt gelöscht.
- **Was Ablago nicht wissen kann** – Rechtsgrundlage und Grund der Frist, Zuständige, eigene Ansichten für kürzere Fristen –, bleibt als **[eckige Klammer]** stehen; in der Word-Datei gelb markiert.
- **Lücken** meldet Ablago in der Werkbank (der Eintrag **Löschkonzept** trägt dann ein „!“) unter **Bitte ergänzen** – je Mappentyp **eine** Zeile mit dem Grund und dem, was fehlt, z. B. „**Konto** – enthält Personendaten, weil er über „Inhaber“ auf Person verweist. Es fehlen: Zweck · Aufbewahrungsfrist.“ Daneben führen **Zweck eintragen** (springt zum Zweck-Feld unter **Personendaten in Mappentypen**) und **Frist festlegen** (öffnet den [Archivmodus](archiv.md) dieses Mappentyps) direkt an die richtige Stelle. Den Verantwortlichen nimmt Ablago von der [eigenen Organisation](organisation.md).
- **Warum ein Mappentyp dabei ist**, obwohl du ihn nicht angekreuzt hast: Er verweist über ein Verweisfeld auf einen Mappentyp, der eine Person betrifft (Konto → „Inhaber“ → Person). Unter **Personendaten in Mappentypen** steht dann „enthält Personendaten über „Inhaber“ auf Person · automatisch“. Mappentypen ganz ohne Personendaten stehen eingeklappt unter **Weitere Mappentypen (ohne Personendaten)**.
- **Aufgeräumt (#1184):** Ganz oben steht die Zusammenfassung, z. B. „16 vollständig · 3 mit Lücken“, gleich daneben **Als PDF erzeugen** und **Als Word-Datei (.docx)**. Unter **Personendaten in Mappentypen** sind nur die Mappentypen **mit Lücken** aufgeklappt; **Vollständig** und **Weitere Mappentypen (ohne Personendaten)** sind zugeklappt. Was du auf- oder zuklappst, merkt sich dein Gerät. **Zweck eintragen** klappt den passenden Abschnitt bei Bedarf auf. Das [Löschprotokoll](datenschutz.md#loschprotokoll) ist ein eigener Eintrag der Gruppe Datenschutz.
- **Fertig ist das Löschkonzept**, wenn alle Lücken gefüllt sind. Es muss aber nicht fertig sein, damit du es erzeugen kannst: Fehlt etwas, steht im Dokument ein [Platzhalter] – ohne Archivmodus z. B. „[Frist]“ –, den du dort auch von Hand füllen kannst.
- Im Kopf stehen **Stand und Ablago-Version**; der Hinweis „keine Rechtsberatung“ wie in der Vorlage.
- **Abschnitt 8 „Nachweis“** verweist auf das [Löschprotokoll](datenschutz.md#loschprotokoll) mit seiner Aufbewahrung.

![Werkbank → Datenschutz → Löschkonzept mit den Lücken „Bitte ergänzen“ und den Knöpfen für PDF und Word](bilder/werkbank-loeschkonzept.png)

Aus den Mappen selbst kommt nichts in das Dokument – keine Titel, keine Feldwerte, keine Dokumente. Erzeuge das Löschkonzept neu, wenn du Mappentypen oder Fristen änderst, und trage die Änderung in Abschnitt 9 ein.

## Die Vorlage

Wer lieber von Hand ausfüllt (oder ohne Ablago anfängt): Die Vorlage beschreibt vorformuliert, was Ablago tut, und markiert alles, was du selbst ergänzt, mit **[eckigen Klammern]**:

- [Word (.docx)](vorlagen/loeschkonzept.docx)
- [LibreOffice (.odt)](vorlagen/loeschkonzept.odt)
- [Markdown auf GitHub](https://github.com/motom001/dms/blob/main/docs/handbuch/vorlagen/loeschkonzept.md)

Sie ist gegliedert in:

1. **Allgemeines** – Verantwortlicher, wer löscht, welche Version von Ablago
2. **Datenarten und Fristen** – je Mappentyp: Betroffene, Zweck, Frist, Grund, Stichtag, Sperre in Ablago, Löschweg
3. **Regelmäßiges Löschen** – „Aufbewahrung abgelaufen“, Ansichten für kürzere Fristen, Papierkorb, Historie gelöschter Mappen
4. **Sperren auf Verlangen** – Archivmodus, Zugriff über Berechtigungen, Notiz an der Mappe
5. **Wer löschen darf** – Berechtigungen, Papierkorb, Administratoren
6. **Kopien außerhalb der Ablage** – Sicherungen, Exporte, Auskünfte, Protokoll, Ausdrucke
7. **Benutzerkonten** – deaktivieren statt löschen
8. **Nachweis** – Löschungen festhalten, ohne die Daten selbst: das [Löschprotokoll](datenschutz.md#loschprotokoll)
9. **Änderungen des Löschkonzepts**

## Gut zu wissen

- **Keine Rechtsberatung.** Welche Fristen für dich gelten, klärst du mit deiner Steuerberatung bzw. deinem Datenschutzbeauftragten. Die Fristen in der Vorlage sind Beispiele.
- **Wann du es brauchst:** In der Regel brauchen Selbständige, Vermieter und Betriebe ein Löschkonzept, weil sie Daten anderer Personen aufbewahren. Im rein privaten Haushalt ist es eine Hilfe zum Aufräumen, keine Pflicht.
- **Für Haushalte reicht meist weniger:** Wer nur die Unterlagen der Familie ablegt, braucht kein schriftliches Löschkonzept. Der Archivmodus für Handwerkerrechnungen (2 Jahre, § 14b UStG) und ein Blick in „Aufbewahrung abgelaufen“ einmal im Jahr helfen trotzdem.
- **Die Spalte „Sperre in Ablago“** kennt heute zwei Werte: *Archivmodus* (gegen Löschen gesperrt bis Fristende) und *keine*. Den Zugriff auf gesperrte Mappen schränkst du über ein Feld und eine Regel in den [Berechtigungen](berechtigungen.md) ein, siehe [Löschen auf Verlangen](datenschutz.md#loschen-auf-verlangen).
- **Sie beschreibt den heutigen Stand von Ablago.** Die Vorlage hier wird mit jeder Version nachgezogen; ergänze dein Löschkonzept, wenn du neue Funktionen nutzt.

Weiter: [Datenschutz in Ablago](datenschutz.md) · [Archivmodus](archiv.md) · [Papierkorb](papierkorb.md) · [Verfahrensdokumentation (Vorlage)](verfahrensdokumentation.md)
