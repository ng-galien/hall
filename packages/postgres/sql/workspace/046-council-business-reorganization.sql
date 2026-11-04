-- Council business reorganization: a prepared subject moves to another
-- business with its text, and a business merges into another one. Each gesture
-- has a preview that writes nothing. Only these functions change the business
-- of a subject; they mark the subject for the current transaction so the
-- ownership triggers (HV809, HV820, HV214, HV223, HV823) accept exactly that
-- change. Snapshots, minutes, decisions, ballots and frozen agendas are never
-- rewritten.

CREATE FUNCTION hall.prepared_subject_is_moving(target_subject UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SET search_path = pg_catalog, hall AS $$
  SELECT target_subject IS NOT NULL
    AND coalesce(current_setting('hall.prepared_subject_move', true), '') = target_subject::TEXT;
$$;

-- @implements-requirement HALL-FR-AGI-110
-- The business copied in an agenda item follows its subject's move; nothing
-- else of the item changes.
CREATE FUNCTION hall.agenda_item_follows_subject_move(old_item hall.council_agenda_item, new_item hall.council_agenda_item)
RETURNS BOOLEAN LANGUAGE sql STABLE SET search_path = pg_catalog, hall AS $$
  SELECT hall.prepared_subject_is_moving(coalesce(old_item.council_decision_proposal, old_item.open_question))
    AND (to_jsonb(new_item) - ARRAY['council_business', 'subject_kind'])
      = (to_jsonb(old_item) - ARRAY['council_business', 'subject_kind']);
$$;

CREATE FUNCTION hall.council_business_reorganization_side(target_business UUID)
RETURNS JSONB LANGUAGE sql STABLE SET search_path = pg_catalog, hall AS $$
  SELECT jsonb_build_object('id', workspace.council_business, 'title', folder.name, 'folderPath', folder.full_path)
  FROM hall.council_business_workspace workspace
  JOIN hall.resource folder ON folder.id = workspace.folder_resource
  WHERE workspace.council_business = target_business;
$$;

CREATE FUNCTION hall.prepared_subject_move_plan(target_subject UUID, target_kind TEXT, target_business UUID, check_names BOOLEAN)
RETURNS JSONB LANGUAGE sql STABLE SET search_path = pg_catalog, hall AS $$
  WITH subject AS (
    SELECT subject.id, subject.kind, subject.council_business, subject.text_resource, text.name, text.path,
      destination.full_path AS destination_path
    FROM hall.prepared_council_subject subject
    JOIN hall.resource text ON text.id = subject.text_resource
    JOIN hall.council_business_workspace workspace ON workspace.council_business = target_business
    JOIN hall.resource destination ON destination.id = workspace.folder_resource
    WHERE subject.id = target_subject AND subject.kind = target_kind
  ), occurrences AS (
    SELECT item.id, item.position, hall.council_agenda_item_is_treated(item) AS treated, meeting.number, meeting.started_at AS meeting_started_at, meeting.closed_at AS meeting_closed_at, meeting.stale
    FROM subject
    JOIN hall.council_agenda_item item
      ON item.council_decision_proposal = subject.id OR item.open_question = subject.id
    JOIN hall.council_meetings meeting ON meeting.id = item.council_meeting
  )
  SELECT jsonb_build_object(
    'subjectId', subject.id,
    'kind', subject.kind,
    'title', subject.name,
    'from', hall.council_business_reorganization_side(subject.council_business),
    'to', hall.council_business_reorganization_side(target_business),
    'text', jsonb_build_object('resourceId', subject.text_resource, 'name', subject.name,
      'fromPath', subject.path, 'toPath', subject.destination_path),
    'voted', EXISTS (SELECT FROM hall.proposal_text_seal seal WHERE seal.council_decision_proposal = subject.id),
    'agenda', (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'agendaItemId', occurrence.id, 'meetingNumber', occurrence.number, 'position', occurrence.position,
        'treated', occurrence.treated,
        'meetingClosed', occurrence.meeting_closed_at IS NOT NULL, 'meetingStale', occurrence.stale)
      ORDER BY occurrence.number, occurrence.id), '[]'::JSONB) FROM occurrences occurrence),
    'blockers', to_jsonb(array_remove(ARRAY[
      CASE WHEN subject.council_business = target_business THEN 'sameBusiness' END,
      CASE WHEN EXISTS (SELECT FROM occurrences occurrence
        WHERE occurrence.meeting_started_at IS NOT NULL AND occurrence.meeting_closed_at IS NULL AND NOT occurrence.stale)
        THEN 'meetingInProgress' END,
      CASE WHEN check_names AND subject.path <> subject.destination_path AND EXISTS (
        SELECT FROM hall.resource neighbour
        WHERE neighbour.path = subject.destination_path AND lower(neighbour.name) = lower(subject.name)
          AND neighbour.id <> subject.text_resource) THEN 'nameTaken' END
    ], NULL))
  )
  FROM subject;
