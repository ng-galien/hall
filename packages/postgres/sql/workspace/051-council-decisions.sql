-- A decision is the documentary record of any definitively voted proposal,
-- including rejection. Minutes approval has a separate documentary lifecycle.
-- @functional-requirement HALL-FR-DEC-020 CONFIRMED_PROPOSALS_PRODUCE_DOCUMENTARY_DRAFTS:
CREATE TABLE hall.council_decision (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ballot UUID NOT NULL UNIQUE REFERENCES hall.council_decision_facts(ballot),
  content TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK(version>0),
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);
CREATE TABLE hall.council_decision_document (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  council_decision UUID NOT NULL UNIQUE REFERENCES hall.council_decision(id),
  binary_object UUID NOT NULL REFERENCES hall.binary_object(id),
  frozen_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE FUNCTION hall.enforce_council_decision_lifecycle()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path=pg_catalog,hall AS $$
DECLARE source JSONB;
BEGIN
  IF TG_OP IN ('DELETE','TRUNCATE') THEN
    RAISE EXCEPTION USING ERRCODE='HV732',MESSAGE='council decision history cannot be removed';
  END IF;
  IF TG_OP='INSERT' THEN
    SELECT facts INTO STRICT source FROM hall.council_decision_facts WHERE ballot=NEW.ballot;
    NEW.content:=source#>>'{proposal,submittedText}';
    NEW.created_at:=(source->>'confirmedAt')::timestamptz;
    NEW.updated_at:=NEW.created_at;
    NEW.version:=1;
    RETURN NEW;
  END IF;
  -- @functional-requirement HALL-FR-DEC-040 DOCUMENTARY_EDITS_PRESERVE_FACTS_AND_IDENTITY:
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.ballot IS DISTINCT FROM OLD.ballot
    OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION USING ERRCODE='HV733',MESSAGE='decision origin is immutable';
  END IF;
  IF EXISTS(SELECT FROM hall.council_decision_document WHERE council_decision=OLD.id) THEN
    RAISE EXCEPTION USING ERRCODE='HV734',MESSAGE='frozen decision cannot be edited';
  END IF;
  NEW.version:=OLD.version+1;
  NEW.updated_at:=clock_timestamp();
  RETURN NEW;
END $$;
CREATE TRIGGER council_decision_lifecycle BEFORE INSERT OR UPDATE OR DELETE ON hall.council_decision
FOR EACH ROW EXECUTE FUNCTION hall.enforce_council_decision_lifecycle();
CREATE TRIGGER council_decision_no_truncate BEFORE TRUNCATE ON hall.council_decision
FOR EACH STATEMENT EXECUTE FUNCTION hall.enforce_council_decision_lifecycle();

CREATE FUNCTION hall.provision_council_decision()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path=pg_catalog,hall AS $$
BEGIN
  INSERT INTO hall.council_decision(ballot) VALUES(NEW.ballot);
  RETURN NEW;
END $$;
CREATE TRIGGER decision_facts_provision_draft AFTER INSERT ON hall.council_decision_facts
FOR EACH ROW EXECUTE FUNCTION hall.provision_council_decision();

CREATE FUNCTION hall.enforce_council_decision_document()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path=pg_catalog,hall AS $$
BEGIN
  -- @functional-requirement HALL-FR-DEC-050 EXPLICIT_FREEZE_RETAINS_AN_IMMUTABLE_PDF:
  IF TG_OP<>'INSERT' THEN
    RAISE EXCEPTION USING ERRCODE='HV735',MESSAGE='frozen decision document is immutable';
  END IF;
  PERFORM 1 FROM hall.council_decision WHERE id=NEW.council_decision FOR UPDATE;
  IF NOT EXISTS(SELECT FROM hall.binary_object WHERE id=NEW.binary_object AND media_type='application/pdf'
    AND byte_size>5 AND substring(content FROM 1 FOR 5)=convert_to('%PDF-','UTF8')) THEN
    RAISE EXCEPTION USING ERRCODE='HV736',MESSAGE='decision document requires PDF bytes';
  END IF;
  NEW.frozen_at:=clock_timestamp();
  RETURN NEW;
END $$;
CREATE TRIGGER council_decision_document_lifecycle BEFORE INSERT OR UPDATE OR DELETE ON hall.council_decision_document
FOR EACH ROW EXECUTE FUNCTION hall.enforce_council_decision_document();
CREATE TRIGGER council_decision_document_no_truncate BEFORE TRUNCATE ON hall.council_decision_document
FOR EACH STATEMENT EXECUTE FUNCTION hall.enforce_council_decision_document();

CREATE FUNCTION hall.council_decision_summary(target hall.council_decision)
RETURNS JSONB LANGUAGE sql STABLE SET search_path=pg_catalog,hall AS $$
  SELECT jsonb_build_object('id',target.id,'councilMeetingId',facts#>>'{meeting,id}',
    'proposalId',facts#>>'{proposal,id}','ballotId',target.ballot,'title',facts#>>'{proposal,title}',
    'number',NULL,'version',target.version,'createdAt',target.created_at,'updatedAt',target.updated_at,
    'state',CASE WHEN document.id IS NULL THEN 'draft' ELSE 'frozen' END,'frozenAt',document.frozen_at,'documentId',document.id)
  FROM hall.council_decision_facts observation LEFT JOIN hall.council_decision_document document ON document.council_decision=target.id
  WHERE observation.ballot=target.ballot;
$$;
CREATE FUNCTION hall_api.list_council_decisions()
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,hall AS $$
 SELECT coalesce(jsonb_agg(hall.council_decision_summary(d) ORDER BY d.created_at DESC,d.id),'[]'::jsonb) FROM hall.council_decision d;
$$;
CREATE FUNCTION hall_api.open_council_decision(target_decision UUID)
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,hall AS $$
 SELECT hall.council_decision_summary(d)||jsonb_build_object('content',d.content,'facts',f.facts)
 FROM hall.council_decision d JOIN hall.council_decision_facts f ON f.ballot=d.ballot WHERE d.id=target_decision;
$$;
CREATE FUNCTION hall_api.update_council_decision_draft(target_decision UUID,expected_version INTEGER,editorial_content TEXT)
RETURNS JSONB LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,hall AS $$
DECLARE draft hall.council_decision;
BEGIN
  -- @technical-requirement HALL-TR-DEC-010 EDITING_AND_FREEZING_CHECK_THE_OBSERVED_VERSION:
  SELECT * INTO draft FROM hall.council_decision WHERE id=target_decision FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='HV737',MESSAGE='unknown council decision'; END IF;
  IF draft.version IS DISTINCT FROM expected_version THEN RAISE EXCEPTION USING ERRCODE='HV738',MESSAGE='decision version conflict'; END IF;
  UPDATE hall.council_decision SET content=editorial_content WHERE id=target_decision;
  RETURN hall_api.open_council_decision(target_decision);
END $$;
CREATE FUNCTION hall_api.freeze_council_decision(target_decision UUID,expected_version INTEGER,pdf_content BYTEA)
RETURNS JSONB LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,hall AS $$
DECLARE draft hall.council_decision; binary_id UUID;
BEGIN
  SELECT * INTO draft FROM hall.council_decision WHERE id=target_decision FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='HV737',MESSAGE='unknown council decision'; END IF;
  IF draft.version IS DISTINCT FROM expected_version THEN RAISE EXCEPTION USING ERRCODE='HV738',MESSAGE='decision version conflict'; END IF;
  IF EXISTS(SELECT FROM hall.council_decision_document WHERE council_decision=target_decision) THEN
    RAISE EXCEPTION USING ERRCODE='HV734',MESSAGE='decision already frozen';
  END IF;
  INSERT INTO hall.binary_object(content_sha256,media_type,byte_size,content)
    VALUES(encode(sha256(pdf_content),'hex'),'application/pdf',octet_length(pdf_content),pdf_content)
    ON CONFLICT(content_sha256) DO NOTHING;
  SELECT id INTO binary_id FROM hall.binary_object WHERE content_sha256=encode(sha256(pdf_content),'hex');
  INSERT INTO hall.council_decision_document(council_decision,binary_object) VALUES(target_decision,binary_id);
  RETURN hall_api.open_council_decision(target_decision);
END $$;
CREATE FUNCTION hall_api.council_decision_content(target_decision UUID)
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,hall AS $$
 SELECT jsonb_build_object('documentId',d.id,'contentBase64',encode(b.content,'base64'),'mediaType',b.media_type,'byteSize',b.byte_size)
 FROM hall.council_decision_document d JOIN hall.binary_object b ON b.id=d.binary_object WHERE d.council_decision=target_decision;
$$;

