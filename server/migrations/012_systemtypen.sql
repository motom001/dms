-- Systemmappentypen Benutzer und Rolle (#26, #27) und je Mappentyp, ob in der Ablage
-- Mappen angelegt und gelöscht werden dürfen. Die Systemtypen selbst legt der Server
-- beim Start an (er kennt die Felder); hier nur die Spalten.

ALTER TABLE mappentypen
  ADD COLUMN system            text CHECK (system IN ('benutzer', 'rolle')),
  ADD COLUMN erstellen_erlaubt boolean NOT NULL DEFAULT true,
  ADD COLUMN loeschen_erlaubt  boolean NOT NULL DEFAULT true;
CREATE UNIQUE INDEX mappentypen_system_uq ON mappentypen (haushalt_id, system) WHERE system IS NOT NULL;

-- Mappen, die das System pflegt, z. B. die Systemrollen (rolle:admin, rolle:mitglied).
-- Die Mappe eines Benutzers hat dieselbe Id wie das Benutzerkonto.
ALTER TABLE mappen ADD COLUMN system_kennung text;
CREATE UNIQUE INDEX mappen_system_kennung_uq ON mappen (haushalt_id, system_kennung) WHERE system_kennung IS NOT NULL;
