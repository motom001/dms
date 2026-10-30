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
