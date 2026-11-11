-- Gleichbedeutende Wörter als eigener Werkbank-Bereich (#992).
--
-- 1. Konfliktschutz beim Speichern wie bei Mappentypen (#917): Jede Gruppe trägt den Zeitpunkt ihrer letzten Änderung
--    (auf Millisekunden, wie in der API). Wer ändert, schickt ihn als „stand“ mit; hat seitdem jemand anderes
--    gespeichert, kommt 409 und nichts wird überschrieben. Bestehende Gruppen bekommen den Zeitpunkt ihres Anlegens.
-- 2. Der neue Bereich „woerter“ (vorher Teil von „Suche und Volltext“ = „texterkennung“): Wer den Bereich
--    „texterkennung“ verwalten durfte, darf auch den neuen – sonst verlöre er die Wörter durch das Update. Ebenso
--    die Leiste: Wer „Suche und Volltext“ ein- oder ausgeblendet hat, für den gilt das auch für den neuen Bereich.
--
-- Beim Update laufen alle offenen Migrationen in einer Transaktion: ausstehende Lesestand-Trigger (077) früherer
-- Migrationen erst auslösen (wie 094/098); das Ändern der Einstellungen unten löst den Trigger wieder aus.
SET CONSTRAINTS mappentypen_lesestand, pakete_lesestand, einstellungen_lesestand IMMEDIATE;
ALTER TABLE synonyme ADD COLUMN IF NOT EXISTS geaendert timestamptz;
UPDATE synonyme SET geaendert = date_trunc('milliseconds', erstellt) WHERE geaendert IS NULL;
ALTER TABLE synonyme ALTER COLUMN geaendert SET DEFAULT date_trunc('milliseconds', now());
ALTER TABLE synonyme ALTER COLUMN geaendert SET NOT NULL;

UPDATE benutzer SET verwaltung = array_append(verwaltung, 'woerter')
  WHERE 'texterkennung' = ANY (verwaltung) AND NOT 'woerter' = ANY (verwaltung);

-- Leiste der Installation (ein/aus) und je Administrator (ein).
UPDATE einstellungen SET wert = jsonb_set(wert, '{ein}', (wert -> 'ein') || '"woerter"'::jsonb)
  WHERE (schluessel = 'werkbank_ansicht' OR schluessel LIKE 'werkbank\_ansicht:%')
    AND jsonb_typeof(wert -> 'ein') = 'array' AND (wert -> 'ein') ? 'texterkennung' AND NOT (wert -> 'ein') ? 'woerter';
UPDATE einstellungen SET wert = jsonb_set(wert, '{aus}', (wert -> 'aus') || '"woerter"'::jsonb)
  WHERE schluessel = 'werkbank_ansicht'
    AND jsonb_typeof(wert -> 'aus') = 'array' AND (wert -> 'aus') ? 'texterkennung' AND NOT (wert -> 'aus') ? 'woerter';
SET CONSTRAINTS mappentypen_lesestand, pakete_lesestand, einstellungen_lesestand DEFERRED;
