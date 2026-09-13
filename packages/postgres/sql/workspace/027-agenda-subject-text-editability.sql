-- A scheduled subject keeps its own title and content editable during
-- preparation. Opening any meeting that contains it permanently locks them.

-- @functional-requirement HALL-FR-WSP-280 MEETING_START_LOCKS_AGENDA_SUBJECT_TEXTS:
CREATE TABLE hall.agenda_subject_text_lock (
  resource UUID PRIMARY KEY REFERENCES hall.resource(id) ON DELETE RESTRICT,
  council_meeting UUID NOT NULL REFERENCES hall.council_meetings(id) ON DELETE RESTRICT,
  locked_at TIMESTAMPTZ NOT NULL
);

CREATE FUNCTION hall.reject_agenda_subject_text_lock_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $function$
BEGIN
  RAISE EXCEPTION USING
    ERRCODE = 'HV823',
    MESSAGE = 'an agenda subject text lock is immutable';
END
$function$;

CREATE TRIGGER agenda_subject_text_lock_immutable
BEFORE UPDATE OR DELETE ON hall.agenda_subject_text_lock
FOR EACH ROW EXECUTE FUNCTION hall.reject_agenda_subject_text_lock_mutation();

CREATE TRIGGER agenda_subject_text_lock_no_truncate
BEFORE TRUNCATE ON hall.agenda_subject_text_lock
FOR EACH STATEMENT EXECUTE FUNCTION hall.reject_agenda_subject_text_lock_mutation();

CREATE FUNCTION hall.agenda_subject_text_resources(target_meeting UUID)
RETURNS TABLE(resource UUID)
LANGUAGE sql
STABLE
SET search_path = pg_catalog, hall
AS $function$
  SELECT workspace.text_resource
  FROM hall.council_decision_proposal_workspace AS workspace
  JOIN hall.council_agenda_item AS item
    ON item.council_decision_proposal = workspace.council_decision_proposal
  WHERE item.council_meeting = target_meeting
    AND (item.position > 0 OR item.started_at IS NOT NULL OR item.adjourned_at IS NOT NULL)

  UNION

  SELECT workspace.text_resource
  FROM hall.open_question_workspace AS workspace
  JOIN hall.council_agenda_item AS item
    ON item.open_question = workspace.open_question
  WHERE item.council_meeting = target_meeting
    AND (item.position > 0 OR item.started_at IS NOT NULL OR item.adjourned_at IS NOT NULL)
$function$;

CREATE FUNCTION hall.capture_agenda_subject_text_locks(target_meeting UUID)
RETURNS VOID
LANGUAGE plpgsql
SET search_path = pg_catalog, hall
AS $function$
DECLARE
  meeting_started_at TIMESTAMPTZ;
  target_resource UUID;
BEGIN
  SELECT meeting.started_at
  INTO meeting_started_at
  FROM hall.council_meetings AS meeting
  WHERE meeting.id = target_meeting;

  IF meeting_started_at IS NULL THEN
    RETURN;
  END IF;

  FOR target_resource IN
    SELECT source.resource
    FROM hall.agenda_subject_text_resources(target_meeting) AS source
    ORDER BY source.resource
  LOOP
    INSERT INTO hall.agenda_subject_text_lock(resource, council_meeting, locked_at)
    VALUES(target_resource, target_meeting, meeting_started_at)
    ON CONFLICT (resource) DO NOTHING;
  END LOOP;
END
$function$;

CREATE FUNCTION hall.capture_opened_meeting_subject_text_locks()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, hall
AS $function$
BEGIN
  PERFORM hall.capture_agenda_subject_text_locks(NEW.id);
  RETURN NEW;
END
$function$;

CREATE TRIGGER council_meeting_capture_subject_text_locks
AFTER UPDATE ON hall.council_meetings
FOR EACH ROW WHEN (OLD.started_at IS NULL AND NEW.started_at IS NOT NULL)
EXECUTE FUNCTION hall.capture_opened_meeting_subject_text_locks();

CREATE FUNCTION hall.capture_started_agenda_item_subject_text_locks()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, hall
AS $function$
BEGIN
  PERFORM hall.capture_agenda_subject_text_locks(NEW.council_meeting);
  RETURN NEW;
END
$function$;

CREATE TRIGGER council_agenda_item_capture_subject_text_locks
AFTER INSERT OR UPDATE OF council_meeting, council_business, council_decision_proposal, open_question
ON hall.council_agenda_item
FOR EACH ROW EXECUTE FUNCTION hall.capture_started_agenda_item_subject_text_locks();

CREATE FUNCTION hall.agenda_subject_text_meetings(target_resource UUID)
RETURNS TABLE(council_meeting UUID)
LANGUAGE sql
STABLE
SET search_path = pg_catalog, hall
AS $function$
  SELECT item.council_meeting
  FROM hall.council_decision_proposal_workspace AS workspace
  JOIN hall.council_agenda_item AS item
    ON item.council_decision_proposal = workspace.council_decision_proposal
  WHERE workspace.text_resource = target_resource
    AND (item.position > 0 OR item.started_at IS NOT NULL OR item.adjourned_at IS NOT NULL)

  UNION

  SELECT item.council_meeting
  FROM hall.open_question_workspace AS workspace
  JOIN hall.council_agenda_item AS item
    ON item.open_question = workspace.open_question
  WHERE workspace.text_resource = target_resource
    AND (item.position > 0 OR item.started_at IS NOT NULL OR item.adjourned_at IS NOT NULL)
