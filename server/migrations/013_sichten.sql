-- Verwaltete Sichten der Ablage (#38) mit Bedingungen (#40, #41).
-- Eine Sicht zeigt Mappen ihrer Mappentypen, die ihre Bedingungen erfüllen; Sichten bilden
-- einen Baum (eltern_id). typen und bedingungen als JSON, weil sie nur zusammen gelesen werden.
CREATE TABLE sichten (
  id           uuid PRIMARY KEY,
  haushalt_id  uuid NOT NULL REFERENCES haushalte(id),
  name         text NOT NULL,
  beschreibung text NOT NULL DEFAULT '',
  eltern_id    uuid REFERENCES sichten(id) ON DELETE SET NULL,
  position     integer NOT NULL DEFAULT 0,
  typen        jsonb NOT NULL DEFAULT '[]',
  bedingungen  jsonb NOT NULL DEFAULT '[]',
  erstellt     timestamptz NOT NULL DEFAULT now(),
  geaendert    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sichten_haushalt_idx ON sichten (haushalt_id);

-- Umzug: Bisher gab es eine Sicht je Mappentyp. Sie bekommt die Id des Mappentyps, damit
-- Lesezeichen (/ablage/<id>/…) und gemerkte Sortierungen (sortierung:<id>) gültig bleiben.
INSERT INTO sichten (id, haushalt_id, name, beschreibung, position, typen)
SELECT t.id, t.haushalt_id, t.name, t.beschreibung,
       row_number() OVER (PARTITION BY t.haushalt_id ORDER BY lower(t.name))::int * 10,
       jsonb_build_array(t.id::text)
FROM mappentypen t;

-- Für Bedingungen auf die Anzahl der Dokumente je Register (#41).
CREATE INDEX IF NOT EXISTS dokumente_mappe_register_idx ON dokumente (mappe_id, register_key);
