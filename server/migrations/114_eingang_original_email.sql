-- E-Mail-Postfach (#999): Eine abgeholte E-Mail ist genau eine Post; jeder Anhang wird ein eigenes Dokument in der
-- Reihenfolge der E-Mail, die E-Mail selbst (.eml) steht ganz hinten als „Original-E-Mail“.
--
-- eingang_nr: Platz in der Eingangsreihenfolge der Post (1, 2, 3 … wie in der MIME-Struktur der E-Mail). Die Post zeigt
--   ihre Dokumente in dieser Reihenfolge – auch nachdem eines bearbeitet wurde (neue Version, neue Datei). NULL bei
--   allem, was nicht aus dem Postfach kam (dann zählt der Zeitpunkt des Hochladens).
-- original_email: true = dieses Dokument ist die abgeholte E-Mail selbst (NULL oder false: nein; ohne NOT NULL, damit
--   Papierkorb-Einträge und Sicherungen von vorher ohne die Spalte zurückkommen). Hat die E-Mail Anhänge, hängt sie als
--   letzte Anlage (#998, anlage_zu) am letzten Anhang und wandert mit ihm; ohne Anhänge ist sie das Hauptdokument. Erkennung,
--   Klassifizieren und KI lassen sie immer weg.
--
-- ADD COLUMN ohne Vorgabe schreibt die Tabelle nicht um. Der Bestand bleibt, wie er ist: Ältere .eml aus dem
-- Postfach lassen sich nicht sicher von angehängten (weitergeleiteten) E-Mails unterscheiden und bekommen kein
-- Kennzeichen; ihre Reihenfolge ergibt sich wie bisher aus dem Zeitpunkt des Hochladens.
ALTER TABLE dokumente ADD COLUMN eingang_nr int CHECK (eingang_nr IS NULL OR eingang_nr > 0);
ALTER TABLE dokumente ADD COLUMN original_email boolean;
