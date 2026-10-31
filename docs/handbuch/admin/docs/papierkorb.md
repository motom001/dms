# Papierkorb

Gelöschte Mappen kommen in den Papierkorb – samt Dokumenten und Verweisen. Nach der eingestellten Aufbewahrung löscht das DMS sie endgültig.

- In der **Ablage** sieht jeder Benutzer unter *Papierkorb* nur, was **er selbst** gelöscht hat, und kann es wiederherstellen oder endgültig löschen. Der Eintrag steht oben bei den festen Einträgen unter *Favoriten* – aber nur, solange der Papierkorb eingeschaltet ist oder noch etwas darin liegt.
- Unter **Werkbank → Papierkorb** siehst du als Administrator alles, mit „gelöscht von“, und kannst jede Mappe wiederherstellen oder endgültig löschen.

![Werkbank → Papierkorb](bilder/werkbank-papierkorb.png)

## Aufbewahrung

Rechts unter **Aufbewahrung** stellst du ein, wie viele Tage gelöschte Mappen bleiben (Standard: 30). Das DMS räumt stündlich auf.

**0 Tage schaltet den Papierkorb aus:** Löschen ist dann sofort endgültig, wie vor Version 0.11. Was gerade im Papierkorb liegt, wird beim Speichern endgültig gelöscht – die Werkbank fragt vorher nach.

Jeder Benutzer kann in seinem Profil einstellen, dass sein Papierkorb **beim Abmelden geleert** wird.

### Historie endgültig gelöschter Mappen

Jede Mappe hat eine **Historie** (wer wann was geändert hat). Wird eine Mappe endgültig gelöscht, bleibt ihre Historie noch eine Weile in der Datenbank, damit sich nachvollziehen lässt, was mit ihr geschah. Wie lange, stellst du darunter unter **Historie endgültig gelöschter Mappen behalten** ein (Standard: 365 Tage; 0 löscht es sofort mit). Die Historie lebender Mappen bleibt immer.

## Was im Papierkorb gilt

- Mappen im Papierkorb erscheinen nirgends sonst: nicht in Ansichten, Zählern, Suche, Verweisauswahl oder der API.
- Sie blockieren keine **eindeutigen Werte**: Eine neue Mappe darf dieselbe Rechnungsnummer bekommen.
- Wie bisher lässt sich eine Mappe, auf die noch andere verweisen, gar nicht erst löschen.
- **Wiederherstellen** bringt Dokumente und Verweise zurück. Verweise auf Mappen, die es inzwischen nicht mehr gibt, entfallen. Ist ein eindeutiger Wert inzwischen vergeben, landet die Mappe bei dem, der sie angelegt hat, unter **Zu erledigen**.
- Ein Mappentyp lässt sich nicht löschen, solange Mappen von ihm im Papierkorb liegen.
- Mappen eines Mappentyps im [Archivmodus](archiv.md) bleiben im Papierkorb, bis ihre Aufbewahrungsfrist endet – auch wenn die Aufbewahrung des Papierkorbs vorher abläuft. Endgültig löschen lassen sie sich vorher nicht, auch nicht als Administrator.
- Die Dateien bleiben im Dateiordner, bis der Papierkorb geleert ist.

!!! note "Sofort endgültig"
    Einzeln gelöschte **Dokumente** und **Werkbank → Demo-Daten → entfernen** gehen nicht über den Papierkorb.

## Benutzer und Rollen

Rollen gehen wie andere Mappen in den Papierkorb; ihre Zuordnung zu Benutzern entfällt beim Löschen.

Wer eine **Einladung** löscht (ein Benutzer, der sich noch nie angemeldet hat), legt dessen Mappe in den Papierkorb; der Benutzer ist bis dahin **deaktiviert**. Erst beim Leeren wird das Konto gelöscht; **Wiederherstellen** aktiviert es wieder.
