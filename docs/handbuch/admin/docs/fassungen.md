# Fassungen: wer hat was geändert?

Jedes Speichern in der Werkbank ergibt eine **Fassung** – bei **Mappentypen** (samt ihren Rechte-Regeln, dem Stempel und der Erkennung am Typ), **Ansichten** (samt Rechten), **Nummernkreisen**, **Stempel-Vorlagen**, **Postfächern**, den **Einstellungen eines Pakets**, **Automatisierungen** und **Automatisierungsvorlagen**. Jede Fassung nennt, **wann** gespeichert wurde, **wer** es war und **was** sich geändert hat – in Sätzen, nicht als Technik:

> Feld „Kündigungsfrist“ hinzugefügt · „Betrag“ ist kein Pflichtfeld mehr · Trefferliste „Standard“: Spalte „Ort“ entfernt

So kannst du nachvollziehen, warum eine Ansicht plötzlich anders aussieht, zwei Stände vergleichen und einen früheren zurückholen.

![Bereich „Fassungen“ im Mappentyp „Post“: die erste Fassung von Ablago, die zweite vom Administrator, aufgeklappt](bilder/werkbank-fassungen.png)

## Wo du sie findest { #wo }

Im Editor jedes dieser Einträge steht ganz unten der Bereich **Fassungen** – in der [Sprungleiste](mappentypen.md#aufbau-des-editors) wie alle anderen Bereiche, eingeklappt mit einer Kurzinfo („5 Fassungen · zuletzt 12.11.26, 10:14, Markus“). Ein neuer Eintrag hat ihn erst nach dem Anlegen. Bei den Einstellungen eines Pakets steht er unter dem Status.

Je Fassung eine Zeile wie in der Historie einer Mappe: Datum und Uhrzeit, wer, die ersten Änderungen; die neueste trägt **Aktuell**. Aufgeklappt stehen alle Änderungen und die Knöpfe **Zum Vergleich wählen** und **Diese Fassung wiederherstellen**.

## Wer gespeichert hat { #wer }

| Steht dort | Bedeutet |
| --- | --- |
| ein Name, z. B. **Markus** | jemand hat in der Werkbank gespeichert (auch über den Befehl `dms`) |
| **Paket Haushalt 1.4.0 (durch Markus)** | das Paket hat beim Installieren, Aktualisieren oder Entfernen etwas geändert; Markus hat es angestoßen |
| **Paket Haushalt 1.4.0** | das Paket selbst, über sein Dienstkonto |
| **Automatisierung „…“** | eine Automatisierung |
| **Update auf Ablago 0.255.0** | beim Start nach einem Update – Ablago hat dabei etwas umgestellt |
| **Ablago** | Ablago selbst, z. B. eine Automatisierung angehalten, weil ihr Feld fehlt |

Die erste Fassung eines Eintrags, den es schon vor den Fassungen gab, heißt **Erste Fassung – so war es vor Einführung der Fassungen**; sie trägt das Update, mit dem die Fassungen kamen.

## Zusammenfassen { #zusammenfassen }

Damit nicht jedes kleine Speichern eine eigene Fassung wird: Speichert **dieselbe Person innerhalb von 10 Minuten** nach Beginn ihrer letzten Fassung denselben Eintrag noch einmal, schreibt Ablago diese Fassung fort („Gespeichert von 10:04 bis 10:12“). Gemessen wird ab dem Beginn, nicht ab dem letzten Speichern – wer eine Stunde lang feilt, hinterlässt also mehrere Fassungen. Was ein Vorgang in mehreren Schritten speichert (etwa eine Paket-Installation), ist immer eine Fassung. Nie zusammengefasst wird mit einer Wiederherstellung. Speichern ohne Änderung ergibt keine Fassung, und wer etwas ändert und gleich wieder zurücknimmt, hinterlässt auch keine.

## Vergleichen { #vergleichen }

**Zum Vergleich wählen** an zwei Fassungen: Über der Liste steht dann, was sich **von der älteren zur neueren** geändert hat – auch über mehrere Fassungen hinweg. **Vergleich schließen** hebt die Wahl auf.

## Wiederherstellen { #wiederherstellen }

**Diese Fassung wiederherstellen** fragt erst nach und sagt dabei, **was sich gegenüber jetzt ändert** und **worauf du achten solltest**, zum Beispiel:

- „Feld ‚Seriennummer‘ fällt weg – 3 Mappen haben dort einen Wert.“ (Die Werte bleiben in den Mappen gespeichert, sind aber nicht mehr zu sehen.)
- „2 Mappen passen danach nicht mehr zum Mappentyp.“ (Ihre Ersteller bekommen eine Aufgabe, wie beim normalen Speichern.)
- „Register ‚Belege‘ fällt weg – darin liegen 4 Dokumente.“ (Dann geht es erst, wenn das Register leer ist.)

Wiederhergestellt wird über das **normale Speichern**: Es gelten dieselben Prüfungen und Rückfragen (z. B. „Danach dürfte niemand mehr Mappen lesen“). Das Ergebnis ist **eine neue Fassung** („Fassung 2 wiederhergestellt“) – der Stand davor bleibt erhalten, es geht nichts verloren.

Hat inzwischen jemand anderes gespeichert, stellt Ablago nichts wieder her und zeigt die neue Liste – sieh dir die neueste Fassung an und entscheide dann. Geheimnisse (das Passwort eines Postfachs, geheime Einstellungen eines Pakets) stehen nie in einer Fassung; beim Wiederherstellen bleiben die heutigen.

## Gelöschte Einträge { #geloescht }

Fassungen bleiben, solange es den Eintrag gibt. Löschst du ihn, bleibt seine **letzte Fassung mit Löschvermerk** (wann, wer) – für den Nachweis, etwa in der [Verfahrensdokumentation](verfahrensdokumentation.md). Unter der Liste der Mappentypen, Ansichten, Nummernkreise, Stempel-Vorlagen, Postfächer, Automatisierungen und Automatisierungsvorlagen steht dann **Gelöscht: 2 Einträge**; aufgeklappt mit Name, Zeitpunkt und Person. Wiederherstellen lässt sich ein gelöschter Eintrag daraus nicht.

## Rechte, Export und Sicherung { #rechte }

- Fassungen sehen, vergleichen und wiederherstellen kann, wer den **Bereich** verwalten darf ([Wer darf Ablago verwalten?](verwalten.md)) – die Fassungen eines Mappentyps also, wer Mappentypen verwalten darf. Die gelöschten Einträge zeigt Ablago nur aus den Bereichen, die du verwaltest.
- Der [Vollexport](export.md) enthält alle Fassungen samt Löschvermerken in `struktur/fassungen.json`. Die Liste im Editor zeigt die neuesten 50.
- Die [Sicherung](sicherung.md) nimmt die Fassungen mit. Ältere Sicherungen ohne Fassungen lassen sich weiter einspielen; Automatisierungen und Automatisierungsvorlagen bringen ihren bisherigen Änderungsverlauf als Fassungen mit.
