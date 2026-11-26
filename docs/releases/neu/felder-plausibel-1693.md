art: minor

## Verbessert

- **„Aus Dokument ausfüllen“ prüft, ob die Werte zusammenpassen** (#1693): Ergeben Netto und Steuer den Gesamtbetrag, sind beide „sicher“; sonst stehen alle drei als „unsicher“ mit einem kurzen Hinweis da. Steht die passende Summe als anderer Betrag im Dokument, gewinnt sie. Ein Datum mehr als zwei Jahre in der Zukunft oder vor 1950 ist höchstens „unsicher“, ebenso ein Zeitraum, dessen Ende vor dem Beginn liegt. Eine IBAN mit falscher Prüfziffer schlägt Ablago nie vor. Werte aus einer E-Rechnung bleiben unberührt.
- **Prüfstand Erkennung:** Der Bericht zeigt „Felder je Feldart“ – richtig, falsch, fehlt und „sicher“, aber falsch je Erkennungsart (Datum, Betrag, Nummer …).
