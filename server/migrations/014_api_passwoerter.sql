-- Passwortfelder (#46): Ein API-Schlüssel liest Passwörter nur mit diesem eigenen Recht.
ALTER TABLE api_schluessel ADD COLUMN passwoerter boolean NOT NULL DEFAULT false;
