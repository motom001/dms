# Lasttest selbst durchführen

Wie viel verkraftet Ablago **auf deinem Gerät**? Die Rechner, auf denen das Projekt jede Woche misst, sind kein NAS. Mit dem Lasttest misst du selbst – etwa vor dem Kauf eines neuen Geräts, vor einem Umzug oder wenn Ablago dir langsam vorkommt. Das Ergebnis kannst du freiwillig zurückmelden; daraus entsteht die Tabelle [Was Ablago verkraftet](verkraftet.md).

!!! warning "Nur in einem eigenen Test-Container – nie in deiner echten Installation"
    Der Lasttest legt einen eigenen Haushalt mit Lasttest-Konten (dazu 30 Konten für die simulierten Personen) und bis zu 200.000 Demo-Mappen an (Stufe `extrem`: bis zu 1 Million), ändert beim Speichern Demo-Mappen, probiert falsche Passwörter aus (um den [Anmeldeschutz](anmeldeschutz.md) zu prüfen) und belastet das Gerät minutenlang bis an seine Grenze. Starte dafür einen **eigenen, neuen Container** und lösche ihn danach wieder. Der Lasttest prüft das selbst: Ist Ablago schon eingerichtet und nicht vom Lasttest, oder liegen dort mehr als 200 Mappen, die keine Demo-Mappen sind, bricht er ab, **bevor** er etwas anlegt. Steht die Variable `DMS_LASTTEST` versehentlich in deiner echten Installation, läuft Ablago deshalb ganz normal weiter; die [Übersicht der Werkbank](uebersicht.md) meldet dann, dass der Lasttest nicht gestartet ist und du die Variable entfernen sollst.

## Die Stufen

