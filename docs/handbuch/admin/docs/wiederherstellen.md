# Wiederherstellen

Eine [Sicherung](sicherung.md) spielst du in der Werkbank ein – ohne Kommandozeile, mit jedem Schritt im Blick. Das geht auf einem **frischen System** (neues NAS, alte Sicherung) und auf dem **laufenden System** (zurück zu einem früheren Stand).

--8<-- "ausgeblendet-schritt.md"

## So geht Ablago vor { #so-geht-das-dms-vor }

- Eingespielt wird erst in einen **eigenen, leeren Bereich** der Datenbank und einen Ordner neben den Dokumenten. Umgeschaltet wird erst, wenn alles geklappt hat. Bricht etwas ab – Fehler, falscher Schlüssel, zu wenig Platz –, bleibt der bisherige Stand **unverändert**.
- Geprüft werden: die Prüfsumme der Datei, die Entschlüsselung (am Ende der Datei steht ein Prüfwert; ist die Datei verändert, merkt Ablago es), das [Prüfwort](sicherung.md#was-eine-sicherung-enthalt), die Anzahl der Mappen, Dokumente, Benutzer und Dateien.
- Eine **ältere** Sicherung in einem neueren Ablago geht: Danach laufen die fehlenden Änderungen der Datenbank. Eine **neuere** Sicherung in einem älteren Ablago verweigert es mit einer klaren Meldung – aktualisiere dann zuerst Ablago.
- Zuletzt prüft Ablago die **Erweiterungen der Datenbank**, die die Suche braucht (`pg_trgm` für Tippfehler und Wortteile, `unaccent` für Umlaute). Sie liegen im eigenen Schema `erweiterungen_dms`, das eine Wiederherstellung nicht anfasst. Fehlt eine, steht das als **Hinweis** im Ablauf und in der Abschlussmeldung – die Daten sind trotzdem vollständig; Abhilfe unter [Suche → Erweiterungen der Datenbank](suche.md#erweiterungen-der-datenbank).
- Auch ein Wechsel auf eine neue **Hauptversion von PostgreSQL** geht so: neues PostgreSQL leer starten, Sicherung einspielen.
- Nach dem Umschalten **startet Ablago neu** (Docker startet es mit `restart: unless-stopped` sofort wieder). Danach erscheint die Abschlussmeldung, und alle melden sich neu an – mit den Zugangsdaten aus der Zeit der Sicherung.
- Jeder Schritt steht im [Protokoll](fehlersuche.md#protokoll), Modul *sicherung*.

## Neues NAS, alte Sicherung

Du brauchst: die beiden Sicherungsdateien (`.dms-sicherung` und `.json`) und das [Notfallblatt](verschluesselung.md#notfallblatt).

1. Auf dem neuen NAS den Ordner für Ablago anlegen, darin `postgres`, `files`, `geheim` und `sicherung` (siehe [Installation](installation.md)).
2. Ablago neu installieren, wie unter [Wie komme ich an ein DMS?](https://help.ablago.app/installieren/aktuell/) beschrieben – empfohlen mit zwei Containern (z. B. die [Compose-Vorlage](https://github.com/motom001/dms/blob/main/deploy/nas/docker-compose.yml) mit einer `.env` mit neuem `DB_PASSWORD`), oder mit [dms-komplett](https://help.ablago.app/installieren/aktuell/komplett/) ohne Passwort.
3. Die beiden Sicherungsdateien in den Ordner `sicherung` kopieren.
4. Das Projekt starten und Ablago im Browser öffnen. Der [Einrichtungsassistent](installation.md#der-einrichtungsassistent) fragt nach dem **Einrichtungscode** und – falls nötig – nach der Datenbank. Dann **Aus einer Sicherung wiederherstellen** wählen; einen „Wegwerf-Admin“ brauchst du nicht.
5. Die Sicherung auswählen. Der **Abgleich** zeigt, mit welcher Version sie entstand und was heute läuft (Ablago, Datenbank-Stand, PostgreSQL, Architektur, Ablage-Id). Gehört die Sicherung zu einem anderen Mandanten, übernimmt Ablago dessen Id.
6. Den **Schlüssel vom Notfallblatt** eingeben (Leerzeichen zählen nicht) und **Schlüssel prüfen** – Ablago vergleicht ihn mit dem Fingerabdruck aus den Metadaten.
7. **Wiederherstellen**. Der Bildschirm zeigt jeden Schritt; du kannst die Seite neu laden. Am Ende startet Ablago neu.
8. **Weiter zur Anmeldung** und mit den bisherigen Zugangsdaten anmelden. Die Schlüsseldatei hat Ablago dabei selbst angelegt.

Dieser Weg ist nur offen, solange es noch keinen Benutzer gibt, und nur mit dem Einrichtungscode – genau wie die Einrichtung.

### Aus einer Kopie außer Haus { #aus-einer-kopie-ausser-haus }

Ist das Gerät weg, holst du beide Dateien vom [Ziel außer Haus](sicherung-ausser-haus.md) – die `.dms-sicherung` und die `.json` daneben – und legst sie in den Ordner `sicherung`. Die `.json` dort ist die **schlanke** Fassung (ohne Versionen, Zähler und Ablage-Id). Die Liste zeigt die Sicherung als *Kopie außer Haus*; sobald du den **Schlüssel vom Notfallblatt** eingibst, liest Ablago Datenbank-Stand, Ablage-Id und Anzahl Mappen, Dokumente und Benutzer aus der Sicherung selbst. Die Ablago-Version, mit der sie entstand, steht dann als „unbekannt“ im Abgleich – maßgeblich ist der Datenbank-Stand. Beim Einspielen prüft Ablago jede Datei gegen ihren Prüfwert und am Ende die ganze Sicherung (GCM-Prüfwert); erst dann wird umgeschaltet.

## Auf dem laufenden System

![Wiederherstellen in der Werkbank](bilder/werkbank-wiederherstellen.png)

1. Den [Wartungsmodus](wartungsmodus.md) einschalten und aktiv werden lassen (oder **Alle jetzt abmelden**).
2. **Werkbank → Sicherung → Wiederherstellen**, Sicherung auswählen, Abgleich prüfen. Passt der Schlüssel dieser Installation nicht zur Sicherung, gib den vom passenden Notfallblatt ein.
3. Bestätigen, dass der jetzige Stand ersetzt wird, und **Wiederherstellen**. In der Rückfrage tippst du zur Sicherheit das Wort **wiederherstellen** ein.
4. Vorher sichert Ablago den **jetzigen Stand** (Art „vor einer Wiederherstellung“) – so kannst du zurück, falls du die falsche Sicherung erwischt hast. Fehlt dafür der Schlüssel, steht das als Hinweis im Ablauf. Dann bleibt der bisherige Stand der Datenbank **7 Tage** als eigener Bereich (Schema `dms_alt_behalten_…`) in der Datenbank; danach entfernt Ablago ihn beim nächsten Start. Die Abschlussmeldung nennt den Namen.
5. Nach dem Neustart ist der Wartungsmodus aus; alle melden sich neu an.

Gehört zur Sicherung ein anderer Schlüssel als der jetzige, legt Ablago die bisherige Schlüsseldatei als `dms.schluessel.alt-…` daneben und nimmt den der Sicherung.

## Probe-Wiederherstellung

Eine Sicherung ist erst dann gut, wenn sie sich einspielen lässt. Deshalb spielt Ablago **sonntags um 04:00** (einstellbar unter *Sicherung → Probe-Wiederherstellung*) die neueste Sicherung probeweise ein – in einen vorübergehenden Bereich, das laufende Ablago bleibt unberührt – und prüft sie wie oben, dazu die Prüfwerte von bis zu 20 Dateien und jede [umgewandelte Fassung](texterkennung.md#andere-dateitypen) gegen den Prüfwert in ihren Angaben. Der Schritt *Entschlüsseln und Einspielen* nennt, wie viele Fassungen dabei sind. Passt eine nicht (etwa weil das Paket sie genau während der Sicherung neu erzeugt hat), übernimmt Ablago sie nicht – das Paket wandelt die Datei dann neu um, wie bei einer älteren Sicherung ohne Fassungen. **Jetzt probeweise wiederherstellen** startet sie sofort.

![Probe-Wiederherstellung](bilder/werkbank-sicherung-probe.png)

Auch die Probe prüft die Erweiterungen der Datenbank (siehe oben); fehlt eine, steht beim Schritt *Erweiterungen der Datenbank* ein Hinweis, die Probe gilt trotzdem als erfolgreich.

Das Ergebnis steht je Sicherung in der Liste und als Ampel in der Übersicht: **grün** = letzte Probe erfolgreich und höchstens 8 Tage alt, **gelb** = älter oder noch nie, **rot** = fehlgeschlagen. Schlägt eine Probe fehl, bekommen alle Administratoren eine Mail. Im aktiven Wartungsmodus und bei zu wenig freiem Platz pausiert die Probe. Die Probe braucht den **aktuellen Schlüssel** dieser Installation: Eine Sicherung mit einem früheren Schlüssel (nach einem [Schlüsselwechsel](verschluesselung.md#schlussel-wechseln)) lässt sich nicht probeweise einspielen; die Probe schlägt dann mit einem Hinweis auf den Schlüssel fehl.

## Nicht vorgesehen

Einzelne Mappen oder Dokumente aus einer Sicherung zurückholen geht nicht direkt. Der Weg dafür: die Sicherung auf einem zweiten, vorübergehenden Ablago wiederherstellen (eigenes Compose-Projekt mit anderem Port) und dort heraussuchen. Eine Wiederherstellung per Befehl auf dem NAS gibt es bewusst nicht.
