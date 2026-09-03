-- Council agenda read and action surface
-- ======================================
--
-- Agenda projections contain only council identities and lifecycle facts.
-- Documentary resources are fetched independently through their own API.

-- @functional-requirement HALL-FR-WSP-060 COUNCIL_AGENDA_PROJECTION_IS_SCOPED:
CREATE FUNCTION hall.council_agenda_item_projection(target hall.council_agenda_item)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
RETURNS NULL ON NULL INPUT
SET search_path = pg_catalog
AS $function$
  SELECT jsonb_build_object(
    'id', target.id,
    'councilBusinessId', target.council_business,
    'councilMeetingId', target.council_meeting,
    'position', target.position,
    'subject', CASE
      WHEN target.minutes_approval IS NOT NULL THEN jsonb_build_object(
        'kind', 'minutesApproval',
        'id', target.minutes_approval
      )
      WHEN target.council_decision_proposal IS NOT NULL THEN jsonb_build_object(
        'kind', 'councilDecisionProposal',
        'id', target.council_decision_proposal
      )
      ELSE jsonb_build_object(
        'kind', 'openQuestion',
        'id', target.open_question
      )
    END,
    'startedAt', target.started_at,
    'completedAt', target.completed_at
  )
$function$;

CREATE FUNCTION hall_api.open_council_agenda_item(target_agenda_item UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $function$
  SELECT hall.council_agenda_item_projection(agenda_item)
  FROM hall.council_agenda_item AS agenda_item
  WHERE agenda_item.id = target_agenda_item
$function$;

CREATE FUNCTION hall_api.list_council_agenda(target_meeting UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $function$
  SELECT coalesce(
    jsonb_agg(
      hall.council_agenda_item_projection(agenda_item)
      ORDER BY abs(agenda_item.position), agenda_item.id
    ),
    '[]'::jsonb
  )
  FROM hall.council_agenda_item AS agenda_item
  WHERE agenda_item.council_meeting = target_meeting
$function$;

-- @functional-requirement HALL-FR-WSP-070 COUNCIL_AGENDA_ACTIONS_RETURN_THE_SCOPED_PROJECTION:
CREATE FUNCTION hall_api.schedule_council_decision_proposal(
  target_business UUID,
  target_meeting UUID,
  target_position INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $function$
DECLARE
  agenda_item_id UUID;
BEGIN
  agenda_item_id := hall.schedule_council_decision_proposal(
    target_business, target_meeting, target_position
  );
  RETURN hall_api.open_council_agenda_item(agenda_item_id);
END
$function$;

CREATE FUNCTION hall_api.schedule_open_question(
  target_business UUID,
  target_meeting UUID,
  target_position INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $function$
DECLARE
  agenda_item_id UUID;
BEGIN
  agenda_item_id := hall.schedule_open_question(target_business, target_meeting, target_position);
  RETURN hall_api.open_council_agenda_item(agenda_item_id);
END
$function$;

CREATE FUNCTION hall_api.schedule_minutes_approval(
  target_business UUID,
  target_meeting UUID,
  target_minutes_approval UUID
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $function$
DECLARE
  agenda_item_id UUID;
BEGIN
  agenda_item_id := hall.schedule_minutes_approval(
    target_business, target_meeting, target_minutes_approval
  );
  RETURN hall_api.open_council_agenda_item(agenda_item_id);
END
$function$;

CREATE FUNCTION hall_api.deprogram_council_agenda_item(target_agenda_item UUID)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $function$
DECLARE
  changed hall.council_agenda_item;
BEGIN
  changed := hall.deprogram_council_agenda_item(target_agenda_item);
  RETURN hall.council_agenda_item_projection(changed);
END
$function$;

CREATE FUNCTION hall_api.reprogram_council_agenda_item(
  target_agenda_item UUID,
  target_meeting UUID,
  target_position INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $function$
DECLARE
  changed hall.council_agenda_item;
BEGIN
  changed := hall.reprogram_council_agenda_item(
    target_agenda_item, target_meeting, target_position
  );
  RETURN hall.council_agenda_item_projection(changed);
END
$function$;

CREATE FUNCTION hall_api.start_council_agenda_item(
  target_agenda_item UUID,
  start_time TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $function$
DECLARE
  changed hall.council_agenda_item;
BEGIN
  changed := hall.start_council_agenda_item(target_agenda_item, start_time);
  RETURN hall.council_agenda_item_projection(changed);
END
$function$;

CREATE FUNCTION hall_api.complete_open_question(
  target_agenda_item UUID,
  completion_time TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $function$
DECLARE
  changed hall.council_agenda_item;
BEGIN
  changed := hall.complete_open_question(target_agenda_item, completion_time);
  RETURN hall.council_agenda_item_projection(changed);
END
$function$;
