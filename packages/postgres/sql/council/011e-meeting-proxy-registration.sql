-- Regulatory basis: CGCT L2121-20 paragraph 1 lets a member who cannot attend
-- give a colleague of his choice a written proxy to vote in his name; one
-- member holds at most one proxy.
-- https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000053152931
-- @implements-requirement HALL-FR-ATT-190
-- A written proxy received before the meeting is registered with its signed
-- document, the member who gives it and the member who receives it. The
-- registration is not an attendance: the roll call of the opening applies it,
-- and the opening validates the attendance with the existing rules. A
-- registration changes or is withdrawn until the meeting opens.
CREATE TABLE hall.meeting_proxy_registration (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  council_meeting UUID NOT NULL REFERENCES hall.council_meetings(id),
  grantor_member UUID NOT NULL REFERENCES hall.council_member(id),
  holder_member UUID NOT NULL REFERENCES hall.council_member(id),
  proxy_document UUID NOT NULL REFERENCES hall.document_resource(id),
  registered_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  registered_by TEXT NOT NULL,
  CONSTRAINT meeting_proxy_registration_not_to_oneself CHECK (grantor_member <> holder_member),
  CONSTRAINT meeting_proxy_registration_one_per_grantor UNIQUE (council_meeting, grantor_member),
  CONSTRAINT meeting_proxy_registration_one_per_holder UNIQUE (council_meeting, holder_member),
  CONSTRAINT meeting_proxy_registration_one_per_document UNIQUE (council_meeting, proxy_document)
);

CREATE FUNCTION hall.enforce_meeting_proxy_registration()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = pg_catalog, hall AS $$
DECLARE
  meeting hall.council_meetings;
  outside TEXT;
BEGIN
  IF TG_OP = 'TRUNCATE' THEN
    RAISE EXCEPTION USING ERRCODE = 'HV156', MESSAGE = 'proxy registrations cannot be truncated';
  END IF;
  SELECT * INTO meeting FROM hall.council_meetings
  WHERE id = CASE WHEN TG_OP = 'DELETE' THEN OLD.council_meeting ELSE NEW.council_meeting END FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'HV901', MESSAGE = 'unknown council meeting';
  END IF;
  IF meeting.started_at IS NOT NULL OR meeting.closed_at IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'HV153', MESSAGE = 'the proxies of a meeting are registered before its opening';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.council_meeting IS DISTINCT FROM OLD.council_meeting THEN
    RAISE EXCEPTION USING ERRCODE = 'HV156', MESSAGE = 'a proxy registration stays in its meeting';
  END IF;
  IF NEW.grantor_member = NEW.holder_member THEN
    RAISE EXCEPTION USING ERRCODE = 'HV156', MESSAGE = 'a member cannot hold his own proxy';
  END IF;
  SELECT coalesce(contact.first_name || ' ' || contact.last_name, candidate::TEXT) INTO outside
  FROM unnest(ARRAY[NEW.grantor_member, NEW.holder_member]) candidate
  LEFT JOIN hall.council_member member ON member.id = candidate
  LEFT JOIN hall.contact contact ON contact.id = member.contact
  WHERE NOT EXISTS (SELECT FROM hall.active_council_members() active WHERE active.id = candidate)
  LIMIT 1;
  IF outside IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'HV156',
      MESSAGE = format('%s holds no active mandate of the current council term', outside);
  END IF;
  IF EXISTS (SELECT FROM hall.meeting_proxy_registration other
    WHERE other.council_meeting = NEW.council_meeting AND other.holder_member = NEW.holder_member AND other.id <> NEW.id) THEN
    RAISE EXCEPTION USING ERRCODE = 'HV154', MESSAGE = 'this member already holds a proxy for this meeting';
  END IF;
  IF EXISTS (SELECT FROM hall.meeting_proxy_registration other
    WHERE other.council_meeting = NEW.council_meeting AND other.grantor_member = NEW.grantor_member AND other.id <> NEW.id) THEN
    RAISE EXCEPTION USING ERRCODE = 'HV155', MESSAGE = 'this member already gives a proxy for this meeting';
  END IF;
  IF EXISTS (SELECT FROM hall.meeting_proxy_registration other
    WHERE other.council_meeting = NEW.council_meeting AND other.proxy_document = NEW.proxy_document AND other.id <> NEW.id) THEN
    RAISE EXCEPTION USING ERRCODE = 'HV157', MESSAGE = 'this document already supports another proxy of this meeting';
  END IF;
  NEW.registered_at := clock_timestamp();
  NEW.registered_by := nullif(current_setting('hall.actor_id', true), '');
  RETURN NEW;
END $$;
CREATE TRIGGER meeting_proxy_registration_lifecycle
BEFORE INSERT OR UPDATE OR DELETE ON hall.meeting_proxy_registration
FOR EACH ROW EXECUTE FUNCTION hall.enforce_meeting_proxy_registration();
CREATE TRIGGER meeting_proxy_registration_no_truncate
BEFORE TRUNCATE ON hall.meeting_proxy_registration
FOR EACH STATEMENT EXECUTE FUNCTION hall.enforce_meeting_proxy_registration();

CREATE FUNCTION hall.meeting_proxy_registrations_json(target_meeting UUID)
RETURNS JSONB LANGUAGE sql STABLE SET search_path = pg_catalog, hall AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('id', registration.id,
    'grantorCouncilMemberId', registration.grantor_member, 'holderCouncilMemberId', registration.holder_member,
    'proxyDocumentId', registration.proxy_document, 'registeredAt', registration.registered_at)
    ORDER BY contact.last_name, contact.first_name, registration.id), '[]'::jsonb)
  FROM hall.meeting_proxy_registration registration
  JOIN hall.council_member member ON member.id = registration.grantor_member
  JOIN hall.contact contact ON contact.id = member.contact
  WHERE registration.council_meeting = target_meeting;
$$;
