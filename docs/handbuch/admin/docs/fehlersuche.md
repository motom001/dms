# Fehlersuche und Support

Alles dazu steht in der Werkbank unter **Wartung und Fehlersuche**. Die Gruppe enthält Protokoll, Gemeldete Fehler, Sicherung, Wiederherstellen, Vollexport, Wartungsmodus, Wartungsoperationen, Datenbank, Technik und Demo-Daten. Diese Seite beschreibt die Werkzeuge zur Fehlersuche; [Sicherung](sicherung.md), [Wiederherstellen](wiederherstellen.md), [Vollexport](export.md), [Wartungsmodus](wartungsmodus.md), [Wartungsoperationen](texterkennung.md#wartungsoperationen) und [Demo-Daten](demo.md) haben eigene Seiten.

*Protokoll* und *Gemeldete Fehler* gehören zur Vorlage **Betrieb**, *Datenbank* nur zur Vorlage **Alles**. *Technik* steht in jeder Vorlage.

--8<-- "ausgeblendet-schritt.md"

## Gemeldete Fehler

Benutzer melden Fehler über **Fehler melden** in ihrem Menü – mit eigener Beschreibung, bis zu zwei Screenshots und technischen Angaben (Version, Browser, Bildschirmgröße, Sprache, Zeitzone, die letzten 25 besuchten Seiten, die letzten 10 Fehler im Browser und fehlgeschlagenen Anfragen). Passwörter, Inhalte von Mappen und Cookies gehen nicht mit.

![Werkbank → Gemeldete Fehler](bilder/werkbank-fehlermeldung.png)

Unter **Werkbank → Gemeldete Fehler** stehen die Meldungen, neueste zuerst; der Zähler in der Leiste und in der Übersicht nennt die offenen. In der Meldung siehst du Beschreibung, Screenshots und Angaben und kannst sie **als erledigt markieren** (und wieder öffnen) oder **löschen** – endgültig, samt Bildern. Eine Rückmeldung an den Benutzer gibt es im DMS bewusst nicht; die erledigst du auf deinem Weg.

## Protokoll

**Werkbank → Protokoll** zeigt, was im DMS passiert – die letzten 24 Stunden, höchstens 10.000 Einträge, die neuesten oben. Nach einem Neustart beginnt die Liste leer; dauerhaft steht alles in den Container-Logs.

![Protokoll](bilder/werkbank-protokoll.png)

Jeder Eintrag gehört zu einem **Modul**, etwa `konto` für Anmeldungen oder `sicherung` für Sicherungen. Welche Module es gibt, steht unter [Technik → Module](technik.md#module).

Filtern lässt sich nach Stufe, Modul, Benutzer und Text; **Live** aktualisiert die Liste alle zwei Sekunden. Ein Klick auf einen Eintrag zeigt alle Daten dazu, auch Benutzer und Anfrage-Kennung.

### Debug-Modus

Schaltet für **eine Stunde** zusätzliche, ausführliche Meldungen ein – etwa jede einzelne Datenbankabfrage. Danach (oder nach einem Neustart) ist er von selbst wieder aus. Die Grundstufe stellt `LOG_LEVEL` ein (siehe [Installation](installation.md#einstellungen)).

### Container-Logs

Jede Meldung steht als lesbare Zeile in den Logs des Containers:

```text
2026-10-28T09:12:33.120Z INFO  [ablage] Mappe angelegt benutzer=anna@beispiel.de typ=Rechnung titel="R-17 vom 01.10.2026"
```

```sh
docker logs <app-container>
```

## Datenbank

**Werkbank → Datenbank** zeigt **lange Datenbankzugriffe** – Zugriffe, die länger als eine Schwelle gedauert haben (Standard 500 ms, aufbewahrt 30 Tage; beides einstellbar) – und was **gerade** in der Datenbank läuft.

![Datenbank](bilder/werkbank-datenbank.png)

## Zeitmessung (Entwicklermodus)

Wirkt eine Seite langsam, schalte im **Profil** den **Entwicklermodus** ein. Dann zeigt das DMS unten rechts bei jedem Seitenaufruf, wie lange Netzwerk, Aufbereitung auf dem Server, Datenbankzugriffe, Übertragung und Darstellung im Browser gedauert haben. Er gilt nur für dein Konto.

## Technik

**Werkbank → Technik** zeigt, was installiert ist: Version und Stand des DMS, Node.js, PostgreSQL, Betriebssystem und Bibliotheken.

![Technik und Versionen](bilder/werkbank-technik.png)

- **Für den Support:** Übersicht kopieren und in ein [GitHub-Issue](https://github.com/motom001/dms/issues/new?template=wunsch.md) einfügen. Passwörter und Zugangsdaten stehen nicht darin.
- **Neuere Versionen:** Ein Knopfdruck fragt nach, ob es neuere Versionen gibt – bei GitHub für das DMS, bei endoflife.date für Node.js, PostgreSQL und Alpine, bei npm für die Bibliotheken. Ohne Knopfdruck fragt das DMS nirgends nach. Beim DMS selbst steht unter *Aktuell* das neueste Release mit Datum; liegen auf `main` schon weitere Änderungen, die noch in keinem Release sind, nennt sie der Hinweis.

Wie die Bausteine zusammenhängen, beschreibt [Technik](technik.md).

## Typische Probleme

??? question "Nach dem Update startet der Container nicht."
    Im Container-Log steht der Grund, meist eine Migration oder eine fehlende Datenbankverbindung. Die Migrationen laufen in einer Transaktion – die Datenbank ist dabei unverändert geblieben. Notfalls auf die vorherige Version zurück (Image-Tag) und ein Issue mit dem Log anlegen.

??? question "E-Mails kommen nicht an."
    Unter **Werkbank → E-Mail und Adresse** zuerst **Verbindung prüfen**, dann **Testmail senden** – darunter steht die Meldung des Mailservers. Typisch: falsches Passwort (bei vielen Anbietern braucht es ein App-Passwort), Verbindungsart passt nicht zum Port (STARTTLS ↔ 587, SSL/TLS ↔ 465), Port vom Netz gesperrt. Im Protokoll (Modul `mail`) steht jeder Versand mit Fehler. Auch im Spam-Ordner nachsehen.

??? question "Links in E-Mails zeigen auf localhost."
    Unter **Werkbank → E-Mail und Adresse** die Adresse eintragen, unter der Benutzer das DMS aufrufen.

??? question "Anmeldung klappt hinter dem Proxy nicht."
    Ist die Adresse des DMS (Werkbank → E-Mail und Adresse) eine `https://`-Adresse, wird das Sitzungs-Cookie nur über HTTPS gesetzt. Rufe das DMS dann auch über HTTPS auf. Steht `TRUST_PROXY` auf `false` oder auf einer Liste, die den Proxy nicht enthält, glaubt das DMS dem Proxy nicht, dass die Verbindung HTTPS ist – dann die Variable entfernen. Siehe [Hinter einem Reverse-Proxy](installation.md#hinter-einem-reverse-proxy).

??? question "Im Protokoll und bei den Sitzungen steht immer dieselbe IP-Adresse."
    Das ist die Adresse des Reverse-Proxys: Das DMS glaubt seinen Angaben nicht. Unter **Technik** nachsehen, was bei `TRUST_PROXY` steht. Hat der Proxy eine öffentliche Adresse, kann `TRUST_PROXY` auf diese Adresse oder auf `true` gesetzt werden – mehr unter [Was der Proxy dem DMS mitteilt](installation.md#was-der-proxy-dem-dms-mitteilt).

??? question "Hochladen großer Dateien bricht ab."
    Den Reverse-Proxy größere Anfragen erlauben, z. B. bei nginx `client_max_body_size 110m;`.

??? question "Die Oberfläche ist nach einer Design-Änderung unbedienbar."
    `?design=standard` an die Adresse hängen, siehe [Designs](designs.md#eigenes-css).

??? question "Ein Benutzer meldet einen Fehler, den ich nicht nachvollziehen kann."
    [Als dieser Benutzer anmelden](benutzer.md#fehler-nachstellen) und es dort nachstellen.
