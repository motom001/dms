# Sicherheit

**Deutsch** · [English](SECURITY.en.md)

## Eine Sicherheitslücke melden

Bitte **kein öffentliches Issue** für Sicherheitslücken. Melde sie vertraulich über GitHub: **Security → Report a vulnerability** in diesem Repository ([Private Vulnerability Reporting](https://github.com/motom001/dms/security/advisories/new)). Meldungen auf Deutsch oder Englisch sind willkommen.

Hilfreich sind: betroffene Version (Werkbank → Technik), Schritte zum Nachstellen, was jemand damit erreichen kann. Wir melden uns, sobald wir die Meldung gesehen haben, und veröffentlichen eine Korrektur als Patch-Release mit Hinweis in den Release-Notes.

## Unterstützte Versionen

Korrekturen gibt es für die **neueste Version**. Aktualisiere bitte zuerst, bevor du meldest – siehe [Aktualisieren](https://motom001.github.io/dms/admin/aktuell/aktualisieren/).

## Was automatisch geprüft wird

| Was | Womit | Wann |
| --- | --- | --- |
| Unser Code (TypeScript, Workflows) | CodeQL | jeder Pull Request, jeder Push auf `main` |
| Bibliotheken | Dependabot (Warnungen und Updates), `npm audit` ab Stufe „hoch“ | jeder Pull Request, wöchentlich |
| Images `dms` und `dms-komplett` | Trivy: kritische Lücken mit Korrektur blockieren den Pull Request | jeder Pull Request, jede Veröffentlichung, wöchentlicher Neubau |
| Geheimnisse (Tokens, Passwörter) | Secret Scanning mit Push-Schutz | jeder Push |
| Arbeitsweise des Projekts | [OpenSSF Scorecard](https://scorecard.dev/viewer/?uri=github.com/motom001/dms) | wöchentlich, jeder Push auf `main` |

Die Funde stehen unter **Security** in diesem Repository. Bewusst hingenommene Funde der Image-Prüfung stehen mit Begründung in [`.trivyignore`](.trivyignore).

## Herkunft der Images prüfen

Jedes veröffentlichte Image trägt einen signierten **Herkunftsnachweis** (aus welchem Commit, mit welchem Workflow gebaut) und eine **Stückliste** (SBOM, SPDX). Prüfen mit der [GitHub-Kommandozeile](https://cli.github.com/):

```sh
gh attestation verify oci://ghcr.io/motom001/dms:<version> -R motom001/dms
gh attestation verify oci://ghcr.io/motom001/dms-komplett:<version> -R motom001/dms
```

Wie das im Einzelnen gebaut ist, steht im [Entwicklerhandbuch](https://motom001.github.io/dms/entwickler/aktuell/release/#abhangigkeiten-und-sicherheitsupdates).
