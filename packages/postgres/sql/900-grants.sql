-- @implements-requirement HALL-TR-CTX-040
-- @implements-requirement HALL-TR-DOC-060
-- Runtime roles can discover hall_api and call only explicitly granted
-- functions. They never receive table privileges in hall.
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA hall_api
  FROM PUBLIC, hall_api_anonymous, hall_api_authenticated, hall_api_worker;
GRANT USAGE ON SCHEMA hall_api TO hall_api_anonymous, hall_api_authenticated, hall_api_worker;
GRANT EXECUTE ON FUNCTION hall_api.schema_fingerprint() TO hall_api_anonymous;
GRANT EXECUTE ON FUNCTION hall_api.call_context()
  TO hall_api_anonymous, hall_api_authenticated, hall_api_worker;
GRANT EXECUTE ON FUNCTION hall_api.record_audit_event(TEXT, TEXT, hall.audit_outcome, JSONB)
  TO hall_api_anonymous, hall_api_authenticated, hall_api_worker;
GRANT EXECUTE ON FUNCTION hall_api.allows(TEXT, JSONB), hall_api.allowed_actions(JSONB)
  TO hall_api_authenticated, hall_api_worker;
GRANT EXECUTE ON FUNCTION hall_api.import_council_business_bundle(JSONB,JSONB,TEXT)
  TO hall_api_authenticated, hall_api_worker;
REVOKE ALL ON FUNCTION hall_api.create_ballot(UUID,TEXT,UUID[],UUID),
 hall_api.record_public_ballot_votes(UUID,UUID[],TEXT[]),
 hall_api.record_secret_ballot_votes(UUID,INTEGER,INTEGER,INTEGER,INTEGER,INTEGER,INTEGER),
 hall_api.complete_ballot(UUID,UUID),
 hall_api.record_public_non_participations(UUID,UUID[],TEXT[])
 FROM hall_api_anonymous,hall_api_authenticated,hall_api_worker;
REVOKE ALL ON ALL TABLES IN SCHEMA hall, hall_meta FROM hall_api_anonymous, hall_api_authenticated, hall_api_worker;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA hall, hall_meta FROM hall_api_anonymous, hall_api_authenticated, hall_api_worker;

GRANT EXECUTE ON FUNCTION hall_api.get_active_council_term()
  TO hall_api_authenticated, hall_api_worker;
GRANT EXECUTE ON FUNCTION hall_api.configure_active_council_term(INTEGER)
  TO hall_api_authenticated, hall_api_worker;
GRANT EXECUTE ON FUNCTION hall_api.list_contacts(BOOLEAN)
  TO hall_api_authenticated, hall_api_worker;
GRANT EXECUTE ON FUNCTION hall_api.open_contact(UUID)
  TO hall_api_authenticated, hall_api_worker;
GRANT EXECUTE ON FUNCTION hall_api.create_contact(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT)
  TO hall_api_authenticated, hall_api_worker;
GRANT EXECUTE ON FUNCTION hall_api.update_contact(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT)
  TO hall_api_authenticated, hall_api_worker;
GRANT EXECUTE ON FUNCTION hall_api.archive_contact(UUID)
  TO hall_api_authenticated, hall_api_worker;
GRANT EXECUTE ON FUNCTION hall_api.list_council_members(BOOLEAN)
  TO hall_api_authenticated, hall_api_worker;
GRANT EXECUTE ON FUNCTION hall_api.open_council_member(UUID)
  TO hall_api_authenticated, hall_api_worker;
GRANT EXECUTE ON FUNCTION hall_api.council_member_creation_available()
  TO hall_api_authenticated, hall_api_worker;
GRANT EXECUTE ON FUNCTION hall_api.create_council_member(UUID, TEXT, DATE, INTEGER)
  TO hall_api_authenticated, hall_api_worker;
GRANT EXECUTE ON FUNCTION hall_api.update_council_member(UUID, TEXT, DATE, DATE, INTEGER, BOOLEAN)
  TO hall_api_authenticated, hall_api_worker;
GRANT EXECUTE ON FUNCTION hall_api.list_council_committees(BOOLEAN)
  TO hall_api_authenticated, hall_api_worker;
