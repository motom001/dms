# Region

**Werkbank → Einstellungen → Region** legt an einer Stelle fest, wo deine Ablage zu Hause ist. Danach richten sich:

- die **Feiertage** im Kalender und bei der [Täglichen Zusammenfassung](aufgaben.md#tagliche-zusammenfassung),
- „**heute**“ – bei Fristen, Vorlaufzeiten, Filtern wie „angelegt heute“, Nummernkreisen mit Jahr und Aufbewahrungsfristen,
- alle **Uhrzeiten**: Tägliche Zusammenfassung, Automatisierungen mit „Datum erreicht“ und Zeitplänen, Sicherungen, Datumsangaben in E-Mails, Auskünften, Stempeln und Exporten – und das Datum neuer Post aus dem Postfach (eine Mail um 00:30 gehört zu diesem Tag, nicht zum Vortag).

## Einstellungen

- **Land** – zunächst nur Deutschland; weitere Länder mit ihren Feiertagen kommen später dazu.
- **Bundesland** – für die gesetzlichen Feiertage. Ablago berechnet sie selbst: die bundesweiten und die landesweiten des gewählten Landes, Ostern und die davon abhängigen Tage nach der Gaußschen Osterformel. Feiertage, die nur in einzelnen Gemeinden gelten – etwa Mariä Himmelfahrt in Teilen Bayerns oder das Augsburger Friedensfest –, und einmalige Feiertage fehlen. *Keins – ohne Feiertage* schaltet sie ab.
- **Zeitzone** – Vorgabe *Europe/Berlin*. Zur Auswahl stehen die gängigen Zeitzonen Europas und einige weitere.

Unter den Einstellungen siehst du die **Feiertage des laufenden Jahres**, wie sie gespeichert sind.

## Formate

Unter **Formate** stellst du ein, wie Ablago Daten zeigt (ab der Version, die das Änderungsprotokoll unter #1610 nennt). *Wie die Sprache* richtet sich nach der Sprache der Oberfläche; eine eigene Wahl gilt für alle. **Gespeicherte Werte ändern sich dabei nicht** – nur, wie sie erscheinen.

- **Datum** – für Daten in Ziffern: TT.MM.JJJJ, JJJJ-MM-TT, TT/MM/JJJJ oder MM/TT/JJJJ. Ausgeschriebene Daten („24. November 2026“) bleiben in der Sprache.
- **Uhrzeit** – 24 oder 12 Stunden.
- **Zahlen** – Tausender- und Dezimalzeichen (1.234,56 · 1,234.56 · 1 234,56 · 1’234.56); **Währung** vor oder hinter dem Betrag.
- **Standardwährung** – für neue Betragsfelder ohne eigene Währung (Vorgabe EUR).
- **Telefonnummern** – *kanonisch* „+49 (351) 1234567“, *DIN 5008 international* „+49 351 1234567“ oder *DIN 5008 national* „0351 1234567“ (Vorgabe). Nummern aus einem anderen Land stehen immer international da. Eine Durchwahl mit Bindestrich bleibt eine Durchwahl: „0351 12345-67“. Eine Eingabe, die Ablago nicht als Nummer erkennt, steht da, wie sie eingegeben ist, mit dem Hinweis *nicht als Telefonnummer erkannt*. Gilt für Textfelder mit Format *Telefon*; der Link zum Anrufen wählt die Nummer mit Ländervorwahl.
- **Standard-Ländervorwahl** – für Nummern ohne Ländervorwahl, z. B. 49.
- **Wochenbeginn** – Montag, Sonntag oder Samstag: Damit beginnen die Wochen in der Kalenderauswahl und in *Zu erledigen → Monat und Jahr*. Die Kalenderwoche zählt weiter nach ISO (ab Montag).
- **Arbeitstage** – frei wählbar (Mo–Fr, Mo–Sa, Mo–So oder einzelne Tage). Die übrigen Tage sind im Kalender grau.

Die **Vorschau** zeigt Beispielwerte schon vor dem Speichern.

**Suche nach Telefonnummern:** Eine Nummer findest du in jeder Schreibweise – „0351 1234567“ findet auch „(0351) 123 45 67“ und „+49 351 1234567“, eine Rufnummer ohne Vorwahl („1234567“) jede Nummer, die sie enthält.

## Gut zu wissen

- Eine neue Installation steht auf *Deutschland · ohne Bundesland · Europe/Berlin*. Der Einrichtungsassistent fragt das nicht ab – wer keine Feiertage braucht, muss nichts tun.
- Bis Version 0.159 stand das Bundesland unter *Benachrichtigungen und Aufgaben*. Ein Update übernimmt es von dort; die Zeitzone bleibt *Europe/Berlin*.
- Mit mehreren Servern gilt eine Änderung sofort an dem Server, an dem du speicherst, und an den anderen spätestens nach einer Minute.
- Die Einstellung steht in der Datenbank und ist damit in jeder [Sicherung](sicherung.md). Der [Vollexport](export.md) legt sie als `struktur/region.json` ab, die [Schnittstelle](api.md) liefert sie lesend unter `GET /api/v1/region`.
- Datum, Zahlen und Beträge folgen den Formaten in Feldern, Titeln, Listen, E-Mails und Uhrzeiten der Oberfläche. Einzelne Stellen (etwa Tagesüberschriften im Kalender) zeigen ausgeschriebene Daten weiter in der Sprache.
- Wechselst du die Zeitzone, rechnet Ablago ab dann in der neuen. Schon angelegte Fristen behalten ihr Datum; Uhrzeiten, die schon vergangen sind, holt Ablago nicht nach.
