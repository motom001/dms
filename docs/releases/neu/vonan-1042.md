art: minor

## Geändert

- **Post: „Von“ und „An“** (#1042): Die Felder der Post heißen wie bei Verträgen und Rechnungen – „Von“ (bisher „Absender“) und „An“ (bisher „Für“), mit den Kennungen `von` und `an`; das frühere „Empfänger“ einer versendeten E-Mail heißt „An (Adresse)“. Das Update zieht Werte, Ansichten, Trefferlisten, Titel-Vorlage, Berechtigungen, Automatisierungen samt Platzhaltern (`{absender}` → `{von}`, `{fuer}` → `{an}`) und Verknüpfungsregister um; Rechte-Regeln wirken danach genau wie vorher, eigene Bezeichnungen bleiben. Die Aufgabe heißt weiter „Post für dich“. Die Schnittstelle versteht `absender` und `fuer` bis 1.0.0 weiter (beim Schreiben, und beim Lesen einer Post kommen sie mit); das Ereignis `post.angelegt` trägt `an` und bis dahin auch `fuer`. Apps und Skripte, z. B. die Homey-App, bitte auf `von` und `an` umstellen.
- **Rechte-Regeln mit einem Feld, das es nicht gibt** (#1042), wirken jetzt geschlossen: Eine Regel, die erteilt, trifft nie zu, eine, die entzieht, immer – auch mit „ist nicht“. Bisher öffnete „ist nicht …“ auf ein entferntes Feld.
