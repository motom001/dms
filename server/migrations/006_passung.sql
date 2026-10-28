-- Ob eine Mappe zur aktuellen Definition ihres Typs passt, wird gespeichert, damit
-- der Eingang und die Zähler ohne Laden aller Mappen auskommen.
-- NULL = noch nicht geprüft; der Server holt das beim Start nach.
ALTER TABLE mappen ADD COLUMN passt boolean;
ALTER TABLE mappen ALTER COLUMN passt SET DEFAULT true;
ALTER TABLE mappen ADD COLUMN problem text;
CREATE INDEX mappen_unpassend_idx ON mappen (haushalt_id, typ_id) WHERE passt IS NOT TRUE;
