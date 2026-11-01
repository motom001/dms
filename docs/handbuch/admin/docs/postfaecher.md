# Postfächer

Das DMS kann ein oder mehrere **E-Mail-Postfächer per IMAP abholen** und **jede Mail als neue [Post](https://motom001.github.io/dms/benutzer/aktuell/post/)** übernehmen. Rechnungen, Bescheide und Scans („Scan to E-Mail“), die per Mail kommen, landen so ohne Herunterladen und Hochladen im DMS.

--8<-- "ausgeblendet-organisation.md"

!!! tip "Ein eigenes Postfach"
    Nimm ein **eigenes Postfach** (z. B. `dms@…`) oder eine Weiterleitung – nicht dein privates Hauptpostfach. Das DMS verschiebt oder löscht übernommene Mails.

## Postfach einrichten

**Werkbank → Postfächer → + Neu**:

| Angabe | Bedeutung |
| --- | --- |
| Abrufen | Haken an: das DMS ruft das Postfach regelmäßig ab (Standard). Haken aus: Das Postfach bleibt eingerichtet, wird aber nicht abgerufen |
| Name | z. B. „Rechnungen“; steht in der Historie der Post |
| Server, Verschlüsselung, Port | meist SSL/TLS und Port 993; STARTTLS meist Port 143. Ohne Verschlüsselung nur nach ausdrücklicher Bestätigung |
| Anmeldung | **Passwort (oder App-Passwort)** – Standard, wie bei allen älteren Postfächern – oder **OAuth 2.0** mit Anbieter *Microsoft 365 / Outlook.com*, *Gmail / Google Workspace* oder *anderer Anbieter*, siehe [Anmeldung mit OAuth](#anmeldung-mit-oauth) |
| Benutzername, Passwort | das Passwort wird mit dem [Schlüssel](verschluesselung.md) verschlüsselt gespeichert und nie wieder angezeigt; leer lassen behält es. Bei OAuth gibt es kein Passwort; Benutzername ist die Mail-Adresse des Kontos |
| Ordner | Standard `INBOX` |
| Abrufabstand | in Minuten, 1 bis 1440 (ein Tag), Standard 5 |
| Für | optional: dieser Benutzer steht an jeder Post und hat sie unter „Zu erledigen“ |
| Nur von diesen Absendern | optional: Adressen (`rechnung@stadtwerke.de`) oder Domains (`bank.de`, auch Unterdomains) |
| Nach dem Übernehmen | **in einen Ordner verschieben** (Standard `DMS`, wird angelegt), **nur als gelesen markieren** oder **löschen** |
| Nur Mails mit Anhang | andere bleiben unverändert im Postfach |
| Original-Mail als .eml | Standard ein: die ganze Mail liegt zusätzlich als Dokument an der Post |

**Verbindung testen** meldet sich an, nennt die Zahl der Mails im Ordner und sagt bei Fehlern, woran es liegt: Anmeldung abgelehnt, Server nicht erreichbar, Zertifikat ungültig. Ein gespeichertes Passwort (oder die OAuth-Anmeldung) geht dabei nur an den gespeicherten Server, Port und die gespeicherte Verschlüsselung: Änderst du eins davon, gib das Passwort neu ein (bzw. speichere und melde dich neu an). **Jetzt abrufen** holt sofort ab. **Entfernen** löscht das Postfach aus dem DMS, nach einer Rückfrage; die Mails im Postfach bleiben, wie sie sind.

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
| Outlook.com / Hotmail, Microsoft 365 | `outlook.office365.com`, 993 | Microsoft nimmt Benutzername und Passwort für IMAP nicht mehr an – nimm die [Anmeldung mit OAuth](#anmeldung-mit-oauth) |

## Anmeldung mit OAuth

Bei **Microsoft 365, Outlook.com** und auf Wunsch bei **Gmail** meldet sich das DMS mit **OAuth 2.0** an (IMAP mit XOAUTH2): Du meldest dich einmal beim Anbieter an und erlaubst dem DMS den Zugriff auf das Postfach. Das DMS bekommt dafür Token statt eines Passworts und erneuert sie selbst.

Dafür brauchst du eine **eigene App-Registrierung** beim Anbieter – das DMS-Projekt betreibt keinen gemeinsamen Dienst. Die App gilt für alle Postfächer dieses Anbieters in deinem DMS.

### So geht es

1. Unter [E-Mail und Adresse](installation.md#e-mail-und-adresse) die **Adresse des DMS** eintragen (z. B. `https://dms.example.org`). Daraus entsteht die **Umleitungs-URI** `https://dms.example.org/api/oauth/postfach/rueckruf`; die Werkbank zeigt sie an. Die Anmeldung im Browser braucht eine **https-Adresse** (http nur über `localhost`); ohne sie geht bei Microsoft der **Gerätecode** (siehe unten).
2. Beim Anbieter die App anlegen (Anleitungen unten).
3. **Werkbank → Postfächer → + Neu**: *Anmeldung* **OAuth 2.0**, *Anbieter* wählen – Server, Port und Verschlüsselung sind vorbelegt (`outlook.office365.com` bzw. `imap.gmail.com`, 993, SSL/TLS). *Benutzername* ist die Mail-Adresse des Postfachs. **Speichern**.
4. Unter *App beim Anbieter* **Client-ID** und **Client-Geheimnis** eintragen, bei Microsoft den **Mandanten**, **App speichern**.
5. **Im Browser anmelden**: Das DMS leitet dich zum Anbieter; nach der Anmeldung und Zustimmung kommst du zurück in die Werkbank. Oder **Mit Gerätecode anmelden**: Das DMS zeigt einen Code und eine Adresse; dort meldest du dich auf einem beliebigen Gerät an, die Werkbank wartet so lange.
6. **Verbindung testen**.

![Werkbank → Postfächer: Anmeldung mit OAuth 2.0](bilder/werkbank-postfach-oauth.png)

Der *Zustand* zeigt, wann und von wem angemeldet wurde. **Abmelden** löscht die gespeicherten Token (bei Google widerruft das DMS sie zusätzlich beim Anbieter); danach holt das DMS dort nichts mehr ab. Änderst du am Postfach Server, Port oder Verschlüsselung oder an der App den Mandanten bzw. Token-Endpunkt, meldet das DMS die betroffenen Postfächer ebenfalls ab – melde sie danach neu an. OAuth geht nur mit Verschlüsselung (SSL/TLS oder STARTTLS).

!!! note "Sicherheit"
    Token und Client-Geheimnis speichert das DMS nur mit dem [Schlüssel](verschluesselung.md) verschlüsselt. Sie erscheinen nie in der Oberfläche, nicht im [Vollexport](export.md) und nicht im Protokoll; in der [Sicherung](sicherung.md) nur verschlüsselt. Die Anmeldung im Browser ist mit PKCE und einem einmaligen, 10 Minuten gültigen Wert geschützt und gilt nur für den Administrator und den Browser, die sie begonnen haben.

### Abgelaufene Anmeldung

Das DMS erneuert die Anmeldung vor Ablauf selbst. Lehnt der Anbieter das ab – die Anmeldung ist abgelaufen, wurde beim Anbieter entzogen oder das Passwort des Kontos wurde geändert –, dann

- steht am Postfach *abgelaufen oder entzogen* mit dem Grund,
- warnen die **Übersicht** und die Leiste der Werkbank (*Postfächer* mit „!“),
- bekommen die Administratoren **eine** Mail (nicht bei jedem Versuch erneut),
- ruht der Abruf dieses Postfachs, bis du **neu anmeldest**.

### Microsoft Entra (Microsoft 365, Outlook.com)

1. Im [Microsoft Entra Admin Center](https://entra.microsoft.com) → *Anwendungen* → **App-Registrierungen** → *Neue Registrierung*.
2. *Name* z. B. „DMS Postfächer“. *Unterstützte Kontotypen*: nur dein Verzeichnis (Microsoft 365), oder **Konten in einem beliebigen Organisationsverzeichnis und persönliche Microsoft-Konten**, wenn auch Outlook.com-Postfächer dazugehören.
3. *Umleitungs-URI*: Plattform **Web**, Adresse aus der Werkbank (`https://<dms>/api/oauth/postfach/rueckruf`). Ohne öffentliche Adresse leer lassen und den Gerätecode nutzen.
4. Nach dem Anlegen: Die **Anwendungs-ID (Client-ID)** von der *Übersicht* in die Werkbank übernehmen; die **Verzeichnis-ID (Tenant)** als *Mandant* – oder `common` (beliebige Konten), `consumers` (nur Outlook.com), `organizations`.
5. **Zertifikate & Geheimnisse** → *Neuer geheimer Clientschlüssel* → den **Wert** (nicht die ID) als Client-Geheimnis eintragen. Läuft das Geheimnis ab, hier ein neues anlegen und in der Werkbank ersetzen.
6. **API-Berechtigungen** → *Berechtigung hinzufügen* → *APIs, die meine Organisation verwendet* → **Office 365 Exchange Online** (bzw. unter *Microsoft Graph*) → *Delegierte Berechtigungen* → **IMAP.AccessAsUser.All**; dazu **offline_access**. In Microsoft 365 die *Administratorzustimmung erteilen*.
7. Für den **Gerätecode**: *Authentifizierung* → *Erweiterte Einstellungen* → **Öffentliche Clientflows zulassen** auf *Ja*.
8. In Microsoft 365 muss **IMAP für das Postfach** eingeschaltet sein (Microsoft 365 Admin Center → Benutzer → *E-Mail* → *E-Mail-Apps verwalten* → IMAP).

### Google Cloud (Gmail, Google Workspace)

!!! warning "Privates Gmail-Konto: lieber App-Passwort"
    Für Gmail braucht OAuth den eingeschränkten Bereich `https://mail.google.com/`. Eine selbst angelegte App im Status **„Test“** bekommt Anmeldungen, die **nach 7 Tagen ablaufen** – du müsstest jede Woche neu anmelden. Ohne diese Grenze geht es nur mit einer App vom Typ **„Intern“** in Google Workspace oder nach Googles Prüfung (für Privatleute kaum machbar). Für private Konten ist daher ein [App-Passwort](#app-passworter) die bessere Wahl.

1. In der [Google Cloud Console](https://console.cloud.google.com) ein Projekt anlegen; unter *APIs & Dienste* → *Bibliothek* die **Gmail API** aktivieren.
2. *OAuth-Zustimmungsbildschirm*: Nutzertyp **Intern** (Workspace) oder **Extern**; bei *Extern* im Status *Test* dich selbst als **Testnutzer** eintragen. Bereich `https://mail.google.com/` hinzufügen.
3. *Anmeldedaten* → *Anmeldedaten erstellen* → **OAuth-Client-ID**, Typ **Webanwendung**; *Autorisierte Weiterleitungs-URIs*: die Adresse aus der Werkbank.
4. **Client-ID** und **Clientschlüssel** in die Werkbank eintragen.

Google bietet für Gmail keinen Gerätecode an; das DMS braucht dafür eine Adresse, die dein Browser erreicht (https).

### Anderer Anbieter

Für andere Anbieter mit IMAP und OAuth 2.0 trägst du *Autorisierungs-Endpunkt*, *Token-Endpunkt*, wahlweise den *Gerätecode-Endpunkt* und den *Bereich* (Scope, meist mit `offline_access`) selbst ein – sie stehen in der Dokumentation des Anbieters. Je DMS gibt es eine solche Einstellung.

## Was beim Übernehmen passiert

- **Jede Mail wird eine Post**: Kanal *E-Mail*, Richtung eingehend, Stand *Neu*; Betreff, Datum und Absender (Name und Adresse) aus der Mail; *Für* aus dem Postfach. Angelegt hat sie das *Postfach*, kein Benutzer. Die Historie nennt Postfach, Absender und Zeit.
- **Anhänge** werden einzelne Dokumente. Kleine eingebettete Bilder (Logos, Signaturen) werden übersprungen; angehängte Mails bleiben ein `.eml`-Dokument.
- **Doppelte Anhänge:** Liegt ein Anhang schon im DMS (gleicher Prüfwert), wird er trotzdem übernommen; die Historie der Post sagt „Doppelt: „Rechnung.pdf“ liegt schon im DMS – vor dem Zuordnen prüfen.“ Wo, zeigt **Zuordnen** jedem, der die andere Mappe lesen darf.
- Der **Text der Mail** steht als reiner Text an der Post. HTML wird in Text umgewandelt; Bilder oder andere Inhalte aus dem Internet lädt das DMS nie.
- Es gelten die Grenzen wie beim Hochladen. Ein zu großer Anhang steht mit Grund in der Historie; die übrigen werden übernommen. Ist die [Speicherplatz](speicherplatz.md)-Grenze erreicht, bleibt die Mail im Postfach.
- **Keine doppelte Übernahme** – auch nicht nach einem Neustart, einem Absturz mitten im Abruf oder wenn der Server seine Nummerierung neu beginnt (UIDVALIDITY). Erst wenn die Post gespeichert ist, wird die Mail verschoben, markiert oder gelöscht.
- Im [Wartungsmodus](wartungsmodus.md) und während einer [Wiederherstellung](wiederherstellen.md) ruht der Abruf. Laufen mehrere Instanzen, ruft nur eine ab. Die Einstellungen sind Teil der [Sicherung](sicherung.md), Passwort und Token bleiben verschlüsselt.
