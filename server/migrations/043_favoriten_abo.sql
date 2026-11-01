-- Favorit = Abo (#422).
-- 1. Je Favorit „bei Änderungen benachrichtigen“. NULL heißt an (Vorgabe) – so passen auch Favoriten, die vor
--    dieser Migration in den Papierkorb gewandert sind und beim Wiederherstellen ohne diese Spalte zurückkommen.
ALTER TABLE favoriten ADD COLUMN benachrichtigen boolean;

-- 2. Wann hat ein Benutzer eine Mappe zuletzt gesehen (geöffnet oder „als gesehen markiert“)? Grundlage für die
--    Hervorhebung geänderter Favoriten und eigener Mappen in Listen.
CREATE TABLE gesehen (
  benutzer_id uuid NOT NULL REFERENCES benutzer(id) ON DELETE CASCADE,
  mappe_id    uuid NOT NULL REFERENCES mappen(id) ON DELETE CASCADE,
  haushalt_id uuid NOT NULL,
  zeit        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (benutzer_id, mappe_id)
);
CREATE INDEX gesehen_mappe ON gesehen (mappe_id);

-- 3. Gebündelte Benachrichtigung „Mappe hat sich geändert“ als Aufgabe der Art „aenderung“ (Liste erweitern wie in 041).
DO $$
DECLARE d text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO d FROM pg_constraint WHERE conname = 'aufgaben_art_check' AND conrelid = 'aufgaben'::regclass;
  IF d IS NOT NULL AND position('''aenderung''' IN d) = 0 THEN
    ALTER TABLE aufgaben DROP CONSTRAINT aufgaben_art_check;
    EXECUTE 'ALTER TABLE aufgaben ADD CONSTRAINT aufgaben_art_check ' || replace(d, 'ARRAY[', 'ARRAY[''aenderung''::text, ');
  END IF;
END $$;
