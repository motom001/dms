-- Demo-Mappen sind gekennzeichnet und lassen sich gesammelt wieder entfernen.
ALTER TABLE mappen ADD COLUMN demo boolean NOT NULL DEFAULT false;
CREATE INDEX mappen_demo_idx ON mappen (haushalt_id) WHERE demo;
