-- Zeitmessung (#11): Entwicklermodus je Benutzer, im eigenen Profil schaltbar.
ALTER TABLE benutzer ADD COLUMN entwicklermodus boolean NOT NULL DEFAULT false;

-- Einstellungen des Haushalts als Schlüssel/Wert (z. B. Schwelle für lange Datenbankzugriffe).
CREATE TABLE einstellungen (
  haushalt_id  uuid NOT NULL REFERENCES haushalte(id),
  schluessel   text NOT NULL,
  wert         jsonb NOT NULL,
  PRIMARY KEY (haushalt_id, schluessel)
);

-- Lange Datenbankzugriffe (#12).
CREATE TABLE langlaeufer (
  id         bigserial PRIMARY KEY,
  zeit       timestamptz NOT NULL DEFAULT now(),
  dauer_ms   integer NOT NULL,
  zugriff    text NOT NULL,
  anfrage    text NOT NULL DEFAULT '',
  benutzer   text NOT NULL DEFAULT ''
);
CREATE INDEX langlaeufer_zeit_idx ON langlaeufer (zeit DESC);
