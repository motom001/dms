# Pakete mit Code

Ein Paket kann neben Mappentypen und Ansichten **Code** mitbringen: ein WebAssembly-Modul, das auf Ereignisse im DMS reagiert (neue Post, hochgeladenes Dokument, fertige Texterkennung, geänderte Einstellungen) und Aktionen aus der Werkbank ausführt. Das DMS führt es im **Paket-Läufer** aus – abgeschottet und nur mit den Rechten, die der Administrator bei der Installation bestätigt hat.

Diese Seite beschreibt die Schnittstelle („DMS-Paket-ABI 1“). Wie ein Paket aufgebaut ist und wie es in den Katalog kommt, steht unter [Pakete entwickeln](pakete.md).

## So läuft Code im DMS

- **WebAssembly, kein Node, kein Python:** Das Paket liefert ein gebautes Modul `code/modul.wasm` (WASI Preview 1, 32 Bit). Den Quelltext legst du daneben unter `code/` – das DMS liest ihn nicht, er gehört aber in den Pull Request (Lizenz, Prüfung).
- **Eigener Prozess:** Der Paket-Läufer ist ein Kindprozess des DMS. Jeder Aufruf läuft in einem frischen Worker mit Grenzen für Speicher, Zeit und gleichzeitige Aufrufe. Im Betrieb startet der Läufer unter dem Berechtigungsmodell von Node: kein Schreiben ins Dateisystem, keine Programme starten, keine Schlüssel und Daten des DMS lesen.
- **Kein Dateisystem, kein freies Netz:** Das Modul sieht nur eine kleine WASI-Schicht (Zeit, Zufall, Ausgabe ins Protokoll). Dateien des eigenen Pakets liest es mit `dms.datei`, das Netz erreicht es nur mit `dms.netz` und nur unter den Adressen aus dem Manifest.
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

- **Mappentypen** in `rechte` schreibst du wie in Verweisen: eigene mit ihrer Kennung (`rechnung`), fremde als `paket:kennung`, Typen des DMS als `dms:ablageort` oder `dms:rolle`. `"*"` heißt alle Mappentypen außer Benutzern; `dms:benutzer` ist nicht erlaubt.
- **Dokumente:** `lesen` erlaubt Dokumente zu lesen (Datei, Volltext, Seiten als Bild), `schreiben` zusätzlich hochzuladen, zu ersetzen und den Volltext zu setzen. Dokumente gibt es nur in Mappen, die das Paket lesen darf.
- **Netz:** nur `https://`, ohne Zugangsdaten. Weiterleitungen folgt der Läufer nicht.
- Bei der **Installation** zeigt das DMS diese Rechte und lässt sie bestätigen. Ändern sich Rechte oder Netz in einem Update, muss der Administrator neu bestätigen.

## Ereignisse

| Ereignis | `daten` |
|---|---|
| `post.angelegt` | `mappe`, `kanal` |
| `dokument.hochgeladen` | `dokument`, `mappe`, `name`, `mime`, `groesse`, `volltextGeplant` (ob die Texterkennung des DMS noch läuft) |
| `texterkennung.fertig` | `dokument`, `mappe`, `seiten` |
| `paket.einstellungen_geaendert` | `felder` (geänderte Kennungen) |

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

## Ausprobieren

1. Paket als ZIP im **Expertenmodus** hochladen (siehe [Eigenes Paket testen](pakete.md#eigenes-paket-testen)) und die Rechte bestätigen.
2. **Werkbank → Pakete → *Paket***: Der Abschnitt **Paket-Läufer** zeigt, ob der Läufer läuft, die letzten Aufrufe mit Dauer und Speicher, offene und aufgegebene Ereignisse und das Protokoll des Pakets.
3. Ereignis auslösen (z. B. eine Datei hochladen) oder eine Aktion klicken.

## Nützliche Endpunkte der API v1

- `GET /dokumente/{id}/seiten/{nr}/scan?dpi=300` – eine Seite als Graustufenbild (PGM), z. B. für eigene Texterkennung (72–400 dpi).
- `PUT /dokumente/{id}/volltext` mit `{ "text": "…" }` – Volltext setzen (Recht `dokumente: schreiben`). Die Historie vermerkt, wer den Text gesetzt hat; setzt ein Paket den Text, überschreibt die Texterkennung des DMS ihn nicht mehr.
- `POST /dokumente/{id}/seiten`, `POST /dokumente/zusammenfuegen`, `PUT /dokumente/{id}/archivnummer` – Seiten teilen und zusammenfügen, Archivnummer setzen.
