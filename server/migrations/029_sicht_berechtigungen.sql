-- Berechtigungen an Sichten (#148): Standard und Regeln (R sehen, C anlegen), vererbt an Untersichten.
ALTER TABLE sichten ADD COLUMN IF NOT EXISTS berechtigungen jsonb;
