# Release

Ein Release entsteht, sobald auf `main` eine Versionsnummer steht, für die es noch kein Tag gibt. Die Nummer vergibt seit #952 der Merge, nicht der Pull Request.

1. **Pull Request** mit einem **Notizschnipsel** `docs/releases/neu/<name>.md` statt einer Versionsnummer (Aufbau unten, [Versionsnummer beim Merge](#versionsnummer-beim-merge)). Die CI prüft im Job `rauchtests` (Teil von `pruefen`): Wer das Programm ändert (`server/`, `web/`, `shared/` ohne Tests, `Dockerfile`, `docker/`), bringt genau einen Schnipsel mit.
2. Nach dem Merge vergibt **version.yml** (*Version vergeben*) die nächste Nummer: höchste `art` der neuen Schnipsel, drei `package.json`, Schnipsel zusammengefasst nach `docs/releases/v<version>.md`, Schnipsel gelöscht. Das steht als eigener Commit „Version X.Y.Z“ auf `main`, mit `Pull-Request: #…` im Text.
3. Auf diesen Commit hin baut **image.yml** (*Prüfen und Image bauen*) **zwei Images** nativ für amd64 und arm64 und pusht sie: `ghcr.io/motom001/dms:<version>` und `ghcr.io/motom001/dms-komplett:<version>`.
4. Danach ruft image.yml **release.yml** auf. Der Workflow legt das Tag `v<version>` und das GitHub-Release an. Den Text übernimmt er aus `docs/releases/v<version>.md`; fehlt die Datei, nimmt er die Commit-Überschriften seit dem vorigen Tag.
5. **handbuch.yml** baut alle vier Handbücher und veröffentlicht sie über GitHub Actions (`actions/upload-pages-artifact`, `actions/deploy-pages`) unter `https://help.ablago.app/<handbuch>/aktuell/`. Ältere Fassungen gibt es online nicht mehr: Jede Installation bringt ihr Handbuch unter `/hilfe/` mit, und aus jedem Tag lässt es sich neu bauen. Die 404-Seite leitet alte Adressen (`v0.xx/…`, `entwicklung/…`) auf dieselbe Seite unter `aktuell` um (`docs/handbuch/werkzeuge/veroeffentlichen.py`). Die englische Fassung jedes Handbuchs (#730) liegt unter `…/<handbuch>/aktuell/en/`; die kurze Adresse `/emergency` führt auf die englische Notfallseite. Die Seite *Neu in dieser Version* entsteht aus den Release-Notizen. Die eigene Adresse steht in den Pages-Einstellungen (Quelle „GitHub Actions“); einen Zweig `gh-pages` gibt es nicht mehr.
6. `:stabil` wandert **nicht** mit jedem Release (#907). Das Release entsteht mit `--latest=false`; einmal pro Woche (dienstags 04:23 UTC, auch von Hand unter Actions) wählt **stabil.yml** (*:stabil befördern*) das neueste Release, das mindestens 24 Stunden alt ist, über dem bisherigen „Latest“ liegt und alle Regeln erfüllt (#714): Nummer X.Y.Z (keine Vorabversion), Release-Notizen vorhanden, kein Label `nicht-stabil` am Pull Request (sonst das nächstältere; nie zurück; zeigt `:stabil` schon darauf, passiert nichts). Geprüft werden beide Images für amd64 und arm64 mit Herkunftsnachweis (`gh attestation verify`) und der Update-Test vom bisherigen `:stabil` grün (`.github/werkzeuge/update-test.sh`: alter Stand einrichten, Dokument ablegen, sichern → neuer Stand mit denselben Ordnern → Daten da, Probe-Wiederherstellung gelingt). Dann zeigen `dms:stabil` und `dms-komplett:stabil` auf die neue Version, das Release wird „Latest“ (danach richtet sich der Hinweis „neue Version“ in Ablago) und bekommt den Abschnitt *Seit der letzten stabilen Version* mit Links auf alle Versionen seit dem bisherigen `:stabil`. Mit dem Label `sofort-stabil` am Pull Request ruft image.yml denselben Workflow gleich nach dem Release für genau diese Version auf (ohne 24 Stunden Wartezeit). Die Regeln stehen in `.github/werkzeuge/stabil-pruefen.sh` und `stabil-auswahl.sh` und werden in jedem Pull Request getestet; den Update-Test vom letzten stabilen Stand auf den Stand des Pull Requests macht `image-probe` ebenfalls.
7. **[motom001/dms-appstore](https://github.com/motom001/dms-appstore)** übernimmt die neue Version am nächsten Morgen, mit Images per Digest, für Umbrel, ZimaOS und CasaOS. Von Hand geht es sofort über den Workflow *Store aktualisieren*.

## Versionsnummer beim Merge

Seit #952 kollidieren Pull Requests nicht mehr an der Versionsnummer: Jeder bringt nur einen Schnipsel mit, die Nummer entsteht in der Reihenfolge der Merges.

```markdown
art: minor

## Neu

- **Mappen zusammenführen** (#123): …

## Behoben

- **Suche** (#124): …
```

- **Erste Zeile** `art: minor` (neue Funktion), `art: patch` (Korrektur) oder `art: keine` (kein Release, etwa reine Tests oder CI). Darunter die Release-Notizen wie bisher, mit `## Sicherheit`, `## Neu`, `## Geändert`, `## Behoben`, `## Entfernt`. Ohne Überschrift landet ein Punkt unter „Geändert“.
- **Name:** der Branch, klein (`fs-890.md`). Je Pull Request genau ein Schnipsel.
- **Mehrere Merges vor dem Lauf:** Die höchste `art` gewinnt, die Notizen stehen gebündelt unter einer Version. Schnipsel mit `art: keine` verschwinden mit dem nächsten Release.
- **Ohne Schnipsel:** Pull Requests nur an Handbuch, CI oder Tests und Dependabot. Sie kommen mit dem nächsten Release mit.
- **Im Übergang** geht noch die alte Art (Nummer und `docs/releases/v<version>.md` im Pull Request) – mit Warnung. Beides zusammen lehnt die CI ab.
- **Labels** `sofort-stabil`/`nicht-stabil` bleiben am Pull Request: Der Versions-Commit nennt ihn mit `Pull-Request: #…`, `.github/werkzeuge/pr-labels.sh` liest die Labels von dort.
- **Schreibrecht:** Nur der Job in `version.yml` schreibt ohne Pull Request auf `main` – mit dem Token der GitHub-App *Ablago Version* (nur „Contents: lesen und schreiben“, nur in diesem Repository installiert). Ihr Schlüssel liegt als `VERSION_APP_SCHLUESSEL` in der Umgebung `versionieren`, die nur von `main` aus nutzbar ist; die App-Id als Variable `VERSION_APP_ID`. Im Ruleset von `main` darf allein diese App vorbei. Das Werkzeug selbst (`.github/werkzeuge/version.mjs`, Tests in `version.test.mjs`) läuft ohne das Token.
- **Migrationen** werden weiter in der Reservierungsliste der Chats vergeben; Versionen reserviert niemand mehr.

## Versionsnummern

- **Neben-Version** (`0.40.0`) für neue Funktionen.
- **Patch** (`0.39.1`) für Korrekturen.
- Jedes Release ersetzt das Handbuch online unter `aktuell`.
- Ohne neue Nummer: nur das Image `main` ändert sich, Handbuch online und `:stabil` nicht.
- **Zurückhalten:** Label `nicht-stabil` am Pull Request – Release und Image mit Nummer entstehen, der Wochenlauf nimmt die nächstältere Version.
- **Sofort stabil:** Label `sofort-stabil` am Pull Request (vor dem Merge) – für dringende Fehlerbehebungen, etwa Sicherheit. `nicht-stabil` gewinnt, wenn beide gesetzt sind.
- **Zurückrollen:** Actions → *:stabil zurücksetzen* → Version eingeben (nur veröffentlichte Releases, nur mit Schreibrecht am Repository). Geht in beide Richtungen und setzt das Release auf „Latest“. Nach dem Zurückrollen `nicht-stabil` an den Pull Request der fehlerhaften Version setzen, sonst nimmt der nächste Wochenlauf sie wieder.

### Workflows von Hand starten

- *Prüfen und Image bauen* (`image.yml`) und *Scorecard* lassen sich unter **Actions** von Hand starten. Ein Handstart von image.yml baut und veröffentlicht die Images, legt aber kein Release an – das passiert nur nach einem Push auf `main` mit neuer Nummer.
- *Handbuch* (`handbuch.yml`) baut von Hand auf `main` und veröffentlicht neu unter `aktuell` – etwa nach einer Störung. Die Version gibt nur an, welche Release-Notizen *Neu in dieser Version* zeigt.
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

- **Dependabot** (`.github/dependabot.yml`) schlägt jeden Montag Updates vor: kleine Updates (minor, patch) gesammelt in einem PR, Hauptversionen einzeln, dazu GitHub Actions, die Basis-Images und die Ollama-Version im Beispiel `deploy/beispiele/ki-ollama/` (nur `docker-compose.yml`; `amd.yml` und `intel-grafik.yml` im selben PR von Hand nachziehen – die Probe im Workflow *KI-Beispiel* schlägt sonst mit dem passenden `sed`-Befehl fehl). Sicherheitsupdates kommen sofort. Die CI prüft jeden dieser PRs wie jeden anderen; Hauptversionen bitte mit Blick in das Änderungsprotokoll der Bibliothek.
    - **Ausnahmen** (`ignore` in `dependabot.yml`), die bewusst von Hand kommen: neue Hauptversionen von `node` (Basis-Image, nur LTS-Reihen), `@types/node` und `typescript`; bei `esbuild` (noch 0.x) auch neue Nebenversionen.
- **`npm audit`** läuft in der CI über alles, was im Image landet (`--omit=dev`). Ab Stufe „hoch“ schlägt die Prüfung fehl. Ist eine Meldung für Ablago nachweislich ohne Wirkung, wird das im PR begründet.
- **`package-lock.json`** hält die genauen Versionen fest; CI und Image installieren mit `npm ci`. Ändert sich eine `package.json` ohne passende Lockfile, legt der Workflow *Lockfile erzeugen* eine neue auf den Branch `werkzeug/lockfile`; von dort wird sie mit einem normalen Commit übernommen.
- **Sicherheitskorrektur = Patch-Release** mit dem Hinweis „Sicherheitsupdate – bitte aktualisieren“ in den Release-Notes. Meldungen von außen laufen vertraulich, siehe [`SECURITY.md`](https://github.com/motom001/dms/blob/main/SECURITY.md).

### Images prüfen, Herkunftsnachweis und Stückliste

- **Trivy** prüft beide Images auf bekannte Lücken in den Systempaketen (Alpine, poppler, PostgreSQL in `dms-komplett`) und in den Node-Bibliotheken im Image.
    - **Im Pull Request** (Job `image-probe`, amd64): Lücken der Stufe *kritisch*, für die es eine Korrektur gibt, lassen die Prüfung fehlschlagen; *hoch* mit Korrektur erscheint als Warnung. Funde ohne Korrektur blockieren nicht.
    - **Auf `main`, bei Tags und beim wöchentlichen Neubau** (Job `image-zusammen`): Das fertige Image wird geprüft und die Funde landen unter **Security → Code scanning** (Kategorie `image-dms` bzw. `image-dms-komplett`). Hier wird nur gemeldet, das Image ist ja schon veröffentlicht.
    - Bewusst hingenommene Funde stehen mit Begründung und Prüfdatum in `.trivyignore`.
    - Trivy kommt als Binärdatei mit fester Version und fester Prüfsumme (`.github/werkzeuge/trivy-installieren.sh`), nicht über die trivy-action: Deren Tags wurden 2026 kompromittiert (CVE-2026-33634). Eine neue Version trägt man dort von Hand ein, mit beiden Prüfsummen aus der `checksums.txt` des Releases.
- **Herkunftsnachweis und Stückliste (SBOM):** Jedes veröffentlichte Image bekommt einen signierten Nachweis, aus welchem Commit und welchem Workflow es stammt, und eine Stückliste im SPDX-Format. Beides liegt neben dem Image in der Registry. Prüfen lässt sich das mit:

    ```sh
    gh attestation verify oci://ghcr.io/motom001/dms:stabil -R motom001/dms
    gh attestation verify oci://ghcr.io/motom001/dms:stabil -R motom001/dms --predicate-type https://spdx.dev/Document/v2.3
    ```

### OpenSSF Scorecard und Regeln für Workflows

Der Workflow *Scorecard* bewertet wöchentlich und bei jedem Push auf `main`, wie das Projekt mit Sicherheit umgeht. Das Ergebnis ist öffentlich ([scorecard.dev](https://scorecard.dev/viewer/?uri=github.com/motom001/dms)) und steht als Abzeichen in der README; die einzelnen Hinweise stehen unter **Security → Code scanning**. Daraus folgen diese Regeln:

- **Actions mit fester Commit-Kennung**, die Version als Kommentar dahinter: `uses: actions/checkout@<40 Zeichen> # v7.0.1`. Dependabot aktualisiert beides.
- **Rechte:** Oben im Workflow nur `contents: read` (bzw. keine Rechte). Schreibrechte bekommt nur der Job, der sie braucht (`packages`, `contents`, `id-token`, `attestations`, `security-events`). Einzige Ausnahme ist der Workflow *Scorecard* mit `permissions: read-all` oben – das sind nur Leserechte; für die Veröffentlichung des Ergebnisses darf dieser Workflow oben keine Schreibrechte haben.
- **Keine Ausführung fremden Codes mit Rechten:** `pull_request_target` nur ohne Checkout (wie im Workflow *Freigabe schützen*).

Bewusst anders, als Scorecard es gern hätte:

- **Basis-Images ohne festen Prüfwert** (`node:24-alpine`, `python:3.12-alpine` im `Dockerfile`): Der wöchentliche Neubau soll gerade die neuesten Sicherheitskorrekturen der Reihe holen. Ein fester Prüfwert würde jede Woche einen eigenen PR brauchen, ohne mehr Sicherheit zu bringen; die Images selbst werden geprüft und tragen einen Herkunftsnachweis. Das gilt auch nach der Prüfung in #289: Mit Prüfwert kämen Korrekturen an Node nur noch über einen Dependabot-PR, den jemand mergen muss.
- **Code-Review:** Mit einem Maintainer gibt es keine zweite Person, die jeden PR freigibt. Stattdessen müssen alle Prüfungen grün sein, und Änderungen laufen über PRs mit Issue.

### Bewertung des ersten Laufs

Erster Lauf am 31.10.2026: **6,1 von 10**. So gehen wir mit den einzelnen Prüfungen um:

| Prüfung | Wert | Umgang |
| --- | --- | --- |
| Dangerous-Workflow, Token-Permissions, Binary-Artifacts, Dependency-Update-Tool, Security-Policy, Packaging, License, CI-Tests | 10 | erfüllt, so halten |
| Vulnerabilities | 8 | Bekannte Lücken in Entwicklungswerkzeugen (nicht im Image – das prüfen `npm audit --omit=dev` und Trivy). Kommen mit den Updates aus #236 weg; Liste unter *Security → Dependabot*. |
| Pinned-Dependencies | 6 | Actions fest, `npm ci` ohne Ausweichen auf `npm install`. Seit #289 auch die Werkzeuge der Handbücher: mkdocs mit allen Abhängigkeiten über `docs/handbuch/requirements.txt` mit Hashes (Image und CI, Dependabot hält sie aktuell), Playwright mit fester Version. Bewusst offen: Basis-Images ohne Prüfwert (siehe oben), `FROM laufzeit` (interne Stufe, Fehlalarm), `npm install --package-lock-only` in *Lockfile erzeugen* (erzeugt das Lockfile, Fehlalarm) und die apt-Pakete der Runner. |
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
