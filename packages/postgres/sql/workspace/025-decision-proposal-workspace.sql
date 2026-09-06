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
  IF NEW.council_decision_proposal IS NULL OR EXISTS (
    SELECT FROM hall.council_decision_proposal_workspace WHERE council_decision_proposal = NEW.council_decision_proposal
  ) THEN RETURN NEW; END IF;
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
  VALUES(NEW.council_decision_proposal, NEW.council_business, resource_id);
  RETURN NEW;
END;
$$;
CREATE TRIGGER council_agenda_provision_proposal_text AFTER INSERT ON hall.council_agenda_item
FOR EACH ROW EXECUTE FUNCTION hall.provision_decision_proposal_text();
