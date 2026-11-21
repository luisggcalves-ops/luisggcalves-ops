-- Phase 2: double-booking guard, tenant isolation and data rules for scheduling tables.

-- 1. No overlapping active appointments for the same barber, enforced by the database.
--    Two simultaneous bookings for the same slot can't both commit. The loser gets SQLSTATE 23P01.
CREATE EXTENSION IF NOT EXISTS btree_gist;
--> statement-breakpoint
ALTER TABLE appointments ADD CONSTRAINT appointments_no_overlap
  EXCLUDE USING gist (
    staff_member_id WITH =,
    tstzrange(starts_at, blocked_until, '[)') WITH &&
  ) WHERE (status IN ('pending', 'confirmed'));
--> statement-breakpoint

-- 2. Row-level security: strictly the active shop.
ALTER TABLE services ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON services FOR ALL TO barberos_app
  USING (shop_id = app_shop_id()) WITH CHECK (shop_id = app_shop_id());
--> statement-breakpoint
ALTER TABLE staff_services ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON staff_services FOR ALL TO barberos_app
  USING (shop_id = app_shop_id()) WITH CHECK (shop_id = app_shop_id());
--> statement-breakpoint
ALTER TABLE working_hours ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON working_hours FOR ALL TO barberos_app
  USING (shop_id = app_shop_id()) WITH CHECK (shop_id = app_shop_id());
--> statement-breakpoint
ALTER TABLE time_off ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON time_off FOR ALL TO barberos_app
  USING (shop_id = app_shop_id()) WITH CHECK (shop_id = app_shop_id());
--> statement-breakpoint
ALTER TABLE shop_closures ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON shop_closures FOR ALL TO barberos_app
  USING (shop_id = app_shop_id()) WITH CHECK (shop_id = app_shop_id());
--> statement-breakpoint
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON customers FOR ALL TO barberos_app
  USING (shop_id = app_shop_id()) WITH CHECK (shop_id = app_shop_id());
--> statement-breakpoint
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON appointments FOR ALL TO barberos_app
  USING (shop_id = app_shop_id()) WITH CHECK (shop_id = app_shop_id());
--> statement-breakpoint
ALTER TABLE appointment_events ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON appointment_events FOR ALL TO barberos_app
  USING (shop_id = app_shop_id()) WITH CHECK (shop_id = app_shop_id());
--> statement-breakpoint

-- 3. History is never rewritten by the app.
--    Appointments are cancelled, not deleted. Customers are anonymized (GDPR flow in Phase 3), not deleted.
--    Services are deactivated, not deleted. The appointment history is append-only.
REVOKE DELETE ON appointments, customers, services FROM barberos_app;
--> statement-breakpoint
REVOKE UPDATE, DELETE ON appointment_events FROM barberos_app;
--> statement-breakpoint

-- 4. Existing barber profiles start with the shop's opening hours as their working hours.
INSERT INTO working_hours (id, shop_id, staff_member_id, weekday, starts_at, ends_at)
SELECT gen_random_uuid(), sm.shop_id, sm.id, oh.weekday, oh.opens_at, oh.closes_at
FROM staff_members sm
JOIN shop_opening_hours oh ON oh.shop_id = sm.shop_id
WHERE NOT EXISTS (SELECT 1 FROM working_hours wh WHERE wh.staff_member_id = sm.id);
