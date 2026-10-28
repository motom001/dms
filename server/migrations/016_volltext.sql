-- Texterkennung und Volltextsuche (#45).
-- volltext: vorhandene Textebene des PDFs oder Ergebnis der Texterkennung.
-- ocr_stand: keiner (noch nie), wartet, laeuft, fertig, fehler, ausgelassen (z. B. Dateityp aus).
-- Bewusst ohne NOT NULL: Dokumente aus dem Papierkorb (jsonb) kennen die Spalten evtl. noch nicht.
ALTER TABLE dokumente
  ADD COLUMN volltext   text,
  ADD COLUMN ocr_stand  text DEFAULT 'keiner' CHECK (ocr_stand IN ('keiner', 'wartet', 'laeuft', 'fertig', 'fehler', 'ausgelassen')),
  ADD COLUMN ocr_info   text,
  ADD COLUMN ocr_seiten integer,
  ADD COLUMN ocr_zeit   timestamptz;
UPDATE dokumente SET ocr_stand = 'keiner' WHERE ocr_stand IS NULL;

-- Deutsche Volltextsuche (Stammformen: „Rechnungen“ findet „Rechnung“).
CREATE INDEX dokumente_volltext_idx ON dokumente USING gin (to_tsvector('german', coalesce(volltext, '')));
-- Warteschlange der Texterkennung.
CREATE INDEX dokumente_ocr_idx ON dokumente (haushalt_id, ocr_stand, erstellt) WHERE ocr_stand IN ('wartet', 'laeuft');
