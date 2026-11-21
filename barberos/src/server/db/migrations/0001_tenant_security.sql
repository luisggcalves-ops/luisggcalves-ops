-- Tenant isolation and least-privilege access for the application role.
--
-- The app connects as a login role that is a member of `barberos_app`. That role
-- does not own any table, so row-level security always applies to it.
-- Every request runs inside a transaction that sets:
--   app.shop_id  the shop the request acts on (verified against the user's membership)
--   app.user_id  the signed-in user
-- With nothing set, tenant tables return zero rows (fail closed).

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'barberos_app') THEN
    CREATE ROLE barberos_app NOLOGIN;
  END IF;
END $$;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO barberos_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO barberos_app;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO barberos_app;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO barberos_app;
--> statement-breakpoint

-- The audit log is append-only for the application.
REVOKE UPDATE, DELETE ON audit_log FROM barberos_app;
--> statement-breakpoint
-- Shops are never hard-deleted by the app (that will be a reviewed GDPR flow).
REVOKE DELETE ON shops FROM barberos_app;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION app_shop_id() RETURNS uuid
  LANGUAGE sql STABLE
  AS $$ SELECT nullif(current_setting('app.shop_id', true), '')::uuid $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app_user_id() RETURNS uuid
  LANGUAGE sql STABLE
  AS $$ SELECT nullif(current_setting('app.user_id', true), '')::uuid $$;
--> statement-breakpoint

-- shops: visible when it is the active shop, or when the user is an active member
-- (needed for the shop switcher). Writes only to the active shop.
ALTER TABLE shops ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY shops_select ON shops FOR SELECT TO barberos_app
  USING (
    id = app_shop_id()
    OR id IN (
      SELECT m.shop_id FROM shop_memberships m
      WHERE m.user_id = app_user_id() AND m.status = 'active'
    )
  );
--> statement-breakpoint
CREATE POLICY shops_insert ON shops FOR INSERT TO barberos_app WITH CHECK (id = app_shop_id());
--> statement-breakpoint
CREATE POLICY shops_update ON shops FOR UPDATE TO barberos_app
  USING (id = app_shop_id()) WITH CHECK (id = app_shop_id());
--> statement-breakpoint

-- shop_memberships: visible to the active shop, plus a user's own memberships.
ALTER TABLE shop_memberships ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY memberships_select ON shop_memberships FOR SELECT TO barberos_app
  USING (shop_id = app_shop_id() OR user_id = app_user_id());
--> statement-breakpoint
CREATE POLICY memberships_write ON shop_memberships FOR ALL TO barberos_app
  USING (shop_id = app_shop_id()) WITH CHECK (shop_id = app_shop_id());
--> statement-breakpoint

-- Plain tenant tables: strictly the active shop.
ALTER TABLE shop_settings ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON shop_settings FOR ALL TO barberos_app
  USING (shop_id = app_shop_id()) WITH CHECK (shop_id = app_shop_id());
--> statement-breakpoint
ALTER TABLE shop_opening_hours ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON shop_opening_hours FOR ALL TO barberos_app
  USING (shop_id = app_shop_id()) WITH CHECK (shop_id = app_shop_id());
--> statement-breakpoint
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON invitations FOR ALL TO barberos_app
  USING (shop_id = app_shop_id()) WITH CHECK (shop_id = app_shop_id());
--> statement-breakpoint
ALTER TABLE staff_members ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON staff_members FOR ALL TO barberos_app
  USING (shop_id = app_shop_id()) WITH CHECK (shop_id = app_shop_id());
--> statement-breakpoint
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON audit_log FOR ALL TO barberos_app
  USING (shop_id = app_shop_id()) WITH CHECK (shop_id = app_shop_id());
--> statement-breakpoint

-- Narrow cross-tenant lookup: an invite link is opened before the user belongs
-- to the shop. Returns only what the invite screen needs, and only for a valid token hash.
CREATE OR REPLACE FUNCTION app_invitation_by_token_hash(p_token_hash text)
  RETURNS TABLE (
    invitation_id uuid,
    shop_id uuid,
    shop_name text,
    email text,
    role membership_role,
    expires_at timestamptz,
    accepted_at timestamptz,
    revoked_at timestamptz
  )
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
    SELECT i.id, i.shop_id, s.name, i.email, i.role, i.expires_at, i.accepted_at, i.revoked_at
    FROM invitations i
    JOIN shops s ON s.id = i.shop_id
    WHERE i.token_hash = p_token_hash
  $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_invitation_by_token_hash(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_invitation_by_token_hash(text) TO barberos_app;
