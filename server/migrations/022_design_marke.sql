-- Logo und Schriftzug je Design (#72). schriftzug NULL = „DMS“, '' = nur Logo; logo = {sha256, mime, groesse}.
ALTER TABLE designs ADD COLUMN schriftzug text;
ALTER TABLE designs ADD COLUMN logo jsonb;
