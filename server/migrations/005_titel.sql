-- Titel einer Mappe wird vom Server aus der Titel-Vorlage berechnet und gespeichert,
-- damit Listen auf dem Server sortiert und seitenweise geladen werden können.
-- NULL = noch nicht berechnet; der Server zieht das beim Start nach.
ALTER TABLE mappen ADD COLUMN titel text;
CREATE INDEX mappen_titel_idx ON mappen (haushalt_id, typ_id, lower(titel));
