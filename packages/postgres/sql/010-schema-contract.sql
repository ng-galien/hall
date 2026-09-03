-- @technical-requirement HALL-TR-SCH-020 EXACT_SCHEMA_MANIFEST:
-- A database contains exactly one fingerprint for the complete ordered SQL
-- manifest that created it. A different fingerprint requires a fresh database.
CREATE TABLE hall_meta.schema_contract (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  manifest_sha256 text NOT NULL CHECK (manifest_sha256 ~ '^[0-9a-f]{64}$'),
  installed_at timestamptz NOT NULL DEFAULT statement_timestamp()
);

ALTER TABLE hall_meta.schema_contract OWNER TO hall_owner;
REVOKE ALL ON hall_meta.schema_contract FROM PUBLIC;

CREATE FUNCTION hall_api.schema_fingerprint()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, hall_meta
AS $function$
  SELECT manifest_sha256
  FROM hall_meta.schema_contract
  WHERE singleton
$function$;

ALTER FUNCTION hall_api.schema_fingerprint() OWNER TO hall_owner;
REVOKE ALL ON FUNCTION hall_api.schema_fingerprint() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION hall_api.schema_fingerprint() TO hall_api_anonymous;
