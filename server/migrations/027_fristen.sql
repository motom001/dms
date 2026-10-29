-- Fristen (#129–#133): Aufgaben der Arten „frist“ (aus Datumsfeldern) und „erinnerung“ (frei),
-- mit dem Datum, um das es geht; noch nicht fällige freie Erinnerungen in eigener Tabelle.
ALTER TABLE aufgaben ADD COLUMN datum date;
ALTER TABLE aufgaben DROP CONSTRAINT IF EXISTS aufgaben_art_check;
ALTER TABLE aufgaben ADD CONSTRAINT aufgaben_art_check CHECK (art IN ('passung', 'erwaehnung', 'manuell', 'vertretung', 'frist', 'erinnerung'));
-- Je Mappe, Feld und Datum höchstens eine Frist – auch wenn der Lauf mehrmals am Tag kommt.
CREATE UNIQUE INDEX aufgaben_frist_idx ON aufgaben (mappe_id, feld_key, datum) WHERE art = 'frist';

CREATE TABLE erinnerungen (
  id            uuid PRIMARY KEY,
  haushalt_id   uuid NOT NULL REFERENCES haushalte(id),
  mappe_id      uuid NOT NULL REFERENCES mappen(id) ON DELETE CASCADE,
  empfaenger_id uuid REFERENCES benutzer(id) ON DELETE SET NULL,
  datum         date NOT NULL,
  text          text NOT NULL,
  erstellt      timestamptz NOT NULL DEFAULT now(),
  erstellt_von  uuid REFERENCES benutzer(id) ON DELETE SET NULL
);
CREATE INDEX erinnerungen_datum_idx ON erinnerungen (haushalt_id, datum);
CREATE INDEX erinnerungen_mappe_idx ON erinnerungen (mappe_id);
ALTER TABLE papierkorb ADD COLUMN erinnerungen jsonb NOT NULL DEFAULT '[]'::jsonb;
