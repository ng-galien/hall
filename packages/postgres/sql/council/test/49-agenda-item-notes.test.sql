BEGIN;
SET LOCAL search_path=hall,public;
SET LOCAL hall.actor_id='notes-clerk';
\ir support/helpers.sql
\ir support/quorum.sql
SELECT no_plan();
SELECT pg_temp.quorum_case('notes',3,3);
SELECT test_prepare_notice(test_uuid('notes:meeting'));
SELECT start_council_meeting(test_uuid('notes:meeting'),'2026-01-01 09:00Z');
SELECT start_council_agenda_item(test_uuid('notes:a:agenda-item'),'2026-01-01 09:01Z');

-- @verifies-requirement HALL-FR-MTG-380
-- an empty text replaces recorded notes only with an explicit clear confirmation.
SELECT lives_ok($$SELECT hall_api.update_council_agenda_item_notes(test_uuid('notes:a:agenda-item'),'')$$,'empty notes may be saved over empty notes');
SELECT lives_ok($$SELECT hall_api.update_council_agenda_item_notes(test_uuid('notes:a:agenda-item'),'Le maire présente le projet.')$$,'typed notes are saved');
SELECT throws_ok($$SELECT hall_api.update_council_agenda_item_notes(test_uuid('notes:a:agenda-item'),'')$$,'HV237',NULL,'an empty text without confirmation is refused over recorded notes');
SELECT throws_ok($$SELECT hall_api.update_council_agenda_item_notes(test_uuid('notes:a:agenda-item'),'',false)$$,'HV237',NULL,'an empty text with a refused confirmation is refused over recorded notes');
SELECT throws_ok($$SELECT hall_api.update_council_agenda_item_notes(test_uuid('notes:a:agenda-item'),E'  \n ')$$,'HV237',NULL,'a text of spaces only is refused over recorded notes');
SELECT is((SELECT discussion_summary FROM council_agenda_item WHERE id=test_uuid('notes:a:agenda-item')),'Le maire présente le projet.','a refused clear keeps the recorded notes');
SELECT lives_ok($$SELECT hall_api.update_council_agenda_item_notes(test_uuid('notes:a:agenda-item'),'Notes corrigées.')$$,'a non-empty text replaces notes without confirmation');
SELECT lives_ok($$SELECT hall_api.update_council_agenda_item_notes(test_uuid('notes:a:agenda-item'),'',true)$$,'an empty text with confirmation clears recorded notes');
SELECT is((SELECT discussion_summary FROM council_agenda_item WHERE id=test_uuid('notes:a:agenda-item')),'','a confirmed clear empties the notes');
SELECT throws_ok($$SELECT hall_api.update_council_agenda_item_notes(test_uuid('notes:unknown'),'Texte')$$,'HV904',NULL,'unknown agenda items are reported');

-- @verifies-requirement HALL-FR-BAL-350
-- notes do not change the ballot preview fingerprint; attendance does.
CREATE TEMP TABLE notes_preview AS SELECT hall_api.create_ballot_result_preview(test_uuid('notes:a:agenda-item'),pg_temp.public_candidate('notes',3,2)) payload;
CREATE TEMP TABLE notes_fingerprint AS SELECT hall.ballot_preview_fingerprint(test_uuid('notes:a:agenda-item')) fingerprint;
SELECT hall_api.update_council_agenda_item_notes(test_uuid('notes:a:agenda-item'),'Notes saisies pendant l''aperçu.');
SELECT is(hall.ballot_preview_fingerprint(test_uuid('notes:a:agenda-item')),(SELECT fingerprint FROM notes_fingerprint),'saving notes leaves the preview fingerprint unchanged');
SELECT lives_ok($$SELECT hall_api.confirm_ballot_result_preview((SELECT (payload->>'id')::uuid FROM notes_preview))$$,'a preview confirmed after a notes save is accepted');
SELECT is((SELECT discussion_summary FROM council_agenda_item WHERE id=test_uuid('notes:a:agenda-item')),'Notes saisies pendant l''aperçu.','notes saved during the preview are kept');

SELECT pg_temp.quorum_case('presence',3,3);
SELECT test_prepare_notice(test_uuid('presence:meeting'));
SELECT start_council_meeting(test_uuid('presence:meeting'),'2026-01-01 09:00Z');
SELECT start_council_agenda_item(test_uuid('presence:a:agenda-item'),'2026-01-01 09:01Z');
CREATE TEMP TABLE presence_fingerprint AS SELECT hall.ballot_preview_fingerprint(test_uuid('presence:a:agenda-item')) fingerprint;
INSERT INTO meeting_attendance_event(meeting_attendance,observed_at,status) VALUES(test_uuid('presence:att:3'),'2026-01-01 09:02Z','absent');
SELECT isnt(hall.ballot_preview_fingerprint(test_uuid('presence:a:agenda-item')),(SELECT fingerprint FROM presence_fingerprint),'a departure changes the preview fingerprint');

