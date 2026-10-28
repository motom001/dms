-- Notizen an Mappen (#55): zusätzliche Infos, ohne den Inhalt der Mappe zu ändern.
CREATE TABLE notizen (
  id            uuid PRIMARY KEY,
  haushalt_id   uuid NOT NULL REFERENCES haushalte(id),
  mappe_id      uuid NOT NULL REFERENCES mappen(id) ON DELETE CASCADE,
  text          text NOT NULL,
  erstellt      timestamptz NOT NULL DEFAULT now(),
  erstellt_von  uuid REFERENCES benutzer(id) ON DELETE SET NULL,
  geaendert     timestamptz NOT NULL DEFAULT now(),
  geaendert_von uuid REFERENCES benutzer(id) ON DELETE SET NULL
);
CREATE INDEX notizen_mappe_idx ON notizen (mappe_id, erstellt);
-- Im Papierkorb ziehen Notizen mit um.
ALTER TABLE papierkorb ADD COLUMN notizen jsonb NOT NULL DEFAULT '[]'::jsonb;
