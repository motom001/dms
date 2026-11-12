# Ablago in die Hausautomatisierung einbinden

Eine Lampe im Flur, die leuchtet, wenn neue Post da ist. Eine Mitteilung aufs Handy, wenn eine Frist ansteht. Die Zahl der offenen Aufgaben auf dem Wand-Tablet. Dafür bindest du Ablago in deine **Hausautomatisierung** ein – ohne dass jemand Ablago öffnen muss.

Die Hausautomatisierung bekommt dabei **nur Zahlen**: wie viel neue Post, wie viel unter *Zu erledigen*, wie viel **fällig in 7 Tagen** und wie viel überfällig ist. Titel, Absender, Namen oder Dokumente sieht sie nie.

## Was es gibt

| System | Stand |
| --- | --- |
| **Homey Pro** | App **Ablago** – Werte am Gerät und Flow-Karten wie „Neue Post angekommen“ und „Frist wird fällig“. Anleitung im [README der Homey-App](https://github.com/motom001/dms-clients/blob/main/homey/README.md). |
| **Home Assistant** | später ([motom001/dms-clients#3](https://github.com/motom001/dms-clients/issues/3)) |
| Andere (Node-RED, ioBroker, eigene Skripte) | über die [Zähler-Schnittstelle](https://help.ablago.app/admin/aktuell/api/#zaehler) mit demselben Schlüssel |

Die Apps und Anbindungen liegen im Repository [motom001/dms-clients](https://github.com/motom001/dms-clients). Du brauchst keine davon – Ablago ist vollständig im Browser bedienbar.

!!! note "Nur im Heimnetz"
    Die Hausautomatisierung fragt dein Ablago direkt im Heimnetz ab. Deshalb geht es mit **Homey Pro**, nicht mit Homey Cloud: Ein Dienst im Internet erreicht ein DMS in deinem Heimnetz nicht.

## Schlüssel „nur Zähler“ anlegen

Die Hausautomatisierung meldet sich mit einem **API-Schlüssel** an. Nimm dafür die Stufe **nur Zähler**:

1. Melde dich als die Person an, deren Zahlen angezeigt werden sollen – die Zahlen gelten immer für den Benutzer des Schlüssels und in seinen Rechten.
2. Öffne **Mein Konto → Sicherheit → API-Schlüssel** (oben rechts auf deinen Namen klicken) und erzeuge einen neuen Schlüssel, z. B. „Homey“.
3. Wähle unter **Rechte** die Stufe **nur Zähler**.
4. Kopiere den Schlüssel gleich (er beginnt mit `dms_`) – er ist nur jetzt ganz zu sehen – und trag ihn zusammen mit der Adresse deines Ablago (z. B. `https://dms.home.arpa`) in der Hausautomatisierung ein.

Warum *nur Zähler*: Dieser Schlüssel ruft **nur die Zahlen** ab; alles andere lehnt das Ablago ab, auch das [Laufwerk](laufwerk.md). Geht er verloren – etwa mit einer Sicherung der Hausautomatisierung –, erfährt jemand höchstens, wie viel Post und Aufgaben du hast.

!!! tip "Für mehrere Personen"
    Soll die Familie die Zahlen von Lena und Jonas getrennt sehen, legt jede Person ihren eigenen Schlüssel *nur Zähler* an. Wie die einzelne App das abbildet, steht in ihrem README.

Brauchst du den Schlüssel nicht mehr, löschst du ihn unter **Mein Konto → Sicherheit → API-Schlüssel**; die Hausautomatisierung meldet dann „Schlüssel ungültig“.

## Wie schnell die Hausautomatisierung Neues bemerkt

Die Apps fragen Ablago in einem festen Abstand ab (welcher, steht im README der App). Hat sich nichts geändert, antwortet Ablago nur mit „nichts Neues“ – das kostet praktisch nichts. Neue Post bemerkt die Hausautomatisierung also spätestens nach einem Abfrage-Abstand.

## Abfragen und Melden { #abfragen-und-melden }

Ablago trennt die beiden Richtungen:

- **Abfragen über die Schnittstelle:** Die Hausautomatisierung holt die Zahlen selbst – mit dem Schlüssel *nur Zähler* (siehe oben). So arbeiten die Homey-App, Node-RED, ioBroker und eigene Skripte.
- **Melden über Automatisierungen:** Soll Ablago von sich aus etwas nach außen melden – etwa eine Push-Meldung, sobald neue Post da ist –, richtet das ein Administrator unter **Werkbank → Automatisierungen** ein, mit der Dann-Karte **„URL aufrufen“** an ein freigegebenes Ziel (zum Beispiel ein Webhook von Home Assistant im Heimnetz). Wie das geht, steht im Administratorhandbuch unter [Nach außen melden](https://help.ablago.app/admin/aktuell/automatisierungen/#nach-aussen).

!!! note "Kein eigener Webhook mehr unter Mein Konto"
    Früher konnte jede Person unter **Mein Konto** einen Webhook eintragen, der ihre Zahlen sofort meldete; dazu gehörte in der Werkbank der Bereich **Webhooks** mit freigegebenen Zielen. Beides ist entfallen ([#991](https://github.com/motom001/dms/issues/991)), eingetragene Webhooks hat Ablago beim Update entfernt. Die Abfrage mit dem Schlüssel *nur Zähler* bleibt, wie sie ist.

Technische Einzelheiten zur Schnittstelle stehen im [Administratorhandbuch](https://help.ablago.app/admin/aktuell/api/#zaehler).