GRANT EXECUTE ON FUNCTION hall_api.open_council_committee(UUID)
  TO hall_api_authenticated, hall_api_worker;
GRANT EXECUTE ON FUNCTION hall_api.create_council_committee(TEXT, TEXT)
  TO hall_api_authenticated, hall_api_worker;
GRANT EXECUTE ON FUNCTION hall_api.update_council_committee(UUID, TEXT, TEXT)
  TO hall_api_authenticated, hall_api_worker;
GRANT EXECUTE ON FUNCTION hall_api.archive_council_committee(UUID)
  TO hall_api_authenticated, hall_api_worker;
GRANT EXECUTE ON FUNCTION hall_api.list_committee_memberships(UUID)
  TO hall_api_authenticated, hall_api_worker;
GRANT EXECUTE ON FUNCTION hall_api.open_committee_membership(UUID, UUID)
  TO hall_api_authenticated, hall_api_worker;
GRANT EXECUTE ON FUNCTION hall_api.add_committee_membership(UUID, UUID, TEXT, DATE)
  TO hall_api_authenticated, hall_api_worker;
GRANT EXECUTE ON FUNCTION hall_api.update_committee_membership(UUID, UUID, TEXT, DATE, DATE)
  TO hall_api_authenticated, hall_api_worker;
GRANT EXECUTE ON FUNCTION hall_api.end_committee_membership(UUID, UUID, DATE)
  TO hall_api_authenticated, hall_api_worker;

GRANT EXECUTE ON FUNCTION hall_api.open_resource(UUID)
  TO hall_api_authenticated, hall_api_worker;
GRANT EXECUTE ON FUNCTION hall_api.list_resource_changes(UUID)
  TO hall_api_authenticated;
GRANT EXECUTE ON FUNCTION hall_api.open_resource_by_slug(TEXT)
  TO hall_api_authenticated, hall_api_worker;
GRANT EXECUTE ON FUNCTION hall_api.list_resources()
  TO hall_api_authenticated, hall_api_worker;
GRANT EXECUTE ON FUNCTION hall_api.find_documents_by_hashes(text[])
  TO hall_api_authenticated, hall_api_worker;
GRANT EXECUTE ON FUNCTION hall_api.search_resources(TEXT, TEXT[], TEXT[], TEXT[], TEXT[], TEXT[], INTEGER, INTEGER, TEXT, UUID[], UUID[], UUID[])
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
GRANT EXECUTE ON FUNCTION hall_api.present_resource_collection(JSONB, TEXT, BOOLEAN, BOOLEAN, TEXT)
  TO hall_api_authenticated, hall_api_worker;
GRANT EXECUTE ON FUNCTION hall_api.present_resource_search(JSONB)
  TO hall_api_authenticated, hall_api_worker;
GRANT EXECUTE ON FUNCTION hall_api.present_editor_asset(JSONB)
  TO hall_api_authenticated, hall_api_worker;

GRANT EXECUTE ON FUNCTION hall_api.provision_personal_workspace(UUID)
  TO hall_api_authenticated;
GRANT EXECUTE ON FUNCTION hall_api.current_personal_workspace()
  TO hall_api_authenticated;
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
GRANT EXECUTE ON FUNCTION hall_api.create_event_resource(TEXT, TEXT, JSONB)
  TO hall_api_authenticated, hall_api_worker;
GRANT EXECUTE ON FUNCTION hall_api.create_legal_reference_resource(TEXT, TEXT, JSONB)
  TO hall_api_authenticated, hall_api_worker;
GRANT EXECUTE ON FUNCTION hall_api.create_document_resource(TEXT, TEXT, TEXT, BYTEA)
  TO hall_api_authenticated, hall_api_worker;
-- @implements-requirement HALL-FR-DOC-310
GRANT EXECUTE ON FUNCTION hall_api.create_geographic_layer_resource(TEXT, TEXT, JSONB, JSONB, TEXT[], JSONB)
  TO hall_api_authenticated, hall_api_worker;
GRANT EXECUTE ON FUNCTION hall_api.geographic_layer_features_text(UUID)
  TO hall_api_authenticated, hall_api_worker;
