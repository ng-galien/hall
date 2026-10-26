BEGIN;
SET LOCAL search_path=hall,public;
SET LOCAL hall.actor_id='officers-clerk';
\ir support/helpers.sql
SELECT no_plan();

-- Officer handover form and ballot chair, per the user decisions of
-- 26 October 2026 (points A to D and G) and CGCT L2121-14, L2122-17,
-- L2121-15, L2121-20 and L2131-11.

-- One meeting of ten: member 1 mayor and chair, members 2 and 3 deputies in
-- this order of nominations, member 4 councillor and secretary, members 5 to
-- 10 councillors; member 6 is represented by member 5.
CREATE FUNCTION pg_temp.officers_meeting(v_label TEXT,v_items INTEGER,v_ranked BOOLEAN DEFAULT TRUE)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE k INTEGER; v_meeting UUID:=test_uuid(v_label||':meeting'); v_base INTEGER;
BEGIN
 UPDATE council_meetings SET stale=TRUE WHERE closed_at IS NULL AND NOT stale;
 INSERT INTO council_meetings(id,number,scheduled_at,location)
 VALUES(v_meeting,(SELECT coalesce(max(number),0)+1 FROM council_meetings),'2026-01-01 09:00Z','Chamber');
 FOR k IN 1..10 LOOP
  INSERT INTO meeting_attendance(id,council_member,council_meeting,status,proxy_holder,proxy_document)
  VALUES(test_uuid(v_label||':att:'||k),test_uuid(v_label||':member:'||k),v_meeting,
   CASE WHEN k=6 THEN 'represented' ELSE 'present' END::meeting_attendance_status,
   CASE WHEN k=6 THEN test_uuid(v_label||':att:5') END,CASE WHEN k=6 THEN test_uuid(v_label||':proxy:6') END);
 END LOOP;
 SELECT coalesce(max(rank),0)+10 INTO v_base FROM council_member;
 UPDATE council_member SET role='mayor',rank=CASE WHEN v_ranked THEN v_base END WHERE id=test_uuid(v_label||':member:1');
 UPDATE council_member SET role='deputyMayor',rank=CASE WHEN v_ranked THEN v_base+1 END WHERE id=test_uuid(v_label||':member:2');
 UPDATE council_member SET role='deputyMayor',rank=CASE WHEN v_ranked THEN v_base+2 END WHERE id=test_uuid(v_label||':member:3');
 PERFORM test_confirm_declared_membership(v_meeting);
 PERFORM set_council_meeting_officers(v_meeting,test_uuid(v_label||':member:1'),test_uuid(v_label||':member:4'));
 FOR k IN 1..v_items LOOP
  PERFORM test_create_decision_agenda_item(v_label||':'||k,v_meeting,k);
 END LOOP;
 PERFORM test_prepare_notice(v_meeting);
 PERFORM start_council_meeting(v_meeting,'2026-01-01 09:00Z');
 SET CONSTRAINTS ALL IMMEDIATE;
 SET CONSTRAINTS ALL DEFERRED;
END $$;
CREATE FUNCTION pg_temp.item(v_label TEXT,v_number INTEGER)
RETURNS UUID LANGUAGE sql IMMUTABLE AS $$ SELECT test_uuid(v_label||':'||v_number||':agenda-item'); $$;
CREATE FUNCTION pg_temp.att(v_label TEXT,v_number INTEGER)
RETURNS UUID LANGUAGE sql IMMUTABLE AS $$ SELECT test_uuid(v_label||':att:'||v_number); $$;
CREATE FUNCTION pg_temp.member(v_label TEXT,v_number INTEGER)
RETURNS UUID LANGUAGE sql IMMUTABLE AS $$ SELECT test_uuid(v_label||':member:'||v_number); $$;
CREATE FUNCTION pg_temp.candidate(v_ids UUID[],v_choices TEXT[])
RETURNS JSONB LANGUAGE sql IMMUTABLE AS $$
 SELECT jsonb_build_object('procedure','ordinaryMajority','mode','public','participantAttendanceIds',to_jsonb(v_ids),
  'votes',coalesce((SELECT jsonb_agg(jsonb_build_object('meetingAttendanceId',v_ids[k],'choice',v_choices[k]) ORDER BY k)
    FROM generate_subscripts(v_ids,1) k WHERE v_choices[k] IN ('approve','reject','abstain')),'[]'::jsonb),
  'nonParticipations',coalesce((SELECT jsonb_agg(jsonb_build_object('meetingAttendanceId',v_ids[k],'reason',v_choices[k]) ORDER BY k)
    FROM generate_subscripts(v_ids,1) k WHERE v_choices[k] IN ('declined','departed')),'[]'::jsonb));
