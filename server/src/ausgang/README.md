# Ausgang (#1077)

**Zweck:** Alle Wege, auf denen Dateien und Daten Ablago verlassen, an einer Stelle – und eine gemeinsame
Prüfstelle für sie (#723): Herunterladen (Dokument, Version, Fassung, API), E-Mail (eine und mehrere Mappen),
Export (Tabelle, ZIP, PDF) und das WebDAV-Laufwerk. Schicht 3 der Zielaufteilung – über Mappen, Dokumenten und Kern.

- `pruefstelle.ts` (früher `ausgang.ts`) – die Regel „R heißt ansehen, E heißt mitnehmen“: `mitnehmbar`,
  `pruefeAlle`, die Meldungen (`verboten`, `sichtVerboten`). Kennt nur Lesen und Exportrecht, keinen Dienst.
- `ausgang.dienst.ts` – `AusgangDienst`: `exportierbar` (Regel A, #294), `mitnehmbar`, `pruefeAusgang`; Stempel
  (`mitStempel`, `stempelPlan`, `laufwerkStempel`, `laufwerkAusgabe`, #394, #722), `notiereWeitergabe`, Original oder
  Archivfassung (`archivWahl`, `ausgabeQuelle`, #631, #715), `dokumentFuerAusgabe`, `fassungFuerAusgabe` und
  `gestempelteSeiten` (#799), `dokumenteJeMappe`.
- `email.ts` – `AusgangEmail` (#58, #151): `versendeMappen`, `versendeMappe`, `emailKopf` (auch für Auskünfte),
  Anhänge, Post mit dem Verschickten.
- `export.ts` – `AusgangExport` (#152, #153): `exportiere`.
- `index.ts` – die einzige Tür. `ausgang.routen.ts` (Vollexport, persönlicher Export) holt `routen.ts` direkt.

**Abhängigkeiten**

- `AusgangDienst` bekommt den **Kern**, die Rechteprüfung, Mappentypen, Historie, Dokumente, Sichten und die
  Stempel-Vorlagen (`pdf-bearbeiten/`); E-Mail und Export dazu den `AusgangDienst`, E-Mail die Systemmappen (`post/`).
- Über den Anschluss: `entsperrtZu` (geschützte PDFs) und – wichtig – die Prüfstelle selbst: E-Mail ruft
  `pruefeAusgang`, Export `mitnehmbar` über die **Fassade des Dienstes**, wie Routen, `routen-kontext.ts` und
  `webdav.ts`. So fragt jeder Weg dieselbe Stelle (Test: `ausgang.test.ts` ersetzt sie am Dienst).
- Importiert nur sich selbst, Kern, tiefere Fachordner, `sichten/`, `post/`, `pdf-bearbeiten/` (je über `index.ts`),
  `shared/`, die Basis, `arbeit/` und Werkzeuge (`ausgabe.ts`, `export.ts`, `zip.ts`, `xlsx.ts`, `mail.ts`) – Regel
  `fachordner`, Schicht 3.

**Regeln**

- Ein neuer Weg nach draußen fragt `dienst.pruefeAusgang` bzw. `dienst.mitnehmbar`, bevor irgendetwas geschieht –
  nie eine eigene Prüfung. Er steht im Entwicklerhandbuch unter *Wege nach draußen*.
- Reihenfolge bleibt: E-Mail erst prüfen, dann Mailserver, versenden, Post anlegen, Historie; Export erst Ansicht und
  Prüfstelle, dann Verwaltungsmodus-Spur, Datei, Historie.
- Neuer Code ohne neue Einträge in `eslint-suppressions.json` (umgetragen: `complexity` und `max-params` in
  `email.ts`, `complexity` und `max-lines-per-function` in `export.ts`).

Mehr im Entwicklerhandbuch unter *Aufbau → Ausgang*.
