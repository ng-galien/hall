-- @implements-requirement HALL-FR-DIR-170
-- Copies the former free-text telephone of each contact into its mobile, personal and professional numbers, once.
-- The former column keeps its value. A number without a free slot and an unreadable part go to the notes.
-- A second run leaves every contact unchanged, also without its run marker.
DO $$
DECLARE
  target RECORD;
  part TEXT;
  compact TEXT;
  normalized TEXT;
  slot TEXT;
  mobile TEXT;
  personal TEXT;
  professional TEXT;
  carried TEXT[];
  line TEXT;
BEGIN
  IF EXISTS (SELECT FROM hall_meta.data_migration WHERE name = 'contact-phone-numbers') THEN RETURN; END IF;
  FOR target IN
    SELECT id, phone, organization_name, mobile_phone, personal_phone, professional_phone, notes
    FROM hall.contact
    WHERE phone IS NOT NULL AND btrim(phone) <> ''
    ORDER BY id
  LOOP
    mobile := target.mobile_phone;
    personal := target.personal_phone;
    professional := target.professional_phone;
    carried := ARRAY[]::TEXT[];
    FOR part IN
      SELECT btrim(piece)
      FROM regexp_split_to_table(target.phone, '\s*([/,;]|\r\n|\n|\r|\mou\M)\s*', 'i') WITH ORDINALITY AS split(piece, position)
      WHERE btrim(piece) <> ''
      ORDER BY position
    LOOP
      compact := regexp_replace(part, '[\s.()' || chr(160) || chr(8239) || '-]', '', 'g');
      normalized := CASE
        WHEN compact ~ '^0[1-9][0-9]{8}$' THEN '+33' || substr(compact, 2)
        WHEN compact ~ '^\+330[1-9][0-9]{8}$' THEN '+33' || substr(compact, 5)
        WHEN compact ~ '^\+33[1-9][0-9]{8}$' THEN compact
        WHEN compact ~ '^\+(?!33)[1-9][0-9]{6,14}$' THEN compact
      END;
      IF normalized IS NULL THEN
        line := 'Téléphone repris : ' || part;
        IF strpos(target.notes, line) = 0 AND NOT line = ANY(carried) THEN carried := carried || line; END IF;
        CONTINUE;
      END IF;
      IF normalized IN (mobile, personal, professional) THEN CONTINUE; END IF;
      slot := CASE
        WHEN normalized ~ '^\+33[67]' THEN 'mobile'
        WHEN target.organization_name IS NOT NULL THEN 'professional'
        ELSE 'personal'
      END;
      IF slot = 'mobile' AND mobile IS NULL THEN
        mobile := normalized;
      ELSIF slot = 'professional' AND professional IS NULL THEN
        professional := normalized;
      ELSIF slot = 'personal' AND personal IS NULL THEN
        personal := normalized;
      ELSE
        line := 'Téléphone repris : ' || part;
        IF strpos(target.notes, line) = 0 AND NOT line = ANY(carried) THEN carried := carried || line; END IF;
      END IF;
    END LOOP;
    UPDATE hall.contact
    SET mobile_phone = mobile,
        personal_phone = personal,
        professional_phone = professional,
        notes = CASE
          WHEN cardinality(carried) = 0 THEN notes
          WHEN btrim(notes) = '' THEN array_to_string(carried, E'\n')
          ELSE rtrim(notes) || E'\n\n' || array_to_string(carried, E'\n')
        END
    WHERE id = target.id;
  END LOOP;
  INSERT INTO hall_meta.data_migration(name) VALUES ('contact-phone-numbers');
END $$;
