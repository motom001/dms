# Pakete mit Code

Ein Paket kann neben Mappentypen und Ansichten **Code** mitbringen: ein WebAssembly-Modul, das auf Ereignisse im DMS reagiert (neue Post, hochgeladenes Dokument, fertige Texterkennung, fertiger Volltext, geänderte Einstellungen) und Aktionen aus der Werkbank ausführt. Das DMS führt es im **Paket-Läufer** aus – abgeschottet und nur mit den Rechten, die der Administrator bei der Installation bestätigt hat.

Diese Seite beschreibt die Schnittstelle („DMS-Paket-ABI 1“). Wie ein Paket aufgebaut ist und wie es in den Katalog kommt, steht unter [Pakete entwickeln](pakete.md).

## So läuft Code im DMS

- **WebAssembly, kein Node, kein Python:** Das Paket liefert ein gebautes Modul `code/modul.wasm` (WASI Preview 1, 32 Bit). Den Quelltext legst du daneben unter `code/` – das DMS liest ihn nicht, er gehört aber in den Pull Request (Lizenz, Prüfung).
- **Die tragende Grenze ist WebAssembly:** Das Modul kann nur seinen eigenen Speicher lesen und schreiben und nur die Funktionen aufrufen, die der Läufer ihm übergibt: eine kleine WASI-Schicht (Zeit, Zufall, Ausgabe ins Protokoll) und die Funktionen unter `dms`. Dateisystem, Netz und Programme gibt es in dieser Schicht nicht – Datei- und Netzaufrufe aus WASI enden mit einem Fehler. Dateien des eigenen Pakets liest es mit `dms.datei` (aus dem Speicher des Läufers, nicht von der Festplatte), das Netz erreicht es nur mit `dms.netz` und nur unter den Adressen aus dem Manifest. Jede Funktion prüft Zeiger und Längen gegen den Speicher des Moduls.
- **Eigener Prozess als zweite Schicht:** Der Paket-Läufer ist ein Kindprozess des DMS ohne dessen Umgebungsvariablen (keine Datenbank-Adresse, keine Schlüssel). Jeder Aufruf läuft in einem frischen Worker mit Grenzen für Speicher, Zeit und gleichzeitige Aufrufe. Im Betrieb startet der Läufer zusätzlich unter dem Berechtigungsmodell von Node (nur den eigenen Programmordner lesen, nichts schreiben, keine Programme starten). Das Berechtigungsmodell ist laut Node ein Sicherheitsgurt und **kein Schutz gegen bösartigen Code** – es greift erst, wenn jemand aus der WebAssembly-Umgebung ausbricht, und soll den Schaden dann begrenzen.
- **Dienstkonto:** Zu jedem Paket mit Code legt das DMS ein **Dienstkonto** an („Paket *Name*“). Es meldet sich nie an, erscheint nicht in der Benutzerverwaltung und hat einen API-Schlüssel, der das DMS nie verlässt. Alle Anfragen des Pakets an die API laufen mit diesem Konto – mit den Rechten aus dem Manifest, nicht mit Rollen oder Ansichten. Löschen darf ein Dienstkonto nie, Passwörter und Benutzer sieht es nie, E-Mails versenden kann es nicht. In der Historie steht es mit seinem Namen.

## Im Manifest

```yaml
dms: ">=0.88.0"
code:
  sprache: c                 # rust, go, c, assemblyscript oder javascript (nur zur Information)
  quelle: code/
  ereignisse: [post.angelegt, texterkennung.fertig]
  rechte:
    lesen: [rechnung, "basis:organisation"]   # Mappen lesen
    schreiben: [rechnung]                      # Mappen anlegen und ändern (schließt Lesen ein)
    dokumente: lesen                           # keine (Standard), lesen oder schreiben
  netz:
    - https://api.example.org/v1/              # nur diese Adressen (und Pfade darunter)
  einstellungen: [...]                         # siehe „Einstellungen beschreiben“
  aktionen: [...]
```

