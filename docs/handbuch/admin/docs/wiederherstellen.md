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

Du brauchst: die beiden Sicherungsdateien (`.dms-sicherung` und `.json`) und das [Notfallblatt](verschluesselung.md#notfallblatt). Läuft das alte Gerät noch, lädst du beide in der Werkbank [herunter](sicherung.md#sicherung-herunterladen).

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

Läuft Ablago noch (oder wieder) und kann das Paket des Ziels Sicherungen zurückholen, geht es ohne Handarbeit: In **Werkbank → Sicherung** bei der Sicherung *nur außer Haus* **Prüfen** oder **Herunterladen** wählen – danach liegt sie samt `.json` im Sicherungsordner (siehe [Sicherungen, die es nur noch außer Haus gibt](sicherung-ausser-haus.md#nur-ausser-haus)). Sonst:

Ist das Gerät weg, holst du beide Dateien vom [Ziel außer Haus](sicherung-ausser-haus.md) – die `.dms-sicherung` und die `.json` daneben – und legst sie in den Ordner `sicherung`. Die `.json` dort ist die **schlanke** Fassung (ohne Versionen, Zähler und Ablage-Id). Die Liste zeigt die Sicherung als *Kopie außer Haus*; sobald du den **Schlüssel vom Notfallblatt** eingibst, liest Ablago Datenbank-Stand, Ablage-Id und Anzahl Mappen, Dokumente und Benutzer aus der Sicherung selbst. Die Ablago-Version, mit der sie entstand, steht dann als „unbekannt“ im Abgleich – maßgeblich ist der Datenbank-Stand. Beim Einspielen prüft Ablago jede Datei gegen ihren Prüfwert und am Ende die ganze Sicherung (GCM-Prüfwert); erst dann wird umgeschaltet.

## Wiederherstellen ohne Internet { #ohne-internet }

Ablago braucht für eine Wiederherstellung **keinen Zugang zum Internet** – weder den [Paketkatalog](pakete.md) noch einen Download. Ohne Netz lässt sich aber nichts nachholen, was du nicht vorher abgelegt hast. Halte deshalb an einem sicheren Ort bereit:

1. **die Sicherungsdatei** (`.dms-sicherung`) mit der **`.json` daneben**,
2. **den Schlüssel**: die Schlüsseldatei aus dem Ordner `geheim` (im Container `/data/geheim`) oder das [Notfallblatt](verschluesselung.md#notfallblatt) – er steht nie in der Sicherung,
3. **das Ablago-Image** in derselben oder einer neueren Version als die Sicherung, vorher z. B. mit `docker save ghcr.io/motom001/dms:stabil -o ablago.tar` abgelegt und auf dem neuen Gerät mit `docker load -i ablago.tar` geladen. Ohne Internet lässt es sich nicht ziehen. Bei [dms-komplett](https://help.ablago.app/installieren/aktuell/komplett/) dasselbe mit `ghcr.io/motom001/dms-komplett:stabil`; bei zwei Containern auch das Image der Datenbank (z. B. `postgres:18`),
4. **deine Compose-Datei** und die `.env` bzw. deine Umgebungsvariablen.

Dann gehst du vor wie unter [Neues NAS, alte Sicherung](#neues-nas-alte-sicherung) beschrieben.

**Was danach von selbst passiert:**

- **Pakete müssen nicht neu installiert werden.** Die Sicherung enthält die installierten Pakete samt ihrem Code, ihre Einstellungen, Systemkonten, bestätigten Rechte und Sprachpakete. Sie kommen zusammen mit Mappentypen und Mappen als ein Stand zurück; der Paket-Läufer lädt den Code danach aus der Datenbank.
- Der **Suchindex** und die **Vorschaubilder** entstehen neu – je nach Menge der Dokumente dauert das eine Weile; Suche und Vorschau füllen sich in dieser Zeit nach und nach.
- **Alle melden sich neu an** – mit den Zugangsdaten aus der Zeit der Sicherung.
- **Automatisierungen sind angehalten**, bis du sie geprüft und unter **Werkbank → Automatisierungen** wieder eingeschaltet hast.

Was ein Paket selbst aus dem Internet holt (etwa ein Abgleich mit einem Dienst), geht erst wieder, wenn das Netz da ist – an der Wiederherstellung ändert das nichts.

## Auf dem laufenden System

![Wiederherstellen in der Werkbank](bilder/werkbank-wiederherstellen.png)

1. Den [Wartungsmodus](wartungsmodus.md) einschalten und aktiv werden lassen (oder **Alle jetzt abmelden**).
2. **Werkbank → Sicherung → Wiederherstellen**, Sicherung auswählen, Abgleich prüfen. Passt der Schlüssel dieser Installation nicht zur Sicherung, gib den vom passenden Notfallblatt ein.
3. Bestätigen, dass der jetzige Stand ersetzt wird, und **Wiederherstellen**. In der Rückfrage tippst du zur Sicherheit das Wort **wiederherstellen** ein.
4. Vorher sichert Ablago den **jetzigen Stand** (Art „vor einer Wiederherstellung“) – so kannst du zurück, falls du die falsche Sicherung erwischt hast. Das steht als Haken **Vorher den jetzigen Stand sichern (empfohlen)** im Ablauf, mit der geschätzten Größe; die Sicherung findest du danach unter **Werkbank → Sicherung**. Wann du den Haken abwählst, steht unter [Wiederherstellen im Notfall](#im-notfall). Fehlt dafür der Schlüssel, steht das als Hinweis im Ablauf. Dann bleibt der bisherige Stand der Datenbank **7 Tage** als eigener Bereich (Schema `dms_alt_behalten_…`) in der Datenbank; danach entfernt Ablago ihn beim nächsten Start. Die Abschlussmeldung nennt den Namen.
5. Nach dem Neustart ist der Wartungsmodus aus; alle melden sich neu an.

Sicherungen von Hand zeigen in der Auswahl ihr **Wozu?** (siehe [Jetzt sichern](sicherung.md#jetzt-sichern)) – so findest du z. B. „Vor dem Entfernen von Rechnungen“ schnell wieder.

### Wiederherstellen im Notfall { #im-notfall }

Die Sicherung davor ist ein guter Rückweg – im Notfall kann sie aber selbst im Weg stehen. Darum gilt:

- **Abwählen:** Nimmst du den Haken **Vorher den jetzigen Stand sichern** heraus, fragt Ablago einmal nach: „Ohne Sicherung kannst du den jetzigen Stand nicht mehr zurückholen.“ Das ist richtig, wenn die Sicherung selbst das Problem ist (Ablago verklemmt sich beim Sichern) oder du ohnehin zu einem alten Stand musst.
- **Zu wenig Platz:** Reicht der Platz für die Sicherung davor voraussichtlich nicht (geschätzte Größe plus [Mindest-Speicherplatz](sicherung.md#zeitplan-und-aufbewahrung)), ist der Haken aus und der Grund steht daneben. Sonst könnte die zusätzliche Sicherung die Platte füllen und das Zurückholen scheitern lassen.
- **Die Sicherung davor scheitert:** Ablago bricht nicht stillschweigend ab und versucht es nicht von selbst noch einmal. Es zeigt den Fehler – gleich beim Start oder im Ablauf – und fragt: **Trotzdem ohne Sicherung wiederherstellen?** Du kannst den Grund beheben (z. B. Platz schaffen) oder ohne Sicherung des jetzigen Stands weitermachen. Bis dahin ist nichts ersetzt.
- Das [Protokoll](fehlersuche.md#protokoll) (Modul *sicherung*) vermerkt bei jeder Wiederherstellung, ob mit oder ohne Sicherung davor.

### Angaben zur Sicherung bleiben { #angaben-zur-sicherung }

Die Sicherungsdateien liegen außerhalb der Datenbank, ihre Angaben aber darin: wann zuletzt automatisch gesichert wurde, die letzte Probe mit Ergebnis und die Proben je Sicherung, die Prüfungen, der Stand der Kopien außer Haus und die [ausgeblendeten](sicherung-ausser-haus.md#aus-der-liste-nehmen) Sicherungen. Diese Angaben übernimmt Ablago beim Zurückholen aus dem jetzigen Stand – sie springen nicht auf die Zeit der Sicherung zurück. Zeitplan und Aufbewahrung kommen dagegen aus der Sicherung. Direkt nach dem Wiederherstellen holt Ablago keine Sicherung und keine Probe nach; die nächste kommt zur eingestellten Zeit.

Gehört zur Sicherung ein anderer Schlüssel als der jetzige, legt Ablago die bisherige Schlüsseldatei als `dms.schluessel.alt-…` daneben und nimmt den der Sicherung.

## Probe-Wiederherstellung

Eine Sicherung ist erst dann gut, wenn sie sich einspielen lässt. Deshalb spielt Ablago **sonntags um 04:00** (einstellbar unter *Sicherung → Probe-Wiederherstellung*) die neueste Sicherung probeweise ein – in einen vorübergehenden Bereich, das laufende Ablago bleibt unberührt – und prüft sie wie oben, dazu die Prüfwerte von bis zu 20 Dateien und jede [umgewandelte Fassung](texterkennung.md#andere-dateitypen) gegen den Prüfwert in ihren Angaben. Der Schritt *Entschlüsseln und Einspielen* nennt, wie viele Fassungen dabei sind. Passt eine nicht (etwa weil das Paket sie genau während der Sicherung neu erzeugt hat), übernimmt Ablago sie nicht – das Paket wandelt die Datei dann neu um, wie bei einer älteren Sicherung ohne Fassungen. **Jetzt probeweise wiederherstellen** startet sie sofort.

![Probe-Wiederherstellung](bilder/werkbank-sicherung-probe.png)

Auch die Probe prüft die Erweiterungen der Datenbank (siehe oben); fehlt eine, steht beim Schritt *Erweiterungen der Datenbank* ein Hinweis, die Probe gilt trotzdem als erfolgreich.

Das Ergebnis steht je Sicherung in der Liste und als Ampel in der Übersicht: **grün** = letzte Probe erfolgreich und höchstens 8 Tage alt, **gelb** = älter oder noch nie, **rot** = fehlgeschlagen. Schlägt eine Probe fehl, bekommen alle Administratoren eine Mail. Im aktiven Wartungsmodus und bei zu wenig freiem Platz pausiert die Probe. Die Probe braucht den **aktuellen Schlüssel** dieser Installation: Eine Sicherung mit einem früheren Schlüssel (nach einem [Schlüsselwechsel](verschluesselung.md#schlussel-wechseln)) lässt sich nicht probeweise einspielen; die Probe schlägt dann mit einem Hinweis auf den Schlüssel fehl.

## Wie lange es dauert { #dauer }

Gemessen mit den Daten des [Lasttests](lasttest.md) der Stufe *groß* (#1464): **200.000 Mappen**, knapp 4.000 Dokumente, Datenbank 461 MB, PostgreSQL 18, Rechner mit 2 Kernen, Ablago 0.305:

| Schritt | Dauer |
| --- | ---: |
| Sicherung anlegen (70 MB) | 8 s |
| Wiederherstellen in eine leere Datenbank, gesamt | 102 s |
| davon *Entschlüsseln und Einspielen* (Tabellen, Indizes, Statistik) | 98 s |
| davon Statistik der Datenbank auffrischen (`ANALYZE`) | gut 2 s |

Nach dem Einspielen frischt Ablago die Statistik aller Tabellen auf (`ANALYZE`). Ohne sie wüsste PostgreSQL nicht, wie groß die Tabellen sind, und wählte in den ersten Minuten langsame Wege – mit ihr ist die Ablage gleich nach dem Neustart so schnell wie vorher. Auf einem NAS mit langsamerem Speicher dauert alles entsprechend länger; mit Festplatte statt SSD rechne mit dem Mehrfachen.

## Nicht vorgesehen

Einzelne Mappen oder Dokumente aus einer Sicherung zurückholen geht nicht direkt. Der Weg dafür: die Sicherung auf einem zweiten, vorübergehenden Ablago wiederherstellen (eigenes Compose-Projekt mit anderem Port) und dort heraussuchen. Eine Wiederherstellung per Befehl auf dem NAS gibt es bewusst nicht.
