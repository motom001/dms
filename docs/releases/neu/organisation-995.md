art: minor

## Neu

- **Eigene Organisation** (#995): Name, Anschrift, Kontakt und die Verantwortlichen im Sinne der DSGVO pflegst du einmal – an der Organisation in der Ablage mit dem Haken „Eigene Organisation“ (Paket Basis ab 1.7.0). Werkbank → Benutzer und Sicherheit → Eigene Organisation verweist darauf, zeigt nur Name, Anschrift, E-Mail, Telefon, Verantwortlichen und Datenschutzbeauftragten und bei mehreren eine Wahl „für Auskünfte und Unterlagen gilt …“. Den Haken setzt nur, wer die eigene Organisation im Verwaltungsmodus verwaltet oder eine dafür freigegebene Rolle hat (sonst 403, auch über die Schnittstelle); jede Änderung steht im Systemprotokoll und kommt als Notiz an die Verwaltung. Paketformat: `merkmal: eigeneOrganisation`, `schreibschutz: verwaltung` und die Anzeige-Bedingung „zeigt auf eine eigene Organisation“.

## Geändert

- **Datenschutz-Auskunft und Löschkonzept** (#995) nehmen den Verantwortlichen von der eigenen Organisation; die bisherige Angabe in den Einstellungen der Auskunft lässt sich als eigene Organisation übernehmen und gilt bis dahin weiter. Die Erkennung nimmt die eigene Organisation nie als Absender eingehender Post.
