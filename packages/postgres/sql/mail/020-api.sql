-- @implements-requirement HALL-FR-EML-010
-- @implements-requirement HALL-FR-EML-030
-- @implements-requirement HALL-FR-EML-040
-- @implements-requirement HALL-FR-EML-050
-- @implements-requirement HALL-FR-EML-060
CREATE FUNCTION hall.require_mail_action(action_name TEXT)
RETURNS TEXT LANGUAGE plpgsql STABLE SET search_path = pg_catalog, hall AS $$
DECLARE actor TEXT := nullif(current_setting('hall.actor_id',true),'');
BEGIN
  IF actor IS NULL OR NOT hall.allows(action_name) THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Mail action is not authorized';
  END IF;
  RETURN actor;
END $$;

CREATE FUNCTION hall.mail_submission_json(s hall.mail_submission)
RETURNS JSONB LANGUAGE sql STABLE SET search_path = pg_catalog, hall AS $$
  SELECT jsonb_build_object('id',s.id,'messageId',s.message_id,'revision',s.revision,'requestKey',s.request_key,
    'status',s.status,'requestedBy',s.requested_by,'startedAt',hall.iso_timestamp(s.started_at),
    'finishedAt',hall.iso_timestamp(s.finished_at),'errorCode',s.error_code,
    'verification',CASE WHEN s.verified_at IS NULL THEN NULL ELSE jsonb_build_object('outcome',s.verification_outcome,
      'notes',s.verification_notes,'verifiedBy',s.verified_by,'verifiedAt',hall.iso_timestamp(s.verified_at)) END)
$$;
CREATE FUNCTION hall.mail_message_json(m hall.mail_message)
RETURNS JSONB LANGUAGE sql STABLE SET search_path = pg_catalog, hall AS $$
  SELECT jsonb_build_object('id',m.id,'revision',m.revision,'subject',m.subject,'bodyMarkdown',m.body_markdown,
    'source',m.source,'createdBy',m.created_by,'updatedBy',m.updated_by,'createdAt',hall.iso_timestamp(m.created_at),'updatedAt',hall.iso_timestamp(m.updated_at),
    'recipients',coalesce((SELECT jsonb_agg(jsonb_build_object('kind',r.kind,'name',r.name,'address',r.address,'contactId',r.contact_id) ORDER BY r.position)
      FROM hall.mail_recipient r WHERE r.message_id=m.id),'[]'::jsonb),
    'attachments',coalesce((SELECT jsonb_agg(jsonb_build_object('id',a.id,'fileName',a.file_name,'binaryObjectId',a.binary_object_id,
      'resourceId',a.resource_id,'mediaType',b.media_type,'byteSize',b.byte_size) ORDER BY a.created_at,a.id)
      FROM hall.mail_attachment a JOIN hall.binary_object b ON b.id=a.binary_object_id WHERE a.message_id=m.id),'[]'::jsonb),
    'submissions',coalesce((SELECT jsonb_agg(hall.mail_submission_json(s) ORDER BY s.started_at DESC,s.id) FROM hall.mail_submission s WHERE s.message_id=m.id),'[]'::jsonb))
$$;
CREATE FUNCTION hall.lock_mail_draft(target UUID, expected_revision INTEGER)
RETURNS hall.mail_message LANGUAGE plpgsql SET search_path = pg_catalog, hall AS $$
DECLARE m hall.mail_message;
BEGIN
  SELECT * INTO m FROM hall.mail_message WHERE id=target FOR UPDATE;
  IF NOT FOUND OR m.revision <> expected_revision THEN RAISE EXCEPTION USING ERRCODE='HV850',MESSAGE='Mail draft has changed'; END IF;
  IF EXISTS (SELECT FROM hall.mail_submission s WHERE s.message_id=target AND
    (s.status IN ('submitting','accepted') OR (s.status='unknown' AND s.verification_outcome IS DISTINCT FROM 'not-sent'))) THEN
    RAISE EXCEPTION USING ERRCODE='HV851',MESSAGE='Mail submission blocks draft changes';
  END IF;
  RETURN m;
