-- Register am Mappentyp, Titel-Vorlage statt Titelfeld, Dokumente an Mappen.

ALTER TABLE mappentypen
  ADD COLUMN titel_vorlage text NOT NULL DEFAULT '',
  ADD COLUMN register jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Bisheriges Titelfeld wird zur Vorlage „{feld}“.
UPDATE mappentypen SET titel_vorlage = '{' || titel_feld || '}' WHERE titel_feld <> '';

-- Bestehende Typen bekommen die drei Standardregister; alle Felder liegen auf „Allgemein“.
UPDATE mappentypen SET register = jsonb_build_array(
  jsonb_build_object('key', 'allgemein', 'name', 'Allgemein', 'art', 'felder',
    'felder', coalesce((SELECT jsonb_agg(f -> 'key') FROM jsonb_array_elements(felder) AS f), '[]'::jsonb)),
  jsonb_build_object('key', 'dokumente', 'name', 'Dokumente', 'art', 'dokumente'),
  jsonb_build_object('key', 'verknuepfungen', 'name', 'Verknüpfungen', 'art', 'verknuepfungen', 'quellen', '[]'::jsonb)
);

-- Die Datei selbst liegt im Dateiordner unter ihrem SHA-256; hier nur die Beschreibung.
-- Mehrere Dokumente dürfen dieselbe Datei teilen (gleicher Inhalt, nur einmal gespeichert).
CREATE TABLE dokumente (
  id            uuid PRIMARY KEY,
  haushalt_id   uuid NOT NULL REFERENCES haushalte(id),
  mappe_id      uuid NOT NULL REFERENCES mappen(id) ON DELETE CASCADE,
  register_key  text NOT NULL,
  name          text NOT NULL,
  mime          text NOT NULL,
  groesse       bigint NOT NULL,
  sha256        text NOT NULL,
  anzeigbar     boolean NOT NULL DEFAULT false,
  erstellt      timestamptz NOT NULL DEFAULT now(),
  erstellt_von  uuid REFERENCES benutzer(id) ON DELETE SET NULL
);
CREATE INDEX dokumente_mappe_idx ON dokumente (mappe_id);
CREATE INDEX dokumente_sha_idx ON dokumente (haushalt_id, sha256);
