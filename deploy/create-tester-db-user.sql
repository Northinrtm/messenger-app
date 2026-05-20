-- Creates a read-only 'tester' role for QA access.
-- Run via: docker exec -i messenger-postgres psql -U messenger -d messenger < create-tester-db-user.sql
-- Set TESTER_PASSWORD before running: sed -i "s/__TESTER_PASSWORD__/$TESTER_PASSWORD/" create-tester-db-user.sql
-- or pass it via psql variable: psql ... -v tester_password='...' (replace __TESTER_PASSWORD__ accordingly)

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'tester') THEN
    CREATE ROLE tester WITH LOGIN PASSWORD '__TESTER_PASSWORD__' NOSUPERUSER NOCREATEDB NOCREATEROLE;
  ELSE
    ALTER ROLE tester WITH PASSWORD '__TESTER_PASSWORD__';
  END IF;
END;
$$;

GRANT CONNECT ON DATABASE messenger TO tester;
GRANT USAGE ON SCHEMA public TO tester;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO tester;
GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO tester;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO tester;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON SEQUENCES TO tester;