| Stufe | bildet ab | Last | Daten | Ziel |
| --- | --- | --- | --- | --- |
| `klein` | Haushalt (2–5 Personen) | 25 gleichzeitige Anfragen, gemischt wie im Alltag | 5.000 Mappen | 95 % der Antworten schneller als 0,3 s, keine Fehler |
| `mittel` | Kleinbetrieb (10–15 Personen) | 100 gleichzeitig, dazu ein großer Export nach dem anderen | 50.000 Mappen | 95 % schneller als 1 s, weniger als 0,1 % Fehler |
| `gross` | Belastungsgrenze | alle 2 Minuten mehr gleichzeitige Anfragen (5, 10, 25, 50, 75 …), bis 95 % nicht mehr unter 3 s bleiben, mehr als 1 % fehlschlagen oder der [Überlastschutz](technik.md#last) greift; danach kurz 1000 gleichzeitig | 200.000 Mappen | kein fester Wert – gemessen wird, **wo die Grenze liegt**; Pflicht: kein Absturz, Erholung von selbst |
| `extrem` | sehr großer Bestand | wie `gross` | 500.000 oder 1.000.000 Mappen | wie `gross` – eine Messung, kein Ziel; nur, wenn du sie ausdrücklich wählst (nicht in `alle`) |

**Mit Speichern:** Jede Stufe misst zuerst genau wie bisher – nur lesen. Danach folgt ein zweiter Durchgang **mit Speichern**: gleich viele gleichzeitige Anfragen (bei `gross` und `extrem` so viele, wie die Grenze war), davon rund 10 % schreibend – Mappe ändern, Stern setzen, Notiz anlegen oder löschen, Aufgabe anlegen und erledigen – und 5 % die erste Seite der Historie einer Mappe (#800). Er steht als eigene Zeile im Ergebnis, z. B. `mittel + Speichern`, und hat (noch) kein Ziel. Danach nimmt der Lasttest seine Änderungen zurück, damit die nächste Stufe dieselben Daten misst. So bleiben die bisherigen Zeilen mit älteren Messungen vergleichbar.

**Ziel und CI-Grenze:** Das **Ziel** ist, was das Projekt zusagen möchte. Die wöchentliche Messung auf den Rechnern von GitHub prüft daneben eine **CI-Grenze**: den ersten Lauf dort plus 20 % – für `klein` 0,3 s (wie das Ziel), für `mittel` erst 2,86 s, seit dem Beschleunigen (#615) 1 s wie das Ziel. Nur wenn sie verfehlt ist, wird der Lauf rot; sie wird mit der Zeit nur strenger, bis sie das Ziel erreicht. Die Durchgänge mit Speichern und die Stufe `extrem` haben keine CI-Grenze. Ein verfehltes Ziel heißt: Das Projekt muss Ablago dort schneller machen. Was die Rechner von GitHub und gemeldete Geräte schaffen, steht unter [Was Ablago verkraftet](verkraftet.md).

„Gemischt wie im Alltag“ heißt: Startseite, Listen, Mappen öffnen, Suchen, Vorschaubilder und Dokumente herunterladen. 25 gleichzeitige Anfragen entsprechen etwa 2–5 Personen, die gerade klicken – ein Klick löst mehrere Anfragen aus.

**Eigene Konten (#920):** Jede simulierte Person meldet sich wie ein echter Mensch mit einem **eigenen Konto** an und hat eine eigene Sitzung. Dafür legt der Lasttest 30 Konten mit erfundenen Namen an (*Person 01 (Lasttest)* … mit Adressen unter `example.org`): zwei von drei mit der Rolle *Steuern und Finanzen*, eines von drei ohne Rolle – mit denselben Rechten wie bisher, also ohne zusätzliche Ablehnungen. Sind mehr Personen gleichzeitig unterwegs (ab `mittel`), teilen sie sich die Konten reihum. Am Ende meldet der Test die Personen wieder ab. Abfragen der Messwerte (Werkbank), der Export nebenher und das Aufräumen laufen weiter über die eigene Sitzung des Administrators im Verwaltungsmodus. Bis dahin teilten sich alle Personen drei Konten; gleichzeitige Änderungen warteten dann aufeinander (auf denselben Merker „eigene Änderung“ und dieselbe Sitzung), was bei echten Nutzern nicht passiert. **Ergebnisse mit eigenen Konten** erkennst du an der Zeile *Personen: je Person ein eigenes Konto …* im Ergebnisblock; ältere sind vor allem bei *… + Speichern* nicht direkt vergleichbar.

## Voraussetzungen

- Das Ablago ab Version 0.144.0 für den Weg im Browser (ab 0.132.0 geht der [Weg für Fortgeschrittene](#fur-fortgeschrittene)).
- Platz für den Test-Container: etwa 1 GB für `klein` und `mittel`, 3–5 GB für `gross`, für `extrem` etwa 3 GB (500.000 Mappen) bzw. 5 GB (1 Million) und genug Arbeitsspeicher (4 GB oder mehr).
- Ruhe auf dem Gerät: Laufen nebenher eine Sicherung des NAS, ein Medienserver oder Downloads, misst du die mit. Halte auch dein eigenes Ablago solange an, wenn gerade niemand damit arbeitet.

## Schritt für Schritt – in der Docker-Oberfläche und im Browser

Du brauchst **keine Konsole, keine Ordner und keine Befehle** – nur einen neuen Container mit **einer** Umgebungsvariable.

1. **Container anlegen** – in der Docker-Oberfläche deines NAS (z. B. *Docker* bei UGREEN, *Container Manager* bei Synology, *Container Station* bei QNAP) einen neuen Container aus dem Image anlegen:

    | Einstellung | Wert |
    | --- | --- |
    | Image | `ghcr.io/motom001/dms-komplett:stabil` (Ablago und Datenbank in einem Container) |
    | Name | z. B. `dms-lasttest` |
    | Port | ein freier Port des NAS, z. B. `8099`, auf Port `3000` im Container |
    | Umgebungsvariable | `DMS_LASTTEST` = `klein` (oder `mittel`, `gross`, `alle`, `extrem` – siehe [Die Stufen](#die-stufen)) |
    | Ordner (Volumes) | **keine** |
    | Neustart-Regel | aus bzw. „nie“ |

    Ohne verbundene Ordner läuft alles im Container und verschwindet mit ihm – deine Ordner auf dem NAS bleiben unberührt.

2. **Seite öffnen** – im Browser `http://<Adresse des NAS>:8099`, z. B. `http://nas.home.arpa:8099`. Statt der Anmeldung siehst du die Seite **Lasttest**: unter der Überschrift die Version des laufenden Containers (z. B. „Ablago 0.244.0“, #1117 – so siehst du, dass das richtige Image misst; sie steht auch im Bericht und im Ergebnisblock und bleibt nach dem Beenden stehen), welche Stufe läuft, was gerade passiert (Test-DMS einrichten, Demo-Mappen anlegen, messen) und die **geschätzte Restdauer**. Die Seite geht auch am Handy.

    ![Seite Lasttest im Browser](bilder/lasttest-seite.png)

3. **Gerät beschreiben** – in **Beschreibe dein Gerät** Modell und Ausstattung eintragen, z. B. `UGREEN DXP4800 Plus, 16 GB RAM`. **Keine Namen, Adressen oder Rechnernamen** – der Text steht im Ergebnis, das du veröffentlichst. Was du tippst, steht sofort im Ergebnisblock. Darunter die **Speicherart** (HDD, SSD oder NVMe): Der Test erkennt sie, soweit das aus dem Container geht; sonst wählst du sie – „weiß nicht“ geht auch. CPU-Modell, Kerne und Arbeitsspeicher trägt der Test selbst ein.

4. **Warten** – `klein` dauert etwa 5–8 Minuten, `mittel` 18–35 Minuten (50.000 Mappen anlegen), `gross` 35–70 Minuten (200.000 Mappen anlegen, dann je Schritt 2 Minuten), `alle` entsprechend länger; darin steckt je Stufe gut 2 Minuten für den Durchgang mit Speichern. `extrem` braucht auf schneller Hardware 1–2,5 Stunden mit 500.000 Mappen und etwa doppelt so lange mit einer Million – auf einem kleinen NAS auch deutlich länger. Du kannst die Seite schließen und später wieder öffnen.

    Schon ab dem Einrichten – auch während die Demo-Mappen angelegt werden und während Ablago auf den Volltext und die Arbeit im Hintergrund wartet (#1117) – zeigt die Seite unter **Jetzt gemessen** (#895), was im Container los ist – ohne `top` und ohne Docker-Log: **CPU** und **Arbeitsspeicher** des Containers mit Kurve wie unter Werkbank → Systemzustand → Auslastung, den laufenden **Durchgang** mit der Zahl gleichzeitiger Anfragen, **p95 der letzten 10 Sekunden**, die **Warteschlange an der Datenbank** (wartende Abfragen, belegte Verbindungen), **Wer belegt die CPU** (dieselben Gruppen wie im Ergebnis, siehe [CPU je Gruppe](#ergebnis-lesen)) und die **neuesten Warnungen und Fehler** aus dem Protokoll. Vor dem ersten Durchgang steht bei **Durchgang** „–“ mit dem laufenden Schritt (z. B. „– (Legt Demo-Mappen an)“) und bei **p95** „–“; CPU, Arbeitsspeicher, Warteschlange und **Wer belegt die CPU** sind schon da – so siehst du auch bei `extrem` in der langen Vorbereitung, dass etwas passiert. Die Werte kommen aus derselben Messung, die der Test in den Durchgängen alle 2 Sekunden macht; die Seite fragt nichts zusätzlich ab und verfälscht die Messung so nicht. Zwischen zwei Durchgängen bleibt der letzte Stand stehen.

    Weitere Variablen, nur wenn du sie brauchst: `DMS_LASTTEST_MAPPEN` = `1000000` misst `extrem` mit einer Million statt 500.000 Mappen; `DMS_LASTTEST_SPEICHERN` = `nein` lässt die Durchgänge mit Speichern weg; `DMS_LASTTEST_DAUER` ändert die Sekunden je Durchgang (Vorgabe 120).

5. **Ergebnis kopieren** – am Ende stehen der Block **Messergebnis Lasttest** mit **Kopieren** und **Als Datei herunterladen**, die Links zum Formular und zum Sammel-Issue [#576](https://github.com/motom001/dms/issues/576) und – aufklappbar – der ganze Bericht. Wie du das Ergebnis liest und zurückmeldest, steht [unten](#ergebnis-lesen).

    ![Seite Lasttest mit dem Ergebnis zum Kopieren](bilder/lasttest-ergebnis.png)

6. **Test beenden** – **Test beenden und Container herunterfahren**. Vorher fragt die Seite noch einmal nach (**Beenden und herunterfahren**); hast du das Ergebnis noch nicht kopiert oder heruntergeladen, steht das in der Rückfrage – dann besser erst **Abbrechen** und kopieren. Danach steht dort „Danke, dass du mitgemessen hast!“: Der Container fährt herunter, du kannst die Seite schließen; das Ergebnis bleibt auf der Seite sichtbar und kopierbar. Mit `--rm` gestartet, ist der Container danach weg; sonst löschst du ihn in der Docker-Oberfläche und bei Bedarf auch das Image.

??? note "So sieht die Seite dunkel und am Handy aus"
    ![Seite Lasttest, dunkle Darstellung](bilder/lasttest-seite-dunkel.png)

    ![Seite Lasttest am Handy](bilder/lasttest-handy.png)

### Mit einem Befehl in der Konsole

Dasselbe in einer Zeile – `--rm` löscht den Container, sobald du den Test auf der Seite beendest:

```sh
docker run -d --rm --name dms-lasttest -p 8099:3000 -e DMS_LASTTEST=klein ghcr.io/motom001/dms-komplett:stabil
```

Danach weiter mit Schritt 2. Das Image löschst du bei Bedarf mit `docker image rm ghcr.io/motom001/dms-komplett:stabil`.

### Einen bestimmten Datenträger messen

Ohne Ordner liegt alles dort, wo Docker seine Container ablegt – auf vielen NAS die System-SSD oder das erste Speicher-Volume. Willst du gezielt einen anderen Datenträger messen (z. B. die Festplatten statt der System-SSD), verbinde **einen leeren Ordner** auf diesem Datenträger mit `/data` im Container – das ist der einzige Grund für einen Ordner:

```sh
docker run -d --rm --name dms-lasttest -p 8099:3000 -e DMS_LASTTEST=klein \
  -v /volume1/dms-lasttest:/data ghcr.io/motom001/dms-komplett:stabil
```

Der Test erkennt dann die Speicherart dieses Datenträgers, und das Ergebnis liegt zusätzlich als Datei in diesem Ordner unter `ergebnis/`. Lösche den Ordner nach dem Test.

### Wo das Ergebnis sonst noch steht

Hast du die Seite geschlossen, bevor du das Ergebnis kopiert hast: Es steht auch in den **Logs** des Containers (in der Docker-Oberfläche unter *Protokoll* bzw. *Logs*) und als Datei im Container unter `/data/ergebnis/lasttest-<stufe>.md` – mit Gerät und Speicher, sobald du sie auf der Seite eingetragen hast. Startet der Container nach dem Beenden neu (Neustart-Regel), misst er nicht noch einmal, sondern zeigt das Ergebnis wieder an.

## Für Fortgeschrittene

Der Lasttest steckt als Befehl `dms-lasttest` im Image. So misst du ohne die Seite im Browser – etwa die Variante mit getrennter Datenbank, mit eigenen Optionen oder von einem anderen Rechner aus.

1. **Test-Installation starten** – mit eigenem Namen, eigenem Port und eigenen, leeren Ordnern, z. B.:

    ```sh
    docker run -d --name dms-test -p 8099:3000 \
      -v /pfad/zu/dms-test/files:/data/files \
      -v /pfad/zu/dms-test/geheim:/data/geheim \
      -v /pfad/zu/dms-test/sicherung:/data/sicherung \
      -v /pfad/zu/dms-test/postgres:/data/postgres \
      ghcr.io/motom001/dms-komplett:stabil
    ```

    Willst du die Variante mit getrennter Datenbank messen, nimm deine Vorlage (Compose-Datei) als eigenes Projekt, z. B. `dms-test`, mit anderen Ordnern und anderem Port – dort geht auch der Weg im Browser mit `DMS_LASTTEST`. Nicht einrichten – das macht der Lasttest.

2. **Stufe starten** – im Test-Container, also auf demselben Gerät:

    ```sh
    docker exec -it dms-test dms-lasttest klein --geraet "Modell deines Geräts" --speicher SSD
    ```

    Statt `klein` geht `mittel`, `gross`, `alle` (die drei nacheinander) oder `extrem` (mit `--mappen 1000000` eine Million statt 500.000 Mappen). Beim ersten Start richtet der Lasttest das frische Ablago selbst ein; den Einrichtungscode liest er aus dem Ordner `geheim`. Fehlen für eine größere Stufe Mappen, legt er die Demo-Mappen dazu und wartet, bis Ablago mit der Arbeit im Hintergrund fertig ist. `dms-lasttest --pruefen` prüft nur, ob der Lasttest hier laufen dürfte, und legt nichts an.

3. **Ergebnis lesen** – am Ende stehen ein Bericht und darunter der Block **Messergebnis Lasttest**.

4. **Aufräumen:** Test-Container stoppen und löschen (`docker rm -f dms-test`), die Ordner der Test-Installation löschen.

Optionen: `--geraet "…"` und `--speicher HDD|SSD|NVMe` tragen Gerät und Speicher in den Ergebnisblock ein (sonst steht dort „bitte ergänzen“). `--dauer <Sekunden>` ändert die Messdauer von `klein` und `mittel` (Vorgabe 120; im Weg über den Browser mit der Variable `DMS_LASTTEST_DAUER`). `--start`, `--schritt` und `--schritt-dauer` ändern die Steigerung von `gross` (Vorgabe: 5 und 10, dann ab 25 in Schritten von 25, je 120 Sekunden; mit `--start` beginnt sie genau dort), `--bis <n>` begrenzt sie. `--ohne-speichern` lässt die Durchgänge mit Speichern weg. `--bericht <Datei>` speichert den Bericht.

Den Lasttest auf einem anderen Rechner gegen die Test-Installation laufen zu lassen geht auch (`--ziel http://…:8099`); dann fehlt im Ergebnis das CPU-Modell, und das Netzwerk misst mit.

### Mit getrennter Datenbank (Compose)

Im Lasttest-Modus mit `dms-komplett` laufen Ablago, PostgreSQL und der Lastgenerator im selben Container und teilen sich Kerne und Arbeitsspeicher – die gemessene Grenze ist also nicht die reine Grenze des Geräts. Mit getrennter Datenbank läuft PostgreSQL in einem eigenen Container (auf demselben Gerät). Ein Beispiel als eigenes Projekt, z. B. `dms-test` – mit eigenem Port und **einem Volume für `/data`** und einem für die Datenbank:

```yaml
# Lasttest mit getrennter Datenbank – nur als eigenes Test-Projekt, nie neben der echten Ablage.
services:
  db:
    image: postgres:17
    restart: unless-stopped
    # #894: zählt die teuersten Abfragen für den Lasttest (dms-komplett lädt es von selbst).
    command: postgres -c shared_preload_libraries=pg_stat_statements
    environment:
      POSTGRES_DB: dms
      POSTGRES_USER: dms
      POSTGRES_PASSWORD: lasttest
    volumes:
      - lasttest-postgres:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U dms -d dms"]
      interval: 5s
      retries: 10

  app:
    image: ghcr.io/motom001/dms:stabil
    restart: unless-stopped
    depends_on:
      db:
        condition: service_healthy
    environment:
      DATABASE_URL: postgres://dms:lasttest@db:5432/dms
      DMS_LASTTEST: klein
    volumes:
      # Dokumente, Schlüssel, Ergebnis – gehört zur Datenbank oben und muss mit ihr zusammen bleiben oder gehen.
      - lasttest-data:/data
    ports:
      - "8099:3000"

volumes:
  lasttest-postgres:
  lasttest-data:
```

Starten mit `docker compose up -d`, dann weiter mit Schritt 2 oben (Seite im Browser). `restart: unless-stopped` startet Ablago nach einem Absturz neu; nach **Test beenden und Container herunterfahren** startet der Container ebenfalls neu und zeigt das Ergebnis wieder an. Aufräumen mit `docker compose down -v` – das löscht auch beide Volumes.

!!! warning "Datenbank und Dateien gehören zusammen"
    Mit den Volumes bleiben Datenbank **und** Dokumente zwischen zwei Läufen erhalten; der nächste Lauf nimmt die Demo-Mappen wieder. Lässt du die Volumes weg, müssen vor jedem Lauf **beide** Container neu entstehen – `docker compose down`, dann `docker compose up -d`. Entsteht nur der Container `app` neu, bleibt die Datenbank stehen, die Dateien der Dokumente aber fehlen. Ablago läuft dann zwar weiter (die betroffenen Dokumente antworten mit „Die Datei zu diesem Dokument fehlt“), die Messung zählt aber Fehler statt Last. Der Lasttest prüft das am Anfang und warnt mit „Dokumente ohne Datei: n – ist `/data` als Volume eingebunden?“.

## Ergebnis lesen

- **p50, p95, p99:** Die Hälfte, 95 % bzw. 99 % der Antworten kamen schneller als dieser Wert. p95 ist der wichtigste: Er zeigt, wie es sich anfühlt, wenn es gerade hakt.
- **Fehlerquote:** Anteil der Anfragen mit Serverfehler oder ganz ohne Antwort. Abgewiesene Anfragen („gerade sehr beschäftigt“, 503) zählen extra. Im Protokoll stehen sie seit #920 nicht mehr als Fehler, sondern als **Hinweis** des Überlastschutzes – höchstens eine Zeile je Minute mit der Zahl der Abweisungen; sie sind gewollt.
- **Ziel eingehalten / verfehlt** (`klein`, `mittel`): ob dein Gerät die Ziele der Tabelle oben schafft. Verfehlt heißt nicht kaputt – Ablago ist dann bei so vielen gleichzeitigen Anfragen langsamer, als das Projekt es sich vornimmt. Der Bericht nennt dazu die **CI-Grenze** des Projekts (z. B. „Ziel p95 < 1000 ms, CI-Grenze 1000 ms“); sie gilt für die Messung auf den Rechnern von GitHub, nicht für dein Gerät. Gerade wenn dein Gerät das Ziel verfehlt, hilft deine Meldung im Sammel-Issue [#576](https://github.com/motom001/dms/issues/576).
- **Grenze** (`gross`, `extrem`): so viele gleichzeitige Anfragen schafft das Gerät noch mit 95 % der Antworten unter 3 s, dazu die Anfragen je Sekunde. Darunter steht, warum der nächste Schritt zu viel war, und wie schnell sich Ablago nach 1000 gleichzeitigen Anfragen erholt hat. Im Lasttest-Modus laufen Ablago, PostgreSQL und der Lastgenerator, der die Anfragen schickt, im selben Container und teilen sich Kerne und Arbeitsspeicher – die Grenze ist die Grenze dieses Aufbaus, nicht allein die des Geräts.
- **… + Speichern:** dieselbe Last mit rund 10 % schreibenden Anfragen – p50, p95, p99 und Fehlerquote wie in der Zeile darüber, dahinter in Klammern p50 und p95 nur der schreibenden Anfragen. Der Abstand zur Zeile darüber zeigt, wie viel das Speichern das Lesen der anderen bremst. Die Zeile *Mit Speichern: Arbeitsspeicher …* gilt nur für diese Durchgänge; *Arbeitsspeicher Ablago höchstens* zählt wie bisher nur die Durchgänge ohne Speichern.
- **extrem Demo-Daten:** wie lange das Anlegen der Demo-Mappen gedauert hat, wie lange Ablago danach im Hintergrund zu tun hatte und wie groß Datenbank und Dokumente sind.
- **Arbeitsspeicher Ablago höchstens:** so viel belegten die Prozesse von Ablago zusammen. Die Pflicht des Projekts von **höchstens 1,5 GB** (1.536 MB, bei `groß`) gilt **je Prozess** (#920): Mit mehreren Prozessen prüft der Test jeden einzeln; die Zeile *Arbeitsspeicher je Prozess höchstens* nennt den höchsten Prozess und die Grenze für alle zusammen (Prozesse × 1.536 MB). Im Bericht steht bei `groß` beides als *Arbeitsspeicher (Pflicht)*. Bis dahin verglich der Bericht die Summe mit 1.536 MB und meldete mit zwei Prozessen zu Unrecht „verfehlt“. Diese Zahl hängt nur an Ablago, nicht daran, wie viel das Gerät für Datenbank und Zwischenspeicher übrig hat.
- **Arbeitsspeicher Container höchstens:** so viel brauchte der **ganze Container** – diese Zahl passt zu dem, was die Docker-Oberfläche deines NAS anzeigt. Sie ist meist deutlich höher als „Ablago höchstens“: Bei `dms-komplett` läuft PostgreSQL im selben Container und hält Daten im Speicher (in Klammern als *PostgreSQL*), und das Betriebssystem zählt den **Dateizwischenspeicher** mit, den es bei Bedarf sofort wieder freigibt. *Programme* ist der Teil, der wirklich belegt ist. Node.js gibt Speicher nach der Last erst spät zurück, deshalb bleibt die Anzeige der NAS auch nach dem Test eine Weile hoch. Lässt sich der Wert im Container nicht lesen, steht dort „nicht verfügbar“.
- **Ereignisschleife p99** (wie lange Anfragen höchstens warten mussten, weil der Server rechnete) zeigt zusammen mit dem Arbeitsspeicher, wo es eng wird. Hinweise zu den Einstellungen dafür stehen unter [Systemzustand → Einstellungen und Engpässe](speicherplatz.md#einstellungen-und-engpasse).
- **Engpass …** (#874, eingerückt unter einer Stufe; bei `groß` für den Schritt an der Grenze): wo es in diesem Durchgang hakte, über alle Prozesse von Ablago. *Warten auf DB-Verbindung* – wie lange Abfragen auf eine freie Verbindung zur Datenbank warteten (p95 als Obergrenze einer Klasse, z. B. „≤ 20 ms“, und der längste Wert). *Verbindungen belegt bis … von …* – wie viele gleichzeitig in Arbeit waren, in Klammern, wie viele Abfragen höchstens warteten. *Sperren* – wie viele Sitzungen der Datenbank gleichzeitig auf eine Sperre warteten und wie lange die längste (Stichproben alle 2 Sekunden). *CPU* – Rechenzeit von PostgreSQL (nur, wenn es im selben Container läuft), Ablago und dem ganzen Container über den Durchgang, in Prozent **eines** Kerns (200 % = zwei Kerne voll). *Neustarts von Prozessen* – wie oft ein Prozess abstürzte und neu startete, mit Nummer und Code bzw. Signal (SIGKILL heißt meist: der Kernel hat ihn wegen zu wenig Arbeitsspeicher beendet). *Speicher je Prozess* – höchstens, je Prozess (*Hauptprozess* verteilt nur, dann *Prozess 1:*, *Prozess 2:* …), in Klammern der Anteil der Halde von Node.js, z. B. „Hauptprozess 32 MB, Prozess 1: 1588 MB (Halde 977), Prozess 2: 862 MB (Halde 370)“. Gab es Fehler, steht darunter **Fehler …** mit ihrer Art: Status (z. B. 500, 502), abgebrochene Verbindungen (z. B. ECONNRESET) und Anfragen ohne Antwort; bei `groß` auch für den Schritt, an dem es abbrach (*Engpass … (Abbruch)*). Liegt das Warten auf Verbindungen hoch, während die CPU von PostgreSQL nicht voll ist, fehlen Verbindungen; ist die CPU voll, helfen mehr Verbindungen oder Prozesse nicht.
- **Teuerste Abfragen …** (#894, eingerückt unter einer Stufe; bei `groß` für den Schritt an der Grenze): die drei Abfragen an die Datenbank, die in diesem Durchgang zusammen die meiste Rechenzeit brauchten – je Abfrage ihr Anteil an der Rechenzeit aller Abfragen, wie oft sie lief und wie lange im Mittel (*Ø*), dahinter ihr Anfang. Der Bericht nennt je Durchgang die **zehn teuersten** als Tabelle: Gesamtzeit, Anzahl, Mittel, Zeilen und Anteil. Die Werte stammen aus der Erweiterung `pg_stat_statements` von PostgreSQL; der Lasttest setzt sie vor jedem Durchgang zurück. Abfragen erscheinen nur **normalisiert** – statt der Werte steht `$1`, `$2` …, Zeichenketten werden durch `'…'` ersetzt –, gekürzt auf 120 Zeichen; Inhalte aus der Ablage stehen dort also nicht. Ist eine Abfrage mit kleinem Mittelwert ganz oben, läuft sie sehr oft; ist der Mittelwert hoch, ist sie selbst langsam.
  - `dms-komplett` lädt `pg_stat_statements` beim Start (auch mit einer schon bestehenden Datenbank) und legt die Erweiterung an.
  - **Datenbank im eigenen Container:** Ohne das Modul steht dort `Teuerste Abfragen: – (pg_stat_statements nicht geladen, so einschalten: …)`; der Lasttest läuft trotzdem. Einschalten mit `command: postgres -c shared_preload_libraries=pg_stat_statements` beim Dienst der Datenbank (wie im Beispiel oben), dann den Container der Datenbank neu erstellen. Die Erweiterung legt Ablago beim nächsten Lasttest selbst an, wenn die Rolle das darf (sonst als Superuser in der Datenbank von Ablago: `CREATE EXTENSION pg_stat_statements;`).
  - **Kosten:** Ist das Modul geladen, zählt PostgreSQL jede Abfrage mit – das kostet wenig (meist 1–2 % Rechenzeit, einige MB gemeinsamen Speicher für bis zu 5000 Abfragen). Ablago liest und setzt die Werte nur im Lasttest zurück bzw. wenn Verwaltende mit dem Recht *Systemzustand* danach fragen, nie im laufenden Betrieb. Wer es nicht will, lässt `command:` weg bzw. nimmt es nach dem Lasttest wieder heraus.
- **CPU je Gruppe …** (#895, eingerückt unter einer Stufe, beim selben Durchgang wie *Teuerste Abfragen*): wer im Container die Rechenzeit braucht – wie `top`, aber nach Gruppen und über den ganzen Durchgang, in Prozent **eines** Kerns, dahinter der Arbeitsspeicher höchstens (RSS; geteilter Speicher zählt dabei mehrfach). Die Gruppen: *Ablago Hauptprozess* und *Ablago Prozess 1, 2 …* (jeder Prozess von Ablago für sich), *Lastgenerator* (das Skript des Tests, das die Anfragen schickt – im Lasttest-Modus im selben Container), *PostgreSQL* (alle Prozesse der Datenbank zusammen, in Klammern wie viele; nur, wenn sie im selben Container läuft – sonst steht dort „im eigenen Container – nicht messbar“), *Texterkennung* (tesseract, ocrmypdf), *Seiten-/Vorschaubilder* (pdftoppm, qpdf, gs …) und *andere Programme* (alles Übrige, auch kurzlebige Programme, die zwischen zwei Abfragen starten und enden). Gelesen wird aus `/proc` im Container, nur unter Linux; anderswo steht dort „nicht verfügbar“. Der Bericht nennt die Gruppen je Durchgang als Tabelle. Braucht der Lastgenerator selbst viel, teilt er sich die Kerne mit Ablago – die Grenze ist dann auch seine. Ist *PostgreSQL* nahe an der Zahl der Kerne × 100 %, helfen mehr Prozesse von Ablago nicht.
- **Protokoll: …** (#895, eine Zeile am Ende): Warnungen und Fehler, die Ablago während des Laufs ins Protokoll schrieb – aus allen Prozessen, gleiche Meldungen zusammengezählt, die drei häufigsten mit Anzahl, Stufe (*Warnung*, *Fehler*), Modul und Text; gab es keine, steht dort „keine Warnungen und Fehler“. Stürzte ein Prozess ab, folgt *Neustarts:* mit Nummer und Grund – Code bzw. Signal und, wenn der Prozess sie noch melden konnte, die Art der Ausnahme (z. B. „Prozess 2 Code 1, TypeError“). Der Bericht nennt die **20 häufigsten** als Tabelle mit erstem Zeitpunkt und Durchgang, dazu alle Abstürze und Neustarts. **Ohne Innenleben:** Gezählt wird nur der Text der Meldung ohne ihre Einzelheiten – Pfade, Adressen, E-Mail-Adressen, Prüfsummen, Ids, Zahlen und Angaben in Anführungszeichen ersetzt Ablago (z. B. `Datei fehlt: <Pfad>`), Namen und Mappeninhalte stehen dort nicht. Von einer Ausnahme bleibt nur ihre Art (z. B. `Error ENOENT`), nicht ihre Nachricht. Bei **Lange Anfrage** und **Langer Datenbankzugriff** bleibt die Dauer stehen (#909): zusammengefasst mit höchster und mittlerer Dauer, z. B. „31× Warnung [datenbank] Lange Anfrage: GET /api/mappen/:id dauerte bis 1.240 ms (Ø 610 ms)“ – statt des Pfads mit Ids steht dort Methode und Routenmuster. Die höchste Dauer gilt seit dem Start von Ablago, die mittlere für den Lauf. Seit #920 schreibt Ablago diese beiden **je Minute und Art eine Zeile** (Anzahl, höchste und mittlere Dauer) statt jede einzeln – unter Last kostete das Schreiben selbst Zeit. Gezählt wird genauso; eine Meldung erscheint dadurch bis zu einer Minute später und zählt beim Durchgang, in dem sie zuerst auftrat. Was nur die Mess-Sitzung des Tests im Verwaltungsmodus auslöst (z. B. „Im Verwaltungsmodus: fremde Mappe“), zählt im Lasttest-Modus nicht mit – im Protokoll des Containers steht es weiter. Was genau passiert ist, steht weiter im Protokoll des Containers.

## Ergebnis zurückmelden

Der Block **Messergebnis Lasttest** enthält **keine personenbezogenen Daten** und **keine Adressen, Rechner- oder Haushaltsnamen** – nur Ablago-Version, Image, wo die Datenbank läuft, Gerät (was du ins Gerätefeld schreibst), CPU, Kerne, Arbeitsspeicher, Art des Speichers, Zahl der Mappen und Dokumente, je Stufe p50/p95/p99 und Fehlerquote (ohne und mit Speichern), die Grenze, die Spitze des Arbeitsspeichers, die Ereignisschleife und je Durchgang den Engpass (Verbindungen, Sperren, Rechenzeit, Arbeitsspeicher je Prozess), je Stufe die drei teuersten Abfragen (nur normalisiert, ohne Werte) und die Rechenzeit je Gruppe sowie die häufigsten Warnungen und Fehler aus dem Protokoll (nur Art und Text, ohne Einzelheiten). Kopiere ihn unverändert (auf der Seite mit **Kopieren**) in das Formular [Messergebnis Lasttest](https://github.com/motom001/dms/issues/new?template=messergebnis-lasttest.yml) auf GitHub oder als Kommentar in das Sammel-Issue [#576](https://github.com/motom001/dms/issues/576), wo alle Messergebnisse zusammenkommen. Der Beitrag ist öffentlich; alles ist freiwillig – Ablago selbst meldet nichts.
