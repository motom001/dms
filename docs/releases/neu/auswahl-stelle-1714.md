art: minor

## Neu

- **Erkennungswörter am Feld für Pakete** (#1714): Ein Paket kann an einem Feld Wörter angeben, hinter denen der Wert steht – etwa „(4) km-St. 9363“ für den Kilometerstand oder „Kd.-Nr.“ für die Kundennummer –, und bei Auswahlfeldern weitere Wörter je Wert („ohne festgestellte Mängel“ → „ohne Mängel“). Der Wert hinter den Wörtern gewinnt vor anderen Stellen. Passt er nicht zum Feld („8867 Betriebsstunden“ im Kilometerstand, nur ein Strich, ein Monat ohne Tag), bleibt das Feld leer.

## Behoben

- **Auswahlfelder nehmen die früheste Stelle im Dokument** (#1714): Kamen mehrere Werte vor, gewann bisher der, der in der Liste zuerst stand – auch aus dem Kleingedruckten auf Seite 2. Jetzt gewinnt die Stelle, die zuerst im Dokument steht; Sätze, die nur eine Bedingung beschreiben („Weist das Ergebnis geringe Mängel aus, …“), zählen nicht.
