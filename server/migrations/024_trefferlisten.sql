-- Mehrere Trefferlisten je Mappentyp (#75). Die bisherige Trefferliste wird zur Standardliste;
-- die Spalte trefferliste bleibt und enthält weiterhin die Spalten der Standardliste.
ALTER TABLE mappentypen ADD COLUMN trefferlisten jsonb;
UPDATE mappentypen SET trefferlisten = jsonb_build_array(jsonb_build_object(
  'key', 'standard', 'name', 'Standard', 'spalten', COALESCE(trefferliste, '[]'::jsonb), 'standard', true));
ALTER TABLE mappentypen ALTER COLUMN trefferlisten SET NOT NULL;

-- Eine Sicht kann eine Trefferliste wählen; NULL = Standard.
ALTER TABLE sichten ADD COLUMN trefferliste text;
