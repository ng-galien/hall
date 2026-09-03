-- @technical-requirement HALL-TR-SCH-010 PRIVATE_AND_API_SCHEMAS:
-- Durable state is private to hall. Explicit callable boundaries live in
-- hall_api. The schema fingerprint is private to hall_meta.
CREATE SCHEMA hall_meta AUTHORIZATION hall_owner;
CREATE SCHEMA hall AUTHORIZATION hall_owner;
CREATE SCHEMA hall_api AUTHORIZATION hall_owner;

REVOKE ALL ON SCHEMA hall_meta, hall, hall_api FROM PUBLIC;

SET LOCAL ROLE hall_owner;
SET LOCAL search_path = hall, pg_catalog;
