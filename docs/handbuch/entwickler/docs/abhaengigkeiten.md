# Abhängigkeiten { #abhaengigkeiten }

Ablago kommt mit **wenig fremdem Code** aus: 10 npm-Pakete im Server, 3 in der Oberfläche, dazu eine Handvoll Alpine-Pakete im Image. Das ist der beste Schutz gegen Angriffe über die Lieferkette und hält Sicherheitsupdates selten und überschaubar – und einer der Hauptgründe, warum Node.js hier gut passt. So soll es bleiben.

**Regel (#543):** Eine neue **Laufzeit-Abhängigkeit** – npm unter `dependencies` oder ein Alpine-Paket per `apk add` im `Dockerfile` – kommt nur mit Begründung im Pull Request (Abschnitt „Neue Abhängigkeiten“ der Vorlage):

- **Wozu** wird sie gebraucht?
- **Warum nicht** mit Node.js-Bordmitteln oder den vorhandenen Abhängigkeiten und Werkzeugen? Oft reicht eine kleine eigene Umsetzung, wie bei den [Sprachdateien](texte.md#texte-und-sprachdateien) statt i18next.
- **Lizenz:** verträglich mit Apache-2.0? Bewusst nicht im Image sind z. B. Ghostscript und MuPDF (AGPL).
- **Pflegezustand:** letzte Version, Zahl der Betreuer.
- **Eigene Abhängigkeiten:** was sie mit ins Image bringt.

Die Prüfung **Abhängigkeiten** (`.github/workflows/abhaengigkeiten.yml`) meldet im PR neue Laufzeit-Abhängigkeiten als Warnung, entfernte und neue Werkzeuge für Bau und Tests als Notiz und geänderte Versionen in der Zusammenfassung des Laufs – gesperrt wird nichts. Das erledigt das Skript `.github/werkzeuge/abhaengigkeiten-hinweis.py` (nur Python und git); lokal: `python3 .github/werkzeuge/abhaengigkeiten-hinweis.py main HEAD`. Bekannte Sicherheitslücken und unverträgliche Lizenzen prüft im selben Lauf die Dependency Review von GitHub.

**Was heute drinsteckt** – jedes direkt eingebundene Paket mit Zweck, Lizenz und dem, was es mitbringt, dazu die Werkzeuge für Entwicklung und Test – steht auf der erzeugten Seite [Aufbau aus Bestandteilen](bestandteile-aufbau.md) (#1412). Den Zweck eines neuen Pakets trägst du in `.github/werkzeuge/bestandteile-wozu.json` ein (Abschnitt `npm` bzw. `pakete` für `apk add`) und erzeugst die Seite neu; ohne Zweck schlägt die CI fehl. Besonderheiten, die dort nicht stehen:

- `@pdf-lib/fontkit` (einzige Abhängigkeit `pako`, die pdf-lib schon mitbringt) und `@simplewebauthn/server` stehen auf fester Version.
- `poppler-utils` und `setpriv` (beide GPL-2.0-or-later) ruft Ablago als eigene Programme auf; eingebunden werden sie nicht. `tini`, `su-exec` und `setpriv` sorgen dafür, dass Ablago, Vorstart und Werkzeugdienst [ohne root](server.md#ohne-root) laufen.
- Die Ersatzschriften `font-liberation` und `font-dejavu` (mit `fontconfig`, etwa 14 MB) prüft `.github/werkzeuge/schriften-pruefen.mjs` im Image-Workflow ([#1329](https://github.com/motom001/dms/issues/1329)); ohne sie rendert `pdftoppm` PDFs mit nicht eingebetteten Schriften ohne Text.
- Auch bei Werkzeugen gilt: lieber Bordmittel – die Tests laufen mit dem Testläufer von Node.js (`node --test`), ohne eigenes Test-Framework.
