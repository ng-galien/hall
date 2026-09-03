-- @technical-requirement HALL-TR-CTX-010 CLOSED_DATABASE_ROLES:
-- Hall owns a closed set of PostgreSQL roles. Runtime identities receive only
-- function execution privileges and never direct table privileges.
DO $hall_roles$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'hall_owner') THEN
    CREATE ROLE hall_owner NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'hall_authenticator') THEN
    CREATE ROLE hall_authenticator NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'hall_api_anonymous') THEN
    CREATE ROLE hall_api_anonymous NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'hall_api_authenticated') THEN
    CREATE ROLE hall_api_authenticated NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'hall_api_worker') THEN
    CREATE ROLE hall_api_worker NOLOGIN NOINHERIT;
  END IF;
END
$hall_roles$;

ALTER ROLE hall_owner NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
ALTER ROLE hall_authenticator LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
ALTER ROLE hall_api_anonymous NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
ALTER ROLE hall_api_authenticated NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
ALTER ROLE hall_api_worker NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;

GRANT hall_owner TO CURRENT_USER;
GRANT hall_api_anonymous, hall_api_authenticated, hall_api_worker TO CURRENT_USER;
GRANT hall_api_anonymous, hall_api_authenticated, hall_api_worker TO hall_authenticator;
