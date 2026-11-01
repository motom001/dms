-- Paket-Läufer (#338), Stufe 1.
-- Dienstkonten: technische Benutzer, je Paket mit Code einer. Sie melden sich nie an
-- (kein Passwort, keine Sitzung), erscheinen in keiner Benutzerliste und arbeiten nur
-- über die API mit einem Schlüssel, den der Läufer bei jedem Start neu bekommt.
ALTER TABLE benutzer ADD COLUMN IF NOT EXISTS art text NOT NULL DEFAULT 'person';
ALTER TABLE benutzer ADD COLUMN IF NOT EXISTS paket_id text;
DO $$ BEGIN
  ALTER TABLE benutzer ADD CONSTRAINT benutzer_art CHECK (art IN ('person', 'dienst'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE UNIQUE INDEX IF NOT EXISTS benutzer_dienstkonto ON benutzer (haushalt_id, paket_id) WHERE art = 'dienst';

-- Ereignisse für Pakete (Ausgangskorb): je abonnierendem Paket eine Zeile, Zustellung mit Wiederholung.
CREATE TABLE IF NOT EXISTS paket_ereignisse (
  id           uuid PRIMARY KEY,
  haushalt_id  uuid NOT NULL REFERENCES haushalte(id),
  paket_id     text NOT NULL,
  art          text NOT NULL,
  daten        jsonb NOT NULL DEFAULT '{}'::jsonb,
  erstellt     timestamptz NOT NULL DEFAULT now(),
  faellig      timestamptz NOT NULL DEFAULT now(),
  versuche     int NOT NULL DEFAULT 0,
  zugestellt   timestamptz,
  fehler       text
);
CREATE INDEX IF NOT EXISTS paket_ereignisse_offen ON paket_ereignisse (haushalt_id, faellig) WHERE zugestellt IS NULL;

-- Code installierter Pakete: code/modul.wasm und code/daten/… (gehört in die Sicherung wie das Paket selbst).
CREATE TABLE IF NOT EXISTS paket_code (
  haushalt_id  uuid NOT NULL REFERENCES haushalte(id),
  paket_id     text NOT NULL,
  name         text NOT NULL,
  inhalt       bytea NOT NULL,
  PRIMARY KEY (haushalt_id, paket_id, name)
);