- **Mappentypen** in `rechte` schreibst du wie in Verweisen: eigene mit ihrer Kennung (`rechnung`), fremde als `paket:kennung`, Typen des DMS als `dms:ablageort`, `dms:rolle` oder `dms:post`. `"*"` heißt alle Mappentypen außer Benutzern; `dms:benutzer` ist nicht erlaubt, andere `dms:`-Kennungen gibt es nicht.
- **Nur Post** (seit 0.94.0): Braucht dein Paket nur die Post – etwa um eingehende Scans zu teilen –, gib `dms:post` statt `"*"` an. Mit `lesen`/`schreiben: ["dms:post"]` und `dokumente: schreiben` darf es Post lesen, **Post teilen** (`POST /dokumente/{id}/seiten` legt je Teil eine neue Post an), die **Archivnummer** und den **Volltext** ihrer Dokumente setzen – andere Mappen sieht es nicht. Die Vorschau bei der Installation zeigt dann „Post“. Anders als in Verweisen (`ziel`, `typen`) ist `dms:post` nur in `rechte` erlaubt. Ein Paket damit gibt `dms: ">=0.94.0"` an; ältere DMS-Versionen kennen die Kennung nicht und geben dem Paket dann gar keine Post.

  ```yaml
  rechte:
    lesen: ["dms:post"]
    schreiben: ["dms:post"]   # neue Post beim Teilen, Archivnummer
    dokumente: schreiben      # Seiten lesen, PDF teilen, Volltext setzen
  ```

