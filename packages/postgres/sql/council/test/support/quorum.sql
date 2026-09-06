CREATE FUNCTION pg_temp.quorum_case(label TEXT,members INTEGER,present INTEGER)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE i INTEGER; ids UUID[]:='{}';
BEGIN
 INSERT INTO council_meetings(id,number,scheduled_at,location)
 VALUES(test_uuid(label||':meeting'),(SELECT coalesce(max(number),0)+1 FROM council_meetings),'2026-01-01 09:00Z','Chamber');
 FOR i IN 1..members LOOP
  PERFORM test_ensure_council_member(test_uuid(label||':member:'||i));
  ids:=array_append(ids,test_uuid(label||':member:'||i));
  INSERT INTO meeting_attendance(id,council_member,council_meeting,status)
  VALUES(test_uuid(label||':att:'||i),test_uuid(label||':member:'||i),test_uuid(label||':meeting'),
    CASE WHEN i<=present THEN 'present'::meeting_attendance_status ELSE 'absent'::meeting_attendance_status END);
 END LOOP;
 INSERT INTO meeting_membership_record(council_meeting,observed_at,source_reference,member_ids)
 VALUES(test_uuid(label||':meeting'),'2026-01-01 09:00Z','Confirmed effective mandates',ids);
 PERFORM set_council_meeting_officers(test_uuid(label||':meeting'),ids[1],ids[1]);
 PERFORM test_create_decision_agenda_item(label||':a',test_uuid(label||':meeting'));
 PERFORM test_create_decision_agenda_item(label||':b',test_uuid(label||':meeting'),2);
END $$;

CREATE FUNCTION pg_temp.public_candidate(label TEXT,participants INTEGER,approvals INTEGER DEFAULT 1)
RETURNS JSONB LANGUAGE sql AS $$
 SELECT jsonb_build_object('procedure','ordinaryMajority','mode','public',
 'participantAttendanceIds',jsonb_agg(test_uuid(label||':att:'||i) ORDER BY test_uuid(label||':att:'||i)),
 'chairmanAttendanceId',test_uuid(label||':att:1'),
 'votes',jsonb_agg(jsonb_build_object('meetingAttendanceId',test_uuid(label||':att:'||i),
 'choice',CASE WHEN i<=approvals THEN 'approve' ELSE 'reject' END) ORDER BY test_uuid(label||':att:'||i)),
 'nonParticipations','[]'::jsonb) FROM generate_series(1,participants)i;
$$;
