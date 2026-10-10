-- @requirement-reference HALL-FR-DOC-080 BINARY_CONTENT_IS_SEPARATE:
-- Content-addressed bytes never change in place. Replacing content creates a
-- new binary object and updates the owning document through a future API.
CREATE FUNCTION hall.reject_binary_object_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  RAISE EXCEPTION USING
    ERRCODE = 'HV605',
    MESSAGE = 'A binary object is immutable';
END;
$$;

CREATE TRIGGER binary_object_reject_change
BEFORE UPDATE OR DELETE
ON hall.binary_object
FOR EACH ROW
EXECUTE FUNCTION hall.reject_binary_object_change();

-- @functional-requirement HALL-FR-DOC-090 RESOURCE_NATURE_IS_IMMUTABLE:
-- Location changes update path or name. They never replace the concrete
-- resource component and therefore never change the resource nature.
CREATE FUNCTION hall.reject_resource_nature_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  RAISE EXCEPTION USING
    ERRCODE = 'HV606',
    MESSAGE = 'A resource nature is immutable';
END;
$$;

CREATE TRIGGER resource_reject_nature_change
BEFORE UPDATE OF
  folder_resource_id,
  text_resource_id,
  remote_resource_id,
  spreadsheet_resource_id,
  geographic_resource_id,
  event_resource_id,
  document_resource_id,
  legal_reference_resource_id,
  geographic_layer_resource_id
ON hall.resource
FOR EACH ROW
WHEN (
  ROW(
    OLD.folder_resource_id,
    OLD.text_resource_id,
    OLD.remote_resource_id,
    OLD.spreadsheet_resource_id,
    OLD.geographic_resource_id,
    OLD.event_resource_id,
    OLD.document_resource_id,
    OLD.legal_reference_resource_id,
    OLD.geographic_layer_resource_id
  ) IS DISTINCT FROM ROW(
    NEW.folder_resource_id,
    NEW.text_resource_id,
    NEW.remote_resource_id,
    NEW.spreadsheet_resource_id,
    NEW.geographic_resource_id,
    NEW.event_resource_id,
    NEW.document_resource_id,
    NEW.legal_reference_resource_id,
    NEW.geographic_layer_resource_id
  )
)
EXECUTE FUNCTION hall.reject_resource_nature_change();

-- @requirement-reference HALL-FR-DOC-170 RESOURCE_SLUG_IS_STABLE:
CREATE FUNCTION hall.reject_resource_slug_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  RAISE EXCEPTION USING
    ERRCODE = 'HV611',
    MESSAGE = 'A resource slug is immutable';
END;
$$;

CREATE TRIGGER resource_reject_slug_change
BEFORE UPDATE OF slug
ON hall.resource
FOR EACH ROW
WHEN (OLD.slug IS DISTINCT FROM NEW.slug)
EXECUTE FUNCTION hall.reject_resource_slug_change();

-- @requirement-reference HALL-FR-DOC-200 RESOURCE_PRESENTATION_IS_AUTHORITATIVE:
CREATE FUNCTION hall.touch_resource_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  NEW.updated_at := transaction_timestamp();
  RETURN NEW;
END;
$$;

CREATE TRIGGER resource_touch_updated_at
BEFORE UPDATE
ON hall.resource
FOR EACH ROW
EXECUTE FUNCTION hall.touch_resource_updated_at();
