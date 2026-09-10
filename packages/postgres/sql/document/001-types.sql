-- The documentary structural model needs no PostgreSQL enum.
-- Resource nature is derived from the single non-null component reference.

-- @functional-requirement HALL-FR-DOC-020 RESOURCE_LOCATION_IS_NORMALIZED:
CREATE FUNCTION hall.is_normalized_resource_path(candidate TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = pg_catalog
AS $function$
  SELECT candidate = ''
    OR (
      candidate = btrim(candidate)
      AND candidate !~ '^/'
      AND candidate !~ '/$'
      AND candidate !~ '//'
      AND candidate !~ '(^|/)[.][.]?(/|$)'
    )
$function$;

CREATE FUNCTION hall.is_valid_resource_name(candidate TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = pg_catalog
AS $function$
  SELECT candidate = btrim(candidate)
    AND candidate <> ''
    AND length(candidate) <= 200
    AND strpos(candidate, '/') = 0
    AND candidate NOT IN ('.', '..')
$function$;

-- @functional-requirement HALL-FR-DOC-170 RESOURCE_SLUG_IS_STABLE:
CREATE FUNCTION hall.is_valid_resource_slug(candidate TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = pg_catalog
AS $function$
  SELECT candidate = btrim(candidate)
    AND length(candidate) BETWEEN 1 AND 200
    AND candidate ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    AND candidate !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
$function$;

-- This normalization deliberately belongs to the PostgreSQL write authority:
-- automatically ensured folders and explicitly created resources follow the
-- exact same rule without a second allocator in the server.
CREATE FUNCTION hall.resource_slug_base(resource_name TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
RETURNS NULL ON NULL INPUT
SET search_path = pg_catalog
AS $function$
  SELECT coalesce(
    nullif(
      btrim(
        regexp_replace(
          translate(
            replace(replace(lower(resource_name), 'œ', 'oe'), 'æ', 'ae'),
            'àáâãäåçèéêëìíîïñòóôõöùúûüýÿ',
            'aaaaaaceeeeiiiinooooouuuuyy'
          ),
          '[^a-z0-9]+',
          '-',
          'g'
        ),
        '-'
      ),
      ''
    ),
    'element'
  )
$function$;

-- @functional-requirement HALL-FR-DOC-210 RESOURCE_HYDRATION_IS_SCOPED:
CREATE FUNCTION hall.normalize_resource_search(candidate TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
RETURNS NULL ON NULL INPUT
SET search_path = pg_catalog
AS $function$
  SELECT btrim(
    regexp_replace(
      translate(
        replace(replace(lower(candidate), 'œ', 'oe'), 'æ', 'ae'),
        'àáâãäåçèéêëìíîïñòóôõöùúûüýÿ',
        'aaaaaaceeeeiiiinooooouuuuyy'
      ),
      '[^a-z0-9]+',
      ' ',
      'g'
    )
  )
$function$;

-- Calendar content validates date shape and ordering at the persistence boundary.
CREATE FUNCTION hall.is_valid_event_document(candidate JSONB)
RETURNS BOOLEAN LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog AS $function$
DECLARE
  participant JSONB;
  schedule JSONB := candidate -> 'schedule';
BEGIN
  IF jsonb_typeof(candidate) <> 'object'
    OR jsonb_typeof(candidate -> 'content') IS DISTINCT FROM 'string'
    OR jsonb_typeof(candidate -> 'location') IS DISTINCT FROM 'string'
    OR jsonb_typeof(candidate -> 'participants') IS DISTINCT FROM 'array' THEN RETURN false; END IF;
  IF schedule ->> 'kind' = 'allDay' THEN
    IF NOT COALESCE(schedule ->> 'start' ~ '^\d{4}-\d{2}-\d{2}$'
      AND schedule ->> 'end' ~ '^\d{4}-\d{2}-\d{2}$'
      AND (schedule ->> 'end')::date > (schedule ->> 'start')::date, false) THEN RETURN false; END IF;
  ELSIF schedule ->> 'kind' = 'timed' THEN
    IF NOT COALESCE(schedule ->> 'start' ~ '(Z|[+-]\d{2}:\d{2})$'
      AND schedule ->> 'end' ~ '(Z|[+-]\d{2}:\d{2})$'
      AND (schedule ->> 'end')::timestamptz > (schedule ->> 'start')::timestamptz, false) THEN RETURN false; END IF;
  ELSE RETURN false;
  END IF;
  FOR participant IN SELECT value FROM jsonb_array_elements(candidate -> 'participants') LOOP
    IF participant ->> 'kind' = 'contact' THEN
      IF participant ->> 'contactId' IS NULL THEN RETURN false; END IF;
      PERFORM (participant ->> 'contactId')::uuid;
    ELSIF participant ->> 'kind' = 'guest' THEN
      IF jsonb_typeof(participant -> 'name') IS DISTINCT FROM 'string'
        OR btrim(participant ->> 'name') = '' THEN RETURN false; END IF;
    ELSE RETURN false;
    END IF;
  END LOOP;
  RETURN true;
EXCEPTION WHEN invalid_text_representation OR datetime_field_overflow OR invalid_datetime_format THEN
  RETURN false;
END
$function$;
