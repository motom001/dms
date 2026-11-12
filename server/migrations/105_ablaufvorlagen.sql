-- Automatisierungsvorlagen und Mappen-Abläufe (#1044): „Aufgabe vergeben“ und „Erinnern“ laufen über einen Motor.
--
-- 1. Die freien Erinnerungen (#131) werden Mappen-Abläufe der Kern-Vorlage „Erinnern“: Tabelle umbenannt, dazu die
--    Kennung der Vorlage und „angehalten“. Ein Ablauf läuft mit den Rechten der Person in `erstellt_von` (geprüft erst,
--    wenn er läuft). Sicherheit: Die Umstellung übernimmt den heutigen Ersteller; ist er unbekannt oder kein Mensch
--    (Paket- bzw. Systemkonto, etwa „Automatisierung“), läuft der Ablauf als der Empfänger selbst – nie als Systemkonto.
--    Datum, Text, Empfänger und Vertretung bleiben, wie sie waren: Am Datum entsteht dieselbe Aufgabe „Erinnerung“.
--    Offene, von Hand vergebene Aufgaben sind schon gelaufene Abläufe von „Aufgabe vergeben“ (sofort) – sie bleiben
--    unverändert stehen, mit ihrem Ersteller.
-- 2. `ablaufvorlagen`: gespeicherte Vorlagen je Kennung – eigene, aus Paketen und geänderte Kern-Vorgaben. Eine
--    unveränderte Kern-Vorgabe steht hier nicht (der Kern kennt sie); ein Paket, das sie überlagert, legt eine Zeile mit
--    ihrer Kennung an und nimmt sie beim Entfernen wieder weg.
-- 3. `ablaufvorlage_fassungen`: Änderungsverlauf; `ablauf_verlauf`: was mit Abläufen geschah (sofort angewendet,
--    geplant, gelaufen, angehalten, gelöscht, fortgesetzt) – auch Grundlage der Bremse je Person.
--
-- Beim Update laufen alle offenen Migrationen in einer Transaktion: ausstehende Lesestand-Trigger (077) früherer
-- Migrationen erst auslösen (wie 094/097/098).
SET CONSTRAINTS mappentypen_lesestand, pakete_lesestand, einstellungen_lesestand IMMEDIATE;

ALTER TABLE erinnerungen RENAME TO mappen_ablaeufe;
ALTER INDEX erinnerungen_datum_idx RENAME TO mappen_ablaeufe_datum_idx;
ALTER INDEX erinnerungen_mappe_idx RENAME TO mappen_ablaeufe_mappe_idx;
ALTER TABLE mappen_ablaeufe ADD COLUMN vorlage text NOT NULL DEFAULT 'erinnern';
ALTER TABLE mappen_ablaeufe ADD COLUMN angehalten jsonb;
CREATE INDEX mappen_ablaeufe_person_idx ON mappen_ablaeufe (haushalt_id, erstellt_von, mappe_id);
CREATE INDEX mappen_ablaeufe_vorlage_idx ON mappen_ablaeufe (haushalt_id, vorlage);

UPDATE mappen_ablaeufe e SET erstellt_von = e.empfaenger_id
  WHERE e.erstellt_von IS NULL OR NOT EXISTS (SELECT 1 FROM benutzer b WHERE b.id = e.erstellt_von AND b.art = 'person');

CREATE TABLE ablaufvorlagen (
  haushalt_id   uuid NOT NULL REFERENCES haushalte(id),
  kennung       text NOT NULL,
  name          text NOT NULL,
  reihenfolge   integer NOT NULL DEFAULT 50,
  daten         jsonb NOT NULL,
  aktiv         boolean NOT NULL DEFAULT true,
  herkunft      text NOT NULL CHECK (herkunft IN ('kern', 'eigen', 'paket')),
  paket_id      text,
  version       integer NOT NULL DEFAULT 1,
  geaendert     timestamptz NOT NULL DEFAULT now(),
  geaendert_von uuid,
  PRIMARY KEY (haushalt_id, kennung)
);

-- Vorlagen gehören zum Gemerkten für alle (Lesespeicher, #741): Mappe öffnen fragt sie nicht jedes Mal ab.
CREATE CONSTRAINT TRIGGER ablaufvorlagen_lesestand AFTER INSERT OR UPDATE OR DELETE ON ablaufvorlagen
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION dms_lesestand();
CREATE TRIGGER ablaufvorlagen_lesestand_leeren AFTER TRUNCATE ON ablaufvorlagen FOR EACH STATEMENT EXECUTE FUNCTION dms_lesestand_alle();

CREATE TABLE ablaufvorlage_fassungen (
  haushalt_id uuid NOT NULL REFERENCES haushalte(id),
  kennung     text NOT NULL,
  version     integer NOT NULL,
  daten       jsonb NOT NULL,
  von         uuid,
  zeit        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (haushalt_id, kennung, version)
);

CREATE TABLE ablauf_verlauf (
  id          uuid PRIMARY KEY,
  haushalt_id uuid NOT NULL REFERENCES haushalte(id),
  vorlage     text NOT NULL,
  mappe_id    uuid,
  ablauf_id   uuid,
  person_id   uuid,
  art         text NOT NULL CHECK (art IN ('angewendet', 'geplant', 'gelaufen', 'angehalten', 'geloescht', 'fortgesetzt')),
  text        text NOT NULL DEFAULT '',
  zeit        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ablauf_verlauf_vorlage_idx ON ablauf_verlauf (haushalt_id, vorlage, zeit DESC);
CREATE INDEX ablauf_verlauf_person_idx ON ablauf_verlauf (haushalt_id, person_id, zeit DESC);

SET CONSTRAINTS mappentypen_lesestand, pakete_lesestand, einstellungen_lesestand DEFERRED;
