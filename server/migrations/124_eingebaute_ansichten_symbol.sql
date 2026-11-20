-- Symbole der eingebauten Ansichten (#1519): Die Ansicht je Systemtyp (Benutzer, Rolle, Post – gleiche Id wie der Typ)
-- und unter „Post“ die Ansichten „Eingegangen“ und „Versendet“ bekommen ein Symbol, wie sie es seit #1519 beim Anlegen
-- bekommen (shared/src/ansichtsymbole.ts, SYSTEM_SYMBOLE). Nur, wo noch keins steht: Ein selbst gesetztes Symbol bleibt.
UPDATE sichten s SET symbol = CASE m.system WHEN 'benutzer' THEN 'users' WHEN 'rolle' THEN 'id-card-lanyard' ELSE 'mail' END
  FROM mappentypen m
  WHERE s.symbol IS NULL AND m.id = s.id AND m.haushalt_id = s.haushalt_id AND m.system IN ('benutzer', 'rolle', 'post');

UPDATE sichten s SET symbol = CASE WHEN s.bedingungen::text LIKE '%"Eingehend"%' THEN 'mailbox' ELSE 'send' END
  FROM mappentypen m
  WHERE s.symbol IS NULL AND m.system = 'post' AND m.haushalt_id = s.haushalt_id AND s.eltern_id = m.id
    AND s.bedingungen::text LIKE '%"richtung"%'
    AND (s.bedingungen::text LIKE '%"Eingehend"%' OR s.bedingungen::text LIKE '%"Ausgehend"%');
