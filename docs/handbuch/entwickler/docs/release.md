# Release

Ein Release entsteht, sobald auf `main` eine Versionsnummer steht, für die es noch kein Tag gibt.

1. **Pull Request** mit erhöhter Nummer in `package.json`, `server/package.json`, `web/package.json` und neuen Release-Notizen `docs/releases/v<version>.md`.
2. Nach dem Merge baut **image.yml** (*Prüfen und Image bauen*) **zwei Images** nativ für amd64 und arm64 und pusht sie: `ghcr.io/motom001/dms:<version>` und `ghcr.io/motom001/dms-komplett:<version>`.
3. Danach ruft image.yml **release.yml** auf. Der Workflow legt das Tag `v<version>` und das GitHub-Release an. Den Text übernimmt er aus `docs/releases/v<version>.md`; fehlt die Datei, nimmt er die Commit-Überschriften seit dem vorigen Tag.
4. **handbuch.yml** baut alle Handbücher für diese Version (`v<Haupt>.<Neben>`) und legt sie auf dem Branch `gh-pages` ab. `aktuell` zeigt dann auf die neue Version, `entwicklung` folgt weiter `main`. Die Seite *Neu in dieser Version* entsteht aus den Release-Notizen.
5. **[motom001/dms-appstore](https://github.com/motom001/dms-appstore)** übernimmt die neue Version am nächsten Morgen, mit Images per Digest, für Umbrel, ZimaOS und CasaOS. Von Hand geht es sofort über den Workflow *Store aktualisieren*.

## Versionsnummern

- **Neben-Version** (`0.40.0`) für neue Funktionen; das Handbuch bekommt eine eigene Version.
- **Patch** (`0.39.1`) für Korrekturen; das Handbuch der Neben-Version wird überschrieben.
- Ohne neue Nummer: nur das Image `main` und das Handbuch `entwicklung` ändern sich.

### Workflows von Hand starten

- *Prüfen und Image bauen* (`image.yml`) und *Scorecard* lassen sich unter **Actions** von Hand starten. Ein Handstart von image.yml baut und veröffentlicht die Images, legt aber kein Release an – das passiert nur nach einem Push auf `main` mit neuer Nummer.
- *Handbuch* (`handbuch.yml`) baut von Hand wahlweise eine Version (z. B. `v0.22`) oder, ohne Angabe, `entwicklung`.
- *Lockfile erzeugen* (`lockfile.yml`) lässt sich ebenfalls von Hand starten.
- *Release* (`release.yml`) startet außerdem bei einem von Hand gepushten Tag `v*` (legt das Release an) und bei einem von Hand veröffentlichten Release (setzt nur den Text).

## Qualitätskontrolle: weiche Zeitangaben

Ankündigungen wie „im Moment“, „folgt“, „kommt später“ oder „noch nicht“ bleiben gern stehen, wenn die Funktion längst gebaut ist. Bei jeder Qualitätskontrolle (z. B. 0.75) gehört deshalb diese Liste dazu:

```sh
python3 docs/handbuch/werkzeuge/zeitangaben.py
```

Das Skript durchsucht Handbücher, Glossar, Vorlagen, README und die Texte der Oberfläche (`web/src`, `shared/src/hilfe.ts`; Kommentare zählen nicht) und gibt je Fund Datei, Zeile, Wort und Satz aus. Der Handbuch-Workflow schreibt dieselbe Liste in die Zusammenfassung des Laufs; er bricht dabei nie ab.

So liest du sie: Stimmt der Satz noch? Wenn nicht, korrigieren. Ist er gewollt (z. B. „noch nicht bezahlt“ oder eine echte Planung), markiere ihn in derselben Zeile oder der Zeile davor mit `<!-- zeitangabe: geprüft 0.75 -->` (in YAML `# zeitangabe: …`, in TypeScript `// zeitangabe: …`). Markierte Stellen stehen gesondert unter „Geprüft“ mit der Version, damit sie bei der nächsten Runde wieder auffallen.

## Abhängigkeiten und Sicherheitsupdates

- **Dependabot** (`.github/dependabot.yml`) schlägt jeden Montag Updates vor: kleine Updates (minor, patch) gesammelt in einem PR, Hauptversionen einzeln, dazu GitHub Actions und die Basis-Images. Sicherheitsupdates kommen sofort. Die CI prüft jeden dieser PRs wie jeden anderen; Hauptversionen bitte mit Blick in das Änderungsprotokoll der Bibliothek.
    - **Ausnahmen** (`ignore` in `dependabot.yml`), die bewusst von Hand kommen: neue Hauptversionen von `node` (Basis-Image, nur LTS-Reihen), `@types/node` und `typescript`; bei `esbuild` (noch 0.x) auch neue Nebenversionen.
- **`npm audit`** läuft in der CI über alles, was im Image landet (`--omit=dev`). Ab Stufe „hoch“ schlägt die Prüfung fehl. Ist eine Meldung für das DMS nachweislich ohne Wirkung, wird das im PR begründet.
- **`package-lock.json`** hält die genauen Versionen fest; CI und Image installieren mit `npm ci`. Ändert sich eine `package.json` ohne passende Lockfile, legt der Workflow *Lockfile erzeugen* eine neue auf den Branch `werkzeug/lockfile`; von dort wird sie mit einem normalen Commit übernommen.
- **Sicherheitskorrektur = Patch-Release** mit dem Hinweis „Sicherheitsupdate – bitte aktualisieren“ in den Release-Notes. Meldungen von außen laufen vertraulich, siehe [`SECURITY.md`](https://github.com/motom001/dms/blob/main/SECURITY.md).

### Images prüfen, Herkunftsnachweis und Stückliste

- **Trivy** prüft beide Images auf bekannte Lücken in den Systempaketen (Alpine, Tesseract, PostgreSQL in `dms-komplett`) und in den Node-Bibliotheken im Image.
    - **Im Pull Request** (Job `image-probe`, amd64): Lücken der Stufe *kritisch*, für die es eine Korrektur gibt, lassen die Prüfung fehlschlagen; *hoch* mit Korrektur erscheint als Warnung. Funde ohne Korrektur blockieren nicht.
    - **Auf `main`, bei Tags und beim wöchentlichen Neubau** (Job `image-zusammen`): Das fertige Image wird geprüft und die Funde landen unter **Security → Code scanning** (Kategorie `image-dms` bzw. `image-dms-komplett`). Hier wird nur gemeldet, das Image ist ja schon veröffentlicht.
    - Bewusst hingenommene Funde stehen mit Begründung und Prüfdatum in `.trivyignore`.
    - Trivy kommt als Binärdatei mit fester Version und fester Prüfsumme (`.github/werkzeuge/trivy-installieren.sh`), nicht über die trivy-action: Deren Tags wurden 2026 kompromittiert (CVE-2026-33634). Eine neue Version trägt man dort von Hand ein, mit beiden Prüfsummen aus der `checksums.txt` des Releases.
- **Herkunftsnachweis und Stückliste (SBOM):** Jedes veröffentlichte Image bekommt einen signierten Nachweis, aus welchem Commit und welchem Workflow es stammt, und eine Stückliste im SPDX-Format. Beides liegt neben dem Image in der Registry. Prüfen lässt sich das mit:

    ```sh
    gh attestation verify oci://ghcr.io/motom001/dms:main -R motom001/dms
    gh attestation verify oci://ghcr.io/motom001/dms:main -R motom001/dms --predicate-type https://spdx.dev/Document/v2.3
    ```

### OpenSSF Scorecard und Regeln für Workflows

Der Workflow *Scorecard* bewertet wöchentlich und bei jedem Push auf `main`, wie das Projekt mit Sicherheit umgeht. Das Ergebnis ist öffentlich ([scorecard.dev](https://scorecard.dev/viewer/?uri=github.com/motom001/dms)) und steht als Abzeichen in der README; die einzelnen Hinweise stehen unter **Security → Code scanning**. Daraus folgen diese Regeln:

- **Actions mit fester Commit-Kennung**, die Version als Kommentar dahinter: `uses: actions/checkout@<40 Zeichen> # v7.0.1`. Dependabot aktualisiert beides.
- **Rechte:** Oben im Workflow nur `contents: read` (bzw. keine Rechte). Schreibrechte bekommt nur der Job, der sie braucht (`packages`, `contents`, `id-token`, `attestations`, `security-events`). Einzige Ausnahme ist der Workflow *Scorecard* mit `permissions: read-all` oben – das sind nur Leserechte; für die Veröffentlichung des Ergebnisses darf dieser Workflow oben keine Schreibrechte haben.
- **Keine Ausführung fremden Codes mit Rechten:** `pull_request_target` nur ohne Checkout (wie im Workflow *Freigabe schützen*).

Bewusst anders, als Scorecard es gern hätte:

- **Basis-Images ohne festen Prüfwert** (`node:24-alpine`, `python:3.12-alpine` im `Dockerfile`): Der wöchentliche Neubau soll gerade die neuesten Sicherheitskorrekturen der Reihe holen. Ein fester Prüfwert würde jede Woche einen eigenen PR brauchen, ohne mehr Sicherheit zu bringen; die Images selbst werden geprüft und tragen einen Herkunftsnachweis.
- **Code-Review:** Mit einem Maintainer gibt es keine zweite Person, die jeden PR freigibt. Stattdessen müssen alle Prüfungen grün sein, und Änderungen laufen über PRs mit Issue.

### Bewertung des ersten Laufs

Erster Lauf am 31.10.2026: **6,1 von 10**. So gehen wir mit den einzelnen Prüfungen um:

| Prüfung | Wert | Umgang |
| --- | --- | --- |
| Dangerous-Workflow, Token-Permissions, Binary-Artifacts, Dependency-Update-Tool, Security-Policy, Packaging, License, CI-Tests | 10 | erfüllt, so halten |
| Vulnerabilities | 8 | Bekannte Lücken in Entwicklungswerkzeugen (nicht im Image – das prüfen `npm audit --omit=dev` und Trivy). Kommen mit den Updates aus #236 weg; Liste unter *Security → Dependabot*. |
| Pinned-Dependencies | 6 | Actions fest, `npm ci` ohne Ausweichen auf `npm install`. Bewusst offen: Basis-Images ohne Prüfwert (siehe oben), Werkzeuge nur für den Handbuch-Bau (mkdocs über pip, Playwright, apt-Pakete der Runner) – sie landen nicht im Image. |
| SAST | 4 | CodeQL läuft seit Ende Oktober 2026 bei jedem PR. Der Wert zählt die letzten Commits und steigt von selbst. |
| Maintained | 0 | Das Repository ist jünger als 90 Tage; danach zählt die Aktivität und der Wert steigt von selbst. |
| Branch-Protection | 0 | Ruleset nach dem Vorschlag unten einschalten (Maintainer). |
| Code-Review | 0 | Mit einem Maintainer nicht erfüllbar, siehe oben. |
| CII-Best-Practices | 0 | Selbstauskunft auf [bestpractices.dev](https://www.bestpractices.dev/) ausfüllen (Maintainer, gut eine Stunde); danach Abzeichen in der README. |
| Contributors | 3 | Zählt Firmen und Organisationen der Mitwirkenden – kein Handlungsbedarf. |
| Fuzzing | 0 | Bewusst nicht: Eingaben prüfen Schemas und Tests; Fuzzing lohnt erst für eigene Parser. |
| Signed-Releases | ? | GitHub-Releases haben keine Dateien – die Images sind das Release und tragen Herkunftsnachweis und SBOM. |

### Vorschlag: Regel für den Branch `main`

Unter **Settings → Rules → Rulesets** ein Ruleset für den Standard-Branch anlegen (einschalten tut es der Maintainer):

- **Require a pull request before merging** (ohne Pflicht-Review, siehe oben),
- **Require status checks to pass:** `pruefen`, `image-probe (linux/amd64, ubuntu-24.04)`, `image-probe (linux/arm64, ubuntu-24.04-arm)`, `bauen` (Handbuch),
- **Require code scanning results:** CodeQL, Schwelle wie in den Einstellungen („High or higher“),
- **Block force pushes** und **Restrict deletions**,
- **Bypass:** nur der Maintainer (Rolle *Repository admin*), damit Notfall-Korrekturen möglich bleiben.
