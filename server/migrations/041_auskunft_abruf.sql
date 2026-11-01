-- Auskunft zustellen (#455): Abruf-Links für eine Auskunft (ZIP) mit Abrufcode.
-- Gespeichert sind nur Hashes: der Schlüssel des Links als SHA-256 (256 Bit Zufall), der Abrufcode
-- mit scrypt. Die Zeile bleibt als Nachweis (abgerufen am …), auch wenn die ZIP schon gelöscht ist.
CREATE TABLE auskunft_links (
  id            uuid PRIMARY KEY,
  haushalt_id   uuid NOT NULL,
  auskunft_id   uuid NOT NULL,
  mappe_id      uuid NOT NULL REFERENCES mappen(id) ON DELETE CASCADE,
  titel         text NOT NULL DEFAULT '',
  schluessel    text NOT NULL UNIQUE,
  code          text NOT NULL,
  code_art      text NOT NULL CHECK (code_art IN ('erzeugt', 'eigen')),
  empfaenger    text,
  erstellt      timestamptz NOT NULL DEFAULT now(),
  erstellt_von  uuid,
  ablauf        timestamptz NOT NULL,
  max_abrufe    integer NOT NULL CHECK (max_abrufe > 0),
  abrufe        integer NOT NULL DEFAULT 0,
  fehlversuche  integer NOT NULL DEFAULT 0,
  gesperrt      timestamptz,
  widerrufen    timestamptz,
  abgerufen     timestamptz
);
CREATE INDEX auskunft_links_mappe ON auskunft_links (haushalt_id, mappe_id);
CREATE INDEX auskunft_links_auskunft ON auskunft_links (haushalt_id, auskunft_id);

-- Benachrichtigung „Auskunft wurde abgerufen“ als Aufgabe der Art „auskunft“. Die vorhandene Liste
-- erweitern statt sie neu aufzuzählen – so bleiben Arten erhalten, die andere Migrationen ergänzt haben.
DO $$
DECLARE d text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO d FROM pg_constraint WHERE conname = 'aufgaben_art_check' AND conrelid = 'aufgaben'::regclass;
  IF d IS NOT NULL AND position('''auskunft''' IN d) = 0 THEN
    ALTER TABLE aufgaben DROP CONSTRAINT aufgaben_art_check;
    EXECUTE 'ALTER TABLE aufgaben ADD CONSTRAINT aufgaben_art_check ' || replace(d, 'ARRAY[', 'ARRAY[''auskunft''::text, ');
  END IF;
END $$;
