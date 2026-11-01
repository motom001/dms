# Löschkonzept (Vorlage)

Wer Daten von Mietern, Kunden oder Beschäftigten verwaltet, sollte festhalten, **wie lange welche Daten bleiben, warum, wie sie bis dahin gesperrt sind und auf welchem Weg sie gelöscht werden** – ein Löschkonzept. Es zeigt dir selbst, wann was weg darf, und belegt bei einer Nachfrage, dass du die Speicherbegrenzung (Art. 5 Abs. 1 e DSGVO) und das Recht auf Löschung (Art. 17) ernst nimmst.

Das DMS **unterstützt** dabei: Mappentypen als Datenarten, der [Archivmodus](archiv.md) mit Löschsperre bis Fristende und der Liste **Darf weg**, der [Papierkorb](papierkorb.md) mit Aufbewahrung, die Aufbewahrung der [Sicherungen](sicherung.md#zeitplan-und-aufbewahrung). Wie du es Schritt für Schritt einrichtest, steht unter [Sperr- und Löschkonzept aufsetzen](datenschutz.md#sperr-und-loschkonzept-aufsetzen).

## Aus dem DMS erzeugen

Statt die Vorlage von Hand auszufüllen, lässt du das DMS ein Löschkonzept erzeugen: **Werkbank → Datenschutz → Löschkonzept → Als PDF erzeugen** oder **Als Word-Datei (.docx)** (nur Administratoren). Die Gliederung ist dieselbe wie in der Vorlage (Abschnitte 1–9), vorbelegt mit dem, was das DMS weiß:

- **Abschnitt 2 „Datenarten und Fristen“** aus deinen Mappentypen. In der Tabelle steht jeder Mappentyp, der **eine Person betrifft** (Werkbank → Datenschutz → Einstellungen), der **auf einen solchen verweist** (z. B. Rechnung → Kunde) oder für den ein **Zweck** hinterlegt ist. Je Zeile: Betroffene, Zweck, Frist und Stichtag aus dem [Archivmodus](archiv.md), Sperre im DMS (Archivmodus oder keine) und der Löschweg („Darf weg“ → Papierkorb → endgültig nach … Tagen). Mappentypen ohne Personenbezug stehen darunter in einer Zeile, damit du siehst, ob einer fehlt.
- **Weitere Abschnitte** mit deinen Einstellungen: Verantwortlicher, DMS-Version, Aufbewahrung im [Papierkorb](papierkorb.md) und der Historie gelöschter Mappen, Aufbewahrung der automatischen [Sicherungen](sicherung.md#zeitplan-und-aufbewahrung), bereitliegende Auskünfte, Benutzer werden deaktiviert statt gelöscht.
- **Was das DMS nicht wissen kann** – Rechtsgrundlage und Grund der Frist, Zuständige, eigene Ansichten für kürzere Fristen –, bleibt als **[eckige Klammer]** stehen; in der Word-Datei gelb markiert.
- **Lücken** meldet das DMS in der Werkbank und im Dokument unter „Bitte ergänzen“: Mappentyp mit Personenbezug **ohne Zweck** oder **ohne Frist** (kein Archivmodus), kein Verantwortlicher hinterlegt.
- Im Kopf stehen **Stand und DMS-Version**; der Hinweis „keine Rechtsberatung“ wie in der Vorlage.
- **Abschnitt 8 „Nachweis“** verweist auf das [Löschprotokoll](datenschutz.md#loschprotokoll) mit seiner Aufbewahrung.

![Werkbank → Datenschutz → Löschkonzept mit den Lücken „Bitte ergänzen“ und den Knöpfen für PDF und Word](bilder/werkbank-loeschkonzept.png)

Aus den Mappen selbst kommt nichts in das Dokument – keine Titel, keine Feldwerte, keine Dokumente. Erzeuge das Löschkonzept neu, wenn du Mappentypen oder Fristen änderst, und trage die Änderung in Abschnitt 9 ein.

## Die Vorlage

Wer lieber von Hand ausfüllt (oder ohne DMS anfängt): Die Vorlage beschreibt vorformuliert, was das DMS tut, und markiert alles, was du selbst ergänzt, mit **[eckigen Klammern]**:

- [Word (.docx)](vorlagen/loeschkonzept.docx)
- [LibreOffice (.odt)](vorlagen/loeschkonzept.odt)
- [Markdown auf GitHub](https://github.com/motom001/dms/blob/main/docs/handbuch/vorlagen/loeschkonzept.md)

Sie ist gegliedert in:

1. **Allgemeines** – Verantwortlicher, wer löscht, welche Version des DMS
2. **Datenarten und Fristen** – je Mappentyp: Betroffene, Zweck, Frist, Grund, Stichtag, Sperre im DMS, Löschweg
3. **Regelmäßiges Löschen** – „Darf weg“, Ansichten für kürzere Fristen, Papierkorb, Historie gelöschter Mappen
4. **Sperren auf Verlangen** – Archivmodus, Zugriff über Berechtigungen, Notiz an der Mappe
5. **Wer löschen darf** – Berechtigungen, Papierkorb, Administratoren
6. **Kopien außerhalb der Ablage** – Sicherungen, Exporte, Auskünfte, Protokoll, Ausdrucke
7. **Benutzerkonten** – deaktivieren statt löschen
8. **Nachweis** – Löschungen festhalten, ohne die Daten selbst: das [Löschprotokoll](datenschutz.md#loschprotokoll)
9. **Änderungen des Löschkonzepts**

## Gut zu wissen

- **Keine Rechtsberatung.** Welche Fristen für dich gelten, klärst du mit deiner Steuerberatung bzw. deinem Datenschutzbeauftragten. Die Fristen in der Vorlage sind Beispiele.
- **Für Haushalte reicht meist weniger:** Wer nur die Unterlagen der Familie ablegt, braucht kein schriftliches Löschkonzept. Der Archivmodus für Handwerkerrechnungen (2 Jahre, § 14b UStG) und ein Blick in „Darf weg“ einmal im Jahr helfen trotzdem.
- **Die Spalte „Sperre im DMS“** kennt heute zwei Werte: *Archivmodus* (gegen Löschen gesperrt bis Fristende) und *keine*. Den Zugriff auf gesperrte Mappen schränkst du über ein Feld und eine Regel in den [Berechtigungen](berechtigungen.md) ein, siehe [Löschen auf Verlangen](datenschutz.md#loschen-auf-verlangen).
- **Sie beschreibt den heutigen Stand des DMS.** Die Vorlage hier wird mit jeder Version nachgezogen; ergänze dein Löschkonzept, wenn du neue Funktionen nutzt.

Weiter: [Datenschutz im DMS](datenschutz.md) · [Archivmodus](archiv.md) · [Papierkorb](papierkorb.md) · [Verfahrensdokumentation (Vorlage)](verfahrensdokumentation.md)
