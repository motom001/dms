art: patch

## Behoben

- **Gleiche Alpine-Pakete in beiden Images** (#1397): `dms` bekam Korrekturen aus Alpine bisher bis zu einen Tag später als `dms-komplett`. Jetzt holen beide bei jedem Bau dieselben, aktuellen Pakete; die CI vergleicht die Paketlisten beider Varianten.
- **`:latest` zeigt auf die neueste Version** (#1398): Das Image-Tag `:latest` von `dms` und `dms-komplett` stand noch auf Version 0.8.0. Es wandert jetzt mit jedem Release auf die zuletzt veröffentlichte Version. Wer ohne Tag lädt (`docker pull ghcr.io/motom001/dms`), bekommt damit eine aktuelle Version. Die Vorlagen nutzen weiter `:stabil`; das Administratorhandbuch erklärt unter *Aktualisieren und Sichern* alle vier Tags und den Unterschied zur Markierung „Latest“ bei GitHub.
