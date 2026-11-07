CREATE FUNCTION hall_api.create_ballot_result_preview(target_item UUID,candidate JSONB)
RETURNS JSONB LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,hall AS $$
DECLARE preview hall.ballot_result_preview;
BEGIN
 INSERT INTO hall.ballot_result_preview(agenda_item,candidate) VALUES(target_item,candidate) RETURNING * INTO preview;
 RETURN hall.ballot_result_preview_projection(preview);
END $$;
CREATE FUNCTION hall_api.open_ballot_result_preview(target_preview UUID)
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,hall AS $$
 SELECT hall.ballot_result_preview_projection(p) FROM hall.ballot_result_preview p WHERE id=target_preview;
$$;
-- @implements-requirement HALL-FR-MTG-370
CREATE FUNCTION hall_api.confirm_ballot_result_preview(target_preview UUID)
RETURNS JSONB LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,hall AS $$
DECLARE preview hall.ballot_result_preview; b hall.ballots; item hall.council_agenda_item;
  candidate JSONB; input_row RECORD; participation_id UUID; counts JSONB;
BEGIN
 SELECT * INTO preview FROM hall.ballot_result_preview WHERE id=target_preview;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'HV421',MESSAGE='unknown ballot result preview'; END IF;
 PERFORM 1 FROM hall.council_meetings m JOIN hall.council_agenda_item a ON a.council_meeting=m.id
   WHERE a.id=preview.agenda_item FOR UPDATE OF m;
 SELECT * INTO item FROM hall.council_agenda_item WHERE id=preview.agenda_item FOR UPDATE;
 SELECT * INTO b FROM hall.ballots WHERE council_agenda_item=item.id FOR UPDATE;
 IF b.completed_at IS NOT NULL OR item.completed_at IS NOT NULL THEN
   RAISE EXCEPTION USING ERRCODE = 'HV418',MESSAGE='the ballot is already definitively confirmed';
 END IF;
 IF preview.revision<>(SELECT max(revision) FROM hall.ballot_result_preview WHERE agenda_item=item.id)
   OR preview.context_fingerprint IS DISTINCT FROM hall.ballot_preview_fingerprint(item.id) THEN
   RAISE EXCEPTION USING ERRCODE = 'HV422',MESSAGE='the candidate or meeting context changed; review a new result preview';
 END IF;
 candidate:=preview.candidate;
 IF b.id IS NULL THEN
   participation_id:=hall.create_ballot(item.id,(candidate->>'mode')::hall.ballot_mode,
     ARRAY(SELECT value::uuid FROM jsonb_array_elements_text(candidate->'participantAttendanceIds')),
     (candidate->>'chairmanAttendanceId')::uuid,preview.id);
   SELECT * INTO b FROM hall.ballots WHERE id=participation_id;
   IF candidate->>'mode'='public' THEN
     FOR input_row IN SELECT * FROM jsonb_to_recordset(candidate->'votes') AS v("meetingAttendanceId" UUID,choice hall.vote_choice) LOOP
       SELECT id INTO participation_id FROM hall.ballot_participation WHERE ballot=b.id AND meeting_attendance=input_row."meetingAttendanceId";
       INSERT INTO hall.votes(ballot,mode,choice,ballot_participation,count) VALUES(b.id,'public',input_row.choice,participation_id,1);
     END LOOP;
     FOR input_row IN SELECT * FROM jsonb_to_recordset(candidate->'nonParticipations') AS v("meetingAttendanceId" UUID,reason TEXT) LOOP
       SELECT id INTO participation_id FROM hall.ballot_participation WHERE ballot=b.id AND meeting_attendance=input_row."meetingAttendanceId";
       INSERT INTO hall.ballot_non_participation(ballot,mode,ballot_participation,count,reason) VALUES(b.id,'public',participation_id,1,input_row.reason);
     END LOOP;
   ELSE
     counts:=candidate->'totals';
     PERFORM hall.record_secret_ballot_votes(b.id,(counts->>'approve')::integer,(counts->>'reject')::integer,
       (counts->>'abstain')::integer,(counts->>'blank')::integer,(counts->>'invalid')::integer,(counts->>'nonParticipation')::integer);
   END IF;
 END IF;
 PERFORM hall.complete_ballot(b.id,clock_timestamp(),preview.id);
 RETURN hall_api.open_ballot(b.id);
END $$;
