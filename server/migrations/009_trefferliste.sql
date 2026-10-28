-- Trefferliste je Mappentyp (#19): Spalten in ihrer Reihenfolge (Feldschlüssel oder _titel, _erstellt, …).
ALTER TABLE mappentypen ADD COLUMN trefferliste jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Persönliche Einstellungen je Benutzer (#22 Sortierung, #21 Design).
CREATE TABLE benutzer_einstellungen (
  benutzer_id  uuid NOT NULL REFERENCES benutzer(id) ON DELETE CASCADE,
  schluessel   text NOT NULL,
  wert         jsonb NOT NULL,
  PRIMARY KEY (benutzer_id, schluessel)
);
