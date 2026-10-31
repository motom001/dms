-- Archivnummer (#345): Nummer des Papieroriginals am Dokument (nicht an der Mappe), eindeutig je Haushalt.
ALTER TABLE dokumente ADD COLUMN IF NOT EXISTS archivnummer text;
CREATE UNIQUE INDEX IF NOT EXISTS dokumente_archivnummer ON dokumente (haushalt_id, lower(archivnummer)) WHERE archivnummer IS NOT NULL;
