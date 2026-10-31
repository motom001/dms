-- Papierkorb für einzelne Dokumente (#344). Ein gelöschtes Dokument zieht samt Volltext und älteren
-- Versionen hierher um; Wiederherstellen legt es in dasselbe Register derselben Mappe zurück.
-- Kein Fremdschlüssel auf mappen: Die Mappe kann inzwischen selbst im Papierkorb liegen.
CREATE TABLE papierkorb_dokumente (
  id             uuid PRIMARY KEY,
  haushalt_id    uuid NOT NULL REFERENCES haushalte(id),
  mappe_id       uuid NOT NULL,
  dokument       jsonb NOT NULL,
  versionen      jsonb NOT NULL DEFAULT '[]'::jsonb,
  geloescht      timestamptz NOT NULL DEFAULT now(),
  geloescht_von  uuid REFERENCES benutzer(id) ON DELETE SET NULL
);
CREATE INDEX papierkorb_dokumente_haushalt_idx ON papierkorb_dokumente (haushalt_id, geloescht);
CREATE INDEX papierkorb_dokumente_mappe_idx ON papierkorb_dokumente (haushalt_id, mappe_id);
CREATE INDEX papierkorb_dokumente_von_idx ON papierkorb_dokumente (geloescht_von);
