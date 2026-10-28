-- API-Schlüssel (#20): gehören einem Benutzer und haben höchstens dessen Rechte.
-- Gespeichert wird nur der SHA-256-Hash; sichtbar bleibt der Anfang (praefix).
CREATE TABLE api_schluessel (
  id               uuid PRIMARY KEY,
  benutzer_id      uuid NOT NULL REFERENCES benutzer(id) ON DELETE CASCADE,
  name             text NOT NULL,
  praefix          text NOT NULL,
  hash             text NOT NULL UNIQUE,
  recht            text NOT NULL CHECK (recht IN ('lesen', 'schreiben')),
  ablauf           timestamptz,
  erstellt         timestamptz NOT NULL DEFAULT now(),
  zuletzt_benutzt  timestamptz
);
CREATE INDEX api_schluessel_benutzer_idx ON api_schluessel (benutzer_id);
