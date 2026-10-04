-- @functional-requirement HALL-FR-DEC-090 DECISION_NUMBERS_ARE_ALLOCATED_MONTHLY_AT_FREEZE:
CREATE TABLE hall.council_decision_number_counter (
  period DATE PRIMARY KEY CONSTRAINT "council_decision_number_counter_period_check" CHECK (EXTRACT(day FROM period) = 1::numeric),
  last_index INTEGER NOT NULL CONSTRAINT "council_decision_number_counter_last_index_check" CHECK (last_index >= 0)
);
-- Historical PDFs without a number are left intact. Only new freezes allocate one.
ALTER TABLE hall.council_decision_document ADD COLUMN number TEXT UNIQUE, ADD COLUMN document_date DATE;

CREATE FUNCTION hall.decision_number_period(source JSONB)
RETURNS DATE LANGUAGE sql STABLE SET search_path=pg_catalog,hall AS $$
 SELECT date_trunc('month',(source#>>'{meeting,startedAt}')::timestamptz AT TIME ZONE
   coalesce(hall.decision_documentary_facts(source)#>>'{hall,timeZone}','UTC'))::date;
$$;
CREATE FUNCTION hall.format_decision_number(number_period DATE,number_index INTEGER)
RETURNS TEXT LANGUAGE sql IMMUTABLE STRICT SET search_path=pg_catalog AS $$
 SELECT to_char(number_period,'YYYY-MM')||'-'||lpad(number_index::text,greatest(2,length(number_index::text)),'0');
$$;
CREATE FUNCTION hall.next_decision_number(source JSONB)
RETURNS TEXT LANGUAGE sql STABLE SET search_path=pg_catalog,hall AS $$
 SELECT hall.format_decision_number(hall.decision_number_period(source),coalesce(
   (SELECT last_index FROM hall.council_decision_number_counter WHERE period=hall.decision_number_period(source)),0)+1);
$$;
CREATE FUNCTION hall.decision_document_date(source JSONB,observed_at TIMESTAMPTZ)
RETURNS DATE LANGUAGE sql STABLE SET search_path=pg_catalog,hall AS $$
 SELECT (observed_at AT TIME ZONE coalesce(hall.decision_documentary_facts(source)#>>'{hall,timeZone}','UTC'))::date;
$$;
CREATE OR REPLACE FUNCTION hall.council_decision_summary(target hall.council_decision)
RETURNS JSONB LANGUAGE sql STABLE SET search_path=pg_catalog,hall AS $$
 SELECT jsonb_build_object('id',target.id,'councilMeetingId',facts#>>'{meeting,id}',
   'proposalId',facts#>>'{proposal,id}','ballotId',target.ballot,'title',facts#>>'{proposal,title}',
   'documentDate',CASE WHEN document.id IS NULL THEN hall.decision_document_date(facts,clock_timestamp()) ELSE document.document_date END,
   'number',CASE WHEN document.id IS NULL THEN hall.next_decision_number(facts) ELSE document.number END,
   'version',target.version,'createdAt',target.created_at,'updatedAt',target.updated_at,
   'state',CASE WHEN document.id IS NULL THEN 'draft' ELSE 'frozen' END,'frozenAt',document.frozen_at,'documentId',document.id)
 FROM hall.council_decision_facts observation LEFT JOIN hall.council_decision_document document ON document.council_decision=target.id
 WHERE observation.ballot=target.ballot;
$$;

-- The expected number belongs to the PDF rendered by the server. A stale candidate
-- rolls back, then the service renders again with the newly observed candidate.
DROP FUNCTION hall_api.freeze_council_decision(UUID,INTEGER,BYTEA);
CREATE FUNCTION hall_api.freeze_council_decision(target_decision UUID,expected_version INTEGER,expected_number TEXT,expected_document_date DATE,pdf_content BYTEA)
RETURNS JSONB LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,hall AS $$
DECLARE draft hall.council_decision; source JSONB; binary_id UUID; number_period DATE; allocated_index INTEGER; allocated_number TEXT; frozen_time TIMESTAMPTZ; frozen_date DATE;
BEGIN
 SELECT * INTO draft FROM hall.council_decision WHERE id=target_decision FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='HV737',MESSAGE='unknown council decision'; END IF;
 IF draft.version IS DISTINCT FROM expected_version THEN RAISE EXCEPTION USING ERRCODE='HV738',MESSAGE='decision version conflict'; END IF;
 -- A retried successful freeze returns its retained result, never new bytes.
 IF EXISTS(SELECT FROM hall.council_decision_document WHERE council_decision=target_decision) THEN
   RETURN hall_api.open_council_decision(target_decision);
 END IF;
 SELECT facts INTO STRICT source FROM hall.council_decision_facts WHERE ballot=draft.ballot;
 number_period:=hall.decision_number_period(source);
 INSERT INTO hall.council_decision_number_counter(period,last_index) VALUES(number_period,1)
 ON CONFLICT(period) DO UPDATE SET last_index=hall.council_decision_number_counter.last_index+1
 RETURNING last_index INTO allocated_index;
 allocated_number:=hall.format_decision_number(number_period,allocated_index);
 frozen_time:=clock_timestamp(); frozen_date:=hall.decision_document_date(source,frozen_time);
 IF expected_number IS DISTINCT FROM allocated_number OR expected_document_date IS DISTINCT FROM frozen_date THEN
   RAISE EXCEPTION USING ERRCODE='HV743',MESSAGE='decision number or document date candidate changed before freeze';
 END IF;
 INSERT INTO hall.binary_object(content_sha256,media_type,byte_size,content)
 VALUES(encode(sha256(pdf_content),'hex'),'application/pdf',octet_length(pdf_content),pdf_content)
 ON CONFLICT(content_sha256) DO NOTHING;
 SELECT id INTO binary_id FROM hall.binary_object WHERE content_sha256=encode(sha256(pdf_content),'hex');
 INSERT INTO hall.council_decision_document(council_decision,binary_object,number,document_date,frozen_at) VALUES(target_decision,binary_id,allocated_number,frozen_date,frozen_time);
 RETURN hall_api.open_council_decision(target_decision);
END $$;

CREATE OR REPLACE FUNCTION hall.enforce_council_decision_document()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path=pg_catalog,hall AS $$
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION USING ERRCODE='HV735',MESSAGE='frozen decision document is immutable'; END IF;
 PERFORM 1 FROM hall.council_decision WHERE id=NEW.council_decision FOR UPDATE;
 IF NOT EXISTS(SELECT FROM hall.binary_object WHERE id=NEW.binary_object AND media_type='application/pdf'
   AND byte_size>5 AND substring(content FROM 1 FOR 5)=convert_to('%PDF-','UTF8')) THEN
   RAISE EXCEPTION USING ERRCODE='HV736',MESSAGE='decision document requires PDF bytes';
 END IF;
 -- The freeze command records one instant after obtaining the allocation lock.
 RETURN NEW;
END $$;

-- Newly issued notices carry an explicit printed date. Historical files without
-- that observation remain null; generated_at is not substituted for it.
CREATE OR REPLACE FUNCTION hall.meeting_notice_projection(notice hall.meeting_notice)
RETURNS JSONB LANGUAGE sql STABLE SET search_path=pg_catalog,hall AS $$
 SELECT jsonb_build_object('id',notice.id,'councilMeetingId',notice.council_meeting,
   'version',notice.version,'generatedAt',notice.generated_at,'documentId',notice.binary_object,
   'byteSize',bytes.byte_size,'facts',notice.facts||jsonb_build_object('issuedOn',notice.facts->'issuedOn'),
   'isCurrent',coalesce(notice.facts->'meeting'=hall.meeting_notice_meeting_facts(notice.council_meeting),false))
 FROM hall.binary_object bytes WHERE bytes.id=notice.binary_object;
$$;
