-- Post: „von“ und „an“ (#1042). Die Systemfelder der Post heißen wie in Verträgen und Rechnungen, damit Trefferlisten,
-- Ansichten und die erweiterte Suche über mehrere Typen dieselben Kennungen sehen:
--   absender (Text, „Absender“)          → von         („Von“)
--   fuer     (Verweis auf Benutzer, „Für“) → an          („An“; „Post für dich“ bleibt, wie es ist)
--   an       (Text, „Empfänger“: Adressen einer versendeten E-Mail) → an_adresse („An (Adresse)“)
-- Alle drei ziehen gleichzeitig um (an wird an_adresse, bevor fuer zu an wird). Hat der Administrator am Typ Post selbst
-- ein Feld von oder an_adresse angelegt, heißt seines danach von_alt bzw. an_adresse_alt – wie bei neuen Systemfeldern
-- (ergaenzeSystemfelder in server/src/mappentypen/systemtypen.ts).
--
-- Mit umgezogen wird alles, was die Kennungen nennt:
--   - der Typ Post selbst: Felder (auch Anzeige-Bedingungen, „folgt aus“, Vorbelegen, PLZ-Land, alter Text), Register
--     und Abschnitte, Trefferlisten, Titel-Vorlage (Platzhalter {absender…}, {fuer…}, {an…}), Titelfeld, Rechte-Regeln
--   - andere Typen: Verknüpfungsregister und Tabellen mit Quelle Post, Auswahlfilter und Vorbelegen an Verweisen auf Post
--   - Werte der Post-Mappen, ihre Verweise, Post im Papierkorb, offene Aufgaben „Post für dich“ (Schlüssel fuer:<id>)
--   - Ansichten mit dem Typ Post (Bedingungen), Automatisierungen auf den Typ Post samt ihren früheren Fassungen
--     (Wenn-Felder, Bedingungen, Empfänger aus einem Feld, Felder setzen, Platzhalter in Texten)
-- Die Historie bleibt, wie sie geschrieben wurde (jeder Eintrag trägt seine Beschriftung). Bezeichnungen und Hilfetexte
-- der Systemfelder zieht Ablago beim Start nach (wandleZuPost), eigene Bezeichnungen des Administrators bleiben.
--
-- Rechte-Regeln wirken danach genau wie vorher: Sie nennen dieselben Felder unter der neuen Kennung. Eine Kennung, die es
-- nicht (mehr) gibt, wirkt in Rechte-Regeln geschlossen (shared/src/rechte.ts, #1042). Sicherungen älterer Versionen
-- durchlaufen diese Migration beim Wiederherstellen. Wiederholbar: Umgezogen wird nur ein Typ Post, der noch ein
-- Systemfeld absender oder fuer hat.
--
-- Kein DDL auf mappentypen, pakete oder einstellungen; die Hilfsfunktionen liegen in pg_temp und verschwinden am Ende.

CREATE FUNCTION pg_temp.dms099_k(m jsonb, k text) RETURNS text LANGUAGE sql IMMUTABLE AS $f$
  SELECT coalesce(m ->> k, k)
$f$;

-- Liste von Kennungen (Feldregister, Spalten, Wenn-Felder); anderes bleibt.
CREATE FUNCTION pg_temp.dms099_liste(m jsonb, j jsonb) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $f$
  SELECT CASE WHEN jsonb_typeof(j) <> 'array' THEN j ELSE coalesce((
    SELECT jsonb_agg(CASE WHEN jsonb_typeof(x) = 'string' THEN to_jsonb(pg_temp.dms099_k(m, x #>> '{}')) ELSE x END ORDER BY i)
    FROM jsonb_array_elements(j) WITH ORDINALITY AS e(x, i)), '[]'::jsonb) END
$f$;

-- Platzhalter {alt} bzw. {alt|filter…} → {neu…}; alle gleichzeitig (Zwischenmarke, damit an → an_adresse und
-- fuer → an sich nicht ins Gehege kommen).
CREATE FUNCTION pg_temp.dms099_text(m jsonb, t text) RETURNS text LANGUAGE plpgsql IMMUTABLE AS $f$
DECLARE e record; r text := t;
BEGIN
  IF r IS NULL OR position('{' IN r) = 0 THEN RETURN r; END IF;
  FOR e IN SELECT key, value FROM jsonb_each_text(m) LOOP
    r := regexp_replace(r, '\{' || e.key || '(?=[|}])', '{' || chr(1) || e.key || chr(1), 'g');
  END LOOP;
  FOR e IN SELECT key, value FROM jsonb_each_text(m) LOOP
    r := replace(r, '{' || chr(1) || e.key || chr(1), '{' || e.value);
  END LOOP;
  RETURN r;
END $f$;

-- Eine Bedingung (Ansicht, Rechte-Regel, Anzeige-Bedingung): feld der eigenen Mappe; „eigenesFeld“ im Vergleichswert.
CREATE FUNCTION pg_temp.dms099_bed(m jsonb, b jsonb) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $f$
  SELECT CASE WHEN jsonb_typeof(b) <> 'object' THEN b ELSE
    b
    || CASE WHEN jsonb_typeof(b -> 'feld') = 'string' THEN jsonb_build_object('feld', pg_temp.dms099_k(m, b ->> 'feld')) ELSE '{}'::jsonb END
    || CASE WHEN b -> 'bedingung' ->> 'art' = 'feld' THEN jsonb_build_object('bedingung', b -> 'bedingung' || jsonb_build_object('feld', pg_temp.dms099_k(m, b -> 'bedingung' ->> 'feld'))) ELSE '{}'::jsonb END
  END
$f$;

CREATE FUNCTION pg_temp.dms099_bedingungen(m jsonb, j jsonb) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $f$
  SELECT CASE WHEN jsonb_typeof(j) <> 'array' THEN j ELSE coalesce((
    SELECT jsonb_agg(pg_temp.dms099_bed(m, x) ORDER BY i) FROM jsonb_array_elements(j) WITH ORDINALITY AS e(x, i)), '[]'::jsonb) END
$f$;

-- „Anzeigen, wenn …“ (#1033).
CREATE FUNCTION pg_temp.dms099_anzeige(m jsonb, a jsonb) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $f$
  SELECT CASE WHEN jsonb_typeof(a) = 'object' AND a ? 'bedingungen'
    THEN a || jsonb_build_object('bedingungen', pg_temp.dms099_bedingungen(m, a -> 'bedingungen')) ELSE a END
$f$;

-- Ein Feld des Typs Post: Kennung und alles, was Felder derselben Mappe nennt.
CREATE FUNCTION pg_temp.dms099_postfeld(m jsonb, f jsonb, post text) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE AS $f$
DECLARE r jsonb := f;
BEGIN
  IF jsonb_typeof(f) <> 'object' THEN RETURN f; END IF;
  IF jsonb_typeof(r -> 'key') = 'string' THEN r := r || jsonb_build_object('key', pg_temp.dms099_k(m, r ->> 'key')); END IF;
  IF jsonb_typeof(r -> 'landFeld') = 'string' THEN r := r || jsonb_build_object('landFeld', pg_temp.dms099_k(m, r ->> 'landFeld')); END IF;
  IF jsonb_typeof(r -> 'ausText') = 'string' THEN r := r || jsonb_build_object('ausText', pg_temp.dms099_k(m, r ->> 'ausText')); END IF;
  IF jsonb_typeof(r -> 'folgtAus') = 'object' THEN
    r := r || jsonb_build_object('folgtAus', r -> 'folgtAus' || jsonb_build_object('feld', pg_temp.dms099_k(m, r -> 'folgtAus' ->> 'feld')));
  END IF;
  IF jsonb_typeof(r -> 'vorbelegen') = 'array' THEN
    r := r || jsonb_build_object('vorbelegen', (SELECT coalesce(jsonb_agg(CASE WHEN jsonb_typeof(x) = 'object'
      THEN x || jsonb_build_object('nach', pg_temp.dms099_k(m, x ->> 'nach'))
        || CASE WHEN r -> 'zielTypen' ? post THEN jsonb_build_object('von', pg_temp.dms099_k(m, x ->> 'von')) ELSE '{}'::jsonb END
      ELSE x END ORDER BY i), '[]'::jsonb) FROM jsonb_array_elements(r -> 'vorbelegen') WITH ORDINALITY AS e(x, i)));
  END IF;
  IF r ? 'anzeigen' THEN r := r || jsonb_build_object('anzeigen', pg_temp.dms099_anzeige(m, r -> 'anzeigen')); END IF;
  IF jsonb_typeof(r -> 'auswahlFilter') = 'array' THEN
    -- Vergleich mit einem Feld der eigenen Mappe (eigenesFeld); die Bedingung selbst nennt ein Feld des Zieltyps –
    -- nur umziehen, wenn das Ziel die Post selbst ist.
    r := r || jsonb_build_object('auswahlFilter', (SELECT coalesce(jsonb_agg(CASE WHEN jsonb_typeof(x) = 'object' THEN
      x || CASE WHEN r -> 'zielTypen' ? post AND jsonb_typeof(x -> 'feld') = 'string' THEN jsonb_build_object('feld', pg_temp.dms099_k(m, x ->> 'feld')) ELSE '{}'::jsonb END
        || CASE WHEN x -> 'wert' ->> 'art' = 'eigenesFeld' THEN jsonb_build_object('wert', x -> 'wert' || jsonb_build_object('feld', pg_temp.dms099_k(m, x -> 'wert' ->> 'feld'))) ELSE '{}'::jsonb END
        || CASE WHEN x -> 'bis' ->> 'art' = 'eigenesFeld' THEN jsonb_build_object('bis', x -> 'bis' || jsonb_build_object('feld', pg_temp.dms099_k(m, x -> 'bis' ->> 'feld'))) ELSE '{}'::jsonb END
      ELSE x END ORDER BY i), '[]'::jsonb) FROM jsonb_array_elements(r -> 'auswahlFilter') WITH ORDINALITY AS e(x, i)));
  END IF;
  RETURN r;
END $f$;

-- Felder anderer Typen, die auf Post zeigen: Tabelle mit Quelle Post, Auswahlfilter und Vorbelegen (Felder der Post).
CREATE FUNCTION pg_temp.dms099_fremdfeld(m jsonb, f jsonb, post text) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE AS $f$
DECLARE r jsonb := f;
BEGIN
  IF jsonb_typeof(f) <> 'object' THEN RETURN f; END IF;
  IF r -> 'quelle' ->> 'typId' = post THEN
    r := r || jsonb_build_object('quelle', r -> 'quelle' || jsonb_build_object('feldKey', pg_temp.dms099_k(m, r -> 'quelle' ->> 'feldKey')));
  END IF;
  IF r -> 'zielTypen' ? post THEN
    IF jsonb_typeof(r -> 'auswahlFilter') = 'array' THEN
      r := r || jsonb_build_object('auswahlFilter', (SELECT coalesce(jsonb_agg(CASE WHEN jsonb_typeof(x) = 'object' AND jsonb_typeof(x -> 'feld') = 'string'
        THEN x || jsonb_build_object('feld', pg_temp.dms099_k(m, x ->> 'feld')) ELSE x END ORDER BY i), '[]'::jsonb)
        FROM jsonb_array_elements(r -> 'auswahlFilter') WITH ORDINALITY AS e(x, i)));
    END IF;
    IF jsonb_typeof(r -> 'vorbelegen') = 'array' THEN
      r := r || jsonb_build_object('vorbelegen', (SELECT coalesce(jsonb_agg(CASE WHEN jsonb_typeof(x) = 'object'
        THEN x || jsonb_build_object('von', pg_temp.dms099_k(m, x ->> 'von')) ELSE x END ORDER BY i), '[]'::jsonb)
        FROM jsonb_array_elements(r -> 'vorbelegen') WITH ORDINALITY AS e(x, i)));
    END IF;
  END IF;
  RETURN r;
END $f$;

-- Register: Felder und Abschnitte (nur am Typ Post), Quellen von Verknüpfungsregistern (an jedem Typ).
CREATE FUNCTION pg_temp.dms099_register(m jsonb, j jsonb, post text, eigen boolean) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $f$
  SELECT CASE WHEN jsonb_typeof(j) <> 'array' THEN j ELSE coalesce((SELECT jsonb_agg(CASE WHEN jsonb_typeof(r) <> 'object' THEN r ELSE
    r
    || CASE WHEN eigen AND r ? 'felder' THEN jsonb_build_object('felder', pg_temp.dms099_liste(m, r -> 'felder')) ELSE '{}'::jsonb END
    || CASE WHEN eigen AND jsonb_typeof(r -> 'abschnitte') = 'array' THEN jsonb_build_object('abschnitte', (SELECT coalesce(jsonb_agg(CASE WHEN jsonb_typeof(a) = 'object'
         THEN a || CASE WHEN jsonb_typeof(a -> 'vor') = 'string' THEN jsonb_build_object('vor', pg_temp.dms099_k(m, a ->> 'vor')) ELSE '{}'::jsonb END
           || CASE WHEN a ? 'anzeigen' THEN jsonb_build_object('anzeigen', pg_temp.dms099_anzeige(m, a -> 'anzeigen')) ELSE '{}'::jsonb END
         ELSE a END ORDER BY k), '[]'::jsonb) FROM jsonb_array_elements(r -> 'abschnitte') WITH ORDINALITY AS y(a, k))) ELSE '{}'::jsonb END
    || CASE WHEN jsonb_typeof(r -> 'quellen') = 'array' THEN jsonb_build_object('quellen', (SELECT coalesce(jsonb_agg(CASE WHEN jsonb_typeof(q) = 'object' AND q ->> 'typId' = post
         THEN q || jsonb_build_object('feldKey', pg_temp.dms099_k(m, q ->> 'feldKey')) ELSE q END ORDER BY k), '[]'::jsonb) FROM jsonb_array_elements(r -> 'quellen') WITH ORDINALITY AS y(q, k))) ELSE '{}'::jsonb END
  END ORDER BY i) FROM jsonb_array_elements(j) WITH ORDINALITY AS e(r, i)), '[]'::jsonb) END
$f$;

-- Automatisierung auf den Typ Post: überall „feld“ (Bedingungen, Empfänger aus einem Feld), „felder“ (Wenn-Karte),
-- „werte“ der Karte „Felder setzen“ (Kennungen und Platzhalter) und Texte mit Platzhaltern.
CREATE FUNCTION pg_temp.dms099_auto(m jsonb, j jsonb) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE AS $f$
DECLARE e record; r jsonb := '{}'::jsonb;
BEGIN
  IF jsonb_typeof(j) = 'array' THEN
    RETURN coalesce((SELECT jsonb_agg(pg_temp.dms099_auto(m, x) ORDER BY i) FROM jsonb_array_elements(j) WITH ORDINALITY AS a(x, i)), '[]'::jsonb);
  END IF;
  IF jsonb_typeof(j) <> 'object' THEN RETURN j; END IF;
  FOR e IN SELECT key, value FROM jsonb_each(j) LOOP
    IF e.key = 'feld' AND jsonb_typeof(e.value) = 'string' THEN
      r := r || jsonb_build_object(e.key, pg_temp.dms099_k(m, e.value #>> '{}'));
    ELSIF e.key = 'felder' THEN
      r := r || jsonb_build_object(e.key, pg_temp.dms099_liste(m, e.value));
    ELSIF e.key = 'werte' AND jsonb_typeof(e.value) = 'object' AND j ->> 'art' = 'feld' THEN
      r := r || jsonb_build_object(e.key, (SELECT coalesce(jsonb_object_agg(pg_temp.dms099_k(m, w.key),
        CASE WHEN jsonb_typeof(w.value) = 'string' THEN to_jsonb(pg_temp.dms099_text(m, w.value #>> '{}')) ELSE w.value END), '{}'::jsonb)
        FROM jsonb_each(e.value) AS w));
    ELSIF e.key = 'text' AND jsonb_typeof(e.value) = 'string' THEN
      r := r || jsonb_build_object(e.key, pg_temp.dms099_text(m, e.value #>> '{}'));
    ELSE
      r := r || jsonb_build_object(e.key, pg_temp.dms099_auto(m, e.value));
    END IF;
  END LOOP;
  RETURN r;
END $f$;

-- Werte einer Post: Schlüssel umbenennen.
CREATE FUNCTION pg_temp.dms099_werte(m jsonb, w jsonb) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $f$
  SELECT CASE WHEN jsonb_typeof(w) <> 'object' THEN w ELSE coalesce((SELECT jsonb_object_agg(pg_temp.dms099_k(m, x.key), x.value) FROM jsonb_each(w) AS x), '{}'::jsonb) END
$f$;

-- Was umzieht: je Typ Post mit altem Stand die Zuordnung alt → neu, samt eigenen Feldern, die einer neuen Kennung im
-- Weg stehen.
CREATE TEMP TABLE dms099_plan ON COMMIT DROP AS
SELECT t.haushalt_id, t.id, t.id::text AS post,
  '{"absender": "von", "fuer": "an", "an": "an_adresse"}'::jsonb
  || CASE WHEN EXISTS (SELECT 1 FROM jsonb_array_elements(t.felder) f WHERE f ->> 'key' = 'von') THEN '{"von": "von_alt"}'::jsonb ELSE '{}'::jsonb END
  || CASE WHEN EXISTS (SELECT 1 FROM jsonb_array_elements(t.felder) f WHERE f ->> 'key' = 'an_adresse') THEN '{"an_adresse": "an_adresse_alt"}'::jsonb ELSE '{}'::jsonb END
  AS m
FROM mappentypen t
WHERE t.system = 'post' AND jsonb_typeof(t.felder) = 'array'
  AND EXISTS (SELECT 1 FROM jsonb_array_elements(t.felder) f WHERE f ->> 'key' IN ('absender', 'fuer') AND (f ->> 'system')::boolean IS TRUE);

-- Andere Typen zuerst (sie lesen noch nichts vom Typ Post): Quellen, Tabellen, Auswahlfilter, Vorbelegen.
UPDATE mappentypen t SET
  felder = coalesce((SELECT jsonb_agg(pg_temp.dms099_fremdfeld(p.m, f, p.post) ORDER BY i) FROM jsonb_array_elements(t.felder) WITH ORDINALITY AS e(f, i)), '[]'::jsonb),
  register = pg_temp.dms099_register(p.m, t.register, p.post, false)
FROM dms099_plan p
WHERE t.haushalt_id = p.haushalt_id AND t.id <> p.id AND (t.felder::text LIKE '%' || p.post || '%' OR t.register::text LIKE '%' || p.post || '%');

-- Der Typ Post.
UPDATE mappentypen t SET
  felder = coalesce((SELECT jsonb_agg(pg_temp.dms099_postfeld(p.m, f, p.post) ORDER BY i) FROM jsonb_array_elements(t.felder) WITH ORDINALITY AS e(f, i)), '[]'::jsonb),
  register = pg_temp.dms099_register(p.m, t.register, p.post, true),
  trefferlisten = CASE WHEN jsonb_typeof(t.trefferlisten) = 'array' THEN coalesce((SELECT jsonb_agg(CASE WHEN jsonb_typeof(l) = 'object' AND l ? 'spalten'
    THEN l || jsonb_build_object('spalten', pg_temp.dms099_liste(p.m, l -> 'spalten')) ELSE l END ORDER BY i) FROM jsonb_array_elements(t.trefferlisten) WITH ORDINALITY AS e(l, i)), '[]'::jsonb)
    ELSE t.trefferlisten END,
  trefferliste = pg_temp.dms099_liste(p.m, t.trefferliste),
  titel_vorlage = pg_temp.dms099_text(p.m, t.titel_vorlage),
  titel_feld = pg_temp.dms099_k(p.m, t.titel_feld),
  berechtigungen = CASE WHEN jsonb_typeof(t.berechtigungen -> 'regeln') = 'array' THEN t.berechtigungen || jsonb_build_object('regeln', (
    SELECT coalesce(jsonb_agg(CASE WHEN jsonb_typeof(r) = 'object' AND jsonb_typeof(r -> 'wenn') = 'array'
      THEN r || jsonb_build_object('wenn', pg_temp.dms099_bedingungen(p.m, r -> 'wenn')) ELSE r END ORDER BY i), '[]'::jsonb)
    FROM jsonb_array_elements(t.berechtigungen -> 'regeln') WITH ORDINALITY AS e(r, i)))
    ELSE t.berechtigungen END,
  geaendert = now()
FROM dms099_plan p
WHERE t.id = p.id;

-- Werte, Verweise und offene „Post für dich“ der Post-Mappen.
UPDATE mappen x SET werte = pg_temp.dms099_werte(p.m, x.werte)
FROM dms099_plan p
WHERE x.typ_id = p.id AND x.werte ?| ARRAY(SELECT jsonb_object_keys(p.m));

UPDATE verweise v SET feld_key = pg_temp.dms099_k(p.m, v.feld_key)
FROM dms099_plan p, mappen x
WHERE x.id = v.quelle_id AND x.typ_id = p.id AND p.m ? v.feld_key;

UPDATE aufgaben a SET feld_key = 'an:' || substr(a.feld_key, 6)
FROM dms099_plan p, mappen x
WHERE x.id = a.mappe_id AND x.typ_id = p.id AND a.art = 'post' AND a.feld_key LIKE 'fuer:%';

-- Post im Papierkorb: Werte, Verweise und Aufgaben, wie sie beim Wiederherstellen zurückkommen.
UPDATE papierkorb k SET
  mappe = CASE WHEN jsonb_typeof(k.mappe -> 'werte') = 'object' THEN jsonb_set(k.mappe, '{werte}', pg_temp.dms099_werte(p.m, k.mappe -> 'werte')) ELSE k.mappe END,
  verweise = CASE WHEN jsonb_typeof(k.verweise) = 'array' THEN coalesce((SELECT jsonb_agg(CASE WHEN jsonb_typeof(v -> 'feld_key') = 'string'
    THEN v || jsonb_build_object('feld_key', pg_temp.dms099_k(p.m, v ->> 'feld_key')) ELSE v END ORDER BY i) FROM jsonb_array_elements(k.verweise) WITH ORDINALITY AS e(v, i)), '[]'::jsonb)
    ELSE k.verweise END,
  aufgaben = CASE WHEN jsonb_typeof(k.aufgaben) = 'array' THEN coalesce((SELECT jsonb_agg(CASE WHEN a ->> 'art' = 'post' AND a ->> 'feld_key' LIKE 'fuer:%'
    THEN a || jsonb_build_object('feld_key', 'an:' || substr(a ->> 'feld_key', 6)) ELSE a END ORDER BY i) FROM jsonb_array_elements(k.aufgaben) WITH ORDINALITY AS e(a, i)), '[]'::jsonb)
    ELSE k.aufgaben END
FROM dms099_plan p
WHERE k.typ_id = p.id;

-- Ansichten mit dem Typ Post: Bedingungen auf Felder (bei mehreren Typen gilt eine Bedingung für alle).
UPDATE sichten s SET bedingungen = pg_temp.dms099_bedingungen(p.m, s.bedingungen)
FROM dms099_plan p
WHERE s.haushalt_id = p.haushalt_id AND s.typen ? p.post AND jsonb_typeof(s.bedingungen) = 'array' AND jsonb_array_length(s.bedingungen) > 0;

-- Automatisierungen auf den Typ Post und ihre früheren Fassungen (Wiederherstellen einer Fassung).
UPDATE automatisierungen a SET daten = pg_temp.dms099_auto(p.m, a.daten)
FROM dms099_plan p
WHERE a.haushalt_id = p.haushalt_id AND a.daten -> 'wenn' ->> 'typ' = p.post;

UPDATE automatisierung_fassungen f SET daten = pg_temp.dms099_auto(p.m, f.daten)
FROM dms099_plan p, automatisierungen a
WHERE a.id = f.automatisierung_id AND a.haushalt_id = p.haushalt_id AND f.daten -> 'wenn' ->> 'typ' = p.post;

-- Den Lesestand (077) der geänderten Typen und Ansichten gleich auslösen, damit eine spätere Migration in derselben
-- Transaktion DDL ausführen kann; danach wieder „am Ende der Transaktion“.
SET CONSTRAINTS mappentypen_lesestand, sichten_lesestand IMMEDIATE;
SET CONSTRAINTS mappentypen_lesestand, sichten_lesestand DEFERRED;

DROP FUNCTION pg_temp.dms099_werte(jsonb, jsonb);
DROP FUNCTION pg_temp.dms099_auto(jsonb, jsonb);
DROP FUNCTION pg_temp.dms099_register(jsonb, jsonb, text, boolean);
DROP FUNCTION pg_temp.dms099_fremdfeld(jsonb, jsonb, text);
DROP FUNCTION pg_temp.dms099_postfeld(jsonb, jsonb, text);
DROP FUNCTION pg_temp.dms099_anzeige(jsonb, jsonb);
DROP FUNCTION pg_temp.dms099_bedingungen(jsonb, jsonb);
DROP FUNCTION pg_temp.dms099_bed(jsonb, jsonb);
DROP FUNCTION pg_temp.dms099_text(jsonb, text);
DROP FUNCTION pg_temp.dms099_liste(jsonb, jsonb);
DROP FUNCTION pg_temp.dms099_k(jsonb, text);
DROP TABLE dms099_plan;
