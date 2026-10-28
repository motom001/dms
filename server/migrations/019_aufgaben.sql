-- Aufgaben (#54, #56): Was ist an einer Mappe für wen zu tun?
-- passung: Mappe passt nicht zur Definition (erledigt sich selbst, sobald sie passt)
-- erwaehnung: @-Erwähnung in formatiertem Text; manuell: von einem Benutzer vergeben.
-- empfaenger_id NULL = Administratoren (z. B. Mappen ohne Ersteller).
CREATE TABLE aufgaben (
  id            uuid PRIMARY KEY,
  haushalt_id   uuid NOT NULL REFERENCES haushalte(id),
  mappe_id      uuid NOT NULL REFERENCES mappen(id) ON DELETE CASCADE,
  empfaenger_id uuid REFERENCES benutzer(id) ON DELETE SET NULL,
  art           text NOT NULL CHECK (art IN ('passung', 'erwaehnung', 'manuell')),
  text          text NOT NULL,
  feld_key      text,
  erstellt      timestamptz NOT NULL DEFAULT now(),
  erstellt_von  uuid REFERENCES benutzer(id) ON DELETE SET NULL,
  erledigt      timestamptz,
  erledigt_von  uuid REFERENCES benutzer(id) ON DELETE SET NULL
);
CREATE INDEX aufgaben_offen_idx ON aufgaben (haushalt_id, empfaenger_id) WHERE erledigt IS NULL;
CREATE INDEX aufgaben_mappe_idx ON aufgaben (mappe_id);
-- Im Papierkorb ziehen Aufgaben mit um.
ALTER TABLE papierkorb ADD COLUMN aufgaben jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Bisheriger Eingang: Mappen, die nicht passen, werden zu Aufgaben ihres Erstellers.
INSERT INTO aufgaben (id, haushalt_id, mappe_id, empfaenger_id, art, text)
SELECT gen_random_uuid(), haushalt_id, id, erstellt_von, 'passung', 'Passt nicht zur Definition' || coalesce(': ' || problem, '')
FROM mappen WHERE passt IS FALSE;
