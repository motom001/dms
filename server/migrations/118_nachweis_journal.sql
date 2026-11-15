-- Nachweis-Journal (#1053, #1253): je Eintrag eine Zeile statt eines JSON-Werts je Monat in `einstellungen`.
-- Eine Fehlanmeldung kostet so nur noch ein kurzes Einfügen bzw. Hochzählen – nicht mehr Lesen und Neuschreiben des
-- ganzen Monats (bis 2000 Einträge). Die alten Werte `nachweise:JJJJ-MM` übernimmt der Server beim Start
-- (nachweisjournal.ts, `uebernimmAltesJournal`) – auch aus einer eingespielten älteren Sicherung.
CREATE TABLE IF NOT EXISTS nachweis_journal (
  nr           bigserial PRIMARY KEY,
  haushalt_id  uuid NOT NULL REFERENCES haushalte(id),
  monat        text NOT NULL,
  art          text NOT NULL,
  zeit         timestamptz NOT NULL,
  daten        jsonb NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS nachweis_journal_monat ON nachweis_journal (haushalt_id, monat, nr);

-- Zähler je Monat: `eintraege` = alle Versuche einzutragen (Einträge plus „weitere“ über der Grenze), dazu reine
-- Zähler ohne Einzelheiten (`zugang.fehlanmeldung_unbekannt`). Hochgezählt mit `anzahl + 1` in einer Anweisung.
CREATE TABLE IF NOT EXISTS nachweis_zaehler (
  haushalt_id  uuid NOT NULL REFERENCES haushalte(id),
  monat        text NOT NULL,
  art          text NOT NULL,
  anzahl       bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (haushalt_id, monat, art)
);
