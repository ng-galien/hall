-- An exceptional whole-business transfer, not a synchronization mechanism.
-- The existing business UUID is the duplicate guard; deletion removes that guard.
CREATE FUNCTION hall_api.import_council_business_bundle(bundle JSONB, binary_files JSONB, parent_path TEXT)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $function$
DECLARE
  source_business UUID := (bundle #>> '{business,sourceId}')::UUID;
  source_folder UUID := (bundle #>> '{business,folderSourceId}')::UUID;
  source_report UUID := (bundle #>> '{business,reportSourceId}')::UUID;
  folder_data JSONB;
  report_data JSONB;
  entry JSONB;
  item JSONB;
  created JSONB;
  identity_map JSONB := '{}'::JSONB;
  workspace JSONB;
  target_path TEXT;
  root_path TEXT;
  old_root TEXT;
  local_id UUID;
  rewritten TEXT;
  pair RECORD;
  asset_ids UUID[];
  layer_file JSONB;
  overlay JSONB;
BEGIN
  PERFORM hall.lock_resource_namespace();
  IF EXISTS (SELECT FROM hall.council_business WHERE id = source_business) THEN
    RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'Council business already exists';
  END IF;
  SELECT value->'data' INTO STRICT folder_data FROM jsonb_array_elements(bundle->'resources') WHERE value#>>'{data,id}'=source_folder::TEXT;
  SELECT value->'data' INTO STRICT report_data FROM jsonb_array_elements(bundle->'resources') WHERE value#>>'{data,id}'=source_report::TEXT;
  PERFORM hall.create_council_business_workspace(parent_path, bundle#>>'{business,name}', report_data->>'name', report_data->>'content', source_business);
  workspace := hall.council_business_workspace_projection(source_business);
  root_path := parent_path || '/' || (bundle#>>'{business,name}');
  old_root := folder_data->>'fullPath';
  identity_map := jsonb_build_object(source_folder::TEXT, workspace->>'folderResourceId', source_report::TEXT, workspace->>'reportResourceId');

  FOR entry IN SELECT value FROM jsonb_array_elements(bundle->'resources') ORDER BY length(value#>>'{data,path}'), value#>>'{data,fullPath}' LOOP
    item := entry->'data';
    IF identity_map ? (item->>'id') THEN CONTINUE; END IF;
    target_path := root_path;
    IF item->>'path' = old_root THEN
      target_path := root_path;
    ELSIF starts_with(item->>'path', old_root || '/') THEN
      target_path := root_path || substr(item->>'path', length(old_root)+1);
    ELSIF item->>'path' <> '' THEN
      target_path := root_path || '/' || (item->>'path');
    END IF;
    CASE item->>'kind'
      WHEN 'folder' THEN created := hall_api.create_folder(target_path,item->>'name');
      WHEN 'text' THEN created := hall_api.create_text_resource(target_path,item->>'name',item->>'content');
      WHEN 'remote' THEN
        IF item#>>'{target,kind}'='url' THEN created := hall_api.create_remote_resource_with_target(target_path,item->>'name',item#>>'{target,url}');
        ELSE created := hall_api.create_remote_resource(target_path,item->>'name'); END IF;
      WHEN 'spreadsheet' THEN created := hall_api.create_spreadsheet_resource(target_path,item->>'name',item->'document');
      WHEN 'geographic' THEN created := hall_api.create_geographic_resource(target_path,item->>'name',item->'document');
      WHEN 'event' THEN created := hall_api.create_event_resource(target_path,item->>'name',item->'document');
      WHEN 'legalReference' THEN created := hall_api.create_legal_reference_resource(target_path,item->>'name',item->'document');
      WHEN 'document' THEN created := hall_api.create_document_resource(target_path,item->>'name',item#>>'{binary,mediaType}',decode(binary_files->>(entry->>'binaryPath'),'base64'));
      -- @implements-requirement HALL-FR-DOC-330
      WHEN 'geographicLayer' THEN
        layer_file := convert_from(decode(binary_files->>(entry->>'binaryPath'),'base64'),'UTF8')::JSONB;
        created := hall_api.create_geographic_layer_resource(target_path,item->>'name',layer_file->'source',layer_file->'features');
      ELSE RAISE EXCEPTION USING ERRCODE='HV609', MESSAGE='Unsupported bundle resource';
    END CASE;
    identity_map := identity_map || jsonb_build_object(item->>'id',created->>'id');
  END LOOP;

  FOR entry IN SELECT value FROM jsonb_array_elements(bundle->'editorAssets') LOOP
    item := entry->'data';
    created := hall_api.create_editor_asset((identity_map#>>ARRAY[item#>>'{owner,id}'])::UUID,item->>'title',item->>'fileName',item->>'mediaType',decode(binary_files->>(entry->>'binaryPath'),'base64'));
    identity_map := identity_map || jsonb_build_object(item->>'id',created->>'id');
  END LOOP;

  FOR entry IN SELECT value FROM jsonb_array_elements(bundle->'resources') LOOP
    item := entry->'data';
    local_id := (identity_map->>(item->>'id'))::UUID;
    IF item->>'kind'='text' THEN
      rewritten := item->>'content';
      FOR pair IN SELECT key,value FROM jsonb_each_text(identity_map) LOOP rewritten := replace(rewritten,pair.key,pair.value); END LOOP;
      SELECT coalesce(array_agg((identity_map->>(value#>>'{data,id}'))::UUID),ARRAY[]::UUID[]) INTO asset_ids
      FROM jsonb_array_elements(bundle->'editorAssets') WHERE value#>>'{data,owner,id}'=item->>'id';
      PERFORM hall_api.update_text_resource(local_id,1,rewritten,asset_ids);
    END IF;
    PERFORM hall_api.update_resource_metadata(local_id,(SELECT path FROM hall.resource WHERE id=local_id),item->>'name',ARRAY(SELECT jsonb_array_elements_text(item->'tags')));
  END LOOP;
  -- @implements-requirement HALL-FR-DOC-330
  FOR entry IN SELECT value FROM jsonb_array_elements(bundle->'resources') WHERE value#>>'{data,kind}'='geographic' LOOP
    FOR overlay IN SELECT value FROM jsonb_array_elements(coalesce(entry#>'{data,overlays}','[]'::JSONB)) ORDER BY (value->>'position')::INTEGER LOOP
      IF NOT identity_map ? (overlay->>'layerId') THEN
        RAISE EXCEPTION USING ERRCODE='HV609', MESSAGE='Bundle map links a layer that the bundle does not carry';
      END IF;
      PERFORM hall_api.set_geographic_map_overlay((identity_map->>(entry#>>'{data,id}'))::UUID,(identity_map->>(overlay->>'layerId'))::UUID,(overlay->>'visible')::BOOLEAN,(overlay->>'opacity')::NUMERIC);
    END LOOP;
  END LOOP;
  FOR entry IN SELECT value FROM jsonb_array_elements(bundle#>'{business,resourceSourceIds}') LOOP
    PERFORM hall_api.associate_council_business_resource(source_business,(identity_map->>(entry#>>'{}'))::UUID);
  END LOOP;
  RETURN workspace;
END
$function$;

-- Explicit removal uses the current constraints; external or shared dependencies
-- are never cascaded away to make removal succeed.
CREATE FUNCTION hall_api.delete_council_business(target_business UUID)
RETURNS JSONB LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, hall AS $function$
DECLARE
  workspace JSONB;
BEGIN
  PERFORM hall.lock_resource_namespace();
  workspace := hall.council_business_workspace_projection(target_business);
  IF workspace IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='HV609', MESSAGE='Council business not found';
  END IF;
  IF EXISTS(SELECT FROM hall.council_business_resource WHERE council_business=target_business) THEN
    RAISE EXCEPTION USING ERRCODE='23503', MESSAGE='Council business has associated resources';
  END IF;
  DELETE FROM hall.council_business_workspace WHERE council_business=target_business;
  DELETE FROM hall.council_business WHERE id=target_business;
  PERFORM hall_api.delete_resource((workspace->>'reportResourceId')::UUID);
  PERFORM hall_api.delete_resource((workspace->>'folderResourceId')::UUID);
  RETURN workspace;
END
$function$;
