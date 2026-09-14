-- A proposal's original text remains owned by its business. Voting seals that
-- original, independently of the eventual result and of later vote corrections.
-- The ballot seal remains a durable integrity witness in addition to the
-- meeting-conduct and agenda-item-start title/content lock owned by HALL-FR-WSP-280.
CREATE TABLE hall.proposal_text_seal (
  council_decision_proposal UUID PRIMARY KEY REFERENCES hall.council_decision_proposal(id),
  ballot UUID NOT NULL REFERENCES hall.ballots(id),
  sealed_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE FUNCTION hall.proposal_text_is_sealed(resource_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SET search_path = pg_catalog, hall AS $$
  SELECT EXISTS (
    SELECT FROM hall.council_decision_proposal_workspace workspace
    JOIN hall.proposal_text_seal seal USING (council_decision_proposal)
    WHERE workspace.text_resource = resource_id
  );
$$;

CREATE FUNCTION hall.lock_proposal_text(resource_id UUID)
RETURNS VOID LANGUAGE plpgsql SET search_path = pg_catalog, hall AS $$
BEGIN
  PERFORM 1 FROM hall.council_decision_proposal proposal
  JOIN hall.council_decision_proposal_workspace workspace
    ON workspace.council_decision_proposal = proposal.id
  WHERE workspace.text_resource = resource_id FOR UPDATE OF proposal;
END;
$$;

CREATE FUNCTION hall.protect_proposal_text_seal()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = pg_catalog, hall AS $$
BEGIN
  RAISE EXCEPTION USING ERRCODE = 'HV822', MESSAGE = 'a proposal text seal is permanent';
END;
$$;
CREATE TRIGGER proposal_text_seal_immutable BEFORE UPDATE OR DELETE ON hall.proposal_text_seal
FOR EACH ROW EXECUTE FUNCTION hall.protect_proposal_text_seal();
CREATE TRIGGER proposal_text_seal_no_truncate BEFORE TRUNCATE ON hall.proposal_text_seal
FOR EACH STATEMENT EXECUTE FUNCTION hall.protect_proposal_text_seal();

CREATE FUNCTION hall.seal_voted_proposal_text()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = pg_catalog, hall AS $$
DECLARE target_ballot UUID; proposal_id UUID;
BEGIN
  IF TG_TABLE_NAME = 'votes' THEN target_ballot := NEW.ballot;
  ELSE
    IF NEW.completed_at IS NULL THEN RETURN NEW; END IF;
    target_ballot := NEW.id;
  END IF;
  SELECT item.council_decision_proposal INTO proposal_id
  FROM hall.ballots ballot JOIN hall.council_agenda_item item ON item.id = ballot.council_agenda_item
  WHERE ballot.id = target_ballot;
  IF proposal_id IS NOT NULL THEN
    PERFORM 1 FROM hall.council_decision_proposal WHERE id = proposal_id FOR UPDATE;
    INSERT INTO hall.proposal_text_seal(council_decision_proposal, ballot)
      VALUES (proposal_id, target_ballot) ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER votes_seal_proposal_text AFTER INSERT OR UPDATE ON hall.votes
FOR EACH ROW EXECUTE FUNCTION hall.seal_voted_proposal_text();
CREATE TRIGGER ballot_seals_proposal_text AFTER INSERT OR UPDATE ON hall.ballots
FOR EACH ROW EXECUTE FUNCTION hall.seal_voted_proposal_text();

-- @functional-requirement HALL-FR-WSP-220 PROPOSAL_TEXT_BELONGS_PERMANENTLY_TO_ITS_BUSINESS:
CREATE FUNCTION hall.protect_proposal_workspace()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = pg_catalog, hall AS $$
BEGIN
  IF TG_OP IN ('DELETE', 'TRUNCATE') THEN
    RAISE EXCEPTION USING ERRCODE = 'HV820', MESSAGE = 'a proposal text ownership is permanent';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION USING ERRCODE = 'HV820', MESSAGE = 'a proposal text ownership is permanent';
  END IF;
  IF NOT EXISTS (
    SELECT FROM hall.council_decision_proposal proposal
    JOIN hall.council_business_workspace business ON business.council_business = proposal.council_business
    JOIN hall.resource folder ON folder.id = business.folder_resource
    JOIN hall.resource resource ON resource.id = NEW.text_resource AND resource.text_resource_id = NEW.text_resource
    WHERE proposal.id = NEW.council_decision_proposal
      AND proposal.council_business = NEW.council_business AND resource.path = folder.full_path
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'HV820', MESSAGE = 'a proposal text must belong to its business folder';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER proposal_workspace_protected BEFORE INSERT OR UPDATE OR DELETE ON hall.council_decision_proposal_workspace
FOR EACH ROW EXECUTE FUNCTION hall.protect_proposal_workspace();
CREATE TRIGGER proposal_workspace_no_truncate BEFORE TRUNCATE ON hall.council_decision_proposal_workspace
FOR EACH STATEMENT EXECUTE FUNCTION hall.protect_proposal_workspace();

CREATE FUNCTION hall.attach_proposal_text()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = pg_catalog, hall AS $$
BEGIN
  PERFORM 1 FROM hall.council_business WHERE id = NEW.council_business FOR UPDATE;
  INSERT INTO hall.council_business_resource(council_business, resource, position)
  SELECT NEW.council_business, NEW.text_resource, coalesce(max(position), 0) + 1
  FROM hall.council_business_resource WHERE council_business = NEW.council_business;
  RETURN NEW;
END;
$$;
CREATE TRIGGER proposal_text_attached AFTER INSERT ON hall.council_decision_proposal_workspace
FOR EACH ROW EXECUTE FUNCTION hall.attach_proposal_text();

CREATE FUNCTION hall.protect_proposal_text_attachment()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = pg_catalog, hall AS $$
BEGIN
  IF TG_OP = 'TRUNCATE' THEN
    IF EXISTS (SELECT FROM hall.council_decision_proposal_workspace) THEN
      RAISE EXCEPTION USING ERRCODE = 'HV820', MESSAGE = 'proposal texts cannot be detached';
    END IF;
    RETURN NULL;
  END IF;
  IF EXISTS (SELECT FROM hall.council_decision_proposal_workspace
    WHERE text_resource = OLD.resource AND council_business = OLD.council_business)
    AND (TG_OP = 'DELETE' OR NEW.resource IS DISTINCT FROM OLD.resource OR NEW.council_business IS DISTINCT FROM OLD.council_business) THEN
    RAISE EXCEPTION USING ERRCODE = 'HV820', MESSAGE = 'a proposal text cannot be detached';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER proposal_text_attachment_protected BEFORE UPDATE OR DELETE ON hall.council_business_resource
FOR EACH ROW EXECUTE FUNCTION hall.protect_proposal_text_attachment();
CREATE TRIGGER proposal_text_attachment_no_truncate BEFORE TRUNCATE ON hall.council_business_resource
FOR EACH STATEMENT EXECUTE FUNCTION hall.protect_proposal_text_attachment();

CREATE FUNCTION hall.protect_proposal_text_resource()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = pg_catalog, hall AS $$
DECLARE resource_id UUID; expected_path TEXT;
BEGIN
  IF TG_OP = 'TRUNCATE' THEN
    IF EXISTS (SELECT FROM hall.council_decision_proposal_workspace) THEN
      RAISE EXCEPTION USING ERRCODE = 'HV820', MESSAGE = 'proposal texts cannot be truncated';
    END IF;
    RETURN NULL;
  END IF;
  resource_id := OLD.id;
  PERFORM hall.lock_proposal_text(resource_id);
  SELECT folder.full_path INTO expected_path
  FROM hall.council_decision_proposal_workspace workspace
  JOIN hall.council_business_workspace business USING (council_business)
  JOIN hall.resource folder ON folder.id = business.folder_resource
  WHERE workspace.text_resource = resource_id;
  IF expected_path IS NULL THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' OR NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION USING ERRCODE = 'HV820', MESSAGE = 'a proposal text cannot be deleted or replaced';
  END IF;
  IF TG_TABLE_NAME = 'resource' THEN
    IF NEW.text_resource_id IS DISTINCT FROM OLD.text_resource_id OR NEW.path <> expected_path THEN
      RAISE EXCEPTION USING ERRCODE = 'HV820', MESSAGE = 'a proposal text must remain in its business folder';
    END IF;
  END IF;
  IF hall.proposal_text_is_sealed(resource_id) AND NEW IS DISTINCT FROM OLD THEN
    -- The owner folder has already moved. Only its dependent path may follow;
    -- content, name, identity, tags and seal remain protected. Generated columns
    -- are recomputed by PostgreSQL after the BEFORE trigger.
    IF TG_TABLE_NAME = 'resource' THEN
      IF NEW.path IS DISTINCT FROM OLD.path
        AND (to_jsonb(NEW) - ARRAY['path', 'full_path', 'is_folder', 'container_path', 'container_is_folder']) = (to_jsonb(OLD) - ARRAY['path', 'full_path', 'is_folder', 'container_path', 'container_is_folder']) THEN
        RETURN NEW;
      END IF;
    END IF;
    RAISE EXCEPTION USING ERRCODE = 'HV821', MESSAGE = 'a voted proposal text is immutable';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER proposal_resource_protected BEFORE UPDATE OR DELETE ON hall.resource
FOR EACH ROW EXECUTE FUNCTION hall.protect_proposal_text_resource();
CREATE TRIGGER proposal_content_protected BEFORE UPDATE OR DELETE ON hall.text_resource
FOR EACH ROW EXECUTE FUNCTION hall.protect_proposal_text_resource();
CREATE TRIGGER proposal_resource_no_truncate BEFORE TRUNCATE ON hall.resource
FOR EACH STATEMENT EXECUTE FUNCTION hall.protect_proposal_text_resource();
CREATE TRIGGER proposal_content_no_truncate BEFORE TRUNCATE ON hall.text_resource
FOR EACH STATEMENT EXECUTE FUNCTION hall.protect_proposal_text_resource();

CREATE FUNCTION hall.protect_proposal_editor_asset()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = pg_catalog, hall AS $$
DECLARE owner_id UUID;
BEGIN
  IF TG_OP = 'TRUNCATE' THEN
    IF EXISTS (SELECT FROM hall.proposal_text_seal) THEN
      RAISE EXCEPTION USING ERRCODE = 'HV821', MESSAGE = 'voted proposal assets are immutable';
    END IF;
    RETURN NULL;
  END IF;
  FOR owner_id IN SELECT DISTINCT id FROM unnest(ARRAY[
    CASE WHEN TG_OP <> 'INSERT' THEN coalesce(to_jsonb(OLD)->>'owner_text_resource_id', to_jsonb(OLD)->>'resource_id')::UUID END,
    CASE WHEN TG_OP <> 'DELETE' THEN coalesce(to_jsonb(NEW)->>'owner_text_resource_id', to_jsonb(NEW)->>'resource_id')::UUID END]) id WHERE id IS NOT NULL ORDER BY id LOOP
    PERFORM hall.lock_proposal_text(owner_id);
    IF hall.proposal_text_is_sealed(owner_id) THEN
      RAISE EXCEPTION USING ERRCODE = 'HV821', MESSAGE = 'voted proposal assets are immutable';
    END IF;
  END LOOP;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER proposal_editor_asset_protected BEFORE INSERT OR UPDATE OR DELETE ON hall.editor_asset
FOR EACH ROW EXECUTE FUNCTION hall.protect_proposal_editor_asset();
CREATE TRIGGER proposal_editor_asset_no_truncate BEFORE TRUNCATE ON hall.editor_asset
FOR EACH STATEMENT EXECUTE FUNCTION hall.protect_proposal_editor_asset();

CREATE TRIGGER proposal_tags_protected BEFORE INSERT OR UPDATE OR DELETE ON hall.resource_tag
FOR EACH ROW EXECUTE FUNCTION hall.protect_proposal_editor_asset();
CREATE TRIGGER proposal_tags_no_truncate BEFORE TRUNCATE ON hall.resource_tag
FOR EACH STATEMENT EXECUTE FUNCTION hall.protect_proposal_editor_asset();
