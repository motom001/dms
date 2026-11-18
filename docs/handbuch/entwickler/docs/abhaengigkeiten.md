# Abhängigkeiten { #abhaengigkeiten }

Ablago kommt mit **wenig fremdem Code** aus: 10 npm-Pakete im Server, 3 in der Oberfläche, dazu eine Handvoll Alpine-Pakete im Image. Das ist der beste Schutz gegen Angriffe über die Lieferkette und hält Sicherheitsupdates selten und überschaubar – und einer der Hauptgründe, warum Node.js hier gut passt. So soll es bleiben.

**Regel (#543):** Eine neue **Laufzeit-Abhängigkeit** – npm unter `dependencies` oder ein Alpine-Paket per `apk add` im `Dockerfile` – kommt nur mit Begründung im Pull Request (Abschnitt „Neue Abhängigkeiten“ der Vorlage):

- **Wozu** wird sie gebraucht?
- **Warum nicht** mit Node.js-Bordmitteln oder den vorhandenen Abhängigkeiten und Werkzeugen? Oft reicht eine kleine eigene Umsetzung, wie bei den [Sprachdateien](texte.md#texte-und-sprachdateien) statt i18next.
- **Lizenz:** verträglich mit Apache-2.0? Bewusst nicht im Image sind z. B. Ghostscript und MuPDF (AGPL).
- **Pflegezustand:** letzte Version, Zahl der Betreuer.
- **Eigene Abhängigkeiten:** was sie mit ins Image bringt.

Die Prüfung **Abhängigkeiten** (`.github/workflows/abhaengigkeiten.yml`) meldet im PR neue Laufzeit-Abhängigkeiten als Warnung, entfernte und neue Werkzeuge für Bau und Tests als Notiz und geänderte Versionen in der Zusammenfassung des Laufs – gesperrt wird nichts. Das erledigt das Skript `.github/werkzeuge/abhaengigkeiten-hinweis.py` (nur Python und git); lokal: `python3 .github/werkzeuge/abhaengigkeiten-hinweis.py main HEAD`. Bekannte Sicherheitslücken und unverträgliche Lizenzen prüft im selben Lauf die Dependency Review von GitHub.

**Heute im Image** (Stand 0.297):

| Paket | Wo | Lizenz | Wozu |
| --- | --- | --- | --- |
| `fastify` | Server | MIT | HTTP-Server, Routen, Prüfung der Anfragen |
| `@fastify/static` | Server | MIT | die Oberfläche als Dateien ausliefern |
| `postgres` (postgres.js) | Server | Unlicense | Zugriff auf PostgreSQL |
| `nodemailer` | Server | MIT-0 | E-Mails über SMTP senden (Einladungen, Hinweise, Mappen versenden) |
| `imapflow` | Server | MIT | Post aus Postfächern über IMAP abholen |
| `mailparser` | Server | MIT | abgeholte E-Mails in Text und Anhänge zerlegen |
| `pdf-lib` | Server | MIT | PDFs zusammenstellen, verkleinern, schwärzen, stempeln – nur über die [PDF-Stelle](pdf.md#pdf-stelle) |
| `@pdf-lib/fontkit` (fest 1.1.1) | Server | MIT | eigene Schriften in PDFs einbetten (Noto Sans als Teilmenge, [#826](pdf.md#pdf-schriften)); einzige Abhängigkeit `pako`, die pdf-lib schon mitbringt |
| `yaml` | Server | ISC | Pakete im YAML-Format lesen und schreiben |
| `@simplewebauthn/server` | Server | MIT | [Passkeys](fachbereiche.md#passkeys) prüfen (WebAuthn: CBOR, COSE-Schlüssel, Signaturen, Zähler) – feste Version; bringt `@peculiar/*` und `asn1js` (MIT/BSD-3-Clause), `@levischuck/tiny-cbor`, `@hexagon/base64`, `tsyringe` (MIT), `reflect-metadata` (Apache-2.0) und `tslib` (0BSD) mit |
| `react`, `react-dom` | Oberfläche | MIT | Oberfläche |
| `qrcode` | Oberfläche | MIT | QR-Code für die Zwei-Faktor-Anmeldung |
| `poppler-utils` | Image (Alpine) | GPL-2.0-or-later, als eigenes Programm aufgerufen | `pdftotext`, `pdftoppm`: Text und Bilder aus PDFs |
| `qpdf` | Image (Alpine) | Apache-2.0 | Struktur von PDFs beim Verkleinern optimieren |
| `font-liberation`, `font-dejavu` (mit `fontconfig`) | Image (Alpine) | OFL-1.1 bzw. Bitstream-Vera (frei) | Ersatzschriften für nicht eingebettete Schriften in PDFs ([#1329](https://github.com/motom001/dms/issues/1329)); ohne sie rendert `pdftoppm` solche PDFs ohne Text. Etwa 14 MB; Prüfung im Image-Workflow mit `.github/werkzeuge/schriften-pruefen.mjs` |
| `postgresql17`, `postgresql17-contrib` | nur `dms-komplett` | PostgreSQL | Datenbank im selben Container; `contrib` für `pg_trgm` |
| `tini`, `su-exec` | nur `dms-komplett` | MIT | Prozesse starten und sauber beenden, PostgreSQL ohne root |

Nur für Bau und Tests (nicht im Image): `typescript`, `tsx`, `esbuild`, `vite` mit `@vitejs/plugin-react` und die Typen unter `@types/…`; für [Stil und Abhängigkeiten](stil.md) (#899) `eslint` mit `@eslint/js`, `typescript-eslint`, `eslint-plugin-react-hooks`, `@eslint-community/eslint-plugin-eslint-comments` und `globals`, dazu `dependency-cruiser`, `prettier` ([Formatierung](stil.md#formatierung)) und `knip` ([toter Code](stil.md#toter-code)); für die Rauchtests `axe-core` und – mit eigenem Lockfile in `web/rauchtest/` – `playwright`. Auch hier gilt: lieber Bordmittel – die Tests laufen mit dem Testläufer von Node.js (`node --test`), ohne eigenes Test-Framework.
