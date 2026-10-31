-- Umbenennung (#305): Das Register der Art „protokoll“ heißt in der Oberfläche „Historie“.
-- Register, die noch den alten Standardnamen „Protokoll“ tragen, bekommen den neuen Namen.
-- Selbst vergebene Namen bleiben unverändert; Kennung (key) und Art bleiben gleich.
UPDATE mappentypen
SET register = (
  SELECT jsonb_agg(
    CASE WHEN r ->> 'art' = 'protokoll' AND r ->> 'name' = 'Protokoll'
      THEN jsonb_set(r, '{name}', '"Historie"')
      ELSE r END
    ORDER BY i)
  FROM jsonb_array_elements(register) WITH ORDINALITY AS t(r, i)
)
WHERE register @> '[{"art": "protokoll", "name": "Protokoll"}]'::jsonb;
