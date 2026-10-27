BEGIN;
SET LOCAL search_path=hall,public;
SET LOCAL hall.actor_id='preview-clerk';
\ir support/helpers.sql
\ir support/quorum.sql
SELECT no_plan();
SELECT pg_temp.quorum_case('review',3,3);
SELECT test_prepare_notice(test_uuid('review:meeting'));
SELECT start_council_meeting(test_uuid('review:meeting'),'2026-01-01 09:00Z');
SELECT start_council_agenda_item(test_uuid('review:a:agenda-item'),'2026-01-01 09:01Z');
-- @verifies-requirement HALL-FR-BAL-320
-- @verifies-requirement HALL-TR-CON-200
-- preview is reversible entry, confirmation is atomic.
CREATE TEMP TABLE previews(payload JSONB);
INSERT INTO previews SELECT hall_api.create_ballot_result_preview(test_uuid('review:a:agenda-item'),pg_temp.public_candidate('review',3,1));
SELECT is((SELECT payload->'calculation'->>'result' FROM previews),'reject','server calculates the first candidate');
SELECT is((SELECT count(*)::int FROM ballots),0,'preview creates no ballot');
SELECT is((SELECT count(*)::int FROM votes),0,'preview stores no definitive vote');
SELECT ok((SELECT completed_at IS NULL FROM council_agenda_item WHERE id=test_uuid('review:a:agenda-item')),'preview leaves the affair open');
INSERT INTO previews SELECT hall_api.create_ballot_result_preview(test_uuid('review:a:agenda-item'),pg_temp.public_candidate('review',3,2));
SELECT is((SELECT payload->'calculation'->>'result' FROM previews WHERE payload->>'revision'='2'),'approve','a corrected candidate is recalculated');
SELECT throws_ok($$SELECT hall_api.confirm_ballot_result_preview((SELECT (payload->>'id')::uuid FROM previews WHERE payload->>'revision'='1'))$$,'HV422',NULL,'a corrected preview makes the earlier review stale');
SELECT is((SELECT count(*)::int FROM ballots),0,'stale confirmation creates no partial ballot');
SELECT lives_ok($$SELECT hall_api.confirm_ballot_result_preview((SELECT (payload->>'id')::uuid FROM previews WHERE payload->>'revision'='2'))$$,'explicit confirmation stores the reviewed result');
SELECT is((SELECT result::text FROM ballots),'approve','confirmed result matches the review');
SELECT is((SELECT count(*)::int FROM votes),3,'confirmed public votes are stored once');
SELECT ok((SELECT completed_at IS NOT NULL FROM council_agenda_item WHERE id=test_uuid('review:a:agenda-item')),'confirmation completes the affair atomically');
SELECT throws_ok($$SELECT hall_api.confirm_ballot_result_preview((SELECT (payload->>'id')::uuid FROM previews WHERE payload->>'revision'='2'))$$,'HV418',NULL,'duplicate confirmation is refused');
SELECT throws_ok($$UPDATE ballot_result_preview SET calculation='{}'$$,'HV425',NULL,'a review cannot be rewritten');
SELECT throws_ok($$SELECT hall_api.create_ballot_result_preview(test_uuid('review:b:agenda-item'),pg_temp.public_candidate('review',3,2))$$,'HV404',NULL,'an unstarted affair cannot be reviewed');

SELECT ok((SELECT completed_at>=now() FROM ballots WHERE council_agenda_item=test_uuid('review:a:agenda-item')),'an undated confirmation takes the server time');

