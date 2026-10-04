-- @functional-requirement HALL-FR-VOT-100 NON_PARTICIPATION_IS_DISTINCT_FROM_ABSTENTION:
-- Product evidence of a choice not expressed. S2 excludes it from suffrages;
-- it is not a new vote choice and never reduces a discussion quorum.
CREATE TABLE hall.ballot_non_participation (
  ballot UUID NOT NULL REFERENCES hall.ballots(id),
  mode hall.ballot_mode NOT NULL,
  ballot_participation UUID REFERENCES hall.ballot_participation(id),
  count INTEGER NOT NULL CONSTRAINT "ballot_non_participation_count_check" CHECK (count > 0),
  reason TEXT,
  CONSTRAINT "ballot_non_participation_check" CHECK (mode = 'public'::hall.ballot_mode AND ballot_participation IS NOT NULL AND count = 1 AND (reason = ANY (ARRAY['declined'::text, 'departed'::text])) OR mode = 'secret'::hall.ballot_mode AND ballot_participation IS NULL AND reason IS NULL)
);
CREATE UNIQUE INDEX ballot_non_participation_once ON hall.ballot_non_participation USING btree (ballot_participation) WHERE (ballot_participation IS NOT NULL);
CREATE UNIQUE INDEX secret_non_participation_once ON hall.ballot_non_participation USING btree (ballot) WHERE (mode = 'secret'::hall.ballot_mode);
CREATE FUNCTION hall.enforce_ballot_non_participation()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path=pg_catalog,hall AS $$
DECLARE current_ballot hall.ballots;
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION USING ERRCODE = 'HV510',MESSAGE='non-participation records are immutable'; END IF;
 SELECT * INTO current_ballot FROM hall.ballots WHERE id=NEW.ballot FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'HV902',MESSAGE='unknown ballot'; END IF;
 IF current_ballot.completed_at IS NOT NULL OR NEW.mode IS DISTINCT FROM current_ballot.mode THEN
   RAISE EXCEPTION USING ERRCODE = 'HV511',MESSAGE='non-participation must match an open ballot';
 END IF;
 IF NEW.mode='public' AND (NOT EXISTS(SELECT FROM hall.ballot_participation WHERE id=NEW.ballot_participation AND ballot=NEW.ballot)
   OR EXISTS(SELECT FROM hall.votes WHERE ballot_participation=NEW.ballot_participation)) THEN
   RAISE EXCEPTION USING ERRCODE = 'HV512',MESSAGE='a public participant cannot both express a vote and not participate';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER ballot_non_participation_lifecycle BEFORE INSERT OR UPDATE OR DELETE ON hall.ballot_non_participation
FOR EACH ROW EXECUTE FUNCTION hall.enforce_ballot_non_participation();
CREATE TRIGGER ballot_non_participation_no_truncate BEFORE TRUNCATE ON hall.ballot_non_participation
FOR EACH STATEMENT EXECUTE FUNCTION hall.enforce_ballot_non_participation();
