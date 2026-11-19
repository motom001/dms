# Bestandteile und Lizenzen

Ablago besteht nicht nur aus eigenem Code: Im Image stecken Alpine Linux mit einigen Systemprogrammen, Node.js, Bibliotheken aus npm, Schriften und das Offline-Handbuch. Welche das in einer Version genau sind, mit Version, Lizenz und Quelle, steht bei jedem [Release](https://github.com/motom001/dms/releases) – zum Nachlesen, für deine eigene Dokumentation oder für eine Prüfung im Betrieb.

!!! note "Keine rechtliche Bewertung"
    Die Liste ist eine technische Auflistung, automatisch erzeugt. Sie sagt, was im Image steckt und welche Lizenz die Pakete angeben – nicht, was das für deinen Einsatz bedeutet. Ablago selbst steht unter der Apache-Lizenz 2.0 ([`LICENSE`](https://github.com/motom001/dms/blob/main/LICENSE), [`NOTICE`](https://github.com/motom001/dms/blob/main/NOTICE)).

## Wo du die Liste findest

**Im Text jedes Releases** steht der Abschnitt *Bestandteile und Lizenzen* – eine Übersicht:

- **Stand:** Version, Datum, Commit und die Digests beider Images (`dms` und `dms-komplett`), je Architektur (amd64, arm64) und für den gemeinsamen Index.
- **Geändert gegenüber der Vorversion:** zuerst Bestandteile mit **geänderter Lizenz**, dann neue, entfernte und solche mit neuer Version.
- **Lizenzen:** wie viele Bestandteile welche Lizenz tragen, je Lizenz zum Aufklappen mit den Namen (direkt eingebundene fett). Einzeln aufgeführt sind die mit **besonderen Pflichten** (Copyleft, z. B. GPL, LGPL, MPL) – mit dem Paket, über das sie kommen, und dem Verweis auf den Quelltext – und die **ohne erkannte Lizenz**.
- **Direkt eingebundene Bibliotheken und Systemprogramme:** wozu jede da ist und wie viele Pakete sie mitbringt.
- Gezählt wird nur, was **im Image** steckt. Werkzeuge für Entwicklung und Test stehen nur in den Anhängen.

**Als Anhänge** am Release liegt die vollständige Liste, jeder Bestandteil mit Quelle:

| Datei | Format | Für |
| --- | --- | --- |
| [`ablago-bestandteile.csv`](https://github.com/motom001/dms/releases/latest/download/ablago-bestandteile.csv) | CSV (Komma, UTF-8) | Tabellenkalkulation, eigene Dokumentation |
| [`ablago-bestandteile.spdx.json`](https://github.com/motom001/dms/releases/latest/download/ablago-bestandteile.spdx.json) | SPDX 2.3 | Werkzeuge für Lizenzen und Stücklisten |
| [`ablago-bestandteile.cdx.json`](https://github.com/motom001/dms/releases/latest/download/ablago-bestandteile.cdx.json) | CycloneDX 1.5 | Werkzeuge für Stücklisten und Sicherheitslücken (z. B. Dependency-Track) |

Die Links in der Tabelle führen immer zur **stabilen Version** (`:stabil`) – bei GitHub ist das das Release mit der Markierung *Latest*. Für eine bestimmte Version ersetzt du `latest/download` durch `download/v<Version>`, z. B. `…/releases/download/v0.291.0/ablago-bestandteile.csv`. Releases von vor dieser Funktion haben keine Anhänge; bis die erste Version mit Liste stabil ist, führen die Links ins Leere.

Die Spalten der CSV: *Art*, *Name*, *Version*, *Lizenz*, *Varianten* (`dms`, `dms-komplett`), *Architekturen*, *Herkunftspaket* (bei Alpine das Quellpaket, aus dem das Paket gebaut ist), *Quelle* und, seit #1412, der Baum:

- *Ebene:* 0 = Ablago selbst, 1 = direkt eingebunden, 2 und mehr = mitgebracht.
- *Eingebracht durch:* die Pakete der Ebene 1, über die ein mitgebrachtes Paket kommt, z. B. `poppler-utils` oder `fastify`. Alpine-Pakete, die keins der eigens installierten Programme braucht, kommen mit dem *Basis-Image (node, Alpine)*.
- *Einsatz:* **Betrieb** = im Image; **Entwicklung** und **Test** = nur zum Bauen und Prüfen, **nicht im Image** (dann sind *Varianten* und *Architekturen* leer).
- *Zweck:* bei Ebene 1, wozu das Paket da ist.

In SPDX stehen die Abhängigkeiten als Beziehungen `DEPENDS_ON` (Werkzeuge der Ebene 1 als `DEV_DEPENDENCY_OF` bzw. `TEST_DEPENDENCY_OF`), in CycloneDX unter `dependencies`, Werkzeuge mit `scope: excluded`. So zeigt ein Prüfwerkzeug wie Dependency-Track, über welches Paket eine Sicherheitslücke hereinkommt. Wie Ablago aufgebaut ist, Paket für Paket: [Aufbau aus Bestandteilen](https://help.ablago.app/entwickler/aktuell/bestandteile-aufbau/) im Entwicklerhandbuch.

## Was drinsteht

| Art | Woher | Beispiele |
| --- | --- | --- |
| Alpine-Paket, Schrift (Alpine) | Stückliste des fertigen Images (Trivy) | busybox, poppler-utils, qpdf, font-liberation, in `dms-komplett` PostgreSQL |
| npm (Server) | Stückliste des fertigen Images (Trivy) | Fastify, nodemailer, pdf-lib |
| Ablago selbst | Stückliste und Repository | Server, Weboberfläche, der Commit des Releases |
| Laufzeit | Node-Version aus dem Image | Node.js |
| npm (Oberfläche) | `package-lock.json` | React, qrcode – im Image zu einer Datei gebündelt, daher für Trivy unsichtbar |
| Schrift, Oberfläche | Repository | Noto Sans und Noto Sans Mono (eigene PDFs), Lucide (Symbole) |
| Handbuch | Repository | Texte und Bilder des Offline-Handbuchs, Material for MkDocs |
| npm (Werkzeug) | `package-lock.json`, `web/rauchtest/package-lock.json` | TypeScript, Vite, ESLint, Playwright – nur Entwicklung und Test, nicht im Image |

Zwei Grenzen:

- **Bibliotheken der Oberfläche** stammen aus der `package-lock.json`, nicht aus dem fertigen Bündel. Die Liste kann deshalb etwas zu viel enthalten (z. B. Teile einer Bibliothek, die nur auf der Kommandozeile gebraucht werden), aber nichts auslassen, was eingebunden ist.
- **Lizenzen** übernimmt die Liste so, wie die Pakete sie angeben. Wo ein Paket keine angibt, steht *ohne erkannte Lizenz*. Den Quelltext eines Alpine-Pakets findest du über den Verweis auf pkgs.alpinelinux.org (Herkunftspaket und Zweig von Alpine); von dort führt ein Link zum Bauskript in aports.

## Wie die Liste entsteht

Bei jeder neuen Version, nachdem beide Images gebaut und zusammengeführt sind:

1. **Stückliste je Image und Architektur:** Trivy liest die fertigen Images aus der Registry (`dms` und `dms-komplett`, je amd64 und arm64), dazu kommen die Digests und die Node-Version aus dem Image.
2. **Ergänzungen:** was Trivy nicht sehen kann – die Bibliotheken der Oberfläche, Schriften, das Offline-Handbuch und Ablago selbst.
3. **Baum:** Ebene und Herkunft für npm aus den Lockfiles, für Alpine aus der Paketdatenbank im Image (Beziehungen in der Stückliste von Trivy); der Zweck der direkt eingebundenen Pakete aus `bestandteile-wozu.json`.
4. **Zusammenführen und vergleichen:** Gleiche Bestandteile aus allen Varianten und Architekturen werden zu einer Zeile; verglichen wird mit der CSV am vorigen Release, nur was im Image steckt.
5. **Release:** Die Übersicht kommt in den Release-Text, die drei Dateien als Anhänge.

Das Werkzeug dafür liegt im Repository unter [`.github/werkzeuge/bestandteile.mjs`](https://github.com/motom001/dms/blob/main/.github/werkzeuge/bestandteile.mjs), wozu die Systemprogramme und die direkt eingebundenen Bibliotheken da sind unter [`bestandteile-wozu.json`](https://github.com/motom001/dms/blob/main/.github/werkzeuge/bestandteile-wozu.json). Lässt sich die Liste einmal nicht erzeugen, erscheint das Release trotzdem – mit einem Hinweis an der Stelle der Übersicht.

## Nachprüfen

Übersicht und Anhänge sind eine **lesbare Ansicht**. Den Nachweis liefert das **signierte Attest** am Image: der Herkunftsnachweis (aus welchem Commit und welchem Workflow das Image stammt) und eine Stückliste im SPDX-Format. Beides liegt neben dem Image in der Registry, siehe auch [Woher kommt das Image?](aktualisieren.md).

**Herkunft und signierte Stückliste**, über den Digest des **Index** (Zeile *alle (Index)* im Abschnitt *Stand*). Das Attest hängt am Index, nicht an den Digests je Architektur; mit dem Digest für amd64 oder arm64 meldet `gh` „no attestations found“. Jedes Image hat sein eigenes Attest:

```sh
gh attestation verify oci://ghcr.io/motom001/dms@sha256:<Digest des Index> -R motom001/dms
gh attestation verify oci://ghcr.io/motom001/dms@sha256:<Digest des Index> -R motom001/dms \
  --predicate-type https://spdx.dev/Document/v2.3
gh attestation verify oci://ghcr.io/motom001/dms-komplett@sha256:<Digest des Index> -R motom001/dms
```

Die signierte Stückliste am Image deckt die Systempakete und die npm-Pakete des Servers ab, so wie Trivy sie für amd64 erkennt. Die Ergänzungen (Oberfläche, Schriften, Handbuch) und die Liste für arm64 stehen in den Anhängen. Sie entstehen im selben Lauf aus demselben Commit und tragen einen **eigenen Herkunftsnachweis**. Lade die Datei vom Release herunter und prüfe sie:

```sh
gh attestation verify ablago-bestandteile.csv -R motom001/dms
gh attestation verify ablago-bestandteile.spdx.json -R motom001/dms
gh attestation verify ablago-bestandteile.cdx.json -R motom001/dms
```

Der Nachweis nennt Workflow und Commit des Releases. Wird ein Release neu erzeugt, bekommen die neuen Dateien einen neuen Nachweis.

**Unabhängig:** Lade das Image über den Digest in einer abgeschotteten Testumgebung, erzeuge selbst eine Stückliste und vergleiche sie mit dem Anhang – mit Trivy oder einem anderen Werkzeug wie Syft:

```sh
trivy image --platform linux/arm64 --format spdx-json ghcr.io/motom001/dms@sha256:<Digest>
syft ghcr.io/motom001/dms@sha256:<Digest> --platform linux/arm64 -o spdx-json
```

Andere Werkzeuge erkennen Lizenzen und Pakete etwas anders; kleine Abweichungen bei der Schreibweise von Lizenzen sind normal.

## Quelltext

- **Ablago:** das Repository [motom001/dms](https://github.com/motom001/dms); der genaue Stand eines Releases über den Commit im Abschnitt *Stand*.
- **Alpine-Pakete:** über den Verweis *Quelltext* in der Übersicht bzw. die Spalte *Quelle* (pkgs.alpinelinux.org, von dort zu den Quellen in aports).
- **Node.js:** Quelltext-Archiv der Version unter [nodejs.org](https://nodejs.org/dist/).
- **npm-Pakete:** die Seite des Pakets auf npmjs.com, von dort zum Repository des Pakets.