-- @verifies-requirement HALL-FR-BAL-320
-- a dated confirmation lies between the start of the affair and the server time.
SELECT pg_temp.quorum_case('dated',3,3);
SELECT test_prepare_notice(test_uuid('dated:meeting'));
SELECT start_council_meeting(test_uuid('dated:meeting'),'2026-01-01 09:00Z');
SELECT start_council_agenda_item(test_uuid('dated:a:agenda-item'),'2026-01-01 09:01Z');
CREATE TEMP TABLE dated_preview AS SELECT hall_api.create_ballot_result_preview(test_uuid('dated:a:agenda-item'),pg_temp.public_candidate('dated',3,2)) payload;
SELECT throws_ok($$SELECT hall_api.confirm_ballot_result_preview((SELECT (payload->>'id')::uuid FROM dated_preview),'2026-01-01 09:00Z')$$,'HV417',NULL,'a confirmation cannot be dated before the affair started');
SELECT throws_ok($$SELECT hall_api.confirm_ballot_result_preview((SELECT (payload->>'id')::uuid FROM dated_preview),clock_timestamp()+interval '1 hour')$$,'HV143',NULL,'a confirmation cannot be dated in the future');
SELECT is((SELECT count(*)::int FROM ballots WHERE council_agenda_item=test_uuid('dated:a:agenda-item')),0,'a refused date stores no ballot');
SELECT lives_ok($$SELECT hall_api.confirm_ballot_result_preview((SELECT (payload->>'id')::uuid FROM dated_preview),'2026-01-01 10:15Z')$$,'a confirmation dated within the meeting is accepted');
SELECT is((SELECT completed_at FROM ballots WHERE council_agenda_item=test_uuid('dated:a:agenda-item')),'2026-01-01 10:15Z'::timestamptz,'the ballot ends at the confirmed time');
SELECT is((SELECT completed_at FROM council_agenda_item WHERE id=test_uuid('dated:a:agenda-item')),'2026-01-01 10:15Z'::timestamptz,'the affair ends at the confirmed time');

-- @verifies-requirement HALL-TR-CON-220

-- context mutations invalidate review; concurrent lock barrier also tested in PostgreSQL integration.
SELECT pg_temp.quorum_case('context',3,3);
SELECT test_prepare_notice(test_uuid('context:meeting'));
SELECT start_council_meeting(test_uuid('context:meeting'),'2026-01-01 09:00Z');
SELECT start_council_agenda_item(test_uuid('context:a:agenda-item'),'2026-01-01 09:01Z');
CREATE TEMP TABLE context_preview AS SELECT hall_api.create_ballot_result_preview(test_uuid('context:a:agenda-item'),pg_temp.public_candidate('context',3,2)) payload;
INSERT INTO meeting_attendance_event(meeting_attendance,observed_at,status) VALUES(test_uuid('context:att:3'),'2026-01-01 09:02Z','absent');
SELECT throws_ok($$SELECT hall_api.confirm_ballot_result_preview((SELECT (payload->>'id')::uuid FROM context_preview))$$,'HV422',NULL,'a departure invalidates the reviewed context');
SELECT is((SELECT count(*)::int FROM ballots WHERE council_agenda_item=test_uuid('context:a:agenda-item')),0,'context failure stores neither ballot nor votes');
SELECT throws_ok($$SELECT hall_api.create_ballot_result_preview(test_uuid('context:a:agenda-item'),pg_temp.public_candidate('context',3,2))$$,'HV305',NULL,'a new candidate must use current eligible participants');
SELECT throws_ok($$SELECT hall_api.create_ballot_result_preview(test_uuid('context:a:agenda-item'),jsonb_set(pg_temp.public_candidate('context',2,1),'{procedure}','"cfu"'))$$,'HV416',NULL,'special procedures are outside the ordinary-majority engine');

-- @verifies-requirement HALL-FR-VOT-100

-- anonymous accounting distinguishes non-participation from abstention.

-- A recorded departure is accounted for explicitly without authorizing a new vote.
SELECT throws_ok($$SELECT hall_api.create_ballot_result_preview(test_uuid('context:a:agenda-item'),
 (pg_temp.public_candidate('context',2)-'votes'-'nonParticipations')||jsonb_build_object('votes',jsonb_build_array(jsonb_build_object('meetingAttendanceId',test_uuid('context:att:1'),'choice','approve')),
 'nonParticipations',jsonb_build_array(jsonb_build_object('meetingAttendanceId',test_uuid('context:att:2'),'reason','departed'))))$$,'HV420',NULL,'a present member cannot be falsely described as departed');
