-- Notfallkontakte (#812): Vertrauenspersonen für das Notfallblatt („Wen fragen?“), ohne Konto und ohne Rechte.
--
-- Je Kontakt: Name, E-Mail, Telefon, Notiz (nur für das Notfallblatt, nie in der Mail), der Haken „Antworten an meine
-- E-Mail-Adresse“ (Vorgabe aus), wer ihn eingetragen hat (Id und Name zum Zeitpunkt) und der Stand der Info-Mail
-- („offen“, solange kein E-Mail-Versand eingerichtet ist; „verschickt“; „fehler“). Personenbezogene Daten Dritter:
-- in Sicherung (wie jede Tabelle), Vollexport und Auskunft; beim Löschen ist die Zeile weg.
--
-- Beim Update laufen alle offenen Migrationen in einer Transaktion: ausstehende Lesestand-Trigger (077) früherer
-- Migrationen erst auslösen (wie 094/097/098) – hier ändert sich keine dieser Tabellen, es schadet aber nicht.
SET CONSTRAINTS mappentypen_lesestand, pakete_lesestand, einstellungen_lesestand IMMEDIATE;

CREATE TABLE notfallkontakte (
  id                   uuid PRIMARY KEY,
  haushalt_id          uuid NOT NULL REFERENCES haushalte(id),
  name                 text NOT NULL,
  email                text NOT NULL,
  telefon              text NOT NULL DEFAULT '',
  notiz                text NOT NULL DEFAULT '',
  antwort_an           boolean NOT NULL DEFAULT false,
  eingetragen_von      uuid REFERENCES benutzer(id) ON DELETE SET NULL,
  eingetragen_von_name text NOT NULL DEFAULT '',
  mail_stand           text NOT NULL DEFAULT 'offen' CHECK (mail_stand IN ('offen', 'verschickt', 'fehler')),
  mail_am              timestamptz,
  mail_fehler          text,
  erstellt             timestamptz NOT NULL DEFAULT date_trunc('milliseconds', now()),
  geaendert            timestamptz NOT NULL DEFAULT date_trunc('milliseconds', now())
);
CREATE INDEX notfallkontakte_haushalt_idx ON notfallkontakte (haushalt_id, erstellt);

SET CONSTRAINTS mappentypen_lesestand, pakete_lesestand, einstellungen_lesestand DEFERRED;
