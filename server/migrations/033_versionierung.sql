-- Versionierung von Dokumenten (#194). Das Dokument (dokumente) ist immer die aktuelle Version;
-- ältere Versionen liegen in dokument_versionen. Ohne NOT NULL bei den neuen Spalten: Dokumente aus
-- dem Papierkorb (jsonb) kennen sie noch nicht.
ALTER TABLE dokumente
  ADD COLUMN IF NOT EXISTS version  integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS herkunft text;

CREATE TABLE IF NOT EXISTS dokument_versionen (
  dokument_id   uuid NOT NULL REFERENCES dokumente(id) ON DELETE CASCADE,
  haushalt_id   uuid NOT NULL REFERENCES haushalte(id),
  nummer        integer NOT NULL,
  name          text NOT NULL,
  mime          text NOT NULL,
  groesse       bigint NOT NULL,
  sha256        text NOT NULL,
  anzeigbar     boolean NOT NULL DEFAULT false,
  erstellt      timestamptz NOT NULL,
  erstellt_von  uuid REFERENCES benutzer(id) ON DELETE SET NULL,
  herkunft      text,
  -- Volltext dieser Version (wird nicht gesucht, bleibt für „Zurückholen“).
  volltext      text,
  PRIMARY KEY (dokument_id, nummer)
);
CREATE INDEX IF NOT EXISTS dokument_versionen_sha_idx ON dokument_versionen (haushalt_id, sha256);

-- Versionen wandern mit der Mappe in den Papierkorb.
ALTER TABLE papierkorb ADD COLUMN IF NOT EXISTS versionen jsonb NOT NULL DEFAULT '[]'::jsonb;
