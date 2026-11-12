# Fassungen (#1006)

**Zweck:** Wer hat wann was an den Einstellungen der Werkbank geändert – festhalten, zeigen, vergleichen,
wiederherstellen. Ein Mechanismus und eine Tabelle (`fassungen`, Migration 103) für alle Gegenstände: Mappentypen
(samt Rechte-Regeln, Stempel und Erkennung am Typ), Ansichten, Nummernkreise, Stempel-Vorlagen, Postfächer,
Paket-Einstellungen und Automatisierungen (bis #1006 eigene Tabelle `automatisierung_fassungen`). Schicht 3.

- `fassungen.dienst.ts` – `Fassungen`: `halte` (nach dem Speichern: neue Fassung, fortgeschrieben oder nichts),
  `geloescht` (letzte Fassung mit Löschvermerk), `liste`, `vergleich`, `vorschau`, `stelleWiederHer` (Konfliktschutz
  über den Stand der neuesten Fassung, dann das normale Speichern des Gegenstands), `geloeschte`, `alle` (Vollexport),
  `abgleich` (beim Start einmal je Version: was Migrationen geändert haben, wird „Update auf Ablago …“).
- `gegenstaende.ts` – Mappentyp, Ansicht, Nummernkreis, Stempel-Vorlage (Stand lesen, alle Einträge, wiederherstellen,
  Hinweise vorher). Postfächer (`postfach.ts`), Paket-Einstellungen (`pakete.ts`) und Automatisierungen
  (`automatisierung.ts`) melden sich selbst mit `registriere` an.
- `huelle.ts` – Repo-Hülle: nach jeder schreibenden Methode für Typen, Ansichten und Nummernkreise die Fassung
  festhalten, in derselben Transaktion – so sind Pakete, Umbau, Umzüge beim Start und Löschen mit abgedeckt.
- `fassungen.routen.ts` – je Gegenstand unter der Adresse seines Eintrags (`FASSUNG_PFAD`), damit das Verwaltungsrecht
  des Bereichs gilt; dazu `/api/werkbank/fassungen/geloescht`.

**Gemeinsam mit der Oberfläche** (`shared/src/`): `fassungen.ts` (Arten, Urheber, Regel zum Zusammenfassen,
Antworten der API), `fassungsvergleich.ts` (lesbare Änderungen je Gegenstand, für Mappentypen auf `typvergleich.ts`).

**Wer** (`Kern.urheber()`): ausdrücklich gesetzt (`mitFassungsKontext`: Paket beim Installieren, Update beim Start),
sonst die Automatisierung bzw. das Paket als Auslöser, sonst die Person der Anfrage, sonst Ablago.

**Zusammenfassen:** dieselbe Person (dasselbe Paket in derselben Version …) innerhalb von 10 Minuten ab Beginn der
letzten Fassung, und immer im selben Vorgang (Anfrage, Installation); nie mit einer Wiederherstellung.

**Abhängigkeiten:** Kern (Repo, Urheber, Vorgang); was die Gegenstände zum Speichern brauchen, reicht der Dienst über
`GegenstaendeAnschluss` herein.
