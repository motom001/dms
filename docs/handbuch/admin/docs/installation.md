# Einrichtung und Betrieb

Wie du Ablago installierst – auf Synology, UGREEN, QNAP, TrueNAS, Unraid, umbrelOS, ZimaOS, CasaOS oder jedem Server mit Docker –, steht im eigenen Bereich **[Wie komme ich an ein DMS?](https://help.ablago.app/installieren/aktuell/)**. Diese Seite beschreibt, was danach kommt: den Einrichtungsassistenten, die Anbindung an die Datenbank, Ordner, Einstellungen und den Betrieb hinter einem Reverse-Proxy.

--8<-- "ausgeblendet-schritt.md"

Ablago läuft – **empfohlen** – als zwei Container: die Anwendung (`ghcr.io/motom001/dms`) und PostgreSQL (`postgres:17`). Alternativ gibt es **`ghcr.io/motom001/dms-komplett`**, in dem beides in einem Container läuft (Gegenüberstellung unter [Ein oder zwei Container?](https://help.ablago.app/installieren/aktuell/#ein-oder-zwei-container)). Bei jedem Push auf `main` baut GitHub Actions beide Images neu (Tag `main`, zusätzlich je Commit ein Kurz-Hash und je Release die Versionsnummer).

!!! warning "Erst einrichten, dann freigeben"
    Mach Ablago erst über einen Reverse-Proxy oder Port-Freigabe erreichbar, wenn die Einrichtung abgeschlossen ist. Der Einrichtungscode schützt zwar davor, dass ein Fremder sie übernimmt – sicherer ist es trotzdem.

## Der Einrichtungsassistent

Beim ersten Aufruf führt ein Assistent in zehn Schritten durch die Einrichtung. Jeder Schritt hat oben ein **?**, das genau den passenden Abschnitt hier öffnet.

**Erst sammeln, dann einrichten:** Sprache, Code, Datenbank und „Neu oder Sicherung“ wirken sofort, weil sie technisch nötig sind. Ab „Ablage“ sammelt der Assistent nur: Name der Ablage, dein Konto, Pakete und Optionales. Angelegt wird dabei **nichts**. Mit **Zurück** oder einem Klick in die Schrittleiste kommst du jederzeit zu jedem dieser Schritte. Am Ende zeigt die [Zusammenfassung](#zusammenfassung) alles auf einer Seite, und erst **Jetzt einrichten** legt los. Brichst du vorher ab oder lädst die Seite neu, bleibt keine halbe Einrichtung zurück. Deine Eingaben merkt sich der Browser bis dahin, Passwörter nicht.

**Keine einzelnen Speichern-Knöpfe:** In jedem Schritt übernimmt **Weiter** alles, was in den Feldern steht, auch Vorschläge, die du nicht geändert hast (sie tragen den Hinweis „vorgeschlagen – wird mit „Weiter“ übernommen“). Leer gelassene Felder bleiben leer, und es gibt keine versteckten Vorgaben. **Zurück** und **Weiter** stehen in jedem Schritt unten an derselben Stelle.

**Aus Konfigurationsdatei laden:** Oben rechts, klein neben der Hilfe, lädst du eine gespeicherte Einrichtung. Ablago füllt dann alle Schritte vor und springt zur Zusammenfassung, oder zum ersten Schritt, der nicht passt (mit dem Grund). Passwörter stehen nie in der Datei, der Assistent fragt sie ab. Aufbau, Schema und Beispiel: [Einrichtung als Datei](einrichtungsdatei.md).

### Sprache { #sprache }

![Sprache](bilder/einrichtung-sprache.png)

Der erste Schritt fragt, in welcher Sprache Ablago mit dir spricht: **Deutsch** oder **English**. Vorgeschlagen ist die Sprache deines Browsers. Die Wahl gilt sofort für den Assistenten und wird mit **Jetzt einrichten** zur Sprache der Installation und zu deiner eigenen. Später änderst du sie unter [Werkbank → Sprachen](sprachen.md), jede Person ihre eigene unter Mein Konto.

### Einrichtungscode

![Einrichtungscode](bilder/einrichtung-code.png)

Damit niemand sonst im Netz Ablago einrichtet, fragt es zuerst nach einem Code wie `K7PX-3MNA-Q9TR`. Er steht an zwei Stellen:

- im **Protokoll des Containers** – in der Docker-Oberfläche des NAS den Container `app` des Projekts öffnen und das Protokoll ansehen (bei UGREEN *Docker → Container → dms-app → Protokoll*, bei Synology *Container Manager → Container → Details → Protokoll*) oder `docker compose logs app` (bei [dms-komplett](https://help.ablago.app/installieren/aktuell/komplett/): `docker compose logs dms`). Gesucht ist die Zeile `Einrichtungscode für Ablago: XXXX-XXXX-XXXX`;
- in der Datei **`EINRICHTUNGSCODE`** im Ordner `geheim` (in der Vorlage `/volume1/docker/dms/geheim`).

Wo genau das bei deinem Gerät ist, zeigt die Anleitung deiner Plattform unter [Wie komme ich an ein DMS?](https://help.ablago.app/installieren/aktuell/) – für Synology, UGREEN, QNAP, Unraid, TrueNAS, umbrelOS, ZimaOS, CasaOS und andere.

Nach „Jetzt einrichten“ ist der Code wertlos; Ablago löscht die Datei. Nach zehn falschen Versuchen sperrt es die Eingabe für zehn Minuten.

### Datenbank

![Datenbank](bilder/einrichtung-datenbank.png)

Server (in der Vorlage `db`), Port `5432`, Datenbank und Benutzer `dms` und das Passwort aus der `.env`. **Verbindung prüfen** meldet verständlich, was nicht stimmt – Server nicht erreichbar, Passwort falsch, Datenbank fehlt (mit Knopf zum Anlegen, wenn der Benutzer das darf). **Übernehmen und weiter** speichert die Anbindung und startet Ablago – ohne Neustart des Containers; die Tabellen legt es selbst an. Der Schritt entfällt, wenn eine Anbindung schon funktioniert (siehe [Datenbank-Anbindung](#datenbank-anbindung)).

### Neu einrichten oder wiederherstellen

![Neu einrichten oder wiederherstellen](bilder/einrichtung-wahl.png)

Bei einer leeren Datenbank fragt Ablago, ob du neu anfängst oder eine Sicherung zurückholst. **Wiederherstellen** führt in den Ablauf unter [Wiederherstellen](wiederherstellen.md#neues-nas-alte-sicherung) mit eigenem Fortschritt und endet bei der Anmeldung mit den bisherigen Zugangsdaten. **Neu einrichten** führt zum Sammeln.

### Name deiner Ablage { #haushalt }

![Name deiner Ablage](bilder/einrichtung-mandant.png)

Der Name deiner Ablage, meist der Name der Familie („Familie Mustermann“) oder deines Betriebs („Büro Mustermann“). Er erscheint als Schriftzug in der Kopfzeile, im Browser-Tab und auf der Anmeldeseite (änderbar unter **Werkbank → [Designs](designs.md)**).

### Dein Konto { #dein-konto }

![Dein Konto](bilder/einrichtung-konto.png)

Name, E-Mail-Adresse und Passwort **deines eigenen Kontos** – mit deiner einen E-Mail-Adresse. Das Passwort legst du hier direkt fest, einen Einladungslink für dich selbst gibt es nicht. Ein eigenes Konto „Administrator“ und einen „ersten Benutzer“ daneben gibt es nicht: Dein Konto bekommt **Gesamte Verwaltung** und arbeitet ganz normal in der Ablage (siehe [Wer darf Ablago verwalten?](verwalten.md)).

> Im Alltag arbeitest du ohne Verwaltungsrechte. Zum Einrichten wechselst du über „Ablago verwalten“. So kann aus Versehen nichts Wichtiges kaputtgehen.

**Weiter** prüft Adresse und Passwort gleich, angelegt wird das Konto aber erst mit **Jetzt einrichten**. Danach bist du angemeldet, und zwar gleich im [Verwaltungsmodus](verwalten.md#der-verwaltungsmodus). Die **Zwei-Faktor-Anmeldung** bietet dir der Assistent am Ende an ([Fertig](#fertig)). Weitere Personen lädst du nach der Einrichtung unter **Werkbank → Benutzer** ein – die Übersicht erinnert daran, dass eine zweite Person verwalten können sollte.

### Pakete dazuholen

![Pakete dazuholen](bilder/einrichtung-pakete.png)

Installiert wird erst mit **Jetzt einrichten**; hier wählst du nur. Erst in diesem Schritt fragt Ablago den [offiziellen Paketkatalog](pakete.md) ab – vorher baut es keine Verbindung dafür auf. Die Anfrage geht an catalog.ablago.app (ausgeliefert von GitHub Pages); dabei geht nur die Anfrage selbst hinaus, keine Daten aus deiner Ablage. Die Liste zeigt je Paket Name, Beschreibung und was es anlegt; Pakete mit Code tragen „mit Code“.

- **Texterkennung und Benachrichtigungen sind vorausgewählt** – ohne Texterkennung werden gescannte Dokumente nicht durchsuchbar, ohne Benachrichtigungen kommt keine Tägliche Zusammenfassung. Darunter fragt **Weitere Sprachen?** nach Zusatzsprachen (Deutsch und Englisch sind immer dabei). Alles andere kreuzt du an.
- **Abhängigkeiten kommen mit**, z. B. „Basis“ für „Haushalt“; sie sind mit „kommt mit – gebraucht von …“ markiert.
- **Weiter** führt zu **einer** Seite mit allen Fragen: die [Rechte](pakete.md#rechte-eines-pakets) aller Pakete mit Code (ein Haken für alle), Namen nur bei Konflikten, Beispiel-Mappen, mitgelieferte Automatisierungen und Pflicht-Einstellungen, dann **Pakete übernehmen und weiter**. Siehe [Mehrere Pakete in einem Schritt installieren](pakete.md#mehrere-pakete-in-einem-schritt-installieren).
- **Überspringen** geht jederzeit; Pakete holst du später unter **Werkbank → [Pakete](pakete.md)**.

Ist der Katalog nicht erreichbar (kein Internet), sagt der Schritt das deutlich: Es fehlen dann die Pakete, etwa die Texterkennung. Überspring den Schritt und hol die Pakete nach der Einrichtung unter **Werkbank → Pakete**, dort auch mit einer **Sammeldatei**, die du an einem anderen Gerät auf der Katalog-Webseite zusammengestellt hast (siehe [Pakete ohne Internet installieren](pakete.md#pakete-ohne-internet-installieren)).

### Optionales

![Optionales](bilder/einrichtung-optional.png)

Vier gleich aufgebaute Abschnitte, ohne eigene Speichern-Knöpfe:

- **Adresse von Ablago**, vorgeschlagen mit der Adresse im Browser. Feld leeren, wenn Ablago keine feste Adresse haben soll.
- **Region:** das Bundesland für die Feiertage, anfangs *keins*. Land und Zeitzone stellst du unter [Werkbank → Einstellungen → Region](region.md) ein.
- **Beispiele:** Beispiel-Mappentypen laden (nur ohne Pakete, die eigene Mappentypen mitbringen).
- **E-Mail-Versand:** erst nach dem Häkchen „E-Mail-Versand jetzt einrichten“. Für den [E-Mail-Versand](e-mail-versand.md) genügen meist deine Adresse und dein Passwort; Server, Benutzer und Absender schlägt der Assistent vor und kennzeichnet sie, **Weiter** übernimmt sie in die Zusammenfassung. Eingerichtet wird der Versand erst mit **Jetzt einrichten**. Testen kannst du ihn nach der Einrichtung unter **Werkbank → E-Mail und Adresse**.

Alles lässt sich auch später in der Werkbank einstellen.

### Zusammenfassung

![Zusammenfassung](bilder/einrichtung-zusammenfassung.png)

Alles auf einer Seite, je Abschnitt mit **Ändern**: Ablage, dein Konto (mit „Gesamte Verwaltung“), Pakete (mit der Zahl der eingeschalteten Automatisierungen) und Optionales. Passwörter stehen dort nur als „gesetzt“. Nach **Ändern** führt **Weiter** zurück zur Zusammenfassung; alles andere bleibt, wie es war.

**Als Datei speichern** legt die Einrichtung als [Konfigurationsdatei](einrichtungsdatei.md) ab, ohne Passwörter und ohne Schlüssel.

**Jetzt einrichten** prüft alles noch einmal und führt es dann aus, mit Fortschritt: Ablage und dein Konto anlegen, Schlüssel erzeugen, Adresse, Bundesland und E-Mail-Versand speichern, Beispiele laden, Pakete installieren. Klappt etwas nicht, steht dort, was und warum. Was schon erledigt ist, bleibt erhalten; mit **Ändern** korrigierst du die Angabe, mit **Erneut versuchen** geht es an dieser Stelle weiter. Doppelt angelegt wird nichts.

### Fertig: Notfallblatt { #fertig }

![Fertig](bilder/einrichtung-fertig.png)

Beim Einrichten hat Ablago einen neuen **Schlüssel** erzeugt. Er verschlüsselt gespeicherte Passwörter und alle Sicherungen (siehe [Verschlüsselung](verschluesselung.md)); das [Notfallblatt](sicherung.md#notfallblatt) enthält ihn zum Ausdrucken, dazu den **Notfallcode**, mit dem du wieder hineinkommst, wenn du dich ausgesperrt hast ([Ich komme nicht mehr hinein](was-ist-passiert.md#kein-zugang)). **Einrichtung abschließen** geht erst, wenn du das Notfallblatt heruntergeladen hast. Druck es aus und leg es zu deinen wichtigen Unterlagen, denn ohne Schlüssel lässt sich keine Sicherung zurückholen.

Das Notfallblatt herunterzuladen ist eine [heikle Handlung](verwalten.md#frische-anmeldung): Dauerte „Jetzt einrichten“ länger als 10 Minuten (etwa mit vielen Paketen), fragt Ablago vorher noch einmal dein Passwort ab.

Darunter bietet der Assistent die **Zwei-Faktor-Anmeldung** an – mit **Jetzt einrichten** (Authenticator-App am Handy, danach die Wiederherstellungscodes sichern) oder **Später**. Sie ist freiwillig; einrichten lässt sie sich jederzeit unter **Mein Konto → Sicherheit**. Richtest du sie jetzt ein, fragt Ablago beim Abschließen einmal Passwort und Code ab, weil sich deine Anmeldung geändert hat. Passkeys gibt es noch nicht.

Dazu Links zu beiden Handbüchern, „Problem melden“ als vorbereitetes GitHub-Issue und der Hinweis auf GitHub Sponsors.

Danach: Wie es weitergeht, steht kurz unter [Einrichten in fünf Schritten](fuenf-schritte.md) – unter **Werkbank → [Sicherung](sicherung.md)** den Zeitplan einschalten, eigene [Mappentypen](mappentypen.md) anlegen und weitere [Benutzer einladen](benutzer.md) – am besten auch eine zweite Person, die verwalten darf.

**Für Selbständige und kleine Betriebe:** Die Werkbank startet mit der schlanken Vorlage *Haushalt*. Stell unter **Werkbank → Werkbank anpassen** die Vorlage **Betrieb** ein – dann siehst du auch Nummernkreise, Archivmodus, Postfächer, Datenschutz und die übrigen Bereiche, die ein Betrieb braucht (siehe [Übersicht](uebersicht.md)).

## Datenbank-Anbindung

Die Anbindung an PostgreSQL steht in der Datei `datenbank.json` im Ordner `/data/geheim` (nur für den Container lesbar, mit Passwort). Sie ist **führend**:

- **Gibt es die Datei**, nimmt Ablago sie – auch wenn in der Compose-Datei `DATABASE_URL` gesetzt ist. Weicht die Variable ab, weist die Werkbank-Übersicht darauf hin; sie wird ignoriert und kann entfernt werden.
- **Gibt es sie nicht, aber `DATABASE_URL`** (bisherige Installationen), prüft Ablago die Variable beim Start und übernimmt sie in die Datei. Danach ist die Variable überflüssig.
- **Gibt es sie nicht, aber `DMS_DB_PASSWORT`** (Vorlagen für Synology, UGREEN, QNAP, TrueNAS, Unraid), nimmt Ablago die Standard-Anbindung – Server `db` (oder `DMS_DB_HOST`), Port 5432, Datenbank und Benutzer `dms` – mit diesem Passwort und übernimmt sie ebenso. Das Passwort steht so nur einmal in der Compose-Datei, ohne Sonderzeichen für eine URL maskieren zu müssen.
- **Gibt es beides nicht** – oder klappt die Verbindung nicht –, startet Ablago im **Einrichtungsmodus**: Es liefert nur den Assistenten aus und fragt die Anbindung ab (mit Einrichtungscode). Alle anderen Schnittstellen antworten bis dahin mit 503. Eine gespeicherte Anbindung, deren Datenbank nur noch nicht erreichbar ist (der Datenbank-Container startet noch), versucht es alle zehn Sekunden weiter.

Unter **Werkbank → Datenbank-Anbindung** siehst und änderst du die Anbindung. Im Abschnitt *Verbindung* steht, womit Ablago gerade verbunden ist („Aktuell verbunden: dms@postgres:5432/dms · in Betrieb“). Ändern: erst **Verbindung prüfen**, dann **Übernehmen**. Die neue Anbindung gilt nach einem Neustart (**Jetzt neu starten** – im Container startet Docker Ablago gleich wieder). Die Daten wandern dabei nicht mit; für einen Umzug in eine andere Datenbank nimm eine [Sicherung](sicherung.md).

In der Datei steht auch die **Ablage-Id** (früher die Umgebungsvariable `HAUSHALT_ID`). Bisherige Installationen übernehmen sie beim ersten Start; die Variable kann danach entfernt werden.

Unter der Verbindung zeigt die Seite, wie es der Datenbank im Betrieb geht: die **langen Datenbankzugriffe** und **was gerade läuft**. Früher stand das unter *Wartung und Fehlersuche → Systemzustand*; alte Links und Lesezeichen führen hierher.

![Datenbank-Anbindung: lange Datenbankzugriffe](bilder/werkbank-datenbank.png)

### Lange Datenbankzugriffe

Jeder Datenbankzugriff wird gestoppt. Was länger dauert als eine Schwelle, landet in der Liste und als Warnung im [Protokoll](fehlersuche.md#protokoll) (Modul *datenbank*) – dort seit #920 je Minute und Art (Routenmuster bzw. Zugriff) in einer Zeile mit Anzahl, höchster und mittlerer Dauer; die Liste zeigt weiter jeden einzeln. Direkt über der Liste stellst du ein:

- **Lang ab** – die Schwelle in Millisekunden (Standard 500),
- **Aufbewahren** – wie viele Tage die Einträge bleiben (Standard 30).

Die Liste zeigt die neuesten oben, etwa zehn Einträge; darin scrollst du. Ein Klick auf einen Eintrag klappt ihn auf: Abfrage, Aufrufer (Anfrage und Benutzer), Dauer und Zeit. Ein Datenbankzugriff ist eine Methode der Datenzugriffsschicht (z. B. `mappen.seite` für eine Seite einer Ansicht) und kann mehrere SQL-Anweisungen umfassen.

### Was läuft gerade

Die Abfragen, die gerade in der Datenbank laufen, mit Dauer, Zustand und Prozess – alle fünf Sekunden aktualisiert. Laufen welche schon länger als die Schwelle, weist ein Hinweis darauf hin.

## E-Mail und Adresse

Unter **Werkbank → E-Mail und Adresse** stellst du ein, was früher Umgebungsvariablen waren. Änderungen gelten sofort, ohne Neustart.

Über den Mailserver gehen nur Mails, die jemand auslöst oder einschaltet: versandte Mappen samt Dokumenten, die [Tägliche Zusammenfassung](aufgaben.md#tagliche-zusammenfassung) (Mappentitel und Links), Einladungen und Passwort-Links sowie [Auskünfte](datenschutz.md) und Abruf-Links. Eine Übersicht aller Wege steht unter [Was deine Ablage verlässt](datenschutz.md#was-deine-ablage-verlasst).

![E-Mail und Adresse in der Werkbank](bilder/werkbank-betrieb.png)

- **Adresse von Ablago** – unter dieser Adresse öffnen die Benutzer Ablago, z. B. `http://nas.home.arpa:8080` oder `https://ablage.example.org`. Sie steht in den Links der E-Mails. Solange keine gepflegt ist, nimmt Ablago die Adresse, unter der es gerade aufgerufen wird; **Diese Adresse übernehmen** speichert sie. Beginnt sie mit `https://`, gilt die Anmeldung nur noch über HTTPS.
- **E-Mail-Versand** – eigene Adresse und Passwort; Server, Port, Benutzer und Absender schlägt Ablago vor, alle Felder stehen unter *Erweitert*. Auch die Anmeldung über OAuth für Microsoft 365 und Google. **Verbindung prüfen** meldet sich am Server an, ohne etwas zu senden; **Testmail senden** schickt eine Mail an eine Adresse deiner Wahl – beides mit den Werten im Formular, auch bevor du speicherst. Schlägt etwas fehl, nennt Ablago die Ursache, darunter steht die Antwort des Servers. Alles dazu, mit Hinweisen je Anbieter: [E-Mail-Versand](e-mail-versand.md).
- **Selbstsigniertes Zertifikat erlauben** – nur für einen eigenen Mailserver im Heimnetz.
- Der **Absender** ist auch der Absender, wenn Benutzer eine Mappe [per E-Mail versenden](https://help.ablago.app/benutzer/versenden/). Ablago trägt dabei die Adresse des Benutzers als **Antworten an** ein – so kommen Antworten bei ihm an, ohne dass Ablago fremde Absender vortäuscht (das würden viele Empfänger als Spam einstufen). Dieselbe Einstellung braucht die [tägliche Zusammenfassung der Aufgaben](aufgaben.md#tagliche-zusammenfassung).
- Ohne E-Mail-Versand (Haken „E-Mails verschicken“ aus) zeigt die Benutzerverwaltung die Einladungs- und Passwort-Links zum Kopieren an; „Passwort vergessen“ setzt dann der Administrator zurück.

!!! note "Passwort verschlüsselt"
    Das SMTP-Passwort speichert Ablago verschlüsselt; den Schlüssel dazu erzeugst du einmal unter **Werkbank → [Verschlüsselung](verschluesselung.md)**. Solange es keinen gibt, lässt sich kein Passwort speichern. Das Passwort wird nie an die Oberfläche zurückgegeben. Nimm trotzdem am besten ein eigenes Passwort nur für den Versand, etwa ein App-Passwort deines Mailanbieters.

!!! note "Von einer älteren Version"
    Bis Version 0.8 waren das die Umgebungsvariablen `APP_URL` und `SMTP_*`. Beim ersten Start von 0.9 übernimmt Ablago ihre Werte einmalig in die Werkbank; danach werden sie ignoriert, und das Protokoll weist darauf hin, dass sie aus der Compose-Datei entfernt werden können.

## Ordner und Volumes

Die Ordner im Container sind fest. Wohin sie auf dem NAS zeigen, bestimmst du allein über die Volumes der Compose-Datei – dafür gibt es keine Umgebungsvariablen.

| Ordner im Container | Inhalt | Volume in der Vorlage |
| --- | --- | --- |
| `/data/files` | hochgeladene Dokumente, Logos, Bilder gemeldeter Fehler | `/volume1/docker/dms/files` |
| `/data/geheim` | Schlüssel für gespeicherte Passwörter (`dms.schluessel`), [Datenbank-Anbindung](#datenbank-anbindung) (`datenbank.json`), Einrichtungscode (`EINRICHTUNGSCODE`, nur bis zur Einrichtung), [RESCUE-Datei](notfall.md) | `/volume1/docker/dms/geheim` |
| `/data/sicherung` | [Sicherungen](sicherung.md), verschlüsselt | `/volume1/docker/dms/sicherung` |
| `/data/export` (optional) | [Exporte](export.md#export-ordner): Vollexport, Meine Daten exportieren, Auskünfte – **unverschlüsselt**, nach dem Herunterladen bzw. nach 7 Tagen gelöscht. Nie in den Sicherungsordner legen | auskommentiert: `/volume1/docker/dms/export` |
| `/eingang` (optional) | [Eingangsordner](eingangsordner.md) für Scanner und NAS | `/volume1/docker/dms/eingang` |

Jeder der drei Ordner `/data/files`, `/data/geheim` und `/data/sicherung` muss ein eigenes Volume sein; sonst ist sein Inhalt weg, sobald der Container neu erstellt wird (z. B. beim Update). `/data/export` braucht kein eigenes Volume – ohne liegt er im Container, und darin liegende Exporte sind nach einem Update weg. Die Datenbank liegt im Volume des PostgreSQL-Containers – beim Image [dms-komplett](https://help.ablago.app/installieren/aktuell/komplett/) im vierten Ordner `/data/postgres`. Wie viel Platz in jedem Ordner frei ist, zeigen **Werkbank → [Systemzustand](speicherplatz.md)** und **Werkbank → Systemzustand → Version und Updates**.

```yaml
    volumes:
      - /volume1/docker/dms/files:/data/files
      - /volume1/docker/dms/geheim:/data/geheim
      - /volume1/docker/dms/sicherung:/data/sicherung
```

!!! note "Von einer älteren Version (bis 0.22)"
    Früher legten `FILES_DIR`, `DMS_SCHLUESSEL_DATEI` und `DMS_SICHERUNG_DIR` die Ordner fest. Steht eine davon noch mit dem festen Wert in der Compose-Datei (z. B. `FILES_DIR: /data/files`), läuft alles weiter; das Protokoll und die Werkbank-Übersicht weisen darauf hin, dass du sie entfernen kannst. Zeigt sie auf einen **anderen** Ordner, startet Ablago nicht – sonst sähe es plötzlich einen leeren Dateiordner. Die Meldung im Protokoll des Containers nennt dann, welches Volume stattdessen auf den festen Ordner zeigen muss. Siehe [Aktualisieren](aktualisieren.md#feste-ordner-ab-023).

## Einstellungen

Diese Einstellungen sind Umgebungsvariablen im Compose-Projekt:

| Variable | Bedeutung |
| --- | --- |
| `DATABASE_URL` | Nur noch für den Umstieg: wird beim ersten Start in die [Datenbank-Anbindung](#datenbank-anbindung) übernommen und danach ignoriert |
| `DMS_DB_PASSWORT`, `DMS_DB_HOST`, `DMS_DB_PORT` | Statt `DATABASE_URL`: Passwort (sowie Server, Standard `db`, und Port, Standard `5432`) der Standard-Anbindung; ebenfalls nur für den ersten Start |
| `DMS_EINRICHTUNGSCODE` | `aus`: Einrichtungsassistent ohne Code – für App-Stores, in denen das Container-Protokoll nicht ohne Kommandozeile lesbar ist. Bis der Administrator angelegt ist, kann dann jeder im Netz die Einrichtung übernehmen |
| `TRUST_PROXY` | Wem Ablago die Angaben eines Reverse-Proxys glaubt. Nicht gesetzt oder `auto`: dem eigenen Rechner und privaten Netzen – passt fast immer. `false`: niemandem, `true`: allen, oder eine Liste wie `172.18.0.0/16`. Siehe [Hinter einem Reverse-Proxy](#hinter-einem-reverse-proxy) |
| `DMS_EINBETTEN` | Seiten, die Ablago einbetten dürfen (z. B. ein Dashboard), etwa `https://ha.example.org http://nas.home.arpa:8123`. Nicht gesetzt: nur Ablago selbst. Siehe [Sicherheits-Header](#sicherheits-header) |
| `LOG_LEVEL` | Grundstufe des Protokolls: `debug`, `info` (Standard), `warn`, `error` |
| `PORT`, `HOST` | Port (Standard `3000`) und Adresse (Standard `0.0.0.0`, alle), auf denen Ablago im Container lauscht. Normalerweise änderst du **nicht** `PORT`, sondern den Port nach außen in der Compose-Datei (in der Vorlage `8080:3000`, z. B. `8090:3000`). Die eingebaute Gesundheitsprüfung des Images folgt `PORT`; setzt du `HOST` auf eine einzelne Adresse, muss sie `127.0.0.1` mit einschließen, sonst gilt der Container als *unhealthy* |
| `DMS_PROZESSE` | Zahl der Prozesse für Anfragen, 1–16 oder `auto` (Kerne − 1, höchstens 2; rund 1 GB Arbeitsspeicher je Prozess plus 1 GB Reserve, unter 3 GB also 1). Vorgabe 1 wie bisher. Empfohlen ab etwa 4 Kernen, siehe [Technik → Mehrere Prozesse](technik.md#mehrere-prozesse) |
| `DMS_DB_VERBINDUNGEN` | Höchstzahl der Verbindungen zur Datenbank für **alle Prozesse zusammen** (#874; vorher je Prozess), 2–100 (Vorgabe 10, je weiteren Prozess 4 mehr). Mit einem Prozess wie bisher. Nur für größere Installationen mit mehr Kernen, siehe [Technik → Viele gleichzeitige Anfragen](technik.md#last) |
| `DMS_MAX_ANFRAGEN` | Ab so vielen gleichzeitigen Anfragen (**je Prozess**) antwortet Ablago sofort mit „gerade sehr beschäftigt“ (HTTP 503), 20–10.000 (Vorgabe 250), siehe [Technik](technik.md#last) |
| `DMS_ARBEITER` | Zahl der [Arbeiter für PDF und Exporte](speicherplatz.md#arbeiter-fur-pdf-und-exporte) **je Prozess**, 1–16. Nicht gesetzt: die Hälfte der Kerne des Containers, mindestens 1, höchstens 4 – mit mehreren Prozessen aufgeteilt. `0` schaltet sie aus (nur zur Fehlersuche) |
| `DMS_HINTERGRUND_NICE` | Wie viel niedriger die [Arbeit im Hintergrund](technik.md#last) rechnet als die Anfragen (nice-Wert, 0–19). Nicht gesetzt: `10`. `0` schaltet es aus |
| `DMS_ZWISCHENSPEICHER` | Nur zur Fehlersuche: `aus` schaltet die Zwischenspeicher der Zahlen, der Trefferzahlen und der Termine ab – alles wird bei jeder Anfrage frisch gerechnet, Ablago wird langsamer. Der Systemzustand und der Lasttest-Bericht weisen darauf hin. Siehe [Fehlersuche → Liegt es am Zwischenspeicher?](fehlersuche.md#zwischenspeicher) |
| `DMS_EINGANG` | Nur für Sonderfälle: anderer Ort des [Eingangsordners](eingangsordner.md) im Container (Standard `/eingang`). Üblich ist, den Ordner des NAS auf `/eingang` einzubinden |

## Hinter einem Reverse-Proxy

Läuft Ablago hinter einem Reverse-Proxy (Nginx Proxy Manager, nginx, Caddy, Traefik, der Proxy deines NAS …), ist nur **eines** zu tun: In der Werkbank unter **E-Mail und Adresse** die öffentliche Adresse eintragen, z. B. `https://dms.example.org`. Beginnt sie mit `https://`, setzt Ablago das Sitzungs-Cookie nur noch über HTTPS, und Links in E-Mails führen auf diese Adresse.

### HTTPS und Zertifikate

Ablago spricht selbst nur HTTP und verwaltet keine Zertifikate. Das übernimmt der Reverse-Proxy: Er nimmt die HTTPS-Verbindung an, kümmert sich um das Zertifikat und dessen Erneuerung und reicht die Anfrage an Ablago weiter. Übliche Wege:

- **Nginx Proxy Manager** als zusätzlicher Container: Zertifikat von Let's Encrypt per Mausklick. So läuft es beim Entwickler, siehe [Beispielaufbau](https://help.ablago.app/installieren/aktuell/beispiel/).
- **Der Proxy deines NAS:** Synology, UGREEN und QNAP bringen einen Reverse-Proxy samt Let's-Encrypt-Zertifikaten mit.
- **Caddy:** holt und erneuert Zertifikate von selbst, die Konfiguration ist wenige Zeilen lang.

Für Let's Encrypt braucht es eine eigene Domain, die auf deinen Anschluss zeigt. Soll Ablago nur zu Hause erreichbar sein, reicht HTTP im Heimnetz.

Nutzt ihr das [WebDAV-Laufwerk](webdav.md), braucht es **HTTPS** auch zu Hause (Windows verlangt es), und der Proxy muss die WebDAV-Methoden wie `PROPFIND` und `LOCK` durchlassen – siehe [Hinter einem Reverse-Proxy](webdav.md#hinter-einem-reverse-proxy).

### Was der Proxy Ablago mitteilt { #was-der-proxy-dem-dms-mitteilt }

Der Proxy leitet jede Anfrage an Ablago weiter. Für Ablago sieht sie deshalb so aus, als käme sie vom Proxy. Was das Gerät dahinter ist, schreibt der Proxy in Zusatzangaben (`X-Forwarded-For`, `X-Forwarded-Proto`). Ablago braucht sie für:

| Wofür | Mit den Angaben des Proxys | Ohne sie |
|---|---|---|
| **IP-Adressen** im Protokoll und bei den Sitzungen eines Benutzers | die Adresse des Handys oder Laptops | immer die Adresse des Proxys |
| **Sperre nach falschen Passwörtern** ([Anmeldeschutz](anmeldeschutz.md), je E-Mail-Adresse und IP sowie je IP) | trifft nur das Gerät, von dem die Fehlversuche kamen | trifft alle Geräte: Fehlversuche von außen sperren die Anmeldung auch zu Hause |
| **HTTPS erkennen**, solange keine Adresse gepflegt ist | Cookie nur über HTTPS, Links mit `https://` | Cookie auch über HTTP, Links mit der internen `http://`-Adresse |

Seit Version 0.43.0 nimmt Ablago diese Angaben **von selbst** an, wenn der Proxy im eigenen Rechner oder in einem privaten Netz sitzt (`127.0.0.1`, `10.x.x.x`, `172.16–31.x.x`, `192.168.x.x` und die entsprechenden IPv6-Netze). Das trifft auf einen Proxy-Container neben Ablago und auf den Proxy eines NAS praktisch immer zu. Anfragen direkt aus dem Internet können so keine fremde IP und kein HTTPS vortäuschen. Unter **Wartung und Fehlersuche → Systemzustand → Version und Updates** steht bei `TRUST_PROXY`, was gerade gilt.

!!! note "Wann `TRUST_PROXY` doch setzen?"
    - `TRUST_PROXY: "false"`: Wenn du ganz ausschließen willst, dass ein Gerät **in deinem Heimnetz**, das Ablago direkt über Port 8080 erreicht, eine andere IP-Adresse vortäuscht. Die IP-Adressen und die Sperre verhalten sich dann wie in der rechten Spalte oben.
    - Eine Liste, z. B. `TRUST_PROXY: "172.18.0.5"`: Nur genau diesem Proxy glauben.
    - `TRUST_PROXY: "true"`: Wenn der Proxy eine öffentliche Adresse hat, etwa ein Tunnel- oder Cloud-Dienst, der direkt ans Ablago weiterleitet. Dann darf Ablago selbst nicht aus dem Internet erreichbar sein.

    Vor Version 0.43.0 war `false` der Standard. Wer `TRUST_PROXY: "true"` schon gesetzt hat, kann es stehen lassen oder entfernen.

!!! tip "Die Adresse trotzdem pflegen"
    Die Adresse in der Werkbank ist verlässlicher als jede Erkennung: E-Mails aus dem Hintergrund (Erinnerungen, Zusammenfassung) haben keine Anfrage, aus der Ablago die Adresse ablesen könnte.

### Sicherheits-Header

Ablago setzt die üblichen Sicherheits-Header selbst – dein Reverse-Proxy muss sie **nicht** noch einmal setzen (doppelte Header schaden nicht, verwirren aber bei der Fehlersuche):

- `X-Frame-Options: SAMEORIGIN` und `Content-Security-Policy: frame-ancestors 'self'` – keine fremde Seite kann Ablago unsichtbar einbetten,
- eine strenge `Content-Security-Policy` für die Oberfläche (nur eigene Skripte),
- `X-Content-Type-Options: nosniff`, `Referrer-Policy: same-origin`, `Permissions-Policy`,
- `Strict-Transport-Security`, sobald Ablago über HTTPS aufgerufen wird.

Soll Ablago in einer anderen Seite erscheinen, etwa in einem Home-Assistant-Dashboard, trage deren Ursprung in `DMS_EINBETTEN` ein (mehrere durch Leerzeichen getrennt). Ungültige Angaben ignoriert Ablago und nennt sie im Protokoll.

Ein Beispiel für nginx:

```nginx
server {
    listen 443 ssl;
    server_name dms.example.org;
    # ssl_certificate …; ssl_certificate_key …;

    client_max_body_size 260m;          # Dokumente bis 100 MB, Pakete bis 128 MB, Sammeldateien bis 256 MB

    location / {
        proxy_pass http://<NAS>:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
    }
}
```

Lange Arbeiten wie das Erzeugen tausender Demo-Mappen laufen im Hintergrund, damit der Proxy nicht wegen einer Zeitüberschreitung abbricht. Die Live-Anzeige des Protokolls fragt alle zwei Sekunden nach und braucht keine besondere Proxy-Einstellung.
