-- @technical-requirement HALL-TR-CTX-030 API_ONLY_RUNTIME_ACCESS:
-- @technical-requirement HALL-TR-DOC-060 DOCUMENTARY_WRITES_ARE_NAMED:
-- Runtime roles can discover hall_api and call only explicitly granted
-- functions. They never receive table privileges in hall.
GRANT USAGE ON SCHEMA hall_api TO hall_api_anonymous, hall_api_authenticated, hall_api_worker;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA hall_api FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA hall, hall_meta FROM hall_api_anonymous, hall_api_authenticated, hall_api_worker;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA hall, hall_meta FROM hall_api_anonymous, hall_api_authenticated, hall_api_worker;

GRANT EXECUTE ON FUNCTION hall_api.open_resource(UUID)
  TO hall_api_authenticated, hall_api_worker;
GRANT EXECUTE ON FUNCTION hall_api.open_resource_by_slug(TEXT)
  TO hall_api_authenticated, hall_api_worker;
GRANT EXECUTE ON FUNCTION hall_api.list_resources()
  TO hall_api_authenticated, hall_api_worker;
GRANT EXECUTE ON FUNCTION hall_api.search_resources(TEXT, TEXT[], TEXT[], TEXT[], TEXT[], TEXT[])
  TO hall_api_authenticated, hall_api_worker;
GRANT EXECUTE ON FUNCTION hall_api.list_folder(TEXT)
  TO hall_api_authenticated, hall_api_worker;
GRANT EXECUTE ON FUNCTION hall_api.read_document_content(UUID)
  TO hall_api_authenticated, hall_api_worker;
GRANT EXECUTE ON FUNCTION hall_api.open_editor_asset(UUID)
  TO hall_api_authenticated, hall_api_worker;
GRANT EXECUTE ON FUNCTION hall_api.read_editor_asset_content(UUID)
  TO hall_api_authenticated, hall_api_worker;
GRANT EXECUTE ON FUNCTION hall_api.read_binary_reference_content(UUID)
  TO hall_api_authenticated, hall_api_worker;
GRANT EXECUTE ON FUNCTION hall_api.present_resource(JSONB)
  TO hall_api_authenticated, hall_api_worker;
GRANT EXECUTE ON FUNCTION hall_api.present_resource_collection(JSONB, TEXT, BOOLEAN, BOOLEAN)
  TO hall_api_authenticated, hall_api_worker;
GRANT EXECUTE ON FUNCTION hall_api.present_resource_search(JSONB)
  TO hall_api_authenticated, hall_api_worker;
GRANT EXECUTE ON FUNCTION hall_api.present_editor_asset(JSONB)
  TO hall_api_authenticated, hall_api_worker;

GRANT EXECUTE ON FUNCTION hall_api.create_folder(TEXT, TEXT)
  TO hall_api_authenticated, hall_api_worker;
GRANT EXECUTE ON FUNCTION hall_api.create_text_resource(TEXT, TEXT, TEXT)
  TO hall_api_authenticated, hall_api_worker;
GRANT EXECUTE ON FUNCTION hall_api.create_remote_resource(TEXT, TEXT)
  TO hall_api_authenticated, hall_api_worker;
GRANT EXECUTE ON FUNCTION hall_api.create_remote_resource_with_target(TEXT, TEXT, TEXT)
  TO hall_api_authenticated, hall_api_worker;
GRANT EXECUTE ON FUNCTION hall_api.create_spreadsheet_resource(TEXT, TEXT, JSONB)
  TO hall_api_authenticated, hall_api_worker;
GRANT EXECUTE ON FUNCTION hall_api.create_geographic_resource(TEXT, TEXT, JSONB)
  TO hall_api_authenticated, hall_api_worker;
GRANT EXECUTE ON FUNCTION hall_api.create_legal_reference_resource(TEXT, TEXT, JSONB)
  TO hall_api_authenticated, hall_api_worker;
GRANT EXECUTE ON FUNCTION hall_api.create_document_resource(TEXT, TEXT, TEXT, BYTEA)
  TO hall_api_authenticated, hall_api_worker;
GRANT EXECUTE ON FUNCTION hall_api.create_editor_asset(UUID, TEXT, TEXT, TEXT, BYTEA)
  TO hall_api_authenticated, hall_api_worker;
GRANT EXECUTE ON FUNCTION hall_api.rename_resource(UUID, TEXT)
  TO hall_api_authenticated, hall_api_worker;
