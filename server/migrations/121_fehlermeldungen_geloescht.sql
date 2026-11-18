-- „Meine Meldungen“ (#1331): Wer einen Fehler gemeldet hat, sieht seine Meldungen mit dem Status „offen“ oder „erledigt“.
--
-- Löscht die Verwaltung eine Meldung, entfernte Ablago bisher die ganze Zeile – der Melder sähe sie dann einfach
-- verschwinden. Künftig bleibt für ihn ein Rest mit Datum und Status „erledigt“; Text, Angaben und Bilder sind wirklich
-- gelöscht. Ohne eigene Spalte ließe sich dieser Rest nicht von einer gewöhnlichen Meldung unterscheiden, darum
-- `geloescht`. Der Index trägt die Liste je Melder (neueste zuerst).
ALTER TABLE fehlermeldungen ADD COLUMN geloescht timestamptz;
CREATE INDEX fehlermeldungen_melder ON fehlermeldungen (haushalt_id, benutzer_id, erstellt DESC);
