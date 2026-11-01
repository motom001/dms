-- Mappe mit allen verknüpften Mappen löschen (#424): ein Papierkorb-Vorgang.
-- vorgang: gemeinsame Id aller Mappen, die zusammen gelöscht wurden (Id der Start-Mappe, wenn sie
--          dabei ist); gemeinsam wiederherstellbar. NULL = einzeln gelöscht.
-- entkoppelt: Verweise bleibender Mappen auf diese Mappe, die beim Löschen entfernt wurden
--          ([{"quelleId", "feldKey"}]); Wiederherstellen setzt sie wieder.
ALTER TABLE papierkorb ADD COLUMN IF NOT EXISTS vorgang uuid;
ALTER TABLE papierkorb ADD COLUMN IF NOT EXISTS entkoppelt jsonb NOT NULL DEFAULT '[]'::jsonb;
CREATE INDEX IF NOT EXISTS papierkorb_vorgang_idx ON papierkorb (haushalt_id, vorgang) WHERE vorgang IS NOT NULL;
