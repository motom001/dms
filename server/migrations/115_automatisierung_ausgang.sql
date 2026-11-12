-- Dann-Karten nach außen (#671): „URL aufrufen“ und „E-Mail senden“.
--
-- automatisierung_ausgang: Ausgangskorb der Zustellungen – je Automatisierung, Karte, Ereignis und Empfänger genau
-- ein Eintrag (schluessel = Hash aus Adresse bzw. Empfänger). Der Auftrag (Adresse, Rumpf bzw. Betreff und Text) steht
-- nur, bis zugestellt, aufgegeben oder verworfen ist, dann NULL; Ziel (Rechner bzw. gekürzte Adresse), Zustand, Status
-- und Fehler bleiben 30 Tage für den Verlauf. Fällt die Automatisierung weg, gehen ihre Einträge mit. Nicht im
-- Vollexport (Protokoll, technisch).
--
-- automatisierung_geheimnisse: Geheimnis je Karte „URL aufrufen“ für die Signatur – verschlüsselt („dms1$…“,
-- Geheimnis-Art „aussen“, beim Schlüsselwechsel umgeschlüsselt). Nicht im Vollexport und nicht in den Fassungen.
--
-- Beim Update laufen alle offenen Migrationen in einer Transaktion: ausstehende Lesestand-Trigger (077) früherer
-- Migrationen erst auslösen (wie 094/097/098) – hier ändert sich keine dieser Tabellen, es schadet aber nicht.
SET CONSTRAINTS mappentypen_lesestand, pakete_lesestand, einstellungen_lesestand IMMEDIATE;

CREATE TABLE automatisierung_ausgang (
  id                 uuid PRIMARY KEY,
  haushalt_id        uuid NOT NULL REFERENCES haushalte(id),
  automatisierung_id uuid NOT NULL REFERENCES automatisierungen(id) ON DELETE CASCADE,
  karte              text NOT NULL,
  lauf_id            uuid,
  ereignis_id        text NOT NULL,
  art                text NOT NULL CHECK (art IN ('url', 'email')),
  schluessel         text NOT NULL,
  ziel               text NOT NULL,
  auftrag            jsonb,
  zustand            text NOT NULL DEFAULT 'offen' CHECK (zustand IN ('offen', 'zugestellt', 'aufgegeben', 'verworfen')),
  versuche           integer NOT NULL DEFAULT 0,
  faellig            timestamptz NOT NULL DEFAULT date_trunc('milliseconds', now()),
  status             integer,
  fehler             text,
  erstellt           timestamptz NOT NULL DEFAULT date_trunc('milliseconds', now()),
  erledigt           timestamptz,
  UNIQUE (automatisierung_id, karte, ereignis_id, schluessel),
  CHECK (zustand = 'offen' OR auftrag IS NULL)
);
CREATE INDEX automatisierung_ausgang_faellig_idx ON automatisierung_ausgang (haushalt_id, faellig) WHERE zustand = 'offen';
CREATE INDEX automatisierung_ausgang_verlauf_idx ON automatisierung_ausgang (automatisierung_id, erstellt DESC);
CREATE INDEX automatisierung_ausgang_mails_idx ON automatisierung_ausgang (haushalt_id, erstellt) WHERE art = 'email';

CREATE TABLE automatisierung_geheimnisse (
  automatisierung_id uuid NOT NULL REFERENCES automatisierungen(id) ON DELETE CASCADE,
  karte              text NOT NULL,
  haushalt_id        uuid NOT NULL REFERENCES haushalte(id),
  geheimnis          text NOT NULL,
  erstellt           timestamptz NOT NULL DEFAULT date_trunc('milliseconds', now()),
  erstellt_von       uuid REFERENCES benutzer(id) ON DELETE SET NULL,
  PRIMARY KEY (automatisierung_id, karte)
);

SET CONSTRAINTS mappentypen_lesestand, pakete_lesestand, einstellungen_lesestand DEFERRED;
