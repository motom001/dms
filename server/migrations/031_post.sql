-- Der Systemmappentyp „E-Mail“ (#58) wird zum Systemmappentyp „Post“ (#192).
-- Die Definition (neue Felder Stand, Kanal, Richtung, Für; „Zugeordnet zu“ mehrfach) zieht der
-- Server beim Start nach. Hier: Systemkennung, Schlüssel und die Werte der vorhandenen Mappen –
-- versendete E-Mails sind Post mit Kanal „E-Mail“, Richtung „Ausgehend“, Stand „Erledigt“.
ALTER TABLE mappentypen DROP CONSTRAINT IF EXISTS mappentypen_system_check;
UPDATE mappentypen SET system = 'post' WHERE system = 'email';
UPDATE mappentypen t SET schluessel = 'post'
WHERE t.system = 'post' AND t.schluessel = 'email'
  AND NOT EXISTS (SELECT 1 FROM mappentypen x WHERE x.haushalt_id = t.haushalt_id AND x.schluessel = 'post');
ALTER TABLE mappentypen ADD CONSTRAINT mappentypen_system_check CHECK (system IN ('benutzer', 'rolle', 'post'));

-- Vorhandene Werte gewinnen (falls der Administrator eigene Felder mit diesen Schlüsseln hatte);
-- „Bezug“ war ein einzelner Verweis und ist jetzt eine Liste.
UPDATE mappen m
SET werte = jsonb_build_object('kanal', 'E-Mail', 'richtung', 'Ausgehend', 'stand', 'Erledigt') || m.werte
  || CASE WHEN jsonb_typeof(m.werte -> 'bezug') = 'string' THEN jsonb_build_object('bezug', jsonb_build_array(m.werte -> 'bezug')) ELSE '{}'::jsonb END
FROM mappentypen t
WHERE m.typ_id = t.id AND t.system = 'post';

UPDATE papierkorb p
SET mappe = jsonb_set(p.mappe, '{werte}',
  jsonb_build_object('kanal', 'E-Mail', 'richtung', 'Ausgehend', 'stand', 'Erledigt') || coalesce(p.mappe -> 'werte', '{}'::jsonb)
  || CASE WHEN jsonb_typeof(p.mappe -> 'werte' -> 'bezug') = 'string' THEN jsonb_build_object('bezug', jsonb_build_array(p.mappe -> 'werte' -> 'bezug')) ELSE '{}'::jsonb END)
FROM mappentypen t
WHERE p.typ_id = t.id AND t.system = 'post';

-- Neue Post „Für“ jemanden steht als Aufgabe in dessen Eingang.
ALTER TABLE aufgaben DROP CONSTRAINT IF EXISTS aufgaben_art_check;
ALTER TABLE aufgaben ADD CONSTRAINT aufgaben_art_check CHECK (art IN ('passung', 'erwaehnung', 'manuell', 'vertretung', 'frist', 'erinnerung', 'post'));
