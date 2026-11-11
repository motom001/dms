art: minor

## Neu

- **Externe Dienste messen, KI-Kosten und Budget** (#565): Werkbank → Systemzustand zeigt je externem Dienst (KI-Dienst, Postfach-Abruf, E-Mail-Versand, Anmeldung über einen Anbieter, Netz der Pakete) Mittel, p50, p95, erste Antwort, Fehler, Zeitüberschreitungen, Datenmenge und Token der letzten Stunde bzw. 24 Stunden – je Paket auch in der Paketansicht. Für KI-Pakete trägst du einen Preis je 1 Mio. Token ein und siehst die Kosten je Monat, Paket, Person und Funktion sowie die teuersten Abfragen; ein Monatsbudget warnt ab 80 % und pausiert mit harter Grenze die kostenpflichtigen KI-Funktionen bis zum Monatsanfang. Im Entwicklermodus zeigt die Zeitmessung je Anfrage den Abschnitt „Externe Dienste“ (Server-Timing `extern`). Gespeichert werden nur Metadaten, nie Inhalte: einzelne Aufrufe 35 Tage, Monatssummen 24 Monate.
