-- „In der allgemeinen Suche zeigen“ (#1220): false = Mappen dieses Typs fehlen in der Suche über die Kopfzeile und als
-- Quelle von „Frag deine Ablage“ (z. B. reine Auswahllisten wie „Vertragsart“). NULL = Vorgabe (ja) – alles bleibt wie
-- bisher; true/false = vom Administrator eingestellt. Was das heißt, regelt der Server (shared/src/model.ts,
-- inAllgemeinerSuche) – hier steht nur die Einstellung.

-- Wie in 097: Trigger für den Lesestand (Migration 077) erst auslösen, sonst ginge ALTER TABLE in der gemeinsamen
-- Transaktion nicht („pending trigger events“).
SET CONSTRAINTS mappentypen_lesestand IMMEDIATE;
ALTER TABLE mappentypen ADD COLUMN IF NOT EXISTS in_suche boolean;
SET CONSTRAINTS mappentypen_lesestand DEFERRED;
