art: patch

## Für Administratoren

- **Bestandteile der Oberfläche aus dem Bündel** (#1470): Die Liste der Bestandteile am Release nennt bei der Weboberfläche nur noch die npm-Pakete, die wirklich Code in das ausgelieferte Bündel bringen, statt alles aus der `package-lock.json`. So fallen 27 Pakete weg, die `qrcode` nur außerhalb des Browsers braucht (Kommandozeile mit `yargs`, PNG-Ausgabe mit `pngjs`); Lizenzprüfung und Abgleich der Sicherheitsmeldungen schlagen bei ihnen nicht mehr an. In der Spalte *Herkunftspaket* steht dafür „im Bündel“. Im nächsten Release erscheinen sie deshalb einmalig als „entfernt“.
