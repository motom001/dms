-- Schlüssel am Mappentyp (#145): fest nach dem Anlegen, damit Umbenennen sprechende Links nicht bricht.
-- Gefüllt wird er beim Start aus dem Namen (Dienst.typSchluesselNachziehen).
ALTER TABLE mappentypen ADD COLUMN schluessel text;
CREATE UNIQUE INDEX mappentypen_schluessel_uq ON mappentypen (haushalt_id, schluessel) WHERE schluessel IS NOT NULL;
