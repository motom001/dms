# Löschen (#1078)

**Zweck:** Mappen löschen und wiederherstellen an einer Stelle: ob eine Mappe weg darf, eine oder mehrere löschen,
mit allen verknüpften Mappen löschen, der Papierkorb, das Löschprotokoll lesen und verwalten und Beispiel-Mappen aus
Paketen. Schicht 3 der Zielaufteilung.

- `loeschen.dienst.ts` – `LoeschenDienst`: `loeschPruefung` (#79, Archivmodus #212), `loescheMappe`, `loescheMappen`
  (#150), `loescheMappeIntern`, `entferneMappenEndgueltig` (Zurückrollen, #878); dazu `LoeschenTeile` und
  `LoeschenAnschluss`.
- `papierkorb.ts` – `Papierkorb` (#43, #344, #936): Aufbewahrung, Einträge, wiederherstellen, endgültig löschen,
  leeren, `raeumePapierkorbAuf` (stündlich).
- `loeschprotokoll.ts` – `LoeschprotokollVerwaltung` (#470): Inhalt vor dem Löschen sammeln, Aufbewahrung, Ansicht,
  CSV/PDF, alle Einträge für den Vollexport. **Geschrieben** wird im Kern (`kern/loeschprotokoll.ts`, #961).
- `mit-verknuepften.ts` – `MitVerknuepften` (#396, #424): Baum-Sammlung, Vorschau, Löschen in einem Vorgang,
  Verweise wieder setzen, Vorgang wiederherstellen.
- `beispiele.ts` – `BeispielMappen` (#878): Stand, unverändert, entfernen.
- `index.ts` – die einzige Tür.

**Abhängigkeiten**

- Alle Klassen bekommen den Kern und dieselben `LoeschenTeile`: Rechteprüfung, Passung, Historie, Dokumente,
  Versionen, Ausgang (Dokumente je Mappe), Sichten (Statistik), Systemmappen (`post/`) – und einander
  (`baueLoeschen()` im Dienst).
- Über den Anschluss: Ereignis und `aktualisiereTitel` über die Fassade (Tests ersetzen beide am Dienst), Konten.
- Importiert nur sich selbst, Kern, Fachordner (je über `index.ts`), `shared/`, die Basis und die Werkzeuge `baum`
  und `schriftstueck`.

**Regeln**

- Löschen, Papierkorb und Wiederherstellen schreiben das Löschprotokoll im selben Ablauf wie bisher (gleicher Code);
  Ereignisse `mappe.geloescht` bzw. `mappe.endgueltig_geloescht` in derselben Reihenfolge.
- Wer eine Mappe löscht, fragt `loeschPruefung` – Anzeige und Löschen laufen nie auseinander.
- Umgetragen aus `dienst.ts`: zwei `complexity`, ein `max-lines-per-function`.

Mehr im Entwicklerhandbuch unter *Aufbau → Löschen*.
