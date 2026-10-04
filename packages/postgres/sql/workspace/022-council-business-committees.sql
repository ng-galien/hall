-- Commissions associated with a CouncilBusiness
-- ===============================================
-- The association belongs to the durable business, not to an agenda item.
-- Both parent identities must be explicitly dissociated before deletion.

-- @implements-requirement HALL-FR-BUS-070
CREATE TABLE hall.council_business_committee (
  council_business UUID NOT NULL
    REFERENCES hall.council_business (id) ON DELETE RESTRICT,
  committee UUID NOT NULL
    REFERENCES hall.council_committee (id) ON DELETE RESTRICT,
  PRIMARY KEY (council_business, committee)
);

CREATE INDEX council_business_committee_by_committee ON hall.council_business_committee USING btree (committee, council_business);

CREATE FUNCTION hall.council_business_committee_projection(target hall.council_committee)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
RETURNS NULL ON NULL INPUT
SET search_path = pg_catalog
AS $function$
  SELECT jsonb_build_object(
    'committeeId', target.id,
    'name', target.name,
    'archivedAt', target.archived_at
  )
$function$;

CREATE FUNCTION hall_api.list_council_business_committees(target_business UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $function$
  SELECT coalesce(
    jsonb_agg(
      hall.council_business_committee_projection(selected_committee)
      ORDER BY selected_committee.name, selected_committee.id
    ),
    '[]'::jsonb
  )
  FROM hall.council_business_committee AS association
  JOIN hall.council_committee AS selected_committee
    ON selected_committee.id = association.committee
  WHERE association.council_business = target_business
$function$;

CREATE FUNCTION hall_api.list_council_committee_businesses(target_committee UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $function$
  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'councilBusinessId', association.council_business,
        'title', folder.name
      ) ORDER BY folder.name, association.council_business
    ),
    '[]'::jsonb
  )
  FROM hall.council_business_committee AS association
  JOIN hall.council_business_workspace AS workspace
    ON workspace.council_business = association.council_business
  JOIN hall.resource AS folder ON folder.id = workspace.folder_resource
  WHERE association.committee = target_committee
$function$;

CREATE FUNCTION hall_api.associate_council_business_committee(
  target_business UUID,
  target_committee UUID
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $function$
DECLARE
  selected_committee hall.council_committee;
BEGIN
  PERFORM 1 FROM hall.council_business
  WHERE id = target_business FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'HV905',
      MESSAGE = format('unknown council business %s', target_business);
  END IF;

  SELECT * INTO selected_committee
  FROM hall.council_committee
  WHERE id = target_committee FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'HV820',
      MESSAGE = 'Council committee not found';
  END IF;
  IF selected_committee.archived_at IS NOT NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'HV821',
      MESSAGE = 'An archived committee cannot be associated';
  END IF;

  INSERT INTO hall.council_business_committee (council_business, committee)
  VALUES (target_business, target_committee);
  RETURN hall.council_business_committee_projection(selected_committee);
END
$function$;

CREATE FUNCTION hall_api.dissociate_council_business_committee(
  target_business UUID,
  target_committee UUID
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $function$
DECLARE
  removed_committee UUID;
  selected_committee hall.council_committee;
BEGIN
  DELETE FROM hall.council_business_committee
  WHERE council_business = target_business AND committee = target_committee
  RETURNING committee INTO removed_committee;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'HV706',
      MESSAGE = 'Council business committee association does not exist';
  END IF;

  SELECT * INTO selected_committee
  FROM hall.council_committee
  WHERE id = removed_committee;
  RETURN hall.council_business_committee_projection(selected_committee);
END
$function$;