CREATE TEMP TABLE departed_preview AS SELECT hall_api.create_ballot_result_preview(test_uuid('context:a:agenda-item'),
 jsonb_set(pg_temp.public_candidate('context',3,2),'{votes}',(SELECT jsonb_agg(v) FROM jsonb_array_elements(pg_temp.public_candidate('context',3,2)->'votes') v WHERE v->>'meetingAttendanceId'<>test_uuid('context:att:3')::text))
 ||jsonb_build_object('nonParticipations',jsonb_build_array(jsonb_build_object('meetingAttendanceId',test_uuid('context:att:3'),'reason','departed')))) payload;
SELECT lives_ok($$SELECT hall_api.confirm_ballot_result_preview((SELECT(payload->>'id')::uuid FROM departed_preview))$$,'recorded departure is confirmed as non-participation with no expressed choice');
SELECT is((SELECT count(*)::int FROM votes v JOIN ballot_participation p ON p.id=v.ballot_participation WHERE p.meeting_attendance=test_uuid('context:att:3')),0,'departed member has no individual vote');
SELECT is((SELECT n.reason FROM ballot_non_participation n JOIN ballot_participation p ON p.id=n.ballot_participation WHERE p.meeting_attendance=test_uuid('context:att:3')),'departed','actual departure survives confirmation');
SELECT pg_temp.quorum_case('secret',6,6);
SELECT test_prepare_notice(test_uuid('secret:meeting'));
SELECT start_council_meeting(test_uuid('secret:meeting'),'2026-01-01 09:00Z');
SELECT start_council_agenda_item(test_uuid('secret:a:agenda-item'),'2026-01-01 09:01Z');
CREATE TEMP TABLE secret_preview AS SELECT hall_api.create_ballot_result_preview(test_uuid('secret:a:agenda-item'),
 (pg_temp.public_candidate('secret',6)-'votes'-'nonParticipations')||jsonb_build_object('mode','secret','totals',
 jsonb_build_object('approve',1,'reject',1,'abstain',1,'blank',1,'invalid',1,'nonParticipation',1))) payload;
