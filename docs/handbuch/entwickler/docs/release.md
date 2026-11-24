# Release

Ein Release entsteht, sobald auf `main` eine Versionsnummer steht, für die es noch kein Tag gibt. Die Nummer vergibt seit #952 der Merge, nicht der Pull Request.

1. **Pull Request** mit einem **Notizschnipsel** `docs/releases/neu/<name>.md` statt einer Versionsnummer (Aufbau unten, [Versionsnummer beim Merge](#versionsnummer-beim-merge)). Die CI prüft im Job `rauchtests` (Teil von `pruefen`): Wer das Programm ändert (`server/`, `web/`, `shared/` ohne Tests, `Dockerfile`, `docker/`), bringt genau einen Schnipsel mit.
2. Nach dem Merge vergibt **version.yml** (*Version vergeben*) die nächste Nummer: höchste `art` der neuen Schnipsel, drei `package.json` und `package-lock.json` (#1272), Schnipsel zusammengefasst nach `docs/releases/v<version>.md`, Schnipsel gelöscht. Das steht als eigener Commit „Version X.Y.Z“ auf `main`, mit `Pull-Request: #…` im Text.
3. Auf diesen Commit hin baut **image.yml** (*Prüfen und Image bauen*) **zwei Images** nativ für amd64 und arm64 und pusht sie: `ghcr.io/motom001/dms:<version>` und `ghcr.io/motom001/dms-komplett:<version>`.
4. Danach ruft image.yml **release.yml** auf. Der Workflow legt das Tag `v<version>` und das GitHub-Release an. Den Text übernimmt er aus `docs/releases/v<version>.md`; fehlt die Datei, nimmt er die Commit-Überschriften seit dem vorigen Tag. Erst danach setzt der Job `latest` in image.yml das Image-Tag **`:latest`** von `dms` und `dms-komplett` auf die neue Version (#1398, siehe [Image-Tags](#image-tags)).
5. **handbuch.yml** baut alle vier Handbücher und veröffentlicht sie über GitHub Actions (`actions/upload-pages-artifact`, `actions/deploy-pages`) unter `https://help.ablago.app/<handbuch>/aktuell/`. Ältere Fassungen gibt es online nicht mehr: Jede Installation bringt ihr Handbuch unter `/hilfe/` mit, und aus jedem Tag lässt es sich neu bauen. Die 404-Seite (`docs/handbuch/start/404.html`, #841) leitet alte Adressen (`v0.xx/…`, `entwicklung/…`) auf dieselbe Seite unter `aktuell` um; sonst zeigt sie im Ablago-Stil eine Suche über alle Handbücher (`start/suche.mjs`, dieselbe wie auf der Startseite, ohne fremde Bibliothek; der Test `shared/test/handbuchstart.test.ts` hält sie gleich mit der Suche im Assistenten) und den Knopf *Kaputten Link melden* (Vorlage `.github/ISSUE_TEMPLATE/kaputter-link.yml`, Feld-Ids nie umbenennen). Die Herkunft (`herkunft_genau`) füllt sie nur vor, wenn der Link von `help.ablago.app`, `ablago.app` oder `catalog.ablago.app` kam (#1306) – die Liste `HERKUENFTE` steht an einer Stelle in der Seite, verglichen wird der genaue Rechnername über https; jede andere Herkunft, auch die eigene Installation, bleibt draußen. Die Auswahl *Wo hast du den Link gefunden?* belegt GitHub über die Adresse nicht vor, sie bleibt leer. `offline.py` legt sie angepasst unter `/hilfe/404.html` ab, Ablago liefert sie für unbekannte Hilfe-Adressen aus. Im Browser prüft sie `docs/handbuch/screenshots/start-pruefen.mjs`. Die englische Fassung jedes Handbuchs (#730) liegt unter `…/<handbuch>/aktuell/en/`; die kurze Adresse `/emergency` führt auf die englische Notfallseite. Die Seite *Neu in dieser Version* entsteht aus den Release-Notizen. Die eigene Adresse steht in den Pages-Einstellungen (Quelle „GitHub Actions“); einen Zweig `gh-pages` gibt es nicht mehr.
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
- **Migrationen** bekommen die nächste freie Nummer in `server/migrations/`. Haben zwei offene Pull Requests dieselbe Nummer gewählt, nimmt der später gemergte beim Rebase die nächste freie. Versionen reserviert niemand.

## Image-Tags

| Tag | Zeigt auf | Wer setzt es | Für wen |
|---|---|---|---|
| `:latest` | die zuletzt veröffentlichte Version | Job `latest` in image.yml, nach jedem Release (#1398) | wer immer das Neueste will |
| `:stabil` | die geprüfte Version | stabil.yml im Wochentakt bzw. mit `sofort-stabil` (#714, #907); zurück mit *:stabil zurücksetzen* | Standard in allen Vorlagen |
| `:<Version>` | genau diese Version | Job `image-zusammen`, beim Release | wer selbst entscheidet, wann aktualisiert wird |
| `:main` | jeder Stand auf `main` | Job `image-zusammen`, bei jedem Push auf `main` und beim wöchentlichen Neubau | nur zum Testen |

Dazu kommt bei jedem Bau der Kurz-Hash des Commits (`:sha-…`).

- **Image nur mit stabilen Versionen** (#1480): `ghcr.io/motom001/ablago:<Version>` trägt nur Versionen, die zu `:stabil` befördert wurden. Den Tag legt *:stabil befördern* (stabil.yml) mit `docker buildx imagetools create` an – ohne neuen Bau, mit demselben Digest wie `dms:<Version>`, also beide Architekturen und derselbe Herkunftsnachweis (`gh attestation verify oci://ghcr.io/motom001/ablago:<Version> -R motom001/dms`). Es gibt dort kein `:latest` und kein `:stabil`. *:stabil zurücksetzen* legt dort nichts an; ein schon veröffentlichter Tag bleibt. Gedacht für App-Kataloge mit eigener Aktualisierung (Renovate im TrueNAS-Katalog), die sonst jedes Release nähmen. Nur `dms`, kein `dms-komplett`.
- **Version im Image** (#1447): Der Bau setzt `DMS_VERSION` auf die Version aus `package.json` (Build-Argument in image.yml, in der Probe und beim Bau auf `main`). Protokoll, Werkbank und Lasttest lasen sie schon vorher aus `package.json`. Neu ist der **Abgleich der Fassungen beim Start** (`FassungenDienst.abgleich`): Er läuft einmal je Version (Merker `fassungen_abgleich`). Was Migrationen und Umzüge geändert haben, bekommt dann die Fassung „Update auf Ablago <Version>“, Einträge ohne Fassung ihre erste, verschwundene einen Löschvermerk. Ohne `DMS_VERSION` hieß die Version immer „Entwicklung“: Der Abgleich lief nur beim allerersten Start, danach nie wieder, und die Fassungen hießen „Update auf Ablago Entwicklung“. Mit der echten Version holt der erste Start nach dem Update alles in einer Fassung je geändertem Eintrag nach. Weil nur Abweichendes eine Fassung bekommt, entstehen keine doppelten Fassungen und keine doppelten oder verlorenen Typen. Lokal (`npm run dev`, Tests) bleibt es bei „Entwicklung“, ebenso bei einem eigenen `docker build` ohne `--build-arg DMS_VERSION=…`. Der Update-Test prüft dieselben Mappentypen vor und nach dem Update und höchstens eine Update-Fassung je Typ, auch nach einem weiteren Neustart.

- **`:latest`** wandert nur bei einer neuen Version, also im selben Lauf wie die Versionsnummer, und erst, wenn das Release angelegt ist. Der wöchentliche Neubau und Pushes ohne neue Nummer setzen nur `:main`. Der Job hängt das fertige Manifest beider Architekturen mit `docker buildx imagetools create` um und prüft danach, dass `:latest` und `:<Version>` denselben Digest haben. Gibt es schon ein höheres Release (zwei Merges kurz hintereinander), bleibt `:latest`, wo es ist. `docker/metadata-action` setzt `:latest` nicht mehr von selbst (`flavor: latest=false`), auch nicht bei einem von Hand gepushten Tag.
- **Zwei verschiedene „Latest“:** Die Markierung „Latest“ bei den GitHub-Releases trägt die **stabile** Version (`:stabil`), danach richtet sich der Hinweis „neue Version“ in Ablago. Das Image-Tag `:latest` ist die **neueste** Version. Zwischen zwei Wochenläufen zeigen beide meist auf verschiedene Versionen.
- Prüfen: `docker buildx imagetools inspect ghcr.io/motom001/dms:latest` (und `dms-komplett:latest`) nennt amd64 und arm64; der Digest ist derselbe wie bei `:<Version>` des neuesten Releases.

## Versionsnummern

- **Neben-Version** (`0.40.0`) für neue Funktionen.
- **Patch** (`0.39.1`) für Korrekturen.
- Jedes Release ersetzt das Handbuch online unter `aktuell`.
- Ohne neue Nummer: nur das Image `main` ändert sich, Handbuch online, `:latest` und `:stabil` nicht.
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
- **Node-Version an zwei Stellen** (#1272): `engines` in `package.json` (alle Workflows lesen sie mit `node-version-file`) und das Basis-Image einmal im `Dockerfile` (Stufe `node-basis`, auf der Bau und Laufzeit aufbauen). Ein Wechsel der Hauptversion ändert beide.
- **Sicherheitskorrektur = Patch-Release** mit dem Hinweis „Sicherheitsupdate – bitte aktualisieren“ in den Release-Notes. Meldungen von außen laufen vertraulich, siehe [`SECURITY.md`](https://github.com/motom001/dms/blob/main/SECURITY.md).

### Wechsel der Node-Hauptversion { #node-wechsel }

Ablago läuft seit Version 0.306 auf **Node.js 26** (#1473; vorher 24). Node 24 ist seit 20.10.2026 in der Wartungsphase und bekommt Sicherheitsupdates bis **30.04.2028**; **Node 26** ist seit Oktober 2026 aktives LTS. Ab 2027 erscheint nur noch eine Node-Version im Jahr. Der Wechsel war früh und ohne Zeitdruck geplant und kam schließlich schon in KW48 2026, nach einem Probeumstieg (#1456) und der Korrektur ungelesener Datei-Ströme (#1461). Der ursprüngliche Plan ([#1473](https://github.com/motom001/dms/issues/1473), Folgeschritt aus dem Risikosteckbrief [#1413](https://github.com/motom001/dms/issues/1413)):

| Wann | Was |
| --- | --- |
| Januar 2027 | Branch mit Node 26 anlegen, Prüfliste unten abarbeiten, auffällige Pakete notieren |
| Februar 2027 | Umstellung mergen, Release mit Hinweis für Betreiber |
| **spätestens 31.03.2027** | Node 26 in allen Images und Workflows |
| bis 30.04.2028 | Node 24 nur noch als Rückfall für ein älteres Image; danach keine Sicherheitsupdates mehr |
| **24.11.2026** | umgesetzt: Basis-Image `node:26-alpine`, `engines` 26.x, `@types/node` 26, alle Workflows (über `node-version-file`) |

**Prüfliste für den Wechsel** (gilt sinngemäß für jeden Wechsel der Hauptversion):

1. **Version an beiden Stellen** (#1272): `engines` in `package.json` und das Basis-Image `node:26-alpine` in der Stufe `node-basis` des `Dockerfile`. Dazu `@types/node` auf die neue Hauptversion (kommt bewusst nicht über Dependabot).
2. **Basis-Image:** Ob das Image dabei per Digest festgehalten wird, entscheidet der PR. Bisher gilt bewusst „ohne festen Prüfwert“ (Abschnitt [OpenSSF Scorecard](#openssf-scorecard-und-regeln-fur-workflows)); #1473 nennt den Digest – die Abwägung steht im PR.
3. **CI:** alle Workflows grün – Tests (alle drei Teile), Rauchtests mit einem und zwei Prozessen, `image-probe` für beide Architekturen, Bilder des Handbuchs.
4. **Läufer und Werkzeugdienst:** WebAssembly-Pakete (WASI), Worker und das Berechtigungsmodell von Node (`--permission`) gegen den Läufer testen – Änderungen am Berechtigungsmodell zwischen den Hauptversionen gezielt im Änderungsprotokoll von Node nachlesen. Ebenso den Werkzeugdienst (`DMS_WERKZEUG_DIENST`) und die Pakete mit Code ([Pakete mit Code](pakete-code.md)).
5. **Pakete mit Bezug zur Laufzeit** gegen Node 26 prüfen, mindestens `@simplewebauthn/server` (Passkeys, Rauchtest „Passkey“), `postgres` (Datenbank, Server-Tests mit PostgreSQL), die Mail-Pakete (`nodemailer`, `imapflow`, `mailparser`) und alles mit nativen Teilen oder `node:`-Modulen, die sich geändert haben.
6. **Sicherheitsabgleich:** Der Abgleich bei NVD liest die Node-Version aus dem Image (`binaer: node` in `.github/werkzeuge/upstream-programme.json`) – einzutragen ist nichts; nach dem ersten Lauf prüfen, dass er Node 26 meldet.
7. **Release-Notiz** mit „Beim Update beachten“, wenn sich für Betreiber etwas ändert (z. B. eigene Images, die auf `node:24` aufbauen, oder eine neue Mindestversion für Entwickler). Sonst `art: minor` mit einem Satz unter „Geändert“.
8. **Entwicklerhandbuch:** „Loslegen“ (Node-Version für Entwickler) und diese Seite nachziehen.

### Images prüfen, Herkunftsnachweis und Stückliste

- **Trivy** prüft beide Images auf bekannte Lücken in den Systempaketen (Alpine, poppler, PostgreSQL in `dms-komplett`) und in den Node-Bibliotheken im Image.
    - **Im Pull Request** (Job `image-probe`, amd64): Lücken der Stufe *kritisch*, für die es eine Korrektur gibt, lassen die Prüfung fehlschlagen; *hoch* mit Korrektur erscheint als Warnung. Funde ohne Korrektur blockieren nicht.
    - **Auf `main`, bei Tags und beim wöchentlichen Neubau** (Job `image-zusammen`): Das fertige Image wird geprüft und die Funde landen unter **Security → Code scanning** (Kategorie `image-dms` bzw. `image-dms-komplett`). Hier wird nur gemeldet, das Image ist ja schon veröffentlicht.
    - Bewusst hingenommene Funde stehen mit Begründung und Prüfdatum in `.trivyignore`.
- **Sicherheitsabgleich der ausgelieferten Images** (#1417, Workflow `sicherheitsabgleich.yml`, mittwochs): prüft `:stabil` und `:latest` beider Varianten, auch zwischen zwei Bauten.
    - **Zweite Datenbank:** Syft erstellt die Stückliste (amd64), Grype prüft sie. Die Bibliotheken der Oberfläche kommen aus `ablago-bestandteile.cdx.json` am Release, soweit vorhanden. Kategorien `grype/<tag>-<variante>/` und `grype/<tag>-oberflaeche/`.
    - **Direkt bei NVD** (`.github/werkzeuge/upstream-abgleich.mjs`, Liste in `upstream-programme.json`): für poppler, qpdf, Node.js und PostgreSQL alle Meldungen, deren CPE-Angaben die ausgelieferte Version betreffen, und Meldungen der letzten 120 Tage, die NVD noch nicht eingeordnet hat (Suchwort und Muster in der Beschreibung). Was die Alpine-secdb für das Paket schon als behoben führt, fällt weg. Kategorie `upstream-abgleich/`. Ein weiteres Programm: Eintrag in `upstream-programme.json`, Test daneben.
    - **Nicht öffentlich:** Funde gehen nur unter *Security → Code scanning*. Das Protokoll nennt keine Funde, es gibt keine Artefakte. Im Pull Request laufen nur Test, Bau und Probe.
    - **Probe:** Bekannte Lücken in festen Versionen (Node.js 18.0.0 bei NVD, lodash 4.17.15 bei Grype) müssen anschlagen, sonst ist der Lauf rot. Rot heißt also „Abgleich ging nicht“, nie „es gibt einen Fund“.
    - Syft und Grype werden mit fester Version aus dem Quelltext gebaut (`.github/werkzeuge/anchore-installieren.sh`, `go install` mit Prüfung gegen sum.golang.org). Bei einem Update von Grype die Syft-Version aus dessen `go.mod` übernehmen.
    - Ohne Schlüssel erlaubt NVD 5 Abfragen je 30 Sekunden, das Werkzeug wartet entsprechend. Mit einem Secret `NVD_API_KEY` (kostenlos bei NVD, unter *Settings → Secrets and variables → Actions*) geht es schneller; nötig ist das nicht.
    - Durchsicht und Zielzeiten: `SECURITY.md`, Abschnitt *Zuständigkeit und Reaktionszeiten*.
- **Gleiche Alpine-Pakete in beiden Varianten** (#1397): Die Stufe `laufzeit` im `Dockerfile` endet mit einem `apk upgrade --no-cache`, das nie aus dem Cache kommt; `komplett` baut darauf auf und hebt nichts mehr eigens. `image-probe` vergleicht je Architektur `/lib/apk/db/installed` von `dms` und `dms-komplett` (`.github/werkzeuge/apk-versionen-vergleichen.sh`, Test daneben) und scheitert, wenn ein gemeinsames Paket in verschiedenen Versionen vorliegt. Die Probe baut mit derselben Tageskennung `APK_TAG` wie `main`, damit die Paketschicht wie dort aus dem Cache kommt.
    - Trivy kommt als Binärdatei mit fester Version und fester Prüfsumme (`.github/werkzeuge/trivy-installieren.sh`), nicht über die trivy-action: Deren Tags wurden 2026 kompromittiert (CVE-2026-33634). Eine neue Version trägt man dort von Hand ein, mit beiden Prüfsummen aus der `checksums.txt` des Releases.
- **Herkunftsnachweis und Stückliste (SBOM):** Jedes veröffentlichte Image bekommt einen signierten Nachweis, aus welchem Commit und welchem Workflow es stammt, und eine Stückliste im SPDX-Format. Beides liegt neben dem Image in der Registry. Prüfen lässt sich das mit:

    ```sh
    gh attestation verify oci://ghcr.io/motom001/dms:stabil -R motom001/dms
    gh attestation verify oci://ghcr.io/motom001/dms:stabil -R motom001/dms --predicate-type https://spdx.dev/Document/v2.3
    ```

- **Bestandteile und Lizenzen im Release-Text** (#1393): Bei einer neuen Version erzeugt `image-zusammen` je Variante und Architektur eine Stückliste mit Trivy und hält Digests und Node-Version fest (Artefakte `bestandteile-dms`, `bestandteile-dms-komplett`). `release.yml` macht daraus mit `.github/werkzeuge/bestandteile.mjs` den Abschnitt *Bestandteile und Lizenzen* im Release-Text und hängt die vollständige Liste als CSV, SPDX und CycloneDX an; verglichen wird mit der CSV am vorigen Release. Was Trivy nicht sieht (Bibliotheken der Oberfläche, Schriften, Handbuch, Node.js), ergänzt das Werkzeug. Holt das `Dockerfile` ein neues Paket mit `apk add` oder kommt eine npm-Abhängigkeit dazu (auch `devDependencies`), braucht sie einen Zweck in `.github/werkzeuge/bestandteile-wozu.json`, und die Seite [Aufbau aus Bestandteilen](bestandteile-aufbau.md) wird mit `node .github/werkzeuge/bestandteile.mjs --handbuch` neu erzeugt (sonst schlägt der Job `stil` fehl, #1412). Jeder Bestandteil trägt Ebene, Herkunft und Einsatz; Werkzeuge für Entwicklung und Test stehen nur in den Anhängen. Fehlen die Daten, erscheint das Release trotzdem, mit Hinweis. Für Betreiber: [Bestandteile und Lizenzen](https://help.ablago.app/admin/aktuell/bestandteile/).

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
| Pinned-Dependencies | 6 | Actions fest, `npm ci` ohne Ausweichen auf `npm install`. Seit #289 auch die Werkzeuge der Handbücher: mkdocs mit allen Abhängigkeiten über `docs/handbuch/requirements.txt` mit Hashes (Image und CI, Dependabot hält sie aktuell), Playwright mit fester Version und eigenem Lockfile in `web/rauchtest/` (`npm ci`, #1272). Bewusst offen: Basis-Images ohne Prüfwert (siehe oben), `FROM laufzeit` (interne Stufe, Fehlalarm), `npm install --package-lock-only` in *Lockfile erzeugen* (erzeugt das Lockfile, Fehlalarm) und die apt-Pakete der Runner. |
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