END $$;
CREATE FUNCTION hall.write_mail_recipients(target UUID, entries JSONB)
RETURNS VOID LANGUAGE plpgsql SET search_path = pg_catalog,hall AS $$
BEGIN
  DELETE FROM hall.mail_recipient WHERE message_id=target;
  INSERT INTO hall.mail_recipient(message_id,position,kind,name,address,contact_id)
    SELECT target, ordinal-1,entry->>'kind',entry->>'name',entry->>'address',(entry->>'contactId')::uuid
    FROM jsonb_array_elements(entries) WITH ORDINALITY AS item(entry,ordinal);
END $$;
CREATE FUNCTION hall.recover_interrupted_mail_submissions()
RETURNS VOID LANGUAGE sql VOLATILE SET search_path=pg_catalog,hall AS $$
  UPDATE hall.mail_submission SET status='unknown',error_code='outlook_worker_interrupted',finished_at=clock_timestamp()
  WHERE status='submitting' AND started_at < clock_timestamp() - interval '2 minutes'
$$;
CREATE FUNCTION hall_api.open_mail(target UUID)
RETURNS JSONB LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,hall AS $$
BEGIN
  PERFORM hall.require_mail_action('application.read');
  PERFORM hall.recover_interrupted_mail_submissions();
  RETURN (SELECT hall.mail_message_json(m) FROM hall.mail_message m WHERE m.id=target);
END $$;
CREATE FUNCTION hall_api.list_mail()
RETURNS JSONB LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,hall AS $$
BEGIN
  PERFORM hall.require_mail_action('application.read');
  PERFORM hall.recover_interrupted_mail_submissions();
  RETURN coalesce((SELECT jsonb_agg(hall.mail_message_json(m) ORDER BY m.updated_at DESC,m.id) FROM hall.mail_message m),'[]'::jsonb);
