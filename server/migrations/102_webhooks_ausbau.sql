-- Zähler-Webhook ausgebaut (#991): Nach außen meldet Ablago nur noch über Automatisierungen (Dann-Karte „URL aufrufen“,
-- #671, mit eigenem Schutz). Die Webhooks der Benutzer (058), ihr Ausgangskorb und die Liste der freigegebenen Ziele
-- (Einstellung `webhook_ziele`, Werkbank → Webhooks) entfallen vollständig; vorhandene Einträge verschwinden still.
-- `GET /api/v1/ich/zaehler` und die Tabelle `zaehlerstaende` bleiben, wie sie sind.
-- Alte Sicherungen mit diesen Tabellen spielen sich weiter ein: Die Wiederherstellung legt das Schema mit den
-- Migrationen der Sicherung an, spielt die Daten ein und holt danach diese Migration nach.
-- Beim Update laufen alle offenen Migrationen in einer Transaktion: ausstehende Lesestand-Trigger (077) früherer
-- Migrationen erst auslösen (wie 094/098/100).
SET CONSTRAINTS mappentypen_lesestand, pakete_lesestand, einstellungen_lesestand IMMEDIATE;
DROP TABLE IF EXISTS webhook_meldungen;
DROP TABLE IF EXISTS webhooks;
DELETE FROM einstellungen WHERE schluessel = 'webhook_ziele';
SET CONSTRAINTS mappentypen_lesestand, pakete_lesestand, einstellungen_lesestand DEFERRED;
