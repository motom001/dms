# Wiederherstellen

Eine [Sicherung](sicherung.md) spielst du in der Werkbank ein – ohne Kommandozeile, mit jedem Schritt im Blick. Das geht auf einem **frischen System** (neues NAS, alte Sicherung) und auf dem **laufenden System** (zurück zu einem früheren Stand).

--8<-- "ausgeblendet-schritt.md"

## So geht das DMS vor

- Eingespielt wird erst in einen **eigenen, leeren Bereich** der Datenbank und einen Ordner neben den Dokumenten. Umgeschaltet wird erst, wenn alles geklappt hat. Bricht etwas ab – Fehler, falscher Schlüssel, zu wenig Platz –, bleibt der bisherige Stand **unverändert**.
- Geprüft werden: die Prüfsumme der Datei, die Entschlüsselung (am Ende der Datei steht ein Prüfwert; ist die Datei verändert, merkt das DMS es), das [Prüfwort](sicherung.md#was-eine-sicherung-enthalt), die Anzahl der Mappen, Dokumente, Benutzer und Dateien.
- Eine **ältere** Sicherung in einem neueren DMS geht: Danach laufen die fehlenden Änderungen der Datenbank. Eine **neuere** Sicherung in einem älteren DMS verweigert es mit einer klaren Meldung – aktualisiere dann zuerst das DMS.
- Auch ein Wechsel auf eine neue **Hauptversion von PostgreSQL** geht so: neues PostgreSQL leer starten, Sicherung einspielen.
- Nach dem Umschalten **startet das DMS neu** (Docker startet es mit `restart: unless-stopped` sofort wieder). Danach erscheint die Abschlussmeldung, und alle melden sich neu an – mit den Zugangsdaten aus der Zeit der Sicherung.
- Jeder Schritt steht im [Protokoll](fehlersuche.md#protokoll), Modul *sicherung*.

## Neues NAS, alte Sicherung

Du brauchst: die beiden Sicherungsdateien (`.dms-sicherung` und `.json`) und das [Notfallblatt](sicherung.md#notfallblatt).

1. Auf dem neuen NAS den Ordner für das DMS anlegen, darin `postgres`, `files`, `geheim` und `sicherung` (siehe [Installation](installation.md)).
2. Das DMS neu installieren, wie unter [Wie komme ich an ein DMS?](https://motom001.github.io/dms/installieren/aktuell/) beschrieben – empfohlen mit zwei Containern (z. B. die [Compose-Vorlage](https://github.com/motom001/dms/blob/main/deploy/nas/docker-compose.yml) mit einer `.env` mit neuem `DB_PASSWORD`), oder mit [dms-komplett](https://motom001.github.io/dms/installieren/aktuell/komplett/) ohne Passwort.
3. Die beiden Sicherungsdateien in den Ordner `sicherung` kopieren.
4. Das Projekt starten und das DMS im Browser öffnen. Der [Einrichtungsassistent](installation.md#der-einrichtungsassistent) fragt nach dem **Einrichtungscode** und – falls nötig – nach der Datenbank. Dann **Aus einer Sicherung wiederherstellen** wählen; einen „Wegwerf-Admin“ brauchst du nicht.
5. Die Sicherung auswählen. Der **Abgleich** zeigt, mit welcher Version sie entstand und was heute läuft (DMS, Datenbank-Stand, PostgreSQL, Architektur, Haushalts-Id). Gehört die Sicherung zu einem anderen Mandanten, übernimmt das DMS dessen Id.
6. Den **Schlüssel vom Notfallblatt** eingeben (Leerzeichen zählen nicht) und **Schlüssel prüfen** – das DMS vergleicht ihn mit dem Fingerabdruck aus den Metadaten.
7. **Wiederherstellen**. Der Bildschirm zeigt jeden Schritt; du kannst die Seite neu laden. Am Ende startet das DMS neu.
8. **Weiter zur Anmeldung** und mit den bisherigen Zugangsdaten anmelden. Die Schlüsseldatei hat das DMS dabei selbst angelegt.

Dieser Weg ist nur offen, solange es noch keinen Benutzer gibt, und nur mit dem Einrichtungscode – genau wie die Einrichtung.

## Auf dem laufenden System

![Wiederherstellen in der Werkbank](bilder/werkbank-wiederherstellen.png)

1. Den [Wartungsmodus](wartungsmodus.md) einschalten und aktiv werden lassen (oder **Alle jetzt abmelden**).
2. **Werkbank → Wiederherstellen**, Sicherung auswählen, Abgleich prüfen. Passt der Schlüssel dieses DMS nicht zur Sicherung, gib den vom passenden Notfallblatt ein.
3. Bestätigen, dass der jetzige Stand ersetzt wird, und **Wiederherstellen** – nach einer Rückfrage.
4. Vorher sichert das DMS den **jetzigen Stand** (Art „vor einer Wiederherstellung“) – so kannst du zurück, falls du die falsche Sicherung erwischt hast. Fehlt dafür der Schlüssel, steht das als Hinweis im Ablauf. Dann bleibt der bisherige Stand der Datenbank **7 Tage** als eigener Bereich (Schema `dms_alt_behalten_…`) in der Datenbank; danach entfernt das DMS ihn beim nächsten Start. Die Abschlussmeldung nennt den Namen.
5. Nach dem Neustart ist der Wartungsmodus aus; alle melden sich neu an.

Gehört zur Sicherung ein anderer Schlüssel als der jetzige, legt das DMS die bisherige Schlüsseldatei als `dms.schluessel.alt-…` daneben und nimmt den der Sicherung.

## Probe-Wiederherstellung

Eine Sicherung ist erst dann gut, wenn sie sich einspielen lässt. Deshalb spielt das DMS **sonntags um 04:00** (einstellbar unter *Sicherung → Probe-Wiederherstellung*) die neueste Sicherung probeweise ein – in einen vorübergehenden Bereich, das laufende DMS bleibt unberührt – und prüft sie wie oben, dazu die Prüfwerte von bis zu 20 Dateien. **Jetzt probeweise wiederherstellen** startet sie sofort.

![Probe-Wiederherstellung](bilder/werkbank-sicherung-probe.png)

Das Ergebnis steht je Sicherung in der Liste und als Ampel in der Übersicht: **grün** = letzte Probe erfolgreich und höchstens 8 Tage alt, **gelb** = älter oder noch nie, **rot** = fehlgeschlagen. Schlägt eine Probe fehl, bekommen alle Administratoren eine Mail. Im aktiven Wartungsmodus und bei zu wenig freiem Platz pausiert die Probe. Die Probe braucht den **aktuellen Schlüssel** dieses DMS: Eine Sicherung mit einem früheren Schlüssel (nach einem [Schlüsselwechsel](verschluesselung.md#schlussel-wechseln)) lässt sich nicht probeweise einspielen; die Probe schlägt dann mit einem Hinweis auf den Schlüssel fehl.

## Nicht vorgesehen

Einzelne Mappen oder Dokumente aus einer Sicherung zurückholen geht nicht direkt. Der Weg dafür: die Sicherung auf einem zweiten, vorübergehenden DMS wiederherstellen (eigenes Compose-Projekt mit anderem Port) und dort heraussuchen. Eine Wiederherstellung per Befehl auf dem NAS gibt es bewusst nicht.
