art: keine

## Intern

- **Weniger Konflikte zwischen Pull Requests** (#1665): Die Zahl aller deutschen Texte steht nicht mehr in `plane.json`, sondern wird im Test berechnet; `routen-liste.test.ts` zählt die Routen nicht mehr, sondern prüft jede Route samt Zugriffsstufe gegen die Routentabelle.
- **Rauchtest „Werkbank → Aufgaben: Auswahl in Knopfhöhe“ nicht mehr zufällig rot** (#1666): Er misst erst, wenn die Mappe geladen ist, und liest die Lage von Auswahl und Knopf im selben Augenblick.
