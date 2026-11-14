# Papierkorb

Gelöschte Mappen kommen in den Papierkorb – samt Dokumenten und Verweisen. Einzeln gelöschte **Dokumente** auch, mit allen Versionen und dem Volltext. Nach der eingestellten Aufbewahrung löscht Ablago sie endgültig.

- In der **Ablage** sieht jeder Benutzer unter *Papierkorb* nur, was **er selbst** gelöscht hat, und kann es wiederherstellen oder endgültig löschen. Der Eintrag steht oben bei den festen Einträgen unter *Favoriten* – aber nur, solange der Papierkorb eingeschaltet ist oder noch etwas darin liegt.
- Unter **Werkbank → Papierkorb** siehst du als Administrator alles, mit „gelöscht von“: oben **Papierkorb leeren** und eine Zeile, wie lange Gelöschtes bleibt, darunter Suche, Filter und die gelöschten Mappen und Dokumente. Wählst du eine Mappe, steht sie rechts – dort stellst du sie wieder her oder löschst sie endgültig.
- **Suchen, filtern, mehrere auf einmal:** Das Suchfeld findet Titel und Dateinamen; filtern lässt sich nach *Art* (Mappen oder Dokumente), *Mappentyp*, *gelöscht von* und wann gelöscht. Mit den Haken vor den Einträgen (oder **Alle auswählen**) gelten **Wiederherstellen (n)** und **Endgültig löschen (n)** für alle gewählten – eins nach dem anderen, Mappen vor Dokumenten; was nicht ging, bleibt ausgewählt und steht mit Grund darüber. In der Ablage geht das genauso, ohne „gelöscht von“.

![Werkbank → Papierkorb](bilder/werkbank-papierkorb.png)

## Aufbewahrung

