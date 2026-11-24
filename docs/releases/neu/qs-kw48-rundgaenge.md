art: minor

## Neu

- **Rundgänge beim ersten Besuch, in Leserichtung** (#1512, #1522, #1523): Statt eines langen Rundgangs bei der ersten Anmeldung gibt es vier kurze, die beim ersten Besuch der jeweiligen Seite starten – die Ablage („Deine Ablage im Überblick“), die erste geöffnete Mappe („So arbeitest du in einer Mappe“) und für Administratoren die Werkbank („Die Werkbank im Überblick“). Mein Konto startet nicht von selbst; dort steht beim ersten Besuch nur ein stiller Satz, der den Rundgang startet. Jeder Rundgang geht von links oben nach rechts oben und dann nach unten, zuletzt der Assistent unten rechts. Nach der Einrichtung sehen Administratoren zuerst den Rundgang der Werkbank, den der Ablage beim ersten Wechsel dorthin. Nach einem Rundgang folgt der nächste erst auf einer anderen Seite.
- **Handbuchseite „So sehen Knöpfe aus“** (#1524): Das Benutzerhandbuch zeigt Hauptknopf, Anlegen, Knöpfe mit Rand, Links, Gefährliches mit Rückfrage, blasse und gesperrte Knöpfe, Etiketten sowie Schalter und Haken – mit Bildern direkt aus der Musterseite, hell und dunkel. Ein früher Tipp des Tages führt dorthin.

## Verbessert

- **Die Karte des Rundgangs springt nicht mehr** (#1522): Bei großen Zielen wie der Liste in der Mitte bleibt sie an ihrem Platz; verdeckt sie ein Ziel, rückt sie nur so weit nach oben wie nötig.

## Für Administratoren

- **Tipps können eine Handbuchseite öffnen** (#1524): Neben einer Stelle oder einem Rundgang führt der Satz eines Tipps jetzt auch auf eine Seite im mitgelieferten Handbuch (`handbuch: benutzer/knoepfe/`) – in `tipps.yaml` von Ablago und von Paketen sowie unter Werkbank → Tipps.
- **Neue Startart `erster_besuch`** für Ablagos eigene Rundgänge, mit `seite` (ablage, mappe, werkbank, konto) und `leise` für einen stillen Hinweis statt eines Starts; Werkbank → Rundgänge zeigt sie als „beim ersten Besuch der Seite“.
