-- Dokument umbenennen (#1594): Der Name, den das Dokument vor der ersten Umbenennung trug (meist der Dateiname beim
-- Hochladen). Bleibt bei weiteren Umbenennungen gleich; NULL = nie umbenannt. Eine eigene Spalte, weil die Historie der
-- Mappe gekürzt werden kann und der ursprüngliche Name an der Datei sichtbar bleiben soll.
ALTER TABLE dokumente ADD COLUMN name_original text;

-- Scans mit hoher Auflösung (#1600): Bilder über 300 dpi rechnet Ablago für Texterkennung und Bildanalyse intern auf
-- 300 dpi herunter; das Original bleibt. Hier steht, für welche Datei (sha256) mit welcher Auflösung des Originals
-- (dpi) – für den Hinweis am Dokument. Gilt nur, solange sha256 gleich ist (wie die Leerseiten).
ALTER TABLE dokumente ADD COLUMN verkleinert jsonb;