-- @implements-requirement HALL-FR-DOC-390
GRANT EXECUTE ON FUNCTION hall_api.geographic_feature_notes(UUID)
  TO hall_api_authenticated, hall_api_worker;
GRANT EXECUTE ON FUNCTION hall_api.create_geographic_feature_note(UUID, INTEGER)
  TO hall_api_authenticated, hall_api_worker;
-- @implements-requirement HALL-FR-DOC-430
GRANT EXECUTE ON FUNCTION hall_api.geographic_drawn_element_notes(UUID)
  TO hall_api_authenticated, hall_api_worker;
GRANT EXECUTE ON FUNCTION hall_api.create_geographic_drawn_element_note(UUID, TEXT)
  TO hall_api_authenticated, hall_api_worker;
-- @implements-requirement HALL-FR-DOC-400
GRANT EXECUTE ON FUNCTION hall_api.municipal_property()
  TO hall_api_authenticated, hall_api_worker;
GRANT EXECUTE ON FUNCTION hall_api.replace_municipal_property(TEXT, TEXT, TEXT, TEXT[])
  TO hall_api_authenticated, hall_api_worker;
GRANT EXECUTE ON FUNCTION hall_api.present_municipal_property(JSONB)
  TO hall_api_authenticated, hall_api_worker;
GRANT EXECUTE ON FUNCTION hall_api.list_geographic_layer_resources()
  TO hall_api_authenticated, hall_api_worker;
GRANT EXECUTE ON FUNCTION hall_api.geographic_layer_features(UUID)
  TO hall_api_authenticated, hall_api_worker;
GRANT EXECUTE ON FUNCTION hall_api.present_geographic_layer_collection(JSONB)
  TO hall_api_authenticated, hall_api_worker;
GRANT EXECUTE ON FUNCTION hall_api.set_geographic_map_overlay(UUID, UUID, BOOLEAN, NUMERIC)
  TO hall_api_authenticated, hall_api_worker;
GRANT EXECUTE ON FUNCTION hall_api.remove_geographic_map_overlay(UUID, UUID)
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
GRANT EXECUTE ON FUNCTION hall_api.list_council_business()
  TO hall_api_authenticated, hall_api_worker;
GRANT EXECUTE ON FUNCTION hall_api.list_council_business_workspace_items()
  TO hall_api_authenticated, hall_api_worker;
GRANT EXECUTE ON FUNCTION hall_api.list_council_business_resource_items(UUID[])
  TO hall_api_authenticated, hall_api_worker;
GRANT EXECUTE ON FUNCTION hall_api.create_council_business(TEXT, TEXT, TEXT, TEXT)
  TO hall_api_authenticated, hall_api_worker;
GRANT EXECUTE ON FUNCTION hall_api.list_council_business_resources(UUID)
  TO hall_api_authenticated, hall_api_worker;
GRANT EXECUTE ON FUNCTION hall_api.associate_council_business_resource(UUID, UUID)
  TO hall_api_authenticated, hall_api_worker;
GRANT EXECUTE ON FUNCTION hall_api.dissociate_council_business_resource(UUID, UUID)
  TO hall_api_authenticated, hall_api_worker;
GRANT EXECUTE ON FUNCTION hall_api.reorder_council_business_resources(UUID, UUID[])
  TO hall_api_authenticated, hall_api_worker;
GRANT EXECUTE ON FUNCTION hall_api.list_council_business_committees(UUID)
  TO hall_api_authenticated, hall_api_worker;
GRANT EXECUTE ON FUNCTION hall_api.list_council_committee_businesses(UUID)
  TO hall_api_authenticated, hall_api_worker;
GRANT EXECUTE ON FUNCTION hall_api.associate_council_business_committee(UUID, UUID)
  TO hall_api_authenticated, hall_api_worker;
GRANT EXECUTE ON FUNCTION hall_api.dissociate_council_business_committee(UUID, UUID)
  TO hall_api_authenticated, hall_api_worker;
GRANT EXECUTE ON FUNCTION hall_api.open_council_agenda_item(UUID)
  TO hall_api_authenticated, hall_api_worker;
GRANT EXECUTE ON FUNCTION hall_api.list_council_agenda(UUID)
  TO hall_api_authenticated, hall_api_worker;
