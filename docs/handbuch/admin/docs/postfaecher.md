# Postfächer

Das DMS kann ein oder mehrere **E-Mail-Postfächer per IMAP abholen** und **jede Mail als neue [Post](https://motom001.github.io/dms/benutzer/aktuell/post/)** übernehmen. Rechnungen, Bescheide und Scans („Scan to E-Mail“), die per Mail kommen, landen so ohne Herunterladen und Hochladen im DMS.

!!! tip "Ein eigenes Postfach"
    Nimm ein **eigenes Postfach** (z. B. `dms@…`) oder eine Weiterleitung – nicht dein privates Hauptpostfach. Das DMS verschiebt oder löscht übernommene Mails.

## Postfach einrichten

**Werkbank → Postfächer → + Neu**:

| Angabe | Bedeutung |
| --- | --- |
| Name | z. B. „Rechnungen“; steht in der Historie der Post |
| Server, Verschlüsselung, Port | meist SSL/TLS und Port 993; STARTTLS meist Port 143. Ohne Verschlüsselung nur nach ausdrücklicher Bestätigung |
| Benutzername, Passwort | das Passwort wird mit dem [Schlüssel](verschluesselung.md) verschlüsselt gespeichert und nie wieder angezeigt; leer lassen behält es |
| Ordner | Standard `INBOX` |
| Abrufabstand | in Minuten, Standard 5 |
| Für | optional: dieser Benutzer steht an jeder Post und hat sie in seinem Eingang |
| Nur von diesen Absendern | optional: Adressen (`rechnung@stadtwerke.de`) oder Domains (`bank.de`, auch Unterdomains) |
| Nach dem Übernehmen | **in einen Ordner verschieben** (Standard `DMS`, wird angelegt), **nur als gelesen markieren** oder **löschen** |
| Nur Mails mit Anhang | andere bleiben unverändert im Postfach |
| Original-Mail als .eml | Standard ein: die ganze Mail liegt zusätzlich als Dokument an der Post |

**Verbindung testen** meldet sich an, nennt die Zahl der Mails im Ordner und sagt bei Fehlern, woran es liegt: Anmeldung abgelehnt, Server nicht erreichbar, Zertifikat ungültig. **Jetzt abrufen** holt sofort ab.

Unter *Stand* stehen der letzte Abruf, die zuletzt übernommenen Mails mit Link zur Post und Fehler. Schlägt der Abruf mehrmals hintereinander fehl, wartet das DMS immer länger zwischen den Versuchen (bis 6 Stunden) und schreibt den Administratoren nach dem dritten Fehler eine Mail.

## App-Passwörter

Viele Anbieter lassen Programme wie das DMS nicht mit dem normalen Passwort an das Postfach, sondern verlangen ein eigenes **App-Passwort** – oft erst, wenn die Zwei-Faktor-Anmeldung an ist.

| Anbieter | Server | Hinweis |
| --- | --- | --- |
| Gmail | `imap.gmail.com`, 993 | Google-Konto → Sicherheit → Bestätigung in zwei Schritten einschalten → **App-Passwörter** |
| GMX | `imap.gmx.net`, 993 | in den Einstellungen unter *POP3/IMAP Abruf* den Zugriff erlauben; mit Zwei-Faktor ein App-Passwort |
| WEB.DE | `imap.web.de`, 993 | in den Einstellungen *POP3/IMAP Abruf* erlauben; mit Zwei-Faktor ein App-Passwort |
| T-Online | `secureimap.t-online.de`, 993 | im Kundencenter ein eigenes **E-Mail-Passwort** anlegen (nicht das Login-Passwort) |
| iCloud | `imap.mail.me.com`, 993 | unter account.apple.com ein **app-spezifisches Passwort** erzeugen; Benutzername ist die iCloud-Mail-Adresse |
| Outlook.com / Hotmail | `outlook.office365.com`, 993 | Microsoft lässt für private Konten kaum noch Anmeldungen mit Passwort zu. Klappt es nicht, eine Weiterleitung an ein anderes Postfach einrichten |

Anmeldung per OAuth2 (z. B. Microsoft 365) gehört nicht dazu; sie kommt bei Bedarf später.

## Was beim Übernehmen passiert

- **Jede Mail wird eine Post**: Kanal *E-Mail*, Richtung eingehend, Stand *Neu*; Betreff, Datum und Absender (Name und Adresse) aus der Mail; *Für* aus dem Postfach. Angelegt hat sie das *Postfach*, kein Benutzer. Die Historie nennt Postfach, Absender und Zeit.
- **Anhänge** werden einzelne Dokumente. Kleine eingebettete Bilder (Logos, Signaturen) werden übersprungen; angehängte Mails bleiben ein `.eml`-Dokument.
- Der **Text der Mail** steht als reiner Text an der Post. HTML wird in Text umgewandelt; Bilder oder andere Inhalte aus dem Internet lädt das DMS nie.
- Es gelten die Grenzen wie beim Hochladen. Ein zu großer Anhang steht mit Grund in der Historie; die übrigen werden übernommen. Ist die [Speicherplatz](speicherplatz.md)-Grenze erreicht, bleibt die Mail im Postfach.
- **Keine doppelte Übernahme** – auch nicht nach einem Neustart, einem Absturz mitten im Abruf oder wenn der Server seine Nummerierung neu beginnt (UIDVALIDITY). Erst wenn die Post gespeichert ist, wird die Mail verschoben, markiert oder gelöscht.
- Im [Wartungsmodus](wartungsmodus.md) und während einer [Wiederherstellung](wiederherstellen.md) ruht der Abruf. Laufen mehrere Instanzen, ruft nur eine ab. Die Einstellungen sind Teil der [Sicherung](sicherung.md), das Passwort bleibt verschlüsselt.
