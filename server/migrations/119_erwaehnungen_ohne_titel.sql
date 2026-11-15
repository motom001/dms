-- Erwähnungen ohne Titel (#1293): Bisher stand eine Erwähnung als @[Titel](mappe:<id>) im Text, also mit dem Titel von
-- damals – und ging so auch an Personen hinaus, die die erwähnte Mappe nicht lesen dürfen. Ab jetzt steht nur die
-- Kennung im Text (@[](mappe:<id>), ältere @[](benutzer:<id>)); den Titel setzt erst die Ausgabe ein, nach den Rechten
-- der lesenden Person.
--
-- Diese Migration nimmt die Titel aus dem Bestand: Notizen, Werte der Mappen (nur Zeichenketten; das Muster ist so eng,
-- dass es nur Erwähnungen trifft), Mappen und Notizen im Papierkorb und die Historie. In der Historie stehen Notizen als
-- Markdown (voll, alt, neu) – dort genügt dasselbe. Daneben steht derselbe Text schon als reiner Text (Vorschau „text“,
-- „vorher“, Aufgabentext, Änderungen formatierter Felder „aenderungen[].alt/neu“), in dem die Erwähnung nur noch als
-- „@Titel“ steht.
-- Dort ersetzt die Migration „@Titel“ durch „@…“ für jeden Titel, der vorher in einer Erwähnung derselben Mappe stand
-- (Werte, Notizen, Papierkorb, Historie) – auch abgeschnitten am Ende einer Vorschau („@Titel …“).
-- Ältere Sicherungen laufen beim Wiederherstellen durch dieselbe Migration.

CREATE FUNCTION dms_119_ohne_titel(t text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT regexp_replace(t, '@\[[^]\n]{1,80}\]\((benutzer|mappe):([0-9a-fA-F-]{36})\)', '@[](\1:\2)', 'gi')
$$;

CREATE FUNCTION dms_119_werte(w jsonb) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN jsonb_typeof(w) = 'object' THEN coalesce((
    SELECT jsonb_object_agg(k, CASE WHEN jsonb_typeof(v) = 'string' THEN to_jsonb(dms_119_ohne_titel(v #>> '{}')) ELSE v END)
    FROM jsonb_each(w) AS e(k, v)), '{}'::jsonb) ELSE w END
$$;

-- Titel aus den Erwähnungen eines Texts.
CREATE FUNCTION dms_119_namen(t text) RETURNS SETOF text LANGUAGE sql IMMUTABLE AS $$
  SELECT m[1] FROM regexp_matches(coalesce(t, ''), '@\[([^]\n]{1,80})\]\((?:benutzer|mappe):[0-9a-fA-F-]{36}\)', 'gi') AS m
$$;

-- Texte aller Zeichenketten eines jsonb-Objekts (Werte einer Mappe), ohne JSON-Maskierung.
CREATE FUNCTION dms_119_texte(w jsonb) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN jsonb_typeof(w) = 'object' THEN (SELECT string_agg(v, E'\n') FROM jsonb_each_text(w) AS e(k, v) WHERE jsonb_typeof(w -> k) = 'string') END
$$;

-- „@Titel“ im reinen Text durch „@…“ ersetzen; längere Titel zuerst. Abgeschnittene Vorschau: „@Tit …“.
CREATE FUNCTION dms_119_klartext(t text, namen text[]) RETURNS text LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  n text;
  k int;
BEGIN
  IF t IS NULL OR namen IS NULL OR position('@' IN t) = 0 THEN RETURN t; END IF;
  FOREACH n IN ARRAY namen LOOP
    t := replace(t, '@' || n, '@…');
    FOR k IN REVERSE length(n) - 1 .. 1 LOOP
      t := replace(t, '@' || left(n, k) || ' …', '@… …');
    END LOOP;
  END LOOP;
  RETURN t;
END
$$;

CREATE FUNCTION dms_119_historie(d jsonb, namen text[]) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  k text;
BEGIN
  IF jsonb_typeof(d) <> 'object' THEN RETURN d; END IF;
  FOREACH k IN ARRAY ARRAY['voll', 'alt', 'neu'] LOOP
    IF jsonb_typeof(d -> k) = 'string' THEN d := jsonb_set(d, ARRAY[k], to_jsonb(dms_119_ohne_titel(d ->> k))); END IF;
  END LOOP;
  FOREACH k IN ARRAY ARRAY['text', 'vorher', 'aufgabentext'] LOOP
    IF jsonb_typeof(d -> k) = 'string' THEN d := jsonb_set(d, ARRAY[k], to_jsonb(dms_119_klartext(d ->> k, namen))); END IF;
  END LOOP;
  IF jsonb_typeof(d -> 'aenderungen') = 'array' THEN
    d := jsonb_set(d, '{aenderungen}', (
      SELECT coalesce(jsonb_agg(
        CASE WHEN jsonb_typeof(a) = 'object' THEN a
          || CASE WHEN jsonb_typeof(a -> 'alt') = 'string' THEN jsonb_build_object('alt', dms_119_klartext(a ->> 'alt', namen)) ELSE '{}'::jsonb END
          || CASE WHEN jsonb_typeof(a -> 'neu') = 'string' THEN jsonb_build_object('neu', dms_119_klartext(a ->> 'neu', namen)) ELSE '{}'::jsonb END
        ELSE a END ORDER BY i), '[]'::jsonb)
      FROM jsonb_array_elements(d -> 'aenderungen') WITH ORDINALITY AS x(a, i)));
  END IF;
  RETURN d;
END
$$;

-- 1. Titel je Mappe sammeln, bevor sie aus dem Markdown verschwinden.
CREATE TEMP TABLE dms_119_titel ON COMMIT DROP AS
SELECT mappe_id, array_agg(n ORDER BY length(n) DESC, n) AS namen FROM (
  SELECT id AS mappe_id, dms_119_namen(dms_119_texte(werte)) AS n FROM mappen WHERE werte::text LIKE '%](%:%'
  UNION SELECT mappe_id, dms_119_namen(text) FROM notizen WHERE text LIKE '%](%:%'
  UNION SELECT id, dms_119_namen(dms_119_texte(mappe -> 'werte')) FROM papierkorb WHERE mappe::text LIKE '%](%:%'
  UNION SELECT p.id, dms_119_namen(x ->> 'text') FROM papierkorb p, jsonb_array_elements(CASE WHEN jsonb_typeof(p.notizen) = 'array' THEN p.notizen ELSE '[]'::jsonb END) AS x
    WHERE p.notizen::text LIKE '%](%:%'
  UNION SELECT mappe_id, dms_119_namen(concat_ws(E'\n', daten ->> 'voll', daten ->> 'alt', daten ->> 'neu')) FROM historie WHERE daten::text LIKE '%](%:%'
) AS t WHERE n <> '' GROUP BY mappe_id;

-- 2. Historie: Markdown ohne Titel, reiner Text mit „@…“.
UPDATE historie h SET daten = dms_119_historie(h.daten, t.namen)
FROM dms_119_titel t WHERE t.mappe_id = h.mappe_id AND h.daten::text LIKE '%@%';

-- 3. Notizen, Werte, Papierkorb.
UPDATE notizen SET text = dms_119_ohne_titel(text) WHERE text LIKE '%@[%](%:%';
UPDATE mappen SET werte = dms_119_werte(werte) WHERE werte::text LIKE '%@[%](%:%';
UPDATE papierkorb SET mappe = jsonb_set(mappe, '{werte}', dms_119_werte(mappe -> 'werte'))
  WHERE jsonb_typeof(mappe -> 'werte') = 'object' AND (mappe -> 'werte')::text LIKE '%@[%](%:%';
UPDATE papierkorb SET notizen = (
  SELECT coalesce(jsonb_agg(CASE WHEN jsonb_typeof(x -> 'text') = 'string' THEN jsonb_set(x, '{text}', to_jsonb(dms_119_ohne_titel(x ->> 'text'))) ELSE x END ORDER BY i), '[]'::jsonb)
  FROM jsonb_array_elements(notizen) WITH ORDINALITY AS e(x, i))
  WHERE jsonb_typeof(notizen) = 'array' AND notizen::text LIKE '%@[%](%:%';

DROP FUNCTION dms_119_historie(jsonb, text[]);
DROP FUNCTION dms_119_klartext(text, text[]);
DROP FUNCTION dms_119_texte(jsonb);
DROP FUNCTION dms_119_namen(text);
DROP FUNCTION dms_119_werte(jsonb);
DROP FUNCTION dms_119_ohne_titel(text);