GRANT EXECUTE ON FUNCTION hall_api.list_council_business_agenda_items(UUID[])
  TO hall_api_authenticated, hall_api_worker;
GRANT EXECUTE ON FUNCTION hall_api.schedule_council_decision_proposal(UUID, UUID, INTEGER)
  TO hall_api_authenticated, hall_api_worker;
GRANT EXECUTE ON FUNCTION hall_api.schedule_open_question(UUID, UUID, INTEGER)
  TO hall_api_authenticated, hall_api_worker;
GRANT EXECUTE ON FUNCTION hall_api.create_and_schedule_council_decision_proposal(TEXT, TEXT, TEXT, TEXT, UUID, INTEGER)
  TO hall_api_authenticated, hall_api_worker;
GRANT EXECUTE ON FUNCTION hall_api.create_and_schedule_open_question(TEXT, TEXT, TEXT, TEXT, UUID, INTEGER)
  TO hall_api_authenticated, hall_api_worker;
GRANT EXECUTE ON FUNCTION hall_api.adjourn_council_agenda_item(UUID, TIMESTAMPTZ)
  TO hall_api_authenticated, hall_api_worker;
GRANT EXECUTE ON FUNCTION hall_api.deprogram_council_agenda_item(UUID)
  TO hall_api_authenticated, hall_api_worker;
GRANT EXECUTE ON FUNCTION hall_api.reprogram_council_agenda_item(UUID, UUID, INTEGER)
  TO hall_api_authenticated, hall_api_worker;
GRANT EXECUTE ON FUNCTION hall_api.reorder_council_agenda(UUID, UUID[])
  TO hall_api_authenticated, hall_api_worker;
GRANT EXECUTE ON FUNCTION hall_api.start_council_agenda_item(UUID, TIMESTAMPTZ)
  TO hall_api_authenticated, hall_api_worker;
GRANT EXECUTE ON FUNCTION hall_api.complete_non_voting_agenda_item(UUID, TIMESTAMPTZ)
  TO hall_api_authenticated, hall_api_worker;
GRANT EXECUTE ON FUNCTION hall_api.open_council_meeting(UUID)
  TO hall_api_authenticated, hall_api_worker;
GRANT EXECUTE ON FUNCTION hall_api.open_council_meeting_by_slug(TEXT)
  TO hall_api_authenticated, hall_api_worker;
GRANT EXECUTE ON FUNCTION hall_api.list_council_meetings()
  TO hall_api_authenticated, hall_api_worker;
GRANT EXECUTE ON FUNCTION hall_api.provision_initial_council_meeting()
  TO hall_api_authenticated, hall_api_worker;
-- TODO REMOVE_STALE: temporary succession action.
GRANT EXECUTE ON FUNCTION hall_api.mark_council_meeting_stale(uuid)
  TO hall_api_authenticated, hall_api_worker;
GRANT EXECUTE ON FUNCTION hall_api.schedule_council_meeting(UUID, TIMESTAMPTZ, TEXT)
  TO hall_api_authenticated, hall_api_worker;
GRANT EXECUTE ON FUNCTION hall_api.set_council_meeting_officers(UUID, UUID, UUID)
  TO hall_api_authenticated, hall_api_worker;
GRANT EXECUTE ON FUNCTION hall_api.prepare_council_meeting(UUID, TIMESTAMPTZ, TEXT, UUID, UUID)
  TO hall_api_authenticated, hall_api_worker;
GRANT EXECUTE ON FUNCTION hall_api.record_meeting_opening(UUID, JSONB, UUID, UUID)
  TO hall_api_authenticated, hall_api_worker;
GRANT EXECUTE ON FUNCTION hall_api.list_meeting_attendance(UUID)
  TO hall_api_authenticated, hall_api_worker;
GRANT EXECUTE ON FUNCTION hall_api.record_meeting_attendance(UUID, JSONB)
  TO hall_api_authenticated, hall_api_worker;
GRANT EXECUTE ON FUNCTION hall_api.open_ballot(UUID)
  TO hall_api_authenticated, hall_api_worker;
GRANT EXECUTE ON FUNCTION hall_api.list_council_meeting_ballots(UUID)
  TO hall_api_authenticated, hall_api_worker;
