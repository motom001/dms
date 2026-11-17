art: patch

## Behoben

- **Mehrere Prozesse: Absturz eines Prozesses reißt den Hauptprozess nicht mehr mit** (#1409): Ging eine Nachricht an einen Prozess, der eben beendet wurde, brach der Hauptprozess mit „EPIPE“ ab. Jetzt verfällt die Nachricht, und der Prozess startet wie vorgesehen neu.
- **Leiste der Werkbank meldet, solange die Stufe lädt** (#1409): Bis die gewählte Stufe geladen ist, ist die Leiste als „wird geladen“ (`aria-busy`) gekennzeichnet.
- **Neues Postfach verliert keine Eingaben mehr** (#1409): Lud die Liste der Postfächer erst, nachdem man im Formular „Neues Postfach“ schon etwas eingetragen hatte, war die Eingabe wieder leer.
