art: patch

## Sicherheit

- **Pakete erreichen über ihr Manifest nur das Internet** (#1628): Adressen, die ein Paket in seinem Manifest (`code.netz`) nennt, prüft der Paket-Läufer jetzt beim Verbinden wie „URL aufrufen“. Zeigt der Name auf eine Adresse im Heimnetz, auf den Rechner selbst oder auf eine Metadaten-Adresse, lehnt er den Abruf ab. Das gilt auch, wenn der Name erst später dorthin zeigt, denn Ablago löst ihn nur einmal auf. Der Abruf steht dann als abgelehnt im Protokoll des Pakets. Vom Admin bestätigte Dienst-Adressen dürfen wie bisher ins Heimnetz, etwa ein Ollama oder ein NAS.

## Für Entwickler

- **Gemeinsame Adressprüfung** (#1628): `server/src/grundlagen/netzadressen.ts` enthält die Prüfung aus „URL aufrufen“ (`adressArt`, `pruefendesLookup` …). Der Läufer nutzt sie über einen eigenen Dispatcher für `fetch`, ohne neue Abhängigkeit. `netz()` liefert bei einer gesperrten Manifest-Adresse `-2`.