- **Dokumente:** `lesen` erlaubt Dokumente zu lesen (Datei, Volltext, Seiten als Bild), `schreiben` zusätzlich hochzuladen, zu ersetzen und den Volltext zu setzen. Dokumente gibt es nur in Mappen, die das Paket lesen darf.
- **Schnittstellen des Kerns (`schnittstellen`):** zusätzliche Rechte für Schnittstellen, bei denen der Kern nur speichert und vergleicht. Bisher gibt es `dms:vektoren` (seit 0.120.0) – siehe [Vektoren und Ähnlichkeit](#vektoren-und-ahnlichkeit). Es braucht `dokumente: lesen`.
- **Netzwerk/Internet (`netz`):** nur `https://`, ohne Zugangsdaten. Weiterleitungen folgt der Läufer nicht. Die Vorschau zeigt „kein Zugriff auf Netzwerk und Internet“ bzw. „Zugriff auf Netzwerk/Internet nur zu: …“ (#449).
- Bei der **Installation** zeigt das DMS diese Rechte und lässt sie bestätigen; die Ereignisse stehen dort als Unterliste mit Link ins Administratorhandbuch. Ändern sich Rechte oder Adressen in einem Update, muss der Administrator neu bestätigen.

## Ereignisse

| Ereignis | Auslöser | `daten` |
|---|---|---|
| `post.angelegt` | Neue Post: in der Oberfläche, über die API, aus Eingangsordner und Postfach, beim **Post teilen** je neuer Post | `mappe`, `kanal` |
| `dokument.hochgeladen` | Jedes neue Dokument: Hochladen (Oberfläche, API, Eingangskanäle) und die neuen Dokumente beim **PDF teilen**, **Zusammenfügen** und **Post teilen**. Eine neue Version eines vorhandenen Dokuments ist kein neues Dokument. | `dokument`, `mappe`, `name`, `mime`, `groesse`, `volltextGeplant` (ob die Texterkennung des DMS noch läuft) |
| `texterkennung.fertig` | Die Texterkennung des DMS ist mit einem Dokument fertig | `dokument`, `mappe`, `seiten` |
| `volltext.fertig` | Der Volltext eines Dokuments steht fest – egal woher: eingebaute Texterkennung, Textebene des PDFs, ein Paket, die API (seit 0.120.0). Für Pakete mit `dms:vektoren` schickt das DMS es auch für den Bestand nach (`nachberechnung: true`). | `dokument`, `mappe`, ggf. `nachberechnung` |
| `paket.einstellungen_geaendert` | Ein Administrator hat die Einstellungen des Pakets gespeichert | `felder` (geänderte Kennungen) |

Das Ereignis entsteht in **derselben Datenbank-Transaktion** wie die Änderung: Entweder ist beides gespeichert oder nichts. Fällt das DMS genau dazwischen aus, fehlt also kein Ereignis.

Ereignisse stehen im DMS in einem **Ausgangskorb**: Je Paket stellt der Läufer sie der Reihe nach zu; ein langsames Paket hält die anderen nicht auf. Schlägt ein Aufruf fehl (Fehlercode, Absturz, Zeitgrenze), versucht er es nach 1, 5, 30, 120 und 360 Minuten erneut und gibt dann auf – so lange warten die späteren Ereignisse desselben Pakets. Was ein Paket selbst ändert (z. B. eine Post, die es anlegt), meldet das DMS ihm nicht zurück; andere Pakete bekommen es. Code muss deshalb **wiederholbar** sein: dasselbe Ereignis kann zweimal kommen (`id` bleibt gleich, `versuch` zählt hoch). Während einer Wartung stellt der Läufer nichts zu.

## Schnittstelle (ABI 1)

### Exporte des Moduls

| Export | Aufgabe |
|---|---|
| `memory` | **nicht** exportieren, sondern importieren: `env.memory` (Link-Option `--import-memory`). So setzt der Läufer die Obergrenze. |
| `dms_puffer(laenge) -> zeiger` | Platz für die Eingabe reservieren (z. B. `malloc`). |
| `dms_ereignis(zeiger, laenge) -> i32` | Ein Ereignis verarbeiten. `0` = erledigt, sonst Fehler (wird wiederholt). |
| `dms_aktion(zeiger, laenge) -> i32` | Optional: eine Aktion aus der Werkbank ausführen. |
| `_initialize` | Optional (Reactor-Modell); wird vor dem Aufruf gerufen. |

Die **Eingabe** ist JSON (UTF-8, ohne abschließende Null):

```json
{ "art": "post.angelegt", "id": "…", "erstellt": "2026-11-01T10:00:00Z", "versuch": 1,
  "daten": { "mappe": "…", "kanal": "email" },
  "paket": { "id": "mein_paket", "version": "1.0.0" },
  "einstellungen": { … } }
```

Bei einer Aktion: `{ "aktion": "<schluessel>", "paket": …, "einstellungen": … }`. Einstellungen kommen wie unter [Einstellungen beschreiben](pakete.md#einstellungen-beschreiben) beschrieben, Geheimnisse im Klartext.

### Importe aus `dms`

Alle Funktionen sind synchron; Zeiger und Längen beziehen sich auf den importierten Speicher, Texte sind UTF-8.

| Funktion | Rückgabe |
|---|---|
| `api(json, len)` | HTTP-Status. `json`: `{"methode":"GET","pfad":"/mappen/…","body":{…}}` – Pfade der [API v1](https://motom001.github.io/dms/admin/aktuell/api/) ohne `/api/v1`. Antwort mit `antwort_*` abholen. |
| `api_binaer(json, len, body, blen)` | Wie `api`, mit Rohdaten als Body; den Inhaltstyp nennt `"typ"` im JSON (Standard `application/octet-stream`). |
| `netz(json, len, body, blen)` | HTTP-Status oder negativ bei Fehler. `json`: `{"methode":"POST","url":"https://…","kopf":{…}}`. Nur Adressen aus `code.netz`; 30 s, höchstens 10 MB Antwort. |
| `datei(name, len)` | Größe oder `-1`: eine Datei des Pakets aus `code/daten/<name>` (z. B. Trainingsdaten). Inhalt mit `antwort_lesen`. |
| `antwort_laenge()` | Länge der letzten Antwort. |
| `antwort_lesen(ziel, max)` | Kopiert die letzte Antwort, gibt die Anzahl Bytes zurück. |
| `speicher_lesen(schluessel, len)` | Länge oder `-1`: ein Wert aus dem **Speicher des Pakets** (Text je Schlüssel, zusammen höchstens 64 KB; bleibt zwischen Aufrufen und Updates). |
| `speicher_schreiben(schluessel, len, wert, wlen)` | `0` oder `-1`. |
| `ergebnis(text, len)` | Kurzer Text für die Übersicht (bei Aktionen: die Antwort, die der Administrator sieht). |
| `log(stufe, text, len)` | Zeile ins Protokoll des Pakets (`0` Debug, `1` Info, `2` Warnung, `3` Fehler). `stdout`/`stderr` landen ebenfalls dort. |

### Grenzen

| | Standard |
|---|---|
| Speicher je Aufruf | 256 MB |
| Zeit je Aufruf | 120 s (danach Abbruch, gilt als Fehler) |
| gleichzeitige Aufrufe | 2 (alle Pakete zusammen) |
| Speicher des Pakets | 64 KB |
| Dateien unter `code/` (`modul.wasm`, `daten/`, Quellcode) | 32 MB je Paket zusammen; größere Pakete lehnen das DMS und `pruefen.py` ab |

Ein Paket, das die Grenzen reißt, beeinträchtigt das DMS nicht; der Aufruf bricht ab und steht in der Übersicht des Läufers.

## Bauen mit C (wasi-sdk)

```c
#include <stdint.h>
#include <stdlib.h>
#include <string.h>

#define DMS(name) __attribute__((import_module("dms"), import_name(#name)))
DMS(api) int32_t dms_api(const char *json, int32_t len);
DMS(log) int32_t dms_log(int32_t stufe, const char *text, int32_t len);
DMS(ergebnis) int32_t dms_ergebnis(const char *text, int32_t len);

static char *eingang;

__attribute__((export_name("dms_puffer"))) char *dms_puffer(int32_t n) {
  free(eingang);
  eingang = malloc((size_t)n + 1);
  if (eingang) eingang[n] = 0;
  return eingang;
}

__attribute__((export_name("dms_ereignis"))) int32_t dms_ereignis(char *json, int32_t len) {
  (void)len;
  if (!strstr(json, "\"art\":\"post.angelegt\"")) return 0;
  const char *t = "Neue Post gesehen";
  dms_log(1, t, (int32_t)strlen(t));
  dms_ergebnis("erledigt", 8);
  return 0;
}
```

```sh
$WASI_SDK/bin/clang --target=wasm32-wasip1 -O2 -mexec-model=reactor \
  -Wl,--import-memory -Wl,--strip-all -o code/modul.wasm code/hallo.c
```

- `-mexec-model=reactor`: kein `main`, das DMS ruft die Exporte.
- `-Wl,--import-memory`: Pflicht (siehe oben).
- Für Rust: Ziel `wasm32-wasip1`, `crate-type = ["cdylib"]`, Link-Argument `--import-memory`. Andere Sprachen gehen genauso, solange das Ergebnis nur `wasi_snapshot_preview1` und `dms` importiert.
- Ein vollständiges Beispiel mit Speicher und API-Aufruf ist das Paket **Hallo Post** in der Registry; ein großes die **Texterkennung** (Tesseract als WebAssembly).

Das DMS prüft beim Installieren, dass das Modul nur erlaubte Importe hat, Speicher importiert und `dms_puffer` und `dms_ereignis` exportiert. Fehlt `code/modul.wasm`, installiert das DMS das Paket trotzdem (Einstellungen lassen sich pflegen), im Läufer läuft dann aber nichts.

## Vektoren und Ähnlichkeit { #vektoren-und-ahnlichkeit }

Seit 0.120.0 (#442) kann ein Paket zu jedem Dokument einen **Vektor** ablegen; das DMS vergleicht sie (Kosinus) und zeigt damit ähnliche Dokumente an der Mappe und in der Suche. **Der Kern rechnet keine Vektoren** – das macht das Paket, etwa mit einem Embedding-Modell im Paket-Läufer (Beispiel: „KI lokal – Ähnlichkeit“ in der Registry).

```yaml
dms: ">=0.120.0"
code:
  ereignisse: [volltext.fertig]
  rechte:
    lesen: ["*"]
    dokumente: lesen
    schnittstellen: ["dms:vektoren"]
  netz: []
```

**Ablauf:**

1. Ereignis `volltext.fertig` → Volltext holen (`GET /dokumente/{id}/volltext`), Vektor rechnen, ablegen: `PUT /dokumente/{id}/vektor` mit `{ "modell": "mein-modell/256", "vektor": [0.01, …] }`. Das DMS normiert den Vektor; alle Vektoren eines Modells haben dieselbe Länge (8 bis 4096 Zahlen).
2. **Suchbegriff:** Die Suche ruft `dms_aktion` mit `{ "aktion": "dms:vektor", "text": "Rechnung Heizung", … }`. Das Paket antwortet mit `ergebnis` als JSON: `{ "modell": "mein-modell/256", "vektor": [ … ], "schwelle": 0.45 }`. `schwelle` (optional, Kosinus) sagt, ab wann ein Dokument als ähnlich gilt (Standard 0,5). Mit leerem `text` genügt `{ "modell": "…" }` – so erfragt das DMS das aktuelle Modell. Die Suche wartet höchstens **1,5 s** (der Aufruf kommt vor die wartenden); antwortet das Paket nicht, sucht sie ohne Ähnlichkeit.
3. **Bestand:** Hat das Paket keine offenen Ereignisse, schickt das DMS alle 30 s bis zu 50 Ereignisse `volltext.fertig` mit `nachberechnung: true` für Dokumente ohne Vektor des aktuellen Modells.
4. **Modellwechsel:** Meldet das Paket ein anderes `modell` (z. B. nach einem Update), löscht das DMS dessen alte Vektoren und lässt sie wie unter 3. neu berechnen.

**Endpunkte** (API v1, siehe `openapi.json`):

| | |
|---|---|
| `PUT /dokumente/{id}/vektor` | Vektor setzen bzw. ersetzen (`modell`, `vektor`). Nur mit `dms:vektoren`, sonst 403. |
| `DELETE /dokumente/{id}/vektor?modell=…` | Vektor löschen. Mit dem Dokument verschwinden seine Vektoren von selbst. |
| `GET /dokumente/{id}/aehnliche?anzahl=10&schwelle=0.5` | ähnlichste Dokumente zu einem Dokument |
| `POST /vektoren/aehnliche` | ähnlichste Dokumente zu einem Vektor (`vektor`, `anzahl`, `schwelle`, `modell`) |

Treffer gibt es nur aus Mappen, die der Aufrufer lesen darf – für ein Paket also aus `rechte.lesen`, für Benutzer nach ihren Rechten. Vektoren sind abgeleitete Daten: nicht im Vollexport und nicht in der Historie.

## Ausprobieren

1. Paket als ZIP im **Expertenmodus** hochladen (siehe [Eigenes Paket testen](pakete.md#eigenes-paket-testen)) und die Rechte bestätigen.
2. **Werkbank → Pakete → *Paket***: Der Abschnitt **Paket-Läufer** zeigt, ob der Läufer läuft, die letzten Aufrufe mit Dauer und Speicher, offene und aufgegebene Ereignisse und das Protokoll des Pakets.
3. Ereignis auslösen (z. B. eine Datei hochladen) oder eine Aktion klicken.

## Erkennung: Feldbeschreibung und Antwort

Die eingebaute Erkennung (DMS #391) arbeitet gegen eine **Feldbeschreibung des Mappentyps**: `GET /api/v1/typen/{id}/erkennungsschema` liefert sie als JSON Schema 2020-12. Je Feld gibt es ein Objekt mit `wert` (Schema nach Feldart: Datum `JJJJ-MM-TT`, Betrag `{ betrag, waehrung }`, Auswahl nur aus der Liste, Verweis als Mappen-Id), `sicherheit` (`hoch`, `mittel`, `niedrig`) und `fundstelle` (Textstelle). Dazu `title` (Bezeichnung), `description` (Hilfetext und Erkennungshinweis), `x-dms-feldtyp`, `x-dms-erkennung` (Art, z. B. `email`) und `x-dms-markiert`. Passwortfelder und feste Felder stehen nie darin.

```json
{ "email": { "wert": "anna.beispiel@elektro-muster.de", "sicherheit": "hoch", "fundstelle": "anna.beispiel@elektro-muster.de" },
  "plz":   { "wert": "01234", "sicherheit": "mittel", "fundstelle": "Elektro Muster GmbH · Musterweg 12 · 01234 Musterstadt" } }
```

So sieht die Antwort von `POST /api/v1/typen/{id}/vorschlaege` aus (unter `vorschlaege`), und so soll später auch eine Engine aus einem Paket antworten (DMS #511, nach dem Paket-Läufer): Das DMS prüft jede Antwort gegen die Feldtypen und verwirft unbekannte Felder, falsche Typen und Werte außerhalb der Auswahl. Schon heute nutzbar: Ein Paket mit dem Recht, Dokumente zu lesen, kann einen Volltext schreiben – die Erkennung startet danach von selbst (internes Ereignis „Volltext fertig“).

## Nützliche Endpunkte der API v1

- `GET /dokumente/{id}/seiten/{nr}/scan?dpi=300` – eine Seite als Graustufenbild (PGM), z. B. für eigene Texterkennung (72–400 dpi).
- `PUT /dokumente/{id}/volltext` mit `{ "text": "…" }` – Volltext setzen (Recht `dokumente: schreiben`). Die Historie vermerkt, wer den Text gesetzt hat; setzt ein Paket den Text, überschreibt die Texterkennung des DMS ihn nicht mehr.
- `POST /dokumente/{id}/seiten`, `POST /dokumente/zusammenfuegen`, `PUT /dokumente/{id}/archivnummer` – Seiten teilen und zusammenfügen, Archivnummer setzen.
- `GET /dokumente/{id}/schwaerzen` und `POST /dokumente/{id}/schwaerzen` mit `{ "bereiche": [{ "seite": 1, "x": 0.1, "y": 0.2, "b": 0.3, "h": 0.05 }], "begriffe": ["Mustermann"], "muster": ["iban"], "ziel": "kopie" }` – Stellen endgültig schwärzen (#392). Koordinaten relativ zur angezeigten Seite (0 bis 1, Ursprung oben links); `GET` liefert die Wörter mit Lage zum Selbst-Suchen. Ergebnis ist ein neues Dokument „… (geschwärzt)“ (Ereignis `dokument.hochgeladen`) oder mit `"ziel": "version"` eine neue Version.
