-- Hinweise von Paketen an Mappen (#1034): Ein Paket mit „dms:hinweise“ setzt an einer Mappe, die es schreiben darf,
-- unter einem eigenen Schlüssel einen kurzen Hinweis (nur Text, höchstens 300 Zeichen, höchstens 3 je Paket und Mappe –
-- das prüft der Server). Hinweise ändern die Mappe nicht (kein „zuletzt geändert“, keine Historie) und gehen mit ihr
-- bzw. mit dem Paket weg. Berechnete Felder selbst brauchen keine Migration: Sie stehen als „berechnetVon“ an den Feldern
-- des Mappentyps (jsonb).
CREATE TABLE mappen_hinweise (
  haushalt_id uuid NOT NULL REFERENCES haushalte(id),
  mappe_id    uuid NOT NULL REFERENCES mappen(id) ON DELETE CASCADE,
  paket_id    text NOT NULL,
  schluessel  text NOT NULL,
  text        text NOT NULL,
  gesetzt     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (mappe_id, paket_id, schluessel)
);
CREATE INDEX mappen_hinweise_paket_idx ON mappen_hinweise (haushalt_id, paket_id);
