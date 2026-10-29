-- Volltextsuche nach Wortteilen (#161): „Ofen“ findet „Backofen“. Ein Trigramm-Index hält ILIKE schnell.
-- pg_trgm ist eine „vertrauenswürdige“ Erweiterung: Der Eigentümer der Datenbank darf sie anlegen.
-- Fehlt das Recht, läuft die Suche trotzdem – nur ohne Index langsamer.
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_trgm;
  EXECUTE 'CREATE INDEX IF NOT EXISTS dokumente_volltext_trgm_idx ON dokumente USING gin (volltext gin_trgm_ops)';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Trigramm-Index für die Volltextsuche nicht angelegt: %', SQLERRM;
END $$;