GRANT EXECUTE ON FUNCTION hall_api.list_ballot_participations(UUID)
  TO hall_api_authenticated, hall_api_worker;
GRANT EXECUTE ON FUNCTION hall_api.list_ballot_votes(UUID)
  TO hall_api_authenticated, hall_api_worker;
GRANT EXECUTE ON FUNCTION hall_api.close_council_meeting(UUID)
  TO hall_api_authenticated, hall_api_worker;
GRANT EXECUTE ON FUNCTION hall_api.list_minutes(), hall_api.open_minutes(UUID), hall_api.minutes_content(UUID),
  hall_api.update_minutes_draft(UUID, INTEGER, UUID, TEXT), hall_api.generate_minutes(UUID, INTEGER, BYTEA),
  hall_api.update_council_agenda_item_notes(UUID, TEXT) TO hall_api_authenticated, hall_api_worker;
GRANT EXECUTE ON FUNCTION hall_api.update_resource_metadata(UUID, TEXT, TEXT, TEXT[])
  TO hall_api_authenticated, hall_api_worker;
GRANT EXECUTE ON FUNCTION hall_api.update_editable_resource_metadata(UUID, TEXT, TEXT, TEXT[], BOOLEAN)
  TO hall_api_authenticated, hall_api_worker;
GRANT EXECUTE ON FUNCTION hall_api.update_text_resource(UUID, INTEGER, TEXT, UUID[], TEXT)
  TO hall_api_authenticated, hall_api_worker;
GRANT EXECUTE ON FUNCTION hall_api.update_remote_resource_target(UUID, INTEGER, TEXT)
  TO hall_api_authenticated, hall_api_worker;
GRANT EXECUTE ON FUNCTION hall_api.clear_remote_resource_target(UUID, INTEGER)
  TO hall_api_authenticated, hall_api_worker;
GRANT EXECUTE ON FUNCTION hall_api.update_spreadsheet_resource(UUID, INTEGER, JSONB)
  TO hall_api_authenticated, hall_api_worker;
GRANT EXECUTE ON FUNCTION hall_api.update_geographic_resource(UUID, INTEGER, JSONB)
  TO hall_api_authenticated, hall_api_worker;
GRANT EXECUTE ON FUNCTION hall_api.update_event_resource(UUID, INTEGER, JSONB)
  TO hall_api_authenticated, hall_api_worker;
GRANT EXECUTE ON FUNCTION hall_api.update_legal_reference_resource(UUID, INTEGER, JSONB)
  TO hall_api_authenticated, hall_api_worker;
GRANT EXECUTE ON FUNCTION hall_api.resolve_legal_reference_resource(UUID, INTEGER, TEXT, JSONB)
  TO hall_api_authenticated, hall_api_worker;
GRANT EXECUTE ON FUNCTION hall_api.replace_document_content(UUID, TEXT, BYTEA)
  TO hall_api_authenticated, hall_api_worker;
GRANT EXECUTE ON FUNCTION hall_api.delete_resource(UUID)
  TO hall_api_authenticated, hall_api_worker;

GRANT EXECUTE ON FUNCTION hall_api.agenda_item_recusals(UUID),
  hall_api.record_agenda_item_recusal(UUID, UUID, TEXT, TIMESTAMPTZ)
  TO hall_api_authenticated, hall_api_worker;

GRANT EXECUTE ON FUNCTION hall_api.list_ballot_non_participations(UUID) TO hall_api_authenticated,hall_api_worker;

GRANT EXECUTE ON FUNCTION hall_api.meeting_conduct(UUID),
 hall_api.record_meeting_attendance_events(UUID,JSONB),
 hall_api.record_meeting_officer_change(UUID,TEXT,UUID),
 hall_api.declare_meeting_auxiliary_attendance(UUID,UUID,TEXT,TEXT,TEXT),
 hall_api.update_meeting_auxiliary_attendance(UUID,UUID,TEXT),
 hall_api.record_meeting_closed_session(UUID,UUID[],INTEGER,BOOLEAN,UUID[]),
 hall_api.remove_meeting_auxiliary_attendance(UUID,UUID),
 hall_api.record_meeting_quorum(UUID,UUID),
 hall_api.record_meeting_reconvocation(UUID,UUID,TIMESTAMPTZ,TIMESTAMPTZ,TEXT,TEXT,TEXT,UUID[])
 TO hall_api_authenticated,hall_api_worker;

