-- Mehrzahl eines Mappentyps (#1446): „12 Verträge“ statt „12 × Vertrag“ in Listen. Ausgangstext (Deutsch) wie Name und
-- „Woran man ihn erkennt“ in einer eigenen Spalte – die Beschriftungen tragen nur andere Sprachen
-- (beschriftungen.<sprache>.mehrzahl). Leer = keine Mehrzahl, die Liste zeigt wie bisher „n × Typ“.

-- Wie in 097 und 116: Trigger für den Lesestand (Migration 077) erst auslösen, sonst ginge ALTER TABLE in der
-- gemeinsamen Transaktion nicht („pending trigger events“).
SET CONSTRAINTS mappentypen_lesestand IMMEDIATE;
ALTER TABLE mappentypen ADD COLUMN IF NOT EXISTS mehrzahl text NOT NULL DEFAULT '';
SET CONSTRAINTS mappentypen_lesestand DEFERRED;
