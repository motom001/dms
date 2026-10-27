-- Grundgerüst: Haushalte, Mappentypen, Mappen und Verweise zwischen Mappen.
-- Jede fachliche Tabelle trägt haushalt_id, damit eine spätere Trennung
-- mehrerer Haushalte ohne Umbau möglich ist.

CREATE TABLE haushalte (
  id        uuid PRIMARY KEY,
  name      text NOT NULL,
  erstellt  timestamptz NOT NULL DEFAULT now()
);

-- Standardhaushalt, solange es keine Benutzerverwaltung gibt.
INSERT INTO haushalte (id, name) VALUES ('00000000-0000-4000-8000-000000000001', 'Mein Haushalt');

CREATE TABLE mappentypen (
  id            uuid PRIMARY KEY,
  haushalt_id   uuid NOT NULL REFERENCES haushalte(id),
  name          text NOT NULL,
  beschreibung  text NOT NULL DEFAULT '',
  titel_feld    text NOT NULL DEFAULT '',
  felder        jsonb NOT NULL DEFAULT '[]'::jsonb,
  erstellt      timestamptz NOT NULL DEFAULT now(),
  geaendert     timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX mappentypen_name_uq ON mappentypen (haushalt_id, lower(name));

CREATE TABLE mappen (
  id           uuid PRIMARY KEY,
  haushalt_id  uuid NOT NULL REFERENCES haushalte(id),
  typ_id       uuid NOT NULL REFERENCES mappentypen(id),
  werte        jsonb NOT NULL DEFAULT '{}'::jsonb,
  erstellt     timestamptz NOT NULL DEFAULT now(),
  geaendert    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX mappen_typ_idx ON mappen (haushalt_id, typ_id);
CREATE INDEX mappen_werte_idx ON mappen USING gin (werte jsonb_path_ops);

-- Verweise werden zusätzlich zu den Werten gespeichert: so lassen sich
-- Rückverweise schnell finden, und eine Mappe, auf die noch verwiesen
-- wird, kann nicht gelöscht werden.
CREATE TABLE verweise (
  quelle_id    uuid NOT NULL REFERENCES mappen(id) ON DELETE CASCADE,
  feld_key     text NOT NULL,
  ziel_id      uuid NOT NULL REFERENCES mappen(id),
  haushalt_id  uuid NOT NULL REFERENCES haushalte(id),
  PRIMARY KEY (quelle_id, feld_key, ziel_id)
);
CREATE INDEX verweise_ziel_idx ON verweise (ziel_id);
