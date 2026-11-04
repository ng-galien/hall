-- A prepared subject remains editable while its meeting is being prepared.
-- Opening the meeting temporarily locks every subject on the frozen agenda;
-- starting an item permanently locks that subject's title and content, as
-- does a programmed occurrence in a meeting marked stale.
-- The lock covers the subject text only: the business report and attachments
-- stay editable after the vote.

-- @implements-requirement HALL-FR-WSP-430

-- @implements-requirement HALL-FR-WSP-280
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

CREATE FUNCTION hall.capture_started_agenda_item_subject_text_locks()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, hall
AS $function$
DECLARE
  target_resource UUID;
BEGIN
  IF NEW.started_at IS NULL OR OLD.started_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT CASE NEW.subject_kind
    WHEN 'councilDecisionProposal' THEN proposal.text_resource
    WHEN 'openQuestion' THEN question.text_resource
  END
  INTO target_resource
  FROM (SELECT 1) AS source
  LEFT JOIN hall.council_decision_proposal_workspace AS proposal
    ON proposal.council_decision_proposal = NEW.council_decision_proposal
  LEFT JOIN hall.open_question_workspace AS question
    ON question.open_question = NEW.open_question;

  IF target_resource IS NOT NULL THEN
    INSERT INTO hall.agenda_subject_text_lock(resource, council_meeting, locked_at)
    VALUES(target_resource, NEW.council_meeting, NEW.started_at)
    ON CONFLICT (resource) DO NOTHING;
  END IF;
  RETURN NEW;
END
$function$;

CREATE TRIGGER council_agenda_item_capture_subject_text_locks
AFTER UPDATE OF started_at ON hall.council_agenda_item
FOR EACH ROW WHEN (OLD.started_at IS NULL AND NEW.started_at IS NOT NULL)
EXECUTE FUNCTION hall.capture_started_agenda_item_subject_text_locks();

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

  UNION

  SELECT item.council_meeting
  FROM hall.open_question_workspace AS workspace
  JOIN hall.council_agenda_item AS item
    ON item.open_question = workspace.open_question
  WHERE workspace.text_resource = target_resource
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
  AND NOT EXISTS (
    SELECT
    FROM hall.council_agenda_item AS item
    JOIN hall.council_meetings AS meeting ON meeting.id = item.council_meeting
    LEFT JOIN hall.council_decision_proposal_workspace AS proposal
      ON proposal.council_decision_proposal = item.council_decision_proposal
    LEFT JOIN hall.open_question_workspace AS question
      ON question.open_question = item.open_question
    WHERE coalesce(proposal.text_resource, question.text_resource) = target_resource
      AND meeting.started_at IS NOT NULL
      AND meeting.closed_at IS NULL
      AND NOT meeting.stale
      AND (item.position > 0 OR item.adjourned_at IS NOT NULL)
      AND NOT EXISTS (
        SELECT
        FROM hall.council_agenda_addition AS addition
        WHERE addition.agenda_item = item.id
      )
  )
  AND NOT EXISTS (
    SELECT
    FROM hall.council_agenda_item AS item
    LEFT JOIN hall.council_decision_proposal_workspace AS proposal
      ON proposal.council_decision_proposal = item.council_decision_proposal
    LEFT JOIN hall.open_question_workspace AS question
      ON question.open_question = item.open_question
    WHERE coalesce(proposal.text_resource, question.text_resource) = target_resource
      AND hall.council_agenda_item_is_treated(item)
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
  -- Starting an agenda item locks its meeting row before recording the durable
  -- source lock. Taking a share lock here serializes a concurrent edit with
  -- that transition.
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
        'container_is_folder',
        'updated_at'
      ]) = (to_jsonb(OLD) - ARRAY[
        'path',
        'full_path',
        'is_folder',
        'container_path',
        'container_is_folder',
        'updated_at'
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
        MESSAGE = 'an agenda subject text is immutable during meeting conduct or after its agenda item starts';
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

-- Tags of an agenda subject follow its title and content lock.
CREATE TRIGGER started_meeting_subject_tags_protected
BEFORE INSERT OR UPDATE OR DELETE ON hall.resource_tag
FOR EACH ROW EXECUTE FUNCTION hall.protect_started_agenda_subject_text();

-- Replacing the text mapping would bypass the title and content lock. Proposal
-- ownership is already permanent under HALL-FR-WSP-220; the open-question
-- mapping acquires the same protection once its own item has started.
CREATE FUNCTION hall.protect_started_open_question_workspace_mapping()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, hall
AS $function$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW IS NOT DISTINCT FROM OLD THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND hall.prepared_subject_is_moving(OLD.open_question)
    AND NEW.open_question = OLD.open_question AND NEW.text_resource = OLD.text_resource THEN
    RETURN NEW;
  END IF;

  PERFORM hall.lock_agenda_subject_text_meetings(OLD.text_resource);
  IF NOT hall.agenda_subject_text_is_editable(OLD.text_resource) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'HV823',
      MESSAGE = 'an agenda subject text is immutable during meeting conduct or after its agenda item starts';
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END
$function$;

CREATE TRIGGER started_meeting_open_question_workspace_mapping_protected
BEFORE UPDATE OR DELETE ON hall.open_question_workspace
FOR EACH ROW EXECUTE FUNCTION hall.protect_started_open_question_workspace_mapping();
