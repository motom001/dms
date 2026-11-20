art: patch

## Behoben

- **Texterkennung: kein Dokument bleibt mehr auf „wartet“ stehen** (#1525): Ging der Anstoß nach dem Hochladen ins Leere – etwa weil das Dokument im selben Moment als Anlage angehängt wurde und die Warteschlange es deshalb übersprang –, blieb es bis zum nächsten Neustart auf *wartet*. Jetzt sieht Ablago zusätzlich alle 30 Sekunden nach, ob noch Dokumente warten, und bearbeitet sie.
- **Post aus dem Postfach: Datum kurz nach Mitternacht** (#1526): Eine Mail, die kurz nach Mitternacht ankommt, bekam als Datum der Post den Vortag, wenn der Server in UTC läuft (z. B. im Container). Das Datum gilt jetzt in der Zeitzone der Region (*Werkbank → Einstellungen → Region*). Bestehende Post bleibt unverändert.

## Technik

- **Test „HEAD/GET“ der Auskunft ohne feste Wartezeit** (#1527): Der Test wartet auf den Stand (gelöscht, in der Historie) statt fest 50 ms.