$$;

CREATE FUNCTION hall.apply_prepared_subject_move(target_subject UUID, target_kind TEXT, target_business UUID)
RETURNS VOID LANGUAGE plpgsql SET search_path = pg_catalog, hall AS $$
DECLARE subject hall.prepared_council_subject; destination_path TEXT; text_resource hall.resource;
BEGIN
  SELECT * INTO STRICT subject FROM hall.prepared_council_subject WHERE id = target_subject AND kind = target_kind;
  SELECT folder.full_path INTO STRICT destination_path
  FROM hall.council_business_workspace workspace JOIN hall.resource folder ON folder.id = workspace.folder_resource
  WHERE workspace.council_business = target_business;
  SELECT * INTO STRICT text_resource FROM hall.resource WHERE id = subject.text_resource;
  PERFORM set_config('hall.prepared_subject_move', target_subject::TEXT, true);
  IF target_kind = 'councilDecisionProposal' THEN
    PERFORM 1 FROM hall.council_decision_proposal WHERE id = target_subject FOR UPDATE;
    UPDATE hall.council_decision_proposal SET council_business = target_business WHERE id = target_subject;
  ELSE
    PERFORM 1 FROM hall.open_question WHERE id = target_subject FOR UPDATE;
    UPDATE hall.open_question SET council_business = target_business WHERE id = target_subject;
  END IF;
  IF text_resource.path <> destination_path THEN
    PERFORM hall.relocate_resource(text_resource.id, destination_path, text_resource.name);
  END IF;
  IF target_kind = 'councilDecisionProposal' THEN
    UPDATE hall.council_decision_proposal_workspace SET council_business = target_business
    WHERE council_decision_proposal = target_subject;
    DELETE FROM hall.council_business_resource
    WHERE council_business = subject.council_business AND resource = subject.text_resource;
    INSERT INTO hall.council_business_resource(council_business, resource, position)
    SELECT target_business, subject.text_resource, coalesce(max(position), 0) + 1
    FROM hall.council_business_resource WHERE council_business = target_business
    HAVING NOT EXISTS (SELECT FROM hall.council_business_resource
      WHERE council_business = target_business AND resource = subject.text_resource);
  ELSE
    UPDATE hall.open_question_workspace SET council_business = target_business WHERE open_question = target_subject;
  END IF;
  UPDATE hall.council_agenda_item SET council_business = target_business
  WHERE council_decision_proposal = target_subject OR open_question = target_subject;
  PERFORM set_config('hall.prepared_subject_move', '', true);
END;
$$;

CREATE FUNCTION hall.lock_council_businesses_for_reorganization(first_business UUID, second_business UUID)
RETURNS VOID LANGUAGE plpgsql SET search_path = pg_catalog, hall AS $$
DECLARE locked INTEGER;
BEGIN
  PERFORM hall.lock_resource_namespace();
  SELECT count(*) INTO locked FROM (
    SELECT id FROM hall.council_business WHERE id IN (first_business, second_business) ORDER BY id FOR UPDATE
  ) business;
  IF locked < (CASE WHEN first_business = second_business THEN 1 ELSE 2 END) THEN
    RAISE EXCEPTION USING ERRCODE = 'HV609', MESSAGE = 'Council business not found';
  END IF;
END;
$$;

