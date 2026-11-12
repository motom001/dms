-- Fassungen der Automatisierungsvorlagen (#1044 → #1006): Ihr Änderungsverlauf zieht von `ablaufvorlage_fassungen` (105)
-- in die gemeinsame Tabelle `fassungen` (103) – wie die Automatisierungen in 103. Nummer, Zeit, Stand und Person bleiben;
-- ohne Person stammte die Fassung von einem Paket (Vorlage aus einem Paket) bzw. von Ablago.
--
-- Einträge, deren Vorlage es nicht mehr gibt, bekommen beim Start ihren Löschvermerk (Abgleich, fassungen.dienst.ts);
-- eine zurückgesetzte Kern-Vorgabe dort ihren heutigen Stand als „Update auf Ablago …“.
--
-- Beim Update laufen alle offenen Migrationen in einer Transaktion: ausstehende Lesestand-Trigger (077) früherer
-- Migrationen erst auslösen (wie 094/097/098).
SET CONSTRAINTS mappentypen_lesestand, pakete_lesestand, einstellungen_lesestand IMMEDIATE;

ALTER TABLE fassungen DROP CONSTRAINT fassungen_art_check;
ALTER TABLE fassungen ADD CONSTRAINT fassungen_art_check
  CHECK (art IN ('typ', 'sicht', 'nummernkreis', 'stempel', 'postfach', 'paketeinstellungen', 'automatisierung', 'ablaufvorlage'));

INSERT INTO fassungen (haushalt_id, art, eintrag, nr, name, daten, urheber, zeit, bis)
SELECT f.haushalt_id, 'ablaufvorlage', f.kennung, f.version, coalesce(f.daten->>'name', v.name, f.kennung), f.daten,
  CASE WHEN f.von IS NOT NULL THEN jsonb_build_object('art', 'person', 'id', f.von)
       WHEN v.herkunft = 'paket' AND v.paket_id IS NOT NULL THEN jsonb_build_object('art', 'paket', 'id', v.paket_id)
       ELSE '{"art": "system"}'::jsonb END,
  f.zeit, f.zeit
FROM ablaufvorlage_fassungen f LEFT JOIN ablaufvorlagen v ON v.haushalt_id = f.haushalt_id AND v.kennung = f.kennung
ON CONFLICT DO NOTHING;
DROP TABLE ablaufvorlage_fassungen;

SET CONSTRAINTS mappentypen_lesestand, pakete_lesestand, einstellungen_lesestand DEFERRED;
