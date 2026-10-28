-- Sitzungen sichtbar machen (#13): eigene Id, Gerät, letzte Aktivität.
ALTER TABLE sitzungen ADD COLUMN id uuid NOT NULL DEFAULT gen_random_uuid();
CREATE UNIQUE INDEX sitzungen_id_uq ON sitzungen (id);
ALTER TABLE sitzungen ADD COLUMN zuletzt_aktiv timestamptz NOT NULL DEFAULT now();
ALTER TABLE sitzungen ADD COLUMN geraet text NOT NULL DEFAULT '';
ALTER TABLE sitzungen ADD COLUMN ip text NOT NULL DEFAULT '';

-- Als anderer Benutzer anmelden (#16): Wer hat wann als wer agiert?
-- Der betroffene Benutzer sieht das bei seiner nächsten Anmeldung (gesehen).
CREATE TABLE vertretungen (
  id           uuid PRIMARY KEY,
  benutzer_id  uuid NOT NULL REFERENCES benutzer(id) ON DELETE CASCADE,
  admin_id     uuid REFERENCES benutzer(id) ON DELETE SET NULL,
  admin_name   text NOT NULL,
  beginn       timestamptz NOT NULL DEFAULT now(),
  ende         timestamptz,
  gesehen      timestamptz
);
CREATE INDEX vertretungen_benutzer_idx ON vertretungen (benutzer_id) WHERE gesehen IS NULL;
ALTER TABLE sitzungen ADD COLUMN vertretung_id uuid REFERENCES vertretungen(id) ON DELETE CASCADE;
