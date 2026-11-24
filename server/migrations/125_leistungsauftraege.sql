-- Aufträge an Leistungen (#1569): direkt (`leistung.abrufen`) und im Hintergrund (`leistung.beauftragen`). Ein Prozess
-- nimmt sich einen Auftrag mit Sperre (SKIP LOCKED) und einer Frist (`gesperrt_bis`); stirbt er, wird der Auftrag nach
-- der Frist wieder frei – außer Aufträgen mit Wirkung nach außen (`wirkung`), die werden „unterbrochen“.
-- Abgeschlossene Aufträge behalten keine Eingabe und werden nach der eingestellten Aufbewahrung gelöscht (24/48/96 h);
-- in die Sicherung gehen nur offene (Merkzettel, server/src/sicherung/datenbankabzug.ts), in den Vollexport keine.
CREATE TABLE leistungsauftraege (
  id            uuid PRIMARY KEY,
  haushalt_id   uuid NOT NULL REFERENCES haushalte(id),
  leistung      text NOT NULL,
  art           text NOT NULL CHECK (art IN ('direkt', 'hintergrund')),
  zustand       text NOT NULL CHECK (zustand IN ('wartet', 'laeuft', 'fertig', 'fehlgeschlagen', 'angehalten', 'unterbrochen')),
  eingabe       jsonb,
  kontext       jsonb,
  ziel          jsonb,
  wer           jsonb NOT NULL,
  wirkung       boolean NOT NULL DEFAULT false,
  zeitgrenze_s  int NOT NULL,
  anbieter      text,
  daten         jsonb,
  dokument      uuid,
  fehler        jsonb,
  versuche      int NOT NULL DEFAULT 0,
  erstellt      timestamptz NOT NULL DEFAULT now(),
  begonnen      timestamptz,
  beendet       timestamptz,
  gesperrt_bis  timestamptz
);
CREATE INDEX leistungsauftraege_offen ON leistungsauftraege (haushalt_id, erstellt, id) WHERE zustand IN ('wartet', 'laeuft');
CREATE INDEX leistungsauftraege_beendet ON leistungsauftraege (haushalt_id, beendet) WHERE beendet IS NOT NULL;
