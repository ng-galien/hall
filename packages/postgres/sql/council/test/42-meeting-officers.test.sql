BEGIN;
SET LOCAL search_path=hall,public;
SET LOCAL hall.actor_id='officers-clerk';
\ir support/helpers.sql
SELECT no_plan();

-- Officer handover, item presidency and ballot chair, per the user decisions
-- of 26 October 2026 (questions 2, 3 and 5) and CGCT L2121-14, L2122-17,
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

-- 1. Chair handover follows the statutory order.
-- @verifies-requirement HALL-FR-MTG-330
SELECT pg_temp.officers_meeting('order',1);
SELECT throws_ok($$SELECT hall.record_meeting_officer_change(test_uuid('order:meeting'),'chair',pg_temp.member('order',2),'2026-01-01 08:59Z')$$,
 'HV133',NULL,'a handover cannot precede the opening');
SELECT pg_temp.depart('order',1,'2026-01-01 09:01Z');
SELECT is(pg_temp.chair_options('order'),
 jsonb_build_array(jsonb_build_object('councilMemberId',pg_temp.member('order',2),'basis','deputyInNominationOrder')),
 'with the mayor gone, Hall proposes only the first present deputy in the order of nominations');
SELECT throws_ok($$SELECT hall_api.record_meeting_officer_change(test_uuid('order:meeting'),'chair',pg_temp.member('order',5),'2026-01-01 09:02Z')$$,
 'HV127',NULL,'a councillor cannot take the chair while a deputy is present');
SELECT throws_ok($$SELECT hall_api.record_meeting_officer_change(test_uuid('order:meeting'),'chair',pg_temp.member('order',3),'2026-01-01 09:02Z')$$,
 'HV127',NULL,'the second deputy cannot take the chair while the first is present');
SELECT throws_ok($$SELECT hall_api.record_meeting_officer_change(test_uuid('order:meeting'),'chair',pg_temp.member('order',2),'2026-01-01 09:00:30Z')$$,
 'HV133',NULL,'a handover cannot precede a recorded attendance movement');
SELECT throws_ok($$SELECT hall_api.record_meeting_officer_change(test_uuid('order:meeting'),'treasurer',pg_temp.member('order',2),'2026-01-01 09:02Z')$$,
 'HV127',NULL,'only the chair and the secretary are meeting offices');
SELECT lives_ok($$SELECT hall_api.record_meeting_officer_change(test_uuid('order:meeting'),'chair',pg_temp.member('order',2),'2026-01-01 09:02Z')$$,
 'the first present deputy takes the chair');
SELECT is(current_meeting_officer(test_uuid('order:meeting'),'chair'),pg_temp.member('order',2),'the first deputy is the chair in office');
SELECT pg_temp.depart('order',2,'2026-01-01 09:03Z');
SELECT is(pg_temp.chair_options('order'),
 jsonb_build_array(jsonb_build_object('councilMemberId',pg_temp.member('order',3),'basis','deputyInNominationOrder')),
 'when the first deputy leaves, the next present deputy is proposed');
INSERT INTO meeting_attendance_event(meeting_attendance,observed_at,status) VALUES(pg_temp.att('order',1),'2026-01-01 09:04Z','present');
SELECT is(pg_temp.chair_options('order'),
 jsonb_build_array(jsonb_build_object('councilMemberId',pg_temp.member('order',3),'basis','deputyInNominationOrder'),
  jsonb_build_object('councilMemberId',pg_temp.member('order',1),'basis','mayor')),
 'the returning mayor may resume the chair');
SELECT lives_ok($$SELECT hall_api.record_meeting_officer_change(test_uuid('order:meeting'),'chair',pg_temp.member('order',1),'2026-01-01 09:05Z')$$,
 'the mayor resumes the chair');
