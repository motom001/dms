-- Anlagen (#998): Ein Dokument kann Anlagen haben – z. B. die Werkstattrechnung als Hauptdokument, dahinter HU/AU-Protokoll,
-- Auflistung der Arbeiten und Teilebestellung als Anlage 1, 2, 3. Jede Anlage ist ein eigenes Dokument (eigene Datei,
-- Versionen, Volltext, Archivfassung, Stempel) in derselben Mappe und demselben Register wie ihr Hauptdokument.
--
-- anlage_zu: das Hauptdokument (nie selbst eine Anlage – das prüft der Dienst); NULL = eigenes Dokument.
-- anlage_nr: Reihenfolge ab 1 („Anlage 1“, „Anlage 2“ …), nur zusammen mit anlage_zu von Bedeutung.
-- Hauptdokument und Anlagen wandern zusammen (verschieben, Papierkorb, Wiederherstellen – Dienst und Repo); ON DELETE
-- SET NULL ist nur die Rückfallebene: Eine Anlage geht nie mit dem endgültigen Löschen ihres Hauptdokuments verloren.
--
-- ADD COLUMN ohne Vorgabe schreibt die Tabelle nicht um; der Bestand bleibt ohne Anlagen. Ältere Sicherungen, Exporte
-- und Papierkorb-Einträge haben die Spalten nicht und kommen als eigene Dokumente zurück.
ALTER TABLE dokumente ADD COLUMN anlage_zu uuid REFERENCES dokumente(id) ON DELETE SET NULL;
ALTER TABLE dokumente ADD COLUMN anlage_nr int CHECK (anlage_nr IS NULL OR anlage_nr > 0);
ALTER TABLE dokumente ADD CONSTRAINT dokumente_anlage_nicht_selbst CHECK (anlage_zu IS NULL OR anlage_zu <> id);
CREATE INDEX dokumente_anlage_zu ON dokumente (anlage_zu) WHERE anlage_zu IS NOT NULL;