SELECT pg_temp.quorum_case('recused',4,4);
SELECT test_prepare_notice(test_uuid('recused:meeting'));
SELECT start_council_meeting(test_uuid('recused:meeting'),'2026-01-01 09:00Z');
SELECT start_council_agenda_item(test_uuid('recused:a:agenda-item'),'2026-01-01 09:01Z');
CREATE TEMP TABLE recused_preview AS SELECT hall_api.create_ballot_result_preview(test_uuid('recused:a:agenda-item'),pg_temp.public_candidate('recused',4,3)) payload;
INSERT INTO agenda_item_recusal(agenda_item,council_member,legal_basis,declared_at)
  VALUES(test_uuid('recused:a:agenda-item'),test_uuid('recused:member:4'),'personalInterest','2026-01-01 09:02Z');
SELECT throws_ok($$SELECT hall_api.confirm_ballot_result_preview((SELECT (payload->>'id')::uuid FROM recused_preview))$$,'HV422',NULL,'a recusal after the preview makes it stale');

SELECT pg_temp.quorum_case('proxied',4,4);
SELECT test_prepare_notice(test_uuid('proxied:meeting'));
SELECT start_council_meeting(test_uuid('proxied:meeting'),'2026-01-01 09:00Z');
SELECT start_council_agenda_item(test_uuid('proxied:a:agenda-item'),'2026-01-01 09:01Z');
CREATE TEMP TABLE proxied_preview AS SELECT hall_api.create_ballot_result_preview(test_uuid('proxied:a:agenda-item'),pg_temp.public_candidate('proxied',4,3)) payload;
SELECT test_ensure_document_resource(test_uuid('proxied:document'));
INSERT INTO meeting_attendance_event(meeting_attendance,observed_at,status,proxy_holder,proxy_document)
  VALUES(test_uuid('proxied:att:4'),'2026-01-01 09:02Z','represented',test_uuid('proxied:att:2'),test_uuid('proxied:document'));
SELECT throws_ok($$SELECT hall_api.confirm_ballot_result_preview((SELECT (payload->>'id')::uuid FROM proxied_preview))$$,'HV422',NULL,'a proxy given after the preview makes it stale');

-- @verifies-requirement HALL-FR-MTG-370
-- an agenda item is dated at reception, never before the latest observation of its meeting.
SELECT pg_temp.quorum_case('ahead',3,3);
SELECT test_prepare_notice(test_uuid('ahead:meeting'));
SELECT start_council_meeting(test_uuid('ahead:meeting'),'2026-01-01 09:00Z');
CREATE TEMP TABLE ahead_observation AS SELECT clock_timestamp() + interval '1 hour' AS observed_at;
INSERT INTO meeting_attendance_event(meeting_attendance,observed_at,status)
  VALUES(test_uuid('ahead:att:3'),(SELECT observed_at FROM ahead_observation),'absent');
SELECT lives_ok($$SELECT hall_api.start_council_agenda_item(test_uuid('ahead:a:agenda-item'))$$,'a start is accepted after an observation dated one hour ahead');
SELECT ok((SELECT started_at >= (SELECT observed_at FROM ahead_observation) FROM council_agenda_item WHERE id=test_uuid('ahead:a:agenda-item')),'the start is dated no earlier than the latest observation');
SELECT lives_ok($$SELECT hall_api.adjourn_council_agenda_item(test_uuid('ahead:a:agenda-item'))$$,'an adjournment is accepted after the observation ahead');
SELECT lives_ok($$SELECT hall_api.adjourn_council_agenda_item(test_uuid('ahead:b:agenda-item'))$$,'an unstarted item is adjourned after the observation ahead');
CREATE TEMP TABLE ahead_question AS SELECT hall_api.add_open_question(test_uuid('ahead:meeting'),'seed','Question après le constat','Texte') item;
SELECT lives_ok($$SELECT hall_api.start_council_agenda_item((SELECT (item->>'id')::uuid FROM ahead_question))$$,'an open question starts after the observation ahead');
SELECT lives_ok($$SELECT hall_api.complete_non_voting_agenda_item((SELECT (item->>'id')::uuid FROM ahead_question))$$,'an open question completes after the observation ahead');
SELECT ok((SELECT started_at >= (SELECT observed_at FROM ahead_observation) AND completed_at >= started_at
  FROM council_agenda_item WHERE id=(SELECT (item->>'id')::uuid FROM ahead_question)),'start and completion are dated no earlier than the latest observation');

SELECT * FROM finish();
ROLLBACK;