$function$;

CREATE FUNCTION hall.agenda_subject_text_is_editable(target_resource UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SET search_path = pg_catalog, hall
AS $function$
  SELECT NOT EXISTS (
    SELECT
    FROM hall.agenda_subject_text_lock AS source_lock
    WHERE source_lock.resource = target_resource
  )
$function$;

CREATE FUNCTION hall.lock_agenda_subject_text_meetings(target_resource UUID)
RETURNS VOID
LANGUAGE plpgsql
SET search_path = pg_catalog, hall
AS $function$
DECLARE
  target_meeting UUID;
BEGIN
  -- A meeting start updates and therefore locks the same row before capturing
  -- its sources. Taking a share lock here serializes a concurrent edit either
  -- before that transition, when it remains valid, or after the durable source
  -- lock has been recorded.
  FOR target_meeting IN
    SELECT source.council_meeting
    FROM hall.agenda_subject_text_meetings(target_resource) AS source
    ORDER BY source.council_meeting
  LOOP
    PERFORM 1
    FROM hall.council_meetings AS meeting
    WHERE meeting.id = target_meeting
    FOR SHARE;
  END LOOP;
END
$function$;

CREATE FUNCTION hall.protect_started_agenda_subject_text()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, hall
AS $function$
DECLARE
  target_resource UUID;
  path_only_change BOOLEAN := false;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW IS NOT DISTINCT FROM OLD THEN
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'resource' AND TG_OP = 'UPDATE' THEN
    path_only_change := NEW.path IS DISTINCT FROM OLD.path
      AND (to_jsonb(NEW) - ARRAY[
        'path',
        'full_path',
        'is_folder',
        'container_path',
        'container_is_folder'
      ]) = (to_jsonb(OLD) - ARRAY[
        'path',
        'full_path',
        'is_folder',
        'container_path',
        'container_is_folder'
      ]);
  END IF;

  FOR target_resource IN
    SELECT DISTINCT resource_id
    FROM unnest(ARRAY[
      CASE WHEN TG_OP <> 'INSERT' THEN coalesce(
        to_jsonb(OLD) ->> 'owner_text_resource_id',
        to_jsonb(OLD) ->> 'resource_id',
        to_jsonb(OLD) ->> 'id'
      )::UUID END,
      CASE WHEN TG_OP <> 'DELETE' THEN coalesce(
        to_jsonb(NEW) ->> 'owner_text_resource_id',
        to_jsonb(NEW) ->> 'resource_id',
        to_jsonb(NEW) ->> 'id'
      )::UUID END
    ]) AS resource_id
    WHERE resource_id IS NOT NULL
    ORDER BY resource_id
  LOOP
    PERFORM hall.lock_agenda_subject_text_meetings(target_resource);
    IF NOT hall.agenda_subject_text_is_editable(target_resource) AND NOT path_only_change THEN
      RAISE EXCEPTION USING
        ERRCODE = 'HV823',
        MESSAGE = 'an agenda subject text is immutable after its meeting starts';
    END IF;
  END LOOP;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END
$function$;

CREATE TRIGGER started_meeting_subject_title_protected
BEFORE UPDATE OR DELETE ON hall.resource
FOR EACH ROW EXECUTE FUNCTION hall.protect_started_agenda_subject_text();

CREATE TRIGGER started_meeting_subject_content_protected
BEFORE UPDATE OR DELETE ON hall.text_resource
FOR EACH ROW EXECUTE FUNCTION hall.protect_started_agenda_subject_text();

CREATE TRIGGER started_meeting_subject_asset_protected
BEFORE INSERT OR UPDATE OR DELETE ON hall.editor_asset
FOR EACH ROW EXECUTE FUNCTION hall.protect_started_agenda_subject_text();

-- Replacing the text mapping would bypass the title and content lock. Proposal
-- ownership is already permanent under HALL-FR-WSP-220; the open-question
-- mapping acquires the same protection once its item belongs to an open meeting.
CREATE FUNCTION hall.protect_started_open_question_workspace_mapping()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, hall
AS $function$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW IS NOT DISTINCT FROM OLD THEN
    RETURN NEW;
  END IF;

  PERFORM hall.lock_agenda_subject_text_meetings(OLD.text_resource);
  IF NOT hall.agenda_subject_text_is_editable(OLD.text_resource) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'HV823',
      MESSAGE = 'an agenda subject text is immutable after its meeting starts';
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END
$function$;

CREATE TRIGGER started_meeting_open_question_workspace_mapping_protected
BEFORE UPDATE OR DELETE ON hall.open_question_workspace
FOR EACH ROW EXECUTE FUNCTION hall.protect_started_open_question_workspace_mapping();