SELECT is((SELECT payload->'calculation'->>'result' FROM secret_preview),'reject','secret tie has no chairman casting vote');
SELECT is((SELECT payload->'calculation'->>'expressedCount' FROM secret_preview),'2','abstention blank invalid and non-participation are not expressed votes');
SELECT lives_ok($$SELECT hall_api.confirm_ballot_result_preview((SELECT (payload->>'id')::uuid FROM secret_preview))$$,'anonymous totals confirm successfully');
SELECT ok(NOT EXISTS(SELECT FROM votes WHERE mode='secret' AND ballot_participation IS NOT NULL),'secret choices have no participant identity');
SELECT is((SELECT sum(count)::int FROM ballot_non_participation WHERE mode='secret'),1,'secret non-participation is preserved independently');
SELECT is(ordinary_majority_result('public',0,0,NULL)::text,'reject','zero expressed votes cannot adopt');
SELECT is(ordinary_majority_result('public',1,1,'approve')::text,'approve','present public chairman breaks equal votes');
SELECT is(ordinary_majority_result('public',1,1,NULL)::text,'reject','non-participating chairman supplies no casting vote');
SELECT throws_ok($$SELECT normalize_ballot_candidate(jsonb_set(pg_temp.public_candidate('context',2),'{votes,0,choice}','"blank"'))$$,'HV420',NULL,'a public vote cannot disguise a blank ballot');
SELECT throws_ok($$SELECT hall_api.confirm_ballot_result_preview(test_uuid('unknown-preview'))$$,'HV421',NULL,'unknown preview has an explicit error');
SELECT test_prepare_open_ballot('raw-review','public',2);
INSERT INTO votes(ballot,mode,choice,ballot_participation,count) VALUES(test_uuid('raw-review:ballot'),'public','approve',test_uuid('raw-review:participation:1'),1);
INSERT INTO ballot_non_participation(ballot,mode,ballot_participation,count,reason) VALUES(test_uuid('raw-review:ballot'),'public',test_uuid('raw-review:participation:2'),1,'declined');
SELECT throws_ok($$INSERT INTO votes(ballot,mode,choice,ballot_participation,count) VALUES(test_uuid('raw-review:ballot'),'public','approve',test_uuid('raw-review:participation:2'),1)$$,'HV512',NULL,'a declared nonparticipant cannot also express a vote');
SELECT throws_ok($$UPDATE ballot_non_participation SET reason='departed'$$,'HV510',NULL,'a definitive nonparticipation cannot be rewritten');
SELECT throws_ok($$SELECT complete_ballot(test_uuid('raw-review:ballot'),'2026-01-01 09:00Z',NULL)$$,'HV417',NULL,'completion cannot predate discussion');
SELECT throws_ok($$SELECT complete_ballot(test_uuid('raw-review:ballot'),'2026-01-01 09:30Z',NULL)$$,'HV423',NULL,'direct completion cannot bypass explicit review');
CREATE TEMP TABLE mismatch_preview AS SELECT hall_api.create_ballot_result_preview(test_uuid('raw-review:agenda-item'),jsonb_set(ballot_candidate_from_rows(test_uuid('raw-review:ballot')),'{votes,0,choice}','"reject"')) payload;
SELECT throws_ok($$SELECT complete_ballot(test_uuid('raw-review:ballot'),'2026-01-01 09:30Z',(SELECT(payload->>'id')::uuid FROM mismatch_preview))$$,'HV424',NULL,'recorded immutable facts must exactly match the reviewed candidate');
INSERT INTO meeting_attendance_event(meeting_attendance,observed_at,status) VALUES(test_uuid('raw-review:attendance:2'),'2026-01-01 09:06Z','absent');
SELECT throws_ok($$INSERT INTO votes(ballot,mode,choice,ballot_participation,count) VALUES(test_uuid('raw-review:ballot'),'public','approve',test_uuid('raw-review:participation:1'),1)$$,'23505',NULL,'already expressed vote remains immutable after another member departs');
SELECT test_prepare_open_ballot('departed-voter','public',2);
INSERT INTO meeting_attendance_event(meeting_attendance,observed_at,status) VALUES(test_uuid('departed-voter:attendance:2'),'2026-01-01 09:06Z','absent');
SELECT throws_ok($$INSERT INTO votes(ballot,mode,choice,ballot_participation,count) VALUES(test_uuid('departed-voter:ballot'),'public','approve',test_uuid('departed-voter:participation:2'),1)$$,'HV513',NULL,'a member already departed cannot newly express a vote');
SELECT throws_ok($$INSERT INTO ballot_non_participation(ballot,mode,count) SELECT id,'secret',1 FROM ballots WHERE council_agenda_item=test_uuid('secret:a:agenda-item')$$,'HV511',NULL,'a confirmed secret ballot accepts no extra accounting');
SELECT test_prepare_open_ballot('bad-secret','secret',1);
SELECT throws_ok($$SELECT record_secret_ballot_votes(test_uuid('bad-secret:ballot'),1,0,0,-1,0,0)$$,'HV514',NULL,'secret count input rejects negative blank total');
SELECT pg_temp.quorum_case('no-discussion-quorum',1,1);
SELECT test_prepare_notice(test_uuid('no-discussion-quorum:meeting'));
SELECT start_council_meeting(test_uuid('no-discussion-quorum:meeting'),'2026-01-01 09:00Z');
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE council_agenda_item DISABLE TRIGGER council_agenda_item_quorum;
UPDATE council_agenda_item SET started_at='2026-01-01 09:01Z' WHERE id=test_uuid('no-discussion-quorum:a:agenda-item');
ALTER TABLE council_agenda_item ENABLE TRIGGER council_agenda_item_quorum;
SET CONSTRAINTS ALL DEFERRED;
SELECT throws_ok($$SELECT create_ballot(test_uuid('no-discussion-quorum:a:agenda-item'),'public',ARRAY[test_uuid('no-discussion-quorum:att:1')],test_uuid('no-discussion-quorum:att:1'))$$,'HV414',NULL,'an imported incomplete affair cannot bypass its discussion observation');

SELECT * FROM finish();
ROLLBACK;
