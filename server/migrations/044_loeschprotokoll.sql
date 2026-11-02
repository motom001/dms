-- Löschprotokoll (#470): Nachweis jeder Löschung ohne Inhalte – keine Titel, Feldwerte oder Dateinamen.
-- Je Schritt ein Eintrag (in den Papierkorb, endgültig gelöscht, wiederhergestellt), verbunden über mappe_id
-- bzw. dokument_id. Kein Fremdschlüssel auf mappen, dokumente oder benutzer: Die Einträge sollen genau das
-- überdauern. Nicht änderbar: Ein Auslöser verbietet UPDATE und DELETE; nur das Aufräumen nach der eigenen
-- Aufbewahrung setzt in seiner Transaktion dms.loeschprotokoll_aufraeumen = 'ja'.
CREATE TABLE loeschprotokoll (
  id           uuid PRIMARY KEY,
  haushalt_id  uuid NOT NULL REFERENCES haushalte(id),
  zeit         timestamptz NOT NULL DEFAULT now(),
  art          text NOT NULL CHECK (art IN ('mappe', 'dokument')),
  schritt      text NOT NULL CHECK (schritt IN ('papierkorb', 'endgueltig', 'wiederhergestellt')),
  weg          text NOT NULL,
  mappe_id     uuid NOT NULL,
  typ_id       uuid,
  typ_name     text NOT NULL DEFAULT '',
  nummer       text,
  archivnummer text,
  dokument_id  uuid,
  version      integer,
  sha256       text,
  groesse      bigint,
  mime         text,
  seiten       integer,
  anzahl       jsonb,
  von_id       uuid,
  von_name     text NOT NULL DEFAULT '',
  ausloeser    text NOT NULL CHECK (ausloeser IN ('benutzer', 'api', 'paket', 'automatisch')),
  grund        text CHECK (grund IN ('frist', 'verlangen', 'nicht_noetig', 'sonstiges')),
  grund_text   text NOT NULL DEFAULT '',
  vorgang      uuid,
  start_id     uuid
);
CREATE INDEX loeschprotokoll_zeit_idx ON loeschprotokoll (haushalt_id, zeit DESC);
CREATE INDEX loeschprotokoll_sha_idx ON loeschprotokoll (haushalt_id, sha256) WHERE sha256 IS NOT NULL;
CREATE INDEX loeschprotokoll_mappe_idx ON loeschprotokoll (haushalt_id, mappe_id);
CREATE INDEX loeschprotokoll_vorgang_idx ON loeschprotokoll (haushalt_id, vorgang) WHERE vorgang IS NOT NULL;

CREATE FUNCTION loeschprotokoll_schutz() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND current_setting('dms.loeschprotokoll_aufraeumen', true) = 'ja' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'Das Löschprotokoll lässt sich nicht ändern.' USING ERRCODE = 'insufficient_privilege';
END $$;
CREATE TRIGGER loeschprotokoll_schutz BEFORE UPDATE OR DELETE ON loeschprotokoll
  FOR EACH ROW EXECUTE FUNCTION loeschprotokoll_schutz();
