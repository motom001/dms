# KI lokal betreiben

Mit dem Paket **KI-Assistent** beantwortet Ablago Fragen an die Ablage ([Frag deine Ablage](pakete.md#frag-deine-ablage)) und füllt Felder aus Dokumenten ([Aus Dokument ausfüllen](pakete.md#erkennung-durch-ein-paket)); ab Version 1.3.0 schlägt es auch vor, wohin neue Post gehört ([Wohin gehört das?](pakete.md#wohin-gehoert-das)). Das Paket rechnet nicht selbst – es fragt einen **KI-Dienst**. Läuft dieser Dienst bei dir zu Hause, etwa auf deinem NAS, brauchst du **keine Cloud**: Die Daten verlassen das Haus nicht.

Für den Dienst gibt es ein fertiges Beispiel mit **[Ollama](https://ollama.com)** (MIT-Lizenz): [`deploy/beispiele/ki-ollama/`](https://github.com/motom001/dms/tree/main/deploy/beispiele/ki-ollama). Es startet mit `docker compose up -d`, lädt das Modell beim ersten Start selbst und ist **von außen nicht erreichbar** – nur Ablago spricht mit ihm.

!!! warning "Ein NAS ist kein KI-Rechner"
    Ohne Grafikkarte rechnet der Prozessor. Das geht, ist aber langsam: Rechne auf einem typischen NAS mit **einer halben bis zwei Minuten je Antwort**, nicht mit Sekunden (siehe [Wie schnell ist das?](#geschwindigkeit)). Für „Aus Dokument ausfüllen“, das im Hintergrund nebenher laufen darf, reicht das oft; für ein flüssiges Gespräch eher nicht.

## Was an den KI-Dienst geht { #was-geht-wohin }

- **Frag deine Ablage:** die Frage, der bisherige Chat und **wenige Ausschnitte**, die Ablago selbst herausgesucht hat – nur aus Mappen, die der Fragende lesen darf, höchstens so viele, wie unter [Höchstmenge je Frage](pakete.md#frag-deine-ablage) eingestellt (Standard 8 Ausschnitte, zusammen 6 000 Zeichen).
- **Aus Dokument ausfüllen:** der Text des Dokuments (höchstens 50 000 Zeichen), der Name des Mappentyps und eine Beschreibung der Felder – nie Passwortfelder, nie Felder, die der Benutzer nicht bearbeiten darf.
- **Nie:** der ganze Bestand, Dateien oder Bilder, Benutzer, Passwörter.
- **Nur aus zugelassenen Mappentypen:** Der KI-Assistent ist ein KI-Paket – er bekommt nur Inhalte aus Mappentypen, die für KI-Dienste zugelassen sind; neue erst, wenn du sie zulässt (siehe [KI-Dienste und Mappentypen](pakete.md#ki-dienste)). Was er wann wohin geschickt hat, steht in seinen [Netzaufrufen](pakete.md#netzaufrufe).

Läuft Ollama bei dir, bleibt all das im Haus. Das Beispiel schaltet die Cloud-Funktionen von Ollama ab (`OLLAMA_NO_CLOUD=1`, kein Rechnen bei Ollama im Internet). Ins Internet geht Ollama nur, um das Modell herunterzuladen. Inhalte schreibt Ollama nicht ins Log – schalte dafür `OLLAMA_DEBUG` **nicht** ein, das zeigt auch die Anfragen.

## Was du brauchst

- Ablago ab **0.125.0** und das Paket **KI-Assistent** ab 1.1.1 (Werkbank → Pakete).
- Docker mit Compose auf dem Gerät, auf dem Ablago läuft (für einen anderen Rechner siehe [Ollama auf einem anderen Rechner](#anderer-rechner)).
- **Platz:** einige GB für das Ollama-Image (es bringt die Bibliotheken für NVIDIA und Vulkan mit) und 2–3 GB je kleinem Modell, am besten auf SSD – von einer Festplatte dauert das Laden des Modells länger.
- **Arbeitsspeicher:** ein kleines Modell belegt beim Rechnen etwa 3–4 GB. Das Beispiel begrenzt den KI-Container auf 6 GB, damit Ablago, Datenbank und andere Container genug behalten.

## Einrichtung Schritt für Schritt { #einrichtung }

### 1. KI-Dienst starten

1. Lege einen Ordner an, z. B. `/volume1/docker/dms-ki/`, und lege die Datei [`docker-compose.yml`](https://github.com/motom001/dms/blob/main/deploy/beispiele/ki-ollama/docker-compose.yml) aus dem Beispiel hinein.
2. Wenn du ein anderes Modell willst, ändere oben die Zeile `x-modell: &modell "ministral-3:3b"` (siehe [Welches Modell?](#modell)).
3. Starte das Projekt – auf der Kommandozeile im Ordner mit `docker compose up -d`, in der Oberfläche des NAS als neues Projekt (Name z. B. `dms-ki`, Compose-Datei einfügen).
4. Der Dienst **`modell-laden`** holt jetzt das Modell (2–3 GB) und **beendet sich danach** – „Beendet“ ist bei ihm also richtig. Fortschritt: `docker compose logs -f modell-laden`. Beim nächsten Start sieht er, dass das Modell schon da ist, und lädt nichts.

Das Projekt legt das Docker-Netz **`dms-ki`** an. Es ist `internal`, führt also nicht nach draußen; Ollama hat **keinen Port nach außen**. Das ist Absicht: Ollama kennt keine Anmeldung – wer die Adresse erreicht, kann fragen, Modelle laden und löschen.

### 2. Ablago ins Netz `dms-ki` hängen { #2-das-dms-ins-netz-dms-ki-hangen }

Ablago muss Ollama erreichen. Dafür kommt es zusätzlich ins Netz `dms-ki`. Ergänze in der Compose-Datei **von Ablago** beim Dienst `app` (bei `dms-komplett` heißt er `dms`) die Netze und am Ende den Block `networks:`:

```yaml
services:
  app:
    # … wie bisher …
    networks:
      - default
      - dms-ki

networks:
  dms-ki:
    external: true
```

Danach das Ablago-Projekt neu starten. Auf der Kommandozeile geht es auch ohne die Datei zu ändern: `docker compose -f docker-compose.yml -f /volume1/docker/dms-ki/dms-anbinden.yml up -d` mit [`dms-anbinden.yml`](https://github.com/motom001/dms/blob/main/deploy/beispiele/ki-ollama/dms-anbinden.yml) aus dem Beispiel.

!!! note "Reihenfolge"
    Starte den KI-Dienst **vor** Ablago: Er legt das Netz `dms-ki` an. Fehlt das Netz, startet Ablago nicht („network dms-ki declared as external, but could not be found“).

**Lieber alles in einem Projekt?** Du kannst die Dienste `ollama` und `modell-laden` auch direkt in die Compose-Datei von Ablago übernehmen. Dann sind beide im selben Netz, und die Zeilen oben entfallen; den Block `networks:` mit `dms-ki` lässt du dann ebenfalls weg (und die Zeile `- dms-ki` bei `ollama`).

### 3. Paket einrichten

1. *Werkbank → Pakete → KI-Assistent → Installieren*, Rechte bestätigen.
2. Reiter **Einstellungen**:
    - **Dienst-Adresse:** `http://ollama:11434/v1` – `ollama` ist der Name des Dienstes im Netz `dms-ki`. `http://` ist hier richtig: Die Verbindung bleibt im Docker-Netz auf demselben Gerät.
    - **Modell:** genau der Name aus der Compose-Datei, z. B. `ministral-3:3b`.
    - **Schlüssel (API-Key):** leer lassen.
3. **Speichern** und die Adresse bestätigen (**Adresse bestätigen und speichern**) – siehe [Dienst-Adresse](pakete.md#dienst-adresse).
4. **Verbindung testen.** Die Meldung sagt, ob Ollama erreichbar ist, ob das Modell da ist und wie lange eine kurze Probeantwort dauerte. Die erste Probe dauert länger, weil Ollama das Modell erst in den Speicher lädt.

### 4. Auf einem NAS ohne Grafikkarte: weniger auf einmal { #nas-einstellungen }

Ohne Grafikkarte kostet vor allem das **Lesen** Zeit: Jeder Ausschnitt muss erst durch das Modell, bevor das erste Wort kommt. Wir empfehlen deshalb auf einem NAS ohne Grafikkarte:

| Einstellung | wo | Standard | auf einem NAS ohne Grafik |
| --- | --- | --- | --- |
| Höchstens Ausschnitte je Frage | Werkbank → Pakete → KI-Assistent → Frag deine Ablage | 8 | **4** |
| Höchstens Zeichen je Frage | ebenda | 6 000 | **3 000** |
| Antwort höchstens (Tokens) | Einstellungen des Pakets | 800 | **400** |
| Zeitgrenze (Sekunden) für Aus Dokument ausfüllen | Einstellungen des Pakets | 50 | **55** (höchster Wert) |

Weniger Ausschnitte heißt: schnellere Antworten, aber eher „steht nicht in den Ausschnitten“. Probiere es mit deinen eigenen Fragen aus.

### Ollama auf einem anderen Rechner { #anderer-rechner }

Ein PC mit Grafikkarte im Heimnetz ist meist viel schneller als ein NAS. Starte dort Ollama (oder das Beispiel mit [`nvidia.yml`](#nvidia) bzw. [`amd.yml`](#amd)) und mache es im Heimnetz erreichbar – beim Beispiel mit `ports: ["11434:11434"]` beim Dienst `ollama`, bei einer normalen Installation mit `OLLAMA_HOST=0.0.0.0`. In Ablago trägst du dann `http://<Adresse des PCs>:11434/v1` ein, z. B. `http://192.168.1.20:11434/v1`.

Weil Ollama keine Anmeldung kennt, erreicht es dann **jedes Gerät im Heimnetz**. Erlaube den Port in der Firewall des PCs am besten nur für die Adresse des NAS, und gib ihn nie im Router nach außen frei. Der PC muss laufen, wenn die KI arbeiten soll; sonst meldet Ablago „nicht erreichbar“, und *Aus Dokument ausfüllen* nimmt die eingebaute Erkennung.

## Welches Modell? { #modell }

Ein **Modell** ist das, was rechnet; Ollama lädt es aus seiner Bibliothek. Die Größe in **Milliarden Parametern** (Mrd.) bestimmt Qualität, Tempo und Speicherbedarf. Ollama lädt die Modelle in der Regel mit 4 Bit gerundet („quantisiert“) – das halbiert bis viertelt den Speicherbedarf bei kaum schlechteren Antworten.

Stand 11/2026, mit offener Lizenz:

| Modell (Name bei Ollama) | Größe | Lizenz | Speicher beim Rechnen ca. | wofür |
| --- | --- | --- | --- | --- |
| **`ministral-3:3b`** (Mistral AI) | 3 Mrd. | Apache-2.0 | 4 GB | **Empfehlung ohne Grafikkarte** – „Frag deine Ablage“ und „Aus Dokument ausfüllen“; spricht gut Deutsch. Voreingestellt im Beispiel. |
| `granite4.1:3b` (IBM) | 3 Mrd. | Apache-2.0 | 3 GB | Alternative ohne Grafikkarte |
| `ministral-3:8b` (Mistral AI) | 8 Mrd. | Apache-2.0 | 7–8 GB | mit Grafikkarte (8 GB); ohne Grafik nur für Hintergrundarbeit wie „Aus Dokument ausfüllen“ – dann `mem_limit: 9g` |
| `qwen2.5:7b` (Alibaba) | 7 Mrd. | Apache-2.0 | 6–7 GB | mit Grafikkarte; bewährt bei strukturierter Ausgabe |

Die Speicherangaben sind grobe Werte für das Modell mit dem Kontext aus dem Beispiel (8 192 Token); `docker stats` zeigt, was es bei dir wirklich braucht. Das Paket hat **ein** Feld *Modell* – „Frag deine Ablage“ und „Aus Dokument ausfüllen“ nutzen also dasselbe Modell.

**Weniger geeignet:**

- **Modelle, die „nachdenken“** – etwa `qwen3`, `qwen3.5` oder Modelle mit *thinking* im Namen. Ollama lässt sie vor der eigentlichen Antwort lange nachdenken. Der KI-Assistent schaltet das ab 1.1.1 ab (`reasoning_effort: none`); ob ein Modell sich daran hält, ist nicht gemessen. Mit älteren Versionen heißt das auf einem NAS: minutenlang keine sichtbare Antwort, oft bis zur Zeitgrenze.
- `qwen2.5:3b` (in der Beschreibung des Pakets als Beispiel genannt) steht unter der *Qwen Research License* – keine offene Lizenz, nur für nicht-kommerzielle Nutzung. `llama3.2:3b` steht unter der *Llama 3.2 Community License* mit Nutzungsbedingungen. Beide laufen technisch gut; prüfe die Lizenz, wenn du Ablago nicht nur privat nutzt.
- Ganz kleine Modelle (unter 2 Mrd.) sind schnell, erfinden bei *Aus Dokument ausfüllen* aber eher Werte.

**Brauche ich ein Embedding-Modell?** Nein. Die Ähnlichkeitssuche (ähnliche Dokumente, Suche mit eigenen Worten, Ausschnitte nach Ähnlichkeit) macht das Paket **KI lokal – Ähnlichkeit** direkt in Ablago, mit einem eigenen kleinen Modell und ohne Ollama. Der KI-Assistent holt bei Ollama keine Embeddings. Lade also kein Embedding-Modell in Ollama – es belegte nur Platz.

## Kontext, Speicher und Prozessor { #kontext-speicher }

Die Compose-Datei setzt ein paar Werte, die auf einem NAS wichtig sind:

| Einstellung | im Beispiel | warum |
| --- | --- | --- |
| `OLLAMA_CONTEXT_LENGTH` | `8192` | So viel Text liest das Modell auf einmal (etwa 20 000 Zeichen Deutsch). Ohne Grafikkarte nimmt Ollama sonst **4 096** – dann **lässt Ollama ältere Nachrichten still weg**, wenn eine Anfrage zu lang ist: bei langen Chats die Ausschnitte, bei langen Dokumenten den Text. Die Antwort hat dann keine Grundlage. Trag denselben Wert im Paket unter **Kontextlänge** ein (siehe unten). |
| `mem_limit` | `6g` | Speichergrenze für den KI-Container. Braucht das Modell mehr, beendet Docker den Container (er startet neu); dann ein kleineres Modell nehmen oder die Grenze erhöhen. |
| `cpu_shares` | `256` | Rechnen Ablago und KI gleichzeitig, bekommt Ablago Vorrang – die Ablage bleibt bedienbar. |
| `OLLAMA_KEEP_ALIVE` | `30m` | Das Modell bleibt 30 Minuten nach der letzten Frage im Speicher; danach ist der Speicher frei, und die nächste Frage lädt es neu (einige Sekunden). |
| `OLLAMA_NUM_PARALLEL`, `OLLAMA_MAX_LOADED_MODELS` | `1` | eine Anfrage, ein Modell zur Zeit – berechenbarer Speicher |

**Kontextlänge im Paket:** Der KI-Assistent (ab 1.2.0) hat die Einstellung **Kontextlänge** (Standard 8 192 Token, passend zum Beispiel). Ist eine Anfrage länger, kürzt **das Paket** selbst, bevor Ollama still abschneidet – und sagt es: bei *Frag deine Ablage* „An die KI geschickt: 6 von 9 Ausschnitten (gekürzt)“ (bei langen Chats fallen zuerst ältere Fragen und Antworten weg), bei *Aus Dokument ausfüllen* „Dokumenttext gekürzt“. Stell die Kontextlänge **nie größer** ein als `OLLAMA_CONTEXT_LENGTH` – sonst schneidet Ollama wieder still ab. Größer heißt: mehr Text auf einmal, aber mehr Speicher und langsameres Lesen. Die Anzeige braucht Ablago ab 0.138.0.

Für *Aus Dokument ausfüllen* mit **langen Dokumenten** reicht 8 192 nicht ganz (Ablago gibt bis zu 50 000 Zeichen mit). Mit `16384` braucht der Container etwa 0,5–1 GB mehr; ohne Grafikkarte überschreiten so lange Texte aber ohnehin die Zeitgrenze, und die eingebaute Erkennung übernimmt.

## Wie schnell ist das? { #geschwindigkeit }

!!! warning "Schätzung – nicht gemessen"
    Die Werte in diesem Abschnitt sind eine **ehrliche Schätzung** aus Erfahrungswerten für ähnliche Prozessoren, kein Messwert. Gemessene Werte kommen in die Tabelle [Messwerte](#messwerte).

Geschätzt für ein **UGREEN DXP4800 Plus** (Intel Pentium Gold 8505, 5 Kerne, 16 GB) **nur mit dem Prozessor** und einem Modell mit 3 Mrd. Parametern:

| | Schätzung |
| --- | --- |
| Modell laden (nach einer Pause, von SSD) | 5–20 s |
| Lesen (Ausschnitte, Dokumenttext) | 30–60 Token/s |
| Schreiben (die Antwort) | 5–9 Token/s, also etwa 3–6 Wörter je Sekunde |
| Frag deine Ablage mit Standard-Höchstmenge (8 Ausschnitte, 6 000 Zeichen) | erstes Wort nach 40–90 s, ganze Antwort nach 1–2 Minuten |
| Frag deine Ablage mit 4 Ausschnitten, 3 000 Zeichen ([Empfehlung](#nas-einstellungen)) | erstes Wort nach 20–45 s, ganze Antwort nach 40–90 s |
| Aus Dokument ausfüllen, eine Seite (ca. 2 500 Zeichen) | 30–60 s – knapp an der Zeitgrenze |
| Aus Dokument ausfüllen, mehrere Seiten | über der Zeitgrenze → die eingebaute Erkennung übernimmt |

**Antworten dauern auf so einem Gerät also eher eine halbe bis zwei Minuten als ein paar Sekunden.** Für einen Aufruf hat das Paket höchstens 2 Minuten; eine Antwort, die länger braucht, bricht ab. Mit einer Grafikkarte (NVIDIA, AMD) sind dieselben Antworten meist in wenigen Sekunden da.

## Messwerte { #messwerte }

Gemessene Werte tragen wir hier ein – jede Zeile mit Datum und Versionen, denn neue Versionen von Ollama und neue Modelle können schneller oder langsamer sein.

| Gerät | CPU / Grafik | RAM | Variante | Modell | Lesen Token/s | Schreiben Token/s | Frag: erstes Wort / ganz | Ausfüllen (1 Seite) | Speicher | Ollama / Ablago | Stand |
| --- | --- | --- | --- | --- | ---: | ---: | --- | --- | --- | --- | --- |
| UGREEN DXP4800 Plus | Pentium Gold 8505 / – | 16 GB | nur Prozessor | ministral-3:3b | – | – | – | – | – | 0.40.13 / 0.136.0 | Messung folgt |
| UGREEN DXP4800 Plus | Pentium Gold 8505 / Intel UHD | 16 GB | Intel-Grafik (Versuch) | ministral-3:3b | – | – | – | – | – | 0.40.13 / 0.136.0 | Messung folgt |

### Selbst messen

1. **Lesen und Schreiben:** im KI-Container eine Frage mit Zeitangaben stellen –

    ```sh
    docker compose exec ollama ollama run ministral-3:3b --verbose "Fasse in drei Sätzen zusammen, wozu eine Hausratversicherung dient."
    ```

    Am Ende stehen u. a. `prompt eval rate` (**Lesen**, Token/s) und `eval rate` (**Schreiben**, Token/s). Für das Lesen ist eine längere Frage aussagekräftiger – kopiere z. B. eine Seite Text hinein.
2. **Frag deine Ablage:** in Ablago eine typische Frage stellen und mit der Stoppuhr messen, bis das erste Wort erscheint und bis die Antwort fertig ist. Zweimal fragen – die erste Frage lädt das Modell.
3. **Aus Dokument ausfüllen:** eine einseitige Rechnung oder einen Brief nehmen, Zeit bis zu den Vorschlägen messen; dazu notieren, ob Vorschläge kamen oder die eingebaute Erkennung übernommen hat.
4. **Speicher:** während einer Antwort `docker stats --no-stream` – Spalte *MEM USAGE* des Containers `ollama`.

Diesen Block kannst du ausfüllen und freiwillig als [neues Issue](https://github.com/motom001/dms/issues/new/choose) mit dem Titel „Messergebnis KI lokal: *Gerät*“ melden. Er enthält keine Namen, Adressen oder Inhalte – trage auch keine ein. Der Beitrag ist öffentlich; Ablago selbst meldet nichts.

```text
Messergebnis KI lokal
Ablago-Version:              
Paket KI-Assistent:          1.1.1
Ollama:                      0.40.13
Variante:                    nur Prozessor | Intel-Grafik (Versuch) | NVIDIA | AMD
Gerät:                       
CPU / Kerne / Grafik:        
Arbeitsspeicher / Grenze:    16 GB / 6 GB
Modell:                      ministral-3:3b
Kontext:                     8192
Lesen (prompt eval rate):    … Token/s
Schreiben (eval rate):       … Token/s
Frag deine Ablage:           erstes Wort … s, fertig … s (Höchstmenge … Ausschnitte / … Zeichen)
Aus Dokument ausfüllen:      … s, Ergebnis: Vorschläge | eingebaute Erkennung übernommen
Speicher KI-Container:       … GB (Spitze)
```

## Mit Grafik { #grafik }

Für Grafik nimmst du zur Compose-Datei eine der Ergänzungen aus dem Beispiel dazu. In der Oberfläche eines NAS, die nur eine Datei kennt, übernimmst du die paar Zeilen der Ergänzung von Hand in den Dienst `ollama`.

### Intel-Grafik im Prozessor (Versuch) { #intel }

Viele NAS und Mini-PCs haben eine **Intel-Grafik im Prozessor** (UHD, Iris Xe), aber keinen Steckplatz für eine Grafikkarte. Ollama unterstützt offiziell NVIDIA und AMD; Intel-Grafik geht nur über **Vulkan**. Im offiziellen Image (Version aus dem Beispiel) ist Vulkan enthalten und eingeschaltet, sobald der Container die Grafik sieht – allerdings nur der Vulkan-Lader, **kein Treiber für Intel-Grafik**. Die Ergänzung [`intel-grafik.yml`](https://github.com/motom001/dms/blob/main/deploy/beispiele/ki-ollama/intel-grafik.yml) baut deshalb beim ersten Start auf deinem Gerät ein kleines Image: das offizielle Ollama in derselben Version plus den Mesa-Treiber aus Ubuntu. Es enthält kein Modell und wird vom Projekt nicht gepflegt.

```sh
docker compose -f docker-compose.yml -f intel-grafik.yml up -d --build
```

Ob Ollama die Grafik nutzt, steht im Log (`docker compose logs ollama`) in der Zeile `inference compute` mit `library=Vulkan`. Steht dort nur `library=cpu`, rechnet weiter der Prozessor.

**Was zu erwarten ist:** Eine kleine Grafik im Prozessor teilt sich den Arbeitsspeicher mit dem Prozessor; beim Schreiben der Antwort bringt sie deshalb wenig. Beim **Lesen** – dem langsamsten Teil auf einem NAS – könnte sie helfen und entlastet den Prozessor. Ob das stimmt und ob es stabil läuft, ist **nicht gemessen**. Wir empfehlen die Variante erst, wenn Messungen es zeigen; bis dahin ist **„nur Prozessor“** die sichere Wahl. Läuft etwas schief, startest du ohne `intel-grafik.yml` neu.

### NVIDIA { #nvidia }

Mit [`nvidia.yml`](https://github.com/motom001/dms/blob/main/deploy/beispiele/ki-ollama/nvidia.yml). Auf dem Gerät nötig: der NVIDIA-Treiber und das *NVIDIA Container Toolkit* (bei Unraid das Plugin „Nvidia Driver“, bei TrueNAS in den Apps eingebaut). Mit 8 GB Grafikspeicher laufen Modelle bis 8 Mrd. Parameter flüssig.

### AMD { #amd }

Mit [`amd.yml`](https://github.com/motom001/dms/blob/main/deploy/beispiele/ki-ollama/amd.yml) – nimmt das Image `ollama/ollama:<Version>-rocm` und gibt `/dev/kfd` und `/dev/dri` in den Container. Nötig ist der amdgpu-Treiber mit ROCm 7; welche Karten gehen, steht in der Ollama-Dokumentation unter „GPU“. Für Karten, die ROCm nicht kennt, probiere die Vulkan-Variante (`intel-grafik.yml`).

## Hinweise je NAS { #nas }

- **UGREEN (UGOS Pro):** *Docker → Projekt → Erstellen*, Compose-Datei einfügen. Das Netz `dms-ki` legt das Projekt selbst an; im Ablago-Projekt ergänzt du die Zeilen aus [Schritt 2](#einrichtung) und baust es neu. Die Intel-Variante (`/dev/dri`, eigenes kleines Image) geht am einfachsten per SSH auf der Kommandozeile.
- **Synology (Container Manager):** *Container Manager → Projekt → Erstellen*, Compose-Datei einfügen. Rechne mit „nur Prozessor“; die meisten Modelle haben keine nutzbare Grafik.
- **QNAP (Container Station):** *Container Station → Anwendungen → Erstellen*, Compose-Datei einfügen; „nur Prozessor“, bei Modellen mit Grafikkarte die NVIDIA-Variante.
- **Unraid:** mit dem Plugin *Docker Compose Manager* wie beim [Ablago](https://help.ablago.app/installieren/aktuell/unraid/); für NVIDIA vorher das Plugin „Nvidia Driver“ installieren.
- **TrueNAS:** *Apps → Custom App* mit der Compose-Datei, wie bei der [Vorlage für Ablago](https://help.ablago.app/installieren/aktuell/truenas/).
- **Umbrel, CasaOS, ZimaOS:** Ollama gibt es dort im App-Store; Adresse und Einrichtung stehen in der Beschreibung des Pakets KI-Assistent.

Ollama läuft auf **amd64 und arm64** (z. B. Raspberry Pi 5) – dort aber nur mit dem Prozessor und entsprechend langsam.

## Hilft mein Coral-Stick oder meine NPU? { #coral-npu }

**Nein, nicht für Sprachmodelle.** Bildbeschleuniger wie der **Google Coral** (Edge TPU) rechnen nur sehr kleine TensorFlow-Lite-Modelle mit wenigen MB Speicher – ein Sprachmodell mit Milliarden Parametern passt dort nicht hinein, und Ollama kann sie nicht nutzen. Auch Texterkennung und Ähnlichkeitssuche in Ablago profitieren nicht davon. Gut sind solche Sticks für Kamera-Software, etwa für die Objekterkennung im Videobild.

Dasselbe gilt für die **NPU** in neueren Prozessoren: Ollama nutzt sie nicht.

## Wenn das NAS zu langsam ist { #zu-langsam }

Geräte und Preise sind Beispiele mit Stand 11/2026 – sie veralten schnell.

1. **Erst messen:** ein kleines Modell nur mit dem Prozessor (siehe [Selbst messen](#messwerte)). Für Hintergrundarbeit wie *Aus Dokument ausfüllen* reicht das oft, besonders mit den [Einstellungen für ein NAS](#nas-einstellungen).
2. **Ein vorhandener PC mit Grafikkarte** (NVIDIA oder AMD): Ollama dort, Ablago zeigt per Dienst-Adresse darauf ([Ollama auf einem anderen Rechner](#anderer-rechner)). Meist die schnellste Lösung ohne Kosten; Nachteil: Der PC muss laufen, wenn die KI arbeiten soll.
3. **Ein kleines eigenes KI-Gerät**, z. B. NVIDIA Jetson Orin Nano Super (rund 400 $, etwa 25 W). Ollama läuft darauf, flüssig bei Modellen mit 2–8 Mrd. Parametern; 8 GB Speicher sind dabei knapp.
4. **Ein Mini-PC mit viel gemeinsamem Speicher** (Apple-Chip, AMD Ryzen AI Max) – komfortabel, für einen Haushalt meist mehr als nötig.

Was **nicht** hilft:

- **USB-Beschleuniger** helfen bei Sprachmodellen nicht – neben dem Coral auch Sticks mit Hailo-10H (z. B. ASUS UGen300): Sie können nur wenige, eigens übersetzte Kleinmodelle mit kurzem Kontext (etwa 2 000 Token) und schreiben Text nicht schneller als ein Prozessor. Gedacht sind sie für Bilderkennung.
- Eine **externe Grafikkarte** geht nur, wenn das Gerät Thunderbolt oder USB4 hat – die meisten NAS haben das nicht.

Ganz ohne Zusatzgerät läuft die **Ähnlichkeitssuche** mit dem Paket **KI lokal – Ähnlichkeit** direkt in Ablago und schnell genug auch auf einem NAS: ähnliche Dokumente und Suche mit eigenen Worten, nur ohne Antworten in ganzen Sätzen.

## Fehlersuche { #fehlersuche }

| Meldung oder Zeichen | Ursache und Abhilfe |
| --- | --- |
| *Verbindung testen*: Dienst nicht erreichbar | Läuft das KI-Projekt (`docker compose ps`)? Hängt Ablago im Netz `dms-ki` (`docker network inspect dms-ki` – dort müssen `ollama` und Ablago stehen)? Steht in der Dienst-Adresse genau `http://ollama:11434/v1`? |
| *Verbindung testen*: Modell nicht da | Lief `modell-laden` durch (`docker compose logs modell-laden`)? Stimmt der Name im Paket genau mit `x-modell` überein? Nachholen mit `docker compose up -d modell-laden`. |
| Ablago startet nicht: „network dms-ki … could not be found“ | Das KI-Projekt zuerst starten – oder die Zeilen für `dms-ki` wieder aus der Compose-Datei von Ablago nehmen. |
| Container `ollama` startet immer wieder neu | Meist die Speichergrenze: `docker inspect <Container> --format '{{.State.OOMKilled}}'` zeigt `true`. Kleineres Modell oder `mem_limit` erhöhen. |
| Antwort passt nicht zu den Ausschnitten oder ist „aus der Luft gegriffen“ | Zu wenig Kontext – `OLLAMA_CONTEXT_LENGTH` prüfen und die **Kontextlänge** im Paket nicht größer einstellen (siehe [Kontext](#kontext-speicher)); bei langen Chats **Neuer Chat**. |
| „(gekürzt)“ bei *Frag deine Ablage* oder „Dokumenttext gekürzt“ | Die Anfrage war länger als die **Kontextlänge** des Pakets. Weniger Zeichen je Frage einstellen oder – mit genug Speicher – `OLLAMA_CONTEXT_LENGTH` und die Kontextlänge im Paket gemeinsam erhöhen. |
| *Aus Dokument ausfüllen*: „hat nichts Brauchbares geliefert“ | Der Dienst hat geantwortet, aber keinen Wert, der zu den Feldern passt – die eingebaute Erkennung hat übernommen. Bei kleinen Modellen kommt das vor; ein größeres Modell oder klarere Feldbezeichnungen helfen. |
| Antwort bricht ab oder *Aus Dokument ausfüllen* nimmt immer die eingebaute Erkennung | Zeitgrenze erreicht – siehe [Einstellungen für ein NAS](#nas-einstellungen), kleineres Modell oder Grafik. |
| Die Ablage wird träge, während die KI rechnet | Das Modell beansprucht den Prozessor. `cpu_shares` aus dem Beispiel übernehmen; notfalls weniger Ausschnitte je Frage. |

Die letzten Aufrufe des Pakets mit Dauer stehen unter **Werkbank → Pakete → KI-Assistent** im Abschnitt [Paket-Läufer](pakete.md#pakete-mit-code) – ohne Inhalte.

## Entfernen

1. In Ablago das Paket KI-Assistent deinstallieren (oder die Dienst-Adresse leeren).
2. Die Zeilen für `dms-ki` aus der Compose-Datei von Ablago nehmen und Ablago neu starten.
3. Das KI-Projekt stoppen und löschen (`docker compose down`), dann den Ordner mit den Modellen (`ollama`) löschen.