GRANT EXECUTE ON FUNCTION hall_api.create_ballot_result_preview(UUID,JSONB),
 hall_api.open_ballot_result_preview(UUID),hall_api.confirm_ballot_result_preview(UUID)
 TO hall_api_authenticated,hall_api_worker;

GRANT EXECUTE ON FUNCTION hall_api.freeze_council_agenda(UUID), hall_api.open_council_agenda_freeze(UUID),
 hall_api.meeting_notice_facts(UUID), hall_api.list_meeting_notices(UUID), hall_api.open_meeting_notice(UUID),
 hall_api.generate_meeting_notice(UUID,JSONB,BYTEA), hall_api.meeting_notice_content(UUID)
 TO hall_api_authenticated,hall_api_worker;

GRANT EXECUTE ON FUNCTION hall_api.reopen_council_agenda(UUID) TO hall_api_authenticated,hall_api_worker;

GRANT EXECUTE ON FUNCTION hall_api.list_prepared_council_subjects(UUID,UUID), hall_api.open_prepared_council_subject(UUID,TEXT),
 hall_api.create_prepared_council_subject(UUID,TEXT,TEXT,TEXT), hall_api.schedule_prepared_council_subject(UUID,UUID,TEXT,INTEGER)
 TO hall_api_authenticated,hall_api_worker;

GRANT EXECUTE ON FUNCTION hall_api.add_open_question(UUID,TEXT,TEXT,TEXT) TO hall_api_authenticated,hall_api_worker;

GRANT EXECUTE ON FUNCTION hall_api.list_council_decisions(),hall_api.open_council_decision(UUID),
 hall_api.update_council_decision_draft(UUID,INTEGER,TEXT),hall_api.freeze_council_decision(UUID,INTEGER,TEXT,DATE,BYTEA),hall_api.council_decision_content(UUID)
 TO hall_api_authenticated,hall_api_worker;

GRANT EXECUTE ON FUNCTION hall_api.meeting_documents(UUID), hall_api.meeting_document_resource(UUID, UUID), hall_api.meeting_document_content(UUID, UUID, UUID) TO hall_api_authenticated, hall_api_worker;

GRANT EXECUTE ON FUNCTION hall_api.delete_council_business(UUID) TO hall_api_authenticated, hall_api_worker;
GRANT EXECUTE ON FUNCTION hall_api.move_prepared_council_subject(UUID, TEXT, UUID, BOOLEAN),
  hall_api.merge_council_business(UUID, UUID, BOOLEAN) TO hall_api_authenticated, hall_api_worker;
GRANT EXECUTE ON FUNCTION hall_api.deletable_council_businesses(UUID[]) TO hall_api_authenticated, hall_api_worker;

GRANT EXECUTE ON FUNCTION hall_api.list_council_delegations(BOOLEAN),
 hall_api.open_council_delegation(UUID),
 hall_api.create_council_delegation(TEXT,TEXT),
 hall_api.update_council_delegation(UUID,TEXT,TEXT),
 hall_api.archive_council_delegation(UUID),
 hall_api.list_delegation_memberships(UUID),
 hall_api.open_delegation_membership(UUID,UUID),
 hall_api.add_delegation_membership(UUID,UUID,TEXT,DATE),
 hall_api.update_delegation_membership(UUID,UUID,TEXT,DATE,DATE),
 hall_api.end_delegation_membership(UUID,UUID,DATE)
 TO hall_api_authenticated,hall_api_worker;

GRANT EXECUTE ON FUNCTION hall_api.authorization_role_options(), hall_api.authorization_configuration(),
 hall_api.save_authorization_role(TEXT, JSONB), hall_api.delete_authorization_role(TEXT, INTEGER) TO hall_api_authenticated;

GRANT EXECUTE ON FUNCTION hall_api.authorization_requires_personal_workspace(TEXT[]) TO hall_api_authenticated;
