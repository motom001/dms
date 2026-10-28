-- Fehlermeldungen von Benutzern an die Administratoren (#70).
CREATE TABLE fehlermeldungen (
  id           uuid PRIMARY KEY,
  haushalt_id  uuid NOT NULL,
  benutzer_id  uuid REFERENCES benutzer(id) ON DELETE SET NULL,
  erstellt     timestamptz NOT NULL DEFAULT now(),
  text         text NOT NULL,
  angaben      jsonb NOT NULL DEFAULT '{}'::jsonb,
  bilder       jsonb NOT NULL DEFAULT '[]'::jsonb,
  erledigt     timestamptz,
  erledigt_von uuid REFERENCES benutzer(id) ON DELETE SET NULL
);
CREATE INDEX fehlermeldungen_offen ON fehlermeldungen (haushalt_id, erledigt, erstellt DESC);
