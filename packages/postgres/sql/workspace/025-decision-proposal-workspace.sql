-- Each proposal owns an editable text independently of the business report.
CREATE TABLE hall.council_decision_proposal_workspace (
  council_decision_proposal UUID PRIMARY KEY REFERENCES hall.council_decision_proposal(id),
  council_business UUID NOT NULL REFERENCES hall.council_business_workspace(council_business),
  text_resource UUID NOT NULL UNIQUE REFERENCES hall.text_resource(id)
);

CREATE FUNCTION hall.provision_decision_proposal_text()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, hall AS $$
DECLARE
  resource_id UUID := gen_random_uuid();
  resource_name TEXT;
  folder_path TEXT;
  business_name TEXT;
  ordinal INTEGER := 1;
BEGIN
  IF EXISTS (SELECT FROM hall.council_decision_proposal_workspace WHERE council_decision_proposal = NEW.id) THEN RETURN NEW; END IF;
  PERFORM hall.lock_resource_namespace();
  SELECT folder.full_path, folder.name INTO STRICT folder_path, business_name
  FROM hall.council_business_workspace workspace JOIN hall.resource folder ON folder.id = workspace.folder_resource
  WHERE workspace.council_business = NEW.council_business;
  -- Reuse the user-authored business name; do not expose a technical UUID or translated constant.
  resource_name := business_name;
  WHILE EXISTS (SELECT FROM hall.resource WHERE path = folder_path AND lower(name) = lower(resource_name)) LOOP
    ordinal := ordinal + 1;
    resource_name := left(business_name, 185) || ' (' || ordinal::TEXT || ')';
  END LOOP;
  INSERT INTO hall.text_resource(id, content) VALUES(resource_id, '');
  INSERT INTO hall.resource(id, path, name, slug, text_resource_id)
  VALUES(resource_id, folder_path, resource_name, hall.claim_resource_slug(resource_name), resource_id);
  INSERT INTO hall.council_decision_proposal_workspace(council_decision_proposal, council_business, text_resource)
  VALUES(NEW.id, NEW.council_business, resource_id);
  RETURN NEW;
END;
$$;
CREATE TRIGGER council_proposal_provision_text AFTER INSERT ON hall.council_decision_proposal
FOR EACH ROW EXECUTE FUNCTION hall.provision_decision_proposal_text();

CREATE TABLE hall.open_question_workspace (
  open_question UUID PRIMARY KEY REFERENCES hall.open_question(id),
  council_business UUID NOT NULL REFERENCES hall.council_business_workspace(council_business),
  text_resource UUID NOT NULL UNIQUE REFERENCES hall.text_resource(id)
);
CREATE FUNCTION hall.provision_open_question_text()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, hall AS $$
DECLARE
  resource_id UUID := gen_random_uuid();
  resource_name TEXT;
  folder_path TEXT;
  business_name TEXT;
  ordinal INTEGER := 1;
BEGIN
  IF EXISTS (SELECT FROM hall.open_question_workspace WHERE open_question = NEW.id) THEN RETURN NEW; END IF;
  PERFORM hall.lock_resource_namespace();
  SELECT folder.full_path, folder.name INTO STRICT folder_path, business_name
  FROM hall.council_business_workspace workspace JOIN hall.resource folder ON folder.id = workspace.folder_resource
  WHERE workspace.council_business = NEW.council_business;
  -- Reuse the user-authored business name; do not expose a technical UUID or translated constant.
  resource_name := business_name;
  WHILE EXISTS (SELECT FROM hall.resource WHERE path = folder_path AND lower(name) = lower(resource_name)) LOOP
    ordinal := ordinal + 1;
    resource_name := left(business_name, 185) || ' (' || ordinal::TEXT || ')';
  END LOOP;
  INSERT INTO hall.text_resource(id, content) VALUES(resource_id, '');
  INSERT INTO hall.resource(id, path, name, slug, text_resource_id)
  VALUES(resource_id, folder_path, resource_name, hall.claim_resource_slug(resource_name), resource_id);
  INSERT INTO hall.open_question_workspace(open_question, council_business, text_resource)
  VALUES(NEW.id, NEW.council_business, resource_id);
  RETURN NEW;
END;
$$;
CREATE TRIGGER open_question_provision_text AFTER INSERT OR UPDATE ON hall.open_question
FOR EACH ROW EXECUTE FUNCTION hall.provision_open_question_text();


CREATE FUNCTION hall.council_agenda_item_title(target hall.council_agenda_item)
RETURNS TEXT LANGUAGE sql STABLE SET search_path=pg_catalog,hall AS $$
  SELECT CASE WHEN target.minutes_approval IS NOT NULL THEN '' ELSE coalesce(
    (SELECT question->>'title' FROM hall.active_council_agenda_freeze frozen, jsonb_array_elements(frozen.agenda) question
      WHERE frozen.council_meeting=target.council_meeting AND question->>'id'=target.id::TEXT),
    (SELECT resource.name FROM hall.council_decision_proposal_workspace workspace JOIN hall.resource resource ON resource.id=workspace.text_resource
      WHERE workspace.council_decision_proposal=target.council_decision_proposal),
    (SELECT resource.name FROM hall.open_question_workspace workspace JOIN hall.resource resource ON resource.id=workspace.text_resource
      WHERE workspace.open_question=target.open_question),
    (SELECT resource.name FROM hall.council_business_workspace workspace JOIN hall.resource resource ON resource.id=workspace.folder_resource
      WHERE workspace.council_business=target.council_business),'') END;
$$;
