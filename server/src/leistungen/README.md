# Leistungen (#1569)

**Zweck:** Der Kern vermittelt Leistungen – fest beschriebene Arbeiten an Dokumenten (`dokument.lesen.text@1` …),
die Ablago selbst (#1570) oder ein Paket (#1572) erbringt. Er nimmt Aufträge an, prüft sie, wählt genau einen Anbieter,
prüft das Ergebnis und legt es mit den Rechten der Person ab. Den Katalog (Schemas, Formate, Testfälle) beschreibt
`shared/src/leistungen/`. Schicht 3.

- `leistungen.dienst.ts` – `LeistungenDienst`: `abrufen` (direkt), `beauftragen` (im Hintergrund, Ereignis
  `leistung.fertig`/`leistung.fehlgeschlagen`), `auftrag` (Stand), `katalog`, Einstellungen (Aufbewahrung), Hintergrund
  (`start`, `stop`, `anstossen`, `raeumeAuf`).
- `anbieter.ts` – `Anbieterliste`: anmelden, entfernen, genau einen wählen (gewählt, sonst eingebaut, sonst der erste
  mit passendem Dateityp) oder den Grund nennen, warum es keinen gibt (`keiner`, `aus`, `dateityp`).
- `pruefen.ts` – `Leistungsfehler` mit Code je Fall, Prüfung der Ausgabe, Dokumente der Eingabe zu Dateien auflösen.
- `speicher.ts`, `pg.ts` – Aufträge im Arbeitsspeicher (Tests) bzw. in `leistungsauftraege` (Migration 125).
- `testfaelle.ts` – Testfälle des Katalogs an einem Anbieter ausführen.
- `leistungen.routen.ts` – `/api/leistungen…` für Personen, `/api/werkbank/leistungen/einstellungen` (Bereich `daten`).
- `index.ts` – die einzige Tür.

**Abhängigkeiten**

- Kern (Repo, Dateien, Einstellungen, Ereignisse) und Rechteprüfung (`zugriff/`). Ablegen und Recht am Ziel kommen
  über den Anschluss vom Dienst (Hochladen der Dokumente, Recht „Bearbeiten“).
- Den Speicher in der Datenbank und den Wartungsmodus setzt der Start (`start/dokumente.ts`), den Hintergrund startet
  `start/hintergrund.ts` in jedem Prozess.

**Regeln**

- Bis zur Annahme ändert sich nichts: Leistung, Eingabe, `kontext`, Ziel und Schreibrecht, Leserecht an Dokumenten,
  Anbieter – in dieser Reihenfolge. Danach steht jeder Auftrag mit Zustand in `leistungsauftraege`.
- Abgeschlossene Aufträge behalten keine Eingabe; nur offene gehen in die Sicherung, keine in den Vollexport.
- Neustart wiederholt Laufendes, außer `wirkung` („unterbrochen“). Der Wartungsmodus hält den Hintergrund an.
- Neuer Code ohne Einträge in `eslint-suppressions.json`.

Mehr im Entwicklerhandbuch unter *Kern → Leistungen*.
