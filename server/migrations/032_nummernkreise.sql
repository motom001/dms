-- Nummernkreise (#171): fortlaufende Nummern für Textfelder; je Zeitraum ein Zählerstand.
CREATE TABLE IF NOT EXISTS nummernkreise (
  haushalt_id  uuid NOT NULL REFERENCES haushalte(id),
  schluessel   text NOT NULL,
  name         text NOT NULL,
  muster       text NOT NULL,
  start        bigint NOT NULL DEFAULT 1,
  -- Zeitraum ("2026-10", "2026", "immer" …) → zuletzt vergebener Zählerwert
  staende      jsonb NOT NULL DEFAULT '{}',
  zuletzt      jsonb NOT NULL DEFAULT '[]',
  erstellt     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (haushalt_id, schluessel)
);
