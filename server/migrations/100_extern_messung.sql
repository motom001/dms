-- Externe Dienste (#565): Laufzeit, Datenmenge, Fehler und – bei KI-Diensten – Token und geschätzte Kosten.
-- Nur Metadaten: Dienst (ki, imap, smtp, oidc, netz), Paket, Funktion (z. B. „antworten“), Person, Dauer bis zur ersten
-- Antwort und gesamt, Bytes hin und zurück, Ergebnis, Token, Kosten. Nie Inhalte, Adressen, Betreffs oder URLs.
-- Rohdaten bleiben 35 Tage (ROH_TAGE in shared/src/extern.ts), dann gehen sie in die Monatssummen; diese bleiben
-- 24 Monate (MONATE). Wird eine Person gelöscht, bleiben ihre Werte ohne Person (ON DELETE SET NULL).
-- extern_monate hat keinen eindeutigen Schlüssel: Auswertungen summieren immer (zwei Prozesse dürfen gleichzeitig
-- verdichten, und SET NULL beim Löschen einer Person darf nie an einem Schlüssel scheitern).
-- Beim Update laufen alle offenen Migrationen in einer Transaktion: ausstehende Lesestand-Trigger (077) früherer
-- Migrationen erst auslösen (wie 094/098).
SET CONSTRAINTS mappentypen_lesestand, pakete_lesestand, einstellungen_lesestand IMMEDIATE;
CREATE TABLE IF NOT EXISTS extern_aufrufe (
  id          bigserial PRIMARY KEY,
  zeit        timestamptz NOT NULL DEFAULT now(),
  dienst      text NOT NULL CHECK (dienst IN ('ki', 'imap', 'smtp', 'oidc', 'netz')),
  paket       text,
  funktion    text,
  benutzer_id uuid REFERENCES benutzer(id) ON DELETE SET NULL,
  erste_ms    integer,
  ms          integer NOT NULL,
  hin         bigint NOT NULL DEFAULT 0,
  zurueck     bigint NOT NULL DEFAULT 0,
  ergebnis    text NOT NULL CHECK (ergebnis IN ('ok', 'fehler', 'zeit')),
  token_ein   integer NOT NULL DEFAULT 0,
  token_aus   integer NOT NULL DEFAULT 0,
  kosten      double precision NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS extern_aufrufe_zeit_idx ON extern_aufrufe (zeit DESC);
CREATE INDEX IF NOT EXISTS extern_aufrufe_benutzer_idx ON extern_aufrufe (benutzer_id) WHERE benutzer_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS extern_monate (
  id          bigserial PRIMARY KEY,
  monat       date NOT NULL,
  dienst      text NOT NULL,
  paket       text,
  funktion    text,
  benutzer_id uuid REFERENCES benutzer(id) ON DELETE SET NULL,
  anzahl      bigint NOT NULL DEFAULT 0,
  fehler      bigint NOT NULL DEFAULT 0,
  ms          bigint NOT NULL DEFAULT 0,
  token_ein   bigint NOT NULL DEFAULT 0,
  token_aus   bigint NOT NULL DEFAULT 0,
  kosten      double precision NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS extern_monate_monat_idx ON extern_monate (monat);
CREATE INDEX IF NOT EXISTS extern_monate_benutzer_idx ON extern_monate (benutzer_id) WHERE benutzer_id IS NOT NULL;
SET CONSTRAINTS mappentypen_lesestand, pakete_lesestand, einstellungen_lesestand DEFERRED;
