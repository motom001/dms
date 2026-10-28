-- Persönliche Favoriten (#62): je Benutzer und Mappe; im Papierkorb mit der Mappe.
CREATE TABLE favoriten (
  benutzer_id uuid NOT NULL REFERENCES benutzer(id) ON DELETE CASCADE,
  mappe_id    uuid NOT NULL REFERENCES mappen(id) ON DELETE CASCADE,
  haushalt_id uuid NOT NULL,
  erstellt    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (benutzer_id, mappe_id)
);
CREATE INDEX favoriten_mappe ON favoriten (mappe_id);
ALTER TABLE papierkorb ADD COLUMN favoriten jsonb;
