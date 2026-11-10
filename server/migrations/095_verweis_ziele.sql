-- Verweisfelder mit mehreren Zieltypen (#1036): Ein Verweisfeld nannte seinen Ziel-Mappentyp bisher in „zielTyp“ (eine
-- Id oder „*“ für jede Mappe). Jetzt steht die Liste in „zielTypen“ – bei bestehenden Feldern mit dem einen Typ von
-- bisher, „*“ bleibt „*“. So sind die gespeicherten Felder einheitlich (Vollexport, Sicherungen, alles, was die Tabelle
-- liest); Eingaben in der alten Form gleicht Ablago weiter beim Lesen an (normalisiereZiele in shared/src/verweisziele.ts).
--
-- Nur Felder mit „zielTyp“ ändern sich, und nur dieser Schlüssel; alles andere am Feld bleibt, die Reihenfolge auch.
-- Ein leerer „zielTyp“ wird zu einer leeren Liste (das Feld war schon vorher ohne Ziel und meldet das wie bisher).
-- Sicherungen älterer Versionen durchlaufen diese Migration beim Wiederherstellen. Wiederholbar.
UPDATE mappentypen t SET felder = (
  SELECT jsonb_agg(
    CASE WHEN e.f ? 'zielTyp' THEN
      CASE WHEN e.f ->> 'typ' = 'referenz' AND NOT (e.f ? 'zielTypen')
        THEN (e.f - 'zielTyp') || jsonb_build_object('zielTypen',
          CASE WHEN coalesce(e.f ->> 'zielTyp', '') = '' THEN '[]'::jsonb ELSE jsonb_build_array(e.f ->> 'zielTyp') END)
        ELSE e.f - 'zielTyp' END
    ELSE e.f END
    ORDER BY e.i)
  FROM jsonb_array_elements(t.felder) WITH ORDINALITY AS e(f, i))
WHERE jsonb_typeof(t.felder) = 'array' AND jsonb_array_length(t.felder) > 0
  AND EXISTS (SELECT 1 FROM jsonb_array_elements(t.felder) AS g(f) WHERE g.f ? 'zielTyp');
