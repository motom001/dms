-- Leerseiten (#997): Ein Paket mit „dms:leerseiten“ markiert Seiten eines Dokuments in neuer Post als leer; die Person
-- wählt je Seite „Doch behalten“ bzw. „Auch weglassen“. Gespeichert am Dokument als jsonb:
--   {"paket": "leerseiten", "paketName": "Leerseiten", "sha256": "…", "seiten": 6, "erkannt": [2, 4, 6],
--    "behalten": [4], "weglassen": [], "geaendert": "…"}
-- Die Markierung gilt nur für die Datei mit diesem Prüfwert; eine neue Fassung setzt sie zurück (repo-pg.ts). Sie ändert
-- weder Datei noch Mappe – weggelassen wird erst beim Übernehmen in eine Mappe (neue Fassung, das Original bleibt).
-- ADD COLUMN ohne Vorgabe schreibt die Tabelle nicht um; der Bestand bleibt leer.
ALTER TABLE dokumente ADD COLUMN leerseiten jsonb;
