-- „Ist Teil einer anderen Mappe“ (#1031): Kennung des Verweisfelds, über das jede Mappe dieses Typs zu ihrer
-- übergeordneten Mappe gehört (z. B. Rechnungsposition → „rechnung“). NULL = eigenständig (wie bisher). Solche Mappen
-- erscheinen nur an der übergeordneten Mappe; das regelt der Server (shared/src/teile.ts) – hier steht nur die Einstellung.
ALTER TABLE mappentypen ADD COLUMN teil_von text;
