-- Aufruf von außen (#679): eigene Adresse mit Geheimnis je Automatisierung (Wenn-Karte „Aufruf von außen“).
--
-- Je Automatisierung höchstens eine Adresse: Kennung (32 Byte Zufall, base64url, eindeutig) und Geheimnis für die
-- Signatur – verschlüsselt mit dem Tresor („dms1$…“, Geheimnis-Art „aufruf“, beim Schlüsselwechsel umgeschlüsselt).
-- Wer sie angelegt hat und seit wann das Geheimnis gilt. Wird die Automatisierung gelöscht, geht die Zeile mit. In der
-- Sicherung wie jede Tabelle; nicht im Vollexport und nicht in den Fassungen (nur die Konfiguration).
--
-- Beim Update laufen alle offenen Migrationen in einer Transaktion: ausstehende Lesestand-Trigger (077) früherer
-- Migrationen erst auslösen (wie 094/097/098) – hier ändert sich keine dieser Tabellen, es schadet aber nicht.
SET CONSTRAINTS mappentypen_lesestand, pakete_lesestand, einstellungen_lesestand IMMEDIATE;

CREATE TABLE automatisierung_aufrufe (
  automatisierung_id uuid PRIMARY KEY REFERENCES automatisierungen(id) ON DELETE CASCADE,
  haushalt_id        uuid NOT NULL REFERENCES haushalte(id),
  kennung            text NOT NULL UNIQUE CHECK (kennung ~ '^[A-Za-z0-9_-]{43}$'),
  geheimnis          text NOT NULL,
  erstellt           timestamptz NOT NULL DEFAULT date_trunc('milliseconds', now()),
  erstellt_von       uuid REFERENCES benutzer(id) ON DELETE SET NULL,
  geheimnis_seit     timestamptz NOT NULL DEFAULT date_trunc('milliseconds', now())
);
CREATE INDEX automatisierung_aufrufe_haushalt_idx ON automatisierung_aufrufe (haushalt_id, erstellt);

SET CONSTRAINTS mappentypen_lesestand, pakete_lesestand, einstellungen_lesestand DEFERRED;
