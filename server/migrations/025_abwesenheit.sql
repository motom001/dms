-- Abwesenheit mit Vertreter (#78) und Datum der Deaktivierung (#77).
ALTER TABLE benutzer
  ADD COLUMN abwesend boolean NOT NULL DEFAULT false,
  ADD COLUMN abwesend_von date,
  ADD COLUMN abwesend_bis date,
  ADD COLUMN vertreter_id uuid REFERENCES benutzer(id) ON DELETE SET NULL,
  ADD COLUMN deaktiviert timestamptz;

-- Neue Aufgabenart „Vertretung“: Hinweis an den Vertreter an der Mappe des Abwesenden.
ALTER TABLE aufgaben DROP CONSTRAINT IF EXISTS aufgaben_art_check;
ALTER TABLE aufgaben ADD CONSTRAINT aufgaben_art_check CHECK (art IN ('passung', 'erwaehnung', 'manuell', 'vertretung'));
