-- Fassungen (#1006): Jedes Speichern eines Eintrags der Werkbank ergibt eine Fassung – Mappentypen (samt Rechte-Regeln),
-- Ansichten, Nummernkreise, Stempel-Vorlagen, Postfächer, Paket-Einstellungen und Automatisierungen in einer Tabelle.
--
-- art/eintrag: Gegenstand und seine Id bzw. Kennung (Nummernkreise: Kennung, Paket-Einstellungen: Paket-Id) – text,
--   weil nicht jeder Eintrag eine uuid hat. nr: fortlaufend je Eintrag.
-- daten: der ganze Stand ohne Zeitstempel und ohne Geheimnisse (Postfach-Passwort, geheime Paket-Einstellungen).
-- urheber: {art: person|paket|automatisierung|update|system, …} (shared/src/fassungen.ts).
-- vorgang: Schritte desselben Vorgangs (eine Anfrage, eine Paket-Installation) sind eine Fassung.
-- zeit/bis: Beginn und letzte Änderung – dieselbe Person innerhalb von 10 Minuten schreibt die Fassung fort.
-- wiederhergestellt: aus welcher Fassung (eine Wiederherstellung ist selbst eine neue Fassung).
-- geloescht: Löschvermerk {zeit, urheber}. Beim Löschen eines Eintrags bleibt nur seine letzte Fassung mit Vermerk.
--
-- Beim Update laufen alle offenen Migrationen in einer Transaktion: Ausstehende Lesestand-Trigger (077) früherer
-- Migrationen erst auslösen (wie 094/098).
SET CONSTRAINTS mappentypen_lesestand, pakete_lesestand, einstellungen_lesestand IMMEDIATE;

CREATE TABLE fassungen (
  haushalt_id       uuid NOT NULL REFERENCES haushalte(id),
  art               text NOT NULL CHECK (art IN ('typ', 'sicht', 'nummernkreis', 'stempel', 'postfach', 'paketeinstellungen', 'automatisierung')),
  eintrag           text NOT NULL,
  nr                int NOT NULL CHECK (nr > 0),
  name              text NOT NULL DEFAULT '',
  daten             jsonb NOT NULL,
  urheber           jsonb NOT NULL,
  vorgang           text,
  wiederhergestellt int,
  zeit              timestamptz NOT NULL DEFAULT now(),
  bis               timestamptz NOT NULL DEFAULT now(),
  geloescht         jsonb,
  PRIMARY KEY (haushalt_id, art, eintrag, nr)
);
CREATE INDEX fassungen_geloescht ON fassungen (haushalt_id, art) WHERE geloescht IS NOT NULL;

-- Umzug der Automatisierungen (#707 → #1006): ihre Fassungen mit Nummer, Zeit und Person übernehmen. Ohne Person
-- stammte die Fassung von Ablago bzw. – bei mitgelieferten – vom Paket.
INSERT INTO fassungen (haushalt_id, art, eintrag, nr, name, daten, urheber, zeit, bis)
SELECT a.haushalt_id, 'automatisierung', f.automatisierung_id::text, f.version, coalesce(f.daten->>'name', a.name), f.daten,
  CASE WHEN f.von IS NOT NULL THEN jsonb_build_object('art', 'person', 'id', f.von)
       WHEN a.herkunft = 'paket' AND a.paket_id IS NOT NULL THEN jsonb_build_object('art', 'paket', 'id', a.paket_id)
       ELSE '{"art": "system"}'::jsonb END,
  f.zeit, f.zeit
FROM automatisierung_fassungen f JOIN automatisierungen a ON a.id = f.automatisierung_id;
DROP TABLE automatisierung_fassungen;

SET CONSTRAINTS mappentypen_lesestand, pakete_lesestand, einstellungen_lesestand DEFERRED;
