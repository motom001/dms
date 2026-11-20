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

## Gut zu wissen

- Eine neue Installation steht auf *Deutschland · ohne Bundesland · Europe/Berlin*. Der Einrichtungsassistent fragt das nicht ab – wer keine Feiertage braucht, muss nichts tun.
- Bis Version 0.159 stand das Bundesland unter *Benachrichtigungen und Aufgaben*. Ein Update übernimmt es von dort; die Zeitzone bleibt *Europe/Berlin*.
- Mit mehreren Servern gilt eine Änderung sofort an dem Server, an dem du speicherst, und an den anderen spätestens nach einer Minute.
- Die Einstellung steht in der Datenbank und ist damit in jeder [Sicherung](sicherung.md). Der [Vollexport](export.md) legt sie als `struktur/region.json` ab, die [Schnittstelle](api.md) liefert sie lesend unter `GET /api/v1/region`.
- Wechselst du die Zeitzone, rechnet Ablago ab dann in der neuen. Schon angelegte Fristen behalten ihr Datum; Uhrzeiten, die schon vergangen sind, holt Ablago nicht nach.