$$;
CREATE FUNCTION pg_temp.depart(v_label TEXT,v_number INTEGER,v_at TIMESTAMPTZ)
RETURNS VOID LANGUAGE sql AS $$
 INSERT INTO meeting_attendance_event(meeting_attendance,observed_at,status) VALUES(pg_temp.att(v_label,v_number),v_at,'absent');
$$;
CREATE FUNCTION pg_temp.chair_options(v_label TEXT)
RETURNS JSONB LANGUAGE sql AS $$
 SELECT coalesce(jsonb_agg(option ORDER BY option->>'basis',option->>'councilMemberId'),'[]'::jsonb)
 FROM jsonb_array_elements(hall_api.meeting_conduct(test_uuid(v_label||':meeting'))#>'{officerHandoverOptions,chair}') option;
$$;

-- 1. The handover form accepts every present member and proposes the first
-- present deputy by rank.
-- @verifies-requirement HALL-FR-MTG-330
SELECT pg_temp.officers_meeting('order',1);
SELECT throws_ok($$SELECT hall.record_meeting_officer_change(test_uuid('order:meeting'),'chair',pg_temp.member('order',2),'2026-01-01 08:59Z')$$,
 'HV133',NULL,'a handover cannot precede the opening');
SELECT pg_temp.depart('order',1,'2026-01-01 09:01Z');
SELECT is(pg_temp.chair_options('order'),
 (SELECT jsonb_agg(option ORDER BY option->>'basis',option->>'councilMemberId') FROM (
   SELECT jsonb_build_object('councilMemberId',pg_temp.member('order',2),'basis','deputyInNominationOrder') option
   UNION ALL SELECT jsonb_build_object('councilMemberId',pg_temp.member('order',k),'basis','councilDesignation')
   FROM unnest(ARRAY[3,4,5,7,8,9,10]) k) options),
 'with the mayor gone, every present member can be assigned and the first deputy carries the default proposal');
SELECT is(hall_api.meeting_conduct(test_uuid('order:meeting'))#>>'{officerHandoverOptions,proposedChairMemberId}',
 pg_temp.member('order',2)::text,'the form proposes the first present deputy by rank');
SELECT throws_ok($$SELECT hall_api.record_meeting_officer_change(test_uuid('order:meeting'),'chair',pg_temp.member('order',6),'2026-01-01 09:02Z')$$,
 'HV127',NULL,'a represented member cannot be assigned the chair');
SELECT throws_ok($$SELECT hall_api.record_meeting_officer_change(test_uuid('order:meeting'),'chair',pg_temp.member('order',2),'2026-01-01 09:00:30Z')$$,
 'HV133',NULL,'a handover cannot precede a recorded attendance movement');
SELECT throws_ok($$SELECT hall_api.record_meeting_officer_change(test_uuid('order:meeting'),'treasurer',pg_temp.member('order',2),'2026-01-01 09:02Z')$$,
 'HV127',NULL,'only the chair and the secretary are meeting offices');
SELECT lives_ok($$SELECT hall_api.record_meeting_officer_change(test_uuid('order:meeting'),'chair',pg_temp.member('order',3),'2026-01-01 09:02Z')$$,
 'the secretariat may assign another present member than the proposed deputy');
SELECT is(current_meeting_officer(test_uuid('order:meeting'),'chair'),pg_temp.member('order',3),'the assigned member is the chair in office');
INSERT INTO meeting_attendance_event(meeting_attendance,observed_at,status) VALUES(pg_temp.att('order',1),'2026-01-01 09:04Z','present');
SELECT ok(pg_temp.chair_options('order') @> jsonb_build_array(jsonb_build_object('councilMemberId',pg_temp.member('order',1),'basis','mayor')),
 'the returning mayor can resume the chair through the same form');
SELECT lives_ok($$SELECT hall_api.record_meeting_officer_change(test_uuid('order:meeting'),'chair',pg_temp.member('order',1),'2026-01-01 09:05Z')$$,
 'the mayor resumes the chair');
SELECT is((SELECT jsonb_agg(jsonb_build_object('member',council_member,'basis',basis,'name',member_name) ORDER BY observed_at)
 FROM meeting_officer_change WHERE council_meeting=test_uuid('order:meeting')),
 jsonb_build_array(jsonb_build_object('member',pg_temp.member('order',3),'basis','councilDesignation','name','Test '||pg_temp.member('order',3)),
  jsonb_build_object('member',pg_temp.member('order',1),'basis','mayor','name','Test '||pg_temp.member('order',1))),
 'each handover keeps its basis and the copied name of the member');
SELECT is(jsonb_array_length(meeting_conduct_evidence(test_uuid('order:meeting'))->'officerChanges'),2,
 'handovers are part of the meeting conduct evidence carried to the minutes');
SELECT throws_ok($$UPDATE meeting_officer_change SET basis='councilDesignation' WHERE council_meeting=test_uuid('order:meeting')$$,
 'HV127',NULL,'a handover is immutable');
SELECT throws_ok($$DELETE FROM meeting_officer_change WHERE council_meeting=test_uuid('order:meeting')$$,
 'HV127',NULL,'a handover cannot be deleted');
SELECT throws_ok($$INSERT INTO meeting_officer_change(council_meeting,office,basis,council_member,observed_at)
 VALUES(test_uuid('order:meeting'),'secretary','councilNomination',pg_temp.member('order',4),'2026-01-01 09:06Z')$$,
 'HV127',NULL,'the secretary in office cannot be nominated again');

-- Unknown ranks: Hall proposes no deputy and accepts each of them.
SELECT pg_temp.officers_meeting('unranked',1,FALSE);
SELECT pg_temp.depart('unranked',1,'2026-01-01 09:01Z');
SELECT is(hall_api.meeting_conduct(test_uuid('unranked:meeting'))#>'{officerHandoverOptions,proposedChairMemberId}','null'::jsonb,
 'without known ranks the form proposes no deputy');

-- 2. Secretary replacement in the same form, among present members.
-- @verifies-requirement HALL-FR-MTG-340
SELECT pg_temp.depart('unranked',4,'2026-01-01 09:02Z');
SELECT is((SELECT jsonb_agg(option->>'councilMemberId' ORDER BY option->>'councilMemberId')
 FROM jsonb_array_elements(hall_api.meeting_conduct(test_uuid('unranked:meeting'))#>'{officerHandoverOptions,secretary}') option),
 (SELECT jsonb_agg(id ORDER BY id::text) FROM unnest(ARRAY[pg_temp.member('unranked',2),pg_temp.member('unranked',3),pg_temp.member('unranked',5),pg_temp.member('unranked',7),pg_temp.member('unranked',8),pg_temp.member('unranked',9),pg_temp.member('unranked',10)]) id),
 'every present member other than the secretary in office can be nominated secretary');
SELECT throws_ok($$SELECT hall_api.record_meeting_officer_change(test_uuid('unranked:meeting'),'secretary',pg_temp.member('unranked',6),'2026-01-01 09:03Z')$$,
 'HV127',NULL,'a represented member cannot be nominated secretary');
SELECT lives_ok($$SELECT hall_api.record_meeting_officer_change(test_uuid('unranked:meeting'),'secretary',pg_temp.member('unranked',5),'2026-01-01 09:03Z')$$,
 'the council nominates a present member as secretary');
SELECT is(hall_api.meeting_conduct(test_uuid('unranked:meeting'))->'currentOfficers',
 jsonb_build_object('chairMemberId',pg_temp.member('unranked',1),'secretaryMemberId',pg_temp.member('unranked',5)),
 'the nominated member is the secretary in office');

-- 3. A recused chair blocks the ballot until a chair is assigned.
-- @verifies-requirement HALL-FR-BAL-140
-- @verifies-requirement HALL-FR-BAL-340
-- @verifies-requirement HALL-FR-MTG-330
SELECT pg_temp.officers_meeting('recused-chair',2);
INSERT INTO agenda_item_recusal(agenda_item,council_member,legal_basis,declared_at)
VALUES(pg_temp.item('recused-chair',1),pg_temp.member('recused-chair',1),'personalInterest','2026-01-01 09:00:10Z'),
 (pg_temp.item('recused-chair',1),pg_temp.member('recused-chair',2),'personalInterest','2026-01-01 09:00:10Z');
SELECT start_council_agenda_item(pg_temp.item('recused-chair',1),'2026-01-01 09:01Z');
SELECT is(agenda_item_ballot_chair(pg_temp.item('recused-chair',1)),
 jsonb_build_object('councilMemberId',pg_temp.member('recused-chair',1),'meetingAttendanceId',pg_temp.att('recused-chair',1),
  'physicallyPresent',true,'recused',true),
 'the ballot chair stays the chair in office, shown as recused; Hall does not replace him');
SELECT is(agenda_item_ballot_officer_blockers(pg_temp.item('recused-chair',1)),
 jsonb_build_array(jsonb_build_object('code','ballotChairRecused','councilMemberId',pg_temp.member('recused-chair',1))),
 'a recused chair blocks the ballot');
SELECT ok((SELECT council_agenda_item_capabilities(item)#>'{conductBlockers,reviewBallot}' FROM council_agenda_item item
 WHERE id=pg_temp.item('recused-chair',1)) @> '[{"code":"ballotChairRecused"}]',
 'the conduct screen receives the recused chair as a ballot review blocker');
SELECT throws_ok($$SELECT hall_api.create_ballot_result_preview(pg_temp.item('recused-chair',1),
 pg_temp.candidate(ARRAY[pg_temp.att('recused-chair',3),pg_temp.att('recused-chair',4)],ARRAY['approve','reject']))$$,
 'HV415',NULL,'no ballot until a chair is assigned');
SELECT ok(NOT pg_temp.chair_options('recused-chair') @> jsonb_build_array(jsonb_build_object('councilMemberId',pg_temp.member('recused-chair',2))),
 'a member recused on the item in discussion is not offered');
SELECT is(hall_api.meeting_conduct(test_uuid('recused-chair:meeting'))#>>'{officerHandoverOptions,proposedChairMemberId}',
 pg_temp.member('recused-chair',3)::text,'the form proposes the first present deputy who is not recused');
SELECT throws_ok($$SELECT hall_api.record_meeting_officer_change(test_uuid('recused-chair:meeting'),'chair',pg_temp.member('recused-chair',2),'2026-01-01 09:01:30Z')$$,
 'HV127',NULL,'a member recused on the item in discussion cannot be assigned the chair');
SELECT lives_ok($$SELECT hall_api.record_meeting_officer_change(test_uuid('recused-chair:meeting'),'chair',pg_temp.member('recused-chair',3),'2026-01-01 09:01:30Z')$$,
 'the secretariat assigns the proposed deputy for the next vote');
SELECT pg_temp.depart('recused-chair',1,'2026-01-01 09:02Z');
SELECT lives_ok($$SELECT hall_api.confirm_ballot_result_preview((hall_api.create_ballot_result_preview(pg_temp.item('recused-chair',1),
 pg_temp.candidate(ARRAY[pg_temp.att('recused-chair',3),pg_temp.att('recused-chair',4),pg_temp.att('recused-chair',5),pg_temp.att('recused-chair',7)],
 ARRAY['approve','reject','approve','reject']))->>'id')::uuid)$$,
 'the ballot proceeds with the assigned chair');
SET CONSTRAINTS ALL IMMEDIATE;
SET CONSTRAINTS ALL DEFERRED;
SELECT is((SELECT jsonb_build_object('chair',p.meeting_attendance,'result',b.result) FROM ballots b JOIN ballot_participation p ON p.id=b.chairman
 WHERE b.council_agenda_item=pg_temp.item('recused-chair',1)),
 jsonb_build_object('chair',pg_temp.att('recused-chair',3),'result','approve'),
 'the assigned chair presides and his voice prevails on a tie');
INSERT INTO meeting_attendance_event(meeting_attendance,observed_at,status) VALUES(pg_temp.att('recused-chair',1),clock_timestamp(),'present');
SELECT is(agenda_item_ballot_chair(pg_temp.item('recused-chair',2))->>'councilMemberId',pg_temp.member('recused-chair',3)::text,
 'the assigned chair stays in office until the next handover');
SELECT lives_ok($$SELECT hall_api.record_meeting_officer_change(test_uuid('recused-chair:meeting'),'chair',pg_temp.member('recused-chair',1),clock_timestamp())$$,
 'the returning mayor resumes the chair through the form');
SELECT is(agenda_item_ballot_chair(pg_temp.item('recused-chair',2))->>'councilMemberId',pg_temp.member('recused-chair',1)::text,
 'the mayor chairs the next ballot');

-- 4. The mayor votes and holds a proxy like any member.
SELECT pg_temp.officers_meeting('mayor-proxy',1);
SELECT lives_ok($$SELECT hall_api.record_meeting_attendance_events(test_uuid('mayor-proxy:meeting'),'2026-01-01 09:01Z',
 jsonb_build_array(jsonb_build_object('councilMemberId',pg_temp.member('mayor-proxy',6),'status','represented',
  'proxyHolderCouncilMemberId',pg_temp.member('mayor-proxy',1),'proxyDocumentId',test_uuid('mayor-proxy:proxy:6'))))$$,
 'the represented member gives the proxy to the mayor');
SELECT ok(agenda_item_attendance_is_eligible(pg_temp.item('mayor-proxy',1),pg_temp.att('mayor-proxy',1))
 AND agenda_item_attendance_is_eligible(pg_temp.item('mayor-proxy',1),pg_temp.att('mayor-proxy',6)),
 'the mayor takes part in the vote personally and as a proxy holder');

-- 5. An officer change invalidates a reviewed preview.
SELECT pg_temp.officers_meeting('stale',1);
SELECT start_council_agenda_item(pg_temp.item('stale',1),'2026-01-01 09:01Z');
CREATE TEMP TABLE stale_preview AS SELECT hall_api.create_ballot_result_preview(pg_temp.item('stale',1),
 pg_temp.candidate(ARRAY[pg_temp.att('stale',1),pg_temp.att('stale',4)],ARRAY['approve','approve'])) payload;
SELECT lives_ok($$SELECT hall_api.record_meeting_officer_change(test_uuid('stale:meeting'),'secretary',pg_temp.member('stale',5),clock_timestamp())$$,
 'the secretary is replaced after the review');
SELECT throws_ok($$SELECT hall_api.confirm_ballot_result_preview((SELECT (payload->>'id')::uuid FROM stale_preview))$$,
 'HV422',NULL,'a preview reviewed before an officer change must be reviewed again');

SELECT * FROM finish();
ROLLBACK;