-- Moves a prepared subject with its text to another business, or previews the move.
CREATE FUNCTION hall_api.move_prepared_council_subject(target_subject UUID, target_kind TEXT, target_business UUID, preview BOOLEAN)
RETURNS JSONB LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, hall AS $$
DECLARE source_business UUID; plan JSONB;
BEGIN
  SELECT council_business INTO source_business FROM hall.prepared_council_subject WHERE id = target_subject AND kind = target_kind;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'HV609', MESSAGE = 'Prepared subject not found';
  END IF;
  PERFORM hall.lock_council_businesses_for_reorganization(source_business, target_business);
  plan := hall.prepared_subject_move_plan(target_subject, target_kind, target_business, true);
  IF preview THEN
    RETURN plan || jsonb_build_object('applied', false);
  END IF;
  IF jsonb_array_length(plan->'blockers') > 0 THEN
    RAISE EXCEPTION USING ERRCODE = 'HV826',
      MESSAGE = format('the prepared subject cannot move: %s', plan->'blockers'), DETAIL = plan::TEXT;
  END IF;
  PERFORM hall.apply_prepared_subject_move(target_subject, target_kind, target_business);
  RETURN plan || jsonb_build_object('applied', true, 'movedResourceIds', jsonb_build_array(plan#>'{text,resourceId}'));
END;
$$;

CREATE FUNCTION hall.merged_report_name(source_title TEXT, target_path TEXT, arriving_names TEXT[])
RETURNS TEXT LANGUAGE plpgsql STABLE SET search_path = pg_catalog, hall AS $$
DECLARE base TEXT := left(source_title, 240); candidate TEXT := base; ordinal INTEGER := 1;
BEGIN
  WHILE EXISTS (SELECT FROM hall.resource WHERE path = target_path AND lower(name) = lower(candidate))
    OR lower(candidate) = ANY (SELECT lower(name) FROM unnest(arriving_names) name) LOOP
    ordinal := ordinal + 1;
    candidate := base || ' (' || ordinal::TEXT || ')';
  END LOOP;
  RETURN candidate;
END;
$$;

CREATE FUNCTION hall.council_business_merge_plan(source_business UUID, target_business UUID)
RETURNS JSONB LANGUAGE sql STABLE SET search_path = pg_catalog, hall AS $$
  WITH source AS (
    SELECT workspace.*, folder.full_path AS folder_path, report.name AS report_name,
      btrim(report_text.content) <> '' AS report_kept
    FROM hall.council_business_workspace workspace
    JOIN hall.resource folder ON folder.id = workspace.folder_resource
    JOIN hall.resource report ON report.id = workspace.report_resource
    JOIN hall.text_resource report_text ON report_text.id = workspace.report_resource
    WHERE workspace.council_business = source_business
  ), target AS (
    SELECT workspace.*, folder.full_path AS folder_path
    FROM hall.council_business_workspace workspace
    JOIN hall.resource folder ON folder.id = workspace.folder_resource
    WHERE workspace.council_business = target_business
  ), subjects AS (
    SELECT subject.id, subject.kind, subject.text_resource,
      hall.prepared_subject_move_plan(subject.id, subject.kind, target_business, false) AS plan
    FROM hall.prepared_council_subject subject WHERE subject.council_business = source_business
  ), arrivals AS (
    SELECT resource.id, resource.name, resource.is_folder, 'subjectText' AS role
    FROM subjects JOIN hall.resource resource ON resource.id = subjects.text_resource
    UNION
    SELECT resource.id, resource.name, resource.is_folder, 'folderContent'
    FROM source JOIN hall.resource resource ON resource.path = source.folder_path
    WHERE resource.id <> source.report_resource
      AND NOT EXISTS (SELECT FROM subjects WHERE subjects.text_resource = resource.id)
  ), conflicts AS (
    SELECT arrival.name FROM arrivals arrival CROSS JOIN target
    WHERE EXISTS (SELECT FROM hall.resource neighbour WHERE neighbour.path = target.folder_path
      AND lower(neighbour.name) = lower(arrival.name) AND neighbour.id <> arrival.id)
    UNION
    SELECT min(arrival.name) FROM arrivals arrival GROUP BY lower(arrival.name) HAVING count(*) > 1
  )
  SELECT jsonb_build_object(
    'from', hall.council_business_reorganization_side(source_business),
    'to', hall.council_business_reorganization_side(target_business),
    'subjects', (SELECT coalesce(jsonb_agg(subjects.plan - 'from' - 'to' ORDER BY subjects.plan->>'title', subjects.id), '[]'::JSONB) FROM subjects),
    'resources', jsonb_build_object(
      'transferred', (SELECT coalesce(jsonb_agg(jsonb_build_object('resourceId', link.resource, 'name', resource.name) ORDER BY link.position), '[]'::JSONB)
        FROM hall.council_business_resource link JOIN hall.resource resource ON resource.id = link.resource
        WHERE link.council_business = source_business
          AND NOT EXISTS (SELECT FROM subjects WHERE subjects.text_resource = link.resource)
          AND NOT EXISTS (SELECT FROM hall.council_business_resource other WHERE other.council_business = target_business AND other.resource = link.resource)),
      'alreadyAttached', (SELECT coalesce(jsonb_agg(jsonb_build_object('resourceId', link.resource, 'name', resource.name) ORDER BY link.position), '[]'::JSONB)
        FROM hall.council_business_resource link JOIN hall.resource resource ON resource.id = link.resource
        WHERE link.council_business = source_business
          AND EXISTS (SELECT FROM hall.council_business_resource other WHERE other.council_business = target_business AND other.resource = link.resource))),
    'committees', (SELECT coalesce(jsonb_agg(jsonb_build_object('committeeId', link.committee, 'name', committee.name,
        'alreadyAssociated', EXISTS (SELECT FROM hall.council_business_committee other WHERE other.council_business = target_business AND other.committee = link.committee))
        ORDER BY committee.name), '[]'::JSONB)
      FROM hall.council_business_committee link JOIN hall.council_committee committee ON committee.id = link.committee
      WHERE link.council_business = source_business),
    'folderContent', (SELECT coalesce(jsonb_agg(jsonb_build_object('resourceId', arrival.id, 'name', arrival.name, 'isFolder', arrival.is_folder) ORDER BY arrival.name), '[]'::JSONB)
      FROM arrivals arrival WHERE arrival.role = 'folderContent'),
    'report', (SELECT jsonb_build_object('resourceId', source.report_resource, 'name', source.report_name,
      'fate', CASE WHEN source.report_kept THEN 'attachedToTarget' ELSE 'deleted' END,
      'newName', CASE WHEN source.report_kept THEN hall.merged_report_name(
        (SELECT folder.name FROM hall.resource folder WHERE folder.id = source.folder_resource), target.folder_path,
        ARRAY(SELECT arrival.name FROM arrivals arrival)) END) FROM source CROSS JOIN target),
    'blockers', to_jsonb(array_remove(ARRAY[
        CASE WHEN source_business = target_business THEN 'sameBusiness' END,
        CASE WHEN EXISTS (SELECT FROM subjects WHERE subjects.plan->'blockers' ? 'meetingInProgress') THEN 'meetingInProgress' END
      ], NULL) || ARRAY(SELECT 'nameTaken:' || conflicts.name FROM conflicts ORDER BY conflicts.name))
  );
$$;

-- Merges a business into another one and removes it, or previews the merge.
CREATE FUNCTION hall_api.merge_council_business(source_business UUID, target_business UUID, preview BOOLEAN)
RETURNS JSONB LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, hall AS $$
DECLARE plan JSONB; subject RECORD; link RECORD; child RECORD; source hall.council_business_workspace;
  target_path TEXT; report_kept BOOLEAN; moved UUID[] := '{}';
BEGIN
  PERFORM hall.lock_council_businesses_for_reorganization(source_business, target_business);
  plan := hall.council_business_merge_plan(source_business, target_business);
  IF preview THEN
    RETURN plan || jsonb_build_object('applied', false);
  END IF;
  IF jsonb_array_length(plan->'blockers') > 0 THEN
    RAISE EXCEPTION USING ERRCODE = 'HV827',
      MESSAGE = format('the council business cannot merge: %s', plan->'blockers'), DETAIL = plan::TEXT;
  END IF;
  SELECT * INTO STRICT source FROM hall.council_business_workspace WHERE council_business = source_business;
  SELECT folder.full_path INTO STRICT target_path
  FROM hall.council_business_workspace workspace JOIN hall.resource folder ON folder.id = workspace.folder_resource
  WHERE workspace.council_business = target_business;
  report_kept := plan#>>'{report,fate}' = 'attachedToTarget';
  FOR subject IN SELECT id, kind, text_resource FROM hall.prepared_council_subject WHERE council_business = source_business ORDER BY id LOOP
    PERFORM hall.apply_prepared_subject_move(subject.id, subject.kind, target_business);
    moved := moved || subject.text_resource;
  END LOOP;
  FOR link IN SELECT resource FROM hall.council_business_resource WHERE council_business = source_business ORDER BY position LOOP
    INSERT INTO hall.council_business_resource(council_business, resource, position)
    SELECT target_business, link.resource, coalesce(max(position), 0) + 1
    FROM hall.council_business_resource WHERE council_business = target_business
    HAVING NOT EXISTS (SELECT FROM hall.council_business_resource
      WHERE council_business = target_business AND resource = link.resource);
  END LOOP;
  DELETE FROM hall.council_business_resource WHERE council_business = source_business;
  INSERT INTO hall.council_business_committee(council_business, committee)
  SELECT target_business, committee FROM hall.council_business_committee WHERE council_business = source_business
  ON CONFLICT DO NOTHING;
  DELETE FROM hall.council_business_committee WHERE council_business = source_business;
  FOR child IN SELECT resource.id, resource.name FROM hall.resource resource
    JOIN hall.resource folder ON folder.id = source.folder_resource
    WHERE resource.path = folder.full_path AND resource.id <> source.report_resource ORDER BY resource.name, resource.id LOOP
    PERFORM hall.relocate_resource(child.id, target_path, child.name);
    moved := moved || child.id;
  END LOOP;
  DELETE FROM hall.council_business_workspace WHERE council_business = source_business;
  DELETE FROM hall.council_business WHERE id = source_business;
  IF report_kept THEN
    PERFORM hall.relocate_resource(source.report_resource, target_path, hall.merged_report_name(
      (SELECT name FROM hall.resource WHERE id = source.folder_resource), target_path, '{}'::TEXT[]));
    PERFORM hall_api.associate_council_business_resource(target_business, source.report_resource);
    moved := moved || source.report_resource;
  ELSE
    PERFORM hall_api.delete_resource(source.report_resource);
  END IF;
  PERFORM hall_api.delete_resource(source.folder_resource);
  RETURN plan || jsonb_build_object('applied', true, 'movedResourceIds', to_jsonb(moved));
END;
$$;