END $$;
CREATE FUNCTION hall_api.create_mail(input JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,hall AS $$
DECLARE actor TEXT := hall.require_mail_action('mail.create'); m hall.mail_message;
BEGIN
  INSERT INTO hall.mail_message(subject,body_markdown,created_by,updated_by,source)
    VALUES (input->>'subject',input->>'bodyMarkdown',actor,actor,coalesce(input->'source','{"kind":"free"}'::jsonb)) RETURNING * INTO m;
  PERFORM hall.write_mail_recipients(m.id,input->'recipients');
  RETURN hall.mail_message_json(m);
END $$;
CREATE FUNCTION hall_api.update_mail(target UUID, expected_revision INTEGER, input JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,hall AS $$
DECLARE actor TEXT := hall.require_mail_action('mail.update'); m hall.mail_message;
BEGIN
  PERFORM hall.lock_mail_draft(target,expected_revision);
  UPDATE hall.mail_message SET subject=input->>'subject',body_markdown=input->>'bodyMarkdown',revision=revision+1,
    updated_by=actor,updated_at=clock_timestamp() WHERE id=target RETURNING * INTO m;
  PERFORM hall.write_mail_recipients(target,input->'recipients');
  RETURN hall.mail_message_json(m);
END $$;
CREATE FUNCTION hall_api.delete_mail(target UUID, expected_revision INTEGER)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,hall AS $$
BEGIN
  PERFORM hall.require_mail_action('mail.delete');
  PERFORM hall.lock_mail_draft(target,expected_revision);
  IF EXISTS(SELECT 1 FROM hall.mail_submission WHERE message_id=target) THEN RAISE EXCEPTION USING ERRCODE='23000',MESSAGE='Submission history must be retained'; END IF;
  DELETE FROM hall.mail_message WHERE id=target;
  RETURN FOUND;
END $$;
CREATE FUNCTION hall_api.attach_mail_file(target UUID, expected_revision INTEGER, file_name TEXT, media_type TEXT, content BYTEA, source_resource UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,hall AS $$
DECLARE actor TEXT := hall.require_mail_action('mail.attach'); m hall.mail_message; binary_id UUID;
BEGIN
  PERFORM hall.lock_mail_draft(target,expected_revision);
  IF octet_length(content) + coalesce((SELECT sum(b.byte_size) FROM hall.mail_attachment a JOIN hall.binary_object b ON b.id=a.binary_object_id WHERE a.message_id=target),0) > 50*1024*1024 THEN
    RAISE EXCEPTION USING ERRCODE='HV852',MESSAGE='Mail attachments exceed 50 MiB';
  END IF;
  binary_id := hall.store_binary_object(media_type,content);
  INSERT INTO hall.mail_attachment(message_id,file_name,binary_object_id,resource_id) VALUES(target,file_name,binary_id,source_resource);
  UPDATE hall.mail_message SET revision=revision+1,updated_by=actor,updated_at=clock_timestamp() WHERE id=target RETURNING * INTO m;
  RETURN hall.mail_message_json(m);
END $$;
CREATE FUNCTION hall_api.remove_mail_attachment(target UUID, expected_revision INTEGER, attachment UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,hall AS $$
DECLARE actor TEXT := hall.require_mail_action('mail.remove-attachment'); m hall.mail_message;
BEGIN
  PERFORM hall.lock_mail_draft(target,expected_revision);
  DELETE FROM hall.mail_attachment WHERE id=attachment AND message_id=target;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='23000',MESSAGE='Mail attachment is missing'; END IF;
  UPDATE hall.mail_message SET revision=revision+1,updated_by=actor,updated_at=clock_timestamp() WHERE id=target RETURNING * INTO m;
  RETURN hall.mail_message_json(m);
END $$;
CREATE FUNCTION hall_api.read_mail_attachment(target UUID, attachment UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,hall AS $$
BEGIN
  PERFORM hall.require_mail_action('application.read');
  RETURN (SELECT jsonb_build_object('fileName',a.file_name,'mediaType',b.media_type,'base64',encode(b.content,'base64'))
    FROM hall.mail_attachment a JOIN hall.binary_object b ON b.id=a.binary_object_id WHERE a.message_id=target AND a.id=attachment);
END $$;

CREATE FUNCTION hall_api.begin_mail_submission(target UUID, expected_revision INTEGER, request_key UUID, prepared JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,hall AS $$
DECLARE actor TEXT := hall.require_mail_action('mail.send'); s hall.mail_submission; m hall.mail_message;
BEGIN
  SELECT * INTO m FROM hall.mail_message WHERE id=target FOR UPDATE;
  SELECT * INTO s FROM hall.mail_submission x WHERE x.message_id=target AND x.request_key=begin_mail_submission.request_key;
  IF FOUND THEN RETURN jsonb_build_object('created',false,'submission',hall.mail_submission_json(s)); END IF;
  PERFORM hall.lock_mail_draft(target,expected_revision);
  INSERT INTO hall.mail_submission(message_id,revision,request_key,requested_by,payload)
    VALUES(target,expected_revision,request_key,actor,prepared) RETURNING * INTO s;
  INSERT INTO hall.mail_submission_attachment(submission_id,attachment_id,file_name,binary_object_id)
    SELECT s.id,a.id,a.file_name,a.binary_object_id FROM hall.mail_attachment a WHERE a.message_id=target;
  RETURN jsonb_build_object('created',true,'submission',hall.mail_submission_json(s));
END $$;
CREATE FUNCTION hall_api.finish_mail_submission(target UUID, outcome TEXT, failure_code TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,hall AS $$
DECLARE s hall.mail_submission; actor TEXT := nullif(current_setting('hall.actor_id',true),'');
BEGIN
  IF outcome NOT IN ('accepted','failed','unknown') THEN RAISE EXCEPTION USING ERRCODE='23000',MESSAGE='Invalid mail outcome'; END IF;
  SELECT * INTO s FROM hall.mail_submission WHERE id=target FOR UPDATE;
  IF s.requested_by IS DISTINCT FROM actor THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Submission belongs to another caller'; END IF;
  IF s.status='submitting' THEN
    UPDATE hall.mail_submission SET status=outcome,error_code=failure_code,finished_at=clock_timestamp() WHERE id=target RETURNING * INTO s;
  END IF;
  RETURN hall.mail_submission_json(s);
END $$;
CREATE FUNCTION hall_api.verify_mail_submission(target UUID, outcome TEXT, notes TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,hall AS $$
DECLARE actor TEXT := hall.require_mail_action('mail.verify-submission'); s hall.mail_submission;
BEGIN
  SELECT * INTO s FROM hall.mail_submission WHERE id=target FOR UPDATE;
  IF s.status IS DISTINCT FROM 'unknown' OR s.verified_at IS NOT NULL OR outcome NOT IN ('sent','not-sent') OR coalesce(btrim(notes),'')='' THEN
    RAISE EXCEPTION USING ERRCODE='23000',MESSAGE='Outlook verification is unavailable or incomplete';
  END IF;
  UPDATE hall.mail_submission SET verification_outcome=outcome,verification_notes=notes,verified_by=actor,verified_at=clock_timestamp()
    WHERE id=target RETURNING * INTO s;
  RETURN hall.mail_submission_json(s);
END $$;

CREATE FUNCTION hall.mail_recipient_group_json(g hall.mail_recipient_group)
RETURNS JSONB LANGUAGE sql STABLE SET search_path=pg_catalog,hall AS $$
  SELECT jsonb_build_object('id',g.id,'name',g.name,'revision',g.revision,'updatedAt',hall.iso_timestamp(g.updated_at),
    'members',coalesce((SELECT jsonb_agg(jsonb_build_object('name',m.name,'address',m.address,'contactId',m.contact_id) ORDER BY m.position)
      FROM hall.mail_recipient_group_member m WHERE m.group_id=g.id),'[]'::jsonb))
$$;
CREATE FUNCTION hall_api.list_mail_recipient_groups()
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,hall AS $$
BEGIN
  PERFORM hall.require_mail_action('application.read');
  RETURN coalesce((SELECT jsonb_agg(hall.mail_recipient_group_json(g) ORDER BY g.name,g.id) FROM hall.mail_recipient_group g),'[]'::jsonb);
END $$;
CREATE FUNCTION hall_api.save_mail_recipient_group(target UUID, expected_revision INTEGER, input JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,hall AS $$
DECLARE actor TEXT; g hall.mail_recipient_group;
BEGIN
  actor := hall.require_mail_action(CASE WHEN target IS NULL THEN 'mail-group.create' ELSE 'mail-group.update' END);
  IF target IS NULL THEN
    INSERT INTO hall.mail_recipient_group(name,created_by,updated_by) VALUES(input->>'name',actor,actor) RETURNING * INTO g;
  ELSE
    SELECT * INTO g FROM hall.mail_recipient_group WHERE id=target FOR UPDATE;
    IF NOT FOUND OR g.revision<>expected_revision THEN RAISE EXCEPTION USING ERRCODE='23000',MESSAGE='Recipient group has changed'; END IF;
    UPDATE hall.mail_recipient_group SET name=input->>'name',revision=revision+1,updated_by=actor,updated_at=clock_timestamp() WHERE id=target RETURNING * INTO g;
  END IF;
  DELETE FROM hall.mail_recipient_group_member WHERE group_id=g.id;
  INSERT INTO hall.mail_recipient_group_member(group_id,position,name,address,contact_id)
    SELECT g.id,ordinal-1,entry->>'name',entry->>'address',(entry->>'contactId')::uuid FROM jsonb_array_elements(input->'members') WITH ORDINALITY AS item(entry,ordinal);
  RETURN hall.mail_recipient_group_json(g);
END $$;
CREATE FUNCTION hall_api.delete_mail_recipient_group(target UUID, expected_revision INTEGER)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,hall AS $$
BEGIN
  PERFORM hall.require_mail_action('mail-group.delete');
  DELETE FROM hall.mail_recipient_group WHERE id=target AND revision=expected_revision;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='23000',MESSAGE='Recipient group has changed'; END IF;
  RETURN TRUE;
END $$;

CREATE FUNCTION hall_api.read_mail_submission(target UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,hall AS $$
BEGIN
  PERFORM hall.require_mail_action('application.read');
  RETURN (SELECT payload FROM hall.mail_submission WHERE id=target);
END $$;
CREATE FUNCTION hall_api.read_mail_submission_attachment(target UUID, attachment UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,hall AS $$
BEGIN
  PERFORM hall.require_mail_action('application.read');
  RETURN (SELECT jsonb_build_object('fileName',a.file_name,'mediaType',b.media_type,'base64',encode(b.content,'base64'))
    FROM hall.mail_submission_attachment a JOIN hall.binary_object b ON b.id=a.binary_object_id
    WHERE a.submission_id=target AND a.attachment_id=attachment);
END $$;
