# Sicherheit

**Deutsch** · [English](SECURITY.en.md)

## Eine Sicherheitslücke melden

Bitte **kein öffentliches Issue** für Sicherheitslücken. Melde sie vertraulich über GitHub: **Security → Report a vulnerability** in diesem Repository ([Private Vulnerability Reporting](https://github.com/motom001/dms/security/advisories/new)). Meldungen auf Deutsch oder Englisch sind willkommen.

Geht das nicht (z. B. ohne GitHub-Konto), schreib an **[security@ablago.app](mailto:security@ablago.app)**. Unsere Angaben nach RFC 9116 stehen unter [ablago.app/.well-known/security.txt](https://ablago.app/.well-known/security.txt).

Hilfreich sind: betroffene Version (Werkbank → Technik), Schritte zum Nachstellen, was jemand damit erreichen kann. Wir melden uns, sobald wir die Meldung gesehen haben, und veröffentlichen eine Korrektur als Patch-Release mit Hinweis in den Release-Notes.

## Unterstützte Versionen

Korrekturen gibt es für die **neueste Version**. Aktualisiere bitte zuerst, bevor du meldest – siehe [Aktualisieren](https://help.ablago.app/admin/aktuell/aktualisieren/).

Die Vorlagen nutzen das Image-Tag **`:stabil`** (#714). Es wandert nur auf ein Release – Versionsnummer, Release-Notes, beide Images gebaut und mit Herkunftsnachweis, Update-Test vom bisherigen `:stabil` grün – und zwar einmal pro Woche im Workflow *:stabil befördern* (#907). Sicherheitskorrekturen müssen darauf nicht warten: Mit dem Label `sofort-stabil` am Pull Request wandert `:stabil` direkt nach dem Release, mit denselben Prüfungen. Hat eine stabile Version einen schweren Fehler, setzt der Maintainer `:stabil` über den Workflow *:stabil zurücksetzen* auf eine andere veröffentlichte Version; starten kann ihn nur, wer Schreibrecht am Repository hat.

## Was automatisch geprüft wird

| Was | Womit | Wann |
| --- | --- | --- |
| Unser Code (TypeScript, Workflows) | CodeQL | jeder Pull Request, jeder Push auf `main` |
| Bibliotheken | Dependabot (Warnungen und Updates), `npm audit` ab Stufe „hoch“ | jeder Pull Request, wöchentlich |
| Images `dms` und `dms-komplett` | Trivy: kritische Lücken mit Korrektur blockieren den Pull Request | jeder Pull Request, jede Veröffentlichung, wöchentlicher Neubau |
| Ausgelieferte Images `:stabil` und `:latest` (beide Varianten) | Grype als zweite, von Trivy unabhängige Datenbank; dazu ein direkter Abgleich der Versionen von poppler, qpdf, Node.js und PostgreSQL mit [NVD](https://nvd.nist.gov/), auch wenn Alpine den Fall noch nicht führt | wöchentlich (mittwochs), Workflow *Sicherheitsabgleich* |
| Geheimnisse (Tokens, Passwörter) | Secret Scanning mit Push-Schutz | jeder Push |
| Arbeitsweise des Projekts | [OpenSSF Scorecard](https://scorecard.dev/viewer/?uri=github.com/motom001/dms) | wöchentlich, jeder Push auf `main` |

Die Funde stehen unter **Security** in diesem Repository; diese Liste sehen nur Personen mit Schreibrecht. Bewusst hingenommene Funde der Image-Prüfung stehen mit Begründung in [`.trivyignore`](.trivyignore), die übrigen schließt der Maintainer im Sicherheits-Reiter mit Begründung.

## Zuständigkeit und Reaktionszeiten

**Zuständig** ist der Maintainer (Thomas Meissner). Er sieht die Funde im Sicherheits-Reiter nach jedem wöchentlichen Abgleich durch und bestätigt vertrauliche Meldungen innerhalb von **3 Tagen**.

Jeder Fund wird zuerst **für Ablago** bewertet: Die Schwere eines Bestandteils ist der Ausgangspunkt, entscheidend ist, wie Ablago ihn nutzt – etwa ob ein Programm Dateien von außen verarbeitet. Danach gelten diese Fristen (Kalendertage):

| Schwere für Ablago | Bewertet nach | Korrektur oder Eindämmung nach |
| --- | --- | --- |
| kritisch | 1 Tag | 3 Tagen, mit `sofort-stabil` |
| hoch | 3 Tagen | 14 Tagen, mit `sofort-stabil`, wenn die Lücke in Ablago ausnutzbar ist |
| mittel | 7 Tagen | mit dem nächsten `:stabil`, spätestens nach 30 Tagen |
| niedrig | 14 Tagen | spätestens nach 90 Tagen, oder bewusst hingenommen mit Begründung |

Gibt es bei Alpine oder beim Hersteller noch keine Korrektur, schränkt Ablago das betroffene Programm ein oder baut es selbst mit der Korrektur. Einzelheiten zu einer offenen Lücke werden erst mit der Korrektur öffentlich; die Release-Notes nennen dann die CVE-Nummer.

## Herkunft der Images prüfen

Jedes veröffentlichte Image trägt einen signierten **Herkunftsnachweis** (aus welchem Commit, mit welchem Workflow gebaut) und eine **Stückliste** (SBOM, SPDX). Prüfen mit der [GitHub-Kommandozeile](https://cli.github.com/):

```sh
gh attestation verify oci://ghcr.io/motom001/dms:<version> -R motom001/dms
gh attestation verify oci://ghcr.io/motom001/dms-komplett:<version> -R motom001/dms
```

Wie das im Einzelnen gebaut ist, steht im [Entwicklerhandbuch](https://help.ablago.app/entwickler/aktuell/release/#abhangigkeiten-und-sicherheitsupdates).

## Herkunft der Pakete prüfen

Das Ablago-Projekt signiert den offiziellen Paketkatalog ([dms-registry](https://github.com/motom001/dms-registry)) mit Ed25519. Ablago prüft die Signatur mit diesen beiden öffentlichen Schlüsseln des Maintainers (fest im Code, `server/src/pakete/projektschluessel.ts`); gültig ist eine Signatur mit einem der beiden:

| Schlüssel | Kennung | Fingerabdruck (SHA-256 des öffentlichen Schlüssels) |
| --- | --- | --- |
| Signierschlüssel (CI der Registry) | `6d868387314e64df` | `6d86 8387 314e 64df 715c a3bd 9856 58d5 f888 c0ea 7cab ac91 a43f 9b99 6052 e728` |
| Reserveschlüssel (offline beim Maintainer) | `4543c81b5ccf522d` | `4543 c81b 5ccf 522d f5a3 5e76 6660 8774 5f6c ae42 4722 3b6d 91c9 63cc 34b0 3954` |

> **Versionen 0.141.0 bis 0.144.1** kennen nur Testschlüssel, deren private Gegenstücke offen in den Tests stehen. Sobald die Registry mit den Schlüsseln oben signiert, melden sie beim offiziellen Katalog „Signatur ungültig“. Aktualisiere auf eine neuere Version. Die Fingerabdrücke prüfst du in der Registry mit `python3 werkzeuge/signieren.py fingerabdruck signier.pub`; die öffentlichen Schlüssel stehen in [motom001/dms-registry#74](https://github.com/motom001/dms-registry/issues/74).

Was „signiert“ und „nicht signiert“ in der Vorschau bedeutet, steht im [Administrationshandbuch](https://help.ablago.app/admin/aktuell/pakete/#herkunft-signiert-oder-nicht).
