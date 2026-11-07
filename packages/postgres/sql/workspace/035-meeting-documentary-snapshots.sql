-- @implements-requirement HALL-FR-MIN-160
-- A meeting observation references each document by its resource identity and,
-- for a file or an editor image, by the identity of its binary object. File
-- bytes stay in hall.binary_object; name, path and media type are read from
-- the resource when the document is presented. The editable component state
-- of a non-file resource (text content, spreadsheet document) is meeting data
-- and is retained as "frozen".
CREATE FUNCTION hall.meeting_document_reference(target_resource UUID)
RETURNS JSONB LANGUAGE sql STABLE SET search_path = pg_catalog, hall AS $$
  SELECT jsonb_build_object('resource', resource.id)
    || CASE WHEN document.binary_object_id IS NOT NULL
      THEN jsonb_build_object('binaryObject', document.binary_object_id) ELSE '{}'::jsonb END
    || CASE WHEN resource.document_resource_id IS NULL THEN (
      SELECT CASE WHEN component.state = '{}'::jsonb THEN '{}'::jsonb ELSE jsonb_build_object('frozen', component.state) END
      FROM (SELECT hall.resource_detail(resource.id)
        - ARRAY(SELECT jsonb_object_keys(hall.resource_summary(resource))) AS state) component
    ) ELSE '{}'::jsonb END
    || jsonb_build_object('editorAssets', (
      SELECT coalesce(jsonb_agg(jsonb_build_object('id', asset.id, 'binaryObject', asset.binary_object_id) ORDER BY asset.id), '[]'::jsonb)
      FROM hall.editor_asset asset WHERE asset.owner_text_resource_id = resource.text_resource_id))
  FROM hall.resource resource
  LEFT JOIN hall.document_resource document ON document.id = resource.document_resource_id
  WHERE resource.id = target_resource;
$$;

CREATE FUNCTION hall.enrich_meeting_documentary_snapshot()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = pg_catalog, hall AS $$
BEGIN
  -- @implements-requirement HALL-FR-MIN-160
  -- Resolve the same historical point title as the proceedings before closure
  -- carries unfinished occurrences forward to another meeting.
  NEW.payload := jsonb_set(NEW.payload, '{agenda}', (
    SELECT coalesce(jsonb_agg(recorded.value || jsonb_build_object('title', (
      SELECT hall.council_agenda_item_title(item) FROM hall.council_agenda_item item
      WHERE item.id = (recorded.value->>'id')::UUID
    ), 'report_resource', (
      -- The business report presented with the point, cited by reference.
      SELECT workspace.report_resource FROM hall.council_business_workspace workspace
      WHERE workspace.council_business = (recorded.value->>'council_business')::UUID
    )) ORDER BY recorded.ordinality), '[]'::JSONB)
    FROM jsonb_array_elements(NEW.payload->'agenda') WITH ORDINALITY recorded
  ));
  NEW.payload := NEW.payload || jsonb_build_object('proposals', (
    SELECT coalesce(jsonb_agg(jsonb_build_object('id', workspace.council_decision_proposal, 'content', text.content)), '[]'::JSONB)
    FROM hall.council_decision_proposal_workspace workspace JOIN hall.text_resource text ON text.id = workspace.text_resource
    WHERE workspace.council_decision_proposal IN (
      SELECT (item->>'council_decision_proposal')::UUID FROM jsonb_array_elements(NEW.payload->'agenda') item)
  ));
  NEW.payload := NEW.payload || jsonb_build_object('documents', (
    SELECT coalesce(jsonb_agg(hall.meeting_document_reference(cited.id) ORDER BY cited.id), '[]'::jsonb)
    FROM hall.meeting_cited_resources(NEW.payload->'agenda') cited
  ));
  RETURN NEW;
END;
$$;
CREATE TRIGGER council_meeting_snapshot_documentary_content
BEFORE INSERT ON hall.council_meeting_snapshot
FOR EACH ROW EXECUTE FUNCTION hall.enrich_meeting_documentary_snapshot();

CREATE FUNCTION hall.meeting_snapshot_references_resource(target_resource UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SET search_path = pg_catalog, hall AS $$
  SELECT EXISTS (SELECT FROM hall.council_meeting_snapshot snapshot
    WHERE snapshot.payload->'documents' @> jsonb_build_array(jsonb_build_object('resource', target_resource)));
$$;

-- @implements-requirement HALL-FR-MIN-160
-- A document referenced by a meeting snapshot keeps its resource identity.
CREATE FUNCTION hall.reject_snapshot_resource_deletion()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = pg_catalog, hall AS $$
BEGIN
  IF hall.meeting_snapshot_references_resource(OLD.id) THEN
    RAISE EXCEPTION USING ERRCODE = 'HV703', MESSAGE = 'resource is referenced by a council meeting snapshot';
  END IF;
  RETURN OLD;
END;
$$;
CREATE TRIGGER resource_retained_by_meeting_snapshot
BEFORE DELETE ON hall.resource
FOR EACH ROW EXECUTE FUNCTION hall.reject_snapshot_resource_deletion();

-- @implements-requirement HALL-FR-MIN-160
-- A text edit removes the editor images it no longer uses. An image referenced
-- by a meeting snapshot stays attached to its text so the meeting can present it.
-- The trigger name sorts after the editor-asset refusals, which fire first.
CREATE FUNCTION hall.retain_snapshot_editor_asset()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = pg_catalog, hall AS $$
BEGIN
  IF EXISTS (SELECT FROM hall.council_meeting_snapshot snapshot
    WHERE snapshot.payload->'documents' @> jsonb_build_array(jsonb_build_object('editorAssets',
      jsonb_build_array(jsonb_build_object('id', OLD.id))))) THEN
    RETURN NULL;
  END IF;
  RETURN OLD;
END;
$$;
CREATE TRIGGER unused_editor_asset_retained_by_meeting_snapshot
BEFORE DELETE ON hall.editor_asset
FOR EACH ROW EXECUTE FUNCTION hall.retain_snapshot_editor_asset();
