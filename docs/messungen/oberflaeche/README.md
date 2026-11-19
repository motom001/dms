# Oberfläche messen – gespeicherte Ergebnisse (#1276)

Ergebnisse von `web/rauchtest/messen/oberflaeche.mjs` zum Vergleichen (Entwicklerhandbuch → Leistung → Oberfläche messen). Je Lauf eine JSON-Datei (für `--vorher`) und der Bericht als Markdown; im Namen Datum und Gerät. Alte Dateien bleiben, eine neue Basis kommt als neue Datei dazu.

| Datei | Was |
|---|---|
| `2026-11-15-container.json`, `.md` | **Basis vor dem großen Umbau** (Ablago 0.290.2). Container mit 2 Kernen, Browser, Ablago und PostgreSQL auf demselben Rechner, andere Bauten liefen parallel – **keine NAS-Werte**, nur ein Maßstab für Läufe auf demselben Gerät. |
| `2026-11-15-container-probe-vor-1257.md` | Probe: derselbe Lauf mit der Oberfläche vor PR #1257 (#1255) – „Neue Post zuordnen“ wird rot. |
| `2026-11-18-container.json`, `.md` | **Basis nach Phase D** (Ablago 0.297.1). Gleicher Container-Typ wie die Basis vom 15.11., frisch eingerichtet, ein zweiter Bau lief parallel – **keine NAS-Werte**. Alle Abläufe gleich oder besser; „Neue Post zuordnen“ ungedrosselt 384 ms bis bedienbar, INP 80 ms. Mit dem neuen Ablauf „Langes Dokument“. |
| `2026-11-18-container-1339-post-zuordnen.md` | „Neue Post zuordnen“ vor und nach #1339 (PR #1435): main und der Zweig auf demselben Rechner und denselben Daten, dazu der neue Ablauf „Langes Dokument“. Werte aus dem PR, ohne JSON. |

## Vergleichen

```bash
# frisches Ablago mit eigener Datenbank, einmal einrichten
DMS_URL=http://localhost:3100 node web/rauchtest/messen/oberflaeche.mjs --einrichten
# messen und mit der Basis vergleichen (rot = Exit-Code 1)
DMS_URL=http://localhost:3100 node web/rauchtest/messen/oberflaeche.mjs --geraet "<Gerät>" \
  --vorher docs/messungen/oberflaeche/2026-11-18-container.json --json neu.json --bericht neu.md --grenzen
```

Verglichen werden die Mediane von „bis bedienbar“, INP und Blockierzeit je Ablauf und Drossel; schlechter ist mehr als +20 % und mindestens +100 ms; was darüber liegt, wird einmal nachgemessen (je Kennzahl zählt der bessere Lauf). Auf einem Rechner, auf dem nebenher anderes läuft, schwanken die Werte stark – im Container dieser Basis lagen zwei Läufe mit demselben Stand teils über der Schwelle auseinander. Ein Vergleich über verschiedene Geräte ist nur bedingt aussagekräftig – der Bericht weist darauf hin. Die CI vergleicht wöchentlich mit ihrem eigenen letzten grünen Lauf (Workflow „Oberfläche messen“), nicht mit diesen Dateien.
