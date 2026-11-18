-- Werkbank: „Rundgänge“ erst ab der Stufe Betrieb (#1298).
--
-- Der Bereich stand seit #941 ab Haushalt in der Leiste. Wer ihn schon genutzt hat – eigene Rundgänge geschrieben oder
-- einen mitgelieferten ausgeschaltet (Einstellung `entdecken_werkbank`) –, soll ihn nach dem Update nicht verlieren: Er
-- bekommt „rundgaenge“ einmalig als Einblendung, wie früher der Expertenmodus (#987). Danach ist es eine gewöhnliche
-- Einblendung, die man unter „Werkbank anpassen“ wieder ausblenden kann – darum hier und nicht beim Lesen.
--
-- Betroffen sind nur Leisten, die den Bereich bisher zeigten: die Installation mit der Stufe Haushalt oder Selbständig
-- und die eigene Stufe einer Person (Haushalt oder Selbständig). Wer ihn ausgeblendet hatte, behält das.
--
-- Beim Update laufen alle offenen Migrationen in einer Transaktion: ausstehende Lesestand-Trigger (077) früherer
-- Migrationen erst auslösen (wie 094/098/101); das Ändern der Einstellungen unten löst den Trigger wieder aus.
SET CONSTRAINTS mappentypen_lesestand, pakete_lesestand, einstellungen_lesestand IMMEDIATE;

WITH eingerichtet AS (
  SELECT haushalt_id FROM einstellungen
  WHERE schluessel = 'entdecken_werkbank'
    AND (
      (jsonb_typeof(wert -> 'rundgaenge') = 'array' AND jsonb_array_length(wert -> 'rundgaenge') > 0)
      OR (jsonb_typeof(wert -> 'aus') = 'array'
          AND EXISTS (SELECT 1 FROM jsonb_array_elements_text(wert -> 'aus') AS a(k) WHERE a.k LIKE 'rundgang:%'))
    )
)
UPDATE einstellungen e SET wert = jsonb_set(e.wert, '{ein}', (e.wert -> 'ein') || '"rundgaenge"'::jsonb)
  FROM eingerichtet g
  WHERE e.haushalt_id = g.haushalt_id
    AND (e.schluessel = 'werkbank_ansicht' OR e.schluessel LIKE 'werkbank\_ansicht:%')
    AND e.wert ->> 'vorlage' IN ('haushalt', 'selbstaendig')
    AND jsonb_typeof(e.wert -> 'ein') = 'array' AND NOT (e.wert -> 'ein') ? 'rundgaenge'
    AND NOT COALESCE(jsonb_typeof(e.wert -> 'aus') = 'array' AND (e.wert -> 'aus') ? 'rundgaenge', false);

SET CONSTRAINTS mappentypen_lesestand, pakete_lesestand, einstellungen_lesestand DEFERRED;
