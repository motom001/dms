-- Systemmappentyp „E-Mail“ (#58): versendete E-Mails als Mappen.
ALTER TABLE mappentypen DROP CONSTRAINT IF EXISTS mappentypen_system_check;
ALTER TABLE mappentypen ADD CONSTRAINT mappentypen_system_check CHECK (system IN ('benutzer', 'rolle', 'email'));
