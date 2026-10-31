-- Paketverwaltung (#188): installierte Pakete je Haushalt – Version, Herkunft, wer wann,
-- welche Mappentypen und Sichten dazugehören (alles Weitere in daten).
CREATE TABLE IF NOT EXISTS pakete (
  haushalt_id  uuid NOT NULL REFERENCES haushalte(id),
  id           text NOT NULL,
  version      text NOT NULL,
  daten        jsonb NOT NULL,
  installiert  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (haushalt_id, id)
);
