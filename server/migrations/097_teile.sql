-- „Ist Teil einer anderen Mappe“ (#1031): Kennung des Verweisfelds, über das jede Mappe dieses Typs zu ihrer
-- übergeordneten Mappe gehört (z. B. Rechnungsposition → „rechnung“). NULL = eigenständig (wie bisher). Solche Mappen
-- erscheinen nur an der übergeordneten Mappe; das regelt der Server (shared/src/teile.ts) – hier steht nur die Einstellung.

-- Alle Migrationen laufen in einer Transaktion (server/src/db.ts). Hat eine frühere darin mappentypen geändert (z. B. 095),
-- wartet dessen Trigger für den Lesestand (Migration 077) noch, und ALTER TABLE ginge nicht („pending trigger events“).
-- Deshalb hier sofort auslösen und danach wieder auf „am Ende der Transaktion“ stellen – wie in 094.
SET CONSTRAINTS mappentypen_lesestand IMMEDIATE;
ALTER TABLE mappentypen ADD COLUMN IF NOT EXISTS teil_von text;
SET CONSTRAINTS mappentypen_lesestand DEFERRED;
