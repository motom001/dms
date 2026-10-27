-- Benutzer, Sitzungen und Links zum Setzen des Passworts.
-- Dazu feste Indexwerte an Mappen: wer hat sie angelegt und zuletzt geändert.

CREATE TABLE benutzer (
  id                uuid PRIMARY KEY,
  haushalt_id       uuid NOT NULL REFERENCES haushalte(id),
  email             text NOT NULL,
  name              text NOT NULL DEFAULT '',
  rolle             text NOT NULL CHECK (rolle IN ('admin', 'mitglied')),
  passwort_hash     text,
  aktiv             boolean NOT NULL DEFAULT true,
  erstellt          timestamptz NOT NULL DEFAULT now(),
  letzte_anmeldung  timestamptz
);
CREATE UNIQUE INDEX benutzer_email_uq ON benutzer (lower(email));

-- Gespeichert wird nur ein Hash des Sitzungsschlüssels, nie der Schlüssel selbst.
CREATE TABLE sitzungen (
  schluessel_hash  text PRIMARY KEY,
  benutzer_id      uuid NOT NULL REFERENCES benutzer(id) ON DELETE CASCADE,
  erstellt         timestamptz NOT NULL DEFAULT now(),
  ablauf           timestamptz NOT NULL
);
CREATE INDEX sitzungen_benutzer_idx ON sitzungen (benutzer_id);

CREATE TABLE passwort_links (
  schluessel_hash  text PRIMARY KEY,
  benutzer_id      uuid NOT NULL REFERENCES benutzer(id) ON DELETE CASCADE,
  zweck            text NOT NULL CHECK (zweck IN ('einladung', 'zuruecksetzen')),
  erstellt         timestamptz NOT NULL DEFAULT now(),
  ablauf           timestamptz NOT NULL,
  benutzt          timestamptz
);
CREATE INDEX passwort_links_benutzer_idx ON passwort_links (benutzer_id);

ALTER TABLE mappen
  ADD COLUMN erstellt_von  uuid REFERENCES benutzer(id) ON DELETE SET NULL,
  ADD COLUMN geaendert_von uuid REFERENCES benutzer(id) ON DELETE SET NULL;
CREATE INDEX mappen_erstellt_von_idx ON mappen (erstellt_von);
