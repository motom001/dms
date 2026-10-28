-- Papierkorb (#43): Gelöschte Mappen ziehen samt ihren Verweisen und Dokumenten hierher um.
-- So bleiben alle Abfragen auf mappen unverändert, eindeutige Werte werden frei, und
-- Wiederherstellen legt die Zeilen wieder an. Die Dateien bleiben im Dateiordner, bis der
-- Papierkorb geleert wird.
CREATE TABLE papierkorb (
  id             uuid PRIMARY KEY,
  haushalt_id    uuid NOT NULL REFERENCES haushalte(id),
  -- Ein Mappentyp lässt sich nicht löschen, solange Mappen von ihm im Papierkorb liegen.
  typ_id         uuid NOT NULL REFERENCES mappentypen(id),
  mappe          jsonb NOT NULL,
  verweise       jsonb NOT NULL DEFAULT '[]'::jsonb,
  dokumente      jsonb NOT NULL DEFAULT '[]'::jsonb,
  geloescht      timestamptz NOT NULL DEFAULT now(),
  geloescht_von  uuid REFERENCES benutzer(id) ON DELETE SET NULL
);
CREATE INDEX papierkorb_haushalt_idx ON papierkorb (haushalt_id, geloescht);
CREATE INDEX papierkorb_von_idx ON papierkorb (geloescht_von);
