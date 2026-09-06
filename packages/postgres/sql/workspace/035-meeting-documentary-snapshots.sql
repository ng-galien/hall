-- The immutable meeting observation owns copied content, including binary bytes
-- and text editor images. It remains readable if the working resource changes.
CREATE FUNCTION hall.enrich_meeting_documentary_snapshot()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = pg_catalog, hall AS $$
BEGIN
  NEW.payload := NEW.payload || jsonb_build_object('proposals', (
    SELECT coalesce(jsonb_agg(jsonb_build_object('id', workspace.council_decision_proposal, 'content', text.content)), '[]'::JSONB)
    FROM hall.council_decision_proposal_workspace workspace JOIN hall.text_resource text ON text.id = workspace.text_resource
    WHERE workspace.council_decision_proposal IN (
      SELECT (item->>'council_decision_proposal')::UUID FROM jsonb_array_elements(NEW.payload->'agenda') item)
  ));
  NEW.payload := NEW.payload || jsonb_build_object('businesses', (
    SELECT coalesce(jsonb_agg(to_jsonb(workspace) || jsonb_build_object(
      'folder', hall.resource_detail(workspace.folder_resource),
      'resources', (SELECT coalesce(jsonb_agg(to_jsonb(association) ORDER BY association.position), '[]'::jsonb)
        FROM hall.council_business_resource association WHERE association.council_business = workspace.council_business)
    ) ORDER BY workspace.council_business), '[]'::jsonb)
    FROM hall.council_business_workspace workspace
    WHERE workspace.council_business IN (SELECT (item->>'council_business')::UUID FROM jsonb_array_elements(NEW.payload->'agenda') item)
  ));
  NEW.payload := NEW.payload || jsonb_build_object('documents', (
    WITH businesses AS (
      SELECT DISTINCT (item->>'council_business')::UUID AS id
      FROM jsonb_array_elements(NEW.payload->'agenda') item
    ), resource_ids AS (
      SELECT workspace.text_resource AS id FROM hall.council_decision_proposal_workspace workspace
      JOIN businesses ON businesses.id = workspace.council_business
      UNION
      SELECT workspace.report_resource AS id FROM hall.council_business_workspace workspace
      JOIN businesses ON businesses.id = workspace.council_business
      UNION
      SELECT association.resource FROM hall.council_business_resource association
      JOIN businesses ON businesses.id = association.council_business
    )
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'resource', hall.resource_detail(resource_ids.id),
      'binary', (SELECT to_jsonb(bytes) FROM hall.document_resource document
        JOIN hall.binary_object bytes ON bytes.id = document.binary_object_id
        WHERE document.id = resource_ids.id),
      'editorAssets', (SELECT coalesce(jsonb_agg(to_jsonb(asset) || jsonb_build_object('binary', to_jsonb(bytes)) ORDER BY asset.id), '[]'::jsonb)
        FROM hall.editor_asset asset JOIN hall.binary_object bytes ON bytes.id = asset.binary_object_id
        WHERE asset.owner_text_resource_id = resource_ids.id)
    ) ORDER BY resource_ids.id), '[]'::jsonb) FROM resource_ids
  ));
  RETURN NEW;
END;
$$;
CREATE TRIGGER council_meeting_snapshot_documentary_content
BEFORE INSERT ON hall.council_meeting_snapshot
FOR EACH ROW EXECUTE FUNCTION hall.enrich_meeting_documentary_snapshot();
