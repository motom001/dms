-- Erkannte Post automatisch zuordnen (#337): Aufgabe „Automatisch zugeordnet – bitte prüfen“ (Art „zugeordnet“)
-- an den Empfänger. Liste der Arten erweitern wie in 041 und 043. Die Einstellung je Mappentyp liegt in den
-- Einstellungen (erkennung_typen), die Zuordnung selbst an der Erkennung der Post (erkennungen.ergebnis → auto).
DO $$
DECLARE d text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO d FROM pg_constraint WHERE conname = 'aufgaben_art_check' AND conrelid = 'aufgaben'::regclass;
  IF d IS NOT NULL AND position('''zugeordnet''' IN d) = 0 THEN
    ALTER TABLE aufgaben DROP CONSTRAINT aufgaben_art_check;
    EXECUTE 'ALTER TABLE aufgaben ADD CONSTRAINT aufgaben_art_check ' || replace(d, 'ARRAY[', 'ARRAY[''zugeordnet''::text, ');
  END IF;
END $$;