Unter **Werkbank → Daten sichern → [Einstellungen](daten-einstellungen.md#papierkorb)** stellst du im Abschnitt **Papierkorb** ein, wie viele Tage gelöschte Mappen und Dokumente bleiben (Standard: 30). Im Papierkorb selbst steht nur eine Zeile dazu mit Link dorthin; oben leert **Papierkorb leeren** alles auf einmal. Sofort endgültig ist nur das Entfernen der [Demo-Daten](demo.md). Ablago räumt stündlich auf.

**0 Tage schaltet den Papierkorb aus:** Löschen ist dann sofort endgültig, wie vor Version 0.11. Was gerade im Papierkorb liegt, wird beim Speichern endgültig gelöscht – die Werkbank fragt beim Speichern vorher nach.

Jeder Benutzer kann unter Mein Konto einstellen, dass sein Papierkorb **beim Abmelden geleert** wird.

### Historie endgültig gelöschter Mappen

Jede Mappe hat eine **Historie** (wer wann was geändert hat). Wird eine Mappe endgültig gelöscht, bleibt ihre Historie noch eine Weile in der Datenbank, damit sich nachvollziehen lässt, was mit ihr geschah. Wie lange, stellst du darunter unter **Historie endgültig gelöschter Mappen behalten** ein (Standard: 365 Tage; 0 löscht es sofort mit). Die Historie lebender Mappen bleibt immer – mit allen Arten von Einträgen, auch den Abrufen; keine Art wird früher gelöscht (#800).

## Was im Papierkorb gilt

- Mappen im Papierkorb erscheinen nirgends sonst: nicht in Ansichten, Zählern, Suche, Verweisauswahl oder der API.
- Sie blockieren keine **eindeutigen Werte**: Eine neue Mappe darf dieselbe Rechnungsnummer bekommen.
- Wie bisher lässt sich eine Mappe, auf die noch andere verweisen, gar nicht erst löschen.
- **Wiederherstellen** bringt Dokumente und Verweise zurück. Verweise auf Mappen, die es inzwischen nicht mehr gibt, entfallen. Ist ein eindeutiger Wert inzwischen vergeben, landet die Mappe bei dem, der sie angelegt hat, unter **Zu erledigen**.
- **Mit verknüpften Mappen löschen** ([Benutzerhandbuch](https://help.ablago.app/benutzer/aktuell/mappen/#mit-verknupften-mappen-loschen)) legt alle Mappen als **einen Vorgang** in den Papierkorb. Sie lassen sich gemeinsam wiederherstellen (**Alle wiederherstellen**) – mit den Verweisen untereinander (auch im Kreis) und den Verweisen, die an bleibenden Mappen entfernt wurden. Einzeln geht es auch; dann kommen nur die Verweise dieser einen Mappe zurück.
- **Aufgelöste Post** (#936, #934): Legt jemand aus einer Post eine neue Mappe an oder legt sie in eine vorhandene, wandern Dokumente, Historie, Notizen, Aufgaben und Erinnerungen der Post in die Mappe, und die leere Post kommt in den Papierkorb – mit „Aufgelöst in *Typ* „Titel““ und Link zur Mappe ([Benutzerhandbuch](https://help.ablago.app/benutzer/aktuell/post/#post-auflosen)). Wiederherstellen lässt sie sich nicht (auch nicht in der Werkbank); war die Mappe dabei neu, ist der Weg zurück, sie zu löschen. Das darf nur, wer die Post auch löschen darf (Recht *Löschen* am Mappentyp *Post*); sonst bleibt die Post wie bisher zugeordnet stehen. Nur zugeordnet wird außerdem über die Schnittstelle mit `kopieren` (in der Oberfläche gibt es „Kopie in der Post behalten“ seit #1217 nicht mehr), beim automatischen Zuordnen und bei versendeten E-Mails.
- Ein Mappentyp lässt sich nicht löschen, solange Mappen von ihm im Papierkorb liegen.
- Mappen eines Mappentyps im [Archivmodus](archiv.md) bleiben im Papierkorb, bis ihre Aufbewahrungsfrist endet – auch wenn die Aufbewahrung des Papierkorbs vorher abläuft. Endgültig löschen lassen sie sich vorher nicht, auch nicht als Administrator.
- Die Dateien bleiben im Dateiordner, bis der Papierkorb geleert ist.
- Jeder Schritt – in den Papierkorb, wiederhergestellt, endgültig gelöscht (von Hand, geleert oder nach Ablauf) – steht im [Löschprotokoll](datenschutz.md#loschprotokoll), ohne Titel und Inhalte.

## Einzelne Dokumente

- Ein aus einem Register gelöschtes Dokument zieht samt **allen Versionen** und **Volltext** in den Papierkorb. Es erscheint nicht mehr in der Mappe, in der Suche oder in der API – bis es wiederhergestellt ist.
- Die Liste zeigt es unter **Dokumente** mit Mappe, Register, Größe und wer es wann gelöscht hat.
- **Wiederherstellen** legt es in dasselbe Register derselben Mappe zurück; die Historie der Mappe hält „Dokument in den Papierkorb“ und „Dokument wiederhergestellt“ fest. In der Ablage darf das, wer es gelöscht hat und die Mappe noch bearbeiten darf; in der Werkbank jeder Administrator.
- Liegt die Mappe selbst im Papierkorb, kommt zuerst die Mappe zurück; gibt es sie nicht mehr, lässt sich das Dokument nur noch endgültig löschen. Wird eine Mappe endgültig gelöscht, gehen ihre einzeln gelöschten Dokumente mit.
- Aufbewahrung, **Papierkorb leeren** und 0 Tage gelten für Dokumente genauso. Der [Archivmodus](archiv.md) sperrt das Löschen eines Dokuments wie bisher schon vorher.
- Sicherung und Wiederherstellung enthalten den Papierkorb; der [Vollexport](export.md) listet die Dokumente im Papierkorb in `papierkorb-dokumente.jsonl`.

!!! note "Sofort endgültig"
    **Werkbank → Demo-Daten → entfernen** geht nicht über den Papierkorb.

## Benutzer und Rollen

Rollen gehen wie andere Mappen in den Papierkorb; ihre Zuordnung zu Benutzern entfällt beim Löschen.

Wer eine **Einladung** löscht (ein Benutzer, der sich noch nie angemeldet hat), legt dessen Mappe in den Papierkorb; der Benutzer ist bis dahin **deaktiviert**. Erst beim Leeren wird das Konto gelöscht; **Wiederherstellen** aktiviert es wieder.
