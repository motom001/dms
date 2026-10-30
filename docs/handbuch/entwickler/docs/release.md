# Release

Ein Release entsteht, sobald auf `main` eine Versionsnummer steht, für die es noch kein Tag gibt.

1. **Pull Request** mit erhöhter Nummer in `package.json`, `server/package.json`, `web/package.json` und neuen Release-Notizen `docs/releases/v<version>.md`.
2. Nach dem Merge baut **image.yml** das Image nativ für amd64 und arm64. Es legt das Tag `v<version>` an, veröffentlicht das Release mit den Notizen und pusht `ghcr.io/motom001/dms:<version>`.
3. **handbuch.yml** baut alle Handbücher für diese Version (`v<Haupt>.<Neben>`) und legt sie auf dem Branch `gh-pages` ab. `aktuell` zeigt dann auf die neue Version, `entwicklung` folgt weiter `main`. Die Seite *Neu in dieser Version* entsteht aus den Release-Notizen.
4. **[motom001/dms-appstore](https://github.com/motom001/dms-appstore)** übernimmt die neue Version am nächsten Morgen, mit Images per Digest, für Umbrel, ZimaOS und CasaOS. Von Hand geht es sofort über den Workflow *Store aktualisieren*.

## Versionsnummern

- **Neben-Version** (`0.40.0`) für neue Funktionen; das Handbuch bekommt eine eigene Version.
- **Patch** (`0.39.1`) für Korrekturen; das Handbuch der Neben-Version wird überschrieben.
- Ohne neue Nummer: nur das Image `main` und das Handbuch `entwicklung` ändern sich.

## Abhängigkeiten und Sicherheitsupdates

- **Dependabot** (`.github/dependabot.yml`) schlägt jeden Montag Updates vor: kleine Updates (minor, patch) gesammelt in einem PR, Hauptversionen einzeln, dazu GitHub Actions und das Basis-Image. Sicherheitsupdates kommen sofort. Die CI prüft jeden dieser PRs wie jeden anderen; Hauptversionen bitte mit Blick in das Änderungsprotokoll der Bibliothek.
- **`npm audit`** läuft in der CI über alles, was im Image landet (`--omit=dev`). Ab Stufe „hoch“ schlägt die Prüfung fehl. Ist eine Meldung für das DMS nachweislich ohne Wirkung, wird das im PR begründet.
- **`package-lock.json`** hält die genauen Versionen fest; CI und Image installieren mit `npm ci`. Ändert sich eine `package.json` ohne passende Lockfile, legt der Workflow *Lockfile erzeugen* eine neue auf den Branch `werkzeug/lockfile`; von dort wird sie mit einem normalen Commit übernommen.
- **Sicherheitskorrektur = Patch-Release** mit dem Hinweis „Sicherheitsupdate – bitte aktualisieren“ in den Release-Notes. Meldungen von außen laufen vertraulich, siehe [`SECURITY.md`](https://github.com/motom001/dms/blob/main/SECURITY.md).
