-- Berechtigungen (#123): je Mappentyp Grundeinstellung und Regeln; NULL = alles erteilt, keine Regeln.
ALTER TABLE mappentypen ADD COLUMN berechtigungen jsonb;