SELECT is((SELECT jsonb_agg(jsonb_build_object('member',council_member,'basis',basis,'name',member_name) ORDER BY observed_at)
 FROM meeting_officer_change WHERE council_meeting=test_uuid('order:meeting')),
 jsonb_build_array(jsonb_build_object('member',pg_temp.member('order',2),'basis','deputyInNominationOrder','name','Test '||pg_temp.member('order',2)),
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

-- Unknown ranks: Hall cannot order the deputies and accepts either.
SELECT pg_temp.officers_meeting('unranked',1,FALSE);
SELECT pg_temp.depart('unranked',1,'2026-01-01 09:01Z');
SELECT is(pg_temp.chair_options('unranked'),
 (SELECT jsonb_agg(jsonb_build_object('councilMemberId',id,'basis','deputyInNominationOrder') ORDER BY id::text)
  FROM unnest(ARRAY[pg_temp.member('unranked',2),pg_temp.member('unranked',3)]) id),
 'without known ranks every present deputy is admissible');

-- 2. Secretary replacement is a council nomination among present members.
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

-- 3. The ballot chair of an item whose chair in office is recused.
-- @verifies-requirement HALL-FR-BAL-140
-- @verifies-requirement HALL-FR-BAL-330
-- @verifies-requirement HALL-FR-BAL-340
SELECT pg_temp.officers_meeting('recused-chair',3);
INSERT INTO agenda_item_recusal(agenda_item,council_member,legal_basis,declared_at)
VALUES(pg_temp.item('recused-chair',1),pg_temp.member('recused-chair',1),'personalInterest','2026-01-01 09:00:10Z'),
 (pg_temp.item('recused-chair',2),pg_temp.member('recused-chair',1),'personalInterest','2026-01-01 09:00:10Z'),
 (pg_temp.item('recused-chair',2),pg_temp.member('recused-chair',2),'personalInterest','2026-01-01 09:00:10Z');
SELECT is(agenda_item_ballot_chair(pg_temp.item('recused-chair',1))-'physicallyPresent',
 jsonb_build_object('councilMemberId',pg_temp.member('recused-chair',2),'basis','statutoryReplacement','meetingAttendanceId',pg_temp.att('recused-chair',2)),
 'a recused chair is replaced for the item by the first present deputy');
SELECT is(agenda_item_ballot_chair(pg_temp.item('recused-chair',2))->>'councilMemberId',pg_temp.member('recused-chair',3)::text,
 'a recused first deputy passes the item to the next deputy');
SELECT start_council_agenda_item(pg_temp.item('recused-chair',1),'2026-01-01 09:01Z');
SELECT pg_temp.depart('recused-chair',1,'2026-01-01 09:02Z');
SELECT lives_ok($$SELECT hall_api.confirm_ballot_result_preview((hall_api.create_ballot_result_preview(pg_temp.item('recused-chair',1),
 pg_temp.candidate(ARRAY[pg_temp.att('recused-chair',2),pg_temp.att('recused-chair',3),pg_temp.att('recused-chair',4),pg_temp.att('recused-chair',5)],
 ARRAY['approve','reject','approve','reject']))->>'id')::uuid)$$,
 'the recused chair who left does not prevent the ballot chaired by the deputy');
SELECT is((SELECT jsonb_build_object('chair',p.meeting_attendance,'result',b.result) FROM ballots b JOIN ballot_participation p ON p.id=b.chairman
 WHERE b.council_agenda_item=pg_temp.item('recused-chair',1)),
 jsonb_build_object('chair',pg_temp.att('recused-chair',2),'result','approve'),
 'the deputy chairs the ballot and his voice prevails on a tie');
SELECT pg_temp.depart('recused-chair',3,'2026-01-01 09:03Z');
SELECT start_council_agenda_item(pg_temp.item('recused-chair',2),clock_timestamp());
SELECT is(agenda_item_ballot_officer_blockers(pg_temp.item('recused-chair',2)),'[{"code":"ballotChairUndetermined"}]'::jsonb,
 'without an admissible deputy the ballot chair is undetermined');
SELECT ok((SELECT council_agenda_item_capabilities(item)#>'{conductBlockers,reviewBallot}' FROM council_agenda_item item
 WHERE id=pg_temp.item('recused-chair',2)) @> '[{"code":"ballotChairUndetermined"}]',
 'the conduct screen receives the undetermined ballot chair as a ballot review blocker');
SELECT throws_ok($$SELECT hall_api.create_ballot_result_preview(pg_temp.item('recused-chair',2),
 pg_temp.candidate(ARRAY[pg_temp.att('recused-chair',4),pg_temp.att('recused-chair',5)],ARRAY['approve','reject']))$$,
 'HV410',NULL,'a ballot without determined chair is refused');
SELECT is(hall_api.agenda_item_recusals(pg_temp.item('recused-chair',2))#>'{presidencyOptions,councilDesignation}',
 (SELECT jsonb_agg(id ORDER BY id) FROM unnest(ARRAY[pg_temp.member('recused-chair',4),pg_temp.member('recused-chair',5),pg_temp.member('recused-chair',7),pg_temp.member('recused-chair',8),pg_temp.member('recused-chair',9),pg_temp.member('recused-chair',10)]) id),
 'the council can designate a present member who is neither the chair nor recused');
SELECT throws_ok($$SELECT hall_api.record_agenda_item_presidency(pg_temp.item('recused-chair',2),pg_temp.member('recused-chair',2),'councilDesignation',clock_timestamp())$$,
 'HV129',NULL,'a recused member cannot be designated to chair the item');
SELECT lives_ok($$SELECT hall_api.record_agenda_item_presidency(pg_temp.item('recused-chair',2),pg_temp.member('recused-chair',5),'councilDesignation',clock_timestamp())$$,
 'the council designates the chair of the item');
SELECT is((hall_api.agenda_item_recusals(pg_temp.item('recused-chair',2))->'ballotChair')-'physicallyPresent'::text,
 jsonb_build_object('councilMemberId',pg_temp.member('recused-chair',5),'basis','councilDesignation','meetingAttendanceId',pg_temp.att('recused-chair',5)),
 'the designated member chairs the ballot of the item');
SELECT throws_ok($$SELECT hall_api.record_agenda_item_presidency(pg_temp.item('recused-chair',2),pg_temp.member('recused-chair',4),'councilDesignation',clock_timestamp())$$,
 'HV129',NULL,'an item has one presidency');
SELECT is(agenda_item_ballot_chair(pg_temp.item('recused-chair',3))->>'basis','meetingChair',
 'an item without recusal of the chair is chaired by the chair in office');
SELECT throws_ok($$SELECT hall_api.record_agenda_item_presidency(pg_temp.item('recused-chair',3),pg_temp.member('recused-chair',4),'councilDesignation',clock_timestamp())$$,
 'HV129',NULL,'a designation is refused while the chair in office can chair the item');

-- 4. Single financial statement: elected chair, mayor withdrawn at the vote.
SELECT pg_temp.officers_meeting('financial',2);
SELECT is(hall_api.agenda_item_recusals(pg_temp.item('financial',1))#>'{presidencyOptions,financialStatementElection}',
 (SELECT jsonb_agg(id ORDER BY id) FROM unnest(ARRAY[pg_temp.member('financial',2),pg_temp.member('financial',3),pg_temp.member('financial',4),pg_temp.member('financial',5),pg_temp.member('financial',7),pg_temp.member('financial',8),pg_temp.member('financial',9),pg_temp.member('financial',10)]) id),
 'every present member except the mayor can be elected chair for the financial statement');
SELECT throws_ok($$SELECT hall_api.record_agenda_item_presidency(pg_temp.item('financial',1),pg_temp.member('financial',1),'financialStatementElection',clock_timestamp())$$,
 'HV129',NULL,'the mayor cannot chair the vote of the financial statement');
SELECT throws_ok($$SELECT hall_api.record_agenda_item_presidency(pg_temp.item('financial',1),pg_temp.member('financial',4),'chair',clock_timestamp())$$,
 'HV129',NULL,'an item presidency is an election or a council designation');
SELECT lives_ok($$SELECT hall_api.record_agenda_item_presidency(pg_temp.item('financial',1),pg_temp.member('financial',4),'financialStatementElection',clock_timestamp())$$,
 'the council elects the chair of the financial statement');
SELECT is(hall_api.agenda_item_recusals(pg_temp.item('financial',1))#>>'{presidency,basis}','financialStatementElection',
 'the item presidency is exposed to the conduct screen');
SELECT start_council_agenda_item(pg_temp.item('financial',1),clock_timestamp());
SELECT is(agenda_item_recusal_state(pg_temp.item('financial',1))->'eligibleParticipantAttendanceIds',
 (SELECT jsonb_agg(id ORDER BY id) FROM unnest(ARRAY[pg_temp.att('financial',2),pg_temp.att('financial',3),pg_temp.att('financial',4),pg_temp.att('financial',5),pg_temp.att('financial',6),pg_temp.att('financial',7),pg_temp.att('financial',8),pg_temp.att('financial',9),pg_temp.att('financial',10)]) id),
 'the mayor withdraws from the vote of the financial statement');
SELECT throws_ok($$SELECT hall_api.create_ballot_result_preview(pg_temp.item('financial',1),
 pg_temp.candidate(ARRAY[pg_temp.att('financial',1),pg_temp.att('financial',4),pg_temp.att('financial',5)],ARRAY['approve','approve','reject']))$$,
 'HV305',NULL,'the mayor cannot vote on the financial statement');
SELECT pg_temp.depart('financial',1,clock_timestamp());
SELECT lives_ok($$SELECT hall_api.confirm_ballot_result_preview((hall_api.create_ballot_result_preview(pg_temp.item('financial',1),
 pg_temp.candidate(ARRAY[pg_temp.att('financial',4),pg_temp.att('financial',5)],ARRAY['reject','approve']))->>'id')::uuid)$$,
 'the elected chair conducts the vote after the mayor has left');
SELECT is((SELECT jsonb_build_object('chair',p.meeting_attendance,'result',b.result) FROM ballots b JOIN ballot_participation p ON p.id=b.chairman
 WHERE b.council_agenda_item=pg_temp.item('financial',1)),
 jsonb_build_object('chair',pg_temp.att('financial',4),'result','reject'),
 'the elected chair presides and his voice prevails on a tie');
SELECT is(agenda_item_ballot_chair(pg_temp.item('financial',2))->>'councilMemberId',pg_temp.member('financial',1)::text,
 'the election concerns only the financial statement item');

-- A proxy held by the mayor follows the same withdrawal.
SELECT pg_temp.officers_meeting('financial-proxy',1);
SELECT lives_ok($$SELECT hall_api.record_meeting_attendance_events(test_uuid('financial-proxy:meeting'),'2026-01-01 09:01Z',
 jsonb_build_array(jsonb_build_object('councilMemberId',pg_temp.member('financial-proxy',6),'status','represented',
  'proxyHolderCouncilMemberId',pg_temp.member('financial-proxy',1),'proxyDocumentId',test_uuid('financial-proxy:proxy:6'))))$$,
 'the represented member gives the proxy to the mayor');
SELECT lives_ok($$SELECT hall_api.record_agenda_item_presidency(pg_temp.item('financial-proxy',1),pg_temp.member('financial-proxy',2),'financialStatementElection',clock_timestamp())$$,
 'the council elects the first deputy to chair the financial statement');
SELECT ok(NOT agenda_item_attendance_is_eligible(pg_temp.item('financial-proxy',1),pg_temp.att('financial-proxy',6)),
 'the mayor cannot cast a proxy vote on the financial statement');

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
