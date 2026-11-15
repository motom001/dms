# Tipps

**Tipps** zeigen in einem Satz, was man in Ablago noch tun kann – als Tipp des Tages im Assistenten und alle zusammen unter [Ablago entdecken](https://help.ablago.app/benutzer/aktuell/entdecken/). Sie kommen von Ablago, aus Paketen und von dir: Hier passt du sie an eure Arbeitsweise an, schreibst eigene und schaltest einzelne aus.

Du findest sie unter **Werkbank → Ablage aufbauen → Tipps**, neben den [Rundgängen](rundgaenge.md). Der Bereich steht ab der Stufe **Haushalt** in der Leiste (siehe [Werkbank anpassen](uebersicht.md#werkbank-anpassen)).

![Werkbank → Tipps: Liste und Formular](bilder/werkbank-tipps.png)

## Die Liste

In der Mitte stehen **alle** Tipps mit Herkunft (Ablago, Paket, eigener), Bereich und für wen. Angepasste tragen den Vermerk *angepasst*, ausgeschaltete *ausgeschaltet*. Oben suchst du im Text und filterst nach Herkunft.

## Das Formular

Ein Klick auf einen Tipp öffnet rechts das Formular – kein Code, keine Datei:

- **Text:** höchstens 160 Zeichen und zwei Sätze, in der Du-Form; der Zähler zeigt, wie viel noch geht.
- **Bereich:** nach ihm steht der Tipp auf „Ablago entdecken“ (Suche, Post, Zu erledigen und Fristen, Mappen, Mein Konto, Verwalten).
- **Der Satz führt …** an eine **Stelle** in Ablago oder in einen **Rundgang**. Die Stellen wählst du aus einer Liste mit Beschreibung; mit einem Mappentyp (unten) kommen dessen echte Felder und Register dazu – dann öffnet der Tipp die erste Mappe dieses Typs, die die Person lesen darf. **Ziel zeigen** öffnet Ablago in einem neuen Fenster, ein Klick auf eine hervorgehobene Stelle übernimmt sie (wie bei den [Rundgängen](rundgaenge.md#ziele)).
- **Für wen:** alle oder nur Verwaltende; optional nur, wer einen bestimmten **Mappentyp** lesen darf.
- **Vorschau** zeigt den Tipp so, wie er im Assistenten steht; **Ausprobieren** öffnet das Ziel in einem neuen Fenster wie „Zeig es mir“.

Gespeichert wird nur ohne Fehler; Fehler stehen am Feld. Haben zwei Verwaltende denselben Tipp gleichzeitig offen, überschreibt keiner den anderen.

## Tipps von Ablago und aus Paketen anpassen { #anpassen }

Tipps von Ablago und aus Paketen änderst du im selben Formular. Die **Anpassung wird getrennt gespeichert**, das Original bleibt erhalten und steht darüber:

- Ein **Update** des Pakets lässt deine Anpassung stehen. Hat das Paket den Tipp inzwischen geändert, steht oben ein Hinweis mit **Vergleich** (Original damals und jetzt).
- **Auf Original zurücksetzen** entfernt die Anpassung jederzeit.
- Manche Tipps von Ablago erscheinen nur, wenn eine Funktion eingeschaltet ist (etwa „Frag deine Ablage“); das bleibt so.

## Ein- und ausschalten

Der Schalter oben am Tipp gilt **für alle** und wirkt sofort: Ein ausgeschalteter Tipp erscheint bei niemandem, auch nicht unter „Ablago entdecken“. Jede Person kann außerdem selbst einzelne Tipps mit × ausblenden oder den Tipp des Tages ganz abschalten (Benutzerhandbuch, [Ablago entdecken](https://help.ablago.app/benutzer/aktuell/entdecken/)).

## Weitergeben und sichern

- **Paket erstellen** nimmt gewählte eigene Tipps als `inhalt/tipps.yaml` mit. Startet ein Tipp einen eigenen Rundgang, muss der Rundgang mitkommen. Anpassungen an Tipps anderer Pakete kommen (noch) nicht mit.
- Eigene Tipps, Anpassungen und was du ein- oder ausgeschaltet hast, stehen in der Datenbank und damit in jeder [Sicherung](sicherung.md); der [Vollexport](export.md) legt sie als `struktur/entdecken.json` ab.
