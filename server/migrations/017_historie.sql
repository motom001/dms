-- Änderungshistorie je Mappe (#57): nur anhängen, nie ändern.
-- Ohne Fremdschlüssel auf mappen: Die Historie überlebt das endgültige Löschen noch eine
-- einstellbare Frist (Werkbank → Papierkorb).
CREATE TABLE historie (
  id           bigserial PRIMARY KEY,
  haushalt_id  uuid NOT NULL REFERENCES haushalte(id),
  mappe_id     uuid NOT NULL,
  zeit         timestamptz NOT NULL DEFAULT now(),
  benutzer_id  uuid REFERENCES benutzer(id) ON DELETE SET NULL,
  art          text NOT NULL,
  daten        jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX historie_mappe_idx ON historie (mappe_id, zeit DESC, id DESC);
CREATE INDEX historie_endgueltig_idx ON historie (haushalt_id, zeit) WHERE art = 'endgueltig';