GRANT EXECUTE ON FUNCTION hall_api.move_resource(UUID, TEXT)
  TO hall_api_authenticated, hall_api_worker;
GRANT EXECUTE ON FUNCTION hall_api.relocate_resource(UUID, TEXT, TEXT)
  TO hall_api_authenticated, hall_api_worker;
GRANT EXECUTE ON FUNCTION hall_api.open_council_business(UUID)
  TO hall_api_authenticated, hall_api_worker;
GRANT EXECUTE ON FUNCTION hall_api.create_council_business(TEXT, TEXT, TEXT, TEXT)
  TO hall_api_authenticated, hall_api_worker;
GRANT EXECUTE ON FUNCTION hall_api.open_council_agenda_item(UUID)
  TO hall_api_authenticated, hall_api_worker;
GRANT EXECUTE ON FUNCTION hall_api.list_council_agenda(UUID)
  TO hall_api_authenticated, hall_api_worker;
GRANT EXECUTE ON FUNCTION hall_api.schedule_council_decision_proposal(UUID, UUID, INTEGER)
  TO hall_api_authenticated, hall_api_worker;
GRANT EXECUTE ON FUNCTION hall_api.schedule_open_question(UUID, UUID, INTEGER)
  TO hall_api_authenticated, hall_api_worker;
GRANT EXECUTE ON FUNCTION hall_api.schedule_minutes_approval(UUID, UUID, UUID)
  TO hall_api_authenticated, hall_api_worker;
GRANT EXECUTE ON FUNCTION hall_api.deprogram_council_agenda_item(UUID)
  TO hall_api_authenticated, hall_api_worker;
GRANT EXECUTE ON FUNCTION hall_api.reprogram_council_agenda_item(UUID, UUID, INTEGER)
  TO hall_api_authenticated, hall_api_worker;
GRANT EXECUTE ON FUNCTION hall_api.start_council_agenda_item(UUID, TIMESTAMPTZ)
  TO hall_api_authenticated, hall_api_worker;
GRANT EXECUTE ON FUNCTION hall_api.complete_open_question(UUID, TIMESTAMPTZ)
  TO hall_api_authenticated, hall_api_worker;
GRANT EXECUTE ON FUNCTION hall_api.open_council_meeting(UUID)
  TO hall_api_authenticated, hall_api_worker;
GRANT EXECUTE ON FUNCTION hall_api.close_council_meeting(UUID, TIMESTAMPTZ, TEXT, TEXT, TEXT, TEXT)
  TO hall_api_authenticated, hall_api_worker;
GRANT EXECUTE ON FUNCTION hall_api.update_resource_metadata(UUID, TEXT, TEXT, TEXT[])
  TO hall_api_authenticated, hall_api_worker;
GRANT EXECUTE ON FUNCTION hall_api.update_editable_resource_metadata(UUID, TEXT, TEXT, TEXT[], BOOLEAN)
  TO hall_api_authenticated, hall_api_worker;
GRANT EXECUTE ON FUNCTION hall_api.update_text_resource(UUID, INTEGER, TEXT, UUID[])
  TO hall_api_authenticated, hall_api_worker;
GRANT EXECUTE ON FUNCTION hall_api.update_remote_resource_target(UUID, INTEGER, TEXT)
  TO hall_api_authenticated, hall_api_worker;
GRANT EXECUTE ON FUNCTION hall_api.clear_remote_resource_target(UUID, INTEGER)
  TO hall_api_authenticated, hall_api_worker;
GRANT EXECUTE ON FUNCTION hall_api.update_spreadsheet_resource(UUID, INTEGER, JSONB)
  TO hall_api_authenticated, hall_api_worker;
GRANT EXECUTE ON FUNCTION hall_api.update_geographic_resource(UUID, INTEGER, JSONB)
  TO hall_api_authenticated, hall_api_worker;
GRANT EXECUTE ON FUNCTION hall_api.update_legal_reference_resource(UUID, INTEGER, JSONB)
  TO hall_api_authenticated, hall_api_worker;
GRANT EXECUTE ON FUNCTION hall_api.resolve_legal_reference_resource(UUID, INTEGER, TEXT, JSONB)
  TO hall_api_authenticated, hall_api_worker;
GRANT EXECUTE ON FUNCTION hall_api.replace_document_content(UUID, TEXT, BYTEA)
  TO hall_api_authenticated, hall_api_worker;
GRANT EXECUTE ON FUNCTION hall_api.delete_resource(UUID)
  TO hall_api_authenticated, hall_api_worker;
