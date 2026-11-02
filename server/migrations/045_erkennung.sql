-- Erkennung im Kern (#336, #391): Ergebnis der Erkennung je Post, einmal nach dem Volltext berechnet.
-- ergebnis: Absender-Treffer (Mappen-Ids mit Begründung), Angaben (Datum, Betrag, Nummern), Briefkopf und
-- Ziel-Vorschläge – ohne Titel; die Oberfläche zeigt nur, was der Benutzer lesen darf.
-- absender_id: der eindeutig erkannte Absender, für „frühere Post dieses Absenders ging an …“.
-- Fällt die Post weg (Papierkorb, endgültig gelöscht), fällt das Ergebnis mit; es lässt sich jederzeit neu berechnen.
CREATE TABLE erkennungen (
  mappe_id    uuid PRIMARY KEY REFERENCES mappen(id) ON DELETE CASCADE,
  haushalt_id uuid NOT NULL,
  absender_id uuid,
  ergebnis    jsonb NOT NULL,
  zeit        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX erkennungen_absender ON erkennungen (haushalt_id, absender_id) WHERE absender_id IS NOT NULL;
