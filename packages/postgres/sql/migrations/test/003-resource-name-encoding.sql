-- Repairs resource names that were stored as UTF-8 bytes read as Latin-1.
-- A name is repaired only when its Latin-1 bytes form valid UTF-8 that differs
-- from it and no sibling already carries the repaired name.
DO $migration$
DECLARE
  candidate RECORD;
  repaired TEXT;
BEGIN
  FOR candidate IN
    SELECT id, path, name
    FROM hall.resource
    WHERE NOT is_folder
      AND name ~ '[Â-ô][\u0080-¿]'
      AND name !~ '[^\u0001-ÿ]'
  LOOP
    BEGIN
      repaired := normalize(convert_from(convert_to(candidate.name, 'LATIN1'), 'UTF8'), NFC);
    EXCEPTION WHEN character_not_in_repertoire OR untranslatable_character OR invalid_parameter_value THEN
      CONTINUE;
    END;
    IF repaired = candidate.name OR repaired ~ '[\u0080-\u009f]' THEN
      CONTINUE;
    END IF;
    IF EXISTS (
      SELECT FROM hall.resource sibling
      WHERE sibling.path = candidate.path AND lower(sibling.name) = lower(repaired) AND sibling.id <> candidate.id
    ) THEN
      CONTINUE;
    END IF;
    UPDATE hall.resource SET name = repaired WHERE id = candidate.id;
  END LOOP;
END
$migration$;
