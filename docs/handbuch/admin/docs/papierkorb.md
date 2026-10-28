# Papierkorb

Gelöschte Mappen kommen in den Papierkorb – samt Dokumenten und Verweisen. Nach der eingestellten Aufbewahrung löscht das DMS sie endgültig.

- In der **Ablage** sieht jeder Benutzer unter *Papierkorb* (unter dem Eingang) nur, was **er selbst** gelöscht hat, und kann es wiederherstellen oder endgültig löschen.
- Unter **Werkbank → Papierkorb** siehst du als Administrator alles, mit „gelöscht von“, und kannst jede Mappe wiederherstellen oder endgültig löschen.

![Werkbank → Papierkorb](bilder/werkbank-papierkorb.png)

## Aufbewahrung

Rechts unter **Aufbewahrung** stellst du ein, wie viele Tage gelöschte Mappen bleiben (Standard: 30). Das DMS räumt stündlich auf.

**0 Tage schaltet den Papierkorb aus:** Löschen ist dann sofort endgültig, wie vor Version 0.11. Was gerade im Papierkorb liegt, wird beim Speichern endgültig gelöscht – die Werkbank fragt vorher nach.

Jeder Benutzer kann in seinem Profil einstellen, dass sein Papierkorb **beim Abmelden geleert** wird.

## Was im Papierkorb gilt

- Mappen im Papierkorb erscheinen nirgends sonst: nicht in Sichten, Zählern, Suche, Verweisauswahl oder der API.
- Sie blockieren keine **eindeutigen Werte**: Eine neue Mappe darf dieselbe Rechnungsnummer bekommen.
- Wie bisher lässt sich eine Mappe, auf die noch andere verweisen, gar nicht erst löschen.
- **Wiederherstellen** bringt Dokumente und Verweise zurück. Verweise auf Mappen, die es inzwischen nicht mehr gibt, entfallen. Ist ein eindeutiger Wert inzwischen vergeben, landet die Mappe im **Eingang** dessen, der sie angelegt hat.
- Ein Mappentyp lässt sich nicht löschen, solange Mappen von ihm im Papierkorb liegen.
- Die Dateien bleiben im Dateiordner, bis der Papierkorb geleert ist.

!!! note "Sofort endgültig"
    Einzeln gelöschte **Dokumente** und **Werkbank → Demo-Daten → entfernen** gehen nicht über den Papierkorb.

## Benutzer und Rollen

Rollen gehen wie andere Mappen in den Papierkorb; ihre Zuordnung zu Benutzern entfällt beim Löschen.

Wer eine **Einladung** löscht (ein Benutzer, der sich noch nie angemeldet hat), legt dessen Mappe in den Papierkorb; der Benutzer ist bis dahin **deaktiviert**. Erst beim Leeren wird das Konto gelöscht; **Wiederherstellen** aktiviert es wieder.
