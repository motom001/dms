-- Verlauf eines Pakets (#1003): was Ablago dem Paket zugestellt hat und wie es lief (Ergebnis, Dauer, Speicher,
-- Netzaufrufe), seine Protokollzeilen, dazu Installieren, Aktualisieren, Einstellungen geändert und Ausprobieren
-- (#1004) – nie Inhalte aus Dokumenten. Ablago schreibt ihn selbst; das Paket nur über seine Protokollzeilen.
-- Aufbewahrung 30 Tage (die Auslastung zeigt bis zu 30 Tage), höchstens 5000 Einträge je Paket.
CREATE TABLE IF NOT EXISTS paket_verlauf (
  nr           bigserial PRIMARY KEY,
  haushalt_id  uuid NOT NULL REFERENCES haushalte(id),
  paket_id     text NOT NULL,
  zeit         timestamptz NOT NULL DEFAULT now(),
  art          text NOT NULL,
  was          text NOT NULL DEFAULT '',
  ergebnis     text,
  ms           int,
  speicher_mb  int,
  text         text NOT NULL DEFAULT '',
  wer          text,
  bezug        jsonb,
  netz         jsonb
);
CREATE INDEX IF NOT EXISTS paket_verlauf_paket ON paket_verlauf (haushalt_id, paket_id, nr DESC);
CREATE INDEX IF NOT EXISTS paket_verlauf_zeit ON paket_verlauf (haushalt_id, zeit);
