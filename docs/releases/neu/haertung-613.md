art: patch

## Sicherheit

- **Netz der Pakete**: Adressen mit kodiertem Schrägstrich im Pfad (`%2F`, `%5C`) lehnt Ablago ab. So kann ein Paket nicht über einen Dienst, der `%2F` entschlüsselt, aus seinem freigegebenen Pfad ausbrechen. Antworten liest Ablago Stück für Stück und bricht ab, sobald die Grenze von 10 MB überschritten ist, statt sie erst ganz in den Speicher zu laden.
- **Gesundheitsprüfung**: Die Kennung `stand` in `/api/gesundheit` enthält jetzt einen Zufallswert der Installation. Sie lässt sich von außen nicht mehr einer Version zuordnen; „neue Version, bitte neu laden“ funktioniert wie bisher.
