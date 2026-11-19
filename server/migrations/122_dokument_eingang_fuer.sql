-- Herkunft „für“ (#1489): Für wen ein Dokument aus einem Eingangskanal kam – beim E-Mail-Abruf die Einstellung „für“ des
-- Postfachs, beim Eingangsordner die Person des Unterordners. Die Zeile des Dokuments zeigt dann „per E-Mail · für Lena“
-- statt „hochgeladen · unbekannt“. Eine eigene Spalte, weil das Dokument die Post verlässt (Übernehmen in eine Mappe)
-- und „erstellt_von“ die Person bleibt, die hochgeladen hat (bei Eingangskanälen niemand). Ohne Fremdschlüssel wie
-- `erstellt_von` in alten Papierkorb-Einträgen: Ein gelöschtes Konto zeigt die Oberfläche als „gelöschter Benutzer“.
ALTER TABLE dokumente ADD COLUMN eingang_fuer uuid;
