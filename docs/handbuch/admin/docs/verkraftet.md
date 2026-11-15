# Was Ablago verkraftet

Gemessen mit dem [Lasttest](lasttest.md) in drei Stufen: **klein** (Haushalt, 25 gleichzeitige Anfragen, 5.000 Mappen), **mittel** (Kleinbetrieb, 100 gleichzeitig mit Export nebenher, 50.000 Mappen) und **groß** (Last steigern bis zur Grenze, 200.000 Mappen). Die Spalten zeigen p95 – 95 % der Antworten waren schneller – und bei groß die Grenze in gleichzeitigen Anfragen, bei der 95 % der Antworten noch unter 3 s blieben.

Seit #739 misst jede Stufe zusätzlich **mit Speichern** (gleiche Last, rund 10 % schreibende Anfragen) und es gibt die Stufe **extrem** (wie groß, mit 500.000 oder 1 Million Mappen). Die bisherigen Spalten messen genau wie vorher und bleiben mit den älteren Zeilen vergleichbar; die neuen Werte stehen in einer eigenen Tabelle darunter. Ältere Messungen haben dort keine Zeile.

Die Zeilen „GitHub-Rechner“ misst das Projekt jede Woche auf den Rechnern von GitHub (Workflow *Lasttest*); dort laufen Ablago, PostgreSQL und der Lasttest auf demselben Rechner. Die übrigen Zeilen sind Meldungen von Betreibern – gesammelt im Issue [Messergebnisse Lasttest (#576)](https://github.com/motom001/dms/issues/576) und in [eigenen Meldungen](https://github.com/motom001/dms/issues?q=label%3Amessergebnis-lasttest), jede mit Version und Datum, denn neue Versionen können schneller oder langsamer sein.

Auf welchen Geräten das Projekt Ablago selbst prüft – und bis wann voraussichtlich –, zeigt das Installationshandbuch unter [Geprüfte Plattformen](https://help.ablago.app/installieren/aktuell/plattformen/).

| Gerät | CPU / Kerne | RAM | Speicher | Image | Ablago | klein p95 | mittel p95 | groß: Grenze | Stand |
| --- | --- | --- | --- | --- | --- | ---: | ---: | ---: | --- |
| GitHub-Rechner (ubuntu-latest) | 4 Kerne (x64) | 16 GB | SSD | ohne Container, PostgreSQL 17 daneben | 0.146.0 | 60 ms | 586 ms | 200 (136/s, p95 2,8 s) | 03.11.2026 |
| UGREEN DXP4800 Plus (Maintainer) | Intel Pentium Gold 8505, 6 Kerne (x64) | 15,4 GB | SSD | dms-komplett | 0.153.0 | 76 ms | 423 ms | 225 (157/s, p95 2,6 s) | 03.11.2026 |
| GitHub-Rechner (ubuntu-latest) | 4 Kerne (x64) | 16 GB | SSD | ohne Container, PostgreSQL 17 daneben | 0.139.0 | 95 ms | 2.384 ms | unter 25 (p95 3,2 s bei 25) | 02.11.2026, erster Lauf, vor dem Beschleunigen (#615) |

**Mit Speichern und extrem** – p95 der Durchgänge „+ Speichern“, in Klammern p95 nur der schreibenden Anfragen; bei extrem die Grenze, die Dauer des Anlegens der Lasttest-Daten und die Größe der Datenbank:

| Gerät | Ablago | klein + Speichern p95 | mittel + Speichern p95 | groß + Speichern p95 (bei Grenze) | extrem 500.000: Grenze | extrem 1 Mio.: Grenze | Stand |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| GitHub-Rechner (ubuntu-latest) | – | noch nicht gemessen | | | | | |

Du hast selbst gemessen? [Lasttest selbst durchführen](lasttest.md) beschreibt, wie es geht. Den Ergebnisblock fügst du als Kommentar in das Sammel-Issue [Messergebnisse Lasttest (#576)](https://github.com/motom001/dms/issues/576) ein – oder du legst mit der Vorlage [Messergebnis Lasttest](https://github.com/motom001/dms/issues/new?template=messergebnis-lasttest.yml) ein eigenes Issue an. Das Projekt trägt die Meldungen hier ein.

**Wie viel Arbeitsspeicher?** Entscheidend für die Wahl des Geräts ist, was der **ganze Container** braucht – im Ergebnis die Zeile *Arbeitsspeicher Container höchstens*, nicht nur *Ablago höchstens*. Auf dem NAS des Projekts (UGREEN DXP4800 Plus, `dms-komplett`, 200.000 Mappen) brauchte Ablago selbst höchstens rund 1 GB, die Docker-Oberfläche zeigte für den Container knapp 2 GB. Als Faustregel: Für einen Haushalt reicht ein Gerät mit **2 GB** frei für den Container, für einen Kleinbetrieb oder sehr viele Mappen plane **4 GB** ein. Ein Teil davon ist Dateizwischenspeicher, den das System bei Bedarf zurückgibt.

**So liest du die Tabelle:** Liegt *klein* unter 0,3 s, fühlt sich Ablago für einen Haushalt flüssig an. Liegt *mittel* unter 1 s, reicht das Gerät auch für einen kleinen Betrieb mit großen Exporten nebenher. Diese Werte sind das **Ziel** des Projekts. Die *Grenze* von groß ist kein Ziel für den Alltag – 100 gleichzeitige Anfragen sind schon 10–15 Personen, die im selben Moment klicken (siehe [Technik → Viele gleichzeitige Anfragen](technik.md#last)).

**Ziel und CI-Grenze:** Bei *klein* und *mittel* wird die wöchentliche Messung auf den Rechnern von GitHub rot, wenn sie die **CI-Grenze** verfehlt. Die CI-Grenze kam aus dem ersten Lauf dort plus 20 % und wird nur strenger, höchstens bis zum Ziel. Seit dem Beschleunigen (#615) hält auch *mittel* das Ziel (586 ms auf den Rechnern von GitHub, 423 ms auf dem NAS des Maintainers); damit ist die CI-Grenze jetzt **gleich dem Ziel**: 0,3 s für *klein*, 1 s für *mittel*. Messwerte von anderen Geräten helfen weiter – melde sie im Sammel-Issue [Messergebnisse Lasttest (#576)](https://github.com/motom001/dms/issues/576).
