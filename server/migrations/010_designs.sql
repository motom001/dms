-- Designs der Weboberfläche (#21): Grundlage (hell, dunkel, kontrast, automatisch),
-- Primär- und Sekundärfarbe, eigenes CSS. Welches Design Standard ist, steht in
-- einstellungen (design_standard); was ein Benutzer gewählt hat, in benutzer_einstellungen (design).
CREATE TABLE designs (
  id           uuid PRIMARY KEY,
  haushalt_id  uuid NOT NULL REFERENCES haushalte(id),
  name         text NOT NULL,
  grundlage    text NOT NULL CHECK (grundlage IN ('hell', 'dunkel', 'kontrast', 'automatisch')),
  primaer      text NOT NULL,
  sekundaer    text NOT NULL,
  css          text NOT NULL DEFAULT '',
  erstellt     timestamptz NOT NULL DEFAULT now(),
  geaendert    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX designs_name_uq ON designs (haushalt_id, lower(name));

-- erstellt gestaffelt, damit die Reihenfolge in der Liste fest ist.
INSERT INTO designs (id, haushalt_id, name, grundlage, primaer, sekundaer, erstellt)
SELECT gen_random_uuid(), h.id, d.name, d.grundlage, d.primaer, d.sekundaer, now() + d.nr * interval '1 millisecond'
FROM haushalte h, (VALUES
  (1, 'Automatisch', 'automatisch', '#1D5A8A', '#2B7656'),
  (2, 'Hell',        'hell',        '#1D5A8A', '#2B7656'),
  (3, 'Dunkel',      'dunkel',      '#1D5A8A', '#2B7656'),
  (4, 'Kontrast',    'kontrast',    '#0040A0', '#006B3C')
) AS d(nr, name, grundlage, primaer, sekundaer);

INSERT INTO einstellungen (haushalt_id, schluessel, wert)
SELECT d.haushalt_id, 'design_standard', to_jsonb(d.id::text) FROM designs d WHERE d.name = 'Automatisch';
