-- Negative Beträge (#1035): Ein Betragsfeld erlaubt sie nur noch mit der Einstellung „negativ“ (Vorgabe aus, also
-- ≥ 0). Bisher hat Ablago negative Beträge ohne Minimum nicht abgelehnt. Damit gespeicherte Gutschriften gültig bleiben
-- und beim nächsten Speichern keinen Fehler zeigen, bekommen Betragsfelder, in denen schon ein negativer Betrag steht,
-- die Einstellung gleich gesetzt. Alle anderen bleiben, wie sie sind.
UPDATE mappentypen t SET felder = (
  SELECT jsonb_agg(
    CASE WHEN e.f ->> 'typ' = 'betrag' AND coalesce(e.f ->> 'negativ', '') <> 'true' AND EXISTS (
        SELECT 1 FROM mappen m
        WHERE m.typ_id = t.id AND jsonb_typeof(m.werte -> (e.f ->> 'key') -> 'betrag') = 'number'
          AND (m.werte -> (e.f ->> 'key') ->> 'betrag')::numeric < 0)
      THEN e.f || '{"negativ": true}'::jsonb ELSE e.f END
    ORDER BY e.i)
  FROM jsonb_array_elements(t.felder) WITH ORDINALITY AS e(f, i))
WHERE jsonb_typeof(t.felder) = 'array' AND EXISTS (
  SELECT 1 FROM jsonb_array_elements(t.felder) AS g(f)
  JOIN mappen m ON m.typ_id = t.id
  WHERE g.f ->> 'typ' = 'betrag' AND jsonb_typeof(m.werte -> (g.f ->> 'key') -> 'betrag') = 'number'
    AND (m.werte -> (g.f ->> 'key') ->> 'betrag')::numeric < 0);
