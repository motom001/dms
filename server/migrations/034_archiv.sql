-- Archivmodus je Mappentyp (#212): {jahre, stichtag}; null = aus.
ALTER TABLE mappentypen ADD COLUMN IF NOT EXISTS archiv jsonb;
