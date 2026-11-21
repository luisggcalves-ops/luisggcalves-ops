-- Local/CI database bootstrap. Run once as a superuser.
-- In production (e.g. Neon) create the equivalent roles in the provider console:
--   * an owner role that runs migrations
--   * a login role for the app that is a member of `barberos_app` (created by the first migration)

CREATE ROLE barberos_owner LOGIN PASSWORD 'barberos_owner' CREATEROLE;
CREATE ROLE barberos_app NOLOGIN;
CREATE ROLE barberos_web LOGIN PASSWORD 'barberos_web' IN ROLE barberos_app;

CREATE DATABASE barberos OWNER barberos_owner;
CREATE DATABASE barberos_test OWNER barberos_owner;

\connect barberos
ALTER SCHEMA public OWNER TO barberos_owner;
\connect barberos_test
ALTER SCHEMA public OWNER TO barberos_owner;
