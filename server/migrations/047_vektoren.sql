-- Vektoren zu Dokumenten (#442): ein Paket mit dem Recht dms:vektoren rechnet sie aus dem Volltext und legt sie
-- hier ab; der Kern speichert und vergleicht sie nur (Kosinus), er rechnet keine. Je Dokument und Modell ein Vektor.
-- Ohne Erweiterung (pgvector steckt nicht im Image postgres:17): float4-Array, verglichen im Kern
-- (Zwischenspeicher im Arbeitsspeicher, siehe server/src/vektoren.ts). Abgeleitete Daten: nicht im Vollexport,
-- mit dem Dokument gelöscht, jederzeit neu berechenbar.
CREATE TABLE vektoren (
  dokument_id uuid NOT NULL REFERENCES dokumente(id) ON DELETE CASCADE,
  haushalt_id uuid NOT NULL,
  paket       text NOT NULL,
  modell      text NOT NULL,
  vektor      real[] NOT NULL,
  zeit        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (dokument_id, modell)
);
CREATE INDEX vektoren_modell ON vektoren (haushalt_id, modell);
