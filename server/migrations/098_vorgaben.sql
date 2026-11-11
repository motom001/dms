-- Vorgaben aus Paketen (#1038): Mappen, die ein Paket zum Behalten mitbringt (z. B. die Vertragsarten „Strom“ oder
-- „Miete“), tragen ihre feste Kennung `paket:<id>:<schluessel>`. Die Kennung trennt die Pakete: Ein Paket findet nur
-- seine eigenen Vorgaben wieder – nie eine Mappe des Administrators oder die Vorgabe eines anderen Pakets, auch nicht
-- bei gleichem Schlüssel. Sie bleibt über Updates gleich (keine Doppel-Anlage) und auch, wenn das Paket entfernt wird
-- und die Mappe stehen bleibt: Eine neue Installation nimmt sie dann wieder auf, statt eine zweite anzulegen.
-- Was das Paket zuletzt geschrieben hat (Prüfwert, gelöschte Vorgaben, Vorlagen), steht im Eintrag des Pakets (jsonb).
-- Im Papierkorb wandert die Spalte mit der Mappe (to_jsonb) und kommt beim Wiederherstellen zurück.
-- Beim Update laufen alle offenen Migrationen in einer Transaktion: Ausstehende Lesestand-Trigger (077) früherer
-- Migrationen erst auslösen, sonst scheitert DDL mit „pending trigger events“ (wie 094).
SET CONSTRAINTS mappentypen_lesestand, pakete_lesestand, einstellungen_lesestand IMMEDIATE;
ALTER TABLE mappen ADD COLUMN IF NOT EXISTS vorgabe text;
CREATE INDEX IF NOT EXISTS mappen_vorgabe_idx ON mappen (haushalt_id, vorgabe) WHERE vorgabe IS NOT NULL;
SET CONSTRAINTS mappentypen_lesestand, pakete_lesestand, einstellungen_lesestand DEFERRED;
