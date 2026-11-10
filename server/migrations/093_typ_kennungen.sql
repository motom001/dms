-- Kennungen eindeutig (#1084): Mappentypen aus Paketen hießen bisher „<paket>_<schluessel>“ in einer Spalte. Weil
-- Paket-Ids und Schlüssel selbst „_“ enthalten dürfen, war das doppeldeutig (Paket haus + Typ garten_pflanze und Paket
-- haus_garten + Typ pflanze ergaben beide haus_garten_pflanze). Jetzt stehen Paket und Schlüssel getrennt; nach außen
-- gilt „paket:schluessel“ (wie in Verweisen), eigene Typen behalten ihren Schlüssel ohne Paket.
--
-- Umzug ohne Alias: Welcher Typ zu welchem Paket gehört und wie sein Schlüssel im Paket heißt, steht im Eintrag des
-- installierten Pakets (pakete.daten.typen: Schlüssel → Id des Typs). Daraus – nicht durch Teilen am Unterstrich – wird
-- die neue Kennung. Ein Typ zieht nur um, wenn genau ein Paket ihn unter genau einem Schlüssel führt und seine Kennung
-- dazu passt (alte Form, ohne Präfix wie der von Basis übernommene Ablageort #883, oder noch leer). Typen ohne Paket
-- (z. B. eines Pakets, dessen Eintrag fehlt) bleiben, wie sie sind – dann als eigene Typen.
--
-- Alles andere verweist per uuid auf Mappentypen (Ansichten, Felder, Register, Automatisierungen, Rechte-Regeln,
-- KI-Zulassung) und bleibt unberührt. Sicherungen älterer Versionen durchlaufen diese Migration beim Wiederherstellen
-- (server/src/wiederherstellung.ts baut das Schema der Sicherung und migriert danach). Wiederholbar.

-- Alle Migrationen laufen in einer Transaktion (server/src/db.ts). Hat eine frühere darin mappentypen geändert, wartet
-- dessen Trigger für den Lesestand (Migration 077) noch, und ALTER/CREATE INDEX ginge nicht. Deshalb hier sofort auslösen
-- und am Ende wieder auf „am Ende der Transaktion“ stellen.
SET CONSTRAINTS mappentypen_lesestand, pakete_lesestand, einstellungen_lesestand IMMEDIATE;

ALTER TABLE mappentypen ADD COLUMN IF NOT EXISTS paket text;

-- Der alte Index (haushalt_id, schluessel) passt nicht mehr: basis:person und ein eigener Typ person dürfen nebeneinander
-- bestehen – sonst stieße der Umzug auf einen eigenen Typ mit gleichem Schlüssel. Der neue Index kommt vor dem Umzug:
-- Danach ginge CREATE INDEX nicht mehr (der Trigger für den Lesestand, Migration 077, wartet bis zum Ende der
-- Transaktion). Der Umzug selbst kann ihn nicht verletzen: Je Paket sind die Schlüssel eindeutig.
DROP INDEX IF EXISTS mappentypen_schluessel_uq;
CREATE UNIQUE INDEX IF NOT EXISTS mappentypen_kennung_uq ON mappentypen (haushalt_id, coalesce(paket, ''), schluessel) WHERE schluessel IS NOT NULL;

WITH zuordnung AS (
  SELECT p.haushalt_id, p.id AS paket, e.key AS schluessel, e.value AS typ_id
  FROM pakete p, jsonb_each_text(CASE WHEN jsonb_typeof(p.daten->'typen') = 'object' THEN p.daten->'typen' ELSE '{}'::jsonb END) e
), eindeutig AS (
  SELECT z.* FROM zuordnung z
  WHERE (SELECT count(*) FROM zuordnung y WHERE y.haushalt_id = z.haushalt_id AND y.typ_id = z.typ_id) = 1
), plan AS (
  SELECT t.haushalt_id, t.id, t.schluessel AS alt, z.paket, z.schluessel
  FROM mappentypen t JOIN eindeutig z ON t.haushalt_id = z.haushalt_id AND t.id::text = z.typ_id
  WHERE t.paket IS NULL AND t.system IS NULL
    AND (t.schluessel IS NULL OR t.schluessel = z.paket || '_' || z.schluessel OR t.schluessel = z.schluessel)
), umgezogen AS (
  UPDATE mappentypen t SET paket = p.paket, schluessel = p.schluessel
  FROM plan p WHERE t.haushalt_id = p.haushalt_id AND t.id = p.id
  RETURNING p.haushalt_id, p.id, p.alt, p.paket, p.schluessel
)
-- Protokoll (Sicherheit A): je Kennung alt → neu; Ablago schreibt es beim Start ins Systemprotokoll und löscht es dann
-- (server/src/mappentypen/kennungen-umzug.ts).
INSERT INTO einstellungen (haushalt_id, schluessel, wert)
SELECT haushalt_id, 'kennungen_umzug', jsonb_agg(jsonb_build_object('id', id, 'alt', alt, 'neu', paket || ':' || schluessel) ORDER BY alt)
FROM umgezogen GROUP BY haushalt_id
ON CONFLICT (haushalt_id, schluessel) DO UPDATE SET wert = einstellungen.wert || EXCLUDED.wert;

-- Herausgeber (#1084, Sicherheit C): Installierte Pakete aus dem offiziellen Katalog stammen vom Projekt und bekommen
-- app.ablago (belegt durch dessen Signatur); alle anderen bleiben ohne – den setzt das erste Update, das einen nennt.
UPDATE pakete SET daten = daten || '{"herausgeber": "app.ablago", "herausgeberGeprueft": true}'::jsonb
WHERE daten->'herkunft'->>'art' = 'katalog' AND daten->'herkunft'->>'url' = 'https://catalog.ablago.app/katalog.json'
  AND NOT (daten ? 'herausgeber');

SET CONSTRAINTS mappentypen_lesestand, pakete_lesestand, einstellungen_lesestand DEFERRED;
