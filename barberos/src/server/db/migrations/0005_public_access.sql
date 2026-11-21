-- Phase 3: CRM/outbox isolation, and the narrow lookups that public (signed-out)
-- pages need before they know which shop they're acting for.

ALTER TABLE customer_notes ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON customer_notes FOR ALL TO barberos_app
  USING (shop_id = app_shop_id()) WITH CHECK (shop_id = app_shop_id());
--> statement-breakpoint
ALTER TABLE notification_outbox ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON notification_outbox FOR ALL TO barberos_app
  USING (shop_id = app_shop_id()) WITH CHECK (shop_id = app_shop_id());
--> statement-breakpoint
-- Messages are never deleted by the app, only marked sent, failed or cancelled.
REVOKE DELETE ON notification_outbox FROM barberos_app;
--> statement-breakpoint

-- Public booking page: slug → shop id. Returns nothing for unknown slugs.
CREATE OR REPLACE FUNCTION app_shop_id_by_slug(p_slug text)
  RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$ SELECT id FROM shops WHERE slug = lower(p_slug) $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_shop_id_by_slug(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_shop_id_by_slug(text) TO barberos_app;
--> statement-breakpoint

-- Customer "manage my booking" link: token hash → (shop, appointment).
CREATE OR REPLACE FUNCTION app_appointment_by_manage_token(p_token_hash text)
  RETURNS TABLE (shop_id uuid, appointment_id uuid)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$ SELECT shop_id, id FROM appointments WHERE manage_token_hash = p_token_hash $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_appointment_by_manage_token(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_appointment_by_manage_token(text) TO barberos_app;
--> statement-breakpoint

-- Outbox worker: which shops have messages due. Ids only, and the worker then works inside each shop's context.
CREATE OR REPLACE FUNCTION app_outbox_due_shops(p_limit integer)
  RETURNS SETOF uuid
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
    SELECT DISTINCT shop_id FROM notification_outbox
    WHERE status = 'pending' AND scheduled_for <= now()
    LIMIT p_limit
  $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_outbox_due_shops(integer) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_outbox_due_shops(integer) TO barberos_app;
