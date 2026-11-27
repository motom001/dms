-- Codes auf Dokumenten (#1723): Was ein Paket mit dms:codes auf den Seiten gelesen hat (QR-Codes, Barcodes) – je Code
-- Art, Inhalt und Seite, so wie die Leistung dokument.lesen.barcode@1 sie liefert –, für „Aus Dokument ausfüllen“.
-- Gilt nur, solange sha256 gleich ist (wie verkleinert); NULL = noch nicht gelesen. Eine eigene Spalte statt der
-- Historie: Die Codes sind abgeleitet und werden bei einer neuen Datei neu gelesen. Nicht im Vollexport (eine Such-ID
-- im Code ist ein Zugangsschlüssel).
ALTER TABLE dokumente ADD COLUMN codes jsonb;
